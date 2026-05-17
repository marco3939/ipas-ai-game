// 05-playengine-show.test.js
// Coverage: PlayEngine.show(question, opts)
//   - Sets this.current to the rendered question
//   - For interaction_type === 'confusion-matrix' with ConfusionMatrix defined,
//     takes the early-return branch (renders into #cm-container, not #play-options)
//   - For other questions, renders the standard option list HTML
//   - Calls `show('view-play')` (we mock that to a tracker)
//
// We mock document.getElementById to return a writable object so we can
// observe the assigned innerHTML for the play-view element.

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

// Helper to spin a context with a tracked document.getElementById.
function makeCtx() {
  const { sandbox, context } = freshContext();
  // Override document with a tracking impl
  const elementStore = {};
  function getOrMake(id) {
    if (!elementStore[id]) {
      elementStore[id] = {
        id,
        innerHTML: '',
        appendChild() {},
        querySelectorAll() { return []; },
        classList: { add(){}, remove(){}, toggle(){} },
        dataset: {},
        style: {}
      };
    }
    return elementStore[id];
  }
  const trackedDoc = {
    _store: elementStore,
    getElementById: getOrMake,
    querySelectorAll: () => [],
    createElement: () => ({ className: '', textContent: '', remove() {} })
  };
  // Replace the `document` global inside the vm context.  Assigning to the
  // sandbox object directly works because we created the context with this
  // object.  But `document` was already captured by reference inside
  // PlayEngine.show via the sandbox property, so update both.
  sandbox.document = trackedDoc;
  // also re-define `show` to track:
  const showCalls = [];
  sandbox.show = (id) => showCalls.push(id);
  return { sandbox, context, elementStore, showCalls };
}

console.log('=== Test 1: show() sets PlayEngine.current to the rendered question ===');
{
  const { sandbox, context, elementStore, showCalls } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q1', stem: 'What is X?',
    knowledge_code: 'L2', difficulty: 'easy', format: 'mc',
    options: [
      { text: 'a', is_correct: true },
      { text: 'b' }, { text: 'c' }, { text: 'd' }
    ]
  });
  truthy('PlayEngine.current is set', !!PlayEngine.current);
  truthy('current.options each have a key', PlayEngine.current.options.every(o => o.key));
  truthy('view-play innerHTML contains "What is X?"', elementStore['view-play'].innerHTML.includes('What is X?'));
  truthy('show("view-play") called', showCalls.includes('view-play'));
}

console.log('\n=== Test 2: confusion-matrix early-return (when ConfusionMatrix defined) ===');
{
  const { sandbox, context, elementStore, showCalls } = makeCtx();
  // Inject ConfusionMatrix into sandbox AND into the vm context as a global
  sandbox.ConfusionMatrix = {
    _called: false,
    render(q, container) { this._called = true; this._lastQ = q; this._lastContainer = container; }
  };
  vm.runInContext('var ConfusionMatrix = this.ConfusionMatrix || globalThis.ConfusionMatrix;', context);
  // Re-assign via global-like injection
  vm.runInContext(`ConfusionMatrix = ${JSON.stringify({})};`, context);
  // Better: re-define a stub directly:
  vm.runInContext('ConfusionMatrix = { _called: false, render(q,c){ this._called = true; this._lastQ = q; } };', context);

  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q2', stem: 'CM test',
    interaction_type: 'confusion-matrix',
    knowledge_code: 'L3', difficulty: 'medium', format: 'mc',
    options: [{ text: '0.5', is_correct: true }, { text: '0.4' }]
  });
  const cmCalled = vm.runInContext('ConfusionMatrix._called', context);
  truthy('ConfusionMatrix.render was invoked (early-return branch taken)', cmCalled === true);
  // innerHTML for view-play should be '<div id="cm-container"></div>' (plus optional ctx)
  truthy('view-play innerHTML contains #cm-container, NOT #play-options',
    elementStore['view-play'].innerHTML.includes('cm-container') &&
    !elementStore['view-play'].innerHTML.includes('play-options'));
  truthy('current still set even on early-return', !!PlayEngine.current);
}

console.log('\n=== Test 3: contextHTML opts prepends to view innerHTML ===');
{
  const { sandbox, context, elementStore, showCalls } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q3', stem: 'plain',
    knowledge_code: 'L4', difficulty: 'easy', format: 'mc',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  }, { contextHTML: '<div class="boss-bar">HP:50</div>' });
  truthy('view-play innerHTML starts with the context HTML',
    elementStore['view-play'].innerHTML.indexOf('boss-bar') <
    elementStore['view-play'].innerHTML.indexOf('question-card'));
}

console.log('\n=== Test 4: show() called twice -> current is replaced ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  const qa = { id: 'qA', stem: 'A?', knowledge_code: 'L1', difficulty: 'easy', format: 'mc',
    options: [{ text: '1', is_correct: true }, { text: '2' }, { text: '3' }, { text: '4' }] };
  const qb = { id: 'qB', stem: 'B?', knowledge_code: 'L1', difficulty: 'easy', format: 'mc',
    options: [{ text: 'x', is_correct: true }, { text: 'y' }, { text: 'z' }, { text: 'w' }] };
  PlayEngine.show(qa);
  truthy('first show -> current.id === qA', PlayEngine.current.id === 'qA');
  PlayEngine.show(qb);
  truthy('second show -> current.id === qB (replaced)', PlayEngine.current.id === 'qB');
}

console.log('\n=== Test 5: show() with code_block renders highlighted code ===');
{
  const { sandbox, context, elementStore } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'q5', stem: 'See code:',
    knowledge_code: 'L2', difficulty: 'medium', format: 'code_reading',
    code_block: 'import numpy as np\nx = np.array([1,2,3])',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  const html = elementStore['view-play'].innerHTML;
  truthy('view-play contains class "code-syntax"', html.includes('code-syntax'));
  truthy('keywords highlighted (kw span)', html.includes('class="kw"'));
}

console.log('\n=== Test 6: opt.is_correct is preserved in PlayEngine.current ===');
{
  const { sandbox, context } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(42);', context);
  PlayEngine.show({
    id: 'q6', stem: '?', knowledge_code: 'L1', difficulty: 'easy', format: 'mc',
    options: [
      { text: 'wrong1' },
      { text: 'CORRECT', is_correct: true },
      { text: 'wrong2' },
      { text: 'wrong3' }
    ]
  });
  const correct = PlayEngine.current.options.find(o => o.is_correct);
  truthy('exactly one is_correct in current', PlayEngine.current.options.filter(o => o.is_correct).length === 1);
  truthy('correct option still has text "CORRECT"', correct.text === 'CORRECT');
  truthy('correct option has a key (A/B/C/D)', ['A','B','C','D'].includes(correct.key));
}

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
