// @ts-check
// NutriTrack – Ungespeicherte Änderungen in Dialogen (NTDirty)
// Klassisches Script, kein Modul. Exportiert window.NTDirty und nutzt nur den
// Kern aus index.html (openOv, closeOv, esc).
//
// Ein Dialog (.ov) mit einem Speichern-Knopf (.svb, dessen Aktion „save“ im
// Namen trägt) gilt als geändert, sobald jemand darin tippt oder wählt — nur
// echte Eingaben (isTrusted), nicht das Vorbefüllen durch die App. openOv und
// closeOv setzen die Markierung zurück.
//
// Wer einen geänderten Dialog verlässt (Pfeil ‹, untere Leiste, ✕, Tipp auf
// den Grund, Android-Zurück), läuft durch guard(ids, weiter): Bei Änderungen
// fragt #dirtyOv „Speichern / Verwerfen / Weiter bearbeiten“, sonst geht es
// sofort weiter. „Speichern“ löst den Speichern-Knopf des Dialogs aus; bleibt
// der Dialog danach offen (z. B. Pflichtfeld fehlt), endet der Weg dort.
// Der Rezept-Editor hat eine eigene Rückfrage (NTBook.editClosed) und ist
// ausgenommen.
(function(){
'use strict';

var SKIP=['recEditOv','dirtyOv','b3ActionOv'];
/** @type {Object<string,boolean>} */
var dirty={};
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
/** @param {Event} e */
function onEdit(e){
  if(!e.isTrusted)return;
  var t=/** @type {Element|null} */ (e.target);
  var ov=t&&t.closest?t.closest('.ov'):null;
  if(!ov||!ov.id||SKIP.indexOf(ov.id)>=0||!ov.classList.contains('open'))return;
  if(saveButton(ov))dirty[ov.id]=true;
}
document.addEventListener('input',onEdit,true);
document.addEventListener('change',onEdit,true);

/** @param {string} id */
function reset(id){delete dirty[id];}
/** @param {string} id */
function isOpen(id){var el=document.getElementById(id);return !!(el&&el.classList.contains('open'));}
/** @param {Array<string>} ids */
function dirtyAmong(ids){return (ids||[]).filter(function(id){return dirty[id]&&isOpen(id);});}
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
  if(b)b.click();
  if(isOpen(p.id))return;// Speichern hat nicht geschlossen (z. B. Pflichtfeld): hier bleiben.
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
