// @ts-check
// NutriTrack – Vorrat (#325, #326)
// Klassisches Script, kein Modul. Exportiert window.NTPantry und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, openOv, closeOv, esc,
// showToast, callClaude, canUseAi, recipes) sowie auf NTShop, NTBook und NTSync.
//
// Was zu Hause da ist, wo es steht und was immer da sein soll:
//   S.pantry      [{id,n,ic,loc,c,q,g,min,mhd,vd,hd,bc,lots,ts,rev,_sy}]  q = Stück, g =
//                 Gramm je Stück, min = Mindestmenge in Stück (0 = keine), mhd/vd =
//                 frühestes Mindesthaltbarkeits-/Verbrauchsdatum JJJJ-MM-TT (leer =
//                 keins), hd = hält ca. … Tage (MHD beim Auffüllen; gelernt aus dem
//                 Packungsdatum beim Kauf, pantryLearnHd), od = hält angebrochen ca.
//                 … Tage (fehlt = Richtwert, pantryOpenDays), bc = Barcodes,
//                 c = Kategorie des Einkaufszettels (NTShop, fehlt = geraten),
//                 lots = Chargen [{id,q,mhd,vd,estimated,in,op}]: estimated = Datum
//                 geschätzt (hd oder Richtwert pantryShelf), in = eingebucht am,
//                 op = geöffnet am (verkürzte Frist laut pantryOpenDays)
//                 auto = Dauerartikel „immer nachkaufen“ (1, fehlt = nein),
//                 rs = {s: ID auf dem Zettel, t: ms} automatisch gesetzt,
//                 rsNo = ms „diesmal nicht“/vom Zettel genommen (Sperre bis zum
//                 nächsten Einbuchen oder BLOCK_DAYS). Alle drei reisen mit dem
//                 Artikel im Sync, damit das zweite Gerät dieselbe Sperre kennt.
//   S.pantryOrder Ordnung der Liste smart|loc|cat|exp|name|qty (gerätelokal, nicht im Sync)
//   S.pantryFold  aufgeklappte Gruppen {cat:<id>|nd: 1} (gerätelokal, nicht im Sync)
//   S.pantryLead  Nachkauf-Vorlauf in Tagen (gerätelokal, Standard LEAD): wann
//                 ein Dauerartikel vor dem errechneten Leer-Tag auf den Zettel kommt.
//                 Lokal, weil es nur den Zeitpunkt betrifft: zwei Geräte setzen
//                 denselben Eintrag (feste ID), das frühere gewinnt.
//   S.pantryRestockDay / S.pantryRestockNews  täglicher Nachkauf-Lauf zuletzt /
//                 was er heute gesetzt hat, für die eine tägliche Meldung (lokal)
//   S.pantryLocs  [{id,ic,label,pos,rev,_sy}]  Lagerorte, alle änderbar
//   S.pantryTomb  {id:{rev}}  Grabsteine für Artikel und Lagerorte (`loc:<id>`)
//   S.pantryLog   [{id,t,pid,n,ic,d,k,src,u,g,rev,_sy}]  Verlauf (#336): d = ± Stück,
//                 k = kauf|verbrauch|verderb|kochen|korrektur, u = rückgängig,
//                 g = Gramm je Stück zur Zeit der Buchung (Verbrauch lernen,
//                 pantryUseRate rechnet bei neuer Packungsgröße um),
//                 ev = _vid des Tagebucheintrags (Abzug „aus dem Tagebuch“),
//                 en = dessen Name (Anzeige).
//                 Synchron als Record `log:<id>`, 90 Tage, ohne Grabsteine —
//                 jedes Gerät kürzt selbst und nimmt Älteres nicht mehr an.
//   S.pantryRemindOff / S.pantryRemindDay  Ablauf-Meldung aus / zuletzt gemeldet
//                 (gerätelokal, nicht im Sync)
//
// Der Vorrat redet mit drei Stellen:
//   - Einkaufszettel: fällt ein Artikel unter die Mindestmenge, landet er dort
//     (`NTShop.add`); ein dort abgehakter Artikel füllt den Vorrat auf
//     (`onBought`, gerufen aus NTShop.toggle).
//   - Kochbuch: „Fertig gekocht“ zieht die Zutaten ab (`useRecipe`, gerufen aus
//     NTBook.cookDone) — nur Artikel mit Gramm je Stück lassen sich umrechnen.
//   - Einkaufszettel, Gegenrichtung: Rezepte und Wochenplan legen nur auf den
//     Zettel, was der Vorrat nicht deckt (`shortfall`, gerufen aus
//     NTShop.addIngredients, #334).
//   - Tagebuch: nach dem Eintragen ein bestätigter Abzug (offerMeal/queueMeal,
//     siehe „Tagebuch → Vorrat“), Rückweg beim Löschen/Ändern (entryChanged).
//   - Wochenplan: „Füllen“ fragt planScore, was ein Rezept aus dem Vorrat nutzt.
//   - Scanner: NTPicker.scanFor bucht bekannte Barcodes ±1 (#335).
//   - Erinnerungen: einmal am Tag „läuft bald ab“ über NTRemind.notify (#337).
//   - KI: Fotos von Kühlschrank und Schrank auswerten (nur nach Bestätigung
//     übernommen, Fotos werden nicht gespeichert) und Kochideen.
// Geteilt wird über einen eigenen Topf des Sync-Kerns (`/pantry/sync`), mit
// derselben Merge-Regel wie der Einkaufszettel: höhere rev gewinnt.
(function(){
'use strict';

// Vorschläge beim ersten Start. Feste IDs, damit zwei Geräte, die beide
// einmal gesät haben, dieselben drei Orte meinen und keine Dubletten tauschen.
var SEED_LOCS=[
  {id:'kuehl', ic:'🧊', label:'Kühlschrank',    pos:1},
  {id:'tk',    ic:'❄️', label:'Tiefkühler',     pos:2},
  {id:'vorrat',ic:'🥫', label:'Vorratsschrank', pos:3}
];
var LOC_PREFIX='loc:';
var LOG_PREFIX='log:';
var LOG_DAYS=90,LOG_MAX=500;
var REMIND_HOUR=7;
var MAX_PHOTOS=6;

var _editId=null;
var _filter='';      // Chip: Lagerort-ID oder 'cat:<Kategorie>', '' = alle
var _tile='';        // Kennzahl der Übersicht: '' = alle, EXP = läuft ab, LOW = fehlt, SOON = nachkaufen
var _query='';       // Suche in der Liste (nur Anzeige, legt nichts an)
var _shownQ='';      // Stückzahl, wie der Artikel-Dialog sie zuletzt zeigte
var _openLoc='';     // Lagerort beim Öffnen des Artikel-Dialogs (D4)
var _odShown='';     // „Angebrochen haltbar“, wie der Artikel-Dialog es zuletzt zeigte
var EXP='__exp';
var LOW='__low';
var SOON='__soon';   // Nachkaufen: geht laut Prognose bald aus / automatisch auf dem Zettel
var LEAD=3,LEADS=[1,2,3,5,7];
var SOON_DAYS=7;     // „geht bald aus“: reicht laut Prognose höchstens so lange
var ROW_DAYS=14;     // Listenzeile nennt „reicht ca. …“ nur bis hierhin
var BLOCK_DAYS=14;   // „diesmal nicht“ hält höchstens so lange (sonst bis zum Einbuchen)
var AUTO_PREFIX='vorrat-';
var CAT_CHIP='cat:';
var EXP_DAYS=3;
var ORDERS=[['smart','↕ Dringlichkeit'],['loc','↕ Lagerort'],['cat','↕ Kategorie'],['exp','↕ Haltbarkeit'],['name','↕ Name'],['qty','↕ Menge']];
var _photos=[];      // komprimierte Fotos als base64, nur im Speicher
var _found=[];       // Ergebnis der Foto-Auswertung bis zur Bestätigung
var _pendingBc='';   // gescannter, noch unbekannter Barcode für den Artikel-Dialog
var _scanMode='in';  // Scanner: 'in' = einbuchen, 'out' = verbrauchen

function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
var _lastRev=0;
function nextRev(){var r=Math.max(Date.now(),_lastRev+1);_lastRev=r;return r;}
function fmtN(v){return String(roundQty(+v||0)).replace('.',',');}
function isOpen(id){var el=document.getElementById(id);return !!(el&&el.classList.contains('open'));}
function args(a){return esc(JSON.stringify(a));}

// ── Daten ─────────────────────────────────────────────────────────────────
function items(){if(!Array.isArray(S.pantry))S.pantry=[];return S.pantry;}
function tomb(){if(!S.pantryTomb||typeof S.pantryTomb!=='object')S.pantryTomb={};return S.pantryTomb;}
function logArr(){if(!Array.isArray(S.pantryLog))S.pantryLog=[];return S.pantryLog;}
function locs(){
  if(!Array.isArray(S.pantryLocs)){
    S.pantryLocs=SEED_LOCS.map(function(l){return {id:l.id,ic:l.ic,label:l.label,pos:l.pos,rev:1};});
  }
  return S.pantryLocs;
}
function sortedLocs(){return locs().slice().sort(function(a,b){return (a.pos||0)-(b.pos||0);});}
function loc(id){var a=locs();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function byId(id){var a=items();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function findByName(n){var k=pantryKey(n);if(!k)return null;var a=items();for(var i=0;i<a.length;i++)if(pantryKey(a[i].n)===k)return a[i];return null;}
function low(it){return pantryNeed(it.q,it.min)>0;}
function findByBc(code){var a=items();for(var i=0;i<a.length;i++)if(Array.isArray(a[i].bc)&&a[i].bc.indexOf(code)>=0)return a[i];return null;}
function roundQty(v){return Math.round(v*1000)/1000;}
function guessIc(n){return (window.NTShop&&NTShop.guess)?NTShop.guess(n).ic:'🥫';}
function fmtD(d){var p=String(d||'').split('-');return p.length===3?(p[2]+'.'+p[1]+'.'+p[0].slice(2)):'';}
// Kategorien = die des Einkaufszettels (eingebaute und eigene S.shopCats).
function cats(){return (window.NTShop&&NTShop.allCats)?NTShop.allCats():[{id:'sonst',ic:'🛒',label:'Sonstiges'}];}
function catInfo(id){var a=cats();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return a[a.length-1];}
function guessCat(n){return (window.NTShop&&NTShop.guess)?NTShop.guess(n).c:'sonst';}
// Gespeicherte Kategorie, solange es sie gibt; sonst aus dem Namen geraten.
function catOf(it){return it.c&&catInfo(it.c).id===it.c?it.c:guessCat(it.n);}
function placeOf(it){return pantryPlace(loc(it.loc));}
// Tage nach dem Öffnen (Richtwert für Art und Lagerort, 0 = keine Frist).
function openDays(it){var o=openLoc(it);return pantryOpenDays({n:it.n,c:catOf(it),od:it.od},o?pantryPlace(loc(o)):placeOf(it));}
// Erster Kühlschrank unter den Lagerorten ('' = keiner angelegt).
function fridgeLoc(){var a=sortedLocs();for(var i=0;i<a.length;i++)if(pantryPlace(a[i])==='k')return String(a[i].id);return '';}
// Vorschlag „Nach dem Öffnen lagern in“: Kühlschrank für Glas, Konserve, Soße,
// Saft (pantryOpenPlace) oder wenn die Packung „gekühlt“ sagt; sonst '-' (bleibt).
/** @param {string} n @param {string} c @param {boolean} [cool] */
function openLocSuggest(n,c,cool){return (cool||pantryOpenPlace(n,c)==='k')&&fridgeLoc()?fridgeLoc():'-';}
// Ort angebrochener Packungen ('' = derselbe wie der Artikel): `ol` = Ort-ID,
// '-' = bleibt am Lagerort, fehlt = Vorschlag (openLocSuggest).
function openLoc(it){
  var v=it.ol;
  if(!v||(v!=='-'&&!loc(v)))v=openLocSuggest(it.n,catOf(it));
  return v==='-'||v===(it.loc||'')?'':v;
}
// Frühestes „geöffnet am“ der vorhandenen Chargen, '' = nichts angebrochen.
function openedOn(it){return stockLots(it).reduce(function(d,lot){return lot.op&&(!d||lot.op<d)?lot.op:d;},'');}
// Üblicher Lagerort für einen neuen Artikel ('' = keiner passt), `hint` laut Open Food Facts.
function homeLoc(n,c,hint){return pantryHomeLoc(n,c||guessCat(n),locs(),hint);}
function estimateDays(it){return pantryEstimateDays({n:it.n,hd:it.hd,c:catOf(it)},placeOf(it));}
function expiry(it){return expiryOf(it,stockLots(it),true);}
// Haltbarkeit für einen Teil der Chargen (angebrochen / geschlossen getrennt angezeigt).
// `whole`: ganzer Artikel — dann zählen wie bisher auch it.mhd/it.vd.
/** @param {any} it @param {Array<any>} lots @param {boolean} [whole] */
function expiryOf(it,lots,whole){
  var p=whole?it:{mhd:lots.reduce(function(d,lot){return earlier(d,lot.mhd);},''),vd:lots.reduce(function(d,lot){return earlier(d,lot.vd);},'')};
  var e=pantryDue(p,lots,openDays(it),today());
  if(e&&e.k==='mhd'){
    var dated=lots.filter(function(lot){return lot.mhd===e.d;});
    return Object.assign({},e,{estimated:dated.length>0&&dated.every(function(lot){return lot.estimated;})});
  }
  return e;
}
function expiring(){return pantryExpiring(items(),today(),EXP_DAYS,expiry);}
// „MHD 02.11.26“ bzw. „Verbrauchen bis …“, abgelaufen/bald mit Hinweis.
function expiryText(e){
  if(!e)return '';
  var t=(e.k==='vd'?'Verbr. bis ':(e.k==='op'?'📂 Angebrochen · bis ':'MHD '))+fmtD(e.d);
  if(e.estimated)t='MHD ca. '+fmtD(e.d)+' · geschätzt';
  if(e.lvl==='over')t+=e.k==='vd'?' ⛔ abgelaufen':' ⚠️ abgelaufen';
  else if(e.days===0)t+=' ⏰ heute';
  else if(e.days===1)t+=' ⏰ morgen';
  else if(e.lvl==='soon')t+=' ⏰ in '+e.days+' Tagen';
  return t;
}
function expiryColor(e){return !e||e.lvl==='ok'?'var(--mu)':(e.lvl==='over'?'var(--re)':'var(--or)');}
// Ein späteres Datum ersetzt kein früheres: steht schon etwas da, gilt das,
// was zuerst abläuft (die ältere Packung wird zuerst gegessen).
function earlier(a,b){if(!a)return b||'';if(!b)return a;return a<b?a:b;}
function stockLots(it){
  var qty=roundQty(+it.q||0);
  if(qty<=0)return [];
  if(Array.isArray(it.lots)){
    var lots=it.lots.filter(function(lot){return lot&&+lot.q>0;}).map(function(lot){return Object.assign({},lot,{q:+lot.q});});
    // Ein älterer Client kann die Gesamtmenge ohne Chargen ändern.
    var sum=roundQty(lots.reduce(function(n,lot){return n+lot.q;},0));
    if(sum===qty)return lots;
    if(sum<qty)return lots.concat({id:'bestand-'+it.id,q:roundQty(qty-sum),mhd:'',vd:''});
    return pantryDebit(lots,roundQty(sum-qty),'',openDays(it)).lots.filter(function(lot){return lot.q>0;});
  }
  return [{id:'bestand-'+it.id,q:qty,mhd:it.mhd||'',vd:it.vd||''}];
}
function writeLots(it,lots){
  it.lots=lots.filter(function(lot){return lot.q>0;});
  it.q=roundQty(it.lots.reduce(function(sum,lot){return sum+lot.q;},0));
  it.mhd=it.lots.reduce(function(d,lot){return earlier(d,lot.mhd);},'');
  it.vd=it.lots.reduce(function(d,lot){return earlier(d,lot.vd);},'');
}
// Jeder Abzug (−, Verbraucht, Kochen, Scan, Mahlzeit) läuft hier durch:
// geöffnete Charge zuerst, dann die, die am frühesten abläuft (pantryDebit).
function debit(it,n,lotId){
  var r=pantryDebit(stockLots(it),n,lotId,openDays(it));
  writeLots(it,r.lots);
  return r.removed;
}
function appendLots(it,added){
  var lots=stockLots(it).map(function(lot){return Object.assign({},lot);});
  added.forEach(function(lot){
    var current=lots.find(function(x){return x.id===lot.id;});
    if(current)current.q=roundQty(current.q+lot.q);
    else lots.push(Object.assign({},lot));
  });
  writeLots(it,lots);
}
function amountText(it){
  var t=fmtN(it.q)+' Stück';
  if(+it.g>0)t+=' à '+fmtN(it.g)+' g';
  return t;
}

// Steht ein Artikel nach einer Änderung unter der Mindestmenge, kommt er auf
// den Einkaufszettel — nur beim Übergang (oder wenn mehr fehlt als vorher),
// sonst landete er nach jedem −-Tipp erneut dort, auch wenn ihn jemand
// bewusst vom Zettel genommen hat.
// Dauerartikel (it.auto) gehen stattdessen durch restockItem: dort zählt auch
// die Prognose, und ein vom Zettel genommener Eintrag kommt nicht gleich wieder.
function afterChange(it,before){
  if(it.auto){
    var why=restockItem(it);
    if(why){saveS();Sync.schedule();render();showToast((it.ic||'')+' '+it.n+' → Einkaufszettel ('+why+')');}
    return;
  }
  var need=pantryNeed(it.q,it.min);
  if(need>0&&need>before&&window.NTShop){
    NTShop.add(it.n,need+' Stück',catOf(it),it.ic||'',{pantry:'unter Mindestmenge'});
    showToast((it.ic||'')+' '+it.n+' ist knapp → Einkaufszettel');
  }
}

// ── Verbrauch lernen und Nachkauf ─────────────────────────────────────────
// Beginn des lückenlosen Verlaufs: gekappt wird nach LOG_DAYS Tagen oder nach
// LOG_MAX Einträgen — dann zählt erst ab dem ältesten behaltenen.
function logFrom(){
  var a=logArr(),from=Date.now()-LOG_DAYS*864e5;
  if(a.length>=LOG_MAX){
    var oldest=Infinity;
    a.forEach(function(e){oldest=Math.min(oldest,+e.t||0);});
    from=Math.max(from,oldest);
  }
  return from;
}
// Verbrauchsrate des Artikels oder null (noch keine Aussage), siehe pantryUseRate.
function usage(it){return pantryUseRate(logArr(),it.id,{now:Date.now(),q:+it.q||0,g:+it.g||0,from:logFrom()});}
function runout(it){return pantryRunout(+it.q||0,usage(it));}
function lead(){var v=+S.pantryLead;return LEADS.indexOf(v)>=0?v:LEAD;}
function fmtUse(v){return String(Math.round(v*10)/10).replace('.',',');}
function daysText(n){return n<=0?'geht heute aus':'reicht noch ca. '+n+(n===1?' Tag':' Tage');}
function whyText(w){return w.k==='min'?'unter Mindestmenge':daysText(w.days);}
// Letzte Einbuchung (ms) und ihre ID — der Nachkauf-Zyklus des Artikels.
function lastBuy(it){
  var a=logArr(),best=null;
  for(var i=0;i<a.length;i++){var e=a[i];if(e.pid===it.id&&e.k==='kauf'&&!e.u&&(+e.d||0)>0&&(!best||(+e.t||0)>(+best.t||0)))best=e;}
  return best;
}
function shopList(){return Array.isArray(S.shopList)?S.shopList:[];}
function shopById(id){var a=shopList();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function shopByName(n){var k=pantryKey(n),a=shopList();for(var i=0;i<a.length;i++)if(!a[i].d&&pantryKey(a[i].n)===k)return a[i];return null;}
// Feste ID je Artikel und Einkaufszyklus: zwei Geräte, die gleichzeitig
// nachkaufen, legen denselben Zettel-Eintrag an, der Sync macht daraus einen.
// Eine schon gelöschte ID (Grabstein) wird nicht wiederbelebt.
function autoShopId(it){
  var b=lastBuy(it),base=AUTO_PREFIX+it.id+'-'+(b?b.id:'0'),id=base,n=1,tombs=S.shopTomb||{};
  while(tombs[id]){n++;id=base+'-'+n;}
  return id;
}
// Zustand laut pantryAutoState; schreibt geänderte Markierung/Sperre in den
// Artikel (true = Artikel geändert, rev neu).
function autoState(it){
  var s=it.rs&&it.rs.s?shopById(it.rs.s):null;
  var shop=s?{open:!s.d,done:!!s.d}:(it.rs&&it.rs.s&&S.shopTomb&&S.shopTomb[it.rs.s]?{gone:true}:null);
  var b=lastBuy(it);
  var st=pantryAutoState(it.rs,+it.rsNo||0,shop,b?+b.t||0:0,Date.now(),BLOCK_DAYS);
  var changed=false;
  if(!st.rs&&it.rs){delete it.rs;changed=true;}
  if(st.no!==(+it.rsNo||0)){if(st.no)it.rsNo=st.no;else delete it.rsNo;changed=true;}
  if(changed)it.rev=nextRev();
  return st.k;
}
// Auf den Zettel mit Herkunft „aus dem Vorrat“ und Grund; Menge = üblicher
// Kauf, mindestens bis zur Mindestmenge. Steht der Artikel schon offen auf dem
// Zettel (von Hand oder per Rezept), bleibt der Eintrag, wie er ist.
function putOnList(it,reason){
  if(!window.NTShop)return null;
  var ex=shopByName(it.n);
  if(!ex){
    var q=Math.max(pantryUsualBuy(logArr(),it.id,+it.g||0),pantryNeed(it.q,it.min));
    ex=NTShop.add(it.n,fmtN(q)+' Stück',catOf(it),it.ic||'',{id:autoShopId(it),pantry:reason});
  }
  if(!ex)return null;
  it.rs={s:ex.id,t:Date.now()};
  delete it.rsNo;
  it.rev=nextRev();
  return ex;
}
// Ein Dauerartikel nach einer Buchung oder im täglichen Lauf: Markierung
// nachführen, dann setzen, wenn er unter die Mindestmenge fällt oder laut
// Prognose in lead() Tagen ausgeht. Rückgabe: Grund, wenn gesetzt, sonst ''.
// Speichert nicht (der Aufrufer bündelt).
function restockItem(it){
  var k=autoState(it);
  if(!it.auto||k!=='free')return '';
  var why=pantryRestockWhy(+it.q||0,+it.min||0,runout(it),lead());
  if(!why)return '';
  var reason=whyText(why);
  return putOnList(it,reason)?reason:'';
}
// Täglicher Lauf (beim Öffnen, höchstens einmal am Tag): alle Dauerartikel und
// alle mit Markierung/Sperre. Was er setzt, nennt die tägliche Meldung.
function restockDaily(){
  var feature=NTFeat.byId('pantry');
  if(feature&&NTFeat.isOff(feature))return;
  var d=today();
  if(S.pantryRestockDay===d)return;
  S.pantryRestockDay=d;
  var added=[],dirty=false;
  items().forEach(function(it){
    if(!it.auto&&!it.rs&&!it.rsNo)return;
    var r0=it.rev,why=restockItem(it);
    if(why)added.push((it.ic||'')+' '+it.n+' ('+why+')');
    if(it.rev!==r0)dirty=true;
  });
  if(added.length)S.pantryRestockNews={d:d,n:added};
  saveS();
  if(dirty){Sync.schedule();render();}
}
function touch(it){it.rev=nextRev();saveS();Sync.schedule();render();}

// ── Verlauf (#336) ──
// Eine Buchung je Bestandsänderung. Gespeichert und gerendert wird mit dem
// Artikel (touch), deshalb hier nur anlegen.
/** @param {any} it @param {number} d @param {string} k @param {string} [src] */
function log(it,d,k,src){
  d=roundQty(d);
  if(!d)return null;
  /** @type {any} */
  var e={id:uid('l'),t:Date.now(),pid:it.id,n:it.n,ic:it.ic||'',d:d,k:k,src:src||'hand',u:0,rev:nextRev()};
  if(+it.g>0)e.g=+it.g;
  logArr().unshift(e);
  return e;
}
function logById(id){var a=logArr();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function trimLog(){
  var a=logArr(),t=pantryLogTrim(a,Date.now(),LOG_DAYS,LOG_MAX);
  if(t.length!==a.length)S.pantryLog=t;
}
// Auffüllen um `n` Stück als neue Charge, Verlauf. Ohne Datum schätzt die
// App eins (D1): eigene Haltedauer `hd` vor dem Richtwert für Art und Ort;
// die Charge trägt dann `estimated` und die Oberfläche „geschätzt“.
// `kind` 'korrektur' (Inventur: mehr da als gedacht) bucht dieselbe neue Charge,
// zählt aber nicht als Kauf (kein Nachkauf-Zyklus, kein „üblicher Kauf“).
// `op` (angebrochen am): ein Stück der neuen Charge ist schon angebrochen.
/** @param {any} it @param {number} n @param {string} src @param {string} [mhd] @param {string} [vd] @param {string} [kind] @param {string} [op] */
function refill(it,n,src,mhd,vd,kind,op){
  n=roundQty(n);
  if(!(n>0))return null;
  var days=!mhd&&!vd?estimateDays(it):0;
  var lot={id:uid('charge'),q:n,mhd:mhd||(days?addDays(today(),days):''),vd:vd||'',estimated:!!days,in:today()};
  var added=[lot];
  if(op&&pantryDays(op,op)!==null){
    var sp=pantrySplitOne(added,lot.id,'o',{op:op});
    if(sp)added=sp.lots;else lot.op=op;
  }
  appendLots(it,added);
  lot=added[0];
  // Datum von der Packung beim Kauf: daraus lernt die App, wie lange der Artikel hält.
  if((mhd||vd)&&kind!=='korrektur'&&src!=='inventur'){var hd=pantryLearnHd(+it.hd||0,mhd||'',vd||'',today());if(hd>0)it.hd=hd;}
  // Eingebucht = Nachkauf-Zyklus erledigt: Markierung und „diesmal nicht“ fallen weg.
  if(kind!=='korrektur'){delete it.rs;delete it.rsNo;}
  var e=log(it,n,kind||'kauf',src);e.lots=added;return e;
}
// Abziehen um `n` Stück (nie unter 0), älteste Charge zuerst oder nur `lotId`.
/** @param {any} it @param {number} n @param {string} k @param {string} [src] @param {string} [lotId] */
function take(it,n,k,src,lotId){
  var qb=+it.q||0,removed=debit(it,n,lotId);
  var e=log(it,it.q-qb,k,src);if(e)e.lots=removed;return e;
}
// Eine vorhandene Charge um `d` Stück erhöhen (Korrektur im Artikel-Dialog).
/** @param {any} it @param {any} lot @param {number} d */
function bumpLot(it,lot,d){
  var part=Object.assign({},lot,{q:roundQty(d)});
  appendLots(it,[part]);
  var e=log(it,part.q,'korrektur','hand');if(e)e.lots=[part];return e;
}

/** @param {any} [dates] {mhd,vd} @param {string} [src] Herkunft für den Verlauf @param {string} [c] Kategorie */
function add(n,q,g,locId,ic,min,dates,src,c){
  n=String(n||'').trim();
  if(!n)return null;
  var mhd=(dates&&dates.mhd)||'',vd=(dates&&dates.vd)||'';
  var ex=findByName(n);
  if(ex){
    var before=pantryNeed(ex.q,ex.min);
    if(+g>0&&!(+ex.g>0))ex.g=+g;
    if(locId&&!ex.loc)ex.loc=locId;
    refill(ex,+q||0,src||'hand',mhd,vd);
    touch(ex);afterChange(ex,before);
    return ex;
  }
  var it={id:uid('p'),n:n,ic:ic||guessIc(n),loc:locId||homeLoc(n,c),c:c||guessCat(n),q:0,g:+g>0?+g:0,min:+min>0?+min:0,mhd:'',vd:'',ts:Date.now(),rev:nextRev()};
  items().push(it);
  refill(it,+q>0?+q:0,src||'hand',mhd,vd);
  touch(it);afterChange(it,0);
  return it;
}
// `part` (Liste an zwei Orten): 'o' nimmt aus angebrochenen, 'c' aus geschlossenen Chargen.
/** @param {string} id @param {number} d @param {string} [part] */
function step(id,d,part){
  var it=byId(id);if(!it)return;
  var before=pantryNeed(it.q,it.min);
  var lot=part?pantryLotOrder(stockLots(it),openDays(it)).find(function(l){return part==='o'?!!l.op:!l.op;}):null;
  if(d>0)refill(it,d,'hand');else take(it,-d,'verbrauch','hand',lot?'='+lot.id:'');
  touch(it);afterChange(it,before);
}
// 🍽️ Verbraucht / 🗑️ Weggeworfen im Artikel-Dialog; Menge aus dem Feld daneben.
/** @param {boolean} spoiled */
function consume(spoiled){
  var it=_editId?byId(_editId):null;
  if(!it)return;
  var n=num(val('pantryItemUseQ'))||1;
  if(!((+it.q||0)>0)){showToast(it.n+' ist schon leer');return;}
  var before=pantryNeed(it.q,it.min);
  var e=take(it,n,spoiled?'verderb':'verbrauch','hand');
  touch(it);afterChange(it,before);
  refreshItem(it);
  if(e)showToast((spoiled?'🗑️ ':'🍽️ ')+fmtN(-e.d)+' '+it.n+(spoiled?' weggeworfen':' verbraucht')+' · ↩️ im Verlauf');
}
function remove(id){
  var a=items();
  for(var i=0;i<a.length;i++)if(a[i].id===id){a.splice(i,1);tomb()[id]={rev:nextRev()};saveS();Sync.schedule();render();return;}
}

// ── Einkaufszettel: abgehakt = gekauft = aufgefüllt ───────────────────────
// Der Einkauf speichert die Chargenreferenz auch für ein späteres Enthaken.
/** @param {any} shopItem @param {boolean} done */
function onBought(shopItem,done){
  if(!shopItem)return;
  if(!done){
    var m=shopItem.stock;
    if(!m)return;
    delete shopItem.stock;
    var le=m.log?logById(m.log):null;
    if(le&&le.u)return;// im Verlauf schon rückgängig gemacht
    var back=byId(m.pid);
    if(back){
      debit(back,m.n,m.lot);
      if(le){le.u=1;le.rev=nextRev();}
      touch(back);
    }
    return;
  }
  var feature=NTFeat.byId('pantry');
  if(!shopItem.n||shopItem.stock||(feature&&NTFeat.isOff(feature)))return;
  var it=findByName(shopItem.n);
  if(!it){
    var weight=/^(\d+(?:[.,]\d+)?)\s*(g|kg)$/i.exec(String(shopItem.q||'').trim());
    it={id:'einkauf-'+shopItem.id,n:shopItem.n,ic:shopItem.ic||guessIc(shopItem.n),loc:'',c:shopItem.c||guessCat(shopItem.n),q:0,g:weight?num(weight[1])*(weight[2].toLowerCase()==='kg'?1000:1):0,min:0,ts:Date.now()};
    delete tomb()[it.id];
    items().push(it);
  }else if(!it.c&&shopItem.c)it.c=shopItem.c;
  var n=pantryBought(shopItem.q,it);
  var e=refill(it,n,'zettel');
  if(e)shopItem.stock={pid:it.id,n:e.d,log:e.id,lot:e.lots[0].id};
  touch(it);
  if(e)showToast('Vorrat: '+(it.ic||'')+' '+it.n+' +'+fmtN(e.d));
}

// ── Kochbuch: „Fertig gekocht“ zieht ab ───────────────────────────────────
// `ings` je Portion (wie NTBook.view sie liefert), `portions` = gekochte Portionen.
/** @param {Array<any>} ings @param {number} portions @param {string} [recName] Rezept, für den Verlauf */
function useRecipe(ings,portions,recName){
  var p=+portions||1,used=[],skipped=0;
  (ings||[]).forEach(function(ing){
    var name=bookIngShort(ing)||ing.name;
    var it=pantryFind(items(),name);
    if(!it)return;
    var grams=(+ing.amount||0)*p;
    if(!(it.g>0)||!(grams>0)){skipped++;return;}
    var before=pantryNeed(it.q,it.min);
    if(!take(it,grams/it.g,'kochen',recName||'Rezept'))return;
    it.rev=nextRev();
    used.push(it);
    afterChange(it,before);
  });
  if(used.length){saveS();Sync.schedule();render();}
  if(used.length||skipped){
    showToast('Vorrat: '+used.length+' Zutat'+(used.length===1?'':'en')+' abgezogen'
      +(skipped?' · '+skipped+' ohne Gramm je Stück':''));
  }
  return used.length;
}

// ── Tagebuch → Vorrat (Paket 3, E1–E5) ────────────────────────────────────
// Ein Tagebucheintrag bucht NIE still ab (der Nutzer kann bestellt oder
// auswärts gegessen haben). Drei Wege, alle über denselben Dialog #pantryMealOv:
//   'new'  — gerade aktiv eingetragen (Picker, Rezept, Vorlage, Plan → Tagebuch,
//            Kopie von gestern): EIN zusammengefasster Vorschlag sofort.
//   'open' — ohne anwesenden Nutzer entstanden (Alexa, Wiederkehrende, Import):
//            offener Vorschlag in S.pantryAsk, wartet als Hinweis im Vorrat und
//            verfällt nach PANTRY_ASK_DAYS Tagen.
//   'back' — Eintrag gelöscht oder Menge geändert: Buchung zurücknehmen/anpassen.
// Die Buchung kennt den Eintrag über `ev` (= entry._vid) im Verlauf; das
// entdoppelt auch zwischen Geräten (der Verlauf reist im Vorrats-Topf).
//   entry._vid       ID des Tagebucheintrags für den Vorrat (im Tagebuch, lokal)
//   S.pantryAsk      [{v,d,m,s,t}] offene Vorschläge (gerätelokal: das Tagebuch
//                    ist gerätelokal, und ein Vorschlag gehört zum Gerät, auf
//                    dem der Eintrag entstand)
//   S.pantryMap      {Namensschlüssel: {p,ok,no}} gemerkte Zuordnung und
//                    Ablehnungen (gerätelokal: Tagebuch-Namen und „bei mir nie
//                    aus dem Vorrat“ sind persönlich, nicht Sache des Haushalts)
//   S.pantryAskOff   Schalter „Beim Eintragen nach Vorratsabzug fragen“ aus (lokal)
var ASK_MAX=40;
var MEAL_LABEL={breakfast:'Frühstück',lunch:'Mittagessen',dinner:'Abendessen',snack:'Snack'};
var ASK_SRC={alexa:'🗣️ Alexa',wdh:'🔁 Wiederkehrend',import:'📥 Übernommen'};
/** @type {any} */
var _ask=null;       // {mode:'new'|'open'|'back', groups:[{v,title,name,rows}]}
var _askBatch=[],_askPending=false;
function pantryOff(){var f=window.NTFeat?NTFeat.byId('pantry'):null;return !!(f&&NTFeat.isOff(f));}
function askOn(){return !S.pantryAskOff;}
function askMem(){if(!S.pantryMap||typeof S.pantryMap!=='object')S.pantryMap={};return S.pantryMap;}
function askList(){if(!Array.isArray(S.pantryAsk))S.pantryAsk=[];return S.pantryAsk;}
// Zu diesem Eintrag wurde schon gebucht (auch auf einem anderen Gerät oder rückgängig).
function askBooked(v){return logArr().some(function(e){return e.ev===v;});}
function askDrop(v){var a=askList(),b=a.filter(function(x){return x.v!==v;});if(b.length!==a.length)S.pantryAsk=b;}
// Vorschlags-Zeilen eines Eintrags für den Dialog (Menge in der Einheit des Artikels).
function askGroup(entry,v,title){
  var rows=pantryMealRows(entry,items(),askMem(),logArr()).map(function(r){
    var it=r.it,qq=it?pantryAskQty(it,r.grams,r.known):{unit:'',q:null};
    return {keys:r.keys,names:r.names,id:it?it.id:'',cands:r.cands.map(function(c){return c.id;}),src:r.src,
      grams:r.grams,known:r.known,unit:qq.unit,q:qq.q,on:!!it&&qq.q!==null&&qq.q>0,dir:-1};
  });
  // Zutaten ohne Vorschlag: lassen sich im Dialog von Hand einem Artikel zuordnen.
  var rest=pantryMealRest(entry,items(),askMem());
  return {v:v,title:title||((entry.emoji||'🍽')+' '+(entry.name||'Eintrag')),name:String(entry.name||''),rows:rows,rest:rest};
}
// Aktiv eingetragen (E1). `owner` = der echte Eintrag, wenn nur Zutaten an ihn
// angehängt wurden (er behält seine ID, die Buchungen summieren sich).
/** @param {any} entry @param {any} [owner] */
function offerMeal(entry,owner){
  if(!entry)return;
  var host=owner||entry;
  // Neu eingetragen = neue ID, auch wenn nicht gefragt wird: Kopien (Vorlage,
  // gestern) trügen sonst die ID des Originals und dessen Buchungen.
  if(!owner||!host._vid)host._vid=uid('v');
  if(pantryOff()||!askOn()||pantryAskSkip(host,S.cookLog,today()))return;
  _askBatch.push({entry:entry,host:host});
  if(_askPending)return;
  _askPending=true;
  // Alles, was im selben Schritt eingetragen wird (Vorlage, Plan-Tag), ergibt EINEN Vorschlag.
  queueMicrotask(function(){
    _askPending=false;
    var batch=_askBatch;_askBatch=[];
    var groups=batch.map(function(b){return askGroup(b.entry,b.host._vid,b.entry===b.host?'':((b.host.emoji||'🍽')+' '+(b.host.name||'')));})
      .filter(function(g){return g.rows.length;});
    if(!groups.length)return;
    if(_ask&&isOpen('pantryMealOv')){
      if(_ask.mode==='new'){askRead();_ask.groups=_ask.groups.concat(groups);renderAsk();}
      return;// ein anderer Dialog ist offen: nicht überfahren
    }
    _ask={mode:'new',groups:groups};
    renderAsk();
    openOv('pantryMealOv');
  });
}
// Ohne anwesenden Nutzer eingetragen (E3): nie abbuchen, kein Dialog — nur ein
// offener Vorschlag. Speichern übernimmt der Aufrufer.
/** @param {any} entry @param {string} date @param {string} meal @param {string} [src] alexa|wdh|import */
function queueMeal(entry,date,meal,src){
  if(!entry)return;
  entry._vid=uid('v');
  if(pantryOff()||!askOn())return;
  var a={v:entry._vid,d:String(date||''),m:String(meal||''),s:src||'',t:Date.now()};
  if(!pantryAskOpen([a],today()).length)return;
  var list=askList();
  list.push(a);
  if(list.length>ASK_MAX)list.splice(0,list.length-ASK_MAX);
  // Später zeichnen: Der Aufrufer hängt den Eintrag evtl. erst danach an den Tag.
  setTimeout(render,0);
}
function findEntry(d,m,v){
  var day=S.days&&S.days[d];
  if(!day||!day.meals)return null;
  var ms=[m].concat(Object.keys(day.meals).filter(function(k){return k!==m;}));
  for(var i=0;i<ms.length;i++){
    var arr=day.meals[ms[i]]||[];
    for(var j=0;j<arr.length;j++)if(arr[j]&&arr[j]._vid===v)return arr[j];
  }
  return null;
}
// Offene Vorschläge, die noch gelten und etwas im Vorrat finden. Abgelaufene,
// schon gebuchte (auch vom anderen Gerät) und verschwundene Einträge fallen weg.
function askOpenGroups(){
  var all=askList(),keep=pantryAskOpen(all,today()),groups=[];
  keep=keep.filter(function(a){
    var en=findEntry(a.d,a.m,a.v);
    if(!en||askBooked(a.v))return false;
    var g=askGroup(en,a.v,(ASK_SRC[a.s]?ASK_SRC[a.s]+' · ':'')+(MEAL_LABEL[a.m]||'')+' '+fmtDate(a.d)+': '+(en.name||''));
    if(g.rows.length)groups.push(g);
    return true;
  });
  if(keep.length!==all.length){S.pantryAsk=keep;saveS();}
  return groups;
}
function openAsk(){
  var groups=askOpenGroups();
  if(!groups.length){showToast('Nichts offen ✓');render();return;}
  _ask={mode:'open',groups:groups};
  renderAsk();
  openOv('pantryMealOv');
}
// Ruhiger Hinweis im Vorrat: „2 Mahlzeiten: aus dem Vorrat abziehen?“
function renderAskHint(){
  var el=document.getElementById('pantryAskHint');
  if(!el)return;
  var n=askOn()&&askList().length?askOpenGroups().length:0;
  _hs.ask=n?'🍽️ '+n+(n===1?' Mahlzeit':' Mahlzeiten')+' abziehen?':'';
  el.innerHTML=n?'<button type="button" class="pantry-soon" data-act="NTPantry.openAsk">'
    +'<span aria-hidden="true">🍽️</span><span>'+n+(n===1?' Mahlzeit':' Mahlzeiten')+': aus dem Vorrat abziehen?</span><span aria-hidden="true">›</span></button>':'';
}
// Eintrag gelöscht (neu = 0) oder Menge geändert (alt → neu, z. B. Gramm oder
// Portionen): Rücknahme bzw. Anpassung der Buchung anbieten (E4).
/** @param {any} entry @param {number} oldAmt @param {number} newAmt */
function entryChanged(entry,oldAmt,newAmt){
  if(!entry||!entry._vid)return;
  var v=entry._vid;
  if(!(+newAmt>0)){askDrop(v);saveS();renderCard();}
  var net=pantryBooked(logArr(),v),rows=[];
  Object.keys(net).forEach(function(pid){
    var it=byId(pid);if(!it)return;
    var d=pantryRebook(net[pid],oldAmt,newAmt);
    if(!d)return;
    var unit=+it.g>0?'g':'Stück',n=Math.abs(d);
    rows.push({keys:[],names:[],id:pid,cands:[pid],src:'mem',unit:unit,q:unit==='g'?Math.round(n*it.g):roundQty(n),on:true,dir:d>0?1:-1,net:net[pid]});
  });
  if(!rows.length)return;
  if(isOpen('pantryMealOv'))closeOv('pantryMealOv');
  _ask={mode:'back',gone:!(+newAmt>0),groups:[{v:v,title:(entry.emoji||'🍽')+' '+(entry.name||''),name:String(entry.name||''),rows:rows}]};
  renderAsk();
  openOv('pantryMealOv');
}
// Passende Artikel zuerst, in der Reihenfolge der Wahrscheinlichkeit
// (pantryRankCands), danach alle übrigen mit Bestand nach Name.
function askOptions(r){
  var have=items().filter(function(it){return (+it.q||0)>0||it.id===r.id;});
  var first=r.cands.map(byId).filter(function(it){return !!it&&have.indexOf(it)>=0;});
  var rest=pantrySort(have.filter(function(it){return first.indexOf(it)<0;}),'name');
  var opt=function(it){return '<option value="'+esc(it.id)+'"'+(it.id===r.id?' selected':'')+'>'+esc((it.ic||'🥫')+' '+it.n)+'</option>';};
  return (r.id?'':'<option value="">'+(r.src==='hand'?'Artikel wählen …':'Welcher Artikel?')+'</option>')
    +(first.length&&rest.length?'<optgroup label="Passend">'+first.map(opt).join('')+'</optgroup><optgroup label="Weitere Artikel">'+rest.map(opt).join('')+'</optgroup>'
      :first.concat(rest).map(opt).join(''));
}
// Noch nicht zugeordnete Zutaten als Hinweis am Knopf „＋ Artikel von Hand abziehen“.
function askRestHint(g){
  var used=g.rows.map(function(r){return r.src==='hand'?r.keys[0]:'';});
  var open=(g.rest||[]).filter(function(l){return used.indexOf(l.key)<0;}).map(function(l){return l.name;});
  return open.length?' (z. B. '+esc(open.slice(0,2).join(', '))+')':'';
}
// Auswahl der Zutat für eine von Hand zugeordnete Zeile.
function askIngOptions(g,r){
  var cur=r.keys[0]||'';
  return '<option value=""'+(cur?'':' selected')+'>Ohne Zutat</option>'
    +(g.rest||[]).map(function(l){return '<option value="'+esc(l.key)+'"'+(l.key===cur?' selected':'')+'>'+esc(l.name)+'</option>';}).join('');
}
function askRowHtml(gi,ri,r){
  var it=r.id?byId(r.id):null,back=_ask.mode==='back',g=_ask.groups[gi],hand=r.src==='hand';
  var lbl=back?(r.dir>0?'zurück':'zusätzlich ab'):'abziehen';
  var note=back?(r.dir>0?'Zurück in den Vorrat':'Mehr gegessen — zusätzlich abziehen')
    :[r.src==='choice'?(it?'':'Mehrdeutig — wahrscheinlichste zuerst'):r.src==='guess'?'Vermutet — bitte prüfen':hand?'Von Hand zugeordnet':'',
      // Woher die Zeile kommt, nur wenn der Tagebuch-Name anders heißt als der Artikel.
      hand||!r.names.length||it&&r.names.every(function(n){return pantryKey(n)===pantryKey(it.n);})?'':'aus „'+r.names.join('“, „')+'“',
      it?fmtN(it.q)+' Stück da':''].filter(Boolean).join(' · ');
  var name=it?(it.ic||'🥫')+' '+it.n:'';
  var ing=!back&&hand&&g&&g.rest&&g.rest.length;
  return '<div class="pantry-meal-row'+(ing?' pantry-meal-hand':'')+'" data-g="'+gi+'" data-r="'+ri+'">'
    +'<label class="pantry-meal-on"><input type="checkbox"'+(r.on?' checked':'')+' aria-label="'+esc((name||r.names.join(', '))+' '+lbl)+'"></label>'
    +(back?'<strong class="pantry-meal-name">'+esc(name)+'</strong>'
      :(ing?'<select class="sinp pantry-meal-ing" aria-label="Zutat aus dem Eintrag" onchange="NTPantry.askIng(this)">'+askIngOptions(g,r)+'</select>':'')
        +'<select class="sinp pantry-meal-it" aria-label="Vorratsartikel für '+esc(r.names.join(', ')||'Handabzug')+'" onchange="NTPantry.askPick(this)">'+askOptions(r)+'</select>')
    +'<small>'+esc(note)+'</small>'
    +'<label class="pantry-meal-q"><input class="sinp" inputmode="decimal" value="'+esc(r.q===null||r.q===undefined?'':fmtN(r.q))+'" placeholder="0" aria-label="'+esc((name||'Menge')+' '+lbl+', '+(r.unit||'Stück'))+'"><span>'+esc(r.unit||'Stück')+'</span></label>'
    +'</div>';
}
function renderAsk(){
  var el=document.getElementById('pantryMealRows');
  if(!el||!_ask)return;
  var back=_ask.mode==='back',many=_ask.groups.length>1||_ask.mode==='open';
  var t=document.getElementById('pantryMealTitle'),sub=document.getElementById('pantryMealSub');
  var ok=document.getElementById('pantryMealOk'),no=document.getElementById('pantryMealNo');
  if(t)t.textContent=back?(_ask.gone?'Vorratsbuchung zurücknehmen?':'Vorratsbuchung anpassen?'):'Aus dem Vorrat abziehen?';
  if(sub)sub.textContent=back?(_ask.gone?'Der Eintrag ist gelöscht. Dafür wurde vom Vorrat abgezogen.':'Die Menge ist geändert. Dafür wurde vom Vorrat abgezogen.')
    :(_ask.mode==='open'?'Ohne dich eingetragen — erst jetzt gefragt. Verfällt nach '+PANTRY_ASK_DAYS+' Tagen.':'Der Eintrag ist im Tagebuch gespeichert.');
  if(ok)ok.textContent=back?(_ask.gone?'Zurückbuchen':'Buchung anpassen'):'Abziehen';
  if(no)no.textContent=back?'Vorrat so lassen':'Nicht aus dem Vorrat';
  el.innerHTML=_ask.groups.map(function(g,gi){
    return (many||back?'<div class="lbl pantry-meal-head">'+esc(g.title)+'</div>':'')
      +g.rows.map(function(r,ri){return askRowHtml(gi,ri,r);}).join('')
      +(back?'':'<button type="button" class="seb pantry-meal-add" data-act="NTPantry.askAdd" data-args="['+gi+']">＋ Artikel von Hand abziehen'
        +askRestHint(g)+'</button>');
  }).join('');
}
// Eingaben in das Modell zurücklesen (vor Neuzeichnen und Buchen).
function askRead(){
  if(!_ask)return;
  document.querySelectorAll('#pantryMealRows .pantry-meal-row').forEach(function(row){
    var g=_ask.groups[+row.getAttribute('data-g')],r=g&&g.rows[+row.getAttribute('data-r')];
    if(!r)return;
    var on=/** @type {HTMLInputElement} */ (row.querySelector('.pantry-meal-on input'));
    var q=/** @type {HTMLInputElement} */ (row.querySelector('.pantry-meal-q input'));
    var sel=/** @type {HTMLSelectElement} */ (row.querySelector('.pantry-meal-it'));
    if(on)r.on=on.checked;
    if(q){var v=parseFloat(String(q.value||'').replace(',','.'));r.q=isFinite(v)&&v>0?v:null;}
    if(sel)r.id=sel.value;
  });
}
// Anderen Artikel gewählt: Einheit und Menge neu, Zeile an.
/** @param {HTMLSelectElement} sel */
function askPick(sel){
  var row=sel&&sel.closest?sel.closest('.pantry-meal-row'):null;
  if(!row||!_ask)return;
  var g=_ask.groups[+row.getAttribute('data-g')],r=g&&g.rows[+row.getAttribute('data-r')];
  if(!r)return;
  askRead();
  var it=byId(sel.value);
  r.id=it?it.id:'';
  var qq=it?pantryAskQty(it,r.grams,r.known):{unit:'',q:null};
  r.unit=qq.unit;r.q=qq.q;r.on=!!it;
  renderAsk();
}
// Handabzug (Zeile von Hand): eine freie Zeile, Zutat und Artikel wählbar.
// Mit Zutat merkt „Abziehen“ die Zuordnung — beim nächsten Mal ist sie vorgewählt.
/** @param {number} gi */
function askAdd(gi){
  if(!_ask||_ask.mode==='back')return;
  askRead();
  var g=_ask.groups[+gi];
  if(!g)return;
  var used=g.rows.map(function(r){return r.src==='hand'?r.keys[0]:'';});
  var l=(g.rest||[]).filter(function(x){return used.indexOf(x.key)<0;})[0];
  g.rows.push({keys:l?[l.key]:[],names:l?[l.name]:[],id:'',cands:[],src:'hand',
    grams:l?l.grams:0,known:!!l&&l.known,unit:'',q:null,on:false,dir:-1});
  renderAsk();
}
/** @param {HTMLSelectElement} sel */
function askIng(sel){
  var row=sel&&sel.closest?sel.closest('.pantry-meal-row'):null;
  if(!row||!_ask)return;
  var g=_ask.groups[+row.getAttribute('data-g')],r=g&&g.rows[+row.getAttribute('data-r')];
  if(!r)return;
  askRead();
  var l=(g.rest||[]).filter(function(x){return x.key===sel.value;})[0];
  r.keys=l?[l.key]:[];r.names=l?[l.name]:[];r.grams=l?l.grams:0;r.known=!!l&&l.known;
  var it=r.id?byId(r.id):null;
  if(it){var qq=pantryAskQty(it,r.grams,r.known);r.unit=qq.unit;r.q=qq.q;}
  renderAsk();
}
function askLearn(keys,ok,id){var m=askMem();keys.forEach(function(k){m[k]=pantryAskLearn(m[k],ok,id);});}
// Rückbuchung `n` Stück zum Eintrag `v`: ganze Buchungen über Rückgängig,
// ein Rest anteilig in die abgebuchten Chargen (Korrektur im Verlauf).
function giveBack(it,n,v,name){
  var left=roundQty(n);
  logArr().filter(function(e){return e.ev===v&&e.pid===it.id&&!e.u&&e.d<0;}).forEach(function(e){
    if(left<=0)return;
    if(-e.d<=left+0.0005){reverse(e,it);left=roundQty(left+e.d);return;}
    var part=pantryLotsPart(e.lots,left);
    var lots=part.lots.concat(part.rest>0?[{id:uid('charge'),q:part.rest,mhd:it.mhd||'',vd:it.vd||''}]:[]);
    appendLots(it,lots);
    var le=log(it,left,'korrektur','Mahlzeit');
    if(le){le.lots=lots;le.ev=v;if(name)le.en=name;}
    left=0;
  });
}
function confirmMeal(){
  if(!_ask){closeOv('pantryMealOv');return;}
  askRead();
  var used=[],back=_ask.mode==='back';
  _ask.groups.forEach(function(g){
    g.rows.forEach(function(r){
      var it=r.id?byId(r.id):null;
      var pieces=it&&r.on&&r.q?(r.dir>0?Math.min(+r.net||0,r.unit==='g'?(+it.g>0?r.q/it.g:0):r.q):pantryAskPieces(it,r.q,r.unit)):0;
      if(!back&&r.keys.length&&(r.src!=='hand'||pieces>0))askLearn(r.keys,pieces>0,it?it.id:'');
      if(!(pieces>0))return;
      var before=pantryNeed(it.q,it.min);
      if(r.dir>0)giveBack(it,pieces,g.v,g.name);
      else{
        var e=take(it,pieces,'verbrauch','Mahlzeit');
        if(!e)return;
        e.ev=g.v;if(g.name)e.en=g.name;
      }
      it.rev=nextRev();
      if(used.indexOf(it)<0)used.push(it);
      afterChange(it,before);
    });
    if(!back)askDrop(g.v);
  });
  _ask=null;
  saveS();
  if(used.length){Sync.schedule();showToast((back?'Vorrat angepasst ✓':'Vom Vorrat abgezogen ✓')+' · ↩️ im Verlauf');}
  render();
  closeOv('pantryMealOv');
}
// „Nicht aus dem Vorrat“: gleichrangiger Ausgang ohne Nachfrage. Merkt die
// Ablehnung je Name (nach PANTRY_ASK_NO in Folge wird nicht mehr gefragt).
function declineMeal(){
  if(_ask&&_ask.mode!=='back'){
    askRead();
    _ask.groups.forEach(function(g){
      g.rows.forEach(function(r){if(r.keys.length&&r.src!=='hand')askLearn(r.keys,false);});
      askDrop(g.v);
    });
    saveS();render();
  }
  _ask=null;
  closeOv('pantryMealOv');
}
/** @param {boolean} on */
function setAsk(on){
  S.pantryAskOff=!on;saveS();
  renderMore();render();
  showToast(on?'Beim Eintragen wird nach dem Vorrat gefragt':'Beim Eintragen wird nicht mehr nach dem Vorrat gefragt');
}
function mutedKeys(){var m=askMem();return Object.keys(m).filter(function(k){return pantryAskMuted(m[k]);});}
function askUnmute(){
  var m=askMem();mutedKeys().forEach(function(k){delete m[k];});
  saveS();renderMore();
  showToast('Für alle Namen wird wieder gefragt');
}

// ════════ Sync ════════
function stripSy(o){var c={};Object.keys(o).forEach(function(k){if(k!=='_sy')c[k]=o[k];});return c;}
function records(){
  var out=[];
  items().forEach(function(it){out.push({id:it.id,rev:it.rev||0,holder:it,payload:{i:stripSy(it)}});});
  locs().forEach(function(l){out.push({id:LOC_PREFIX+l.id,rev:l.rev||0,holder:l,payload:{l:stripSy(l)}});});
  logArr().forEach(function(e){out.push({id:LOG_PREFIX+e.id,rev:e.rev||0,holder:e,payload:{g:stripSy(e)}});});
  var t=tomb();
  Object.keys(t).forEach(function(id){
    if(!t[id])return;
    out.push({id:id,rev:t[id].rev||0,holder:t[id],payload:id.indexOf(LOC_PREFIX)===0?{l:null}:{i:null}});
  });
  return out;
}
// Höhere rev gewinnt — für Artikel, Lagerorte und Grabsteine gleich.
function applyRec(id,rev,payload,room){
  if(String(id).indexOf(LOG_PREFIX)===0)return applyLog(String(id).slice(LOG_PREFIX.length),rev,payload,room);
  var isLoc=String(id).indexOf(LOC_PREFIX)===0;
  var t=tomb();
  if(t[id]&&(t[id].rev||0)>=rev)return false;
  var arr=isLoc?locs():items(),key=isLoc?id.slice(LOC_PREFIX.length):id,idx=-1;
  for(var i=0;i<arr.length;i++)if(arr[i].id===key){idx=i;break;}
  if(idx>=0&&(arr[idx].rev||0)>=rev)return false;
  if(idx>=0)arr.splice(idx,1);
  var body=isLoc?payload.l:payload.i;
  if(body===null||body===undefined){
    var g={rev:rev};NTSync.ack(g,room,rev);t[id]=g;
    if(isLoc)items().forEach(function(it){if(it.loc===key)it.loc='';});
  }else{
    if(t[id])delete t[id];
    body.id=key;body.rev=rev;
    NTSync.ack(body,room,rev);
    arr.push(body);
  }
  if(rev>_lastRev)_lastRev=rev;
  return true;
}
// Verlauf: höhere rev gewinnt, Älteres als LOG_DAYS wird nicht angenommen.
function applyLog(key,rev,payload,room){
  var body=payload&&payload.g;
  if(!body||(+body.t||0)<Date.now()-LOG_DAYS*864e5)return false;
  var a=logArr(),idx=-1;
  for(var i=0;i<a.length;i++)if(a[i].id===key){idx=i;break;}
  if(idx>=0&&(a[idx].rev||0)>=rev)return false;
  body.id=key;body.rev=rev;
  NTSync.ack(body,room,rev);
  if(idx>=0)a[idx]=body;else a.push(body);
  a.sort(function(x,y){return (+y.t||0)-(+x.t||0);});
  if(rev>_lastRev)_lastRev=rev;
  return true;
}
var Sync=NTSync.engine({
  topic:'pantry',path:'/pantry/sync',header:'X-Pantry-Room',salt:'nutritrack-pantry',
  pollMs:30000,debounceMs:1200,
  records:records,apply:applyRec,
  onApplied:function(){render();if(isOpen('pantryLogOv'))renderLog();},
  onStatus:function(){}
});

// ════════ Heute-Kachel ════════
function renderCard(){
  var v=document.getElementById('pantryCardVal');
  var body=document.getElementById('pantryCardBody');
  if(!v||!body)return;
  var a=items(),lo=a.filter(low),ex=expiring();
  v.textContent=a.length?(a.length+' Artikel'):'＋ Eintragen';
  if(!a.length){body.innerHTML='<div style="font-size:12px;color:var(--mu);">Noch nichts eingetragen.</div>';return;}
  // Offene Vorschläge aus dem Tagebuch (E3): eine ruhige Zeile, antippen fragt.
  var asks=askOn()&&askList().length?askOpenGroups().length:0;
  var askLine=asks?'<button type="button" class="pantry-soon" data-act="NTPantry.openAsk" style="margin:0 0 6px;"><span aria-hidden="true">🍽️</span><span>'
    +asks+(asks===1?' Mahlzeit':' Mahlzeiten')+': aus dem Vorrat abziehen?</span><span aria-hidden="true">›</span></button>':'';
  if(!lo.length&&!ex.length){body.innerHTML=askLine+'<div style="font-size:12px;color:var(--mu);">Alles da, was da sein soll ✓</div>';return;}
  function chip(t){return '<span style="display:inline-block;background:var(--gl);border:1px solid var(--br);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;margin:0 4px 4px 0;">'+esc(t)+'</span>';}
  function more(n){return n>6?'<span style="font-size:11px;color:var(--mu);font-weight:700;">+'+(n-6)+' weitere</span>':'';}
  var html=askLine;
  if(ex.length){
    html+='<div style="font-size:11px;font-weight:700;color:var(--re);margin-bottom:4px;">Läuft ab:</div>'
      +ex.slice(0,6).map(function(x){
        var d=x.e.days<0?'abgelaufen':(x.e.days===0?'heute':(x.e.days===1?'morgen':fmtD(x.e.d)));
        return chip((x.it.ic||'🥫')+' '+x.it.n+' · '+d);
      }).join('')+more(ex.length);
  }
  if(lo.length){
    html+='<div style="font-size:11px;font-weight:700;color:var(--or);margin:'+(ex.length?'4px':'0')+' 0 4px;">Knapp:</div>'
      +lo.slice(0,6).map(function(it){return chip((it.ic||'🥫')+' '+it.n);}).join('')+more(lo.length);
  }
  body.innerHTML=html;
}

// ════════ Vorrats-Liste ════════
function open(){
  _query='';
  var s=/** @type {HTMLInputElement} */ (document.getElementById('pantrySearch'));
  if(s)s.value='';
  openOv('pantryOv');
  render();
  Sync.run();
  Sync.startPoll(function(){return isOpen('pantryOv')||isOpen('pantryItemOv')||isOpen('pantryLocsOv');});
}
function openExpiring(){open();setFilter(EXP);}
function close(){Sync.stopPoll();closeOv('pantryOv');}
function render(){
  renderCard();
  if(isOpen('pantryOv'))renderList();
  if(isOpen('pantryLocsOv'))renderLocs();
}
// '' = alles zeigen (Kennzahl und Chip zurück), EXP/LOW = Kennzahl, sonst Chip.
/** @param {string} id */
function setFilter(id){
  id=id||'';
  if(!id){_tile='';_filter='';}
  else if(id===EXP||id===LOW||id===SOON)_tile=id;
  else _filter=id;
  renderList();
}
// Kennzahl der Übersicht antippen: filtert, ein zweiter Tipp hebt auf.
/** @param {string} id */
function pickTile(id){
  if(!id||_tile===id){_tile='';if(!id)_filter='';}
  else _tile=id;
  renderList();
}
function order(){var o=S.pantryOrder;return ORDERS.some(function(x){return x[0]===o;})?o:'smart';}
/** @param {string} o */
function setOrder(o){
  if(!ORDERS.some(function(x){return x[0]===o;}))return;
  var wasCat=order()==='cat';
  S.pantryOrder=o;saveS();
  if(wasCat!==(o==='cat'))_filter='';// Chips wechseln zwischen Lagerorten und Kategorien
  renderList();
}
/** @param {string} v */
function search(v){_query=String(v||'');renderList();}
function addQuery(){
  var inp=/** @type {HTMLInputElement} */ (document.getElementById('pantryInput'));
  var s=/** @type {HTMLInputElement} */ (document.getElementById('pantrySearch'));
  if(!inp)return;
  inp.value=_query.trim();_query='';if(s)s.value='';
  submitInput();
}
function chipLoc(){return _filter&&_filter.indexOf(CAT_CHIP)!==0?_filter:'';}
function chipCat(){return _filter.indexOf(CAT_CHIP)===0?_filter.slice(CAT_CHIP.length):'';}
function dueOf(it){var e=(+it.q||0)>0?expiry(it):null;return e?e.d:'';}
// Listenzeile; `ro` = Prognose (Tage, null = keine Aussage), dezent und nur,
// wenn sie in den nächsten ROW_DAYS Tagen etwas bedeutet.
// Listenzeile, kompakt: Symbol, Name, Haltbarkeit, Menge. Ein Tipp klappt die
// Knöpfe auf (📂 − ＋ Details), immer nur eine Zeile zugleich (_rowOpen).
// `part` (Ansicht nach Lagerort, wenn angebrochene Packungen an einem anderen
// Ort stehen, openLoc): 'c' = geschlossene Chargen, 'o' = angebrochene; fehlt =
// ganzer Artikel. `ro` = Prognose (Tage, null = keine Aussage).
var _rowOpen='';
/** @param {any} it @param {any} ro @param {string} [part] */
function row(it,ro,part){
  var all=stockLots(it),lots=part?all.filter(function(lot){return part==='o'?!!lot.op:!lot.op;}):all;
  var q=roundQty(lots.reduce(function(n,lot){return n+lot.q;},0));
  if(!part)q=roundQty(+it.q||0);
  var lw=part!=='o'&&pantryMissing(it),e=q>0?expiryOf(it,lots,!part):null,op=part==='c'?'':openedOn(it);
  // 📂 nur, solange eine ungeöffnete Packung da ist und der Ort eine Frist kennt (nicht im Tiefkühler).
  var canOpen=part!=='o'&&q>0&&placeOf(it)!=='t'&&lots.some(function(lot){return !lot.op;});
  var soon=part!=='o'&&ro!==null&&ro!==undefined&&q>0&&ro<=ROW_DAYS;
  var key=it.id+(part?'|'+part:''),open=_rowOpen===key;
  var sub=[];
  if(e)sub.push('<span style="color:'+expiryColor(e)+';font-weight:'+(e.lvl==='ok'?'400':'700')+';">'+esc(expiryText(e))+'</span>');
  if(op&&!(e&&e.k==='op'))sub.push('📂 seit '+esc(fmtD(op)));
  if(part==='o'&&!(e&&e.k==='op'))sub.push('angebrochen');
  if(lw)sub.push('<span style="color:var(--or);">'+(+it.min>0?'mind. '+fmtN(it.min)+' ⚠️':'fehlt')+'</span>');
  if(soon)sub.push('<span style="color:'+(ro<=lead()?'var(--or)':'var(--mu)')+';">'+(ro<=0?'geht heute aus':'reicht ca. '+ro+(ro===1?' Tag':' Tage'))+'</span>');
  if(!sub.length)sub.push(+it.g>0?'à '+fmtN(it.g)+' g':(q>0?'kein Datum':'nicht da'));
  var pa=part?[it.id,-1,part]:[it.id,-1];
  return '<div class="pt-row'+(open?' is-open':'')+'">'
    +'<button type="button" class="pt-main" data-act="NTPantry.toggleRow" data-args="'+args([key])+'" aria-expanded="'+open+'">'
      +'<span class="pt-ic" aria-hidden="true">'+esc(icOf(it))+'</span>'
      +'<span class="pt-txt"><b class="pt-n">'+(it.auto&&part!=='o'?'🔁 ':'')+esc(it.n)+'</b><small>'+sub.join(' · ')+'</small></span>'
      +'<span class="pt-q'+(q>0?'':' is-zero')+'">'+fmtN(q)+'<small>'+(part==='o'?'offen':'Stück')+'</small></span>'
    +'</button>'
    +(open?'<div class="pt-acts">'
      +(canOpen?'<button type="button" class="pt-st pt-open" data-act="NTPantry.openNext" data-args="'+args([it.id])+'" aria-label="Eine Packung angebrochen">📂</button>':'')
      +'<button type="button" class="pt-st" data-act="NTPantry.step" data-args="'+args(pa)+'" aria-label="Eins weniger">−</button>'
      +(part==='o'?'':'<button type="button" class="pt-st" data-act="NTPantry.step" data-args="'+args([it.id,1])+'" aria-label="Eins mehr">＋</button>')
      +'<button type="button" class="seb pt-detail" data-act="NTPantry.openItem" data-args="'+args([it.id])+'">Details ›</button>'
    +'</div>':'')
    +'</div>';
}
// Symbol der Zeile: eigenes Symbol, sonst (oder statt des Einkaufswagens für
// Unbekanntes) das der Kategorie.
function icOf(it){var ic=it.ic;return !ic||ic==='🛒'?(catInfo(catOf(it)).ic||'🥫'):ic;}
/** @param {string} key */
function toggleRow(key){_rowOpen=_rowOpen===key?'':key;renderList();}
// Zugeklappte Gruppen (gerätelokal, nicht im Sync): S.pantryFold {Schlüssel: 1 = offen}.
function foldOpen(k){return !!(S.pantryFold&&S.pantryFold[k]);}
/** @param {string} k */
function fold(k){
  if(!S.pantryFold||typeof S.pantryFold!=='object')S.pantryFold={};
  if(S.pantryFold[k])delete S.pantryFold[k];else S.pantryFold[k]=1;
  saveS();renderList();
}
function foldHead(k,t,n,open){
  return '<button type="button" class="pt-fold" data-act="NTPantry.fold" data-args="'+args([k])+'" aria-expanded="'+open+'"><span>'+esc(t)+' <small>('+n+')</small></span><span aria-hidden="true">'+(open?'▾':'▸')+'</span></button>';
}
// Ansicht „Dringlichkeit“ (Standard): Zuerst aufbrauchen → Angebrochen →
// Vorrat nach Kategorie (zugeklappt) → Nicht da (zugeklappt). Mit Suche oder
// Lagerort-Filter sind alle Gruppen offen.
function smartHtml(shown,ros,all){
  var urg=[],opn=[],rest=[];
  shown.forEach(function(it){
    var e=expiry(it);
    if(e&&(e.lvl==='over'||e.lvl==='soon'))urg.push({it:it,d:e.d});
    else if(openedOn(it))opn.push({it:it,d:dueOf(it)||'9999'});
    else rest.push(it);
  });
  function byD(a,b){return a.d.localeCompare(b.d)||String(a.it.n).localeCompare(String(b.it.n),'de');}
  var html='';
  if(urg.length)html+=groupHead('⏰ Zuerst aufbrauchen')+urg.sort(byD).map(function(x){return row(x.it,ros[x.it.id]);}).join('');
  if(opn.length)html+=groupHead('📂 Angebrochen')+opn.sort(byD).map(function(x){return row(x.it,ros[x.it.id]);}).join('');
  if(rest.length){
    html+=groupHead('🥫 Vorrat');
    cats().forEach(function(c){
      var a=rest.filter(function(it){return catOf(it)===c.id;});
      if(!a.length)return;
      var k='cat:'+c.id,o=all||foldOpen(k);
      html+=foldHead(k,c.ic+' '+c.label,a.length,o);
      if(o)html+=pantrySort(a,'name').map(function(it){return row(it,ros[it.id]);}).join('');
    });
  }
  return html;
}
// „Nicht da“: aufgebrauchte Artikel, zugeklappt am Ende jeder Ansicht.
function absentHtml(list,ros,all){
  if(!list.length)return '';
  var o=all||foldOpen('nd');
  return foldHead('nd','∅ Nicht da',list.length,o)+(o?pantrySort(list,'name').map(function(it){return row(it,ros[it.id]);}).join(''):'');
}
// Wo ein Artikel in der Ansicht nach Lagerort steht: [{loc, part}] — zwei
// Einträge, wenn angebrochene Packungen an einem anderen Ort stehen.
function placesOf(it){
  var o=openLoc(it),lots=stockLots(it);
  var nOp=lots.filter(function(lot){return !!lot.op;}).length;
  if(!o||!nOp)return [{loc:it.loc||'',part:''}];
  var out=[];
  if(nOp<lots.length)out.push({loc:it.loc||'',part:'c'});
  out.push({loc:o,part:'o'});
  return out;
}
// Übersicht (A1): drei Kennzahlen, antippen filtert. Bei 0 in gedämpfter Farbe.
function renderStats(a,ex,miss){
  var el=document.getElementById('pantryStats');
  if(!el)return;
  var over=ex.some(function(x){return x.e.lvl==='over';});
  function stat(id,n,label,color){
    return '<button type="button" class="nt-tool" data-act="NTPantry.pickTile" data-args="'+args([id])+'" aria-pressed="'+(id?_tile===id:!_tile&&!_filter)+'">'
      +'<span class="pantry-stat-n" style="color:'+color+';">'+n+'</span>'+label+'</button>';
  }
  el.innerHTML=stat(EXP,ex.length,'Läuft ab',ex.length?(over?'var(--re)':'var(--or)'):'var(--mu)')
    +stat(LOW,miss.length,'Fehlt',miss.length?'var(--or)':'var(--mu)')
    +stat('',a.length,'Artikel','var(--tx)');
}
// Nachkaufen (B2/C3): was laut Prognose in SOON_DAYS Tagen ausgeht (mit
// Bestand — leer steht schon unter „Fehlt“) und was automatisch auf dem
// Zettel steht. `ros` = Prognose je Artikel-ID.
function soonList(a,ros){
  return a.filter(function(it){
    var ro=ros[it.id];
    return !!(it.rs&&it.rs.s)||((+it.q||0)>0&&ro!==null&&ro!==undefined&&ro<=Math.max(SOON_DAYS,lead()));
  }).sort(function(x,y){
    var rx=ros[x.id],ry=ros[y.id];
    return (rx===null||rx===undefined?99:rx)-(ry===null||ry===undefined?99:ry)||String(x.n).localeCompare(String(y.n),'de');
  });
}
// Hinweiszeilen (P1): „geht bald aus“, offene Mahlzeiten, Monatsrückblick.
// Steht mehr als einer an, zeigt der Kopf EINE Zeile „N Hinweise: …“, die
// aufklappt — so beginnt die Liste auch auf kleinen Telefonen weit oben.
var _hs={soon:'',ask:'',month:''};
var _hintsOpen=false;
function renderHints(){
  var sum=document.getElementById('pantryHintSum'),list=document.getElementById('pantryHintList');
  if(!sum||!list)return;
  var shorts=[_hs.soon,_hs.ask,_hs.month].filter(Boolean),many=shorts.length>1,open=_hintsOpen||_tile===SOON;
  sum.innerHTML=many?'<button type="button" class="pantry-soon pantry-hint-sum" data-act="NTPantry.toggleHints" aria-expanded="'+open+'">'
    +'<span aria-hidden="true">💡</span><span>'+shorts.length+' Hinweise: '+esc(shorts.join(' · '))+'</span><span aria-hidden="true">'+(open?'▴':'▾')+'</span></button>':'';
  list.hidden=many&&!open;
}
function toggleHints(){_hintsOpen=!_hintsOpen;renderHints();}
// ── Monatsrückblick (H2) ──
// Einmal im Monat, beim ersten Öffnen nach dem Monatswechsel (täglicher Lauf):
// eine ruhige Zeile, wenn im Vormonat etwas weggeworfen wurde. Bei 0 nichts;
// aus mit der Ablauf-Erinnerung (S.pantryRemindOff). Gerätelokal:
//   S.pantryMonthSeen  'JJJJ-MM' zuletzt geprüfter Monat
//   S.pantryMonthNews  {m: Vormonat, t: ms} bis weggetippt oder MONTH_NEWS_DAYS
var MONTH_NEWS_DAYS=7;
function monthCheck(){
  if(pantryOff())return;
  var cur=monthKey(new Date());
  if(S.pantryMonthSeen===cur)return;
  // Der erste Lauf überhaupt merkt sich nur den Monat: kein Rückblick mitten im Monat.
  var first=!S.pantryMonthSeen;
  S.pantryMonthSeen=cur;
  delete S.pantryMonthNews;
  if(!first&&!S.pantryRemindOff){
    var prev=pantryMonthShift(cur,-1);
    if(pantryWaste(logArr(),prev).n)S.pantryMonthNews={m:prev,t:Date.now()};
  }
  saveS();render();
}
function monthNews(){
  var m=S.pantryMonthNews;
  if(!m||!m.m||S.pantryRemindOff||pantryOff()||Date.now()-(+m.t||0)>MONTH_NEWS_DAYS*864e5)return null;
  var w=pantryWaste(logArr(),m.m);
  return w.n?{m:String(m.m),w:w}:null;
}
function renderMonthHint(){
  var el=document.getElementById('pantryMonthHint');
  if(!el)return;
  var x=monthNews();
  if(!x){el.innerHTML='';_hs.month='';return;}
  var mn=MONTHS[(+x.m.split('-')[1]||1)-1],top=x.w.top[0],tip=top?wasteTip(top):'',arts=x.w.top.length;
  _hs.month='🗑️ Rückblick '+mn;
  el.innerHTML='<div class="pantry-month-hint"><button type="button" class="pantry-soon" data-act="NTPantry.openReport">'
    +'<span aria-hidden="true">🗑️</span><span>Im '+esc(mn)+' weggeworfen: '+(arts>1?arts+' Artikel — am häufigsten '+esc(top.n):fmtN(x.w.q)+'× '+esc(top.n))
    +(tip?'. Tipp: '+esc(tip):'')+'</span><span aria-hidden="true">›</span></button>'
    +'<button type="button" class="pantry-hint-x" data-act="NTPantry.monthDismiss" aria-label="Rückblick ausblenden">✕</button></div>';
}
function monthDismiss(){delete S.pantryMonthNews;saveS();render();}
// Ruhiger Hinweis unter den Kennzahlen, nur wenn es etwas gibt; antippen filtert.
function renderSoon(soon){
  var el=document.getElementById('pantrySoon');
  if(!el)return;
  var listed=soon.filter(function(it){return it.rs&&it.rs.s;}).length,going=soon.length-listed;
  if(!soon.length){el.innerHTML='';_hs.soon='';return;}
  var parts=[];
  if(going)parts.push(going+(going===1?' geht':' gehen')+' bald aus');
  if(listed)parts.push('🛒 '+listed+' auf dem Zettel');
  _hs.soon=(going?'⏳ ':'')+parts.join(' · ');
  el.innerHTML='<button type="button" class="pantry-soon" data-act="NTPantry.pickTile" data-args="'+args([SOON])+'" aria-pressed="'+(_tile===SOON)+'">'
    +'<span aria-hidden="true">⏳</span><span>'+esc(parts.join(' · '))+'</span><span aria-hidden="true">'+(_tile===SOON?'✕':'›')+'</span></button>';
}
// Eine Zeile der Nachkaufen-Ansicht: Zeile wie in der Liste, darunter Stand und Knöpfe.
function soonRow(it,ro){
  var listed=!!(it.rs&&it.rs.s),blocked=!listed&&+it.rsNo>0&&autoBlocked(it);
  var t;
  if(listed)t='🛒 Steht auf dem Einkaufszettel (aus dem Vorrat)';
  else if(blocked)t='Diesmal nicht — wieder nach dem nächsten Einkauf';
  else if(it.auto&&ro!==null&&ro!==undefined)t=ro-lead()<=0?'Kommt gleich auf den Zettel':'Kommt ca. am '+fmtD(addDays(today(),ro-lead()))+' auf den Zettel';
  else t='Kein Dauerartikel — kommt nicht von selbst auf den Zettel';
  return '<div class="pantry-soon-item">'+row(it,ro)
    +'<div class="pantry-soon-row"><div class="pantry-charge-note">'+esc(t)+'</div><div class="pantry-charge-acts">'
      +(listed?'<span></span>':'<button type="button" class="seb" data-act="NTPantry.restockNow" data-args="'+args([it.id])+'">🛒 Auf den Zettel</button>')
      +(listed||(it.auto&&!blocked)?'<button type="button" class="seb" data-act="NTPantry.skipRestock" data-args="'+args([it.id])+'">Diesmal nicht</button>':'<span></span>')
    +'</div></div></div>';
}
// Läuft ab (F3): Zeile wie in der Liste, darunter der Weg zu passenden Rezepten.
function expRow(it,ro){
  return '<div class="pantry-soon-item">'+row(it,ro)
    +'<button type="button" class="seb pantry-exp-cook" data-act="NTPantry.openCook" data-args="'+args([it.id])+'">👨‍🍳 Rezept dazu finden</button></div>';
}
function autoBlocked(it){
  var b=lastBuy(it);
  return pantryAutoState(null,+it.rsNo||0,null,b?+b.t||0:0,Date.now(),BLOCK_DAYS).k==='blocked';
}
function groupHead(t){return '<div style="font-size:12px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:14px 2px 2px;">'+esc(t)+'</div>';}
function renderList(){
  var el=document.getElementById('pantryList');
  if(!el)return;
  var a=items(),lo=a.filter(low),ex=expiring(),miss=a.filter(pantryMissing),ord=order();
  var ros={},logFromMs=logFrom(),now=Date.now();
  a.forEach(function(it){ros[it.id]=pantryRunout(+it.q||0,pantryUseRate(logArr(),it.id,{now:now,q:+it.q||0,g:+it.g||0,from:logFromMs}));});
  var soon=soonList(a,ros);
  if(_tile===EXP&&!ex.length)_tile='';
  if(_tile===LOW&&!miss.length)_tile='';
  if(_tile===SOON&&!soon.length)_tile='';
  var sub=document.getElementById('pantryOvSub');
  if(sub)sub.textContent=a.length?(a.length+' Artikel'+(lo.length?' · '+lo.length+' knapp':'')+(ex.length?' · '+ex.length+' läuft ab':'')+(Sync.active()?' · geteilt':'')):'Noch nichts eingetragen';
  renderStats(a,ex,miss);
  renderSoon(soon);
  renderAskHint();
  renderMonthHint();
  renderHints();
  function rowOf(it){return row(it,ros[it.id]);}
  var sel=/** @type {HTMLSelectElement} */ (document.getElementById('pantryOrder'));
  if(sel){
    if(!sel.options.length)sel.innerHTML=ORDERS.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+'</option>';}).join('');
    sel.value=ord;
  }
  var byCat=ord==='cat';
  var chipList=byCat
    ?cats().filter(function(c){return a.some(function(it){return catOf(it)===c.id;});}).map(function(c){return {id:CAT_CHIP+c.id,t:c.ic+' '+c.label};})
    :sortedLocs().map(function(l){return {id:l.id,t:l.ic+' '+l.label};});
  if(_filter&&!chipList.some(function(c){return c.id===_filter;}))_filter='';
  var chips=document.getElementById('pantryLocChips');
  if(chips){
    chips.innerHTML='<button type="button" class="stab'+(!_filter?' act':'')+'" data-act="NTPantry.setFilter" data-args="'+args([''])+'">Alle</button>'
      +chipList.map(function(c){
        return '<button type="button" class="stab'+(_filter===c.id?' act':'')+'" data-act="NTPantry.setFilter" data-args="'+args([c.id])+'">'+esc(c.t)+'</button>';
      }).join('');
  }
  var q=_query.trim().toLocaleLowerCase('de');
  var fl=chipLoc(),fc=chipCat();
  var shown=a.filter(function(it){
    if(_tile===LOW&&!pantryMissing(it))return false;
    if(fl&&!placesOf(it).some(function(p){return p.loc===fl;}))return false;
    if(fc&&catOf(it)!==fc)return false;
    return !q||String(it.n||'').toLocaleLowerCase('de').indexOf(q)>=0;
  });
  if(_tile===EXP||_tile===SOON){
    var ok={};shown.forEach(function(it){ok[it.id]=1;});
    shown=_tile===EXP?ex.filter(function(x){return ok[x.it.id];}).map(function(x){return x.it;}):soon.filter(function(it){return ok[it.id];});
  }
  if(_tile===SOON&&shown.length){
    el.innerHTML='<div class="pantry-charge-note" style="margin:4px 2px 2px;">Nachkaufen — geschätzt aus dem Verbrauch. 🔁 Dauerartikel kommen '+lead()+(lead()===1?' Tag':' Tage')+' vorher von selbst auf den Zettel.</div>'
      +shown.map(function(it){return soonRow(it,ros[it.id]);}).join('');
    return;
  }
  if(!shown.length){
    el.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;line-height:1.5;">'
      +(q?'Nichts gefunden für „'+esc(_query.trim())+'“.':(a.length?'Hier steht gerade nichts.':'Trag oben ein, was du da hast — oder lass die KI Fotos von Kühlschrank und Schrank auswerten.'))+'</div>'
      +(q?'<button type="button" class="seb" data-act="NTPantry.addQuery">＋ „'+esc(_query.trim())+'“ einbuchen</button>':'');
    return;
  }
  // Läuft ab: dringendstes zuerst; sonst flach sortiert oder nach Ort/Kategorie gruppiert.
  if(_tile===EXP){
    el.innerHTML=shown.map(function(it){return expRow(it,ros[it.id]);}).join('');
    return;
  }
  // Aufgebrauchtes steht unter „Nicht da“ (außer im Filter „Fehlt“).
  var absent=_tile===LOW?[]:shown.filter(function(it){return !((+it.q||0)>0);});
  if(absent.length)shown=shown.filter(function(it){return (+it.q||0)>0;});
  var allOpen=!!q||!!fl;
  if(ord==='smart'){
    el.innerHTML=smartHtml(shown,ros,allOpen)+absentHtml(absent,ros,allOpen);
    return;
  }
  if(ord==='exp'||ord==='name'||ord==='qty'){
    el.innerHTML=pantrySort(shown,ord,dueOf).map(rowOf).join('')+absentHtml(absent,ros,allOpen);
    return;
  }
  var groups=byCat
    ?cats().map(function(c){return {id:c.id,t:c.ic+' '+c.label,a:[]};})
    :sortedLocs().map(function(l){return {id:l.id,t:l.ic+' '+l.label,a:[]};}).concat([{id:'',t:'📦 Ohne Lagerort',a:[]}]);
  shown.forEach(function(it){
    (byCat?[{loc:catOf(it),part:''}]:placesOf(it)).forEach(function(p){
      if(fl&&p.loc!==fl)return;
      var g=null;
      for(var i=0;i<groups.length;i++)if(groups[i].id===p.loc)g=groups[i];
      (g||groups[groups.length-1]).a.push({it:it,part:p.part});
    });
  });
  var html='';
  groups.forEach(function(g){
    if(!g.a.length)return;
    html+=groupHead(g.t);
    g.a.sort(function(x,y){return String(x.it.n).localeCompare(String(y.it.n),'de')||(x.part<y.part?-1:1);})
      .forEach(function(x){html+=row(x.it,ros[x.it.id],x.part);});
  });
  el.innerHTML=html+absentHtml(absent,ros,allOpen);
}
function submitInput(){
  var inp=/** @type {HTMLInputElement} */ (document.getElementById('pantryInput'));
  if(!inp)return;
  var raw=inp.value.trim();
  if(!raw)return;
  // „3 Dosen Tomaten“ / „Milch 2“ → Stückzahl und Name
  var m=raw.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|st(?:ü|ue)ck|stk|dosen?|packungen?|flaschen?|gl(?:ä|ae)ser|glas)?\s+(.+)$/i)
       ||raw.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
  var n=raw,q=1;
  if(m){
    if(/^\d/.test(m[1])){q=parseFloat(m[1].replace(',','.'));n=m[2];}
    else{n=m[1];q=parseFloat(m[2].replace(',','.'));}
  }
  var it=add(n,q,0,chipLoc(),'',0,null,'hand',chipCat());
  inp.value='';inp.focus();
  if(it)showToast('Im Vorrat ✓');
}
function inputKey(ev){if(ev&&(ev.key==='Enter'||ev.keyCode===13)){ev.preventDefault();submitInput();}}

// ════════ Artikel bearbeiten ════════
function val(id){var el=/** @type {HTMLInputElement} */ (document.getElementById(id));return el?el.value:'';}
function setVal(id,v){var el=/** @type {HTMLInputElement} */ (document.getElementById(id));if(el)el.value=v;}
function locOptions(sel){
  return '<option value="">📦 Ohne Lagerort</option>'+sortedLocs().map(function(l){
    return '<option value="'+esc(l.id)+'"'+(l.id===sel?' selected':'')+'>'+esc(l.ic+' '+l.label)+'</option>';
  }).join('');
}
function catOptions(sel){
  return '<option value="">🔮 Automatisch erkennen</option>'+cats().map(function(c){
    return '<option value="'+esc(c.id)+'"'+(c.id===sel?' selected':'')+'>'+esc(c.ic+' '+c.label)+'</option>';
  }).join('');
}
// Eingebucht am: an der Charge (`in`), bei älteren Chargen aus dem Verlauf.
function bookedOn(lot){
  if(lot.in)return lot.in;
  var a=logArr();
  for(var i=0;i<a.length;i++){
    var e=a[i];
    if(e.d>0&&Array.isArray(e.lots)&&e.lots.some(function(l){return l&&l.id===lot.id;})){
      var d=new Date(+e.t||0);
      return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
    }
  }
  return '';
}
// Neue Charge (Zeile ohne data-lot-id) oder vorhandene Charge (A4): Menge,
// MHD, Verbrauchsdatum und „geöffnet am“ änderbar, Mengen- und Entfernen-
// Änderungen laufen als Korrektur durch den Verlauf. Die erste Karte trägt die
// IDs pantryItemMhd/pantryItemVd (ohne Chargen: Daten der neuen Packung).
/** @param {any} it @param {any} lot @param {boolean} [first] */
function chargeRow(it,lot,first){
  var ids=first?{mhd:' id="pantryItemMhd"',vd:' id="pantryItemVd"'}:{mhd:'',vd:''};
  if(!lot){
    var id=first?'':uid('charge-row');
    return '<div class="pantry-charge"'+(id?' id="'+id+'"':' data-new-first="1"')+' data-lot-id="">'
      +(first?'<div id="pantryItemEst" class="pantry-charge-note"></div>':'')
      +'<label>Stück<input class="sinp pantry-charge-qty"'+(first?' id="pantryItemQ1"':'')+' inputmode="decimal" value="1" oninput="NTPantry.qtySync(false)"></label>'
      +'<label><span class="pantry-mhd-lbl">MHD</span><input type="date" class="sinp pantry-charge-mhd"'+ids.mhd+' value="" onchange="NTPantry.formChanged()"></label>'
      +'<label>Verbrauchsdatum<input type="date" class="sinp pantry-charge-vd"'+ids.vd+' value=""></label>'
      +'<label>Schon angebrochen am<input type="date" class="sinp pantry-charge-op" value=""></label>'
      +(id?'<button type="button" class="seb" data-act="NTPantry.removeChargeRow" data-args="'+args([id])+'">Zeile entfernen</button>':'')+'</div>';
  }
  var od=openDays(it),due=pantryLotDue(lot,od),bk=bookedOn(lot);
  var n=due?pantryDays(due,today()):null;
  var dueTxt=lot.op?'Geöffnet am '+fmtD(lot.op)+(od>0?' · hält noch bis '+fmtD(addDays(lot.op,od)):''):'';
  if(lot.op&&!(od>0)&&it.od!==0)dueTxt+=' · wie lange es angebrochen hält, unten unter „Angebrochen haltbar“ eintragen';
  if(!lot.op&&due)dueTxt=(due===lot.vd?'Verbr. bis ':(lot.estimated&&due===lot.mhd?'MHD ca. ':'MHD '))+fmtD(due)+(lot.estimated&&due===lot.mhd?' · geschätzt':'');
  if(n!==null&&n<0)dueTxt+=' ⚠️ abgelaufen';else if(n!==null&&n<=EXP_DAYS)dueTxt+=' ⏰';
  return '<div class="pantry-charge" data-lot-id="'+esc(lot.id)+'">'
    +'<strong>'+fmtN(lot.q)+' Stück'+(bk?' · eingebucht '+fmtD(bk):'')+'</strong>'
    +(dueTxt?'<div class="pantry-charge-note" style="color:'+(n!==null&&n<=EXP_DAYS?(n<0?'var(--re)':'var(--or)'):'var(--mu)')+';">'+esc(dueTxt)+'</div>':'')
    +'<label>Stück<input class="sinp pantry-charge-q" inputmode="decimal" value="'+esc(fmtN(lot.q))+'"></label>'
    +'<label>Angebrochen am<input type="date" class="sinp pantry-charge-op" value="'+esc(lot.op||'')+'"></label>'
    +'<label>MHD<input type="date" class="sinp pantry-charge-mhd"'+ids.mhd+' value="'+esc(lot.mhd||'')+'"></label>'
    +'<label>Verbrauchsdatum<input type="date" class="sinp pantry-charge-vd"'+ids.vd+' value="'+esc(lot.vd||'')+'"></label>'
    +'<div class="pantry-charge-acts">'
      +(lot.op?'<span></span>':'<button type="button" class="seb" data-act="NTPantry.openLot" data-args="'+args([lot.id])+'" aria-label="Heute angebrochen markieren">📂 Angebrochen</button>')
      +'<button type="button" class="seb" data-act="NTPantry.dropLot" data-args="'+args([lot.id])+'">🗑️ Entfernen</button>'
      +((+lot.q||0)>1?'<button type="button" class="seb" data-act="NTPantry.splitLot" data-args="'+args([lot.id])+'">✂️ 1 Stück abteilen</button>':'')
    +'</div></div>';
}
function renderCharges(it){
  var lots=it?pantryLotOrder(stockLots(it),openDays(it)):[];
  var head=document.getElementById('pantryFirstCharge');
  if(head)head.textContent=lots.length?(lots.length===1?'Charge':lots.length+' Chargen · oben wird zuerst verbraucht'):'Haltbarkeit der neuen Packung';
  var el=document.getElementById('pantryCharges');
  if(el)el.innerHTML=lots.length?lots.map(function(lot,i){return chargeRow(it,lot,i===0);}).join(''):chargeRow(it,null,true);
  formChanged();
}
function addChargeRow(){document.getElementById('pantryCharges').insertAdjacentHTML('beforeend',chargeRow(null,null,false));qtySync(true);formChanged();}
// Ohne Bestand trägt jede neue Zeile „Stück + Datum“; die Gesamtzahl oben ist
// ihre Summe. `fromTotal`: oben geändert → die erste Zeile nimmt den Rest.
/** @param {boolean} fromTotal */
function qtySync(fromTotal){
  var q1=/** @type {HTMLInputElement} */ (document.getElementById('pantryItemQ1'));
  if(!q1)return;
  var others=0;
  document.querySelectorAll('#pantryCharges .pantry-charge[data-lot-id=""]:not([data-new-first]) .pantry-charge-qty').forEach(function(el){others+=num(/** @type {HTMLInputElement} */ (el).value);});
  if(fromTotal){
    var rest=roundQty(num(val('pantryItemQ'))-others);
    q1.value=fmtN(rest>0?rest:0);
    if(!(rest>0))setVal('pantryItemQ',fmtN(others));
  }else setVal('pantryItemQ',fmtN(roundQty(num(q1.value)+others)));
}
// ✂️ Ein Stück einer Charge abteilen, z. B. für ein anderes MHD (pantrySplitOne).
/** @param {string} lotId */
function splitLot(lotId){
  var it=current();if(!it)return;
  var r=pantrySplitOne(stockLots(it),lotId,'s');
  if(!r)return;
  writeLots(it,r.lots);touch(it);refreshItem(it);
  showToast('✂️ 1 Stück abgeteilt — Datum in der neuen Charge anpassen und speichern');
}
function removeChargeRow(id){
  var row=document.getElementById(id);
  if(row&&row.classList.contains('pantry-charge')&&!row.getAttribute('data-lot-id'))row.remove();
  qtySync(true);
}
// Kopf der Detailansicht (A4): Bestand, Ort, Kategorie, Mindestmenge, Haltbarkeit, Aktionen.
function renderItemSum(it){
  var el=document.getElementById('pantryItemSum');
  if(!el)return;
  if(!it){el.innerHTML='';return;}
  var l=loc(it.loc),c=catInfo(catOf(it)),e=(+it.q||0)>0?expiry(it):null,lw=pantryMissing(it);
  function cell(k,v,color){return '<div><small>'+k+'</small><b'+(color?' style="color:'+color+';"':'')+'>'+esc(v)+'</b></div>';}
  el.innerHTML='<div class="pantry-sum"><div class="pantry-sum-grid">'
    +cell('Bestand',amountText(it),lw?'var(--or)':'')
    +cell('Lagerort',(l?l.ic+' '+l.label:'📦 Ohne Lagerort')+(loc(openLoc(it))?' · angebrochen: '+loc(openLoc(it)).label:''))
    +cell('Kategorie',c.ic+' '+c.label)
    +cell('Mindestmenge',+it.min>0?fmtN(it.min)+' Stück':'–')
    +'</div>'
    +(e?'<div class="pantry-sum-exp" style="color:'+expiryColor(e)+';">'+esc(expiryText(e))+'</div>':'')
    +useText(it)
    +'<div class="pantry-sum-acts">'
      +'<button type="button" class="seb" data-act="NTPantry.toShop">🛒 Auf den Zettel</button>'
      +'<button type="button" class="seb" data-act="NTPantry.editFields">✏️ Bearbeiten</button>'
    +'</div></div>';
}
// Verbrauch und Prognose im Artikel-Detail (B2), ausdrücklich als Schätzung.
function useText(it){
  var r=usage(it);
  if(!r)return '<div class="pantry-sum-use">📈 Verbrauch: noch keine Schätzung — dafür braucht es mindestens 3 Entnahmen über eine Woche.</div>';
  var ro=pantryRunout(+it.q||0,r);
  var t='📈 Verbrauch ca. '+fmtUse(r.perWeek)+' Stück pro Woche'+(r.gPerWeek>0?' ('+fmtUse(r.gPerWeek>=1000?r.gPerWeek/1000:r.gPerWeek)+(r.gPerWeek>=1000?' kg)':' g)'):'');
  if(ro!==null&&(+it.q||0)>0)t+=' · '+(ro<=0?'geht heute aus':'reicht bis ca. '+fmtD(addDays(today(),ro)));
  return '<div class="pantry-sum-use">'+esc(t)+'<small>Schätzung aus '+r.n+' Entnahmen in '+r.days+' Tagen'+(it.auto?' · 🔁 Dauerartikel':'')+'</small></div>';
}
// Mindestmenge vorschlagen (B3): Bedarf für eine Woche, nur per Tipp übernommen.
function renderMinSug(it){
  var el=document.getElementById('pantryItemMinSug');
  if(!el)return;
  var s=it?pantryMinSuggest(usage(it),7):0;
  if(!s||s===+it.min){el.innerHTML='';return;}
  el.innerHTML='<div class="pantry-min-sug"><span>Vorschlag aus dem Verbrauch: <b>'+s+' Stück</b> (eine Woche)</span>'
    +'<button type="button" class="seb" data-act="NTPantry.takeMinSug" data-args="'+args([s])+'">Übernehmen</button></div>';
}
/** @param {number} s */
function takeMinSug(s){setVal('pantryItemMin',String(s));showToast('Mindestmenge '+s+' Stück eingetragen — mit „Speichern“ übernehmen');}
// Letzte Buchungen dieses Artikels, mit Rückgängig.
function renderItemLog(it){
  var el=document.getElementById('pantryItemLog');
  if(!el)return;
  var a=it?logArr().filter(function(e){return e.pid===it.id;}).slice(0,5):[];
  el.innerHTML=a.length?'<div class="lbl" style="margin-top:12px;">Letzte Buchungen</div>'+a.map(function(e){return logRow(e,true);}).join(''):'';
}
function refreshItem(it){
  _shownQ=fmtN((+it.q||0)>0?it.q:1);
  setVal('pantryItemQ',_shownQ);
  renderItemSum(it);
  renderCharges(it);
  renderItemExtras(it);
  renderItemLog(it);
  renderMinSug(it);
}
function current(){return _editId?byId(_editId):null;}
// D2: Charge heute geöffnet (Datum danach im Feld änderbar).
/** @param {string} lotId */
function openLot(lotId){
  var it=current();if(!it)return;
  if(markOpen(it,lotId))refreshItem(it);
}
// 📂 in der Liste: die Packung, die als nächste dran ist, heute angebrochen.
/** @param {string} id */
function openNext(id){var it=byId(id);if(it)markOpen(it,'');}
// Eine Packung angebrochen (von einer Charge mit mehreren Stück wird eine
// abgeteilt, pantryOpenOne). Zurück: im Artikel „Angebrochen am“ leeren.
/** @param {any} it @param {string} lotId */
function markOpen(it,lotId){
  var od=openDays(it),r=pantryOpenOne(stockLots(it),lotId,today(),od);
  if(!r)return false;
  writeLots(it,r.lots);touch(it);
  var ol=loc(openLoc(it));
  showToast('📂 '+(it.ic||'')+' '+it.n+' angebrochen'+(ol?' → '+ol.ic+' '+ol.label:'')+(od>0?' · hält ca. bis '+fmtD(addDays(today(),od)):(it.od===0?' · hält bis zum MHD':' · wie lange es angebrochen hält: im Artikel eintragen')));
  return true;
}
// Charge ganz austragen: Korrektur im Verlauf, damit „Rückgängig“ sie zurückholt.
/** @param {string} lotId */
function dropLot(lotId){
  var it=current();if(!it)return;
  var lot=stockLots(it).find(function(x){return x.id===lotId;});if(!lot)return;
  var before=pantryNeed(it.q,it.min);
  take(it,lot.q,'korrektur','hand',lot.id);
  touch(it);afterChange(it,before);refreshItem(it);
  showToast('Charge entfernt · ↩️ im Verlauf');
}
function toShop(){
  var it=current();if(!it||!window.NTShop)return;
  var need=pantryNeed(it.q,it.min);
  NTShop.add(it.n,need>0?need+' Stück':'',catOf(it),it.ic||'');
  showToast('🛒 '+(it.ic||'')+' '+it.n+' steht auf dem Einkaufszettel');
}
// Nachkaufen-Ansicht (C3): „Auf den Zettel“ jetzt — auch gegen ein früheres
// „diesmal nicht“ — und „Diesmal nicht“.
/** @param {string} id */
function restockNow(id){
  var it=byId(id);if(!it)return;
  autoState(it);
  var w=pantryRestockWhy(+it.q||0,+it.min||0,runout(it),Infinity);
  var ex=putOnList(it,w?whyText(w):'nachkaufen');
  if(!ex)return;
  touch(it);
  showToast('🛒 '+(it.ic||'')+' '+it.n+' steht auf dem Einkaufszettel');
}
/** @param {string} id */
function skipRestock(id){
  var it=byId(id);if(!it)return;
  var s=it.rs&&it.rs.s?shopById(it.rs.s):null,kept=false;
  // Nur einen rein automatischen Eintrag entfernen; braucht ihn ein Rezept, bleibt er.
  if(s&&!s.d&&s.pv&&window.NTShop){if(s.rc&&s.rc.length)kept=true;else NTShop.remove(s.id);}
  delete it.rs;it.rsNo=Date.now();
  touch(it);
  showToast(kept?'Bleibt für ein Rezept auf dem Zettel · kommt sonst erst nach dem nächsten Einkauf wieder':'Diesmal nicht · kommt nach dem nächsten Einkauf wieder in Frage');
}
// ⋯ Mehr: selten Gebrauchtes (Lagerorte, Teilen, Verlauf) und der Vorlauf.
function openMore(){renderMore();openOv('pantryMoreOv');}
function renderMore(){
  var sel=/** @type {HTMLSelectElement} */ (document.getElementById('pantryLead'));
  if(sel){
    if(!sel.options.length)sel.innerHTML=LEADS.map(function(n){return '<option value="'+n+'">'+n+(n===1?' Tag':' Tage')+' vorher</option>';}).join('');
    sel.value=String(lead());
  }
  var chk=/** @type {HTMLInputElement} */ (document.getElementById('pantryAskChk'));
  if(chk)chk.checked=askOn();
  var mu=document.getElementById('pantryAskMuted'),n=mutedKeys().length;
  if(mu)mu.innerHTML=n?'<div class="pantry-min-sug"><span>Für '+n+(n===1?' Namen':' Namen')+' fragt die App nicht mehr (dreimal hintereinander „Nicht aus dem Vorrat“).</span>'
    +'<button type="button" class="seb" data-act="NTPantry.askUnmute">Wieder fragen</button></div>':'';
}
// „Füllen“ im Wochenplan (F1): Vorrat in einem Rezept, siehe planPantryScore.
/** @param {Array<string>} names */
function planScore(names){
  if(pantryOff())return {bonus:0,use:[]};
  return planPantryScore(names,items(),expiry,EXP_DAYS);
}
// Aus ⋯ Mehr geöffnet: das kleine Blatt schließt, damit „zurück“ in der Liste landet.
function leaveMore(){if(isOpen('pantryMoreOv'))closeOv('pantryMoreOv');}
/** @param {string} v */
function setLead(v){
  var n=+v;if(LEADS.indexOf(n)<0)return;
  S.pantryLead=n;saveS();
  // Neuer Vorlauf gilt sofort für alle Dauerartikel.
  items().forEach(function(it){if(it.auto)restockItem(it);});
  saveS();Sync.schedule();render();
  showToast('Nachkaufen '+n+(n===1?' Tag':' Tage')+' vorher');
}
function editFields(){
  var box=document.getElementById('pantryItemEdit');
  if(box&&box.scrollIntoView)box.scrollIntoView({behavior:'smooth',block:'start'});
}
// Formular geändert: geschätztes MHD der neuen Packung (D1, steht als „ca.“
// im Datumsfeld, bis jemand das Packungsdatum einträgt), Lagerort-Vorschlag
// für neue Artikel (solange nicht von Hand gewählt), Richtwert für
// „Angebrochen haltbar“ und das Angebot, geschätzte Daten für einen neuen
// Lagerort neu zu berechnen (D4).
var _locTouched=false;// Lagerort im Artikel-Dialog von Hand gewählt
var _offPlace='';     // Art laut Open Food Facts für den gescannten Code ('k'|'t'|'v')
var _olTouched=false; // „Nach dem Öffnen lagern in“ von Hand gewählt
var _offCool=false;   // Packung sagt „nach dem Öffnen gekühlt“ (Open Food Facts)
function locPicked(){_locTouched=true;formChanged();}
function olPicked(){_olTouched=true;formChanged();}
function formChanged(){
  var it=current(),n=val('pantryItemName').trim();
  var probe={n:n,hd:it?+it.hd||0:0,c:val('pantryItemCat')||guessCat(n)};
  var sel=/** @type {HTMLSelectElement} */ (document.getElementById('pantryItemLoc'));
  if(!it&&!_locTouched&&sel&&n){var h=homeLoc(n,probe.c,_offPlace);if(h&&h!==sel.value)sel.value=h;}
  var locId=val('pantryItemLoc'),place=pantryPlace(loc(locId));
  var days=n?pantryEstimateDays(probe,place):0,est=days?addDays(today(),days):'';
  document.querySelectorAll('#pantryCharges .pantry-charge[data-lot-id=""]').forEach(function(row){
    var inp=/** @type {HTMLInputElement} */ (row.querySelector('.pantry-charge-mhd'));
    if(!inp)return;
    var was=inp.getAttribute('data-est')||'';
    if(!inp.value||inp.value===was){inp.value=est;inp.setAttribute('data-est',est);}
    var lbl=row.querySelector('.pantry-mhd-lbl');
    if(lbl)lbl.textContent=est&&inp.value===est?'MHD ca.':'MHD';
  });
  var note=document.getElementById('pantryItemEst');
  if(note){
    note.textContent=days?'MHD ca. '+fmtD(est)+' · geschätzt '+(probe.hd>0?'aus deinen letzten Einkäufen':'nach Richtwert für Produktart und Lagerort')+'. Datum von der Packung eintragen, wenn bekannt — daraus lernt die App.'
      :(n?'Für „'+n+'“ kennt die App keinen Richtwert — Datum von der Packung eintragen.':'Die App schätzt ein MHD nach Produktart und Lagerort.');
  }
  var ols=/** @type {HTMLSelectElement} */ (document.getElementById('pantryItemOl'));
  if(ols){
    if(!ols.options.length||ols.getAttribute('data-n')!==String(locs().length)){
      var keep=ols.value;
      ols.innerHTML='<option value="-">Bleibt am Lagerort</option>'+sortedLocs().map(function(l){return '<option value="'+esc(l.id)+'">'+esc(l.ic+' '+l.label)+'</option>';}).join('');
      ols.setAttribute('data-n',String(locs().length));
      if(keep)ols.value=keep;
    }
    if(!_olTouched)ols.value=openLocSuggest(n,probe.c,_offCool);
  }
  var od=document.getElementById('pantryItemOd'),odNote=document.getElementById('pantryItemOdNote');
  var olId=ols&&ols.value!=='-'?ols.value:'',oplace=olId?pantryPlace(loc(olId)):place;
  var rw=pantryOpenDays({n:n,c:probe.c},oplace);place=oplace;
  if(od)/** @type {HTMLInputElement} */ (od).placeholder=rw?String(rw):'z. B. 3';
  if(odNote)odNote.textContent=place==='t'?'Im Tiefkühler gilt keine Frist nach dem Anbrechen.'
    :'So lange hält eine Packung, nachdem sie mit 📂 als angebrochen markiert wurde. 0 = hält bis zum MHD.'+(rw?' Richtwert: '+rw+(rw===1?' Tag':' Tage')+'.':' Für diesen Artikel kennt die App keinen Richtwert.');
  var box=document.getElementById('pantryItemReloc');
  if(!box)return;
  var s=it&&locId!==_openLoc?pantryShelf(n,probe.c,place):null;
  var hit=s&&stockLots(it).some(function(lot){return lot.estimated&&!lot.vd;});
  var l=loc(locId);
  box.innerHTML=hit?'<label class="pantry-reloc"><input type="checkbox" id="pantryItemRelocChk" checked>'
    +'<span>Geschätztes Datum für „'+esc(l?l.label:'ohne Lagerort')+'“ neu berechnen: bis '+fmtD(addDays(today(),s.days))+' (Richtwert). Daten von der Packung bleiben.</span></label>':'';
}
function openItem(id){
  var it=id?byId(id):null;
  _editId=it?it.id:null;
  _openLoc=it?(it.loc||''):'';
  setVal('pantryItemName',it?it.n:'');
  setVal('pantryItemIcon',it?(it.ic||''):'');
  _shownQ=it?fmtN(it.q):'1';
  setVal('pantryItemQ',_shownQ);
  setVal('pantryItemG',it&&+it.g>0?fmtN(it.g):'');
  setVal('pantryItemMin',it&&+it.min>0?fmtN(it.min):'');
  _locTouched=!it&&!!chipLoc();_offPlace='';_offCool=false;
  _olTouched=!!(it&&it.ol);
  var olSel=/** @type {HTMLSelectElement} */ (document.getElementById('pantryItemOl'));
  if(olSel){
    olSel.innerHTML='<option value="-">Bleibt am Lagerort</option>'+sortedLocs().map(function(l){return '<option value="'+esc(l.id)+'">'+esc(l.ic+' '+l.label)+'</option>';}).join('');
    olSel.setAttribute('data-n',String(locs().length));
    olSel.value=it&&it.ol&&(it.ol==='-'||loc(it.ol))?it.ol:(it?openLocSuggest(it.n,catOf(it)):'-');
  }
  setVal('pantryItemOd',it?(it.od===0?'0':String(openDays(it)||'')):'');
  _odShown=val('pantryItemOd');
  setVal('pantryItemUseQ','1');
  var au=/** @type {HTMLInputElement} */ (document.getElementById('pantryItemAuto'));
  if(au)au.checked=!!(it&&it.auto);
  var ld=document.getElementById('pantryItemLead');
  if(ld)ld.textContent=lead()+(lead()===1?' Tag':' Tage');
  _pendingBc='';_pendingN=1;
  var sel=document.getElementById('pantryItemLoc');
  if(sel)sel.innerHTML=locOptions(it?it.loc:chipLoc());
  var cs=document.getElementById('pantryItemCat');
  if(cs)cs.innerHTML=catOptions(it?(it.c&&catInfo(it.c).id===it.c?it.c:''):chipCat());
  var wrap=document.getElementById('pantryItemWrap');
  if(wrap)wrap.classList.toggle('is-new',!it);
  var t=document.getElementById('pantryItemTitle');
  if(t)t.textContent=it?((it.ic||'🥫')+' '+it.n):'＋ Neuer Vorrats-Artikel';
  var del=document.getElementById('pantryItemDel');
  if(del)del.style.display=it?'':'none';
  renderItemSum(it);
  renderCharges(it);
  renderItemExtras(it);
  renderItemLog(it);
  renderMinSug(it);
  openOv('pantryItemOv');
}
function num(s){var v=parseFloat(String(s||'').replace(',','.'));return isFinite(v)&&v>0?v:0;}
// Barcode-Zeile und Verbrauchs-Knöpfe im Artikel-Dialog.
function renderItemExtras(it){
  var bc=document.getElementById('pantryItemBc');
  if(bc){
    if(_pendingBc&&!it){
      var others=items().slice().sort(function(a,b){return String(a.n).localeCompare(String(b.n),'de');});
      bc.innerHTML='<div style="font-size:12px;line-height:1.5;background:var(--gl);border:1px solid var(--br);border-radius:10px;padding:8px 10px;margin-bottom:8px;">🏷️ Barcode <b>'+esc(_pendingBc)+'</b> — als neuen Artikel anlegen oder einem vorhandenen zuordnen:'
        +'<select class="sinp" id="pantryItemAssign" style="margin-top:6px;"><option value="">＋ Neuer Artikel</option>'
        +others.map(function(o){return '<option value="'+esc(o.id)+'">'+esc((o.ic||'')+' '+o.n)+'</option>';}).join('')
        +'</select></div>';
    }else if(it&&Array.isArray(it.bc)&&it.bc.length){
      bc.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mu);margin-bottom:8px;">🏷️ '+it.bc.length+' Barcode'+(it.bc.length===1?'':'s')+' gespeichert'
        +'<button type="button" class="seb" style="width:auto;margin:0 0 0 auto;padding:5px 10px;font-size:11px;" data-act="NTPantry.dropBarcodes">Entfernen</button></div>';
    }else bc.innerHTML='';
  }
  var use=document.getElementById('pantryItemUse');
  if(use)use.style.display=it&&(+it.q||0)>0?'':'none';
}
function dropBarcodes(){
  var it=_editId?byId(_editId):null;
  if(!it||!Array.isArray(it.bc))return;
  delete it.bc;touch(it);renderItemExtras(it);
  showToast('Barcodes entfernt');
}
/** @param {any} it @param {string} code */
function addBc(it,code){
  if(!code)return;
  var o=findByBc(code);
  if(o&&o!==it&&Array.isArray(o.bc)){o.bc=o.bc.filter(function(c){return c!==code;});if(!o.bc.length)delete o.bc;o.rev=nextRev();}
  if(!Array.isArray(it.bc))it.bc=[];
  if(it.bc.indexOf(code)<0)it.bc.push(code);
}
function saveItem(){
  // Gescannter Barcode, einem vorhandenen Artikel zugeordnet: nur Barcode
  // merken und die Scan-Buchung ausführen, die übrigen Felder bleiben.
  var asg=_pendingBc&&!_editId?val('pantryItemAssign'):'';
  if(asg){
    var t=byId(asg);
    if(t){
      var code=_pendingBc;_pendingBc='';
      addBc(t,code);scanDrop(code);
      var b0=pantryNeed(t.q,t.min);
      if(_scanMode==='out')take(t,_pendingN||1,'verbrauch','scan');else refill(t,_pendingN||1,'scan');
      touch(t);afterChange(t,b0);
      closeOv('pantryItemOv');
      showToast('🏷️ Barcode bei „'+t.n+'“ gespeichert · '+fmtN(t.q)+' Stück');
      return;
    }
  }
  var n=val('pantryItemName').trim();
  if(!n){showToast('Bitte einen Namen angeben');return;}
  var it=_editId?byId(_editId):null;
  var dup=findByName(n);
  if(dup&&dup!==it){showToast('„'+dup.n+'“ steht schon im Vorrat'+(_pendingBc?' — oben zuordnen':''));return;}
  var isNew=!it;
  if(!it){it={id:uid('p'),n:n,q:0,ts:Date.now()};items().push(it);}
  var before=it.rev?pantryNeed(it.q,it.min):0;
  var qRaw=val('pantryItemQ').trim(),wanted=num(qRaw);
  // Die Gesamtzahl zählt nur, wenn sie hier geändert wurde — sonst gelten die
  // Mengen der einzelnen Chargen.
  var totalChanged=isNew||qRaw!==_shownQ;
  var relocChk=/** @type {HTMLInputElement} */ (document.getElementById('pantryItemRelocChk'));
  var reloc=!isNew&&!!relocChk&&relocChk.checked;
  it.n=n;
  it.ic=val('pantryItemIcon').trim()||guessIc(n);
  it.loc=val('pantryItemLoc');
  it.c=val('pantryItemCat')||guessCat(n);
  it.g=num(val('pantryItemG'));
  it.min=num(val('pantryItemMin'));
  // „Nach dem Öffnen lagern in“: gespeichert nur, was vom Vorschlag abweicht.
  var olV=val('pantryItemOl')||'-';
  if(olV===openLocSuggest(it.n,catOf(it),_offCool))delete it.ol;else it.ol=olV;
  // „Angebrochen haltbar“: gespeichert nur, was vom Richtwert abweicht oder
  // hier geändert wurde; leer = Richtwert.
  var odRaw=val('pantryItemOd').trim(),odV=Math.round(num(odRaw));
  if(!odRaw)delete it.od;
  else if(/^0+$/.test(odRaw))it.od=0;// 0 = hält angebrochen bis zum MHD
  else if(odRaw!==_odShown||+it.od>0){
    var o=openLoc(it),rw=pantryOpenDays({n:it.n,c:catOf(it)},o?pantryPlace(loc(o)):placeOf(it));
    if(odV>0&&odV!==rw)it.od=odV;else delete it.od;
  }
  var auto=/** @type {HTMLInputElement} */ (document.getElementById('pantryItemAuto'));
  if(auto&&auto.checked)it.auto=1;
  else if(auto){delete it.auto;delete it.rsNo;}
  var lots=stockLots(it).map(function(lot){return Object.assign({},lot);}),newRows=[],fixes=[];
  /** @type {any} */
  var firstNew=null;
  function field(row,cls){var el=/** @type {HTMLInputElement} */ (row.querySelector(cls));return el?el.value:'';}
  document.querySelectorAll('#pantryCharges .pantry-charge').forEach(function(row){
    var d=field(row,'.pantry-charge-mhd'),v=field(row,'.pantry-charge-vd'),lotId=row.getAttribute('data-lot-id');
    // Unverändertes „ca.“-Datum einer neuen Packung: geschätzt, nicht von der Packung.
    var mi=row.querySelector('.pantry-charge-mhd');
    if(!lotId&&mi&&d&&d===mi.getAttribute('data-est'))d='';
    if(row.hasAttribute('data-new-first')){firstNew={mhd:d,vd:v,op:field(row,'.pantry-charge-op')};return;}
    var existing=lotId?lots.find(function(lot){return lot.id===lotId;}):null;
    if(existing){
      // Ein hier eingetragenes Datum ist echt; geschätzt bleibt nur, was unverändert ist.
      if((existing.mhd||'')!==d||(existing.vd||'')!==v)Object.assign(existing,{mhd:d,vd:v,estimated:false});
      var op=field(row,'.pantry-charge-op');
      if((existing.op||'')!==op){if(op)existing.op=op;else delete existing.op;}
      var qv=field(row,'.pantry-charge-q').trim();
      if(qv&&qv!==fmtN(existing.q)){
        var nq=parseFloat(qv.replace(',','.'));
        if(isFinite(nq)&&nq>=0)fixes.push({lot:existing,d:roundQty(nq-existing.q)});
      }
    }else if(!lotId)newRows.push({q:num(field(row,'.pantry-charge-qty')),mhd:d,vd:v,op:field(row,'.pantry-charge-op')});
  });
  // D4: neuer Lagerort → nur geschätzte Daten neu (Richtwert ab heute), echte bleiben.
  var reN=0;
  if(reloc){
    var s=pantryShelf(it.n,catOf(it),placeOf(it));
    if(s){var r=pantryReestimate(lots,s.days,today());lots=r.lots;reN=r.n;}
  }
  writeLots(it,lots);
  fixes.forEach(function(f){
    if(f.d<0)take(it,-f.d,'korrektur','hand',f.lot.id);
    else if(f.d>0)bumpLot(it,f.lot,f.d);
  });
  if(firstNew){
    // Ohne Bestand: erste Zeile = Gesamtzahl minus die weiteren Zeilen (qtySync).
    var rest=roundQty(wanted-newRows.reduce(function(n,r){return n+r.q;},0));
    if(rest>0)refill(it,rest,isNew&&_pendingBc?'scan':'hand',firstNew.mhd,firstNew.vd,'',firstNew.op);
  }else if(totalChanged){
    var cur=+it.q||0;
    if(wanted>cur)refill(it,wanted-cur,isNew&&_pendingBc?'scan':'hand',firstNew?firstNew.mhd:'',firstNew?firstNew.vd:'');
    if(wanted<cur&&!isNew)take(it,cur-wanted,'korrektur','hand');
  }
  newRows.forEach(function(lot){refill(it,lot.q,'hand',lot.mhd,lot.vd,'',lot.op);});
  if(_pendingBc&&isNew){addBc(it,_pendingBc);scanDrop(_pendingBc);_pendingBc='';}
  touch(it);
  _editId=null;
  closeOv('pantryItemOv');
  afterChange(it,before);
  showToast(reN?'Gespeichert ✓ · '+reN+' Datum neu geschätzt':'Gespeichert ✓');
}
function deleteItem(){
  if(!_editId)return;
  var it=byId(_editId);
  if(it&&!confirm('„'+it.n+'“ aus dem Vorrat löschen?'))return;
  remove(_editId);_editId=null;
  closeOv('pantryItemOv');
  showToast('Gelöscht');
}

// ════════ Barcode scannen (#335), Serienscan (Paket 4, G2) ════════
// Der Scanner bleibt offen: bekannt → ±1 und eine Zeile in der Mitschrift
// (mit ↩️), unbekannt → Open Food Facts fragen und als offene Rückfrage in die
// Liste unter dem Sucherbild, statt den Scan zu unterbrechen. „Anlegen“ dort
// öffnet den Artikel-Dialog (neu anlegen oder einem vorhandenen zuordnen).
// Derselbe Code direkt hintereinander zählt erst nach einer Pause erneut
// (pantryScanAccept). Mitschrift und Rückfragen leben nur im Speicher.
var SCAN_SHOW=8;
/** @type {Array<any>} */
var _scanLog=[];     // [{id: Verlaufs-ID, n, ic, d}] dieser Scan-Runde, neueste zuerst
/** @type {Array<any>} */
var _scanAsk=[];     // unbekannte Codes [{code,name,g,count,mode}]
/** @type {any} */
var _scanLast=null;  // {code,t} zuletzt gezählter Code
var _pendingN=1;     // Stück für die Buchung eines zugeordneten neuen Codes
/** @param {string} mode 'in' | 'out' */
function scan(mode){
  if(!window.NTPicker||!NTPicker.scanFor){showToast('Scanner nicht geladen');return;}
  _scanMode=mode==='out'?'out':'in';
  _scanLog=[];_scanLast=null;
  NTPicker.scanFor({
    title:_scanMode==='out'?'🏷️ Vorrat: verbrauchen':'🏷️ Vorrat: einbuchen',
    serial:true,known:scanKnown,unknown:scanUnknown
  });
  renderScanList();
}
/** @param {string} code */
function scanAskOf(code){for(var i=0;i<_scanAsk.length;i++)if(_scanAsk[i].code===code)return _scanAsk[i];return null;}
// Ein Treffer des Scanners (auch über „Code manuell eingeben“). Rückgabe: Meldung
// für den Scanner; '' = unbekannt (der Scanner fragt dann Open Food Facts).
/** @param {string} code */
function scanKnown(code){
  var it=findByBc(code),q=scanAskOf(code),now=Date.now();
  if(!it&&!q)return '';
  if(!pantryScanAccept(_scanLast,code,now))return '⏸ '+(it?(it.ic||'')+' '+it.n:'Derselbe Code')+' gerade gezählt — für ein weiteres Stück kurz absetzen und neu scannen';
  _scanLast={code:code,t:now};
  if(!it){q.count++;renderScanList();return '🏷️ '+(q.name||'Neuer Code')+' · '+q.count+'× — unten zuordnen';}
  var before=pantryNeed(it.q,it.min),e;
  if(_scanMode==='out'){
    if(!((+it.q||0)>0))return (it.ic||'')+' '+it.n+' ist schon leer';
    e=take(it,1,'verbrauch','scan');
  }else e=refill(it,1,'scan');
  touch(it);afterChange(it,before);
  if(e){_scanLog.unshift({id:e.id,n:it.n,ic:it.ic||'',d:e.d});renderScanList();}
  return (_scanMode==='out'?'− ':'＋ ')+(it.ic||'')+' '+it.n+' · jetzt '+fmtN(it.q);
}
/** @param {string} code @param {any} prod {name,g}|null */
function scanUnknown(code,prod){
  _scanLast={code:code,t:Date.now()};
  var q=scanAskOf(code);
  if(q)q.count++;
  else _scanAsk.unshift({code:code,name:prod&&prod.name?String(prod.name):'',g:prod&&+prod.g>0?+prod.g:0,place:prod?pantryOffPlace(prod.cats):'',open:prod?pantryOffOpen(prod.keep):null,count:1,mode:_scanMode});
  renderScanList();
  return '🏷️ '+(prod&&prod.name?prod.name:'Unbekannter Code')+' — unten in der Liste zuordnen';
}
// Mitschrift und Rückfragen unter dem Sucherbild (#pickerScanList im Picker).
function renderScanList(){
  var el=document.getElementById('pickerScanList');
  if(!el)return;
  var asks=_scanAsk.slice(0,SCAN_SHOW),rows=_scanLog.slice(0,SCAN_SHOW);
  if(!asks.length&&!rows.length){el.innerHTML='<div class="pantry-scan-note">Jeder erkannte Code bucht '+(_scanMode==='out'?'−1':'＋1')+'. Neue Codes sammeln sich hier zum Zuordnen.</div>';return;}
  el.innerHTML='<div class="pantry-scan">'
    +(asks.length?'<div class="lbl">Neue Codes · '+_scanAsk.length+'</div>'+asks.map(function(a){
      return '<div class="pantry-scan-row"><span><b>'+esc(a.name||'Unbekannter Artikel')+'</b><small>'+esc(a.code)+(a.count>1?' · '+a.count+'×':'')+(a.mode==='out'?' · verbrauchen':'')+'</small></span>'
        +'<button type="button" class="seb" data-act="NTPantry.scanResolve" data-args="'+args([a.code])+'">Zuordnen</button>'
        +'<button type="button" class="seb pantry-scan-x" data-act="NTPantry.scanDrop" data-args="'+args([a.code])+'" aria-label="Code verwerfen">✕</button></div>';
    }).join(''):'')
    +(rows.length?'<div class="lbl">Gebucht</div>'+rows.map(function(r){
      var e=logById(r.id),gone=!e||e.u;
      return '<div class="pantry-scan-row'+(gone?' is-undone':'')+'"><span><b>'+esc((r.ic||'🥫')+' '+r.n)+' '+(r.d>0?'＋':'−')+fmtN(Math.abs(r.d))+'</b>'+(gone?'<small>rückgängig</small>':'')+'</span>'
        +(gone?'':'<button type="button" class="seb" data-act="NTPantry.scanUndo" data-args="'+args([r.id])+'">↩️ Rückgängig</button>')+'</div>';
    }).join(''):'')
    +'</div>';
}
/** @param {string} id */
function scanUndo(id){undo(id);renderScanList();}
/** @param {string} code */
function scanDrop(code){_scanAsk=_scanAsk.filter(function(a){return a.code!==code;});renderScanList();}
// Rückfrage beantworten: Scanner zu, Artikel-Dialog wie bisher (neu anlegen
// oder einem vorhandenen zuordnen), gebucht wird die gezählte Stückzahl.
/** @param {string} code */
function scanResolve(code){
  var a=scanAskOf(code);if(!a)return;
  if(window.NTPicker&&NTPicker.closePicker)NTPicker.closePicker();
  _scanMode=a.mode==='out'?'out':'in';
  openItem('');
  _pendingBc=code;_pendingN=a.count||1;_offPlace=a.place||'';
  // Lagerhinweis der Packung: Frist und „gekühlt“ nach dem Öffnen (pantryOffOpen).
  if(a.open){_offCool=!!a.open.cool;if(a.open.days)setVal('pantryItemOd',String(a.open.days));}
  setVal('pantryItemName',a.name||'');
  if(a.g)setVal('pantryItemG',String(a.g));
  setVal('pantryItemQ',_scanMode==='out'?'0':String(_pendingN));
  var t=document.getElementById('pantryItemTitle');
  if(t)t.textContent='🏷️ Neuer Barcode';
  renderItemExtras(null);
  formChanged();
  if(!a.name)showToast('Barcode nicht in Open Food Facts — bitte Namen eintragen');
}

// ════════ Verlauf (#336) ════════
var KIND={kauf:'＋ Gekauft',verbrauch:'🍽️ Verbraucht',verderb:'🗑️ Weggeworfen',kochen:'👨‍🍳 Gekocht',korrektur:'✏️ Korrigiert'};
var SRC={hand:'',zettel:'vom Einkaufszettel',scan:'per Scan',foto:'vom Foto',bon:'vom Kassenbon',inventur:'bei der Inventur',Mahlzeit:'aus dem Tagebuch'};
var _reportOpen=false;// Auswertung im Verlauf aufgeklappt (nur in dieser Sitzung)
function openLog(){leaveMore();trimLog();openOv('pantryLogOv');renderLog();}
// ⋯ Mehr → 📊 Auswertung (H1): derselbe Verlauf, die Auswertung oben aufgeklappt.
function openReport(){_reportOpen=true;openLog();var b=document.querySelector('#pantryLogOv .mbd');if(b)b.scrollTop=0;}
function monthKey(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);}
var MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
/** @param {string} m JJJJ-MM */
function monthName(m){var p=String(m).split('-');return MONTHS[(+p[1]||1)-1]+' '+p[0];}
function topText(list,unit){
  return list.slice(0,3).map(function(x){return (x.ic?x.ic+' ':'')+x.n+(unit?' ('+fmtN(x.q)+')':(x.count>1?' ('+x.count+'×)':''));}).join(', ');
}
// Wie oft ein Artikel im ganzen Verlauf weggeworfen wurde (für den Vorschlag).
/** @param {string} n */
function wasteOf(n){
  var k=pantryKey(n),c=0,q=0;
  logArr().forEach(function(e){if(e&&e.k==='verderb'&&!e.u&&(+e.d||0)<0&&pantryKey(e.n)===k){c++;q+=-e.d;}});
  return {count:c,q:roundQty(q)};
}
var TIP={auto:'„Immer nachkaufen“ ausschalten — kommt von selbst und verfällt dann',smaller:'kleinere Menge kaufen — meist verfällt nur ein Teil',
  freeze:'rechtzeitig einfrieren',rarer:'seltener kaufen'};
// Vorschlag zu einem weggeworfenen Artikel aus den Daten (pantryWasteTip), '' = keiner.
/** @param {any} x {n,pid} */
function wasteTip(x){
  var it=(x.pid&&byId(x.pid))||findByName(x.n),w=wasteOf(x.n);
  var autoBuys=it?logArr().filter(function(e){return e.pid===it.id&&e.k==='kauf'&&!e.u&&e.src==='zettel';}).length:0;
  var sk=pantryShelfKind(x.n,it?catOf(it):guessCat(x.n));
  var canFreeze=!!(sk&&sk.t>0&&sk.h!=='t'&&!(it&&placeOf(it)==='t'));
  var k=pantryWasteTip(w,{auto:!!(it&&it.auto),autoBuys:autoBuys,usual:it?pantryUsualBuy(logArr(),it.id,+it.g||0):1,canFreeze:canFreeze});
  return k?TIP[k]:'';
}
// Auswertung „Vorrat im Monat“ (H1) als Abschnitt im Verlauf.
function reportHtml(){
  var r=pantryReport(logArr(),{now:Date.now(),from:logFrom()});
  if(!r.months.length)return '<div class="pantry-charge-note">Noch keine Buchungen — die Auswertung füllt sich mit dem Verlauf.</div>';
  var html='<div class="pantry-charge-note">Daten seit '+fmtD(r.since)+' (der Verlauf reicht 90 Tage). Gezählt in Packungen: 🍽️ verbraucht und gekocht, 🗑️ weggeworfen — Inventur, Korrekturen und Rückgängiges nicht. Monate, denen mehr als eine Woche fehlt, stehen nicht hier.</div>';
  r.months.forEach(function(m,i){
    var prev=r.months[i+1];
    html+='<div class="pantry-month">'
      +'<div class="pantry-month-head"><b>'+esc(monthName(m.m))+'</b><small>'+(m.running?'bis heute':(m.partFrom?'ab '+fmtD(m.partFrom):'ganzer Monat'))+'</small></div>'
      +(m.share!==null?'<div class="pantry-bar" role="img" aria-label="'+m.share+' Prozent weggeworfen"><span style="width:'+Math.max(m.share,m.share?3:0)+'%;"></span></div>':'')
      +'<div>🗑️ Weggeworfen: <b>'+fmtN(m.waste.q)+(m.waste.q===1?' Packung':' Packungen')+'</b>'+(m.waste.g?' (≈ '+fmtN(m.waste.g>=1000?Math.round(m.waste.g/100)/10:m.waste.g)+(m.waste.g>=1000?' kg':' g')+')':'')
        +(m.waste.top.length?' · meist '+esc(topText(m.waste.top,false)):'')+'</div>'
      +'<div>🍽️ Verbraucht: <b>'+fmtN(m.used.q)+(m.used.q===1?' Packung':' Packungen')+'</b>'+(m.used.top.length?' · meist '+esc(topText(m.used.top,true)):'')+'</div>'
      +(m.share!==null?'<div>Anteil weggeworfen: <b>'+m.share+' %</b></div>':'')
      +(prev?'<small>Vormonat ('+esc(MONTHS[(+prev.m.split('-')[1])-1])+'): '+fmtN(prev.waste.q)+' weggeworfen, '+fmtN(prev.used.q)+' verbraucht'+(prev.share!==null?' · '+prev.share+' %':'')+'</small>':'')
      +'</div>';
  });
  if(r.often.length){
    html+='<div class="lbl" style="margin-top:10px;">Läuft oft ab</div>'+r.often.slice(0,6).map(function(x){
      var t=wasteTip(x);
      return '<div class="pantry-often"><b>'+esc((x.ic||'🥫')+' '+x.n)+'</b> · '+x.count+'× weggeworfen ('+fmtN(x.q)+' Stück)'+(t?'<small>Vorschlag: '+esc(t)+'</small>':'')+'</div>';
    }).join('');
  }
  return html;
}
/** @param {boolean} on */
function reportToggle(on){_reportOpen=!!on;}
function renderLog(){
  var el=document.getElementById('pantryLogList'),ws=document.getElementById('pantryWaste');
  if(!el)return;
  var a=logArr();
  if(ws){
    var w=pantryWaste(a,monthKey(new Date()));
    ws.innerHTML=(w.n
      ?'<div style="font-size:12px;line-height:1.5;background:var(--gl);border:1px solid var(--br);border-radius:10px;padding:8px 10px;margin-bottom:8px;">🗑️ Diesen Monat weggeworfen: <b>'+fmtN(w.q)+' Stück</b> ('+w.n+'×)'
        +' · meist '+w.top.slice(0,3).map(function(x){return esc((x.ic||'')+' '+x.n)+(x.count>1?' ('+x.count+'×)':'');}).join(', ')+'</div>'
      :'<div style="font-size:12px;color:var(--mu);margin-bottom:8px;">Diesen Monat nichts weggeworfen ✓</div>')
      +'<details class="pantry-report" id="pantryReport"'+(_reportOpen?' open':'')+' ontoggle="NTPantry.reportToggle(this.open)"><summary>📊 Auswertung: Vorrat im Monat</summary>'+reportHtml()+'</details>';
  }
  if(!a.length){el.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">Noch keine Buchungen.</div>';return;}
  var html='',day='';
  a.forEach(function(e){
    var d=new Date(+e.t||0),ds=('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.';
    if(ds!==day){day=ds;html+='<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:12px 2px 2px;">'+ds+'</div>';}
    html+=logRow(e,false);
  });
  el.innerHTML=html;
}
// Eine Buchung; `withDay` zeigt das Datum mit (im Artikel-Dialog ohne Tages-Überschriften).
/** @param {any} e @param {boolean} withDay */
function logRow(e,withDay){
  var d=new Date(+e.t||0);
  var src=SRC[e.src]!==undefined?SRC[e.src]:e.src;
  var when=(withDay?('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'. ':'')+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  return '<div style="display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid var(--br);'+(e.u?'opacity:.5;':'')+'">'
    +'<div style="font-size:18px;flex-shrink:0;">'+esc(e.ic||'🥫')+'</div>'
    +'<div style="flex:1;min-width:0;">'
      +'<div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+(e.u?'text-decoration:line-through;':'')+'">'+esc(e.n)+' '+(e.d>0?'+':'−')+fmtN(Math.abs(e.d))+'</div>'
      +'<div style="font-size:12px;color:var(--mu);">'+when+' · '+esc(KIND[e.k]||e.k)+(src?' '+esc(src):'')+(e.en?' · „'+esc(e.en)+'“':'')+(e.u?' · rückgängig':'')+'</div>'
    +'</div>'
    +(e.u?'':'<button type="button" class="seb" style="width:auto;margin:0;padding:6px 10px;font-size:12px;" data-act="NTPantry.undo" data-args="'+args([e.id])+'" aria-label="Buchung rückgängig machen">↩️</button>')
    +'</div>';
}
// Bestand um die Buchung `e` zurück, Eintrag als rückgängig markiert (ohne Speichern).
function reverse(e,it){
  if(e.d>0){
    if(Array.isArray(e.lots))e.lots.forEach(function(lot){debit(it,lot.q,lot.id);});
    else debit(it,e.d);
  }else if(Array.isArray(e.lots))appendLots(it,e.lots);
  else appendLots(it,[{id:uid('charge'),q:-e.d,mhd:it.mhd||'',vd:it.vd||''}]);
  e.u=1;e.rev=nextRev();
}
// Gegenbuchung: Bestand um die Buchung zurück, Eintrag als rückgängig markiert.
/** @param {string} id */
function undo(id){
  var e=logById(id);
  if(!e||e.u)return;
  var it=byId(e.pid);
  if(!it){showToast('„'+e.n+'“ steht nicht mehr im Vorrat');return;}
  var before=pantryNeed(it.q,it.min);
  reverse(e,it);
  touch(it);afterChange(it,before);
  renderLog();
  if(isOpen('pantryItemOv')&&_editId===it.id)refreshItem(it);
  showToast('↩️ '+(it.ic||'')+' '+it.n+' · jetzt '+fmtN(it.q));
}

// ════════ Ablauf-Erinnerung (#337) ════════
// Einmal am Tag, beim ersten Blick ab REMIND_HOUR Uhr, wenn etwas abgelaufen
// ist oder in EXP_DAYS Tagen abläuft. Ohne Server-Push: nur bei offener App
// (bewusst so entschieden, die App ist mehrmals täglich offen).
function remindOn(){return !S.pantryRemindOff;}
/** @param {boolean} on */
function setRemind(on){
  S.pantryRemindOff=!on;saveS();
  if(on&&'Notification' in window&&Notification.permission==='default'){
    Notification.requestPermission().then(function(p){if(p==='granted')checkRemind();else showToast(NTRemind.hint()||'Meldungen nicht erlaubt');});
    return;
  }
  var h=on&&window.NTRemind?NTRemind.hint():'';
  showToast(on?(h||'🥫 Ablauf-Erinnerung an'):'Ablauf-Erinnerung aus');
  if(on)checkRemind();
}
function checkRemind(){
  if(S.pantryRemindOff||!window.NTRemind)return;
  if(new Date().getHours()<REMIND_HOUR)return;
  var d=today();
  if(S.pantryRemindDay===d)return;
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  var ex=expiring();
  // C4: eine Meldung für beides — Ablaufendes und was der tägliche Nachkauf-Lauf
  // heute auf den Zettel gesetzt hat.
  var news=S.pantryRestockNews&&S.pantryRestockNews.d===d&&Array.isArray(S.pantryRestockNews.n)?S.pantryRestockNews.n:[];
  if(!ex.length&&!news.length)return;
  S.pantryRemindDay=d;saveS();
  var names=ex.slice(0,4).map(function(x){return (x.it.ic||'')+' '+x.it.n+' ('+(x.e.days<0?'abgelaufen':(x.e.days===0?'heute':(x.e.days===1?'morgen':fmtD(x.e.d))))+')';});
  var title=[];
  if(ex.length)title.push(ex.length+' Artikel '+(ex.length===1?'läuft':'laufen')+' bald ab');
  if(news.length)title.push(news.length+' auf dem Einkaufszettel');
  var body=[];
  if(names.length)body.push(names.join(', ')+(ex.length>4?' …':''));
  if(news.length)body.push('Nachkaufen: '+news.slice(0,4).join(', ')+(news.length>4?' …':''));
  NTRemind.notify('🥫 '+title.join(' · '),{body:body.join('\n'),tag:'nt-pantry-exp'});
}
// Einmal am Tag: erst nachkaufen, dann die eine Meldung (sie nennt beides).
function daily(){restockDaily();checkRemind();monthCheck();}

// Einkaufszettel: nur, was der Vorrat nicht deckt (#334).
/** @param {Array<any>} ings */
function shortfall(ings){return pantryShortfall(ings,items());}

// ════════ Lagerorte ════════
function openLocs(){leaveMore();openOv('pantryLocsOv');renderLocs();}
function renderLocs(){
  var el=document.getElementById('pantryLocsList');
  if(!el)return;
  var own=sortedLocs(),counts={};
  items().forEach(function(it){counts[it.loc||'']=(counts[it.loc||'']||0)+1;});
  el.innerHTML=own.length?own.map(function(l,i){
    return '<div class="shopcat-row" data-lid="'+esc(l.id)+'">'
      +'<input type="text" class="shopcat-ic" value="'+esc(l.ic||'📦')+'" maxlength="4" aria-label="Symbol" onchange="NTPantry.locSave(\''+esc(l.id)+'\')">'
      +'<input type="text" class="shopcat-nm" value="'+esc(l.label||'')+'" maxlength="40" aria-label="Name" onchange="NTPantry.locSave(\''+esc(l.id)+'\')">'
      +'<button type="button" class="shopcat-mv" data-act="NTPantry.locMove" data-args="'+args([l.id,-1])+'"'+(i===0?' disabled':'')+'>▲</button>'
      +'<button type="button" class="shopcat-mv" data-act="NTPantry.locMove" data-args="'+args([l.id,1])+'"'+(i===own.length-1?' disabled':'')+'>▼</button>'
      +'<button type="button" class="shopcat-del" data-act="NTPantry.locDelete" data-args="'+args([l.id])+'" title="Löschen">🗑</button>'
      +'</div>'+(counts[l.id]?'<div class="shopcat-note">'+counts[l.id]+' Artikel</div>':'');
  }).join(''):'<div style="font-size:12px;color:var(--mu);font-style:italic;padding:8px 2px;">Noch kein Lagerort. Lege unten einen an.</div>';
}
function locAdd(){
  var label=val('pantryLocNewNm').trim();
  if(!label){showToast('Bitte einen Namen eingeben');return;}
  if(locs().some(function(l){return pantryKey(l.label)===pantryKey(label);})){showToast('„'+label+'“ gibt es schon');return;}
  var pos=locs().reduce(function(m,l){return Math.max(m,l.pos||0);},0)+1;
  locs().push({id:uid('u'),ic:val('pantryLocNewIc').trim()||'📦',label:label,pos:pos,rev:nextRev()});
  setVal('pantryLocNewNm','');setVal('pantryLocNewIc','');
  saveS();Sync.schedule();render();
  showToast('Lagerort angelegt ✓');
}
function locSave(id){
  var l=loc(id);if(!l)return;
  var wrap=document.querySelector('.shopcat-row[data-lid="'+id+'"]');if(!wrap)return;
  var ic=/** @type {HTMLInputElement} */ (wrap.querySelector('.shopcat-ic')),nm=/** @type {HTMLInputElement} */ (wrap.querySelector('.shopcat-nm'));
  var label=((nm&&nm.value)||'').trim();
  if(!label){showToast('Name darf nicht leer sein');renderLocs();return;}
  l.label=label;l.ic=((ic&&ic.value)||'').trim()||'📦';l.rev=nextRev();
  saveS();Sync.schedule();render();
}
function locMove(id,dir){
  var own=sortedLocs(),i=-1;
  own.forEach(function(l,k){if(l.id===id)i=k;});
  var j=i+dir;
  if(i<0||j<0||j>=own.length)return;
  own.splice(j,0,own.splice(i,1)[0]);
  own.forEach(function(l,k){l.pos=k+1;l.rev=nextRev();});
  saveS();Sync.schedule();render();
}
function locDelete(id){
  var l=loc(id);if(!l)return;
  var hit=items().filter(function(it){return it.loc===id;});
  if(!confirm('Lagerort „'+l.label+'“ löschen?'+(hit.length?'\n\n'+hit.length+' Artikel stehen dann ohne Lagerort — gelöscht wird keiner.':'')))return;
  hit.forEach(function(it){it.loc='';it.rev=nextRev();});
  S.pantryLocs=locs().filter(function(x){return x.id!==id;});
  tomb()[LOC_PREFIX+id]={rev:nextRev()};
  if(_filter===id)_filter='';
  saveS();Sync.schedule();render();
}

// ════════ Fotos auswerten (#326), Kassenbon (Paket 4, G1) ════════
// Ein Dialog, zwei Arten: 'shelf' = Kühlschrank/Schrank fotografieren, 'bon' =
// Kassenbon → mehrere gekaufte Artikel auf einmal. Beide übernehmen erst nach
// Bestätigung; Fotos und die KI-Antwort werden nicht gespeichert, Preise vom
// Bon nie gelesen (parsePantryReceipt gibt keine zurück).
var _photoMode='shelf';
var PHOTO_MODES=[['shelf','🧊 Vorrat-Foto'],['bon','🧾 Kassenbon']];
/** @param {string} [mode] 'shelf' | 'bon' */
function openPhotos(mode){
  _photos=[];_found=[];
  _photoMode=mode==='bon'?'bon':'shelf';
  photoStatus(noAiText(),true);
  renderPhotoMode();
  renderPhotos();
  openOv('pantryPhotoOv');
}
function openReceipt(){leaveMore();openPhotos('bon');}
// Ohne KI klar sagen, was geht, statt später ein leeres Ergebnis zu zeigen.
function noAiText(){
  if(typeof isOnline!=='undefined'&&!isOnline)return 'Fotos auswerten braucht Internet. Bis dahin: Artikel oben im Vorrat eintippen oder per Barcode einbuchen.';
  if(!canUseAi())return 'Für die Auswertung braucht es die KI (Mehr → 🤖 KI). Ohne KI: Artikel oben im Vorrat eintippen oder per Barcode einbuchen.';
  return '';
}
/** @param {string} mode */
function setPhotoMode(mode){
  var m=mode==='bon'?'bon':'shelf';
  if(m===_photoMode)return;
  _photoMode=m;_found=[];
  photoStatus(noAiText(),true);
  renderPhotoMode();renderPhotos();
}
function renderPhotoMode(){
  var bon=_photoMode==='bon';
  var el=document.getElementById('pantryPhotoMode');
  if(el)el.innerHTML=PHOTO_MODES.map(function(x){
    return '<button type="button" class="stab'+(_photoMode===x[0]?' act':'')+'" data-act="NTPantry.setPhotoMode" data-args="'+args([x[0]])+'" aria-pressed="'+(_photoMode===x[0])+'">'+x[1]+'</button>';
  }).join('');
  var t=document.getElementById('pantryPhotoTitle'),sub=document.getElementById('pantryPhotoSub'),note=document.getElementById('pantryPhotoNote');
  if(t)t.textContent=bon?'🧾 Kassenbon einlesen':'📷 Fotos auswerten';
  if(sub)sub.textContent=bon?'Ein Bon, notfalls in mehreren Fotos — die gekauften Artikel auf einmal einbuchen':'Kühlschrank, Tiefkühler, Vorratsschrank — bis zu 6 Fotos, aus der Kamera oder der Galerie';
  if(note)note.textContent=bon?'Die Fotos gehen nur zur Auswertung an die KI und werden nicht gespeichert. Preise, Pfand, Rabatte und Summen werden nicht übernommen. Eingebucht wird erst, was du bestätigst; passende Artikel auf dem Einkaufszettel werden abgehakt.'
    :'Die Fotos gehen nur zur Auswertung an die KI und werden nicht gespeichert. Übernommen wird erst, was du bestätigst.';
}
function photoStatus(t,err){
  var el=document.getElementById('pantryPhotoStatus');
  if(!el)return;
  el.textContent=t||'';
  el.style.color=err?'var(--re)':'var(--mu)';
  el.style.display=t?'':'none';
}
function pickPhotos(){var f=document.getElementById('pantryPhotoFile');if(f)f.click();}
// Eigenes Feld mit capture: Android bietet bei `multiple` oft nur die Galerie an.
function takePhoto(){var f=document.getElementById('pantryCamFile');if(f)f.click();}
// Fotos verkleinert im Speicher halten (lange Kante 1280 px, JPEG): der Worker
// nimmt höchstens 4 MB je Anfrage, sechs Fotos passen so sicher hinein.
function photosChosen(input){
  var files=Array.prototype.slice.call((input&&input.files)||[]);
  if(input)input.value='';
  var room=MAX_PHOTOS-_photos.length;
  if(files.length>room)showToast('Höchstens '+MAX_PHOTOS+' Fotos auf einmal');
  files.slice(0,Math.max(0,room)).forEach(function(file){
    var r=new FileReader();
    r.onload=function(e){
      var img=new Image();
      img.onload=function(){
        var s=Math.min(1,1280/Math.max(img.width,img.height));
        var c=document.createElement('canvas');
        c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
        var ctx=c.getContext('2d');if(!ctx)return;
        ctx.drawImage(img,0,0,c.width,c.height);
        _photos.push(c.toDataURL('image/jpeg',0.75).split(',')[1]);
        renderPhotos();
      };
      img.onerror=function(){showToast('Foto konnte nicht geladen werden');};
      img.src=/** @type {string} */ (e.target.result);
    };
    r.readAsDataURL(file);
  });
}
function dropPhoto(i){_photos.splice(i,1);renderPhotos();}
function tile(act,ic,label){
  return '<button type="button" data-act="NTPantry.'+act+'" style="width:72px;height:72px;border-radius:10px;border:1.5px dashed var(--g3);background:var(--gl);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-family:inherit;color:var(--tx);">'
    +'<span style="font-size:22px;line-height:1;">'+ic+'</span><span style="font-size:12px;font-weight:700;hyphens:manual;-webkit-hyphens:manual;">'+label+'</span></button>';
}
function renderPhotos(){
  var el=document.getElementById('pantryPhotoThumbs');
  if(el){
    el.innerHTML=_photos.map(function(b,i){
      return '<div style="position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid var(--br);">'
        +'<img src="data:image/jpeg;base64,'+b+'" alt="" style="width:100%;height:100%;object-fit:cover;">'
        +'<button type="button" data-act="NTPantry.dropPhoto" data-args="'+args([i])+'" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;">✕</button>'
        +'</div>';
    }).join('')
    +(_photos.length<MAX_PHOTOS?tile('takePhoto','📷','Kamera')+tile('pickPhotos','🖼️','Galerie'):'');
  }
  var btn=/** @type {HTMLButtonElement} */ (document.getElementById('pantryPhotoBtn'));
  if(btn){btn.disabled=!_photos.length;btn.textContent=_photos.length?('🤖 '+_photos.length+' Foto'+(_photos.length===1?'':'s')+' auswerten'):'🤖 Auswerten';}
  renderFound();
}
function photoPrompt(){
  return 'Auf den Fotos sind Kühlschrank, Tiefkühler oder Vorratsschrank eines Haushalts in Deutschland.\n'
    +'Liste alle erkennbaren Lebensmittel über ALLE Fotos zusammen (jedes nur einmal) und gib AUSSCHLIESSLICH dieses JSON zurück, ohne Fließtext und ohne Markdown:\n'
    +'{"artikel":[{"name":"Milch","stueck":2,"g":1000,"ort":"kuehl","mhd":"2026-11-02","vd":""}]}\n'
    +'Regeln:\n'
    +'- "name": einfacher deutscher Grundname ohne Marke („Milch“, „Nudeln“, „Tomaten (Dose)“).\n'
    +'- "stueck": erkennbare Anzahl Packungen/Stück, sonst 1.\n'
    +'- "g": Gramm bzw. ml je Stück laut Packung, wenn lesbar oder üblich, sonst 0.\n'
    +'- "ort": einer von '+sortedLocs().map(function(l){return '"'+l.id+'" ('+l.label+')';}).join(', ')+' — nach dem Foto, sonst "".\n'
    +'- "mhd": Mindesthaltbarkeitsdatum („mindestens haltbar bis“) als JJJJ-MM-TT, nur wenn auf dem Foto lesbar, sonst "".\n'
    +'- "vd": Verbrauchsdatum („zu verbrauchen bis“) als JJJJ-MM-TT, nur wenn auf dem Foto lesbar, sonst "".\n'
    +'- Keine Getränke-Leergut, keine Gewürze ohne Etikett, nichts Geratenes.\n'
    +'- Nichts erkannt: {"artikel":[]}';
}
function receiptPrompt(){
  return 'Auf den Fotos ist ein Kassenbon eines Supermarkts, Discounters oder einer Drogerie in Deutschland (bei mehreren Fotos Teile desselben Bons).\n'
    +'Lies die gekauften Artikel und gib AUSSCHLIESSLICH dieses JSON zurück, ohne Fließtext und ohne Markdown:\n'
    +'{"artikel":[{"bon":"H-MILCH 1,5%","name":"H-Milch 1,5 %","stueck":2,"g":1000,"ort":"vorrat"}]}\n'
    +'Regeln:\n'
    +'- "bon": die Artikelzeile, wie sie auf dem Bon steht, OHNE Preis.\n'
    +'- "name": lesbarer deutscher Name ohne Marke, Bon-Kürzel aufgelöst („JOGH.NAT.3,8%“ → „Joghurt natur 3,8 %“, „SPAG.“ → „Spaghetti“).\n'
    +'- "stueck": Anzahl laut Bon („2 x“ oder Mengenzeile), sonst 1. Lose Ware nach Gewicht: 1.\n'
    +'- "g": Gramm bzw. Milliliter je Stück, wenn auf dem Bon steht oder für die Packung üblich (Gewichtszeile „0,612 kg“ → 612), sonst 0.\n'
    +'- "ort": einer von '+sortedLocs().map(function(l){return '"'+l.id+'" ('+l.label+')';}).join(', ')+' — wo man den Artikel üblicherweise lagert, sonst "".\n'
    +'- Weglassen: alle Preise und Beträge (nie ausgeben), Pfand und Leergut, Rabatte, Coupons, Tüten und Taschen, Summen, Zahlungs-, Steuer- und Bonuszeilen sowie Artikel ohne Bezug zum Vorrat (Zeitschriften, Blumen, Geschenkkarten). Haushaltsverbrauch wie Spülmittel oder Toilettenpapier gehört dazu.\n'
    +'- Gleiche Artikel auf mehreren Zeilen zusammenzählen. Nichts erfinden, was nicht auf dem Bon steht.\n'
    +'- Kein Kassenbon erkennbar: {"artikel":[]}';
}
// Bestätigungszeile vorbelegen: gleicher Name wie ein Vorratsartikel → dessen
// Ort, Kategorie und Packungsgröße; sonst Kategorie geraten und Ort nach Art.
/** @param {any} x {n,q,g,loc,mhd,vd,bon} */
function foundRow(x){
  var ex=findByName(x.n),bon=_photoMode==='bon';
  var c=ex?catOf(ex):guessCat(x.n);
  var l=bon?((ex&&ex.loc)||x.loc||pantryHomeLoc(x.n,c,locs())):(x.loc||(ex&&ex.loc)||'');
  var sh=bon?shopByName(x.n):null;
  return {n:x.n,q:x.q,g:x.g||(ex&&+ex.g>0?+ex.g:0),loc:l,c:c,mhd:x.mhd||'',vd:x.vd||'',bon:x.bon||'',on:true,ex:!!ex,shop:sh?sh.id:'',
    old:pantryOldDate(x.mhd||'',x.vd||'',today())};
}
var _oldAsk=false;   // Rückfrage vor dem Übernehmen: von der KI gelesene Daten liegen lange zurück
function analyzePhotos(){
  if(!_photos.length)return;
  var no=noAiText();
  if(no){photoStatus(no,true);return;}
  var btn=/** @type {HTMLButtonElement} */ (document.getElementById('pantryPhotoBtn'));
  if(btn){btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;gap:5px;align-items:center;"><span class="spin"></span>KI schaut nach…</span>';}
  photoStatus('Die KI wertet '+_photos.length+' Foto'+(_photos.length===1?'':'s')+' aus …',false);
  /** @type {Array<any>} */
  var content=_photos.map(function(b){return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b}};});
  var mode=_photoMode,bon=mode==='bon';
  content.push({type:'text',text:bon?receiptPrompt():photoPrompt()});
  callClaude('claude-sonnet-5-5',content,bon?3000:2048,function(text){
    if(_photoMode!==mode)return;// inzwischen umgeschaltet
    var ids=locs().map(function(l){return l.id;}),partial=false,list;
    if(bon){var r=parsePantryReceipt(text,ids);list=r.items;partial=r.partial;}
    else list=parsePantryPhoto(text,ids);
    _found=list.map(foundRow);_oldAsk=false;
    var n=_found.length;
    photoStatus(n?(n+(bon?' Artikel vom Bon gelesen':' Lebensmittel erkannt')+(partial?' — die Antwort war unvollständig, bitte mit dem Bon vergleichen':'')+' — prüfen, anpassen, übernehmen.')
      :(bon?'Auf dem Foto war kein Kassenbon zu lesen. Den Bon glatt und ganz aufs Bild, bei langen Bons in zwei Fotos.':'Nichts erkannt. Ein schärferes Foto hilft.'),!n||partial);
    renderPhotos();
  },function(err){
    photoStatus(window.NTPicker?NTPicker.pickerFriendlyAiError(err):('Fehler: '+err),true);
    renderPhotos();
  });
}
// Bestätigungsliste: je Zeile abwählbar, Name, Stück, Lagerort, Kategorie.
function renderFound(){
  var el=document.getElementById('pantryFound');
  if(!el)return;
  if(!_found.length){el.innerHTML='';return;}
  var bon=_photoMode==='bon';
  el.innerHTML='<div class="lbl" style="margin-top:14px;">'+(bon?'Vom Bon':'Erkannt')+'</div>'
    +_found.map(function(x,i){
      var notes=[x.bon?'Bon: '+x.bon:'',x.ex?'steht schon im Vorrat — wird dazugezählt':'',x.shop?'🛒 steht auf dem Zettel — wird abgehakt':'',
        x.vd?'Verbr. bis '+fmtD(x.vd):'',x.mhd?'MHD '+fmtD(x.mhd):'',+x.g>0?'à '+fmtN(x.g)+' g':''].filter(Boolean);
      return '<div class="pantry-found'+(x.on?'':' is-off')+'">'
        +'<label class="pantry-found-on"><input type="checkbox" '+(x.on?'checked ':'')+'onchange="NTPantry.foundSet('+i+',\'on\',this.checked)" aria-label="'+esc(x.n)+' übernehmen"></label>'
        +'<input type="text" class="sinp pantry-found-n" value="'+esc(x.n)+'" onchange="NTPantry.foundSet('+i+',\'n\',this.value)" aria-label="Name">'
        +'<label class="pantry-found-q"><input type="text" class="sinp" value="'+esc(fmtN(x.q))+'" inputmode="decimal" onchange="NTPantry.foundSet('+i+',\'q\',this.value)" aria-label="Stück"><span>Stück</span></label>'
        +'<select class="sinp pantry-found-loc" onchange="NTPantry.foundSet('+i+',\'loc\',this.value)" aria-label="Lagerort">'+locOptions(x.loc)+'</select>'
        +'<select class="sinp pantry-found-cat" onchange="NTPantry.foundSet('+i+',\'c\',this.value)" aria-label="Kategorie">'+catOptions(x.c).replace(/^<option value="">[^<]*<\/option>/,'')+'</select>'
        +(notes.length?'<small>'+esc(notes.join(' · '))+'</small>':'')
        +(x.old?'<small class="pantry-found-old">⚠️ '+esc(fmtD(x.old))+' liegt über 30 Tage zurück — vielleicht falsch gelesen. <button type="button" class="seb" data-act="NTPantry.foundClearDate" data-args="'+args([i])+'">Datum entfernen</button></small>':'')
        +'</div>';
    }).join('')
    +(_oldAsk?oldAskHtml():'<button type="button" class="svb" data-act="NTPantry.foundApply">✓ Ausgewählte '+(bon?'einbuchen':'übernehmen')+'</button>');
}
function foundSet(i,k,v){
  var x=_found[i];if(!x)return;
  if(k==='on'){x.on=!!v;var rows=document.querySelectorAll('#pantryFound .pantry-found');if(rows[i])rows[i].classList.toggle('is-off',!x.on);}
  else if(k==='q')x.q=num(v);
  else x[k]=String(v||'').trim();
}
// Kassenbon übernehmen: je Zeile eine Einbuchung über refill (Datum geschätzt
// wie beim Einbuchen) und, steht der Artikel offen auf dem Einkaufszettel, dort
// abgehakt. NTShop.toggle ruft onBought — das bucht nicht noch einmal, weil der
// Zettel-Eintrag die Buchung schon als `stock` trägt (Ent-haken nimmt genau sie zurück).
/** @param {any} x */
function bonApply(x){
  var it=findByName(x.n),before=0;
  if(!it){
    it={id:uid('p'),n:x.n,ic:guessIc(x.n),loc:x.loc||'',c:x.c||guessCat(x.n),q:0,g:+x.g>0?+x.g:0,min:0,mhd:'',vd:'',ts:Date.now(),rev:nextRev()};
    items().push(it);
  }else{
    before=pantryNeed(it.q,it.min);
    if(+x.g>0&&!(+it.g>0))it.g=+x.g;
    if(x.loc)it.loc=x.loc;
    if(x.c)it.c=x.c;
  }
  var e=refill(it,x.q||1,'bon');
  touch(it);afterChange(it,before);
  var s=e?shopByName(it.n):null;
  if(s&&!s.stock&&window.NTShop){s.stock={pid:it.id,n:e.d,log:e.id,lot:e.lots[0].id};NTShop.toggle(s.id);return 2;}
  return e?1:0;
}
// Ausgewählte Zeilen mit verdächtig altem Datum (siehe pantryOldDate).
function oldOnes(){return _found.filter(function(x){return x.on&&x.n&&x.old;});}
function oldAskHtml(){
  var a=oldOnes();
  return '<div class="pantry-old-ask"><b>'+a.length+(a.length===1?' Datum liegt':' Daten liegen')+' über 30 Tage zurück</b>'
    +'<small>'+esc(a.map(function(x){return x.n+' ('+fmtD(x.old)+')';}).join(', '))+' — so übernommen, gelten '+(a.length===1?'es':'sie')+' sofort als abgelaufen.</small>'
    +'<button type="button" class="svb" data-act="NTPantry.foundApply" data-args=\'["clear"]\'>Ohne diese Daten übernehmen</button>'
    +'<button type="button" class="seb" data-act="NTPantry.foundApply" data-args=\'["keep"]\'>So übernehmen</button>'
    +'<button type="button" class="seb" data-act="NTPantry.foundBack">Zurück zur Liste</button></div>';
}
/** @param {number} i */
function foundClearDate(i){var x=_found[i];if(!x)return;x.mhd='';x.vd='';x.old='';if(!oldOnes().length)_oldAsk=false;renderFound();}
function foundBack(){_oldAsk=false;renderFound();}
// `how`: fehlt = erst fragen, wenn Daten lange zurückliegen; 'clear' = diese
// Daten weglassen (die App schätzt dann); 'keep' = so übernehmen.
/** @param {string} [how] */
function foundApply(how){
  if(!how&&oldOnes().length){_oldAsk=true;renderFound();return;}
  if(how==='clear')oldOnes().forEach(function(x){x.mhd='';x.vd='';x.old='';});
  _oldAsk=false;
  var n=0,ticked=0,bon=_photoMode==='bon';
  _found.forEach(function(x){
    if(!x.on||!x.n)return;
    if(bon){var r=bonApply(x);if(r)n++;if(r===2)ticked++;}
    else if(add(x.n,x.q||1,x.g,x.loc,'',0,{mhd:x.mhd,vd:x.vd},'foto',x.c))n++;
  });
  _found=[];_photos=[];
  closeOv('pantryPhotoOv');
  showToast(n?(n+' Artikel im Vorrat ✓'+(ticked?' · '+ticked+' auf dem Zettel abgehakt':'')):'Nichts übernommen');
}

// ════════ Inventur je Lagerort (Paket 4, G3) ════════
// Artikel für Artikel durch einen Lagerort: Soll zeigen, Ist zählen, am Ende
// EINE Bestätigung, die jede Abweichung als Korrektur bucht (Verlauf, ↩️ je
// Buchung, zählt nicht als Verbrauch — pantryUseRate liest nur verbrauch/kochen).
// Ein angefangener Durchgang steht in S.pantryStockDraft (gerätelokal, nicht im
// Sync): {loc, ids, i, ist:{id: Menge}, t}; Schließen behält ihn, nur
// „Abbrechen“ verwirft ihn — ohne Buchung.
var NO_LOC='__none';
function draft(){var d=S.pantryStockDraft;return d&&typeof d==='object'&&Array.isArray(d.ids)?d:null;}
/** @param {string} locId */
function locItems(locId){
  return pantrySort(items().filter(function(it){return locId===NO_LOC?!(it.loc&&loc(it.loc)):it.loc===locId;}),'name');
}
function locTitle(locId){var l=locId===NO_LOC?null:loc(locId);return l?l.ic+' '+l.label:'📦 Ohne Lagerort';}
function openStock(){leaveMore();openOv('pantryStockOv');renderStock();}
/** @param {string} locId */
function stockStart(locId){
  var ids=locItems(locId).map(function(it){return it.id;});
  if(!ids.length){showToast('Hier steht nichts');return;}
  S.pantryStockDraft={loc:locId,ids:ids,i:0,ist:{},t:Date.now()};saveS();
  renderStock();
}
// Aktuelle Zeile: gelöschte Artikel überspringen.
function stockCur(d){
  while(d.i<d.ids.length&&!byId(d.ids[d.i]))d.i++;
  return d.i<d.ids.length?byId(d.ids[d.i]):null;
}
function stockVal(){var v=val('pantryStockIst').trim();if(v==='')return null;var n=parseFloat(v.replace(',','.'));return isFinite(n)&&n>=0?roundQty(n):null;}
// Eingabe sofort in den Entwurf (nichts geht verloren, wenn der Dialog zugeht).
function stockInput(){
  var d=draft(),it=d?stockCur(d):null,v=stockVal();
  if(!it||v===null)return;
  d.ist[it.id]=v;saveS();
}
/** @param {number} delta */
function stockStep(delta){
  var d=draft(),it=d?stockCur(d):null;if(!it)return;
  var v=stockVal();if(v===null)v=roundQty(+it.q||0);
  v=Math.max(0,roundQty(v+delta));
  setVal('pantryStockIst',fmtN(v));
  d.ist[it.id]=v;saveS();
}
/** @param {string} how 'ok' (stimmt) | 'gone' (ist weg) | 'next' (wie eingetragen) */
function stockSet(how){
  var d=draft(),it=d?stockCur(d):null;if(!it)return;
  var v=how==='ok'?roundQty(+it.q||0):(how==='gone'?0:stockVal());
  if(v===null)v=roundQty(+it.q||0);
  d.ist[it.id]=v;d.i++;saveS();
  renderStock();
}
function stockBack(){var d=draft();if(!d)return;d.i=Math.max(0,Math.min(d.i,d.ids.length)-1);while(d.i>0&&!byId(d.ids[d.i]))d.i--;saveS();renderStock();}
function stockCancel(){
  if(!draft()){closeOv('pantryStockOv');return;}
  delete S.pantryStockDraft;saveS();
  renderStock();
  showToast('Inventur abgebrochen — nichts gebucht');
}
function stockBook(){
  var d=draft();if(!d)return;
  var diff=pantryInventoryDiff(d.ids.map(byId).filter(Boolean),d.ist),n=0;
  diff.forEach(function(x){
    var it=byId(x.id);if(!it)return;
    var before=pantryNeed(it.q,it.min),cur=roundQty(+it.q||0),dd=roundQty(x.ist-cur);
    var e=dd<0?take(it,-dd,'korrektur','inventur'):(dd>0?refill(it,dd,'inventur','','','korrektur'):null);
    if(!e)return;
    it.rev=nextRev();n++;
    afterChange(it,before);
  });
  delete S.pantryStockDraft;
  saveS();if(n)Sync.schedule();render();
  closeOv('pantryStockOv');
  showToast(n?'Inventur gebucht: '+n+(n===1?' Korrektur':' Korrekturen')+' · ↩️ im Verlauf':'Inventur fertig — alles stimmt ✓');
}
function renderStock(){
  var el=document.getElementById('pantryStockBody'),sub=document.getElementById('pantryStockSub');
  if(!el)return;
  var d=draft();
  if(d&&!d.ids.some(byId)){delete S.pantryStockDraft;d=null;}
  if(!d){
    if(sub)sub.textContent='Lagerort wählen, dann Artikel für Artikel nachzählen';
    var opts=sortedLocs().map(function(l){return {id:l.id,t:l.ic+' '+l.label,n:locItems(l.id).length};});
    var none=locItems(NO_LOC).length;
    if(none)opts.push({id:NO_LOC,t:'📦 Ohne Lagerort',n:none});
    el.innerHTML='<div class="pantry-charge-note" style="margin-bottom:8px;">Gebucht wird erst am Ende, nach einer Zusammenfassung. Abweichungen gehen als „✏️ Korrigiert“ in den Verlauf und zählen nicht als Verbrauch.</div>'
      +opts.map(function(o){
        return '<button type="button" class="pantry-soon" data-act="NTPantry.stockStart" data-args="'+args([o.id])+'"'+(o.n?'':' disabled')+'>'
          +'<span aria-hidden="true">📋</span><span>'+esc(o.t)+' · '+o.n+' Artikel</span><span aria-hidden="true">›</span></button>';
      }).join('');
    return;
  }
  var it=stockCur(d),total=d.ids.length;
  if(it){
    var counted=Object.prototype.hasOwnProperty.call(d.ist,it.id),ist=counted?d.ist[it.id]:roundQty(+it.q||0),e=(+it.q||0)>0?expiry(it):null;
    if(sub)sub.textContent=locTitle(d.loc)+' · '+(d.i+1)+' von '+total;
    el.innerHTML='<div class="pantry-stock-item">'
      +'<div class="pantry-stock-name">'+esc((it.ic||'🥫')+' '+it.n)+'</div>'
      +'<div class="pantry-charge-note">Laut Vorrat: <b>'+esc(amountText(it))+'</b>'+(e?' · '+esc(expiryText(e)):'')+'</div>'
      +'<label class="lbl" for="pantryStockIst">Wirklich da (Stück)</label>'
      +'<div class="pantry-stock-count">'
        +'<button type="button" class="pt-st" data-act="NTPantry.stockStep" data-args="[-1]" aria-label="Eins weniger">−</button>'
        +'<input type="text" class="sinp" id="pantryStockIst" inputmode="decimal" value="'+esc(fmtN(ist))+'" oninput="NTPantry.stockInput()">'
        +'<button type="button" class="pt-st" data-act="NTPantry.stockStep" data-args="[1]" aria-label="Eins mehr">＋</button>'
      +'</div>'
      +'<div class="pantry-charge-acts">'
        +'<button type="button" class="seb" data-act="NTPantry.stockSet" data-args=\'["ok"]\'>✓ Stimmt</button>'
        +'<button type="button" class="seb" data-act="NTPantry.stockSet" data-args=\'["gone"]\'>Ist weg</button>'
      +'</div>'
      +'<button type="button" class="svb" data-act="NTPantry.stockSet" data-args=\'["next"]\'>Weiter ›</button>'
      +'<div class="pantry-charge-acts">'
        +(d.i>0?'<button type="button" class="seb" data-act="NTPantry.stockBack">‹ Zurück</button>':'<span></span>')
        +'<button type="button" class="seb" data-act="NTPantry.stockCancel">Abbrechen</button>'
      +'</div></div>';
    return;
  }
  var diff=pantryInventoryDiff(d.ids.map(byId).filter(Boolean),d.ist);
  if(sub)sub.textContent=locTitle(d.loc)+' · fertig gezählt';
  el.innerHTML='<div class="pantry-charge-note" style="margin-bottom:6px;">'+total+' Artikel gezählt · '+(diff.length?diff.length+(diff.length===1?' Abweichung':' Abweichungen'):'keine Abweichung')+'</div>'
    +diff.map(function(x){
      return '<div class="pantry-often"><b>'+esc((x.ic||'🥫')+' '+x.n)+'</b>: '+fmtN(x.soll)+' → '+fmtN(x.ist)+' Stück <span style="color:'+(x.d<0?'var(--or)':'var(--g1)')+';font-weight:800;">('+(x.d>0?'+':'−')+fmtN(Math.abs(x.d))+')</span></div>';
    }).join('')
    +'<button type="button" class="svb" data-act="NTPantry.stockBook">'+(diff.length?'✓ '+diff.length+(diff.length===1?' Korrektur buchen':' Korrekturen buchen'):'✓ Fertig')+'</button>'
    +'<div class="pantry-charge-acts">'
      +'<button type="button" class="seb" data-act="NTPantry.stockBack">‹ Zurück</button>'
      +'<button type="button" class="seb" data-act="NTPantry.stockCancel">Abbrechen</button>'
    +'</div>';
}

// ════════ Was kann ich kochen? ════════
function cookRecs(){
  var list=[];
  try{
    (recipes||[]).forEach(function(r){
      var v=(window.NTBook&&NTBook.view)?NTBook.view(r):r;
      list.push({id:r.id,name:r.name,ings:(v.ingredients||[]).map(function(g){return bookIngShort(g)||g.name;})});
    });
  }catch(e){}
  return list;
}
var _cookFor='';     // „Rezept dazu finden“ (F3): nur Rezepte mit diesem Artikel
// `forId` = Artikel-ID: nur Rezepte, die ihn verwenden (aus „Läuft ab“).
/** @param {string} [forId] */
function openCook(forId){
  var it=typeof forId==='string'&&forId?byId(forId):null;
  _cookFor=it?it.id:'';
  var el=document.getElementById('pantryCookList');
  if(el){
    var recs=cookRecs();
    if(it)recs=recs.filter(function(r){return r.ings.some(function(n){return !!pantryFind([it],n);});});
    var sug=pantrySuggest(recs,items()).slice(0,10);
    var head=it?'<div class="pantry-cook-for"><span>Mit '+esc((it.ic||'🥫')+' '+it.n)+'</span>'
      +'<button type="button" class="seb" data-act="NTPantry.openCook">Alle zeigen</button></div>':'';
    el.innerHTML=head+(sug.length?sug.map(function(s){
      return '<div class="pantry-cook-row">'
        +'<div style="font-weight:700;font-size:14px;">'+esc(s.name)+'</div>'
        +'<div style="font-size:12px;color:var(--g1);margin-top:2px;">✓ '+s.have.length+' von '+(s.have.length+s.miss.length)+' Zutaten da</div>'
        +(s.miss.length?'<div style="font-size:12px;color:var(--mu);margin-top:1px;">Fehlt: '+esc(s.miss.slice(0,6).join(', '))+(s.miss.length>6?' …':'')+'</div>':'')
        +'<div class="pantry-charge-acts">'
          +'<button type="button" class="seb" data-act="NTPantry.openRecipe" data-args="'+args([s.id])+'">📖 Ansehen</button>'
          +'<button type="button" class="seb" data-act="NTPantry.planRecipe" data-args="'+args([s.id])+'">📅 Einplanen</button>'
        +'</div></div>';
    }).join(''):'<div style="font-size:13px;color:var(--mu);font-style:italic;padding:10px 2px;line-height:1.5;">'
      +(it?'Kein Rezept im Kochbuch verwendet „'+esc(it.n)+'“ — die KI hat unten vielleicht eine Idee.'
        :(items().length?'Kein Rezept im Kochbuch passt zu deinem Vorrat.':'Der Vorrat ist leer — trag erst ein, was du da hast.'))+'</div>');
  }
  var ai=document.getElementById('pantryAiList');if(ai)ai.innerHTML='';
  openOv('pantryCookOv');
}
function openRecipe(id){
  closeOv('pantryCookOv');
  setTimeout(function(){if(window.NTBook)NTBook.detail(id);},200);
}
// „In den Wochenplan“: das Rezept im Kochbuch mit offenem Einplanen-Feld
// (vorhandener Plan-Weg NTBook.planNow → NTPlan.planRecipe).
/** @param {string} id */
function planRecipe(id){
  closeOv('pantryCookOv');
  setTimeout(function(){if(window.NTBook){NTBook.detail(id);NTBook.togglePanel('plan');}},200);
}
function aiIdeas(){
  var have=items().filter(function(it){return (+it.q||0)>0;});
  if(!have.length){showToast('Der Vorrat ist leer');return;}
  if(typeof isOnline!=='undefined'&&!isOnline){showToast('KI-Ideen brauchen Internet');return;}
  if(!canUseAi()){showToast('KI ist nicht eingerichtet — Mehr → 🤖 KI');return;}
  var el=document.getElementById('pantryAiList');
  if(el)el.innerHTML='<div style="font-size:13px;color:var(--mu);padding:10px 2px;display:flex;gap:6px;align-items:center;"><span class="spin"></span>Die KI überlegt …</div>';
  var prefs=(S.dietPrefs||[]).join(', ');
  var focus=_cookFor?byId(_cookFor):null;
  var prompt=(focus?'Verwende unbedingt „'+focus.n+'“ — es läuft bald ab.\n':'')+'Im Haushalt ist vorrätig: '+have.map(function(it){return it.n+' ('+fmtN(it.q)+' Stück'+(+it.g>0?' à '+fmtN(it.g)+' g':'')+')';}).join(', ')+'.\n'
    +(prefs?'Ernährung: '+prefs+'.\n':'')
    +(S.pregnant&&S.pregnant!=='0'?'Die Person ist schwanger.\n':'')
    +'Schlage 5 alltagstaugliche Gerichte vor, die möglichst nur diese Zutaten (plus Salz, Pfeffer, Öl, Wasser) brauchen.\n'
    +'Gib AUSSCHLIESSLICH dieses JSON zurück, ohne Markdown:\n'
    +'{"ideen":[{"titel":"...","kurz":"ein Satz zur Zubereitung","fehlt":["Zutat, die man noch kaufen müsste"]}]}';
  callClaude('claude-haiku-5-5',[{type:'text',text:prompt}],1200,function(text){
    var s=String(text||''),a=s.indexOf('{'),b=s.lastIndexOf('}'),d=null;
    if(a>=0&&b>a){try{d=JSON.parse(s.slice(a,b+1));}catch(e){d=null;}}
    var ideas=(d&&Array.isArray(d.ideen))?d.ideen:[];
    if(!el)return;
    el.innerHTML=ideas.length?ideas.slice(0,6).map(function(x){
      var miss=Array.isArray(x.fehlt)?x.fehlt.map(String).filter(Boolean):[];
      return '<div style="padding:10px 2px;border-bottom:1px solid var(--br);">'
        +'<div style="font-weight:700;font-size:14px;">🤖 '+esc(String(x.titel||''))+'</div>'
        +(x.kurz?'<div style="font-size:12px;color:var(--tx);margin-top:2px;line-height:1.45;">'+esc(String(x.kurz))+'</div>':'')
        +(miss.length?'<div style="font-size:11px;color:var(--mu);margin-top:2px;">Fehlt: '+esc(miss.join(', '))+'</div>':'')
        +'</div>';
    }).join(''):'<div style="font-size:13px;color:var(--re);padding:10px 2px;">Keine Ideen bekommen. Bitte nochmal versuchen.</div>';
  },function(err){
    if(el)el.innerHTML='<div style="font-size:13px;color:var(--re);padding:10px 2px;">'+esc(window.NTPicker?NTPicker.pickerFriendlyAiError(err):String(err))+'</div>';
  });
}

// ── Boot ──
function boot(){
  items().forEach(function(it){if((it.rev||0)>_lastRev)_lastRev=it.rev;});
  locs().forEach(function(l){if((l.rev||0)>_lastRev)_lastRev=l.rev;});
  var t=tomb();Object.keys(t).forEach(function(id){if(t[id]&&(t[id].rev||0)>_lastRev)_lastRev=t[id].rev;});
  logArr().forEach(function(e){if((e.rev||0)>_lastRev)_lastRev=e.rev;});
  trimLog();
  render();
  Sync.run();
  // Der tägliche Nachkauf (und danach die Meldung) wartet auf den ersten Abgleich, damit er sieht, was
  // das andere Gerät schon auf den Zettel gesetzt hat.
  setTimeout(daily,5000);
  setInterval(daily,30*60000);
}
document.addEventListener('visibilitychange',function(){if(!document.hidden){Sync.run();setTimeout(daily,3000);}});

window.NTPantry={
  boot:boot,open:open,close:close,render:render,renderCard:renderCard,setFilter:setFilter,
  pickTile:pickTile,setOrder:setOrder,search:search,addQuery:addQuery,
  openLot:openLot,openNext:openNext,foundClearDate:foundClearDate,foundBack:foundBack,toggleRow:toggleRow,fold:fold,olPicked:olPicked,splitLot:splitLot,qtySync:qtySync,locPicked:locPicked,dropLot:dropLot,toShop:toShop,editFields:editFields,formChanged:formChanged,
  add:add,step:step,remove:remove,submitInput:submitInput,inputKey:inputKey,
  openItem:openItem,saveItem:saveItem,deleteItem:deleteItem,addChargeRow:addChargeRow,removeChargeRow:removeChargeRow,
  openLocs:openLocs,locAdd:locAdd,locSave:locSave,locMove:locMove,locDelete:locDelete,
  openPhotos:openPhotos,pickPhotos:pickPhotos,takePhoto:takePhoto,photosChosen:photosChosen,dropPhoto:dropPhoto,
  analyzePhotos:analyzePhotos,foundSet:foundSet,foundApply:foundApply,
  openCook:openCook,openRecipe:openRecipe,aiIdeas:aiIdeas,openExpiring:openExpiring,expiring:expiring,
  onBought:onBought,useRecipe:useRecipe,offerMeal:offerMeal,confirmMeal:confirmMeal,askAdd:askAdd,askIng:askIng,shortfall:shortfall,
  declineMeal:declineMeal,queueMeal:queueMeal,openAsk:openAsk,askPick:askPick,entryChanged:entryChanged,
  setAsk:setAsk,askUnmute:askUnmute,planScore:planScore,planRecipe:planRecipe,
  consume:consume,dropBarcodes:dropBarcodes,scan:scan,openLog:openLog,undo:undo,
  remindOn:remindOn,setRemind:setRemind,checkRemind:checkRemind,daily:daily,restockDaily:restockDaily,
  restockNow:restockNow,skipRestock:skipRestock,takeMinSug:takeMinSug,openMore:openMore,setLead:setLead,
  openReceipt:openReceipt,setPhotoMode:setPhotoMode,scanUndo:scanUndo,scanDrop:scanDrop,scanResolve:scanResolve,
  openStock:openStock,stockStart:stockStart,stockStep:stockStep,stockInput:stockInput,stockSet:stockSet,stockBack:stockBack,
  stockCancel:stockCancel,stockBook:stockBook,openReport:openReport,reportToggle:reportToggle,
  toggleHints:toggleHints,monthCheck:monthCheck,monthDismiss:monthDismiss,
  usage:function(id){var it=byId(id);return it?usage(it):null;},
  count:function(){return items().length;},list:function(){return items().slice();},lowCount:function(){return items().filter(low).length;},
  Sync:Sync
};
})();
