// @ts-check
// NutriTrack – Wochenplan & Rezeptquellen (v0.244)
// Klassisches Script, kein Modul. Exportiert window.NTPlan und greift direkt auf
// die globalen Helfer aus index.html/picker.js zu (S, saveS, saveX, recipes,
// getDay, calcM, ingTotal, scaleNutrients, totalStr, lookupNutrients, callClaude,
// openOv, closeOv, esc, showToast). Rezepte anlegen und bearbeiten laeuft ueber
// das Kochbuch (NTBook.editDraft), angezeigt werden sie dort (NTBook.detail).
//
// Der Plan liegt in S.mealPlan, datumsgenau statt nach Wochentag:
//   S.mealPlan['2026-09-22'] = {breakfast:[{r:'<recipeId>',p:1}], lunch:[], …}
// Datumsgenau, weil ein Plan sonst beim Blaettern in die naechste Woche
// mitwandern wuerde und „was habe ich letzte Woche gekocht" nicht mehr
// beantwortbar waere. S.planApplied merkt, welcher Tag schon im Tagebuch steht.
//
// Eigener Schluessel, NICHT in S.days — sonst wuerde compressOldDays() den Plan
// zusammen mit den Mahlzeiten wegraeumen. S wird komplett gesichert
// (backupState), der Plan ist damit automatisch Teil jedes Backups.
(function(){
'use strict';

var SLOTS=[
  {id:'breakfast',ic:'🌅',label:'Frühstück'},
  {id:'lunch',    ic:'☀️',label:'Mittagessen'},
  {id:'dinner',   ic:'🌙',label:'Abendessen'},
  {id:'snack',    ic:'🍎',label:'Snack'}
];
var DOW=['Mo','Di','Mi','Do','Fr','Sa','So'];
var MON=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// ── Datum ─────────────────────────────────────────────────────────────────
function iso(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function parse(s){var p=String(s||'').split('-');return new Date(+p[0],(+p[1])-1,+p[2]);}
// Montag der Woche, in der `d` liegt (ISO: Woche beginnt Montag).
function monday(d){
  var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  var off=(x.getDay()+6)%7;
  x.setDate(x.getDate()-off);
  return x;
}
function addDays(d,n){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function shortDate(d){return d.getDate()+'. '+MON[d.getMonth()];}

var _week=null; // Montag der angezeigten Woche
function weekStart(){
  if(!_week)_week=monday(S.currentDate?parse(S.currentDate):new Date());
  return _week;
}

// ── Plan-Zugriff ──────────────────────────────────────────────────────────
function planFor(date,create){
  if(!S.mealPlan||typeof S.mealPlan!=='object')S.mealPlan={};
  var p=S.mealPlan[date];
  if(!p&&!create)return null;
  if(!p){p={breakfast:[],lunch:[],dinner:[],snack:[]};S.mealPlan[date]=p;}
  SLOTS.forEach(function(s){if(!Array.isArray(p[s.id]))p[s.id]=[];});
  return p;
}
function slotItems(date,slot){var p=planFor(date,false);return(p&&p[slot])||[];}
function rec(id){for(var i=0;i<recipes.length;i++)if(recipes[i].id===id)return recipes[i];return null;}

// ── Revisionen (v0.247) ───────────────────────────────────────────────────
// Die Einheit des Abgleichs ist EIN TAG, nicht ein einzelner Eintrag: Ein Plan
// ist eine kurze Liste je Tag, und zwei Menschen, die denselben Tag im selben
// Moment umplanen, sind der seltene Fall. Der spaetere Schreiber gewinnt den
// ganzen Tag — das ist erklaerbar, ein halb gemischter Tag waere es nicht.
var _lastRev=0;
function nextRev(){
  var t=Date.now();
  if(t<=_lastRev)t=_lastRev+1;
  _lastRev=t;
  return t;
}
function touch(date){
  var p=planFor(date,true);
  p.rev=nextRev();
  return p;
}
function planTomb(){
  if(!S.planTomb||typeof S.planTomb!=='object')S.planTomb={};
  return S.planTomb;
}

// ── Ein Planeintrag ist ein Verweis {r,p} plus optionalem Abzug `s` ────────
// Der Abzug entsteht beim Teilen: Die Gegenseite hat das Rezept nicht in ihrer
// Bibliothek, und ein blosser Verweis waere drueben eine leere Zeile. Er traegt
// genau das, was Anzeige, Einkaufszettel und Tagebuch brauchen.
// Zutaten, wie sie gegessen werden: angepasst an die eigenen Angaben
// (NTBook.view), mit o=1 im Planeintrag die Fassung der Quelle.
function viewOf(r,orig){return (window.NTBook&&NTBook.view)?NTBook.view(r,!!orig):{name:r.name,ingredients:r.ingredients||[]};}
function viewIngs(r,orig){return viewOf(r,orig).ingredients;}
function snapOf(recipeId,orig){
  var r=rec(recipeId);
  if(!r)return null;
  var v=viewOf(r,orig);
  return {n:v.name,em:r.emoji||'📋',i:v.ingredients.map(function(g){
    return {n:g.name,em:g.emoji||'🍽',a:g.amount,p:g.per100};
  })};
}
// Was ein Planeintrag im Bild ist: das eigene Rezept, sonst der mitgereiste
// Abzug, sonst nichts — dann steht „Rezept gelöscht ✕" statt eines Absturzes.
function resolve(it){
  if(!it)return null;
  var r=rec(it.r);
  if(r){var v=viewOf(r,it.o);return {name:v.name,emoji:r.emoji||'📋',ingredients:v.ingredients,own:true};}
  if(it.s)return {name:it.s.n,emoji:safeEmoji(it.s.em,'📋'),own:false,hist:!!it.h,
    ingredients:(it.s.i||[]).map(function(g){return {name:g.n,emoji:safeEmoji(g.em,'🍽'),amount:g.a,per100:g.p};})};
  return null;
}
function itemKcal(it){if(isNote(it))return 0;var r=resolve(it);if(!r)return 0;return ingTotal(r.ingredients).kcal*(it.p||1);}
function dayKcal(date){
  var p=planFor(date,false);if(!p)return 0;
  var sum=0;
  SLOTS.forEach(function(s){(p[s.id]||[]).forEach(function(it){sum+=itemKcal(it);});});
  return sum;
}
function dayCount(date){
  var p=planFor(date,false);if(!p)return 0;
  var n=0;SLOTS.forEach(function(s){n+=(p[s.id]||[]).length;});return n;
}
function isEmptyPlan(date){return dayCount(date)===0;}
// Gibt es etwas, das toDiary() eintragen wuerde? Das ist jedes aufloesbare
// Rezept – auch eines mit 0 kcal (Zutaten ohne Naehrwerte) –, aber keine Notiz
// und kein geloeschtes Rezept (#247). Die kcal-Summe taugt dafuer nicht.
function hasDiaryItems(date){
  var p=planFor(date,false);if(!p)return false;
  return SLOTS.some(function(s){return (p[s.id]||[]).some(function(it){return !isNote(it)&&!!resolve(it);});});
}

// ── Freitext statt Rezept (v0.260) ────────────────────────────────
// Ein Planeintrag muss kein Rezept sein. „Pizza bestellen“, „Reste“, „bei Oma
// essen“ stehen in einem Wochenplan genauso oft wie ein Rezept — und wer dafuer
// erst ein Rezept anlegen muss, plant es gar nicht erst ein. Eine Notiz ist
// `{x:'<Text>'}`: kein Verweis, keine Zutaten, 0 kcal. Sie laesst sich spaeter
// mit einem Rezept hinterlegen; dann wird aus `{x}` ein `{r}`.
function isNote(it){return !!(it&&it.x&&!it.r&&!it.s);}
function noteCount(date){
  var p=planFor(date,false);if(!p)return 0;
  var n=0;SLOTS.forEach(function(s){(p[s.id]||[]).forEach(function(it){if(isNote(it))n++;});});
  return n;
}
function goalKcal(){return Math.max(0,Math.round(S.goal||0));}

// ── Namen vergleichbar machen ───────────────────────────────────
// Reicht fuer die eine Frage „steht das schon in der Bibliothek?“ — keine
// Fuzzy-Suche, nur Kleinschreibung, aufgeloeste Umlaute, Satzzeichen weg.
function norm(x){
  return String(x||'').toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}
function words(x){return norm(x).split(' ').filter(function(w){return w.length>2;});}
// Zeichen-Bigramme (Dice). Der Wortvergleich allein sieht „Spagetti Bolognese“
// und „Spaghetti Bolognese“ als zwei Drittel fremd — ein Buchstabe Unterschied
// macht aus einem Wort ein anderes. Gemessen an Bigrammen sind es 0,91.
function dice(a,b){
  a=norm(a);b=norm(b);
  if(!a||!b)return 0;
  if(a===b)return 1;
  if(a.length<2||b.length<2)return 0;
  var m={},i,g,hit=0;
  for(i=0;i<a.length-1;i++){g=a.substr(i,2);m[g]=(m[g]||0)+1;}
  for(i=0;i<b.length-1;i++){g=b.substr(i,2);if(m[g]>0){m[g]--;hit++;}}
  return 2*hit/((a.length-1)+(b.length-1));
}
function jacc(a,b){
  if(!a.length||!b.length)return 0;
  var inA={},uni={},hit=0,seen={};
  a.forEach(function(w){inA[w]=1;uni[w]=1;});
  b.forEach(function(w){uni[w]=1;if(inA[w]&&!seen[w]){hit++;seen[w]=1;}});
  return hit/Object.keys(uni).length;
}
// Das aehnlichste vorhandene Rezept — oder null. Zwei Wege fuehren zum Treffer:
// aehnlicher Name, oder fast dieselben Zutaten unter anderem Namen („Chili“ vs.
// „Chili con Carne“, oder zweimal dasselbe Rezept aus zwei Quellen).
function similarRecipe(name,ings,skipId){
  var nw=words(name);
  var iw=(ings||[]).map(function(g){return norm(g&&(g.name||g.n));}).filter(Boolean);
  var best=null;
  recipes.forEach(function(r){
    if(skipId&&r.id===skipId)return;
    var rn=norm(r.name);
    var ns=(rn&&rn===norm(name))?1:Math.max(jacc(nw,words(r.name)),dice(name,r.name)>=0.8?dice(name,r.name):0);
    var rs=jacc(iw,(r.ingredients||[]).map(function(g){return norm(g.name);}).filter(Boolean));
    if(!(ns>=0.6||(ns>=0.3&&rs>=0.5)||rs>=0.8))return;
    var sc=Math.max(ns,ns*0.5+rs*0.5);
    if(!best||sc>best.score)best={r:r,score:sc,name:ns>=0.6};
  });
  return best;
}
// true = speichern, false = abgebrochen. Ein Hinweis, keine Sperre: zwei
// Varianten desselben Gerichts sind ein legitimer Wunsch.
function confirmNotDuplicate(name,ings,skipId){
  var m=similarRecipe(name,ings,skipId);
  if(!m)return true;
  return confirm('In deinem Kochbuch steht schon „'+m.r.name+'“ ('
    +(m.name?'ähnlicher Name':'fast dieselben Zutaten')+').\n\n„'+name
    +'“ trotzdem zusätzlich anlegen?');
}

// ── Wochenplan-Ansicht ────────────────────────────────────────────────────
function open(date){
  _week=monday(date?parse(date):(S.currentDate?parse(S.currentDate):new Date()));
  render();
  openOv('planOv');
  Sync.run();
  Sync.startPoll(function(){return isPlanOpen();});
}
function close(){Sync.stopPoll();closeOv('planOv');}
function isPlanOpen(){var e=document.getElementById('planOv');return !!(e&&e.classList.contains('open'));}
function shiftWeek(n){_week=addDays(weekStart(),n*7);render();}

function render(){
  if(!document.getElementById('planOv'))return;
  var mo=weekStart(),su=addDays(mo,6);
  var lbl=document.getElementById('planWeekLabel');
  if(lbl)lbl.textContent='KW '+isoWeek(mo)+' · '+shortDate(mo)+' – '+shortDate(su);
  var sub=document.getElementById('planOvSub');
  var total=0,filled=0;
  for(var i=0;i<7;i++){var d=iso(addDays(mo,i));total+=dayKcal(d);if(!isEmptyPlan(d))filled++;}
  var goal=goalKcal();
  if(sub){
    if(!filled)sub.textContent='Noch nichts geplant';
    else sub.textContent=filled+' von 7 Tagen geplant · '+Math.round(total)+' kcal'
      +(goal?(' · Ziel '+(goal*filled)+' kcal'):'');
  }

  var el=document.getElementById('planDays');if(!el)return;
  var weekEmpty=true;
  for(var e=0;e<7;e++)if(!isEmptyPlan(iso(addDays(mo,e)))){weekEmpty=false;break;}
  if(!recipes.length&&weekEmpty){
    el.innerHTML='<div style="background:var(--gl);border:1.5px dashed var(--g3);border-radius:14px;padding:16px;text-align:center;">'
      +'<div style="font-size:26px;">📋</div>'
      +'<div style="font-weight:700;font-size:14px;margin-top:4px;">Noch keine Rezepte</div>'
      +'<div style="font-size:12px;color:var(--mu);line-height:1.5;margin-top:4px;">Ein Wochenplan braucht Rezepte. Leg das erste an — selbst, per Foto aus dem Kochbuch oder über einen Link.</div>'
      +'<button type="button" class="svb" style="margin-top:10px;" onclick="NTPlan.newRecipe()">＋ Neues Rezept</button>'
      +'</div>';
    return;
  }
  var todayIso=(typeof today==='function')?today():iso(new Date());
  var openNotes=0;
  for(var n0=0;n0<7;n0++)openNotes+=noteCount(iso(addDays(mo,n0)));
  var html='';
  // Offene Notizen stehen oben, weil sie sonst untergehen: Sie zaehlen mit
  // 0 kcal und wandern nicht ins Tagebuch — der Plan sieht ohne diesen Hinweis
  // voller aus, als er ist.
  if(openNotes){
    html+='<div class="plan-notehint">📝 <b>'+openNotes+' Eintr'+(openNotes===1?'ag':'äge')+' ohne Rezept.</b> '
      +'Tipp drauf, um ein Rezept zu hinterlegen — bis dahin zählen sie mit 0 kcal und stehen nicht auf dem Einkaufszettel.</div>';
  }
  for(var k=0;k<7;k++){
    var dt=addDays(mo,k),ds=iso(dt),isToday=(ds===todayIso);
    var kc=Math.round(dayKcal(ds));
    var applied=S.planApplied&&S.planApplied[ds];
    // Der Tag wird gegen das Kalorienziel gezeigt, nicht nur als Summe: Ein
    // Wochenplan, dessen Tage 1200 oder 3400 kcal ergeben, hat seinen Zweck
    // verfehlt, und das soll man sehen, ohne nachzurechnen.
    var kcCls='',kcTxt='—';
    if(kc){
      kcTxt=goal?(kc+' / '+goal+' kcal'):(kc+' kcal');
      if(goal)kcCls=(Math.abs(kc-goal)<=goal*0.1)?' is-ok':' is-off';
    }
    html+='<div class="plan-day'+(isToday?' is-today':'')+'">'
      +'<div class="plan-dh">'
        +'<div class="plan-dt">'+DOW[k]+' · '+dt.getDate()+'. '+MON[dt.getMonth()]+(isToday?' <span class="plan-badge">heute</span>':'')+'</div>'
        +'<div class="plan-dk'+kcCls+'">'+kcTxt+'</div>'
      +'</div>';
    SLOTS.forEach(function(s){
      var items=slotItems(ds,s.id);
      html+='<div class="plan-slot">'
        +'<div class="plan-si" title="'+esc(s.label)+'">'+s.ic+'</div>'
        +'<div class="plan-sc">';
      items.forEach(function(it,idx){
        if(isNote(it)){
          html+='<span class="plan-chip is-note" onclick="NTPlan.openItem(\''+ds+'\',\''+s.id+'\','+idx+')">📝 '+esc(it.x)+'</span>';
          return;
        }
        var r=resolve(it);
        if(!r){html+='<span class="plan-chip is-gone" onclick="NTPlan.removeItem(\''+ds+'\',\''+s.id+'\','+idx+')">Rezept gelöscht ✕</span>';return;}
        // Fremdes Rezept (nur als Abzug da): erkennbar, aber gleichwertig nutzbar.
        html+='<span class="plan-chip'+(r.own?'':' is-guest')+'" onclick="NTPlan.openItem(\''+ds+'\',\''+s.id+'\','+idx+')">'
          +esc(r.emoji||'📋')+' '+esc(r.name)+((it.p||1)!==1?' <b>'+(it.p||1)+'×</b>':'')+'</span>';
      });
      html+='<button type="button" class="plan-add" onclick="NTPlan.pick(\''+ds+'\',\''+s.id+'\')">＋</button>'
        +'</div></div>';
    });
    html+='<div class="plan-dact">'
      +'<button type="button" class="plan-act" onclick="NTPlan.toDiary(\''+ds+'\')"'+(hasDiaryItems(ds)?'':' disabled')+'>'+(applied?'✓ im Tagebuch':'→ ins Tagebuch')+'</button>'
      +'<button type="button" class="plan-act" onclick="NTPlan.clearDay(\''+ds+'\')"'+(isEmptyPlan(ds)?' disabled':'')+'>🗑 Tag leeren</button>'
      +'</div>'
      +'</div>';
  }
  el.innerHTML=html;
}

// ── Rezept in einen Slot legen ────────────────────────────────────────────
var _target=null;
function pick(date,slot){
  _target={date:date,slot:slot};_replaceIdx=null;
  var q=document.getElementById('planPickQ');if(q)q.value='';
  var s=SLOTS.filter(function(x){return x.id===slot;})[0];
  var sub=document.getElementById('planPickSub');
  if(sub&&s){var d=parse(date);sub.textContent=DOW[(d.getDay()+6)%7]+' · '+shortDate(d)+' · '+s.label;}
  renderPick();
  openOv('planPickOv');
}
function renderPick(){
  var el=document.getElementById('planPickList');if(!el)return;
  var raw=((document.getElementById('planPickQ')||{}).value||'').trim();
  var q=raw.toLowerCase();
  var list=recipes.filter(function(r){return !q||r.name.toLowerCase().indexOf(q)>=0;});
  // Favoriten des Kochbuchs zuerst, sonst die gewohnte Reihenfolge.
  list=list.filter(function(r){return r.fav;}).concat(list.filter(function(r){return !r.fav;}));
  // Dasselbe Feld, zwei Ausgaenge: Was getippt wurde, laesst sich als Rezept
  // suchen ODER direkt als Notiz einplanen. Ein zweites Eingabefeld daneben
  // haette dieselbe Frage zweimal gestellt.
  var noteRow=raw
    ?('<div class="ri" onclick="NTPlan.addNote()">'
      +'<div style="font-size:22px;">📝</div>'
      +'<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">„'+esc(raw)+'“ als Notiz einplanen</div>'
      +'<div style="font-size:11px;color:var(--mu);">Ohne Rezept — das lässt sich später hinterlegen</div></div>'
      +'<div style="font-size:18px;color:var(--g2);font-weight:900;">＋</div></div>')
    :'';
  if(!list.length){
    el.innerHTML=noteRow
      +'<div style="font-size:13px;color:var(--mu);font-style:italic;text-align:center;padding:20px;">Kein Rezept gefunden</div>';
    return;
  }
  el.innerHTML=noteRow+list.map(function(r){
    var t=ingTotal(r.ingredients||[]);
    return '<div class="ri" onclick="NTPlan.addToSlot(\''+esc(r.id)+'\')">'
      +'<div style="font-size:22px;">'+esc(r.emoji||'📋')+'</div>'
      +'<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">'+(r.fav?'⭐ ':'')+esc(r.name)+'</div>'
      +'<div style="font-size:11px;color:var(--mu);">'+Math.round(t.kcal)+' kcal / Portion · '+(r.ingredients||[]).length+' Zutaten</div></div>'
      +'<div style="font-size:18px;color:var(--g2);font-weight:900;">＋</div></div>';
  }).join('');
}
// Eine Sendung (Lebensmittel oder Rezept) als Abzug einplanen: kein Verweis,
// keine neue Bibliothek — wie die Vorschlaege aus dem Tagebuch in autoFill().
function addSnapshot(date,slot,name,emoji,ings,portions){
  var p=planFor(date,true);
  if(!Array.isArray(p[slot]))slot='snack';
  p[slot].push({r:'',p:portions||1,s:{n:name,em:emoji,
    i:(ings||[]).map(function(g){return {n:g.name,em:g.emoji,a:g.amount,p:g.per100};})}});
  if(S.planApplied)delete S.planApplied[date];
  touch(date);
  saveS();Sync.schedule();
  if(isPlanOpen())render();
  refreshCard();
}
// Ein Rezept aus dem Kochbuch einplanen (NTBook: „📅 Einplanen“).
function planRecipe(date,slot,recipeId,portions,orig){
  var r0=rec(recipeId);
  if(!r0){showToast('Rezept nicht gefunden');return false;}
  if(!SLOTS.some(function(s){return s.id===slot;}))slot='dinner';
  var p=planFor(date,true);
  /** @type {Record<string, any>} */
  var it={r:recipeId,p:parseFloat(portions)>0?parseFloat(portions):1};
  if(orig)it.o=1;
  p[slot].push(it);
  markUsed(r0);
  if(S.planApplied)delete S.planApplied[date];
  touch(date);
  saveS();Sync.schedule();
  if(isPlanOpen())render();
  refreshCard();
  return true;
}
// Die eigenen Rezepte eines Tages, in Slot-Reihenfolge (Kochbuch-Kachel).
function dayRecipes(date){
  var out=[];
  SLOTS.forEach(function(s){
    slotItems(date,s.id).forEach(function(it){
      if(!isNote(it)&&it.r&&rec(it.r))out.push({slot:s.id,ic:s.ic,id:it.r,p:it.p||1});
    });
  });
  return out;
}
// Ein eingeplantes Grundrezept gehoert ab jetzt zu den eigenen (Picker-Suche).
function markUsed(r){if(r&&r.seed&&!r.used){r.used=1;saveX();}}
function addToSlot(recipeId){
  if(!_target)return;
  markUsed(rec(recipeId));
  var t=_target,repl=_replaceIdx;
  _target=null;_replaceIdx=null;
  var p=planFor(t.date,true);
  // Aus der Notiz ist ein Rezept geworden — sie wird ersetzt, nicht ergaenzt.
  // repl = {idx,snap}: per Inhalt wiederfinden, der Sync kann umsortiert haben (#241).
  if(repl)repl=findIdx(p[t.slot],repl.idx,repl.snap);
  if(repl!==null&&repl>=0)p[t.slot].splice(repl,1,{r:recipeId,p:1});
  else p[t.slot].push({r:recipeId,p:1});
  if(S.planApplied)delete S.planApplied[t.date];
  touch(t.date);
  saveS();Sync.schedule();closeOv('planPickOv');render();refreshCard();
  var r=rec(recipeId);
  showToast((r?(r.emoji||'📋')+' '+r.name:'Rezept')+(repl!==null&&repl>=0?' hinterlegt ✓':' eingeplant ✓'));
}

// ── Notiz einplanen und spaeter aufloesen ───────────────────────────
var _replaceIdx=null;
function addNote(){
  if(!_target)return;
  var txt=((document.getElementById('planPickQ')||{}).value||'').trim();
  if(!txt){showToast('Erst etwas eintippen');return;}
  var t=_target,repl=_replaceIdx;
  _target=null;_replaceIdx=null;
  var p=planFor(t.date,true);
  if(repl)repl=findIdx(p[t.slot],repl.idx,repl.snap);
  if(repl!==null&&repl>=0)p[t.slot].splice(repl,1,{x:txt});
  else p[t.slot].push({x:txt});
  if(S.planApplied)delete S.planApplied[t.date];
  touch(t.date);
  saveS();Sync.schedule();closeOv('planPickOv');render();refreshCard();
  showToast('📝 '+txt+' eingeplant — Rezept später');
}
function saveNote(){
  var c=curItem();if(!c||!isNote(c.it))return;
  var it=c.it;
  var txt=((document.getElementById('planItemNoteText')||{}).value||'').trim();
  if(!txt){showToast('Die Notiz braucht einen Text');return;}
  it.x=txt;
  touch(_item.date);
  saveS();Sync.schedule();closeOv('planItemOv');render();refreshCard();
}
// „Rezept hinterlegen“: derselbe Auswahl-Dialog wie ＋, nur dass der Treffer
// die Notiz ersetzt. Der Notiztext steht schon im Suchfeld — meistens heisst
// das Rezept genauso.
function noteToRecipe(){
  var c=curItem();if(!c||!isNote(c.it))return;
  var it=c.it;
  var d=_item.date,sl=_item.slot,ix={idx:c.idx,snap:JSON.stringify(it)},txt=it.x;
  closeOv('planItemOv');
  setTimeout(function(){
    pick(d,sl);
    _replaceIdx=ix;
    var q=document.getElementById('planPickQ');
    if(q){q.value=txt;renderPick();}
  },200);
}

// ── Einzelnen Planeintrag bearbeiten ──────────────────────────────────────
var _item=null;
// Der offene Eintrag wird ueber seinen Inhalt (snap) wiedergefunden, nicht
// nur ueber die Position: der Abgleich alle 60 s ersetzt den ganzen Tag, und
// dieselbe Position zeigte dann auf ein anderes Rezept (#241).
function findIdx(items,idx,snap){
  items=items||[];
  if(items[idx]&&JSON.stringify(items[idx])===snap)return idx;
  for(var i=0;i<items.length;i++)if(JSON.stringify(items[i])===snap)return i;
  return -1;
}
function curItem(silent){
  if(!_item)return null;
  var items=slotItems(_item.date,_item.slot);
  var i=findIdx(items,_item.idx,_item.snap);
  if(i<0){
    if(!silent){showToast('Eintrag wurde auf dem anderen Gerät geändert');closeOv('planItemOv');_item=null;}
    return null;
  }
  _item.idx=i;
  return {it:items[i],idx:i};
}
function openItem(date,slot,idx){
  var it=slotItems(date,slot)[idx];if(!it)return;
  var note=isNote(it);
  var r=note?null:resolve(it);
  if(!note&&!r){removeItem(date,slot,idx);return;}
  _item={date:date,slot:slot,idx:idx,snap:JSON.stringify(it)};
  var d=parse(date),s=SLOTS.filter(function(x){return x.id===slot;})[0];
  var nw=document.getElementById('planItemNoteWrap');
  var rw=document.getElementById('planItemRecWrap');
  if(nw)nw.style.display=note?'':'none';
  if(rw)rw.style.display=note?'none':'';
  if(note){
    document.getElementById('planItemTitle').textContent='📝 '+it.x;
    var ne=document.getElementById('planItemNoteText');if(ne)ne.value=it.x;
  } else {
    // Woher der Eintrag stammt, gehoert in die Zeile: ein Abzug aus einer
    // geteilten Liste und ein Vorschlag aus dem eigenen Tagebuch sehen im
    // Plan gleich aus, verhalten sich aber verschieden (kein Rezept dahinter).
    var src=r.own?'':(r.hist?' · aus deinem Tagebuch':' · von einer geteilten Liste');
    document.getElementById('planItemTitle').textContent=(r.emoji||'📋')+' '+r.name+src;
    document.getElementById('planItemPortions').value=it.p||1;
    var bb=document.getElementById('planItemBookBtn');if(bb)bb.style.display=r.own?'':'none';
    planItemTotal();
  }
  document.getElementById('planItemSub').textContent=DOW[(d.getDay()+6)%7]+' · '+shortDate(d)+' · '+(s?s.label:'');
  openOv('planItemOv');
}
// Eigenes Rezept: im Kochbuch oeffnen — dort Zubereitung und Kochmodus.
function itemToBook(){
  var c=curItem();if(!c||!c.it.r||!window.NTBook)return;
  closeOv('planItemOv');
  NTBook.detail(c.it.r);
}
function planItemTotal(){
  var c=curItem(true);if(!c)return;
  var it=c.it;
  var r=resolve(it);if(!r)return;
  var p=parseFloat((document.getElementById('planItemPortions')||{}).value)||1;
  var el=document.getElementById('planItemTotal');
  if(el)el.textContent=totalStr(scaleNutrients(ingTotal(r.ingredients),p));
}
function saveItem(){
  var c=curItem();if(!c)return;
  var it=c.it;
  it.p=parseFloat(document.getElementById('planItemPortions').value)||1;
  touch(_item.date);
  saveS();Sync.schedule();closeOv('planItemOv');render();refreshCard();
}
function removeItem(date,slot,idx){
  var items=slotItems(date,slot);
  if(!items[idx])return;
  items.splice(idx,1);
  touch(date);
  saveS();Sync.schedule();render();refreshCard();
}
function deleteItem(){
  var c=curItem();if(!c)return;
  removeItem(_item.date,_item.slot,c.idx);
  closeOv('planItemOv');
  showToast('Aus dem Plan entfernt');
}
function itemToShop(){
  if(!window.NTShop)return;
  var c=curItem();if(!c)return;
  var it=c.it;
  if(isNote(it)){showToast('Diese Notiz hat noch kein Rezept — nichts zum Einkaufen');return;}
  var r=resolve(it);if(!r){showToast('Rezept nicht gefunden');return;}
  // Bewusst NICHT NTShop.addRecipe(id): ein von aussen geteiltes Rezept steht
  // nicht in der eigenen Bibliothek, die ID liefe dort ins Leere.
  var p=it.p||1;
  showToast(NTShop.resultText(NTShop.addIngredients(r.ingredients.map(function(g){
    return {name:bookIngShort(g)||g.name,emoji:g.emoji||'',amount:Math.round((g.amount||0)*p)};
  }),r.name)));
}

// ── Automatisch fuellen ────────────────────────────────────────
// Zwei Fragen entscheiden, was vorgeschlagen wird — und beide standen bis
// v0.259 nicht im Code:
//
//  1. WORAUS wird gewaehlt? Bisher: ausschliesslich die Rezeptbibliothek.
//     Jetzt zusaetzlich das Tagebuch — aber nur als ganze Mahlzeit, nicht als
//     einzelne Zeile: „Burger mit Pommes“ darf vorkommen, „200 g Magerquark“
//     nicht. Ein einzelnes Lebensmittel ist kein Abendessen, und genau solche
//     Zeilen kamen vorher als Vorschlag zurueck. Rezepte bleiben der Regelfall
//     (siehe HIST_PENALTY): ein Tagebuch-Vorschlag muss deutlich besser passen,
//     um eines zu verdraengen.
//
//  2. WIE VIEL? Bisher: ein Rezept je Mittag und Abend, Portion 1, Kalorien
//     egal — sieben Tage zwischen 900 und 3000 kcal. Jetzt bekommt jeder Tag
//     das Kalorienziel als Vorgabe: die leeren Slots teilen sich, was nach dem
//     schon Geplanten uebrig ist (Fruehstueck 25 %, Mittag 35 %, Abend 30 %;
//     die 10 % des Snacks bleiben frei, Snacks plant „Füllen“ nie), und danach zieht rebalance() die Portionen nach, bis der Tag
//     innerhalb von 5 % liegt. Von Hand Geplantes wird dabei nie angefasst.
//
// Was schon im Plan steht, bleibt unangetastet; innerhalb einer Woche wird
// nichts wiederholt, solange genug Auswahl da ist.
var HIST_DAYS=90;          // so weit zurueck wird das Tagebuch gelesen
var HIST_PENALTY=0.45;     // Aufschlag, den ein Tagebuch-Vorschlag mitbringt
var PORTION_STEPS=[0.5,0.75,1,1.25,1.5,2];
var SLOT_BUDGET={breakfast:0.25,lunch:0.35,dinner:0.30,snack:0.10};
var COOKED_DAYS=14;        // so lange gilt ein Rezept als „gerade gekocht“ …
var COOKED_PENALTY=0.3;    // … und muss um so viel besser passen (S.cookLog)

// Ein Tagebuch-Eintrag als Zutatenliste. Rezept-Eintraege tragen ihre Zutaten
// je Portion, alles andere hat per100 — und wenn nicht, wird es aus der
// eingetragenen Menge zurueckgerechnet.
function entryToIngredients(e){
  if(!e)return [];
  if(e.isRecipe&&Array.isArray(e.ingredients)&&e.ingredients.length){
    var f=e.portions||1;
    return e.ingredients.map(function(g){
      return {name:g.name,emoji:g.emoji||'🍽',amount:Math.round((g.amount||0)*f*10)/10,
              per100:g.per100||{kcal:0,protein:0,carbs:0,fat:0}};
    });
  }
  var per=e.per100;
  if(!per&&e.amount>0){
    var r=100/e.amount;
    per={kcal:(e.kcal||0)*r,protein:(e.protein||0)*r,carbs:(e.carbs||0)*r,fat:(e.fat||0)*r};
  }
  if(!per)return [];
  return [{name:e.name||'Eintrag',emoji:e.emoji||'🍽',amount:e.amount||0,per100:per}];
}
function isDrink(name){return !!(window.NTAmpel&&NTAmpel.isLiquid(name));}
function comboName(names){
  if(names.length===1)return names[0];
  if(names.length===2)return names[0]+' mit '+names[1];
  return names.slice(0,-1).join(', ')+' und '+names[names.length-1];
}
// Mahlzeiten aus dem Tagebuch, die als Vorschlag taugen. Eine Mahlzeit zaehlt,
// wenn sie aus mehreren Posten bestand oder als Rezept eingetragen wurde.
// Was selbst aus dem Plan kam (_fromPlan), bleibt draussen — sonst fuettert
// sich der Plan mit seinen eigenen Vorschlaegen.
function historyCombos(){
  var byKey={},list=[];
  if(!S.days||typeof S.days!=='object')return list;
  var limit=iso(addDays(new Date(),-HIST_DAYS));
  Object.keys(S.days).forEach(function(k){
    if(k<limit)return;
    var day=S.days[k];
    if(!day||day._compressed||!day.meals)return;
    SLOTS.forEach(function(sl){
      // Getraenke („Aperol Spritz“, „Bier“) sind keine Mahlzeit und fallen raus.
      var en=(day.meals[sl.id]||[]).filter(function(e){return e&&e.name&&!e._fromPlan&&!isDrink(e.name);});
      if(!en.length)return;
      if(en.length<2&&!en[0].isRecipe)return;
      var names=en.map(function(e){return e.name;});
      var key=sl.id+'|'+names.map(function(n){return norm(n);}).sort().join('+');
      if(byKey[key]){byKey[key].n++;return;}
      var ings=[];
      en.forEach(function(e){ings=ings.concat(entryToIngredients(e));});
      if(!ings.length)return;
      byKey[key]={n:1,slot:sl.id,name:comboName(names),emoji:en[0].emoji||'🍽',ings:ings};
      list.push(byKey[key]);
    });
  });
  // Was als Rezept in der Bibliothek steht, kommt nicht zweimal in die Auswahl.
  return list.filter(function(c){return !similarRecipe(c.name,c.ings);});
}

// Die Auswahl fuer einen Slot: Rezepte plus die Tagebuch-Mahlzeiten, die zu
// dieser Tageszeit gegessen wurden (Ruehrei ist kein Abendessen, nur weil es
// kalorisch passt). Aus den drei Bestpassenden wird gewuerfelt — „🎲 Füllen“
// soll zweimal hintereinander nicht dieselbe Woche liefern.
function bestCandidate(cands,used,slot,target,relax){
  var scored=[];
  cands.forEach(function(c){
    if(!relax&&used[c.key])return;
    if(c.slot&&c.slot!==slot)return;
    if(c.slots&&c.slots.indexOf(slot)<0)return;
    var bp=PORTION_STEPS[0],bd=Infinity;
    PORTION_STEPS.forEach(function(pp){
      var d=Math.abs(c.kcal*pp-target);
      if(d<bd){bd=d;bp=pp;}
    });
    scored.push({c:c,p:bp,score:(target>0?bd/target:bd)+(c.hist?HIST_PENALTY:0)+(c.recent?COOKED_PENALTY:0)});
  });
  if(!scored.length)return relax?null:bestCandidate(cands,used,slot,target,true);
  scored.sort(function(a,b){return a.score-b.score;});
  var top=scored.slice(0,3);
  return top[Math.floor(Math.random()*top.length)];
}

// Portionen der SOEBEN gesetzten Eintraege nachziehen, bis der Tag das
// Kalorienziel trifft. Nur diese — was von Hand geplant wurde, ist eine
// Entscheidung und keine Stellschraube.
function rebalance(date,fresh,goal){
  if(!goal||!fresh.length)return;
  for(var round=0;round<40;round++){
    var cur=dayKcal(date);
    var diff=goal-cur;
    if(Math.abs(diff)<=goal*0.05)return;
    var bestIt=/** @type {{p?: number}|null} */ (null),bestP=0,bestGain=0;
    fresh.forEach(function(it){
      var per=itemKcal(it)/(it.p||1);
      if(!(per>0))return;
      var np=Math.round(((it.p||1)+(diff>0?0.25:-0.25))*100)/100;
      if(np<0.5||np>3)return;
      var gain=Math.abs(diff)-Math.abs(goal-(cur-itemKcal(it)+per*np));
      if(gain>bestGain){bestGain=gain;bestIt=it;bestP=np;}
    });
    if(!bestIt)return;
    bestIt.p=bestP;
  }
}

// Snacks fuellt „Füllen“ nie; ihr Anteil am Tagesziel bleibt frei, solange
// der Snack-Slot leer ist. Rezepte nur in die Slots ihres Markers
// (bookFillSlots: ohne Marker, Snack, Getraenk nie).
var FILL_SLOTS=['breakfast','lunch','dinner'];
function fillGoal(date,goal){
  return slotItems(date,'snack').length?goal:goal*(1-SLOT_BUDGET.snack);
}
function autoFill(){
  var hist=historyCombos();
  if(!recipes.length&&!hist.length){showToast('Erst ein Rezept anlegen');return;}
  var cands=[];
  // Was im Kochmodus kuerzlich als gekocht markiert wurde, kommt seltener dran.
  var since=iso(addDays(new Date(),-COOKED_DAYS)),log=S.cookLog||{};
  recipes.forEach(function(r){
    var sl=bookFillSlots(r);
    if(!sl.length)return;
    var k=ingTotal(viewIngs(r)).kcal;
    if(!(k>0))return;
    cands.push({key:'r:'+r.id,kcal:k,slot:null,slots:sl,hist:false,recent:!!(log[r.id]&&log[r.id].last>=since),
      make:function(pp){return {r:r.id,p:pp};}});
  });
  hist.forEach(function(c){
    if(FILL_SLOTS.indexOf(c.slot)<0)return;
    var k=ingTotal(c.ings).kcal;
    if(!(k>0))return;
    // Als Abzug, nicht als Verweis: Der Vorschlag steht in keiner Bibliothek,
    // und er soll auch keine anlegen. resolve() zeigt ihn trotzdem vollstaendig.
    cands.push({key:'h:'+norm(c.name),kcal:k,slot:c.slot,hist:true,
      make:function(pp){return {r:'',p:pp,h:1,s:{n:c.name,em:c.emoji,
        i:c.ings.map(function(g){return {n:g.name,em:g.emoji,a:g.amount,p:g.per100};})}};}});
  });
  if(!cands.length){showToast(recipes.length?'Keinem Rezept ist eine Mahlzeit zugeordnet — ✏️ Bearbeiten → Passt zu':'Zu wenig Daten — leg ein Rezept an');return;}

  var mo=weekStart(),goal=goalKcal(),used={},added=0;
  for(var i=0;i<7;i++){
    var d0=iso(addDays(mo,i));
    SLOTS.forEach(function(s){slotItems(d0,s.id).forEach(function(it){
      if(it.r)used['r:'+it.r]=true;
      else if(it.s&&it.s.n)used['h:'+norm(it.s.n)]=true;
    });});
  }
  for(var k=0;k<7;k++){
    var ds=iso(addDays(mo,k));
    var pl=planFor(ds,true);
    var open=[];
    FILL_SLOTS.forEach(function(sl){if(!(pl[sl]||[]).length)open.push(sl);});
    if(!open.length)continue;
    var budSum=open.reduce(function(a,sl){return a+SLOT_BUDGET[sl];},0);
    var dg=fillGoal(ds,goal);
    var rest=Math.max(0,dg-dayKcal(ds));
    var fresh=[];
    open.forEach(function(slot){
      var target=budSum>0?rest*(SLOT_BUDGET[slot]/budSum):0;
      var picked=bestCandidate(cands,used,slot,target,false);
      if(!picked)return;
      used[picked.c.key]=true;
      var it=picked.c.make(picked.p);
      pl[slot].push(it);fresh.push(it);added++;
    });
    if(!fresh.length)continue;
    rebalance(ds,fresh,dg);
    if(S.planApplied)delete S.planApplied[ds];
    touch(ds);
  }
  saveS();Sync.schedule();render();refreshCard();
  if(!added){showToast('Die Woche ist schon voll');return;}
  var inGoal=0,planned=0;
  for(var z=0;z<7;z++){
    var dz=iso(addDays(mo,z));
    if(isEmptyPlan(dz))continue;
    planned++;
    var gz=fillGoal(dz,goal);
    if(!goal||Math.abs(dayKcal(dz)-gz)<=gz*0.1)inGoal++;
  }
  showToast(added+' Mahlzeiten eingeplant ✓'
    +(goal?(' · '+inGoal+' von '+planned+' Tagen im Kalorienziel'):''));
}

function clearDay(date){
  if(isEmptyPlan(date))return;
  if(!confirm('Alle geplanten Mahlzeiten dieses Tages entfernen?'))return;
  delete S.mealPlan[date];
  if(S.planApplied)delete S.planApplied[date];
  planTomb()[date]={rev:nextRev()};
  saveS();Sync.schedule();render();refreshCard();
}
function clearWeek(){
  var mo=weekStart(),n=0;
  for(var i=0;i<7;i++){if(!isEmptyPlan(iso(addDays(mo,i))))n++;}
  if(!n){showToast('Die Woche ist schon leer');return;}
  if(!confirm('Den ganzen Wochenplan leeren? '+n+' geplante Tage gehen verloren.'))return;
  for(var k=0;k<7;k++){
    var ds=iso(addDays(mo,k));
    if(S.mealPlan[ds])planTomb()[ds]={rev:nextRev()};
    delete S.mealPlan[ds];
    if(S.planApplied)delete S.planApplied[ds];
  }
  saveS();Sync.schedule();render();refreshCard();
  showToast('Wochenplan geleert');
}

// ── Ganze Woche auf den Einkaufszettel ────────────────────────────────────
// Zutaten werden VOR der Uebergabe zusammengefasst: Sonst landete „Zwiebeln"
// aus fuenf Rezepten als fuenf Zeilen auf dem Zettel. NTShop fasst gleiche
// Namen zwar zusammen, aber nur die Mengen — der Rezept-Vermerk waere dann der
// des letzten Rezepts.
function weekToShop(){
  if(!window.NTShop){showToast('Einkaufszettel nicht geladen');return;}
  var mo=weekStart(),agg={},order=[],days=0;
  for(var i=0;i<7;i++){
    var ds=iso(addDays(mo,i));
    if(isEmptyPlan(ds))continue;
    days++;
    SLOTS.forEach(function(s){
      slotItems(ds,s.id).forEach(function(it){
        if(isNote(it))return;
        var r=resolve(it);if(!r)return;
        r.ingredients.forEach(function(ing){
          // Einkaufsname wie im Rezept („Weizenmehl“), nicht der Datenbankname.
          var nm=bookIngShort(ing)||ing.name;
          var key=String(nm||'').toLowerCase().trim();
          if(!key)return;
          if(!agg[key]){agg[key]={name:nm,emoji:ing.emoji||'',amount:0};order.push(key);}
          agg[key].amount+=(ing.amount||0)*(it.p||1);
        });
      });
    });
  }
  if(!days){showToast('Für diese Woche ist nichts geplant');return;}
  var ings=order.map(function(k){var a=agg[k];return{name:a.name,emoji:a.emoji,amount:Math.round(a.amount)};});
  var r=NTShop.addIngredients(ings,'Wochenplan KW '+isoWeek(mo));
  showToast(NTShop.resultText(r,' aus '+days+' Tag'+(days===1?'':'en')));
}

// ── Plan → Tagebuch ───────────────────────────────────────────────────────
// Schreibt die geplanten Rezepte als normale Rezept-Eintraege in S.days. Ab
// hier ist es ein gewoehnlicher Tagebucheintrag: bearbeitbar, loeschbar,
// zaehlt in jede Summe. Der Plan bleibt daneben stehen.
function toDiary(date){
  if(isEmptyPlan(date)){showToast('Für diesen Tag ist nichts geplant');return;}
  if(S.planApplied&&S.planApplied[date]){
    if(!confirm('Dieser Tag steht schon im Tagebuch. Noch einmal eintragen?'))return;
  }
  if(!S.days[date])S.days[date]={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},water:0,exercise:[]};
  var day=S.days[date];
  // Archivierte Tage (compressOldDays) werden wieder aufgemacht; die Summen
  // bleiben als ein Eintrag erhalten (#232).
  if(day._compressed)reopenArchivedDay(day);
  if(!day.meals)day.meals={breakfast:[],lunch:[],dinner:[],snack:[]};
  if(!Array.isArray(day.exercise))day.exercise=[];
  var n=0,skipped=0;
  SLOTS.forEach(function(s){
    if(!Array.isArray(day.meals[s.id]))day.meals[s.id]=[];
    slotItems(date,s.id).forEach(function(it){
      // Eine Notiz hat keine Naehrwerte — sie ins Tagebuch zu schreiben hiesse,
      // eine Mahlzeit mit 0 kcal zu behaupten. Sie bleibt im Plan stehen und
      // wird beim Toast benannt, statt stillschweigend zu verschwinden.
      if(isNote(it)){skipped++;return;}
      var r=resolve(it);if(!r)return;
      if(r.own)markUsed(rec(it.r));
      var p=it.p||1,t=ingTotal(r.ingredients);
      day.meals[s.id].push(Object.assign({
        name:r.name,emoji:r.emoji||'📋',isRecipe:true,recipeId:r.own?it.r:null,
        portions:p,ingredients:JSON.parse(JSON.stringify(r.ingredients)),
        addedAt:new Date().toISOString(),_fromPlan:true
      },scaleNutrients(t,p)));
      n++;
    });
  });
  if(!S.planApplied||typeof S.planApplied!=='object')S.planApplied={};
  S.planApplied[date]=true;
  saveS();
  if(typeof renderAll==='function')renderAll();
  render();refreshCard();
  showToast(n+' Mahlzeit'+(n===1?'':'en')+' ins Tagebuch übernommen ✓'
    +(skipped?(' · '+skipped+' Notiz'+(skipped===1?'':'en')+' ohne Rezept übersprungen'):''));
}

// ── Dashboard-Kachel ──────────────────────────────────────────────────────
function refreshCard(){
  var card=document.getElementById('planCard');if(!card)return;
  var ds=S.currentDate||((typeof today==='function')?today():iso(new Date()));
  var body=document.getElementById('planCardBody');
  var val=document.getElementById('planCardVal');
  var kc=Math.round(dayKcal(ds));
  if(val)val.textContent=kc?kc+' kcal':'Planen';
  if(!body)return;
  if(isEmptyPlan(ds)){
    body.innerHTML='<div style="font-size:12px;color:var(--mu);font-style:italic;">Für heute ist nichts geplant</div>';
    return;
  }
  var rows='';
  SLOTS.forEach(function(s){
    var items=slotItems(ds,s.id);if(!items.length)return;
    var names=items.map(function(it){
      if(isNote(it))return '📝 '+esc(it.x);
      var r=resolve(it);return r?((r.emoji||'📋')+' '+esc(r.name)):'—';
    }).join(', ');
    rows+='<div style="display:flex;gap:6px;font-size:12px;margin-top:3px;"><span style="flex-shrink:0;">'+s.ic+'</span><span style="color:var(--tx);min-width:0;">'+names+'</span></div>';
  });
  // Die Kochbuch-Kachel zeigt die heute geplanten Rezepte mit — sie haengt am Plan.
  if(window.NTBook)NTBook.renderCard();
  var applied=S.planApplied&&S.planApplied[ds];
  body.innerHTML=rows
    +'<button type="button" class="seb" style="margin-top:8px;margin-bottom:0;" onclick="NTPlan.toDiary(\''+ds+'\')">'
    +(applied?'✓ Steht im Tagebuch — nochmal eintragen':'✓ Ins Tagebuch übernehmen')+'</button>';
}

// ══════════════════════════════════════════════════════════════════════════
// REZEPTE ANLEGEN — drei Wege
// ══════════════════════════════════════════════════════════════════════════
// Alle Overlays teilen sich z-index 300 — was spaeter im DOM steht, liegt oben.
// Die Rezept-Overlays (recNewOv, recPhotoOv, recEditOv) stehen seit v0.317
// NACH Kochbuch und Wochenplan; beide bleiben beim Anlegen darunter offen.
var _from=null;
// Wer aus ＋ eines Slots heraus „Neues Rezept“ antippt, will es dort haben.
// Der Slot wird deshalb ueber das Anlegen hinweg gemerkt und danach befuellt.
var _pendingSlot=null;
function newRecipe(){
  _from=isOpen('libraryOv')?'library':(isOpen('planOv')?'plan':null);
  _pendingSlot=(_from==='plan'&&_target&&_target.date)?{date:_target.date,slot:_target.slot}:null;
  _target=null;_replaceIdx=null;
  openOv('recNewOv');
}

// ── Ein frisch angelegtes Rezept landet in der Bibliothek ─────────────
// … und NICHT im Tagebuch. Bis v0.259 tat der Weg „aus dem Internet“ beides:
// Er legte das Rezept an UND buchte es als Mahlzeit des heutigen Tages, obwohl
// es niemand gegessen hatte — aus dem Wochenplan heraus angelegt war das immer
// falsch. Wer es wirklich essen will, traegt es ueber ＋ ein.
// Diese Stelle ist die einzige, die entscheidet, was danach passiert; die drei
// Wege (selbst, Foto, Link) rufen sie alle auf.
function noteRecipeCreated(r){
  if(!r||!r.id)return;
  var slot=_pendingSlot;_pendingSlot=null;
  if(slot){
    var pl=planFor(slot.date,true);
    pl[slot.slot].push({r:r.id,p:1});
    if(S.planApplied)delete S.planApplied[slot.date];
    touch(slot.date);
    saveS();Sync.schedule();
    showToast((r.emoji||'📋')+' '+r.name+' gespeichert und eingeplant ✓');
  } else {
    showToast((r.emoji||'📋')+' '+r.name+' im Kochbuch gespeichert ✓');
  }
  render();refreshCard();
  if(window.NTBook)NTBook.render();
}
// Aus dem ＋ eines Slots angelegt: Der Marker steht schon auf diesem Slot.
function pendingMeal(){return _pendingSlot?[_pendingSlot.slot]:[];}
// Editor ohne Speichern geschlossen (NTBook.editClosed): kein Slot zu fuellen.
function cancelNew(){_pendingSlot=null;}
// Abgebrochen: Der Slot, aus dem heraus angelegt werden sollte, ist erledigt —
// sonst landete ein spaeter anderswo angelegtes Rezept noch darin.
function closeNew(){_pendingSlot=null;closeOv('recNewOv');backToOrigin();}
function closePhoto(){_pendingSlot=null;closeOv('recPhotoOv');backToOrigin();}
function isOpen(id){var e=document.getElementById(id);return !!(e&&e.classList.contains('open'));}
// Zurueck dorthin, wo „＋ Neues Rezept" angetippt wurde — ein Rezept anzulegen
// ist ein Zwischenschritt, kein Ortswechsel.
function backToOrigin(){
  var f=_from;_from=null;
  if(f==='library'&&window.NTBook)NTBook.render();
  else if(f==='plan')render();
}

// (1) Selbst anlegen: leerer Entwurf im Kochbuch-Editor. Angelegt wird erst
// beim Speichern — wer den Editor gleich wieder schliesst, hinterlaesst nichts.
// Die Dublettenpruefung und das Befuellen des Slots (noteRecipeCreated) ruft
// der Editor selbst.
function newBlank(){
  var f=_from;_from=null;
  closeOv('recNewOv');
  if(window.NTBook)NTBook.editDraft({name:'',emoji:'📋',ingredients:[],baseServings:1,meal:pendingMeal()},{from:_pendingSlot?'plan':f});
}

// (3) Aus dem Internet: der vorhandene Link-Tab des Pickers kann das schon —
//     Seite laden, Zutaten lesen, „📋 Als Rezept". Hier nur der Weg dorthin.
function newFromLink(){
  _from=null;
  closeOv('recNewOv');closeOv('planOv');closeOv('libraryOv');
  setTimeout(function(){
    if(!window.NTPicker)return;
    NTPicker.openPicker(null,'link');
    // NACH openPicker: der Dialog setzt seinen Zustand beim Oeffnen zurueck.
    window._pickerRecipeOnly=true;
    NTPicker._pickerRecipeOnlyUI();
  },200);
}

// ── (2) Aus dem Kochbuch fotografieren ────────────────────────────────────
var _photoB64=null,_photoIngs=[],_photoMeta=null;

function newFromPhoto(){
  closeOv('recNewOv');
  resetPhoto();
  setTimeout(function(){openOv('recPhotoOv');},200);
}
function resetPhoto(){
  _photoB64=null;_photoIngs=[];_photoMeta=null;
  var w=document.getElementById('recPhotoPrevWrap');if(w)w.classList.add('hidden');
  var a=document.getElementById('recPhotoPickArea');if(a)a.style.display='flex';
  var btn=document.getElementById('recPhotoBtn');if(btn){btn.disabled=true;btn.textContent='🤖 Rezept auslesen';}
  setStatus('',false);
  ['recPhotoCam','recPhotoGal'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
}
function setStatus(msg,isErr){
  var el=document.getElementById('recPhotoStatus');if(!el)return;
  if(!msg){el.classList.add('hidden');return;}
  el.textContent=msg;
  el.style.background=isErr?'#ffebee':'var(--gl)';
  el.style.borderColor=isErr?'var(--re)':'var(--g3)';
  el.style.color=isErr?'var(--re)':'var(--g1)';
  el.classList.remove('hidden');
}

// Eigene Verkleinerung statt der aus dem Picker: dort haengt sie fest an den
// Picker-Knoten. 1600 px statt 1280 — eine Kochbuchseite ist Text, und Text
// braucht mehr Aufloesung als ein Teller.
function handlePhoto(ev){
  var file=ev.target.files&&ev.target.files[0];if(!file)return;
  ev.target.value='';
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var MAX=1600,w=img.width,h=img.height;
      if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
      var c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      var comp=c.toDataURL('image/jpeg',0.85);
      _photoB64=comp.split(',')[1];
      var pv=document.getElementById('recPhotoPrev');if(pv)pv.src=comp;
      var pw=document.getElementById('recPhotoPrevWrap');if(pw)pw.classList.remove('hidden');
      var pa=document.getElementById('recPhotoPickArea');if(pa)pa.style.display='none';
      var btn=document.getElementById('recPhotoBtn');if(btn)btn.disabled=false;
    };
    img.onerror=function(){showToast('Foto konnte nicht geladen werden');};
    img.src=/** @type {string} */ (e.target.result);
  };
  reader.onerror=function(){showToast('Fehler beim Lesen der Datei');};
  reader.readAsDataURL(file);
}

// Eigener Prompt: der Foto-Prompt des Pickers beschreibt einen TELLER und
// fragt, was darauf liegt. Eine Kochbuchseite ist Text — Titel, Portionsangabe,
// Zutatenliste mit Haushaltsmassen und Zubereitungsschritte.
var PHOTO_PROMPT=
'Auf dem Bild steht ein Rezept — Kochbuchseite, Zeitschrift, Rezeptkarte oder Handschrift.\n'+
'Lies es und gib AUSSCHLIESSLICH dieses JSON zurück, ohne Fließtext und ohne Markdown-Block:\n'+
'{"titel":"...","portionen":4,"minuten":45,"zutaten":[{"name":"Mehl","g":500}],"anleitung":"1. ...\\n2. ..."}\n'+
'Regeln:\n'+
'- "portionen" = die im Rezept angegebene Personen-/Portionszahl. Fehlt sie: 4.\n'+
'- "g" = Menge in GRAMM für genau diese Portionszahl, als Zahl ohne Einheit.\n'+
'  Haushaltsmaße umrechnen: 1 EL Öl/Butter ≈ 15, 1 TL ≈ 5, 1 Prise ≈ 1,\n'+
'  1 Ei ≈ 60, 1 Zwiebel ≈ 80, 1 Knoblauchzehe ≈ 5, 1 Tasse Mehl ≈ 120,\n'+
'  1 Becher Sahne ≈ 200, 1 Dose ≈ 400. Bei Flüssigkeiten gilt 1 ml ≈ 1 g.\n'+
'- Menge unklar oder "nach Geschmack": "g": null.\n'+
'- "name": einfacher deutscher Grundname ohne Zusätze wie "frisch gehackt",\n'+
'  "Bio" oder "zimmerwarm". Also "Petersilie", nicht "frisch gehackte Petersilie".\n'+
'- "minuten": Gesamtzeit laut Rezept als Zahl, fehlt sie: 0.\n'+
'- "anleitung": die Zubereitungsschritte als Text, ein Schritt pro Zeile. Steht auf\n'+
'  dem Bild keine Zubereitung: "".\n'+
'- Ist auf dem Bild gar kein Rezept zu erkennen: {"titel":"","portionen":0,"minuten":0,"zutaten":[],"anleitung":""}';

function analyze(){
  if(!_photoB64)return;
  if(typeof isOnline!=='undefined'&&!isOnline){setStatus('Rezept auslesen braucht Internet.',true);return;}
  if(typeof canUseAi==='function'&&!canUseAi()){setStatus('KI ist nicht eingerichtet — Mehr → 🤖 KI.',true);return;}
  var btn=document.getElementById('recPhotoBtn');
  btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;gap:5px;align-items:center;"><span class="spin"></span>KI liest das Rezept…</span>';
  setStatus('Die KI liest die Seite …',false);
  callClaude('claude-sonnet-5-5',
    [{type:'image',source:{type:'base64',media_type:'image/jpeg',data:_photoB64}},{type:'text',text:PHOTO_PROMPT}],
    2048,
    function(text){
      btn.disabled=false;btn.textContent='📷 Erneut auslesen';
      var d=parseJson(text);
      if(!d||!d.zutaten||!d.zutaten.length){
        setStatus(text&&text.length?('Kein Rezept erkannt. KI: '+String(text).slice(0,140)):'Kein Rezept erkannt.',true);
        return;
      }
      _photoMeta={titel:String(d.titel||'').trim(),portionen:Math.max(1,Math.round(parseFloat(d.portionen)||4)),
        minuten:Math.max(0,Math.round(parseFloat(d.minuten)||0)),anleitung:String(d.anleitung||'').trim()};
      setStatus('Nährwerte werden nachgeschlagen …',false);
      lookupNutrients(d.zutaten.map(function(z){
        return {name:String(z.name||'').trim(),g:(z.g===null||z.g===undefined||z.g==='')?null:parseFloat(z.g)};
      }).filter(function(z){return !!z.name;}),function(resolved){
        _photoIngs=resolved;
        setStatus('',false);
        toEditor();
      });
    },
    function(err){
      btn.disabled=false;btn.textContent='📷 Erneut auslesen';
      setStatus(window.NTPicker?NTPicker.pickerFriendlyAiError(err):('Fehler: '+err),true);
    }
  );
}
// Die KI liefert gelegentlich einen ```json-Block oder ein paar Worte davor.
// Deshalb wird der aeusserste geschweifte Block herausgeschnitten, statt
// blind JSON.parse auf die ganze Antwort zu werfen.
function parseJson(text){
  var s=String(text||'');
  var a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch(e){return null;}
}

// Ergebnis pruefen und speichern im Kochbuch-Editor: Mengen fuer das ganze
// Rezept, Portionenzahl der Seite — gespeichert wird je Portion (NTBook).
function toEditor(){
  var m=_photoMeta||{titel:'',portionen:4,minuten:0,anleitung:''};
  var f=_from;_from=null;
  closeOv('recPhotoOv');
  if(!window.NTBook)return;
  NTBook.editDraft({name:m.titel,meal:pendingMeal(),baseServings:m.portionen,time:m.minuten,instructions:m.anleitung,
    ingredients:_photoIngs.map(function(g){return {name:g.name,emoji:g.emoji||'🍽',amount:g.amount||0,per100:g.per100,missingGrams:!g.amount};})},
    {from:_pendingSlot?'plan':f,hint:'Von der KI gelesen — Mengen und Portionen bitte prüfen.'});
  resetPhoto();
}

// ══════════════════════════════════════════════════════════════════════════
// Sync: ein Record je TAG
// ══════════════════════════════════════════════════════════════════════════
// Beim Senden bekommt jeder Eintrag den Abzug seines Rezepts mit — die
// Gegenseite hat die Bibliothek nicht, und ein blosser Verweis waere drueben
// eine leere Zeile. Kennen wir das Rezept selbst nicht (weil der Tag von einem
// Dritten kam), reicht der Abzug weiter, den wir bekommen haben.
function dayPayload(date){
  var p=planFor(date,false);
  if(!p)return null;
  var out={};
  SLOTS.forEach(function(sl){
    out[sl.id]=(p[sl.id]||[]).map(function(it){
      if(isNote(it))return {x:it.x,p:1};
      /** @type {Record<string, any>} */
      var o={r:it.r||'',p:it.p||1};
      if(it.o)o.o=1;
      var snap=(it.r?snapOf(it.r,it.o):null)||it.s;
      if(snap)o.s=snap;
      if(it.h)o.h=1;
      return o;
    });
  });
  return {d:out};
}
function records(){
  var out=[];
  if(!S.mealPlan||typeof S.mealPlan!=='object')S.mealPlan={};
  Object.keys(S.mealPlan).forEach(function(date){
    var p=S.mealPlan[date];if(!p)return;
    out.push({id:date,rev:p.rev||0,holder:p,payload:dayPayload(date)});
  });
  var tb=planTomb();
  Object.keys(tb).forEach(function(date){
    var t=tb[date];if(!t)return;
    out.push({id:date,rev:t.rev||0,holder:t,payload:{d:null}});
  });
  return out;
}
// Merge: hoehere rev gewinnt, fuer den ganzen Tag.
function applyRec(id,rev,payload,room){
  if(!S.mealPlan||typeof S.mealPlan!=='object')S.mealPlan={};
  var tb=planTomb();
  var tomb=tb[id];
  if(tomb&&(tomb.rev||0)>=rev)return false;// lokal spaeter geleert
  var cur=S.mealPlan[id];
  if(cur&&(cur.rev||0)>=rev)return false;  // lokal neuer
  if(payload.d===null||payload.d===undefined){
    delete S.mealPlan[id];
    var t={rev:rev};NTSync.ack(t,room,rev);
    tb[id]=t;
    if(S.planApplied)delete S.planApplied[id];
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }
  if(tomb)delete tb[id];
  var p={breakfast:[],lunch:[],dinner:[],snack:[],rev:rev};
  SLOTS.forEach(function(sl){
    p[sl.id]=((payload.d||{})[sl.id]||[]).map(function(o){
      if(o&&o.x)return {x:String(o.x)};
      /** @type {Record<string, any>} */
      var it={r:o.r||'',p:o.p||1};
      if(o.o)it.o=1;
      if(o.s)it.s=o.s;
      if(o.h)it.h=1;
      return it;
    });
  });
  NTSync.ack(p,room,rev);
  S.mealPlan[id]=p;
  // Ein Tag, der sich geaendert hat, steht nicht mehr so im Tagebuch, wie er
  // dort hineingeschrieben wurde — die Haken-Markierung waere sonst gelogen.
  if(S.planApplied)delete S.planApplied[id];
  if(rev>_lastRev)_lastRev=rev;
  return true;
}

var Sync=NTSync.engine({
  topic:'plan',path:'/plan/sync',header:'X-Plan-Room',salt:'nutritrack-plan',
  pollMs:60000,      // ein Wochenplan aendert sich selten – kein Ladenregal
  debounceMs:1500,
  records:records,
  apply:applyRec,
  onApplied:function(){render();refreshCard();},
  onStatus:function(){renderSyncUI();}
});

function openSync(){renderSyncUI();openOv('planSyncOv');}
function renderSyncUI(){
  var stat=document.getElementById('planSyncStatus');
  if(stat)stat.textContent=Sync.statusText();
  var who=document.getElementById('planSyncWho');
  if(who){
    var ls=NTSync.forTopic('plan');
    who.innerHTML=ls.length
      ?ls.map(function(l){return '<span class="lnk-chip">👤 '+esc(l.name)+'</span>';}).join('')
      :'<span style="font-size:12px;color:var(--mu);">Noch mit niemandem geteilt.</span>';
  }
  var badge=document.getElementById('planSyncBadge');
  if(badge)badge.style.display=Sync.active()?'':'none';
}
function openLinks(){closeOv('planSyncOv');setTimeout(function(){NTSync.open();},200);}
function syncNow(){
  if(!Sync.active()){showToast('Erst jemanden verbinden');return;}
  showToast('Wird abgeglichen …');
  Sync.run(true).then(function(){render();refreshCard();renderSyncUI();});
}

// ── Boot ──────────────────────────────────────────────────────────────────
function boot(){
  if(!S.mealPlan||typeof S.mealPlan!=='object')S.mealPlan={};
  if(!S.planApplied||typeof S.planApplied!=='object')S.planApplied={};
  Object.keys(S.mealPlan).forEach(function(d){
    var p=S.mealPlan[d];if(p&&(p.rev||0)>_lastRev)_lastRev=p.rev;
  });
  Object.keys(planTomb()).forEach(function(d){
    var t=S.planTomb[d];if(t&&(t.rev||0)>_lastRev)_lastRev=t.rev;
  });
  refreshCard();
  Sync.run();
}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden)Sync.run();
});

window.NTPlan={
  boot:boot,open:open,close:close,render:render,refreshCard:refreshCard,
  shiftWeek:shiftWeek,autoFill:autoFill,clearDay:clearDay,clearWeek:clearWeek,
  weekToShop:weekToShop,toDiary:toDiary,
  pick:pick,renderPick:renderPick,addToSlot:addToSlot,addSnapshot:addSnapshot,
  addNote:addNote,saveNote:saveNote,noteToRecipe:noteToRecipe,
  similarRecipe:similarRecipe,confirmNotDuplicate:confirmNotDuplicate,
  noteRecipeCreated:noteRecipeCreated,cancelNew:cancelNew,planRecipe:planRecipe,dayRecipes:dayRecipes,itemToBook:itemToBook,
  openItem:openItem,saveItem:saveItem,deleteItem:deleteItem,removeItem:removeItem,
  itemToShop:itemToShop,planItemTotal:planItemTotal,
  openSync:openSync,renderSyncUI:renderSyncUI,openLinks:openLinks,syncNow:syncNow,Sync:Sync,
  newRecipe:newRecipe,newBlank:newBlank,newFromLink:newFromLink,newFromPhoto:newFromPhoto,
  backToOrigin:backToOrigin,closeNew:closeNew,closePhoto:closePhoto,
  handlePhoto:handlePhoto,analyze:analyze,resetPhoto:resetPhoto
};
})();
