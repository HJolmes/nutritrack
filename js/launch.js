// @ts-check
// NutriTrack – Schnellauswahl (v0.329)
// Klassisches Script, kein Modul. Exportiert window.NTLaunch und greift nur auf
// den Kern aus index.html zu (S, saveS, showToast, esc, openOv, closeOv).
//
// ── Was es ist ────────────────────────────────────────────────────────────
// Ein Register von Aktionen, die man ohne Umweg erreichen will („Stillen
// starten", „Windel", „Mahlzeit"). Drei Einstiege teilen sich dieses Register:
//   1. App-Kurzbefehle aus manifest.json (Android: lange aufs App-Symbol
//      tippen, ein Eintrag laesst sich als eigenes Symbol auf den Startbildschirm
//      ziehen). Sie oeffnen `…/nutritrack/?action=<id>`; runFromUrl() fuehrt die
//      Aktion beim Start aus und nimmt den Parameter aus der Adresse.
//   2. Die Leiste oben auf „Heute" (#launchBar): Welche Aktionen dort stehen,
//      waehlt man unter Mehr → ⚡ Schnellauswahl (S.launchBar, Reihenfolge =
//      Reihenfolge dieser Liste). Gilt auf iPhone und Android.
//   3. Die Liste in manifest.json ist fest – eine PWA kann ihre Kurzbefehle
//      nicht pro Nutzer aendern. Neue ids dort nur mit Eintrag hier.
//
// ── Warum Wasser/Sport/Kochbuch von aussen kommen ─────────────────────────
// Ihre Funktionen stehen in index.html und gehoeren nicht zum Kern
// (tools/coupling-allow.json). index.html reicht sie per boot({id:fn}) herein,
// statt dass dieses Modul sie ruft.

(function(){
'use strict';

/** @type {{id:string,ic:string,label:string,sub:string,baby?:boolean}[]} */
var ACTIONS=[
  {id:'stillen', ic:'⏱',  label:'Stillen',       sub:'Stoppuhr starten, nächster Tipp stoppt', baby:true},
  {id:'wickeln', ic:'👶', label:'Wickeln',       sub:'Windel eintragen',                       baby:true},
  {id:'schlaf',  ic:'😴', label:'Schlaf',        sub:'Beginn, nächster Tipp beendet',          baby:true},
  {id:'mahlzeit',ic:'➕', label:'Mahlzeit',      sub:'Per Text oder Suche eintragen'},
  {id:'foto',    ic:'📷', label:'Foto-Mahlzeit', sub:'Foto machen, KI erkennt die Zutaten'},
  {id:'wasser',  ic:'💧', label:'Wasser',        sub:'Ein Glas eintragen'},
  {id:'sport',   ic:'🏃', label:'Sport',         sub:'Aktivität eintragen'},
  {id:'einkauf', ic:'🛒', label:'Einkaufszettel',sub:'Zettel öffnen'},
  {id:'vorrat',  ic:'🥫', label:'Vorrat',        sub:'Vorrat öffnen'},
  {id:'kochbuch',ic:'📖', label:'Kochbuch',      sub:'Rezepte öffnen'},
  {id:'plan',    ic:'📅', label:'Wochenplan',    sub:'Woche planen'}
];

/** @type {Object<string,function():void>} */
var _ext={};

function byId(id){for(var i=0;i<ACTIONS.length;i++)if(ACTIONS[i].id===id)return ACTIONS[i];return null;}

// Ausgewaehlte ids in Registerreihenfolge, unbekannte (aus einer neueren
// Version oder einem Backup) fallen weg.
function selected(){
  var sel=Array.isArray(S.launchBar)?S.launchBar:[];
  return ACTIONS.filter(function(a){return sel.indexOf(a.id)>=0;});
}

/** @param {string} id */
function run(id){
  var a=byId(id);
  if(!a)return;
  if(a.baby&&!S.babyOn){showToast('👶 Baby-Tagebuch ist aus – Mehr → 🧩 Funktionen');return;}
  switch(id){
    case 'stillen':
      if(!window.NTBaby)return;
      // Gleiche Logik wie der Stoppuhr-Schnell-Knopf: laeuft eine, wird sie
      // gestoppt, sonst startet eine neue (Seite = Vorschlag „naechste Seite").
      if(NTBaby.runningFeed())NTBaby.stopFeed();
      else{NTBaby.startFeed();NTBaby.openDiary();}
      return;
    case 'wickeln': if(window.NTBaby)NTBaby.openEntry('diaper');return;
    case 'schlaf':  if(window.NTBaby)NTBaby.toggleSleep();return;
    case 'mahlzeit':if(window.NTPicker)NTPicker.openPicker(null,'chat');return;
    case 'foto':    if(window.NTPicker)NTPicker.openPicker(null,'foto');return;
    case 'einkauf': if(window.NTShop)NTShop.open();return;
    case 'vorrat':  if(window.NTPantry)NTPantry.open();return;
    case 'plan':    if(window.NTPlan)NTPlan.open();return;
  }
  if(_ext[id])_ext[id]();
}

// ── Start ueber einen App-Kurzbefehl ──────────────────────────────────────
// Der Parameter verschwindet sofort aus der Adresse: Ein Neuladen (oder das
// Update-Banner) soll die Stoppuhr nicht ein zweites Mal umschalten.
function runFromUrl(){
  var id=null;
  try{id=new URLSearchParams(location.search).get('action');}catch(_e){}
  if(!id)return;
  try{
    var p=new URLSearchParams(location.search);p.delete('action');
    var q=p.toString();
    history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash);
  }catch(_e){}
  if(!byId(id))return;
  // Nach dem ersten Zeichnen: Dialoge brauchen das fertige DOM und den Zustand.
  setTimeout(function(){run(/** @type {string} */(id));},350);
}

/** @param {Object<string,function():void>} ext */
function boot(ext){
  _ext=ext||{};
  renderBar();
  runFromUrl();
}

// ── Leiste auf „Heute" ────────────────────────────────────────────────────
function renderBar(){
  var el=document.getElementById('launchBar');
  if(!el)return;
  // Baby-Aktionen nur, solange das Tagebuch an ist – sonst stuenden dort
  // Knoepfe, die nur „ist aus" melden.
  var list=selected().filter(function(a){return !a.baby||S.babyOn;});
  if(!list.length){el.style.display='none';el.innerHTML='';return;}
  el.style.display='flex';
  el.innerHTML=list.map(function(a){
    var lbl=a.label;
    if(a.id==='stillen'&&window.NTBaby&&S.babyOn&&NTBaby.runningFeed())lbl='Stillen stoppen';
    return '<button type="button" class="lb-btn" data-act="NTLaunch.run" data-args=\''+JSON.stringify([a.id])+'\'>'
      +'<span>'+a.ic+'</span>'+esc(lbl)+'</button>';
  }).join('');
}

// ── Mehr → ⚡ Schnellauswahl ──────────────────────────────────────────────
function open(){renderManage();openOv('launchOv');}
function renderManage(){
  var el=document.getElementById('launchBody');
  if(!el)return;
  var sel=Array.isArray(S.launchBar)?S.launchBar:[];
  el.innerHTML=ACTIONS.map(function(a){
    var on=sel.indexOf(a.id)>=0;
    var off=a.baby&&!S.babyOn;
    return '<div class="list-row" data-act="NTLaunch.toggle" data-args=\''+JSON.stringify([a.id])+'\'>'
      +'<div class="lr-ic">'+a.ic+'</div>'
      +'<div class="lr-body"><div class="lr-name">'+esc(a.label)+'</div>'
      +'<div class="lr-sub">'+esc(a.sub)+(off?' · Baby-Tagebuch ist aus':'')+'</div></div>'
      +'<div class="lr-val" style="font-size:18px;">'+(on?'✅':'⬜')+'</div></div>';
  }).join('');
}
/** @param {string} id */
function toggle(id){
  if(!byId(id))return;
  var sel=Array.isArray(S.launchBar)?S.launchBar.slice():[];
  var i=sel.indexOf(id);
  if(i>=0)sel.splice(i,1);else sel.push(id);
  S.launchBar=sel;
  saveS();
  renderManage();
  renderBar();
}

window.NTLaunch={
  ACTIONS:ACTIONS,run:run,boot:boot,renderBar:renderBar,
  open:open,toggle:toggle,runFromUrl:runFromUrl
};
})();
