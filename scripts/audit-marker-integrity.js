// ============================================================
// audit-marker-integrity.js — _helpers.js source-code marker 字串完整性檢查
// 2026-05-19:防止再次發生 PR #44 漏改 srs-drill-review/_helpers.js marker
//
// 原理:
//   scripts/audit-tests/<dir>/_helpers.js 內用「字串 marker」精確匹配
//   src/index.html(或 src/modes/*.js / src/sm2.js)抽 source code 進 vm sandbox。
//   一旦 src 改動(函式簽名、區段註解標頭)而 helper 漏改 → marker 找不到 → test fail。
//
// 此 audit:
//   1) scan 所有 scripts/audit-tests/*/_helpers.js
//   2) regex 抽 marker 字串 literal(函式/方法/const 簽名、`// === ... ===` 區段註解)
//   3) 每個 marker 必能在 src/index.html / src/modes/*.js / src/sm2.js 任一檔 includes() 到
//   4) 找不到 → 違規列出 helper:marker
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const AUDIT_TESTS = path.join(ROOT, 'scripts', 'audit-tests');

// ----- 1) collect source files -----
function collectSources() {
  const files = [];
  files.push(path.join(SRC, 'index.html'));
  const modesDir = path.join(SRC, 'modes');
  if (fs.existsSync(modesDir)) {
    for (const f of fs.readdirSync(modesDir)) {
      if (f.endsWith('.js')) files.push(path.join(modesDir, f));
    }
  }
  // 其他 root src js(sm2.js 等)
  for (const f of fs.readdirSync(SRC)) {
    if (f.endsWith('.js')) files.push(path.join(SRC, f));
  }
  // 讀全部
  return files.map(p => ({ path: p, content: fs.readFileSync(p, 'utf8') }));
}

// ----- 2) collect helper files -----
function collectHelpers() {
  const out = [];
  if (!fs.existsSync(AUDIT_TESTS)) return out;
  for (const dir of fs.readdirSync(AUDIT_TESTS)) {
    const helperPath = path.join(AUDIT_TESTS, dir, '_helpers.js');
    if (fs.existsSync(helperPath)) {
      out.push({ dir, path: helperPath, content: fs.readFileSync(helperPath, 'utf8') });
    }
  }
  return out;
}

// ----- 3) marker 抽取 -----
// 只抓「呼叫 marker-consuming function 時傳入的字串參數」。
// 已知 marker-consuming function(從 5 個 _helpers.js grep 出來):
//   injectBlock(sandbox, src, START, END)
//   sliceConst(src, START, END)
//   sliceFunction(src, START, END)
//   src.indexOf(MARKER)  ← 也偶爾出現
//
// 策略:用 regex 抓「<callee>(... 'X' ... 'Y' ...)」中所有 single/double quoted literal
//      (不跨多行,marker 都是 single-line)。
function extractMarkers(helperSrc) {
  const markers = new Set();

  // 抓「 callee(...) 」整段(非貪婪,單行),callee 為已知 marker-consuming function
  // 注意:helper 內呼叫形式都在一行(看過 5 個檔)
  const callRe = /(?:injectBlock|sliceConst|sliceFunction)\s*\(([^)]*)\)/g;
  let m;
  while ((m = callRe.exec(helperSrc)) !== null) {
    const argText = m[1];
    // 抽 arg 內所有 quoted literal
    const litRe = /(['"])((?:\\.|(?!\1).)*?)\1/g;
    let lm;
    while ((lm = litRe.exec(argText)) !== null) {
      const s = lm[2];
      if (!s) continue;
      // 必符合 source marker 樣式之一(避免誤抓 sandbox / variable name 等)
      const isFnSig = /^(function|const|var|let)\s+[A-Za-z_$][\w$]*/.test(s);
      const isSectionHeader = /^\/\/\s*===/.test(s);
      const isWindowAssign = /^window\.[A-Za-z_$][\w$]*\s*=/.test(s);
      if (!(isFnSig || isSectionHeader || isWindowAssign)) continue;
      markers.add(s);
    }
  }
  return Array.from(markers);
}

// ----- 4) check marker against all sources -----
function findMarker(marker, sources) {
  for (const src of sources) {
    if (src.content.includes(marker)) return src.path;
  }
  return null;
}

// ============================================================
// main
// ============================================================
const sources = collectSources();
const helpers = collectHelpers();

console.log('=== audit-marker-integrity ===');
console.log('Source files scanned: ' + sources.length);
console.log('Helper files: ' + helpers.length);

let totalMarkers = 0;
const missing = []; // { helper, marker }
const perHelper = []; // { helper, markers, missing }

for (const h of helpers) {
  const markers = extractMarkers(h.content);
  totalMarkers += markers.length;
  const helperMissing = [];
  for (const mk of markers) {
    const found = findMarker(mk, sources);
    if (!found) {
      helperMissing.push(mk);
      missing.push({ helper: path.relative(ROOT, h.path), marker: mk });
    }
  }
  perHelper.push({
    helper: path.relative(ROOT, h.path),
    markersFound: markers.length,
    missingCount: helperMissing.length,
  });
  console.log(`  ${path.relative(ROOT, h.path)}: ${markers.length} markers (${helperMissing.length} missing)`);
}

console.log('\nMarkers found: ' + totalMarkers);
console.log('Missing in source: ' + missing.length);

if (missing.length > 0) {
  console.log('\nViolations:');
  for (const v of missing) {
    console.log('  ✗ ' + v.helper + ': ' + JSON.stringify(v.marker));
  }
}

// ----- 寫 report -----
const reportPath = path.join(ROOT, 'scripts', 'audit-marker-integrity.report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  summary: {
    sourceFileCount: sources.length,
    helperFileCount: helpers.length,
    totalMarkers,
    missingCount: missing.length,
  },
  perHelper,
  violations: missing,
}, null, 2));
console.log('\n→ report: scripts/audit-marker-integrity.report.json');

if (missing.length > 0) {
  console.log('\n❌ FAIL — 詳見 report');
  process.exit(1);
} else {
  console.log('\n✅ PASS');
  process.exit(0);
}
