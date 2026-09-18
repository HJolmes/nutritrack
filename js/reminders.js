// NutriTrack – Erinnerungen (v0.250)
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

// ── Mahlzeit-Erinnerungen ──
function scheduleReminders(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  var reminders=S.reminders||[];
  reminders.forEach(function(r){
    if(!r.active)return;
    var now=new Date();
    var target=new Date();
    var parts=r.time.split(':');
    target.setHours(parseInt(parts[0]),parseInt(parts[1]),0,0);
    if(target<=now)target.setDate(target.getDate()+1);
    var delay=target-now;
    setTimeout(function(){
      new Notification('🍽 NutriTrack – '+r.label,{body:r.body||'Zeit zum Eintragen!',icon:'/nutritrack/icon.svg'});
      scheduleReminders(); // nächsten Tag planen
    },delay);
  });
}

// ── Erinnerungen in Einstellungen ──
function renderReminders(){
  var el=document.getElementById('reminderList');if(!el)return;
  var reminders=S.reminders||[];
  if(!reminders.length){el.innerHTML='<div style="font-size:12px;color:var(--mu);">Keine Erinnerungen</div>';return;}
  el.innerHTML=reminders.map(function(r,i){
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
  S.reminders.push({time:time,label:label,active:true});
  saveS();
  document.getElementById('reminderTime').value='';
  document.getElementById('reminderLabel').value='';
  renderReminders();
  // Berechtigung anfragen
  if('Notification' in window&&Notification.permission==='default'){
    Notification.requestPermission().then(function(p){if(p==='granted')scheduleReminders();});
  } else {
    scheduleReminders();
  }
  showToast('⏰ Erinnerung gespeichert');
}

function deleteReminder(i){
  S.reminders.splice(i,1);saveS();renderReminders();
}

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
window.NTRemind={
  schedule:scheduleReminders,
  render:renderReminders,
  add:addReminder,
  del:deleteReminder
};
})();
