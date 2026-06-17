// ── Cycle length suggestions ───────────────────────────────────────────────
var CYCLE_WEEKS=[3,6,9,12,15,18,21];
// ── Updated wizard init with cycle_length ──────────────────────────────────
function initWizard(){
  _wiz={step:0,goals:[],peptides:[],trt:{enabled:false,compounds:[]},editMode:false,stackIndex:-1,stackName:'Cycle 1',cycle_length:12};
}
function editStackWithCycle(idx){
  if(idx<0||idx>=_userStacks.length)return;
  var st=_userStacks[idx];
  _wiz={
    step:0,
    goals:st.peptides?st.peptides.map(function(p){var cat=PEPTIDE_CAT.find(function(c){return c.id===p.id;});return cat?cat.goals:[]}).flat().filter(function(v,i,a){return a.indexOf(v)===i;}):[],
    peptides:st.peptides?st.peptides.map(function(p){return JSON.parse(JSON.stringify(p))}):[],
    trt:st.trt?JSON.parse(JSON.stringify(st.trt)):{enabled:false,compounds:[]},
    editMode:true,
    stackIndex:idx,
    stackName:st.name||'Stack '+(idx+1),
    cycle_length:st.cycle_length||12
  };
  showWizard(true);
}
function wizSetCycleLength(val){_wiz.cycle_length=parseInt(val)||12;}
// ── Wizard step 1: Cycle length ────────────────────────────────────────────
var _CYCLE_SELECT_STYLE='background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;margin-bottom:16px;';
function wizStep1(body,footer){
  var html='<div class="wiz-section">Cycle Length</div>';
  html+='<select onchange="wizSetCycleLength(this.value)" style="'+_CYCLE_SELECT_STYLE+'">';
  CYCLE_WEEKS.forEach(function(w){html+='<option value="'+w+'"'+(_wiz.cycle_length===w?' selected':'')+'>'+w+' weeks</option>';});
  html+='</select>';
  html+='<div style="font-size:11px;color:var(--muted2);">Cycle length helps track when to rotate peptides and manage tapering.</div>';
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
// ── Updated wizard flow (insert cycle after goals removed) ──────────────────
var WIZ_TITLES=['CYCLE','GOALS','PEPTIDES','CHECK','CONFIGURE','TRT','REVIEW'];
function wizRender(){
  var steps=7;
  var prog='';
  for(var i=0;i<steps;i++){
    var cls=i<_wiz.step?'done':i===_wiz.step?'active':'';
    prog+='<div class="wiz-dot '+cls+'"></div>';
  }
  document.getElementById('wiz-progress').innerHTML=prog;
  document.getElementById('wiz-title').textContent=(_wiz.editMode?'EDIT ':'BUILD ')+WIZ_TITLES[_wiz.step];
  var body=document.getElementById('wiz-body');
  var footer=document.getElementById('wiz-footer');
  body.scrollTop=0;
  if(_wiz.step===0)wizStep1(body,footer);
  else if(_wiz.step===1)wizStepGoals(body,footer);
  else if(_wiz.step===2)wizStepPeptides(body,footer);
  else if(_wiz.step===3)wizStepCheck(body,footer);
  else if(_wiz.step===4)wizStepConfig(body,footer);
  else if(_wiz.step===5)wizStepTRT(body,footer);
  else wizStepReview(body,footer);
}
// ── Updated save to include cycle_length ────────────────────────────────────
async function wizSave(){
  var btn=document.querySelector('.wiz-footer .btn.btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  var proto={name:_wiz.stackName,cycle_length:_wiz.cycle_length,peptides:_wiz.peptides,trt:_wiz.trt.enabled?_wiz.trt:{}};
  if(_wiz.stackIndex>=0&&_wiz.stackIndex<_userStacks.length){
    _userStacks[_wiz.stackIndex]=proto;
  } else {
    _userStacks.push(proto);
    _wiz.stackIndex=_userStacks.length-1; // prevent double-push on retry
    if(_userStacks.length===1)_activeStackIndices=[0];
  }
  _userStacks=_userStacks.slice(0,4);
  var res=await saveStacksToBackend();
  updateWEEKLY();
  buildWeekStrip();
  buildToday();
  buildStackStore();
  closeWizard();
  switchTab('stack',document.querySelector('.tab'));
  if(res.synced===false){
    // Data saved locally; backend sync failed — show a brief banner
    var nb=document.createElement('div');
    nb.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#aaa;font-size:11px;padding:6px 14px;border-radius:20px;z-index:9999;pointer-events:none;';
    nb.textContent='Saved locally (backend sync pending)';
    document.body.appendChild(nb);
    setTimeout(function(){if(nb.parentNode)nb.parentNode.removeChild(nb);},3500);
  }
}
// ── Updated buildStackStore to show cycle length ────────────────────────────
function createNewStack(){initWizard();showWizard(false);}

function viewStack(idx){_editReadOnly=true;showStackEditor(idx);}
function editStack(idx){_editReadOnly=false;showStackEditor(idx);}
// ── Inline Stack Editor ──────────────────────────────────────────────────────
var _editBuf=null;var _editIdx=-1;var _editReadOnly=false;
function _esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function showStackEditor(idx){
  if(idx<0||idx>=_userStacks.length)return;
  _editIdx=idx;_editBuf=JSON.parse(JSON.stringify(_userStacks[idx]));
  if(!_editBuf.cycle_length)_editBuf.cycle_length=12;
  if(!_editBuf.peptides)_editBuf.peptides=[];
  _stackViewTab='peptides';_editInnerTab='peptides';
  renderStackEditor();
}
function _collectEditInputs(){
  if(!_editBuf)return;
  var nameEl=document.getElementById('edit-stack-name');
  if(nameEl)_editBuf.name=nameEl.value;
  var csEl=document.getElementById('edit-cycle-start');if(csEl)_editBuf.cycle_start=csEl.value;
  (_editBuf.peptides||[]).forEach(function(p,pi){
    var el;
    if((el=document.getElementById('ed-dam-'+pi)))p.dose_am=el.value;
    if((el=document.getElementById('ed-dpm-'+pi)))p.dose_pm=el.value;
    if((el=document.getElementById('ed-uam-'+pi)))p.unit_am=el.value;
    if((el=document.getElementById('ed-upm-'+pi)))p.unit_pm=el.value;
    if((el=document.getElementById('ed-note-'+pi)))p.note=el.value;
    if((el=document.getElementById('ed-sd-'+pi))){if(el.value)p.start_date=el.value;else delete p.start_date;}
  });
  // Keep cycle_start ≤ earliest peptide start_date
  var _ed=_deriveEarliestStartDate(_editBuf.peptides);
  if(_ed&&(!_editBuf.cycle_start||_ed<_editBuf.cycle_start)){_editBuf.cycle_start=_ed;}
}
function _deriveEarliestStartDate(peptides){
  var dates=(peptides||[]).map(function(p){return p.start_date;}).filter(Boolean);
  if(!dates.length)return null;
  dates.sort();
  return dates[0];
}
function renderStackEditor(){
  var body=document.getElementById('stack-body');if(!body)return;
  var st=_editBuf;var cycle=st.cycle_length||12;
  var isActive=_isActiveStack(_editIdx);
  var _effCs=(function(){var _ec=_deriveEarliestStartDate(st.peptides);var _sc=st.cycle_start||'';if(_ec&&(!_sc||_ec<_sc))_sc=_ec;if(_sc){var _csp=_sc.split('-');_sc=_csp[0]+'-'+(_csp[1]||'1').padStart(2,'0')+'-'+(_csp[2]||'1').padStart(2,'0');}return _sc;})();
  var html='';

  if(_editReadOnly){
    html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">';
    html+='<button onclick="buildStackStore()" style="background:none;border:none;color:var(--muted2);font-size:24px;cursor:pointer;padding:0;line-height:1;">←</button>';
    html+='<div style="flex:1;font-size:17px;font-weight:700;color:var(--text);">'+_esc(st.name||'Stack '+(_editIdx+1))+'</div>';
    if(isActive)html+='<span style="background:var(--accent);color:#000;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;">ACTIVE</span>';
    html+='</div>';
    html+='<div class="wiz-section">Cycle</div>';
    if(_effCs){
      var _sd2=parseLocalDate(_effCs);
      var _ed2=new Date(_sd2.getTime()+cycle*7*86400000);
      var _dDone2=Math.max(0,Math.floor((NOW-_sd2)/86400000));
      var _wk2=Math.min(cycle,Math.floor(_dDone2/7)+1);
      html+='<div style="font-size:13px;color:var(--text);margin-bottom:2px;">Start: '+fmtDate(_sd2)+'</div>';
      html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">Week '+_wk2+' of '+cycle+' · Ends '+fmtDate(_ed2)+'</div>';
    }else{
      html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">'+cycle+' wk cycle · No start date</div>';
    }
    html+=_stackTabBar(_stackViewTab,'setStackViewTab');
    if(_stackViewTab==='trt'){
      html+=_renderTRTViewTab(st);
    }else{
      html+='<div class="wiz-section">Peptides</div>';
      if(!st.peptides||!st.peptides.length){
        html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">No peptides added.</div>';
      }else{
        st.peptides.forEach(function(p){
          var dot=p.dot||'#888';
          var dayLabels=['S','M','T','W','T','F','S'];
          var sortedDays=(p.days||[]).slice().sort(function(a,b){return(a+6)%7-(b+6)%7;});
          var daysStr=sortedDays.map(function(d){return dayLabels[d];}).join(' ');
          html+='<div class="cfg-block" style="margin-bottom:8px;">';
          html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
          html+='<div style="width:8px;height:8px;border-radius:50%;background:'+dot+';flex-shrink:0;"></div>';
          html+='<div style="flex:1;font-size:13px;font-weight:600;color:var(--text);">'+_esc(p.name)+'</div>';
          html+='<button class="info-btn" onclick="showPeptideCard(\''+p.id+'\')">ℹ</button>';
          html+='</div>';
          var doseStr='';
          if(p.dose_am)doseStr+='AM: '+_esc(_doseLabel(p.id,p.dose_am,p.unit_am||'mcg'));
          if(p.dose_pm)doseStr+=(doseStr?' · ':'')+'PM: '+_esc(_doseLabel(p.id,p.dose_pm,p.unit_pm||'mcg'));
          if(doseStr)html+='<div style="font-size:12px;color:var(--muted2);padding-left:16px;">'+doseStr+'</div>';
          if(daysStr)html+='<div style="font-size:12px;color:var(--muted2);padding-left:16px;">'+_esc(daysStr)+'</div>';
          if(p.start_date)html+='<div style="font-size:12px;color:var(--muted2);padding-left:16px;">Start: '+_esc(p.start_date)+'</div>';
          html+='</div>';
        });
      }
    }
    html+=_buildEnhancementCycleSection();
    html+='<div style="display:flex;gap:10px;margin-top:24px;padding-bottom:40px;">';
    html+='<button onclick="buildStackStore()" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted2);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Close</button>';
    html+='<button onclick="_editReadOnly=false;renderStackEditor()" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Edit</button>';
    html+='<button onclick="toggleStack('+_editIdx+');renderStackEditor()" style="flex:1;background:'+(isActive?'var(--surface2)':'var(--accent)')+';border:'+(isActive?'1px solid var(--border)':'none')+';color:'+(isActive?'var(--danger)':'#000')+';border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">'+(isActive?'Deactivate':'Activate')+'</button>';
    html+='</div>';
    html+='<div style="padding-bottom:20px;">';
    html+='<button onclick="deleteStack('+_editIdx+')" style="width:100%;background:none;border:1px solid var(--danger);color:var(--danger);border-radius:8px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;opacity:0.7;">Delete Stack</button>';
    html+='</div>';
    body.innerHTML=html;
    return;
  }

  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">';
  html+='<button onclick="buildStackStore()" style="background:none;border:none;color:var(--muted2);font-size:24px;cursor:pointer;padding:0;line-height:1;">←</button>';
  html+='<input id="edit-stack-name" type="text" value="'+_esc(st.name||'')+'" oninput="_editBuf.name=this.value" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:15px;font-weight:600;font-family:inherit;outline:none;">';
  html+='</div>';
  html+='<div class="wiz-section">Cycle Start</div>';
  html+='<input type="date" id="edit-cycle-start" value="'+_esc(_effCs)+'" onchange="_collectEditInputs();renderStackEditor();" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;margin-bottom:6px;">';
  if(_effCs&&cycle){var _sd=parseLocalDate(_effCs);var _ed=new Date(_sd.getTime()+cycle*7*86400000);var _dDone=Math.max(0,Math.floor((NOW-_sd)/86400000));var _wk=Math.min(cycle,Math.floor(_dDone/7)+1);html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">Ends '+fmtDate(_ed)+' · Week '+_wk+' of '+cycle+'</div>';}else{html+='<div style="margin-bottom:16px;"></div>';}
  html+='<div class="wiz-section">Cycle Length</div>';
  html+='<select onchange="_collectEditInputs();_editBuf.cycle_length=parseInt(this.value);renderStackEditor();" style="'+_CYCLE_SELECT_STYLE+'">';
  CYCLE_WEEKS.forEach(function(w){html+='<option value="'+w+'"'+(cycle===w?' selected':'')+'>'+w+' weeks</option>';});
  html+='</select>';
  html+=_stackTabBar(_editInnerTab,'setEditInnerTab');
  if(_editInnerTab==='trt'){
    html+=_renderEditTRT(st.trt);
  }else{
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
    html+='<div class="wiz-section" style="margin:0;">Peptides</div>';
    html+='<button onclick="_collectEditInputs();editAddPeptide();" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">+ Add</button>';
    html+='</div>';
    if(!st.peptides||!st.peptides.length){
      html+='<div style="color:var(--muted2);font-size:13px;padding:16px 0;text-align:center;">No peptides — tap + Add to get started.</div>';
    }else{st.peptides.forEach(function(p,pi){html+=_renderEditPep(p,pi);});}
  }
  html+='<div style="display:flex;gap:10px;margin-top:24px;padding-bottom:40px;">';
  html+='<button onclick="buildStackStore()" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--muted2);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>';
  html+='<button onclick="saveEditBuf()" style="flex:2;background:var(--accent);border:none;color:#000;border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Save Stack</button>';
  html+='</div>';
  body.innerHTML=html;
}
function _renderEditPep(p,pi){
  var dot=p.dot||'#888';
  var html='<div class="cfg-block" style="margin-bottom:8px;">';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">';
  html+='<div style="width:9px;height:9px;border-radius:50%;background:'+dot+';flex-shrink:0;"></div>';
  html+='<div style="flex:1;font-size:13px;font-weight:600;color:var(--text);">'+_esc(p.name)+'</div>';
  html+='<button class="info-btn" onclick="showPeptideCard(\''+p.id+'\')">ℹ</button>';
  html+='<button onclick="_collectEditInputs();editRemovePeptide('+pi+')" style="background:none;border:none;color:var(--muted2);font-size:20px;cursor:pointer;padding:0;line-height:1;">×</button>';
  html+='</div>';
  html+='<div class="cfg-row"><div class="cfg-lbl">Timing</div><div class="time-chips">';
  ['AM','PM'].forEach(function(t){html+='<div class="time-chip'+(p.times&&p.times.includes(t)?' sel':'')+'" onclick="editToggleTime('+pi+',\''+t+'\')">'+t+'</div>';});
  html+='</div></div>';
  if(p.times&&p.times.includes('AM')){
    html+='<div class="cfg-row"><div class="cfg-lbl">AM Dose</div><div class="dose-row">';
    html+='<input id="ed-dam-'+pi+'" class="dose-in" type="text" value="'+_esc(String(p.dose_am||''))+'" oninput="_editBuf.peptides['+pi+'].dose_am=this.value" placeholder="0">';
    html+='<select id="ed-uam-'+pi+'" class="unit-sel" onchange="_editBuf.peptides['+pi+'].unit_am=this.value">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===(p.unit_am||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select>';
    html+='</div></div>';
  }
  if(p.times&&p.times.includes('PM')){
    html+='<div class="cfg-row"><div class="cfg-lbl">PM Dose</div><div class="dose-row">';
    html+='<input id="ed-dpm-'+pi+'" class="dose-in" type="text" value="'+_esc(String(p.dose_pm||''))+'" oninput="_editBuf.peptides['+pi+'].dose_pm=this.value" placeholder="0">';
    html+='<select id="ed-upm-'+pi+'" class="unit-sel" onchange="_editBuf.peptides['+pi+'].unit_pm=this.value">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===(p.unit_pm||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select>';
    html+='</div></div>';
  }
  html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">';
  DAYS_SHORT.forEach(function(d,di){html+='<div class="day-chip'+(p.days&&p.days.includes(di)?' sel':'')+'" onclick="editToggleDay(this,'+pi+','+di+')">'+d+'</div>';});
  html+='</div></div>';
  html+='<div class="cfg-row"><div class="cfg-lbl">Note</div>';
  html+='<input id="ed-note-'+pi+'" class="note-in" type="text" value="'+_esc(String(p.note||''))+'" oninput="_editBuf.peptides['+pi+'].note=this.value" placeholder="e.g. fasted, pre-sleep...">';
  html+='</div>';
  var _sdVal=p.start_date||'';if(_sdVal){var _sdp=_sdVal.split('-');_sdVal=_sdp[0]+'-'+(_sdp[1]||'1').padStart(2,'0')+'-'+(_sdp[2]||'1').padStart(2,'0');}
  html+='<div class="cfg-row"><div class="cfg-lbl">Start</div>';
  html+='<input id="ed-sd-'+pi+'" type="date" value="'+_esc(_sdVal)+'" oninput="_collectEditInputs()" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px;font-family:inherit;outline:none;flex:1;">';
  html+='</div></div>';
  return html;
}
function editToggleTime(pi,t){
  _collectEditInputs();
  var p=_editBuf.peptides[pi];if(!p)return;
  if(!p.times)p.times=[];
  var i=p.times.indexOf(t);
  if(i===-1)p.times.push(t);else if(p.times.length>1)p.times.splice(i,1);
  renderStackEditor();
}
function editToggleDay(el,pi,di){
  var p=_editBuf.peptides[pi];if(!p)return;
  if(!p.days)p.days=[];
  var i=p.days.indexOf(di);
  if(i===-1){p.days.push(di);el.classList.add('sel');}
  else if(p.days.length>1){p.days.splice(i,1);el.classList.remove('sel');}
}
function editRemovePeptide(pi){_editBuf.peptides.splice(pi,1);renderStackEditor();}
function editToggleTRT(){if(!_editBuf.trt)_editBuf.trt={};if(!_editBuf.trt.compounds)_editBuf.trt.compounds=[];_editBuf.trt.enabled=!_editBuf.trt.enabled;_collectEditInputs();renderStackEditor();}
function editToggleTRTCompound(id){if(!_editBuf.trt)_editBuf.trt={enabled:true,compounds:[]};if(!_editBuf.trt.compounds)_editBuf.trt.compounds=[];var idx=_editBuf.trt.compounds.findIndex(function(c){return c.id===id;});if(idx!==-1){_editBuf.trt.compounds.splice(idx,1);}else{var cat=TRT_CAT.find(function(c){return c.id===id;});if(cat)_editBuf.trt.compounds.push({id:id,name:cat.name,dose:cat.defaultDose||'',unit:cat.unit||'mg',freqVal:cat.freqVal||1,freqUnit:cat.freqUnit||'weeks'});}_collectEditInputs();renderStackEditor();}
function _renderEditTRT(trt){if(!trt)trt={};var enabled=!!trt.enabled;var selIds=(trt.compounds||[]).map(function(c){return c.id;});var html='<div class="wiz-section" style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;"><span>TRT Protocol</span><div onclick="editToggleTRT()" style="cursor:pointer;"><div class="toggle-sw'+(enabled?' on':'')+'"></div></div></div>';if(enabled){TRT_CAT.forEach(function(c){var isSel=selIds.includes(c.id);var disabled=!isSel&&selIds.length>=2;html+='<div class="pep-card'+(isSel?' sel':'')+(disabled?' disabled':'')+'" onclick="'+(disabled?'':('editToggleTRTCompound(\''+c.id+'\')'))+'" style="margin-bottom:6px;'+(disabled?'opacity:0.4;cursor:default;pointer-events:none;':'')+'"><div class="pep-dot-sm" style="background:'+c.dot+'"></div><div class="pep-info"><div class="pep-name">'+c.name+'</div><div class="pep-meta">'+c.sub+'</div></div><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div>';});(trt.compounds||[]).forEach(function(c){var cat=TRT_CAT.find(function(t){return t.id===c.id;});var dot=cat?cat.dot:'var(--accent4)';html+='<div class="cfg-block" style="margin-bottom:8px;"><div class="cfg-name"><div style="width:9px;height:9px;border-radius:50%;background:'+dot+'"></div>'+_esc(c.name)+'</div>';html+='<div class="cfg-row"><div class="cfg-lbl">Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+_esc(String(c.dose||''))+'" oninput="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(x){return x.id===\''+c.id+'\'});if(cc)cc.dose=x;})(this.value)" placeholder="0"><select class="unit-sel" onchange="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(y){return y.id===\''+c.id+'\'});if(cc)cc.unit=x;})(this.value)">'+['mg','ml','IU'].map(function(u){return'<option'+(u===(c.unit||'mg')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div></div>';html+='<div class="cfg-row"><div class="cfg-lbl">Frequency</div><div class="dose-row"><input class="dose-in" type="number" min="1" value="'+String(c.freqVal||1)+'" oninput="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(y){return y.id===\''+c.id+'\'});if(cc)cc.freqVal=parseInt(x)||1;})(this.value)" style="max-width:70px;"><select class="unit-sel" onchange="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(y){return y.id===\''+c.id+'\'});if(cc)cc.freqUnit=x;})(this.value)"><option'+('days'===(c.freqUnit||'weeks')?' selected':'')+'>days</option><option'+('weeks'===(c.freqUnit||'weeks')?' selected':'')+'>weeks</option></select></div></div>';html+='</div>';});}return html;}
function editAddPeptide(){
  var currentIds=(_editBuf.peptides||[]).map(function(p){return p.id;});
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick=function(e){if(e.target===overlay)document.body.removeChild(overlay);};
  var sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;max-height:75vh;overflow-y:auto;';
  var groups={};PEPTIDE_CAT.forEach(function(cat){if(!groups[cat.group])groups[cat.group]=[];groups[cat.group].push(cat);});
  var html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html+='<div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--accent);">ADD PEPTIDE</div>';
  html+='<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;">×</button>';
  html+='</div>';
  Object.keys(groups).forEach(function(grp){
    html+='<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted2);margin:12px 0 6px;">'+grp+'</div>';
    groups[grp].forEach(function(cat){
      var already=currentIds.includes(cat.id);
      var doseStr=cat.dflt.doseAm+(cat.dflt.unitAm?' '+cat.dflt.unitAm:'');
      if(cat.dflt.times&&cat.dflt.times.includes('PM'))doseStr+=' / '+cat.dflt.dosePm+(cat.dflt.unitPm?' '+cat.dflt.unitPm:'');
      html+='<div class="pep-card" onclick="'+(already?'':'editPickPeptide(\''+cat.id+'\')')+'" style="opacity:'+(already?0.4:1)+';cursor:'+(already?'default':'pointer')+';">';
      html+='<div class="pep-dot-sm" style="background:'+cat.dot+';"></div>';
      html+='<div style="flex:1;"><div style="font-size:13px;font-weight:600;color:var(--text);">'+cat.name+'</div>';
      html+='<div style="font-size:11px;color:var(--muted2);">'+doseStr+'</div></div>';
      if(already)html+='<div style="font-size:11px;color:var(--muted2);">in stack</div>';
      html+='<button class="info-btn" onclick="event.stopPropagation();showPeptideCard(\''+cat.id+'\')">ℹ</button>';
      html+='</div>';
    });
  });
  sheet.innerHTML=html;overlay.appendChild(sheet);document.body.appendChild(overlay);window._addPepOverlay=overlay;
}
function editPickPeptide(id){
  var cat=PEPTIDE_CAT.find(function(c){return c.id===id;});if(!cat)return;
  var d=cat.dflt;
  _editBuf.peptides.push({id:cat.id,name:cat.name,dot:cat.dot,times:d.times.slice(),days:d.days.slice(),dose_am:d.doseAm,dose_pm:d.dosePm,unit_am:d.unitAm,unit_pm:d.unitPm,note:'',active:true});
  if(window._addPepOverlay){try{document.body.removeChild(window._addPepOverlay);}catch(e){}window._addPepOverlay=null;}
  renderStackEditor();
}
async function saveEditBuf(){
  _collectEditInputs();
  _userStacks[_editIdx]=_editBuf;
  if(_isActiveStack(_editIdx)){updateWEEKLY();buildWeekStrip();buildToday();}
  await saveStacksToBackend();
  buildStackStore();
  buildTimeline();
}
// ── Modified wizard save ─────────────────────────────────────────────────────
// ── Modified wizard step 4 review ────────────────────────────────────────────
function wizStep4(body,footer){
  var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  var issues=checkStack(pepObjs);
  var hasErrors=issues.some(function(i){return i.level==='err';});
  var html='<div class="wiz-section">Stack Name</div><input class="trt-in" type="text" value="'+String(_wiz.stackName||'')+'" oninput="wizSetStackName(this.value)" placeholder="e.g. Cycle 1, Cutting Stack..."><div class="wiz-section" style="margin-top:16px">Check</div><div id="wiz-chk-section">'+renderCheckResults(pepObjs,'wizinline')+'</div>';
  html+='<div class="wiz-section">Summary</div>';
  if(_wiz.peptides.length){
    _wiz.peptides.forEach(function(p){
      var dose=p.times&&p.times.includes('AM')&&p.times.includes('PM')?(p.dose_am||'?')+(p.unit_am||'')+'/'+(p.dose_pm||'?')+(p.unit_pm||''):(p.times&&p.times.includes('AM')?(p.dose_am||'?')+(p.unit_am||''):(p.dose_pm||'?')+(p.unit_pm||''));
      var days=p.days&&p.days.length===7?'Every day':p.days&&p.days.length?p.days.length+'× / week':'?';
      html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(p.dot||'#888')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+p.name+'</div><div style="font-size:12px;color:var(--muted2)">'+dose+' · '+days+'</div></div>';
    });
  } else {
    html+='<div style="color:var(--muted2);font-size:13px;">No peptides selected.</div>';
  }
  _trtCompounds(_wiz.trt).forEach(function(c){
    html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(c.dot||'var(--accent4)')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+c.name+'</div><div style="font-size:12px;color:var(--muted2)">'+(c.dose?c.dose+(c.unit||'mg')+' ':'')+(c.freqVal?'every '+c.freqVal+' '+c.freqUnit:'TRT')+'</div></div>';
  });
  body.innerHTML=html;
  var saveLabel=hasErrors?'Save Anyway (conflicts)':'Save Stack';
  footer.innerHTML='<button class="btn-check" onclick="wizShowCheck()">Re-check</button><button class="btn btn-primary" style="flex:1" onclick="wizSave()">'+saveLabel+'</button>';
}
function wizSetStackName(val){_wiz.stackName=val;}

function _synthesizeProtocol(weekly){
  var seen={};var peptides=[];
  weekly.forEach(function(w){
    var baseId=w.id.replace(/-am$|-pm$/,'');
    var pn=(w.name||'').toLowerCase().replace(/\s*\(.*$/,'').trim();
    var catM=PEPTIDE_CAT.find(function(c){var cn=c.name.toLowerCase().replace(/\s*\(.*$/,'').trim();return pn===cn||cn.startsWith(pn)||pn.startsWith(cn);});
    var pepId=catM?catM.id:baseId;
    if(!seen[pepId]){seen[pepId]={id:pepId,name:w.name,dot:w.dot,days:w.dow.slice(),times:[],dose_am:'',dose_pm:'',unit_am:'mg',unit_pm:'mg',note:'',active:true};peptides.push(seen[pepId]);}
    var e=seen[pepId];
    w.dow.forEach(function(d){if(!e.days.includes(d))e.days.push(d);});
    var t=w.time||'AM';
    if(!e.times.includes(t))e.times.push(t);
    var rawPart=w.detail?w.detail.split('—')[0].trim():'';
    var dm=rawPart.match(/^([\d.]+)\s*(mg|mcg|IU|ml)?$/);
    if(dm){if(t==='AM'){e.dose_am=dm[1];e.unit_am=dm[2]||'mg';}else{e.dose_pm=dm[1];e.unit_pm=dm[2]||'mg';}}
    else{if(t==='AM')e.dose_am=rawPart;else e.dose_pm=rawPart;}
    if(!w.startDate&&!w.endDate){e._permanentDose=true;}
    else if(!e._permanentDose){var _fmt=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};if(w.startDate&&!e.start_date)e.start_date=_fmt(w.startDate);if(w.endDate&&!e.end_date)e.end_date=_fmt(w.endDate);}
  });
  return{peptides:peptides,trt:{},_unsaved:true};
}
// ── Run rule checks ──────────────────────────────────────────────────────────
function checkStack(peptides){
  var results=[];
  STACK_RULES.forEach(function(rule){
    if(rule.check(peptides))results.push({level:rule.level,title:rule.title,msg:rule.msg,id:rule.id});
  });
  return results;
}
// ── Render Check Stack results ───────────────────────────────────────────────
function renderCheckResults(peptides,toggleCtx){
  var issues=checkStack(peptides);
  if(!issues.length)return '<div class="rule-box ok"><div class="rule-title ok">✓ Stack looks clean</div><div class="rule-msg">No contraindications or redundancies detected.</div></div>';
  return issues.map(function(i){
    var ruleObj=STACK_RULES.find(function(r){return r.id===i.id;});
    var conflictHtml='';
    if(toggleCtx&&ruleObj&&ruleObj.getConflicting){
      var cids=ruleObj.getConflicting(peptides);
      if(cids.length){
        conflictHtml='<div class="conflict-peps">';
        cids.forEach(function(cid){
          var cat=PEPTIDE_CAT.find(function(c){return c.id===cid;});
          var name=cat?cat.name:cid;
          var dot=cat?cat.dot:'#888';
          conflictHtml+='<div class="conflict-pep" onclick="_rcToggle(\''+toggleCtx+'\',\''+cid+'\')">'
            +'<div class="conflict-chk"><svg width="11" height="9" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
            +'<div style="width:7px;height:7px;border-radius:50%;background:'+dot+';flex-shrink:0"></div>'
            +'<span style="font-size:13px;color:var(--text)">'+name+'</span>'
            +'</div>';
        });
        conflictHtml+='<div style="font-size:11px;color:var(--muted2);margin-top:4px;">Uncheck one to remove it, then re-check</div></div>';
      }
    }
    return '<div class="rule-box '+i.level+'"><div class="rule-title '+i.level+'">'+(i.level==='err'?'⛔':'⚠️')+' '+i.title+'</div><div class="rule-msg">'+i.msg+'</div>'+conflictHtml+'</div>';
  }).join('');
}
function _rcToggle(ctx,id){
  if(!_wiz||!_wiz.peptides)return;
  var idx=_wiz.peptides.findIndex(function(p){return p.id===id;});
  if(idx!==-1)_wiz.peptides.splice(idx,1);
  if(ctx==='wizpopup'&&window._wizCheckSheet){
    var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
    window._wizCheckSheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--accent)">STACK CHECK</div><button onclick="this.closest(\'[style*=fixed]\').remove();window._wizCheckSheet=null;" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer">×</button></div>'+renderCheckResults(pepObjs,'wizpopup');
  } else {
    var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
    var chkEl=document.getElementById('wiz-chk-section');
    if(chkEl)chkEl.innerHTML=renderCheckResults(pepObjs,'wizinline');
    var saveBtn=document.querySelector('#wiz-footer .btn.btn-primary');
    if(saveBtn)saveBtn.textContent='Next →';
  }
}
// ── Save protocol to backend ─────────────────────────────────────────────────
async function saveProtocolToBackend(proto){
  try{
    var r=await fetch(AGENT_URL+'/protocol',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(proto)});
    return r.ok;
  }catch(e){return false;}
}
// ── Build Stack tab (3 states) ────────────────────────────────────────────────
// ── Check Stack panel ─────────────────────────────────────────────────────────
function showCheckPanel(){
  if(!_userProtocol||!_userProtocol.peptides)return;
  var pepObjs=_userProtocol.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick=function(e){if(e.target===overlay)document.body.removeChild(overlay);};
  var sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;max-height:80vh;overflow-y:auto;';
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--accent)">STACK CHECK</div><button onclick="document.body.removeChild(this.closest(\'[style*=fixed]\'))" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer">×</button></div>'+renderCheckResults(pepObjs);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}
// ── Peptide info card (pokemon style) ────────────────────────────────────────
function showPeptideCard(id){
  var cat=PEPTIDE_CAT.find(function(c){return c.id===id;});if(!cat)return;
  var dot=cat.dot||'#888';
  var GOAL_ICONS={muscle:'💪',recovery:'🩹',skin:'✨',fat:'🔥',cognitive:'🧠',antiaging:'⏳',trt:'⚡'};
  var goalsHtml=(cat.goals||[]).map(function(g){return'<span class="pcard-goal" style="background:'+dot+'20;border-color:'+dot+'44;color:'+dot+'">'+(GOAL_ICONS[g]||'')+' '+(g.charAt(0).toUpperCase()+g.slice(1))+'</span>';}).join('');
  var userPep=_userProtocol&&_userProtocol.peptides?_userProtocol.peptides.find(function(p){return p.id===id;}):null;
  var myDoseHtml='';
  if(userPep){
    var parts=[];if(userPep.dose_am)parts.push('AM: '+_doseLabel(userPep.id,userPep.dose_am,userPep.unit_am||'mcg'));if(userPep.dose_pm)parts.push('PM: '+_doseLabel(userPep.id,userPep.dose_pm,userPep.unit_pm||'mcg'));
    if(parts.length)myDoseHtml='<div style="background:'+dot+'15;border:1px solid '+dot+'30;border-radius:10px;padding:10px 14px;margin-bottom:4px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:'+dot+';margin-bottom:3px;">Your dose</div><div style="font-size:13px;color:var(--text);">'+parts.join(' · ')+'</div></div>';
  }
  var benefitsHtml=(cat.benefits||[]).map(function(b){return'<li>'+b+'</li>';}).join('');
  var sideHtml=(cat.sideEffects||[]).map(function(s){return'<li>'+s+'</li>';}).join('');
  var overlay=document.createElement('div');
  overlay.className='pcard-overlay';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};
  var sheet=document.createElement('div');
  sheet.className='pcard-sheet';
  sheet.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">'
    +'<div style="flex:1;padding-right:12px;">'
    +'<div class="pcard-name" style="color:'+dot+'">'+cat.name+'</div>'
    +'<div style="font-size:11px;font-weight:600;color:var(--muted2);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">'+cat.group+'</div>'
    +'</div>'
    +'<button onclick="this.closest(\'.pcard-overlay\').remove()" style="background:none;border:none;color:var(--muted2);font-size:26px;cursor:pointer;line-height:1;flex-shrink:0;">×</button>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
    +'<div style="height:2px;flex:1;background:'+dot+';border-radius:2px;opacity:0.5;"></div>'
    +(cat.halfLife?'<div style="font-size:11px;color:var(--muted2);white-space:nowrap;">t½ '+cat.halfLife+'</div>':'')
    +'</div>'
    +'<div class="pcard-goals" style="margin-bottom:16px;">'+goalsHtml+'</div>'
    +myDoseHtml
    +(cat.mechanism?'<div class="pcard-section" style="color:'+dot+'">How it works</div><div class="pcard-body">'+cat.mechanism+'</div>':'')
    +(benefitsHtml?'<div class="pcard-section" style="color:'+dot+'">Benefits</div><ul class="pcard-ul" style="color:'+dot+'">'+benefitsHtml+'</ul>':'')
    +(cat.protocol?'<div class="pcard-section" style="color:'+dot+'">Typical protocol</div><div class="pcard-body">'+cat.protocol+'</div>':'')
    +(sideHtml?'<div class="pcard-section" style="color:'+dot+'">Side effects</div><ul class="pcard-ul">'+sideHtml+'</ul>':'')
    +'<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">'
    +(cat.dflt&&cat.dflt.doseAm?'<div class="pcard-stat"><div class="pcard-lbl">Typical AM dose</div><div class="pcard-val" style="color:'+dot+'">'+cat.dflt.doseAm+' '+cat.dflt.unitAm+'</div></div>':'')
    +(cat.dflt&&cat.dflt.dosePm?'<div class="pcard-stat"><div class="pcard-lbl">Typical PM dose</div><div class="pcard-val" style="color:'+dot+'">'+cat.dflt.dosePm+' '+cat.dflt.unitPm+'</div></div>':'')
    +(cat.dflt&&cat.dflt.times?'<div class="pcard-stat"><div class="pcard-lbl">Timing</div><div class="pcard-val">'+cat.dflt.times.join(' + ')+'</div></div>':'')
    +(cat.sku?'<div class="pcard-stat"><div class="pcard-lbl">SKU</div><div class="pcard-val">'+cat.sku+'</div></div>':'')
    +'</div>';
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}
// ── Wizard ────────────────────────────────────────────────────────────────────
var GOAL_DEFS=[{id:'muscle',label:'Muscle & Recovery',icon:'💪'},{id:'recovery',label:'Injury & Healing',icon:'🩹'},{id:'skin',label:'Skin & Anti-aging',icon:'✨'},{id:'fat',label:'Fat Loss',icon:'🔥'},{id:'cognitive',label:'Cognitive',icon:'🧠'},{id:'antiaging',label:'Longevity',icon:'⏳'},{id:'trt',label:'TRT Support',icon:'⚡'}];
var UNITS=['mg','mcg','IU','ml'];var UNIT_LABELS={mcg:'µg'};
var DAYS_SHORT=['S','M','T','W','T','F','S'];

function wizStepGoals(body,footer){
  var html='<div class="wiz-section">What are your goals?</div><div class="goal-grid">';
  GOAL_DEFS.forEach(function(g){
    var sel=_wiz.goals.includes(g.id)?'sel':'';
    html+='<div class="goal-chip '+sel+'" onclick="wizToggleGoal(\''+g.id+'\')">'+g.icon+' '+g.label+'</div>';
  });
  html+='</div><div style="font-size:12px;color:var(--muted2);margin-top:12px;">Select all that apply. Used to filter the peptide catalogue.</div>';
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}

function wizToggleGoal(id){
  var i=_wiz.goals.indexOf(id);
  if(i===-1){
    _wiz.goals.push(id);
    if(id==='trt'){_wiz.trt.enabled=true;if(!_wiz.trt.compounds)_wiz.trt.compounds=[];}
  } else {
    _wiz.goals.splice(i,1);
    if(id==='trt'){_wiz.trt.enabled=false;_wiz.trt.compounds=[];}
  }
  wizStepGoals(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}

function wizStepPeptides(body,footer){
  var filtered=PEPTIDE_CAT;
  if(_wiz.goals.length){filtered=PEPTIDE_CAT.filter(function(p){return p.goals.some(function(g){return _wiz.goals.includes(g);});});}
  var groups={};
  filtered.forEach(function(p){if(!groups[p.group])groups[p.group]=[];groups[p.group].push(p);});
  var selIds=_wiz.peptides.map(function(x){return x.id;});
  _wiz.peptides.forEach(function(sp){
    if(!filtered.find(function(f){return f.id===sp.id;})){
      var cat=PEPTIDE_CAT.find(function(c){return c.id===sp.id;});
      if(cat){if(!groups['Selected'])groups['Selected']=[];groups['Selected'].push(cat);}
    }
  });
  var html='';
  if(!_wiz.goals.length)html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:12px;">Showing all peptides. Select goals on the previous step to filter.</div>';
  Object.keys(groups).forEach(function(grp){
    html+='<div class="wiz-section">'+grp+'</div>';
    groups[grp].forEach(function(p){
      var isSel=selIds.includes(p.id);
      html+='<div class="pep-card'+(isSel?' sel':'')+'" onclick="wizTogglePep(\''+p.id+'\')"><div class="pep-dot-sm" style="background:'+p.dot+'"></div><div class="pep-info"><div class="pep-name">'+p.name+'</div><div class="pep-meta">'+p.desc+'</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><button class="info-btn" onclick="event.stopPropagation();showPeptideCard(\''+p.id+'\')" style="margin-bottom:2px;">ℹ</button><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div></div>';
    });
  });
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}

function wizTogglePep(id){
  var idx=_wiz.peptides.findIndex(function(p){return p.id===id;});
  if(idx===-1){
    var cat=PEPTIDE_CAT.find(function(c){return c.id===id;});
    if(!cat)return;
    var d=cat.dflt;
    _wiz.peptides.push({id:id,name:cat.name,dot:cat.dot,times:d.times.slice(),days:d.days.slice(),dose_am:d.doseAm,dose_pm:d.dosePm,unit_am:d.unitAm,unit_pm:d.unitPm,note:'',active:true});
  } else {
    _wiz.peptides.splice(idx,1);
  }
  wizStepPeptides(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}

function wizShowCheck(){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:400;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick=function(e){if(e.target===overlay){overlay.remove();window._wizCheckSheet=null;}};
  var sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;max-height:70vh;overflow-y:auto;';
  window._wizCheckSheet=sheet;
  var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--accent)">STACK CHECK</div><button onclick="this.closest(\'[style*=fixed]\').remove();window._wizCheckSheet=null;" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer">×</button></div>'+renderCheckResults(pepObjs,'wizpopup');
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

function wizStepCheck(body,footer){
  if(!_wiz.peptides.length){
    body.innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--muted2);">No peptides selected. Go back and add some.</div>';
    footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
    return;
  }
  var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  var issues=checkStack(pepObjs);
  var hasErrors=issues.some(function(i){return i.level==='err';});
  var html='<div class="wiz-section" style="margin-bottom:8px">Selected peptides</div>';
  _wiz.peptides.forEach(function(p){
    html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 0"><div style="width:7px;height:7px;border-radius:50%;background:'+(p.dot||'#888')+';flex-shrink:0"></div><span style="font-size:13px;color:var(--text)">'+p.name+'</span></div>';
  });
  html+='<div class="wiz-section" style="margin-top:16px;margin-bottom:8px">Validation</div><div id="wiz-chk-section">'+renderCheckResults(pepObjs,'wizinline')+'</div>';
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
function _renderDoseGuide(pepId){
  var tiers=DOSE_GUIDE&&DOSE_GUIDE[pepId];
  if(!tiers||!tiers.length)return'';
  var rows=tiers.map(function(t){
    var bg=t.b?'background:rgba(var(--accent-rgb,60,255,160),0.08);border:1px solid rgba(var(--accent-rgb,60,255,160),0.3);':'background:var(--surface2);border:1px solid var(--border);';
    var doseHtml=t.d?('<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">'+t.d+'</span>'):'';
    var note=t.n?('<span style="font-size:11px;color:var(--muted2);flex:1">'+t.n+'</span>'):'';
    var risk=t.r?('<div style="font-size:11px;color:#f59e0b;padding:2px 0 0 0">⚠ '+t.r+'</div>'):'';
    return'<div style="'+bg+'border-radius:6px;padding:5px 8px;margin-bottom:3px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:10px;font-weight:700;color:'+(t.b?'var(--accent)':'var(--muted2)')+';text-transform:uppercase;min-width:62px">'+t.l+'</span>'+doseHtml+'</div>'+note+risk+'</div>';
  });
  return'<div class="cfg-row" style="display:block"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px">Recommended Doses</div>'+rows.join('')+'</div>';
}
function _renderRampSection(p,pi){
  var hasRamp=!!(p.dose_phases&&p.dose_phases.length);
  var btn='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:'+(hasRamp?'8px':'0')+'"><span style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase">Dose Escalation</span><div onclick="wizToggleRamp('+pi+')" style="cursor:pointer"><div class="toggle-sw'+(hasRamp?' on':'')+'"></div></div></div>';
  if(!hasRamp)return'<div class="cfg-row" style="display:block">'+btn+'</div>';
  var phases=(p.dose_phases||[]).slice().sort(function(a,b){return a.w-b.w;});
  var rows=phases.map(function(ph,phi){
    var uOpts=UNITS.map(function(u){return'<option value="'+u+'"'+(u===(ph.u||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('');
    return'<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px">'
      +'<span style="font-size:11px;color:var(--muted2);white-space:nowrap;min-width:30px">Wk</span>'
      +'<input class="dose-in" type="number" min="0" value="'+ph.w+'" oninput="wizSetPhase('+pi+','+phi+',\'w\',+this.value)" style="width:44px;text-align:center;">'
      +'<input class="dose-in" type="text" value="'+String(ph.d||'')+'" oninput="wizSetPhase('+pi+','+phi+',\'d\',this.value)" placeholder="dose" style="width:60px;">'
      +'<select class="unit-sel" onchange="wizSetPhase('+pi+','+phi+',\'u\',this.value)">'+uOpts+'</select>'
      +'<button onclick="wizRemovePhase('+pi+','+phi+')" style="background:none;border:none;color:var(--muted2);font-size:16px;cursor:pointer;padding:0 4px;line-height:1">×</button>'
      +'</div>';
  }).join('');
  return'<div class="cfg-row" style="display:block">'+btn
    +'<div style="font-size:11px;color:var(--muted2);margin-bottom:8px">Dose auto-updates each day based on cycle week</div>'
    +rows
    +'<button onclick="wizAddPhase('+pi+')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);border-radius:6px;padding:3px 10px;cursor:pointer;font-family:inherit;margin-top:2px">+ Add phase</button>'
    +'</div>';
}
function wizStepConfig(body,footer){
  if(!_wiz.peptides.length){body.innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--muted2);">No peptides selected. Go back and add some.</div>';footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';return;}
  var html='<div style="font-size:12px;color:var(--muted2);margin-bottom:14px;">Configure dose, timing and frequency for each peptide.</div>';
  _wiz.peptides.forEach(function(p,pi){
    var cat=PEPTIDE_CAT.find(function(c){return c.id===p.id;});
    var dot=p.dot||(cat?cat.dot:'#888');
    html+='<div class="cfg-block"><div class="cfg-name"><div style="width:9px;height:9px;border-radius:50%;background:'+dot+';flex-shrink:0"></div>'+p.name+'<button class="info-btn" style="margin-left:auto;" onclick="showPeptideCard(\''+p.id+'\')">ℹ</button></div>';
    html+='<div class="cfg-row"><div class="cfg-lbl">Timing</div><div class="time-chips">';
    ['AM','PM'].forEach(function(t){html+='<div class="time-chip'+(p.times&&p.times.includes(t)?' sel':'')+'" onclick="wizToggleTime('+pi+',\''+t+'\')">'+t+'</div>';});
    html+='</div></div>';
    if(p.times&&p.times.includes('AM')){html+='<div class="cfg-row"><div class="cfg-lbl">AM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(p.dose_am||'')+'" oninput="wizSetDose('+pi+',\'am\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetUnit('+pi+',\'am\',this.value)">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===(p.unit_am||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select></div></div>';}
    if(p.times&&p.times.includes('PM')){html+='<div class="cfg-row"><div class="cfg-lbl">PM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(p.dose_pm||'')+'" oninput="wizSetDose('+pi+',\'pm\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetUnit('+pi+',\'pm\',this.value)">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===(p.unit_pm||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select></div></div>';}
    html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">';
    DAYS_SHORT.forEach(function(d,di){html+='<div class="day-chip'+(p.days&&p.days.includes(di)?' sel':'')+'" onclick="wizToggleDay('+pi+','+di+')">'+d+'</div>';});
    html+='</div></div><div class="cfg-row"><div class="cfg-lbl">Note (optional)</div><input class="note-in" type="text" value="'+String(p.note||'')+'" oninput="wizSetNote('+pi+',this.value)" placeholder="e.g. fasted, pre-sleep..."></div>';
    html+=_renderDoseGuide(p.id);
    html+=_renderRampSection(p,pi);
    html+='</div>';
  });
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}

function wizToggleTime(pi,t){var p=_wiz.peptides[pi];if(!p)return;if(!p.times)p.times=[];var i=p.times.indexOf(t);if(i===-1)p.times.push(t);else if(p.times.length>1)p.times.splice(i,1);wizStepConfig(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));}
function wizToggleDay(pi,di){var p=_wiz.peptides[pi];if(!p)return;if(!p.days)p.days=[];var i=p.days.indexOf(di);if(i===-1)p.days.push(di);else if(p.days.length>1)p.days.splice(i,1);wizStepConfig(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));}
function wizSetDose(pi,slot,val){var p=_wiz.peptides[pi];if(!p)return;if(slot==='am')p.dose_am=val;else p.dose_pm=val;}
function wizSetUnit(pi,slot,val){var p=_wiz.peptides[pi];if(!p)return;if(slot==='am')p.unit_am=val;else p.unit_pm=val;}
function wizSetNote(pi,val){var p=_wiz.peptides[pi];if(!p)return;p.note=val;}
function wizToggleRamp(pi){
  var p=_wiz.peptides[pi];if(!p)return;
  if(p.dose_phases&&p.dose_phases.length){
    delete p.dose_phases;
  } else {
    // Pre-populate with DEFAULT_PHASES for this compound, or a single phase at current dose
    var def=DEFAULT_PHASES&&DEFAULT_PHASES[p.id];
    if(def){p.dose_phases=def.map(function(ph){return{w:ph.w,d:ph.d,u:ph.u};});}
    else{var u=p.unit_am||p.unit_pm||'mg';p.dose_phases=[{w:0,d:p.dose_am||p.dose_pm||'',u:u}];}
  }
  wizStepConfig(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}
function wizAddPhase(pi){
  var p=_wiz.peptides[pi];if(!p)return;
  if(!p.dose_phases)p.dose_phases=[];
  var lastW=p.dose_phases.length?Math.max.apply(null,p.dose_phases.map(function(ph){return ph.w||0;})):0;
  var u=p.dose_phases.length?p.dose_phases[p.dose_phases.length-1].u:(p.unit_am||'mg');
  p.dose_phases.push({w:lastW+4,d:'',u:u});
  wizStepConfig(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}
function wizRemovePhase(pi,phi){
  var p=_wiz.peptides[pi];if(!p||!p.dose_phases)return;
  p.dose_phases.splice(phi,1);
  if(!p.dose_phases.length)delete p.dose_phases;
  wizStepConfig(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}
function wizSetPhase(pi,phi,field,val){
  var p=_wiz.peptides[pi];if(!p||!p.dose_phases||!p.dose_phases[phi])return;
  p.dose_phases[phi][field]=val;
}

// Returns a normalised array of compound objects from any trt shape (new or legacy)
function _trtCompounds(trt){
  if(!trt||!trt.enabled)return [];
  if(trt.compounds&&trt.compounds.length)return trt.compounds;
  if(trt.compound){return [{id:'',name:trt.compound,dot:'var(--accent4)',dose:'',unit:'mg',freqVal:0,freqUnit:'weeks'}];}
  return [];
}
// Resolve TRT compound from a dose ID (handles both new-style id_date and legacy testo_N_date)
function _trtCompoundFromDoseId(id){
  for(var i=0;i<TRT_CAT.length;i++){if(id.startsWith(TRT_CAT[i].id+'_'))return TRT_CAT[i];}
  if(id.startsWith('testo_'))return TRT_CAT.find(function(c){return c.id==='testoviron';})||{name:'Testoviron',dot:'#e05050'};
  if(id.startsWith('nebido_'))return TRT_CAT.find(function(c){return c.id==='nebido';})||{name:'Nebido',dot:'#e8a020'};
  return null;
}
function _isTRTDoseId(id){return !!_trtCompoundFromDoseId(id);}
// Inner tab switcher HTML for stack view / editor
function _stackTabBar(activeTab,setter){
  var tabs=[{k:'peptides',label:'Peptides'},{k:'trt',label:'TRT'}];
  var html='<div style="display:flex;gap:0;border-radius:8px;background:var(--surface2);border:1px solid var(--border);margin-bottom:16px;overflow:hidden;">';
  tabs.forEach(function(t){
    var active=t.k===activeTab;
    html+='<button onclick="'+setter+'(\''+t.k+'\')" style="flex:1;padding:9px;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit;background:'+(active?'var(--accent)':'transparent')+';color:'+(active?'#000':'var(--muted2)')+';">'+t.label+'</button>';
  });
  html+='</div>';
  return html;
}
// TRT tab content for stack view (read-only): compounds + injection log
function _renderTRTViewTab(st){
  var compounds=_trtCompounds(st.trt);
  var html='';
  if(!compounds.length){
    html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">No TRT configured for this stack.</div>';
  }else{
    html+='<div class="wiz-section" style="margin-bottom:10px;">Protocol</div>';
    compounds.forEach(function(c){
      var cat=TRT_CAT.find(function(t){return t.id===c.id;})||{};
      var dot=cat.dot||c.dot||'var(--accent4)';
      html+='<div class="cfg-block" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">';
      html+='<div style="width:8px;height:8px;border-radius:50%;background:'+dot+';flex-shrink:0;"></div>';
      html+='<div style="font-size:13px;font-weight:600;color:var(--text);">'+_esc(c.name)+'</div>';
      html+='<div style="font-size:12px;color:var(--muted2);">'+(c.dose?c.dose+(c.unit||'mg')+' ':'')+(c.freqVal?'every '+c.freqVal+' '+c.freqUnit:'TRT')+'</div>';
      html+='</div>';
    });
  }
  html+='<div class="wiz-section" style="margin-top:16px;margin-bottom:10px;">Injection Log</div>';
  var _effCsLog=(function(){var _ec=_deriveEarliestStartDate(st.peptides);var _sc=st.cycle_start||'';if(_ec&&(!_sc||_ec<_sc))_sc=_ec;if(_sc){var _csp=_sc.split('-');_sc=_csp[0]+'-'+(_csp[1]||'1').padStart(2,'0')+'-'+(_csp[2]||'1').padStart(2,'0');}return _sc;})();
  if(!_effCsLog){
    html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">Set a start date to see the injection log for this stack.</div>';
  }else{
  var _logStart=parseLocalDate(_effCsLog);
  var _logEnd=new Date(_logStart.getTime()+(st.cycle_length||12)*7*86400000);
  var log=window._peptideLog||[];
  var entries=[];
  log.forEach(function(e){
    var trtDoses=(e.doses||[]).filter(function(id){return _isTRTDoseId(id);});
    if(!trtDoses.length)return;
    var dp=e.date.split('-');var dObj=new Date(parseInt(dp[0]),parseInt(dp[1])-1,parseInt(dp[2]));
    if(dObj<_logStart||dObj>_logEnd)return;
    entries.push({date:e.date,doses:trtDoses});
  });
  entries.sort(function(a,b){return b.date.localeCompare(a.date);});
  if(!entries.length){
    html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">No TRT injections logged during this stack.</div>';
  }else{
    entries.forEach(function(e){
      var dp=e.date.split('-');var dObj=new Date(parseInt(dp[0]),parseInt(dp[1])-1,parseInt(dp[2]));
      html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">';
      html+='<div style="font-size:12px;color:var(--muted2);min-width:90px;flex-shrink:0;">'+fmtDate(dObj)+'</div>';
      html+='<div style="flex:1;">';
      e.doses.forEach(function(id){
        var cat=_trtCompoundFromDoseId(id)||{name:id,dot:'#e8a020'};
        html+='<div style="font-size:12px;color:var(--text);display:flex;align-items:center;gap:6px;margin-bottom:2px;">';
        html+='<div style="width:7px;height:7px;border-radius:50%;background:'+(cat.dot||'#e8a020')+';flex-shrink:0;"></div>';
        html+=_esc(cat.name||id);
        html+='</div>';
      });
      html+='</div></div>';
    });
  }
  } // end _effCsLog else
  return html;
}
function setStackViewTab(t){_stackViewTab=t;renderStackEditor();}
function setEditInnerTab(t){_collectEditInputs();_editInnerTab=t;renderStackEditor();}
function _buildEnhancementCycleSection(){
  var c=_cycle;
  var h='<div class="wiz-section" style="margin-top:24px;">Enhancement Cycle</div>';
  if(!c||!c.startDate){
    h+='<div style="background:var(--surface2);border:1px dashed var(--border);border-radius:10px;padding:20px;text-align:center;margin-bottom:16px;">';
    h+='<div style="font-size:13px;color:var(--muted2);margin-bottom:10px;">No enhancement cycle active</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.5;margin-bottom:14px;">Track AAS compounds, bloodwork schedule and E2 management alongside your peptide stack.</div>';
    h+='<button onclick="cycleWizardOpen()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Start Enhancement Cycle</button>';
    h+='</div>';
    return h;
  }
  var startD=parseLocalDate(c.startDate);
  var wksOn=Math.max(0,Math.floor((NOW-startD)/604800000));
  var phases=[['foundational','Foundational'],['synergy','Synergy'],['progression','Progression']];
  var phaseCol={foundational:'var(--accent)',synergy:'var(--accent3)',progression:'var(--accent2)'};
  var curPhase=c.phase||'foundational';
  h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;">';
  h+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted2);margin-bottom:8px;">Phase</div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:10px;">';
  phases.forEach(function(ph){
    var sel=curPhase===ph[0];var col=phaseCol[ph[0]];
    h+='<button onclick="stackSetCyclePhase(\''+ph[0]+'\')" style="flex:1;padding:7px 4px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid '+(sel?col:'var(--border)')+';background:'+(sel?'rgba(255,255,255,0.07)':'transparent')+';color:'+(sel?col:'var(--muted2)')+';">'+ph[1]+'</button>';
  });
  h+='</div>';
  h+='<div style="font-size:12px;color:var(--muted2);">Week '+wksOn+' of '+(c.cycleLengthWeeks||20)+' · Started '+fmtDate(startD)+'</div>';
  h+='</div>';
  var bw=c.bloodwork||[];
  if(bw.length){
    h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;">';
    h+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted2);margin-bottom:10px;">Bloodwork Schedule</div>';
    bw.forEach(function(entry,bi){
      var d=new Date(startD.getTime());d.setDate(d.getDate()+entry.week*7);
      var past=d<NOW;var today=d.toDateString()===NOW.toDateString();
      var dotCol=entry.done?'var(--muted2)':today?'var(--accent)':past?'rgba(255,255,255,0.15)':'var(--accent4)';
      var nameCol=entry.done?'var(--muted2)':today?'var(--accent)':'var(--text)';
      var last=bi===bw.length-1;
      h+='<div style="display:flex;align-items:center;gap:10px;padding:5px 0;'+(last?'':'border-bottom:1px solid var(--border);')+'">';
      h+='<div style="width:8px;height:8px;border-radius:50%;background:'+dotCol+';flex-shrink:0;"></div>';
      h+='<div style="flex:1;font-size:12px;font-weight:600;color:'+nameCol+';">'+(entry.done?'<s>':'')+entry.label+(entry.done?'</s>':'')+(today?' · TODAY':'')+(entry.done?' ✓':'')+'</div>';
      h+='<span style="font-size:11px;color:var(--muted2);white-space:nowrap;">Wk '+entry.week+' — '+fmtDate(d)+'</span>';
      h+='</div>';
    });
    h+='</div>';
  }
  var cmps=c.compounds||[];
  h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;">';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
  h+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted2);">AAS Compounds</div>';
  h+='<button onclick="stackAddAASCompound()" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">+ Add</button>';
  h+='</div>';
  if(!cmps.length){
    h+='<div style="font-size:12px;color:var(--muted2);">No compounds — tap + Add to get started.</div>';
  }else{
    cmps.forEach(function(x,xi){
      var last=xi===cmps.length-1;
      h+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;'+(last?'':'border-bottom:1px solid var(--border);')+'">';
      h+='<div style="flex:1;font-size:13px;font-weight:600;color:var(--text);">'+_esc(x.name)+'</div>';
      h+='<span style="font-size:12px;color:var(--accent);font-weight:700;white-space:nowrap;">'+x.dose+' '+_esc(x.unit)+'</span>';
      h+='<button onclick="stackRemoveAASCompound('+xi+')" style="background:none;border:none;color:var(--muted2);font-size:18px;cursor:pointer;padding:0 0 0 4px;line-height:1;">&#x2715;</button>';
      h+='</div>';
    });
  }
  h+='</div>';
  var hasMast=cmps.some(function(x){return x.name&&x.name.toLowerCase().indexOf('masteron')>=0;});
  var hasPrimo=cmps.some(function(x){return x.name&&(x.name.toLowerCase().indexOf('primobolan')>=0||x.name.toLowerCase().indexOf('primo')>=0);});
  h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;">';
  h+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted2);margin-bottom:8px;">E2 Management</div>';
  if(hasMast){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent3);margin-bottom:4px;">Test + Masteron</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;">Masteron blocks aromatase competitively — pseudo-AI effect. Maintains cardioprotective E2 while reducing water retention.</div>';
  }else if(hasPrimo){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent3);margin-bottom:4px;">Test + Primo</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;">Primobolan (DHT-derived) does not aromatize. Monitor for low-E2 symptoms — joint pain, flat affect, low libido.</div>';
  }else if(cmps.length){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:4px;">Test-only — monitor E2</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;">Target 20-40 pg/mL. Bloat + mood swings = high E2. Flat libido + joint ache = low E2. Adjust compound ratios, not AIs.</div>';
  }else{
    h+='<div style="font-size:12px;color:var(--muted2);">Add compounds above to see E2 strategy.</div>';
  }
  h+='</div>';
  return h;
}
async function stackSetCyclePhase(phase){
  var c=_cycle;if(!c||!c.id)return;
  c.phase=phase;cycleCacheSave(c);renderStackEditor();
  try{await fetch(AGENT_URL+'/cycles/'+c.id,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({phase:phase})});}catch(e){}
}
function stackAddAASCompound(){
  var c=_cycle;if(!c||!c.id){alert('No active enhancement cycle');return;}
  var ins='padding:10px 12px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:14px;width:100%;box-sizing:border-box;font-family:inherit;outline:none;';
  var overlay=document.createElement('div');
  overlay.id='aas-add-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};
  var sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;';
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--accent);">ADD COMPOUND</div><button onclick="document.getElementById(\'aas-add-overlay\').remove()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1;">&#x2715;</button></div>'
    +'<div style="display:grid;gap:10px;">'
    +'<input id="aas-name" type="text" placeholder="Compound name (e.g. Testosterone Enanthate)" style="'+ins+'">'
    +'<div style="display:flex;gap:8px;">'
    +'<input id="aas-dose" type="number" min="0" step="25" placeholder="Dose" style="flex:1;padding:10px 12px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:14px;font-family:inherit;outline:none;">'
    +'<select id="aas-unit" style="flex:1;padding:10px 8px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:13px;font-family:inherit;"><option>mg/week</option><option>mg/day</option><option>mg/EOD</option></select>'
    +'</div>'
    +'<button onclick="stackConfirmAddAAS()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Add Compound</button>'
    +'</div>';
  overlay.appendChild(sheet);document.body.appendChild(overlay);
  var nameIn=document.getElementById('aas-name');if(nameIn)nameIn.focus();
}
async function stackConfirmAddAAS(){
  var c=_cycle;if(!c||!c.id)return;
  var nameEl=document.getElementById('aas-name');
  var doseEl=document.getElementById('aas-dose');
  var unitEl=document.getElementById('aas-unit');
  if(!nameEl)return;
  var name=(nameEl.value||'').trim();
  if(!name){nameEl.style.borderColor='var(--danger)';return;}
  var dose=parseFloat(doseEl?doseEl.value:0)||0;
  var unit=(unitEl?unitEl.value:'')||'mg/week';
  var overlay=document.getElementById('aas-add-overlay');if(overlay)overlay.remove();
  c.compounds=(c.compounds||[]).concat([{name:name,dose:dose,unit:unit,active:true,startWeek:0}]);
  cycleCacheSave(c);renderStackEditor();
  try{await fetch(AGENT_URL+'/cycles/'+c.id,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({compounds:c.compounds})});}catch(e){}
}
async function stackRemoveAASCompound(idx){
  var c=_cycle;if(!c||!c.id)return;
  var name=(c.compounds&&c.compounds[idx])?c.compounds[idx].name:'this compound';
  if(!confirm('Remove '+name+'?'))return;
  c.compounds=(c.compounds||[]).filter(function(_,i){return i!==idx;});
  cycleCacheSave(c);renderStackEditor();
  try{await fetch(AGENT_URL+'/cycles/'+c.id,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({compounds:c.compounds})});}catch(e){}
}
// Generate TRT dose items for a given date from the active stack's TRT config
function _getDynamicTRTDoses(d,withIds){
  var result=[];
  var seenIds={};
  _activeStackIndices.forEach(function(si){
    var st=_userStacks[si];
    if(!st||!st.trt||!st.trt.enabled||!st.cycle_start)return;
    var start=parseLocalDate(st.cycle_start);
    var days=Math.floor((d-start)/86400000);
    if(days<0)return;
    if(st.cycle_length&&days>=st.cycle_length*7)return;
    (st.trt.compounds||[]).forEach(function(c){
      if(c.end_date&&d>parseLocalDate(c.end_date))return;
      var cat=TRT_CAT.find(function(t){return t.id===c.id;});
      var freqDays=c.freqUnit==='weeks'?(c.freqVal||1)*7:(c.freqVal||1);
      if(freqDays<=0||days%freqDays!==0)return;
      var key=c.id+'_'+si;
      if(seenIds[key])return;
      seenIds[key]=true;
      var entry={name:c.name+(c.dose?' '+c.dose+(c.unit||'mg'):''),detail:'TRT injection — IM',time:null,dot:cat?cat.dot:'#e8a020'};
      if(withIds)entry.id=c.id+'_'+si+'_'+dateKey(d);
      result.push(entry);
    });
  });
  return result;
}
function wizStepTRT(body,footer){
  var trt=_wiz.trt;
  if(!trt.compounds)trt.compounds=[];
  var sel=trt.compounds;
  var selIds=sel.map(function(c){return c.id;});
  var hasNebido=selIds.includes('nebido');
  var maxReached=hasNebido?(sel.length>=2):(sel.length>=1);
  var html='<div class="trt-toggle" onclick="wizToggleTRT()"><div class="trt-toggle-label">Add testosterone protocol</div><div class="toggle-sw'+(trt.enabled?' on':'')+'"></div></div>';
  if(trt.enabled){
    if(hasNebido&&sel.length===1){
      html+='<div style="font-size:11px;color:var(--muted2);margin:8px 0 4px;">Nebido selected — you can add one short-acting compound for loading or bridging.</div>';
    }
    TRT_CAT.forEach(function(c){
      var isSel=selIds.includes(c.id);
      var disabled=!isSel&&maxReached;
      html+='<div class="pep-card'+(isSel?' sel':'')+(disabled?' disabled':'')+'" onclick="'+(disabled?'':('wizToggleTRTCompound(\''+c.id+'\')'))+'" style="margin-bottom:8px;'+(disabled?'opacity:0.4;cursor:default;pointer-events:none;':'')+'"><div class="pep-dot-sm" style="background:'+c.dot+'"></div><div class="pep-info"><div class="pep-name">'+c.name+'</div><div class="pep-meta">'+c.sub+'</div></div><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div>';
    });
    if(sel.length){
      html+='<div class="wiz-section" style="margin-top:16px;margin-bottom:8px">Dose & Frequency</div>';
      sel.forEach(function(c){
        var cat=TRT_CAT.find(function(t){return t.id===c.id;});
        var dot=cat?cat.dot:'var(--accent4)';
        html+='<div class="cfg-block" style="margin-bottom:10px;">';
        html+='<div class="cfg-name"><div style="width:9px;height:9px;border-radius:50%;background:'+dot+';flex-shrink:0"></div>'+c.name+'</div>';
        html+='<div class="cfg-row"><div class="cfg-lbl">Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(c.dose||'')+'" oninput="wizSetTRTDose(\''+c.id+'\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetTRTUnit(\''+c.id+'\',this.value)">'+['mg','ml','IU'].map(function(u){return'<option'+(u===(c.unit||'mg')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div></div>';
        html+='<div class="cfg-row"><div class="cfg-lbl">Frequency</div><div class="dose-row"><input class="dose-in" type="number" min="1" value="'+String(c.freqVal||1)+'" oninput="wizSetTRTFreq(\''+c.id+'\',this.value)" style="max-width:70px;"><select class="unit-sel" onchange="wizSetTRTFreqUnit(\''+c.id+'\',this.value)"><option'+(('days'===(c.freqUnit||'weeks'))?' selected':'')+'>days</option><option'+(('weeks'===(c.freqUnit||'weeks'))?' selected':'')+'>weeks</option></select></div></div>';
        html+='</div>';
      });
    }
  }
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
function wizToggleTRT(){_wiz.trt.enabled=!_wiz.trt.enabled;if(!_wiz.trt.compounds)_wiz.trt.compounds=[];wizStepTRT(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));}
function wizToggleTRTCompound(id){
  if(!_wiz.trt.compounds)_wiz.trt.compounds=[];
  var idx=_wiz.trt.compounds.findIndex(function(c){return c.id===id;});
  if(idx!==-1){_wiz.trt.compounds.splice(idx,1);}
  else{var cat=TRT_CAT.find(function(c){return c.id===id;});if(cat)_wiz.trt.compounds.push({id:id,name:cat.name,dose:cat.defaultDose,unit:cat.unit,freqVal:cat.freqVal,freqUnit:cat.freqUnit});}
  wizStepTRT(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}
function wizSetTRTDose(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c)c.dose=v;}
function wizSetTRTUnit(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c)c.unit=v;}
function wizSetTRTFreq(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c)c.freqVal=parseInt(v)||1;}
function wizSetTRTFreqUnit(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c)c.freqUnit=v;}

function wizStepReview(body,footer){
  var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  var hasErrors=checkStack(pepObjs).some(function(i){return i.level==='err';});
  var html='<div class="wiz-section">Stack Name</div><input class="trt-in" type="text" value="'+String(_wiz.stackName||'')+'" oninput="wizSetStackName(this.value)" placeholder="e.g. Cycle 1, Cutting Stack...">';
  html+='<div class="wiz-section" style="margin-top:16px">Summary</div>';
  if(_wiz.peptides.length){_wiz.peptides.forEach(function(p){var dose=p.times&&p.times.includes('AM')&&p.times.includes('PM')?(p.dose_am||'?')+(p.unit_am||'')+'/'+(p.dose_pm||'?')+(p.unit_pm||''):(p.times&&p.times.includes('AM')?(p.dose_am||'?')+(p.unit_am||''):(p.dose_pm||'?')+(p.unit_pm||''));var days=p.days&&p.days.length===7?'Every day':p.days&&p.days.length?p.days.length+'x/week':'?';html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(p.dot||'#888')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+p.name+'</div><div style="font-size:12px;color:var(--muted2)">'+dose+' · '+days+'</div></div>';});}
  else{html+='<div style="color:var(--muted2);font-size:13px;">No peptides selected.</div>';}
  _trtCompounds(_wiz.trt).forEach(function(c){html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(c.dot||'var(--accent4)')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+c.name+'</div><div style="font-size:12px;color:var(--muted2)">'+(c.dose?c.dose+(c.unit||'mg')+' ':'')+(c.freqVal?'every '+c.freqVal+' '+c.freqUnit:'TRT')+'</div></div>';});
  body.innerHTML=html;
  var saveLabel=hasErrors?'Save Anyway (conflicts)':'Save Stack';
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizSave()">'+saveLabel+'</button>';
}

function closeWizard(){if(_wizOverlay){_wizOverlay.classList.remove('open');}}
function wizBack(){
  if(_wiz.step===0){closeWizard();}
  else{_wiz.step--;wizRender();}
}
function wizNext(){_wiz.step=Math.min(6,_wiz.step+1);wizRender();}
function showWizard(editModeUnused){
  // _wiz must already be initialised by createNewStack() or editStackWithCycle()
  if(!_wizOverlay){
    _wizOverlay=document.createElement('div');
    _wizOverlay.className='wiz-overlay';
    _wizOverlay.innerHTML='<div class="wiz-header"><button class="wiz-back" id="wiz-back-btn">&#8249;</button><div class="wiz-title" id="wiz-title">BUILD STACK</div><div class="wiz-progress" id="wiz-progress"></div><button class="wiz-cancel" onclick="closeWizard()">Cancel</button></div><div class="wiz-body" id="wiz-body"></div><div class="wiz-footer" id="wiz-footer"></div>';
    document.body.appendChild(_wizOverlay);
    document.getElementById('wiz-back-btn').onclick=wizBack;
  }
  setTimeout(function(){_wizOverlay.classList.add('open');},10);
  wizRender();
}
