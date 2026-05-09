// scripts/check-globals-v2.js
// QA Round 2 v2: 更精確的跨檔契約檢查
//
// 關鍵理解(v1 誤解處)
// ------------------------------------------------------------
// 1. `let X / const X` 在 index.html 的 <script> 區塊頂層宣告
//    → 這些變數位於「全域 lexical scope」(被 mode 動態 script 共享)
//    → 但**不掛 window**:`window.X === undefined`
//
// 2. mode 檔案以 (function () { ... })() IIFE 包裹,動態 <script> 載入。
//    → IIFE 內可以「裸名」讀到 index.html 頂層的 let/const/var/function declarations
//      (因為這些都在 global lexical scope 中,IIFE 透過 scope chain 取得)
//    → IIFE 內讀 `window.X` 時,**只有 var / function declaration / 顯式 window.X = ...
//      會掛上去**;`let X / const X` 永遠不會自動掛 window
//
// 3. 所以 mode 應該:
//    (a) 對 index.html 頂層 const(Storage/RNG/Player/...)→ 裸名讀
//    (b) 對 index.html 頂層 let(QUESTIONS)→ 裸名讀
//    (c) 對 mode 之間互相讀(window.Mode1..5)→ 用 window.X(因為各 mode IIFE 內裸名讀
//        其他 mode 名字會 ReferenceError,IIFE 之間 lexical 隔離)
//    (d) 不可用 window.QUESTIONS / window.Storage / window.Player / window.PlayEngine
//        除非 index.html 做了 window.X = X 的同步賦值
//
// 4. 這次 P0 bug 就是 (d) 違反:mode3 / mode4 寫 `window.QUESTIONS`,
//    但 index.html 只 `let QUESTIONS = []`,結果 window.QUESTIONS 永遠 undefined。
//    QA 已修補(index.html 加 `window.QUESTIONS = QUESTIONS`),
//    但這是脆弱契約,值得標記。
//
// 用法:node scripts/check-globals-v2.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const INDEX = path.join(SRC, 'index.html');
const MODE_NAMES = ['mode1', 'mode2', 'mode3', 'mode4', 'mode5'];

function readFile(p) { return fs.readFileSync(p, 'utf8'); }

// 取得 index.html 中 inline <script>(沒 src 的)裡的所有 JS
function extractInlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
}
function extractStyles(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
}

// 找頂層宣告(注意:在 index.html 的 IIFE  `(async function() { ... })()` 內的也算 *局部* — 不是頂層)
// 這裡用 brace depth 計算,只在 depth==0 時算頂層
function findTopLevelDecls(text) {
  const decls = { let: [], const: [], var: [], function: [], windowAssign: [] };
  let depth = 0, parenDepth = 0;
  let inBlockComment = false, inTemplate = false, templateBraceStack = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let s = ''; // sanitized line(去掉註解、字串、template literal 內容)
    let j = 0;
    while (j < line.length) {
      const ch = line[j], next = line[j + 1];
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; j += 2; continue; }
        j++; continue;
      }
      if (inTemplate) {
        // 在 template 內遇到 `${` 才算進入 expression(可能含 brace)
        if (ch === '`') { inTemplate = false; s += '`'; j++; continue; }
        if (ch === '$' && next === '{') { inTemplate = false; templateBraceStack.push('expr'); s += '${'; depth++; j += 2; continue; }
        j++; continue;
      }
      if (ch === '/' && next === '*') { inBlockComment = true; j += 2; continue; }
      if (ch === '/' && next === '/') break;
      if (ch === '`') { inTemplate = true; s += '`'; j++; continue; }
      if (ch === '"' || ch === "'") {
        const q = ch; s += q; j++;
        while (j < line.length && line[j] !== q) {
          if (line[j] === '\\') j += 2;
          else j++;
        }
        if (j < line.length) { s += q; j++; }
        continue;
      }
      s += ch;
      j++;
    }

    if (depth === 0 && parenDepth === 0) {
      const trimmed = s.replace(/^\s+/, '');
      let m;
      if ((m = trimmed.match(/^let\s+([A-Za-z_$][\w$]*)/))) decls.let.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^const\s+([A-Za-z_$][\w$]*)/))) decls.const.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^var\s+([A-Za-z_$][\w$]*)/))) decls.var.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) decls.function.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^window\.([A-Za-z_$][\w$]*)\s*=/))) decls.windowAssign.push({ name: m[1], line: i + 1 });
    }

    for (const c of s) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth = Math.max(0, depth - 1);
        if (templateBraceStack.length && depth === templateBraceStack.length - 1) {
          templateBraceStack.pop();
          inTemplate = true;
        }
      } else if (c === '(') parenDepth++;
      else if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
    }
  }
  return decls;
}

// 抓 index.html 中 window.X = ... 的所有賦值(無論深度)— 因為 sync to window 通常在 IIFE / loadQuestions 內
function findAllWindowAssigns(text) {
  const set = new Set();
  [...text.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)].forEach(m => set.add(m[1]));
  return set;
}

// 找 mode 對外部的依賴:window.X 讀取、裸名 X 讀取
function analyzeModeDeps(text, knownGlobals) {
  const windowReads = new Set();
  const bareReads = new Map(); // name -> first line
  const objectMemberCalls = new Map(); // 例:Storage.get → 'Storage.get'
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 1) window.X 讀取(只看右側讀,不在等號左邊)
    const wm = [...line.matchAll(/(?<![A-Za-z0-9_$])window\.([A-Za-z_$][\w$]*)/g)];
    for (const m of wm) {
      // 是賦值嗎?(window.X = ...)
      const after = line.slice(m.index + m[0].length);
      if (/^\s*=/.test(after) && !/^\s*==/.test(after)) {
        // 這是寫,跳過
      } else {
        windowReads.add(m[1]);
      }
    }
    // 2) 裸名讀:對白名單(已知全域)做精確匹配
    for (const k of knownGlobals) {
      const re = new RegExp('\\b' + k + '\\b', 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        const idx = m.index;
        const before = line.slice(0, idx);
        // 是 window.X 嗎?
        if (/window\.\s*$/.test(before)) continue;
        // 是 .X 嗎?(物件成員)
        if (/\.\s*$/.test(before)) continue;
        // 在字串內?(粗略:看 idx 前的引號數量)— 排除單行內的字串
        const dq = (before.match(/(?<!\\)"/g) || []).length;
        const sq = (before.match(/(?<!\\)'/g) || []).length;
        const bq = (before.match(/`/g) || []).length;
        if (dq % 2 === 1 || sq % 2 === 1 || bq % 2 === 1) continue;
        // 在註解內?
        if (/\/\//.test(before)) continue;
        if (!bareReads.has(k)) bareReads.set(k, i + 1);

        // 看是不是緊接著「.method」的物件呼叫
        const after = line.slice(idx + k.length);
        const mm = after.match(/^\.([A-Za-z_$][\w$]*)/);
        if (mm) {
          const key = `${k}.${mm[1]}`;
          if (!objectMemberCalls.has(key)) objectMemberCalls.set(key, i + 1);
        }
      }
    }
  }
  return { windowReads, bareReads, objectMemberCalls };
}

// 找 mode 用到的 DOM ID / className / CSS var / localStorage key
function analyzeModeDOM(text) {
  const domIds = new Set();
  const producedIds = new Set();
  const queriedClasses = new Set();
  const cssVars = new Set();
  const lsKeys = new Set();
  const rawLs = []; // 直接呼叫 localStorage.* 的位置與 key

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    [...line.matchAll(/document\.getElementById\(\s*(['"])([^'"]+)\1/g)].forEach(m => domIds.add(m[2]));
    [...line.matchAll(/document\.querySelector(?:All)?\(\s*(['"])(#[^'"]+)\1/g)].forEach(m => {
      const sel = m[2];
      const idMatch = sel.match(/^#([A-Za-z][\w-]*)/);
      if (idMatch) domIds.add(idMatch[1]);
    });
    // 偵測 mode 自己用 innerHTML 建立的 id="xxx"
    [...line.matchAll(/\bid\s*=\s*(['"])([^'"\${]+?)\1/g)].forEach(m => producedIds.add(m[2]));

    // className 字面量(CSS class 用法)
    [...line.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*(['"])([\w-]+)\1/g)].forEach(m => queriedClasses.add(m[2]));
    [...line.matchAll(/className\s*=\s*(['"`])([^'"`]+)\1/g)].forEach(m => {
      m[2].split(/\s+/).forEach(c => { if (c && !/[\$\{\}]/.test(c)) queriedClasses.add(c); });
    });
    [...line.matchAll(/\bclass\s*=\s*(['"`])([^'"`]+)\1/g)].forEach(m => {
      m[2].split(/\s+/).forEach(c => { if (c && !/[\$\{\}]/.test(c)) queriedClasses.add(c); });
    });
    // querySelector 中的 .className
    [...line.matchAll(/querySelector(?:All)?\(\s*(['"])([^'"]+)\1/g)].forEach(m => {
      [...m[2].matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(mm => queriedClasses.add(mm[1]));
    });

    // var(--xxx)
    [...line.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].forEach(m => cssVars.add(m[1]));

    // localStorage key
    [...line.matchAll(/\blocalStorage\.(getItem|setItem|removeItem)\(\s*(['"]([^'"]+)['"])?/g)].forEach(m => {
      rawLs.push({ line: i + 1, op: m[1], key: m[3] || '(dynamic)' });
      if (m[3]) lsKeys.add(m[3]);
    });
    [...line.matchAll(/Storage\.(?:set|get|del)\(\s*(?:Storage\.([A-Z_]+)|['"]([^'"]+)['"])/g)].forEach(m => {
      if (m[2]) lsKeys.add(m[2]);
    });
  }
  return { domIds, producedIds, queriedClasses, cssVars, lsKeys, rawLs };
}

// 找 index.html 中所有 id="xxx" 與 CSS class 規則
function indexHtmlInventory(html) {
  const idsInHTML = new Set();
  [...html.matchAll(/\bid\s*=\s*(['"])([^'"\${]+?)\1/g)].forEach(m => idsInHTML.add(m[2]));
  const styleText = extractStyles(html);
  const classNamesInCSS = new Set();
  // 抓 CSS 中的 selector .xxx(避免抓到 var(--xxx))
  [...styleText.matchAll(/(?:^|[\s,>+~{])\.([A-Za-z_][\w-]*)/g)].forEach(m => classNamesInCSS.add(m[1]));
  const cssVars = new Set();
  [...styleText.matchAll(/(--[\w-]+)\s*:/g)].forEach(m => cssVars.add(m[1]));
  return { idsInHTML, classNamesInCSS, cssVars };
}

// =====================================================================
function main() {
  const indexHTML = readFile(INDEX);
  const indexScript = extractInlineScripts(indexHTML);
  const decls = findTopLevelDecls(indexScript);
  const allWindowAssigns = findAllWindowAssigns(indexScript);
  const inv = indexHtmlInventory(indexHTML);

  const allLetConst = new Set([...decls.let.map(d => d.name), ...decls.const.map(d => d.name)]);
  const allVarFunc = new Set([...decls.var.map(d => d.name), ...decls.function.map(d => d.name)]);
  const onWindow = new Set([...allVarFunc, ...allWindowAssigns]); // 真正會掛在 window 上的全部
  const onGlobalLexical = new Set([...allLetConst, ...allVarFunc]); // 全域 lexical scope 可裸名讀的

  console.log('# Cross-File Contract Audit (QA Round 2 — v2)');
  console.log();
  console.log('## index.html top-level inventory');
  console.log('| 類別 | 名字 | 是否掛 window |');
  console.log('|------|------|---------------|');
  for (const d of [...decls.const, ...decls.let].sort((a, b) => a.name.localeCompare(b.name))) {
    const inWindow = onWindow.has(d.name);
    console.log(`| const/let | ${d.name} (line ${d.line}) | ${inWindow ? '是(額外賦值)' : '**否(let/const)**'} |`);
  }
  for (const d of [...decls.var, ...decls.function].sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`| var/function | ${d.name} (line ${d.line}) | 是(自動) |`);
  }
  for (const n of [...allWindowAssigns].sort()) {
    console.log(`| window.X = | ${n} | 是(顯式賦值) |`);
  }
  console.log();

  // ============== 載入所有 mode ==============
  const modeData = MODE_NAMES.map(name => {
    const f = path.join(SRC, 'modes', `${name}.js`);
    if (!fs.existsSync(f)) return null;
    const text = fs.readFileSync(f, 'utf8');
    const knownGlobals = new Set([
      ...onGlobalLexical,
      'gsap', 'confetti', 'Mode1', 'Mode2', 'Mode3', 'Mode4', 'Mode5'
    ]);
    return {
      name, text,
      deps: analyzeModeDeps(text, knownGlobals),
      dom: analyzeModeDOM(text),
    };
  }).filter(Boolean);

  // ============== A. window.X 契約檢查 ==============
  console.log('## A. JS 變數契約 — `window.X` 讀取破洞');
  console.log();
  let p0 = [], p1 = [], p2 = [];
  for (const m of modeData) {
    for (const x of [...m.deps.windowReads]) {
      // mode N 互相讀:window.ModeN(每個 mode 都 window.ModeN = ModeN)→ OK
      if (/^Mode[1-5]$/.test(x)) continue;
      // CDN
      if (x === 'gsap' || x === 'confetti') continue;
      // 真的有掛 window?
      if (onWindow.has(x)) continue; // OK
      // let / const 卻被 window.X 讀 → P0
      if (allLetConst.has(x)) {
        p0.push({ mode: m.name, sym: x, reason: `index.html 用 let/const 宣告(無 window.${x} = ... 顯式同步),mode 讀 window.${x} 為 undefined`,
          mitigation: `index.html 加 \`window.${x} = ${x};\` 或 mode 改裸名讀 ${x}` });
      } else {
        p1.push({ mode: m.name, sym: x, reason: `index.html 完全沒宣告 ${x}`,
          mitigation: `確認此符號是否屬於 CDN / 預期不存在(則加 fallback)` });
      }
    }
  }
  if (p0.length === 0 && p1.length === 0) {
    console.log('  (none)');
  }
  for (const v of p0) console.log(`- **P0** [${v.mode}] \`window.${v.sym}\` → ${v.reason}\n  - 修法:${v.mitigation}`);
  for (const v of p1) console.log(`- **P1** [${v.mode}] \`window.${v.sym}\` → ${v.reason}\n  - 修法:${v.mitigation}`);
  console.log();

  // ============== B. 函數呼叫 / 物件方法契約 ==============
  console.log('## B. 函數 / 物件方法呼叫契約');
  console.log();
  // 從 index.html 收集已知的「物件.方法」(掃 const/let 的物件字面量)
  // 這裡用簡單啟發式:對每個 const/let,若值為 `{` 開頭,從整個 indexScript 抓 「該名.方法名」
  const knownMembers = new Map(); // 'Storage' → Set('get', 'set', 'del', K_PROGRESS, ...)
  for (const d of [...decls.const, ...decls.let]) {
    knownMembers.set(d.name, new Set());
  }
  // 整段腳本掃
  for (const objName of knownMembers.keys()) {
    const re = new RegExp('\\b' + objName + '\\.([A-Za-z_$][\\w$]*)', 'g');
    let m;
    while ((m = re.exec(indexScript)) !== null) {
      knownMembers.get(objName).add(m[1]);
    }
  }
  // mode 用到的「物件.方法」是否都存在於 index.html?
  const memberMissing = [];
  for (const m of modeData) {
    for (const [key, ln] of m.deps.objectMemberCalls) {
      const [obj, method] = key.split('.');
      if (!knownMembers.has(obj)) continue; // 不是已知 const/let
      const s = knownMembers.get(obj);
      if (!s.has(method)) {
        memberMissing.push({ mode: m.name, obj, method, line: ln });
      }
    }
  }
  if (memberMissing.length === 0) {
    console.log('  (沒有發現「mode 呼叫了 index.html 不存在的方法」)');
  } else {
    for (const v of memberMissing) {
      console.log(`- [${v.mode}:${v.line}] \`${v.obj}.${v.method}\` — index.html 中找不到此方法`);
    }
  }
  console.log();

  // ============== C. DOM ID 契約 ==============
  console.log('## C. DOM ID 契約');
  console.log();
  const idMissing = [];
  for (const m of modeData) {
    for (const id of [...m.dom.domIds]) {
      // 動態 id(含 ${...} / template):跳過(本掃描已預先排除)
      if (inv.idsInHTML.has(id)) continue;
      if (m.dom.producedIds.has(id)) continue; // mode 自己 innerHTML 建立
      idMissing.push({ mode: m.name, id });
    }
  }
  if (idMissing.length === 0) {
    console.log('  (none)');
  } else {
    for (const v of idMissing) console.log(`- [${v.mode}] \`document.getElementById('${v.id}')\` — index.html 與本 mode 都沒建立此 id`);
  }
  console.log();

  // 順便檢查 mode 內**動態 id**(含 \${...})— 列出供人工檢查
  console.log('### 動態 id 候選(需人工確認)');
  for (const m of modeData) {
    const dyn = [];
    [...m.text.matchAll(/getElementById\(\s*(['"`])([^'"`]*\$\{[^'"`]*?)\1/g)].forEach(mm => dyn.push(mm[2]));
    [...m.text.matchAll(/getElementById\(['"`]\s*\+\s*([^)]+)\)/g)].forEach(mm => dyn.push('(+ ' + mm[1].trim() + ')'));
    if (dyn.length) {
      console.log(`- [${m.name}] 動態 id 模式:`);
      [...new Set(dyn)].slice(0, 8).forEach(d => console.log(`  - ${d}`));
    }
  }
  console.log();

  // ============== D. CSS 契約 ==============
  console.log('## D. CSS className / 變數契約');
  console.log();
  const ignoreClasses = new Set([
    // 一些 mode 自己注入 CSS 的(如 mode3 .m3-*, mode4 .m4-*)
    // 我們仍然會列出,但歸類為「mode 自注入」
  ]);
  for (const m of modeData) {
    // 找 mode 自己注入 CSS 的 class 字元
    const selfInjected = new Set();
    const styleMatches = [...m.text.matchAll(/textContent\s*=\s*`([\s\S]*?)`/g)];
    for (const sm of styleMatches) {
      [...sm[1].matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(mm => selfInjected.add(mm[1]));
    }
    const inlineStyleMatches = [...m.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
    for (const sm of inlineStyleMatches) {
      [...sm[1].matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(mm => selfInjected.add(mm[1]));
    }

    const missing = [...m.dom.queriedClasses].filter(c => {
      if (inv.classNamesInCSS.has(c)) return false;
      if (selfInjected.has(c)) return false;
      // 過濾 obvious 非 class 的東西(如 '<' / 數字)
      if (!/^[A-Za-z][\w-]*$/.test(c)) return false;
      return true;
    });
    const missingVars = [...m.dom.cssVars].filter(v => !inv.cssVars.has(v));
    if (missing.length === 0 && missingVars.length === 0) continue;
    console.log(`### [${m.name}]`);
    if (missing.length) {
      console.log(`  className 在 index.html 與 mode 自注入 CSS 都找不到:`);
      missing.forEach(c => console.log(`    - .${c}`));
    }
    if (missingVars.length) {
      console.log(`  CSS 變數 var(...) 未定義:`);
      missingVars.forEach(v => console.log(`    - var(${v})`));
    }
  }
  console.log();

  // ============== E. localStorage key 契約 ==============
  console.log('## E. localStorage key 契約');
  console.log();
  // index.html 用的 key
  const indexKeys = new Set();
  [...indexScript.matchAll(/K_[A-Z_]+\s*:\s*['"]([^'"]+)['"]/g)].forEach(m => indexKeys.add(m[1]));
  [...indexScript.matchAll(/Storage\.(?:set|get|del)\(\s*['"]([^'"]+)['"]/g)].forEach(m => indexKeys.add(m[1]));
  // mode 用的 key
  console.log('index.html 已用 key:');
  [...indexKeys].forEach(k => console.log(`  - ${k}`));
  for (const m of modeData) {
    if (m.dom.lsKeys.size === 0 && m.dom.rawLs.length === 0) continue;
    console.log(`### [${m.name}]`);
    [...m.dom.lsKeys].forEach(k => {
      const conflict = indexKeys.has(k);
      console.log(`  - ${k}${conflict ? ' ⚠️ 與共用層共用'  : ''}`);
    });
    if (m.dom.rawLs.length) {
      console.log(`  ⚠️ 直接呼叫 localStorage(繞過 Storage 包裝):`);
      m.dom.rawLs.forEach(c => console.log(`    line ${c.line}: ${c.op}('${c.key}')`));
    }
  }
  console.log();

  // ============== F. 載入順序 ==============
  console.log('## F. 載入順序契約');
  // 從 index.html 找 startup IIFE
  const startupSeq = indexScript.match(/await\s+loadQuestions\(\)[\s\S]{0,400}?for\s*\(.*?of\s*\[[^\]]+\]/);
  if (startupSeq) {
    console.log('  ✓ index.html 啟動順序:loadQuestions() → 動態載入 mode1..5(sequential await)');
  } else {
    console.log('  ✗ 找不到啟動順序樣式,需人工檢查 index.html');
  }
  console.log();

  // ============== Summary ==============
  console.log('## Summary');
  console.log(`- P0 (let/const 被當 window.X 讀):${p0.length}`);
  console.log(`- P1 (完全沒宣告就被 window.X 讀):${p1.length}`);
  console.log(`- 物件方法呼叫不存在:${memberMissing.length}`);
  console.log(`- DOM ID 找不到:${idMissing.length}`);
}

try { main(); } catch (e) { console.error(e); process.exit(1); }
