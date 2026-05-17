// 06-player.test.js — Player 模組深度測試
// 注意:user 提到 loseExp/resetAll,實際 src 只有 reset(無 All),且無 loseExp
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');
const PlayerSrc = sliceConst(src, 'const Player = {', '// ============================================================================\n// === ProgressIO');

console.log('=== Player tests ===');
console.log('source length:', PlayerSrc.length, 'chars');

const A = makeAssert();

function setup() {
  const sb = makeSandbox();
  runSource(sb, StorageSrc, 'Storage');
  // GameFX mock already in sandbox
  runSource(sb, PlayerSrc, 'Player');
  return sb;
}

// ----- [0] API audit -----
console.log('\n[0] API audit');
{
  const sb = setup();
  A.ok(typeof sb.Player.load === 'function', 'has load');
  A.ok(typeof sb.Player.save === 'function', 'has save');
  A.ok(typeof sb.Player.damage === 'function', 'has damage');
  A.ok(typeof sb.Player.heal === 'function', 'has heal');
  A.ok(typeof sb.Player.gainExp === 'function', 'has gainExp');
  A.ok(typeof sb.Player.reset === 'function', 'has reset');
  // 使用者問到的 loseExp / resetAll(預期不存在)
  A.ok(typeof sb.Player.loseExp === 'undefined', 'NO loseExp (user task assumption wrong)');
  A.ok(typeof sb.Player.resetAll === 'undefined', 'NO resetAll (only reset)');
}

// ----- [1] default load -----
console.log('\n[1] default state');
{
  const sb = setup();
  const p = sb.Player.load();
  A.eq(p.hp, 100, 'hp=100');
  A.eq(p.hpMax, 100, 'hpMax=100');
  A.eq(p.mp, 50, 'mp=50');
  A.eq(p.level, 1, 'level=1');
  A.eq(p.exp, 0, 'exp=0');
  A.eq(p.expMax, 100, 'expMax=100');
  A.eq(p.skillPoints, 0, 'skillPoints=0');
  A.ok(typeof p.stats === 'object', 'stats object');
  A.ok(typeof p.skills === 'object', 'skills object');
}

// ----- [2] damage -----
console.log('\n[2] damage');
{
  const sb = setup();
  const hp1 = sb.Player.damage(30);
  A.eq(hp1, 70, 'damage 30 → 70');
  const hp2 = sb.Player.damage(80);
  A.eq(hp2, 0, 'over-damage clamps to 0');
  const hp3 = sb.Player.damage(50);
  A.eq(hp3, 0, 'damage from 0 stays 0');
}

// ----- [3] heal -----
console.log('\n[3] heal');
{
  const sb = setup();
  sb.Player.damage(50); // hp=50
  const hp1 = sb.Player.heal(20);
  A.eq(hp1, 70, 'heal 20 → 70');
  const hp2 = sb.Player.heal(1000);
  A.eq(hp2, 100, 'over-heal clamps to hpMax');
}

// ----- [4] gainExp without levelup -----
console.log('\n[4] gainExp no levelup');
{
  const sb = setup();
  const p = sb.Player.gainExp(50);
  A.eq(p.exp, 50, 'exp=50');
  A.eq(p.level, 1, 'level still 1');
  A.eq(p.expMax, 100, 'expMax still 100');
}

// ----- [5] gainExp single levelup -----
console.log('\n[5] gainExp single levelup');
{
  const sb = setup();
  const p = sb.Player.gainExp(100);
  A.eq(p.level, 2, 'level=2');
  A.eq(p.exp, 0, 'exp reset to 0');
  A.eq(p.expMax, 150, 'expMax 100→150');
  A.eq(p.hpMax, 120, 'hpMax 100→120');
  A.eq(p.mpMax, 60, 'mpMax 50→60');
  A.eq(p.skillPoints, 1, 'skillPoints +1');
}

// ----- [6] gainExp multi-levelup loop -----
console.log('\n[6] gainExp multi-levelup');
{
  const sb = setup();
  // 100 + 150 + 225 + ... — first 4 levels
  const p = sb.Player.gainExp(1000);
  A.ok(p.level >= 2, `level ${p.level} reached`);
  // Calculate expected:
  // L1→2: spends 100, level=2, expMax=150, remaining 900
  // L2→3: spends 150, level=3, expMax=225, remaining 750
  // L3→4: spends 225, level=4, expMax=337 (floor 337.5), remaining 525
  // L4→5: spends 337, level=5, expMax=505, remaining 188
  // 188 < 505 → stop. level=5, exp=188
  A.eq(p.level, 5, 'level=5 from 1000 exp');
  A.eq(p.exp, 188, 'remaining exp=188');
}

// ----- [7] gainExp negative (PR #28 fix: A-H1 入口 isFinite + ≥0 guard, 不再扣 exp) -----
console.log('\n[7] gainExp negative — PR #28 A-H1 fix');
{
  const sb = setup();
  sb.Player.gainExp(50);
  const p = sb.Player.gainExp(-10);
  A.eq(p.exp, 50, '✅ PR #28 A-H1 fix: negative gainExp early-return, exp 不被改');
}

// ----- [8] gainExp zero -----
console.log('\n[8] gainExp 0');
{
  const sb = setup();
  const p = sb.Player.gainExp(0);
  A.eq(p.exp, 0, 'exp=0');
  A.eq(p.level, 1, 'no change');
}

// ----- [9] expMax=0 → 不再 infinite loop(PR #28 A-C1 修補)-----
console.log('\n[9] expMax=0 — PR #28 A-C1 fix (while expMax>0 守衛)');
{
  const sb = setup();
  sb.Storage.set('ipas_player_v1', { hp:100, hpMax:100, mp:50, mpMax:50,
    level:1, exp:0, expMax:0, skillPoints:0,
    stats:{analysis:5,planning:5,decision:5,technical:5},
    skills:{hint:false,eliminate:false,double:false} });
  let callCount = 0;
  sb.GameFX = {
    levelUp: () => { callCount++; if (callCount > 10000) throw new Error('still hangs'); },
    flash: () => {}
  };
  let threw = false;
  try { sb.Player.gainExp(1); } catch (e) { threw = true; }
  const p = sb.Player.load();
  A.ok(!threw, '✅ PR #28 A-C1 fix: 不再 throw');
  A.eq(callCount, 0, `✅ levelUp 從未被呼叫(while expMax>0 守住)`);
  A.eq(p.level, 1, `✅ level 維持 1`);
  A.eq(p.exp, 1, `✅ exp 仍累積 1(amt 還是有效)`);
}

// ----- [10] gainExp NaN(PR #28 A-H1 修補:NaN 入口擋)-----
console.log('\n[10] gainExp NaN — PR #28 A-H1 fix');
{
  const sb = setup();
  const p = sb.Player.gainExp(NaN);
  A.ok(!isNaN(p.exp), `✅ PR #28 fix: NaN 早 return,exp 不被污染(${p.exp})`);
  A.eq(p.exp, 0, 'exp 維持 0');
  const p2 = sb.Player.gainExp(10);
  A.eq(p2.exp, 10, `後續正常呼叫不受影響: exp=${p2.exp}`);
}

// ----- [11] gainExp Infinity(PR #28 A-H1 修補:Infinity 早 return)-----
console.log('\n[11] gainExp Infinity — PR #28 A-H1 fix');
{
  const sb = setup();
  let callCount = 0;
  sb.GameFX = { levelUp: () => { callCount++; }, flash: () => {} };
  let threw = false;
  try { sb.Player.gainExp(Infinity); } catch { threw = true; }
  const p = sb.Player.load();
  A.ok(!threw, '✅ 不 throw');
  A.eq(callCount, 0, `✅ PR #28 fix: Infinity 早 return,levelUp 從未被呼叫`);
  A.eq(p.level, 1, `✅ level 維持 1(無 inflation)`);
  A.eq(p.expMax, 100, `✅ expMax 維持 100(無污染)`);
}

// ----- [12] damage NaN/Infinity/負數(PR #28 A-H2 修補)-----
console.log('\n[12] damage NaN/Infinity/負數 — PR #28 A-H2 fix');
{
  const sb = setup();
  const hp1 = sb.Player.damage(NaN);
  A.eq(hp1, 100, `✅ PR #28 fix: damage(NaN) 視為 0,hp=${hp1} 不變`);
  sb.Player.reset();
  const hp2 = sb.Player.damage(Infinity);
  A.eq(hp2, 100, `✅ PR #28 fix: damage(Infinity) 視為 0(isFinite 擋掉),hp=${hp2} 不變`);
  sb.Player.reset();
  const hp3 = sb.Player.damage(-50);
  A.eq(hp3, 100, `✅ PR #28 fix: damage(-50) 視為 0,hp 不會 inflate`);
}

// ----- [13] heal negative(PR #28 A-H3 修補)-----
console.log('\n[13] heal negative — PR #28 A-H3 fix');
{
  const sb = setup();
  sb.Player.damage(30); // hp=70
  const hp = sb.Player.heal(-20);
  A.eq(hp, 70, `✅ PR #28 fix: heal(-20) 視為 0,hp 不變(維持 ${hp})`);
}

// ----- [14] reset -----
console.log('\n[14] reset');
{
  const sb = setup();
  sb.Player.damage(50);
  sb.Player.gainExp(200);
  sb.Player.reset();
  const p = sb.Player.load();
  A.eq(p.hp, 100, 'after reset hp=100');
  A.eq(p.level, 1, 'after reset level=1');
  A.eq(p.exp, 0, 'after reset exp=0');
}

// ----- [15] persistence across load -----
console.log('\n[15] persistence');
{
  const sb = setup();
  sb.Player.damage(40);
  sb.Player.heal(10); // hp=70
  const p = sb.Player.load();
  A.eq(p.hp, 70, 'hp persisted=70');
}

// ----- [16] HP > hpMax via heal not possible (capped) -----
console.log('\n[16] hp cap via heal');
{
  const sb = setup();
  const hp = sb.Player.heal(100);
  A.eq(hp, 100, 'heal at full → still 100');
}

// ----- [17] high-volume gainExp -----
console.log('\n[17] high-volume gainExp(1) 1000 times');
{
  const sb = setup();
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) sb.Player.gainExp(1);
  const dt = Date.now() - t0;
  const p = sb.Player.load();
  A.ok(p.level > 1, `levels up multiple times, level=${p.level}`);
  A.ok(p.exp < p.expMax, `exp=${p.exp} < expMax=${p.expMax}`);
  A.ok(dt < 5000, `1000 calls took ${dt}ms`);
}

process.exit(A.summary('Player'));
