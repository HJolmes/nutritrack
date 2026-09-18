// NutriTrack – Verbindungen und der gemeinsame Sync-Kern (v0.247)
// Klassisches Script, kein Modul. Exportiert window.NTSync und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, esc, showToast, openOv,
// closeOv, PROJECT_WORKER_BASE).
//
// ── Warum es das gibt ─────────────────────────────────────────────────────
// Bis v0.246 hatte jeder Topf seinen EIGENEN Kopplungs-Code: einen fürs
// Baby-Tagebuch, einen für den Einkaufszettel, für den Wochenplan gar keinen.
// Wer mit derselben Person beides teilen wollte, tauschte zwei Codes aus und
// konnte trotzdem nicht sagen, wer was bekommt.
//
// Seither gilt: **ein Code je Person**, und an dieser Person hängt, WAS mit ihr
// geteilt wird. Mehrere Personen gleichzeitig sind damit von selbst möglich —
// jeder Topf lädt zu jeder Person hoch, die ihn eingeschaltet hat, und holt von
// jeder ab.
//
// ── Was der Code technisch ist ────────────────────────────────────────────
// `room.key`. Der Raum ist die Postfachadresse beim Worker, der Schlüssel wird
// NIE übertragen; aus ihm leitet jedes Gerät per PBKDF2 denselben AES-Schlüssel
// ab. Das Salt enthält den Topf-Namen (`nutritrack-shop|…`, `nutritrack-baby|…`),
// deshalb ergibt EIN Code drei voneinander unabhängige Chiffrate, und die Töpfe
// liegen beim Worker ohnehin unter eigenen Endpunkten und Präfixen.
//
// ── Was die Auswahl leistet und was nicht ─────────────────────────────────
// Die Schalter sagen, was DIESES Gerät sendet und abholt. Sie sind keine
// Berechtigung: Wer den Code hat, könnte auf seiner Seite jeden Topf
// einschalten. Wer etwas wirklich nicht teilen will, teilt dafür keinen Code —
// dann ist es eine eigene Person mit eigenem Code. Genau das steht auch in der
// Oberfläche.
(function(){
'use strict';

var BASE=(typeof PROJECT_WORKER_BASE!=='undefined'?PROJECT_WORKER_BASE:'');
var TOPICS=[
  {id:'plan', ic:'📅', label:'Wochenplan',    sub:'Was wann gekocht wird'},
  {id:'shop', ic:'🛒', label:'Einkaufszettel', sub:'Artikel und eigene Kategorien'},
  {id:'baby', ic:'👶', label:'Baby-Tagebuch',  sub:'Stillen, Flasche, Windeln'}
];
function topicMeta(id){for(var i=0;i<TOPICS.length;i++)if(TOPICS[i].id===id)return TOPICS[i];return null;}

function cryptoOk(){return !!(window.crypto&&crypto.subtle&&window.TextEncoder);}
function rand(n){
  var a=crypto.getRandomValues(new Uint8Array(n)),s='';
  var abc='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(var i=0;i<n;i++)s+=abc[a[i]%abc.length];
  return s;
}
function b64(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
function b64d(s){var bin=atob(s),b=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b;}
function uid(){return 'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

// ── Personen ──────────────────────────────────────────────────────────────
function links(){
  if(!Array.isArray(S.links))S.links=[];
  S.links.forEach(function(l){
    if(!l.share||typeof l.share!=='object')l.share={};
    if(!l.since||typeof l.since!=='object')l.since={};
    if(!l.state||typeof l.state!=='object')l.state={};
  });
  return S.links;
}
function linkById(id){var a=links();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function linkByRoom(room){var a=links();for(var i=0;i<a.length;i++)if(a[i].room===room)return a[i];return null;}
function forTopic(topic){
  return links().filter(function(l){return l.on&&l.room&&l.key&&l.share[topic];});
}
function anyFor(topic){return forTopic(topic).length>0;}
function codeOf(l){return (l&&l.room&&l.key)?(l.room+'.'+l.key):'';}
function parseCode(raw){
  var p=String(raw||'').trim().replace(/\s+/g,'').split('.');
  if(p.length!==2||!/^[A-Za-z0-9_-]{24,64}$/.test(p[0])||p[1].length<16)return null;
  return {room:p[0],key:p[1]};
}
function defaultShare(){return {plan:true,shop:true,baby:true};}

function createLink(name){
  if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return null;}
  var l={id:uid(),name:(name||'').trim()||'Person',room:rand(32),key:rand(24),on:true,
         share:defaultShare(),since:{},state:{}};
  links().push(l);
  saveS();
  resetAllAcks();
  return l;
}
function joinLink(name,raw){
  if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return null;}
  var p=parseCode(raw);
  if(!p){showToast('Code sieht nicht gültig aus');return null;}
  var ex=linkByRoom(p.room);
  if(ex){
    // Denselben Code ein zweites Mal eingeben heißt: wieder einschalten, nicht
    // eine zweite Person mit demselben Postfach anlegen.
    ex.key=p.key;ex.on=true;
    if((name||'').trim())ex.name=name.trim();
    saveS();resetAllAcks();
    return ex;
  }
  var l={id:uid(),name:(name||'').trim()||'Person',room:p.room,key:p.key,on:true,
         share:defaultShare(),since:{},state:{}};
  links().push(l);
  saveS();
  resetAllAcks();
  return l;
}
function removeLink(id){
  var l=linkById(id);
  if(!l)return;
  S.links=links().filter(function(x){return x.id!==id;});
  saveS();
}
function setShare(id,topic,on){
  var l=linkById(id);
  if(!l)return;
  l.share[topic]=!!on;
  // Neu eingeschaltet: einmal von vorn abholen und alles Eigene hochladen —
  // sonst bekäme die Person nur, was sich ab jetzt noch ändert.
  if(on){l.since[topic]=0;resetAcksFor(topic);}
  saveS();
  if(on)runTopic(topic,true);
}
function renameLink(id,name){
  var l=linkById(id);
  if(!l)return;
  l.name=(name||'').trim()||'Person';
  saveS();
}

// ── Quittungen ────────────────────────────────────────────────────────────
// `_sy` ist eine Abbildung Raum → zuletzt bestätigte Revision. Mit mehreren
// Personen reicht eine einzelne Zahl nicht mehr: Was an Person A quittiert ist,
// kann an Person B noch offen sein.
function ackOf(holder,room){
  var a=holder&&holder._sy;
  if(a&&typeof a==='object')return a[room]||0;
  return 0;
}
function ackSet(holder,room,rev){
  if(!holder)return;
  if(!holder._sy||typeof holder._sy!=='object')holder._sy={};
  holder._sy[room]=rev;
}

var _engines=[];
function resetAllAcks(){_engines.forEach(function(e){e.resetAcks();});}
function resetAcksFor(topic){_engines.forEach(function(e){if(e.topic===topic)e.resetAcks();});}
function runTopic(topic,force){_engines.forEach(function(e){if(e.topic===topic)e.run(force);});}
function runAll(force){_engines.forEach(function(e){e.run(force);});}

// ── Fehlertexte ───────────────────────────────────────────────────────────
// „HTTP 503" sagt niemandem etwas. Der Service Worker macht aus JEDEM
// Netzwerk- oder CORS-Fehler auf workers.dev eine 503 – die häufigste Ursache
// ist also nicht „Server kaputt", sondern offline oder ein Worker, der den
// Endpunkt noch nicht kennt.
function errText(err){
  var m=(err&&err.message)||'Fehler';
  if(m.indexOf('503')>=0)return 'Server nicht erreichbar – offline oder der Worker ist noch nicht aktualisiert';
  if(m.indexOf('404')>=0)return 'Der Worker kennt diesen Bereich noch nicht – bitte aktualisieren';
  if(m.indexOf('401')>=0)return 'Kopplungs-Code wird nicht akzeptiert';
  if(m.indexOf('403')>=0)return 'Zugriff abgelehnt';
  if(m.indexOf('413')>=0)return 'Zu viele Änderungen auf einmal';
  return m;
}

// ── Schlüssel-Cache ───────────────────────────────────────────────────────
var _keys={};
function keyFor(link,salt){
  var tag=link.room+'|'+link.key+'|'+salt;
  if(_keys[tag])return _keys[tag];
  _keys[tag]=crypto.subtle.importKey('raw',new TextEncoder().encode(link.key),'PBKDF2',false,['deriveKey'])
    .then(function(km){
      return crypto.subtle.deriveKey(
        {name:'PBKDF2',salt:new TextEncoder().encode(salt+'|'+link.room),iterations:100000,hash:'SHA-256'},
        km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    });
  return _keys[tag];
}
function dropKeys(){_keys={};}

// ══════════════════════════════════════════════════════════════════════════
// Eine Engine je Topf. Identisch bis auf Endpunkt, Header, Salt und die vier
// Rückrufe, die die Datenform des Topfes kennen.
// ══════════════════════════════════════════════════════════════════════════
function engine(cfg){
  var API=BASE+cfg.path;
  var POLL_MS=cfg.pollMs||30000;
  var DEBOUNCE_MS=cfg.debounceMs||1200;
  var _timer=null,_poll=null,_busy=false;

  function active(){return cryptoOk()&&anyFor(cfg.topic);}

  function resetAcks(){
    (cfg.records()||[]).forEach(function(r){if(r.holder)delete r.holder._sy;});
  }

  function encRec(link,id,rev,payload){
    var iv=crypto.getRandomValues(new Uint8Array(12));
    return keyFor(link,cfg.salt).then(function(k){
      return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,new TextEncoder().encode(JSON.stringify(payload)));
    }).then(function(ct){return {id:id,rev:rev,iv:b64(iv),ct:b64(ct)};});
  }
  function decRec(link,rec){
    return keyFor(link,cfg.salt).then(function(k){
      return crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(rec.iv)},k,b64d(rec.ct));
    }).then(function(buf){return JSON.parse(new TextDecoder().decode(buf));})
      .catch(function(){return null;});// fremder/kaputter Record → überspringen
  }

  function pendingFor(link){
    return (cfg.records()||[])
      .filter(function(r){return (r.rev||0)>ackOf(r.holder,link.room);})
      .sort(function(a,b){return (a.rev||0)-(b.rev||0);})
      .slice(0,200);// Worker-Limit
  }

  function push(link){
    var items=pendingFor(link);
    if(!items.length)return Promise.resolve(0);
    return Promise.all(items.map(function(r){return encRec(link,r.id,r.rev,r.payload);}))
      .then(function(recs){
        var h={'Content-Type':'application/json'};h[cfg.header]=link.room;
        return fetch(API,{method:'POST',headers:h,body:JSON.stringify({records:recs})});
      })
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(){
        // Erst nach bestätigtem Upload quittieren – bei Abbruch wird alles beim
        // nächsten Lauf erneut gesendet.
        items.forEach(function(r){ackSet(r.holder,link.room,r.rev);});
        saveS();
        return items.length;
      });
  }

  function pull(link){
    var h={};h[cfg.header]=link.room;
    var since=link.since[cfg.topic]||0;
    return fetch(API+'?since='+encodeURIComponent(since),{headers:h})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(j){
        var d=(j&&j.data)||{};
        var recs=d.records||[];
        if(!recs.length){if(d.cursor)link.since[cfg.topic]=Math.max(since,d.cursor);return 0;}
        return Promise.all(recs.map(function(rec){return decRec(link,rec);})).then(function(payloads){
          var applied=0;
          payloads.forEach(function(pl,i){
            if(pl&&cfg.apply(recs[i].id,recs[i].rev,pl,link.room))applied++;
          });
          if(d.cursor)link.since[cfg.topic]=Math.max(since,d.cursor);
          if(applied)saveS();
          return applied;
        });
      });
  }

  // Jede Person einzeln: Fällt eine aus, laufen die anderen trotzdem. Der
  // Fehler bleibt an IHR stehen, damit die Oberfläche sagen kann, mit wem es
  // klemmt — eine gemeinsame Fehlerzeile hätte das verschluckt.
  function run(force){
    if(!active())return Promise.resolve();
    if(_busy&&!force)return Promise.resolve();
    _busy=true;
    var total=0;
    var jobs=forTopic(cfg.topic).map(function(link){
      return push(link).then(function(){return pull(link);})
        .then(function(n){
          total+=n||0;
          link.state[cfg.topic]={lastAt:Date.now(),lastErr:''};
        })
        .catch(function(err){
          // Offline oder Worker nicht erreichbar: Quittungen bleiben stehen,
          // beim nächsten Versuch wird alles Offene nachgeholt.
          link.state[cfg.topic]={lastAt:(link.state[cfg.topic]||{}).lastAt||0,lastErr:errText(err)};
        });
    });
    return Promise.all(jobs).then(function(){
      saveS();
      if(total&&cfg.onApplied)cfg.onApplied();
      if(cfg.onStatus)cfg.onStatus();
      if(window.NTSync&&NTSync.renderIfOpen)NTSync.renderIfOpen();
      _busy=false;
    });
  }

  function schedule(){
    if(!active())return;
    clearTimeout(_timer);
    _timer=setTimeout(function(){run();},DEBOUNCE_MS);
  }
  function startPoll(keepOpen){
    if(!active())return;
    stopPoll();
    _poll=setInterval(function(){
      if(!keepOpen||keepOpen())run();else stopPoll();
    },POLL_MS);
  }
  function stopPoll(){if(_poll){clearInterval(_poll);_poll=null;}}

  function statusText(){
    var ls=forTopic(cfg.topic);
    if(!ls.length)return 'Nicht geteilt – bleibt nur auf diesem Gerät.';
    var bad=ls.filter(function(l){return (l.state[cfg.topic]||{}).lastErr;});
    if(bad.length)return '⚠️ Abgleich mit '+bad.map(function(l){return l.name;}).join(', ')+' fehlgeschlagen: '+(bad[0].state[cfg.topic].lastErr)+'. Wird automatisch erneut versucht.';
    var last=ls.reduce(function(m,l){return Math.max(m,(l.state[cfg.topic]||{}).lastAt||0);},0);
    var names=ls.map(function(l){return l.name;}).join(', ');
    if(!last)return 'Geteilt mit '+names+' – noch kein Abgleich gelaufen.';
    var mins=Math.round((Date.now()-last)/60000);
    return '✓ Geteilt mit '+names+' · letzter Abgleich '+(mins<1?'gerade eben':'vor '+mins+' Min.');
  }

  // Alt-Kopplung übernehmen: aus `S.babySync` / `S.shopSync` wird eine Person.
  // Die alten Quittungen sind Zahlen und gelten für genau diesen einen Raum —
  // sie werden auf die neue Abbildung gehoben, damit nach dem Update nicht der
  // gesamte Bestand noch einmal hochlädt.
  function adoptLegacy(legacy,name){
    if(!legacy||!legacy.on||!legacy.room||!legacy.key)return null;
    var l=linkByRoom(legacy.room);
    if(!l){
      l={id:uid(),name:name,room:legacy.room,key:legacy.key,on:true,
         share:{plan:false,shop:false,baby:false},since:{},state:{}};
      links().push(l);
    }
    l.share[cfg.topic]=true;
    l.since[cfg.topic]=legacy.since||0;
    if(legacy.lastAt)l.state[cfg.topic]={lastAt:legacy.lastAt,lastErr:''};
    (cfg.records()||[]).forEach(function(r){
      var h=r.holder;if(!h)return;
      var old=(typeof h._sy==='number')?h._sy:(typeof h.sy==='number'?h.sy:0);
      if(typeof h._sy!=='object'||!h._sy)h._sy={};
      if(old)h._sy[l.room]=old;
      if('sy' in h)delete h.sy;
    });
    return l;
  }

  var api={topic:cfg.topic,active:active,run:run,schedule:schedule,startPoll:startPoll,
           stopPoll:stopPoll,statusText:statusText,resetAcks:resetAcks,
           adoptLegacy:adoptLegacy,cryptoOk:cryptoOk};
  _engines.push(api);
  return api;
}

// ══════════════════════════════════════════════════════════════════════════
// Oberfläche: Mehr → 🔗 Verbindungen
// ══════════════════════════════════════════════════════════════════════════
function open(){render();openOv('linksOv');runAll();}
function close(){closeOv('linksOv');}
function isOpen(){var e=document.getElementById('linksOv');return !!(e&&e.classList.contains('open'));}
function renderIfOpen(){if(isOpen())render();}

function render(){
  var el=document.getElementById('linksList');
  if(!el)return;
  var a=links();
  var sub=document.getElementById('linksOvSub');
  if(sub)sub.textContent=a.length?(a.length+(a.length===1?' Person':' Personen')):'Noch niemand verbunden';
  if(!cryptoOk()){
    el.innerHTML='<div style="font-size:13px;color:var(--re);line-height:1.5;">Dieses Gerät unterstützt die nötige Verschlüsselung nicht — Teilen ist hier nicht möglich.</div>';
    return;
  }
  if(!a.length){
    el.innerHTML='<div style="background:var(--gl);border:1.5px dashed var(--g3);border-radius:14px;padding:16px;text-align:center;">'
      +'<div style="font-size:26px;">🔗</div>'
      +'<div style="font-weight:700;font-size:14px;margin-top:4px;">Noch niemand verbunden</div>'
      +'<div style="font-size:12px;color:var(--mu);line-height:1.5;margin-top:4px;">Ein Code je Person — an ihr hängt, was ihr teilt. Wochenplan, Einkaufszettel und Baby-Tagebuch einzeln an- und abschaltbar.</div>'
      +'</div>';
    return;
  }
  el.innerHTML=a.map(function(l){
    var errs=TOPICS.filter(function(t){return l.share[t.id]&&(l.state[t.id]||{}).lastErr;});
    var status=!l.on
      ? '<span style="color:var(--mu);">Pausiert</span>'
      : (errs.length
        ? '<span style="color:var(--or);">⚠️ '+esc(errs[0].label)+': '+esc((l.state[errs[0].id]||{}).lastErr)+'</span>'
        : '<span style="color:var(--g1);">✓ verbunden</span>');
    return '<div class="lnk">'
      +'<div class="lnk-hd">'
        +'<input type="text" class="lnk-nm" value="'+esc(l.name||'')+'" maxlength="30" aria-label="Name" onchange="NTSync.rename(\''+esc(l.id)+'\',this.value)">'
        +'<button type="button" class="lnk-del" onclick="NTSync.remove(\''+esc(l.id)+'\')" title="Verbindung lösen">🗑</button>'
      +'</div>'
      +'<div class="lnk-st">'+status+'</div>'
      +TOPICS.map(function(t){
        var on=!!l.share[t.id];
        return '<button type="button" class="lnk-tp'+(on?' on':'')+'" onclick="NTSync.toggle(\''+esc(l.id)+'\',\''+t.id+'\')">'
          +'<span class="ic">'+t.ic+'</span>'
          +'<span class="bd"><b>'+esc(t.label)+'</b><i>'+esc(t.sub)+'</i></span>'
          +'<span class="sw">'+(on?'✓':'')+'</span>'
          +'</button>';
      }).join('')
      +'<div class="lnk-act">'
        +'<button type="button" class="lnk-bt" onclick="NTSync.shareCode(\''+esc(l.id)+'\')">📋 Code teilen</button>'
        +'<button type="button" class="lnk-bt" onclick="NTSync.pause(\''+esc(l.id)+'\')">'+(l.on?'⏸ Pausieren':'▶ Fortsetzen')+'</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

function openAdd(mode){
  window._linkAddMode=mode;
  var t=document.getElementById('linkAddTitle');
  var h=document.getElementById('linkAddHint');
  var cw=document.getElementById('linkAddCodeWrap');
  var out=document.getElementById('linkAddOut');
  if(out)out.innerHTML='';
  document.getElementById('linkAddName').value='';
  document.getElementById('linkAddCode').value='';
  if(mode==='create'){
    if(t)t.textContent='➕ Person einladen';
    if(h)h.textContent='Du bekommst einen Code. Den gibst du der Person — sie fügt ihn bei sich unter „Code eingeben" ein.';
    if(cw)cw.style.display='none';
  }else{
    if(t)t.textContent='🔑 Code eingeben';
    if(h)h.textContent='Du hast einen Code bekommen? Trag ihn hier ein — danach wählst du aus, was ihr teilt.';
    if(cw)cw.style.display='';
  }
  openOv('linkAddOv');
}
function submitAdd(){
  var name=(document.getElementById('linkAddName').value||'').trim();
  var l;
  if(window._linkAddMode==='create'){
    l=createLink(name);
    if(!l)return;
    render();
    // Der Code bleibt stehen statt den Dialog zu schließen: Er wird JETZT
    // gebraucht, und ein Dialog, der sich zumacht, nimmt ihn mit.
    var out=document.getElementById('linkAddOut');
    if(out){
      out.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--g3);border-radius:12px;padding:12px;margin-top:10px;">'
        +'<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.08em;">Code für '+esc(l.name)+'</div>'
        +'<div style="font-family:monospace;font-size:12px;word-break:break-all;margin:6px 0 10px;color:var(--tx);">'+esc(codeOf(l))+'</div>'
        +'<button type="button" class="svb" style="margin:0;" onclick="NTSync.shareCode(\''+esc(l.id)+'\')">📤 Code teilen</button>'
        +'<div style="font-size:11px;color:var(--mu);line-height:1.5;margin-top:8px;">Wer diesen Code hat, kann alles sehen und ändern, was du mit dieser Person teilst. Nicht öffentlich posten.</div>'
        +'</div>';
    }
    showToast('Verbindung angelegt ✓');
    return;
  }
  l=joinLink(name,document.getElementById('linkAddCode').value);
  if(!l)return;
  closeOv('linkAddOv');
  render();
  runAll(true);
  showToast('Verbunden mit '+l.name+' ✓');
}
function shareCode(id){
  var l=linkById(id);
  if(!l)return;
  var code=codeOf(l);
  var txt='NutriTrack-Verbindung: '+code;
  if(navigator.share){navigator.share({title:'NutriTrack',text:txt}).catch(function(){});return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){showToast('Code kopiert ✓');})
      .catch(function(){prompt('Code',code);});
    return;
  }
  prompt('Code',code);
}
function toggle(id,topic){
  var l=linkById(id);
  if(!l)return;
  setShare(id,topic,!l.share[topic]);
  render();
}
function pause(id){
  var l=linkById(id);
  if(!l)return;
  l.on=!l.on;
  saveS();render();
  if(l.on)runAll(true);
}
function removeUi(id){
  var l=linkById(id);
  if(!l)return;
  if(!confirm('Verbindung zu „'+l.name+'" lösen?\n\nDeine eigenen Daten bleiben vollständig erhalten. Was bereits übertragen wurde, bleibt beim anderen Gerät.'))return;
  removeLink(id);
  dropKeys();
  render();
  showToast('Verbindung gelöst');
}
function rename(id,name){renameLink(id,name);render();}

// ── Boot ──────────────────────────────────────────────────────────────────
// Die Übernahme der alten Einzel-Kopplungen läuft GENAU EINMAL. Danach ist
// `S.linksMigrated` gesetzt; `S.babySync`/`S.shopSync` bleiben unangetastet
// stehen, damit ein Rückschritt auf eine ältere Fassung nichts verliert.
function migrate(byTopic){
  if(S.linksMigrated)return;
  var made=[];
  if(byTopic.baby&&S.babySync&&S.babySync.on){
    var b=byTopic.baby.adoptLegacy(S.babySync,'Tagebuch-Kopplung');
    if(b)made.push(b);
  }
  if(byTopic.shop&&S.shopSync&&S.shopSync.on){
    var s=byTopic.shop.adoptLegacy(S.shopSync,'Zettel-Kopplung');
    if(s)made.push(s);
  }
  // Eine Person, die schon beides teilt, braucht keinen doppelten Namen.
  made.forEach(function(l){
    var n=0;TOPICS.forEach(function(t){if(l.share[t.id])n++;});
    if(n>1)l.name='Kopplung';
  });
  S.linksMigrated=1;
  saveS();
}

window.NTSync={
  TOPICS:TOPICS,engine:engine,links:links,forTopic:forTopic,anyFor:anyFor,
  ack:ackSet,ackOf:ackOf,
  linkById:linkById,codeOf:codeOf,cryptoOk:cryptoOk,errText:errText,
  open:open,close:close,render:render,renderIfOpen:renderIfOpen,isOpen:isOpen,
  openAdd:openAdd,submitAdd:submitAdd,shareCode:shareCode,toggle:toggle,
  pause:pause,remove:removeUi,rename:rename,
  runAll:runAll,runTopic:runTopic,migrate:migrate,dropKeys:dropKeys
};
})();
