// Babyschlaf-Prognose: deterministische Tests ohne Browser, Netzwerk oder Nutzerdaten.
'use strict';
process.env.TZ='Europe/Berlin';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function load(){
  const ctx={console,window:{}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/baby-sleep.js'),'utf8'),ctx);
  return ctx.window.NTBabySleep;
}
function date(day,hm){return new Date(day+'T'+hm+':00').getTime();}
const birth='2026-09-12';

test('Ohne Schlafdaten keine erfundene Prognose',()=>{
  const api=load();
  assert.equal(api.predict({},birth,date('2026-11-22','12:00')).kind,'empty');
  assert.match(api.cardHtml({},birth,date('2026-11-22','12:00')),/Schlafprognose/);
});
test('Mehrere abgeschlossene Schläfchen ergeben Beginn, Dauer und Aufwachfenster',()=>{
  const api=load(),logs={};
  for(let d=1;d<=14;d++){
    const key=new Date(2026,10,22-d);
    const k=key.getFullYear()+'-'+String(key.getMonth()+1).padStart(2,'0')+'-'+String(key.getDate()).padStart(2,'0');
    logs[k]=[
      {id:'mor'+d,t:'sleep',from:'08:15',to:'09:00'},
      {id:'nap'+d,t:'sleep',from:'10:35',to:'11:20'},
      {id:'aft'+d,t:'sleep',from:'13:00',to:'13:55'},
      {id:'feed'+d,t:'breast',ts:date(k,'12:20'),min:12}
    ];
  }
  logs['2026-11-22']=[{id:'today',t:'sleep',from:'10:00',to:'10:45'},{id:'fd',t:'breast',ts:date('2026-11-22','11:10'),min:8}];
  const clone=JSON.stringify(logs);
  const r=api.predict(logs,birth,date('2026-11-22','11:30'));
  assert.equal(r.kind,'awake');
  assert.ok(r.startLow>=date('2026-11-22','11:30'));
  assert.ok(r.startHigh>=r.startLow);
  assert.ok(r.duration.lo>0&&r.duration.hi>=r.duration.lo);
  assert.ok(r.wakeLow>=r.startLow&&r.wakeHigh>=r.wakeLow);
  assert.ok(r.n>=10);
  assert.equal(r.feedingObserved,true);
  assert.equal(JSON.stringify(logs),clone,'darf Baby-Tagebuch nicht verändern');
});
test('Laufender Schlaf wird erkannt und erwartetes Aufwachen angezeigt',()=>{
  const api=load(),now=date('2026-11-22','10:00');
  const r=api.predict({'2026-11-22':[{t:'sleep',from:'09:30',to:''}]},birth,now);
  assert.equal(r.kind,'sleeping');
  assert.ok(r.wakeHigh>now);
  assert.match(api.cardHtml({'2026-11-22':[{t:'sleep',from:'09:30'}]},birth,now),/Nächstes Aufwachen/);
});
test('Schlaf über Mitternacht endet am Folgetag',()=>{
  const api=load(),r=api.predict({'2026-11-21':[{t:'sleep',from:'23:10',to:'02:10'}]},birth,date('2026-11-22','03:00'));
  assert.equal(r.kind,'awake');
  assert.equal(r.from,date('2026-11-22','02:10'));
});
test('Laufender Schlaf über Mitternacht bleibt laufend',()=>{
  const api=load(),r=api.predict({'2026-11-21':[{t:'sleep',from:'23:10',to:''}]},birth,date('2026-11-22','00:15'));
  assert.equal(r.kind,'sleeping');
});
test('Nach sehr altem Schlafprotokoll keine falsche Uhrzeit',()=>{
  const api=load(),r=api.predict({'2026-11-10':[{t:'sleep',from:'08:00',to:'09:00'}]},birth,date('2026-11-22','12:00'));
  assert.equal(r.kind,'stale');
});
test('Fehlerhafte, zukünftige und viel zu lange Schlafdaten werden ignoriert',()=>{
  const api=load(),r=api.predict({'2026-11-22':[
    {t:'sleep',from:'27:00',to:'28:00'},
    {t:'sleep',from:'19:00',to:'22:00'},
    {t:'sleep',from:'12:00',to:'12:01'},
    {t:'sleep',from:'12:30',to:'15:00'}
  ]},birth,date('2026-11-22','11:00'));
  assert.equal(r.kind,'empty');
});
test('Fieber-Einträge dienen nur als Unsicherheitswarnung, nicht als Einschlaf-Ursache',()=>{
  const api=load(),log={'2026-11-22':[
    {t:'sleep',from:'08:00',to:'09:00'},
    {t:'temp',c:38.2,ts:date('2026-11-22','10:00')}
  ]},r=api.predict(log,birth,date('2026-11-22','10:10'));
  assert.equal(r.kind,'awake');
  assert.equal(r.healthCaution,true);
  assert.match(api.cardHtml(log,birth,date('2026-11-22','10:10')),/Fieber/);
});

test('Tagschlaf um 18:45 wird nicht nur wegen Uhrzeit als Nacht markiert',()=>{
  const api=load(),log={
    '2026-11-21':[
      {id:'early',t:'sleep',from:'18:45',to:'19:10'},
      {id:'night',t:'sleep',from:'22:10',to:'02:00'}
    ],
    '2026-11-22':[
      {id:'later',t:'sleep',from:'02:40',to:'06:35'},
      {id:'morning',t:'sleep',from:'09:15',to:'09:50'}
    ]
  },types=api.classifications(log,date('2026-11-22','10:00'));
  assert.equal(types.early,'day');
  assert.equal(types.night,'night');
  assert.equal(types.later,'night');
  assert.equal(types.morning,'day');
});
test('Manuelle Einordnung gewinnt über nächtliche Kernzeit und Tagesuhrzeit',()=>{
  const api=load(),log={'2026-11-22':[
    {id:'forcedDay',t:'sleep',from:'00:30',to:'01:30',sleepType:'day'},
    {id:'forcedNight',t:'sleep',from:'13:00',to:'13:30',sleepType:'night'}
  ]},clone=JSON.stringify(log);
  const types=api.classifications(log,date('2026-11-22','16:00'));
  assert.equal(types.forcedDay,'day');
  assert.equal(types.forcedNight,'night');
  assert.equal(JSON.stringify(log),clone,'Klassifikation verändert keine gespeicherten Daten');
});
function exampleNights(){
  const log={};
  for(let i=1;i<=5;i++){
    const d=new Date(2026,10,19-i);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
    const nk=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-'+String(next.getDate()).padStart(2,'0');
    log[k]=[
      {id:'start'+i,t:'sleep',from:'20:00',to:'23:00'},
      {id:'middle'+i,t:'sleep',from:'23:35',to:'02:10'}
    ];
    log[nk]=(log[nk]||[]).concat([{id:'morning'+i,t:'sleep',from:'02:40',to:'07:00'}]);
  }
  return log;
}
test('Mehrere Schlafblöcke zählen zu einer Nacht; Morgen nicht minutengenau',()=>{
  const api=load(),log=exampleNights();
  log['2026-11-22']=[{id:'open',t:'sleep',from:'20:10',to:''}];
  const p=api.predict(log,birth,date('2026-11-22','21:00'));
  assert.equal(p.kind,'sleeping');
  assert.equal(p.sleepType,'night');
  assert.ok(p.morning&&p.morning.count>=3);
  assert.ok((p.morning.hi-p.morning.lo)>=60*60*1000,'mindestens eine Stunde Fenster');
  assert.match(api.cardHtml(log,birth,date('2026-11-22','21:00')),/Morgens voraussichtlich wach/);
});
test('Kurzes nächtliches Aufwachen führt zu nächstem Nachtschlafblock',()=>{
  const api=load(),log=exampleNights();
  log['2026-11-22']=[{id:'recent',t:'sleep',from:'00:20',to:'00:40'}];
  const p=api.predict(log,birth,date('2026-11-22','01:00'));
  assert.equal(p.kind,'awake');
  assert.equal(p.sleepType,'night');
});
test('Nach dem üblichen Morgen wird der nächste Tagschlaf statt Nachtfortsetzung geschätzt',()=>{
  const api=load(),log=exampleNights();
  log['2026-11-22']=[{id:'recent',t:'sleep',from:'04:00',to:'07:30'}];
  const p=api.predict(log,birth,date('2026-11-22','08:00'));
  assert.equal(p.kind,'awake');
  assert.equal(p.sleepType,'day');
});
test('Ein Abendeinschlafen wird anhand früherer Nächte erkannt',()=>{
  const api=load(),log=exampleNights();
  log['2026-11-22']=[{id:'open',t:'sleep',from:'20:15',to:''}];
  const types=api.classifications(log,date('2026-11-22','20:20'));
  assert.equal(types.open,'night');
});

test('Vergangene Nacht wird aus Stillen und Wickeln abgeleitet, niemals als echter Schlaf gespeichert',()=>{
  const api=load(),log={
    '2026-11-20':[
      {id:'f1',t:'breast',ts:date('2026-11-20','22:30'),min:12},
      {id:'d1',t:'diaper',ts:date('2026-11-20','22:36')}
    ],
    '2026-11-21':[
      {id:'f2',t:'breast',ts:date('2026-11-21','02:15'),min:15},
      {id:'f3',t:'breast',ts:date('2026-11-21','05:30'),min:10},
      {id:'nap',t:'sleep',from:'12:20',to:'13:05',sleepType:'day'}
    ]
  },now=date('2026-11-22','17:30'),saved=JSON.stringify(log);
  const hist=api.nightHistory(log,now);
  assert.equal(hist.nights,1);
  assert.ok(hist.sleeps.length>=3);
  assert.ok(hist.sleeps.every(s=>s.inferred&&s.type==='night'));
  assert.ok(hist.sleeps.every(s=>new Date(s.start).getHours()>=20||new Date(s.start).getHours()<7));
  assert.ok(hist.sleeps.every(s=>s.end<=date('2026-11-21','07:00')));
  assert.equal(JSON.stringify(log),saved,'Abgeleitete Blöcke dürfen niemals zurückgespeichert werden');
  const p=api.predict(log,birth,now);
  assert.equal(p.assumedNights,1);
  assert.match(api.cardHtml(log,birth,now),/Stillen\/Wickeln angenommen/);
});
test('Tagsüber ohne Schlaftracking werden keine Schlafblöcke erfunden',()=>{
  const api=load(),log={
    '2026-11-21':[
      {t:'breast',ts:date('2026-11-21','09:30'),min:12},
      {t:'diaper',ts:date('2026-11-21','13:00')},
      {t:'breast',ts:date('2026-11-21','18:00'),min:15}
    ]
  },hist=api.nightHistory(log,date('2026-11-22','15:00'));
  assert.equal(hist.nights,0);
  assert.equal(hist.sleeps.length,0);
});
test('Unbekannte Nächte ohne eingetragene Nachtversorgung werden nicht rekonstruiert',()=>{
  const api=load(),hist=api.nightHistory({'2026-11-21':[{t:'sleep',from:'22:00',to:'06:00'}]},date('2026-11-22','16:00'));
  assert.equal(hist.nights,0);
  assert.equal(hist.sleeps.length,0);
});
test('Original-Schlaf bleibt maßgeblich, Rekonstruktionen überlappen ihn nicht',()=>{
  const api=load(),log={
    '2026-11-20':[
      {t:'breast',ts:date('2026-11-20','23:00'),min:10},
      {t:'sleep',from:'23:30',to:'03:00',sleepType:'night'}
    ],
    '2026-11-21':[{t:'breast',ts:date('2026-11-21','04:00'),min:14}]
  },hist=api.nightHistory(log,date('2026-11-22','12:00'));
  const from=date('2026-11-20','23:30'),to=date('2026-11-21','03:00');
  assert.ok(hist.sleeps.every(s=>s.end<=from||s.start>=to));
  const pred=api.predict(log,birth,date('2026-11-22','12:00'));
  assert.equal(pred.kind,'stale');
  assert.equal(pred.assumedNights,1);
});
test('Annahmen aus Nachtversorgung erzeugen keine erfundene Morgen- oder Einschlafstatistik',()=>{
  const api=load(),log={};
  for(let n=10;n<=18;n++){
    const k='2026-11-'+n,following='2026-11-'+(n+1);
    log[k]=[{id:'b'+n,t:'breast',ts:date(k,'23:15'),min:12}];
    log[following]=(log[following]||[]).concat([{id:'a'+n,t:'diaper',ts:date(following,'03:10')}]);
  }
  const hist=api.nightHistory(log,date('2026-11-22','13:00'));
  assert.ok(hist.nights>=5);
  const predicted=api.predict(log,birth,date('2026-11-22','13:00'));
  assert.equal(predicted.kind,'empty');
  assert.equal(predicted.n,0);
  assert.equal(predicted.assumedNights,hist.nights);
});
test('Es werden nur vollständig vergangene Nächte rekonstruiert',()=>{
  const api=load(),log={'2026-11-21':[{t:'breast',ts:date('2026-11-21','23:15'),min:10}]};
  const during=api.nightHistory(log,date('2026-11-22','01:00'));
  assert.equal(during.nights,0);
  const after=api.nightHistory(log,date('2026-11-22','11:00'));
  assert.equal(after.nights,1);
});
test('Anpassbares Nachtfenster begrenzt die Annahme und verwirft unsinnige Grenzen',()=>{
  const api=load(),log={'2026-11-20':[{t:'breast',ts:date('2026-11-20','22:00'),min:12}]};
  const now=date('2026-11-22','15:00'),opts={start:'21:00',end:'06:00'};
  assert.equal(api.validNightWindow(opts),true);
  assert.equal(api.validNightWindow({start:'13:00',end:'16:00'}),false);
  const hist=api.nightHistory(log,now,opts);
  assert.equal(hist.window.start,'21:00');
  assert.ok(hist.sleeps.every(s=>s.start>=date('2026-11-20','21:00')&&s.end<=date('2026-11-21','06:00')));
  assert.equal(api.nightHistory(log,now,{start:'13:00',end:'16:00'}).window.start,'20:00');
});
test('Annahme wird bei geringer Historie schwach gewichtet und zählt nicht zu echten Vergleichsdaten',()=>{
  const api=load(),log={
    '2026-11-20':[
      {t:'breast',ts:date('2026-11-20','23:00'),min:10}
    ],
    '2026-11-21':[
      {t:'breast',ts:date('2026-11-21','02:00'),min:12},
      {t:'sleep',from:'20:15',to:'',sleepType:'night'}
    ]
  };
  const now=date('2026-11-21','21:00');
  const p=api.predict(log,birth,now);
  assert.equal(p.kind,'sleeping');
  assert.equal(p.sleepType,'night');
  assert.equal(p.n,0);
  assert.ok(p.assumedNights>=0);
});
