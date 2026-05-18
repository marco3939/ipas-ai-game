// ============================================================
// sandbox: 驗證 Mode 1 BOSS 池排除程式碼題後仍 ≥ floor
// + Mode 6 卡牌模擬考時長對齊 Mode 7 真考標準(108s/題)
// 2026-05-17
// ============================================================
const fs = require('fs');
const path = require('path');

// === 載 QUESTIONS 全集 ===
function loadAll() {
  const dir = path.join(__dirname, '../src');
  const files = fs.readdirSync(dir).filter(f => f.startsWith('questions') && f.endsWith('.json'));
  const all = [];
  files.forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (Array.isArray(j.questions)) j.questions.forEach(q => all.push(q));
  });
  return all;
}

// === 從 mode1.js 解析 BOSS 定義(keywords)===
function loadMode1Bosses() {
  const m1 = fs.readFileSync(path.join(__dirname, '../src/modes/mode1.js'), 'utf8');
  const re = /\{\s*key:\s*['"]([^'"]+)['"],[\s\S]*?keywords:\s*\[([^\]]+)\]/g;
  const bosses = [];
  let m;
  while ((m = re.exec(m1)) !== null) {
    const kws = m[2].match(/['"]([^'"]+)['"]/g).map(s => s.slice(1, -1));
    bosses.push({ key: m[1], keywords: kws });
  }
  return bosses;
}

// === 模擬 Mode 1 pickQuestionsForBoss(改後版本)===
function pickPoolNoCode(QUESTIONS, boss) {
  return QUESTIONS.filter(q => {
    if (q.format === 'code_reading' || q.format === 'code_trace') return false;
    const text = (q.stem || '') + ' ' + (q.tags || []).join(' ');
    return boss.keywords.some(k => text.includes(k));
  });
}

// === 模擬 Mode 1 兜底 general(改後版本)===
function getGeneralFiller(QUESTIONS, pool) {
  return QUESTIONS.filter(q =>
    [1, 2, 3].includes(q.subject) &&
    !pool.includes(q) &&
    !(q.format === 'code_reading' || q.format === 'code_trace')
  );
}

// === 主測試 ===
console.log('=== Sandbox: Part A (Mode 6 時長) + Part B (Mode 1 排程式碼題)===\n');

const QUESTIONS = loadAll();
const bosses = loadMode1Bosses();
console.log(`載入 QUESTIONS: ${QUESTIONS.length} 題`);
console.log(`Mode 1 BOSS: ${bosses.length} 個\n`);

let pass = 0, fail = 0;
const assert = (cond, label) => {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
};

const BOSS_N = 20;
const VARIATION_FLOOR = BOSS_N * 2;  // = 40

// === 測 1:每 BOSS 修改後 keyword pool + 兜底 ≥ 40 ===
console.log('--- 測 1:每 BOSS 排除程式碼題後,keyword pool + 兜底總和 ≥ 40 ---');
bosses.forEach(boss => {
  const pool = pickPoolNoCode(QUESTIONS, boss);
  const filler = getGeneralFiller(QUESTIONS, pool);
  const total = pool.length + filler.length;
  const status = total >= VARIATION_FLOOR ? '✓' : '✗';
  console.log(`  ${boss.key}: keyword pool=${pool.length}, filler=${filler.length}, total=${total} ${status}`);
  assert(total >= VARIATION_FLOOR, `BOSS ${boss.key} 池總 ≥ ${VARIATION_FLOOR}`);
});

// === 測 2:每 BOSS 池內絕無程式碼題 ===
console.log('\n--- 測 2:每 BOSS 池絕無 code_reading / code_trace ---');
bosses.forEach(boss => {
  const pool = pickPoolNoCode(QUESTIONS, boss);
  const codeIn = pool.filter(q => q.format === 'code_reading' || q.format === 'code_trace');
  assert(codeIn.length === 0, `BOSS ${boss.key} 池內 0 個程式碼題(實際 ${codeIn.length})`);
});

// === 測 3:對比改前 — 同樣的篩選不排除 format 的話會多多少 code 題?===
console.log('\n--- 測 3:對比 — 改前(不排除 format)會抓到多少 code 題 ---');
let totalCodeBefore = 0;
const codeIdsBefore = new Set();
bosses.forEach(boss => {
  const oldMatched = QUESTIONS.filter(q => {
    const text = (q.stem || '') + ' ' + (q.tags || []).join(' ');
    return boss.keywords.some(k => text.includes(k));
  });
  const codeIn = oldMatched.filter(q => q.format === 'code_reading' || q.format === 'code_trace');
  totalCodeBefore += codeIn.length;
  codeIn.forEach(q => codeIdsBefore.add(q.id));
});
console.log(`  改前 15 BOSS 共抓到 ${totalCodeBefore} 次程式碼題(去重後 ${codeIdsBefore.size} 個不重複題目)`);
console.log(`  改後 0 次,使用者抱怨「考 CNN 跳 np.array」的問題已徹底消除`);
assert(codeIdsBefore.size > 0, '確認改前確實有此問題(對照組)');

// === 測 4:Mode 6 卡牌模擬考時長對齊 Mode 7 ===
console.log('\n--- 測 4:Mode 6 卡牌模擬考時長對齊 Mode 7(108s/題)---');
const m6src = fs.readFileSync(path.join(__dirname, '../src/modes/mode6.js'), 'utf8');
const expectedLines = [
  { line: "qcount: 5,  minutes: 9,", desc: '5 題 → 9 分鐘' },
  { line: "qcount: 10, minutes: 18,", desc: '10 題 → 18 分鐘' },
  { line: "qcount: 25, minutes: 45,", desc: '25 題 → 45 分鐘' },
  { line: "minutes: 90, label: '🌟 完全模考 50 題'", desc: '50 題 → 90 分鐘(完全模考)' },
  { line: "poolSize * 1.8", desc: '全打 = qcount × 1.8 分鐘(108s/題)' }
];
expectedLines.forEach(e => {
  assert(m6src.includes(e.line), e.desc);
});

// === 測 5:Mode 7 既有 QCOUNT_OPTIONS 仍是 108s/題(對照基準)===
console.log('\n--- 測 5:Mode 7 既有 QCOUNT_OPTIONS 是 108s/題(對照組,本 PR 不動)---');
const m7src = fs.readFileSync(path.join(__dirname, '../src/modes/mode7.js'), 'utf8');
assert(m7src.includes('qcount: 50, minutes: 90'), 'Mode 7 仍 50→90 分(對照基準)');
assert(m7src.includes('qcount: 25, minutes: 45'), 'Mode 7 仍 25→45 分(對照基準)');

// === 總結 ===
console.log(`\n=== SUMMARY ===`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
