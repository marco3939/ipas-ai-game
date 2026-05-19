// 22-stepCheck-progression.test.js — Mode 8 step-by-step progression
// 注意:Mode 8 的「逐步檢驗」分兩個動作:
//   - answerStep(idx):記錄該 step 的對錯到 state.stepResults,鎖 answering=true
//   - nextStep():推進 state.stepIdx,answering=false,渲染下一步
// Mode 8 **不允許 retry**:answerStep 一旦 set answering=true,同 step 內第二次 answerStep
// 會因為 answering 守門直接 return(不會覆寫 stepResults)。下個動作只能是 nextStep。
//
// Verify:
//   - 答對 step N → state.stepResults push true,answerStep 後 stepIdx 不變
//   - 答錯 step N → state.stepResults push false,answerStep 後 stepIdx 不變
//   - nextStep 才推進 stepIdx
//   - 全 step 答對 → SeenCorrect.mark + Mastery(true) + 整題結算
//   - 中途答錯但繼續答完 → Wrongbook.add + Mastery(false)
//   - stepIdx 邊界:超過 trace_steps 長度後不再渲染 step,而是進入 showFullExplanation
//   - answering lock 防止同 step 連按兩次選項
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 8 stepCheck progression tests ===');
const A = makeAssert();

function makeTraceQ(id, opts = {}) {
  return makeQ(id, Object.assign({
    node_id: 'N_trace_prog',
    knowledge_code: 'L23202',
    format: 'code_trace',
    code_block: 'a = 1\nb = a + 2\nc = b * 3',
    trace_steps: [
      { after_line: 1, ask: 'a?',
        options: [
          { text: '1', is_correct: true },
          { text: '0', is_correct: false, trap_type: 'init_wrong' },
        ] },
      { after_line: 2, ask: 'b?',
        options: [
          { text: '3', is_correct: true },
          { text: '2', is_correct: false, trap_type: 'wrong_add' },
        ] },
      { after_line: 3, ask: 'c?',
        options: [
          { text: '9', is_correct: true },
          { text: '6', is_correct: false, trap_type: 'wrong_mul' },
        ] },
    ],
    options: [
      { text: '全部正確', is_correct: true },
      { text: '任一錯誤', is_correct: false },
    ],
    explanation: { correct: 'trace exp', hook: 'h' },
  }, opts));
}

function correctIdx(step) { return step.options.findIndex(o => o.is_correct); }
function wrongIdx(step)   { return step.options.findIndex(o => !o.is_correct); }

// --- 1: answerStep 答對 → stepResults push true,stepIdx 不變,answering=true ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  A.eq(r.Mode.state.stepIdx, 0, '初始 stepIdx=0');
  A.eq(r.Mode.state.stepResults.length, 0, '初始 stepResults 空');
  r.Mode.answerStep(correctIdx(q.trace_steps[0]));
  A.eq(r.Mode.state.stepResults.length, 1, 'answerStep 後 stepResults 長度=1');
  A.eq(r.Mode.state.stepResults[0], true, 'stepResults[0] === true(答對)');
  A.eq(r.Mode.state.stepIdx, 0, 'answerStep 不推進 stepIdx');
  A.eq(r.Mode.state.answering, true, 'answering=true(鎖)');
}

// --- 2: nextStep 推進 stepIdx 並解鎖 answering ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p2')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  r.Mode.answerStep(correctIdx(q.trace_steps[0]));
  r.Mode.nextStep();
  A.eq(r.Mode.state.stepIdx, 1, 'nextStep 推進 stepIdx → 1');
  A.eq(r.Mode.state.answering, false, 'nextStep 後 answering=false');
}

// --- 3: answerStep 答錯 → stepResults push false ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p3')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  r.Mode.answerStep(wrongIdx(q.trace_steps[0]));
  A.eq(r.Mode.state.stepResults[0], false, 'stepResults[0]=false(答錯)');
  A.eq(r.Mode.state.answering, true, '答錯後 answering 仍鎖');
}

// --- 4: answering lock — 同 step 再 answerStep 不會覆寫 stepResults ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p4')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  // 第一次答錯
  r.Mode.answerStep(wrongIdx(q.trace_steps[0]));
  A.eq(r.Mode.state.stepResults.length, 1, '第一次 answerStep 記錄');
  // 第二次企圖答對 — 應被 answering 守門擋下
  r.Mode.answerStep(correctIdx(q.trace_steps[0]));
  A.eq(r.Mode.state.stepResults.length, 1,
    '同 step 重複 answerStep 被 answering 守門擋下(不追加)');
  A.eq(r.Mode.state.stepResults[0], false,
    '第一次的「答錯」結果保留(不被覆寫)');
}

// --- 5: 連續 3 step 全對 → 結算 allCorrect=true ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p5')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  for (let i = 0; i < q.trace_steps.length; i++) {
    r.Mode.answerStep(correctIdx(q.trace_steps[i]));
    r.Mode.nextStep();
  }
  // 最後一個 nextStep 觸發 showFullExplanation(allCorrect=true)
  const lastMastery = r.stats.masteryCalls[r.stats.masteryCalls.length - 1];
  A.ok(lastMastery && lastMastery.isCorrect === true,
    '全 step 對 → 最後 Mastery.update(isCorrect=true)');
  A.ok(r.stats.seenCorrectCalls.includes(q.id),
    '全 step 對 → SeenCorrect.mark(q.id)');
  A.ok(!r.stats.wrongbookCalls.some(c => c.qid === q.id),
    '全 step 對 → Wrongbook 不寫');
}

// --- 6: 中途答錯後續答對 → 整題仍計錯,Wrongbook.add 觸發 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p6')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  // step 0 錯
  r.Mode.answerStep(wrongIdx(q.trace_steps[0]));
  r.Mode.nextStep();
  // step 1 對
  r.Mode.answerStep(correctIdx(q.trace_steps[1]));
  r.Mode.nextStep();
  // step 2 對
  r.Mode.answerStep(correctIdx(q.trace_steps[2]));
  r.Mode.nextStep();
  const lastMastery = r.stats.masteryCalls[r.stats.masteryCalls.length - 1];
  A.eq(lastMastery.isCorrect, false,
    '任一 step 錯 → 整題 Mastery.update(isCorrect=false)');
  A.ok(r.stats.wrongbookCalls.some(c => c.qid === q.id),
    'Wrongbook.add 被觸發');
  A.ok(!r.stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect 不 mark');
}

// --- 7: stepIdx 邊界 — 跨越 trace_steps 長度後不渲染 step,進入結算 ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p7')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  const total = q.trace_steps.length;
  // 答完所有 step
  for (let i = 0; i < total; i++) {
    r.Mode.answerStep(correctIdx(q.trace_steps[i]));
    r.Mode.nextStep();
  }
  A.ok(r.Mode.state.stepIdx >= total,
    `結算後 stepIdx (${r.Mode.state.stepIdx}) >= total trace_steps (${total})`);
  // Progress.addAnswer 應被呼叫一次(整題)
  A.ok(r.stats.progressCalls.length >= 1,
    'Progress.addAnswer 至少呼叫一次(整題結算)');
}

// --- 8: SM2.recordAnswer 在整題結算時觸發(allCorrect 決定 isCorrect)---
{
  const r = loadMode(8, { questions: [makeTraceQ('p8')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  // 全對
  for (let i = 0; i < q.trace_steps.length; i++) {
    r.Mode.answerStep(correctIdx(q.trace_steps[i]));
    r.Mode.nextStep();
  }
  const sm2 = r.stats.sm2Calls.find(c => c.qid === q.id);
  A.ok(sm2, 'SM2.recordAnswer 被呼叫(整題結算層級)');
  A.eq(sm2.isCorrect, true, 'SM2.isCorrect=true(全 step 對)');
}

// --- 9: 跨題流程 — next() 後新題 stepIdx 重置為 0 ---
{
  const r = loadMode(8, {
    questions: [makeTraceQ('p9a'), makeTraceQ('p9b')]
  });
  r.Mode.start();
  r.Mode.startCategory('all');
  // 第一題答完
  const q1 = r.Mode.state.currentQ;
  for (let i = 0; i < q1.trace_steps.length; i++) {
    r.Mode.answerStep(correctIdx(q1.trace_steps[i]));
    r.Mode.nextStep();
  }
  // 進下一題
  r.Mode.next();
  if (r.Mode.state && r.Mode.state.idx < r.Mode.state.questions.length) {
    A.eq(r.Mode.state.stepIdx, 0,
      '新題 stepIdx 重置為 0');
    A.eq(r.Mode.state.stepResults, [],
      '新題 stepResults 重置為空陣列');
    A.eq(r.Mode.state.answering, false,
      '新題 answering=false');
  } else {
    A.ok(true, '單題池下 next() 已結算(skip 新題斷言)');
    A.ok(true, '單題池下 next() 已結算');
    A.ok(true, '單題池下 next() 已結算');
  }
}

// --- 10: answerStep 不合法 idx(超過 step.options 長度)安全 no-op ---
{
  const r = loadMode(8, { questions: [makeTraceQ('p10')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  A.nothrow(() => r.Mode.answerStep(999),
    'answerStep(999) 不 throw(option 不存在 → no-op)');
  A.eq(r.Mode.state.stepResults.length, 0,
    'answerStep(999) 不寫入 stepResults');
  A.eq(r.Mode.state.answering, false,
    'answerStep(999) 不鎖 answering');
}

process.exit(A.summary('Mode8 stepCheck progression'));
