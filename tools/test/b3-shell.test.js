'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('../fixtures/b3-state');
function app(ui){
  const s=fixture().state;if(ui)s.ui=ui;
  const ctx={S:s,window:{addEventListener(){}},document:{addEventListener(){}}};vm.createContext(ctx);
  for(const file of ['features','ui-catalog','ui-shell'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/'+file+'.js'),'utf8'),ctx);
  ctx.NTFeat=ctx.window.NTFeat;ctx.NTUICatalog=ctx.window.NTUICatalog;return ctx;
}
test('B3 preferences are additive, normalize invalid slots and leave ten Baby buttons untouched',()=>{
  const a=app({navSlots:['home','baby','baby'],futureKey:'keep'}),before=JSON.stringify(a.S.babyQuick);
  const p=a.window.NTUI.prefs();
  assert.equal(new Set(p.navSlots).size,3);assert.ok(!p.navSlots.includes('home'));assert.equal(p.futureKey,'keep');
  assert.deepEqual(JSON.parse(JSON.stringify(p.classicLayout)),{order:a.S.dashOrder,hidden:a.S.dashHidden});
  assert.equal(JSON.stringify(a.S.babyQuick),before);assert.equal(a.S.babyQuick.length,10);
  assert.equal(JSON.stringify(a.window.NTUI.prefs()),JSON.stringify(p));
});
test('B3 catalog context is based on owner, including specialized editors',()=>{
  const a=app(),c=a.window.NTUICatalog;
  for(const [id,owner] of [['babyEntryOv','baby'],['shopItemOv','shop'],['pantryPhotoOv','pantry'],['planPickOv','plan'],['bookDetailOv','book'],['pickerOv','nutrition'],['settOv','more']])assert.equal(c.owner(id,'home'),owner);
  assert.equal(c.owner('b3ActionOv','home'),'home');
});
