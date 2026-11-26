// @ts-check
// NutriTrack – Ungespeicherte Änderungen in Dialogen (NTDirty)
// Klassisches Script, kein Modul. Exportiert window.NTDirty und nutzt nur den
// Kern aus index.html (openOv, closeOv, esc).
//
// Ein Dialog (.ov) mit einem Speichern-Knopf (.svb, dessen Aktion „save“ im
// Namen trägt) gilt als geändert, wenn ein Feld, das jemand bearbeitet hat
// (nur echte Eingaben, isTrusted), jetzt einen anderen Wert hat als vor der
// Bearbeitung. Tippen und wieder Löschen ist also keine Änderung. Den Wert
// vorher merkt sich focusin/pointerdown. openOv und closeOv setzen zurück.
//
// Ein Knopf im Dialog, der Felder selbst neu setzt (z. B. „＋ Hinzufügen“, das
// speichert und das Formular leert, oder „Bearbeiten“, das es füllt), macht den
// Dialog wieder unverändert (settle). Bleibt ein Feld nach dem Speichern-Knopf
// gleich (Pflichtfeld fehlt), bleibt die Änderung bestehen.
//
// Wer einen geänderten Dialog verlässt (Pfeil ‹, untere Leiste, ✕, Tipp auf
// den Grund, Android-Zurück), läuft durch guard(ids, weiter): Bei Änderungen
// fragt #dirtyOv „Speichern / Verwerfen / Weiter bearbeiten“, sonst geht es
// sofort weiter. „Speichern“ löst den Speichern-Knopf des Dialogs aus; bleibt
// danach eine Änderung offen (z. B. Pflichtfeld fehlt), endet der Weg dort.
// Der Rezept-Editor hat eine eigene Rückfrage (NTBook.editClosed) und ist
// ausgenommen.
(function(){
'use strict';

var SKIP=['recEditOv','dirtyOv','b3ActionOv'];
// Je Dialog die bearbeiteten Felder mit ihrem Wert vor der Bearbeitung.
/** @type {Object<string,Map<Element,string>>} */
var edits={};
/** @type {WeakMap<Element,string>} */
var seen=new WeakMap();
var FIELDS='input:not([type=button]):not([type=submit]):not([type=file]),select,textarea';
/** @type {{id:string,ids:Array<string>,then:function():void}|null} */
var pending=null;

/** @param {Element} el */
function saveButton(el){
  var list=el.querySelectorAll('.svb');
  for(var i=0;i<list.length;i++){
    var b=list[i];
    if(b.closest('.ov')!==el)continue;
    var act=(b.getAttribute('data-act')||'')+' '+(b.getAttribute('onclick')||'');
    if(/save|speicher/i.test(act))return /** @type {HTMLElement} */ (b);
  }
  return null;
}
/** @param {any} el */
function val(el){
  if(el.type==='checkbox'||el.type==='radio')return el.checked?'1':'0';
  return String(el.value==null?'':el.value);
}
/** @param {EventTarget|null} t */
function ovOf(t){
  var el=/** @type {Element|null} */ (t);
  var ov=el&&el.closest?el.closest('.ov'):null;
  if(!ov||!ov.id||SKIP.indexOf(ov.id)>=0||!ov.classList.contains('open'))return null;
  return ov;
}
// Wert vor der Bearbeitung merken.
/** @param {Event} e */
function onTouch(e){
  var t=/** @type {Element|null} */ (e.target);
  if(!t||!t.matches||!t.matches(FIELDS)||!ovOf(t))return;
  var m=null;for(var k in edits)if(edits[k].has(t))m=edits[k];
  if(!m)seen.set(t,val(t));
}
/** @param {Event} e */
function onEdit(e){
  if(!e.isTrusted)return;
  var t=/** @type {any} */ (e.target),ov=ovOf(t);
  if(!ov||!t.matches||!t.matches(FIELDS)||!saveButton(ov))return;
  var m=edits[ov.id]||(edits[ov.id]=new Map());
  if(m.has(t))return;
  var before=seen.has(t)?seen.get(t):null;
  // Häkchen ohne vorherigen Fokus (Tipp auf das Label): vorher war es umgekehrt.
  if(before==null&&(t.type==='checkbox'||t.type==='radio'))before=t.checked?'0':'1';
  m.set(t,before==null?'\u0000':before);
}
document.addEventListener('focusin',onTouch,true);
document.addEventListener('pointerdown',onTouch,true);
document.addEventListener('input',onEdit,true);
document.addEventListener('change',onEdit,true);

/** @param {Element} ov */
function snapshot(ov){
  /** @type {Map<Element,string>} */
  var m=new Map();
  ov.querySelectorAll(FIELDS).forEach(function(el){m.set(el,val(el));});
  return m;
}
// Ein Knopf hat Felder selbst neu gesetzt (gespeichert und geleert, Eintrag
// zum Bearbeiten geladen): der Dialog ist danach unverändert.
/** @param {Element} ov @param {Map<Element,string>} before */
function settle(ov,before){
  if(!edits[ov.id])return;
  var changed=false;
  before.forEach(function(v,el){if(el.isConnected&&val(el)!==v)changed=true;});
  if(changed)delete edits[ov.id];
}
/** @param {Event} e */
function onClick(e){
  var t=/** @type {Element|null} */ (e.target);
  var ov=ovOf(t);
  if(!ov||!edits[ov.id]||!t||!t.closest||t.closest('label,'+FIELDS))return;
  var before=snapshot(ov);
  setTimeout(function(){settle(ov,before);},0);
}
document.addEventListener('click',onClick,true);

/** @param {string} id */
function reset(id){delete edits[id];}
/** @param {string} id */
function isOpen(id){var el=document.getElementById(id);return !!(el&&el.classList.contains('open'));}
/** @param {string} id */
function isDirty(id){
  var m=edits[id],el=document.getElementById(id);
  if(!m||!el||!isOpen(id))return false;
  var d=false;
  m.forEach(function(v,f){if(f.isConnected&&el.contains(f)&&val(f)!==v)d=true;});
  return d;
}
/** @param {Array<string>} ids */
function dirtyAmong(ids){return (ids||[]).filter(isDirty);}
// Weiter nur, wenn keiner der Dialoge `ids` ungespeicherte Änderungen hat —
// sonst erst fragen. Der oberste geänderte Dialog wird zuerst gefragt.
/** @param {Array<string>} ids @param {function():void} then */
function guard(ids,then){
  var d=dirtyAmong(ids);
  if(!d.length){then();return;}
  var id=d[d.length-1],el=document.getElementById(id);
  var title=el&&el.querySelector('.mti');
  pending={id:id,ids:ids,then:then};
  var sub=document.getElementById('dirtySub');
  if(sub)sub.textContent=title&&title.textContent?'„'+title.textContent.trim()+'“ hat ungespeicherte Änderungen.':'Dieser Dialog hat ungespeicherte Änderungen.';
  openOv('dirtyOv');
}
function take(){var p=pending;pending=null;closeOv('dirtyOv');return p;}
function save(){
  var p=take();if(!p)return;
  var el=document.getElementById(p.id),b=el?saveButton(el):null;
  if(el&&b){var before=snapshot(el);b.click();settle(el,before);}
  if(isDirty(p.id))return;// Speichern hat nichts übernommen (z. B. Pflichtfeld): hier bleiben.
  reset(p.id);
  guard(p.ids,p.then);
}
function discard(){
  var p=take();if(!p)return;
  reset(p.id);
  guard(p.ids,p.then);
}
function cancel(){take();}

window.NTDirty={reset:reset,guard:guard,dirtyAmong:dirtyAmong,save:save,discard:discard,cancel:cancel};
})();
