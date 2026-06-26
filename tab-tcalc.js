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
  planName:     'My TRT Protocol',
  cycleDays:    168,
  compId:       'cypionate',
  freqIdx:      3,       // index into _TC_FREQ_OPTS — default 2×/week
  dosePerWeek:  150,     // mg/week (used when interval ≤ 14 days)
  dosePerInj:   250,     // mg per injection (used when interval > 14 days)
  strategy:     'smooth-ramp',
  rampWeeks:    6,
  endStrategy:  'permanent',
  // Computed
  _sched: [],
  _curve: null,
  _stats: null
};

function _tcInterval()    { return _TC_FREQ_OPTS[_tc.freqIdx].days; }
function _tcLongInterval(){ return _tcInterval() > 14; }
function _tcDosePerInj()  {
  return _tcLongInterval()
    ? _tc.dosePerInj
    : _tc.dosePerWeek / (7 / _tcInterval());
}

function _tcCompData() {
  var cat   = TRT_CAT.find(function(c){ return c.id === _tc.compId; });
  var guide = TRT_GUIDE[_tc.compId];
  var hl    = guide ? (_parseHalfLifeDays(guide.halfLife) || 7) : 7;
  return {
    id:           _tc.compId,
    name:         cat  ? cat.name  : _tc.compId,
    dot:          cat  ? cat.dot   : '#e8a020',
    halfLifeDays: hl,
    halfLifeStr:  guide ? guide.halfLife : ''
  };
}

function _tcGenSchedule() {
  var dosePerInj = _tcDosePerInj();
  var interval   = _tcInterval();
  var sched      = [];

  if (_tc.strategy === 'smooth-ramp') {
    var startPerInj = dosePerInj * 0.2;
    var d = 0;
    while (d < _tc.cycleDays) {
      var prog  = Math.min(1, (d / 7) / _tc.rampWeeks);
      var dose  = startPerInj + (dosePerInj - startPerInj) * prog;
      sched.push({day: Math.round(d), dose: Math.round(dose * 10) / 10});
      d += interval;
    }
  } else {
    var d = 0;
    while (d < _tc.cycleDays) {
      sched.push({day: Math.round(d), dose: Math.round(dosePerInj * 10) / 10});
      d += interval;
    }
  }
  return sched;
}

function _tcBuildCurve(sched) {
  var comp = _tcCompData();
  var k    = Math.LN2 / comp.halfLifeDays;
  var curve = new Float64Array(_tc.cycleDays + 1);
  for (var t = 0; t <= _tc.cycleDays; t++) {
    var c = 0;
    for (var j = 0; j < sched.length; j++) {
      if (sched[j].day <= t) c += sched[j].dose * Math.exp(-k * (t - sched[j].day));
    }
    curve[t] = c;
  }
  return curve;
}

function _tcComputeStats(curve, sched) {
  var comp      = _tcCompData();
  var k         = Math.LN2 / comp.halfLifeDays;
  var interval  = _tcInterval();
  var dosePerInj = _tcDosePerInj();
  var expKT     = Math.exp(k * interval);

  // Steady-state target band
  var ssTrough = dosePerInj / (expKT - 1);
  var ssPeak   = ssTrough + dosePerInj;
  var bandFloor = ssTrough * 0.85;
  var bandCeil  = ssPeak  * 1.15;

  var peak = 0, trough = Infinity, inBand = 0;
  for (var t = 0; t <= _tc.cycleDays; t++) {
    var v = curve[t];
    if (v > peak)   peak  = v;
    if (v < trough) trough = v;
    if (v >= bandFloor && v <= bandCeil) inBand++;
  }
  if (trough === Infinity) trough = 0;

  // First week curve enters the steady-state trough (rough heuristic)
  var firstInBand = null;
  for (var t = 7; t <= _tc.cycleDays; t++) {
    if (curve[t] >= ssTrough * 0.9 && firstInBand === null) {
      firstInBand = Math.ceil(t / 7);
    }
  }

  var totalMg = sched.reduce(function(s, inj) { return s + inj.dose; }, 0);

  return {
    peak:          peak,
    trough:        trough,
    ssTrough:      ssTrough,
    ssPeak:        ssPeak,
    bandFloor:     bandFloor,
    bandCeil:      bandCeil,
    inBandPct:     Math.round(inBand / (_tc.cycleDays + 1) * 100),
    totalMg:       Math.round(totalMg),
    firstInBandWeek: firstInBand
  };
}

function _tcDrawChart(canvasId, curve, stats) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var comp     = _tcCompData();
  var color    = comp.dot;
  var cycleDays = _tc.cycleDays;

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
  for (var i = 0; i <= cycleDays; i++) if (curve[i] > maxV) maxV = curve[i];
  if (!maxV) { ctx.fillStyle='#555'; ctx.font='11px DM Sans,sans-serif'; ctx.fillText('No data',10,40); return; }
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
    ctx.setLineDash([4,4]);
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
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(curve[t] || 0));
  ctx.lineTo(xOf(cycleDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(curve[0] || 0));
  for (var t = 1; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(curve[t] || 0));
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // Injection tick marks at bottom
  ctx.strokeStyle = color + '99'; ctx.lineWidth = 1;
  _tc._sched.forEach(function(inj) {
    var ix = xOf(inj.day);
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 4); ctx.stroke();
  });

  // X week labels
  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = totalWeeks <= 8 ? 1 : totalWeeks <= 16 ? 2 : 4;
  for (var w = 0; w <= totalWeeks; w += labelEvery) {
    var lx = xOf(w * 7);
    if (lx > PAD.left + cW + 8) break;
    ctx.fillText('W' + w, lx, PAD.top + cH + 18);
  }
}

function _tcUpdate() {
  _tc._sched = _tcGenSchedule();
  _tc._curve = _tcBuildCurve(_tc._sched);
  _tc._stats = _tcComputeStats(_tc._curve, _tc._sched);
  _tcRenderResults();
}

function _tcRenderResults() {
  var el = document.getElementById('tc-results');
  if (!el) return;
  var stats = _tc._stats;
  var comp  = _tcCompData();
  var html  = '';

  // Chart card
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:' + comp.dot + '"></div>';
  html += '<div class="card-title">PREDICTED PLASMA CURVE</div></div>';
  if (comp.halfLifeStr) html += '<span style="font-size:10px;color:var(--muted2)">t½ ' + _esc(comp.halfLifeStr) + '</span>';
  html += '</div>';
  html += '<div style="padding:2px 16px 10px"><canvas id="tc-chart" style="width:100%;display:block;"></canvas></div>';

  // Stats row
  if (stats) {
    html += '<div style="padding:0 16px 14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
    [
      {label:'PEAK',    value: Math.round(stats.peak)   + ' mg'},
      {label:'TROUGH',  value: Math.round(stats.trough) + ' mg'},
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
    var isLast = i === _tc._sched.length - 1;
    var weekNum = Math.floor(inj.day / 7) + 1;
    html += '<tr style="border-bottom:' + (isLast ? 'none' : '1px solid var(--border)') + '">';
    html += '<td style="padding:7px 16px;color:var(--text)">Day ' + (inj.day + 1) + '</td>';
    html += '<td style="padding:7px 16px;color:var(--muted)">W' + weekNum + '</td>';
    html += '<td style="padding:7px 16px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + comp.dot + ';margin-right:6px;vertical-align:middle"></span>' + _esc(comp.name) + '</td>';
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
    _tcDrawChart('tc-chart', _tc._curve, _tc._stats);
  });
}

function _tcExport() {
  var comp       = _tcCompData();
  var interval   = _tcInterval();
  var dosePerInj = _tcDosePerInj();

  // Map injection interval to days-of-week array (for short intervals)
  var compEntry;
  if (interval <= 1.1) {
    compEntry = {id:comp.id, name:comp.name, dose:String(Math.round(dosePerInj*10)/10), unit:'mg', days:[0,1,2,3,4,5,6]};
  } else if (Math.abs(interval - 2) < 0.2) {
    compEntry = {id:comp.id, name:comp.name, dose:String(Math.round(dosePerInj*10)/10), unit:'mg', days:[1,3,5]};
  } else if (Math.abs(interval - 3.5) < 0.2) {
    compEntry = {id:comp.id, name:comp.name, dose:String(Math.round(dosePerInj*10)/10), unit:'mg', days:[1,4]};
  } else if (Math.abs(interval - 7) < 0.5) {
    compEntry = {id:comp.id, name:comp.name, dose:String(Math.round(dosePerInj*10)/10), unit:'mg', days:[1]};
  } else {
    // Long-interval: use freqVal/freqUnit
    var freqDays = Math.round(interval);
    compEntry = {id:comp.id, name:comp.name, dose:String(Math.round(dosePerInj*10)/10), unit:'mg', freqVal:freqDays, freqUnit:'days'};
  }

  var cycleLengthWeeks = Math.round(_tc.cycleDays / 7);
  var newStack = {
    name: _tc.planName,
    cycle_length: cycleLengthWeeks,
    trt:      {enabled:true,  compounds:[compEntry]},
    peptides: [],
    enhanced: {enabled:false, compounds:[]},
    _tcalc:   true
  };

  if (typeof _userStacks !== 'undefined') {
    _userStacks.push(newStack);
    saveStacksToBackend();
    var btn = document.getElementById('tab-btn-stacks');
    if (btn) switchTab('stacks', btn);
    setTimeout(function() {
      alert('Stack "' + newStack.name + '" created with the steady-state maintenance dose.\nNote: follow the ramp schedule shown in T-Calc for the first ' + _tc.rampWeeks + ' weeks.');
    }, 300);
  }
}

function buildTCalc() {
  var el = document.getElementById('tcalc-body');
  if (!el) return;

  var comp  = _tcCompData();
  var guide = TRT_GUIDE[_tc.compId];

  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px;display:block';

  var compOpts = TRT_CAT.map(function(c) {
    return '<option value="' + c.id + '"' + (c.id === _tc.compId ? ' selected' : '') + '>' + _esc(c.name) + '</option>';
  }).join('');

  var freqOpts = _TC_FREQ_OPTS.map(function(f, i) {
    return '<option value="' + i + '"' + (i === _tc.freqIdx ? ' selected' : '') + '>' + _esc(f.label) + '</option>';
  }).join('');

  var cycleOpts = _TC_CYCLE_OPTS.map(function(c) {
    return '<option value="' + c.days + '"' + (c.days === _tc.cycleDays ? ' selected' : '') + '>' + _esc(c.label) + '</option>';
  }).join('');

  var html = '';
  html += '<div style="padding:12px 16px 4px;font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">Advanced testosterone cycle planner</div>';

  // ── Setup card
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#888"></div><div class="card-title">SETUP</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';
  html += '<div><label for="tc-name" style="' + lSty + '">Plan Name</label>';
  html += '<input id="tc-name" type="text" value="' + _esc(_tc.planName) + '" oninput="_tc.planName=this.value" style="' + iSty + '"></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Duration</label>';
  html += '<select onchange="_tc.cycleDays=+this.value;_tcUpdate()" style="' + iSty + '">' + cycleOpts + '</select></div>';
  html += '<div><label style="' + lSty + '">End Strategy</label>';
  html += '<select onchange="_tc.endStrategy=this.value" style="' + iSty + '">';
  html += '<option value="permanent"' + (_tc.endStrategy==='permanent'?' selected':'') + '>Permanent TRT</option>';
  html += '<option value="blast-cruise"' + (_tc.endStrategy==='blast-cruise'?' selected':'') + '>Blast &amp; Cruise</option>';
  html += '<option value="pct"' + (_tc.endStrategy==='pct'?' selected':'') + '>Full PCT</option>';
  html += '</select></div></div>';
  html += '</div></div>'; // end setup card

  // ── Compound card
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:' + comp.dot + '"></div><div class="card-title">COMPOUND</div></div>';
  if (comp.halfLifeStr) html += '<span style="font-size:10px;color:var(--muted2)">t½ ' + _esc(comp.halfLifeStr) + '</span>';
  html += '</div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';
  html += '<div><label style="' + lSty + '">Compound</label>';
  html += '<select onchange="_tc.compId=this.value;buildTCalc()" style="' + iSty + '">' + compOpts + '</select></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

  if (_tcLongInterval()) {
    html += '<div><label style="' + lSty + '">Dose per injection</label>';
    html += '<div style="display:flex;gap:6px;align-items:center">';
    html += '<input type="number" min="50" max="2000" step="25" value="' + _tc.dosePerInj + '" oninput="_tc.dosePerInj=+this.value;_tcUpdate()" style="' + iSty + ';flex:1">';
    html += '<span style="font-size:12px;color:var(--muted);white-space:nowrap">mg</span></div></div>';
  } else {
    html += '<div><label style="' + lSty + '">Target dose</label>';
    html += '<div style="display:flex;gap:6px;align-items:center">';
    html += '<input type="number" min="10" max="2000" step="10" value="' + _tc.dosePerWeek + '" oninput="_tc.dosePerWeek=+this.value;_tcUpdate()" style="' + iSty + ';flex:1">';
    html += '<span style="font-size:12px;color:var(--muted);white-space:nowrap">mg/wk</span></div></div>';
  }

  html += '<div><label style="' + lSty + '">Frequency</label>';
  html += '<select onchange="_tc.freqIdx=+this.value;buildTCalc()" style="' + iSty + '">' + freqOpts + '</select></div>';
  html += '</div>'; // end grid

  // Show per-inj dose for reference when short interval
  if (!_tcLongInterval() && _tc.dosePerWeek > 0) {
    var perInj = Math.round((_tc.dosePerWeek / (7 / _tcInterval())) * 10) / 10;
    html += '<div style="font-size:11px;color:var(--muted2)">= ' + perInj + ' mg per injection</div>';
  }

  html += '</div></div>'; // end compound card

  // ── Strategy card
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#6688cc"></div><div class="card-title">STRATEGY</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  [
    {id:'smooth-ramp', label:'Smooth Ramp',    desc:'Gradual dose increase — no initial spike'},
    {id:'constant',    label:'Constant',        desc:'Fixed dose — natural accumulation to steady state'}
  ].forEach(function(s) {
    var on = _tc.strategy === s.id;
    html += '<button onclick="_tc.strategy=\'' + s.id + '\';document.querySelectorAll(\'.tc-sb\').forEach(function(b){b.dataset.on=\'0\';b.style.background=\'var(--surface2)\';b.style.color=\'var(--text)\';b.style.borderColor=\'var(--border)\'});this.dataset.on=\'1\';this.style.background=\'#6688cc\';this.style.color=\'#fff\';this.style.borderColor=\'#6688cc\';_tcUpdate()" class="tc-sb" data-on="' + (on?'1':'0') + '" style="background:' + (on?'#6688cc':'var(--surface2)') + ';color:' + (on?'#fff':'var(--text)') + ';border:1px solid ' + (on?'#6688cc':'var(--border)') + ';border-radius:8px;padding:10px 12px;cursor:pointer;font-family:inherit;text-align:left">';
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

  // Results placeholder
  html += '<div id="tc-results"></div>';

  el.innerHTML = html;
  _tcUpdate();
}
