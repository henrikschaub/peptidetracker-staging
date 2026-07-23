/* ── T-HISTORICAL ──────────────────────────────────────────────────────────
 * Historical free-T view. The curve is NOT re-derived here — it is loaded
 * straight from the backend (`/plasma-history`, marker `free_t`) and plotted.
 * The per-day free-T value is computed once, elsewhere, by the exact T-Calc PK
 * model and persisted (`_captureFreeTHistory`), so this view carries zero
 * calibration logic. A date slider scrubs the as-of day; week / month / year /
 * all zoom levels frame the window; injection ticks annotate the shots.
 *
 * This file also owns the "add a past injection" modal (reachable from the
 * Today view and T-Calc) that onboards a user already mid-cycle: it records a
 * real past injection to `/injections` — the app-wide source of truth — and,
 * for testosterone, mirrors it into the T-Calc manual log so it also surfaces
 * on the T-Calc plasma curve.
 * ------------------------------------------------------------------------- */

var _thZoom      = 'all';      // 'week' | 'month' | 'year' | 'all'
var _thFocusDay  = null;       // as-of day index (days from first stored day); null → last day
var _thData      = undefined;  // cached /plasma-history rows (undefined until first fetch)
var _thInjections;             // cached /injections rows (for tick marks + capture)
var _TH_MARKER   = 'free_t';
var _TH_TAIL_DAYS = 0;         // curve ends AT the last injection — never plot past it
var _TH_MAX_SANE = 6000;       // pmol/L — above this the calibration is bad; never store it

/* ── data source (backend) ──────────────────────────────────────────────── */

// Logged testosterone injections mapped to the PK model's shape. Only tier
// 'trt' feeds free T. Reads compound_id → compId; dose → doseMg.
function _thLoggedTrt(rows) {
  return (rows || [])
    .filter(function(e){ return e && e.logged && e.tier === 'trt' && e.date && parseDec(e.dose) > 0; })
    .map(function(e){ return { compId: e.compound_id, doseMg: parseDec(e.dose), date: e.date }; });
}

// Merged administered testosterone log used for the free-T computation: the
// T-Calc manual log (the user's recorded history / plan) UNION the logged trt
// injections from the /injections store, de-duplicated by compound+date+dose,
// restricted to the past (<= today), ascending. This is the single input that
// makes the captured history agree with the T-Calc curve.
function _thMergedPastLog() {
  var out = [], seen = {}, today = _thTodayStr();
  function add(compId, doseMg, date) {
    if (!compId || !date || !(parseDec(doseMg) > 0) || date > today) return;
    var k = compId + '|' + date + '|' + parseDec(doseMg);
    if (seen[k]) return; seen[k] = 1;
    out.push({ compId: compId, doseMg: parseDec(doseMg), date: date });
  }
  var mlog = (typeof _tcp !== 'undefined' && _tcp && _tcp.manualLog) ? _tcp.manualLog : [];
  mlog.forEach(function(e){ add(e.compId, e.doseMg, e.date); });
  _thLoggedTrt(_thInjections).forEach(function(e){ add(e.compId, e.doseMg, e.date); });
  out.sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}

function _thTodayStr() {
  var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _thUtcDateStr(ms) {
  var d = new Date(ms); return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
}

// Pure computation: the per-day free-T series from the merged past log, using the
// EXACT T-Calc model (no anchor override — identical math to the plasma chart).
// Returns { entries:[{date,marker,value,unit}], maxV, unit } or null. No I/O, so
// it is directly testable. `entries` runs from the first injection to the last —
// nothing is emitted past the latest injection (no decay tail).
function _thComputeFreeT() {
  if (typeof _tcFreeTSeries !== 'function') return null;
  // Make sure the calibration profile (measured FT, birth year) is hydrated even
  // if the T-Calc tab was never opened this session.
  if (typeof _tcp !== 'undefined' && _tcp && !(parseDec(_tcp.measuredFT) > 0)) {
    try { var c = getData('tc-profile'); if (c) Object.assign(_tcp, JSON.parse(c)); } catch(e) {}
  }
  var sorted = _thMergedPastLog();
  if (!sorted.length) return null;
  var _S;
  try { _S = _tcFreeTSeries(sorted, {}); } catch(e) { return null; }
  if (!_S || !_S.total || !_S.firstDate) return null;
  var firstMs    = _S.firstDate.getTime();
  var lastMs     = new Date(sorted[sorted.length-1].date).getTime();
  var lastInjDay = Math.round((lastMs - firstMs) / 86400000);
  var horizon    = Math.max(0, Math.min(_S.totalDays, lastInjDay + _TH_TAIL_DAYS));
  var unit       = _S.unitLabel || 'pmol/L';
  var entries = [], maxV = 0;
  for (var k = 0; k <= horizon; k++) {
    var v = _S.total[k] * (_S.calFT_arr ? _S.calFT_arr[k] : _S.scale);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > maxV) maxV = v;
    entries.push({ date: _thUtcDateStr(firstMs + k*86400000), marker: _TH_MARKER,
                   value: Math.round(v*1000)/1000, unit: unit });
  }
  return { entries: entries, maxV: maxV, unit: unit };
}

// Compute the free-T history (via _thComputeFreeT) and persist it to
// /plasma-history so the history view can just load & plot. Idempotent: it clears
// the free_t marker and re-writes the whole current series, so removing an
// injection is reflected too. Never stores a mis-calibrated (absurd) curve.
// Returns a Promise that always resolves.
function _captureFreeTHistory() {
  if (typeof AGENT_URL === 'undefined') return Promise.resolve();
  var out = _thComputeFreeT();
  if (!out || !out.entries.length) return Promise.resolve();
  var entries = out.entries;
  // Guard: a calibrated curve that peaks absurdly high means the model could not
  // anchor (e.g. a completed cycle with no blood test). Don't persist garbage —
  // the view then prompts the user to add a blood test to calibrate.
  if (out.unit === 'pmol/L' && out.maxV > _TH_MAX_SANE) return Promise.resolve();
  var hdrs = authHeaders({ 'Content-Type': 'application/json' });
  return fetch(AGENT_URL + '/plasma-history?marker=' + _TH_MARKER, { method: 'DELETE', headers: hdrs })
    .then(function(){ return fetch(AGENT_URL + '/plasma-history/batch', {
        method: 'POST', headers: hdrs, body: JSON.stringify({ entries: entries }) }); })
    .then(function(r){ if (r && !r.ok && typeof _logHttp === 'function') _logHttp('captureFT', r.status, '/plasma-history/batch'); })
    .catch(function(e){ if (typeof _logErr === 'function') _logErr('captureFT', e); });
}

/* ── history view (fetch & plot) ────────────────────────────────────────── */

function _thDayToMs(series, day){ return series.firstMs + day * 86400000; }
function _thFmtDate(ms){ var d = new Date(ms); var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return d.getDate()+' '+M[d.getMonth()]+' '+String(d.getFullYear()).slice(2); }
var _TH_ZOOM_DAYS = { week: 7, month: 30, year: 365 };

// Which zoom levels are meaningful for a history spanning `span` days. A window
// wider than the data would just show everything — identical to "All" — so a W/M/Y
// level is offered only when its window is actually narrower than the data. "All"
// is always offered. This is why Month/Year appear only once enough history exists.
function _thZoomLevels(span) {
  var defs = [{id:'week',label:'W',days:7},{id:'month',label:'M',days:30},{id:'year',label:'Y',days:365}];
  var out = defs.filter(function(z){ return z.days < span; });
  out.push({id:'all',label:'All'});
  return out;
}

// Build the render series from the stored free-T values — no PK math. Returns
// {firstMs,totalDays,lastDay,ft:[pmol/L per day],maxFt,injections[],calibrated,unit} or null.
function _thSeries() {
  var rows = (_thData || [])
    .filter(function(e){ return (e.marker || 'free_t') === _TH_MARKER && e.date && isFinite(e.value); })
    .sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (!rows.length) return null;
  var firstMs = new Date(rows[0].date + 'T12:00:00').getTime();
  var lastMs  = new Date(rows[rows.length-1].date + 'T12:00:00').getTime();
  var lastDay = Math.round((lastMs - firstMs) / 86400000);
  if (lastDay < 0) return null;
  var ft = new Float64Array(lastDay + 1), have = new Uint8Array(lastDay + 1), maxFt = 0;
  rows.forEach(function(e){
    var d = Math.round((new Date(e.date + 'T12:00:00').getTime() - firstMs) / 86400000);
    if (d >= 0 && d <= lastDay) { ft[d] = e.value; have[d] = 1; if (e.value > maxFt) maxFt = e.value; }
  });
  // Fill any gaps (normally none — the series is daily) by linear interpolation,
  // carrying the nearest known value at the ends. Purely cosmetic continuity.
  var prev = -1;
  for (var t = 0; t <= lastDay; t++) {
    if (have[t]) {
      if (prev >= 0 && t - prev > 1) {
        var span = t - prev, a = ft[prev], b = ft[t];
        for (var j = prev + 1; j < t; j++) ft[j] = a + (b - a) * (j - prev) / span;
      } else if (prev < 0 && t > 0) {
        for (var j2 = 0; j2 < t; j2++) ft[j2] = ft[t];
      }
      prev = t;
    }
  }
  if (prev >= 0 && prev < lastDay) for (var j3 = prev + 1; j3 <= lastDay; j3++) ft[j3] = ft[prev];
  var unit = rows[0].unit || 'pmol/L';
  var injections = _thMergedPastLog().map(function(e){
    return { day: Math.round((new Date(e.date + 'T12:00:00').getTime() - firstMs) / 86400000), date: e.date };
  }).filter(function(x){ return x.day >= 0 && x.day <= lastDay; });
  return { firstMs: firstMs, totalDays: lastDay, lastDay: lastDay, ft: ft, maxFt: maxFt,
           calibrated: (unit === 'pmol/L'), unit: unit, injections: injections, count: rows.length };
}

// Fetch stored free-T history and injections, then render. If the store is empty
// but the user has injections/history, capture once (backfill) and re-fetch —
// this self-onboards an existing user's data without any manual step.
function buildTHist() {
  var host = document.getElementById('thist-body');
  if (!host) return;
  if (_thData === undefined && _thInjections === undefined)
    host.innerHTML = '<div style="padding:48px;text-align:center"><div class="today-spinner"><div class="today-spinner-dot"></div></div></div>';
  else _thRender(host);
  var hdrs = authHeaders();
  Promise.all([
    fetch(AGENT_URL + '/plasma-history?marker=' + _TH_MARKER, { headers: hdrs }).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
    fetch(AGENT_URL + '/injections?active_only=false', { headers: hdrs }).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
  ]).then(function(res){
    _thData       = Array.isArray(res[0]) ? res[0] : [];
    _thInjections = Array.isArray(res[1]) ? res[1] : [];
    var mergedLog = _thMergedPastLog();
    var haveInjections = mergedLog.length > 0;
    // Stored data is stale if it was written by an older build (e.g. the curve
    // extends past the last injection — the removed decay tail). Re-capture so the
    // history matches the current model without any manual step.
    var lastInjDate = haveInjections ? mergedLog[mergedLog.length-1].date : '';
    var storedMax = '';
    _thData.forEach(function(e){ if ((e.marker||'free_t') === _TH_MARKER && e.date > storedMax) storedMax = e.date; });
    var staleTail = haveInjections && storedMax && storedMax > lastInjDate;
    var haveHistory = _thData.length > 0 && !staleTail;
    if (!haveHistory && haveInjections) {
      _captureFreeTHistory().then(function(){
        return fetch(AGENT_URL + '/plasma-history?marker=' + _TH_MARKER, { headers: hdrs }).then(function(r){ return r.ok ? r.json() : []; });
      }).then(function(rows){
        _thData = Array.isArray(rows) ? rows : [];
        if (_currentTab === 'thist') { var h = document.getElementById('thist-body'); if (h) _thRender(h); }
      }).catch(function(){ if (_currentTab === 'thist') { var h = document.getElementById('thist-body'); if (h) _thRender(h); } });
      return;
    }
    if (_currentTab === 'thist') { var h = document.getElementById('thist-body'); if (h) _thRender(h); }
  });
}

function _thRender(host) {
  if (!host) host = document.getElementById('thist-body');
  if (!host) return;
  var series = _thSeries();
  var addBtn = '<button onclick="openPastInjection()" style="width:100%;background:none;border:1px dashed var(--border);border-radius:10px;color:var(--muted2);font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit;letter-spacing:0.3px">+ Log a past injection</button>';
  if (!series) {
    var haveInj = _thMergedPastLog().length > 0;
    var msg = haveInj
      ? 'Your injections are recorded, but a free-T curve needs a blood test to calibrate. Add a measured free-T value (and birth year) in <b>T-Calc</b> and it will appear here.'
      : 'Check off your testosterone injections in the <b>Today</b> view as you take them, or log past ones below. Your free-T history then appears here.';
    host.innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;padding:32px 24px 24px"><div style="text-align:center;color:var(--muted2)">' +
      '<div style="font-size:34px;margin-bottom:12px">📉</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">No free-T history yet</div>' +
      '<div style="font-size:13px;line-height:1.5">' + msg + '</div></div>' + addBtn + '</div>';
    return;
  }
  if (_thFocusDay === null || _thFocusDay < 0 || _thFocusDay > series.totalDays) _thFocusDay = series.lastDay;
  var zooms = _thZoomLevels(series.totalDays);
  if (!zooms.some(function(z){ return z.id === _thZoom; })) _thZoom = 'all';
  var zBtns = zooms.map(function(z){
    var sel = _thZoom === z.id;
    return '<button id="th-zoom-'+z.id+'" onclick="_thSetZoom(\''+z.id+'\')" style="flex:1;background:'+(sel?'rgba(224,80,80,0.22)':'none')+';color:'+(sel?'#e05050':'var(--muted2)')+';border:1px solid '+(sel?'#e0505066':'var(--border)')+';border-radius:8px;padding:7px 4px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">'+z.label+'</button>';
  }).join('');
  var h = '<div style="display:flex;flex-direction:column;gap:14px;padding:16px 20px">';
  h += '<div style="font-size:11px;color:var(--muted2);line-height:1.5">Historical free-T from your logged testosterone injections. Read-only — loaded from your saved history.</div>';
  h += '<div style="display:flex;gap:6px">'+zBtns+'</div>';
  h += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px">';
  h += '<canvas id="th-chart" style="width:100%;display:block"></canvas>';
  h += '<div style="margin-top:12px"><input id="th-slider" type="range" min="0" max="'+series.totalDays+'" value="'+_thFocusDay+'" step="1" oninput="_thSetFocusDay(this.value)" style="width:100%;accent-color:#e05050"></div>';
  h += '<div id="th-readout" style="margin-top:8px;font-size:12px;color:var(--text);text-align:center;min-height:16px"></div>';
  h += '</div>';
  if (!series.calibrated) h += '<div style="font-size:11px;color:var(--muted2);line-height:1.5">Add a measured free-T value (and birth year) in T-Calc to calibrate the vertical scale to pmol/L. Showing relative shape until then.</div>';
  h += addBtn;
  h += '</div>';
  host.innerHTML = h;
  _thRedraw();
}

function _thSetZoom(z){ _thZoom = z; ['week','month','year','all'].forEach(function(zz){ var b=document.getElementById('th-zoom-'+zz); if(!b)return; var sel=zz===z; b.style.background=sel?'rgba(224,80,80,0.22)':'none'; b.style.color=sel?'#e05050':'var(--muted2)'; b.style.borderColor=sel?'#e0505066':'var(--border)'; }); _thRedraw(); }
function _thSetFocusDay(v){ _thFocusDay = parseInt(v,10) || 0; _thRedraw(); }

function _thRedraw() {
  var series = _thSeries();
  if (!series) return;
  if (_thFocusDay === null || _thFocusDay > series.totalDays) _thFocusDay = series.lastDay;
  _thDrawChart('th-chart', series, _thZoom, _thFocusDay);
  var ro = document.getElementById('th-readout');
  if (ro) {
    var ftv = series.ft[Math.max(0, Math.min(series.totalDays, _thFocusDay))] || 0;
    var focusMs = _thDayToMs(series, _thFocusDay);
    var val = series.calibrated ? (Math.round(ftv) + ' pmol/L') : (Math.round(ftv*10)/10 + ' (rel.)');
    ro.innerHTML = '<span style="color:var(--muted2)">As of</span> <b>' + _thFmtDate(focusMs) + '</b> · <span style="color:#e05050;font-weight:700">' + val + '</span> free T';
  }
}

function _thDrawChart(canvasId, series, zoom, focusDay) {
  var canvas = document.getElementById(canvasId); if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300, cssH = 150;
  canvas.width = cssW*dpr; canvas.height = cssH*dpr; canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
  var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  var span = (zoom === 'all') ? series.totalDays : Math.min(series.totalDays, _TH_ZOOM_DAYS[zoom] || series.totalDays);
  var winStart, winEnd;
  if (zoom === 'all') { winStart = 0; winEnd = series.totalDays; }
  else {
    winStart = Math.max(0, Math.min(series.totalDays - span, focusDay - Math.floor(span/2)));
    winEnd = Math.min(series.totalDays, winStart + span);
  }
  if (winEnd <= winStart) winEnd = winStart + 1;
  var PAD = {top:12, right:12, bottom:26, left:44};
  var cW = cssW - PAD.left - PAD.right, cH = cssH - PAD.top - PAD.bottom;
  var yMax = (series.maxFt > 0 ? series.maxFt : 1) * 1.12, yMin = 0;
  var xOf = function(day){ return PAD.left + (day - winStart) / (winEnd - winStart) * cW; };
  var yOf = function(v){ return PAD.top + cH - (v - yMin) / (yMax - yMin) * cH; };
  ctx.strokeStyle = '#3A352B'; ctx.lineWidth = 0.5;
  ctx.fillStyle = '#777'; ctx.font = '9px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'right';
  for (var g = 0; g <= 3; g++) { var gy = PAD.top + cH/3*g; ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(PAD.left+cW, gy); ctx.stroke(); var lv = yMax - (yMax-yMin)*(g/3); ctx.fillText(series.calibrated ? String(Math.round(lv)) : (Math.round(lv*10)/10).toFixed(1), PAD.left-4, gy+3); }
  series.injections.forEach(function(inj){ if (inj.day < winStart || inj.day > winEnd) return; var x = xOf(inj.day); ctx.strokeStyle = '#e0505055'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top+cH); ctx.stroke(); ctx.fillStyle = '#e05050'; ctx.beginPath(); ctx.moveTo(x, PAD.top+cH-4); ctx.lineTo(x-3, PAD.top+cH+2); ctx.lineTo(x+3, PAD.top+cH+2); ctx.closePath(); ctx.fill(); });
  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top+cH);
  grad.addColorStop(0, '#e0505044'); grad.addColorStop(1, '#e0505000');
  ctx.beginPath(); ctx.moveTo(xOf(winStart), PAD.top+cH);
  for (var d = winStart; d <= winEnd; d++) ctx.lineTo(xOf(d), yOf(series.ft[d] || 0));
  ctx.lineTo(xOf(winEnd), PAD.top+cH); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  for (var d2 = winStart; d2 <= winEnd; d2++) { var x2 = xOf(d2), y2 = yOf(series.ft[d2] || 0); if (d2 === winStart) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
  ctx.strokeStyle = '#e05050'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  if (focusDay >= winStart && focusDay <= winEnd) {
    var fx = xOf(focusDay), fy = yOf(series.ft[focusDay] || 0);
    ctx.strokeStyle = '#e8ff3c'; ctx.lineWidth = 1; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(fx, PAD.top); ctx.lineTo(fx, PAD.top+cH); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI*2); ctx.fillStyle = '#e8ff3c'; ctx.fill(); ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, Math.PI*2); ctx.fillStyle = '#000'; ctx.fill();
  }
  ctx.fillStyle = '#777'; ctx.font = '9px -apple-system,system-ui,sans-serif';
  ctx.textAlign = 'left';   ctx.fillText(_thFmtDate(_thDayToMs(series, winStart)), PAD.left, PAD.top+cH+16);
  ctx.textAlign = 'right';  ctx.fillText(_thFmtDate(_thDayToMs(series, winEnd)), PAD.left+cW, PAD.top+cH+16);
  ctx.textAlign = 'right';  ctx.fillStyle = '#e05050'; ctx.fillText(series.calibrated ? 'pmol/L' : 'rel.', PAD.left+cW, PAD.top+8);
}

/* ── add-a-past-injection modal ─────────────────────────────────────────── */

var _piDraft = null;   // { tier, compId, dose, unit, date, time }

function _piCat(tier) {
  if (tier === 'peptide')  return (typeof PEPTIDE_CAT !== 'undefined' ? PEPTIDE_CAT : []);
  if (tier === 'enhanced') return (typeof ENHANCEMENT_COMPOUNDS !== 'undefined' ? (ENHANCEMENT_COMPOUNDS || []) : []);
  return (typeof TRT_CAT !== 'undefined' ? TRT_CAT : []);   // trt
}
function _piCatEntry(tier, id) {
  return _piCat(tier).find(function(c){ return c.id === id; }) || null;
}
function _piDefaultUnit(tier) { return tier === 'peptide' ? 'µg' : 'mg'; }

function openPastInjection(tier) {
  var t = (tier === 'peptide' || tier === 'enhanced') ? tier : 'trt';
  var cat = _piCat(t);
  _piDraft = { tier: t, compId: (cat[0] && cat[0].id) || '', dose: '', unit: _piDefaultUnit(t), date: _thTodayStr(), time: '' };
  var ex = document.getElementById('pi-overlay'); if (ex) ex.remove();
  var wrap = document.createElement('div');
  wrap.innerHTML = _piHtml();
  document.body.appendChild(wrap.firstChild);
}
function _piClose() { var el = document.getElementById('pi-overlay'); if (el) el.remove(); _piDraft = null; }

function _piHtml() {
  var d = _piDraft;
  var tiers = [{id:'trt',label:'TRT'},{id:'peptide',label:'Peptide'},{id:'enhanced',label:'Enhanced'}];
  var tierBtns = tiers.map(function(tt){
    var sel = d.tier === tt.id;
    return '<button onclick="_piSetTier(\''+tt.id+'\')" style="flex:1;background:'+(sel?'var(--accent)':'none')+';color:'+(sel?'#000':'var(--muted2)')+';border:1px solid '+(sel?'var(--accent)':'var(--border)')+';border-radius:8px;padding:9px 4px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">'+tt.label+'</button>';
  }).join('');
  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 12px;color:var(--text);font-size:16px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:6px;display:block';
  var comps = _piCat(d.tier);
  var compOpts = comps.map(function(c){ return '<option value="'+_esc(c.id)+'"'+(c.id===d.compId?' selected':'')+'>'+_esc(c.name)+'</option>'; }).join('');
  var units = ['mg','ml','IU','µg','%'];
  var unitOpts = units.map(function(u){ return '<option'+(u===d.unit?' selected':'')+'>'+u+'</option>'; }).join('');
  var times = [{id:'',label:'—'},{id:'AM',label:'AM'},{id:'PM',label:'PM'}];
  var timeBtns = times.map(function(tm){
    var sel = (d.time||'') === tm.id;
    return '<button onclick="_piSetField(\'time\',\''+tm.id+'\')" style="flex:1;background:'+(sel?'rgba(224,80,80,0.22)':'none')+';color:'+(sel?'#e05050':'var(--muted2)')+';border:1px solid '+(sel?'#e0505066':'var(--border)')+';border-radius:8px;padding:8px 4px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">'+tm.label+'</button>';
  }).join('');
  var h = '<div id="pi-overlay" onclick="if(event.target===this)_piClose()" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:flex-end;justify-content:center;overflow-y:auto;-webkit-overflow-scrolling:touch">';
  h += '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 40px;box-sizing:border-box">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">' +
       '<div><div style="font-size:11px;color:var(--muted);letter-spacing:1.5px;font-weight:700">ONBOARD A CYCLE</div>' +
       '<div style="font-size:19px;font-weight:800;color:var(--text);margin-top:2px">Log a past injection</div></div>' +
       '<button onclick="_piClose()" style="background:none;border:none;color:var(--muted2);font-size:24px;cursor:pointer;line-height:1;font-family:inherit">×</button></div>';
  h += '<div style="font-size:11px;color:var(--muted2);line-height:1.5;margin-bottom:16px">Add injections you took before you started tracking. They appear in your history and feed the free-T curve in T-Calc and T-History.</div>';
  h += '<label style="'+lSty+'">Type</label><div style="display:flex;gap:6px;margin-bottom:16px">'+tierBtns+'</div>';
  h += '<label style="'+lSty+'">Compound</label><select onchange="_piSetField(\'compId\',this.value)" style="'+iSty+';margin-bottom:16px">'+compOpts+'</select>';
  h += '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:10px;margin-bottom:16px">';
  h += '<div><label style="'+lSty+'">Dose</label><input type="text" inputmode="decimal" value="'+_esc(String(d.dose||''))+'" placeholder="0" oninput="_piSetField(\'dose\',this.value)" style="'+iSty+'"></div>';
  h += '<div><label style="'+lSty+'">Unit</label><select onchange="_piSetField(\'unit\',this.value)" style="'+iSty+'">'+unitOpts+'</select></div>';
  h += '</div>';
  h += '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:10px;margin-bottom:20px">';
  h += '<div><label style="'+lSty+'">Date</label><input type="date" value="'+_esc(d.date||'')+'" max="'+_thTodayStr()+'" onchange="_piSetField(\'date\',this.value)" style="'+iSty+'"></div>';
  h += '<div><label style="'+lSty+'">Time</label><div style="display:flex;gap:5px">'+timeBtns+'</div></div>';
  h += '</div>';
  h += '<div id="pi-err" style="color:#e05050;font-size:12px;min-height:15px;margin-bottom:8px"></div>';
  h += '<button onclick="savePastInjection()" style="width:100%;background:var(--accent);color:#000;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">Save injection</button>';
  h += '</div></div>';
  return h;
}

function _piSetTier(t) {
  if (!_piDraft) return;
  _piDraft.tier = t;
  var cat = _piCat(t);
  _piDraft.compId = (cat[0] && cat[0].id) || '';
  _piDraft.unit = _piDefaultUnit(t);
  var ex = document.getElementById('pi-overlay'); if (ex) ex.remove();
  var wrap = document.createElement('div'); wrap.innerHTML = _piHtml(); document.body.appendChild(wrap.firstChild);
}
function _piSetField(k, v) { if (_piDraft) _piDraft[k] = v; }

function _piToCacheRow(e) {
  return { id: e.id, cycle_id: e.cycle_id, date: e.date, compound_id: e.compound_id,
           compound_name: e.compound_name, tier: e.tier, dose: e.dose, unit: e.unit,
           dot: e.dot || '#888', time_of_day: e.time_of_day || null, active: true,
           logged: true, source: 'manual' };
}

function savePastInjection() {
  var d = _piDraft; if (!d) return;
  var err = document.getElementById('pi-err');
  if (!d.compId) { if (err) err.textContent = 'Pick a compound.'; return; }
  if (!(parseDec(d.dose) > 0)) { if (err) err.textContent = 'Enter a dose greater than 0.'; return; }
  if (!d.date || d.date > _thTodayStr()) { if (err) err.textContent = 'Pick a date in the past (or today).'; return; }
  var cat = _piCatEntry(d.tier, d.compId);
  var name = cat ? cat.name : d.compId;
  var dot  = (cat && cat.dot) ? cat.dot : (d.tier === 'trt' ? '#e05050' : '#888');
  var meta = (typeof _injPkMeta === 'function') ? _injPkMeta(d.tier, d.compId) : { ester: null, half_life_days: null };
  var body = { cycle_id: 'manual', date: d.date, compound_id: d.compId, compound_name: name,
               tier: d.tier, dose: String(parseDec(d.dose)), unit: d.unit || _piDefaultUnit(d.tier),
               dot: dot, time_of_day: (d.time || null), active: true, logged: true, source: 'manual',
               ester: meta.ester, half_life_days: meta.half_life_days, route: null };
  var btnDate = d.date, btnTier = d.tier, btnComp = d.compId, btnDose = parseDec(d.dose);
  if (err) err.textContent = '';
  fetch(AGENT_URL + '/injections', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(res){
      if (!res || !res.entry) { if (err) err.textContent = 'Could not save — try again.'; return; }
      // Cache it for the Today view (recent window only).
      if (typeof _injectionsCache !== 'undefined') {
        var dk = res.entry.date;
        (_injectionsCache[dk] = _injectionsCache[dk] || []).push(_piToCacheRow(res.entry));
      }
      // Mirror testosterone into the T-Calc manual log so it surfaces on the plasma curve.
      if (btnTier === 'trt' && typeof _tcp !== 'undefined' && _tcp) {
        _tcp.manualLog = _tcp.manualLog || [];
        _tcp.manualLog.push({ compId: btnComp, doseMg: btnDose, date: btnDate });
        _tcp.manualLog.sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : (a.date||'') > (b.date||'') ? 1 : 0; });
        if (typeof _tcSaveProfile === 'function') _tcSaveProfile();
      }
      _piClose();
      if (typeof buildToday === 'function') buildToday();
      if (typeof buildWeekStrip === 'function') buildWeekStrip();
      if (typeof buildSchedule === 'function') buildSchedule();
      // Recompute & persist the free-T history, then refresh the view if open.
      _captureFreeTHistory().then(function(){ if (_currentTab === 'thist') buildTHist(); });
    })
    .catch(function(e){ if (typeof _logErr === 'function') _logErr('savePastInj', e); if (err) err.textContent = 'Network error — try again.'; });
}
