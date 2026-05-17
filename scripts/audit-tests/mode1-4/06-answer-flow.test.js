// 06 — Mode 2 answer flow
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const questions = [];
  for (let i = 1; i <= 5; i++) {
    questions.push(fixtureQuestion({ id: 'q_pa_' + String(i).padStart(3, '0'), knowledge_code: 'L23102', format: 'code_reading' }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode2.js'));
  return sb;
}

console.log('=== Mode 2 — answer flow ===');

// [1] 答對 → correct++ / bossHp 下降
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const bossHpBefore = vm.runInContext('Mode2.state.bossHp', sb);
  const key = vm.runInContext('Mode2.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${key}")`, sb);
  A.eq(vm.runInContext('Mode2.state.correct', sb), 1, 'correct = 1');
  A.eq(vm.runInContext('Mode2.state.combo', sb), 1, 'combo = 1');
  A.ok(vm.runInContext('Mode2.state.bossHp', sb) < bossHpBefore, 'bossHp decreased');
  A.eq(vm.runInContext('Mode2.state.answered', sb), true, 'answered = true');
}

// [2] 答錯 → wrong++ / HP 下降
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  const hpBefore = vm.runInContext('Player.load().hp', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  A.eq(vm.runInContext('Mode2.state.wrong', sb), 1, 'wrong = 1');
  A.ok(vm.runInContext('Player.load().hp', sb) < hpBefore, 'HP decreased');
}

// [3] 雙擊 — 第 2 次 answered=true 被擋
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const key = vm.runInContext('Mode2.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${key}"); Mode2.answer("${key}"); Mode2.answer("${key}");`, sb);
  A.eq(vm.runInContext('Mode2.state.correct', sb), 1, 'triple-click only counts once');
}

// [4] Wrongbook 簽名正確
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  const wb = vm.runInContext('Wrongbook.load()', sb);
  A.eq(wb.length, 1, 'Wrongbook has 1 entry');
  A.ok(wb[0].correctChoice && wb[0].correctChoice !== '', 'correctChoice non-empty');
  A.ok(wb[0].userText && wb[0].userText !== '', 'userText non-empty');
}

// [5] 招式 useStaticAnalysis — MP 不足:不會扣 MP
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 0})', sb);
  vm.runInContext('Mode2.useStaticAnalysis();', sb);
  A.eq(vm.runInContext('Player.load().mp', sb), 0, 'MP unchanged when insufficient');
}

// [6] 招式同題用兩次 — 第二次被擋
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 50})', sb);
  vm.runInContext('Mode2.useStaticAnalysis();', sb);
  const mpAfter1 = vm.runInContext('Player.load().mp', sb);
  vm.runInContext('Mode2.useStaticAnalysis();', sb);
  const mpAfter2 = vm.runInContext('Player.load().mp', sb);
  A.eq(mpAfter2, mpAfter1, '2nd use of same skill blocked (MP unchanged)');
}

// [7] 全對:bossHp 歸 0 → victory(會把 state 清為 null)
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  // 把 bossHp 設低
  vm.runInContext('Mode2.state.bossHp = 1; Mode2.state.bossHpMax = 1;', sb);
  const key = vm.runInContext('Mode2.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${key}"); Mode2.next();`, sb);
  // victory 清 state
  const st = vm.runInContext('Mode2.state', sb);
  A.eq(st, null, 'state cleared after victory');
  // _lastBossKey 應保留
  A.eq(vm.runInContext('Mode2._lastBossKey', sb), 'numpy', '_lastBossKey saved');
  const bosses = vm.runInContext('Storage.get("ipas_mode2_bosses_v2", {})', sb);
  A.eq(bosses.numpy.defeated, true, 'numpy defeated stored');
}

// [8] 全錯:HP 歸 0 → 設 gameOverPending
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 1});', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  // hp <= 0 → gameOverPending = true
  A.eq(vm.runInContext('Mode2.state.gameOverPending', sb), true, 'gameOverPending set');
}

process.exit(A.summary('mode2.06.answer-flow'));
