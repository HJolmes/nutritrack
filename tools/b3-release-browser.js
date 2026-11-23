'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./fixtures/b3-state');
const {devices}=require('playwright');
module.exports=async function release(browser,output,base,origin){
  const data=fixture(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}));
  const opts={...(process.env.B3_BROWSER==='webkit'?devices['iPhone 13']:{}),viewport:{width:320,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin'};
  async function context(){
    const ctx=await browser.newContext(opts);
    await ctx.route('**/*',r=>(/^(data|blob):/.test(r.request().url())||/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(r.request().url()))?r.continue():r.abort());
    await ctx.addInitScript(data=>{if(localStorage.getItem('nt_v6'))return;localStorage.setItem('nt_v6',JSON.stringify(data.state));localStorage.setItem('nt_x',JSON.stringify({fc:{},cf:data.customFoods,rc:data.recipes}));localStorage.setItem('nt_gate_skipped','1');localStorage.setItem('nt_file_backup_day',data.state.currentDate);localStorage.setItem('nt_install_dismissed','1');},data);
    return ctx;
  }
  const ctx=await context();
  try{
    const page=await ctx.newPage();await page.goto(base+'?ui=b3',{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    await page.waitForFunction(()=>Math.abs(document.getElementById('b3Nav').getBoundingClientRect().height-parseFloat(document.body.style.getPropertyValue('--b3-nav-height')))<2);
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:Array.from(document.querySelectorAll('#b3Nav button')).map(b=>{const r=b.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height,label:b.getAttribute('aria-label')};})}));
    assert.ok(dimensions.scroll<=dimensions.width+1,'200% text does not overflow the document');
    for(const b of dimensions.buttons){assert.ok(b.width>=44&&b.height>=44,'navigation touch target');assert.ok(b.x>=-1&&b.right<=321,'navigation stays in viewport');assert.ok(b.label);}
    for(const id of ['home','nutrition','household','history','trends','more','functions']){
      await page.evaluate(id=>NTUI.go(id),id);
      const header=await page.evaluate(()=>{const el=document.querySelector('#b3Root .b3-header'),title=document.getElementById('b3Title').getBoundingClientRect(),buttons=el.querySelectorAll('button');return {left:buttons[0].getBoundingClientRect().right,titleLeft:title.left,titleRight:title.right,right:buttons[buttons.length-1].getBoundingClientRect().left,end:buttons[buttons.length-1].getBoundingClientRect().right};});
      assert.ok(header.titleLeft>=header.left&&header.titleRight<=header.right&&header.end<=321,'large-text title keeps the menu visible in '+id);
    }
    await page.evaluate(()=>{S.babyOn=true;NTUI.go('baby');NTUIBaby.select('history');});
    await page.locator('#babyOv .mod').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
    const layout=await page.evaluate(()=>({pageBottom:document.querySelector('#babyOv .mod').getBoundingClientRect().bottom,navTop:document.getElementById('b3Nav').getBoundingClientRect().top}));
    assert.ok(layout.pageBottom<=layout.navTop+1,'feature content ends above the enlarged navigation');
    await page.locator('#babyPaneWeek [data-act="NTBabyWeek.openReport"]').click();
    await page.locator('#babyReportOv.open').waitFor();await page.evaluate(()=>closeOv('babyReportOv'));
    await page.screenshot({path:path.join(output,'b3-large-text-'+(process.env.B3_BROWSER||'chromium')+'.png'),fullPage:true});
    // Existing single-tab protection also applies while the new shell is active.
    const supported=await page.evaluate(()=>!!navigator.locks);
    if(supported){const second=await ctx.newPage();await second.goto(base+'?ui=b3',{waitUntil:'load'});await second.waitForURL(/tab\.html/);await second.close();}
    // Cross midnight, write through existing real editors, and restart with
    // the network still unavailable. A dialog-only offline test is insufficient.
    await page.evaluate(async()=>{await navigator.serviceWorker.register(new URL('sw.js',location.href).href,{scope:'./'});await navigator.serviceWorker.ready;});
    await page.reload({waitUntil:'load'});await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&NTUI.enabled());
    await page.waitForFunction(async()=>!!(await caches.match(location.href)));
    const next=await page.evaluate(()=>NTBaby.addDayKey(S.currentDate,1));
    await page.clock.setFixedTime(await page.evaluate(next=>new Date(next+'T00:05:00').getTime(),next));await page.evaluate(()=>checkDayRollover());
    assert.equal(await page.evaluate(()=>S.currentDate),next,'midnight selects the new local day');
    if(await page.evaluate(()=>NTAutoSave.fileActive())){
      const afterSixDays=await page.evaluate(()=>{
        localStorage.setItem('nt_file_backup_day',addDays(today(),-6));
        NTAutoSave.fileCheck();
        return document.getElementById('fileSaveOv').classList.contains('open');
      });
      assert.equal(afterSixDays,false,'iOS backup stays closed for six days');
      await page.evaluate(()=>localStorage.setItem('nt_file_backup_day',addDays(today(),-7)));
      await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window._b3FileSaved=data.files[0].name;}});NTAutoSave.fileCheck();});
      await page.locator('#fileSaveOv.open').waitFor();await page.keyboard.press('Escape');
      assert.equal(await page.locator('#fileSaveOv').evaluate(el=>el.classList.contains('open')),true,'Escape cannot bypass the weekly file backup');
      await page.evaluate(()=>NTUI.back());await page.goBack();
      await page.waitForFunction(()=>history.state?.overlays?.includes('fileSaveOv'));
      assert.equal(await page.locator('#fileSaveOv').evaluate(el=>el.classList.contains('open')),true,'internal Back preserves the backup dialog');
      await page.locator('#fileSaveOv [data-act="NTAutoSave.fileSave"]').click();
      await page.waitForFunction(()=>!document.getElementById('fileSaveOv').classList.contains('open'));
      assert.match(await page.evaluate(()=>window._b3FileSaved),/^nutritrack-backup[1-4]\.json$/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('nt_file_backup_day')),next);
    }
    if(origin){origin.setAvailable(false);await assert.rejects(ctx.request.get(base,{timeout:2000}));}else await ctx.setOffline(true);
    await page.evaluate(()=>NTUI.go('baby'));
    await page.getByRole('button',{name:'Erfassen: Baby-Tagebuch'}).click();await page.locator('#b3ActionBody button').filter({hasText:'Notiz'}).click();
    await page.locator('#babyNoteText').fill('Offline nach Mitternacht');await page.locator('#babyEntryOv [data-act="NTBaby.saveEntry"]').click();
    await page.waitForFunction(()=>(S.babyLog[S.currentDate]||[]).some(e=>e.text==='Offline nach Mitternacht'),{},{timeout:5000});
    assert.equal(await page.evaluate(async()=>{
      NTUI.go('nutrition');NTPicker.openPicker('breakfast','own');
      var field=document.getElementById('ownName');field.focus();
      await new Promise(resolve=>setTimeout(resolve,0));
      return document.activeElement===field;
    }),true,'deferred dialog focus must preserve an already selected input');
    await page.locator('#ownName').fill('Offline-Mahlzeit');await page.locator('#ownKcal').fill('123');await page.locator('#ownOnce').check();
    await page.locator('[data-act="NTPicker.pickerSaveOwn"]').click();
    try{
      await page.waitForFunction(()=>S.days[S.currentDate].meals.breakfast.some(e=>e.name==='Offline-Mahlzeit'),{},{timeout:5000});
    }catch(error){
      await page.screenshot({path:path.join(output,'b3-offline-meal-failure.png'),fullPage:true});
      console.error('B3 offline meal editor state',await page.evaluate(()=>({
        date:S.currentDate,meals:S.days[S.currentDate].meals,
        custom:customFoods.filter(e=>e.name==='Offline-Mahlzeit'),
        name:document.getElementById('ownName').value,kcal:document.getElementById('ownKcal').value,
        once:document.getElementById('ownOnce').checked,edit:window._editEntryMode,
        overlays:Array.from(document.querySelectorAll('.ov.open')).map(e=>e.id),
        toast:document.getElementById('toast')?.textContent
      })));
      throw error;
    }
    const persisted=await page.evaluate(()=>({day:S.currentDate,meals:S.days[S.currentDate].meals,baby:S.babyLog[S.currentDate]}));
    assert.ok(persisted.meals.breakfast.some(e=>e.name==='Offline-Mahlzeit'));assert.ok(persisted.baby.some(e=>e.text==='Offline nach Mitternacht'));
    const offline=await page.reload({waitUntil:'load'});assert.ok(offline.fromServiceWorker());await page.waitForFunction(()=>NTUI.enabled());
    assert.deepEqual(await page.evaluate(()=>({day:S.currentDate,meals:S.days[S.currentDate].meals,baby:S.babyLog[S.currentDate]})),persisted,'new-day offline writes survive an offline restart');
    if(origin)origin.setAvailable(true);else await ctx.setOffline(false);
    await page.reload({waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    assert.deepEqual(await page.evaluate(()=>({day:S.currentDate,meals:S.days[S.currentDate].meals,baby:S.babyLog[S.currentDate]})),persisted,'reconnection keeps the complete offline day');
  }finally{if(origin)origin.setAvailable(true);await ctx.close();}
  const fail=await context();
  try{
    await fail.route('**/js/ui-home.js*',r=>r.abort());
    const page=await fail.newPage();await page.goto(base+'?ui=b3',{waitUntil:'load'});await page.waitForFunction(()=>S.setupDone&&document.getElementById('mainScreen').classList.contains('active'));
    assert.equal(await page.evaluate(()=>NTUI.enabled()),false,'missing new UI asset falls back to classic');
    assert.equal(await page.locator('#b3Root').evaluate(el=>el.hidden),true);
    for(const key of ['babyQuick','launchBar','dashOrder','dashHidden'])assert.deepEqual(await page.evaluate(key=>S[key],key),data.state[key]);
  }finally{await fail.close();}
  console.log('B3 release: 200% text, measured navigation/report, single-tab, new-day Baby/nutrition offline writes + offline restart/reconnect and failed-asset recovery OK');
};
