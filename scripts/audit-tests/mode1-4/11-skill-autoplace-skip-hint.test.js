// 11 — Mode 3 skills:autoPlace / skip / hint
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

console.log('=== Mode 3 — skills ===');

// [1] skillAutoPlace:扣 10 MP,把第一個未填的 slot 填對
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 50, mpMax: 50});', sb);
  const mpBefore = vm.runInContext('Player.load().mp', sb);
  vm.runInContext('Mode3.skillAutoPlace();', sb);
  // -10 MP (skill cost) + 自動補 MP heal (combo 1: 2+1=3) = net -7
  const mpAfter = vm.runInContext('Player.load().mp', sb);
  A.ok(mpAfter < mpBefore, `MP decreased (skill cost > heal back) (${mpBefore} -> ${mpAfter})`);
  A.eq(vm.runInContext('Mode3.state.used.autoplace', sb), 1, 'used.autoplace = 1');
  A.eq(vm.runInContext('Mode3.state.correctPlacements', sb), 1, 'first slot placed');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [2] skillAutoPlace MP 不足:不扣 MP / 不改 state
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 5});', sb);
  vm.runInContext('Mode3.skillAutoPlace();', sb);
  A.eq(vm.runInContext('Player.load().mp', sb), 5, 'MP unchanged when insufficient');
  A.eq(vm.runInContext('Mode3.state.used.autoplace', sb), 0, 'used.autoplace = 0');
  A.eq(vm.runInContext('Mode3.state.correctPlacements', sb), 0, 'no slot placed');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [3] skillHint:扣 8 MP,used.hint++
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 50, mpMax: 50});', sb);
  vm.runInContext('Mode3.skillHint();', sb);
  A.eq(vm.runInContext('Player.load().mp', sb), 42, 'MP -8');
  A.eq(vm.runInContext('Mode3.state.used.hint', sb), 1, 'used.hint = 1');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [4] skillSkip:扣 15 HP,進入 afterFail('skip')
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 100, hpMax: 100});', sb);
  vm.runInContext('window.confirm = () => true;', sb); // confirm
  vm.runInContext('Mode3.skillSkip();', sb);
  A.eq(vm.runInContext('Mode3.state.finished', sb), true, 'state.finished after skip');
  A.eq(vm.runInContext('Player.load().hp', sb), 85, 'HP -15');
}

// [5] skillSkip confirm 取消 → 不執行
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 100, hpMax: 100});', sb);
  vm.runInContext('window.confirm = () => false;', sb);
  vm.runInContext('Mode3.skillSkip();', sb);
  A.eq(vm.runInContext('Mode3.state.finished', sb), false, 'skip cancelled, state not finished');
  A.eq(vm.runInContext('Player.load().hp', sb), 100, 'HP unchanged');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [6] skillAutoPlace 在 finished=true 時 noop
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Mode3.state.finished = true;', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 50});', sb);
  vm.runInContext('Mode3.skillAutoPlace();', sb);
  A.eq(vm.runInContext('Player.load().mp', sb), 50, 'MP unchanged when finished');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [7] skillSkip HP 不足歸 0 → gameOver
{
  const sb = build();
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 10, hpMax: 100});', sb);
  vm.runInContext('window.confirm = () => true;', sb);
  vm.runInContext('Mode3.skillSkip();', sb);
  // hp -15 = -5 → 0,gameOver
  A.eq(vm.runInContext('Mode3.state.finished', sb), true, 'state.finished = true after gameOver');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [8] state = null 時所有招式呼叫不 throw
{
  const sb = build();
  vm.runInContext('Mode3.start();', sb); // 還沒 select stage
  const fns = ['skillAutoPlace', 'skillHint', 'skillSkip', 'abandon', 'gameOver', 'victory', 'timeUp'];
  for (const f of fns) {
    let err = null;
    try { vm.runInContext(`Mode3.${f}();`, sb); } catch (e) { err = e; }
    A.ok(!err, `Mode3.${f}() with null state does not throw`);
  }
}

process.exit(A.summary('mode3.11.skill-autoplace-skip-hint'));
