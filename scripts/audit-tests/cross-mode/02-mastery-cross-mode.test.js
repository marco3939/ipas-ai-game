// 02-mastery-cross-mode.test.js
// 必證:Mode 1 答對 → Mastery.update 寫入 → Mode 5 selectWeakBosses 排除
//      Mode 7 commit → Mastery.update → 首頁 stat-mastered countMastered 累加
// 用 sandbox 跑共用層,模擬跨 mode 流程

const { makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 02 Mastery cross-mode ===\n');
const A = makeAssert();

// 預先建立題庫(供 countMastered 算分母)
const QUESTIONS = [
  { id: 'q_n01', node_id: 'L21101', stem: 'q1', options: [{text:'a',is_correct:true},{text:'b'}] },
  { id: 'q_n02', node_id: 'L21101', stem: 'q2', options: [{text:'a',is_correct:true},{text:'b'}] },
  { id: 'q_n03', node_id: 'L21101', stem: 'q3', options: [{text:'a',is_correct:true},{text:'b'}] },
  { id: 'q_n04', node_id: 'L21201', stem: 'q4', options: [{text:'a',is_correct:true},{text:'b'}] },
  { id: 'q_n05', node_id: 'L21201', stem: 'q5', options: [{text:'a',is_correct:true},{text:'b'}] },
  { id: 'q_n06', node_id: 'L21301', stem: 'q6', options: [{text:'a',is_correct:true},{text:'b'}] },
];

// ----- [1] Mode 1 答對 → Mastery 累積 -----
console.log('\n[1] Mode 1 答對 → Mastery.update 累積');
{
  const sb = makeSandbox({ QUESTIONS });
  const { Mastery } = loadSharedLayer(sb);
  // QUESTIONS 已注入 sandbox,但 Mastery.countMastered 內部用全域 QUESTIONS
  // _helpers loadSharedLayer 已塞 ctx.QUESTIONS — countMastered 應該能直接讀到
  Mastery.update('L21101', true);
  Mastery.update('L21101', true);
  Mastery.update('L21101', true);
  const node = Mastery.get('L21101');
  A.eq(node.correct, 3, 'mode1 → Mastery.correct after 3 correct = 3');
  A.eq(node.attempts, 3, 'attempts = 3');
  // countMastered 需要 QUESTIONS 在 vm context 可見 — Mastery 是裸名讀 QUESTIONS
  const cm = Mastery.countMastered();
  A.eq(cm, 1, 'countMastered after 3 correct on L21101 (3-題節點 → required=3) = 1');
}

// ----- [2] L21201 只 2 題的節點,countMastered required=min(3, qPerNode)=2 -----
console.log('\n[2] 2-題節點(per-node threshold)');
{
  const sb = makeSandbox({ QUESTIONS });
  const { Mastery } = loadSharedLayer(sb);
  Mastery.update('L21201', true);
  Mastery.update('L21201', true);
  A.eq(Mastery.countMastered(), 1, 'L21201 只 2 題 → 答對 2 次達標');
}

// ----- [3] Mode 7 模考 commit 多節點 → 首頁 stat-mastered 累進 -----
console.log('\n[3] Mode 7 commit 多節點');
{
  const sb = makeSandbox({ QUESTIONS });
  const { Mastery } = loadSharedLayer(sb);
  // 模擬 Mode 7 _commitToSharedLayer:對每題正解都 Mastery.update(nodeId, true)
  const lineup = [
    { qid: 'q_n01', node_id: 'L21101', isCorrect: true },
    { qid: 'q_n02', node_id: 'L21101', isCorrect: true },
    { qid: 'q_n03', node_id: 'L21101', isCorrect: true },
    { qid: 'q_n04', node_id: 'L21201', isCorrect: true },
    { qid: 'q_n05', node_id: 'L21201', isCorrect: true },
    { qid: 'q_n06', node_id: 'L21301', isCorrect: true },
  ];
  for (const a of lineup) Mastery.update(a.node_id, a.isCorrect);
  const cm = Mastery.countMastered();
  // L21101(3 對 ≥ 3) + L21201(2 對 ≥ 2) + L21301(1 對 < required=1?）
  // L21301 只 1 題,required = min(3, 1) = 1,所以 1 對 = 達標
  A.eq(cm, 3, 'L21101 + L21201 + L21301 全達標 = 3');
}

// ----- [4] Mode 5 selectWeakBosses 排除已熟練節點 -----
// 我們只模擬「selectWeakBosses 用 Mastery + Wrongbook 找最弱節點」的邏輯
console.log('\n[4] Mode 5 selectWeakBosses 排除已熟練');
{
  const sb = makeSandbox({ QUESTIONS });
  const { Mastery, Wrongbook } = loadSharedLayer(sb);
  // 模擬玩家:L21101 已熟練(3 對),L21201 弱(score=20),L21301 完全沒做
  Mastery.update('L21101', true); Mastery.update('L21101', true); Mastery.update('L21101', true);
  Wrongbook.add('q_n04', 'L21201', 'B', 'A', '弱', '強');
  Wrongbook.add('q_n05', 'L21201', 'B', 'A', '弱', '強');

  // 模擬 mode5 selectWeakBosses Step 1
  const liveNodeSet = new Set(QUESTIONS.map(q => q.node_id));
  const wb = Wrongbook.load().filter(x => !x.mastered && x.nodeId && liveNodeSet.has(x.nodeId));
  const nodeWrongCount = {};
  wb.forEach(x => nodeWrongCount[x.nodeId] = (nodeWrongCount[x.nodeId] || 0) + (x.wrongCount || 1));
  const sortedWrong = Object.entries(nodeWrongCount).sort((a,b) => b[1]-a[1]).slice(0,5);
  const bosses = sortedWrong.map(([nid, n]) => ({nodeId:nid, weak:n, source:'wrongbook'}));
  // Step 2:Mastery < 40 補
  const m = Mastery.load();
  const existing = new Set(bosses.map(b => b.nodeId));
  const lowMastery = Object.entries(m).filter(([nid, n]) =>
    !existing.has(nid) && liveNodeSet.has(nid) && (n.attempts||0) > 0 && (n.score||0) < 40
  );

  // L21101 score 應該 > 60(3 對 streak 累加),所以不會在 lowMastery 內
  const l101 = Mastery.get('L21101');
  A.ok(l101.score >= 40, `L21101 score=${l101.score} 不被列為弱點`);
  const inBosses = bosses.find(b => b.nodeId === 'L21101');
  A.ok(!inBosses, 'L21101 已熟練 → 不在 selectWeakBosses(Step 1)');
  A.ok(bosses.find(b => b.nodeId === 'L21201'), 'L21201 有錯題 → 進 selectWeakBosses');
}

// ----- [5] Mastery 跨多 mode 累積一致性(Mode 1 + Mode 7 同節點) -----
console.log('\n[5] 跨 mode 累積');
{
  const sb = makeSandbox({ QUESTIONS });
  const { Mastery } = loadSharedLayer(sb);
  // Mode 1 答對 1 次 + Mode 3 答對 1 次 + Mode 7 答對 1 次
  Mastery.update('L21101', true);
  Mastery.update('L21101', true);
  Mastery.update('L21101', true);
  const node = Mastery.get('L21101');
  A.eq(node.correct, 3, 'cross-mode 累積:correct 累加');
  A.eq(node.streak, 3, 'streak 連對 = 3');
  A.ok(node.score >= 30, `score 累加 >= 30 (got ${node.score})`);
}

// ----- [6] Mode 5 adjustMasteryScore(直寫 score)後 countMastered 還算 -----
// 案例 4 教訓:Mode 5 曾繞過 Mastery.update 自寫 score,導致 attempts/correct 沒更新
// 確認新版本走 Mastery.load/save,而非繞過(再讀一次 mode5.js 確認)
console.log('\n[6] Mode 5 adjustMasteryScore 不繞過 Mastery');
{
  const fs = require('fs');
  const m5 = fs.readFileSync(__dirname + '/../../../src/modes/mode5.js', 'utf8');
  // 必須走 Mastery.load 與 Mastery.save(或 Mastery.update)
  A.ok(/Mastery\.load\(\)/.test(m5), 'mode5.js uses Mastery.load (not direct localStorage)');
  A.ok(/Mastery\.save\(/.test(m5), 'mode5.js uses Mastery.save (not direct localStorage)');
  // 案例 4 核心修補:Mode 5 自寫 adjustMasteryScore 內必須 bump attempts/correct/streak
  // (不一定走 Mastery.update,但等效行為要存在)
  A.ok(/attempts\s*=\s*\(node\.attempts/.test(m5) || /node\.attempts\s*=\s*\(node\.attempts.*1\)/.test(m5),
    'mode5.js adjustMasteryScore bumps attempts');
  A.ok(/node\.correct\s*=\s*\(node\.correct/.test(m5),
    'mode5.js adjustMasteryScore bumps correct(案例 4 修補)');
  A.ok(/node\.streak/.test(m5),
    'mode5.js adjustMasteryScore touches streak');
}

process.exit(A.summary('02-mastery-cross-mode'));
