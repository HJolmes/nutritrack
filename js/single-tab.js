// @ts-check
// NutriTrack – nur ein Fenster arbeitet (#261). Klassisches Script, exportiert window.NTTab.
//
// Jedes Fenster haelt sein eigenes S und schreibt bei saveS() das GANZE Objekt
// nach nt_v6. Zwei offene Fenster (zwei Tabs, PWA plus Browser-Tab) haben sich
// deshalb gegenseitig ueberschrieben: Der letzte Schreiber gewann, Eintraege des
// anderen waren weg.
//
// Wer den Web Lock haelt, startet die App. Ein zweites Fenster startet sie gar
// nicht erst, sondern wechselt auf tab.html — ein Fenster, das nicht laeuft,
// kann weder speichern noch synchronisieren. Das ist der Grund fuer die eigene
// Seite statt eines Overlays: Mehrere Module holen bei `visibilitychange` von
// sich aus ab (Einkauf, Wochenplan, Partner, Baby, Erinnerungen) und wuerden in
// einem nur verdeckten Fenster weiterlaufen.
//
// „Hier weiterarbeiten“ auf tab.html uebernimmt den Lock mit `steal`. Das
// bisherige Fenster verliert ihn, schreibt ab da nichts mehr (canWrite) und
// wechselt seinerseits auf tab.html. Ohne Web Locks (iOS vor 15.4) startet die
// App sofort wie bisher.
(function(){
'use strict';
var LOCK='nutritrack-main';
var _ready=false,_lost=false;

// saveS/saveX/saveBarcodeCache fragen das vor jedem Schreiben. Vor dem Start
// traegt S nur Vorgaben; ein Schreiben dann haette den Bestand ueberschrieben.
function canWrite(){return _ready&&!_lost;}

function toTabPage(){
  // Woher das Fenster kam (z. B. ?s=<id> eines geteilten Rezepts), damit
  // „Hier weiterarbeiten“ dorthin zurueckkehrt statt auf die nackte Startseite.
  try{sessionStorage.setItem('nt_tab_back',location.search+location.hash);}catch(e){}
  location.replace('tab.html');
}

function start(boot){
  var booted=false;
  function go(){
    if(booted)return;
    booted=true;_ready=true;
    boot();
  }
  if(!(navigator.locks&&typeof navigator.locks.request==='function')){go();return;}
  var take=false;
  try{take=sessionStorage.getItem('nt_tab_take')==='1';sessionStorage.removeItem('nt_tab_take');}catch(e){}
  // Rueckkehr vom OneDrive-Login: Der Code in der URL gilt nur einmal und waere
  // auf tab.html verloren — dieses Fenster uebernimmt deshalb immer.
  if(/[?&]code=/.test(location.search)&&/[?&]state=/.test(location.search))take=true;
  navigator.locks.request(LOCK,take?{steal:true}:{ifAvailable:true},function(lock){
    if(!lock){toTabPage();return;}
    go();
    return new Promise(function(){});// halten, solange dieses Fenster lebt
  }).catch(function(){
    if(booted){
      // Ein anderes Fenster hat uebernommen (steal → AbortError).
      _lost=true;
      toTabPage();
    }else{
      // Lock-API vorhanden, aber nicht nutzbar: lieber wie bisher starten als gar nicht.
      go();
    }
  });
}

window.NTTab={start:start,canWrite:canWrite};
})();
