// @ts-check
// Presentation targets derive from the existing feature registry. No domain data.
(function(){
'use strict';
var fixed=[{id:'home',label:'Heute',ic:'⌂'},{id:'nutrition',label:'Ernährung',ic:'🍽'},{id:'household',label:'Haushalt',ic:'🏡'},{id:'history',label:'Verlauf',ic:'📅'},{id:'trends',label:'Trends',ic:'📈'},{id:'more',label:'Mehr',ic:'☰'}];
function targets(){
  return fixed.concat(NTFeat.list().filter(function(f){return ['baby','shop','pantry','plan','book'].indexOf(f.id)>=0;}).map(function(f){return {id:f.id,label:f.label,ic:f.ic};}));
}
function target(id){
  if(id==='functions')return {id:id,label:'Alle Funktionen',ic:'🧩'};
  var view=({'nutrition-plan':'plan','nutrition-book':'book'})[id]||id;
  return targets().find(function(t){return t.id===view;})||null;
}
function available(id){var t=target(id),f=t&&NTFeat.byId(t.id);return !!t&&(!f||!NTFeat.isOff(f));}
function entries(){
  var result=[
    {label:'Backup & Daten',hint:'OneDrive, Autosicherung, Backup wiederherstellen',act:'openSettings',args:['backup'],feature:''},
    {label:'Verbindungen',hint:'Mit Personen teilen und Synchronisation einrichten',act:'NTSync.open',args:[],feature:''},
    {label:'Alexa-Verbindung',act:'openAlexaSync',args:[],feature:''},
    {label:'Apple / Samsung Health',act:'openHealthSync',args:[],feature:''},
    {label:'Partner-Postfach',act:'NTPartner.openInbox',args:[],feature:''},
    {label:'Excel-Export',act:'NTExport.open',args:[],feature:''},
    {label:'KI-Prompts',act:'openPromptSettings',args:[],feature:''},
    {label:'Code / Link importieren',act:'openImportPaste',args:[],feature:''},
    {label:'Datei importieren',act:'NTUI.importFile',args:[],feature:''},
    {label:'Hilfe und App-Tour',act:'openHelp',args:[],feature:''},
    {label:'Was ist neu?',act:'showWhatsNew',args:[],feature:''},
    {label:'Feedback / Bug oder Wunsch',act:'openFeedback',args:[],feature:''},
    {label:'Vorlagen für Mahlzeiten',act:'NTUI.templates',args:[],feature:'meals'},
    {label:'Eigene Lebensmittel',act:'openLibrary',args:['foods'],feature:'meals'},
    {label:'Lebensmittel- und Restaurant-Suche',hint:'Barcode, Foto, Chat, Suche und eigene Lebensmittel',act:'NTPicker.openPicker',args:[null,'search'],feature:'meals'},
    {label:'Fasten starten / beenden',act:'openFastOv',args:[],feature:'fast'},
    {label:'Navigation anpassen',act:'NTUI.openPreferences',args:[],feature:''},
    {label:'Schnellaktionen anpassen',act:'NTUIHome.configure',args:[],feature:''},
    {label:'Hinweise anpassen',hint:'Mahlzeiten, Schlaf, Vorsorge und Vorrat',act:'NTUIReminders.open',args:[],feature:''},
    {label:'Klassische Ansicht',act:'NTUI.classic',args:[],feature:''}
  ];
  NTFeat.list().forEach(function(f){
    result.push({label:f.label,hint:f.sub,act:'NTFeat.sheet',args:[f.id],feature:f.id});
    (f.actions||[]).forEach(function(a){result.push({label:a.label,hint:a.hint,act:a.act,args:a.args||[],feature:f.id});});
  });
  document.querySelectorAll('#moreScreen .main [data-act],.screen>.hdr [data-act]').forEach(function(el){
    var act=el.getAttribute('data-act');
    if(!act||act.indexOf('NTUI')===0||['changeDay','dismissOdBanner'].includes(act))return;
    var label=el.querySelector('.lr-name'),hint=el.querySelector('.lr-sub');
    result.push({label:label?label.textContent.trim():(el.getAttribute('title')||el.textContent.trim()),hint:hint?hint.textContent.trim():'',act:act,args:JSON.parse(el.getAttribute('data-args')||'[]'),feature:''});
  });
  var distinct=new Map();
  result.forEach(function(e){
    var key=e.act+JSON.stringify(e.args);
    var f=NTFeat.byId(e.feature);
    var search=[e.label,e.hint,f&&f.label].filter(Boolean).join(' ');
    var existing=distinct.get(key);
    if(existing)existing.search+=' '+search;
    else distinct.set(key,Object.assign({},e,{search:search}));
  });
  return Array.from(distinct.values());
}
function owner(id,fallback){
  if(/^baby|^bqa/.test(id))return 'baby';
  if(/^shop/.test(id))return 'shop';
  if(/^pantry/.test(id))return 'pantry';
  if(/^plan/.test(id))return 'plan';
  if(/^(library|book|cook|rec)/.test(id))return 'book';
  if(/^(picker|editEntry|ownFood|exercise|water|fast)/.test(id))return 'nutrition';
  if(/^(sett|help|feat|backup|foodExport|links|alexa|health|partner|import|share|od)/.test(id))return 'more';
  return ['history','trends'].indexOf(fallback)>=0?'nutrition':fallback;
}
window.NTUICatalog={targets:targets,target:target,available:available,entries:entries,owner:owner};
})();
