// ============================================================
// sandbox: 方案 A — Mode 6/7 排除 code_trace 題
// 2026-05-18
// ============================================================
const fs = require('fs');
const path = require('path');

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

console.log('=== Sandbox: 方案 A code_trace 排除驗證 ===\n');
const QUESTIONS = loadAll();
console.log('題庫全集: ' + QUESTIONS.length);

let pass = 0, fail = 0;
const assert = (cond, label) => {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
};

// === T1: code_trace 題確實存在(對照)===
console.log('\n--- T1: code_trace 題在全集存在 ---');
const traceQs = QUESTIONS.filter(q => q.format === 'code_trace');
console.log(`  code_trace 題: ${traceQs.length} 題`);
assert(traceQs.length >= 30, 'code_trace 題 ≥ 30(目前 57)');

// === T2: 模擬 Mode 7 _buildPool 排除 code_trace ===
console.log('\n--- T2: Mode 7 _buildPool 排除 code_trace ---');
const m7all = QUESTIONS.filter(q => q && q.id && q.options && q.format !== 'code_trace');
const m7trace = m7all.filter(q => q.format === 'code_trace');
console.log(`  Mode 7 池: ${m7all.length} 題(含 code_trace: ${m7trace.length})`);
assert(m7trace.length === 0, 'Mode 7 池內 0 個 code_trace');

// === T3: 模擬 Mode 6 卡牌模擬考 — 對 L23103 過濾(L23103 含大量 code_trace 題)===
console.log('\n--- T3: Mode 6 對 L23103 過濾後池 ---');
const m6pool = QUESTIONS.filter(q =>
  q && q.knowledge_code === 'L23103' && q.format !== 'code_trace'
);
const m6trace = m6pool.filter(q => q.format === 'code_trace');
console.log(`  L23103 池(改後): ${m6pool.length} 題(含 code_trace: ${m6trace.length})`);
assert(m6trace.length === 0, 'L23103 池內 0 個 code_trace');

// === T4: 對比 — 改前 vs 改後 L23103 池大小 ===
console.log('\n--- T4: L23103 池對比(看排除多少 code_trace)---');
const oldPool = QUESTIONS.filter(q => q && q.knowledge_code === 'L23103');
console.log(`  改前 L23103 池: ${oldPool.length} 題`);
console.log(`  改後 L23103 池: ${m6pool.length} 題`);
console.log(`  排除 code_trace: ${oldPool.length - m6pool.length} 題`);
assert(oldPool.length - m6pool.length > 0, '確實排除了一些 code_trace');

// === T5: Mode 7 全餐 50 題仍有足夠題池 ===
console.log('\n--- T5: Mode 7 全餐 50 題池子充裕 ---');
console.log(`  Mode 7 池: ${m7all.length} 題,50 題場可選池 = ${m7all.length} 題`);
assert(m7all.length >= 50, 'Mode 7 池 ≥ 50');
assert(m7all.length >= 500, 'Mode 7 池 >> 50(充裕)');

// === T6: code_trace 題仍存在於 Mode 8 道場(不受影響)===
console.log('\n--- T6: code_trace 題仍可在 Mode 8 道場玩到(Mode 8 篩 format=code_trace)---');
const mode8Pool = QUESTIONS.filter(q => q.format === 'code_trace');
console.log(`  Mode 8 trace 池: ${mode8Pool.length} 題`);
assert(mode8Pool.length === traceQs.length, 'Mode 8 池 = 全集 code_trace 數');

// === T7: 確認 mode7.js / mode6.js 都加了排除條件 ===
console.log('\n--- T7: 程式碼確認 ---');
const m7src = fs.readFileSync(path.join(__dirname, '../src/modes/mode7.js'), 'utf8');
const m6src = fs.readFileSync(path.join(__dirname, '../src/modes/mode6.js'), 'utf8');
assert(m7src.includes("q.format !== 'code_trace'"), 'mode7.js _buildPool 含排除條件');
assert(m6src.includes("q.format !== 'code_trace'"), 'mode6.js startMockExam pool 含排除條件');

console.log(`\n=== SUMMARY ===`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
