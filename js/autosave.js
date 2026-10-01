// @ts-check
// NutriTrack – lokaler Autospeicher in IndexedDB (window.NTAutoSave)
// Klassisches Script, kein Modul. Greift auf die globalen Helfer aus index.html
// zu (S, customFoods, recipes, backupState, _backupAiFields, _importAiFields,
// _migratePhotosAfterImport, saveS, saveX, renderAll, closeOv, showToast, today).
//
// ── Warum IndexedDB statt localStorage ────────────────────────────────────
// Bis v0.267 lagen bis zu drei volle Staende in localStorage ('nt_autosaves').
// WebKit (iOS) erlaubt dort ~5 MB und zaehlt UTF-16, also rund halb so viel
// Platz wie Chrome. Drei Kopien plus der State selbst reissen das Limit – der
// Fehler wurde verschluckt, und saveS() raeumte bei Platznot die Autospeicher
// sogar ab. IndexedDB hat auf iOS ein Vielfaches an Platz.
//
// iOS setzt eine Homescreen-App meist nur fort statt sie neu zu starten. Darum
// sichert die App zusaetzlich beim Zurueckkehren, wenn heute noch nichts
// gesichert wurde (runAutosave(true) in index.html).
(function(){
'use strict';
var DBN='nt-autosave',STORE='saves',KEY='list',MAX=3,_db=null;
var LEGACY='nt_autosaves',LAST='nt_autosave_at';

function open(){
  if(_db)return Promise.resolve(_db);
  return new Promise(function(res,rej){
    if(!window.indexedDB){rej(new Error('no_idb'));return;}
    var rq=indexedDB.open(DBN,1);
    rq.onupgradeneeded=function(){rq.result.createObjectStore(STORE);};
    rq.onsuccess=function(){_db=rq.result;res(_db);};
    rq.onerror=function(){rej(rq.error);};
  });
}
function idbGet(){
  return open().then(function(db){
    return new Promise(function(res,rej){
      var r=db.transaction(STORE,'readonly').objectStore(STORE).get(KEY);
      r.onsuccess=function(){res(r.result||[]);};
      r.onerror=function(){rej(r.error);};
    });
  });
}
function idbPut(list){
  return open().then(function(db){
    return new Promise(function(res,rej){
      var t=db.transaction(STORE,'readwrite');
      t.objectStore(STORE).put(list,KEY);
      t.oncomplete=function(){res();};
      t.onerror=function(){rej(t.error);};
      t.onabort=function(){rej(t.error);};
    });
  });
}
function legacyGet(){try{return JSON.parse(localStorage.getItem(LEGACY)||'[]');}catch(e){return [];}}

// Beim ersten Zugriff: IndexedDB pruefen und alte localStorage-Staende einmalig
// uebernehmen (gibt dort Platz frei). Ohne IndexedDB bleibt localStorage.
var _init=null,_idb=false;
function init(){
  if(!_init)_init=idbGet().then(function(cur){
    _idb=true;
    var old=legacyGet();
    if(!old.length)return;
    var merged=cur.concat(old).sort(function(a,b){return a.savedAt<b.savedAt?1:-1;}).slice(0,MAX);
    return idbPut(merged).then(function(){try{localStorage.removeItem(LEGACY);}catch(e){}});
  }).catch(function(){});
  return _init;
}
function list(){return init().then(function(){return _idb?idbGet():legacyGet();});}
function store(saves){
  if(_idb)return idbPut(saves);
  return Promise.resolve().then(function(){localStorage.setItem(LEGACY,JSON.stringify(saves));});
}

function snapshot(){
  return _backupAiFields({savedAt:new Date().toISOString(),state:backupState(),customFoods:JSON.parse(JSON.stringify(customFoods)),recipes:JSON.parse(JSON.stringify(recipes))});
}

function create(){
  var snap=snapshot();
  return list().then(function(saves){
    saves.unshift(snap);
    return store(saves.slice(0,MAX));
  }).then(function(){
    try{localStorage.setItem(LAST,snap.savedAt);}catch(e){}
    return true;
  }).catch(function(){
    showToast('⚠️ Autospeicher fehlgeschlagen – Gerätespeicher voll?');
    return false;
  });
}

function savedToday(){
  var at=localStorage.getItem(LAST);
  return !!at&&new Date(at).toDateString()===new Date().toDateString();
}

function load(idx){
  list().then(function(saves){
    var save=saves[idx];
    if(!save)return;
    var d=new Date(save.savedAt);
    var label=d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    if(!confirm('Stand vom '+label+' laden?\nAktuelle Daten werden überschrieben.'))return;
    if(save.state){delete save.state.apiKey;if(!('goalStart' in save.state))S.goalStart=null;Object.assign(S,save.state);S.apiKey='';S.setupDone=true;}
    if(save.customFoods)customFoods=save.customFoods;
    if(save.recipes)recipes=save.recipes;
    _importAiFields(save);_migratePhotosAfterImport();
    saveS();saveX();renderAll();NTRemind.schedule();NTRemind.render();closeOv('autoSavesOv');
    showToast('Stand geladen ✓');
  }).catch(function(){showToast('Laden fehlgeschlagen');});
}

// Zeilen fuer die Autospeicher-Liste; leerer String, wenn nichts da ist.
function rowsHtml(){
  return list().then(function(saves){
    return saves.map(function(s,i){
      var d=new Date(s.savedAt);
      var label=d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--gl);border-radius:12px;margin-bottom:8px;">'
        +'<div style="flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--tx);">'+label+'</div>'
        +'<button type="button" class="seb" style="width:auto;margin-top:0;padding:8px 14px;flex-shrink:0;" data-act="NTAutoSave.load" data-args="['+i+']">Laden</button>'
        +'</div>';
    }).join('');
  }).catch(function(){return '';});
}

document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible')return;
  if(!window.S||!S.setupDone||typeof runAutosave!=='function')return;
  runAutosave(true);
});

window.NTAutoSave={create:create,load:load,list:list,rowsHtml:rowsHtml,savedToday:savedToday};
})();
