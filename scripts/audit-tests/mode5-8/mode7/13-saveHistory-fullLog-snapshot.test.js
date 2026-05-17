// 13-saveHistory-fullLog-snapshot.test.js — case 10 fullLog snapshot
// _saveHistory must include fullLog with rendered (post-shuffle) options
// — keys A/B/C/D + texts + is_correct flags — so that reviewHistorySession
// can rebuild the same UI weeks later. PR #16/#17 fixed this; without it,
// reviewHistorySession could only show ✓ green box, not ✗ red user-selected box.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 _saveHistory fullLog snapshot (case 10) tests ===');
const A = makeAssert();

function setupMode7(n = 5) {
  const questions = [];
  for (let i = 0; i < n; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i % 2}`,
      knowledge_code: 'L21101',
      options: [
        { text: 'correct text ' + i, is_correct: true },
        { text: 'wrong A ' + i, is_correct: false },
        { text: 'wrong B ' + i, is_correct: false },
        { text: 'wrong C ' + i, is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount: n, scope: 'all', difficulty: 'mixed' };
  r.sandbox.confirm = () => true;
  return r;
}

// --- 1: fullLog created and persisted to Storage ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    Mode.state.draft[i] = { userKey: 'A' };
  }
  Mode.submitMock();
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  A.ok(data && data.history && data.history[0],
    'history saved');
  A.ok(Array.isArray(data.history[0].fullLog) && data.history[0].fullLog.length === 3,
    'fullLog has 3 entries (one per lineup)');
}

// --- 2: each fullLog entry has rendered options with keys A/B/C/D ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    Mode.state.draft[i] = { userKey: 'A' };
  }
  Mode.submitMock();
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  for (const entry of data.history[0].fullLog) {
    A.ok(Array.isArray(entry.options) && entry.options.length === 4,
      `entry ${entry.qid}: fullLog options has 4 entries`);
    const keys = entry.options.map(o => o.key).sort();
    A.eq(keys, ['A', 'B', 'C', 'D'],
      `entry ${entry.qid}: options have all 4 keys A/B/C/D (case 10 PR #16/#17)`);
    A.ok(entry.options.every(o => typeof o.text === 'string' && o.text.length > 0),
      `entry ${entry.qid}: all options have non-empty text`);
    A.ok(entry.options.some(o => o.is_correct === true),
      `entry ${entry.qid}: at least one option is_correct=true`);
  }
}

// --- 3: even non-rendered questions (user jumped past, never _showed) — main impl ---
//   PR A review: if user navigates past a question without ever rendering it,
//   _saveHistory calls renderQuestion to generate _rendered before snapshot.
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  // Only render q0; leave q1, q2 un-rendered
  Mode.state.idx = 0;
  Mode._showCurrentQuestion();
  Mode.state.draft[0] = { userKey: 'A' };
  // Don't call _showCurrentQuestion for idx 1, 2
  Mode.submitMock();
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  const log = data.history[0].fullLog;
  for (let i = 0; i < 3; i++) {
    A.ok(Array.isArray(log[i].options) && log[i].options.length === 4,
      `fullLog[${i}]: options non-empty even for un-rendered q (PR A review)`);
    A.ok(log[i].options.every(o => o.key),
      `fullLog[${i}]: all keys present (case 10 fix)`);
  }
}

// --- 4: userKey / isCorrect / correctKey in fullLog match state.answers ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const item = Mode.state.lineup[i];
    const correctKey = item._rendered.options.find(o => o.is_correct).key;
    // alternate correct/wrong
    Mode.state.draft[i] = { userKey: i % 2 === 0 ? correctKey : (correctKey === 'A' ? 'B' : 'A') };
  }
  Mode.submitMock();
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  const log = data.history[0].fullLog;
  for (let i = 0; i < 3; i++) {
    A.eq(log[i].answered, true, `fullLog[${i}].answered === true`);
    A.ok(/^[A-D]$/.test(log[i].userKey),
      `fullLog[${i}].userKey valid (${log[i].userKey})`);
    A.ok(/^[A-D]$/.test(log[i].correctKey),
      `fullLog[${i}].correctKey valid (${log[i].correctKey})`);
    A.eq(typeof log[i].isCorrect, 'boolean',
      `fullLog[${i}].isCorrect is boolean`);
  }
}

// --- 5: marked qids preserved in fullLog ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  Mode.state.markedIds.add(Mode.state.lineup[0].q.id);
  Mode.state.markedIds.add(Mode.state.lineup[2].q.id);
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    Mode.state.draft[i] = { userKey: 'A' };
  }
  Mode.submitMock();
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  const log = data.history[0].fullLog;
  const marked = log.filter(e => e.marked);
  A.eq(marked.length, 2, '2 marked entries preserved');
}

// --- 6: history capped to 10 entries (F-007 2026-05-17:fullLog 加入後實測 ~50KB/場,從 50 降到 10 留 quota 餘裕)---
{
  const { Mode, sandbox } = setupMode7(2);
  // Pre-fill 20 history entries (>10 to trigger cap)
  const existingHistory = [];
  for (let i = 0; i < 20; i++) {
    existingHistory.push({ ts: i, config: {}, result: {}, topWrong: [], fullLog: [] });
  }
  sandbox.Storage.set('ipas_mode7_theater_v1',
    { version: '1.0', history: existingHistory });
  Mode._startBattle();
  for (let i = 0; i < 2; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    Mode.state.draft[i] = { userKey: 'A' };
  }
  Mode.submitMock();
  const data = sandbox.Storage.get('ipas_mode7_theater_v1', null);
  A.ok(data.history.length === 10,
    `history capped at 10 entries (got ${data.history.length})`);
  // Also verify it's the LATEST 10 (not the earliest) — slice(-10) keeps last
  const oldestTs = data.history[0].ts;
  A.ok(oldestTs >= 11, `slice(-10) keeps latest entries (oldest ts=${oldestTs}, expected ≥ 11)`);
}

process.exit(A.summary('Mode7 fullLog snapshot'));
