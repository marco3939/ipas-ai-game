// 19-repro-zero-score-bug.test.js — 2026-05-17 使用者回報:50 題模考全答完顯示 0/50
// 重現流程:
//   1. start mock with 50 questions
//   2. user clicks option (correct one) on each question via PlayEngine.answer hook
//   3. user clicks submitCurrent for each (升格 draft → answers + lock)
//   4. submitMock (交卷)
//   5. assert state.correct === 50,result.correct === 50
//
// 若 fail,定位 bug 在哪條路徑
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 ZERO-SCORE BUG REPRO (2026-05-17 使用者回報) ===');
const A = makeAssert();

function setupMode7(n = 50) {
  const questions = [];
  for (let i = 0; i < n + 5; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i % 3}`,
      knowledge_code: i < 20 ? 'L21101' : (i < 40 ? 'L22101' : 'L23101'),
      options: [
        { text: 'correct option ' + i, is_correct: true },
        { text: 'wrong a ' + i, is_correct: false },
        { text: 'wrong b ' + i, is_correct: false },
        { text: 'wrong c ' + i, is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount: n, scope: 'all', difficulty: 'mixed' };
  r.sandbox.confirm = () => true;
  return r;
}

// ----- 1. 真實使用者流程:click option → submitCurrent → next → 50 次 → submitMock -----
console.log('\n[1] 50 題真實流程 — 答對所有題');
{
  const { Mode, sandbox } = setupMode7(50);
  Mode._startBattle();

  for (let i = 0; i < 50; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();   // 模擬 navigation,觸發 _rendered cache
    // 模擬使用者點正確選項(經由 PlayEngine.answer hook,跟真實使用者行為一致)
    const correctKey = Mode.state.lineup[i]._rendered.options.find(o => o.is_correct).key;
    sandbox.PlayEngine.answer(correctKey);  // 走 hook → state.draft[i]
    // 確認 draft 寫入
    if (i < 3) {
      console.log(`  q${i}: draft=${JSON.stringify(Mode.state.draft[i])}, correctKey=${correctKey}`);
    }
    // 模擬點「送出本題」
    Mode.submitCurrent();
    if (i < 3) {
      console.log(`  q${i}: after submit, answers=${JSON.stringify(Mode.state.answers[i])}`);
    }
  }

  // 交卷
  console.log(`  before submitMock: state.correct=${Mode.state.correct}, answers count=${Object.keys(Mode.state.answers).length}`);
  Mode.submitMock();

  // 結算後檢查
  A.eq(Object.keys(Mode.state.answers).length, 50, '50 題都有 answers');
  A.eq(Mode.state.correct, 50, '✅ state.correct === 50(預期全對)');

  // _computeResult 看 result.correct
  const result = Mode._computeResult('submit');
  A.eq(result.correct, 50, '✅ result.correct === 50(結算頁分數)');
}

// ----- 2. 真實使用者流程:click + 直接 submitMock(不點送出本題,靠 _autoLockDrafts)-----
console.log('\n[2] 50 題真實流程 — 不點送出,靠 _autoLockDrafts');
{
  const { Mode, sandbox } = setupMode7(50);
  Mode._startBattle();

  for (let i = 0; i < 50; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const correctKey = Mode.state.lineup[i]._rendered.options.find(o => o.is_correct).key;
    sandbox.PlayEngine.answer(correctKey);
  }

  console.log(`  before submitMock: draft count=${Object.keys(Mode.state.draft).length}, locked=${Mode.state.locked.size}`);
  Mode.submitMock();  // 內部會呼 _autoLockDrafts
  console.log(`  after submitMock: state.correct=${Mode.state.correct}, answers=${Object.keys(Mode.state.answers).length}, locked=${Mode.state.locked.size}`);

  A.eq(Object.keys(Mode.state.answers).length, 50, '50 題都有 answers (via _autoLockDrafts)');
  A.eq(Mode.state.correct, 50, '✅ state.correct === 50(_autoLockDrafts 路徑)');
}

// ----- 3. 混合流程:有些題 submitCurrent,有些題只 draft → submitMock -----
console.log('\n[3] 混合流程 — 一半 submitCurrent + 一半 draft');
{
  const { Mode, sandbox } = setupMode7(50);
  Mode._startBattle();

  for (let i = 0; i < 50; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const correctKey = Mode.state.lineup[i]._rendered.options.find(o => o.is_correct).key;
    sandbox.PlayEngine.answer(correctKey);
    if (i % 2 === 0) {
      Mode.submitCurrent();  // 奇數題只 draft 不送出
    }
  }

  Mode.submitMock();
  A.eq(Mode.state.correct, 50, '✅ 混合流程 state.correct === 50');
}

// ----- 4. 重答場景:首答錯 → 重答對 → 應算對(lenient 改造)-----
console.log('\n[4] 首答錯 → 重答對(lenient)');
{
  const { Mode, sandbox } = setupMode7(10);
  Mode._startBattle();

  // 第 1 題:答錯
  Mode.state.idx = 0;
  Mode._showCurrentQuestion();
  const correctKey0 = Mode.state.lineup[0]._rendered.options.find(o => o.is_correct).key;
  const wrongKey = ['A','B','C','D'].find(k => k !== correctKey0);
  sandbox.PlayEngine.answer(wrongKey);
  // 不送出,直接改答案
  sandbox.PlayEngine.answer(correctKey0);
  Mode.submitCurrent();

  A.eq(Mode.state.answers[0].isCorrect, true, '✅ 首錯改對 → isCorrect=true');

  // 其餘 9 題答對
  for (let i = 1; i < 10; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const ck = Mode.state.lineup[i]._rendered.options.find(o => o.is_correct).key;
    sandbox.PlayEngine.answer(ck);
    Mode.submitCurrent();
  }
  Mode.submitMock();
  A.eq(Mode.state.correct, 10, '✅ 全 10 題答對');
}

// ----- 5. 純跳題場景:user 不按順序回答(case 10 PR A review fix 場景)-----
console.log('\n[5] 跳題場景 — 跳序回答');
{
  const { Mode, sandbox } = setupMode7(20);
  Mode._startBattle();

  // 跳序:answer q5, q10, q15, q0, q3, ... 等
  const order = [5, 10, 15, 0, 3, 7, 12, 18, 1, 9, 2, 4, 6, 8, 11, 13, 14, 16, 17, 19];
  for (const idx of order) {
    Mode.state.idx = idx;
    Mode._showCurrentQuestion();
    const correctKey = Mode.state.lineup[idx]._rendered.options.find(o => o.is_correct).key;
    sandbox.PlayEngine.answer(correctKey);
    Mode.submitCurrent();
  }
  Mode.submitMock();
  A.eq(Mode.state.correct, 20, '✅ 跳序答 20 題全對');
}

// ----- 6. fullLog snapshot 驗證(模擬使用者「結算 0/50 但歷史看到答對」)-----
console.log('\n[6] fullLog snapshot — 驗證 options 有 key、isCorrect 與 state 一致');
{
  const { Mode, sandbox } = setupMode7(10);
  Mode._startBattle();
  for (let i = 0; i < 10; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    const correctKey = Mode.state.lineup[i]._rendered.options.find(o => o.is_correct).key;
    sandbox.PlayEngine.answer(correctKey);
    Mode.submitCurrent();
  }
  Mode.submitMock();

  // 抓 storage 內 fullLog
  const stored = sandbox.localStorage.getItem('ipas_mode7_theater_v1');
  if (stored) {
    const parsed = JSON.parse(stored);
    const lastH = parsed.history[parsed.history.length - 1];
    A.eq(lastH.result.correct, 10, '✅ history.result.correct === 10');
    A.ok(Array.isArray(lastH.fullLog) && lastH.fullLog.length === 10, 'fullLog has 10 entries');
    // 每一題 options 必含 key A/B/C/D
    let allHaveKeys = true;
    for (let i = 0; i < 10; i++) {
      const entry = lastH.fullLog[i];
      const keys = (entry.options || []).map(o => o.key).filter(Boolean);
      if (keys.length !== 4 || !keys.every(k => ['A','B','C','D'].includes(k))) {
        allHaveKeys = false;
        console.log(`  ✗ fullLog[${i}] missing keys: ${JSON.stringify(entry.options)}`);
      }
    }
    A.ok(allHaveKeys, '✅ 每題 options 都有 A/B/C/D key(無 case 10 bug)');
    // 每一題 isCorrect 應 true
    const allCorrect = lastH.fullLog.every(e => e.isCorrect === true);
    A.ok(allCorrect, '✅ 每題 fullLog.isCorrect === true');
  } else {
    A.ok(false, 'storage 沒寫入 history');
  }
}

process.exit(A.summary('Mode7 ZERO-SCORE REPRO'));
