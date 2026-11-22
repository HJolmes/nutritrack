// @ts-check
// NutriTrack Baby: Schlaf-Tagesübersicht (Anzeige + Aktionen, getrennt vom Rechenkern).
(function(){
'use strict';
var selected='';
function escHtml(v){return String(v===null||v===undefined?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function localDay(ms){var d=new Date(ms);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function shiftDate(key,offset){var p=key.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]+offset);return localDay(d.getTime());}
function clock(ms){var d=new Date(ms);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function args(data){return escHtml(JSON.stringify(data));}
function fmtMinutes(m){var h=Math.floor(m/60);return h?(h+' Std. '+Math.round(m%60)+' Min.'):(Math.round(m)+' Min.');}
function row(title,meta,color,action){
  return '<div style="border-left:4px solid '+color+';border-radius:9px;background:var(--gl);padding:9px 10px;margin-bottom:7px;">'
    +'<div style="font-size:13px;font-weight:700;color:var(--tx);">'+title+'</div>'
    +'<div style="font-size:11px;color:var(--mu);margin-top:3px;line-height:1.45;">'+meta+'</div>'
    +(action?'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;">'+action+'</div>':'')+'</div>';
}
function action(label,fn,parameters){
  return '<button type="button" class="seb" style="font-size:11px;padding:6px 9px;width:auto;margin:0;" data-act="'+fn+'" data-args="'+args(parameters)+'">'+label+'</button>';
}
function barTrack(plan,kind,title,color,opacity){
  var base=plan.dayStart,end=plan.dayEnd,total=end-base;
  var bars=plan.events.filter(function(e){return e.kind===kind;}).map(function(e){
    var a=Math.max(base,e.start),b=Math.min(end,e.end);
    if(b<=a)return '';
    var left=((a-base)/total*100).toFixed(2),width=Math.max(.3,(b-a)/total*100).toFixed(2);
    return '<span style="position:absolute;left:'+left+'%;width:'+width+'%;top:2px;height:17px;border-radius:4px;background:'+color+';opacity:'+opacity+';" title="'+escHtml(clock(a)+'–'+clock(b))+'"></span>';
  }).join('');
  return '<div style="display:flex;align-items:center;gap:8px;margin:7px 0;">'
    +'<div style="width:75px;flex-shrink:0;font-size:11px;color:var(--mu);">'+title+'</div>'
    +'<div style="flex:1;position:relative;height:22px;background:var(--gl);border:1px solid var(--br);border-radius:5px;overflow:hidden;">'
    +bars+'</div></div>';
}
function render(){
  var root=document.getElementById('babySleepPlanBody');
  if(!root||!window.NTBabySleep)return;
  var now=Date.now(),today=localDay(now);
  if(!selected||selected>today)selected=today;
  var log=S.babyLog||{},opts=S.babyNightWindow;
  var plan=window.NTBabySleep.dayOverview(log,(S.baby&&S.baby.birth)||'',selected,now,opts);
  var label=new Date(selected+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
  var isToday=selected===today, html='';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
    +action('‹','NTBabySleepPlan.shift',[-1])
    +'<div style="flex:1;text-align:center;font-size:12px;font-weight:800;">'+escHtml(label)+(isToday?' · Heute':'')+'</div>'
    +action('Heute','NTBabySleepPlan.today',[])
    +action('›','NTBabySleepPlan.shift',[1])+'</div>';
  html+='<div style="padding:10px;border:1px solid var(--br);border-radius:12px;margin-bottom:10px;">'
    +'<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--mu);padding-left:80px;"><span>00</span><span>06</span><span>12</span><span>18</span><span>24 Uhr</span></div>'
    +barTrack(plan,'actual','Erfasst','var(--g1)',1)
    +barTrack(plan,'assumed','Angenommen','#9AA5B2',0.75)
    +barTrack(plan,'forecast','Prognose','var(--g3)',0.88)
    +'<div style="font-size:10px;color:var(--mu);margin-top:7px;">Erfasst = wirklich dokumentiert · Angenommen = nur aus nächtlichen Versorgungen abgeleitet · Prognose = noch nicht eingetragen</div>'
    +'</div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">'
    +'<span style="font-size:13px;font-weight:800;">Schlaf im Tagesverlauf</span>'
    +(isToday?action('😴 Schlaf jetzt starten','NTBaby.startSleepFromPlanNow',[]):'')
    +'</div>';
  if(!plan.events.length)html+='<div style="color:var(--mu);font-size:12px;padding:10px;">Für diesen Tag liegen noch keine Schlafphasen vor.</div>';
  var shown=0;
  plan.events.forEach(function(e){
    if(e.kind==='wake'){
      if(e.start>=plan.dayEnd)return;
      html+=row('⏰ Nächstes Aufwachen: '+clock(e.start)+'–'+clock(e.end),
        'Aus dem derzeit laufenden Schlaf geschätzt · '+escHtml(e.quality||'grob')+' · kein eingetragener Schlaf','var(--g3)','');
      shown++;
      return;
    }
    if(e.start>=plan.dayEnd||e.end<=plan.dayStart)return;
    var a=clock(Math.max(e.start,plan.dayStart)),b=clock(Math.min(e.end,plan.dayEnd));
    var isNight=e.type==='night',type=isNight?'🌙 Nachtschlaf':'☀️ Nickerchen';
    if(e.kind==='actual'){
      var acts=e.id?action('✏️ Bearbeiten','NTBaby.editEntry',[e.id]):'';
      if(e.ongoing&&e.id)acts+=action('Wach jetzt','NTBaby.endSleep',[e.id]);
      html+=row(type+' · '+a+'–'+(e.ongoing?'läuft':b),
        'Tatsächlich erfasst'+(e.ongoing?' · läuft seit '+a:' · '+fmtMinutes((e.end-e.start)/60000)),'var(--g1)',acts);
    }else if(e.kind==='assumed'){
      html+=row('🌙 Angenommene Nacht · '+a+'–'+b,
        'Aus Still-/Wickelzeiten rekonstruiert · keine echte Schlafmessung','#9AA5B2','');
    }else if(e.kind==='forecast'){
      var first=e.stage===1,spread=clock(e.startLow)+'–'+clock(e.startHigh);
      var text=(first?'Nächstes Schlaffenster':'Weitere grobe Planung')+': '+spread
        +' · Dauer etwa '+Math.round(e.low)+'–'+Math.round(e.high)+' Min.'
        +(first?' · '+escHtml(e.quality||'grob'):' · bei wenigen Daten besonders unsicher');
      var actions=isToday?action('＋ Schlaf erfassen','NTBaby.sleepFromPlan',[e.start,e.type]):'';
      html+=row((first?'🔮 ':'↝ ')+type+' · circa '+a,text,'var(--g3)',actions);
    }
    shown++;
  });
  if(!shown)html+='<div style="font-size:12px;color:var(--mu);">Keine angezeigten Schlafabschnitte für diesen Tag.</div>';
  if(isToday&&(!plan.forecast||plan.forecast.kind==='empty'||plan.forecast.kind==='stale'||plan.forecast.kind==='uncertain')){
    html+='<div style="font-size:11px;color:var(--mu);padding:8px;">Für weitere Tagesprognosen fehlen aktuelle, tatsächlich erfasste Schlafzeiten. Du kannst trotzdem jederzeit einen Schlaf starten.</div>';
  }
  html+='<div style="font-size:11px;color:var(--mu);line-height:1.5;margin-top:10px;">Weitere geplante Schläfchen sind lediglich eine grobe Fortschreibung, keine eigenständigen Messungen. „Schlaf erfassen“ öffnet ein bearbeitbares Formular. Eine Vorhersage wird erst nach deinem Speichern zum echten Eintrag.</div>';
  root.innerHTML=html;
}
function shift(delta){
  if(!selected)selected=localDay(Date.now());
  var next=shiftDate(selected,delta),today=localDay(Date.now());
  if(next>today)return;
  selected=next;render();
}
function today(){selected=localDay(Date.now());render();}
window.NTBabySleepPlan={render:render,shift:shift,today:today};
})();