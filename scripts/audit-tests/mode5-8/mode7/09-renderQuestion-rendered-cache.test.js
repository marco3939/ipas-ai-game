// 09-renderQuestion-rendered-cache.test.js — 案例 10 _rendered cache
// CRITICAL: Mode 7 must cache the renderQuestion output to item._rendered after
// first call. Subsequent visits to the same question MUST reuse cache (no
// re-shuffle), otherwise userKey draft becomes stale.
//
// case 10 (PR 5..19): 13-PR silent bug — `state.lineup[i].q.options` was the
// original (un-shuffled, no-key) options. `q.options.find(o => o.key === userKey)`
// always returned undefined. Fix: cache `item._rendered` and use it everywhere.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 _rendered cache (case 10 critical) tests ===');
const A = makeAssert();

function setupMode7() {
  const questions = [];
  for (let i = 0; i < 5; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i}`,
      knowledge_code: 'L21101',
      stem: `Question ${i}`,
      options: [
        { text: 'correct option', is_correct: true },
        { text: 'wrong A', is_correct: false },
        { text: 'wrong B', is_correct: false },
        { text: 'wrong C', is_correct: false },
      ],
    }));
  }
  const r = loadMode(7, { questions });
  // _setupConfig manually since renderSetup uses DOM
  r.Mode._setupConfig = { qcount: 5, scope: 'all', difficulty: 'mixed' };
  return r;
}

// --- 1: first _showCurrentQuestion populates item._rendered ---
{
  const { Mode, sandbox } = setupMode7();
  Mode._startBattle();
  const item0 = Mode.state.lineup[0];
  A.ok(item0._rendered, 'item._rendered set after first _showCurrentQuestion');
  A.ok(Array.isArray(item0._rendered.options), '_rendered.options is array');
  A.ok(item0._rendered.options.every(o => typeof o.key === 'string' && /^[A-D]$/.test(o.key)),
    'all _rendered.options have valid A/B/C/D key');
}

// --- 2: re-visiting same question DOES NOT re-shuffle ---
{
  const { Mode, sandbox } = setupMode7();
  Mode._startBattle();
  const item0 = Mode.state.lineup[0];
  const firstKeys = item0._rendered.options.map(o => o.text + '|' + o.key);

  // Move to next question, then back
  Mode.state.idx = 1;
  Mode._showCurrentQuestion();
  Mode.state.idx = 0;
  Mode._showCurrentQuestion();

  const secondKeys = item0._rendered.options.map(o => o.text + '|' + o.key);
  A.eq(firstKeys, secondKeys,
    'second visit returns same key→text mapping (no re-shuffle, case 10 fix)');
}

// --- 3: _getRendered returns item._rendered when present ---
{
  const { Mode } = setupMode7();
  Mode._startBattle();
  const item0 = Mode.state.lineup[0];
  const rendered = Mode._getRendered(item0);
  A.ok(rendered === item0._rendered, '_getRendered returns the cache');
  A.ok(rendered.options.every(o => o.key), 'returned options all have key');
}

// --- 4: _getRendered fallback: PlayEngine.current matching id ---
{
  const { Mode, sandbox } = setupMode7();
  Mode._startBattle();
  // Create a NEW item that hasn't been rendered, but PlayEngine.current has its id
  const item = { q: { id: 'qNew' } };
  sandbox.PlayEngine.current = { id: 'qNew', options: [{ key: 'A', text: 'x' }] };
  const got = Mode._getRendered(item);
  A.ok(got === sandbox.PlayEngine.current,
    '_getRendered fallback: PlayEngine.current when id matches');
}

// --- 5: _getRendered fallback: item.q when no cache or PE match ---
{
  const { Mode, sandbox } = setupMode7();
  sandbox.PlayEngine.current = null;
  const item = { q: { id: 'qX', options: [{ text: 'foo' }] } };
  const got = Mode._getRendered(item);
  A.ok(got === item.q, '_getRendered fallback: item.q when no cache or PE');
}

// --- 6: _getRendered(null) returns null ---
{
  const { Mode } = setupMode7();
  A.eq(Mode._getRendered(null), null, '_getRendered(null) returns null');
  A.eq(Mode._getRendered(undefined), null, '_getRendered(undefined) returns null');
}

// --- 7: rendered options have exactly 4 unique keys A/B/C/D ---
{
  const { Mode } = setupMode7();
  Mode._startBattle();
  for (let i = 0; i < Mode.state.total; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const item = Mode.state.lineup[i];
    const keys = item._rendered.options.map(o => o.key).sort();
    A.eq(keys, ['A', 'B', 'C', 'D'],
      `q${i} _rendered.options have exactly A/B/C/D`);
  }
}

// --- 8: when re-rendering an already-cached question, shuffle_options:false enforced ---
//   Check the renderQuestion call by inspecting what's stored in cache:
//   we passed Object.assign({}, item._rendered, { shuffle_options:false })
//   which should keep the same order.
{
  const { Mode } = setupMode7();
  Mode._startBattle();
  const item0 = Mode.state.lineup[0];
  const beforeOrder = item0._rendered.options.map(o => o.text);
  // simulate re-rendering same question multiple times
  Mode._showCurrentQuestion();
  Mode._showCurrentQuestion();
  Mode._showCurrentQuestion();
  const afterOrder = item0._rendered.options.map(o => o.text);
  A.eq(beforeOrder, afterOrder, 'multiple re-renders preserve option order');
}

// --- 9: case-10 worst-case  — userKey draft maps to correct text via _rendered ---
//   This is the bug from the case 10 history: draft.userKey was assigned via
//   the rendered options, but later submit code reread item.q.options (no key).
//   We verify the submit code path uses _rendered.
{
  const { Mode } = setupMode7();
  Mode._startBattle();
  const item0 = Mode.state.lineup[0];
  // Simulate user selecting key 'C' via the hook
  Mode.state.draft[0] = { userKey: 'C' };
  // The C option in rendered.options
  const cOpt = item0._rendered.options.find(o => o.key === 'C');
  A.ok(cOpt, "rendered options has key 'C'");
  // submitCurrent should use _getRendered to map C → option
  Mode.submitCurrent();
  const ans = Mode.state.answers[0];
  A.ok(ans, 'answers[0] populated after submitCurrent');
  A.eq(ans.userKey, 'C', 'answers[0].userKey === C');
  A.eq(ans.isCorrect, cOpt.is_correct,
    `answers[0].isCorrect matches the actual is_correct of key 'C' (${cOpt.is_correct})`);
}

process.exit(A.summary('Mode7 _rendered cache'));
