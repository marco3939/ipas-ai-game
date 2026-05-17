// 08-startBattle-pickPool.test.js — Mode 7 _buildPool and _drawQuestions
// Verify the pool building covers all scope modes (all / s1 / s2 / s3 / weak)
// + difficulty filter, and _drawQuestions populates state.lineup correctly.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 startBattle pool tests ===');
const A = makeAssert();

function makeQuestions(count, kcPrefix = 'L21101', difficulty = 'medium') {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(makeQ(`q_${kcPrefix}_${i}`, {
      knowledge_code: kcPrefix,
      subject: kcPrefix.startsWith('L21') ? 1 : kcPrefix.startsWith('L22') ? 2 : 3,
      difficulty,
      node_id: `N_${kcPrefix}_${i % 3}`,
    }));
  }
  return out;
}

// --- 1: 'all' scope picks from full pool ---
{
  const questions = [
    ...makeQuestions(20, 'L21101'),
    ...makeQuestions(20, 'L22101'),
    ...makeQuestions(20, 'L23101'),
  ];
  const { Mode } = loadMode(7, { questions });
  const pool = Mode._buildPool({ scope: 'all', difficulty: 'mixed', qcount: 30 });
  A.eq(pool.length, 60, "scope='all' returns all 60 questions");
}

// --- 2: 's1' scope only L21 ---
{
  const questions = [
    ...makeQuestions(20, 'L21101'),
    ...makeQuestions(20, 'L22101'),
    ...makeQuestions(20, 'L23101'),
  ];
  const { Mode } = loadMode(7, { questions });
  const pool = Mode._buildPool({ scope: 's1', difficulty: 'mixed', qcount: 30 });
  A.eq(pool.length, 20, "scope='s1' returns only L21 questions");
  A.ok(pool.every(q => q.knowledge_code.startsWith('L21')), 'all are L21');
}

// --- 3: 's2' scope only L22 ---
{
  const questions = [
    ...makeQuestions(20, 'L21101'),
    ...makeQuestions(20, 'L22101'),
    ...makeQuestions(20, 'L23101'),
  ];
  const { Mode } = loadMode(7, { questions });
  const pool = Mode._buildPool({ scope: 's2', difficulty: 'mixed', qcount: 30 });
  A.ok(pool.every(q => q.knowledge_code.startsWith('L22')), 'all are L22');
}

// --- 4: 's3' scope only L23 ---
{
  const questions = [
    ...makeQuestions(20, 'L21101'),
    ...makeQuestions(20, 'L22101'),
    ...makeQuestions(20, 'L23101'),
  ];
  const { Mode } = loadMode(7, { questions });
  const pool = Mode._buildPool({ scope: 's3', difficulty: 'mixed', qcount: 30 });
  A.ok(pool.every(q => q.knowledge_code.startsWith('L23')), 'all are L23');
}

// --- 5: 'hard' difficulty filter ---
{
  const questions = [
    ...makeQuestions(10, 'L21101', 'hard'),
    ...makeQuestions(20, 'L21101', 'medium'),
    ...makeQuestions(10, 'L21101', 'easy'),
  ];
  const { Mode } = loadMode(7, { questions });
  const pool = Mode._buildPool({ scope: 'all', difficulty: 'hard', qcount: 30 });
  const hardCount = pool.filter(q => q.difficulty === 'hard').length;
  A.ok(hardCount >= 10, `difficulty='hard' includes all hard (got ${hardCount})`);
}

// --- 6: weak scope falls back when not enough weak questions ---
{
  const questions = makeQuestions(20, 'L21101');
  // Empty wrongbook / mastery → no weak nodes
  const { Mode } = loadMode(7, { questions, wrongbook: [], mastery: {} });
  const pool = Mode._buildPool({ scope: 'weak', difficulty: 'mixed', qcount: 10 });
  A.ok(pool.length >= 10, 'weak scope fallback to full pool when insufficient weak');
}

// --- 7: weak scope prioritizes nodes with wrongbook entries ---
{
  const questions = [
    ...makeQuestions(5, 'L21101'),  // node_ids include N_L21101_0, N_L21101_1, N_L21101_2
    ...makeQuestions(5, 'L22101'),  // node_ids include N_L22101_0..
  ];
  const wrongbook = [
    { qid: 'q_L21101_0', nodeId: 'N_L21101_0', wrongCount: 5, mastered: false },
  ];
  const { Mode } = loadMode(7, { questions, wrongbook });
  const pool = Mode._buildPool({ scope: 'weak', difficulty: 'mixed', qcount: 100 });
  // Weak ones should be at the front
  const firstFew = pool.slice(0, 2).map(q => q.node_id);
  A.ok(firstFew.includes('N_L21101_0'),
    'weak nodes prioritized in pool (N_L21101_0 in top-2)');
}

// --- 8: _drawQuestions produces lineup with q + npcIdx ---
{
  const questions = makeQuestions(30, 'L21101');
  const { Mode } = loadMode(7, { questions });
  const lineup = Mode._drawQuestions({ qcount: 10, scope: 'all', difficulty: 'mixed' });
  A.ok(lineup.length > 0, `lineup populated (got ${lineup.length})`);
  A.ok(lineup.every(it => it.q && typeof it.npcIdx === 'number'),
    'each lineup item has q and npcIdx');
  A.ok(lineup.every(it => it.npcIdx >= 0 && it.npcIdx < 6),
    'npcIdx in valid range [0,6)');
}

// --- 9: _drawQuestions respects qcount cap even with large pool ---
{
  const questions = makeQuestions(200, 'L21101');
  const { Mode } = loadMode(7, { questions });
  const lineup = Mode._drawQuestions({ qcount: 30, scope: 'all', difficulty: 'mixed' });
  A.ok(lineup.length === 30, `_drawQuestions caps at qcount=30 (got ${lineup.length})`);
}

// --- 10: _drawQuestions returns fewer than qcount when pool small ---
{
  const questions = makeQuestions(5, 'L21101');
  const { Mode } = loadMode(7, { questions });
  const lineup = Mode._drawQuestions({ qcount: 30, scope: 'all', difficulty: 'mixed' });
  A.ok(lineup.length <= 5, `lineup limited to available pool (got ${lineup.length})`);
}

process.exit(A.summary('Mode7 startBattle pool'));
