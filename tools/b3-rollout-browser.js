'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./fixtures/b3-state');
module.exports=async function rollout(browser,base){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin'});
  try{
    const data=fixture(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}));
    await ctx.route('**/*',r=>(/^(data|blob):/.test(r.request().url())||/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(r.request().url()))?r.continue():r.abort());
    await ctx.addInitScript(data=>{if(localStorage.getItem('nt_v6'))return;localStorage.setItem('nt_v6',JSON.stringify(data.state));localStorage.setItem('nt_x',JSON.stringify({fc:{},cf:data.customFoods,rc:data.recipes}));localStorage.setItem('nt_gate_skipped','1');localStorage.setItem('nt_install_dismissed','1');localStorage.setItem('nt_file_backup_day',data.state.currentDate);},data);
    const page=await ctx.newPage(),errors=[],failures=[];
    page.on('requestfailed',r=>{const u=new URL(r.url());failures.push({path:/^(data|blob):$/.test(u.protocol)?u.protocol:u.pathname,error:r.failure()?.errorText});});
    page.on('pageerror',e=>{errors.push(e.stack||e.message);console.error('B3 rollout browser error',e.stack||e.message);});
    await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    assert.equal(await page.locator('#b3Root').isVisible(),true,'ordinary existing profile starts in the new default');
    const before=await page.evaluate(()=>({days:S.days,babyLog:S.babyLog,babyQuick:S.babyQuick,recipes,launchBar:S.launchBar,dashOrder:S.dashOrder,dashHidden:S.dashHidden}));
    await page.evaluate(()=>{NTUI.prefs().futureKey={keep:true};NTUI.prefs().navSlots=['shop','pantry','more'];saveS();NTUI.go('more');});
    await page.getByRole('button',{name:'Klassische Ansicht',exact:true}).click();
    await page.waitForURL(/ui=classic/);await page.waitForFunction(()=>!NTUI.enabled()&&S.setupDone);
    await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>S.setupDone);
    assert.equal(await page.evaluate(()=>NTUI.enabled()),false,'explicit classic preference survives a plain URL and reload');
    await page.evaluate(()=>switchTab('more'));
    await page.getByRole('button',{name:'Neue Ansicht verwenden',exact:true}).click();
    await page.waitForURL(/ui=b3/);await page.waitForFunction(()=>NTUI.enabled());
    await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    assert.deepEqual(await page.evaluate(()=>S.ui.navSlots),['shop','pantry','more']);assert.equal(await page.evaluate(()=>S.ui.futureKey.keep),true);
    assert.deepEqual(await page.evaluate(()=>({days:S.days,babyLog:S.babyLog,babyQuick:S.babyQuick,recipes,launchBar:S.launchBar,dashOrder:S.dashOrder,dashHidden:S.dashHidden})),before);
    // Existing manifest shortcuts must execute exactly once under the default UI.
    const shortcut=new URL(base);shortcut.searchParams.set('action','stillen');
    await page.goto(shortcut.href,{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled()&&!!NTBaby.runningFeed());
    const running=await page.evaluate(()=>NTBaby.runningFeed().id);assert.equal(new URL(page.url()).searchParams.has('action'),false);
    await page.reload({waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    assert.equal(await page.evaluate(()=>NTBaby.runningFeed().id),running,'shortcut parameter removal prevents a second toggle');
    await page.evaluate(id=>NTBaby.stopFeed(true,id),running);
    await page.goto(base+'?ui=classic',{waitUntil:'load'});await page.waitForFunction(()=>S.setupDone);
    assert.equal(await page.evaluate(()=>NTUI.enabled()),false,'recovery URL always overrides the default');
    if(errors.length)console.error('B3 rollout request diagnostics',failures);
    assert.deepEqual(errors,[],'rollout and recovery have no uncaught browser errors');
    console.log('B3 rollout: plain URL default, persistent classic choice, re-enable, protected old data, unknown settings and one-shot manifest shortcut OK');
  }finally{await ctx.close();}
};
