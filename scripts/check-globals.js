// scripts/check-globals.js
// QA Round 2: 跨檔契約檢查工具
// 驗證 modes/*.js 與 index.html 之間的「全域變數 / 函數 / DOM ID / CSS / localStorage」契約
//
// 用法:node scripts/check-globals.js
// 不修改任何檔案,只輸出報告

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const INDEX = path.join(SRC, 'index.html');
const MODES = ['mode1', 'mode2', 'mode3', 'mode4', 'mode5'].map(n => ({
  name: n,
  file: path.join(SRC, 'modes', `${n}.js`),
}));

// =====================================================================
// 1) 從 index.html 抓 <script> 區塊
// =====================================================================
function readIndexScript() {
  const html = fs.readFileSync(INDEX, 'utf8');
  // 抓 <script> ... </script>(可能多段)
  const matches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  return matches.map(m => m[1]).join('\n');
}

function readIndexStyle() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const matches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return matches.map(m => m[1]).join('\n');
}

function readIndexBody() {
  const html = fs.readFileSync(INDEX, 'utf8');
  return html;
}

// =====================================================================
// 2) 解析:抓「頂層」(行首,允許 leading whitespace)的宣告
//    ⚠ 這是粗略的詞法檢查(沒做完整 JS parse)。對 IIFE 內部的局部變數會誤抓,
//    但 mode 檔都包在 (function () { ... })() 裡,所以對 index.html 而言這已夠用。
// =====================================================================

// 依文字模式:行首(可有空白)是 let / const / var / function 開頭
function findTopLevelDecls(text) {
  const decls = { let: [], const: [], var: [], function: [], windowAssign: [] };
  const lines = text.split(/\r?\n/);
  let depth = 0;       // 大括號深度
  let parenDepth = 0;  // 小括號深度
  let inBlockComment = false;
  let inTemplate = false;

  // 簡化:只統計大括號深度。當 depth==0 才視為「頂層」
  // 加上忽略 // 行尾註解、/* */ 區塊註解、字串、template literal
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 處理區塊註解 / 字串 / template:做成「淨化版」 sanitized line(只用於計算深度與宣告偵測)
    let s = '';
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      const next = line[j + 1];
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; j += 2; continue; }
        j++; continue;
      }
      if (inTemplate) {
        if (ch === '`') { inTemplate = false; s += '`'; j++; continue; }
        // 模板內 ${ ... } 也應展開大括號,但簡化處理:全部視為字串忽略
        j++; continue;
      }
      if (ch === '/' && next === '*') { inBlockComment = true; j += 2; continue; }
      if (ch === '/' && next === '/') { break; } // 行尾註解 → 後面忽略
      if (ch === '`') { inTemplate = true; s += '`'; j++; continue; }
      if (ch === '"' || ch === "'") {
        // 跳過字串(處理跳脫)
        const q = ch;
        s += q;
        j++;
        while (j < line.length && line[j] !== q) {
          if (line[j] === '\\') j += 2;
          else { j++; }
        }
        if (j < line.length) { s += q; j++; } // 收尾
        continue;
      }
      s += ch;
      j++;
    }

    // 在頂層才判定宣告:必須 depth === 0 且 parenDepth === 0
    if (depth === 0 && parenDepth === 0) {
      const trimmed = s.replace(/^\s+/, '');
      let m;
      if ((m = trimmed.match(/^let\s+([A-Za-z_$][\w$]*)/))) decls.let.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^const\s+([A-Za-z_$][\w$]*)/))) decls.const.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^var\s+([A-Za-z_$][\w$]*)/))) decls.var.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) decls.function.push({ name: m[1], line: i + 1 });
      else if ((m = trimmed.match(/^window\.([A-Za-z_$][\w$]*)\s*=/))) decls.windowAssign.push({ name: m[1], line: i + 1 });
    }

    // 更新 brace / paren 深度(只看淨化後的 line)
    for (const c of s) {
      if (c === '{') depth++;
      else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === '(') parenDepth++;
      else if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
    }
  }
  return decls;
}

// =====================================================================
// 3) 解析每個 mode:抓
//    - window.X 讀取
//    - 直接裸名 X 讀取(僅篩 capitalised / 共用層 API)
//    - document.getElementById('xxx')
//    - className(目標:只看 .className 字串字面量)
//    - var(--xxx) CSS 變數參考
//    - localStorage / Storage 讀寫的 key
// =====================================================================

function analyzeMode(name, text) {
  const result = {
    name,
    windowReads: new Set(),    // window.X 讀取
    bareReads: new Map(),      // X 裸名 → first-line
    domIds: new Set(),
    classNames: new Set(),
    cssVars: new Set(),
    localStorageKeys: new Set(),
    storageKeyConsts: new Set(),
    rawLocalStorageCalls: [], // 直接呼叫 localStorage.* 的位置
  };

  const lines = text.split(/\r?\n/);

  // window.X 讀取(只抓讀,不抓賦值;但也記下賦值以備分析)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // window.X 讀(寬鬆:只要出現 window.X 就抓,X 為合法識別符)
    [...line.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)/g)].forEach(m => result.windowReads.add(m[1]));

    // document.getElementById('xxx')
    [...line.matchAll(/document\.getElementById\(\s*['"]([^'"]+)['"]/g)].forEach(m => result.domIds.add(m[1]));
    [...line.matchAll(/document\.querySelector\(\s*['"](#[^'"\s]+)['"]/g)].forEach(m => {
      const id = m[1].slice(1).split(/[\.\s\[]/)[0];
      if (id) result.domIds.add(id);
    });

    // CSS class 字面量(在 className / classList.add / 字串中)— 先抓常見模式
    [...line.matchAll(/classList\.(?:add|remove|toggle)\(\s*['"]([\w-]+)['"]/g)].forEach(m => result.classNames.add(m[1]));
    [...line.matchAll(/className\s*=\s*['"`]([^'"`]+)['"`]/g)].forEach(m => {
      m[1].split(/\s+/).forEach(c => { if (c) result.classNames.add(c); });
    });
    // class="xxx"(template literal 內常用)
    [...line.matchAll(/\bclass\s*=\s*["'`]([^"'`]+)["'`]/g)].forEach(m => {
      m[1].split(/\s+/).forEach(c => {
        // 跳過動態插值
        if (c && !c.includes('${') && !c.includes('$')) result.classNames.add(c);
      });
    });

    // var(--xxx)
    [...line.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].forEach(m => result.cssVars.add(m[1]));

    // localStorage 直接呼叫
    [...line.matchAll(/\blocalStorage\.(getItem|setItem|removeItem|clear)\(\s*(?:['"]([^'"]+)['"])?/g)].forEach(m => {
      result.rawLocalStorageCalls.push({ line: i + 1, op: m[1], key: m[2] || '(dynamic)' });
      if (m[2]) result.localStorageKeys.add(m[2]);
    });

    // Storage.set/get/del 透過共用層的 key
    [...line.matchAll(/\bStorage\.(?:set|get|del)\(\s*(?:Storage\.([A-Z_]+)|['"]([^'"]+)['"])/g)].forEach(m => {
      if (m[1]) result.storageKeyConsts.add(m[1]);
      if (m[2]) result.localStorageKeys.add(m[2]);
    });
  }

  // bareReads:在文字中找疑似「直接以裸名引用全域物件 / 函數」的位置
  // 只篩白名單,目標:Storage / RNG / Player / Mastery / Wrongbook / Progress / Review /
  //                   PlayEngine / DrillSession / GameFX / QUESTIONS / Mode1..5 /
  //                   refreshHome / goHome / goStats / show / showToast /
  //                   renderQuestion / generateVariation / pickCase / applyVariables /
  //                   highlightCodeSimple / renderVisualData / renderStats / loadQuestions /
  //                   resetAll / enterMode / Storage(連 K_xxx)
  const targets = [
    'Storage', 'RNG', 'Player', 'Mastery', 'Wrongbook', 'Progress', 'Review',
    'PlayEngine', 'DrillSession', 'GameFX', 'QUESTIONS',
    'Mode1', 'Mode2', 'Mode3', 'Mode4', 'Mode5',
    'refreshHome', 'goHome', 'goStats', 'show', 'showToast',
    'renderQuestion', 'generateVariation', 'pickCase', 'applyVariables',
    'highlightCodeSimple', 'renderVisualData', 'renderStats', 'loadQuestions', 'resetAll', 'enterMode',
    'gsap', 'confetti'
  ];
  const re = new RegExp('\\b(' + targets.join('|') + ')\\b', 'g');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    [...line.matchAll(re)].forEach(m => {
      // 排除「window.X」(已在 windowReads 抓)
      const idx = m.index;
      const before = line.slice(Math.max(0, idx - 7), idx);
      if (/window\.$/.test(before)) return;
      // 排除「.X」(物件成員)
      if (/\.$/.test(before)) return;
      // 排除字串內(寬鬆)
      const beforeQuote = (line.slice(0, idx).match(/["']/g) || []).length;
      if (beforeQuote % 2 === 1) return;
      const k = m[1];
      if (!result.bareReads.has(k)) result.bareReads.set(k, i + 1);
    });
  }

  return result;
}

// =====================================================================
// 4) 解析 index.html:抓所有 id="xxx" 與 className 規則
// =====================================================================
function indexHtmlInventory() {
  const body = readIndexBody();
  const idsInHTML = new Set();
  // 靜態 id="xxx"
  [...body.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].forEach(m => idsInHTML.add(m[1]));
  // 動態 id(在 JS innerHTML / template literal 中):先抓 id="xxx" 在 JS 字串中的
  // 已在上面 matchAll 抓到(因為匹配整個檔)

  // CSS 規則中的 .className(目標:選擇器內的 .x 字面)
  const styleText = readIndexStyle();
  const classNamesInHTML = new Set();
  [...styleText.matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(m => classNamesInHTML.add(m[1]));

  // CSS 變數定義
  const cssVarsInHTML = new Set();
  [...styleText.matchAll(/(--[\w-]+)\s*:/g)].forEach(m => cssVarsInHTML.add(m[1]));

  return { idsInHTML, classNamesInHTML, cssVarsInHTML, styleText, body };
}

// =====================================================================
// 5) 跑分析、輸出報告
// =====================================================================
function main() {
  const indexScript = readIndexScript();
  const indexDecls = findTopLevelDecls(indexScript);
  const inv = indexHtmlInventory();

  // 把所有 mode 檔讀進來
  const modeAnalysis = MODES.map(m => {
    if (!fs.existsSync(m.file)) return null;
    const text = fs.readFileSync(m.file, 'utf8');
    return analyzeMode(m.name, text);
  }).filter(Boolean);

  // === 把 index.html 在 JS 字串中產生的 id="xxx" 也加入 idsInHTML(因為這些 id 來自 innerHTML)
  // 已經被靜態抓到(因為我們對整個 body 做 regex)

  // 把 mode 檔內 innerHTML 字面量產生的 id 也作為「會被 mode 自己建立」的 id 列出
  const modeProducedIds = new Map(); // mode → Set(id)
  for (const m of MODES) {
    if (!fs.existsSync(m.file)) continue;
    const text = fs.readFileSync(m.file, 'utf8');
    const set = new Set();
    [...text.matchAll(/\bid\s*=\s*["']([^"'\$]+)["']/g)].forEach(mm => set.add(mm[1]));
    modeProducedIds.set(m.name, set);
  }

  console.log('========================================');
  console.log('  Cross-File Contract Audit (QA Round 2)');
  console.log('========================================\n');

  console.log('--- index.html top-level declarations ---');
  console.log('  let     :', indexDecls.let.map(d => d.name).join(', '));
  console.log('  const   :', indexDecls.const.map(d => d.name).join(', '));
  console.log('  var     :', indexDecls.var.map(d => d.name).join(', '));
  console.log('  function:', indexDecls.function.map(d => d.name).join(', '));
  console.log('  window.X (顯式賦值):', indexDecls.windowAssign.map(d => d.name).join(', '));
  console.log();

  // 哪些頂層名字 *不掛 window*(let / const / function declaration):
  // 注意:在 index.html 的 `<script>` 區塊裡的 function declaration *會* 掛 window
  //       (頂層 function declaration 屬於 global scope,等同 var)
  // 所以「不掛 window」的真正只有 `let` 與 `const`。
  const onlyVarOrFunc = new Set([
    ...indexDecls.var.map(d => d.name),
    ...indexDecls.function.map(d => d.name),
    ...indexDecls.windowAssign.map(d => d.name),
  ]);
  const letConst = new Set([
    ...indexDecls.let.map(d => d.name),
    ...indexDecls.const.map(d => d.name),
  ]);

  console.log('--- 預期掛在 window 的全域(var / function / 顯式 window.X) ---');
  console.log('  ', [...onlyVarOrFunc].sort().join(', '));
  console.log();
  console.log('--- *不會* 自動掛在 window 的(let / const) ---');
  console.log('  ', [...letConst].sort().join(', '));
  console.log();

  // === A. 對每個 mode,檢查 window.X 讀取是否合法 ===
  console.log('=== A. window.X 契約破洞 ===');
  let pCount = { p0: 0, p1: 0, p2: 0 };
  for (const ma of modeAnalysis) {
    const violations = [];
    for (const w of [...ma.windowReads]) {
      // 合法情況:
      //   1) onlyVarOrFunc 中
      //   2) 由其他 mode 寫到 window.X(modeN 都會 window.ModeN = ...,且 mode4 與 placeholder 互相)
      //   3) Mode1..Mode5 都應在 window 上(各 mode 自己 window.ModeN = ...)
      //   4) 瀏覽器原生:gsap/confetti(CDN 全域,雖未在 index.html 顯式宣告 — 算 OK)
      const okFromIndex = onlyVarOrFunc.has(w);
      const isOtherMode = /^Mode[1-5]$/.test(w); // 由 mode 自己掛
      const isCDN = ['gsap', 'confetti'].includes(w);
      if (!okFromIndex && !isOtherMode && !isCDN) {
        // 是不是 let / const?(這就是上一輪 QA 的 bug)
        if (letConst.has(w)) {
          violations.push({ name: w, severity: 'P0', reason: `index.html 用 let/const 宣告 ${w},不會掛到 window;mode 讀 window.${w} 永遠是 undefined` });
          pCount.p0++;
        } else {
          violations.push({ name: w, severity: 'P1', reason: `index.html 沒有任何形式宣告 ${w},mode 讀 window.${w} 會是 undefined` });
          pCount.p1++;
        }
      }
    }
    if (violations.length) {
      console.log(`  [${ma.name}]`);
      violations.forEach(v => console.log(`    ${v.severity} window.${v.name} → ${v.reason}`));
    }
  }
  console.log();

  // === B. 對每個 mode,檢查裸名讀取是否合法 ===
  console.log('=== B. 裸名讀取(naked global)契約破洞 ===');
  for (const ma of modeAnalysis) {
    const violations = [];
    for (const [k, ln] of ma.bareReads) {
      // 全部全域(let/const/var/function declaration)都能裸名讀(因為 mode script 是 dynamically-loaded 的 global script,沒有 module 隔離)
      const inIndex = onlyVarOrFunc.has(k) || letConst.has(k);
      const isOtherMode = /^Mode[1-5]$/.test(k); // 由 mode 自己掛(但 mode 之間互相裸名讀會有 race condition)
      const isCDN = ['gsap', 'confetti'].includes(k);
      // 但要注意:mode 檔包在 IIFE 裡,因此「裸名讀 Mode1/2/3/4/5」會看不到外面的 var(沒這個 var,是 window.ModeX),
      // 所以 IIFE 內裸名讀「ModeX」 → 在 IIFE 內是 undefined(除非 ModeX 是 var)
      // 但因為 mode 都用 window.ModeN 讀其他 mode,所以這不是問題
      if (!inIndex && !isOtherMode && !isCDN) {
        violations.push({ name: k, line: ln, reason: `${k} 沒有在 index.html 頂層宣告,在 mode IIFE 內裸名讀為 ReferenceError(嚴格模式)或 undefined(非嚴格)` });
      }
    }
    if (violations.length) {
      console.log(`  [${ma.name}]`);
      violations.forEach(v => console.log(`    line ${v.line}: ${v.name} → ${v.reason}`));
    }
  }
  console.log();

  // === C. DOM ID 契約 ===
  console.log('=== C. DOM ID 契約 ===');
  // index.html 中靜態定義的 id(只看 view-* / 全域固定 id)
  const fixedIdsInIndex = new Set();
  // 從 body 抓所有 id="xxx"(包含 JS 字串中的 — 這些是 mode 自己會建立的)
  [...inv.body.matchAll(/\bid\s*=\s*["']([^"'\${]+)["']/g)].forEach(m => fixedIdsInIndex.add(m[1]));

  for (const ma of modeAnalysis) {
    const violations = [];
    const produced = modeProducedIds.get(ma.name) || new Set();
    for (const id of [...ma.domIds]) {
      const inIndex = fixedIdsInIndex.has(id);
      const inMode = produced.has(id);
      if (!inIndex && !inMode) {
        violations.push({ id, reason: 'index.html 與本 mode innerHTML 都找不到此 id' });
      }
    }
    if (violations.length) {
      console.log(`  [${ma.name}]`);
      violations.forEach(v => console.log(`    document.getElementById('${v.id}') → ${v.reason}`));
    }
  }
  console.log();

  // === D. CSS 契約 ===
  console.log('=== D. CSS className / 變數契約 ===');
  const ignoreClasses = new Set([
    // 通用工具(不需 CSS 規則,有些只用作 selector)
  ]);
  for (const ma of modeAnalysis) {
    const missing = [...ma.classNames].filter(c => !inv.classNamesInHTML.has(c) && !ignoreClasses.has(c));
    const missingVars = [...ma.cssVars].filter(v => !inv.cssVarsInHTML.has(v));
    if (missing.length) {
      console.log(`  [${ma.name}] className 沒有 CSS 規則(可能 mode 自己注入 / 純 selector 用):`);
      missing.forEach(c => console.log(`    .${c}`));
    }
    if (missingVars.length) {
      console.log(`  [${ma.name}] CSS 變數未在 index.html 定義:`);
      missingVars.forEach(v => console.log(`    var(${v})`));
    }
  }
  console.log();

  // === E. localStorage key 契約 ===
  console.log('=== E. localStorage key 契約 ===');
  const indexStorageKeys = new Set();
  // 從 index.html script 中找 K_XXX = '...'
  [...indexScript.matchAll(/K_[A-Z_]+\s*:\s*['"]([^'"]+)['"]/g)].forEach(m => indexStorageKeys.add(m[1]));
  [...indexScript.matchAll(/\bStorage\.set\(\s*['"]([^'"]+)['"]/g)].forEach(m => indexStorageKeys.add(m[1]));
  [...indexScript.matchAll(/\bStorage\.get\(\s*['"]([^'"]+)['"]/g)].forEach(m => indexStorageKeys.add(m[1]));
  // index.html 的 Player 也直接 Storage.set('ipas_player_v1', ...)
  console.log('  index.html 已知 localStorage key:', [...indexStorageKeys].join(', '));
  for (const ma of modeAnalysis) {
    if (ma.localStorageKeys.size === 0 && ma.rawLocalStorageCalls.length === 0) continue;
    console.log(`  [${ma.name}]`);
    [...ma.localStorageKeys].forEach(k => {
      console.log(`    used key: '${k}'${indexStorageKeys.has(k) ? ' (與共用層共用,警告:可能互相覆蓋)' : ''}`);
    });
    if (ma.rawLocalStorageCalls.length) {
      console.log(`    ⚠ 直接呼叫 localStorage(繞過共用 Storage 包裝):`);
      ma.rawLocalStorageCalls.forEach(c => console.log(`      line ${c.line}: ${c.op}(${c.key})`));
    }
  }
  console.log();

  console.log('=== Summary ===');
  console.log('  Found P0:', pCount.p0, '(let/const 被 window.X 讀取)');
  console.log('  Found P1:', pCount.p1, '(完全沒宣告就被 window.X 讀取)');
}

try { main(); } catch (e) { console.error(e); process.exit(1); }
