// NutriTrack – Wochenplan & Rezeptquellen (v0.244)
// Klassisches Script, kein Modul. Exportiert window.NTPlan und greift direkt auf
// die globalen Helfer aus index.html/picker.js zu (S, saveS, saveX, recipes,
// getDay, calcM, ingTotal, scaleNutrients, totalStr, lookupNutrients, callClaude,
// openOv, closeOv, esc, showToast, openRecipeEditor, pickerRenderIngList).
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
function snapOf(recipeId){
  var r=rec(recipeId);
  if(!r)return null;
  return {n:r.name,em:r.emoji||'📋',i:(r.ingredients||[]).map(function(g){
    return {n:g.name,em:g.emoji||'🍽',a:g.amount,p:g.per100};
  })};
}
// Was ein Planeintrag im Bild ist: das eigene Rezept, sonst der mitgereiste
// Abzug, sonst nichts — dann steht „Rezept gelöscht ✕" statt eines Absturzes.
function resolve(it){
  if(!it)return null;
  var r=rec(it.r);
  if(r)return {name:r.name,emoji:r.emoji||'📋',ingredients:r.ingredients||[],own:true};
  if(it.s)return {name:it.s.n,emoji:it.s.em||'📋',own:false,
    ingredients:(it.s.i||[]).map(function(g){return {name:g.n,emoji:g.em||'🍽',amount:g.a,per100:g.p};})};
  return null;
}
function itemKcal(it){var r=resolve(it);if(!r)return 0;return ingTotal(r.ingredients).kcal*(it.p||1);}
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
  if(sub)sub.textContent=filled?(filled+' von 7 Tagen geplant · '+Math.round(total)+' kcal'):'Noch nichts geplant';

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
  var html='';
  for(var k=0;k<7;k++){
    var dt=addDays(mo,k),ds=iso(dt),isToday=(ds===todayIso);
    var kc=Math.round(dayKcal(ds));
    var applied=S.planApplied&&S.planApplied[ds];
    html+='<div class="plan-day'+(isToday?' is-today':'')+'">'
      +'<div class="plan-dh">'
        +'<div class="plan-dt">'+DOW[k]+' · '+dt.getDate()+'. '+MON[dt.getMonth()]+(isToday?' <span class="plan-badge">heute</span>':'')+'</div>'
        +'<div class="plan-dk">'+(kc?kc+' kcal':'—')+'</div>'
      +'</div>';
    SLOTS.forEach(function(s){
      var items=slotItems(ds,s.id);
      html+='<div class="plan-slot">'
        +'<div class="plan-si" title="'+esc(s.label)+'">'+s.ic+'</div>'
        +'<div class="plan-sc">';
      items.forEach(function(it,idx){
        var r=resolve(it);
        if(!r){html+='<span class="plan-chip is-gone" onclick="NTPlan.removeItem(\''+ds+'\',\''+s.id+'\','+idx+')">Rezept gelöscht ✕</span>';return;}
        // Fremdes Rezept (nur als Abzug da): erkennbar, aber gleichwertig nutzbar.
        html+='<span class="plan-chip'+(r.own?'':' is-guest')+'" onclick="NTPlan.openItem(\''+ds+'\',\''+s.id+'\','+idx+')">'
          +(r.emoji||'📋')+' '+esc(r.name)+((it.p||1)!==1?' <b>'+(it.p||1)+'×</b>':'')+'</span>';
      });
      html+='<button type="button" class="plan-add" onclick="NTPlan.pick(\''+ds+'\',\''+s.id+'\')">＋</button>'
        +'</div></div>';
    });
    html+='<div class="plan-dact">'
      +'<button type="button" class="plan-act" onclick="NTPlan.toDiary(\''+ds+'\')"'+(kc?'':' disabled')+'>'+(applied?'✓ im Tagebuch':'→ ins Tagebuch')+'</button>'
      +'<button type="button" class="plan-act" onclick="NTPlan.clearDay(\''+ds+'\')"'+(kc?'':' disabled')+'>🗑 Tag leeren</button>'
      +'</div>'
      +'</div>';
  }
  el.innerHTML=html;
}

// ── Rezept in einen Slot legen ────────────────────────────────────────────
var _target=null;
function pick(date,slot){
  _target={date:date,slot:slot};
  var q=document.getElementById('planPickQ');if(q)q.value='';
  var s=SLOTS.filter(function(x){return x.id===slot;})[0];
  var sub=document.getElementById('planPickSub');
  if(sub&&s){var d=parse(date);sub.textContent=DOW[(d.getDay()+6)%7]+' · '+shortDate(d)+' · '+s.label;}
  renderPick();
  openOv('planPickOv');
}
function renderPick(){
  var el=document.getElementById('planPickList');if(!el)return;
  var q=((document.getElementById('planPickQ')||{}).value||'').toLowerCase().trim();
  var list=recipes.filter(function(r){return !q||r.name.toLowerCase().indexOf(q)>=0;});
  if(!list.length){
    el.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;text-align:center;padding:20px;">Kein Rezept gefunden</div>';
    return;
  }
  el.innerHTML=list.map(function(r){
    var t=ingTotal(r.ingredients||[]);
    return '<div class="ri" onclick="NTPlan.addToSlot(\''+esc(r.id)+'\')">'
      +'<div style="font-size:22px;">'+(r.emoji||'📋')+'</div>'
      +'<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">'+esc(r.name)+'</div>'
      +'<div style="font-size:11px;color:var(--mu);">'+Math.round(t.kcal)+' kcal / Portion · '+(r.ingredients||[]).length+' Zutaten</div></div>'
      +'<div style="font-size:18px;color:var(--g2);font-weight:900;">＋</div></div>';
  }).join('');
}
function addToSlot(recipeId){
  if(!_target)return;
  var p=planFor(_target.date,true);
  p[_target.slot].push({r:recipeId,p:1});
  if(S.planApplied)delete S.planApplied[_target.date];
  touch(_target.date);
  saveS();Sync.schedule();closeOv('planPickOv');render();refreshCard();
  var r=rec(recipeId);
  showToast((r?(r.emoji||'📋')+' '+r.name:'Rezept')+' eingeplant ✓');
}

// ── Einzelnen Planeintrag bearbeiten ──────────────────────────────────────
var _item=null;
function openItem(date,slot,idx){
  var it=slotItems(date,slot)[idx];if(!it)return;
  var r=resolve(it);if(!r){removeItem(date,slot,idx);return;}
  _item={date:date,slot:slot,idx:idx};
  document.getElementById('planItemTitle').textContent=(r.emoji||'📋')+' '+r.name+(r.own?'':' · von einer geteilten Liste');
  var d=parse(date),s=SLOTS.filter(function(x){return x.id===slot;})[0];
  document.getElementById('planItemSub').textContent=DOW[(d.getDay()+6)%7]+' · '+shortDate(d)+' · '+(s?s.label:'');
  document.getElementById('planItemPortions').value=it.p||1;
  planItemTotal();
  openOv('planItemOv');
}
function planItemTotal(){
  if(!_item)return;
  var it=slotItems(_item.date,_item.slot)[_item.idx];if(!it)return;
  var r=resolve(it);if(!r)return;
  var p=parseFloat((document.getElementById('planItemPortions')||{}).value)||1;
  var el=document.getElementById('planItemTotal');
  if(el)el.textContent=totalStr(scaleNutrients(ingTotal(r.ingredients),p));
}
function saveItem(){
  if(!_item)return;
  var it=slotItems(_item.date,_item.slot)[_item.idx];if(!it)return;
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
  if(!_item)return;
  removeItem(_item.date,_item.slot,_item.idx);
  closeOv('planItemOv');
  showToast('Aus dem Plan entfernt');
}
function itemToShop(){
  if(!_item||!window.NTShop)return;
  var it=slotItems(_item.date,_item.slot)[_item.idx];if(!it)return;
  var r=resolve(it);if(!r){showToast('Rezept nicht gefunden');return;}
  // Bewusst NICHT NTShop.addRecipe(id): ein von aussen geteiltes Rezept steht
  // nicht in der eigenen Bibliothek, die ID liefe dort ins Leere.
  var p=it.p||1;
  NTShop.addIngredients(r.ingredients.map(function(g){
    return {name:g.name,emoji:g.emoji||'',amount:Math.round((g.amount||0)*p)};
  }),r.name);
}

// ── Automatisch fuellen ───────────────────────────────────────────────────
// Deterministisch genug, um nachvollziehbar zu bleiben, aber ohne Anspruch auf
// Naehrwert-Optimierung: gefuellt werden nur LEERE Mittag- und Abend-Slots, und
// innerhalb einer Woche wird ein Rezept nicht wiederholt, solange die Bibliothek
// gross genug ist. Was schon geplant ist, bleibt unangetastet.
function autoFill(){
  if(!recipes.length){showToast('Erst ein Rezept anlegen');return;}
  var mo=weekStart(),pool=recipes.slice(),used={},added=0;
  // Bereits in dieser Woche geplante Rezepte gelten als verbraucht.
  for(var i=0;i<7;i++){
    var d0=iso(addDays(mo,i));
    SLOTS.forEach(function(s){slotItems(d0,s.id).forEach(function(it){used[it.r]=true;});});
  }
  function next(){
    var free=pool.filter(function(r){return !used[r.id];});
    if(!free.length){used={};free=pool.slice();} // Bibliothek zu klein → Runde neu
    var r=free[Math.floor(Math.random()*free.length)];
    used[r.id]=true;return r;
  }
  for(var k=0;k<7;k++){
    var ds=iso(addDays(mo,k));
    ['lunch','dinner'].forEach(function(slot){
      if(slotItems(ds,slot).length)return;
      var p=planFor(ds,true);
      p[slot].push({r:next().id,p:1});
      added++;
    });
    if(S.planApplied)delete S.planApplied[ds];
    if(added)touch(ds);
  }
  saveS();Sync.schedule();render();refreshCard();
  showToast(added?(added+' Mahlzeiten eingeplant ✓'):'Die Woche ist schon voll');
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
        var r=resolve(it);if(!r)return;
        r.ingredients.forEach(function(ing){
          var key=String(ing.name||'').toLowerCase().trim();
          if(!key)return;
          if(!agg[key]){agg[key]={name:ing.name,emoji:ing.emoji||'',amount:0};order.push(key);}
          agg[key].amount+=(ing.amount||0)*(it.p||1);
        });
      });
    });
  }
  if(!days){showToast('Für diese Woche ist nichts geplant');return;}
  var ings=order.map(function(k){var a=agg[k];return{name:a.name,emoji:a.emoji,amount:Math.round(a.amount)};});
  var r=NTShop.addIngredients(ings,'Wochenplan KW '+isoWeek(mo));
  showToast(r.total?(r.total+' Zutaten aus '+days+' Tagen auf dem Zettel ✓'):'Nichts zu übernehmen');
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
  // Archivierte Tage (compressOldDays) haben kein meals-Objekt mehr; getDay()
  // liefert dort eine Wegwerf-Kopie. Hineinschreiben wuerde stillschweigend
  // nichts bewirken — deshalb wird es benannt statt getan.
  if(day._compressed){showToast('Dieser Tag ist archiviert und lässt sich nicht mehr befüllen');return;}
  if(!day.meals)day.meals={breakfast:[],lunch:[],dinner:[],snack:[]};
  if(!Array.isArray(day.exercise))day.exercise=[];
  var n=0;
  SLOTS.forEach(function(s){
    if(!Array.isArray(day.meals[s.id]))day.meals[s.id]=[];
    slotItems(date,s.id).forEach(function(it){
      var r=resolve(it);if(!r)return;
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
  showToast(n+' Mahlzeit'+(n===1?'':'en')+' ins Tagebuch übernommen ✓');
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
    var names=items.map(function(it){var r=resolve(it);return r?((r.emoji||'📋')+' '+esc(r.name)):'—';}).join(', ');
    rows+='<div style="display:flex;gap:6px;font-size:12px;margin-top:3px;"><span style="flex-shrink:0;">'+s.ic+'</span><span style="color:var(--tx);min-width:0;">'+names+'</span></div>';
  });
  var applied=S.planApplied&&S.planApplied[ds];
  body.innerHTML=rows
    +'<button type="button" class="seb" style="margin-top:8px;margin-bottom:0;" onclick="NTPlan.toDiary(\''+ds+'\')">'
    +(applied?'✓ Steht im Tagebuch — nochmal eintragen':'✓ Ins Tagebuch übernehmen')+'</button>';
}

// ══════════════════════════════════════════════════════════════════════════
// REZEPTE ANLEGEN — drei Wege
// ══════════════════════════════════════════════════════════════════════════
// Alle Overlays teilen sich z-index 300 — was spaeter im DOM steht, liegt oben.
// Die Bibliothek steht NACH den Rezept-Overlays und wuerde sie sonst verdecken.
// Sie wird deshalb geschlossen und nach dem Anlegen wieder geoeffnet.
var _from=null;
function newRecipe(){
  _from=isOpen('libraryOv')?'library':(isOpen('planOv')?'plan':null);
  if(_from==='library')closeOv('libraryOv');
  openOv('recNewOv');
}
function closeNew(){closeOv('recNewOv');backToOrigin();}
function closePhoto(){closeOv('recPhotoOv');backToOrigin();}
function isOpen(id){var e=document.getElementById(id);return !!(e&&e.classList.contains('open'));}
// Zurueck dorthin, wo „＋ Neues Rezept" angetippt wurde — ein Rezept anzulegen
// ist ein Zwischenschritt, kein Ortswechsel.
function backToOrigin(){
  var f=_from;_from=null;
  if(f==='library'&&typeof openLibrary==='function')setTimeout(function(){openLibrary();},200);
  else if(f==='plan')setTimeout(function(){render();openOv('planOv');},200);
}

// (1) Selbst anlegen: leeres Rezept + vorhandener Editor.
// Der Editor arbeitet auf einem VORHANDENEN Rezept — es muss also vorher
// angelegt werden. Wer den Editor gleich wieder schliesst, soll aber keine
// Karteileiche „Neues Rezept" in der Bibliothek zurueckbehalten: Die ID wird
// als Entwurf gemerkt und beim Schliessen verworfen, solange keine einzige
// Zutat drinsteht. Sobald etwas drinsteht, ist es ein echtes Rezept.
var _draftId=null;
function newBlank(){
  var r={id:Date.now().toString(),name:'Neues Rezept',emoji:'📋',ingredients:[],instructions:''};
  recipes.unshift(r);saveX();
  _draftId=r.id;_from=null;
  closeOv('recNewOv');
  setTimeout(function(){
    if(typeof openRecipeEditor==='function')openRecipeEditor(r.id);
  },200);
}
function discardEmptyDraft(){
  if(!_draftId)return;
  var id=_draftId;_draftId=null;
  var r=rec(id);
  if(r&&!(r.ingredients||[]).length){
    recipes=recipes.filter(function(x){return x.id!==id;});
    // `recipes` ist eine globale Variable aus index.html — die Neuzuweisung
    // oben trifft die globale Bindung, weil hier kein eigenes `var` steht.
    saveX();
    if(typeof renderLibrary==='function')renderLibrary();
  }
}

// (3) Aus dem Internet: der vorhandene Link-Tab des Pickers kann das schon —
//     Seite laden, Zutaten lesen, „📋 Als Rezept". Hier nur der Weg dorthin.
function newFromLink(){
  _from=null;
  closeOv('recNewOv');closeOv('planOv');closeOv('libraryOv');
  setTimeout(function(){
    if(typeof openPicker==='function')openPicker(null,'link');
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
  var res=document.getElementById('recPhotoResult');if(res)res.classList.add('hidden');
  var btn=document.getElementById('recPhotoBtn');if(btn){btn.disabled=true;btn.textContent='🤖 Rezept auslesen';}
  setStatus('',false);
  ['recPhotoCam','recPhotoGal'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var nm=document.getElementById('recPhotoName');if(nm)nm.value='';
  var po=document.getElementById('recPhotoPortions');if(po)po.value=1;
  var ins=document.getElementById('recPhotoIns');if(ins)ins.value='';
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
    img.src=e.target.result;
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
'{"titel":"...","portionen":4,"zutaten":[{"name":"Mehl","g":500}],"anleitung":"1. ...\\n2. ..."}\n'+
'Regeln:\n'+
'- "portionen" = die im Rezept angegebene Personen-/Portionszahl. Fehlt sie: 4.\n'+
'- "g" = Menge in GRAMM für genau diese Portionszahl, als Zahl ohne Einheit.\n'+
'  Haushaltsmaße umrechnen: 1 EL Öl/Butter ≈ 15, 1 TL ≈ 5, 1 Prise ≈ 1,\n'+
'  1 Ei ≈ 60, 1 Zwiebel ≈ 80, 1 Knoblauchzehe ≈ 5, 1 Tasse Mehl ≈ 120,\n'+
'  1 Becher Sahne ≈ 200, 1 Dose ≈ 400. Bei Flüssigkeiten gilt 1 ml ≈ 1 g.\n'+
'- Menge unklar oder "nach Geschmack": "g": null.\n'+
'- "name": einfacher deutscher Grundname ohne Zusätze wie "frisch gehackt",\n'+
'  "Bio" oder "zimmerwarm". Also "Petersilie", nicht "frisch gehackte Petersilie".\n'+
'- "anleitung": die Zubereitungsschritte als Text mit Zeilenumbrüchen. Steht auf\n'+
'  dem Bild keine Zubereitung: "".\n'+
'- Ist auf dem Bild gar kein Rezept zu erkennen: {"titel":"","portionen":0,"zutaten":[],"anleitung":""}';

function analyze(){
  if(!_photoB64)return;
  if(typeof isOnline!=='undefined'&&!isOnline){setStatus('Rezept auslesen braucht Internet.',true);return;}
  if(typeof canUseAi==='function'&&!canUseAi()){setStatus('KI ist nicht eingerichtet — Mehr → 🤖 KI.',true);return;}
  var btn=document.getElementById('recPhotoBtn');
  btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;gap:5px;align-items:center;"><span class="spin"></span>KI liest das Rezept…</span>';
  setStatus('Die KI liest die Seite …',false);
  callClaude('claude-sonnet-4-6',
    [{type:'image',source:{type:'base64',media_type:'image/jpeg',data:_photoB64}},{type:'text',text:PHOTO_PROMPT}],
    2048,
    function(text){
      btn.disabled=false;btn.textContent='📷 Erneut auslesen';
      var d=parseJson(text);
      if(!d||!d.zutaten||!d.zutaten.length){
        setStatus(text&&text.length?('Kein Rezept erkannt. KI: '+String(text).slice(0,140)):'Kein Rezept erkannt.',true);
        return;
      }
      _photoMeta={titel:String(d.titel||'').trim(),portionen:Math.max(1,parseFloat(d.portionen)||4),anleitung:String(d.anleitung||'').trim()};
      setStatus('Nährwerte werden nachgeschlagen …',false);
      lookupNutrients(d.zutaten.map(function(z){
        return {name:String(z.name||'').trim(),g:(z.g===null||z.g===undefined||z.g==='')?null:parseFloat(z.g)};
      }).filter(function(z){return !!z.name;}),function(resolved){
        _photoIngs=resolved;
        showResult();
        setStatus('',false);
      });
    },
    function(err){
      btn.disabled=false;btn.textContent='📷 Erneut auslesen';
      setStatus(typeof pickerFriendlyAiError==='function'?pickerFriendlyAiError(err):('Fehler: '+err),true);
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

function showResult(){
  var nm=document.getElementById('recPhotoName');
  if(nm&&!nm.value.trim())nm.value=(_photoMeta&&_photoMeta.titel)||'';
  var po=document.getElementById('recPhotoPortions');
  if(po)po.value=(_photoMeta&&_photoMeta.portionen)||4;
  var ins=document.getElementById('recPhotoIns');
  if(ins&&!ins.value.trim())ins.value=(_photoMeta&&_photoMeta.anleitung)||'';
  if(typeof pickerRenderIngList==='function'){
    pickerRenderIngList('recPhotoIngList',_photoIngs,
      function(i,v){_photoIngs[i].amount=parseFloat(v)||0;_photoIngs[i].missingGrams=false;updateTotal();},
      function(i){_photoIngs.splice(i,1);showResult();}
    );
  }
  updateTotal();
  var res=document.getElementById('recPhotoResult');if(res)res.classList.remove('hidden');
}
function updateTotal(){
  var el=document.getElementById('recPhotoTotal');if(!el)return;
  var p=Math.max(1,parseFloat((document.getElementById('recPhotoPortions')||{}).value)||1);
  var t=ingTotal(_photoIngs);
  el.textContent='Ganzes Rezept: '+totalStr(t)+'  ·  1 Portion: '+totalStr(scaleNutrients(t,1/p));
}

// Rezepte werden in NutriTrack JE PORTION gespeichert (ingTotal(rec.ingredients)
// ist eine Portion, der Eintrag multipliziert mit `portions`). Ein Kochbuch gibt
// die Mengen fuer N Portionen an — sie werden deshalb hier geteilt. `baseServings`
// merkt die urspruengliche Zahl, damit die Einkaufsliste sie vorschlagen kann.
function guessEmoji(name){
  var e=(typeof emo==='function')?emo(name):'';
  return (e&&e!=='🍽')?e:'📋';
}
function savePhotoRecipe(){
  if(!_photoIngs.length){showToast('Keine Zutaten');return;}
  var name=((document.getElementById('recPhotoName')||{}).value||'').trim();
  if(!name){showToast('Bitte einen Namen eintragen');return;}
  var p=Math.max(1,parseFloat((document.getElementById('recPhotoPortions')||{}).value)||1);
  var missing=_photoIngs.filter(function(g){return !g.amount;}).length;
  if(missing&&!confirm(missing+' Zutat'+(missing===1?' hat':'en haben')+' keine Menge und zählen mit 0 g. Trotzdem speichern?'))return;
  var r={
    id:Date.now().toString(),
    name:name,
    // emo() liefert '\ud83c\udf7d' (Teller), wenn es nichts erkennt — fuer ein Rezept
    // ist '\ud83d\udccb' die eingefuehrte Vorgabe, also wird nur ein echter Treffer genommen.
    emoji:guessEmoji(name),
    baseServings:p,
    ingredients:_photoIngs.map(function(g){
      return {name:g.name,emoji:g.emoji||'🍽',amount:Math.round(((g.amount||0)/p)*10)/10,per100:g.per100};
    }),
    instructions:((document.getElementById('recPhotoIns')||{}).value||'').trim()
  };
  recipes.unshift(r);saveX();
  closeOv('recPhotoOv');
  render();refreshCard();
  backToOrigin();
  showToast((r.emoji||'📋')+' '+r.name+' gespeichert ✓');
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
      var o={r:it.r,p:it.p||1};
      var snap=snapOf(it.r)||it.s;
      if(snap)o.s=snap;
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
      var it={r:o.r,p:o.p||1};
      if(o.s)it.s=o.s;
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
  pick:pick,renderPick:renderPick,addToSlot:addToSlot,
  openItem:openItem,saveItem:saveItem,deleteItem:deleteItem,removeItem:removeItem,
  itemToShop:itemToShop,planItemTotal:planItemTotal,
  openSync:openSync,renderSyncUI:renderSyncUI,openLinks:openLinks,syncNow:syncNow,Sync:Sync,
  newRecipe:newRecipe,newBlank:newBlank,newFromLink:newFromLink,newFromPhoto:newFromPhoto,
  discardEmptyDraft:discardEmptyDraft,backToOrigin:backToOrigin,closeNew:closeNew,closePhoto:closePhoto,
  handlePhoto:handlePhoto,analyze:analyze,resetPhoto:resetPhoto,
  savePhotoRecipe:savePhotoRecipe,updateTotal:updateTotal
};
})();
