// @ts-check
// Additive presentation preferences, existing screens and focused adapters.
(function(){
'use strict';
var active=false,section='home',screen='main',routing=false,parents={},adapters={},restoring=false,overlays=[],focuses={},positions={};
var defaults=['nutrition','baby','household'];
function prefs(){
  var p=S.ui&&typeof S.ui==='object'?S.ui:{};
  if(!Array.isArray(p.navSlots)||p.navSlots.length!==3)p.navSlots=defaults.slice();
  var seen={home:true};
  p.navSlots=p.navSlots.map(function(id,i){if(!NTUICatalog.target(id)||seen[id])id=defaults.concat(['more','history','plan','book','shop','pantry']).find(function(x){return !seen[x];});seen[id]=true;return id;});
  if(!p.classicLayout)p.classicLayout={order:Array.isArray(S.dashOrder)?S.dashOrder.slice():[],hidden:Array.isArray(S.dashHidden)?S.dashHidden.slice():[]};
  p.version=1;S.ui=p;return p;
}
function context(){var id=overlays[overlays.length-1]||'';if(id==='libraryOv'&&document.getElementById(id).getAttribute('data-tab')==='foods')return 'nutrition';return NTUICatalog.owner(id,section);}
function enabled(){return active;}
function measureNav(){var el=document.getElementById('b3Nav');if(!el)return;var h=Math.ceil(el.getBoundingClientRect().height);if(h>0)document.body.style.setProperty('--b3-nav-height',h+'px');}
function nav(){
  var el=document.getElementById('b3Nav');if(!el)return;
  var slots=prefs().navSlots,ids=['home',slots[0],'+',slots[1],slots[2]],owner=context();
  el.innerHTML=ids.map(function(id){
    if(id==='+')return '<button type="button" class="b3-plus" data-act="NTUIActions.plus" aria-label="'+esc('Erfassen: '+((NTUICatalog.target(owner)||{}).label||'Alle Bereiche'))+'"><span aria-hidden="true">＋</span><small>Erfassen</small></button>';
    var t=NTUICatalog.target(id),on=id===section,short=({baby:'Baby',shop:'Einkauf'})[id]||t.label;
    return '<button type="button" aria-label="'+esc(t.label)+'"'+(on?' aria-current="page"':'')+' data-act="NTUI.go" data-args="'+esc(JSON.stringify([id]))+'"><span aria-hidden="true">'+t.ic+'</span><small>'+esc(short)+'</small></button>';
  }).join('');
  measureNav();
}
function status(){
  document.body.classList.toggle('b3-modal',overlays.some(function(id){return !isPage(id);}));nav();
}
function isPage(id){return ['babyOv','shopOv','pantryOv','planOv','libraryOv'].indexOf(id)>=0;}
function state(){return {ntui:true,section:section,overlays:overlays.slice(),screen:screen,meal:window._mealDetailOpen||null,babyTab:window.NTUIBaby?NTUIBaby.view():'today',babyDetail:window.NTUIBaby?NTUIBaby.detailView():'growth'};}
function noteView(){if(active&&!restoring)history.pushState(state(),'');}
function closeAll(){
  var wasRestoring=restoring;restoring=true;
  overlays.slice().reverse().forEach(function(id){if(id==='babyOv')NTBaby.closeDiary();else closeOv(id);});
  overlays=[];restoring=wasRestoring;
}
function render(){
  if(!active)return;
  var t=NTUICatalog.target(section);document.getElementById('b3Title').textContent=t?t.label:'Heute';
  var body=document.getElementById('b3Content');body.innerHTML='';
  if(section==='home'&&window.NTUIHome)NTUIHome.render();
  if(['nutrition','history','trends'].indexOf(section)>=0&&window.NTUINutrition)NTUINutrition.render(section);
  if(section==='household'&&window.NTUIHousehold)NTUIHousehold.render();
  if(section==='more'&&window.NTUISettings)NTUISettings.render();
  if(section==='more')catalog();
  nav();
}
function catalog(){
  var el=document.getElementById('b3Catalog');if(!el)return;
  var input=document.getElementById('b3CatalogQuery'),q=input?input.value.toLocaleLowerCase('de'):'';
  el.innerHTML=NTUICatalog.entries().filter(function(e){return e.label.toLocaleLowerCase('de').indexOf(q)>=0;}).map(function(e){return '<button type="button" class="b3-catalog-row" data-act="NTUI.dispatch" data-args="'+esc(JSON.stringify([e.act,e.args]))+'">'+esc(e.label)+'</button>';}).join('')||'<p>Keine passende Funktion gefunden.</p>';
}
function dispatch(act,args){var f=NTActions.resolve(act);if(f)f.apply(null,args||[]);}
function go(id,replace){
  if(!active)return;
  if(!NTUICatalog.target(id))id='home';
  if(!NTUICatalog.available(id)){showToast('Dieser Bereich ist ausgeschaltet. Unter Mehr → Funktionen aktivieren.');id='more';}
  positions[section]=window.scrollY;if(!restoring&&id!==section)parents[id]=section;closeAll();section=id;
  document.body.classList.toggle('b3-classic-screen',['nutrition','history','trends'].indexOf(id)>=0||(id==='home'&&!window.NTUIHome));
  document.body.classList.toggle('b3-nutrition',id==='nutrition');
  var map={home:'main',nutrition:'main',history:'history',trends:'trends'};
  routing=true;if(map[id]&&adapters.screen)adapters.screen(map[id]);routing=false;
  render();
  var wasRestoring=restoring;restoring=true;
  if(id==='baby')NTBaby.openDiary();
  else if(id==='shop')NTShop.open();
  else if(id==='pantry')NTPantry.open();
  else if(id==='plan')NTPlan.open();
  else if(id==='book'&&adapters.book)adapters.book();
  restoring=wasRestoring;
  if(!restoring)history[replace?'replaceState':'pushState'](state(),'');
  var p=prefs();p.lastSection=id;saveS();
  window.scrollTo(0,positions[id]||0);
  var title=document.getElementById('b3Title');title.focus({preventScroll:true});status();
}
function opened(id){
  if(!active)return;
  var el=document.getElementById(id);if(!el)return;
  if(overlays.indexOf(id)<0){focuses[id]=document.activeElement;overlays.push(id);if(!restoring)history.pushState(state(),'');}
  el.style.zIndex=String(400+overlays.indexOf(id));
  el.setAttribute('data-ui','b3');el.setAttribute('role',isPage(id)?'region':'dialog');
  el.setAttribute('aria-modal',isPage(id)?'false':'true');
  if(isPage(id)){
    el.setAttribute('data-b3-page','');
    var header=el.querySelector('.mhd');
    if(header&&!header.querySelector('.b3-page-menu')){
      var menu=document.createElement('button');menu.type='button';menu.className='b3-page-menu';menu.textContent='☰';
      menu.setAttribute('aria-label','Mehr und Einstellungen');menu.setAttribute('data-act','NTUI.go');menu.setAttribute('data-args','["more"]');header.insertBefore(menu,header.firstChild);
    }
  }
  if(id==='babyOv'&&window.NTUIBaby)NTUIBaby.mount();
  var heading=el.querySelector('.mti');if(heading){if(!heading.id)heading.id=id+'B3Title';el.setAttribute('aria-labelledby',heading.id);}
  status();
  setTimeout(function(){var input=/** @type {HTMLElement} */ (el.querySelector('input:not([type="hidden"]),textarea,select,button'));if(input&&el.classList.contains('open'))input.focus({preventScroll:true});},0);
}
function closed(id){
  if(!active)return;
  var at=overlays.indexOf(id);if(at>=0)overlays.splice(at,1);
  var el=document.getElementById(id);if(el){el.style.zIndex='';el.removeAttribute('aria-modal');}
  if(!restoring&&history.state&&history.state.ntui)history.replaceState(state(),'');
  var focus=focuses[id];
  if(!focus||!focus.isConnected||focus===document.body){
    var parent=document.getElementById(overlays[overlays.length-1]||'');
    focus=(parent&&parent.querySelector('.mti'))||document.getElementById('b3Title');
    if(focus)focus.setAttribute('tabindex','-1');
  }
  if(focus)focus.focus({preventScroll:true});
  status();
  if(!restoring&&isPage(id)&&!overlays.some(isPage)&&['baby','shop','pantry','plan','book'].indexOf(section)>=0)go(parents[section]||'home',true);
}
function back(){
  if(overlays.indexOf('fileSaveOv')>=0)return;
  if(overlays.length){var id=overlays[overlays.length-1];if(isPage(id)){history.back();return;}if(id==='babyOv')NTBaby.closeDiary();else closeOv(id);return;}
  if(section!=='home')history.back();
}
function legacy(tab){
  if(!active)return;screen=tab;if(routing)return;
  var map={main:'nutrition',history:'history',trends:'trends',more:'more',mealDetail:'nutrition'};
  if(map[tab]){
    section=map[tab];document.body.classList.toggle('b3-classic-screen',tab!=='more');document.body.classList.toggle('b3-nutrition',section==='nutrition');render();
    if(!restoring)history.pushState(state(),'');
  }
}
function importFile(){document.getElementById('impInp').click();}
function templates(){NTUIActions.show('Vorlage für welche Mahlzeit?',['breakfast','lunch','dinner','snack'].map(function(slot,i){return NTUIActions.button(['Frühstück','Mittagessen','Abendessen','Snack'][i],'NTTpl.open',[slot]);}).join(''));}
function openPreferences(){
  var p=prefs(),opts=NTUICatalog.targets().filter(function(t){return t.id!=='home';});
  document.getElementById('b3PrefsBody').innerHTML='<p>Heute und Erfassen bleiben fest. Jeder andere Bereich darf einmal vorkommen.</p>'+p.navSlots.map(function(id,i){return '<label for="b3Slot'+i+'">Position '+[2,4,5][i]+'</label><select id="b3Slot'+i+'">'+opts.map(function(t){return '<option value="'+t.id+'"'+(id===t.id?' selected':'')+'>'+esc(t.label)+'</option>';}).join('')+'</select>';}).join('');
  openOv('b3PrefsOv');
}
function savePreferences(){
  var ids=[0,1,2].map(function(i){return document.getElementById('b3Slot'+i).value;});
  if(new Set(ids).size!==3){showToast('Bitte drei unterschiedliche Bereiche auswählen.');return;}
  prefs().navSlots=ids;saveS();closeOv('b3PrefsOv');nav();
}
function refresh(){if(!active)return;if(section==='home'&&window.NTUIHome)NTUIHome.render();if(['nutrition','history','trends'].indexOf(section)>=0&&window.NTUINutrition)NTUINutrition.refresh();if(window.NTUIBaby&&document.getElementById('babyOv').classList.contains('open'))NTUIBaby.refresh();nav();}
function changeDay(dir){if(adapters.date)adapters.date(dir);refresh();}
function fast(){return adapters.fast?adapters.fast():null;}
function stopFast(){if(adapters.stopFast)adapters.stopFast();refresh();}
function classic(){prefs().enabled=false;saveS();var u=new URL(location.href);u.searchParams.set('ui','classic');location.href=u.href;}
function enable(){prefs().enabled=true;saveS();var u=new URL(location.href);u.searchParams.set('ui','b3');location.href=u.href;}
function boot(ext){
  adapters=ext||{};var mode=new URLSearchParams(location.search).get('ui');
  if(mode==='classic'||(mode!=='b3'&&!(S.ui&&S.ui.enabled)))return;
  try{
    if(['NTUICatalog','NTUIActions','NTUIHome','NTUIBaby','NTUIReminders','NTUIPriority','NTUINutrition','NTUIHousehold','NTUISettings'].some(function(name){return !window[name];}))throw new Error('UI incomplete');
    prefs();active=true;var root=document.getElementById('b3Root');document.body.insertBefore(root,document.body.firstChild);root.hidden=false;go('home',true);document.body.classList.add('b3-on');
    if(window.ResizeObserver)new ResizeObserver(measureNav).observe(document.getElementById('b3Nav'));
  }catch(e){active=false;document.body.classList.remove('b3-on','b3-modal','b3-classic-screen','b3-nutrition');var failedRoot=document.getElementById('b3Root');if(failedRoot)failedRoot.hidden=true;showToast('Die klassische Ansicht ist aktiv.');}
}
document.addEventListener('input',function(e){if(e.target instanceof HTMLElement&&e.target.id==='b3CatalogQuery')catalog();});
document.addEventListener('keydown',function(e){
  if(!active)return;
  if(e.key==='Escape'&&overlays.length){e.preventDefault();back();}
  if(e.key==='Tab'&&overlays.length){
    var el=document.getElementById(overlays[overlays.length-1]);
    var items=Array.from(el.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select,a[href],[tabindex="0"]')).filter(function(x){return x.getClientRects().length;});
    if(!items.length)return;var first=/** @type {HTMLElement} */ (items[0]),last=/** @type {HTMLElement} */ (items[items.length-1]);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
window.addEventListener('resize',measureNav);
window.addEventListener('popstate',function(e){
  if(!active)return;
  if(overlays.indexOf('fileSaveOv')>=0&&(!e.state||!e.state.overlays||e.state.overlays.indexOf('fileSaveOv')<0)){history.pushState(state(),'');return;}
  if(!e.state||!e.state.ntui){go('home',true);return;}
  var desired=e.state;
  var signature=function(s){return JSON.stringify([s.section,s.screen,s.meal||null,s.overlays,s.babyTab,s.babyDetail]);};
  if(signature(desired)===signature(state())){history.back();return;}
  restoring=true;
  overlays.slice().reverse().forEach(function(id){if(desired.overlays.indexOf(id)<0){if(id==='babyOv')NTBaby.closeDiary();else closeOv(id);}});
  if(desired.section!==section){go(desired.section,true);}
  if(desired.screen&&['nutrition','history','trends'].indexOf(section)>=0&&adapters.screen){if(desired.screen==='mealDetail'&&desired.meal&&adapters.detail)adapters.detail(desired.meal);else adapters.screen(desired.screen);}
  (desired.overlays||[]).forEach(function(id){if(overlays.indexOf(id)<0)openOv(id);});
  if(desired.overlays.indexOf('babyOv')>=0&&window.NTUIBaby){NTUIBaby.select(desired.babyTab||'today',false);if(desired.babyTab==='development')NTUIBaby.development(desired.babyDetail||'growth',false);}
  restoring=false;status();
});
window.NTUI={importFile:importFile,templates:templates,fast:fast,stopFast:stopFast,noteView:noteView,refresh:refresh,changeDay:changeDay,boot:boot,enabled:enabled,prefs:prefs,context:context,go:go,back:back,render:render,opened:opened,closed:closed,legacy:legacy,dispatch:dispatch,openPreferences:openPreferences,savePreferences:savePreferences,classic:classic,enable:enable};
})();
