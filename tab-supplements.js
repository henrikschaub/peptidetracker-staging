// ── Supplements ──────────────────────────────────────────────────────────────
// Everyday over-the-counter supplements (vitamins, minerals, health-store
// compounds) taken alongside the peptide / TRT / enhanced protocol.
// Available to all tiers. User's regimen is the source of truth on the backend
// (/supplements); localStorage 'pep-supplements' is only a cache.

// Curated catalogue of common supplements that make sense alongside peptides and
// enhanced compounds (general health, plus liver / lipid / blood-pressure /
// hematocrit / prolactin support relevant to enhanced users). Commodity OTC
// products — not proprietary compound data. Each has a prefilled dose list.
var SUPPLEMENT_CAT = [
  // Fat-soluble vitamins are often labelled in IU internationally, but metric (µg/mg) is
  // the default here (Europe never uses IU) — the IU equivalent is shown in parentheses.
  {id:'vitd3',      name:'Vitamin D3',            doses:['25 µg (1000 IU)','50 µg (2000 IU)','100 µg (4000 IU)','125 µg (5000 IU)','250 µg (10000 IU)']},
  {id:'vita',       name:'Vitamin A (retinol)',   doses:['750 µg (2500 IU)','1500 µg (5000 IU)','3000 µg (10000 IU)']},
  {id:'vite',       name:'Vitamin E',             doses:['67 mg (100 IU)','134 mg (200 IU)','268 mg (400 IU)']},
  {id:'vitk2',      name:'Vitamin K2 (MK-7)',     doses:['100 µg','200 µg']},
  {id:'omega3',     name:'Omega-3 (Fish Oil)',    doses:['1000 mg','2000 mg','3000 mg','4000 mg']},
  {id:'magnesium',  name:'Magnesium (Glycinate)', doses:['200 mg','300 mg','400 mg','600 mg']},
  {id:'zinc',       name:'Zinc',                  doses:['15 mg','25 mg','50 mg']},
  {id:'boron',      name:'Boron',                 doses:['3 mg','6 mg','10 mg']},
  {id:'vitc',       name:'Vitamin C',             doses:['500 mg','1000 mg']},
  {id:'bcomplex',   name:'B-Complex',             doses:['1 capsule']},
  {id:'b6',         name:'Vitamin B6 (P5P)',      doses:['25 mg','50 mg','100 mg']},
  {id:'coq10',      name:'CoQ10',                 doses:['100 mg','200 mg','300 mg']},
  {id:'creatine',   name:'Creatine Monohydrate',  doses:['3 g','5 g','10 g']},
  {id:'citrulline', name:'L-Citrulline',          doses:['3 g','6 g','8 g']},
  {id:'taurine',    name:'Taurine',               doses:['1 g','2 g','3 g']},
  {id:'betaalanine',name:'Beta-Alanine',          doses:['1.5 g','3 g']},
  {id:'ashwagandha',name:'Ashwagandha',           doses:['300 mg','600 mg']},
  {id:'nac',        name:'NAC (N-Acetyl Cysteine)',doses:['600 mg','1200 mg']},
  {id:'tudca',      name:'TUDCA',                 doses:['250 mg','500 mg','1000 mg']},
  {id:'milkthistle',name:'Milk Thistle',          doses:['250 mg','500 mg']},
  {id:'bergamot',   name:'Citrus Bergamot',       doses:['500 mg','1000 mg']},
  {id:'berberine',  name:'Berberine',             doses:['500 mg','1000 mg','1500 mg']},
  {id:'hawthorn',   name:'Hawthorn Extract',      doses:['300 mg','600 mg']},
  {id:'nattokinase',name:'Nattokinase',           doses:['2000 FU','4000 FU']},
  {id:'curcumin',   name:'Curcumin / Turmeric',   doses:['500 mg','1000 mg']},
  {id:'selenium',   name:'Selenium',              doses:['100 µg','200 µg']},
  {id:'iodine',     name:'Iodine',                doses:['150 µg']},
  {id:'psyllium',   name:'Psyllium / Fiber',      doses:['5 g','10 g']},
  {id:'electrolytes',name:'Electrolytes',         doses:['1 serving']},
  {id:'potassium',  name:'Potassium',             doses:['99 mg','200 mg']},
  {id:'glycine',    name:'Glycine',               doses:['3 g','5 g']},
  {id:'ltheanine',  name:'L-Theanine',            doses:['100 mg','200 mg']},
  {id:'melatonin',  name:'Melatonin',             doses:['1 mg','3 mg','5 mg','10 mg']},
  {id:'probiotics', name:'Probiotics',            doses:['1 capsule']},
  {id:'whey',       name:'Whey Protein',          doses:['1 scoop']},
  {id:'collagen',   name:'Collagen',              doses:['10 g','20 g']}
];

var SUPP_FREQ_LABELS  = {daily:'Daily', eod:'Every other day', weekly:'Weekly'};
var SUPP_TIMING_LABELS= {AM:'AM', PM:'PM', AMPM:'AM & PM'};

var _supplements = [];   // user's regimen (cache mirror of backend)
var _suppLog = {};       // { 'suppId|YYYY-MM-DD|slot': true } — taken doses (cache mirror)
var _suppViewDate = null;// date currently shown in the Today section (for re-render after toggle)

function _suppEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _suppCat(id){ return SUPPLEMENT_CAT.find(function(c){return c.id===id;}); }

// Display-only formatting of a stored dose string. Supplements saved before the metric/µg
// change keep their old dose text (e.g. "5000 IU", "100 mcg") — the stored value is left
// untouched, but for display we (1) write micrograms as "µg" not "mcg", and (2) upgrade an
// IU-only or bare dose to the catalogue's metric-primary label when it corresponds to a known
// dose for that supplement (so "5000 IU" Vitamin D3 shows as "125 µg (5000 IU)").
function _suppFmtDose(suppId, dose){
  if(dose == null || dose === '') return dose;
  var d = String(dose).replace(/mcg/g, 'µg');
  var cat = _suppCat(suppId);
  if(cat && cat.doses){
    for(var i=0;i<cat.doses.length;i++){ if(cat.doses[i] === d) return cat.doses[i]; }
    var m = d.match(/(\d[\d.]*)\s*IU\b/);   // stored as IU only → match catalogue by its IU value
    if(m){
      for(var j=0;j<cat.doses.length;j++){
        var cm = cat.doses[j].match(/\(\s*(\d[\d.]*)\s*IU\s*\)/);
        if(cm && cm[1] === m[1]) return cat.doses[j];
      }
    }
  }
  return d;
}
function _suppDateKey(d){ var x=new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
function _suppToday(){ return _suppDateKey(new Date()); }
// Dose slots per timing: AM & PM is two doses/day, each checked independently.
function _suppSlots(timing){ return timing==='AMPM' ? ['AM','PM'] : (timing==='PM' ? ['PM'] : ['AM']); }
function _suppLogKey(id,date,slot){ return id+'|'+date+'|'+slot; }
function _suppIsTaken(id,date,slot){ return !!_suppLog[_suppLogKey(id,date,slot)]; }

// ── persistence / sync ──────────────────────────────────────────────────────
function _suppLoadCache(){ _supplements = getData('pep-supplements', []) || []; }
function _suppSaveCache(){ setData('pep-supplements', _supplements); }

async function syncSupplementsFromAgent(){
  _suppLoadCache();
  try{
    var r = await fetch(AGENT_URL + '/supplements', {headers: authHeaders()});
    if(!r.ok){ _logHttp('syncSupplements', r.status, '/supplements'); return; }
    var data = await r.json();
    if(Array.isArray(data)){
      _supplements = data;
      _suppSaveCache();
      if(typeof _tcComputeGhStack==='function') _tcComputeGhStack();  // Boron etc. → free-T model
      if(typeof renderTodaySupplements==='function') renderTodaySupplements(_suppViewDate||NOW);
      if(_currentTab==='supplements') buildSupplements();
    }
  }catch(e){ _logErr('syncSupplements', e); }
}

// ── taken-dose log (checkboxes) ──────────────────────────────────────────────
function _suppLoadLogCache(){ _suppLog = getData('pep-supp-log', {}) || {}; }
function _suppSaveLogCache(){ setData('pep-supp-log', _suppLog); }

async function syncSupplementLogFromAgent(){
  _suppLoadLogCache();
  try{
    var r = await fetch(AGENT_URL + '/supplement-log', {headers: authHeaders()});
    if(!r.ok){ _logHttp('syncSuppLog', r.status, '/supplement-log'); return; }
    var data = await r.json();
    if(Array.isArray(data)){
      var m = {};
      data.forEach(function(e){ m[_suppLogKey(e.supp_id, e.date, e.slot || 'AM')] = true; });
      _suppLog = m;
      _suppSaveLogCache();
      if(typeof renderTodaySupplements==='function') renderTodaySupplements(_suppViewDate||NOW);
    }
  }catch(e){ _logErr('syncSuppLog', e); }
}

async function toggleSupplementDose(suppId, dstr, slot){
  var key = _suppLogKey(suppId, dstr, slot);
  var was = !!_suppLog[key];
  if(was) delete _suppLog[key]; else _suppLog[key] = true;
  _suppSaveLogCache();
  if(typeof renderTodaySupplements==='function') renderTodaySupplements(_suppViewDate||NOW);
  try{
    var r = await fetch(AGENT_URL + '/supplement-log', {
      method:'POST',
      headers: authHeaders({'Content-Type':'application/json'}),
      body: JSON.stringify({supp_id:suppId, date:dstr, slot:slot, taken:!was})
    });
    if(!r.ok){
      _logHttp('suppLogToggle', r.status, '/supplement-log');
      if(was) _suppLog[key]=true; else delete _suppLog[key];
      _suppSaveLogCache();
      if(typeof renderTodaySupplements==='function') renderTodaySupplements(_suppViewDate||NOW);
    }
  }catch(e){
    _logErr('suppLogToggle', e);
    if(was) _suppLog[key]=true; else delete _suppLog[key];
    _suppSaveLogCache();
    if(typeof renderTodaySupplements==='function') renderTodaySupplements(_suppViewDate||NOW);
  }
}

async function pushSupplementToAgent(s){
  try{
    var r = await fetch(AGENT_URL + '/supplements', {
      method:'POST',
      headers: authHeaders({'Content-Type':'application/json'}),
      body: JSON.stringify(s)
    });
    if(!r.ok){ _logHttp('pushSupplement', r.status, '/supplements'); return null; }
    var d = await r.json();
    return d && d.entry ? d.entry : null;
  }catch(e){ _logErr('pushSupplement', e); return null; }
}

async function deleteSupplementFromAgent(id){
  try{
    var r = await fetch(AGENT_URL + '/supplements/' + encodeURIComponent(id), {method:'DELETE', headers: authHeaders()});
    if(!r.ok && r.status!==404){ _logHttp('deleteSupplement', r.status, '/supplements/'+id); }
  }catch(e){ _logErr('deleteSupplement', e); }
}

// ── day-active computation ───────────────────────────────────────────────────
function _suppActiveOn(s, date){
  if(!s) return false;
  var freq = s.freq || 'daily';
  if(freq==='daily') return true;
  var start = s.start_date ? parseLocalDate(s.start_date) : null;
  if(!start) return true;
  var d0 = new Date(date); d0.setHours(0,0,0,0);
  var s0 = new Date(start); s0.setHours(0,0,0,0);
  if(d0 < s0) return false;
  if(freq==='eod'){ var days = Math.round((d0 - s0)/86400000); return days % 2 === 0; }
  if(freq==='weekly'){ return d0.getDay() === s0.getDay(); }
  return true;
}

function _supplementsForDay(date){
  return (_supplements||[]).filter(function(s){ return _suppActiveOn(s, date); });
}

// ── Today / week-carousel section (shown under injections) ───────────────────
// Each active supplement is expanded into its dose slots (AM, PM, or both) and
// rendered as a checkbox row, checkable like an injection. Checked state is
// per supplement + day + slot and persisted to the backend.
function renderTodaySupplements(date){
  var wrap = document.getElementById('today-supplements');
  if(!wrap) return;
  var theDate = date || NOW;
  _suppViewDate = theDate;
  var active = _supplementsForDay(theDate);
  if(!active.length){ wrap.innerHTML=''; return; }
  var dstr = _suppDateKey(theDate);
  var slotOrder = {AM:0, PM:1};
  var rows = [];
  active.forEach(function(s){ _suppSlots(s.timing).forEach(function(slot){ rows.push({s:s, slot:slot}); }); });
  rows.sort(function(a,b){
    if(slotOrder[a.slot]!==slotOrder[b.slot]) return slotOrder[a.slot]-slotOrder[b.slot];
    return (a.s.name||'').localeCompare(b.s.name||'');
  });
  var done = 0;
  var html = rows.map(function(r){
    var taken = _suppIsTaken(r.s.supp_id, dstr, r.slot);
    if(taken) done++;
    return '<div class="check-item'+(taken?' checked-item':'')+'" onclick="toggleSupplementDose(\''+_suppEsc(r.s.supp_id)+'\',\''+dstr+'\',\''+r.slot+'\')">' +
      '<div class="check-box'+(taken?' checked':'')+'"><svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<div class="check-main"><div class="check-name" style="color:var(--text)">' + _suppEsc(r.s.name) + '</div>' +
      (r.s.dose ? '<div class="check-detail">' + _suppEsc(_suppFmtDose(r.s.supp_id, r.s.dose)) + '</div>' : '') + '</div>' +
      '<div class="check-time">' + r.slot + '</div></div>';
  }).join('');
  wrap.innerHTML =
    '<div class="card">' +
    '<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--accent3,#7bd88f)"></div>' +
    '<div class="card-title">SUPPLEMENTS</div></div><span class="card-badge ' + (done===rows.length?'badge-done':'badge-today') + '">' + done + ' / ' + rows.length + '</span></div>' +
    '<div class="checklist">' + html + '</div></div>';
}

// ── Supplements tab ──────────────────────────────────────────────────────────
function buildSupplements(){
  var el = document.getElementById('supplements-body');
  if(!el) return;
  _suppLoadCache();
  var list = (_supplements||[]).slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
  var header =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 16px">' +
    '<div style="font-family:Bebas Neue,sans-serif;font-size:22px;letter-spacing:1px;color:var(--text)">SUPPLEMENTS</div>' +
    '<button onclick="_suppOpenAddSheet()" style="background:var(--accent);color:#000;border:none;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ Add</button>' +
    '</div>';
  var body;
  if(!list.length){
    body = '<div class="empty" style="padding:40px 20px"><div class="empty-icon">💊</div>No supplements yet.<br>Tap “+ Add” to track your vitamins and daily supplements.</div>';
  } else {
    body = list.map(function(s){
      var meta = (SUPP_FREQ_LABELS[s.freq]||'Daily') + ' · ' + (SUPP_TIMING_LABELS[s.timing]||'AM');
      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px">' +
        '<div style="width:9px;height:9px;border-radius:50%;background:var(--accent3,#7bd88f);flex-shrink:0"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:15px;font-weight:600;color:var(--text)">' + _suppEsc(s.name) + '</div>' +
          '<div style="font-size:12px;color:var(--muted2);margin-top:3px">' + _suppEsc(_suppFmtDose(s.supp_id, s.dose)||'') + (s.dose?' · ':'') + meta + '</div>' +
        '</div>' +
        '<button onclick="_suppOpenAddSheet(\'' + _suppEsc(s.id) + '\')" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Edit</button>' +
        '<button onclick="_suppDelete(\'' + _suppEsc(s.id) + '\')" aria-label="Delete" style="background:none;border:none;color:var(--muted2);font-size:20px;cursor:pointer;line-height:1;padding:2px 4px">×</button>' +
      '</div>';
    }).join('');
  }
  el.innerHTML = '<div style="padding:16px">' + header + body + '</div>';
}

// ── Add / edit bottom sheet ──────────────────────────────────────────────────
function _suppOpenAddSheet(editId){
  _suppCloseAddSheet();
  var editing = editId ? (_supplements||[]).find(function(s){return s.id===editId;}) : null;
  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:15px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted,#888);text-transform:uppercase;margin-bottom:8px;display:block';
  var selId = editing ? editing.supp_id : SUPPLEMENT_CAT[0].id;
  var compOpts = SUPPLEMENT_CAT.map(function(c){ return '<option value="'+_suppEsc(c.id)+'"'+(c.id===selId?' selected':'')+'>'+_suppEsc(c.name)+'</option>'; }).join('');
  var freqOpts = Object.keys(SUPP_FREQ_LABELS).map(function(k){ return '<option value="'+k+'"'+(editing&&editing.freq===k?' selected':'')+'>'+SUPP_FREQ_LABELS[k]+'</option>'; }).join('');
  var timeOpts = Object.keys(SUPP_TIMING_LABELS).map(function(k){ return '<option value="'+k+'"'+(editing&&editing.timing===k?' selected':(!editing&&k==='AM'?' selected':''))+'>'+SUPP_TIMING_LABELS[k]+'</option>'; }).join('');

  var ol = document.createElement('div');
  ol.id = 'supp-add-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  ol.onclick = function(e){ if(e.target===ol) _suppCloseAddSheet(); };
  ol.innerHTML =
    '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 36px;max-height:88vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
      '<div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--text)">' + (editing?'EDIT SUPPLEMENT':'ADD SUPPLEMENT') + '</div>' +
      '<button onclick="_suppCloseAddSheet()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button>' +
    '</div>' +
    '<div style="margin-bottom:14px"><label style="'+lSty+'">Supplement</label>' +
      '<select id="supp-as-comp" onchange="_suppFillDoses()" style="'+iSty+'">'+compOpts+'</select></div>' +
    '<div style="margin-bottom:14px"><label style="'+lSty+'">Dose</label>' +
      '<select id="supp-as-dose" onchange="_suppDoseSel()" style="'+iSty+';margin-bottom:8px"></select>' +
      '<input id="supp-as-dose-custom" type="text" placeholder="Custom dose (e.g. 500 mg)" style="'+iSty+';display:none"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px">' +
      '<div style="min-width:0"><label style="'+lSty+'">Cadence</label><select id="supp-as-freq" style="'+iSty+'">'+freqOpts+'</select></div>' +
      '<div style="min-width:0"><label style="'+lSty+'">Timing</label><select id="supp-as-timing" style="'+iSty+'">'+timeOpts+'</select></div>' +
    '</div>' +
    '<button onclick="_suppConfirmAdd(' + (editing?('\''+_suppEsc(editId)+'\''):'') + ')" style="width:100%;background:var(--accent);color:#000;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">' + (editing?'Save':'Add supplement') + '</button>' +
    '</div>';
  document.body.appendChild(ol);
  _suppFillDoses(editing ? _suppFmtDose(editing.supp_id, editing.dose) : null);
}

function _suppCloseAddSheet(){ var ol=document.getElementById('supp-add-overlay'); if(ol) ol.remove(); }

// Populate the dose dropdown from the selected supplement's presets (+ Custom).
function _suppFillDoses(preset){
  var compEl = document.getElementById('supp-as-comp');
  var doseEl = document.getElementById('supp-as-dose');
  if(!compEl || !doseEl) return;
  var cat = _suppCat(compEl.value);
  var doses = (cat && cat.doses) ? cat.doses : [];
  var opts = doses.map(function(d){ return '<option value="'+_suppEsc(d)+'">'+_suppEsc(d)+'</option>'; }).join('');
  opts += '<option value="__custom__">Custom…</option>';
  doseEl.innerHTML = opts;
  var customEl = document.getElementById('supp-as-dose-custom');
  if(preset && doses.indexOf(preset) === -1){
    // preset dose not in the list (a custom value from an edited entry)
    doseEl.value = '__custom__';
    if(customEl){ customEl.style.display='block'; customEl.value = preset; }
  } else {
    if(preset) doseEl.value = preset;
    if(customEl){ customEl.style.display='none'; customEl.value=''; }
  }
}

function _suppDoseSel(){
  var doseEl = document.getElementById('supp-as-dose');
  var customEl = document.getElementById('supp-as-dose-custom');
  if(!doseEl || !customEl) return;
  if(doseEl.value === '__custom__'){ customEl.style.display='block'; customEl.focus(); }
  else { customEl.style.display='none'; }
}

async function _suppConfirmAdd(editId){
  var compEl = document.getElementById('supp-as-comp');
  var doseEl = document.getElementById('supp-as-dose');
  var customEl = document.getElementById('supp-as-dose-custom');
  var freqEl = document.getElementById('supp-as-freq');
  var timeEl = document.getElementById('supp-as-timing');
  if(!compEl) return;
  var cat = _suppCat(compEl.value);
  if(!cat) return;
  var dose = (doseEl && doseEl.value === '__custom__') ? (customEl ? customEl.value.trim() : '') : (doseEl ? doseEl.value : '');
  var existing = editId ? (_supplements||[]).find(function(s){return s.id===editId;}) : null;
  var entry = {
    id:         editId || undefined,
    supp_id:    cat.id,
    name:       cat.name,
    dose:       dose,
    freq:       freqEl ? freqEl.value : 'daily',
    timing:     timeEl ? timeEl.value : 'AM',
    start_date: (existing && existing.start_date) ? existing.start_date : _suppToday()
  };
  // optimistic local update
  if(editId){
    _supplements = (_supplements||[]).map(function(s){ return s.id===editId ? Object.assign({}, s, entry) : s; });
  } else {
    entry.id = 'tmp_' + Date.now().toString(36);
    _supplements = (_supplements||[]).concat([entry]);
  }
  _suppSaveCache();
  _suppCloseAddSheet();
  buildSupplements();
  _suppRefreshDerived();
  // persist to backend (source of truth) — reconcile id for new entries
  var saved = await pushSupplementToAgent(Object.assign({}, entry, editId ? {} : {id: undefined}));
  if(saved && saved.id){
    _supplements = (_supplements||[]).map(function(s){ return (s.id===entry.id) ? saved : s; });
    _suppSaveCache();
    if(_currentTab==='supplements') buildSupplements();
  }
}

async function _suppDelete(id){
  if(!id) return;
  if(typeof confirm==='function' && !confirm('Remove this supplement?')) return;
  _supplements = (_supplements||[]).filter(function(s){ return s.id!==id; });
  _suppSaveCache();
  buildSupplements();
  _suppRefreshDerived();
  await deleteSupplementFromAgent(id);
}

// After the regimen changes: refresh the Today section and the T-Calc SHBG model
// (a supplement like Boron shifts the free-T curve).
function _suppRefreshDerived(){
  if(typeof renderTodaySupplements==='function') renderTodaySupplements(_suppViewDate||NOW);
  if(typeof _tcComputeGhStack==='function') _tcComputeGhStack();
  if(_currentTab==='tcalc' && typeof buildTCalc==='function') buildTCalc();
}
