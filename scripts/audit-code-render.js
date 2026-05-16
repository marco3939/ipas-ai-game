// audit-code-render.js — 對所有 code_block / trace_steps code_block 跑 3 個 highlight 函數,掃 broken HTML
//
// 2026-05-11:ChatGPT 在 q_pa_014 截圖中發現 `class="str">'region'` 渲染污染 — 根因是
// highlight 函數的 keyword list 包含 'class',跟自己產生的 <span class="str"> 屬性自咬。
// 已修 index.html / mode1.js / mode5.js 三處重複函數。
// 本 audit 強制保證:未來任何 highlight 改動都會被跨檔規線檢查。
//
// 用法:node scripts/audit-code-render.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

// === 抽出 3 個 highlight 函數 ===
function extractFn(filePath, fnName) {
  const html = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp('function ' + fnName + '[\\s\\S]*?\\n\\s*\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error('FN NOT FOUND: ' + fnName + ' in ' + filePath);
  return m[0];
}

const fn1 = extractFn(path.join(SRC_DIR, 'index.html'), 'highlightCodeSimple');
const fn2 = extractFn(path.join(SRC_DIR, 'modes', 'mode1.js'), 'highlightCode');
const fn3 = extractFn(path.join(SRC_DIR, 'modes', 'mode5.js'), 'highlightCode');

const fns = {
  'index.html:highlightCodeSimple': new Function(fn1 + '; return highlightCodeSimple;')(),
  'mode1.js:highlightCode': new Function(fn2 + '; return highlightCode;')(),
  'mode5.js:highlightCode': new Function(fn3 + '; return highlightCode;')(),
};

// === 收集所有 code_block ===
const Q_FILES = fs.readdirSync(SRC_DIR).filter(f => f.startsWith('questions') && f.endsWith('.json'));
const targets = [];
for (const f of Q_FILES) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
  const list = data.questions || data;
  if (!Array.isArray(list)) continue;
  for (const q of list) {
    if (typeof q.code_block === 'string' && q.code_block.length > 0) {
      // 為動態題模擬 case 替換(只試 case_a)
      let code = q.code_block;
      if (q.stem_variables && q.stem_variables.case_a) {
        for (const [k, v] of Object.entries(q.stem_variables.case_a)) {
          code = code.replaceAll('{' + k + '}', String(v));
        }
      }
      targets.push({ file: f, id: q.id, code, source: 'code_block' });
    }
    // Mode 8 trace_steps 也有 code_block 渲染
    if (Array.isArray(q.trace_steps)) {
      for (let i = 0; i < q.trace_steps.length; i++) {
        const step = q.trace_steps[i];
        if (typeof step.code === 'string') {
          targets.push({ file: f, id: q.id + '/step' + i, code: step.code, source: 'trace_step.code' });
        }
      }
    }
  }
}

// === 對每個 target × 每個 fn 跑 + 掃 broken pattern ===
// Broken patterns 偵測:
//   1. <span <span — 巢狀 tag 開頭(必壞)
//   2. </span></span></span> 連續 ≥4 個(可能過度 wrap)
//   3. 出現未配對 <span 或 </span>(計數不平衡)
//   4. 屬性名出現在 wrap 內(如 `class="kw">class</span>="str">`)
const BROKEN_PATTERNS = [
  { name: 'nested-span-open', regex: /<span <span/g, severity: 'critical' },
  { name: 'class-attr-fragment', regex: /<span [^>]*>class<\/span>="/g, severity: 'critical' },
  { name: 'orphan-attr-value', regex: /\bclass="\w+">/g, severity: 'warn' },  // 任何 `class="...">` 字面文字洩漏(瀏覽器將顯示)
];

function countTags(s, tag) {
  const open = (s.match(new RegExp('<' + tag + '\\b', 'g')) || []).length;
  const close = (s.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  return { open, close, balanced: open === close };
}

const violations = [];
let totalRuns = 0;

for (const t of targets) {
  for (const [fnLabel, fn] of Object.entries(fns)) {
    totalRuns++;
    let out;
    try { out = fn(t.code); } catch (e) {
      violations.push({ ...t, fn: fnLabel, type: 'FN_THROW', detail: e.message });
      continue;
    }
    // Pattern checks
    for (const p of BROKEN_PATTERNS) {
      const ms = out.match(p.regex);
      if (ms && ms.length > 0) {
        // 對 orphan-attr-value pattern,排除「在 <span ...> 正常屬性 context」的合法情況
        if (p.name === 'orphan-attr-value') {
          // 計算文字內 `class="..."` 出現次數 vs <span 開頭數量
          // 若一致表示都是合法 attribute,不報
          const classAttrs = (out.match(/\bclass="\w+">/g) || []).length;
          const spanOpens = (out.match(/<span class="\w+">/g) || []).length;
          if (classAttrs === spanOpens) continue;  // 全部 class="..." 都跟在 <span 後,合法
        }
        violations.push({
          file: t.file, id: t.id, source: t.source, fn: fnLabel,
          type: p.name, severity: p.severity, count: ms.length, samples: ms.slice(0, 3)
        });
      }
    }
    // Tag balance
    const sp = countTags(out, 'span');
    if (!sp.balanced) {
      violations.push({
        file: t.file, id: t.id, source: t.source, fn: fnLabel,
        type: 'span-tag-unbalanced', severity: 'critical',
        detail: '<span> open=' + sp.open + ' close=' + sp.close
      });
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  summary: {
    fns_audited: Object.keys(fns),
    codeBlocksScanned: targets.length,
    totalRuns,
    violations: violations.length
  },
  violations
};

fs.writeFileSync(path.join(__dirname, 'audit-code-render.report.json'), JSON.stringify(report, null, 2));

console.log('=== code-render audit ===');
console.log('functions audited: ' + Object.keys(fns).join(', '));
console.log('code_blocks scanned: ' + targets.length + ' (' + totalRuns + ' total renders across 3 fns)');
console.log('violations: ' + violations.length);

if (violations.length > 0) {
  console.log('--- violations ---');
  for (const v of violations.slice(0, 30)) {
    console.log('  [' + v.severity + '] ' + v.file + ':' + v.id + ' via ' + v.fn + ' — ' + v.type + (v.count ? ' (×' + v.count + ')' : '') + (v.detail ? ' — ' + v.detail : ''));
    if (v.samples) console.log('    samples: ' + v.samples.join(' | '));
  }
  if (violations.length > 30) console.log('  ... +' + (violations.length - 30) + ' more');
  process.exit(1);
}
console.log('PASS — all code_block rendered cleanly through all 3 highlight functions');
process.exit(0);
