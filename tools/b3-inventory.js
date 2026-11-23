#!/usr/bin/env node
'use strict';
// Reproducible source inventory; generated HTML is included, not just the DOM.
// This records reachability evidence, never claims that a workflow was tested.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripComments, blankOut, templateSpans, handlerCalls } = require('./js-scan');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
function inventory() {
  const index = read('index.html');
  const files = ['index.html', 'tab.html', 'picker.js', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort().map(f => 'js/' + f)];
  const actions = [], exports = [];
  for (const file of files) {
    const raw = read(file);
    const spans = [], templates = [];
    let code;
    if (file.endsWith('.html')) {
      code = raw.replace(/<!--[\s\S]*?-->/g, blankOut).replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)<\/script>/g, (all, tag, js, at) => {
        const start = at + tag.length;
        spans.push([start, start + js.length]);
        templates.push(...templateSpans(js).map(([a,b]) => [start+a,start+b]));
        return tag + stripComments(js) + '</script>';
      });
    } else { code = stripComments(raw); spans.push([0,code.length]); templates.push(...templateSpans(raw)); }
    const atSpan = (a,i) => a.some(([s,e]) => i >= s && i < e);
    const record = (m,kind,target) => actions.push({file,line:code.slice(0,m.index).split('\n').length,kind,target});
    for (const m of code.matchAll(/\bdata-act="([^"]+)"/g)) record(m,'data-act',m[1]);
    for (const m of code.matchAll(/\b(on[a-z]+)=(\\?)(["'])((?:(?!\2\3)(?:[^\\]|\\[\s\S]))*)\2\3/g)) {
      const names = handlerCalls(m[4], {inJsString:atSpan(spans,m.index) && !atSpan(templates,m.index)});
      for (const name of names) record(m,m[1],name);
    }
    for (const m of code.matchAll(/window\.(NT\w+)\s*=\s*\{/g)) {
      const start=m.index+m[0].length; let i=start, depth=1;
      while (i<code.length && depth) { if(code[i]==='{')depth++; if(code[i]==='}')depth--; i++; }
      const members=[...code.slice(start,i-1).matchAll(/(?:^|[,{\s])([\w$]+)\s*:/g)].map(x=>x[1]);
      exports.push({file,namespace:m[1],members:[...new Set(members)].sort()});
    }
  }
  const ctx={window:{},document:{addEventListener(){}}}; vm.createContext(ctx);
  for (const file of ['js/actions.js','js/features.js','js/launch.js']) vm.runInContext(read(file),ctx,{filename:file});
  const features=JSON.parse(JSON.stringify(ctx.window.NTFeat.list()));
  const launch=JSON.parse(JSON.stringify(ctx.window.NTLaunch.ACTIONS));
  const plan=read('docs/NutriTrack_B3_vollstaendiger_Implementierungsplan.md');
  const matrix=[...plan.matchAll(/^\| (F\d\d) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|(?: (.*?) \|)?$/gm)].map(m=>({id:m[1],capability:m[2],target:m[3],source:m[4],acceptance:m[5],evidence:m[6]||''}));
  return {schema:1,version:(index.match(/APP_VERSION='([^']+)'/)||[])[1],features,launch,exports,actions,matrix};
}
if (require.main === module) {
  const result=inventory();
  if(process.argv.includes('--write')) fs.writeFileSync(path.join(ROOT,'docs/b3-baseline.json'),JSON.stringify(result,null,2)+'\n');
  else process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
module.exports={inventory};
