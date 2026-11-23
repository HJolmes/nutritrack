// @ts-check
// Baby presentation stays attached to the one existing diary and its APIs.
(function(){
'use strict';
var current='today',detail='growth';
function mount(){
  var tabs=document.getElementById('babyTabs');if(!tabs)return;
  var el=document.getElementById('b3BabyStatus');
  if(!el){el=document.createElement('div');el.id='b3BabyStatus';tabs.parentNode.insertBefore(el,tabs);}
  if(!document.getElementById('b3BabyTabs')){
    var nav=document.createElement('nav');nav.id='b3BabyTabs';nav.className='b3-baby-tabs';nav.setAttribute('aria-label','Baby-Bereiche');
    nav.innerHTML=[['today','Heute'],['sleep','Schlaf'],['history','Verlauf'],['development','Entwicklung']].map(function(x){return '<button type="button" data-act="NTUIBaby.select" data-args="'+esc(JSON.stringify([x[0]]))+'" data-baby-section="'+x[0]+'">'+x[1]+'</button>';}).join('');
    tabs.parentNode.insertBefore(nav,el);tabs.hidden=true;
    var dev=document.createElement('div');dev.id='b3BabyDevelopment';dev.className='b3-grid';dev.hidden=true;
    dev.innerHTML=[['Wachstum / WHO','growth'],['U-Heft & Meilensteine','mile'],['Fragen an Arzt / Hebamme','mw']].map(function(x){return '<button type="button" data-act="NTUIBaby.development" data-args="'+esc(JSON.stringify([x[1]]))+'">'+x[0]+'</button>';}).join('')+'<button type="button" data-act="NTBabyMed.open">Medizin & Gaben</button>';
    tabs.parentNode.insertBefore(dev,tabs);
    var settings=document.getElementById('babyNightAssumptions');document.getElementById('babyPaneSleep').appendChild(settings);
    settings.querySelector('summary').textContent='Einstellungen für Nachtannahmen';
    var add=document.getElementById('babyDiaryAdd');
    add.setAttribute('data-act','NTUIActions.baby');add.removeAttribute('data-args');
  }
  current='today';select('today',false);
  refresh();
}
function refresh(){var el=document.getElementById('b3BabyStatus');if(el&&NTUI.enabled())el.innerHTML=NTUIHome.breast(false);}
function select(id,record){
  if(['today','sleep','history','development'].indexOf(id)<0)return;
  current=id;
  document.getElementById('b3BabyStatus').hidden=id!=='today';
  document.getElementById('b3BabyDevelopment').hidden=id!=='development';
  document.querySelectorAll('#b3BabyTabs button').forEach(function(b){b.setAttribute('aria-current',b.getAttribute('data-baby-section')===id?'page':'false');});
  NTBaby.setTab(({today:'log',sleep:'sleep',history:'week',development:detail})[id]);
  if(record!==false)NTUI.noteView();
}
function development(tab,record){if(['growth','mile','mw'].indexOf(tab)<0)return;current='development';detail=tab;NTBaby.setTab(tab);if(record!==false)NTUI.noteView();}
function follow(tab){
  current=({log:'today',sleep:'sleep',week:'history',growth:'development',mile:'development',mw:'development'})[tab]||'today';
  if(current==='development')detail=tab;
  var status=document.getElementById('b3BabyStatus'),dev=document.getElementById('b3BabyDevelopment');
  if(status)status.hidden=current!=='today';if(dev)dev.hidden=current!=='development';
  document.querySelectorAll('#b3BabyTabs button').forEach(function(b){b.setAttribute('aria-current',b.getAttribute('data-baby-section')===current?'page':'false');});
}
function view(){return current;}
function detailView(){return detail;}
window.NTUIBaby={mount:mount,refresh:refresh,select:select,development:development,view:view,follow:follow,detailView:detailView};
})();
