// NutriTrack – Statistik, Gewichtsverlauf und Wochenbericht (v0.250)
// Klassisches Script, kein Modul. Exportiert window.NTStats und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, esc, showToast, today,
// addDays, fmtDate, calcM, getDay, callClaude, canUseAi, openOv, closeOv).
//
// Gewicht liegt in S.weightLog als {datum: kg} – ein Wert je Tag, der letzte
// gewinnt. Das ist Absicht: Wer sich morgens und abends wiegt, will keine zwei
// Punkte im Diagramm, sondern den Stand des Tages.
//
// Die Diagramme sind von Hand gezeichnetes SVG/HTML und keine Bibliothek: Eine
// Chart-Bibliothek waere groesser als alles, was dieses Projekt sonst laedt, und
// muesste offline mitgecacht werden.
(function(){
'use strict';

// ── Gewicht loggen ──
function logWeight(){
  var val=parseFloat(document.getElementById('weightToday').value);
  if(!val||val<20||val>300){showToast('Bitte gültiges Gewicht eingeben');return;}
  if(!S.weightLog)S.weightLog={};
  S.weightLog[today()]=val;
  S.weight=val;
  saveS();
  document.getElementById('weightToday').value='';
  renderStatsPanel();
  showToast('⚖️ '+val+' kg gespeichert');
}

// ── Stats-Panel rendern ──
function switchStatsTab(tab){
  document.getElementById('stPanelStats').style.display='flex';
  document.getElementById('stPanelStats').style.flexDirection='column';
  document.getElementById('stPanelStats').style.gap='10px';
  renderStatsPanel();
}

function renderStatsPanel(){
  // Gewicht heute vorausfüllen
  var wlog=S.weightLog||{};
  var todayW=wlog[today()];
  if(todayW)document.getElementById('weightToday').value=todayW;
  // Gewichtstrend
  var dates=Object.keys(wlog).sort();
  var trendEl=document.getElementById('weightTrend');
  if(dates.length>=2){
    // Trend bezieht sich auf das Chart-Fenster (letzte 14 Einträge), nicht auf den allerersten Log-Eintrag.
    var win=dates.slice(-14);
    var diff=wlog[win[win.length-1]]-wlog[win[0]];
    trendEl.textContent=(diff>0?'▲ +':diff<0?'▼ ':'')+Math.abs(diff).toFixed(1)+'kg seit '+fmtDate(win[0]);
    trendEl.style.color=diff>0?'var(--re)':'var(--g1)';
  } else {
    trendEl.textContent='';
  }
  // Gewichtsverlauf-Chart
  renderWeightChart();
  // 7-Tage-Balken (rendert auch die Streak-Kachel)
  renderWeekBars();
  // Offline-Queue
  renderOfflineQueuePanel();
  // Zielüberprüfung
  checkGoalAchieved();
}

function renderWeightChart(){
  var wlog=S.weightLog||{};
  var dates=Object.keys(wlog).sort().slice(-14);
  var canvas=document.getElementById('weightChart');
  var empty=document.getElementById('weightChartEmpty');
  if(!canvas)return;
  if(dates.length<2){canvas.style.display='none';if(empty)empty.style.display='block';return;}
  canvas.style.display='block';if(empty)empty.style.display='none';
  canvas.width=canvas.offsetWidth||300;
  var ctx=canvas.getContext('2d');
  var vals=dates.map(function(d){return wlog[d];});
  var min=Math.min.apply(null,vals)-1,max=Math.max.apply(null,vals)+1;
  var w=canvas.width,h=canvas.height,pad=20;
  ctx.clearRect(0,0,w,h);
  // Zielgewicht Linie
  if(S.goalWeight&&S.goalWeight>min&&S.goalWeight<max){
    var gy=h-pad-(S.goalWeight-min)/(max-min)*(h-2*pad);
    ctx.strokeStyle='#f9c74f';ctx.setLineDash([4,4]);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad,gy);ctx.lineTo(w-pad,gy);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#f9c74f';ctx.font='10px sans-serif';ctx.fillText('Ziel',w-pad-20,gy-3);
  }
  // Gewichtslinie
  ctx.strokeStyle='#e96e3c';ctx.lineWidth=2;ctx.setLineDash([]);
  ctx.beginPath();
  dates.forEach(function(d,i){
    var x=pad+(w-2*pad)*i/(dates.length-1);
    var y=h-pad-(vals[i]-min)/(max-min)*(h-2*pad);
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // Punkte + Werte
  dates.forEach(function(d,i){
    var x=pad+(w-2*pad)*i/(dates.length-1);
    var y=h-pad-(vals[i]-min)/(max-min)*(h-2*pad);
    ctx.fillStyle='#e96e3c';ctx.beginPath();ctx.arc(x,y,3,0,2*Math.PI);ctx.fill();
    if(i===dates.length-1||i===0){
      ctx.fillStyle='#1f1a14';ctx.font='10px sans-serif';
      ctx.fillText(vals[i]+'kg',x-12,y-6);
    }
  });
}

var _statsRange=7;

function setStatsRange(n){
  _statsRange=n;
  document.getElementById('rangeBtn7').style.background=n===7?'var(--g2)':'white';
  document.getElementById('rangeBtn7').style.color=n===7?'white':'var(--mu)';
  document.getElementById('rangeBtn7').style.borderColor=n===7?'var(--g2)':'var(--br)';
  document.getElementById('rangeBtn30').style.background=n===30?'var(--g2)':'white';
  document.getElementById('rangeBtn30').style.color=n===30?'white':'var(--mu)';
  document.getElementById('rangeBtn30').style.borderColor=n===30?'var(--g2)':'var(--br)';
  renderWeekBars();
}

function renderWeekBars(){
  var n=_statsRange||7;
  var barsEl=document.getElementById('weekBars');
  var labelsEl=document.getElementById('weekLabels');
  if(!barsEl)return;
  var days=[];
  for(var i=n-1;i>=0;i--)days.push(addDays(today(),-i));
  var kcals=days.map(function(d){
    var day=S.days[d];if(!day)return 0;
    if(day._compressed)return day.kcal||0;
    var all=day.meals.breakfast.concat(day.meals.lunch,day.meals.dinner,day.meals.snack);
    return Math.round(calcM(all).kcal);
  });
  var maxK=Math.max(S.goal,Math.max.apply(null,kcals),1);
  var isToday=today();
  var gap=n===7?4:1;
  barsEl.style.gap=gap+'px';
  barsEl.innerHTML=days.map(function(d,i){
    var h=Math.max(2,Math.round(kcals[i]/maxK*70));
    var isT=d===isToday;
    var over=kcals[i]>S.goal;
    var col=isT?'var(--g1)':over?'var(--re)':'var(--g2)';
    var showVal=n===7||isT;
    return'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;">'
      +(showVal&&kcals[i]?'<div style="font-size:8px;color:var(--mu);">'+kcals[i]+'</div>':'<div style="font-size:8px;"></div>')
      +'<div style="width:100%;height:'+h+'px;background:'+col+';border-radius:3px 3px 0 0;"></div>'
      +'</div>';
  }).join('');
  if(labelsEl){
    labelsEl.innerHTML=n===7?days.map(function(d,i){
      var isT=d===isToday;
      var label=['Mo','Di','Mi','Do','Fr','Sa','So'][new Date(d).getDay()===0?6:new Date(d).getDay()-1];
      return'<div style="flex:1;text-align:center;font-size:10px;color:'+(isT?'var(--g1)':'var(--mu)')+';font-weight:'+(isT?'800':'400')+';">'+label+'</div>';
    }).join('') : '';
  }
  // Streak & Avg
  var avg=0,cnt=0;
  kcals.forEach(function(k,i){if(k>0&&days[i]!==isToday){avg+=k;cnt++;}});
  var streak=0,d2=today();
  while(true){var dy=S.days[d2];if(!dy)break;var k=dy._compressed?dy.kcal:calcM(dy.meals.breakfast.concat(dy.meals.lunch,dy.meals.dinner,dy.meals.snack)).kcal;if(k<10)break;streak++;d2=addDays(d2,-1);}
  var streakEl=document.getElementById('streakNum');
  var avgEl=document.getElementById('avgKcal');
  if(streakEl)streakEl.textContent=streak;
  if(avgEl)avgEl.textContent=cnt?Math.round(avg/cnt):0;
}

// ── KI-Wochenbericht ──
function requestWeekReport(){
  if(!canUseAi()){showAiUnavailable();return;}
  var btn=document.getElementById('weekReportBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳...';}
  var lines=[];
  var avgKcal=0,cnt=0;
  for(var i=6;i>=0;i--){
    var d=addDays(today(),-i);
    var dy=S.days[d];if(!dy)continue;
    var all=dy.meals.breakfast.concat(dy.meals.lunch,dy.meals.dinner,dy.meals.snack);
    var t=calcM(all);if(t.kcal<10)continue;
    lines.push(fmtDate(d)+': '+Math.round(t.kcal)+' kcal, P '+Math.round(t.protein)+'g, F '+Math.round(t.fat)+'g, C '+Math.round(t.carbs)+'g');
    avgKcal+=t.kcal;cnt++;
  }
  if(!cnt){showToast('Keine Daten dieser Woche');if(btn){btn.disabled=false;btn.textContent='Erstellen';}return;}
  var allPrefs=(S.dietPrefs||[]).concat(S.dietFree?[S.dietFree]:[]);
  var dir='maintain';
  if(S.goalWeight&&S.weight){
    if(S.goalWeight<S.weight-0.5)dir='lose';
    else if(S.goalWeight>S.weight+0.5)dir='gain';
  }
  var dirText=dir==='lose'?'Abnehmen (Kaloriendefizit)':dir==='gain'?'Zunehmen (Kalorienüberschuss)'  :'Gewicht halten';
  var prompt='Erstelle einen deutschen Wochenbericht zur Ernährung.\n'
    +'Format: 3–5 Stichpunkte (je 1 kurzer Satz, mit „–" einleiten), danach „Empfehlung für nächste Woche:" gefolgt von 1–2 konkreten Sätzen. Kein einleitender Satz.\n'
    +'Tagesdaten:\n'+lines.join('\n')+'\n'
    +'Kalorienziel: '+S.goal+' kcal/Tag\n'
    +'Zielrichtung: '+dirText+'\n'
    +(S.goalWeight&&S.weight?'Gewicht: '+S.weight+' kg → Ziel: '+S.goalWeight+' kg\n':'')
    +(allPrefs.length?'Ernährungspräferenzen: '+allPrefs.join(', ')+'\n':'')
    +'Durchschnitt: '+Math.round(avgKcal/cnt)+' kcal/Tag\n'
    +'Bewerte Tage relativ zur Zielrichtung (nicht nach absolutem kcal). Besten/schlechtesten Tag benennen.';
  callClaude('claude-haiku-4-5',[{type:'text',text:prompt}],400,
    function(text){
      var el=document.getElementById('weekReportText');
      if(el)el.textContent=text.trim();
      var srcEl=document.getElementById('weekReportSource');
      if(srcEl)srcEl.innerHTML=aiSourceBadgeHtml();
      if(btn){btn.disabled=false;btn.textContent='Aktualisieren';}
    },
    function(err){if(btn){btn.disabled=false;btn.textContent='Erstellen';}showToast('Fehler: '+err);}
  );
}

// ── Zielüberprüfung ──
function checkGoalAchieved(){
  if(!S.goalWeight||!S.goalDate)return;
  var today2=today();
  // Zieldatum erreicht?
  if(S.goalDate<=today2&&!S.goalAchievedShown){
    var currentW=S.weightLog&&S.weightLog[today2]||S.weight;
    if(currentW&&currentW<=S.goalWeight+0.5){
      S.goalAchievedShown=today2;saveS();
      setTimeout(function(){showToast('🎉 Zielgewicht erreicht! Neues Ziel setzen?');},1000);
    }
  }
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
// Intern bleiben: renderWeightChart, renderWeekBars
window.NTStats={
  logWeight:logWeight,
  switchTab:switchStatsTab,
  setRange:setStatsRange,
  weekReport:requestWeekReport,
  checkGoal:checkGoalAchieved,
  renderPanel:renderStatsPanel
};
})();
