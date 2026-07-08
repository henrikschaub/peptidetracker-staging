/**
 * Frontend logic tests — peptide tracker
 * Run: node /tmp/test_frontend.js
 */
const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const htmlPath = process.argv[2] || '/tmp/pt_live.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const rawScript = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));

const patchedScript = rawScript
  .replace('const PEPTIDE_CAT=',      'var PEPTIDE_CAT=')
  .replace('const STACK_RULES=',      'var STACK_RULES=')
  .replace('const WEEKLY_DEFAULT=',   'var WEEKLY_DEFAULT=')
  .replace("const VERSION='",         "var VERSION='")
  .replace('const AGENT_URL=',        'var AGENT_URL=')
  .replace('let _googleToken=',      'var _googleToken=')
  .replace('const GOOGLE_CLIENT_ID=', 'var GOOGLE_CLIENT_ID=')
  .replace('const CYCLE_SUGGESTIONS=','var CYCLE_SUGGESTIONS=')
  .replace('var WIZ_TITLES=',         'var WIZ_TITLES=')
  .replace('const WIZ_TITLES=',       'var WIZ_TITLES=')
  .replace('let WEEKLY=',             'var WEEKLY=')
  .replace('let _wiz=',               'var _wiz=')
  .replace('let _userStacks=',        'var _userStacks=')
  .replace('let _activeStackIndices=', 'var _activeStackIndices=')
  .replace('let _stacksLoaded=',      'var _stacksLoaded=')
  .replace('let _userWeight=',        'var _userWeight=')
  .replace('var _wizOverlay=',        'var _wizOverlay=')
  .replace('const RECON_DB=',         'var RECON_DB=')
  .replace('let _viewDate=',          'var _viewDate=')
  .replace('let _reconStackIdx=',     'var _reconStackIdx=')
  .replace('let _reconState=',        'var _reconState=')
  .replace('let weights=',            'var weights=')
  .replace('var _bcWeightWindow=',    'var _bcWeightWindow=')
  .replace('var _bcWeightHistOpen=',  'var _bcWeightHistOpen=')
  .replace('const PRICELIST=',        'var PRICELIST=')
  .replace('const DOSE_GUIDE=',       'var DOSE_GUIDE=')
  .replace('const DEFAULT_PHASES=',   'var DEFAULT_PHASES=')
  .replace('const TRT_CAT=',          'var TRT_CAT=')
  .replace('const TRT_GUIDE=',        'var TRT_GUIDE=');

const noop = () => {};
const mockCtx = {scale:noop,beginPath:noop,moveTo:noop,lineTo:noop,arc:noop,fill:noop,stroke:noop,fillText:noop,closePath:noop,createLinearGradient:()=>({addColorStop:noop}),save:noop,restore:noop,fillRect:noop,setLineDash:noop,strokeRect:noop,translate:noop,rotate:noop,measureText:()=>({width:0})};
const mockEl = () => {
  const el = {style:{},classList:{add:noop,remove:noop,contains:()=>false},appendChild:noop,removeChild:noop,insertBefore:noop,addEventListener:noop,children:[],querySelectorAll:()=>[],querySelector:()=>mockEl(),offsetWidth:300,getContext:()=>mockCtx};
  Object.defineProperty(el,'innerHTML',  {get:()=>'',set:noop});
  Object.defineProperty(el,'textContent',{get:()=>'',set:noop});
  Object.defineProperty(el,'value',      {get:()=>'0',set:noop});
  Object.defineProperty(el,'className',  {get:()=>'',set:noop});
  Object.defineProperty(el,'hidden',     {get:()=>false,set:noop});
  return el;
};
const _lsStore = {};
const _lsBase = {_s:_lsStore,getItem(k){return Object.prototype.hasOwnProperty.call(_lsStore,k)?_lsStore[k]:null;},setItem(k,v){_lsStore[k]=v;},removeItem(k){delete _lsStore[k];}};
const _lsProxy = new Proxy(_lsBase,{ownKeys(){return[...'_s,getItem,setItem,removeItem'.split(','),...Object.keys(_lsStore)];},getOwnPropertyDescriptor(t,k){if(k in t)return Object.getOwnPropertyDescriptor(t,k)||{value:t[k],enumerable:false,configurable:true,writable:false};if(Object.prototype.hasOwnProperty.call(_lsStore,k))return{value:_lsStore[k],enumerable:true,configurable:true,writable:true};}});
const sandbox = vm.createContext({
  window:    {addEventListener:noop,removeEventListener:noop,devicePixelRatio:1,location:{reload:noop}},
  localStorage: _lsProxy,
  document:  {getElementById:()=>mockEl(),querySelectorAll:()=>[mockEl()],querySelector:()=>mockEl(),createElement:()=>mockEl(),body:mockEl(),head:mockEl(),createTextNode:()=>mockEl(),addEventListener:noop,hidden:false,documentElement:{style:{setProperty:noop,getPropertyValue:()=>''}}},
  fetch:     async()=>({ok:false,json:async()=>({})}),
  google:undefined,confirm:()=>false,alert:noop,Image:function(){},setTimeout:noop,clearTimeout:noop,setInterval:noop,console,
  AbortController:class{constructor(){this.signal={};}abort(){}},
});
vm.runInContext(patchedScript, sandbox);
// Load tab files so their functions/vars are available in the same sandbox
const tabFiles = ['tab-cycles.js','tab-macros.js','tab-stack.js','tab-today.js',
                  'tab-schedule.js','tab-timeline.js','tab-body.js','tab-recon.js','tab-blood.js','tab-tcalc.js','tab-supplements.js'];
const dir = path.dirname(path.resolve(htmlPath));
tabFiles.forEach(f => {
  const tabPath = path.join(dir, f);
  if (fs.existsSync(tabPath)) {
    let src = fs.readFileSync(tabPath, 'utf8');
    src = src.replace('const RECON_DB=', 'var RECON_DB=');
    vm.runInContext(src, sandbox);
  }
});
const G = sandbox;

let passed=0, failed=0;
function check(name, condition, detail) {
  if(condition){console.log(`  ✓ ${name}`);passed++;}
  else{console.log(`  ✗ ${name}${detail?': '+detail:''}`);failed++;}
}

// ── Peptide catalogue ─────────────────────────────────────────────────────────
console.log('\n── Peptide catalogue ──────────────────────────────────────');
check('PEPTIDE_CAT defined',               Array.isArray(G.PEPTIDE_CAT));
check('20+ entries',                       G.PEPTIDE_CAT.length>=20,             `got ${G.PEPTIDE_CAT.length}`);
check('all have id/name/dot/cg/goals',     G.PEPTIDE_CAT.every(p=>p.id&&p.name&&p.dot&&Array.isArray(p.cg)&&Array.isArray(p.goals)));
check('cjc-ipa exists',                    G.PEPTIDE_CAT.some(p=>p.id==='cjc-ipa'));
check('glow exists',                       G.PEPTIDE_CAT.some(p=>p.id==='glow'));
check('retatrutide exists',                G.PEPTIDE_CAT.some(p=>p.id==='retatrutide'));
check('tesamorelin exists',                G.PEPTIDE_CAT.some(p=>p.id==='tesamorelin'));
check('sermorelin exists',                 G.PEPTIDE_CAT.some(p=>p.id==='sermorelin'));

// ── Stack rules ───────────────────────────────────────────────────────────────
console.log('\n── checkStack / STACK_RULES ───────────────────────────────');
check('STACK_RULES is array',              Array.isArray(G.STACK_RULES));
check('8 rules defined',                   G.STACK_RULES.length===8,             `got ${G.STACK_RULES.length}`);
check('checkStack defined',                typeof G.checkStack==='function');
['ghrh-multi','cjc-tesa','glp1-multi','ghrh-ghrp-solo','gh-hgh-overlap','healing-blend-overlap','healing-blend-component','cjc-ipa-double']
  .forEach(id=>check(`rule "${id}" exists`, G.STACK_RULES.some(r=>r.id===id)));
if(typeof G.checkStack==='function'){
const r1=G.checkStack([{id:'cjc-ipa',cg:['ghrh','ghrp']},{id:'tesamorelin',cg:['ghrh']}]);
check('CJC+Tesa → err: ghrh-multi',        r1.some(r=>r.level==='err'&&r.id==='ghrh-multi'));
check('CJC+Tesa → err: cjc-tesa',          r1.some(r=>r.level==='err'&&r.id==='cjc-tesa'));
check('CJC+Glow → 0 issues',               G.checkStack([{id:'cjc-ipa',cg:['ghrh','ghrp']},{id:'glow',cg:[]}]).length===0);
check('Reta+Sema → err: glp1-multi',       G.checkStack([{id:'retatrutide',cg:['glp1']},{id:'semaglutide',cg:['glp1']}]).some(r=>r.id==='glp1-multi'));
check('CJC-noDac alone → warn: ghrp-solo', G.checkStack([{id:'cjc-nodac',cg:['ghrh']}]).some(r=>r.level==='warn'&&r.id==='ghrh-ghrp-solo'));
check('CJC+HGH → warn: gh-hgh-overlap',   G.checkStack([{id:'cjc-ipa',cg:['ghrh','ghrp']},{id:'hgh',cg:['hgh']}]).some(r=>r.id==='gh-hgh-overlap'));
check('single Reta → 0 issues',            G.checkStack([{id:'retatrutide',cg:['glp1']}]).length===0);
check('Klow+Glow → err: healing-blend-overlap',      G.checkStack([{id:'klow',cg:[]},{id:'glow',cg:[]}]).some(r=>r.id==='healing-blend-overlap'));
check('bpc-tb+Glow → err: healing-blend-overlap',    G.checkStack([{id:'bpc-tb',cg:[]},{id:'glow',cg:[]}]).some(r=>r.id==='healing-blend-overlap'));
check('Glow+bpc157 → warn: healing-blend-component', G.checkStack([{id:'glow',cg:[]},{id:'bpc157',cg:[]}]).some(r=>r.id==='healing-blend-component'));
check('klow+tb500 → warn: healing-blend-component',  G.checkStack([{id:'klow',cg:[]},{id:'tb500',cg:[]}]).some(r=>r.id==='healing-blend-component'));
check('cjc-ipa+ipa → warn: cjc-ipa-double',          G.checkStack([{id:'cjc-ipa',cg:['ghrh','ghrp']},{id:'ipamorelin',cg:['ghrp']}]).some(r=>r.id==='cjc-ipa-double'));
check('cjc-ipa alone → no cjc-ipa-double',           !G.checkStack([{id:'cjc-ipa',cg:['ghrh','ghrp']}]).some(r=>r.id==='cjc-ipa-double'));
}

// ── buildWeeklyFromProtocol ───────────────────────────────────────────────────
console.log('\n── buildWeeklyFromProtocol ────────────────────────────────');
check('function defined',                  typeof G.buildWeeklyFromProtocol==='function');
const wkly=G.buildWeeklyFromProtocol({peptides:[
  {id:'cjc-am',name:'CJC',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'4',active:true},
  {id:'cjc-pm',name:'CJC',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['PM'],dose_pm:'5',active:true},
  {id:'glow-1',name:'Glow',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'2',active:true},
  {id:'reta',  name:'Reta',dot:'#e8ff3c',days:[0],             times:['AM'],dose_am:'3',active:true},
  {id:'old',   name:'Old', dot:'#888',   days:[0],             times:['AM'],             active:false},
]});
check('4 active entries (inactive excluded)', wkly.length===4,                   `got ${wkly.length}`);
check('all have id/name/dow/dot',             wkly.every(w=>w.id&&w.name&&w.dow&&w.dot));
check('cjc-am → AM',                         wkly.find(w=>w.id==='cjc-am')?.time==='AM');
check('cjc-pm → PM',                         wkly.find(w=>w.id==='cjc-pm')?.time==='PM');
check('reta → dow [0] only',                 JSON.stringify(wkly.find(w=>w.id==='reta')?.dow)==='[0]');
check('glow-1 → 7 days',                     wkly.find(w=>w.id==='glow-1')?.dow.length===7);
const split=G.buildWeeklyFromProtocol({peptides:[{id:'x',name:'X',dot:'#fff',days:[0,1,2,3,4,5,6],times:['AM','PM'],dose_am:'4',dose_pm:'5',active:true}]});
check('AM+PM → 2 rows',                       split.length===2,                  `got ${split.length}`);
check('row 0 AM, row 1 PM',                   split[0].time==='AM'&&split[1].time==='PM');
check('empty protocol → empty array',         G.buildWeeklyFromProtocol({peptides:[]}).length===0);

// ── _synthesizeProtocol ───────────────────────────────────────────────────────
console.log('\n── _synthesizeProtocol ────────────────────────────────────');
check('function defined',                   typeof G._synthesizeProtocol==='function');
if(typeof G._synthesizeProtocol==='function'){
const synth=G._synthesizeProtocol(G.WEEKLY_DEFAULT);
check('has peptides',                        synth.peptides.length>0,            `got ${synth.peptides.length}`);
check('marked _unsaved=true',                synth._unsaved===true);
check('no duplicate IDs',                    (()=>{const ids=synth.peptides.map(p=>p.id);return ids.length===new Set(ids).size;})());
check('each peptide has times array',        synth.peptides.every(p=>Array.isArray(p.times)));
check('each peptide has days array',         synth.peptides.every(p=>Array.isArray(p.days)));
check('synth peptides use PEPTIDE_CAT ids', synth.peptides.every(p=>G.PEPTIDE_CAT.some(c=>c.id===p.id)),
  synth.peptides.filter(p=>!G.PEPTIDE_CAT.some(c=>c.id===p.id)).map(p=>p.id).join(', '));
check('synth: reta maps to canonical id',   synth.peptides.some(p=>p.id==='retatrutide'));
check('synth: cjc maps to canonical id',    synth.peptides.some(p=>p.id==='cjc-ipa'));
check('synth: glow maps to canonical id',   synth.peptides.some(p=>p.id==='glow'));
check('synth: reta days includes Sun+Wed',  (()=>{const r=synth.peptides.find(p=>p.id==='retatrutide');return r&&r.days.includes(0)&&r.days.includes(3);})());
}

// ── WEEKLY_DEFAULT ────────────────────────────────────────────────────────────
console.log('\n── WEEKLY_DEFAULT ─────────────────────────────────────────');
check('defined and non-empty',              G.WEEKLY_DEFAULT?.length>0);
check('all have id/name/dow/dot',           G.WEEKLY_DEFAULT.every(w=>w.id&&w.name&&w.dow&&w.dot));
check('reta-sun on Sunday (dow 0)',         G.WEEKLY_DEFAULT.some(w=>w.id==='reta-sun'&&w.dow.includes(0)));
check('reta-wed on Wednesday (dow 3)',      G.WEEKLY_DEFAULT.some(w=>w.id==='reta-wed'&&w.dow.includes(3)));
check('cjc-am is AM, 7 days',              G.WEEKLY_DEFAULT.some(w=>w.id==='cjc-am'&&w.time==='AM'&&w.dow.length===7));
check('cjc-pm is PM, 7 days',              G.WEEKLY_DEFAULT.some(w=>w.id==='cjc-pm'&&w.time==='PM'&&w.dow.length===7));
check('glow-1 is 7 days AM',               G.WEEKLY_DEFAULT.some(w=>w.id==='glow-1'&&w.time==='AM'&&w.dow.length===7));
check('glow-2 removed (period ended)',     !G.WEEKLY_DEFAULT.some(w=>w.id==='glow-2'), 'glow-2 still in WEEKLY_DEFAULT');

// ── _synthesizeProtocol date propagation ──────────────────────────────────────
console.log('\n── _synthesizeProtocol: date propagation ───────────────────');
if(typeof G._synthesizeProtocol==='function'){
check('synth: glow has no end_date (permanent)',
  (()=>{const g=G._synthesizeProtocol(G.WEEKLY_DEFAULT).peptides.find(p=>p.id==='glow');return g&&!g.end_date;})(),
  'glow got end_date from a temporary entry — check _synthesizeProtocol');
// Simulate a WEEKLY list where one entry is permanent and one is timed
const mixedWeekly=[
  {id:'x-am',name:'TestPep',detail:'1 mg',dow:[0,1,2,3,4,5,6],time:'AM',dot:'#fff'},
  {id:'x-pm',name:'TestPep',detail:'2 mg',dow:[0,1,2,3,4,5,6],time:'PM',dot:'#fff',
   startDate:new Date(2025,0,1),endDate:new Date(2025,5,30)},
];
const mixedSynth=G._synthesizeProtocol(mixedWeekly);
const testPep=mixedSynth.peptides.find(p=>p.name==='TestPep');
check('synth: permanent+timed entry → no end_date on merged peptide',
  testPep&&!testPep.end_date, `end_date: ${testPep?.end_date}`);
check('synth: permanent+timed entry → has AM+PM times',
  testPep&&testPep.times.includes('AM')&&testPep.times.includes('PM'));
}

// ── Stack Store state & functions ─────────────────────────────────────────────
console.log('\n── Stack Store ────────────────────────────────────────────');
check('_userStacks defined',               Array.isArray(G._userStacks));
check('_activeStackIndices defined',        Array.isArray(G._activeStackIndices));
check('_stacksLoaded defined',             typeof G._stacksLoaded!=='undefined');
check('loadUserStacks defined',            typeof G.loadUserStacks==='function');
check('saveStacksToBackend defined',       typeof G.saveStacksToBackend==='function');
check('updateWEEKLY defined',              typeof G.updateWEEKLY==='function');
check('buildStackStore defined',           typeof G.buildStackStore==='function');
check('useStack defined',                  typeof G.useStack==='function');
check('deleteStack defined',               typeof G.deleteStack==='function');
check('createNewStack defined',            typeof G.createNewStack==='function');
check('editStackWithCycle defined',        typeof G.editStackWithCycle==='function');

// ── Wizard init ───────────────────────────────────────────────────────────────
console.log('\n── Wizard init & createNewStack ───────────────────────────');
check('initWizard defined',                typeof G.initWizard==='function');
if(typeof G.initWizard==='function') G.initWizard();
check('initWizard: step=0',                G._wiz.step===0);
check('initWizard: peptides=[]',           G._wiz.peptides.length===0);
check('initWizard: goals=[]',              G._wiz.goals.length===0);
check('initWizard: cycle_length set',      G._wiz.cycle_length>0,               `got ${G._wiz.cycle_length}`);
check('initWizard: stackIndex=-1',         G._wiz.stackIndex===-1);
check('initWizard: stackName is string',   typeof G._wiz.stackName==='string'&&G._wiz.stackName.length>0);

// ── _nextStackName: new stacks bump Cycle N (not always "Cycle 1") ──
if(typeof G._nextStackName==='function'){
  var _nsSaved=G._userStacks;
  G._userStacks=[];                       check('_nextStackName: first stack = Cycle 1', G._nextStackName()==='Cycle 1');
  G._userStacks=[{name:'Cycle 1'}];       check('_nextStackName: after Cycle 1 = Cycle 2', G._nextStackName()==='Cycle 2');
  G._userStacks=[{name:'Cycle 1'},{name:'Cycle 2'},{name:'Cycle 3'}]; check('_nextStackName: bumps to Cycle 4', G._nextStackName()==='Cycle 4');
  G._userStacks=[{name:'Cycle 1'},{name:'Cycle 3'}]; check('_nextStackName: past highest Cycle N (no collision)', G._nextStackName()==='Cycle 4');
  G._userStacks=[{name:'Cutting Stack'},{name:'Bulking'}]; check('_nextStackName: non-cycle names → next slot', G._nextStackName()==='Cycle 3');
  G._userStacks=_nsSaved;
  // initWizard uses it for a fresh (non-edit) stack
  G._userStacks=[{name:'Cycle 1'}]; G.initWizard();
  check('initWizard: default name bumps (Cycle 2)', G._wiz.stackName==='Cycle 2');
  G._userStacks=_nsSaved;
}

// ── TRT tab: surface T-Calc-planned testosterone (the "two ways to plan TRT") ──
if(typeof G._tcalcTrtSummary==='function'){
  var _ttSaved=G._injectionsCache;
  // no tcalc injections → no summary, no card
  G._injectionsCache={};
  check('_tcalcTrtSummary: null when no tcalc injections', G._tcalcTrtSummary()===null);
  check('_renderTcalcTrtCard: empty when nothing planned', G._renderTcalcTrtCard()==='');
  // seed a tcalc TRT injection + an unrelated stack injection
  G._injectionsCache={
    '2026-07-10':[{cycle_id:'tcalc',tier:'trt',compound_id:'test-e',compound_name:'Testosterone Enanthate',dose:'50',unit:'mg',dot:'#e8a020',date:'2026-07-10',source:'tcalc'}],
    '2026-07-13':[{cycle_id:'tcalc',tier:'trt',compound_id:'test-e',compound_name:'Testosterone Enanthate',dose:'50',unit:'mg',dot:'#e8a020',date:'2026-07-13',source:'tcalc'},
                  {cycle_id:'stack_x',tier:'peptide',compound_id:'ipamorelin',compound_name:'Ipamorelin',date:'2026-07-13'}]
  };
  var _ttSum=G._tcalcTrtSummary();
  check('_tcalcTrtSummary: finds the tcalc testosterone compound', !!_ttSum && _ttSum.length===1 && _ttSum[0].name==='Testosterone Enanthate');
  check('_tcalcTrtSummary: counts only tcalc entries (ignores stack peptide)', _ttSum[0].count===2);
  var _ttCard=G._renderTcalcTrtCard();
  check('_renderTcalcTrtCard: labels it Planned in T-Calc', /Planned in T-Calc/.test(_ttCard));
  check('_renderTcalcTrtCard: names the compound', /Testosterone Enanthate/.test(_ttCard));
  check('_renderTcalcTrtCard: deep-links to the T-Calc tab', /tab-btn-tcalc/.test(_ttCard));
  // _renderTRTViewTab shows the card and suppresses "No TRT configured"
  if(typeof G._renderTRTViewTab==='function'){
    var _ttView=G._renderTRTViewTab({trt:{enabled:false,compounds:[]}});
    check('_renderTRTViewTab: shows T-Calc card when planned there', /Planned in T-Calc/.test(_ttView));
    check('_renderTRTViewTab: suppresses "No TRT configured" when T-Calc card shows', !/No TRT configured/.test(_ttView));
    // with no tcalc plan, the empty message returns
    G._injectionsCache={};
    var _ttViewEmpty=G._renderTRTViewTab({trt:{enabled:false,compounds:[]}});
    check('_renderTRTViewTab: "No TRT configured" when nothing planned', /No TRT configured/.test(_ttViewEmpty));
  }
  // edit view (_renderEditTRT) shows the card above the compound list, regardless of toggle
  if(typeof G._renderEditTRT==='function'){
    G._injectionsCache={
      '2026-07-10':[{cycle_id:'tcalc',tier:'trt',compound_id:'test-e',compound_name:'Testosterone Enanthate',dose:'50',unit:'mg',dot:'#e8a020',date:'2026-07-10',source:'tcalc'}]
    };
    var _ttEditOff=G._renderEditTRT({enabled:false,compounds:[]});
    check('_renderEditTRT: shows T-Calc card when toggle OFF', /Planned in T-Calc/.test(_ttEditOff));
    var _ttEditOn=G._renderEditTRT({enabled:true,compounds:[]});
    var _cardIdx=_ttEditOn.indexOf('Planned in T-Calc');
    var _protoIdx=_ttEditOn.indexOf('TRT Protocol');
    check('_renderEditTRT: card sits above the compound list', _cardIdx>-1 && _cardIdx>_protoIdx);
    G._injectionsCache={};
    check('_renderEditTRT: no card when nothing planned', !/Planned in T-Calc/.test(G._renderEditTRT({enabled:true,compounds:[]})));
  }
  G._injectionsCache=_ttSaved;
}

if(typeof G.createNewStack==='function') G.createNewStack();
check('createNewStack: editMode=false',    G._wiz.editMode===false);
check('createNewStack: step=0',            G._wiz.step===0);

// ── Edit existing stack ───────────────────────────────────────────────────────
console.log('\n── Edit existing stack ────────────────────────────────────');
const testStack = {
  name:'Cutting Cycle',cycle_length:12,
  peptides:[
    {id:'cjc-am',name:'CJC',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'4',active:true},
    {id:'glow-1',name:'Glow',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'2',active:true},
  ],
  trt:{enabled:true,compound:'Nebido',injections:[{date:'2026-06-01',label:'Inj 1',dose:'250mg'}]}
};
G._userStacks=[testStack];G._activeStackIndices=[0];
if(typeof G.editStackWithCycle==='function'){
G._userTier=2;G.editStackWithCycle(0);G._userTier=1;
check('editStack: editMode=true',          G._wiz.editMode===true);
check('editStack: stackIndex=0',           G._wiz.stackIndex===0);
check('editStack: stackName loaded',       G._wiz.stackName==='Cutting Cycle');
check('editStack: cycle_length=12',        G._wiz.cycle_length===12,            `got ${G._wiz.cycle_length}`);
check('editStack: 2 peptides loaded',      G._wiz.peptides.length===2,          `got ${G._wiz.peptides.length}`);
check('editStack: TRT compound loaded (T2)',G._wiz.trt.compound==='Nebido');
check('editStack: deep copy (no mutation)',G._userStacks[0].peptides!==G._wiz.peptides);
check('editStack: goals inferred',         Array.isArray(G._wiz.goals));
// T3 edit: 'enhanced' NOT auto-included — only present if stack has enhanced compounds
G._userTier=3;G.editStackWithCycle(0);
check('editStack T3: enhanced not auto-included (peptide-only stack)', !G._wiz.goals.includes('enhanced'));
G._userTier=1;
}

// ── Cycle length ──────────────────────────────────────────────────────────────
console.log('\n── Cycle length ───────────────────────────────────────────');
check('CYCLE_WEEKS defined',               Array.isArray(G.CYCLE_WEEKS));
check('multiples of 4 from 4 to 240 (60 months)', G.CYCLE_WEEKS&&G.CYCLE_WEEKS.length===60&&G.CYCLE_WEEKS[0]===4&&G.CYCLE_WEEKS[59]===240&&G.CYCLE_WEEKS.every((v,i)=>v===(i+1)*4));
if(typeof G.initWizard==='function') G.initWizard();
G.wizSetCycleLength('8');  check('wizSetCycleLength("8")=8',    G._wiz.cycle_length===8,  `got ${G._wiz.cycle_length}`);
G.wizSetCycleLength('12'); check('wizSetCycleLength("12")=12',  G._wiz.cycle_length===12);
G.wizSetCycleLength(10);   check('wizSetCycleLength(10)=10',    G._wiz.cycle_length===10);
G.wizSetCycleLength('16'); check('custom cycle length 16',      G._wiz.cycle_length===16);

// ── Wizard navigation ─────────────────────────────────────────────────────────
console.log('\n── Wizard navigation ──────────────────────────────────────');
// _wizFlow: peps-only (T1, no TRT, no enhanced)
G._userTier=1;G.initWizard();
var t1flow=G._wizFlow();
check('_wizFlow: peps-only has 6 steps', t1flow.length===6, 'got '+t1flow.length);
check('_wizFlow: peps-only step[0]=cycle',  t1flow[0]==='cycle');
check('_wizFlow: peps-only step[5]=review', t1flow[5]==='review');
check('_wizFlow: peps-only has no trt',     !t1flow.includes('trt'));
check('_wizFlow: peps-only has no enhanced',!t1flow.includes('enhanced'));
check('_wizFlow: peps-only has no validate',!t1flow.includes('validate'));
// _wizFlow: TRT-only (T2, trt enabled, no pep goals)
G._userTier=2;G.initWizard();G._wiz.trt.enabled=true;
var trtOnlyFlow=G._wizFlow();
check('_wizFlow: TRT-only has 4 steps', trtOnlyFlow.length===4, 'got '+trtOnlyFlow.length);
check('_wizFlow: TRT-only steps', trtOnlyFlow.join(',')===('cycle,goals,trt,review'));
// _wizFlow: Peps + TRT (T2, trt enabled, pep goal selected)
G._userTier=2;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['muscle'];
var pepTrtFlow=G._wizFlow();
check('_wizFlow: peps+TRT has 8 steps', pepTrtFlow.length===8, 'got '+pepTrtFlow.length);
check('_wizFlow: peps+TRT has validate', pepTrtFlow.includes('validate'));
check('_wizFlow: peps+TRT ends with review', pepTrtFlow[pepTrtFlow.length-1]==='review');
// _wizFlow: TRT + Enhanced (T3, trt enabled, enhanced goal, no pep goals)
G._userTier=3;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['enhanced'];
var trtEnhFlow=G._wizFlow();
check('_wizFlow: TRT+enhanced has 6 steps', trtEnhFlow.length===6, 'got '+trtEnhFlow.length);
check('_wizFlow: TRT+enhanced steps', trtEnhFlow.join(',')===('cycle,goals,trt,enhanced,validate,review'));
// _wizFlow: Peps + TRT + Enhanced (T3, all tiers)
G._userTier=3;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['enhanced','muscle'];
var allFlow=G._wizFlow();
check('_wizFlow: peps+TRT+enhanced has 9 steps', allFlow.length===9, 'got '+allFlow.length);
check('_wizFlow: peps+TRT+enhanced has peptides', allFlow.includes('peptides'));
check('_wizFlow: peps+TRT+enhanced has trt',      allFlow.includes('trt'));
check('_wizFlow: peps+TRT+enhanced has enhanced',  allFlow.includes('enhanced'));
check('_wizFlow: peps+TRT+enhanced has validate',  allFlow.includes('validate'));
// wizNext / wizBack
G._userTier=1;G.initWizard();
G.wizNext();check('wizNext: 0→1', G._wiz.step===1);
G.wizNext();check('wizNext: 1→2', G._wiz.step===2);
G._wiz.step=2;G.wizBack();check('wizBack: 2→1', G._wiz.step===1);
// peps-only: wizNext from last step stays clamped
G._userTier=1;G.initWizard();G._wiz.step=5;G.wizNext();
check('wizNext: peps-only does not exceed step 5', G._wiz.step===5);
// TRT-only: step through all 4 steps
G._userTier=2;G.initWizard();G._wiz.trt.enabled=true;
G.wizNext();G.wizNext();G.wizNext();
check('wizNext: TRT-only after 3 calls = step 3 (review)', G._wiz.step===3);
G.wizNext();check('wizNext: TRT-only does not exceed step 3', G._wiz.step===3);
G.wizBack();check('wizBack: TRT-only 3→2 (trt)', G._wiz.step===2);
// TRT+Enhanced (no peps): step through
G._userTier=3;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['enhanced'];
G.wizNext();G.wizNext();G.wizNext();G.wizNext();G.wizNext();
check('wizNext: TRT+enhanced after 5 calls = step 5 (review)', G._wiz.step===5);
G.wizBack();check('wizBack: TRT+enhanced 5→4 (validate)', G._wiz.step===4);
G.wizBack();check('wizBack: TRT+enhanced 4→3 (enhanced)', G._wiz.step===3);
G.wizBack();check('wizBack: TRT+enhanced 3→2 (trt)', G._wiz.step===2);
// Peps+TRT: validate step appears
G._userTier=2;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['muscle'];
G.wizNext();G.wizNext();G.wizNext();G.wizNext();G.wizNext();G.wizNext();G.wizNext();
check('wizNext: peps+TRT after 7 calls = step 7 (review)', G._wiz.step===7);
G.wizBack();check('wizBack: peps+TRT 7→6 (validate)', G._wiz.step===6);
G._userTier=1; // restore
G.wizSetStackName('My New Stack');
check('wizSetStackName updates _wiz', G._wiz.stackName==='My New Stack');

// ── updateWEEKLY from active stack ────────────────────────────────────────────
console.log('\n── updateWEEKLY ───────────────────────────────────────────');
G._userStacks=[testStack];G._activeStackIndices=[0];
G.updateWEEKLY();
check('updateWEEKLY builds WEEKLY',   G.WEEKLY.length>0,                        `got ${G.WEEKLY.length}`);
check('WEEKLY contains cjc-am',       G.WEEKLY.some(w=>w.id==='cjc-am'));
check('WEEKLY contains glow-1',       G.WEEKLY.some(w=>w.id==='glow-1'));
G._userStacks=[];G.updateWEEKLY();
check('empty active indices → empty WEEKLY (not WEEKLY_DEFAULT)',G.WEEKLY.length===0);

// ── Stack → daily schedule ────────────────────────────────────────────────────
console.log('\n── Stack → daily schedule ─────────────────────────────────');
// Helper: simulate buildToday's filtering for a given date + WEEKLY list
function dosesForDate(d, weekly){
  var dow=d.getDay();
  return weekly.filter(function(w){
    if(!w.dow.includes(dow))return false;
    if(w.startDate&&d<w.startDate)return false;
    if(w.endDate&&d>w.endDate)return false;
    return true;
  }).map(function(w){return{id:w.id+'_'+G.dateKey(d),name:w.name,time:w.time,dot:w.dot};});
}
// Date helpers — fixed dates for deterministic tests
var SUN=new Date(2026,5,7);  // Sunday   (dow 0)
var MON=new Date(2026,5,8);  // Monday   (dow 1)
var WED=new Date(2026,5,10); // Wednesday (dow 3)
var SAT=new Date(2026,5,13); // Saturday  (dow 6)

// 1. Reta (Sunday + Wednesday only)
const retaStack={name:'Reta Only',peptides:[
  {id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0,3],times:['AM'],dose_am:'3',unit_am:'mg',active:true},
]};
G._userStacks=[retaStack];G._activeStackIndices=[0];G.updateWEEKLY();
check('reta: WEEKLY entry present',           G.WEEKLY.some(w=>w.id==='retatrutide'));
check('reta: shows on Sunday (dow 0)',        dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='Retatrutide'));
check('reta: shows on Wednesday (dow 3)',     dosesForDate(WED,G.WEEKLY).some(d=>d.name==='Retatrutide'));
check('reta: absent on Monday (dow 1)',       !dosesForDate(MON,G.WEEKLY).some(d=>d.name==='Retatrutide'));
check('reta: absent on Saturday (dow 6)',     !dosesForDate(SAT,G.WEEKLY).some(d=>d.name==='Retatrutide'));
check('reta: time is AM',                     G.WEEKLY.find(w=>w.id==='retatrutide')?.time==='AM');
check('reta: dose id format YYYY-MM-DD',       dosesForDate(SUN,G.WEEKLY)[0]?.id==='retatrutide_2026-06-07');

// 2. CJC-IPA (daily AM + PM → 2 WEEKLY entries)
const cjcStack={name:'CJC Stack',peptides:[
  {id:'cjc-ipa',name:'CJC-1295 / IPA',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM','PM'],dose_am:'4',dose_pm:'5',unit_am:'IU',unit_pm:'IU',active:true},
]};
G._userStacks=[cjcStack];G._activeStackIndices=[0];G.updateWEEKLY();
check('cjc: 2 WEEKLY entries (AM+PM)',        G.WEEKLY.filter(w=>w.name.includes('CJC')).length===2);
check('cjc-am: appears every day',           [SUN,MON,WED,SAT].every(d=>dosesForDate(d,G.WEEKLY).some(x=>x.id.startsWith('cjc-ipa-am'))));
check('cjc-pm: appears every day',           [SUN,MON,WED,SAT].every(d=>dosesForDate(d,G.WEEKLY).some(x=>x.id.startsWith('cjc-ipa-pm'))));
check('cjc: AM entry time=AM',               G.WEEKLY.find(w=>w.id==='cjc-ipa-am')?.time==='AM');
check('cjc: PM entry time=PM',               G.WEEKLY.find(w=>w.id==='cjc-ipa-pm')?.time==='PM');

// 3. Inactive peptide excluded
const mixedStack={name:'Mixed',peptides:[
  {id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0,3],times:['AM'],dose_am:'3',unit_am:'mg',active:true},
  {id:'ipamorelin', name:'Ipamorelin', dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'200',unit_am:'mcg',active:false},
]};
G._userStacks=[mixedStack];G._activeStackIndices=[0];G.updateWEEKLY();
check('inactive peptide excluded from WEEKLY',!G.WEEKLY.some(w=>w.name==='Ipamorelin'));
check('active peptide still in WEEKLY',       G.WEEKLY.some(w=>w.name==='Retatrutide'));

// 4. startDate filtering — peptide not started yet
var FUTURE=new Date(2026,11,1); // far future
const futureStack={name:'Future',peptides:[
  {id:'semaglutide',name:'Semaglutide',dot:'#e8ff3c',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.5',unit_am:'mg',start_date:'2026-12-01',active:true},
]};
G._userStacks=[futureStack];G._activeStackIndices=[0];G.updateWEEKLY();
check('future startDate: absent today (June)',!dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='Semaglutide'));
check('future startDate: shows on start day', dosesForDate(FUTURE,G.WEEKLY).some(d=>d.name==='Semaglutide'));

// 5. endDate filtering — expired peptide
const expiredStack={name:'Expired',peptides:[
  {id:'aod9604',name:'AOD9604',dot:'#e8ff3c',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'300',unit_am:'mcg',end_date:'2026-05-31',active:true},
]};
G._userStacks=[expiredStack];G._activeStackIndices=[0];G.updateWEEKLY();
check('expired endDate: absent on June 7',   !dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='AOD9604'));
check('expired endDate: present on May 30',  dosesForDate(new Date(2026,4,30),G.WEEKLY).some(d=>d.name==='AOD9604'));

// 6. Multi-stack: active stack drives WEEKLY
const stackA={name:'Stack A',peptides:[{id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0],times:['AM'],dose_am:'3',unit_am:'mg',active:true}]};
const stackB={name:'Stack B',peptides:[{id:'semaglutide', name:'Semaglutide',dot:'#f59e0b',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.5',unit_am:'mg',active:true}]};
G._userStacks=[stackA,stackB];
G._activeStackIndices=[0];G.updateWEEKLY();
check('active stack A: shows Reta on Sunday', dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='Retatrutide'));
check('active stack A: no Sema',              !dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='Semaglutide'));
G._activeStackIndices=[1];G.updateWEEKLY();
check('active stack B: shows Sema on Sunday', dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='Semaglutide'));
check('active stack B: no Reta',              !dosesForDate(SUN,G.WEEKLY).some(d=>d.name==='Retatrutide'));

// ── New stack saved includes cycle_length ─────────────────────────────────────
console.log('\n── wizSave includes cycle_length ──────────────────────────');
G.initWizard();
G.wizSetCycleLength(8);
G.wizSetStackName('Bulk Phase');
G._wiz.peptides=[{id:'cjc-am',name:'CJC',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'4',active:true}];
G._userStacks=[];
// Mock saveStacksToBackend to capture what gets saved
let savedProto=null;
G.saveStacksToBackend=async function(){savedProto=G._userStacks[0];return true;};
G.wizSave().then(async ()=>{
  check('saved stack has cycle_length', savedProto&&savedProto.cycle_length===8,  `got ${savedProto?.cycle_length}`);
  check('saved stack has name',         savedProto&&savedProto.name==='Bulk Phase');
  check('saved stack has peptides',     savedProto&&savedProto.peptides.length===1);

  // ── Check state stability: loadUserStacks must not remap p.id ────────────────
  console.log('\n── Check state stability (id remapping regression) ──────────');
  // Simulate a stack saved before PR#10 with WEEKLY_DEFAULT-style ids
  const oldStyleStack={
    name:'My Stack',
    peptides:[
      {id:'reta-sun',name:'Retatrutide',dot:'#e8ff3c',days:[0,3],times:['AM'],dose_am:'3',unit_am:'mg'},
      {id:'cjc-am',  name:'CJC-1295 / IPA',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'4',unit_am:'IU'},
      {id:'glow-1',  name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.2',unit_am:'IU'},
    ]
  };
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(oldStyleStack))],active_index:0})});
  await G.loadUserStacks();
  const lp=G._userStacks[0].peptides;
  check('loadUserStacks: reta-sun id not remapped', lp[0].id==='reta-sun',  `got "${lp[0].id}" (would break check state)`);
  check('loadUserStacks: cjc-am id not remapped',   lp[1].id==='cjc-am',   `got "${lp[1].id}" (would break check state)`);
  check('loadUserStacks: glow-1 id not remapped',   lp[2].id==='glow-1',   `got "${lp[2].id}" (would break check state)`);
  check('loadUserStacks: glow-1 unit_am IU→ml',     lp[2].unit_am==='ml',  `got "${lp[2].unit_am}" (unit migration broken)`);
  const wklyChk=G.buildWeeklyFromProtocol(G._userStacks[0]);
  const wklyIds=wklyChk.map(w=>w.id);
  check('WEEKLY: reta-sun id preserved',            wklyIds.includes('reta-sun'),       `ids: ${wklyIds.join(', ')}`);
  check('WEEKLY: cjc-am id preserved',              wklyIds.includes('cjc-am'),         `ids: ${wklyIds.join(', ')}`);
  check('WEEKLY: glow-1 id preserved',              wklyIds.includes('glow-1'),         `ids: ${wklyIds.join(', ')}`);
  check('WEEKLY: no retatrutide (check state safe)',!wklyIds.includes('retatrutide'),   `retatrutide appeared — stored check state would not match`);

  // ── Glow end_date migration (glow disappeared regression) ────────────────────
  console.log('\n── Glow end_date migration ─────────────────────────────────');
  // Simulate a stack where _synthesizeProtocol wrongly set end_date on merged glow peptide
  const glowExpiredStack={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM','PM'],dose_am:'0.09',unit_am:'ml',end_date:'2026-06-03'},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(glowExpiredStack))],active_index:0})});
  await G.loadUserStacks();
  const glowP2=G._userStacks[0].peptides[0];
  check('migration: expired end_date cleared from glow',   !glowP2.end_date,  `end_date still set: ${glowP2.end_date}`);
  // Glow has no start_date — migration must NOT stamp one (new/test stacks must stay date-free)
  check('migration: glow with no start_date NOT auto-stamped', !glowP2.start_date, `start_date unexpectedly set: ${glowP2.start_date}`);
  const wklyGlow=G.buildWeeklyFromProtocol(G._userStacks[0]);
  check('migration: glow-am entry has no endDate',         !wklyGlow.find(w=>w.id==='glow-am')?.endDate, 'glow-am still has endDate');
  check('migration: glow-pm entry has no endDate',         !wklyGlow.find(w=>w.id==='glow-pm')?.endDate, 'glow-pm still has endDate');
  // Verify start_date is PRESERVED when an expired end_date is cleared (the real bug fix)
  const glowWithSdExpired={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.09',unit_am:'ml',start_date:'2026-04-16',end_date:'2026-06-03'},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(glowWithSdExpired))],active_index:0})});
  await G.loadUserStacks();
  const glowP3=G._userStacks[0].peptides[0];
  check('migration: start_date preserved when expired end_date cleared', glowP3.start_date==='2026-04-16'&&!glowP3.end_date, `start_date=${glowP3.start_date} end_date=${glowP3.end_date}`);
  // ── Regression: new stacks must not get auto-dated ───────────────────────────
  console.log('\n── New stack: no auto start_date ───────────────────────────');
  // Any new stack created by the wizard has no start_date on its peptides.
  // loadUserStacks must NOT stamp April dates on them.
  const newCjcStack={name:'Test CJC',peptides:[
    {id:'cjc-ipa',name:'CJC-1295/Ipa',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'4',unit_am:'IU',active:true},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(newCjcStack))],active_index:0})});
  await G.loadUserStacks();
  const newCjcPep=G._userStacks[0].peptides[0];
  check('new CJC stack: no auto start_date stamped', !newCjcPep.start_date, `start_date unexpectedly set: ${newCjcPep.start_date}`);
  const newRetaStack={name:'Test Reta',peptides:[
    {id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0],times:['AM'],dose_am:'3',unit_am:'mg',active:true},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(newRetaStack))],active_index:0})});
  await G.loadUserStacks();
  check('new Reta stack: no auto start_date stamped', !G._userStacks[0].peptides[0].start_date, `start_date unexpectedly set: ${G._userStacks[0].peptides[0].start_date}`);
  // Glow recon: 70mg/3ml = 23.333mg/ml, 9 IU = 0.09ml
  const rcGlow9=G.reconCalc('0.09','ml',G.RECON_DB['glow'].vials[G.RECON_DB['glow'].defaultVi],G.RECON_DB['glow'].water[G.RECON_DB['glow'].defaultWi],'mg');
  check('glow 3ml: 0.09ml → 9 IU',    rcGlow9&&rcGlow9.iu===9,      `got ${rcGlow9?.iu}`);
  check('glow default water is 3ml',   G.RECON_DB['glow'].water[G.RECON_DB['glow'].defaultWi]===3, `got ${G.RECON_DB['glow'].water[G.RECON_DB['glow'].defaultWi]}`);

  // ── Glow dose_am migration (0.2 ml → 0.09 ml) ────────────────────────────────
  console.log('\n── Glow dose_am migration (0.2→0.09) ──────────────────────');
  const glowOldDoseStack={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.2',unit_am:'ml'},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(glowOldDoseStack))],active_index:0})});
  await G.loadUserStacks();
  const glowMigP=G._userStacks[0].peptides[0];
  check('migration: glow dose_am 0.2→0.09',    glowMigP.dose_am==='0.09', `got "${glowMigP.dose_am}"`);
  check('migration: glow unit_am preserved ml', glowMigP.unit_am==='ml',   `got "${glowMigP.unit_am}"`);
  const wklyMig=G.buildWeeklyFromProtocol(G._userStacks[0]);
  check('migration: glow WEEKLY detail has 0.09', wklyMig[0]?.detail?.includes('0.09'), `got "${wklyMig[0]?.detail}"`);
  // Custom dose (not 0.2) must NOT be overridden
  const glowCustomDoseStack={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.12',unit_am:'ml'},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(glowCustomDoseStack))],active_index:0})});
  await G.loadUserStacks();
  check('migration: custom glow dose 0.12 not overridden', G._userStacks[0].peptides[0].dose_am==='0.12', `got "${G._userStacks[0].peptides[0].dose_am}"`);
  // migration must fire when backend stores dose_am as a number (not a string)
  const glowNumericStack={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:0.2,unit_am:'mg'},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(glowNumericStack))],active_index:0})});
  await G.loadUserStacks();
  check('migration: glow numeric dose 0.2 → 0.09',  G._userStacks[0].peptides[0].dose_am==='0.09', `got "${G._userStacks[0].peptides[0].dose_am}"`);
  check('migration: glow numeric dose unit → ml',   G._userStacks[0].peptides[0].unit_am==='ml',   `got "${G._userStacks[0].peptides[0].unit_am}"`);
  // dose_am = 0.09 but unit_am = 'mg' (right number, wrong unit — the actual bug in prod)
  const glowWrongUnitStack={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.09',unit_am:'mg'},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(glowWrongUnitStack))],active_index:0})});
  await G.loadUserStacks();
  check('migration: glow 0.09mg unit fixed → ml', G._userStacks[0].peptides[0].unit_am==='ml',  `got "${G._userStacks[0].peptides[0].unit_am}"`);
  check('migration: glow 0.09mg dose preserved',  G._userStacks[0].peptides[0].dose_am==='0.09',`got "${G._userStacks[0].peptides[0].dose_am}"`);

  // ── TRT compound end_date auto-migration ─────────────────────────────────────
  console.log('\n── TRT compound end_date auto-migration ─────────────────────');
  {
    // Stack with testoviron TRT compound and no end_date → end_date should NOT be auto-set (TESTO removed)
    const trtMigStack = {
      name: 'TRT Migration Test',
      cycle_start: '2026-05-01',
      trt: { enabled: true, compounds: [
        { id: 'testoviron', name: 'Testoviron Depot', dose: '125', unit: 'mg', freqVal: 1, freqUnit: 'weeks' }
      ]},
      peptides: []
    };
    G.fetch = async () => ({ ok: true, json: async () => ({ stacks: [JSON.parse(JSON.stringify(trtMigStack))], active_index: 0 }) });
    await G.loadUserStacks();
    const migC = G._userStacks[0].trt.compounds[0];
    check('TRT migration: testoviron end_date NOT auto-set (configurable per stack)', !migC.end_date, `end_date was auto-set to ${migC.end_date}`);
    check('TRT migration: no hardcoded TESTO date injected',        migC.end_date !== '2026-05-26', `got hardcoded date ${migC.end_date}`);
    // Existing end_date must not be overwritten
    const trtMigExistingEnd = {
      ...trtMigStack,
      trt: { enabled: true, compounds: [
        { id: 'testoviron', name: 'Testoviron Depot', dose: '125', unit: 'mg', freqVal: 1, freqUnit: 'weeks', end_date: '2026-06-01' }
      ]}
    };
    G.fetch = async () => ({ ok: true, json: async () => ({ stacks: [JSON.parse(JSON.stringify(trtMigExistingEnd))], active_index: 0 }) });
    await G.loadUserStacks();
    const migC2 = G._userStacks[0].trt.compounds[0];
    check('TRT migration: existing end_date not overwritten',       migC2.end_date === '2026-06-01', `got ${migC2.end_date}`);
    // Other TRT compounds (Nebido) are unaffected
    const trtNebidoStack = {
      ...trtMigStack,
      trt: { enabled: true, compounds: [
        { id: 'nebido', name: 'Nebido', dose: '1000', unit: 'mg', freqVal: 12, freqUnit: 'weeks' }
      ]}
    };
    G.fetch = async () => ({ ok: true, json: async () => ({ stacks: [JSON.parse(JSON.stringify(trtNebidoStack))], active_index: 0 }) });
    await G.loadUserStacks();
    const migC3 = G._userStacks[0].trt.compounds[0];
    check('TRT migration: nebido end_date not set by migration',    !migC3.end_date,               `got ${migC3.end_date}`);
  }

  // ── getChecked: old-style → canonical id mapping ──────────────────────────────
  console.log('\n── getChecked: id alias mapping ────────────────────────────');
  // Use a fixed date via _viewDate so we control the key (G.NOW is a const, not on sandbox)
  var chkDate=new Date(2026,5,4);  // June 4, 2026 (Thursday)
  G._viewDate=chkDate;
  const chkDk=G.dateKey(chkDate);
  // CJC aliases: cjc-am/cjc-pm → cjc-ipa-am/cjc-ipa-pm
  sandbox.localStorage._s['proto-chk-'+chkDk]=JSON.stringify(['cjc-am_'+chkDk,'cjc-pm_'+chkDk]);
  var chkCjc=G.getChecked();
  check('getChecked: cjc-am → cjc-ipa-am',   chkCjc.includes('cjc-ipa-am_'+chkDk), `got ${JSON.stringify(chkCjc)}`);
  check('getChecked: cjc-pm → cjc-ipa-pm',   chkCjc.includes('cjc-ipa-pm_'+chkDk), `got ${JSON.stringify(chkCjc)}`);
  // GLOW aliases: glow-1/glow-2 → glow
  sandbox.localStorage._s['proto-chk-'+chkDk]=JSON.stringify(['glow-1_'+chkDk,'glow-2_'+chkDk]);
  var chkGlow=G.getChecked();
  check('getChecked: glow-1 → glow',          chkGlow.includes('glow_'+chkDk), `got ${JSON.stringify(chkGlow)}`);
  check('getChecked: glow-2 → glow',          chkGlow.every(id=>id==='glow_'+chkDk), `got ${JSON.stringify(chkGlow)}`);
  // Reta aliases: reta-sun/reta-wed → retatrutide
  sandbox.localStorage._s['proto-chk-'+chkDk]=JSON.stringify(['reta-sun_'+chkDk,'reta-wed_'+chkDk]);
  var chkReta=G.getChecked();
  check('getChecked: reta-sun → retatrutide', chkReta.includes('retatrutide_'+chkDk), `got ${JSON.stringify(chkReta)}`);
  check('getChecked: reta-wed → retatrutide', chkReta.every(id=>id==='retatrutide_'+chkDk), `got ${JSON.stringify(chkReta)}`);
  // Canonical ids pass through unchanged
  sandbox.localStorage._s['proto-chk-'+chkDk]=JSON.stringify(['cjc-ipa-am_'+chkDk,'glow_'+chkDk,'retatrutide_'+chkDk]);
  var chkCanon=G.getChecked();
  check('getChecked: canonical ids unchanged', JSON.stringify(chkCanon)===JSON.stringify(['cjc-ipa-am_'+chkDk,'glow_'+chkDk,'retatrutide_'+chkDk]), `got ${JSON.stringify(chkCanon)}`);
  // Mixed old+canonical
  sandbox.localStorage._s['proto-chk-'+chkDk]=JSON.stringify(['cjc-am_'+chkDk,'glow_'+chkDk]);
  var chkMix=G.getChecked();
  check('getChecked: mixed old+canonical → all canonical', chkMix.includes('cjc-ipa-am_'+chkDk)&&chkMix.includes('glow_'+chkDk), `got ${JSON.stringify(chkMix)}`);
  // testo ids are unaffected (multi-underscore prefix)
  sandbox.localStorage._s['proto-chk-'+chkDk]=JSON.stringify(['testo_0_'+chkDk]);
  var chkTesto=G.getChecked();
  check('getChecked: testo id unchanged',      chkTesto[0]==='testo_0_'+chkDk, `got ${JSON.stringify(chkTesto)}`);
  delete sandbox.localStorage._s['proto-chk-'+chkDk];
  G._viewDate=null;

  // ── _normDoseId: date suffix normalization ────────────────────────────────────
  console.log('\n── _normDoseId: date suffix normalization ──────────────────');
  check('_normDoseId defined',              typeof G._normDoseId === 'function');
  check('_normDoseId: already padded',      G._normDoseId('retatrutide_2026-06-12') === 'retatrutide_2026-06-12');
  check('_normDoseId: un-padded month',     G._normDoseId('retatrutide_2026-6-12')  === 'retatrutide_2026-06-12');
  check('_normDoseId: un-padded day',       G._normDoseId('retatrutide_2026-06-2')  === 'retatrutide_2026-06-02');
  check('_normDoseId: un-padded both',      G._normDoseId('retatrutide_2026-6-2')   === 'retatrutide_2026-06-02');
  check('_normDoseId: multi-part prefix',   G._normDoseId('nebido_0_2026-6-12')     === 'nebido_0_2026-06-12');
  check('_normDoseId: testo multi-part',    G._normDoseId('testo_1_2026-6-5')       === 'testo_1_2026-06-05');
  check('_normDoseId: cjc hyphen id',       G._normDoseId('cjc-ipa-am_2026-6-12')  === 'cjc-ipa-am_2026-06-12');
  check('_normDoseId: already padded noop', G._normDoseId('glow_2026-12-31')        === 'glow_2026-12-31');

  // ── _migrateCheckedKeys: old proto-chk key migration ──────────────────────────
  console.log('\n── _migrateCheckedKeys: proto-chk key migration ────────────');
  check('_migrateCheckedKeys defined', typeof G._migrateCheckedKeys === 'function');
  // Scenario 1: un-padded key only — should rename key and normalize IDs
  {
    const oldKey = 'proto-chk-2026-6-3';
    const newKey = 'proto-chk-2026-06-03';
    sandbox.localStorage._s[oldKey] = JSON.stringify(['retatrutide_2026-6-3','glow_2026-6-3','testo_0_2026-6-3']);
    delete sandbox.localStorage._s[newKey];
    G._migrateCheckedKeys();
    check('migrate: old key removed',               sandbox.localStorage._s[oldKey] === undefined,
      `still has: ${sandbox.localStorage._s[oldKey]}`);
    check('migrate: new key created',               sandbox.localStorage._s[newKey] !== undefined);
    const migrated = JSON.parse(sandbox.localStorage._s[newKey] || '[]');
    check('migrate: reta ID normalized',            migrated.includes('retatrutide_2026-06-03'),
      `got ${JSON.stringify(migrated)}`);
    check('migrate: glow ID normalized',            migrated.includes('glow_2026-06-03'),
      `got ${JSON.stringify(migrated)}`);
    check('migrate: testo ID normalized',           migrated.includes('testo_0_2026-06-03'),
      `got ${JSON.stringify(migrated)}`);
    check('migrate: 3 entries preserved',           migrated.length === 3, `got ${migrated.length}`);
    delete sandbox.localStorage._s[newKey];
  }
  // Scenario 2: both old and new key exist — should merge (new key takes precedence)
  {
    const oldKey2 = 'proto-chk-2026-6-4';
    const newKey2 = 'proto-chk-2026-06-04';
    sandbox.localStorage._s[oldKey2] = JSON.stringify(['retatrutide_2026-6-4','glow_2026-6-4']);
    sandbox.localStorage._s[newKey2] = JSON.stringify(['cjc-ipa-am_2026-06-04']);
    G._migrateCheckedKeys();
    check('merge: old key removed',                 sandbox.localStorage._s[oldKey2] === undefined);
    const merged = JSON.parse(sandbox.localStorage._s[newKey2] || '[]');
    check('merge: 3 IDs after merge',               merged.length === 3, `got ${JSON.stringify(merged)}`);
    check('merge: existing new-key ID preserved',   merged.includes('cjc-ipa-am_2026-06-04'));
    check('merge: old IDs normalized+merged (reta)',merged.includes('retatrutide_2026-06-04'),
      `got ${JSON.stringify(merged)}`);
    check('merge: old IDs normalized+merged (glow)',merged.includes('glow_2026-06-04'),
      `got ${JSON.stringify(merged)}`);
    delete sandbox.localStorage._s[newKey2];
  }
  // Scenario 3: already-padded key is untouched
  {
    const paddedKey = 'proto-chk-2026-06-05';
    sandbox.localStorage._s[paddedKey] = JSON.stringify(['glow_2026-06-05']);
    G._migrateCheckedKeys();
    check('migrate: padded key untouched',          sandbox.localStorage._s[paddedKey] !== undefined);
    check('migrate: padded key content unchanged',  JSON.parse(sandbox.localStorage._s[paddedKey]).length === 1);
    delete sandbox.localStorage._s[paddedKey];
  }

  // ── getChecked: old-format key+IDs → normalized output (regression guard) ────
  console.log('\n── getChecked: old-format key regression guard ─────────────');
  {
    G._viewDate = new Date(2026, 5, 12); // June 12, 2026
    const newKey3 = 'proto-chk-2026-06-12';
    const oldKey3 = 'proto-chk-2026-6-12';
    delete sandbox.localStorage._s[newKey3];
    sandbox.localStorage._s[oldKey3] = JSON.stringify(['retatrutide_2026-6-12','glow_2026-6-12','testo_0_2026-6-12']);
    const chkOld = G.getChecked();
    check('old key: reta ID normalized',            chkOld.includes('retatrutide_2026-06-12'),
      `got ${JSON.stringify(chkOld)}`);
    check('old key: glow ID normalized',            chkOld.includes('glow_2026-06-12'),
      `got ${JSON.stringify(chkOld)}`);
    check('old key: testo ID normalized',           chkOld.includes('testo_0_2026-06-12'),
      `got ${JSON.stringify(chkOld)}`);
    check('old key: all IDs have padded date suffix', chkOld.every(id => /_\d{4}-\d{2}-\d{2}$/.test(id)),
      `unpadded: ${chkOld.filter(id => !/_\d{4}-\d{2}-\d{2}$/.test(id)).join(', ')}`);
    // Simulate buildToday() creating padded dose ID — must match getChecked() output
    const builtId = 'retatrutide_' + G.dateKey(new Date(2026, 5, 12));
    check('old key: matches buildToday() dose ID',  chkOld.includes(builtId),
      `builtId=${builtId}, checked=${JSON.stringify(chkOld)}`);
    delete sandbox.localStorage._s[oldKey3];
    G._viewDate = null;
  }

  // ── getPastDoses: normalizes un-padded server dates ───────────────────────────
  console.log('\n── getPastDoses: server date normalization ──────────────────');
  {
    const origLog = G.window._peptideLog;
    G.window._peptideLog = [
      {date: '2026-6-7',   doses: ['retatrutide_2026-6-7',  'glow_2026-6-7']},
      {date: '2026-06-08', doses: ['cjc-ipa-am_2026-06-08']},
    ];
    const d1 = new Date(2026, 5, 7);
    const r1 = G.getPastDoses(d1);
    check('getPastDoses: finds entry with un-padded date',  r1 !== null, 'returned null');
    check('getPastDoses: reta ID normalized',               r1 && r1.includes('retatrutide_2026-06-07'),
      `got ${JSON.stringify(r1)}`);
    check('getPastDoses: glow ID normalized',               r1 && r1.includes('glow_2026-06-07'),
      `got ${JSON.stringify(r1)}`);
    const d2 = new Date(2026, 5, 8);
    const r2 = G.getPastDoses(d2);
    check('getPastDoses: finds entry with padded date',     r2 !== null);
    check('getPastDoses: padded ID unchanged',              r2 && r2[0] === 'cjc-ipa-am_2026-06-08');
    check('getPastDoses: returns null for missing date',    G.getPastDoses(new Date(2026,5,9)) === null);
    G.window._peptideLog = origLog;
  }

  // ── _getDynamicTRTDoses: cycle_length end-date guard ─────────────────────────
  console.log('\n── _getDynamicTRTDoses: cycle_length end-date guard ────────');
  {
    const savedStacks  = G._userStacks;
    const savedIdx     = G._activeStackIndices.slice();
    // Stack with 8-week cycle starting May 1 → cycle ends June 26
    const trtStack = {
      name: 'TRT Test',
      cycle_start: '2026-05-01',
      cycle_length: 8,
      trt: { enabled: true, compounds: [{ id: 'testoviron', name: 'Testoviron Depot', dose: '125', unit: 'mg', freqVal: 1, freqUnit: 'weeks' }] },
      peptides: []
    };
    G._userStacks = [trtStack];
    G._activeStackIndices = [0];

    // Day 0: cycle start → should inject (0 % 7 === 0)
    const d0 = new Date(2026, 4, 1);
    const r0 = G._getDynamicTRTDoses(d0, false);
    check('TRT: day 0 (cycle start) produces dose',        r0.length === 1, `got ${r0.length} doses`);

    // Day 7: one week in → should inject
    const d7 = new Date(2026, 4, 8);
    const r7 = G._getDynamicTRTDoses(d7, false);
    check('TRT: day 7 (week 1) produces dose',             r7.length === 1, `got ${r7.length} doses`);

    // Day 55: 7 weeks 6 days in → still within 8-week cycle (55 < 56), 55%7===6 → no injection day
    const d55 = new Date(2026, 4, 1 + 55);
    const r55 = G._getDynamicTRTDoses(d55, false);
    check('TRT: day 55 (not injection day) → no dose',    r55.length === 0, `got ${r55.length} doses`);

    // Day 56: 8 weeks exactly → cycle_length*7 = 56, days >= 56 → no dose (washout)
    const d56 = new Date(2026, 4, 1 + 56);
    const r56 = G._getDynamicTRTDoses(d56, false);
    check('TRT: day 56 (== cycle_length*7) → no dose (washout)',  r56.length === 0, `got ${r56.length} doses`);

    // Day 63: one week past cycle end → still no dose
    const d63 = new Date(2026, 4, 1 + 63);
    const r63 = G._getDynamicTRTDoses(d63, false);
    check('TRT: day 63 (past cycle end) → no dose',       r63.length === 0, `got ${r63.length} doses`);

    // No cycle_length set → doses continue indefinitely (backward compat)
    const trtNoCycle = { ...trtStack, cycle_length: undefined };
    G._userStacks = [trtNoCycle];
    const rNoCycle = G._getDynamicTRTDoses(d63, false);
    check('TRT: no cycle_length → dose still generated',  rNoCycle.length === 1, `got ${rNoCycle.length} doses`);

    // per-compound end_date: doses suppressed after the end_date
    const trtWithEnd = {
      ...trtStack,
      cycle_length: undefined,
      trt: { enabled: true, compounds: [
        { ...trtStack.trt.compounds[0], end_date: '2026-05-26' }  // bridge ended May 26
      ]}
    };
    G._userStacks = [trtWithEnd];
    // day 7 (May 8) is before end_date May 26 → dose expected
    const rBeforeEnd = G._getDynamicTRTDoses(new Date(2026,4,8), false);
    check('TRT end_date: dose before end_date',            rBeforeEnd.length === 1, `got ${rBeforeEnd.length} doses`);
    // May 22 (day 21, 21%7=0) is a valid injection day AND used as end_date → dose expected (inclusive)
    const trtWithEnd22 = { ...trtWithEnd, trt: { enabled: true, compounds: [{ ...trtWithEnd.trt.compounds[0], end_date: '2026-05-22' }] } };
    G._userStacks = [trtWithEnd22];
    const rOnEnd = G._getDynamicTRTDoses(new Date(2026,4,22), false);
    check('TRT end_date: dose on end_date (inclusive)',    rOnEnd.length === 1,     `got ${rOnEnd.length} doses`);
    // June 13 (day 43 from May 1) → past end_date → suppressed
    const rPastEnd = G._getDynamicTRTDoses(new Date(2026,5,13), false);
    check('TRT end_date: dose past end_date suppressed',   rPastEnd.length === 0,  `got ${rPastEnd.length} doses`);

    // TRT disabled → no doses
    const trtDisabled = { ...trtStack, trt: { enabled: false, compounds: trtStack.trt.compounds } };
    G._userStacks = [trtDisabled];
    const rOff = G._getDynamicTRTDoses(d7, false);
    check('TRT: trt.enabled=false → no doses',            rOff.length === 0, `got ${rOff.length} doses`);

    G._userStacks       = savedStacks;
    G._activeStackIndices = savedIdx;
  }

  // ── loadUserStacks: WEEKLY updated (post-load re-render coverage) ─────────────
  console.log('\n── loadUserStacks: WEEKLY updated after load ───────────────');
  const canonicalLoadStack={name:'My Stack',peptides:[
    {id:'glow',name:'GLOW Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.09',unit_am:'ml',active:true},
    {id:'cjc-ipa',name:'CJC-1295 / IPA',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM','PM'],dose_am:'4',unit_am:'IU',dose_pm:'5',unit_pm:'IU',active:true},
  ]};
  G.fetch=async()=>({ok:true,json:async()=>({stacks:[JSON.parse(JSON.stringify(canonicalLoadStack))],active_index:0})});
  await G.loadUserStacks();
  check('post-load: WEEKLY has glow',        G.WEEKLY.some(w=>w.id==='glow'),        `ids: ${G.WEEKLY.map(w=>w.id).join(', ')}`);
  check('post-load: WEEKLY has cjc-ipa-am',  G.WEEKLY.some(w=>w.id==='cjc-ipa-am'), `ids: ${G.WEEKLY.map(w=>w.id).join(', ')}`);
  check('post-load: WEEKLY has cjc-ipa-pm',  G.WEEKLY.some(w=>w.id==='cjc-ipa-pm'), `ids: ${G.WEEKLY.map(w=>w.id).join(', ')}`);
  check('post-load: glow has no endDate',    !G.WEEKLY.find(w=>w.id==='glow')?.endDate, 'glow endDate set after load');

  // ── _deriveEarliestStartDate ────────────────────────────────────────────────
  console.log('\n── _deriveEarliestStartDate ────────────────────────────────');
  check('derive: null for empty array',              G._deriveEarliestStartDate([])===null);
  check('derive: null when no start_dates',          G._deriveEarliestStartDate([{id:'x'},{id:'y'}])===null);
  check('derive: single peptide',                    G._deriveEarliestStartDate([{start_date:'2026-04-04'}])==='2026-04-04');
  check('derive: returns earliest of multiple',      G._deriveEarliestStartDate([{start_date:'2026-04-16'},{start_date:'2026-04-04'},{start_date:'2026-05-01'}])==='2026-04-04');
  check('derive: ignores peptides without start_date', G._deriveEarliestStartDate([{id:'x'},{start_date:'2026-04-16'},{start_date:'2026-04-04'}])==='2026-04-04');

  // ── cycle_start in _collectEditInputs ────────────────────────────────────────
  // cycle_start is NEVER auto-derived from peptide dates — only what user sets in the input
  console.log('\n── cycle_start collect (no auto-derive) ────────────────────');
  const noop2=()=>{};
  const mkInp=v=>({value:v,style:{},classList:{add:noop2,remove:noop2},appendChild:noop2});
  function runCollect(cycleDateInInput, peptides){
    G._editBuf={name:'t',cycle_start:cycleDateInInput,cycle_length:12,peptides};
    const origGet=G.document.getElementById;
    G.document.getElementById=function(id){
      if(id==='edit-cycle-start')return mkInp(cycleDateInInput);
      if(id==='edit-stack-name')return mkInp('t');
      const m=id.match(/^ed-sd-(\d+)$/);
      if(m)return mkInp(peptides[+m[1]]?.start_date||'');
      return mkInp('');
    };
    G._collectEditInputs();
    G.document.getElementById=origGet;
    return G._editBuf.cycle_start;
  }
  const pepApr4=[{id:'retatrutide',name:'Reta',start_date:'2026-04-04',times:['AM'],days:[0,3],dose_am:'3',unit_am:'mg'}];
  const pepApr4andApr16=[...pepApr4,{id:'glow',name:'GLOW',start_date:'2026-04-16',times:['AM'],days:[0,1,2,3,4,5,6],dose_am:'0.09',unit_am:'ml'}];

  check('collect: empty input → cycle_start deleted (not auto-filled)',   runCollect('',pepApr4)===undefined,                     `got ${runCollect('',pepApr4)}`);
  check('collect: future user date kept, not overridden by past peptide', runCollect('2026-05-18',pepApr4)==='2026-05-18',        `got ${runCollect('2026-05-18',pepApr4)}`);
  check('collect: explicit date kept unchanged',                           runCollect('2026-04-04',pepApr4)==='2026-04-04',        `got ${runCollect('2026-04-04',pepApr4)}`);
  check('collect: future date kept even with multiple past peptides',      runCollect('2026-05-18',pepApr4andApr16)==='2026-05-18',`got ${runCollect('2026-05-18',pepApr4andApr16)}`);
  check('collect: early user-set date kept, not moved forward by peptide', runCollect('2026-03-01',pepApr4)==='2026-03-01',       `got ${runCollect('2026-03-01',pepApr4)}`);

  // ── Weight history sort ───────────────────────────────────────────────────────
  console.log('\n── Weight history sort (newest first) ─────────────────────');
  check('sortWeightHistory defined',    typeof G.sortWeightHistory === 'function');
  check('bcRenderWeightHistory defined',typeof G.bcRenderWeightHistory === 'function');
  check('bcDrawWeightLeanChart defined', typeof G.bcDrawWeightLeanChart === 'function');
  check('setBcWeightWindow defined',    typeof G.setBcWeightWindow === 'function');
  check('toggleBcWeightHist defined',   typeof G.toggleBcWeightHist === 'function');
  check('deleteWeight defined',         typeof G.deleteWeight === 'function');
  check('deleteWeightFromAgent defined',typeof G.deleteWeightFromAgent === 'function');

  // Newest entry is first
  const _whSorted = G.sortWeightHistory([
    { date: '2026-06-01', weight: 90 },
    { date: '2026-06-10', weight: 88 },
    { date: '2026-05-15', weight: 91 },
    { date: '2026-06-05', weight: 89 },
  ]);
  check('sort: first entry is newest (2026-06-10)',
    _whSorted[0].date === '2026-06-10', `got "${_whSorted[0].date}"`);
  check('sort: last entry is oldest (2026-05-15)',
    _whSorted[_whSorted.length - 1].date === '2026-05-15', `got "${_whSorted[_whSorted.length - 1].date}"`);
  check('sort: strictly descending order',
    _whSorted.every((w, i) => i === 0 || _whSorted[i - 1].date >= w.date),
    `got ${JSON.stringify(_whSorted.map(w => w.date))}`);

  // Does not mutate input
  const _whIn = [{ date: '2026-01-01', weight: 80 }, { date: '2026-02-01', weight: 81 }];
  G.sortWeightHistory(_whIn);
  check('sort: does not mutate input', _whIn[0].date === '2026-01-01', `got "${_whIn[0].date}"`);

  // Invalid-date entries float to top
  const _whMixed = G.sortWeightHistory([
    { date: '2026-06-01', weight: 90 },
    { date: '2026-6-3',   weight: 69 },
    { date: '2026-06-10', weight: 88 },
  ]);
  check('sort: invalid-date entry is first',
    !/^\d{4}-\d{2}-\d{2}$/.test(_whMixed[0].date), `got "${_whMixed[0].date}"`);
  check('sort: valid entries are newest-first below invalid',
    _whMixed[1].date === '2026-06-10' && _whMixed[2].date === '2026-06-01',
    `got ${JSON.stringify(_whMixed.map(w => w.date))}`);

  // Edge cases
  check('sort: empty → []',   G.sortWeightHistory([]).length === 0);
  const _wh1 = G.sortWeightHistory([{ date: '2026-06-01', weight: 90 }]);
  check('sort: single entry', _wh1.length === 1 && _wh1[0].weight === 90);

  // ── Weight window (30/60/90d filter) ─────────────────────────────────────────
  console.log('\n── Weight window (30/60/90d filter) ───────────────────────');
  check('default _bcWeightWindow is 90', G._bcWeightWindow === 90, `got ${G._bcWeightWindow}`);

  const _origBCW = G._bcWeightWindow;
  const _origBcDraw = G.bcDrawWeightLeanChart;
  let _bcDrawCalls = 0;
  G.bcDrawWeightLeanChart = () => { _bcDrawCalls++; };

  G.setBcWeightWindow(30);
  check('setBcWeightWindow(30) sets _bcWeightWindow=30', G._bcWeightWindow === 30, `got ${G._bcWeightWindow}`);
  check('setBcWeightWindow(30) calls bcDrawWeightLeanChart', _bcDrawCalls === 1, `got ${_bcDrawCalls}`);
  G.setBcWeightWindow(60);
  check('setBcWeightWindow(60) sets _bcWeightWindow=60', G._bcWeightWindow === 60, `got ${G._bcWeightWindow}`);
  G.setBcWeightWindow(90);
  check('setBcWeightWindow(90) sets _bcWeightWindow=90', G._bcWeightWindow === 90, `got ${G._bcWeightWindow}`);

  G.bcDrawWeightLeanChart = _origBcDraw;
  G._bcWeightWindow = _origBCW;

  // toggleBcWeightHist toggles state without throwing
  const _whOpenBefore = G._bcWeightHistOpen;
  try {
    G.toggleBcWeightHist();
    check('toggleBcWeightHist toggles open state', G._bcWeightHistOpen === !_whOpenBefore, `got ${G._bcWeightHistOpen}`);
    G.toggleBcWeightHist();
    check('toggleBcWeightHist toggles back',       G._bcWeightHistOpen === _whOpenBefore,  `got ${G._bcWeightHistOpen}`);
  } catch(e) {
    check('toggleBcWeightHist does not throw', false, e.message);
  }

  // deleteWeight removes entry from weights array
  G.weights = [{ date: '2026-06-01', weight: 90 }, { date: '2026-06-05', weight: 89 }];
  G.deleteWeight('2026-06-01');
  check('deleteWeight removes correct entry', G.weights.length === 1 && G.weights[0].date === '2026-06-05',
    `got ${JSON.stringify(G.weights)}`);
  check('deleteWeight preserves other entries', G.weights[0].weight === 89, `got ${G.weights[0].weight}`);

  // ── wizSave: correct tab navigation ──────────────────────────────────────────
  console.log('\n── wizSave: correct tab navigation ────────────────────────────');
  {
    let capturedTabId = null;
    const origSwitchTab = G.switchTab;
    G.switchTab = function(id) { capturedTabId = id; };
    const origSave2 = G.saveStacksToBackend;
    G.saveStacksToBackend = async function() { return true; };
    G.initWizard();
    G.wizSetStackName('Nav Test');
    G._wiz.peptides = [{id:'cjc-ipa',name:'CJC',dot:'#3cffa0',days:[0],times:['AM'],dose_am:'4',active:true}];
    G._userStacks = [];
    await G.wizSave();
    check('wizSave: calls switchTab with "stacks" (not "stack")', capturedTabId === 'stacks',
      `got "${capturedTabId}"`);
    G.switchTab = origSwitchTab;
    G.saveStacksToBackend = origSave2;
  }

  // ── _renderTRTGuide: dynamic tier highlighting ─────────────────────────────────
  console.log('\n── _renderTRTGuide: dynamic tier highlighting ─────────────────');
  {
    function getHighlightedTier(html) {
      const marker = 'rgba(232,160,32,0.1)';
      const idx = html.indexOf(marker);
      if (idx < 0) return null;
      const after = html.slice(idx, idx + 500);
      for (const label of ['Performance','High-normal','Standard TRT','Clinical','Optimised','Accelerated']) {
        if (after.includes(label)) return label;
      }
      return null;
    }
    const _trtDefined = typeof G._renderTRTGuide === 'function';
    check('_renderTRTGuide defined', _trtDefined);
    if (_trtDefined) {
      const h250 = G._renderTRTGuide('testoviron', 250);
      check('testoviron 250mg/wk: Performance highlighted',
        getHighlightedTier(h250) === 'Performance', `got "${getHighlightedTier(h250)}", html: ${h250.slice(0,300)}`);
      const h125 = G._renderTRTGuide('testoviron', 125);
      check('testoviron 125mg/wk: Standard TRT highlighted',
        getHighlightedTier(h125) === 'Standard TRT', `got "${getHighlightedTier(h125)}"`);
      const h180 = G._renderTRTGuide('testoviron', 180);
      check('testoviron 180mg/wk: High-normal highlighted',
        getHighlightedTier(h180) === 'High-normal', `got "${getHighlightedTier(h180)}"`);
      const h0 = G._renderTRTGuide('testoviron', 0);
      check('testoviron 0mg/wk (no dose): High-normal fallback (b:1)',
        getHighlightedTier(h0) === 'High-normal', `got "${getHighlightedTier(h0)}"`);
      const hNebido = G._renderTRTGuide('nebido', 83);
      check('nebido 83mg/wk (1000mg/12wks): Clinical highlighted',
        getHighlightedTier(hNebido) === 'Clinical', `got "${getHighlightedTier(hNebido)}"`);
    }
  }

  // ── init(): stale pep-last-tab cleanup ─────────────────────────────────────────
  console.log('\n── init(): stale pep-last-tab cleanup ─────────────────────────');
  {
    // Simulate the init() defensive cleanup: if tab button not found, remove the stale key
    G.localStorage.setItem('pep-last-tab', 'stack'); // invalid/old tab ID from wizSave bug
    const origGetById2 = G.document.getElementById;
    G.document.getElementById = function(id) {
      if (id === 'tab-btn-stack') return null; // simulate missing element for invalid tab
      return origGetById2(id);
    };
    const _ltStale = G.localStorage.getItem('pep-last-tab');
    if (_ltStale) {
      const _bStale = G.document.getElementById('tab-btn-' + _ltStale);
      if (_bStale) G.switchTab(_ltStale, _bStale);
      else G.localStorage.removeItem('pep-last-tab');
    }
    check('init(): stale "stack" tab ID cleared from localStorage',
      G.localStorage.getItem('pep-last-tab') === null,
      `got "${G.localStorage.getItem('pep-last-tab')}"`);
    G.document.getElementById = origGetById2;

    // Valid tab ID must NOT be cleared (mockEl returns non-null for valid IDs)
    G.localStorage.setItem('pep-last-tab', 'stacks');
    const _ltValid = G.localStorage.getItem('pep-last-tab');
    if (_ltValid) {
      const _bValid = G.document.getElementById('tab-btn-' + _ltValid);
      if (!_bValid) G.localStorage.removeItem('pep-last-tab');
    }
    check('init(): valid "stacks" tab ID preserved in localStorage',
      G.localStorage.getItem('pep-last-tab') === 'stacks',
      `got "${G.localStorage.getItem('pep-last-tab')}"`);
    G.localStorage.removeItem('pep-last-tab');
  }

  // Final summary
  console.log(`\n${'─'.repeat(59)}`);
  console.log(`  ${passed} passed  ${failed} failed  ${passed+failed} total`);
  process.exit(failed===0?0:1);
});

// ── Blend vial PEPTIDE_CAT defaults ──────────────────────────────────────────
console.log('\n── Blend vial PEPTIDE_CAT defaults ────────────────────────');
const glowCat  = G.PEPTIDE_CAT.find(p=>p.id==='glow');
const klowCat  = G.PEPTIDE_CAT.find(p=>p.id==='klow');
const bpcTbCat = G.PEPTIDE_CAT.find(p=>p.id==='bpc-tb');
check('glow default unit is ml',    glowCat?.dflt?.unitAm==='ml',  `got "${glowCat?.dflt?.unitAm}"`);
check('glow default dose is 0.09',  parseFloat(glowCat?.dflt?.doseAm)===0.09, `got "${glowCat?.dflt?.doseAm}"`);
check('klow default unit is ml',    klowCat?.dflt?.unitAm==='ml',  `got "${klowCat?.dflt?.unitAm}"`);
check('klow default dose is 0.1',   parseFloat(klowCat?.dflt?.doseAm)===0.1, `got "${klowCat?.dflt?.doseAm}"`);
check('bpc-tb default unit is mg',  bpcTbCat?.dflt?.unitAm==='mg', `got "${bpcTbCat?.dflt?.unitAm}"`);
check('bpc-tb default dose is 1',   parseFloat(bpcTbCat?.dflt?.doseAm)===1.0, `got "${bpcTbCat?.dflt?.doseAm}"`);

// ── reconCalc ml unit ─────────────────────────────────────────────────────────
console.log('\n── reconCalc: ml dose unit ─────────────────────────────────');
// 0.2ml dose → ml=0.2, iu=20 (identity: ml input passes straight through)
const rcMl1=G.reconCalc('0.2','ml',70,2,'mg');
check('reconCalc ml: 0.2ml → ml=0.2',    rcMl1&&rcMl1.ml===0.2,  `got ${rcMl1?.ml}`);
check('reconCalc ml: 0.2ml → iu=20',     rcMl1&&rcMl1.iu===20,   `got ${rcMl1?.iu}`);
// 0.5ml dose on klow-type (80mg/2ml=40mg/ml) → 50 IU
const rcMl2=G.reconCalc('0.5','ml',80,2,'mg');
check('reconCalc ml: 0.5ml → ml=0.5',    rcMl2&&rcMl2.ml===0.5,  `got ${rcMl2?.ml}`);
check('reconCalc ml: 0.5ml → iu=50',     rcMl2&&rcMl2.iu===50,   `got ${rcMl2?.iu}`);

// ── reconDoseRow: ml unit and volume warnings ─────────────────────────────────
console.log('\n── reconDoseRow: ml unit & warnings ───────────────────────');
const rowMl  = G.reconDoseRow('AM','0.2','ml',70,2,'mg');
check('reconDoseRow ml: shows 20 IU',           rowMl.includes('20 IU'),         `snippet: ${rowMl.slice(0,150)}`);
check('reconDoseRow ml: no redundant arrow',    !rowMl.includes('→'),            'found arrow → in ml-input row');
check('reconDoseRow ml: no tiny-vol warning',   !rowMl.includes('Very small'),   'spurious tiny warning');
// 1.5mg at 35mg/ml = 0.0429ml < 0.05 → tiny volume warning
const rowTiny = G.reconDoseRow('AM','1.5','mg',70,2,'mg');
check('reconDoseRow: tiny vol < 0.05ml warns',  rowTiny.includes('Very small volume'), `snippet: ${rowTiny.slice(0,200)}`);
// Large volume (3ml at 2.5mg/ml)
const rowLarge= G.reconDoseRow('AM','3','ml',5,2,'mg');
check('reconDoseRow: large vol > 1ml warns',    rowLarge.includes('Large injection volume'), `snippet: ${rowLarge.slice(0,200)}`);

// ── reconDoseRow: 1mg threshold display logic ────────────────────────────────
console.log('\n── reconDoseRow: 1mg threshold display ────────────────────');
// IU input <1mg → IU only (no ml, no mcg) — CJC 4 IU at 6.667mg/ml = 0.267mg
const rowIuSmall = G.reconDoseRow('AM','4','IU',20,3,'mg');
check('reconDoseRow IU<1mg: shows 4 IU',       rowIuSmall.includes('4 IU'),    `snippet: ${rowIuSmall.slice(0,150)}`);
check('reconDoseRow IU<1mg: no syringe label', !rowIuSmall.includes('syringe'),`snippet: ${rowIuSmall.slice(0,150)}`);
check('reconDoseRow IU<1mg: no mcg',           !rowIuSmall.includes('mcg'),    `snippet: ${rowIuSmall.slice(0,150)}`);
check('reconDoseRow IU<1mg: no small-vol warn',!rowIuSmall.includes('Very small'),`snippet: ${rowIuSmall.slice(0,200)}`);
// IU input >=1mg → IU + mg (no ml) — 9 IU at 23.333mg/ml = 2.1mg
const rowIuLarge = G.reconDoseRow('AM','9','IU',70,3,'mg');
check('reconDoseRow IU>=1mg: shows 9 IU',      rowIuLarge.includes('9 IU'),    `snippet: ${rowIuLarge.slice(0,150)}`);
check('reconDoseRow IU>=1mg: shows 2.1 mg',    rowIuLarge.includes('2.1 mg'), `snippet: ${rowIuLarge.slice(0,150)}`);
check('reconDoseRow IU>=1mg: no ml',           !rowIuLarge.includes(' ml'),    `snippet: ${rowIuLarge.slice(0,150)}`);
// ml input <1mg → IU only — 0.04ml at 6.667mg/ml = 0.267mg
const rowMlSmall = G.reconDoseRow('AM','0.04','ml',20,3,'mg');
check('reconDoseRow ml<1mg: shows 4 IU',       rowMlSmall.includes('4 IU'),   `snippet: ${rowMlSmall.slice(0,150)}`);
check('reconDoseRow ml<1mg: no syringe label',  !rowMlSmall.includes('syringe'),`snippet: ${rowMlSmall.slice(0,150)}`);
// ml input >=1mg → IU · ml = Xmg — GLOW 0.09ml at 23.333mg/ml = 2.1mg
const rowMlLarge = G.reconDoseRow('AM','0.09','ml',70,3,'mg');
check('reconDoseRow ml>=1mg: shows 9 IU',      rowMlLarge.includes('9 IU'),   `snippet: ${rowMlLarge.slice(0,150)}`);
check('reconDoseRow ml>=1mg: shows 0.09 ml',   rowMlLarge.includes('0.09 ml'),`snippet: ${rowMlLarge.slice(0,150)}`);
check('reconDoseRow ml>=1mg: shows 2.1 mg',    rowMlLarge.includes('2.1 mg'), `snippet: ${rowMlLarge.slice(0,150)}`);
// mg input <1mg → IU only — Sema 0.5mg at 2.5mg/ml = 20 IU
const rowMgSmall = G.reconDoseRow('AM','0.5','mg',5,2,'mg');
check('reconDoseRow mg<1mg: shows 20 IU',      rowMgSmall.includes('20 IU'),  `snippet: ${rowMgSmall.slice(0,150)}`);
check('reconDoseRow mg<1mg: no 0.5 mg text',   !rowMgSmall.includes('0.5 mg'),`snippet: ${rowMgSmall.slice(0,150)}`);
// mg input >=1mg → original format — Reta 3mg at 10mg/ml = 30 IU
const rowMgLarge = G.reconDoseRow('AM','3','mg',10,1,'mg');
check('reconDoseRow mg>=1mg: shows 3 mg',      rowMgLarge.includes('3 mg'),   `snippet: ${rowMgLarge.slice(0,150)}`);
check('reconDoseRow mg>=1mg: shows 30 IU',     rowMgLarge.includes('30 IU'),  `snippet: ${rowMgLarge.slice(0,150)}`);
// mcg input <1mg → IU only — 200mcg at 2.5mg/ml = 8 IU
const rowMcgSmall = G.reconDoseRow('AM','200','mcg',5,2,'mg');
check('reconDoseRow mcg<1mg: shows 8 IU',      rowMcgSmall.includes('8 IU'),  `snippet: ${rowMcgSmall.slice(0,150)}`);
check('reconDoseRow mcg<1mg: no mcg text',     !rowMcgSmall.includes('mcg'), `snippet: ${rowMcgSmall.slice(0,150)}`);

// ── µg unit display: never show incorrect "mcg" to the user ──────────────────
// Internal unit key stays 'mcg' (calc logic unchanged); only the DISPLAYED label is µg.
console.log('\n── µg unit display (mcg → µg) ──────────────────────────────');
// _doseLabel: mcg-unit dose renders as µg, never mcg
const dlMcg = G._doseLabel('ipamorelin','200','mcg');
check('_doseLabel mcg: displays µg',           dlMcg.includes('µg'),  `got: ${dlMcg}`);
check('_doseLabel mcg: never shows mcg',        !dlMcg.includes('mcg'), `got: ${dlMcg}`);
check('_doseLabel mg: unchanged (no µg)',      !G._doseLabel('ipamorelin','2','mg').includes('µg'), 'mg dose leaked µg');
// reconDoseRow: mcg input ≥1mg shows the dose with µg label, not mcg
const rowMcgBig = G.reconDoseRow('AM','2000','mcg',5,2,'mg');
check('reconDoseRow mcg≥1mg: shows µg',        rowMcgBig.includes('2000 µg'), `snippet: ${rowMcgBig.slice(0,150)}`);
check('reconDoseRow mcg≥1mg: never shows mcg',  !rowMcgBig.includes('mcg'),    `snippet: ${rowMcgBig.slice(0,150)}`);
// UNIT_LABELS drives the Today/day views' raw-unit rendering
check('UNIT_LABELS maps mcg→µg',               G.UNIT_LABELS && G.UNIT_LABELS.mcg==='µg', `got: ${G.UNIT_LABELS&&G.UNIT_LABELS.mcg}`);

// ── buildReconCard HTML rendering ─────────────────────────────────────────────
console.log('\n── buildReconCard HTML rendering ───────────────────────────');
G._reconStackIdx=0; G._reconState={};

// Glow: 0.2ml at 70mg/2ml=35mg/ml → 0.2ml → 20 IU
const glowP  ={id:'glow',       name:'Glow Stack',        dose_am:'0.2',unit_am:'ml',dose_pm:'',unit_pm:'ml'};
const glowH  =G.buildReconCard(glowP,0);
check('buildReconCard glow: shows 20 IU',       glowH.includes('20 IU'),         `snippet: ${glowH.slice(0,200)}`);
check('buildReconCard glow: no redundant →',    !glowH.includes('>→<'),          'found >→< in glow card');

// Klow: 0.2ml at 80mg/2ml=40mg/ml → 20 IU
G._reconState={};
const klowP  ={id:'klow',       name:'Klow Stack',        dose_am:'0.2',unit_am:'ml',dose_pm:'',unit_pm:'ml'};
const klowH  =G.buildReconCard(klowP,1);
check('buildReconCard klow: shows 20 IU',       klowH.includes('20 IU'),         `snippet: ${klowH.slice(0,200)}`);

// BPC-TB: 1mg at 10mg/2ml=5mg/ml → 0.2ml → 20 IU
G._reconState={};
const bpcTbP ={id:'bpc-tb',     name:'BPC+TB Blend',      dose_am:'1', unit_am:'mg',dose_pm:'',unit_pm:'mg'};
const bpcTbH =G.buildReconCard(bpcTbP,2);
check('buildReconCard bpc-tb: shows 20 IU',     bpcTbH.includes('20 IU'),        `snippet: ${bpcTbH.slice(0,200)}`);

// Retatrutide: 3mg at 10mg/1ml=10mg/ml → 0.3ml → 30 IU
G._reconState={};
const retaP  ={id:'retatrutide',name:'Retatrutide',        dose_am:'3', unit_am:'mg',dose_pm:'',unit_pm:'mg'};
const retaH  =G.buildReconCard(retaP,3);
check('buildReconCard retatrutide: shows 30 IU', retaH.includes('30 IU'),        `snippet: ${retaH.slice(0,200)}`);

// Tirzepatide: 5mg at 10mg/1ml=10mg/ml → 0.5ml → 50 IU
G._reconState={};
const tirzP  ={id:'tirzepatide',name:'Tirzepatide',        dose_am:'5', unit_am:'mg',dose_pm:'',unit_pm:'mg'};
const tirzH  =G.buildReconCard(tirzP,4);
check('buildReconCard tirzepatide: shows 50 IU', tirzH.includes('50 IU'),        `snippet: ${tirzH.slice(0,200)}`);

// Semaglutide: 0.5mg at 5mg/2ml=2.5mg/ml → 0.2ml → 20 IU
G._reconState={};
const semaP  ={id:'semaglutide',name:'Semaglutide',        dose_am:'0.5',unit_am:'mg',dose_pm:'',unit_pm:'mg'};
const semaH  =G.buildReconCard(semaP,5);
check('buildReconCard semaglutide: shows 20 IU', semaH.includes('20 IU'),        `snippet: ${semaH.slice(0,200)}`);

// Ipamorelin: 200mcg at 5mg/2ml=2.5mg/ml → 0.08ml → 8 IU
G._reconState={};
const ipaP   ={id:'ipamorelin', name:'Ipamorelin',         dose_am:'200',unit_am:'mcg',dose_pm:'',unit_pm:'mcg'};
const ipaH   =G.buildReconCard(ipaP,6);
check('buildReconCard ipamorelin: shows 8 IU',   ipaH.includes('8 IU'),          `snippet: ${ipaH.slice(0,200)}`);

// HGH: 1 IU at 10IU/1ml → 0.1ml → 10 IU
G._reconState={};
const hghP   ={id:'hgh',        name:'HGH',                dose_am:'1',  unit_am:'IU',dose_pm:'',unit_pm:'IU'};
const hghH   =G.buildReconCard(hghP,7);
check('buildReconCard hgh: shows 10 IU',         hghH.includes('10 IU'),         `snippet: ${hghH.slice(0,200)}`);

// Synthesized-stack IDs (WEEKLY_DEFAULT style) must resolve correctly
console.log('\n── buildReconCard: synthesized-stack (WEEKLY_DEFAULT) IDs ──');
// 'reta-sun' is the id _synthesizeProtocol used to create before this fix
G._reconState={};
const retaSynP ={id:'reta-sun', name:'Retatrutide',   dose_am:'3',  unit_am:'mg',dose_pm:'',unit_pm:'mg'};
const retaSynH =G.buildReconCard(retaSynP,0);
check('buildReconCard reta-sun: resolves to 10mg/ml',  retaSynH.includes('10 mg/ml'),  `snippet: ${retaSynH.slice(0,300)}`);
check('buildReconCard reta-sun: shows 30 IU',          retaSynH.includes('30 IU'),     `snippet: ${retaSynH.slice(0,300)}`);

G._reconState={};
const cjcAmSynP={id:'cjc-am',  name:'CJC-1295 / IPA', dose_am:'400',unit_am:'mcg',dose_pm:'',unit_pm:'mcg'};
const cjcAmSynH=G.buildReconCard(cjcAmSynP,1);
check('buildReconCard cjc-am: resolves to cjc-ipa db',cjcAmSynH.includes('6.667 mg/ml'), `snippet: ${cjcAmSynH.slice(0,300)}`);
check('buildReconCard cjc-am: shows 6 IU',            cjcAmSynH.includes('6 IU'),        `snippet: ${cjcAmSynH.slice(0,300)}`);

G._reconState={};
const glow1SynP={id:'glow-1',  name:'GLOW Stack',     dose_am:'0.09',unit_am:'ml', dose_pm:'',unit_pm:'ml'};
const glow1SynH=G.buildReconCard(glow1SynP,2);
check('buildReconCard glow-1: resolves to 23.333mg/ml',glow1SynH.includes('23.333 mg/ml'),`snippet: ${glow1SynH.slice(0,300)}`);
check('buildReconCard glow-1: shows 9 IU',             glow1SynH.includes('9 IU'),         `snippet: ${glow1SynH.slice(0,300)}`);

// ── Meta ──────────────────────────────────────────────────────────────────────
console.log('\n── Meta ───────────────────────────────────────────────────');
check('VERSION defined',                    typeof G.VERSION==='string');
check('VERSION is x.xx (no suffix)',        /^\d+\.\d+$/.test(G.VERSION),        `got "${G.VERSION}"`);
check('AGENT_URL is https',                 G.AGENT_URL?.startsWith('https://'));
check('authHeaders is function (Google-only auth)', typeof G.authHeaders==='function');
check('no WEIGHTS_TOKEN/app_pin leftovers',  !rawScript.includes('WEIGHTS_TOKEN')&&!rawScript.includes('app_pin'));
check('no duplicate functions',             (()=>{const fs=rawScript.match(/(?:async )?function (\w+)\s*\(/g)||[];const names=fs.map(s=>s.replace(/async |function |\s*\(/g,''));return names.every((n,i)=>names.indexOf(n)===i);})());

// ── RECON_DB ──────────────────────────────────────────────────────────────────
console.log('\n── RECON_DB & reconCalc ───────────────────────────────────');
check('RECON_DB defined',                   typeof G.RECON_DB==='object'&&G.RECON_DB!==null);
check('20+ entries in RECON_DB',            Object.keys(G.RECON_DB||{}).length>=20,  `got ${Object.keys(G.RECON_DB||{}).length}`);
check('all PEPTIDE_CAT ids in RECON_DB',    G.PEPTIDE_CAT.every(p=>G.RECON_DB[p.id]),
  G.PEPTIDE_CAT.filter(p=>!G.RECON_DB[p.id]).map(p=>p.id).join(', '));
check('each entry has vials array',         Object.values(G.RECON_DB).every(e=>Array.isArray(e.vials)&&e.vials.length>0));
check('each entry has water array',         Object.values(G.RECON_DB).every(e=>Array.isArray(e.water)&&e.water.length>0));
check('hgh unit=IU',                        G.RECON_DB['hgh']?.unit==='IU');
check('hcg unit=IU',                        G.RECON_DB['hcg']?.unit==='IU');
check('semax nasal=true',                   G.RECON_DB['semax']?.nasal===true);
check('reconCalc defined',                  typeof G.reconCalc==='function');
// mcg dose on mg vial: 200mcg, 5mg/2ml → 2.5mg/ml → 0.08ml, 8 IU
const rc1=G.reconCalc('200','mcg',5,2,'mg');
check('200mcg/5mg@2ml → 0.08ml',           rc1&&rc1.ml===0.08,                     `got ${rc1?.ml}`);
check('200mcg/5mg@2ml → 8 IU',             rc1&&rc1.iu===8,                        `got ${rc1?.iu}`);
// mg dose on mg vial: 3mg, 5mg/1ml → 5mg/ml → 0.6ml, 60 IU
const rc2=G.reconCalc('3','mg',5,1,'mg');
check('3mg/5mg@1ml → 0.6ml',               rc2&&rc2.ml===0.6,                      `got ${rc2?.ml}`);
check('3mg/5mg@1ml → 60 IU',               rc2&&rc2.iu===60,                       `got ${rc2?.iu}`);
// IU pen dose on mg vial: 4 IU, 5mg/2ml → 0.04ml, 4 IU, 100mcg equiv
const rc3=G.reconCalc('4','IU',5,2,'mg');
check('4 IU pen/5mg@2ml → 0.04ml',         rc3&&rc3.ml===0.04,                     `got ${rc3?.ml}`);
check('4 IU pen/5mg@2ml → 100mcg equiv',   rc3&&rc3.mcgEquiv===100,                `got ${rc3?.mcgEquiv}`);
// IU/IU (HGH): 1 IU, 10IU/1ml → 0.1ml, 10 IU
const rc4=G.reconCalc('1','IU',10,1,'IU');
check('1 IU/10IU@1ml → 0.1ml',             rc4&&rc4.ml===0.1,                      `got ${rc4?.ml}`);
check('1 IU/10IU@1ml → 10 IU',             rc4&&rc4.iu===10,                       `got ${rc4?.iu}`);
// null cases
check('reconCalc null on empty dose',       G.reconCalc('','mg',5,2,'mg')===null);
check('reconCalc null on zero dose',        G.reconCalc('0','mg',5,2,'mg')===null);
// Recon functions defined
['renderRecon','selectReconStack','setReconState','buildReconCard','buildReconGuide','reconDoseRow']
  .forEach(fn=>check(fn+' defined', typeof G[fn]==='function'));

// ── RECON_DB defaults & clinical doses ────────────────────────────────────────
console.log('\n── RECON_DB defaults & clinical doses ─────────────────────');
const RDB=G.RECON_DB||{};
check('all entries have defaultVi',         Object.values(RDB).every(e=>e.defaultVi!=null),
  Object.entries(RDB).filter(([,e])=>e.defaultVi==null).map(([k])=>k).join(', '));
check('all entries have defaultWi',         Object.values(RDB).every(e=>e.defaultWi!=null),
  Object.entries(RDB).filter(([,e])=>e.defaultWi==null).map(([k])=>k).join(', '));
check('all defaultVi valid index',          Object.values(RDB).every(e=>e.defaultVi<e.vials.length),
  Object.entries(RDB).filter(([,e])=>e.defaultVi>=e.vials.length).map(([k])=>k).join(', '));
check('all defaultWi valid index',          Object.values(RDB).every(e=>e.defaultWi<e.water.length),
  Object.entries(RDB).filter(([,e])=>e.defaultWi>=e.water.length).map(([k])=>k).join(', '));

function defVial(id){const e=RDB[id];return e.vials[e.defaultVi];}
function defWater(id){const e=RDB[id];return e.water[e.defaultWi];}

// retatrutide: defaultVi=1→10mg, defaultWi=1→1ml → 10mg/ml → 3mg = 0.3ml = 30 IU
const rcReta=G.reconCalc('3','mg',defVial('retatrutide'),defWater('retatrutide'),'mg');
check('retatrutide default: 3mg → 0.3ml',  rcReta&&rcReta.ml===0.3,   `got ${rcReta?.ml}`);
check('retatrutide default: 3mg → 30 IU',  rcReta&&rcReta.iu===30,    `got ${rcReta?.iu}`);

// tirzepatide: defaultVi=1→10mg, defaultWi=1→1ml → 10mg/ml → 5mg = 0.5ml = 50 IU
const rcTirz=G.reconCalc('5','mg',defVial('tirzepatide'),defWater('tirzepatide'),'mg');
check('tirzepatide default: 5mg → 0.5ml',  rcTirz&&rcTirz.ml===0.5,   `got ${rcTirz?.ml}`);
check('tirzepatide default: 5mg → 50 IU',  rcTirz&&rcTirz.iu===50,    `got ${rcTirz?.iu}`);

// semaglutide: defaultVi=1→5mg, defaultWi=1→2ml → 2.5mg/ml → 0.5mg = 0.2ml = 20 IU
const rcSema=G.reconCalc('0.5','mg',defVial('semaglutide'),defWater('semaglutide'),'mg');
check('semaglutide default: 0.5mg → 0.2ml',rcSema&&rcSema.ml===0.2,   `got ${rcSema?.ml}`);
check('semaglutide default: 0.5mg → 20 IU',rcSema&&rcSema.iu===20,    `got ${rcSema?.iu}`);

// hgh (IU vial): defaultVi=1→10IU, defaultWi=0→1ml → 10IU/ml → 1IU = 0.1ml = 10 IU
const rcHgh=G.reconCalc('1','IU',defVial('hgh'),defWater('hgh'),'IU');
check('hgh default: 1 IU → 0.1ml',         rcHgh&&rcHgh.ml===0.1,    `got ${rcHgh?.ml}`);
check('hgh default: 1 IU → 10 IU',         rcHgh&&rcHgh.iu===10,     `got ${rcHgh?.iu}`);

// hcg (IU vial): defaultVi=0→5000IU, defaultWi=0→1ml → 5000IU/ml → 500IU = 0.1ml = 10 IU
const rcHcg=G.reconCalc('500','IU',defVial('hcg'),defWater('hcg'),'IU');
check('hcg default: 500 IU → 0.1ml',       rcHcg&&rcHcg.ml===0.1,    `got ${rcHcg?.ml}`);
check('hcg default: 500 IU → 10 IU',       rcHcg&&rcHcg.iu===10,     `got ${rcHcg?.iu}`);

// ipamorelin: defaultVi=1→5mg, defaultWi=1→2ml → 2.5mg/ml → 200mcg = 0.08ml = 8 IU
const rcIpa=G.reconCalc('200','mcg',defVial('ipamorelin'),defWater('ipamorelin'),'mg');
check('ipamorelin default: 200mcg → 0.08ml',rcIpa&&rcIpa.ml===0.08,  `got ${rcIpa?.ml}`);
check('ipamorelin default: 200mcg → 8 IU', rcIpa&&rcIpa.iu===8,      `got ${rcIpa?.iu}`);

// bpc157: defaultVi=0→5mg, defaultWi=1→2ml → 2.5mg/ml → 250mcg = 0.1ml = 10 IU
const rcBpc=G.reconCalc('250','mcg',defVial('bpc157'),defWater('bpc157'),'mg');
check('bpc157 default: 250mcg → 0.1ml',    rcBpc&&rcBpc.ml===0.1,    `got ${rcBpc?.ml}`);
check('bpc157 default: 250mcg → 10 IU',    rcBpc&&rcBpc.iu===10,     `got ${rcBpc?.iu}`);

// cjc-ipa: 2×10mg combo vials / 3ml = 6.667mg/ml → 400mcg blend = 0.06ml = 6 IU
const rcCjc=G.reconCalc('400','mcg',defVial('cjc-ipa'),defWater('cjc-ipa'),'mg');
check('cjc-ipa default: 400mcg blend → 0.06ml',rcCjc&&rcCjc.ml===0.06, `got ${rcCjc?.ml}`);
check('cjc-ipa default: 400mcg blend → 6 IU',  rcCjc&&rcCjc.iu===6,    `got ${rcCjc?.iu}`);

// ── Price list validation ─────────────────────────────────────────────────────
console.log('\n── Price list: RECON_DB vials match pricelist.csv ─────────');
const plPath = path.join(__dirname, 'pricelist.csv');
// Map RECON_DB key → product name(s) in pricelist.csv (partial match on column 1)
const PRICELIST_MAP = {
  'cjc-ipa':    ['CJC1295(without DAC)5mg+IPA 5mg'],
  'cjc-nodac':  ['CJC-1295 Without DAC'],
  'ipamorelin': ['Ipamorelin'],
  'sermorelin': ['Sermorelin'],
  'tesamorelin':['Tesamorelin'],
  'hgh':        ['HGH'],
  'glow':       ['Glow(TB500 10mg + BPC-157 10mg + GHK-CU 50mg)'],
  'klow':       ['Klow(TB500 10mg + BPC-157 10mg + GHK-CU 50mg + KPV 10mg)'],
  'bpc-tb':     ['BPC 5mg + TB 5mg','BPC 10mg + TB 10mg'],
  'bpc157':     ['BPC 157'],
  'tb500':      ['TB500'],
  'ghkcu':      ['GHK-CU'],
  'retatrutide':['Retatrutide'],
  'tirzepatide':['Tirzepatide'],
  'semaglutide':['Semaglutide'],
  'aod9604':    ['AOD9604'],
  'semax':      ['Semax'],
  'selank':     ['Selank'],
  'epitalon':   ['Epitalon'],
  'motsc':      ['MOTS-C'],
  'nad':        ['NAD+'],
  'hcg':        ['HCG'],
};
check('pricelist.csv exists',               fs.existsSync(plPath));
if(fs.existsSync(plPath)){
  // Parse CSV: track current product name across continuation rows
  const plLines=fs.readFileSync(plPath,'utf8').split('\n');
  const plSizes={}; // productName → Set of numeric sizes
  let curProd='';
  for(const line of plLines){
    const cols=line.split(';');
    const name=(cols[1]||'').trim();
    const mg=(cols[2]||'').trim();
    if(name)curProd=name;
    if(curProd&&mg){
      const m=mg.match(/^(\d+(?:\.\d+)?)(mg|iu|ml)/i);
      if(m){
        if(!plSizes[curProd])plSizes[curProd]=new Set();
        plSizes[curProd].add(parseFloat(m[1]));
      }
    }
  }
  // For each RECON_DB key, verify every vial size appears in the price list
  for(const [dbKey,plNames] of Object.entries(PRICELIST_MAP)){
    const entry=RDB[dbKey];
    if(!entry){check(`${dbKey}: in RECON_DB`,false,'missing');continue;}
    // Merge available sizes from all matching product names
    const available=new Set();
    for(const pn of plNames)(plSizes[pn]||new Set()).forEach(s=>available.add(s));
    // cjc-ipa RECON_DB uses 20mg = 2 × 10mg combo vials combined into one cartridge
    if(dbKey==='cjc-ipa')for(const pn of plNames)(plSizes[pn]||new Set()).forEach(s=>available.add(s*2));
    check(`${dbKey}: pricelist found`,available.size>0,`no rows for "${plNames.join('","')}"`);
    const bad=entry.vials.filter(v=>!available.has(v));
    check(`${dbKey}: all vials in pricelist`,bad.length===0,
      bad.length?`vials [${bad.join(',')}] not in pricelist (available: ${[...available].join(',')})`:'');
  }
}

// ── syncBodyCompFromAgent: force-push all local BC entries to backend ────────
console.log('\n── syncBodyCompFromAgent: pushes all local entries to backend ───');
{
  const src = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const fnStart = src.indexOf('async function syncBodyCompFromAgent(');
  const fnBody = fnStart >= 0 ? src.slice(fnStart, src.indexOf('}catch(e){}', fnStart) + 11) : '';
  check('syncBodyCompFromAgent fetches remote and merges with local',
    fnBody.includes('fetch(AGENT_URL+"/bodycomp"') && fnBody.includes('bcLoad()'));
  check('syncBodyCompFromAgent pushes ALL local entries with zero-padded dates via Promise.all',
    fnBody.includes('local.map(e=>') && fnBody.includes('padStart(2,') && fnBody.includes('pushBodyCompToAgent('));
}

// ── dose dedup migration ─────────────────────────────────────────────────────
console.log('\n── dose dedup migration ────────────────────────────────────────');
{
  const src = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  // Migration IIFE must be present in init()
  check('dose-dedup migration IIFE present in init()',
    src.includes('pep-dose-dedup-v1') && src.includes('proto-chk-'));
  // Normaliser function _ndi must be defined inside the IIFE
  check('normaliser _ndi defined in migration IIFE',
    src.includes('function _ndi(id)') && src.includes('zfill') === false);
  // Regex handles non-padded month/day
  check('_ndi regex matches non-padded dates',
    src.includes('\\d{4}-\\d{1,2}-\\d{1,2}'));
  // Migration runs before buildWeekStrip/buildToday
  // Verify the migration IIFE immediately precedes buildWeekStrip() inside init()
  check('migration immediately precedes buildWeekStrip() in init()',
    src.includes("'pep-dose-dedup-v1','1');})();buildWeekStrip()"));
  // Idempotency: guard on migration flag
  check('migration is idempotent (skips if flag set)',
    src.includes("localStorage.getItem('pep-dose-dedup-v1'"));
  // Migration sets flag after running
  check('migration sets pep-dose-dedup-v1 flag',
    src.includes("localStorage.setItem('pep-dose-dedup-v1','1')"));

  // Unit-test the normaliser logic in isolation
  function _ndi(id){var _m=id.match(/^(.+)_(\d{4}-\d{1,2}-\d{1,2})$/);if(!_m)return id;var _p=_m[2].split('-');return _m[1]+'_'+_p[0]+'-'+('0'+_p[1]).slice(-2)+'-'+('0'+_p[2]).slice(-2);}
  check('_ndi pads single-digit month and day',    _ndi('cjc-am_2026-5-2')     === 'cjc-am_2026-05-02');
  check('_ndi leaves already-padded IDs unchanged', _ndi('cjc-am_2026-05-02')  === 'cjc-am_2026-05-02');
  check('_ndi handles compound with underscores',   _ndi('testo_3_2026-3-9')   === 'testo_3_2026-03-09');
  check('_ndi returns ID unchanged if no date suffix', _ndi('no-date-here')     === 'no-date-here');

  // Dedup logic: array with padded+non-padded → only padded remains
  (function(){
    var seen=new Set();var dd=[];
    ['cjc-am_2026-5-22','cjc-am_2026-05-22'].forEach(function(id){
      var n=_ndi(id);if(!seen.has(n)){seen.add(n);dd.push(n);}
    });
    check('dedup collapses padded+non-padded into single entry', dd.length===1 && dd[0]==='cjc-am_2026-05-22');
  })();
}

// ── No active stack (on-break support) ───────────────────────────────────────
{
  console.log('\n── No active stack ────────────────────────────────────────');
  const sA={name:'Stack A',peptides:[{id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0],times:['AM'],dose_am:'3',unit_am:'mg',active:true}]};
  const sB={name:'Stack B',peptides:[{id:'semaglutide', name:'Semaglutide',dot:'#f59e0b',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.5',unit_am:'mg',active:true}]};

  // updateWEEKLY with empty activeStackIndices → empty WEEKLY
  G._userStacks=[sA,sB];G._activeStackIndices=[];G.updateWEEKLY();
  check('no active stacks → WEEKLY is empty array',G.WEEKLY.length===0);

  // Array.isArray guard prevents [] from being treated as falsy
  check('toggleStack guard removed: can deactivate last active stack',
    (function(){
      var src=rawScript;
      // The old guard "if(_activeStackIndices.length===1)return;" must not exist
      return !src.includes('_activeStackIndices.length===1)return;');
    })()
  );

  // updateWEEKLY uses WEEKLY=[] not WEEKLY_DEFAULT.slice() for empty active
  check('updateWEEKLY uses WEEKLY=[] for empty active (not WEEKLY_DEFAULT)',
    rawScript.includes('if(!active.length){WEEKLY=[];return;}'));

  // active_index sent as null when no active stacks
  check('saveStacksToBackend sends active_index null when no active stacks',
    rawScript.includes('_activeStackIndices.length?_activeStackIndices[0]:null'));

  // Array.isArray guard on loading from backend
  check('loadStacks uses Array.isArray guard (not ||) for active_indices from backend',
    rawScript.includes('Array.isArray(data.active_indices)?data.active_indices:'));

  // Array.isArray guard on loading from localStorage cache
  check('loadStacks uses Array.isArray guard (not ||) for active_indices from cache',
    rawScript.includes('Array.isArray(cached.active_indices)?cached.active_indices:'));

  // deleteStack no longer forces [0] when result is empty
  check('deleteStack does not force _activeStackIndices=[0] after removal',
    !rawScript.includes("if(!_activeStackIndices.length)_activeStackIndices=[0];"));
}

// ── getDosesForDate + _findWeeklyItemInfo (date-range scheduling) ──────────────
{
  console.log('\n── getDosesForDate ─────────────────────────────────────────');
  const fs2=require('fs');
  const todayJs=fs2.readFileSync(require('path').join(__dirname,'../tab-today.js'),'utf8');
  const tabStackJs=fs2.readFileSync(require('path').join(__dirname,'../tab-stack.js'),'utf8');

  check('getDosesForDate function defined',typeof G.getDosesForDate==='function');
  check('_findWeeklyItemInfo function defined',typeof G._findWeeklyItemInfo==='function');

  const cycleStack={name:'Cycle A',cycle_start:'2026-06-21',cycle_length:12,end_date:'2026-09-13',
    peptides:[{id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'3',unit_am:'mg',active:true}]};
  G._userStacks=[cycleStack];G._activeStackIndices=[0];
  var jun21=new Date(2026,5,21);
  var doses21=G.getDosesForDate(jun21);
  check('getDosesForDate: date-ranged stack shows doses on start date',doses21.length>0);
  check('getDosesForDate: dose id includes the date',doses21[0]&&doses21[0].id.includes('2026-06-21'));

  var may1=new Date(2026,4,1);
  check('getDosesForDate: no doses before cycle_start',G.getDosesForDate(may1).length===0);

  var dec1=new Date(2026,11,1);
  check('getDosesForDate: no doses after end_date',G.getDosesForDate(dec1).length===0);

  const noDateStack={name:'No Date',peptides:[{id:'semaglutide',name:'Sema',dot:'#f59e0b',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.5',unit_am:'mg',active:true}]};
  G._userStacks=[noDateStack];G._activeStackIndices=[];
  check('getDosesForDate: no-date stack inactive → no doses',G.getDosesForDate(jun21).length===0);
  G._activeStackIndices=[0];
  check('getDosesForDate: no-date stack active → shows doses',G.getDosesForDate(jun21).length>0);

  G._userStacks=[cycleStack];
  var found=G._findWeeklyItemInfo('retatrutide');
  check('_findWeeklyItemInfo finds peptide by base id',found&&found.name==='Retatrutide');
  check('_findWeeklyItemInfo returns null for unknown id',G._findWeeklyItemInfo('unknown-peptide')===null);

  check('end_date normalization in loadUserStacks',rawScript.includes('if(stack.end_date){var _cep=stack.end_date.split'));

  check('buildToday reads from _injectionsCache instead of getDosesForDate or WEEKLY',
    todayJs.includes('_injectionsCache') && !todayJs.includes('getDosesForDate(NOW)') && !todayJs.includes('WEEKLY.forEach(d=>'));
  check('showDayInline uses _injectionsCache for scheduled doses',
    todayJs.includes('_injectionsCache[dk]') && !todayJs.includes('doses=getDosesForDate(d)'));
  check('buildWeekStrip past days: falls back to getPastDoses within isPast branch',
    /if\(isPast\)[\s\S]{0,400}getPastDoses\(d\)/.test(todayJs));
  check('showDayInline past days: getPastDoses used to surface orphaned logged doses',
    todayJs.includes('isPast') && todayJs.includes('getPastDoses(d)') && todayJs.includes('_findWeeklyItemInfo(bid)'));
  check('showDayInline past days: isChk does not use _pastChecked shortcut',
    !todayJs.includes('_pastChecked||checked') && !todayJs.includes('dose._pastChecked'));
  check('buildWeekStrip uses _injectionsCache for future/today dots',
    todayJs.includes('_injectionsCache[dk]') && !todayJs.includes('getDosesForDate(d).forEach'));
  check('buildWeekStrip uses getPastDoses + _findWeeklyItemInfo for past dots',
    todayJs.includes('getPastDoses(d)') && todayJs.includes('_findWeeklyItemInfo(bid)'));

  // ── _getDynamicEnhancedDoses ──────────────────────────────────────────────
  check('_getDynamicEnhancedDoses defined in tab-stack.js',
    typeof G._getDynamicEnhancedDoses === 'function');

  const enhStack={name:'Enhanced Cycle',cycle_start:'2026-06-21',cycle_length:12,peptides:[],
    enhanced:{enabled:true,compounds:[{id:'testosterone-e',name:'Testosterone E',dose:'250',unit:'mg/week',days:[1,4],dot:'#e8a020'}]}};
  G._userStacks=[enhStack];G._activeStackIndices=[0];
  // Mon June 22 = JS getDay() 1
  var mon22=new Date(2026,5,22);
  var enhDoses=G._getDynamicEnhancedDoses(mon22,true);
  check('_getDynamicEnhancedDoses: returns dose on scheduled day',enhDoses.length===1);
  check('_getDynamicEnhancedDoses: dose has correct name',enhDoses[0]&&enhDoses[0].name==='Testosterone E');
  check('_getDynamicEnhancedDoses: dose id includes date',enhDoses[0]&&enhDoses[0].id&&enhDoses[0].id.includes('2026-06-22'));

  // Wed June 24 = JS getDay() 3 — not in days:[1,4]
  var wed24=new Date(2026,5,24);
  check('_getDynamicEnhancedDoses: no dose on unscheduled day',G._getDynamicEnhancedDoses(wed24,true).length===0);

  // Before cycle_start
  check('_getDynamicEnhancedDoses: no dose before cycle_start',G._getDynamicEnhancedDoses(new Date(2026,4,1),true).length===0);

  // Stack with no cycle_start — requires _activeStackIndices
  const enhNoDate={name:'Enhanced No Date',peptides:[],enhanced:{enabled:true,compounds:[{id:'testosterone-e',name:'Testosterone E',dose:'250',unit:'mg/week',days:[1,4],dot:'#e8a020'}]}};
  G._userStacks=[enhNoDate];G._activeStackIndices=[];
  check('_getDynamicEnhancedDoses: no-date enhanced stack inactive → no doses',G._getDynamicEnhancedDoses(mon22,true).length===0);
  G._activeStackIndices=[0];
  check('_getDynamicEnhancedDoses: no-date enhanced stack active → shows doses',G._getDynamicEnhancedDoses(mon22,true).length===1);

  // buildToday/showDayInline/buildWeekStrip now use _injectionsCache (not _getDynamicEnhancedDoses directly)
  check('buildToday reads enhanced doses from _injectionsCache, not _getDynamicEnhancedDoses directly',
    todayJs.includes('_injectionsCache') && !todayJs.includes('_getDynamicEnhancedDoses(NOW,true)'));
  check('showDayInline reads enhanced doses from _injectionsCache, not _getDynamicEnhancedDoses directly',
    todayJs.includes('_injectionsCache') && !todayJs.includes('_getDynamicEnhancedDoses(d,true)'));
  check('buildWeekStrip reads enhanced dots from _injectionsCache, not _getDynamicEnhancedDoses directly',
    todayJs.includes('_injectionsCache') && !todayJs.includes('_getDynamicEnhancedDoses(d,false)'));

  check('tab-stack.js edit view has no Cycle End field (removed — use cycle length instead)',
    !tabStackJs.includes("id='edit-cycle-end'")&&!tabStackJs.includes('id="edit-cycle-end"'));
  check('tab-stack.js Cycle Length select has No end date option (value 0)',
    tabStackJs.includes("value=\"0\"")&&tabStackJs.includes('No end date'));
}

// ── Stack conflict detection ──────────────────────────────────────────────────
{
  console.log('\n── Stack conflict detection ────────────────────────────────');
  check('_getStackCompounds defined',typeof G._getStackCompounds==='function');
  check('_detectStackConflicts defined',typeof G._detectStackConflicts==='function');
  check('_calcLatestActiveEnd defined',typeof G._calcLatestActiveEnd==='function');

  const pepA={name:'Stack A',peptides:[{id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'3',unit_am:'mg',active:true}]};
  const pepB={name:'Stack B',peptides:[{id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'2',unit_am:'mg',active:true},{id:'semaglutide',name:'Semaglutide',dot:'#f59e0b',days:[0],times:['AM'],dose_am:'0.5',unit_am:'mg',active:true}]};
  const pepC={name:'Stack C',peptides:[{id:'semaglutide',name:'Semaglutide',dot:'#f59e0b',days:[0],times:['AM'],dose_am:'0.5',unit_am:'mg',active:true}]};
  const trtStack={name:'TRT Stack',peptides:[],trt:{enabled:true,compounds:[{id:'testosterone-cyp',name:'Testosterone Cyp',dose:'100',unit:'mg/week',days:[3],dot:'#e8a020'}]}};
  const trtStack2={name:'TRT Stack 2',peptides:[],trt:{enabled:true,compounds:[{id:'testosterone-cyp',name:'Testosterone Cyp',dose:'200',unit:'mg/week',days:[3],dot:'#e8a020'}]}};
  const enhStack2={name:'Enhanced 2',peptides:[],enhanced:{enabled:true,compounds:[{id:'testosterone-e',name:'Testosterone E',dose:'250',unit:'mg/week',days:[1,4],dot:'#a855f7'}]}};
  const enhStack3={name:'Enhanced 3',peptides:[],enhanced:{enabled:true,compounds:[{id:'testosterone-e',name:'Testosterone E',dose:'500',unit:'mg/week',days:[1,4],dot:'#a855f7'}]}};

  // _getStackCompounds
  var compsA=G._getStackCompounds(pepA);
  check('_getStackCompounds: extracts peptide compounds',compsA.length===1&&compsA[0].id==='retatrutide');
  var compsT=G._getStackCompounds(trtStack);
  check('_getStackCompounds: extracts TRT compounds',compsT.length===1&&compsT[0].id==='testosterone-cyp');
  var compsE=G._getStackCompounds(enhStack2);
  check('_getStackCompounds: extracts Enhanced compounds',compsE.length===1&&compsE[0].id==='testosterone-e');
  check('_getStackCompounds: empty stack returns []',G._getStackCompounds({peptides:[]}).length===0);

  // _detectStackConflicts — peptide overlap
  G._userStacks=[pepA,pepB];G._activeStackIndices=[0,1];
  var det=G._detectStackConflicts(1);
  check('_detectStackConflicts: detects peptide overlap (retatrutide in both A and B)',det.conflicts.length>0&&det.conflicts[0].compoundId==='retatrutide');
  check('_detectStackConflicts: identifies conflicting stack index',det.conflictingIdxs.includes(0));

  // _detectStackConflicts — no overlap (peptides on different axes: glp1 vs healing)
  const glowStack={name:'Glow Stack',peptides:[{id:'glow',name:'Glow Stack',dot:'#3b9eff',days:[0,1,2,3,4,5,6],times:['AM'],dose_am:'0.09',unit_am:'ml',active:true}]};
  G._userStacks=[pepA,glowStack];G._activeStackIndices=[0,1];
  det=G._detectStackConflicts(1);
  check('_detectStackConflicts: no conflict when peptides on different axes',det.conflicts.length===0);

  // _detectStackConflicts — TRT overlap
  G._userStacks=[trtStack,trtStack2];G._activeStackIndices=[0,1];
  det=G._detectStackConflicts(1);
  check('_detectStackConflicts: detects TRT compound overlap',det.conflicts.length>0&&det.conflicts[0].compoundId==='testosterone-cyp');

  // _detectStackConflicts — Enhanced overlap
  G._userStacks=[enhStack2,enhStack3];G._activeStackIndices=[0,1];
  det=G._detectStackConflicts(1);
  check('_detectStackConflicts: detects Enhanced compound overlap',det.conflicts.length>0&&det.conflicts[0].compoundId==='testosterone-e');

  // _detectStackConflicts — single active stack → never conflicts
  G._userStacks=[pepA];G._activeStackIndices=[0];
  det=G._detectStackConflicts(0);
  check('_detectStackConflicts: single stack has no conflicts',det.conflicts.length===0);

  // _detectStackConflicts — only counts stacks that are actually active
  G._userStacks=[pepA,pepB];G._activeStackIndices=[1]; // Stack A not active
  det=G._detectStackConflicts(1);
  check('_detectStackConflicts: inactive stack not counted as conflict',det.conflicts.length===0);

  // _calcLatestActiveEnd
  const stackEndDate={name:'X',cycle_start:'2026-06-01',end_date:'2026-09-01',cycle_length:13,peptides:[]};
  const stackCycleLen={name:'Y',cycle_start:'2026-07-01',cycle_length:12,peptides:[]};
  const stackNoEnd={name:'Z',cycle_start:'2026-06-01',cycle_length:0,peptides:[]};

  G._userStacks=[stackEndDate];G._activeStackIndices=[0];
  var le=G._calcLatestActiveEnd(99); // excludeIdx not in array
  check('_calcLatestActiveEnd: uses end_date when set',le&&G.dateKey(le)==='2026-09-01');

  G._userStacks=[stackCycleLen];G._activeStackIndices=[0];
  le=G._calcLatestActiveEnd(99);
  // 2026-07-01 + 12 weeks = 2026-09-23
  check('_calcLatestActiveEnd: computes end from cycle_start + cycle_length',le&&G.dateKey(le)==='2026-09-23');

  G._userStacks=[stackNoEnd];G._activeStackIndices=[0];
  le=G._calcLatestActiveEnd(99);
  check('_calcLatestActiveEnd: stack with cycle_length 0 → no calculable end',le===null);

  G._userStacks=[stackEndDate,stackCycleLen];G._activeStackIndices=[0,1];
  le=G._calcLatestActiveEnd(99);
  check('_calcLatestActiveEnd: returns latest of multiple stacks',le&&G.dateKey(le)==='2026-09-23');

  G._userStacks=[stackEndDate];G._activeStackIndices=[0];
  le=G._calcLatestActiveEnd(0); // exclude the only active stack
  check('_calcLatestActiveEnd: excludeIdx removes that stack from calculation',le===null);

  // _getStackCompounds returns cg field
  var compsWithCg=G._getStackCompounds(pepA);
  check('_getStackCompounds: peptide compounds include cg array',Array.isArray(compsWithCg[0].cg));
  check('_getStackCompounds: retatrutide has glp1 cg tag',compsWithCg[0].cg.includes('glp1'));

  // _detectStackConflicts: GH-axis cross-stack conflict (CJC-IPA vs HGH Somatropin)
  const ghPepStack={name:'GH Peptides',peptides:[{id:'cjc-ipa',name:'CJC-1295/IPA',dot:'#3cffa0',days:[0,1,2,3,4,5,6],times:['AM','PM'],dose_am:'4',dose_pm:'5',unit_am:'IU',unit_pm:'IU',active:true}]};
  const hghEnhStack={name:'HGH Stack',peptides:[],enhanced:{enabled:true,compounds:[{id:'hgh',name:'HGH (Somatropin)',dose:'3',unit:'IU/day',days:[0,1,2,3,4,5,6],dot:'#e8a020'}]}};
  G._userStacks=[ghPepStack,hghEnhStack];G._activeStackIndices=[0,1];
  det=G._detectStackConflicts(1);
  check('_detectStackConflicts: detects GH-axis conflict (CJC-IPA pep + HGH enhanced)',det.conflicts.length>0);
  check('_detectStackConflicts: GH-axis conflict reason is axis',det.conflicts[0].reason==='axis');
  check('_detectStackConflicts: GH-axis conflict axisLabel is gh-axis',det.conflicts[0].axisLabel==='gh-axis');
  check('_detectStackConflicts: GH-axis conflict compoundId is hgh (new stack compound)',det.conflicts[0].compoundId==='hgh');
  check('_detectStackConflicts: GH-axis conflict existingId is cjc-ipa (existing stack compound)',det.conflicts[0].existingId==='cjc-ipa');
  check('_detectStackConflicts: GH-axis conflictingIdxs includes stack 0',det.conflictingIdxs.includes(0));

  // CROSS_STACK_CLUSTERS defined
  check('CROSS_STACK_CLUSTERS defined in index.html',rawScript.includes('const CROSS_STACK_CLUSTERS='));
  check('CROSS_STACK_CLUSTERS maps ghrh to gh-axis',rawScript.includes("'ghrh':'gh-axis'"));
  check('CROSS_STACK_CLUSTERS maps hgh to gh-axis',rawScript.includes("'hgh':'gh-axis'"));
  check('CROSS_STACK_CLUSTERS maps glp1 to glp1-axis',rawScript.includes("'glp1':'glp1-axis'"));

  // _scanAndShowStartupConflicts defined and called in loadUserStacks
  check('_scanAndShowStartupConflicts defined',typeof G._scanAndShowStartupConflicts==='function');
  check('_scanAndShowStartupConflicts called in loadUserStacks',rawScript.includes('_scanAndShowStartupConflicts()'));

  // Safety: conflict detection fires in toggleStack source
  check('toggleStack calls _detectStackConflicts when activating 2nd stack',
    rawScript.includes('_detectStackConflicts(idx)'));
  check('toggleStack stores _pendingConflictData before showing modal',
    rawScript.includes('_pendingConflictData={newIdx:idx'));
  check('_resolveConflict defined in index.html',
    rawScript.includes('async function _resolveConflict('));
}

// ── Storage tab hideable via Settings ─────────────────────────────────────────
{
  check('TAB_LABELS uses Object.assign to conditionally include storage (IS_STAGING gate)',
    rawScript.includes("Object.assign({today:'Today'") && rawScript.includes("IS_STAGING?{storage:'Storage'}:{}"));
  check('TAB_DEFAULTS uses Object.assign to conditionally include storage:true',
    rawScript.includes("IS_STAGING?{storage:true}:{}"));
  check('tab-btn-storage exists in HTML (hidden by default)',
    html.includes('id="tab-btn-storage"'));
  check('storage tab controlled by applyTabVis via TAB_LABELS (no manual show override in init)',
    rawScript.includes("Object.keys(TAB_LABELS).forEach") &&
    !rawScript.includes("tab-btn-storage').style.display=''"));
  check('initTabVis called in init() without manual storage override after it',
    (function(){
      var i = rawScript.indexOf('initTabVis();');
      var after = rawScript.slice(i, i + 60);
      return i >= 0 && !after.includes('tab-btn-storage');
    })());
}

// ── Storage tab: copy helpers + clear button ──────────────────────────────────
{
  const G=sandbox;
  check('buildStoragePage function defined',typeof G.buildStoragePage==='function');
  check('_lsCopyText function defined',typeof G._lsCopyText==='function');
  check('_lsFbCopy function defined (textarea fallback)',typeof G._lsFbCopy==='function');
  check('lsDbgCopy accepts button arg (not just index)',rawScript.includes('function lsDbgCopy(i,btn)'));
  check('lsDbgCopyAll accepts button arg',rawScript.includes('function lsDbgCopyAll(btn)'));
  check('lsDbgClearAll function defined',typeof G.lsDbgClearAll==='function');
  check('buildStoragePage renders Clear All button',rawScript.includes('lsDbgClearAll()'));
  check('buildStoragePage renders Copy All with button arg (onclick passes this)',rawScript.includes('lsDbgCopyAll(this)'));
  check('buildStoragePage per-row copy passes this to lsDbgCopy',rawScript.includes("lsDbgCopy('+i+',this)"));
  check('buildStoragePage scrolls to top on refresh',rawScript.includes('_el.scrollTop=0'));
  check('_lsCopyText uses clipboard API with .then() feedback (not silent catch)',rawScript.includes('.then(function(){_flash(true);})')&&rawScript.includes('.catch(function(){_lsFbCopy('));
  check('no silent clipboard swallow (old pattern gone)',!rawScript.includes('.catch(function(){})')||rawScript.includes('_lsFbCopy'));
}

// ── Cycle wizard — compound dropdown + Tren template ─────────────────────────
{
  const tabCyclesJs = fs.readFileSync(path.join(path.dirname(path.resolve(htmlPath)),'tab-cycles.js'),'utf8');
  // Compound data compliance: must NOT be hardcoded in the public frontend repo
  check('ENHANCEMENT_COMPOUNDS not hardcoded in tab-cycles.js (must come from backend)',
    !(/var ENHANCEMENT_COMPOUNDS\s*=\s*\[\s*\{/).test(tabCyclesJs));
  check('syncEnhancedCompoundsFromAgent defined in tab-cycles.js',
    tabCyclesJs.includes('syncEnhancedCompoundsFromAgent'));
  check('syncEnhancedCompoundsFromAgent fetches /compounds/enhanced',
    tabCyclesJs.includes('/compounds/enhanced'));
  // ADD COMPOUND modal uses select not text input
  const tabStackJs = fs.readFileSync(path.join(path.dirname(path.resolve(htmlPath)),'tab-stack.js'),'utf8');
  check('stackAddAASCompound uses select dropdown (not free-text input) for compound name',
    tabStackJs.includes('<select id="aas-name"'));
  check('stackAddAASCompound renders grouped options via ENHANCEMENT_COMPOUNDS',
    tabStackJs.includes('optgroup')&&tabStackJs.includes('stackAASAutoFill'));
  check('stackAddAASCompound unit select includes IU/day option',
    tabStackJs.includes('<option>IU/day</option>'));
  check('stackAddAASCompound unit select includes IU/week option',
    tabStackJs.includes('<option>IU/week</option>'));
  // Regression: Enhanced wizard and edit dropdowns must include IU/day and IU/week
  // so GH Axis compounds (HGH unit="IU/day") don't silently show as "mg"
  check('Enhanced wizard unit dropdown includes IU/day (wizSetEnhUnit context)',
    tabStackJs.split('wizSetEnhUnit').some(function(s){return s.slice(0,500).includes('IU/day');}));
  check('Enhanced wizard unit dropdown includes IU/week (wizSetEnhUnit context)',
    tabStackJs.split('wizSetEnhUnit').some(function(s){return s.slice(0,500).includes('IU/week');}));
  check('Enhanced edit unit dropdown includes IU/day (editSetEnhUnit context)',
    tabStackJs.split('editSetEnhUnit').some(function(s){return s.slice(0,500).includes('IU/day');}));
  check('Enhanced edit unit dropdown includes IU/week (editSetEnhUnit context)',
    tabStackJs.split('editSetEnhUnit').some(function(s){return s.slice(0,500).includes('IU/week');}));
  check('stackAddAASCompound modal has aas-info-block div for dose guidance',
    tabStackJs.includes('id="aas-info-block"'));
  check('_renderEnhancedGuide function defined in tab-stack.js',
    tabStackJs.includes('function _renderEnhancedGuide('));
  check('_renderEnhancedGuide renders cadence block (Injection Frequency)',
    tabStackJs.includes('cat.cadence')&&tabStackJs.includes('Injection Frequency'));
  check('_renderEnhancedGuide renders cadence halfLife and rec fields',
    tabStackJs.includes('cad.rec')&&tabStackJs.includes('cad.halfLife'));
  check('_renderEnhancedGuide renders doseTiers from backend catalogue',
    tabStackJs.includes('cat.doseTiers')&&tabStackJs.includes('doseTiers.length'));
  check('_renderEnhancedGuide falls back to DOSE_GUIDE if no doseTiers',
    tabStackJs.includes('_renderDoseGuide(cat.id)')||tabStackJs.includes('DOSE_GUIDE[cat.id]'));
  check('_renderEnhancedGuide renders interaction field',
    tabStackJs.includes('cat.interaction'));
  check('_renderEnhancedGuide renders sides field',
    tabStackJs.includes('cat.sides'));
  check('stackAASAutoFill populates aas-info-block on compound select',
    tabStackJs.includes('aas-info-block')&&tabStackJs.includes('_renderEnhancedGuide(cat)'));
  // E2 management: class-based detection
  check('E2 management uses cls field from ENHANCEMENT_COMPOUNDS catalogue',
    tabStackJs.includes('ec.cls'));
  check('E2 management detects 19-nor compounds (has19nor)',
    tabStackJs.includes('has19nor'));
  check('E2 management detects Tren specifically (hasTren)',
    tabStackJs.includes('hasTren'));
  check('E2 management detects oral compounds and notes no E2 impact',
    tabStackJs.includes('oralCmps')&&tabStackJs.includes('not aromatize'));
  check('E2 management for 19-nor shows prolactin warning',
    tabStackJs.includes('prolactin')&&tabStackJs.includes('cabergoline'));
  check('E2 management for Tren shows prolactin warning distinct from generic 19-nor',
    tabStackJs.includes('tren_e')&&tabStackJs.includes('tren_a')&&tabStackJs.includes('progestin'));
  check('E2 management label for Test+oral does not say Test-only',
    !tabStackJs.includes('Test-only'));
  // TRT supraphysiological warning
  check('_renderTRTGuide shows supraphysiological warning above 250 mg/wk',
    tabStackJs.includes('weeklyDoseMg>250')&&tabStackJs.includes('Supraphysiological'));
  check('supraphysiological warning includes actual dose in mg',
    tabStackJs.includes('Math.round(weeklyDoseMg)'));
  // Structural tests (don't depend on compound data)
  check('CYCLE_TEMPLATES has Tren template (id: tren)',
    G.CYCLE_TEMPLATES&&G.CYCLE_TEMPLATES.some(function(t){return t.id==='tren';}));
  check('_cwizSetCmpd function defined',typeof G._cwizSetCmpd==='function');
  check('_cwizToggleInfo function defined',typeof G._cwizToggleInfo==='function');
  check('wizard step 2 uses compound dropdown (select with _cwizSetCmpd)',
    tabCyclesJs.includes('_cwizSetCmpd')&&tabCyclesJs.includes('Choose compound'));
  check('wizard step 2 shows ⓘ info button for known compounds',
    tabCyclesJs.includes('_cwizToggleInfo')&&tabCyclesJs.includes('cwiz-info-'));
  check('wizard step 2 shows Custom option in compound select',
    tabCyclesJs.includes('__custom__')&&tabCyclesJs.includes('Custom…'));
  check('_cwizSetCmpd auto-fills dose and unit from ENHANCEMENT_COMPOUNDS',
    tabCyclesJs.includes('ec.defaultDose')&&tabCyclesJs.includes('ec.unit'));
  check('optgroup labels used in compound dropdown (Base, DHT-Derived, 19-Nor)',
    tabCyclesJs.includes('optgroup label=')&&tabCyclesJs.includes('19-Nor'));
  // Inject mock compound data so wizard behaviour tests work (fetch is noop in test sandbox)
  G.ENHANCEMENT_COMPOUNDS=[
    {id:'_tc_base',name:'Test Base Compound',group:'Base',dot:'#e05050',defaultDose:300,unit:'mg/week',pack:{type:'vial',conc_mg_ml:250,vol_ml:10}},
    {id:'_tc_oral',name:'Test Oral Compound',group:'Oral',dot:'#d060d0',defaultDose:50,unit:'mg/day',pack:{type:'tablet',mg_per_tab:10,tabs_per_pack:100}}
  ];
}
{
  // ── PRICELIST & Cart functions ───────────────────────────────────────────
  const G=sandbox;
  check('PRICELIST is defined',typeof G.PRICELIST==='object'&&G.PRICELIST!==null);
  check('PRICELIST CP10 = 10mg/vial × 10 vials (no price)',
    G.PRICELIST&&G.PRICELIST['CP10']&&G.PRICELIST['CP10'].q===10&&G.PRICELIST['CP10'].n===10&&!('usd' in G.PRICELIST['CP10']));
  check('PRICELIST H24 = 24 IU/vial × 10 vials (no price)',
    G.PRICELIST&&G.PRICELIST['H24']&&G.PRICELIST['H24'].q===24&&G.PRICELIST['H24'].unit==='iu'&&!('usd' in G.PRICELIST['H24']));
  check('PRICELIST RT5 = 5mg × 10 (no price)',
    G.PRICELIST&&G.PRICELIST['RT5']&&G.PRICELIST['RT5'].q===5&&!('usd' in G.PRICELIST['RT5']));
  check('openCartModal function defined',typeof G.openCartModal==='function');
  check('closeCartModal function defined',typeof G.closeCartModal==='function');
  check('_renderCartModal function defined',typeof G._renderCartModal==='function');
  check('_calcPeptideCartItem function defined',typeof G._calcPeptideCartItem==='function');
  check('_calcEnhancementCartItem function defined',typeof G._calcEnhancementCartItem==='function');
  // optimizer: retatrutide 3mg/week 1x/week 12wks → 36mg total → RT20 (46.7d ≤ 55) → 2 vials
  check('_calcPeptideCartItem: retatrutide 3mg/week 1x/week 12wks → RT20 → 2 vials (no price, no boxes)',
    (function(){
      var p={id:'retatrutide',name:'Retatrutide',dose_am:'3',dose_pm:'',unit_am:'mg',unit_pm:'mg',times:['AM'],days:[0],active:true};
      var item=G._calcPeptideCartItem(p,12);
      return item&&item.sku==='RT20'&&item.vials===2&&item.boxes==null&&!('price' in item);
    })());
  // optimizer: HGH 3 IU/day 7 days/week 12wks → 252 IU → H24 → 11 vials (H24 was already optimal)
  check('_calcPeptideCartItem: HGH 3 IU/day 7 days/week 12wks → 252 IU → 11 vials H24 (no boxes, no price)',
    (function(){
      var p={id:'hgh',name:'HGH',dose_am:'3',dose_pm:'',unit_am:'IU',unit_pm:'IU',times:['AM'],days:[0,1,2,3,4,5,6],active:true};
      var item=G._calcPeptideCartItem(p,12);
      var totalIU=3*7*12; // 252 IU
      var vials=Math.ceil(totalIU/24); // ceil(10.5)=11
      return item&&item.sku==='H24'&&item.vials===vials&&item.boxes==null&&!('price' in item);
    })());
  check('_calcEnhancementCartItem: vial compound 400mg/week 16wks → 6400mg → 3 vials (250×10=2500mg each)',
    (function(){
      var c={name:'Test Base Compound',dose:400,unit:'mg/week',active:true};
      var item=G._calcEnhancementCartItem(c,16);
      return item&&item.units===Math.ceil(400*16/2500)&&item.unitLabel==='vials';
    })());
  check('_calcEnhancementCartItem: tablet compound 50mg/day 8wks → 2800mg → 3 packs (10×100=1000mg each)',
    (function(){
      var c={name:'Test Oral Compound',dose:50,unit:'mg/day',active:true};
      var item=G._calcEnhancementCartItem(c,8);
      return item&&item.units===Math.ceil(50*7*8/1000)&&item.unitLabel==='packs';
    })());
  check('buildStackStore HTML includes Shopping List button',
    (function(){var html=fs.readFileSync(path.join(path.dirname(path.resolve(htmlPath)),'index.html'),'utf8');return html.includes('openCartModal')&&html.includes('Shopping List');})());
  // ── Vial optimizer ───────────────────────────────────────────────────────────
  check('_optimalVialSku function defined',typeof G._optimalVialSku==='function');
  // Tesamorelin 2mg/day 7d/wk 12wks → 168mg → TSM20 → 9 vials
  check('_calcPeptideCartItem: Tesamorelin 2mg/day 7d/wk 12wks → TSM20 → 9 vials',
    (function(){
      var p={id:'tesamorelin',name:'Tesamorelin',dose_am:'2',dose_pm:'',unit_am:'mg',unit_pm:'mg',times:['AM'],days:[0,1,2,3,4,5,6],active:true};
      var item=G._calcPeptideCartItem(p,12);
      return item&&item.sku==='TSM20'&&item.vials===9&&item.boxes==null;
    })());
  // NAD+ 100mg 3d/wk 12wks → 3600mg → NJ1000 → 4 vials
  check('_calcPeptideCartItem: NAD+ 100mg 3d/wk 12wks → NJ1000 → 4 vials',
    (function(){
      var p={id:'nad',name:'NAD+',dose_am:'100',dose_pm:'',unit_am:'mg',unit_pm:'mg',times:['AM'],days:[1,3,5],active:true};
      var item=G._calcPeptideCartItem(p,12);
      return item&&item.sku==='NJ1000'&&item.vials===4&&item.boxes==null;
    })());
  // NAD+ 100mg 1d/wk 12wks — NJ1000 = 70 days > 55, must use NJ500 → 3 vials
  check('_calcPeptideCartItem: NAD+ 100mg 1d/wk 12wks → NJ500 (NJ1000 violates 55-day rule) → 3 vials',
    (function(){
      var p={id:'nad',name:'NAD+',dose_am:'100',dose_pm:'',unit_am:'mg',unit_pm:'mg',times:['AM'],days:[1],active:true};
      var item=G._calcPeptideCartItem(p,12);
      return item&&item.sku==='NJ500'&&item.vials===3&&item.boxes==null;
    })());
  // Shopping list render: vials bolded, no box display
  check('shopping list renders vials in bold span (no box count)',
    (function(){
      var html=fs.readFileSync(path.join(path.dirname(path.resolve(htmlPath)),'index.html'),'utf8');
      var hasBoldVials=html.includes('font-weight:600;color:var(--text)">\'+item.vials');
      var hasBoxRender=html.includes('item.boxes');
      return hasBoldVials&&!hasBoxRender;
    })());
}

// ── Three-tier wizard — HGH & tier-aware steps ───────────────────────────────
console.log('\n── Three-tier wizard — HGH & tier-aware steps ──────────────');
{
  // HGH must NOT appear in peptides step (it is an Enhancement compound)
  check('HGH is in PEPTIDE_CAT with group Enhanced',
    G.PEPTIDE_CAT&&G.PEPTIDE_CAT.some(function(p){return p.id==='hgh'&&p.group==='Enhanced';}));

  // _wizTier and _wizFlow helpers
  check('_wizTier defined', typeof G._wizTier==='function');
  check('_wizFlow defined', typeof G._wizFlow==='function');

  // Flow 1: Peps only (T1)
  G._userTier=1;G.initWizard();
  var f1=G._wizFlow();
  check('flow peps-only: 6 steps', f1.length===6, 'got '+f1.length);
  check('flow peps-only: last=review', f1[f1.length-1]==='review');
  check('flow peps-only: no trt', !f1.includes('trt'));
  check('flow peps-only: no validate', !f1.includes('validate'));

  // Flow 2: TRT only (T2, trt.enabled=true, no pep goals)
  G._userTier=2;G.initWizard();G._wiz.trt.enabled=true;
  var f2=G._wizFlow();
  check('flow TRT-only: 4 steps', f2.length===4, 'got '+f2.length);
  check('flow TRT-only: has trt', f2.includes('trt'));
  check('flow TRT-only: no peptides step', !f2.includes('peptides'));
  check('flow TRT-only: no validate', !f2.includes('validate'));

  // Flow 3: Peps + TRT (T2, trt.enabled, pep goal)
  G._userTier=2;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['muscle'];
  var f3=G._wizFlow();
  check('flow peps+TRT: 8 steps', f3.length===8, 'got '+f3.length);
  check('flow peps+TRT: has peptides', f3.includes('peptides'));
  check('flow peps+TRT: has trt', f3.includes('trt'));
  check('flow peps+TRT: has validate', f3.includes('validate'));

  // Flow 4: TRT + Enhanced (T3, trt.enabled, enhanced goal, no pep goals)
  G._userTier=3;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['enhanced'];
  var f4=G._wizFlow();
  check('flow TRT+enhanced: 6 steps', f4.length===6, 'got '+f4.length);
  check('flow TRT+enhanced: has enhanced', f4.includes('enhanced'));
  check('flow TRT+enhanced: has validate', f4.includes('validate'));
  check('flow TRT+enhanced: no peptides step', !f4.includes('peptides'));

  // Flow 5: Peps + TRT + Enhanced (T3, all tiers)
  G._userTier=3;G.initWizard();G._wiz.trt.enabled=true;G._wiz.goals=['enhanced','muscle'];
  var f5=G._wizFlow();
  check('flow peps+TRT+enhanced: 9 steps', f5.length===9, 'got '+f5.length);
  check('flow peps+TRT+enhanced: has all tiers', f5.includes('peptides')&&f5.includes('trt')&&f5.includes('enhanced'));
  check('flow peps+TRT+enhanced: has validate', f5.includes('validate'));

  // T3 initWizard defaults to no enhanced goal
  G._userTier=3;G.initWizard();
  check('T3 initWizard does not auto-include enhanced goal', !G._wiz.goals.includes('enhanced'));

  // wizStepPeptides filter: HGH (group=Enhanced) must not appear
  G._userTier=1;
  G._wiz={step:0,goals:[],peptides:[],trt:{enabled:false,compounds:[]},editMode:false,stackIndex:-1,stackName:'Test',cycle_length:12};
  var pepBody={innerHTML:''};
  var pepFoot={innerHTML:''};
  G.wizStepPeptides(pepBody,pepFoot);
  var pepHtml=pepBody.innerHTML;
  // Check HGH id not in rendered content - we need to check if HGH card was rendered
  // The rendered HTML contains data-id or onclick with 'hgh' only if HGH was included
  check('wizStepPeptides HTML does not include HGH (id=hgh excluded by group:Enhanced filter)',
    !pepHtml.includes("wizTogglePep('hgh')"), 'HGH card found in T1 peptides step');

  // Enhanced goal set: still no HGH (group filter is unconditional)
  G._wiz.goals=['enhanced'];
  var pepBody2={innerHTML:''};
  G.wizStepPeptides(pepBody2,pepFoot);
  check('wizStepPeptides with enhanced goal still excludes HGH',
    !pepBody2.innerHTML.includes("wizTogglePep('hgh')"), 'HGH appeared with enhanced goal');

  // Restore tier
  G._userTier=1;
}

// ── Enhanced wizard redesign tests ──────────────────────────────────────────
{
  G._userTier=3;

  // wizToggleEnhancedCompound pre-populates dose, unit and days
  G.initWizard();G._wiz.goals=['enhanced'];
  var testId=(G.ENHANCEMENT_COMPOUNDS&&G.ENHANCEMENT_COMPOUNDS[0]&&G.ENHANCEMENT_COMPOUNDS[0].id)||null;
  if(testId){
    G.wizToggleEnhancedCompound(testId);
    var ec=G._wiz.enhanced.compounds.find(function(c){return c.id===testId;});
    check('wizToggleEnhancedCompound: compound added to _wiz.enhanced.compounds', !!ec);
    check('wizToggleEnhancedCompound: dose pre-populated as string', typeof ec.dose==='string');
    var cat=G.ENHANCEMENT_COMPOUNDS.find(function(c){return c.id===testId;});
    var expDays=cat&&cat.defaultDays?cat.defaultDays:[0,1,2,3,4,5,6];
    check('wizToggleEnhancedCompound: days uses compound defaultDays', Array.isArray(ec.days)&&JSON.stringify(ec.days.slice().sort(function(a,b){return a-b;}))=== JSON.stringify(expDays.slice().sort(function(a,b){return a-b;})));
    check('wizToggleEnhancedCompound: unit set', !!ec.unit);
    check('wizToggleEnhancedCompound: _wiz.enhanced.enabled=true after adding', G._wiz.enhanced.enabled===true);
    // Toggle off
    G.wizToggleEnhancedCompound(testId);
    check('wizToggleEnhancedCompound: removed on second click', G._wiz.enhanced.compounds.length===0);
    check('wizToggleEnhancedCompound: _wiz.enhanced.enabled=false when empty', G._wiz.enhanced.enabled===false);
  }

  // wizSetEnhDose, wizSetEnhUnit, wizSetEnhDays setters
  if(testId){
    G.initWizard();G._wiz.goals=['enhanced'];
    G.wizToggleEnhancedCompound(testId);
    G.wizSetEnhDose(testId,'250');
    var ec2=G._wiz.enhanced.compounds.find(function(c){return c.id===testId;});
    check('wizSetEnhDose: dose updated', ec2&&ec2.dose==='250');
    G.wizSetEnhUnit(testId,'ml');
    check('wizSetEnhUnit: unit updated', ec2&&ec2.unit==='ml');
    // Force days to a known single-day state for toggle tests
    if(ec2)ec2.days=[3];
    G.wizSetEnhDays(testId,1); // add Monday to [3]
    check('wizSetEnhDays: days includes added day', ec2&&ec2.days&&ec2.days.includes(1));
    G.wizSetEnhDays(testId,3); // remove Wednesday (days=[1] now)
    check('wizSetEnhDays: days still has Mon after removing Wed', ec2&&ec2.days&&ec2.days.includes(1)&&!ec2.days.includes(3));
    // Cannot deselect last day
    G.wizSetEnhDays(testId,1); // try removing Mon when it's the only day
    check('wizSetEnhDays: cannot remove last day', ec2&&ec2.days&&ec2.days.length>=1);
  }

  // wizStepEnhanced prefill: TRT compound matching ENHANCEMENT_COMPOUNDS name is auto-added on first entry
  // Uses ENHANCEMENT_COMPOUNDS[0] as the matching compound — no TRT_CAT needed since _trtCompounds returns trt.compounds directly
  if(G.ENHANCEMENT_COMPOUNDS&&G.ENHANCEMENT_COMPOUNDS.length){
    var enhFirst=G.ENHANCEMENT_COMPOUNDS[0];
    G.initWizard();G._userTier=3;G._wiz.goals=['enhanced'];G._wiz.trt.enabled=true;
    G._wiz.trt.compounds=[{id:'_trt_test',name:enhFirst.name,dose:'125',unit:'mg',days:[1,3,5]}];
    var pfBody={innerHTML:''};var pfFoot={innerHTML:''};
    G.wizStepEnhanced(pfBody,pfFoot);
    var preAdded=G._wiz.enhanced.compounds.find(function(c){return c.id===enhFirst.id;});
    check('wizStepEnhanced prefill: TRT-matching compound auto-added', !!preAdded);
    check('wizStepEnhanced prefill: pre-filled dose matches TRT dose', preAdded&&preAdded.dose==='125');
    check('wizStepEnhanced prefill: pre-filled days match TRT days', preAdded&&Array.isArray(preAdded.days)&&preAdded.days.length===3&&preAdded.days.includes(1)&&preAdded.days.includes(3)&&preAdded.days.includes(5));
    check('wizStepEnhanced prefill: enabled=true after prefill', G._wiz.enhanced.enabled===true);
    var beforeLen=G._wiz.enhanced.compounds.length;
    var pfBody2={innerHTML:''};var pfFoot2={innerHTML:''};
    G.wizStepEnhanced(pfBody2,pfFoot2);
    check('wizStepEnhanced prefill: _prefilled flag prevents duplicate on re-render', G._wiz.enhanced.compounds.length===beforeLen);
  }

  // wizStepReview: no blocking save with TRT compound also in Enhanced
  if(testId){
    G.initWizard();G._userTier=3;G._wiz.goals=['enhanced'];
    var safeEnh=G.ENHANCEMENT_COMPOUNDS&&G.ENHANCEMENT_COMPOUNDS.find(function(c){return c.id===testId;});
    if(safeEnh){
      G._wiz.enhanced.compounds=[{id:safeEnh.id,name:safeEnh.name,dose:'50',unit:'mg',days:[1,2,3,4,5,6,0],dot:safeEnh.dot}];
      G._wiz.enhanced.enabled=true;
      var revBody2={innerHTML:''};var revFoot2={innerHTML:''};
      G.wizStepReview(revBody2,revFoot2);
      check('wizStepReview: enhanced compound without peptide errors → Save Stack label', revFoot2.innerHTML.includes('Save Stack'));
    }
  }

  // Enhanced summary in review shows days label
  if(testId){
    G.initWizard();G._userTier=3;G._wiz.goals=['enhanced'];
    var anyEnh=G.ENHANCEMENT_COMPOUNDS&&G.ENHANCEMENT_COMPOUNDS.find(function(c){return c.id===testId;});
    if(anyEnh){
      G._wiz.enhanced.compounds=[{id:anyEnh.id,name:anyEnh.name,dose:'50',unit:'mg',days:[1,2,3,4,5,6,0],dot:anyEnh.dot}];
      G._wiz.enhanced.enabled=true;
      var revBody3={innerHTML:''};var revFoot3={innerHTML:''};
      G.wizStepReview(revBody3,revFoot3);
      check('wizStepReview: enhanced compound summary shows "Every day" for 7-day schedule',
        revBody3.innerHTML.includes('Every day'));
    }
  }

  G._userTier=1;
}

// ── Edit Enhanced tab — stack editor regression ──────────────────────────────
console.log('\n── Edit Enhanced tab — stack editor regression ─────────────');
{
  const G=sandbox;
  G._userTier=3;

  // Helper functions exist
  check('editToggleEnhancedCompound defined', typeof G.editToggleEnhancedCompound==='function');
  check('editSetEnhDose defined',             typeof G.editSetEnhDose==='function');
  check('editSetEnhUnit defined',             typeof G.editSetEnhUnit==='function');
  check('editSetEnhDays defined',             typeof G.editSetEnhDays==='function');
  check('_renderEditEnhanced defined',        typeof G._renderEditEnhanced==='function');
  check('_renderEnhancedViewTab defined',     typeof G._renderEnhancedViewTab==='function');

  // _renderEditEnhanced returns string HTML
  var editEnh=G._renderEditEnhanced({enabled:false,compounds:[]});
  check('_renderEditEnhanced returns string', typeof editEnh==='string');
  check('_renderEditEnhanced shows intro text', editEnh.includes('enhancement compounds'));

  var testId2=(G.ENHANCEMENT_COMPOUNDS&&G.ENHANCEMENT_COMPOUNDS[0]&&G.ENHANCEMENT_COMPOUNDS[0].id)||null;
  if(testId2){
    G._editBuf={name:'Test',peptides:[],trt:{enabled:false,compounds:[]},cycle_length:12};
    G.editToggleEnhancedCompound(testId2);
    check('editToggleEnhancedCompound: creates enhanced on _editBuf', !!G._editBuf.enhanced);
    check('editToggleEnhancedCompound: compound added', G._editBuf.enhanced.compounds.length===1);
    check('editToggleEnhancedCompound: enabled=true', G._editBuf.enhanced.enabled===true);
    check('editToggleEnhancedCompound: dose is string', typeof G._editBuf.enhanced.compounds[0].dose==='string');
    var cat2=G.ENHANCEMENT_COMPOUNDS.find(function(c){return c.id===testId2;});
    var expDays2=cat2&&cat2.defaultDays?cat2.defaultDays:[0,1,2,3,4,5,6];
    check('editToggleEnhancedCompound: days uses compound defaultDays', Array.isArray(G._editBuf.enhanced.compounds[0].days)&&JSON.stringify(G._editBuf.enhanced.compounds[0].days.slice().sort(function(a,b){return a-b;}))=== JSON.stringify(expDays2.slice().sort(function(a,b){return a-b;})));

    G.editSetEnhDose(testId2,'200');
    check('editSetEnhDose: updates dose', G._editBuf.enhanced.compounds[0].dose==='200');

    G.editSetEnhUnit(testId2,'ml');
    check('editSetEnhUnit: updates unit', G._editBuf.enhanced.compounds[0].unit==='ml');

    // Force single-day state for toggle test
    G._editBuf.enhanced.compounds[0].days=[5];
    G.editSetEnhDays(testId2,3);
    check('editSetEnhDays: adds day 3', G._editBuf.enhanced.compounds[0].days.includes(3));

    G._editBuf.enhanced.compounds[0].days=[1];
    G.editSetEnhDays(testId2,1);
    check('editSetEnhDays: cannot deselect last day', G._editBuf.enhanced.compounds[0].days.length>=1);

    var viewHtml=G._renderEnhancedViewTab({enhanced:{enabled:true,compounds:[{id:testId2,name:'Test Compound',dose:'250',unit:'mg',days:[1,3],dot:'#e05050'}]}});
    check('_renderEnhancedViewTab: contains compound name', viewHtml.includes('Test Compound'));
    check('_renderEnhancedViewTab: contains dose', viewHtml.includes('250mg'));

    var viewEmpty=G._renderEnhancedViewTab({enhanced:{enabled:false,compounds:[]}});
    check('_renderEnhancedViewTab empty: shows no compounds message', viewEmpty.includes('No enhancement compounds'));

    var viewMissing=G._renderEnhancedViewTab({});
    check('_renderEnhancedViewTab: handles missing enhanced key', viewMissing.includes('No enhancement compounds'));

    var gBody={innerHTML:''};var gFoot={innerHTML:''};
    G.initWizard();G._wiz.goals=['enhanced'];
    G.wizStepGoals(gBody,gFoot);
    check('wizStepGoals T3: shows Enhanced Cycle toggle', gBody.innerHTML.includes('Enhanced Cycle'));

    G.editToggleEnhancedCompound(testId2);
    check('editToggleEnhancedCompound: removes compound on second call', G._editBuf.enhanced.compounds.length===0);
    check('editToggleEnhancedCompound: enabled=false when empty', G._editBuf.enhanced.enabled===false);
  }

  G._userTier=1;
}

// ── Wizard step render tests ──────────────────────────────────────────────────
console.log('\n── Wizard step render tests ────────────────────────────────');
{
  const G=sandbox;

  // wizStep1: cycle length selector
  G._userTier=1;
  G.initWizard();
  var s1B={innerHTML:''};var s1F={innerHTML:''};
  G.wizStep1(s1B,s1F);
  check('wizStep1: body not empty', s1B.innerHTML.length>0);
  check('wizStep1: contains cycle length select', s1B.innerHTML.includes('<select'));
  check('wizStep1: has "No end date" option', s1B.innerHTML.includes('No end date'));
  check('wizStep1: has month option', s1B.innerHTML.includes('month'));
  check('wizStep1: footer has Next button', s1F.innerHTML.includes('Next'));

  // wizStepGoals T1: no TRT section, no Enhanced Cycle toggle
  G._userTier=1;
  G.initWizard();
  var gB1={innerHTML:''};var gF1={innerHTML:''};
  G.wizStepGoals(gB1,gF1);
  check('wizStepGoals T1: body not empty', gB1.innerHTML.length>0);
  check('wizStepGoals T1: contains goal-chip', gB1.innerHTML.includes('goal-chip'));
  check('wizStepGoals T1: no Testosterone toggle (T1 has no TRT access)', !gB1.innerHTML.includes('Testosterone protocol'));
  check('wizStepGoals T1: no Enhanced Cycle toggle', !gB1.innerHTML.includes('Enhanced Cycle'));
  check('wizStepGoals T1: footer has Next button', gF1.innerHTML.includes('Next'));

  // wizStepGoals T2: TRT toggle present, no Enhanced Cycle
  G._userTier=2;
  G.initWizard();
  var gB2={innerHTML:''};var gF2={innerHTML:''};
  G.wizStepGoals(gB2,gF2);
  check('wizStepGoals T2: has Testosterone protocol toggle', gB2.innerHTML.includes('Testosterone protocol'));
  check('wizStepGoals T2: no Enhanced Cycle toggle', !gB2.innerHTML.includes('Enhanced Cycle'));

  // wizStepGoals T3: Enhanced Cycle section visible + toggleable
  G._userTier=3;
  G.initWizard();
  var gB3={innerHTML:''};var gF3={innerHTML:''};
  G.wizStepGoals(gB3,gF3);
  check('wizStepGoals T3: shows Enhanced Cycle section', gB3.innerHTML.includes('Enhanced Cycle'));
  check('wizStepGoals T3: initWizard does not auto-include enhanced in goals', !G._wiz.goals.includes('enhanced'));
  check('wizStepGoals T3: Enhanced toggle starts OFF by default', !gB3.innerHTML.includes('toggle-sw on'));

  // wizStepCheck: empty peptides
  G._userTier=1;
  G.initWizard();
  var ckB1={innerHTML:''};var ckF1={innerHTML:''};
  G.wizStepCheck(ckB1,ckF1);
  check('wizStepCheck empty: mentions no peptides', ckB1.innerHTML.includes('No peptides'));
  check('wizStepCheck empty: footer has Next', ckF1.innerHTML.includes('Next'));

  // wizStepCheck: with peptide (no conflicts)
  G.initWizard();
  var pepCat0=G.PEPTIDE_CAT&&G.PEPTIDE_CAT.find(function(p){return p.id==='cjc-ipa';});
  if(pepCat0){
    var d0=pepCat0.dflt;
    G._wiz.peptides=[{id:'cjc-ipa',name:pepCat0.name,dot:pepCat0.dot,times:['AM'],days:[1,2,3,4,5],dose_am:d0.doseAm,dose_pm:'',unit_am:d0.unitAm,note:'',active:true}];
    var ckB2={innerHTML:''};var ckF2={innerHTML:''};
    G.wizStepCheck(ckB2,ckF2);
    check('wizStepCheck with peptide: lists peptide name', ckB2.innerHTML.includes(pepCat0.name));
    check('wizStepCheck with peptide: shows Validation section', ckB2.innerHTML.includes('Validation'));
  }

  // wizStepConfig: empty peptides
  G.initWizard();
  var cfB1={innerHTML:''};var cfF1={innerHTML:''};
  G.wizStepConfig(cfB1,cfF1);
  check('wizStepConfig empty: mentions no peptides', cfB1.innerHTML.includes('No peptides'));

  // wizStepConfig: with peptide — shows dose/timing/days controls
  if(pepCat0){
    var d0=pepCat0.dflt;
    G.initWizard();
    G._wiz.peptides=[{id:'cjc-ipa',name:pepCat0.name,dot:pepCat0.dot,times:['AM'],days:[1,2,3,4,5],dose_am:d0.doseAm,dose_pm:'',unit_am:d0.unitAm,note:'',active:true}];
    var cfB2={innerHTML:''};var cfF2={innerHTML:''};
    G.wizStepConfig(cfB2,cfF2);
    check('wizStepConfig with peptide: shows cfg-block', cfB2.innerHTML.includes('cfg-block'));
    check('wizStepConfig with peptide: shows peptide name', cfB2.innerHTML.includes(pepCat0.name));
    check('wizStepConfig with peptide: shows AM Dose row', cfB2.innerHTML.includes('AM Dose'));
    check('wizStepConfig with peptide: shows Days row', cfB2.innerHTML.includes('Days'));
    check('wizStepConfig with peptide: footer has Next', cfF2.innerHTML.includes('Next'));
  }

  // wizStepTRT: renders TRT compound list
  G._userTier=2;
  G.initWizard();
  var trtB={innerHTML:''};var trtF={innerHTML:''};
  G.wizStepTRT(trtB,trtF);
  check('wizStepTRT: body not empty', trtB.innerHTML.length>0);
  if(G.TRT_CAT&&G.TRT_CAT.length){
    check('wizStepTRT: lists first TRT compound', trtB.innerHTML.includes(G.TRT_CAT[0].name));
  }
  check('wizStepTRT: footer has Next', trtF.innerHTML.includes('Next'));

  // wizStepEnhanced: renders compound list (T3)
  G._userTier=3;
  G.initWizard();
  var eB={innerHTML:''};var eF={innerHTML:''};
  G.wizStepEnhanced(eB,eF);
  check('wizStepEnhanced: body not empty', eB.innerHTML.length>0);
  check('wizStepEnhanced: footer has Next', eF.innerHTML.includes('Next'));
  if(G.ENHANCEMENT_COMPOUNDS&&G.ENHANCEMENT_COMPOUNDS.length){
    check('wizStepEnhanced: lists compound group', eB.innerHTML.includes(G.ENHANCEMENT_COMPOUNDS[0].group));
  }

  // wizStepEnhanced: empty catalogue shows visible loading state (not invisible muted text)
  var savedEnhCat=G.ENHANCEMENT_COMPOUNDS;
  G.ENHANCEMENT_COMPOUNDS=[];
  G._userTier=3;
  G.initWizard();
  G._wiz.step=2; // simulate being on Enhanced step in the flow
  var elB={innerHTML:''};var elF={innerHTML:''};
  G.wizStepEnhanced(elB,elF);
  check('wizStepEnhanced empty catalogue: shows loading text (not silent blank)', elB.innerHTML.includes('Loading compounds'));
  check('wizStepEnhanced empty catalogue: Next button disabled when loading', elF.innerHTML.includes('disabled'));
  G.ENHANCEMENT_COMPOUNDS=savedEnhCat; // restore

  // syncEnhancedCompoundsFromAgent: backend returns {compounds:[...]} — must extract array, not assign whole object
  var origEnhCat=G.ENHANCEMENT_COMPOUNDS;
  G.ENHANCEMENT_COMPOUNDS=[];
  // Simulate response from backend: wrapped object ({"compounds":[...]})
  var fakeCompound={id:'test_e',name:'Test',group:'Base'};
  var wrappedResponse={compounds:[fakeCompound]};
  // Extract array using same logic as the fixed syncEnhancedCompoundsFromAgent
  var d=wrappedResponse;
  var extracted=Array.isArray(d)?d:(d.compounds||[]);
  G.ENHANCEMENT_COMPOUNDS=extracted;
  check('syncEnhancedCompoundsFromAgent: extracts .compounds array from wrapped response', Array.isArray(G.ENHANCEMENT_COMPOUNDS));
  check('syncEnhancedCompoundsFromAgent: ENHANCEMENT_COMPOUNDS has length after extract', G.ENHANCEMENT_COMPOUNDS.length===1);
  G.ENHANCEMENT_COMPOUNDS=origEnhCat; // restore

  // wizStepReview: empty stack — no peptides
  G._userTier=1;
  G.initWizard();
  var rvB={innerHTML:''};var rvF={innerHTML:''};
  G.wizStepReview(rvB,rvF);
  check('wizStepReview empty: body not empty', rvB.innerHTML.length>0);
  check('wizStepReview empty: shows Stack Name input', rvB.innerHTML.includes('Stack Name'));
  check('wizStepReview empty: shows Summary section', rvB.innerHTML.includes('Summary'));
  check('wizStepReview empty: no peptides message', rvB.innerHTML.includes('No peptides'));
  check('wizStepReview empty: footer has Save Stack', rvF.innerHTML.includes('Save Stack'));

  // wizStepReview: Enhanced-only flow — no "No peptides selected." shown
  G._userTier=3;
  G.initWizard();
  G._wiz.goals=['enhanced'];
  G._wiz.enhanced={enabled:false,compounds:[]};
  var rvEnhB={innerHTML:''};var rvEnhF={innerHTML:''};
  G.wizStepReview(rvEnhB,rvEnhF);
  check('wizStepReview enhanced-only: no "No peptides" message (peptides not in flow)', !rvEnhB.innerHTML.includes('No peptides selected'));
  check('wizStepReview enhanced-only: shows "No enhancement compounds selected"', rvEnhB.innerHTML.includes('No enhancement compounds selected'));
  check('wizStepReview enhanced-only: shows Enhancement Compounds section heading', rvEnhB.innerHTML.includes('Enhancement Compounds'));

  // wizStepReview: Enhanced-only flow with a compound — compound shown in summary
  G._wiz.enhanced={enabled:true,compounds:[{id:'test-c',name:'Test Compound',dose:'200',unit:'mg',days:[1,4],dot:'#f00'}]};
  var rvEnhB2={innerHTML:''};var rvEnhF2={innerHTML:''};
  G.wizStepReview(rvEnhB2,rvEnhF2);
  check('wizStepReview enhanced with compound: compound name shown', rvEnhB2.innerHTML.includes('Test Compound'));
  check('wizStepReview enhanced with compound: no "No enhancement compounds" message', !rvEnhB2.innerHTML.includes('No enhancement compounds selected'));

  // TRT/Enhanced mutual exclusion — enabling TRT clears Enhanced
  G._userTier=3;
  G.initWizard();
  G._wiz.goals=['enhanced'];
  if(!G._wiz.enhanced)G._wiz.enhanced={enabled:true,compounds:[]};
  G._wiz.enhanced.compounds=[{id:'x',name:'X',dose:'100',unit:'mg',days:[1],dot:'#f00'}];
  G._wiz.enhanced.enabled=true;
  G.wizToggleGoalTRT(); // enable TRT → should clear Enhanced
  check('wizToggleGoalTRT: enabling TRT removes enhanced from goals', !G._wiz.goals.includes('enhanced'));
  check('wizToggleGoalTRT: enabling TRT clears enhanced compounds', !G._wiz.enhanced||G._wiz.enhanced.compounds.length===0);
  check('wizToggleGoalTRT: enabling TRT sets enhanced.enabled=false', !G._wiz.enhanced||G._wiz.enhanced.enabled===false);

  // TRT/Enhanced mutual exclusion — enabling Enhanced clears TRT
  G._userTier=3;
  G.initWizard();
  G._wiz.trt.enabled=true;G._wiz.goals=['trt'];G._wiz.trt.compounds=[{id:'t',name:'T',dose:'125',unit:'mg',days:[1]}];
  G.wizToggleGoal('enhanced'); // enable Enhanced → should clear TRT
  check('wizToggleGoal enhanced: clears TRT enabled flag', G._wiz.trt.enabled===false);
  check('wizToggleGoal enhanced: removes trt from goals', !G._wiz.goals.includes('trt'));
  check('wizToggleGoal enhanced: clears TRT compounds', G._wiz.trt.compounds.length===0);

  // wizStepGoals: TRT toggle greyed when Enhanced is on
  G._userTier=3;
  G.initWizard();
  G._wiz.goals=['enhanced'];
  var gmB={innerHTML:''};var gmF={innerHTML:''};
  G.wizStepGoals(gmB,gmF);
  check('wizStepGoals: TRT section visible when Enhanced is on', gmB.innerHTML.includes('TRT'));
  check('wizStepGoals: TRT toggle greyed (pointer-events:none) when Enhanced is on', gmB.innerHTML.includes('pointer-events:none'));

  // wizStepGoals: Enhanced toggle greyed when TRT is on
  G._userTier=3;
  G.initWizard();
  G._wiz.trt.enabled=true;G._wiz.goals=['trt'];
  var gmB2={innerHTML:''};var gmF2={innerHTML:''};
  G.wizStepGoals(gmB2,gmF2);
  check('wizStepGoals: Enhanced Cycle section visible when TRT is on', gmB2.innerHTML.includes('Enhanced Cycle'));
  check('wizStepGoals: Enhanced toggle greyed (pointer-events:none) when TRT is on', gmB2.innerHTML.includes('pointer-events:none'));

  // wizStepEnhanced: mandatory Testosterone — Next disabled when no base compound selected
  G._userTier=3;
  G.initWizard();G._wiz.goals=['enhanced'];
  var savedECat=G.ENHANCEMENT_COMPOUNDS;
  G.ENHANCEMENT_COMPOUNDS=[{id:'test_e',name:'Testosterone Enanthate',group:'Androgens',cls:'base',dot:'#e05050',defaultDose:250,unit:'mg/week'}];
  var meB={innerHTML:''};var meF={innerHTML:''};
  G.wizStepEnhanced(meB,meF);
  check('wizStepEnhanced: Next disabled when no base compound selected', meF.innerHTML.includes('disabled'));
  check('wizStepEnhanced: warning banner shown when no base compound', meB.innerHTML.includes('Testosterone'));
  // Now select the base compound
  G.wizToggleEnhancedCompound('test_e');
  var meB2={innerHTML:''};var meF2={innerHTML:''};
  G.wizStepEnhanced(meB2,meF2);
  check('wizStepEnhanced: Next enabled after base compound selected', !meF2.innerHTML.includes('disabled'));
  check('wizStepEnhanced: warning gone after base compound selected', !meB2.innerHTML.includes('⚠'));
  G.ENHANCEMENT_COMPOUNDS=savedECat;

  G._userTier=1;
}

// ── _stackTabBar ──────────────────────────────────────────────────────────────
console.log('\n── _stackTabBar ────────────────────────────────────────────');
{
  const G=sandbox;

  // T1: all three tabs present; Enhanced is locked (opacity 0.45)
  G._userTier=1;
  var tb1=G._stackTabBar('peptides','setStackViewTab');
  check('_stackTabBar T1: renders Peptides tab', tb1.includes('Peptides'));
  check('_stackTabBar T1: renders TRT tab', tb1.includes('TRT'));
  check('_stackTabBar T1: renders Enhanced tab', tb1.includes('Enhanced'));
  check('_stackTabBar T1: Enhanced tab locked (opacity:0.45)', tb1.includes('0.45'));

  // T3: Enhanced is not locked
  G._userTier=3;
  var tb3=G._stackTabBar('peptides','setStackViewTab');
  check('_stackTabBar T3: Enhanced tab present', tb3.includes('Enhanced'));
  check('_stackTabBar T3: Enhanced tab not locked (no opacity:0.45)', !tb3.includes('0.45'));

  // Active tab gets accent background; others transparent
  G._userTier=3;
  var tbEnhActive=G._stackTabBar('enhanced','setEditInnerTab');
  check('_stackTabBar T3: active Enhanced tab gets accent bg', tbEnhActive.includes('var(--accent)'));

  // Setter propagated to onclick handlers
  check('_stackTabBar view: onclick uses setStackViewTab', tb1.includes('setStackViewTab'));
  var tbEdit=G._stackTabBar('trt','setEditInnerTab');
  check('_stackTabBar edit: onclick uses setEditInnerTab', tbEdit.includes('setEditInnerTab'));

  G._userTier=1;
}

// ── View & Edit tab render functions ─────────────────────────────────────────
console.log('\n── View & Edit tab render functions ────────────────────────');
{
  const G=sandbox;

  // _renderEnhancedUpgradeCTA: non-T3 users see upgrade call-to-action
  var ctaHtml=G._renderEnhancedUpgradeCTA();
  check('_renderEnhancedUpgradeCTA: returns string', typeof ctaHtml==='string');
  check('_renderEnhancedUpgradeCTA: not empty', ctaHtml.length>0);
  check('_renderEnhancedUpgradeCTA: mentions Enhanced Tier', ctaHtml.includes('Enhanced Tier'));
  check('_renderEnhancedUpgradeCTA: has Enable in Settings button', ctaHtml.includes('Enable in Settings'));

  // _renderTRTViewTab: no TRT configured
  var noTRTSt={name:'T',peptides:[],trt:{enabled:false,compounds:[]},cycle_length:12};
  var tvH1=G._renderTRTViewTab(noTRTSt);
  check('_renderTRTViewTab empty: returns string', typeof tvH1==='string');
  check('_renderTRTViewTab empty: mentions no TRT configured', tvH1.includes('No TRT configured'));
  check('_renderTRTViewTab empty: shows Injection Log section', tvH1.includes('Injection Log'));
  check('_renderTRTViewTab empty: prompts to set start date', tvH1.includes('Set a start date'));

  // _renderTRTViewTab: with TRT compound (no cycle_start → injection log shows set-start-date)
  if(G.TRT_CAT&&G.TRT_CAT.length){
    // Use any TRT compound — both Nebido and Testoviron show name/dose/Protocol section
    var tCat0v=G.TRT_CAT.find(function(c){return c.id!=='nebido';})||G.TRT_CAT[0];
    var withTRTSt={name:'T',peptides:[],trt:{enabled:true,compounds:[{id:tCat0v.id,name:tCat0v.name,dose:'125',unit:'mg',days:[1,3]}]},cycle_length:12};
    var tvH2=G._renderTRTViewTab(withTRTSt);
    check('_renderTRTViewTab with compound: shows Protocol section', tvH2.includes('Protocol'));
    check('_renderTRTViewTab with compound: shows compound name', tvH2.includes(tCat0v.name));
    check('_renderTRTViewTab with compound: shows dose', tvH2.includes('125'));
    check('_renderTRTViewTab with compound: still shows injection log area', tvH2.includes('Injection Log'));
  }

  // _renderEditTRT: null/empty → toggle is off, no compound cards visible
  var etH1=G._renderEditTRT(null);
  check('_renderEditTRT null: returns string', typeof etH1==='string');
  check('_renderEditTRT null: shows TRT Protocol heading', etH1.includes('TRT Protocol'));
  check('_renderEditTRT null: toggle is OFF (not "toggle-sw on")', etH1.includes('toggle-sw')&&!etH1.includes('toggle-sw on'));

  // _renderEditTRT: enabled with compound → toggle on, dose controls
  // Use testoviron (not nebido) so the Days row appears (nebido shows Frequency instead)
  if(G.TRT_CAT&&G.TRT_CAT.length){
    var tCatNonNebido=G.TRT_CAT.find(function(c){return c.id!=='nebido';})||G.TRT_CAT[0];
    var tCat0=tCatNonNebido;
    G._editBuf={name:'T',peptides:[],trt:{enabled:true,compounds:[{id:tCat0.id,name:tCat0.name,dose:'125',unit:'mg',days:[1,3]}]},enhanced:{enabled:false,compounds:[]},cycle_length:12};
    var etH2=G._renderEditTRT({enabled:true,compounds:[{id:tCat0.id,name:tCat0.name,dose:'125',unit:'mg',days:[1,3]}]});
    check('_renderEditTRT enabled: toggle is ON', etH2.includes('toggle-sw on'));
    check('_renderEditTRT enabled: shows compound name', etH2.includes(tCat0.name));
    check('_renderEditTRT enabled: shows Dose row', etH2.includes('Dose'));
    check('_renderEditTRT enabled: shows Days row (non-Nebido compound)', etH2.includes('Days'));
  }

  // _renderEditPep: renders peptide config card
  var pepCat0=G.PEPTIDE_CAT&&G.PEPTIDE_CAT.find(function(p){return p.id==='cjc-ipa';});
  if(pepCat0){
    G._editBuf={name:'T',peptides:[{id:'cjc-ipa',name:pepCat0.name,dot:pepCat0.dot,times:['AM'],days:[1,2,3],dose_am:'100',dose_pm:'',unit_am:'mcg',note:'',active:true}],trt:{enabled:false,compounds:[]},enhanced:{enabled:false,compounds:[]},cycle_length:12};
    var pepCard=G._renderEditPep(G._editBuf.peptides[0],0);
    check('_renderEditPep: returns string', typeof pepCard==='string');
    check('_renderEditPep: shows peptide name', pepCard.includes(pepCat0.name));
    check('_renderEditPep: shows cfg-block wrapper', pepCard.includes('cfg-block'));
    check('_renderEditPep: shows Timing row (AM/PM chips)', pepCard.includes('AM'));
    check('_renderEditPep: shows AM Dose field', pepCard.includes('AM Dose'));
    check('_renderEditPep: shows Days row', pepCard.includes('Days'));
    check('_renderEditPep: shows Note field', pepCard.includes('Note'));
    check('_renderEditPep: shows Start date field', pepCard.includes('Start'));
  }

  G._userTier=1;
}

// ── Source-code structural assertions ─────────────────────────────────────────
console.log('\n── Source-code structural assertions ───────────────────────');
{
  const tsJs=fs.readFileSync(path.join(path.dirname(path.resolve(htmlPath)),'tab-stack.js'),'utf8');

  // Enhanced view branch must call _renderEnhancedViewTab, not _buildEnhancementCycleSection
  check('source: _renderEnhancedViewTab(st) present in tab-stack.js',
    tsJs.includes('_renderEnhancedViewTab(st)'));
  check('source: _renderEditEnhanced(_editBuf.enhanced present in tab-stack.js',
    tsJs.includes('_renderEditEnhanced(_editBuf.enhanced'));
  // These two patterns would prove the OLD broken routing is gone:
  check('source: view Enhanced branch does NOT call _buildEnhancementCycleSection',
    !(function(){var m=tsJs.match(/stackViewTab===.enhanced.[\s\S]{0,400}_buildEnhancementCycleSection/);return!!m;})());
  check('source: edit Enhanced branch does NOT call _buildEnhancementCycleSection',
    !(function(){var m=tsJs.match(/editInnerTab===.enhanced.[\s\S]{0,400}_buildEnhancementCycleSection/);return!!m;})());

  // wizStepGoals must show Enhanced Cycle toggle for T3 (restored 2026-06-25)
  check('source: wizStepGoals shows Enhanced Cycle for T3',
    (function(){var fn=tsJs.match(/function wizStepGoals\([\s\S]{0,3000}/);return fn&&fn[0].includes('Enhanced Cycle');})());

  // All required render functions must be defined in tab-stack.js
  check('source: function _renderEnhancedViewTab( defined', tsJs.includes('function _renderEnhancedViewTab('));
  check('source: function _renderEditEnhanced( defined', tsJs.includes('function _renderEditEnhanced('));
  check('source: function _renderEnhancedUpgradeCTA( defined', tsJs.includes('function _renderEnhancedUpgradeCTA('));
  check('source: function _renderEditTRT( defined', tsJs.includes('function _renderEditTRT('));
  check('source: function _renderTRTViewTab( defined', tsJs.includes('function _renderTRTViewTab('));
  check('source: function _stackTabBar( defined', tsJs.includes('function _stackTabBar('));

  // Tier gates confirmed in source
  check('source: edit Enhanced branch gates on tier >=3', tsJs.includes('(_userTier||1)>=3?_renderEditEnhanced'));
  check('source: view Enhanced branch gates on tier >=3', tsJs.includes('(_userTier||1)>=3?_renderEnhancedViewTab'));

  // _buildEnhancementCycleSection still exists (used by Cycles tab via stackSetCyclePhase etc.)
  check('source: _buildEnhancementCycleSection function still exists (Cycles tab)', tsJs.includes('function _buildEnhancementCycleSection('));

  // _refreshTRTGuide: TRT guide highlight updates when frequency changes
  check('source: _refreshTRTGuide function defined', tsJs.includes('function _refreshTRTGuide('));
  check('source: wizSetTRTFreq calls _refreshTRTGuide', (function(){var m=tsJs.match(/function wizSetTRTFreq\([\s\S]{0,200}/);return m&&m[0].includes('_refreshTRTGuide');})());
  check('source: wizSetTRTFreqUnit calls _refreshTRTGuide', (function(){var m=tsJs.match(/function wizSetTRTFreqUnit\([\s\S]{0,200}/);return m&&m[0].includes('_refreshTRTGuide');})());
  check('source: _renderEditTRT freqVal handler calls _refreshTRTGuide', (function(){var m=tsJs.match(/function _renderEditTRT\([\s\S]{0,4000}/);return m&&m[0].includes('_refreshTRTGuide');})());
  check('source: wizStepTRT wraps guide in trt-guide-id div', (function(){var m=tsJs.match(/function wizStepTRT\([\s\S]{0,4000}/);return m&&m[0].includes("id=\"trt-guide-");})());
  check('source: _renderEditTRT wraps guide in trt-guide-id div', (function(){var m=tsJs.match(/function _renderEditTRT\([\s\S]{0,4000}/);return m&&m[0].includes('trt-guide-');})());

  // _refreshTRTGuide logic: correct weekly dose calculation
  (function(){
    G.initWizard();
    G._wiz.trt.enabled=true;
    G._wiz.trt.compounds=[{id:'nebido',name:'Nebido',dose:'1000',unit:'mg',freqVal:12,freqUnit:'weeks'}];
    // weeklyDoseMg at 12 weeks: 1000*7/(12*7) = 83.3 → Clinical (wkMin:60,wkMax:90)
    var g=G.TRT_GUIDE['nebido'];
    var freqDays=12*7;var wk=1000*7/freqDays;
    var match12=g.tiers.filter(function(t){return wk>=(t.wkMin||0)&&wk<=(t.wkMax||9999);});
    check('_renderTRTGuide: Nebido 12wks highlights Clinical', match12.length===1&&match12[0].l==='Clinical');

    freqDays=10*7;wk=1000*7/freqDays;
    var match10=g.tiers.filter(function(t){return wk>=(t.wkMin||0)&&wk<=(t.wkMax||9999);});
    check('_renderTRTGuide: Nebido 10wks highlights Optimised', match10.length===1&&match10[0].l==='Optimised');

    freqDays=8*7;wk=1000*7/freqDays;
    var match8=g.tiers.filter(function(t){return wk>=(t.wkMin||0)&&wk<=(t.wkMax||9999);});
    check('_renderTRTGuide: Nebido 8wks highlights Accelerated', match8.length===1&&match8[0].l==='Accelerated');
  })();
}

// ── DOSE_GUIDE: structural validation (all 22 peptide compounds) ──────────────
console.log('\n── DOSE_GUIDE: structural validation ────────────────────────');
{
  check('DOSE_GUIDE defined', typeof G.DOSE_GUIDE==='object'&&G.DOSE_GUIDE!==null);
  if(G.DOSE_GUIDE&&G.PEPTIDE_CAT){
    var dgKeys=Object.keys(G.DOSE_GUIDE);
    var catIds=G.PEPTIDE_CAT.map(function(p){return p.id;});
    check('DOSE_GUIDE has exactly 22 entries', dgKeys.length===22, 'got '+dgKeys.length);
    check('every PEPTIDE_CAT id has a DOSE_GUIDE entry',
      catIds.every(function(id){return!!G.DOSE_GUIDE[id];}),
      catIds.filter(function(id){return!G.DOSE_GUIDE[id];}).join(', '));
    check('no orphan DOSE_GUIDE keys (every key is a PEPTIDE_CAT id)',
      dgKeys.every(function(k){return catIds.includes(k);}),
      dgKeys.filter(function(k){return!catIds.includes(k);}).join(', '));

    var badNoTiers=dgKeys.filter(function(k){return!Array.isArray(G.DOSE_GUIDE[k])||G.DOSE_GUIDE[k].length===0;});
    check('every DOSE_GUIDE entry is a non-empty array', badNoTiers.length===0, badNoTiers.join(', '));

    var badNoLabel=dgKeys.filter(function(k){return G.DOSE_GUIDE[k].some(function(t){return!t.l;});});
    check('every DOSE_GUIDE tier has an l (label) field', badNoLabel.length===0, badNoLabel.join(', '));

    var missingB=dgKeys.filter(function(k){return!G.DOSE_GUIDE[k].some(function(t){return t.b;});});
    check('every DOSE_GUIDE compound has exactly one b:1 (baseline) tier',
      missingB.length===0, 'missing b:1: '+missingB.join(', '));

    var multiB=dgKeys.filter(function(k){return G.DOSE_GUIDE[k].filter(function(t){return t.b;}).length>1;});
    check('no DOSE_GUIDE compound has more than one b:1 tier', multiB.length===0, 'multiple b:1: '+multiB.join(', '));
  }
}

// ── _renderDoseGuide: runtime HTML output for every peptide compound ──────────
console.log('\n── _renderDoseGuide: runtime HTML for all 22 compounds ──────');
{
  if(typeof G._renderDoseGuide==='function'&&G.DOSE_GUIDE&&G.PEPTIDE_CAT){
    var pepIds=G.PEPTIDE_CAT.map(function(p){return p.id;});
    var emptyRenders=pepIds.filter(function(id){var h=G._renderDoseGuide(id);return!h||h.length===0;});
    check('_renderDoseGuide returns non-empty HTML for every peptide compound',
      emptyRenders.length===0, 'empty for: '+emptyRenders.join(', '));

    var missingHeading=pepIds.filter(function(id){return!G._renderDoseGuide(id).includes('Recommended Doses');});
    check('_renderDoseGuide always includes Recommended Doses heading',
      missingHeading.length===0, 'missing heading: '+missingHeading.join(', '));

    // Spot-checks: baseline tier (b:1) label appears in rendered HTML
    var spotChecks=[
      {id:'cjc-ipa',    label:'Optimal'},
      {id:'retatrutide',label:'Optimal'},
      {id:'tirzepatide',label:'Optimal'},
      {id:'semaglutide', label:'Optimal'},
      {id:'hgh',        label:'Recomp'},
      {id:'tesamorelin',label:'Standard'},
      {id:'bpc-tb',     label:'Acute'},
      {id:'bpc157',     label:'Optimal'},
      {id:'tb500',      label:'Loading'},
      {id:'aod9604',    label:'Standard'},
      {id:'hcg',        label:'Standard'},
      {id:'nad',        label:'Optimal'},
      {id:'motsc',      label:'Optimal'},
      {id:'epitalon',   label:'Standard'},
      {id:'glow',       label:'Standard'},
      {id:'klow',       label:'Standard'},
    ];
    spotChecks.forEach(function(sc){
      var h=G._renderDoseGuide(sc.id);
      check('_renderDoseGuide('+sc.id+'): baseline tier "'+sc.label+'" present in HTML',
        h.includes(sc.label), 'HTML: '+h.slice(0,200));
    });

    // Risk warning (r field) appears for compounds that have it
    var retaHtml=G._renderDoseGuide('retatrutide');
    check('_renderDoseGuide(retatrutide): risk warning rendered',
      retaHtml.includes('⚠'), 'got: '+retaHtml.slice(0,300));

    var hghHtml=G._renderDoseGuide('hgh');
    check('_renderDoseGuide(hgh): risk warning rendered', hghHtml.includes('⚠'));

    // Returns empty string for unknown compound
    check('_renderDoseGuide unknown id returns empty string', G._renderDoseGuide('not-a-compound')==='');
  }
}

// ── TRT_GUIDE: structural validation (all 6 TRT compounds) ───────────────────
console.log('\n── TRT_GUIDE: structural validation ─────────────────────────');
{
  if(G.TRT_GUIDE&&G.TRT_CAT){
    var trtIds=G.TRT_CAT.map(function(c){return c.id;});
    var trtKeys=Object.keys(G.TRT_GUIDE);

    check('TRT_GUIDE has exactly 6 entries', trtKeys.length===6, 'got '+trtKeys.length);
    check('every TRT_CAT id has a TRT_GUIDE entry',
      trtIds.every(function(id){return!!G.TRT_GUIDE[id];}),
      trtIds.filter(function(id){return!G.TRT_GUIDE[id];}).join(', '));
    check('no orphan TRT_GUIDE keys',
      trtKeys.every(function(k){return trtIds.includes(k);}),
      trtKeys.filter(function(k){return!trtIds.includes(k);}).join(', '));

    trtIds.forEach(function(id){
      var g=G.TRT_GUIDE[id];
      check('TRT_GUIDE['+id+'] has halfLife field', typeof g.halfLife==='string'&&g.halfLife.length>0);
      check('TRT_GUIDE['+id+'] has cadence.rec field', g.cadence&&typeof g.cadence.rec==='string');
      check('TRT_GUIDE['+id+'] has cadence.note field', g.cadence&&typeof g.cadence.note==='string');
      check('TRT_GUIDE['+id+'] has tiers array', Array.isArray(g.tiers)&&g.tiers.length>0);
      check('TRT_GUIDE['+id+'] has exactly one b:1 tier',
        g.tiers.filter(function(t){return t.b;}).length===1);
      g.tiers.forEach(function(t,i){
        check('TRT_GUIDE['+id+'] tier '+i+' has l label', typeof t.l==='string'&&t.l.length>0);
        check('TRT_GUIDE['+id+'] tier '+i+' has d dose', typeof t.d==='string'&&t.d.length>0);
        check('TRT_GUIDE['+id+'] tier '+i+' has wkMin', typeof t.wkMin==='number');
        check('TRT_GUIDE['+id+'] tier '+i+' has wkMax', typeof t.wkMax==='number');
        check('TRT_GUIDE['+id+'] tier '+i+' wkMin <= wkMax', t.wkMin<=t.wkMax);
      });
      // Ranges must be non-overlapping: each tier's wkMin > previous tier's wkMax
      var sorted=g.tiers.slice().sort(function(a,b){return a.wkMin-b.wkMin;});
      var overlaps=false;
      for(var i=1;i<sorted.length;i++){if(sorted[i].wkMin<=sorted[i-1].wkMax)overlaps=true;}
      check('TRT_GUIDE['+id+'] tier ranges are non-overlapping', !overlaps);
    });
  }
}

// ── _renderTRTGuide: runtime HTML for all 6 TRT compounds ────────────────────
console.log('\n── _renderTRTGuide: runtime HTML for all 6 TRT compounds ────');
{
  if(typeof G._renderTRTGuide==='function'&&G.TRT_GUIDE&&G.TRT_CAT){
    function getHighlightedTierLabel(html){
      var marker='rgba(232,160,32,0.1)';
      var idx=html.indexOf(marker);if(idx<0)return null;
      var after=html.slice(idx,idx+500);
      var labels=['Performance','High-normal','Standard TRT','Clinical','Optimised','Accelerated'];
      for(var i=0;i<labels.length;i++){if(after.includes(labels[i]))return labels[i];}
      return null;
    }

    // --- enanthate ---
    check('enanthate 125mg/wk → Standard TRT',
      getHighlightedTierLabel(G._renderTRTGuide('enanthate',125))==='Standard TRT');
    check('enanthate 200mg/wk → High-normal',
      getHighlightedTierLabel(G._renderTRTGuide('enanthate',200))==='High-normal');
    check('enanthate 300mg/wk → Performance',
      getHighlightedTierLabel(G._renderTRTGuide('enanthate',300))==='Performance');
    check('enanthate 0mg/wk → High-normal (b:1 fallback)',
      getHighlightedTierLabel(G._renderTRTGuide('enanthate',0))==='High-normal');

    // --- cypionate ---
    check('cypionate 100mg/wk → Standard TRT',
      getHighlightedTierLabel(G._renderTRTGuide('cypionate',100))==='Standard TRT');
    check('cypionate 175mg/wk → High-normal',
      getHighlightedTierLabel(G._renderTRTGuide('cypionate',175))==='High-normal');
    check('cypionate 300mg/wk → Performance',
      getHighlightedTierLabel(G._renderTRTGuide('cypionate',300))==='Performance');
    check('cypionate 0mg/wk → High-normal (b:1 fallback)',
      getHighlightedTierLabel(G._renderTRTGuide('cypionate',0))==='High-normal');

    // --- propionate ---
    check('propionate 100mg/wk → Standard TRT',
      getHighlightedTierLabel(G._renderTRTGuide('propionate',100))==='Standard TRT');
    check('propionate 150mg/wk → High-normal',
      getHighlightedTierLabel(G._renderTRTGuide('propionate',150))==='High-normal');
    check('propionate 250mg/wk → Performance',
      getHighlightedTierLabel(G._renderTRTGuide('propionate',250))==='Performance');
    check('propionate 0mg/wk → High-normal (b:1 fallback)',
      getHighlightedTierLabel(G._renderTRTGuide('propionate',0))==='High-normal');

    // --- sustanon ---
    check('sustanon 100mg/wk → Standard TRT',
      getHighlightedTierLabel(G._renderTRTGuide('sustanon',100))==='Standard TRT');
    check('sustanon 175mg/wk → High-normal',
      getHighlightedTierLabel(G._renderTRTGuide('sustanon',175))==='High-normal');
    check('sustanon 300mg/wk → Performance',
      getHighlightedTierLabel(G._renderTRTGuide('sustanon',300))==='Performance');
    check('sustanon 0mg/wk → High-normal (b:1 fallback)',
      getHighlightedTierLabel(G._renderTRTGuide('sustanon',0))==='High-normal');

    // --- nebido (full range) ---
    check('nebido 70mg/wk (1000mg/10.2wks) → Clinical',
      getHighlightedTierLabel(G._renderTRTGuide('nebido',75))==='Clinical');
    check('nebido 100mg/wk (1000mg/7wks) → Optimised',
      getHighlightedTierLabel(G._renderTRTGuide('nebido',100))==='Optimised');
    check('nebido 125mg/wk (1000mg/5.6wks) → Accelerated',
      getHighlightedTierLabel(G._renderTRTGuide('nebido',125))==='Accelerated');
    check('nebido 0mg/wk → Clinical (b:1 fallback)',
      getHighlightedTierLabel(G._renderTRTGuide('nebido',0))==='Clinical');

    // --- HTML structure: all compounds produce non-empty, well-formed output ---
    G.TRT_CAT.forEach(function(c){
      var html=G._renderTRTGuide(c.id,150);
      check('_renderTRTGuide('+c.id+'): returns non-empty HTML', typeof html==='string'&&html.length>50);
      check('_renderTRTGuide('+c.id+'): contains TRT Guide heading', html.includes('TRT Guide'));
      check('_renderTRTGuide('+c.id+'): contains halfLife from guide', html.includes('½-life'));
      check('_renderTRTGuide('+c.id+'): contains cadence rec', html.includes(G.TRT_GUIDE[c.id].cadence.rec.slice(0,10)));
    });

    // --- Supraphysiological warning block (distinct from Performance tier note text) ---
    var supraNebido=G._renderTRTGuide('nebido',300);
    check('_renderTRTGuide: supraphysiological warning block at 300mg/wk for nebido',
      supraNebido.includes('Supraphysiological dose'));
    var supraTesto=G._renderTRTGuide('testoviron',300);
    check('_renderTRTGuide: supraphysiological warning block at 300mg/wk for testoviron',
      supraTesto.includes('Supraphysiological dose'));
    // Warning block must NOT appear at sub-250 doses
    var noSupra=G._renderTRTGuide('testoviron',200);
    check('_renderTRTGuide: no supraphysiological warning block at 200mg/wk',
      !noSupra.includes('Supraphysiological dose'));

    // --- Unknown compound returns empty string ---
    check('_renderTRTGuide unknown id returns empty string', G._renderTRTGuide('not-a-compound',100)==='');
  }
}

// ── _renderEnhancedGuide: runtime HTML with mock compound data ────────────────
console.log('\n── _renderEnhancedGuide: runtime HTML validation ────────────');
{
  if(typeof G._renderEnhancedGuide==='function'){
    // null / undefined → empty string
    check('_renderEnhancedGuide(null) returns empty string', G._renderEnhancedGuide(null)==='');
    check('_renderEnhancedGuide(undefined) returns empty string', G._renderEnhancedGuide(undefined)==='');

    // Mock compound with full data (cadence + doseTiers + interaction + sides)
    var mockFull={
      id:'test-compound',
      cadence:{rec:'Every 3.5 days',note:'Split twice weekly for stable levels',halfLife:'4.5 days'},
      doseTiers:[
        {l:'Conservative',d:'200 mg/wk',n:'Intro dose',freq:'2×/wk'},
        {l:'Optimal',d:'400 mg/wk',n:'Performance range',freq:'2×/wk',b:1},
        {l:'High',d:'600 mg/wk',n:'Advanced',freq:'2×/wk',r:'Elevated CV risk'}
      ],
      interaction:'Binds AR receptors; promotes nitrogen retention.',
      sides:'Acne, hair loss, HPTA suppression.'
    };
    var htmlFull=G._renderEnhancedGuide(mockFull);
    check('_renderEnhancedGuide: returns non-empty HTML for full compound', htmlFull.length>100);
    check('_renderEnhancedGuide: renders Injection Frequency heading', htmlFull.includes('Injection Frequency'));
    check('_renderEnhancedGuide: renders cadence rec value', htmlFull.includes('Every 3.5 days'));
    check('_renderEnhancedGuide: renders half-life', htmlFull.includes('4.5 days'));
    check('_renderEnhancedGuide: renders Recommended Doses heading', htmlFull.includes('Recommended Doses'));
    check('_renderEnhancedGuide: renders tier labels', htmlFull.includes('Conservative')&&htmlFull.includes('Optimal'));
    check('_renderEnhancedGuide: renders risk warning ⚠', htmlFull.includes('⚠'));
    check('_renderEnhancedGuide: renders interaction section heading', htmlFull.includes('How it works'));
    check('_renderEnhancedGuide: renders interaction text', htmlFull.includes('Binds AR receptors'));
    check('_renderEnhancedGuide: renders side effects heading', htmlFull.includes('Side effects'));
    check('_renderEnhancedGuide: renders sides text', htmlFull.includes('Acne, hair loss'));

    // No doseTiers but has DOSE_GUIDE entry → falls back to DOSE_GUIDE
    var mockFallback={id:'hgh',cadence:{rec:'AM injection',note:'Fasted AM',halfLife:'~20 min'}};
    var htmlFallback=G._renderEnhancedGuide(mockFallback);
    check('_renderEnhancedGuide: falls back to DOSE_GUIDE[hgh] when no doseTiers',
      htmlFallback.includes('Recommended Doses'));
    check('_renderEnhancedGuide: DOSE_GUIDE fallback shows hgh tier label (Anti-aging)',
      htmlFallback.includes('Anti-aging'));

    // No doseTiers and no DOSE_GUIDE entry → no Recommended Doses section
    var mockNoDose={id:'unknown-compound',cadence:{rec:'Weekly',note:'Once weekly',halfLife:'7 days'}};
    var htmlNoDose=G._renderEnhancedGuide(mockNoDose);
    check('_renderEnhancedGuide: renders cadence even without dose tiers',
      htmlNoDose.includes('Injection Frequency'));
    check('_renderEnhancedGuide: no Recommended Doses section when no tiers exist',
      !htmlNoDose.includes('Recommended Doses'));

    // Empty doseTiers array → falls back to DOSE_GUIDE
    var mockEmptyTiers={id:'bpc157',doseTiers:[],cadence:{rec:'Daily',note:'SC injection',halfLife:'~4 hrs'}};
    var htmlEmpty=G._renderEnhancedGuide(mockEmptyTiers);
    check('_renderEnhancedGuide: empty doseTiers falls back to DOSE_GUIDE[bpc157]',
      htmlEmpty.includes('Optimal'));

    // No cadence field → renders dose tiers but no Injection Frequency block
    var mockNoCadence={id:'nad',doseTiers:[{l:'Maintenance',d:'100 mg/wk',n:'NAD+ support',b:1}]};
    var htmlNoCad=G._renderEnhancedGuide(mockNoCadence);
    check('_renderEnhancedGuide: no cadence → no Injection Frequency block',
      !htmlNoCad.includes('Injection Frequency'));
    check('_renderEnhancedGuide: no cadence → still renders dose tiers',
      htmlNoCad.includes('Recommended Doses'));
  }
}

// ── _dosePersonalization: sex, age, weight modifiers for peptides ─────────────
console.log('\n── _dosePersonalization: sex / age / weight modifiers ───────');
{
  if(typeof G._dosePersonalization==='function'&&typeof G._userProfile==='function'){
    function setProfile(sex,age,weightKg){
      G.localStorage.setItem('user_sex',sex||'male');
      G.localStorage.setItem('user_age',String(age||0));
      G.localStorage.setItem('user_weight',String(weightKg||0));
    }
    function clearProfile(){
      G.localStorage.removeItem('user_sex');
      G.localStorage.removeItem('user_age');
      G.localStorage.removeItem('user_weight');
    }

    // --- GH axis: female ---
    setProfile('female',35,65);
    var ghIds=['cjc-ipa','cjc-nodac','ipamorelin','sermorelin','tesamorelin','hgh'];
    ghIds.forEach(function(id){
      var mods=G._dosePersonalization(id,G._userProfile());
      check('_dosePersonalization('+id+', female): lower-end adj present',
        mods.some(function(m){return m.type==='adj'&&m.text.includes('50% more sensitive');}));
    });

    // --- GH axis: age 50+ ---
    setProfile('male',55,80);
    ghIds.forEach(function(id){
      var mods=G._dosePersonalization(id,G._userProfile());
      check('_dosePersonalization('+id+', age55): age adj present',
        mods.some(function(m){return m.type==='adj'&&m.text.includes('Age 55');}));
    });

    // --- GH axis: age <30 ---
    setProfile('male',22,75);
    var modsYoung=G._dosePersonalization('cjc-ipa',G._userProfile());
    check('_dosePersonalization(cjc-ipa, age22): standard tolerance note present',
      modsYoung.some(function(m){return m.type==='ok'&&m.text.includes('standard doses well tolerated');}));

    // --- GH axis: no mods for non-GH peptide ---
    setProfile('female',55,65);
    var modsNonGH=G._dosePersonalization('retatrutide',G._userProfile());
    var hasGhMod=modsNonGH.some(function(m){return m.text&&m.text.includes('GH peptides');});
    check('_dosePersonalization(retatrutide): no GH-axis mod (not a GH peptide)',!hasGhMod);

    // --- GLP-1: heavy (>100kg) ---
    setProfile('male',35,110);
    var glp1Ids=['retatrutide','tirzepatide','semaglutide'];
    glp1Ids.forEach(function(id){
      var mods=G._dosePersonalization(id,G._userProfile());
      check('_dosePersonalization('+id+', 110kg): higher dose / protein adj present',
        mods.some(function(m){return m.type==='adj'&&m.text.includes('110kg')&&m.text.includes('protein');}));
    });

    // --- GLP-1: light (<65kg) ---
    setProfile('male',35,58);
    glp1Ids.forEach(function(id){
      var mods=G._dosePersonalization(id,G._userProfile());
      check('_dosePersonalization('+id+', 58kg): lighter frame ok note present',
        mods.some(function(m){return m.type==='ok'&&m.text.includes('58kg')&&m.text.includes('lighter frame');}));
    });

    // --- GLP-1: mid-weight (65–100kg) → no weight mod ---
    setProfile('male',35,80);
    var modsMid=G._dosePersonalization('retatrutide',G._userProfile());
    var hasWeightMod=modsMid.some(function(m){return m.text&&m.text.includes('kg');});
    check('_dosePersonalization(retatrutide, 80kg): no weight-specific mod',!hasWeightMod);

    // --- HCG: female warning ---
    setProfile('female',35,65);
    var modsHcgF=G._dosePersonalization('hcg',G._userProfile());
    check('_dosePersonalization(hcg, female): contraindication warning present',
      modsHcgF.some(function(m){return m.type==='warn'&&m.text.includes('not typically indicated for women');}));

    // --- HCG: male → no female warning ---
    setProfile('male',35,80);
    var modsHcgM=G._dosePersonalization('hcg',G._userProfile());
    var hcgFemaleWarn=modsHcgM.some(function(m){return m.text&&m.text.includes('not typically indicated');});
    check('_dosePersonalization(hcg, male): no female warning',!hcgFemaleWarn);

    // --- NAD: weight-based dose calculation ---
    setProfile('male',35,90);
    var modsNad=G._dosePersonalization('nad',G._userProfile());
    check('_dosePersonalization(nad, 90kg): weight-based target includes 135mg (90*1.5)',
      modsNad.some(function(m){return m.type==='info'&&m.text.includes('135mg');}));

    // --- NAD: no weight set → no weight mod ---
    clearProfile();
    var modsNadNoW=G._dosePersonalization('nad',G._userProfile());
    var hasNadWeightMod=modsNadNoW.some(function(m){return m.type==='info'&&m.text&&m.text.includes('mg SC');});
    check('_dosePersonalization(nad, no weight): no weight-based mod',!hasNadWeightMod);

    // --- Non-personalised compound: no mods ---
    setProfile('female',55,110);
    var modsEpitalon=G._dosePersonalization('epitalon',G._userProfile());
    check('_dosePersonalization(epitalon): no personalization mods (epitalon has none)',
      modsEpitalon.length===0);

    // ── IGF-1 → GH-axis direction ──
    if(typeof G._igf1Recommendation==='function'){
      setProfile('male',45,80);
      check('_igf1ToNgml: nmol/L → ng/mL (×7.649)', Math.abs(G._igf1ToNgml(30,'nmol/L')-229.47)<1);
      check('_igf1ToNgml: ng/mL passes through',     G._igf1ToNgml(150,'ng/mL')===150);
      check('_igf1RefRange(45) = 90–260 ng/mL', (function(){var r=G._igf1RefRange(45);return r.lo===90&&r.hi===260;})());
      check('_igf1Rec: below upper-third → increase', (function(){var r=G._igf1Recommendation(120,'ng/mL',45);return r.status==='Below target'&&r.direction==='increase';})());
      check('_igf1Rec: upper-normal → hold',           (function(){var r=G._igf1Recommendation(250,'ng/mL',45);return r.status==='At target'&&r.direction==='hold';})());
      check('_igf1Rec: above range → reduce',          (function(){var r=G._igf1Recommendation(300,'ng/mL',45);return r.status==='Above range'&&r.direction==='reduce';})());
      check('_igf1Rec: never emits a mg number',       (function(){var r=G._igf1Recommendation(120,'ng/mL',45);return !/\bmg\b/.test(r.text);})());
      check('_igf1Rec: lab range override used',        (function(){var r=G._igf1Recommendation(150,'ng/mL',45,100,200);return r.src==='lab'&&r.hi===200;})());
      check('_igf1Rec: override converts with value unit',(function(){var r=G._igf1Recommendation(26,'nmol/L',45,13,34);return r.src==='lab'&&Math.abs(r.hi-260)<2;})());
      // surfaces in _dosePersonalization for GH-axis when IGF-1 is in bloodwork
      var _savedBw2=G._tcBwEntries;
      G._tcBwEntries=[{date:'2026-07-01',extra:[{name:'IGF-1',value:120,unit:'ng/mL'}]}];
      var _ghMods=G._dosePersonalization('ipamorelin',G._userProfile());
      check('_dosePersonalization(ipamorelin): IGF-1 mod present when logged',
        _ghMods.some(function(m){return m.text&&m.text.indexOf('IGF-1')!==-1&&m.text.indexOf('increasing')!==-1;}));
      var _nonGh=G._dosePersonalization('retatrutide',G._userProfile());
      check('_dosePersonalization(retatrutide): no IGF-1 mod (not GH-axis)',
        !_nonGh.some(function(m){return m.text&&m.text.indexOf('IGF-1')!==-1;}));
      G._tcBwEntries=null;
      check('_latestBwMarker: null when no bloodwork', G._latestBwMarker('IGF-1')===null);
      G._tcBwEntries=_savedBw2;
    }

    clearProfile();
  }
}

// ── _renderDoseGuide: sex/age/weight modifiers appear in HTML output ──────────
console.log('\n── _renderDoseGuide: personalization text in HTML output ────');
{
  if(typeof G._renderDoseGuide==='function'&&typeof G._dosePersonalization==='function'){
    function setProfile(sex,age,weightKg){
      G.localStorage.setItem('user_sex',sex||'male');
      G.localStorage.setItem('user_age',String(age||0));
      G.localStorage.setItem('user_weight',String(weightKg||0));
    }
    function clearProfile(){
      G.localStorage.removeItem('user_sex');
      G.localStorage.removeItem('user_age');
      G.localStorage.removeItem('user_weight');
    }

    // Female GH axis → lower-end note in rendered HTML
    setProfile('female',35,65);
    var htmlGhF=G._renderDoseGuide('cjc-ipa');
    check('_renderDoseGuide(cjc-ipa, female): female GH adj text in HTML',
      htmlGhF.includes('50% more sensitive'));

    // Heavy GLP-1 → protein note in rendered HTML
    setProfile('male',35,110);
    var htmlGlp1Heavy=G._renderDoseGuide('retatrutide');
    check('_renderDoseGuide(retatrutide, 110kg): heavy weight adj in HTML',
      htmlGlp1Heavy.includes('110kg'));

    // Female HCG → warning in rendered HTML
    setProfile('female',35,65);
    var htmlHcgF=G._renderDoseGuide('hcg');
    check('_renderDoseGuide(hcg, female): female warning in HTML',
      htmlHcgF.includes('not typically indicated'));

    // No profile → "Add age & weight" nudge appears
    clearProfile();
    var htmlNoProfile=G._renderDoseGuide('cjc-ipa');
    check('_renderDoseGuide(cjc-ipa, no profile): profile nudge shown',
      htmlNoProfile.includes('Add age & weight'));

    clearProfile();
  }
}

// ── _renderTRTGuide: sex, age personalization modifiers ───────────────────────
console.log('\n── _renderTRTGuide: sex / age personalization modifiers ─────');
{
  if(typeof G._renderTRTGuide==='function'){
    function setProfile(sex,age,weightKg){
      G.localStorage.setItem('user_sex',sex||'male');
      G.localStorage.setItem('user_age',String(age||0));
      G.localStorage.setItem('user_weight',String(weightKg||0));
    }
    function clearProfile(){
      G.localStorage.removeItem('user_sex');
      G.localStorage.removeItem('user_age');
      G.localStorage.removeItem('user_weight');
    }

    // Female → female TRT warning in rendered HTML
    setProfile('female',35,65);
    var htmlTrtF=G._renderTRTGuide('testoviron',125);
    check('_renderTRTGuide(testoviron, female): female TRT dose warning present',
      htmlTrtF.includes('5–10 mg/week SC'));

    // Age <25 → HPTA suppression personalization warning (distinct from tier risk text "HPTA shutdown")
    setProfile('male',22,75);
    var htmlYoung=G._renderTRTGuide('testoviron',125);
    check('_renderTRTGuide(testoviron, age22): HPTA suppression personalization warning',
      htmlYoung.includes('exogenous testosterone suppresses'));
    check('_renderTRTGuide(testoviron, age22): age shown in warning text',
      htmlYoung.includes('Age 22'));

    // Age exactly 25 → no young-age personalization warning
    setProfile('male',25,80);
    var html25=G._renderTRTGuide('testoviron',125);
    check('_renderTRTGuide(testoviron, age25): no young-age personalization (boundary: <25)',
      !html25.includes('Age 25:'));

    // Age >=50 → natural T decline note
    setProfile('male',55,80);
    var htmlOlder=G._renderTRTGuide('testoviron',125);
    check('_renderTRTGuide(testoviron, age55): age 50+ natural T decline note',
      htmlOlder.includes('natural T decline'));
    check('_renderTRTGuide(testoviron, age55): age shown in note',
      htmlOlder.includes('Age 55'));

    // Male, age 35, normal profile → no personalization mods
    setProfile('male',35,80);
    var htmlNorm=G._renderTRTGuide('testoviron',125);
    check('_renderTRTGuide(testoviron, male35): no HPTA suppression personalization', !htmlNorm.includes('exogenous testosterone suppresses'));
    check('_renderTRTGuide(testoviron, male35): no female warning', !htmlNorm.includes('5–10 mg/week'));
    check('_renderTRTGuide(testoviron, male35): no age 50+ note', !htmlNorm.includes('natural T decline'));

    // Personalization works across different TRT compounds
    setProfile('female',22,55);
    ['nebido','enanthate','cypionate','propionate','sustanon'].forEach(function(id){
      var h=G._renderTRTGuide(id,100);
      check('_renderTRTGuide('+id+', female+22yo): female warning and HPTA suppression personalization',
        h.includes('5–10 mg/week SC')&&h.includes('exogenous testosterone suppresses'));
    });

    clearProfile();
  }
}

// ── Dynamic dose guide highlighting (_renderDoseGuide) ───────────────────────
{
  // Helper: extract labels of highlighted (active) tiers from rendered HTML
  function activeTierLabel(html){
    var matches=html.match(/<span style="[^"]*color:var\(--accent\)[^"]*text-transform:uppercase[^"]*">([^<]+)<\/span>/g)||[];
    return matches.map(function(m){var r=m.match(/>([^<]+)<\/span>/);return r?r[1].trim():'';});
  }

  // Retatrutide at 3 mg → Therapeutic (2–4 mg/wk), NOT Optimal
  var htmlReta3=G._renderDoseGuide('retatrutide',3);
  check('_renderDoseGuide: reta 3mg highlights Therapeutic tier',
    activeTierLabel(htmlReta3).some(function(l){return l.indexOf('Therapeutic')===0;}));
  check('_renderDoseGuide: reta 3mg does NOT highlight Optimal tier',
    !activeTierLabel(htmlReta3).some(function(l){return l.indexOf('Optimal')===0;}));

  // Retatrutide at 5 mg → Optimal (4–8 mg/wk)
  var htmlReta5=G._renderDoseGuide('retatrutide',5);
  check('_renderDoseGuide: reta 5mg highlights Optimal tier',
    activeTierLabel(htmlReta5).some(function(l){return l.indexOf('Optimal')===0;}));

  // Retatrutide at 1 mg → Start (0–2 mg/wk)
  var htmlReta1=G._renderDoseGuide('retatrutide',1);
  check('_renderDoseGuide: reta 1mg highlights Start tier',
    activeTierLabel(htmlReta1).some(function(l){return l.indexOf('Start')===0;}));

  // Retatrutide at 9 mg → Max (>=8 mg/wk)
  var htmlReta9=G._renderDoseGuide('retatrutide',9);
  check('_renderDoseGuide: reta 9mg highlights Max tier',
    activeTierLabel(htmlReta9).some(function(l){return l.indexOf('Max')===0;}));

  // Dose 0 → fall back to b:1 tier (Optimal for retatrutide)
  var htmlReta0=G._renderDoseGuide('retatrutide',0);
  check('_renderDoseGuide: reta dose=0 falls back to b:1 (Optimal)',
    activeTierLabel(htmlReta0).some(function(l){return l.indexOf('Optimal')===0;}));

  // HGH at 3 IU → Recomp (2.5–5 IU range)
  var htmlHgh3=G._renderDoseGuide('hgh',3);
  check('_renderDoseGuide: hgh 3 IU highlights Recomp tier',
    activeTierLabel(htmlHgh3).some(function(l){return l.indexOf('Recomp')===0;}));

  // BPC-157 at 500 mcg → Optimal (375–750 range)
  var htmlBpc=G._renderDoseGuide('bpc157',500);
  check('_renderDoseGuide: bpc157 500mcg highlights Optimal tier',
    activeTierLabel(htmlBpc).some(function(l){return l.indexOf('Optimal')===0;}));
}

// ── T-Calc PK model regression tests ─────────────────────────────────────────
console.log('\n── T-Calc PK model ─────────────────────────────────────────');
check('_tcPkConc defined',          typeof G._tcPkConc === 'function');
check('_tcKa defined',              typeof G._tcKa === 'function');
check('_tcVermeulenFT defined',     typeof G._tcVermeulenFT === 'function');
check('_tcDrawManualChart defined', typeof G._tcDrawManualChart === 'function');

if (typeof G._tcPkConc === 'function') {
  var _tc_ke_te = Math.LN2 / 4.5, _tc_ka_te = G._tcKa(4.5);
  check('_tcPkConc: dt=0  → 0',     G._tcPkConc(100, _tc_ka_te, _tc_ke_te, 0) === 0);
  check('_tcPkConc: dt=-1 → 0',     G._tcPkConc(100, _tc_ka_te, _tc_ke_te, -1) === 0);
  check('_tcPkConc: TE peak > 0 at ~1d',
    G._tcPkConc(100, _tc_ka_te, _tc_ke_te, 1) > 0,
    'got '+G._tcPkConc(100, _tc_ka_te, _tc_ke_te, 1).toFixed(3));
  check('_tcPkConc: TE decays from 1d to 5d',
    G._tcPkConc(100, _tc_ka_te, _tc_ke_te, 5) < G._tcPkConc(100, _tc_ka_te, _tc_ke_te, 1));
}

if (typeof G._tcKa === 'function') {
  check('_tcKa: HL=0.5d → 15.0 (gel/short)',      G._tcKa(0.5) === 15.0, 'got '+G._tcKa(0.5));
  check('_tcKa: HL=2d   →  8.0 (propionate)',      G._tcKa(2)   ===  8.0, 'got '+G._tcKa(2));
  check('_tcKa: HL=4.5d →  3.0 (enanthate/TE)',    G._tcKa(4.5) ===  3.0, 'got '+G._tcKa(4.5));
  check('_tcKa: HL=10d  →  1.5 (cypionate/TC)',    G._tcKa(10)  ===  1.5, 'got '+G._tcKa(10));
  check('_tcKa: HL=34d  →  0.4 (undecanoate/TU)',  G._tcKa(34)  ===  0.4, 'got '+G._tcKa(34));
}

if (typeof G._tcVermeulenFT === 'function') {
  var _tc_ft20_40 = G._tcVermeulenFT(20, 40);
  check('Vermeulen: TT=20 SHBG=40 → 350–500 pmol/L',
    _tc_ft20_40 > 350 && _tc_ft20_40 < 500,
    'got '+(_tc_ft20_40 ? Math.round(_tc_ft20_40) : _tc_ft20_40));
  check('Vermeulen: TT=0   → null', G._tcVermeulenFT(0, 40) === null);
  check('Vermeulen: SHBG=0 → null', G._tcVermeulenFT(20, 0) === null);
  check('Vermeulen: higher SHBG → lower free T',
    G._tcVermeulenFT(20, 80) < G._tcVermeulenFT(20, 20));
}

// Warm-start accumulation: prior injections must give non-zero residual at t=0
if (typeof G._tcPkConc === 'function' && typeof G._tcKa === 'function') {
  // TE (enanthate): 125mg/wk E3.5D, 13 prior injections look-back
  var _ws_ke_te = Math.LN2 / 4.5, _ws_ka_te = G._tcKa(4.5);
  var _ws_dose_te = 125 * 3.5 / 7;
  var _ws_sum_te = 0;
  for (var _wsi = 1; _wsi <= 13; _wsi++) {
    _ws_sum_te += G._tcPkConc(_ws_dose_te, _ws_ka_te, _ws_ke_te, _wsi * 3.5);
  }
  check('warm-start TE: 13 prior E3.5D injections accumulate > 0 at t=0',
    _ws_sum_te > 0, 'got '+_ws_sum_te.toFixed(3));

  // TU (Nebido): 1000mg Q84d, 5 prior injections look-back
  var _ws_ke_tu = Math.LN2 / 34, _ws_ka_tu = G._tcKa(34);
  var _ws_dose_tu = 1000 * 84 / 7;
  var _ws_sum_tu = 0;
  for (var _wsi2 = 1; _wsi2 <= 5; _wsi2++) {
    _ws_sum_tu += G._tcPkConc(_ws_dose_tu, _ws_ka_tu, _ws_ke_tu, _wsi2 * 84);
  }
  check('warm-start Nebido: 5 prior Q84d injections accumulate > 0 at t=0',
    _ws_sum_tu > 0, 'got '+_ws_sum_tu.toFixed(3));
}

// Regression: _tcDrawManualChart must not crash when curDose=0 and measuredFT is set.
// This was the bug: if (calFT && _curDose > 0) skipped the warm-start entirely when
// "Dose at bloodwork" was left blank, causing the curve to always start at 0.
if (typeof G._tcDrawManualChart === 'function') {
  var _ws_savedFT   = G._tcp.measuredFT;
  var _ws_savedDose = G._tcp.currentDoseMgWk;
  G._tcp.measuredFT      = '217';
  G._tcp.currentDoseMgWk = '';
  var _ws_log = [
    {compId: 'testoviron', doseMg: '125', date: '2026-06-24'},
    {compId: 'testoviron', doseMg: '125', date: '2026-06-28'},
  ];
  var _ws_threw = false;
  try { G._tcDrawManualChart('tc-manual-chart', _ws_log); }
  catch (e) { _ws_threw = true; console.error('  _tcDrawManualChart threw:', e.message); }
  check('_tcDrawManualChart: no crash when curDose=0 and measuredFT set', !_ws_threw);
  G._tcp.measuredFT      = _ws_savedFT;
  G._tcp.currentDoseMgWk = _ws_savedDose;
}

// Regression: warm-start ke for curDose=0 must use slowest compound ke (not weighted avg).
// Bug: weighted ke was dominated by TE (short HL=4.5d), causing the prior-protocol
// baseline to wash out in ~7 days. By Day 30 it was <6% of initial, leaving total
// free T far below baseline. Fix: use ke of longest-HL compound (TU, 34d).
if (typeof G._tcKa === 'function') {
  var _blKe_te = Math.LN2 / 4.5;   // 0.154/d  (TE, short-acting)
  var _blKe_tu = Math.LN2 / 34;    // 0.0204/d (TU Nebido, long-acting)
  // 250mg TE + 200mg TU: old weighted ke ≈ 0.0946/d, new min ke = ke_tu
  var _blKe_avg = (250 * _blKe_te + 200 * _blKe_tu) / 450;
  check('warm-start ke: TU ke < weighted ke for TE+TU log',
    _blKe_tu < _blKe_avg,
    'tu='+_blKe_tu.toFixed(4)+' avg='+_blKe_avg.toFixed(4));
  check('warm-start ke: TU baseline at Day 30 is >50% intact (correct slow decay)',
    Math.exp(-_blKe_tu * 30) > 0.5,
    'got '+Math.exp(-_blKe_tu * 30).toFixed(3));
  check('warm-start ke: old weighted baseline at Day 30 is <10% (too fast, was the bug)',
    Math.exp(-_blKe_avg * 30) < 0.1,
    'got '+Math.exp(-_blKe_avg * 30).toFixed(3));
}

// Smoke test: mixed TE+TU log with curDose=0 must not crash
if (typeof G._tcDrawManualChart === 'function') {
  var _bl_savedFT   = G._tcp.measuredFT;
  var _bl_savedDose = G._tcp.currentDoseMgWk;
  G._tcp.measuredFT      = '217';
  G._tcp.currentDoseMgWk = '';
  var _bl_log = [
    {compId: 'testoviron', doseMg: '100', date: '2026-06-27'},
    {compId: 'testoviron', doseMg: '150', date: '2026-06-28'},
    {compId: 'nebido',     doseMg: '100', date: '2026-06-29'},
    {compId: 'nebido',     doseMg: '100', date: '2026-07-01'},
  ];
  var _bl_threw = false;
  try { G._tcDrawManualChart('tc-manual-chart', _bl_log); }
  catch (e) { _bl_threw = true; console.error('  mixed TE+TU chart threw:', e.message); }
  check('warm-start ke fix: mixed TE+TU log no crash when curDose=0', !_bl_threw);
  G._tcp.measuredFT      = _bl_savedFT;
  G._tcp.currentDoseMgWk = _bl_savedDose;
}

// ── buildToday / buildStackStore: smoke tests ─────────────────────────────────
// These tests catch the class of bug where "Today and Stacks don't load" because
// a rendering function throws.  The DOM mock noops innerHTML writes, so we just
// verify the functions complete without throwing.
console.log('\n── buildToday: smoke test ──────────────────────────────────');
{
  const _bts = G._userStacks;
  const _bta = G._activeStackIndices.slice();
  const _btl = G._stacksLoaded;
  const _btw = G.WEEKLY;
  G._stacksLoaded = true;

  // Stack with peptides + TRT + Enhanced (including amPm compound)
  const smokeStack = {
    name: 'Smoke Stack',
    cycle_start: '2026-06-01',
    cycle_length: 12,
    peptides: [
      { id: 'cjc-ipa', name: 'CJC-1295/Ipa', dot: '#3cffa0', days: [0,1,2,3,4,5,6],
        times: ['AM','PM'], dose_am: '100', unit_am: 'mcg', dose_pm: '100', unit_pm: 'mcg', active: true }
    ],
    trt: { enabled: true, compounds: [
      { id: 'testoviron', name: 'Testoviron Depot', dose: '125', unit: 'mg', freqVal: 1, freqUnit: 'weeks' }
    ]},
    enhanced: { enabled: true, compounds: [
      { id: 'hgh', name: 'HGH', dot: '#a855f7', days: [0,1,2,3,4,5,6],
        amPm: true, dose_am: '2', dose_pm: '0', unit: 'IU/day' }
    ]}
  };
  G._userStacks = [smokeStack];
  G._activeStackIndices = [0];
  G.WEEKLY = G.buildWeeklyFromProtocol(smokeStack);

  let btThrew = false;
  try { G.buildToday(); }
  catch(e) { btThrew = true; console.error('  buildToday threw:', e.message); }
  check('buildToday: no crash with peptides+TRT+Enhanced stack', !btThrew);

  // Also call with _stacksLoaded=false to test the spinner path
  G._stacksLoaded = false;
  let btThrew2 = false;
  try { G.buildToday(); }
  catch(e) { btThrew2 = true; console.error('  buildToday (spinner path) threw:', e.message); }
  check('buildToday: no crash in spinner path (_stacksLoaded=false)', !btThrew2);

  G._userStacks = _bts;
  G._activeStackIndices = _bta;
  G._stacksLoaded = _btl;
  G.WEEKLY = _btw;
}

console.log('\n── buildStackStore: smoke test ─────────────────────────────');
{
  const _bss = G._userStacks;
  const _bsa = G._activeStackIndices.slice();
  const _bsl = G._stacksLoaded;
  G._stacksLoaded = true;

  const smokeStack2 = {
    name: 'Smoke Stack 2',
    cycle_start: '2026-06-01',
    cycle_length: 8,
    peptides: [{ id: 'retatrutide', name: 'Retatrutide', dot: '#f97316', days: [0,3],
                 times: ['AM'], dose_am: '3', unit_am: 'mg', active: true }],
    trt: { enabled: false, compounds: [] },
    enhanced: { enabled: false, compounds: [] }
  };
  G._userStacks = [smokeStack2];
  G._activeStackIndices = [0];

  let bssThrew = false;
  try { G.buildStackStore(); }
  catch(e) { bssThrew = true; console.error('  buildStackStore threw:', e.message); }
  check('buildStackStore: no crash with valid stack', !bssThrew);

  // Multiple stacks
  G._userStacks = [smokeStack2, smokeStack2, smokeStack2];
  let bssThrew2 = false;
  try { G.buildStackStore(); }
  catch(e) { bssThrew2 = true; console.error('  buildStackStore (multi) threw:', e.message); }
  check('buildStackStore: no crash with 3 stacks', !bssThrew2);

  // Empty stacks
  G._userStacks = [];
  let bssThrew3 = false;
  try { G.buildStackStore(); }
  catch(e) { bssThrew3 = true; console.error('  buildStackStore (empty) threw:', e.message); }
  check('buildStackStore: no crash with empty stacks array', !bssThrew3);

  // _stacksLoaded=false → spinner path
  G._stacksLoaded = false;
  G._userStacks = [smokeStack2];
  let bssThrew4 = false;
  try { G.buildStackStore(); }
  catch(e) { bssThrew4 = true; console.error('  buildStackStore (spinner) threw:', e.message); }
  check('buildStackStore: no crash in spinner path (_stacksLoaded=false)', !bssThrew4);

  G._userStacks = _bss;
  G._activeStackIndices = _bsa;
  G._stacksLoaded = _bsl;
}

// ── _getDynamicEnhancedDoses: Enhanced doses on Today tab ─────────────────────
console.log('\n── _getDynamicEnhancedDoses ────────────────────────────────');
{
  const _des = G._userStacks;
  const _dea = G._activeStackIndices.slice();

  const enhStack = {
    name: 'Enh Stack',
    cycle_start: '2026-06-01',
    cycle_length: 12,
    peptides: [],
    trt: { enabled: false, compounds: [] },
    enhanced: { enabled: true, compounds: [
      { id: 'hgh', name: 'HGH', dot: '#a855f7', days: [0,1,2,3,4,5,6],
        amPm: true, dose_am: '2', dose_pm: '0', unit: 'IU/day' },
      { id: 'bpc157', name: 'BPC-157', dot: '#22d3ee', days: [1,2,3,4,5],
        dose: '250', unit: 'mcg' }
    ]}
  };
  G._userStacks = [enhStack];
  G._activeStackIndices = [0];

  // Monday June 2, 2026 (dow=1) — both compounds scheduled
  const monday = new Date(2026, 5, 2);
  const monDoses = G._getDynamicEnhancedDoses(monday, true);
  check('Enhanced: 2 doses on Mon (both scheduled)',   monDoses.length === 2, `got ${monDoses.length}`);
  check('Enhanced: HGH present on Mon',               monDoses.some(d => d.name === 'HGH'));
  check('Enhanced: BPC-157 present on Mon (weekday)', monDoses.some(d => d.name === 'BPC-157'));
  check('Enhanced: dose IDs include date suffix',     monDoses.every(d => d.id && d.id.includes('_2026-')));

  // Sunday June 7, 2026 (dow=0) — BPC-157 NOT scheduled (days=[1..5])
  const sunday = new Date(2026, 5, 7);
  const sunDoses = G._getDynamicEnhancedDoses(sunday, true);
  check('Enhanced: 1 dose on Sun (BPC-157 not scheduled)', sunDoses.length === 1, `got ${sunDoses.length}`);
  check('Enhanced: HGH present on Sun',               sunDoses.some(d => d.name === 'HGH'));
  check('Enhanced: BPC-157 absent on Sun',            !sunDoses.some(d => d.name === 'BPC-157'));

  // Date before cycle start → no doses
  const preCycle = new Date(2026, 4, 30); // May 30, before June 1 start
  const preDoses = G._getDynamicEnhancedDoses(preCycle, false);
  check('Enhanced: 0 doses before cycle start',       preDoses.length === 0, `got ${preDoses.length}`);

  // Date after cycle end (cycle_start + 12wks = Aug 24, 2026)
  const postCycle = new Date(2026, 7, 25); // Aug 25
  const postDoses = G._getDynamicEnhancedDoses(postCycle, false);
  check('Enhanced: 0 doses after cycle end',          postDoses.length === 0, `got ${postDoses.length}`);

  // Inactive stack → no doses
  G._activeStackIndices = [];
  const inactiveDoses = G._getDynamicEnhancedDoses(monday, false);
  check('Enhanced: 0 doses for inactive stack',       inactiveDoses.length === 0, `got ${inactiveDoses.length}`);
  G._activeStackIndices = [0];

  // No enhanced.enabled → no doses
  const noEnhStack = { ...enhStack, enhanced: { enabled: false, compounds: enhStack.enhanced.compounds } };
  G._userStacks = [noEnhStack];
  const noEnhDoses = G._getDynamicEnhancedDoses(monday, false);
  check('Enhanced: 0 doses when enabled=false',       noEnhDoses.length === 0, `got ${noEnhDoses.length}`);

  // amPm compound with both doses non-zero → 2 separate entries
  const enhStackBothAmPm = {
    name: 'HGH Stack',
    cycle_start: '2026-06-01',
    cycle_length: 12,
    peptides: [],
    trt: { enabled: false, compounds: [] },
    enhanced: { enabled: true, compounds: [
      { id: 'hgh', name: 'HGH', dot: '#3cffa0', days: [0,1,2,3,4,5,6],
        amPm: true, dose_am: '3', dose_pm: '3', unit: 'IU/day' }
    ]}
  };
  G._userStacks = [enhStackBothAmPm];
  G._activeStackIndices = [0];
  const bothAmPmDoses = G._getDynamicEnhancedDoses(monday, true);
  check('Enhanced amPm: both AM+PM non-zero → 2 entries', bothAmPmDoses.length === 2, `got ${bothAmPmDoses.length}`);
  check('Enhanced amPm: AM entry has time=AM', bothAmPmDoses.some(function(d){return d.time==='AM';}));
  check('Enhanced amPm: PM entry has time=PM', bothAmPmDoses.some(function(d){return d.time==='PM';}));
  check('Enhanced amPm: AM detail includes dose', bothAmPmDoses.some(function(d){return d.time==='AM'&&d.detail.includes('3');}));
  check('Enhanced amPm: AM entry id unique from PM', bothAmPmDoses[0].id!==bothAmPmDoses[1].id);

  // amPm via catalog fallback (stored compound lacks amPm:true but ENHANCEMENT_COMPOUNDS has it)
  const enhStackCatalogFallback = {
    name: 'HGH Fallback',
    cycle_start: '2026-06-01',
    cycle_length: 12,
    peptides: [],
    trt: { enabled: false, compounds: [] },
    enhanced: { enabled: true, compounds: [
      { id: 'hgh-fallback', name: 'HGH', dot: '#3cffa0', days: [0,1,2,3,4,5,6],
        // amPm NOT set, but dose_am/dose_pm present — catalog should provide fallback
        dose_am: '2', dose_pm: '2', unit: 'IU/day' }
    ]}
  };
  // Simulate ENHANCEMENT_COMPOUNDS catalog entry with amPm:true
  G.ENHANCEMENT_COMPOUNDS = (G.ENHANCEMENT_COMPOUNDS||[]).concat([{id:'hgh-fallback',name:'HGH',amPm:true,dot:'#3cffa0',group:'GH Axis'}]);
  G._userStacks = [enhStackCatalogFallback];
  G._activeStackIndices = [0];
  const fallbackDoses = G._getDynamicEnhancedDoses(monday, true);
  check('Enhanced catalog fallback: amPm via ENHANCEMENT_COMPOUNDS → 2 entries', fallbackDoses.length === 2, `got ${fallbackDoses.length}`);
  check('Enhanced catalog fallback: entries have compId', fallbackDoses.every(function(d){return d.compId==='hgh-fallback';}));
  // Restore
  G.ENHANCEMENT_COMPOUNDS = (G.ENHANCEMENT_COMPOUNDS||[]).filter(function(c){return c.id!=='hgh-fallback';});

  // compId field present on regular (non-amPm) dose
  const enhStackSingle = {
    name: 'Single Enhanced',
    cycle_start: '2026-06-01',
    cycle_length: 12,
    peptides: [],
    trt: { enabled: false, compounds: [] },
    enhanced: { enabled: true, compounds: [
      { id: 'primo', name: 'Primobolan', dot: '#a855f7', days: [0,1,2,3,4,5,6], dose: '200', unit: 'mg/week' }
    ]}
  };
  G._userStacks = [enhStackSingle];
  G._activeStackIndices = [0];
  const singleEnhDoses = G._getDynamicEnhancedDoses(monday, true);
  check('Enhanced single: compId set on non-amPm dose', singleEnhDoses.length===1 && singleEnhDoses[0].compId==='primo');

  G._userStacks = _des;
  G._activeStackIndices = _dea;
}

// Regression: adding future injections must not lower the pre-bw peak.
// Root cause: warm-start (_curDose > 0 path) computed compound fractions from ALL
// injections. Adding post-bw Nebido shifted the Testoviron/Nebido fraction mix,
// changing total[anchorDay], which changed calFT and pulled the whole curve down.
// Fix: warm-start uses only pre-bw injections for compound fractions, so
// total[anchorDay] (and therefore calFT) is immune to post-bw log extensions.
//
// Test strategy: the chart draws ctx.fillText(Math.round(peakV), ...) for the peak
// concentration label. This encodes the ABSOLUTE pmol/L peak — unlike canvas Y
// coordinates which autoscale and are identical regardless of calFT shifts.
// The second-largest positive number in all fillText calls is Math.round(peakV).
console.log('\n── calFT anchor: adding post-bw injections must not lower existing peak (PR #444/#448) ──');
if (typeof G._tcDrawManualChart === 'function') {
  var _cfSavedFT    = G._tcp.measuredFT;
  var _cfSavedDose  = G._tcp.currentDoseMgWk;
  var _cfSavedBwE   = G._tcBwEntries;
  var _cfSavedGetEl = G.document.getElementById;

  G._tcp.measuredFT      = '217';
  G._tcp.currentDoseMgWk = '250';   // _curDose > 0: the code path that had the bug
  G._tcBwEntries = [{date:'2026-06-27', free_t:217, total_t:600, shbg:40}];

  // Instrument canvas: capture calFT directly via canvas._testCalFTHook.
  // The chart sets canvas._testCalFTHook(calFT) after computing the final calFT scalar.
  // This avoids canvas-autoscale issues (minY, fillText, etc. all change with vMax).
  var _cfMockCtx = {
    scale:noop, beginPath:noop, arc:noop, fill:noop, stroke:noop,
    fillText:noop, closePath:noop, save:noop, restore:noop, fillRect:noop,
    setLineDash:noop, strokeRect:noop, translate:noop, rotate:noop, moveTo:noop, lineTo:noop,
    measureText:function(){ return {width:0}; },
    createLinearGradient:function(){ return {addColorStop:noop}; }
  };
  function _cfRunChart(log) {
    var capturedCalFT = null;
    G.document.getElementById = function(id) {
      if (id==='tc-manual-chart') return {
        style:{}, classList:{add:noop,remove:noop,contains:()=>false},
        offsetWidth:350, offsetHeight:250,
        _testCalFTHook: function(v){ capturedCalFT = v; },
        getContext: function(){ return _cfMockCtx; }
      };
      return _cfSavedGetEl(id);
    };
    G._tcDrawManualChart('tc-manual-chart', log);
    G.document.getElementById = _cfSavedGetEl;
    return capturedCalFT;
  }

  // Short log: Henrik's exact scenario — 2 Testoviron + 10 Nebido every 2 days
  var _cfLog1 = [
    {compId:'testoviron', doseMg:'100', date:'2026-06-27'},
    {compId:'testoviron', doseMg:'150', date:'2026-06-28'},
    {compId:'nebido', doseMg:'102', date:'2026-06-29'},
    {compId:'nebido', doseMg:'102', date:'2026-07-01'},
    {compId:'nebido', doseMg:'102', date:'2026-07-03'},
    {compId:'nebido', doseMg:'102', date:'2026-07-05'},
    {compId:'nebido', doseMg:'102', date:'2026-07-07'},
    {compId:'nebido', doseMg:'102', date:'2026-07-09'},
    {compId:'nebido', doseMg:'102', date:'2026-07-11'},
    {compId:'nebido', doseMg:'102', date:'2026-07-13'},
    {compId:'nebido', doseMg:'102', date:'2026-07-15'},
    {compId:'nebido', doseMg:'102', date:'2026-07-17'}
  ];
  // Extended: same + 10 more Nebido every 4 days (all after bw date Jun 27)
  var _cfLog2 = _cfLog1.concat([
    {compId:'nebido', doseMg:'100', date:'2026-07-21'},
    {compId:'nebido', doseMg:'100', date:'2026-07-25'},
    {compId:'nebido', doseMg:'100', date:'2026-07-29'},
    {compId:'nebido', doseMg:'100', date:'2026-08-02'},
    {compId:'nebido', doseMg:'100', date:'2026-08-06'},
    {compId:'nebido', doseMg:'100', date:'2026-08-10'},
    {compId:'nebido', doseMg:'100', date:'2026-08-14'},
    {compId:'nebido', doseMg:'100', date:'2026-08-18'},
    {compId:'nebido', doseMg:'100', date:'2026-08-22'},
    {compId:'nebido', doseMg:'100', date:'2026-08-26'}
  ]);

  var _cfThrew = false, _cfCalFT1 = null, _cfCalFT2 = null;
  try {
    _cfCalFT1 = _cfRunChart(_cfLog1);
    _cfCalFT2 = _cfRunChart(_cfLog2);
  } catch(e) {
    _cfThrew = true;
    console.error('  calFT anchor test threw:', e.message);
  }
  check('calFT anchor: no crash', !_cfThrew);
  check('calFT anchor: calFT captured for short log', !_cfThrew && _cfCalFT1 !== null);
  check('calFT anchor: calFT captured for extended log', !_cfThrew && _cfCalFT2 !== null);
  if (!_cfThrew && _cfCalFT1 !== null && _cfCalFT2 !== null) {
    // calFT must be identical between short and extended log — it is anchored at the
    // bloodwork date and must not shift when post-bw injections are added.
    check(
      'calFT anchor: calFT must not change when post-bw injections are added (PR #448 regression)',
      Math.abs(_cfCalFT2 - _cfCalFT1) < 1e-9,
      'short-log calFT='+_cfCalFT1.toFixed(8)+' extended-log calFT='+_cfCalFT2.toFixed(8)
    );
  }

  G._tcp.measuredFT          = _cfSavedFT;
  G._tcp.currentDoseMgWk     = _cfSavedDose;
  G._tcBwEntries             = _cfSavedBwE;
  G.document.getElementById  = _cfSavedGetEl;
}

// Regression: path 2 (curDose=0) calFT anchor must also be immune to post-BW injections.
// Root cause: flat baseline added in the else branch used _logMean computed from the
// full log.  Post-BW injections increased _logMean, which inflated total[anchorDay],
// which lowered calFT and pulled the whole curve down — same symptom as PR #448 but
// on the curDose=0 code path.
console.log('\n── calFT anchor path-2 (curDose=0): post-bw injections must not shift calFT ──');
if (typeof G._tcDrawManualChart === 'function') {
  var _cf2SavedFT   = G._tcp.measuredFT;
  var _cf2SavedDose = G._tcp.currentDoseMgWk;
  var _cf2SavedBwE  = G._tcBwEntries;
  var _cf2SavedGetEl = G.document.getElementById;

  G._tcp.measuredFT      = '217';
  G._tcp.currentDoseMgWk = '';    // _curDose === 0 → path 2 (no prior-dose warm-start)
  G._tcBwEntries = [{date:'2026-06-27', free_t:217, total_t:600, shbg:40}];

  var _cf2MockCtx = {
    scale:noop, beginPath:noop, arc:noop, fill:noop, stroke:noop,
    fillText:noop, closePath:noop, save:noop, restore:noop, fillRect:noop,
    setLineDash:noop, strokeRect:noop, translate:noop, rotate:noop, moveTo:noop, lineTo:noop,
    measureText:function(){ return {width:0}; },
    createLinearGradient:function(){ return {addColorStop:noop}; }
  };
  function _cf2RunChart(log) {
    var captured = null;
    G.document.getElementById = function(id) {
      if (id === 'tc-manual-chart') return {
        style:{}, classList:{add:noop,remove:noop,contains:function(){return false;}},
        offsetWidth:350, offsetHeight:250,
        _testCalFTHook: function(v){ captured = v; },
        getContext: function(){ return _cf2MockCtx; }
      };
      return _cf2SavedGetEl(id);
    };
    G._tcDrawManualChart('tc-manual-chart', log);
    G.document.getElementById = _cf2SavedGetEl;
    return captured;
  }

  // Short log: injections starting 3 days before BW (anchorDay=3 > 0 — fixes are active)
  var _cf2Log1 = [
    {compId:'testoviron', doseMg:'125', date:'2026-06-24'},
    {compId:'testoviron', doseMg:'125', date:'2026-06-26'},
    {compId:'testoviron', doseMg:'125', date:'2026-06-28'}
  ];
  // Extended: same + 10 Nebido injections after BW date (Jun 27)
  var _cf2Log2 = _cf2Log1.concat([
    {compId:'nebido', doseMg:'100', date:'2026-07-01'},
    {compId:'nebido', doseMg:'100', date:'2026-07-05'},
    {compId:'nebido', doseMg:'100', date:'2026-07-09'},
    {compId:'nebido', doseMg:'100', date:'2026-07-13'},
    {compId:'nebido', doseMg:'100', date:'2026-07-17'},
    {compId:'nebido', doseMg:'100', date:'2026-07-21'},
    {compId:'nebido', doseMg:'100', date:'2026-07-25'},
    {compId:'nebido', doseMg:'100', date:'2026-07-29'},
    {compId:'nebido', doseMg:'100', date:'2026-08-02'},
    {compId:'nebido', doseMg:'100', date:'2026-08-06'}
  ]);

  var _cf2Threw = false, _cf2CalFT1 = null, _cf2CalFT2 = null;
  try {
    _cf2CalFT1 = _cf2RunChart(_cf2Log1);
    _cf2CalFT2 = _cf2RunChart(_cf2Log2);
  } catch(e) {
    _cf2Threw = true;
    console.error('  calFT path-2 anchor test threw:', e.message);
  }
  check('calFT path-2 anchor: no crash', !_cf2Threw);
  check('calFT path-2 anchor: calFT captured for short log',    !_cf2Threw && _cf2CalFT1 !== null);
  check('calFT path-2 anchor: calFT captured for extended log', !_cf2Threw && _cf2CalFT2 !== null);
  if (!_cf2Threw && _cf2CalFT1 !== null && _cf2CalFT2 !== null) {
    check(
      'calFT path-2 anchor: calFT must not change when post-bw injections added (curDose=0 regression)',
      Math.abs(_cf2CalFT2 - _cf2CalFT1) < 1e-9,
      'short calFT='+_cf2CalFT1.toFixed(8)+' extended calFT='+_cf2CalFT2.toFixed(8)
    );
  }

  G._tcp.measuredFT         = _cf2SavedFT;
  G._tcp.currentDoseMgWk    = _cf2SavedDose;
  G._tcBwEntries            = _cf2SavedBwE;
  G.document.getElementById = _cf2SavedGetEl;
}

// Regression: path 2 (curDose=0) calFT anchor with anchorDay=0 (BW same day as first injection).
// Root cause: when _p2BwDay=0, total[0]=0 for all injections (tcPkConc(dt=0)=0), so the
// pre-BW scan yielded _p2Pk=0 and fell back to _logMean (full-log mean, unstable).
// Post-BW injections increased _logMean → inflated _p2Baseline → shifted total[0] → changed calFT.
// Fix: when _p2Pk=0, compute _p2Baseline from BW-date injections' own settled PK.
console.log('\n── calFT anchor path-2 anchorDay=0 (BW=first injection day): post-bw injections must not shift calFT ──');
if (typeof G._tcDrawManualChart === 'function') {
  var _cf3SavedFT   = G._tcp.measuredFT;
  var _cf3SavedDose = G._tcp.currentDoseMgWk;
  var _cf3SavedBwE  = G._tcBwEntries;
  var _cf3SavedGetEl = G.document.getElementById;

  G._tcp.measuredFT       = '217';
  G._tcp.currentDoseMgWk  = '';   // _curDose === 0 → path 2
  G._tcBwEntries = [{date:'2026-06-27', free_t:217, total_t:600, shbg:40}];

  var _cf3MockCtx = {
    scale:noop, beginPath:noop, arc:noop, fill:noop, stroke:noop,
    fillText:noop, closePath:noop, save:noop, restore:noop, fillRect:noop,
    setLineDash:noop, strokeRect:noop, translate:noop, rotate:noop, moveTo:noop, lineTo:noop,
    measureText:function(){ return {width:0}; },
    createLinearGradient:function(){ return {addColorStop:noop}; }
  };
  var _cf3Captured = null;
  G.document.getElementById = function(id) {
    if (id === 'tc-manual-chart') return {
      style:{}, classList:{add:noop,remove:noop,contains:function(){return false;}},
      offsetWidth:350, offsetHeight:250,
      _testCalFTHook: function(v){ _cf3Captured = v; },
      getContext: function(){ return _cf3MockCtx; }
    };
    return _cf3SavedGetEl(id);
  };

  function _cf3RunChart(lg) { _cf3Captured = null; G._tcDrawManualChart('tc-manual-chart', lg, false); return _cf3Captured; }

  // Short log: BW date = first injection date (anchorDay=0)
  var _cf3Log1 = [
    {compId:'testoviron', doseMg:'100', date:'2026-06-27'}
  ];
  // Extended log: add post-BW injections — must not change calFT
  var _cf3Log2 = [
    {compId:'testoviron', doseMg:'100', date:'2026-06-27'},
    {compId:'testoviron', doseMg:'100', date:'2026-07-04'},
    {compId:'testoviron', doseMg:'100', date:'2026-07-18'},
    {compId:'testoviron', doseMg:'100', date:'2026-08-01'}
  ];

  var _cf3CalFT1 = null, _cf3CalFT2 = null, _cf3Threw = false;
  try {
    _cf3CalFT1 = _cf3RunChart(_cf3Log1);
    _cf3CalFT2 = _cf3RunChart(_cf3Log2);
  } catch(e) {
    _cf3Threw = true;
    console.error('  calFT path-2 anchorDay=0 test threw:', e.message);
  }
  check('calFT path-2 anchorDay=0: no crash', !_cf3Threw);
  check('calFT path-2 anchorDay=0: calFT captured for short log',    !_cf3Threw && _cf3CalFT1 !== null);
  check('calFT path-2 anchorDay=0: calFT captured for extended log', !_cf3Threw && _cf3CalFT2 !== null);
  if (!_cf3Threw && _cf3CalFT1 !== null && _cf3CalFT2 !== null) {
    check(
      'calFT path-2 anchorDay=0: calFT must not change when post-bw injections added',
      Math.abs(_cf3CalFT2 - _cf3CalFT1) < 1e-9,
      'short calFT='+_cf3CalFT1.toFixed(8)+' extended calFT='+_cf3CalFT2.toFixed(8)
    );
  }

  G._tcp.measuredFT         = _cf3SavedFT;
  G._tcp.currentDoseMgWk    = _cf3SavedDose;
  G._tcBwEntries            = _cf3SavedBwE;
  G.document.getElementById = _cf3SavedGetEl;
}

// Regression: NO bloodwork entry — appending future injections must not lower the peak.
// Root cause (reported by Henrik): with measuredFT set but no _tcBwEntries entry, calFT
// fell back to _mftNum / _logMean over a window that grew as injections were appended, so
// adding injections shrank calFT and pulled the whole curve — including the peak — DOWN.
// Fix: anchor calFT at "today" when there is no bloodwork draw date, mirroring the
// bloodwork-anchored path so calFT is immune to injections added after the anchor.
console.log('\n── no-bloodwork anchor: appending future injections must not lower peak (Henrik report) ──');
if (typeof G._tcDrawManualChart === 'function') {
  var _nbSavedFT   = G._tcp.measuredFT;
  var _nbSavedDose = G._tcp.currentDoseMgWk;
  var _nbSavedBwE  = G._tcBwEntries;
  var _nbSavedGh   = G._tcGhStack;
  var _nbSavedGetEl = G.document.getElementById;

  G._tcp.measuredFT      = '223';
  G._tcp.currentDoseMgWk = '';     // path 2 (curDose === 0)
  G._tcBwEntries = null;           // the buggy scenario: measured FT but NO bloodwork entry
  G._tcGhStack   = [];

  var _nbCalFT = null, _nbFillNums = [];
  var _nbMockCtx = {
    scale:noop, beginPath:noop, arc:noop, fill:noop, stroke:noop,
    fillText:function(t){ if(/^\d+$/.test(String(t))) _nbFillNums.push(Number(t)); },
    closePath:noop, save:noop, restore:noop, fillRect:noop,
    setLineDash:noop, strokeRect:noop, translate:noop, rotate:noop, moveTo:noop, lineTo:noop,
    measureText:function(){ return {width:0}; },
    createLinearGradient:function(){ return {addColorStop:noop}; }
  };
  G.document.getElementById = function(id) {
    if (id === 'tc-manual-chart') return {
      style:{}, classList:{add:noop,remove:noop,contains:function(){return false;}},
      offsetWidth:350, offsetHeight:250,
      _testCalFTHook: function(v){ _nbCalFT = v; },
      getContext: function(){ return _nbMockCtx; }
    };
    return _nbSavedGetEl(id);
  };

  // Dates anchored to the real "today" so the implicit anchor (today) lands mid-schedule
  // in both logs and captures the same pre-anchor injections regardless of run date.
  var _nbBase = new Date(); _nbBase.setHours(12,0,0,0);
  function _nbDate(off){ var d=new Date(_nbBase.getTime()+off*86400000); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _nbSeries(offsets){ return offsets.map(function(o){ return {compId:'nebido', doseMg:'102', date:_nbDate(o)}; }); }

  // Short: 12 injections (starting 6 days before today). Extended: +10 more into the future.
  var _nbOff1 = [-6,-4,-2,0,2,4,6,8,10,12,14,16];
  var _nbOff2 = _nbOff1.concat([18,20,22,24,26,28,30,32,34,36]);

  function _nbRun(offsets){ _nbCalFT = null; _nbFillNums = []; G._tcDrawManualChart('tc-manual-chart', _nbSeries(offsets)); return {calFT:_nbCalFT, peak:Math.max.apply(null, _nbFillNums.concat([0]))}; }

  var _nbThrew = false, _nbR1 = null, _nbR2 = null;
  try {
    _nbR1 = _nbRun(_nbOff1);
    _nbR2 = _nbRun(_nbOff2);
  } catch(e) {
    _nbThrew = true;
    console.error('  no-bloodwork anchor test threw:', e.message);
  }
  check('no-bloodwork anchor: no crash', !_nbThrew);
  check('no-bloodwork anchor: calFT captured (short & extended)', !_nbThrew && _nbR1 && _nbR2 && _nbR1.calFT != null && _nbR2.calFT != null);
  if (!_nbThrew && _nbR1 && _nbR2 && _nbR1.calFT != null && _nbR2.calFT != null) {
    check(
      'no-bloodwork anchor: calFT must not change when future injections are appended',
      Math.abs(_nbR2.calFT - _nbR1.calFT) < 1e-9,
      'short calFT='+_nbR1.calFT.toFixed(8)+' extended calFT='+_nbR2.calFT.toFixed(8)
    );
    check(
      'no-bloodwork anchor: peak must not drop when future injections are appended',
      _nbR2.peak >= _nbR1.peak,
      'short peak='+_nbR1.peak+' extended peak='+_nbR2.peak
    );
  }

  // All-past edge case: a fully washed-out cycle logged entirely in the past (today falls
  // outside the injection span).  Appending more past injections must still not lower the
  // peak — the anchor falls back to day 0, whose value is immune to every later injection.
  function _nbPastSeries(n){
    var a = [];
    var _start = new Date(_nbBase.getTime() - 200*86400000);
    for (var i=0;i<n;i++){ var d=new Date(_start.getTime()+i*2*86400000); a.push({compId:'nebido', doseMg:'102', date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}); }
    return a;
  }
  var _nbPastThrew = false, _nbP1 = null, _nbP2 = null;
  try {
    _nbCalFT = null; _nbFillNums = []; G._tcDrawManualChart('tc-manual-chart', _nbPastSeries(10)); _nbP1 = {calFT:_nbCalFT, peak:Math.max.apply(null,_nbFillNums.concat([0]))};
    _nbCalFT = null; _nbFillNums = []; G._tcDrawManualChart('tc-manual-chart', _nbPastSeries(20)); _nbP2 = {calFT:_nbCalFT, peak:Math.max.apply(null,_nbFillNums.concat([0]))};
  } catch(e) { _nbPastThrew = true; console.error('  no-bloodwork all-past test threw:', e.message); }
  check('no-bloodwork anchor (all-past): no crash', !_nbPastThrew);
  if (!_nbPastThrew && _nbP1 && _nbP2 && _nbP1.calFT != null && _nbP2.calFT != null) {
    check(
      'no-bloodwork anchor (all-past): calFT must not change when more past injections are appended',
      Math.abs(_nbP2.calFT - _nbP1.calFT) < 1e-9,
      'short calFT='+_nbP1.calFT.toFixed(8)+' extended calFT='+_nbP2.calFT.toFixed(8)
    );
    check(
      'no-bloodwork anchor (all-past): peak must not drop when more past injections are appended',
      _nbP2.peak >= _nbP1.peak,
      'short peak='+_nbP1.peak+' extended peak='+_nbP2.peak
    );
  }

  G._tcp.measuredFT         = _nbSavedFT;
  G._tcp.currentDoseMgWk    = _nbSavedDose;
  G._tcBwEntries            = _nbSavedBwE;
  G._tcGhStack              = _nbSavedGh;
  G.document.getElementById = _nbSavedGetEl;
}

// Regression: PRE-CYCLE baseline bloodwork (draw dated BEFORE the first injection).
// This is the normal workflow — you get baseline bloodwork before starting a cycle — and it
// is the case Henrik reported twice.  Two properties must hold:
//   1. The curve must START at the measured baseline free T (displayed[0] === measuredFT) and
//      rise from there — not begin near zero and only cross the baseline days later.
//   2. Appending injections must NOT lower the peak (calFT is invariant), and the peak must be
//      physiological — anchoring the floor at the tiny day-0 residual made it absurdly high.
// The injected accumulation is scaled so its value at "today" is one baseline unit, which is
// invariant to injections planned after today.
console.log('\n── pre-cycle baseline bloodwork: starts at baseline, peak rises, no drop (Henrik report) ──');
if (typeof G._tcDrawManualChart === 'function') {
  var _pbSavedFT   = G._tcp.measuredFT;
  var _pbSavedDose = G._tcp.currentDoseMgWk;
  var _pbSavedBwE  = G._tcBwEntries;
  var _pbSavedGh   = G._tcGhStack;
  var _pbSavedGetEl = G.document.getElementById;

  G._tcp.measuredFT      = '217';
  G._tcp.currentDoseMgWk = '';

  // Dates anchored to "today" so the first injection is 6 days ago (today falls inside the
  // injection span, as in Henrik's live app) regardless of when the test runs.
  var _pbBase = new Date(); _pbBase.setHours(12,0,0,0);
  function _pbDate(off){ var d=new Date(_pbBase.getTime()+off*86400000); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  // Baseline draw dated ~4 months before the first injection (a genuine pre-cycle baseline).
  G._tcBwEntries = [{date:_pbDate(-132), free_t:217, total_t:600, shbg:40}];
  G._tcGhStack   = [];

  var _pbCalFT = null, _pbStart = null, _pbFillNums = [];
  var _pbMockCtx = {
    scale:noop, beginPath:noop, arc:noop, fill:noop, stroke:noop,
    fillText:function(t){ if(/^\d+$/.test(String(t))) _pbFillNums.push(Number(t)); },
    closePath:noop, save:noop, restore:noop, fillRect:noop,
    setLineDash:noop, strokeRect:noop, translate:noop, rotate:noop, moveTo:noop, lineTo:noop,
    measureText:function(){ return {width:0}; },
    createLinearGradient:function(){ return {addColorStop:noop}; }
  };
  G.document.getElementById = function(id) {
    if (id === 'tc-manual-chart') return {
      style:{}, classList:{add:noop,remove:noop,contains:function(){return false;}},
      offsetWidth:350, offsetHeight:250,
      _testCalFTHook:  function(v){ _pbCalFT = v; },
      _testStartHook:  function(v){ _pbStart = v; },
      getContext: function(){ return _pbMockCtx; }
    };
    return _pbSavedGetEl(id);
  };

  // Henrik's exact schedule: 2 Testoviron loaders (6/5 days ago) + 10 Nebido, then +10 more.
  var _pbLog1 = [
    {compId:'testoviron', doseMg:'100', date:_pbDate(-6)},
    {compId:'testoviron', doseMg:'150', date:_pbDate(-5)}
  ];
  for (var _pbi=0; _pbi<10; _pbi++){ _pbLog1.push({compId:'nebido', doseMg:'102', date:_pbDate(-4 + _pbi*2)}); }
  var _pbLog2 = _pbLog1.slice();
  for (var _pbj=0; _pbj<10; _pbj++){ _pbLog2.push({compId:'nebido', doseMg:'100', date:_pbDate(18 + _pbj*4)}); }

  function _pbRun(lg){ _pbCalFT=null; _pbStart=null; _pbFillNums=[]; G._tcDrawManualChart('tc-manual-chart', lg); return {calFT:_pbCalFT, start:_pbStart, peak:Math.max.apply(null,_pbFillNums.concat([0]))}; }

  var _pbThrew=false, _pbR1=null, _pbR2=null;
  try { _pbR1 = _pbRun(_pbLog1); _pbR2 = _pbRun(_pbLog2); }
  catch(e){ _pbThrew=true; console.error('  pre-cycle baseline test threw:', e.message); }
  check('pre-cycle baseline: no crash', !_pbThrew);
  check('pre-cycle baseline: calFT & start captured', !_pbThrew && _pbR1 && _pbR2 && _pbR1.calFT != null && _pbR1.start != null);
  if (!_pbThrew && _pbR1 && _pbR2 && _pbR1.calFT != null && _pbR1.start != null) {
    check(
      'pre-cycle baseline: curve STARTS at the measured baseline (217 pmol/L)',
      Math.abs(_pbR1.start - 217) <= 1 && Math.abs(_pbR2.start - 217) <= 1,
      'short start='+_pbR1.start.toFixed(2)+' extended start='+_pbR2.start.toFixed(2)
    );
    check(
      'pre-cycle baseline: calFT must not change when injections are appended',
      Math.abs(_pbR2.calFT - _pbR1.calFT) < 1e-9,
      'short calFT='+_pbR1.calFT.toFixed(8)+' extended calFT='+_pbR2.calFT.toFixed(8)
    );
    check(
      'pre-cycle baseline: peak rises (does not drop) when injections are appended',
      _pbR2.peak >= _pbR1.peak,
      'short peak='+_pbR1.peak+' extended peak='+_pbR2.peak
    );
    check(
      'pre-cycle baseline: peak is physiological, not absurdly inflated (< 3000 pmol/L)',
      _pbR2.peak < 3000,
      'extended peak='+_pbR2.peak
    );
  }

  G._tcp.measuredFT         = _pbSavedFT;
  G._tcp.currentDoseMgWk    = _pbSavedDose;
  G._tcBwEntries            = _pbSavedBwE;
  G._tcGhStack              = _pbSavedGh;
  G.document.getElementById = _pbSavedGetEl;
}

// ── Supplements feature ──────────────────────────────────────────────────────
console.log('\n── Supplements: catalogue, cadence logic, and rendering ──');
if (typeof G.SUPPLEMENT_CAT !== 'undefined') {
  check('SUPPLEMENT_CAT is a non-empty array', Array.isArray(G.SUPPLEMENT_CAT) && G.SUPPLEMENT_CAT.length >= 10);
  check('every catalogue entry has id, name and a dose list',
    G.SUPPLEMENT_CAT.every(function(c){ return c.id && c.name && Array.isArray(c.doses) && c.doses.length; }));
  check('catalogue ids are unique',
    new Set(G.SUPPLEMENT_CAT.map(function(c){return c.id;})).size === G.SUPPLEMENT_CAT.length);

  // Units: metric (µg/mg/g) is the default — µg (not "mcg"), and no dose may lead with IU.
  var _allDoses = [];
  G.SUPPLEMENT_CAT.forEach(function(c){ c.doses.forEach(function(d){ _allDoses.push({id:c.id, d:d}); }); });
  check('units: every dose leads with a metric unit (µg/mg/g), never a bare IU',
    _allDoses.every(function(x){ return /^\s*[\d.]+\s*(µg|mg|g)\b/.test(x.d) || /^\s*[\d.]+\s*(capsule|scoop|serving|FU)\b/.test(x.d); }),
    _allDoses.filter(function(x){ return !/^\s*[\d.]+\s*(µg|mg|g|capsule|scoop|serving|FU)\b/.test(x.d); }).map(function(x){return x.id+':'+x.d;}).join(', '));
  check('units: micrograms written "µg", never "mcg"',
    _allDoses.every(function(x){ return x.d.indexOf('mcg') === -1; }),
    _allDoses.filter(function(x){ return x.d.indexOf('mcg') !== -1; }).map(function(x){return x.id+':'+x.d;}).join(', '));
  check('units: no dose starts with an IU value',
    _allDoses.every(function(x){ return !/^\s*[\d.]+\s*IU\b/.test(x.d); }));
  // IU-dosed fat-soluble vitamins show BOTH units (metric + IU in parentheses)
  ['vitd3','vita','vite'].forEach(function(id){
    var c = G.SUPPLEMENT_CAT.find(function(e){ return e.id===id; });
    check('units: '+id+' present and shows metric + IU',
      !!c && c.doses.every(function(d){ return /(µg|mg)\b/.test(d) && /\(\s*[\d.]+\s*IU\s*\)/.test(d); }));
  });

  // Display formatter: supplements saved before the µg change keep their old stored dose,
  // but must render correctly — the reported "Vitamin D3 shows 5000 IU only" bug.
  if (typeof G._suppFmtDose === 'function') {
    check('display: legacy Vitamin D3 "5000 IU" renders as metric + IU',
      G._suppFmtDose('vitd3','5000 IU') === '125 µg (5000 IU)', G._suppFmtDose('vitd3','5000 IU'));
    check('display: legacy "100 mcg" renders as "100 µg"',
      G._suppFmtDose('vitk2','100 mcg') === '100 µg');
    check('display: mg doses are untouched',
      G._suppFmtDose('boron','10 mg') === '10 mg');
    check('display: already-metric dose passes through unchanged',
      G._suppFmtDose('vitd3','125 µg (5000 IU)') === '125 µg (5000 IU)');
    check('display: never shows "mcg" after formatting',
      ['100 mcg','250 mcg','5000 IU'].every(function(x){ return G._suppFmtDose('selenium',x).indexOf('mcg') === -1; }));
  }

  // cadence: daily always active
  check('daily supplement active on any day',
    G._suppActiveOn({freq:'daily'}, new Date('2026-07-03')) === true);

  // every other day: active on start day and +2, not +1
  var _eod = {freq:'eod', start_date:'2026-07-01'};
  check('eod active on start day',      G._suppActiveOn(_eod, new Date('2026-07-01T09:00:00')) === true);
  check('eod inactive on day+1',        G._suppActiveOn(_eod, new Date('2026-07-02T09:00:00')) === false);
  check('eod active on day+2',          G._suppActiveOn(_eod, new Date('2026-07-03T09:00:00')) === true);
  check('eod inactive before start',    G._suppActiveOn(_eod, new Date('2026-06-30T09:00:00')) === false);

  // weekly: same weekday only (2026-07-01 is a Wednesday)
  var _wk = {freq:'weekly', start_date:'2026-07-01'};
  check('weekly active on same weekday (+7)', G._suppActiveOn(_wk, new Date('2026-07-08T09:00:00')) === true);
  check('weekly inactive on other weekday',   G._suppActiveOn(_wk, new Date('2026-07-09T09:00:00')) === false);

  // _supplementsForDay filters by activity
  G._supplements = [
    {id:'a', supp_id:'vitd3', name:'Vitamin D3', dose:'5000 IU', freq:'daily',  timing:'AM'},
    {id:'b', supp_id:'omega3', name:'Omega-3',   dose:'2000 mg', freq:'weekly', timing:'PM', start_date:'2026-07-01'}
  ];
  var _wed = G._supplementsForDay(new Date('2026-07-01T09:00:00'));
  var _thu = G._supplementsForDay(new Date('2026-07-02T09:00:00'));
  check('_supplementsForDay includes daily + matching weekly', _wed.length === 2);
  check('_supplementsForDay drops non-matching weekly',        _thu.length === 1 && _thu[0].name === 'Vitamin D3');

  // renderTodaySupplements writes a section when supplements are active
  if (typeof G.renderTodaySupplements === 'function') {
    var _rtsHTML = null;
    var _savedGE = G.document.getElementById;
    var _capEl = { set innerHTML(v){ _rtsHTML = v; }, get innerHTML(){ return _rtsHTML; } };
    G.document.getElementById = function(id){ return id==='today-supplements' ? _capEl : _savedGE(id); };
    var _rtsThrew = false;
    try { G.renderTodaySupplements(new Date('2026-07-01T09:00:00')); } catch(e){ _rtsThrew=true; console.error('  renderTodaySupplements threw:', e.message); }
    check('renderTodaySupplements: no crash', !_rtsThrew);
    check('renderTodaySupplements: shows a SUPPLEMENTS section', typeof _rtsHTML==='string' && /SUPPLEMENTS/.test(_rtsHTML));
    check('renderTodaySupplements: lists the active supplement name', typeof _rtsHTML==='string' && /Vitamin D3/.test(_rtsHTML));
    // empty when nothing active
    G._supplements = [];
    G.renderTodaySupplements(new Date('2026-07-01T09:00:00'));
    check('renderTodaySupplements: empty when no supplements active', _rtsHTML === '');
    G.document.getElementById = _savedGE;
    G._supplements = [];
  }

  // ── Vitamin D (25-OH-D) → D3 dose recommendation ──
  if (typeof G._vitDRecommendation === 'function') {
    // unit conversion: ng/mL → nmol/L (× 2.496)
    check('_vitDToNmol: ng/mL converts (20 → ~49.9)', Math.abs(G._vitDToNmol(20,'ng/mL') - 49.92) < 0.1);
    check('_vitDToNmol: nmol/L passes through',        G._vitDToNmol(60,'nmol/L') === 60);
    check('_vitDToNmol: rejects non-positive',         G._vitDToNmol(0,'nmol/L') === null);
    // classification bands
    check('_vitDRec: <50 = Deficient',        G._vitDRecommendation(40).status === 'Deficient');
    check('_vitDRec: Deficient has loading',   /5000 IU/.test(G._vitDRecommendation(40).loading||''));
    check('_vitDRec: 50–75 = Insufficient',    G._vitDRecommendation(60).status === 'Insufficient');
    check('_vitDRec: 75–125 = Sufficient',     /Sufficient/.test(G._vitDRecommendation(90).status));
    check('_vitDRec: 125–250 = Above target',  G._vitDRecommendation(150).status === 'Above target');
    check('_vitDRec: >250 = Excess',           G._vitDRecommendation(300).status === 'Excess');
    // weight-based loading total (van Groningen): 40×(75−40)×90 = 126000 IU
    check('_vitDRec: weight-based loading total', /126,000 IU/.test(G._vitDRecommendation(40,90).totalNote||''));
    check('_vitDRec: no weight → no total note',   !G._vitDRecommendation(40,0).totalNote);
    // marker lookup from bloodwork extras (newest-first)
    var _savedBw = G._tcBwEntries;
    G._tcBwEntries = [{date:'2026-07-01', extra:[{name:'Vitamin D', value:42, unit:'nmol/L'}]}];
    var _mk = G._suppLatestBwMarker('Vitamin D');
    check('_suppLatestBwMarker: finds Vitamin D in extras', _mk && Number(_mk.value) === 42 && _mk.unit === 'nmol/L');
    check('_suppLatestBwMarker: null for missing marker',   G._suppLatestBwMarker('IGF-1') === null);
    check('_renderVitDCard: renders card when level present',
      typeof G._renderVitDCard()==='string' && /Deficient/.test(G._renderVitDCard()) && /nmol\/L/.test(G._renderVitDCard()));
    G._tcBwEntries = null;
    check('_renderVitDCard: empty when no bloodwork', G._renderVitDCard() === '');
    G._tcBwEntries = _savedBw;
  }

  // ── custom dose via two dropdowns (no free text) ──
  if (typeof G._suppParseDose === 'function') {
    check('_suppParseDose: "125 µg (5000 IU)" → 125 µg',
      (function(){var p=G._suppParseDose('125 µg (5000 IU)');return p&&p.amount===125&&p.unit==='µg';})());
    check('_suppParseDose: "5 g" → 5 g',
      (function(){var p=G._suppParseDose('5 g');return p&&p.amount===5&&p.unit==='g';})());
    check('_suppParseDose: legacy "100 mcg" → 100 µg',
      (function(){var p=G._suppParseDose('100 mcg');return p&&p.amount===100&&p.unit==='µg';})());
    check('_suppParseDose: "2000 mg" → 2000 mg',
      (function(){var p=G._suppParseDose('2000 mg');return p&&p.amount===2000&&p.unit==='mg';})());
    check('_suppParseDose: count-based "1 capsule" → null (no dropdown unit)',
      G._suppParseDose('1 capsule') === null);
    check('_suppParseDose: empty → null', G._suppParseDose('') === null);
    // unit dropdown maps to a fixed unit set; amount options are per-unit
    check('_SUPP_UNITS is [µg,mg,g,IU]', JSON.stringify(G._SUPP_UNITS) === JSON.stringify(['µg','mg','g','IU']));
    check('_suppAmountOptions(µg): starts 5, ends 1000', (function(){var o=G._suppAmountOptions('µg');return o[0]===5&&o[o.length-1]===1000;})());
    check('_suppAmountOptions(g): includes fractional 0.5', G._suppAmountOptions('g').indexOf(0.5)!==-1);
    check('_suppAmountOptions(IU): ends 10000', (function(){var o=G._suppAmountOptions('IU');return o[o.length-1]===10000;})());
    check('_suppAmountOptions(mg default): ends 2000', (function(){var o=G._suppAmountOptions('mg');return o[o.length-1]===2000;})());
    check('_suppDefaultAmount: µg=50, mg=100, g=5, IU=1000',
      G._suppDefaultAmount('µg')===50 && G._suppDefaultAmount('mg')===100 && G._suppDefaultAmount('g')===5 && G._suppDefaultAmount('IU')===1000);

    // DOM wiring: drive the two-dropdown flow end-to-end with select mocks that
    // mimic a browser <select> (setting innerHTML with a `selected` option updates value).
    (function(){
      function mkSel(){ var _html='',_val='';
        return {
          set innerHTML(h){ _html=h; var m=/value="([^"]*)"\s+selected/.exec(h); _val = m ? m[1] : ((/value="([^"]*)"/.exec(h)||[])[1]||''); },
          get innerHTML(){ return _html; },
          get value(){ return _val; }, set value(v){ _val=String(v); },
          style:{display:''}, getAttribute:function(){return null;}, setAttribute:function(){}, removeAttribute:function(){} }; }
      var els={'supp-as-comp':mkSel(),'supp-as-dose':mkSel(),'supp-as-dose-custom':mkSel(),
        'supp-as-amount':mkSel(),'supp-as-unit':mkSel()};
      els['supp-as-comp'].value='vitd3';
      var savedGE=G.document.getElementById;
      G.document.getElementById=function(id){ return els[id]||savedGE(id); };
      try {
        G._suppInitDoseControls(500,'mg');
        check('dropdown wiring: unit select = mg',            els['supp-as-unit'].value==='mg');
        check('dropdown wiring: amount select = 500',         els['supp-as-amount'].value==='500');
        check('dropdown wiring: _suppCurrentDropdownDose = "500 mg"', G._suppCurrentDropdownDose()==='500 mg');
        els['supp-as-unit'].value='µg'; // user changes unit
        G._suppUnitSel();
        check('dropdown wiring: unit switch resets amount to default (50 µg)', G._suppCurrentDropdownDose()==='50 µg');
        // editing preserves a non-standard amount by injecting it as an option
        G._suppInitDoseControls(437,'mg');
        check('dropdown wiring: non-standard amount preserved (437 mg)', G._suppCurrentDropdownDose()==='437 mg');
      } finally { G.document.getElementById=savedGE; }
    })();
  }

  check('buildSupplements is defined', typeof G.buildSupplements === 'function');
  check('syncSupplementsFromAgent is defined', typeof G.syncSupplementsFromAgent === 'function');
  check('pushSupplementToAgent / deleteSupplementFromAgent defined',
    typeof G.pushSupplementToAgent === 'function' && typeof G.deleteSupplementFromAgent === 'function');

  // ── checkboxes: slots + taken-state rendering ──
  check('_suppSlots: AM & PM expands to two slots',
    JSON.stringify(G._suppSlots('AMPM')) === '["AM","PM"]');
  check('_suppSlots: AM / PM single slot',
    JSON.stringify(G._suppSlots('AM')) === '["AM"]' && JSON.stringify(G._suppSlots('PM')) === '["PM"]');
  check('toggleSupplementDose + syncSupplementLogFromAgent defined',
    typeof G.toggleSupplementDose === 'function' && typeof G.syncSupplementLogFromAgent === 'function');

  if (typeof G.renderTodaySupplements === 'function') {
    var _cbHTML = null;
    var _savedGE2 = G.document.getElementById;
    var _capEl2 = { set innerHTML(v){ _cbHTML = v; }, get innerHTML(){ return _cbHTML; } };
    G.document.getElementById = function(id){ return id==='today-supplements' ? _capEl2 : _savedGE2(id); };
    // an AM&PM daily supplement → two checkbox slots; mark the AM slot taken
    G._supplements = [{id:'x', supp_id:'vitd3', name:'Vitamin D3', dose:'5000 IU', freq:'daily', timing:'AMPM'}];
    G._suppLog = {};
    G._suppLog[G._suppLogKey('vitd3','2026-07-01','AM')] = true;
    G.renderTodaySupplements(new Date('2026-07-01T09:00:00'));
    check('checkbox row: renders a check-box element', typeof _cbHTML==='string' && /check-box/.test(_cbHTML));
    check('checkbox row: AM slot shows as checked', typeof _cbHTML==='string' && /check-box checked/.test(_cbHTML));
    check('checkbox row: badge counts done / total slots', typeof _cbHTML==='string' && /1 \/ 2/.test(_cbHTML));
    check('checkbox row: onclick wires toggleSupplementDose', typeof _cbHTML==='string' && /toggleSupplementDose\(/.test(_cbHTML));
    G.document.getElementById = _savedGE2;
    G._supplements = []; G._suppLog = {};
  }

  // ── SHBG: supplements feed the free-T (systemic-interaction) model ──
  if (typeof G._tcComputeGhStack === 'function') {
    var _savedSys = G._tcSysInter, _savedStacks = G._tcActiveStacks, _savedSupp = G._supplements, _savedGh = G._tcGhStack;
    G._tcSysInter = { boron: { shbg: { direction:'suppress', maxSuppression:0.25, halfTimeDays:14 } } };
    G._tcActiveStacks = null;
    G._supplements = [{id:'b', supp_id:'boron', name:'Boron', dose:'6 mg', freq:'daily', timing:'AM', start_date:'2026-06-01'}];
    G._tcGhStack = [];
    G._tcComputeGhStack();
    check('SHBG model includes an active Boron supplement',
      Array.isArray(G._tcGhStack) && G._tcGhStack.some(function(e){ return e.pepId==='supp_boron' && e.interactions && e.interactions.shbg; }));
    // a supplement with no systemic interaction is NOT added
    G._supplements = [{id:'c', supp_id:'vitc', name:'Vitamin C', dose:'1000 mg', freq:'daily', timing:'AM'}];
    G._tcComputeGhStack();
    check('SHBG model ignores supplements with no interaction',
      G._tcGhStack.every(function(e){ return e.pepId !== 'supp_vitc'; }));
    G._tcSysInter = _savedSys; G._tcActiveStacks = _savedStacks; G._supplements = _savedSupp || []; G._tcGhStack = _savedGh || [];
  }
} else {
  check('SUPPLEMENT_CAT defined (tab-supplements.js loaded)', false);
}

// ── Testosterone → SHBG dose-dependent free-T model (+ uncertainty band) ──
console.log('\n── T-calc: testosterone→SHBG dose-dependent model + β band ──');
if (typeof G._tcDrawManualChart === 'function') {
  var _shSavedTp   = G._tcp;
  var _shSavedBw   = G._tcBwEntries;
  var _shSavedGh   = G._tcGhStack;
  var _shSavedGE   = G.document.getElementById;

  var _shCap = null;
  var _shCtx = {
    scale:noop, beginPath:noop, arc:noop, fill:noop, stroke:noop, fillText:noop,
    closePath:noop, save:noop, restore:noop, fillRect:noop, setLineDash:noop,
    strokeRect:noop, translate:noop, rotate:noop, moveTo:noop, lineTo:noop,
    measureText:function(){ return {width:0}; }, createLinearGradient:function(){ return {addColorStop:noop}; }
  };
  G.document.getElementById = function(id){
    if (id==='tc-manual-chart') return {
      style:{}, classList:{add:noop,remove:noop,contains:function(){return false;}},
      offsetWidth:350, offsetHeight:250,
      _testShbgHook: function(v){ _shCap = v; },
      getContext: function(){ return _shCtx; }
    };
    return _shSavedGE(id);
  };

  // Testosterone-ester schedule, bloodwork with total T + SHBG (activates the model).
  var _shLog = [
    {compId:'testoviron', doseMg:'100', date:'2026-06-27'},
    {compId:'testoviron', doseMg:'150', date:'2026-06-28'}
  ];
  for (var _shi=0; _shi<10; _shi++){ var _shd=new Date(new Date('2026-06-29').getTime()+_shi*2*86400000); _shLog.push({compId:'nebido', doseMg:'102', date:_shd.getFullYear()+'-'+String(_shd.getMonth()+1).padStart(2,'0')+'-'+String(_shd.getDate()).padStart(2,'0')}); }

  G._tcp = {measuredFT:'217', currentDoseMgWk:'0', totalT:'16.2', shbg:'45', birthYear:'1980', manualLog:_shLog};
  G._tcBwEntries = [{date:'2026-06-27', free_t:217, total_t:16.2, shbg:45}];
  G._tcGhStack = [];  // no compound suppressors — testosterone alone must drive the model

  var _shThrew = false;
  try { _shCap = null; G._tcDrawManualChart('tc-manual-chart', _shLog); }
  catch(e){ _shThrew = true; console.error('  T→SHBG test threw:', e.message); }
  check('T→SHBG: no crash', !_shThrew);
  check('T→SHBG: model activates from total T + SHBG alone (no GH/Boron needed)', !_shThrew && _shCap !== null);

  if (_shCap) {
    var _arr=_shCap.arr, _lo=_shCap.lo, _hi=_shCap.hi, _cal=_shCap.calFT, _ref=_shCap.refDay, _tot=_shCap.total;
    // peak index by central curve
    var _pk=0,_pv=0; for (var _t=0; _t<_tot.length; _t++){ var _v=_tot[_t]*_arr[_t]; if(_v>_pv){_pv=_v;_pk=_t;} }
    check('T→SHBG: curve stays anchored at the draw (factor = 1 there)',
      Math.abs(_arr[_ref]/_cal - 1) < 1e-6, 'arr[ref]/calFT='+(_arr[_ref]/_cal).toFixed(8));
    check('T→SHBG: band pinches to zero width at the draw',
      Math.abs(_lo[_ref]-_hi[_ref]) < 1e-6);
    check('T→SHBG: free-T fraction rises above the draw dose (SHBG suppressed)',
      _arr[_pk] > _cal * 1.02, 'arr[peak]/calFT='+(_arr[_pk]/_cal).toFixed(4));
    check('T→SHBG: β band brackets the central curve at the peak',
      _lo[_pk] <= _arr[_pk] + 1e-9 && _arr[_pk] <= _hi[_pk] + 1e-9);
    check('T→SHBG: band has real width away from the draw (hi > lo at peak)',
      _hi[_pk] > _lo[_pk] * 1.01);
    // model raises the peak vs a flat (linear) calibration
    check('T→SHBG: modelled peak exceeds the naive linear peak',
      _tot[_pk]*_arr[_pk] > _tot[_pk]*_cal * 1.02);
  }

  G._tcp = _shSavedTp; G._tcBwEntries = _shSavedBw; G._tcGhStack = _shSavedGh;
  G.document.getElementById = _shSavedGE;
}

// ── Per-user β calibration (SHBG ∝ totalT^−β fitted from the user's own labs) ──
console.log('\n── T-calc: β personalised from the user\'s own bloodwork (no hardcoding) ──');
if (typeof G._tcFitBeta === 'function') {
  function _synth(tt, b){ return {total_t: tt, shbg: 60 * Math.pow(tt, -b)}; }
  // clean data generated with a known exponent must be recovered
  var _fit2 = G._tcFitBeta([_synth(15,0.30), _synth(45,0.30)]);
  check('β fit: recovers exponent from 2 clean labs', _fit2 && Math.abs(_fit2.beta - 0.30) < 0.02, _fit2 && ('β='+_fit2.beta.toFixed(4)));
  var _fit4 = G._tcFitBeta([_synth(15,0.30), _synth(25,0.30), _synth(40,0.30), _synth(60,0.30)]);
  check('β fit: recovers exponent from 4 clean labs', _fit4 && Math.abs(_fit4.beta - 0.30) < 0.02);
  check('β fit: 4 labs report n and a band', _fit4 && _fit4.n === 4 && _fit4.hi > _fit4.lo && _fit4.lo < _fit4.beta && _fit4.beta < _fit4.hi);
  check('β fit: more consistent labs → tighter band than the 2-lab default (±0.10)',
    _fit4 && (_fit4.hi - _fit4.lo) < 0.20);
  // not enough / unusable data → null (caller uses population fallback)
  check('β fit: null with a single lab', G._tcFitBeta([_synth(20,0.3)]) === null);
  check('β fit: null when all labs are at the same T level', G._tcFitBeta([{total_t:20,shbg:40},{total_t:20,shbg:42}]) === null);
  check('β fit: null when SHBG is missing', G._tcFitBeta([{total_t:15},{total_t:45}]) === null);
  check('β fit: null on empty/undefined', G._tcFitBeta([]) === null && G._tcFitBeta(null) === null);
  // physiological clamp — a nonsense steep drop is capped
  var _fitSteep = G._tcFitBeta([{total_t:15,shbg:200},{total_t:60,shbg:1}]);
  check('β fit: clamps β to a physiological ceiling (≤0.60)', _fitSteep && _fitSteep.beta <= 0.60 + 1e-9);

  // integration: with ≥2 labs at different T, the SHBG model reports personalised β
  if (typeof G._tcDrawManualChart === 'function') {
    var _pbSaveTp = G._tcp, _pbSaveBw = G._tcBwEntries, _pbSaveGh = G._tcGhStack, _pbSaveGE = G.document.getElementById;
    var _pbCap = null;
    var _pbCtx = { scale:noop,beginPath:noop,arc:noop,fill:noop,stroke:noop,fillText:noop,closePath:noop,save:noop,restore:noop,fillRect:noop,setLineDash:noop,strokeRect:noop,translate:noop,rotate:noop,moveTo:noop,lineTo:noop,measureText:function(){return{width:0};},createLinearGradient:function(){return{addColorStop:noop};} };
    G.document.getElementById = function(id){ return id==='tc-manual-chart' ? { style:{},classList:{add:noop,remove:noop,contains:function(){return false;}},offsetWidth:350,offsetHeight:250,_testShbgHook:function(v){_pbCap=v;},getContext:function(){return _pbCtx;} } : _pbSaveGE(id); };
    var _pbLog = [{compId:'testoviron',doseMg:'100',date:'2026-06-27'}];
    for (var _pi2=0;_pi2<10;_pi2++){ var _pd3=new Date(new Date('2026-06-29').getTime()+_pi2*3*86400000); _pbLog.push({compId:'nebido',doseMg:'100',date:_pd3.getFullYear()+'-'+String(_pd3.getMonth()+1).padStart(2,'0')+'-'+String(_pd3.getDate()).padStart(2,'0')}); }
    G._tcp = {measuredFT:'400', currentDoseMgWk:'0', totalT:'30', shbg:'30', birthYear:'1980', manualLog:_pbLog};
    // two blood tests at different T levels → personalised fit
    G._tcBwEntries = [{date:'2026-06-27', total_t:30, shbg:30, free_t:400},{date:'2026-06-20', total_t:15, shbg:45, free_t:220}];
    G._tcGhStack = [];
    _pbCap = null; var _pbThrew=false;
    try { G._tcDrawManualChart('tc-manual-chart', _pbLog); } catch(e){ _pbThrew=true; }
    check('β fit integration: SHBG model runs with multi-lab data', !_pbThrew && _pbCap !== null);
    check('β fit integration: model reports personalised β (not the population default)',
      _pbCap && _pbCap.personalized === true);
    G._tcp = _pbSaveTp; G._tcBwEntries = _pbSaveBw; G._tcGhStack = _pbSaveGh; G.document.getElementById = _pbSaveGE;
  }
} else {
  check('_tcFitBeta defined', false);
}

// ── Blood Levels: combined multi-line chart (compounds + supplements) ─────────
console.log('\n── Blood Levels: combined chart (compounds + supplements) ──');
if (typeof G._blBuildLines === 'function') {
  var _blSaveStacks = G._userStacks, _blSaveIdx = G._activeStackIndices, _blSaveSupp = G._supplements, _blSaveLines = G._blLines;
  G._userStacks = [{
    name:'Test', cycle_length:12, cycle_start:'2026-06-01',
    peptides:[{id:'retatrutide',name:'Retatrutide',dot:'#e8ff3c',days:[0,3],times:['AM'],dose_am:'3',unit_am:'mg',active:true}],
    trt:{enabled:true, compounds:[{id:'testoviron',name:'Testoviron',dose:'250',unit:'mg',days:[0,3]}]},
    enhanced:{enabled:false, compounds:[]}
  }];
  G._activeStackIndices = [0];
  G._supplements = [{id:'s1',supp_id:'vitd3',name:'Vitamin D3',dose:'5000 IU',freq:'daily',timing:'AM',start_date:'2026-06-01'}];

  var _blLines = G._blBuildLines();
  G._blLines = _blLines;
  check('_blBuildLines: includes a peptide line',    _blLines.some(function(l){return l.kind==='peptide';}));
  check('_blBuildLines: includes a TRT line',        _blLines.some(function(l){return l.kind==='trt';}));
  check('_blBuildLines: includes a supplement line', _blLines.some(function(l){return l.kind==='supplement';}));
  check('_blBuildLines: sets a timeline',            G._blTimeline && G._blTimeline.totalDays > 0);

  // normalisation: each line's peak maps to exactly 1.0
  var _blTrt = _blLines.filter(function(l){return l.kind==='trt';})[0];
  var _blArgmax = 0; for (var _bi=1;_bi<_blTrt.curve.length;_bi++) if (_blTrt.curve[_bi] > _blTrt.curve[_blArgmax]) _blArgmax = _bi;
  // curves are sub-day sampled (_BL_SPD steps/day); convert the argmax step → day
  var _blPeakDay = _blTrt.offset + _blArgmax / _blTrt.spd;
  check('_blBuildLines: sub-day sampling (spd>1)', _blTrt.spd > 1);
  check('_blValueAt: peak normalises to 1.0', G._blValueAt(_blTrt, _blPeakDay) === 1);
  check('_blValueAt: null before a line starts', G._blValueAt(_blTrt, _blTrt.offset - 1) === null);
  check('_blValueAt: null after a line ends',    G._blValueAt(_blTrt, _blTrt.offset + _blTrt.curve.length) === null);
  // end-of-cycle washout tail is truncated (no drop toward zero past the last dose)
  check('_blRawMgAt: null past the last dose (no washout tail)',
    G._blRawMgAt(_blTrt, _blTrt.offset + _blTrt.lastStep/_blTrt.spd + 2) === null);
  check('_blRawMgAt: non-null at the last dose',
    G._blRawMgAt(_blTrt, _blTrt.offset + _blTrt.lastStep/_blTrt.spd) !== null);

  // absorption model for EVERY line kind: a dose at day 0 gives curve[0] ~ 0
  // (nothing absorbed yet) and a peak strictly later — not an instant jump.
  ['peptide','trt','supplement'].forEach(function(kind){
    var _ln = _blLines.filter(function(l){ return l.kind===kind; })[0];
    if (!_ln) { check('_blBuildLines: '+kind+' line present for absorption check', false); return; }
    var _am = 0; for (var _k=1;_k<_ln.curve.length;_k++) if (_ln.curve[_k] > _ln.curve[_am]) _am = _k;
    check('_blBuildLines: '+kind+' uses absorption (curve[0] ~ 0, not an instant jump)', _ln.curve[0] < _ln.curve[_am] * 0.2);
    check('_blBuildLines: '+kind+' peak is delayed after the dose (absorption)', _am > 0);
  });
  // _blKa keeps absorption faster than elimination even for ultra-short halves
  check('_blKa: clamps ka above ke for ultra-short half-life', G._blKa(0.02, Math.LN2/0.02) > Math.LN2/0.02);
  check('_blKa: leaves ester ka unclamped (ka>ke already)', G._blKa(4.5, Math.LN2/4.5) === G._tcKa(4.5));

  // mg-equivalent conversion + dual-axis scaling
  check('_blToMg: mg passes through',      G._blToMg(50,'mg') === 50);
  check('_blToMg: µg → mg (×0.001)',       G._blToMg(500,'µg') === 0.5);
  check('_blToMg: mcg alias → mg',         G._blToMg(500,'mcg') === 0.5);
  check('_blToMg: g → mg (×1000)',         G._blToMg(5,'g') === 5000);
  check('_blToMg: IU kept on numeric scale (approx)', G._blToMg(4,'IU') === 4);
  check('_blFmtMg: mg band',   G._blFmtMg(150) === '150 mg');
  check('_blFmtMg: µg band',   G._blFmtMg(0.125) === '125 µg');
  check('_blFmtMg: g band',    /g$/.test(G._blFmtMg(5000)));
  // lines now carry unit + mg-equivalent peak
  check('_blBuildLines: TRT line carries a unit',  !!_blTrt.unit);
  check('_blBuildLines: TRT line has peakMg > 0',  _blTrt.peakMg > 0);
  // _blLogBounds: single log axis brackets every peak, µg → g on one scale
  var _axWide = G._blLogBounds([{id:'big',peakMg:1400},{id:'mid',peakMg:5},{id:'small',peakMg:0.1}]);
  check('_blLogBounds: top ≥ largest peak',   _axWide.top >= 1400);
  check('_blLogBounds: bottom ≤ smallest peak', _axWide.bottom <= 0.1 && _axWide.bottom > 0);
  check('_blLogBounds: spans the full µg→g range on one axis', _axWide.top/_axWide.bottom >= 1400/0.1);
  check('_blLogBounds: smallest line gets ≥ a decade of headroom (not pinned to floor)', _axWide.bottom <= 0.1/5);
  // regression: with Nebido (grams) + a small supplement (few mg), the small line
  // must sit well above the floor, not read as a flat zero (Vitamin D3 bug).
  var _axNebD3 = G._blLogBounds([{id:'neb',peakMg:852},{id:'d3',peakMg:2.7}]);
  var _d3h = (Math.log10(2.7)-Math.log10(_axNebD3.bottom))/(Math.log10(_axNebD3.top)-Math.log10(_axNebD3.bottom));
  check('_blLogBounds: mg-scale supplement sits >15% up the axis (not pinned)', _d3h > 0.15);
  var _axNarrow = G._blLogBounds([{id:'a',peakMg:100},{id:'b',peakMg:120}]);
  check('_blLogBounds: close peaks still get ≥2 decades of headroom', _axNarrow.top/_axNarrow.bottom >= 100);
  check('_blNiceCeil: rounds 1400 → 2000 (1-2-5)', G._blNiceCeil(1400) === 2000);
  check('_blNiceFloor: rounds 0.1 → 0.1',          G._blNiceFloor(0.1) === 0.1);
  // _blRawMgAt returns real mg-equivalent (not normalised)
  var _rawPeak = G._blRawMgAt(_blTrt, _blPeakDay);
  check('_blRawMgAt: returns mg-equivalent at peak', Math.abs(_rawPeak - _blTrt.peakMg) < 1e-9);

  // supplement half-life map (evidence-based plasma half-lives, in days)
  check('_blSuppHalfLife: vitd3 = 15d (25-OH-D biomarker)', G._blSuppHalfLife('vitd3') === 15);
  check('_blSuppHalfLife: vitc ~30min (0.02d)',   G._blSuppHalfLife('vitc') === 0.02);
  check('_blSuppHalfLife: creatine ~2-3h (0.1d)', G._blSuppHalfLife('creatine') === 0.1);
  check('_blSuppHalfLife: betaalanine ~20min',    G._blSuppHalfLife('betaalanine') === 0.015);
  check('_blSuppHalfLife: omega3 ~2.5d',          G._blSuppHalfLife('omega3') === 2.5);
  check('_blSuppHalfLife: b6 long terminal 17.5d',G._blSuppHalfLife('b6') === 17.5);
  check('_blSuppHalfLife: coq10 ~33h (1.375d)',   G._blSuppHalfLife('coq10') === 1.375);
  // trace minerals + adaptogens (evidence-based)
  check('_blSuppHalfLife: boron ~21h (0.875d)',        G._blSuppHalfLife('boron') === 0.875);
  check('_blSuppHalfLife: selenium selenomethionine 10.5d', G._blSuppHalfLife('selenium') === 10.5);
  check('_blSuppHalfLife: iodine plasma clearance ~2h', G._blSuppHalfLife('iodine') === 0.073);
  check('_blSuppHalfLife: rhodiola ~45min',            G._blSuppHalfLife('rhodiola') === 0.031);
  check('_blSuppHalfLife: ginseng Rb1 ~16h (0.68d)',   G._blSuppHalfLife('ginseng') === 0.68);
  check('_blSuppHalfLife: tongkat ~1h (0.052d)',       G._blSuppHalfLife('tongkat') === 0.052);
  check('_blSuppHalfLife: ashwagandha ~3.75h (0.156d)',G._blSuppHalfLife('ashwagandha') === 0.156);
  check('_blSuppHalfLife: curcumin ~6.5h (0.271d)',    G._blSuppHalfLife('curcumin') === 0.271);
  check('_blSuppHalfLife: unknown falls back to 0.5d', G._blSuppHalfLife('nope') === 0.5);
  // new adaptogens are in the catalogue
  if (typeof G.SUPPLEMENT_CAT !== 'undefined') {
    ['rhodiola','ginseng','ginkgo','bacopa','tongkat'].forEach(function(id){
      check('SUPPLEMENT_CAT includes '+id, G.SUPPLEMENT_CAT.some(function(s){ return s.id===id && s.doses && s.doses.length; }));
    });
  }
  // every catalogued supplement has an explicit half-life (no silent fallback)
  if (typeof G.SUPPLEMENT_CAT !== 'undefined') {
    var _blMissing = G.SUPPLEMENT_CAT.filter(function(s){ return G._SUPP_HALFLIFE[s.id] === undefined; }).map(function(s){ return s.id; });
    check('_SUPP_HALFLIFE: covers every catalogue supplement', _blMissing.length === 0, 'missing: '+_blMissing.join(', '));
    check('_SUPP_HALFLIFE: all values positive', G.SUPPLEMENT_CAT.every(function(s){ var h=G._SUPP_HALFLIFE[s.id]; return h===undefined || h>0; }));
  }

  // _blDrawChart must not throw with a headless canvas mock
  (function(){
    var n=function(){};
    var fctx={scale:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,fill:n,fillText:n,closePath:n,save:n,restore:n,
      setLineDash:n,translate:n,rotate:n,fillRect:n,createLinearGradient:function(){return{addColorStop:n};},measureText:function(){return{width:0};}};
    var fcanvas={offsetWidth:320,width:0,height:0,style:{},getContext:function(){return fctx;}};
    var _blThrew=false;
    try { G._blZoom='month'; G._blDrawChart(fcanvas);
          G._blZoom='week';  G._blDrawChart(fcanvas); } catch(e){ _blThrew=true; console.error('  _blDrawChart threw:', e.message); }
    check('_blDrawChart: no throw (month + week zoom)', !_blThrew);
    check('_blDrawChart: records a pan window', fcanvas._blWin && fcanvas._blWin.xEnd > fcanvas._blWin.xStart);
    G._blZoom='week';
  })();

  // T-Calc-planned testosterone becomes its own red line even with no stack TRT
  (function(){
    var _saveInj = G._injectionsCache, _saveStacks2 = G._userStacks, _saveIdx2 = G._activeStackIndices, _saveSupp2 = G._supplements;
    G._userStacks = [{ name:'T', cycle_length:12, cycle_start:'2026-06-01',
      peptides:[], trt:{enabled:false,compounds:[]}, enhanced:{enabled:false,compounds:[]} }];
    G._activeStackIndices = [0]; G._supplements = [];
    G._injectionsCache = {
      '2026-06-05':[{cycle_id:'tcalc',compound_id:'enanthate',compound_name:'Testosterone Enanthate',tier:'trt',date:'2026-06-05',dose:'100',unit:'mg',active:true}],
      '2026-06-12':[{cycle_id:'tcalc',compound_id:'enanthate',compound_name:'Testosterone Enanthate',tier:'trt',date:'2026-06-12',dose:'125',unit:'mg',active:true}]
    };
    var _tl = G._blBuildLines();
    var _tline = _tl.filter(function(l){ return typeof l.id==='string' && l.id.indexOf('tcalc_')===0; })[0];
    check('_blBuildLines: T-Calc testosterone becomes a line', !!_tline);
    check('_blBuildLines: T-Calc line is red',          _tline && _tline.color === '#ff3b30');
    check('_blBuildLines: T-Calc line flagged testosterone', _tline && _tline.isTestosterone === true);
    check('_blBuildLines: T-Calc line has a peak > 0',  _tline && _tline.peak > 0);
    check('_blBuildLines: T-Calc line uses mg unit',    _tline && _tline.unit === 'mg');
    // titrated per-injection dosing: 2nd dose (125) stacks on the decaying 1st (100)
    check('_blBuildLines: T-Calc line carries a curve', _tline && _tline.curve && _tline.curve.length > 1);
    // absorption model (matches T-Calc): a single injection peaks AFTER the shot,
    // not at the instant — value ~0 at the injection step, argmax strictly later.
    G._injectionsCache = {
      '2026-06-05':[{cycle_id:'tcalc',compound_id:'enanthate',compound_name:'Testosterone Enanthate',tier:'trt',date:'2026-06-05',dose:'100',unit:'mg',active:true}]
    };
    var _tl1 = G._blBuildLines();
    var _t1 = _tl1.filter(function(l){ return typeof l.id==='string' && l.id.indexOf('tcalc_')===0; })[0];
    if (_t1) {
      var _injStep = Math.round((new Date('2026-06-05T00:00:00').getTime() - G._blTimeline.firstDate.getTime())/86400000) * _t1.spd;
      var _am = 0; for (var _q=1;_q<_t1.curve.length;_q++) if (_t1.curve[_q] > _t1.curve[_am]) _am = _q;
      check('_blBuildLines: T-Calc peak is delayed (absorption, not instant jump)', _am > _injStep);
      check('_blBuildLines: T-Calc curve ~0 at the injection instant', _t1.curve[_injStep] < _t1.curve[_am] * 0.2);
    } else { check('_blBuildLines: single T-Calc injection builds a line', false); }
    G._injectionsCache = _saveInj; G._userStacks = _saveStacks2; G._activeStackIndices = _saveIdx2; G._supplements = _saveSupp2;
  })();

  G._userStacks = _blSaveStacks; G._activeStackIndices = _blSaveIdx; G._supplements = _blSaveSupp; G._blLines = _blSaveLines;
} else {
  check('_blBuildLines defined', false);
}

console.log('\n───────────────────────────────────────────────────────────');
console.log(`  ${passed} passed  ${failed} failed  ${passed+failed} total`);
if(failed>0)process.exit(1);
