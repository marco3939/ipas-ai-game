// 03 — Mode 1 victory / gameOver entry guard (PR #27 C-1/C-2)
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

console.log('=== Mode 1 — victory / gameOver double-call guard ===');

// [1] victory 連呼叫 5 次:EXP 只發 1 次
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 跑到接近 victory:把 idx 設到最後 + bossHp 設 0(直接操作 state)
  vm.runInContext(`
    Mode1.state.idx = Mode1.state.questions.length;
    Mode1.state.correct = 10;
    Mode1.state.maxCombo = 3;
    Mode1.state.bossHp = 0;
  `, sb);
  const expBefore = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  // 連呼叫 5 次
  for (let i = 0; i < 5; i++) {
    vm.runInContext('Mode1.victory();', sb);
  }
  const expAfter = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  const expDelta = expAfter - expBefore;
  A.ok(expDelta > 0, 'EXP awarded once');
  // EXP 上限約 60 + 10*12 + 0 + 3*5 = 195(perfect 看是否 wrong=0)
  // 雙呼叫 = 2 * 195 = 390;若 entry guard 作用,應只一次
  A.ok(expDelta < 400, 'EXP not double-awarded (entry guard works)');
  A.eq(vm.runInContext('Mode1.state.victorySettled', sb), true, 'victorySettled = true');

  // 確認 storage 內 industries 紀錄一致(不重複寫)
  const industries = vm.runInContext('Storage.get("ipas_mode1_industries_v1", {})', sb);
  A.ok(industries.ecommerce, 'industries.ecommerce written');
  A.eq(industries.ecommerce.defeated, true, 'defeated = true');
}

// [2] gameOver 連呼叫 5 次:player.hp heal 只一次 / state.gameOverSettled true
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 讓 player HP 變成 0
  vm.runInContext('Player.save({...Player.load(), hp: 0})', sb);
  for (let i = 0; i < 5; i++) {
    vm.runInContext('Mode1.gameOver();', sb);
  }
  const hp = vm.runInContext('Player.load().hp', sb);
  const hpMax = vm.runInContext('Player.load().hpMax', sb);
  A.ok(hp > 0, 'HP healed (>0)');
  // 預期 heal Math.floor(hpMax/2) — 不應該 heal 5 次
  A.ok(hp <= Math.floor(hpMax / 2) + 1, `HP not healed 5x (hp=${hp}, expected ~${Math.floor(hpMax/2)})`);
  A.eq(vm.runInContext('Mode1.state.gameOverSettled', sb), true, 'gameOverSettled = true');
}

// [3] state = null 時呼叫 victory/gameOver → 不 throw
{
  const sb = build();
  vm.runInContext('Mode1.start();', sb); // state = null
  let err1 = null, err2 = null;
  try { vm.runInContext('Mode1.victory();', sb); } catch (e) { err1 = e; }
  try { vm.runInContext('Mode1.gameOver();', sb); } catch (e) { err2 = e; }
  A.ok(!err1, 'victory() with null state does not throw');
  A.ok(!err2, 'gameOver() with null state does not throw');
}

// [4] perfectClear flag — wrong = 0 才為 true
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  vm.runInContext(`
    Mode1.state.idx = Mode1.state.questions.length;
    Mode1.state.correct = 20;
    Mode1.state.wrong = 0;
    Mode1.state.bossHp = 0;
  `, sb);
  vm.runInContext('Mode1.victory();', sb);
  const industries = vm.runInContext('Storage.get("ipas_mode1_industries_v1", {})', sb);
  A.eq(industries.ecommerce.perfectClear, true, 'perfectClear = true when wrong=0');
}

// [5] 非完美:wrong > 0 → perfectClear = false(且不會被覆寫之前的 true)
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 先寫一個完美紀錄
  vm.runInContext('Storage.set("ipas_mode1_industries_v1", { ecommerce: { defeated: true, perfectClear: true } })', sb);
  vm.runInContext(`
    Mode1.state.idx = Mode1.state.questions.length;
    Mode1.state.correct = 19;
    Mode1.state.wrong = 1;
    Mode1.state.bossHp = 0;
  `, sb);
  vm.runInContext('Mode1.victory();', sb);
  const industries = vm.runInContext('Storage.get("ipas_mode1_industries_v1", {})', sb);
  A.eq(industries.ecommerce.perfectClear, true, 'prev perfectClear preserved (||)');
}

process.exit(A.summary('mode1.03.victory-doublecall'));
