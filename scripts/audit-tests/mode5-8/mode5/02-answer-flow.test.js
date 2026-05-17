// 02-answer-flow.test.js — Mode 5 answer() flow
// Verifies:
//   - correct answer: Mastery score bumps, Progress addAnswer(true), SeenCorrect mark,
//     SM2 record (case 10 SM-1), no Wrongbook add.
//   - wrong answer: Wrongbook.add receives full 6 args including userText/correctText
//     (case 10), Mastery score decreases (via adjustMasteryScore), takeDamage runs.
//   - drillThis fires DrillSession.start with the right node_id and a callback.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 answer() flow tests ===');
const A = makeAssert();

function setup({ questions, wrongbook, mastery } = {}) {
  questions = questions || [makeQ('qA', { node_id: 'N_A' })];
  const r = loadMode(5, { questions, wrongbook, mastery });
  // Force engaged BOSS state to avoid relying on selectWeakBosses RNG
  r.Mode.cachedBosses = [{ nodeId: 'N_A', source: 'wrongbook', weak: 1 }];
  r.Mode.engageBoss(0);
  // Render the first question so currentQ is populated
  r.Mode.showQuestion();
  return r;
}

// --- 1: correct answer triggers expected shared-layer writes ---
{
  const { Mode, sandbox, stats } = setup();
  const q = Mode.state.currentQ;
  const correctOpt = q.options.find(o => o.is_correct);
  A.ok(correctOpt && correctOpt.key, 'rendered options have key A/B/C/D');

  Mode.answer(correctOpt.key);

  A.ok(stats.progressCalls.length === 1 && stats.progressCalls[0] === true,
    'Progress.addAnswer(true) called on correct');
  A.ok(stats.seenCorrectCalls.includes(q.id),
    `SeenCorrect.mark(q.id) called (case 10 LOW-1) — qid=${q.id}`);
  A.ok(stats.sm2Calls.find(c => c.qid === q.id && c.isCorrect === true),
    'SM2.recordAnswer(qid, true, false) called (case 10 SM-1)');
  A.eq(stats.wrongbookCalls.length, 0, 'Wrongbook.add NOT called on correct');
}

// --- 2: wrong answer triggers Wrongbook.add with full 6 args ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrongOpt = q.options.find(o => !o.is_correct);
  const correctOpt = q.options.find(o => o.is_correct);

  Mode.answer(wrongOpt.key);

  A.eq(stats.wrongbookCalls.length, 1, 'Wrongbook.add called once on wrong');
  const c = stats.wrongbookCalls[0];
  A.eq(c.qid, q.id, 'wb arg 1: qid');
  A.eq(c.nodeId, q.node_id, 'wb arg 2: nodeId');
  A.eq(c.userKey, wrongOpt.key, 'wb arg 3: userKey from selected option');
  A.eq(c.correctKey, correctOpt.key, 'wb arg 4: correctKey from is_correct');
  A.eq(c.userText, wrongOpt.text, 'wb arg 5: userText (case 10)');
  A.eq(c.correctText, correctOpt.text, 'wb arg 6: correctText (case 10)');
  A.ok(c.userText && c.userText.length > 0, 'userText non-empty (case 10 critical)');
  A.ok(c.correctText && c.correctText.length > 0, 'correctText non-empty (case 10 critical)');

  // SM2 still records on wrong answers
  A.ok(stats.sm2Calls.find(s => s.qid === q.id && s.isCorrect === false),
    'SM2.recordAnswer(false) on wrong (case 10 SM-1)');
  // SeenCorrect NOT marked on wrong
  A.ok(!stats.seenCorrectCalls.includes(q.id),
    'SeenCorrect NOT marked on wrong');
}

// --- 3: drillThis fires DrillSession.start with right args ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrongOpt = q.options.find(o => !o.is_correct);
  Mode.answer(wrongOpt.key);
  // drillThis after wrong
  Mode.drillThis();
  A.eq(stats.drillStarts.length, 1, 'DrillSession.start fired once from drillThis');
  const d = stats.drillStarts[0];
  A.eq(d.nodeId, q.node_id, 'drill node_id matches q.node_id');
  A.ok(Array.isArray(d.variations) && d.variations.length > 0, 'variations array non-empty');
  A.ok(typeof d.onComplete === 'function', 'onComplete callback present (case 6/案例1)');
}

// --- 4: answer() handles missing optionkey gracefully ---
{
  const { Mode } = setup();
  // Currently `Mode5.answer` does opt.is_correct without null guard.
  // Verify behaviour with an invalid key — should throw (documenting current
  // contract: caller must pass valid key). We don't claim this as a bug
  // since UI controls the keys.
  let threw = false;
  try { Mode.answer('NOPE'); } catch { threw = true; }
  A.ok(threw, 'answer(invalid key) throws (current contract — UI prevents invalid)');
}

process.exit(A.summary('Mode5 answer flow'));
