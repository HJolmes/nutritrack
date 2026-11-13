// @ts-check
// NutriTrack – Excel-Datei schreiben (.xlsx). Klassisches Script, kein Modul.
// Exportiert window.NTXlsx und greift auf nichts aus index.html zu.
//
// Warum selbst geschrieben: Die App hat keine Laufzeit-Abhaengigkeit aus npm
// (AGENTS.md). Eine .xlsx ist ein ZIP mit ein paar XML-Dateien (Office Open
// XML). Das ZIP wird hier ungepackt („stored“) geschrieben – Excel, Numbers,
// LibreOffice und Google Tabellen lesen das; die Datei ist nur etwas groesser.
//
// Zellen: Zahl → Zahl, Text → Inline-Text, {d:'YYYY-MM-DD'} → Datum (Excel-
// Seriennummer mit Datumsformat 14, das Excel in der Landessprache zeigt,
// in Deutschland TT.MM.JJJJ), '' / null → leer. Zeile 1 ist fett, fixiert und
// hat einen Autofilter.

(function(){
'use strict';

/** @typedef {string|number|null|undefined|{d:string}} Cell */
/** @typedef {{name:string,rows:Cell[][],widths?:number[]}} Sheet */

var _crcT=/** @type {number[]|null} */ (null);
/** @param {Uint8Array} b */
function crc32(b){
  if(!_crcT){_crcT=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;_crcT[n]=c>>>0;}}
  var crc=0xFFFFFFFF;
  for(var i=0;i<b.length;i++)crc=_crcT[(crc^b[i])&0xFF]^(crc>>>8);
  return(crc^0xFFFFFFFF)>>>0;
}

/** @param {string} s */
function xmlEsc(s){
  // Steuerzeichen sind in XML 1.0 verboten (ausser Tab/LF/CR) – sie fliegen raus.
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Spalte 0 → A, 26 → AA. @param {number} i */
function colName(i){var s='';i++;while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}

/** 'YYYY-MM-DD' → Excel-Seriennummer (Tage seit 1899-12-30). @param {string} s */
function dateSerial(s){
  var p=String(s).split('-');
  return Math.round((Date.UTC(+p[0],+p[1]-1,+p[2])-Date.UTC(1899,11,30))/86400000);
}

/** @param {Cell} v @param {string} ref @param {boolean} head */
function cellXml(v,ref,head){
  if(v==null||v==='')return'';
  if(typeof v==='object'&&v&&'d' in v)return'<c r="'+ref+'" s="1"><v>'+dateSerial(v.d)+'</v></c>';
  if(typeof v==='number'&&isFinite(v))return'<c r="'+ref+'"'+(head?' s="2"':'')+'><v>'+v+'</v></c>';
  return'<c r="'+ref+'" t="inlineStr"'+(head?' s="2"':'')+'><is><t xml:space="preserve">'+xmlEsc(String(v))+'</t></is></c>';
}

/** @param {Sheet} sh */
function sheetXml(sh){
  var rows=sh.rows||[],ncol=rows.reduce(function(a,r){return Math.max(a,r.length);},1);
  var cols=(sh.widths||[]).map(function(w,i){return'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>';}).join('');
  var data=rows.map(function(r,ri){
    return'<row r="'+(ri+1)+'">'+r.map(function(v,ci){return cellXml(v,colName(ci)+(ri+1),ri===0);}).join('')+'</row>';
  }).join('');
  var last=colName(ncol-1)+Math.max(rows.length,1);
  return'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<dimension ref="A1:'+last+'"/>'
    +'<sheetViews><sheetView workbookViewId="0">'+(rows.length>1?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':'')+'</sheetView></sheetViews>'
    +(cols?'<cols>'+cols+'</cols>':'')
    +'<sheetData>'+data+'</sheetData>'
    +(rows.length>1?'<autoFilter ref="A1:'+last+'"/>':'')
    +'</worksheet>';
}

/** Blattname: max. 31 Zeichen, ohne : \ / ? * [ ]. @param {string} n @param {number} i */
function sheetName(n,i){return String(n||'').replace(/[:\\\/\?\*\[\]]/g,' ').slice(0,31)||('Blatt'+(i+1));}

/** @param {Sheet[]} sheets */
function files(sheets){
  var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    +'<Default Extension="xml" ContentType="application/xml"/>'
    +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    +sheets.map(function(_,i){return'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';}).join('')
    +'</Types>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    +'</Relationships>';
  var wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheets>'+sheets.map(function(s,i){return'<sheet name="'+xmlEsc(sheetName(s.name,i))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>';}).join('')+'</sheets>'
    +'<definedNames>'+sheets.map(function(s,i){
      var nc=(s.rows||[]).reduce(function(a,r){return Math.max(a,r.length);},1);
      return(s.rows||[]).length>1?'<definedName name="_xlnm._FilterDatabase" localSheetId="'+i+'" hidden="1">\''+xmlEsc(sheetName(s.name,i)).replace(/'/g,"''")+'\'!$A$1:$'+colName(nc-1)+'$'+s.rows.length+'</definedName>':'';
    }).join('')+'</definedNames>'
    +'</workbook>';
  var wbRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +sheets.map(function(_,i){return'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>';}).join('')
    +'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    +'</Relationships>';
  // Stil 0 = normal, 1 = Datum (Format 14), 2 = fett (Kopfzeile).
  var styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    +'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    +'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    +'<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    +'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
    +'<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>'
    +'</styleSheet>';
  /** @type {[string,string][]} */
  var out=[['[Content_Types].xml',ct],['_rels/.rels',rels],['xl/workbook.xml',wb],['xl/_rels/workbook.xml.rels',wbRels],['xl/styles.xml',styles]];
  sheets.forEach(function(s,i){out.push(['xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(s)]);});
  return out;
}

/** ZIP ohne Kompression. @param {[string,string][]} list */
function zip(list){
  var enc=new TextEncoder(),parts=/** @type {Uint8Array[]} */ ([]),central=/** @type {Uint8Array[]} */ ([]),off=0;
  // Feste DOS-Zeit 2026-01-01 00:00 – der Inhalt bestimmt die Datei, nicht die Uhr.
  var dTime=0,dDate=((2026-1980)<<9)|(1<<5)|1;
  list.forEach(function(f){
    var name=enc.encode(f[0]),data=enc.encode(f[1]),crc=crc32(data);
    var h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);
    h.setUint16(10,dTime,true);h.setUint16(12,dDate,true);h.setUint32(14,crc,true);
    h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);h.setUint16(28,0,true);
    var c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
    c.setUint16(12,dTime,true);c.setUint16(14,dDate,true);c.setUint32(16,crc,true);
    c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);
    c.setUint32(42,off,true);
    parts.push(new Uint8Array(h.buffer),name,data);
    central.push(new Uint8Array(c.buffer),name);
    off+=30+name.length+data.length;
  });
  var cSize=central.reduce(function(a,b){return a+b.length;},0);
  var e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,list.length,true);e.setUint16(10,list.length,true);
  e.setUint32(12,cSize,true);e.setUint32(16,off,true);
  var all=parts.concat(central,[new Uint8Array(e.buffer)]);
  var res=new Uint8Array(all.reduce(function(a,b){return a+b.length;},0)),p=0;
  all.forEach(function(b){res.set(b,p);p+=b.length;});
  return res;
}

/** @param {Sheet[]} sheets @returns {Uint8Array} */
function build(sheets){return zip(files(sheets));}

var MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
window.NTXlsx={build:build,MIME:MIME,crc32:crc32,dateSerial:dateSerial,colName:colName};
})();
