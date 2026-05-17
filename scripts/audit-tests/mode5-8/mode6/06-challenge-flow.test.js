// 06-challenge-flow.test.js — Mode 6 challenge() flow
// Verify:
//   - challenge() picks a question from QUESTIONS matching node_id
//   - PlayEngine.answer is hooked
//   - When hook fires on wrong, wasWrong is captured (closure variable)
//   - onNext: wrong → DrillSession.start; correct → openCard
//   - PlayEngine.answer restored after one call (origAnswer)
//   - PlayEngine.onNext restored
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 6 challenge flow tests ===');
const A = makeAssert();

function setupMode6Loaded() {
  const questions = [
    makeQ('q_lr_1', { node_id: 'L21101_N1', knowledge_code: 'L21101' }),
    makeQ('q_lr_2', { node_id: 'L21101_N1', knowledge_code: 'L21101' }),
    makeQ('q_other', { node_id: 'L22101_N1', knowledge_code: 'L22101' }),
  ];
  const r = loadMode(6, { questions });
  r.sandbox.fetch = async (url) => {
    if (url.includes('kb-allowed-nodes.json')) {
      return {
        ok: true,
        json: async () => ({
          L21101: [{ id: 'L21101_N1', title: 'LR Node' }],
        }),
      };
    }
    return { ok: true, json: async () => ({ nodes: [] }) };
  };
  return r;
}

(async () => {
  // --- 1: challenge picks a question + sets up hook ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    A.ok(r.Mode.state !== null, 'state ready after start');
    r.Mode.challenge('L21101_N1');
    A.ok(r.sandbox.PlayEngine.current !== null,
      'PlayEngine.current populated by challenge()');
    A.ok(r.Mode._origAnswer !== null, '_origAnswer saved (for cleanup)');
    // Check PlayEngine.answer was overridden
    A.ok(typeof r.sandbox.PlayEngine.answer === 'function', 'answer hook installed');
    A.ok(typeof r.sandbox.PlayEngine.onNext === 'function', 'onNext hook installed');
  }

  // --- 2: hook restores after one call (wrong answer) ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const origAnswer = r.Mode._origAnswer;
    const hookedAnswer = r.sandbox.PlayEngine.answer;
    const cur = r.sandbox.PlayEngine.current;
    // Pick wrong key
    const wrongOpt = cur.options.find(o => !o.is_correct);
    r.sandbox.PlayEngine.answer(wrongOpt.key);
    // After call, answer restored to origAnswer
    A.ok(r.sandbox.PlayEngine.answer === origAnswer,
      'answer hook restored after single call (origAnswer)');
    A.ok(r.Mode._origAnswer === null,
      '_origAnswer cleared after restoration');
  }

  // --- 3: wrong answer → onNext fires DrillSession.start ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const cur = r.sandbox.PlayEngine.current;
    const wrongOpt = cur.options.find(o => !o.is_correct);
    r.sandbox.PlayEngine.answer(wrongOpt.key);
    // Now manually fire onNext (simulating PlayEngine.showExplanation → next)
    const onNext = r.sandbox.PlayEngine.onNext;
    A.ok(typeof onNext === 'function', 'onNext still set after answer');
    onNext();
    A.ok(r.stats.drillStarts.length >= 1,
      'wrong answer + onNext → DrillSession.start fired (鐵律 #1)');
    A.eq(r.stats.drillStarts[0].nodeId, 'L21101_N1',
      'drill nodeId matches challenged node');
  }

  // --- 4: correct answer → onNext goes to openCard (no drill) ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    const cur = r.sandbox.PlayEngine.current;
    const correctOpt = cur.options.find(o => o.is_correct);
    r.sandbox.PlayEngine.answer(correctOpt.key);
    const onNext = r.sandbox.PlayEngine.onNext;
    onNext();
    A.eq(r.stats.drillStarts.length, 0,
      'correct answer + onNext → NO DrillSession.start (鐵律 #1: only wrong drills)');
  }

  // --- 5: MP cost deducted ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    const beforeMP = r.sandbox.Player.load().mp;
    r.Mode.challenge('L21101_N1');
    const afterMP = r.sandbox.Player.load().mp;
    A.ok(afterMP === beforeMP - 5,
      `MP cost 5 deducted (${beforeMP} → ${afterMP})`);
  }

  // --- 6: insufficient MP → no challenge ---
  {
    const r = setupMode6Loaded();
    r.sandbox.Player._state.mp = 2;
    await r.Mode.start();
    r.Mode.challenge('L21101_N1');
    A.ok(r.stats.toasts.some(t => t.includes('MP 不足') || t.includes('MP 不足')),
      'insufficient MP shows toast');
  }

  // --- 7: node has no questions → no challenge ---
  {
    const r = setupMode6Loaded();
    await r.Mode.start();
    r.Mode.challenge('NONEXISTENT_NODE');
    // No PlayEngine.current change expected (challenge bails out)
    A.eq(r.sandbox.PlayEngine.current, null,
      'no questions → PlayEngine.current stays null');
  }

  process.exit(A.summary('Mode6 challenge'));
})();
