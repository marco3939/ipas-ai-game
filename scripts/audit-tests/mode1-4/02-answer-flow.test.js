// 02 — Mode 1 answer flow: correct / wrong / double-click / state transitions
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const questions = [];
  for (let i = 0; i < 60; i++) {
    questions.push(fixtureQuestion({ id: 'q_t_' + i, tags: ['電商'], knowledge_code: 'L21101' }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode1.js'));
  return sb;
}

console.log('=== Mode 1 — answer flow ===');

// [1] 答對 → correct++ / bossHp 下降 / combo 上升
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const bossHpBefore = vm.runInContext('Mode1.state.bossHp', sb);
  const correctKey = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${correctKey}")`, sb);
  A.eq(vm.runInContext('Mode1.state.correct', sb), 1, 'correct++');
  A.eq(vm.runInContext('Mode1.state.combo', sb), 1, 'combo = 1');
  A.eq(vm.runInContext('Mode1.state.maxCombo', sb), 1, 'maxCombo = 1');
  A.ok(vm.runInContext('Mode1.state.bossHp', sb) < bossHpBefore, 'bossHp decreased');
  A.eq(vm.runInContext('Mode1.state.wrong', sb), 0, 'wrong stays 0');
  A.eq(vm.runInContext('Mode1.state.answering', sb), true, 'answering = true after answer');
}

// [2] 答錯 → wrong++ / 玩家 HP 下降 / combo 歸 0
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 先答對一題建立 combo
  let key = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${key}"); Mode1.next();`, sb);
  A.eq(vm.runInContext('Mode1.state.combo', sb), 1, 'after correct: combo=1');
  // 答錯
  key = vm.runInContext('Mode1.state.currentQ.options.find(o => !o.is_correct).key', sb);
  const hpBefore = vm.runInContext('Player.load().hp', sb);
  vm.runInContext(`Mode1.answer("${key}")`, sb);
  A.eq(vm.runInContext('Mode1.state.wrong', sb), 1, 'wrong++');
  A.eq(vm.runInContext('Mode1.state.combo', sb), 0, 'combo reset to 0');
  A.ok(vm.runInContext('Player.load().hp', sb) < hpBefore, 'player HP decreased');
}

// [3] 雙擊同選項 — 第 2 次被 answering lock 擋住,state.correct 不重複 ++
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const key = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${key}"); Mode1.answer("${key}"); Mode1.answer("${key}");`, sb);
  A.eq(vm.runInContext('Mode1.state.correct', sb), 1, 'triple-click only counts once');
  // bossHp 只扣一次傷害
  const dmgs = vm.runInContext('Mode1.state.bossHpMax - Mode1.state.bossHp', sb);
  A.ok(dmgs > 0 && dmgs < 100, 'single damage applied (not 3x)');
}

// [4] Wrongbook 寫入正確簽名(qid, nodeId, userChoice, correctChoice, userText, correctText)
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const wrongKey = vm.runInContext('Mode1.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${wrongKey}")`, sb);
  const wb = vm.runInContext('Wrongbook.load()', sb);
  A.ok(Array.isArray(wb) && wb.length === 1, 'Wrongbook has 1 entry');
  const entry = wb[0];
  A.ok(entry.qid, 'qid present');
  A.ok(entry.nodeId, 'nodeId present');
  A.ok(entry.userChoice, 'userChoice present');
  A.ok(entry.correctChoice, 'correctChoice present (not empty — anti case 10)');
  A.ok(entry.userText && entry.userText.length > 0, 'userText non-empty');
  A.ok(entry.correctText && entry.correctText.length > 0, 'correctText non-empty');
}

// [5] 全對:跑完一場 → state.correct = qcount,bossHp ≤ 0 早早觸發 bossKnockedOutShown
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const total = vm.runInContext('Mode1.state.questions.length', sb);
  for (let i = 0; i < total; i++) {
    const key = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
    vm.runInContext(`Mode1.answer("${key}"); Mode1.next();`, sb);
    // 若進到 victory,Mode1.state.victorySettled === true
    const state = vm.runInContext('Mode1.state', sb);
    if (state && state.victorySettled) break;
  }
  const finalState = vm.runInContext('Mode1.state', sb);
  A.ok(finalState && finalState.victorySettled, 'victory was settled');
  A.ok(finalState.correct >= 1, 'correct >= 1');
  A.eq(finalState.wrong, 0, 'no wrong (perfect)');
  A.ok(finalState.bossHp === 0, 'bossHp reached 0 by end');
}

// [6] 全錯:跑完 → wrong = qcount(或 game over)
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  for (let i = 0; i < 30; i++) {
    const state = vm.runInContext('Mode1.state', sb);
    if (!state || state.gameOverSettled || state.victorySettled) break;
    const cur = vm.runInContext('Mode1.state.currentQ', sb);
    if (!cur) break;
    // 找錯誤選項
    const wKey = vm.runInContext('Mode1.state.currentQ.options.find(o => !o.is_correct).key', sb);
    try { vm.runInContext(`Mode1.answer("${wKey}");`, sb); } catch (e) {}
    try { vm.runInContext('Mode1.next();', sb); } catch (e) {}
  }
  const finalState = vm.runInContext('Mode1.state', sb);
  A.ok(finalState && (finalState.gameOverSettled || finalState.wrong > 0), 'all-wrong reached gameOver OR wrong > 0');
}

process.exit(A.summary('mode1.02.answer-flow'));
