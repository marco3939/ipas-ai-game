// 04-renderQuestion.test.js  ★ CRITICAL (case 8 + case 10 root)
// Coverage: renderQuestion(q)
//   - normal mc question -> options get A/B/C/D keys, shuffle_options:true is default
//   - shuffle_options:false -> options preserve order (no key swap)
//   - calculation question with stem_variables.case_a -> placeholder replacement
//     covers stem / options.text / explanation.correct/wrong/hook / matrix_data /
//     expected_answer / extra_classes / code_block / trace_steps  (CASE 8)
//   - case 10: every rendered option has `key` set to 'A'/'B'/'C'/'D' (or higher
//     chars only when options.length > 26 — ATTACK SURFACE)
// Attacks:
//   - options.length = 30 -> what keys are assigned?
//   - options containing __proto__-like text
//   - stem with <script> tag — render is raw HTML downstream, but renderQuestion
//     itself only replaces placeholders, so the script tag should be preserved
//     verbatim (XSS risk handled at PlayEngine.show via template literal — see
//     07-xss-sandbox.test.js for that).

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

const { context } = freshContext();
const renderQuestion = vm.runInContext('renderQuestion', context);
const RNG = vm.runInContext('RNG', context);

console.log('=== Test 1: simple mc question — A/B/C/D keys assigned ===');
RNG.set(1);
const q1 = {
  id: 'q1', stem: 'What is X?',
  options: [
    { text: 'a', is_correct: true },
    { text: 'b' },
    { text: 'c' },
    { text: 'd' }
  ],
  explanation: { correct: 'because A' }
};
const r1 = renderQuestion(q1);
truthy('exactly 4 options', r1.options.length === 4);
eq('keys are A/B/C/D in order',
   r1.options.map(o => o.key), ['A', 'B', 'C', 'D']);

console.log('\n=== Test 2: shuffle_options:false -> original order preserved ===');
RNG.set(1);
const q2 = {
  id: 'q2', stem: '?',
  shuffle_options: false,
  options: [
    { text: 'first', is_correct: true },
    { text: 'second' },
    { text: 'third' },
    { text: 'fourth' }
  ]
};
const r2 = renderQuestion(q2);
eq('order preserved when shuffle_options:false',
   r2.options.map(o => o.text), ['first', 'second', 'third', 'fourth']);
eq('keys A/B/C/D in original order', r2.options.map(o => o.key), ['A','B','C','D']);

console.log('\n=== Test 3 (CASE 10 ROOT): is_correct survives shuffle ===');
RNG.set(7);
const q3 = {
  id: 'q3', stem: '?',
  options: [
    { text: 'wrong1' },
    { text: 'CORRECT', is_correct: true },
    { text: 'wrong2' },
    { text: 'wrong3' }
  ]
};
const r3 = renderQuestion(q3);
const correct = r3.options.find(o => o.is_correct);
truthy('exactly one option still marked is_correct after shuffle', !!correct);
truthy('the correct option still has text "CORRECT"', correct.text === 'CORRECT');
truthy('the correct option has a valid key (A-D)', ['A','B','C','D'].includes(correct.key));
const isCorrectCount = r3.options.filter(o => o.is_correct).length;
truthy('exactly one is_correct (no duplication / loss)', isCorrectCount === 1);

console.log('\n=== Test 4 (CASE 8 ROOT): calculation placeholder replacement ===');
RNG.set(1);
const q4 = {
  id: 'q4', format: 'calculation',
  stem: 'Predict the {target}: y = {a} * x + {b}, x={x}. Answer = {answer}',
  stem_variables: {
    case_a: { target: 'price', a: '2', b: '3', x: '5', answer: '13', wrong1: '11', wrong2: '15' }
  },
  options: [
    { text: '{answer}', is_correct: true },
    { text: '{wrong1}' },
    { text: '{wrong2}' },
    { text: '20' }
  ],
  explanation: {
    correct: 'The formula is {a}*{x}+{b}={answer}',
    hook: 'remember {answer}',
    wrong: { '{wrong1}': 'forgot to add {b}', '{wrong2}': 'doubled {a}' }
  }
};
const r4 = renderQuestion(q4);
console.log('  stem:', r4.stem);
console.log('  options:', r4.options.map(o => o.text));
console.log('  explanation.correct:', r4.explanation.correct);
console.log('  explanation.wrong:', r4.explanation.wrong);
truthy('stem has NO {placeholder} residue (CASE 8)',
  !/\{(target|a|b|x|answer|wrong\d)\}/.test(r4.stem));
truthy('options have NO {placeholder} residue',
  r4.options.every(o => !/\{(target|a|b|x|answer|wrong\d)\}/.test(o.text)));
truthy('explanation.correct has NO residue',
  !/\{[a-z_]+\}/.test(r4.explanation.correct));
truthy('explanation.wrong keys substituted (no {wrong1} key)',
  !Object.keys(r4.explanation.wrong).some(k => /\{wrong\d\}/.test(k)));
truthy('explanation.wrong values substituted',
  !Object.values(r4.explanation.wrong).some(v => /\{[a-z]+\}/.test(v)));
truthy('the option with text "13" is the correct one (is_correct preserved)',
  r4.options.find(o => o.text === '13')?.is_correct === true);

console.log('\n=== Test 5: shuffle_options:false on calculation -> still substituted ===');
RNG.set(1);
const q5 = { ...q4, shuffle_options: false };
const r5 = renderQuestion(JSON.parse(JSON.stringify(q5)));
eq('with shuffle_options:false keys A/B/C/D in original order',
   r5.options.map(o => o.key), ['A','B','C','D']);
truthy('still substituted',
   !r5.options.some(o => /\{/.test(o.text)));

console.log('\n=== Test 6 (CASE 10 ATTACK): options.length = 30 ===');
const opts30 = [];
for (let i = 0; i < 30; i++) opts30.push({ text: 'opt' + i, is_correct: i === 0 });
const q6 = { id: 'q6', stem: '?', options: opts30, shuffle_options: false };
RNG.set(1);
const r6 = renderQuestion(q6);
console.log('  keys assigned for 30 options:', r6.options.map(o => o.key).join(','));
// String.fromCharCode(65+i) > 90 (Z) wraps into [, \, ], ^, _, `, a, b, c, d ...
truthy('30 options -> keys go past Z into ASCII chars [\\]^_` and lowercase',
  r6.options[26].key === '['); // 65+26=91='['
truthy('keys after 26 are non-letter (printable but ugly)',
  r6.options[29].key === '^'); // 65+29=94='^'
console.log('  WARNING: renderQuestion has NO cap on options.length — 5+ options will get weird keys ([, \\, ], ^, _).');
console.log('  RECOMMENDATION: validate options.length <= 4 (or <= 5) at question schema layer.');

console.log('\n=== Test 7: stem_variables.case_a + non-string code_block ===');
RNG.set(1);
const q7 = {
  id: 'q7', format: 'code_reading',
  stem: 'See code:',
  stem_variables: { case_a: { a: '10', batch: '32' } },
  options: [{ text: 'ok', is_correct: true }, { text: 'no' }],
  code_block: 'x = {a}\nbatch = {batch}\n# placeholder {a}'
};
const r7 = renderQuestion(q7);
console.log('  code_block:', JSON.stringify(r7.code_block));
truthy('code_block placeholders substituted', !/\{(a|batch)\}/.test(r7.code_block));

console.log('\n=== Test 8: trace_steps placeholder substitution (R4C) ===');
RNG.set(1);
const q8 = {
  id: 'q8', format: 'code_trace',
  stem: 'Trace:',
  stem_variables: { case_a: { x: '5', y: '10' } },
  options: [{ text: 'ok', is_correct: true }],
  trace_steps: [
    {
      ask: 'After step 1, x = {x}?',
      options: [
        { text: 'value is {x}', trap_type: 'literal {y}', is_correct: true },
        { text: 'value is {y}', trap_type: 'off-by-one' }
      ]
    }
  ]
};
const r8 = renderQuestion(q8);
console.log('  trace_steps[0].ask:', r8.trace_steps[0].ask);
truthy('trace_steps[0].ask substituted', !/\{[a-z]\}/.test(r8.trace_steps[0].ask));
truthy('trace_steps[0].options[0].text substituted',
  !/\{[a-z]\}/.test(r8.trace_steps[0].options[0].text));
truthy('trace_steps[0].options[0].trap_type substituted',
  !/\{[a-z]\}/.test(r8.trace_steps[0].options[0].trap_type));

console.log('\n=== Test 9: matrix_data deep substitution (confusion-matrix) ===');
RNG.set(1);
const q9 = {
  id: 'q9', format: 'calculation',
  interaction_type: 'confusion-matrix',
  stem: 'Compute F1:',
  stem_variables: { case_a: { tp: '50', fp: '10', fn: '5', answer: '0.87' } },
  options: [{ text: '{answer}', is_correct: true }, { text: 'wrong' }],
  matrix_data: {
    cells: [
      { label: 'TP={tp}', value: '{tp}' },
      { label: 'FP={fp}', value: '{fp}' }
    ]
  },
  expected_answer: '{answer}'
};
const r9 = renderQuestion(q9);
console.log('  matrix_data:', JSON.stringify(r9.matrix_data));
console.log('  expected_answer:', r9.expected_answer);
truthy('matrix_data deeply substituted', !JSON.stringify(r9.matrix_data).includes('{tp}'));
truthy('expected_answer substituted', r9.expected_answer === '0.87');

console.log('\n=== Test 10: renderQuestion does NOT mutate input ===');
const original = {
  id: 'q10', stem: 'orig',
  options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
};
const snapshot = JSON.stringify(original);
RNG.set(1);
renderQuestion(original);
eq('original question unchanged', JSON.stringify(original), snapshot);

console.log('\n=== Test 11: __proto__ pollution attempt via stem_variables ===');
RNG.set(1);
const q11 = {
  id: 'q11', format: 'calculation',
  stem: 'x={x}',
  stem_variables: {
    case_a: JSON.parse('{"x": "1", "__proto__": {"polluted": true}}')
  },
  options: [{ text: '1', is_correct: true }, { text: '2' }]
};
const r11 = renderQuestion(q11);
truthy('Object.prototype not polluted after renderQuestion', ({}).polluted === undefined);
truthy('renderQuestion still substitutes valid keys', r11.stem === 'x=1');

console.log('\n=== Test 12: re-render same question yields stable shape, possibly different order ===');
RNG.set(100);
const r12a = renderQuestion(q1);
RNG.set(200);
const r12b = renderQuestion(q1);
truthy('both renders have 4 options each', r12a.options.length === 4 && r12b.options.length === 4);
truthy('both renders have a single is_correct',
  r12a.options.filter(o => o.is_correct).length === 1 &&
  r12b.options.filter(o => o.is_correct).length === 1);

console.log('\n=== Test 13: stem with <script> tag is preserved RAW (no escaping) ===');
RNG.set(1);
const q13 = {
  id: 'q13', stem: '<script>alert(1)</script>',
  options: [{ text: 'ok', is_correct: true }, { text: 'no' }]
};
const r13 = renderQuestion(q13);
truthy('stem with <script> kept verbatim (XSS surface — PlayEngine.show injects via innerHTML)',
  r13.stem === '<script>alert(1)</script>');
console.log('  FINDING: renderQuestion does NOT escape stem; PlayEngine.show uses template-literal innerHTML.');
console.log('  Mitigation: question authors are trusted (kb/scope.json white-listed). User-input never reaches stem.');

console.log('\n=== Test 14: deterministic shuffle — same seed, same render order ===');
RNG.set(5050);
const r14a = renderQuestion(q1);
RNG.set(5050);
const r14b = renderQuestion(q1);
eq('same seed -> same option text order',
   r14a.options.map(o => o.text), r14b.options.map(o => o.text));

console.log('\n=== Test 15 (CASE 10 INVARIANT): every option has non-undefined key after render ===');
// Mode 7 used to read state.lineup[i].q.options directly (pre-render), so keys
// were undefined.  Confirm that the OUTPUT of renderQuestion always has a key.
RNG.set(1);
for (let i = 0; i < 50; i++) {
  RNG.set(i);
  const r = renderQuestion(q1);
  for (const o of r.options) {
    if (typeof o.key !== 'string' || o.key.length !== 1) {
      fail++; fails.push({ label: 'key invariant', i, opt: o });
    }
  }
}
truthy('all options across 50 renders have a 1-char string key (case 10 invariant)', fail === 0);

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
