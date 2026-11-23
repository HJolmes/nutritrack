#!/usr/bin/env node
'use strict';
// Classic baseline, restore round-trip and mobile reference images. Local-only
// synthetic data. These images are evidence, not a claim of visual approval.
const {chromium,webkit,devices}=require('playwright');
const engine=process.env.B3_BROWSER==='webkit'?webkit:chromium;
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('./fixtures/b3-state');
let BASE=process.env.SMOKE_URL||'http://127.0.0.1:8099/index.html';
const output=path.resolve(__dirname,'../.b3-artifacts');
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  let origin=null;
  if(process.env.B3_BROWSER==='webkit'){
    // WebKit's offline emulation rejects even literal SW responses (#42775).
    // Cut the actual local origin instead, with a direct-request negative
    // control. The production worker and its cache stay completely unchanged.
    const http=require('node:http'),upstream=new URL(BASE);let available=true;
    const server=http.createServer((req,res)=>{
      if(!available){req.socket.destroy();return;}
      const target=http.request(new URL(req.url,upstream.origin),{method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
      target.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(target);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    BASE='http://127.0.0.1:'+server.address().port+upstream.pathname+upstream.search;
    origin={setAvailable(value){available=value;},close(){server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
  }
  const browser=await engine.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  try {
    for(const width of [320,390,430]) {
      const context=await browser.newContext({...(process.env.B3_BROWSER==='webkit'?devices['iPhone 13']:{}),viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',acceptDownloads:true});
      await context.route('**/*',route=>/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(route.request().url())?route.continue():route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}),data=fixture(day);
      await page.addInitScript(({data,day})=>{
        if(localStorage.getItem('nt_v6'))return;
        localStorage.setItem('nt_v6',JSON.stringify(data.state));
        localStorage.setItem('nt_x',JSON.stringify({fc:data.foodCache,cf:data.customFoods,rc:data.recipes}));
        localStorage.setItem('nt_bc',JSON.stringify(data.barcodeCache));
        localStorage.setItem('nt_gate_skipped','1');localStorage.setItem('nt_file_backup_day',day);
      },{data,day});
      await page.goto(BASE+'?ui=classic',{waitUntil:'load'});await page.waitForFunction(()=>typeof S!=='undefined'&&S.setupDone);
      await page.evaluate(()=>{
        localStorage.setItem('nt_last_version',APP_VERSION);
        document.querySelectorAll('.ov.open').forEach(el=>closeOv(el.id));
        switchTab('main');
      });
      await page.screenshot({path:path.join(output,'classic-home-'+width+'.png'),fullPage:true});
      const before=await page.evaluate(()=>({babyQuick:S.babyQuick,launchBar:S.launchBar,dashOrder:S.dashOrder,dashHidden:S.dashHidden,babyLog:S.babyLog,days:S.days,recipes,shopList:S.shopList,pantry:S.pantry,mealPlan:S.mealPlan,links:S.links}));
      // Exercise real exportData -> downloaded backup -> importData input.
      const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>exportData());
      const download=await downloadEvent,backupPath=path.join(output,'synthetic-backup-'+width+'.json');await download.saveAs(backupPath);
      const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
      assert.deepEqual(backup.state.babyQuick,data.state.babyQuick);
      assert.ok(!Object.hasOwn(backup.state,'apiKey'));
      await page.setInputFiles('#impInp',backupPath);
      await page.waitForFunction(()=>document.getElementById('impInp').files.length===1);
      await page.waitForTimeout(400);
      const after=await page.evaluate(()=>({babyQuick:S.babyQuick,launchBar:S.launchBar,dashOrder:S.dashOrder,dashHidden:S.dashHidden,babyLog:S.babyLog,days:S.days,recipes,shopList:S.shopList,pantry:S.pantry,mealPlan:S.mealPlan,links:S.links}));
      assert.deepEqual(after,before,'real backup/restore must preserve all protected fixture fields');
      await page.evaluate(()=>{NTBaby.openDiary();});
      await page.screenshot({path:path.join(output,'classic-baby-'+width+'.png'),fullPage:true});
      for(const type of Object.keys(data.state.babyLog['2026-11-22'].reduce((a,e)=>(a[e.t]=1,a),{}))) {
        await page.evaluate(type=>NTBaby.openEntry(type),type);
        assert.equal(await page.locator('#babyEntryOv').evaluate(el=>el.classList.contains('open')),true,type);
        await page.evaluate(()=>closeOv('babyEntryOv'));
      }
      await page.reload({waitUntil:'load'});
      assert.deepEqual(await page.evaluate(()=>S.babyQuick),before.babyQuick,'reload retains all ten custom buttons');
      assert.deepEqual(errors,[],'no uncaught browser errors');
      await context.close();console.log('B3 classic '+width+'px: eleven editors, export/import, reload, screenshots OK');
      if(fs.existsSync(path.resolve(__dirname,'../js/ui-shell.js')))await require('./b3-shell-browser')(browser,width,output,BASE,origin);
    }
    if(fs.existsSync(path.resolve(__dirname,'b3-release-browser.js')))await require('./b3-release-browser')(browser,output,BASE,origin);
    if(fs.existsSync(path.resolve(__dirname,'b3-sync-browser.js')))await require('./b3-sync-browser')(browser,BASE);
    if(fs.existsSync(path.resolve(__dirname,'../b3-test-rollback/index.html')))await require('./b3-rollback-browser')(browser,output,BASE);
  } finally {await browser.close();if(origin)await origin.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
