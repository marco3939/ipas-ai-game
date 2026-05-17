// 20-seencorrect-mark-allCorrect.test.js — case 10 LOW-1
// Mode 8 marks SeenCorrect only when ALL trace_steps answered correctly.
// Verify the allCorrect derivation logic + cross-relay filtering.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 8 SeenCorrect.mark on allCorrect (case 10 LOW-1) tests ===');
const A = makeAssert();

function makeTraceQuestion(id, opts = {}) {
  return makeQ(id, Object.assign({
    node_id: 'N_trace_sc',
    knowledge_code: 'L23202',
    format: 'code_trace',
    code_block: 'a = 1\nb = 2',
    trace_steps: [
      { after_line: 1, ask: 'a?',
        options: [{ text: '1', is_correct: true }, { text: '0', is_correct: false }] },
      { after_line: 2, ask: 'b?',
        options: [{ text: '2', is_correct: true }, { text: '1', is_correct: false }] },
      { after_line: 2, ask: 'sum?',
        options: [{ text: '3', is_correct: true }, { text: '0', is_correct: false }] },
    ],
    options: [
      { text: '全部正確', is_correct: true },
      { text: '任一錯誤', is_correct: false },
    ],
  }, opts));
}

function playToCompletion(r, results) {
  // results: array of booleans (true = pick correct, false = pick wrong)
  const q = r.Mode.state.currentQ;
  for (let i = 0; i < q.trace_steps.length; i++) {
    const step = q.trace_steps[i];
    const idx = results[i]
      ? step.options.findIndex(o => o.is_correct)
      : step.options.findIndex(o => !o.is_correct);
    r.Mode.answerStep(idx);
    r.Mode.nextStep();
  }
}

// --- 1: All 3 steps correct → SeenCorrect.mark fired ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('q_all_correct')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  playToCompletion(r, [true, true, true]);
  A.ok(r.stats.seenCorrectCalls.includes(q.id),
    `${q.id}: SeenCorrect.mark called when all 3 steps correct`);
}

// --- 2: 1 wrong, rest correct → SeenCorrect NOT marked ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('q_mixed')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  playToCompletion(r, [true, false, true]);
  A.ok(!r.stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect NOT marked when any step wrong (LOW-1: only allCorrect)');
}

// --- 3: All 3 wrong → SeenCorrect NOT marked ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('q_all_wrong')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  playToCompletion(r, [false, false, false]);
  A.ok(!r.stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect NOT marked when no steps correct');
}

// --- 4: pickQuestions uses SeenCorrect.filterForBattle ---
{
  const questions = [];
  for (let i = 0; i < 10; i++) {
    questions.push(makeTraceQuestion(`q${i}`));
  }
  const r = loadMode(8, { questions });
  // Pre-mark some questions as seen-correct
  r.sandbox.SeenCorrect.mark('q0');
  r.sandbox.SeenCorrect.mark('q1');
  r.sandbox.SeenCorrect.mark('q2');
  r.Mode.start();
  r.Mode.startCategory('all');
  const picked = r.Mode.state.questions.map(q => q.id);
  // None of q0/q1/q2 should be in picked (or fallback toast shown)
  // QUESTIONS_PER_GAME = 5, available fresh = 7 (10-3), enough → no fallback
  const overlap = picked.filter(id => ['q0','q1','q2'].includes(id));
  A.eq(overlap.length, 0,
    'startCategory excludes already-seen-correct questions via SeenCorrect.filterForBattle');
}

// --- 5: insufficient fresh → fallback to allow reuse + toast ---
{
  const questions = [
    makeTraceQuestion('q0'), makeTraceQuestion('q1'), makeTraceQuestion('q2'),
  ];
  const r = loadMode(8, { questions });
  // Mark ALL as seen — fallback should kick in
  r.sandbox.SeenCorrect.mark('q0');
  r.sandbox.SeenCorrect.mark('q1');
  r.sandbox.SeenCorrect.mark('q2');
  r.Mode.start();
  r.Mode.startCategory('all');
  A.ok(r.stats.toasts.some(t => t.includes('可用新題不足') || t.includes('允許重複')),
    'insufficient fresh → toast indicating fallback');
  A.ok(r.Mode.state.questions.length > 0,
    'questions still populated via fallback');
}

// --- 6: source contract — only call SeenCorrect.mark inside allCorrect block ---
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode8.js'), 'utf8');
  // Check nextStep body has `if (allCorrect && q.id && ... SeenCorrect.mark`
  A.ok(/allCorrect && q\.id && typeof SeenCorrect[\s\S]*?SeenCorrect\.mark\(q\.id\)/.test(src),
    'mode8: SeenCorrect.mark wrapped in allCorrect check (LOW-1)');
}

// --- 7: integrated check — playing all correctly across multiple Qs ---
{
  const questions = [
    makeTraceQuestion('mq0'), makeTraceQuestion('mq1'), makeTraceQuestion('mq2'),
  ];
  const r = loadMode(8, { questions });
  r.Mode.start();
  r.Mode.startCategory('all');
  // Loop: answer all correctly, advance to next, until pool exhausts
  for (let qIdx = 0; qIdx < r.Mode.state.questions.length; qIdx++) {
    if (qIdx > 0) {
      r.Mode.next();
      if (!r.Mode.state || r.Mode.state.idx >= r.Mode.state.questions.length) break;
    }
    const q = r.Mode.state.currentQ;
    if (!q) break;
    for (let i = 0; i < q.trace_steps.length; i++) {
      const step = q.trace_steps[i];
      r.Mode.answerStep(step.options.findIndex(o => o.is_correct));
      r.Mode.nextStep();
    }
  }
  // All distinct qids in seenCorrectCalls
  const uniqueSeen = new Set(r.stats.seenCorrectCalls);
  A.ok(uniqueSeen.size >= 1,
    `at least 1 q marked as SeenCorrect after multi-q play (got ${uniqueSeen.size})`);
}

process.exit(A.summary('Mode8 SeenCorrect LOW-1'));
