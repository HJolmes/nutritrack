// NutriTrack – Baby: Verlauf, Beikost-Übersicht und Arzt-Bericht (Reiter im
// Baby-Tagebuch, v0.263). Klassisches Script, exportiert window.NTBabyWeek.
// Nutzt NTBaby (js/baby.js), NTGrowth (js/baby-growth.js) und die globalen
// Helfer aus index.html (S, esc, openOv, showToast).
//
// Rein lesend: Hier wird nichts gespeichert. Alles kommt aus S.babyLog.
(function(){
'use strict';

var _range=7;
var WD=['So','Mo','Di','Mi','Do','Fr','Sa'];

function pad(n){return n<10?'0'+n:''+n;}
function days(n){
  var t=NTBaby.today(),out=[];
  for(var i=0;i<n;i++)out.push(NTBaby.addDayKey(t,-i));
  return out;
}
function dLabel(k){
  var p=k.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]);
  return WD[d.getDay()]+' '+p[2]+'.'+p[1]+'.';
}
function dFull(k){var p=k.split('-');return p[2]+'.'+p[1]+'.'+p[0];}
function hhmm(ts){var d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes());}
function hasData(k){return NTBaby.logRO(k).length>0||NTBaby.summary(k).sleepMin>0;}

function dayStats(k){
  var s=NTBaby.summary(k);
  return {k:k,s:s,feeds:s.breast+s.bottle+s.solid,diaper:s.diaper,sleep:s.sleepMin};
}

function setRange(n){_range=(n===14)?14:7;render();}

function render(){
  var box=document.getElementById('babyWeekBody');
  if(!box)return;
  document.querySelectorAll('#babyWeekRange [data-wr]').forEach(function(b){
    b.classList.toggle('act',+b.getAttribute('data-wr')===_range);
  });
  var rows=days(_range).map(dayStats);
  var used=rows.filter(function(r){return hasData(r.k);});
  if(!used.length){
    box.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">In diesem Zeitraum ist noch nichts eingetragen.</div>';
    renderSolids();
    return;
  }
  var mf=Math.max.apply(null,rows.map(function(r){return r.feeds;}).concat([1]));
  var md=Math.max.apply(null,rows.map(function(r){return r.diaper;}).concat([1]));
  var ms=Math.max.apply(null,rows.map(function(r){return r.sleep;}).concat([60]));
  var avg=function(f){return used.reduce(function(a,r){return a+f(r);},0)/used.length;};
  var h='<div class="bby-avg">Ø je Tag ('+used.length+' Tage mit Einträgen): <b>'
    +NTBaby.fmtNum(avg(function(r){return r.feeds;}),1)+'</b> Mahlzeiten · <b>'
    +NTBaby.fmtNum(avg(function(r){return r.diaper;}),1)+'</b> Windeln · <b>'
    +NTBaby.fmtDur(Math.round(avg(function(r){return r.sleep;})))+'</b> Schlaf</div>';
  h+='<div class="bby-wk"><div class="bby-wk-h"><span></span><span>🍽 Mahlzeiten</span><span>👶 Windeln</span><span>😴 Schlaf</span></div>';
  rows.forEach(function(r){
    var s=r.s,empty=!hasData(r.k);
    var feedTip=[];
    if(s.breast)feedTip.push(s.breast+'🤱');
    if(s.bottle)feedTip.push(s.bottle+'🍼');
    if(s.solid)feedTip.push(s.solid+'🥣');
    h+='<div class="bby-wk-r'+(empty?' empty':'')+'">'
      +'<span class="bby-wk-d">'+dLabel(r.k)+'</span>'
      +cell(r.feeds,mf,feedTip.join(' ')||'–')
      +cell(r.diaper,md,r.diaper?(s.pee+'💧 '+s.poo+'💩'):'–')
      +cell(r.sleep,ms,r.sleep?shortDur(r.sleep):'–')
      +'</div>';
  });
  h+='</div>';
  var ml=rows.reduce(function(a,r){return a+r.s.ml;},0),pm=rows.reduce(function(a,r){return a+r.s.pumpMl;},0);
  if(ml||pm)h+='<div style="font-size:11px;color:var(--mu);margin-top:6px;">'
    +(ml?'Flasche gesamt '+ml+' ml':'')+(ml&&pm?' · ':'')+(pm?'abgepumpt gesamt '+pm+' ml':'')+'</div>';
  box.innerHTML=h;
  renderSolids();
}
function shortDur(min){var h=Math.floor(min/60),m=min%60;return h?(h+' h'+(m?' '+m:'')):(m+' Min.');}
function cell(v,max,txt){
  var w=max?Math.round(v/max*100):0;
  return '<span class="bby-wk-c"><span class="bby-bar" style="width:'+w+'%;"></span><span class="bby-wk-t">'+txt+'</span></span>';
}

// ── Beikost: welche Lebensmittel seit wann, mit welcher Reaktion ──
function solidsOverview(){
  var by={};
  Object.keys(S.babyLog||{}).sort().forEach(function(d){
    NTBaby.logRO(d).forEach(function(e){
      if(e.t!=='solid'||!e.food)return;
      var k=e.food.trim().toLowerCase();
      var f=by[k]||(by[k]={name:e.food.trim(),first:d,n:0,reacts:[]});
      f.n++;
      if(e.react&&e.react!=='none')f.reacts.push({d:d,r:e.react});
    });
  });
  return Object.keys(by).map(function(k){return by[k];})
    .sort(function(a,b){return a.first<b.first?1:a.first>b.first?-1:0;});
}
function renderSolids(){
  var box=document.getElementById('babySolidBody');
  if(!box)return;
  var fs=solidsOverview();
  if(!fs.length){box.innerHTML='';return;}
  var R=NTBaby.REACTION;
  box.innerHTML='<div class="bby-sec">🥣 Beikost – eingeführte Lebensmittel ('+fs.length+')</div>'
    +fs.map(function(f){
      var r=f.reacts.length
        ?'<span style="color:#c62828;font-weight:700;"> · ⚠️ '+f.reacts.map(function(x){return esc(R[x.r]||'')+' ('+dFull(x.d).slice(0,6)+')';}).join(', ')+'</span>'
        :'';
      return '<div class="bby-solid"><b>'+esc(f.name)+'</b> <span style="color:var(--mu);">seit '+dFull(f.first).slice(0,6)+' · '+f.n+'×</span>'+r+'</div>';
    }).join('');
}

// ── Arzt-Bericht: die letzten 7 Tage als Text zum Teilen ──
function reportText(){
  var ks=days(7),nm=(S.baby&&S.baby.name)||'Baby';
  var L=[];
  L.push('Baby-Bericht – '+nm);
  if(S.baby&&S.baby.birth)L.push('Geboren am '+dFull(S.baby.birth)+(NTBaby.ageText()?' ('+NTBaby.ageText()+')':''));
  L.push('Zeitraum: '+dFull(ks[ks.length-1])+' – '+dFull(ks[0]));
  L.push('');
  // Letzte Messung
  var gm=null;
  Object.keys(S.babyLog||{}).sort().forEach(function(d){
    NTBaby.logRO(d).forEach(function(e){if(e.t==='growth')gm={d:d,e:e};});
  });
  if(gm){
    L.push('Letzte Messung ('+dFull(gm.d)+'): '+NTBaby.entryTitle(gm.e).replace(/^Messung · /,'')
      +(window.NTGrowth&&NTGrowth.pctText(gm.e)?' – WHO: '+NTGrowth.pctText(gm.e):''));
    L.push('');
  }
  L.push('Pro Tag:');
  ks.slice().reverse().forEach(function(k){
    var s=NTBaby.summary(k),p=[];
    if(s.breast)p.push(s.breast+'× gestillt'+(s.breastMin?' ('+s.breastMin+' Min.)':''));
    if(s.bottle)p.push(s.bottle+'× Flasche ('+s.ml+' ml)');
    if(s.solid)p.push(s.solid+'× Beikost');
    if(s.diaper)p.push(s.diaper+' Windeln ('+s.pee+'× nass, '+s.poo+'× Stuhl)');
    if(s.sleepMin)p.push('Schlaf '+NTBaby.fmtDur(s.sleepMin));
    L.push('- '+dLabel(k)+': '+(p.join(', ')||'keine Einträge'));
  });
  var sec=function(title,items){if(items.length){L.push('');L.push(title);items.forEach(function(x){L.push('- '+x);});}};
  var temps=[],meds=[],stool=[],reacts=[],notes=[];
  ks.slice().reverse().forEach(function(k){
    NTBaby.logRO(k).slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);}).forEach(function(e){
      var at=dLabel(k)+' '+hhmm(e.ts);
      if(e.t==='temp')temps.push(at+': '+NTBaby.fmtTemp(e.c)+' °C'+(e.site?' ('+e.site+')':'')+(NTBaby.isFever(e.c)?' – Fieber':''));
      else if(e.t==='med')meds.push(at+': '+NTBaby.entryTitle(e));
      else if(e.t==='diaper'&&e.color&&/weiß|schwarz|blutig/.test(e.color))stool.push(at+': Stuhl '+e.color+(e.cons?', '+e.cons:''));
      else if(e.t==='solid'&&e.react&&e.react!=='none')reacts.push(at+': '+e.food+' → '+(NTBaby.REACTION[e.react]||''));
      else if(e.t==='note')notes.push(at+': '+(e.text||''));
      if(e.t!=='note'&&e.note)notes.push(at+' ('+((NTBaby.TYPES[e.t]||{}).label||'')+'): '+e.note);
    });
  });
  sec('Temperatur:',temps);
  sec('Medikamente:',meds);
  sec('Auffälliger Stuhl:',stool);
  sec('Reaktionen auf Beikost:',reacts);
  sec('Notizen:',notes);
  // Offene Fragen an die Hebamme (js/baby-midwife.js) – aelteste zuerst.
  if(window.NTMidwife)sec('Offene Fragen:',NTMidwife.list().filter(function(q){return !q.done;})
    .sort(function(a,b){return (a.at||0)-(b.at||0);}).map(function(q){return q.q;}));
  L.push('');
  L.push('Erstellt mit NutriTrack am '+dFull(NTBaby.today())+'. Eigene Aufzeichnungen der Eltern, keine Diagnose.');
  return L.join('\n');
}
function openReport(){
  var ta=document.getElementById('babyReportText');
  if(ta)ta.value=reportText();
  openOv('babyReportOv');
}
function shareReport(){
  var txt=(document.getElementById('babyReportText')||{}).value||reportText();
  if(navigator.share){
    navigator.share({title:'Baby-Bericht',text:txt}).catch(function(){});
    return;
  }
  copyReport();
}
function copyReport(){
  var ta=document.getElementById('babyReportText');
  var txt=(ta&&ta.value)||reportText();
  var done=function(){showToast('Bericht kopiert ✓');};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done,function(){fallbackCopy(ta);});
  }else fallbackCopy(ta);
}
function fallbackCopy(ta){
  if(!ta)return;
  ta.select();
  try{document.execCommand('copy');showToast('Bericht kopiert ✓');}catch(e){showToast('Bitte den Text markieren und kopieren');}
}

window.NTBabyWeek={render:render,setRange:setRange,openReport:openReport,shareReport:shareReport,copyReport:copyReport,reportText:reportText};
})();
