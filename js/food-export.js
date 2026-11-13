// @ts-check
// NutriTrack – Essen als Excel exportieren. Klassisches Script, kein Modul.
// Exportiert window.NTExport und greift nur auf den Kern aus index.html zu
// (S, showToast, openOv, closeOv) sowie auf js/calc.js (foodExportRows,
// today, addDays) und js/xlsx.js (NTXlsx).
//
// Dialog #foodExportOv (Mehr → Backup & Daten → 📊 Excel-Export): Zeitraum
// 7/30/90 Tage, Alles oder frei Von–Bis. Die Datei hat zwei Blaetter:
// „Einträge“ (jede Position) und „Tage“ (Summen je Tag). Auf dem Handy geht
// sie ueber das Teilen-Menue (Mail, Dateien, Excel), sonst als Download.

(function(){
'use strict';

/** @param {string} id */
function inp(id){return /** @type {HTMLInputElement|null} */ (document.getElementById(id));}

function firstDay(){
  var keys=Object.keys(S.days||{}).filter(function(k){return /^\d{4}-\d{2}-\d{2}$/.test(k);}).sort();
  return keys[0]||today();
}

/** Zeitraum setzen: Anzahl Tage bis heute, 0 = alles. @param {number} n */
function range(n){
  var t=today(),f=inp('fxFrom'),to=inp('fxTo');
  if(!f||!to)return;
  f.value=n>0?addDays(t,-(n-1)):firstDay();
  to.value=t;
  mark(n);
}

/** @param {number} n */
function mark(n){
  document.querySelectorAll('#foodExportOv [data-fx]').forEach(function(b){
    b.classList.toggle('act',b.getAttribute('data-fx')===String(n));
  });
}

function open(){
  openOv('foodExportOv');
  range(30);
}

/** @param {Uint8Array} bytes @param {string} name */
function deliver(bytes,name){
  var blob=new Blob([/** @type {BlobPart} */ (bytes)],{type:NTXlsx.MIME});
  var file=null;
  try{file=new File([blob],name,{type:NTXlsx.MIME});}catch(e){}
  var mobile=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
  if(mobile&&file&&navigator.canShare&&navigator.canShare({files:[file]})){
    navigator.share({title:'NutriTrack Export',files:[file]}).then(function(){
      closeOv('foodExportOv');showToast('📊 Excel-Datei exportiert');
    },function(e){
      if(e&&e.name==='AbortError')return;
      download(blob,name);
    });
    return;
  }
  download(blob,name);
}

/** @param {Blob} blob @param {string} name */
function download(blob,name){
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},4000);
  closeOv('foodExportOv');showToast('📊 Excel-Datei exportiert');
}

function run(){
  var f=inp('fxFrom'),to=inp('fxTo');
  var from=f&&f.value||firstDay(),till=to&&to.value||today();
  if(from>till){var x=from;from=till;till=x;}
  var r=foodExportRows(S.days||{},from,till,{waterUnit:S.waterUnit,weightLog:S.weightLog});
  if(r.entries.length<2&&r.days.length<2){showToast('Keine Einträge in diesem Zeitraum');return;}
  var bytes=NTXlsx.build([
    {name:'Einträge',rows:r.entries,widths:[11,13,8,32,10,10,8,11,17,9,10,16,9]},
    {name:'Tage',rows:r.days,widths:[11,8,11,17,9,10,16,9,12,12,10,12,9,24]}
  ]);
  deliver(bytes,'nutritrack-essen-'+from+'_bis_'+till+'.xlsx');
}

// Von/Bis von Hand geaendert → kein Schnellwahl-Knopf mehr markiert.
['fxFrom','fxTo'].forEach(function(id){var el=inp(id);if(el)el.addEventListener('input',function(){mark(-1);});});

window.NTExport={open:open,range:range,run:run};
})();
