// tab-tcalc.js — Smart T-Calc: goal-based PK optimizer

// ── Profile state (persisted to backend + localStorage cache) ─────────────────

var _tcp = {
  totalT:              '',
  shbg:                '',
  measuredFT:          '',
  currentDoseMgWk:     '',
  targetFT:            '',
  inventory:           [],  // [{compId, totalMg, costTotal}, ...]
  cycleType:           'trt',
  cycleDays:           168,
  preferredFreqDays:   'auto',
  overrideDoseMgWk:    '',
  overrideIntervalDays: '',
  planCompId:          ''   // kept for backward-compat with saved profiles; ignored
};

var _tcpSessionLoaded = false;
var _tcCurrentPlan    = null;

// ── Frequency options ─────────────────────────────────────────────────────────

var _TC_FREQ_OPTS = [
  {label:'Daily',           days:1},
  {label:'EOD',             days:2},
  {label:'3×/week',         days:7/3},
  {label:'2×/week (E3.5D)',days:3.5},
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
  var alb    = 4.3 / 66500 * 10;
  var denom  = 1 + K_SHBG * (shbg * 1e-9) + K_ALB * alb;
  return (totalT * 1e-9 / denom) * 1e12;
}

// ── PK helpers ────────────────────────────────────────────────────────────────

function _tcPeakTroughRatio(halfLifeDays, intervalDays) {
  return Math.exp(Math.LN2 / halfLifeDays * intervalDays);
}

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

// ── Inventory overlay ─────────────────────────────────────────────────────────

function _tcCategorizeComps() {
  var cats = [
    {label:'SHORT ESTERS',  borderColor:'#e8a020', ids:[]},
    {label:'MEDIUM ESTERS', borderColor:'#6688cc', ids:[]},
    {label:'LONG ESTERS',   borderColor:'#8866cc', ids:[]},
    {label:'DEPOT',         borderColor:'#44aa88', ids:[]}
  ];
  var trtIds = (typeof TRT_CAT !== 'undefined') ? TRT_CAT.map(function(c){ return c.id; }) : [];
  trtIds.forEach(function(id) {
    var hl = _tcCompInfo(id).halfLifeDays;
    if      (hl < 3)  cats[0].ids.push(id);
    else if (hl < 9)  cats[1].ids.push(id);
    else if (hl < 20) cats[2].ids.push(id);
    else              cats[3].ids.push(id);
  });
  return cats.filter(function(c){ return c.ids.length > 0; });
}

function _tcOpenInventory() {
  var equippedIds = _tcp.inventory.map(function(i){ return i.compId; });
  var cats = _tcCategorizeComps();

  var iSty = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:8px 10px;color:#ccc;font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';

  function cardHtml(id, isHCG) {
    var cd  = _tcCompInfo(id);
    var inv = _tcp.inventory.find(function(i){ return i.compId === id; });
    var eq  = !!inv;
    var unit = isHCG ? 'IU' : 'mg';

    if (eq) {
      return '<div style="background:#0a0a0a;border:2px solid ' + cd.dot + ';border-radius:14px;padding:14px;box-shadow:0 0 20px ' + cd.dot + '33">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:7px">' +
              '<span style="width:9px;height:9px;border-radius:50%;background:' + cd.dot + ';display:inline-block;flex-shrink:0;box-shadow:0 0 8px ' + cd.dot + '"></span>' +
              '<span style="font-size:13px;font-weight:800;color:#fff;letter-spacing:0.3px">' + _esc(cd.name) + '</span>' +
            '</div>' +
            (cd.halfLifeStr ? '<div style="font-size:10px;color:#555;margin-top:3px;padding-left:16px">t½ ' + _esc(cd.halfLifeStr) + '</div>' : '') +
          '</div>' +
          '<button onclick="_tcToggleCompound(\'' + id + '\')" style="background:none;border:none;color:#444;font-size:20px;cursor:pointer;padding:0;line-height:1;margin-top:-2px">✕</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div>' +
            '<div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">STOCK (' + unit + ')</div>' +
            '<input type="number" min="0" max="99999" step="' + (isHCG ? '1000' : '100') + '" value="' + _esc(inv.totalMg || '') + '" placeholder="' + (isHCG ? '5000' : '1000') + '" onchange="_tcInvSetField(\'' + id + '\',\'totalMg\',this.value)" style="' + iSty + '">' +
          '</div>' +
          '<div>' +
            '<div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">TOTAL PAID</div>' +
            '<input type="number" min="0" step="0.01" value="' + _esc(inv.costTotal || '') + '" placeholder="e.g. 45" onchange="_tcInvSetField(\'' + id + '\',\'costTotal\',this.value)" style="' + iSty + '">' +
          '</div>' +
        '</div>' +
      '</div>';
    } else {
      return '<div onclick="_tcToggleCompound(\'' + id + '\')" style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:14px;padding:14px;cursor:pointer;position:relative;overflow:hidden">' +
        '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,' + cd.dot + '44,transparent)"></div>' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + '55;display:inline-block"></span>' +
        '<div style="font-size:13px;font-weight:800;color:#555;margin-top:8px;letter-spacing:0.3px">' + _esc(cd.name) + '</div>' +
        (cd.halfLifeStr ? '<div style="font-size:10px;color:#333;margin-top:3px">t½ ' + _esc(cd.halfLifeStr) + '</div>' : '') +
        '<div style="font-size:9px;color:#2a2a2a;letter-spacing:1.2px;font-weight:700;margin-top:10px">TAP TO EQUIP</div>' +
      '</div>';
    }
  }

  var html = '<div id="tc-inv-overlay" onclick="if(event.target===this)_tcCloseInventory()" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);backdrop-filter:blur(16px);overflow-y:auto;-webkit-overflow-scrolling:touch">' +
    '<div style="max-width:480px;margin:0 auto;padding:16px 16px 60px">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 24px">' +
    '<div>' +
      '<div style="font-size:11px;color:#444;letter-spacing:2px;font-weight:700;margin-bottom:4px">T-CALC</div>' +
      '<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.5px">⚗ COMPOUND INVENTORY</div>' +
      '<div style="font-size:12px;color:#444;margin-top:4px">' + equippedIds.length + ' compound' + (equippedIds.length === 1 ? '' : 's') + ' equipped</div>' +
    '</div>' +
    '<button onclick="_tcCloseInventory()" style="background:#111;border:1px solid #333;border-radius:10px;color:#777;font-size:24px;cursor:pointer;padding:4px 14px;line-height:1;font-family:inherit">×</button>' +
  '</div>';

  // Compound categories
  cats.forEach(function(cat) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin:20px 0 12px">' +
      '<div style="height:1px;width:16px;background:' + cat.borderColor + '44"></div>' +
      '<div style="font-size:10px;color:#444;letter-spacing:1.8px;font-weight:700;white-space:nowrap">' + cat.label + '</div>' +
      '<div style="flex:1;height:1px;background:' + cat.borderColor + '22"></div>' +
    '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    cat.ids.forEach(function(id) { html += cardHtml(id, false); });
    html += '</div>';
  });

  // Support / HCG
  html += '<div style="display:flex;align-items:center;gap:10px;margin:20px 0 12px">' +
    '<div style="height:1px;width:16px;background:#44cc8844"></div>' +
    '<div style="font-size:10px;color:#444;letter-spacing:1.8px;font-weight:700">SUPPORT</div>' +
    '<div style="flex:1;height:1px;background:#44cc8822"></div>' +
  '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += cardHtml('hcg', true);
  html += '</div>';

  html += '</div></div>';

  var existing = document.getElementById('tc-inv-overlay');
  if (existing) existing.remove();
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  document.body.appendChild(tmp.firstChild);
}

function _tcCloseInventory() {
  var el = document.getElementById('tc-inv-overlay');
  if (el) el.remove();
  buildTCalc();
}

function _tcToggleCompound(compId) {
  var idx = _tcp.inventory.findIndex(function(i){ return i.compId === compId; });
  if (idx === -1) {
    _tcp.inventory.push({compId: compId, totalMg: '', costTotal: ''});
  } else {
    _tcp.inventory.splice(idx, 1);
  }
  _tcSaveProfile();
  _tcOpenInventory();
  buildTCalc();
}

function _tcInvSetField(compId, field, val) {
  var inv = _tcp.inventory.find(function(i){ return i.compId === compId; });
  if (!inv) return;
  inv[field] = val;
  _tcSaveProfile();
  buildTCalc();
}

// ── OPTIMIZER ─────────────────────────────────────────────────────────────────

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

  // Always suggest HCG
  var hasHCG = _tcp.inventory.some(function(inv){ return inv.compId === 'hcg'; });
  result.suggestions.push(hasHCG ? {
    type: 'hcg-included', priority: 0,
    message: 'HCG in inventory — run 500–1000 IU 2×/week alongside TRT to maintain testicular function.'
  } : {
    type: 'hcg-missing', priority: 1,
    message: 'Add HCG (500–1000 IU 2×/week) to prevent testicular atrophy and preserve intratesticular testosterone.'
  });

  var testInv = _tcp.inventory.filter(function(inv){ return inv.compId !== 'hcg'; });

  if (testInv.length === 0) {
    result.suggestions.push({
      type: 'no-inventory', priority: 2,
      message: 'Open the inventory above to equip your compounds — T-Calc will build an optimised multi-ester schedule.'
    });
    return result;
  }

  // ── Determine total weekly dose ───────────────────────────────────────────
  var autoMgPerWeek, doseSource;
  if (targetTT !== null && mgToNmol !== null) {
    autoMgPerWeek = targetTT / mgToNmol;
    doseSource    = 'personal';
  } else if (targetTT !== null) {
    autoMgPerWeek = targetTT / 0.20;
    doseSource    = 'population';
    result.suggestions.push({
      type: 'calibration-estimate', priority: 3,
      message: 'Dose uses population average (±50% accuracy). Add your current weekly dose alongside bloodwork for a personal calculation.'
    });
  } else if (tgtFT > 0) {
    autoMgPerWeek = 150;
    doseSource    = 'default';
    result.suggestions.push({
      type: 'need-bloodwork', priority: 2,
      message: 'Enter Total T from bloodwork to enable personal dosing. Showing 150 mg/wk as a starting point.'
    });
  } else {
    autoMgPerWeek = 150;
    doseSource    = 'default';
    result.suggestions.push({
      type: 'using-default', priority: 3,
      message: 'Enter bloodwork + target free T for a personalised dose. Showing 150 mg/wk as a starting point.'
    });
  }

  autoMgPerWeek = Math.max(50, Math.min(600, autoMgPerWeek));

  var ovDose     = parseFloat(_tcp.overrideDoseMgWk)    || 0;
  var ovInterval = parseFloat(_tcp.overrideIntervalDays) || 0;
  var isManual   = ovDose > 0 || ovInterval > 0;
  if (isManual) doseSource = 'manual';
  var reqMgPerWeek = ovDose > 0 ? ovDose : autoMgPerWeek;

  // ── Allocate dose across all compounds ────────────────────────────────────
  var totalStock = testInv.reduce(function(s, inv){ return s + (parseFloat(inv.totalMg) || 0); }, 0);
  var equalSplit = (totalStock === 0);

  var effectiveCycle = _tcp.cycleDays;
  var compoundPlans  = [];

  testInv.forEach(function(inv) {
    var cd    = _tcCompInfo(inv.compId);
    var stock = parseFloat(inv.totalMg) || 0;
    var frac  = equalSplit ? (1 / testInv.length) : (stock / totalStock);
    var compMgWk = reqMgPerWeek * frac;

    var optInterval  = 0.585 * cd.halfLifeDays;
    var compInterval = ovInterval > 0         ? ovInterval
                     : _tcp.preferredFreqDays !== 'auto' ? _tcSnapInterval(parseFloat(_tcp.preferredFreqDays) || optInterval)
                     : _tcSnapInterval(optInterval);

    if (stock > 0) {
      var weeksAvail = stock / compMgWk;
      if (weeksAvail < _tcp.cycleDays / 7 * 0.9) {
        var capDays = Math.max(28, Math.floor(weeksAvail) * 7);
        if (capDays < effectiveCycle) effectiveCycle = capDays;
        result.suggestions.push({
          type: 'insufficient-inventory', priority: 1,
          message: cd.name + ' stock (' + Math.round(stock) + ' mg) covers ~' +
                   Math.floor(weeksAvail) + ' wks at ' + Math.round(compMgWk) + ' mg/wk.'
        });
      }
    }

    var ptr = _tcPeakTroughRatio(cd.halfLifeDays, compInterval);
    if (ptr > 2.5) {
      result.warnings.push({
        type: 'high-peak-trough',
        message: cd.name + ' peak:trough ' + ptr.toFixed(1) + '× exceeds 2.5× — increase frequency or use a shorter ester.'
      });
    }

    // Cost per mg from user-entered purchase price
    var costTotal  = parseFloat(inv.costTotal) || 0;
    var costPerMg  = (costTotal > 0 && stock > 0) ? costTotal / stock : null;
    var costPerWeek = costPerMg !== null ? compMgWk * costPerMg : null;

    compoundPlans.push({
      compId:           cd.id,
      cd:               cd,
      intervalDays:     compInterval,
      autoIntervalDays: _tcSnapInterval(optInterval),
      dosePerInj:       Math.round(compMgWk * compInterval / 7 * 10) / 10,
      mgPerWeek:        Math.round(compMgWk),
      costPerMg:        costPerMg,
      costPerWeek:      costPerWeek !== null ? Math.round(costPerWeek * 100) / 100 : null
    });
  });

  // Total cycle cost (only when every compound has cost data)
  var totalCostPerCycle = null;
  if (compoundPlans.length > 0 && compoundPlans.every(function(cp){ return cp.costPerWeek !== null; })) {
    totalCostPerCycle = Math.round(
      compoundPlans.reduce(function(s, cp){ return s + cp.costPerWeek * effectiveCycle / 7; }, 0) * 100
    ) / 100;
  }

  result.plan = {
    compounds:        compoundPlans,
    totalMgPerWeek:   Math.round(reqMgPerWeek),
    autoMgPerWeek:    Math.round(autoMgPerWeek),
    cycleDays:        effectiveCycle,
    doseSource:       doseSource,
    isManual:         isManual,
    ftFrac:           ftFrac,
    totalCostPerCycle: totalCostPerCycle
  };

  return result;
}

// ── PK schedule + curve ───────────────────────────────────────────────────────

function _tcBuildSchedule(plan) {
  var rampWeeks = Math.min(6, Math.max(2, Math.round(plan.cycleDays / 7 / 4)));
  var sched = [];

  plan.compounds.forEach(function(cp) {
    var d = 0;
    while (d < plan.cycleDays) {
      var prog = Math.min(1, (d / 7) / rampWeeks);
      var dose = cp.dosePerInj * (0.3 + 0.7 * prog);
      sched.push({
        day:          Math.round(d),
        dose:         Math.round(dose * 10) / 10,
        compId:       cp.compId,
        halfLifeDays: cp.cd.halfLifeDays,
        dot:          cp.cd.dot,
        name:         cp.cd.name,
        dosePerInj:   cp.dosePerInj
      });
      d += cp.intervalDays;
    }
  });

  sched.sort(function(a, b) { return a.day - b.day; });
  return sched;
}

function _tcBuildCurve(sched, plan) {
  var n = plan.cycleDays + 1;
  var total = new Float64Array(n);
  for (var t = 0; t < n; t++) {
    var c = 0;
    for (var j = 0; j < sched.length; j++) {
      if (sched[j].day <= t) {
        var k = Math.LN2 / sched[j].halfLifeDays;
        c += sched[j].dose * Math.exp(-k * (t - sched[j].day));
      }
    }
    total[t] = c;
  }
  return total;
}

function _tcComputeStats(total, sched, plan) {
  var ssTrough = 0, ssPeak = 0;
  plan.compounds.forEach(function(cp) {
    var k   = Math.LN2 / cp.cd.halfLifeDays;
    var eKT = Math.exp(k * cp.intervalDays);
    var t   = cp.dosePerInj / (eKT - 1);
    ssTrough += t;
    ssPeak   += t + cp.dosePerInj;
  });
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
    peakTroughRatio:  trough > 0 ? peak / trough : 0,
    inBandPct:        Math.round(inBand / n * 100),
    totalMg:          Math.round(sched.reduce(function(s, inj){ return s + inj.dose; }, 0)),
    firstInBandWeek:  firstInBand
  };
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function _tcDrawChart(canvasId, total, stats, plan, sched) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var lineColor = (plan.compounds && plan.compounds.length > 0) ? plan.compounds[0].cd.dot : '#e8a020';
  var cycleDays = plan.cycleDays;

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

  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
  for (var w = 0; w <= totalWeeks; w++) {
    var gx = xOf(w * 7); if (gx > PAD.left + cW + 1) break;
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + cH); ctx.stroke();
  }

  if (stats && stats.bandCeil > 0) {
    ctx.fillStyle = 'rgba(34,204,102,0.09)';
    ctx.fillRect(PAD.left, yOf(stats.bandCeil), cW, yOf(stats.bandFloor) - yOf(stats.bandCeil));
    ctx.strokeStyle = 'rgba(34,204,102,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssTrough)); ctx.lineTo(PAD.left+cW, yOf(stats.ssTrough)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssPeak));   ctx.lineTo(PAD.left+cW, yOf(stats.ssPeak));   ctx.stroke();
    ctx.setLineDash([]);
  }

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

  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55'); grad.addColorStop(1, lineColor + '00');
  ctx.beginPath(); ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(total[t] || 0));
  ctx.lineTo(xOf(cycleDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(total[0] || 0));
  for (var t3 = 1; t3 <= cycleDays; t3++) ctx.lineTo(xOf(t3), yOf(total[t3] || 0));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.lineWidth = 1;
  (sched || []).forEach(function(inj) {
    var ix = xOf(inj.day);
    ctx.strokeStyle = (inj.dot || lineColor) + '99';
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 5); ctx.stroke();
  });

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = totalWeeks <= 8 ? 1 : totalWeeks <= 16 ? 2 : 4;
  for (var w2 = 0; w2 <= totalWeeks; w2 += labelEvery) {
    var lx = xOf(w2 * 7); if (lx > PAD.left + cW + 8) break;
    ctx.fillText('W' + w2, lx, PAD.top + cH + 18);
  }
}

// ── Export to stack ───────────────────────────────────────────────────────────

function _tcExportPlan() {
  var plan = _tcCurrentPlan;
  if (!plan || !plan.compounds || plan.compounds.length === 0) return;

  var trtCompounds = plan.compounds.map(function(cp) {
    var iv = cp.intervalDays;
    var days;
    if (iv <= 1.1)                       days = [0,1,2,3,4,5,6];
    else if (Math.abs(iv - 2)   < 0.3)  days = [1,3,5];
    else if (Math.abs(iv - 3.5) < 0.3)  days = [1,4];
    else if (Math.abs(iv - 7)   < 0.5)  days = [1];
    else                                 days = [1];
    return {id:cp.compId, name:cp.cd.name, dose:String(cp.dosePerInj), unit:'mg', days:days};
  });

  var nameStr = plan.compounds.length === 1
    ? plan.compounds[0].cd.name + ' Protocol'
    : plan.compounds.map(function(cp){ return cp.cd.name; }).join(' + ') + ' Protocol';

  var newStack = {
    name:         nameStr,
    cycle_length: Math.round(plan.cycleDays / 7),
    trt:          {enabled:true, compounds:trtCompounds},
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

  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:16px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';

  var result   = _tcOptimize();
  var plan     = result.plan;
  var cal      = result.calibration;
  var sched    = plan ? _tcBuildSchedule(plan) : [];
  var curve    = plan ? _tcBuildCurve(sched, plan) : null;
  var stats    = (plan && curve) ? _tcComputeStats(curve, sched, plan) : null;
  _tcCurrentPlan = plan;

  var html = '';

  // ── 1. BLOODWORK card ─────────────────────────────────────────────────────────
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#cc8844"></div>';
  html += '<div class="card-title">BLOODWORK</div></div>';
  html += '<span style="font-size:11px;color:var(--muted2)">saved to backend</span></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Total T (nmol/L)</label>';
  html += '<input type="number" min="0" max="200" step="0.1" value="' + _esc(_tcp.totalT) + '" placeholder="e.g. 16.2" oninput="_tcp.totalT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '<div><label style="' + lSty + '">SHBG (nmol/L)</label>';
  html += '<input type="number" min="0" max="300" step="1" value="' + _esc(_tcp.shbg) + '" placeholder="e.g. 45" oninput="_tcp.shbg=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Free T measured (pmol/L)</label>';
  html += '<input type="number" min="0" max="10000" step="1" value="' + _esc(_tcp.measuredFT) + '" placeholder="e.g. 223" oninput="_tcp.measuredFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '<div><label style="' + lSty + '">Dose at bloodwork (mg/wk)</label>';
  html += '<input type="number" min="0" max="2000" step="10" value="' + _esc(_tcp.currentDoseMgWk) + '" placeholder="e.g. 150" oninput="_tcp.currentDoseMgWk=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
  html += '</div>';

  html += '<div><label style="' + lSty + '">Target free T (pmol/L)</label>';
  html += '<input type="number" min="0" max="10000" step="10" value="' + _esc(_tcp.targetFT) + '" placeholder="225–675 optimal · 600–1000 high-normal TRT" oninput="_tcp.targetFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';

  if (cal.vermFT !== null || cal.targetTT !== null) {
    html += '<div style="background:var(--surface2);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">';
    if (cal.vermFT !== null) {
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
      html += '<span style="font-size:13px;color:var(--muted)">Vermeulen est.</span>';
      html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + Math.round(cal.vermFT) + ' pmol/L</span></div>';
    }
    if (cal.ftFrac !== null) {
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
      html += '<span style="font-size:13px;color:var(--muted)">Free T fraction</span>';
      html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + (cal.ftFrac * 100).toFixed(2) + '%</span></div>';
    }
    if (cal.targetTT !== null) {
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
      html += '<span style="font-size:13px;color:var(--muted)">Total T needed</span>';
      html += '<span style="font-size:15px;font-weight:700;color:var(--accent)">' + cal.targetTT.toFixed(1) + ' nmol/L</span></div>';
    }
    if (cal.mgToNmol !== null && cal.targetTT !== null) {
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
      html += '<span style="font-size:13px;color:var(--muted)">Weekly dose needed</span>';
      html += '<span style="font-size:15px;font-weight:700;color:var(--accent)">' + Math.round(cal.targetTT / cal.mgToNmol) + ' mg/wk</span></div>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:13px;color:var(--muted2);line-height:1.5">Enter bloodwork values to enable personalised dosing.<br>Optimal male free T: 225–675 pmol/L · High-normal TRT: 600–1000 pmol/L</div>';
  }
  html += '</div></div>';

  // ── 2. INVENTORY card ─────────────────────────────────────────────────────────
  html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#e8a020"></div>';
  html += '<div class="card-title">INVENTORY</div></div>';
  html += '<button onclick="_tcOpenInventory()" style="background:linear-gradient(135deg,#e8a020 0%,#b85a00 100%);border:none;border-radius:8px;color:#000;font-size:11px;font-weight:800;letter-spacing:0.8px;cursor:pointer;padding:7px 14px;font-family:inherit">⚗ MANAGE</button>';
  html += '</div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">';

  if (_tcp.inventory.length === 0) {
    html += '<div style="font-size:13px;color:var(--muted2);text-align:center;padding:16px 0">';
    html += 'No compounds equipped.<br><span style="font-size:12px;color:var(--muted2);opacity:0.6">Tap ⚗ MANAGE to open the inventory.</span>';
    html += '</div>';
  } else {
    _tcp.inventory.forEach(function(inv) {
      var cd = _tcCompInfo(inv.compId);
      var isHCG = inv.compId === 'hcg';
      var unit = isHCG ? 'IU' : 'mg';
      var stock = parseFloat(inv.totalMg) || 0;

      // Weeks coverage
      var weeksStr = '';
      if (plan && !isHCG && stock > 0) {
        var cp = plan.compounds.find(function(c){ return c.compId === inv.compId; });
        if (cp && cp.mgPerWeek > 0) weeksStr = '~' + Math.floor(stock / cp.mgPerWeek) + ' wks';
      }

      // Cost/week
      var costStr = '';
      if (!isHCG) {
        var costTotal = parseFloat(inv.costTotal) || 0;
        if (costTotal > 0 && stock > 0) {
          var cp2 = plan && plan.compounds.find(function(c){ return c.compId === inv.compId; });
          if (cp2 && cp2.costPerWeek !== null) costStr = cp2.costPerWeek.toFixed(2) + '/wk';
        }
      }

      html += '<div style="display:flex;align-items:center;gap:10px;background:var(--surface2);border-radius:8px;padding:10px 14px;border:1px solid ' + cd.dot + '33">';
      html += '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + ';flex-shrink:0;display:inline-block;box-shadow:0 0 6px ' + cd.dot + '88"></span>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + _esc(cd.name) + '</div>';
      var meta = [];
      if (stock > 0) meta.push(stock + ' ' + unit);
      if (weeksStr) meta.push(weeksStr);
      if (cd.halfLifeStr) meta.push('t½ ' + cd.halfLifeStr);
      if (meta.length) html += '<div style="font-size:11px;color:var(--muted2);margin-top:1px">' + meta.join(' · ') + '</div>';
      html += '</div>';
      if (costStr) html += '<span style="font-size:12px;color:var(--accent);font-weight:700;flex-shrink:0">' + _esc(costStr) + '</span>';
      html += '</div>';
    });

    // Total cost summary if all compounds have cost
    if (plan && plan.totalCostPerCycle !== null) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:baseline;border:1px solid var(--accent)33;margin-top:2px">';
      html += '<span style="font-size:12px;color:var(--muted)">Cycle cost (' + Math.round(plan.cycleDays / 7) + ' wks)</span>';
      html += '<span style="font-size:15px;font-weight:800;color:var(--accent)">' + plan.totalCostPerCycle.toFixed(2) + '</span>';
      html += '</div>';
    }
  }
  html += '</div></div>';

  // ── 3. PREFERENCES card ───────────────────────────────────────────────────────
  var cycleOpts = _TC_CYCLE_OPTS.map(function(c) {
    return '<option value="' + c.days + '"' + (c.days === _tcp.cycleDays ? ' selected' : '') + '>' + _esc(c.label) + '</option>';
  }).join('');

  html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#6688cc"></div>';
  html += '<div class="card-title">PREFERENCES</div></div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  html += '<div><label style="' + lSty + '">Duration</label>';
  html += '<select onchange="_tcp.cycleDays=+this.value;_tcSaveProfile();buildTCalc()" style="' + iSty + '">' + cycleOpts + '</select></div>';
  html += '<div><label style="' + lSty + '">Preferred frequency</label>';
  html += '<select onchange="_tcp.preferredFreqDays=this.value;_tcSaveProfile();buildTCalc()" style="' + iSty + '">';
  html += '<option value="auto"' + (_tcp.preferredFreqDays==='auto'?' selected':'') + '>Auto (per ester)</option>';
  _TC_FREQ_OPTS.forEach(function(f) {
    var v = String(f.days);
    html += '<option value="' + v + '"' + (_tcp.preferredFreqDays===v?' selected':'') + '>' + _esc(f.label) + '</option>';
  });
  html += '</select></div></div>';

  html += '<div><label style="' + lSty + '">End strategy</label>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
  [{id:'trt',label:'Permanent TRT'},{id:'blast-cruise',label:'Blast & Cruise'},{id:'pct',label:'Full PCT'}].forEach(function(s) {
    var on = _tcp.cycleType === s.id;
    html += '<button onclick="_tcp.cycleType=\'' + s.id + '\';_tcSaveProfile();buildTCalc()" ';
    html += 'style="background:' + (on?'#6688cc':'var(--surface2)') + ';color:' + (on?'#fff':'var(--text)') + ';border:1px solid ' + (on?'#6688cc':'var(--border)') + ';border-radius:8px;padding:11px 8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">';
    html += _esc(s.label) + '</button>';
  });
  html += '</div></div></div></div>';

  // ── 4. PLAN card ─────────────────────────────────────────────────────────────
  if (plan) {
    var firstCp   = plan.compounds[0];
    var planDot   = plan.isManual ? '#cc8844' : (firstCp ? firstCp.cd.dot : '#e8a020');
    var doseLabel = plan.doseSource === 'personal' ? 'personal' :
                    plan.doseSource === 'population' ? 'pop. avg' :
                    plan.doseSource === 'manual'     ? 'manual'   : 'estimate';

    html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
    html += '<div class="card-dot" style="background:' + planDot + '"></div>';
    html += '<div class="card-title">PLAN</div></div>';
    html += plan.isManual
      ? '<span style="font-size:11px;color:#e8a020;font-weight:700;padding-right:2px">MANUAL OVERRIDE</span>'
      : '<span style="font-size:11px;color:var(--muted2);padding-right:2px">T-Calc optimised</span>';
    html += '</div>';
    html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">';

    plan.compounds.forEach(function(cp) {
      html += '<div style="background:var(--surface2);border-radius:10px;padding:14px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
      html += '<span style="width:9px;height:9px;border-radius:50%;background:' + cp.cd.dot + ';flex-shrink:0;display:inline-block;box-shadow:0 0 8px ' + cp.cd.dot + '88"></span>';
      html += '<span style="font-size:16px;font-weight:700;color:var(--text)">' + _esc(cp.cd.name) + '</span>';
      if (cp.cd.halfLifeStr) html += '<span style="font-size:12px;color:var(--muted2)">t½ ' + _esc(cp.cd.halfLifeStr) + '</span>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
      [{label:'Per injection', value: cp.dosePerInj + ' mg'},
       {label:'Per week',      value: cp.mgPerWeek + ' mg'},
       {label:'Interval',      value: _tcIntervalLabel(cp.intervalDays)}
      ].forEach(function(s) {
        html += '<div style="text-align:center">';
        html += '<div style="font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">' + s.label + '</div>';
        html += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + s.value + '</div>';
        html += '</div>';
      });
      html += '</div>';
      if (cp.costPerWeek !== null) {
        html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline">';
        html += '<span style="font-size:11px;color:var(--muted2)">Est. cost / week</span>';
        html += '<span style="font-size:13px;font-weight:700;color:var(--accent)">' + cp.costPerWeek.toFixed(2) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    });

    if (plan.compounds.length > 1) {
      html += '<div style="text-align:center;font-size:13px;color:var(--muted2)">Total ' + plan.totalMgPerWeek + ' mg/wk · Basis: ' + doseLabel + '</div>';
    } else {
      html += '<div style="text-align:center;font-size:13px;color:var(--muted2)">Basis: ' + doseLabel + '</div>';
    }

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    html += '<div><label style="' + lSty + '">Override dose (mg/wk)</label>';
    html += '<input type="number" min="50" max="1000" step="10" value="' + _esc(_tcp.overrideDoseMgWk) + '" placeholder="' + Math.round(plan.autoMgPerWeek) + ' (auto)" oninput="_tcp.overrideDoseMgWk=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';

    html += '<div><label style="' + lSty + '">Override interval (all)</label>';
    html += '<select onchange="_tcp.overrideIntervalDays=this.value;_tcSaveProfile();buildTCalc()" style="' + iSty + '">';
    html += '<option value=""' + (!_tcp.overrideIntervalDays ? ' selected' : '') + '>Auto — per ester</option>';
    _TC_FREQ_OPTS.forEach(function(f) {
      var v = String(f.days);
      html += '<option value="' + v + '"' + (_tcp.overrideIntervalDays === v ? ' selected' : '') + '>' + _esc(f.label) + '</option>';
    });
    html += '</select></div></div>';

    if (plan.isManual) {
      html += '<button onclick="_tcp.overrideDoseMgWk=\'\';_tcp.overrideIntervalDays=\'\';_tcSaveProfile();buildTCalc()" style="background:none;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:13px;color:var(--muted);cursor:pointer;font-family:inherit;width:100%">↩ Reset to T-Calc auto</button>';
    }
    html += '</div></div>';
  }

  // ── 5. WARNINGS card ──────────────────────────────────────────────────────────
  if (result.warnings.length > 0) {
    html += '<div class="card" style="border:1px solid rgba(204,68,68,0.5)">';
    html += '<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#cc4444"></div><div class="card-title">⚠ WARNINGS</div></div></div>';
    html += '<div style="padding:0 16px 14px;display:flex;flex-direction:column;gap:8px">';
    result.warnings.forEach(function(w) {
      html += '<div style="background:rgba(204,68,68,0.1);border-radius:8px;padding:12px;font-size:13px;color:#ff8888;line-height:1.5">' + _esc(w.message) + '</div>';
    });
    html += '</div></div>';
  }

  // ── 6. HCG card ───────────────────────────────────────────────────────────────
  var hcgSug = result.suggestions.find(function(s){ return s.type==='hcg-missing'||s.type==='hcg-included'; });
  if (hcgSug) {
    var hcgGreen  = hcgSug.type === 'hcg-included';
    var hcgColor  = hcgGreen ? '#44cc88' : '#e8a020';
    var hcgBorder = hcgGreen ? 'rgba(68,204,136,0.3)' : 'rgba(232,160,32,0.4)';
    html += '<div class="card" style="border:1px solid ' + hcgBorder + '">';
    html += '<div class="card-header"><div class="card-title-wrap">';
    html += '<div class="card-dot" style="background:' + hcgColor + '"></div>';
    html += '<div class="card-title">HCG</div></div>';
    html += '<span style="font-size:11px;color:' + hcgColor + ';font-weight:700;padding-right:2px">' + (hcgGreen ? '✓ IN INVENTORY' : 'ALWAYS RECOMMENDED') + '</span>';
    html += '</div>';
    html += '<div style="padding:0 16px 14px;font-size:13px;color:var(--muted);line-height:1.6">' + _esc(hcgSug.message) + '</div>';
    html += '</div>';
  }

  // ── 7. NOTES card ─────────────────────────────────────────────────────────────
  var otherSugs = result.suggestions.filter(function(s){ return s.type!=='hcg-missing'&&s.type!=='hcg-included'; });
  if (otherSugs.length > 0) {
    html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#8899cc"></div><div class="card-title">NOTES</div></div></div>';
    html += '<div style="padding:0 16px 14px;display:flex;flex-direction:column;gap:8px">';
    otherSugs.forEach(function(s) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:13px;color:var(--muted);line-height:1.5">' + _esc(s.message) + '</div>';
    });
    html += '</div></div>';
  }

  // ── 8. PLASMA CURVE + SCHEDULE ────────────────────────────────────────────────
  if (plan && curve && stats) {
    var ptr = stats.peakTroughRatio;
    var ptrColor = ptr > 2.5 ? '#cc4444' : ptr > 1.8 ? '#e8a020' : '#44cc88';
    var firstCpForChart = plan.compounds[0];
    var curveSubtitle = plan.compounds.length > 1
      ? plan.compounds.map(function(cp){ return cp.cd.name; }).join(' + ')
      : (firstCpForChart && firstCpForChart.cd.halfLifeStr ? 't½ ' + firstCpForChart.cd.halfLifeStr : '');

    html += '<div class="card"><div class="card-header"><div class="card-title-wrap">';
    html += '<div class="card-dot" style="background:' + (firstCpForChart ? firstCpForChart.cd.dot : '#e8a020') + '"></div>';
    html += '<div class="card-title">PLASMA CURVE</div></div>';
    if (curveSubtitle) html += '<span style="font-size:11px;color:var(--muted2)">' + _esc(curveSubtitle) + '</span>';
    html += '</div>';
    html += '<div style="padding:2px 16px 10px"><canvas id="tc-chart" style="width:100%;display:block;"></canvas></div>';

    html += '<div style="padding:0 16px 14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
    [{label:'PEAK',value:Math.round(stats.peak)+' mg'},
     {label:'TROUGH',value:Math.round(stats.trough)+' mg'},
     {label:'P:T',value:ptr.toFixed(1)+'×',color:ptrColor},
     {label:'TOTAL',value:Math.round(stats.totalMg)+' mg'}
    ].forEach(function(s) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">';
      html += '<div style="font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px">' + s.label + '</div>';
      html += '<div style="font-size:15px;font-weight:700;color:' + (s.color||'var(--text)') + '">' + s.value + '</div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div style="padding:0 16px 12px;font-size:12px;color:var(--muted2)">';
    html += 'SS: ' + Math.round(stats.ssTrough) + '–' + Math.round(stats.ssPeak) + ' mg';
    if (stats.firstInBandWeek !== null) html += ' · steady state ~W' + stats.firstInBandWeek;
    if (plan.ftFrac && stats.ssTrough > 0) {
      html += ' · est. free T ' + Math.round(stats.ssTrough * plan.ftFrac * 1000) + '–' + Math.round(stats.ssPeak * plan.ftFrac * 1000) + ' pmol/L';
    }
    html += '</div></div>';

    var rampWeeks    = Math.min(6, Math.max(2, Math.round(plan.cycleDays / 7 / 4)));
    var showCompound = plan.compounds.length > 1;

    html += '<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:#888"></div>';
    html += '<div class="card-title">SCHEDULE</div></div>';
    html += '<span style="font-size:11px;color:var(--muted2);padding-right:2px">' + sched.length + ' injections</span>';
    html += '</div>';
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    (showCompound ? ['DAY','WEEK','COMPOUND','DOSE',''] : ['DAY','WEEK','DOSE','']).forEach(function(h, i) {
      var isRight = showCompound ? (i === 3) : (i === 2);
      html += '<th style="padding:8px 16px;text-align:' + (isRight?'right':'left') + ';font-size:10px;color:var(--muted2);font-weight:600;letter-spacing:0.5px">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    sched.forEach(function(inj, i) {
      var isLast  = i === sched.length - 1;
      var weekNum = Math.floor(inj.day / 7) + 1;
      var isRamp  = inj.day < rampWeeks * 7 && inj.dose < inj.dosePerInj * 0.98;
      html += '<tr style="border-bottom:' + (isLast ? 'none' : '1px solid var(--border)') + '">';
      html += '<td style="padding:8px 16px;color:var(--text);font-size:14px">Day ' + (inj.day + 1) + '</td>';
      html += '<td style="padding:8px 16px;color:var(--muted);font-size:14px">W' + weekNum + '</td>';
      if (showCompound) {
        html += '<td style="padding:8px 16px;font-size:13px">';
        html += '<span style="display:inline-flex;align-items:center;gap:5px">';
        html += '<span style="width:7px;height:7px;border-radius:50%;background:' + (inj.dot||'#e8a020') + ';display:inline-block;flex-shrink:0"></span>';
        html += '<span style="color:var(--muted)">' + _esc(inj.name) + '</span></span></td>';
      }
      html += '<td style="padding:8px 16px;text-align:right;font-weight:700;color:var(--text);font-size:14px">' + inj.dose + ' mg</td>';
      html += '<td style="padding:8px 16px;color:var(--muted2);font-size:11px">' + (isRamp ? 'ramp' : '') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div style="padding:14px 16px">';
    html += '<button onclick="_tcExportPlan()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:13px 20px;font-size:14px;font-weight:700;cursor:pointer;width:100%;font-family:inherit">Export as TRT Stack</button>';
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
