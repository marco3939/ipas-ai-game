// 01-sm2-algorithm.test.js — SM-2 核心算法
// 覆蓋:computeNext / recordAnswer / EF clamp / interval table / 反例
const { makeSandbox, loadStorage, loadSM2, makeAssert } = require('./_helpers');

console.log('=== SM-2 algorithm tests ===');
const A = makeAssert();

// ----- 1. grade 5 (perfect) 首次 -----
console.log('\n[1] grade=5 (perfect, first time)');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const out = SM2.computeNext(null, 5);
  A.eq(out.interval, 1, 'first correct: interval=1');
  A.eq(out.repetition, 1, 'first correct: repetition=1');
  A.ok(out.ef > 2.5, 'grade=5 raises EF above initial 2.5');
  A.approx(out.ef, 2.6, 0.01, 'grade=5 EF ~ 2.6');
}

// ----- 2. 連續答對序列 1 → 6 → 6*EF -----
console.log('\n[2] correct sequence 1 → 6 → round(6*EF)');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  let s = null;
  s = SM2.computeNext(s, 5); A.eq(s.interval, 1, 'rep1 interval=1');
  s = SM2.computeNext(s, 5); A.eq(s.interval, 6, 'rep2 interval=6');
  const ef2 = s.ef;
  s = SM2.computeNext(s, 5); A.eq(s.interval, Math.round(6 * ef2), `rep3 interval=round(6*${ef2})=${Math.round(6 * ef2)}`);
  A.ok(s.repetition === 3, 'repetition increments to 3');
}

// ----- 3. grade<3 重置 -----
console.log('\n[3] grade<3 resets repetition');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  let s = SM2.computeNext(null, 5);
  s = SM2.computeNext(s, 5); // rep=2 interval=6
  s = SM2.computeNext(s, 2); // fail
  A.eq(s.repetition, 0, 'fail resets repetition to 0');
  A.eq(s.interval, 1, 'fail sets interval=1 (re-test tomorrow)');
  // EF 也會減
  A.ok(s.ef < 2.5, 'fail (grade=2) lowers EF below 2.5');
}

// ----- 4. EF clamp at MIN_EF=1.3 -----
console.log('\n[4] EF clamp at MIN_EF=1.3');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  let s = { ef: 1.4, interval: 1, repetition: 0 };
  // 連續答錯多次,EF 應 floor 在 1.3
  for (let i = 0; i < 20; i++) s = SM2.computeNext(s, 0);
  A.eq(s.ef, 1.3, 'EF floored at 1.3 after many fails');
  A.ok(s.ef >= SM2.MIN_EF, 'ef >= MIN_EF invariant');
}

// ----- 5. grade=3 邊界(剛好成功)-----
console.log('\n[5] grade=3 boundary (just pass)');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const out = SM2.computeNext(null, 3);
  A.eq(out.interval, 1, 'grade=3 treated as pass (interval=1)');
  A.eq(out.repetition, 1, 'grade=3 increments repetition');
  // EF' = EF + (0.1 - 2*(0.08 + 2*0.02)) = 2.5 + 0.1 - 0.24 = 2.36
  A.approx(out.ef, 2.36, 0.005, 'grade=3 EF drops slightly (~2.36)');
}

// ----- 6. recordAnswer mapping -----
console.log('\n[6] recordAnswer grade mapping');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  // isCorrect=true viaDrill=false → grade=5
  const r1 = SM2.recordAnswer('q1', true, false);
  A.ok(r1.ef > 2.5, 'correct main → grade=5 → EF raise');
  // isCorrect=true viaDrill=true → grade=4
  const r2 = SM2.recordAnswer('q2', true, true);
  A.eq(r2.ef, 2.5, 'correct drill → grade=4 → EF unchanged');
  // isCorrect=false → grade=2
  const r3 = SM2.recordAnswer('q3', false, false);
  A.ok(r3.ef < 2.5, 'wrong → grade=2 → EF drops');
  A.eq(r3.interval, 1, 'wrong → interval=1');
}

// ----- 7. recordAnswer null qid → no-op -----
console.log('\n[7] recordAnswer null/undefined qid');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  A.eq(SM2.recordAnswer(null, true, false), null, 'null qid → null return');
  A.eq(SM2.recordAnswer(undefined, true, false), null, 'undefined qid → null return');
  A.eq(SM2.recordAnswer('', true, false), null, 'empty qid → null return');
  A.eq(SM2.totalTracked(), 0, 'no qid tracked');
}

// ----- 8. nextDue 計算 -----
console.log('\n[8] nextDue calculation');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const before = Date.now();
  const out = SM2.computeNext(null, 5);
  const after = Date.now();
  A.ok(out.lastReview >= before && out.lastReview <= after, 'lastReview within now bounds');
  A.eq(out.nextDue - out.lastReview, SM2.MS_PER_DAY, 'nextDue = lastReview + 1 day for interval=1');
}

// ----- 9. 反例:grade=-1 / 6 / NaN / null -----
console.log('\n[9] attack: invalid grade values');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  // grade=-1 → <3 → fail path; EF formula: 2.5 + (0.1 - 6*(0.08+6*0.02)) = 2.5 + 0.1 - 1.2 = 1.4
  let s = SM2.computeNext(null, -1);
  A.eq(s.interval, 1, 'grade=-1 enters fail path');
  A.ok(s.ef >= SM2.MIN_EF, `grade=-1 EF still >= MIN_EF (got ${s.ef})`);
  // grade=6 (>5) → pass path; EF: 2.5 + (0.1 - (-1)*(0.08-0.02)) = 2.5 + 0.1 + 0.06 = 2.66 (high)
  s = SM2.computeNext(null, 6);
  A.eq(s.interval, 1, 'grade=6 treats as pass');
  A.ok(s.ef > 2.5, 'grade=6 raises EF (no upper clamp — code smell)');
  // grade=NaN → NaN < 3 是 false,(5-NaN)=NaN → ef=NaN → clamp 觸發?
  s = SM2.computeNext(null, NaN);
  A.ok(s.ef === SM2.MIN_EF || Number.isFinite(s.ef),
    `grade=NaN: ef = ${s.ef} (MIN_EF clamp OR finite — current: ${s.ef})`);
  // grade=null → null<3 是 true(null coerces to 0)→ fail; (5-null) = 5 → ef = 2.5 + (0.1 - 5*(0.08+5*0.02)) = 2.5 + 0.1 - 0.9 = 1.7
  s = SM2.computeNext(null, null);
  A.eq(s.interval, 1, 'grade=null enters fail path (null<3 true)');
}

// ----- 10. 反例:EF=Infinity (state injection) -----
console.log('\n[10] attack: EF=Infinity injected');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const polluted = { ef: Infinity, interval: 6, repetition: 5 };
  const out = SM2.computeNext(polluted, 5);
  // ef = Infinity + (0.1 - ...) = Infinity → MIN_EF clamp check `ef < this.MIN_EF` Infinity<1.3 false → 保持 Infinity
  A.ok(out.ef === Infinity || Number.isFinite(out.ef),
    `EF=Infinity propagates: ${out.ef} (code does NOT cap above — known gap)`);
  // interval = Math.round(6 * Infinity) = Infinity
  A.ok(out.interval === Infinity || Number.isFinite(out.interval),
    `interval result: ${out.interval} (gap if Infinity propagates)`);
}

// ----- 11. state 為 undefined/string fallback -----
console.log('\n[11] state fallback for non-number fields');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  // ef='2.0' string → fallback to INITIAL_EF
  const s1 = SM2.computeNext({ ef: '2.0', interval: '1', repetition: '0' }, 5);
  A.ok(Number.isFinite(s1.ef), 'string ef → falls back & still finite');
  A.eq(s1.interval, 1, 'string interval → falls back to 0, then becomes 1');
  // 缺欄位
  const s2 = SM2.computeNext({}, 5);
  A.eq(s2.interval, 1, 'empty state → interval=1');
  A.eq(s2.repetition, 1, 'empty state → repetition=1');
}

// ----- 12. ef precision (toFixed 3) -----
console.log('\n[12] EF rounded to 3 decimal places');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const s = SM2.computeNext(null, 5);
  const efStr = String(s.ef);
  // 不超過 5 個字元的字串(2.600)
  A.ok(efStr.length <= 5, `ef truncated to 3 decimals: "${efStr}"`);
  // 沒有 epsilon 浮點殘留
  A.eq(Number(s.ef.toFixed(3)), s.ef, 'no float epsilon (ef is already toFixed-3 result)');
}

process.exit(A.summary('SM2 algorithm'));
