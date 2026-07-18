// ── Cycle length suggestions ───────────────────────────────────────────────
var CYCLE_WEEKS=(function(){var a=[];for(var i=4;i<=240;i+=4)a.push(i);return a;})();
// ── Updated wizard init with cycle_length ──────────────────────────────────
// Default name for a new stack: the next "Cycle N" — one past the highest
// existing "Cycle N" (or the stack count), so new stacks bump 1 → 2 → 3 → 4
// instead of all defaulting to "Cycle 1".
function _nextStackName(){
  var stacks=(typeof _userStacks!=='undefined'&&_userStacks)?_userStacks:[];
  var maxN=0;
  stacks.forEach(function(s){var m=/^Cycle (\d+)$/.exec((s&&s.name)||'');if(m){var n=parseInt(m[1],10);if(n>maxN)maxN=n;}});
  return 'Cycle '+(Math.max(maxN,stacks.length)+1);
}
function initWizard(){
  _wiz={step:0,goals:[],peptides:[],trt:{enabled:false,compounds:[]},enhanced:{enabled:false,compounds:[]},editMode:false,stackIndex:-1,stackName:_nextStackName(),cycle_length:12};
}
function editStackWithCycle(idx){
  if(idx<0||idx>=_userStacks.length)return;
  var st=_userStacks[idx];
  _wiz={
    step:0,
    goals:(function(){var g=st.peptides?st.peptides.map(function(p){var cat=PEPTIDE_CAT.find(function(c){return c.id===p.id;});return cat?cat.goals:[]}).flat().filter(function(v,i,a){return a.indexOf(v)===i;}):[];if(_wizTier()>=3&&st.enhanced&&st.enhanced.compounds&&st.enhanced.compounds.length&&g.indexOf('enhanced')===-1)g.push('enhanced');return g;})(),
    peptides:st.peptides?st.peptides.map(function(p){return JSON.parse(JSON.stringify(p))}):[],
    trt:(_wizTier()>=2&&st.trt)?JSON.parse(JSON.stringify(st.trt)):{enabled:false,compounds:[]},
    enhanced:(_wizTier()>=3&&st.enhanced)?JSON.parse(JSON.stringify(st.enhanced)):{enabled:false,compounds:[]},
    editMode:true,
    stackIndex:idx,
    stackName:st.name||'Stack '+(idx+1),
    cycle_length:st.cycle_length||12
  };
  showWizard(true);
}
function wizSetCycleLength(val){var n=parseInt(val);_wiz.cycle_length=(val==='0'||n===0)?0:(n||12);}
// ── Wizard step 1: Cycle length ────────────────────────────────────────────
var _CYCLE_SELECT_STYLE='background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;margin-bottom:16px;';
function wizStep1(body,footer){
  var html='<div class="wiz-section">Cycle Length</div>';
  html+='<select onchange="wizSetCycleLength(this.value)" style="'+_CYCLE_SELECT_STYLE+'">';
  html+='<option value="0"'+(_wiz.cycle_length===0?' selected':'')+'>No end date</option>';
  CYCLE_WEEKS.forEach(function(w){var mo=w/4;html+='<option value="'+w+'"'+(_wiz.cycle_length===w?' selected':'')+'>'+(mo===1?'1 month':mo+' months')+'</option>';});
  html+='</select>';
  html+='<div style="font-size:11px;color:var(--muted2);">Cycle length helps track when to rotate peptides and manage tapering.</div>';
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
// ── Five independent wizard flows ─────────────────────────────────────────────
// 1. Peps only:          CYCLE GOALS PEPTIDES CHECK CONFIGURE REVIEW
// 2. Peps + TRT:         CYCLE GOALS PEPTIDES CHECK CONFIGURE TRT VALIDATE REVIEW
// 3. TRT only:           CYCLE GOALS TRT REVIEW
// 4. TRT + Enhanced:     CYCLE GOALS TRT ENHANCED VALIDATE REVIEW
// 5. Peps + TRT + Enh:   CYCLE GOALS PEPTIDES CHECK CONFIGURE TRT ENHANCED VALIDATE REVIEW
function _wizTier(){return Math.min(3,Math.max(1,(_userTier||1)));}
function _wizFlow(){
  var g=(_wiz&&_wiz.goals)||[];
  var hasTRT=!!(_wiz&&_wiz.trt&&_wiz.trt.enabled);
  var hasEnhanced=g.includes('enhanced');
  var pepGoals=g.filter(function(x){return x!=='trt'&&x!=='enhanced';});
  // hasPeps: any peptide-goal chip selected, OR nothing at all selected (show-all default)
  var hasPeps=pepGoals.length>0||(!hasTRT&&!hasEnhanced);
  var steps=['cycle','goals'];
  if(hasPeps){steps.push('peptides');steps.push('check');steps.push('configure');}
  if(hasTRT)steps.push('trt');
  if(hasEnhanced)steps.push('enhanced');
  // VALIDATE when combining 2+ tiers so cross-tier conflicts are caught
  var tierCount=[hasPeps,hasTRT,hasEnhanced].filter(Boolean).length;
  if(tierCount>=2)steps.push('validate');
  steps.push('review');
  return steps;
}
var _WIZ_RENDERERS={cycle:function(b,f){wizStep1(b,f);},goals:wizStepGoals,peptides:wizStepPeptides,check:wizStepCheck,configure:wizStepConfig,trt:wizStepTRT,enhanced:wizStepEnhanced,validate:wizStepValidate,review:wizStepReview};
function wizRender(){
  var flow=_wizFlow();
  var idx=Math.min(_wiz.step,flow.length-1);
  _wiz.step=idx;
  var prog='';
  for(var i=0;i<flow.length;i++){
    var cls=i<idx?'done':i===idx?'active':'';
    prog+='<div class="wiz-dot '+cls+'"></div>';
  }
  document.getElementById('wiz-progress').innerHTML=prog;
  document.getElementById('wiz-title').textContent=(_wiz.editMode?'EDIT ':'BUILD ')+flow[idx].toUpperCase();
  var body=document.getElementById('wiz-body');
  var footer=document.getElementById('wiz-footer');
  body.scrollTop=0;
  (_WIZ_RENDERERS[flow[idx]]||wizStepReview)(body,footer);
  body.scrollTop=0;
}
// ── Updated save to include cycle_length ────────────────────────────────────
async function wizSave(){
  var btn=document.querySelector('.wiz-footer .btn.btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  var proto={name:_wiz.stackName,cycle_length:_wiz.cycle_length,peptides:_wiz.peptides,trt:(_wiz.trt&&_wiz.trt.enabled)?_wiz.trt:{},enhanced:((_wiz.goals||[]).includes('enhanced')&&_wiz.enhanced&&_wiz.enhanced.compounds&&_wiz.enhanced.compounds.length)?_wiz.enhanced:{}};
  // Preserve the stable id when editing (proto is rebuilt from the wizard state);
  // assign one for a brand-new stack. Keeps this stack's injections linked.
  if(_wiz.stackIndex>=0&&_wiz.stackIndex<_userStacks.length&&_userStacks[_wiz.stackIndex]&&_userStacks[_wiz.stackIndex].id)proto.id=_userStacks[_wiz.stackIndex].id;
  _ensureStackId(proto);
  if(_wiz.stackIndex>=0&&_wiz.stackIndex<_userStacks.length){
    _userStacks[_wiz.stackIndex]=proto;
  } else {
    _userStacks.push(proto);
    _wiz.stackIndex=_userStacks.length-1; // prevent double-push on retry
    if(_userStacks.length===1)_activeStackIndices=[0];
  }
  _userStacks=_userStacks.slice(0,4);
  // Single-source guard: if this stack now has its own TRT config AND a T-Calc plan
  // is assigned to it, warn and let the user keep one source (may clear proto.trt).
  // Fast-path: only engage when this stack is the current T-Calc target.
  if(typeof _reconcileStackTestoSource==='function'&&typeof _tcp!=='undefined'&&_tcp&&proto&&_tcp.targetStackId===proto.id)await _reconcileStackTestoSource(proto);
  var res=await saveStacksToBackend();
  updateWEEKLY();
  var _savedStack=_wiz.stackIndex>=0?_userStacks[_wiz.stackIndex]:null;
  if(_savedStack&&_savedStack.cycle_start){var _today0=new Date(NOW);_today0.setHours(0,0,0,0);await generateAndPushInjections(_savedStack,_today0);await refreshInjectionsCache();}
  buildWeekStrip();
  buildToday();
  buildSchedule();
  buildStackStore();
  closeWizard();
  switchTab('stacks',document.getElementById('tab-btn-stacks'));
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
// ── Protocol templates (curated starter stacks served from the backend) ────────
function openTemplatePicker(preferGoals){
  var tpl=(typeof _protocolTemplates!=='undefined'&&_protocolTemplates)?_protocolTemplates:[];
  if(!tpl.length){createNewStack();return;}
  var pref=Array.isArray(preferGoals)?preferGoals:[];
  var _tplMatches=function(t){return pref.length&&(t.goals||[]).some(function(g){return pref.indexOf(g)>=0;});};
  if(pref.length)tpl=tpl.slice().sort(function(a,b){return (_tplMatches(b)?1:0)-(_tplMatches(a)?1:0);}); // goal matches first
  var ov=document.createElement('div');ov.id='tpl-picker-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:500;display:flex;align-items:flex-end;justify-content:center';
  ov.onclick=function(e){if(e.target===ov)_closeTemplatePicker();};
  var cards=tpl.map(function(t){
    var comps=[].concat((t.peptides||[]).map(function(p){return {name:p.name,dot:p.dot,dose:(p.dose_am||'')+(p.unit_am?' '+p.unit_am:'')};}),
      ((t.trt&&t.trt.compounds)||[]).map(function(c){return {name:c.name,dot:c.dot,dose:(c.dose||'')+(c.unit?' '+c.unit:'')};}),
      ((t.enhanced&&t.enhanced.compounds)||[]).map(function(c){return {name:c.name,dot:c.dot,dose:(c.dose||'')+(c.unit?' '+c.unit:'')};}));
    var rows=comps.map(function(c){return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0"><span style="width:7px;height:7px;border-radius:50%;background:'+(c.dot||'#888')+';flex-shrink:0"></span><span style="font-size:13px;color:var(--text);flex:1">'+_esc(c.name)+'</span><span style="font-size:12px;color:var(--muted2);font-family:var(--font-mono)">'+_esc(c.dose)+'</span></div>';}).join('');
    var _sug=_tplMatches(t)?'<span style="font-size:9px;font-weight:800;letter-spacing:0.4px;color:#000;background:var(--accent);border-radius:5px;padding:2px 6px;margin-left:8px;vertical-align:middle">SUGGESTED</span>':'';
    return '<div style="border:1px solid '+(_tplMatches(t)?'var(--accent)':'var(--border)')+';border-radius:12px;padding:14px;margin-bottom:12px;background:var(--surface2)">'+
      '<div style="font-family:var(--font-display);font-size:19px;color:var(--text)">'+_esc(t.name)+_sug+'</div>'+
      (t.tagline?'<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent);margin-top:2px">'+_esc(t.tagline)+'</div>':'')+
      (t.description?'<div style="font-size:12px;color:var(--muted2);line-height:1.5;margin:8px 0 10px">'+_esc(t.description)+'</div>':'')+
      rows+
      '<button onclick="useTemplate(\''+_esc(t.id)+'\')" style="margin-top:12px;width:100%;background:var(--accent);color:#000;border:none;border-radius:20px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Use this plan</button>'+
    '</div>';
  }).join('');
  var sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:18px 18px 28px;max-height:85vh;overflow-y:auto';
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div style="font-family:var(--font-display);font-size:22px;color:var(--accent)">Starter protocols</div><button onclick="_closeTemplatePicker()" style="background:none;border:none;color:var(--muted2);font-size:24px;cursor:pointer;line-height:1">&times;</button></div>'+
    '<div style="font-size:12px;color:var(--muted2);line-height:1.5;margin-bottom:14px">Vetted starting points. You can edit doses, timing and the start date any time.</div>'+
    cards+
    '<button onclick="_closeTemplatePicker();createNewStack()" style="width:100%;background:var(--surface2);color:var(--muted2);border:1px solid var(--border);border-radius:20px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:4px">Start from scratch instead</button>';
  ov.appendChild(sheet);document.body.appendChild(ov);
}
function _closeTemplatePicker(){var ov=document.getElementById('tpl-picker-overlay');if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);}
// Instantiate a stack from a template: starts today (so doses schedule immediately),
// activates it, persists to the backend and regenerates injections. Fully editable after.
async function useTemplate(tid){
  var t=((typeof _protocolTemplates!=='undefined'&&_protocolTemplates)||[]).find(function(x){return x.id===tid;});
  if(!t)return;
  if(!Array.isArray(_userStacks))_userStacks=[];
  if(_userStacks.length>=4){alert('You already have 4 stacks — remove one first.');return;}
  var _t0=new Date(NOW);_t0.setHours(0,0,0,0);
  var proto={name:t.name,cycle_length:t.cycle_length||12,cycle_start:dateKey(_t0),
    peptides:(t.peptides||[]).map(function(p){return {id:p.id,name:p.name,dot:p.dot,times:(p.times||['AM']).slice(),days:(p.days||[0,1,2,3,4,5,6]).slice(),dose_am:p.dose_am||'',dose_pm:p.dose_pm||'',unit_am:p.unit_am||'',unit_pm:p.unit_pm||'',active:true};}),
    trt:(t.trt&&t.trt.compounds&&t.trt.compounds.length)?{enabled:true,compounds:t.trt.compounds.map(function(c){return {id:c.id,name:c.name,dot:c.dot,dose:c.dose,unit:c.unit,freqVal:c.freqVal,freqUnit:c.freqUnit,days:(c.days||[1]).slice()};})}:{},
    enhanced:(t.enhanced&&t.enhanced.compounds&&t.enhanced.compounds.length)?{enabled:true,compounds:t.enhanced.compounds.map(function(c){return {id:c.id,name:c.name,dot:c.dot,dose:c.dose,unit:c.unit,days:(c.days||[0,1,2,3,4,5,6]).slice()};})}:{}
  };
  if(typeof _ensureStackId==='function')_ensureStackId(proto);
  _userStacks.push(proto);_userStacks=_userStacks.slice(0,4);
  var _idx=_userStacks.length-1;
  if(!Array.isArray(_activeStackIndices))_activeStackIndices=[];
  if(_activeStackIndices.indexOf(_idx)<0)_activeStackIndices.push(_idx);
  _closeTemplatePicker();
  await saveStacksToBackend();
  if(typeof updateWEEKLY==='function')updateWEEKLY();
  await generateAndPushInjections(proto,_t0);
  if(typeof refreshInjectionsCache==='function')await refreshInjectionsCache();
  if(typeof buildWeekStrip==='function')buildWeekStrip();
  if(typeof buildToday==='function')buildToday();
  if(typeof buildSchedule==='function')buildSchedule();
  if(typeof buildStackStore==='function')buildStackStore();
  if(typeof switchPrimary==='function')switchPrimary('today');
}

function viewStack(idx){_editReadOnly=true;showStackEditor(idx);}
function editStack(idx){_editReadOnly=false;showStackEditor(idx);}
// ── Inline Stack Editor ──────────────────────────────────────────────────────
var _editBuf=null;var _editIdx=-1;var _editReadOnly=false;var _trtLogCache={};
function _esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function showStackEditor(idx){
  if(idx<0||idx>=_userStacks.length)return;
  _editIdx=idx;_editBuf=JSON.parse(JSON.stringify(_userStacks[idx]));
  if(_editBuf.cycle_length==null)_editBuf.cycle_length=12;
  if(!_editBuf.peptides)_editBuf.peptides=[];
  _stackViewTab='peptides';_editInnerTab='peptides';
  renderStackEditor();
}
function _collectEditInputs(){
  if(!_editBuf)return;
  var nameEl=document.getElementById('edit-stack-name');
  if(nameEl)_editBuf.name=nameEl.value;
  var csEl=document.getElementById('edit-cycle-start');if(csEl){if(csEl.value)_editBuf.cycle_start=csEl.value;else delete _editBuf.cycle_start;}
  delete _editBuf.end_date;
  (_editBuf.peptides||[]).forEach(function(p,pi){
    var el;
    if((el=document.getElementById('ed-dam-'+pi)))p.dose_am=el.value;
    if((el=document.getElementById('ed-dpm-'+pi)))p.dose_pm=el.value;
    if((el=document.getElementById('ed-uam-'+pi)))p.unit_am=el.value;
    if((el=document.getElementById('ed-upm-'+pi)))p.unit_pm=el.value;
    if((el=document.getElementById('ed-note-'+pi)))p.note=el.value;
    if((el=document.getElementById('ed-sd-'+pi))){if(el.value)p.start_date=el.value;else delete p.start_date;}
  });
}
function _deriveEarliestStartDate(peptides){
  var dates=(peptides||[]).map(function(p){return p.start_date;}).filter(Boolean);
  if(!dates.length)return null;
  dates.sort();
  return dates[0];
}
function renderStackEditor(){
  var body=document.getElementById('stack-body');if(!body)return;
  var st=_editBuf;var _noEnd=(st.cycle_length===0);var cycle=_noEnd?0:(st.cycle_length||12);
  var isActive=_isActiveStack(_editIdx);
  var _effCs=(function(){var _sc=st.cycle_start||'';if(_sc){var _csp=_sc.split('-');_sc=_csp[0]+'-'+(_csp[1]||'1').padStart(2,'0')+'-'+(_csp[2]||'1').padStart(2,'0');}return _sc;})();
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
      var _dDone2=Math.max(0,Math.floor((NOW-_sd2)/86400000));
      if(_noEnd){
        var _wk2o=Math.floor(_dDone2/7)+1;
        html+='<div style="font-size:13px;color:var(--text);margin-bottom:2px;">'+fmtDate(_sd2)+' → ongoing</div>';
        html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">Week '+_wk2o+' · No end date</div>';
      }else{
        var _ed2=new Date(_sd2.getTime()+cycle*7*86400000);
        var _wk2=Math.min(cycle,Math.floor(_dDone2/7)+1);
        html+='<div style="font-size:13px;color:var(--text);margin-bottom:2px;">'+fmtDate(_sd2)+' → '+fmtDate(_ed2)+'</div>';
        html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">Week '+_wk2+' of '+cycle+' · '+cycle+' wk cycle</div>';
      }
    }else{
      html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">'+(_noEnd?'No end date':''+cycle+' wk cycle')+' · No start date</div>';
    }
    html+=_stackTabBar(_stackViewTab,'setStackViewTab');
    if(_stackViewTab==='trt'){
      html+=_renderTRTViewTab(st);
    }else if(_stackViewTab==='enhanced'){
      html+=(_userTier||1)>=3?_renderEnhancedViewTab(st):_renderEnhancedUpgradeCTA();
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
          if(p.dose_am)doseStr+='AM: '+_esc(_doseLabel(p.id,p.dose_am,p.unit_am||'µg'));
          if(p.dose_pm)doseStr+=(doseStr?' · ':'')+'PM: '+_esc(_doseLabel(p.id,p.dose_pm,p.unit_pm||'µg'));
          if(doseStr)html+='<div style="font-size:12px;color:var(--muted2);padding-left:16px;">'+doseStr+'</div>';
          if(daysStr)html+='<div style="font-size:12px;color:var(--muted2);padding-left:16px;">'+_esc(daysStr)+'</div>';
          if(p.start_date)html+='<div style="font-size:12px;color:var(--muted2);padding-left:16px;">Start: '+_esc(p.start_date)+'</div>';
          html+='</div>';
        });
      }
    }
    html+='<div style="display:flex;gap:10px;margin-top:24px;padding-bottom:40px;">';
    html+='<button onclick="buildStackStore()" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted2);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Close</button>';
    html+='<button onclick="_editReadOnly=false;_editInnerTab=_stackViewTab;renderStackEditor()" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Edit</button>';
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
  var _dateInputStyle='background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text);font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;';
  var _clearBtnStyle='background:none;border:none;color:var(--muted2);font-size:13px;cursor:pointer;font-family:inherit;white-space:nowrap;padding:4px 0;flex-shrink:0;';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
  html+='<input type="date" id="edit-cycle-start" value="'+_esc(_effCs)+'" onchange="_collectEditInputs();renderStackEditor();" style="'+_dateInputStyle+'">';
  if(_effCs)html+='<button onclick="delete _editBuf.cycle_start;delete _editBuf.end_date;renderStackEditor();" style="'+_clearBtnStyle+'">Clear</button>';
  html+='</div>';
  if(_effCs&&!_noEnd&&cycle){var _sd=parseLocalDate(_effCs);var _dDone=Math.max(0,Math.floor((NOW-_sd)/86400000));var _wk=Math.min(cycle,Math.floor(_dDone/7)+1);html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">Week '+_wk+' of '+cycle+'</div>';}else if(_effCs&&_noEnd){var _sd=parseLocalDate(_effCs);var _dDone=Math.max(0,Math.floor((NOW-_sd)/86400000));html+='<div style="font-size:12px;color:var(--muted2);margin-bottom:16px;">Week '+(Math.floor(_dDone/7)+1)+' · ongoing</div>';}else{html+='<div style="margin-bottom:16px;"></div>';}
  html+='<div class="wiz-section">Cycle Length</div>';
  html+='<select onchange="_collectEditInputs();_editBuf.cycle_length=parseInt(this.value);renderStackEditor();" style="'+_CYCLE_SELECT_STYLE+'">';
  html+='<option value="0"'+(_noEnd?' selected':'')+'>No end date</option>';
  CYCLE_WEEKS.forEach(function(w){var mo=w/4;html+='<option value="'+w+'"'+(cycle===w?' selected':'')+'>'+(mo===1?'1 month':mo+' months')+'</option>';});
  html+='</select>';
  html+=_stackTabBar(_editInnerTab,'setEditInnerTab');
  if(_editInnerTab==='trt'){
    html+=_renderEditTRT(st.trt);
  }else if(_editInnerTab==='enhanced'){
    html+=(_userTier||1)>=3?_renderEditEnhanced(_editBuf.enhanced||{enabled:false,compounds:[]}):_renderEnhancedUpgradeCTA();
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
  var eff=_effectiveDose(p,_editBuf.cycle_start);
  var dispAmDose=eff?String(eff.dose):(p.dose_am||'');
  var dispPmDose=eff?String(eff.dose):(p.dose_pm||'');
  var dispAmUnit=_canonUnit(eff?eff.unit:(p.unit_am||'mg'));
  var dispPmUnit=_canonUnit(eff?eff.unit:(p.unit_pm||'mg'));
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
    html+='<input id="ed-dam-'+pi+'" class="dose-in" type="text" value="'+_esc(dispAmDose)+'" oninput="_editBuf.peptides['+pi+'].dose_am=this.value" placeholder="0">';
    html+='<select id="ed-uam-'+pi+'" class="unit-sel" onchange="_editBuf.peptides['+pi+'].unit_am=this.value">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===dispAmUnit?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select>';
    html+='</div></div>';
  }
  if(p.times&&p.times.includes('PM')){
    html+='<div class="cfg-row"><div class="cfg-lbl">PM Dose</div><div class="dose-row">';
    html+='<input id="ed-dpm-'+pi+'" class="dose-in" type="text" value="'+_esc(dispPmDose)+'" oninput="_editBuf.peptides['+pi+'].dose_pm=this.value" placeholder="0">';
    html+='<select id="ed-upm-'+pi+'" class="unit-sel" onchange="_editBuf.peptides['+pi+'].unit_pm=this.value">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===dispPmUnit?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select>';
    html+='</div></div>';
  }
  html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">';
  DAYS_ORDER.forEach(function(di){var d=DAYS_SHORT[di];html+='<div class="day-chip'+(p.days&&p.days.includes(di)?' sel':'')+'" onclick="editToggleDay(this,'+pi+','+di+')">'+d+'</div>';});
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
function editToggleTRTCompound(id){if(!_editBuf.trt)_editBuf.trt={enabled:true,compounds:[]};if(!_editBuf.trt.compounds)_editBuf.trt.compounds=[];var idx=_editBuf.trt.compounds.findIndex(function(c){return c.id===id;});if(idx!==-1){_editBuf.trt.compounds.splice(idx,1);}else{var cat=TRT_CAT.find(function(c){return c.id===id;});if(cat)_editBuf.trt.compounds.push({id:id,name:cat.name,dose:cat.defaultDose||'',unit:cat.unit||'mg',freqVal:cat.freqVal||1,freqUnit:cat.freqUnit||'weeks',days:cat.id==='nebido'?undefined:(cat.defaultDays?cat.defaultDays.slice():[1])});}_collectEditInputs();renderStackEditor();}
function _renderEditTRT(trt){if(!trt)trt={};var enabled=!!trt.enabled;var selIds=(trt.compounds||[]).map(function(c){return c.id;});var html='<div class="wiz-section" style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;"><span>TRT Protocol</span><div onclick="editToggleTRT()" style="cursor:pointer;"><div class="toggle-sw'+(enabled?' on':'')+'"></div></div></div>';html+=(typeof _renderTcalcTrtCard==='function'?_renderTcalcTrtCard():'');html+=(typeof _bfReadinessCard==='function'?_bfReadinessCard('trt'):'');if(enabled){TRT_CAT.forEach(function(c){var isSel=selIds.includes(c.id);var disabled=!isSel&&selIds.length>=2;var selData=isSel?(trt.compounds||[]).find(function(s){return s.id===c.id;}):null;html+='<div class="pep-card'+(isSel?' sel':'')+(disabled?' disabled':'')+'" onclick="'+(disabled?'':('editToggleTRTCompound(\''+c.id+'\')'))+'" style="margin-bottom:'+(isSel?'0':'6px')+';'+(isSel?'border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-color:transparent;':'')+(disabled?'opacity:0.4;cursor:default;pointer-events:none;':'')+'"><div class="pep-dot-sm" style="background:'+c.dot+'"></div><div class="pep-info"><div class="pep-name">'+c.name+'</div><div class="pep-meta">'+c.sub+'</div></div><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div>';if(isSel&&selData){var doseNum=parseDec(selData.dose)||0;var weeklyDoseMg;if(c.id!=='nebido'&&selData.days&&selData.days.length){weeklyDoseMg=doseNum*selData.days.length;}else{var freqDays=((selData.freqUnit||'weeks')==='weeks'?(selData.freqVal||1)*7:(selData.freqVal||1));weeklyDoseMg=freqDays>0?doseNum*7/freqDays:0;}html+='<div style="border:1px solid var(--accent);border-top:none;border-radius:0 0 10px 10px;padding:12px 14px;margin-bottom:8px;background:rgba(232,255,60,0.015);">';html+='<div class="cfg-row"><div class="cfg-lbl">Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+_esc(String(selData.dose||''))+'" oninput="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(x){return x.id===\''+c.id+'\'});if(cc)cc.dose=x;})(this.value)" placeholder="0"><select class="unit-sel" onchange="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(y){return y.id===\''+c.id+'\'});if(cc)cc.unit=x;})(this.value)">'+['mg','ml','IU','%'].map(function(u){return'<option'+(u===(selData.unit||'mg')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div></div>';if(c.id!=='nebido'){html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">'+DAYS_ORDER.map(function(di){var lbl=DAYS_SHORT[di];return'<div class="day-chip'+((selData.days||[]).includes(di)?' sel':'')+'" onclick="editSetTRTDays(\''+c.id+'\','+di+')">'+lbl+'</div>';}).join('')+'</div></div>';}else{html+='<div class="cfg-row" style="margin-bottom:0"><div class="cfg-lbl">Frequency</div><div class="dose-row"><input class="dose-in" type="number" min="1" value="'+String(selData.freqVal||1)+'" oninput="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(y){return y.id===\''+c.id+'\'});if(cc){cc.freqVal=parseInt(x)||1;_refreshTRTGuide(\''+c.id+'\',cc.freqVal,cc.freqUnit,cc.dose);}})(this.value)" style="max-width:70px;"><select class="unit-sel" onchange="(function(x){var cc=(_editBuf.trt.compounds||[]).find(function(y){return y.id===\''+c.id+'\'});if(cc){cc.freqUnit=x;_refreshTRTGuide(\''+c.id+'\',cc.freqVal,cc.freqUnit,cc.dose);}})(this.value)"><option'+('days'===(selData.freqUnit||'weeks')?' selected':'')+'>days</option><option'+('weeks'===(selData.freqUnit||'weeks')?' selected':'')+'>weeks</option></select></div></div>';}html+='<div class="cfg-row"><div class="cfg-lbl">Time</div><div class="time-chips">'+['AM','PM'].map(function(tm){return '<div class="time-chip'+(((selData.time||'AM')===tm)?' sel':'')+'" onclick="editSetTRTTime(\''+c.id+'\',\''+tm+'\')">'+tm+'</div>';}).join('')+'</div></div>';html+='<div id="trt-guide-'+c.id+'">'+_renderTRTGuide(c.id,weeklyDoseMg)+'</div>';html+='</div>';}})}return html;}
function editSetTRTTime(id,tm){var c=((_editBuf.trt&&_editBuf.trt.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;c.time=(tm==='PM'?'PM':'AM');_collectEditInputs();renderStackEditor();}
function editAddPeptide(){
  var currentIds=(_editBuf.peptides||[]).map(function(p){return p.id;});
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick=function(e){if(e.target===overlay)document.body.removeChild(overlay);};
  var sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;max-height:75vh;overflow-y:auto;';
  var groups={};PEPTIDE_CAT.forEach(function(cat){if(!groups[cat.group])groups[cat.group]=[];groups[cat.group].push(cat);});
  var html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html+='<div style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--accent);">ADD PEPTIDE</div>';
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
  // If the user changed a dose away from the active ramp value, cancel the ramp
  (_editBuf.peptides||[]).forEach(function(p){
    if(!p.dose_phases||!p.dose_phases.length)return;
    var eff=_effectiveDose(p,_editBuf.cycle_start);
    if(!eff)return;
    var amChg=p.times&&p.times.includes('AM')&&String(p.dose_am||'')!==String(eff.dose);
    var pmChg=p.times&&p.times.includes('PM')&&String(p.dose_pm||'')!==String(eff.dose);
    if(amChg||pmChg)delete p.dose_phases;
  });
  var _oldProtoCids=_getProtocolCompoundIds(_userStacks[_editIdx]||{});
  _userStacks[_editIdx]=_editBuf;
  // Single-source guard: if this stack now has its own TRT config AND a T-Calc plan
  // is assigned to it, warn and let the user keep one source (may clear _editBuf.trt).
  // Fast-path: only engage when this stack is the current T-Calc target.
  if(typeof _reconcileStackTestoSource==='function'&&typeof _tcp!=='undefined'&&_tcp&&_editBuf&&_tcp.targetStackId===_editBuf.id)await _reconcileStackTestoSource(_editBuf);
  updateWEEKLY();
  await saveStacksToBackend();
  if(_editBuf&&_editBuf.cycle_start){
    var _editToday0=new Date(NOW);_editToday0.setHours(0,0,0,0);
    var _newProtoCids=_getProtocolCompoundIds(_editBuf);
    var _cycId=_stackCycleId(_editBuf);
    for(var _pi=0;_pi<_oldProtoCids.length;_pi++){
      if(!_newProtoCids.includes(_oldProtoCids[_pi])){
        try{await fetch(AGENT_URL+'/injections?cycle_id='+encodeURIComponent(_cycId)+'&compound_id='+encodeURIComponent(_oldProtoCids[_pi])+'&from='+dateKey(_editToday0),{method:'DELETE',headers:authHeaders()});}catch(e){_logErr('delOrphanInj',e);}
      }
    }
    _trtLogCache={};
    await generateAndPushInjections(_editBuf,_editToday0);
    await refreshInjectionsCache();
  }
  buildWeekStrip();buildToday();buildSchedule();
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
    html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(c.dot||'var(--accent4)')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+c.name+'</div><div style="font-size:12px;color:var(--muted2)">'+(c.dose?c.dose+(c.unit||'mg')+' ':'')+(c.days&&c.days.length?c.days.map(function(d){return DAYS_SHORT[d];}).join('/'):(c.freqVal?'every '+c.freqVal+' '+c.freqUnit:'TRT'))+'</div></div>';
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
    var dm=rawPart.match(/^([\d.]+)\s*(mg|mcg|µg|IU|ml)?$/);
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
    window._wizCheckSheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--accent)">STACK CHECK</div><button onclick="this.closest(\'[style*=fixed]\').remove();window._wizCheckSheet=null;" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer">×</button></div>'+renderCheckResults(pepObjs,'wizpopup');
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
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--accent)">STACK CHECK</div><button onclick="document.body.removeChild(this.closest(\'[style*=fixed]\'))" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer">×</button></div>'+renderCheckResults(pepObjs);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}
// ── Peptide info card (pokemon style) ────────────────────────────────────────
function showPeptideCard(id){
  var cat=PEPTIDE_CAT.find(function(c){return c.id===id;});if(!cat)return;
  var dot=cat.dot||'#888';
  var GOAL_ICONS={muscle:'💪',recovery:'🩹',skin:'✨',fat:'🔥',cognitive:'🧠',antiaging:'⏳',trt:'⚡',enhanced:'💉'};
  var goalsHtml=(cat.goals||[]).map(function(g){return'<span class="pcard-goal" style="background:'+dot+'20;border-color:'+dot+'44;color:'+dot+'">'+(GOAL_ICONS[g]||'')+' '+(g.charAt(0).toUpperCase()+g.slice(1))+'</span>';}).join('');
  var userPep=_userProtocol&&_userProtocol.peptides?_userProtocol.peptides.find(function(p){return p.id===id;}):null;
  var myDoseHtml='';
  if(userPep){
    var parts=[];if(userPep.dose_am)parts.push('AM: '+_doseLabel(userPep.id,userPep.dose_am,userPep.unit_am||'µg'));if(userPep.dose_pm)parts.push('PM: '+_doseLabel(userPep.id,userPep.dose_pm,userPep.unit_pm||'µg'));
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
    '<div style="margin-bottom:14px;">'
    +'<div class="pcard-name" style="color:'+dot+'">'+cat.name+'</div>'
    +'<div style="font-size:11px;font-weight:600;color:var(--muted2);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">'+cat.group+'</div>'
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
    +'</div>'
    +'<div style="position:sticky;bottom:0;background:var(--surface);padding:16px 0 28px;margin-top:20px;">'
    +'<button onclick="this.closest(\'.pcard-overlay\').remove()" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);font-size:14px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;letter-spacing:0.5px;">Done</button>'
    +'</div>';
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}
function showEnhancedCard(id){
  var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(c){return c.id===id;});if(!cat)return;
  var dot=cat.dot||'#a855f7';
  var userComp=null;
  (_activeStackIndices||[]).forEach(function(si){var st=_userStacks[si];if(!st||!st.enhanced)return;var f=(st.enhanced.compounds||[]).find(function(c){return c.id===id;});if(f&&!userComp)userComp=f;});
  var myDoseHtml='';var activeDose=0;
  if(userComp){
    var parts=[];
    var eCat=(ENHANCEMENT_COMPOUNDS||[]).find(function(ec){return ec.id===id;});
    var isAmPm=userComp.amPm||(eCat&&eCat.amPm);
    activeDose=isAmPm?(parseDec(userComp.dose_am||0)+parseDec(userComp.dose_pm||0)):parseDec(userComp.dose||0);
    if(isAmPm){if(userComp.dose_am)parts.push('AM: '+userComp.dose_am+' '+(userComp.unit?(userComp.unit.split('/')[0]):''));if(userComp.dose_pm)parts.push('PM: '+userComp.dose_pm+' '+(userComp.unit?(userComp.unit.split('/')[0]):''));}
    else if(userComp.dose)parts.push(userComp.dose+(userComp.unit?' '+userComp.unit:''));
    if(parts.length)myDoseHtml='<div style="background:'+dot+'15;border:1px solid '+dot+'30;border-radius:10px;padding:10px 14px;margin-bottom:12px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:'+dot+';margin-bottom:3px;">Your dose</div><div style="font-size:13px;color:var(--text);">'+parts.join(' · ')+'</div></div>';
  }
  var overlay=document.createElement('div');overlay.className='pcard-overlay';overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};
  var sheet=document.createElement('div');sheet.className='pcard-sheet';
  sheet.innerHTML='<div style="margin-bottom:14px;"><div class="pcard-name" style="color:'+dot+'">'+(cat.name||id)+'</div><div style="font-size:11px;font-weight:600;color:var(--muted2);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">'+(cat.group||'')+'</div></div>'+myDoseHtml+_renderEnhancedGuide(cat,activeDose)+'<div style="position:sticky;bottom:0;background:var(--surface);padding:16px 0 28px;margin-top:20px;"><button onclick="this.closest(\'.pcard-overlay\').remove()" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);font-size:14px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;letter-spacing:0.5px;">Done</button></div>';
  overlay.appendChild(sheet);document.body.appendChild(overlay);
}
// ── Wizard ────────────────────────────────────────────────────────────────────
var GOAL_DEFS=[{id:'muscle',label:'Muscle & Recovery',icon:'💪'},{id:'recovery',label:'Injury & Healing',icon:'🩹'},{id:'skin',label:'Skin & Anti-aging',icon:'✨'},{id:'fat',label:'Fat Loss',icon:'🔥'},{id:'cognitive',label:'Cognitive',icon:'🧠'},{id:'antiaging',label:'Longevity',icon:'⏳'},{id:'enhanced',label:'Enhanced Cycle',icon:'💉'}];
var UNITS=['mg','µg','IU','ml','%'];var UNIT_LABELS={mcg:'µg'};
var DAYS_SHORT=['S','M','T','W','T','F','S'];
var DAYS_ORDER=[1,2,3,4,5,6,0]; // display order: Mon first (Sun last)

function wizStepGoals(body,footer){
  var PEPTIDE_GOALS=[{id:'muscle',label:'Muscle & Recovery',icon:'💪'},{id:'recovery',label:'Injury & Healing',icon:'🩹'},{id:'skin',label:'Skin & Anti-aging',icon:'✨'},{id:'fat',label:'Fat Loss',icon:'🔥'},{id:'cognitive',label:'Cognitive',icon:'🧠'},{id:'antiaging',label:'Longevity',icon:'⏳'}];
  var trtOn=_wiz.trt.enabled;
  var enhOn=_wiz.goals.includes('enhanced');
  var html='<div class="wiz-section">Peptide Goals</div><div class="goal-grid">';
  PEPTIDE_GOALS.forEach(function(g){
    var sel=_wiz.goals.includes(g.id)?'sel':'';
    html+='<div class="goal-chip '+sel+'" onclick="wizToggleGoal(\''+g.id+'\')">'+g.icon+' '+g.label+'</div>';
  });
  html+='</div><div style="font-size:12px;color:var(--muted2);margin-top:8px;margin-bottom:16px;">Select all that apply — filters the peptide catalogue.</div>';
  if(_wizTier()>=2){
    html+='<div class="wiz-section">TRT</div>';
    if(enhOn){
      html+='<div class="trt-toggle" style="opacity:0.4;pointer-events:none"><div class="trt-toggle-label">⚡ Testosterone protocol</div><div class="toggle-sw"></div></div>';
      html+='<div style="font-size:12px;color:var(--muted2);margin-top:6px;margin-bottom:16px;">Not available — Testosterone is already included in the Enhanced cycle.</div>';
    }else{
      html+='<div class="trt-toggle" onclick="wizToggleGoalTRT()"><div class="trt-toggle-label">⚡ Testosterone protocol</div><div class="toggle-sw'+(trtOn?' on':'')+'"></div></div>';
      html+='<div style="font-size:12px;color:var(--muted2);margin-top:6px;margin-bottom:16px;">'+(trtOn?'Compound, dose &amp; schedule configured in the next step.':'Add Testoviron, Nebido or another ester to your cycle.')+'</div>';
    }
  }
  if(_wizTier()>=3){
    html+='<div class="wiz-section">Enhanced Cycle</div>';
    if(trtOn){
      html+='<div class="trt-toggle" style="opacity:0.4;pointer-events:none"><div class="trt-toggle-label">💉 Steroids &amp; prescription compounds</div><div class="toggle-sw"></div></div>';
      html+='<div style="font-size:12px;color:var(--muted2);margin-top:6px;margin-bottom:16px;">Not available — disable the TRT protocol above first.</div>';
    }else{
      html+='<div class="trt-toggle" onclick="wizToggleGoal(\'enhanced\')"><div class="trt-toggle-label">💉 Steroids &amp; prescription compounds</div><div class="toggle-sw'+(enhOn?' on':'')+'"></div></div>';
      html+='<div style="font-size:12px;color:var(--muted2);margin-top:6px;margin-bottom:16px;">Select and configure enhancement compounds in the next wizard step.</div>';
    }
  }
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
function wizToggleGoalTRT(){
  if(_wizTier()<2)return;
  _wiz.trt.enabled=!_wiz.trt.enabled;
  if(!_wiz.trt.compounds)_wiz.trt.compounds=[];
  var i=_wiz.goals.indexOf('trt');
  if(_wiz.trt.enabled){
    if(i===-1)_wiz.goals.push('trt');
    var eIdx=_wiz.goals.indexOf('enhanced');
    if(eIdx!==-1)_wiz.goals.splice(eIdx,1);
    if(_wiz.enhanced){_wiz.enhanced.enabled=false;_wiz.enhanced.compounds=[];_wiz.enhanced._prefilled=false;}
  }else{_wiz.trt.compounds=[];if(i!==-1)_wiz.goals.splice(i,1);}
  wizStepGoals(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}

function wizToggleGoal(id){
  var i=_wiz.goals.indexOf(id);
  if(i===-1){
    _wiz.goals.push(id);
    if(id==='trt'){_wiz.trt.enabled=true;if(!_wiz.trt.compounds)_wiz.trt.compounds=[];}
    if(id==='enhanced'){
      var tIdx=_wiz.goals.indexOf('trt');
      if(tIdx!==-1)_wiz.goals.splice(tIdx,1);
      _wiz.trt.enabled=false;_wiz.trt.compounds=[];
    }
  } else {
    _wiz.goals.splice(i,1);
    if(id==='trt'){_wiz.trt.enabled=false;_wiz.trt.compounds=[];}
    if(id==='enhanced'){if(_wiz.enhanced){_wiz.enhanced.enabled=false;_wiz.enhanced.compounds=[];_wiz.enhanced._prefilled=false;}}
  }
  wizStepGoals(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}

function wizStepPeptides(body,footer){
  var filtered=PEPTIDE_CAT.filter(function(p){return !p.goals.every(function(g){return g==='trt';})&&p.group!=='Enhanced';});
  if(_wiz.goals.length){filtered=filtered.filter(function(p){return p.goals.some(function(g){return _wiz.goals.includes(g);});});}
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
      html+='<div class="pep-card'+(isSel?' sel':'')+'" onclick="wizTogglePep(\''+p.id+'\')"><div class="pep-dot-sm" style="background:'+p.dot+'"></div><div class="pep-info"><div class="pep-name">'+p.name+'</div><div class="pep-meta">'+p.desc+'</div></div><div style="display:flex;align-items:center;gap:10px"><button class="info-btn" onclick="event.stopPropagation();showPeptideCard(\''+p.id+'\')">ℹ</button><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div></div>';
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
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--accent)">STACK CHECK</div><button onclick="this.closest(\'[style*=fixed]\').remove();window._wizCheckSheet=null;" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer">×</button></div>'+renderCheckResults(pepObjs,'wizpopup');
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
// Contextual safety note for a compound tier (peptide / trt / enhanced) — a short,
// dismissible watch/test/stop card shown in every tier's dose-guidance view.
// Un-gated: safety always surfaces. Content is served from the backend.
function _renderSafetyNote(tier){
  if(typeof _safetyDismissed!=='undefined'&&_safetyDismissed[tier])return '';
  var n=(typeof _safetyNotes!=='undefined'&&_safetyNotes)?_safetyNotes[tier]:null;
  if(!n)return '';
  return '<div data-safety="'+tier+'" style="margin-top:8px;background:rgba(255,176,60,0.06);border:1px solid rgba(255,176,60,0.25);border-radius:8px;padding:9px 11px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px"><span style="display:flex;align-items:center;gap:6px"><span style="font-size:12px">⚠️</span><span style="font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--warning)">Safety'+(n.label?' — '+_esc(n.label):'')+'</span></span>'+
    '<button onclick="dismissSafety(\''+tier+'\',this)" style="background:none;border:none;color:var(--muted2);font-size:15px;line-height:1;cursor:pointer;padding:0 2px">&times;</button></div>'+
    '<div style="font-size:11px;color:var(--text);line-height:1.5">'+
      (n.watch?'<div><b style="color:var(--muted2)">Watch:</b> '+_esc(n.watch)+'</div>':'')+
      (n.test?'<div style="margin-top:2px"><b style="color:var(--muted2)">Test:</b> '+_esc(n.test)+'</div>':'')+
      (n.stop?'<div style="margin-top:2px"><b style="color:var(--muted2)">Stop:</b> '+_esc(n.stop)+'</div>':'')+
    '</div></div>';
}
function dismissSafety(tier,el){if(typeof _safetyDismissed!=='undefined')_safetyDismissed[tier]=1;var c=(el&&el.closest)?el.closest('[data-safety]'):null;if(c&&c.parentNode)c.parentNode.removeChild(c);}
function _renderDoseGuide(pepId,currentDose){
  var tiers=DOSE_GUIDE&&DOSE_GUIDE[pepId];
  if(!tiers||!tiers.length)return'';
  var dose=typeof currentDose==='number'&&!isNaN(currentDose)?currentDose:0;
  var activeTierIdx=-1;
  if(dose>0){
    for(var ti=0;ti<tiers.length;ti++){
      var t=tiers[ti];
      if(typeof t.lo==='number'){
        if(dose>=t.lo&&(typeof t.hi!=='number'||dose<t.hi)){activeTierIdx=ti;break;}
      }
    }
  }
  var rows=tiers.map(function(t,i){
    var isActive=activeTierIdx!==-1?(i===activeTierIdx):!!t.b;
    var bg=isActive?'background:rgba(var(--accent-rgb,60,255,160),0.08);border:1px solid rgba(var(--accent-rgb,60,255,160),0.3);':'background:var(--surface2);border:1px solid var(--border);';
    var doseHtml=t.d?('<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">'+t.d+'</span>'):'';
    var note=t.n?('<span style="font-size:11px;color:var(--muted2);flex:1">'+t.n+'</span>'):'';
    var risk=t.r?('<div style="font-size:11px;color:#f59e0b;padding:2px 0 0 0">⚠ '+t.r+'</div>'):'';
    return'<div style="'+bg+'border-radius:6px;padding:5px 8px;margin-bottom:3px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:10px;font-weight:700;color:'+(isActive?'var(--accent)':'var(--muted2)')+';text-transform:uppercase;min-width:62px">'+t.l+'</span>'+doseHtml+'</div>'+note+risk+'</div>';
  });
  var profile=_userProfile();
  var hasProfile=profile.age>0||profile.weight_kg>0;
  var mods=_dosePersonalization(pepId,profile);
  var modHtml='';
  if(mods.length){var colorMap={adj:'#3b9eff',ok:'#3cffa0',warn:'#f59e0b',info:'#c084fc'};modHtml='<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:6px">'+mods.map(function(m){var c=colorMap[m.type]||'#3b9eff';return'<div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:4px"><span style="color:'+c+';font-size:12px;line-height:1.4;margin-top:1px">●</span><span style="font-size:11px;color:var(--text);line-height:1.4">'+m.text+'</span></div>';}).join('')+'</div>';}else if(!hasProfile){modHtml='<div style="margin-top:6px;font-size:11px;color:var(--muted2);font-style:italic">Add age & weight in Body tab for personalized dosing</div>';}
  return'<div class="cfg-row" style="display:block"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px">Recommended Doses</div>'+rows.join('')+modHtml+'</div>'+_renderSafetyNote('peptide');
}
function _renderRampSection(p,pi){
  var hasRamp=!!(p.dose_phases&&p.dose_phases.length);
  var btn='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:'+(hasRamp?'8px':'0')+'"><span style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase">Dose Escalation</span><div onclick="wizToggleRamp('+pi+')" style="cursor:pointer"><div class="toggle-sw'+(hasRamp?' on':'')+'"></div></div></div>';
  if(!hasRamp)return'<div class="cfg-row" style="display:block">'+btn+'</div>';
  var phases=(p.dose_phases||[]).slice().sort(function(a,b){return a.w-b.w;});
  var rows=phases.map(function(ph,phi){
    var uOpts=UNITS.map(function(u){return'<option value="'+u+'"'+(u===_canonUnit(ph.u||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('');
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
    if(p.times&&p.times.includes('AM')){html+='<div class="cfg-row"><div class="cfg-lbl">AM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(p.dose_am||'')+'" oninput="wizSetDose('+pi+',\'am\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetUnit('+pi+',\'am\',this.value)">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===_canonUnit(p.unit_am||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select></div></div>';}
    if(p.times&&p.times.includes('PM')){html+='<div class="cfg-row"><div class="cfg-lbl">PM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(p.dose_pm||'')+'" oninput="wizSetDose('+pi+',\'pm\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetUnit('+pi+',\'pm\',this.value)">'+UNITS.map(function(u){return'<option value="'+u+'"'+(u===_canonUnit(p.unit_pm||'mg')?' selected':'')+'>'+(UNIT_LABELS[u]||u)+'</option>';}).join('')+'</select></div></div>';}
    html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">';
    DAYS_ORDER.forEach(function(di){var d=DAYS_SHORT[di];html+='<div class="day-chip'+(p.days&&p.days.includes(di)?' sel':'')+'" onclick="wizToggleDay('+pi+','+di+')">'+d+'</div>';});
    html+='</div></div><div class="cfg-row"><div class="cfg-lbl">Note (optional)</div><input class="note-in" type="text" value="'+String(p.note||'')+'" oninput="wizSetNote('+pi+',this.value)" placeholder="e.g. fasted, pre-sleep..."></div>';
    html+=_renderDoseGuide(p.id,parseDec(p.dose_am||p.dose_pm||0)||0);
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
  var t3=(_userTier||1)>=3;
  var tabs=[{k:'peptides',label:'Peptides'},{k:'trt',label:'TRT'},{k:'enhanced',label:'Enhanced',locked:!t3}];
  var html='<div style="display:flex;gap:0;border-radius:8px;background:var(--surface2);border:1px solid var(--border);margin-bottom:16px;overflow:hidden;">';
  tabs.forEach(function(t){
    var active=t.k===activeTab;
    var bg=active&&!t.locked?'var(--accent)':'transparent';
    var color=active&&!t.locked?'#000':'var(--muted2)';
    var opacity=t.locked?'0.45':'1';
    html+='<button onclick="'+setter+'(\''+t.k+'\')" style="flex:1;padding:9px;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit;background:'+bg+';color:'+color+';opacity:'+opacity+';">'+t.label+'</button>';
  });
  html+='</div>';
  return html;
}
function _renderEnhancedUpgradeCTA(){
  return '<div style="text-align:center;padding:32px 16px;">'
    +'<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;">Enhanced Tier</div>'
    +'<div style="font-size:13px;color:var(--muted2);line-height:1.6;margin-bottom:20px;">Track AAS compounds, bloodwork schedule and E2 management alongside your peptide stack.</div>'
    +'<button onclick="document.getElementById(\'tab-btn-settings\').click()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:11px 24px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Enable in Settings</button>'
    +'</div>';
}
// Testosterone can be planned two ways: as a configured TRT compound on the
// stack, OR in the T-Calc planner (which pushes dated injections to the schedule
// with cycle_id 'tcalc'). Summarise any T-Calc-planned testosterone so the TRT
// tab can surface it even when no TRT compound is configured on the stack.
function _tcalcTrtSummary(){
  if(typeof _injectionsCache==='undefined'||!_injectionsCache) return null;
  var today=(typeof dateKey==='function')?dateKey(NOW):'';
  var byComp={};
  Object.keys(_injectionsCache).forEach(function(dk){
    (_injectionsCache[dk]||[]).forEach(function(e){
      if(!e||e.cycle_id!=='tcalc') return;
      if(e.tier&&e.tier!=='trt') return;
      var cid=e.compound_id||e.compound_name||'testosterone';
      var c=byComp[cid]||(byComp[cid]={name:e.compound_name||cid,dot:e.dot||'#e8a020',unit:e.unit||'mg',count:0,next:null,nextDose:''});
      c.count++;
      if(e.date>=today&&(!c.next||e.date<c.next)){ c.next=e.date; c.nextDose=e.dose; }
    });
  });
  var comps=Object.keys(byComp).map(function(k){return byComp[k];});
  return comps.length?comps:null;
}
// Info card for the TRT tab that mirrors the T-Calc-planned testosterone and
// deep-links to the T-Calc tab. Returns '' when nothing is planned there.
function _renderTcalcTrtCard(){
  var comps=(typeof _tcalcTrtSummary==='function')?_tcalcTrtSummary():null;
  if(!comps) return '';
  var rows=comps.map(function(c){
    var nextTxt=c.next?('Next '+fmtDate(new Date(c.next.replace(/-/g,'/')))):'No upcoming doses';
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      +'<div style="width:8px;height:8px;border-radius:50%;background:'+(c.dot||'#e8a020')+';flex-shrink:0"></div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--text)">'+_esc(c.name)+'</div>'
      +(c.nextDose?'<div style="font-size:12px;color:var(--muted2)">'+_esc(c.nextDose)+' '+_esc(c.unit||'mg')+'</div>':'')
      +'<div style="font-size:11px;color:var(--muted2);margin-left:auto">'+_esc(nextTxt)+'</div>'
      +'</div>';
  }).join('');
  return '<div onclick="var b=document.getElementById(\'tab-btn-tcalc\');if(b)b.click();" style="cursor:pointer;background:var(--surface2);border:1px solid #6688cc44;border-left:3px solid #6688cc;border-radius:10px;padding:12px 14px;margin-bottom:12px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#6688cc">Planned in T-Calc</div>'
      +'<div style="font-size:11px;color:#6688cc">Open →</div>'
    +'</div>'
    +rows
    +'<div style="font-size:10px;color:var(--muted2);margin-top:6px">Testosterone is scheduled from the T-Calc planner (not configured as a TRT compound here). Tap to view or adjust the dose.</div>'
  +'</div>';
}
// TRT tab content for stack view (read-only): compounds + injection log
function _renderTRTViewTab(st){
  var compounds=_trtCompounds(st.trt);
  var html='';
  var _tcCard=(typeof _renderTcalcTrtCard==='function')?_renderTcalcTrtCard():'';
  if(_tcCard) html+=_tcCard;
  if(!compounds.length){
    if(!_tcCard) html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">No TRT configured for this stack.</div>';
  }else{
    html+='<div class="wiz-section" style="margin-bottom:10px;">Protocol</div>';
    compounds.forEach(function(c){
      var cat=TRT_CAT.find(function(t){return t.id===c.id;})||{};
      var dot=cat.dot||c.dot||'var(--accent4)';
      html+='<div class="cfg-block" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">';
      html+='<div style="width:8px;height:8px;border-radius:50%;background:'+dot+';flex-shrink:0;"></div>';
      html+='<div style="font-size:13px;font-weight:600;color:var(--text);">'+_esc(c.name)+'</div>';
      html+='<div style="font-size:12px;color:var(--muted2);">'+(c.dose?c.dose+(c.unit||'mg')+' ':'')+(c.id!=='nebido'&&c.days&&c.days.length?c.days.map(function(d){return DAYS_SHORT[d];}).join('/'):(c.freqVal?'every '+c.freqVal+' '+c.freqUnit:'TRT'))+'</div>';
      html+='</div>';
    });
  }
  html+='<div class="wiz-section" style="margin-top:16px;margin-bottom:10px;">Injection Log</div>';
  if(!st.cycle_start){
    html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">Set a start date to see the injection log for this stack.</div>';
  }else{
    var _cid=_stackCycleId(st);
    if(!_trtLogCache.hasOwnProperty(_cid)){
      _fetchTRTLog(st,_cid);
      html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">Loading...</div>';
    }else{
      var _cachedInj=_trtLogCache[_cid];
      var _byDate={};
      _cachedInj.forEach(function(inj){if(!_byDate[inj.date])_byDate[inj.date]=[];_byDate[inj.date].push(inj);});
      var _sortedDates=Object.keys(_byDate).sort(function(a,b){return b.localeCompare(a);});
      if(!_sortedDates.length){
        html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">No TRT injections logged during this stack.</div>';
      }else{
        _sortedDates.forEach(function(dateStr){
          var dp=dateStr.split('-');var dObj=new Date(parseInt(dp[0]),parseInt(dp[1])-1,parseInt(dp[2]));
          html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">';
          html+='<div style="font-size:12px;color:var(--muted2);min-width:90px;flex-shrink:0;">'+fmtDate(dObj)+'</div>';
          html+='<div style="flex:1;">';
          _byDate[dateStr].forEach(function(inj){
            html+='<div style="font-size:12px;color:var(--text);display:flex;align-items:center;gap:6px;margin-bottom:2px;">';
            html+='<div style="width:7px;height:7px;border-radius:50%;background:'+(inj.dot||'#e8a020')+';flex-shrink:0;"></div>';
            html+=_esc(inj.compound_name||inj.compound_id);
            html+='</div>';
          });
          html+='</div></div>';
        });
      }
    }
  }
  return html;
}
async function _fetchTRTLog(st,cycleId){
  try{
    var r=await fetch(AGENT_URL+'/injections?cycle_id='+encodeURIComponent(cycleId)+'&active_only=false',{headers:authHeaders()});
    if(!r.ok){_trtLogCache[cycleId]=[];renderStackEditor();return;}
    var all=await r.json();
    _trtLogCache[cycleId]=(Array.isArray(all)?all:[]).filter(function(e){return e.tier==='trt'&&e.logged;});
  }catch(e){_logErr('fetchTRTLog',e);_trtLogCache[cycleId]=[];}
  renderStackEditor();
}
function setStackViewTab(t){_stackViewTab=t;renderStackEditor();}
function setEditInnerTab(t){_collectEditInputs();_editInnerTab=t;renderStackEditor();}
function _buildEnhancementCycleSection(){
  var c=_cycle;
  // #639: cycles are a TRT/Enhanced-tier feature. Hide for confirmed peptide-only
  // users (fail-open — see _cyclesAllowed). An active cycle always still shows.
  if(typeof _cyclesAllowed==='function'&&!_cyclesAllowed()&&!(c&&c.startDate))return '';
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
  var _cat=function(x){return(ENHANCEMENT_COMPOUNDS||[]).find(function(ec){return ec.name===x.name;});};
  var catCmps=cmps.map(_cat).filter(Boolean);
  var hasMast=catCmps.some(function(ec){return ec.id==='mast_e';});
  var hasPrimo=catCmps.some(function(ec){return ec.id==='primo';});
  var hasTren=catCmps.some(function(ec){return ec.id==='tren_e'||ec.id==='tren_a';});
  var has19nor=catCmps.some(function(ec){return ec.cls==='19nor';});
  var oralCmps=catCmps.filter(function(ec){return ec.cls==='oral';});
  h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;">';
  h+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted2);margin-bottom:8px;">E2 Management</div>';
  if(!cmps.length){
    h+='<div style="font-size:12px;color:var(--muted2);">Add compounds above to see E2 strategy.</div>';
  }else if(hasMast){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent3);margin-bottom:4px;">Test + Masteron</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;">Masteron blocks aromatase competitively — pseudo-AI effect without crashing cardioprotective E2 to zero. Monitor for low-E2 symptoms (joint pain, flat affect, low libido) if Mast ratio climbs too high.</div>';
  }else if(hasPrimo){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent3);margin-bottom:4px;">Test + Primobolan</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;">Primobolan (DHT-derived) does not aromatize — reduces overall E2 load proportionally to its dose. Monitor for low-E2 symptoms (joint pain, flat affect, low libido) at high Primo ratios.</div>';
  }else if(hasTren){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:4px;">Test + Trenbolone — monitor E2 and prolactin</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;margin-bottom:6px;">Tren does not aromatize — keep Test at 300–400 mg/wk to limit E2 load. Target 20–40 pg/mL via Test dose adjustment. Monitor prolactin separately: Tren has ~5× stronger progestin activity than nandrolone. If prolactin exceeds upper range: cabergoline 0.25 mg 2×/week.</div>';
    if(oralCmps.length){var on=oralCmps.map(function(ec){return ec.name.split('(')[0].trim();}).join(' + ');h+='<div style="font-size:11px;color:var(--muted2);font-style:italic;">'+on+' '+(oralCmps.length===1?'does':'do')+' not aromatize — no added E2 load from the oral component.</div>';}
  }else if(has19nor){
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:4px;">Test + 19-nor — monitor E2 and prolactin</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;margin-bottom:6px;">19-nor compounds (Deca, NPP) do not aromatize but have progestin activity that can drive prolactin-mediated gynecomastia independently of E2. Monitor E2 (target 20–40 pg/mL) AND prolactin. If prolactin rises: cabergoline 0.25 mg 2×/week. Adjust Test dose to manage E2; adjust compound ratio to manage prolactin.</div>';
    if(oralCmps.length){var on=oralCmps.map(function(ec){return ec.name.split('(')[0].trim();}).join(' + ');h+='<div style="font-size:11px;color:var(--muted2);font-style:italic;">'+on+' '+(oralCmps.length===1?'does':'do')+' not aromatize — no added E2 load from the oral component.</div>';}
  }else{
    var e2Lbl=oralCmps.length?'Test + '+oralCmps.map(function(ec){return ec.name.split(' ')[0];}).join('/')+'  — monitor E2':'Test — monitor E2';
    h+='<div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:4px;">'+e2Lbl+'</div>';
    h+='<div style="font-size:12px;color:var(--muted2);line-height:1.6;'+(oralCmps.length?'margin-bottom:6px;':'')+'">Target 20–40 pg/mL. Bloat + mood swings = high E2. Flat libido + joint ache = low E2. Adjust Test dose or compound ratios — not AIs.</div>';
    if(oralCmps.length){var on=oralCmps.map(function(ec){return ec.name.split('(')[0].trim();}).join(' and ');h+='<div style="font-size:11px;color:var(--muted2);font-style:italic;">'+on+' '+(oralCmps.length===1?'does':'do')+' not aromatize — no added E2 load from the oral component.</div>';}
  }
  h+='</div>';
  return h;
}
async function stackSetCyclePhase(phase){
  var c=_cycle;if(!c||!c.id)return;
  c.phase=phase;cycleCacheSave(c);renderStackEditor();
  try{var _rph=await fetch(AGENT_URL+'/cycles/'+c.id,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({phase:phase})});if(!_rph.ok)_logHttp('cyclePatchPhase',_rph.status,'/cycles/'+c.id);}catch(e){_logErr('cyclePatchPhase',e);}
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
  // Build grouped compound select from backend catalogue
  var _grps=['Base','DHT-Derived','19-Nor','GH Axis','Oral'];
  var selHtml='<select id="aas-name" onchange="stackAASAutoFill(this.value)" style="'+ins+'"><option value="">— Choose compound —</option>';
  _grps.forEach(function(g){var ge=(ENHANCEMENT_COMPOUNDS||[]).filter(function(e){return e.group===g;});if(!ge.length)return;selHtml+='<optgroup label="'+g+'">';ge.forEach(function(e){selHtml+='<option value="'+e.id+'">'+e.name+'</option>';});selHtml+='</optgroup>';});
  selHtml+='</select>';
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><div style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--accent);">ADD COMPOUND</div><button onclick="document.getElementById(\'aas-add-overlay\').remove()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1;">&#x2715;</button></div>'
    +'<div style="display:grid;gap:10px;">'
    +selHtml
    +'<div style="display:flex;gap:8px;">'
    +'<input id="aas-dose" type="text" inputmode="decimal" placeholder="Dose" style="flex:1;padding:10px 12px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:14px;font-family:inherit;outline:none;">'
    +'<select id="aas-unit" style="flex:1;padding:10px 8px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:13px;font-family:inherit;"><option>mg/week</option><option>mg/day</option><option>mg/EOD</option><option>IU/day</option><option>IU/week</option></select>'
    +'</div>'
    +'<div id="aas-info-block"></div>'
    +'<button onclick="stackConfirmAddAAS()" style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Add Compound</button>'
    +'</div>';
  overlay.appendChild(sheet);document.body.appendChild(overlay);
}
function _renderEnhancedGuide(cat,activeDose){
  if(!cat)return'';
  var html='';
  if(cat.cadence){var cad=cat.cadence;html+='<div style="display:block;margin-top:8px"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:4px">Injection Frequency</div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;"><div style="font-size:12px;font-weight:700;color:var(--accent);">'+cad.rec+'</div><div style="font-size:11px;color:var(--muted2);margin-top:2px;line-height:1.5;">'+cad.note+'</div><div style="font-size:10px;color:var(--muted2);margin-top:3px;font-style:italic;">½-life: '+cad.halfLife+'</div></div></div>';}
  var tiers=(cat.doseTiers&&cat.doseTiers.length)?cat.doseTiers:(DOSE_GUIDE&&DOSE_GUIDE[cat.id]?DOSE_GUIDE[cat.id]:null);
  if(tiers&&tiers.length){var rows=tiers.map(function(t){var _isActive=(activeDose&&activeDose>0)?(function(){var _ns=(t.d||'').match(/[\d.]+/g);if(_ns&&_ns.length>=2){var _mn=parseDec(_ns[0]),_mx=parseDec(_ns[_ns.length-1]);return activeDose>=_mn&&activeDose<=_mx;}return!!t.b;})():!!t.b;var bg=_isActive?'background:rgba(var(--accent-rgb,60,255,160),0.08);border:1px solid rgba(var(--accent-rgb,60,255,160),0.3);':'background:var(--surface2);border:1px solid var(--border);';var doseHtml=t.d?('<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">'+t.d+'</span>'):'';var note=t.n?('<div style="font-size:11px;color:var(--muted2);margin-top:2px;">'+t.n+'</div>'):'';var risk=t.r?('<div style="font-size:11px;color:#f59e0b;padding:2px 0 0 0">⚠ '+t.r+'</div>'):'';return'<div style="'+bg+'border-radius:6px;padding:5px 8px;margin-bottom:3px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:10px;font-weight:700;color:'+(_isActive?'var(--accent)':'var(--muted2)')+';text-transform:uppercase;min-width:62px">'+t.l+'</span>'+doseHtml+'</div>'+note+risk+'</div>';}).join('');html+='<div style="display:block;margin-top:8px"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px">Recommended Doses</div>'+rows+'</div>';}
  if(cat.interaction)html+='<div style="display:block;margin-top:8px"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:4px">How it works</div><div style="font-size:12px;color:var(--text);line-height:1.5;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;">'+cat.interaction+'</div></div>';
  if(cat.sides)html+='<div style="display:block;margin-top:8px"><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:4px">Side effects</div><div style="font-size:12px;color:var(--text);line-height:1.5;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;">'+cat.sides+'</div></div>';
  return html+_renderSafetyNote('enhanced');
}
function stackAASAutoFill(id){
  var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});
  if(!cat)return;
  var dEl=document.getElementById('aas-dose');if(dEl&&cat.defaultDose)dEl.value=cat.defaultDose;
  var uEl=document.getElementById('aas-unit');if(uEl&&cat.unit){Array.from(uEl.options).forEach(function(o,i){if(o.value===cat.unit||o.text===cat.unit)uEl.selectedIndex=i;});}
  var infoEl=document.getElementById('aas-info-block');if(infoEl)infoEl.innerHTML=_renderEnhancedGuide(cat);
}
async function stackConfirmAddAAS(){
  var c=_cycle;if(!c||!c.id)return;
  var nameEl=document.getElementById('aas-name');
  var doseEl=document.getElementById('aas-dose');
  var unitEl=document.getElementById('aas-unit');
  if(!nameEl)return;
  var id=(nameEl.value||'').trim();
  if(!id){nameEl.style.borderColor='var(--danger)';return;}
  var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});
  var name=cat?cat.name:id;
  var dose=parseDec(doseEl?doseEl.value:0)||0;
  var unit=(unitEl?unitEl.value:'')||'mg/week';
  var overlay=document.getElementById('aas-add-overlay');if(overlay)overlay.remove();
  c.compounds=(c.compounds||[]).concat([{name:name,dose:dose,unit:unit,active:true,startWeek:0}]);
  cycleCacheSave(c);renderStackEditor();
  try{var _rca=await fetch(AGENT_URL+'/cycles/'+c.id,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({compounds:c.compounds})});if(!_rca.ok)_logHttp('cyclePatchCompounds',_rca.status,'/cycles/'+c.id);}catch(e){_logErr('cyclePatchCompounds',e);}
}
async function stackRemoveAASCompound(idx){
  var c=_cycle;if(!c||!c.id)return;
  var name=(c.compounds&&c.compounds[idx])?c.compounds[idx].name:'this compound';
  if(!confirm('Remove '+name+'?'))return;
  c.compounds=(c.compounds||[]).filter(function(_,i){return i!==idx;});
  cycleCacheSave(c);renderStackEditor();
  try{var _rcr=await fetch(AGENT_URL+'/cycles/'+c.id,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({compounds:c.compounds})});if(!_rcr.ok)_logHttp('cyclePatchCompounds',_rcr.status,'/cycles/'+c.id);}catch(e){_logErr('cyclePatchCompounds',e);}
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
      if(c.start_date&&d<parseLocalDate(c.start_date))return;
      var cat=TRT_CAT.find(function(t){return t.id===c.id;});
      if(c.days&&c.days.length){if(!c.days.includes(d.getDay()))return;}
      else{var freqDays=c.freqUnit==='weeks'?(c.freqVal||1)*7:(c.freqVal||1);if(freqDays<=0||days%freqDays!==0)return;}
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
function _getDynamicEnhancedDoses(d,withIds){
  var result=[];
  var seenIds={};
  _userStacks.forEach(function(st,si){
    if(!_isActiveStack(si))return;
    if(!st||!st.enhanced||!st.enhanced.enabled||!st.enhanced.compounds||!st.enhanced.compounds.length)return;
    if(st.cycle_start){
      var start=parseLocalDate(st.cycle_start);
      var daysDiff=Math.floor((d-start)/86400000);
      if(daysDiff<0)return;
      if(st.cycle_length&&daysDiff>=st.cycle_length*7)return;
    }
    (st.enhanced.compounds||[]).forEach(function(c){
      if(c.days&&c.days.length&&!c.days.includes(d.getDay()))return;
      var key=c.id+'_'+si;
      if(seenIds[key])return;
      seenIds[key]=true;
      var dot=c.dot||'#a855f7';
      var baseUnit=c.unit?(c.unit.split('/')[0]):'';
      var unitLabel=c.unit?(' '+c.unit):'';
      var eCat=(ENHANCEMENT_COMPOUNDS||[]).find(function(ec){return ec.id===c.id;});
      var isAmPm=c.amPm||(eCat&&eCat.amPm);
      if(isAmPm){
        if(c.dose_am&&parseDec(c.dose_am)!==0){
          var amEntry={name:c.name,detail:c.dose_am+(baseUnit?' '+baseUnit:''),time:'AM',dot:dot,compId:c.id};
          if(withIds)amEntry.id=c.id+'_'+si+'_am_'+dateKey(d);
          result.push(amEntry);
        }
        if(c.dose_pm&&parseDec(c.dose_pm)!==0){
          var pmEntry={name:c.name,detail:c.dose_pm+(baseUnit?' '+baseUnit:''),time:'PM',dot:dot,compId:c.id};
          if(withIds)pmEntry.id=c.id+'_'+si+'_pm_'+dateKey(d);
          result.push(pmEntry);
        }
      }else{
        var entry={name:c.name,detail:(c.dose?c.dose+unitLabel:''),time:null,dot:dot,compId:c.id};
        if(withIds)entry.id=c.id+'_'+si+'_'+dateKey(d);
        result.push(entry);
      }
    });
  });
  return result;
}
function _renderTRTGuide(cId,weeklyDoseMg){
  var g=TRT_GUIDE&&TRT_GUIDE[cId];
  if(!g)return'';
  var tColor='#e8a020';
  var cadHtml='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;margin-bottom:5px">'
    +'<div style="font-size:10px;font-weight:700;color:var(--muted2);text-transform:uppercase;margin-bottom:2px">Recommended cadence</div>'
    +'<div style="font-size:12px;font-weight:700;color:'+tColor+'">'+g.cadence.rec+'</div>'
    +'<div style="font-size:11px;color:var(--muted2);margin-top:2px">'+g.cadence.note+'</div>'
    +'<div style="font-size:10px;color:var(--muted2);margin-top:3px;font-style:italic">½-life: '+g.halfLife+'</div>'
    +'</div>';
  var tiersHtml=g.tiers.map(function(t){
    var isMatch=weeklyDoseMg>0?(weeklyDoseMg>=(t.wkMin||0)&&weeklyDoseMg<=(t.wkMax||9999)):!!t.b;
    var bg=isMatch?'background:rgba(232,160,32,0.1);border:1px solid rgba(232,160,32,0.4);':'background:var(--surface2);border:1px solid var(--border);';
    var risk=t.r?'<div style="font-size:11px;color:#f59e0b;padding-top:2px">⚠ '+t.r+'</div>':'';
    return'<div style="'+bg+'border-radius:6px;padding:5px 8px;margin-bottom:3px">'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<span style="font-size:10px;font-weight:700;color:'+(isMatch?tColor:'var(--muted2)')+';text-transform:uppercase;min-width:80px">'+t.l+'</span>'
      +'<span style="font-size:12px;font-weight:700;color:'+tColor+'">'+t.d+'</span>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--muted2);margin-top:1px">'+t.freq+(t.n?' — '+t.n:'')+'</div>'
      +risk+'</div>';
  }).join('');
  var profile=_userProfile();
  var mods=[];
  var colorMap={warn:'#f59e0b',info:'#c084fc',adj:'#3b9eff'};
  if(profile.sex==='female')mods.push({type:'warn',text:'Female TRT doses are dramatically lower — typically 5–10 mg/week SC. Do not use male TRT doses; consult an endocrinologist.'});
  if(profile.age>0&&profile.age<25)mods.push({type:'warn',text:'Age '+profile.age+': exogenous testosterone suppresses the HPTA and may impair endogenous production long-term at this age.'});
  if(profile.age>=50)mods.push({type:'info',text:'Age '+profile.age+': natural T decline is expected — start at the standard TRT range and titrate up only if bloodwork supports it.'});
  var modHtml=mods.length?'<div style="margin-top:5px;border-top:1px solid var(--border);padding-top:5px">'+mods.map(function(m){var c=colorMap[m.type]||'#3b9eff';return'<div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:3px"><span style="color:'+c+';font-size:12px;line-height:1.4;margin-top:1px">●</span><span style="font-size:11px;color:var(--text);line-height:1.4">'+m.text+'</span></div>';}).join('')+'</div>':'';
  var supraHtml='';
  if(weeklyDoseMg>250){supraHtml='<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.4);border-radius:6px;padding:7px 10px;margin-bottom:5px"><div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:2px">⚠ Supraphysiological dose</div><div style="font-size:11px;color:var(--muted2);line-height:1.5;">'+Math.round(weeklyDoseMg)+' mg/week exceeds the TRT range (100–200 mg/wk). At this dose you are running a blast, not a TRT protocol. Consider tracking this compound in the Enhanced tab instead and running TRT-range Test here.</div></div>';}
  return'<div class="cfg-row" style="display:block;margin-top:10px">'
    +'<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px">TRT Guide</div>'
    +supraHtml+cadHtml+tiersHtml+modHtml+'</div>'+_renderSafetyNote('trt');
}
function _refreshTRTGuide(id,freqVal,freqUnit,dose){var el=document.getElementById('trt-guide-'+id);if(!el)return;var doseNum=parseDec(dose)||0;var freqDays=(freqUnit||'weeks')==='weeks'?(freqVal||1)*7:(freqVal||1);var weeklyDoseMg=freqDays>0?doseNum*7/freqDays:0;el.innerHTML=_renderTRTGuide(id,weeklyDoseMg);}
function wizStepTRT(body,footer){
  var trt=_wiz.trt;
  if(!trt.compounds)trt.compounds=[];
  var sel=trt.compounds;
  var selIds=sel.map(function(c){return c.id;});
  var hasNebido=selIds.includes('nebido');
  var maxReached=hasNebido?(sel.length>=2):(sel.length>=1);
  var html='<div style="font-size:12px;color:var(--muted2);margin-bottom:12px;">Select your testosterone compound and configure the protocol.</div>';
  if(hasNebido&&sel.length===1){
    html+='<div style="font-size:11px;color:var(--muted2);margin-bottom:8px;">Nebido selected — you can add one short-acting compound for loading or bridging.</div>';
  }
  TRT_CAT.forEach(function(c){
    var isSel=selIds.includes(c.id);
    var disabled=!isSel&&maxReached;
    var selData=isSel?sel.find(function(s){return s.id===c.id;}):null;
    html+='<div class="pep-card'+(isSel?' sel':'')+(disabled?' disabled':'')+'" onclick="'+(disabled?'':('wizToggleTRTCompound(\''+c.id+'\')'))+'" style="margin-bottom:'+(isSel?'0':'8px')+';'+(isSel?'border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-color:transparent;':'')+(disabled?'opacity:0.4;cursor:default;pointer-events:none;':'')+'"><div class="pep-dot-sm" style="background:'+c.dot+'"></div><div class="pep-info"><div class="pep-name">'+c.name+'</div><div class="pep-meta">'+c.sub+'</div></div><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div>';
    if(isSel&&selData){
      var doseNum=parseDec(selData.dose)||0;
      var isNebido=c.id==='nebido';
      var weeklyDoseMg;
      if(!isNebido&&selData.days&&selData.days.length){weeklyDoseMg=doseNum*selData.days.length;}
      else{var freqDays=(selData.freqUnit||'weeks')==='weeks'?(selData.freqVal||1)*7:(selData.freqVal||1);weeklyDoseMg=freqDays>0?doseNum*7/freqDays:0;}
      html+='<div style="border:1px solid var(--accent);border-top:none;border-radius:0 0 10px 10px;padding:12px 14px;margin-bottom:8px;background:rgba(232,255,60,0.015);">';
      html+='<div class="cfg-row"><div class="cfg-lbl">Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose||'')+'" oninput="wizSetTRTDose(\''+c.id+'\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetTRTUnit(\''+c.id+'\',this.value)">'+['mg','ml','IU','%'].map(function(u){return'<option'+(u===(selData.unit||'mg')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div></div>';
      if(!isNebido){html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">'+DAYS_ORDER.map(function(di){var lbl=DAYS_SHORT[di];return'<div class="day-chip'+((selData.days||[]).includes(di)?' sel':'')+'" onclick="wizSetTRTDays(\''+c.id+'\','+di+')">'+lbl+'</div>';}).join('')+'</div></div>';}
      else{html+='<div class="cfg-row" style="margin-bottom:0"><div class="cfg-lbl">Frequency</div><div class="dose-row"><input class="dose-in" type="number" min="1" value="'+String(selData.freqVal||1)+'" oninput="wizSetTRTFreq(\''+c.id+'\',this.value)" style="max-width:70px;"><select class="unit-sel" onchange="wizSetTRTFreqUnit(\''+c.id+'\',this.value)"><option'+(('days'===(selData.freqUnit||'weeks'))?' selected':'')+'>days</option><option'+(('weeks'===(selData.freqUnit||'weeks'))?' selected':'')+'>weeks</option></select></div></div>';}
      html+='<div id="trt-guide-'+c.id+'">'+_renderTRTGuide(c.id,weeklyDoseMg)+'</div>';
      html+='</div>';
    }
  });
  var trtSupportCat=PEPTIDE_CAT.filter(function(p){return p.goals.every(function(g){return g==='trt';});});
  if(trtSupportCat.length){
    var pepSelIds=(_wiz.peptides||[]).map(function(x){return x.id;});
    html+='<div class="wiz-section" style="margin-top:16px">TRT Support</div>';
    trtSupportCat.forEach(function(p){
      var isSel=pepSelIds.includes(p.id);
      html+='<div class="pep-card'+(isSel?' sel':'')+'" onclick="wizTogglePep(\''+p.id+'\');wizStepTRT(document.getElementById(\'wiz-body\'),document.getElementById(\'wiz-footer\'));"><div class="pep-dot-sm" style="background:'+p.dot+'"></div><div class="pep-info"><div class="pep-name">'+p.name+'</div><div class="pep-meta">'+p.desc+'</div></div><div style="display:flex;align-items:center;gap:10px"><button class="info-btn" onclick="event.stopPropagation();showPeptideCard(\''+p.id+'\')">ℹ</button><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div></div>';
    });
  }
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
function wizToggleTRT(){_wiz.trt.enabled=!_wiz.trt.enabled;if(!_wiz.trt.compounds)_wiz.trt.compounds=[];wizStepTRT(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));}
function wizToggleTRTCompound(id){
  if(!_wiz.trt.compounds)_wiz.trt.compounds=[];
  var idx=_wiz.trt.compounds.findIndex(function(c){return c.id===id;});
  if(idx!==-1){_wiz.trt.compounds.splice(idx,1);}
  else{var cat=TRT_CAT.find(function(c){return c.id===id;});if(cat)_wiz.trt.compounds.push({id:id,name:cat.name,dose:cat.defaultDose,unit:cat.unit,freqVal:cat.freqVal,freqUnit:cat.freqUnit,days:cat.id==='nebido'?undefined:(cat.defaultDays?cat.defaultDays.slice():[1])});}
  wizStepTRT(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}
function wizSetTRTDose(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c)c.dose=v;}
function wizSetTRTUnit(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c)c.unit=v;}
function wizSetTRTFreq(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c){c.freqVal=parseInt(v)||1;_refreshTRTGuide(id,c.freqVal,c.freqUnit,c.dose);}}
function wizSetTRTFreqUnit(id,v){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(c){c.freqUnit=v;_refreshTRTGuide(id,c.freqVal,c.freqUnit,c.dose);}}
function wizSetTRTDays(id,di){var c=(_wiz.trt.compounds||[]).find(function(c){return c.id===id;});if(!c)return;if(!c.days)c.days=[];var idx=c.days.indexOf(di);if(idx!==-1)c.days.splice(idx,1);else c.days.push(di);c.days.sort(function(a,b){return a-b;});wizStepTRT(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));}
function editSetTRTDays(id,di){var c=((_editBuf.trt&&_editBuf.trt.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;if(!c.days)c.days=[];var idx=c.days.indexOf(di);if(idx!==-1)c.days.splice(idx,1);else c.days.push(di);c.days.sort(function(a,b){return a-b;});_collectEditInputs();renderStackEditor();}
function editToggleEnhancedCompound(id){
  if(!_editBuf.enhanced)_editBuf.enhanced={enabled:false,compounds:[]};
  if(!_editBuf.enhanced.compounds)_editBuf.enhanced.compounds=[];
  var idx=_editBuf.enhanced.compounds.findIndex(function(c){return c.id===id;});
  if(idx!==-1){_editBuf.enhanced.compounds.splice(idx,1);}
  else{var cat=ENHANCEMENT_COMPOUNDS.find(function(c){return c.id===id;});if(cat){var _eEntry={id:cat.id,name:cat.name,dose:String(cat.defaultDose||''),unit:cat.unit||'mg',days:cat.defaultDays?cat.defaultDays.slice():[0,1,2,3,4,5,6],dot:cat.dot};if(cat.amPm){_eEntry.amPm=true;_eEntry.dose_am=String(cat.defaultDoseAm||'');_eEntry.dose_pm=String(cat.defaultDosePm||'');}_editBuf.enhanced.compounds.push(_eEntry);}}
  _editBuf.enhanced.enabled=_editBuf.enhanced.compounds.length>0;
  renderStackEditor();
}
function editSetEnhDose(id,v){var c=((_editBuf.enhanced&&_editBuf.enhanced.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;c.dose=v;var el=document.getElementById('enh-guide-'+id);if(el){var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});el.innerHTML=_renderEnhancedGuide(cat,parseDec(v||0));}}
function editSetEnhUnit(id,v){var c=((_editBuf.enhanced&&_editBuf.enhanced.compounds)||[]).find(function(c){return c.id===id;});if(c)c.unit=v;}
function editSetEnhDoseAm(id,v){var c=((_editBuf.enhanced&&_editBuf.enhanced.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;c.dose_am=v;var el=document.getElementById('enh-guide-'+id);if(el){var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});el.innerHTML=_renderEnhancedGuide(cat,parseDec(c.dose_am||0)+parseDec(c.dose_pm||0));}}
function editSetEnhDosePm(id,v){var c=((_editBuf.enhanced&&_editBuf.enhanced.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;c.dose_pm=v;var el=document.getElementById('enh-guide-'+id);if(el){var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});el.innerHTML=_renderEnhancedGuide(cat,parseDec(c.dose_am||0)+parseDec(c.dose_pm||0));}}
function editSetEnhAmPm(id,on){var c=((_editBuf.enhanced&&_editBuf.enhanced.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;c.amPm=!!on;_collectEditInputs();renderStackEditor();}
function editSetEnhDays(id,di){var c=((_editBuf.enhanced&&_editBuf.enhanced.compounds)||[]).find(function(c){return c.id===id;});if(!c)return;if(!c.days)c.days=[];var idx=c.days.indexOf(di);if(idx!==-1){if(c.days.length>1)c.days.splice(idx,1);}else{c.days.push(di);}c.days.sort(function(a,b){return a-b;});renderStackEditor();}
function _renderEditEnhanced(enh){
  if(!enh)enh={enabled:false,compounds:[]};
  var sel=enh.compounds||[];
  var selIds=sel.map(function(c){return c.id;});
  var groups={};
  ENHANCEMENT_COMPOUNDS.forEach(function(c){if(!groups[c.group])groups[c.group]=[];groups[c.group].push(c);});
  var html='<div style="font-size:12px;color:var(--muted2);margin-bottom:12px;">Select enhancement compounds and configure dose and frequency.</div>';
  Object.keys(groups).forEach(function(grp){
    html+='<div class="wiz-section" style="margin-bottom:8px;">'+_esc(grp)+'</div>';
    groups[grp].forEach(function(c){
      var isSel=selIds.includes(c.id);
      var selData=isSel?sel.find(function(s){return s.id===c.id;}):null;
      html+='<div class="pep-card'+(isSel?' sel':'')+'" onclick="editToggleEnhancedCompound(\''+c.id+'\')" style="margin-bottom:'+(isSel?'0':'8px')+';'+(isSel?'border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-color:transparent;':'')+'"><div class="pep-dot-sm" style="background:'+c.dot+'"></div><div class="pep-info"><div class="pep-name">'+_esc(c.name)+'</div><div class="pep-meta">'+_esc(c.group)+'</div></div><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div>';
      if(isSel&&selData){
        // #637: AM/PM split is user-toggleable on any enhanced compound (defaults to
        // the catalogue amPm flag). The injection builder already honours selData.amPm.
        var _amPm=(selData.amPm!==undefined?!!selData.amPm:!!c.amPm);
        html+='<div style="border:1px solid var(--accent);border-top:none;border-radius:0 0 10px 10px;padding:12px 14px;margin-bottom:8px;background:rgba(232,255,60,0.015);">';
        html+='<div class="cfg-row" style="display:flex;align-items:center;justify-content:space-between"><div class="cfg-lbl" style="margin:0">Split AM / PM</div><div onclick="editSetEnhAmPm(\''+c.id+'\','+(!_amPm)+')" style="cursor:pointer"><div class="toggle-sw'+(_amPm?' on':'')+'"></div></div></div>';
        if(_amPm){
          var _eUnit=(c.unit||'IU').split('/')[0];
          html+='<div class="cfg-row"><div class="cfg-lbl">AM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose_am||'')+'" oninput="editSetEnhDoseAm(\''+c.id+'\',this.value)" placeholder="0"><span style="font-size:13px;color:var(--muted2);padding:0 6px;white-space:nowrap;">'+_eUnit+'</span></div></div>';
          html+='<div class="cfg-row"><div class="cfg-lbl">PM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose_pm||'')+'" oninput="editSetEnhDosePm(\''+c.id+'\',this.value)" placeholder="0"><span style="font-size:13px;color:var(--muted2);padding:0 6px;white-space:nowrap;">'+_eUnit+'</span></div></div>';
          html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">'+DAYS_ORDER.map(function(di){var lbl=DAYS_SHORT[di];return'<div class="day-chip'+((selData.days||[]).includes(di)?' sel':'')+'" onclick="editSetEnhDays(\''+c.id+'\','+di+')">'+lbl+'</div>';}).join('')+'</div></div>';
        }else{
          html+='<div class="cfg-row"><div class="cfg-lbl">Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose||'')+'" oninput="editSetEnhDose(\''+c.id+'\',this.value)" placeholder="0"><select class="unit-sel" onchange="editSetEnhUnit(\''+c.id+'\',this.value)">'+['mg/week','mg/day','mg/EOD','IU/day','IU/week','mg','ml','%'].map(function(u){return'<option'+(u===(selData.unit||'mg/week')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div></div>';
          html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">'+DAYS_ORDER.map(function(di){var lbl=DAYS_SHORT[di];return'<div class="day-chip'+((selData.days||[]).includes(di)?' sel':'')+'" onclick="editSetEnhDays(\''+c.id+'\','+di+')">'+lbl+'</div>';}).join('')+'</div></div>';
        }
        html+='<div id="enh-guide-'+c.id+'">'+_renderEnhancedGuide(c,_amPm?(parseDec(selData.dose_am||0)+parseDec(selData.dose_pm||0)):parseDec(selData.dose||0))+'</div>';
        html+='</div>';
      }
    });
  });
  return html;
}
function _renderEnhancedViewTab(st){
  var enh=st.enhanced||{};
  var compounds=enh.compounds||[];
  var html='<div class="wiz-section" style="margin-bottom:10px;">Enhancement Compounds</div>';
  if(!compounds.length){
    html+='<div style="color:var(--muted2);font-size:13px;padding:8px 0;">No enhancement compounds configured for this stack.</div>';
  }else{
    compounds.forEach(function(c){
      var dot=c.dot||'var(--accent2)';
      var days=c.days&&c.days.length?c.days.map(function(d){return DAYS_SHORT[d];}).join('/'):null;
      html+='<div class="cfg-block" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">';
      html+='<div style="width:8px;height:8px;border-radius:50%;background:'+dot+';flex-shrink:0;"></div>';
      html+='<div style="flex:1;font-size:13px;font-weight:600;color:var(--text);">'+_esc(c.name||c.id)+'</div>';
      var doseStr=c.amPm?([(c.dose_am?c.dose_am+' AM':''),( c.dose_pm?c.dose_pm+' PM':'')].filter(Boolean).join(' / ')+' '+(c.unit||'IU').split('/')[0]+(days?' · '+days:'')):((c.dose?c.dose+(c.unit||'mg'):'')+(days?' · '+days:''));
      html+='<div style="font-size:12px;color:var(--muted2);">'+doseStr+'</div>';
      html+='</div>';
    });
  }
  return html;
}

function wizStepEnhanced(body,footer){
  if(!_wiz.enhanced)_wiz.enhanced={enabled:false,compounds:[]};
  // Catalogue not yet loaded — show a visible loading state and auto-fetch
  if(!ENHANCEMENT_COMPOUNDS||!ENHANCEMENT_COMPOUNDS.length){
    body.innerHTML='<div style="padding:40px 0;text-align:center;"><div class="today-spinner-dot" style="margin:0 auto 16px"></div><div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:6px;">Loading compounds…</div><div style="font-size:12px;color:var(--muted2);">Connecting to backend…</div></div>';
    footer.innerHTML='<button class="btn btn-primary" style="flex:1;opacity:0.5" disabled>Next →</button>';
    syncEnhancedCompoundsFromAgent().then(function(result){
      if(_wizFlow()[_wiz.step]!=='enhanced')return;
      var b=document.getElementById('wiz-body'),f=document.getElementById('wiz-footer');
      if(!b||!f)return;
      if(ENHANCEMENT_COMPOUNDS&&ENHANCEMENT_COMPOUNDS.length){wizStepEnhanced(b,f);}
      else{
        var _errDetail=result&&result.status?(' (HTTP '+result.status+')'):(result&&result.msg?' ('+result.msg+')':'');
        b.innerHTML='<div style="padding:32px 0;text-align:center;"><div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:8px;">Catalogue unavailable</div><div style="font-size:13px;color:var(--muted2);margin-bottom:20px;">Check your connection and try again.'+_errDetail+'</div><button class="btn btn-primary" onclick="wizStepEnhanced(document.getElementById(\'wiz-body\'),document.getElementById(\'wiz-footer\'))">Try again</button></div>';
        f.innerHTML='<button class="btn btn-primary" style="flex:1;opacity:0.5" disabled>Next →</button>';
      }
    });
    return;
  }
  // Pre-fill matching TRT compounds on first entry
  if(!_wiz.enhanced._prefilled){
    _wiz.enhanced._prefilled=true;
    _trtCompounds(_wiz.trt).forEach(function(tc){
      var match=ENHANCEMENT_COMPOUNDS.find(function(ec){return ec.name.toLowerCase()===(tc.name||'').toLowerCase();});
      if(match&&!(_wiz.enhanced.compounds||[]).some(function(c){return c.id===match.id;})){
        if(!_wiz.enhanced.compounds)_wiz.enhanced.compounds=[];
        var _pfEntry={id:match.id,name:match.name,dose:String(tc.dose||match.defaultDose||''),unit:tc.unit||match.unit||'mg',days:tc.days?tc.days.slice():(match.defaultDays?match.defaultDays.slice():[0,1,2,3,4,5,6]),dot:match.dot};
        if(match.amPm){_pfEntry.amPm=true;_pfEntry.dose_am=String(tc.dose_am||match.defaultDoseAm||'');_pfEntry.dose_pm=String(tc.dose_pm||match.defaultDosePm||'');}
        _wiz.enhanced.compounds.push(_pfEntry);
      }
    });
    _wiz.enhanced.enabled=(_wiz.enhanced.compounds||[]).length>0;
  }
  var sel=_wiz.enhanced.compounds||[];
  var selIds=sel.map(function(c){return c.id;});
  var groups={};
  ENHANCEMENT_COMPOUNDS.forEach(function(c){
    if(!groups[c.group])groups[c.group]=[];
    groups[c.group].push(c);
  });
  var html='<div style="font-size:12px;color:var(--muted2);margin-bottom:12px;">Select enhancement compounds and configure dose and frequency for each.</div>';
  Object.keys(groups).forEach(function(grp){
    html+='<div class="wiz-section" style="margin-bottom:8px;">'+_esc(grp)+'</div>';
    groups[grp].forEach(function(c){
      var isSel=selIds.includes(c.id);
      var selData=isSel?sel.find(function(s){return s.id===c.id;}):null;
      html+='<div class="pep-card'+(isSel?' sel':'')+'" onclick="wizToggleEnhancedCompound(\''+c.id+'\')" style="margin-bottom:'+(isSel?'0':'8px')+';'+(isSel?'border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-color:transparent;':'')+'"><div class="pep-dot-sm" style="background:'+c.dot+'"></div><div class="pep-info"><div class="pep-name">'+_esc(c.name)+'</div><div class="pep-meta">'+_esc(c.group)+'</div></div><div class="pep-chk">'+(isSel?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</div></div>';
      if(isSel&&selData){
        html+='<div style="border:1px solid var(--accent);border-top:none;border-radius:0 0 10px 10px;padding:12px 14px;margin-bottom:8px;background:rgba(232,255,60,0.015);">';
        if(c.amPm){
          var _wUnit=(c.unit||'IU').split('/')[0];
          html+='<div class="cfg-row"><div class="cfg-lbl">AM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose_am||'')+'" oninput="wizSetEnhDoseAm(\''+c.id+'\',this.value)" placeholder="0"><span style="font-size:13px;color:var(--muted2);padding:0 6px;white-space:nowrap;">'+_wUnit+'</span></div></div>';
          html+='<div class="cfg-row"><div class="cfg-lbl">PM Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose_pm||'')+'" oninput="wizSetEnhDosePm(\''+c.id+'\',this.value)" placeholder="0"><span style="font-size:13px;color:var(--muted2);padding:0 6px;white-space:nowrap;">'+_wUnit+'</span></div></div>';
          html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">'+DAYS_ORDER.map(function(di){var lbl=DAYS_SHORT[di];return'<div class="day-chip'+((selData.days||[]).includes(di)?' sel':'')+'" onclick="wizSetEnhDays(\''+c.id+'\','+di+')">'+lbl+'</div>';}).join('')+'</div></div>';
        }else{
          html+='<div class="cfg-row"><div class="cfg-lbl">Dose</div><div class="dose-row"><input class="dose-in" type="text" value="'+String(selData.dose||'')+'" oninput="wizSetEnhDose(\''+c.id+'\',this.value)" placeholder="0"><select class="unit-sel" onchange="wizSetEnhUnit(\''+c.id+'\',this.value)">'+['mg/week','mg/day','mg/EOD','IU/day','IU/week','mg','ml','%'].map(function(u){return'<option'+(u===(selData.unit||'mg/week')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></div></div>';
          html+='<div class="cfg-row"><div class="cfg-lbl">Days</div><div class="day-chips">'+DAYS_ORDER.map(function(di){var lbl=DAYS_SHORT[di];return'<div class="day-chip'+((selData.days||[]).includes(di)?' sel':'')+'" onclick="wizSetEnhDays(\''+c.id+'\','+di+')">'+lbl+'</div>';}).join('')+'</div></div>';
        }
        html+='<div id="wiz-enh-guide-'+c.id+'">'+_renderEnhancedGuide(c,c.amPm?(parseDec(selData.dose_am||0)+parseDec(selData.dose_pm||0)):parseDec(selData.dose||0))+'</div>';
        html+='</div>';
      }
    });
  });
  var hasTest=sel.some(function(c){
    var cat=ENHANCEMENT_COMPOUNDS.find(function(ec){return ec.id===c.id;});
    return cat&&cat.cls==='base';
  });
  if(!hasTest){
    html='<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#f59e0b;">⚠ A testosterone base is required for an enhanced cycle.</div>'+html;
  }
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1'+(hasTest?'':';opacity:0.5')+'" '+(hasTest?'':'disabled ')+'onclick="wizNext()">Next →</button>';
}
function wizToggleEnhancedCompound(id){
  if(!_wiz.enhanced)_wiz.enhanced={enabled:false,compounds:[]};
  if(!_wiz.enhanced.compounds)_wiz.enhanced.compounds=[];
  var idx=_wiz.enhanced.compounds.findIndex(function(c){return c.id===id;});
  if(idx!==-1){
    _wiz.enhanced.compounds.splice(idx,1);
  }else{
    var cat=ENHANCEMENT_COMPOUNDS.find(function(c){return c.id===id;});
    if(cat){var _wEntry={id:cat.id,name:cat.name,dose:String(cat.defaultDose||''),unit:cat.unit||'mg',days:cat.defaultDays?cat.defaultDays.slice():[0,1,2,3,4,5,6],dot:cat.dot};if(cat.amPm){_wEntry.amPm=true;_wEntry.dose_am=String(cat.defaultDoseAm||'');_wEntry.dose_pm=String(cat.defaultDosePm||'');}_wiz.enhanced.compounds.push(_wEntry);}
  }
  _wiz.enhanced.enabled=_wiz.enhanced.compounds.length>0;
  wizStepEnhanced(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));
}
function wizSetEnhDose(id,v){var c=(_wiz.enhanced.compounds||[]).find(function(c){return c.id===id;});if(!c)return;c.dose=v;var el=document.getElementById('wiz-enh-guide-'+id);if(el){var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});el.innerHTML=_renderEnhancedGuide(cat,parseDec(v||0));}}
function wizSetEnhUnit(id,v){var c=(_wiz.enhanced.compounds||[]).find(function(c){return c.id===id;});if(c)c.unit=v;}
function wizSetEnhDoseAm(id,v){var c=(_wiz.enhanced.compounds||[]).find(function(c){return c.id===id;});if(!c)return;c.dose_am=v;var el=document.getElementById('wiz-enh-guide-'+id);if(el){var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});el.innerHTML=_renderEnhancedGuide(cat,parseDec(c.dose_am||0)+parseDec(c.dose_pm||0));}}
function wizSetEnhDosePm(id,v){var c=(_wiz.enhanced.compounds||[]).find(function(c){return c.id===id;});if(!c)return;c.dose_pm=v;var el=document.getElementById('wiz-enh-guide-'+id);if(el){var cat=(ENHANCEMENT_COMPOUNDS||[]).find(function(x){return x.id===id;});el.innerHTML=_renderEnhancedGuide(cat,parseDec(c.dose_am||0)+parseDec(c.dose_pm||0));}}
function wizSetEnhDays(id,di){var c=(_wiz.enhanced.compounds||[]).find(function(c){return c.id===id;});if(!c)return;if(!c.days)c.days=[];var idx=c.days.indexOf(di);if(idx!==-1){if(c.days.length>1)c.days.splice(idx,1);}else{c.days.push(di);}c.days.sort(function(a,b){return a-b;});wizStepEnhanced(document.getElementById('wiz-body'),document.getElementById('wiz-footer'));}
function wizStepValidate(body,footer){
  var g=(_wiz&&_wiz.goals)||[];
  var pepGoals=g.filter(function(x){return x!=='trt'&&x!=='enhanced';});
  var hasPeps=pepGoals.length>0||(!_wiz.trt.enabled&&!g.includes('enhanced'));
  var hasTRT=!!(_wiz.trt&&_wiz.trt.enabled);
  var hasEnhanced=g.includes('enhanced');
  var html='<div class="wiz-section" style="margin-bottom:8px">All Compounds</div>';
  if(hasPeps&&_wiz.peptides.length){
    html+='<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:6px">Peptides</div>';
    _wiz.peptides.forEach(function(p){html+='<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><div style="width:7px;height:7px;border-radius:50%;background:'+(p.dot||'#888')+';flex-shrink:0"></div><span style="font-size:13px;color:var(--text)">'+p.name+'</span></div>';});
  }
  if(hasTRT&&_wiz.trt.compound){
    html+='<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin:10px 0 6px">TRT</div>';
    html+='<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><div style="width:7px;height:7px;border-radius:50%;background:var(--accent4);flex-shrink:0"></div><span style="font-size:13px;color:var(--text)">'+_esc(_wiz.trt.compound)+'</span></div>';
  }
  if(hasEnhanced&&_wiz.enhanced&&_wiz.enhanced.compounds&&_wiz.enhanced.compounds.length){
    html+='<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin:10px 0 6px">Enhanced</div>';
    _wiz.enhanced.compounds.forEach(function(c){html+='<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><div style="width:7px;height:7px;border-radius:50%;background:'+(c.dot||'var(--accent2)')+';flex-shrink:0"></div><span style="font-size:13px;color:var(--text)">'+_esc(c.name||c.id)+'</span></div>';});
  }
  var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  html+='<div class="wiz-section" style="margin-top:16px;margin-bottom:8px">Cross-Compound Check</div>';
  html+=renderCheckResults(pepObjs,'wizinline');
  body.innerHTML=html;
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizNext()">Next →</button>';
}
function wizStepReview(body,footer){
  var pepObjs=_wiz.peptides.map(function(p){return PEPTIDE_CAT.find(function(c){return c.id===p.id;})||{id:p.id,cg:[]};});
  var hasErrors=checkStack(pepObjs).some(function(i){return i.level==='err';});
  var html='<div class="wiz-section">Stack Name</div><input class="trt-in" type="text" value="'+_esc(String(_wiz.stackName||''))+'" oninput="wizSetStackName(this.value)" placeholder="e.g. Cycle 1, Cutting Stack...">';
  html+='<div class="wiz-section" style="margin-top:16px">Summary</div>';
  var _reviewFlow=_wizFlow();
  if(_wiz.peptides.length){_wiz.peptides.forEach(function(p){var dose=p.times&&p.times.includes('AM')&&p.times.includes('PM')?(p.dose_am||'?')+(p.unit_am||'')+'/'+(p.dose_pm||'?')+(p.unit_pm||''):(p.times&&p.times.includes('AM')?(p.dose_am||'?')+(p.unit_am||''):(p.dose_pm||'?')+(p.unit_pm||''));var days=p.days&&p.days.length===7?'Every day':p.days&&p.days.length?p.days.length+'x/week':'?';html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(p.dot||'#888')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+_esc(p.name)+'</div><div style="font-size:12px;color:var(--muted2)">'+_esc(dose+' · '+days)+'</div></div>';});}
  else if(_reviewFlow.includes('peptides')){html+='<div style="color:var(--muted2);font-size:13px;">No peptides selected.</div>';}
  _trtCompounds(_wiz.trt).forEach(function(c){var days=c.days&&c.days.length===7?'Every day':c.days&&c.days.length?c.days.length+'x/week':(c.freqVal?'every '+c.freqVal+' '+c.freqUnit:'TRT');html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(c.dot||'var(--accent4)')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+_esc(c.name)+'</div><div style="font-size:12px;color:var(--muted2)">'+_esc((c.dose?c.dose+(c.unit||'mg')+' · ':'')+days)+'</div></div>';});
  if((_wiz.goals||[]).includes('enhanced')){
    html+='<div class="wiz-section" style="margin-top:16px">Enhancement Compounds</div>';
    if(_wiz.enhanced&&_wiz.enhanced.compounds&&_wiz.enhanced.compounds.length){
      _wiz.enhanced.compounds.forEach(function(c){
        var days=c.days&&c.days.length===7?'Every day':c.days&&c.days.length?c.days.length+'x/week':'';
        var doseLabel=(c.dose?c.dose+(c.unit||'mg'):'')+(days?' · '+days:'');
        html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+(c.dot||'var(--accent2)')+';flex-shrink:0"></div><div style="flex:1;font-size:13px;color:var(--text)">'+_esc(c.name||c.id)+'</div><div style="font-size:12px;color:var(--muted2)">'+_esc(doseLabel)+'</div></div>';
      });
    }else{html+='<div style="color:var(--muted2);font-size:13px;">No enhancement compounds selected.</div>';}
  }
  body.innerHTML=html;
  var saveLabel=hasErrors?'Save Anyway (conflicts)':'Save Stack';
  footer.innerHTML='<button class="btn btn-primary" style="flex:1" onclick="wizSave()">'+saveLabel+'</button>';
}

function closeWizard(){if(_wizOverlay){_wizOverlay.classList.remove('open');}}
function wizBack(){
  if(_wiz.step===0){closeWizard();return;}
  _wiz.step--;
  wizRender();
}
function wizNext(){
  var flow=_wizFlow();
  _wiz.step=Math.min(flow.length-1,_wiz.step+1);
  wizRender();
}
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

// ── Injection generation ──────────────────────────────────────────────────────

function _deriveStackCycleId(stack){
  var name=((stack&&stack.name)||'stack').replace(/\s+/g,'_').toLowerCase().replace(/[^a-z0-9_]/g,'');
  return name+'_'+((stack&&stack.cycle_start)||'nostart');
}
// Stable per-stack id, frozen so renaming a stack or moving its cycle start no
// longer orphans the stack's scheduled injections. Legacy stacks (no id) adopt
// their CURRENT derived cycle_id, which keeps their existing injections linked.
function _ensureStackId(stack){
  if(stack&&!stack.id)stack.id=_deriveStackCycleId(stack);
  return stack?stack.id:'';
}
function _stackCycleId(stack){
  return (stack&&stack.id)?stack.id:_deriveStackCycleId(stack);
}

function _getProtocolCompoundIds(stack){
  var ids=[];
  (stack.peptides||[]).forEach(function(p){if(p.id)ids.push(p.id);});
  if(stack.trt&&stack.trt.compounds)(stack.trt.compounds||[]).forEach(function(c){if(c.id)ids.push(c.id);});
  if(stack.enhanced&&stack.enhanced.compounds)(stack.enhanced.compounds||[]).forEach(function(c){if(c.id)ids.push(c.id);});
  return ids;
}

function _effectiveDoseAt(p,cycleStart,targetDate){
  if(!p||!p.dose_phases||!p.dose_phases.length||!cycleStart)return null;
  var sd=parseLocalDate(cycleStart);
  var wk=Math.floor((targetDate-sd)/604800000);
  if(wk<0)wk=0;
  var phases=p.dose_phases.slice().sort(function(a,b){return a.w-b.w;});
  var cur=phases[0];
  for(var i=1;i<phases.length;i++){if(wk>=phases[i].w)cur=phases[i];}
  return cur?{dose:cur.d,unit:cur.u}:null;
}

function _genInjBatches(stack,cycleId,fromDate){
  if(!stack||!stack.cycle_start)return[];
  var cycleStart=parseLocalDate(stack.cycle_start);
  var cycleEnd;
  if(stack.cycle_length&&stack.cycle_length>0){cycleEnd=new Date(cycleStart.getTime()+stack.cycle_length*7*86400000);}
  else{cycleEnd=new Date(NOW.getTime()+365*86400000);}
  var genStart=fromDate?new Date(Math.max(cycleStart.getTime(),fromDate.getTime())):cycleStart;
  var batches=[];

  // Peptides
  (stack.peptides||[]).forEach(function(p){
    if(p.active===false)return;
    var days=p.days||[0,1,2,3,4,5,6];
    var times=p.times||['AM'];
    var dot=p.dot||'#888';
    var pStart=p.start_date?parseLocalDate(p.start_date):cycleStart;
    var pEnd=p.end_date?parseLocalDate(p.end_date):null;
    var compEntries=[];
    for(var d=new Date(genStart);d<=cycleEnd;d=new Date(d.getTime()+86400000)){
      if(!days.includes(d.getDay()))continue;
      if(d<pStart)continue;
      if(pEnd&&d>pEnd)continue;
      var eff=_effectiveDoseAt(p,stack.cycle_start,d);
      var dk=dateKey(d);
      if(times.includes('AM')&&times.includes('PM')){
        var dAm=eff?eff.dose:(p.dose_am||p.dose||'');var uAm=eff?eff.unit:(p.unit_am||'');
        var dPm=eff?eff.dose:(p.dose_pm||p.dose||'');var uPm=eff?eff.unit:(p.unit_pm||'');
        if(dAm)compEntries.push({cycle_id:cycleId,date:dk,compound_id:p.id,compound_name:p.name,tier:'peptide',dose:dAm,unit:uAm,dot:dot,time_of_day:'AM',active:true,logged:false});
        if(dPm)compEntries.push({cycle_id:cycleId,date:dk,compound_id:p.id,compound_name:p.name,tier:'peptide',dose:dPm,unit:uPm,dot:dot,time_of_day:'PM',active:true,logged:false});
      }else{
        var t=times[0]||'AM';
        var dose=eff?eff.dose:(t==='AM'?(p.dose_am||p.dose||''):(p.dose_pm||p.dose||''));
        var unit=eff?eff.unit:(t==='AM'?(p.unit_am||''):(p.unit_pm||''));
        if(dose)compEntries.push({cycle_id:cycleId,date:dk,compound_id:p.id,compound_name:p.name,tier:'peptide',dose:dose,unit:unit,dot:dot,time_of_day:t,active:true,logged:false});
      }
    }
    if(compEntries.length)batches.push({compound_id:p.id,from_date:dateKey(genStart),entries:compEntries});
  });

  // TRT compounds
  if(stack.trt&&stack.trt.enabled){
    (stack.trt.compounds||[]).forEach(function(c){
      var cat=(typeof TRT_CAT!=='undefined')?TRT_CAT.find(function(t){return t.id===c.id;}):null;
      var dot=cat?cat.dot:'#e8a020';
      var cStart=c.start_date?new Date(Math.max(parseLocalDate(c.start_date).getTime(),genStart.getTime())):new Date(genStart);
      var cEnd=c.end_date?new Date(Math.min(parseLocalDate(c.end_date).getTime(),cycleEnd.getTime())):new Date(cycleEnd);
      var compEntries=[];
      for(var d=new Date(cStart);d<=cEnd;d=new Date(d.getTime()+86400000)){
        var daysSince=Math.floor((d-cycleStart)/86400000);
        var hit=false;
        if(c.id!=='nebido'&&c.days&&c.days.length){hit=c.days.includes(d.getDay());}
        else{var freqDays=c.freqUnit==='weeks'?(c.freqVal||1)*7:(c.freqVal||1);hit=freqDays>0&&daysSince%freqDays===0;}
        if(!hit)continue;
        compEntries.push({cycle_id:cycleId,date:dateKey(d),compound_id:c.id,compound_name:c.name,tier:'trt',dose:c.dose||'',unit:c.unit||'mg',dot:dot,time_of_day:(c.time==='PM'?'PM':'AM'),active:true,logged:false});
      }
      if(compEntries.length)batches.push({compound_id:c.id,from_date:dateKey(cStart),entries:compEntries});
    });
  }

  // Enhanced compounds
  if(stack.enhanced&&stack.enhanced.enabled){
    (stack.enhanced.compounds||[]).forEach(function(c){
      var dot=c.dot||'#a855f7';
      var eCat=(typeof ENHANCEMENT_COMPOUNDS!=='undefined')?(ENHANCEMENT_COMPOUNDS||[]).find(function(ec){return ec.id===c.id;}):null;
      var isAmPm=c.amPm||(eCat&&eCat.amPm);
      var baseUnit=c.unit?(c.unit.split('/')[0]):'';
      var compEntries=[];
      for(var d=new Date(genStart);d<=cycleEnd;d=new Date(d.getTime()+86400000)){
        if(c.days&&c.days.length&&!c.days.includes(d.getDay()))continue;
        var dk=dateKey(d);
        if(isAmPm){
          if(c.dose_am&&parseDec(c.dose_am)!==0)compEntries.push({cycle_id:cycleId,date:dk,compound_id:c.id,compound_name:c.name,tier:'enhanced',dose:c.dose_am,unit:baseUnit,dot:dot,time_of_day:'AM',active:true,logged:false});
          if(c.dose_pm&&parseDec(c.dose_pm)!==0)compEntries.push({cycle_id:cycleId,date:dk,compound_id:c.id,compound_name:c.name,tier:'enhanced',dose:c.dose_pm,unit:baseUnit,dot:dot,time_of_day:'PM',active:true,logged:false});
        }else{
          compEntries.push({cycle_id:cycleId,date:dk,compound_id:c.id,compound_name:c.name,tier:'enhanced',dose:c.dose||'',unit:c.unit||'',dot:dot,time_of_day:null,active:true,logged:false});
        }
      }
      if(compEntries.length)batches.push({compound_id:c.id,from_date:dateKey(genStart),entries:compEntries});
    });
  }

  return batches;
}

async function generateAndPushInjections(stack,fromDate){
  if(!stack||!stack.cycle_start)return;
  var cycleId=_stackCycleId(stack);
  var batches=_genInjBatches(stack,cycleId,fromDate);
  for(var i=0;i<batches.length;i++){
    var b=batches[i];
    try{
      var r=await fetch(AGENT_URL+'/injections/batch',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({cycle_id:cycleId,compound_id:b.compound_id,from_date:b.from_date,entries:b.entries})});
      if(!r.ok)_logHttp('genInj',r.status,'/injections/batch');
    }catch(e){_logErr('genInj',e);}
  }
}

async function generateInjectionsForActiveStacks(fromDate){
  for(var i=0;i<_activeStackIndices.length;i++){
    var si=_activeStackIndices[i];
    var st=_userStacks[si];
    if(st&&st.cycle_start)await generateAndPushInjections(st,fromDate);
  }
}
