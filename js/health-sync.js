// NutriTrack — Health Sync Module
// Pulls workouts that an Apple Health (iOS Shortcut) or Samsung Health
// (Android HTTP Request Shortcut / Tasker) automation has POSTed to the
// Cloudflare Worker. Imported workouts are appended to the existing
// `S.days[date].exercise[]` so the calorie-deficit logic in renderAll()
// already accounts for them — no separate render path needed.
//
// Public surface (window.NTHealth):
//   getToken() / setToken(t) / clearToken() / generateToken()
//   getWorkerBase() / setWorkerBase(url)
//   sync()                — pulls new workouts since last poll
//   shortcutInstructions()— returns rendered HTML instructions
//   onMutation(cb)        — register callback for "new workouts arrived"
//
// State:
//   localStorage.nt_health_token     — per-user 32-char token (Base58-ish)
//   localStorage.nt_health_worker    — override worker base URL (optional)
//   localStorage.nt_health_lastpoll  — last poll timestamp in ms

(function(){
  var DEFAULT_WORKER='https://nutritrack-ai-proxy.h-jolmes.workers.dev';
  var TOKEN_LEN=32;
  var TOKEN_ALPHABET='23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  var KEY_TOKEN='nt_health_token';
  var KEY_WORKER='nt_health_worker';
  var KEY_LAST='nt_health_lastpoll';
  var SYNC_MIN_INTERVAL_MS=15*1000; // throttle: don't sync more than every 15s
  var _listeners=[];
  var _lastSyncAt=0;
  var _inFlight=null;

  function getToken(){return localStorage.getItem(KEY_TOKEN)||'';}
  function setToken(t){
    if(typeof t!=='string'||!/^[A-Za-z0-9_-]{24,64}$/.test(t)){
      throw new Error('invalid token format');
    }
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

  function _emoji(source,type){
    var t=(type||'').toLowerCase();
    if(/run/.test(t))return '🏃';
    if(/walk|hik/.test(t))return '🚶';
    if(/cycl|bik/.test(t))return '🚴';
    if(/swim/.test(t))return '🏊';
    if(/yoga/.test(t))return '🧘';
    if(/strength|weight|gym/.test(t))return '🏋️';
    if(/row/.test(t))return '🚣';
    if(/elliptical/.test(t))return '🌀';
    if(/dance/.test(t))return '💃';
    if(/soccer|football/.test(t))return '⚽';
    if(/tennis/.test(t))return '🎾';
    return '🏃';
  }
  function _name(workout){
    if(workout.type)return workout.type;
    if(/apple/i.test(workout.source))return 'Apple Health';
    if(/samsung/i.test(workout.source))return 'Samsung Health';
    return 'Workout';
  }
  function _dayKey(startIso){
    // Use the local-date portion of the ISO string. Workouts at 23:50 in
    // Europe/Berlin shouldn't get bucketed into the next UTC day.
    var d=new Date(startIso);
    if(isNaN(d.getTime()))return null;
    var y=d.getFullYear();
    var m=String(d.getMonth()+1).padStart(2,'0');
    var dd=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+dd;
  }

  function _appendWorkout(w){
    if(!window.S||!window.S.days)return false;
    var key=_dayKey(w.start);
    if(!key)return false;
    if(!window.S.days[key]){
      window.S.days[key]={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},water:0,exercise:[]};
    }
    var day=window.S.days[key];
    if(!day.exercise)day.exercise=[];
    // Dedup by id+source (id from worker is the workout's UUID/timestamp).
    var dupId='health:'+w.source+':'+w.id;
    for(var i=0;i<day.exercise.length;i++){
      if(day.exercise[i]&&day.exercise[i]._healthId===dupId)return false;
    }
    day.exercise.push({
      name:_name(w),
      emoji:_emoji(w.source,w.type),
      duration:w.durationSec?Math.round(w.durationSec/60):null,
      intensity:'medium',
      kcal:Math.round(w.kcal||0),
      ts:Date.parse(w.start)||Date.now(),
      _healthId:dupId,
      _source:w.source,
      _type:w.type||null,
      _distanceM:w.distanceM||null,
      _hrAvg:w.hrAvg||null,
    });
    return true;
  }

  function _onMutation(addedCount){
    if(!addedCount)return;
    if(typeof window.saveS==='function')window.saveS();
    if(typeof window.renderAll==='function')window.renderAll();
    for(var i=0;i<_listeners.length;i++){
      try{_listeners[i](addedCount);}catch(e){console.error('[health] listener',e);}
    }
  }

  function onMutation(cb){if(typeof cb==='function')_listeners.push(cb);}

  function sync(opts){
    opts=opts||{};
    var token=getToken();
    if(!token)return Promise.resolve({ok:false,reason:'no_token'});
    var now=Date.now();
    if(_inFlight)return _inFlight;
    if(!opts.force&&now-_lastSyncAt<SYNC_MIN_INTERVAL_MS){
      return Promise.resolve({ok:false,reason:'throttled'});
    }
    var since=parseInt(localStorage.getItem(KEY_LAST)||'0',10);
    if(!Number.isFinite(since))since=0;
    var url=getWorkerBase().replace(/\/+$/,'')+'/workouts'+(since?('?since='+since):'');
    _lastSyncAt=now;
    _inFlight=fetch(url,{
      method:'GET',
      headers:{'X-User-Token':token},
      cache:'no-store',
    }).then(function(r){
      if(!r.ok)throw new Error('http '+r.status);
      return r.json();
    }).then(function(j){
      var data=j&&j.data;
      var arr=(data&&Array.isArray(data.workouts))?data.workouts:[];
      var added=0;
      var maxStartMs=since;
      for(var i=0;i<arr.length;i++){
        var w=arr[i];
        if(_appendWorkout(w))added++;
        if(w&&Number.isFinite(w.startMs)&&w.startMs>maxStartMs)maxStartMs=w.startMs;
      }
      // Only advance the watermark if we actually saw newer workouts.
      // Otherwise a missed sync (offline, throttle) wouldn't reset the cursor.
      if(maxStartMs>since){
        localStorage.setItem(KEY_LAST,String(maxStartMs));
      }
      _onMutation(added);
      return {ok:true,added:added,total:arr.length};
    }).catch(function(e){
      console.warn('[health] sync failed:',e&&e.message||e);
      return {ok:false,reason:'fetch',error:String(e&&e.message||e)};
    }).then(function(res){
      _inFlight=null;
      return res;
    });
    return _inFlight;
  }

  function shortcutInstructions(){
    var token=getToken()||'<DEIN-TOKEN>';
    var base=getWorkerBase();
    var url=base.replace(/\/+$/,'')+'/workout';
    var body=[
      '{',
      '  "id": "<eindeutige-id>",',
      '  "source": "apple-health",',
      '  "type": "Running",',
      '  "start": "<ISO-Zeitstempel>",',
      '  "durationSec": 1800,',
      '  "kcal": 320',
      '}'
    ].join('\n');
    return {url:url,token:token,body:body};
  }

  window.NTHealth={
    getToken:getToken,
    setToken:setToken,
    clearToken:clearToken,
    generateToken:generateToken,
    getWorkerBase:getWorkerBase,
    setWorkerBase:setWorkerBase,
    sync:sync,
    onMutation:onMutation,
    shortcutInstructions:shortcutInstructions,
  };
})();
