// 08 — Mode 2 drillThis vs gameOver race window (案例 6)
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const questions = [];
  for (let i = 1; i <= 5; i++) {
    questions.push(fixtureQuestion({ id: 'q_pa_' + String(i).padStart(3, '0'), knowledge_code: 'L23102', node_id: 'L23102.A', format: 'code_reading' }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode2.js'));
  return sb;
}

console.log('=== Mode 2 — drillThis vs gameOver race ===');

// [1] 答錯後 hp 充足 → drillThis 啟動 DrillSession
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  // 不讓 hp 跌到 0
  vm.runInContext('Player.save({...Player.load(), hp: 80});', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  A.eq(vm.runInContext('Mode2.state.gameOverPending', sb), false, 'gameOverPending false (hp OK)');
  vm.runInContext('DrillSession.reset();', sb);
  // 把 DrillSession autoComplete 關掉(用 _autoComplete=false 阻止同步 callback)
  vm.runInContext('DrillSession._autoComplete = false;', sb);
  vm.runInContext('Mode2.drillThis();', sb);
  A.eq(vm.runInContext('DrillSession._calls.length', sb), 1, 'DrillSession.start called once');
  A.ok(vm.runInContext('DrillSession._calls[0].nodeId', sb), 'nodeId passed to DrillSession');
}

// [2] drillThis 沒變化型可用 → showToast 但 DrillSession 不被呼叫
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  // 把 generateVariation 換成回傳空陣列(stub)
  vm.runInContext('window.generateVariation = function() { return []; };', sb);
  vm.runInContext('DrillSession.reset();', sb);
  vm.runInContext('Mode2.drillThis();', sb);
  A.eq(vm.runInContext('DrillSession._calls.length', sb), 0, 'DrillSession not called when 0 variations');
}

// [3] drillThis callback 內 state 已 null → onComplete 走 start()(回地圖)
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 80});', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  // 設定 stub:在 callback 前先把 state 清掉(模擬中途使用者退避)
  vm.runInContext(`
    DrillSession.reset();
    DrillSession._autoComplete = false;
    DrillSession.start = function(nodeId, vars, q, cb) {
      this._calls.push({ nodeId, vars });
      // 清 state 模擬中途切走
      Mode2.state = null;
      cb && cb();
    };
  `, sb);
  let err = null;
  try { vm.runInContext('Mode2.drillThis();', sb); } catch (e) { err = e; }
  A.ok(!err, 'drillThis callback handles null state without throw');
}

// [4] drillThis 在 state.currentQ 為 null 時不啟動
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Mode2.state.currentQ = null;', sb);
  vm.runInContext('DrillSession.reset();', sb);
  vm.runInContext('Mode2.drillThis();', sb);
  A.eq(vm.runInContext('DrillSession._calls.length', sb), 0, 'drillThis blocked when currentQ null');
}

// [5] 答錯後 hp 歸 0,1.5s race window 內(同步測試:gameOverPending=true)— drillThis 不啟動
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 1});', sb);
  const wKey = vm.runInContext('Mode2.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode2.answer("${wKey}")`, sb);
  vm.runInContext('DrillSession.reset();', sb);
  vm.runInContext('Mode2.drillThis();', sb);
  A.eq(vm.runInContext('DrillSession._calls.length', sb), 0, 'drillThis blocked during gameOver race window');
}

// [6] showQuestion 在 gameOverPending=true 時不渲染新題
{
  const sb = build();
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  vm.runInContext('Mode2.state.gameOverPending = true;', sb);
  // showQuestion 應 early return,不會建立新 currentQ
  const oldQ = vm.runInContext('Mode2.state.currentQ', sb);
  vm.runInContext('Mode2.state.idx++;', sb); // 推進 idx
  vm.runInContext('Mode2.showQuestion();', sb);
  const newQ = vm.runInContext('Mode2.state.currentQ', sb);
  // 應該沒換題(currentQ 留在 idx-1 的)
  A.ok(oldQ && newQ && oldQ.id === newQ.id, 'showQuestion early-return when gameOverPending');
}

process.exit(A.summary('mode2.08.drillthis-vs-gameover'));
