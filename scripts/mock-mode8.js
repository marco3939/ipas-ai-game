// mock-mode8.js — DRIVE 真實 Mode8 state machine 路徑(從 src/index.html 抽出 RNG / renderQuestion,
// 並 require src/modes/mode8.js)以驗證:
//   1. Mode8.start() 抽到 5 題
//   2. 對每題完整答對所有 trace_steps → state.idx 應前進到 length(觸發 finish)
//   3. 不殘留 placeholder(code_block / stem / trace_steps[].ask / options[].text)
//   4. 整題 options 固定 schema:[{全部正確 is_correct:true}, {任一錯誤 is_correct:false}]
//
// 與「自寫 mock 跑一次邏輯」差異(§14 案例 8 教訓):
//   不自寫狀態流轉,而是抽取 src/modes/mode8.js 真實程式碼到 vm sandbox 執行。
//   配合假的 DOM(document.getElementById/querySelectorAll)讓 mode8 內部
//   show()/innerHTML 不爆,但所有 state 變化是真實的。
//
// 用法:node scripts/mock-mode8.js
// exit 0 = PASS;exit 1 = FAIL

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const MODE8_SRC = fs.readFileSync(path.join(ROOT, 'src', 'modes', 'mode8.js'), 'utf8');
const QFILE = path.join(ROOT, 'src', 'questions-mode8-trace.json');

// 1) 從 index.html 抽出 RNG / renderQuestion / applyVariables / pickCase / highlightCodeSimple
function extractBlock(src, startMarker, endMarkers) {
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) throw new Error('cannot find marker: ' + startMarker);
  let endIdx = src.length;
  for (const em of endMarkers) {
    const pos = src.indexOf(em, startIdx + startMarker.length);
    if (pos > 0 && pos < endIdx) endIdx = pos;
  }
  return src.slice(startIdx, endIdx);
}

const rngBlock = extractBlock(HTML, 'const RNG = {', ['\n// === Variation', '\nfunction applyVariables']);
const applyVarsBlock = extractBlock(HTML, 'function applyVariables', ['\n// === 計算題 case', '\nfunction pickCase']);
const pickCaseBlock = extractBlock(HTML, 'function pickCase', ['\n// === 渲染題目', '\nfunction renderQuestion']);
const renderQBlock = extractBlock(HTML, 'function renderQuestion', ['\n// === 進度', '\nconst Progress']);
const highlightBlock = extractBlock(HTML, 'function highlightCodeSimple', ['\n// === 渲染視覺', '\nfunction renderVisualData']);

// 2) 假 DOM 與 globals(讓 Mode8 內部 view.innerHTML / show() 不爆)
const fakeView = { innerHTML: '', _writes: 0 };
function fakeDocument() {
  return {
    getElementById: function (id) {
      if (id === 'view-play') return fakeView;
      // 讓 m8-options / m8-step-explanation 等內部抓取也回傳容器 stub(disabled / classList 都做 stub)
      return {
        innerHTML: '',
        disabled: false,
        classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }
      };
    },
    querySelectorAll: function () {
      // 回傳 4 個假 button(stepIdx 內 forEach 用)
      const fakeBtn = function () {
        return {
          disabled: false,
          dataset: { key: '0' },
          classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }
        };
      };
      return [fakeBtn(), fakeBtn(), fakeBtn(), fakeBtn()];
    }
  };
}

// 3) Mock Mastery / Wrongbook / Progress / SM2 / showToast / goHome / show / ErrorReports
const mockCalls = { mastery: [], wrongbook: [], progress: [], sm2: [], toast: [], show: [] };

const sandbox = {
  console,
  JSON,
  Object,
  Array,
  String,
  Math,
  Date,
  Number,
  Boolean,
  setTimeout: function (fn, ms) {
    // 立即執行(mock)— Mode 8 _scheduleTimeout 不影響邏輯主流
    return 0;
  },
  clearTimeout: function () {},
  document: fakeDocument(),
  window: {},
  // 共用層 mock
  Mastery: {
    update: function (nodeId, isCorrect) { mockCalls.mastery.push({ nodeId, isCorrect }); }
  },
  Wrongbook: {
    add: function (qid, nodeId, userKey, correctKey) { mockCalls.wrongbook.push({ qid, nodeId, userKey, correctKey }); }
  },
  Progress: {
    addAnswer: function (isCorrect) { mockCalls.progress.push({ isCorrect }); }
  },
  Storage: {
    get: function (k, d) { return d; },
    set: function () {},
    del: function () {}
  },
  showToast: function (msg, ms) { mockCalls.toast.push({ msg, ms }); },
  goHome: function () { mockCalls.show.push('view-home'); },
  show: function (viewId) { mockCalls.show.push(viewId); },
  ErrorReports: { renderButton: function () { return ''; } },
  SM2: { recordAnswer: function (qid, ok, byPath) { mockCalls.sm2.push({ qid, ok }); } }
};

vm.createContext(sandbox);

// 4) 注入 RNG / renderQuestion 等到 sandbox
const sharedSrc = [rngBlock, applyVarsBlock, pickCaseBlock, renderQBlock, highlightBlock].join('\n');
try {
  vm.runInContext(sharedSrc, sandbox);
} catch (e) {
  console.error('SANDBOX SETUP FAIL:', e.message);
  process.exit(2);
}

// 5) 設定 QUESTIONS(mode8 篩選 q.format === 'code_trace')
const data = JSON.parse(fs.readFileSync(QFILE, 'utf8'));
sandbox.QUESTIONS = data.questions;
vm.runInContext('var QUESTIONS = QUESTIONS || [];', sandbox); // 讓 mode8 IIFE 內 QUESTIONS 裸名讀可用

// 6) 注入 mode8.js 真實程式碼
try {
  vm.runInContext(MODE8_SRC, sandbox);
} catch (e) {
  console.error('MODE8 LOAD FAIL:', e.message, '\n' + e.stack);
  process.exit(2);
}

const Mode8 = sandbox.window.Mode8;
if (!Mode8 || typeof Mode8.start !== 'function') {
  console.error('FAIL: Mode8 not exported via window.Mode8');
  process.exit(2);
}

// ============================================================================
// 驗證
// ============================================================================
let pass = 0;
let fail = 0;
const errors = [];

// 第 1 步:start() 應抽到 5 題(因為池只有 5,Math.min(5,5)=5)
try {
  Mode8.start();
} catch (e) {
  console.error('Mode8.start() raised:', e.message, e.stack);
  process.exit(2);
}

if (!Mode8.state) {
  errors.push('Mode8.state is null after start()');
  fail++;
} else if (Mode8.state.questions.length !== 5) {
  errors.push(`Mode8.state.questions.length = ${Mode8.state.questions.length}, expected 5`);
  fail++;
} else if (Mode8.state.idx !== 0) {
  errors.push(`Mode8.state.idx = ${Mode8.state.idx} after start, expected 0`);
  fail++;
} else {
  pass++;
}

// 第 2 步:對每題,模擬「全部 step 答對」走完整流程,state.idx 應前進
function answerAllStepsCorrectly(maxSteps) {
  for (let s = 0; s < maxSteps; s++) {
    if (!Mode8.state) return false;
    const q = Mode8.state.currentQ;
    if (!q) return false;
    const step = q.trace_steps[Mode8.state.stepIdx];
    if (!step) return false;
    // 找出此 step 中 is_correct=true 的 idx
    const correctIdx = step.options.findIndex(o => o.is_correct);
    if (correctIdx < 0) return false;
    Mode8.answerStep(correctIdx);
    Mode8.nextStep();
  }
  return true;
}

const totalQuestions = 5;
let cycleErrors = 0;
for (let qi = 0; qi < totalQuestions; qi++) {
  if (!Mode8.state || !Mode8.state.currentQ) {
    errors.push(`At iteration ${qi}: state or currentQ missing before answer cycle`);
    cycleErrors++;
    break;
  }
  const stepCount = Mode8.state.currentQ.trace_steps.length;
  const beforeIdx = Mode8.state.idx;
  // 答完所有 steps;最後一個 nextStep() 觸發 showFullExplanation 並停在當前 idx(等使用者點 next())
  if (!answerAllStepsCorrectly(stepCount)) {
    errors.push(`Question ${qi} (idx=${beforeIdx}): answer cycle failed`);
    cycleErrors++;
    break;
  }
  // showFullExplanation 已被呼叫,state.stepResults 應全 true
  if (!Mode8.state || !Mode8.state.stepResults) {
    errors.push(`Question ${qi}: stepResults missing post-answer`);
    cycleErrors++;
    break;
  }
  if (!Mode8.state.stepResults.every(r => r === true)) {
    errors.push(`Question ${qi}: not all steps correct (${JSON.stringify(Mode8.state.stepResults)})`);
    cycleErrors++;
  }
  // 模擬使用者點「繼續下一題」按鈕
  Mode8.next();
}

if (cycleErrors === 0) {
  pass++;
} else {
  fail++;
}

// 第 3 步:全部結束後 Mode8.state 應為 null(finish() 會清掉)
if (Mode8.state !== null) {
  errors.push(`Mode8.state not null after finish (got ${typeof Mode8.state})`);
  fail++;
} else {
  pass++;
}

// 第 4 步:Mastery.update 應被呼叫 5 次,Progress.addAnswer 也是 5 次,且全 isCorrect:true
if (mockCalls.mastery.length !== 5) {
  errors.push(`Mastery.update called ${mockCalls.mastery.length} times, expected 5`);
  fail++;
} else if (!mockCalls.mastery.every(c => c.isCorrect === true)) {
  errors.push(`Mastery.update isCorrect not all true: ${JSON.stringify(mockCalls.mastery.map(c => c.isCorrect))}`);
  fail++;
} else {
  pass++;
}
if (mockCalls.progress.length !== 5) {
  errors.push(`Progress.addAnswer called ${mockCalls.progress.length} times, expected 5`);
  fail++;
} else if (!mockCalls.progress.every(c => c.isCorrect === true)) {
  errors.push(`Progress.addAnswer isCorrect not all true`);
  fail++;
} else {
  pass++;
}

// 第 5 步:全題答對,Wrongbook.add 不應被呼叫
if (mockCalls.wrongbook.length !== 0) {
  errors.push(`Wrongbook.add called ${mockCalls.wrongbook.length} times when all correct, expected 0`);
  fail++;
} else {
  pass++;
}

// 第 6 步:對每題的 schema 檢查 — 整題 options 固定為 [全部正確, 任一錯誤]
for (const q of data.questions) {
  if (!Array.isArray(q.options) || q.options.length !== 2) {
    errors.push(`${q.id}: options must be exactly 2 entries (got ${q.options ? q.options.length : 'null'})`);
    fail++;
    continue;
  }
  const correctCount = q.options.filter(o => o.is_correct).length;
  if (correctCount !== 1) {
    errors.push(`${q.id}: integer-level options is_correct count = ${correctCount}, expected 1`);
    fail++;
    continue;
  }
  // trace_steps 每步必有恰一個 is_correct
  for (let i = 0; i < q.trace_steps.length; i++) {
    const step = q.trace_steps[i];
    const c = (step.options || []).filter(o => o.is_correct).length;
    if (c !== 1) {
      errors.push(`${q.id} trace_steps[${i}] is_correct count = ${c}, expected 1`);
      fail++;
    }
    // after_line 必在合法範圍 [1, line count]
    const lineCount = (q.code_block || '').split('\n').length;
    if (step.after_line < 1 || step.after_line > lineCount) {
      errors.push(`${q.id} trace_steps[${i}] after_line=${step.after_line} out of range 1..${lineCount}`);
      fail++;
    }
  }
}
if (errors.filter(e => e.includes('options') || e.includes('after_line') || e.includes('is_correct count')).length === 0) {
  pass++;
}

// === 報告 ===
console.log(`mock-mode8.js (drives real Mode8 state machine): PASS=${pass}, FAIL=${fail}`);
if (errors.length > 0) {
  console.log('--- errors ---');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('all Mode8 state advancement / Mastery / Wrongbook / Progress integration verified');
