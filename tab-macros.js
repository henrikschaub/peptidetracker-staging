/* ── MACROS ── */
var _macrosPhase='recomp';
function loadMacros(){var bw=parseDec(localStorage.getItem('user_weight'))||0;renderMacros(bw);}
function switchMacrosPhase(p){_macrosPhase=p;loadMacros();}
function calcMacros(bw,phase){
  var protein=Math.round(bw*2.2);
  var kcalBase=Math.round(bw*31);
  var kcal=phase==='cut'?kcalBase-300:phase==='reset'?kcalBase:kcalBase+100;
  var fat=Math.round(bw*0.9);
  var carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  return {protein:protein,carbs:carbs,fat:fat,kcal:kcal};
}
function saveMacrosTrainTime(val){localStorage.setItem('macros-train-time',val);pushPepSettingsToAgent({'macros-train-time':val});loadMacros();}
function saveMacrosTrainDur(val){localStorage.setItem('macros-train-dur',String(val));pushPepSettingsToAgent({'macros-train-dur':val});loadMacros();}
function renderMacros(bw){
  var body=document.getElementById('macros-body');if(!body)return;
  if(!bw){body.innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--muted2)"><div style="font-size:32px;margin-bottom:12px">⚖️</div><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Set your body weight</div><div style="font-size:13px;line-height:1.5">Log your weight in the <b>Weights</b> tab so macros can be calculated for you.</div></div>';return;}
  var m=calcMacros(bw,_macrosPhase);
  var phases=[{id:'reset',label:'Reset',color:'var(--accent4)'},{id:'cut',label:'Cut',color:'var(--accent2)'},{id:'recomp',label:'Recomp',color:'var(--accent3)'}];
  var trainTime=localStorage.getItem('macros-train-time')||'17:00';
  var trainDur=parseInt(localStorage.getItem('macros-train-dur'))||60;
  var h='<div style="display:flex;flex-direction:column;gap:14px">';
  h+='<div style="padding:0 20px"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted2);text-transform:uppercase;margin-bottom:10px">Phase</div>';
  h+='<div style="display:flex;gap:6px">';
  phases.forEach(function(p){var sel=_macrosPhase===p.id;h+='<button onclick="switchMacrosPhase(\''+p.id+'\')" style="flex:1;background:'+(sel?p.color:'var(--surface2)')+';color:'+(sel?'#000':'var(--muted2)')+';border:1px solid '+(sel?p.color:'var(--border)')+';border-radius:20px;padding:8px 4px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">'+p.label+'</button>';});
  h+='</div></div>';
  var ctx=_macrosPhase==='reset'?'Start at or slightly below maintenance for 1-3 weeks. Let metabolism stabilise — energy, digestion, sleep all improve before cutting. Do not rush into a deficit.':_macrosPhase==='cut'?'Controlled deficit after metabolic reset. Increase NEAT (steps to 12-15k) and add 20-30 min cardio post-workout. Maintain protein; adjust carbs and fat around training.':'Slight surplus with compound support for nutrient partitioning. Assess weekly — most gains happen at lower intake than expected on cycle. Do NOT chase size; chase the dry vascular look.';
  h+='<div style="margin:0 20px;background:rgba(60,255,160,0.07);border-radius:10px;padding:12px 14px;border-left:3px solid var(--accent3);font-size:12px;color:var(--muted2);line-height:1.6">'+ctx+'</div>';
  h+='<div class="card">';
  h+='<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--accent)"></div><div class="card-title">DAILY TARGETS</div></div><span style="font-size:11px;color:var(--muted2)">'+bw+' kg</span></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(4,1fr)">';
  var mi=[{l:'Calories',v:m.kcal,u:'kcal',c:'var(--accent)'},{l:'Protein',v:m.protein,u:'g',c:'var(--accent3)'},{l:'Carbs',v:m.carbs,u:'g',c:'var(--accent2)'},{l:'Fat',v:m.fat,u:'g',c:'var(--accent4)'}];
  mi.forEach(function(x,i){h+='<div style="padding:16px 6px;text-align:center'+(i<3?';border-right:1px solid var(--border)':'')+'">';h+='<div style="font-family:Bebas Neue,sans-serif;font-size:26px;line-height:1;color:'+x.c+'">'+x.v+'</div>';h+='<div style="font-size:9px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px">'+x.u+'</div>';h+='<div style="font-size:9px;color:var(--muted2)">'+x.l+'</div></div>';});
  h+='</div><div class="card-body"><div style="font-size:11px;color:var(--muted2);line-height:1.5">Protein 2.2 g/kg — non-negotiable for muscle retention. Adjust carbs and fat around training windows, not randomly.</div></div></div>';
  h+='<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--accent2)"></div><div class="card-title">MEAL TIMING</div></div></div>';
  h+='<div class="card-body" style="gap:12px">';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h+='<div style="display:grid;gap:4px"><label style="font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">Start time</label>';
  h+='<input id="macros-train-time" type="time" value="'+trainTime+'" onchange="saveMacrosTrainTime(this.value)" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:14px;font-family:inherit;outline:none;width:100%"></div>';
  h+='<div style="display:grid;gap:4px"><label style="font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.5px">Duration</label>';
  h+='<div style="display:flex;gap:5px">';
  [45,60,75,90].forEach(function(d){var sel=trainDur===d;h+='<button onclick="saveMacrosTrainDur('+d+')" style="flex:1;background:'+(sel?'var(--accent2)':'var(--surface2)')+';color:'+(sel?'#000':'var(--muted2)')+';border:1px solid '+(sel?'var(--accent2)':'var(--border)')+';border-radius:8px;padding:8px 2px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">'+d+'m</button>';});
  h+='</div></div>';
  h+='</div>';
  var tp=trainTime.split(':');var tH=parseInt(tp[0])||17;var tM=parseInt(tp[1])||0;
  var endMins=(tH*60+tM+trainDur)%1440;var eH=Math.floor(endMins/60);var eM=endMins%60;
  function ofT(h2,m2,dH,dM){var t=(h2*60+m2+dH*60+dM+1440)%1440;var th=Math.floor(t/60);var tm=t%60;return(th<10?'0':'')+th+':'+(tm<10?'0':'')+tm;}
  var slots=[
    {t:ofT(tH,tM,-1,-30),icon:'&#x26A1;',label:'Pre-training',macro:'Fast carbs + light protein',detail:'Rice cakes, OJ, banana. Prime glycogen; do not eat heavy fat.',col:'var(--accent2)'},
    {t:ofT(tH,tM,0,0),t2:ofT(eH,eM,0,0),icon:'&#x1F3CB;',label:'Training window',macro:'Optional fast carbs only if session &gt;75 min',detail:'Dextrose / Gatorade. Skip if short session.',col:'var(--accent)'},
    {t:ofT(eH,eM,0,0),icon:'&#x1F504;',label:'Post-training',macro:'Protein + fast carbs ASAP',detail:'Shake + fruit / white rice. Do not delay this window.',col:'var(--accent3)'},
    {t:ofT(eH,eM,4,0),icon:'&#x1F319;',label:'Pre-sleep',macro:'Slow protein + complex carbs',detail:'Cottage cheese / casein + oats. Sustains GH pulse, prevents catabolism.',col:'var(--accent4)'}
  ];
  slots.forEach(function(s){
    h+='<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">';
    h+='<div style="font-size:20px;line-height:1;padding-top:2px;min-width:24px;text-align:center">'+s.icon+'</div>';
    h+='<div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px"><span style="font-size:13px;font-weight:700;color:var(--text)">'+s.label+'</span><span style="font-size:12px;color:'+s.col+';font-weight:700">'+(s.t2?s.t+' – '+s.t2:s.t)+'</span></div>';
    h+='<div style="font-size:12px;color:var(--text);margin-bottom:2px">'+s.macro+'</div>';
    h+='<div style="font-size:11px;color:var(--muted2)">'+s.detail+'</div></div></div>';
  });
  h+='</div></div>';
  h+='<div class="card"><div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:var(--muted)"></div><div class="card-title">FOOD QUALITY</div></div><span class="card-badge badge-today">80/20</span></div>';
  h+='<div class="card-body"><div class="info-row"><span class="info-label">80% whole foods</span><span class="info-val" style="color:var(--accent3)">Required</span></div>';
  h+='<div style="font-size:11px;color:var(--muted2);margin-top:4px;line-height:1.5;margin-bottom:12px">Egg whites, chicken, turkey, sirloin, salmon, rice, potatoes, fruit, veg, avocado. Single-ingredient foods = insulin sensitivity = better nutrient partitioning.</div>';
  h+='<div class="info-row"><span class="info-label">20% flexible</span><span class="info-val" style="color:var(--muted2)">Lifestyle foods</span></div>';
  h+='<div style="font-size:11px;color:var(--muted2);margin-top:4px;line-height:1.5">Offset minutia, promote adherence, prevent the comp-prep mentality spiral.</div>';
  h+='</div></div>';
  h+='</div>';
  body.innerHTML=h;
}
