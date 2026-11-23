// @ts-check
(function(){
'use strict';
var groups=[
  {id:'settings',label:'Einstellungen & App',icon:'⚙️'},
  {id:'nutrition',label:'Ernährung & Aktivität',icon:'🥗'},
  {id:'baby',label:'Baby',icon:'👶'},
  {id:'household',label:'Haushalt & Planung',icon:'🏡'},
  {id:'data',label:'Daten & Verbindungen',icon:'🔗'},
  {id:'help',label:'Hilfe & Feedback',icon:'💬'}
];
var integrations=['NTSync.open','openAlexaSync','openHealthSync','NTPartner.openInbox','NTExport.open','openImportPaste','NTUI.importFile','openBackupSettings','shareDay','openShareRange'];
var help=['openHelp','showWhatsNew','openFeedback'];

function row(label,act,args,hint,icon){
  return '<button type="button" class="b3-menu-row" aria-label="'+esc(label)+'"'
    +(hint?' aria-description="'+esc(hint)+'"':'')+' data-act="NTUI.dispatch" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'
    +(icon?'<span class="b3-menu-icon" aria-hidden="true">'+esc(icon)+'</span>':'')
    +'<span class="b3-menu-copy"><strong>'+esc(label)+'</strong>'+(hint?'<small>'+esc(hint)+'</small>':'')+'</span><span aria-hidden="true">›</span></button>';
}

function render(){
  var root=document.getElementById('b3Content');
  root.innerHTML='<div class="b3-more-entry">'+row('Alle Funktionen','NTUI.go',['functions'],'Suchen oder nach Bereich stöbern','🧩')+'</div>'
    +'<div class="b3-menu-list">'
    +row('Profil & Ziele','openSettings',['profil'],'Profil, Kalorienziele und Ernährung','👤')
    +row('Backup & Daten','openSettings',['backup'],'Sichern, importieren und OneDrive','💾')
    +row('Verbindungen','NTSync.open',[],'Personen, Partner-Postfach und Alexa','🔗')
    +'<details class="b3-menu-details"><summary><span class="b3-menu-icon" aria-hidden="true">⚙️</span><strong>Ansicht & Hinweise</strong></summary><div class="b3-menu-sublist">'
    +row('Navigation anpassen','NTUI.openPreferences')
    +row('Schnellaktionen anpassen','NTUIHome.configure')
    +row('Hinweise anpassen','NTUIReminders.open')
    +row('Klassische Ansicht','NTUI.classic')
    +'</div></details>'
    +row('Hilfe & FAQ','openHelp',[],'Anleitung und App-Tour','💬')
    +'</div>';
}

function groupOf(entry){
  if(help.includes(entry.act))return 'help';
  if(integrations.includes(entry.act)||(entry.act==='openSettings'&&entry.args[0]==='backup'))return 'data';
  if(entry.feature==='baby')return 'baby';
  if(['meals','water','fast','exercise'].includes(entry.feature))return 'nutrition';
  if(['shop','pantry','book','plan'].includes(entry.feature))return 'household';
  if(entry.feature==='partner')return 'data';
  return 'settings';
}

function normalize(value){
  return value.toLocaleLowerCase('de').replace(/ae/g,'ä').replace(/oe/g,'ö').replace(/ue/g,'ü')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss');
}

function renderCatalog(){
  document.getElementById('b3Content').innerHTML='<label for="b3CatalogQuery">Funktion suchen</label>'
    +'<input id="b3CatalogQuery" type="search" placeholder="z. B. Wasserziel, Alexa oder Backup" autocomplete="off">'
    +'<p id="b3CatalogStatus" class="b3-muted" role="status" hidden></p><div id="b3Catalog" class="b3-menu-list"></div>';
  filter();
}

function filter(){
  var query=document.getElementById('b3CatalogQuery').value.trim();
  var tokens=normalize(query).split(/[^a-z0-9]+/).filter(Boolean);
  var entries=NTUICatalog.entries().filter(function(e){
    var group=groups.find(function(g){return g.id===groupOf(e);});
    var search=normalize(e.search+' '+group.label);
    return tokens.every(function(token){return search.includes(token);});
  });
  var status=document.getElementById('b3CatalogStatus');
  status.hidden=!tokens.length;
  status.textContent=entries.length?(entries.length===1?'1 Treffer':entries.length+' Treffer'):'Keine passende Funktion gefunden.';
  document.getElementById('b3Catalog').innerHTML=groups.map(function(group){
    var matches=entries.filter(function(e){return groupOf(e)===group.id;});
    if(!matches.length)return '';
    var rows='<div class="b3-menu-sublist">'+matches.map(function(e){return row(e.label,e.act,e.args,e.hint);}).join('')+'</div>';
    var title='<span class="b3-menu-icon" aria-hidden="true">'+group.icon+'</span><strong>'+esc(group.label)+'</strong>';
    if(tokens.length)return '<section class="b3-menu-results"><h2>'+title+'</h2>'+rows+'</section>';
    return '<details class="b3-menu-details" name="b3-function-group"><summary>'+title+'</summary>'+rows+'</details>';
  }).join('');
}

document.addEventListener('input',function(e){
  if(e.target instanceof HTMLElement&&e.target.id==='b3CatalogQuery')filter();
});
window.NTUISettings={render:render,renderCatalog:renderCatalog};
})();
