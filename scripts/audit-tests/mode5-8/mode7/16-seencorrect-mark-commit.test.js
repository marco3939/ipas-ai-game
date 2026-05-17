// 16-seencorrect-mark-commit.test.js — PR #27 C-4
// Mode 7 overrides PlayEngine.answer to a draft-only path that does NOT call
// native SeenCorrect.mark. _commitToSharedLayer is the ONLY place where
// SeenCorrect.mark fires for Mode 7. Without C-4 fix, all correct Mock answers
// would NOT be excluded from Modes 1/2/4/5/8 — repeated re-encounter of
// already-mastered questions.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 SeenCorrect.mark via _commitToSharedLayer (PR #27 C-4) tests ===');
const A = makeAssert();

function setupAndPlay({ qcount = 5, correctIndices = [0, 1, 2] } = {}) {
  const questions = [];
  for (let i = 0; i < qcount; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i}`,
      options: [
        { text: 'correct ' + i, is_correct: true },
        { text: 'w1 ' + i, is_correct: false },
        { text: 'w2 ' + i, is_correct: false },
        { text: 'w3 ' + i, is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount, scope: 'all', difficulty: 'mixed' };
  r.sandbox.confirm = () => true;
  r.Mode._startBattle();

  const correctQids = [];
  const wrongQids = [];
  for (let i = 0; i < qcount; i++) {
    r.Mode.state.idx = i;
    r.Mode._showCurrentQuestion();
    const item = r.Mode.state.lineup[i];
    const correctKey = item._rendered.options.find(o => o.is_correct).key;
    const wrongKey = item._rendered.options.find(o => !o.is_correct).key;
    if (correctIndices.includes(i)) {
      r.Mode.state.draft[i] = { userKey: correctKey };
      correctQids.push(item.q.id);
    } else {
      r.Mode.state.draft[i] = { userKey: wrongKey };
      wrongQids.push(item.q.id);
    }
  }
  return { r, correctQids, wrongQids };
}

// --- 1: SeenCorrect.mark fires ONLY for correct answers ---
{
  const { r, correctQids, wrongQids } = setupAndPlay({
    qcount: 5, correctIndices: [0, 2, 4]
  });
  r.Mode.submitMock();
  // All correctQids should be in seenCorrect
  correctQids.forEach(qid => {
    A.ok(r.stats.seenCorrectCalls.includes(qid),
      `${qid} (correct) → SeenCorrect.mark called`);
  });
  // No wrong qid in seenCorrect
  wrongQids.forEach(qid => {
    A.ok(!r.stats.seenCorrectCalls.includes(qid),
      `${qid} (wrong) → SeenCorrect NOT called`);
  });
}

// --- 2: SeenCorrect.mark count matches correct answer count ---
{
  const { r, correctQids } = setupAndPlay({
    qcount: 10, correctIndices: [0, 1, 2, 3, 4]
  });
  r.Mode.submitMock();
  A.eq(r.stats.seenCorrectCalls.length, correctQids.length,
    `seenCorrectCalls count == correct count (${correctQids.length})`);
}

// --- 3: NOT called during draft phase (only on commit) ---
{
  const { r } = setupAndPlay({
    qcount: 3, correctIndices: [0, 1, 2]
  });
  // BEFORE submitMock, SeenCorrect should NOT have been called yet
  A.eq(r.stats.seenCorrectCalls.length, 0,
    'SeenCorrect NOT called during draft phase (PR #27 C-4: only on commit)');
  r.Mode.submitMock();
  A.ok(r.stats.seenCorrectCalls.length > 0,
    'SeenCorrect called after submitMock (commit phase)');
}

// --- 4: source contract — _commitToSharedLayer has SeenCorrect.mark ---
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode7.js'), 'utf8');
  const m = src.match(/_commitToSharedLayer\(\)\s*\{([\s\S]*?)\n    \},/);
  A.ok(m, '_commitToSharedLayer body found');
  const body = m[1];
  A.ok(/SeenCorrect\.mark\(q\.id\)/.test(body),
    '_commitToSharedLayer calls SeenCorrect.mark(q.id) (case 10 C-4)');
  // Must be inside an `if (a.isCorrect ...)` block
  A.ok(/a\.isCorrect[\s\S]*?SeenCorrect\.mark/.test(body),
    'SeenCorrect.mark wrapped in a.isCorrect check');
}

// --- 5: Last-answer wins (lenient improvement)  ---
//   case 10 PR review: first wrong → re-answer correct → counts as correct,
//   SeenCorrect should fire.  Test: simulate change-then-commit.
//   Note: with the new lenient flow, draft path may re-set userKey before commit.
{
  const { r } = setupAndPlay({ qcount: 1, correctIndices: [] });
  // First we set wrong draft; that's already in state.draft from setup
  const item = r.Mode.state.lineup[0];
  const correctKey = item._rendered.options.find(o => o.is_correct).key;
  // Overwrite to correct (last-answer-wins)
  r.Mode.state.draft[0] = { userKey: correctKey };
  r.Mode.submitMock();
  A.ok(r.stats.seenCorrectCalls.includes(item.q.id),
    'last-answer correct → SeenCorrect.mark (lenient flow)');
}

process.exit(A.summary('Mode7 SeenCorrect PR #27 C-4'));
