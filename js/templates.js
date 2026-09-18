// NutriTrack – Mahlzeit-Vorlagen (v0.250)
// Klassisches Script, kein Modul. Exportiert window.NTTpl und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, renderAll, openOv, closeOv,
// esc, showToast, today, getDay, fmtDate, calcM, MEAL_NAMES).
//
// Eine Vorlage ist eine eingefrorene Kopie der Eintraege einer Mahlzeit. Bewusst
// eine KOPIE und keine Referenz: Wer das Fruehstueck von gestern als Vorlage
// sichert und den gestrigen Eintrag danach korrigiert, will die Vorlage nicht
// mitgeaendert haben.
//
// Gedeckelt auf 20 Stueck, neueste zuerst – S liegt vollstaendig in
// localStorage, und eine unbegrenzte Liste voller Mahlzeit-Kopien laeuft dort
// ueber Monate in die Quota.
(function(){
'use strict';

// ── Mahlzeit-Vorlagen ──
function saveMealAsTemplate(meal){
  var day=getDay();
  var entries=day.meals[meal]||[];
  if(!entries.length){showToast('Keine Einträge');return;}
  var name=MEAL_NAMES[meal]+' – '+fmtDate(S.currentDate);
  var template={id:Date.now().toString(),name:name,meal:meal,entries:JSON.parse(JSON.stringify(entries)),createdAt:today()};
  if(!S.mealTemplates)S.mealTemplates=[];
  S.mealTemplates.unshift(template);
  if(S.mealTemplates.length>20)S.mealTemplates=S.mealTemplates.slice(0,20);
  saveS();showToast('📋 Als Vorlage gespeichert');
}

function applyMealTemplate(id,meal){
  var tpl=(S.mealTemplates||[]).find(function(t){return t.id===id;});
  if(!tpl)return;
  var day=getDay();
  var copies=JSON.parse(JSON.stringify(tpl.entries));
  day.meals[meal]=day.meals[meal].concat(copies);
  saveS();renderAll();
  showToast('✓ Vorlage eingetragen');
  closeOv('templateOv');
}

function openTemplateOv(meal){
  pickerMeal=meal;
  var templates=S.mealTemplates||[];
  var el=document.getElementById('templateList');
  if(!el)return;
  if(!templates.length){el.innerHTML='<div style="text-align:center;color:var(--mu);padding:20px;font-size:13px;">Noch keine Vorlagen gespeichert</div>';openOv('templateOv');return;}
  el.innerHTML=templates.map(function(t){
    var total=t.entries.reduce(function(a,e){return a+(e.kcal||0);},0);
    return'<div style="background:var(--card);border-radius:12px;padding:12px;box-shadow:var(--sh);display:flex;align-items:center;gap:10px;">'
      +'<div style="flex:1;"><div style="font-weight:700;font-size:13px;">'+esc(t.name)+'</div>'
      +'<div style="font-size:11px;color:var(--mu);">'+t.entries.length+' Einträge · '+Math.round(total)+' kcal</div></div>'
      +'<button type="button" onclick="NTTpl.apply(\''+t.id+'\',\''+meal+'\')" style="background:var(--g2);border:none;border-radius:8px;color:white;font-size:13px;padding:6px 12px;font-weight:700;">Laden</button>'
      +'<button type="button" onclick="NTTpl.del(\''+t.id+'\')" style="background:none;border:none;color:var(--re);font-size:16px;">✕</button>'
      +'</div>';
  }).join('');
  openOv('templateOv');
}

function deleteTemplate(id){
  S.mealTemplates=(S.mealTemplates||[]).filter(function(t){return t.id!==id;});
  saveS();openTemplateOv(pickerMeal);
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
window.NTTpl={
  saveFromMeal:saveMealAsTemplate,
  open:openTemplateOv,
  apply:applyMealTemplate,
  del:deleteTemplate
};
})();
