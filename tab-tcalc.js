// tab-tcalc.js — Smart T-Calc: goal-based PK optimizer

// ── Profile state (persisted to backend + localStorage cache) ─────────────────

var _tcp = {
  totalT:          '',    // nmol/L — current total T from bloodwork
  shbg:            '',    // nmol/L — SHBG from bloodwork
  measuredFT:      '',    // pmol/L — measured free T
  currentDoseMgWk: '',    // mg/week at time of bloodwork (calibration anchor)
  targetFT:        '',    // pmol/L — desired steady-state free T
  inventory:       [],    // [{compId, totalMg}]
  cycleType:       'trt', // 'trt' | 'blast-cruise' | 'pct'
  cycleDays:       168,
  preferredFreqDays: 'auto'
};

var _tcpSessionLoaded = false;
var _tcCurrentPlan    = null;  // cached by buildTCalc() for export

// ── Frequency options ─────────────────────────────────────────────────────────

var _TC_FREQ_OPTS = [
  {label:'Daily',            days:1},
  {label:'EOD',              days:2},
  {label:'3×/week',          days:7/3},
  {label:'2×/week',          days:3.5},
  {label:'Weekly',           days:7},
  {label:'Every 10 days',    days:10},
  {label:'Every 2 weeks',    days:14},
  {label:'Every 3 weeks',    days:21},
  {label:'Every 6 weeks',    days:42},
  {label:'Every 8 weeks',    days:56},
  {label:'Every 10 weeks',   days:70},
  {label:'Every 12 weeks',   days:84}
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

// ── Backend sync ──────────────────────────────────────────────────────────────

function _tcLoadProfile() {
  var cached = getData('tc-profile');
  if (cached) {
    try { Object.assign(_tcp, JSON.parse(cached)); } catch(e) {}
  }
  var h = (typeof authHeaders === 'function') ? authHeaders() : null;
  if (!h) return;
  fetch(AGENT_URL + '/tcalc-profile', {headers: h})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d) {
      if (!d || Object.keys(d).length === 0) return;
      Object.assign(_tcp, d);
      setData('tc-profile', JSON.stringify(_tcp));
      buildTCalc();
    })
    .catch(function(){});
}

function _tcSaveProfile() {
  setData('tc-profile', JSON.stringify(_tcp));
  var h = (typeof authHeaders === 'function') ? authHeaders() : null;
  if (!h) return;
  fetch(AGENT_URL + '/tcalc-profile', {
    method: 'POST',
    headers: Object.assign({'Content-Type':'application/json'}, h),
    body: JSON.stringify(_tcp)
  }).catch(function(){});
}

// ── Compound helpers ──────────────────────────────────────────────────────────

function _tcCompInfo(compId) {
  if (compId === 'hcg') {
    return {id:'hcg', name:'HCG', dot:'#44cc88', halfLifeDays:2.5, halfLifeStr:'~60 hours'};
  }
  var cat   = (typeof TRT_CAT   !== 'undefined') ? TRT_CAT.find(function(x){ return x.id === compId; })   : null;
  var guide = (typeof TRT_GUIDE !== 'undefined') ? TRT_GUIDE[compId] : null;
  var hl    = guide ? (_parseHalfLifeDays(guide.halfLife) || 7) : 7;
  return {
    id:           compId,
    name:         cat   ? cat.name  : compId,
    dot:          cat   ? cat.dot   : '#e8a020',
    halfLifeDays: hl,
    halfLifeStr:  guide ? guide.halfLife : ''
  };
}

// ── Vermeulen free-T calculator ───────────────────────────────────────────────

function _tcVermeulenFT(totalT, shbg) {
  if (!totalT || !shbg || totalT <= 0 || shbg <= 0) return null;
  var K_SHBG = 5.97e8, K_ALB = 3.6e4;
  var alb    = 4.3 / 66500 * 10;  // 4.3 g/dL → mol/L
  var denom  = 1 + K_SHBG * (shbg * 1e-9) + K_ALB * alb;
  return (totalT * 1e-9 / denom) * 1e12;  // pmol/L
}

// ── PK helpers ────────────────────────────────────────────────────────────────

// Peak:trough ratio for fixed-interval dosing = e^(k × interval)
function _tcPeakTroughRatio(halfLifeDays, intervalDays) {
  return Math.exp(Math.LN2 / halfLifeDays * intervalDays);
}

// Snap a target interval (days) to the nearest standard option
function _tcSnapInterval(targetDays) {
  var opts = [1, 2, 7/3, 3.5, 7, 10, 14, 21, 42, 56, 70, 84];
  var best = opts[0], bestDist = Infinity;
  opts.forEach(function(d) {
    var dist = Math.abs(d - targetDays);
    if (dist < bestDist) { bestDist = dist; best = d; }
  });
  return best;
}

function _tcIntervalLabel(days) {
  var opt = _TC_FREQ_OPTS.find(function(f){ return Math.abs(f.days - days) < 0.25; });
  return opt ? opt.label : days.toFixed(1) + '-day interval';
}

// ── OPTIMIZER ─────────────────────────────────────────────────────────────────
// Returns {plan, suggestions[], warnings[], calibration}

function _tcOptimize() {
  var result = {plan: null, suggestions: [], warnings: [], calibration: {}};

  var ttNum   = parseFloat(_tcp.totalT)          || 0;
  var shbgNum = parseFloat(_tcp.shbg)            || 0;
  var mftNum  = parseFloat(_tcp.measuredFT)      || 0;
  var curDose = parseFloat(_tcp.currentDoseMgWk) || 0;
  var tgtFT   = parseFloat(_tcp.targetFT)        || 0;

  var vermFT  = (ttNum > 0 && shbgNum > 0) ? _tcVermeulenFT(ttNum, shbgNum) : null;
  var ftFrac  = null;
  if (mftNum > 0 && ttNum > 0)    ftFrac = mftNum / (ttNum * 1000);
  else if (vermFT && ttNum > 0)   ftFrac = vermFT  / (ttNum * 1000);

  var targetTT = (tgtFT > 0 && ftFrac > 0) ? (tgtFT / ftFrac / 1000) : null;
  var mgToNmol = (curDose > 0 && ttNum > 0) ? (ttNum / curDose) : null;

  result.calibration = {ttNum:ttNum, shbgNum:shbgNum, mftNum:mftNum, curDose:curDose,
                        tgtFT:tgtFT, vermFT:vermFT, ftFrac:ftFrac,
                        targetTT:targetTT, mgToNmol:mgToNmol};

  // ── Always suggest HCG ────────────────────────────────────────────────────
  var hasHCG = _tcp.inventory.some(function(inv){ return inv.compId === 'hcg'; });
  result.suggestions.push(hasHCG ? {
    type: 'hcg-included', priority: 0,
    message: 'HCG is in your inventory. Add 500–1000 IU 2×/week to maintain testicular function and intratesticular testosterone — standard practice on any TRT protocol.'
  } : {
    type: 'hcg-missing', priority: 1,
    message: 'T-Calc recommends adding HCG (500–1000 IU 2×/week) to any TRT protocol. HCG prevents testicular atrophy, preserves intratesticular testosterone, and maintains fertility during HPTA suppression.'
  });

  // ── Pick best testosterone ester from inventory ───────────────────────────
  var testInv = _tcp.inventory.filter(function(inv){ return inv.compId !== 'hcg'; });

  if (testInv.length === 0) {
    result.suggestions.push({
      type: 'no-inventory', priority: 2,
      message: 'Add your available testosterone compounds to the inventory below to generate a personalized injection schedule.'
    });
    return result;
  }

  // Target injection interval: user preference or auto (default 3.5 days)
  var prefDays = (_tcp.preferredFreqDays === 'auto') ? 3.5 : (parseFloat(_tcp.preferredFreqDays) || 3.5);

  // For each ester compute optimal interval that gives peak:trough ≤ 1.5:
  //   interval_opt = ln(1.5) / k = ln(1.5) × t½ / ln(2) ≈ 0.585 × t½
  // Score by how far the optimal interval is from the preferred frequency.
  var bestInv = null, bestScore = Infinity;
  testInv.forEach(function(inv) {
    var cd  = _tcCompInfo(inv.compId);
    var opt = 0.585 * cd.halfLifeDays;
    var score = Math.abs(opt - prefDays);
    if (score < bestScore) { bestScore = score; bestInv = {inv:inv, cd:cd, optInterval:opt}; }
  });

  var chosenInterval = _tcSnapInterval(bestInv.optInterval);
  var ptr = _tcPeakTroughRatio(bestInv.cd.halfLifeDays, chosenInterval);

  // ── Derive required weekly dose ───────────────────────────────────────────
  var reqMgPerWeek, doseSource;

  if (targetTT !== null && mgToNmol !== null) {
    reqMgPerWeek = targetTT / mgToNmol;
    doseSource   = 'personal';
  } else if (targetTT !== null) {
    // Population-average: ~0.20 nmol/L per mg/week (rough; ±50% individual variation)
    reqMgPerWeek = targetTT / 0.20;
    doseSource   = 'population';
    result.suggestions.push({
      type: 'calibration-estimate', priority: 3,
      message: 'Dose estimate uses a population average (±50% accuracy). Enter your current weekly dose alongside your bloodwork for a personalised calculation.'
    });
  } else if (tgtFT > 0) {
    reqMgPerWeek = 150;
    doseSource   = 'default';
    result.suggestions.push({
      type: 'need-bloodwork', priority: 2,
      message: 'Enter your Total T from bloodwork to enable personalised dosing. Showing 150 mg/week as a common TRT starting dose.'
    });
  } else {
    reqMgPerWeek = 150;
    doseSource   = 'default';
    result.suggestions.push({
      type: 'using-default', priority: 3,
      message: 'Enter bloodwork values and a target free T to get a personalised dose recommendation. Showing 150 mg/week as a starting estimate.'
    });
  }

  reqMgPerWeek = Math.max(50, Math.min(600, reqMgPerWeek));

  // ── Check inventory coverage ──────────────────────────────────────────────
  var availableMg   = parseFloat(bestInv.inv.totalMg) || 0;
  var effectiveCycle = _tcp.cycleDays;

  if (availableMg > 0) {
    var weeksAvail = availableMg / reqMgPerWeek;
    if (weeksAvail < _tcp.cycleDays / 7 * 0.9) {
      effectiveCycle = Math.max(28, Math.floor(weeksAvail) * 7);
      result.suggestions.push({
        type: 'insufficient-inventory', priority: 1,
        message: bestInv.cd.name + ' inventory (' + Math.round(availableMg) + ' mg) covers ~' +
                 Math.floor(weeksAvail) + ' weeks at ' + Math.round(reqMgPerWeek) + ' mg/week. ' +
                 'Schedule generated for available quantity.'
      });
    }
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (ptr > 2.5) {
    result.warnings.push({
      type: 'high-peak-trough',
      message: 'Peak:trough ratio ' + ptr.toFixed(1) + '× exceeds the 2.5× safety threshold at this injection interval. ' +
               'Consider injecting more frequently or switching to a shorter ester.'
    });
  }

  if (targetTT !== null) {
    var dpi         = reqMgPerWeek * chosenInterval / 7;
    var eKT         = Math.exp(Math.LN2 / bestInv.cd.halfLifeDays * chosenInterval);
    var ssTrough_mg = dpi / (eKT - 1);
    // Convert ss trough to nmol/L using mgToNmol (if available)
    if (mgToNmol !== null && ssTrough_mg * mgToNmol / (7 / chosenInterval) < targetTT * 0.60) {
      result.warnings.push({
        type: 'trough-below-target',
        message: 'Predicted trough is below 60% of your target total T. Increase injection frequency to raise the trough.'
      });
    }
  }

  result.plan = {
    compId:          bestInv.cd.id,
    cd:              bestInv.cd,
    intervalDays:    chosenInterval,
    dosePerInj:      Math.round(reqMgPerWeek * chosenInterval / 7 * 10) / 10,
    reqMgPerWeek:    Math.round(reqMgPerWeek),
    peakTroughRatio: ptr,
    cycleDays:       effectiveCycle,
    doseSource:      doseSource,
    ftFrac:          ftFrac
  };

  return result;
}

// ── PK schedule + curve ───────────────────────────────────────────────────────

function _tcBuildSchedule(plan) {
  var rampWeeks = Math.min(6, Math.max(2, Math.round(plan.cycleDays / 7 / 4)));
  var sched = [], d = 0;
  while (d < plan.cycleDays) {
    var prog = Math.min(1, (d / 7) / rampWeeks);
    var dose = plan.dosePerInj * (0.3 + 0.7 * prog);
    sched.push({day: Math.round(d), dose: Math.round(dose * 10) / 10, compId: plan.compId});
    d += plan.intervalDays;
  }
  return sched;
}

function _tcBuildCurve(sched, plan) {
  var k = Math.LN2 / plan.cd.halfLifeDays;
  var n = plan.cycleDays + 1;
  var total = new Float64Array(n);
  for (var t = 0; t < n; t++) {
    var c = 0;
    for (var j = 0; j < sched.length; j++) {
      if (sched[j].day <= t) c += sched[j].dose * Math.exp(-k * (t - sched[j].day));
    }
    total[t] = c;
  }
  return total;
}

function _tcComputeStats(total, sched, plan) {
  var k   = Math.LN2 / plan.cd.halfLifeDays;
  var iv  = plan.intervalDays, dpi = plan.dosePerInj;
  var eKT = Math.exp(k * iv);
  var ssTrough = dpi / (eKT - 1), ssPeak = ssTrough + dpi;
  var bandFloor = ssTrough * 0.85, bandCeil = ssPeak * 1.15;

  var n = plan.cycleDays + 1, peak = 0, trough = Infinity, inBand = 0;
  for (var t = 0; t < n; t++) {
    var v = total[t];
    if (v > peak)   peak   = v;
    if (v < trough) trough = v;
    if (v >= bandFloor && v <= bandCeil) inBand++;
  }
  if (trough === Infinity) trough = 0;

  var firstInBand = null;
  for (var t2 = 7; t2 < n; t2++) {
    if (total[t2] >= ssTrough * 0.9 && firstInBand === null) firstInBand = Math.ceil(t2 / 7);
  }

  return {
    peak:peak, trough:trough, ssTrough:ssTrough, ssPeak:ssPeak,
    bandFloor:bandFloor, bandCeil:bandCeil,
    inBandPct:       Math.round(inBand / n * 100),
    totalMg:         Math.round(sched.reduce(function(s, inj){ return s + inj.dose; }, 0)),
    firstInBandWeek: firstInBand
  };
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function _tcDrawChart(canvasId, total, stats, plan, sched) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var cd = plan.cd, cycleDays = plan.cycleDays, lineColor = cd.dot;

  var dpr  = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300;
  var cssH = 150;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD = {top:12, right:14, bottom:26, left:52};
  var cW = cssW - PAD.left - PAD.right, cH = cssH - PAD.top - PAD.bottom;
  var totalWeeks = Math.ceil(cycleDays / 7);

  var maxV = stats ? stats.bandCeil * 1.1 : 0;
  for (var i = 0; i <= cycleDays; i++) if (total[i] > maxV) maxV = total[i];
  if (!maxV) { ctx.fillStyle = '#555'; ctx.font = '11px DM Sans,sans-serif'; ctx.fillText('No data', 10, 40); return; }
  var vMax = maxV * 1.05;

  function xOf(t){ return PAD.left + (t / cycleDays) * cW; }
  function yOf(v){ return PAD.top  + cH - (v / vMax) * cH; }

  // Week grid
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
  for (var w = 0; w <= totalWeeks; w++) {
    var gx = xOf(w * 7); if (gx > PAD.left + cW + 1) break;
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + cH); ctx.stroke();
  }

  // Steady-state band
  if (stats && stats.bandCeil > 0) {
    ctx.fillStyle = 'rgba(34,204,102,0.09)';
    ctx.fillRect(PAD.left, yOf(stats.bandCeil), cW, yOf(stats.bandFloor) - yOf(stats.bandCeil));
    ctx.strokeStyle = 'rgba(34,204,102,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssTrough)); ctx.lineTo(PAD.left+cW, yOf(stats.ssTrough)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssPeak));   ctx.lineTo(PAD.left+cW, yOf(stats.ssPeak));   ctx.stroke();
    ctx.setLineDash([]);
  }

  // Y ticks
  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'right';
  for (var ti = 0; ti <= 3; ti++) {
    var ty = PAD.top + (cH / 3) * ti;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left+cW, ty); ctx.stroke();
    var tv = vMax * (1 - ti / 3);
    ctx.fillText(tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2), PAD.left - 4, ty + 3);
  }
  ctx.save(); ctx.translate(10, PAD.top + cH/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText('mg', 0, 0); ctx.restore();

  // Area fill
  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55'); grad.addColorStop(1, lineColor + '00');
  ctx.beginPath(); ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(total[t] || 0));
  ctx.lineTo(xOf(cycleDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Curve line
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(total[0] || 0));
  for (var t3 = 1; t3 <= cycleDays; t3++) ctx.lineTo(xOf(t3), yOf(total[t3] || 0));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // Injection ticks
  ctx.strokeStyle = cd.dot + '99'; ctx.lineWidth = 1;
  (sched || []).forEach(function(inj) {
    var ix = xOf(inj.day);
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 5); ctx.stroke();
  });

  // X week labels
  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = totalWeeks <= 8 ? 1 : totalWeeks <= 16 ? 2 : 4;
  for (var w2 = 0; w2 <= totalWeeks; w2 += labelEvery) {
    var lx = xOf(w2 * 7); if (lx > PAD.left + cW + 8) break;
    ctx.fillText('W' + w2, lx, PAD.top + cH + 18);
  }
}

// ── Inventory actions ─────────────────────────────────────────────────────────

function _tcAddInventory() {
  var trtIds = (typeof TRT_CAT !== 'undefined') ? TRT_CAT.map(function(c){ return c.id; }) : ['cypionate'];
  var existing = _tcp.inventory.map(function(inv){ return inv.compId; });
  var next = trtIds.find(function(id){ return existing.indexOf(id) === -1; }) || trtIds[0];
  _tcp.inventory.push({compId: next || 'cypionate', totalMg: ''});
  _tcSaveProfile();
  buildTCalc();
}

function _tcRemoveInventory(idx) {
  _tcp.inventory.splice(idx, 1);
  _tcSaveProfile();
  buildTCalc();
}

// ── Export to stack ───────────────────────────────────────────────────────────

function _tcExportPlan() {
  var plan = _tcCurrentPlan;
  if (!plan) return;
  var iv  = plan.intervalDays, dpi = plan.dosePerInj, cd = plan.cd;
  var days;
  if (iv <= 1.1)                       days = [0,1,2,3,4,5,6];
  else if (Math.abs(iv - 2)   < 0.3)  days = [1,3,5];
  else if (Math.abs(iv - 3.5) < 0.3)  days = [1,4];
  else if (Math.abs(iv - 7)   < 0.5)  days = [1];
  else                                 days = [1];

  var newStack = {
    name:         cd.name + ' Protocol',
    cycle_length: Math.round(plan.cycleDays / 7),
    trt:          {enabled:true, compounds:[{id:cd.id, name:cd.name, dose:String(dpi), unit:'mg', days:days}]},
    peptides:     [],
    enhanced:     {enabled:false, compounds:[]},
    _tcalc:       true
  };
  if (typeof _userStacks !== 'undefined') {
    _userStacks.push(newStack);
    saveStacksToBackend();
    var btn = document.getElementById('tab-btn-stacks');
    if (btn) switchTab('stacks', btn);
  }
}

// ── Main build ────────────────────────────────────────────────────────────────

function buildTCalc() {
  var el = document.getElementById('tcalc-body');
  if (!el) return;

  if (!_tcpSessionLoaded) {
    _tcpSessionLoaded = true;
    _tcLoadProfile();
  }

  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px;display:block';

  var result   = _tcOptimize();
  var plan     = result.plan;
  var cal      = result.calibration;
  var sched    = plan ? _tcBuildSchedule(plan) : [];
  var curve    = plan ? _tcBuildCurve(sched, plan) : null;
  var stats    = (plan && curve) ? _tcComputeStats(curve, sched, plan) : null;
  _tcCurrentPlan = plan;

  var html = '';
  html += '<div style="padding:12px 16px 4px;font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">Smart TRT optimizer — T-Calc makes all the decisions</div>';

  // ── Profile card ──────────────────────────────────────────────────────────
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#cc8844"></div>';
  html += '<div class="card-title">YOUR PROFILE</div></div>';
  html += '<span style="font-size:10px;color:var(--muted2)">saved to backend</span></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Total T (nmol/L)</label>';
  html += '<input type="number" min="0" max="200" step="0.1" value="' + _esc(_tcp.totalT) + '" placeholder="e.g. 16.2" oninput="_tcp.totalT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '<div><label style="' + lSty + '">SHBG (nmol/L)</label>';
  html += '<input type="number" min="0" max="300" step="1" value="' + _esc(_tcp.shbg) + '" placeholder="e.g. 45" oninput="_tcp.shbg=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Measured free T (pmol/L)</label>';
  html += '<input type="number" min="0" max="10000" step="1" value="' + _esc(_tcp.measuredFT) + '" placeholder="e.g. 223" oninput="_tcp.measuredFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '<div><label style="' + lSty + '">Current weekly dose (mg/wk)</label>';
  html += '<input type="number" min="0" max="2000" step="10" value="' + _esc(_tcp.currentDoseMgWk) + '" placeholder="e.g. 150 (at time of bloodwork)" oninput="_tcp.currentDoseMgWk=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '</div>';

  html += '<div><label style="' + lSty + '">Target free T (pmol/L)</label>';
  html += '<input type="number" min="0" max="10000" step="10" value="' + _esc(_tcp.targetFT) + '" placeholder="225–675 optimal male range · 600–1000 high-normal TRT" oninput="_tcp.targetFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';

  if (cal.ttNum > 0 || cal.mftNum > 0 || cal.tgtFT > 0) {
    html += '<div style="background:var(--surface2);border-radius:8px;padding:12px 14px;font-size:11px;color:var(--muted);line-height:1.9">';
    if (cal.vermFT !== null) {
      html += '<div>Vermeulen free T estimate: <b style="color:var(--text)">' + Math.round(cal.vermFT) + ' pmol/L</b>';
      if (cal.mftNum) html += ' <span style="color:var(--muted2)">(measured: ' + Math.round(cal.mftNum) + ' pmol/L)</span>';
      html += '</div>';
    }
    if (cal.ftFrac !== null) {
      var fracSrc = (cal.mftNum && cal.ttNum) ? ' <span style="color:var(--muted2)">(from measured bloodwork)</span>'
                 : cal.vermFT               ? ' <span style="color:var(--muted2)">(Vermeulen estimate)</span>' : '';
      html += '<div>Free T fraction: <b style="color:var(--text)">' + (cal.ftFrac * 100).toFixed(2) + '% of total T</b>' + fracSrc + '</div>';
    }
    if (cal.targetTT !== null) {
      html += '<div>To reach <b style="color:var(--text)">' + Math.round(cal.tgtFT) + ' pmol/L</b> free T → need ~<b style="color:var(--accent)">' + cal.targetTT.toFixed(1) + ' nmol/L</b> total T</div>';
    }
    if (cal.mgToNmol !== null && cal.targetTT !== null) {
      html += '<div>Personal scale: <b style="color:var(--text)">' + cal.mgToNmol.toFixed(3) + ' nmol/L per mg/week</b> → <b style="color:var(--accent)">' + Math.round(cal.targetTT / cal.mgToNmol) + ' mg/week</b> needed</div>';
    }
    if (cal.vermFT !== null && cal.mftNum > 0 && Math.abs(cal.vermFT - cal.mftNum) / cal.mftNum > 0.15) {
      html += '<div style="color:var(--muted2);font-size:10px;margin-top:2px">ℹ Vermeulen vs measured discrepancy is normal — assay methods differ. Measured value is used as your baseline.</div>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:11px;color:var(--muted2)">Enter bloodwork values to enable personalised dosing. Optimal male free T: 225–675 pmol/L. High-normal TRT target: 600–1000 pmol/L.</div>';
  }
  html += '</div></div>';

  // ── Inventory card ────────────────────────────────────────────────────────
  var trtIds = (typeof TRT_CAT !== 'undefined') ? TRT_CAT.map(function(c){ return c.id; }) : ['cypionate', 'enanthate'];

  html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#e8a020"></div>';
  html += '<div class="card-title">AVAILABLE COMPOUNDS</div></div>';
  html += '<span style="font-size:10px;color:var(--muted2)">what you have on hand</span></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">';

  if (_tcp.inventory.length === 0) {
    html += '<div style="font-size:12px;color:var(--muted2);text-align:center;padding:8px 0">No compounds added. Add what you have — T-Calc picks the best.</div>';
  }

  _tcp.inventory.forEach(function(inv, idx) {
    var cd = _tcCompInfo(inv.compId);
    var totalMgNum = parseFloat(inv.totalMg) || 0;
    var weeksStr = '';
    if (plan && plan.compId === inv.compId && totalMgNum > 0 && plan.reqMgPerWeek > 0) {
      weeksStr = '~' + Math.floor(totalMgNum / plan.reqMgPerWeek) + 'wk';
    }

    var compOpts = trtIds.map(function(id) {
      var cat = (typeof TRT_CAT !== 'undefined') ? TRT_CAT.find(function(c){ return c.id === id; }) : null;
      return '<option value="' + id + '"' + (id === inv.compId ? ' selected' : '') + '>' + _esc(cat ? cat.name : id) + '</option>';
    }).join('');
    compOpts += '<option value="hcg"' + (inv.compId === 'hcg' ? ' selected' : '') + '>HCG</option>';

    html += '<div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:8px;padding:10px 12px">';
    html += '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + ';flex-shrink:0;display:inline-block"></span>';
    html += '<select onchange="_tcp.inventory[' + idx + '].compId=this.value;_tcSaveProfile();buildTCalc()" style="flex:1;background:transparent;border:none;color:var(--text);font-size:12px;font-family:inherit;outline:none;min-width:0">' + compOpts + '</select>';
    if (cd.halfLifeStr) html += '<span style="font-size:10px;color:var(--muted2);flex-shrink:0;white-space:nowrap">t½ ' + _esc(cd.halfLifeStr) + '</span>';
    html += '<input type="number" min="0" max="99999" step="100" value="' + _esc(inv.totalMg) + '" placeholder="mg" oninput="_tcp.inventory[' + idx + '].totalMg=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="width:72px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 6px;color:var(--text);font-size:12px;font-family:inherit;outline:none;text-align:right;flex-shrink:0">';
    html += '<span style="font-size:10px;color:var(--muted2);flex-shrink:0">mg</span>';
    if (weeksStr) html += '<span style="font-size:10px;color:var(--accent);flex-shrink:0;font-weight:700">' + weeksStr + '</span>';
    html += '<button onclick="_tcRemoveInventory(' + idx + ')" style="background:none;border:none;color:var(--muted2);font-size:18px;cursor:pointer;padding:0 0 0 2px;line-height:1;flex-shrink:0">×</button>';
    html += '</div>';
  });

  html += '<button onclick="_tcAddInventory()" style="width:100%;background:none;border:1px dashed var(--border);border-radius:8px;padding:10px;color:var(--muted);font-size:12px;cursor:pointer;font-family:inherit">+ Add Compound</button>';
  html += '</div></div>';

  // ── Preferences card ──────────────────────────────────────────────────────
  var cycleOpts = _TC_CYCLE_OPTS.map(function(c) {
    return '<option value="' + c.days + '"' + (c.days === _tcp.cycleDays ? ' selected' : '') + '>' + _esc(c.label) + '</option>';
  }).join('');

  html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#6688cc"></div>';
  html += '<div class="card-title">PREFERENCES</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Duration</label>';
  html += '<select onchange="_tcp.cycleDays=+this.value;_tcSaveProfile();buildTCalc()" style="' + iSty + '">' + cycleOpts + '</select></div>';
  html += '<div><label style="' + lSty + '">Injection frequency</label>';
  html += '<select onchange="_tcp.preferredFreqDays=this.value;_tcSaveProfile();buildTCalc()" style="' + iSty + '">';
  html += '<option value="auto"' + (_tcp.preferredFreqDays==='auto'?' selected':'') + '>Auto (T-Calc decides)</option>';
  _TC_FREQ_OPTS.forEach(function(f) {
    var v = String(f.days);
    html += '<option value="' + v + '"' + (_tcp.preferredFreqDays===v?' selected':'') + '>' + _esc(f.label) + '</option>';
  });
  html += '</select></div></div>';

  html += '<div><label style="' + lSty + '">End strategy</label>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
  [{id:'trt',label:'Permanent TRT'},{id:'blast-cruise',label:'Blast & Cruise'},{id:'pct',label:'Full PCT'}].forEach(function(s) {
    var on = _tcp.cycleType === s.id;
    html += '<button onclick="_tcp.cycleType=\'' + s.id + '\';_tcSaveProfile();buildTCalc();document.querySelectorAll(\'.tc-ctb\').forEach(function(b){b.style.background=\'var(--surface2)\';b.style.color=\'var(--text)\';b.style.borderColor=\'var(--border)\'});this.style.background=\'#6688cc\';this.style.color=\'#fff\';this.style.borderColor=\'#6688cc\'" ';
    html += 'class="tc-ctb" style="background:' + (on?'#6688cc':'var(--surface2)') + ';color:' + (on?'#fff':'var(--text)') + ';border:1px solid ' + (on?'#6688cc':'var(--border)') + ';border-radius:8px;padding:9px 10px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600">';
    html += _esc(s.label) + '</button>';
  });
  html += '</div></div></div></div>';

  // ── Results: warnings ─────────────────────────────────────────────────────
  if (result.warnings.length > 0) {
    html += '<div class="card" style="border:1px solid rgba(204,68,68,0.5)">';
    html += '<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#cc4444"></div><div class="card-title">⚠ WARNINGS</div></div></div>';
    html += '<div style="padding:0 16px 14px;display:flex;flex-direction:column;gap:8px">';
    result.warnings.forEach(function(w) {
      html += '<div style="background:rgba(204,68,68,0.1);border-radius:8px;padding:10px 12px;font-size:12px;color:#ff8888;line-height:1.5">' + _esc(w.message) + '</div>';
    });
    html += '</div></div>';
  }

  // ── HCG card (always shown) ───────────────────────────────────────────────
  var hcgSug = result.suggestions.find(function(s){ return s.type==='hcg-missing'||s.type==='hcg-included'; });
  if (hcgSug) {
    var hcgGreen  = hcgSug.type === 'hcg-included';
    var hcgColor  = hcgGreen ? '#44cc88' : '#e8a020';
    var hcgBorder = hcgGreen ? 'rgba(68,204,136,0.3)' : 'rgba(232,160,32,0.4)';
    html += '<div class="card" style="border:1px solid ' + hcgBorder + '">';
    html += '<div class="card-header"><div class="card-title-wrap">';
    html += '<div class="card-dot" style="background:' + hcgColor + '"></div>';
    html += '<div class="card-title">HCG</div></div>';
    html += '<span style="font-size:10px;color:' + hcgColor + ';font-weight:700;padding-right:2px">' + (hcgGreen ? '✓ IN INVENTORY' : 'ALWAYS RECOMMENDED') + '</span>';
    html += '</div>';
    html += '<div style="padding:0 16px 14px;font-size:12px;color:var(--muted);line-height:1.6">' + _esc(hcgSug.message) + '</div>';
    html += '</div>';
  }

  // Other notes
  var otherSugs = result.suggestions.filter(function(s){ return s.type!=='hcg-missing'&&s.type!=='hcg-included'; });
  if (otherSugs.length > 0) {
    html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#8899cc"></div><div class="card-title">T-CALC NOTES</div></div></div>';
    html += '<div style="padding:0 16px 14px;display:flex;flex-direction:column;gap:8px">';
    otherSugs.forEach(function(s) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--muted);line-height:1.5">' + _esc(s.message) + '</div>';
    });
    html += '</div></div>';
  }

  // ── Chart + schedule (only when plan exists) ──────────────────────────────
  if (plan && curve && stats) {
    var ptr = plan.peakTroughRatio;
    var ptrColor = ptr > 2.5 ? '#cc4444' : ptr > 1.8 ? '#e8a020' : '#44cc88';

    html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
    html += '<div class="card-dot" style="background:' + plan.cd.dot + '"></div>';
    html += '<div class="card-title">PREDICTED PLASMA CURVE</div></div>';
    if (plan.cd.halfLifeStr) html += '<span style="font-size:10px;color:var(--muted2)">t½ ' + _esc(plan.cd.halfLifeStr) + '</span>';
    html += '</div>';
    html += '<div style="padding:2px 16px 10px"><canvas id="tc-chart" style="width:100%;display:block;"></canvas></div>';

    html += '<div style="padding:0 16px 14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
    [{label:'PEAK',value:Math.round(stats.peak)+' mg'},
     {label:'TROUGH',value:Math.round(stats.trough)+' mg'},
     {label:'PEAK:TROUGH',value:ptr.toFixed(1)+'×',color:ptrColor},
     {label:'TOTAL',value:Math.round(stats.totalMg)+' mg'}
    ].forEach(function(s) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:8px 10px;text-align:center">';
      html += '<div style="font-size:9px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">' + s.label + '</div>';
      html += '<div style="font-size:13px;font-weight:700;color:' + (s.color||'var(--text)') + '">' + s.value + '</div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div style="padding:0 16px 10px;font-size:11px;color:var(--muted2)">';
    html += 'SS band: ' + Math.round(stats.ssTrough) + '–' + Math.round(stats.ssPeak) + ' mg';
    if (stats.firstInBandWeek !== null) html += ' · enters band ~W' + stats.firstInBandWeek;
    if (plan.ftFrac && stats.ssTrough > 0) {
      html += ' · est. free T ' + Math.round(stats.ssTrough * plan.ftFrac * 1000) + '–' + Math.round(stats.ssPeak * plan.ftFrac * 1000) + ' pmol/L';
    }
    html += '</div>';

    var doseLabel = plan.doseSource==='personal' ? 'personalised' : plan.doseSource==='population' ? 'population avg' : 'suggested';
    html += '<div style="margin:0 16px 14px;background:rgba(102,136,204,0.08);border-radius:8px;padding:12px 14px;font-size:12px;color:var(--muted);line-height:1.8">';
    html += '<b style="color:var(--text)">T-Calc recommends:</b><br>';
    html += _esc(plan.cd.name) + ' · <b>' + plan.dosePerInj + ' mg</b> · ' + _esc(_tcIntervalLabel(plan.intervalDays));
    html += ' · <b>' + Math.round(plan.reqMgPerWeek) + ' mg/week</b> (' + doseLabel + ')';
    html += '</div>';
    html += '</div>';

    var rampWeeks = Math.min(6, Math.max(2, Math.round(plan.cycleDays / 7 / 4)));

    html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#888"></div>';
    html += '<div class="card-title">INJECTION SCHEDULE</div></div>';
    html += '<span style="font-size:10px;color:var(--muted2);padding-right:2px">' + sched.length + ' injections</span>';
    html += '</div>';
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    ['DAY','WEEK','DOSE','NOTE'].forEach(function(h, i) {
      html += '<th style="padding:8px 16px;text-align:' + (i===2?'right':'left') + ';font-size:10px;color:var(--muted2);font-weight:600;letter-spacing:0.5px">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    sched.forEach(function(inj, i) {
      var isLast  = i === sched.length - 1;
      var weekNum = Math.floor(inj.day / 7) + 1;
      var isRamp  = inj.day < rampWeeks * 7 && inj.dose < plan.dosePerInj * 0.98;
      html += '<tr style="border-bottom:' + (isLast ? 'none' : '1px solid var(--border)') + '">';
      html += '<td style="padding:7px 16px;color:var(--text)">Day ' + (inj.day + 1) + '</td>';
      html += '<td style="padding:7px 16px;color:var(--muted)">W' + weekNum + '</td>';
      html += '<td style="padding:7px 16px;text-align:right;font-weight:600;color:var(--text)">' + inj.dose + ' mg</td>';
      html += '<td style="padding:7px 16px;color:var(--muted2);font-size:11px">' + (isRamp ? 'ramp-up' : '') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div style="padding:14px 16px">';
    html += '<button onclick="_tcExportPlan()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:11px 20px;font-size:13px;font-weight:700;cursor:pointer;width:100%;font-family:inherit">Export as TRT Stack</button>';
    html += '</div></div>';
  }

  el.innerHTML = html;

  if (plan && curve && stats) {
    var _s = sched, _p = plan;
    requestAnimationFrame(function() {
      _tcDrawChart('tc-chart', curve, stats, _p, _s);
    });
  }
}
