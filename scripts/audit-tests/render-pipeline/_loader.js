// _loader.js — Extracts render-pipeline modules from src/index.html for Node testing.
//
// Strategy: read index.html, slice out the JS snippets for RNG / applyVariables /
// pickCase / renderQuestion / highlightCodeSimple / renderVisualData /
// PlayEngine (partial — answer/show inspect happens in tests with mocked DOM),
// stub the browser globals (document, localStorage, showToast, etc.), then eval
// in a fresh vm.Context.
//
// This is intentionally NOT a copy of the source — we use the actual lines, so
// regressions in the file under test are surfaced.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX_PATH = path.resolve(__dirname, '../../../src/index.html');

function readSource() {
  return fs.readFileSync(INDEX_PATH, 'utf-8');
}

// Slice helper:starts at the first line matching `startMarker`, ends at line
// matching `endMarker` (exclusive).
function sliceBetween(src, startRe, endRe) {
  const startMatch = startRe.exec(src);
  if (!startMatch) throw new Error('start marker not found: ' + startRe);
  const startIdx = startMatch.index;
  endRe.lastIndex = startIdx + startMatch[0].length;
  const endMatch = endRe.exec(src);
  if (!endMatch) throw new Error('end marker not found: ' + endRe);
  return src.slice(startIdx, endMatch.index);
}

function buildContext() {
  const src = readSource();

  // Slice RNG → applyVariables → pickCase → renderQuestion
  // From `const RNG = {` to start of `// === 進度 / 倒數 ===`
  const rngBlock = sliceBetween(
    src,
    /const RNG = \{/g,
    /\/\/ === 進度 \/ 倒數 ===/g
  );

  // highlightCodeSimple + renderVisualData
  const visualBlock = sliceBetween(
    src,
    /function highlightCodeSimple\(/g,
    /\/\/ === Player 系統 ===/g
  );

  // PlayEngine (just the object literal — we will not call show/answer that
  // touch DOM directly in this helper; tests mock document and call methods)
  const playEngineBlock = sliceBetween(
    src,
    /const PlayEngine = \{/g,
    /\/\/ === Case 11 \(2026-05-17 P0\) ===/g
  );

  // Build sandbox with browser stubs
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    Symbol,
    Promise,
    Error,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    // DOM stubs
    document: {
      _innerHTMLLog: [],
      getElementById(id) {
        const self = this;
        return {
          id,
          innerHTML: '',
          set innerHTMLSetter(v) { self._innerHTMLLog.push({ id, v }); },
          appendChild() {},
          querySelectorAll() { return []; },
          classList: { add(){}, remove(){}, toggle(){} },
          dataset: {},
          style: {}
        };
      },
      querySelectorAll() { return []; },
      createElement() { return { className: '', textContent: '', remove(){} }; }
    },
    window: {},
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] === undefined ? null : this._store[k]; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    },
    // Stubs of cross-module functions referenced by PlayEngine
    Mastery: { update: () => {}, _calls: [] },
    SM2: { recordAnswer: () => {} },
    Progress: { addAnswer: () => {} },
    SeenCorrect: { mark: () => {} },
    Wrongbook: { add: function(...args) { this._calls.push(args); }, _calls: [] },
    ErrorReports: { renderButton: () => '' },
    refreshHome: () => {},
    goHome: () => {},
    show: () => {},
    showToast: () => {},
    DrillSession: { start: () => {} },
    ConfusionMatrix: undefined,
    QUESTIONS: [],
    // We need `this` binding for Wrongbook methods to work
  };
  // Re-bind Wrongbook.add to use this._calls correctly
  sandbox.Wrongbook = {
    _calls: [],
    add(...args) { this._calls.push(args); }
  };
  sandbox.Mastery = {
    _calls: [],
    update(nodeId, isCorrect) { this._calls.push([nodeId, isCorrect]); }
  };
  sandbox.SM2 = {
    _calls: [],
    recordAnswer(...args) { this._calls.push(args); }
  };
  sandbox.Progress = {
    _calls: [],
    addAnswer(...args) { this._calls.push(args); }
  };
  sandbox.SeenCorrect = {
    _calls: [],
    mark(...args) { this._calls.push(args); }
  };

  const context = vm.createContext(sandbox);

  // `const`/`let` in vm.runInContext stay lexical and don't reach the sandbox.
  // Rewrite top-level `const RNG = {...}` / `const PlayEngine = {...}` to
  // `var` so the assignment is visible to subsequent scripts.  We also strip
  // re-declarations of any name already in the sandbox by patching the
  // identifier prefix.
  const constToVar = (s) => s
    .replace(/^const RNG = \{/m, 'var RNG = {')
    .replace(/^const PlayEngine = \{/m, 'var PlayEngine = {');

  vm.runInContext(constToVar(rngBlock), context, { filename: 'index.html#rng-render' });
  vm.runInContext(visualBlock, context, { filename: 'index.html#visual' });
  vm.runInContext(constToVar(playEngineBlock), context, { filename: 'index.html#playengine' });

  return { sandbox, context };
}

function freshContext() {
  return buildContext();
}

module.exports = { freshContext, INDEX_PATH };
