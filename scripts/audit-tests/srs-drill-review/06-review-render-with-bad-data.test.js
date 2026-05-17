// 06-review-render-with-bad-data.test.js
// Wrongbook.countSuspect / cleanupSuspect / listSuspectQids 對 PR #16 之前舊 entries 的處理
// 以及 Review.start 對缺 userText/correctText 的 fallback
const { makeSandbox, loadStorage, loadWrongbook, loadErrorReports, loadReview,
        makeAssert } = require('./_helpers');
const vm = require('vm');

console.log('=== Review with bad/legacy data tests ===');
const A = makeAssert();

function setup(QUESTIONS) {
  const sb = makeSandbox({ QUESTIONS });
  loadStorage(sb);
  loadWrongbook(sb);
  loadErrorReports(sb);
  // Inject view-review
  sb.document.__inject('view-review');
  return sb;
}

// ----- 1. countSuspect: PR #16 之前 entry (correctChoice='') -----
console.log('\n[1] countSuspect detects PR#16-era bug entries');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  // 直接寫入 legacy entries
  Wrongbook.save([
    { qid: 'q_clean', correctChoice: 'A', mastered: false, wrongCount: 1 },
    { qid: 'q_empty_cc', correctChoice: '', mastered: false, wrongCount: 1 },
    { qid: 'q_null_cc', correctChoice: null, mastered: false, wrongCount: 1 },
    { qid: 'q_undef_str', correctChoice: 'undefined', mastered: false, wrongCount: 1 },
    { qid: 'q_mastered_bad', correctChoice: '', mastered: true, wrongCount: 1 }, // mastered 保留
  ]);
  A.eq(Wrongbook.countSuspect(), 3, '3 suspect entries (excluding mastered)');
}

// ----- 2. cleanupSuspect 清掉 -----
console.log('\n[2] cleanupSuspect removes bad entries');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'q_good', correctChoice: 'A', mastered: false },
    { qid: 'q_bad1', correctChoice: '', mastered: false },
    { qid: 'q_bad2', correctChoice: null, mastered: false },
  ]);
  const removed = Wrongbook.cleanupSuspect();
  A.eq(removed, 2, 'cleanupSuspect: 2 removed');
  A.eq(Wrongbook.load().length, 1, '1 entry remains');
  A.eq(Wrongbook.load()[0].qid, 'q_good', 'q_good preserved');
}

// ----- 3. listSuspectQids -----
console.log('\n[3] listSuspectQids returns qids');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'q1', correctChoice: '', mastered: false },
    { qid: 'q2', correctChoice: null, mastered: false },
    { qid: 'q3', correctChoice: 'C', mastered: false },
    { qid: 'q4', correctChoice: '', mastered: true }, // mastered 不算 suspect
  ]);
  const ids = Wrongbook.listSuspectQids();
  A.eq(ids.sort(), ['q1', 'q2'], 'q1+q2 are suspect (mastered ones excluded)');
}

// ----- 4. Review.start 對缺 userText 的 fallback -----
console.log('\n[4] Review.start with missing userText/correctText');
{
  const sb = setup([{ id: 'q_legacy', stem: 'Legacy question', knowledge_code: 'L1' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'q_legacy', nodeId: 'N1', userChoice: 'A', correctChoice: 'B',
      userText: '', correctText: '', wrongCount: 2, mastered: false }
  ]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(html.includes('q_legacy'), 'q_legacy rendered');
  A.ok(html.includes('舊紀錄無文字'), 'fallback "舊紀錄無文字" shown');
  A.ok(html.includes('Legacy question'), 'stem preview shown');
}

// ----- 5. Review.start 完整 entry → 顯示 userText/correctText -----
console.log('\n[5] Review.start with full entry');
{
  const sb = setup([{ id: 'q_full', stem: 'Full question', knowledge_code: 'L2' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'q_full', userChoice: 'A', correctChoice: 'B',
      userText: 'wrong answer text', correctText: 'right answer text',
      wrongCount: 1, mastered: false }
  ]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(html.includes('wrong answer text'), 'userText rendered');
  A.ok(html.includes('right answer text'), 'correctText rendered');
  A.ok(!html.includes('舊紀錄無文字'), 'no fallback shown for complete entry');
}

// ----- 6. Review.start 題庫已刪 → 跳過 (return '') -----
console.log('\n[6] Review.start: q already deleted from QUESTIONS');
{
  const sb = setup([]); // 空題庫
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'ghost', userChoice: 'A', correctChoice: 'B', wrongCount: 1, mastered: false }
  ]);
  const Review = loadReview(sb);
  A.nothrow(() => Review.start(), 'deleted q no throw');
  const html = sb.document.getElementById('view-review').innerHTML;
  // 顯示為空(因 .map 內 if !q return '')→ 但外層 .card 仍存在
  A.ok(html.includes('1 題待復習'), '1 題待復習 header still shown (count from wrongbook)');
}

// ----- 7. Review.start 空 wrongbook → 顯示鼓勵 -----
console.log('\n[7] Review.start: empty wrongbook');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(html.includes('沒有未復習') || html.includes('🎉'), 'empty state message shown');
}

// ----- 8. Review.start 所有 mastered → 顯示空 -----
console.log('\n[8] Review.start: all entries mastered → empty');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'q1', mastered: true, wrongCount: 1 },
    { qid: 'q2', mastered: true, wrongCount: 2 },
  ]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(html.includes('沒有未復習'), 'all-mastered → empty state');
}

// ----- 9. countSuspect 對未 mastered + correctChoice 失效之組合 -----
console.log('\n[9] countSuspect with mixed scenarios');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'a', correctChoice: 'A', mastered: false },      // good
    { qid: 'b', correctChoice: '', mastered: false },       // bad
    { qid: 'c', correctChoice: undefined, mastered: false },// bad
    { qid: 'd', correctChoice: null, mastered: false },     // bad
    { qid: 'e', correctChoice: 'undefined', mastered: false }, // bad (string "undefined")
    { qid: 'f', correctChoice: '', mastered: true },        // skip (mastered)
  ]);
  A.eq(Wrongbook.countSuspect(), 4, 'b, c, d, e are suspect (f mastered)');
}

// ----- 10. add() 對缺 userText/correctText 用空字串 -----
console.log('\n[10] Wrongbook.add backfills missing text');
{
  const sb = setup([]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.add('q1', 'N1', 'A', 'B'); // 4-arg call (legacy)
  const w = Wrongbook.load();
  A.eq(w[0].userText, '', 'userText defaults to ""');
  A.eq(w[0].correctText, '', 'correctText defaults to ""');
  // 再 add 同 qid 帶 text:補上
  Wrongbook.add('q1', 'N1', 'A', 'B', 'user msg', 'correct msg');
  const w2 = Wrongbook.load();
  A.eq(w2[0].userText, 'user msg', 'userText backfilled');
  A.eq(w2[0].correctText, 'correct msg', 'correctText backfilled');
  A.eq(w2[0].wrongCount, 2, 'wrongCount incremented');
}

process.exit(A.summary('Review with bad data'));
