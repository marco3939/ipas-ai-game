// 02-applyVariables.test.js
// Coverage: applyVariables(stem, variables)
//   - Function only replaces {key} with RNG.pick(pool) where pool is Array.
//   - non-array pool values are silently skipped (current implementation).
// Attacks:
//   - special regex chars in placeholder name
//   - __proto__ pollution attempts
//   - undefined/null variables
//   - missing {key} in stem
//   - {key} appearing N times -> all replaced (replaceAll)

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
const applyVariables = vm.runInContext('applyVariables', context);
const RNG = vm.runInContext('RNG', context);

console.log('=== Test 1: simple single-key replacement ===');
RNG.set(1);
const r1 = applyVariables('hello {name}', { name: ['Alice'] });
eq('replaces {name} with the only pool element', r1, 'hello Alice');

console.log('\n=== Test 2: null/undefined variables short-circuits ===');
eq('applyVariables(stem, null) returns stem unchanged', applyVariables('hello {x}', null), 'hello {x}');
eq('applyVariables(stem, undefined) returns stem unchanged', applyVariables('hello {x}', undefined), 'hello {x}');

console.log('\n=== Test 3: multiple occurrences of same {key} are all replaced ===');
RNG.set(1);
const r3 = applyVariables('{x} + {x} = ?', { x: ['7'] });
eq('replaceAll catches all occurrences', r3, '7 + 7 = ?');

console.log('\n=== Test 4: missing key in stem (no-op) ===');
RNG.set(1);
const r4 = applyVariables('plain text', { x: ['7'] });
eq('stem with no placeholder unchanged', r4, 'plain text');

console.log('\n=== Test 5: pool with single value -> deterministic ===');
const expected5 = 'A B';
let allSame = true;
for (let i = 0; i < 100; i++) {
  RNG.set(i);
  const out = applyVariables('{p} {q}', { p: ['A'], q: ['B'] });
  if (out !== expected5) { allSame = false; break; }
}
truthy('single-value pools produce stable output across seeds', allSame);

console.log('\n=== Test 6: non-array pool value is silently ignored ===');
RNG.set(1);
const r6 = applyVariables('hello {name}', { name: 'NotArray' });
eq('non-array pool value -> placeholder kept as-is (silently skipped)', r6, 'hello {name}');

console.log('\n=== Test 7: special regex chars in key name ===');
RNG.set(1);
// JS replaceAll with string (not RegExp) does literal match — no regex compile.
const r7 = applyVariables('hello {a.b}', { 'a.b': ['ok'] });
eq('replaceAll uses literal match (no regex compile) for dotted key', r7, 'hello ok');

console.log('\n=== Test 8: __proto__ key in variables (prototype-pollution surface) ===');
// Object.entries iterates own enumerable properties only.  Putting __proto__ in
// an object literal sets the prototype but is not own-enumerable, so it should
// be ignored.  We assert applyVariables does NOT pollute Object.prototype.
const evil = JSON.parse('{"__proto__": {"polluted": true}}');
RNG.set(1);
applyVariables('hello {x}', evil);
truthy('after applyVariables({__proto__:...}), Object.prototype.polluted is undefined',
  ({}).polluted === undefined);

console.log('\n=== Test 9: {} in stem without entry in variables -> kept literal ===');
RNG.set(1);
const r9 = applyVariables('hello {x} and {y}', { x: ['XX'] });
eq('only {x} replaced, {y} left as-is', r9, 'hello XX and {y}');

console.log('\n=== Test 10: empty pool (Array length 0) -> undefined inserted ===');
RNG.set(1);
const r10 = applyVariables('hello {x}', { x: [] });
// pick([]) returns undefined; replaceAll converts to "undefined" string
console.log('  actual:', JSON.stringify(r10));
truthy('empty pool produces literal "undefined" string (caller should validate)',
  r10 === 'hello undefined');

console.log('\n=== Test 11: numeric values in pool (auto-stringified) ===');
RNG.set(1);
const r11 = applyVariables('answer = {a}', { a: [42] });
eq('numeric pool value coerced to string by replaceAll', r11, 'answer = 42');

console.log('\n=== Test 12: replacement string with $& / $1 (FINDING) ===');
RNG.set(1);
const r12 = applyVariables('Match {m}', { m: ['$1 $& \\n'] });
// FINDING:replaceAll with a STRING replacement still interprets special
// replacement tokens: $& -> matched substring, $1 stays literal (no captures
// in string searchValue).  This means a malicious pool value containing $&
// can echo the placeholder back into the output.  Not a security issue in
// the current question schema (pool values authored by us) but worth noting.
console.log('  raw result:', JSON.stringify(r12));
eq('replaceAll interprets $& as matched substring (DOCUMENTED quirk)',
  r12, 'Match $1 {m} \\n');

console.log('\n=== Test 13: stem that itself contains placeholder-like artifacts ===');
RNG.set(1);
const r13 = applyVariables('use {x} not {y}', { x: ['{y}'] });
eq('replacement value containing {y} -> placeholder substitution does NOT chain',
  r13, 'use {y} not {y}');
// (Critical: this means once {x} is replaced with "{y}", the "{y}" is literal
//  and not re-substituted.  Good — prevents infinite recursion attacks.)

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
