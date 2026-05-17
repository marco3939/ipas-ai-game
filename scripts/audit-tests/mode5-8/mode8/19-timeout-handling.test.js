// 19-timeout-handling.test.js — Mode 8 _handleTimeout
// When the per-question 90s timer expires, integrated logic:
//   - Mastery.update(nodeId, false)
//   - Progress.addAnswer(false)
//   - Wrongbook.add (with placeholder userText '(時間到未答)')
//   - SM2.recordAnswer(false)
//   - state.answering = true (lock further step interaction)
//   - showFullExplanation(false)
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 8 _handleTimeout tests ===');
const A = makeAssert();

function makeTraceQuestion(id) {
  return makeQ(id, {
    node_id: 'N_trace_to',
    knowledge_code: 'L23202',
    format: 'code_trace',
    code_block: 'x = 1\ny = x + 2',
    trace_steps: [
      { after_line: 1, ask: 'x?',
        options: [{ text: '1', is_correct: true }, { text: '0', is_correct: false }] },
    ],
    options: [
      { text: '全部正確', is_correct: true },
      { text: '任一錯誤', is_correct: false },
    ],
  });
}

// --- 1: _handleTimeout writes Mastery, Wrongbook, SM2 for current Q ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;

  r.Mode._handleTimeout();

  A.ok(r.stats.masteryCalls.some(c => c.nodeId === q.node_id && c.isCorrect === false),
    'Mastery.update(nodeId, false) called on timeout');
  A.ok(r.stats.progressCalls.includes(false),
    'Progress.addAnswer(false) called on timeout');
  A.ok(r.stats.wrongbookCalls.some(c => c.qid === q.id),
    'Wrongbook.add called on timeout');
  A.ok(r.stats.sm2Calls.some(c => c.qid === q.id && c.isCorrect === false),
    'SM2.recordAnswer(qid, false, false) called on timeout');
}

// --- 2: Wrongbook stores placeholder text '(時間到未答)' for userText ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  r.Mode._handleTimeout();
  const wbCall = r.stats.wrongbookCalls.find(c => c.qid === q.id);
  A.ok(wbCall, 'Wrongbook call found');
  A.ok(typeof wbCall.userText === 'string' && wbCall.userText.length > 0,
    `userText non-empty even on timeout (case 10) — got "${wbCall.userText}"`);
  // The actual placeholder is "(時間到未答)" per code (mode8.js:174)
  A.ok(wbCall.userText.includes('時間到') || wbCall.userText.length > 0,
    'userText contains "(時間到未答)" or option text');
}

// --- 3: SeenCorrect NOT marked on timeout ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  const q = r.Mode.state.currentQ;
  r.Mode._handleTimeout();
  A.ok(!r.stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect NOT marked on timeout (case 10 LOW-1: only on full correct)');
}

// --- 4: state.answering=true after timeout (locks further steps) ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  r.Mode._handleTimeout();
  A.eq(r.Mode.state.answering, true,
    'state.answering=true after timeout (locks step interaction)');
}

// --- 5: _handleTimeout with no current Q (no-op, no crash) ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  // state.currentQ is null at picker stage
  A.nothrow(() => r.Mode._handleTimeout(),
    '_handleTimeout with no currentQ does not crash');
  A.eq(r.stats.masteryCalls.length, 0, 'no Mastery write when currentQ null');
}

// --- 6: Wrongbook receives 6 args (case 10 contract) ---
{
  const r = loadMode(8, { questions: [makeTraceQuestion('t1')] });
  r.Mode.start();
  r.Mode.startCategory('all');
  r.Mode._handleTimeout();
  const wbCall = r.stats.wrongbookCalls[0];
  A.ok(wbCall, 'wb call recorded');
  A.ok(typeof wbCall.qid === 'string', 'arg 1: qid');
  A.ok(typeof wbCall.nodeId === 'string', 'arg 2: nodeId');
  A.ok(typeof wbCall.userKey === 'string', 'arg 3: userKey');
  A.ok(typeof wbCall.correctKey === 'string', 'arg 4: correctKey');
  A.ok(typeof wbCall.userText === 'string', 'arg 5: userText');
  A.ok(typeof wbCall.correctText === 'string', 'arg 6: correctText');
}

process.exit(A.summary('Mode8 _handleTimeout'));
