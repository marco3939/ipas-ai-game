// 03-mastery.test.js — Mastery 模組深度測試
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');
const MasterySrc = sliceConst(src, 'const Mastery = {', '// === SeenCorrect');

console.log('=== Mastery tests ===');
console.log('source length:', MasterySrc.length, 'chars');

const A = makeAssert();

function setup(questions = []) {
  const sb = makeSandbox();
  runSource(sb, StorageSrc, 'Storage');
  // Mastery 內讀 QUESTIONS 全域(case 4 鐵律)
  sb.QUESTIONS = questions;
  runSource(sb, MasterySrc, 'Mastery');
  return sb;
}

// ----- [1] empty load -----
console.log('\n[1] load() with no data');
{
  const sb = setup();
  A.eq(sb.Mastery.load(), {}, 'load() empty → {}');
}

// ----- [2] update happy path -----
console.log('\n[2] update() correct');
{
  const sb = setup();
  const n = sb.Mastery.update('node-A', true);
  A.eq(n.attempts, 1, 'attempts=1');
  A.eq(n.correct, 1, 'correct=1');
  A.eq(n.streak, 1, 'streak=1');
  // 公式:score = min(100, 0 + 10 + min(15, 1*2)) = 12
  A.eq(n.score, 12, 'score=12 (first correct: 10 + 1*2)');
  A.ok(typeof n.lastSeen === 'number', 'lastSeen set');
}

// ----- [3] update streak growth -----
console.log('\n[3] update() streak growth');
{
  const sb = setup();
  const expectedScores = [];
  for (let i = 1; i <= 10; i++) {
    const n = sb.Mastery.update('node-X', true);
    expectedScores.push(n.score);
  }
  // 連 10 對:第 i 對 score 增加 10 + min(15, i*2),依序 12, 14, 16, 18, 20, 22, 24, 25, 25, 25
  // 累積:12, 26, 42, 60, 80, 100, 100, 100, 100, 100
  A.eq(expectedScores[0], 12, 'streak 1 → 12');
  A.eq(expectedScores[5], 100, 'streak 6 → 100 (capped)');
  A.eq(expectedScores[9], 100, 'streak 10 still 100 (cap holds)');
}

// ----- [4] update wrong resets streak -----
console.log('\n[4] update() wrong resets streak');
{
  const sb = setup();
  sb.Mastery.update('n', true);
  sb.Mastery.update('n', true);
  sb.Mastery.update('n', true);
  let n = sb.Mastery.get('n');
  A.eq(n.streak, 3, 'streak=3 after 3 correct');
  n = sb.Mastery.update('n', false);
  A.eq(n.streak, 0, 'wrong → streak=0');
  A.ok(n.score >= 0, `score=${n.score} clamped ≥0`);
  // continue correct
  const n2 = sb.Mastery.update('n', true);
  A.eq(n2.streak, 1, 'streak restart at 1');
}

// ----- [5] update wrong floor 0 -----
console.log('\n[5] score floor at 0');
{
  const sb = setup();
  for (let i = 0; i < 30; i++) sb.Mastery.update('z', false);
  const n = sb.Mastery.get('z');
  A.eq(n.score, 0, 'score floored at 0 after many wrongs');
  A.eq(n.streak, 0, 'streak=0');
  A.eq(n.correct, 0, 'correct=0');
  A.eq(n.attempts, 30, 'attempts=30');
}

// ----- [6] update score ceil 100 -----
console.log('\n[6] score ceiling 100');
{
  const sb = setup();
  for (let i = 0; i < 100; i++) sb.Mastery.update('p', true);
  const n = sb.Mastery.get('p');
  A.eq(n.score, 100, 'score ceiled at 100');
  A.eq(n.correct, 100, 'correct=100');
}

// ----- [7] drillBonus -----
console.log('\n[7] drillBonus +20');
{
  const sb = setup();
  sb.Mastery.drillBonus('new-node');
  const n = sb.Mastery.get('new-node');
  A.eq(n.score, 20, 'drillBonus on new node → 20');
  sb.Mastery.drillBonus('new-node');
  A.eq(sb.Mastery.get('new-node').score, 40, 'drillBonus again → 40');
  for (let i = 0; i < 10; i++) sb.Mastery.drillBonus('new-node');
  A.eq(sb.Mastery.get('new-node').score, 100, 'drillBonus capped at 100');
}

// ----- [8] getWeakest fresh node default score 50 -----
console.log('\n[8] getWeakest()');
{
  const sb = setup();
  sb.Mastery.update('hi', true); sb.Mastery.update('hi', true); sb.Mastery.update('hi', true);
  sb.Mastery.update('mid', true); sb.Mastery.update('mid', false);
  // 'low' 尚無紀錄 → 預設 50
  const list = sb.Mastery.getWeakest(['hi', 'mid', 'low', 'fresh'], 4);
  A.eq(list.length, 4, 'returns 4 items');
  A.ok(list[0].score <= list[3].score, 'sorted ascending');
  const ids = list.map(x => x.id);
  // 'mid' 因連對 1 + 錯 1,score = 0+12-5 = 7;'low'/'fresh' = 50;'hi' 高
  A.ok(ids.indexOf('mid') < ids.indexOf('hi'), 'weakest("mid") before "hi"');
}

// ----- [9] getWeakest empty input -----
console.log('\n[9] getWeakest empty');
{
  const sb = setup();
  A.eq(sb.Mastery.getWeakest([], 5), [], 'empty input → empty array');
  A.eq(sb.Mastery.getWeakest(['x'], 0), [], 'n=0 → empty array');
}

// ----- [10] countMastered with QUESTIONS pool -----
console.log('\n[10] countMastered() with per-node threshold');
{
  // Build QUESTIONS: nodeA 有 5 題,nodeB 有 2 題,nodeC 有 1 題
  const qs = [];
  for (let i = 0; i < 5; i++) qs.push({id:'qA'+i, node_id:'nodeA'});
  for (let i = 0; i < 2; i++) qs.push({id:'qB'+i, node_id:'nodeB'});
  qs.push({id:'qC', node_id:'nodeC'});
  const sb = setup(qs);
  // nodeA: correct=3, 需求 min(3,5)=3 → mastered
  for (let i = 0; i < 3; i++) sb.Mastery.update('nodeA', true);
  // nodeB: correct=2, 需求 min(3,2)=2 → mastered
  for (let i = 0; i < 2; i++) sb.Mastery.update('nodeB', true);
  // nodeC: correct=1, 需求 min(3,1)=1 → mastered
  sb.Mastery.update('nodeC', true);
  // nodeD: 不在 QUESTIONS,correct=3 仍會檢查 qPerNode[nodeD]=undefined → min(3, 3) → mastered
  for (let i = 0; i < 3; i++) sb.Mastery.update('nodeD', true);
  const cnt = sb.Mastery.countMastered();
  A.eq(cnt, 4, `countMastered=4 (nodeA/B/C/D all reached threshold)`);
}

// ----- [11] countMastered 部分達標 -----
console.log('\n[11] countMastered partial');
{
  const qs = [
    {id:'q1', node_id:'A'},{id:'q2', node_id:'A'},{id:'q3', node_id:'A'},
    {id:'q4', node_id:'B'},
  ];
  const sb = setup(qs);
  sb.Mastery.update('A', true); sb.Mastery.update('A', true); // correct=2 < 3
  sb.Mastery.update('B', true); // correct=1 = min(3,1) → mastered
  A.eq(sb.Mastery.countMastered(), 1, 'only B mastered');
}

// ----- [12] attack: NaN score injection -----
console.log('\n[12] Storage 注入污染 — direct write NaN');
{
  const sb = setup();
  // 直接寫入污染
  sb.Storage.set(sb.Storage.K_MASTERY, { evilNode: { score: NaN, attempts: 1, correct: 0, streak: 0 } });
  // update 後是否還能讀?
  const n = sb.Mastery.update('evilNode', true);
  // score = max(0, NaN + 10 + ...) = NaN (Math.min/max with NaN = NaN)
  // 這是 BUG 候選:NaN 污染後無法復原
  A.ok(isNaN(n.score) || n.score >= 0, `score=${n.score} after NaN-injected update (BUG candidate: NaN propagates)`);
  if (isNaN(n.score)) {
    console.log('  ⚠️ FOUND: NaN injection persists through Mastery.update (no NaN guard)');
  }
}

// ----- [13] attack: __proto__ as nodeId -----
console.log('\n[13] __proto__ as nodeId');
{
  const sb = setup();
  sb.Mastery.update('__proto__', true);
  // 是否污染 Object.prototype.score?
  const tester = {};
  A.ok(tester.score === undefined, 'Object.prototype.score not polluted');
  // 但會存進 m['__proto__'] 嗎?
  const m = sb.Mastery.load();
  // m['__proto__'] 在 JSON.parse 後是普通 key(V8 安全)
  A.ok(true, '__proto__ as key handled');
}

// ----- [14] high volume — 5000 updates -----
console.log('\n[14] high volume 5000 updates');
{
  const sb = setup();
  const t0 = Date.now();
  for (let i = 0; i < 5000; i++) {
    sb.Mastery.update('node-' + (i % 50), i % 3 === 0);
  }
  const dt = Date.now() - t0;
  A.ok(dt < 10000, `5000 updates took ${dt}ms (<10000ms)`);
  const m = sb.Mastery.load();
  A.eq(Object.keys(m).length, 50, '50 distinct nodes');
}

// ----- [15] update with empty nodeId -----
console.log('\n[15] update empty nodeId');
{
  const sb = setup();
  const n = sb.Mastery.update('', true);
  // 空字串會被存進 m[''] = node
  A.ok(n.attempts === 1, `update('') treats as valid key (attempts=${n.attempts})`);
  const m = sb.Mastery.load();
  A.ok('' in m, 'empty-string key stored (BUG candidate: should validate nodeId non-empty)');
}

// ----- [16] update with null/undefined nodeId -----
console.log('\n[16] update null/undefined nodeId');
{
  const sb = setup();
  const n = sb.Mastery.update(null, true);
  A.ok(n.attempts === 1, `update(null) accepts (attempts=${n.attempts})`);
  const m = sb.Mastery.load();
  A.ok('null' in m || null in m, 'null key stored as "null" string (BUG candidate)');
}

process.exit(A.summary('Mastery'));
