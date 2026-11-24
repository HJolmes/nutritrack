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
//                 keins), hd = hält ca. … Tage (MHD beim Auffüllen), bc = Barcodes,
//                 c = Kategorie des Einkaufszettels (NTShop, fehlt = geraten),
//                 lots = Chargen [{id,q,mhd,vd,estimated,in,op}]: estimated = Datum
//                 geschätzt (hd oder Richtwert pantryShelf), in = eingebucht am,
//                 op = geöffnet am (verkürzte Frist laut pantryShelf().open)
//                 auto = Dauerartikel „immer nachkaufen“ (1, fehlt = nein),
//                 rs = {s: ID auf dem Zettel, t: ms} automatisch gesetzt,
//                 rsNo = ms „diesmal nicht“/vom Zettel genommen (Sperre bis zum
//                 nächsten Einbuchen oder BLOCK_DAYS). Alle drei reisen mit dem
//                 Artikel im Sync, damit das zweite Gerät dieselbe Sperre kennt.
//   S.pantryOrder Ordnung der Liste loc|cat|exp|name|qty (gerätelokal, nicht im Sync)
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
//                 pantryUseRate rechnet bei neuer Packungsgröße um).
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
var ORDERS=[['loc','↕ Lagerort'],['cat','↕ Kategorie'],['exp','↕ Haltbarkeit'],['name','↕ Name'],['qty','↕ Menge']];
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
function openDays(it){var s=pantryShelf(it.n,catOf(it),placeOf(it));return s?s.open:0;}
function estimateDays(it){return pantryEstimateDays({n:it.n,hd:it.hd,c:catOf(it)},placeOf(it));}
function expiry(it){
  var e=pantryDue(it,stockLots(it),openDays(it),today());
  if(e&&e.k==='mhd'){
    var dated=stockLots(it).filter(function(lot){return lot.mhd===e.d;});
    return Object.assign({},e,{estimated:dated.length>0&&dated.every(function(lot){return lot.estimated;})});
  }
  return e;
}
function expiring(){return pantryExpiring(items(),today(),EXP_DAYS,expiry);}
// „MHD 02.11.26“ bzw. „Verbrauchen bis …“, abgelaufen/bald mit Hinweis.
function expiryText(e){
  if(!e)return '';
  var t=(e.k==='vd'?'Verbr. bis ':(e.k==='op'?'Geöffnet · bis ':'MHD '))+fmtD(e.d);
  if(e.estimated)t+=' · geschätzt';
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
/** @param {any} it @param {number} n @param {string} src @param {string} [mhd] @param {string} [vd] */
function refill(it,n,src,mhd,vd){
  n=roundQty(n);
  if(!(n>0))return null;
  var days=!mhd&&!vd?estimateDays(it):0;
  var lot={id:uid('charge'),q:n,mhd:mhd||(days?addDays(today(),days):''),vd:vd||'',estimated:!!days,in:today()};
  appendLots(it,[lot]);
  // Eingebucht = Nachkauf-Zyklus erledigt: Markierung und „diesmal nicht“ fallen weg.
  delete it.rs;delete it.rsNo;
  var e=log(it,n,'kauf',src);e.lots=[lot];return e;
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
  var it={id:uid('p'),n:n,ic:ic||guessIc(n),loc:locId||'',c:c||guessCat(n),q:0,g:+g>0?+g:0,min:+min>0?+min:0,mhd:'',vd:'',ts:Date.now(),rev:nextRev()};
  items().push(it);
  refill(it,+q>0?+q:0,src||'hand',mhd,vd);
  touch(it);afterChange(it,0);
  return it;
}
function step(id,d){
  var it=byId(id);if(!it)return;
  var before=pantryNeed(it.q,it.min);
  if(d>0)refill(it,d,'hand');else take(it,-d,'verbrauch','hand');
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

var mealStock=new Map(),mealPending=false;
function offerMeal(entry){
  var feature=NTFeat.byId('pantry');
  if(feature&&NTFeat.isOff(feature))return;
  var ingredients=Array.isArray(entry.ingredients)&&entry.ingredients.length?entry.ingredients:[entry];
  var portions=ingredients===entry.ingredients?(+entry.portions||1):1;
  ingredients.forEach(function(ing){
    var name=bookIngShort(ing)||ing.name,item=pantryFind(items(),name);
    if(!item&&pantryKey(name)){
      var token=' '+pantryKey(name)+' ';
      var matches=items().filter(function(it){return it.q>0&&(' '+pantryKey(it.n)+' ').includes(token);});
      if(matches.length===1)item=matches[0];
    }
    if(!item||!(item.q>0))return;
    var known=item.g>0&&ing.amount>0&&!ing.pu&&!entry.pu;
    var previous=mealStock.get(item.id);
    mealStock.set(item.id,{item:item,known:known&&(!previous||previous.known),qty:(previous?previous.qty:0)+(known?ing.amount*portions/item.g:0)});
  });
  if(!mealStock.size||mealPending)return;
  mealPending=true;
  queueMicrotask(function(){
    mealPending=false;
    var body=document.getElementById('pantryMealRows');
    body.innerHTML=Array.from(mealStock.values()).map(function(match){
      var item=match.item,qty=match.known?fmtN(Math.min(item.q,match.qty)):'';
      return '<label class="pantry-meal-row" data-pantry-id="'+esc(item.id)+'"><span><strong>'+esc(item.n)+'</strong><small>'+fmtN(item.q)+' Stück vorhanden</small></span>'
        +'<span>Abziehen (Stück)<input class="sinp" inputmode="decimal" value="'+esc(qty)+'" placeholder="0" aria-label="'+esc(item.n)+' abziehen, Stück"></span></label>';
    }).join('');
    mealStock.clear();
    openOv('pantryMealOv');
  });
}
function confirmMeal(){
  var used=[];
  document.querySelectorAll('#pantryMealRows [data-pantry-id]').forEach(function(row){
    var item=byId(row.getAttribute('data-pantry-id'));
    var qty=num(/** @type {HTMLInputElement} */ (row.querySelector('input')).value);
    if(!item||!qty)return;
    var before=pantryNeed(item.q,item.min);
    if(!take(item,qty,'verbrauch','Mahlzeit'))return;
    item.rev=nextRev();used.push(item);afterChange(item,before);
  });
  if(used.length){saveS();Sync.schedule();render();showToast('Vorrat aktualisiert ✓');}
  closeOv('pantryMealOv');
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
  if(!lo.length&&!ex.length){body.innerHTML='<div style="font-size:12px;color:var(--mu);">Alles da, was da sein soll ✓</div>';return;}
  function chip(t){return '<span style="display:inline-block;background:var(--gl);border:1px solid var(--br);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;margin:0 4px 4px 0;">'+esc(t)+'</span>';}
  function more(n){return n>6?'<span style="font-size:11px;color:var(--mu);font-weight:700;">+'+(n-6)+' weitere</span>':'';}
  var html='';
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
function order(){var o=S.pantryOrder;return ORDERS.some(function(x){return x[0]===o;})?o:'loc';}
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
function row(it,ro){
  var lw=low(it),e=(+it.q||0)>0?expiry(it):null;
  var soon=ro!==null&&ro!==undefined&&(+it.q||0)>0&&ro<=ROW_DAYS;
  return '<div style="display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid var(--br);">'
    +'<div style="font-size:20px;flex-shrink:0;">'+esc(it.ic||'🥫')+'</div>'
    +'<div style="flex:1;min-width:0;cursor:pointer;" data-act="NTPantry.openItem" data-args="'+args([it.id])+'">'
      +'<div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(it.auto?'<span title="Dauerartikel: immer nachkaufen" aria-label="Dauerartikel">🔁 </span>':'')+esc(it.n)+'</div>'
      +'<div style="font-size:11px;color:'+(lw?'var(--or)':'var(--mu)')+';margin-top:1px;">'+esc(amountText(it))
        +(+it.min>0?' · mind. '+fmtN(it.min)+(lw?' ⚠️':''):'')
        +(soon?'<span style="color:'+(ro<=lead()?'var(--or)':'var(--mu)')+';"> · '+(ro<=0?'geht heute aus':'reicht ca. '+ro+(ro===1?' Tag':' Tage'))+'</span>':'')+'</div>'
      +(e?'<div style="font-size:11px;font-weight:'+(e.lvl==='ok'?'400':'700')+';color:'+expiryColor(e)+';margin-top:1px;">'+esc(expiryText(e))+'</div>':'')
    +'</div>'
    +'<button type="button" class="pt-st" data-act="NTPantry.step" data-args="'+args([it.id,-1])+'">−</button>'
    +'<button type="button" class="pt-st" data-act="NTPantry.step" data-args="'+args([it.id,1])+'">＋</button>'
    +'</div>';
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
// Ruhiger Hinweis unter den Kennzahlen, nur wenn es etwas gibt; antippen filtert.
function renderSoon(soon){
  var el=document.getElementById('pantrySoon');
  if(!el)return;
  var listed=soon.filter(function(it){return it.rs&&it.rs.s;}).length,going=soon.length-listed;
  if(!soon.length){el.innerHTML='';return;}
  var parts=[];
  if(going)parts.push(going+(going===1?' geht':' gehen')+' bald aus');
  if(listed)parts.push('🛒 '+listed+' auf dem Zettel');
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
    if(fl&&it.loc!==fl)return false;
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
  if(_tile===EXP||ord==='exp'||ord==='name'||ord==='qty'){
    el.innerHTML=(_tile===EXP?shown:pantrySort(shown,ord,dueOf)).map(rowOf).join('');
    return;
  }
  var groups=byCat
    ?cats().map(function(c){return {id:c.id,t:c.ic+' '+c.label,a:[]};})
    :sortedLocs().map(function(l){return {id:l.id,t:l.ic+' '+l.label,a:[]};}).concat([{id:'',t:'📦 Ohne Lagerort',a:[]}]);
  shown.forEach(function(it){
    var key=byCat?catOf(it):it.loc,g=null;
    for(var i=0;i<groups.length;i++)if(groups[i].id===key)g=groups[i];
    (g||groups[groups.length-1]).a.push(it);
  });
  var html='';
  groups.forEach(function(g){
    if(!g.a.length)return;
    html+=groupHead(g.t);
    pantrySort(g.a,'name').forEach(function(it){html+=rowOf(it);});
  });
  el.innerHTML=html;
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
      +(first?'<div id="pantryItemEst" class="pantry-charge-note"></div>':'<label>Stück<input class="sinp pantry-charge-qty" inputmode="decimal" value="1"></label>')
      +'<label>MHD<input type="date" class="sinp pantry-charge-mhd"'+ids.mhd+' value=""></label>'
      +'<label>Verbrauchsdatum<input type="date" class="sinp pantry-charge-vd"'+ids.vd+' value=""></label>'
      +(id?'<button type="button" class="seb" data-act="NTPantry.removeChargeRow" data-args="'+args([id])+'">Zeile entfernen</button>':'')+'</div>';
  }
  var od=openDays(it),due=pantryLotDue(lot,od),bk=bookedOn(lot);
  var n=due?pantryDays(due,today()):null;
  var dueTxt=lot.op?'Geöffnet am '+fmtD(lot.op)+(od>0?' · hält noch bis '+fmtD(addDays(lot.op,od)):''):'';
  if(!lot.op&&due)dueTxt=(due===lot.vd?'Verbr. bis ':'MHD ')+fmtD(due)+(lot.estimated?' · geschätzt (Richtwert)':'');
  if(n!==null&&n<0)dueTxt+=' ⚠️ abgelaufen';else if(n!==null&&n<=EXP_DAYS)dueTxt+=' ⏰';
  return '<div class="pantry-charge" data-lot-id="'+esc(lot.id)+'">'
    +'<strong>'+fmtN(lot.q)+' Stück'+(bk?' · eingebucht '+fmtD(bk):'')+'</strong>'
    +(dueTxt?'<div class="pantry-charge-note" style="color:'+(n!==null&&n<=EXP_DAYS?(n<0?'var(--re)':'var(--or)'):'var(--mu)')+';">'+esc(dueTxt)+'</div>':'')
    +'<label>Stück<input class="sinp pantry-charge-q" inputmode="decimal" value="'+esc(fmtN(lot.q))+'"></label>'
    +'<label>Geöffnet am<input type="date" class="sinp pantry-charge-op" value="'+esc(lot.op||'')+'"></label>'
    +'<label>MHD<input type="date" class="sinp pantry-charge-mhd"'+ids.mhd+' value="'+esc(lot.mhd||'')+'"></label>'
    +'<label>Verbrauchsdatum<input type="date" class="sinp pantry-charge-vd"'+ids.vd+' value="'+esc(lot.vd||'')+'"></label>'
    +'<div class="pantry-charge-acts">'
      +(lot.op?'<span></span>':'<button type="button" class="seb" data-act="NTPantry.openLot" data-args="'+args([lot.id])+'" aria-label="Heute geöffnet markieren">📂 Geöffnet</button>')
      +'<button type="button" class="seb" data-act="NTPantry.dropLot" data-args="'+args([lot.id])+'">🗑️ Entfernen</button>'
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
function addChargeRow(){document.getElementById('pantryCharges').insertAdjacentHTML('beforeend',chargeRow(null,null,false));}
function removeChargeRow(id){
  var row=document.getElementById(id);
  if(row&&row.classList.contains('pantry-charge')&&!row.getAttribute('data-lot-id'))row.remove();
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
    +cell('Lagerort',l?l.ic+' '+l.label:'📦 Ohne Lagerort')
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
  _shownQ=fmtN(it.q);
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
  var lots=stockLots(it).map(function(lot){return Object.assign({},lot);});
  var lot=lots.find(function(x){return x.id===lotId;});if(!lot)return;
  lot.op=today();
  writeLots(it,lots);touch(it);refreshItem(it);
  var od=openDays(it);
  showToast('📂 Geöffnet'+(od>0?' · Richtwert: bis '+fmtD(addDays(lot.op,od)):''));
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
// Formular geändert: Schätz-Hinweis für die neue Packung (D1) und das Angebot,
// geschätzte Daten für einen neuen Lagerort neu zu berechnen (D4).
function formChanged(){
  var it=current(),n=val('pantryItemName').trim(),locId=val('pantryItemLoc');
  var probe={n:n,hd:Math.round(num(val('pantryItemHd'))),c:val('pantryItemCat')||guessCat(n)};
  var place=pantryPlace(loc(locId));
  var est=document.getElementById('pantryItemEst');
  if(est){
    var days=n?pantryEstimateDays(probe,place):0;
    est.textContent=days?'Leer lassen = geschätzt bis '+fmtD(addDays(today(),days))+(probe.hd>0?' (eigene Haltedauer)':' (Richtwert)')+'.'
      :(n?'Für „'+n+'“ kennt die App keinen Richtwert — Datum von der Packung eintragen.':'Leer lassen: Die App schätzt ein Datum nach Produktart und Lagerort.');
  }
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
  setVal('pantryItemHd',it&&+it.hd>0?String(Math.round(it.hd)):'');
  setVal('pantryItemUseQ','1');
  var au=/** @type {HTMLInputElement} */ (document.getElementById('pantryItemAuto'));
  if(au)au.checked=!!(it&&it.auto);
  var ld=document.getElementById('pantryItemLead');
  if(ld)ld.textContent=lead()+(lead()===1?' Tag':' Tage');
  _pendingBc='';
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
      addBc(t,code);
      var b0=pantryNeed(t.q,t.min);
      if(_scanMode==='out')take(t,1,'verbrauch','scan');else refill(t,1,'scan');
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
  it.hd=Math.round(num(val('pantryItemHd')));
  if(!it.hd)delete it.hd;
  var auto=/** @type {HTMLInputElement} */ (document.getElementById('pantryItemAuto'));
  if(auto&&auto.checked)it.auto=1;
  else if(auto){delete it.auto;delete it.rsNo;}
  var lots=stockLots(it).map(function(lot){return Object.assign({},lot);}),newRows=[],fixes=[];
  /** @type {any} */
  var firstNew=null;
  function field(row,cls){var el=/** @type {HTMLInputElement} */ (row.querySelector(cls));return el?el.value:'';}
  document.querySelectorAll('#pantryCharges .pantry-charge').forEach(function(row){
    var d=field(row,'.pantry-charge-mhd'),v=field(row,'.pantry-charge-vd'),lotId=row.getAttribute('data-lot-id');
    if(row.hasAttribute('data-new-first')){firstNew={mhd:d,vd:v};return;}
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
    }else if(!lotId)newRows.push({q:num(field(row,'.pantry-charge-qty')),mhd:d,vd:v});
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
  if(totalChanged){
    var cur=+it.q||0;
    if(wanted>cur)refill(it,wanted-cur,isNew&&_pendingBc?'scan':'hand',firstNew?firstNew.mhd:'',firstNew?firstNew.vd:'');
    if(wanted<cur&&!isNew)take(it,cur-wanted,'korrektur','hand');
  }
  newRows.forEach(function(lot){refill(it,lot.q,'hand',lot.mhd,lot.vd);});
  if(_pendingBc&&isNew){addBc(it,_pendingBc);_pendingBc='';}
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

// ════════ Barcode scannen (#335) ════════
// Bekannt → ±1 und weiterscannen; unbekannt → Artikel-Dialog mit dem, was Open
// Food Facts weiß, dort neu anlegen oder einem vorhandenen zuordnen.
/** @param {string} mode 'in' | 'out' */
function scan(mode){
  if(!window.NTPicker||!NTPicker.scanFor){showToast('Scanner nicht geladen');return;}
  _scanMode=mode==='out'?'out':'in';
  NTPicker.scanFor({
    title:_scanMode==='out'?'🏷️ Vorrat: verbrauchen':'🏷️ Vorrat: einbuchen',
    known:scanKnown,unknown:scanUnknown
  });
}
/** @param {string} code */
function scanKnown(code){
  var it=findByBc(code);
  if(!it)return '';
  var before=pantryNeed(it.q,it.min);
  if(_scanMode==='out'){
    if(!((+it.q||0)>0))return (it.ic||'')+' '+it.n+' ist schon leer';
    take(it,1,'verbrauch','scan');
  }else refill(it,1,'scan');
  touch(it);afterChange(it,before);
  return (_scanMode==='out'?'− ':'＋ ')+(it.ic||'')+' '+it.n+' · jetzt '+fmtN(it.q);
}
/** @param {string} code @param {any} prod {name,g}|null */
function scanUnknown(code,prod){
  openItem('');
  _pendingBc=code;
  setVal('pantryItemName',prod&&prod.name?prod.name:'');
  if(prod&&prod.g)setVal('pantryItemG',String(prod.g));
  setVal('pantryItemQ',_scanMode==='out'?'0':'1');
  var t=document.getElementById('pantryItemTitle');
  if(t)t.textContent='🏷️ Neuer Barcode';
  renderItemExtras(null);
  formChanged();
  if(!prod)showToast('Barcode nicht in Open Food Facts — bitte Namen eintragen');
}

// ════════ Verlauf (#336) ════════
var KIND={kauf:'＋ Gekauft',verbrauch:'🍽️ Verbraucht',verderb:'🗑️ Weggeworfen',kochen:'👨‍🍳 Gekocht',korrektur:'✏️ Korrigiert'};
var SRC={hand:'',zettel:'vom Einkaufszettel',scan:'per Scan',foto:'vom Foto'};
function openLog(){leaveMore();trimLog();openOv('pantryLogOv');renderLog();}
function monthKey(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);}
function renderLog(){
  var el=document.getElementById('pantryLogList'),ws=document.getElementById('pantryWaste');
  if(!el)return;
  var a=logArr();
  if(ws){
    var w=pantryWaste(a,monthKey(new Date()));
    ws.innerHTML=w.n
      ?'<div style="font-size:12px;line-height:1.5;background:var(--gl);border:1px solid var(--br);border-radius:10px;padding:8px 10px;margin-bottom:8px;">🗑️ Diesen Monat weggeworfen: <b>'+fmtN(w.q)+' Stück</b> ('+w.n+'×)'
        +' · meist '+w.top.slice(0,3).map(function(x){return esc((x.ic||'')+' '+x.n)+(x.count>1?' ('+x.count+'×)':'');}).join(', ')+'</div>'
      :'<div style="font-size:12px;color:var(--mu);margin-bottom:8px;">Diesen Monat nichts weggeworfen ✓</div>';
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
      +'<div style="font-size:12px;color:var(--mu);">'+when+' · '+esc(KIND[e.k]||e.k)+(src?' '+esc(src):'')+(e.u?' · rückgängig':'')+'</div>'
    +'</div>'
    +(e.u?'':'<button type="button" class="seb" style="width:auto;margin:0;padding:6px 10px;font-size:12px;" data-act="NTPantry.undo" data-args="'+args([e.id])+'" aria-label="Buchung rückgängig machen">↩️</button>')
    +'</div>';
}
// Gegenbuchung: Bestand um die Buchung zurück, Eintrag als rückgängig markiert.
/** @param {string} id */
function undo(id){
  var e=logById(id);
  if(!e||e.u)return;
  var it=byId(e.pid);
  if(!it){showToast('„'+e.n+'“ steht nicht mehr im Vorrat');return;}
  var before=pantryNeed(it.q,it.min);
  if(e.d>0){
    if(Array.isArray(e.lots))e.lots.forEach(function(lot){debit(it,lot.q,lot.id);});
    else debit(it,e.d);
  }else if(Array.isArray(e.lots))appendLots(it,e.lots);
  else appendLots(it,[{id:uid('charge'),q:-e.d,mhd:it.mhd||'',vd:it.vd||''}]);
  e.u=1;e.rev=nextRev();
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
function daily(){restockDaily();checkRemind();}

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

// ════════ Fotos auswerten (#326) ════════
function openPhotos(){
  _photos=[];_found=[];
  photoStatus('',false);
  renderPhotos();
  openOv('pantryPhotoOv');
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
    +'<span style="font-size:22px;line-height:1;">'+ic+'</span><span style="font-size:10px;font-weight:700;">'+label+'</span></button>';
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
function analyzePhotos(){
  if(!_photos.length)return;
  if(typeof isOnline!=='undefined'&&!isOnline){photoStatus('Fotos auswerten braucht Internet.',true);return;}
  if(!canUseAi()){photoStatus('KI ist nicht eingerichtet — Mehr → 🤖 KI.',true);return;}
  var btn=/** @type {HTMLButtonElement} */ (document.getElementById('pantryPhotoBtn'));
  if(btn){btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;gap:5px;align-items:center;"><span class="spin"></span>KI schaut nach…</span>';}
  photoStatus('Die KI wertet '+_photos.length+' Foto'+(_photos.length===1?'':'s')+' aus …',false);
  /** @type {Array<any>} */
  var content=_photos.map(function(b){return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b}};});
  content.push({type:'text',text:photoPrompt()});
  callClaude('claude-sonnet-5-5',content,2048,function(text){
    _found=parsePantryPhoto(text,locs().map(function(l){return l.id;})).map(function(x){
      var ex=findByName(x.n);
      return {n:x.n,q:x.q,g:x.g,loc:x.loc||(ex&&ex.loc)||'',mhd:x.mhd,vd:x.vd,on:true,ex:!!ex};
    });
    photoStatus(_found.length?(_found.length+' Lebensmittel erkannt — prüfen, anpassen, übernehmen.'):'Nichts erkannt. Ein schärferes Foto hilft.',!_found.length);
    renderPhotos();
  },function(err){
    photoStatus(window.NTPicker?NTPicker.pickerFriendlyAiError(err):('Fehler: '+err),true);
    renderPhotos();
  });
}
function renderFound(){
  var el=document.getElementById('pantryFound');
  if(!el)return;
  if(!_found.length){el.innerHTML='';return;}
  el.innerHTML='<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:14px 2px 6px;">Erkannt</div>'
    +_found.map(function(x,i){
      return '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--br);">'
        +'<input type="checkbox" '+(x.on?'checked ':'')+'onchange="NTPantry.foundSet('+i+',\'on\',this.checked)" style="width:20px;height:20px;flex-shrink:0;">'
        +'<input type="text" class="sinp" value="'+esc(x.n)+'" onchange="NTPantry.foundSet('+i+',\'n\',this.value)" style="flex:1;min-width:0;padding:7px 8px;font-size:13px;">'
        +'<input type="number" class="sinp" value="'+x.q+'" min="0" step="1" inputmode="decimal" onchange="NTPantry.foundSet('+i+',\'q\',this.value)" style="width:56px;padding:7px 6px;font-size:13px;" aria-label="Stück">'
        +'<select class="sinp" onchange="NTPantry.foundSet('+i+',\'loc\',this.value)" style="width:96px;padding:7px 4px;font-size:12px;">'+locOptions(x.loc)+'</select>'
        +'</div>'+(x.ex?'<div style="font-size:10px;color:var(--mu);margin:-2px 0 4px 26px;">steht schon im Vorrat — wird dazugezählt</div>':'')
        +(x.vd||x.mhd?'<div style="font-size:10px;color:var(--mu);margin:-2px 0 4px 26px;">'+esc([x.vd?'Verbr. bis '+fmtD(x.vd):'',x.mhd?'MHD '+fmtD(x.mhd):''].filter(Boolean).join(' · '))+'</div>':'');
    }).join('')
    +'<button type="button" class="svb" data-act="NTPantry.foundApply">✓ Ausgewählte übernehmen</button>';
}
function foundSet(i,k,v){
  var x=_found[i];if(!x)return;
  if(k==='on')x.on=!!v;
  else if(k==='q')x.q=num(v);
  else x[k]=String(v||'').trim();
}
function foundApply(){
  var n=0;
  _found.forEach(function(x){if(x.on&&x.n&&add(x.n,x.q||1,x.g,x.loc,'',0,{mhd:x.mhd,vd:x.vd},'foto'))n++;});
  _found=[];_photos=[];
  closeOv('pantryPhotoOv');
  showToast(n?(n+' Artikel im Vorrat ✓'):'Nichts übernommen');
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
function openCook(){
  var el=document.getElementById('pantryCookList');
  if(el){
    var sug=pantrySuggest(cookRecs(),items()).slice(0,10);
    el.innerHTML=sug.length?sug.map(function(s){
      return '<div style="padding:10px 2px;border-bottom:1px solid var(--br);cursor:pointer;" data-act="NTPantry.openRecipe" data-args="'+args([s.id])+'">'
        +'<div style="font-weight:700;font-size:14px;">'+esc(s.name)+'</div>'
        +'<div style="font-size:11px;color:var(--g1);margin-top:2px;">✓ '+s.have.length+' von '+(s.have.length+s.miss.length)+' Zutaten da</div>'
        +(s.miss.length?'<div style="font-size:11px;color:var(--mu);margin-top:1px;">Fehlt: '+esc(s.miss.slice(0,6).join(', '))+(s.miss.length>6?' …':'')+'</div>':'')
        +'</div>';
    }).join(''):'<div style="font-size:13px;color:var(--mu);font-style:italic;padding:10px 2px;line-height:1.5;">'
      +(items().length?'Kein Rezept im Kochbuch passt zu deinem Vorrat.':'Der Vorrat ist leer — trag erst ein, was du da hast.')+'</div>';
  }
  var ai=document.getElementById('pantryAiList');if(ai)ai.innerHTML='';
  openOv('pantryCookOv');
}
function openRecipe(id){
  closeOv('pantryCookOv');
  setTimeout(function(){if(window.NTBook)NTBook.detail(id);},200);
}
function aiIdeas(){
  var have=items().filter(function(it){return (+it.q||0)>0;});
  if(!have.length){showToast('Der Vorrat ist leer');return;}
  if(typeof isOnline!=='undefined'&&!isOnline){showToast('KI-Ideen brauchen Internet');return;}
  if(!canUseAi()){showToast('KI ist nicht eingerichtet — Mehr → 🤖 KI');return;}
  var el=document.getElementById('pantryAiList');
  if(el)el.innerHTML='<div style="font-size:13px;color:var(--mu);padding:10px 2px;display:flex;gap:6px;align-items:center;"><span class="spin"></span>Die KI überlegt …</div>';
  var prefs=(S.dietPrefs||[]).join(', ');
  var prompt='Im Haushalt ist vorrätig: '+have.map(function(it){return it.n+' ('+fmtN(it.q)+' Stück'+(+it.g>0?' à '+fmtN(it.g)+' g':'')+')';}).join(', ')+'.\n'
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
  openLot:openLot,dropLot:dropLot,toShop:toShop,editFields:editFields,formChanged:formChanged,
  add:add,step:step,remove:remove,submitInput:submitInput,inputKey:inputKey,
  openItem:openItem,saveItem:saveItem,deleteItem:deleteItem,addChargeRow:addChargeRow,removeChargeRow:removeChargeRow,
  openLocs:openLocs,locAdd:locAdd,locSave:locSave,locMove:locMove,locDelete:locDelete,
  openPhotos:openPhotos,pickPhotos:pickPhotos,takePhoto:takePhoto,photosChosen:photosChosen,dropPhoto:dropPhoto,
  analyzePhotos:analyzePhotos,foundSet:foundSet,foundApply:foundApply,
  openCook:openCook,openRecipe:openRecipe,aiIdeas:aiIdeas,openExpiring:openExpiring,expiring:expiring,
  onBought:onBought,useRecipe:useRecipe,offerMeal:offerMeal,confirmMeal:confirmMeal,shortfall:shortfall,
  consume:consume,dropBarcodes:dropBarcodes,scan:scan,openLog:openLog,undo:undo,
  remindOn:remindOn,setRemind:setRemind,checkRemind:checkRemind,daily:daily,restockDaily:restockDaily,
  restockNow:restockNow,skipRestock:skipRestock,takeMinSug:takeMinSug,openMore:openMore,setLead:setLead,
  usage:function(id){var it=byId(id);return it?usage(it):null;},
  count:function(){return items().length;},lowCount:function(){return items().filter(low).length;},
  Sync:Sync
};
})();
