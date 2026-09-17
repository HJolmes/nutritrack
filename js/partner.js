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
var _poll=null,_busy=false,_key=null,_keyFor='';

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
function cryptoOk(){return !!(window.crypto&&crypto.subtle&&window.TextEncoder);}
function newCount(){return inbox().filter(function(x){return x.st==='new';}).length;}
function peerName(){var c=st();return c.peer||'Partner';}

// ── Krypto (identisch zu Zettel/Tagebuch, aber eigenes Salt-Präfix) ──
function rand(n){
  var a=crypto.getRandomValues(new Uint8Array(n)),s='';
  var abc='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(var i=0;i<n;i++)s+=abc[a[i]%abc.length];
  return s;
}
function b64(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
function b64d(s){var bin=atob(s),b=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b;}
function getKey(){
  var c=st();
  var tag=c.room+'|'+c.key;
  if(_key&&_keyFor===tag)return Promise.resolve(_key);
  return crypto.subtle.importKey('raw',new TextEncoder().encode(c.key),'PBKDF2',false,['deriveKey'])
    .then(function(km){
      return crypto.subtle.deriveKey(
        {name:'PBKDF2',salt:new TextEncoder().encode('nutritrack-partner|'+c.room),iterations:100000,hash:'SHA-256'},
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

// ── Kopplung ──
function code(){var c=st();return c.room&&c.key?(c.room+'.'+c.key):'';}
function createRoom(){
  if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return false;}
  var c=st();
  c.room=rand(32);c.key=rand(24);c.on=true;c.since=0;c.lastErr='';
  if(!c.dev)c.dev=rand(10);
  _key=null;_keyFor='';
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
  _key=null;_keyFor='';
  saveS();
  announce();
  run(true);
  return true;
}
function disconnect(){
  var c=st();
  c.on=false;c.room='';c.key='';c.since=0;c.lastErr='';c.peer='';
  _key=null;_keyFor='';
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

// ── Badges: Mehr-Hub-Zeile + Heute-Karte ──
function refreshBadges(){
  var n=newCount();
  var sub=document.getElementById('partnerHubSub');
  if(sub){
    sub.textContent=!active()
      ? 'Mahlzeiten direkt an den Partner senden'
      : (n?(n+' neue Sendung'+(n===1?'':'en')):('Gekoppelt mit '+peerName()));
  }
  var card=document.getElementById('partnerCard');
  if(card){
    card.style.display=n?'block':'none';
    var val=document.getElementById('partnerCardVal');
    if(val)val.textContent=n+' neu';
    var body=document.getElementById('partnerCardBody');
    if(body){
      var first=inbox().filter(function(x){return x.st==='new';}).slice(0,3);
      body.innerHTML=first.map(function(it){
        return '<div style="font-size:12px;color:var(--mu);line-height:1.6;">'+packetIcon(it.p)+' '+esc(packetTitle(it))+' · '+esc(it.from||peerName())+'</div>';
      }).join('');
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
  boot:boot,open:open,close:close,openInbox:openInbox,closeInbox:closeInbox,
  send:send,run:run,active:active,code:code,statusText:statusText,
  renderUI:renderUI,renderInbox:renderInbox,refreshBadges:refreshBadges,
  createPair:createPair,joinPair:joinPair,disconnect:disconnect,syncNow:syncNow,
  copyCode:copyCode,shareCode:shareCode,saveMyName:saveMyName,
  openPacket:openPacket,markDone:markDone,clearInbox:clearInbox,
  peerName:peerName,newCount:newCount,cryptoOk:cryptoOk
};
})();
