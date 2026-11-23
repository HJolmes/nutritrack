'use strict';
process.env.TZ='Europe/Berlin';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('B3 fixed reminders reuse the existing validated 15-minute window without arming or mutating timers',()=>{
  const reminders=[{label:'Due',time:'12:00',active:true},{label:'Future',time:'12:10',active:true},{label:'Old',time:'11:00',active:true},{label:'Invalid',time:'bad',active:true},{label:'Inactive',time:'12:00',active:false}];
  const ctx={S:{reminders},document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},setTimeout(){throw Error('No timer should be armed by a read');}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/reminders.js'),'utf8'),ctx);
  const before=JSON.stringify(reminders),api=ctx.window.NTRemind;
  assert.deepEqual(JSON.parse(JSON.stringify(api.due(new Date('2026-11-23T12:05:00').getTime()))).map(x=>x.reminder.label),['Due']);
  assert.equal(api.due(new Date('2026-11-23T12:25:01').getTime()).length,0);
  assert.equal(JSON.stringify(reminders),before);
});
