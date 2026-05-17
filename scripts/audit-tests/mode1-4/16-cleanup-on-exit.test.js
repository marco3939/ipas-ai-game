// 16 — Mode 4 cleanup on exit / timer / skills / victory entry guard
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureMatchingQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const questions = [];
  for (let i = 0; i < 8; i++) {
    questions.push(fixtureMatchingQuestion({
      id: 'q_match_' + i,
      stem: `配對概念:**概念${i}** 對應的描述是?`,
      options: [
        { text: `這是概念${i}的正解描述`, is_correct: true },
        { text: `干擾 ${i}-A`, is_correct: false },
        { text: `干擾 ${i}-B`, is_correct: false },
        { text: `干擾 ${i}-C`, is_correct: false }
      ]
    }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode4.js'));
  return sb;
}

console.log('=== Mode 4 — cleanup on exit / timer / victory guard ===');

// [1] exit():confirm true → state.finished + state.outcomeRendered + stopTimer + goHome
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('window.confirm = () => true;', sb);
  vm.runInContext('Mode4.exit();', sb);
  A.eq(vm.runInContext('Mode4.state.finished', sb), true, 'state.finished = true');
  A.eq(vm.runInContext('Mode4.state.outcomeRendered', sb), true, 'outcomeRendered = true');
  A.eq(vm.runInContext('Mode4.timer', sb), null, 'timer cleared');
  A.eq(vm.runInContext('Mode4.dragState', sb), null, 'dragState cleared');
}

// [2] exit():confirm false → state 不變
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('window.confirm = () => false;', sb);
  vm.runInContext('Mode4.exit();', sb);
  A.eq(vm.runInContext('Mode4.state.finished', sb), false, 'state.finished stays false');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [3] victory entry guard:連呼叫 5 次,EXP 只發一次
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  // 模擬已配對 8 對狀態
  vm.runInContext(`
    Mode4.state.matched = 8;
    Mode4.state.maxCombo = 3;
    Mode4.state.time = 30;
    Mode4.state.mismatched = 0;
    Mode4.state.score = 1000;
  `, sb);
  const expBefore = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  for (let i = 0; i < 5; i++) vm.runInContext('Mode4.victory();', sb);
  const expAfter = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  const delta = expAfter - expBefore;
  A.ok(delta > 0, 'EXP awarded');
  A.ok(delta < 3000, 'EXP not 5x awarded (entry guard works)');
  A.eq(vm.runInContext('Mode4.state.outcomeRendered', sb), true, 'outcomeRendered = true');
  A.eq(vm.runInContext('Mode4.state.finished', sb), true, 'finished = true');
}

// [4] defeat entry guard:state.outcomeRendered=true 後再呼 defeat 不重寫
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Mode4.defeat("test reason");', sb);
  const view1 = sb.document.getElementById('view-play').innerHTML.length;
  vm.runInContext('Mode4.defeat("another reason");', sb); // 第二次呼叫
  const view2 = sb.document.getElementById('view-play').innerHTML.length;
  A.eq(view1, view2, 'defeat second-call early-returns (no re-render)');
}

// [5] timeUp 在 matched < pairCount → defeat
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Mode4.state.time = 0;', sb);
  vm.runInContext('Mode4.timeUp();', sb);
  A.eq(vm.runInContext('Mode4.state.finished', sb), true, 'finished = true');
  A.eq(vm.runInContext('Mode4.state.outcomeRendered', sb), true, 'outcomeRendered = true');
}

// [6] timeUp 在 matched = pairCount → victory
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Mode4.state.matched = Mode4.state.pairCount; Mode4.state.time = 0;', sb);
  vm.runInContext('Mode4.timeUp();', sb);
  // victory path:會寫 industries? No, mode4 uses storage K_? Actually Mode4 doesn't persist
  // We just check finished
  A.eq(vm.runInContext('Mode4.state.finished', sb), true, 'finished after timeUp+full');
}

// [7] gameOver:Player.heal(40) 後走 defeat
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 0, hpMax: 100});', sb);
  vm.runInContext('Mode4.gameOver();', sb);
  A.eq(vm.runInContext('Player.load().hp', sb), 40, 'HP healed to 40');
  A.eq(vm.runInContext('Mode4.state.outcomeRendered', sb), true, 'outcomeRendered = true after gameOver');
}

// [8] useReveal / useFreeze / useShuffle MP 不足:不扣 MP
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 0});', sb);
  for (const f of ['useReveal', 'useFreeze', 'useShuffle']) {
    vm.runInContext(`Mode4.${f}();`, sb);
  }
  A.eq(vm.runInContext('Player.load().mp', sb), 0, 'MP unchanged when insufficient');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [9] useFreeze 已凍結時不重複扣 MP
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Player.save({...Player.load(), mp: 50, mpMax: 50});', sb);
  vm.runInContext('Mode4.useFreeze();', sb);
  const mp1 = vm.runInContext('Player.load().mp', sb);
  A.eq(mp1, 32, 'MP -18 for freeze');
  vm.runInContext('Mode4.useFreeze();', sb);
  const mp2 = vm.runInContext('Player.load().mp', sb);
  A.eq(mp2, mp1, '2nd freeze blocked (already frozen)');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [10] state = null 時各方法防呆
{
  const sb = build();
  vm.runInContext('Mode4.start(); Mode4.stopTimer(); Mode4.state = null;', sb);
  const fns = ['victory', 'defeat', 'gameOver', 'timeUp', 'useReveal', 'useFreeze', 'useShuffle', 'drillThis'];
  for (const f of fns) {
    let err = null;
    try { vm.runInContext(`Mode4.${f}();`, sb); } catch (e) { err = e; }
    A.ok(!err, `Mode4.${f}() with null state — no throw`);
  }
}

// [11] cleanup:state.finished=true 不影響 stopTimer 與 cleanupBattleArtifacts
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  // 模擬殘留 toast
  vm.runInContext(`
    const t = document.createElement('div');
    t.id = 'm4-mismatch-toast';
    document.body.appendChild(t);
  `, sb);
  A.ok(sb.document.getElementById('m4-mismatch-toast'), 'toast inserted');
  vm.runInContext('window.confirm = () => true; Mode4.exit();', sb);
  A.eq(sb.document.getElementById('m4-mismatch-toast'), null, 'toast removed by cleanup on exit');
}

process.exit(A.summary('mode4.16.cleanup-on-exit'));
