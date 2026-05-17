// 07-player-cross-mode.test.js  ★ PR #27 PL-2 待修
// 必證:HP 跨 mode 持續;Mode 7 surrender HP=0 後進 Mode 1 行為

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 07 Player cross-mode ===\n');
const A = makeAssert();

// ----- [1] Player.load 預設 HP=100 -----
console.log('\n[1] Player 預設值');
{
  const sb = makeSandbox();
  const { Player } = loadSharedLayer(sb);
  const p = Player.load();
  A.eq(p.hp, 100, '預設 hp=100');
  A.eq(p.hpMax, 100, '預設 hpMax=100');
  A.eq(p.mp, 50, '預設 mp=50');
  A.eq(p.level, 1, '預設 level=1');
}

// ----- [2] damage / heal 跨 mode 持續 -----
console.log('\n[2] damage/heal 跨 mode 持續');
{
  const sb = makeSandbox();
  const { Player } = loadSharedLayer(sb);
  Player.damage(30); // mode 1 戰鬥扣血
  let p = Player.load();
  A.eq(p.hp, 70, '扣 30 後 hp=70');
  Player.damage(20); // mode 3 戰鬥扣血
  p = Player.load();
  A.eq(p.hp, 50, '再扣 20 → hp=50');
  Player.heal(10);
  p = Player.load();
  A.eq(p.hp, 60, 'heal 10 → hp=60');
}

// ----- [3] HP=0 後不可繼續扣到負 -----
console.log('\n[3] HP 邊界 0');
{
  const sb = makeSandbox();
  const { Player } = loadSharedLayer(sb);
  Player.damage(200);
  A.eq(Player.load().hp, 0, '超過扣血夾到 0');
  // heal 不能超 hpMax
  Player.heal(999);
  A.eq(Player.load().hp, 100, 'heal 夾到 hpMax');
}

// ----- [4] Mode 7 surrender HP=0 後 — PR #27 PL-2 待修 -----
// 預期(目前行為):surrender 扣 10 後 HP 累計可能=0
// 接著進 Mode 1:Mode 1 不會 reset Player(除非「重置」按鈕)
// 必證:HP=0 進 Mode 1 後仍是 HP=0(未被自動恢復)
console.log('\n[4] surrender → HP=0 後進 Mode 1');
{
  const sb = makeSandbox();
  const { Player } = loadSharedLayer(sb);
  Player.damage(95); // 剩 hp=5
  A.eq(Player.load().hp, 5, '剩 hp=5');
  // surrender 扣 10:卡到 0
  Player.damage(10);
  A.eq(Player.load().hp, 0, 'surrender 後 hp=0');
  // 模擬進 Mode 1:沒按重置 → hp 應仍=0
  // 注意:Mode 1 載入時 Player.load() 不會自動 heal
  A.eq(Player.load().hp, 0, '進 Mode 1 後 hp 仍=0(待 reset 才回 100)');
  // Mode 1 _gameOver 路徑會 reset:在 mode1.js 內 Player.reset()
  // 必證 PR #27 PL-2:這是現有「behavior」— 待修方向是「在 surrender 時自動 reset」
  // 我們確認 Mode 7 surrender 不自動 reset(若哪天加 reset 此測試會失敗,提醒同步修改)
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  const surrenderBlock = m7.match(/surrender\(\)\s*\{([\s\S]*?)^\s+\}/m);
  if (surrenderBlock) {
    const body = surrenderBlock[1];
    A.ok(!/Player\.reset/.test(body), 'PR #27 PL-2 待修:Mode 7 surrender 目前 *沒有* Player.reset(behavior baseline)');
  }
}

// ----- [5] level up 機制 -----
console.log('\n[5] gainExp / levelUp 跨 mode 累加');
{
  const sb = makeSandbox();
  const { Player } = loadSharedLayer(sb);
  Player.gainExp(50);
  let p = Player.load();
  A.eq(p.level, 1, '50 EXP 不足升級');
  A.eq(p.exp, 50, 'exp=50');
  Player.gainExp(60); // 110 total, expMax=100 → 升級
  p = Player.load();
  A.eq(p.level, 2, '110 EXP → level 2');
  A.eq(p.hpMax, 120, 'level up hpMax +20');
  A.eq(p.hp, 120, 'level up 滿血');
  A.eq(p.skillPoints, 1, '+1 skillPoint');
}

// ----- [6] reset 完全清除(用於 mode1 _gameOver) -----
console.log('\n[6] reset');
{
  const sb = makeSandbox();
  const { Player } = loadSharedLayer(sb);
  Player.damage(50);
  Player.gainExp(200);
  Player.reset();
  const p = Player.load();
  A.eq(p.hp, 100, 'reset 後 hp=100');
  A.eq(p.level, 1, 'reset 後 level=1');
  A.eq(p.exp, 0, 'reset 後 exp=0');
}

process.exit(A.summary('07-player-cross-mode'));
