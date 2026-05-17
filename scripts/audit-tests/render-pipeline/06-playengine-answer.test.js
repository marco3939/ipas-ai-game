// 06-playengine-answer.test.js
// Coverage: PlayEngine.answer(key)
//   - Correct answer -> Mastery.update(nodeId, true), SM2.recordAnswer(id, true, false),
//     Progress.addAnswer(true), SeenCorrect.mark(id), NO Wrongbook.add
//   - Wrong answer -> Mastery.update(false), Progress.addAnswer(false),
//     Wrongbook.add(id, nodeId, userKey, correctKey, userText, correctText)
//   - null/undefined key -> early return (warn), no shared-layer mutation
//   - key not in options -> early return
//   - no current question -> early return
// Attacks:
//   - answer twice with same key (legit pattern: 2nd should still update? — observe)
//   - answer with empty string ''
//   - answer with key 'A' that maps to is_correct:true (regression for case 10)

const { freshContext } = require('./_loader.js');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; fails.push({ label, got, want }); }
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label);
}
function truthy(label, v) {
  const ok = !!v;
  if (ok) pass++; else { fail++; fails.push({ label, got: v }); }
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label);
}

function makeCtx() {
  const { sandbox, context } = freshContext();
  // Provide a tracking document
  const elementStore = {};
  function getOrMake(id) {
    if (!elementStore[id]) {
      elementStore[id] = { id, innerHTML: '', appendChild() {}, querySelectorAll() { return []; },
        classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {} };
    }
    return elementStore[id];
  }
  sandbox.document = {
    getElementById: getOrMake,
    querySelectorAll: () => [], // no buttons to lock in mock
    createElement: () => ({ className: '', textContent: '', remove(){} })
  };
  return { sandbox, context, elementStore };
}

console.log('=== Test 1: correct answer -> Mastery true, no Wrongbook ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q1', node_id: 'N1', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [
      { text: 'A-correct', is_correct: true },
      { text: 'B-wrong' }, { text: 'C-wrong' }, { text: 'D-wrong' }
    ],
    explanation: { correct: 'because' }
  });
  PlayEngine.answer('A');
  console.log('  Mastery calls:', JSON.stringify(sandbox.Mastery._calls));
  console.log('  Wrongbook calls:', JSON.stringify(sandbox.Wrongbook._calls));
  console.log('  SM2 calls:', JSON.stringify(sandbox.SM2._calls));
  console.log('  Progress calls:', JSON.stringify(sandbox.Progress._calls));
  console.log('  SeenCorrect calls:', JSON.stringify(sandbox.SeenCorrect._calls));
  eq('Mastery called with (N1, true)', sandbox.Mastery._calls, [['N1', true]]);
  eq('SM2.recordAnswer(q1, true, false)', sandbox.SM2._calls, [['q1', true, false]]);
  eq('Progress.addAnswer(true)', sandbox.Progress._calls, [[true]]);
  eq('SeenCorrect.mark(q1)', sandbox.SeenCorrect._calls, [['q1']]);
  eq('Wrongbook NOT called', sandbox.Wrongbook._calls, []);
}

console.log('\n=== Test 2: wrong answer -> Wrongbook.add(id, nodeId, key, correctKey, userText, correctText) ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q2', node_id: 'N2', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [
      { text: 'A-correct', is_correct: true },
      { text: 'B-wrong' }, { text: 'C-wrong' }, { text: 'D-wrong' }
    ]
  });
  PlayEngine.answer('B');
  console.log('  Mastery calls:', JSON.stringify(sandbox.Mastery._calls));
  console.log('  Wrongbook calls:', JSON.stringify(sandbox.Wrongbook._calls));
  // FINDING: Mastery receives opt.is_correct directly.  If the wrong option
  // omits the `is_correct` field, Mastery sees `undefined` instead of `false`.
  // Mastery.update should coerce, but if it does `=== true` or `if (correct)`
  // the result is the same.  If it does `if (correct === true)` versus
  // `else if (correct === false)`, undefined silently falls through.
  //
  // Verify the actual call shape:
  truthy('Mastery.update called once', sandbox.Mastery._calls.length === 1);
  truthy('Mastery.update first arg is "N2"', sandbox.Mastery._calls[0][0] === 'N2');
  const isCorrectArg = sandbox.Mastery._calls[0][1];
  console.log('  FINDING: Mastery.update isCorrect arg type:', typeof isCorrectArg, 'value:', isCorrectArg);
  truthy('isCorrect arg is falsy (undefined OR false)', !isCorrectArg);
  console.log('  RECOMMENDATION: PlayEngine.answer should pass !!opt.is_correct to Mastery/SM2/Progress to avoid undefined leak.');
  eq('Wrongbook.add(q2, N2, B, A, B-wrong, A-correct)', sandbox.Wrongbook._calls,
     [['q2', 'N2', 'B', 'A', 'B-wrong', 'A-correct']]);
  eq('SeenCorrect NOT called', sandbox.SeenCorrect._calls, []);
}

console.log('\n=== Test 3: answer() with no current question -> silent return (case 11 null-guard) ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  PlayEngine.current = null;
  let threw = null;
  try { PlayEngine.answer('A'); } catch (e) { threw = e; }
  truthy('answer() did not throw with current=null', threw === null);
  eq('no Mastery write', sandbox.Mastery._calls, []);
  eq('no Wrongbook write', sandbox.Wrongbook._calls, []);
}

console.log('\n=== Test 4: answer() with invalid key -> silent return ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q4', node_id: 'N4', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  let threw = null;
  try { PlayEngine.answer('Z'); } catch (e) { threw = e; }
  truthy('answer("Z") did not throw', threw === null);
  eq('no Mastery write for invalid key', sandbox.Mastery._calls, []);
  eq('no Wrongbook write for invalid key', sandbox.Wrongbook._calls, []);
}

console.log('\n=== Test 5: answer(undefined) and answer(null) -> silent return ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q5', node_id: 'N5', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  let ok = true;
  try { PlayEngine.answer(undefined); PlayEngine.answer(null); } catch (e) { ok = false; }
  truthy('answer(undefined) / answer(null) did not throw', ok);
  eq('no Mastery write', sandbox.Mastery._calls, []);
}

console.log('\n=== Test 6: answer twice with same key (no guard — both fire) ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q6', node_id: 'N6', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  PlayEngine.answer('A');
  PlayEngine.answer('A');
  // FINDING: PlayEngine.answer has no idempotency guard.  Two clicks -> two
  // Mastery.update(true) -> over-counts attempts/correct.  In practice,
  // PlayEngine.answer locks all buttons via querySelectorAll, so DOM-level
  // re-click is blocked.  BUT modes that programmatically call answer()
  // twice (e.g. drill onComplete) could double-count.
  console.log('  Mastery calls:', JSON.stringify(sandbox.Mastery._calls));
  truthy('PlayEngine.answer is NOT idempotent — 2 calls = 2 writes (FINDING)',
    sandbox.Mastery._calls.length === 2);
  console.log('  FINDING: no idempotency guard.  Callers must ensure single dispatch.');
}

console.log('\n=== Test 7: q.id missing -> SM2 not called (id-conditional), SeenCorrect not called ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    // no id
    node_id: 'Nx', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  PlayEngine.answer('A');
  eq('SM2 not called when q.id missing', sandbox.SM2._calls, []);
  eq('SeenCorrect.mark not called when q.id missing', sandbox.SeenCorrect._calls, []);
  // But Mastery still fires on nodeId
  eq('Mastery still updated', sandbox.Mastery._calls, [['Nx', true]]);
}

console.log('\n=== Test 8: q.node_id missing -> Mastery not called ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q8', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  PlayEngine.answer('A');
  eq('Mastery not called when node_id missing', sandbox.Mastery._calls, []);
  eq('Progress still updated', sandbox.Progress._calls, [[true]]);
}

console.log('\n=== Test 9 (CASE 10 REGRESSION): wrong answer Wrongbook.add args are all populated ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(42);', context); // shuffle order
  PlayEngine.show({
    id: 'q9', node_id: 'N9', stem: '?', knowledge_code: 'L1',
    difficulty: 'easy', format: 'mc',  // shuffle_options default true
    options: [
      { text: 'a-correct', is_correct: true },
      { text: 'b-wrong' }, { text: 'c-wrong' }, { text: 'd-wrong' }
    ]
  });
  // pick a wrong key from the shuffled current
  const wrongKey = PlayEngine.current.options.find(o => !o.is_correct).key;
  PlayEngine.answer(wrongKey);
  const wb = sandbox.Wrongbook._calls[0];
  console.log('  Wrongbook.add args:', JSON.stringify(wb));
  truthy('arg[0] qid is "q9"', wb[0] === 'q9');
  truthy('arg[1] nodeId is "N9"', wb[1] === 'N9');
  truthy('arg[2] userKey is the wrong key chosen', wb[2] === wrongKey);
  truthy('arg[3] correctKey is a valid A/B/C/D char (NOT undefined)',
    ['A','B','C','D'].includes(wb[3]));
  truthy('arg[4] userText is non-empty', wb[4] && wb[4].length > 0);
  truthy('arg[5] correctText is "a-correct"', wb[5] === 'a-correct');
}

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
