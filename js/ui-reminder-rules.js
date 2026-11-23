// @ts-check
// UI preferences and optional delivery. Existing S.reminders are never changed.
(function(){
'use strict';
var slots=['breakfast','lunch','dinner','snack'],labels=['Frühstück','Mittagessen','Abendessen','Snacks'],times=['08:00','13:00','19:00','16:00'];
function pref(slot){var p=NTUI.prefs();p.mealReminders=p.mealReminders||{};if(!p.mealReminders[slot])p.mealReminders[slot]={mode:'auto',time:times[slots.indexOf(slot)],push:false};return p.mealReminders[slot];}
function patterns(){var p=NTUI.prefs(),key=NTBaby.today(),out={};slots.forEach(function(slot){out[slot]=uiMealPattern(S.days||{},slot,key,{since:p.mealLearnSince||''});});return out;}
function candidates(){
  var key=NTBaby.today();if(S.currentDate!==key)return [];
  var learned=patterns(),out=[];
  slots.forEach(function(slot){var c=uiMealReminder(S.days||{},slot,key,Date.now(),pref(slot),learned[slot]);if(c)out.push(c);});return out;
}
function delivered(c){
  if(c.source!=='meal')return;
  var p=pref(c.slot),key=NTBaby.today();
  if(!p.push||p.sentDay===key||!('Notification' in window)||Notification.permission!=='granted')return;
  p.sentDay=key;saveS();NTRemind.notify('NutriTrack · '+c.title,{body:c.detail,tag:c.id});
}
function dismiss(slot,kind){
  var p=pref(slot);if(kind==='snooze')p.snoozeUntil=Date.now()+30*60000;
  else{p.dismissedDay=NTBaby.today();if(kind==='irrelevant')p.irrelevantCount=(p.irrelevantCount||0)+1;}
  saveS();NTUI.refresh();if(kind==='irrelevant'&&p.irrelevantCount>=3)open();
}
function never(slot){pref(slot).mode='never';saveS();open();NTUI.refresh();}
function reset(){NTUI.prefs().mealLearnSince=NTBaby.today();saveS();open();NTUI.refresh();}
function open(){
  var learned=patterns();
  document.getElementById('b3MealPrefsBody').innerHTML='<p class="b3-muted b3-reminder-intro">Automatische Hinweise orientieren sich an deinen Einträgen. Feste Erinnerungen stellst du separat ein.</p>'+slots.map(function(slot,i){
    var p=pref(slot),a=learned[slot];
    var options=[['auto','Automatisch lernen'],['always','Immer erinnern'],['never','Nie erinnern']].map(function(m){
      return '<option value="'+m[0]+'"'+(p.mode===m[0]?' selected':'')+'>'+m[1]+'</option>';
    }).join('');
    return '<section class="b3-card"><h3>'+labels[i]+'</h3><div class="b3-reminder-fields">'
      +'<label>Hinweis-Modus<select id="b3MealMode'+i+'">'+options+'</select></label>'
      +'<label>Uhrzeit bei „Immer“<input id="b3MealTime'+i+'" type="time" value="'+esc(p.time||times[i])+'"></label></div>'
      +'<label class="b3-reminder-check"><input type="checkbox" id="b3MealPush'+i+'"'+(p.push?' checked':'')+'>Systemmeldung einschalten</label>'
      +'<p class="b3-muted">'+esc(a.reason)+(a.days?' · '+a.observed+' von '+a.days+' Tagen erfasst.':'')+'</p>'
      +(p.irrelevantCount>=3?'<p>Diesen Hinweis künftig ausschalten?</p><button type="button" data-act="NTUIReminders.never" data-args="'+esc(JSON.stringify([slot]))+'">'+labels[i]+' nie erinnern</button>':'')+'</section>';
  }).join('')+'<section class="b3-card"><h3>Weitere Hinweise</h3>'+[['care','Vorsorge und vorgemerkte Gaben'],['forecast','Schlafprognosen'],['household','Vorrat']].map(function(c){
    return '<label class="b3-reminder-check"><input type="checkbox" id="b3Hint'+c[0]+'"'+(!(NTUI.prefs().priorityMuted||{})[c[0]]?' checked':'')+'>'+c[1]+'</label>';
  }).join('')+'</section><p class="b3-muted">Systemmeldungen benötigen deine Zustimmung und funktionieren, solange die App aktiv ist.</p>'
    +'<div class="b3-row b3-reminder-links"><button type="button" data-act="NTUIReminders.reset">Lernen neu beginnen</button><button type="button" data-act="NTUIReminders.fixed">Feste Erinnerungen</button></div>';
  openOv('b3MealPrefsOv');
}
function fixed(){closeOv('b3MealPrefsOv');NTUI.dispatch('openSettings',['erinnerungen']);}
async function save(){
  var selections=slots.map(function(slot,i){return {slot:slot,mode:document.getElementById('b3MealMode'+i).value,time:document.getElementById('b3MealTime'+i).value,push:document.getElementById('b3MealPush'+i).checked};});
  if(selections.some(function(p){return p.push;})&&'Notification' in window&&Notification.permission==='default')await Notification.requestPermission();
  var muted=NTUI.prefs().priorityMuted||{};['care','forecast','household'].forEach(function(id){muted[id]=!document.getElementById('b3Hint'+id).checked;});NTUI.prefs().priorityMuted=muted;
  selections.forEach(function(s){var p=pref(s.slot);p.mode=s.mode;p.time=s.time;p.push=s.push&&'Notification' in window&&Notification.permission==='granted';});
  saveS();closeOv('b3MealPrefsOv');NTUI.refresh();
}
window.NTUIReminders={open:open,save:save,pref:pref,patterns:patterns,candidates:candidates,delivered:delivered,dismiss:dismiss,never:never,reset:reset,fixed:fixed};
})();
