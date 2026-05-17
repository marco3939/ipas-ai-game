// 04-wrongbook.test.js — Wrongbook 模組深度測試(注意 PR #16/#23 簽名變更)
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');
const WrongbookSrc = sliceConst(src, 'const Wrongbook = {', '// === ErrorReports');

console.log('=== Wrongbook tests ===');
console.log('source length:', WrongbookSrc.length, 'chars');

const A = makeAssert();

function setup() {
  const sb = makeSandbox();
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, WrongbookSrc, 'Wrongbook');
  return sb;
}

// ----- [1] add new entry (6-arg signature) -----
console.log('\n[1] add() new entry');
{
  const sb = setup();
  sb.Wrongbook.add('q1', 'node-A', 'B', 'C', '錯選項文字', '正解文字');
  const w = sb.Wrongbook.load();
  A.eq(w.length, 1, 'add → load len=1');
  const e = w[0];
  A.eq(e.qid, 'q1', 'qid');
  A.eq(e.nodeId, 'node-A', 'nodeId');
  A.eq(e.userChoice, 'B', 'userChoice');
  A.eq(e.correctChoice, 'C', 'correctChoice');
  A.eq(e.userText, '錯選項文字', 'userText');
  A.eq(e.correctText, '正解文字', 'correctText');
  A.eq(e.wrongCount, 1, 'wrongCount=1');
  A.eq(e.mastered, false, 'mastered=false');
  A.eq(e.drillCount, 0, 'drillCount=0');
}

// ----- [2] add same qid → wrongCount++ -----
console.log('\n[2] add() same qid increments wrongCount');
{
  const sb = setup();
  sb.Wrongbook.add('q1', 'A', 'B', 'C', 'x', 'y');
  sb.Wrongbook.add('q1', 'A', 'D', 'C', 'z', 'y');
  sb.Wrongbook.add('q1', 'A', 'B', 'C', '', 'y'); // 3rd
  const w = sb.Wrongbook.load();
  A.eq(w.length, 1, 'still 1 entry');
  A.eq(w[0].wrongCount, 3, 'wrongCount=3');
  A.eq(w[0].userChoice, 'B', 'userChoice = last non-empty (was D then B)');
  // 補上 text 邏輯:首次有 text,後續若舊有 text 則不覆蓋
  A.eq(w[0].userText, 'x', 'userText preserved from first');
}

// ----- [3] add with missing args (PR #16/#23 backward compat) -----
console.log('\n[3] add() backward compat — 4-arg call');
{
  const sb = setup();
  sb.Wrongbook.add('q2', 'B', 'A', 'B');  // no userText/correctText
  const e = sb.Wrongbook.load()[0];
  A.eq(e.userText, '', 'userText defaults to ""');
  A.eq(e.correctText, '', 'correctText defaults to ""');
  A.eq(e.qid, 'q2', 'qid set');
}

// ----- [4] add with empty correctChoice (案例 10 lineup-key bug 樣本) -----
console.log('\n[4] add() with empty correctChoice → suspect');
{
  const sb = setup();
  sb.Wrongbook.add('q-bug', 'X', 'A', '', '', '');  // lineup-key bug 症狀
  const susp = sb.Wrongbook.countSuspect();
  A.eq(susp, 1, 'countSuspect=1 (empty correctChoice flagged)');
  const list = sb.Wrongbook.listSuspectQids();
  A.eq(list, ['q-bug'], 'listSuspectQids returns the qid');
}

// ----- [5] cleanupSuspect removes empty-correctChoice -----
console.log('\n[5] cleanupSuspect()');
{
  const sb = setup();
  sb.Wrongbook.add('q-good', 'A', 'B', 'C', 'x', 'y');
  sb.Wrongbook.add('q-bug1', 'A', 'B', '', '', '');
  sb.Wrongbook.add('q-bug2', 'A', 'B', null, '', '');
  sb.Wrongbook.add('q-bug3', 'A', 'B', undefined, '', '');
  sb.Wrongbook.add('q-bug4', 'A', 'B', 'undefined', '', ''); // string 'undefined'
  A.eq(sb.Wrongbook.load().length, 5, 'pre-cleanup 5 entries');
  const removed = sb.Wrongbook.cleanupSuspect();
  A.eq(removed, 4, 'removed 4 suspects');
  A.eq(sb.Wrongbook.load().length, 1, 'post-cleanup 1 entry');
  A.eq(sb.Wrongbook.load()[0].qid, 'q-good', 'good entry preserved');
}

// ----- [6] cleanupSuspect preserves mastered -----
console.log('\n[6] cleanupSuspect preserves mastered');
{
  const sb = setup();
  sb.Wrongbook.add('q-bad-but-mastered', 'A', 'B', '', '', '');
  sb.Wrongbook.markMastered('q-bad-but-mastered');
  const removed = sb.Wrongbook.cleanupSuspect();
  A.eq(removed, 0, 'no removal (mastered preserved)');
  A.eq(sb.Wrongbook.load().length, 1, 'entry preserved');
}

// ----- [7] markMastered -----
console.log('\n[7] markMastered');
{
  const sb = setup();
  sb.Wrongbook.add('q1', 'A', 'B', 'C', 'x', 'y');
  sb.Wrongbook.add('q2', 'A', 'B', 'C', 'x', 'y');
  sb.Wrongbook.markMastered('q1');
  const w = sb.Wrongbook.load();
  A.eq(w.find(e => e.qid === 'q1').mastered, true, 'q1 mastered');
  A.eq(w.find(e => e.qid === 'q2').mastered, false, 'q2 not mastered');
}

// ----- [8] count() excludes mastered -----
console.log('\n[8] count() excludes mastered');
{
  const sb = setup();
  sb.Wrongbook.add('a', 'n', 'B', 'C', '', '');
  sb.Wrongbook.add('b', 'n', 'B', 'C', '', '');
  sb.Wrongbook.add('c', 'n', 'B', 'C', '', '');
  sb.Wrongbook.markMastered('b');
  A.eq(sb.Wrongbook.count(), 2, 'count()=2 (3 total, 1 mastered)');
}

// ----- [9] markMastered nonexistent qid no-op -----
console.log('\n[9] markMastered nonexistent');
{
  const sb = setup();
  sb.Wrongbook.add('a', 'n', 'B', 'C', '', '');
  A.nothrow(() => sb.Wrongbook.markMastered('nonexistent'), 'no throw');
  A.eq(sb.Wrongbook.load().length, 1, 'still 1');
}

// ----- [10] wrongCount overflow 防護(PR #28 A-MED1 修補)-----
console.log('\n[10] wrongCount overflow — PR #28 A-MED1 fix');
{
  const sb = setup();
  // 攻擊面:直接寫入巨大 wrongCount
  sb.Storage.set(sb.Storage.K_WRONGBOOK, [{
    qid: 'evil', nodeId:'n', userChoice:'A', correctChoice:'B',
    userText:'', correctText:'',
    wrongCount: Number.MAX_VALUE - 1,
    addedAt: Date.now(), lastWrong: Date.now(),
    mastered: false, drillCount: 0
  }]);
  sb.Wrongbook.add('evil', 'n', 'A', 'B', '', '');
  const e = sb.Wrongbook.load().find(x => x.qid === 'evil');
  A.eq(e.wrongCount, 99999, `✅ PR #28 fix: 從 Number.MAX_VALUE 被 clamp 到 99999(${e.wrongCount})`);
  // 再多 add 100 次,確認 cap 不漲
  for (let i = 0; i < 100; i++) sb.Wrongbook.add('evil', 'n', 'A', 'B', '', '');
  const e2 = sb.Wrongbook.load().find(x => x.qid === 'evil');
  A.eq(e2.wrongCount, 99999, `✅ 上限穩定:多次 add 後仍 99999(${e2.wrongCount})`);
}

// ----- [11] BUG TEST: XSS via userText (stored, escaping must be downstream) -----
console.log('\n[11] XSS payload in userText (stored as-is)');
{
  const sb = setup();
  const evil = '<script>alert(1)</script>';
  sb.Wrongbook.add('xss-q', 'n', 'A', 'B', evil, '正解');
  const e = sb.Wrongbook.load()[0];
  // Wrongbook 本身不做 escape — UI render 時要負責 escape
  A.eq(e.userText, evil, 'XSS stored as-is (escape must happen at render time)');
  A.ok(true, '⚠️ caller responsibility: UI 必須 escapeHTML at render time');
}

// ----- [12] add with __proto__ as qid -----
console.log('\n[12] __proto__ as qid');
{
  const sb = setup();
  sb.Wrongbook.add('__proto__', 'n', 'A', 'B', '', '');
  // 是否污染 Object.prototype.qid?
  const tester = {};
  A.ok(tester.qid === undefined, 'Object.prototype.qid not polluted');
  // 是否能 find 回來?
  const e = sb.Wrongbook.load().find(x => x.qid === '__proto__');
  A.ok(e, '__proto__ qid stored as normal string');
}

// ----- [13] large entries (1000) -----
console.log('\n[13] 1000 entries performance');
{
  const sb = setup();
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) {
    sb.Wrongbook.add('q'+i, 'n', 'A', 'B', '錯', '對');
  }
  const dt = Date.now() - t0;
  A.eq(sb.Wrongbook.load().length, 1000, '1000 entries stored');
  A.eq(sb.Wrongbook.count(), 1000, '1000 not mastered');
  A.ok(dt < 30000, `1000 adds took ${dt}ms (<30000ms)`);
}

// ----- [14] caller signature audit (案例 10 wrongbook-callers grep) -----
console.log('\n[14] signature compatibility');
{
  const sb = setup();
  // 3-arg call(舊 caller 不傳 correctChoice 等):會傳 undefined → countSuspect 1
  sb.Wrongbook.add('legacy', 'n', 'B');
  // correctChoice = undefined → suspect
  A.eq(sb.Wrongbook.countSuspect(), 1, '3-arg call → suspect (correctChoice=undefined)');
}

// ----- [15] PR #16/#23: text fields update logic -----
console.log('\n[15] text fields backfill logic');
{
  const sb = setup();
  // 第一次:沒傳 text
  sb.Wrongbook.add('q', 'n', 'A', 'B');
  let e = sb.Wrongbook.load()[0];
  A.eq(e.userText, '', 'first add — userText empty');
  // 第二次:傳 text → 補上
  sb.Wrongbook.add('q', 'n', 'A', 'B', '新 user', '新 correct');
  e = sb.Wrongbook.load()[0];
  A.eq(e.userText, '新 user', 'second add — userText backfilled');
  A.eq(e.correctText, '新 correct', 'second add — correctText backfilled');
  // 第三次:傳 text → 不覆蓋(舊已有)
  sb.Wrongbook.add('q', 'n', 'A', 'B', '更新 user', '更新 correct');
  e = sb.Wrongbook.load()[0];
  A.eq(e.userText, '新 user', '⚠️ existing userText NOT overwritten (backfill-once)');
  A.eq(e.correctText, '新 correct', '⚠️ existing correctText NOT overwritten');
}

// ----- [16] cleanupSuspect on empty wrongbook -----
console.log('\n[16] cleanupSuspect empty');
{
  const sb = setup();
  const r = sb.Wrongbook.cleanupSuspect();
  A.eq(r, 0, 'empty wrongbook → removed=0');
}

// ----- [17] listSuspectQids dry-run no mutation -----
console.log('\n[17] listSuspectQids no mutation');
{
  const sb = setup();
  sb.Wrongbook.add('a', 'n', 'A', '', '', '');
  sb.Wrongbook.add('b', 'n', 'A', '', '', '');
  const list1 = sb.Wrongbook.listSuspectQids();
  const list2 = sb.Wrongbook.listSuspectQids();
  A.eq(list1, list2, 'idempotent listing');
  A.eq(sb.Wrongbook.load().length, 2, 'no entries removed');
}

process.exit(A.summary('Wrongbook'));
