// 02-progress.test.js — Progress 模組深度測試
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
// Progress 段含 K_PROGRESS,但需要 Storage 同時存在
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');
const ProgressSrc = sliceConst(src, 'const Progress = {', '// === Mastery');

console.log('=== Progress tests ===');
console.log('source length:', ProgressSrc.length, 'chars');

const A = makeAssert();

function setup() {
  const sb = makeSandbox();
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, ProgressSrc, 'Progress');
  return sb;
}

// ----- [1] init creates default -----
console.log('\n[1] init() creates default record');
{
  const sb = setup();
  sb.Progress.init();
  const p = sb.Storage.get(sb.Storage.K_PROGRESS, null);
  A.ok(p && typeof p.started === 'number', 'init writes started timestamp');
  A.eq(p.sessions, 0, 'init sessions=0');
  A.eq(p.totalAnswered, 0, 'init totalAnswered=0');
  A.eq(p.totalCorrect, 0, 'init totalCorrect=0');
}

// ----- [2] init idempotent -----
console.log('\n[2] init() idempotent');
{
  const sb = setup();
  sb.Progress.init();
  const t1 = sb.Storage.get(sb.Storage.K_PROGRESS).started;
  // sleep tiny
  const t0 = Date.now(); while (Date.now() - t0 < 2) {}
  sb.Progress.init();
  const t2 = sb.Storage.get(sb.Storage.K_PROGRESS).started;
  A.eq(t1, t2, 'init twice — started unchanged');
}

// ----- [3] daysLeft non-negative -----
console.log('\n[3] daysLeft never negative');
{
  const sb = setup();
  const d = sb.Progress.daysLeft();
  A.ok(typeof d === 'number' && d >= 0, `daysLeft=${d} non-negative`);
  A.ok(d < 100000, `daysLeft=${d} sane bound`);
}

// ----- [4] addSession increments -----
console.log('\n[4] addSession');
{
  const sb = setup();
  sb.Progress.init();
  for (let i = 0; i < 5; i++) sb.Progress.addSession();
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  A.eq(p.sessions, 5, 'addSession ×5 → sessions=5');
}

// ----- [5] addAnswer correct/wrong -----
console.log('\n[5] addAnswer');
{
  const sb = setup();
  sb.Progress.init();
  sb.Progress.addAnswer(true);
  sb.Progress.addAnswer(true);
  sb.Progress.addAnswer(false);
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  A.eq(p.totalAnswered, 3, 'totalAnswered=3');
  A.eq(p.totalCorrect, 2, 'totalCorrect=2');
}

// ----- [6] addAnswer without init — auto-creates partial -----
console.log('\n[6] addAnswer without init');
{
  const sb = setup();
  // 沒呼叫 init()
  sb.Progress.addAnswer(true);
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  A.eq(p.totalAnswered, 1, 'addAnswer without init auto-creates');
  A.eq(p.totalCorrect, 1, 'totalCorrect=1 from default');
}

// ----- [7] addAnswer with truthy/falsy non-bool -----
console.log('\n[7] addAnswer with non-bool values');
{
  const sb = setup();
  sb.Progress.init();
  sb.Progress.addAnswer(1);     // truthy
  sb.Progress.addAnswer('yes'); // truthy
  sb.Progress.addAnswer(0);     // falsy
  sb.Progress.addAnswer(null);  // falsy
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  A.eq(p.totalAnswered, 4, 'totalAnswered=4');
  A.eq(p.totalCorrect, 2, 'totalCorrect=2 (truthy 1 + "yes")');
}

// ----- [8] high volume — 10000 answers -----
console.log('\n[8] high volume 10k answers');
{
  const sb = setup();
  sb.Progress.init();
  const t0 = Date.now();
  for (let i = 0; i < 10000; i++) sb.Progress.addAnswer(i % 2 === 0);
  const dt = Date.now() - t0;
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  A.eq(p.totalAnswered, 10000, '10k addAnswer');
  A.eq(p.totalCorrect, 5000, '10k addAnswer — half correct');
  A.ok(dt < 5000, `10k took ${dt}ms (<5000ms)`);
}

// ----- [9] EXAM_DATE constant -----
console.log('\n[9] EXAM_DATE constant');
{
  const sb = setup();
  A.ok(sb.Progress.EXAM_DATE instanceof Date, 'EXAM_DATE is Date instance');
  A.ok(!isNaN(sb.Progress.EXAM_DATE.getTime()), 'EXAM_DATE valid');
  A.ok(sb.Progress.EXAM_DATE.getFullYear() >= 2026, `EXAM_DATE year ${sb.Progress.EXAM_DATE.getFullYear()} >= 2026`);
}

// ----- [10] race scenario — concurrent addAnswer (sync, but read-modify-write) -----
console.log('\n[10] read-modify-write — interleaved manual');
{
  const sb = setup();
  sb.Progress.init();
  // Simulate "lost update":先讀 p1,再讀 p2,p1 寫,p2 寫 → p1 lost
  // 因為 vm.runInContext sync,我們直接複製做法 verify behavior
  const p1 = sb.Storage.get(sb.Storage.K_PROGRESS);
  const p2 = sb.Storage.get(sb.Storage.K_PROGRESS);
  p1.totalAnswered = (p1.totalAnswered||0) + 1;
  sb.Storage.set(sb.Storage.K_PROGRESS, p1);
  p2.totalAnswered = (p2.totalAnswered||0) + 1;
  sb.Storage.set(sb.Storage.K_PROGRESS, p2);
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  // 二者都讀到 0,各加 1 寫回 1。最後 p2 覆寫,值是 1(不是 2)
  A.eq(p.totalAnswered, 1,
    'concurrent read-modify-write LOST UPDATE confirmed (BUG: race possible if Mode 7 uses parallel writes)');
}

// ----- [11] Storage 配額時 progress 寫入 silently fail -----
console.log('\n[11] addAnswer when storage quota fails');
{
  const sb = makeSandbox({ quotaBytes: 30 });
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, ProgressSrc, 'Progress');
  let toastCount = 0;
  sb.showToast = () => { toastCount++; };
  sb.Progress.init();  // 可能 fail
  for (let i = 0; i < 5; i++) sb.Progress.addAnswer(true);
  // Storage silent fail,Progress 寫入失敗但不 throw
  A.ok(toastCount >= 1, `quota fail toast triggered ≥1 (got ${toastCount})`);
}

process.exit(A.summary('Progress'));
