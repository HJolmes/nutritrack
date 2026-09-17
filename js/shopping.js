// NutriTrack – Einkaufszettel (v0.233)
// Klassisches Script, kein Modul. Exportiert window.NTShop und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, openOv, closeOv, esc,
// showToast, PROJECT_WORKER_BASE, recipes, customFoods).
//
// Zwei Geräte einer Familie halten den Zettel synchron – gleiche Mechanik wie
// das Baby-Tagebuch (js/baby.js), aber mit EIGENEM Raum und EIGENEM Schlüssel:
// Wer den Einkaufszettel teilt, gibt damit nicht das Baby-Tagebuch frei.
//
// Daten liegen in S.shopList (eigener Schlüssel, NICHT in S.days) – sonst würde
// compressOldDays() sie mit den Mahlzeiten wegräumen. S wird komplett gesichert
// (backupState), der Zettel ist damit automatisch Teil jedes Backups.
(function(){
'use strict';

// ── Kategorien = Gänge im Laden. Reihenfolge bestimmt die Sortierung. ──
var CATS=[
  {id:'obst',     ic:'🥦', label:'Obst & Gemüse'},
  {id:'brot',     ic:'🥖', label:'Brot & Backwaren'},
  {id:'milch',    ic:'🧀', label:'Milch & Käse'},
  {id:'fleisch',  ic:'🥩', label:'Fleisch & Fisch'},
  {id:'vorrat',   ic:'🥫', label:'Vorrat & Trockenes'},
  {id:'tk',       ic:'🧊', label:'Tiefkühl'},
  {id:'suess',    ic:'🍫', label:'Süßes & Snacks'},
  {id:'getraenke',ic:'🥤', label:'Getränke'},
  {id:'haushalt', ic:'🧻', label:'Haushalt & Drogerie'},
  {id:'baby',     ic:'🍼', label:'Baby'},
  {id:'sonst',    ic:'🛒', label:'Sonstiges'}
];
function cat(id){
  for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i];
  return CATS[CATS.length-1];
}
function catOrder(id){
  for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return i;
  return CATS.length;
}

// ── Artikel-Katalog für die Kachel-Auswahl (ein Tipp = auf dem Zettel) ──
// Bewusst als kompakte Liste `[Name, Symbol, Kategorie]` gehalten: Der Katalog
// dient nur der schnellen Auswahl und der Kategorie-Erkennung bei Freitext.
var CATALOG=[
  ['Äpfel','🍎','obst'],['Bananen','🍌','obst'],['Birnen','🍐','obst'],['Orangen','🍊','obst'],
  ['Zitronen','🍋','obst'],['Trauben','🍇','obst'],['Erdbeeren','🍓','obst'],['Heidelbeeren','🫐','obst'],
  ['Melone','🍉','obst'],['Avocado','🥑','obst'],['Tomaten','🍅','obst'],['Gurke','🥒','obst'],
  ['Paprika','🫑','obst'],['Salat','🥬','obst'],['Spinat','🥬','obst'],['Möhren','🥕','obst'],
  ['Kartoffeln','🥔','obst'],['Zwiebeln','🧅','obst'],['Knoblauch','🧄','obst'],['Brokkoli','🥦','obst'],
  ['Blumenkohl','🥦','obst'],['Zucchini','🥒','obst'],['Champignons','🍄','obst'],['Lauch','🥬','obst'],
  ['Ingwer','🫚','obst'],['Kräuter','🌿','obst'],['Mais','🌽','obst'],['Kürbis','🎃','obst'],

  ['Brot','🍞','brot'],['Brötchen','🥐','brot'],['Toast','🍞','brot'],['Vollkornbrot','🍞','brot'],
  ['Baguette','🥖','brot'],['Croissants','🥐','brot'],['Knäckebrot','🍘','brot'],['Wraps','🌯','brot'],

  ['Milch','🥛','milch'],['Butter','🧈','milch'],['Käse','🧀','milch'],['Frischkäse','🧀','milch'],
  ['Joghurt','🥣','milch'],['Quark','🥣','milch'],['Sahne','🥛','milch'],['Schmand','🥣','milch'],
  ['Eier','🥚','milch'],['Mozzarella','🧀','milch'],['Parmesan','🧀','milch'],['Feta','🧀','milch'],
  ['Hafermilch','🥛','milch'],['Skyr','🥣','milch'],

  ['Hähnchen','🍗','fleisch'],['Hackfleisch','🥩','fleisch'],['Rindfleisch','🥩','fleisch'],
  ['Schweinefleisch','🥩','fleisch'],['Aufschnitt','🥓','fleisch'],['Schinken','🥓','fleisch'],
  ['Speck','🥓','fleisch'],['Würstchen','🌭','fleisch'],['Lachs','🐟','fleisch'],['Thunfisch','🐟','fleisch'],
  ['Fischstäbchen','🐟','fleisch'],['Garnelen','🦐','fleisch'],['Tofu','🧊','fleisch'],

  ['Nudeln','🍝','vorrat'],['Reis','🍚','vorrat'],['Mehl','🌾','vorrat'],['Zucker','🍬','vorrat'],
  ['Salz','🧂','vorrat'],['Pfeffer','🧂','vorrat'],['Gewürze','🧂','vorrat'],['Öl','🫒','vorrat'],
  ['Essig','🍶','vorrat'],['Tomatensoße','🥫','vorrat'],['Passierte Tomaten','🥫','vorrat'],
  ['Mais (Dose)','🥫','vorrat'],['Bohnen','🥫','vorrat'],['Linsen','🫘','vorrat'],['Kichererbsen','🫘','vorrat'],
  ['Haferflocken','🥣','vorrat'],['Müsli','🥣','vorrat'],['Cornflakes','🥣','vorrat'],['Honig','🍯','vorrat'],
  ['Marmelade','🍓','vorrat'],['Nussaufstrich','🥜','vorrat'],['Senf','🌭','vorrat'],['Ketchup','🍅','vorrat'],
  ['Mayonnaise','🥚','vorrat'],['Brühe','🍲','vorrat'],['Backpulver','🧁','vorrat'],['Couscous','🍚','vorrat'],

  ['TK-Gemüse','🧊','tk'],['TK-Beeren','🧊','tk'],['Pizza','🍕','tk'],['Eis','🍨','tk'],
  ['TK-Pommes','🍟','tk'],['TK-Kräuter','🌿','tk'],

  ['Schokolade','🍫','suess'],['Kekse','🍪','suess'],['Chips','🥔','suess'],['Nüsse','🥜','suess'],
  ['Gummibärchen','🍬','suess'],['Riegel','🍫','suess'],['Salzstangen','🥨','suess'],['Popcorn','🍿','suess'],

  ['Wasser','💧','getraenke'],['Sprudel','🫧','getraenke'],['Saft','🧃','getraenke'],['Cola','🥤','getraenke'],
  ['Kaffee','☕','getraenke'],['Tee','🍵','getraenke'],['Bier','🍺','getraenke'],['Wein','🍷','getraenke'],
  ['Milchkaffee','☕','getraenke'],['Limonade','🥤','getraenke'],

  ['Spülmittel','🧼','haushalt'],['Waschmittel','🧺','haushalt'],['Klopapier','🧻','haushalt'],
  ['Küchenrolle','🧻','haushalt'],['Müllbeutel','🗑️','haushalt'],['Zahnpasta','🪥','haushalt'],
  ['Shampoo','🧴','haushalt'],['Duschgel','🧴','haushalt'],['Seife','🧼','haushalt'],
  ['Taschentücher','🤧','haushalt'],['Alufolie','🌀','haushalt'],['Frischhaltefolie','🌀','haushalt'],
  ['Schwämme','🧽','haushalt'],['Batterien','🔋','haushalt'],['Blumen','💐','haushalt'],

  ['Windeln','🧷','baby'],['Feuchttücher','🧻','baby'],['Pre-Nahrung','🍼','baby'],
  ['Babybrei','🥣','baby'],['Wundcreme','🧴','baby'],['Stilleinlagen','🤱','baby']
];

var QUICK_MAX_RECENT=12;
var _editId=null;
var _catQuery='';
var _showDone=false;

// encodeURIComponent lässt `'` stehen – in einem einfach gequoteten JS-String
// im onclick-Attribut würde das den Aufruf sprengen. Deshalb mit-kodieren.
function enc(s){return encodeURIComponent(String(s==null?'':s)).replace(/'/g,'%27');}
function uid(){return 's'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

// Revisionsnummer für den Sync: streng monoton, auch wenn die Geräteuhr
// zurückspringt (Zeitzone, manuelle Korrektur) – sonst „gewinnt" beim Merge
// eine ältere Änderung.
var _lastRev=0;
function nextRev(){
  var r=Math.max(Date.now(),_lastRev+1);
  _lastRev=r;
  return r;
}

function list(){
  if(!Array.isArray(S.shopList))S.shopList=[];
  return S.shopList;
}
function byId(id){
  var a=list();
  for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];
  return null;
}
function norm(s){
  return String(s||'').toLowerCase().trim()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ');
}
function findByName(name){
  var n=norm(name);
  if(!n)return null;
  var a=list();
  for(var i=0;i<a.length;i++)if(norm(a[i].n)===n)return a[i];
  return null;
}
function openItems(){return list().filter(function(i){return !i.d;});}
function doneItems(){return list().filter(function(i){return !!i.d;});}

// Kategorie und Symbol aus dem Katalog raten – erst exakt, dann als Wortteil.
// „2 Liter Milch" soll bei „Milch" landen, „Milchreis" aber nicht.
function guess(name){
  var n=norm(name);
  if(!n)return {c:'sonst',ic:'🛒'};
  var i,e;
  for(i=0;i<CATALOG.length;i++){
    e=CATALOG[i];
    if(norm(e[0])===n)return {c:e[2],ic:e[1]};
  }
  var words=n.split(' ');
  for(i=0;i<CATALOG.length;i++){
    e=CATALOG[i];
    var cn=norm(e[0]);
    if(words.indexOf(cn)>=0)return {c:e[2],ic:e[1]};
  }
  for(i=0;i<CATALOG.length;i++){
    e=CATALOG[i];
    var c2=norm(e[0]);
    if(c2.length>=5&&n.indexOf(c2)>=0)return {c:e[2],ic:e[1]};
  }
  return {c:'sonst',ic:'🛒'};
}

// ── Zuletzt benutzt: rein lokal, nicht Teil des Syncs ──
function recent(){
  if(!Array.isArray(S.shopRecent))S.shopRecent=[];
  return S.shopRecent;
}
function noteRecent(item){
  var r=recent();
  var n=norm(item.n);
  for(var i=r.length-1;i>=0;i--)if(norm(r[i].n)===n)r.splice(i,1);
  r.unshift({n:item.n,ic:item.ic||'🛒',c:item.c||'sonst'});
  if(r.length>40)r.length=40;
}

// ── Herkunft eines Artikels ──
// `rc` = Rezepte, die diesen Artikel angefordert haben; `pre` = der Artikel
// stand schon auf dem Zettel, bevor das erste Rezept ihn brauchte. Beides zählt
// im Laden: „Zwiebeln wollte ich sowieso — und brauche sie jetzt auch für die
// Lasagne" ist eine andere Information als „steht nur wegen der Lasagne drauf".
function tagSource(it,recipe,existed){
  recipe=String(recipe||'').trim();
  if(!recipe)return;
  if(!Array.isArray(it.rc))it.rc=[];
  if(existed&&!it.rc.length&&!it.pre)it.pre=1;
  var n=norm(recipe);
  for(var i=0;i<it.rc.length;i++)if(norm(it.rc[i])===n)return;
  it.rc.push(recipe);
  if(it.rc.length>8)it.rc.shift();
}
function srcLine(it){
  var parts=[];
  if(it.pre)parts.push('war vorher schon da');
  if(it.rc&&it.rc.length)parts.push('für '+it.rc.join(', '));
  return parts.join(' · ');
}

// Menge aus zwei Quellen zusammenführen. Gleiche Einheit → addieren, sonst
// nebeneinander stehen lassen: lieber sichtbar doppelt („1 Packung + 200 g")
// als eine stillschweigend überschriebene Menge, mit der zu wenig im Wagen
// landet.
function parseQty(s){
  var m=String(s||'').match(/^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜß]*)\.?\s*$/);
  if(!m)return null;
  // `u` vergleicht (klein), `raw` schreibt zurück – sonst würde aus „2 EL"
  // beim Addieren „4 el".
  return {v:parseFloat(m[1].replace(',','.')),u:(m[2]||'').toLowerCase(),raw:m[2]||''};
}
function mergeQty(a,b){
  a=String(a||'').trim();b=String(b||'').trim();
  if(!a)return b;
  if(!b)return a;
  if(norm(a)===norm(b))return a;
  var rb=parseQty(b);
  // Die vorhandene Menge kann selbst schon zusammengesetzt sein („2 Stück + 150 g").
  // Deshalb teilweise addieren: den Teil mit gleicher Einheit erhöhen, den Rest
  // stehen lassen.
  var parts=a.split(' + ');
  if(rb){
    for(var i=0;i<parts.length;i++){
      var ra=parseQty(parts[i]);
      if(ra&&ra.u===rb.u){
        parts[i]=String(Math.round((ra.v+rb.v)*100)/100).replace('.',',')+(ra.raw?' '+ra.raw:'');
        return parts.join(' + ');
      }
    }
  }
  for(var j=0;j<parts.length;j++)if(norm(parts[j])===norm(b))return a;
  return a+' + '+b;
}

// ════════ Schreiben ════════
// opts: {recipe:'Rezeptname', mergeQty:true} — beides nur beim Rezept-Import.
function add(name,qty,c,ic,opts){
  name=String(name||'').trim();
  if(!name)return null;
  opts=opts||{};
  // `opts.id` kommt vom Alexa-Einwurf: beide Telefone holen denselben Einwurf
  // ab und sollen daraus EINEN Artikel machen. Ist er schon da — per Sync vom
  // anderen Gerät oder aus einem früheren Lauf — wird nichts angelegt.
  var ex=(opts.id&&byId(opts.id))||findByName(name);
  if(ex){
    // Schon auf dem Zettel: abgehakt → wieder aktiv, sonst nur Menge ergänzen.
    if(ex.d){ex.d=0;delete ex.da;}
    if(qty)ex.q=opts.mergeQty?mergeQty(ex.q,qty):qty;
    if(opts.recipe)tagSource(ex,opts.recipe,true);
    ex.rev=nextRev();
    saveS();Sync.schedule();render();
    return ex;
  }
  var g=guess(name);
  var it={id:opts.id||uid(),n:name,q:qty||'',c:c||g.c,ic:ic||g.ic,d:0,ts:Date.now(),rev:nextRev()};
  if(opts.recipe)tagSource(it,opts.recipe,false);
  list().push(it);
  noteRecent(it);
  saveS();Sync.schedule();render();
  return it;
}
function toggle(id){
  var it=byId(id);
  if(!it)return;
  it.d=it.d?0:1;
  if(it.d)it.da=Date.now();else delete it.da;
  it.rev=nextRev();
  saveS();Sync.schedule();render();
}
function remove(id){
  var a=list();
  for(var i=0;i<a.length;i++){
    if(a[i].id===id){
      a.splice(i,1);
      // Grabstein, damit die Löschung auch auf dem anderen Gerät ankommt
      S.shopTomb=S.shopTomb||{};
      S.shopTomb[id]={rev:nextRev()};
      saveS();Sync.schedule();render();
      return;
    }
  }
}
function clearDone(){
  var d=doneItems();
  if(!d.length){showToast('Nichts abgehakt');return;}
  if(!confirm('Alle '+d.length+' abgehakten Artikel vom Zettel entfernen?'))return;
  d.forEach(function(it){remove(it.id);});
  showToast('Erledigte entfernt ✓');
}
// Mehrere Artikel auf einmal (z. B. Zutaten eines Rezepts)
function addMany(items){
  var n=0;
  (items||[]).forEach(function(it){
    if(!it||!it.n)return;
    if(add(it.n,it.q||'',it.c||'',it.ic||''))n++;
  });
  return n;
}

// ════════════════════════════════════════
// SYNC – Einkaufszettel zwischen zwei Geräten
// ════════════════════════════════════════
// Übertragen werden ausschließlich die Artikel dieses Zettels und Löschmarken –
// keine Mahlzeiten, keine Kalorien, kein Gewicht, kein Profil, kein Tagebuch.
//
// Der Kopplungs-Code besteht aus zwei Teilen: `raum.schluessel`. Der Raum
// adressiert den Briefkasten beim Worker, der Schlüssel entschlüsselt die
// Inhalte und wird NIE gesendet. Wer nur den Raum kennt, sieht Chiffrat.
var Sync=(function(){
  var API=(typeof PROJECT_WORKER_BASE!=='undefined'?PROJECT_WORKER_BASE:'')+'/shop/sync';
  var POLL_MS=30000;   // solange der Zettel offen ist – im Laden zählt Aktualität
  var DEBOUNCE_MS=1200;
  var _timer=null,_poll=null,_busy=false,_key=null,_keyFor='';

  function st(){
    S.shopSync=S.shopSync||{on:false,room:'',key:'',since:0,lastAt:0,lastErr:''};
    return S.shopSync;
  }
  function active(){var c=st();return !!(c.on&&c.room&&c.key);}
  // Neue Kopplung: alle Quittungen verwerfen, damit der komplette lokale
  // Bestand einmal in den neuen Raum hochgeladen wird.
  function resetAcks(){
    list().forEach(function(it){delete it._sy;});
    S.shopTomb=S.shopTomb||{};
    Object.keys(S.shopTomb).forEach(function(id){if(S.shopTomb[id])delete S.shopTomb[id].sy;});
  }
  function cryptoOk(){return !!(window.crypto&&crypto.subtle&&window.TextEncoder);}

  function rand(n){
    var a=crypto.getRandomValues(new Uint8Array(n)),s='';
    var abc='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for(var i=0;i<n;i++)s+=abc[a[i]%abc.length];
    return s;
  }
  function b64(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
  function b64d(s){var bin=atob(s),b=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b;}

  // Schlüssel deterministisch aus dem Code ableiten – beide Geräte kommen mit
  // demselben Code auf denselben AES-Schlüssel, ohne ihn je zu übertragen.
  // Eigenes Salt-Präfix: selbst wenn jemand denselben Code auch fürs
  // Baby-Tagebuch benutzt, sind die Schlüssel verschieden.
  function getKey(){
    var c=st();
    var tag=c.room+'|'+c.key;
    if(_key&&_keyFor===tag)return Promise.resolve(_key);
    return crypto.subtle.importKey('raw',new TextEncoder().encode(c.key),'PBKDF2',false,['deriveKey'])
      .then(function(km){
        return crypto.subtle.deriveKey(
          {name:'PBKDF2',salt:new TextEncoder().encode('nutritrack-shop|'+c.room),iterations:100000,hash:'SHA-256'},
          km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      }).then(function(k){_key=k;_keyFor=tag;return k;});
  }
  function encRec(id,rev,payload){
    var iv=crypto.getRandomValues(new Uint8Array(12));
    return getKey().then(function(k){
      return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,new TextEncoder().encode(JSON.stringify(payload)));
    }).then(function(ct){return {id:id,rev:rev,iv:b64(iv),ct:b64(ct)};});
  }
  function decRec(rec){
    return getKey().then(function(k){
      return crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(rec.iv)},k,b64d(rec.ct));
    }).then(function(buf){return JSON.parse(new TextDecoder().decode(buf));})
      .catch(function(){return null;});// fremder/kaputter Record → überspringen
  }

  function code(){var c=st();return c.room&&c.key?(c.room+'.'+c.key):'';}
  function createRoom(){
    if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return false;}
    var c=st();
    c.room=rand(32);c.key=rand(24);c.on=true;c.since=0;c.lastErr='';resetAcks();
    _key=null;_keyFor='';
    saveS();
    run(true);
    return true;
  }
  function joinRoom(raw){
    if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return false;}
    var parts=String(raw||'').trim().replace(/\s+/g,'').split('.');
    if(parts.length!==2||!/^[A-Za-z0-9_-]{24,64}$/.test(parts[0])||parts[1].length<16){
      showToast('Code sieht nicht gültig aus');
      return false;
    }
    var c=st();
    c.room=parts[0];c.key=parts[1];c.on=true;c.since=0;c.lastErr='';resetAcks();
    _key=null;_keyFor='';
    saveS();
    run(true);
    return true;
  }
  function disconnect(){
    var c=st();
    c.on=false;c.room='';c.key='';c.since=0;c.lastErr='';
    _key=null;_keyFor='';
    stopPoll();
    saveS();
    renderSyncUI();
    showToast('Verbindung getrennt – der Zettel bleibt auf diesem Gerät');
  }

  // Was ist lokal neuer als das, was der Server bestätigt hat?
  // Bewusst pro Artikel (`_sy` = quittierte Revision) statt einer globalen
  // Hochwassermarke: Bei zwei Geräten mit leicht unterschiedlichen Uhren wäre
  // eine gemeinsame Marke schon durch einen fremden, höheren Zeitstempel
  // überholt — eigene, ältere Änderungen würden dann nie hochgeladen.
  function pending(){
    var out=[];
    list().forEach(function(it){
      if((it.rev||0)>(it._sy||0))out.push({id:it.id,rev:it.rev,it:it});
    });
    S.shopTomb=S.shopTomb||{};
    Object.keys(S.shopTomb).forEach(function(id){
      var t=S.shopTomb[id];
      if(t&&(t.rev||0)>(t.sy||0))out.push({id:id,rev:t.rev,tomb:t});
    });
    return out.sort(function(a,b){return a.rev-b.rev;});
  }
  // `_sy` ist eine rein lokale Buchhaltung und gehört nicht ins Chiffrat.
  function strip(it){
    var c={};
    Object.keys(it).forEach(function(k){if(k!=='_sy')c[k]=it[k];});
    return c;
  }

  // „HTTP 503" sagt niemandem etwas. Der Service Worker macht aus JEDEM
  // Netzwerk- oder CORS-Fehler auf workers.dev eine 503 – die häufigste
  // Ursache ist also nicht „Server kaputt", sondern offline oder ein Worker,
  // der den Endpoint noch nicht kennt.
  function errText(err){
    var m=(err&&err.message)||'Fehler';
    if(m.indexOf('503')>=0)return 'Server nicht erreichbar – offline oder der Worker ist noch nicht aktualisiert';
    if(m.indexOf('404')>=0)return 'Der Worker kennt den Einkaufszettel noch nicht – bitte aktualisieren';
    if(m.indexOf('401')>=0)return 'Kopplungs-Code wird nicht akzeptiert';
    if(m.indexOf('403')>=0)return 'Zugriff abgelehnt';
    if(m.indexOf('413')>=0)return 'Zu viele Änderungen auf einmal';
    return m;
  }

  function push(){
    var c=st();
    var items=pending();
    if(!items.length)return Promise.resolve(0);
    items=items.slice(0,200);// Worker-Limit
    return Promise.all(items.map(function(x){
      return encRec(x.id,x.rev,{i:x.it?strip(x.it):null});
    }))
      .then(function(recs){
        return fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Shop-Room':c.room},body:JSON.stringify({records:recs})});
      })
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(){
        // Erst nach bestätigtem Upload quittieren – bei Abbruch wird alles
        // beim nächsten Lauf erneut gesendet.
        items.forEach(function(x){
          if(x.it)x.it._sy=x.rev;
          else if(x.tomb)x.tomb.sy=x.rev;
        });
        saveS();
        return items.length;
      });
  }

  function pull(){
    var c=st();
    return fetch(API+'?since='+encodeURIComponent(c.since||0),{headers:{'X-Shop-Room':c.room}})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(j){
        var d=(j&&j.data)||{};
        var recs=d.records||[];
        if(!recs.length){if(d.cursor)c.since=Math.max(c.since||0,d.cursor);return 0;}
        return Promise.all(recs.map(decRec)).then(function(payloads){
          var applied=0;
          payloads.forEach(function(pl,i){
            if(pl&&apply(recs[i].id,recs[i].rev,pl))applied++;
          });
          if(d.cursor)c.since=Math.max(c.since||0,d.cursor);
          if(applied)saveS();
          return applied;
        });
      });
  }

  // Merge: höhere rev gewinnt. Gilt für Artikel und Löschmarken gleichermaßen.
  function apply(id,rev,payload){
    S.shopTomb=S.shopTomb||{};
    var tomb=S.shopTomb[id];
    if(tomb&&(tomb.rev||0)>=rev)return false;// lokal später gelöscht
    var a=list();
    var idx=-1;
    for(var i=0;i<a.length;i++)if(a[i].id===id){idx=i;break;}
    if(idx>=0&&(a[idx].rev||0)>=rev)return false;// lokal neuer
    if(idx>=0)a.splice(idx,1);
    if(payload.i===null||payload.i===undefined){
      // sy=rev: kam vom Server, muss nicht zurückgeschickt werden
      S.shopTomb[id]={rev:rev,sy:rev};
      return true;
    }
    if(tomb)delete S.shopTomb[id];
    var it=payload.i;
    it.id=id;it.rev=rev;it._sy=rev;
    a.push(it);
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }

  function run(force){
    if(!active()||!cryptoOk())return Promise.resolve();
    if(_busy&&!force)return Promise.resolve();
    _busy=true;
    var c=st();
    return push()
      .then(pull)
      .then(function(applied){
        c.lastAt=Date.now();c.lastErr='';
        saveS();
        if(applied)render();
        renderSyncUI();
      })
      .catch(function(err){
        // Offline oder Worker nicht erreichbar: Quittungen bleiben stehen,
        // beim nächsten Versuch wird alles Offene nachgeholt.
        c.lastErr=errText(err);
        saveS();
        renderSyncUI();
      })
      .then(function(){_busy=false;});
  }

  function schedule(){
    if(!active())return;
    clearTimeout(_timer);
    _timer=setTimeout(function(){run();},DEBOUNCE_MS);
  }
  function startPoll(){
    if(!active())return;
    stopPoll();
    _poll=setInterval(function(){if(isOpen('shopOv')||isOpen('shopAddOv'))run();else stopPoll();},POLL_MS);
  }
  function stopPoll(){if(_poll){clearInterval(_poll);_poll=null;}}

  function statusText(){
    var c=st();
    if(!active())return 'Nicht verbunden – der Zettel bleibt nur auf diesem Gerät.';
    if(c.lastErr)return '⚠️ Abgleich fehlgeschlagen: '+c.lastErr+'. Wird automatisch erneut versucht.';
    if(!c.lastAt)return 'Verbunden – noch kein Abgleich gelaufen.';
    var mins=Math.round((Date.now()-c.lastAt)/60000);
    return '✓ Verbunden · letzter Abgleich '+(mins<1?'gerade eben':'vor '+mins+' Min.');
  }

  return {
    st:st,active:active,code:code,createRoom:createRoom,joinRoom:joinRoom,
    disconnect:disconnect,run:run,schedule:schedule,startPoll:startPoll,
    stopPoll:stopPoll,statusText:statusText,cryptoOk:cryptoOk
  };
})();

function isOpen(id){
  var el=document.getElementById(id);
  return !!(el&&el.classList.contains('open'));
}

// ── Sync-Oberfläche ──
function openSync(){renderSyncUI();openOv('shopSyncOv');}
function renderSyncUI(){
  var on=Sync.active();
  var stat=document.getElementById('shopSyncStatus');
  if(stat)stat.textContent=Sync.statusText();
  var setup=document.getElementById('shopSyncSetup');
  if(setup)setup.style.display=on?'none':'block';
  var live=document.getElementById('shopSyncLive');
  if(live)live.style.display=on?'block':'none';
  var codeEl=document.getElementById('shopSyncCode');
  if(codeEl)codeEl.textContent=Sync.code()||'';
  var badge=document.getElementById('shopSyncBadge');
  if(badge)badge.style.display=on?'':'none';
}
function copySyncCode(){
  var c=Sync.code();
  if(!c)return;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(c).then(function(){showToast('Code kopiert ✓');},function(){showToast('Kopieren nicht möglich – Code markieren');});
  }else showToast('Kopieren nicht möglich – Code markieren');
}
function shareSyncCode(){
  var c=Sync.code();
  if(!c)return;
  if(navigator.share)navigator.share({title:'NutriTrack Einkaufszettel',text:c}).catch(function(){});
  else copySyncCode();
}
function createSyncRoom(){if(Sync.createRoom()){renderSyncUI();showToast('Verbunden – jetzt den Code am zweiten Gerät eingeben');}}
function joinSyncRoom(){
  var inp=document.getElementById('shopSyncJoinCode');
  if(!inp)return;
  if(Sync.joinRoom(inp.value)){inp.value='';renderSyncUI();showToast('Verbunden – der Zettel wird abgeglichen');}
}
function syncNow(){
  if(!Sync.active()){showToast('Erst ein Gerät verbinden');return;}
  showToast('Wird abgeglichen …');
  Sync.run(true).then(function(){render();renderSyncUI();});
}
function disconnectSync(){
  if(!confirm('Verbindung trennen? Der Zettel auf diesem Gerät bleibt erhalten, es wird nur nichts mehr abgeglichen.'))return;
  Sync.disconnect();
}

// ════════ Heute-Kachel ════════
function renderCard(){
  var card=document.getElementById('shopCard');
  if(!card)return;
  var op=openItems();
  // Kachel nur zeigen, wenn sie etwas zu sagen hat – ein leerer Zettel soll den
  // Heute-Tab nicht zustellen.
  if(!op.length&&!list().length){card.style.display='none';return;}
  card.style.display='';
  var v=document.getElementById('shopCardVal');
  if(v)v.textContent=op.length?(op.length+(op.length===1?' Artikel':' Artikel')):'alles erledigt ✓';
  var body=document.getElementById('shopCardBody');
  if(body){
    if(!op.length){
      body.innerHTML='<div style="font-size:12px;color:var(--mu);">Nichts mehr offen.</div>';
    }else{
      var shown=op.slice(0,6).map(function(it){
        return '<span style="display:inline-block;background:var(--gl);border:1px solid var(--br);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;margin:0 4px 4px 0;">'+esc((it.ic||'🛒')+' '+it.n)+'</span>';
      }).join('');
      body.innerHTML=shown+(op.length>6?'<span style="font-size:11px;color:var(--mu);font-weight:700;">+'+(op.length-6)+' weitere</span>':'');
    }
  }
}
function renderHubRow(){
  var sub=document.getElementById('shopHubSub');
  if(!sub)return;
  var op=openItems().length;
  sub.textContent=op?(op+' offen'+(Sync.active()?' · geteilt':'')):('Leer'+(Sync.active()?' · geteilt':''));
}

// ════════ Zettel-Overlay ════════
function openList(){
  // Reihenfolge ist entscheidend: render() zeichnet die Liste nur, wenn shopOv
  // schon die Klasse .open trägt (isOpen-Wächter in render()). Wurde vorher
  // gerendert, lief renderList() ins Leere — der Zettel blieb blank und der
  // Untertitel stand auf dem statischen „Noch nichts drauf" aus index.html,
  // obwohl Artikel drauf waren. Erst öffnen, dann rendern.
  openOv('shopOv');
  render();
  Sync.run();
  Sync.startPoll();
}
function closeList(){Sync.stopPoll();closeOv('shopOv');}

function render(){
  renderCard();
  renderHubRow();
  if(isOpen('shopOv'))renderList();
  if(isOpen('shopAddOv'))renderCatalog();
}

function itemRow(it,done){
  var box=done
    ?'<div style="width:22px;height:22px;border-radius:7px;background:var(--g2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">✓</div>'
    :'<div style="width:22px;height:22px;border-radius:7px;border:2px solid var(--br);flex-shrink:0;"></div>';
  var nameStyle=done?'font-weight:700;font-size:13px;text-decoration:line-through;color:var(--mu);':'font-weight:700;font-size:14px;';
  var src=srcLine(it);
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--br);">'
    +'<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;" onclick="NTShop.toggle(\''+it.id+'\')">'
      +box
      +'<div style="font-size:19px;flex-shrink:0;">'+esc(it.ic||'🛒')+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="'+nameStyle+'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(it.n)+'</div>'
        +(it.q?'<div style="font-size:11px;color:var(--mu);margin-top:1px;">'+esc(it.q)+'</div>':'')
        +(src?'<div style="font-size:10px;color:var(--mu);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic;">'+esc(src)+'</div>':'')
      +'</div>'
    +'</div>'
    +'<button type="button" onclick="NTShop.openItem(\''+it.id+'\')" style="background:none;border:none;font-size:15px;color:var(--mu);padding:4px 2px;cursor:pointer;flex-shrink:0;">✏️</button>'
    +'</div>';
}

function renderList(){
  renderSyncUI();
  var el=document.getElementById('shopList');
  if(!el)return;
  var op=openItems();
  var dn=doneItems();
  var sub=document.getElementById('shopOvSub');
  if(sub)sub.textContent=op.length?(op.length+' offen'+(dn.length?' · '+dn.length+' erledigt':'')):(dn.length?'Alles erledigt ✓':'Noch nichts drauf');

  var html='';
  if(!op.length){
    html+='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">'
      +(dn.length?'Alles abgehakt – schöner Einkauf! 🎉':'Der Zettel ist leer. Tippe oben etwas ein oder wähle unten aus den Artikeln.')
      +'</div>';
  }else{
    var groups={};
    op.forEach(function(it){
      var c=it.c||'sonst';
      (groups[c]=groups[c]||[]).push(it);
    });
    Object.keys(groups).sort(function(a,b){return catOrder(a)-catOrder(b);}).forEach(function(cid){
      var c=cat(cid);
      html+='<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:14px 2px 2px;">'+esc(c.ic+' '+c.label)+'</div>';
      groups[cid].sort(function(a,b){return (a.ts||0)-(b.ts||0);}).forEach(function(it){html+=itemRow(it,false);});
    });
  }

  if(dn.length){
    html+='<button type="button" onclick="NTShop.toggleDone()" style="width:100%;text-align:left;background:none;border:none;font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:18px 0 2px;padding:6px 2px;cursor:pointer;">'
      +(_showDone?'▾':'▸')+' Erledigt ('+dn.length+')</button>';
    if(_showDone){
      dn.sort(function(a,b){return (b.da||0)-(a.da||0);}).forEach(function(it){html+=itemRow(it,true);});
      html+='<button type="button" class="seb" onclick="NTShop.clearDone()" style="color:#c62828;">🗑 Erledigte entfernen</button>';
    }
  }
  el.innerHTML=html;
}
function toggleDone(){_showDone=!_showDone;renderList();}

// ── Eingabefeld oben: Freitext + Vorschläge ──
function submitInput(){
  var inp=document.getElementById('shopInput');
  if(!inp)return;
  var raw=inp.value.trim();
  if(!raw)return;
  // „2 Liter Milch" / „Milch 2 Liter" → Name und Menge trennen, damit die
  // Kategorie-Erkennung auf dem reinen Namen arbeitet.
  var parsed=splitQty(raw);
  add(parsed.n,parsed.q);
  inp.value='';
  suggest();
  inp.focus();
}
function splitQty(raw){
  var m=raw.match(/^\s*(\d+[\d.,]*\s*(?:x|St(?:ü|ue)ck|Stk|g|kg|ml|l|Liter|Pack(?:ung)?|Dose|Dosen|Glas|Gl(?:ä|ae)ser|Becher|Flasche[n]?|Beutel|Bund|EL|TL)?)\s+(.+)$/i);
  if(m&&m[2])return {q:m[1].trim(),n:m[2].trim()};
  var m2=raw.match(/^(.+?)\s+(\d+[\d.,]*\s*(?:x|St(?:ü|ue)ck|Stk|g|kg|ml|l|Liter|Pack(?:ung)?|Dose|Dosen|Glas|Becher|Flasche[n]?|Beutel|Bund|EL|TL))\s*$/i);
  if(m2&&m2[1])return {q:m2[2].trim(),n:m2[1].trim()};
  return {q:'',n:raw};
}
// Vorschläge: Katalog + zuletzt benutzt + eigene Lebensmittel/Rezepte
function suggestions(q){
  var n=norm(q);
  if(!n)return [];
  var out=[],seen={};
  function push(name,ic,c){
    var k=norm(name);
    if(!k||seen[k])return;
    seen[k]=1;
    out.push({n:name,ic:ic||'🛒',c:c||guess(name).c});
  }
  recent().forEach(function(r){if(norm(r.n).indexOf(n)>=0)push(r.n,r.ic,r.c);});
  CATALOG.forEach(function(e){if(norm(e[0]).indexOf(n)>=0)push(e[0],e[1],e[2]);});
  try{
    if(typeof customFoods!=='undefined'&&customFoods)
      customFoods.forEach(function(f){if(norm(f.name).indexOf(n)>=0)push(f.name,f.emoji||'🥗','');});
    if(typeof recipes!=='undefined'&&recipes)
      recipes.forEach(function(r){
        (r.ingredients||[]).forEach(function(i){if(norm(i.name).indexOf(n)>=0)push(i.name,i.emoji||'🍽','');});
      });
  }catch(e){}
  return out.slice(0,8);
}
function suggest(){
  var inp=document.getElementById('shopInput');
  var box=document.getElementById('shopSuggest');
  if(!inp||!box)return;
  var s=suggestions(inp.value);
  if(!s.length){box.style.display='none';box.innerHTML='';return;}
  box.style.display='block';
  box.innerHTML=s.map(function(x){
    var on=!!findByName(x.n);
    return '<button type="button" class="stab'+(on?' act':'')+'" style="margin:0 6px 6px 0;" onclick="NTShop.addFromSuggest(\''+enc(x.n)+'\',\''+enc(x.ic)+'\',\''+esc(x.c)+'\')">'+esc(x.ic+' '+x.n)+(on?' ✓':'')+'</button>';
  }).join('');
}
function addFromSuggest(n,ic,c){
  add(decodeURIComponent(n),'',c,decodeURIComponent(ic));
  var inp=document.getElementById('shopInput');
  if(inp){inp.value='';inp.focus();}
  suggest();
  showToast('Auf dem Zettel ✓');
}
function inputKey(ev){
  if(ev&&(ev.key==='Enter'||ev.keyCode===13)){ev.preventDefault();submitInput();}
  else setTimeout(suggest,0);
}

// ════════ Artikel-Auswahl (Kacheln) ════════
function openCatalog(){
  _catQuery='';
  var q=document.getElementById('shopCatQ');
  if(q)q.value='';
  openOv('shopAddOv');
  renderCatalog();
  Sync.startPoll();
}
function catalogQuery(v){_catQuery=v||'';renderCatalog();}
function renderCatalog(){
  var el=document.getElementById('shopCatalog');
  if(!el)return;
  var n=norm(_catQuery);
  var html='';
  function tiles(items){
    return items.map(function(x){
      var on=!!findByName(x.n);
      var bg=on?'background:var(--gl);border-color:var(--g2);':'background:white;border-color:var(--br);';
      return '<button type="button" onclick="NTShop.tileTap(\''+enc(x.n)+'\',\''+enc(x.ic)+'\',\''+esc(x.c)+'\')" '
        +'style="'+bg+'border-width:1.5px;border-style:solid;border-radius:14px;padding:8px 4px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;position:relative;">'
        +'<span style="font-size:22px;line-height:1;">'+esc(x.ic)+'</span>'
        +'<span style="font-size:10px;font-weight:700;color:var(--tx);text-align:center;line-height:1.2;word-break:break-word;">'+esc(x.n)+'</span>'
        +(on?'<span style="position:absolute;top:3px;right:5px;font-size:11px;color:var(--g2);">✓</span>':'')
        +'</button>';
    }).join('');
  }
  var grid='display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;';

  var rec=recent().slice(0,QUICK_MAX_RECENT).filter(function(r){return !n||norm(r.n).indexOf(n)>=0;});
  if(rec.length){
    html+='<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:4px 2px 6px;">🕘 Zuletzt</div>';
    html+='<div style="'+grid+'">'+tiles(rec.map(function(r){return {n:r.n,ic:r.ic,c:r.c};}))+'</div>';
  }
  CATS.forEach(function(c){
    var items=CATALOG.filter(function(e){return e[2]===c.id&&(!n||norm(e[0]).indexOf(n)>=0);})
      .map(function(e){return {n:e[0],ic:e[1],c:e[2]};});
    if(!items.length)return;
    html+='<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;margin:12px 2px 6px;">'+esc(c.ic+' '+c.label)+'</div>';
    html+='<div style="'+grid+'">'+tiles(items)+'</div>';
  });
  if(n&&!CATALOG.some(function(e){return norm(e[0]).indexOf(n)>=0;})){
    html+='<button type="button" class="svb" onclick="NTShop.addCatQuery()">＋ „'+esc(_catQuery)+'" aufnehmen</button>';
  }
  el.innerHTML=html;
}
// Kachel: erster Tipp legt an, zweiter nimmt wieder runter – wie bei Bring.
function tileTap(n,ic,c){
  var name=decodeURIComponent(n);
  var ex=findByName(name);
  if(ex&&!ex.d){remove(ex.id);showToast('Wieder runter');return;}
  add(name,'',c,decodeURIComponent(ic));
  showToast('Auf dem Zettel ✓');
}
function addCatQuery(){
  if(!_catQuery.trim())return;
  var p=splitQty(_catQuery.trim());
  add(p.n,p.q);
  _catQuery='';
  var q=document.getElementById('shopCatQ');
  if(q)q.value='';
  renderCatalog();
  showToast('Auf dem Zettel ✓');
}

// ════════ Artikel bearbeiten ════════
function openItem(id){
  var it=byId(id);
  if(!it)return;
  _editId=id;
  document.getElementById('shopItemName').value=it.n||'';
  document.getElementById('shopItemQty').value=it.q||'';
  document.getElementById('shopItemIcon').value=it.ic||'🛒';
  var sel=document.getElementById('shopItemCat');
  sel.innerHTML=CATS.map(function(c){return '<option value="'+c.id+'">'+esc(c.ic+' '+c.label)+'</option>';}).join('');
  sel.value=it.c||'sonst';
  var info=document.getElementById('shopItemSrc');
  if(info){
    var src=srcLine(it);
    info.innerHTML=src
      ?'<div style="background:var(--gl);border:1px solid var(--br);border-radius:10px;padding:8px 10px;font-size:11px;color:var(--mu);margin-top:10px;">🧾 '+esc(src)+'</div>'
      :'';
  }
  openOv('shopItemOv');
}
function saveItem(){
  var it=_editId?byId(_editId):null;
  if(!it){closeOv('shopItemOv');return;}
  var n=document.getElementById('shopItemName').value.trim();
  if(!n){showToast('Bitte einen Namen angeben');return;}
  it.n=n;
  it.q=document.getElementById('shopItemQty').value.trim();
  it.c=document.getElementById('shopItemCat').value||'sonst';
  it.ic=document.getElementById('shopItemIcon').value.trim()||'🛒';
  it.rev=nextRev();
  noteRecent(it);
  saveS();Sync.schedule();render();
  _editId=null;
  closeOv('shopItemOv');
  showToast('Gespeichert ✓');
}
function deleteItem(){
  if(!_editId)return;
  remove(_editId);
  _editId=null;
  closeOv('shopItemOv');
  showToast('Entfernt');
}

// ════════ Rezept-Zutaten übernehmen ════════
// Zutaten aus beliebiger Quelle (gespeichertes Rezept oder frischer Link-Import)
// auf den Zettel legen. Vorhandene Artikel werden nicht dupliziert, sondern
// bekommen das Rezept als Herkunft angehängt und ihre Menge aufaddiert.
// Rückgabe: {added, merged, total} für eine ehrliche Rückmeldung.
function addIngredients(ings,recipeName){
  var added=0,merged=0;
  (ings||[]).forEach(function(ing){
    if(!ing)return;
    var nm=String(ing.name||ing.n||'').trim();
    if(!nm)return;
    var q=ing.q||(ing.amount?Math.round(ing.amount)+' g':'');
    var existed=!!findByName(nm);
    if(!add(nm,q,'',ing.emoji||ing.ic||'',{recipe:recipeName,mergeQty:true}))return;
    if(existed)merged++;else added++;
  });
  return {added:added,merged:merged,total:added+merged};
}
function shopToast(r){
  if(!r.total){showToast('Nichts zu übernehmen');return;}
  showToast(r.merged
    ? (r.total+' Zutaten auf dem Zettel – '+r.merged+' war'+(r.merged===1?'':'en')+' schon drauf')
    : (r.total+' Zutaten auf dem Einkaufszettel ✓'));
}
function addRecipe(recipeId,portions){
  var rec=null;
  try{rec=(recipes||[]).find(function(r){return r.id===recipeId;});}catch(e){}
  if(!rec){showToast('Rezept nicht gefunden');return;}
  var p=parseFloat(portions)||1;
  var ings=(rec.ingredients||[]).map(function(ing){
    return {name:ing.name,amount:Math.round((ing.amount||100)*p),emoji:ing.emoji||''};
  });
  shopToast(addIngredients(ings,rec.name));
}

// ── Boot: höchste bekannte rev merken, dann einmal abgleichen ──
function boot(){
  list().forEach(function(it){if((it.rev||0)>_lastRev)_lastRev=it.rev;});
  Object.keys(S.shopTomb||{}).forEach(function(id){
    var t=S.shopTomb[id];if(t&&(t.rev||0)>_lastRev)_lastRev=t.rev;
  });
  render();
  Sync.run();
}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden)Sync.run();
});

window.NTShop={
  boot:boot,open:openList,close:closeList,render:render,renderCard:renderCard,renderHubRow:renderHubRow,
  add:add,addMany:addMany,toggle:toggle,remove:remove,clearDone:clearDone,toggleDone:toggleDone,
  submitInput:submitInput,inputKey:inputKey,suggest:suggest,addFromSuggest:addFromSuggest,
  openCatalog:openCatalog,catalogQuery:catalogQuery,tileTap:tileTap,addCatQuery:addCatQuery,
  openItem:openItem,saveItem:saveItem,deleteItem:deleteItem,addRecipe:addRecipe,addIngredients:addIngredients,
  openSync:openSync,renderSyncUI:renderSyncUI,createSyncRoom:createSyncRoom,joinSyncRoom:joinSyncRoom,
  copySyncCode:copySyncCode,shareSyncCode:shareSyncCode,syncNow:syncNow,disconnectSync:disconnectSync,
  openCount:function(){return openItems().length;},
  Sync:Sync,CATS:CATS
};
})();
