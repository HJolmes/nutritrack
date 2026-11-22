// @ts-check
// NutriTrack – lokale, datenbasierte Babyschlaf-Prognose.
// Reine Berechnung: keine Netzwerkaufrufe, kein Speichern, keine Diagnose.
(function(){
'use strict';
var MIN=60000, DAY=86400000;
function cap(v,a,b){return Math.max(a,Math.min(b,v));}
function clock(ms){var d=new Date(ms);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function hour(ms){var d=new Date(ms);return d.getHours()+d.getMinutes()/60;}
function hourDistance(a,b){var d=Math.abs(a-b);return Math.min(d,24-d);}
function localTime(key,time){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return NaN;
  var p=key.split('-').map(Number),t=time.split(':').map(Number);
  var d=new Date(p[0],p[1]-1,p[2],t[0],t[1]);
  if(d.getFullYear()!==p[0]||d.getMonth()!==p[1]-1||d.getDate()!==p[2])return NaN;
  return d.getTime();
}
function nextDay(key){
  var p=key.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]+1);
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
function ageInDays(birth,now){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birth||''))return null;
  var p=birth.split('-').map(Number),b=Date.UTC(p[0],p[1]-1,p[2]);
  var n=new Date(now),d=Date.UTC(n.getFullYear(),n.getMonth(),n.getDate());
  var age=Math.round((d-b)/DAY);
  return age>=0&&age<7300?age:null;
}
function wakePrior(age){
  if(age===null)return [55,85,125];
  if(age<35)return [35,55,85];
  if(age<90)return [55,80,120];
  if(age<120)return [65,95,135];
  if(age<180)return [80,115,165];
  if(age<270)return [105,150,220];
  if(age<365)return [140,190,270];
  if(age<540)return [180,240,340];
  return [210,300,420];
}
function quantile(data,p){
  if(!data.length)return NaN;
  var s=data.slice().sort(function(a,b){return a.v-b.v;});
  var total=s.reduce(function(v,x){return v+x.w;},0),seen=0;
  for(var i=0;i<s.length;i++){seen+=s[i].w;if(seen>=total*p)return s[i].v;}
  return s[s.length-1].v;
}
// Vollständige historische Daten lesen, ohne das Tagebuch zu verändern.
// Alte Daten haben wegen des sich entwickelnden Schlafrhythmus weniger Gewicht.
function collect(babyLog,now){
  var sleeps=[],feeds=[],health=[],ids={};
  Object.keys(babyLog||{}).forEach(function(key){
    var rows=babyLog[key];if(!Array.isArray(rows))return;
    rows.forEach(function(e){
      if(!e||typeof e!=='object')return;
      if(e.t==='sleep'&&e.from){
        var start=localTime(key,e.from);
        if(!Number.isFinite(start)||start>now+5*MIN)return;
        // ts erhält bei der doppelten Stunde der Zeitumstellung die korrekte Instanz.
        if(Number.isFinite(e.ts)&&Math.abs(e.ts-start)<=60*MIN&&clock(e.ts)===e.from)start=e.ts;
        var end=null;
        if(e.to){
          end=localTime(key,e.to);
          if(!Number.isFinite(end))return;
          if(end<start)end=localTime(nextDay(key),e.to);
          if(!Number.isFinite(end)||end<=start||end>now+5*MIN||end-start>18*60*MIN)return;
          if(end-start<5*MIN)return;
        }
        // Nach langer Zeit nicht mehr als laufenden Schlaf interpretieren.
        if(end===null&&now-start>18*60*MIN)return;
        var item={start:start,end:end,id:e.id||'',rev:Number(e.rev)||0};
        if(item.id){
          var old=ids[item.id];
          if(old&&old.rev>=item.rev)return;
          ids[item.id]=item;
        }else sleeps.push(item);
      }else if((e.t==='breast'||e.t==='bottle'||e.t==='solid')&&Number.isFinite(e.ts)&&e.ts<=now&&e.ts>0){
        var fEnd=e.ts+((e.t==='breast'&&!e.run)?cap(Number(e.min)||0,0,90)*MIN:0);
        feeds.push(Math.min(fEnd,now));
      }else if(e.t==='temp'&&Number(e.c)>=38&&Number.isFinite(e.ts)&&e.ts<=now&&now-e.ts<=48*60*MIN){
        health.push(e.ts);
      }
    });
  });
  Object.keys(ids).forEach(function(id){sleeps.push(ids[id]);});
  sleeps.sort(function(a,b){return a.start-b.start;});
  feeds.sort(function(a,b){return a-b;});
  return {sleeps:sleeps,feeds:feeds,hasRecentFever:health.length>0};
}
function fed(feeds,a,b){
  // Ein einzelner protokollierter Fütterungseintrag genügt als schwaches Kontextsignal.
  for(var i=feeds.length-1;i>=0;i--){
    if(feeds[i]<a)return false;
    if(feeds[i]<=b)return true;
  }
  return false;
}
function weight(at,now,typicalHour,feedingMatch){
  var ago=Math.max(0,(now-at)/DAY);
  var w=Math.exp(-ago/20)*(0.52+0.48*Math.exp(-hourDistance(hour(at),typicalHour)/4));
  // Ältere Muster schwächen wir ab, statt sie abrupt zu verwerfen.
  if(feedingMatch!==null)w*=feedingMatch?1.12:0.94;
  return w;
}
function estimateWake(sleeps,feeds,last,now,age){
  var prior=wakePrior(age),samples=[
    {v:prior[0],w:0.6},{v:prior[1],w:1.4},{v:prior[2],w:0.6}
  ];
  var used=0,observed=0;
  var currentFed=fed(feeds,last.end,now);
  for(var i=1;i<sleeps.length;i++){
    var prev=sleeps[i-1],next=sleeps[i];
    if(prev.end===null||next.start>now)continue;
    var gap=(next.start-prev.end)/MIN;
    if(gap<20||gap>Math.max(480,prior[2]*2))continue;
    var sampleFed=fed(feeds,prev.end,next.start);
    var w=weight(prev.end,now,hour(last.end),feeds.length>=6?sampleFed===currentFed:null);
    // Ähnliche vorangehende Schlafdauer ist ein schwaches zusätzliches Signal.
    var oldLen=(prev.end-prev.start)/MIN,lastLen=(last.end-last.start)/MIN;
    if(oldLen>0&&lastLen>0){
      w*=0.75+0.25*Math.min(oldLen,lastLen)/Math.max(oldLen,lastLen);
      if((oldLen>=180)===(lastLen>=180))w*=1.1;
    }
    if(w<0.002)continue;
    samples.push({v:gap,w:w});used++;observed+=w;
  }
  var median=quantile(samples,0.5),lo=quantile(samples,0.25),hi=quantile(samples,0.75);
  // Als Schlaffenster mindestens 20 Minuten ausweisen.
  lo=Math.max(20,Math.min(lo,median-10));
  hi=Math.min(600,Math.max(hi,median+10));
  return {lo:lo,mid:median,hi:hi,count:used,effective:observed};
}
function estimateDuration(sleeps,at,now,age,lastWake){
  var night=hour(at)>=19||hour(at)<6;
  var prior=night?(age!==null&&age<120?[60,135,260]:[80,175,360]):[25,50,95];
  var samples=[
    {v:prior[0],w:0.55},{v:prior[1],w:1.3},{v:prior[2],w:0.55}
  ],used=0,observed=0;
  sleeps.forEach(function(s,i){
    if(s.end===null||s.start>=now)return;
    var len=(s.end-s.start)/MIN,wasNight=hour(s.start)>=19||hour(s.start)<6;
    if(len<5||len>1080||wasNight!==night)return;
    var w=weight(s.start,now,hour(at),null);
    // Eine ähnliche Wachphase vor dem Schlaf zählt etwas stärker.
    var previous=i>0?sleeps[i-1]:null;
    if(lastWake!==null&&previous&&previous.end!==null){
      var currentGap=(at-lastWake)/MIN,oldGap=(s.start-previous.end)/MIN;
      if(currentGap>=20&&oldGap>=20&&oldGap<=600)w*=0.8+0.2*Math.exp(-Math.abs(currentGap-oldGap)/100);
    }
    if(w<0.002)return;
    samples.push({v:len,w:w});observed+=w;used++;
  });
  var mid=quantile(samples,0.5);
  return {
    lo:Math.max(10,Math.min(quantile(samples,0.25),mid-(night?25:12))),
    mid:mid,
    hi:Math.min(1080,Math.max(quantile(samples,0.75),mid+(night?25:12))),
    count:used,effective:observed
  };
}
function quality(w,d){
  if(w>=12&&d>=12)return 'mittel';
  if(w>=5&&d>=5)return 'vorsichtig';
  return 'grob';
}
function predict(babyLog,birth,at){
  var now=Number.isFinite(at)?at:Date.now();
  var data=collect(babyLog,now),sleep=data.sleeps,age=ageInDays(birth,now);
  var latest=sleep.length?sleep[sleep.length-1]:null;
  if(!latest)return {kind:'empty',ageDays:age,n:0};
  var isSleeping=latest.end===null&&latest.start<=now;
  if(!isSleeping&&(latest.end===null||now-latest.end>16*60*MIN)){
    return {kind:'stale',ageDays:age,n:sleep.length};
  }
  if(isSleeping){
    var dur=estimateDuration(sleep,latest.start,now,age,null),elapsed=(now-latest.start)/MIN;
    if(elapsed>dur.hi+90)return {kind:'uncertain',ageDays:age,n:dur.count};
    return {
      kind:'sleeping',ageDays:age,from:latest.start,
      duration:dur,
      wakeLow:Math.max(now,latest.start+dur.lo*MIN),
      wakeHigh:Math.max(now+15*MIN,latest.start+dur.hi*MIN),
      quality:dur.count>=8?'vorsichtig':'grob',
      n:dur.count,healthCaution:data.hasRecentFever
    };
  }
  var w=estimateWake(sleep,data.feeds,latest,now,age);
  var startLow=Math.max(now,latest.end+w.lo*MIN);
  var startHigh=Math.max(now+15*MIN,latest.end+w.hi*MIN);
  // Versäumte Einträge nicht mit einer erfundenen Zukunftsprognose überdecken.
  if(now>latest.end+w.hi*MIN+120*MIN)return {kind:'uncertain',ageDays:age,n:w.count};
  var d=estimateDuration(sleep,startLow,now,age,latest.end);
  return {
    kind:'awake',ageDays:age,from:latest.end,
    startLow:startLow,startHigh:startHigh,
    duration:d,wakeLow:startLow+d.lo*MIN,wakeHigh:startHigh+d.hi*MIN,
    quality:quality(w.count,d.count),n:w.count,
    healthCaution:data.hasRecentFever,feedingObserved:data.feeds.length>0
  };
}
function cardHtml(babyLog,birth,now){
  var r=predict(babyLog,birth,now);
  var lead='',detail='';
  if(r.kind==='empty')return '<div style="margin-top:7px;font-size:12px;color:var(--mu);">😴 Schlafprognose: Beginn und Ende der Schläfchen eintragen, um eine Schätzung zu erhalten.</div>';
  if(r.kind==='stale'||r.kind==='uncertain')return '<div style="margin-top:7px;font-size:12px;color:var(--mu);">😴 Schlafprognose: Bitte Schlafprotokoll ergänzen – die letzten Daten reichen aktuell nicht für eine Schätzung.</div>';
  if(r.kind==='sleeping'){
    lead='😴 Voraussichtlich wach: '+clock(r.wakeLow)+'–'+clock(r.wakeHigh);
    detail='Geschätzte Schlafdauer '+Math.round(r.duration.lo)+'–'+Math.round(r.duration.hi)+' Min. · '+r.n+' Vergleichsschläfchen';
  }else{
    lead='😴 Nächster Schlaf: '+clock(r.startLow)+'–'+clock(r.startHigh);
    detail='Vermutliche Dauer '+Math.round(r.duration.lo)+'–'+Math.round(r.duration.hi)+' Min. · Aufwachen ca. '+clock(r.wakeLow)+'–'+clock(r.wakeHigh);
  }
  var sub=r.quality==='grob'?'Grobe Orientierung (wenige Vergleichsdaten)':
    r.quality==='vorsichtig'?'Vorsichtige Schätzung':'Datenbasierte Schätzung';
  if(r.healthCaution)sub+=' · Bei Fieber weniger verlässlich';
  return '<div style="margin-top:7px;padding:9px 10px;background:var(--gl);border:1px solid var(--br);border-radius:11px;line-height:1.45;">'
    +'<div style="font-size:12px;font-weight:800;color:var(--g1);">'+lead+'</div>'
    +'<div style="font-size:11px;color:var(--tx);margin-top:2px;">'+detail+'</div>'
    +'<div style="font-size:10px;color:var(--mu);margin-top:3px;">'+sub+' · Kein fester Schlafplan</div></div>';
}
window.NTBabySleep={predict:predict,cardHtml:cardHtml};
})();