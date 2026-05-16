#!/usr/bin/env node
// scripts/audit-mode-flow.js
// 案例 10 教訓:mock 整個 Mode 7 流程,驗 state.answers[i].isCorrect / correctKey 在
// 各 commit point 都不是 false / undefined / '' (因 lineup.q.options 無 key 而對不上)
//
// 涵蓋路徑:
//   1. _drawQuestions → state.lineup 建立(item.q = QUESTIONS 原版,無洗牌後 key)
//   2. _showCurrentQuestion → renderQuestion 洗牌 → cache item._rendered
//   3. submitCurrent / submitMock / _timeUp → _autoLockDrafts → _getRendered 取 key
//   4. _commitToSharedLayer 寫 Wrongbook(用 _rendered text)
//   5. _saveHistory fullLog snapshot(用 _rendered options)
//
// 本 audit 對 mode7.js 做 static analysis + 對「典型題目結構」mock 渲染流程,驗 invariant

const fs = require('fs');
const path = require('path');

const MODE7 = 'src/modes/mode7.js';
const violations = [];

// 1) 靜態檢查:確認 _getRendered helper 存在 + 9 處消費點都用它
function checkStaticUsages() {
  const text = fs.readFileSync(MODE7, 'utf8');
  // helper 必存
  if (!/_getRendered\s*\(item\)\s*{/.test(text)) {
    violations.push({ kind: 'NO_HELPER', detail: 'mode7.js 缺 _getRendered(item) helper' });
    return;
  }
  // 找所有 `state.lineup[...].q.options` 或 `item.q.options` (不該再有 — 應該都改用 _getRendered)
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 排除註解
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    // 找 .options.find(o => o.key === ...) 或 .options || []).find(o.key
    // 必須在最近 5 行內見到 _getRendered 或 PlayEngine.current
    if (/\.options\b.*\.find.*o\.key\s*===/.test(line) ||
        /\.options\b.*\.find.*key\s*===/.test(line)) {
      // 看前 5 行 + 自身
      const window = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      if (!/_getRendered|PlayEngine\.current|this\.current\.options|renderedQ/.test(window)) {
        violations.push({
          kind: 'RAW_OPTIONS_KEY_LOOKUP',
          line: i + 1,
          detail: `Possible raw q.options key lookup (沒 _getRendered guard): ${line.trim().substring(0, 80)}`
        });
      }
    }
  }
}

// 2) 動態 mock:模擬 renderQuestion 行為,驗證 cache + 取 key 流程
function mockRenderQuestion(q) {
  // 模擬 index.html renderQuestion:洗牌(這裡 deterministic 排序避免 random)+ 指派 A/B/C/D
  const rendered = JSON.parse(JSON.stringify(q));
  if (rendered.shuffle_options !== false) {
    // 簡單反轉模擬洗牌
    rendered.options = rendered.options.slice().reverse();
  }
  rendered.options = rendered.options.map((o, i) => ({ ...o, key: String.fromCharCode(65 + i) }));
  return rendered;
}

function mockMode7Flow() {
  // 模擬一個典型題目
  const sampleQ = {
    id: 'q_test_001',
    node_id: 'n_test_001',
    knowledge_code: 'L21101',
    stem: '測試題',
    options: [
      { text: '正解選項', is_correct: true },
      { text: '錯解 1' },
      { text: '錯解 2' },
      { text: '錯解 3' }
    ]
  };

  // 1) lineup 建立(原版 q,無 key)
  const item = { q: sampleQ, npcIdx: 0 };
  // 檢查原版確實無 key
  if (item.q.options.some(o => o.key !== undefined)) {
    violations.push({ kind: 'MOCK_INVARIANT_FAIL', detail: 'mock 假設失敗:原版 q.options 不該有 key' });
    return;
  }

  // 2) _showCurrentQuestion 模擬:渲染並 cache
  item._rendered = mockRenderQuestion(item.q);

  // 3) 模擬使用者選 'A'(在洗牌後 == 最後一個原 option)
  const draftUserKey = 'A';

  // 4) 模擬 _getRendered + 取 key
  const renderedQ = item._rendered || item.q;
  const rOpts = renderedQ.options;
  const opt = rOpts.find(o => o.key === draftUserKey);
  const isCorrect = !!(opt && opt.is_correct);
  const correctOpt = rOpts.find(o => o.is_correct);
  const correctKey = correctOpt ? correctOpt.key : '';

  // Invariants:
  if (opt === undefined) {
    violations.push({ kind: 'OPT_UNDEFINED', detail: `_rendered.options.find(o.key === 'A') 應該找到,但 undefined` });
  }
  if (typeof isCorrect !== 'boolean') {
    violations.push({ kind: 'ISCORRECT_NOT_BOOL', detail: `isCorrect 應是 boolean,實際: ${typeof isCorrect}` });
  }
  if (correctKey === '' || correctKey === undefined) {
    violations.push({ kind: 'CORRECTKEY_EMPTY', detail: `correctKey 應是 'A'/'B'/'C'/'D',實際: '${correctKey}'` });
  }
  // 反向驗證:如果不用 _rendered,fallback 原版會壞
  const rawOpts = item.q.options;
  const rawOpt = rawOpts.find(o => o.key === draftUserKey);
  const rawCorrectKey = (rawOpts.find(o => o.is_correct) || {}).key || '';
  if (rawOpt !== undefined) {
    violations.push({ kind: 'BUG_ASSUMPTION_BROKEN', detail: '預期原版 q.options 無 key 找不到,但找到了 — 是否 renderQuestion 行為改了?' });
  }
  if (rawCorrectKey !== '') {
    violations.push({ kind: 'BUG_ASSUMPTION_BROKEN', detail: '預期原版 correctOpt.key 是 undefined 變空字串,但實際: ' + rawCorrectKey });
  }
}

// 3) 對 fullLog snapshot 結構檢查:確認 _saveHistory 內有處理 _rendered fallback
function checkFullLogSnapshot() {
  const text = fs.readFileSync(MODE7, 'utf8');
  // 找 _saveHistory function definition(不是 call site)
  const idx = text.indexOf('_saveHistory(result) {');
  if (idx < 0) {
    violations.push({ kind: 'NO_SAVE_HISTORY', detail: 'mode7.js 缺 _saveHistory(result) 函式定義' });
    return;
  }
  // 截取 _saveHistory function body
  const body = text.substring(idx, idx + 3000);
  // 必須含 _getRendered 或 _rendered 或 renderedQ
  if (!/_getRendered|item\._rendered|renderedQ/.test(body)) {
    violations.push({ kind: 'SAVE_HISTORY_NO_RENDERED', detail: '_saveHistory 未引用 _rendered/_getRendered,可能仍存原版 options snapshot' });
  }
  // 必須含 options: 寫入(snapshot)
  if (!/options:\s*\(/.test(body)) {
    violations.push({ kind: 'SAVE_HISTORY_NO_OPTIONS_SNAPSHOT', detail: '_saveHistory 似乎沒寫 options snapshot' });
  }
}

// 主流程
console.log(`=== Mode 7 flow audit (案例 10 lineup-key bug regression check)===`);

checkStaticUsages();
mockMode7Flow();
checkFullLogSnapshot();

console.log(`Violations: ${violations.length}`);
if (violations.length > 0) {
  console.log(`\n--- VIOLATIONS ---`);
  for (const v of violations) {
    console.log(`  [${v.kind}]${v.line ? ' L' + v.line : ''}: ${v.detail}`);
  }
}

const report = { ts: Date.now(), violations };
fs.writeFileSync('scripts/audit-mode-flow.report.json', JSON.stringify(report, null, 2));
console.log(`\n-> report: scripts/audit-mode-flow.report.json`);

if (violations.length > 0) {
  console.log(`\n❌ FAIL — 有 ${violations.length} 個 violations`);
  process.exit(1);
}
console.log(`\n✅ PASS — Mode 7 flow invariants 全部通過`);
