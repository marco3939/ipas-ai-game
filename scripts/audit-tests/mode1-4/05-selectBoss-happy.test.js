// 05 — Mode 2 selectBoss happy path
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build(extra = []) {
  const questions = extra.slice();
  for (let i = 0; i < 10; i++) questions.push(fixtureQuestion({ id: 'q_filler_' + i }));
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode2.js'));
  return sb;
}

function paQuestions(n) {
  const arr = [];
  for (let i = 1; i <= n; i++) {
    arr.push(fixtureQuestion({ id: 'q_pa_' + String(i).padStart(3, '0'), knowledge_code: 'L23102', format: 'code_reading' }));
  }
  return arr;
}

console.log('=== Mode 2 — selectBoss happy path ===');

// [1] start() 不 throw
{
  const sb = build(paQuestions(5));
  let err = null;
  try { vm.runInContext('Mode2.start();', sb); } catch (e) { err = e; }
  A.ok(!err, 'Mode2.start() does not throw');
  A.ok(sb.document.getElementById('view-play'), 'view-play exists');
  A.eq(vm.runInContext('Mode2.state', sb), null, 'state null on map');
}

// [2] numpy boss(qids: q_pa_001..005)— 全題存在
{
  const sb = build(paQuestions(5));
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy");', sb);
  const st = vm.runInContext('Mode2.state', sb);
  A.ok(st, 'state created');
  A.eq(st.boss.key, 'numpy', 'boss.key = numpy');
  A.eq(st.questions.length, 5, '5 questions loaded');
  A.eq(st.idx, 0, 'idx = 0');
  A.eq(st.answered, false, 'answered = false');
  A.ok(st.eliminated instanceof Set, 'eliminated is Set');
  A.eq(st.bossHp, st.bossHpMax, 'bossHp == bossHpMax');
  // dynHp = min(140, max(25, 5*25)) = 125
  A.eq(st.bossHp, 125, 'bossHp = effective dynHp (125 for 5 qs)');
}

// [3] selectBoss 對應題目不存在 → showToast「題庫補強中」、state 不變
{
  const sb = build([]); // 無 q_pa_*
  vm.runInContext('Mode2.start();', sb);
  // probability boss qids: ['q_0024'] - 也不存在
  vm.runInContext('Mode2.selectBoss("probability");', sb);
  const st = vm.runInContext('Mode2.state', sb);
  A.eq(st, null, 'state stays null when boss qids empty');
}

// [4] XSS — boss intro / question stem 經 esc(),不該注入
{
  const xss = fixtureQuestion({
    id: 'q_pa_001',
    knowledge_code: 'L23102',
    stem: '<img src=x onerror=alert(1)>',
    options: [
      { text: '<script>evil()</script>', is_correct: true },
      { text: '一般 B', is_correct: false },
      { text: '一般 C', is_correct: false },
      { text: '一般 D', is_correct: false }
    ]
  });
  const sb = build([xss, ...paQuestions(5).slice(1)]);
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const view = sb.document.getElementById('view-play');
  A.ok(!view.innerHTML.includes('<script>'), 'innerHTML no raw <script>');
  A.ok(!view.innerHTML.includes('onerror='), 'innerHTML no raw onerror=');
}

// [5] reset progress — Storage del
{
  const sb = build(paQuestions(5));
  vm.runInContext('Storage.set("ipas_mode2_bosses_v2", { numpy: { defeated: true } });', sb);
  vm.runInContext('Mode2.resetProgress();', sb);
  const v = vm.runInContext('Storage.get("ipas_mode2_bosses_v2", null)', sb);
  A.eq(v, null, 'mode2 bosses storage cleared');
}

// [6] 9 個 BOSS keys 全可 select(若題庫齊)
{
  // 為所有 BOSS 提供 1 題
  const extra = [
    ...paQuestions(5), // numpy
    fixtureQuestion({ id: 'q_pa_006' }), fixtureQuestion({ id: 'q_pa_007' }),
    fixtureQuestion({ id: 'q_pa_008' }), fixtureQuestion({ id: 'q_pa_009' }),
    fixtureQuestion({ id: 'q_pa_010' }), fixtureQuestion({ id: 'q_pa_011' }),
    fixtureQuestion({ id: 'q_pa_012' }), fixtureQuestion({ id: 'q_0029' }),
    fixtureQuestion({ id: 'q_pa_013' }), fixtureQuestion({ id: 'q_pa_014' }),
    fixtureQuestion({ id: 'q_pb_001' }), fixtureQuestion({ id: 'q_pb_007' }),
    fixtureQuestion({ id: 'q_pb_009' }), fixtureQuestion({ id: 'q_pb_010' }),
    fixtureQuestion({ id: 'q_0024' }),
  ];
  for (let i = 1; i <= 15; i++) extra.push(fixtureQuestion({ id: 'q_n22_' + String(i).padStart(3, '0') }));
  for (let i = 1; i <= 10; i++) extra.push(fixtureQuestion({ id: 'q_n23_' + String(i).padStart(3, '0') }));
  for (let i = 1; i <= 10; i++) extra.push(fixtureQuestion({ id: 'q_n24_' + String(i).padStart(3, '0') }));

  const sb = build(extra);
  const keys = ['numpy','sklearn','pytorch','pandas','visualization','probability','l22_pipeline','l22_discriminative_ai','l22_generative_privacy'];
  vm.runInContext('Mode2.start();', sb);
  let succ = 0;
  for (const k of keys) {
    vm.runInContext(`Mode2.selectBoss("${k}");`, sb);
    const st = vm.runInContext('Mode2.state', sb);
    if (st && st.boss.key === k) succ++;
    vm.runInContext('Mode2.start();', sb);
  }
  A.eq(succ, 9, 'all 9 BOSSES selectable when qids exist');
}

process.exit(A.summary('mode2.05.selectBoss-happy'));
