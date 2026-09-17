// NutriTrack — Alexa-Einwurf (Sprachbefehle)
// Klassisches Script, kein Modul. Exportiert window.NTAlexa und greift direkt
// auf bestehende Globals (S, saveS, renderAll, lookupNutrients, NTShop, NTBaby).
//
// Prinzip: EINBAHNSTRASSE. Ein privater Alexa-Skill (siehe `alexa/` im Repo)
// schickt gesprochene Notizen an den Worker (`POST /alexa/inbox`); diese Datei
// holt sie beim App-Start ab, trägt sie lokal ein und quittiert sie
// (`POST /alexa/ack`), woraufhin der Worker sie löscht. Alexa kann nichts
// vorlesen — der Worker kennt weder Tagessummen noch Ziele noch Historie.
//
// Warum kein Live-Update: Eine PWA läuft nicht im Hintergrund. Ein Einwurf
// erscheint deshalb erst, wenn die App das nächste Mal geöffnet oder in den
// Vordergrund geholt wird. Das ist kein Bug, sondern die Bauart.
//
// Öffentliche API (window.NTAlexa):
//   getToken() / setToken(t) / clearToken() / generateToken()
//   getWorkerBase() / setWorkerBase(url)
//   sync({force})         — holt neue Einwürfe, trägt sie ein, quittiert
//   endpointInfo()        — {url, token} für die Skill-Einrichtung
//   onMutation(cb)        — Callback „es kam etwas an"
//
// State (localStorage):
//   nt_alexa_token    — 32-Zeichen-Token, identisch im Skill hinterlegt
//   nt_alexa_worker   — abweichende Worker-URL (optional)
//   nt_alexa_lastpoll — Worker-Cursor (srev) des letzten Abrufs

(function(){
  var DEFAULT_WORKER='https://nutritrack-ai-proxy.h-jolmes.workers.dev';
  var TOKEN_LEN=32;
  var TOKEN_ALPHABET='23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  var KEY_TOKEN='nt_alexa_token';
  var KEY_WORKER='nt_alexa_worker';
  var KEY_LAST='nt_alexa_lastpoll';
  var SYNC_MIN_INTERVAL_MS=15*1000;
  var _listeners=[];
  var _lastSyncAt=0;
  var _inFlight=null;

  // ── Token & Endpunkt ──
  function getToken(){return localStorage.getItem(KEY_TOKEN)||'';}
  function setToken(t){
    if(typeof t!=='string'||!/^[A-Za-z0-9_-]{24,64}$/.test(t))throw new Error('invalid token format');
    localStorage.setItem(KEY_TOKEN,t);
  }
  function clearToken(){
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_LAST);
  }
  function generateToken(){
    var arr=new Uint8Array(TOKEN_LEN);
    crypto.getRandomValues(arr);
    var s='';
    for(var i=0;i<TOKEN_LEN;i++)s+=TOKEN_ALPHABET[arr[i]%TOKEN_ALPHABET.length];
    return s;
  }
  function getWorkerBase(){
    var v=(localStorage.getItem(KEY_WORKER)||'').trim();
    return v||DEFAULT_WORKER;
  }
  function setWorkerBase(url){
    var v=(url||'').trim().replace(/\/+$/,'');
    if(v&&!/^https?:\/\//.test(v))throw new Error('worker URL must start with http(s)://');
    if(v)localStorage.setItem(KEY_WORKER,v);else localStorage.removeItem(KEY_WORKER);
  }
  function endpointInfo(){
    return {url:getWorkerBase().replace(/\/+$/,'')+'/alexa/inbox',token:getToken()||''};
  }
  function onMutation(cb){if(typeof cb==='function')_listeners.push(cb);}

  // ── Tagesschlüssel ──
  // Immer das LOKALE Datum des Sprechzeitpunkts, nicht der Tag des Abrufs:
  // Wer um 23:50 „Alexa, …" sagt und die App erst morgens öffnet, will den
  // Eintrag am gestrigen Tag sehen.
  function pad(n){return n<10?'0'+n:''+n;}
  function dayKeyOf(ts){
    var d=new Date(ts||Date.now());
    if(isNaN(d.getTime()))d=new Date();
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }
  function ensureDay(key){
    if(!window.S)return null;
    var St=window.S;
    St.days=St.days||{};
    if(!St.days[key])St.days[key]={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},water:0,exercise:[]};
    var d=St.days[key];
    // Verdichtete Alt-Tage haben keine Mahlzeiten-Arrays mehr — dort nichts
    // nachtragen, sonst kippt die Verdichtung.
    if(d._compressed)return null;
    if(!d.meals)d.meals={breakfast:[],lunch:[],dinner:[],snack:[]};
    if(!d.exercise)d.exercise=[];
    return d;
  }

  // ── Mengen aus gesprochenem Text ──
  var NUMWORDS={'ein':1,'eine':1,'einen':1,'eins':1,'zwei':2,'drei':3,'vier':4,'fünf':5,'fuenf':5,
    'sechs':6,'sieben':7,'acht':8,'neun':9,'zehn':10,'elf':11,'zwölf':12,'zwoelf':12,'halbe':0.5,'halben':0.5,'halbes':0.5};
  // „150 Gramm Reis" → {grams:150, name:'Reis'}; „zwei Eier" → {count:2, name:'Eier'}
  function parseAmount(raw){
    var t=String(raw||'').trim();
    if(!t)return null;
    var m=t.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|gramm|ml|milliliter|l|liter|kg|kilo|kilogramm)\b\s*(.*)$/i);
    if(m){
      var v=parseFloat(m[1].replace(',','.'));
      var unit=m[2].toLowerCase();
      if(/^(kg|kilo|kilogramm)$/.test(unit))v*=1000;
      else if(/^(l|liter)$/.test(unit))v*=1000; // ml ~ g, für Getränke gut genug
      return {grams:v,name:(m[3]||'').trim()};
    }
    // Führende Stückzahl, als Ziffer oder als Wort
    m=t.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    if(m)return {count:parseFloat(m[1].replace(',','.')),name:(m[2]||'').trim()};
    m=t.match(/^([a-zäöüß]+)\s+(.*)$/i);
    if(m){
      var w=NUMWORDS[m[1].toLowerCase()];
      if(w)return {count:w,name:(m[2]||'').trim()};
    }
    return {name:t};
  }
  // „zwei Eier und ein Brötchen, dazu Kaffee" → drei Teile
  function splitItems(text){
    return String(text||'')
      .split(/\s*(?:,|;|\bund\b|\bsowie\b|\bdazu\b|\bplus\b)\s*/i)
      .map(function(s){return s.trim();})
      .filter(function(s){return s.length>0;});
  }

  // ── Mahlzeiten-Slot ──
  // Der Skill darf einen Slot vorgeben („zum Frühstück"). Ohne Angabe
  // entscheidet die Uhrzeit des Sprechzeitpunkts.
  function slotFor(item){
    if(item.meal)return item.meal;
    var h=new Date(item.ts||Date.now()).getHours();
    if(h<11)return 'breakfast';
    if(h<15)return 'lunch';
    if(h<21)return 'dinner';
    return 'snack';
  }

  // ── Dedup ──
  // Jeder eingetragene Datensatz trägt `_alexaId`. Kommt derselbe Einwurf
  // erneut (Quittung ging verloren, Cursor zurückgesetzt), wird er übersprungen
  // statt doppelt eingetragen.
  function hasAlexaId(arr,id){
    if(!arr)return false;
    for(var i=0;i<arr.length;i++){if(arr[i]&&arr[i]._alexaId===id)return true;}
    return false;
  }
  function dayHasMeal(day,id){
    var slots=['breakfast','lunch','dinner','snack'];
    for(var i=0;i<slots.length;i++){if(hasAlexaId(day.meals[slots[i]],id))return true;}
    return false;
  }

  // ── Einfüge-Pfade je Typ ──
  function applyShop(item){
    if(!window.NTShop)return false;
    var p=parseAmount(item.text);
    var name=(p&&p.name)||item.text;
    var qty='';
    if(p&&p.grams)qty=Math.round(p.grams)+' g';
    else if(p&&p.count)qty=p.count+' Stück';
    else if(item.qty)qty=item.qty+' Stück';
    if(!name)return false;
    // NTShop.add kümmert sich um Kategorie, Symbol, Dedup und Sync.
    return !!window.NTShop.add(name,qty);
  }

  function applyBaby(item){
    if(!window.NTBaby||!window.NTBaby.add)return false;
    if(!window.S||!window.S.babyOn)return false; // Tagebuch aus → Einwurf verwerfen
    var key=dayKeyOf(item.ts);
    var log=(window.S.babyLog&&window.S.babyLog[key])||null;
    if(hasAlexaId(log,item.id))return false;
    var e={t:item.babyType};
    var p=item.babyP||{};
    for(var k in p){if(Object.prototype.hasOwnProperty.call(p,k))e[k]=p[k];}
    if(item.text&&!e.note)e.note=item.text;
    e.ts=item.ts||Date.now();
    e._alexaId=item.id;
    window.NTBaby.add(e,key);
    return true;
  }

  function applyWater(item){
    var key=dayKeyOf(item.ts);
    var day=ensureDay(key);
    if(!day)return false;
    day._alexaWater=day._alexaWater||{};
    if(day._alexaWater[item.id])return false; // schon gezählt
    var n=item.qty;
    if(!n){
      var p=parseAmount(item.text);
      n=(p&&p.count)||1;
      if(p&&p.grams)n=Math.max(1,Math.round(p.grams/(window.S.waterUnit||250)));
    }
    n=Math.max(1,Math.min(30,Math.round(n)));
    day.water=(day.water||0)+n;
    day._alexaWater[item.id]=1;
    return true;
  }

  function applyExercise(item){
    var key=dayKeyOf(item.ts);
    var day=ensureDay(key);
    if(!day)return false;
    if(hasAlexaId(day.exercise,item.id))return false;
    var p=parseAmount(item.text);
    var name=(p&&p.name)||item.text||'Sport';
    var mins=item.durationMin||null;
    // „30 Minuten Joggen" — Dauer steckt oft im Text statt im Slot.
    var dm=String(item.text||'').match(/(\d+)\s*(?:min|minuten)\b/i);
    if(!mins&&dm)mins=parseInt(dm[1],10);
    if(dm)name=String(item.text).replace(dm[0],'').replace(/^\s*(lang|für)\s*/i,'').trim()||name;
    var kcal=item.kcal||0;
    if(!kcal&&mins)kcal=estimateKcal(name,mins);
    day.exercise.push({
      name:name,
      emoji:exEmoji(name),
      duration:mins||null,
      intensity:'medium',
      kcal:Math.round(kcal||0),
      ts:item.ts||Date.now(),
      _alexaId:item.id,
      _source:'alexa',
      // Ohne Dauer UND ohne Kalorien ist der Eintrag nur ein Merkzettel —
      // die App markiert ihn, damit die Nutzerin ihn nachträgt.
      _alexaPending:(!mins&&!kcal)?1:0
    });
    return true;
  }

  // Grobe MET-Schätzung. Bewusst simpel: Wer genaue Werte will, nimmt den
  // Sport-Sync aus Apple/Samsung Health — der liefert echte Messwerte.
  var MET={lauf:9.8,jogg:8.0,renn:11,geh:3.5,spazier:3.0,wander:6.0,rad:7.5,fahrrad:7.5,velo:7.5,
    schwimm:8.0,yoga:2.5,pilates:3.0,kraft:5.0,gewicht:5.0,gym:5.0,fitness:5.0,rudern:7.0,
    tanz:5.0,fußball:7.0,fussball:7.0,tennis:7.3,boxen:9.0,seilspring:11,crosstrainer:6.0,hiit:9.0};
  function estimateKcal(name,mins){
    var nl=(name||'').toLowerCase();
    var met=4.0;
    for(var k in MET){if(nl.indexOf(k)!==-1){met=MET[k];break;}}
    var kg=(window.S&&S.weight)||70;
    return met*kg*(mins/60);
  }
  function exEmoji(name){
    var t=(name||'').toLowerCase();
    if(/lauf|jogg|renn/.test(t))return '🏃';
    if(/geh|spazier|wander/.test(t))return '🚶';
    if(/rad|fahrrad|velo|cycl/.test(t))return '🚴';
    if(/schwimm/.test(t))return '🏊';
    if(/yoga|pilates/.test(t))return '🧘';
    if(/kraft|gewicht|gym|fitness/.test(t))return '🏋️';
    if(/ruder/.test(t))return '🚣';
    if(/tanz/.test(t))return '💃';
    if(/fußball|fussball/.test(t))return '⚽';
    if(/tennis/.test(t))return '🎾';
    if(/box/.test(t))return '🥊';
    return '🏃';
  }

  // Mahlzeiten laufen über den bestehenden Nährwert-Pfad der App
  // (`lookupNutrients`: lokale DB → Open Food Facts → KI → Schätzung).
  // Deshalb asynchron und gesammelt, statt pro Einwurf einzeln.
  // Wie lange auf den Naehrwert-Pfad gewartet wird, bevor der Lauf als
  // gescheitert gilt. lookupNutrients geht ueber Open Food Facts und ggf. die
  // KI ins Netz — ohne Deckel koennte ein haengender Abruf den ganzen Sync
  // blockieren und die Einwuerfe mit ihm.
  var MEAL_TIMEOUT_MS=45*1000;

  function applyMeals(items,done){
    if(!items.length||typeof window.lookupNutrients!=='function'){done(0,true);return;}
    var jobs=[];
    items.forEach(function(item){
      var key=dayKeyOf(item.ts);
      var day=ensureDay(key);
      if(!day||dayHasMeal(day,item.id))return;
      splitItems(item.text).forEach(function(part){
        var p=parseAmount(part);
        if(!p||!p.name)return;
        jobs.push({item:item,key:key,slot:slotFor(item),name:p.name,grams:p.grams||null,count:p.count||null});
      });
    });
    if(!jobs.length){done(0,true);return;}
    // Genau ein Abschluss, egal ob lookupNutrients antwortet, doppelt antwortet
    // oder gar nicht: sonst liefe ack() mehrfach oder nie.
    var settled=false;
    var timer=setTimeout(function(){
      if(settled)return;
      settled=true;
      console.warn('[alexa] lookupNutrients timed out — Mahlzeiten bleiben im Briefkasten');
      done(0,false);
    },MEAL_TIMEOUT_MS);
    window.lookupNutrients(jobs.map(function(j){return {name:j.name,g:j.grams};}),function(results){
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      var added=0;
      results.forEach(function(res,i){
        if(!res)return;
        var j=jobs[i];
        var day=ensureDay(j.key);
        if(!day)return;
        var amount=res.amount||0;
        var pending=0;
        if(!amount){
          // Keine Grammangabe gesprochen: erst das Portionsgedächtnis fragen,
          // sonst 100 g als neutrale Basis. In beiden Fällen markieren, damit
          // die Nutzerin die Menge bestätigen kann statt ihr zu vertrauen.
          var remembered=(typeof window.recallPortion==='function')?window.recallPortion(res.name):null;
          amount=remembered||100;
          if(j.count&&j.count>1)amount=amount*j.count;
          pending=1;
        }
        var per100=res.per100||{kcal:0,protein:0,carbs:0,fat:0};
        var scaled=(typeof window.scaleNutrients==='function')
          ? window.scaleNutrients(per100,amount/100)
          : {kcal:(per100.kcal||0)*amount/100,protein:(per100.protein||0)*amount/100,carbs:(per100.carbs||0)*amount/100,fat:(per100.fat||0)*amount/100};
        var entry={name:res.name,emoji:res.emoji||'🍽',amount:amount,per100:per100,
          _alexaId:j.item.id,_source:'alexa',_alexaPending:pending};
        for(var k in scaled){if(Object.prototype.hasOwnProperty.call(scaled,k))entry[k]=scaled[k];}
        day.meals[j.slot].push(entry);
        added++;
      });
      done(added,true);
    });
  }

  // ── Abruf ──
  function _finish(added){
    if(!added)return;
    if(typeof window.saveS==='function')window.saveS();
    if(typeof window.renderAll==='function')window.renderAll();
    for(var i=0;i<_listeners.length;i++){
      try{_listeners[i](added);}catch(e){console.error('[alexa] listener',e);}
    }
  }

  function ack(ids){
    if(!ids.length)return Promise.resolve();
    return fetch(getWorkerBase().replace(/\/+$/,'')+'/alexa/ack',{
      method:'POST',
      headers:{'X-User-Token':getToken(),'Content-Type':'application/json'},
      body:JSON.stringify({ids:ids}),
    }).then(function(){}).catch(function(e){
      // Quittung verloren: nicht schlimm. Der Cursor ist weitergerückt, und
      // sollte der Eintrag doch erneut kommen, fängt ihn die _alexaId-Prüfung.
      console.warn('[alexa] ack failed:',e&&e.message||e);
    });
  }

  function sync(opts){
    opts=opts||{};
    var token=getToken();
    if(!token)return Promise.resolve({ok:false,reason:'no_token'});
    if(_inFlight)return _inFlight;
    var now=Date.now();
    if(!opts.force&&now-_lastSyncAt<SYNC_MIN_INTERVAL_MS){
      return Promise.resolve({ok:false,reason:'throttled'});
    }
    var since=parseInt(localStorage.getItem(KEY_LAST)||'0',10);
    if(!isFinite(since))since=0;
    var url=getWorkerBase().replace(/\/+$/,'')+'/alexa/inbox'+(since?('?since='+since):'');
    _lastSyncAt=now;
    _inFlight=fetch(url,{method:'GET',headers:{'X-User-Token':token},cache:'no-store'})
      .then(function(r){
        if(!r.ok)throw new Error('http '+r.status);
        return r.json();
      })
      .then(function(j){
        var data=j&&j.data;
        var arr=(data&&Array.isArray(data.items))?data.items:[];
        if(!arr.length)return {ok:true,added:0,total:0};
        var maxSrev=since;
        var meals=[],handled=[],added=0;
        arr.forEach(function(item){
          if(item&&isFinite(item.srev)&&item.srev>maxSrev)maxSrev=item.srev;
          if(!item||!item.kind)return;
          if(item.kind==='meal'){meals.push(item);return;}
          var ok=false;
          if(item.kind==='shop')ok=applyShop(item);
          else if(item.kind==='baby')ok=applyBaby(item);
          else if(item.kind==='water')ok=applyWater(item);
          else if(item.kind==='exercise')ok=applyExercise(item);
          // Auch ein nicht eingetragener Einwurf (Tagebuch aus, Tag verdichtet,
          // Duplikat) wird quittiert — sonst bliebe er für immer im Briefkasten.
          handled.push(item.id);
          if(ok)added++;
        });
        return new Promise(function(resolve){
          applyMeals(meals,function(mealAdded,mealsOk){
            added+=mealAdded;
            _finish(added);
            // Cursor und Quittung kommen ZUSAMMEN und ERST JETZT. Rueckte der
            // Cursor schon vor dem Eintragen vor und der Naehrwert-Abruf
            // scheiterte, waere der Einwurf unwiederbringlich weg: quittiert
            // wurde er nicht, aber abgeholt wird er auch nie wieder.
            if(mealsOk){
              meals.forEach(function(m){handled.push(m.id);});
              if(maxSrev>since)localStorage.setItem(KEY_LAST,String(maxSrev));
            }
            // Mahlzeiten offen: Cursor stehen lassen, damit der naechste Lauf
            // alles erneut sieht. Was schon eingetragen ist, faengt die
            // _alexaId-Pruefung ab; die Nicht-Mahlzeiten sind quittiert und
            // damit serverseitig weg.
            ack(handled).then(function(){
              resolve({ok:true,added:added,total:arr.length,mealsPending:!mealsOk});
            });
          });
        });
      })
      .catch(function(e){
        console.warn('[alexa] sync failed:',e&&e.message||e);
        return {ok:false,reason:'fetch',error:String(e&&e.message||e)};
      })
      .then(function(res){_inFlight=null;return res;});
    return _inFlight;
  }

  window.NTAlexa={
    getToken:getToken,setToken:setToken,clearToken:clearToken,generateToken:generateToken,
    getWorkerBase:getWorkerBase,setWorkerBase:setWorkerBase,
    sync:sync,onMutation:onMutation,endpointInfo:endpointInfo,
  };
})();
