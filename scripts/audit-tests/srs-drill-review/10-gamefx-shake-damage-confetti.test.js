// 10-gamefx-shake-damage-confetti.test.js — GameFX 防禦性測試
const { makeSandbox, loadStorage, loadGameFX, makeAssert } = require('./_helpers');
const vm = require('vm');

console.log('=== GameFX tests ===');
const A = makeAssert();

function setup() {
  const sb = makeSandbox();
  loadStorage(sb);
  // GameFX 用 window.confetti / window.gsap → 我們默認不掛(模擬 lib 未載入)
  return sb;
}

// ----- 1. flash 基本不 throw -----
console.log('\n[1] flash() basic');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.flash('correct'), 'flash("correct") no throw');
  A.nothrow(() => GameFX.flash('wrong'), 'flash("wrong") no throw');
  A.nothrow(() => GameFX.flash(), 'flash() default no throw');
}

// ----- 2. damageNumber null el → 早返回 -----
console.log('\n[2] damageNumber(null) early return');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.damageNumber(null, 50), 'null target no throw');
  A.nothrow(() => GameFX.damageNumber(undefined, 50), 'undefined target no throw');
}

// ----- 3. damageNumber 真實 element -----
console.log('\n[3] damageNumber with valid element');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  const el = sb.document.createElement('div');
  A.nothrow(() => GameFX.damageNumber(el, 100, { kind: 'enemy', crit: false }),
    'normal damageNumber call');
  A.nothrow(() => GameFX.damageNumber(el, 999, { kind: 'enemy', crit: true }),
    'crit damageNumber call');
}

// ----- 4. damageNumber crit prefix -----
console.log('\n[4] damageNumber crit prefix');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  const el = sb.document.createElement('div');
  // 觀察 num.textContent 是否含 💥
  let lastCreatedEl = null;
  const origCreate = sb.document.createElement;
  sb.document.createElement = (tag) => {
    const e = origCreate.call(sb.document, tag);
    if (tag === 'div') lastCreatedEl = e;
    return e;
  };
  GameFX.damageNumber(el, 50, { crit: true });
  A.ok(lastCreatedEl, 'damage num element created');
  A.ok(lastCreatedEl && lastCreatedEl.textContent.includes('💥'),
    `crit prefix '💥' present (got "${lastCreatedEl && lastCreatedEl.textContent}")`);
}

// ----- 5. shake null el → 早返回 -----
console.log('\n[5] shake(null)');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.shake(null), 'shake(null) no throw');
  A.nothrow(() => GameFX.shake(undefined), 'shake(undefined) no throw');
}

// ----- 6. shake real element 加上 taking-damage class -----
console.log('\n[6] shake() adds taking-damage class');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  const el = sb.document.createElement('div');
  GameFX.shake(el);
  A.ok(el.classList.contains('taking-damage'), 'taking-damage class added');
}

// ----- 7. attackAnim null -----
console.log('\n[7] attackAnim(null)');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.attackAnim(null), 'attackAnim(null) no throw');
  const el = sb.document.createElement('div');
  GameFX.attackAnim(el);
  A.ok(el.classList.contains('attacking'), 'attacking class added');
}

// ----- 8. confetti 沒 window.confetti → no throw -----
console.log('\n[8] confetti without lib loaded');
{
  const sb = setup();
  // 確保 window.confetti undefined
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.confetti(), 'confetti without lib no throw');
  A.nothrow(() => GameFX.bigConfetti(), 'bigConfetti without lib no throw');
}

// ----- 9. confetti with mock -----
console.log('\n[9] confetti with mock callback');
{
  const sb = setup();
  let confettiCalls = [];
  sb.confetti = (opts) => { confettiCalls.push(opts); };
  // GameFX 內讀的是 window.confetti — sandbox 內 window 是 ctx,所以同步
  // 但要明確讓 window.confetti 可見:GameFX 用 `if (!window.confetti) return`
  // 我們的 window = ctx,ctx.confetti = mock → window.confetti = mock OK
  const GameFX = loadGameFX(sb);
  GameFX.confetti({ count: 100 });
  A.ok(confettiCalls.length === 1, '1 confetti call');
  A.eq(confettiCalls[0].particleCount, 100, 'particleCount=100');
}

// ----- 10. bigConfetti 觸發多次 confetti (with mock) -----
console.log('\n[10] bigConfetti triggers 1 sync + 2 timed');
{
  const sb = setup();
  let confettiCalls = [];
  sb.confetti = (opts) => { confettiCalls.push(opts); };
  const GameFX = loadGameFX(sb);
  GameFX.bigConfetti();
  // 第 1 個同步,後 2 個 setTimeout(在 stub 中 runTimers=false 不真跑)
  A.ok(confettiCalls.length >= 1, `at least 1 confetti call (got ${confettiCalls.length})`);
  A.eq(confettiCalls[0].particleCount, 150, 'first burst particleCount=150');
}

// ----- 11. combo 觸發 + 沒元素時建立 -----
console.log('\n[11] combo display');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.combo(5), 'combo(5) no throw');
  A.nothrow(() => GameFX.combo(99), 'combo(99) no throw');
  A.nothrow(() => GameFX.hideCombo(), 'hideCombo no throw');
}

// ----- 12. levelUp 不 throw + 不假設 confetti 存在 -----
console.log('\n[12] levelUp basic');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  A.nothrow(() => GameFX.levelUp(5), 'levelUp(5) no throw');
}

// ----- 13. 反例:damageNumber(detached element) -----
console.log('\n[13] damageNumber on detached element');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  const detached = sb.document.createElement('div');
  // detached 元素呼叫 getBoundingClientRect 應仍 work(我們的 mock 回傳合理值)
  A.nothrow(() => GameFX.damageNumber(detached, 50),
    'damageNumber on detached el no throw');
}

// ----- 14. 反例:amount 為 NaN / null -----
console.log('\n[14] damageNumber attack: NaN / null amount');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  const el = sb.document.createElement('div');
  A.nothrow(() => GameFX.damageNumber(el, NaN), 'NaN amount no throw');
  A.nothrow(() => GameFX.damageNumber(el, null), 'null amount no throw');
  A.nothrow(() => GameFX.damageNumber(el, -100), 'negative amount no throw');
  A.nothrow(() => GameFX.damageNumber(el, 'STRING'), 'string amount no throw');
}

// ----- 15. shake / attackAnim 重複呼叫 -----
console.log('\n[15] shake stress (10 calls)');
{
  const sb = setup();
  const GameFX = loadGameFX(sb);
  const el = sb.document.createElement('div');
  for (let i = 0; i < 10; i++) A.nothrow(() => GameFX.shake(el), `shake #${i}`);
}

process.exit(A.summary('GameFX'));
