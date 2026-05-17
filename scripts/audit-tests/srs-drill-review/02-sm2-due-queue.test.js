// 02-sm2-due-queue.test.js — SM-2 due queue / counts
const { makeSandbox, loadStorage, loadSM2, makeAssert } = require('./_helpers');

console.log('=== SM-2 due queue tests ===');
const A = makeAssert();

const DAY = 86400000;

// helper:直接寫 SM-2 state 進 storage
function seedState(SM2, sb, qid, partial) {
  const all = SM2.load();
  all[qid] = Object.assign(
    { ef: 2.5, interval: 1, repetition: 1, lastReview: Date.now(), nextDue: Date.now() },
    partial
  );
  SM2.save(all);
}

// ----- 1. 空狀態 -----
console.log('\n[1] empty state');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  A.eq(SM2.countDueToday(), 0, 'empty: countDueToday=0');
  A.eq(SM2.totalTracked(), 0, 'empty: totalTracked=0');
  A.eq(SM2.countOverdue(), 0, 'empty: countOverdue=0');
  A.eq(SM2.getDueQueue().length, 0, 'empty: getDueQueue=[]');
}

// ----- 2. 多 qid 按 nextDue 排序 -----
console.log('\n[2] sort by nextDue ascending');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const now = Date.now();
  seedState(SM2, sb, 'q_C', { nextDue: now - 1 * DAY });   // 過期 1 天
  seedState(SM2, sb, 'q_A', { nextDue: now - 3 * DAY });   // 過期 3 天(最舊)
  seedState(SM2, sb, 'q_B', { nextDue: now - 2 * DAY });   // 過期 2 天
  const q = SM2.getDueQueue(true);
  A.eq(q.length, 3, '3 due items');
  A.eq(q.map(x => x.qid), ['q_A', 'q_B', 'q_C'], 'sorted by nextDue ASC');
}

// ----- 3. countDueToday vs countOverdue 邊界 -----
console.log('\n[3] today vs overdue boundary');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const now = Date.now();
  seedState(SM2, sb, 'q_overdue_2d',  { nextDue: now - 2 * DAY });    // overdue
  seedState(SM2, sb, 'q_today',       { nextDue: now - 100 });          // overdue (但剛剛過)
  seedState(SM2, sb, 'q_tomorrow',    { nextDue: now + DAY - 1000 });   // 還沒到
  seedState(SM2, sb, 'q_future',      { nextDue: now + 5 * DAY });      // 還沒到
  A.eq(SM2.countDueToday(), 2, 'overdue=true: 2 already past now');
  // countOverdue 是 nextDue < now - 1 day(嚴格 overdue 1+ days)
  A.eq(SM2.countOverdue(), 1, 'countOverdue: 1 (only > 1 day past)');
}

// ----- 4. getDueQueue(overdueOnly=false) — 包明日內 due -----
console.log('\n[4] getDueQueue(false) includes tomorrow');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const now = Date.now();
  seedState(SM2, sb, 'q_overdue', { nextDue: now - DAY });
  seedState(SM2, sb, 'q_today',   { nextDue: now - 100 });
  seedState(SM2, sb, 'q_tomorrow',{ nextDue: now + DAY - 1000 });
  seedState(SM2, sb, 'q_far',     { nextDue: now + 5 * DAY });
  const q = SM2.getDueQueue(false);
  A.eq(q.length, 3, 'overdueOnly=false: 3 (overdue + today + tomorrow)');
  A.ok(q.map(x => x.qid).includes('q_tomorrow'), 'q_tomorrow included');
  A.ok(!q.map(x => x.qid).includes('q_far'), 'q_far excluded (>1 day out)');
}

// ----- 5. nextDue=0 過濾 -----
console.log('\n[5] nextDue=0 entries skipped');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  seedState(SM2, sb, 'q_uninitialized', { nextDue: 0 });
  seedState(SM2, sb, 'q_due',           { nextDue: Date.now() - 1000 });
  A.eq(SM2.totalTracked(), 2, 'totalTracked counts both');
  A.eq(SM2.countDueToday(), 1, 'countDueToday excludes nextDue=0');
  const q = SM2.getDueQueue(true);
  A.eq(q.map(x => x.qid), ['q_due'], 'queue excludes nextDue=0');
}

// ----- 6. 大量 qid 排序穩定性 -----
console.log('\n[6] 200 qids sort stability');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const now = Date.now();
  // 倒序寫入(q_0199 → q_0000),期望排序後從早→晚
  for (let i = 199; i >= 0; i--) {
    seedState(SM2, sb, `q_${String(i).padStart(4, '0')}`, { nextDue: now - i * 1000 });
  }
  const q = SM2.getDueQueue(true);
  A.eq(q.length, 200, '200 items in queue');
  // 越過去的 → nextDue 越小 → 越前面。i=199 nextDue=now-199000(最舊)
  A.eq(q[0].qid, 'q_0199', 'oldest nextDue first');
  A.eq(q[199].qid, 'q_0000', 'newest nextDue last');
}

// ----- 7. 同 nextDue 不破壞順序 -----
console.log('\n[7] tied nextDue does not throw');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const same = Date.now() - 1000;
  for (let i = 0; i < 5; i++) seedState(SM2, sb, `q_tie_${i}`, { nextDue: same });
  A.nothrow(() => SM2.getDueQueue(true), 'tied nextDue no throw');
  A.eq(SM2.getDueQueue(true).length, 5, '5 tied items all returned');
}

// ----- 8. 反例:state 內含 NaN nextDue -----
console.log('\n[8] attack: NaN nextDue');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  seedState(SM2, sb, 'q_nan', { nextDue: NaN });
  // NaN > 0 false → 應被過濾
  A.eq(SM2.countDueToday(), 0, 'NaN nextDue excluded');
  A.eq(SM2.totalTracked(), 1, 'still tracked in totalTracked');
}

// ----- 9. recordAnswer → queue 增長 -----
console.log('\n[9] recordAnswer → due queue updates');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  SM2.recordAnswer('newQ', false, false); // 答錯 → interval=1 → nextDue=now+1day
  A.eq(SM2.totalTracked(), 1, '1 qid tracked after recordAnswer');
  // 1 天後到期,所以 overdueOnly=true 是 0 / overdueOnly=false 是 1
  A.eq(SM2.countDueToday(), 0, 'fresh fail: not yet due (interval=1)');
  A.eq(SM2.getDueQueue(false).length, 1, 'getDueQueue(false) includes 1-day-out');
}

// ----- 10. queue item shape -----
console.log('\n[10] queue item shape');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  seedState(SM2, sb, 'q1', { nextDue: Date.now() - 1000, ef: 2.7, interval: 6, repetition: 2 });
  const q = SM2.getDueQueue(true);
  A.ok(q[0].qid === 'q1', 'item.qid present');
  A.ok(q[0].state && typeof q[0].state === 'object', 'item.state present');
  A.eq(q[0].state.ef, 2.7, 'state.ef passthrough');
  A.eq(q[0].state.interval, 6, 'state.interval passthrough');
}

process.exit(A.summary('SM2 due queue'));
