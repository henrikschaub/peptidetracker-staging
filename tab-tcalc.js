// tab-tcalc.js — Advanced Testosterone Cycle Calculator (T-Calc)

var _TC_FREQ_OPTS = [
  {label:'Daily',           days:1},
  {label:'EOD',             days:2},
  {label:'3×/week',         days:7/3},
  {label:'2×/week',         days:3.5},
  {label:'Weekly',          days:7},
  {label:'Every 10 days',   days:10},
  {label:'Every 2 weeks',   days:14},
  {label:'Every 3 weeks',   days:21},
  {label:'Every 6 weeks',   days:42},
  {label:'Every 8 weeks',   days:56},
  {label:'Every 10 weeks',  days:70},
  {label:'Every 12 weeks',  days:84}
];

var _TC_CYCLE_OPTS = [
  {label:'8 weeks',   days:56},
  {label:'12 weeks',  days:84},
  {label:'16 weeks',  days:112},
  {label:'20 weeks',  days:140},
  {label:'24 weeks',  days:168},
  {label:'6 months',  days:182},
  {label:'9 months',  days:273},
  {label:'12 months', days:365}
];

var _tc = {
  planName:    'My TRT Protocol',
  cycleDays:   168,
  compounds:   [{compId:'cypionate', freqIdx:3, dosePerWeek:150, dosePerInj:250}],
  strategy:    'smooth-ramp',
  rampWeeks:   6,
  endStrategy: 'permanent',
  cal: {totalT:'', shbg:'', measuredFT:'', targetFT:''},
  _sched: [],
  _curve: null,
  _stats: null
};

// ── per-compound helpers ──────────────────────────────────────────────────────

function _tcCmpInterval(ci)  { return _TC_FREQ_OPTS[_tc.compounds[ci].freqIdx].days; }
function _tcCmpLong(ci)      { return _tcCmpInterval(ci) > 14; }
function _tcCmpDosePerInj(ci) {
  var c = _tc.compounds[ci];
  return _tcCmpLong(ci) ? c.dosePerInj : c.dosePerWeek / (7 / _tcCmpInterval(ci));
}
function _tcCmpData(ci) {
  var c     = _tc.compounds[ci];
  var cat   = TRT_CAT.find(function(x){ return x.id === c.compId; });
  var guide = TRT_GUIDE[c.compId];
  var hl    = guide ? (_parseHalfLifeDays(guide.halfLife) || 7) : 7;
  return {
    id:          c.compId,
    name:        cat   ? cat.name  : c.compId,
    dot:         cat   ? cat.dot   : '#e8a020',
    halfLifeDays: hl,
    halfLifeStr: guide ? guide.halfLife : ''
  };
}

function _tcAddCompound() {
  _tc.compounds.push({compId:'enanthate', freqIdx:3, dosePerWeek:100, dosePerInj:250});
  buildTCalc();
}
function _tcRemoveCompound(ci) {
  if (_tc.compounds.length <= 1) return;
  _tc.compounds.splice(ci, 1);
  buildTCalc();
}

// ── schedule generation ───────────────────────────────────────────────────────

function _tcGenSchedule() {
  var allInjs = [];
  _tc.compounds.forEach(function(comp, ci) {
    var dpi      = _tcCmpDosePerInj(ci);
    var interval = _tcCmpInterval(ci);
    var startDpi = dpi * 0.2;
    var d = 0;
    while (d < _tc.cycleDays) {
      var dose;
      if (_tc.strategy === 'smooth-ramp') {
        var prog = Math.min(1, (d / 7) / _tc.rampWeeks);
        dose = startDpi + (dpi - startDpi) * prog;
      } else {
        dose = dpi;
      }
      allInjs.push({day: Math.round(d), dose: Math.round(dose * 10) / 10, ci: ci});
      d += interval;
    }
  });
  allInjs.sort(function(a, b){ return a.day - b.day || a.ci - b.ci; });
  return allInjs;
}

// ── PK curve ─────────────────────────────────────────────────────────────────

function _tcBuildCurve(sched) {
  var n       = _tc.cycleDays + 1;
  var total   = new Float64Array(n);
  var perComp = _tc.compounds.map(function(){ return new Float64Array(n); });

  _tc.compounds.forEach(function(comp, ci) {
    var cdata    = _tcCmpData(ci);
    var k        = Math.LN2 / cdata.halfLifeDays;
    var compInjs = sched.filter(function(inj){ return inj.ci === ci; });
    for (var t = 0; t < n; t++) {
      var c = 0;
      for (var j = 0; j < compInjs.length; j++) {
        if (compInjs[j].day <= t) c += compInjs[j].dose * Math.exp(-k * (t - compInjs[j].day));
      }
      perComp[ci][t] = c;
      total[t] += c;
    }
  });
  return {total: total, perComp: perComp};
}

// ── stats ─────────────────────────────────────────────────────────────────────

function _tcComputeStats(total, sched) {
  // Combined steady-state: sum of each compound's individual ss trough/peak
  var ssTrough = 0, ssPeak = 0;
  _tc.compounds.forEach(function(comp, ci) {
    var cdata = _tcCmpData(ci);
    var k     = Math.LN2 / cdata.halfLifeDays;
    var iv    = _tcCmpInterval(ci);
    var dpi   = _tcCmpDosePerInj(ci);
    if (iv > 0 && k > 0) {
      var expKT = Math.exp(k * iv);
      var ss_t  = dpi / (expKT - 1);
      ssTrough += ss_t;
      ssPeak   += ss_t + dpi;
    }
  });

  var bandFloor = ssTrough * 0.85;
  var bandCeil  = ssPeak   * 1.15;

  var peak = 0, trough = Infinity, inBand = 0;
  var n = _tc.cycleDays + 1;
  for (var t = 0; t < n; t++) {
    var v = total[t];
    if (v > peak)    peak   = v;
    if (v < trough)  trough = v;
    if (v >= bandFloor && v <= bandCeil) inBand++;
  }
  if (trough === Infinity) trough = 0;

  var firstInBand = null;
  for (var t2 = 7; t2 < n; t2++) {
    if (total[t2] >= ssTrough * 0.9 && firstInBand === null) firstInBand = Math.ceil(t2 / 7);
  }

  var totalMg = sched.reduce(function(s, inj){ return s + inj.dose; }, 0);

  return {
    peak:            peak,
    trough:          trough,
    ssTrough:        ssTrough,
    ssPeak:          ssPeak,
    bandFloor:       bandFloor,
    bandCeil:        bandCeil,
    inBandPct:       Math.round(inBand / n * 100),
    totalMg:         Math.round(totalMg),
    firstInBandWeek: firstInBand
  };
}

// ── Vermeulen free-T calculator ───────────────────────────────────────────────

function _tcVermeulenFT(totalT, shbg) {
  // totalT in nmol/L, shbg in nmol/L → returns calculated free T in pmol/L
  if (!totalT || !shbg || totalT <= 0 || shbg <= 0) return null;
  var K_SHBG = 5.97e8, K_ALB = 3.6e4;
  var alb    = 4.3 / 66500 * 10;   // 4.3 g/dL albumin, MW 66500 → mol/L
  var denom  = 1 + K_SHBG * (shbg * 1e-9) + K_ALB * alb;
  return (totalT * 1e-9 / denom) * 1e12;
}

// ── chart ─────────────────────────────────────────────────────────────────────

function _tcDrawChart(canvasId, total, stats) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var cycleDays = _tc.cycleDays;
  var multi     = _tc.compounds.length > 1;
  var lineColor = multi ? '#8899cc' : _tcCmpData(0).dot;

  var dpr  = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300;
  var cssH = 150;
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD = {top:12, right:14, bottom:26, left:52};
  var cW  = cssW - PAD.left - PAD.right;
  var cH  = cssH - PAD.top  - PAD.bottom;
  var totalWeeks = Math.ceil(cycleDays / 7);

  var maxV = stats ? stats.bandCeil * 1.1 : 0;
  for (var i = 0; i <= cycleDays; i++) if (total[i] > maxV) maxV = total[i];
  if (!maxV) {
    ctx.fillStyle = '#555'; ctx.font = '11px DM Sans,sans-serif';
    ctx.fillText('No data', 10, 40); return;
  }
  var vMax = maxV * 1.05;

  function xOf(t){ return PAD.left + (t / cycleDays) * cW; }
  function yOf(v){ return PAD.top  + cH - (v / vMax) * cH; }

  // Week grid
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
  for (var w = 0; w <= totalWeeks; w++) {
    var gx = xOf(w * 7);
    if (gx > PAD.left + cW + 1) break;
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + cH); ctx.stroke();
  }

  // Target band
  if (stats && stats.bandCeil > 0) {
    var by1 = yOf(stats.bandCeil), by2 = yOf(stats.bandFloor);
    ctx.fillStyle = 'rgba(34,204,102,0.09)';
    ctx.fillRect(PAD.left, by1, cW, by2 - by1);
    ctx.strokeStyle = 'rgba(34,204,102,0.4)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssTrough)); ctx.lineTo(PAD.left+cW, yOf(stats.ssTrough)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssPeak));   ctx.lineTo(PAD.left+cW, yOf(stats.ssPeak));   ctx.stroke();
    ctx.setLineDash([]);
  }

  // Y ticks
  var nTicks = 3;
  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'right';
  for (var ti = 0; ti <= nTicks; ti++) {
    var ty  = PAD.top + (cH / nTicks) * ti;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left + cW, ty); ctx.stroke();
    var tv  = vMax * (1 - ti / nTicks);
    var lbl = tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2);
    ctx.fillText(lbl, PAD.left - 4, ty + 3);
  }

  // Y label
  ctx.save(); ctx.translate(10, PAD.top + cH/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText('mg', 0, 0); ctx.restore();

  // Area fill
  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55');
  grad.addColorStop(1, lineColor + '00');
  ctx.beginPath();
  ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(total[t] || 0));
  ctx.lineTo(xOf(cycleDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Total curve line
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(total[0] || 0));
  for (var t2 = 1; t2 <= cycleDays; t2++) ctx.lineTo(xOf(t2), yOf(total[t2] || 0));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // Injection tick marks — color-coded per compound
  _tc._sched.forEach(function(inj) {
    var cdata = _tcCmpData(inj.ci);
    ctx.strokeStyle = cdata.dot + '99'; ctx.lineWidth = 1;
    var ix = xOf(inj.day);
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 5); ctx.stroke();
  });

  // X week labels
  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = totalWeeks <= 8 ? 1 : totalWeeks <= 16 ? 2 : 4;
  for (var w2 = 0; w2 <= totalWeeks; w2 += labelEvery) {
    var lx = xOf(w2 * 7);
    if (lx > PAD.left + cW + 8) break;
    ctx.fillText('W' + w2, lx, PAD.top + cH + 18);
  }
}

// ── update ────────────────────────────────────────────────────────────────────

function _tcUpdate() {
  _tc._sched = _tcGenSchedule();
  _tc._curve = _tcBuildCurve(_tc._sched);
  _tc._stats = _tcComputeStats(_tc._curve.total, _tc._sched);
  _tcRenderResults();
}

// ── results render ─────────────────────────────────────────────────────────────

function _tcRenderResults() {
  var el = document.getElementById('tc-results');
  if (!el) return;
  var stats = _tc._stats;
  var multi = _tc.compounds.length > 1;
  var html  = '';

  // Chart card
  var firstCdata = _tcCmpData(0);
  var chartColor = multi ? '#8899cc' : firstCdata.dot;
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:' + chartColor + '"></div>';
  html += '<div class="card-title">PREDICTED PLASMA CURVE</div></div>';
  if (!multi && firstCdata.halfLifeStr) {
    html += '<span style="font-size:10px;color:var(--muted2)">t½ ' + _esc(firstCdata.halfLifeStr) + '</span>';
  }
  html += '</div>';

  // Multi-compound legend
  if (multi) {
    html += '<div style="padding:4px 16px 0;display:flex;gap:14px;flex-wrap:wrap">';
    _tc.compounds.forEach(function(comp, ci) {
      var cdata = _tcCmpData(ci);
      html += '<span style="font-size:11px;color:var(--muted)">';
      html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + cdata.dot + ';margin-right:4px;vertical-align:middle"></span>';
      html += _esc(cdata.name) + '</span>';
    });
    html += '</div>';
  }

  html += '<div style="padding:2px 16px 10px"><canvas id="tc-chart" style="width:100%;display:block;"></canvas></div>';

  // Stats row
  if (stats) {
    html += '<div style="padding:0 16px 14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
    [
      {label:'PEAK',    value: Math.round(stats.peak)    + ' mg'},
      {label:'TROUGH',  value: Math.round(stats.trough)  + ' mg'},
      {label:'IN BAND', value: stats.inBandPct + '%'},
      {label:'TOTAL',   value: Math.round(stats.totalMg) + ' mg'}
    ].forEach(function(s) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:8px 10px;text-align:center">';
      html += '<div style="font-size:9px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">' + s.label + '</div>';
      html += '<div style="font-size:13px;font-weight:700;color:var(--text)">' + s.value + '</div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div style="padding:0 16px 14px;font-size:11px;color:var(--muted2)">';
    html += 'Steady-state band: ' + Math.round(stats.ssTrough) + '–' + Math.round(stats.ssPeak) + ' mg';
    if (stats.firstInBandWeek !== null) html += ' · enters band ~week ' + stats.firstInBandWeek;
    html += '</div>';
  }
  html += '</div>'; // end chart card

  // Schedule card
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#888"></div>';
  html += '<div class="card-title">INJECTION SCHEDULE</div></div>';
  html += '<span style="font-size:10px;color:var(--muted2);padding-right:2px">' + _tc._sched.length + ' injections</span>';
  html += '</div>';

  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="border-bottom:1px solid var(--border)">';
  ['DAY','WEEK','COMPOUND','DOSE'].forEach(function(h, i) {
    html += '<th style="padding:8px 16px;text-align:' + (i===3?'right':'left') + ';font-size:10px;color:var(--muted2);font-weight:600;letter-spacing:0.5px">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  _tc._sched.forEach(function(inj, i) {
    var cdata  = _tcCmpData(inj.ci);
    var isLast = i === _tc._sched.length - 1;
    var weekNum = Math.floor(inj.day / 7) + 1;
    html += '<tr style="border-bottom:' + (isLast ? 'none' : '1px solid var(--border)') + '">';
    html += '<td style="padding:7px 16px;color:var(--text)">Day ' + (inj.day + 1) + '</td>';
    html += '<td style="padding:7px 16px;color:var(--muted)">W' + weekNum + '</td>';
    html += '<td style="padding:7px 16px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + cdata.dot + ';margin-right:6px;vertical-align:middle"></span>' + _esc(cdata.name) + '</td>';
    html += '<td style="padding:7px 16px;text-align:right;font-weight:600;color:var(--text)">' + inj.dose + ' mg</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div style="padding:14px 16px">';
  html += '<button onclick="_tcExport()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:11px 20px;font-size:13px;font-weight:700;cursor:pointer;width:100%;font-family:inherit">Export as TRT Stack</button>';
  html += '</div>';
  html += '</div>'; // end schedule card

  el.innerHTML = html;
  requestAnimationFrame(function() {
    _tcDrawChart('tc-chart', _tc._curve.total, _tc._stats);
  });
}

// ── export ────────────────────────────────────────────────────────────────────

function _tcExport() {
  var cycleLengthWeeks = Math.round(_tc.cycleDays / 7);

  var compEntries = _tc.compounds.map(function(comp, ci) {
    var cdata    = _tcCmpData(ci);
    var interval = _tcCmpInterval(ci);
    var dpi      = _tcCmpDosePerInj(ci);
    var dpiStr   = String(Math.round(dpi * 10) / 10);
    if (interval <= 1.1)             return {id:cdata.id, name:cdata.name, dose:dpiStr, unit:'mg', days:[0,1,2,3,4,5,6]};
    if (Math.abs(interval-2)<0.2)    return {id:cdata.id, name:cdata.name, dose:dpiStr, unit:'mg', days:[1,3,5]};
    if (Math.abs(interval-7/3)<0.2)  return {id:cdata.id, name:cdata.name, dose:dpiStr, unit:'mg', days:[1,3,5]};
    if (Math.abs(interval-3.5)<0.2)  return {id:cdata.id, name:cdata.name, dose:dpiStr, unit:'mg', days:[1,4]};
    if (Math.abs(interval-7)<0.5)    return {id:cdata.id, name:cdata.name, dose:dpiStr, unit:'mg', days:[1]};
    return {id:cdata.id, name:cdata.name, dose:dpiStr, unit:'mg', freqVal:Math.round(interval), freqUnit:'days'};
  });

  var newStack = {
    name:         _tc.planName,
    cycle_length: cycleLengthWeeks,
    trt:          {enabled:true,  compounds:compEntries},
    peptides:     [],
    enhanced:     {enabled:false, compounds:[]},
    _tcalc:       true
  };

  if (typeof _userStacks !== 'undefined') {
    _userStacks.push(newStack);
    saveStacksToBackend();
    var btn = document.getElementById('tab-btn-stacks');
    if (btn) switchTab('stacks', btn);
    if (_tc.strategy === 'smooth-ramp') {
      setTimeout(function() {
        alert('Stack "' + newStack.name + '" created.\nNote: follow the ramp schedule in T-Calc for the first ' + _tc.rampWeeks + ' weeks.');
      }, 300);
    }
  }
}

// ── main render ───────────────────────────────────────────────────────────────

function buildTCalc() {
  var el = document.getElementById('tcalc-body');
  if (!el) return;

  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px;display:block';

  var cycleOpts = _TC_CYCLE_OPTS.map(function(c) {
    return '<option value="' + c.days + '"' + (c.days === _tc.cycleDays ? ' selected' : '') + '>' + _esc(c.label) + '</option>';
  }).join('');

  var html = '';
  html += '<div style="padding:12px 16px 4px;font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">Advanced testosterone cycle planner</div>';

  // ── Setup card ────────────────────────────────────────────────────────────
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#888"></div><div class="card-title">SETUP</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';
  html += '<div><label for="tc-name" style="' + lSty + '">Plan Name</label>';
  html += '<input id="tc-name" type="text" value="' + _esc(_tc.planName) + '" oninput="_tc.planName=this.value" style="' + iSty + '"></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Duration</label>';
  html += '<select onchange="_tc.cycleDays=+this.value;_tcUpdate()" style="' + iSty + '">' + cycleOpts + '</select></div>';
  html += '<div><label style="' + lSty + '">End Strategy</label>';
  html += '<select onchange="_tc.endStrategy=this.value" style="' + iSty + '">';
  html += '<option value="permanent"'   + (_tc.endStrategy==='permanent'    ?' selected':'') + '>Permanent TRT</option>';
  html += '<option value="blast-cruise"'+ (_tc.endStrategy==='blast-cruise' ?' selected':'') + '>Blast &amp; Cruise</option>';
  html += '<option value="pct"'         + (_tc.endStrategy==='pct'          ?' selected':'') + '>Full PCT</option>';
  html += '</select></div></div>';
  html += '</div></div>';

  // ── Calibration card ──────────────────────────────────────────────────────
  var cal      = _tc.cal;
  var ttNum    = parseFloat(cal.totalT)     || 0;
  var shbgNum  = parseFloat(cal.shbg)       || 0;
  var mftNum   = parseFloat(cal.measuredFT) || 0;
  var tgtFTNum = parseFloat(cal.targetFT)   || 0;
  var vermFT   = (ttNum > 0 && shbgNum > 0) ? _tcVermeulenFT(ttNum, shbgNum) : null;
  // Free T fraction: prefer measured, fall back to Vermeulen
  var ftFrac   = (mftNum > 0 && ttNum > 0) ? (mftNum / (ttNum * 1000))
               : (vermFT  && ttNum > 0)    ? (vermFT  / (ttNum * 1000))
               : null;
  var targetTT = (tgtFTNum > 0 && ftFrac > 0) ? (tgtFTNum / ftFrac / 1000) : null; // nmol/L needed

  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#cc8844"></div><div class="card-title">CALIBRATION</div></div>';
  html += '<span style="font-size:10px;color:var(--muted2)">bloodwork — optional</span>';
  html += '</div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Total T (nmol/L)</label>';
  html += '<input type="number" min="0" max="200" step="0.1" value="' + _esc(cal.totalT) + '" placeholder="e.g. 16.2" oninput="_tc.cal.totalT=this.value;buildTCalc()" style="' + iSty + '"></div>';
  html += '<div><label style="' + lSty + '">SHBG (nmol/L)</label>';
  html += '<input type="number" min="0" max="300" step="1" value="' + _esc(cal.shbg) + '" placeholder="e.g. 45" oninput="_tc.cal.shbg=this.value;buildTCalc()" style="' + iSty + '"></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Measured free T (pmol/L)</label>';
  html += '<input type="number" min="0" max="10000" step="1" value="' + _esc(cal.measuredFT) + '" placeholder="e.g. 223" oninput="_tc.cal.measuredFT=this.value;buildTCalc()" style="' + iSty + '"></div>';
  html += '<div><label style="' + lSty + '">Target free T (pmol/L)</label>';
  html += '<input type="number" min="0" max="10000" step="10" value="' + _esc(cal.targetFT) + '" placeholder="e.g. 1000" oninput="_tc.cal.targetFT=this.value;buildTCalc()" style="' + iSty + '"></div>';
  html += '</div>';

  // Derived info panel — only shown when at least one value is entered
  if (ttNum > 0 || mftNum > 0 || tgtFTNum > 0) {
    html += '<div style="background:var(--surface2);border-radius:8px;padding:12px 14px;font-size:11px;color:var(--muted);line-height:1.9">';
    if (vermFT !== null) {
      html += '<div>Vermeulen free T estimate: <b style="color:var(--text)">' + Math.round(vermFT) + ' pmol/L</b>';
      if (mftNum) html += ' <span style="color:var(--muted2)">(you measured: ' + Math.round(mftNum) + ' pmol/L)</span>';
      html += '</div>';
    }
    if (ftFrac !== null) {
      var fracSrc = (mftNum && ttNum) ? ' <span style="color:var(--muted2)">(from measured)</span>'
                 : vermFT             ? ' <span style="color:var(--muted2)">(Vermeulen estimate)</span>' : '';
      html += '<div>Free T fraction: <b style="color:var(--text)">' + (ftFrac * 100).toFixed(2) + '% of total T</b>' + fracSrc + '</div>';
    }
    if (targetTT !== null) {
      html += '<div>To reach <b style="color:var(--text)">' + Math.round(tgtFTNum) + ' pmol/L</b> free T → need ~<b style="color:var(--accent)">' + targetTT.toFixed(1) + ' nmol/L</b> total T</div>';
      if (ttNum > 0) {
        html += '<div style="color:var(--muted2);font-size:10px;margin-top:2px">That\'s +' + (targetTT - ttNum).toFixed(1) + ' nmol/L above your current baseline. The mg/week needed to achieve that depends on your individual pharmacokinetics — use the compound controls below to simulate.</div>';
      }
    }
    if (vermFT !== null && mftNum > 0 && Math.abs(vermFT - mftNum) / mftNum > 0.15) {
      html += '<div style="color:var(--muted2);font-size:10px;margin-top:4px">ℹ The Vermeulen vs measured discrepancy is normal — assay methods differ. Your measured value is the better baseline.</div>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:11px;color:var(--muted2)">Enter values from your bloodwork to see free T analysis. Leave blank if no bloodwork available.</div>';
  }

  html += '</div></div>'; // end calibration card

  // ── Compounds card ────────────────────────────────────────────────────────
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:' + _tcCmpData(0).dot + '"></div><div class="card-title">COMPOUNDS</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">';

  _tc.compounds.forEach(function(comp, ci) {
    var cdata  = _tcCmpData(ci);
    var longIv = _tcCmpLong(ci);

    var compOpts = TRT_CAT.map(function(c) {
      return '<option value="' + c.id + '"' + (c.id === comp.compId ? ' selected' : '') + '>' + _esc(c.name) + '</option>';
    }).join('');

    var freqOpts = _TC_FREQ_OPTS.map(function(f, fi) {
      return '<option value="' + fi + '"' + (fi === comp.freqIdx ? ' selected' : '') + '>' + _esc(f.label) + '</option>';
    }).join('');

    html += '<div style="background:var(--surface2);border-radius:8px;padding:12px 14px">';

    // Compound header row
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
    html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + cdata.dot + ';flex-shrink:0"></span>';
    html += '<span style="font-size:11px;font-weight:700;color:var(--muted2);text-transform:uppercase;letter-spacing:0.5px">' + _esc(cdata.name) + '</span>';
    if (cdata.halfLifeStr) html += '<span style="font-size:10px;color:var(--muted2);margin-left:auto">t½ ' + _esc(cdata.halfLifeStr) + '</span>';
    if (_tc.compounds.length > 1) {
      html += '<button onclick="_tcRemoveCompound(' + ci + ')" title="Remove compound" style="background:none;border:none;color:var(--muted2);font-size:18px;cursor:pointer;padding:0 0 0 6px;line-height:1;' + (cdata.halfLifeStr ? '' : 'margin-left:auto') + '">×</button>';
    }
    html += '</div>';

    html += '<div style="margin-bottom:10px"><label style="' + lSty + '">Compound</label>';
    html += '<select onchange="_tc.compounds[' + ci + '].compId=this.value;buildTCalc()" style="' + iSty + '">' + compOpts + '</select></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    if (longIv) {
      html += '<div><label style="' + lSty + '">Dose per injection</label>';
      html += '<div style="display:flex;gap:6px;align-items:center">';
      html += '<input type="number" min="50" max="2000" step="25" value="' + comp.dosePerInj + '" oninput="_tc.compounds[' + ci + '].dosePerInj=+this.value;_tcUpdate()" style="' + iSty + ';flex:1">';
      html += '<span style="font-size:12px;color:var(--muted);white-space:nowrap">mg</span></div></div>';
    } else {
      html += '<div><label style="' + lSty + '">Target dose</label>';
      html += '<div style="display:flex;gap:6px;align-items:center">';
      html += '<input type="number" min="10" max="2000" step="10" value="' + comp.dosePerWeek + '" oninput="_tc.compounds[' + ci + '].dosePerWeek=+this.value;_tcUpdate()" style="' + iSty + ';flex:1">';
      html += '<span style="font-size:12px;color:var(--muted);white-space:nowrap">mg/wk</span></div></div>';
    }

    html += '<div><label style="' + lSty + '">Frequency</label>';
    html += '<select onchange="_tc.compounds[' + ci + '].freqIdx=+this.value;buildTCalc()" style="' + iSty + '">' + freqOpts + '</select></div>';
    html += '</div>';

    if (!longIv && comp.dosePerWeek > 0) {
      var perInj = Math.round(_tcCmpDosePerInj(ci) * 10) / 10;
      html += '<div style="font-size:11px;color:var(--muted2);margin-top:8px">= ' + perInj + ' mg per injection</div>';
    }

    html += '</div>'; // end compound item
  });

  if (_tc.compounds.length < 4) {
    html += '<button onclick="_tcAddCompound()" style="width:100%;background:none;border:1px dashed var(--border);border-radius:8px;padding:10px;color:var(--muted);font-size:12px;cursor:pointer;font-family:inherit">+ Add Compound</button>';
  }

  html += '</div></div>'; // end compounds card

  // ── Strategy card ─────────────────────────────────────────────────────────
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#6688cc"></div><div class="card-title">STRATEGY</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  [
    {id:'smooth-ramp', label:'Smooth Ramp',    desc:'Gradual dose increase — no initial spike'},
    {id:'constant',    label:'Constant',        desc:'Fixed dose — natural accumulation to steady state'}
  ].forEach(function(s) {
    var on = _tc.strategy === s.id;
    html += '<button onclick="_tc.strategy=\'' + s.id + '\';document.querySelectorAll(\'.tc-sb\').forEach(function(b){b.style.background=\'var(--surface2)\';b.style.color=\'var(--text)\';b.style.borderColor=\'var(--border)\'});this.style.background=\'#6688cc\';this.style.color=\'#fff\';this.style.borderColor=\'#6688cc\';_tcUpdate()" class="tc-sb" style="background:' + (on?'#6688cc':'var(--surface2)') + ';color:' + (on?'#fff':'var(--text)') + ';border:1px solid ' + (on?'#6688cc':'var(--border)') + ';border-radius:8px;padding:10px 12px;cursor:pointer;font-family:inherit;text-align:left">';
    html += '<div style="font-size:12px;font-weight:700;margin-bottom:3px">' + _esc(s.label) + '</div>';
    html += '<div style="font-size:10px;opacity:0.75;line-height:1.3">' + _esc(s.desc) + '</div>';
    html += '</button>';
  });
  html += '</div>';

  if (_tc.strategy === 'smooth-ramp') {
    html += '<div><label style="' + lSty + '">Ramp duration</label>';
    html += '<div style="display:flex;gap:10px;align-items:center">';
    html += '<input type="range" min="2" max="16" step="1" value="' + _tc.rampWeeks + '" oninput="_tc.rampWeeks=+this.value;document.getElementById(\'tc-rv\').textContent=this.value+\' weeks\';_tcUpdate()" style="flex:1;accent-color:#6688cc">';
    html += '<span id="tc-rv" style="font-size:13px;color:var(--text);min-width:56px">' + _tc.rampWeeks + ' weeks</span>';
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--muted2);margin-top:4px">Starts at 20% of target dose, reaches 100% by week ' + _tc.rampWeeks + '</div>';
    html += '</div>';
  }

  html += '</div></div>'; // end strategy card

  html += '<div id="tc-results"></div>';
  el.innerHTML = html;
  _tcUpdate();
}
