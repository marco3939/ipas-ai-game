// _helpers.js — cross-mode 測試 helper(共用 shared-layer/_helpers.js,並加 grep helper)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../../..');
const INDEX = path.join(ROOT, 'src/index.html');
const SM2_FILE = path.join(ROOT, 'src/sm2.js');
const MODES_DIR = path.join(ROOT, 'src/modes');

function readIndex() { return fs.readFileSync(INDEX, 'utf8'); }
function readSM2() { return fs.readFileSync(SM2_FILE, 'utf8'); }
function readMode(n) { return fs.readFileSync(path.join(MODES_DIR, `mode${n}.js`), 'utf8'); }
function listModeFiles() {
  return fs.readdirSync(MODES_DIR).filter(f => /^mode\d\.js$/.test(f)).sort();
}

// 找一段 `const Foo = { ... }; ` —— 因為 index.html 大量是 const 結構,
// 簡易做法:以「行首 const X = {」與「下一段已知標記」切片(同 shared-layer helper)
function sliceBetween(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a, b);
}

// 建立 sandbox(複製 shared-layer 模式,加 QUESTIONS 預設可注入)
function makeSandbox(opts = {}) {
  const storage = new Map();
  const quotaBytes = opts.quotaBytes || 0;
  let bytesUsed = 0;
  const storageEvents = [];

  const localStorage = {
    getItem(k) { k = String(k); return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      const oldLen = storage.has(k) ? storage.get(k).length : 0;
      const delta = v.length - oldLen;
      if (quotaBytes > 0 && bytesUsed + delta > quotaBytes) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      bytesUsed += delta;
      storage.set(k, v);
      storageEvents.push({ kind: 'set', key: k, len: v.length });
    },
    removeItem(k) {
      k = String(k);
      if (storage.has(k)) bytesUsed -= storage.get(k).length;
      storage.delete(k);
      storageEvents.push({ kind: 'del', key: k });
    },
    clear() { storage.clear(); bytesUsed = 0; storageEvents.push({ kind: 'clear' }); },
    key(i) { return Array.from(storage.keys())[i] || null; },
    get length() { return storage.size; },
  };

  // banner element registry — 02 / 09 tests need to detect persistent banner
  const elements = {};
  const docMock = {
    _bannerAdded: false,
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const el = {
        tagName: tag, id: '', style: { cssText: '', removeProperty(){} },
        innerHTML: '', textContent: '', dataset: {},
        appendChild() {}, removeChild() {}, remove() { delete elements[this.id]; },
        querySelectorAll: () => [],
        classList: { add() {}, remove() {}, contains: () => false },
        addEventListener() {},
      };
      return el;
    },
    body: {
      _children: [],
      insertBefore(node) {
        if (node.id) elements[node.id] = node;
        if (node.id === 'storage-quota-banner') docMock._bannerAdded = true;
        this._children.unshift(node);
      },
      appendChild(node) {
        if (node.id) elements[node.id] = node;
        this._children.push(node);
      },
      removeChild(node) {
        this._children = this._children.filter(c => c !== node);
        if (node.id && elements[node.id] === node) delete elements[node.id];
      },
      firstChild: null,
    },
  };

  const ctx = {
    localStorage,
    document: docMock,
    window: {},
    navigator: { userAgent: 'test', language: 'en' },
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    Date, JSON, Math, Number, String, Boolean, Array, Object, Set, Map, Symbol, Error,
    Promise, RegExp,
    setTimeout, clearTimeout, setInterval, clearInterval,
    showToast: () => {},
    confirm: () => true,
    alert: () => {},
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    GameFX: { levelUp: () => {}, flash: () => {}, bigConfetti: () => {} },
    refreshHome: () => {},
    // 2026-05-30 對齊 CLAUDE.md 案例 11:預設 undefined(讓 production 安全 fallback 觸發)
    // 而非 []。空 array 會讓 SM2._isLiveQid 把每個 qid 都判 stale → recordAnswer 返 null。
    // undefined 才會觸發「typeof QUESTIONS === 'undefined' → return true(不過濾)」的安全分支。
    // 需注入題庫的測試請顯式傳 opts.QUESTIONS,例如 makeSandbox({ QUESTIONS: [...] })。
    QUESTIONS: opts.QUESTIONS,
    __storageMap: storage,
    __storageEvents: storageEvents,
    __storageStats: () => ({ bytesUsed, count: storage.size }),
    __elements: elements,
    __docMock: docMock,
  };
  ctx.window = ctx;
  return vm.createContext(ctx);
}

function runSource(sandbox, source, exposeAs) {
  const code = source.replace(/^const\s+(\w+)\s*=/, 'var $1 =') + `\n;${exposeAs};`;
  return vm.runInContext(code, sandbox);
}

// 在 sandbox 中放入 Storage / SeenCorrect / Wrongbook / Mastery / SM2 / Progress / Player
// — 從 index.html 抓所有共用模組來源 一次跑完
function loadSharedLayer(sandbox) {
  const src = readIndex();
  const StorageSrc = sliceBetween(src, 'const Storage = {', '// === Random');
  const ProgressSrc = sliceBetween(src, 'const Progress = {', '// === Mastery');
  const MasterySrc = sliceBetween(src, 'const Mastery = {', '// === SeenCorrect');
  const SeenCorrectSrc = sliceBetween(src, 'const SeenCorrect = {', 'window.SeenCorrect');
  const WrongbookSrc = sliceBetween(src, 'const Wrongbook = {', '// === ErrorReports');
  const PlayerSrc = sliceBetween(src, 'const Player = {', '// === ProgressIO');
  const SM2Src = readSM2();

  // 把 const 全改 var,串起來在 sandbox 跑
  function asVar(s) { return s.replace(/^\s*const\s+(\w+)\s*=/m, 'var $1 ='); }
  const code = [
    asVar(StorageSrc),
    asVar(ProgressSrc),
    asVar(MasterySrc),
    asVar(SeenCorrectSrc),
    asVar(WrongbookSrc),
    asVar(PlayerSrc),
    // SM2 中包含 window.SM2 賦值前已 const,但檔頭 const SM2 = {... }; 不掛 window
    asVar(SM2Src),
    // expose
    'this.Storage = Storage; this.Progress = Progress; this.Mastery = Mastery;',
    'this.SeenCorrect = SeenCorrect; this.Wrongbook = Wrongbook; this.Player = Player; this.SM2 = SM2;',
  ].join('\n;');
  vm.runInContext(code, sandbox);
  return {
    Storage: sandbox.Storage, Progress: sandbox.Progress, Mastery: sandbox.Mastery,
    SeenCorrect: sandbox.SeenCorrect, Wrongbook: sandbox.Wrongbook,
    Player: sandbox.Player, SM2: sandbox.SM2,
  };
}

// grep-like 工具:把 mode files 全內容 + index.html 都拿來掃
function grepAll(regex, opts = {}) {
  const files = [INDEX, SM2_FILE, ...listModeFiles().map(f => path.join(MODES_DIR, f))];
  const hits = [];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const m = line.match(regex);
      if (m) hits.push({ file: path.basename(f), line: i + 1, text: line.trim(), match: m[0] });
    });
  }
  return hits;
}

function makeAssert() {
  const stats = { pass: 0, fail: 0, errors: [] };
  function assert(cond, msg) {
    if (cond) { stats.pass++; console.log('  PASS', msg); }
    else { stats.fail++; stats.errors.push(msg); console.log('  FAIL', msg); }
  }
  function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
  function ok(v, msg) { assert(!!v, msg); }
  function ge(a, b, msg) { assert(a >= b, `${msg} (got ${a}, expected >= ${b})`); }
  function le(a, b, msg) { assert(a <= b, `${msg} (got ${a}, expected <= ${b})`); }
  function summary(name) {
    const total = stats.pass + stats.fail;
    console.log(`\n=== ${name} SUMMARY: ${stats.pass}/${total} PASS ===`);
    if (stats.fail > 0) { console.log('Failures:'); for (const e of stats.errors) console.log('  -', e); }
    return stats.fail === 0 ? 0 : 1;
  }
  return { assert, eq, ok, ge, le, summary, stats };
}

module.exports = {
  ROOT, INDEX, SM2_FILE, MODES_DIR,
  readIndex, readSM2, readMode, listModeFiles,
  sliceBetween, makeSandbox, runSource, loadSharedLayer,
  grepAll, makeAssert,
};
