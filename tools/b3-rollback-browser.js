'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./fixtures/b3-state');
module.exports=async function rollback(browser,output,base){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',acceptDownloads:true});
  try{
    const data=fixture(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}));
    await ctx.route('**/*',r=>(/^(data|blob):/.test(r.request().url())||/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(r.request().url()))?r.continue():r.abort());
    await ctx.addInitScript(data=>{if(localStorage.getItem('nt_v6'))return;data.state.ui={version:1,navSlots:['shop','pantry','more'],homeActions:['wickeln','foto'],futureKey:{keep:true}};localStorage.setItem('nt_v6',JSON.stringify(data.state));localStorage.setItem('nt_x',JSON.stringify({fc:{},cf:data.customFoods,rc:data.recipes}));localStorage.setItem('nt_gate_skipped','1');localStorage.setItem('nt_install_dismissed','1');localStorage.setItem('nt_file_backup_day',data.state.currentDate);},data);
    const page=await ctx.newPage();await page.goto(base+'?ui=b3',{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    const before=await page.evaluate(()=>({days:S.days,babyLog:S.babyLog,babyQuick:S.babyQuick,ui:S.ui,recipes,pantry:S.pantry,shopList:S.shopList,mealPlan:S.mealPlan,links:S.links}));
    const event=page.waitForEvent('download');await page.evaluate(()=>exportData());const download=await event,file=path.join(output,'b3-rollback-source.json');await download.saveAs(file);
    const old=new URL('b3-test-rollback/index.html?ui=classic',base).href;await page.goto(old,{waitUntil:'load'});await page.waitForFunction(()=>APP_VERSION==='0.334'&&S.setupDone);
    await page.setInputFiles('#impInp',file);await page.waitForTimeout(300);
    const restored=await page.evaluate(()=>({days:S.days,babyLog:S.babyLog,babyQuick:S.babyQuick,ui:S.ui,recipes,pantry:S.pantry,shopList:S.shopList,mealPlan:S.mealPlan,links:S.links}));
    assert.deepEqual(restored,before,'old production code reads the new backup without dropping protected data or UI preferences');
    await page.goto(base+'?ui=b3',{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    assert.deepEqual(await page.evaluate(()=>S.ui.navSlots),['shop','pantry','more']);assert.equal(await page.evaluate(()=>S.ui.futureKey.keep),true);
    assert.deepEqual(await page.evaluate(()=>S.babyQuick),data.state.babyQuick);
    console.log('B3 rollback: real pinned v0.334 imports new backup and returns to B3 with logs, recipes, kitchen and unknown UI fields intact');
  }finally{await ctx.close();}
};
