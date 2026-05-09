// scripts/check-globals-v3.js
// QA Round 2 — final precise audit
// 用 hardcoded 已知 inventory(從 grep 結果提取),避免 v1/v2 的 brace 解析誤差。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const INDEX = path.join(SRC, 'index.html');
const MODES = ['mode1', 'mode2', 'mode3', 'mode4', 'mode5'];

// ============================================================
// 已知 index.html 頂層宣告(grep ^const/let/var/function 已驗證)
// ============================================================
const INDEX_DECLS = {
  // const = 不掛 window;但 mode IIFE 內可裸名讀(global lexical scope)
  const: ['Storage', 'RNG', 'Progress', 'Mastery', 'Wrongbook', 'PlayEngine', 'DrillSession', 'Review', 'Mode4', 'GameFX', 'Player'],
  let:   ['QUESTIONS'], // 同 const
  var:   [], // 沒有
  function: ['applyVariables', 'pickCase', 'renderQuestion', 'loadQuestions', 'generateVariation',
             'showToast', 'show', 'goHome', 'goStats', 'refreshHome', 'renderWeakList', 'enterMode',
             'renderStats', 'resetAll', 'highlightCodeSimple', 'renderVisualData'],
  // 顯式 window.X = ...(從 index.html 行 564 已知)
  windowAssign: ['QUESTIONS'],
  // CDN 全域(雖未在 index.html 顯式 var/function,但腳本 tag 會掛 window)
  cdn: ['gsap', 'confetti'],
};

// ============================================================
// 各物件已知 method/property(從 index.html 抓)
// 1) X.method 用法
// 2) const X = { method() {...}, prop: ..., method: function ... } 物件字面量
// ============================================================
function getIndexMembers() {
  const text = fs.readFileSync(INDEX, 'utf8');
  const objects = [...INDEX_DECLS.const, ...INDEX_DECLS.let];
  const members = {};
  for (const obj of objects) {
    const set = new Set();
    // (1) X.method 形式(包含 X.method = ...)
    const re = new RegExp('\\b' + obj + '\\.([A-Za-z_$][\\w$]*)', 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const lineToCursor = text.slice(lineStart, m.index);
      if (lineToCursor.includes('//')) continue;
      set.add(m[1]);
    }
    // (2) 物件字面量:const X = { ... } 內的 shorthand method 與 property
    // 找 `const X = {` 開始,直到 brace 配平
    const defRe = new RegExp('(?:const|let)\\s+' + obj + '\\s*=\\s*\\{', 'g');
    const defMatch = defRe.exec(text);
    if (defMatch) {
      const startIdx = defMatch.index + defMatch[0].length - 1; // 指向 '{'
      // 找對應 '}'
      let depth = 0;
      let endIdx = -1;
      let inStr = null, inTpl = false;
      for (let i = startIdx; i < text.length; i++) {
        const c = text[i];
        if (inStr) { if (c === inStr && text[i - 1] !== '\\') inStr = null; continue; }
        if (inTpl) { if (c === '`') inTpl = false; continue; }
        if (c === '"' || c === "'") { inStr = c; continue; }
        if (c === '`') { inTpl = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx > 0) {
        const body = text.slice(startIdx + 1, endIdx);
        // 找頂層(內部 brace depth = 0)的 key:
        let d = 0, p = 0;
        let lineStart = 0;
        const segments = [];
        let cur = '';
        let strCh = null, tpl = false;
        for (let j = 0; j < body.length; j++) {
          const ch = body[j];
          if (strCh) { cur += ch; if (ch === strCh && body[j - 1] !== '\\') strCh = null; continue; }
          if (tpl) { cur += ch; if (ch === '`') tpl = false; continue; }
          if (ch === '"' || ch === "'") { strCh = ch; cur += ch; continue; }
          if (ch === '`') { tpl = true; cur += ch; continue; }
          if (ch === '{') d++;
          if (ch === '}') d--;
          if (ch === '(') p++;
          if (ch === ')') p--;
          if (ch === ',' && d === 0 && p === 0) {
            segments.push(cur); cur = '';
            continue;
          }
          cur += ch;
        }
        if (cur.trim()) segments.push(cur);
        for (const seg of segments) {
          // 取 key:第一個合法 identifier
          const km = seg.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*[:\(]/);
          if (km) set.add(km[1]);
        }
      }
    }
    members[obj] = set;
  }
  return members;
}

// ============================================================
// 提取 index.html 中所有 id(包含 JS 字串中)以及靜態 HTML body id
// ============================================================
function getIndexInventory() {
  const html = fs.readFileSync(INDEX, 'utf8');
  // 所有 id="xxx"(也包含 JS 字串中的 innerHTML 字面量)
  const allIds = new Set();
  [...html.matchAll(/\bid\s*=\s*(['"])([^'"\$\{]+?)\1/g)].forEach(m => allIds.add(m[2]));
  // 動態(${...})id 列出
  const dynamicIds = new Set();
  [...html.matchAll(/\bid\s*=\s*(['"`])([^'"`]*\$\{[^'"`]*?)\1/g)].forEach(m => dynamicIds.add(m[2]));

  // CSS rules
  const styleText = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('');
  const cssClasses = new Set();
  // 抓 .className(僅在 selector 中,不是 .property);只要不是緊接著識別符結尾(避免抓 #fff.0)
  // 簡化:抓 selector 區塊(到 { 為止),內部 . 後面接 identifier
  // 用兩段:(1) 全域抓 .className(寬鬆,容易誤抓)(2) 抓 selector 區塊
  [...styleText.matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(m => {
    // 確認前面不是字母 / 數字(避免抓 0.5em 之類)
    const idx = m.index;
    const prev = idx > 0 ? styleText[idx - 1] : ' ';
    if (/[A-Za-z0-9_]/.test(prev)) return; // 前一字符是字母 / 數字 → 不算 selector
    cssClasses.add(m[1]);
  });
  const cssVars = new Set();
  [...styleText.matchAll(/(--[\w-]+)\s*:/g)].forEach(m => cssVars.add(m[1]));

  return { allIds, dynamicIds, cssClasses, cssVars };
}

// ============================================================
// 分析每個 mode
// ============================================================
function analyzeMode(name) {
  const file = path.join(SRC, 'modes', `${name}.js`);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const result = {
    name, file, text,
    windowReads: new Map(),       // 'X' → first line
    bareTopReads: new Map(),      // 對 index.html 已知頂層名做的裸讀(白名單比對)
    methodCalls: new Map(),       // 'Storage.get' → first line
    domIdGets: new Map(),         // 'view-play' → [lines]
    domIdsProduced: new Set(),    // 本 mode 自己 innerHTML 建立的 id
    classNames: new Set(),
    cssVars: new Set(),
    lsKeys: new Set(),
    rawLs: [],
    selfInjectedClasses: new Set(),
    declaresWindowMode: null,     // window.ModeN = ...(行)
  };

  // 抓 mode 內 <style> / .textContent = `...` 內的 class(自注入 CSS)
  // mode2 & mode4 把 style 直接放在 innerHTML template 裡;mode3 用 textContent
  const styleBlocks = [];
  [...text.matchAll(/textContent\s*=\s*`([\s\S]*?)`/g)].forEach(m => styleBlocks.push(m[1]));
  [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].forEach(m => styleBlocks.push(m[1]));
  for (const s of styleBlocks) {
    [...s.matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(m => {
      const idx = m.index;
      const prev = idx > 0 ? s[idx - 1] : ' ';
      if (/[A-Za-z0-9_]/.test(prev)) return;
      result.selfInjectedClasses.add(m[1]);
    });
  }

  // line-by-line 分析
  const knownTopNames = new Set([
    ...INDEX_DECLS.const, ...INDEX_DECLS.let,
    ...INDEX_DECLS.var, ...INDEX_DECLS.function,
    ...INDEX_DECLS.cdn,
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 跳過行尾註解 // 後的部分(粗略)
    let scan = line.replace(/\/\/.*$/, '');

    // window.X 讀取
    [...scan.matchAll(/(?<![A-Za-z0-9_$])window\.([A-Za-z_$][\w$]*)/g)].forEach(m => {
      const after = scan.slice(m.index + m[0].length);
      if (/^\s*=(?!=)/.test(after)) {
        // 賦值:window.ModeN = ...(各 mode 都會做)
        if (/^Mode[1-5]$/.test(m[1])) result.declaresWindowMode = lineNum;
      } else {
        if (!result.windowReads.has(m[1])) result.windowReads.set(m[1], lineNum);
      }
    });

    // 裸名讀
    for (const k of knownTopNames) {
      const re = new RegExp('\\b' + k + '\\b', 'g');
      let m;
      while ((m = re.exec(scan)) !== null) {
        const before = scan.slice(0, m.index);
        if (/window\.\s*$/.test(before)) continue;
        if (/\.\s*$/.test(before)) continue;
        // 在字串中?
        const dq = (before.match(/(?<!\\)"/g) || []).length;
        const sq = (before.match(/(?<!\\)'/g) || []).length;
        const bq = (before.match(/`/g) || []).length;
        if (dq % 2 === 1 || sq % 2 === 1 || bq % 2 === 1) continue;
        if (!result.bareTopReads.has(k)) result.bareTopReads.set(k, lineNum);

        // 是「物件.方法」呼叫?
        const after = scan.slice(m.index + k.length);
        const meth = after.match(/^\.([A-Za-z_$][\w$]*)/);
        if (meth) {
          const key = `${k}.${meth[1]}`;
          if (!result.methodCalls.has(key)) result.methodCalls.set(key, lineNum);
        }
      }
    }

    // DOM
    [...scan.matchAll(/document\.getElementById\(\s*(['"])([^'"]+)\1/g)].forEach(m => {
      if (!result.domIdGets.has(m[2])) result.domIdGets.set(m[2], lineNum);
    });
    [...scan.matchAll(/document\.querySelector(?:All)?\(\s*(['"])(#[^'"]+)\1/g)].forEach(m => {
      const idMatch = m[2].match(/^#([A-Za-z][\w-]*)/);
      if (idMatch && !result.domIdGets.has(idMatch[1])) result.domIdGets.set(idMatch[1], lineNum);
    });
    [...scan.matchAll(/\bid\s*=\s*(['"])([^'"\${]+?)\1/g)].forEach(m => result.domIdsProduced.add(m[2]));

    // class
    [...scan.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*(['"])([\w-]+)\1/g)].forEach(m => result.classNames.add(m[2]));
    [...scan.matchAll(/className\s*=\s*(['"`])([^'"`]+)\1/g)].forEach(m => {
      m[2].split(/\s+/).forEach(c => { if (c && /^[A-Za-z][\w-]*$/.test(c)) result.classNames.add(c); });
    });
    [...scan.matchAll(/\bclass\s*=\s*(['"`])([^'"`]+)\1/g)].forEach(m => {
      m[2].split(/\s+/).forEach(c => { if (c && /^[A-Za-z][\w-]*$/.test(c)) result.classNames.add(c); });
    });
    [...scan.matchAll(/querySelector(?:All)?\(\s*(['"])([^'"]+)\1/g)].forEach(m => {
      [...m[2].matchAll(/\.([A-Za-z_][\w-]*)/g)].forEach(mm => result.classNames.add(mm[1]));
    });

    // CSS var
    [...scan.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].forEach(m => result.cssVars.add(m[1]));

    // localStorage
    [...scan.matchAll(/\blocalStorage\.(getItem|setItem|removeItem)\(\s*(['"]([^'"]+)['"])?/g)].forEach(m => {
      result.rawLs.push({ line: lineNum, op: m[1], key: m[3] || '(dynamic)' });
      if (m[3]) result.lsKeys.add(m[3]);
    });
    [...scan.matchAll(/Storage\.(?:set|get|del)\(\s*(?:Storage\.([A-Z_]+)|['"]([^'"]+)['"])/g)].forEach(m => {
      if (m[2]) result.lsKeys.add(m[2]);
    });
  }
  return result;
}

// ============================================================
// 主函數
// ============================================================
function main() {
  const idxMembers = getIndexMembers();
  const idxInv = getIndexInventory();

  const onWindow = new Set([
    ...INDEX_DECLS.var, ...INDEX_DECLS.function,
    ...INDEX_DECLS.windowAssign, ...INDEX_DECLS.cdn
  ]);
  const allLetConst = new Set([...INDEX_DECLS.const, ...INDEX_DECLS.let]);
  const allTopLevel = new Set([
    ...INDEX_DECLS.const, ...INDEX_DECLS.let,
    ...INDEX_DECLS.var, ...INDEX_DECLS.function
  ]);

  const modes = MODES.map(analyzeMode);

  console.log('# Cross-File Contract Audit (QA Round 2 — v3 final)');
  console.log();
  console.log('## index.html top-level inventory');
  console.log();
  console.log(`- const: ${INDEX_DECLS.const.join(', ')}`);
  console.log(`- let:   ${INDEX_DECLS.let.join(', ')}`);
  console.log(`- function: ${INDEX_DECLS.function.join(', ')}`);
  console.log(`- 顯式 window.X 賦值: ${INDEX_DECLS.windowAssign.join(', ') || '(無)'}`);
  console.log();
  console.log(`**會自動掛 window 的**: ${[...onWindow].sort().join(', ')}`);
  console.log(`**不會掛 window 的(let/const)**: ${[...allLetConst].sort().join(', ')}`);
  console.log();

  // ============================================================
  // A. window.X 讀取破洞
  // ============================================================
  console.log('## A. JS 變數契約 — window.X 讀取破洞');
  console.log();
  const aViolations = [];
  for (const m of modes) {
    for (const [x, ln] of m.windowReads) {
      if (/^Mode[1-5]$/.test(x)) continue; // mode 互讀
      if (INDEX_DECLS.cdn.includes(x)) continue;
      if (onWindow.has(x)) continue;
      const isLetConst = allLetConst.has(x);
      aViolations.push({
        mode: m.name, sym: x, line: ln,
        severity: isLetConst ? 'P0' : 'P1',
        reason: isLetConst
          ? `index.html 用 let/const 宣告 ${x};window.${x} 為 undefined(除非 index.html 顯式 window.${x} = ${x})`
          : `index.html 完全沒宣告 ${x};window.${x} 必為 undefined`,
        mitigation: isLetConst
          ? `mode 改裸名讀 \`${x}\` 即可(IIFE 內透過 global lexical 取得),或在 index.html 加 \`window.${x} = ${x};\``
          : `若 ${x} 是 CDN 或可選依賴,加 \`if (window.${x})\` fallback;否則新增宣告`
      });
    }
  }
  if (aViolations.length === 0) console.log('  (none)');
  for (const v of aViolations) {
    console.log(`- **${v.severity}** [${v.mode}:${v.line}] \`window.${v.sym}\``);
    console.log(`  - 原因:${v.reason}`);
    console.log(`  - 建議:${v.mitigation}`);
  }
  console.log();

  // ============================================================
  // B. 函數 / 物件方法呼叫契約
  // ============================================================
  console.log('## B. 函數 / 物件方法呼叫契約');
  console.log();
  const bViolations = [];
  for (const m of modes) {
    for (const [key, ln] of m.methodCalls) {
      const [obj, method] = key.split('.');
      const set = idxMembers[obj];
      if (!set) continue; // 不是 index.html 物件
      if (!set.has(method)) {
        bViolations.push({ mode: m.name, obj, method, line: ln });
      }
    }
  }
  if (bViolations.length === 0) console.log('  (沒發現方法不存在的呼叫)');
  for (const v of bViolations) {
    console.log(`- [${v.mode}:${v.line}] \`${v.obj}.${v.method}\` — index.html 中找不到此方法`);
  }
  console.log();
  console.log('### 各物件已知方法表');
  for (const obj of Object.keys(idxMembers).sort()) {
    const set = idxMembers[obj];
    if (set.size === 0) continue;
    console.log(`- **${obj}**: ${[...set].sort().join(', ')}`);
  }
  console.log();

  // ============================================================
  // C. DOM ID 契約
  // ============================================================
  console.log('## C. DOM ID 契約');
  console.log();
  const cViolations = [];
  for (const m of modes) {
    for (const [id, ln] of m.domIdGets) {
      if (idxInv.allIds.has(id)) continue;
      if (m.domIdsProduced.has(id)) continue;
      // 過濾掉明顯動態 prefix(例如 "m3-slot-" 是 prefix,不是真實 id)
      cViolations.push({ mode: m.name, id, line: ln });
    }
  }
  if (cViolations.length === 0) console.log('  (none)');
  for (const v of cViolations) {
    console.log(`- [${v.mode}:${v.line}] \`getElementById('${v.id}')\` — 不存在`);
  }
  console.log();

  // 動態 id 用法(供人工 cross-check)
  console.log('### 動態 id 用法(getElementById 使用 template literal / concat)— 需人工 cross-check');
  for (const m of modes) {
    const dyns = [];
    [...m.text.matchAll(/getElementById\(\s*`([^`]*\$\{[^`]*?)`/g)].forEach(mm => dyns.push(mm[1]));
    [...m.text.matchAll(/getElementById\(['"]([^'"]+)['"]\s*\+\s*([^)]+)\)/g)].forEach(mm => dyns.push(`'${mm[1]}' + ${mm[2].trim()}`));
    if (dyns.length) {
      console.log(`- [${m.name}]`);
      [...new Set(dyns)].slice(0, 12).forEach(d => console.log(`  - ${d}`));
    }
  }
  console.log();

  // ============================================================
  // D. CSS className / 變數契約
  // ============================================================
  console.log('## D. CSS className / 變數契約');
  console.log();
  for (const m of modes) {
    const allKnownClasses = new Set([...idxInv.cssClasses, ...m.selfInjectedClasses]);
    const missing = [...m.classNames].filter(c => !allKnownClasses.has(c));
    const missingVars = [...m.cssVars].filter(v => !idxInv.cssVars.has(v));
    if (missing.length === 0 && missingVars.length === 0) continue;
    console.log(`### [${m.name}]`);
    if (missing.length) {
      console.log(`  className 沒有 CSS 規則(index.html 與 mode 自注入都找不到):`);
      missing.forEach(c => console.log(`  - .${c}`));
    }
    if (missingVars.length) {
      console.log(`  CSS 變數未定義:`);
      missingVars.forEach(v => console.log(`  - var(${v})`));
    }
  }
  console.log();

  // ============================================================
  // E. localStorage key 契約
  // ============================================================
  console.log('## E. localStorage key 契約');
  console.log();
  const indexLsText = fs.readFileSync(INDEX, 'utf8');
  const indexKeys = new Set();
  [...indexLsText.matchAll(/K_[A-Z_]+\s*:\s*['"]([^'"]+)['"]/g)].forEach(m => indexKeys.add(m[1]));
  [...indexLsText.matchAll(/Storage\.(?:set|get|del)\(\s*['"]([^'"]+)['"]/g)].forEach(m => indexKeys.add(m[1]));
  console.log(`index.html 已用 key:`);
  [...indexKeys].sort().forEach(k => console.log(`- ${k}`));
  for (const m of modes) {
    if (m.lsKeys.size === 0 && m.rawLs.length === 0) continue;
    console.log(`### [${m.name}]`);
    for (const k of m.lsKeys) {
      const dup = indexKeys.has(k);
      console.log(`- ${k}${dup ? ' ⚠️ 與共用層共用(可能互相覆蓋)' : ''}`);
    }
    if (m.rawLs.length) {
      console.log(`  ⚠️ 直接呼叫 localStorage(繞過 Storage 包裝):`);
      m.rawLs.forEach(c => console.log(`    line ${c.line}: ${c.op}('${c.key}')`));
    }
  }
  console.log();

  // ============================================================
  // F. 載入順序
  // ============================================================
  console.log('## F. 載入順序契約');
  console.log();
  // 動態載入順序:mode1 → 2 → 3 → 4 → 5;每個 sequential await
  // 但 enterMode() 在 home 渲染時就可被點(refreshHome 在 loadQuestions 之後但 mode 載入前也會跑一次?讓我們找)
  // 從 index.html 啟動 IIFE:
  const startup = indexLsText.match(/\(async function\s*\(\)\s*\{([\s\S]*?)\}\)\(\)/);
  if (startup) {
    const body = startup[1];
    const seq = body.match(/Progress\.init[\s\S]*?refreshHome\(\)/);
    if (seq) {
      console.log('  index.html 啟動順序:');
      console.log('    1. Progress.init()');
      console.log('    2. await loadQuestions()  // QUESTIONS 與 window.QUESTIONS 同步在此完成');
      console.log('    3. for mode of [mode1..5]: await load script (sequential)');
      console.log('    4. refreshHome()');
      console.log();
      console.log('  ⚠️ 注意:enterMode(mode) 用 `window["Mode"+mode]` 動態查找,所以即使 mode 還沒載入完成,使用者也能點按鈕(會看到 toast 說「尚未載入」),但 Mode4 是 const = {} 在 index.html 已預先存在。');
    }
  }
  console.log();

  // ============================================================
  // 評分
  // ============================================================
  console.log('## 整體契約完整性評分');
  console.log();
  for (const m of modes) {
    let score = 100;
    const violations = [];
    aViolations.filter(v => v.mode === m.name).forEach(v => {
      score -= v.severity === 'P0' ? 25 : 10;
      violations.push(`-${v.severity === 'P0' ? 25 : 10}: window.${v.sym}(${v.severity})`);
    });
    bViolations.filter(v => v.mode === m.name).forEach(v => {
      score -= 5;
      violations.push(`-5: ${v.obj}.${v.method} 不存在`);
    });
    cViolations.filter(v => v.mode === m.name).forEach(v => {
      score -= 8;
      violations.push(`-8: getElementById('${v.id}') 不存在`);
    });
    const ll = m.lsKeys.size > 0 ? [...m.lsKeys].filter(k => indexKeys.has(k)).length : 0;
    if (ll > 0) {
      score -= ll * 5;
      violations.push(`-${ll * 5}: localStorage key 與共用層共用`);
    }
    score = Math.max(0, score);
    console.log(`- **${m.name}**: ${score}/100${violations.length ? ' (' + violations.join('; ') + ')' : ''}`);
  }
  console.log();

  // 直接 localStorage(繞過 Storage 包裝)
  console.log('## 額外:直接 localStorage 呼叫(繞過共用層 Storage 包裝)');
  for (const m of modes) {
    if (m.rawLs.length) {
      console.log(`- [${m.name}]`);
      m.rawLs.forEach(c => console.log(`  - line ${c.line}: ${c.op}('${c.key}')`));
    }
  }
}

try { main(); } catch (e) { console.error(e); process.exit(1); }
