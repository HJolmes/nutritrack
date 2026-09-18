// NutriTrack – Dashboard-Kacheln anordnen & ausblenden (v0.243)
// Klassisches Script, kein Modul. Exportiert window.NTDash und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, openOv, closeOv, esc, showToast).
//
// Die Kacheln auf „Heute" sind direkte Kinder von #mainScreen .main. Reihenfolge
// = DOM-Reihenfolge (Flex-Column), Sichtbarkeit = CSS-Klasse `dash-off`.
//
// WICHTIG: Ausgeblendet wird ueber eine !important-KLASSE, nicht ueber
// element.style.display. Mehrere Module (NTBaby, NTShop, NTPartner) setzen
// style.display selbst — ein zweiter Schreiber auf demselben Feld haette sich
// mit ihnen ueberschrieben. Die Klasse liegt darueber und laesst deren Logik
// unberuehrt: eine Kachel, die das Modul ohnehin versteckt, bleibt versteckt.
//
// Daten liegen in S.dashOrder / S.dashHidden (eigene Schluessel, NICHT in
// S.days) und sind damit automatisch Teil jedes Backups.
(function(){
'use strict';

// ── Register aller anordenbaren Kacheln ───────────────────────────────────
// Die Liste steht seit v0.253 in js/features.js (NTFeat) und nicht mehr hier.
// Grund: Dieses Modul ordnet und blendet aus — es kennt eine Kachel nur als
// Zeile im Bild. Was eine Funktion AUSMACHT (ihre Aktionen, ob man sie
// abschalten darf), ist eine andere Frage, und zwei Listen waeren zwei
// Wahrheiten, die auseinanderlaufen, sobald jemand eine Kachel hinzufuegt.
//
// Gelesen wird LAZY: NTFeat wird nach diesem Modul geladen, boot() laeuft aber
// erst bei DOMContentLoaded — dann steht es. Der Rueckfall auf [] gilt nur fuer
// den Fall, dass features.js gar nicht ausgeliefert wurde; die Kacheln stehen
// dann unsortiert im Markup statt zu verschwinden.
//
// `el`   = ID des DOM-Knotens in #mainScreen .main (in NTFeat: `card`)
// `auto` = Kachel hat eine EIGENE Sichtbarkeitslogik (Modul setzt display).
// Die Hero-Kachel (Kalorien) steht bewusst NICHT darin — sie ist der Kopf des
// Tages und bleibt immer oben.
function CARDS_(){
  var l=(window.NTFeat&&NTFeat.list&&NTFeat.list())||[];
  return l.map(function(f){
    return {id:f.id, el:f.card, ic:f.ic, label:f.label, sub:f.sub, auto:!!f.auto, fixed:!!f.fixed};
  });
}
function card(id){var c=CARDS_();for(var i=0;i<c.length;i++)if(c[i].id===id)return c[i];return null;}

// ── Reihenfolge: gespeicherte Liste, unbekannte IDs raus, neue ans Ende ────
// So taucht eine kuenftig hinzugefuegte Kachel bei Bestandsnutzern von selbst
// auf, statt still zu fehlen.
function order(){
  var saved=Array.isArray(S.dashOrder)?S.dashOrder:[];
  var out=[],seen={};
  saved.forEach(function(id){if(card(id)&&!seen[id]){seen[id]=true;out.push(id);}});
  CARDS_().forEach(function(c){if(!seen[c.id])out.push(c.id);});
  return out;
}
function hidden(){return Array.isArray(S.dashHidden)?S.dashHidden:[];}
function isHidden(id){return hidden().indexOf(id)>=0;}

// ── Anwenden: DOM sortieren + Klasse setzen ───────────────────────────────
function apply(){
  var main=document.querySelector('#mainScreen .main');
  if(!main)return;
  order().forEach(function(id){
    var c=card(id);if(!c)return;
    var el=document.getElementById(c.el);if(!el)return;
    el.classList.toggle('dash-off',isHidden(id));
    main.appendChild(el); // Flex-Column: appendChild in Reihenfolge = Sortierung
  });
}

function setHidden(id,off){
  var h=hidden().slice(),i=h.indexOf(id);
  if(off&&i<0)h.push(id);
  if(!off&&i>=0)h.splice(i,1);
  S.dashHidden=h;saveS();apply();
}
function toggle(id){setHidden(id,!isHidden(id));}

function move(id,dir){
  var o=order(),i=o.indexOf(id),j=i+dir;
  if(i<0||j<0||j>=o.length)return;
  o.splice(j,0,o.splice(i,1)[0]);
  S.dashOrder=o;saveS();apply();
}

function reset(){
  S.dashOrder=CARDS_().map(function(c){return c.id;});
  S.dashHidden=[];
  saveS();apply();
  showToast('Kacheln zurückgesetzt ✓');
}

// ── Editor ────────────────────────────────────────────────────────────────
// open()/close()/render() sind mit dem Overlay entfallen; den Katalog zeigt
// seit v0.253 NTFeat.openCatalog() in eigener Form.

// render() ist mit dem Overlay entfallen — es zeichnete in #dashList, das es
// seit v0.253 nicht mehr gibt. Die Liste zeichnet NTFeat.renderCatalog().


// ── Ziehen mit dem Finger ─────────────────────────────────────────────────
// Bewusst Pointer-Events statt HTML5-Drag-and-Drop: Letzteres gibt es auf iOS
// Safari praktisch nicht. Gezogen wird nur am Griff (⠿), damit ein Wischer auf
// der Zeile weiterhin die Liste scrollt und die Knoepfe antippbar bleiben.
var _drag=null;
function bindDrag(list){
  Array.prototype.forEach.call(list.querySelectorAll('.dash-grip'),function(g){
    g.addEventListener('pointerdown',function(ev){startDrag(ev,g,list);});
  });
}
function startDrag(ev,grip,list){
  var row=grip.closest('.dash-row');if(!row)return;
  ev.preventDefault();
  try{grip.setPointerCapture(ev.pointerId);}catch(e){}
  _drag={list:list,row:row,id:row.getAttribute('data-id'),grip:grip,startY:ev.clientY,moved:false};
  row.classList.add('is-drag');
  document.addEventListener('pointermove',onDrag);
  document.addEventListener('pointerup',endDrag);
  document.addEventListener('pointercancel',endDrag);
}
function onDrag(ev){
  if(!_drag)return;
  ev.preventDefault();
  if(Math.abs(ev.clientY-_drag.startY)>4)_drag.moved=true;
  // Zeile unter dem Finger suchen und davor/dahinter einhaengen. Der Vergleich
  // laeuft ueber die Mitte der Zielzeile — sonst springt die Reihenfolge an der
  // Kante hin und her.
  var rows=Array.prototype.slice.call(_drag.list.querySelectorAll('.dash-row'));
  for(var i=0;i<rows.length;i++){
    var r=rows[i];if(r===_drag.row)continue;
    var b=r.getBoundingClientRect();
    if(ev.clientY>=b.top&&ev.clientY<=b.bottom){
      var before=ev.clientY<b.top+b.height/2;
      _drag.list.insertBefore(_drag.row,before?r:r.nextSibling);
      break;
    }
  }
}
function endDrag(ev){
  if(!_drag)return;
  var d=_drag;_drag=null;
  document.removeEventListener('pointermove',onDrag);
  document.removeEventListener('pointerup',endDrag);
  document.removeEventListener('pointercancel',endDrag);
  d.row.classList.remove('is-drag');
  try{d.grip.releasePointerCapture(ev.pointerId);}catch(e){}
  if(!d.moved)return;
  var ids=Array.prototype.map.call(d.list.querySelectorAll('.dash-row'),function(r){return r.getAttribute('data-id');});
  S.dashOrder=ids;saveS();apply();
}

function boot(){
  if(!Array.isArray(S.dashOrder))S.dashOrder=CARDS_().map(function(c){return c.id;});
  if(!Array.isArray(S.dashHidden))S.dashHidden=[];
  apply();
}

window.NTDash={boot:boot,apply:apply,move:move,toggle:toggle,reset:reset,cards:CARDS_,isHidden:isHidden,orderOf:order};
})();
