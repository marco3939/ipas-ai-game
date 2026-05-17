// 08-errorreports-add.test.js — ErrorReports.add / get / list / count / top
const { makeSandbox, loadStorage, loadWrongbook, loadErrorReports, makeAssert } = require('./_helpers');
const vm = require('vm');

console.log('=== ErrorReports.add tests ===');
const A = makeAssert();

function setup() {
  const sb = makeSandbox();
  loadStorage(sb);
  loadWrongbook(sb);
  loadErrorReports(sb);
  return sb;
}

// ----- 1. 基本 add 流程 -----
console.log('\n[1] basic add');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', ['wrong_answer'], 'has a typo');
  const r = ER.get('q1');
  A.ok(r, 'q1 added');
  A.eq(r.types, ['wrong_answer'], 'types stored');
  A.eq(r.note, 'has a typo', 'note stored');
  A.eq(r.report_count, 1, 'report_count=1');
  A.ok(typeof r.ts === 'number', 'ts is number');
}

// ----- 2. 連續 add 同 qid → 累加 report_count -----
console.log('\n[2] repeated add increments report_count');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', ['wrong_answer'], 'first');
  // 等 1000ms+ (mock 用 stamp 替代 — 我們直接修改 ts)
  const reports = ER.load();
  reports[0].ts -= 2000; // 假裝是 2 秒前
  ER.save(reports);
  ER.add('q1', ['out_of_scope'], 'second');
  const r = ER.get('q1');
  A.eq(r.report_count, 2, 'report_count=2 after second add');
  A.eq(r.note, 'second', 'note updated');
  A.eq(r.types, ['out_of_scope'], 'types replaced');
}

// ----- 3. 防雙擊(1s 內視為同次)-----
console.log('\n[3] double-click protection (1s window)');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', ['wrong_answer'], 'first');
  ER.add('q1', ['wrong_answer'], 'click_again_fast');
  const r = ER.get('q1');
  A.eq(r.report_count, 1, 'double-click within 1s ignored');
  A.eq(r.note, 'first', 'note unchanged after fast double-click');
}

// ----- 4. types 與 note 同時為空 → 拒絕 -----
console.log('\n[4] empty types & note → reject');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', [], '');
  A.eq(ER.count(), 0, 'no report saved');
  ER.add('q1', null, null);
  A.eq(ER.count(), 0, 'still no report');
}

// ----- 5. qid 為空 → 拒絕 -----
console.log('\n[5] empty qid → reject');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('', ['wrong_answer'], 'note');
  ER.add(null, ['wrong_answer'], 'note');
  ER.add(undefined, ['wrong_answer'], 'note');
  A.eq(ER.count(), 0, 'no report with empty qid');
}

// ----- 6. types=[] 且有 note → 自動填 'other' -----
console.log('\n[6] only note, no types → defaults to ["other"]');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', [], 'just a note');
  const r = ER.get('q1');
  A.ok(r, 'q1 saved');
  A.eq(r.types, ['other'], 'types defaulted to ["other"]');
}

// ----- 7. context 物件儲存 -----
console.log('\n[7] context object stored');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', ['wrong_answer'], 'n', {
    stem_excerpt: 'What is X?',
    correct_choice: 'B',
    rendered_options: ['A. foo', 'B. bar'],
  });
  const r = ER.get('q1');
  A.eq(r.context.stem_excerpt, 'What is X?', 'context.stem_excerpt');
  A.eq(r.context.correct_choice, 'B', 'context.correct_choice');
  A.eq(r.context.rendered_options.length, 2, 'rendered_options length');
}

// ----- 8. count / list -----
console.log('\n[8] count / list');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('a', ['wrong_answer'], 'n1');
  ER.add('b', ['wrong_answer'], 'n2');
  ER.add('c', ['wrong_answer'], 'n3');
  A.eq(ER.count(), 3, 'count=3');
  A.eq(ER.list().length, 3, 'list length=3');
}

// ----- 9. top(n) 結合 Wrongbook score -----
console.log('\n[9] top() ranking by reportCount*2 + wrongCount');
{
  const sb = setup();
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  const ER = vm.runInContext('ErrorReports', sb);

  // q1: 5 wrongCount + 0 reports → score=5
  Wrongbook.save([
    { qid: 'q1', wrongCount: 5, mastered: false },
    { qid: 'q2', wrongCount: 2, mastered: false },
    { qid: 'q3', wrongCount: 1, mastered: false },
  ]);
  // q2: 2 wrongCount + 3 reports*2=6 → score=8 (top)
  ER.add('q2', ['wrong_answer'], 'n1');
  const r = ER.load();
  r[0].report_count = 3;
  ER.save(r);

  const top = ER.top(5);
  A.ok(top.length >= 2, `top returned ${top.length} items`);
  A.eq(top[0].qid, 'q2', 'q2 is #1 (score 8)');
  A.eq(top[0].score, 8, 'score=8 for q2');
}

// ----- 10. 攻擊:types 含巨型陣列 -----
console.log('\n[10] attack: huge types array');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  const huge = new Array(1000).fill('wrong_answer');
  A.nothrow(() => ER.add('q1', huge, 'note'), 'huge types no throw');
  const r = ER.get('q1');
  A.eq(r.types.length, 1000, 'all 1000 types stored as-is');
}

// ----- 11. note 含 XSS payload — 儲存 raw,顯示時才 escape -----
console.log('\n[11] note with XSS — stored raw');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('q1', ['wrong_answer'], '<script>alert(1)</script>');
  const r = ER.get('q1');
  A.eq(r.note, '<script>alert(1)</script>', 'note stored raw (XSS defense at display layer)');
}

// ----- 12. clear() 用 confirm — sandbox confirm() 預設 true -----
console.log('\n[12] clear() removes all');
{
  const sb = setup();
  const ER = vm.runInContext('ErrorReports', sb);
  ER.add('a', ['wrong_answer'], 'n');
  ER.add('b', ['wrong_answer'], 'n');
  A.eq(ER.count(), 2, '2 before clear');
  ER.clear();
  A.eq(ER.count(), 0, '0 after clear');
}

process.exit(A.summary('ErrorReports.add'));
