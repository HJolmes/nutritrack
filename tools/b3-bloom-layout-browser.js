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
    await page.screenshot({path:path.join(output,'b3-bloom-home-'+width+'.png'),fullPage:true});
    for(const id of ['household','more','nutrition']){
      await page.evaluate(id=>NTUI.go(id),id);
      const x=await page.evaluate(()=>{
        const el=document.getElementById('b3Root');
        return {scroll:el.scrollWidth,client:el.clientWidth,nav:document.getElementById('b3Nav').getBoundingClientRect().right};
      });
      assert.ok(x.scroll<=x.client+2,id+' must not cause horizontal scrolling at '+width+'px');
      assert.ok(x.nav<=width+1,id+' navigation must fit the screen');
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
    await page.screenshot({path:path.join(output,'b3-bloom-baby-'+width+'.png'),fullPage:true});
    console.log('B3 Bloom '+width+'px: homepage, card widths, four Baby tabs, navigation and responsive sections OK');
  }finally{
    await page.evaluate(previous=>{
      S.babyOn=previous.babyOn;
      if(previous.actions)NTUI.prefs().homeActions=previous.actions;
      else delete NTUI.prefs().homeActions;
      NTUI.go('home');
    },old);
  }
};
