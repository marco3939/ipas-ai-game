// sandbox-exam-exit-protection.js
// 2026-05-19 — verify source-code level invariants of the exam exit-protection
// mechanism added across index.html / DrillSession / SM2 / mode1~8.
//
// Spec being verified:
//   - index.html declares window._examInProgress + window._examLabel flags
//   - index.html defines _setExamMode(active, label) function
//   - index.html renders the right-top home button with id "global-home-btn"
//   - goHome() reads window._examInProgress and prompts confirm() before exit
//   - Each mode file calls _setExamMode(true, ...) when entering battle and
//     _setExamMode(false) when finalizing / exiting
//   - DrillSession.start sets exam mode when depth === 0
//   - DrillSession.next clears exam mode (depth === 0) before completion callback
//   - mode7._finalize calls _setExamMode(false) (lenient: post-result page is free)
//
// This sandbox is a source-text regex check; runtime behavior is covered by
// scripts/audit-tests/mode5-8/mode7/21-exam-exit-confirm.test.js.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'src/index.html');
const MODES_DIR = path.join(ROOT, 'src/modes');
const SM2_PATH = path.join(ROOT, 'src/sm2.js');

let pass = 0, fail = 0;
const assert = (cond, label) => {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
};

function read(p) { return fs.readFileSync(p, 'utf8'); }

function countMatches(src, re) {
  const m = src.match(re);
  return m ? m.length : 0;
}

console.log('=== T1: index.html — flag + helper + button declaration ===');
const indexSrc = read(INDEX_PATH);

assert(
  /window\._examInProgress\s*=\s*false/.test(indexSrc),
  'index.html declares window._examInProgress = false'
);
assert(
  /window\._examLabel\s*=\s*['"]/.test(indexSrc),
  'index.html declares window._examLabel'
);
assert(
  /function\s+_setExamMode\s*\(\s*active\s*,\s*label\s*\)/.test(indexSrc),
  'index.html defines function _setExamMode(active, label)'
);
assert(
  /window\._setExamMode\s*=\s*_setExamMode/.test(indexSrc),
  'index.html exposes window._setExamMode'
);
assert(
  /id\s*=\s*["']global-home-btn["']/.test(indexSrc),
  'index.html renders #global-home-btn (right-top home button)'
);

console.log('\n=== T2: index.html — goHome() guards _examInProgress with confirm ===');
// Locate goHome and inspect first ~30 lines
const goHomeIdx = indexSrc.indexOf('function goHome()');
assert(goHomeIdx >= 0, 'index.html defines function goHome()');
if (goHomeIdx >= 0) {
  const goHomeBody = indexSrc.slice(goHomeIdx, goHomeIdx + 800);
  assert(
    /window\._examInProgress/.test(goHomeBody),
    'goHome() reads window._examInProgress'
  );
  assert(
    /\bconfirm\s*\(/.test(goHomeBody),
    'goHome() invokes confirm() to ask before exit'
  );
  assert(
    /_setExamMode\s*\(\s*false/.test(goHomeBody),
    'goHome() clears exam mode (_setExamMode(false)) after confirm accepted'
  );
}

console.log('\n=== T3: each mode + sm2 calls _setExamMode(true) ≥ 1 and (false) ≥ 1 ===');
const modeFiles = [
  ...['mode1','mode2','mode3','mode4','mode5','mode6','mode7','mode8'].map(n => ({
    name: n,
    path: path.join(MODES_DIR, n + '.js'),
  })),
  { name: 'sm2', path: SM2_PATH },
];

for (const mf of modeFiles) {
  let src;
  try { src = read(mf.path); }
  catch { src = ''; }
  const tCount = countMatches(src, /_setExamMode\s*\(\s*true\b/g);
  const fCount = countMatches(src, /_setExamMode\s*\(\s*false\b/g);
  assert(tCount >= 1, `${mf.name}: _setExamMode(true, ...) called ≥ 1 time (got ${tCount})`);
  assert(fCount >= 1, `${mf.name}: _setExamMode(false) called ≥ 1 time (got ${fCount})`);
}

console.log('\n=== T4: DrillSession.start sets exam mode when depth === 0 ===');
// find the body of `start(...)` belonging to DrillSession (look for window.DrillSession definition area)
const drillStartRe = /start\s*\(\s*nodeId\s*,\s*questions[^)]*\)\s*\{[\s\S]{0,3000}?\n\s{2,6}\},/;
const drillStartMatch = indexSrc.match(drillStartRe);
assert(drillStartMatch, 'DrillSession.start(nodeId, questions, ...) function located');
if (drillStartMatch) {
  const body = drillStartMatch[0];
  assert(
    /_setExamMode\s*\(\s*true[^)]*\)/.test(body) && /this\.depth\s*===\s*0/.test(body),
    'DrillSession.start: _setExamMode(true, ...) gated by depth===0'
  );
}

console.log('\n=== T5: DrillSession.next clears exam mode on completion ===');
// find DrillSession definition then locate next() within it
const drillBlockIdx = indexSrc.indexOf('const DrillSession = {');
assert(drillBlockIdx >= 0, 'DrillSession block located');
if (drillBlockIdx >= 0) {
  const drillBlock = indexSrc.slice(drillBlockIdx, drillBlockIdx + 8000);
  // Search for next() {  body within DrillSession scope (after start() block)
  const nextLocalIdx = drillBlock.indexOf('next() {');
  assert(nextLocalIdx >= 0, 'DrillSession.next() function located inside DrillSession');
  if (nextLocalIdx >= 0) {
    const body = drillBlock.slice(nextLocalIdx, nextLocalIdx + 3000);
    assert(
      /_setExamMode\s*\(\s*false\s*\)/.test(body),
      'DrillSession.next: _setExamMode(false) called before onComplete'
    );
    assert(
      /this\.depth\s*===\s*0/.test(body),
      'DrillSession.next: depth===0 gating present (only top-level drill clears flag)'
    );
  }
}

console.log('\n=== T6: mode7._finalize calls _setExamMode(false) ===');
const mode7Src = read(path.join(MODES_DIR, 'mode7.js'));
const finalizeIdx = mode7Src.indexOf('_finalize(reason)');
assert(finalizeIdx >= 0, 'mode7.js defines _finalize(reason)');
if (finalizeIdx >= 0) {
  // grab next ~30 lines
  const body = mode7Src.slice(finalizeIdx, finalizeIdx + 1200);
  assert(
    /_setExamMode\s*\(\s*false\s*\)/.test(body),
    'mode7._finalize body contains _setExamMode(false) (lenient: post-result page is free)'
  );
}

console.log('\n=== SUMMARY ===');
console.log('PASS: ' + pass);
console.log('FAIL: ' + fail);
process.exit(fail === 0 ? 0 : 1);
