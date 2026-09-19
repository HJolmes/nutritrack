// NutriTrack – Warteschlange fuer Fotos ohne Netz (v0.250)
// Klassisches Script, kein Modul. Exportiert window.NTQueue und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, esc, showToast, today,
// isOnline, canUseAi, analyzePhoto-Kette) sowie auf window.NTPhotos.
//
// Zweck: Ein Foto, das ohne Netz aufgenommen wird, soll nicht verloren sein. Es
// wandert in die Warteschlange und wird abgearbeitet, sobald wieder Netz da ist.
//
// WICHTIG: Das JPEG liegt in IndexedDB (NTPhotos), in localStorage steht nur
// seine Referenz. Ganze Bilder in nt_offline_queue liefen sonst gegen das
// 5-MB-Limit – und zwar genau dann, wenn ohnehin nichts hochgeladen werden kann.
(function(){
'use strict';

// ── Offline-Foto-Queue ──
var _offlineQueue=JSON.parse(localStorage.getItem('nt_offline_queue')||'[]');

function saveOfflineQueue(){localStorage.setItem('nt_offline_queue',JSON.stringify(_offlineQueue));}

function addToOfflineQueue(b64,meal,date){
  // Foto nach IndexedDB, in localStorage nur die Referenz (phid) — ganze
  // JPEGs in nt_offline_queue liefen sonst aufs 5-MB-Limit zu.
  if(window.NTPhotos&&NTPhotos.ok()){
    var pid='ph'+Date.now()+Math.random().toString(36).slice(2,8);
    NTPhotos.put(pid,b64).then(function(){
      _offlineQueue.push({phid:pid,meal:meal,date:date||today(),ts:Date.now()});
      saveOfflineQueue();renderOfflineQueuePanel();
    }).catch(function(){
      _offlineQueue.push({b64:b64,meal:meal,date:date||today(),ts:Date.now()});
      saveOfflineQueue();renderOfflineQueuePanel();
    });
  }else{
    _offlineQueue.push({b64:b64,meal:meal,date:date||today(),ts:Date.now()});
    saveOfflineQueue();renderOfflineQueuePanel();
  }
  showToast('📷 Foto für später gespeichert');
}

function renderOfflineQueuePanel(){
  var wrap=document.getElementById('offlineQueueWrap');
  var list=document.getElementById('offlineQueueList');
  if(!wrap||!list)return;
  if(!_offlineQueue.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  list.innerHTML=_offlineQueue.map(function(item,i){
    return'<div style="font-size:12px;color:var(--mu);padding:3px 0;">📷 '+fmtDate(item.date)+' – '+MEAL_NAMES[item.meal]+'</div>';
  }).join('');
}

function processOfflineQueue(){
  if(!isOnline){showToast('Kein Internet');return;}
  if(!_offlineQueue.length){showToast('Keine ausstehenden Fotos');return;}
  var item=_offlineQueue.shift();
  saveOfflineQueue();
  var start=function(b64){
    renderOfflineQueuePanel();
    if(!b64){showToast('Foto nicht mehr vorhanden');return;}
    window._pickerPhotoB64=b64;
    pickerMeal=item.meal;
    S.currentDate=item.date;
    pickerAnalyze();
  };
  if(item.phid&&window.NTPhotos&&NTPhotos.ok()){
    // Blob aus IDB holen; löschen ist ok — schlägt die Analyse fehl, re-queued
    // der Fehlerpfad das Foto ohnehin neu (addToOfflineQueue).
    NTPhotos.get(item.phid).then(function(b64){NTPhotos.del(item.phid).catch(function(){});start(b64);}).catch(function(){start(null);});
  }else{
    start(item.b64);
  }
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
// Intern bleiben: saveOfflineQueue
window.NTQueue={
  add:addToOfflineQueue,
  process:processOfflineQueue,
  renderPanel:renderOfflineQueuePanel
};
})();
