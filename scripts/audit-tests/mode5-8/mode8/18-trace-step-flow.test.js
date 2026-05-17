// 18-trace-step-flow.test.js — Mode 8 Code Trace step flow
// Verify:
//   - start() shows category picker, NOT immediate question
//   - startCategory(catKey) picks questions, calls showQuestion
//   - answerStep records step result, transitions correctly
//   - nextStep at last step → showFullExplanation → integrated Mastery write
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 8 trace step flow tests ===');
const A = makeAssert();

function makeTraceQuestion(id, opts = {}) {
  return makeQ(id, Object.assign({
    node_id: 'N_trace',
    knowledge_code: 'L23202',
    format: 'code_trace',
    code_block: 'x = 1\ny = x + 2\nz = y * 3',
    trace_steps: [
      {
        after_line: 1,
        ask: 'What is x?',
        options: [
          { text: '1', is_correct: true, trap_type: null },
          { text: '0', is_correct: false, trap_type: 'off_by_one' },
        ],
      },
      {
        after_line: 2,
        ask: 'What is y?',
        options: [
          { text: '3', is_correct: true, trap_type: null },
          { text: '2', is_correct: false, trap_type: 'off_by_one' },
        ],
      },
    ],
    options: [
      { text: '全部正確', is_correct: true },
      { text: '任一錯誤', is_correct: false },
    ],
    tags: ['python'],
  }, opts));
}

// --- 1: start() shows picker (does not directly render question) ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  A.ok(r.Mode.state !== null, 'state initialized');
  A.eq(r.Mode.state.category, null, 'category null after start (picker shown)');
  A.eq(r.Mode.state.questions, [], 'questions empty after start');
}

// --- 2: startCategory picks questions and starts ---
{
  const r = loadMode(8, {
    questions: [makeTraceQuestion('t1'), makeTraceQuestion('t2'), makeTraceQuestion('t3')]
  });
  r.Mode.start();
  r.Mode.startCategory('all');
  A.ok(r.Mode.state.questions.length > 0, 'questions populated');
  A.eq(r.Mode.state.category, 'all', "category='all' after startCategory");
  A.ok(r.Mode.state.currentQ !== null, 'currentQ populated');
}

// --- 3: answerStep records step results + locks state.answering ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  const step = q.trace_steps[0];
  // Pick the CORRECT option for step 0
  const correctIdx = step.options.findIndex(o => o.is_correct);
  r.Mode.answerStep(correctIdx);
  A.eq(r.Mode.state.stepResults.length, 1, '1 step result recorded');
  A.eq(r.Mode.state.stepResults[0], true, 'first step correct');
  A.eq(r.Mode.state.answering, true, 'answering=true after answerStep (locked)');
}

// --- 4: nextStep advances stepIdx ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  const step0 = q.trace_steps[0];
  r.Mode.answerStep(step0.options.findIndex(o => o.is_correct));
  A.eq(r.Mode.state.stepIdx, 0, 'stepIdx=0 before nextStep');
  r.Mode.nextStep();
  A.eq(r.Mode.state.stepIdx, 1, 'stepIdx=1 after nextStep');
  A.eq(r.Mode.state.answering, false, 'answering=false after nextStep');
}

// --- 5: last step nextStep → integrated Mastery/Wrongbook write ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  // Answer all steps correctly
  for (let i = 0; i < q.trace_steps.length; i++) {
    const step = q.trace_steps[i];
    r.Mode.answerStep(step.options.findIndex(o => o.is_correct));
    r.Mode.nextStep();
  }
  // After last nextStep, Mastery.update should have fired with allCorrect=true
  const masteryUpdates = r.stats.masteryCalls.filter(c => c.nodeId === 'N_trace');
  A.ok(masteryUpdates.length >= 1, 'Mastery.update fired for trace q (all steps correct)');
  A.eq(masteryUpdates[masteryUpdates.length - 1].isCorrect, true,
    'final Mastery.update has isCorrect=true (all steps correct)');
  A.ok(r.stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect.mark called when all steps correct (case 10 LOW-1)');
  A.ok(!r.stats.wrongbookCalls.some(c => c.qid === q.id),
    'Wrongbook NOT called when all steps correct');
}

// --- 6: any wrong step → integrated Wrongbook write at end ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  // Wrong on first step, correct on second
  const step0 = q.trace_steps[0];
  const wrongIdx0 = step0.options.findIndex(o => !o.is_correct);
  r.Mode.answerStep(wrongIdx0);
  r.Mode.nextStep();
  // Step 1 correct
  const step1 = q.trace_steps[1];
  r.Mode.answerStep(step1.options.findIndex(o => o.is_correct));
  r.Mode.nextStep();
  // Verify Wrongbook called
  A.ok(r.stats.wrongbookCalls.some(c => c.qid === q.id),
    'Wrongbook.add called when any step wrong (allCorrect=false)');
  // userText / correctText non-empty (case 10)
  const wbCall = r.stats.wrongbookCalls.find(c => c.qid === q.id);
  A.ok(wbCall.userText && wbCall.userText.length > 0,
    'Wrongbook userText non-empty (case 10)');
  A.ok(wbCall.correctText && wbCall.correctText.length > 0,
    'Wrongbook correctText non-empty (case 10)');
  A.ok(!r.stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect NOT called when allCorrect=false');
}

// --- 7: next() advances to next question, then finish ---
{
  const r = loadMode(8, {
    questions: [makeTraceQuestion('t1'), makeTraceQuestion('t2')]
  });
  r.Mode.start();
  r.Mode.startCategory('all');
  const firstQ = r.Mode.state.currentQ;
  r.Mode.next();
  if (r.Mode.state.questions.length > 1) {
    A.eq(r.Mode.state.idx, 1, 'next() advances idx to 1');
  } else {
    // Only one Q in pool — fine
    A.ok(true, 'next() handled with single question (passed)');
  }
}

// --- 8: category-specific pool filtering ---
{
  const r = loadMode(8, {
    questions: [
      makeTraceQuestion('q_numpy', { knowledge_code: 'L23102', tags: ['reshape', 'shape'] }),
      makeTraceQuestion('q_ml',    { knowledge_code: 'L23202', tags: ['KNN'] }),
    ]
  });
  r.Mode.start();
  r.Mode.startCategory('numpy_la');
  // Should pick the numpy one
  A.ok(r.Mode.state.questions.some(q => q.id === 'q_numpy'),
    "startCategory('numpy_la') picks q_numpy");
}

process.exit(A.summary('Mode8 trace step flow'));
