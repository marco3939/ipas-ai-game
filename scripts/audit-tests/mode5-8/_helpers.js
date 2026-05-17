// _helpers.js — Mode 5-8 audit test helpers
// Strategy:
//   - Each mode is an IIFE that ends with `window.ModeN = ModeN`.
//   - We run the mode source in a vm sandbox with stubs for QUESTIONS, Mastery,
//     Wrongbook, Progress, SeenCorrect, Player, GameFX, PlayEngine, RNG,
//     Storage, DrillSession, showToast, renderQuestion, document, etc.
//   - After load, we grab `sandbox.window.ModeN` and run unit-style tests.
//
// Notes:
//   - We construct a minimal DOM Element shim so functions calling
//     view.innerHTML = '...' don't crash, and so listeners can be invoked
//     programmatically when tests need to.
//   - For renderQuestion we copy the real one as faithfully as possible,
//     including option shuffling + key assignment, because case 10 hinges
//     on that behaviour.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '../../..');
const SRC_DIR = path.join(REPO, 'src');
const MODES_DIR = path.join(SRC_DIR, 'modes');

function readMode(n) {
  return fs.readFileSync(path.join(MODES_DIR, `mode${n}.js`), 'utf8');
}

// === Minimal DOM Element shim ===
function makeElement(id, doc) {
  const el = {
    id,
    _innerHTML: '',
    _textContent: '',
    style: {
      _props: {},
      cssText: '',
      setProperty(k, v) { this._props[k] = v; },
      getPropertyValue(k) { return this._props[k] || ''; },
      removeProperty(k) { delete this._props[k]; },
    },
    classList: {
      _set: new Set(),
      add(...names) { names.forEach(n => this._set.add(n)); },
      remove(...names) { names.forEach(n => this._set.delete(n)); },
      contains(n) { return this._set.has(n); },
      toggle(n) {
        if (this._set.has(n)) { this._set.delete(n); return false; }
        this._set.add(n); return true;
      },
    },
    dataset: {},
    children: [],
    parentElement: null,
    disabled: false,
    cursor: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    getAttribute(name) {
      if (name === 'data-key') return this.dataset.key;
      return null;
    },
    setAttribute(name, val) {
      if (name === 'data-key') this.dataset.key = val;
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentElement = null;
      return child;
    },
    remove() {
      if (this.parentElement) this.parentElement.removeChild(this);
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) {
      // very limited:  '.foo'
      const found = this._search(sel);
      return found[0] || null;
    },
    querySelectorAll(sel) {
      return this._search(sel);
    },
    _search(sel) {
      const results = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          if (matches(child, sel)) results.push(child);
          walk(child);
        }
      };
      walk(this);
      return results;
    },
    contains(other) {
      if (other === this) return true;
      for (const c of this.children) {
        if (c.contains && c.contains(other)) return true;
      }
      return false;
    },
    scrollIntoView() {},
    select() {},
    focus() {},
  };
  return el;
}

function matches(node, sel) {
  if (!sel) return false;
  // selectors we support: tag, '.cls', '#id', '[data-key="X"]', '#id .cls',
  // '#parent button[data-key="X"]'.  Approximate.
  const parts = sel.split(/\s+/);
  return matchesSingle(node, parts[parts.length - 1]);
}
function matchesSingle(node, sel) {
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('.')) return node.classList && node.classList.contains(sel.slice(1));
  const m = sel.match(/^([\w-]*)\[data-key="([^"]+)"\]/);
  if (m) {
    const tag = m[1];
    const key = m[2];
    if (tag && (node.tagName || '').toLowerCase() !== tag.toLowerCase()) return false;
    return node.dataset && node.dataset.key === key;
  }
  if (/^[\w-]+$/.test(sel)) {
    return (node.tagName || '').toLowerCase() === sel.toLowerCase();
  }
  return false;
}

function makeDocument() {
  const elements = new Map();
  const doc = {
    body: null,
    _elements: elements,
    createElement(tag) {
      const el = makeElement('', doc);
      el.tagName = tag;
      return el;
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id, doc));
      return elements.get(id);
    },
    querySelector(sel) {
      // Walk body.  Simplified.
      if (!doc.body) return null;
      return doc.body.querySelector(sel);
    },
    querySelectorAll(sel) {
      if (!doc.body) return [];
      return doc.body.querySelectorAll(sel);
    },
  };
  doc.body = makeElement('body', doc);
  return doc;
}

// === renderQuestion faithful clone (case 10 critical) ===
// Replicate the logic in index.html lines ~828: shuffle options, assign A/B/C/D.
// Source-of-truth: index.html renderQuestion function.  We mirror the
// "shuffle then key" order so item._rendered cache tests are meaningful.
function makeRenderQuestion(RNG) {
  function applyVariables(stem, vars) {
    if (!stem || !vars) return stem;
    let out = String(stem);
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return out;
  }
  return function renderQuestion(q) {
    if (!q || !q.options) return q;
    // pick variables case if any (skipped for tests — keep simple)
    const variables = q.variables || {};
    let stem = q.stem || '';
    stem = applyVariables(stem, variables);

    // shuffle options if needed
    let opts = (q.options || []).map(o => ({ ...o }));
    if (q.shuffle_options !== false) {
      opts = RNG.shuffle(opts);
    }
    // assign keys A/B/C/D in shuffled order
    const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    opts.forEach((o, i) => { o.key = keys[i]; });
    return {
      ...q,
      stem,
      options: opts,
    };
  };
}

// === Simple seeded RNG ===
function makeRNG() {
  let seed = 12345;
  const set = (s) => { seed = (typeof s === 'number' && s) || 12345; };
  // Mulberry32-like, deterministic per seed
  const next = () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    set,
    next,
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    pickN(arr, n) {
      const out = arr.slice();
      // Fisher-Yates partial
      for (let i = 0; i < n && i < out.length; i++) {
        const j = i + Math.floor(next() * (out.length - i));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out.slice(0, n);
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// === A factory question  (canonical shape) ===
function makeQ(id, opts = {}) {
  return {
    id,
    node_id: opts.node_id || 'N_test_1',
    knowledge_code: opts.knowledge_code || 'L21101',
    subject: opts.subject || 1,
    difficulty: opts.difficulty || 'medium',
    format: opts.format || 'single_choice',
    stem: opts.stem || `Test stem for ${id}`,
    options: opts.options || [
      { text: 'correct option', is_correct: true, trap_type: null },
      { text: 'wrong option A', is_correct: false, trap_type: 'common_confusion' },
      { text: 'wrong option B', is_correct: false, trap_type: 'distractor' },
      { text: 'wrong option C', is_correct: false, trap_type: 'other' },
    ],
    explanation: opts.explanation || {
      correct: 'Because reasons',
      wrong: {},
      hook: 'Hook',
    },
    misconceptions: opts.misconceptions || [],
    tags: opts.tags || [],
    shuffle_options: opts.shuffle_options !== false,
    ...opts,
  };
}

// === Build a sandbox with shared-layer stubs ===
function buildSandbox(opts = {}) {
  const doc = makeDocument();
  const RNG = makeRNG();
  const renderQuestion = makeRenderQuestion(RNG);

  // localStorage backed by Map
  const lsMap = new Map();
  const localStorage = {
    getItem(k) { return lsMap.has(k) ? lsMap.get(k) : null; },
    setItem(k, v) { lsMap.set(k, String(v)); },
    removeItem(k) { lsMap.delete(k); },
    clear() { lsMap.clear(); },
    get length() { return lsMap.size; },
    key(i) { return Array.from(lsMap.keys())[i] || null; },
  };

  // Stats trackers used across tests
  const stats = {
    masteryCalls: [],
    wrongbookCalls: [],
    progressCalls: [],
    seenCorrectCalls: [],
    sm2Calls: [],
    toasts: [],
    drillStarts: [],
  };

  const Storage = {
    K_PROGRESS: '_test_progress',
    K_MASTERY: '_test_mastery',
    K_WRONGBOOK: '_test_wrongbook',
    K_SEEN_CORRECT: '_test_seen',
    get(k, d) {
      try {
        const raw = lsMap.get(k);
        return raw ? JSON.parse(raw) : (d === undefined ? null : d);
      } catch { return d === undefined ? null : d; }
    },
    set(k, v) { lsMap.set(k, JSON.stringify(v)); },
    del(k) { lsMap.delete(k); },
  };

  const Mastery = {
    _store: opts.mastery || {},
    load() { return JSON.parse(JSON.stringify(this._store)); },
    save(m) { this._store = JSON.parse(JSON.stringify(m)); },
    get(nodeId) {
      const n = this._store[nodeId];
      return n ? { ...n } : { score: 0, attempts: 0, correct: 0, streak: 0 };
    },
    update(nodeId, isCorrect) {
      stats.masteryCalls.push({ nodeId, isCorrect });
      const n = this._store[nodeId] || { score: 0, attempts: 0, correct: 0, streak: 0 };
      n.attempts = (n.attempts || 0) + 1;
      if (isCorrect) {
        n.correct = (n.correct || 0) + 1;
        n.streak = (n.streak || 0) + 1;
        n.score = Math.min(100, (n.score || 0) + 10);
      } else {
        n.streak = 0;
        n.score = Math.max(0, (n.score || 0) - 5);
      }
      this._store[nodeId] = n;
    },
  };

  const Wrongbook = {
    _store: opts.wrongbook || [],
    load() { return JSON.parse(JSON.stringify(this._store)); },
    save(w) { this._store = JSON.parse(JSON.stringify(w)); },
    count() { return this._store.filter(x => !x.mastered).length; },
    add(qid, nodeId, userKey, correctKey, userText, correctText) {
      stats.wrongbookCalls.push({ qid, nodeId, userKey, correctKey, userText, correctText });
      const existing = this._store.find(x => x.qid === qid);
      if (existing) {
        existing.wrongCount = (existing.wrongCount || 1) + 1;
        existing.lastWrong = Date.now();
        existing.userKey = userKey;
        existing.correctKey = correctKey;
        existing.userText = userText;
        existing.correctText = correctText;
      } else {
        this._store.push({
          qid, nodeId, userKey, correctKey, userText, correctText,
          wrongCount: 1, mastered: false, lastWrong: Date.now()
        });
      }
    },
    markMastered(qid) {
      const e = this._store.find(x => x.qid === qid);
      if (e) e.mastered = true;
    },
  };

  const Progress = {
    addAnswer(isCorrect) { stats.progressCalls.push(isCorrect); },
  };

  const SeenCorrect = {
    _set: new Set(),
    mark(qid) { stats.seenCorrectCalls.push(qid); this._set.add(qid); },
    has(qid) { return this._set.has(qid); },
    filterForBattle(pool, n) {
      const fresh = pool.filter(q => !this._set.has(q.id));
      if (fresh.length >= n) return { pool: fresh, fallback: false };
      return { pool, fallback: true };
    },
  };

  const SM2 = {
    recordAnswer(qid, isCorrect, secondTime) {
      stats.sm2Calls.push({ qid, isCorrect, secondTime });
    },
  };

  const Player = {
    _state: { level: 1, exp: 0, expMax: 100, hp: 100, hpMax: 100, mp: 50, mpMax: 50 },
    load() { return { ...this._state }; },
    save(p) { Object.assign(this._state, p); },
    heal(n) { this._state.hp = Math.min(this._state.hpMax, this._state.hp + n); },
    damage(n) { this._state.hp = Math.max(0, this._state.hp - n); },
    gainExp(n) { this._state.exp += n; },
  };

  const GameFX = {
    flash() {}, shake() {}, combo() {}, hideCombo() {},
    confetti() {}, bigConfetti() {}, levelUp() {},
    damageNumber() {}, attackAnim() {},
  };

  // DrillSession stub records every call
  const DrillSession = {
    start(nodeId, variations, sourceQ, onComplete) {
      stats.drillStarts.push({ nodeId, variations, sourceQ, onComplete });
    },
  };

  const ErrorReports = {
    renderButton() { return ''; },
  };

  // PlayEngine: only the parts modes hook into
  const PlayEngine = {
    current: null,
    history: [],
    _stopTimer() {},
    _startTimer() {},
    answer(key) {
      // Lightweight default: locate option, call Mastery/SM2/Wrongbook
      if (!this.current || !this.current.options) return;
      const opt = this.current.options.find(o => o.key === key);
      if (!opt) return;
      const isCorrect = !!opt.is_correct;
      if (this.current.node_id) Mastery.update(this.current.node_id, isCorrect);
      Progress.addAnswer(isCorrect);
      SM2.recordAnswer(this.current.id, isCorrect, false);
      if (isCorrect && this.current.id) SeenCorrect.mark(this.current.id);
      if (!isCorrect) {
        const correctOpt = this.current.options.find(o => o.is_correct);
        Wrongbook.add(
          this.current.id, this.current.node_id, key, correctOpt && correctOpt.key,
          opt.text, correctOpt && correctOpt.text
        );
      }
      // NOTE: real PlayEngine.answer does NOT call onNext (it calls
      // showExplanation, which has a "Next" button that triggers PlayEngine.onNext()).
      // Tests must explicitly invoke onNext() to simulate user clicking Next.
    },
    showExplanation() {},
    show(question, opts2 = {}) {
      this.current = renderQuestion(question);
      // populate play-options for tests that read it
      const view = doc.getElementById('view-play');
      view.innerHTML = (opts2.contextHTML || '') + '<div id="play-options"></div>';
      const playOpts = doc.getElementById('play-options');
      playOpts.children = [];
      this.current.options.forEach(o => {
        const btn = doc.createElement('button');
        btn.classList.add('option-btn');
        btn.dataset.key = o.key;
        playOpts.appendChild(btn);
      });
    },
    onNext: null,
  };

  // generateVariation: simple stub making N copies with new ids
  const generateVariation = (q, count) => {
    if (!q) return [];
    const out = [];
    for (let i = 0; i < (count || 3); i++) {
      out.push({
        ...q,
        id: `${q.id}_v${i + 1}`,
        stem: `[var${i + 1}] ${q.stem}`,
      });
    }
    return out;
  };

  // Globals for confusion-matrix etc
  const ConfusionMatrix = undefined;
  const QUESTIONS = opts.questions || defaultQuestions();

  const showToast = (msg) => { stats.toasts.push(String(msg)); };
  const goHome = () => { stats.goHomeCalled = (stats.goHomeCalled || 0) + 1; };
  const refreshHome = () => {};
  const show = () => {};

  const sandbox = {
    console: {
      log() {}, warn() {}, error() {}, info() {},
    },
    Math, Date, JSON, Object, Array, String, Number, Boolean,
    Set, Map, Symbol, Error, RegExp, Promise, parseInt, parseFloat,
    isNaN, isFinite,
    setTimeout(fn, ms) {
      // Don't actually run by default — tests opt-in.
      stats.setTimeoutCalls = (stats.setTimeoutCalls || 0) + 1;
      const id = stats.setTimeoutCalls;
      // Defer firing so callers can push id into their own list BEFORE the cb
      // runs (mirrors browser behaviour where cb is async).
      if (sandbox._runTimersImmediately) {
        // queueMicrotask still races with subsequent sync code (push happens
        // before cb). We collect cbs and fire them after returning.
        stats._pendingFn = (stats._pendingFn || []);
        stats._pendingFn.push(fn);
        // Microtask to drain
        Promise.resolve().then(() => {
          while (stats._pendingFn.length) {
            const f = stats._pendingFn.shift();
            try { f(); } catch (e) {
              stats.setTimeoutErrors = (stats.setTimeoutErrors || []);
              stats.setTimeoutErrors.push(e);
            }
          }
        });
      }
      return id;
    },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    localStorage,
    document: doc,
    window: {},
    navigator: { clipboard: { writeText: async () => {} } },
    Storage,
    RNG,
    Mastery, Wrongbook, Progress, SeenCorrect, SM2,
    Player, GameFX, DrillSession, ErrorReports,
    PlayEngine,
    QUESTIONS,
    generateVariation,
    renderQuestion,
    ConfusionMatrix,
    showToast, goHome, refreshHome, show,
    __stats: stats,
    _runTimersImmediately: false,
  };
  // Make window refer back to sandbox so `window.ModeN = Mode_` works.
  sandbox.window = sandbox;
  // window-level stubs that some modes call (scrollTo, addEventListener, etc.)
  sandbox.scrollTo = () => {};
  const ctx = vm.createContext(sandbox);
  return { ctx, sandbox, stats };
}

function defaultQuestions() {
  return [
    {
      id: 'q1', node_id: 'N1', knowledge_code: 'L21101', subject: 1, difficulty: 'medium',
      format: 'single_choice', stem: 'Q1 stem', shuffle_options: true,
      options: [
        { text: 'correct', is_correct: true },
        { text: 'w1', is_correct: false },
        { text: 'w2', is_correct: false },
        { text: 'w3', is_correct: false },
      ],
      explanation: { correct: 'because', wrong: {} },
    },
    {
      id: 'q2', node_id: 'N1', knowledge_code: 'L21101', subject: 1, difficulty: 'medium',
      format: 'code_reading', stem: 'Q2 stem', shuffle_options: true,
      options: [
        { text: 'correct2', is_correct: true },
        { text: 'w1', is_correct: false },
        { text: 'w2', is_correct: false },
        { text: 'w3', is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    },
    {
      id: 'q3', node_id: 'N2', knowledge_code: 'L22101', subject: 2, difficulty: 'hard',
      format: 'calculation', stem: 'Q3 calc stem', shuffle_options: true,
      options: [
        { text: '0.5', is_correct: true },
        { text: '0.3', is_correct: false },
        { text: '0.7', is_correct: false },
        { text: '0.9', is_correct: false },
      ],
      explanation: { correct: 'm', wrong: {} },
    },
  ];
}

function loadMode(n, opts = {}) {
  const { ctx, sandbox, stats } = buildSandbox(opts);
  const src = readMode(n);
  vm.runInContext(src, ctx, { filename: `mode${n}.js` });
  return { ctx, sandbox, stats, Mode: sandbox[`Mode${n}`] };
}

// === Assert helper ===
function makeAssert() {
  const s = { pass: 0, fail: 0, errors: [] };
  function assert(cond, msg) {
    if (cond) { s.pass++; console.log('  PASS', msg); }
    else { s.fail++; s.errors.push(msg); console.log('  FAIL', msg); }
  }
  function eq(a, b, msg) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    assert(ok, ok ? msg : `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
  }
  function ok(v, msg) { assert(!!v, msg); }
  function throws(fn, msg) {
    let t = false; try { fn(); } catch { t = true; }
    assert(t, msg);
  }
  function nothrow(fn, msg) {
    let err = null; try { fn(); } catch (e) { err = e; }
    assert(!err, msg + (err ? ` (threw ${err.message})` : ''));
  }
  function summary(name) {
    const total = s.pass + s.fail;
    console.log(`\n=== ${name} SUMMARY: ${s.pass}/${total} PASS ===`);
    if (s.fail > 0) {
      console.log('Failures:');
      for (const e of s.errors) console.log('  -', e);
    }
    return s.fail === 0 ? 0 : 1;
  }
  return { assert, eq, ok, throws, nothrow, summary, stats: s };
}

module.exports = {
  loadMode, buildSandbox, makeRNG, makeRenderQuestion,
  makeQ, defaultQuestions, makeAssert, REPO, SRC_DIR, MODES_DIR,
};
