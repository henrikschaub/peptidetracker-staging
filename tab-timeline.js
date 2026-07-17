// Plain-language "What this means" line for the cycle progress bar — derived only
// from the cycle's own position (weeks in / left, before-start / complete). No
// compound data, no dosing advice. Mirrors the Blood Levels translator (#582).
function _tlWhatThisMeans(wk,total,daysDone,totalDays){
  var daysLeft=Math.max(0,totalDays-daysDone);
  var wksLeft=Math.ceil(daysLeft/7);
  if(daysDone<0) return 'This cycle hasn\'t started yet — it begins on your start date.';
  if(daysDone>=totalDays) return 'This cycle is complete. Review your bloodwork before planning the next one.';
  var phase = wk<=Math.max(1,Math.round(total*0.25)) ? 'early — levels are still building toward steady state'
            : wk>total-1 ? 'in its final week — plan your next step or a break'
            : wk>total*0.75 ? 'in the back stretch'
            : 'mid-cycle — this is where levels are most stable';
  return 'You\'re '+phase+'. About '+wksLeft+' week'+(wksLeft===1?'':'s')+' left of '+total+'.';
}
function buildTimeline(){
  const body=document.getElementById('timeline-body');body.innerHTML='';
  const active=_userStacks&&_userStacks[_activeStackIndices[0]];
  if(active&&active.cycle_start&&active.cycle_length){
    const sd=parseLocalDate(active.cycle_start);
    const ed=new Date(sd.getTime()+active.cycle_length*7*86400000);
    const daysDone=Math.max(0,Math.floor((NOW-sd)/86400000));
    const _daysRaw=Math.floor((NOW-sd)/86400000);
    const totalDays=active.cycle_length*7;
    const pct=Math.min(100,Math.round(daysDone/totalDays*100));
    const wk=Math.min(active.cycle_length,Math.floor(daysDone/7)+1);
    const prog=document.createElement('div');
    prog.style.cssText='padding:14px 16px;border-bottom:1px solid var(--border);';
    const _wtm=_tlWhatThisMeans(wk,active.cycle_length,_daysRaw,totalDays);
    prog.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;"><span>${fmtDate(sd)}</span><span style="color:var(--accent)">WK ${wk} / ${active.cycle_length}</span><span>${fmtDate(ed)}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--accent);"></div></div><div style="font-size:11px;color:var(--muted2);margin-top:6px;text-align:center;">${pct}% complete · ${active.name||'Active Cycle'}</div><div style="margin-top:10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted2);margin-bottom:4px">What this means</div><div style="font-size:13px;color:var(--text);line-height:1.5">${_wtm}</div></div>`;
    body.appendChild(prog);
  }
  const all=MILESTONES.slice();
  if(active&&active.cycle_start){
    const sd2=parseLocalDate(active.cycle_start);
    all.push({date:sd2,name:active.name||'Cycle Start',desc:'Peptide cycle begins',_cycle:true});
    if(active.cycle_length){
      const ed2=new Date(sd2.getTime()+active.cycle_length*7*86400000);
      all.push({date:ed2,name:'Cycle End',desc:'Week '+active.cycle_length+' — cycle complete',_cycle:true});
    }
  }
  // Per-peptide start milestones for peptides that started after cycle_start
  if(active&&active.peptides){
    const byDate={};
    active.peptides.forEach(function(p){
      if(!p.start_date||p.start_date===active.cycle_start)return;
      if(!byDate[p.start_date])byDate[p.start_date]={names:[],dot:p.dot||'var(--accent4)'};
      byDate[p.start_date].names.push(p.name||p.id);
    });
    Object.keys(byDate).forEach(function(sd){
      const info=byDate[sd];
      all.push({date:parseLocalDate(sd),name:info.names.join(' + '),desc:'Added to protocol',_cycle:true,_dot:info.dot});
    });
  }
  if(active&&(active.cycle_start||active.peptides)){all.sort((a,b)=>a.date-b.date);}
  // Empty-state coaching (usability study): with no cycle and no milestones the
  // timeline was blank. Turn it into a first action.
  if(!all.length){
    var _hasStk = (typeof _userStacks!=='undefined' && _userStacks && _userStacks.length);
    body.innerHTML='<div class="empty" style="padding:44px 20px;text-align:center"><div class="empty-icon">▤</div>'+
      '<div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">No milestones yet</div>'+
      '<div style="font-size:13px;color:var(--muted2);line-height:1.6;max-width:280px;margin:0 auto 20px">'+
      (_hasStk
        ? 'Set a start date on your stack in Plan and its cycle start, checkpoints and end will appear here.'
        : 'Your cycle start, checkpoints and end date show up here once you start a protocol.')+
      '</div>'+
      '<button onclick="'+(_hasStk?'switchPrimary(\'plan\')':'createNewStack()')+'" style="background:var(--accent);color:#000;border:none;border-radius:20px;padding:10px 24px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">'+
      (_hasStk?'Go to Plan':'Start a protocol')+'</button></div>';
    return;
  }
  all.forEach((m,i)=>{
    const past=m.date<NOW&&m.date.toDateString()!==NOW.toDateString();
    const isToday=m.date.toDateString()===NOW.toDateString();
    const last=i===all.length-1;
    const _mc=m._dot||(m._cycle?'var(--accent4)':'');
    const accentColor=_mc;
    const row=document.createElement('div');row.className='milestone';
    row.innerHTML=`<div class="milestone-line"><div class="milestone-dot ${past?'past':isToday?'today-dot':'future'}" style="${(m._cycle||m._dot)&&!past?'border-color:'+_mc+';background:'+_mc+';opacity:0.7;':''}"></div>${!last?'<div class="milestone-connector"></div>':''}</div><div class="milestone-body"><div class="milestone-date">${fmtDate(m.date)}${isToday?' · TODAY':''}</div><div class="milestone-name" style="color:${past?'var(--muted2)':isToday?'var(--accent)':accentColor||'var(--text)'}">${m.name}</div><div class="milestone-desc">${m.desc}</div></div>`;
    body.appendChild(row);
  });
}
