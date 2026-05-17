// 01-storage.test.js — Storage 模組深度測試
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');

console.log('=== Storage tests ===');
console.log('source length:', StorageSrc.length, 'chars');

const A = makeAssert();

// ----- Section 1: happy path -----
console.log('\n[1] Happy path');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  Storage.set('foo', { a: 1, b: 'hello' });
  A.eq(Storage.get('foo'), { a: 1, b: 'hello' }, 'set→get roundtrip');
  A.eq(Storage.get('missing', 'default'), 'default', 'missing key returns default');
  Storage.del('foo');
  A.eq(Storage.get('foo', null), null, 'del removes key');
}

// ----- Section 2: edge cases -----
console.log('\n[2] Edge values');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  // null / undefined — 因 JSON.stringify(null)="null" 字串,localStorage 內為 truthy
  // get 內 `v ? JSON.parse(v) : d`,"null" 字串 truthy → JSON.parse → null。所以實際拿到 null
  Storage.set('k_null', null);
  A.eq(Storage.get('k_null', 'def'), null,
    'set(null) — get() returns null (consistent — JSON.stringify(null)="null" truthy)');
  Storage.set('k_zero', 0);
  A.eq(Storage.get('k_zero', 'def'), 0, 'set(0) — get() returns 0');
  Storage.set('k_false', false);
  A.eq(Storage.get('k_false', 'def'), false, 'set(false) — get() returns false');
  Storage.set('k_empty_str', '');
  // localStorage 內容 "\"\"" 是 truthy, JSON.parse 得 '' 空字串
  A.eq(Storage.get('k_empty_str', 'def'), '', 'set("") — get() returns ""');
  Storage.set('k_empty_arr', []);
  A.eq(Storage.get('k_empty_arr', 'def'), [], 'set([]) — get() returns []');
  Storage.set('k_empty_obj', {});
  A.eq(Storage.get('k_empty_obj', 'def'), {}, 'set({}) — get() returns {}');
}

// ----- Section 3: corrupted localStorage -----
console.log('\n[3] Corrupted localStorage');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  // 直接破壞 — 寫無效 JSON
  sb.localStorage.setItem('corrupt', '{not valid json');
  A.eq(Storage.get('corrupt', 'recovered'), 'recovered', 'corrupted JSON → returns default (catch swallows)');
  // 寫 undefined-like
  sb.localStorage.setItem('weird', 'undefined');
  // JSON.parse('undefined') throws → catch → return default
  A.eq(Storage.get('weird', 'def'), 'def', 'JSON.parse("undefined") fails → default');
}

// ----- Section 4: prototype pollution attempt -----
console.log('\n[4] Prototype pollution');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  // 嘗試 __proto__ 注入
  Storage.set('p1', JSON.parse('{"__proto__":{"polluted":true}}'));
  const tester = {};
  A.ok(tester.polluted === undefined, 'JSON.parse("__proto__") not pollute (V8 safe)');
  // 嘗試 constructor.prototype
  Storage.set('p2', JSON.parse('{"constructor":{"prototype":{"polluted2":true}}}'));
  const t2 = {};
  A.ok(t2.polluted2 === undefined, 'JSON.parse("constructor.prototype") not pollute');
  // 套上 Storage 後,讀回值內部含 __proto__ 鍵 — 取出時是否污染?
  const got = Storage.get('p1');
  A.ok(got && typeof got === 'object', 'pollution payload still readable as object');
  A.ok({}.polluted === undefined, 'Object.prototype intact after read');
}

// ----- Section 5: large value -----
console.log('\n[5] Large value');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  const big = 'x'.repeat(100000);
  let ok = true;
  try { Storage.set('big', big); } catch (e) { ok = false; }
  A.ok(ok, 'set 100KB string no-throw');
  A.eq(Storage.get('big').length, 100000, 'roundtrip 100KB');
}

// ----- Section 6: quota exceeded -----
console.log('\n[6] Quota exceeded');
{
  const sb = makeSandbox({ quotaBytes: 100 });
  // 用 sandbox 內 showToast capture
  let toastMsg = '';
  sb.showToast = (m) => { toastMsg = m; };
  const Storage = runSource(sb, StorageSrc, 'Storage');
  let threw = false;
  try { Storage.set('overflow', 'x'.repeat(200)); } catch (e) { threw = true; }
  A.ok(!threw, 'quota fail swallowed by try/catch (no throw)');
  A.ok(Storage._writeFailed === true, 'Storage._writeFailed set on quota fail');
  A.ok(toastMsg.includes('儲存失敗') || toastMsg.includes('quota'),
    `toast displayed on quota fail (msg="${toastMsg}")`);
}

// ----- Section 7: quota toast throttle -----
console.log('\n[7] Toast throttle (5s)');
{
  const sb = makeSandbox({ quotaBytes: 50 });
  let toastCount = 0;
  sb.showToast = () => { toastCount++; };
  const Storage = runSource(sb, StorageSrc, 'Storage');
  for (let i = 0; i < 10; i++) {
    try { Storage.set('k' + i, 'x'.repeat(60)); } catch {}
  }
  A.ok(toastCount === 1, `toast throttled to 1 in quick burst (got ${toastCount})`);
}

// ----- Section 8: special key chars -----
console.log('\n[8] Special key chars');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  Storage.set('a.b.c', 1);
  A.eq(Storage.get('a.b.c'), 1, 'dotted key');
  Storage.set('a b c', 2);
  A.eq(Storage.get('a b c'), 2, 'spaced key');
  Storage.set('中文', 3);
  A.eq(Storage.get('中文'), 3, 'CJK key');
  Storage.set('emoji_😈', 4);
  A.eq(Storage.get('emoji_😈'), 4, 'emoji key');
}

// ----- Section 9: circular ref serialize -----
console.log('\n[9] Circular ref');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  const obj = { a: 1 };
  obj.self = obj;
  let threw = false;
  try { Storage.set('circ', obj); } catch (e) { threw = true; }
  // JSON.stringify circular throws TypeError inside set,被 try/catch 接住
  A.ok(!threw, 'circular ref does NOT throw (set has try/catch)');
}

// ----- Section 10: rapid burst write -----
console.log('\n[10] Rapid burst write 1000 times');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) Storage.set('burst', { i });
  const dt = Date.now() - t0;
  A.eq(Storage.get('burst'), { i: 999 }, '1000 writes converge to last');
  A.ok(dt < 1000, `1000 writes took ${dt}ms (<1000ms expected)`);
}

// ----- Section 11: K_* constants present -----
console.log('\n[11] K_* constants');
{
  const sb = makeSandbox();
  const Storage = runSource(sb, StorageSrc, 'Storage');
  const expected = ['K_PROGRESS','K_MASTERY','K_WRONGBOOK','K_ERROR_REPORTS','K_SETTINGS','K_SESSION','K_SEEN_CORRECT','K_USER_NICKNAME'];
  for (const k of expected) A.ok(typeof Storage[k] === 'string' && Storage[k].length > 0, `constant ${k} present`);
}

process.exit(A.summary('Storage'));
