'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./fixtures/b3-state');
module.exports=async function reminders(page){
  const data=fixture(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'})),key=data.state.currentDate;
  await page.clock.setFixedTime(new Date(key+'T08:05:00+01:00'));
  const before=await page.evaluate(data=>{
    S.babyOn=false;S.days=data.state.days;S.currentDate=data.state.currentDate;
    window._b3PermissionRequests=0;
    if('Notification' in window)Object.defineProperty(Notification,'requestPermission',{configurable:true,value:()=>{window._b3PermissionRequests++;return Promise.resolve('denied');}});
    NTUI.go('home');return JSON.stringify(S.reminders);
  },data);
  assert.equal(await page.locator('[data-priority-id^="meal-breakfast-"]').count(),0,'no breakfast hint without breakfast history');
  await page.locator('#b3Root [data-act="NTUIReminders.open"]').click();
  await page.locator('#b3MealPrefsOv .mod').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
  const save=await page.locator('#b3MealPrefsOv [data-act="NTUIReminders.save"]').boundingBox();
  const nav=await page.locator('#b3Nav').boundingBox();
  assert.ok(save.y>=0&&save.y+save.height<=nav.y,'reminder save stays accessible before scrolling');
  for(let i=0;i<4;i++)assert.equal(await page.locator('#b3MealPush'+i).isChecked(),false);
  await page.locator('#b3MealMode0').selectOption('always');await page.locator('#b3MealTime0').fill('08:00');
  await page.locator('#b3MealPrefsOv [data-act="NTUIReminders.save"]').click();
  const hint=page.locator('[data-priority-id^="meal-breakfast-"]');await hint.waitFor();
  await hint.getByRole('button',{name:'30 Min. später'}).click();assert.equal(await hint.count(),0);
  await page.clock.setFixedTime(new Date(key+'T08:36:00+01:00'));await page.evaluate(()=>NTUI.refresh());
  await hint.waitFor();await hint.getByRole('button',{name:'Heute ausblenden'}).click();assert.equal(await hint.count(),0);
  await page.evaluate(()=>{NTUIReminders.pref('breakfast').dismissedDay='';NTUIReminders.pref('breakfast').snoozeUntil=0;NTUIReminders.pref('breakfast').mode='never';NTUI.refresh();});
  assert.equal(await hint.count(),0);
  assert.equal(await page.evaluate(()=>window._b3PermissionRequests),0,'no permission prompt without explicit OS opt-in');
  assert.equal(await page.evaluate(()=>JSON.stringify(S.reminders)),before,'existing fixed timers remain byte-identical');
  // Confirmed current-day entries gain tracking time. Backfills never gain one.
  const stamped=await page.evaluate(()=>{
    function add(){NTPicker.openPicker('breakfast','own');document.getElementById('ownName').value='B3-Test';document.getElementById('ownKcal').value='123';document.getElementById('ownOnce').checked=true;NTPicker.pickerSaveOwn();return getDay().meals.breakfast.slice(-1)[0];}
    S.currentDate=NTBaby.today();const current=add();S.currentDate=NTBaby.addDayKey(NTBaby.today(),-1);const historical=add();S.currentDate=NTBaby.today();renderAll();return {current,historical};
  });
  assert.equal(typeof stamped.current.addedAt,'number');assert.equal(stamped.historical.addedAt,undefined);
  assert.equal(await hint.count(),0,'tracked breakfast suppresses even an Always hint');
  await page.evaluate(()=>{
    NTUIReminders.pref('breakfast').mode='auto';
    NTUIReminders.dismiss('breakfast','irrelevant');NTUIReminders.dismiss('breakfast','irrelevant');NTUIReminders.dismiss('breakfast','irrelevant');
  });
  assert.equal(await page.evaluate(()=>NTUIReminders.pref('breakfast').mode),'auto','rejection never silently changes manual preference');
  assert.ok((await page.locator('#b3MealPrefsBody').textContent()).includes('Diesen Hinweis künftig ausschalten?'));
  await page.evaluate(()=>closeOv('b3MealPrefsOv'));
  console.log('B3 reminders: never-breakfast history, Always/Never, snooze, dismissal, explicit permission only, original timers and real tracking timestamps OK');
};
