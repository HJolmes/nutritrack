// @ts-check
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
  // Das Foto bleibt in der Warteschlange (und in IndexedDB), bis die KI
  // geantwortet hat — schlaegt die Analyse fehl, ist es nicht verloren (#233).
  var item=_offlineQueue[0];
  var start=function(b64){
    if(!b64){
      _offlineQueue.shift();saveOfflineQueue();renderOfflineQueuePanel();
      showToast('Foto nicht mehr vorhanden');return;
    }
    // Sichtbar statt still: Tag des Fotos zeigen und den Picker mit dem Foto oeffnen.
    S.currentDate=item.date;
    renderAll();
    NTPicker.openPicker(item.meal,'foto');
    NTPicker.pickerResetPhoto();
    window._pickerPhotoB64=b64;
    document.getElementById('pickerPrev').src='data:image/jpeg;base64,'+b64;
    document.getElementById('pickerPrevWrap').classList.remove('hidden');
    document.getElementById('pickerPhotoPickArea').style.display='none';
    document.getElementById('pickerAnalyzeBtn').disabled=false;
    window._pickerQueueItem=item;
    NTPicker.pickerAnalyze();
  };
  if(item.phid&&window.NTPhotos&&NTPhotos.ok()){
    NTPhotos.get(item.phid).then(start).catch(function(){start(null);});
  }else{
    start(item.b64);
  }
}

// Von pickerAnalyze gerufen, sobald die KI geantwortet hat: erst jetzt
// verlaesst das Foto die Warteschlange.
function offlineQueueDone(item){
  var i=_offlineQueue.indexOf(item);if(i<0)return;
  _offlineQueue.splice(i,1);
  saveOfflineQueue();renderOfflineQueuePanel();
  if(item.phid&&window.NTPhotos&&NTPhotos.ok())NTPhotos.del(item.phid).catch(function(){});
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
// Intern bleiben: saveOfflineQueue
window.NTQueue={
  add:addToOfflineQueue,
  process:processOfflineQueue,
  done:offlineQueueDone,
  renderPanel:renderOfflineQueuePanel
};
})();
