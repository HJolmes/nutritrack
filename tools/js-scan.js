// Quelltext lesen ohne Parser (#257) — gemeinsam fuer tools/check.js und
// tools/smoke.js. Ohne Abhaengigkeit: check.js laeuft in der CI vor `npm ci`.
//
//   stripComments(code)        Kommentare -> Leerzeichen, Zeilen bleiben
//   templateSpans(code)        wo Template-Text steht (fuer handlerCalls)
//   handlerCalls(body, opts)   Aufrufnamen im Rumpf eines on*-Attributs
'use strict';

const blankOut = (s) => s.replace(/[^\n]/g, ' ');

// Nach diesen Woertern beginnt ein `/` einen regulaeren Ausdruck, nach jedem
// anderen Bezeichner ist es eine Division.
const REGEX_AFTER_WORD = /^(return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/;

// Ein kleiner Lexer statt eines Regex: `//` am Zeilenende ist ein Kommentar,
// `//` oder `/*` in einem String, Template oder Regex-Literal nicht
// (`'https://…'`, `accept="image/*"`, `/\/\*/`). Ein `/` ist ein Regex-Literal,
// wenn davor kein Wert steht (Bezeichner, Zahl, `)`, `]`, `}`, `x++`) — die
// uebliche Faustregel; `}` gilt als Ende eines Werts.
// Liefert die Spannen [von, bis) der Kommentare und der Template-Texte (ohne
// die `${…}`-Ausdruecke darin).
const ID_START = /[\p{L}_$]/u;
const ID_PART = /[\p{L}\p{N}_$\u200c\u200d]/u;
function lex(code) {
  const n = code.length;
  const comments = [], templates = [];
  let i = 0, prev = '', prevWord = '', depth = 0;
  const tpl = []; // je offenes `${`: Klammertiefe beim Oeffnen
  // Template-Text ab i bis zum schliessenden ` (false) oder bis `${` (true).
  const skipTemplate = () => {
    const from = i;
    while (i < n) {
      const c = code[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { templates.push([from, i]); i++; return false; }
      if (c === '$' && code[i + 1] === '{') { templates.push([from, i]); i += 2; return true; }
      i++;
    }
    templates.push([from, n]);
    return false;
  };
  const afterTemplate = (open) => {
    if (open) { tpl.push(depth); prev = '{'; } else prev = '`';
    prevWord = '';
  };
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '/' && d === '/') {
      const e = code.indexOf('\n', i), end = e < 0 ? n : e;
      comments.push([i, end]); i = end; continue;
    }
    if (c === '/' && d === '*') {
      const e = code.indexOf('*/', i + 2), end = e < 0 ? n : e + 2;
      comments.push([i, end]); i = end; continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && code[i] !== c && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1;
      i++; prev = c; prevWord = ''; continue;
    }
    if (c === '`') { i++; afterTemplate(skipTemplate()); continue; }
    if (c === '{') { depth++; i++; prev = c; prevWord = ''; continue; }
    if (c === '}') {
      i++;
      if (tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); afterTemplate(skipTemplate()); continue; }
      depth--; prev = c; prevWord = ''; continue;
    }
    // x++ / x-- schliessen einen Wert ab: danach ist `/` eine Division.
    if ((c === '+' || c === '-') && d === c) { i += 2; prev = 'a'; prevWord = ''; continue; }
    if (c === '/') {
      const valueBefore = /[a0)\]}`'"]/.test(prev) && !(prevWord && REGEX_AFTER_WORD.test(prevWord));
      if (!valueBefore) {
        let j = i + 1, cls = false, closed = false;
        while (j < n && code[j] !== '\n') {
          const ch = code[j];
          if (ch === '\\') { j += 2; continue; }
          if (ch === '[') cls = true;
          else if (ch === ']') cls = false;
          else if (ch === '/' && !cls) { closed = true; j++; break; }
          j++;
        }
        if (closed) {
          while (j < n && /[a-z]/.test(code[j])) j++;
          i = j; prev = 'a'; prevWord = ''; continue;
        }
      }
      i++; prev = c; prevWord = ''; continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < n && ID_PART.test(code[j])) j++;
      prevWord = code.slice(i, j); prev = 'a'; i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(code[j])) j++;
      prev = '0'; prevWord = ''; i = j; continue;
    }
    if (!/\s/.test(c)) { prev = c; prevWord = ''; }
    i++;
  }
  return { comments, templates };
}

// Kommentare ausblenden: Zeichen werden zu Leerzeichen, Zeilenumbrueche
// bleiben — die Zeilennummern in den Meldungen stimmen so mit der Datei
// ueberein.
function stripComments(code) {
  let out = '', last = 0;
  for (const [a, b] of lex(code).comments) { out += code.slice(last, a) + blankOut(code.slice(a, b)); last = b; }
  return out + code.slice(last);
}

// Spannen [von, bis) der Template-Texte. Ein Handler darin steht nicht in
// einem '…'-String: Dort ist `'+'` ein Literal, keine Verkettung.
function templateSpans(code) { return lex(code).templates; }

// Namen, die im Handler keine App-Funktion sind: Schluesselwoerter, `this`
// (das Element), `event` (das Ereignis) und was der Browser mitbringt.
const NOT_APP = new Set(['if', 'for', 'while', 'return', 'typeof', 'new', 'function', 'void', 'delete', 'in',
  'instanceof', 'else', 'do', 'switch', 'try', 'catch', 'throw', 'await',
  'this', 'event', 'document', 'window', 'console', 'JSON', 'Math', 'Object', 'Array', 'String',
  'Number', 'Date', 'Promise', 'location', 'history', 'navigator', 'localStorage', 'sessionStorage', 'alert',
  'confirm', 'prompt', 'setTimeout', 'clearTimeout', 'setInterval', 'parseInt', 'parseFloat',
  'encodeURIComponent', 'decodeURIComponent']);

// Ein Name zaehlt als Aufruf am Anfang oder nach einem Operator- oder
// Klammerzeichen — mit ) fuer `if(…)name()`, } fuer `{…}name()`, > fuer
// `()=>name()`, [ und , fuer Argumente.
const CALL_RE = /(?<=^|[;{}()[\]\s!=&|?:,+\-*/%<>])([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*\(/g;

// `${…}` samt verschachtelter Klammern durch 0 ersetzen.
function dropTemplateExpr(s) {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 1, j = i + 2;
      while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      out += '0'; i = j; continue;
    }
    out += s[i++];
  }
  return out;
}

// Aufrufnamen im Rumpf eines on*-Attributs, z.B. `closeOv('x');openPicker(null)`
// -> ['closeOv', 'openPicker']. Text in String-Literalen zaehlt nicht
// (`showToast('Bitte warten (x)')` ruft kein `warten`).
//   inJsString: Der Rumpf steht in einem JS-String (Quelltext, nicht DOM). Dann
//     sind `\'` die Anfuehrungszeichen des Handlers und `'+id+'` eine
//     Verkettung des umgebenden Strings: geschlossen wird sie zu 0, eine offene
//     (bis zum Ende, etwa bei `p.replace(/'/g,"\\'")`) wird abgeschnitten —
//     dahinter wird nichts geprueft. Ein zur Laufzeit zusammengesetzter Name
//     ('+fn+'(…)) bleibt so ungeprueft; ihn sieht nur der Rauchtest im DOM.
function handlerCalls(body, { inJsString = false } = {}) {
  let s = dropTemplateExpr(body);
  if (inJsString) {
    s = s.replace(/(?<!\\)(['"])\s*\+[\s\S]*?\+\s*\1/g, '0')
      .replace(/(?<!\\)['"]\s*\+[\s\S]*$/, '')
      .replace(/\\(['"\\])/g, '$1');
  }
  // String-Literale leeren (nach dem Entschaerfen der Verkettung).
  s = s.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
  const names = [];
  for (const c of s.matchAll(CALL_RE)) {
    if (!NOT_APP.has(c[1].split('.')[0])) names.push(c[1]);
  }
  return names;
}

module.exports = { blankOut, stripComments, templateSpans, handlerCalls, NOT_APP };
