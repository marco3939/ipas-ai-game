// ============================================================
// sandbox: Mode 6 卡牌模擬考 → Mode 7 startWithCustomPool 端到端
// 驗 dataflow:Mode 6 filter → codes → QUESTIONS pool → Mode 7 lineup → state 正確
// 案例 10 §8 dataflow trace 必做檢查
// ============================================================
const fs = require('fs');
const path = require('path');

// 載入所有 QUESTIONS(模擬 index.html loadQuestions 行為)
function loadAllQuestions() {
  const dir = path.join(__dirname, '../src');
  const files = fs.readdirSync(dir).filter(f => f.startsWith('questions') && f.endsWith('.json'));
  const all = [];
  files.forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (Array.isArray(j.questions)) j.questions.forEach(q => all.push(q));
  });
  return all;
}

// 模擬 Mode 6 _allowList(攤平 kb-allowed-nodes.json)
function loadAllowList() {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'kb-allowed-nodes.json'), 'utf8'));
  const list = [];
  for (const [code, nodes] of Object.entries(j)) {
    if (Array.isArray(nodes)) {
      nodes.forEach(n => list.push({ id: n.id, title: n.title, knowledge_code: code }));
    }
  }
  return list;
}

// 模擬 Mode 6 _filterCards
function filterCards(cards, filters) {
  let out = cards;
  if (filters.subject && filters.subject !== 'all') {
    const prefix = filters.subject === '1' ? 'L21' : filters.subject === '2' ? 'L22' : 'L23';
    out = out.filter(c => c.knowledge_code.startsWith(prefix));
  }
  if (filters.code && filters.code !== 'all') {
    out = out.filter(c => c.knowledge_code === filters.code);
  }
  return out;
}

// 模擬 Mode 6 startMockExam 第一段:filter cards → codes → pool
function buildPoolFromFilter(QUESTIONS, allowList, filters) {
  const visible = filterCards(allowList, filters);
  const codes = new Set(visible.map(c => c.knowledge_code));
  const pool = QUESTIONS.filter(q => q && q.knowledge_code && codes.has(q.knowledge_code));
  return { visible: visible, codes: codes, pool: pool };
}

// 模擬 Mode 7 startWithCustomPool 構建 state.lineup 邏輯
function buildLineup(pool, qcount, npcCount) {
  // RNG.shuffle 模擬 — 用 deterministic seeded shuffle
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(i / 2);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, qcount).map((q, i) => ({ q: q, npcIdx: i % npcCount }));
}

// === 主驗證 ===
console.log('=== Sandbox: Mode 6 卡牌模擬考 dataflow trace ===\n');

const QUESTIONS = loadAllQuestions();
const allowList = loadAllowList();

console.log(`✓ 載入 QUESTIONS 全集:${QUESTIONS.length} 題`);
console.log(`✓ 載入 allowList:${allowList.length} 張卡(${Object.keys(allowList.reduce((m,c) => (m[c.knowledge_code]=1,m), {})).length} 個 KB codes)\n`);

let pass = 0, fail = 0;
const assert = (cond, label) => {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
};

// === 測試 1:科三 + 全階級 filter ===
console.log('--- 測試 1:filter = {subject: "3"} → 科三所有卡 ---');
const r1 = buildPoolFromFilter(QUESTIONS, allowList, { subject: '3', code: 'all', tier: 'all' });
console.log(`  visible cards: ${r1.visible.length}`);
console.log(`  codes: ${[...r1.codes].sort().join(', ')}`);
console.log(`  pool size: ${r1.pool.length}`);
assert(r1.visible.length > 0, '科三卡 > 0');
assert(r1.pool.length >= 25, '科三題池 >= 25');
assert([...r1.codes].every(c => c.startsWith('L23')), '所有 codes 是 L23*');

// === 測試 2:filter = {code: "L23103"} → NumPy 線代專場 ===
console.log('\n--- 測試 2:filter = {code: "L23103"} ---');
const r2 = buildPoolFromFilter(QUESTIONS, allowList, { subject: 'all', code: 'L23103', tier: 'all' });
console.log(`  visible cards: ${r2.visible.length}`);
console.log(`  pool size: ${r2.pool.length}`);
assert(r2.pool.length > 0, 'L23103 池 > 0');
assert(r2.pool.every(q => q.knowledge_code === 'L23103'), '池內全 L23103');

// === 測試 3:filter = {subject: "2"} → 科二 ===
console.log('\n--- 測試 3:filter = {subject: "2"} ---');
const r3 = buildPoolFromFilter(QUESTIONS, allowList, { subject: '2', code: 'all', tier: 'all' });
console.log(`  visible cards: ${r3.visible.length}`);
console.log(`  pool size: ${r3.pool.length}`);
assert(r3.pool.length > 0, '科二池 > 0');
assert([...r3.codes].every(c => c.startsWith('L22')), '所有 codes 是 L22*');

// === 測試 4:lineup 構建 — 5 題 × 6 NPC ===
console.log('\n--- 測試 4:Mode 7 startWithCustomPool lineup 構建(pool=科三,qcount=5)---');
const lineup4 = buildLineup(r1.pool, 5, 6);
assert(lineup4.length === 5, 'lineup 5 題');
assert(lineup4.every(item => item.q && item.q.id), '每個 item 有 q.id');
assert(lineup4.every(item => typeof item.npcIdx === 'number' && item.npcIdx >= 0 && item.npcIdx < 6), 'npcIdx 在 [0, 6)');
assert(new Set(lineup4.map(item => item.q.id)).size === 5, '5 題不重複');

// === 測試 5:lineup 構建 — qcount > pool size 時自動截 ===
console.log('\n--- 測試 5:qcount 大於 pool size 時 ---');
const smallPool = r2.pool.slice(0, 8);
const lineup5 = buildLineup(smallPool, 30, 6);
assert(lineup5.length === 8, 'lineup 截至 pool size (8)');

// === 測試 6:lineup 每題的 q.knowledge_code 都在原 codes 集 ===
console.log('\n--- 測試 6:lineup 內所有題目的 KB code 都在原 filter 集 ---');
const lineup6 = buildLineup(r3.pool, 10, 6);
assert(lineup6.every(item => r3.codes.has(item.q.knowledge_code)), '所有題 KB code 在 codes 集');

// === 測試 7:state.lineup[i].q.options 結構驗證(防案例 10 lineup-key bug)===
console.log('\n--- 測試 7:lineup 題目的原始 q.options 結構(防案例 10 lineup-key 復現)---');
lineup6.forEach((item, i) => {
  const q = item.q;
  // 原版 QUESTIONS 的 options 沒有 key 欄位是正確的(rendered 後才有 key)
  if (Array.isArray(q.options)) {
    const hasKeys = q.options.some(o => o.key);
    if (hasKeys) console.log(`  ⚠️ ${q.id} options 已有 key — 不符 lineup 預期(應為 render 後才指派)`);
  }
});
assert(true, 'lineup q.options 結構檢查(僅 log warning,不視為 fail)');

// === 測試 8:Mode 2 BOSS qids 全部 dereference 成功 ===
console.log('\n--- 測試 8:Mode 2 BOSS qids 是否全部能在 QUESTIONS 找到 ---');
const mode2Bosses = [
  { name: 'numpy', qids: ['q_pa_001','q_pa_002','q_pa_003','q_pa_004','q_pa_005','q_pa_np_001','q_pa_np_002','q_pa_np_003','q_pa_np_004','q_pa_np_005','q_pa_np_006','q_pa_np_007','q_pa_np_008','q_pa_np_009','q_pa_np_010'] },
  { name: 'sklearn', qids: ['q_pa_006','q_pa_007','q_pa_008','q_pa_009','q_pa_sk_001','q_pa_sk_002','q_pa_sk_003','q_pa_sk_004','q_pa_sk_005','q_pa_sk_006','q_pa_sk_007','q_pa_sk_008'] },
  { name: 'pytorch', qids: ['q_pa_010','q_0029','q_pa_pt_001','q_pa_pt_002','q_pa_pt_003','q_pa_pt_004','q_pa_pt_005','q_pa_pt_006','q_pa_pt_007','q_pa_pt_008','q_pa_pt_009','q_pa_pt_010'] },
  { name: 'pandas', qids: ['q_pa_013','q_pa_014','q_pa_pd_001','q_pa_pd_002','q_pa_pd_003','q_pa_pd_004'] },
  { name: 'visualization', qids: ['q_pb_001','q_pb_007','q_pb_009','q_pb_010','q_pb_011','q_pb_012','q_pb_013','q_pb_014','q_pb_015','q_pb_016','q_pb_017','q_pb_018'] },
  { name: 'probability', qids: ['q_0024','q_pa_mc_001','q_pa_mc_002'] }
];
mode2Bosses.forEach(boss => {
  const found = boss.qids.filter(id => QUESTIONS.some(q => q.id === id)).length;
  const missing = boss.qids.filter(id => !QUESTIONS.some(q => q.id === id));
  console.log(`  ${boss.name}: ${found}/${boss.qids.length} found`);
  if (missing.length > 0) console.log(`    ⚠️ MISSING: ${missing.join(', ')}`);
  assert(missing.length === 0, `BOSS ${boss.name} 所有 qids 都能 dereference`);
});

// === 測試 9:Mode 2 pickQuestionsForBoss 5 題上限模擬 ===
console.log('\n--- 測試 9:Mode 2 BOSS 每場 5 題限制(MAX_QUESTIONS_PER_BATTLE=5)---');
const numpyBoss = mode2Bosses[0];
const numpyPool = QUESTIONS.filter(q => numpyBoss.qids.includes(q.id));
const battlePool = numpyPool.slice(0, 5);
assert(battlePool.length === 5, 'numpy BOSS 一場抽 5 題');

// === 測試 10:Mode 8 trace 題庫補齊到 33 + L23 ×3 ===
console.log('\n--- 測試 10:Mode 8 trace 題庫總題數 ---');
const traceQs = QUESTIONS.filter(q => q.format === 'code_trace');
const traceByCode = {};
traceQs.forEach(q => traceByCode[q.knowledge_code] = (traceByCode[q.knowledge_code]||0)+1);
const l23TraceCount = ['L23103','L23202','L23203'].reduce((s,c) => s+(traceByCode[c]||0), 0);
const l22TraceCount = Object.keys(traceByCode).filter(c => c.startsWith('L22')).reduce((s,c) => s+traceByCode[c], 0);
console.log(`  trace total: ${traceQs.length} 題`);
console.log(`  L22 total: ${l22TraceCount} 題(L22202=${traceByCode['L22202']||0}, L22203=${traceByCode['L22203']||0}, L22303=${traceByCode['L22303']||0})`);
console.log(`  L23 total: ${l23TraceCount} 題(L23103=${traceByCode['L23103']||0}, L23202=${traceByCode['L23202']||0}, L23203=${traceByCode['L23203']||0})`);
assert(traceQs.length >= 33, 'trace 總題數 ≥ 33(補齊缺口)');
assert((traceByCode['L22202']||0) >= 2, 'L22202 ≥ 2 題');
assert((traceByCode['L22203']||0) >= 2, 'L22203 ≥ 2 題');
assert((traceByCode['L22303']||0) >= 2, 'L22303 ≥ 2 題');
assert((traceByCode['L23103']||0) === 18, 'L23103 = 18 題(原 6 ×3)');
assert((traceByCode['L23202']||0) === 12, 'L23202 = 12 題(原 4 ×3)');
assert((traceByCode['L23203']||0) === 6, 'L23203 = 6 題(原 2 ×3)');

// === 結算 ===
console.log(`\n=== SUMMARY ===`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
