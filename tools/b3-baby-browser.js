'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./fixtures/b3-state');
module.exports=async function baby(page){
  const data=fixture(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}));
  await page.evaluate(data=>{S.babyOn=true;S.babyLog=data.state.babyLog;S.currentDate=NTBaby.today();saveS();NTUI.go('baby');},data);
  const nav=page.getByRole('navigation',{name:'Baby-Bereiche'});assert.equal(await nav.locator('button').count(),4);
  await nav.getByRole('button',{name:'Schlaf',exact:true}).click();
  for(const label of ['Erfasst','Angenommen','Prognose'])assert.ok((await page.locator('#babySleepPlanBody').textContent()).includes(label));
  assert.equal(await page.locator('#babyNightAssumptions').evaluate(el=>el.parentElement.id),'babyPaneSleep');
  await nav.getByRole('button',{name:'Verlauf',exact:true}).click();
  await page.goBack();await page.waitForFunction(()=>NTUIBaby.view()==='sleep');
  await nav.getByRole('button',{name:'Verlauf',exact:true}).click();
  await page.locator('#babyWeekRange button[data-wr="14"]').click();
  assert.equal(await page.locator('#babyWeekRange button[data-wr="14"]').evaluate(el=>el.classList.contains('act')),true);
  await page.locator('#babyPaneWeek [data-act="NTBabyWeek.openReport"]').click();
  const report=await page.locator('#babyReportText').inputValue();assert.match(report,/Baby-Bericht/);assert.equal(report.split('Pro Tag:')[1].split('\n\n')[0].trim().split('\n').length,14);await page.evaluate(()=>closeOv('babyReportOv'));
  await nav.getByRole('button',{name:'Entwicklung',exact:true}).click();
  await page.locator('#b3BabyDevelopment button').filter({hasText:'U-Heft'}).click();
  assert.ok((await page.locator('#babyUDates').textContent()).length>0);
  await page.locator('#b3BabyDevelopment button').filter({hasText:'Fragen an'}).click();
  await page.locator('#babyPaneMw').waitFor({state:'visible'});
  await page.locator('#b3BabyDevelopment [data-act="NTBabyMed.open"]').click();
  await page.locator('#babyMedOv.open').waitFor();await page.evaluate(()=>closeOv('babyMedOv'));
  await nav.getByRole('button',{name:'Heute',exact:true}).click();
  // Real editors perform creation, edit and tombstoned deletion for all types.
  page.on('dialog',d=>d.accept());
  const labels={breast:'Stillen',bottle:'Flasche',diaper:'Windel',temp:'Temperatur',sleep:'Schlaf',note:'Notiz',solid:'Beikost',pump:'Abpumpen',med:'Medizin',growth:'Messung',appt:'Termin'};
  for(const type of ['breast','bottle','diaper','temp','sleep','note','solid','pump','med','growth','appt']){
    await page.evaluate(()=>NTUIActions.plus());
    await page.locator('#b3ActionBody button').filter({hasText:labels[type]}).click();
    const result=await page.evaluate(type=>{
      const values={babyMin:'5',babyMl:'40',babyTempC:'36.8',babySleepFrom:'09:00',babySleepTo:'09:30',babyNoteText:'Synthetische Notiz',babySolidFood:'Karotte',babySolidAmount:'1 TL',babyPumpMl:'30',babyMedName:'Demo',babyMedDose:'Test',babyGrowthG:'5500',babyGrowthCm:'58',babyGrowthHc:'38',babyApptTitle:'Demo-Termin'};
      for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;
      const key=S.currentDate,before=NTBaby.logRO(key).length;NTBaby.saveEntry();
      const list=NTBaby.logRO(key),entry=list[list.length-1];
      return {before,after:list.length,entry};
    },type);
    assert.equal(result.after,result.before+1,'create '+type);assert.equal(result.entry.t,type);
    await page.evaluate(id=>{NTBaby.editEntry(id);document.getElementById('babyEntryNote').value='Geändert';NTBaby.saveEntry();},result.entry.id);
    assert.equal(await page.evaluate(id=>NTBaby.logRO(S.currentDate).find(e=>e.id===id).note,result.entry.id),'Geändert');
    await page.evaluate(id=>{NTBaby.editEntry(id);NTBaby.deleteEntry();},result.entry.id);
    assert.equal(await page.evaluate(id=>NTBaby.logRO(S.currentDate).some(e=>e.id===id),result.entry.id),false);
    assert.ok(await page.evaluate(id=>!!S.babyTomb[id],result.entry.id),'sync tombstone '+type);
  }
  // The existing prediction route remains an uncommitted draft and rejects future time.
  await page.clock.install({time:new Date(data.state.currentDate+'T12:00:00+01:00')});
  const future=await page.evaluate(()=>{
    const count=NTBaby.logRO(S.currentDate).length;NTBaby.sleepFromPlan(Date.now()+7200000,'day');
    const draft=NTBaby.logRO(S.currentDate).length===count;
    document.getElementById('babySleepFrom').value='23:00';document.getElementById('babySleepTo').value='';NTBaby.saveEntry();
    return {draft,after:NTBaby.logRO(S.currentDate).length,count,open:document.getElementById('babyEntryOv').classList.contains('open')};
  });
  assert.equal(future.draft,true);assert.equal(future.after,future.count);assert.equal(future.open,true);await page.evaluate(()=>closeOv('babyEntryOv'));
  console.log('B3 Baby: four sections, Back, 7/14-day history, report, development, eleven create/edit/delete paths, tombstones and future-sleep guard OK');
};
