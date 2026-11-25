'use strict';
// Two independent browser stores, real NT sync engines and AES-GCM, isolated
// in-memory HTTP contract. Service workers are blocked in these transport-mock
// contexts so every sync request is intercepted; offline SW coverage runs in
// the separate shell/release journeys. No production worker is contacted.
const assert=require('node:assert/strict');
module.exports=async function sync(browser,base){
  const records=new Map(),contexts=[];let offlineA=false;
  const room='b3-test-room-12345678901234567890',key='synthetic-browser-test-key-only';
  async function device(which){
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',serviceWorkers:'block'});contexts.push(ctx);
    await ctx.route('**/*',async route=>{
      const request=route.request(),u=new URL(request.url());
      if(/^\/(baby|shop|pantry|plan)\/sync$/.test(u.pathname)){
        if(which==='A'&&offlineA){await route.abort();return;}
        const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
        if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
        let store=records.get(u.pathname);if(!store){store=new Map();records.set(u.pathname,store);}
        if(request.method()==='POST'){
          for(const rec of request.postDataJSON().records){assert.deepEqual(Object.keys(rec).sort(),['ct','id','iv','rev']);store.set(rec.id,rec);}
          await route.fulfill({json:{ok:true},headers});return;
        }
        await route.fulfill({json:{ok:true,data:{records:[...store.values()],cursor:Date.now(),serverTime:Date.now()}},headers});return;
      }
      if(/^(data|blob):/.test(u.href)||/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(u.href)){await route.continue();return;}
      await route.abort();
    });
    await ctx.addInitScript(({which})=>{localStorage.setItem('nt_v6',JSON.stringify({setupDone:true,name:'Sync '+which,goal:2000,babyOn:true,baby:{name:'Demo'},babyLog:{},days:{},links:[],linksMigrated:1,bookSeedV:1,bookMealV:1,ui:{version:1,navSlots:which==='A'?['nutrition','baby','household']:['shop','pantry','more'],homeActions:which==='A'?['stillen']:['mahlzeit']}}));localStorage.setItem('nt_gate_skipped','1');localStorage.setItem('nt_install_dismissed','1');}, {which});
    const page=await ctx.newPage();page.on('dialog',d=>d.accept());await page.goto(base+'?ui=b3',{waitUntil:'load'});await page.waitForFunction(()=>NTUI.enabled());
    await page.evaluate(({room,key})=>{S.links=[{id:'local-test',name:'Synthetic test only',room,key,on:true,share:{baby:true,shop:true,pantry:true,plan:true},since:{},state:{}}];saveS();},{room,key});
    return {ctx,page};
  }
  try{
    const A=await device('A'),B=await device('B');
    const uiA=await A.page.evaluate(()=>({nav:S.ui.navSlots,actions:S.ui.homeActions})),uiB=await B.page.evaluate(()=>({nav:S.ui.navSlots,actions:S.ui.homeActions}));
    const run=await A.page.evaluate(()=>{NTBaby.startFeed('r');return NTBaby.runningFeed();});
    await A.page.evaluate(()=>NTBaby.Sync.run(true));await B.page.evaluate(()=>NTBaby.Sync.run(true));
    assert.ok(records.get('/baby/sync')?.has(run.id),'first device uploaded the encrypted timer');
    assert.equal(await B.page.evaluate(()=>{const e=NTBaby.runningFeed();return e&&e.id;}),run.id,
      'remote timer: '+await B.page.evaluate(()=>NTBaby.Sync.statusText()));
    await B.page.evaluate(id=>NTBaby.stopFeed(true,id),run.id);await B.page.evaluate(()=>NTBaby.Sync.run(true));await A.page.evaluate(()=>NTBaby.Sync.run(true));
    assert.equal(await A.page.evaluate(()=>NTBaby.runningFeed()),null,'remote stop reaches first device');
    const second=await B.page.evaluate(()=>{NTBaby.startFeed('l');return NTBaby.runningFeed();});await B.page.evaluate(()=>NTBaby.Sync.run(true));await A.page.evaluate(()=>NTBaby.Sync.run(true));
    await A.page.evaluate(id=>NTBaby.switchFeed(id),run.id);assert.equal(await A.page.evaluate(()=>NTBaby.runningFeed().id),second.id,'stale switch cannot affect another device timer');
    const stale=records.get('/baby/sync').get(second.id);
    await A.page.evaluate(id=>{NTBaby.editEntry(id);NTBaby.deleteEntry();},second.id);await A.page.evaluate(()=>NTBaby.Sync.run(true));await B.page.evaluate(()=>NTBaby.Sync.run(true));
    assert.equal(await B.page.evaluate(()=>NTBaby.runningFeed()),null);
    records.get('/baby/sync').set(second.id,stale);await B.page.evaluate(()=>NTBaby.Sync.run(true));await B.page.evaluate(()=>NTBaby.Sync.run(true));await A.page.evaluate(()=>NTBaby.Sync.run(true));
    assert.equal(await A.page.evaluate(()=>NTBaby.runningFeed()),null,'late stale record cannot resurrect a deleted timer');
    const shop=await A.page.evaluate(()=>NTShop.add('B3 Syncartikel','2 Stück'));await A.page.evaluate(()=>NTShop.Sync.run(true));await B.page.evaluate(()=>NTShop.Sync.run(true));
    assert.ok(await B.page.evaluate(id=>S.shopList.some(x=>x.id===id),shop.id));
    await B.page.evaluate(id=>NTShop.remove(id),shop.id);await B.page.evaluate(()=>NTShop.Sync.run(true));await A.page.evaluate(()=>NTShop.Sync.run(true));
    assert.equal(await A.page.evaluate(id=>S.shopList.some(x=>x.id===id),shop.id),false);
    const stock=await A.page.evaluate(()=>NTPantry.add('B3 Syncvorrat',2,100,'','',1));await A.page.evaluate(()=>NTPantry.Sync.run(true));await B.page.evaluate(()=>NTPantry.Sync.run(true));
    assert.equal(await B.page.evaluate(id=>S.pantry.find(x=>x.id===id).q,stock.id),2);
    await B.page.evaluate(id=>{NTPantry.openItem(id);document.getElementById('pantryItemQ').value='3';NTPantry.saveItem();},stock.id);await B.page.evaluate(()=>NTPantry.Sync.run(true));await A.page.evaluate(()=>NTPantry.Sync.run(true));
    assert.equal(await A.page.evaluate(id=>S.pantry.find(x=>x.id===id).q,stock.id),3);
    // Dauerartikel: beide Geräte setzen ihn im täglichen Lauf, bevor der Zettel abgeglichen ist → EIN Eintrag (feste ID)
    const auto=await A.page.evaluate(()=>{const it=NTPantry.add('B3 Dauerkaffee',1,500,'','',0);it.auto=1;it.min=3;it.rev=Date.now();saveS();return it;});
    await A.page.evaluate(()=>NTPantry.Sync.run(true));await B.page.evaluate(()=>NTPantry.Sync.run(true));
    for(const d of [A,B])await d.page.evaluate(()=>{delete S.pantryRestockDay;NTPantry.daily();});
    assert.deepEqual(await Promise.all([A,B].map(d=>d.page.evaluate(()=>S.shopList.filter(x=>x.n==='B3 Dauerkaffee').length))),[1,1],'both devices set it independently');
    for(let i=0;i<2;i++)for(const d of [A,B])await d.page.evaluate(()=>Promise.all([NTShop.Sync.run(true),NTPantry.Sync.run(true)]));
    const autoCount=()=>Promise.all([A,B].map(d=>d.page.evaluate(()=>S.shopList.filter(x=>x.n==='B3 Dauerkaffee'&&!x.d).map(x=>x.id+'|'+x.pv))));
    const both=await autoCount();
    assert.equal(both[0].length,1,'auto restock on two devices: one entry on A '+both[0]);assert.deepEqual(both[1],both[0],'same single entry on B');
    // Auf B vom Zettel genommen → A setzt ihn nicht wieder (Grabstein = gesperrt bis zum nächsten Einbuchen)
    await B.page.evaluate(()=>{const e=S.shopList.find(x=>x.n==='B3 Dauerkaffee'&&!x.d);NTShop.remove(e.id);});
    for(let i=0;i<2;i++)for(const d of [B,A])await d.page.evaluate(()=>Promise.all([NTShop.Sync.run(true),NTPantry.Sync.run(true)]));
    await A.page.evaluate(()=>{delete S.pantryRestockDay;NTPantry.daily();});await A.page.evaluate(()=>Promise.all([NTShop.Sync.run(true),NTPantry.Sync.run(true)]));await B.page.evaluate(()=>NTShop.Sync.run(true));
    assert.deepEqual(await autoCount(),[[],[]],'removed auto entry stays off the shared list');
    assert.ok(await A.page.evaluate(id=>S.pantry.find(x=>x.id===id).rsNo>0,auto.id),'block travels with the pantry item');
    await A.page.evaluate(()=>{NTPlan.pick(S.currentDate,'lunch');document.getElementById('planPickQ').value='B3 Syncnotiz';NTPlan.addNote();});await A.page.evaluate(()=>NTPlan.Sync.run(true));await B.page.evaluate(()=>NTPlan.Sync.run(true));
    assert.ok(await B.page.evaluate(()=>S.mealPlan[S.currentDate].lunch.some(x=>x.x==='B3 Syncnotiz')));
    offlineA=true;await A.ctx.setOffline(true);const pending=await A.page.evaluate(()=>NTShop.add('B3 Offlineartikel','1'));await A.page.evaluate(()=>NTShop.Sync.run(true));await B.page.evaluate(()=>NTShop.Sync.run(true));
    assert.equal(await B.page.evaluate(id=>S.shopList.some(x=>x.id===id),pending.id),false);
    offlineA=false;await A.ctx.setOffline(false);await A.page.evaluate(()=>NTShop.Sync.run(true));await B.page.evaluate(()=>NTShop.Sync.run(true));
    assert.ok(await B.page.evaluate(id=>S.shopList.some(x=>x.id===id),pending.id),'offline entry uploads after reconnect');
    assert.deepEqual(await A.page.evaluate(()=>({nav:S.ui.navSlots,actions:S.ui.homeActions})),uiA);assert.deepEqual(await B.page.evaluate(()=>({nav:S.ui.navSlots,actions:S.ui.homeActions})),uiB,'UI preferences never enter shared domain records');
    console.log('B3 sync: independent stores + real AES-GCM, remote timer stop, stale revision/tombstone, shopping, pantry, pantry auto-restock without duplicates, plan, offline reconnect and local UI preferences OK');
  }finally{for(const ctx of contexts)await ctx.close();}
};
