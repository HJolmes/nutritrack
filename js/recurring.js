// NutriTrack – Wiederkehrende Mahlzeiten (v0.250)
// Klassisches Script, kein Modul. Exportiert window.NTRecur und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, renderAll, openOv, closeOv,
// esc, showToast, today, getDay, MEAL_NAMES, fmtDate).
//
// Zweck: Was jede Woche gleich ist – der Haferbrei am Werktagmorgen – soll nicht
// jeden Tag neu eingetippt werden. Eine Regel traegt Wochentage, ein Startdatum
// und die Eintraege, die sie setzt.
//
// WICHTIG: Angewendet wird beim Oeffnen eines Tages, nicht im Voraus. Wer Regeln
// fuer die ganze Zukunft schriebe, muesste sie beim Aendern oder Loeschen wieder
// einsammeln – und haette bei jedem Blaettern Eintraege in Tagen, die noch
// niemand gesehen hat. Statt dessen merkt sich der Tag in `_recurMarks`, welche
// Regel ihn schon getroffen hat: zweimal anwenden ist damit unmoeglich, und ein
// von Hand geloeschter Eintrag kommt nicht von selbst zurueck.
//
// Regeln liegen in S.recurringMeals (eigener Schluessel, NICHT in S.days) – sonst
// wuerde compressOldDays() sie nach 90 Tagen mit den Mahlzeiten wegraeumen.
(function(){
'use strict';

// ── Wiederkehrende Mahlzeiten (#122) ──
// Regel-Schema: {id,name,meal,weekdays:[0..6],entries:[...],startDate,active}
// weekdays nutzt JS getDay(): 0=So … 6=Sa. Default Mo–Fr = [1,2,3,4,5].
var WEEKDAY_SHORT=['So','Mo','Di','Mi','Do','Fr','Sa'];

var WEEKDAY_ORDER=[1,2,3,4,5,6,0]; // Anzeige: Mo zuerst

var pendingRecurMeal=null;

var pendingRecurWeekdays=null;

function _recurWeekday(dateKey){var p=dateKey.split('-');return new Date(+p[0],+p[1]-1,+p[2]).getDay();}

function _recurDaysLabel(wds){
  var s=(wds||[]).slice().sort(function(a,b){return a-b;}).join(',');
  if(s==='0,1,2,3,4,5,6')return'täglich';
  if(s==='1,2,3,4,5')return'Mo–Fr';
  if(s==='0,6')return'am Wochenende';
  return WEEKDAY_ORDER.filter(function(d){return wds.indexOf(d)>=0;}).map(function(d){return WEEKDAY_SHORT[d];}).join(', ');
}

// Wendet alle aktiven Regeln auf den Tag an. Idempotent über day._recurMarks:
// ist eine Regel-ID dort vermerkt, wird sie an diesem Tag nie erneut eingefügt —
// auch nicht, wenn der Nutzer die Einträge gelöscht hat. Gibt true bei Änderung.
function applyRecurringMeals(dateKey){
  var rules=S.recurringMeals||[];if(!rules.length)return false;
  if(dateKey>today())return false;
  var day=S.days[dateKey];
  if(day&&day._compressed)return false;
  if(!day){day={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},water:0,exercise:[]};S.days[dateKey]=day;}
  if(!day.meals)day.meals={breakfast:[],lunch:[],dinner:[],snack:[]};
  if(!day._recurMarks)day._recurMarks=[];
  var wd=_recurWeekday(dateKey),changed=false;
  rules.forEach(function(r){
    if(!r.active)return;
    if(dateKey<r.startDate)return;
    if((r.weekdays||[]).indexOf(wd)<0)return;
    if(day._recurMarks.indexOf(r.id)>=0)return;
    var copies=JSON.parse(JSON.stringify(r.entries||[]));
    copies.forEach(function(e){e._recurId=r.id;});
    if(!day.meals[r.meal])day.meals[r.meal]=[];
    day.meals[r.meal]=day.meals[r.meal].concat(copies);
    day._recurMarks.push(r.id);
    changed=true;
  });
  return changed;
}

// Für den aktuell angezeigten Tag anwenden und bei Änderung speichern + neu rendern.
function ensureRecurringForCurrentDay(){
  if(applyRecurringMeals(S.currentDate)){saveS();renderAll();}
}

// Regel aus der aktuellen Mahlzeit anlegen — öffnet Wochentag-Auswahl.
function openRecurCreate(meal){
  var day=getDay(),en=(day.meals[meal]||[]);
  if(!en.length){showToast('Keine Einträge in dieser Mahlzeit');return;}
  pendingRecurMeal=meal;
  pendingRecurWeekdays=[1,2,3,4,5];
  document.getElementById('recurCreateSub').textContent=MEAL_NAMES[meal]+' · '+en.length+' '+(en.length===1?'Eintrag':'Einträge');
  _renderRecurWeekdayChips();
  openOv('recurCreateOv');
}

function _renderRecurWeekdayChips(){
  var el=document.getElementById('recurWeekdayChips');if(!el)return;
  el.innerHTML=WEEKDAY_ORDER.map(function(d){
    var on=pendingRecurWeekdays.indexOf(d)>=0;
    return'<button type="button" onclick="NTRecur.toggleWeekday('+d+')" style="flex:1;min-width:0;padding:9px 0;border-radius:10px;border:1px solid '+(on?'var(--g1)':'var(--br)')+';background:'+(on?'var(--g1)':'var(--card)')+';color:'+(on?'#fff':'var(--tx)')+';font-weight:700;font-size:13px;cursor:pointer;">'+WEEKDAY_SHORT[d]+'</button>';
  }).join('');
}

function toggleRecurWeekday(d){
  var i=pendingRecurWeekdays.indexOf(d);
  if(i>=0)pendingRecurWeekdays.splice(i,1);else pendingRecurWeekdays.push(d);
  _renderRecurWeekdayChips();
}

function saveRecurringRule(){
  var meal=pendingRecurMeal;if(!meal)return;
  var wds=(pendingRecurWeekdays||[]).slice();
  if(!wds.length){showToast('Mindestens einen Wochentag wählen');return;}
  var day=getDay(),en=(day.meals[meal]||[]);
  if(!en.length){showToast('Keine Einträge');return;}
  var entries=JSON.parse(JSON.stringify(en));
  entries.forEach(function(e){delete e._recurId;});
  var rule={id:Date.now().toString(),meal:meal,weekdays:wds,entries:entries,startDate:today(),active:true,
    name:(en[0].name||MEAL_NAMES[meal])+(en.length>1?' +'+(en.length-1):'')};
  if(!S.recurringMeals)S.recurringMeals=[];
  S.recurringMeals.unshift(rule);
  // Heutige Einträge gehören schon zur Regel → markieren (kein Doppel heute) + Badge.
  if(!day._recurMarks)day._recurMarks=[];
  if(day._recurMarks.indexOf(rule.id)<0)day._recurMarks.push(rule.id);
  en.forEach(function(e){e._recurId=rule.id;});
  saveS();renderAll();
  closeOv('recurCreateOv');
  showToast('🔁 Wird '+_recurDaysLabel(wds)+' automatisch eingetragen');
}

function openRecurManage(){renderRecurManage();openOv('recurMgmtOv');}

function renderRecurManage(){
  var el=document.getElementById('recurMgmtList');if(!el)return;
  var rules=S.recurringMeals||[];
  if(!rules.length){el.innerHTML='<div style="text-align:center;color:var(--mu);padding:24px 8px;font-size:13px;line-height:1.5;">Noch keine wiederkehrenden Mahlzeiten.<br>Öffne eine Mahlzeit und tippe „🔁 Wiederholen", um eine anzulegen.</div>';return;}
  el.innerHTML=rules.map(function(r){
    var total=(r.entries||[]).reduce(function(a,e){return a+(e.kcal||0);},0);
    var dim=r.active?'':'opacity:0.5;';
    return'<div style="background:var(--card);border-radius:12px;padding:12px;box-shadow:var(--sh);display:flex;align-items:center;gap:10px;'+dim+'">'
      +'<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🔁 '+esc(r.name)+'</div>'
      +'<div style="font-size:11px;color:var(--mu);">'+MEAL_NAMES[r.meal]+' · '+_recurDaysLabel(r.weekdays)+' · '+Math.round(total)+' kcal</div></div>'
      +'<button type="button" onclick="NTRecur.toggleRule(\''+r.id+'\')" title="'+(r.active?'Pausieren':'Aktivieren')+'" style="background:'+(r.active?'var(--g2)':'var(--gl)')+';color:'+(r.active?'#fff':'var(--mu)')+';border:none;border-radius:8px;font-size:12px;padding:6px 10px;font-weight:700;flex-shrink:0;">'+(r.active?'Aktiv':'Pause')+'</button>'
      +'<button type="button" onclick="NTRecur.deleteRule(\''+r.id+'\')" style="background:none;border:none;color:var(--re);font-size:16px;flex-shrink:0;">✕</button>'
      +'</div>';
  }).join('');
}

function toggleRecurringRule(id){
  var r=(S.recurringMeals||[]).find(function(x){return x.id===id;});
  if(!r)return;
  r.active=!r.active;
  saveS();
  if(r.active)ensureRecurringForCurrentDay();
  renderRecurManage();
}

function deleteRecurringRule(id){
  S.recurringMeals=(S.recurringMeals||[]).filter(function(r){return r.id!==id;});
  saveS();renderRecurManage();
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
// Intern bleiben: _recurWeekday, _recurDaysLabel, _renderRecurWeekdayChips, renderRecurManage
window.NTRecur={
  apply:applyRecurringMeals,
  ensureToday:ensureRecurringForCurrentDay,
  openCreate:openRecurCreate,
  save:saveRecurringRule,
  openManage:openRecurManage,
  toggleWeekday:toggleRecurWeekday,
  toggleRule:toggleRecurringRule,
  deleteRule:deleteRecurringRule
};
})();
