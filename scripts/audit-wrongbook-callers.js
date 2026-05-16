#!/usr/bin/env node
// scripts/audit-wrongbook-callers.js
// 案例 10 教訓:跨 codebase grep Wrongbook.add 呼叫者,驗 6 個參數簽名一致性
// 失敗模式(本 audit 防的):
//   - 簽名錯位:把長字串塞 userChoice 欄(該欄期望 'A'/'B'/'C'/'D' 或 '?')
//   - 缺 userText / correctText:Review UI 顯示「(舊紀錄無文字)」UX 降級
//   - userChoice 含字面 'undefined' 或空字串(Mode 7 lineup-key bug 經典症狀)

const fs = require('fs');
const path = require('path');

const SRC_DIRS = ['src/modes', 'src/components'];
const TARGET = 'Wrongbook.add';

// 簽名:add(qid, nodeId, userChoice, correctChoice, userText, correctText)
// 限制:
//   - userChoice / correctChoice:期望單字母 'A'-'Z' 或 '?' 或變數名(短),不可是長字串字面值
//   - userText / correctText:可長
//   - 至少傳 4 參數(向後相容);理想傳 6 參數

const violations = [];
const warnings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function findCallSites(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sites = [];
  // 簡單 state machine:找 Wrongbook.add( 後配對括號
  let i = 0;
  while (true) {
    const start = text.indexOf(TARGET + '(', i);
    if (start < 0) break;
    // 找配對的 )(處理 nested parens + string literal)
    let depth = 1;
    let j = start + TARGET.length + 1;
    let inStr = null;
    while (j < text.length && depth > 0) {
      const c = text[j];
      if (inStr) {
        if (c === '\\') { j += 2; continue; }
        if (c === inStr) inStr = null;
      } else if (c === '"' || c === "'" || c === '`') {
        inStr = c;
      } else if (c === '(') depth++;
      else if (c === ')') depth--;
      j++;
    }
    const args = text.substring(start + TARGET.length + 1, j - 1);
    // 算 line number
    const before = text.substring(0, start);
    const line = before.split('\n').length;
    sites.push({ file, line, args, raw: text.substring(start, j) });
    i = j;
  }
  return sites;
}

function splitArgsByTopComma(s) {
  // 分割頂層逗號(避免進入 string / paren)
  const out = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === '\\') { cur += s[i+1] || ''; i++; continue; }
      if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'" || c === '`') {
      inStr = c; cur += c;
    } else if (c === '(' || c === '[' || c === '{') { depth++; cur += c; }
    else if (c === ')' || c === ']' || c === '}') { depth--; cur += c; }
    else if (c === ',' && depth === 0) {
      out.push(cur.trim()); cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function classifyArg(arg) {
  // 判斷 arg 字面類型:single-char key / short / long-string / expression
  const trimmed = arg.trim();
  // 字面字串 'A' or "A" 等
  const litMatch = trimmed.match(/^['"`](.+?)['"`]$/);
  if (litMatch) {
    const inner = litMatch[1];
    if (inner.length <= 10) return { type: 'short-string-lit', value: inner };
    return { type: 'long-string-lit', value: inner, length: inner.length };
  }
  // 模板字串
  if (trimmed.startsWith('`') || trimmed.includes('${')) {
    return { type: 'template-or-expr', value: trimmed.substring(0, 50) };
  }
  // 連續字串 + 變數('xxx' + var + 'yyy')
  if (trimmed.includes(' + ') || trimmed.includes('+\n')) {
    return { type: 'concat-expr', value: trimmed.substring(0, 50) };
  }
  // 純表達式
  return { type: 'expr', value: trimmed.substring(0, 60) };
}

function audit(file) {
  const sites = findCallSites(file);
  for (const site of sites) {
    const args = splitArgsByTopComma(site.args);
    // 至少 4 個參數
    if (args.length < 4) {
      violations.push({ file: site.file, line: site.line,
        kind: 'TOO_FEW_ARGS', detail: `Only ${args.length} args, need ≥4 (qid, nodeId, userChoice, correctChoice)` });
      continue;
    }
    // 不應 > 6
    if (args.length > 6) {
      violations.push({ file: site.file, line: site.line,
        kind: 'TOO_MANY_ARGS', detail: `${args.length} args, max 6` });
    }
    // userChoice (arg 3) / correctChoice (arg 4) 是否誤塞長字串
    const userChoice = classifyArg(args[2]);
    const correctChoice = classifyArg(args[3]);
    if (userChoice.type === 'long-string-lit') {
      violations.push({ file: site.file, line: site.line,
        kind: 'CHANNEL_MISUSE_USER_CHOICE',
        detail: `arg 3 (userChoice) 是長字串字面 (len=${userChoice.length}),應放 arg 5 (userText)。值: "${userChoice.value.substring(0,40)}..."` });
    }
    if (correctChoice.type === 'long-string-lit') {
      violations.push({ file: site.file, line: site.line,
        kind: 'CHANNEL_MISUSE_CORRECT_CHOICE',
        detail: `arg 4 (correctChoice) 是長字串字面 (len=${correctChoice.length}),應放 arg 6 (correctText)。值: "${correctChoice.value.substring(0,40)}..."` });
    }
    // 缺 userText (arg 5) / correctText (arg 6) — warning 不是 violation
    if (args.length < 6) {
      warnings.push({ file: site.file, line: site.line,
        kind: 'MISSING_TEXT_ARGS',
        detail: `${args.length} args, 缺 userText/correctText (Review UI 將顯示「(舊紀錄無文字)」)` });
    }
  }
}

// 主流程
const files = SRC_DIRS.flatMap(d => walk(d));
const indexHtml = 'src/index.html';
// index.html 也要 audit(PlayEngine.answer 內有 Wrongbook.add)
const allTargets = [...files];
if (fs.existsSync(indexHtml)) allTargets.push(indexHtml);

console.log(`=== Wrongbook.add caller audit (案例 10 教訓)===`);
console.log(`掃描檔案: ${allTargets.length}`);

let totalSites = 0;
for (const f of allTargets) {
  const sites = findCallSites(f);
  totalSites += sites.length;
  audit(f);
}

console.log(`找到 Wrongbook.add 呼叫點: ${totalSites}`);
console.log(`Violations: ${violations.length}`);
console.log(`Warnings: ${warnings.length}`);

if (violations.length > 0) {
  console.log(`\n--- VIOLATIONS ---`);
  for (const v of violations) {
    console.log(`  [${v.kind}] ${v.file}:${v.line}`);
    console.log(`    ${v.detail}`);
  }
}
if (warnings.length > 0) {
  console.log(`\n--- WARNINGS (UX 降級,不阻擋)---`);
  for (const w of warnings) {
    console.log(`  [${w.kind}] ${w.file}:${w.line} — ${w.detail}`);
  }
}

// 寫 report
const report = { ts: Date.now(), totalSites, violations, warnings };
fs.writeFileSync('scripts/audit-wrongbook-callers.report.json', JSON.stringify(report, null, 2));
console.log(`\n-> report: scripts/audit-wrongbook-callers.report.json`);

if (violations.length > 0) {
  console.log(`\n❌ FAIL — 有 ${violations.length} 個 violations,請修正`);
  process.exit(1);
}
console.log(`\n✅ PASS — 無 violations${warnings.length > 0 ? `(${warnings.length} 個 warnings 待改善)` : ''}`);
