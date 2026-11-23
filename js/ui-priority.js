// @ts-check
// Explainable local home priorities. Fachmodules remain authoritative.
(function(){
'use strict';
var shown=[];
function btn(label,act,args){return '<button type="button" data-act="'+act+'" data-args="'+esc(JSON.stringify(args||[]))+'">'+esc(label)+'</button>';}
function candidates(){
  /** @type {any[]} */
  var out=[];var now=Date.now(),key=NTBaby.today(),run=S.babyOn&&NTBaby.runningFeed(),sleep=S.babyOn&&NTBaby.openSleep(key);
  if(run)out.push({id:'feed-'+run.id,priority:0,kind:'running',source:'baby',title:'Stillen '+(NTBaby.SIDES[run.side]||'')+' läuft',html:NTBaby.feedLineHtml(),reason:'Diese Stoppuhr ist als laufender Tagebucheintrag gespeichert.'});
  if(sleep)out.push({id:'sleep-'+sleep.e.id,priority:0.1,kind:'running',source:'baby',title:'Schlaf läuft seit '+sleep.e.from,html:btn('Wach jetzt','NTBaby.endSleep',[sleep.e.id]),reason:'Dieser tatsächliche Schlafeintrag hat noch kein Ende.'});
  var fast=NTUI.fast();if(fast)out.push({id:'fast-'+fast.start,priority:0.2,kind:'running',source:'fast',title:'Fasten läuft',html:btn('Fasten beenden','NTUI.stopFast'),reason:'Du hast dieses Fastenfenster gestartet.'});
  NTRemind.due(now).forEach(function(item,i){out.push({id:'fixed-'+key+'-'+i+'-'+item.reminder.time,priority:1,kind:'hint',source:'fixed',title:item.reminder.label||'Deine Erinnerung',detail:'Feste Erinnerung · '+item.reminder.time,reason:'Du hast diese feste Erinnerung selbst aktiviert. Ihr bestehender Timer bleibt unabhängig von den neuen Mahlzeiten-Hinweisen.',expiresAt:item.at+15*60000,html:btn('Erinnerung bearbeiten','NTUIReminders.fixed')});});
  if(S.babyOn){
    var care=NTBabyMed.cardHtml()+NTMile.cardHtml();
    if(care)out.push({id:'care-'+key,priority:1,kind:'hint',source:'care',title:'Vorsorge & vorgemerkte Gaben',html:care,reason:'Aus vorhandenen Terminen, Vorsorgefenstern und ausdrücklich eingetragenen Medikamenten. Keine neue Dosierungsentscheidung.'});
    var p=window.NTBabySleep.predict(S.babyLog||{},(S.baby&&S.baby.birth)||'',now,S.babyNightWindow);
    if(p.kind==='awake'&&p.quality!=='grob'&&p.startLow<=now+30*60000&&p.startHigh>=now)out.push({id:'forecast-'+key,priority:2,kind:'hint',source:'forecast',title:'Schlaffenster · Schätzung',html:window.NTBabySleep.cardHtml(S.babyLog||{},(S.baby&&S.baby.birth)||'',now,S.babyNightWindow)+btn('Schlafübersicht','NTUIPriority.sleep'),reason:'Vorhandene Schlafprognose, '+p.n+' Vergleichsphasen. Keine Schlafmessung und keine automatische Buchung.'});
  }
  out=out.concat(NTUIReminders.candidates());
  var pantry=NTFeat.byId('pantry');
  if(pantry&&!NTFeat.isOff(pantry)){
    var exp=pantryExpiring(S.pantry||[],key,3);if(exp.length)out.push({id:'pantry-'+key,priority:4,source:'household',kind:'hint',title:'Vorrat im Blick',detail:exp.length+' Artikel laufen bald ab.',reason:'Aus tatsächlich eingetragenen Haltbarkeitsdaten.',html:btn('Vorrat öffnen','NTUI.go',['pantry'])});
  }
  if(NTUICatalog.available('plan')&&Object.keys((S.mealPlan||{})[key]||{}).some(function(slot){return (S.mealPlan[key][slot]||[]).length;}))out.push({id:'plan-'+key,priority:4.1,source:'household',kind:'hint',title:'Dein Plan für heute',reason:'Für heute sind tatsächlich Planpositionen eingetragen.',html:btn('Wochenplan öffnen','NTUI.go',['plan'])});
  return out;
}
function html(){
  var p=NTUI.prefs();p.priorityHidden=p.priorityHidden||{};var now=Date.now();
  Object.keys(p.priorityHidden).forEach(function(k){if(p.priorityHidden[k]<now)delete p.priorityHidden[k];});
  shown=uiPrioritySort(candidates().filter(function(c){return c.kind==='running'||!(p.priorityMuted&&p.priorityMuted[c.source]);}),p.priorityHidden,now).slice(0,1);
  if(!shown.length)return '<article class="b3-card"><h3>Nichts Dringendes</h3><p class="b3-muted">Dein Tagesstand bleibt unten im Blick.</p>'+btn('Etwas erfassen','NTUIActions.all')+'</article>';
  return shown.map(function(c,i){
    NTUIReminders.delivered(c);
    var options=c.kind==='running'||c.source==='meal'?'':'<div class="b3-row">'+btn('Heute ausblenden','NTUIPriority.hide',[c.id])+(c.source==='fixed'?'':btn('Solche Hinweise ausschalten','NTUIPriority.mute',[c.source]))+'</div>';
    return '<article class="b3-card'+(i===0?' b3-active':'')+'" data-priority-id="'+esc(c.id)+'"><h3>'+esc(c.title)+'</h3>'+(c.detail?'<p>'+esc(c.detail)+'</p>':'')+(c.html||'')+(c.source==='meal'?btn('Eintragen','NTUIPriority.meal',[c.slot]):'')+'<details><summary>Warum sehe ich das?</summary><p class="b3-muted">'+esc(c.reason)+'</p>'+options+'</details>'+(c.source==='meal'?'<div class="b3-row">'+btn('30 Min. später','NTUIReminders.dismiss',[c.slot,'snooze'])+btn('Heute ausblenden','NTUIReminders.dismiss',[c.slot,'today'])+btn('Nicht relevant','NTUIReminders.dismiss',[c.slot,'irrelevant'])+'</div>':'')+'</article>';
  }).join('');
}
function hide(id){var c=shown.find(function(x){return x.id===id;});if(!c||c.kind==='running')return;var end=new Date();end.setHours(24,0,0,0);NTUI.prefs().priorityHidden[id]=end.getTime();saveS();NTUI.refresh();}
function mute(source){var p=NTUI.prefs();p.priorityMuted=p.priorityMuted||{};p.priorityMuted[source]=true;saveS();NTUI.refresh();}
function sleep(){NTUI.go('baby');NTUIBaby.select('sleep');}
function meal(slot){NTPicker.openPicker(slot,'chat');}
window.NTUIPriority={html:html,candidates:candidates,hide:hide,mute:mute,sleep:sleep,meal:meal};
})();
