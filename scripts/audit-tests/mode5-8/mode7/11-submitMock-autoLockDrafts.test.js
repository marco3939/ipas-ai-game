// 11-submitMock-autoLockDrafts.test.js — 案例 10 PR #19 漏修點
// submitMock (user clicks "交卷") and _timeUp (countdown hits zero) both must
// auto-lock all pending drafts. PR #19 only fixed half — the _autoLockDrafts
// helper was added and called by both.  Verify all drafts → answers with
// proper correctKey AND isCorrect, no key=undefined slipping through.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 submitMock _autoLockDrafts (case 10) tests ===');
const A = makeAssert();

function setupMode7(n = 30) {
  const questions = [];
  for (let i = 0; i < n + 5; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i % 3}`,
      knowledge_code: 'L21101',
      options: [
        { text: 'correct option ' + i, is_correct: true },
        { text: 'wrong a ' + i, is_correct: false },
        { text: 'wrong b ' + i, is_correct: false },
        { text: 'wrong c ' + i, is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount: n, scope: 'all', difficulty: 'mixed' };
  // Stub confirm() to auto-yes (in vm sandbox, confirm doesn't exist)
  r.sandbox.confirm = () => true;
  return r;
}

// --- 1: 30 drafts → submitMock all become answers ---
{
  const { Mode } = setupMode7(30);
  Mode._startBattle();
  // Render all 30 to fill _rendered cache
  for (let i = 0; i < 30; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
  }
  // Set draft on each question (some correct, some wrong)
  for (let i = 0; i < 30; i++) {
    const item = Mode.state.lineup[i];
    // Find which key is correct for this rendered question
    const correctKey = item._rendered.options.find(o => o.is_correct).key;
    // Pick correctly for even i, wrong for odd
    const userKey = (i % 2 === 0) ? correctKey : (correctKey === 'A' ? 'B' : 'A');
    Mode.state.draft[i] = { userKey };
  }
  // Submit
  Mode.submitMock();
  // All 30 must be in answers
  const answeredCount = Object.keys(Mode.state.answers).length;
  A.eq(answeredCount, 30, '30 drafts all became answers via submitMock');
  // None of them have undefined / empty correctKey
  for (let i = 0; i < 30; i++) {
    const ans = Mode.state.answers[i];
    A.ok(ans && typeof ans.correctKey === 'string' && ans.correctKey.length > 0,
      `q${i}: correctKey non-empty (got "${ans && ans.correctKey}")`);
  }
}

// --- 2: isCorrect aligns with rendered.is_correct for every i ---
{
  const { Mode } = setupMode7(15);
  Mode._startBattle();
  for (let i = 0; i < 15; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const item = Mode.state.lineup[i];
    const correctKey = item._rendered.options.find(o => o.is_correct).key;
    Mode.state.draft[i] = { userKey: correctKey };
  }
  Mode.submitMock();
  // ALL should be correct (we picked the correct key)
  for (let i = 0; i < 15; i++) {
    const ans = Mode.state.answers[i];
    A.eq(ans.isCorrect, true,
      `q${i}: picked correct key → isCorrect=true (case 10 critical)`);
  }
  A.eq(Mode.state.correct, 15, 'state.correct == 15 (all correct)');
}

// --- 3: _autoLockDrafts also runs _recomputeStats (case 10 review补) ---
{
  const { Mode } = setupMode7(5);
  Mode._startBattle();
  for (let i = 0; i < 5; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const item = Mode.state.lineup[i];
    Mode.state.draft[i] = { userKey: item._rendered.options.find(o => o.is_correct).key };
  }
  // Before _autoLockDrafts, state.correct should be 0
  A.eq(Mode.state.correct, 0, 'before _autoLockDrafts state.correct=0');
  Mode._autoLockDrafts();
  A.eq(Mode.state.correct, 5, '_autoLockDrafts runs _recomputeStats (state.correct=5)');
  A.eq(Mode.state.wrongs.length, 0, 'no wrongs when all correct');
}

// --- 4: drafts with missing key are skipped (no crash) ---
{
  const { Mode } = setupMode7(3);
  Mode._startBattle();
  // Render each question first to populate _rendered
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
  }
  Mode.state.draft[0] = { userKey: 'A' };
  Mode.state.draft[1] = {};   // no userKey
  Mode.state.draft[2] = null; // null
  Mode._autoLockDrafts();
  A.ok(Mode.state.answers[0], 'draft with key → became answer');
  A.ok(!Mode.state.answers[1], 'empty draft → no answer');
  A.ok(!Mode.state.answers[2], 'null draft → no answer');
}

// --- 5: already locked drafts are not double-locked ---
{
  const { Mode } = setupMode7(3);
  Mode._startBattle();
  Mode.state.idx = 0;
  Mode._showCurrentQuestion();
  Mode.state.draft[0] = { userKey: 'A' };
  Mode.submitCurrent();          // locks idx=0
  const ans0Before = JSON.stringify(Mode.state.answers[0]);
  // Now try _autoLockDrafts — should NOT change answers[0]
  Mode.state.draft[0] = { userKey: 'B' };
  Mode._autoLockDrafts();
  const ans0After = JSON.stringify(Mode.state.answers[0]);
  A.eq(ans0Before, ans0After, 'already locked idx unchanged by _autoLockDrafts');
}

// --- 6: _timeUp triggers _autoLockDrafts too (PR #22 H2) ---
//   Verified via source contract — _timeUp calls _autoLockDrafts before _finalize.
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode7.js'), 'utf8');
  const m = src.match(/_timeUp\(\) \{([\s\S]*?)\n    \},/);
  A.ok(m, '_timeUp body found');
  A.ok(/_autoLockDrafts\(\)/.test(m[1]),
    '_timeUp calls _autoLockDrafts (PR #22 H2 — case 10 漏修點)');
  A.ok(/_finalize/.test(m[1]),
    '_timeUp calls _finalize after _autoLockDrafts');
}

process.exit(A.summary('Mode7 submitMock _autoLockDrafts'));
