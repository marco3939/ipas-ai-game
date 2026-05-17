// 12-timeUp-autoLockDrafts.test.js — PR #22 H2
// _timeUp must:
//   1. stop timer
//   2. call _autoLockDrafts (so user drafts get scored)
//   3. call _finalize('time_up')
// Verify state after _timeUp:
//   - state.finished = true
//   - state.outcomeRendered = true
//   - all drafts converted to answers with proper correctKey
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 _timeUp (PR #22 H2) tests ===');
const A = makeAssert();

function setupMode7(n = 5) {
  const questions = [];
  for (let i = 0; i < n; i++) {
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
  r.Mode._setupConfig = { qcount: n, scope: 'all', difficulty: 'mixed' };
  r.sandbox.confirm = () => true;
  return r;
}

// --- 1: _timeUp marks state.finished = true ---
{
  const { Mode } = setupMode7(3);
  Mode._startBattle();
  Mode._timeUp();
  A.ok(Mode.state.finished === true, '_timeUp sets state.finished=true');
  A.ok(Mode.state.outcomeRendered === true, '_timeUp sets outcomeRendered=true');
}

// --- 2: drafts auto-locked when _timeUp fires ---
{
  const { Mode } = setupMode7(3);
  Mode._startBattle();
  // Render all 3 to populate _rendered
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
  }
  // Set drafts on all
  for (let i = 0; i < 3; i++) {
    Mode.state.draft[i] = {
      userKey: Mode.state.lineup[i]._rendered.options[0].key
    };
  }
  Mode._timeUp();
  for (let i = 0; i < 3; i++) {
    A.ok(Mode.state.answers[i], `q${i}: draft → answer after _timeUp`);
    A.ok(typeof Mode.state.answers[i].correctKey === 'string' &&
         Mode.state.answers[i].correctKey.length > 0,
      `q${i}: correctKey populated (not undefined, case 10)`);
  }
}

// --- 3: timer stopped by _timeUp ---
{
  const { Mode } = setupMode7(3);
  Mode._startBattle();
  A.ok(Mode.timer !== null, 'timer running after _startBattle');
  Mode._timeUp();
  A.eq(Mode.timer, null, '_timeUp stops timer');
}

// --- 4: _commitToSharedLayer fires Mastery/Wrongbook/SeenCorrect via _finalize ---
//   NOTE: lineup is shuffled, so we record actual qid of correctly-answered
//   and wrongly-answered items dynamically.
{
  const { Mode, stats } = setupMode7(2);
  Mode._startBattle();
  // First question, correct
  Mode.state.idx = 0;
  Mode._showCurrentQuestion();
  const item0 = Mode.state.lineup[0];
  const qid0 = item0.q.id;
  const correctKey0 = item0._rendered.options.find(o => o.is_correct).key;
  Mode.state.draft[0] = { userKey: correctKey0 };
  // Second question, wrong
  Mode.state.idx = 1;
  Mode._showCurrentQuestion();
  const item1 = Mode.state.lineup[1];
  const qid1 = item1.q.id;
  const wrongKey1 = item1._rendered.options.find(o => !o.is_correct).key;
  Mode.state.draft[1] = { userKey: wrongKey1 };

  Mode._timeUp();

  // Mastery should be updated for both
  A.ok(stats.masteryCalls.length >= 2, `Mastery.update called >= 2 times (got ${stats.masteryCalls.length})`);
  // SeenCorrect mark only for the correct one (qid0)
  A.ok(stats.seenCorrectCalls.includes(qid0),
    `SeenCorrect.mark(${qid0}) called via _commitToSharedLayer (case 10 C-4)`);
  A.ok(!stats.seenCorrectCalls.includes(qid1),
    `SeenCorrect NOT marked for ${qid1} (wrong answer)`);
  // Wrongbook only for the wrong one (qid1)
  A.ok(stats.wrongbookCalls.some(c => c.qid === qid1),
    `Wrongbook.add(${qid1}) called`);
  A.ok(!stats.wrongbookCalls.some(c => c.qid === qid0),
    `Wrongbook NOT called for ${qid0} (correct)`);
}

// --- 5: history saved after _timeUp ---
{
  const { Mode, sandbox } = setupMode7(2);
  Mode._startBattle();
  Mode.state.idx = 0;
  Mode._showCurrentQuestion();
  Mode.state.draft[0] = { userKey: 'A' };
  Mode._timeUp();
  // Storage should contain history
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  A.ok(data && Array.isArray(data.history) && data.history.length === 1,
    'history saved with 1 entry');
  A.ok(data.history[0].fullLog && data.history[0].fullLog.length === 2,
    'fullLog has 2 entries (one per lineup item)');
  // Reason in result should be time_up... actually it's not stored in result,
  // but topWrong / fullLog should exist.
  A.ok('topWrong' in data.history[0], 'history has topWrong');
}

// --- 6: re-entry _timeUp is idempotent (outcomeRendered guard) ---
{
  const { Mode } = setupMode7(2);
  Mode._startBattle();
  Mode._timeUp();
  const sizeBefore = JSON.stringify(Mode.state.answers).length;
  Mode._timeUp(); // second call
  const sizeAfter = JSON.stringify(Mode.state.answers).length;
  A.eq(sizeBefore, sizeAfter, 'second _timeUp is no-op (outcomeRendered guard)');
}

process.exit(A.summary('Mode7 _timeUp'));
