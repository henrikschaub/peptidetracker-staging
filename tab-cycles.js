/* ── CYCLES — enhancement-cycle tracking (backend-synced, offline-first) ── */
var _cycle=null;
var CYCLE_BF_FIELDS=[
  {id:'hydration_liters',label:'💧 Hydration (liters)',kind:'float',min:0,step:0.5,ph:'3.5'},
  {id:'sleep_hours',label:'😴 Sleep (hours)',kind:'float',min:0,max:24,step:0.5,ph:'8'},
  {id:'sleep_quality',label:'😴 Sleep Quality (1-10)',kind:'int',min:1,max:10,ph:'8'},
  {id:'recovery_rating',label:'🦵 Recovery (1-10)',kind:'int',min:1,max:10,ph:'7',detail:'Soreness, joint feel'},
  {id:'mood_rating',label:'😊 Mood (1-10)',kind:'int',min:1,max:10,ph:'7'},
  {id:'libido_rating',label:'❤️ Libido (1-10)',kind:'int',min:1,max:10,ph:'8'},
  {id:'bloat_rating',label:'💨 Bloat (0-10)',kind:'int',min:0,max:10,ph:'2',detail:'0=none, 10=severe'},
  {id:'inflammation_rating',label:'🔥 Inflammation (0-10)',kind:'int',min:0,max:10,ph:'3',detail:'Puffiness, water retention'},
  {id:'appetite_rating',label:'🍽️ Appetite (0-10)',kind:'int',min:0,max:10,ph:'8',detail:'0=none, 10=ravenous'},
  {id:'appetite_difficulty',label:'🎯 Macro Difficulty',kind:'select',options:[['','— Select —'],['easy','Easy to hit macros'],['moderate','Moderate difficulty'],['difficult','Difficult to hit macros']]},
  {id:'general_notes',label:'📝 Notes',kind:'text',ph:'Any other observations?'}
];
var CYCLE_BF_RATED=['hydration_liters','sleep_hours','sleep_quality','recovery_rating','mood_rating','libido_rating','bloat_rating','inflammation_rating','appetite_rating','appetite_difficulty'];
function _cycEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cycleCacheLoad(){return getData('pep-cycle',null);}
function cycleCacheSave(c){_cycle=c;setData('pep-cycle',c);}
function openCyclesTab(){_cycle=cycleCacheLoad();renderCyclesTab();syncCyclesFromAgent();}
async function syncCyclesFromAgent(){try{var r=await fetch(AGENT_URL+'/cycles',{headers:authHeaders()});if(!r.ok){_logHttp('syncCycles',r.status,'/cycles');return;}var list=await r.json();if(!Array.isArray(list)||!list.length)return;list.sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});cycleCacheSave(list[0]);renderCyclesTab();}catch(e){_logErr('syncCycles',e);}}
function cycleWeeks(c){if(!c||!c.startDate)return 0;return Math.max(0,Math.floor((NOW-parseLocalDate(c.startDate))/604800000));}
function renderCyclesTab(){var c=_cycle;cycleRenderStatus(c);cycleRenderBloodwork(c);cycleRenderCompounds(c);cycleRenderE2(c);cycleRenderHgh(c);cycleUpdateBFBadge();}
function cycleRenderStatus(c){
  var section=document.getElementById('cycle-section');
  if(!c||!c.startDate){if(section)section.style.display='none';return;}
  if(section)section.style.display='';
  var badge=document.getElementById('cycle-status-badge');if(!badge)return;
  var ph=document.getElementById('cycle-phase'),st=document.getElementById('cycle-start'),wk=document.getElementById('cycle-weeks'),dur=document.getElementById('cycle-duration');
  badge.textContent=String(c.phase||'').toUpperCase();badge.className='card-badge badge-today';
  ph.textContent=String(c.phase||'').toUpperCase();st.textContent=fmtDate(parseLocalDate(c.startDate));wk.textContent=cycleWeeks(c)+' weeks';if(dur)dur.textContent=(c.cycleLengthWeeks||20)+' weeks';
}
function cycleRenderCompounds(c){var b=document.getElementById('cycle-compounds-body');if(!b)return;if(!c||!c.compounds||!c.compounds.length){b.innerHTML='<div class="empty">No active cycle</div>';return;}var h='';c.compounds.forEach(function(x){h+='<div class="info-row"><span class="info-label">'+_cycEsc(x.name)+'</span><span class="info-val" style="color:'+(x.active?'var(--accent)':'var(--muted2)')+'">'+x.dose+' '+_cycEsc(x.unit)+'</span></div>';});b.innerHTML=h;}
function _cycleBwDesc(t){return t==='baseline'?'Pre-cycle bloodwork — establish baseline':t==='response'?'Assess test response & aromatization':t==='midcycle'?'Full panel — adjust if needed':t==='eoc'?'Final check before offramp':'';}
// #638: a checkpoint's week label. The pre-cycle baseline (phase 'pre' or the
// legacy offset week 0) reads "Pre-cycle", never "Week 0". Real checkpoints keep
// their week number.
function _cycleBwWeekLabel(bw){return (bw&&(bw.phase==='pre'||bw.week===0))?'Pre-cycle':'Week '+bw.week;}
// #640: recommended lab-marker panel for a checkpoint — prefer the backend-attached
// list, fall back to the fetched phase→panel map by checkpoint type. Pretty labels.
var _cycleBwPanels=getData('proto-cycle-bw-panels',null); // {baseline:[...],response:[...],...}
var _BW_MARKER_LABEL={total_t:'Total T',free_t:'Free T',estradiol:'E2',shbg:'SHBG',lh:'LH',fsh:'FSH',hematocrit:'HCT',hemoglobin:'Hgb',ldl:'LDL',hdl:'HDL',alt:'ALT',ast:'AST',psa:'PSA',prolactin:'Prolactin',igf1:'IGF-1'};
function _cycleBwMarkers(bw){var m=(bw&&bw.recommended_markers&&bw.recommended_markers.length)?bw.recommended_markers:((_cycleBwPanels&&_cycleBwPanels[bw&&bw.type])||[]);return m||[];}
function _cycleBwMarkersHtml(bw){var m=_cycleBwMarkers(bw);if(!m.length)return '';var chips=m.map(function(k){return '<span style="font-size:9px;font-weight:600;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:1px 6px;color:var(--muted2);white-space:nowrap">'+(_BW_MARKER_LABEL[k]||k)+'</span>';}).join('');return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">'+chips+'</div>';}
function cycleRenderBloodwork(c){var b=document.getElementById('cycle-bloodwork-body');if(!b)return;if(!c||!c.bloodwork||!c.bloodwork.length){b.innerHTML='<div class="empty">No cycle started</div>';return;}var start=parseLocalDate(c.startDate),n=c.bloodwork.length,h='';c.bloodwork.forEach(function(bw,i){var d=new Date(start);d.setDate(d.getDate()+bw.week*7);var _uni=_cycleBwMatch(d);var _done=bw.done||!!_uni;var past=d<NOW,today=d.toDateString()===NOW.toDateString(),last=i===n-1;var dotCls=_done?'past':today?'today-dot':past?'past':'future';var nameCol=_done?'var(--muted2)':today?'var(--accent)':'var(--text)';h+='<div class="milestone"><div class="milestone-line"><div class="milestone-dot '+dotCls+'"></div>'+(!last?'<div class="milestone-connector"></div>':'')+'</div><div class="milestone-body"><div class="milestone-date">'+_cycleBwWeekLabel(bw)+' — '+fmtDate(d)+(today?' · TODAY':'')+(_done?' · DONE ✓':'')+'</div><div class="milestone-name" style="color:'+nameCol+'">'+_cycEsc(bw.label)+'</div><div class="milestone-desc">'+_cycleBwDesc(bw.type)+'</div>'+_cycleBwMarkersHtml(bw)+(_done?'':'<button onclick="_cycleLogCheckpoint('+bw.week+')" style="margin-top:8px;background:var(--surface2);color:var(--muted2);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Log result</button>')+'</div></div>';});b.innerHTML=h;}
// Phase 4: cycle bloodwork lives in the unified /bloodwork store. A checkpoint is
// "done" when a unified bloodwork entry sits within ±14 days of its target date,
// and logging opens the shared Labs add-sheet pre-filled with that date.
function _cycleBwMatch(d){
  if(typeof _tcBwEntries==='undefined'||!_tcBwEntries||!_tcBwEntries.length)return null;
  if(!d||typeof d.getTime!=='function'||isNaN(d.getTime()))return null;
  var best=null,bestDiff=Infinity;
  for(var i=0;i<_tcBwEntries.length;i++){
    var e=_tcBwEntries[i];if(!e||!e.date)continue;
    var ed=parseLocalDate(e.date);if(!ed||isNaN(ed))continue;
    var diff=Math.abs(ed.getTime()-d.getTime());
    if(diff<bestDiff){bestDiff=diff;best=e;}
  }
  return bestDiff<=14*86400000?best:null;
}
function _cycleLogCheckpoint(week){
  var c=_cycle,dstr='';
  try{
    if(c&&c.startDate){var s=parseLocalDate(c.startDate);var d=new Date(s);d.setDate(d.getDate()+week*7);var t=new Date();if(d>t)d=t;if(typeof dateKey==='function')dstr=dateKey(d);}
  }catch(_e){}
  // #640: pass this checkpoint's recommended markers so the Labs add-sheet reveals
  // the full panel (rather than only the common markers) for entry.
  var _markers=[];try{if(c&&c.bloodwork){var _bw=c.bloodwork.find(function(x){return x.week===week;});if(_bw)_markers=_cycleBwMarkers(_bw);}}catch(_e2){}
  if(typeof _labOpenAddSheet==='function'){_labOpenAddSheet(dstr,_markers);}
  else if(typeof switchTab==='function'){switchTab('labs',document.getElementById('tab-btn-labs'));}
}
function cycleRenderBiofeedback(c){var box=document.getElementById('today-bf-list');if(!box)return;if(!c||!c.id){box.innerHTML='<div class="empty">Start a cycle to log biofeedback</div>';cycleUpdateBFBadge();return;}var inStyle='padding:8px;border-radius:6px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:13px;width:100%;box-sizing:border-box';var h='<div id="cycle-bf-form" style="padding:16px;display:grid;gap:14px">';CYCLE_BF_FIELDS.forEach(function(f){h+='<div style="display:grid;gap:4px"><label style="font-size:12px;font-weight:600;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">'+f.label+'</label>';if(f.detail)h+='<div style="font-size:11px;color:var(--muted2)">'+f.detail+'</div>';if(f.kind==='select'){h+='<select id="cycle-bf-'+f.id+'" onchange="cycleUpdateBFBadge()" style="'+inStyle+'">';f.options.forEach(function(o){h+='<option value="'+o[0]+'">'+o[1]+'</option>';});h+='</select>';}else if(f.kind==='text'){h+='<textarea id="cycle-bf-'+f.id+'" placeholder="'+f.ph+'" style="'+inStyle+';resize:vertical;min-height:60px"></textarea>';}else{h+='<input id="cycle-bf-'+f.id+'" type="text" inputmode="decimal" placeholder="'+f.ph+'" oninput="cycleUpdateBFBadge()" style="'+inStyle+'">';}h+='</div>';});h+='<div style="display:flex;gap:8px;margin-top:4px"><button id="cycle-bf-save" onclick="cycleSubmitBiofeedback()" style="flex:1;background:var(--accent);color:#000;border:none;border-radius:6px;padding:10px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px">Save Today\'s Data</button><button onclick="cycleClearBiofeedback()" style="background:var(--surface2);color:var(--muted2);border:1px solid var(--border);border-radius:6px;padding:10px 16px;cursor:pointer;font-family:inherit;font-size:13px">Clear</button></div></div>';box.innerHTML=h;cycleLoadBiofeedbackForToday(c);cycleUpdateBFBadge();}
function cycleLoadBiofeedbackForToday(c){c=c||_cycle;if(!c||!c.history)return;var today=dateKey(NOW),e=null;for(var i=c.history.length-1;i>=0;i--){if(c.history[i].type==='biofeedback'&&c.history[i].date===today){e=c.history[i];break;}}if(!e)return;CYCLE_BF_FIELDS.forEach(function(f){var el=document.getElementById('cycle-bf-'+f.id);if(!el)return;var v=e[f.id];if(v!==null&&v!==undefined)el.value=v;});}
function cycleUpdateBFBadge(){var badge=document.getElementById('today-bf-badge');if(!badge)return;var filled=0;CYCLE_BF_RATED.forEach(function(id){var el=document.getElementById('cycle-bf-'+id);if(el&&String(el.value).trim()!=='')filled++;});badge.textContent=filled+' / '+CYCLE_BF_RATED.length;badge.className='card-badge '+(filled===CYCLE_BF_RATED.length?'badge-done':'badge-today');}
function cycleClearBiofeedback(){CYCLE_BF_FIELDS.forEach(function(f){var el=document.getElementById('cycle-bf-'+f.id);if(el)el.value='';});cycleUpdateBFBadge();}
async function cycleSubmitBiofeedback(){var c=_cycle;if(!c||!c.id){alert('No active cycle');return;}var today=dateKey(NOW);function fl(id){var el=document.getElementById('cycle-bf-'+id);if(!el||String(el.value).trim()==='')return null;return parseDec(el.value);}function it(id){var el=document.getElementById('cycle-bf-'+id);if(!el||String(el.value).trim()==='')return null;return parseInt(el.value,10);}function tx(id){var el=document.getElementById('cycle-bf-'+id);return el&&el.value.trim()?el.value.trim():null;}var entry={date:today,hydration_liters:fl('hydration_liters'),sleep_hours:fl('sleep_hours'),sleep_quality:it('sleep_quality'),recovery_rating:it('recovery_rating'),mood_rating:it('mood_rating'),libido_rating:it('libido_rating'),bloat_rating:it('bloat_rating'),inflammation_rating:it('inflammation_rating'),appetite_rating:it('appetite_rating'),appetite_difficulty:tx('appetite_difficulty'),general_notes:tx('general_notes')};c.history=(c.history||[]).filter(function(h){return !(h.date===today&&h.type==='biofeedback');});c.history.push(Object.assign({type:'biofeedback'},entry));cycleCacheSave(c);var btn=document.getElementById('cycle-bf-save');if(btn){btn.textContent='Saving…';btn.disabled=true;}try{var r=await fetch(AGENT_URL+'/cycles/'+c.id+'/biofeedback',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(entry)});if(!r.ok)throw new Error('HTTP '+r.status);if(btn){btn.textContent='Saved ✓';}}catch(e){if(btn)btn.textContent='Saved locally';}if(btn)setTimeout(function(){btn.textContent="Save Today's Data";btn.disabled=false;},1800);}
/* ── CYCLE WIZARD — 3-step creation flow ── */
var CYCLE_TEMPLATES=[
  {id:'first',phase:'foundational',weeks:20,badge:'CYCLE 1',badgeColor:'var(--accent)',
   name:'Test Only — Foundational',
   desc:'The non-negotiable starting point. Testosterone alone — assess your aromatization phenotype, lock in injection protocol and bloodwork cadence.',
   why:'You cannot build a safe stack without knowing how your body responds to test. E2 phenotype from bloodwork determines every subsequent compound ratio decision.',
   tip:'Start at 300 mg/week. Week 5 bloodwork determines if you titrate to 500-600 mg. Do NOT add a secondary until response is predictable.',
   compounds:[{name:'Testosterone Enanthate',dose:300,unit:'mg/week',active:true,startWeek:0}]},
  {id:'synergy_primo',phase:'synergy',weeks:20,badge:'CYCLE 2',badgeColor:'var(--accent3)',
   name:'Test + Primobolan — Synergy',
   desc:'Classic second cycle for normal and high aromatizers. Primobolan (DHT-derived) adds lean anabolism with zero estrogen conversion — improved partitioning without AI drugs.',
   why:'Primo is the cleanest secondary: pure protein accretion, minimal androgenic sides, tissue-selective. 1:1 test:primo ratio is the evidence-based starting point.',
   tip:'Adjust ratio from cycle 1 bloodwork. High aromatizer: shift toward 250 test / 750 primo. Normal aromatizer: 500 / 500.',
   compounds:[{name:'Testosterone Enanthate',dose:500,unit:'mg/week',active:true,startWeek:0},{name:'Primobolan (Metenolone Enanthate)',dose:500,unit:'mg/week',active:true,startWeek:0}]},
  {id:'synergy_mast',phase:'synergy',weeks:20,badge:'CYCLE 2 (Low Aromatizer)',badgeColor:'var(--accent3)',
   name:'Test + Masteron — Synergy',
   desc:'For confirmed low aromatizers. Masteron blocks E2 conversion acting as a pseudo-AI — dry, vascular, harder look without suppressing cardioprotective estrogen to zero.',
   why:'If cycle 1 showed low E2 on standard test dose, a real AI would crash it further. Masteron at 1:1 gives the drying effect via receptor competition, not enzyme suppression.',
   tip:'2:1 Test:Mast if still controlling E2. 1:1 (500/500) for most low aromatizers. Masteron requires body fat under ~12% to show cosmetic benefit.',
   compounds:[{name:'Testosterone Enanthate',dose:500,unit:'mg/week',active:true,startWeek:0},{name:'Masteron Enanthate',dose:500,unit:'mg/week',active:true,startWeek:0}]},
  {id:'progression',phase:'progression',weeks:24,badge:'CYCLE 3+',badgeColor:'var(--accent2)',
   name:'Test + Primo + NPP — Progression',
   desc:'Three-compound progression. NPP (short-ester Nandrolone) at minimum effective dose adds collagen synthesis, joint health and enhanced recovery — the silent driver.',
   why:'NPP at 200-300 mg/week is not about size — it is about recovery quality. Short ester (3-5 day clearance) means you pull it fast if sides appear. Only add after assessing test and primo individually.',
   tip:'Watch libido closely when adding NPP. Tanks early = reduce NPP first. Deca-dick is real at higher doses — stay at MED. HGH optional at 3-4 IU/day from week 1.',
   compounds:[{name:'Testosterone Enanthate',dose:600,unit:'mg/week',active:true,startWeek:0},{name:'Primobolan (Metenolone Enanthate)',dose:500,unit:'mg/week',active:true,startWeek:0},{name:'NPP (Nandrolone Phenylpropionate)',dose:250,unit:'mg/week',active:true,startWeek:0}]},
  {id:'tren',phase:'progression',weeks:16,badge:'CYCLE 3 (ADVANCED)',badgeColor:'var(--accent2)',
   name:'Test + Tren — Progression',
   desc:'Advanced cycle. Trenbolone at minimum effective dose for rapid body recomposition. Not a first or second cycle compound — requires prior 19-nor experience and an established bloodwork baseline.',
   why:'Tren delivers ~5× androgenic potency with zero aromatisation: simultaneous fat loss and lean mass. Cardiovascular cost is significant — only justified after proving tolerability on test-only and a secondary compound.',
   tip:'Lower Test when adding Tren (300-400 mg/wk) — high Test amplifies androgenic sides. Acetate ester preferred for first run: faster pullout if sides hit. MED: 175-200 mg/wk. Mandatory bloodwork: baseline + Week 5 (full lipids, HCT, LFTs).',
   compounds:[{name:'Testosterone Enanthate',dose:400,unit:'mg/week',active:true,startWeek:0},{name:'Trenbolone Acetate',dose:175,unit:'mg/week',active:true,startWeek:0}]},
  {id:'custom',phase:'foundational',weeks:20,badge:'CUSTOM',badgeColor:'var(--muted2)',
   name:'Custom Cycle',
   desc:'Full control. Build your own compound stack from scratch with any phase, compounds and doses.',
   why:'',tip:'',
   compounds:[{name:'Testosterone Enanthate',dose:500,unit:'mg/week',active:true,startWeek:0}]}
];
// Female protocols — a different sport: results WITHOUT irreversible virilization.
// Mildest compounds, a fraction of the dose, short cycles, one compound at a time.
// A female user must NEVER be shown the male test/tren templates, so these carry inline
// safety + a monitoring "kit" (no AI/hCG — those are male-cycle tools) that renders even
// offline; the backend (?sex=female) enriches/overrides them when reachable.
var _F_ANC_VIRIL={name:'Virilization stop-protocol',kind:'monitor',have_on_hand:true,
  trigger:'STOP at the first sign — voice roughness or deepening, clitoral enlargement or sensitivity, new coarse facial or body hair, sudden acne, or a menstrual change. Voice and clitoral changes can be PERMANENT — never push through them.'};
var _F_ANC_LIVER={name:'Liver support (TUDCA) + LFT/lipid checks',kind:'hepatic',have_on_hand:true,
  trigger:'For 17-aa orals (oxandrolone): keep TUDCA on hand and check ALT/AST at baseline and mid-cycle. Oral AAS also drop HDL — recheck a lipid panel.'};
var CYCLE_TEMPLATES_FEMALE=[
  {id:'fem_first',sex:'female',phase:'foundational',weeks:6,badge:'CYCLE 1',badgeColor:'var(--accent)',
   name:'Anavar Only — Foundational',
   desc:'The evidence-based female starting point. Oxandrolone alone — the lowest-virilization anabolic — at a low dose over a short cycle so you learn your own response first.',
   why:'Female protocols are built around avoiding irreversible virilization, not maximising dose. One mild oral compound, low and short, lets you read your tolerance safely.',
   tip:'Start 5 mg/day, hold the cycle to 6 weeks. Do NOT exceed 10 mg/day or 8 weeks — virilization risk climbs steeply past both. Keep time OFF longer than time ON.',
   compounds:[{name:'Oxandrolone (Anavar)',dose:5,unit:'mg/day',active:true,startWeek:0}],
   ancillaries:[_F_ANC_VIRIL,_F_ANC_LIVER],
   safety:{viril_risk:'low',gyno_risk:'low',liver_risk:'moderate',
     rationale:'Oxandrolone has the most favourable anabolic-to-androgenic profile for women, but it is 17-aa (liver load and HDL drop) so the cycle stays short with LFT/lipid checks. No AI or hCG — women need their estrogen; those are male-cycle tools.'}},
  {id:'fem_primo',sex:'female',phase:'foundational',weeks:8,badge:'CYCLE 1 (Injectable)',badgeColor:'var(--accent)',
   name:'Primobolan Only — Lean',
   desc:'Injectable alternative for women who prefer to avoid orals. Metenolone is non-17-aa (no liver load) with a very low androgenic rating — the other pillar of low-virilization female use.',
   why:'Primobolan gives clean, lean anabolism with no liver strain and a mild androgenic profile, making it a solid single-compound female cycle.',
   tip:'50 mg/week for 8 weeks. The slow ester tails off after you stop — so stop at the FIRST virilization sign, do not wait. Do not stack on a first cycle.',
   compounds:[{name:'Primobolan (Metenolone Enanthate)',dose:50,unit:'mg/week',active:true,startWeek:0}],
   ancillaries:[_F_ANC_VIRIL],
   safety:{viril_risk:'low',gyno_risk:'low',liver_risk:'low',
     rationale:'Metenolone does not aromatize and is non-17-aa (minimal liver load); its low androgenic rating keeps virilization risk low at 50 mg/week. Slow ester means sides tail off gradually — stop early.'}},
  {id:'fem_synergy',sex:'female',phase:'synergy',weeks:8,badge:'CYCLE 2',badgeColor:'var(--accent3)',
   name:'Anavar + Primobolan — Synergy',
   desc:'Second cycle, only after tolerating each compound alone. The two mildest anabolics at low doses for better partitioning — without escalating the dose of either.',
   why:'Stacking the two lowest-virilization compounds beats raising the dose of one. Never introduce two new variables at once — run each solo first so you know where any side came from.',
   tip:'Oxandrolone 10 mg/day + Primobolan 50 mg/week, 8 weeks max. If ANY virilization appears, drop the Anavar first (it clears faster than the Primo ester).',
   compounds:[{name:'Oxandrolone (Anavar)',dose:10,unit:'mg/day',active:true,startWeek:0},{name:'Primobolan (Metenolone Enanthate)',dose:50,unit:'mg/week',active:true,startWeek:0}],
   ancillaries:[_F_ANC_VIRIL,_F_ANC_LIVER],
   safety:{viril_risk:'moderate',gyno_risk:'low',liver_risk:'moderate',
     rationale:'Two mild compounds at low doses, but the cumulative androgen load raises virilization risk vs either alone — hence the stricter stop-protocol. The oral keeps liver and lipids in the monitoring picture.'}},
  {id:'fem_custom',sex:'female',phase:'foundational',weeks:8,badge:'CUSTOM',badgeColor:'var(--muted2)',
   name:'Custom Cycle',
   desc:'Full control. Build your own low-virilization stack — start from the mildest compounds and lowest doses.',
   why:'',tip:'',
   compounds:[{name:'Oxandrolone (Anavar)',dose:5,unit:'mg/day',active:true,startWeek:0}],
   ancillaries:[_F_ANC_VIRIL,_F_ANC_LIVER],
   safety:{viril_risk:'moderate',gyno_risk:'low',liver_risk:'moderate',
     rationale:'Custom stacks carry whatever risk you build in — keep to the female whitelist (Anavar, Primobolan), avoid testosterone, tren, 19-nors and DHT derivatives, and keep the stop-protocol ready.'}}
];
// Contraindication framing shown above the female template list. Backend note (?sex=female)
// overrides this fallback when reachable.
var _femaleCycleNote=getData('proto-female-cycle-note',null);
var _FEMALE_CYCLE_NOTE_FALLBACK={title:'Female protocols are a different sport',
  body:'For women the goal is results WITHOUT irreversible virilization, so the whole approach inverts the male playbook: the mildest compounds, a fraction of the dose, short cycles (6–8 weeks) with longer time off, one compound at a time, and immediate discontinuation at the first virilizing sign — voice and clitoral changes can be permanent.',
  avoid:['Testosterone (any performance dose)','Trenbolone','Nandrolone / Deca / NPP (19-nors)','Dianabol','Anadrol','Higher-dose DHT derivatives (e.g. Masteron)'],
  avoid_reason:'These are highly androgenic and/or progestogenic — in women they cause fast, often permanent virilization (voice deepening, clitoral enlargement, facial hair). AIs and hCG are male-cycle tools and are not part of a female protocol.'};
function _userSexCyc(){var s=(typeof localStorage!=='undefined'&&localStorage.getItem('user_sex'))||'male';return (String(s).toLowerCase()==='female')?'female':'male';}
// The wizard's display list depends on the user's sex; lookups by id search both sets.
function _activeCycleTemplates(){return _userSexCyc()==='female'?CYCLE_TEMPLATES_FEMALE:CYCLE_TEMPLATES;}
function _cycleTemplateById(id){return CYCLE_TEMPLATES.find(function(x){return x.id===id;})||CYCLE_TEMPLATES_FEMALE.find(function(x){return x.id===id;})||null;}
var ENHANCEMENT_COMPOUNDS=[];
// #639: enrich the (legacy, hardcoded) cycle templates with backend-served
// ancillaries + safety metadata. In-memory only, re-fetched each session; falls
// back silently to the plain templates if the backend is unreachable.
async function syncCycleTemplatesFromAgent(){try{var _sx=_userSexCyc();var r=await fetch(AGENT_URL+'/cycles/templates?sex='+_sx,{headers:authHeaders()});if(!r.ok){_logHttp('syncCycleTpls',r.status,'/cycles/templates');return;}var d=await r.json();var tpls=(d&&d.templates)||[];if(d&&d.note){_femaleCycleNote=d.note;setData('proto-female-cycle-note',_femaleCycleNote);}if(tpls.length){tpls.forEach(function(bt){var ft=_cycleTemplateById(bt.id);if(ft){if(bt.ancillaries)ft.ancillaries=bt.ancillaries;if(bt.safety)ft.safety=bt.safety;if(bt.tier)ft.tier=bt.tier;}});}var wiz=document.getElementById('cycle-wizard');if(wiz&&wiz.style.display!=='none'&&typeof cycleWizRender==='function')cycleWizRender();}catch(e){_logErr('syncCycleTpls',e);}}
// #640: recommended lab-marker panels per checkpoint phase (marker keys only — not
// proprietary compound data, safe to cache for offline).
async function syncCycleBloodworkRecsFromAgent(){try{var r=await fetch(AGENT_URL+'/cycles/bloodwork-recommendations?sex='+_userSexCyc(),{headers:authHeaders()});if(!r.ok){_logHttp('syncCycleBwRecs',r.status,'/cycles/bloodwork-recommendations');return;}var d=await r.json();if(d&&d.panels){_cycleBwPanels=d.panels;setData('proto-cycle-bw-panels',_cycleBwPanels);if(typeof renderCyclesTab==='function')renderCyclesTab();}}catch(e){_logErr('syncCycleBwRecs',e);}}
async function syncEnhancedCompoundsFromAgent(){
  var ctrl=new AbortController();var tid=setTimeout(function(){ctrl.abort();},10000);
  try{var r=await fetch(AGENT_URL+'/compounds/enhanced',{headers:authHeaders(),signal:ctrl.signal});clearTimeout(tid);if(!r.ok){_logHttp('syncEnhanced',r.status,'/compounds/enhanced');return{ok:false,status:r.status};}var d=await r.json();ENHANCEMENT_COMPOUNDS=Array.isArray(d)?d:(d.compounds||[]);return{ok:true};}catch(e){clearTimeout(tid);_logErr('syncEnhanced',e);return{ok:false,status:null,msg:String(e&&e.message||e)};}
}
var _cwiz={step:1,tpl:null,phase:'foundational',weeks:20,startDate:'',compounds:[]};
function cycleWizardOpen(){
  if(_cycle&&_cycle.id&&!confirm('Start a new cycle? Your current cycle stays saved on the backend.'))return;
  var today=dateKey(NOW);
  _cwiz={step:1,tpl:null,phase:'foundational',weeks:20,startDate:today,compounds:[]};
  document.getElementById('cycle-wizard').style.display='block';
  document.body.style.overflow='hidden';
  cycleWizRender();
}
function cycleWizardClose(){
  document.getElementById('cycle-wizard').style.display='none';
  document.body.style.overflow='';
}
function cycleWizRender(){
  var inner=document.getElementById('cycle-wiz-inner');
  if(!inner)return;
  var h='<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">';
  h+='<div style="font-family:var(--font-display);font-size:18px;letter-spacing:2px;color:var(--accent)">NEW CYCLE</div>';
  h+='<div style="display:flex;align-items:center;gap:6px">';
  for(var i=1;i<=3;i++){var active=_cwiz.step===i,done=_cwiz.step>i;h+='<div style="width:26px;height:26px;border-radius:50%;background:'+(active?'var(--accent)':done?'var(--accent3)':'var(--surface2)')+';color:'+(active||done?'#000':'var(--muted2)')+';font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(done?'✓':i)+'</div>';}
  h+='</div>';
  h+='<button onclick="cycleWizardClose()" style="background:none;border:none;color:var(--muted2);font-size:20px;cursor:pointer;padding:0;line-height:1">&#x2715;</button>';
  h+='</div>';
  if(_cwiz.step===1)h+=_cwizStep1();
  else if(_cwiz.step===2)h+=_cwizStep2();
  else h+=_cwizStep3();
  inner.innerHTML=h;
}
// #639: gyno/liver-safety badges from the backend safety metadata (lead with safety).
function _cycleSafetyRiskColor(r){return r==='low'?'var(--accent3)':r==='high'?'var(--danger)':'#ffb03c';}
function _cycleSafetyBadges(t){var s=t&&t.safety;if(!s)return '';var b=function(lbl,risk){if(!risk)return '';var c=_cycleSafetyRiskColor(risk);return '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:'+c+'22;color:'+c+';border:1px solid '+c+'55;white-space:nowrap">'+lbl+': '+String(risk).toUpperCase()+'</span>';};var badges=b('Viril',s.viril_risk)+b('Gyno',s.gyno_risk)+b('Liver',s.liver_risk);if(!badges)return '';return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px">'+badges+'</div>'+(s.rationale?'<div style="font-size:11px;color:var(--muted2);line-height:1.5;margin-bottom:8px">'+_cycEsc(s.rationale)+'</div>':'');}
// Female contraindication banner shown above the female template list.
function _femaleCycleNoteHtml(){
  if(_userSexCyc()!=='female')return '';
  var n=_femaleCycleNote||_FEMALE_CYCLE_NOTE_FALLBACK;
  if(!n)return '';
  var avoid='';
  if(n.avoid&&n.avoid.length){
    var chips=n.avoid.map(function(a){return '<span style="font-size:10px;font-weight:600;background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.4);color:var(--danger);border-radius:8px;padding:2px 7px;white-space:nowrap">'+_cycEsc(a)+'</span>';}).join('');
    avoid='<div style="font-size:11px;font-weight:700;color:var(--danger);margin-top:8px;text-transform:uppercase;letter-spacing:0.5px">Do not use</div><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">'+chips+'</div>';
    if(n.avoid_reason)avoid+='<div style="font-size:10.5px;color:var(--muted2);line-height:1.45;margin-top:6px">'+_cycEsc(n.avoid_reason)+'</div>';
  }
  return '<div style="background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--danger);border-radius:10px;padding:12px 14px;margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:var(--danger);margin-bottom:4px">'+_cycEsc(n.title||'Female protocol')+'</div><div style="font-size:11.5px;color:var(--muted2);line-height:1.55">'+_cycEsc(n.body||'')+'</div>'+avoid+'</div>';
}
// #639: structured "have on hand" ancillaries with a use trigger.
function _cycleAncillariesHtml(t){var a=t&&t.ancillaries;if(!a||!a.length)return '';var rows=a.map(function(x){var onHand=x.have_on_hand?'<span style="font-size:9px;font-weight:700;color:var(--accent);background:rgba(232,255,60,0.12);border:1px solid rgba(232,255,60,0.35);border-radius:6px;padding:1px 6px;margin-left:6px;white-space:nowrap">HAVE ON HAND</span>':'';return '<div style="padding:6px 0;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:600;color:var(--text)">'+_cycEsc(x.name)+onHand+'</div>'+(x.trigger?'<div style="font-size:10.5px;color:var(--muted2);line-height:1.45;margin-top:2px">'+_cycEsc(x.trigger)+'</div>':'')+'</div>';}).join('');return '<div style="margin-top:8px;background:var(--surface2);border-radius:8px;padding:8px 10px"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted2)">Support meds — have on hand</div>'+rows+'</div>';}
function _cwizStep1(){
  var h='<div style="padding:20px">';
  h+='<div style="font-size:11px;font-weight:600;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Step 1 of 3 — Choose Template</div>';
  h+=_femaleCycleNoteHtml();
  h+=(typeof _bfReadinessCard==='function'?_bfReadinessCard('enhanced'):'');
  _activeCycleTemplates().forEach(function(t){
    var sel=_cwiz.tpl===t.id;
    h+='<div onclick="cycleWizSelectTpl(\''+t.id+'\')" style="cursor:pointer;background:var(--surface2);border:2px solid '+(sel?t.badgeColor:'var(--border)')+';border-radius:12px;padding:14px;margin-bottom:10px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">';
    h+='<div style="font-size:14px;font-weight:700;color:var(--text);flex:1;padding-right:8px">'+t.name+'</div>';
    h+='<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;background:'+t.badgeColor+'22;color:'+t.badgeColor+';border:1px solid '+t.badgeColor+'44;white-space:nowrap;flex-shrink:0">'+t.badge+'</span>';
    h+='</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;margin-bottom:8px">'+t.desc+'</div>';
    h+=_cycleSafetyBadges(t);
    if(t.why)h+='<div style="font-size:11px;color:var(--accent3);padding:7px 10px;background:rgba(60,255,160,0.07);border-radius:6px;border-left:2px solid var(--accent3);line-height:1.5">'+t.why+'</div>';
    h+=_cycleAncillariesHtml(t);
    h+='</div>';
  });
  h+='<div style="display:flex;gap:8px;margin-top:16px">';
  h+='<button onclick="cycleWizardClose()" style="flex:1;background:var(--surface2);color:var(--muted2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>';
  h+='<button onclick="cycleWizNext()" style="flex:2;background:var(--accent);color:#000;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Next: Configure &#x2192;</button>';
  h+='</div>';
  h+='</div>';
  return h;
}
function cycleWizSelectTpl(id){
  var t=_cycleTemplateById(id);
  if(t){_cwiz.tpl=id;_cwiz.phase=t.phase;_cwiz.weeks=t.weeks;_cwiz.compounds=t.compounds.map(function(c){return Object.assign({},c);});}
  cycleWizRender();
}
function cycleWizNext(){
  if(_cwiz.step===1&&!_cwiz.tpl){alert('Pick a template first');return;}
  _cwiz.step++;cycleWizRender();
}
function cycleWizBack(){_cwiz.step=Math.max(1,_cwiz.step-1);cycleWizRender();}
function _cwizInStyle(){return 'padding:9px 12px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:14px;width:100%;box-sizing:border-box;font-family:inherit';}
function _cwizStep2(){
  var t=_cycleTemplateById(_cwiz.tpl)||_activeCycleTemplates()[0];
  var ins=_cwizInStyle();
  var h='<div style="padding:20px">';
  h+='<div style="font-size:11px;font-weight:600;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Step 2 of 3 &#x2014; Configure</div>';
  h+='<div style="background:var(--surface2);border-radius:8px;padding:10px 14px;margin-bottom:20px;border-left:3px solid '+t.badgeColor+'">';
  h+='<div style="font-size:12px;font-weight:700;color:var(--text)">'+t.name+'</div>';
  if(t.tip)h+='<div style="font-size:11px;color:var(--muted2);margin-top:4px;line-height:1.5">'+t.tip+'</div>';
  h+='</div>';
  h+='<div style="display:grid;gap:6px;margin-bottom:16px">';
  h+='<label style="font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">Start Date</label>';
  h+='<input id="cwiz-start" type="date" value="'+_cwiz.startDate+'" oninput="_cwiz.startDate=this.value" style="'+ins+'">';
  h+='</div>';
  h+='<div style="display:grid;gap:6px;margin-bottom:20px">';
  h+='<label style="font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">Cycle Length (weeks)</label>';
  h+='<input id="cwiz-weeks" type="number" min="8" max="52" value="'+_cwiz.weeks+'" oninput="_cwiz.weeks=parseInt(this.value)||20" style="'+ins+'">';
  h+='<div style="font-size:11px;color:var(--muted2)">Bloodwork checkpoints auto-generated based on length</div>';
  h+='</div>';
  h+='<div style="font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Compounds</div>';
  _cwiz.compounds.forEach(function(c,i){
    var ec=ENHANCEMENT_COMPOUNDS.find(function(x){return x.name===c.name;});
    var isCustom=!ec&&(!!c.name||!!c._custom);
    var _ss='flex:3;min-width:140px;padding:9px 4px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:13px;font-family:inherit;';
    h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">';
    h+='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:'+(ec||isCustom?'8':'0')+'px">';
    h+='<select onchange="_cwizSetCmpd('+i+',this.value)" style="'+_ss+'">';
    h+='<option value="">— Choose compound —</option>';
    var _cgrps=['Base','DHT-Derived','19-Nor','GH Axis','Oral'];
    _cgrps.forEach(function(g){var _ge=ENHANCEMENT_COMPOUNDS.filter(function(e){return e.group===g;});if(!_ge.length)return;h+='<optgroup label="'+g+'">'; _ge.forEach(function(e){h+='<option value="'+e.id+'"'+(ec&&ec.id===e.id?' selected':'')+'>'+e.name+'</option>';});h+='</optgroup>';});
    h+='<option value="__custom__"'+(isCustom?' selected':'')+'>Custom…</option>';
    h+='</select>';
    h+='<input id="cwiz-cd-'+i+'" type="text" inputmode="decimal" value="'+c.dose+'" oninput="_cwiz.compounds['+i+'].dose=parseDec(this.value)||0" style="flex:1;min-width:70px;'+ins+'">';
    h+='<select id="cwiz-cu-'+i+'" onchange="_cwiz.compounds['+i+'].unit=this.value" style="flex:1;min-width:90px;padding:9px 4px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:13px;font-family:inherit">';
    var units=['mg/week','mg/day','mg/EOD'];
    units.forEach(function(u){h+='<option value="'+u+'"'+(c.unit===u?' selected':'')+'>'+u+'</option>';});
    h+='</select>';
    if(ec)h+='<button onclick="_cwizToggleInfo('+i+')" style="background:transparent;border:1px solid var(--border);color:var(--muted2);border-radius:6px;padding:7px 9px;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0" title="Usage &amp; risks">ⓘ</button>';
    if(_cwiz.compounds.length>1)h+='<button onclick="_cwizDelCmpd('+i+')" style="background:transparent;border:1px solid rgba(255,60,60,0.4);color:var(--danger);border-radius:6px;padding:8px;cursor:pointer;font-size:13px;line-height:1;flex-shrink:0">&#x2715;</button>';
    h+='</div>';
    if(isCustom)h+='<input id="cwiz-cn-'+i+'" type="text" value="'+_cycEsc(c.name)+'" placeholder="Enter compound name…" oninput="_cwiz.compounds['+i+'].name=this.value" style="'+ins+'">';
    if(ec){
      h+='<div id="cwiz-info-'+i+'" style="display:none;margin-top:4px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border)">';
      h+='<div style="font-size:11px;font-weight:700;color:var(--accent3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:5px">How it works</div>';
      h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;margin-bottom:10px">'+ec.interaction+'</div>';
      h+='<div style="font-size:11px;font-weight:700;color:var(--accent2);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:5px">Sides &amp; monitoring</div>';
      h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6">'+ec.sides+'</div>';
      h+='</div>';
    }
    h+='</div>';
  });
  h+='<button onclick="_cwizAddCmpd()" style="width:100%;background:var(--surface2);color:var(--muted2);border:1px dashed var(--border);border-radius:8px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:20px">+ Add Compound</button>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button onclick="cycleWizBack()" style="flex:1;background:var(--surface2);color:var(--muted2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">&#x2190; Back</button>';
  h+='<button onclick="_cwizReview()" style="flex:2;background:var(--accent);color:#000;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Review Cycle &#x2192;</button>';
  h+='</div>';
  h+='</div>';
  return h;
}
function _cwizAddCmpd(){_cwiz.compounds.push({name:'',dose:250,unit:'mg/week',active:true,startWeek:0,_custom:false});cycleWizRender();}
function _cwizDelCmpd(i){_cwiz.compounds.splice(i,1);cycleWizRender();}
function _cwizSetCmpd(i,val){
  if(val==='__custom__'){_cwiz.compounds[i]._custom=true;_cwiz.compounds[i].name='';}
  else if(!val){_cwiz.compounds[i]._custom=false;_cwiz.compounds[i].name='';}
  else{var ec=ENHANCEMENT_COMPOUNDS.find(function(x){return x.id===val;});if(ec){_cwiz.compounds[i].name=ec.name;_cwiz.compounds[i].dose=ec.defaultDose;_cwiz.compounds[i].unit=ec.unit;}_cwiz.compounds[i]._custom=false;}
  cycleWizRender();
}
function _cwizToggleInfo(i){var el=document.getElementById('cwiz-info-'+i);if(el)el.style.display=el.style.display==='none'?'':'none';}
function _cwizCapture(){
  var s=document.getElementById('cwiz-start');if(s&&s.value)_cwiz.startDate=s.value;
  var w=document.getElementById('cwiz-weeks');if(w&&w.value)_cwiz.weeks=parseInt(w.value)||20;
  _cwiz.compounds.forEach(function(c,i){
    var ne=document.getElementById('cwiz-cn-'+i);if(ne)c.name=ne.value;
    var de=document.getElementById('cwiz-cd-'+i);if(de)c.dose=parseDec(de.value)||0;
    var ue=document.getElementById('cwiz-cu-'+i);if(ue)c.unit=ue.value;
  });
}
function _cwizReview(){_cwizCapture();_cwiz.step=3;cycleWizRender();}
function _cwizGenBw(wks){
  var bw=[{week:0,label:'Baseline',type:'baseline',date:null,done:false,results:{}},{week:5,label:'Response Check',type:'response',date:null,done:false,results:{}}];
  if(wks>=12)bw.push({week:12,label:'Midcycle Panel',type:'midcycle',date:null,done:false,results:{}});
  if(wks>=16){var eow=Math.max(wks-2,14);bw.push({week:eow,label:'End of Cycle',type:'eoc',date:null,done:false,results:{}});}
  return bw;
}
function _cwizStep3(){
  var t=_cycleTemplateById(_cwiz.tpl)||{name:'Custom',badgeColor:'var(--muted2)',badge:'CUSTOM'};
  var bw=_cwizGenBw(_cwiz.weeks);
  var startD=(_cwiz.startDate?parseLocalDate(_cwiz.startDate):null)||NOW;
  var h='<div style="padding:20px">';
  h+='<div style="font-size:11px;font-weight:600;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Step 3 of 3 &#x2014; Review &amp; Confirm</div>';
  h+='<div style="background:var(--surface2);border-radius:12px;overflow:hidden;margin-bottom:12px">';
  h+='<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">';
  h+='<div style="font-family:var(--font-display);font-size:17px;letter-spacing:1.5px">'+t.name+'</div>';
  h+='<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;background:'+t.badgeColor+'22;color:'+t.badgeColor+';border:1px solid '+t.badgeColor+'44">'+t.badge+'</span>';
  h+='</div>';
  var endD=new Date(startD.getTime());endD.setDate(endD.getDate()+_cwiz.weeks*7);
  h+='<div style="padding:14px 16px;display:grid;gap:8px">';
  h+='<div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:var(--muted2)">Start</span><span style="font-size:13px;font-weight:600">'+fmtDate(startD)+'</span></div>';
  h+='<div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:var(--muted2)">End</span><span style="font-size:13px;font-weight:600">'+fmtDate(endD)+'</span></div>';
  h+='<div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:var(--muted2)">Duration</span><span style="font-size:13px;font-weight:600">'+_cwiz.weeks+' weeks</span></div>';
  h+='<div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:var(--muted2)">Phase</span><span style="font-size:13px;font-weight:600;text-transform:capitalize">'+(_cwiz.phase||'foundational')+'</span></div>';
  h+='</div></div>';
  h+='<div style="background:var(--surface2);border-radius:12px;overflow:hidden;margin-bottom:12px">';
  h+='<div style="padding:10px 16px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase">Compounds</div>';
  h+='<div style="padding:12px 16px;display:grid;gap:8px">';
  _cwiz.compounds.filter(function(c){return c.name;}).forEach(function(c){h+='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:600;color:var(--text)">'+_cycEsc(c.name)+'</span><span style="font-size:13px;color:var(--accent);font-weight:700">'+c.dose+' '+_cycEsc(c.unit)+'</span></div>';});
  h+='</div></div>';
  h+='<div style="background:var(--surface2);border-radius:12px;overflow:hidden;margin-bottom:20px">';
  h+='<div style="padding:10px 16px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase">Bloodwork Schedule (auto)</div>';
  h+='<div style="padding:12px 16px;display:grid;gap:8px">';
  bw.forEach(function(b){
    var d=new Date(startD.getTime());d.setDate(d.getDate()+b.week*7);
    h+='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--muted2)">Wk '+b.week+' &#x2014; '+b.label+'</span><span style="font-size:12px;color:var(--text)">'+fmtDate(d)+'</span></div>';
  });
  h+='</div></div>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button onclick="cycleWizBack()" style="flex:1;background:var(--surface2);color:var(--muted2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">&#x2190; Back</button>';
  h+='<button id="cwiz-confirm" onclick="cycleWizConfirm()" style="flex:2;background:var(--accent);color:#000;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Start Cycle</button>';
  h+='</div>';
  h+='</div>';
  return h;
}
async function cycleWizConfirm(){
  var btn=document.getElementById('cwiz-confirm');
  if(btn){btn.textContent='Creating…';btn.disabled=true;}
  var payload={startDate:_cwiz.startDate,phase:_cwiz.phase||'foundational',cycleLengthWeeks:_cwiz.weeks,compounds:_cwiz.compounds.filter(function(c){return c.name;})};
  try{
    await _ensureValidToken();
    var r=await fetch(AGENT_URL+'/cycles',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(payload)});
    if(r.status===401){await _ensureValidToken();r=await fetch(AGENT_URL+'/cycles',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(payload)});}
    if(!r.ok)throw new Error('HTTP '+r.status);
    var res=await r.json();
    var c=res.cycle||res;
    cycleCacheSave(c);
    cycleWizardClose();
    renderCyclesTab();
  }catch(e){
    if(btn){btn.textContent='Start Cycle';btn.disabled=false;}
    alert('Could not create cycle: '+(e.message==='HTTP 401'?'Session expired — please re-sign in and try again':e.message));
  }
}
/* ── TODAY CHECK-IN ── */
var _todayCheckInOpen=false;
function toggleTodayCheckIn(){
  _todayCheckInOpen=!_todayCheckInOpen;
  var body=document.getElementById('today-checkin-body');
  var chev=document.getElementById('today-checkin-chev');
  if(body)body.style.display=_todayCheckInOpen?'block':'none';
  if(chev)chev.innerHTML=_todayCheckInOpen?'&#x25BE;':'&#x25B8;';
  if(_todayCheckInOpen){_cycle=cycleCacheLoad();cycleRenderBiofeedback(_cycle);}
}
/* ── CYCLES — Steroids sub-tab ── */
function cycleRenderE2(c){
  var body=document.getElementById('cyc-e2-body');if(!body)return;
  if(!c||!c.compounds||!c.compounds.length){body.innerHTML='<div class="empty">No active cycle</div>';return;}
  var hasMast=c.compounds.some(function(x){return x.name&&x.name.toLowerCase().indexOf('masteron')>=0;});
  var hasPrimo=c.compounds.some(function(x){return x.name&&(x.name.toLowerCase().indexOf('primobolan')>=0||x.name.toLowerCase().indexOf('primo')>=0);});
  var h='';
  if(hasMast){
    h+='<div class="info-row"><span class="info-label">Strategy</span><span class="info-val" style="color:var(--accent3)">Test + Masteron</span></div><div class="divider"></div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6">Masteron blocks aromatase competitively — pseudo-AI effect without drug toxicity. Suited for low aromatizers. Maintains cardioprotective E2 while reducing water retention.</div>';
  }else if(hasPrimo){
    h+='<div class="info-row"><span class="info-label">Strategy</span><span class="info-val" style="color:var(--accent3)">Test + Primo</span></div><div class="divider"></div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6">Primobolan does not aromatize (DHT-derived). Lower E2 load at equivalent androgen dose. Monitor for low-E2 symptoms — joint pain, flat affect, low libido.</div>';
  }else{
    h+='<div class="info-row"><span class="info-label">Strategy</span><span class="info-val" style="color:var(--accent2)">Test-only — monitor E2</span></div><div class="divider"></div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6">Testosterone aromatises to estradiol. Target 20-40 pg/mL on bloodwork. Bloat + mood swings = high E2. Flat libido + joint ache = low E2. Use compound ratios, not AIs.</div>';
  }
  h+='<div class="divider"></div><div style="font-size:11px;color:var(--accent);padding:7px 10px;background:rgba(232,255,60,0.07);border-radius:6px;border-left:2px solid var(--accent)">Next bloods: E2, Total Test, Hematocrit, Lipids (HDL+LDL). See bloodwork schedule in Overview.</div>';
  body.innerHTML=h;
}
/* ── CYCLES — HGH sub-tab ── */
function cycleRenderHgh(c){
  var body=document.getElementById('cyc-hgh-body');if(!body)return;
  var hghCmpd=c&&c.compounds?c.compounds.find(function(x){return x.name&&(x.name.toLowerCase().indexOf('hgh')>=0||x.name.toLowerCase().indexOf('growth hormone')>=0||x.name.toLowerCase().indexOf('somatropin')>=0);}):null;
  var hasSecretagogue=WEEKLY.some(function(d){return d.name&&(d.name.toLowerCase().indexOf('cjc')>=0||d.name.toLowerCase().indexOf('ipa')>=0||d.name.toLowerCase().indexOf('ghrp')>=0||d.name.toLowerCase().indexOf('ipamorelin')>=0);});
  var h='<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--accent3)"></div><div class="card-title">GH COMPOUNDS</div></div></div><div class="card-body">';
  if(hghCmpd){
    h+='<div class="info-row"><span class="info-label">'+_cycEsc(hghCmpd.name)+'</span><span class="info-val" style="color:var(--accent)">'+hghCmpd.dose+' '+_cycEsc(hghCmpd.unit)+'</span></div>';
    if(c&&c.startDate){h+='<div class="divider"></div><div class="info-row"><span class="info-label">Weeks on HGH</span><span class="info-val" style="color:var(--accent)">'+cycleWeeks(c)+'</span></div>';}
    h+='<div class="divider"></div>';
  }else{h+='<div class="info-row"><span class="info-label">Exogenous HGH</span><span class="info-val" style="color:var(--muted2)">Not in active cycle</span></div><div class="divider"></div>';}
  h+='<div class="info-row"><span class="info-label">Secretagogues (stack)</span><span class="info-val" style="color:'+(hasSecretagogue?'var(--accent3)':'var(--muted2)')+'">'+( hasSecretagogue?'Active':'None detected')+'</span></div>';
  h+='</div></div>';
  h+='<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--accent2)"></div><div class="card-title">EFFECT TIMELINE</div></div></div><div style="padding:0">';
  var tl=[{wk:'1-4',label:'Sleep quality',desc:'Deeper sleep, GH pulse enhancement',col:'var(--muted2)'},{wk:'4-6',label:'Recovery',desc:'Faster muscle repair, less DOMS',col:'var(--accent4)'},{wk:'6-8',label:'Body recomp',desc:'Lipolysis increases, insulin sensitivity improves',col:'var(--accent3)'},{wk:'12+',label:'Hyperplasia',desc:'New muscle cell nuclei — the long-game payoff',col:'var(--accent)'}];
  tl.forEach(function(t){
    h+='<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
    h+='<div><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">'+t.label+'</div><div style="font-size:12px;color:var(--muted2)">'+t.desc+'</div></div>';
    h+='<span style="font-size:10px;font-weight:700;color:'+t.col+';background:'+t.col+'22;padding:3px 8px;border-radius:10px;border:1px solid '+t.col+'44;white-space:nowrap;flex-shrink:0">Wk '+t.wk+'</span>';
    h+='</div>';
  });
  h+='</div></div>';
  h+='<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--muted)"></div><div class="card-title">PROTOCOL NOTES</div></div></div><div class="card-body" style="gap:8px">';
  var notes=[['Dose','3-4 IU/day recreational. 1-2 IU/day for longevity.'],['Schedule','5-on / 2-off (Mon-Fri) or daily — goal dependent.'],['Timing','AM fasted for fat loss (GH + low insulin = lipolysis). Pre-sleep mirrors natural pulse.'],['Stack note','Stop CJC/IPA when on exogenous HGH — redundant, adds cost.'],['Minimum run','6 months for full body composition effect. Not a short cycle compound.']];
  notes.forEach(function(n){h+='<div class="info-row"><span class="info-label">'+n[0]+'</span><span class="info-val" style="color:var(--muted2);font-size:12px;text-align:right;flex:2;padding-left:12px">'+n[1]+'</span></div>';});
  h+='</div></div>';
  body.innerHTML=h;
}
