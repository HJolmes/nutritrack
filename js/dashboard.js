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
// `el`   = ID des DOM-Knotens in #mainScreen .main
// `auto` = Kachel hat eine EIGENE Sichtbarkeitslogik (Modul setzt display).
//          Fuer die Anzeige im Editor heisst das: „nur sichtbar, wenn …".
// Die Hero-Kachel (Kalorien) steht bewusst NICHT hier — sie ist der Kopf des
// Tages und bleibt immer oben.
var CARDS=[
  {id:'meals',    el:'mealsCard',    ic:'🍽',  label:'Mahlzeiten',        sub:'Frühstück, Mittag, Abend, Snack'},
  {id:'plan',     el:'planCard',     ic:'📅',  label:'Wochenplan',        sub:'Was heute gekocht wird'},
  {id:'exercise', el:'exerciseCard', ic:'🏃',  label:'Sport & Aktivität', sub:'Verbrannte Kalorien'},
  {id:'water',    el:'waterCard',    ic:'💧',  label:'Wasser',            sub:'Gläser und Schnell-Knöpfe'},
  {id:'baby',     el:'babyCard',     ic:'👶',  label:'Baby-Tagebuch',     sub:'nur bei eingeschaltetem Tagebuch', auto:true},
  {id:'partner',  el:'partnerCard',  ic:'📬',  label:'Vom Partner',       sub:'nur bei gekoppeltem Partner',      auto:true},
  {id:'shop',     el:'shopCard',     ic:'🛒',  label:'Einkaufszettel',    sub:'nur wenn etwas drauf steht',       auto:true},
  {id:'fast',     el:'fastCard',     ic:'🌙',  label:'Fasten',            sub:'Fastenfenster'}
];
function card(id){for(var i=0;i<CARDS.length;i++)if(CARDS[i].id===id)return CARDS[i];return null;}

// ── Reihenfolge: gespeicherte Liste, unbekannte IDs raus, neue ans Ende ────
// So taucht eine kuenftig hinzugefuegte Kachel bei Bestandsnutzern von selbst
// auf, statt still zu fehlen.
function order(){
  var saved=Array.isArray(S.dashOrder)?S.dashOrder:[];
  var out=[],seen={};
  saved.forEach(function(id){if(card(id)&&!seen[id]){seen[id]=true;out.push(id);}});
  CARDS.forEach(function(c){if(!seen[c.id])out.push(c.id);});
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
function toggle(id){setHidden(id,!isHidden(id));render();}

function move(id,dir){
  var o=order(),i=o.indexOf(id),j=i+dir;
  if(i<0||j<0||j>=o.length)return;
  o.splice(j,0,o.splice(i,1)[0]);
  S.dashOrder=o;saveS();apply();render();
}

function reset(){
  S.dashOrder=CARDS.map(function(c){return c.id;});
  S.dashHidden=[];
  saveS();apply();render();
  showToast('Kacheln zurückgesetzt ✓');
}

// ── Editor ────────────────────────────────────────────────────────────────
function open(){render();openOv('dashOv');}
function close(){closeOv('dashOv');}

function render(){
  var el=document.getElementById('dashList');if(!el)return;
  var o=order();
  el.innerHTML=o.map(function(id,i){
    var c=card(id);if(!c)return '';
    var off=isHidden(id);
    return '<div class="dash-row'+(off?' is-off':'')+'" data-id="'+esc(id)+'" data-idx="'+i+'">'
      +'<div class="dash-grip" title="Verschieben">⠿</div>'
      +'<div class="dash-ic">'+c.ic+'</div>'
      +'<div class="dash-body"><div class="dash-name">'+esc(c.label)+'</div>'
        +'<div class="dash-sub">'+esc(c.sub||'')+'</div></div>'
      +'<button type="button" class="dash-mv" onclick="NTDash.move(\''+esc(id)+'\',-1)"'+(i===0?' disabled':'')+'>▲</button>'
      +'<button type="button" class="dash-mv" onclick="NTDash.move(\''+esc(id)+'\',1)"'+(i===o.length-1?' disabled':'')+'>▼</button>'
      +'<button type="button" class="dash-eye" onclick="NTDash.toggle(\''+esc(id)+'\')" title="'+(off?'Einblenden':'Ausblenden')+'">'+(off?'🙈':'👁')+'</button>'
      +'</div>';
  }).join('');
  var n=o.length-hidden().length;
  var sub=document.getElementById('dashOvSub');
  if(sub)sub.textContent=n+' von '+o.length+' Kacheln sichtbar';
  bindDrag(el);
}

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
  S.dashOrder=ids;saveS();apply();render();
}

function boot(){
  if(!Array.isArray(S.dashOrder))S.dashOrder=CARDS.map(function(c){return c.id;});
  if(!Array.isArray(S.dashHidden))S.dashHidden=[];
  apply();
}

window.NTDash={boot:boot,apply:apply,open:open,close:close,render:render,move:move,toggle:toggle,reset:reset,cards:CARDS,isHidden:isHidden};
})();
