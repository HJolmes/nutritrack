// NutriTrack – Zentrale Klick-Behandlung (v0.251)
// Klassisches Script, kein Modul. Exportiert window.NTActions.
//
// ── Warum es das gibt ─────────────────────────────────────────────────────
// Bis v0.250 trug das Markup 353 `onclick="…"`-Attribute. Ein onclick-Attribut
// wird vom Browser im GLOBALEN Geltungsbereich ausgewertet: `onclick="foo()"`
// findet ausschliesslich `window.foo`. Damit mussten alle 388 Funktionen des
// Inline-Scripts global sein — und genau das hat die Zerlegung des Monolithen
// blockiert, nicht ihre Laenge. Wer eine Funktion in ein Modul zog, musste sie
// entweder wieder an window haengen oder jede Aufrufstelle im Markup anfassen.
//
// Seither steht die Absicht im Markup und die Aufloesung hier:
//
//   <button data-act="openSettings">                      globale Funktion
//   <button data-act="NTStats.setRange" data-args="[7]">  Modul-Methode
//   <button data-act="closeOv" data-args='["helpOv"]'>    mit Argumenten
//   <div    data-bg-close="pickerOv">                     Klick auf den Grund
//   <button data-act="del" data-stop>                     ohne Weiterreichen
//
// ── Warum data-args JSON ist ──────────────────────────────────────────────
// Ein nahe liegender `data-arg="7"` waere immer eine Zeichenkette. Die Vorlagen-
// und Regel-IDs dieses Projekts sind `Date.now().toString()` und werden mit
// `===` verglichen — eine stille Wandlung nach Number haette genau dort einen
// Treffer verhindert, der vorher gefunden wurde. JSON haelt den Typ fest, den
// die Funktion erwartet, und laesst keinen Zweifel.
//
// ── Was die Delegation nebenbei loest ─────────────────────────────────────
// Ein Knopf, der per innerHTML NEU entsteht, braucht keinen neuen Handler: Der
// Listener haengt am Dokument und findet ihn beim naechsten Klick von selbst.
// Das ist der Grund, warum diese App bisher fast nur onclick benutzt hat — mit
// addEventListener haette jede Render-Funktion ihre Handler selbst nachziehen
// muessen.
//
// ── Koexistenz ────────────────────────────────────────────────────────────
// Die restlichen onclick-Attribute funktionieren unveraendert weiter. Ein
// Element traegt jedoch NIE beides — sonst feuerte die Aktion zweimal.
// tools/check.js prueft genau das.
(function(){
'use strict';

// Zusaetzlich registrierte Aktionen. Gedacht fuer Faelle, die keine globale
// Funktion sind (kleine Abfolgen, Bedingungen) — der Normalfall braucht sie
// nicht, weil `data-act` globale Funktionen und Modul-Methoden direkt findet.
var REGISTRY={};

function register(name,fn){
  if(name&&typeof name==='object'){Object.keys(name).forEach(function(k){REGISTRY[k]=name[k];});return;}
  REGISTRY[name]=fn;
}

// Aufloesung in dieser Reihenfolge: eigene Registry, dann Namespace-Methode
// (NTStats.setRange), dann globale Funktion. Lazy, also erst beim Klick — ein
// Modul, das spaeter geladen wird, ist damit trotzdem erreichbar.
function resolve(name){
  if(REGISTRY[name])return REGISTRY[name];
  if(name.indexOf('.')>0){
    var parts=name.split('.');
    var obj=window[parts[0]];
    for(var i=1;i<parts.length&&obj;i++)obj=obj[parts[i]];
    return typeof obj==='function'?obj.bind(window[parts[0]]):null;
  }
  return typeof window[name]==='function'?window[name]:null;
}

function args(el){
  var raw=el.getAttribute('data-args');
  if(!raw)return [];
  try{
    var v=JSON.parse(raw);
    return Array.isArray(v)?v:[v];
  }catch(e){
    // Lieber laut als stumm: ein kaputtes data-args ist ein Tippfehler im
    // Markup und kein Zustand, den ein Nutzer herbeifuehren kann.
    console.error('NTActions: data-args ist kein gueltiges JSON:',raw,el);
    return [];
  }
}

function run(name,el,ev){
  var fn=resolve(name);
  if(!fn){
    console.error('NTActions: Aktion "'+name+'" nicht gefunden.',el);
    return;
  }
  return fn.apply(el||window,el?args(el):[]);
}

function onClick(e){
  var t=e.target;
  if(!t||!t.closest)return;

  // 1. Klick auf den Grund einer Overlay-Flaeche. Bewusst NUR wenn das Ziel
  //    genau dieses Element ist: ein Klick auf den Inhalt darin darf nicht
  //    schliessen. Das ist dieselbe Bedingung, die bgClose() vorher stellte.
  if(t.hasAttribute&&t.hasAttribute('data-bg-close')){
    var id=t.getAttribute('data-bg-close')||t.id;
    if(id&&typeof window.closeOv==='function'){window.closeOv(id);}
    return;
  }

  // 2. Aktion am Element oder am naechsten Vorfahren, der eine traegt.
  var el=t.closest('[data-act]');
  if(!el)return;

  // Ein abgeschalteter Knopf IM Aktionsbereich darf dessen Aktion nicht
  // ausloesen. Gefragt wird das ANGEKLICKTE Element, nicht `el`: Ist `el` selbst
  // abgeschaltet, laesst der Browser gar kein Ereignis durch — eine Abfrage von
  // `el.disabled` waere toter Code. Genau das stand hier bis zur Gegenprobe.
  var dis=t.closest&&t.closest('[disabled],[aria-disabled="true"]');
  if(dis&&el.contains(dis))return;

  // Kein zweiter Schutz gegen doppeltes Ausloesen bei data-stop noetig, und
  // zwar nachgemessen: Das stopPropagation() in onCapture laeuft am Dokument in
  // der AUFFANGPHASE und verhindert die Blasenphase vollstaendig — dieser
  // Listener kommt dort gar nicht mehr an. Eine Abfrage auf data-stop waere
  // unerreichbar, so wie es die Abfrage auf el.disabled weiter oben war; die
  // Gegenprobe konnte sie mit keinem eingebauten Fehler rot machen. Abgesichert
  // ist der Fall stattdessen im Rauchtest: er verlangt, dass eine data-stop-
  // Aktion GENAU einmal laeuft, und wird rot, sobald jemand das
  // stopPropagation() entfernt.
  run(el.getAttribute('data-act'),el,e);
}

// data-stop soll das Ereignis von FREMDEN Listenern fernhalten — etwa einem
// onclick am Elternelement. Aus der Blasenphase heraus geht das nicht: Wenn der
// Listener am Dokument laeuft, ist das Ereignis an allen Elternelementen bereits
// vorbeigekommen, und stopPropagation() kommt zu spaet. Genau daran ist die
// erste Fassung in der Gegenprobe gescheitert — die Zusage stand im Kommentar
// und galt nicht.
//
// Deshalb ein zweiter Listener in der AUFFANGPHASE: Er laeuft vor allem anderen
// auf dem Weg nach unten. Sein stopPropagation() verhindert jede weitere
// Zustellung — auch die an onClick unten, weshalb er die Aktion selbst
// ausfuehrt. Fuer Elemente ohne data-stop aendert sich nichts.
function onCapture(e){
  var t=e.target;
  if(!t||!t.closest)return;
  var el=t.closest('[data-act][data-stop]');
  if(!el)return;
  var dis=t.closest('[disabled],[aria-disabled="true"]');
  if(dis&&el.contains(dis))return;
  e.stopPropagation();
  run(el.getAttribute('data-act'),el,e);
}

document.addEventListener('click',onCapture,true);
document.addEventListener('click',onClick);

window.NTActions={register:register,run:run,resolve:resolve};
})();
