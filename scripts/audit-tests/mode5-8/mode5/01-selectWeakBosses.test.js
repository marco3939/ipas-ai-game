// 01-selectWeakBosses.test.js
// case 5 stale nodeId 防護 — Mode5 selectWeakBosses 必過濾 Wrongbook/Mastery 殘留的
// 不存在於 QUESTIONS 的 nodeId,否則 BOSS 名單會卡在已刪題目而無法戰鬥。
// 本測試直接驅動 renderMap 走 selectWeakBosses 路徑,觀察 cachedBosses 結果。
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 selectWeakBosses (stale nodeId guard) tests ===');
const A = makeAssert();

// --- Section 1: Wrongbook 殘留 stale node 必被過濾 ---
{
  const questions = [
    makeQ('q_live_1', { node_id: 'N_live', knowledge_code: 'L21101' }),
    makeQ('q_live_2', { node_id: 'N_live', knowledge_code: 'L21101' }),
  ];
  const wrongbook = [
    { qid: 'q_zombie', nodeId: 'N_ZOMBIE', wrongCount: 999, mastered: false },
    { qid: 'q_live_1', nodeId: 'N_live', wrongCount: 1, mastered: false },
  ];
  const { Mode, sandbox } = loadMode(5, { questions, wrongbook });
  // renderMap will internally call selectWeakBosses and cache to this.cachedBosses
  Mode.renderMap();
  const bosses = Mode.cachedBosses || [];
  const ids = bosses.map(b => b.nodeId);
  A.ok(ids.includes('N_live'), 'N_live (in QUESTIONS) included');
  A.ok(!ids.includes('N_ZOMBIE'), 'N_ZOMBIE (stale) filtered out');
}

// --- Section 2: Mastery low-score stale node also filtered ---
{
  const questions = [
    makeQ('q1', { node_id: 'N_live', knowledge_code: 'L21101' }),
  ];
  const mastery = {
    N_live: { score: 20, attempts: 5, correct: 1, streak: 0 },
    N_stale: { score: 10, attempts: 3, correct: 0, streak: 0 },
  };
  const { Mode } = loadMode(5, { questions, mastery });
  Mode.renderMap();
  const ids = (Mode.cachedBosses || []).map(b => b.nodeId);
  A.ok(ids.includes('N_live'), 'N_live (low mastery + in QUESTIONS) included');
  A.ok(!ids.includes('N_stale'), 'N_stale (low mastery, NOT in QUESTIONS) filtered');
}

// --- Section 3: new-player fallback only uses live nodes ---
{
  const questions = [
    makeQ('q1', { node_id: 'N_a', knowledge_code: 'L21101' }),
    makeQ('q2', { node_id: 'N_b', knowledge_code: 'L21102' }),
  ];
  const { Mode } = loadMode(5, { questions });
  Mode.renderMap();
  const ids = (Mode.cachedBosses || []).map(b => b.nodeId);
  A.ok(ids.length >= 1, 'fallback produces at least one boss');
  ids.forEach(id => {
    A.ok(['N_a', 'N_b'].includes(id), `fallback picks live node only (${id})`);
  });
  // sources should be 'fallback'
  const allFallback = (Mode.cachedBosses || []).every(b => b.source === 'fallback');
  A.ok(allFallback, 'all sources are fallback');
}

// --- Section 4: empty QUESTIONS — graceful empty list, no crash ---
{
  const { Mode } = loadMode(5, { questions: [] });
  A.nothrow(() => Mode.renderMap(), 'renderMap with empty QUESTIONS does not throw');
  A.eq(Mode.cachedBosses, [], 'cachedBosses is empty when QUESTIONS empty');
}

// --- Section 5: max 5 bosses cap ---
{
  const questions = [];
  for (let i = 0; i < 10; i++) {
    questions.push(makeQ(`q${i}`, { node_id: `N_${i}`, knowledge_code: 'L21101' }));
  }
  const wrongbook = questions.map(q => ({
    qid: q.id, nodeId: q.node_id, wrongCount: 5 - (questions.indexOf(q) % 5), mastered: false
  }));
  const { Mode } = loadMode(5, { questions, wrongbook });
  Mode.renderMap();
  A.ok(Mode.cachedBosses.length <= 5, `bosses capped at 5 (got ${Mode.cachedBosses.length})`);
}

// --- Section 6: mastered=true wrongbook entries excluded ---
{
  const questions = [makeQ('q1', { node_id: 'N_done' })];
  const wrongbook = [
    { qid: 'q1', nodeId: 'N_done', wrongCount: 99, mastered: true },
  ];
  const { Mode } = loadMode(5, { questions, wrongbook });
  Mode.renderMap();
  const wrongbookSourced = (Mode.cachedBosses || []).filter(b => b.source === 'wrongbook');
  A.eq(wrongbookSourced.length, 0, 'mastered=true Wrongbook entries excluded from Step 1');
}

process.exit(A.summary('Mode5 selectWeakBosses'));
