// 03-pickCase.test.js
// Coverage: pickCase(question)
//   - Returns null when stem_variables absent
//   - Returns null when no key starts with "case_"
//   - Returns the second tuple element (the case payload) when at least one case_* present
//   - Distribution: across many seeds, all cases should be reachable.

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
const pickCase = vm.runInContext('pickCase', context);
const RNG = vm.runInContext('RNG', context);

console.log('=== Test 1: no stem_variables -> null ===');
eq('pickCase({}) === null', pickCase({}), null);

console.log('\n=== Test 2: stem_variables present but no case_* keys -> null ===');
eq('only plain pools -> null', pickCase({ stem_variables: { x: ['1', '2'] } }), null);

console.log('\n=== Test 3: single case_a ===');
RNG.set(1);
const q3 = { stem_variables: { case_a: { answer: '42' } } };
eq('returns the case_a payload', pickCase(q3), { answer: '42' });

console.log('\n=== Test 4: case_a + case_b + case_c -> reachable distribution ===');
const q4 = {
  stem_variables: {
    case_a: { tag: 'A' },
    case_b: { tag: 'B' },
    case_c: { tag: 'C' }
  }
};
const tagsSeen = new Set();
for (let i = 0; i < 200; i++) {
  RNG.set(i);
  const c = pickCase(q4);
  tagsSeen.add(c.tag);
}
truthy('all three cases reachable across 200 seeds', tagsSeen.size === 3);
console.log('  tags seen:', [...tagsSeen].sort().join(','));

console.log('\n=== Test 5: mixed plain pool + case_* ===');
RNG.set(1);
const q5 = {
  stem_variables: {
    base_pool: ['x', 'y'],
    case_a: { ans: 'A' },
    case_b: { ans: 'B' }
  }
};
const c5 = pickCase(q5);
truthy('mixed schema returns one of case_*', c5 && (c5.ans === 'A' || c5.ans === 'B'));
console.log('  picked:', JSON.stringify(c5));

console.log('\n=== Test 6: deterministic with same seed ===');
RNG.set(99);
const a = pickCase(q4);
RNG.set(99);
const b = pickCase(q4);
eq('same seed -> same case', a, b);

console.log('\n=== Test 7: stem_variables.case_* with null payload ===');
RNG.set(1);
const q7 = { stem_variables: { case_a: null } };
// Returns null (the payload), which is benign — downstream subAll(s) guards
// with `Object.entries(c)` -> Object.entries(null) throws.  Critical caveat.
const c7 = pickCase(q7);
eq('returns the null payload as-is', c7, null);
// (Note: in renderQuestion the line `if (c) {...}` guards against null so
//  this case_a:null is safe — but case_a:{} would enter the block with empty
//  subAll loop — also safe.)

console.log('\n=== Test 8: __proto__ as a case key (NOT a case_* prefix, skipped) ===');
const q8 = {
  stem_variables: {
    case_a: { ok: 1 },
    '__proto__': { polluted: true }
  }
};
RNG.set(1);
const c8 = pickCase(q8);
// Object.entries returns own keys only; filter starts with "case_" so __proto__
// (as a key, not as the prototype hook) is filtered out by the prefix test.
truthy('__proto__ key is excluded by case_ prefix filter', c8 && c8.ok === 1);
truthy('Object.prototype not polluted', ({}).polluted === undefined);

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
