'use strict';
// Visual structure guard for B3 at real mobile widths. Uses synthetic data only.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function bloomLayout(page,output,width){
  const old=await page.evaluate(()=>({
    actions:Array.isArray(S.ui?.homeActions)?S.ui.homeActions.slice():null,
    babyOn:S.babyOn
  }));
  try{
    await page.evaluate(()=>{
      S.babyOn=true;
      NTUI.prefs().homeActions=['stillen','wickeln','schlaf','mahlzeit','einkauf','plan'];
      NTUI.go('home');
    });
    await page.locator('#b3Root .b3-quick button').first().waitFor();
    const home=await page.evaluate(()=>{
      const root=document.getElementById('b3Root');
      const frame=root.getBoundingClientRect();
      const pieces=[...root.querySelectorAll('.b3-header,.b3-date,.b3-card,.b3-quick button')];
      const outside=pieces.filter(el=>{
        const r=el.getBoundingClientRect();
        return r.width&&r.height&&(r.left<frame.left-2||r.right>frame.right+2);
      }).map(el=>el.className||el.tagName);
      const nav=document.getElementById('b3Nav').getBoundingClientRect();
      return {
        viewport:innerWidth,frame:frame.width,rootScroll:root.scrollWidth,client:root.clientWidth,
        outside,nav:{left:nav.left,right:nav.right},
        quick:root.querySelectorAll('.b3-quick button').length,
        icon:root.querySelectorAll('.b3-quick-icon').length,
        important:root.querySelectorAll('[data-priority-id]').length,
        bloom:getComputedStyle(root).getPropertyValue('--b3-bloom').trim()
      };
    });
    assert.equal(home.quick,6,'six configurable quick actions');
    assert.equal(home.icon,6,'every quick action has a separate icon slot');
    assert.ok(home.important<=1,'at most one priority card is displayed');
    assert.equal(home.bloom,'#e96e3c','B3 retains the Bloom coral palette');
    assert.ok(home.frame<=width+1&&home.rootScroll<=home.client+2,'home has no horizontal overflow at '+width);
    assert.deepEqual(home.outside,[],'home cards remain inside the mobile frame');
    assert.ok(home.nav.left>=-1&&home.nav.right<=width+1,'bottom navigation remains within mobile viewport');
    await page.screenshot({path:path.join(output,'b3-bloom-home-'+width+'.png'),fullPage:true,animations:'disabled',style:'#toast{visibility:hidden}'});
    for(const id of ['household','more','nutrition']){
      await page.evaluate(id=>NTUI.go(id),id);
      const x=await page.evaluate(()=>{
        const el=document.getElementById('b3Root');
        return {scroll:el.scrollWidth,client:el.clientWidth,nav:document.getElementById('b3Nav').getBoundingClientRect().right};
      });
      assert.ok(x.scroll<=x.client+2,id+' must not cause horizontal scrolling at '+width+'px');
      assert.ok(x.nav<=width+1,id+' navigation must fit the screen');
      if(id==='nutrition'){
        const gap=await page.locator('#mainScreen .sum').evaluate(el=>el.getBoundingClientRect().top-document.getElementById('b3Root').getBoundingClientRect().bottom);
        assert.ok(gap>=0&&gap<32,'nutrition tools and daily totals form one continuous screen');
      }
      if(id!=='more')await page.screenshot({path:path.join(output,'b3-bloom-'+id+'-'+width+'.png'),fullPage:true,animations:'disabled',style:'#toast{visibility:hidden}'});
    }
    await page.evaluate(()=>NTUI.go('baby'));
    await page.locator('#b3BabyTabs button').first().waitFor();
    const tabs=await page.evaluate(()=>{
      const el=document.getElementById('b3BabyTabs'),frame=el.getBoundingClientRect();
      return [...el.querySelectorAll('button')].map(b=>{
        const r=b.getBoundingClientRect();return {l:r.left,r:r.right,h:r.height,frameL:frame.left,frameR:frame.right};
      });
    });
    assert.equal(tabs.length,4,'all four Baby sections stay visible');
    for(const tab of tabs){
      assert.ok(tab.l>=tab.frameL-2&&tab.r<=tab.frameR+2,'Baby tab fits at '+width);
      assert.ok(tab.h>=44,'Baby tab has a 44px touch target');
    }
    const diary=await page.locator('#babyOv > .mod').boundingBox();
    const header=await page.locator('#b3Header').boundingBox();
    assert.ok(Math.abs(diary.y-header.y-header.height)<=2,'Baby opens directly below the shared header');
    await page.screenshot({path:path.join(output,'b3-bloom-baby-'+width+'.png'),animations:'disabled',style:'#toast{visibility:hidden}'});
    // Regression from a real Android screenshot: six settings buttons used to
    // shrink until even "Erinnerungen" wrapped one character per line.
    await page.evaluate(()=>{NTUI.go('home');openSettings('ziele');});
    await page.locator('#settOv.open #settTabs').waitFor();
    async function assertStrip(selector,count,label){
      const metrics=await page.locator(selector).evaluate(el=>{
        const frame=el.getBoundingClientRect();
        return {
          client:el.clientWidth,scroll:el.scrollWidth,left:el.scrollLeft,
          width:frame.width,buttons:[...el.querySelectorAll('button')].map(b=>{
            const r=b.getBoundingClientRect(),style=getComputedStyle(b);
            return {width:r.width,scroll:b.scrollWidth,height:r.height,wrap:style.whiteSpace,shrink:style.flexShrink};
          })
        };
      });
      assert.equal(metrics.buttons.length,count,label+' button count');
      assert.ok(metrics.width<=width+1,label+' stays inside mobile viewport');
      assert.ok(metrics.scroll>metrics.client+20,label+' scrolls horizontally at '+width+'px');
      for(const b of metrics.buttons){
        assert.equal(b.wrap,'nowrap',label+' labels stay on one line');
        assert.equal(b.shrink,'0',label+' buttons never shrink');
        assert.ok(b.width>=b.scroll-2,label+' labels are not clipped');
        assert.ok(b.height>=44,label+' touch target is at least 44px high');
      }
      return metrics;
    }
    await assertStrip('#settTabs',6,'Settings tabs');
    await page.locator('#stab-backup').click();
    const selected=await page.locator('#settTabs').evaluate(el=>{
      const box=el.getBoundingClientRect(),tab=el.querySelector('#stab-backup').getBoundingClientRect();
      return {left:el.scrollLeft,visible:tab.left>=box.left-2&&tab.right<=box.right+2,pressed:el.querySelector('#stab-backup').getAttribute('aria-pressed')};
    });
    assert.ok(selected.left>0,'Backup tab can be reached by horizontal scrolling');
    assert.ok(selected.visible,'selected settings tab is scrolled into view');
    assert.equal(selected.pressed,'true','active tab is marked accessibly');
    await page.screenshot({path:path.join(output,'b3-mobile-settings-'+width+'.png'),fullPage:true});
    await page.evaluate(()=>{document.documentElement.style.fontSize='150%';});
    await assertStrip('#settTabs',6,'Settings tabs with larger text');
    await page.evaluate(()=>{document.documentElement.style.removeProperty('font-size');closeOv('settOv');NTBaby.openEntry('bottle');});
    await page.locator('#babyEntryOv.open #babyTypeTabs').waitFor();
    await assertStrip('#babyTypeTabs',9,'Baby entry tabs');
    await page.evaluate(()=>{closeOv('babyEntryOv');NTPicker.openPicker('breakfast','chat');});
    await page.locator('#pickerOv.open .picker-tabs.nt-tab-strip').waitFor();
    const picker=page.locator('#pickerOv .picker-tabs');
    const grid=await picker.evaluate(el=>({
      width:el.clientWidth,scroll:el.scrollWidth,
      buttons:[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)
    }));
    assert.equal(grid.buttons.length,7);
    assert.ok(grid.scroll<=grid.width+1,'all seven capture options fit without sideways scrolling');
    assert.ok(grid.buttons.every(height=>height>=44),'capture options retain touch targets');
    const frame=await page.locator('#pickerOv').boundingBox(),bottomNav=await page.locator('#b3Nav').boundingBox();
    assert.ok(frame.y>=header.y+header.height-1&&frame.y+frame.height<=bottomNav.y+1,'picker leaves both bars visible');
    await page.evaluate(()=>closeOv('pickerOv'));
    console.log('B3 Bloom '+width+'px: homepage, card widths, four Baby tabs, navigation and responsive sections OK');
  }finally{
    await page.evaluate(previous=>{
      document.documentElement.style.removeProperty('font-size');
      S.babyOn=previous.babyOn;
      if(previous.actions)NTUI.prefs().homeActions=previous.actions;
      else delete NTUI.prefs().homeActions;
      NTUI.go('home');
    },old);
  }
};
