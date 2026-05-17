// 10 — Mode 3 pipeline drag flow:全對 / 全錯 / 部分
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureSequenceQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const q = fixtureSequenceQuestion({
    id: 'q_pc_seq_001',
    options: [
      { text: '步驟A -> 步驟B -> 步驟C -> 步驟D', is_correct: true },
      { text: '步驟D -> 步驟C -> 步驟B -> 步驟A', is_correct: false },
      { text: '步驟B -> 步驟A -> 步驟D -> 步驟C', is_correct: false },
      { text: '步驟C -> 步驟D -> 步驟A -> 步驟B', is_correct: false }
    ]
  });
  const sb = makeSandbox({ questions: [q] });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode3.js'));
  return sb;
}

console.log('=== Mode 3 — pipeline drag flow ===');

// [1] 全對:依正確順序 tryPlace,correctPlacements 累積到 steps.length → victory
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  const steps = vm.runInContext('Mode3.state.steps', sb);
  // 對每一步:找到對應卡 → tryPlace 到正確 slotIdx
  for (let i = 0; i < steps.length; i++) {
    const target = steps[i];
    const cardId = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(target)}).id`, sb);
    vm.runInContext(`Mode3.tryPlace("${cardId}", ${i});`, sb);
  }
  // 進入 victory:state.finished 或 victorySettled
  const state = vm.runInContext('Mode3.state', sb);
  A.ok(state && state.victorySettled, 'victorySettled = true after all-correct');
  A.eq(state.finished, true, 'finished = true');
  A.eq(state.correctPlacements, steps.length, 'correctPlacements = steps');
  const progress = vm.runInContext('Storage.get("ipas_mode3_progress_v2", null)', sb);
  A.ok(progress && progress.stages && progress.stages.q_pc_seq_001.cleared, 'progress stage cleared');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [2] 全錯:每次 tryPlace 都放錯位置 → wrongDrops++, HP 下降
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 100, hpMax: 100});', sb);
  const hpBefore = vm.runInContext('Player.load().hp', sb);
  // 拿任意一張卡片放到錯位 slot 0(設為非該 slot 對應的)
  const steps = vm.runInContext('Mode3.state.steps', sb);
  const wrongTarget = steps[1]; // 應該放 slot 1,但我們放 slot 0
  const cardId = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(wrongTarget)}).id`, sb);
  vm.runInContext(`Mode3.tryPlace("${cardId}", 0);`, sb);
  // wrongDrops 增加,combo 歸 0
  A.eq(vm.runInContext('Mode3.state.wrongDrops', sb), 1, 'wrongDrops = 1');
  A.eq(vm.runInContext('Mode3.state.combo', sb), 0, 'combo = 0');
  A.ok(vm.runInContext('Player.load().hp', sb) < hpBefore, 'HP decreased');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [3] 部分對:對 2 步後放錯 → 對的 2 步算數,combo 歸 0
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  const steps = vm.runInContext('Mode3.state.steps', sb);
  // 對 2 步
  for (let i = 0; i < 2; i++) {
    const cardId = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(steps[i])}).id`, sb);
    vm.runInContext(`Mode3.tryPlace("${cardId}", ${i});`, sb);
  }
  A.eq(vm.runInContext('Mode3.state.correctPlacements', sb), 2, 'correctPlacements = 2');
  A.eq(vm.runInContext('Mode3.state.combo', sb), 2, 'combo = 2');
  // 第 3 步放錯 — wrongDrops++、combo 歸 0
  const wrongCard = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(steps[3])}).id`, sb);
  vm.runInContext(`Mode3.tryPlace("${wrongCard}", 2);`, sb);
  A.eq(vm.runInContext('Mode3.state.correctPlacements', sb), 2, 'correctPlacements unchanged');
  A.eq(vm.runInContext('Mode3.state.combo', sb), 0, 'combo reset to 0');
  A.eq(vm.runInContext('Mode3.state.wrongDrops', sb), 1, 'wrongDrops = 1');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [4] 雙擊同一 tryPlace(冷卻):第 2 次因 _placeCooldown 被擋
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  // 放錯一次 → _placeCooldown = true
  const steps = vm.runInContext('Mode3.state.steps', sb);
  const wrongCard = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(steps[1])}).id`, sb);
  vm.runInContext(`Mode3.tryPlace("${wrongCard}", 0);`, sb);
  A.eq(vm.runInContext('Mode3._placeCooldown', sb), true, '_placeCooldown set after wrong drop');
  // 立刻再 tryPlace — 應被擋
  const correctCard = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(steps[0])}).id`, sb);
  const wbBefore = vm.runInContext('Mode3.state.correctPlacements', sb);
  vm.runInContext(`Mode3.tryPlace("${correctCard}", 0);`, sb);
  A.eq(vm.runInContext('Mode3.state.correctPlacements', sb), wbBefore, 'tryPlace blocked during _placeCooldown');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [5] HP 歸 0 → gameOver
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 1, hpMax: 100});', sb);
  const steps = vm.runInContext('Mode3.state.steps', sb);
  // 放錯一次 — HP 8 dmg ≈ 1 hit 即 game over
  const wrongCard = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(steps[1])}).id`, sb);
  vm.runInContext(`Mode3.tryPlace("${wrongCard}", 0);`, sb);
  // HP 應 <=0,觸發 gameOver
  A.ok(vm.runInContext('Player.load().hp', sb) > 0, 'HP healed back (gameOver heals half)');
  A.eq(vm.runInContext('Mode3.state.finished', sb), true, 'state.finished = true');
}

// [6] abandon:state.finished 設 true,renderStageMenu
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Mode3.abandon();', sb);
  A.eq(vm.runInContext('Mode3.state.finished', sb), true, 'abandon sets state.finished');
}

// [7] timeUp → afterFail('timeup')
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Mode3.timeUp();', sb);
  A.eq(vm.runInContext('Mode3.state.finished', sb), true, 'timeUp sets state.finished');
  // Mastery + Wrongbook 紀錄 failed
  const wb = vm.runInContext('Wrongbook.load()', sb);
  A.ok(wb.length > 0, 'Wrongbook has timeup entry');
  A.eq(wb[0].qid, 'q_pc_seq_001', 'Wrongbook qid correct');
  A.eq(wb[0].userChoice, '?', 'userChoice = ? for pipeline');
  A.eq(wb[0].correctChoice, '?', 'correctChoice = ? for pipeline');
}

// [8] victory entry guard:連呼叫 5 次不重發 EXP
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  const steps = vm.runInContext('Mode3.state.steps', sb);
  for (let i = 0; i < steps.length; i++) {
    const cardId = vm.runInContext(`Mode3.state.pool.find(c => c.text === ${JSON.stringify(steps[i])}).id`, sb);
    vm.runInContext(`Mode3.tryPlace("${cardId}", ${i});`, sb);
  }
  const exp1 = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  // 連呼叫 4 次
  for (let i = 0; i < 4; i++) vm.runInContext('Mode3.victory();', sb);
  const exp5 = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  A.eq(exp1, exp5, 'EXP not double-awarded');
  vm.runInContext('Mode3.stopTimer();', sb);
}

process.exit(A.summary('mode3.10.pipeline-drag-flow'));
