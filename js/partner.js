// NutriTrack – Partner-Postfach (v0.236)
// Klassisches Script, kein Modul. Exportiert window.NTPartner und greift direkt
// auf die globalen Helfer aus index.html zu (S, saveS, openOv, closeOv, esc,
// showToast, PROJECT_WORKER_BASE, _previewImport).
//
// Zweck: Zwei gekoppelte Geräte (z.B. Paar) schicken sich Mahlzeiten, ganze Tage
// und Zeiträume ZU, statt jedes Mal einen Link zu bauen und über WhatsApp zu
// schicken. Kein Auto-Sync: Jede Sendung landet im Postfach des Empfängers und
// wird dort ausdrücklich übernommen — beide führen weiterhin ihr eigenes
// Tagebuch.
//
// Mechanik wie Baby-Tagebuch (js/baby.js) und Einkaufszettel (js/shopping.js):
// Kopplungs-Code = `raum.schluessel`. Der Raum adressiert den Briefkasten beim
// Worker, der Schlüssel entschlüsselt und wird NIE gesendet. Der Worker sieht
// ausschließlich {id, rev, iv, ct}. EIGENER Raum, EIGENER Schlüssel, EIGENER
// KV-Präfix (`pm:`) — wer Mahlzeiten teilt, gibt damit weder Einkaufszettel noch
// Baby-Tagebuch frei.
//
// Zustand liegt in S.partner (Kopplung) und S.partnerIn (empfangene Sendungen),
// beides also automatisch Teil jedes Backups.
(function(){
'use strict';

var API=(typeof PROJECT_WORKER_BASE!=='undefined'?PROJECT_WORKER_BASE:'')+'/partner/sync';
var POLL_MS=45000;
var MAX_INBOX=40;        // ältere Sendungen fliegen raus, sonst wächst S endlos
var MAX_INBOX_BYTES=600000; // S liegt im localStorage (~5 MB gesamt) – ein paar
                            // Zeitraum-Sendungen dürfen ihn nicht auffressen
// Klartext-Deckel vor der Verschlüsselung. Base64 des Chiffrats wächst auf rund
// das 1,37-fache der Klartext-Bytes — bei 84 KB bleibt es damit sicher unter den
// 120 000 Zeichen, die der Worker pro Record annimmt. Lieber hier sauber
// abbrechen als draußen in ein HTTP 413 laufen.
var MAX_OUT_BYTES=84000;
var _poll=null,_busy=false;

// ── Zustand ──
function st(){
  S.partner=S.partner||{on:false,room:'',key:'',me:'',peer:'',dev:'',since:0,lastAt:0,lastErr:''};
  if(!S.partner.dev&&window.crypto&&crypto.getRandomValues)S.partner.dev=rand(10);
  return S.partner;
}
function inbox(){
  if(!Array.isArray(S.partnerIn))S.partnerIn=[];
  return S.partnerIn;
}
function active(){var c=st();return !!(c.on&&c.room&&c.key);}
// Das Postfach lebt in S und damit im localStorage. Ein Zeitraum über einen
// Monat ist schnell 40 KB groß — ohne Deckel wäre der Speicher nach ein paar
// Sendungen voll und saveS() würde anfangen, andere Daten wegzuräumen.
// Deshalb: nach Anzahl UND nach Bytes kappen, älteste zuerst.
function trimInbox(){
  var a=inbox();
  if(a.length>MAX_INBOX)a=S.partnerIn=a.slice(0,MAX_INBOX);
  var size=function(){try{return JSON.stringify(a).length;}catch(e){return 0;}};
  while(a.length>1&&size()>MAX_INBOX_BYTES)a.pop();
}
function newCount(){return inbox().filter(function(x){return x.st==='new';}).length;}
function peerName(){var c=st();return c.peer||'Partner';}

// ── Krypto ────────────────────────────────────────────────────────────────
// Seit v0.249 aus js/sync-core.js (window.NTSync.crypto) statt als eigene Kopie.
// Bis v0.248 stand hier eine wortgleiche zweite Implementierung von PBKDF2,
// AES-GCM, b64 und rand — vier Stellen, die bei jeder Aenderung am Krypto-Teil
// haetten mitwandern muessen, und genau das ist zweimal fast passiert.
//
// SALT ist der einzige Unterschied zu den anderen Toepfen und der Grund, warum
// das Postfach eigenstaendig bleibt: Aus demselben Kopplungs-Code leitet jeder
// Topf einen ANDEREN AES-Schluessel ab. Wer Mahlzeiten teilt, gibt damit weder
// Einkaufszettel noch Baby-Tagebuch frei. Die Zeichenkette ist unveraendert —
// bestehende Kopplungen leiten denselben Schluessel ab wie vorher.
var SALT='nutritrack-partner';
function nts(){return window.NTSync&&window.NTSync.crypto;}
function cryptoOk(){var c=nts();return !!(c&&c.ok());}
function rand(n){return nts().rand(n);}
// Das Postfach fuehrt keine Verbindungsliste, sondern genau EINEN Partner.
// NTSync erwartet {room,key} — st() liefert beides.
function link(){var c=st();return {room:c.room,key:c.key};}
function encRec(id,rev,payload){return nts().encRec(link(),SALT,id,rev,payload);}
function decRec(rec){return nts().decRec(link(),SALT,rec);}

// ── Kopplung ──
function code(){var c=st();return c.room&&c.key?(c.room+'.'+c.key):'';}
function createRoom(){
  if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return false;}
  var c=st();
  c.room=rand(32);c.key=rand(24);c.on=true;c.since=0;c.lastErr='';
  if(!c.dev)c.dev=rand(10);
  saveS();
  announce();
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
  c.room=parts[0];c.key=parts[1];c.on=true;c.since=0;c.lastErr='';
  if(!c.dev)c.dev=rand(10);
  saveS();
  announce();
  run(true);
  return true;
}
function disconnect(){
  var c=st();
  c.on=false;c.room='';c.key='';c.since=0;c.lastErr='';c.peer='';
  stopPoll();
  saveS();
  renderUI();
  refreshBadges();
  showToast('Verbindung getrennt – empfangene Sendungen bleiben im Postfach');
}
function setMyName(v){
  var c=st();
  var next=String(v||'').trim().slice(0,24);
  var changed=next!==c.me;
  c.me=next;
  saveS();
  if(changed)announce();
}

// „HTTP 503" sagt niemandem etwas – der Service Worker macht aus JEDEM
// Netzwerk-/CORS-Fehler auf workers.dev eine 503.
function errText(err){
  var m=(err&&err.message)||'Fehler';
  // Ein abgebrochener fetch wirft keinen HTTP-Code, sondern „Failed to fetch"
  // (bzw. „Load failed" in Safari) — ohne diesen Zweig stünde das roh im Status.
  if(/failed to fetch|load failed|networkerror|network request/i.test(m))
    return 'Keine Verbindung – wird automatisch erneut versucht';
  if(m.indexOf('503')>=0)return 'Server nicht erreichbar – offline oder der Worker ist noch nicht aktualisiert';
  if(m.indexOf('404')>=0)return 'Der Worker kennt das Partner-Postfach noch nicht – bitte aktualisieren';
  if(m.indexOf('401')>=0)return 'Kopplungs-Code wird nicht akzeptiert';
  if(m.indexOf('403')>=0)return 'Zugriff abgelehnt';
  if(m.indexOf('413')>=0)return 'Sendung zu groß – kleineren Zeitraum wählen';
  return m;
}

// ── Senden ──
// Ein Paket = ein Share-Payload (t:'r'|'f'|'m'|'d'|'p') plus Absender-Infos.
// `sid` ist die Geräte-Kennung des Absenders: Beide Geräte lesen denselben Raum,
// das eigene Paket darf nicht im eigenen Postfach landen.
function send(payload,label){
  if(!active()){showToast('Erst mit dem Partner koppeln');return Promise.resolve(false);}
  if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return Promise.resolve(false);}
  if(!payload){showToast('Nichts zu senden');return Promise.resolve(false);}
  var c=st();
  var body={p:payload,from:c.me||'',sid:c.dev,label:String(label||''),ts:Date.now()};
  var raw='';
  try{raw=JSON.stringify(body);}catch(e){}
  var bytes=0;
  try{bytes=new TextEncoder().encode(raw).length;}catch(e){bytes=raw.length;}
  if(bytes>MAX_OUT_BYTES){
    showToast('Zeitraum zu groß – bitte in kleineren Abschnitten senden');
    return Promise.resolve(false);
  }
  var rev=Date.now();
  var id='p'+rev.toString(36)+rand(6);
  showToast('Wird gesendet …');
  return encRec(id,rev,body)
    .then(function(rec){
      return fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Partner-Room':c.room},body:JSON.stringify({records:[rec]})});
    })
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(){
      c.lastAt=Date.now();c.lastErr='';
      saveS();
      showToast('📤 An '+peerName()+' gesendet ✓');
      renderUI();
      return true;
    })
    .catch(function(err){
      c.lastErr=errText(err);
      saveS();
      showToast('Senden fehlgeschlagen: '+c.lastErr);
      renderUI();
      return false;
    });
}

// Beim Koppeln und bei jeder Namensänderung einen winzigen Record ablegen, der
// nur den eigenen Namen trägt. Feste id pro Gerät → er überschreibt sich selbst
// statt sich anzusammeln, und der Empfänger zeigt „Gekoppelt mit Anna" statt
// „… mit Partner", ohne dass erst etwas gesendet werden muss.
function announce(){
  var c=st();
  if(!active()||!cryptoOk()||!c.me)return Promise.resolve(false);
  return encRec('hello-'+c.dev,Date.now(),{hello:1,from:c.me,sid:c.dev,ts:Date.now()})
    .then(function(rec){
      return fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Partner-Room':c.room},body:JSON.stringify({records:[rec]})});
    })
    .then(function(r){return !!(r&&r.ok);})
    .catch(function(){return false;});
}

// ── Empfangen ──
function pull(){
  var c=st();
  return fetch(API+'?since='+encodeURIComponent(c.since||0),{headers:{'X-Partner-Room':c.room}})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(j){
      var d=(j&&j.data)||{};
      var recs=d.records||[];
      if(!recs.length){if(d.cursor)c.since=Math.max(c.since||0,d.cursor);return 0;}
      return Promise.all(recs.map(decRec)).then(function(bodies){
        var added=0,added0=false;
        bodies.forEach(function(b,i){
          if(!b)return;
          if(b.sid&&b.sid===c.dev)return;          // eigenes Paket
          // Namens-Ankündigung: nur merken, nichts ins Postfach legen.
          if(b.hello){
            if(b.from&&b.from!==c.peer){c.peer=String(b.from).slice(0,24);added0=true;}
            return;
          }
          if(!b.p)return;
          var id=recs[i].id;
          if(inbox().some(function(x){return x.id===id;}))return; // schon da
          if(b.from&&b.from!==c.peer){c.peer=String(b.from).slice(0,24);}
          inbox().unshift({id:id,ts:b.ts||recs[i].rev||Date.now(),from:b.from||'',label:b.label||'',p:b.p,st:'new'});
          added++;
        });
        trimInbox();
        if(d.cursor)c.since=Math.max(c.since||0,d.cursor);
        if(added||added0)saveS();
        return added;
      });
    });
}
function run(force){
  if(!active()||!cryptoOk())return Promise.resolve(0);
  if(_busy&&!force)return Promise.resolve(0);
  _busy=true;
  var c=st();
  return pull()
    .then(function(added){
      c.lastAt=Date.now();c.lastErr='';
      saveS();
      refreshBadges();
      renderUI();
      if(added)showToast('📬 '+added+' neue Sendung'+(added===1?'':'en')+' von '+peerName());
      return added;
    })
    .catch(function(err){
      c.lastErr=errText(err);
      saveS();
      renderUI();
      return 0;
    })
    .then(function(n){_busy=false;return n;});
}
function startPoll(){
  if(!active())return;
  stopPoll();
  _poll=setInterval(function(){
    if(isOpen('partnerOv')||isOpen('partnerInboxOv'))run();
    else stopPoll();
  },POLL_MS);
}
function stopPoll(){if(_poll){clearInterval(_poll);_poll=null;}}

function statusText(){
  var c=st();
  if(!active())return 'Nicht gekoppelt – Teilen läuft weiter über Links.';
  if(c.lastErr)return '⚠️ '+c.lastErr;
  if(!c.lastAt)return 'Gekoppelt – noch kein Abgleich gelaufen.';
  var mins=Math.round((Date.now()-c.lastAt)/60000);
  return '✓ Gekoppelt mit '+peerName()+' · zuletzt '+(mins<1?'gerade eben':'vor '+mins+' Min.');
}

// ── Postfach-Oberfläche ──
function open(){renderUI();openOv('partnerOv');run();startPoll();}
function close(){stopPoll();closeOv('partnerOv');}
// Overlays stapeln sich in dieser App nicht: ein offen gebliebenes partnerOv
// läge über dem Import-Dialog und würde jeden Tipp darauf abfangen. Deshalb
// beim Weiterspringen immer das vorherige Fenster schließen.
function openInbox(){closeOv('partnerOv');renderInbox();openOv('partnerInboxOv');run();startPoll();}
function closeInbox(){stopPoll();closeOv('partnerInboxOv');}

function renderUI(){
  var on=active();
  var stat=document.getElementById('partnerStatus');
  if(stat)stat.textContent=statusText();
  var setup=document.getElementById('partnerSetup');
  if(setup)setup.style.display=on?'none':'block';
  var live=document.getElementById('partnerLive');
  if(live)live.style.display=on?'block':'none';
  var codeEl=document.getElementById('partnerCode');
  if(codeEl)codeEl.textContent=code()||'';
  var me=document.getElementById('partnerMyName');
  if(me&&document.activeElement!==me)me.value=st().me||'';
  var cnt=document.getElementById('partnerInboxCount');
  if(cnt){
    var n=newCount();
    cnt.textContent=n?(n+' neu'):(inbox().length?inbox().length+' im Postfach':'Postfach leer');
  }
}

function fmtWhen(ts){
  var d=new Date(ts||0);
  if(isNaN(d.getTime()))return '';
  var t=new Date();
  var same=d.toDateString()===t.toDateString();
  var hh=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  if(same)return 'heute '+hh;
  return d.toLocaleDateString('de-DE',{day:'numeric',month:'short'})+' '+hh;
}
function packetIcon(p){
  if(!p)return '✅';
  if(p.t==='r')return '📋';
  if(p.t==='f')return '🥑';
  if(p.t==='d')return '📅';
  if(p.t==='p')return '🗓';
  return '🍽';
}
function packetTitle(it){
  if(it.label)return it.label;
  var p=it.p||{};
  if(p.t==='r')return p.n||'Rezept';
  if(p.t==='f')return p.n||'Lebensmittel';
  if(p.t==='m')return 'Mahlzeit';
  if(p.t==='d')return 'Ganzer Tag';
  if(p.t==='p')return 'Zeitraum';
  return 'Sendung';
}
// ── Sendungen, die zu EINER Mahlzeit gehoeren (v0.260) ───────────────
// Die Flagge in der Kopfzeile sagt nur DASS etwas da ist. Wo es hingehoert,
// weiss das Paket aber selbst: eine Mahlzeit (t:'m') nennt ihren Slot, ein
// ganzer Tag (t:'d') bringt seine Mahlzeiten mit. Beides wird deshalb auch an
// der betreffenden Mahlzeit angezeigt — und ist von dort aus uebernehmbar.
function newForMeal(meal){
  return inbox().filter(function(it){
    if(it.st!=='new'||!it.p)return false;
    var p=it.p;
    if(p.t==='m')return (p.m||'breakfast')===meal;
    if(p.t==='d')return !!(((p.mm||{})[meal])||[]).length;
    return false;
  });
}
// Genau eine Sendung → direkt die Bestaetigung, mit dieser Mahlzeit vorgewaehlt.
// Mehrere → das Postfach, weil die Wahl dann beim Nutzer liegt.
function openForMeal(meal){
  var items=inbox(),idx=-1,n=0;
  items.forEach(function(it,i){
    if(it.st!=='new'||!it.p)return;
    var p=it.p;
    var hit=(p.t==='m')?((p.m||'breakfast')===meal):(p.t==='d'?!!(((p.mm||{})[meal])||[]).length:false);
    if(!hit)return;
    n++;if(idx<0)idx=i;
  });
  if(!n){showToast('Nichts Neues f\u00fcr diese Mahlzeit');return;}
  if(n===1){openPacket(idx);return;}
  openInbox();
}

function renderInbox(){
  var el=document.getElementById('partnerInboxList');
  if(!el)return;
  var items=inbox();
  if(!items.length){
    el.innerHTML='<div style="color:var(--mu);text-align:center;padding:28px 12px;font-size:13px;line-height:1.5;">Noch nichts empfangen.<br>Dein Partner tippt bei einer Mahlzeit auf 📤 und dann auf „An dich senden".</div>';
    return;
  }
  el.innerHTML=items.map(function(it,i){
    var isNew=it.st==='new';
    return '<div class="list-row" style="'+(isNew?'border:1.5px solid var(--g2);':'opacity:.65;')+'" onclick="NTPartner.openPacket('+i+')">'
      +'<div class="lr-ic">'+packetIcon(it.p)+'</div>'
      +'<div class="lr-body">'
        +'<div class="lr-name">'+esc(packetTitle(it))+(isNew?' <span style="color:var(--g2);font-size:11px;">• neu</span>':'')+'</div>'
        +'<div class="lr-sub">'+esc(it.from||peerName())+' · '+esc(fmtWhen(it.ts))+(it.st==='done'?' · übernommen':'')+'</div>'
      +'</div>'
      +'<div class="lr-val">›</div>'
    +'</div>';
  }).join('')
  +'<button type="button" class="seb" style="margin-top:12px;" onclick="NTPartner.clearInbox()">🗑 Postfach leeren</button>';
}
function openPacket(i){
  var it=inbox()[i];
  if(!it){showToast('Sendung nicht gefunden');return;}
  if(!it.p){showToast('Schon übernommen – der Inhalt steht im Tagebuch');return;}
  _openId=it.id;
  stopPoll();
  closeOv('partnerInboxOv');
  closeOv('partnerOv');
  setTimeout(function(){
    if(typeof _previewImport==='function')_previewImport(it.p,{from:it.from||peerName(),packetId:it.id});
    else showToast('Import nicht verfügbar');
  },150);
}
var _openId='';
// Wird von importConfirm() aufgerufen, sobald eine Sendung übernommen wurde.
function markDone(id){
  var pid=id||_openId;
  if(!pid)return;
  var it=inbox().filter(function(x){return x.id===pid;})[0];
  if(it&&it.st!=='done'){
    it.st='done';
    // Die Einträge stehen jetzt im Tagebuch — die Kopie im Postfach ist nur noch
    // Ballast. Der Listeneintrag bleibt als Quittung stehen, ohne Nutzlast.
    delete it.p;
    saveS();
    refreshBadges();
  }
  _openId='';
}
function clearInbox(){
  if(!confirm('Alle empfangenen Sendungen aus dem Postfach entfernen? Bereits übernommene Mahlzeiten bleiben im Tagebuch.'))return;
  S.partnerIn=[];
  saveS();
  renderInbox();
  refreshBadges();
  showToast('Postfach geleert');
}

// ── Badges: Kopfzeilen-Flagge, Mehr-Hub-Zeile, Heute-Karte ──
function refreshBadges(){
  var n=newCount();
  var on=active();
  // Kopfzeile „Heute": Der Postfach-Knopf erscheint erst mit einer Kopplung —
  // ohne Partner wäre er eine tote Taste. Die Flagge zeigt nur ungelesene
  // Sendungen, bei 0 verschwindet sie ganz.
  var hb=document.getElementById('hdrInboxBtn');
  if(hb)hb.style.display=on?'inline-flex':'none';
  var flag=document.getElementById('hdrInboxFlag');
  if(flag){
    flag.style.display=n?'block':'none';
    flag.textContent=n>9?'9+':String(n);
  }
  ['breakfast','lunch','dinner','snack'].forEach(function(m){
    var b=document.getElementById('mealInbox-'+m);
    if(!b)return;
    var c=newForMeal(m).length;
    b.style.display=c?'flex':'none';
    b.textContent=c>1?('\ud83d\udcec '+c):'\ud83d\udcec';
  });
  var sub=document.getElementById('partnerHubSub');
  if(sub){
    sub.textContent=!on
      ? 'Mahlzeiten direkt an den Partner senden'
      : (n?(n+' neue Sendung'+(n===1?'':'en')+' im Postfach'):('Gekoppelt mit '+peerName()));
  }
  var card=document.getElementById('partnerCard');
  if(card){
    // Seit v0.254 haengt die Kachel an der KOPPLUNG, nicht an einer neuen
    // Sendung. Vorher war sie eine Benachrichtigung, die sich selbst wegnahm —
    // und der Schalter im Funktions-Katalog stand trotzdem auf „an". Ohne
    // Kopplung bleibt sie weg: dort gaebe es nichts zu zeigen, und der Weg zur
    // Kopplung steht im Funktions-Blatt.
    card.style.display=on?'block':'none';
    var val=document.getElementById('partnerCardVal');
    if(val)val.textContent=n?(n+' neu'):'Postfach';
    var body=document.getElementById('partnerCardBody');
    if(body){
      var first=inbox().filter(function(x){return x.st==='new';}).slice(0,3);
      body.innerHTML=first.length
        ? first.map(function(it){
            return '<div style="font-size:12px;color:var(--mu);line-height:1.6;">'+packetIcon(it.p)+' '+esc(packetTitle(it))+' · '+esc(it.from||peerName())+'</div>';
          }).join('')
        : '<div style="font-size:12px;color:var(--mu);">Nichts Neues von '+esc(peerName())+'.</div>';
    }
  }
}

function copyCode(){
  var c=code();
  if(!c){showToast('Noch keine Kopplung');return;}
  if(typeof _copyToClipboard==='function')_copyToClipboard(c,'Code');
}
function shareCode(){
  var c=code();
  if(!c){showToast('Noch keine Kopplung');return;}
  if(navigator.share)navigator.share({title:'NutriTrack Partner-Code',text:c}).catch(function(){});
  else copyCode();
}
function createPair(){if(createRoom()){renderUI();refreshBadges();showToast('Code erzeugt – jetzt am Gerät deines Partners eingeben');}}
function joinPair(){
  var inp=document.getElementById('partnerJoinCode');
  if(!inp)return;
  if(joinRoom(inp.value)){inp.value='';renderUI();refreshBadges();showToast('Gekoppelt ✓');}
}
function syncNow(){
  if(!active()){showToast('Erst koppeln');return;}
  showToast('Postfach wird geprüft …');
  run(true).then(function(){renderInbox();renderUI();});
}
function saveMyName(){
  var inp=document.getElementById('partnerMyName');
  if(!inp)return;
  setMyName(inp.value);
  showToast('Name gespeichert');
}

function isOpen(id){
  var el=document.getElementById(id);
  return !!(el&&el.classList.contains('open'));
}

// ── Boot ──
function boot(){
  refreshBadges();
  run();
}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden)run();
});

window.NTPartner={
  newForMeal:newForMeal,openForMeal:openForMeal,packetTitle:packetTitle,
  boot:boot,open:open,close:close,openInbox:openInbox,closeInbox:closeInbox,
  send:send,run:run,active:active,code:code,statusText:statusText,
  renderUI:renderUI,renderInbox:renderInbox,refreshBadges:refreshBadges,
  createPair:createPair,joinPair:joinPair,disconnect:disconnect,syncNow:syncNow,
  copyCode:copyCode,shareCode:shareCode,saveMyName:saveMyName,
  openPacket:openPacket,markDone:markDone,clearInbox:clearInbox,
  peerName:peerName,newCount:newCount,cryptoOk:cryptoOk
};
})();
