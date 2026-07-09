// Blood Levels tab — PK plasma concentration curves for TRT & Enhanced compounds

function _parseHalfLifeDays(str) {
  if (!str) return null;
  var s = str.toLowerCase();
  // "X–Y days" or "X-Y days" → average of range
  var m = s.match(/~?(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)\s*days?/);
  if (m) return (parseDec(m[1]) + parseDec(m[2])) / 2;
  // "~X.X days" or "X days"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*days?/);
  if (m) return parseDec(m[1]);
  // "~X hours" or "X h"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s|$)/);
  if (m) return parseDec(m[1]) / 24;
  // "~X min"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*min/);
  if (m) return parseDec(m[1]) / 60 / 24;
  return null;
}

function _pkInjectionDays(c, cycleLen, cycleStartDow) {
  if (!c.days || !c.days.length) {
    // Nebido-style: every freqVal weeks (or days)
    var freqDays = c.freqUnit === 'weeks' ? (c.freqVal || 1) * 7 : (c.freqVal || 1);
    var days = [];
    for (var d = 0; d < cycleLen; d += freqDays) days.push(Math.round(d));
    return days;
  }
  var days = [];
  for (var d = 0; d < cycleLen; d++) {
    if (c.days.indexOf((cycleStartDow + d) % 7) !== -1) days.push(d);
  }
  return days;
}

function _pkCurve(injDays, dosePerInj, halfLifeDays, cycleDays) {
  var curve = new Float64Array(cycleDays + 1);
  var k = Math.LN2 / halfLifeDays;
  for (var t = 0; t <= cycleDays; t++) {
    var c = 0;
    for (var j = 0; j < injDays.length; j++) {
      if (injDays[j] <= t) c += dosePerInj * Math.exp(-k * (t - injDays[j]));
    }
    curve[t] = c;
  }
  return curve;
}

// Samples-per-day for the blood chart. Daily sampling aliases daily-dosed
// compounds into a flat line (each sample lands at the same post-dose phase);
// sampling several times per day reveals their real intra-day sawtooth so a
// frequently-injected compound looks frequent, not smooth.
var _BL_SPD = 6;
// Sub-day PK curve: index = step (day × _BL_SPD), so it captures the peak/trough
// within each dosing interval. Injections occur at the start of their day.
function _pkCurveFine(injDays, dosePerInj, halfLifeDays, cycleDays) {
  var spd = _BL_SPD, N = cycleDays * spd;
  var curve = new Float64Array(N + 1);
  var kStep = Math.LN2 / (halfLifeDays * spd);
  var injSteps = injDays.map(function(d){ return d * spd; });
  for (var t = 0; t <= N; t++) {
    var c = 0;
    for (var j = 0; j < injSteps.length; j++) {
      if (injSteps[j] <= t) c += dosePerInj * Math.exp(-kStep * (t - injSteps[j]));
    }
    curve[t] = c;
  }
  return curve;
}

// Absorption rate (1/day) for a given half-life — the T-Calc _tcKa heuristic
// (absorption speed scaled by ester half-life), clamped so absorption is always
// faster than elimination. The clamp only bites for ultra-short-half-life orals
// (e.g. some supplements) where raw _tcKa would fall below ke and invert the
// rise/fall; for injectables ka already exceeds ke so it is unaffected.
function _blKa(halfLifeDays, ke) {
  var ka = (typeof _tcKa === 'function') ? _tcKa(halfLifeDays) : ke * 4;
  return ka <= ke ? ke * 2.5 : ka;
}
// Sub-day PK curve using the SAME first-order ABSORPTION model as the T-Calc
// chart (_tcPkConc: rise to a Tmax peak, then fall) — used for every compound
// and supplement line so none uses the older, unphysical instantaneous-input
// decay. Each injection shares one per-dose amount.
function _pkCurveFineAbs(injDays, dosePerInj, halfLifeDays, cycleDays) {
  var spd = _BL_SPD, N = cycleDays * spd;
  var curve = new Float64Array(N + 1);
  var ke = Math.LN2 / halfLifeDays;
  var ka = _blKa(halfLifeDays, ke);
  var useAbs = (typeof _tcPkConc === 'function');
  for (var j = 0; j < injDays.length; j++) {
    var s0 = Math.round(injDays[j] * spd);
    for (var t = s0; t <= N; t++) {
      var dt = (t - s0) / spd;
      curve[t] += useAbs ? _tcPkConc(dosePerInj, ka, ke, dt) : dosePerInj * Math.exp(-ke * dt);
    }
  }
  return curve;
}

// Sub-day PK curve for T-Calc-planned testosterone. Uses the SAME 1-compartment
// first-order ABSORPTION model as the T-Calc chart (_tcPkConc: rise to a Tmax
// peak, then fall) rather than an instantaneous-input decay, so the Blood Levels
// red line matches the T-Calc plasma curve. Each injection carries its own
// (titrated) dose. doseSteps: [{step, dose}] (step = day × _BL_SPD, dose in mg).
function _blTcalcCurve(doseSteps, halfLifeDays, bioav, cycleDays) {
  var spd = _BL_SPD, N = cycleDays * spd;
  var curve = new Float64Array(N + 1);
  var ke = Math.LN2 / halfLifeDays;
  var ka = _blKa(halfLifeDays, ke);
  var useAbs = (typeof _tcPkConc === 'function');
  for (var j = 0; j < doseSteps.length; j++) {
    var dose = doseSteps[j].dose * (bioav || 1), s0 = doseSteps[j].step;
    for (var t = s0; t <= N; t++) {
      var dt = (t - s0) / spd;
      curve[t] += useAbs ? _tcPkConc(dose, ka, ke, dt) : dose * Math.exp(-ke * dt);
    }
  }
  return curve;
}
// Tmax (days to peak) for the absorption model — used to extend the drawn range
// just past the last injection so its hump peaks before the line ends.
function _blTmax(halfLifeDays) {
  var ke = Math.LN2 / halfLifeDays;
  var ka = _blKa(halfLifeDays, ke);
  return (ka > ke) ? Math.log(ka / ke) / (ka - ke) : 1;
}

// T-Calc-planned testosterone (injections with cycle_id 'tcalc') — planned via
// the T-Calc planner rather than configured as a stack TRT compound, so it is
// otherwise absent from the chart. Gather its dated injections per compound.
function _blTcalcTestosterone() {
  if (typeof _injectionsCache === 'undefined' || !_injectionsCache) return [];
  var byComp = {};
  Object.keys(_injectionsCache).forEach(function(dk){
    (_injectionsCache[dk]||[]).forEach(function(e){
      if (!e || e.cycle_id !== 'tcalc') return;
      if (e.tier && e.tier !== 'trt') return;
      if (e.active === false) return;
      var cid = e.compound_id || e.compound_name || 'testosterone';
      var c = byComp[cid] || (byComp[cid] = { id:cid, name:e.compound_name||cid, unit:e.unit||'mg', doses:[] });
      var dose = parseDec(e.dose) || 0;
      var d = (typeof parseLocalDate === 'function') ? parseLocalDate(e.date) : new Date(e.date);
      if (d && dose > 0) c.doses.push({ date:d, dose:dose });
    });
  });
  return Object.keys(byComp).map(function(k){ return byComp[k]; }).filter(function(c){ return c.doses.length; });
}

// Per-compound blood-level reference data (biomarker, clinical unit, reference
// ranges, dose→level models) served from the backend — all data lives there.
// { markers:{id:{name,unit,ref:[lo,hi],opt:[lo,hi]}}, compounds:{id:{marker,assay,model}} }
var _BL_PK = null;
async function _blSyncPK(){
  try{
    var ctrl = new AbortController(); var tid = setTimeout(function(){ ctrl.abort(); }, 6000);
    var r = await fetch(AGENT_URL+'/blood-levels', { headers:authHeaders(), signal:ctrl.signal });
    clearTimeout(tid);
    if(!r.ok){ if(typeof _logHttp==='function') _logHttp('syncBloodPK', r.status, '/blood-levels'); return; }
    _BL_PK = await r.json();
    if(document.getElementById('bl-chart')){ _blLines = _blBuildLines(); _blRenderChart(); _blRenderLegend(); }
  }catch(e){ if(typeof _logErr==='function') _logErr('syncBloodPK', e); }
}
// Look up a compound/supplement's blood-level descriptor + its marker.
function _blPKFor(id){
  if(!_BL_PK || !_BL_PK.compounds) return null;
  var c = _BL_PK.compounds[id]; if(!c) return null;
  var m = (c.marker && _BL_PK.markers) ? _BL_PK.markers[c.marker] : null;
  return { comp:c, marker:m };
}


// ── Combined blood-levels chart (all active compounds + supplements) ─────────
// One normalised multi-line overlay: each line is drawn as a % of its own peak
// so compounds in different units (mg / µg / IU) are comparable. Lines can be
// toggled on/off, and the today/week/month zoom + drag-pan mirrors the
// T-Calc free-T chart. Defaults to 'week' (the fully-zoomed-out 'whole' view
// was an unreadable dense sawtooth mass at typical cycle lengths).
var _blZoom = 'week';
var _blPanOffset = 0;      // days
var _blHidden = null;      // {lineId:true} hidden lines (lazy-loaded cache)
var _blLines = [];         // built line objects for the current render
var _blTimeline = null;    // {firstDate, totalDays, nowDay}

// Plasma elimination half-life (days) per supplement, used for the RELATIVE
// overlay curve only — never for dosing decisions. Supplements are commodity OTC
// products (not proprietary compound data). Values are evidence-based plasma
// half-lives; where a nutrient's meaningful blood level is its biomarker/stored
// form rather than the parent molecule, the biomarker is used (noted inline).
var _SUPP_HALFLIFE = {
  // Fat-soluble vitamins
  vitd3:15,        // 25(OH)D biomarker (parent D3 clears to fat in ~15–25 h)
  vita:0.15,       // retinol / chylomicron plasma clearance ~3–4 h
  vite:2,          // α-tocopherol ~44–48 h
  vitk2:2.5,       // MK-7 ~48–72 h
  // Water-soluble vitamins
  vitc:0.02,       // ~30 min at saturating oral doses (dose-dependent)
  bcomplex:0.1,    // mixed B vitamins, mostly cleared within ~1–2 h
  b6:17.5,         // PLP terminal phase ~15–20 days (albumin/muscle-bound)
  // Minerals & electrolytes
  magnesium:0.19,  // acute plasma clearance ~4–5 h
  zinc:0.125,      // ~3 h
  boron:0.875,     // ~21 h (boric acid/citrate, renal clearance)
  selenium:10.5,   // selenomethionine ~252 h (incorporated into body proteins)
  iodine:0.073,    // plasma iodide clearance ~1.5–2 h (thyroid pool far longer)
  potassium:0.5,   // not in supplied table
  // Amino acids & ergogenic aids
  creatine:0.1,    // ~2–3 h
  citrulline:0.042,// ~1 h
  taurine:0.05,    // ~1 h (not in supplied table)
  betaalanine:0.015,// ~20–25 min
  ltheanine:0.04,  // ~50–70 min
  glycine:0.04,    // ~0.5–1 h (not in supplied table)
  // Hormones & lipids
  melatonin:0.028, // ~30–50 min (heavy first-pass metabolism)
  omega3:2.5,      // EPA/DHA plasma lipids ~2–3 days
  coq10:1.375,     // ~33 h
  // Herbals & adaptogens
  ashwagandha:0.156,// withanolides ~2.5–5 h (hepatic metabolism)
  rhodiola:0.031,  // salidroside ~45 min
  ginseng:0.68,    // ginsenoside Rb1 ~14–19 h (protein-bound; Rg1 clears faster)
  ginkgo:0.15,     // ginkgolides A/B ~3–4 h
  bacopa:0.125,    // bacosides ~2–4 h
  tongkat:0.052,   // eurycomanone ~1–1.5 h
  curcumin:0.271,  // ~6–7 h (rapid glucuronidation)
  milkthistle:0.25,// silybin ~6 h (enterohepatic recirculation)
  // Other supplements (not in supplied tables — reasonable defaults)
  nac:0.25, tudca:0.4, bergamot:0.5, berberine:0.5, hawthorn:0.4,
  nattokinase:0.3, psyllium:0.3, electrolytes:0.2, probiotics:0.5, whey:0.1, collagen:0.2
};
function _blSuppHalfLife(id){ return _SUPP_HALFLIFE[id] || 0.5; }
// Distinct palette for supplement lines (compounds carry their own dot colours).
var _BL_SUPP_COLORS = ['#7bd88f','#5ec8d8','#c084fc','#f0a860','#e879b0','#8ab4f8','#d8c85e','#84d8b0'];

function _blLoadHidden(){ if(_blHidden===null) _blHidden = getData('proto-blood-hidden', {}) || {}; return _blHidden; }

function _blFmtDateKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// Gather EVERY testosterone injection across all sources — stack TRT esters,
// enhanced-tier testosterone, and the T-Calc plan — into one dated log. This
// feeds the shared free-T model (_tcFreeTSeries) so the chart shows a single
// aggregated "Free T" line in pmol/L rather than a separate line per ester.
function _blTestosteroneLog(){
  var log = [];
  (_userStacks||[]).forEach(function(st, si){
    if(!_isActiveStack(si)) return;
    var cycleLen = (st.cycle_length || 12) * 7;
    var startDate = st.cycle_start ? parseLocalDate(st.cycle_start) : new Date(NOW);
    var startDow = startDate.getDay();
    function pushSched(c, dpi){
      _pkInjectionDays(c, cycleLen, startDow).forEach(function(dd){
        log.push({ compId:c.id, doseMg:String(dpi), date:_blFmtDateKey(new Date(startDate.getTime()+dd*86400000)) });
      });
    }
    if(st.trt && st.trt.enabled){
      (st.trt.compounds||[]).forEach(function(c){
        var doseNum=parseDec(c.dose)||0; if(doseNum) pushSched(c, doseNum);
      });
    }
    if(st.enhanced && st.enhanced.enabled){
      (st.enhanced.compounds||[]).forEach(function(c){
        if((c.name||'').toLowerCase().indexOf('testosterone')===-1) return;
        var ec = (typeof ENHANCEMENT_COMPOUNDS!=='undefined') ? ENHANCEMENT_COMPOUNDS.find(function(x){return x.id===c.id;}) : null;
        var doseNum=parseDec(c.dose)||0; if(!doseNum) return;
        var unit=c.unit||(ec&&ec.unit)||'mg/week';
        var injDays=_pkInjectionDays(c, cycleLen, startDow);
        var injsPerWeek=injDays.filter(function(d){return d<7;}).length||1;
        pushSched(c, unit==='mg/week'?doseNum/injsPerWeek:doseNum);
      });
    }
  });
  _blTcalcTestosterone().forEach(function(c){
    c.doses.forEach(function(d){ log.push({ compId:c.id, doseMg:String(d.dose), date:_blFmtDateKey(d.date) }); });
  });
  log.sort(function(a,b){ return a.date<b.date?-1:a.date>b.date?1:0; });
  return log;
}

// Build the line objects from every active stack's compounds + tracked supplements.
function _blBuildLines(){
  var lines = [], starts = [], compoundEnds = [];
  (_userStacks||[]).forEach(function(st, si){
    if(!_isActiveStack(si)) return;
    var cycleLen = (st.cycle_length || 12) * 7;
    var startDate = st.cycle_start ? parseLocalDate(st.cycle_start) : new Date(NOW);
    var startDow  = startDate.getDay();
    var stackLabel = st.name || ('Stack ' + (si + 1));
    starts.push(startDate); compoundEnds.push(startDate.getTime() + cycleLen*86400000);

    // Peptides
    (st.peptides||[]).forEach(function(p){
      if(p.active === false) return;
      var cat = (typeof PEPTIDE_CAT!=='undefined') ? PEPTIDE_CAT.find(function(x){ return x.id===p.id; }) : null;
      var hl = _parseHalfLifeDays(cat ? cat.halfLife : (p.halfLife||''));
      if(!hl) return;
      var dose = (parseDec(p.dose_am)||0) + (parseDec(p.dose_pm)||0);
      if(!dose) return;
      var injDays = _pkInjectionDays(p, cycleLen, startDow);
      if(!injDays.length) return;
      lines.push({ id:'pep_'+si+'_'+p.id, pkId:p.id, name:p.name||p.id, color:(cat&&cat.dot)||p.dot||'#3cffa0',
        kind:'peptide', unit:(p.unit_am||p.unit_pm||'mcg'), startDate:startDate, cycleLen:cycleLen, sub:stackLabel,
        lastInjDay:injDays[injDays.length-1], tmaxPad:_blTmax(hl), curve:_pkCurveFineAbs(injDays, dose, hl, cycleLen) });
    });

    // TRT (testosterone esters) is NOT drawn here as a per-ester amount line —
    // all testosterone is aggregated into the single "Free T" line (pmol/L) built
    // below from _blTestosteroneLog() + the shared free-T model.

    // Enhanced (non-testosterone compounds only; testosterone → the Free T line)
    if(st.enhanced && st.enhanced.enabled){
      (st.enhanced.compounds||[]).forEach(function(c){
        if((c.name||'').toLowerCase().indexOf('testosterone')!==-1) return;
        var ec = ENHANCEMENT_COMPOUNDS.find(function(x){ return x.id===c.id; });
        if(!ec || !ec.cadence) return;
        var hl = ec.id==='hgh' ? 1 : _parseHalfLifeDays(ec.cadence.halfLife); if(!hl) return;
        var doseNum = parseDec(c.dose)||0; if(!doseNum) return;
        var unit = c.unit || ec.unit || 'mg/week';
        var injDays = _pkInjectionDays(c, cycleLen, startDow); if(!injDays.length) return;
        var injsPerWeek = injDays.filter(function(d){ return d<7; }).length || 1;
        var dpi = unit==='mg/week' ? doseNum/injsPerWeek : doseNum;
        lines.push({ id:'enh_'+si+'_'+c.id, pkId:c.id, name:c.name, color:c.dot||ec.dot||'#a855f7',
          kind:'enhanced', unit:((unit||'mg/week').split('/')[0]||'mg'), startDate:startDate, cycleLen:cycleLen, sub:stackLabel,
          lastInjDay:injDays[injDays.length-1], tmaxPad:_blTmax(hl), curve:_pkCurveFineAbs(injDays, dpi, hl, cycleLen) });
      });
    }
  });

  // Global timeline: span from the earliest start to the latest compound end,
  // extended to ~6 weeks past today so ongoing supplements have somewhere to live.
  var supps = (typeof _supplements!=='undefined' && _supplements) ? _supplements.filter(function(s){ return s && s.supp_id; }) : [];
  var tlog = _blTestosteroneLog();
  var tDates = tlog.map(function(e){ return parseLocalDate(e.date).getTime(); });
  var firstDate = starts.length ? new Date(Math.min.apply(null, starts.map(function(d){ return d.getTime(); }))) : new Date(NOW);
  supps.forEach(function(s){ if(s.start_date){ var d=parseLocalDate(s.start_date); if(d<firstDate) firstDate=d; } });
  tDates.forEach(function(ms){ if(ms<firstDate.getTime()) firstDate=new Date(ms); });
  var tMax = tDates.length ? Math.max.apply(null, tDates) : 0;
  var maxCompoundEnd = compoundEnds.length ? Math.max.apply(null, compoundEnds) : 0;
  var lastMs = Math.max(maxCompoundEnd, tMax, supps.length ? (NOW.getTime()+42*86400000) : 0, firstDate.getTime()+7*86400000);
  var totalDays = Math.max(1, Math.round((lastMs - firstDate.getTime())/86400000));

  // Supplement lines across the whole timeline from their start date.
  supps.forEach(function(s, i){
    var hl = _blSuppHalfLife(s.supp_id);
    // Upgrade legacy IU-only doses to metric first (e.g. D3 "5000 IU" → 125 µg)
    // so the mg-equivalent magnitude is correct rather than treating IU as mg.
    var _fmt = (typeof _suppFmtDose==='function') ? _suppFmtDose(s.supp_id, s.dose) : s.dose;
    var _sp  = (typeof _suppParseDose==='function') ? _suppParseDose(_fmt) : null;
    var dose = _sp ? _sp.amount : (parseDec(s.dose) || 1);
    var sUnit = _sp ? _sp.unit : 'mg';
    var sStart = s.start_date ? parseLocalDate(s.start_date) : firstDate;
    var offset = Math.round((sStart.getTime() - firstDate.getTime())/86400000);
    var span = totalDays - offset; if(span < 1) return;
    var stepDays = s.freq==='weekly' ? 7 : (s.freq==='eod' ? 2 : 1);
    var injDays = []; for(var d=0; d<=span; d+=stepDays) injDays.push(d);
    if(!injDays.length) return;
    // Average daily dose in IU (for biomarker models keyed in IU, e.g. Vitamin D →
    // 25-OH-D). Prefer an explicit "… IU" dose; else convert µg (D3: 1 µg = 40 IU).
    var _perDose = /IU/i.test(String(s.dose||'')) ? (parseDec(s.dose)||0)
                 : (s.supp_id==='vitd3' && sUnit==='µg' ? dose*40 : 0);
    var _freqF = s.freq==='weekly' ? 1/7 : (s.freq==='eod' ? 1/2 : 1);
    lines.push({ id:'supp_'+(s.id||s.supp_id), pkId:s.supp_id, name:s.name||s.supp_id, color:_BL_SUPP_COLORS[i%_BL_SUPP_COLORS.length],
      kind:'supplement', unit:sUnit, startDate:sStart, cycleLen:span, sub:'supplement',
      dailyIU:_perDose*_freqF,
      lastInjDay:injDays[injDays.length-1], tmaxPad:_blTmax(hl), curve:_pkCurveFineAbs(injDays, dose, hl, span) });
  });

  // Aggregated Free T (pmol/L) — every testosterone injection (stack TRT esters,
  // enhanced testosterone, and the T-Calc plan) run through the SAME free-T model
  // the T-Calc chart uses, so this is an actual blood level, not a drug amount.
  // Before the first injection it sits at the endogenous baseline (measured free T).
  if (tlog.length && typeof _tcFreeTSeries === 'function') {
    var _S = _tcFreeTSeries(tlog, {});
    var _ftScaleAt = function(k){ return _S.total[k] * (_S.calFT_arr ? _S.calFT_arr[k] : _S.scale); };
    var _ftOff  = Math.round((_S.firstDate.getTime() - firstDate.getTime())/86400000);
    var _ftBase = _ftScaleAt(0);   // day-0 of the model = endogenous baseline free T
    var _ftCurve = new Float64Array(totalDays + 1);
    for (var _g = 0; _g <= totalDays; _g++) {
      var _k = _g - _ftOff;
      _ftCurve[_g] = _k < 0 ? _ftBase : _ftScaleAt(Math.min(_k, _S.totalDays));
    }
    lines.push({ id:'freeT', pkId:'testosterone', name:'Free T', color:'#ff3b30', kind:'freet', conc:true,
      unit:(_S.unitLabel === 'pmol/L' ? 'pmol/L' : ''), startDate:firstDate, cycleLen:totalDays, curve:_ftCurve });
  }

  // Convert amount lines into ACTUAL blood levels wherever the backend supplies a
  // dose→level model (e.g. Vitamin D3 → 25-OH-D). Attach the clinical reference
  // range to every concentration line (incl. Free T) for the shaded normal band.
  if (_BL_PK && _BL_PK.compounds) {
    lines.forEach(function(ln){
      var pk = _blPKFor(ln.pkId); if(!pk) return;
      if (ln.conc) { if(pk.marker) ln.marker = pk.marker; return; }
      if (!pk.comp.assay || !pk.comp.model || !pk.marker) return;
      var mdl = pk.comp.model;
      if (mdl.type === 'linear') {
        var pkAmt = 0; for(var i=0;i<ln.curve.length;i++) if(ln.curve[i]>pkAmt) pkAmt=ln.curve[i];
        if (pkAmt <= 0) return;
        var daily = (mdl.unit === 'IU') ? (ln.dailyIU||0) : 0;
        var steady = mdl.baseline + mdl.perUnitPerDay * daily;
        var off = Math.round((ln.startDate.getTime()-firstDate.getTime())/86400000);
        var conc = new Float64Array(totalDays + 1);
        for (var g=0; g<=totalDays; g++) {
          var step = Math.round((g-off)*_BL_SPD);
          var amt = (step>=0 && step<ln.curve.length) ? ln.curve[step] : 0;
          conc[g] = mdl.baseline + (steady - mdl.baseline) * (amt/pkAmt);   // baseline → steady with accumulation
        }
        ln.curve = conc; ln.conc = true; ln.unit = pk.marker.unit; ln.marker = pk.marker; ln.startDate = firstDate;
      }
    });
  }

  // Record each line's peak and how to place it on the axis. Amount lines convert
  // to mg-equivalent and are sub-day sampled; concentration lines (Free T) carry a
  // real blood level in their own unit, plotted directly and day-indexed.
  lines.forEach(function(ln){
    var peak = 0; for(var t=0;t<ln.curve.length;t++) if(ln.curve[t] > peak) peak = ln.curve[t];
    ln.peak = peak || 1;
    if (ln.conc) {
      ln.mgScale = 1; ln.peakMg = ln.peak; ln.spd = 1; ln.lastStep = null; ln.offset = 0;
    } else {
      ln.mgScale = _blToMg(1, ln.unit);   // mg per dose-unit
      ln.peakMg  = ln.peak * ln.mgScale;  // peak amount in mg-equivalent
      ln.spd = _BL_SPD;
      // Draw up to the last dose + its Tmax so the final hump peaks without the long
      // post-schedule washout tail dropping the line toward zero. Never past the end
      // of the curve array (Tmax can push beyond the cycle for a long-ester compound).
      ln.lastStep = Math.min(ln.curve.length - 1,
        Math.round(((ln.lastInjDay != null ? ln.lastInjDay : ln.cycleLen) + (ln.tmaxPad||0)) * _BL_SPD));
      ln.offset = Math.round((ln.startDate.getTime() - firstDate.getTime())/86400000);
    }
  });
  _blTimeline = { firstDate:firstDate, totalDays:totalDays, nowDay:Math.round((NOW.getTime()-firstDate.getTime())/86400000) };
  return lines;
}

// mg-equivalent of a dose amount. Mass units convert exactly; IU / ml / counts
// have no clean mg conversion so they're kept on the same numeric scale (approx).
function _blToMg(v, unit){
  if(!(v>0)) return 0;
  switch(String(unit||'').toLowerCase()){
    case 'mg': return v;
    case 'mcg': case 'µg': return v*0.001;
    case 'g':  return v*1000;
    case 'ng': return v*1e-6;
    case 'kg': return v*1e6;
    default:   return v;
  }
}
// Format a mg value with an adaptive unit for axis ticks.
function _blFmtMg(v){
  if(!(v>0)) return '0';
  if(v>=1000)  return (Math.round(v/100)/10)+' g';
  if(v>=1)     return (Math.round(v*10)/10)+' mg';
  if(v>=0.001) return Math.round(v*1000)+' µg';
  return Math.round(v*1e6)+' ng';
}
// Format a plain number (for concentration lines in their own clinical unit).
function _blFmtNum(v){
  if(!(v>0)) return '0';
  if(v>=1000)  return (Math.round(v/100)/10)+'k';
  if(v>=1)     return ''+Math.round(v);
  if(v>=0.01)  return (Math.round(v*100)/100)+'';
  return v.toExponential(0);
}
// Axis-tick formatter chosen from the currently-visible lines: mg-equivalent for
// amount lines; the shared clinical unit when all visible lines are concentrations
// in that unit (e.g. "812 pmol/L"); a bare magnitude when the two are mixed.
function _blAxisFmt(visible){
  var concUnits = {}, hasAmount = false;
  visible.forEach(function(ln){ if(ln.conc){ concUnits[ln.unit||'']=1; } else { hasAmount = true; } });
  var keys = Object.keys(concUnits);
  if(!hasAmount && keys.length===1 && keys[0]) return function(v){ return _blFmtNum(v)+' '+keys[0]; };
  if(!hasAmount && keys.length>=1)             return function(v){ return _blFmtNum(v); };
  if(hasAmount && keys.length===0)             return _blFmtMg;
  return function(v){ return _blFmtNum(v); };   // mixed units — bare magnitude
}
// Single LOGARITHMIC Y-axis. The mg-equivalent amounts span µg → g (a
// million-fold range), so a linear axis buries the small curves at zero. A log
// axis makes every line visible at once regardless of how many magnitude tiers
// are present, on one clean scale — no left/right split, no dashing.
var _blAxis = null;
function _blNiceCeil(v){ var e=Math.floor(Math.log10(v)), base=Math.pow(10,e), m=v/base; return (m<=1?1:m<=2?2:m<=5?5:10)*base; }
function _blNiceFloor(v){ var e=Math.floor(Math.log10(v)), base=Math.pow(10,e), m=v/base; return (m>=5?5:m>=2?2:1)*base; }
function _blLogBounds(visible){
  var peaks=[]; visible.forEach(function(ln){ if(ln.peakMg>0) peaks.push(ln.peakMg); });
  if(!peaks.length) return {bottom:0.001, top:1};
  var maxP=Math.max.apply(null,peaks), minP=Math.min.apply(null,peaks);
  var top=_blNiceCeil(maxP);
  // Put the floor a full DECADE below the smallest line's peak, so that line has
  // real vertical room to show its shape instead of being pinned to the bottom
  // edge (otherwise a small compound like Vitamin D3 reads as a flat zero line).
  var bottom=_blNiceFloor(minP)/10;
  // Keep the axis between 2 and 6 decades tall: never so short it wastes space,
  // never so tall the curves shrink to threads.
  var dec=Math.log10(top/bottom);
  if(dec<2) bottom=top/100;
  if(dec>6) bottom=top/1e6;
  return {bottom:bottom, top:top};
}
// mg-equivalent value of a line at global day g (g may be fractional), or null
// outside its span or after the last scheduled dose (hides the washout tail).
function _blRawMgAt(ln, g){
  var step = Math.round((g - ln.offset) * (ln.spd||1));
  if(step < 0 || step >= ln.curve.length) return null;
  if(ln.lastStep != null && step > ln.lastStep) return null;
  return ln.curve[step] * (ln.mgScale||1);
}
// Kept for back-compat: normalised value (0..1) of a line at day g.
function _blValueAt(ln, g){
  var step = Math.round((g - ln.offset) * (ln.spd||1));
  if(step < 0 || step >= ln.curve.length) return null;
  return ln.curve[step] / ln.peak;
}

function _blDrawChart(canvas){
  if(!canvas || !_blTimeline) return;
  var dpr = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 320, cssH = 220;
  canvas.width = cssW*dpr; canvas.height = cssH*dpr;
  canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
  var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

  _blLoadHidden();
  var visible = _blLines.filter(function(ln){ return !_blHidden[ln.id]; });
  var axis = _blLogBounds(visible); _blAxis = axis;
  var lgB = Math.log10(axis.bottom), lgT = Math.log10(axis.top), lgSpan = (lgT-lgB)||1;

  var PAD = {top:10, right:14, bottom:22, left:44};
  var cW = cssW-PAD.left-PAD.right, cH = cssH-PAD.top-PAD.bottom;
  var totalDays = _blTimeline.totalDays, nowDay = _blTimeline.nowDay;
  var pan = _blZoom!=='whole' ? Math.round(_blPanOffset||0) : 0;
  var xStart = 0, xEnd = totalDays;
  if(_blZoom==='today')      { xStart=Math.max(0,nowDay-2+pan); xEnd=Math.min(totalDays,nowDay+2+pan); }
  else if(_blZoom==='week')  { xStart=Math.max(0,nowDay-3+pan); xEnd=Math.min(totalDays,nowDay+4+pan); }
  else if(_blZoom==='month') { xStart=Math.max(0,nowDay-15+pan); xEnd=Math.min(totalDays,nowDay+15+pan); }
  if(xEnd <= xStart) xEnd = Math.min(totalDays, xStart+7);
  canvas._blWin = {xStart:xStart, xEnd:xEnd, cW:cW};
  function xOf(g){ return PAD.left + ((g-xStart)/((xEnd-xStart)||1))*cW; }
  // Log Y: values at/below the axis floor ride the bottom; above the top clamp in.
  function yOf(v){ var vv = v>axis.bottom ? (v<axis.top?v:axis.top) : axis.bottom;
    return PAD.top + cH - ((Math.log10(vv)-lgB)/lgSpan)*cH; }

  // Horizontal grid + value labels at each power of ten within the axis range.
  var _axFmt = _blAxisFmt(visible);
  ctx.font = '9px DM Sans,sans-serif';
  for(var _e=Math.ceil(lgB); _e<=Math.floor(lgT+1e-9); _e++){
    var _val = Math.pow(10,_e), y = yOf(_val);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+cW, y); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.textAlign = 'right'; ctx.fillText(_axFmt(_val), PAD.left-4, y+3);
  }

  // Clinical reference-range band(s): a faint shaded normal range for each visible
  // concentration line that carries a marker (e.g. Free T 200–700 pmol/L, 25-OH-D
  // 50–125 nmol/L) — shows at a glance whether a level is low / in-range / high.
  visible.forEach(function(ln){
    if(!ln.conc || !ln.marker || !ln.marker.ref) return;
    var yHi = yOf(ln.marker.ref[1]), yLo = yOf(ln.marker.ref[0]);
    ctx.fillStyle = ln.color + '14'; ctx.fillRect(PAD.left, yHi, cW, yLo - yHi);
    if(ln.marker.opt){ var yoHi = yOf(ln.marker.opt[1]), yoLo = yOf(ln.marker.opt[0]);
      ctx.fillStyle = ln.color + '20'; ctx.fillRect(PAD.left, yoHi, cW, yoLo - yoHi); }
  });

  // Vertical date grid + labels
  var winDays = xEnd - xStart;
  var step = winDays<=7 ? 1 : winDays<=31 ? 5 : winDays<=84 ? 14 : 28;
  ctx.textAlign = 'center';
  for(var g=Math.ceil(xStart); g<=xEnd; g+=step){
    var gx = xOf(g);
    ctx.strokeStyle = '#232323'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top+cH); ctx.stroke();
    var dt = new Date(_blTimeline.firstDate.getTime() + g*86400000);
    ctx.fillStyle = '#555'; ctx.fillText((dt.getMonth()+1)+'/'+dt.getDate(), gx, PAD.top+cH+14);
  }

  // "Now" marker
  if(nowDay>=xStart && nowDay<=xEnd){
    var nx = xOf(nowDay);
    ctx.strokeStyle = '#e8a02099'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(nx, PAD.top); ctx.lineTo(nx, PAD.top+cH); ctx.stroke(); ctx.setLineDash([]);
  }

  // Lines — all on the single log axis. Everything is a model projection; to
  // make that obvious the segment from today forward is drawn dimmed (past =
  // solid, today→future = faded).
  var dg = 1/_BL_SPD;
  function _blStrokeSeg(ln, a, b, alpha){
    if(b <= a) return;
    ctx.beginPath(); var started = false;
    for(var g=a; g<=b+1e-9; g+=dg){
      var v = _blRawMgAt(ln, g);
      if(v===null){ started = false; continue; }
      var X = xOf(g), Y = yOf(v);
      if(!started){ ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = ln.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  var splitAt = Math.max(xStart, Math.min(xEnd, nowDay));
  visible.forEach(function(ln){
    // Past (solid) up to today, then future (dimmed). Overlap one step so the
    // two segments join without a visible gap at the boundary.
    _blStrokeSeg(ln, xStart, splitAt, 1);
    _blStrokeSeg(ln, Math.max(xStart, splitAt-dg), xEnd, 0.3);
  });
  if(!visible.length){
    ctx.fillStyle = '#555'; ctx.font = '11px DM Sans,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('All lines hidden — tap a chip below', PAD.left+cW/2, PAD.top+cH/2);
  }
}

function _blRenderChart(){ var c = document.getElementById('bl-chart'); if(c) _blDrawChart(c); }

function _blRenderZoomBar(){
  var bar = document.getElementById('bl-zoom-bar'); if(!bar) return;
  bar.innerHTML = ['today','week','month'].map(function(z){
    var a = _blZoom===z;
    return '<button onclick="_blSetZoom(\''+z+'\')" style="flex:1;background:'+(a?'rgba(102,136,204,0.25)':'none')+
      ';border:1px solid '+(a?'#6688cc66':'var(--border)')+';border-radius:6px;color:'+(a?'#6688cc':'var(--muted2)')+
      ';font-size:9px;font-weight:700;letter-spacing:0.8px;cursor:pointer;padding:5px 2px;font-family:inherit">'+z.toUpperCase()+'</button>';
  }).join('');
}

function _blRenderLegend(){
  var leg = document.getElementById('bl-legend'); if(!leg) return;
  _blLoadHidden();
  var nd = _blTimeline ? _blTimeline.nowDay : 0;
  leg.innerHTML = _blLines.map(function(ln){
    var off = !!_blHidden[ln.id];
    // Concentration lines (e.g. Free T) show their actual current blood level;
    // amount lines just show their dose unit.
    var meta = ln.unit ? _esc(ln.unit) : '';
    if(ln.conc){
      var cv = _blRawMgAt(ln, nd);
      if(cv!=null && cv>0) meta = _blFmtNum(cv) + (ln.unit ? ' '+_esc(ln.unit) : '');
    }
    var unitTxt = meta ? '<span style="font-size:9px;color:var(--muted2);margin-left:1px">'+meta+'</span>' : '';
    return '<button onclick="_blToggleLine(\''+_esc(ln.id)+'\')" style="display:flex;align-items:center;gap:6px;'+
      'background:var(--surface2);border:1px solid var(--border);border-radius:16px;padding:5px 11px;cursor:pointer;'+
      'font-family:inherit;opacity:'+(off?'0.4':'1')+'">'+
      '<span style="width:9px;height:9px;border-radius:50%;background:'+ln.color+';flex-shrink:0'+(off?';filter:grayscale(1)':'')+'"></span>'+
      '<span style="font-size:11px;font-weight:600;color:var(--text)'+(off?';text-decoration:line-through':'')+'">'+_esc(ln.name)+'</span>'+
      unitTxt +
      '</button>';
  }).join('');
}

function _blToggleLine(id){
  _blLoadHidden();
  if(_blHidden[id]) delete _blHidden[id]; else _blHidden[id] = true;
  setData('proto-blood-hidden', _blHidden);
  if(typeof pushPepSettingsToAgent==='function') pushPepSettingsToAgent({'proto-blood-hidden': _blHidden});
  _blRenderChart(); _blRenderLegend();
}

function _blSetZoom(z){
  _blZoom = z; _blPanOffset = 0;
  var c = document.getElementById('bl-chart');
  if(c){ _blDrawChart(c); _blAttachPan(c); }
  _blRenderZoomBar();
}

function _blAttachPan(canvas){
  if(!canvas) return;
  if(canvas._blTS){
    canvas.removeEventListener('touchstart', canvas._blTS);
    canvas.removeEventListener('touchmove', canvas._blTM);
    canvas.removeEventListener('touchend', canvas._blTE);
    canvas.removeEventListener('mousedown', canvas._blMD);
    canvas.removeEventListener('mousemove', canvas._blMM);
    canvas.removeEventListener('mouseup', canvas._blTE);
    canvas._blTS = null;
  }
  if(_blZoom==='whole'){ canvas.style.cursor=''; canvas.style.touchAction=''; return; }
  canvas.style.cursor = 'grab'; canvas.style.touchAction = 'pan-y';
  var dx0=null, dy0=null, off0=null;
  canvas._blTS = function(e){ var t=e.touches?e.touches[0]:e; dx0=t.clientX; dy0=t.clientY; off0=_blPanOffset; };
  canvas._blTM = function(e){
    if(dx0===null) return;
    var t=e.touches?e.touches[0]:e, dx=t.clientX-dx0, dy=t.clientY-(dy0||0);
    if(e.touches && Math.abs(dx)<=Math.abs(dy)) return;
    if(e.preventDefault) e.preventDefault();
    var w = canvas._blWin || {xStart:0,xEnd:1,cW:250};
    _blPanOffset = off0 - dx*((w.xEnd-w.xStart)/(w.cW||250));
    _blDrawChart(canvas);
  };
  canvas._blTE = function(){ dx0=null; };
  canvas._blMD = canvas._blTS;
  canvas._blMM = function(e){ if(e.buttons & 1) canvas._blTM(e); };
  canvas.addEventListener('touchstart', canvas._blTS, {passive:true});
  canvas.addEventListener('touchmove', canvas._blTM, {passive:false});
  canvas.addEventListener('touchend', canvas._blTE);
  canvas.addEventListener('mousedown', canvas._blMD);
  canvas.addEventListener('mousemove', canvas._blMM);
  canvas.addEventListener('mouseup', canvas._blTE);
}

function buildBloodLevels(){
  var el = document.getElementById('blood-body');
  if(!el) return;
  _blLines = _blBuildLines();
  if(!_blLines.length){
    el.innerHTML = '<div class="empty" style="padding:40px 20px"><div class="empty-icon">🩸</div>'+
      'No active compounds or supplements to plot.<br>Add a stack with a dose, or track a supplement.</div>';
    return;
  }
  var html = '<div style="padding:12px 16px 6px;font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px">'+
    'Estimated blood levels · log scale</div>';
  html += '<div style="padding:0 16px 16px">';
  html += '<div id="bl-zoom-bar" style="display:flex;gap:4px;margin-bottom:8px"></div>';
  html += '<canvas id="bl-chart" style="width:100%;display:block"></canvas>';
  html += '<div id="bl-legend" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px"></div>';
  html += '<div style="margin-top:10px;font-size:10px;color:var(--muted2);line-height:1.5">Lines with a clinical assay show a <b>real blood level</b>: <b>Free T</b> (pmol/L, via the T-Calc model) and <b>Vitamin D</b> (25-OH-D, nmol/L) — each with its shaded normal range. Compounds without a routine blood test (research peptides, GH→IGF-1) still show estimated amount-in-body (mg-eq.). The Y-axis is <b>logarithmic</b> (each gridline = 10×); it labels in a shared unit when the visible lines agree, else relative magnitude. Solid = to date, dimmed = projected from today. Tap a chip to hide/show; zoom then drag to pan.</div>';
  html += '</div>';
  el.innerHTML = html;
  _blRenderZoomBar();
  requestAnimationFrame(function(){
    var c = document.getElementById('bl-chart');
    if(c){ _blDrawChart(c); _blAttachPan(c); }
    _blRenderLegend();
  });
}
