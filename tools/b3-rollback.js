#!/usr/bin/env node
'use strict';
// Test-only immutable production snapshot. Never part of CORE_ASSETS/deployment.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const sha='88eeb9846e8646270a1c6a7c155e10b18317112e',root=path.resolve(__dirname,'..');
try{cp.execFileSync('git',['cat-file','-e',sha+'^{commit}'],{cwd:root,stdio:'pipe'});}catch(_){cp.execFileSync('git',['fetch','--no-tags','--depth=1','origin',sha],{cwd:root,stdio:'pipe'});}
const files=cp.execFileSync('git',['ls-tree','-r','--name-only',sha],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>/^(index\.html|tab\.html|sw\.js|picker\.js|manifest\.json|icon\.svg)$/.test(p)||/^(js|icons)\//.test(p));
for(const file of files){const dest=path.join(root,'b3-test-rollback',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,cp.execFileSync('git',['show',sha+':'+file],{cwd:root,maxBuffer:4*1024*1024}));}
console.log('B3 test snapshot prepared: '+sha+' ('+files.length+' runtime files)');
