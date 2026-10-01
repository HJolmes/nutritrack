// NutriTrack – Erinnerungen (v0.250, Timer und Anzeige v0.277)
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
// Bis v0.276 wurde der Rueckgabewert von setTimeout verworfen, und jedes
// Ausloesen plante ALLE Erinnerungen neu. Bei zwei Erinnerungen wuchs die Zahl
// der Meldungen je Tag wie die Fibonacci-Reihe (gemessen an Tag 4: 21 um 8 Uhr,
// 34 um 12 Uhr), und eine geloeschte feuerte weiter. Jetzt haelt _timers je
// Erinnerungs-Objekt genau einen Eintrag {t: Timer, at: Termin in ms};
// schedule() bricht zuerst alle ab und darf deshalb beliebig oft laufen.
var _timers=new Map();
// „HH:MM" aus <input type="time">. Eine ungueltige Zeit aus einem Import ergab
// frueher setTimeout(NaN) = sofort, und weil der Timer sich neu plant: eine
// Endlosschleife von Meldungen; eine fehlende warf in showMain() und brach den
// Rest des App-Starts ab. Solche Eintraege werden uebersprungen.
var TIME_RE=/^([01]?\d|2[0-3]):([0-5]\d)/;
// Spaeter als das wird eine Erinnerung nicht mehr gezeigt, sondern still auf den
// Folgetag gelegt (ENTSCHEIDUNG 2026-09-30). Android friert die App im
// Hintergrund ein; beim Oeffnen kamen sonst alle verpassten auf einmal.
var LATE_MS=15*60000;
// ── Fastenende (#249) ──
// Genau ein Einmal-Termin {t: Timer, at: Ende in ms, start: Fasten-Start} im
// selben Geruest wie die Erinnerungen: neu geplant beim Start (showMain), nach
// erteilter Berechtigung, bei Sichtbarkeit und im 60-s-Takt. Bis v0.277 stellte
// nur startFast() einen Timer und verwarf sein Handle – nach einem Neuladen oder
// Kaltstart kam die Meldung nie. Das Fasten selbst liegt in localStorage
// 'nt_fast' (index.html loadFast), nicht in S.
var _fast=null;

function cancel(r){
  var e=_timers.get(r);
  if(e){clearTimeout(e.t);_timers.delete(r);}
}
function cancelAll(){
  _timers.forEach(function(e){clearTimeout(e.t);});
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
// jetzt).
function planOne(r,after){
  cancel(r);
  if(!r||!r.active||!canNotify())return;
  var at=nextAt(r.time,Math.max(Date.now(),after||0));
  if(at)arm(r,at.getTime());
}
// Stellt den Timer von r auf den Termin `at` (ms) – der eine Ort, an dem ein
// Erinnerungs-Timer entsteht.
function arm(r,at){
  var e=_timers.get(r);
  if(e)clearTimeout(e.t);
  _timers.set(r,{at:at,tz:new Date(at).getTimezoneOffset(),t:setTimeout(function(){fire(r,at);},Math.max(0,at-Date.now()))});
}
// Beim Ausloesen wird ZUERST der Folgetag geplant und DANN angezeigt – scheitert
// die Anzeige, laeuft die Kette trotzdem weiter. Der Folgetermin rechnet vom
// ausgeloesten Termin aus, nicht von der Uhr: ein Timer, der eine Millisekunde
// zu frueh kommt, landet sonst noch einmal auf demselben Tag.
function fire(r,at){
  _timers.delete(r);
  // Geloescht oder durch einen Import ersetzt: nicht mehr melden.
  if((S.reminders||[]).indexOf(r)<0||!r.active)return;
  // Tagelang eingefroren: es zaehlt der juengste Termin bis jetzt, nicht der
  // gespeicherte – sonst fiele der von heute (vielleicht erst Minuten alt) mit weg.
  var n;
  while((n=nextAt(r.time,at))&&n.getTime()<=Date.now())at=n.getTime();
  planOne(r,at);
  if(Date.now()-at>LATE_MS)return;
  notify('⏰ NutriTrack – '+(r.label||'Erinnerung'),{
    body:r.body||'Zeit zum Eintragen!',
    // Je Erinnerung (Uhrzeit + Name) und Tag: zwei offene Tabs ergeben eine
    // Meldung statt zwei; zur selben Uhrzeit ersetzen sich nur Erinnerungen mit
    // gleichem Namen (gleicher Inhalt, eine Meldung), und die vom Vortag wird
    // nicht still ersetzt.
    tag:'nt-rem-'+r.time+'-'+(r.label||'')+'-'+ymd(new Date(at))
  });
}

// Liest nt_fast frisch und stellt den einen Fasten-Timer. Beim Kaltstart wird
// nur ein kuenftiges Ende geplant; ein schon vergangenes holt erst rearm() mit
// einem gespeicherten Termin nach (15-min-Regel wie oben, ENTSCHEIDUNG
// 2026-09-30 zu #249). Ohne laufendes Fasten wird nur abgebrochen.
function planFast(){
  if(_fast){clearTimeout(_fast.t);_fast=null;}
  var f=typeof window.loadFast==='function'?window.loadFast():null;
  if(!f||!canNotify())return;
  var end=f.start+f.hours*3600000;
  // {start:'x'} aus einem kaputten Eintrag ergaebe setTimeout(NaN) = sofort
  if(typeof f.start!=='number'||!isFinite(end))return;
  if(end>Date.now())armFast(f.start,end);
}
function armFast(start,at){
  if(_fast)clearTimeout(_fast.t);
  _fast={at:at,start:start,t:setTimeout(function(){fireFast(start,at);},Math.max(0,at-Date.now()))};
}
function fireFast(start,at){
  _fast=null;
  // Abgebrochen oder neu gestartet (auch in einem anderen Tab): nicht melden –
  // ein dort neu gestartetes Fasten aber hier planen, sonst meldet es nur der
  // andere Tab und nach dessen Schliessen niemand.
  var cur=typeof window.loadFast==='function'?window.loadFast():null;
  if(!cur||cur.start!==start){if(cur)planFast();return;}
  if(Date.now()-at>LATE_MS)return;
  notify('🌙 NutriTrack – Fasten beendet!',{body:'Du kannst wieder essen! ('+cur.hours+'h geschafft)',tag:'nt-fast-'+start});
}

// ── Mahlzeit-Erinnerungen ──
function scheduleReminders(){
  cancelAll();
  if(!canNotify())return;
  (S.reminders||[]).forEach(function(r){planOne(r);});
}

// App wieder vorn: die Timer neu stellen. Timer laufen auf einer Uhr, die im
// Geraeteschlaf steht – ein um 22 Uhr fuer 8 Uhr gestellter Timer kaeme nach
// acht Stunden Schlaf sonst erst am Nachmittag.
// - Ein Termin, der schon vorbei ist, feuert sofort mit seinem gespeicherten
//   Wert, und fire() entscheidet ueber die Verspaetung. Nicht schedule(): das
//   plante vom jetzigen Moment aus und verloere eine Erinnerung, die erst
//   Sekunden ueberfaellig ist.
// - Ein kuenftiger behaelt seinen Termin, nur mit frischer Wartezeit. Neu
//   gerechnet wird er nur, wenn die Zeitzone gewechselt hat (der Termin hat
//   jetzt einen anderen Offset als beim Stellen) – dann gilt 08:00 der neuen
//   Zone statt 02:00 nachts. Immer ab jetzt zu rechnen stellte nach einer
//   zurueckgestellten Uhr den gerade gezeigten Termin ein zweites Mal.
// - Eine Erinnerung ohne Timer (Kette ohne Berechtigung abgerissen, Berechtigung
//   erst spaeter erteilt) wird wieder aufgenommen.
function rearm(){
  var list=[],now=Date.now();
  _timers.forEach(function(e,r){list.push([r,e.at,e.tz]);});
  list.forEach(function(x){
    if(x[1]>now&&new Date(x[1]).getTimezoneOffset()!==x[2])planOne(x[0]);
    else arm(x[0],x[1]);
  });
  if(canNotify())(S.reminders||[]).forEach(function(r){if(r&&r.active&&!_timers.has(r))planOne(r);});
  // Fasten: ein gestellter Termin wird wie oben mit seinem gespeicherten Wert
  // neu gestellt, fireFast() entscheidet ueber die Verspaetung – solange nt_fast
  // noch dasselbe Fasten traegt. Sonst und ohne Timer (Berechtigung erst spaeter
  // erteilt, Start/Neustart in einem anderen Tab) neu planen.
  var cf=_fast&&typeof window.loadFast==='function'?window.loadFast():null;
  if(_fast&&cf&&cf.start===_fast.start)armFast(_fast.start,_fast.at);
  else planFast();
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible')rearm();
});
// Geraeteschlaf OHNE Sichtbarkeitswechsel (Desktop: das Fenster bleibt ueber das
// Zuklappen „sichtbar"): steht ein Timer noch aus, obwohl sein Termin vorbei ist,
// wird neu gestellt. Nach dem Aufwachen laeuft dieser Takt spaetestens nach einer
// Minute wieder – deutlich unter LATE_MS.
setInterval(function(){
  var due=false,now=Date.now()-1000;
  _timers.forEach(function(e){if(e.at<=now)due=true;});
  if(_fast&&_fast.at<=now)due=true;
  if(due)rearm();
},60000);

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

// Warum keine Meldung kommen kann – '' wenn sie kommen kann oder noch gefragt
// wird. Ein fester Text, keine Nutzerdaten (#249). Die API fehlt in iOS-Safari-
// Tabs ohne Home-Screen-App, in In-App-Browsern und in alten Browsern.
function notifyHint(){
  if(!('Notification' in window))return'Dieser Browser zeigt keine Meldungen (iPhone: NutriTrack zum Home-Bildschirm hinzufügen)';
  if(Notification.permission==='denied')return'Meldungen sind für NutriTrack blockiert (Browser-Einstellungen)';
  return'';
}

// ── Erinnerungen in Einstellungen ──
function renderReminders(){
  var el=document.getElementById('reminderList');if(!el)return;
  var reminders=S.reminders||[];
  if(!reminders.length){el.innerHTML='<div style="font-size:12px;color:var(--mu);">Keine Erinnerungen</div>';return;}
  var hint=notifyHint();
  el.innerHTML=(hint?'<div style="font-size:12px;color:var(--re);padding:4px 0;">⚠️ '+esc(hint)+'</div>':'')+reminders.map(function(r,i){
    if(!r)return'';
    // Position UND Inhalt: deleteReminder loescht nur, wenn an Position i noch
    // genau diese Erinnerung steht (#249). esc(), weil Name und Uhrzeit aus
    // einem Import beliebig sein koennen.
    return'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--br);">'
      +'<div style="flex:1;font-size:13px;font-weight:600;">'+esc(r.time)+' – '+esc(r.label)+'</div>'
      +'<button type="button" data-act="NTRemind.del" data-args="'+esc(JSON.stringify([i,r.time,r.label]))+'" style="background:none;border:none;color:var(--re);font-size:16px;cursor:pointer;">✕</button>'
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
  // Berechtigung anfragen – der Toast sagt, ob Meldungen kommen koennen, und
  // wartet deshalb auf die Antwort (#249).
  if('Notification' in window&&Notification.permission==='default'){
    Notification.requestPermission().then(function(p){
      if(p==='granted'){scheduleReminders();planFast();}
      renderReminders();
      savedToast();
    });
  } else {
    // Alle, nicht nur die neue: Wurde die Berechtigung erst nach dem Start
    // erteilt, sind die bestehenden noch nicht geplant. schedule() bricht
    // vorher alle ab, es entsteht kein Timer doppelt.
    scheduleReminders();
    planFast();
    savedToast();
  }
}
function savedToast(){
  var hint=notifyHint();
  showToast(hint?'⏰ Gespeichert – '+hint:'⏰ Erinnerung gespeichert',hint?5000:0);
}

// Loescht nur, wenn an Position i noch genau die Erinnerung steht, die der
// Knopf beim Zeichnen trug (Uhrzeit und Name) – sonst wird nichts geloescht und
// neu gezeichnet. Ein Knopf aus einem aelteren Zeichnen (Liste ersetzt durch
// Import oder ein anderes Fenster) trifft so nie eine fremde Erinnerung. Bei
// zwei gleichen Eintraegen darf es der Zwilling sein – inhaltlich dasselbe.
function deleteReminder(i,time,label){
  var list=S.reminders||[];
  var r=list[i];
  // Vergleich ueber JSON wie beim Zeichnen: ein Eintrag ohne Uhrzeit oder Name
  // (Import) kommt aus data-args als null zurueck, nicht als undefined.
  if(!r||(time!==undefined&&JSON.stringify([r.time,r.label])!==JSON.stringify([time,label]))){renderReminders();return;}
  cancel(r);
  list.splice(i,1);saveS();renderReminders();
}

// ── Zweites Fenster (#249) ──
// Loescht oder aendert ein anderer Tab Erinnerungen, uebernimmt dieser Tab NUR
// S.reminders und plant neu – sonst meldete sich eine geloeschte hier weiter,
// und das naechste saveS() dieses Tabs schriebe sie zurueck. Ausdruecklich ohne
// saveS() und ohne renderAll(): Die uebrigen Felder dieses Tabs sind aelter als
// die des anderen und duerfen dessen Stand nicht ueberschreiben (das allgemeine
// Mehrtab-Problem ist ein eigenes Thema). Der Vergleich vorher ist noetig, weil
// jedes saveS() im anderen Tab (etwa ein Wassertipp) das Ereignis ausloest.
// e.key===null (localStorage.clear() im anderen Tab) und ein geloeschtes nt_v6
// werden bewusst ignoriert: Dieser Tab behaelt seine Erinnerungen. Das Fasten
// braucht keinen Zweig, fireFast() liest nt_fast ohnehin frisch.
window.addEventListener('storage',function(e){
  if(e.key!=='nt_v6'||!e.newValue)return;
  var d;
  try{d=JSON.parse(e.newValue);}catch(x){return;}
  var next=d&&Array.isArray(d.reminders)?d.reminders:[];
  if(JSON.stringify(next)===JSON.stringify(S.reminders||[]))return;
  S.reminders=next;
  scheduleReminders();
  renderReminders();
});

// Nach aussen nur, was index.html und das generierte HTML wirklich rufen.
window.NTRemind={
  schedule:scheduleReminders,
  render:renderReminders,
  add:addReminder,
  del:deleteReminder,
  notify:notify,
  planFast:planFast,
  hint:notifyHint
};
})();
