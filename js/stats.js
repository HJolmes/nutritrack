// NutriTrack – Statistik, Gewichtsverlauf und Wochenbericht (v0.277)
// Klassisches Script, kein Modul. Exportiert window.NTStats und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, esc, showToast, today,
// addDays, fmtDate, calcM, getDay, callClaude, canUseAi, showAiUnavailable,
// aiSourceBadgeHtml, _kcalAmpel, getMacroTargets, openOv, closeOv) sowie auf
// window.NTQueue.
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
  // Offline-Queue – renderOfflineQueuePanel ist in offline-queue.js privat
  // (IIFE); der blosse Name warf seit v0.249 bei jedem Oeffnen einen
  // ReferenceError und riss alles darunter mit.
  if(window.NTQueue)NTQueue.renderPanel();
  // Zielüberprüfung
  checkGoalAchieved();
  // Wochenbericht zuletzt und gekapselt: Ein unerwarteter Tag darf den Rest
  // des Panels nicht mitreissen.
  try{renderWeekReport();}catch(e){console.warn('[NTStats] Wochenbericht',e);}
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
  // dayTotals: robust gegen Archivtage und Tage ohne meals/Slots (Import,
  // Altversion) – sonst warf der Balken und riss den Wochenbericht mit (#208).
  var kcals=days.map(function(d){
    var t=dayTotals(S.days[d]);
    return t?Math.round(t.kcal):0;
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
      // Ortszeit: new Date('YYYY-MM-DD') waere UTC-Mitternacht und westlich
      // von UTC der Vortag (#247) – dieselbe Form wie renderHistory.
      var wd=new Date(d+'T00:00:00').getDay();
      var label=['Mo','Di','Mi','Do','Fr','Sa','So'][(wd+6)%7];
      return'<div style="flex:1;text-align:center;font-size:10px;color:'+(isT?'var(--g1)':'var(--mu)')+';font-weight:'+(isT?'800':'400')+';">'+label+'</div>';
    }).join('') : '';
  }
  // Streak & Avg
  var avg=0,cnt=0;
  kcals.forEach(function(k,i){if(k>0&&days[i]!==isToday){avg+=k;cnt++;}});
  var streak=0,d2=today();
  while(true){var dt=dayTotals(S.days[d2]);if(!dt)break;if((dt.kcal||0)<10)break;streak++;d2=addDays(d2,-1);}
  var streakEl=document.getElementById('streakNum');
  var avgEl=document.getElementById('avgKcal');
  if(streakEl)streakEl.textContent=streak;
  if(avgEl)avgEl.textContent=cnt?Math.round(avg/cnt):0;
}

// ── Wochenbericht ──
// Deterministisch aus S gerechnet, ohne Netz; die KI formuliert auf Wunsch nur
// dieselben Kennzahlen aus (#208). Der Bericht schreibt nichts nach S – Backup,
// Import, Sync und aeltere App-Versionen sind nicht betroffen.
//
// Datenbasis: die letzten 7 ABGESCHLOSSENEN Tage (heute zaehlt nicht, er ist
// angefangen), netto mit Sport wie die Hero-Ampel (kcal − Sport). Eine andere
// Antwort auf die Frage „heute mitzaehlen?" kostet genau diese Zeile.
var REPORT_INCLUDE_TODAY=false;
// Ein Tag gilt ab 10 kcal als eingetragen – dieselbe Grenze wie die Streak.
var REPORT_MIN_KCAL=10;
// Die Bewertung nutzt nur vorhandene App-Schwellen:
// - kcal: _kcalAmpel (±10 % = im Plan, sonst nach Zielrichtung aus
//   S.goalWeight vs. S.weight). Bewertet wird gegen das HEUTIGE S.goal; ein
//   Ziel je Tag wird nicht gespeichert.
// - Makros: getMacroTargets() mit den Grenzen der Naehrwert-Ampel
//   (renderNutrientAmpel): Protein ≥90 % gruen, ≥60 % gelb; Kohlenhydrate und
//   Fett ≤100 % gruen, ≤130 % gelb.
// - Protein je kg Koerpergewicht nur als Zahl, ohne Korridor und ohne Wertung.
// Empfehlung – genau eine, feste Liste, nur relativ zu App-Zielen, in dieser
// Rangfolge:
//   1. Protein unter 60 % des App-Ziels  → eiweissreiche Lebensmittel einplanen
//   2. mehr als die Haelfte der Tage abseits des Ziels → naeher ans kcal-Ziel,
//      mit der Zahl der Tage je Richtung (darueber/darunter)
//   3. weniger als 4 eingetragene Tage   → an mehr Tagen eintragen
//   4. sonst                             → weiter so
// Es gibt keinen Baustein, der zu weniger als dem Kalorienziel raet.

// Summen eines Tages, robust gegen Archivtage (_compressed: nur Summen, kein
// meals), fehlendes meals, fehlende Slots und fehlendes exercise – Tage aus
// einem Import oder einer aelteren Version (wie _encDayMeals in index.html).
function dayTotals(d){
  if(!d)return null;
  if(d._compressed)return{kcal:d.kcal||0,protein:d.protein||0,carbs:d.carbs||0,fat:d.fat||0,burned:0};
  var m=d.meals||{};
  var all=[].concat(m.breakfast||[],m.lunch||[],m.dinner||[],m.snack||[]).filter(Boolean);
  var t=calcM(all);
  var burned=(d.exercise||[]).reduce(function(a,e){return a+((e&&e.kcal)||0);},0);
  return{kcal:t.kcal,protein:t.protein,carbs:t.carbs,fat:t.fat,burned:burned};
}

function _macroStatus(val,target,moreIsBetter){
  if(!(target>0))return '';// ohne Ziel keine Wertung
  var r=val/target;
  if(moreIsBetter)return r>=0.9?'gruen':r>=0.6?'gelb':'rot';
  return r<=1?'gruen':r<=1.3?'gelb':'rot';
}

function weekStats(){
  var t0=today();
  var first=REPORT_INCLUDE_TODAY?0:1;
  var goal=S.goal||2000;
  var days=[];
  for(var i=first+6;i>=first;i--)days.push(addDays(t0,-i));
  var rows=[];
  days.forEach(function(d){
    var t=dayTotals(S.days&&S.days[d]);
    if(!t||t.kcal<REPORT_MIN_KCAL)return;
    var net=Math.max(0,t.kcal-t.burned);
    var a=_kcalAmpel(goal,net,S);
    var pct=Math.round(Math.abs(goal-net)/goal*100);// wie in _kcalAmpel
    // counted = angerechneter Sport: netto wird wie in der Hero-Ampel bei 0
    // gekappt, sonst ginge „Ø gegessen − Ø Sport = Ø netto“ nicht auf.
    rows.push({date:d,kcal:t.kcal,burned:t.burned,counted:Math.min(t.burned,t.kcal),net:net,protein:t.protein,carbs:t.carbs,fat:t.fat,
      pct:pct,above:net>goal,state:a.state});
  });
  var n=rows.length;
  var r={from:days[0],to:days[days.length-1],span:days.length,goal:goal,rows:rows,tracked:n,
    inPlan:0,dirOk:0,off:0,offAbove:0,offBelow:0,best:null,worst:null,
    avgKcal:0,avgNet:0,avgBurned:0,avgP:0,avgC:0,avgF:0,
    mt:null,stP:'',stC:'',stF:'',kg:0,proteinPerKg:null,weightDelta:null,weightFrom:null,weightTo:null,dir:'maintain'};
  var sum={kcal:0,net:0,burned:0,p:0,c:0,f:0};
  rows.forEach(function(x){
    if(x.pct<=10)r.inPlan++;
    else if(x.state==='balanced')r.dirOk++;
    else{r.off++;if(x.above)r.offAbove++;else r.offBelow++;}
    // Bester Tag: kleinste Abweichung vom Ziel; bei Gleichstand der fruehere.
    if(!r.best||x.pct<r.best.pct)r.best=x;
    // Schwaechster Tag: groesste Abweichung unter den Tagen abseits des Ziels.
    if(x.state==='over'&&(!r.worst||x.pct>r.worst.pct))r.worst=x;
    sum.kcal+=x.kcal;sum.net+=x.net;sum.burned+=x.counted;sum.p+=x.protein;sum.c+=x.carbs;sum.f+=x.fat;
  });
  if(n){
    r.avgKcal=Math.round(sum.kcal/n);r.avgNet=Math.round(sum.net/n);r.avgBurned=Math.round(sum.burned/n);
    r.avgP=Math.round(sum.p/n);r.avgC=Math.round(sum.c/n);r.avgF=Math.round(sum.f/n);
  }
  var mt=getMacroTargets()||{};
  r.mt={protein:+mt.protein||0,carbs:+mt.carbs||0,fat:+mt.fat||0};
  r.stP=_macroStatus(r.avgP,r.mt.protein,true);
  r.stC=_macroStatus(r.avgC,r.mt.carbs,false);
  r.stF=_macroStatus(r.avgF,r.mt.fat,false);
  // Gewicht: Eintraege im Fenster; fuer g/kg der letzte davon, sonst das
  // neueste bekannte Gewicht.
  var wl=S.weightLog||{};
  var wd=Object.keys(wl).filter(function(d){return d>=r.from&&d<=r.to&&+wl[d]>0;}).sort();
  if(wd.length>=2){
    r.weightFrom=+wl[wd[0]];r.weightTo=+wl[wd[wd.length-1]];
    r.weightDelta=Math.round((r.weightTo-r.weightFrom)*10)/10;
  }
  r.kg=wd.length?+wl[wd[wd.length-1]]:(+_latestWeight()||0);
  if(r.kg>0&&n)r.proteinPerKg=Math.round(r.avgP/r.kg*10)/10;
  // Zielrichtung nur fuer den Text – dieselbe Regel wie _kcalAmpel.
  if(S.goalWeight&&S.weight){
    if(S.goalWeight<S.weight-0.5)r.dir='lose';
    else if(S.goalWeight>S.weight+0.5)r.dir='gain';
  }
  r.advice=_weekAdvice(r);
  return r;
}

function _num1(x){return String(Math.round(x*10)/10).replace('.',',');}
function _signed(x,unit){return(x>0?'+':x<0?'−':'±')+_num1(Math.abs(x))+unit;}
function _devText(x){return x.pct?x.pct+' % '+(x.above?'über':'unter')+' Ziel':'genau im Ziel';}
function _shortDate(d){var p=d.split('-');return p[2]+'.'+p[1]+'.';}

function _tage(n){return n===1?'1 Tag':n+' Tagen';}
function _weekAdvice(r){
  if(!r.tracked)return '';
  if(r.stP==='rot')
    return 'Protein im Schnitt '+r.avgP+' g von '+r.mt.protein+' g – eiweißreiche Lebensmittel einplanen.';
  // Die Zahlen je Richtung getrennt: Beim Halten koennen beide vorkommen, und
  // „an 4 Tagen darueber" waere bei 2 darueber und 2 darunter falsch.
  if(r.off*2>r.tracked)
    return 'Näher an dein Ziel von '+r.goal+' kcal – an '
      +(r.offAbove&&r.offBelow?_tage(r.offAbove)+' lagst du mehr als 10 % darüber, an '+r.offBelow+' darunter'
        :_tage(r.off)+' lagst du mehr als 10 % '+(r.offAbove?'darüber':'darunter'))+'.';
  if(r.tracked<4)
    return 'An mehr Tagen eintragen, damit der Bericht aussagekräftig ist.';
  // Hier liegt hoechstens die Haelfte abseits – „an den meisten Tagen" waere
  // bei genau der Haelfte falsch, deshalb die Zahl.
  return 'Weiter so – deine Kalorien lagen an '+(r.tracked-r.off)+' von '+r.tracked+' Tagen im Rahmen deines Ziels.';
}

var _ST_COL={gruen:'#2d7d52',gelb:'#f07700',rot:'#c62828'};
function _dot(st){return st?'<span style="color:'+_ST_COL[st]+';">●</span> ':'';}

function renderWeekReport(){
  var el=document.getElementById('weekReportText');
  if(!el)return;
  var r=weekStats();
  // Nur #weekReportText. #weekReportAi und #weekReportSource gehoeren dem
  // KI-Teil und bleiben stehen, wenn das Panel neu gerendert wird (Wiegen,
  // Tab-Wechsel) – sonst waere eine bezahlte Ausformulierung sofort weg.
  if(!r.tracked){
    el.innerHTML='<div>Noch keine eingetragenen Tage in den letzten 7 Tagen.'+(REPORT_INCLUDE_TODAY?'':' Der heutige Tag zählt, sobald er vorbei ist.')+'</div>';
    return;
  }
  var dirName=r.dir==='lose'?'Abnehmen':r.dir==='gain'?'Zunehmen':'Halten';
  var L=[];
  L.push('<div style="font-size:11px;">'+esc(_shortDate(r.from))+'–'+esc(_shortDate(r.to))+' · '+esc(r.tracked)+' von '+esc(r.span)+' Tagen eingetragen'+(REPORT_INCLUDE_TODAY?'':' · heute zählt nicht')+'</div>');
  var kc='An '+esc(r.inPlan)+' von '+esc(r.tracked)+' Tagen im Plan (±10 %)';
  if(r.dirOk)kc+=', an '+esc(r.dirOk)+' weiteren passend zu deinem Ziel ('+esc(dirName)+')';
  L.push('– '+kc+'.');
  var avgDev=Math.round((r.avgNet-r.goal)/r.goal*100);
  L.push('– Ø '+esc(r.avgNet)+' kcal/Tag netto'+(r.avgBurned?' ('+esc(r.avgKcal)+' gegessen − '+esc(r.avgBurned)+' Sport)':'')
    +' · Ziel '+esc(r.goal)+' kcal ('+esc(_signed(avgDev,' %'))+')');
  if(r.best&&r.tracked>=2)
    L.push('– Bester Tag: '+esc(fmtDate(r.best.date))+' ('+esc(Math.round(r.best.net))+' kcal, '+esc(_devText(r.best))+')');
  if(r.worst&&r.worst!==r.best)
    L.push('– Schwächster Tag: '+esc(fmtDate(r.worst.date))+' ('+esc(Math.round(r.worst.net))+' kcal, '+esc(_devText(r.worst))+')');
  var pl='– '+_dot(r.stP)+'Protein Ø '+esc(r.avgP)+' g';
  if(r.mt.protein>0)pl+=' = '+esc(Math.round(r.avgP/r.mt.protein*100))+' % deines Ziels von '+esc(r.mt.protein)+' g';
  if(r.proteinPerKg!=null)pl+=' · '+esc(_num1(r.proteinPerKg))+' g je kg Körpergewicht';
  L.push(pl);
  var cf='– '+_dot(r.stC)+'Kohlenhydrate Ø '+esc(r.avgC)+' g'+(r.mt.carbs>0?' (Ziel '+esc(r.mt.carbs)+' g)':'')
    +' · '+_dot(r.stF)+'Fett Ø '+esc(r.avgF)+' g'+(r.mt.fat>0?' (Ziel '+esc(r.mt.fat)+' g)':'');
  L.push(cf);
  if(r.weightDelta!=null)
    L.push('– Gewicht: '+esc(_signed(r.weightDelta,' kg'))+' in dieser Woche ('+esc(_num1(r.weightFrom))+' → '+esc(_num1(r.weightTo))+' kg)');
  L.push('<div style="margin-top:6px;color:var(--tx);"><b>Empfehlung:</b> '+esc(r.advice)+'</div>');
  el.innerHTML=L.map(function(x){return x.charAt(0)==='<'?x:'<div>'+x+'</div>';}).join('');
}

// ── KI-Ausformulierung (optional) ──
// Die KI rechnet nichts: Sie bekommt die Kennzahlen aus weekStats() und
// formuliert sie nur aus. Ergebnis und Quellen-Badge stehen unter dem Bericht.
var _WR_LABEL='✨ Ausformulieren';
function requestWeekReport(){
  if(!canUseAi()){showAiUnavailable();return;}
  var btn=document.getElementById('weekReportBtn');
  var r=weekStats();
  if(!r.tracked){showToast('Keine Daten dieser Woche');return;}
  var aiEl=document.getElementById('weekReportAi');
  var srcEl=document.getElementById('weekReportSource');
  if(aiEl)aiEl.textContent='';
  if(srcEl)srcEl.innerHTML='';
  if(btn){btn.disabled=true;btn.textContent='⏳...';}
  var allPrefs=(S.dietPrefs||[]).concat(S.dietFree?[S.dietFree]:[]);
  var dirText=r.dir==='lose'?'Abnehmen (Kaloriendefizit)':r.dir==='gain'?'Zunehmen (Kalorienüberschuss)':'Gewicht halten';
  var stName={gruen:'im Ziel',gelb:'knapp daneben',rot:'deutlich daneben'};
  var lines=r.rows.map(function(x){
    return fmtDate(x.date)+': '+Math.round(x.net)+' kcal netto'+(x.burned?' ('+Math.round(x.kcal)+' gegessen, '+Math.round(x.burned)+' Sport)':'')
      +', '+x.pct+' % '+(x.above?'über':'unter')+' Ziel, P '+Math.round(x.protein)+'g, F '+Math.round(x.fat)+'g, C '+Math.round(x.carbs)+'g';
  });
  var facts=[
    'Zeitraum: letzte 7 '+(REPORT_INCLUDE_TODAY?'Tage inklusive heute':'abgeschlossene Tage')+', davon '+r.tracked+' eingetragen',
    'Kalorienziel: '+r.goal+' kcal/Tag, Zielrichtung: '+dirText,
    'Im Plan (±10 %): '+r.inPlan+' Tage; weitere passend zur Zielrichtung: '+r.dirOk+'; abseits des Ziels: '+r.off,
    'Durchschnitt: '+r.avgNet+' kcal/Tag netto ('+r.avgKcal+' gegessen, '+r.avgBurned+' Sport)',
    r.best&&r.tracked>=2?'Bester Tag: '+fmtDate(r.best.date)+' ('+r.best.pct+' % Abweichung)':'',
    r.worst&&r.worst!==r.best?'Schwächster Tag: '+fmtDate(r.worst.date)+' ('+r.worst.pct+' % Abweichung)':'',
    'Protein Ø '+r.avgP+' g'+(r.mt.protein>0?' von '+r.mt.protein+' g Ziel ('+stName[r.stP]+')':'')+(r.proteinPerKg!=null?', '+r.proteinPerKg+' g je kg':''),
    'Kohlenhydrate Ø '+r.avgC+' g'+(r.mt.carbs>0?' von '+r.mt.carbs+' g ('+stName[r.stC]+')':'')+', Fett Ø '+r.avgF+' g'+(r.mt.fat>0?' von '+r.mt.fat+' g ('+stName[r.stF]+')':''),
    r.weightDelta!=null?'Gewichtsänderung: '+r.weightDelta+' kg ('+r.weightFrom+' → '+r.weightTo+' kg)':'',
    allPrefs.length?'Ernährungspräferenzen: '+allPrefs.join(', '):'',
    'Empfehlung der App: '+r.advice
  ].filter(Boolean);
  var prompt='Formuliere diesen deutschen Wochenbericht zur Ernährung aus.\n'
    +'Format: 3–5 Stichpunkte (je 1 kurzer Satz, mit „–" einleiten), danach „Empfehlung für nächste Woche:" mit 1–2 Sätzen, die die Empfehlung der App aufgreifen. Kein einleitender Satz.\n'
    +'Nutze ausschließlich die folgenden Kennzahlen. Rechne nichts neu, erfinde keine Zahlen und nenne keine eigenen Richtwerte.\n'
    +'Kennzahlen:\n'+facts.join('\n')+'\n'
    +'Tage:\n'+lines.join('\n');
  callClaude('claude-haiku-4-5',[{type:'text',text:prompt}],400,
    function(text){
      var a=document.getElementById('weekReportAi');
      if(a)a.textContent=text.trim();
      var s=document.getElementById('weekReportSource');
      if(s)s.innerHTML=aiSourceBadgeHtml();
      if(btn){btn.disabled=false;btn.textContent=_WR_LABEL;}
    },
    function(err){if(btn){btn.disabled=false;btn.textContent=_WR_LABEL;}showToast('Fehler: '+err);}
  );
}

// ── Zielüberprüfung ──
// Ob ein Ziel erreicht ist, haengt an seiner Richtung: 60 → 70 kg ist bei 60 kg
// nicht erreicht, 80 → 70 kg bei 70,4 kg schon (#247). Die Richtung ergibt sich
// aus dem Gewicht beim Setzen des Ziels – S.weight taugt dafuer nicht, es wird
// bei jedem Wiegen ueberschrieben. Darum S.goalStart={w,key}: w ist das Gewicht
// beim Setzen, key das Ziel, zu dem es gehoert (goalWeight|goalDate). Passt key
// nicht zum aktuellen Ziel oder fehlt goalStart (Altdaten; ein Geraet mit
// aelterer App-Version hat das Ziel geaendert, ohne goalStart anzufassen), wird
// es einmalig aus dem aktuellen Gewicht nachgetragen. Fuer ein noch offenes Ziel
// ist das die richtige Richtung. Einzige Fehlerart: Wer vor dem Update schon
// unter sein Abnahmeziel gerutscht war, bekommt keinen Glueckwunsch – harmloser
// als ein falscher.
function _goalKey(){return S.goalWeight+'|'+S.goalDate;}
// Neuestes Gewicht als Kommawert: weightLog statt S.weight, denn saveSettings
// speichert S.weight per parseInt (69,6 → 69). Weicht S.weight schon in der
// ganzen Zahl ab, ist es in den Einstellungen neu eingetragen worden und gilt.
function _latestWeight(){
  var wl=S.weightLog||{},ks=Object.keys(wl).sort(),lw=ks.length?+wl[ks[ks.length-1]]:0;
  if(lw&&(!S.weight||Math.floor(lw)===Math.floor(S.weight)))return lw;
  return S.weight||lw||0;
}
function _goalReached(cur,goal,start){
  if(goal>start+0.5)return cur>=goal-0.5;   // Zunahme
  if(goal<start-0.5)return cur<=goal+0.5;   // Abnahme (wie vor #247)
  return Math.abs(cur-goal)<=0.5;           // Halten
}
// Aus saveSettings, wenn sich Zielgewicht oder Zieldatum geaendert haben: neuer
// Start, und der Glueckwunsch ist fuer das neue Ziel wieder offen (einmal je Ziel).
function setGoalStart(){
  S.goalStart={w:_latestWeight(),key:_goalKey()};
  S.goalAchievedShown='';
}
function checkGoalAchieved(){
  if(!S.goalWeight||!S.goalDate)return;
  var today2=today();
  var gs=S.goalStart,key=_goalKey();
  if(!gs||gs.key!==key||!gs.w){
    var w0=_latestWeight();
    if(!w0)return; // ohne Gewicht keine Richtung – und auch vorher keine Meldung
    // Ein Start zu einem ANDEREN Ziel heisst: das Ziel wurde anderswo geaendert.
    // Dann ist es ein neues Ziel, und sein Glueckwunsch ist noch offen.
    if(gs&&gs.key&&gs.key!==key)S.goalAchievedShown='';
    S.goalStart=gs={w:w0,key:key};saveS();
  }
  // Zieldatum erreicht?
  if(S.goalDate<=today2&&!S.goalAchievedShown){
    // Kommawert wie beim Start: S.weight kann per parseInt gekuerzt sein
    // (69,6 → 69) und verfehlte dann ein Zunahmeziel knapp.
    var currentW=S.weightLog&&S.weightLog[today2]||_latestWeight();
    if(currentW&&_goalReached(currentW,S.goalWeight,gs.w)){
      S.goalAchievedShown=today2;saveS();
      setTimeout(function(){showToast('🎉 Zielgewicht erreicht! Neues Ziel setzen?');},1000);
    }
  }
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
// Intern bleiben: renderWeightChart, renderWeekBars, renderWeekReport, weekStats, dayTotals
window.NTStats={
  logWeight:logWeight,
  switchTab:switchStatsTab,
  setRange:setStatsRange,
  weekReport:requestWeekReport,
  checkGoal:checkGoalAchieved,
  setGoalStart:setGoalStart,
  renderPanel:renderStatsPanel
};
})();
