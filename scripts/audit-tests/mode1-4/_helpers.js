// _helpers.js — Mode 1-4 audit test helpers
// 提供:vm sandbox + 共用層(Storage/RNG/Player/Wrongbook/Mastery/Progress/SeenCorrect/SM2/PlayEngine/DrillSession/GameFX/ErrorReports)
// + 最小 DOM mock + localStorage mock + 載入 mode 檔
//
// 設計原則:
// 1. 共用層真實程式碼從 index.html 抽出片段塞進 sandbox(不重寫業務邏輯)
// 2. DOM mock 提供 getElementById / querySelector / querySelectorAll / createElement / appendChild
//    — 足夠讓 mode 程式跑「state 變化」即可,不需要真實 layout
// 3. GameFX / showToast 全 noop,避免 GSAP / canvas-confetti 依賴
// 4. setTimeout 包裝:可選 fake 模式(同步立刻跑 callback) — 用於 race 測試

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../../..');
const INDEX = path.join(ROOT, 'src/index.html');

function readFile(p) { return fs.readFileSync(p, 'utf8'); }

// ===== 最小 DOM mock =====
// 提供 getElementById / querySelector / querySelectorAll / createElement / appendChild / classList / style / dataset
// 不做真實 layout,只做樹結構與屬性
function makeDom() {
  const idIndex = new Map(); // id -> Element
  const elementsBySelector = new Map(); // 簡單 selector(.class / #id / tag) — 由 querySelectorAll lazy 掃

  function createElement(tag) {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      _innerHTML: '',
      _id: '',
      _classList: new Set(),
      style: new Proxy({}, { set: (t, k, v) => { t[k] = v; return true; } }),
      dataset: {},
      children: [],
      parentNode: null,
      attributes: {},
      textContent: '',
      disabled: false,
      _eventListeners: {},
      get id() { return this._id; },
      set id(v) {
        if (this._id) idIndex.delete(this._id);
        this._id = v;
        if (v) idIndex.set(v, this);
      },
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) {
        this._innerHTML = String(v);
        // 從 children 中清掉舊的 id 索引
        const removeIds = (node) => {
          if (!node) return;
          if (node._id) idIndex.delete(node._id);
          (node.children || []).forEach(removeIds);
        };
        this.children.forEach(removeIds);
        this.children = [];
        // 用正則粗暴抽取 id="xxx" 與 tag 結構,建子節點 stub 並掛 idIndex
        parseHTMLToChildren(v, this);
      },
      get classList() {
        const self = this;
        return {
          add: (...cs) => cs.forEach(c => self._classList.add(c)),
          remove: (...cs) => cs.forEach(c => self._classList.delete(c)),
          contains: (c) => self._classList.has(c),
          toggle: (c) => { if (self._classList.has(c)) self._classList.delete(c); else self._classList.add(c); },
        };
      },
      get className() { return Array.from(this._classList).join(' '); },
      set className(v) {
        this._classList = new Set(String(v).split(/\s+/).filter(Boolean));
      },
      appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        this.children.push(child);
        if (child._id) idIndex.set(child._id, child);
        return child;
      },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        if (child && child._id) idIndex.delete(child._id);
        child.parentNode = null;
        return child;
      },
      insertBefore(child, ref) {
        child.parentNode = this;
        const i = ref ? this.children.indexOf(ref) : 0;
        if (i < 0) this.children.push(child);
        else this.children.splice(i, 0, child);
        if (child._id) idIndex.set(child._id, child);
        return child;
      },
      remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
        else if (this._id) idIndex.delete(this._id);
      },
      setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v; },
      getAttribute(k) {
        if (k === 'data-card-id') return this.dataset.cardId;
        if (k === 'id') return this._id;
        return this.attributes[k];
      },
      hasAttribute(k) { return k in this.attributes; },
      addEventListener(type, handler) {
        if (!this._eventListeners[type]) this._eventListeners[type] = [];
        this._eventListeners[type].push(handler);
      },
      removeEventListener(type, handler) {
        const arr = this._eventListeners[type];
        if (!arr) return;
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      },
      dispatchEvent(ev) {
        const arr = this._eventListeners[ev.type];
        if (arr) arr.slice().forEach(h => { try { h(ev); } catch (_) {} });
        return true;
      },
      cloneNode() {
        const c = createElement(this.tagName);
        c._innerHTML = this._innerHTML;
        c.textContent = this.textContent;
        c._classList = new Set(this._classList);
        c.dataset = { ...this.dataset };
        return c;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 };
      },
      focus() {},
      blur() {},
      click() {
        const arr = this._eventListeners['click'];
        if (arr) arr.slice().forEach(h => { try { h({ type: 'click', currentTarget: this, target: this, preventDefault: () => {}, stopPropagation: () => {} }); } catch (_) {} });
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      querySelector(sel) { return queryAll(this, sel)[0] || null; },
      querySelectorAll(sel) { return queryAll(this, sel); },
      contains(node) {
        let cur = node;
        while (cur) { if (cur === this) return true; cur = cur.parentNode; }
        return false;
      },
    };
    return el;
  }

  // 極簡 HTML parser:抓 id="xxx" 建立 stub child,讓 getElementById 可以查到
  // (我們不關心精確結構,只關心後續 getElementById 能否取到)
  function parseHTMLToChildren(html, parent) {
    const idRe = /id="([^"]+)"/g;
    let m;
    while ((m = idRe.exec(html)) !== null) {
      const stub = createElement('div');
      stub.id = m[1];
      stub.parentNode = parent;
      parent.children.push(stub);
    }
    // 抓 data-card-id / data-key / data-slot-index 也存到一個 list
    const dataCardRe = /data-card-id="([^"]+)"/g;
    while ((m = dataCardRe.exec(html)) !== null) {
      const stub = createElement('div');
      stub._classList.add('m4-card');
      stub._classList.add('m3-card');
      stub.dataset.cardId = m[1];
      stub.dataset.id = m[1];
      stub.parentNode = parent;
      parent.children.push(stub);
    }
    const dataKeyRe = /data-key="([^"]+)"/g;
    while ((m = dataKeyRe.exec(html)) !== null) {
      const stub = createElement('button');
      stub._classList.add('option-btn');
      stub.dataset.key = m[1];
      stub.parentNode = parent;
      parent.children.push(stub);
    }
    const slotRe = /data-slot-index="([^"]+)"/g;
    while ((m = slotRe.exec(html)) !== null) {
      const stub = createElement('rect');
      stub._classList.add('m3-slot');
      stub.dataset.slotIndex = m[1];
      stub.parentNode = parent;
      parent.children.push(stub);
    }
  }

  // 簡單 selector 匹配:#id / .class / tag / [attr="value"] / 複合的用空白(後代,簡化為任一祖先)
  function matches(el, sel) {
    if (!el || !sel) return false;
    if (sel.startsWith('#')) return el._id === sel.slice(1);
    if (sel.startsWith('.')) return el._classList && el._classList.has(sel.slice(1));
    const attrM = sel.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (attrM) {
      const k = attrM[1];
      const v = attrM[2];
      if (k.startsWith('data-')) {
        const dKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return el.dataset && el.dataset[dKey] === v;
      }
      return el.attributes && el.attributes[k] === v;
    }
    // tag
    return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
  }

  function queryAll(root, sel) {
    // 切空白分支:#scope childSel
    const parts = sel.trim().split(/\s+/);
    let scope = [root];
    for (const part of parts) {
      const next = [];
      // 處理連續 selector,例如 ".m4-card.dragging" — 用 . 切
      const subTokens = part.split(/(?=[.#])/); // 切但保留分隔符 e.g. ".a.b" -> [".a", ".b"]
      for (const s of scope) {
        // BFS 所有後代 + 自身(不含 root 本身,標準 querySelectorAll 行為)
        const stack = [...(s.children || [])];
        while (stack.length) {
          const e = stack.shift();
          let allOk = true;
          for (const st of subTokens) {
            if (!matches(e, st)) { allOk = false; break; }
          }
          if (allOk) next.push(e);
          if (e.children && e.children.length) stack.push(...e.children);
        }
      }
      scope = next;
    }
    // 加 forEach 給 NodeList-like
    scope.forEach = Array.prototype.forEach.bind(scope);
    return scope;
  }

  // root document
  const html = createElement('html');
  const body = createElement('body');
  body._id = 'body';
  html.appendChild(body);
  body.parentNode = html;

  // 預建 SPA 需要的固定容器
  const ids = ['view-play', 'view-home', 'view-result', 'toast-container'];
  ids.forEach(id => {
    const el = createElement('div');
    el.id = id;
    body.appendChild(el);
  });

  const doc = {
    documentElement: html,
    body,
    head: createElement('head'),
    getElementById: (id) => idIndex.get(id) || null,
    createElement,
    createElementNS: (_, tag) => createElement(tag),
    querySelector: (sel) => queryAll(body, sel)[0] || null,
    querySelectorAll: (sel) => queryAll(body, sel),
    addEventListener: () => {},
    removeEventListener: () => {},
    contains: (node) => body.contains(node),
    elementFromPoint: () => null,
  };
  return { doc, body, html, idIndex, createElement, queryAll };
}

// ===== localStorage mock =====
function makeStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(String(k)); },
    clear() { m.clear(); },
    key(i) { return Array.from(m.keys())[i] || null; },
    get length() { return m.size; },
    _map: m,
  };
}

// ===== Build sandbox + load shared layer + load mode file =====
function makeSandbox(opts = {}) {
  const { doc, body } = makeDom();
  const localStorage = makeStorage();
  const timers = [];
  // setTimeout/setInterval — 用真實 timer 但記錄 id 以便清理
  function setT(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearT(id) { clearTimeout(id); }
  function setI(fn, ms) { const id = setInterval(fn, ms); timers.push(id); return id; }
  function clearI(id) { clearInterval(id); }

  const sandbox = {
    document: doc,
    localStorage,
    console: opts.verbose ? console : { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    Date,
    JSON,
    Math: Object.assign(Object.create(Math), { random: opts.randomFn || Math.random }),
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Symbol,
    Error,
    RegExp,
    Proxy,
    Reflect,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: setT, clearTimeout: clearT, setInterval: setI, clearInterval: clearI,
    requestAnimationFrame: (fn) => setT(fn, 0),
    cancelAnimationFrame: clearT,
    confirm: opts.confirm || (() => true),
    alert: () => {},
    prompt: opts.prompt || (() => ''),
    showToast: opts.showToast || (() => {}),
    show: (id) => {
      // mark view as active(模擬 className 切換)
      const ids = ['view-home', 'view-play', 'view-result'];
      ids.forEach(i => {
        const e = doc.getElementById(i);
        if (e) { if (i === id) e.classList.add('active'); else e.classList.remove('active'); }
      });
    },
    goHome: opts.goHome || (() => { sandbox._goHomeCalls = (sandbox._goHomeCalls || 0) + 1; }),
    refreshHome: () => {},
    enterMode: () => {},
    GameFX: {
      flash: () => {}, damageNumber: () => {}, shake: () => {}, attackAnim: () => {},
      combo: () => {}, hideCombo: () => {}, confetti: () => {}, bigConfetti: () => {},
      levelUp: () => {},
      // 2026-05-19 新增 3 個 BOSS 戰動畫(noop in test sandbox)
      bossKnockback: () => {}, heal: () => {}, bossEnrage: () => {}
    },
    ErrorReports: { renderButton: () => '', _esc: (s) => (s === null || s === undefined) ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') },
    // 2026-05-19 R1 simplify:escHTML 集中 helper(對齊 src/index.html)
    escHTML: (s) => {
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    },
    ConfusionMatrix: undefined, // not used in mode 1-4
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: function () {},
    navigator: { userAgent: 'test', language: 'zh-TW' },
    location: { reload: () => {}, hash: '' },
    QUESTIONS: opts.questions || [],
    __timers: timers,
  };
  // window proxy:支援 window.X 讀寫 → 直接代理到 sandbox
  sandbox.window = new Proxy(sandbox, {
    has: () => true,
    get(t, k) { return sandbox[k]; },
    set(t, k, v) { sandbox[k] = v; return true; },
  });
  return vm.createContext(sandbox);
}

// 從 index.html 抽出共用層常數區塊並注入 sandbox(把 const 換成 var,讓 vm 後續 source 可重用)
// 注入順序:Storage → RNG → Variation helpers → renderQuestion → Progress → Mastery → SeenCorrect → Wrongbook
//          → generateVariation → DrillSession(因 onComplete callback) → PlayEngine(showExplanation→無 GSAP)
//          → Player → renderVisualData → highlightCodeSimple → Mode4 placeholder
function loadSharedLayer(sandbox, indexSrc) {
  // 1) Storage(無依賴)
  injectBlock(sandbox, indexSrc, 'const Storage = {', '// === Random');

  // 2) RNG
  injectBlock(sandbox, indexSrc, 'const RNG = {', '// === Variation');

  // 3) applyVariables / pickCase / renderQuestion
  injectBlock(sandbox, indexSrc, '// === Variation', '// === 進度 / 倒數 ===');

  // 4) Progress
  injectBlock(sandbox, indexSrc, 'const Progress = {', '// === Mastery');

  // 5) Mastery — 從 'const Mastery = {' 到下一個 const(SeenCorrect)
  injectBlock(sandbox, indexSrc, 'const Mastery = {', 'const SeenCorrect = {');

  // 6) SeenCorrect — 到 window.SeenCorrect 行之前 OK
  injectBlock(sandbox, indexSrc, 'const SeenCorrect = {', 'window.SeenCorrect = SeenCorrect;');
  // 把 window.SeenCorrect 也設一下(讓 mode 內 typeof SeenCorrect 通過)
  vm.runInContext('window.SeenCorrect = SeenCorrect;', sandbox);

  // 7) Wrongbook
  injectBlock(sandbox, indexSrc, 'const Wrongbook = {', '// === ErrorReports');

  // 8) QUESTIONS placeholder(讓後續 const 不要 ReferenceError;真實題庫由測試傳)
  vm.runInContext('var QUESTIONS = sandboxQuestions || [];'.replace('sandboxQuestions', 'window.QUESTIONS'), sandbox);

  // 9) generateVariation
  // 2026-05-19 M4 修補:generateVariation 簽名加 excludeIds 第三參(deep drill 排除父層原題)
  // 對應 src/index.html:1422 `function generateVariation(originalQ, count = 3, excludeIds = null) {`
  injectBlock(sandbox, indexSrc, 'function generateVariation(originalQ, count = 3, excludeIds = null) {', '// === Toast ===');

  // 10) highlightCodeSimple
  injectBlock(sandbox, indexSrc, 'function highlightCodeSimple(code) {', '// === 渲染視覺資料');

  // 11) renderVisualData
  injectBlock(sandbox, indexSrc, 'function renderVisualData(q) {', '// === Player 系統 ===');

  // 12) Player
  injectBlock(sandbox, indexSrc, 'const Player = {', '// ============================================================================');

  // 13) DrillSession stub(我們只需要 .start 介面)
  vm.runInContext(`
    var DrillSession = {
      _calls: [],
      start(nodeId, variations, originalQ, onComplete) {
        this._calls.push({ nodeId, variations, originalQ });
        this._lastOnComplete = onComplete || null;
        this._lastVariations = variations;
        // 立刻 callback 模擬下鑽完成(同步)— 測試者可以覆寫此行為
        if (this._autoComplete !== false && onComplete) onComplete();
      },
      reset() { this._calls = []; this._lastOnComplete = null; this._lastVariations = null; }
    };
    window.DrillSession = DrillSession;
  `, sandbox);

  // 14) PlayEngine stub(極簡 — 只需 _stopTimer / _startTimer / show / answer)
  // 2026-05-19 R7:Mode 1/2/5 改用 PlayEngine.commitAnswer 共用層 helper,
  // stub 必須 mirror index.html PlayEngine.commitAnswer 5 步邏輯(opts 支援 skipMastery / wrongbookNodeId)。
  vm.runInContext(`
    var PlayEngine = {
      current: null,
      _stopTimerCalls: 0,
      _startTimerCalls: 0,
      _stopTimer() { this._stopTimerCalls++; },
      _startTimer() { this._startTimerCalls++; },
      commitAnswer(q, userKey, isCorrect, userText, correctText, opts) {
        opts = opts || {};
        if (!q) return;
        if (!opts.skipMastery && q.node_id && typeof Mastery !== 'undefined') Mastery.update(q.node_id, isCorrect);
        if (q.id && typeof SM2 !== 'undefined') SM2.recordAnswer(q.id, isCorrect, false);
        if (typeof Progress !== 'undefined') Progress.addAnswer(isCorrect);
        if (isCorrect && q.id && typeof SeenCorrect !== 'undefined') SeenCorrect.mark(q.id);
        if (!isCorrect && q.id && typeof Wrongbook !== 'undefined') {
          var correctOpt = (q.options || []).find(function(o){ return o.is_correct; });
          var nodeId = opts.wrongbookNodeId != null ? opts.wrongbookNodeId : q.node_id;
          Wrongbook.add(q.id, nodeId, userKey, correctOpt ? correctOpt.key : '', userText || '', correctText || '');
        }
      }
    };
    window.PlayEngine = PlayEngine;
  `, sandbox);

  // 15) SM2 stub
  vm.runInContext(`
    var SM2 = {
      _calls: [],
      recordAnswer(qid, isCorrect, drill) { this._calls.push({ qid, isCorrect, drill }); }
    };
    window.SM2 = SM2;
  `, sandbox);
}

// 從 src 抽出一段(從 startMarker 到 endMarker 之前),轉換 const→var,在 sandbox 內執行
function injectBlock(sandbox, src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start marker not found: ' + JSON.stringify(startMarker));
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) throw new Error('end marker not found: ' + JSON.stringify(endMarker));
  let block = src.slice(a, b);
  // 把所有 top-level const declarations 轉成 var(用 regex,只匹配開頭縮排 0)
  block = block.replace(/^const\s+/gm, 'var ');
  // 把 expression 末尾的 window.X = X 補上(讓裸名 const 變成 window 可讀)— 簡化做法
  vm.runInContext(block, sandbox);
}

// 載入 mode 檔(IIFE 自動執行,把 window.ModeN 寫入)
function loadMode(sandbox, modePath) {
  const src = fs.readFileSync(modePath, 'utf8');
  vm.runInContext(src, sandbox, { filename: path.basename(modePath) });
}

// ===== Test helpers =====
function makeAssert() {
  const stats = { pass: 0, fail: 0, errors: [] };
  function assert(cond, msg) {
    if (cond) { stats.pass++; console.log('  PASS', msg); }
    else { stats.fail++; stats.errors.push(msg); console.log('  FAIL', msg); }
  }
  function eq(a, b, msg) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    assert(ja === jb, `${msg} (got ${ja}, expected ${jb})`);
  }
  function ok(v, msg) { assert(!!v, msg); }
  function ne(a, b, msg) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    assert(ja !== jb, `${msg} (both = ${ja})`);
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
  return { assert, eq, ok, ne, summary, stats };
}

// ===== 題庫 fixtures =====
function fixtureQuestion(overrides = {}) {
  return Object.assign({
    id: 'q_test_001',
    subject: 1,
    node_id: 'L21101.A',
    knowledge_code: 'L21101',
    difficulty: 'medium',
    format: 'mcq',
    stem: '測試題幹',
    tags: ['電商', '推薦'],
    // 2026-05-18 治本方案 C:Mode 1 改用 boss_topics 精準篩選(取代 keyword)
    // 預設給 ecommerce 對齊 tags['電商','推薦'],避免 fixture 在 Mode 1 selectBoss 後池為空
    boss_topics: ['ecommerce'],
    options: [
      { text: '正確選項', is_correct: true },
      { text: '錯誤 1', is_correct: false },
      { text: '錯誤 2', is_correct: false },
      { text: '錯誤 3', is_correct: false }
    ],
    explanation: {
      correct: '此為正解,因為...',
      hook: '記住關鍵字:推薦系統',
      wrong: { '錯誤 1': '此選項不對因為 A', '錯誤 2': '此選項不對因為 B', '錯誤 3': '此選項不對因為 C' }
    },
    shuffle_options: true,
  }, overrides);
}

function fixtureMatchingQuestion(overrides = {}) {
  return Object.assign(fixtureQuestion(), {
    id: 'q_match_001',
    format: 'matching',
    stem: '配對概念:**準確率(Accuracy)** 對應的描述是?',
    options: [
      { text: '預測正確數 / 全部樣本數,不適合不平衡資料', is_correct: true },
      { text: 'TP / (TP+FP),用於精準度', is_correct: false },
      { text: 'TP / (TP+FN),用於召回率', is_correct: false },
      { text: '2PR/(P+R),F1 調和平均', is_correct: false }
    ]
  }, overrides);
}

function fixtureSequenceQuestion(overrides = {}) {
  return Object.assign(fixtureQuestion(), {
    id: 'q_pc_seq_001',
    format: 'sequence',
    stem: 'CNN 影像分類完整 pipeline',
    options: [
      { text: '資料蒐集 → 資料清洗 → 模型訓練 → 評估 → 部署', is_correct: true },
      { text: '模型訓練 → 資料蒐集 → 評估 → 部署 → 資料清洗', is_correct: false },
      { text: '資料清洗 → 資料蒐集 → 部署 → 模型訓練 → 評估', is_correct: false },
      { text: '部署 → 評估 → 模型訓練 → 資料清洗 → 資料蒐集', is_correct: false }
    ]
  }, overrides);
}

module.exports = {
  ROOT, INDEX,
  readFile, makeDom, makeStorage, makeSandbox, loadSharedLayer, loadMode,
  makeAssert,
  fixtureQuestion, fixtureMatchingQuestion, fixtureSequenceQuestion,
};
