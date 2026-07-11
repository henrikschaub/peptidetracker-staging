// tab-tcalc.js — Smart T-Calc: goal-based PK optimizer

// ── Profile state (persisted to backend + localStorage cache) ─────────────────

var _tcp = {
  totalT:              '',
  shbg:                '',
  birthYear:           '',
  measuredFT:          '',
  currentDoseMgWk:     '',
  targetFT:            '',
  inventory:           [],  // [{compId, totalMg, costTotal}, ...]
  cycleType:           'trt',
  cycleDays:           168,
  preferredFreqDays:   'auto',
  overrideDoseMgWk:    '',
  overrideIntervalDays: '',
  planCompId:          '',  // kept for backward-compat with saved profiles; ignored
  backboneStartDay:    0,   // days into cycle before first backbone injection (default 0)
  manualLog:           []   // [{compId, doseMg, date}, ...] — manual injection history
};

var _tcpSessionLoaded = false;
var _tcCurrentPlan    = null;
var _tcExtraCatalog   = [];   // extra compounds fetched from /trt-catalog at runtime
var _tcAgeMissing     = false; // true when user-settings returned but no user_age found
var _tcBwOpen         = false; // whether the bloodwork panel is expanded
var _tcBwEntries      = null; // null = not loaded; [] = loaded & empty; [...] = loaded
var _tcBwLoading      = false;
var _tcBwAddExtras    = [];   // custom extra-test rows while add sheet is open
var _tcEditSeriesId = null;   // seriesId currently open in the Edit Series sheet
var _tcChartZoom   = 'whole'; // active zoom level: 'today' | 'week' | 'month' | 'whole'
var _tcChartPanOffset = 0;   // horizontal pan in days (float, only used in zoomed modes)
var _tcGhStack = [];          // [{pepId, startDateStr, interactions, dailyDose}] — SHBG suppressors from active stacks (dailyDose in the compound's doseResponse unit)
var _tcSysInter = null;       // compounds map from /systemic-interactions
var _tcFtBaseline = null;      // age→free-T population baseline (pmol/L) from /systemic-interactions
var _tcActiveStacks = null;   // raw response from /protocol/stacks

// Testosterone → SHBG dose-response model. Exogenous androgens suppress hepatic
// SHBG dose-dependently (SHBG ∝ T^(−β)); this is the dominant driver of free-T
// drift away from a single bloodwork calibration. β is fitted PER USER from their
// own blood tests at runtime (see _tcFitBeta) — the values below are only the
// POPULATION FALLBACK used until a user has ≥2 SHBG labs at different T levels.
// Not tailored to any individual.
var TCALC_TSHBG_BETA    = 0.25;
var TCALC_TSHBG_BETA_LO = 0.15;
var TCALC_TSHBG_BETA_HI = 0.40;
var TCALC_TSHBG_LAG_DAYS = 25;   // SHBG responds over weeks — lag the T level by this τ

// Fit the user's personal SHBG→T dose-response exponent β from their own bloodwork.
// Model: SHBG ∝ totalT^(−β)  ⇒  ln(SHBG) = a − β·ln(totalT). β is the negated slope of a
// least-squares line through the user's (total T, SHBG) blood-test points. The band comes
// from the fit's own scatter (standard error), so it tightens as more labs are logged.
// Returns null when there isn't enough spread/data — the caller then uses the population
// fallback above. This keeps calibration inside the app and adapts to ANY user; nothing
// is hardcoded to a specific person.
function _tcFitBeta(entries) {
  if (!entries || !entries.length) return null;
  var pts = [];
  entries.forEach(function(e) {
    var tt = parseDec(e && e.total_t), sh = parseDec(e && e.shbg);
    if (tt > 0 && sh > 0) pts.push({ x: Math.log(tt), y: Math.log(sh) });
  });
  if (pts.length < 2) return null;
  var xs = pts.map(function(p){ return p.x; });
  if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 0.05) return null; // T levels too similar
  var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(function(p){ sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
  var denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  var slope = (n * sxy - sx * sy) / denom;
  var beta = Math.max(0.05, Math.min(0.60, -slope));   // clamp to a physiological range
  var half;
  if (n >= 3) {
    var intercept = (sy - slope * sx) / n, ssr = 0;
    pts.forEach(function(p){ var pred = intercept + slope * p.x; ssr += (p.y - pred) * (p.y - pred); });
    var seSlope = Math.sqrt((ssr / (n - 2)) / (sxx - sx * sx / n));
    half = Math.max(0.04, Math.min(0.25, seSlope));    // ~1 SE band, clamped
  } else {
    half = 0.10;                                        // two points: no scatter estimate yet
  }
  return { beta: beta, lo: Math.max(0.02, beta - half), hi: Math.min(0.70, beta + half), n: n };
}

// ── Blood test catalogue ───────────────────────────────────────────────────────
var _TC_BW_TESTS = [
  {name:'Estradiol',          units:['pmol/L','pg/mL']},
  {name:'LH',                 units:['IU/L']},
  {name:'FSH',                units:['IU/L']},
  {name:'Prolactin',          units:['mIU/L','ng/mL']},
  {name:'Progesterone',       units:['nmol/L','ng/mL']},
  {name:'DHT',                units:['nmol/L','pg/mL']},
  {name:'Cortisol',           units:['nmol/L','µg/dL']},
  {name:'IGF-1',              units:['nmol/L','ng/mL']},
  {name:'TSH',                units:['mIU/L']},
  {name:'Free T4',            units:['pmol/L','ng/dL']},
  {name:'Free T3',            units:['pmol/L','pg/mL']},
  {name:'Hematocrit',         units:['%']},
  {name:'Hemoglobin',         units:['g/dL','g/L']},
  {name:'RBC',                units:['10¹²/L']},
  {name:'WBC',                units:['10⁹/L']},
  {name:'Platelets',          units:['10⁹/L']},
  {name:'ALT',                units:['U/L']},
  {name:'AST',                units:['U/L']},
  {name:'GGT',                units:['U/L']},
  {name:'ALP',                units:['U/L']},
  {name:'Bilirubin',          units:['µmol/L','mg/dL']},
  {name:'Creatinine',         units:['µmol/L','mg/dL']},
  {name:'eGFR',               units:['mL/min/1.73m²']},
  {name:'Urea',               units:['mmol/L','mg/dL']},
  {name:'Total Cholesterol',  units:['mmol/L','mg/dL']},
  {name:'LDL',                units:['mmol/L','mg/dL']},
  {name:'HDL',                units:['mmol/L','mg/dL']},
  {name:'Triglycerides',      units:['mmol/L','mg/dL']},
  {name:'Glucose',            units:['mmol/L','mg/dL']},
  {name:'HbA1c',              units:['mmol/mol','%']},
  {name:'Insulin',            units:['pmol/L','µIU/mL']},
  {name:'Vitamin D',          units:['nmol/L','ng/mL']},
  {name:'Ferritin',           units:['µg/L','ng/mL']},
  {name:'Iron',               units:['µmol/L','µg/dL']},
  {name:'Zinc',               units:['µmol/L']},
  {name:'PSA',                units:['µg/L','ng/mL']},
];

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
  // Fetch extra catalog entries (no auth required — generic PK reference data)
  fetch(AGENT_URL + '/trt-catalog')
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(d) {
      if (!Array.isArray(d)) return;
      _tcExtraCatalog = d;
      buildTCalc();
      // If the inventory overlay was opened before this fetch resolved, refresh it
      if (document.getElementById('tc-inv-overlay')) _tcOpenInventory();
    })
    .catch(function(){});
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
  // Derive birth year from onboarding age in /user-settings
  fetch(AGENT_URL + '/user-settings', {headers: h})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(s) {
      var age = s && parseInt(s['user_age']);
      if (age && age > 0) {
        _tcp.birthYear = new Date().getFullYear() - age;
        _tcAgeMissing = false;
      } else {
        _tcAgeMissing = true;
      }
      buildTCalc();
    })
    .catch(function(){ _tcAgeMissing = true; buildTCalc(); });
  // GH→SHBG interaction parameters (public endpoint, no auth)
  fetch(AGENT_URL + '/systemic-interactions')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d) {
      if (!d || !d.compounds) return;
      _tcSysInter = d.compounds;
      if (d.ftBaseline) _tcFtBaseline = d.ftBaseline;
      _tcComputeGhStack();
      buildTCalc();
    })
    .catch(function(){});
  // Active peptide stacks — find GH compounds for SHBG model
  fetch(AGENT_URL + '/protocol/stacks', {headers: h})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d) {
      if (!d) return;
      _tcActiveStacks = d;
      _tcComputeGhStack();
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

// Saturating Emax dose-response for SHBG suppression: effMaxSupp(dose) = emax·dose/(dose+ed50).
// ed50/emax are calibrated backend-side so effMaxSupp(typicalDose) == the legacy fixed
// maxSuppression, so a user dosed at the reference sees no change; only off-reference doses scale.
function _tcEffMaxSupp(dr, dose) {
  if (!dr || !(dose > 0) || !(dr.ed50 > 0) || !(dr.emax > 0)) return null;
  return dr.emax * dose / (dose + dr.ed50);
}

// Convert an amount between dosing units (mass only; IU is not mass-convertible).
// Units may carry a "/period" suffix (e.g. "mg/week") which is ignored here.
function _tcConvDose(amt, fromU, toU) {
  fromU = String(fromU || '').toLowerCase().split('/')[0].trim();
  toU   = String(toU   || '').toLowerCase().split('/')[0].trim();
  if (fromU === 'µg') fromU = 'mcg';
  if (toU   === 'µg') toU   = 'mcg';
  if (!(amt > 0) || !fromU || !toU) return null;
  if (fromU === toU) return amt;
  if (fromU === 'iu' || toU === 'iu') return null;   // IU ↔ mass is compound-specific — refuse
  var toMg = { mg: 1, mcg: 0.001, g: 1000 };
  if (toMg[fromU] == null || toMg[toU] == null) return null;
  return amt * toMg[fromU] / toMg[toU];
}

// Average daily dose for an SHBG suppressor, expressed in its backend doseResponse unit.
// Chronic SHBG suppression tracks average exposure, so sub-daily schedules are averaged
// over the week (days-per-week / 7). Returns null when the dose can't be resolved or
// converted — the caller then falls back to the fixed maxSuppression.
function _tcSuppDailyDose(inter, kind, obj) {
  var dr = inter && inter.shbg && inter.shbg.doseResponse;
  if (!dr || !dr.unit || !obj) return null;
  var nativeDaily = 0, nativeUnit = '';
  if (kind === 'peptide') {
    var times = obj.times || ['AM'];
    var per = (times.indexOf('AM') >= 0 ? (parseDec(obj.dose_am) || 0) : 0) +
              (times.indexOf('PM') >= 0 ? (parseDec(obj.dose_pm) || 0) : 0);
    var dpw = (obj.days || [0, 1, 2, 3, 4, 5, 6]).length;
    nativeDaily = per * dpw / 7;
    nativeUnit = obj.unit_am || obj.unit_pm || 'mcg';
  } else if (kind === 'compound') {
    var raw = parseDec(obj.dose) || 0;
    var parts = String(obj.unit || 'mg/week').split('/');
    var period = (parts[1] || 'week').toLowerCase();
    var factor = (period === 'day') ? 1 : (period === 'eod' || period === '2day') ? 0.5 : 1 / 7;
    nativeDaily = raw * factor;
    nativeUnit = parts[0] || 'mg';
  } else if (kind === 'supp') {
    var rawS = parseDec(obj.dose) || 0;
    var m = String(obj.dose || '').match(/(mcg|µg|mg|iu|g)/i);
    nativeUnit = m ? m[1] : 'mg';
    var f = (obj.freq === 'weekly') ? 1 / 7 : (obj.freq === 'eod') ? 0.5 : 1;
    nativeDaily = rawS * f;
  }
  return _tcConvDose(nativeDaily, nativeUnit, dr.unit);
}

function _tcComputeGhStack() {
  if (!_tcSysInter) return;
  _tcGhStack = [];
  if (_tcActiveStacks) {
  var idxs = _tcActiveStacks.active_indices ||
    (_tcActiveStacks.active_index != null ? [_tcActiveStacks.active_index] : []);
  idxs.forEach(function(idx) {
    var stack = (_tcActiveStacks.stacks || [])[idx];
    if (!stack) return;
    var cycleStart = stack.cycle_start || '';
    // Peptides — each entry has its own start_date
    (stack.peptides || []).forEach(function(pep) {
      var pepId = pep.id;
      if (!pepId || !_tcSysInter[pepId]) return;
      var inter = _tcSysInter[pepId];
      if (!inter.shbg || inter.shbg.direction !== 'suppress') return;
      _tcGhStack.push({pepId: pepId, startDateStr: pep.start_date || cycleStart, interactions: inter, dailyDose: _tcSuppDailyDose(inter, 'peptide', pep)});
    });
    // Enhanced compounds — no per-compound start_date, fall back to cycle_start
    if (stack.enhanced && stack.enhanced.compounds) {
      (stack.enhanced.compounds || []).forEach(function(c) {
        var cId = c.id;
        if (!cId || !_tcSysInter[cId]) return;
        var inter = _tcSysInter[cId];
        if (!inter.shbg || inter.shbg.direction !== 'suppress') return;
        _tcGhStack.push({pepId: cId, startDateStr: c.start_date || cycleStart, interactions: inter, dailyDose: _tcSuppDailyDose(inter, 'compound', c)});
      });
    }
    // TRT compounds — same fallback
    if (stack.trt && stack.trt.compounds) {
      (stack.trt.compounds || []).forEach(function(c) {
        var cId = c.id;
        if (!cId || !_tcSysInter[cId]) return;
        var inter = _tcSysInter[cId];
        if (!inter.shbg || inter.shbg.direction !== 'suppress') return;
        _tcGhStack.push({pepId: cId, startDateStr: c.start_date || cycleStart, interactions: inter, dailyDose: _tcSuppDailyDose(inter, 'compound', c)});
      });
    }
  });
  }
  // Over-the-counter supplements that affect SHBG (e.g. Boron). Uses the same
  // systemic-interaction model as compounds — each active supplement whose id has
  // an SHBG interaction is added to the free-T model at its own start date.
  var _supps = (typeof _supplements !== 'undefined' && _supplements) ? _supplements : [];
  _supps.forEach(function(s) {
    if (!s || !s.supp_id) return;
    var inter = _tcSysInter[s.supp_id];
    if (!inter || !inter.shbg || inter.shbg.direction !== 'suppress') return;
    _tcGhStack.push({pepId: 'supp_' + s.supp_id, startDateStr: s.start_date || '', interactions: inter, dailyDose: _tcSuppDailyDose(inter, 'supp', s)});
  });
}

// ── Compound helpers ──────────────────────────────────────────────────────────

function _tcCompInfo(compId) {
  if (compId === 'hcg') {
    return {id:'hcg', name:'HCG', dot:'#44cc88', halfLifeDays:2.5, halfLifeStr:'~60 hours'};
  }
  // Extra catalog entries (fetched from backend) take priority over hardcoded fallbacks
  var extra = _tcExtraCatalog.find(function(x){ return x.id === compId; });
  if (extra) {
    return {
      id:              compId,
      name:            extra.name,
      dot:             extra.dot,
      halfLifeDays:    extra.halfLifeDays || 1,
      halfLifeStr:     extra.halfLife || '',
      bioavailability: extra.bioavailability || 1,
      maxDailyDoseMg:  extra.maxDailyDoseMg || null,
      usageNote:       extra.usageNote || ''
    };
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

function _tcKa(halfLifeDays) {
  // Absorption rate constant (1/day) for 1-compartment depot model.
  // Ka values calibrated to known Tmax per ester class:
  //   Nebido (hl≥20d) → tmax≈7d | Cypionate (hl≥9d) → tmax≈2d
  //   Enanthate (hl≥3d) → tmax≈1d | Propionate (hl≥1d) → tmax≈0.4d | Gel → near-immediate
  if (halfLifeDays >= 20) return 0.40;
  if (halfLifeDays >= 9)  return 1.50;
  if (halfLifeDays >= 3)  return 3.00;
  if (halfLifeDays >= 1)  return 8.00;
  return 15.0;
}

function _tcPkConc(dose, ka, ke, dt) {
  // 1-compartment first-order absorption model:
  // C(dt) = dose * ka/(ka-ke) * (exp(-ke*dt) - exp(-ka*dt))
  if (dt < 0) return 0;
  if (Math.abs(ka - ke) < 1e-9) return dose * ke * dt * Math.exp(-ke * dt);
  return dose * ka / (ka - ke) * (Math.exp(-ke * dt) - Math.exp(-ka * dt));
}

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
  var trtIds = ((typeof TRT_CAT !== 'undefined') ? TRT_CAT.map(function(c){ return c.id; }) : [])
    .concat(_tcExtraCatalog.map(function(c){ return c.id; }));
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
            '<input type="text" inputmode="decimal" value="' + _esc(inv.totalMg || '') + '" placeholder="' + (isHCG ? '5000' : '1000') + '" onchange="_tcInvSetField(\'' + id + '\',\'totalMg\',this.value)" style="' + iSty + '">' +
          '</div>' +
          '<div>' +
            '<div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">TOTAL PAID</div>' +
            '<input type="text" inputmode="decimal" value="' + _esc(inv.costTotal || '') + '" placeholder="e.g. 45" onchange="_tcInvSetField(\'' + id + '\',\'costTotal\',this.value)" style="' + iSty + '">' +
          '</div>' +
        '</div>' +
        (cd.usageNote ? '<div style="font-size:10px;color:#555;margin-top:10px;line-height:1.4">' + _esc(cd.usageNote) + '</div>' : '') +
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

// ── Manual injection log overlay ──────────────────────────────────────────────

function _tcManualComps() {
  var ids = [];
  ((typeof TRT_CAT !== 'undefined') ? TRT_CAT : []).forEach(function(c) {
    if (c.id !== 'hcg') ids.push(c.id);
  });
  _tcExtraCatalog.forEach(function(c) {
    if (c.id !== 'hcg' && ids.indexOf(c.id) === -1) ids.push(c.id);
  });
  return ids;
}

function _tcOpenManualLog() {
  var log   = _tcp.manualLog || [];
  var comps = _tcManualComps();
  var iSty  = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:7px 10px;color:#ccc;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box';

  var html = '<div id="tc-log-overlay" onclick="if(event.target===this)_tcCloseManualLog()" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);backdrop-filter:blur(16px);overflow-y:auto;-webkit-overflow-scrolling:touch">' +
    '<div style="max-width:480px;margin:0 auto;padding:16px 16px 60px">';

  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 24px">' +
    '<div>' +
      '<div style="font-size:11px;color:#444;letter-spacing:2px;font-weight:700;margin-bottom:4px">T-CALC</div>' +
      '<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.5px">INJECTION LOG</div>' +
      '<div style="font-size:12px;color:#444;margin-top:4px">' + log.length + ' injection' + (log.length === 1 ? '' : 's') + ' logged</div>' +
    '</div>' +
    '<button onclick="_tcCloseManualLog()" style="background:#111;border:1px solid #333;border-radius:10px;color:#777;font-size:24px;cursor:pointer;padding:4px 14px;line-height:1;font-family:inherit">×</button>' +
  '</div>';

  if (log.length > 0) {
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">';
    log.forEach(function(entry, idx) {
      var cd = _tcCompInfo(entry.compId || (comps[0] || 'topical'));
      var compSelect = '<select onchange="_tcSetManualField(' + idx + ',\'compId\',this.value)" style="' + iSty + ';flex:1;min-width:0">';
      comps.forEach(function(id) {
        var n = _tcCompInfo(id).name;
        compSelect += '<option value="' + _esc(id) + '"' + (entry.compId === id ? ' selected' : '') + '>' + _esc(n) + '</option>';
      });
      compSelect += '</select>';

      html += '<div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:12px;padding:12px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + ';display:inline-block;flex-shrink:0"></span>' +
          compSelect +
          '<button onclick="_tcConfirmRemove(' + idx + ')" style="background:none;border:none;color:#444;font-size:18px;cursor:pointer;padding:0;flex-shrink:0;line-height:1">✕</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div style="min-width:0"><div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">DOSE (mg)</div>' +
          '<input type="text" inputmode="decimal" value="' + _esc(String(entry.doseMg || '')) + '" placeholder="e.g. 100" onchange="_tcSetManualField(' + idx + ',\'doseMg\',+this.value)" style="' + iSty + ';width:100%"></div>' +
          '<div style="min-width:0"><div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">DATE</div>' +
          '<input type="date" value="' + _esc(entry.date || '') + '" onchange="_tcSetManualField(' + idx + ',\'date\',this.value)" style="' + iSty + ';width:100%"></div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:32px 0;color:#444;font-size:13px">No injections logged yet.<br><span style="font-size:12px;color:#2a2a2a">Tap + ADD INJECTION to start.</span></div>';
  }

  html += '<button onclick="_tcAddManualEntry()" style="width:100%;background:#0d0d0d;border:1px dashed #2a2a2a;border-radius:10px;color:#555;font-size:13px;font-weight:700;padding:13px;cursor:pointer;font-family:inherit;letter-spacing:0.5px;margin-bottom:20px">+ ADD INJECTION</button>';

  var validLog = log.filter(function(e){ return e.date && e.doseMg && parseDec(e.doseMg) > 0; });
  if (validLog.length > 0) {
    html += '<div style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:14px;padding:14px">' +
      '<div style="font-size:10px;color:#444;letter-spacing:1.8px;font-weight:700;margin-bottom:10px">PLASMA CURVE</div>' +
      '<canvas id="tc-manual-chart" style="width:100%;display:block;"></canvas>' +
    '</div>';
  }

  html += '</div></div>';

  var existing = document.getElementById('tc-log-overlay');
  if (existing) existing.remove();
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  document.body.appendChild(tmp.firstChild);

  if (validLog.length > 0) {
    requestAnimationFrame(function() { _tcDrawManualChart('tc-manual-chart', validLog); });
  }
}

function _tcCloseManualLog() {
  var el = document.getElementById('tc-log-overlay');
  if (el) el.remove();
}

var _tcAddSheet = null;

function _tcAddManualEntry() { _tcShowAddSheet(); }

function _tcShowAddSheet() {
  if (document.getElementById('tc-add-sheet-overlay')) return;
  var comps = _tcManualComps();
  if (!comps.length) return;
  var defaultComp = comps[0];
  var defaultDate;
  var existingDates = (_tcp.manualLog||[]).map(function(e){ return e.date; }).filter(Boolean).sort();
  if (existingDates.length > 0) {
    var p = existingDates[existingDates.length - 1].split('-');
    var next = new Date(+p[0], +p[1] - 1, +p[2] + 1);
    defaultDate = next.getFullYear() + '-' +
      String(next.getMonth() + 1).padStart(2, '0') + '-' +
      String(next.getDate()).padStart(2, '0');
  } else {
    defaultDate = new Date().toISOString().slice(0, 10);
  }
  _tcAddSheet = {isSeries: false};
  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:15px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';
  var compOpts = comps.map(function(id){ var n=_tcCompInfo(id).name; return '<option value="'+_esc(id)+'">'+_esc(n)+'</option>'; }).join('');
  var ol = document.createElement('div');
  ol.id = 'tc-add-sheet-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  ol.onclick = function(e){ if(e.target===ol)_tcCloseAddSheet(); };
  ol.innerHTML =
    '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 36px;max-height:85vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
    '<div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--text)">ADD INJECTION</div>' +
    '<button onclick="_tcCloseAddSheet()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button>' +
    '</div>' +
    '<div style="margin-bottom:14px"><label style="'+lSty+'">COMPOUND</label>' +
    '<select id="tc-as-comp" style="'+iSty+'">'+compOpts+'</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
    '<div style="min-width:0"><label style="'+lSty+'">DOSE (mg)</label>' +
    '<input id="tc-as-dose" type="text" inputmode="decimal" placeholder="e.g. 100" style="'+iSty+'"></div>' +
    '<div style="min-width:0"><label style="'+lSty+'">DATE</label>' +
    '<input id="tc-as-date" type="date" value="'+_esc(defaultDate)+'" style="'+iSty+'"></div>' +
    '</div>' +
    '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px">' +
    '<div onclick="_tcAsToggle(false)" style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)">' +
    '<div id="tc-as-r1" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--accent);background:var(--accent);flex-shrink:0"></div>' +
    '<div><div style="font-size:13px;font-weight:600;color:var(--text)">Single injection</div><div style="font-size:11px;color:var(--muted2)">One entry logged</div></div>' +
    '</div>' +
    '<div onclick="_tcAsToggle(true)" style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:10px">' +
    '<div id="tc-as-r2" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0"></div>' +
    '<div><div style="font-size:13px;font-weight:600;color:var(--text)">Recurring series</div><div style="font-size:11px;color:var(--muted2)">Log multiple injections at once</div></div>' +
    '</div>' +
    '</div>' +
    '<div id="tc-as-series-opts" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="'+lSty+'">INJECTIONS</label>' +
    '<input id="tc-as-count" type="number" min="2" max="365" step="1" value="10" style="'+iSty+'"></div>' +
    '<div><label style="'+lSty+'">EVERY (DAYS)</label>' +
    '<input id="tc-as-interval" type="number" min="1" max="90" step="1" value="2" style="'+iSty+'"></div>' +
    '</div></div>' +
    '<button onclick="_tcConfirmAddSheet()" style="width:100%;background:linear-gradient(135deg,#6688cc,#4466aa);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;letter-spacing:0.5px;padding:14px;cursor:pointer;font-family:inherit">ADD</button>' +
    '</div>';
  document.body.appendChild(ol);
}

function _tcAsToggle(isSeries) {
  var r1=document.getElementById('tc-as-r1'); var r2=document.getElementById('tc-as-r2');
  var opts=document.getElementById('tc-as-series-opts');
  if(!r1||!r2||!opts)return;
  if(isSeries){r1.style.background='';r1.style.borderColor='var(--border)';r2.style.background='var(--accent)';r2.style.borderColor='var(--accent)';opts.style.display='block';}
  else{r1.style.background='var(--accent)';r1.style.borderColor='var(--accent)';r2.style.background='';r2.style.borderColor='var(--border)';opts.style.display='none';}
  if(_tcAddSheet)_tcAddSheet.isSeries=isSeries;
}

function _tcCloseAddSheet() {
  var ol=document.getElementById('tc-add-sheet-overlay');if(ol)ol.remove();_tcAddSheet=null;
}

function _tcConfirmAddSheet() {
  var compEl=document.getElementById('tc-as-comp');
  var doseEl=document.getElementById('tc-as-dose');
  var dateEl=document.getElementById('tc-as-date');
  var countEl=document.getElementById('tc-as-count');
  var intervalEl=document.getElementById('tc-as-interval');
  var compId=compEl?compEl.value:'';
  var doseMg=doseEl?parseDec(doseEl.value):0;
  var startDate=dateEl?dateEl.value:'';
  var isSeries=_tcAddSheet&&_tcAddSheet.isSeries;
  if(!compId||!startDate||!(doseMg>0)){return;}
  if(!_tcp.manualLog)_tcp.manualLog=[];
  if(!isSeries){
    _tcp.manualLog.push({compId:compId,doseMg:doseMg,date:startDate});
  }else{
    var count=countEl?Math.max(2,parseInt(countEl.value)||10):10;
    var intervalDays=intervalEl?Math.max(1,parseInt(intervalEl.value)||2):2;
    var seriesId=Date.now().toString(36);
    var sp=startDate.split('-');
    for(var i=0;i<count;i++){
      var sd=new Date(+sp[0],+sp[1]-1,+sp[2]+i*intervalDays);
      var ds=sd.getFullYear()+'-'+String(sd.getMonth()+1).padStart(2,'0')+'-'+String(sd.getDate()).padStart(2,'0');
      _tcp.manualLog.push({compId:compId,doseMg:doseMg,date:ds,seriesId:seriesId});
    }
  }
  _tcp.manualLog.sort(function(a,b){return(a.date||'')<(b.date||'')?-1:(a.date||'')>(b.date||'')?1:0;});
  _tcSaveProfile();_tcCloseAddSheet();buildTCalc();_tcSyncLogToBackend();
}

function _tcConfirmRemove(idx) {
  var ex = document.getElementById('tc-del-confirm');
  if (ex) ex.remove();
  var entry = _tcp.manualLog && _tcp.manualLog[idx];
  var sid = entry && entry.seriesId;
  var seriesCount = sid ? _tcp.manualLog.filter(function(e){ return e.seriesId===sid; }).length : 0;
  var d = document.createElement('div');
  d.id = 'tc-del-confirm';
  d.style.cssText = 'position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML =
    '<div style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center">' +
      '<div style="font-size:13px;color:var(--accent);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">Delete this injection?</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:20px">This cannot be undone.</div>' +
      (sid && seriesCount > 1 ?
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveManualEntry(' + idx + ')" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#ccc;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete this entry only</button>' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveSeries(\''+sid+'\')" style="background:var(--danger,#ef4444);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete all '+seriesCount+' in series</button>' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove()" style="background:none;border:none;color:#555;font-size:13px;cursor:pointer;padding:8px;font-family:inherit">Cancel</button>' +
        '</div>'
      :
        '<div style="display:flex;gap:10px">' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove()" style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Cancel</button>' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveManualEntry(' + idx + ')" style="flex:1;background:var(--accent);border:none;border-radius:10px;color:#000;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete</button>' +
        '</div>'
      ) +
    '</div>';
  document.body.appendChild(d);
}

function _tcRemoveManualEntry(idx) {
  if (!_tcp.manualLog) return;
  _tcp.manualLog.splice(idx, 1);
  _tcSaveProfile();
  buildTCalc();
  _tcSyncLogToBackend();
}

function _tcRemoveSeries(seriesId) {
  if (!_tcp.manualLog || !seriesId) return;
  _tcp.manualLog = _tcp.manualLog.filter(function(e){ return e.seriesId !== seriesId; });
  _tcSaveProfile();
  buildTCalc();
  _tcSyncLogToBackend();
}

function _tcOpenEditSeriesSheet(sid) {
  if (!_tcp || !_tcp.manualLog) return;
  var entries = _tcp.manualLog.filter(function(e){ return e.seriesId === sid; }).sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : (a.date||'') > (b.date||'') ? 1 : 0; });
  if (!entries.length) return;
  var first = entries[0];
  var compId = first.compId;
  var doseMg = first.doseMg || '';
  var startDate = first.date || new Date().toISOString().slice(0,10);
  var count = entries.length;
  var interval = 2;
  if (entries.length >= 2) {
    var p0 = (entries[0].date||'').split('-'), p1 = (entries[1].date||'').split('-');
    var d0 = new Date(+p0[0],+p0[1]-1,+p0[2]), d1 = new Date(+p1[0],+p1[1]-1,+p1[2]);
    interval = Math.max(1, Math.round((d1-d0)/86400000));
  }
  _tcEditSeriesId = sid;
  var comps = _tcManualComps();
  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:15px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';
  var compOpts = comps.map(function(id){ var n=_tcCompInfo(id).name; return '<option value="'+_esc(id)+'"'+(id===compId?' selected':'')+'>'+_esc(n)+'</option>'; }).join('');
  var ol = document.createElement('div');
  ol.id = 'tc-edit-series-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  ol.onclick = function(e){ if(e.target===ol)_tcCloseEditSeriesSheet(); };
  ol.innerHTML =
    '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 36px;max-height:85vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
    '<div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--text)">EDIT SERIES</div>' +
    '<button onclick="_tcCloseEditSeriesSheet()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button>' +
    '</div>' +
    '<div style="margin-bottom:14px"><label style="'+lSty+'">COMPOUND</label>' +
    '<select id="tc-es-comp" style="'+iSty+'">'+compOpts+'</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
    '<div style="min-width:0"><label style="'+lSty+'">DOSE (mg)</label>' +
    '<input id="tc-es-dose" type="text" inputmode="decimal" placeholder="e.g. 100" value="'+_esc(String(doseMg))+'" style="'+iSty+'"></div>' +
    '<div style="min-width:0"><label style="'+lSty+'">START DATE</label>' +
    '<input id="tc-es-date" type="date" value="'+_esc(startDate)+'" style="'+iSty+'"></div>' +
    '</div>' +
    '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="'+lSty+'">INJECTIONS</label>' +
    '<input id="tc-es-count" type="number" min="2" max="365" step="1" value="'+_esc(String(count))+'" style="'+iSty+'"></div>' +
    '<div><label style="'+lSty+'">EVERY (DAYS)</label>' +
    '<input id="tc-es-interval" type="number" min="1" max="90" step="1" value="'+_esc(String(interval))+'" style="'+iSty+'"></div>' +
    '</div></div>' +
    '<button onclick="_tcSaveEditSeries()" style="width:100%;background:linear-gradient(135deg,#6688cc,#4466aa);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;letter-spacing:0.5px;padding:14px;cursor:pointer;font-family:inherit">SAVE</button>' +
    '</div>';
  document.body.appendChild(ol);
}

function _tcCloseEditSeriesSheet() {
  var ol=document.getElementById('tc-edit-series-overlay');if(ol)ol.remove();_tcEditSeriesId=null;
}

function _tcShowSeriesDetail(sid) {
  if (!_tcp || !_tcp.manualLog) return;
  var entries = _tcp.manualLog.filter(function(e){ return e.seriesId === sid; }).sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : (a.date||'') > (b.date||'') ? 1 : 0; });
  if (!entries.length) return;
  var mcd = _tcCompInfo(entries[0].compId || '');
  var fmtD = function(iso){ if(!iso)return''; var p=iso.split('-'); var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return parseInt(p[2],10)+' '+M[parseInt(p[1],10)-1]; };
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase';
  var listHtml = entries.map(function(e, i){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<div style="'+lSty+'">INJ ' + (i+1) + '</div>' +
      '<div style="font-size:13px;font-weight:600;color:var(--text)">' + fmtD(e.date||'') + '</div>' +
      '<div style="font-size:13px;font-weight:600;color:#6688cc">' + _esc(String(e.doseMg||'')) + ' mg</div>' +
      '</div>';
  }).join('');
  var ol = document.createElement('div');
  ol.id = 'tc-series-detail-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  ol.onclick = function(e){ if(e.target===ol) ol.remove(); };
  ol.innerHTML =
    '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 36px;max-height:80vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<div><div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--text)">SERIES INJECTIONS</div>' +
    '<div style="font-size:11px;color:var(--muted2);margin-top:2px">' + _esc(mcd.name) + ' · ' + entries.length + ' injections</div></div>' +
    '<button onclick="document.getElementById(\'tc-series-detail-overlay\').remove()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button>' +
    '</div>' + listHtml + '</div>';
  document.body.appendChild(ol);
}

function _tcSetChartZoom(z) {
  _tcChartZoom = z;
  _tcChartPanOffset = 0;
  var validLog = (_tcp && _tcp.manualLog) ? _tcp.manualLog.filter(function(e){ return e.date && e.doseMg && parseDec(e.doseMg) > 0; }) : [];
  _tcDrawManualChart('tc-main-chart', validLog, z);
  _tcAttachPanListeners(document.getElementById('tc-main-chart'));
  ['today','week','month','whole'].forEach(function(zz) {
    var btn = document.getElementById('tc-zoom-' + zz);
    if (!btn) return;
    btn.style.background   = zz === z ? 'rgba(102,136,204,0.25)' : 'none';
    btn.style.color        = zz === z ? '#6688cc' : 'var(--muted2)';
    btn.style.borderColor  = zz === z ? '#6688cc66' : 'var(--border)';
  });
}

// Steady-state average reference line — shown by default, hideable via the chart
// checkbox. Read the raw flag (getData's `|| default` would turn a stored false
// back into true, so check the string directly). Default = shown.
function _tcShowAvg() {
  try { return localStorage.getItem('tc-avg-line') !== 'false'; } catch (e) { return true; }
}
function _tcToggleAvgLine(el) {
  var v = el ? !!el.checked : !_tcShowAvg();
  setData('tc-avg-line', v);
  if (typeof pushPepSettingsToAgent === 'function') pushPepSettingsToAgent({ 'tc-avg-line': v });
  var validLog = (_tcp && _tcp.manualLog) ? _tcp.manualLog.filter(function(e){ return e.date && e.doseMg && parseDec(e.doseMg) > 0; }) : [];
  _tcDrawManualChart('tc-main-chart', validLog, _tcChartZoom);
}

function _tcAttachPanListeners(canvas) {
  if (!canvas) return;
  if (canvas._tcTouchStart) {
    canvas.removeEventListener('touchstart', canvas._tcTouchStart);
    canvas.removeEventListener('touchmove', canvas._tcTouchMove);
    canvas.removeEventListener('touchend', canvas._tcTouchEnd);
    canvas.removeEventListener('mousedown', canvas._tcMouseDown);
    canvas.removeEventListener('mousemove', canvas._tcMouseMove);
    canvas.removeEventListener('mouseup', canvas._tcMouseEnd);
    canvas._tcTouchStart = null;
  }
  var state = canvas._tcPanState;
  if (!state || state.zoom === 'whole') { canvas.style.cursor = ''; canvas.style.touchAction = ''; return; }
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'pan-y';
  var _pDX = null, _pDY = null, _pOff = null;
  canvas._tcTouchStart = function(e) {
    var t = e.touches ? e.touches[0] : e;
    _pDX = t.clientX; _pDY = t.clientY; _pOff = _tcChartPanOffset;
  };
  canvas._tcTouchMove = function(e) {
    if (_pDX === null) return;
    var t = e.touches ? e.touches[0] : e;
    var dx = t.clientX - _pDX, dy = t.clientY - (_pDY || 0);
    if (e.touches && Math.abs(dx) <= Math.abs(dy)) return;
    if (e.preventDefault) e.preventDefault();
    var s = canvas._tcPanState || state;
    _tcChartPanOffset = _pOff - dx * ((s.xEnd - s.xStart) / (s.cW || 250));
    var vl = (_tcp && _tcp.manualLog) ? _tcp.manualLog.filter(function(e2){ return e2.date && e2.doseMg && parseDec(e2.doseMg) > 0; }) : [];
    _tcDrawManualChart(canvas.id, vl, _tcChartZoom);
  };
  canvas._tcTouchEnd = function() { _pDX = null; };
  canvas._tcMouseDown = canvas._tcTouchStart;
  canvas._tcMouseMove = function(e) { if (e.buttons & 1) canvas._tcTouchMove(e); };
  canvas._tcMouseEnd = canvas._tcTouchEnd;
  canvas.addEventListener('touchstart', canvas._tcTouchStart, {passive: true});
  canvas.addEventListener('touchmove', canvas._tcTouchMove, {passive: false});
  canvas.addEventListener('touchend', canvas._tcTouchEnd);
  canvas.addEventListener('mousedown', canvas._tcMouseDown);
  canvas.addEventListener('mousemove', canvas._tcMouseMove);
  canvas.addEventListener('mouseup', canvas._tcMouseEnd);
}

function _tcSaveEditSeries() {
  var sid = _tcEditSeriesId;
  if (!sid || !_tcp || !_tcp.manualLog) return;
  var compEl=document.getElementById('tc-es-comp');
  var doseEl=document.getElementById('tc-es-dose');
  var dateEl=document.getElementById('tc-es-date');
  var countEl=document.getElementById('tc-es-count');
  var intervalEl=document.getElementById('tc-es-interval');
  var compId=compEl?compEl.value:'';
  var doseMg=doseEl?parseDec(doseEl.value):0;
  var startDate=dateEl?dateEl.value:'';
  var count=countEl?Math.max(2,parseInt(countEl.value)||10):10;
  var intervalDays=intervalEl?Math.max(1,parseInt(intervalEl.value)||2):2;
  if(!compId||!startDate||!(doseMg>0)){return;}
  _tcp.manualLog = _tcp.manualLog.filter(function(e){ return e.seriesId !== sid; });
  var sp=startDate.split('-');
  for(var i=0;i<count;i++){
    var sd=new Date(+sp[0],+sp[1]-1,+sp[2]+i*intervalDays);
    var ds=sd.getFullYear()+'-'+String(sd.getMonth()+1).padStart(2,'0')+'-'+String(sd.getDate()).padStart(2,'0');
    _tcp.manualLog.push({compId:compId,doseMg:doseMg,date:ds,seriesId:sid});
  }
  _tcp.manualLog.sort(function(a,b){return(a.date||'')<(b.date||'')?-1:(a.date||'')>(b.date||'')?1:0;});
  _tcSaveProfile();_tcCloseEditSeriesSheet();buildTCalc();_tcSyncLogToBackend();
}

function _tcConfirmRemoveSeries(sid) {
  var ex = document.getElementById('tc-del-confirm');
  if (ex) ex.remove();
  var count = _tcp.manualLog ? _tcp.manualLog.filter(function(e){ return e.seriesId===sid; }).length : 0;
  var d = document.createElement('div');
  d.id = 'tc-del-confirm';
  d.style.cssText = 'position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML =
    '<div style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center">' +
      '<div style="font-size:13px;color:var(--accent);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">Delete this series?</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:20px">' + count + ' injections will be removed. This cannot be undone.</div>' +
      '<div style="display:flex;gap:10px">' +
      '<button onclick="document.getElementById(\'tc-del-confirm\').remove()" style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Cancel</button>' +
      '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveSeries(\'' + sid + '\')" style="flex:1;background:var(--danger,#ef4444);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(d);
}

function _tcSetManualField(idx, field, val) {
  if (!_tcp.manualLog || !_tcp.manualLog[idx]) return;
  _tcp.manualLog[idx][field] = val;
  _tcSaveProfile();
  if (field === 'compId') {
    buildTCalc();
    _tcSyncLogToBackend();
  } else {
    var validLog = _tcp.manualLog.filter(function(e){ return e.date && e.doseMg && parseDec(e.doseMg) > 0; });
    if (validLog.length > 0 && document.getElementById('tc-main-chart')) {
      _tcDrawManualChart('tc-main-chart', validLog, _tcChartZoom);
    } else {
      buildTCalc();
    }
    _tcSyncLogToBackend();
  }
}

// Toggle bloodwork panel open/closed
function _tcToggleBw() {
  _tcBwOpen = !_tcBwOpen;
  buildTCalc();
}

// ── Bloodwork backend functions ───────────────────────────────────────────────

async function _tcFetchBwEntries() {
  var h = (typeof authHeaders==='function') ? authHeaders() : null;
  if (!h) { _tcBwEntries = []; _tcBwLoading = false; buildTCalc(); return; }
  try {
    var r = await fetch(AGENT_URL + '/bloodwork', {headers: h});
    _tcBwEntries = r.ok ? (await r.json()) : [];
  } catch(_e) { _tcBwEntries = []; }
  _tcBwEntries.sort(function(a,b){ return (b.date||'') < (a.date||'') ? -1 : 1; });
  // Sync most-recent entry into _tcp so calibration code reads correct values
  var latest = _tcBwEntries[0];
  if (latest) {
    if (latest.total_t    != null) _tcp.totalT         = String(latest.total_t);
    if (latest.shbg       != null) _tcp.shbg           = String(latest.shbg);
    if (latest.free_t     != null) _tcp.measuredFT     = String(latest.free_t);
    if (latest.dose_at_bw != null) _tcp.currentDoseMgWk = String(latest.dose_at_bw);
  }
  _tcBwLoading = false;
  buildTCalc();
  // Vitamin D recommendation in the Supplements tab reads from bloodwork too.
  if (typeof buildSupplements === 'function' && typeof _currentTab !== 'undefined' && _currentTab === 'supplements') buildSupplements();
}

function _tcBwOpenAddSheet() {
  _tcBwAddExtras = [];
  var todayStr = new Date().toISOString().slice(0, 10);
  var latest = (_tcBwEntries && _tcBwEntries.length) ? _tcBwEntries[0] : null;
  var defTT   = latest && latest.total_t    != null ? String(latest.total_t)    : '';
  var defSHBG = latest && latest.shbg       != null ? String(latest.shbg)       : '';
  var defFT   = latest && latest.free_t     != null ? String(latest.free_t)     : '';
  var defDose = latest && latest.dose_at_bw != null ? String(latest.dose_at_bw) : '';
  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:15px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';
  var ol = document.createElement('div');
  ol.id = 'tc-bw-add-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  ol.onclick = function(e){ if(e.target===ol) _tcBwCloseAddSheet(); };
  ol.innerHTML =
    '<div id="tc-bw-add-sheet" style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 36px;max-height:85vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
    '<div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--text)">ADD BLOOD TEST</div>' +
    '<button onclick="_tcBwCloseAddSheet()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button>' +
    '</div>' +
    '<div style="margin-bottom:14px"><label style="'+lSty+'">DATE</label>' +
    '<input id="tc-bw-date" type="date" value="'+_esc(todayStr)+'" max="'+todayStr+'" style="'+iSty+'"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
    '<div><label style="'+lSty+'">TOTAL T (nmol/L)</label>' +
    '<input id="tc-bw-tt" type="text" inputmode="decimal" placeholder="e.g. 16.2" value="'+_esc(defTT)+'" style="'+iSty+'"></div>' +
    '<div><label style="'+lSty+'">SHBG (nmol/L)</label>' +
    '<input id="tc-bw-shbg" type="text" inputmode="decimal" placeholder="e.g. 45" value="'+_esc(defSHBG)+'" style="'+iSty+'"></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
    '<div><label style="'+lSty+'">FREE T (pmol/L)</label>' +
    '<input id="tc-bw-ft" type="text" inputmode="decimal" placeholder="e.g. 217" value="'+_esc(defFT)+'" style="'+iSty+'"></div>' +
    '<div><label style="'+lSty+'">DOSE AT BW (mg/wk)</label>' +
    '<input id="tc-bw-dose" type="text" inputmode="decimal" placeholder="e.g. 150" value="'+_esc(defDose)+'" style="'+iSty+'"></div>' +
    '</div>' +
    '<div id="tc-bw-extras-container" style="margin-bottom:8px"></div>' +
    '<button onclick="_tcBwAddExtraRow()" style="width:100%;background:none;border:1px dashed var(--border);border-radius:8px;color:var(--muted2);font-size:12px;font-weight:700;letter-spacing:0.5px;cursor:pointer;padding:10px;font-family:inherit;margin-bottom:14px">+ ADD TEST</button>' +
    '<button onclick="_tcBwConfirmAdd()" style="width:100%;background:linear-gradient(135deg,#cc8844,#aa6622);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;letter-spacing:0.5px;padding:14px;cursor:pointer;font-family:inherit">SAVE</button>' +
    '</div>';
  document.body.appendChild(ol);
}

function _tcBwCloseAddSheet() {
  var ol = document.getElementById('tc-bw-add-overlay');
  if (ol) ol.remove();
  _tcBwAddExtras = [];
}

function _tcBwAddExtraRow() {
  _tcBwAddExtras.push({name: '', value: '', unit: ''});
  _tcBwRenderExtras();
}

function _tcBwExtraTestChange(i, name) {
  _tcBwAddExtras[i].name = name;
  var t = _TC_BW_TESTS.find(function(x){return x.name===name;});
  _tcBwAddExtras[i].unit = t ? t.units[0] : '';
  _tcBwRenderExtras();
}

function _tcBwRenderExtras() {
  var container = document.getElementById('tc-bw-extras-container');
  if (!container) return;
  var selSty = 'width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box';
  var iSty   = 'flex:1;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box';
  var html = '';
  _tcBwAddExtras.forEach(function(row, i) {
    var testOpts = '<option value="">Select test…</option>' +
      _TC_BW_TESTS.map(function(t){
        return '<option value="'+_esc(t.name)+'"'+(row.name===t.name?' selected':'')+'>'+_esc(t.name)+'</option>';
      }).join('');
    var curTest = _TC_BW_TESTS.find(function(t){return t.name===row.name;});
    var unitOpts = curTest
      ? curTest.units.map(function(u){
          return '<option value="'+_esc(u)+'"'+(row.unit===u?' selected':'')+'>'+_esc(u)+'</option>';
        }).join('')
      : '<option value="">—</option>';
    html +=
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">' +
        '<div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">' +
          '<select onchange="_tcBwExtraTestChange('+i+',this.value)" style="'+selSty+';flex:1">'+testOpts+'</select>' +
          '<button onclick="_tcBwRemoveExtra('+i+')" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted2);font-size:16px;cursor:pointer;padding:6px 10px;line-height:1;flex-shrink:0">×</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<input placeholder="Value" type="text" inputmode="decimal" value="'+_esc(row.value||'')+'" oninput="_tcBwAddExtras['+i+'].value=this.value" style="'+iSty+'">' +
          '<select onchange="_tcBwAddExtras['+i+'].unit=this.value" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;flex-shrink:0"'+(curTest?'':' disabled')+'>'+unitOpts+'</select>' +
        '</div>' +
        (row.name==='IGF-1'
          ? '<div style="display:flex;gap:6px;align-items:center;margin-top:6px">' +
              '<input placeholder="Lab ref low" type="text" inputmode="decimal" value="'+_esc(row.ref_lo||'')+'" oninput="_tcBwAddExtras['+i+'].ref_lo=this.value" style="'+iSty+'">' +
              '<span style="color:var(--muted2);font-size:12px;flex-shrink:0">–</span>' +
              '<input placeholder="Lab ref high" type="text" inputmode="decimal" value="'+_esc(row.ref_hi||'')+'" oninput="_tcBwAddExtras['+i+'].ref_hi=this.value" style="'+iSty+'">' +
            '</div>' +
            '<div style="font-size:10px;color:var(--muted2);margin-top:4px">Optional: your lab’s IGF-1 reference range (same unit as above) for a personalised GH-axis target.</div>'
          : '') +
      '</div>';
  });
  container.innerHTML = html;
}

function _tcBwRemoveExtra(i) {
  _tcBwAddExtras.splice(i, 1);
  _tcBwRenderExtras();
}

async function _tcBwConfirmAdd() {
  var dateEl = document.getElementById('tc-bw-date');
  var ttEl   = document.getElementById('tc-bw-tt');
  var shbgEl = document.getElementById('tc-bw-shbg');
  var ftEl   = document.getElementById('tc-bw-ft');
  var doseEl = document.getElementById('tc-bw-dose');
  var date   = dateEl ? dateEl.value : '';
  if (!date) { alert('Date is required.'); return; }
  if (date > new Date().toISOString().slice(0, 10)) { alert('Blood test date cannot be in the future.'); return; }
  // Snapshot the SHBG-suppressor doses active RIGHT NOW so the free-T model can
  // freeze the unsuppressed SHBG baseline from this draw even if a dose changes later.
  var _suppSnap = (_tcGhStack || []).map(function(gh) {
    var _dr = gh.interactions && gh.interactions.shbg && gh.interactions.shbg.doseResponse;
    return {
      id:        gh.pepId,
      dailyDose: (gh.dailyDose != null ? gh.dailyDose : null),
      unit:      (_dr && _dr.unit) || '',
      startDate: gh.startDateStr || ''
    };
  }).filter(function(s){ return s.id; });
  var entry = {
    date:        date,
    total_t:     ttEl   && ttEl.value   ? parseDec(ttEl.value)   : null,
    shbg:        shbgEl && shbgEl.value ? parseDec(shbgEl.value) : null,
    free_t:      ftEl   && ftEl.value   ? parseDec(ftEl.value)   : null,
    dose_at_bw:  doseEl && doseEl.value ? parseDec(doseEl.value) : null,
    extra:       _tcBwAddExtras.filter(function(r){ return r.name; }),
    suppressors: _suppSnap
  };
  var h = (typeof authHeaders==='function') ? authHeaders() : null;
  if (!h) { alert('Sign in required.'); return; }
  try {
    var r = await fetch(AGENT_URL + '/bloodwork', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, h),
      body: JSON.stringify(entry)
    });
    if (!r.ok) { alert('Failed to save.'); return; }
  } catch(_e) { alert('Network error.'); return; }
  _tcBwCloseAddSheet();
  _tcBwEntries = null;
  _tcBwLoading = true;
  await _tcFetchBwEntries();
}

async function _tcBwDeleteEntry(id) {
  var h = (typeof authHeaders==='function') ? authHeaders() : null;
  if (!h) return;
  try {
    await fetch(AGENT_URL + '/bloodwork/' + encodeURIComponent(id), {method: 'DELETE', headers: h});
  } catch(_e) {}
  _tcBwEntries = null;
  _tcBwLoading = true;
  await _tcFetchBwEntries();
}

// Age→free-T reference midpoint (pmol/L) used when no measured free T is entered.
// The table is reference DATA and lives in the backend (/systemic-interactions →
// ftBaseline); we only hold it here once fetched. Returns 0 (neutral) until it loads
// so no population numbers are ever hardcoded in the frontend.
function _tcDefaultFT(birthYear) {
  var b = _tcFtBaseline;
  if (!b || !b.bands) return 0;
  if (!birthYear) return b.default || 0;
  var age = new Date().getFullYear() - birthYear;
  for (var i = 0; i < b.bands.length; i++) {
    if (age <= b.bands[i].max_age) return b.bands[i].value;
  }
  return b.bands[b.bands.length - 1].value;
}

// Pure free-T model extracted from _tcDrawManualChart so BOTH the T-Calc chart
// and the Blood Levels tab compute free T from the SAME code (no divergence).
// sorted: injection log sorted ascending by date. hooks: optional {calFT,shbg,start}
// test hooks (same payloads the draw path used to fire on the canvas).
// Returns the day-indexed accumulation + calibration so callers can render free T
// as total[t] * (calFT_arr ? calFT_arr[t] : scale).
function _tcFreeTSeries(sorted, hooks) {
  hooks = hooks || {};
  var firstDate = new Date(sorted[0].date);
  var lastDate  = new Date(sorted[sorted.length - 1].date);

  var maxHL = 1;
  sorted.forEach(function(e) {
    var hl = (_tcCompInfo(e.compId).halfLifeDays) || 1;
    if (hl > maxHL) maxHL = hl;
  });
  var washoutDays = Math.ceil(4.3 * maxHL);

  var totalDays = Math.ceil((lastDate - firstDate) / 86400000) + washoutDays + 1;
  var total = new Float64Array(totalDays + 1);

  sorted.forEach(function(e) {
    var cd    = _tcCompInfo(e.compId);
    var hl    = cd.halfLifeDays || 1;
    var bioav = cd.bioavailability || 1;
    var ke    = Math.LN2 / hl;
    var ka    = _tcKa(hl);
    var injectDay = Math.round((new Date(e.date) - firstDate) / 86400000);
    var absorbed  = parseDec(e.doseMg) * bioav;
    for (var t = injectDay; t <= totalDays; t++) {
      total[t] += _tcPkConc(absorbed, ka, ke, t - injectDay);
    }
  });

  // Calibrated pmol/L scale using settled peak/trough over the log window (not washout tail)
  var _mftNum  = parseDec(_tcp.measuredFT)      || _tcDefaultFT(parseInt(_tcp.birthYear) || 0);
  // True when the free-T level is an age-based population default rather than the
  // user's own measured value — drives the confidence tier / warning band below.
  var _ftIsDefault = !(parseDec(_tcp.measuredFT) > 0);
  var _curDose = parseDec(_tcp.currentDoseMgWk) || 0;
  var _logDays = totalDays - washoutDays - 1;
  var _midLog  = Math.max(0, Math.floor(_logDays / 2));
  var _logPeak = 0, _logTrough = Infinity;
  for (var _ls = _midLog; _ls <= _logDays; _ls++) {
    if (total[_ls] > _logPeak)   _logPeak   = total[_ls];
    if (total[_ls] < _logTrough) _logTrough = total[_ls];
  }
  if (_logPeak === 0) { for (var _ls2 = 0; _ls2 <= totalDays; _ls2++) if (total[_ls2] > _logPeak) _logPeak = total[_ls2]; }
  if (_logTrough === Infinity) _logTrough = _logPeak;
  var _logMean = (_logPeak + _logTrough) / 2 || _logPeak;
  // Always compute absorbed totals — needed for both calFT and warm-start
  var _totalAbsMg = 0;
  sorted.forEach(function(e) { _totalAbsMg += parseDec(e.doseMg) * ((_tcCompInfo(e.compId).bioavailability) || 1); });
  var _effMgWk = _logDays > 0 ? _totalAbsMg / _logDays * 7 : 0;

  var calFT = null;
  if (_mftNum > 0 && _logMean > 0) {
    if (_curDose > 0) {
      calFT = _mftNum * (_effMgWk || _curDose) / _curDose / _logMean;
    } else {
      calFT = _mftNum / _logMean;
    }
  }

  // Unified calibration anchor: the reference time at which _mftNum (the measured or
  // estimated free T) is taken to hold.  With an explicit bloodwork entry it is the draw
  // date; with none it is "today" — the measured level describes the user now, and any
  // injections planned after today must not rescale the historical curve.  Clamped into
  // the plotted range so an all-future plan anchors at the start and an all-past log at
  // the end.  This is what makes calFT immune to appended future injections in BOTH the
  // bloodwork and no-bloodwork cases (previously only the bloodwork case was anchored,
  // so a no-bloodwork schedule re-scaled — and its peak dropped — as injections grew).
  var _bwAnchorDate = _tcBwEntries && _tcBwEntries.length ? _tcBwEntries[0].date : null;
  var _anchorDay, _anchorCutoffDate;
  var _bwAnchorDay = _bwAnchorDate
    ? Math.round((new Date(_bwAnchorDate + 'T12:00:00') - firstDate) / 86400000)
    : null;
  if (_bwAnchorDay !== null) {
    // Bloodwork exists — anchor at the draw day, clamped into the plotted range.
    //  • Draw dated BEFORE the first injection (a pre-cycle baseline — the normal case)
    //    clamps to day 0, so the curve STARTS at the measured baseline free T and rises as
    //    injections accumulate.  (Pinning it at "today" instead made the curve begin well
    //    below baseline and only cross it days later — the reported "not plotted from 217".)
    //  • Draw dated during/after the cycle anchors at its actual day.
    // total[anchorDay] is immune to injections added after it (PkConc(dt<0)=0), so calFT
    // stays fixed and the peak can only rise as injections are added.
    _anchorDay = Math.max(0, Math.min(totalDays, _bwAnchorDay));
    if (_anchorDay === _bwAnchorDay) {
      _anchorCutoffDate = _bwAnchorDate;
    } else {
      var _adB = new Date(firstDate.getTime() + _anchorDay * 86400000);
      _anchorCutoffDate = _adB.getFullYear() + '-' + String(_adB.getMonth() + 1).padStart(2, '0') + '-' + String(_adB.getDate()).padStart(2, '0');
    }
  } else {
    // No bloodwork at all — anchor at "today" when it falls within the injection span
    // (the measured/estimated level describes the user now), otherwise day 0 (an all-future
    // plan) or, for a fully washed-out all-past log, day 0 as well.  total[0] is immune to
    // every later injection, so calFT cannot move and the peak can only rise.
    var _nowDayA = Math.round((Date.now() - firstDate.getTime()) / 86400000);
    _anchorDay = (_nowDayA >= 0 && _nowDayA <= _logDays) ? _nowDayA : 0;
    var _adD = new Date(firstDate.getTime() + _anchorDay * 86400000);
    _anchorCutoffDate = _adD.getFullYear() + '-' + String(_adD.getMonth() + 1).padStart(2, '0') + '-' + String(_adD.getDate()).padStart(2, '0');
  }

  // Warm-start: pre-fill curve so the chart starts at the user's measured free T.
  if (calFT && _mftNum > 0) {
    if (_curDose > 0) {
      // Known prior dose: model each compound's residual from a steady-state protocol.
      // Use only injections up to the anchor date so that adding later injections
      // cannot change the compound-fraction mix and thereby shift total[anchorDay].
      var _wsFilterDate = _anchorCutoffDate;
      var _wsSorted = _wsFilterDate
        ? sorted.filter(function(e){ return e.date <= _wsFilterDate; })
        : sorted;
      if (_wsSorted.length === 0) _wsSorted = sorted;
      var _wsGroups = {}, _wsTotalAbsMg = 0;
      _wsSorted.forEach(function(e) {
        var _wsBioav = (_tcCompInfo(e.compId).bioavailability || 1);
        var _wsAbs   = parseDec(e.doseMg) * _wsBioav;
        _wsTotalAbsMg += _wsAbs;
        _wsGroups[e.compId] = (_wsGroups[e.compId] || 0) + _wsAbs;
      });
      if (_wsTotalAbsMg > 0) {
        Object.keys(_wsGroups).forEach(function(wsId) {
          var wsCd    = _tcCompInfo(wsId);
          var wsHl    = wsCd.halfLifeDays || 1;
          var wsBioav = wsCd.bioavailability || 1;
          var wsKe    = Math.LN2 / wsHl;
          var wsKa    = _tcKa(wsHl);
          var wsIv    = wsHl >= 20 ? 84 : wsHl >= 9 ? 14 : wsHl >= 3 ? 3.5 : 1;
          var wsCompFrac   = _wsGroups[wsId] / _wsTotalAbsMg;
          var wsCompWk     = _curDose * wsCompFrac;
          var wsDosePerInj = wsCompWk * wsIv / 7 * wsBioav;
          var wsLookback   = Math.ceil(wsHl * 10 / wsIv);
          for (var _wsk = 1; _wsk <= wsLookback; _wsk++) {
            var _wsDt = _wsk * wsIv;
            for (var _wst = 0; _wst <= totalDays; _wst++) {
              total[_wst] += _tcPkConc(wsDosePerInj, wsKa, wsKe, _wst + _wsDt);
            }
          }
        });
      }
    } else {
      // The log is the complete injection history — no prior protocol residual exists.
      // Add a constant endogenous baseline (continuous production) so the chart starts
      // at _mftNum and rises above it as injections accumulate.  A decaying exponential
      // here was wrong: it represented a fictional prior-dose residual that drained away
      // at peak time (making the peak read too low) and post-dose (making levels appear
      // to crash faster than the compound's half-life actually dictates).
      //
      // Derive the baseline from only the pre-anchor portion of total[] so that
      // injections after the anchor cannot inflate it, shift total[anchorDay], and
      // thereby move calFT.  The anchor is the bloodwork draw date when one exists, or
      // "today" otherwise — the same immunity now applies with or without bloodwork.
      var _p2Baseline = _logMean;
      if (_anchorDay >= 0) {
        var _p2MaxT = Math.min(_logDays, _anchorDay);
        var _p2Pk = 0, _p2Tr = Infinity;
        for (var _p2i = 0; _p2i <= _p2MaxT; _p2i++) {
          if (total[_p2i] > _p2Pk) _p2Pk = total[_p2i];
          if (total[_p2i] < _p2Tr) _p2Tr = total[_p2i];
        }
        // Baseline case (curve anchored at day 0 — a pre-cycle baseline draw, or none):
        // the measured free T is the user's PRE-cycle baseline, so the curve must start
        // there and rise.  Scale the injected accumulation so its value at "today" equals
        // one baseline unit: the floor becomes total[today] (the accumulation so far).  With
        // calFT anchored at total[0] = this floor, displayed[0] = _mftNum (the curve starts
        // at baseline) AND the peak is physiological.  total[today] is invariant to injections
        // planned after today, so the peak cannot drop as future injections are added.
        // (Anchoring the floor at the tiny day-0 residual instead made calFT enormous — the
        // curve started at baseline but the peak was absurdly high.)
        var _slopeDay0 = Math.round((Date.now() - firstDate.getTime()) / 86400000);
        if (_anchorDay === 0 && _slopeDay0 >= 1 && _slopeDay0 <= _logDays && total[_slopeDay0] > 0) {
          _p2Baseline = total[_slopeDay0];
        } else if (_p2Pk > 0) {
          if (_p2Tr === Infinity) _p2Tr = _p2Pk;
          _p2Baseline = (_p2Pk + _p2Tr) / 2 || _p2Pk;
        } else {
          // Anchor on day 0 with no "today" accumulation (all-future plan or all-past log):
          // total[0] = 0 for every injection (tcPkConc(dt=0)=0), so the pre-anchor scan finds
          // nothing.  Compute the stable baseline from the anchor-date injections' OWN settled
          // PK — later injections are excluded so adding them cannot shift total[anchorDay].
          var _bwDateStr2 = _anchorCutoffDate;
          var _bwDayArr = new Float64Array(totalDays + 1);
          sorted.forEach(function(e) {
            if (e.date !== _bwDateStr2) return;
            var _bwcd = _tcCompInfo(e.compId);
            var _bwke = Math.LN2 / (_bwcd.halfLifeDays || 1);
            var _bwka = _tcKa(_bwcd.halfLifeDays || 1);
            var _bwabs = parseDec(e.doseMg) * (_bwcd.bioavailability || 1);
            for (var _bwt = 0; _bwt <= totalDays; _bwt++) {
              _bwDayArr[_bwt] += _tcPkConc(_bwabs, _bwka, _bwke, _bwt);
            }
          });
          var _bwDayPk = 0, _bwDayTr = Infinity;
          for (var _bwst = 0; _bwst <= totalDays; _bwst++) {
            if (_bwDayArr[_bwst] > _bwDayPk) _bwDayPk = _bwDayArr[_bwst];
            if (_bwDayArr[_bwst] < _bwDayTr) _bwDayTr = _bwDayArr[_bwst];
          }
          if (_bwDayPk > 0) {
            if (_bwDayTr === Infinity) _bwDayTr = _bwDayPk;
            _p2Baseline = (_bwDayPk + _bwDayTr) / 2 || _bwDayPk;
          }
          // If still 0 (no anchor-date injection data), _logMean fallback stands.
        }
      }
      for (var _blt = 0; _blt <= totalDays; _blt++) {
        total[_blt] += _p2Baseline;
      }
    }
  }

  // Anchor calFT at the unified anchor day (the bloodwork draw date, or today when no
  // bloodwork entry exists) so that adding future injections cannot re-scale the curve.
  // total[] now includes any warm-start residual, so total[anchorDay] reflects exactly
  // what the model predicts at the anchor — and calFT is chosen to make that equal
  // _mftNum.  Injections after anchorDay contribute 0 at anchorDay (PkConc(dt<0)=0), so
  // calFT is immune to log extensions beyond the anchor.  Without this, a no-bloodwork
  // schedule fell back to calFT = _mftNum / _logMean over a window that grew with the
  // schedule, so appending injections lowered calFT and dragged the peak down.
  if (calFT && _mftNum > 0 && _anchorDay >= 0 && _anchorDay <= totalDays && total[_anchorDay] > 0) {
    calFT = _mftNum / total[_anchorDay];
  }
  if (hooks.calFT) hooks.calFT(calFT);

  var scale     = calFT || 1;
  var unitLabel = calFT ? 'pmol/L' : 'mg';

  // Time-varying SHBG → free-T model.  Two drivers, both anchored at the bloodwork draw so the
  // curve passes exactly through the measured free T / SHBG (no double-counting):
  //   1. SHBG-suppressing compounds & supplements (GH peptides, Boron): dose-scaled ramp
  //      SHBG ×= ∏_i (1 − asym_i × (1 − e^(−t/halfTime_i))), asym_i = effMaxSupp(dailyDose_i)
  //      so lowering a dose relaxes SHBG back up over halfTime (no all-or-nothing switch).
  //   2. Testosterone's OWN dose-dependent SHBG suppression: SHBG scales as a power law of the
  //      modelled (lagged) T level relative to the draw — SHBG(t)/SHBG_draw = (T_lag(t)/T_lag_draw)^(−β).
  //      This is the dominant driver on a TRT/enhanced schedule and the main source of drift
  //      between blood tests. A β-uncertainty band (0.15–0.40 around 0.25) is drawn: it pinches
  //      to zero width at the draw (calibrated there) and widens away from it.
  var calFT_arr = null, _calFTlo = null, _calFThi = null;
  var _ghAnnot  = '';
  var _betaAnnot = '';
  var _ttNum  = parseDec(_tcp.totalT) || 0;
  var _shbgBw = parseDec(_tcp.shbg)   || 0;
  if (calFT && _ttNum > 0 && _shbgBw > 0) {
    var _vermBw = _tcVermeulenFT(_ttNum, _shbgBw);
    if (_vermBw) {
      // SHBG anchor day: the bloodwork draw if entered, else the free-T calibration anchor.
      var _bwEntry = (_tcBwEntries && _tcBwEntries[0]) ? _tcBwEntries[0] : null;
      var _bwDate = _bwEntry ? _bwEntry.date : null;
      var _shbgRefDay = _bwDate
        ? Math.round((new Date(_bwDate + 'T12:00:00') - firstDate) / 86400000)
        : _anchorDay;
      _shbgRefDay = Math.max(0, Math.min(totalDays, _shbgRefDay || 0));
      // Doses that were ACTIVE AT THE DRAW, snapshotted when the bloodwork was saved.
      // Keyed by compound id → dailyDose (in its doseResponse unit). Present only for
      // draws recorded after this feature shipped; absent → we fall back to today's dose.
      var _snapMap = null;
      if (_bwEntry && Array.isArray(_bwEntry.suppressors) && _bwEntry.suppressors.length) {
        _snapMap = {};
        _bwEntry.suppressors.forEach(function(s){ if (s && s.id != null) _snapMap[s.id] = s.dailyDose; });
      }

      // Each suppressor carries TWO asymptotes: asymSnap (dose active at the draw) and
      // asymCur (today's dose). Suppression follows a two-segment first-order relaxation —
      // it ramps toward asymSnap up to the draw, then relaxes toward asymCur afterwards.
      // This keeps SHBG(draw) fixed (so the inferred baseline no longer moves when the
      // user changes a dose today) while the forward curve still tracks the new dose.
      var _ghParams = [];
      _tcGhStack.forEach(function(gh) {
        var _ghStart = gh.startDateStr ? new Date(gh.startDateStr + 'T12:00:00') : null;
        if (!_ghStart) return;
        var _dr      = gh.interactions.shbg.doseResponse;
        var _fixed   = gh.interactions.shbg.maxSuppression;
        var _asymCur = _tcEffMaxSupp(_dr, gh.dailyDose);
        if (_asymCur == null) _asymCur = _fixed;
        // asymSnap null → single-segment current-dose ramp (legacy behaviour) unless the
        // compound is explicitly recorded in the draw snapshot.
        var _asymSnap = null;
        if (_snapMap && Object.prototype.hasOwnProperty.call(_snapMap, gh.pepId)) {
          _asymSnap = _tcEffMaxSupp(_dr, _snapMap[gh.pepId]);
          if (_asymSnap == null) _asymSnap = _fixed;
        }
        _ghParams.push({
          ghDay0:   Math.round((_ghStart - firstDate) / 86400000),
          drawDay:  _shbgRefDay,
          asymCur:  _asymCur,
          asymSnap: _asymSnap,
          halfTime: gh.interactions.shbg.halfTimeDays
        });
      });
      var _suppAt = function(gp, day) {
        if (day <= gp.ghDay0) return 0;
        // No draw snapshot, or compound started at/after the draw → single current-dose ramp.
        if (gp.asymSnap == null || gp.ghDay0 >= gp.drawDay) {
          return gp.asymCur * (1 - Math.exp(-(day - gp.ghDay0) / gp.halfTime));
        }
        // Snapshot segment: dose active at the draw, from start → draw.
        if (day <= gp.drawDay) {
          return gp.asymSnap * (1 - Math.exp(-(day - gp.ghDay0) / gp.halfTime));
        }
        // Post-draw: relax from the level reached at the draw toward today's asymptote.
        var suppDraw = gp.asymSnap * (1 - Math.exp(-(gp.drawDay - gp.ghDay0) / gp.halfTime));
        return gp.asymCur + (suppDraw - gp.asymCur) * Math.exp(-(day - gp.drawDay) / gp.halfTime);
      };
      var _ghProd = function(day) {
        var p = 1;
        _ghParams.forEach(function(gp) { p *= (1 - _suppAt(gp, day)); });
        return p;
      };
      // Back-calculate the unsuppressed SHBG base from the compound product at the anchor.
      // With a draw snapshot _ghProd(drawDay) uses asymSnap, so the base is fixed against
      // later dose edits (the whole point of this fix).
      var _prodRef = _ghProd(_shbgRefDay);
      var _shbgBase = (_prodRef > 0.05) ? _shbgBw / _prodRef : _shbgBw;
      // Lagged testosterone level: EMA of the modelled accumulation (SHBG responds over weeks).
      var _tlag = new Float64Array(totalDays + 1);
      var _alpha = 1 - Math.exp(-1 / TCALC_TSHBG_LAG_DAYS);
      _tlag[0] = total[0];
      for (var _li = 1; _li <= totalDays; _li++) _tlag[_li] = _tlag[_li - 1] + (total[_li] - _tlag[_li - 1]) * _alpha;
      var _tlagRef = _tlag[_shbgRefDay] || _tlag[0] || 1;
      var _tFactor = function(day, beta) {
        var r = (_tlag[day] || _tlagRef) / _tlagRef;
        if (r <= 0) return 1;
        var f = Math.pow(r, -beta);
        return Math.max(0.35, Math.min(1.30, f));  // physiological clamp: ≤65% drop, ≤30% rise
      };
      var _mkArr = function(beta) {
        var arr = new Float64Array(totalDays + 1);
        for (var t = 0; t <= totalDays; t++) {
          var _shbgT = Math.max(1, _shbgBase * _ghProd(t) * _tFactor(t, beta));
          var _vermT = _tcVermeulenFT(_ttNum, _shbgT);
          arr[t] = _vermT ? calFT * (_vermT / _vermBw) : calFT;
        }
        return arr;
      };
      // Personalise β from the user's own blood tests; fall back to the population default.
      var _betaFit = _tcFitBeta(_tcBwEntries);
      var _betaC  = _betaFit ? _betaFit.beta : TCALC_TSHBG_BETA;
      var _betaLo = _betaFit ? _betaFit.lo   : TCALC_TSHBG_BETA_LO;
      var _betaHi = _betaFit ? _betaFit.hi   : TCALC_TSHBG_BETA_HI;
      _betaAnnot = _betaFit ? ('β ' + _betaC.toFixed(2) + ' · ' + _betaFit.n + ' labs')
                            : ('β ' + TCALC_TSHBG_BETA.toFixed(2) + ' · population');

      calFT_arr = _mkArr(_betaC);
      _calFTlo  = _mkArr(_betaLo);
      _calFThi  = _mkArr(_betaHi);
      if (hooks.shbg) hooks.shbg({ calFT: calFT, arr: calFT_arr, lo: _calFTlo, hi: _calFThi, refDay: _shbgRefDay, total: total, beta: _betaC, personalized: !!_betaFit });

      // Modelled SHBG change at "now" vs the bloodwork value, for the chart annotation.
      var _nowDay = Math.max(0, Math.min(totalDays, Math.round((Date.now() - firstDate.getTime()) / 86400000)));
      var _shbgNow = _shbgBase * _ghProd(_nowDay) * _tFactor(_nowDay, _betaC);
      var _shbgDelta = _shbgBw > 0 ? (_shbgNow / _shbgBw - 1) : 0;
      if (Math.abs(_shbgDelta) > 0.01) _ghAnnot = 'SHBG ' + (_shbgDelta < 0 ? '−' : '+') + Math.round(Math.abs(_shbgDelta) * 100) + '%';
    }
  }

  // Confidence tier + always-visible uncertainty band.
  //   measured : the SHBG model ran off real bloodwork (β-band already built above)
  //   partial  : the user gave a measured free T but no SHBG/total-T, so there are no
  //              SHBG dynamics — medium band, no dose-driven swing
  //   estimate : no bloodwork at all — free T is an age-based population default (wide band)
  // For the two non-measured tiers we synthesise a symmetric relative band so the chart
  // never implies false precision; the draw path renders these dashed with a warning badge.
  // This is what lets users who can't test regularly still see an honest estimate.
  var _tier = calFT_arr ? 'measured' : (_ftIsDefault ? 'estimate' : 'partial');
  if (!calFT_arr && calFT) {
    var _estFrac = (_tier === 'estimate') ? 0.35 : 0.20;
    calFT_arr = new Float64Array(totalDays + 1);
    _calFTlo  = new Float64Array(totalDays + 1);
    _calFThi  = new Float64Array(totalDays + 1);
    for (var _et = 0; _et <= totalDays; _et++) {
      calFT_arr[_et] = scale;
      _calFTlo[_et]  = scale * (1 - _estFrac);
      _calFThi[_et]  = scale * (1 + _estFrac);
    }
  }

  // Test hook: the displayed free-T value at the first plotted day (day 0).  With a
  // pre-cycle baseline anchor this must equal the measured baseline, i.e. the curve
  // starts at the baseline and rises — not below it.
  if (hooks.start) hooks.start(total[0] * (calFT_arr ? calFT_arr[0] : scale));
  return { firstDate: firstDate, totalDays: totalDays, total: total, calFT: calFT, scale: scale,
           calFT_arr: calFT_arr, calFTlo: _calFTlo, calFThi: _calFThi, unitLabel: unitLabel,
           measuredFT: _mftNum, ghAnnot: _ghAnnot, betaAnnot: _betaAnnot, tier: _tier, sorted: sorted };
}

function _tcDrawManualChart(canvasId, log, zoom3) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !log || log.length === 0) return;

  var sorted = log.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var _S = _tcFreeTSeries(sorted, { calFT: canvas._testCalFTHook, shbg: canvas._testShbgHook, start: canvas._testStartHook });
  var firstDate = _S.firstDate, totalDays = _S.totalDays, total = _S.total, calFT = _S.calFT, scale = _S.scale,
      calFT_arr = _S.calFT_arr, _calFTlo = _S.calFTlo, _calFThi = _S.calFThi, unitLabel = _S.unitLabel,
      _mftNum = _S.measuredFT, _ghAnnot = _S.ghAnnot, _betaAnnot = _S.betaAnnot, _tier = _S.tier;

  var dpr  = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300;
  var cssH = 150;
  canvas.width  = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px'; canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD = {top:12, right:14, bottom:26, left:52};
  var cW  = cssW - PAD.left - PAD.right;
  var cH  = cssH - PAD.top  - PAD.bottom;

  var maxV = 0;
  for (var i = 0; i <= totalDays; i++) {
    var _svc = total[i] * (calFT_arr ? calFT_arr[i] : scale);
    var _sv  = _calFThi ? Math.max(_svc, total[i] * _calFThi[i]) : _svc;  // include band top
    if (_sv > maxV) maxV = _sv;
  }
  if (_mftNum && calFT && _mftNum > maxV) maxV = _mftNum * 1.1;
  if (!maxV) { ctx.fillStyle = '#555'; ctx.font = '11px DM Sans,sans-serif'; ctx.fillText('No data', 10, 40); return; }
  var vMax = maxV * 1.1;

  // Clip x-axis to where free T last crosses back down to baseline (the interesting area)
  var xDays = totalDays;
  if (_mftNum && calFT) {
    for (var _xi = totalDays; _xi > 0; _xi--) {
      if (total[_xi] * (calFT_arr ? calFT_arr[_xi] : scale) >= _mftNum) { xDays = _xi; break; }
    }
  }

  // Zoom window
  var _zoom = zoom3 || _tcChartZoom || 'whole';
  var nowDay = Math.round((Date.now() - firstDate.getTime()) / 86400000);
  var panDays = _zoom !== 'whole' ? Math.round(_tcChartPanOffset || 0) : 0;
  var xStart = 0, xEnd = xDays;
  if (_zoom === 'today')       { xStart = Math.max(0, nowDay - 2 + panDays); xEnd = Math.min(xDays, nowDay + 2 + panDays); }
  else if (_zoom === 'week')   { xStart = Math.max(0, nowDay - 3 + panDays); xEnd = Math.min(xDays, nowDay + 4 + panDays); }
  else if (_zoom === 'month')  { xStart = Math.max(0, nowDay - 15 + panDays); xEnd = Math.min(xDays, nowDay + 15 + panDays); }
  // Whole view: make sure "today" is inside the window so its marker/level show
  // even when the curve has already washed back to baseline before today.
  if (_zoom === 'whole' && nowDay > xEnd && nowDay <= totalDays) xEnd = nowDay;
  if (xEnd <= xStart) xEnd = Math.min(xDays, xStart + 7);

  // Find peak within visible window
  var peakV = 0, peakT = 0;
  for (var _pi = xStart; _pi <= xEnd; _pi++) {
    var _pv = total[_pi] * (calFT_arr ? calFT_arr[_pi] : scale);
    if (_pv > peakV) { peakV = _pv; peakT = _pi; }
  }

  function xOf(t){ return PAD.left + ((t - xStart) / (xEnd - xStart)) * cW; }
  function yOf(v){ return PAD.top  + cH - (v / vMax) * cH; }

  var winDays = xEnd - xStart;
  var gridStep = winDays <= 7 ? 1 : winDays <= 30 ? 5 : xDays <= 28 ? 7 : xDays <= 84 ? 14 : 28;
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
  for (var dg = xStart; dg <= xEnd; dg += gridStep) {
    var gx = xOf(dg);
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + cH); ctx.stroke();
  }

  // Measured FT reference line
  if (_mftNum && calFT) {
    var _refY = yOf(_mftNum);
    ctx.strokeStyle = '#e8a02099'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, _refY); ctx.lineTo(PAD.left + cW, _refY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8a020bb'; ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.round(_mftNum), PAD.left + 3, _refY - 2);
  }

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'right';
  for (var ti = 0; ti <= 3; ti++) {
    var ty = PAD.top + (cH / 3) * ti;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left + cW, ty); ctx.stroke();
    var tv = vMax * (1 - ti / 3);
    ctx.fillText(calFT ? Math.round(tv) : (tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2)), PAD.left - 4, ty + 3);
  }
  ctx.save(); ctx.translate(10, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText(unitLabel, 0, 0); ctx.restore();

  // SHBG suppression + β-source annotation (top-right of chart)
  if (_ghAnnot) {
    ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = '#3cffa077';
    ctx.fillText(_ghAnnot, PAD.left + cW, PAD.top + 9);
  }
  if (_betaAnnot) {
    ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = '#8891a5aa';   // muted: shows whether β is personalised or population default
    ctx.fillText(_betaAnnot, PAD.left + cW, PAD.top + (_ghAnnot ? 19 : 9));
  }

  var lineColor = _tcCompInfo(sorted[0].compId).dot || '#e8a020';

  // SHBG β-uncertainty band: shaded region between the β=0.15 and β=0.40 free-T curves.
  // Pinches to zero width at the bloodwork draw (calibrated) and widens away from it.
  if (calFT_arr && _calFTlo && _calFThi) {
    var _bandTop = function(t){ return Math.max(total[t]*_calFTlo[t], total[t]*_calFThi[t]) || 0; };
    var _bandBot = function(t){ return Math.min(total[t]*_calFTlo[t], total[t]*_calFThi[t]) || 0; };
    ctx.beginPath();
    ctx.moveTo(xOf(xStart), yOf(_bandTop(xStart)));
    for (var _bt = xStart + 1; _bt <= xEnd; _bt++) ctx.lineTo(xOf(_bt), yOf(_bandTop(_bt)));
    for (var _bb = xEnd; _bb >= xStart; _bb--) ctx.lineTo(xOf(_bb), yOf(_bandBot(_bb)));
    ctx.closePath();
    ctx.fillStyle = lineColor + '26';
    ctx.fill();
  }

  // Peak highlight line + y-axis label
  if (calFT && peakV > 0 && peakV > (_mftNum || 0) * 1.05) {
    var _pkY = yOf(peakV);
    ctx.strokeStyle = lineColor + 'aa'; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, _pkY); ctx.lineTo(PAD.left + cW, _pkY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lineColor; ctx.font = 'bold 8px DM Sans,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(peakV), PAD.left - 4, _pkY + 3);
  }

  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55'); grad.addColorStop(1, lineColor + '00');
  ctx.beginPath(); ctx.moveTo(xOf(xStart), PAD.top + cH);
  for (var t2 = xStart; t2 <= xEnd; t2++) {
    ctx.lineTo(xOf(t2), yOf(total[t2] * (calFT_arr ? calFT_arr[t2] : scale) || 0));
  }
  ctx.lineTo(xOf(xEnd), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(xStart), yOf(total[xStart] * (calFT_arr ? calFT_arr[xStart] : scale) || 0));
  for (var t3 = xStart + 1; t3 <= xEnd; t3++) {
    ctx.lineTo(xOf(t3), yOf(total[t3] * (calFT_arr ? calFT_arr[t3] : scale) || 0));
  }
  // Estimate tiers (no bloodwork, or no SHBG data) draw dashed to signal lower confidence.
  if (_tier && _tier !== 'measured') ctx.setLineDash([5,3]);
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.setLineDash([]);

  // AVERAGE reference line (teal, toggleable) — the mean level over the CURRENTLY
  // VISIBLE window, so it tracks the zoom (day/week/month/whole) instead of sitting at
  // one global value. In Whole it reads the whole-cycle average; zoom in and it reports
  // the average of just what you're looking at. Still makes the "peak differs, average
  // doesn't" point: an infrequent-large schedule peaks far above it, a frequent one hugs it.
  if (calFT && _tcShowAvg()) {
    var _avgSum = 0, _avgN = 0;
    for (var _ai = xStart; _ai <= xEnd; _ai++) { _avgSum += total[_ai] * (calFT_arr ? calFT_arr[_ai] : scale); _avgN++; }
    var _avgLvl = _avgN > 0 ? _avgSum / _avgN : 0;
    if (canvas._testAvgHook) canvas._testAvgHook({ avg: _avgLvl, xStart: xStart, xEnd: xEnd });
    if (_avgLvl > 0 && _avgLvl <= vMax) {
      var _avY = yOf(_avgLvl);
      ctx.strokeStyle = '#5ad1b0cc'; ctx.lineWidth = 1; ctx.setLineDash([1,3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, _avY); ctx.lineTo(PAD.left + cW, _avY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#5ad1b0'; ctx.font = 'bold 8px DM Sans,sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('avg ' + Math.round(_avgLvl), PAD.left + cW, _avY - 3);
    }
  }

  // Warning badge for estimate tiers — a pill top-left of the plot so the user never
  // mistakes an age-default / no-SHBG curve for a bloodwork-calibrated result.
  if (_tier && _tier !== 'measured' && calFT) {
    var _badge = (_tier === 'estimate') ? '⚠ ESTIMATE · NO BLOODWORK' : '⚠ EST · NO SHBG DATA';
    ctx.font = 'bold 8px DM Sans,sans-serif'; ctx.textAlign = 'left';
    var _badgeW = (ctx.measureText(_badge).width || 0) + 10;
    var _bx = PAD.left + 2, _by = PAD.top + 2;
    ctx.fillStyle = '#e8a020dd';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(_bx, _by, _badgeW, 12, 3); ctx.fill(); }
    else { ctx.fillRect(_bx, _by, _badgeW, 12); }
    ctx.fillStyle = '#1a1205'; ctx.fillText(_badge, _bx + 5, _by + 9);
  }

  // "Now" vertical line + TODAY'S free-T level (Y-axis label) — shown in EVERY
  // zoom, including Whole. The horizontal marker + left-axis number always report
  // today's estimated free T; a dot marks where "now" meets the curve.
  var _ndClamp = Math.max(0, Math.min(totalDays, nowDay));
  var _nowLvl = calFT ? (total[_ndClamp] * (calFT_arr ? calFT_arr[_ndClamp] : scale)) : 0;
  if (canvas._testNowHook) canvas._testNowHook(_nowLvl);
  if (nowDay >= xStart && nowDay <= xEnd) {
    var nowX = xOf(nowDay);
    ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(nowX, PAD.top); ctx.lineTo(nowX, PAD.top + cH); ctx.stroke();
    ctx.fillStyle = '#ffffff99'; ctx.font = 'bold 8px DM Sans,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('today', nowX, PAD.top + 8);
    if (calFT && _nowLvl > 0) {
      var _nlY = yOf(_nowLvl);
      ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 1; ctx.setLineDash([2,2]);
      ctx.beginPath(); ctx.moveTo(PAD.left, _nlY); ctx.lineTo(PAD.left + cW, _nlY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(nowX, _nlY, 3, 0, 2*Math.PI); ctx.fill();
      // Boxed Y-axis label so today's level stays legible over the gridline numbers.
      var _lbl = String(Math.round(_nowLvl));
      ctx.font = 'bold 9px DM Sans,sans-serif'; ctx.textAlign = 'right';
      var _tw = ctx.measureText(_lbl).width;
      ctx.fillStyle = '#000000cc'; ctx.fillRect(PAD.left - 7 - _tw, _nlY - 6, _tw + 6, 12);
      ctx.fillStyle = '#ffffff'; ctx.fillText(_lbl, PAD.left - 4, _nlY + 3);
    }
  }

  sorted.forEach(function(e) {
    var injectDay = Math.round((new Date(e.date) - firstDate) / 86400000);
    if (injectDay < xStart || injectDay > xEnd) return;
    var dot = _tcCompInfo(e.compId).dot || lineColor;
    var ix = xOf(injectDay);
    ctx.strokeStyle = dot + '99'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 5); ctx.stroke();
  });

  // Bloodwork dots — one per entry that has a free_t value, plotted at their calendar date
  if (_tcBwEntries && calFT) {
    _tcBwEntries.forEach(function(bwE) {
      if (bwE.free_t == null) return;
      var bwDay = Math.round((new Date(bwE.date + 'T12:00:00') - firstDate) / 86400000);
      if (bwDay < xStart || bwDay > xEnd) return;
      var bwX = xOf(bwDay);
      var bwY = yOf(bwE.free_t);
      ctx.beginPath();
      ctx.arc(bwX, bwY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#e8a020cc';
      ctx.fill();
      ctx.strokeStyle = '#e8a020';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = winDays <= 7 ? 1 : winDays <= 30 ? 5 : xDays <= 28 ? 7 : xDays <= 84 ? 14 : 28;
  for (var dl = xStart; dl <= xEnd; dl += labelEvery) {
    var lx = xOf(dl);
    var labelDate = new Date(firstDate.getTime() + dl * 86400000);
    var _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var lbl = labelDate.getDate() + ' ' + _MONTHS[labelDate.getMonth()];
    ctx.fillText(lbl, lx, PAD.top + cH + 18);
  }
  canvas._tcPanState = {xStart: xStart, xEnd: xEnd, cW: cW, zoom: _zoom};
}

// ── OPTIMIZER ─────────────────────────────────────────────────────────────────

function _tcOptimize() {
  var result = {plan: null, suggestions: [], warnings: [], calibration: {}};

  var ttNum   = parseDec(_tcp.totalT)          || 0;
  var shbgNum = parseDec(_tcp.shbg)            || 0;
  var mftNum  = parseDec(_tcp.measuredFT)      || 0;
  var curDose = parseDec(_tcp.currentDoseMgWk) || 0;
  var tgtFT   = parseDec(_tcp.targetFT)        || 0;

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

  var ovDose     = parseDec(_tcp.overrideDoseMgWk)    || 0;
  var ovInterval = parseDec(_tcp.overrideIntervalDays) || 0;
  var isManual   = ovDose > 0 || ovInterval > 0;
  if (isManual) doseSource = 'manual';
  var reqMgPerWeek = ovDose > 0 ? ovDose : autoMgPerWeek;

  // ── Dose allocation: PK-optimal (equal SS trough per ester) ─────────────
  // w_i = (e^(k_i × iv_i) − 1) / iv_i.  Short esters clear faster so they
  // need more mg/week to hold the same trough — the weight reflects that.
  // This minimises combined peak:trough regardless of which esters are equipped.
  // Stock amounts only drive coverage warnings — they never cap the cycle.
  var pkWeights = testInv.map(function(inv) {
    var cd = _tcCompInfo(inv.compId);
    var k  = Math.LN2 / cd.halfLifeDays;
    var iv = _tcSnapInterval(0.585 * cd.halfLifeDays);
    return (Math.exp(k * iv) - 1) / iv;
  });
  var totalPkWeight = pkWeights.reduce(function(a, b){ return a + b; }, 0);

  var effectiveCycle = _tcp.cycleDays;  // never capped by stock
  var compoundPlans  = [];

  testInv.forEach(function(inv, idx) {
    var cd       = _tcCompInfo(inv.compId);
    var bioav    = cd.bioavailability || 1;
    var frac     = totalPkWeight > 0 ? pkWeights[idx] / totalPkWeight : 1 / testInv.length;
    var stock    = parseDec(inv.totalMg) || 0;
    var compMgWkBioav  = reqMgPerWeek * frac;        // bioavailable mg/week for this compound
    var compMgWkApplied = compMgWkBioav / bioav;     // applied mg/week (what the user actually uses)

    var optInterval  = 0.585 * cd.halfLifeDays;
    var compInterval = ovInterval > 0         ? ovInterval
                     : _tcp.preferredFreqDays !== 'auto' ? _tcSnapInterval(parseDec(_tcp.preferredFreqDays) || optInterval)
                     : _tcSnapInterval(optInterval);

    // Cap applied dose per application when the compound has a physical maximum
    // (e.g. transdermal gel: 2 sachets × 50 mg = 100 mg per application)
    if (cd.maxDailyDoseMg) {
      var rawDosePerInj = compMgWkApplied * compInterval / 7;
      if (rawDosePerInj > cd.maxDailyDoseMg) {
        compMgWkApplied = cd.maxDailyDoseMg * 7 / compInterval;
        compMgWkBioav   = compMgWkApplied * bioav;
      }
    }

    // Warn when stock runs short — never shorten the cycle; user can reorder
    if (stock > 0) {
      var weeksAvail = stock / compMgWkApplied;
      if (weeksAvail < _tcp.cycleDays / 7 * 0.9) {
        result.suggestions.push({
          type: 'insufficient-inventory', priority: 1,
          message: '⚠ ' + cd.name + ' stock (' + Math.round(stock) + ' mg) covers ~' +
                   Math.floor(weeksAvail) + ' wk at ' + Math.round(compMgWkApplied) + ' mg/wk applied' +
                   ' — reorder before W' + (Math.floor(weeksAvail) + 1) + '.'
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

    // Cost per mg from user-entered purchase price (cost is per applied mg)
    var costTotal  = parseDec(inv.costTotal) || 0;
    var costPerMg  = (costTotal > 0 && stock > 0) ? costTotal / stock : null;
    var costPerWeek = costPerMg !== null ? compMgWkApplied * costPerMg : null;

    compoundPlans.push({
      compId:           cd.id,
      cd:               cd,
      intervalDays:     compInterval,
      autoIntervalDays: _tcSnapInterval(optInterval),
      dosePerInj:       Math.round(compMgWkApplied * compInterval / 7 * 10) / 10,  // applied mg per dose
      mgPerWeek:        Math.round(compMgWkBioav),                                   // bioavailable mg/week shown in summary
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
  var cycleDays = plan.cycleDays;
  var nonHCG = plan.compounds.filter(function(c){ return c.compId !== 'hcg'; });
  if (nonHCG.length === 0) return [];

  function makeInj(cp, day, dose) {
    var bioav = cp.cd.bioavailability || 1;
    var hl    = cp.cd.halfLifeDays;
    return {
      day:          Math.round(day),
      dose:         Math.round(dose * bioav * 10) / 10,  // bioavailable dose drives PK curve
      compId:       cp.compId,
      halfLifeDays: hl,
      ka:           _tcKa(hl),
      dot:          cp.cd.dot,
      name:         cp.cd.name,
      dosePerInj:   cp.dosePerInj                        // applied dose shown in schedule
    };
  }

  // Single compound — simple periodic
  if (nonHCG.length === 1) {
    var cp0 = nonHCG[0], s0 = [], d0 = 0;
    while (d0 < cycleDays) { s0.push(makeInj(cp0, d0, cp0.dosePerInj)); d0 += cp0.intervalDays; }
    return s0;
  }

  // ── Multi-compound: backbone + compensatory forward simulation ──────────────
  // Backbone = longest half-life; compensators sorted slowest-first (prefer coverage)
  var sorted      = nonHCG.slice().sort(function(a,b){ return b.cd.halfLifeDays - a.cd.halfLifeDays; });
  var backbone    = sorted[0];
  var compensators = sorted.slice(1);

  var backboneStart = Math.max(0, parseInt(_tcp.backboneStartDay) || 0);

  // Floor = 60% of backbone's single injection dose.
  // Compensators fire whenever the total plasma curve drops below this.
  var T_floor = backbone.dosePerInj * 0.60;

  // 1. Schedule backbone at its standard interval starting at backboneStart
  var sched = [];
  var d = backboneStart;
  while (d < cycleDays) { sched.push(makeInj(backbone, d, backbone.dosePerInj)); d += backbone.intervalDays; }

  // 2. Build backbone plasma curve
  var curve = new Float64Array(cycleDays + 1);
  function addToCurve(inj) {
    var ke = Math.LN2 / inj.halfLifeDays;
    var ka = inj.ka || _tcKa(inj.halfLifeDays);
    for (var t = inj.day; t <= cycleDays; t++)
      curve[t] += _tcPkConc(inj.dose, ka, ke, t - inj.day);
  }
  sched.forEach(addToCurve);

  // 3. Forward simulation — inject compensators on demand when curve < T_floor
  var lastInjDay = {};
  compensators.forEach(function(cp){ lastInjDay[cp.compId] = -9999; });

  for (var day = 0; day <= cycleDays; day++) {
    if (curve[day] >= T_floor) continue;
    // Below floor — try compensators slowest-first (maximises coverage per injection)
    for (var ci = 0; ci < compensators.length; ci++) {
      var cp = compensators[ci];
      if (day - lastInjDay[cp.compId] < cp.intervalDays) continue;
      var inj = makeInj(cp, day, cp.dosePerInj);
      sched.push(inj);
      addToCurve(inj);
      lastInjDay[cp.compId] = day;
      if (curve[day] >= T_floor) break;
    }
  }

  sched.sort(function(a,b){ return a.day - b.day || a.compId.localeCompare(b.compId); });
  return sched;
}

function _tcBuildCurve(sched, plan) {
  var n = plan.cycleDays + 1;
  var total = new Float64Array(n);
  for (var t = 0; t < n; t++) {
    var c = 0;
    for (var j = 0; j < sched.length; j++) {
      var inj = sched[j];
      if (inj.day <= t) {
        var ke = Math.LN2 / inj.halfLifeDays;
        var ka = inj.ka || _tcKa(inj.halfLifeDays);
        c += _tcPkConc(inj.dose, ka, ke, t - inj.day);
      }
    }
    total[t] = c;
  }
  return total;
}

function _tcComputeStats(total, sched, plan) {
  var n = plan.cycleDays + 1;

  // Full-cycle peak/trough
  var peak = 0, trough = Infinity;
  for (var t = 0; t < n; t++) {
    if (total[t] > peak)   peak   = total[t];
    if (total[t] < trough) trough = total[t];
  }
  if (trough === Infinity) trough = 0;

  // Use second half of cycle for "settled" band (avoids ramp-up distortion)
  var midDay = Math.floor(n / 2);
  var latePeak = 0, lateTrough = Infinity;
  for (var t2 = midDay; t2 < n; t2++) {
    if (total[t2] > latePeak)   latePeak   = total[t2];
    if (total[t2] < lateTrough) lateTrough = total[t2];
  }
  if (lateTrough === Infinity) lateTrough = trough;

  var ssTrough  = lateTrough;
  var ssPeak    = latePeak;
  var bandFloor = ssTrough * 0.85;
  var bandCeil  = ssPeak   * 1.15;

  var inBand = 0;
  for (var t3 = 0; t3 < n; t3++)
    if (total[t3] >= bandFloor && total[t3] <= bandCeil) inBand++;

  var firstInBand = null;
  for (var t4 = 7; t4 < n; t4++) {
    if (total[t4] >= ssTrough * 0.90 && firstInBand === null)
      firstInBand = Math.ceil(t4 / 7);
  }

  return {
    peak: peak, trough: trough,
    ssTrough: ssTrough, ssPeak: ssPeak,
    bandFloor: bandFloor, bandCeil: bandCeil,
    peakTroughRatio:  trough > 0 ? peak / trough : 0,
    inBandPct:        Math.round(inBand / n * 100),
    totalMg:          Math.round(sched.reduce(function(s, inj){ return s + inj.dose; }, 0)),
    firstInBandWeek:  firstInBand
  };
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function _tcDrawChart(canvasId, total, stats, plan, sched, calFT, measuredFT) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var lineColor = (plan.compounds && plan.compounds.length > 0) ? plan.compounds[0].cd.dot : '#e8a020';
  var cycleDays = plan.cycleDays;
  var scale     = calFT || 1;
  var unitLabel = calFT ? 'pmol/L' : 'mg';

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

  var maxV = stats ? stats.bandCeil * scale * 1.1 : 0;
  for (var i = 0; i <= cycleDays; i++) if (total[i] * scale > maxV) maxV = total[i] * scale;
  if (measuredFT && calFT && measuredFT > maxV) maxV = measuredFT * 1.1;
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
    ctx.fillRect(PAD.left, yOf(stats.bandCeil * scale), cW, yOf(stats.bandFloor * scale) - yOf(stats.bandCeil * scale));
    ctx.strokeStyle = 'rgba(34,204,102,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssTrough * scale)); ctx.lineTo(PAD.left+cW, yOf(stats.ssTrough * scale)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssPeak   * scale)); ctx.lineTo(PAD.left+cW, yOf(stats.ssPeak   * scale)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Measured free T reference line (dashed orange)
  if (measuredFT && calFT) {
    var refY = yOf(measuredFT);
    ctx.strokeStyle = '#e8a02099'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, refY); ctx.lineTo(PAD.left + cW, refY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8a020bb'; ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.round(measuredFT), PAD.left + 3, refY - 2);
  }

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'right';
  for (var ti = 0; ti <= 3; ti++) {
    var ty = PAD.top + (cH / 3) * ti;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left+cW, ty); ctx.stroke();
    var tv = vMax * (1 - ti / 3);
    ctx.fillText(calFT ? Math.round(tv) : (tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2)), PAD.left - 4, ty + 3);
  }
  ctx.save(); ctx.translate(10, PAD.top + cH/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText(unitLabel, 0, 0); ctx.restore();

  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55'); grad.addColorStop(1, lineColor + '00');
  ctx.beginPath(); ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(total[t] * scale || 0));
  ctx.lineTo(xOf(cycleDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(total[0] * scale || 0));
  for (var t3 = 1; t3 <= cycleDays; t3++) ctx.lineTo(xOf(t3), yOf(total[t3] * scale || 0));
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

// ── Push log to schedule (writes dated injection entries directly to backend) ──

async function _tcSyncLogToBackend() {
  var h=(typeof authHeaders==='function')?authHeaders():null;
  if(!h)return;
  var _now=new Date();_now.setHours(0,0,0,0);
  var todayStr=_now.getFullYear()+'-'+String(_now.getMonth()+1).padStart(2,'0')+'-'+String(_now.getDate()).padStart(2,'0');

  // Group future log entries (>= today) by compId
  var byComp={};
  (_tcp.manualLog||[]).forEach(function(e){
    if(!e.compId||!e.date||!(parseDec(e.doseMg)>0))return;
    if(e.date<todayStr)return;
    if(!byComp[e.compId])byComp[e.compId]=[];
    byComp[e.compId].push(e);
  });

  // Clear all unlogged tcalc entries from today onwards (covers removed compounds too),
  // then re-post each compound's future entries via batch upsert.
  try{
    await fetch(AGENT_URL+'/injections?cycle_id=tcalc&from_date='+todayStr,{method:'DELETE',headers:h});
  }catch(_e){}

  var compIds=Object.keys(byComp);
  for(var _i=0;_i<compIds.length;_i++){
    var cid=compIds[_i];
    var cd=_tcCompInfo(cid);
    var entries=byComp[cid].map(function(e){
      return {
        cycle_id:'tcalc',compound_id:cid,
        compound_name:cd.name||cid,tier:'trt',
        date:e.date,
        dose:String(Math.round(parseDec(e.doseMg)*10)/10),
        unit:'mg',dot:cd.dot||'#e8a020',
        source:'tcalc'
      };
    });
    try{
      await fetch(AGENT_URL+'/injections/batch',{
        method:'POST',
        headers:Object.assign({'Content-Type':'application/json'},h),
        body:JSON.stringify({cycle_id:'tcalc',compound_id:cid,from_date:todayStr,entries:entries})
      });
    }catch(_e){}
  }

  if(typeof refreshInjectionsCache==='function')await refreshInjectionsCache();
}

async function _tcPushLogToSchedule() {
  var log=_tcp.manualLog||[];
  if(!log.length){alert('No injections logged yet.');return;}
  var h=(typeof authHeaders==='function')?authHeaders():null;
  if(!h){alert('Sign in required.');return;}
  var _now=new Date();_now.setHours(0,0,0,0);
  var todayStr=_now.getFullYear()+'-'+String(_now.getMonth()+1).padStart(2,'0')+'-'+String(_now.getDate()).padStart(2,'0');
  await _tcSyncLogToBackend();
  var futureCount=log.filter(function(e){return e.date>=todayStr&&parseDec(e.doseMg)>0;}).length;
  alert('Pushed '+futureCount+' future injection'+(futureCount===1?'':'s')+' to schedule.');
}

// ── Main build ────────────────────────────────────────────────────────────────

function buildTCalc() {
  _tcComputeGhStack();  // refresh SHBG stack (compounds + supplements like Boron)
  var el = document.getElementById('tcalc-body');
  if (!el) return;

  if (!_tcpSessionLoaded) {
    _tcpSessionLoaded = true;
    _tcLoadProfile();
  }

  if (_tcBwEntries === null && !_tcBwLoading) {
    _tcBwLoading = true;
    _tcFetchBwEntries();
  }

  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:16px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';

  var log      = _tcp.manualLog || [];
  var comps    = _tcManualComps();
  var validLog = log.filter(function(e){ return e.date && e.doseMg && parseDec(e.doseMg) > 0; });
  var mftNum   = parseDec(_tcp.measuredFT) || 0;

  var html = '';

  // ── 1. PLASMA CURVE (top — main feature) ─────────────────────────────────────
  var chartDot = (validLog.length > 0 && validLog[0].compId)
    ? (_tcCompInfo(validLog[0].compId).dot || '#e8a020') : '#e8a020';
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:' + chartDot + '"></div>';
  html += '<div class="card-title">PLASMA CURVE</div></div>';
  html += '<span style="font-size:11px;color:var(--muted2)">' + (mftNum > 0 ? 'calibrated · pmol/L' : 'add bloodwork to calibrate') + '</span>';
  html += '</div>';
  if (validLog.length > 0) {
    html += '<div style="padding:2px 16px 10px">';
    html += '<div style="display:flex;gap:4px;margin-bottom:8px">';
    ['today','week','month','whole'].forEach(function(z) {
      var isA = _tcChartZoom === z;
      html += '<button id="tc-zoom-' + z + '" onclick="_tcSetChartZoom(\'' + z + '\')" style="flex:1;background:' + (isA ? 'rgba(102,136,204,0.25)' : 'none') + ';border:1px solid ' + (isA ? '#6688cc66' : 'var(--border)') + ';border-radius:6px;color:' + (isA ? '#6688cc' : 'var(--muted2)') + ';font-size:9px;font-weight:700;letter-spacing:0.8px;cursor:pointer;padding:5px 2px;font-family:inherit">' + z.toUpperCase() + '</button>';
    });
    html += '</div>';
    html += '<label style="display:flex;align-items:center;gap:5px;font-size:9px;font-weight:700;letter-spacing:0.6px;color:var(--muted2);cursor:pointer;margin-bottom:8px;user-select:none">' +
      '<input type="checkbox" ' + (_tcShowAvg() ? 'checked' : '') + ' onchange="_tcToggleAvgLine(this)" style="accent-color:#5ad1b0;width:13px;height:13px;cursor:pointer;margin:0"> ' +
      '<span style="color:#5ad1b0">■</span> STEADY-STATE AVERAGE' +
      '</label>';
    html += '<canvas id="tc-main-chart" style="width:100%;display:block;"></canvas>';
    html += '</div>';
  } else {
    html += '<div style="padding:28px 16px;text-align:center;color:var(--muted2);font-size:13px">';
    html += 'No injections logged yet.<br><span style="font-size:12px;opacity:0.6">Add injections below to plot your plasma curve.</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── 2. INJECTION SCHEDULE (main card — inline) ────────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#6688cc"></div>';
  html += '<div class="card-title">INJECTION SCHEDULE</div></div>';
  html += '<div style="display:flex;align-items:center;gap:6px">';
  if (log.length > 0) {
    html += '<button onclick="_tcPushLogToSchedule()" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted2);font-size:10px;font-weight:700;letter-spacing:0.5px;cursor:pointer;padding:5px 10px;font-family:inherit">PUSH TO SCHEDULE</button>';
  }
  html += '<button onclick="_tcAddManualEntry()" style="background:linear-gradient(135deg,#6688cc,#4466aa);border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:800;letter-spacing:0.8px;cursor:pointer;padding:7px 14px;font-family:inherit">+ ADD</button>';
  html += '</div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">';

  if (log.length === 0) {
    html += '<div style="text-align:center;padding:16px 0;color:var(--muted2);font-size:13px">No injections logged yet.<br><span style="font-size:12px;opacity:0.6">Tap + ADD to log your first injection.</span></div>';
  } else {
    // Pre-compute series metadata
    var _seriesSeen = {};
    var _seriesTotals = {};
    var _seriesMeta = {};
    log.forEach(function(e){
      if(!e.seriesId)return;
      var sid=e.seriesId;
      _seriesTotals[sid]=(_seriesTotals[sid]||0)+1;
      if(!_seriesMeta[sid]){_seriesMeta[sid]={compId:e.compId,doseMg:e.doseMg,firstDate:e.date,lastDate:e.date};}
      else{if(e.date<_seriesMeta[sid].firstDate)_seriesMeta[sid].firstDate=e.date;if(e.date>_seriesMeta[sid].lastDate)_seriesMeta[sid].lastDate=e.date;}
    });
    Object.keys(_seriesMeta).forEach(function(sid){
      if((_seriesTotals[sid]||0)<2)return;
      var dates=log.filter(function(e){return e.seriesId===sid;}).map(function(e){return e.date||'';}).sort();
      var d0=new Date(dates[0].replace(/-/g,'/')),d1=new Date(dates[1].replace(/-/g,'/'));
      _seriesMeta[sid].interval=Math.round((d1-d0)/86400000);
    });
    var _tcFmtD=function(iso){if(!iso)return'';var p=iso.split('-');var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return parseInt(p[2],10)+' '+M[parseInt(p[1],10)-1];};

    log.forEach(function(entry, idx) {
      var cd = _tcCompInfo(entry.compId || (comps[0] || ''));
      var sid = entry.seriesId;

      if (sid) {
        // ── One summary card per seriesId ──
        if (_seriesSeen[sid]) return;
        _seriesSeen[sid] = true;
        var meta = _seriesMeta[sid] || {};
        var total = _seriesTotals[sid] || 1;
        var iv = meta.interval;
        var ivLabel = iv ? ' · every ' + iv + ' day' + (iv === 1 ? '' : 's') : '';
        var mcd = _tcCompInfo(meta.compId || (comps[0] || ''));
        var editBtnStyle = 'background:none;border:1px solid #6688cc66;border-radius:6px;color:#6688cc;font-size:10px;font-weight:700;letter-spacing:0.5px;cursor:pointer;padding:4px 8px;font-family:inherit;flex-shrink:0';
        var deleteBtnStyle = 'background:none;border:none;color:var(--muted2);font-size:16px;cursor:pointer;padding:2px 4px;line-height:1;flex-shrink:0';
        // Stack visual: box-shadow creates two "cards" peeking behind the top card
        html += '<div onclick="_tcShowSeriesDetail(\'' + _esc(sid) + '\')" style="background:rgba(102,136,204,0.10);border:1px dashed #6688cc66;border-radius:12px;padding:12px;box-shadow:3px 3px 0 0 rgba(102,136,204,0.18),6px 6px 0 0 rgba(102,136,204,0.09);cursor:pointer;">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        html += '<span style="font-size:10px;font-weight:800;letter-spacing:1px;color:#6688cc;text-transform:uppercase">⛓ SERIES</span>';
        html += '<span style="font-size:10px;color:var(--muted2)">' + total + ' injections' + ivLabel + '</span>';
        html += '</div>';
        html += '<div style="display:flex;align-items:center;gap:6px;">';
        html += '<button onclick="event.stopPropagation();_tcOpenEditSeriesSheet(\'' + _esc(sid) + '\')" style="' + editBtnStyle + '">EDIT</button>';
        html += '<button onclick="event.stopPropagation();_tcConfirmRemoveSeries(\'' + _esc(sid) + '\')" style="' + deleteBtnStyle + '">✕</button>';
        html += '</div>';
        html += '</div>';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
        html += '<span style="width:8px;height:8px;border-radius:50%;background:' + mcd.dot + ';display:inline-block;flex-shrink:0"></span>';
        html += '<span style="font-size:14px;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(mcd.name) + '</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:24px;">';
        html += '<div><div style="' + lSty + '">DOSE</div><div style="font-size:14px;font-weight:600;color:var(--text)">' + _esc(String(meta.doseMg || '')) + ' mg</div></div>';
        if (meta.firstDate) {
          var dRange = _tcFmtD(meta.firstDate) + (meta.firstDate !== meta.lastDate ? ' → ' + _tcFmtD(meta.lastDate) : '');
          html += '<div><div style="' + lSty + '">DATES</div><div style="font-size:14px;font-weight:600;color:var(--text)">' + _esc(dRange) + '</div></div>';
        }
        html += '</div>';
        html += '</div>';
      } else {
        // Single injection card
        var compSelect = '<select onchange="_tcSetManualField(' + idx + ',\'compId\',this.value)" style="' + iSty + ';flex:1;min-width:0;font-size:14px">';
        comps.forEach(function(id) {
          var n = _tcCompInfo(id).name;
          compSelect += '<option value="' + _esc(id) + '"' + (entry.compId === id ? ' selected' : '') + '>' + _esc(n) + '</option>';
        });
        compSelect += '</select>';
        var borderCol = cd.dot + '33';
        html += '<div style="background:var(--surface2);border:1px solid ' + borderCol + ';border-radius:12px;padding:12px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
        html += '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + ';display:inline-block;flex-shrink:0"></span>';
        html += compSelect;
        html += '<button onclick="_tcConfirmRemove(' + idx + ')" style="background:none;border:none;color:var(--muted2);font-size:18px;cursor:pointer;padding:2px 4px;flex-shrink:0;line-height:1">✕</button>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
        html += '<div style="min-width:0;overflow:hidden"><div style="' + lSty + '">DOSE (mg)</div>';
        html += '<input type="text" inputmode="decimal" value="' + _esc(String(entry.doseMg || '')) + '" placeholder="e.g. 100" onchange="_tcSetManualField(' + idx + ',\'doseMg\',+this.value)" style="' + iSty + ';font-size:14px"></div>';
        html += '<div style="min-width:0;overflow:hidden"><div style="' + lSty + '">DATE</div>';
        html += '<input type="date" value="' + _esc(entry.date || '') + '" onchange="_tcSetManualField(' + idx + ',\'date\',this.value)" style="' + iSty + ';font-size:14px"></div>';
        html += '</div></div>';
      }
    });
  }
  html += '</div></div>';

  // ── 3. BLOODWORK (collapsible list) ──────────────────────────────────────────
  var _latestBw = (_tcBwEntries && _tcBwEntries.length) ? _tcBwEntries[0] : null;
  var bwSummary = _latestBw
    ? (_latestBw.free_t != null
        ? 'Calibrated · ' + Math.round(_latestBw.free_t) + ' pmol/L Free T'
        : (_latestBw.total_t != null ? 'Total T ' + _latestBw.total_t + ' nmol/L' : _latestBw.date))
    : (_tcBwEntries === null ? 'Loading…' : 'No entries — tap to add');

  html += '<div class="card">';
  html += '<div class="card-header" onclick="_tcToggleBw()" style="cursor:pointer;user-select:none">';
  html += '<div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#cc8844"></div>';
  html += '<div class="card-title">BLOODWORK</div></div>';
  html += '<div style="display:flex;align-items:center;gap:8px">';
  if (!_tcBwOpen) {
    html += '<span style="font-size:11px;color:var(--muted2)">' + _esc(bwSummary) + '</span>';
  }
  html += '<span style="font-size:14px;color:var(--muted2);line-height:1">' + (_tcBwOpen ? '▲' : '▼') + '</span>';
  html += '</div></div>';

  if (_tcBwOpen) {
    html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">';

    // Age display
    if (_tcp.birthYear) {
      var _bwAge = new Date().getFullYear() - parseInt(_tcp.birthYear);
      html += '<div style="background:var(--surface2);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">';
      html += '<span style="font-size:12px;color:var(--muted)">Age (from profile)</span>';
      html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + _bwAge + ' yrs</span>';
      html += '</div>';
    } else if (_tcAgeMissing) {
      html += '<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#f59e0b;">⚠ Age not set — go to Body Comp → Age to enable age-stratified reference ranges.</div>';
    }

    // ADD ENTRY button
    html += '<div style="display:flex;justify-content:flex-end">';
    html += '<button onclick="event.stopPropagation();_tcBwOpenAddSheet()" style="background:linear-gradient(135deg,#cc8844,#aa6622);border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:800;letter-spacing:0.8px;cursor:pointer;padding:7px 14px;font-family:inherit">+ ADD ENTRY</button>';
    html += '</div>';

    // Entry list
    if (_tcBwEntries === null) {
      html += '<div style="text-align:center;padding:16px 0;color:var(--muted2);font-size:13px">Loading…</div>';
    } else if (_tcBwEntries.length === 0) {
      html += '<div style="text-align:center;padding:16px 0;color:var(--muted2);font-size:13px">No blood test entries yet.<br><span style="font-size:12px;opacity:0.6">Tap + ADD ENTRY to log your first result.</span></div>';
    } else {
      var _fmtBwDate = function(iso) {
        if (!iso) return '';
        var p = iso.split('-');
        var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return parseInt(p[2],10) + ' ' + M[parseInt(p[1],10)-1] + ' ' + p[0];
      };
      _tcBwEntries.forEach(function(entry, idx) {
        var isLatest = idx === 0;
        var parts = [];
        if (entry.total_t    != null) parts.push('Total T ' + entry.total_t + ' nmol/L');
        if (entry.shbg       != null) parts.push('SHBG ' + entry.shbg + ' nmol/L');
        if (entry.free_t     != null) parts.push('Free T ' + entry.free_t + ' pmol/L');
        if (entry.dose_at_bw != null) parts.push(entry.dose_at_bw + ' mg/wk');
        if (entry.extra && entry.extra.length) parts.push('+' + entry.extra.length + ' more');
        html += '<div style="background:var(--surface2);border:1px solid ' + (isLatest ? '#cc884455' : 'var(--border)') + ';border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
        html += '<div style="min-width:0;flex:1">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (parts.length ? '4' : '0') + 'px">';
        html += '<span style="font-size:14px;font-weight:700;color:var(--text)">' + _esc(_fmtBwDate(entry.date)) + '</span>';
        if (isLatest) html += '<span style="font-size:9px;font-weight:800;letter-spacing:0.8px;background:#cc884433;color:#cc8844;border-radius:4px;padding:2px 6px">LATEST</span>';
        html += '</div>';
        if (parts.length) html += '<div style="font-size:12px;color:var(--muted2);line-height:1.6">' + _esc(parts.join(' · ')) + '</div>';
        html += '</div>';
        html += '<button onclick="event.stopPropagation();_tcBwDeleteEntry(\'' + _esc(entry.id) + '\')" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted2);font-size:18px;line-height:1;cursor:pointer;padding:4px 9px;flex-shrink:0">×</button>';
        html += '</div>';
      });
    }

    // Target free T — user preference, stays editable
    html += '<div style="border-top:1px solid var(--border);padding-top:12px">';
    html += '<div><label style="' + lSty + '">Target free T (pmol/L)</label>';
    html += '<input type="number" min="0" max="10000" step="10" value="' + _esc(_tcp.targetFT) + '" placeholder="225–675 optimal · 600–1000 high-normal TRT" oninput="_tcp.targetFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
    html += '</div>';

    // Calculated outputs from latest entry
    var _bwTgt = parseDec(_tcp.targetFT) || 0;
    if (_latestBw) {
      var _bwTT   = parseDec(_latestBw.total_t)   || 0;
      var _bwSHBG = parseDec(_latestBw.shbg)       || 0;
      var _bwMFT  = parseDec(_latestBw.free_t)     || 0;
      var _bwDose = parseDec(_latestBw.dose_at_bw) || 0;
      var _bwVerm = (_bwTT > 0 && _bwSHBG > 0) ? _tcVermeulenFT(_bwTT, _bwSHBG) : null;
      var _bwFrac = _bwMFT > 0 && _bwTT > 0 ? _bwMFT / (_bwTT * 1000)
                  : (_bwVerm !== null && _bwTT > 0 ? _bwVerm / (_bwTT * 1000) : null);
      var _bwTgtTT = (_bwTgt > 0 && _bwFrac > 0) ? (_bwTgt / _bwFrac / 1000) : null;
      var _bwMgNm  = (_bwDose > 0 && _bwTT > 0) ? (_bwTT / _bwDose) : null;
      if (_bwVerm !== null || _bwTgtTT !== null) {
        html += '<div style="background:var(--surface2);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">';
        if (_bwVerm !== null) {
          html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
          html += '<span style="font-size:13px;color:var(--muted)">Vermeulen est. free T</span>';
          html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + Math.round(_bwVerm) + ' pmol/L</span></div>';
        }
        if (_bwFrac !== null) {
          html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
          html += '<span style="font-size:13px;color:var(--muted)">Free T fraction</span>';
          html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + (_bwFrac * 100).toFixed(2) + '%</span></div>';
        }
        if (_bwTgtTT !== null) {
          html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
          html += '<span style="font-size:13px;color:var(--muted)">Total T needed</span>';
          html += '<span style="font-size:15px;font-weight:700;color:var(--accent)">' + _bwTgtTT.toFixed(1) + ' nmol/L</span></div>';
        }
        if (_bwMgNm !== null && _bwTgtTT !== null) {
          html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
          html += '<span style="font-size:13px;color:var(--muted)">Weekly dose needed</span>';
          html += '<span style="font-size:15px;font-weight:700;color:var(--accent)">' + Math.round(_bwTgtTT / _bwMgNm) + ' mg/wk</span></div>';
        }
        html += '</div>';
      }
    } else if (_tcBwEntries && _tcBwEntries.length === 0) {
      html += '<div style="font-size:13px;color:var(--muted2);line-height:1.5">Add blood test entries to calibrate the plasma curve and enable dose calculations.<br>Optimal male free T: 225–675 pmol/L · High-normal TRT: 600–1000 pmol/L</div>';
    }

    html += '</div>'; // close padding
  }
  html += '</div>'; // close card

  el.innerHTML = html;

  if (validLog.length > 0) {
    requestAnimationFrame(function() { _tcDrawManualChart('tc-main-chart', validLog, _tcChartZoom); _tcAttachPanListeners(document.getElementById('tc-main-chart')); });
  }
}
