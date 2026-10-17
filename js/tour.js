// @ts-check
// NutriTrack – App-Tour
// Klassisches Script, kein Modul. Exportiert window.NTTour und greift nur auf
// den Kern aus index.html zu (closeOv, esc).
//
// Die Tour hebt Schritt fuer Schritt eine Stelle der App hervor und erklaert
// sie in einer Karte. Gestartet wird ueber die Hilfe (❓): von vorn oder an
// jedem einzelnen Punkt (Liste #helpTourList). Beenden geht jederzeit ueber
// ✕, „Beenden" oder Esc; die App bleibt dabei, wie sie war.
//
// Den Reiter wechselt die Tour, indem sie den Knopf der unteren Leiste
// antippt — denselben Weg, den sie gerade erklaert, und ohne switchTab aus
// index.html direkt zu rufen (Kopplung, #257).
(function(){
'use strict';

var OFF='Diese Kachel ist gerade ausgeschaltet. Einschalten unter Mehr → 🧩 Funktionen.';

// tab: Reiter, auf dem das Ziel liegt; sel: hervorgehobenes Element.
// Fehlt das Ziel oder ist es ausgeblendet, steht die Karte in der Mitte und
// nennt `off`.
var STEPS=[
  {tab:'main', sel:'#mainScreen .sum', ic:'🎯', t:'Tagesbilanz',
   x:'Groß steht, wie viele Kalorien heute noch übrig sind, darunter Gegessenes, Sport und die drei Makros (Protein, Kohlenhydrate, Fett). „▶ Nährwert-Details" klappt Zucker, Ballaststoffe, Salz und mehr auf.'},
  {tab:'main', sel:'#mainScreen .dn', ic:'📆', t:'Tage blättern',
   x:'Mit ‹ und › wechselst du den Tag. Alles auf „Heute" – Mahlzeiten, Sport, Wasser, Baby – gehört zum hier gezeigten Tag.'},
  {tab:'main', sel:'#mainScreen .hdr .hr > div:last-child', ic:'❓', t:'Kopfzeile',
   x:'❓ öffnet Hilfe und diese Tour. 📬 ist das Partner-Postfach (sobald ihr gekoppelt seid), 📤 teilt den angezeigten Tag. Ein Tipp auf die Versionsnummer zeigt, was neu ist.'},
  {tab:'main', sel:'#mealsCard .meals-grid', ic:'🍽', t:'Mahlzeiten',
   x:'Frühstück, Mittag, Abend und Snacks. Antippen öffnet die Mahlzeit: Einträge bearbeiten, ⎘ von gestern übernehmen, 📋 Vorlage, 🔁 Wiederholen an festen Wochentagen, 💾 als Rezept ins Kochbuch.'},
  {tab:'main', sel:'#mainScreen .bnav .cb', ic:'＋', t:'Essen eintragen',
   x:'Das ＋ öffnet die Erfassung. Im Chat tippst oder diktierst du einfach („2 Brötchen mit Käse"). Daneben: 📷 Foto, Barcode, 🔗 Link (Rezept-Seite oder geteilte Sendung), Suche, Zuletzt und Eigenes.'},
  {tab:'main', sel:'#planCard', ic:'📅', t:'Wochenplan', off:OFF,
   x:'Rezepte und Notizen auf die Woche verteilen. 🎲 Füllen plant leere Mahlzeiten passend zu deinem Kalorienziel; geplante Tage wandern auf Wunsch ins Tagebuch und auf den Einkaufszettel.'},
  {tab:'main', sel:'#bookCard', ic:'📖', t:'Kochbuch', off:OFF,
   x:'Deine Rezepte: suchen, filtern, Portionen umrechnen, 👨‍🍳 Kochmodus mit Timern. Neue Rezepte selbst, per Foto einer Kochbuchseite oder per Link anlegen.'},
  {tab:'main', sel:'#exerciseCard', ic:'🏃', t:'Sport & Aktivität', off:OFF,
   x:'„+ Eintragen" erfasst eine Aktivität mit Dauer; die verbrannten Kalorien kommen zu deinem Tagesbudget dazu. Workouts aus Apple oder Samsung Health holt der Sport-Sync (Mehr → 🧩 Funktionen → Sport).'},
  {tab:'main', sel:'#waterCard', ic:'💧', t:'Wasser', off:OFF,
   x:'Ein Tipp auf ein Glas oder einen Mengen-Knopf zählt mit. Das Tagesziel stellst du unter Mehr → 🧩 Funktionen → Wasser ein.'},
  {tab:'main', sel:'#shopCard', ic:'🛒', t:'Einkaufszettel', off:'Der Zettel erscheint hier, sobald etwas darauf steht oder er eingeschaltet ist – sonst über Mehr → 🧩 Funktionen → Einkaufszettel.',
   x:'Artikel eintippen („2 Liter Milch"), abhaken, nach Kategorien sortiert. Mit 🔗 Verbindungen teilt ihr den Zettel verschlüsselt zwischen zwei Handys.'},
  {tab:'main', sel:'#fastCard', ic:'🌙', t:'Fasten', off:OFF,
   x:'Startet ein Fastenfenster (z. B. 16:8) und zeigt, wie lange es noch läuft. Am Ende meldet sich die App, solange sie geöffnet ist.'},
  {tab:'main', sel:'#babyCard', ic:'👶', t:'Baby-Tagebuch', off:'Das Baby-Tagebuch ist aus. Einschalten unter Mehr → 🧩 Funktionen → Baby-Tagebuch.',
   x:'Stillen, Flasche, Windel, Schlaf, Temperatur und mehr mit einem Tipp. Dazu Verlauf, Wachstum, U-Heft, ❓ Fragen an Hebamme und Arzt und 💊 Medizin – auf Wunsch zu zweit synchron.'},
  {tab:'history', sel:'#historyScreen .main', ic:'📅', t:'Verlauf',
   x:'Die letzten 30 Tage mit Kalorien. Einen Tag antippen springt dorthin. 🗓 oben teilt einen ganzen Zeitraum.'},
  {tab:'trends', sel:'#statsScreen .main', ic:'📈', t:'Trends',
   x:'Kalorien über 7 oder 30 Tage, Gewichtsverlauf (heutiges Gewicht hier eintragen) und der Wochenbericht, den die KI auf Wunsch ausformuliert.'},
  {tab:'more', sel:'#moreScreen .main', ic:'☰', t:'Mehr',
   x:'Profil, Ziele, Ernährung, Erinnerungen, KI und Backup. Darunter Kochbuch, Wochenplan, Verbindungen und die Hilfe.'},
  {tab:'more', sel:'#moreScreen .list-row[data-act="NTFeat.openCatalog"]', ic:'🧩', t:'Funktionen',
   x:'Hier schaltest du Kacheln wie Wochenplan, Fasten oder Baby-Tagebuch ein und aus und legst ihre Reihenfolge auf „Heute" fest. Ein Tipp auf eine Funktion zeigt ihre Extras.'},
  {tab:'more', sel:'#moreScreen .list-row[data-act="NTSync.open"]', ic:'🔗', t:'Verbindungen',
   x:'Mit einem Code koppelst du ein zweites Handy: Einkaufszettel, Wochenplan und Baby-Tagebuch gemeinsam führen, das Partner-Postfach nutzen oder Alexa anbinden. Alles Ende-zu-Ende verschlüsselt.'},
  {tab:'main', sel:'#feedbackFab', ic:'🐛', t:'Feedback',
   x:'Fehler gefunden oder einen Wunsch? Der Käfer-Knopf schickt Feedback, auf Wunsch mit Bildschirmfoto.'}
];

var cur=-1;
var root=null;

function el(id){return document.getElementById(id);}

function build(){
  if(root)return root;
  root=document.createElement('div');
  root.id='tourRoot';
  root.innerHTML='<div class="tour-block"></div><div class="tour-spot" id="tourSpot"></div>'
    +'<div class="tour-card" id="tourCard" role="dialog" aria-live="polite">'
    +'<div class="tour-top"><span id="tourCount"></span><button type="button" class="tour-x" data-act="NTTour.end" aria-label="Tour beenden">✕</button></div>'
    +'<div class="tour-t" id="tourTitle"></div><div class="tour-x2" id="tourText"></div><div class="tour-off" id="tourOff"></div>'
    +'<div class="tour-nav"><button type="button" class="tour-b" data-act="NTTour.end">Beenden</button>'
    +'<span style="flex:1;"></span>'
    +'<button type="button" class="tour-b" id="tourPrev" data-act="NTTour.prev">‹ Zurück</button>'
    +'<button type="button" class="tour-b tour-go" id="tourNext" data-act="NTTour.next">Weiter ›</button></div></div>';
  document.body.appendChild(root);
  return root;
}

function visible(node){
  if(!node)return false;
  var r=node.getBoundingClientRect();
  return r.width>0&&r.height>0;
}

function showTab(tab){
  var b=/** @type {HTMLElement|null} */(document.querySelector('#mainScreen .bnav .ni[data-tab="'+tab+'"]'));
  var scr={main:'mainScreen',history:'historyScreen',trends:'statsScreen',more:'moreScreen'}[tab];
  var on=el(scr);
  if(b&&!(on&&on.classList.contains('active')))b.click();
}

function place(){
  if(cur<0||!root)return;
  var s=STEPS[cur];
  var target=document.querySelector(s.sel);
  var spot=el('tourSpot'), card=el('tourCard');
  if(!spot||!card)return;
  var vh=window.innerHeight, vw=window.innerWidth;
  var cw=Math.min(360,vw-24);
  card.style.width=cw+'px';
  card.style.left=Math.round((vw-cw)/2)+'px';
  if(!visible(target)){
    spot.style.display='none';
    card.style.top=Math.max(12,Math.round((vh-card.offsetHeight)/2))+'px';
    return;
  }
  var r=/** @type {HTMLElement} */(target).getBoundingClientRect();
  var pad=6;
  var top=Math.max(4,r.top-pad), bottom=Math.min(vh-4,r.bottom+pad);
  spot.style.display='block';
  spot.style.top=top+'px';
  spot.style.left=Math.max(4,r.left-pad)+'px';
  spot.style.width=(Math.min(vw-4,r.right+pad)-Math.max(4,r.left-pad))+'px';
  spot.style.height=Math.max(0,bottom-top)+'px';
  var ch=card.offsetHeight;
  // Unter das Ziel, wenn dort Platz ist, sonst darueber, sonst unten an den Rand.
  var y;
  if(bottom+10+ch<=vh-8)y=bottom+10;
  else if(top-10-ch>=8)y=top-10-ch;
  else y=Math.max(8,vh-ch-8);
  card.style.top=Math.round(y)+'px';
}

function show(i){
  if(i<0||i>=STEPS.length)return;
  cur=i;
  var s=STEPS[i];
  build();
  showTab(s.tab);
  var t=el('tourTitle'), x=el('tourText'), o=el('tourOff'), c=el('tourCount'), p=el('tourPrev'), n=el('tourNext');
  if(t)t.textContent=s.ic+' '+s.t;
  if(x)x.textContent=s.x;
  if(c)c.textContent=(i+1)+' / '+STEPS.length;
  if(p)/** @type {HTMLButtonElement} */(p).disabled=i===0;
  if(n)n.textContent=i===STEPS.length-1?'Fertig ✓':'Weiter ›';
  var target=document.querySelector(s.sel);
  var shown=visible(target);
  if(o){o.textContent=shown?'':(s.off||'');o.style.display=shown||!s.off?'none':'block';}
  // Fixe Elemente (＋, Käfer) nicht scrollen, sonst springt die Seite.
  if(shown&&target&&getComputedStyle(target).position!=='fixed'&&!target.closest('.bnav')){
    try{target.scrollIntoView({block:'center'});}catch(e){target.scrollIntoView();}
  }
  root.classList.add('on');
  place();
  requestAnimationFrame(place);
}

function onKey(e){
  if(cur<0)return;
  if(e.key==='Escape')end();
  else if(e.key==='ArrowRight')next();
  else if(e.key==='ArrowLeft')prev();
}

function start(i){
  var at=typeof i==='number'?i:0;
  closeOv('helpOv');
  document.body.classList.add('tour-open');
  window.addEventListener('resize',place);
  window.addEventListener('scroll',place,true);
  document.addEventListener('keydown',onKey);
  show(Math.max(0,Math.min(STEPS.length-1,at)));
}

function next(){if(cur>=STEPS.length-1){end();return;}show(cur+1);}
function prev(){if(cur>0)show(cur-1);}

function end(){
  if(cur<0)return;
  cur=-1;
  if(root)root.classList.remove('on');
  document.body.classList.remove('tour-open');
  window.removeEventListener('resize',place);
  window.removeEventListener('scroll',place,true);
  document.removeEventListener('keydown',onKey);
  showTab('main');
  try{window.scrollTo(0,0);}catch(e){}
}

// Einstiegsliste in der Hilfe: jeder erklaerte Punkt ist ein Startpunkt.
function renderList(){
  var box=el('helpTourList');
  if(!box)return;
  box.innerHTML=STEPS.map(function(s,i){
    return '<button type="button" class="tour-chip" data-act="NTTour.start" data-args="['+i+']">'+esc(s.ic+' '+s.t)+'</button>';
  }).join('');
}

renderList();

window.NTTour={start:start,next:next,prev:prev,end:end,steps:function(){return STEPS;},active:function(){return cur>=0;}};
})();
