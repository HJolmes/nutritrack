'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const bridge=source.replace(/import\("https:\/\/esm\.sh\/@undecaf\/zbar-wasm@0\.10\.1"\)/,'loadModule()');
assert.notEqual(bridge,source,'intercept only the real external module transport');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('optional barcode decoder is published only after its actual WASM initialization',async()=>{
  let ready;const scan=()=>Promise.resolve([]),warnings=[];
  const ctx={window:{},console:{warn:(...args)=>warnings.push(args)},loadModule:()=>Promise.resolve({getInstance:()=>new Promise(resolve=>{ready=resolve;}),scanImageData:scan})};
  vm.runInNewContext(bridge,ctx);await settle();assert.equal(ctx.window.ZBarWasm,undefined,'partially initialized decoder is not exposed');
  ready({});await settle();assert.equal(ctx.window.ZBarWasm.scanImageData,scan);assert.equal(warnings.length,0);
});
test('cached optional decoder JS with an unavailable WASM stays a handled fallback',async()=>{
  const local={readBarcodes:()=>Promise.resolve([])},warnings=[];
  const ctx={window:{ZXingWasm:local},console:{warn:(...args)=>warnings.push(args)},loadModule:()=>Promise.resolve({getInstance:()=>Promise.reject(new TypeError('Synthetic offline WASM failure')),scanImageData:()=>{throw Error('must not be used');}})};
  vm.runInNewContext(bridge,ctx);await settle();assert.equal(ctx.window.ZBarWasm,undefined);assert.equal(ctx.window.ZXingWasm,local);assert.equal(warnings.length,1,'initialization failure is consumed by the existing fallback');
});
