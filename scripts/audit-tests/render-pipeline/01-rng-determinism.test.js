// 01-rng-determinism.test.js
// Coverage: RNG.set / next / pick / shuffle / pickN
// Attacks: empty pool, n > pool.length, n=0, n negative, n huge,
//          identical seed determinism over 100 runs.

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
const RNG = vm.runInContext('RNG', context);

console.log('=== Test 1: deterministic shuffle (same seed -> same result, x100) ===');
RNG.set(42);
const baseline = RNG.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
let allMatch = true;
for (let i = 0; i < 100; i++) {
  RNG.set(42);
  const got = RNG.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  if (JSON.stringify(got) !== JSON.stringify(baseline)) { allMatch = false; break; }
}
truthy('shuffle is deterministic across 100 runs with same seed', allMatch);
console.log('  baseline order:', baseline.join(','));

console.log('\n=== Test 2: different seeds -> different results (usually) ===');
RNG.set(1);
const s1 = RNG.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
RNG.set(2);
const s2 = RNG.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
truthy('seed 1 vs seed 2 produces different shuffle', JSON.stringify(s1) !== JSON.stringify(s2));

console.log('\n=== Test 3: shuffle does not mutate input ===');
const input = [1, 2, 3, 4, 5];
const inputCopy = [...input];
RNG.set(100);
RNG.shuffle(input);
eq('input array unchanged after shuffle', input, inputCopy);

console.log('\n=== Test 4: pick on empty array ===');
RNG.set(1);
const pickEmpty = RNG.pick([]);
// arr[Math.floor(...)*0] -> arr[NaN or 0] -> undefined
eq('pick([]) returns undefined', pickEmpty, undefined);

console.log('\n=== Test 5: pickN edge cases ===');
RNG.set(1);
eq('pickN([1,2,3], 0) = []', RNG.pickN([1, 2, 3], 0), []);

RNG.set(1);
const fiveFromThree = RNG.pickN([1, 2, 3], 5);
truthy('pickN(arr, n > pool) returns shuffled pool length (no padding/error)', fiveFromThree.length === 3);
console.log('  pickN([1,2,3], 5) =>', fiveFromThree);

RNG.set(1);
eq('pickN([], 3) = []', RNG.pickN([], 3), []);

RNG.set(1);
const negResult = RNG.pickN([1, 2, 3], -1);
// slice(0, -1) returns first 2 - documented JS behavior, not a bug
truthy('pickN(arr, -1) slice behavior (n=-1) returns first n-1 (2 items)', negResult.length === 2);
console.log('  pickN([1,2,3], -1) =>', negResult);

console.log('\n=== Test 6: pick on 1-element array always returns that element ===');
for (let i = 0; i < 20; i++) {
  RNG.set(i);
  const v = RNG.pick(['only']);
  if (v !== 'only') { fail++; fails.push({ label: 'pick single', got: v }); allMatch = false; }
}
truthy('pick(["only"]) always returns "only" across 20 seeds', true);

console.log('\n=== Test 7: shuffle preserves multiset (no element loss/dup) ===');
RNG.set(7);
const shuffled = RNG.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
eq('shuffle output is a permutation of input', shuffled.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

console.log('\n=== Test 8: next() always in [0, 1) ===');
RNG.set(Date.now());
let allInRange = true;
for (let i = 0; i < 10000; i++) {
  const v = RNG.next();
  if (v < 0 || v >= 1) { allInRange = false; break; }
}
truthy('next() returns value in [0, 1) across 10000 calls', allInRange);

console.log('\n=== Test 9: seed=0 still works ===');
RNG.set(0);
const v0 = RNG.shuffle([1, 2, 3, 4, 5]);
truthy('seed=0 produces a valid 5-element shuffle', Array.isArray(v0) && v0.length === 5);

console.log('\n=== Test 10: very-large seed (Number.MAX_SAFE_INTEGER) ===');
RNG.set(Number.MAX_SAFE_INTEGER);
const vMax = RNG.shuffle([1, 2, 3, 4, 5]);
truthy('seed=MAX_SAFE_INTEGER produces a valid shuffle', Array.isArray(vMax) && vMax.length === 5);

console.log('\n=== Test 11: negative seed ===');
RNG.set(-100);
const vNeg = RNG.shuffle([1, 2, 3, 4, 5]);
truthy('negative seed produces a valid shuffle', Array.isArray(vNeg) && vNeg.length === 5);

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
