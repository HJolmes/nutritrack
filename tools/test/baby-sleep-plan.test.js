// Tagesübersicht: die UI bleibt lesend; Aktionen verweisen auf existierende Baby-Tagebuch-Routinen.
'use strict';
process.env.TZ='Europe/Berlin';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function setup(log){
  const body={innerHTML:''},context={window:{},S:{babyLog:log||{},baby:{birth:'2026-09-12'}}};
  context.document={getElementById:id=>id==='babySleepPlanBody'?body:null};
  vm.createContext(context);
  for(const file of ['js/baby-sleep.js','js/baby-sleep-plan.js']){
    vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),context,{filename:file});
  }
  return {api:context.window.NTBabySleepPlan,body,log:context.S.babyLog};
}
test('Tagesübersicht hat Schlafplan, Zeitachsen-Legende, Startknopf und Sicherheits-Hinweis',()=>{
  const app=setup();
  app.api.render();
  assert.match(app.body.innerHTML,/Schlaf im Tagesverlauf/);
  assert.match(app.body.innerHTML,/Erfasst/);
  assert.match(app.body.innerHTML,/Angenommen/);
  assert.match(app.body.innerHTML,/Prognose/);
  assert.match(app.body.innerHTML,/NTBaby.startSleepFromPlanNow/);
  assert.match(app.body.innerHTML,/erst nach deinem Speichern/);
  assert.deepEqual(app.log,{});
});
test('Historische Tagesübersicht zeigt keine neue Prognose an',()=>{
  const app=setup();
  app.api.today();
  app.api.shift(-1);
  assert.doesNotMatch(app.body.innerHTML,/NTBaby.startSleepFromPlanNow/);
  assert.doesNotMatch(app.body.innerHTML,/NTBaby.sleepFromPlan/);
  app.api.today();
  assert.match(app.body.innerHTML,/NTBaby.startSleepFromPlanNow/);
});
test('Das Lesen der Tagesübersicht fügt keine Schläfchen hinzu',()=>{
  const now=new Date(),key=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const log={[key]:[{id:'baby-safe',t:'sleep',from:'00:00',to:'00:40',sleepType:'day'}]};
  const snapshot=JSON.stringify(log);
  const app=setup(log);app.api.render();
  assert.match(app.body.innerHTML,/Bearbeiten/);
  assert.equal(JSON.stringify(log),snapshot);
});
