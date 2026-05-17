// 09 — Mode 3 selectStage:PR #27 BUG-M3-2 修補(非 sequence 題擋住)
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureQuestion, fixtureSequenceQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build(qs) {
  const sb = makeSandbox({ questions: qs });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode3.js'));
  return sb;
}

console.log('=== Mode 3 — selectStage format check ===');

// [1] sequence 題:可正常進入
{
  const sb = build([fixtureSequenceQuestion()]);
  vm.runInContext('Mode3.start();', sb);
  vm.runInContext('Mode3.selectStage("q_pc_seq_001");', sb);
  const st = vm.runInContext('Mode3.state', sb);
  A.ok(st, 'state created for sequence question');
  A.eq(st.q.format, 'sequence', 'q.format = sequence');
  A.ok(st.steps.length >= 2, 'steps parsed correctly');
  A.eq(st.pool.length, st.steps.length, 'pool size = steps');
  A.eq(st.slots.every(s => s === null), true, 'slots initial all null');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [2] BUG-M3-2:非 sequence 題的 id 傳入 → 被擋,state 不改
{
  const mcq = fixtureQuestion({ id: 'q_mcq_001', format: 'mcq' });
  const sq = fixtureSequenceQuestion({ id: 'q_pc_seq_001' });
  const sb = build([mcq, sq]);
  vm.runInContext('Mode3.start();', sb);
  vm.runInContext('Mode3.selectStage("q_mcq_001");', sb);
  const st = vm.runInContext('Mode3.state', sb);
  A.eq(st, null, 'non-sequence question blocked (state null)');
  // calculation, matching 等也應擋
  const calc = fixtureQuestion({ id: 'q_calc', format: 'calculation' });
  const matching = fixtureQuestion({ id: 'q_match', format: 'matching' });
  const sb2 = build([calc, matching, sq]);
  vm.runInContext('Mode3.start();', sb2);
  vm.runInContext('Mode3.selectStage("q_calc");', sb2);
  A.eq(vm.runInContext('Mode3.state', sb2), null, 'calculation blocked');
  vm.runInContext('Mode3.selectStage("q_match");', sb2);
  A.eq(vm.runInContext('Mode3.state', sb2), null, 'matching blocked');
}

// [3] 不存在的 qid → state 不改
{
  const sb = build([fixtureSequenceQuestion()]);
  vm.runInContext('Mode3.start();', sb);
  vm.runInContext('Mode3.selectStage("q_does_not_exist");', sb);
  A.eq(vm.runInContext('Mode3.state', sb), null, 'unknown qid blocked');
}

// [4] sequence 題但只 1 步 → 擋住(無法形成排序)
{
  const oneStep = fixtureSequenceQuestion({
    id: 'q_pc_seq_001',
    options: [
      { text: '只有一步', is_correct: true },
      { text: '其他選項', is_correct: false },
      { text: '其他 B', is_correct: false },
      { text: '其他 C', is_correct: false }
    ]
  });
  const sb = build([oneStep]);
  vm.runInContext('Mode3.start();', sb);
  vm.runInContext('Mode3.selectStage("q_pc_seq_001");', sb);
  A.eq(vm.runInContext('Mode3.state', sb), null, '1-step sequence blocked');
}

// [5] sequence 但 options 無 is_correct 或選項 text 空 → 擋
{
  const noCorrect = fixtureSequenceQuestion({
    id: 'q_pc_seq_001',
    options: [
      { text: 'A->B->C', is_correct: false },
      { text: 'B->C->A', is_correct: false },
      { text: 'C->A->B', is_correct: false },
      { text: 'A->C->B', is_correct: false }
    ]
  });
  const sb = build([noCorrect]);
  vm.runInContext('Mode3.start();', sb);
  vm.runInContext('Mode3.selectStage("q_pc_seq_001");', sb);
  A.eq(vm.runInContext('Mode3.state', sb), null, 'no-correct-option sequence blocked');
}

// [6] 無 sequence 題 → renderStageMenu 顯示 placeholder
{
  const sb = build([]);
  vm.runInContext('Mode3.start();', sb);
  const view = sb.document.getElementById('view-play');
  A.ok(view.innerHTML.includes('找不到 sequence 題目') || view.innerHTML.includes('題庫'), 'placeholder shown when no sequence questions');
}

// [7] HTML escape — sequence 題含 XSS
{
  const xssSeq = fixtureSequenceQuestion({
    id: 'q_pc_seq_001',
    stem: '<script>alert(1)</script>',
    options: [
      { text: '<img src=x onerror=evil()> -> 步驟2 -> 步驟3', is_correct: true },
      { text: '步驟B -> 步驟C -> 步驟D', is_correct: false },
      { text: '步驟C -> 步驟D -> 步驟E', is_correct: false },
      { text: '步驟E -> 步驟F -> 步驟G', is_correct: false }
    ]
  });
  const sb = build([xssSeq]);
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  const view = sb.document.getElementById('view-play');
  A.ok(!view.innerHTML.includes('<script>alert(1)</script>'), 'no raw <script>');
  // onerror= 在 escaped text 內仍會出現,但 < 已被 escape 為 &lt;,不會形成 <img> element
  A.ok(!view.innerHTML.includes('<img src=x'), 'no raw <img tag (escaped to &lt;img)');
  A.ok(view.innerHTML.includes('&lt;img') || view.innerHTML.includes('&lt;script'), 'XSS escaped via &lt;');
  vm.runInContext('Mode3.stopTimer();', sb);
}

// [8] reset progress
{
  const sb = build([fixtureSequenceQuestion()]);
  vm.runInContext('Storage.set("ipas_mode3_progress_v2", { stages: { q_pc_seq_001: { cleared: true } }, totalCleared: 1 });', sb);
  vm.runInContext('Mode3.start();', sb);
  vm.runInContext('Mode3.resetProgress();', sb);
  const p = vm.runInContext('Storage.get("ipas_mode3_progress_v2", null)', sb);
  A.eq(p, null, 'mode3 progress reset to null');
}

process.exit(A.summary('mode3.09.selectStage-format-check'));
