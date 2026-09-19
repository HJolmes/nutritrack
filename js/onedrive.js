// NutriTrack – OneDrive-Backup (v0.250)
// Klassisches Script, kein Modul. Exportiert window.NTDrive und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, saveX, backupState, renderAll,
// openOv, closeOv, esc, showToast, today, foodCache, customFoods, recipes,
// barcodeCache, isOnline).
//
// ── Warum es das gibt ─────────────────────────────────────────────────────
// Bis v0.249 lag OneDrive in DREI Teilen von index.html verstreut: die
// OAuth-Konstanten und Pfad-Helfer in SECTION STORAGE, der Callback-Abfang und
// die Slot-Anzeige in SECTION INIT, die eigentlichen 16 Funktionen in SECTION
// NEW FEATURES – rund 3900 Zeilen auseinander. Wer den Sync anfasste, musste
// drei Stellen finden, die nichts miteinander zu tun zu haben schienen.
//
// ── Was es tut ────────────────────────────────────────────────────────────
// OAuth 2.0 mit PKCE gegen Microsoft Identity (kein Client-Secret – die App ist
// statisch ausgeliefert, ein Secret waere im Quelltext oeffentlich). Der
// Access-Token lebt eine Stunde, der Refresh-Token loest ihn still ab; schlaegt
// auch der fehl, kommt der Neuverbinden-Dialog statt eines stummen Fehlers.
//
// Gesichert wird in FUENF rotierende Slots statt in eine Datei: Ein kaputter
// Zustand, der einmal hochgeladen wurde, ueberschreibt sonst die einzige
// Sicherung. Mit der Rotation stehen immer die letzten fuenf Staende bereit.
//
// Tokens liegen in localStorage ('nt_od'), NICHT in S – sie gehoeren zum Geraet
// und haben in einem Backup nichts zu suchen, das auf ein anderes wandert.
(function(){
'use strict';

// ── OneDrive PKCE Config ──
var OD_CLIENT_ID='ae62274b-87de-4369-b1e5-9d6e45a724f4';

var OD_REDIRECT=location.origin+'/nutritrack/';

var OD_SCOPES='Files.ReadWrite User.Read offline_access';

var OD_FILE_PATH='/NutriTrack/nutritrack-backup.json';

var OD_SLOTS=5;

function _odFolder(){return (localStorage.getItem('nt_od_path')||'/NutriTrack').replace(/\/+$/,'');}

function _odSlotPath(idx){return _odFolder()+'/nutritrack-slot-'+(idx+1)+'.json';}

function _odSaveFolder(path){
  path=(path||'').trim().replace(/\/+$/,'');
  if(!path.startsWith('/'))path='/'+path;
  localStorage.setItem('nt_od_path',path);
  showToast('Pfad gespeichert: '+path);
  renderOneDriveStatus();
}

function _odSlotsMetaGet(){try{return JSON.parse(localStorage.getItem('nt_od_slots_meta')||'[null,null,null,null,null]');}catch(e){return [null,null,null,null,null];}}

function _odSlotsMetaSave(m){try{localStorage.setItem('nt_od_slots_meta',JSON.stringify(m));}catch(e){}}

function _odAutoSync(){
  if(!_odLoadTokens())return;
  if(!isOnline)return;
  if(localStorage.getItem('nt_od_sync_date')===today())return;
  oneDriveSyncSlot().catch(function(){});
}

function _checkOdBanner(){
  if(_odLoadTokens())return;
  var last=localStorage.getItem('nt_od_banner_date');
  if(last===today())return;
  localStorage.setItem('nt_od_banner_date',today());
  var el=document.getElementById('odMissingBanner');
  if(el)el.style.display='flex';
}

// ── OneDrive Sync (OAuth2 PKCE) ──
function _odLoadTokens(){try{return JSON.parse(localStorage.getItem('nt_od')||'null');}catch(e){return null;}}

function _odSaveTokens(t){localStorage.setItem('nt_od',JSON.stringify(t));}

function _odClearTokens(){localStorage.removeItem('nt_od');}

function _b64url(buf){
  return btoa(String.fromCharCode.apply(null,new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function _sha256(str){
  var buf=new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256',buf);
}

function _randomStr(len){
  var arr=new Uint8Array(len);
  crypto.getRandomValues(arr);
  return _b64url(arr);
}

function oneDriveConnect(){
  var verifier=_randomStr(48);
  var state=_randomStr(16);
  sessionStorage.setItem('od_verifier',verifier);
  sessionStorage.setItem('od_state',state);
  _sha256(verifier).then(function(hash){
    var challenge=_b64url(hash);
    var url='https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
      +'?client_id='+OD_CLIENT_ID
      +'&response_type=code'
      +'&redirect_uri='+encodeURIComponent(OD_REDIRECT)
      +'&scope='+encodeURIComponent(OD_SCOPES)
      +'&code_challenge='+challenge
      +'&code_challenge_method=S256'
      +'&state='+state;
    window.location.href=url;
  });
}

function _odHandleCallback(code,state){
  var verifier=sessionStorage.getItem('od_verifier');
  var savedState=sessionStorage.getItem('od_state');
  sessionStorage.removeItem('od_verifier');
  sessionStorage.removeItem('od_state');
  if(!verifier||state!==savedState){showToast('OneDrive: Ungültiger Status');return;}
  // Clean URL
  history.replaceState({},'',OD_REDIRECT);
  fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'client_id='+OD_CLIENT_ID
      +'&grant_type=authorization_code'
      +'&code='+encodeURIComponent(code)
      +'&redirect_uri='+encodeURIComponent(OD_REDIRECT)
      +'&code_verifier='+encodeURIComponent(verifier)
      +'&scope='+encodeURIComponent(OD_SCOPES)
  }).then(function(r){return r.json();}).then(function(t){
    if(t.error){showToast('OneDrive Fehler: '+t.error_description);return;}
    _odSaveTokens({
      access_token:t.access_token,
      refresh_token:t.refresh_token,
      expires_at:Date.now()+(t.expires_in-60)*1000
    });
    showToast('☁️ OneDrive verbunden ✓');
    renderOneDriveStatus();
  }).catch(function(){showToast('OneDrive Token-Fehler');});
}

function _odShowReconnect(){
  localStorage.removeItem('nt_od_banner_date');
  openOv('odReconnectOv');
}

function _odGetToken(){
  var tok=_odLoadTokens();
  if(!tok)return Promise.reject('not_connected');
  if(Date.now()<tok.expires_at)return Promise.resolve(tok.access_token);
  // Refresh
  return fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'client_id='+OD_CLIENT_ID
      +'&grant_type=refresh_token'
      +'&refresh_token='+encodeURIComponent(tok.refresh_token)
      +'&scope='+encodeURIComponent(OD_SCOPES)
  }).then(function(r){return r.json();}).then(function(t){
    if(t.error){
      if(t.error==='invalid_grant'||t.error==='interaction_required'||t.error==='unauthorized_client'){
        _odClearTokens();renderOneDriveStatus();_odShowReconnect();
      }
      throw new Error(t.error);
    }
    var updated={access_token:t.access_token,refresh_token:t.refresh_token||tok.refresh_token,expires_at:Date.now()+(t.expires_in-60)*1000};
    _odSaveTokens(updated);
    return updated.access_token;
  });
}

function oneDriveSyncUp(){
  if(!isOnline){showToast('Kein Internet');return Promise.reject('offline');}
  showToast('☁️ Hochladen...');
  return _odGetToken().then(function(token){
    var data=JSON.stringify(_backupAiFields({state:backupState(),foodCache:foodCache,customFoods:customFoods,recipes:recipes,barcodeCache:barcodeCache,syncedAt:new Date().toISOString()}));
    var kb=Math.round(data.length/1024);
    return fetch('https://graph.microsoft.com/v1.0/me/drive/root:'+_odFolder()+'/nutritrack-backup.json:/content',{
      method:'PUT',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:data
    }).then(function(r){
      if(!r.ok)throw new Error(r.status);
      localStorage.setItem('nt_last_sync',new Date().toISOString());
      localStorage.setItem('nt_od_sync_date',today());
      showToast('☁️ OneDrive gespeichert ✓ ('+kb+' KB)');
      renderOneDriveStatus();
    });
  }).catch(function(e){
    if(e==='not_connected'){showToast('OneDrive nicht verbunden');}
    else if(e!=='offline'){showToast('OneDrive Upload fehlgeschlagen');}
    throw e;
  });
}

function oneDriveSyncDown(){
  if(!isOnline){showToast('Kein Internet');return;}
  showToast('☁️ Herunterladen...');
  _odGetToken().then(function(token){
    return fetch('https://graph.microsoft.com/v1.0/me/drive/root:'+_odFolder()+'/nutritrack-backup.json:/content',{
      headers:{'Authorization':'Bearer '+token}
    }).then(function(r){
      if(r.status===404){showToast('Keine Sicherung in OneDrive gefunden');return null;}
      if(!r.ok)throw new Error(r.status);
      return r.json();
    }).then(function(backup){
      if(!backup)return;
      if(backup.state){delete backup.state.apiKey;S=Object.assign(S,backup.state);S.apiKey='';S.setupDone=true;}
      if(backup.foodCache)foodCache=backup.foodCache;
      if(backup.customFoods)customFoods=backup.customFoods;
      if(backup.recipes)recipes=backup.recipes;
      if(backup.barcodeCache)barcodeCache=backup.barcodeCache;
      _importAiFields(backup);_migratePhotosAfterImport();_dropEmptyNutrientEntries();
      saveS();saveX();saveBarcodeCache();
      renderAll();
      showToast('☁️ Daten aus OneDrive geladen ✓');
    });
  }).catch(function(e){
    if(e==='not_connected'){showToast('OneDrive nicht verbunden');}
    else{showToast('OneDrive Download fehlgeschlagen');}
  });
}

function oneDriveDisconnect(){
  _odClearTokens();
  showToast('OneDrive getrennt');
  renderOneDriveStatus();
}

function oneDriveSyncSlot(){
  if(!isOnline){showToast('Kein Internet');return Promise.reject('offline');}
  var meta=_odSlotsMetaGet();
  var idx=parseInt(localStorage.getItem('nt_od_slot_idx')||'0',10)%OD_SLOTS;
  showToast('☁️ Autospeicher '+(idx+1)+'/'+OD_SLOTS+' ...');
  return _odGetToken().then(function(token){
    var savedAt=new Date().toISOString();
    var data=JSON.stringify(_backupAiFields({state:backupState(),customFoods:customFoods,recipes:recipes,barcodeCache:barcodeCache,savedAt:savedAt}));
    var kb=Math.round(data.length/1024);
    return fetch('https://graph.microsoft.com/v1.0/me/drive/root:'+_odSlotPath(idx)+':/content',{
      method:'PUT',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:data
    }).then(function(r){
      if(!r.ok)throw new Error(r.status);
      meta[idx]={savedAt:savedAt};
      _odSlotsMetaSave(meta);
      localStorage.setItem('nt_od_slot_idx',((idx+1)%OD_SLOTS)+'');
      localStorage.setItem('nt_od_sync_date',today());
      localStorage.setItem('nt_last_sync',savedAt);
      showToast('☁️ Slot '+(idx+1)+' gespeichert ✓ ('+kb+' KB)');
      renderOneDriveStatus();
    });
  }).catch(function(e){
    if(e==='not_connected'){showToast('OneDrive nicht verbunden');}
    else if(e!=='offline'){showToast('Autospeicher fehlgeschlagen');}
    throw e;
  });
}

function _odSlotLoad(idx){
  if(!isOnline){showToast('Kein Internet');return;}
  var meta=_odSlotsMetaGet();
  if(!meta[idx]){showToast('Slot '+(idx+1)+' ist leer');return;}
  var d=new Date(meta[idx].savedAt);
  var label=d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  if(!confirm('Slot '+(idx+1)+' vom '+label+' laden?\nAktuelle Daten werden überschrieben.'))return;
  showToast('☁️ Herunterladen...');
  _odGetToken().then(function(token){
    return fetch('https://graph.microsoft.com/v1.0/me/drive/root:'+_odSlotPath(idx)+':/content',{
      headers:{'Authorization':'Bearer '+token}
    }).then(function(r){
      if(r.status===404){showToast('Slot '+(idx+1)+' nicht gefunden');return null;}
      if(!r.ok)throw new Error(r.status);
      return r.json();
    }).then(function(d){
      if(!d)return;
      if(d.state){delete d.state.apiKey;Object.assign(S,d.state);S.apiKey='';S.setupDone=true;}
      if(d.customFoods)customFoods=d.customFoods;
      if(d.recipes)recipes=d.recipes;
      if(d.barcodeCache)Object.assign(barcodeCache,d.barcodeCache);
      _importAiFields(d);_migratePhotosAfterImport();
      saveS();saveX();saveBarcodeCache();renderAll();closeOv('autoSavesOv');
      showToast('Stand geladen ✓');
    });
  }).catch(function(){showToast('Laden fehlgeschlagen');});
}

function renderOneDriveStatus(){
  var wrap=document.getElementById('odStatusWrap');
  if(!wrap)return;
  var tok=_odLoadTokens();
  var lastSync=localStorage.getItem('nt_last_sync');
  var lastStr=lastSync?new Date(lastSync).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';
  if(tok){
    var folder=_odFolder();
    wrap.innerHTML='<div style="background:var(--gl);border-radius:10px;padding:10px 12px;margin-bottom:8px;">'
      +'<div style="font-size:13px;font-weight:700;color:var(--g1);margin-bottom:2px;">✅ Verbunden</div>'
      +'<div style="font-size:12px;color:var(--mu);">Letzter Sync: '+lastStr+'</div>'
      +'</div>'
      +'<div style="margin-bottom:8px;">'
      +'<div style="font-size:12px;color:var(--mu);margin-bottom:4px;">📁 OneDrive-Ordner</div>'
      +'<div style="display:flex;gap:6px;">'
      +'<input id="odPathInput" type="text" value="'+esc(folder)+'" placeholder="/NutriTrack" style="flex:1;padding:8px 10px;border:2px solid var(--br);border-radius:8px;font-size:13px;outline:none;">'
      +'<button type="button" class="seb" style="width:auto;margin-top:0;flex-shrink:0;" onclick="NTDrive.saveFolder(document.getElementById(\'odPathInput\').value)">✓</button>'
      +'</div>'
      +'</div>'
      +'<button type="button" class="seb" onclick="NTDrive.syncUp()">☁️ Jetzt sichern</button>'
      +'<button type="button" class="seb" onclick="NTDrive.syncDown()">📥 Aus OneDrive laden</button>'
      +'<button type="button" class="seb" style="color:#c00;border-color:#c00;margin-top:4px;" onclick="NTDrive.disconnect()">🔌 Trennen</button>';
  } else {
    wrap.innerHTML='<div style="font-size:12px;color:var(--mu);margin-bottom:8px;">Verbinde NutriTrack mit deinem Microsoft-Konto, um Daten automatisch zu sichern.</div>'
      +'<button type="button" class="seb" onclick="NTDrive.connect()">🔗 Mit OneDrive verbinden</button>';
  }
}

// Nach aussen nur, was index.html wirklich ruft. Die OAuth-Interna
// (_odGetToken, _odSaveTokens, _b64url, …) bleiben drin: Wer sie von aussen
// braucht, umgeht die Token-Erneuerung.
window.NTDrive={
  SLOTS:OD_SLOTS,
  tokens:_odLoadTokens,
  slotsMeta:_odSlotsMetaGet,
  folder:_odFolder,
  saveFolder:_odSaveFolder,
  connect:oneDriveConnect,
  disconnect:oneDriveDisconnect,
  handleCallback:_odHandleCallback,
  syncUp:oneDriveSyncUp,
  syncDown:oneDriveSyncDown,
  syncSlot:oneDriveSyncSlot,
  slotLoad:_odSlotLoad,
  renderStatus:renderOneDriveStatus,
  autoSync:_odAutoSync,
  checkBanner:_checkOdBanner
};
})();
