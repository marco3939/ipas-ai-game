// 04 — Mode 1 cleanup / setTimeout 殘留情境
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

console.log('=== Mode 1 — cleanup / timer race ===');

// [1] start() 會清掉之前的 timer queue
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 答對觸發排程一個 setTimeout(200ms 後 GameFX.shake)
  const key = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${key}")`, sb);
  const timersBefore = vm.runInContext('Mode1._timers.length', sb);
  A.ok(timersBefore > 0, '_timers has pending callbacks after answer');
  // 呼叫 start() 應清掉
  vm.runInContext('Mode1.start();', sb);
  const timersAfter = vm.runInContext('Mode1._timers.length', sb);
  A.eq(timersAfter, 0, '_timers cleared after start()');
}

// [2] selectBoss 也清 timer
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const key = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${key}")`, sb);
  A.ok(vm.runInContext('Mode1._timers.length > 0', sb), 'timers exist');
  vm.runInContext('Mode1.selectBoss("finance");', sb);
  const timersAfter = vm.runInContext('Mode1._timers.length', sb);
  A.eq(timersAfter, 0, 'timers cleared on new selectBoss');
}

// [3] drillThis 清 timer(防 takeDamage 排的 gameOver 把下鑽蓋掉,案例 6)
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 讓 player HP 接近 0,答錯後排 gameOver
  vm.runInContext('Player.save({...Player.load(), hp: 1})', sb);
  const wKey = vm.runInContext('Mode1.state.currentQ.options.find(o => !o.is_correct).key', sb);
  vm.runInContext(`Mode1.answer("${wKey}")`, sb);
  // takeDamage 在 hp <= 0 時排了 gameOver 的 setTimeout
  A.ok(vm.runInContext('Mode1._timers.length > 0', sb), 'gameOver setTimeout pending');
  A.ok(vm.runInContext('Player.load().hp', sb) <= 0, 'hp <= 0');
  // 呼叫 drillThis 應清掉(裡面有 _clearAllTimers())
  vm.runInContext('Mode1.drillThis();', sb);
  // 因 DrillSession stub autoComplete 同步,callback 內檢查 hp 並進入 gameOver。
  // 確認:壞 state 進到 gameOverSettled 路徑(因為 hp <=0 → gameOver in callback)
  const state = vm.runInContext('Mode1.state', sb);
  A.ok(state && state.gameOverSettled, 'drill callback detects hp=0 → gameOver settled');
}

// [4] state = null 時 showQuestion / next / takeDamage / useHint 等都防呆不 throw
{
  const sb = build();
  vm.runInContext('Mode1.start();', sb); // state = null
  const fns = ['showQuestion', 'next', 'startBattle', 'useHint', 'useEliminate', 'useDouble', 'drillThis'];
  for (const f of fns) {
    let err = null;
    try { vm.runInContext(`Mode1.${f}();`, sb); } catch (e) { err = e; }
    A.ok(!err, `Mode1.${f}() with null state does not throw`);
  }
}

// [5] resetPlayer:Player & industries 都清
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  // 假設先寫 industries
  vm.runInContext('Storage.set("ipas_mode1_industries_v1", { ecommerce: { defeated: true } })', sb);
  vm.runInContext('Mode1.resetPlayer();', sb);
  const industries = vm.runInContext('Storage.get("ipas_mode1_industries_v1", null)', sb);
  A.eq(industries, null, 'industries cleared');
  const player = vm.runInContext('Player.load()', sb);
  A.eq(player.level, 1, 'Player reset to Lv 1');
  A.eq(player.exp, 0, 'Player.exp reset to 0');
}

// [6] unlockSkill — skillPoints 必 > 0
{
  const sb = build();
  vm.runInContext('Mode1.start();', sb);
  // 直接 Player 寫 1 個 skillPoint
  vm.runInContext('Player.save({...Player.load(), skillPoints: 1})', sb);
  vm.runInContext('Mode1.unlockSkill("hint");', sb);
  const p = vm.runInContext('Player.load()', sb);
  A.eq(p.skills.hint, true, 'hint skill unlocked');
  A.eq(p.skillPoints, 0, 'skillPoint deducted');
  // 第 2 次呼叫:no skillPoint → 不會解鎖 eliminate
  vm.runInContext('Mode1.unlockSkill("eliminate");', sb);
  const p2 = vm.runInContext('Player.load()', sb);
  A.eq(p2.skills.eliminate, false, 'no skillPoint → eliminate stays false');
}

process.exit(A.summary('mode1.04.cleanup-timer-race'));
