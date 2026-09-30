// NutriTrack – Erinnerungen (v0.250, Timer und Anzeige v0.275)
// Klassisches Script, kein Modul. Exportiert window.NTRemind und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, esc, showToast).
//
// Web-Notifications, kein Push: Die App hat keinen Server, der etwas schicken
// koennte. Geplant wird per setTimeout auf den naechsten Zeitpunkt, und jede
// ausgeloeste Erinnerung plant sich selbst fuer den Folgetag neu.
//
// Bekannte Grenze, bewusst hingenommen: Timer sterben mit dem Tab. Auf iOS
// bedeutet das, dass Erinnerungen nur laufen, solange die App im Speicher ist.
// Der ehrliche Ersatz waere Web-Push mit VAPID-Schluesseln und einem Dienst, der
// sie zustellt – beides hat dieses Projekt nicht.
(function(){
'use strict';

// ── Genau ein Timer je Erinnerung (#244) ──
// Bis v0.274 wurde der Rueckgabewert von setTimeout verworfen, und jedes
// Ausloesen plante ALLE Erinnerungen neu. Bei zwei Erinnerungen wuchs die Zahl
// der Meldungen je Tag wie die Fibonacci-Reihe (gemessen an Tag 4: 21 um 8 Uhr,
// 34 um 12 Uhr), und eine geloeschte feuerte weiter. Jetzt haelt _timers je
// Erinnerungs-Objekt einen Timer; schedule() bricht zuerst alle ab und darf
// deshalb beliebig oft laufen.
var _timers=new Map();
// „HH:MM" aus <input type="time">. Eine ungueltige Zeit aus einem Import ergab
// frueher setTimeout(NaN) = sofort, und weil der Timer sich neu plant: eine
// Endlosschleife von Meldungen; eine fehlende warf in showMain() und brach den
// Rest des App-Starts ab. Solche Eintraege werden uebersprungen.
var TIME_RE=/^([01]?\d|2[0-3]):([0-5]\d)/;

function cancel(r){
  if(_timers.has(r)){clearTimeout(_timers.get(r));_timers.delete(r);}
}
function cancelAll(){
  _timers.forEach(function(t){clearTimeout(t);});
  _timers.clear();
}
function canNotify(){
  return 'Notification' in window&&Notification.permission==='granted';
}
function ymd(d){
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
// Naechster Termin zur Uhrzeit `time` STRENG nach `after` (ms). Die Uhrzeit wird
// nach jedem Tagessprung neu gesetzt: Am Tag der Sommerzeit-Umstellung gibt es
// 02:30 nicht (setHours liefert 03:30), und setDate allein truege diese 03:30 in
// den Folgetag weiter.
function nextAt(time,after){
  var m=TIME_RE.exec(typeof time==='string'?time:'');
  if(!m)return null;
  var h=parseInt(m[1],10),mi=parseInt(m[2],10);
  var t=new Date(after);
  t.setHours(h,mi,0,0);
  while(t.getTime()<=after){t.setDate(t.getDate()+1);t.setHours(h,mi,0,0);}
  return t;
}

// Plant die Erinnerung r fuer ihren naechsten Termin nach `after` (Vorgabe:
// jetzt). Beim Ausloesen wird ZUERST der Folgetag geplant und DANN angezeigt –
// scheitert die Anzeige, laeuft die Kette trotzdem weiter. Der Folgetermin
// rechnet vom ausgeloesten Termin aus, nicht von der Uhr: ein Timer, der eine
// Millisekunde zu frueh kommt, landet sonst noch einmal auf demselben Tag.
function planOne(r,after){
  cancel(r);
  if(!r||!r.active||!canNotify())return;
  var at=nextAt(r.time,Math.max(Date.now(),after||0));
  if(!at)return;
  _timers.set(r,setTimeout(function(){
    _timers.delete(r);
    // Geloescht oder durch einen Import ersetzt: nicht mehr melden.
    if((S.reminders||[]).indexOf(r)<0||!r.active)return;
    planOne(r,at.getTime());
    notify('🍽 NutriTrack – '+(r.label||'Mahlzeit eintragen'),{
      body:r.body||'Zeit zum Eintragen!',
      // Je Erinnerung (Uhrzeit + Name) und Tag: zwei offene Tabs ergeben eine
      // Meldung statt zwei; zwei Erinnerungen zur selben Uhrzeit ersetzen sich
      // nicht, und die vom Vortag wird nicht still ersetzt.
      tag:'nt-rem-'+r.time+'-'+(r.label||'')+'-'+ymd(at)
    });
  },at.getTime()-Date.now()));
}

// ── Mahlzeit-Erinnerungen ──
function scheduleReminders(){
  cancelAll();
  if(!canNotify())return;
  (S.reminders||[]).forEach(function(r){planOne(r);});
}

// ── Anzeige (#244) ──
// Ueber den Service Worker, wo es ihn gibt: Chrome auf Android lehnt
// new Notification() grundsaetzlich ab („Illegal constructor", seit Chrome 42),
// iOS-Home-Screen-Apps zeigen nur Meldungen aus dem Service Worker. Ohne
// Registrierung (Tab ausserhalb von /nutritrack/, tools/smoke.js) bleibt der
// alte Weg. getRegistration() statt ready: ready wartet ewig, wenn es keinen
// Worker gibt. Das Tippen auf die Meldung behandelt sw.js (notificationclick).
function notify(title,opts){
  if(!canNotify())return;
  opts=Object.assign({icon:'/nutritrack/icon.svg'},opts||{});
  function direct(){
    try{new Notification(title,opts);}catch(e){console.warn('Notification:',e);}
  }
  var sw=navigator.serviceWorker;
  if(!sw||!sw.getRegistration){direct();return;}
  sw.getRegistration().then(function(reg){
    if(reg&&reg.active&&reg.showNotification)return reg.showNotification(title,opts);
    direct();
  }).catch(function(e){console.warn('showNotification:',e);direct();});
}

// ── Erinnerungen in Einstellungen ──
function renderReminders(){
  var el=document.getElementById('reminderList');if(!el)return;
  var reminders=S.reminders||[];
  if(!reminders.length){el.innerHTML='<div style="font-size:12px;color:var(--mu);">Keine Erinnerungen</div>';return;}
  el.innerHTML=reminders.map(function(r,i){
    if(!r)return'';
    return'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--br);">'
      +'<div style="flex:1;font-size:13px;font-weight:600;">'+esc(r.time)+' – '+esc(r.label)+'</div>'
      +'<button type="button" onclick="NTRemind.del('+i+')" style="background:none;border:none;color:var(--re);font-size:16px;cursor:pointer;">✕</button>'
      +'</div>';
  }).join('');
}

function addReminder(){
  var time=document.getElementById('reminderTime').value;
  var label=document.getElementById('reminderLabel').value.trim()||'Mahlzeit eintragen';
  if(!time){showToast('Bitte Uhrzeit auswählen');return;}
  if(!S.reminders)S.reminders=[];
  var r={time:time,label:label,active:true};
  S.reminders.push(r);
  saveS();
  document.getElementById('reminderTime').value='';
  document.getElementById('reminderLabel').value='';
  renderReminders();
  // Berechtigung anfragen
  if('Notification' in window&&Notification.permission==='default'){
    Notification.requestPermission().then(function(p){if(p==='granted')scheduleReminders();});
  } else {
    // Alle, nicht nur die neue: Wurde die Berechtigung erst nach dem Start
    // erteilt, sind die bestehenden noch nicht geplant. schedule() bricht
    // vorher alle ab, es entsteht kein Timer doppelt.
    scheduleReminders();
  }
  showToast('⏰ Erinnerung gespeichert');
}

function deleteReminder(i){
  var list=S.reminders||[];
  cancel(list[i]);
  list.splice(i,1);saveS();renderReminders();
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
window.NTRemind={
  schedule:scheduleReminders,
  render:renderReminders,
  add:addReminder,
  del:deleteReminder,
  notify:notify
};
})();
