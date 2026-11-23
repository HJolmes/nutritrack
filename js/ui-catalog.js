// @ts-check
// Presentation targets derive from the existing feature registry. No domain data.
(function(){
'use strict';
var fixed=[{id:'home',label:'Heute',ic:'⌂'},{id:'nutrition',label:'Ernährung',ic:'🍽'},{id:'household',label:'Haushalt',ic:'⌂'},{id:'history',label:'Verlauf',ic:'📅'},{id:'trends',label:'Trends',ic:'📈'},{id:'more',label:'Mehr',ic:'☰'}];
function targets(){
  return fixed.concat(NTFeat.list().filter(function(f){return ['baby','shop','pantry','plan','book'].indexOf(f.id)>=0;}).map(function(f){return {id:f.id,label:f.label,ic:f.ic};}));
}
function target(id){return targets().find(function(t){return t.id===id;})||null;}
function available(id){var f=NTFeat.byId(id);return !!target(id)&&(!f||!NTFeat.isOff(f));}
function entries(){
  var result=[
    {label:'OneDrive, Autosicherung, Backup & Datei-Import',act:'openSettings',args:['backup'],feature:''},
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
    {label:'Vorlagen für Mahlzeiten',act:'NTUI.templates',args:[],feature:''}
    ,{label:'Eigene Lebensmittel',act:'openLibrary',args:['foods'],feature:'meals'}
    ,{label:'Lebensmittel- und Restaurant-Suche',act:'NTPicker.openPicker',args:[null,'search'],feature:'meals'}
    ,{label:'Fasten starten / beenden',act:'openFastOv',args:[],feature:'fast'}
  ];
  NTFeat.list().forEach(function(f){
    result.push({label:f.label+' · Optionen',act:'NTFeat.sheet',args:[f.id],feature:f.id});
    (f.actions||[]).forEach(function(a){result.push({label:f.label+' · '+a.label,act:a.act,args:a.args||[],feature:f.id});});
  });
  document.querySelectorAll('#moreScreen .main [data-act],.screen>.hdr [data-act]').forEach(function(el){
    var act=el.getAttribute('data-act');if(!act||act.indexOf('NTUI')===0)return;
    var label=el.querySelector('.lr-name');
    result.push({label:label?label.textContent.trim():(el.getAttribute('title')||el.textContent.trim()),act:act,args:JSON.parse(el.getAttribute('data-args')||'[]'),feature:''});
  });
  var seen={};return result.filter(function(e){var key=e.act+JSON.stringify(e.args);if(seen[key])return false;seen[key]=true;return true;});
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
