// scripts/mock-sm2.js
// 自驗 docs/spec-sm2.md §2.3 數值範例
// 模擬瀏覽器執行環境(僅 Storage stub),不依賴 DOM
'use strict';
const fs = require('fs');
const path = require('path');

// === Storage stub(in-memory)===
const _kv = {};
global.Storage = {
  get(key, def) {
    if (key in _kv) return _kv[key];
    return def === undefined ? null : def;
  },
  set(key, val) { _kv[key] = val; },
  del(key) { delete _kv[key]; }
};

// === 載入 sm2.js 到 global ===
const sm2Src = fs.readFileSync(path.join(__dirname, '..', 'src', 'sm2.js'), 'utf8');
// const SM2 = {...}; → 改為 global.SM2 = {...}; 才能讓 eval 後可讀
const sandboxed = sm2Src.replace(/^const SM2 = \{/m, 'global.SM2 = {');
eval(sandboxed);

// === Helper ===
let pass = 0, fail = 0;
function chk(label, expected, actual, eps) {
  const ok = (typeof expected === 'number' && typeof actual === 'number')
    ? Math.abs(expected - actual) < (eps || 1e-9)
    : expected === actual;
  if (ok) {
    pass++;
    console.log(`  PASS: ${label} (got ${actual})`);
  } else {
    fail++;
    console.log(`  FAIL: ${label} (expected ${expected}, got ${actual})`);
  }
}

// === Case 1: {ef:2.5, int:0, rep:0} + grade=5 → {ef:2.6, int:1, rep:1} ===
console.log('Case 1: cold-start correct (grade=5)');
let r = SM2.computeNext({ ef: 2.5, interval: 0, repetition: 0 }, 5);
chk('  ef', 2.6, r.ef, 1e-3);
chk('  interval', 1, r.interval);
chk('  repetition', 1, r.repetition);

// === Case 2: {ef:2.5, int:0, rep:0} + grade=2 → {ef:2.18, int:1, rep:0} ===
console.log('Case 2: cold-start wrong (grade=2)');
r = SM2.computeNext({ ef: 2.5, interval: 0, repetition: 0 }, 2);
chk('  ef', 2.18, r.ef, 1e-3);
chk('  interval', 1, r.interval);
chk('  repetition', 0, r.repetition);

// === Case 3: {ef:2.6, int:1, rep:1} + grade=5 → {ef:2.7, int:6, rep:2} ===
console.log('Case 3: 1st correct → 2nd correct (grade=5)');
r = SM2.computeNext({ ef: 2.6, interval: 1, repetition: 1 }, 5);
chk('  ef', 2.7, r.ef, 1e-3);
chk('  interval', 6, r.interval);
chk('  repetition', 2, r.repetition);

// === Case 4: {ef:2.7, int:6, rep:2} + grade=5 → {ef:2.8, int:round(6*2.7)=16, rep:3} ===
console.log('Case 4: 2nd correct → 3rd correct (grade=5)');
r = SM2.computeNext({ ef: 2.7, interval: 6, repetition: 2 }, 5);
chk('  ef', 2.8, r.ef, 1e-3);
chk('  interval', 16, r.interval);
chk('  repetition', 3, r.repetition);

// === Case 5: {ef:1.3, int:1, rep:0} + grade=2 → {ef:1.3 (hit floor), int:1, rep:0} ===
console.log('Case 5: floor EF (grade=2)');
r = SM2.computeNext({ ef: 1.3, interval: 1, repetition: 0 }, 2);
chk('  ef', 1.3, r.ef, 1e-3);
chk('  interval', 1, r.interval);
chk('  repetition', 0, r.repetition);

// === recordAnswer round-trip(查 Storage 寫入 / 讀回)===
console.log('Round-trip: recordAnswer + getState');
SM2.recordAnswer('q_test_001', true, false);
const s = SM2.getState('q_test_001');
chk('  ef ≈ 2.6', 2.6, s.ef, 1e-3);
chk('  interval', 1, s.interval);
chk('  repetition', 1, s.repetition);

// === Drill grade(viaDrill=true → grade=4)===
console.log('viaDrill grade=4');
SM2.recordAnswer('q_test_drill', true, true);
const sd = SM2.getState('q_test_drill');
// grade=4 → ef = 2.5 + (0.1 - 1*(0.08+1*0.02)) = 2.5 + 0.1 - 0.10 = 2.5
chk('  ef stays 2.5', 2.5, sd.ef, 1e-3);

// === getDueQueue / countDueToday 空 case ===
console.log('Queue empty initially (since lastReview just now → nextDue tomorrow)');
const queue = SM2.getDueQueue(true); // overdueOnly:true
chk('  empty due queue', 0, queue.length);

// === Summary ===
console.log('\n=== SM-2 mock ===');
console.log(`PASS: ${pass}  FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
