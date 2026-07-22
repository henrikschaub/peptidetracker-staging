/* ── T-HISTORICAL ──────────────────────────────────────────────────────────
 * Read-only historical free-T view built from the user's LOGGED testosterone
 * injections (_tcp.manualLog). This tab NEVER writes _tcp or touches the T-Calc
 * planning sub-tab — it only reads manualLog and reuses the T-Calc's pure PK
 * primitives (_tcCompInfo / _tcKa / _tcPkConc / _tcDefaultFT) so the curve shape
 * matches the rest of the app. The historical curve is drawn from the first
 * injection to the last injection, with a date slider to scrub the as-of day and
 * week / month / year / all zoom levels.
 * ------------------------------------------------------------------------- */

var _thZoom = 'all';       // 'week' | 'month' | 'year' | 'all'
var _thFocusDay = null;    // as-of day index (days from first injection); null → last injection
var _TH_TAIL_DAYS = 0;     // horizon: chart ends at the last injection (no post-injection tail)
var _thInjections;         // cached /injections rows (undefined until first fetch)

// Sorted testosterone injections that were actually LOGGED (checked in the Today
// view), read from the /injections store (window._thInjections). Only tier 'trt'
// (testosterone) feeds the free-T curve — other androgens don't become free T.
// Each row carries its own snapshotted half_life_days; readers fall back to the
// catalogue via _tcCompInfo for older rows that predate the snapshot.
function _thLog() {
  var rows = _thInjections || [];
  return rows.filter(function(e){
      return e && e.logged && e.tier === 'trt' && e.date && parseDec(e.dose) > 0;
    })
    .map(function(e){
      return { compId: e.compound_id, doseMg: parseDec(e.dose), date: e.date,
               half_life_days: (e.half_life_days > 0 ? e.half_life_days : null) };
    })
    .sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

// Pure PK accumulation from an ascending injection log. tailDays = extra days drawn
// after the last injection. Returns {firstMs,totalDays,lastDay,total} or null.
function _thAccumulate(sorted, tailDays) {
  if (!sorted || !sorted.length) return null;
  var firstMs = new Date(sorted[0].date + 'T12:00:00').getTime();
  var lastMs  = new Date(sorted[sorted.length - 1].date + 'T12:00:00').getTime();
  var lastDay = Math.round((lastMs - firstMs) / 86400000);
  var totalDays = lastDay + (tailDays || 0);
  var total = new Float64Array(totalDays + 1);
  sorted.forEach(function(e) {
    var cd    = _tcCompInfo(e.compId);
    var hl    = (e.half_life_days > 0 ? e.half_life_days : (cd.halfLifeDays || 1));
    var bioav = cd.bioavailability || 1;
    var ke    = Math.LN2 / hl;
    var ka    = _tcKa(hl);
    var injDay = Math.round((new Date(e.date + 'T12:00:00').getTime() - firstMs) / 86400000);
    var absorbed = parseDec(e.doseMg) * bioav;
    for (var t = injDay; t <= totalDays; t++) total[t] += _tcPkConc(absorbed, ka, ke, t - injDay);
  });
  return { firstMs: firstMs, totalDays: totalDays, lastDay: lastDay, total: total };
}

// Settled steady-state level of the raw accumulation — the mean of peak & trough over
// the second half of the log. This is the STABLE anchor for calibration: unlike the
// day-0 value (≈0 at the first injection), it is never near zero, so dividing by it
// can't blow the scale up. Returns 0 only when there is no accumulation at all.
function _thSteadyState(acc) {
  if (!acc || acc.lastDay < 0) return 0;
  var mid = Math.max(0, Math.floor(acc.lastDay / 2));
  var peak = 0, trough = Infinity;
  for (var t = mid; t <= acc.lastDay; t++) {
    if (acc.total[t] > peak)   peak   = acc.total[t];
    if (acc.total[t] < trough) trough = acc.total[t];
  }
  if (peak === 0) { for (var i = 0; i <= acc.totalDays; i++) if (acc.total[i] > peak) peak = acc.total[i]; }
  if (trough === Infinity) trough = peak;
  return (peak + trough) / 2 || peak;
}

// Scale factor: raw accumulation → pmol/L free T, anchored so the settled steady state
// maps to the user's measured/estimated free T (calFT = FT / steady-state). Anchoring at
// steady state (not day 0) keeps the scale physiological. If no free-T value is available
// it falls back to a RELATIVE scale (steady state ≈ 100) so the curve still shows its shape
// rather than collapsing to zero. Always > 0 when there is any accumulation.
function _thCalFT(acc, measuredFT, birthYear) {
  var ss = _thSteadyState(acc);
  if (!(ss > 0)) return 0;
  var ft = (parseDec(measuredFT) > 0) ? parseDec(measuredFT)
         : (typeof _tcDefaultFT === 'function' ? _tcDefaultFT(parseInt(birthYear) || 0) : 0);
  return (ft > 0) ? (ft / ss) : (100 / ss);
}

// Full series for rendering: {firstMs,totalDays,lastDay,ft:[per day],maxFt,injDays[],calibrated}.
// Self-contained: raw PK accumulation scaled so the settled steady state equals the user's
// measured/estimated free T (pmol/L), or a relative 100-scale when no free-T value exists.
// Curve ends at the last injection (_TH_TAIL_DAYS = 0). NOTE: this is the injection-driven
// free-T contribution and rises from 0 at the first shot — it is deliberately NOT run through
// the T-Calc's day-0-anchored model, whose anchor degenerates (and the scale explodes) for a
// completed cycle where "today" is past the last injection.
function _thSeries() {
  var sorted = _thLog();
  var acc = _thAccumulate(sorted, _TH_TAIL_DAYS);
  if (!acc) return null;
  var mft = (typeof _tcp !== 'undefined' && _tcp) ? parseDec(_tcp.measuredFT) : 0;
  if (!(mft > 0) && typeof _tcDefaultFT === 'function') mft = _tcDefaultFT(parseInt((_tcp && _tcp.birthYear) || 0) || 0);
  var calibrated = mft > 0;
  var cal = _thCalFT(acc, (typeof _tcp !== 'undefined' && _tcp) ? _tcp.measuredFT : 0,
                          (typeof _tcp !== 'undefined' && _tcp) ? _tcp.birthYear : 0);
  var ft = new Float64Array(acc.totalDays + 1), maxFt = 0;
  for (var t = 0; t <= acc.totalDays; t++) { ft[t] = acc.total[t] * cal; if (ft[t] > maxFt) maxFt = ft[t]; }
  var injDays = sorted.map(function(e){
    return { day: Math.round((new Date(e.date + 'T12:00:00').getTime() - acc.firstMs) / 86400000),
             date: e.date, compId: e.compId, doseMg: parseDec(e.doseMg) };
  });
  return { firstMs: acc.firstMs, totalDays: acc.totalDays, lastDay: acc.lastDay,
           ft: ft, maxFt: maxFt, calibrated: calibrated, injections: injDays, count: sorted.length };
}

function _thDayToMs(series, day){ return series.firstMs + day * 86400000; }
function _thFmtDate(ms){ var d = new Date(ms); var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return d.getDate()+' '+M[d.getMonth()]+' '+String(d.getFullYear()).slice(2); }

var _TH_ZOOM_DAYS = { week: 7, month: 30, year: 365 };

// Fetch the full logged-injection history, then render. Called on tab open;
// re-renders when fresh data arrives so newly checked doses appear.
function buildTHist() {
  var host = document.getElementById('thist-body');
  if (!host) return;
  if (_thInjections === undefined)
    host.innerHTML = '<div style="padding:48px;text-align:center"><div class="today-spinner"><div class="today-spinner-dot"></div></div></div>';
  else _thRender(host);
  fetch(AGENT_URL + '/injections?active_only=false', { headers: authHeaders() })
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(rows){ _thInjections = Array.isArray(rows) ? rows : []; if (_currentTab === 'thist') { var h = document.getElementById('thist-body'); if (h) _thRender(h); } })
    .catch(function(){ if (_thInjections === undefined) _thInjections = []; if (_currentTab === 'thist') { var h = document.getElementById('thist-body'); if (h) _thRender(h); } });
}

function _thRender(host) {
  if (!host) host = document.getElementById('thist-body');
  if (!host) return;
  var series = _thSeries();
  if (!series) {
    host.innerHTML = '<div style="padding:48px 24px;text-align:center;color:var(--muted2)">' +
      '<div style="font-size:34px;margin-bottom:12px">📉</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">No testosterone injections logged yet</div>' +
      '<div style="font-size:13px;line-height:1.5">Check off your testosterone injections in the <b>Today</b> view as you take them. Your full injection history will then appear here as a free-T curve.</div>' +
      '</div>';
    return;
  }
  if (_thFocusDay === null || _thFocusDay < 0 || _thFocusDay > series.totalDays) _thFocusDay = series.lastDay;
  var zooms = [{id:'week',label:'W'},{id:'month',label:'M'},{id:'year',label:'Y'},{id:'all',label:'All'}];
  var zBtns = zooms.map(function(z){
    var sel = _thZoom === z.id;
    return '<button id="th-zoom-'+z.id+'" onclick="_thSetZoom(\''+z.id+'\')" style="flex:1;background:'+(sel?'rgba(224,80,80,0.22)':'none')+';color:'+(sel?'#e05050':'var(--muted2)')+';border:1px solid '+(sel?'#e0505066':'var(--border)')+';border-radius:8px;padding:7px 4px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">'+z.label+'</button>';
  }).join('');
  var h = '<div style="display:flex;flex-direction:column;gap:14px;padding:16px 20px">';
  h += '<div style="font-size:11px;color:var(--muted2);line-height:1.5">Historical free-T from the testosterone injections you checked off in Today. Read-only.</div>';
  h += '<div style="display:flex;gap:6px">'+zBtns+'</div>';
  h += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px">';
  h += '<canvas id="th-chart" style="width:100%;display:block"></canvas>';
  h += '<div style="margin-top:12px"><input id="th-slider" type="range" min="0" max="'+series.totalDays+'" value="'+_thFocusDay+'" step="1" oninput="_thSetFocusDay(this.value)" style="width:100%;accent-color:#e05050"></div>';
  h += '<div id="th-readout" style="margin-top:8px;font-size:12px;color:var(--text);text-align:center;min-height:16px"></div>';
  h += '</div>';
  if (!series.calibrated) h += '<div style="font-size:11px;color:var(--muted2);line-height:1.5">Add a measured free-T value (and birth year) in T-Calc to calibrate the vertical scale to pmol/L. Showing relative shape until then.</div>';
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
  // Window (day range) from zoom + focus, clamped to [0,totalDays]
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
  // grid + y labels
  ctx.strokeStyle = '#3A352B'; ctx.lineWidth = 0.5;
  ctx.fillStyle = '#777'; ctx.font = '9px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'right';
  for (var g = 0; g <= 3; g++) { var gy = PAD.top + cH/3*g; ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(PAD.left+cW, gy); ctx.stroke(); var lv = yMax - (yMax-yMin)*(g/3); ctx.fillText(series.calibrated ? String(Math.round(lv)) : (Math.round(lv*10)/10).toFixed(1), PAD.left-4, gy+3); }
  // injection tick marks (bottom)
  series.injections.forEach(function(inj){ if (inj.day < winStart || inj.day > winEnd) return; var x = xOf(inj.day); ctx.strokeStyle = '#e0505055'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top+cH); ctx.stroke(); ctx.fillStyle = '#e05050'; ctx.beginPath(); ctx.moveTo(x, PAD.top+cH-4); ctx.lineTo(x-3, PAD.top+cH+2); ctx.lineTo(x+3, PAD.top+cH+2); ctx.closePath(); ctx.fill(); });
  // curve (fill + line) across window
  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top+cH);
  grad.addColorStop(0, '#e0505044'); grad.addColorStop(1, '#e0505000');
  ctx.beginPath(); ctx.moveTo(xOf(winStart), PAD.top+cH);
  for (var d = winStart; d <= winEnd; d++) ctx.lineTo(xOf(d), yOf(series.ft[d] || 0));
  ctx.lineTo(xOf(winEnd), PAD.top+cH); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  for (var d2 = winStart; d2 <= winEnd; d2++) { var x2 = xOf(d2), y2 = yOf(series.ft[d2] || 0); if (d2 === winStart) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
  ctx.strokeStyle = '#e05050'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  // focus marker (as-of)
  if (focusDay >= winStart && focusDay <= winEnd) {
    var fx = xOf(focusDay), fy = yOf(series.ft[focusDay] || 0);
    ctx.strokeStyle = '#e8ff3c'; ctx.lineWidth = 1; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(fx, PAD.top); ctx.lineTo(fx, PAD.top+cH); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI*2); ctx.fillStyle = '#e8ff3c'; ctx.fill(); ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, Math.PI*2); ctx.fillStyle = '#000'; ctx.fill();
  }
  // x axis date labels (start / mid / end of window)
  ctx.fillStyle = '#777'; ctx.font = '9px -apple-system,system-ui,sans-serif';
  ctx.textAlign = 'left';   ctx.fillText(_thFmtDate(_thDayToMs(series, winStart)), PAD.left, PAD.top+cH+16);
  ctx.textAlign = 'right';  ctx.fillText(_thFmtDate(_thDayToMs(series, winEnd)), PAD.left+cW, PAD.top+cH+16);
  ctx.textAlign = 'right';  ctx.fillStyle = '#e05050'; ctx.fillText(series.calibrated ? 'pmol/L' : 'rel.', PAD.left+cW, PAD.top+8);
}
