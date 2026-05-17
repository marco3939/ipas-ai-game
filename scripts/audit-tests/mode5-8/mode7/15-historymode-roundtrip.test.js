// 15-historymode-roundtrip.test.js — reviewHistorySession reconstruct
// User finishes a mock, saves history, then days later opens history list and
// clicks "完整逐題回顧" — reviewHistorySession rebuilds lineup + answers from
// fullLog snapshot. Verify the reconstruction is faithful + works for
// legacy data missing snapshot.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 reviewHistorySession reconstruct tests ===');
const A = makeAssert();

function setupAndPlay(allCorrect = false) {
  const questions = [];
  for (let i = 0; i < 3; i++) {
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
  r.Mode._setupConfig = { qcount: 3, scope: 'all', difficulty: 'mixed' };
  r.sandbox.confirm = () => true;
  r.Mode._startBattle();
  for (let i = 0; i < 3; i++) {
    r.Mode.state.idx = i;
    r.Mode._showCurrentQuestion();
    const item = r.Mode.state.lineup[i];
    const correctKey = item._rendered.options.find(o => o.is_correct).key;
    const wrongKey = item._rendered.options.find(o => !o.is_correct).key;
    r.Mode.state.draft[i] = { userKey: allCorrect ? correctKey : (i === 0 ? wrongKey : correctKey) };
  }
  r.Mode.submitMock();
  return r;
}

// --- 1: reviewHistorySession reconstructs lineup with proper options ---
{
  const r = setupAndPlay(false);
  // Now simulate user back to setup page and opens history idx=0
  r.Mode.cleanup();
  r.Mode.reviewHistorySession(0);
  A.ok(r.Mode.state, 'state set up by reviewHistorySession');
  A.eq(r.Mode.state._historyMode, true, '_historyMode flag set');
  A.eq(r.Mode.state._historyIdx, 0, '_historyIdx === 0');
  A.eq(r.Mode.state.total, 3, 'lineup reconstructed with 3 items');
  // Each item has q.options[i].key
  for (let i = 0; i < 3; i++) {
    const item = r.Mode.state.lineup[i];
    A.ok(item.q && Array.isArray(item.q.options),
      `lineup[${i}].q.options is array`);
    A.ok(item.q.options.every(o => o.key && /^[A-D]$/.test(o.key)),
      `lineup[${i}].q.options all have key A/B/C/D (case 10 PR A)`);
    A.ok(item.q.options.some(o => o.is_correct),
      `lineup[${i}] has at least one is_correct option`);
  }
}

// --- 2: answers reconstructed from fullLog ---
{
  const r = setupAndPlay(false);
  // Capture the answers from the original session before cleanup
  const originalAnswers = JSON.stringify(r.Mode.state.answers);
  r.Mode.cleanup();
  r.Mode.reviewHistorySession(0);
  const reconstructed = JSON.stringify(r.Mode.state.answers);
  // They should have the same idx → {userKey, isCorrect, correctKey} mapping
  A.eq(reconstructed, originalAnswers,
    'answers reconstructed faithfully from fullLog snapshot');
}

// --- 3: missing fullLog → toast and bail ---
{
  const r = setupAndPlay(false);
  // Patch history[0] to remove fullLog (simulate pre-2026-05-16 legacy data)
  const data = r.sandbox.Storage.get('ipas_mode7_theater_v1');
  delete data.history[0].fullLog;
  r.sandbox.Storage.set('ipas_mode7_theater_v1', data);
  r.Mode.reviewHistorySession(0);
  A.ok(r.stats.toasts.some(t => t.includes('舊紀錄') || t.includes('無逐題')),
    'missing fullLog → legacy toast shown');
}

// --- 4: legacy fullLog without options snapshot — falls back gracefully ---
{
  const r = setupAndPlay(false);
  const data = r.sandbox.Storage.get('ipas_mode7_theater_v1');
  // Strip options snapshot from all fullLog entries (legacy mode)
  data.history[0].fullLog.forEach(e => { delete e.options; delete e.stem; delete e.code_block; });
  r.sandbox.Storage.set('ipas_mode7_theater_v1', data);
  r.Mode.reviewHistorySession(0);
  A.eq(r.Mode.state._legacyData, true,
    'legacy fullLog (no options snapshot) → _legacyData flag');
  // lineup still populated from QUESTIONS (since qid still exists)
  A.eq(r.Mode.state.total, 3, 'lineup populated from QUESTIONS fallback');
}

// --- 5: deleted question handled (id no longer in QUESTIONS) ---
{
  const r = setupAndPlay(false);
  const data = r.sandbox.Storage.get('ipas_mode7_theater_v1');
  // Rewrite history with a non-existent qid in fullLog (simulate deleted q)
  // Note: data.history[0].fullLog has shuffled qids — we pick the first
  data.history[0].fullLog[0].qid = 'q_deleted_123';
  r.sandbox.Storage.set('ipas_mode7_theater_v1', data);
  r.Mode.reviewHistorySession(0);
  // Doesn't crash — placeholder lineup item
  A.ok(r.Mode.state.total === 3, 'lineup still has 3 entries (with placeholder)');
  A.ok(r.Mode.state.lineup[0].q.id === 'q_deleted_123',
    'placeholder q.id matches the deleted qid');
}

// --- 6: invalid history idx → toast + no crash ---
{
  const r = setupAndPlay(false);
  A.nothrow(() => r.Mode.reviewHistorySession(99),
    'invalid history idx does not crash');
  A.ok(r.stats.toasts.some(t => t.includes('找不到')),
    'invalid idx → "找不到此場紀錄" toast');
}

// --- 7: __proto__ in fullLog does not pollute Object.prototype ---
{
  const r = setupAndPlay(false);
  const data = r.sandbox.Storage.get('ipas_mode7_theater_v1');
  // Inject __proto__ key into fullLog options (attack scenario)
  data.history[0].fullLog[0].__proto__ = { polluted: true };
  // Note: localStorage stores serialized JSON. After parse, JSON.parse('{"__proto__":...}')
  // is safe in V8 — won't pollute. We just verify reviewHistorySession survives.
  r.sandbox.Storage.set('ipas_mode7_theater_v1', data);
  A.nothrow(() => r.Mode.reviewHistorySession(0),
    '__proto__ attack in fullLog does not crash reconstruct');
  // Object.prototype intact
  A.ok({}.polluted === undefined, 'Object.prototype not polluted');
}

process.exit(A.summary('Mode7 reviewHistorySession'));
