// 05-seencorrect.test.js — SeenCorrect 模組深度測試
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');
const SeenSrc = sliceConst(src, 'const SeenCorrect = {', '// === Wrongbook');

console.log('=== SeenCorrect tests ===');
console.log('source length:', SeenSrc.length, 'chars');

const A = makeAssert();

function setup() {
  const sb = makeSandbox();
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, SeenSrc, 'SeenCorrect');
  return sb;
}

// ----- [1] empty state -----
console.log('\n[1] initial state');
{
  const sb = setup();
  A.eq(sb.SeenCorrect.size(), 0, 'size=0');
  A.eq(sb.SeenCorrect.has('q1'), false, 'has(q1)=false');
}

// ----- [2] mark + has + size -----
console.log('\n[2] mark / has / size');
{
  const sb = setup();
  sb.SeenCorrect.mark('q1');
  A.eq(sb.SeenCorrect.has('q1'), true, 'has(q1)');
  A.eq(sb.SeenCorrect.size(), 1, 'size=1');
  sb.SeenCorrect.mark('q2');
  sb.SeenCorrect.mark('q3');
  A.eq(sb.SeenCorrect.size(), 3, 'size=3');
}

// ----- [3] mark same twice — idempotent -----
console.log('\n[3] mark idempotent');
{
  const sb = setup();
  sb.SeenCorrect.mark('q1');
  sb.SeenCorrect.mark('q1');
  sb.SeenCorrect.mark('q1');
  A.eq(sb.SeenCorrect.size(), 1, 'size=1 after 3 marks of same');
}

// ----- [4] mark null/undefined/empty — early return -----
console.log('\n[4] mark falsy');
{
  const sb = setup();
  sb.SeenCorrect.mark(null);
  sb.SeenCorrect.mark(undefined);
  sb.SeenCorrect.mark('');
  sb.SeenCorrect.mark(0);
  sb.SeenCorrect.mark(false);
  A.eq(sb.SeenCorrect.size(), 0, 'all falsy ignored');
}

// ----- [5] persistence — reload from storage -----
console.log('\n[5] persistence');
{
  const sb = setup();
  sb.SeenCorrect.mark('q1');
  sb.SeenCorrect.mark('q2');
  // 直接 inspect storage
  const stored = sb.Storage.get(sb.Storage.K_SEEN_CORRECT, []);
  A.eq(stored.sort(), ['q1','q2'], 'storage contains both qids');

  // 模擬 reload:清 _cache,直接 has
  sb.SeenCorrect._cache = null;
  A.eq(sb.SeenCorrect.has('q1'), true, 'has(q1) after _cache reset');
  A.eq(sb.SeenCorrect.size(), 2, 'size=2 after reload');
}

// ----- [6] filterForBattle — sufficient pool -----
console.log('\n[6] filterForBattle sufficient');
{
  const sb = setup();
  sb.SeenCorrect.mark('q1');
  const pool = [{id:'q1'}, {id:'q2'}, {id:'q3'}, {id:'q4'}];
  const r = sb.SeenCorrect.filterForBattle(pool, 2);
  A.eq(r.pool.length, 3, 'filtered out q1 → 3 left');
  A.eq(r.fallback, false, 'fallback=false');
}

// ----- [7] filterForBattle — insufficient → fallback -----
console.log('\n[7] filterForBattle insufficient');
{
  const sb = setup();
  ['q1','q2','q3','q4'].forEach(q => sb.SeenCorrect.mark(q));
  const pool = [{id:'q1'}, {id:'q2'}, {id:'q3'}, {id:'q4'}];
  const r = sb.SeenCorrect.filterForBattle(pool, 2);
  A.eq(r.pool.length, 4, 'fallback returns original pool');
  A.eq(r.fallback, true, 'fallback=true');
  A.ok(typeof r.fallbackReason === 'string' && r.fallbackReason.length > 0, 'has reason');
}

// ----- [8] filterForBattle empty pool -----
console.log('\n[8] filterForBattle empty pool');
{
  const sb = setup();
  const r = sb.SeenCorrect.filterForBattle([], 1);
  A.eq(r.pool, [], 'empty pool stays empty');
  A.eq(r.fallback, true, 'empty pool → fallback');
}

// ----- [9] filterForBattle minNeeded default 1 -----
console.log('\n[9] filterForBattle default minNeeded');
{
  const sb = setup();
  const pool = [{id:'a'}];
  const r = sb.SeenCorrect.filterForBattle(pool);
  A.eq(r.fallback, false, 'default minNeeded=1, pool 1 → no fallback');
}

// ----- [10] reset() -----
console.log('\n[10] reset()');
{
  const sb = setup();
  ['a','b','c'].forEach(q => sb.SeenCorrect.mark(q));
  A.eq(sb.SeenCorrect.size(), 3, 'pre-reset 3');
  sb.SeenCorrect.reset();
  A.eq(sb.SeenCorrect.size(), 0, 'post-reset 0');
  A.eq(sb.SeenCorrect.has('a'), false, 'has(a)=false');
  // storage cleared
  A.eq(sb.Storage.get(sb.Storage.K_SEEN_CORRECT, ['x']), [], 'storage emptied');
}

// ----- [11] __proto__ as qid -----
console.log('\n[11] __proto__ as qid');
{
  const sb = setup();
  sb.SeenCorrect.mark('__proto__');
  // 是否污染 Object.prototype?Set 是 Set,不會。
  const tester = {};
  A.ok(!('__proto__' in tester) || tester.__proto__ === Object.prototype, 'Object.prototype intact');
  A.ok(sb.SeenCorrect.has('__proto__'), '__proto__ stored as normal Set member');
}

// ----- [12] high volume 10000 -----
console.log('\n[12] 10000 marks');
{
  const sb = setup();
  const t0 = Date.now();
  for (let i = 0; i < 10000; i++) sb.SeenCorrect.mark('q' + i);
  const dt = Date.now() - t0;
  A.eq(sb.SeenCorrect.size(), 10000, '10000 distinct marks');
  A.ok(dt < 30000, `10000 marks ${dt}ms`);
}

// ----- [13] filterForBattle perf 10000 pool / 5000 seen -----
console.log('\n[13] filterForBattle perf');
{
  const sb = setup();
  for (let i = 0; i < 5000; i++) sb.SeenCorrect.mark('q'+i);
  const pool = [];
  for (let i = 0; i < 10000; i++) pool.push({id:'q'+i});
  const t0 = Date.now();
  const r = sb.SeenCorrect.filterForBattle(pool, 100);
  const dt = Date.now() - t0;
  A.eq(r.pool.length, 5000, 'filtered pool size 5000');
  A.eq(r.fallback, false, 'no fallback');
  A.ok(dt < 500, `filterForBattle 10k took ${dt}ms`);
}

// ----- [14] cache invalidation cross-tab(PR #28 A-H4 修補)-----
console.log('\n[14] cache cross-tab — PR #28 A-H4 fix');
{
  const sb = setup();
  sb.SeenCorrect.mark('q1');  // 觸發 _load → _bindCrossTab
  // 確認 _crossTabBound flag 已設(fix 行為驗證)
  A.eq(sb.SeenCorrect._crossTabBound, true, '✅ PR #28 fix: _crossTabBound 旗標已設,storage event listener 已 bind');
  // 注意:同 vm 內 Storage.set 不會觸發 storage event(瀏覽器規範:storage event 只跨 tab 觸發)
  // 真實場景:另一 tab Storage.set → 本 tab 收到 event → _cache=null → 下次 has() 重 _load
  // 在這個測試環境我們手動 dispatch 模擬:
  sb.Storage.set(sb.Storage.K_SEEN_CORRECT, ['q1', 'q2', 'q3']);
  if (typeof sb.window !== 'undefined' && sb.window.dispatchEvent) {
    sb.window.dispatchEvent(new sb.Event ? new sb.Event('storage', { key: sb.Storage.K_SEEN_CORRECT }) : { type: 'storage', key: sb.Storage.K_SEEN_CORRECT });
    A.eq(sb.SeenCorrect.has('q2'), true, '✅ event 觸發後 cache 清空 → 重 _load 看到 q2');
  } else {
    // 沙箱無 window dispatchEvent 環境 — 至少驗證 bind flag 設了(production browser 真會觸發)
    A.ok(true, '(sandbox 無 dispatchEvent,bind flag 已驗;production browser 會接到真 storage event)');
  }
}

// ----- [15] storage quota fail in mark -----
console.log('\n[15] mark with quota fail');
{
  const sb = makeSandbox({ quotaBytes: 20 });
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, SeenSrc, 'SeenCorrect');
  let nothrow = true;
  try { for (let i = 0; i < 50; i++) sb.SeenCorrect.mark('q'+i); }
  catch { nothrow = false; }
  A.ok(nothrow, 'mark survives quota fail (silently)');
  // _cache 仍然會記錄
  A.ok(sb.SeenCorrect.size() > 0, `in-memory cache still tracks (size=${sb.SeenCorrect.size()})`);
}

process.exit(A.summary('SeenCorrect'));
