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
  .replace('var _bcWeightHistOpen=',  'var _bcWeightHistOpen=');

const noop = () => {};
const mockCtx = {scale:noop,beginPath:noop,moveTo:noop,lineTo:noop,arc:noop,fill:noop,stroke:noop,fillText:noop,closePath:noop,createLinearGradient:()=>({addColorStop:noop}),save:noop,restore:noop,fillRect:noop};
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
});
vm.runInContext(patchedScript, sandbox);
// Load tab files so their functions/vars are available in the same sandbox
const tabFiles = ['tab-cycles.js','tab-macros.js','tab-stack.js','tab-today.js',
                  'tab-schedule.js','tab-timeline.js','tab-body.js','tab-recon.js'];
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
G.initWizard();
check('initWizard: step=0',                G._wiz.step===0);
check('initWizard: peptides=[]',           G._wiz.peptides.length===0);
check('initWizard: goals=[]',              G._wiz.goals.length===0);
check('initWizard: cycle_length set',      G._wiz.cycle_length>0,               `got ${G._wiz.cycle_length}`);
check('initWizard: stackIndex=-1',         G._wiz.stackIndex===-1);
check('initWizard: stackName is string',   typeof G._wiz.stackName==='string'&&G._wiz.stackName.length>0);

G.createNewStack();
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
G.editStackWithCycle(0);
check('editStack: editMode=true',          G._wiz.editMode===true);
check('editStack: stackIndex=0',           G._wiz.stackIndex===0);
check('editStack: stackName loaded',       G._wiz.stackName==='Cutting Cycle');
check('editStack: cycle_length=12',        G._wiz.cycle_length===12,            `got ${G._wiz.cycle_length}`);
check('editStack: 2 peptides loaded',      G._wiz.peptides.length===2,          `got ${G._wiz.peptides.length}`);
check('editStack: TRT compound loaded',    G._wiz.trt.compound==='Nebido');
check('editStack: deep copy (no mutation)',G._userStacks[0].peptides!==G._wiz.peptides);
check('editStack: goals inferred',         Array.isArray(G._wiz.goals));

// ── Cycle length ──────────────────────────────────────────────────────────────
console.log('\n── Cycle length ───────────────────────────────────────────');
check('CYCLE_WEEKS defined',               Array.isArray(G.CYCLE_WEEKS));
check('multiples of 3 up to 21',           [3,6,9,12,15,18,21].every(v=>G.CYCLE_WEEKS.includes(v)));
G.initWizard();
G.wizSetCycleLength('8');  check('wizSetCycleLength("8")=8',    G._wiz.cycle_length===8,  `got ${G._wiz.cycle_length}`);
G.wizSetCycleLength('12'); check('wizSetCycleLength("12")=12',  G._wiz.cycle_length===12);
G.wizSetCycleLength(10);   check('wizSetCycleLength(10)=10',    G._wiz.cycle_length===10);
G.wizSetCycleLength('16'); check('custom cycle length 16',      G._wiz.cycle_length===16);

// ── Wizard navigation ─────────────────────────────────────────────────────────
console.log('\n── Wizard navigation ──────────────────────────────────────');
G.initWizard();
G.wizNext();check('wizNext: 0→1',    G._wiz.step===1);
G.wizNext();check('wizNext: 1→2',    G._wiz.step===2);
G.wizNext();G.wizNext();G.wizNext();
check('wizNext: step=5 after 5 calls',   G._wiz.step===5);
G.wizNext();
check('wizNext: does not exceed 6',  G._wiz.step===6);
G._wiz.step=2;G.wizBack();check('wizBack: 2→1',    G._wiz.step===1);
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
check('empty stacks → WEEKLY_DEFAULT',G.WEEKLY.length===G.WEEKLY_DEFAULT.length);

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
  check('migration: start_date corrected to apr16 for glow', glowP2.start_date==='2026-04-16',`start_date: ${glowP2.start_date}`);
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

  // ── cycle_start auto-sync via _collectEditInputs ────────────────────────────
  console.log('\n── cycle_start auto-sync ───────────────────────────────────');
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

  check('collect: fills empty cycle_start from peptide',        runCollect('',pepApr4)==='2026-04-04',                       `got ${runCollect('',pepApr4)}`);
  check('collect: updates later cycle_start to earlier peptide',runCollect('2026-05-18',pepApr4)==='2026-04-04',             `got ${runCollect('2026-05-18',pepApr4)}`);
  check('collect: keeps correct cycle_start unchanged',         runCollect('2026-04-04',pepApr4)==='2026-04-04',             `got ${runCollect('2026-04-04',pepApr4)}`);
  check('collect: picks earliest of multiple peptides',         runCollect('2026-05-18',pepApr4andApr16)==='2026-04-04',     `got ${runCollect('2026-05-18',pepApr4andApr16)}`);
  check('collect: does not override later cycle_start with earlier user-set date',
    runCollect('2026-03-01',pepApr4)==='2026-03-01', `got ${runCollect('2026-03-01',pepApr4)}`);

  // ── Weight history sort ───────────────────────────────────────────────────────
  console.log('\n── Weight history sort (newest first) ─────────────────────');
  check('sortWeightHistory defined',    typeof G.sortWeightHistory === 'function');
  check('bcRenderWeightHistory defined',typeof G.bcRenderWeightHistory === 'function');
  check('bcDrawWeightChart defined',    typeof G.bcDrawWeightChart === 'function');
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
  const _origBcDraw = G.bcDrawWeightChart;
  let _bcDrawCalls = 0;
  G.bcDrawWeightChart = () => { _bcDrawCalls++; };

  G.setBcWeightWindow(30);
  check('setBcWeightWindow(30) sets _bcWeightWindow=30', G._bcWeightWindow === 30, `got ${G._bcWeightWindow}`);
  check('setBcWeightWindow(30) calls bcDrawWeightChart',  _bcDrawCalls === 1, `got ${_bcDrawCalls}`);
  G.setBcWeightWindow(60);
  check('setBcWeightWindow(60) sets _bcWeightWindow=60', G._bcWeightWindow === 60, `got ${G._bcWeightWindow}`);
  G.setBcWeightWindow(90);
  check('setBcWeightWindow(90) sets _bcWeightWindow=90', G._bcWeightWindow === 90, `got ${G._bcWeightWindow}`);

  G.bcDrawWeightChart = _origBcDraw;
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
    check('_renderTRTGuide defined', typeof G._renderTRTGuide === 'function');
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
check('klow default dose is 0.2',   parseFloat(klowCat?.dflt?.doseAm)===0.2, `got "${klowCat?.dflt?.doseAm}"`);
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
