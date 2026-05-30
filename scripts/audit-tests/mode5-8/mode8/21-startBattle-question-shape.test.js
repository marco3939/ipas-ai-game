// 21-startBattle-question-shape.test.js — Mode 8 startup + question shape contract
// 注意:Mode 8 沒有 startBattle() 方法,實際入口是 start() + startCategory(catKey)
// (start() 顯示 picker,startCategory() 才抽題進 trace)
// 本測試對齊 spec 意圖:驗證「進入戰鬥後拿到的題目 shape 正確」。
//
// Verify:
//   - state.currentQ 是 trace 題(有 code_block / trace_steps / options 等 trace 特有欄位)
//   - 題池來自 QUESTIONS.filter(q => q.format === 'code_trace')(對應 questions-mode8-trace.json)
//   - 題目 options 通過 renderQuestion 後有 key A/B(案例 10 防線:整題層級 [全對/任一錯] 二選一)
//   - trace mode 題目都是 format='code_trace'(不允許 single_choice / calculation 混進來)
//   - 連續 start() 2 次 state 完全 reset(不殘留前場 stepResults / idx / stepIdx)
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 8 startBattle question shape tests ===');
const A = makeAssert();

function makeTraceQ(id, opts = {}) {
  return makeQ(id, Object.assign({
    node_id: 'N_trace_shape',
    knowledge_code: 'L23202',
    format: 'code_trace',
    code_block: 'a = 1\nb = a + 2\nc = b * 3',
    trace_steps: [
      {
        after_line: 1, ask: 'a?',
        options: [
          { text: '1', is_correct: true, trap_type: null },
          { text: '0', is_correct: false, trap_type: 'off_by_one' },
          { text: '2', is_correct: false, trap_type: 'off_by_two' },
        ],
      },
      {
        after_line: 2, ask: 'b?',
        options: [
          { text: '3', is_correct: true, trap_type: null },
          { text: '2', is_correct: false, trap_type: 'wrong_op' },
        ],
      },
    ],
    options: [
      { text: '全部正確', is_correct: true },
      { text: '任一錯誤', is_correct: false },
    ],
    explanation: { correct: 'trace explanation', hook: 'hook' },
    tags: ['python'],
  }, opts));
}

// --- 1: state.currentQ 在 startCategory 後有 trace 題的 schema 欄位 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  A.ok(q !== null, 'state.currentQ 非 null');
  A.ok(typeof q.code_block === 'string' && q.code_block.length > 0,
    'currentQ.code_block 是非空字串');
  A.ok(Array.isArray(q.trace_steps) && q.trace_steps.length > 0,
    'currentQ.trace_steps 是非空陣列');
  A.eq(q.format, 'code_trace', 'currentQ.format === code_trace');
}

// --- 2: 題池僅含 code_trace(混入其他 format 會被 tracePool() 過濾)---
{
  const r = loadMode(8, {
    questions: [
      makeTraceQ('t_ok_1'),
      makeQ('t_sc_intruder', { format: 'single_choice' }), // 闖入者
      makeTraceQ('t_ok_2'),
      makeQ('t_calc_intruder', { format: 'calculation' }), // 闖入者
    ]
  });
  r.Mode.start();
  r.Mode.startCategory('all');
  // 抽到的題全是 code_trace
  const sampledFormats = r.Mode.state.questions.map(q => q.format);
  A.ok(sampledFormats.every(f => f === 'code_trace'),
    `戰鬥題池僅含 code_trace 題(got formats: ${sampledFormats.join(', ')})`);
  A.ok(!r.Mode.state.questions.some(q => q.id === 't_sc_intruder'),
    'single_choice 闖入者被過濾掉');
  A.ok(!r.Mode.state.questions.some(q => q.id === 't_calc_intruder'),
    'calculation 闖入者被過濾掉');
}

// --- 3: renderQuestion 後 currentQ.options 有 key A/B(案例 10 防線)---
{
  const r = loadMode(8, { questions: [makeTraceQ('t_keyed')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  A.ok(Array.isArray(q.options), 'currentQ.options 是陣列');
  A.ok(q.options.length >= 2, 'currentQ.options 至少 2 項(整題[全對/任一錯])');
  // 每個 option 都有 key,且 key 在 A/B/C/D 內(案例 10:洗牌後必加 key)
  q.options.forEach((o, i) => {
    A.ok(typeof o.key === 'string' && /^[A-F]$/.test(o.key),
      `currentQ.options[${i}].key 是 A-F 字母(案例 10),got "${o.key}"`);
  });
  // 必有「is_correct: true」之選項(整題層級的正確答案)
  A.ok(q.options.some(o => o.is_correct === true),
    'currentQ.options 至少 1 項 is_correct=true');
}

// --- 4: 連續 2 次 start() — state 應完全 reset(不殘留前場資料)---
{
  const r = loadMode(8, { questions: [makeTraceQ('t_a'), makeTraceQ('t_b')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  // 污染前場:答對 step 0、推進
  const q1 = r.Mode.state.currentQ;
  const step0 = q1.trace_steps[0];
  r.Mode.answerStep(step0.options.findIndex(o => o.is_correct));
  r.Mode.nextStep();
  A.ok(r.Mode.state.stepIdx > 0 || r.Mode.state.stepResults.length > 0,
    '第一場已產生 stepResults / stepIdx 污染');
  // 第二場 start
  r.Mode.start();
  A.eq(r.Mode.state.category, null, '重 start 後 category=null');
  A.eq(r.Mode.state.idx, 0, '重 start 後 idx=0');
  A.eq(r.Mode.state.stepIdx, 0, '重 start 後 stepIdx=0');
  A.eq(r.Mode.state.stepResults, [], '重 start 後 stepResults=[]');
  A.eq(r.Mode.state.questions, [], '重 start 後 questions=[]');
  A.eq(r.Mode.state.currentQ, null, '重 start 後 currentQ=null');
  A.eq(r.Mode.state.answering, false, '重 start 後 answering=false');
}

// --- 5: trace_steps 內 step.options 結構正確(每步是獨立小題)---
{
  const r = loadMode(8, { questions: [makeTraceQ('t_steps')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  q.trace_steps.forEach((step, i) => {
    A.ok(typeof step.after_line === 'number',
      `trace_steps[${i}].after_line 是 number`);
    A.ok(typeof step.ask === 'string' && step.ask.length > 0,
      `trace_steps[${i}].ask 是非空字串`);
    A.ok(Array.isArray(step.options) && step.options.length >= 2,
      `trace_steps[${i}].options 至少 2 個選項`);
    A.ok(step.options.some(o => o.is_correct === true),
      `trace_steps[${i}].options 至少 1 個 is_correct=true`);
  });
}

// --- 6: state 初始化包含計時器欄位(_timerDuration / _timerRemaining)---
{
  const r = loadMode(8, { questions: [makeTraceQ('t_timer')] });
  r.Mode.start();
  // start() 已初始化 _timerDuration
  A.ok(typeof r.Mode.state._timerDuration === 'number',
    'state._timerDuration 在 start 後初始化為 number');
  A.eq(r.Mode.state._timerDuration, 90,
    'state._timerDuration === 90(每題 90s)');
}

// --- 7: tracePool 為空 → start() 不會建出可用 state(防 crash)---
{
  const r = loadMode(8, {
    questions: [
      makeQ('not_trace_1', { format: 'single_choice' }),
      makeQ('not_trace_2', { format: 'calculation' }),
    ]
  });
  // start 應該 toast + goHome,不會 throw
  A.nothrow(() => r.Mode.start(),
    'tracePool 為空時 start() 不 throw');
  A.ok(r.stats.toasts.some(t => t.includes('題庫') || t.includes('未載入')),
    'tracePool 為空時 toast 提示');
}

process.exit(A.summary('Mode8 startBattle question shape'));
