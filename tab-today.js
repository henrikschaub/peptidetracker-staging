function buildWeekStrip(){const strip=document.getElementById('week-strip');strip.innerHTML='';const start=new Date(NOW);start.setDate(NOW.getDate()-7);let todayEl=null;const DL=['S','M','T','W','T','F','S'];for(let i=0;i<14;i++){const d=new Date(start);d.setDate(start.getDate()+i);const dow=d.getDay();const isToday=d.toDateString()===NOW.toDateString();const dots=[];WEEKLY.forEach(function(dose){if(dose.dow.includes(dow))dots.push(dose.dot);});const el=document.createElement('div');el.className='week-day'+(isToday?' today':'');el.style.cursor='pointer';(function(dd,ee){el.onclick=function(){var _tb=document.getElementById('tab-btn-today');if(_tb)switchTab('today',_tb);showDayInline(dd,ee);};})(d,el);const dotHtml=[...new Set(dots)].slice(0,3).map(function(col){return '<div class="week-dot" style="background:'+col+'"></div>';}).join('');el.innerHTML='<div class="week-day-name">'+DL[dow]+'</div>'+'<div class="week-day-num">'+d.getDate()+'</div>'+'<div class="week-dots">'+dotHtml+'</div>';strip.appendChild(el);if(isToday)todayEl=el;}if(todayEl)strip.scrollLeft=todayEl.offsetLeft-(strip.clientWidth-todayEl.offsetWidth)/2;}
function buildToday(){const list=document.getElementById('today-checklist');var _tt=document.getElementById('today-title');if(_tt)_tt.textContent="TODAY'S DOSES";const _ci=document.getElementById('today-cycle-info');if(_ci){const _st=_userStacks[_activeStackIndices[0]];const _cs=_st&&_st.cycle_start;const _cl=_st&&(_st.cycle_length||12);if(_cs&&_cl){const _sd=parseLocalDate(_cs);const _ed=new Date(_sd.getTime()+_cl*7*86400000);const _dd=Math.max(0,Math.floor((NOW-_sd)/86400000));const _wk=Math.min(_cl,Math.floor(_dd/7)+1);_ci.textContent='Started '+fmtDate(_sd)+' · Week '+_wk+' of '+_cl+' · Ends '+fmtDate(_ed);}else{_ci.textContent='';}}if(_syncPending){list.innerHTML='<div class="today-spinner"><div class="today-spinner-dot"></div></div>';const _b=document.getElementById('today-badge');if(_b){_b.textContent='...';_b.className='card-badge badge-today';}return;}list.innerHTML='';const checked=getChecked();const alertWrap=document.getElementById('today-alerts');alertWrap.innerHTML='';const doses=[];WEEKLY.forEach(d=>{if(!d.dow.includes(TODAY_DOW))return;if(d.startDate&&NOW<d.startDate)return;if(d.endDate&&NOW>d.endDate)return;doses.push({id:d.id+'_'+dateKey(NOW),name:d.name,detail:d.detail,time:d.time,dot:d.dot});});_getDynamicTRTDoses(NOW,true).forEach(function(d){if(!doses.some(function(x){return x.id===d.id;}))doses.push(d);});if(!doses.length){list.innerHTML='<div class="empty"><div class="empty-icon">✓</div>Nothing scheduled today</div>';document.getElementById('today-badge').textContent='—';return;}const order={'AM':0,'null':1,'PM':2};doses.sort((a,b)=>(order[a.time]??1)-(order[b.time]??1));let done=0;doses.forEach(function(dose){var isChk=checked.includes(dose.id);if(isChk)done++;var item=document.createElement('div');item.className='check-item'+(isChk?' checked-item':'');var box=document.createElement('div');box.className='check-box'+(isChk?' checked':'');box.innerHTML='<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';var main=document.createElement('div');main.className='check-main';var nameEl=document.createElement('div');nameEl.className='check-name';nameEl.style.color=dose.dot;nameEl.textContent=dose.name;var detailEl=document.createElement('div');detailEl.className='check-detail';detailEl.textContent=dose.detail;main.appendChild(nameEl);main.appendChild(detailEl);item.appendChild(box);item.appendChild(main);if(dose.time){var timeEl=document.createElement('div');timeEl.className='check-time';timeEl.textContent=dose.time;item.appendChild(timeEl);}item.onclick=function(){toggle(dose.id);};var _bci=dose.id.substring(0,dose.id.lastIndexOf('_')).replace(/-am$|-pm$/,'');var _bcp=PEPTIDE_CAT.find(function(c){return c.id===_bci;});if(_bcp){var _bib=document.createElement('button');_bib.className='info-btn';_bib.textContent='ℹ';(function(_id){_bib.onclick=function(e){e.stopPropagation();showPeptideCard(_id);};}(_bci));item.appendChild(_bib);}list.appendChild(item);});const badge=document.getElementById('today-badge');badge.textContent=done+' / '+doses.length;badge.className='card-badge '+(done===doses.length?'badge-done':'badge-today');}
function toggle(id){const chk=getChecked();const i=chk.indexOf(id);if(i===-1)chk.push(id);else chk.splice(i,1);setChecked(chk);const dk=_viewDate?dateKey(_viewDate):dateKey(NOW);if(window._peptideLog){var _pe=window._peptideLog.find(function(e){return e.date===dk;});if(_pe)_pe.doses=chk.slice();else window._peptideLog.push({date:dk,doses:chk.slice()});}syncDayToAgent(dk,chk);if(_viewDate){const activeTile=document.querySelector('.week-day.selected-day');showDayInline(_viewDate,activeTile);}else{buildToday();}}
async function syncDayToAgent(date,doses){try{const r=await fetch(AGENT_URL+'/peptide-log',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({date,doses})});if(!r.ok)console.error('syncDayToAgent failed',r.status);}catch(e){console.error('syncDayToAgent error',e);}}
async function syncPeptideLogFromAgent(){try{const r=await fetch(AGENT_URL+'/peptide-log',{headers:authHeaders()});if(!r.ok){_syncPending=false;buildToday();return;}window._peptideLog=await r.json();
  window._peptideLog.forEach(function(entry){
    if(!entry.doses)return;
    localStorage.setItem('proto-chk-'+entry.date,JSON.stringify(entry.doses));
  });
  _syncPending=false;buildToday();if(_viewDate){var _at=document.querySelector('.week-day.selected-day');showDayInline(_viewDate,_at);}buildHistory();detectCycleStart();obInit();}catch(e){_syncPending=false;buildToday();obInit();}}
function detectCycleStart(){
  if(!window._peptideLog||!_userStacks.length)return;
  var active=_userStacks[_activeStackIndices[0]];
  if(!active)return;
  var allSet=active.cycle_start&&(active.peptides||[]).every(function(p){return !!p.start_date;});
  if(allSet)return;
  var changed=false;
  // Auto-detect per-peptide start date from log (only for unset peptides)
  (active.peptides||[]).forEach(function(p){
    if(p.start_date)return;
    var pid=p.id;
    var earliest=null;
    window._peptideLog.forEach(function(entry){
      if(!entry.doses)return;
      // Match canonical and legacy ID formats
      var hit=entry.doses.some(function(d){
        if(d.startsWith(pid+'_')||d.startsWith(pid+'-am_')||d.startsWith(pid+'-pm_')||d.startsWith(pid+'-1_')||d.startsWith(pid+'-2_'))return true;
        // retatrutide legacy: reta-sun_, reta-wed_, reta-
        if(pid==='retatrutide'&&(d.startsWith('reta-')))return true;
        // cjc-ipa legacy: cjc-am_, cjc-pm_
        if(pid==='cjc-ipa'&&(d.startsWith('cjc-am_')||d.startsWith('cjc-pm_')||d.startsWith('cjc_')))return true;
        return false;
      });
      if(hit&&(!earliest||entry.date<earliest))earliest=entry.date;
    });
    if(earliest){var _pp=earliest.split('-');p.start_date=_pp[0]+'-'+(_pp[1]||'1').padStart(2,'0')+'-'+(_pp[2]||'1').padStart(2,'0');changed=true;}
  });
  // Update cycle_start to earliest detected peptide start_date (even if already set, if earlier found)
  var pdates=(active.peptides||[]).map(function(p){return p.start_date;}).filter(Boolean);
  if(pdates.length){
    pdates.sort();
    var _dp=pdates[0].split('-');
    var _earliest=_dp[0]+'-'+(_dp[1]||'1').padStart(2,'0')+'-'+(_dp[2]||'1').padStart(2,'0');
    if(!active.cycle_start||_earliest<active.cycle_start){active.cycle_start=_earliest;changed=true;}
  } else if(!active.cycle_start){
    // Fallback: direct Reta scan
    var rd=window._peptideLog.filter(function(e){return e.doses&&e.doses.some(function(d){return d.startsWith('reta-')||d.startsWith('retatrutide_');});}).map(function(e){return e.date;});
    if(rd.length){rd.sort();var _rp=rd[0].split('-');active.cycle_start=_rp[0]+'-'+(_rp[1]||'1').padStart(2,'0')+'-'+(_rp[2]||'1').padStart(2,'0');changed=true;}
  }
  if(changed){saveStacksToBackend();buildTimeline();}
}
function getPastDoses(d){if(!window._peptideLog)return null;const dk=dateKey(d);const entry=window._peptideLog.find(e=>_normDt(e.date)===dk);return entry?entry.doses.map(_normDoseId):null;}
function buildHistory(){const tab=document.getElementById('tab-history');if(!tab)return;const log=window._peptideLog||[];if(!log.length){tab.innerHTML='<div class="content"><div class="empty"><div class="empty-icon">💊</div>No history yet</div></div>';return;}const days=[...log].reverse();tab.innerHTML='<div class="content">'+days.map(entry=>{const d=new Date(entry.date.replace(/-/g,'/'));const label=d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"});const count=entry.doses.length;return'<div class="card" style="margin-bottom:10px"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--accent3)"></div><div class="card-title">'+label.toUpperCase()+'</div></div><span class="card-badge badge-done">'+count+' doses</span></div><div class="checklist">'+entry.doses.map(id=>{const name=id.replace(/_\d{4}-\d+-\d+$/,'').replace('glow-1','GLOW Stack').replace('glow-2','GLOW 2nd dose').replace('glow','GLOW Stack').replace('reta-sun','Retatrutide').replace('reta-wed','Retatrutide').replace('retatrutide','Retatrutide').replace('cjc-ipa-am','CJC/IPA AM').replace('cjc-ipa-pm','CJC/IPA PM').replace('cjc-am','CJC/IPA AM').replace('cjc-pm','CJC/IPA PM').replace(/^testo_\d+$/,'Testoviron');return'<div class="check-item checked-item"><div class="check-box checked"><svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="check-main"><div class="check-name" style="color:var(--accent3)">'+name+'</div></div></div>';}).join('')+'</div></div>';}).join('')+'</div>';}
function resetToday(){setChecked([]);buildToday();}
async function checkAppVersion(){try{const r=await fetch((IS_STAGING?'https://henrikschaub.github.io/peptidetracker-staging':'https://henrikschaub.github.io/peptidetracker')+'/version.json?t='+Date.now());if(!r.ok)return;const {version}=await r.json();const current=VERSION;if(version!==current){const b=document.createElement('div');b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#1c1c1c;border-top:1px solid var(--accent4);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;z-index:400;font-size:13px;';b.innerHTML='<span style="color:var(--text)">New version <strong style="color:var(--accent4)">v'+version+'</strong> available</span><button onclick="window.location.href=location.pathname+&quot;?t=&quot;+Date.now()" style="background:var(--accent4);color:#000;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:DM Sans,sans-serif">Update</button>';document.body.appendChild(b);}}catch(e){}}
async function checkForUpdate(){const btn=document.getElementById('s-update-btn');if(btn){btn.textContent='Checking…';btn.disabled=true;btn.style.borderColor='var(--border)';btn.style.color='var(--muted2)';}try{const r=await fetch((IS_STAGING?'https://henrikschaub.github.io/peptidetracker-staging':'https://henrikschaub.github.io/peptidetracker')+'/version.json?t='+Date.now());if(!r.ok)throw new Error('HTTP '+r.status);const {version}=await r.json();if(version===VERSION){if(btn){btn.textContent='Up to date ✓';btn.style.color='var(--accent3)';btn.style.borderColor='var(--accent3)';setTimeout(()=>{btn.textContent='Check';btn.style.color='var(--muted2)';btn.style.borderColor='var(--border)';btn.disabled=false;},2500);}}else{if(btn){btn.textContent='Update to v'+version;btn.style.background='var(--accent4)';btn.style.color='#000';btn.style.border='none';btn.style.borderRadius='20px';btn.disabled=false;btn.onclick=()=>{window.location.href=location.pathname+'?t='+Date.now()};}}}catch(e){if(btn){btn.textContent='Failed';btn.disabled=false;setTimeout(()=>{btn.textContent='Check';},2000);}}}
function showDayInline(date,tileEl){
  const d=new Date(date);
  const isToday=d.toDateString()===NOW.toDateString();
  const isPast=d<NOW&&!isToday;
  const pastChecked=isPast?JSON.parse(localStorage.getItem('proto-chk-'+dateKey(d))||'[]'):[];
  if(isToday){_viewDate=null;document.querySelectorAll('.week-day').forEach(e=>e.classList.remove('selected-day'));buildToday();return;}
  const dow=d.getDay();
  const doses=[];
  WEEKLY.forEach(w=>{if(!w.dow.includes(dow))return;if(w.startDate&&d<w.startDate)return;if(w.endDate&&d>w.endDate)return;doses.push({id:w.id+'_'+dateKey(d),name:w.name,detail:w.detail,time:w.time,dot:w.dot});});
  
  _getDynamicTRTDoses(d,true).forEach(function(x){if(!doses.some(function(y){return y.id===x.id;}))doses.push(x);});
  const list=document.getElementById('today-checklist');
  const badge=document.getElementById('today-badge');
  const label=d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
  if(!doses.length){list.innerHTML='<div class="empty"><div class="empty-icon">✓</div>Nothing scheduled</div>';badge.textContent=label;return;}
  _viewDate=d;
  const order={'AM':0,'null':1,'PM':2};
  doses.sort((a,b)=>(order[a.time]??1)-(order[b.time]??1));
  list.innerHTML='';
  if(_syncPending){list.innerHTML='<div class="today-spinner"><div class="today-spinner-dot"></div></div>';badge.textContent=label;badge.className='card-badge badge-today';document.querySelectorAll('.week-day').forEach(function(e){e.classList.remove('selected-day');});if(tileEl)tileEl.classList.add('selected-day');_viewDate=d;return;}if(isPast){var _lk='proto-chk-'+dateKey(d);if(!localStorage.getItem(_lk)){var _bd=getPastDoses(d);if(_bd)localStorage.setItem(_lk,JSON.stringify(_bd));}}var checked=getChecked();
  doses.forEach(function(dose){
    var realId=dose.id;
    var isChk=checked.includes(realId);
    var item=document.createElement('div');item.className='check-item'+(isChk?' checked-item':'');
    item.onclick=function(){toggle(realId);};
    var box=document.createElement('div');box.className='check-box'+(isChk?' checked':'');
    box.innerHTML='<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var main=document.createElement('div');main.className='check-main';
    var nameEl=document.createElement('div');nameEl.className='check-name';nameEl.style.color=dose.dot;nameEl.textContent=dose.name;
    var detailEl=document.createElement('div');detailEl.className='check-detail';detailEl.textContent=dose.detail;
    main.appendChild(nameEl);main.appendChild(detailEl);
    item.appendChild(box);item.appendChild(main);
    if(dose.time){var timeEl=document.createElement('div');timeEl.className='check-time';timeEl.textContent=dose.time;item.appendChild(timeEl);}
    var _sdi=realId.substring(0,realId.lastIndexOf('_')).replace(/-am$|-pm$/,'');var _sdp=PEPTIDE_CAT.find(function(c){return c.id===_sdi;});if(_sdp){var _sdib=document.createElement('button');_sdib.className='info-btn';_sdib.textContent='ℹ';(function(_id){_sdib.onclick=function(e){e.stopPropagation();showPeptideCard(_id);};}(_sdi));item.appendChild(_sdib);}
    list.appendChild(item);
  });
  badge.textContent=label;
  badge.className='card-badge badge-upcoming';
  var titleEl=document.getElementById('today-title');if(titleEl)titleEl.textContent=d.getDate()+'/'+(d.getMonth()+1);
  document.querySelectorAll('.week-day').forEach(e=>e.classList.remove('selected-day'));
  if(tileEl)tileEl.classList.add('selected-day');
}
function showDayModal(date){const d=new Date(date);const dow=d.getDay();const doses=[];WEEKLY.forEach(w=>{if(!w.dow.includes(dow))return;if(w.startDate&&d<w.startDate)return;if(w.endDate&&d>w.endDate)return;doses.push({name:w.name,detail:w.detail,time:w.time,dot:w.dot});});_getDynamicTRTDoses(d,false).forEach(function(x){doses.push(x);});const order={'AM':0,'null':1,'PM':2};doses.sort((a,b)=>(order[a.time]??1)-(order[b.time]??1));const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:flex-end;justify-content:center;';overlay.onclick=e=>{if(e.target===overlay)document.body.removeChild(overlay);};const sheet=document.createElement('div');sheet.style.cssText='background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;max-height:80vh;overflow-y:auto;';const rows=doses.length?doses.map(dose=>'<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)"><div style="width:8px;height:8px;border-radius:50%;background:'+dose.dot+';flex-shrink:0"></div><div style="flex:1"><div style="font-size:14px;font-weight:500;color:var(--text)">'+dose.name+'</div><div style="font-size:11px;color:var(--muted2);margin-top:2px">'+dose.detail+'</div></div>'+(dose.time?'<div style="font-family:Bebas Neue,sans-serif;font-size:14px;color:var(--muted2)">'+dose.time+'</div>':'')+'</div>').join(''):'<div style="color:var(--muted2);font-size:13px;text-align:center;padding:20px">Nothing scheduled</div>';sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--accent)">'+d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()+'</div><button onclick="document.body.removeChild(this.closest(chr91+chr39+chr115+chr116+chr121+chr108+chr101+chr42+chr61+chr102+chr105+chr120+chr101+chr100+chr39+chr93))" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button></div>'+rows;overlay.appendChild(sheet);document.body.appendChild(overlay);}
