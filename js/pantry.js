// @ts-check
// NutriTrack – Vorrat (#325, #326)
// Klassisches Script, kein Modul. Exportiert window.NTPantry und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, openOv, closeOv, esc,
// showToast, callClaude, canUseAi, recipes) sowie auf NTShop, NTBook und NTSync.
//
// Was zu Hause da ist, wo es steht und was immer da sein soll:
//   S.pantry      [{id,n,ic,loc,q,g,min,mhd,vd,hd,bc,ts,rev,_sy}]  q = Stück, g =
//                 Gramm je Stück, min = Mindestmenge in Stück (0 = keine), mhd/vd =
//                 Mindesthaltbarkeits-/Verbrauchsdatum JJJJ-MM-TT (leer = keins),
//                 hd = hält ca. … Tage (MHD beim Auffüllen), bc = Barcodes
//   S.pantryLocs  [{id,ic,label,pos,rev,_sy}]  Lagerorte, alle änderbar
//   S.pantryTomb  {id:{rev}}  Grabsteine für Artikel und Lagerorte (`loc:<id>`)
//   S.pantryLog   [{id,t,pid,n,ic,d,k,src,u,rev,_sy}]  Verlauf (#336): d = ± Stück,
//                 k = kauf|verbrauch|verderb|kochen|korrektur, u = rückgängig.
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
var _filter='';      // Lagerort-ID, '' = alle, EXP = bald ablaufend
var EXP='__exp';
var EXP_DAYS=3;
var _photos=[];      // komprimierte Fotos als base64, nur im Speicher
var _found=[];       // Ergebnis der Foto-Auswertung bis zur Bestätigung
var _refill={};      // Einkaufs-ID → {pid,n,log}: was ein Abhaken aufgefüllt hat
var _pendingBc='';   // gescannter, noch unbekannter Barcode für den Artikel-Dialog
var _scanMode='in';  // Scanner: 'in' = einbuchen, 'out' = verbrauchen

function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
var _lastRev=0;
function nextRev(){var r=Math.max(Date.now(),_lastRev+1);_lastRev=r;return r;}
function fmtN(v){return String(Math.round((+v||0)*10)/10).replace('.',',');}
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
function r1(v){return Math.round(v*10)/10;}
function guessIc(n){return (window.NTShop&&NTShop.guess)?NTShop.guess(n).ic:'🥫';}
function fmtD(d){var p=String(d||'').split('-');return p.length===3?(p[2]+'.'+p[1]+'.'+p[0].slice(2)):'';}
function expiry(it){return pantryExpiry(it,today());}
function expiring(){return pantryExpiring(items(),today(),EXP_DAYS);}
// „MHD 02.11.26“ bzw. „Verbrauchen bis …“, abgelaufen/bald mit Hinweis.
function expiryText(e){
  if(!e)return '';
  var t=(e.k==='vd'?'Verbr. bis ':'MHD ')+fmtD(e.d);
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
function amountText(it){
  var t=fmtN(it.q)+' Stück';
  if(+it.g>0)t+=' à '+fmtN(it.g)+' g';
  return t;
}

// Steht ein Artikel nach einer Änderung unter der Mindestmenge, kommt er auf
// den Einkaufszettel — nur beim Übergang (oder wenn mehr fehlt als vorher),
// sonst landete er nach jedem −-Tipp erneut dort, auch wenn ihn jemand
// bewusst vom Zettel genommen hat.
function afterChange(it,before){
  var need=pantryNeed(it.q,it.min);
  if(need>0&&need>before&&window.NTShop){
    NTShop.add(it.n,need+' Stück','',it.ic||'');
    showToast((it.ic||'')+' '+it.n+' ist knapp → Einkaufszettel');
  }
}
function touch(it){it.rev=nextRev();saveS();Sync.schedule();render();}

// ── Verlauf (#336) ──
// Eine Buchung je Bestandsänderung. Gespeichert und gerendert wird mit dem
// Artikel (touch), deshalb hier nur anlegen.
/** @param {any} it @param {number} d @param {string} k @param {string} [src] */
function log(it,d,k,src){
  d=r1(d);
  if(!d)return null;
  var e={id:uid('l'),t:Date.now(),pid:it.id,n:it.n,ic:it.ic||'',d:d,k:k,src:src||'hand',u:0,rev:nextRev()};
  logArr().unshift(e);
  return e;
}
function logById(id){var a=logArr();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function trimLog(){
  var a=logArr(),t=pantryLogTrim(a,Date.now(),LOG_DAYS,LOG_MAX);
  if(t.length!==a.length)S.pantryLog=t;
}
// Auffüllen um `n` Stück: Menge, MHD aus der Standard-Haltbarkeit, Verlauf.
/** @param {any} it @param {number} n @param {string} src @param {string} [mhd] */
function refill(it,n,src,mhd){
  var qb=+it.q||0;
  if(!(n>0)){if(mhd)it.mhd=earlier(it.mhd,mhd);return null;}
  it.q=r1(qb+n);
  if(mhd)it.mhd=qb>0?earlier(it.mhd,mhd):mhd;
  else it.mhd=pantryRefillMhd(it,qb,today());
  return log(it,it.q-qb,'kauf',src);
}
// Abziehen um `n` Stück (nie unter 0).
/** @param {any} it @param {number} n @param {string} k @param {string} [src] */
function take(it,n,k,src){
  var qb=+it.q||0;
  it.q=Math.max(0,r1(qb-n));
  return log(it,it.q-qb,k,src);
}

/** @param {any} [dates] {mhd,vd} @param {string} [src] Herkunft für den Verlauf */
function add(n,q,g,locId,ic,min,dates,src){
  n=String(n||'').trim();
  if(!n)return null;
  var mhd=(dates&&dates.mhd)||'',vd=(dates&&dates.vd)||'';
  var ex=findByName(n);
  if(ex){
    var before=pantryNeed(ex.q,ex.min);
    if(+g>0&&!(+ex.g>0))ex.g=+g;
    if(locId&&!ex.loc)ex.loc=locId;
    refill(ex,+q||0,src||'hand',mhd);
    if(vd)ex.vd=earlier(ex.vd,vd);
    touch(ex);afterChange(ex,before);
    return ex;
  }
  var it={id:uid('p'),n:n,ic:ic||guessIc(n),loc:locId||'',q:0,g:+g>0?+g:0,min:+min>0?+min:0,mhd:'',vd:vd,ts:Date.now(),rev:nextRev()};
  items().push(it);
  refill(it,+q>0?+q:0,src||'hand',mhd);
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
  setVal('pantryItemQ',fmtN(it.q));
  renderItemExtras(it);
  if(e)showToast((spoiled?'🗑️ ':'🍽️ ')+fmtN(-e.d)+' '+it.n+(spoiled?' weggeworfen':' verbraucht')+' · ↩️ im Verlauf');
}
function remove(id){
  var a=items();
  for(var i=0;i<a.length;i++)if(a[i].id===id){a.splice(i,1);tomb()[id]={rev:nextRev()};saveS();Sync.schedule();render();return;}
}

// ── Einkaufszettel: abgehakt = gekauft = aufgefüllt ───────────────────────
// Nur Artikel, die im Vorrat stehen. Wieder ent-hakt nimmt genau das zurück,
// was das Abhaken in dieser Sitzung aufgefüllt hat.
/** @param {any} shopItem @param {boolean} done */
function onBought(shopItem,done){
  if(!shopItem)return;
  if(!done){
    var m=_refill[shopItem.id];
    if(!m)return;
    delete _refill[shopItem.id];
    var le=m.log?logById(m.log):null;
    if(le&&le.u)return;// im Verlauf schon rückgängig gemacht
    var back=byId(m.pid);
    if(back){
      back.q=Math.max(0,r1((+back.q||0)-m.n));
      if(le){le.u=1;le.rev=nextRev();}
      touch(back);
    }
    return;
  }
  var it=pantryFind(items(),shopItem.n);
  if(!it)return;
  var n=pantryBought(shopItem.q,it);
  var e=refill(it,n,'zettel');
  _refill[shopItem.id]={pid:it.id,n:n,log:e?e.id:''};
  touch(it);
  showToast('Vorrat: '+(it.ic||'')+' '+it.n+' +'+fmtN(n));
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
    var nq=pantryUse(it,(+ing.amount||0)*p);
    if(nq===null){skipped++;return;}
    var before=pantryNeed(it.q,it.min);
    log(it,nq-(+it.q||0),'kochen',recName||'Rezept');
    it.q=nq;it.rev=nextRev();
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
  openOv('pantryOv');
  render();
  Sync.run();
  Sync.startPoll(function(){return isOpen('pantryOv')||isOpen('pantryItemOv')||isOpen('pantryLocsOv');});
}
function close(){Sync.stopPoll();closeOv('pantryOv');}
function render(){
  renderCard();
  if(isOpen('pantryOv'))renderList();
  if(isOpen('pantryLocsOv'))renderLocs();
}
function setFilter(id){_filter=id||'';renderList();}
function row(it){
  var lw=low(it),e=(+it.q||0)>0?expiry(it):null;
  return '<div style="display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid var(--br);">'
    +'<div style="font-size:20px;flex-shrink:0;">'+esc(it.ic||'🥫')+'</div>'
    +'<div style="flex:1;min-width:0;cursor:pointer;" data-act="NTPantry.openItem" data-args="'+args([it.id])+'">'
      +'<div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(it.n)+'</div>'
      +'<div style="font-size:11px;color:'+(lw?'var(--or)':'var(--mu)')+';margin-top:1px;">'+esc(amountText(it))
        +(+it.min>0?' · mind. '+fmtN(it.min)+(lw?' ⚠️':''):'')+'</div>'
      +(e?'<div style="font-size:11px;font-weight:'+(e.lvl==='ok'?'400':'700')+';color:'+expiryColor(e)+';margin-top:1px;">'+esc(expiryText(e))+'</div>':'')
    +'</div>'
    +'<button type="button" class="pt-st" data-act="NTPantry.step" data-args="'+args([it.id,-1])+'">−</button>'
    +'<button type="button" class="pt-st" data-act="NTPantry.step" data-args="'+args([it.id,1])+'">＋</button>'
    +'</div>';
}
function renderList(){
  var el=document.getElementById('pantryList');
  if(!el)return;
  var a=items(),lo=a.filter(low),ex=expiring();
  if(_filter===EXP&&!ex.length)_filter='';
  var sub=document.getElementById('pantryOvSub');
  if(sub)sub.textContent=a.length?(a.length+' Artikel'+(lo.length?' · '+lo.length+' knapp':'')+(ex.length?' · '+ex.length+' läuft ab':'')+(Sync.active()?' · geteilt':'')):'Noch nichts eingetragen';
  var chips=document.getElementById('pantryLocChips');
  if(chips){
    chips.innerHTML='<button type="button" class="stab'+(!_filter?' act':'')+'" data-act="NTPantry.setFilter" data-args="'+args([''])+'">Alle</button>'
      +(ex.length?'<button type="button" class="stab'+(_filter===EXP?' act':'')+'" data-act="NTPantry.setFilter" data-args="'+args([EXP])+'">⏰ Läuft ab ('+ex.length+')</button>':'')
      +sortedLocs().map(function(l){
        return '<button type="button" class="stab'+(_filter===l.id?' act':'')+'" data-act="NTPantry.setFilter" data-args="'+args([l.id])+'">'+esc(l.ic+' '+l.label)+'</button>';
      }).join('');
  }
  if(_filter===EXP){
    el.innerHTML=ex.map(function(x){return row(x.it);}).join('');
    return;
  }
  var shown=a.filter(function(it){return !_filter||it.loc===_filter;});
  if(!shown.length){
    el.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;line-height:1.5;">'
      +(a.length?'Hier steht noch nichts.':'Trag oben ein, was du da hast — oder lass die KI Fotos von Kühlschrank und Schrank auswerten.')+'</div>';
    return;
  }
  var groups=sortedLocs().map(function(l){return {l:l,a:[]};});
  var rest={l:{id:'',ic:'📦',label:'Ohne Lagerort'},a:[]};
  shown.forEach(function(it){
    var g=null;for(var i=0;i<groups.length;i++)if(groups[i].l.id===it.loc)g=groups[i];
    (g||rest).a.push(it);
  });
  var html='';
  groups.concat([rest]).forEach(function(g){
    if(!g.a.length)return;
    html+='<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:14px 2px 2px;">'+esc(g.l.ic+' '+g.l.label)+'</div>';
    g.a.sort(function(x,y){return String(x.n).localeCompare(String(y.n),'de');}).forEach(function(it){html+=row(it);});
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
  var it=add(n,q,0,_filter===EXP?'':_filter);
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
function openItem(id){
  var it=id?byId(id):null;
  _editId=it?it.id:null;
  setVal('pantryItemName',it?it.n:'');
  setVal('pantryItemIcon',it?(it.ic||''):'');
  setVal('pantryItemQ',it?fmtN(it.q):'1');
  setVal('pantryItemG',it&&+it.g>0?fmtN(it.g):'');
  setVal('pantryItemMin',it&&+it.min>0?fmtN(it.min):'');
  setVal('pantryItemMhd',it&&it.mhd||'');
  setVal('pantryItemVd',it&&it.vd||'');
  setVal('pantryItemHd',it&&+it.hd>0?String(Math.round(it.hd)):'');
  setVal('pantryItemUseQ','1');
  _pendingBc='';
  renderItemExtras(it);
  var sel=document.getElementById('pantryItemLoc');
  if(sel)sel.innerHTML=locOptions(it?it.loc:(_filter===EXP?'':_filter));
  var t=document.getElementById('pantryItemTitle');
  if(t)t.textContent=it?'✏️ Vorrats-Artikel':'＋ Neuer Vorrats-Artikel';
  var del=document.getElementById('pantryItemDel');
  if(del)del.style.display=it?'':'none';
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
  var qb=+it.q||0,mhdOld=it.mhd||'';
  it.n=n;
  it.ic=val('pantryItemIcon').trim()||guessIc(n);
  it.loc=val('pantryItemLoc');
  it.q=num(val('pantryItemQ'));
  it.g=num(val('pantryItemG'));
  it.min=num(val('pantryItemMin'));
  it.hd=Math.round(num(val('pantryItemHd')));
  if(!it.hd)delete it.hd;
  it.mhd=pantryDays(val('pantryItemMhd'),today())===null?'':val('pantryItemMhd');
  it.vd=pantryDays(val('pantryItemVd'),today())===null?'':val('pantryItemVd');
  // Aufgefüllt, Datum nicht angefasst → MHD aus „Hält ca. … Tage“.
  if(it.q>qb&&it.mhd===mhdOld)it.mhd=pantryRefillMhd(it,qb,today());
  if(_pendingBc&&isNew){addBc(it,_pendingBc);_pendingBc='';}
  log(it,it.q-qb,isNew?'kauf':'korrektur',isNew&&it.bc?'scan':'hand');
  touch(it);
  _editId=null;
  closeOv('pantryItemOv');
  afterChange(it,before);
  showToast('Gespeichert ✓');
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
  if(!prod)showToast('Barcode nicht in Open Food Facts — bitte Namen eintragen');
}

// ════════ Verlauf (#336) ════════
var KIND={kauf:'＋ Gekauft',verbrauch:'🍽️ Verbraucht',verderb:'🗑️ Weggeworfen',kochen:'👨‍🍳 Gekocht',korrektur:'✏️ Korrigiert'};
var SRC={hand:'',zettel:'vom Einkaufszettel',scan:'per Scan',foto:'vom Foto'};
function openLog(){trimLog();openOv('pantryLogOv');renderLog();}
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
    var src=SRC[e.src]!==undefined?SRC[e.src]:e.src;
    html+='<div style="display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid var(--br);'+(e.u?'opacity:.5;':'')+'">'
      +'<div style="font-size:18px;flex-shrink:0;">'+esc(e.ic||'🥫')+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+(e.u?'text-decoration:line-through;':'')+'">'+esc(e.n)+' '+(e.d>0?'+':'−')+fmtN(Math.abs(e.d))+'</div>'
        +'<div style="font-size:11px;color:var(--mu);">'+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+' · '+esc(KIND[e.k]||e.k)+(src?' '+esc(src):'')+(e.u?' · rückgängig':'')+'</div>'
      +'</div>'
      +(e.u?'':'<button type="button" class="seb" style="width:auto;margin:0;padding:6px 10px;font-size:12px;" data-act="NTPantry.undo" data-args="'+args([e.id])+'">↩️</button>')
      +'</div>';
  });
  el.innerHTML=html;
}
// Gegenbuchung: Bestand um die Buchung zurück, Eintrag als rückgängig markiert.
/** @param {string} id */
function undo(id){
  var e=logById(id);
  if(!e||e.u)return;
  var it=byId(e.pid);
  if(!it){showToast('„'+e.n+'“ steht nicht mehr im Vorrat');return;}
  var before=pantryNeed(it.q,it.min);
  it.q=Math.max(0,r1((+it.q||0)-(+e.d||0)));
  e.u=1;e.rev=nextRev();
  Object.keys(_refill).forEach(function(k){if(_refill[k].log===e.id)delete _refill[k];});
  touch(it);afterChange(it,before);
  renderLog();
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
  if(!ex.length)return;
  S.pantryRemindDay=d;saveS();
  var names=ex.slice(0,4).map(function(x){return (x.it.ic||'')+' '+x.it.n+' ('+(x.e.days<0?'abgelaufen':(x.e.days===0?'heute':(x.e.days===1?'morgen':fmtD(x.e.d))))+')';});
  NTRemind.notify('🥫 '+ex.length+' Artikel '+(ex.length===1?'läuft':'laufen')+' bald ab',{body:names.join(', ')+(ex.length>4?' …':''),tag:'nt-pantry-exp'});
}

// Einkaufszettel: nur, was der Vorrat nicht deckt (#334).
/** @param {Array<any>} ings */
function shortfall(ings){return pantryShortfall(ings,items());}

// ════════ Lagerorte ════════
function openLocs(){openOv('pantryLocsOv');renderLocs();}
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
  checkRemind();
  setInterval(checkRemind,30*60000);
}
document.addEventListener('visibilitychange',function(){if(!document.hidden){Sync.run();checkRemind();}});

window.NTPantry={
  boot:boot,open:open,close:close,render:render,renderCard:renderCard,setFilter:setFilter,
  add:add,step:step,remove:remove,submitInput:submitInput,inputKey:inputKey,
  openItem:openItem,saveItem:saveItem,deleteItem:deleteItem,
  openLocs:openLocs,locAdd:locAdd,locSave:locSave,locMove:locMove,locDelete:locDelete,
  openPhotos:openPhotos,pickPhotos:pickPhotos,takePhoto:takePhoto,photosChosen:photosChosen,dropPhoto:dropPhoto,
  analyzePhotos:analyzePhotos,foundSet:foundSet,foundApply:foundApply,
  openCook:openCook,openRecipe:openRecipe,aiIdeas:aiIdeas,
  onBought:onBought,useRecipe:useRecipe,shortfall:shortfall,
  consume:consume,dropBarcodes:dropBarcodes,scan:scan,openLog:openLog,undo:undo,
  remindOn:remindOn,setRemind:setRemind,checkRemind:checkRemind,
  count:function(){return items().length;},lowCount:function(){return items().filter(low).length;},
  Sync:Sync
};
})();
