function buildTimeline(){
  const body=document.getElementById('timeline-body');body.innerHTML='';
  const active=_userStacks&&_userStacks[_activeStackIndex];
  if(active&&active.cycle_start&&active.cycle_length){
    const sd=parseLocalDate(active.cycle_start);
    const ed=new Date(sd.getTime()+active.cycle_length*7*86400000);
    const daysDone=Math.max(0,Math.floor((NOW-sd)/86400000));
    const totalDays=active.cycle_length*7;
    const pct=Math.min(100,Math.round(daysDone/totalDays*100));
    const wk=Math.min(active.cycle_length,Math.floor(daysDone/7)+1);
    const prog=document.createElement('div');
    prog.style.cssText='padding:14px 16px;border-bottom:1px solid var(--border);';
    prog.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;"><span>${fmtDate(sd)}</span><span style="color:var(--accent)">WK ${wk} / ${active.cycle_length}</span><span>${fmtDate(ed)}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--accent);"></div></div><div style="font-size:11px;color:var(--muted2);margin-top:6px;text-align:center;">${pct}% complete · ${active.name||'Active Cycle'}</div>`;
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
