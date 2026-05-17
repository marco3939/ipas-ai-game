// 07 — Mode 2 takeDamage → gameOver race (案例 6 教訓)
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

console.log('=== Mode 2 — takeDamage → gameOver race ===');

// [1] takeDamage 排了 1500ms gameOver setTimeout;在那期間 victory 不應觸發
//     由於 gameOverPending = true 後,showQuestion / next 也應該擋住新題渲染
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 1});', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  A.eq(vm.runInContext('Mode2.state.gameOverPending', sb), true, 'gameOverPending = true');
  // 試圖 next() — 應該被擋(因 gameOverPending)
  vm.runInContext('Mode2.next();', sb);
  // next 內若 gameOverPending → return;state.idx 不變
  A.eq(vm.runInContext('Mode2.state.idx', sb), 0, 'next() blocked when gameOverPending');
}

// [2] drillThis 在 gameOverPending 時被擋(防止下鑽蓋掉 gameOver)
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 1});', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  vm.runInContext('DrillSession.reset();', sb);
  vm.runInContext('Mode2.drillThis();', sb);
  const calls = vm.runInContext('DrillSession._calls.length', sb);
  A.eq(calls, 0, 'drillThis blocked when gameOverPending');
}

// [3] gameOver 被連呼叫 5 次:state 清空後,後續 gameOver 防呆不 throw
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  for (let i = 0; i < 5; i++) {
    let err = null;
    try { vm.runInContext('Mode2.gameOver();', sb); } catch (e) { err = e; }
    A.ok(!err, `gameOver call #${i+1} does not throw`);
  }
  A.eq(vm.runInContext('Mode2.state', sb), null, 'state cleared after gameOver');
}

// [4] victory 被連呼叫:state 已 null 不重發 EXP
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  // 製造 victory 條件
  vm.runInContext('Mode2.state.bossHp = 0; Mode2.state.correct = 5;', sb);
  const expBefore = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  vm.runInContext('Mode2.victory();', sb);
  const expAfter1 = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  // 再連呼叫 4 次
  for (let i = 0; i < 4; i++) {
    let err = null;
    try { vm.runInContext('Mode2.victory();', sb); } catch (e) { err = e; }
    A.ok(!err, `victory repeat #${i+1} does not throw (state=null)`);
  }
  const expAfter5 = vm.runInContext('Player.load().exp + Player.load().level * Player.load().expMax', sb);
  A.eq(expAfter1, expAfter5, 'EXP not double-awarded on repeated victory()');
  A.ok(expAfter1 - expBefore > 0, 'EXP awarded once');
}

// [5] state = null 時 takeDamage 呼叫 — 不 throw(實際走 if(!this.state) early return)
//     注意 mode2 takeDamage 沒有 null guard 第一行,但 attack/showExplanation/next 有。
//     測試:start() 沒 selectBoss 時呼叫 next/showQuestion → 不 throw
{
  const sb = build();
  vm.runInContext('Mode2.start();', sb);
  const fns = ['next', 'showQuestion', 'showExplanation', 'drillThis', 'useStaticAnalysis', 'useExecSimulate', 'useCodeReview'];
  for (const f of fns) {
    let err = null;
    try { vm.runInContext(`Mode2.${f}();`, sb); } catch (e) { err = e; }
    A.ok(!err, `Mode2.${f}() with null state does not throw`);
  }
}

// [6] start() 把舊 state 清為 null(避免從戰鬥退避後 1.5s gameOver 殘留觸發)
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  A.ok(vm.runInContext('Mode2.state', sb), 'state exists');
  vm.runInContext('Mode2.start();', sb);
  A.eq(vm.runInContext('Mode2.state', sb), null, 'state cleared on start()');
}

process.exit(A.summary('mode2.07.takedamage-gameover-race'));
