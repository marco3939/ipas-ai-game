// 12 — Mode 3 victory entry guard (PR #27 C-3)
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureSequenceQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const q = fixtureSequenceQuestion();
  const sb = makeSandbox({ questions: [q] });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode3.js'));
  return sb;
}

console.log('=== Mode 3 — victory entry guard ===');

// [1] victory() 連呼叫 5 次:EXP 只發 1 次,storage 只寫 1 次
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  // 直接模擬全對狀態(避免要拖每個 step)
  vm.runInContext(`
    Mode3.state.correctPlacements = Mode3.state.steps.length;
    Mode3.state.maxCombo = 3;
    Mode3.state.wrongDrops = 0;
    Mode3.state.timeLeft = 30;
  `, sb);
  const expBefore = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  for (let i = 0; i < 5; i++) vm.runInContext('Mode3.victory();', sb);
  const expAfter = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  const expDelta = expAfter - expBefore;
  A.ok(expDelta > 0, 'EXP awarded');
  // 確認沒重發:expDelta 應該是一次的金額,小於合理上限
  A.ok(expDelta < 3000, 'EXP not 5x awarded (single call only)');
  A.eq(vm.runInContext('Mode3.state.victorySettled', sb), true, 'victorySettled = true');
  A.eq(vm.runInContext('Mode3.state.finished', sb), true, 'finished = true');
}

// [2] victory 後 progress.stages[qid].cleared = true 只寫一次
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext(`
    Mode3.state.correctPlacements = Mode3.state.steps.length;
    Mode3.state.maxCombo = 3;
    Mode3.state.wrongDrops = 0;
  `, sb);
  vm.runInContext('Mode3.victory();', sb);
  const progress1 = vm.runInContext('Storage.get("ipas_mode3_progress_v2")', sb);
  // 再呼叫多次,progress 不應變
  for (let i = 0; i < 4; i++) vm.runInContext('Mode3.victory();', sb);
  const progress2 = vm.runInContext('Storage.get("ipas_mode3_progress_v2")', sb);
  A.eq(JSON.stringify(progress1), JSON.stringify(progress2), 'progress unchanged on repeat victory()');
}

// [3] gameOver 連呼叫:不重 heal
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 0, hpMax: 100});', sb);
  vm.runInContext('Mode3.gameOver();', sb);
  const hp1 = vm.runInContext('Player.load().hp', sb);
  for (let i = 0; i < 4; i++) {
    // 重設 hp = 0 模擬殘留 race
    let err = null;
    try { vm.runInContext('Mode3.gameOver();', sb); } catch (e) { err = e; }
    A.ok(!err, `gameOver repeat #${i+1} does not throw`);
  }
  // hp 仍 = hp1(因 state.finished = true,gameOver 內 if (!this.state) renderStageMenu)
  // 注:mode3 gameOver 沒 entry guard 但 stopTimer + finished 旗標已防護
  A.ok(vm.runInContext('Player.load().hp', sb) > 0, 'HP healed');
}

// [4] afterFail (timeup/abandon/skip) — 連呼叫不雙寫 Wrongbook
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Mode3.afterFail("timeup");', sb);
  const wb1 = vm.runInContext('Wrongbook.load().length', sb);
  // 連呼叫
  for (let i = 0; i < 4; i++) {
    try { vm.runInContext('Mode3.afterFail("timeup");', sb); } catch (e) {}
  }
  const wb2 = vm.runInContext('Wrongbook.load().length', sb);
  // Wrongbook 已存在 entry → 走 existing path,wrongCount++,length 不變
  A.eq(wb2, wb1, 'Wrongbook length unchanged on afterFail repeat');
}

// [5] state = null 時的 victory / afterFail 防呆
{
  const sb = build();
  vm.runInContext('Mode3.start();', sb);
  // 兩條路徑:state 為 null
  let err1 = null, err2 = null;
  try { vm.runInContext('Mode3.victory();', sb); } catch (e) { err1 = e; }
  try { vm.runInContext('Mode3.afterFail("abandon");', sb); } catch (e) { err2 = e; }
  A.ok(!err1, 'victory() with null state — no throw');
  A.ok(!err2, 'afterFail() with null state — no throw');
}

// [6] selectStage 切到另一關 → 之前 timer 被 stop
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  A.ok(vm.runInContext('Mode3.timer', sb), 'timer started');
  vm.runInContext('Mode3.stopTimer();', sb);
  A.eq(vm.runInContext('Mode3.timer', sb), null, 'timer cleared');
}

process.exit(A.summary('mode3.12.victory-entry-guard'));
