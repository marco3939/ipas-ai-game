// 10-submitCurrent-correctKey.test.js — case 10 critical regression test
// PR #18 surfaced "正解:undefined" because `state.lineup[i].q.options` had no
// key field. submitCurrent must use _getRendered to find the correct key.
// This test reproduces the case-10 scenario and asserts correctKey is non-empty.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 submitCurrent correctKey (case 10) tests ===');
const A = makeAssert();

function setupMode7(n = 3) {
  const questions = [];
  for (let i = 0; i < n; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i}`,
      knowledge_code: 'L21101',
      options: [
        { text: 'CORRECT_ANSWER', is_correct: true },
        { text: 'wrong_A', is_correct: false },
        { text: 'wrong_B', is_correct: false },
        { text: 'wrong_C', is_correct: false },
      ],
      explanation: { correct: 'because', wrong: {} },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount: n, scope: 'all', difficulty: 'mixed' };
  return r;
}

// --- 1: submitCurrent sets correctKey to a real key (NOT undefined / empty) ---
{
  const { Mode } = setupMode7(1);
  Mode._startBattle();
  // Simulate user picking 'A' regardless of correctness
  Mode.state.draft[0] = { userKey: 'A' };
  Mode.submitCurrent();
  const ans = Mode.state.answers[0];
  A.ok(ans, 'answer recorded');
  A.ok(typeof ans.correctKey === 'string' && /^[A-D]$/.test(ans.correctKey),
    `correctKey is A/B/C/D, NOT undefined (got "${ans.correctKey}") — case 10 critical`);
  A.ok(ans.correctKey !== 'undefined' && ans.correctKey !== '',
    'correctKey is not the string "undefined" or empty');
}

// --- 2: for every key the user picks, isCorrect aligns with rendered.is_correct ---
{
  const { Mode } = setupMode7(1);
  Mode._startBattle();
  const item = Mode.state.lineup[0];
  for (const key of ['A', 'B', 'C', 'D']) {
    Mode.state.locked = new Set();          // reset lock
    Mode.state.draft[0] = { userKey: key };
    Mode.submitCurrent();
    const ans = Mode.state.answers[0];
    const opt = item._rendered.options.find(o => o.key === key);
    A.eq(ans.isCorrect, !!opt.is_correct,
      `submit key=${key} → isCorrect matches rendered.is_correct (${!!opt.is_correct})`);
    // Clean for next iteration
    delete Mode.state.answers[0];
  }
}

// --- 3: every test the correct option's key is always findable in rendered ---
{
  const { Mode } = setupMode7(5);
  Mode._startBattle();
  for (let i = 0; i < Mode.state.total; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const item = Mode.state.lineup[i];
    const correctOpt = item._rendered.options.find(o => o.is_correct);
    A.ok(correctOpt && correctOpt.key && /^[A-D]$/.test(correctOpt.key),
      `q${i}: correct option has valid key ${correctOpt && correctOpt.key}`);
  }
}

// --- 4: submitCurrent no-op if locked already ---
{
  const { Mode } = setupMode7(1);
  Mode._startBattle();
  Mode.state.draft[0] = { userKey: 'A' };
  Mode.submitCurrent();  // first submit — works
  const before = JSON.stringify(Mode.state.answers[0]);
  // Try to "re-submit" with different draft
  Mode.state.draft[0] = { userKey: 'B' };
  Mode.submitCurrent();
  const after = JSON.stringify(Mode.state.answers[0]);
  A.eq(before, after, 'locked submit is no-op (no reanswering)');
}

// --- 5: submitCurrent with no draft shows toast (no crash) ---
{
  const { Mode, stats } = setupMode7(1);
  Mode._startBattle();
  // No draft set
  delete Mode.state.draft[0];
  Mode.submitCurrent();
  A.ok(stats.toasts.some(t => t.includes('請先選擇答案')),
    'no draft → toast "請先選擇答案再送出"');
  A.ok(!Mode.state.answers[0], 'no answer recorded when no draft');
}

// --- 6: submitCurrent uses _getRendered consistently (no q.options access) ---
//   Source contract: submitCurrent body uses _getRendered or rendered options.
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode7.js'), 'utf8');
  // Find submitCurrent body
  const m = src.match(/submitCurrent\(\) \{([\s\S]*?)\n    \},/);
  A.ok(m, 'submitCurrent body found');
  const body = m[1];
  // NEVER read item.q.options.find directly (case 10)
  A.ok(!/item\.q\.options\.find/.test(body),
    'submitCurrent does NOT read item.q.options.find (case 10 regression check)');
  // Should use _getRendered or rOpts
  A.ok(/_getRendered|rOpts/.test(body),
    'submitCurrent uses _getRendered or rOpts');
}

process.exit(A.summary('Mode7 submitCurrent correctKey'));
