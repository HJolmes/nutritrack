// @ts-check
// NutriTrack – personalisierte Babyschlaf-Prognose (Tag/Nacht, v2).
// Reine lokale Berechnung: kein Netzwerk, keine Datenmutation, keine medizinische Aussage.
(function(){
'use strict';
var MIN=60000,DAY=86400000;
function cap(v,a,b){return Math.max(a,Math.min(b,v));}
function clock(ms){var d=new Date(ms);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function hour(ms){var d=new Date(ms);return d.getHours()+d.getMinutes()/60;}
function distance(a,b){var d=Math.abs(a-b);return Math.min(d,24-d);}
function dateKey(ms){var d=new Date(ms);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function localTime(key,time){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return NaN;
  var p=key.split('-').map(Number),t=time.split(':').map(Number),d=new Date(p[0],p[1]-1,p[2],t[0],t[1]);
  if(d.getFullYear()!==p[0]||d.getMonth()!==p[1]-1||d.getDate()!==p[2])return NaN;
  return d.getTime();
}
function nextDay(key){var p=key.split('-').map(Number);return dateKey(new Date(p[0],p[1]-1,p[2]+1).getTime());}
function ageInDays(birth,now){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birth||''))return null;
  var p=birth.split('-').map(Number),b=Date.UTC(p[0],p[1]-1,p[2]);
  var n=new Date(now),age=Math.round((Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())-b)/DAY);
  return age>=0&&age<7300?age:null;
}
function wakePrior(age,nightReturn){
  if(nightReturn)return [15,40,95];
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
function quantile(rows,q){
  var s=rows.slice().sort(function(a,b){return a.v-b.v;}),sum=s.reduce(function(t,r){return t+r.w;},0),n=0;
  for(var i=0;i<s.length;i++){n+=s[i].w;if(n>=sum*q)return s[i].v;}
  return s[s.length-1].v;
}
function weight(at,now,targetHour){
  var days=Math.max(0,(now-at)/DAY);
  return Math.exp(-days/20)*(0.5+0.5*Math.exp(-distance(hour(at),targetHour)/4));
}
function coreMinutes(start,end){
  if(end===null)return 0;
  // Kernnacht 23–05 Uhr; echte lokale Date-Objekte berücksichtigen Zeitumstellungen.
  var p=new Date(start),total=0;
  for(var offset=-1;offset<=1;offset++){
    var a=new Date(p.getFullYear(),p.getMonth(),p.getDate()+offset,23,0).getTime();
    var b=new Date(p.getFullYear(),p.getMonth(),p.getDate()+offset+1,5,0).getTime();
    total+=Math.max(0,Math.min(end,b)-Math.max(start,a))/MIN;
  }
  return total;
}
function collect(babyLog,now){
  var sleeps=[],feeds=[],care=[],fever=false,ids={};
  Object.keys(babyLog||{}).forEach(function(key){
    var rows=babyLog[key];if(!Array.isArray(rows))return;
    rows.forEach(function(e){
      if(!e||typeof e!=='object')return;
      if(e.t==='sleep'&&e.from){
        var start=localTime(key,e.from);
        if(!Number.isFinite(start)||start>now+5*MIN)return;
        if(Number.isFinite(e.ts)&&Math.abs(e.ts-start)<=60*MIN&&clock(e.ts)===e.from)start=e.ts;
        var end=null;
        if(e.to){
          end=localTime(key,e.to);
          if(!Number.isFinite(end))return;
          if(end<start)end=localTime(nextDay(key),e.to);
          if(!Number.isFinite(end)||end<=start||end>now+5*MIN||end-start>18*60*MIN||end-start<5*MIN)return;
        }
        if(end===null&&now-start>18*60*MIN)return;
        var item={start:start,end:end,id:e.id||'',rev:Number(e.rev)||0,
          manual:e.sleepType==='night'?'night':e.sleepType==='day'?'day':'',
          type:'day',day:key};
        if(item.id){
          if(ids[item.id]&&ids[item.id].rev>=item.rev)return;
          ids[item.id]=item;
        }else sleeps.push(item);
      }else if((e.t==='breast'||e.t==='bottle'||e.t==='solid')&&Number.isFinite(e.ts)&&e.ts>0&&e.ts<=now){
        var mins=e.t==='breast'?(e.run?10:cap(Number(e.min)||10,1,90)):10;
        var until=e.ts+mins*MIN;
        feeds.push(Math.min(now,until));
        // Wiederkehrende nächtliche Versorgungen als Ausschlussfenster,
        // nicht als Beweis für Schlaf am Tag.
        care.push({start:e.ts-3*MIN,end:until+5*MIN});
      }else if(e.t==='diaper'&&Number.isFinite(e.ts)&&e.ts>0&&e.ts<=now){
        // Nur Zeitpunkt bekannt, Dauer nicht: großzügiges Zeitpolster.
        care.push({start:e.ts-5*MIN,end:e.ts+8*MIN});
      }else if(e.t==='temp'&&Number(e.c)>=38&&Number.isFinite(e.ts)&&e.ts<=now&&now-e.ts<=48*60*MIN){
        fever=true;
      }
    });
  });
  Object.keys(ids).forEach(function(id){sleeps.push(ids[id]);});
  sleeps.sort(function(a,b){return a.start-b.start;});
  feeds.sort(function(a,b){return a-b;});
  return {sleeps:sleeps,feeds:feeds,care:care,fever:fever};
}

// Grenzen ausschließlich für unbestätigte historische Nachtabschnitte.
// Keine Ableitung einer Einschlaf- oder morgendlichen Aufwachzeit aus diesen Grenzen.
function validNightWindow(value){
  if(!value||typeof value!=='object')return false;
  var a=value.start,b=value.end;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(a||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b||''))return false;
  var start=(+a.slice(0,2))*60+(+a.slice(3)),end=(+b.slice(0,2))*60+(+b.slice(3));
  return start>=17*60&&start<=23*60+30&&end>=4*60&&end<=11*60&&
    (1440-start+end)>=6*60&&(1440-start+end)<=16*60;
}
function nightWindow(opts){
  return validNightWindow(opts)?{start:opts.start,end:opts.end}:{start:'20:00',end:'07:00'};
}
function inferredNightHistory(data,now,opts){
  var setting=nightWindow(opts),parts=[],nightCount=0,nightDates=[];
  var current=new Date(now),base=new Date(current.getFullYear(),current.getMonth(),current.getDate());
  // Maximal 30 historische Nächte; die aktuelle Nacht niemals schätzen.
  for(var back=1;back<=30;back++){
    var d=new Date(base.getFullYear(),base.getMonth(),base.getDate()-back);
    var key=dateKey(d.getTime()),nightStart=localTime(key,setting.start);
    var nightEnd=localTime(nextDay(key),setting.end);
    if(!Number.isFinite(nightStart)||!Number.isFinite(nightEnd)||nightEnd>now-15*MIN)continue;
    var events=data.care.filter(function(e){return e.end>nightStart&&e.start<nightEnd;});
    // Ohne Nachtversorgung ist unklar, seit wann das Tagebuch vollständig genutzt wurde.
    if(!events.length)continue;
    var blocked=[];
    events.forEach(function(e){blocked.push({start:Math.max(nightStart,e.start),end:Math.min(nightEnd,e.end),real:false});});
    // Dokumentierter Schlaf bleibt die einzige verbindliche Messung.
    data.sleeps.forEach(function(s){
      var end=s.end===null?now:s.end;
      if(end>nightStart&&s.start<nightEnd){
        blocked.push({start:Math.max(nightStart,s.start),end:Math.min(nightEnd,end),real:true});
      }
    });
    blocked.sort(function(a,b){return a.start-b.start;});
    var merged=[];
    blocked.forEach(function(b){
      if(merged.length&&b.start<=merged[merged.length-1].end+12*MIN){
        merged[merged.length-1].end=Math.max(merged[merged.length-1].end,b.end);
      }else merged.push({start:b.start,end:b.end});
    });
    var cursor=nightStart,added=false;
    merged.concat([{start:nightEnd,end:nightEnd}]).forEach(function(b){
      if(b.start-cursor>=20*MIN){
        parts.push({start:cursor,end:b.start,type:'night',inferred:true,
          // Randstücke sind besonders ungewiss: Bett-/Aufstehzeiten sind Annahmen.
          edge:cursor===nightStart||b.start===nightEnd,night:key,
          id:'',manual:'',day:key});
        added=true;
      }
      cursor=Math.max(cursor,b.end);
    });
    if(added){nightCount++;nightDates.push(key);}
  }
  parts.sort(function(a,b){return a.start-b.start;});
  return {sleeps:parts,nights:nightCount,dates:nightDates,window:setting};
}

function inNightCorridor(ms){
  var h=hour(ms);return h>=17.5||h<9;
}
function nearNight(a,b){
  if(a.manual==='day'||b.manual==='day')return false;
  var gap=(b.start-(a.end===null?b.start:a.end))/MIN;
  if(gap<0||gap>100)return false;
  // Der verbundene Schlaf darf weder mitten am Tag beginnen noch mittags enden.
  return inNightCorridor(a.start)&&inNightCorridor(b.start);
}
function classifySleeps(sleeps,now){
  // Manuell gesetzte Zuordnungen sind immer verbindlich.
  sleeps.forEach(function(s){
    if(s.manual){s.type=s.manual;return;}
    var len=(s.end===null?now:s.end)-s.start,hr=hour(s.start);
    var anchor=coreMinutes(s.start,s.end)>=20 ||
      (len>=150*MIN&&(hr>=18||hr<6));
    s.type=anchor?'night':'day';
  });
  // Kurze Aufwachphasen können zu derselben Nacht gehören. Die Verbindung
  // endet an manuell markiertem Tagschlaf und jenseits des Nachtkorridors.
  var changed=true,passes=0;
  while(changed&&passes++<sleeps.length){
    changed=false;
    for(var i=1;i<sleeps.length;i++){
      var a=sleeps[i-1],b=sleeps[i];
      if(!nearNight(a,b))continue;
      if(a.type==='night'&&!b.manual&&b.type!=='night'){b.type='night';changed=true;}
      if(b.type==='night'&&!a.manual&&a.type!=='night'){a.type='night';changed=true;}
    }
  }
  // Für einen gerade begonnenen Abendschlaf: aus vergangenen Nachtanfängen
  // lernen, statt bis nach 23 Uhr mit der Zuordnung zu warten.
  var groups=nightGroups(sleeps);
  var beds=groups.filter(function(g){
    var h=hour(g.start),span=(g.end-g.start)/MIN;
    return (h>=17.5||h<2)&&span>=180&&coreMinutes(g.start,g.end)>=20&&g.end<now-8*60*MIN;
  }).slice(-28).map(function(g){return hour(g.start)<12?hour(g.start)+24:hour(g.start);});
  if(beds.length>=2){
    var bMed=quantile(beds.map(function(v){return {v:v,w:1};}),0.5);
    sleeps.forEach(function(s){
      if(s.manual||s.type==='night'||s.end!==null)return;
      var h=hour(s.start);if(h<12)h+=24;
      if(inNightCorridor(s.start)&&Math.abs(h-bMed)<=1.25)s.type='night';
    });
  }
  return sleeps;
}
function nightGroups(sleeps){
  var groups=[],g=null;
  sleeps.forEach(function(s){
    if(s.type!=='night'){g=null;return;}
    var end=s.end===null?s.start:s.end;
    if(g&&s.start-g.end>=0&&s.start-g.end<=110*MIN){
      g.end=Math.max(g.end,end);g.count++;g.items.push(s);
    }else{
      g={start:s.start,end:end,count:1,items:[s]};
      groups.push(g);
    }
  });
  return groups;
}
function fed(feeds,a,b){
  for(var i=feeds.length-1;i>=0;i--){if(feeds[i]<a)return false;if(feeds[i]<=b)return true;}
  return false;
}
function duration(sleeps,type,at,now,age,previousEnd){
  var prior=type==='night'?(age!==null&&age<120?[60,135,260]:[80,175,360]):[25,50,95];
  var rows=[{v:prior[0],w:0.55},{v:prior[1],w:1.3},{v:prior[2],w:0.55}],n=0,estRows=[];
  sleeps.forEach(function(s,i){
    if(s.end===null||s.type!==type||s.start>=now)return;
    var v=(s.end-s.start)/MIN,w=weight(s.start,now,hour(at));
    if(previousEnd!==null&&i>0&&sleeps[i-1].end!==null){
      var gap=(s.start-sleeps[i-1].end)/MIN,target=(at-previousEnd)/MIN;
      if(gap>=0&&gap<600&&target>=0)w*=0.8+0.2*Math.exp(-Math.abs(gap-target)/100);
    }
    if(s.inferred){
      // Hypothesen nur als schwache Vorinformation, insgesamt gedeckelt.
      estRows.push({v:v,w:w*(s.edge?0.12:0.32)});return;
    }
    if(w<0.002)return;rows.push({v:v,w:w});n++;
  });
  var total=estRows.reduce(function(sum,r){return sum+r.w;},0);
  var factor=total>3?3/total:1;
  estRows.forEach(function(r){rows.push({v:r.v,w:r.w*factor});});
  var mid=quantile(rows,0.5),pad=type==='night'?25:12;
  return {lo:Math.max(10,Math.min(quantile(rows,0.25),mid-pad)),
    mid:mid,hi:Math.min(1080,Math.max(quantile(rows,0.75),mid+pad)),count:n,assumedCount:estRows.length};
}
function gapEstimate(sleeps,feeds,last,nextType,now,age){
  var isNightReturn=last.type==='night'&&nextType==='night';
  var prior=wakePrior(age,isNightReturn);
  var rows=[{v:prior[0],w:0.6},{v:prior[1],w:1.3},{v:prior[2],w:0.6}],count=0;
  var fedNow=fed(feeds,last.end,now);
  for(var i=1;i<sleeps.length;i++){
    var p=sleeps[i-1],n=sleeps[i];
    if(p.end===null||n.start>now||p.type!==last.type||n.type!==nextType)continue;
    var value=(n.start-p.end)/MIN;
    if(value<0||value>Math.max(450,prior[2]*2))continue;
    var w=weight(p.end,now,hour(last.end));
    var plen=(p.end-p.start)/MIN,ll=(last.end-last.start)/MIN;
    if(plen>0&&ll>0)w*=0.75+0.25*Math.min(plen,ll)/Math.max(plen,ll);
    if(feeds.length>=6)w*=fed(feeds,p.end,n.start)===fedNow?1.12:0.94;
    if(w<0.002)continue;
    if(p.inferred||n.inferred){
      // Nur Rückschlüsse auf nächtliche Versorgungspausen, keine echte Wachmessung.
      rows.push({v:value,w:w*0.15});
    }else{rows.push({v:value,w:w});count++;}
  }
  var mid=quantile(rows,0.5);
  return {lo:Math.max(10,Math.min(quantile(rows,0.25),mid-12)),
    mid:mid,hi:Math.max(quantile(rows,0.75),mid+12),count:count};
}
function bedtime(sleeps,now){
  var groups=nightGroups(sleeps.filter(function(s){return !s.inferred;})),sample=[];
  groups.forEach(function(g){
    var h=hour(g.start),minutes=(h<12?h+24:h)*60;
    if((h<17.5&&h>=2)||g.end-g.start<180*MIN||coreMinutes(g.start,g.end)<20||g.end>now-8*60*MIN)return;
    sample.push({v:minutes,w:Math.exp(-Math.max(0,(now-g.start)/DAY)/20)});
  });
  if(sample.length<2)return null;
  return {minutes:quantile(sample,0.5),low:quantile(sample,0.25),high:quantile(sample,0.75),count:sample.length};
}
function morning(sleeps,from,now){
  var groups=nightGroups(sleeps.filter(function(s){return !s.inferred;})),rows=[];
  groups.forEach(function(g){
    var h=hour(g.start),endHour=hour(g.end);
    // Nur abgeschlossene Nachtfolgen, nicht einen einzelnen Block als "Morgen".
    if((h<17.5&&h>=2)||g.end-g.start<240*MIN||coreMinutes(g.start,g.end)<30||
      endHour<4||endHour>10.5||now-g.end<12*60*MIN)return;
    rows.push({v:endHour*60,w:Math.exp(-Math.max(0,(now-g.end)/DAY)/20)});
  });
  if(rows.length<3)return null;
  var f=new Date(from),date=new Date(f.getFullYear(),f.getMonth(),f.getDate());
  if(hour(from)>=12)date.setDate(date.getDate()+1);
  function at(mins){return new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,Math.round(mins)).getTime();}
  // Auch identische Einträge sind keine minutengenaue Morgen-Vorhersage.
  var med=quantile(rows,0.5),lo=at(Math.min(quantile(rows,0.25),med-30)),
    hi=at(Math.max(quantile(rows,0.75),med+30));
  if(hi<lo)hi=lo;
  if(hi<now-30*MIN)return null;
  return {lo:lo,hi:hi,count:rows.length};
}
function quality(w,d){return w>=12&&d>=12?'mittel':w>=5&&d>=5?'vorsichtig':'grob';}
function predict(babyLog,birth,at,opts){
  var now=Number.isFinite(at)?at:Date.now(),age=ageInDays(birth,now);
  var data=collect(babyLog,now),real=classifySleeps(data.sleeps,now);
  var inferred=inferredNightHistory(data,now,opts);
  var sleeps=real.concat(inferred.sleeps).sort(function(a,b){return a.start-b.start;});
  // Der aktuelle Zustand darf ausschließlich aus tatsächlich erfassten Schlafphasen kommen.
  var last=real.length?real[real.length-1]:null;
  if(!last)return {kind:'empty',ageDays:age,n:0,assumedNights:inferred.nights};
  var sleeping=last.end===null;
  if(!sleeping&&(last.end===null||now-last.end>16*60*MIN))return {kind:'stale',ageDays:age,n:real.length,assumedNights:inferred.nights};
  if(sleeping){
    var dur=duration(sleeps,last.type,last.start,now,age,null),elapsed=(now-last.start)/MIN;
    if(elapsed>dur.hi+90)return {kind:'uncertain',ageDays:age,n:dur.count,assumedNights:inferred.nights};
    return {kind:'sleeping',sleepType:last.type,ageDays:age,from:last.start,
      duration:dur,wakeLow:Math.max(now,last.start+dur.lo*MIN),
      wakeHigh:Math.max(now+15*MIN,last.start+dur.hi*MIN),
      morning:last.type==='night'?morning(sleeps,last.start,now):null,
      quality:dur.count>=8?'vorsichtig':'grob',n:dur.count,assumedNights:inferred.nights,assumedBlocks:dur.assumedCount,healthCaution:data.fever};
  }
  var bed=bedtime(sleeps,now),next='day';
  var nowHour=hour(now),morningHint=last.type==='night'?morning(sleeps,last.start,now):null;
  var nightReturn=last.type==='night'&&now-last.end<=120*MIN&&
    (nowHour>=18||nowHour<6||(nowHour<9&&morningHint&&now<morningHint.lo-20*MIN));
  if(nightReturn)next='night';
  else if(hour(now)>=16||hour(now)<3){
    // Zuerst einen Tag-Schlaf prognostizieren und prüfen, ob er an die
    // individuelle Bettgehzeit heranreicht. Ohne Historie: grobe Abendheuristik.
    var dayGap=gapEstimate(sleeps,data.feeds,last,'day',now,age);
    var candidate=Math.max(now,last.end+dayGap.mid*MIN);
    var date=new Date(candidate);
    var candMinutes=date.getHours()*60+date.getMinutes();
    if(candMinutes<12*60)candMinutes+=24*60;
    var threshold=bed?bed.minutes-60:20*60-45;
    if(candMinutes>=threshold&&candMinutes<=26*60&&last.type!=='night')next='night';
  }
  var g=gapEstimate(sleeps,data.feeds,last,next,now,age);
  var low=Math.max(now,last.end+g.lo*MIN),high=Math.max(now+15*MIN,last.end+g.hi*MIN);
  if(now>last.end+g.hi*MIN+120*MIN)return {kind:'uncertain',ageDays:age,n:g.count,assumedNights:inferred.nights};
  if(next==='night'&&bed){
    var cur=new Date(now),bt=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate(),0,Math.round(bed.minutes)).getTime();
    if(bt<now-120*MIN)bt+=DAY;
    if(Math.abs(bt-(last.end+g.mid*MIN))<150*MIN){
      low=Math.max(now,Math.min(low,bt-45*MIN));
      high=Math.max(now+15*MIN,Math.max(high,bt+45*MIN));
    }
  }
  var dur=duration(sleeps,next,low,now,age,last.end);
  return {kind:'awake',sleepType:next,ageDays:age,from:last.end,
    startLow:low,startHigh:high,duration:dur,
    wakeLow:low+dur.lo*MIN,wakeHigh:high+dur.hi*MIN,
    morning:next==='night'?morning(sleeps,low,now):null,
    quality:quality(g.count,dur.count),n:dur.count,wakeSamples:g.count,assumedNights:inferred.nights,assumedBlocks:dur.assumedCount,
    healthCaution:data.fever,feedingObserved:data.feeds.length>0};
}
function classifications(babyLog,at){
  var now=Number.isFinite(at)?at:Date.now(),s=classifySleeps(collect(babyLog,now).sleeps,now),out={};
  s.forEach(function(x){if(x.id)out[x.id]=x.type;});
  return out;
}
function cardHtml(babyLog,birth,now,opts){
  var r=predict(babyLog,birth,now,opts),lead='',detail='',night=r.sleepType==='night';
  var assumption=r.assumedNights?(' · '+r.assumedNights+' vergangene Nächte aus Stillen/Wickeln angenommen'):'';
  if(r.kind==='empty')return '<div style="margin-top:7px;font-size:12px;color:var(--mu);">😴 Für eine aktuelle Schlafprognose bitte Schlafbeginn und -ende erfassen.'+assumption+'</div>';
  if(r.kind==='stale'||r.kind==='uncertain')return '<div style="margin-top:7px;font-size:12px;color:var(--mu);">😴 Schlafprognose: Aktuelle Schlafdaten fehlen.'+assumption+'</div>';
  if(r.kind==='sleeping'){
    lead=(night?'🌙 Nachtschlaf':'☀️ Nickerchen')+' · Nächstes Aufwachen ca. '+clock(r.wakeLow)+'–'+clock(r.wakeHigh);
    detail='Schlafblock ca. '+Math.round(r.duration.lo)+'–'+Math.round(r.duration.hi)+' Min. · '+r.n+' vergleichbare Schlafphasen';
  }else{
    lead=(night?'🌙 Nächster Nachtschlaf':'☀️ Nächstes Nickerchen')+': '+clock(r.startLow)+'–'+clock(r.startHigh);
    detail='Dauer ca. '+Math.round(r.duration.lo)+'–'+Math.round(r.duration.hi)+' Min. · Aufwachen ca. '+clock(r.wakeLow)+'–'+clock(r.wakeHigh);
  }
  if(r.morning)detail+='<div style="margin-top:3px;">🌅 Morgens voraussichtlich wach: '+clock(r.morning.lo)+'–'+clock(r.morning.hi)+' ('+r.morning.count+' vollständige Nächte)</div>';
  var sub=r.quality==='grob'?'Grobe Orientierung (wenige Vergleichsdaten)':
    r.quality==='vorsichtig'?'Vorsichtige Schätzung':'Datenbasierte Schätzung';
  if(r.healthCaution)sub+=' · Bei Fieber weniger verlässlich';
  if(assumption&&night)sub+=assumption+' (nicht gemessen)';
  return '<div style="margin-top:7px;padding:9px 10px;background:var(--gl);border:1px solid var(--br);border-radius:11px;line-height:1.45;">'
    +'<div style="font-size:12px;font-weight:800;color:var(--g1);">'+lead+'</div>'
    +'<div style="font-size:11px;color:var(--tx);margin-top:2px;">'+detail+'</div>'
    +'<div style="font-size:10px;color:var(--mu);margin-top:3px;">'+sub+' · Automatische Einordnung im Eintrag korrigierbar</div></div>';
}
window.NTBabySleep={predict:predict,cardHtml:cardHtml,classifications:classifications,
  validNightWindow:validNightWindow,nightHistory:function(log,at,opts){
    return inferredNightHistory(collect(log,Number.isFinite(at)?at:Date.now()),Number.isFinite(at)?at:Date.now(),opts);
  }};
})();