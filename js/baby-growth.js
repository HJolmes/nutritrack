// NutriTrack – Baby: Wachstum mit WHO-Perzentilen (Reiter im Baby-Tagebuch, v0.263).
// Klassisches Script, exportiert window.NTGrowth. Nutzt NTBaby (js/baby.js),
// die Tabellen aus js/baby-growth-data.js (window.NT_WHO_GROWTH) und die
// globalen Helfer aus index.html (S, esc).
//
// Messungen sind normale Tagebuch-Einträge {t:'growth',g,cm,hc} an ihrem
// Messtag – sie synchronisieren und sichern sich wie alles andere.
// Gewicht in Gramm (wie im U-Heft), Länge und Kopfumfang in cm.
//
// Perzentile nach WHO-Wachstumsstandards (0–5 Jahre), LMS-Methode:
//   z = ((X/M)^L − 1) / (L·S)   bzw. ln(X/M)/S für L = 0
// Kurven: X(z) = M·(1 + L·S·z)^(1/L). Die App zeigt nur an – die Beurteilung
// macht die Kinderärztin oder der Kinderarzt.
(function(){
'use strict';

var KINDS={
  w:{label:'Gewicht',unit:'kg',field:'g',scale:0.001,dec:2},
  l:{label:'Länge/Größe',unit:'cm',field:'cm',scale:1,dec:1},
  h:{label:'Kopfumfang',unit:'cm',field:'hc',scale:1,dec:1}
};
var CURVES=[{z:-1.881,p:'P3'},{z:-1.036,p:'P15'},{z:0,p:'P50'},{z:1.036,p:'P85'},{z:1.881,p:'P97'}];
var _kind='w';

function data(){return window.NT_WHO_GROWTH||null;}
function sex(){var s=S.baby&&S.baby.sex;return (s==='m'||s==='f')?s:'';}
function birthKey(){var b=(S.baby&&S.baby.birth)||'';return /^\d{4}-\d{2}-\d{2}$/.test(b)?b:'';}
function dayNum(key){var p=key.split('-');return Math.round(Date.UTC(+p[0],+p[1]-1,+p[2])/86400000);}
function ageDays(key){var b=birthKey();return b?dayNum(key)-dayNum(b):null;}

// L, M, S für Alter in Tagen – linear zwischen den Stützpunkten (`ages`).
function lms(kind,sx,days){
  var d=data();if(!d||!sx)return null;
  var arr=d.d[kind]&&d.d[kind][sx];if(!arr)return null;
  if(!(days>=0)||days>d.max)return null;
  var ag=d.ages,lo=0,hi=ag.length-1;
  while(hi-lo>1){var mid=(lo+hi)>>1;if(ag[mid]<=days)lo=mid;else hi=mid;}
  var f=(ag[hi]===ag[lo])?0:Math.max(0,Math.min(1,(days-ag[lo])/(ag[hi]-ag[lo])));
  var a=lo*3,b=hi*3;
  return [arr[a]+(arr[b]-arr[a])*f,arr[a+1]+(arr[b+1]-arr[a+1])*f,arr[a+2]+(arr[b+2]-arr[a+2])*f];
}
function zOf(kind,sx,days,x){
  var p=lms(kind,sx,days);if(!p||!(x>0))return null;
  var L=p[0],M=p[1],S2=p[2];
  return Math.abs(L)<1e-9?Math.log(x/M)/S2:(Math.pow(x/M,L)-1)/(L*S2);
}
function xOf(kind,sx,days,z){
  var p=lms(kind,sx,days);if(!p)return null;
  var L=p[0],M=p[1],S2=p[2];
  return Math.abs(L)<1e-9?M*Math.exp(S2*z):M*Math.pow(1+L*S2*z,1/L);
}
// Standardnormalverteilung (Abramowitz/Stegun 26.2.17, Fehler < 7,5e-8).
function phi(z){
  var t=1/(1+0.2316419*Math.abs(z));
  var d=0.3989422804*Math.exp(-z*z/2);
  var p=d*t*(0.31938153+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z>0?1-p:p;
}
function pctLabel(z){
  if(z===null||isNaN(z))return '';
  var p=phi(z)*100;
  if(p<1)return '< P1';
  if(p>99)return '> P99';
  return 'P'+Math.round(p);
}
function valueOf(e,kind){
  var k=KINDS[kind],v=e[k.field];
  return v>0?v*k.scale:null;
}
// Perzentile eines Messeintrags als Kurztext – für die Tagebuch-Zeitleiste.
function pctFor(e,day,kind){
  var sx=sex(),a=ageDays(day);
  var v=valueOf(e,kind);
  if(!sx||a===null||v===null)return '';
  return pctLabel(zOf(kind,sx,a,v));
}
function pctText(e){
  var hit=findDay(e.id);if(!hit)return '';
  var out=[];
  ['w','l','h'].forEach(function(k){
    var p=pctFor(e,hit,k);
    if(p)out.push((k==='w'?'Gew. ':k==='l'?'Länge ':'Kopf ')+p);
  });
  return out.join(' · ');
}
function findDay(id){
  var keys=Object.keys(S.babyLog||{});
  for(var i=0;i<keys.length;i++){
    if(NTBaby.logRO(keys[i]).some(function(e){return e.id===id;}))return keys[i];
  }
  return '';
}
function measurements(){
  var out=[];
  Object.keys(S.babyLog||{}).forEach(function(day){
    NTBaby.logRO(day).forEach(function(e){if(e.t==='growth')out.push({day:day,e:e});});
  });
  out.sort(function(a,b){return a.day<b.day?-1:a.day>b.day?1:(a.e.ts||0)-(b.e.ts||0);});
  return out;
}
function fmtD(k){var p=k.split('-');return p[2]+'.'+p[1]+'.'+p[0].slice(2);}

function setKind(k){if(KINDS[k]){_kind=k;render();}}

function render(){
  var head=document.getElementById('babyGrowthHead');
  var chart=document.getElementById('babyGrowthChart');
  var list=document.getElementById('babyGrowthList');
  if(!head||!chart||!list)return;
  document.querySelectorAll('#babyGrowthKinds [data-gk]').forEach(function(b){
    b.classList.toggle('act',b.getAttribute('data-gk')===_kind);
  });
  var sx=sex(),b=birthKey();
  var ms=measurements();
  var missing=[];
  if(!b)missing.push('Geburtsdatum');
  if(!sx)missing.push('Geschlecht');
  if(missing.length){
    head.innerHTML='Für die WHO-Perzentilen fehlt: <b>'+missing.join(' und ')+'</b> (die Kurven sind für Jungen und Mädchen verschieden). '
      +'<button type="button" class="seb" style="margin:8px 0 0;" data-act="NTFeat.openBabySettings">📝 Angaben zum Baby</button>';
  }else{
    var last=null;
    for(var i=ms.length-1;i>=0;i--){if(valueOf(ms[i].e,_kind)!==null){last=ms[i];break;}}
    head.innerHTML=last
      ?('Letzte Messung '+fmtD(last.day)+': <b>'+fmtVal(valueOf(last.e,_kind),_kind)+'</b>'
        +(pctFor(last.e,last.day,_kind)?' · <b>'+pctFor(last.e,last.day,_kind)+'</b>':'')
        +'<div style="font-size:11px;color:var(--mu);margin-top:3px;">P50 = Mitte: die Hälfte gleichaltriger Kinder liegt darunter. Wichtiger als ein einzelner Wert ist, dass die Kurve ungefähr ihrer Linie folgt.</div>')
      :'Noch keine Messung für '+KINDS[_kind].label+'. Werte aus dem Gelben Heft lassen sich mit Datum nachtragen.';
  }
  chart.innerHTML=(sx&&b)?svg(ms,sx):'';
  if(!ms.length){list.innerHTML='';return;}
  list.innerHTML=ms.slice().reverse().map(function(m){
    var e=m.e,parts=[];
    ['w','l','h'].forEach(function(k){
      var v=valueOf(e,k);if(v===null)return;
      var p=pctFor(e,m.day,k);
      parts.push(fmtVal(v,k)+(p?' ('+p+')':''));
    });
    return '<div class="fe" onclick="NTBaby.editEntry(\''+e.id+'\')">'
      +'<div class="fee">📏</div>'
      +'<div class="fei"><div class="fen">'+esc(parts.join(' · '))+'</div>'
      +'<div class="fem">'+fmtD(m.day)+(ageDays(m.day)!==null&&ageDays(m.day)>=0?' · '+ageShort(ageDays(m.day)):'')+(e.note?' · '+esc(e.note):'')+'</div></div>'
      +'<div class="fe-ic">✏️</div></div>';
  }).join('');
}
function fmtVal(v,k){return NTBaby.fmtNum(v,KINDS[k].dec)+' '+KINDS[k].unit;}
function ageShort(d){
  if(d===0)return 'bei Geburt';
  if(d<14)return d+' Tage';
  if(d<70)return Math.floor(d/7)+' Wochen';
  var m=Math.floor(d/30.4375);
  return m<24?m+' Monate':(Math.floor(m/12)+' J. '+(m%12)+' M.');
}

// ── Kurve als SVG ──
function svg(ms,sx){
  var d=data();if(!d)return '';
  var todayAge=ageDays(NTBaby.today());
  var pts=ms.map(function(m){return {a:ageDays(m.day),v:valueOf(m.e,_kind)};})
    .filter(function(p){return p.v!==null&&p.a!==null&&p.a>=0&&p.a<=d.max;});
  var maxA=Math.max(todayAge||0,pts.length?pts[pts.length-1].a:0);
  var xmax=Math.min(d.max,Math.max(183,Math.ceil((maxA+45)/30.4375)*30.4375));
  var W=320,H=220,L=34,R=30,T=10,B=24;
  var ymin=Infinity,ymax=-Infinity,steps=60,curves=CURVES.map(function(c){
    var line=[];
    for(var i=0;i<=steps;i++){
      var a=xmax*i/steps,v=xOf(_kind,sx,a,c.z);
      line.push([a,v]);
      if(v<ymin)ymin=v;if(v>ymax)ymax=v;
    }
    return {c:c,line:line};
  });
  pts.forEach(function(p){if(p.a<=xmax){if(p.v<ymin)ymin=p.v;if(p.v>ymax)ymax=p.v;}});
  var pad=(ymax-ymin)*0.05;ymin-=pad;ymax+=pad;
  function X(a){return L+(W-L-R)*a/xmax;}
  function Y(v){return T+(H-T-B)*(1-(v-ymin)/(ymax-ymin));}
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;font-family:inherit;" role="img" aria-label="Wachstumskurve '+KINDS[_kind].label+'">';
  // Monatsraster
  var mStep=xmax<=400?1:xmax<=800?3:6;
  for(var m=0;m*30.4375<=xmax;m+=mStep){
    var x=X(m*30.4375);
    s+='<line x1="'+x+'" y1="'+T+'" x2="'+x+'" y2="'+(H-B)+'" stroke="var(--br)" stroke-width="0.5"/>';
    s+='<text x="'+x+'" y="'+(H-B+12)+'" font-size="9" text-anchor="middle" fill="var(--mu)">'+m+'</text>';
  }
  s+='<text x="'+(W-R)+'" y="'+(H-2)+'" font-size="9" text-anchor="end" fill="var(--mu)">Monate</text>';
  // y-Achse
  var yr=ymax-ymin,ys=yr>40?10:yr>16?5:yr>8?2:yr>4?1:0.5;
  for(var yv=Math.ceil(ymin/ys)*ys;yv<=ymax;yv+=ys){
    var y=Y(yv);
    s+='<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="var(--br)" stroke-width="0.5"/>';
    s+='<text x="'+(L-4)+'" y="'+(y+3)+'" font-size="9" text-anchor="end" fill="var(--mu)">'+NTBaby.fmtNum(yv,1)+'</text>';
  }
  s+='<text x="2" y="'+(T+4)+'" font-size="9" fill="var(--mu)">'+KINDS[_kind].unit+'</text>';
  // Perzentilkurven
  curves.forEach(function(cv){
    var dpath=cv.line.map(function(p,i){return (i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1);}).join(' ');
    var mid=cv.c.z===0;
    s+='<path d="'+dpath+'" fill="none" stroke="var(--g3)" stroke-width="'+(mid?1.6:0.9)+'"'+(mid?'':' stroke-dasharray="3 3"')+'/>';
    var lp=cv.line[cv.line.length-1];
    s+='<text x="'+(W-R+3)+'" y="'+(Y(lp[1])+3)+'" font-size="8" fill="var(--mu)">'+cv.c.p+'</text>';
  });
  // Messpunkte
  var vis=pts.filter(function(p){return p.a<=xmax;});
  if(vis.length>1)s+='<path d="'+vis.map(function(p,i){return (i?'L':'M')+X(p.a).toFixed(1)+' '+Y(p.v).toFixed(1);}).join(' ')+'" fill="none" stroke="var(--g1)" stroke-width="1.8"/>';
  vis.forEach(function(p){s+='<circle cx="'+X(p.a).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="3.2" fill="var(--g1)"/>';});
  return s+'</svg>';
}

window.NTGrowth={render:render,setKind:setKind,pctText:pctText,
  // für Tests/Bericht: z-Wert und Perzentil-Text
  z:function(kind,sx,days,x){return zOf(kind,sx,days,x);},pctLabel:pctLabel,pctFor:pctFor};
})();
