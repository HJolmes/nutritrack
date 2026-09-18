// NutriTrack – Funktionen als Kacheln (v0.253)
// Klassisches Script, kein Modul. Exportiert window.NTFeat und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, openOv, closeOv, esc,
// showToast) sowie auf window.NTDash (Reihenfolge und Sichtbarkeit).
//
// ── Warum es das gibt ─────────────────────────────────────────────────────
// Bis v0.252 lag dieselbe Funktion an bis zu DREI Orten. Gemessen:
//   Baby-Tagebuch  Kachel + Mehr-Hub „Meine Inhalte" + Ein/Aus im Profil
//   Wasser         Kachel + Ziel unter „Ziele" + Erinnerung unter „Erinnerungen"
//   Mahlzeiten     Kachel + „Bibliothek" + „Wiederkehrende" (beide im Hub)
//   Sport          Kachel „Sport & Aktivität" + „Sport-Sync" unter „Daten & Sync"
// Der Hub trug 19 Eintraege in vier Gruppen, und diese Gruppen schnitten quer
// durch die Funktionen: Sport-Sync stand unter Daten, nicht unter Sport.
//
// Seither gilt: **eine Kachel, eine Funktion, ein Ort.** Die Kachel ist
// Einstieg, Inhalt UND Schalter. Was zu ihr gehoert, haengt an ihrem ⋯-Knopf.
//
// ── Warum die Liste hier steht und nicht in dashboard.js ──────────────────
// dashboard.js ordnet und blendet aus; es kennt die Kacheln nur als Zeilen im
// Bild. Was eine Funktion AUSMACHT — ihre Aktionen, ob man sie abschalten darf,
// ob sie sich selbst einblendet — ist eine andere Frage. Zwei Listen waeren
// zwei Wahrheiten, die auseinanderlaufen, sobald jemand eine Kachel hinzufuegt.
// dashboard.js liest deshalb `NTFeat.list()`.
//
// ── Der Knopf wird eingehaengt, nicht ins Markup geschrieben ──────────────
// Acht Kacheln von Hand zu aendern hiesse, dass die neunte ihn vergisst.
// `mount()` haengt ihn in die Kopfzeile jeder Kachel; `head` nennt den
// Selektor, weil zwei Kacheln aus ihrer Geschichte heraus anders gebaut sind:
// mealsCard ist `display:contents` mit `.sec-head`, partnerCard hat eine eigene
// Flex-Zeile.
(function(){
'use strict';

// ── Die Liste. Eine Zeile je Funktion. ────────────────────────────────────
// fixed:  laesst sich nicht abschalten (ohne Mahlzeiten ist die App leer).
// note:   Die Funktion ist eingeschaltet und die Kachel trotzdem nicht da,
//         weil ihr die Voraussetzung fehlt. Steht im Katalog unter dem Namen.
//         **Das ist die Ausnahme, nicht die Regel** (v0.254): Einkaufszettel
//         und Postfach haben sich bis dahin bei leerem Inhalt SELBST
//         ausgeblendet, waehrend ihr Schalter auf „an" stand — zwei Stellen,
//         die Verschiedenes ueber dieselbe Sache sagten. Sichtbarkeit haengt
//         seither am Schalter; nur das Postfach behaelt eine echte
//         Voraussetzung, weil es ohne Kopplung nichts zu zeigen haette.
// head:   Kopfzeile, in die der ⋯-Knopf kommt. Vorgabe '.wh'.
var FEATURES=[
  {id:'meals', ic:'🍽', label:'Mahlzeiten', card:'mealsCard', head:'.sec-head', fixed:true,
   sub:'Frühstück, Mittag, Abend, Snack',
   actions:[
     {ic:'📚', label:'Bibliothek',                hint:'Rezepte & eigene Lebensmittel', act:'openLibrary'},
     {ic:'🔁', label:'Wiederkehrende Mahlzeiten', hint:'Automatisch an festen Wochentagen', act:'NTRecur.openManage'},
     {ic:'🎙', label:'Alexa-Einwurf',             hint:'Per Sprache eintragen', act:'openAlexaSync'},
     {ic:'📥', label:'Code / Link einlösen',      hint:'Geteiltes Rezept übernehmen', act:'openImportPaste'}
   ]},

  {id:'plan', ic:'📅', label:'Wochenplan', card:'planCard',
   sub:'Rezepte auf die Woche verteilen',
   actions:[
     {ic:'📅', label:'Wochenplan öffnen', hint:'Woche planen, füllen, übernehmen', act:'NTPlan.open'},
     {ic:'🔗', label:'Verbindungen',      hint:'Plan mit jemandem teilen', act:'NTSync.open'}
   ]},

  {id:'shop', ic:'🛒', label:'Einkaufszettel', card:'shopCard',
   sub:'Was noch gekauft werden muss',
   actions:[
     {ic:'🛒', label:'Zettel öffnen', hint:'Artikel abhaken und ergänzen', act:'NTShop.open'},
     {ic:'🔗', label:'Verbindungen',  hint:'Zettel mit jemandem teilen', act:'NTSync.open'}
   ]},

  {id:'exercise', ic:'🏃', label:'Sport & Aktivität', card:'exerciseCard',
   sub:'Verbrannte Kalorien',
   actions:[
     {ic:'🏃', label:'Aktivität eintragen', hint:'Sport von Hand erfassen', act:'openExerciseOv'},
     {ic:'⌚', label:'Sport-Sync',          hint:'Apple Health · Samsung Health', act:'openHealthSync'}
   ]},

  {id:'water', ic:'💧', label:'Wasser', card:'waterCard',
   sub:'Gläser und Schnell-Knöpfe',
   actions:[
     {ic:'🎯', label:'Wasserziel',  hint:'Gläser pro Tag und Glasgröße', act:'NTFeat.openWaterGoal'},
     {ic:'⏰', label:'Erinnerung',  hint:'Ans Trinken erinnern lassen', act:'openSettings', args:['erinnerungen']}
   ]},

  {id:'fast', ic:'🌙', label:'Fasten', card:'fastCard',
   sub:'Fastenfenster im Blick',
   actions:[]},

  // `flag` heisst: Diese Funktion hat einen ECHTEN Schalter im Zustand, nicht
  // nur eine ausgeblendete Kachel. Er lag bis v0.252 im Profil unter
  // „Einstellungen → Profil" — also weder an der Kachel noch bei den anderen
  // Schaltern, sondern an einer dritten Stelle.
  {id:'baby', ic:'👶', label:'Baby-Tagebuch', card:'babyCard', flag:'babyOn',
   sub:'Stillen, Flasche, Windeln, Temperatur',
   actions:[
     {ic:'👶', label:'Tagebuch öffnen',   hint:'Einträge sehen und ergänzen', act:'NTBaby.openDiary'},
     {ic:'📝', label:'Angaben zum Baby', hint:'Name, Geburtsdatum, ein/aus', act:'NTFeat.openBabySettings'},
     {ic:'🔗', label:'Verbindungen',     hint:'Tagebuch mit jemandem teilen', act:'NTSync.open'}
   ]},

  {id:'partner', ic:'📬', label:'Vom Partner', card:'partnerCard', head:'>div',
   sub:'Mahlzeiten direkt zugeschickt bekommen',
   note:'Erscheint, sobald eine Kopplung besteht',
   actions:[
     {ic:'📬', label:'Postfach',    hint:'Empfangene Sendungen übernehmen', act:'NTPartner.openInbox'},
     {ic:'🤝', label:'Kopplung',    hint:'Partner verbinden oder lösen', act:'NTPartner.open'}
   ]}
];

function list(){return FEATURES;}
function byId(id){for(var i=0;i<FEATURES.length;i++)if(FEATURES[i].id===id)return FEATURES[i];return null;}

// ── Der ⋯-Knopf ───────────────────────────────────────────────────────────
// Eingehaengt statt ins Markup geschrieben: So bekommt ihn jede kuenftige
// Kachel von selbst, und keine Kachel traegt ihn doppelt (die Wache unten).
function mount(){
  FEATURES.forEach(function(f){
    var el=document.getElementById(f.card);
    if(!el)return;
    // '>div' meint „das erste Kind". Das ist KEIN gueltiger CSS-Selektor —
    // querySelector wirft darauf eine Ausnahme, und zwar bevor ein Rueckfall
    // danach greifen koennte. Deshalb vorher abfangen, nicht hinterher.
    var head=(f.head==='>div')?el.firstElementChild:el.querySelector(f.head||'.wh');
    if(!head||head.querySelector('.feat-dots'))return;
    var b=document.createElement('button');
    b.type='button';
    b.className='feat-dots';
    b.setAttribute('data-act','NTFeat.sheet');
    b.setAttribute('data-args',JSON.stringify([f.id]));
    b.setAttribute('aria-label',f.label+' – Aktionen');
    b.textContent='⋯';
    head.appendChild(b);
    // Die Kopfzeilen sind historisch verschieden gebaut; ohne das hier saesse
    // der Knopf bei .sec-head am Text statt am rechten Rand.
    if(getComputedStyle(head).display.indexOf('flex')<0)head.style.display='flex';
    head.style.alignItems='center';
    if(!head.style.justifyContent)head.style.justifyContent='space-between';
  });
}

// ── Das Blatt einer Funktion ──────────────────────────────────────────────
function sheet(id){
  var f=byId(id);
  if(!f)return;
  var el=document.getElementById('featSheetBody');
  if(!el)return;
  document.getElementById('featSheetTitle').textContent=f.ic+' '+f.label;

  var html='';
  (f.actions||[]).forEach(function(a,i){
    // Die Zeile ruft NICHT die Aktion selbst, sondern act() — und das schliesst
    // das Blatt vorher. Grund: Alle `.ov` teilen `z-index:300`, oben liegt also
    // das, was in der DOM-Reihenfolge zuletzt steht. `featSheetOv` steht fast am
    // Ende, damit lag es ueber 13 der 17 Ziele; das geoeffnete Menue erschien
    // dahinter und war nicht bedienbar. Die vier Ausnahmen waren kein Verdienst,
    // sondern Zufall der Markup-Reihenfolge — deshalb geht JEDE Aktion durch
    // dieselbe Stelle, statt vier Sonderfaelle stehen zu lassen.
    html+='<div class="list-row" data-act="NTFeat.act" data-args=\''+JSON.stringify([f.id,i])+'\'>'
      +'<div class="lr-ic">'+a.ic+'</div>'
      +'<div class="lr-body"><div class="lr-name">'+esc(a.label)+'</div>'
      +'<div class="lr-sub">'+esc(a.hint||'')+'</div></div>'
      +'<div class="lr-arrow">›</div></div>';
  });

  // Der Schalter gehoert AN die Funktion. Bis v0.252 lag er fuer das
  // Baby-Tagebuch im Profil und fuer alles andere im Hub unter „Kacheln auf
  // Heute" — an zwei Stellen also, die beide nicht die Funktion sind.
  if(!f.fixed){
    var off=isOff(f);
    // Bei einer Funktion mit eigenem Schalter (Baby-Tagebuch) ist „ausblenden"
    // das falsche Wort — dort wird die Funktion wirklich abgeschaltet.
    var an  = f.flag ? 'Tagebuch einschalten'  : 'Auf „Heute" zeigen';
    var aus = f.flag ? 'Tagebuch ausschalten'  : 'Von „Heute" ausblenden';
    html+='<div class="list-row" data-act="NTFeat.toggle" data-args=\''+JSON.stringify([f.id])+'\' style="margin-top:8px;">'
      +'<div class="lr-ic">'+(off?'👁':'🙈')+'</div>'
      +'<div class="lr-body"><div class="lr-name">'+(off?an:aus)+'</div>'
      +'<div class="lr-sub">Deine Einträge bleiben erhalten</div></div>'
      +'<div class="lr-arrow">›</div></div>';
  }
  html+='<div class="list-row" data-act="NTFeat.openCatalog" style="margin-top:8px;">'
    +'<div class="lr-ic">🧩</div>'
    +'<div class="lr-body"><div class="lr-name">Alle Funktionen</div>'
    +'<div class="lr-sub">Ein- und ausschalten, Reihenfolge</div></div>'
    +'<div class="lr-arrow">›</div></div>';

  el.innerHTML=html;
  // Wer aus dem Katalog kommt, laesst ihn sonst offen ueber dem Blatt liegen
  // (featCatOv steht im Markup NACH featSheetOv). Zurueck geht es ueber die
  // Zeile „Alle Funktionen" weiter unten im Blatt — ein sichtbarer Weg statt
  // eines gemerkten Zustands, der nach einem Hintergrund-Tipp veraltet waere.
  closeOv('featCatOv');
  openOv('featSheetOv');
}
function closeSheet(){closeOv('featSheetOv');}

// ── Eine Aktion des Blattes ausfuehren ────────────────────────────────────
// Erst schliessen, dann ausfuehren — nie umgekehrt: `openOv` setzt nur eine
// Klasse, ein danach geschlossenes Blatt naehme dem Ziel nichts von seiner Lage,
// aber ein VORHER geschlossenes Blatt kann das Ziel nicht mehr verdecken.
function act(id,i){
  var f=byId(id);
  if(!f||!f.actions||!f.actions[i])return;
  var a=f.actions[i];
  closeOv('featSheetOv');
  closeOv('featCatOv');
  var fn=(window.NTActions&&NTActions.resolve)?NTActions.resolve(a.act):null;
  if(!fn){console.error('NTFeat: Aktion nicht aufloesbar:',a.act);return;}
  fn.apply(null,a.args||[]);
}

// Ein Schalter, der sofort wirkt: Das Blatt zeigt danach den neuen Zustand,
// und die Kachel ist schon verschwunden. Ohne das steht man vor einem Blatt,
// das etwas anderes behauptet als der Bildschirm dahinter.
// „Aus" heisst zweierlei, je nach Funktion: ein eigener Schalter im Zustand
// (Baby-Tagebuch) oder eine ausgeblendete Kachel. Beide Male bleiben die Daten
// unangetastet — das ist die Zusage, die im Katalog steht.
function isOff(f){
  if(f.flag)return !S[f.flag];
  return !!(window.NTDash&&NTDash.isHidden(f.id));
}
function setOff(f,off){
  if(f.flag){
    S[f.flag]=!off;
    saveS();
    if(typeof renderAll==='function')renderAll();
    // Die Kachel haengt bei diesen Funktionen am Modul, nicht an dashHidden.
    if(f.id==='baby'&&window.NTBaby&&NTBaby.refresh)NTBaby.refresh();
    // Die Checkbox im Baby-Dialog ist eine ZWEITE Anzeige desselben Zustands.
    // saveSettings() liest sie weiterhin; bliebe sie stehen, schaltete das
    // naechste Speichern der Einstellungen das Tagebuch wieder um.
    if(f.id==='baby'){
      var chk=document.getElementById('sbabyon');
      if(chk)chk.checked=!!S[f.flag];
      if(typeof updateBabyUI==='function')updateBabyUI();
    }
    return;
  }
  if(window.NTDash&&NTDash.isHidden(f.id)!==off)NTDash.toggle(f.id);
}

function toggle(id){
  var f=byId(id);
  if(!f)return;
  var off=!isOff(f);   // gewuenschter Zustand nach dem Antippen
  setOff(f,off);
  showToast(off
    ? f.label+' ausgeschaltet – Einträge bleiben'
    : f.label+' ist wieder da');
  sheet(id);
}

// ── Der Katalog ───────────────────────────────────────────────────────────
// Zeigt ALLE Funktionen, auch die ausgeschalteten, mit ihrer Beschreibung —
// er ist damit zugleich die Stelle, an der man erfaehrt, was die App kann.
function openCatalog(){
  closeOv('featSheetOv');
  renderCatalog();
  openOv('featCatOv');
}
function closeCatalog(){closeOv('featCatOv');}

function renderCatalog(){
  var el=document.getElementById('featCatBody');
  if(!el)return;
  var ids=(window.NTDash&&NTDash.cards)?NTDash.cards().map(function(c){return c.id;}):FEATURES.map(function(f){return f.id;});
  var order=(window.NTDash&&NTDash.orderOf)?NTDash.orderOf():ids;
  var html='';
  order.forEach(function(id,i){
    var f=byId(id);
    if(!f)return;
    var off=isOff(f);
    // Die Zeile selbst oeffnet das Blatt der Funktion. Das ist nicht nur bequem,
    // es schliesst eine Luecke: shop und partner blenden ihre Kachel aus, wenn
    // nichts darauf steht — ohne diesen Weg waere der leere Einkaufszettel nach
    // dem Ausduennen des Mehr-Hubs ueberhaupt nicht mehr erreichbar.
    html+='<div class="list-row" data-act="NTFeat.sheet" data-args=\''+JSON.stringify([f.id])+'\' style="'+(off?'opacity:.55;':'')+'">'
      +'<div class="lr-ic">'+f.ic+'</div>'
      +'<div class="lr-body"><div class="lr-name">'+esc(f.label)+(f.fixed?' <span style="font-weight:600;color:var(--mu);font-size:11px;">· immer an</span>':'')+'</div>'
      // Ein Schalter auf „an" neben einer Kachel, die nicht da ist, ist eine
      // falsche Auskunft. Wo eine echte Voraussetzung fehlt, steht sie hier.
      +'<div class="lr-sub">'+esc((!off&&f.note)?f.note:(f.sub||''))+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:4px;">'
      +'<button type="button" class="feat-ord" data-act="NTFeat.move" data-args=\''+JSON.stringify([id,-1])+'\' data-stop '+(i===0?'disabled':'')+' aria-label="nach oben">▲</button>'
      +'<button type="button" class="feat-ord" data-act="NTFeat.move" data-args=\''+JSON.stringify([id,1])+'\' data-stop '+(i===order.length-1?'disabled':'')+' aria-label="nach unten">▼</button>'
      +(f.fixed?'<span style="width:52px;"></span>'
               :'<button type="button" class="feat-sw'+(off?'':' on')+'" data-act="NTFeat.toggleInCatalog" data-stop data-args=\''+JSON.stringify([id])+'\' aria-label="'+esc(f.label)+' ein- oder ausschalten"><span></span></button>')
      +'</div></div>';
  });
  el.innerHTML=html;
}

function toggleInCatalog(id){
  var f=byId(id);
  if(!f)return;
  setOff(f,!isOff(f));
  renderCatalog();
}
function move(id,dir){
  if(!window.NTDash)return;
  NTDash.move(id,dir);
  renderCatalog();
}

// ── Baby-Angaben ──────────────────────────────────────────────────────────
// Bis v0.252 standen Schalter, Name und Geburtsdatum im Profil — also an einer
// dritten Stelle, weder an der Kachel noch bei den anderen Schaltern.
function openBabySettings(){
  closeOv('featSheetOv');
  var chk=document.getElementById('sbabyon');
  if(chk)chk.checked=!!S.babyOn;
  S.baby=S.baby||{name:'',birth:''};
  var nm=document.getElementById('sbabyname'); if(nm)nm.value=S.baby.name||'';
  var bd=document.getElementById('sbabybirth');if(bd)bd.value=S.baby.birth||'';
  if(typeof updateBabyUI==='function')updateBabyUI();
  openOv('babySetOv');
}
function saveBaby(){
  var chk=document.getElementById('sbabyon');
  S.babyOn=!!(chk&&chk.checked);
  S.baby=S.baby||{name:'',birth:''};
  var nm=document.getElementById('sbabyname'); if(nm)S.baby.name=nm.value.trim();
  var bd=document.getElementById('sbabybirth');if(bd)S.baby.birth=bd.value||'';
  saveS();
  if(window.NTBaby&&NTBaby.refresh)NTBaby.refresh();
  if(typeof renderAll==='function')renderAll();
  closeOv('babySetOv');
  showToast(S.babyOn?'👶 Baby-Tagebuch ist an':'Baby-Tagebuch ausgeschaltet – Einträge bleiben');
}

// ── Wasserziel ────────────────────────────────────────────────────────────
// Bis v0.252 stand es unter Einstellungen → Ziele, also weit weg von der
// Kachel, an der man es braucht. Es liegt jetzt HIER und dort nicht mehr.
function openWaterGoal(){
  closeOv('featSheetOv');
  var g=document.getElementById('wgGlasses'),u=document.getElementById('wgUnit');
  if(g)g.value=S.waterGoal||8;
  if(u)u.value=S.waterUnit||250;
  openOv('waterGoalOv');
}
function saveWaterGoal(){
  var g=parseInt((document.getElementById('wgGlasses')||{}).value,10);
  var u=parseInt((document.getElementById('wgUnit')||{}).value,10);
  if(g>0&&g<=30)S.waterGoal=g;
  if(u>0&&u<=2000)S.waterUnit=u;
  saveS();
  if(typeof renderAll==='function')renderAll();
  closeOv('waterGoalOv');
  showToast('💧 Ziel: '+S.waterGoal+' × '+S.waterUnit+' ml');
}

window.NTFeat={
  list:list, byId:byId, mount:mount, isOff:isOff,
  sheet:sheet, closeSheet:closeSheet, toggle:toggle,
  act:act,
  openCatalog:openCatalog, closeCatalog:closeCatalog, renderCatalog:renderCatalog,
  toggleInCatalog:toggleInCatalog, move:move,
  openWaterGoal:openWaterGoal, saveWaterGoal:saveWaterGoal,
  openBabySettings:openBabySettings, saveBaby:saveBaby
};
})();
