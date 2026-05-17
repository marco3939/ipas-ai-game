// _helpers.js — Agent D helper: SM-2 / DrillSession / generateVariation / Review / ErrorReports / GameFX
// 與 shared-layer/_helpers.js 同精神,但補強 DOM mock / setTimeout 控制 / QUESTIONS 注入。
// 抽 source 自 src/index.html + src/sm2.js,用 vm 跑(沙箱化 — 真 localStorage / 真 DOM 都不會被污染)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.join(__dirname, '../../../src/index.html');
const SM2_FILE = path.join(__dirname, '../../../src/sm2.js');

function readIndex() { return fs.readFileSync(INDEX, 'utf8'); }
function readSM2() { return fs.readFileSync(SM2_FILE, 'utf8'); }

// 抽 const block:從 startMarker 到 endMarker(不含 endMarker)
function sliceConst(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a, b);
}

// 抽 function block(到下一個 `\n// ===` 或 `\nconst ` 或 `\nfunction ` 為止)
function sliceFunction(src, startMarker, endMarker) {
  return sliceConst(src, startMarker, endMarker);
}

// ----- DOM mock -----
// 提供最簡單的 element / document.body / getElementById,讓 Review / SM2.renderReviewList / ErrorReports 等
// 渲染流程都能執行而不 throw。捕獲所有 innerHTML 給後續斷言。
function makeElement(tag) {
  const el = {
    tagName: (tag || 'DIV').toUpperCase(),
    id: '',
    className: '',
    _innerHTML: '',
    _textContent: '',
    style: { cssText: '', display: '' },
    children: [],
    classList: {
      _set: new Set(),
      add(...names) { names.forEach(n => this._set.add(n)); },
      remove(...names) { names.forEach(n => this._set.delete(n)); },
      contains(n) { return this._set.has(n); },
    },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      return c;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    remove() {},
    click() {},
    focus() {},
    addEventListener() {},
    removeEventListener() {},
    closest() { return null; },
  };
  return el;
}

function makeDocument() {
  const elements = {}; // id -> el
  const doc = {
    _elements: elements,
    _createdEls: [],
    body: makeElement('body'),
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const e = makeElement(tag);
      doc._createdEls.push(e);
      return e;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    // 測試 helper:注入一個 id
    __inject(id) {
      const e = makeElement('div');
      e.id = id;
      elements[id] = e;
      return e;
    },
  };
  return doc;
}

// ----- sandbox -----
function makeSandbox(opts = {}) {
  const storage = new Map();
  const quotaBytes = opts.quotaBytes || 0;
  let bytesUsed = 0;

  const localStorage = {
    getItem(k) {
      if (typeof k !== 'string') k = String(k);
      return storage.has(k) ? storage.get(k) : null;
    },
    setItem(k, v) {
      if (typeof k !== 'string') k = String(k);
      v = String(v);
      const oldLen = storage.has(k) ? storage.get(k).length : 0;
      const delta = v.length - oldLen;
      if (quotaBytes > 0 && bytesUsed + delta > quotaBytes) {
        const err = new Error('QuotaExceededError'); err.name = 'QuotaExceededError'; throw err;
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

  const doc = makeDocument();

  const toasts = [];
  const ctx = {
    localStorage,
    document: doc,
    navigator: { userAgent: 'test', language: 'en' },
    console,
    Date, JSON, Math, Number, String, Boolean, Array, Object, Set, Map, Symbol, Error, RegExp,
    setTimeout: function (fn, ms) {
      // 預設 stub:不真跑(避免測試 hang)。若 opts.runTimers=true 才同步跑。
      if (opts.runTimers) {
        try { fn(); } catch (e) { console.error('[setTimeout fn threw]', e.message); }
      }
      return 0;
    },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => { if (opts.runTimers) { try { fn(); } catch {} } return 0; },
    cancelAnimationFrame: () => {},
    showToast: (m) => { toasts.push(String(m)); },
    confirm: () => true,
    alert: () => {},
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    refreshHome: () => {},
    goHome: () => { ctx.__wentHome = true; },
    show: (id) => { ctx.__shown = id; },
    QUESTIONS: opts.QUESTIONS || [],
    __toasts: toasts,
    __wentHome: false,
    __shown: '',
  };
  ctx.window = ctx;
  return vm.createContext(ctx);
}

// 跑 source(把 const 改成 var,讓回傳)
function runSource(sandbox, source, exposeAs) {
  let code = source;
  // 多個 const 各別 declaration 都替換成 var(只動 top-level)
  code = code.replace(/^const\s+(\w+)\s*=/gm, 'var $1 =');
  return vm.runInContext(code + `\n;${exposeAs};`, sandbox);
}

// 直接 require sm2.js 並注入(因 sm2.js 是 const SM2 = {...},直接 eval 到 sandbox)
function loadSM2(sandbox) {
  const src = readSM2().replace(/^const\s+(\w+)\s*=/gm, 'var $1 =');
  return vm.runInContext(src + '\n;SM2;', sandbox);
}

// 載 Storage(SM2 需要 Storage)
function loadStorage(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, 'const Storage = {', '// === Random');
  return runSource(sandbox, src, 'Storage');
}

// 載 Wrongbook(ErrorReports.top 需要 Wrongbook,Review 需要 Wrongbook)
function loadWrongbook(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, 'const Wrongbook = {', '// === ErrorReports');
  return runSource(sandbox, src, 'Wrongbook');
}

// 載 ErrorReports
function loadErrorReports(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, 'const ErrorReports = {', '// === Question Bank Loader');
  return runSource(sandbox, src, 'ErrorReports');
}

// 載 GameFX
function loadGameFX(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, 'const GameFX = {', '// === 程式碼語法高亮');
  return runSource(sandbox, src, 'GameFX');
}

// 載 RNG(generateVariation 需要)
function loadRNG(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, 'const RNG = {', '// === Variation');
  return runSource(sandbox, src, 'RNG');
}

// 載 renderQuestion 等 — generateVariation 內部 call renderQuestion
function loadRenderHelpers(sandbox) {
  const idx = readIndex();
  // applyVariables / pickCase / renderQuestion 三個 function
  // function applyVariables(...) { ... } 到 // === 進度 / 倒數
  const block = sliceConst(idx, 'function applyVariables(stem, variables) {',
    '// === 進度 / 倒數');
  vm.runInContext(block, sandbox);
  return true;
}

// 載 generateVariation
function loadGenerateVariation(sandbox) {
  const idx = readIndex();
  const block = sliceConst(idx, 'function generateVariation(originalQ, count = 3) {',
    '// === Toast');
  vm.runInContext(block + '\n;', sandbox);
  return sandbox.generateVariation;
}

// 載 DrillSession(需要 PlayEngine + Mastery + Wrongbook + showToast + GameFX + goHome)
// 為了不引入 PlayEngine 整段(很長),我們在測試直接 stub 一個 mock PlayEngine 到 sandbox
function loadDrillSession(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, '// === Drill Session', '// === Review 錯題本');
  // 注意:DrillSession block 在 sliceConst 之前還有 case 11 註解 + PlayEngine.__nativeAnswer 那行
  // 但 case 11 在 1795 ~ 1804 (Case 11 註解 + PlayEngine.__nativeAnswer = PlayEngine.answer;)
  // 我們直接從 // === Drill Session 開始就跳過了 PlayEngine.__nativeAnswer。
  const code = src.replace(/^const\s+(\w+)\s*=/gm, 'var $1 =');
  vm.runInContext(code + '\n;', sandbox);
  return sandbox.DrillSession;
}

// 載 Review
function loadReview(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, '// === Review 錯題本', '// === Stats 弱點分析');
  const code = src.replace(/^const\s+(\w+)\s*=/gm, 'var $1 =');
  vm.runInContext(code + '\n;', sandbox);
  return sandbox.Review;
}

// 載 Mastery(DrillSession.next 用 Mastery.drillBonus)
function loadMastery(sandbox) {
  const idx = readIndex();
  const src = sliceConst(idx, 'const Mastery = {', '// === SeenCorrect');
  return runSource(sandbox, src, 'Mastery');
}

// 簡單 assert
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
    assert(!err, msg + (err ? ' (threw ' + (err && err.message) + ')' : ''));
  }
  function approx(a, b, eps, msg) {
    assert(Math.abs(a - b) < eps, `${msg} (got ${a}, expected ~${b} ±${eps})`);
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
  return { assert, eq, ok, throws, nothrow, approx, summary, stats };
}

module.exports = {
  readIndex, readSM2, sliceConst, sliceFunction,
  makeSandbox, runSource,
  loadSM2, loadStorage, loadWrongbook, loadErrorReports,
  loadGameFX, loadRNG, loadRenderHelpers, loadGenerateVariation,
  loadDrillSession, loadReview, loadMastery,
  makeAssert,
};
