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

// ----- [7] gainExp negative -----
console.log('\n[7] gainExp negative');
{
  const sb = setup();
  sb.Player.gainExp(50);
  const p = sb.Player.gainExp(-10);
  A.eq(p.exp, 40, 'negative gainExp subtracts (BUG candidate: no validation, but actual behavior subtracts)');
}

// ----- [8] gainExp zero -----
console.log('\n[8] gainExp 0');
{
  const sb = setup();
  const p = sb.Player.gainExp(0);
  A.eq(p.exp, 0, 'exp=0');
  A.eq(p.level, 1, 'no change');
}

// ----- [9] CRITICAL BUG: expMax=0 → infinite loop -----
console.log('\n[9] CRITICAL BUG TEST: expMax=0 infinite loop');
{
  const sb = setup();
  // 注入 expMax=0
  sb.Storage.set('ipas_player_v1', { hp:100, hpMax:100, mp:50, mpMax:50,
    level:1, exp:0, expMax:0, skillPoints:0,
    stats:{analysis:5,planning:5,decision:5,technical:5},
    skills:{hint:false,eliminate:false,double:false} });
  // 任何 gainExp(amt where amt >= 0) 會無限迴圈
  // 用 setTimeout watchdog 中斷:無法在 sync 環境設,改用 try/catch 偵測
  let hung = false;
  // 我們用一個粗暴的方法:設一個 maxIterations 限制,但既存程式沒這個 limit
  // 改用 spy:在 GameFX.levelUp 計次,呼叫 N 次就強行 throw
  let callCount = 0;
  sb.GameFX = {
    levelUp: () => {
      callCount++;
      if (callCount > 10000) {
        hung = true;
        throw new Error('INFINITE_LOOP_DETECTED');
      }
    },
    flash: () => {}
  };
  // 重新 inject Player(因為 closure 已綁原 GameFX)— 用 vm.runInContext eval Player.gainExp
  // 但 Player 已 bound — 直接呼叫
  // 由於 GameFX 在 sandbox 上是 ctx property,runtime 查找會拿到新值
  let threw = false;
  try {
    sb.Player.gainExp(1);  // amt=1, exp=1, expMax=0 → while(1>=0) infinite
  } catch (e) {
    threw = true;
  }
  A.ok(threw && hung, `⚠️ CRITICAL: expMax=0 → infinite loop confirmed (broke after ${callCount} levelups)`);
}

// ----- [10] gainExp NaN -----
console.log('\n[10] gainExp NaN');
{
  const sb = setup();
  const p = sb.Player.gainExp(NaN);
  // exp += NaN → NaN; NaN >= expMax = false → no loop;但 save 後 JSON.stringify(NaN)=null
  A.ok(isNaN(p.exp), `exp NaN in return value (${p.exp})`);
  // 重新 load:NaN 被 JSON 序列化為 null → 下次 load 變 null
  // 後續 gainExp(10) → exp = null + 10 = 10(JSON 自動清洗 NaN)
  const p2 = sb.Player.gainExp(10);
  A.ok(!isNaN(p2.exp) && p2.exp === 10,
    `JSON.stringify(NaN)=null self-heals: next gainExp(10) → exp=${p2.exp}`);
}

// ----- [11] gainExp Infinity (HIGH bug: massive level inflation + state corruption) -----
console.log('\n[11] gainExp Infinity → massive level inflation');
{
  const sb = setup();
  let callCount = 0;
  sb.GameFX = {
    levelUp: () => {
      callCount++;
      if (callCount > 100000) throw new Error('TOO_MANY');
    },
    flash: () => {}
  };
  let threw = false;
  try { sb.Player.gainExp(Infinity); } catch { threw = true; }
  const p = sb.Player.load();
  A.ok(!threw, `loop self-terminates via Infinity-Infinity=NaN (after ${callCount} levelups)`);
  A.ok(p.level > 100,
    `⚠️ HIGH BUG: gainExp(Infinity) inflated level to ${p.level} (BUG: no upper-bound on gainExp input)`);
  A.ok(p.expMax === null || p.expMax === Infinity || isNaN(p.expMax),
    `⚠️ HIGH BUG: state corruption — expMax=${p.expMax}`);
}

// ----- [12] damage NaN / Infinity -----
console.log('\n[12] damage NaN/Infinity');
{
  const sb = setup();
  const hp1 = sb.Player.damage(NaN);
  A.ok(isNaN(hp1), `⚠️ damage(NaN) → hp=NaN (BUG: no input validation)`);
  // reset fully (NaN now JSON-stringified to null and saved)
  sb.Player.reset();
  const hp2 = sb.Player.damage(Infinity);
  A.eq(hp2, 0, 'damage(Infinity) → hp=0 (Math.max clamps)');
  // 再 reset 才能驗證 negative damage
  sb.Player.reset();
  const hp3 = sb.Player.damage(-50);
  // 100 - (-50) = 150 → Math.max(0, 150) = 150 — BUG: hp > hpMax via negative damage
  A.eq(hp3, 150, `⚠️ damage(-50) → hp=${hp3} > hpMax (BUG: negative damage heals beyond cap)`);
}

// ----- [13] heal negative -----
console.log('\n[13] heal negative');
{
  const sb = setup();
  sb.Player.damage(30); // hp=70
  const hp = sb.Player.heal(-20);
  // Math.min(100, 70 + (-20)) = Math.min(100, 50) = 50
  A.eq(hp, 50, '⚠️ heal(-20) → hp drops to 50 (BUG candidate: negative heal damages)');
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
