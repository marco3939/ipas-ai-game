// 03-sm2-recordAnswer.test.js — Mode5 PR #27 SM-1 verification
// Mode 5 was not calling SM2.recordAnswer before PR #27. Now it must be called
// on every answer (correct and wrong) so SRS scheduling reflects 弱點獵人 play.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 SM2 recordAnswer (PR #27 SM-1) tests ===');
const A = makeAssert();

function setup(opts = {}) {
  const questions = opts.questions || [
    makeQ('qA', { node_id: 'N_A' }),
    makeQ('qB', { node_id: 'N_A' }),
    makeQ('qC', { node_id: 'N_A' }),
  ];
  const r = loadMode(5, { questions });
  r.Mode.cachedBosses = [{ nodeId: 'N_A', source: 'wrongbook', weak: 1 }];
  r.Mode.engageBoss(0);
  r.Mode.showQuestion();
  return r;
}

// --- 1: SM2 called for correct ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const correct = q.options.find(o => o.is_correct);
  Mode.answer(correct.key);
  const calls = stats.sm2Calls.filter(c => c.qid === q.id);
  A.eq(calls.length, 1, 'SM2 called exactly once for correct answer');
  A.eq(calls[0].isCorrect, true, 'SM2 isCorrect=true');
  A.eq(calls[0].secondTime, false, 'SM2 secondTime=false (first attempt)');
}

// --- 2: SM2 called for wrong ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  Mode.answer(wrong.key);
  const calls = stats.sm2Calls.filter(c => c.qid === q.id);
  A.eq(calls.length, 1, 'SM2 called exactly once for wrong answer');
  A.eq(calls[0].isCorrect, false, 'SM2 isCorrect=false');
}

// --- 3: SM2 NOT called when SM2 is undefined (typeof guard) ---
//   Tests defensive `typeof SM2 !== 'undefined'` guard.  We can't easily
//   undefine SM2 in our sandbox without rebuilding; just verify the guard
//   path is present in source code as a textual contract.
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode5.js'), 'utf8');
  A.ok(/typeof SM2 !== 'undefined' && q\.id\) SM2\.recordAnswer/.test(src),
    "mode5.js has 'typeof SM2 !== undefined' guard before SM2.recordAnswer");
  A.ok(src.includes('q.id, isCorrect, false'),
    'SM2.recordAnswer called with q.id, isCorrect, false signature');
}

// --- 4: SM2 not called when q.id is missing (defensive) ---
//   q.id guard: `SM2.recordAnswer(q.id, isCorrect, false)` is wrapped in
//   `q.id &&`. If we shove a question with no id, SM2 should NOT fire.
{
  const noIdQ = makeQ('placeholder', { node_id: 'N_A' });
  delete noIdQ.id;
  const r = loadMode(5, { questions: [noIdQ] });
  r.Mode.cachedBosses = [{ nodeId: 'N_A', source: 'fallback', weak: 1 }];
  r.Mode.engageBoss(0);
  r.Mode.showQuestion();
  const q = r.Mode.state.currentQ;
  const correct = q.options.find(o => o.is_correct);
  r.Mode.answer(correct.key);
  const calls = r.stats.sm2Calls.filter(c => !c.qid);
  A.eq(calls.length, 0, 'SM2 NOT called when q.id missing (defensive guard)');
}

// --- 5: Multiple answers all record to SM2 ---
{
  const { Mode, stats } = setup();
  const q1 = Mode.state.currentQ;
  const correct1 = q1.options.find(o => o.is_correct);
  Mode.answer(correct1.key);
  Mode.next();
  const q2 = Mode.state.currentQ;
  const wrong2 = q2.options.find(o => !o.is_correct);
  Mode.answer(wrong2.key);
  A.ok(stats.sm2Calls.length >= 2, `SM2 called >= 2 times after 2 answers (got ${stats.sm2Calls.length})`);
  const seen = new Set(stats.sm2Calls.map(c => c.qid));
  A.ok(seen.has(q1.id) && seen.has(q2.id), 'both qids recorded');
}

process.exit(A.summary('Mode5 SM2 recordAnswer'));
