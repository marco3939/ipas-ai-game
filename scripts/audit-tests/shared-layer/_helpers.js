// _helpers.js — 共用層測試 helper:從 index.html 抽 module source,用 vm 跑
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.join(__dirname, '../../../src/index.html');

function readIndex() {
  return fs.readFileSync(INDEX, 'utf8');
}

// 抽出指定 const declaration ~ 下一個 const 之前的 source
// startMarker 例: "const Storage = {"
// endMarker 例: "const RNG = {"
function sliceConst(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a, b);
}

// 建立 sandbox:含 localStorage mock + document/window noop + showToast noop
function makeSandbox(opts = {}) {
  const storage = new Map();
  const quotaBytes = opts.quotaBytes || 0; // 0 = 無限
  let bytesUsed = 0;

  const localStorage = {
    getItem(k) {
      if (typeof k !== 'string') k = String(k);
      return storage.has(k) ? storage.get(k) : null;
    },
    setItem(k, v) {
      if (typeof k !== 'string') k = String(k);
      v = String(v);
      // simulate quota
      const oldLen = storage.has(k) ? storage.get(k).length : 0;
      const delta = v.length - oldLen;
      if (quotaBytes > 0 && bytesUsed + delta > quotaBytes) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      bytesUsed += delta;
      storage.set(k, v);
    },
    removeItem(k) {
      if (typeof k !== 'string') k = String(k);
      if (storage.has(k)) bytesUsed -= storage.get(k).length;
      storage.delete(k);
    },
    clear() { storage.clear(); bytesUsed = 0; },
    key(i) { return Array.from(storage.keys())[i] || null; },
    get length() { return storage.size; },
  };

  const docMock = {
    getElementById: () => null,
    createElement: () => ({ style: { cssText: '' }, innerHTML: '', appendChild() {} }),
    body: { insertBefore() {}, firstChild: null, appendChild() {}, removeChild() {} },
  };

  const ctx = {
    localStorage,
    document: docMock,
    window: {},
    navigator: { userAgent: 'test', language: 'en' },
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Symbol,
    Error,
    setTimeout, clearTimeout, setInterval, clearInterval,
    // 靜音 quota fail spam(被 Storage.set 的 console.warn 觸發)
    // 真要看可以在 test 內覆寫 sandbox.console
    showToast: () => {},
    confirm: () => true,
    alert: () => {},
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    GameFX: { levelUp: () => {}, flash: () => {} },
    refreshHome: () => {},
    QUESTIONS: [],
    __storageMap: storage,
    __storageStats: () => ({ bytesUsed, count: storage.size }),
  };
  ctx.window = new Proxy(ctx, { has: () => true });
  return vm.createContext(ctx);
}

// 把指定的 source 在 sandbox 跑(把 const 改成 var 以便讓外面拿到引用)
function runSource(sandbox, source, exposeAs) {
  // const Foo = {...}; → 用 IIFE 包,把回傳 assign 到 sandbox
  // 簡單做法:在尾巴加  ; <name> 讓 vm 回 expression value
  const code = source.replace(/^const\s+(\w+)\s*=/, 'var $1 =') + `\n;${exposeAs};`;
  return vm.runInContext(code, sandbox);
}

// 簡單 assert + 統計
function makeAssert() {
  const stats = { pass: 0, fail: 0, errors: [] };
  function assert(cond, msg) {
    if (cond) { stats.pass++; console.log('  PASS', msg); }
    else { stats.fail++; stats.errors.push(msg); console.log('  FAIL', msg); }
  }
  function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
  function ok(v, msg) { assert(!!v, msg); }
  function throws(fn, msg) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, msg);
  }
  function nothrow(fn, msg) {
    let err = null;
    try { fn(); } catch (e) { err = e; }
    assert(!err, msg + (err ? ' (threw ' + err.message + ')' : ''));
  }
  function summary(name) {
    const total = stats.pass + stats.fail;
    console.log(`\n=== ${name} SUMMARY: ${stats.pass}/${total} PASS ===`);
    if (stats.fail > 0) {
      console.log('Failures:');
      for (const e of stats.errors) console.log('  -', e);
    }
    return stats.fail === 0 ? 0 : 1;
  }
  return { assert, eq, ok, throws, nothrow, summary, stats };
}

module.exports = { readIndex, sliceConst, makeSandbox, runSource, makeAssert };
