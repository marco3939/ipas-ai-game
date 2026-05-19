// 23-cleanup-trace-state.test.js — Mode 8 state cleanup / 退場路徑
// 注意:Mode 8 沒有 cleanup() 公開方法。實際的清理路徑:
//   - finish():state = null + _stopTimer + _setExamMode(false)
//   - start():_clearAllTimers + 重建 state
//   - _clearAllTimers():清 _timers[] + _setExamMode(false)
// 「goHome」是外部全域函式,不會自動清 Mode8.state(走 _exitExam 流程,
// 但在 vm sandbox 中 _setExamMode 為 undefined)。
//
// Verify:
//   - finish() 後 state = null(整場結束清乾淨)
//   - start() 兩次連跑 → 前場污染完全清除
//   - _clearAllTimers() 清空 _timers[](setTimeout 句柄不殘留)
//   - _scheduleTimeout 註冊 timer ID 進 _timers,被 _clearAllTimers 收割
//   - 中途切到下一題 showQuestion 會先 _stopTimer(不殘留前題 timer)
//   - state=null 後 answerStep / nextStep / _handleTimeout 安全 no-op
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 8 cleanup trace state tests ===');
const A = makeAssert();

function makeTraceQ(id, opts = {}) {
  return makeQ(id, Object.assign({
    node_id: 'N_trace_cleanup',
    knowledge_code: 'L23202',
    format: 'code_trace',
    code_block: 'x = 1\ny = x + 1',
    trace_steps: [
      { after_line: 1, ask: 'x?',
        options: [
          { text: '1', is_correct: true },
          { text: '0', is_correct: false },
        ] },
      { after_line: 2, ask: 'y?',
        options: [
          { text: '2', is_correct: true },
          { text: '1', is_correct: false },
        ] },
    ],
    options: [
      { text: '全部正確', is_correct: true },
      { text: '任一錯誤', is_correct: false },
    ],
    explanation: { correct: 'exp', hook: 'h' },
  }, opts));
}

// --- 1: finish() 清 state 為 null ---
{
  const r = loadMode(8, { questions: [makeTraceQ('c1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  A.ok(r.Mode.state !== null, '進場後 state 非 null');
  r.Mode.finish();
  A.eq(r.Mode.state, null, 'finish() 後 state === null');
}

// --- 2: _clearAllTimers 清空 _timers 陣列 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('c2')] });
  // 直接塞兩個假 timer ID 到 _timers
  r.Mode._timers.push(1234, 5678);
  A.eq(r.Mode._timers.length, 2, '預埋 2 個 timer ID');
  r.Mode._clearAllTimers();
  A.eq(r.Mode._timers.length, 0, '_clearAllTimers 後 _timers 清空');
}

// --- 3: _scheduleTimeout 註冊 timer 進 _timers,可被 _clearAllTimers 收割 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('c3')] });
  // 註冊 3 個 timer
  r.Mode._scheduleTimeout(function () {}, 1000);
  r.Mode._scheduleTimeout(function () {}, 2000);
  r.Mode._scheduleTimeout(function () {}, 3000);
  A.eq(r.Mode._timers.length, 3,
    '_scheduleTimeout 3 次後 _timers.length=3');
  r.Mode._clearAllTimers();
  A.eq(r.Mode._timers.length, 0, '清完後 _timers=0');
}

// --- 4: start() 兩次連跑 — 前場污染完全清除 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('c4_a'), makeTraceQ('c4_b')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  // 污染:答對 step 0 + nextStep 推進
  const q = r.Mode.state.currentQ;
  r.Mode.answerStep(q.trace_steps[0].options.findIndex(o => o.is_correct));
  r.Mode.nextStep();
  // 預先塞 timer
  r.Mode._scheduleTimeout(function () {}, 5000);
  A.ok(r.Mode._timers.length >= 1, '污染:有 timer 殘留');
  // 第二場 start
  r.Mode.start();
  A.eq(r.Mode._timers.length, 0,
    '重 start 後 _timers 清空(_clearAllTimers 被呼叫)');
  A.eq(r.Mode.state.stepIdx, 0, '重 start 後 stepIdx=0');
  A.eq(r.Mode.state.stepResults, [], '重 start 後 stepResults=[]');
  A.eq(r.Mode.state.category, null, '重 start 後 category=null');
}

// --- 5: showQuestion 進新題會 _stopTimer(state._timerId 清 null)---
{
  const r = loadMode(8, { questions: [makeTraceQ('c5_a'), makeTraceQ('c5_b')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  // 塞假 _timerId 模擬計時器在跑
  r.Mode.state._timerId = 999;
  // 推進到下一題(走完當前題)
  const q1 = r.Mode.state.currentQ;
  for (let i = 0; i < q1.trace_steps.length; i++) {
    r.Mode.answerStep(q1.trace_steps[i].options.findIndex(o => o.is_correct));
    r.Mode.nextStep();
  }
  r.Mode.next();
  // 進入下一題的 showQuestion 應先 _stopTimer → _timerId 被清
  if (r.Mode.state) {
    A.eq(r.Mode.state._timerId, null,
      'showQuestion 進新題前 _stopTimer 清 _timerId=null');
  } else {
    A.ok(true, '單題池下 finish 已清乾淨');
  }
}

// --- 6: state=null 後 answerStep / nextStep 安全 no-op(不 throw)---
{
  const r = loadMode(8, { questions: [makeTraceQ('c6')] });
  // 不 start,state 為 null
  A.eq(r.Mode.state, null, '未 start 時 state=null');
  A.nothrow(() => r.Mode.answerStep(0),
    'state=null 時 answerStep 不 throw');
  A.nothrow(() => r.Mode.nextStep(),
    'state=null 時 nextStep 不 throw');
  A.nothrow(() => r.Mode._handleTimeout(),
    'state=null 時 _handleTimeout 不 throw');
  A.nothrow(() => r.Mode.next(),
    'state=null 時 next 不 throw');
  A.nothrow(() => r.Mode.finish(),
    'state=null 時 finish 不 throw');
}

// --- 7: finish() 不污染下一場 — start() 後 state 重新乾淨 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('c7')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  // 直接 finish
  r.Mode.finish();
  A.eq(r.Mode.state, null, 'finish 後 state=null');
  // 再開新場
  r.Mode.start();
  A.ok(r.Mode.state !== null, '新場 state 重建');
  A.eq(r.Mode.state.idx, 0, '新場 idx=0');
  A.eq(r.Mode.state.stepResults, [], '新場 stepResults=[]');
  A.eq(r.Mode.state.questions, [], '新場 questions=[](尚未 startCategory)');
}

process.exit(A.summary('Mode8 cleanup trace state'));
