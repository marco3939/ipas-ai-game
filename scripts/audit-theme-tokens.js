// ============================================================
// audit-theme-tokens.js — 主題 token 完整性檢查
// 2026-05-19:配合 P3 視覺統一(PR #48)+ themes.js theme switcher
//
// 防止以下「靜默樣式漂移」:
//   案例 a:在 themes.js 寫了個 theme 覆寫 '--gard-info'(typo),套用後沒效果
//   案例 b:在 mode 檔加新 var(--grad-foo) 但 :root 沒定義,fallback 變 transparent
//   案例 c:刪掉 :root 某個 token,但 theme 覆寫仍提供 → 預設 theme 變空 / 其他 theme 還在用 → 視覺不一致
//   案例 d:THEMES 陣列結構錯亂(id / name / vars 缺欄位)
//
// 三層 check:
//   Check A: themes.js 解析 — 每個 theme 必有 id / name / desc / vars(object);id 全局唯一
//   Check B: orphan var override — 每個 theme.vars 的 key 必須是 :root 已定義的 token(若不在 :root,override 等於建鬼魂 var)
//   Check C: undefined var() — src/{index.html,modes/*.js} 內 var(--X) 引用 X 必須在 :root 有定義
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const INDEX_HTML = path.join(SRC, 'index.html');
const THEMES_JS = path.join(SRC, 'themes.js');
const MODES_DIR = path.join(SRC, 'modes');

const violations = [];
const pushV = (level, check, msg, where) => violations.push({ level, check, msg, where });

function parseRootTokens(html) {
  const rootMatch = html.match(/:root\s*\{([\s\S]*?)\}/);
  if (!rootMatch) {
    pushV('error', 'PARSE', '無法從 index.html 找到 :root { ... } 區塊', 'src/index.html');
    return new Set();
  }
  const body = rootMatch[1];
  const tokens = new Set();
  const re = /--([a-zA-Z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(body)) !== null) tokens.add('--' + m[1]);
  return tokens;
}

function parseThemes(jsSrc) {
  const sandbox = {
    window: {},
    document: {
      documentElement: { style: { setProperty() {}, removeProperty() {} } },
      readyState: 'complete',
      addEventListener() {},
      createElement: () => ({
        setAttribute() {}, addEventListener() {}, appendChild() {},
        style: {}, children: []
      }),
      createTextNode: () => ({}),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(jsSrc, sandbox, { filename: 'themes.js' });
  } catch (e) {
    pushV('error', 'PARSE', 'themes.js 執行錯誤:' + e.message, 'src/themes.js');
    return null;
  }
  if (!sandbox.window.THEMES || !Array.isArray(sandbox.window.THEMES)) {
    pushV('error', 'PARSE', 'themes.js 未 export window.THEMES 陣列', 'src/themes.js');
    return null;
  }
  return sandbox.window.THEMES;
}

function collectVarUsages() {
  const files = [INDEX_HTML];
  if (fs.existsSync(MODES_DIR)) {
    for (const f of fs.readdirSync(MODES_DIR)) {
      if (f.endsWith('.js')) files.push(path.join(MODES_DIR, f));
    }
  }
  // 抓 var(--name) 或 var(--name, fallback);若有 fallback,該引用 CSS 層級已 safe,不算 undef
  const usages = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const v = m[1];
      const hasFallback = !!m[2];
      if (!usages.has(v)) usages.set(v, { files: new Set(), allHaveFallback: true });
      const entry = usages.get(v);
      entry.files.add(path.relative(ROOT, file));
      if (!hasFallback) entry.allHaveFallback = false;
    }
  }
  return usages;
}

function main() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const themesJs = fs.readFileSync(THEMES_JS, 'utf8');

  const rootTokens = parseRootTokens(html);
  console.log(`:root 定義 ${rootTokens.size} tokens`);

  const themes = parseThemes(themesJs);
  if (!themes) return finalize();
  console.log(`themes.js 載入 ${themes.length} themes`);

  // Check A: theme schema
  const seenIds = new Set();
  for (let i = 0; i < themes.length; i++) {
    const t = themes[i];
    const where = `src/themes.js THEMES[${i}]`;
    if (!t || typeof t !== 'object') {
      pushV('error', 'A-schema', 'theme 不是 object', where);
      continue;
    }
    for (const k of ['id', 'name', 'desc', 'vars']) {
      if (!(k in t)) pushV('error', 'A-schema', `缺欄位 .${k}`, where + ` (id=${t.id || '?'})`);
    }
    if (t.vars && typeof t.vars !== 'object') {
      pushV('error', 'A-schema', '.vars 不是 object', where + ` (id=${t.id || '?'})`);
    }
    if (t.id) {
      if (seenIds.has(t.id)) pushV('error', 'A-schema', `id 重複:${t.id}`, where);
      seenIds.add(t.id);
    }
  }

  // Check B: orphan var override
  for (const t of themes) {
    if (!t.vars || typeof t.vars !== 'object') continue;
    for (const key of Object.keys(t.vars)) {
      if (!rootTokens.has(key)) {
        pushV('error', 'B-orphan',
          `theme "${t.id}" 覆寫 ${key} 但 :root 未定義(typo 或 token 已刪)`,
          'src/themes.js');
      }
    }
  }

  // Check C: undefined var() reference in code(忽略所有引用都帶 CSS fallback 的 token)
  const usages = collectVarUsages();
  for (const [v, entry] of usages.entries()) {
    if (rootTokens.has(v)) continue;
    if (entry.allHaveFallback) continue; // runtime-only 或 fallback safe
    pushV('error', 'C-undef',
      `var(${v}) 引用但 :root 未定義且至少一處無 CSS fallback(${entry.files.size} 處引用,首見 ${[...entry.files][0]})`,
      [...entry.files].slice(0, 3).join(', '));
  }

  // Check D (informational): sparse override
  const tokenInThemes = new Map();
  for (const t of themes) {
    if (t.id === 'default' || !t.vars) continue; // default 空 vars 不算
    for (const k of Object.keys(t.vars)) {
      if (!tokenInThemes.has(k)) tokenInThemes.set(k, new Set());
      tokenInThemes.get(k).add(t.id);
    }
  }
  const sparseToken = [];
  for (const [tok, idSet] of tokenInThemes.entries()) {
    const nonDefault = themes.filter(t => t.id !== 'default').length;
    if (idSet.size > 0 && idSet.size < nonDefault) {
      sparseToken.push({ tok, defined: idSet.size, total: nonDefault });
    }
  }
  if (sparseToken.length) {
    console.log('\n[informational] sparse override(部分 theme 沒覆寫 → 切到時 fallback :root):');
    sparseToken.slice(0, 10).forEach(s => console.log(`  ${s.tok}  ${s.defined}/${s.total} themes`));
    if (sparseToken.length > 10) console.log(`  ...及其他 ${sparseToken.length - 10} 個`);
  }

  return finalize();
}

function finalize() {
  const errors = violations.filter(v => v.level === 'error');
  const report = {
    timestamp: new Date().toISOString(),
    totalViolations: errors.length,
    violations: errors
  };
  fs.writeFileSync(
    path.join(ROOT, 'scripts', 'audit-theme-tokens.report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\n=== theme token integrity audit ===');
  if (errors.length === 0) {
    console.log('✅ PASS — 無 theme schema / orphan override / undefined var 引用');
  } else {
    console.log(`❌ FAIL — ${errors.length} violations`);
    errors.slice(0, 20).forEach(v => {
      console.log(`  [${v.check}] ${v.msg}  @ ${v.where}`);
    });
    if (errors.length > 20) console.log(`  ...及其他 ${errors.length - 20}`);
  }
  console.log('\n→ report: scripts/audit-theme-tokens.report.json');

  process.exit(errors.length === 0 ? 0 : 1);
}

main();
