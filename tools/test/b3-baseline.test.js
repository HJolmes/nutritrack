'use strict';
process.env.TZ='Europe/Berlin';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {inventory}=require('../b3-inventory');
const {fixture}=require('../fixtures/b3-state');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('B3 inventory protects every original handler, feature, launch ID and exported API',()=>{
  const baseline=JSON.parse(read('docs/b3-baseline.json')),current=inventory();
  const key=a=>a.file+'|'+a.kind+'|'+a.target;
  const now=new Set(current.actions.map(key));
  for(const a of baseline.actions)assert.ok(now.has(key(a)),'Lost action: '+key(a));
  for(const a of baseline.features)assert.ok(current.features.some(x=>x.id===a.id),'Lost feature '+a.id);
  for(const a of baseline.launch)assert.ok(current.launch.some(x=>x.id===a.id),'Lost shortcut '+a.id);
  for(const ns of baseline.exports)for(const member of ns.members)assert.ok(current.exports.some(x=>x.namespace===ns.namespace&&x.members.includes(member)),'Lost export '+ns.namespace+'.'+member);
  assert.equal(current.matrix.length,50);
  assert.deepEqual(current.matrix.map(x=>x.id),Array.from({length:50},(_,i)=>'F'+String(i+1).padStart(2,'0')));
});
function baby(log={}) {
  const ctx={window:{},S:{babyOn:true,currentDate:'2026-11-22',babyLog:log},NTSync:{engine:()=>({schedule(){}})},document:{getElementById:()=>null,addEventListener(){}},saveS(){},showToast(){},setTimeout(){},clearTimeout(){}};
  vm.createContext(ctx); vm.runInContext(read('js/calc.js'),ctx); vm.runInContext(read('js/baby.js'),ctx);
  return {api:ctx.window.NTBaby,state:ctx.S};
}
test('B3 baseline: breast sequence uses authoritative side and preserves historical day',()=>{
  for(const [entry,expected] of [[{side:'r'},'l'],[{side:'l'},'r'],[{side:'b',main:'r'},'l'],[{side:'b',main:'l'},'r']]) {
    const app=baby({'2026-11-21':[{t:'breast',ts:1,...entry}],'2026-11-23':[{t:'breast',side:expected,ts:3}]});
    assert.equal(app.api.nextSide('2026-11-22'),expected);
  }
  const app=baby({'2026-11-22':[{t:'breast',side:'r',ts:1},{t:'breast',side:'b',ts:2},...['bottle','solid','pump','diaper'].map((t,i)=>({t,side:'l',ts:3+i}))]});
  assert.equal(app.api.nextSide('2026-11-22'),'l');
  assert.equal(baby().api.nextSide('2026-11-22'),'');
});
test('B3 baseline: editing/deleting history recalculates, duplicate start and stale stop are harmless',()=>{
  const app=baby({'2026-11-22':[{id:'b1',t:'breast',side:'r',ts:1}]});
  app.state.babyLog['2026-11-22'][0].side='l';assert.equal(app.api.nextSide('2026-11-22'),'r');
  app.state.babyLog['2026-11-22']=[];assert.equal(app.api.nextSide('2026-11-22'),'');
  app.api.startFeed('r');app.api.startFeed('l');
  const run=app.api.runningFeed();assert.equal(run.side,'r');
  app.api.switchFeed();assert.equal(app.api.runningFeed().side,'l');assert.equal(run.run,undefined);
  app.api.stopFeed(true,run.id);assert.equal(app.api.runningFeed().side,'l');
  app.api.stopFeed(true,app.api.runningFeed().id);assert.equal(app.api.runningFeed(),null);
});
test('B3 fixture covers all eleven baby types, ten personal buttons and non-destructive state restore',()=>{
  const data=fixture(),app=baby(data.state.babyLog),ctx={window:{}};vm.createContext(ctx);vm.runInContext(read('js/calc.js'),ctx);
  assert.deepEqual(Object.keys(app.api.TYPES).sort(),data.state.babyLog['2026-11-22'].map(x=>x.t).sort());
  const before=JSON.stringify(data);const target={futurePreference:{preserve:true}};
  ctx.mergeState(target,JSON.parse(JSON.stringify(data.state)));
  for(const key of Object.keys(data.state))assert.deepEqual(target[key],data.state[key],key);
  assert.equal(target.babyQuick.length,10);assert.equal(target.futurePreference.preserve,true);
  assert.equal(JSON.stringify(data),before);
  assert.equal(Object.keys(data.state.days).length,22);
});
