// Blood Levels tab — PK plasma concentration curves for TRT & Enhanced compounds

function _parseHalfLifeDays(str) {
  if (!str) return null;
  var s = str.toLowerCase();
  // "X–Y days" or "X-Y days" → average of range
  var m = s.match(/~?(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)\s*days?/);
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  // "~X.X days" or "X days"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*days?/);
  if (m) return parseFloat(m[1]);
  // "~X hours" or "X h"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s|$)/);
  if (m) return parseFloat(m[1]) / 24;
  // "~X min"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*min/);
  if (m) return parseFloat(m[1]) / 60 / 24;
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

// Like _pkCurveFine but each injection carries its own dose — used for the
// T-Calc-planned testosterone, whose per-injection dose is titrated over time.
// doseSteps: [{step, dose}] (step = day × _BL_SPD).
function _pkCurveFineVar(doseSteps, halfLifeDays, cycleDays) {
  var spd = _BL_SPD, N = cycleDays * spd;
  var curve = new Float64Array(N + 1);
  var kStep = Math.LN2 / (halfLifeDays * spd);
  for (var t = 0; t <= N; t++) {
    var c = 0;
    for (var j = 0; j < doseSteps.length; j++) {
      if (doseSteps[j].step <= t) c += doseSteps[j].dose * Math.exp(-kStep * (t - doseSteps[j].step));
    }
    curve[t] = c;
  }
  return curve;
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
      var dose = parseFloat(e.dose) || 0;
      var d = (typeof parseLocalDate === 'function') ? parseLocalDate(e.date) : new Date(e.date);
      if (d && dose > 0) c.doses.push({ date:d, dose:dose });
    });
  });
  return Object.keys(byComp).map(function(k){ return byComp[k]; }).filter(function(c){ return c.doses.length; });
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
      var dose = (parseFloat(p.dose_am)||0) + (parseFloat(p.dose_pm)||0);
      if(!dose) return;
      var injDays = _pkInjectionDays(p, cycleLen, startDow);
      if(!injDays.length) return;
      lines.push({ id:'pep_'+si+'_'+p.id, name:p.name||p.id, color:(cat&&cat.dot)||p.dot||'#3cffa0',
        kind:'peptide', unit:(p.unit_am||p.unit_pm||'mcg'), startDate:startDate, cycleLen:cycleLen, sub:stackLabel,
        lastInjDay:injDays[injDays.length-1], curve:_pkCurveFine(injDays, dose, hl, cycleLen) });
    });

    // TRT (testosterone esters)
    if(st.trt && st.trt.enabled){
      (st.trt.compounds||[]).forEach(function(c){
        var guide = TRT_GUIDE[c.id]; if(!guide) return;
        var hl = _parseHalfLifeDays(guide.halfLife); if(!hl) return;
        var doseNum = parseFloat(c.dose)||0; if(!doseNum) return;
        var injDays = _pkInjectionDays(c, cycleLen, startDow); if(!injDays.length) return;
        var trtEntry = TRT_CAT.find(function(x){ return x.id===c.id; });
        lines.push({ id:'trt_'+si+'_'+c.id, name:c.name, color:(trtEntry&&trtEntry.dot)||'#e8a020',
          kind:'trt', unit:(c.unit||'mg'), startDate:startDate, cycleLen:cycleLen, sub:stackLabel, isTestosterone:true,
          lastInjDay:injDays[injDays.length-1], curve:_pkCurveFine(injDays, doseNum, hl, cycleLen) });
      });
    }

    // Enhanced
    if(st.enhanced && st.enhanced.enabled){
      (st.enhanced.compounds||[]).forEach(function(c){
        var ec = ENHANCEMENT_COMPOUNDS.find(function(x){ return x.id===c.id; });
        if(!ec || !ec.cadence) return;
        var hl = ec.id==='hgh' ? 1 : _parseHalfLifeDays(ec.cadence.halfLife); if(!hl) return;
        var doseNum = parseFloat(c.dose)||0; if(!doseNum) return;
        var unit = c.unit || ec.unit || 'mg/week';
        var injDays = _pkInjectionDays(c, cycleLen, startDow); if(!injDays.length) return;
        var injsPerWeek = injDays.filter(function(d){ return d<7; }).length || 1;
        var dpi = unit==='mg/week' ? doseNum/injsPerWeek : doseNum;
        lines.push({ id:'enh_'+si+'_'+c.id, name:c.name, color:c.dot||ec.dot||'#a855f7',
          kind:'enhanced', unit:((unit||'mg/week').split('/')[0]||'mg'), startDate:startDate, cycleLen:cycleLen, sub:stackLabel,
          isTestosterone:(c.name||'').toLowerCase().indexOf('testosterone')!==-1,
          lastInjDay:injDays[injDays.length-1], curve:_pkCurveFine(injDays, dpi, hl, cycleLen) });
      });
    }
  });

  // Global timeline: span from the earliest start to the latest compound end,
  // extended to ~6 weeks past today so ongoing supplements have somewhere to live.
  var supps = (typeof _supplements!=='undefined' && _supplements) ? _supplements.filter(function(s){ return s && s.supp_id; }) : [];
  var tcalcTest = _blTcalcTestosterone();
  var firstDate = starts.length ? new Date(Math.min.apply(null, starts.map(function(d){ return d.getTime(); }))) : new Date(NOW);
  supps.forEach(function(s){ if(s.start_date){ var d=parseLocalDate(s.start_date); if(d<firstDate) firstDate=d; } });
  tcalcTest.forEach(function(c){ c.doses.forEach(function(d){ if(d.date<firstDate) firstDate=d.date; }); });
  var tcalcMax = 0;
  tcalcTest.forEach(function(c){ c.doses.forEach(function(d){ if(d.date.getTime()>tcalcMax) tcalcMax=d.date.getTime(); }); });
  var maxCompoundEnd = compoundEnds.length ? Math.max.apply(null, compoundEnds) : 0;
  var lastMs = Math.max(maxCompoundEnd, tcalcMax, supps.length ? (NOW.getTime()+42*86400000) : 0, firstDate.getTime()+7*86400000);
  var totalDays = Math.max(1, Math.round((lastMs - firstDate.getTime())/86400000));

  // Supplement lines across the whole timeline from their start date.
  supps.forEach(function(s, i){
    var hl = _blSuppHalfLife(s.supp_id);
    // Upgrade legacy IU-only doses to metric first (e.g. D3 "5000 IU" → 125 µg)
    // so the mg-equivalent magnitude is correct rather than treating IU as mg.
    var _fmt = (typeof _suppFmtDose==='function') ? _suppFmtDose(s.supp_id, s.dose) : s.dose;
    var _sp  = (typeof _suppParseDose==='function') ? _suppParseDose(_fmt) : null;
    var dose = _sp ? _sp.amount : (parseFloat(s.dose) || 1);
    var sUnit = _sp ? _sp.unit : 'mg';
    var sStart = s.start_date ? parseLocalDate(s.start_date) : firstDate;
    var offset = Math.round((sStart.getTime() - firstDate.getTime())/86400000);
    var span = totalDays - offset; if(span < 1) return;
    var stepDays = s.freq==='weekly' ? 7 : (s.freq==='eod' ? 2 : 1);
    var injDays = []; for(var d=0; d<=span; d+=stepDays) injDays.push(d);
    if(!injDays.length) return;
    lines.push({ id:'supp_'+(s.id||s.supp_id), name:s.name||s.supp_id, color:_BL_SUPP_COLORS[i%_BL_SUPP_COLORS.length],
      kind:'supplement', unit:sUnit, startDate:sStart, cycleLen:span, sub:'supplement',
      lastInjDay:injDays[injDays.length-1], curve:_pkCurveFine(injDays, dose, hl, span) });
  });

  // T-Calc-planned testosterone — drawn in red, spanning the whole timeline with
  // each planned injection's own (titrated) dose. Half-life comes from the ester.
  tcalcTest.forEach(function(c){
    var hl = null;
    if (typeof _tcCompInfo === 'function') { var ci = _tcCompInfo(c.id); if (ci && ci.halfLifeDays) hl = ci.halfLifeDays; }
    if (!hl && typeof TRT_GUIDE !== 'undefined' && TRT_GUIDE[c.id]) hl = _parseHalfLifeDays(TRT_GUIDE[c.id].halfLife);
    if (!hl) hl = 7; // testosterone ester fallback
    var doseSteps = c.doses.map(function(d){
      return { step: Math.round((d.date.getTime()-firstDate.getTime())/86400000) * _BL_SPD, dose:d.dose };
    }).filter(function(s){ return s.step >= 0 && s.dose > 0; });
    if (!doseSteps.length) return;
    var lastDay = 0; doseSteps.forEach(function(s){ var dd=s.step/_BL_SPD; if(dd>lastDay) lastDay=dd; });
    lines.push({ id:'tcalc_'+c.id, name:c.name, color:'#ff3b30', kind:'trt',
      unit:c.unit||'mg', startDate:firstDate, cycleLen:totalDays, sub:'T-Calc', isTestosterone:true,
      lastInjDay:lastDay, curve:_pkCurveFineVar(doseSteps, hl, totalDays) });
  });

  // Record each line's peak, its mg-equivalent scale, and its offset in global days.
  lines.forEach(function(ln){
    var peak = 0; for(var t=0;t<ln.curve.length;t++) if(ln.curve[t] > peak) peak = ln.curve[t];
    ln.peak = peak || 1;
    ln.mgScale = _blToMg(1, ln.unit);   // mg per dose-unit
    ln.peakMg  = ln.peak * ln.mgScale;  // peak amount in mg-equivalent
    ln.spd = _BL_SPD;
    // Step of the last scheduled injection — the curve is not drawn past this,
    // so a compound's cycle-end washout tail doesn't drop the line toward zero.
    ln.lastStep = (ln.lastInjDay != null ? ln.lastInjDay : ln.cycleLen) * _BL_SPD;
    ln.offset = Math.round((ln.startDate.getTime() - firstDate.getTime())/86400000);
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
// Assign visible lines to one or two Y-axes by mg-equivalent magnitude. Lines
// whose peaks span < 8× share one axis; a wider spread splits at the largest
// magnitude gap so big compounds (left) and small ones (right) each read well.
var _blAxes = null;
function _blComputeAxes(visible){
  var peaks=[]; visible.forEach(function(ln){ if(ln.peakMg>0) peaks.push(ln.peakMg); });
  var assign={};
  if(!peaks.length){ visible.forEach(function(ln){ assign[ln.id]='L'; }); return {mode:'single',leftMax:1,rightMax:0,assign:assign}; }
  var maxP=Math.max.apply(null,peaks), minP=Math.min.apply(null,peaks);
  if(peaks.length<2 || maxP/minP < 8){
    visible.forEach(function(ln){ assign[ln.id]='L'; });
    return {mode:'single',leftMax:(maxP*1.1)||1,rightMax:0,assign:assign};
  }
  var sorted=peaks.slice().sort(function(a,b){ return a-b; });
  var gi=0,gmax=0;
  for(var i=0;i<sorted.length-1;i++){ var gg=Math.log(sorted[i+1])-Math.log(sorted[i]); if(gg>gmax){ gmax=gg; gi=i; } }
  var threshold=Math.sqrt(sorted[gi]*sorted[gi+1]);
  var leftMax=0,rightMax=0;
  visible.forEach(function(ln){
    var p=ln.peakMg||0;
    if(p>=threshold){ assign[ln.id]='L'; if(p>leftMax)leftMax=p; }
    else { assign[ln.id]='R'; if(p>rightMax)rightMax=p; }
  });
  return {mode:'dual',leftMax:(leftMax*1.1)||1,rightMax:(rightMax*1.1)||1,assign:assign};
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
  var axes = _blComputeAxes(visible); _blAxes = axes;

  var PAD = {top:10, right:(axes.mode==='dual'?46:14), bottom:22, left:44};
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
  function yOfL(v){ return PAD.top + cH - (v/axes.leftMax)*cH; }
  function yOfR(v){ return PAD.top + cH - (v/(axes.rightMax||1))*cH; }

  // Horizontal grid + left-axis (and optional right-axis) value labels
  ctx.font = '9px DM Sans,sans-serif';
  [0,0.5,1].forEach(function(f){
    var y = PAD.top + cH - f*cH;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+cW, y); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.textAlign = 'right'; ctx.fillText(_blFmtMg(axes.leftMax*f), PAD.left-4, y+3);
    if(axes.mode==='dual'){
      ctx.fillStyle = '#8a8a8a'; ctx.textAlign = 'left'; ctx.fillText(_blFmtMg(axes.rightMax*f), PAD.left+cW+4, y+3);
    }
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

  // Lines — right-axis lines are dashed so the axis they use is obvious.
  // Everything is a model projection; to make that obvious the segment from
  // today forward is drawn dimmed (past = solid, today→future = faded).
  var dg = 1/_BL_SPD;
  function _blStrokeSeg(ln, yFn, dashed, a, b, alpha){
    if(b <= a) return;
    ctx.beginPath(); var started = false;
    for(var g=a; g<=b+1e-9; g+=dg){
      var v = _blRawMgAt(ln, g);
      if(v===null){ started = false; continue; }
      var X = xOf(g), Y = yFn(v);
      if(!started){ ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = ln.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    if(dashed) ctx.setLineDash([4,2]);
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  var splitAt = Math.max(xStart, Math.min(xEnd, nowDay));
  visible.forEach(function(ln){
    var side = axes.assign[ln.id]||'L';
    var yFn = side==='R' ? yOfR : yOfL;
    var dashed = axes.mode==='dual' && side==='R';
    // Past (solid) up to today, then future (dimmed). Overlap one step so the
    // two segments join without a visible gap at the boundary.
    _blStrokeSeg(ln, yFn, dashed, xStart, splitAt, 1);
    _blStrokeSeg(ln, yFn, dashed, Math.max(xStart, splitAt-dg), xEnd, 0.3);
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
  var dual = _blAxes && _blAxes.mode==='dual';
  leg.innerHTML = _blLines.map(function(ln){
    var off = !!_blHidden[ln.id];
    var side = (dual && _blAxes.assign[ln.id]) ? _blAxes.assign[ln.id] : '';
    var tag = side ? '<span style="font-size:8px;font-weight:800;color:var(--muted2);border:1px solid var(--border);border-radius:4px;padding:0 3px;margin-left:1px">'+side+'</span>' : '';
    var unitTxt = ln.unit ? '<span style="font-size:9px;color:var(--muted2);margin-left:1px">'+_esc(ln.unit)+'</span>' : '';
    return '<button onclick="_blToggleLine(\''+_esc(ln.id)+'\')" style="display:flex;align-items:center;gap:6px;'+
      'background:var(--surface2);border:1px solid var(--border);border-radius:16px;padding:5px 11px;cursor:pointer;'+
      'font-family:inherit;opacity:'+(off?'0.4':'1')+'">'+
      '<span style="width:9px;height:9px;border-radius:50%;background:'+ln.color+';flex-shrink:0'+(off?';filter:grayscale(1)':'')+'"></span>'+
      '<span style="font-size:11px;font-weight:600;color:var(--text)'+(off?';text-decoration:line-through':'')+'">'+_esc(ln.name)+'</span>'+
      unitTxt + tag +
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
    'Estimated plasma levels · real amounts (mg-eq.), auto-scaled</div>';
  html += '<div style="padding:0 16px 16px">';
  html += '<div id="bl-zoom-bar" style="display:flex;gap:4px;margin-bottom:8px"></div>';
  html += '<canvas id="bl-chart" style="width:100%;display:block"></canvas>';
  html += '<div id="bl-legend" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px"></div>';
  html += '<div style="margin-top:10px;font-size:10px;color:var(--muted2);line-height:1.5">Amounts are mg-equivalent (relative amount in body, not a lab concentration). When magnitudes differ a lot, lines split across two Y-scales — right-axis lines are dashed and tagged <b>R</b>. Solid = to date, dimmed = projected from today forward. Tap a chip to hide/show; zoom then drag to pan. Supplement curves use approximate half-lives.</div>';
  html += '</div>';
  el.innerHTML = html;
  _blRenderZoomBar();
  requestAnimationFrame(function(){
    var c = document.getElementById('bl-chart');
    if(c){ _blDrawChart(c); _blAttachPan(c); }
    _blRenderLegend();
  });
}
