// 06-takeDamage-score-bounds.test.js
// Mode 5 不像 Mode 1/2 是 score-based,而是 HP-based(Player.hp)+ Mastery.score(per-node)雙 track。
// 本檔聚焦三件事:
//   A) 答錯時 takeDamage 的副作用(combo reset / Mastery score 扣 5 / Player.hp 扣血 / hp ≤ 0 排程 gameOver)
//   B) 答對時 attack 的副作用(combo++ / maxCombo / Mastery score +15 / hp 上限)
//   C) 連擊 5 時 showToast 文案 + bound check(combo / Mastery score / Player.hp 各邊界都不會 NaN / 不會跑出範圍)
//
// 注意:任務 spec 提到的 state.score 在 mode5.js 不存在(score 是 per-node Mastery.score)。
// 本檔對齊現實行為,把「score 下降的提示」對應到 Mastery + toast。
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 attack / takeDamage / combo / bounds tests ===');
const A = makeAssert();

function setup(opts = {}) {
  const questions = opts.questions || [
    makeQ('q1', { node_id: 'N_A' }),
    makeQ('q2', { node_id: 'N_A' }),
    makeQ('q3', { node_id: 'N_A' }),
    makeQ('q4', { node_id: 'N_A' }),
    makeQ('q5', { node_id: 'N_A' }),
    makeQ('q6', { node_id: 'N_A' }),
  ];
  const r = loadMode(5, { questions, mastery: opts.mastery });
  r.Mode.cachedBosses = [{ nodeId: 'N_A', source: 'wrongbook', weak: 1 }];
  r.Mode.engageBoss(0);
  r.Mode.showQuestion();
  return r;
}

// --- 1: 答對 → combo++ / maxCombo bump / Mastery score +15 / correct++ ---
{
  const { Mode, sandbox } = setup();
  const q = Mode.state.currentQ;
  const correctOpt = q.options.find(o => o.is_correct);
  const masteryBefore = sandbox.Mastery.get('N_A').score || 0;

  Mode.answer(correctOpt.key);

  A.eq(Mode.state.combo, 1, '答對 1 題 → combo = 1');
  A.eq(Mode.state.maxCombo, 1, '答對 1 題 → maxCombo = 1');
  A.eq(Mode.state.correct, 1, 'state.correct = 1');
  const masteryAfter = sandbox.Mastery.get('N_A').score || 0;
  A.ok(masteryAfter > masteryBefore,
    `答對 → Mastery score 上升(${masteryBefore} → ${masteryAfter})`);
}

// --- 2: 答錯 → combo reset 0 / Mastery -5 / wrong++ / 但 maxCombo 保留 ---
{
  const { Mode, sandbox } = setup();
  const q1 = Mode.state.currentQ;
  const correct1 = q1.options.find(o => o.is_correct);
  Mode.answer(correct1.key); // combo=1
  Mode.next();
  const q2 = Mode.state.currentQ;
  const correct2 = q2.options.find(o => o.is_correct);
  Mode.answer(correct2.key); // combo=2,maxCombo=2
  A.eq(Mode.state.maxCombo, 2, '兩連對 → maxCombo = 2');

  Mode.next();
  const q3 = Mode.state.currentQ;
  const wrong3 = q3.options.find(o => !o.is_correct);
  const masteryBefore = sandbox.Mastery.get('N_A').score || 0;
  Mode.answer(wrong3.key);
  const masteryAfter = sandbox.Mastery.get('N_A').score || 0;

  A.eq(Mode.state.combo, 0, '答錯 → combo reset 為 0');
  A.eq(Mode.state.maxCombo, 2, '答錯後 maxCombo 保留歷史最高(2)');
  A.eq(Mode.state.wrong, 1, 'state.wrong = 1');
  A.ok(masteryAfter < masteryBefore,
    `答錯 → Mastery score 下降(${masteryBefore} → ${masteryAfter})`);
}

// --- 3: 連續 5 對 → combo=5 觸發 '🔥 5 連擊' showToast ---
{
  const { Mode, stats } = setup();
  // 連答 5 題對(每次都先 next() 拿新題)
  for (let i = 0; i < 5; i++) {
    const q = Mode.state.currentQ;
    const correct = q.options.find(o => o.is_correct);
    Mode.answer(correct.key);
    if (i < 4) Mode.next();
  }
  A.eq(Mode.state.combo, 5, '連 5 對 → combo = 5');
  A.eq(Mode.state.maxCombo, 5, 'maxCombo = 5');
  const hasComboToast = stats.toasts.some(t => /5\s*連擊|崩解/.test(t));
  A.ok(hasComboToast,
    `combo=5 觸發祝賀 toast(toasts=${JSON.stringify(stats.toasts)})`);
}

// --- 4: combo 不會變負 / NaN;Mastery score 嚴格 clamp [0,100] ---
{
  const { Mode, sandbox } = setup({
    mastery: { N_A: { score: 2, attempts: 1, correct: 0, streak: 0 } },
  });
  // 連續答錯多次,Mastery score 不會跌破 0
  for (let i = 0; i < 5; i++) {
    const q = Mode.state.currentQ;
    if (!q) break;
    const wrong = q.options.find(o => !o.is_correct);
    Mode.answer(wrong.key);
    Mode.next();
  }
  const masteryScore = sandbox.Mastery.get('N_A').score;
  A.ok(typeof masteryScore === 'number' && !isNaN(masteryScore),
    `Mastery score 是合法 number(${masteryScore})`);
  A.ok(masteryScore >= 0, `Mastery score >= 0(實際 ${masteryScore})`);
  A.ok(masteryScore <= 100, `Mastery score <= 100(實際 ${masteryScore})`);
  A.ok(Mode.state.combo >= 0 && !isNaN(Mode.state.combo),
    `state.combo 非負且非 NaN(${Mode.state.combo})`);
}

// --- 5: 答錯導致 Player.hp = 0 → 排程 gameOver(_scheduleTimeout 走集中 timer) ---
{
  const { Mode, sandbox } = setup();
  // 先把玩家 HP 壓到非常低,讓一次答錯就 ≤ 0
  sandbox.Player.save({ hp: 1, hpMax: 100, mp: 50, mpMax: 50, level: 1, exp: 0, expMax: 100 });
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  const pendingBefore = Mode._pendingTimers.length;
  Mode.answer(wrong.key);
  const p = sandbox.Player.load();
  A.eq(p.hp, 0, 'Player.hp 答錯後 = 0(takeDamage 把 1 扣到 ≤ 0)');
  A.ok(Mode._pendingTimers.length > pendingBefore,
    `hp ≤ 0 → 排程 gameOver 進 _pendingTimers(${pendingBefore} → ${Mode._pendingTimers.length})`);
}

// --- 6: Mastery 達 80% → 下一輪 showQuestion 立即 victory(不再出題) ---
{
  const { Mode, sandbox } = setup({
    mastery: { N_A: { score: 78, attempts: 10, correct: 8, streak: 3 } },
  });
  // 78 + 答對一次(+15)= 93 ≥ 80 門檻
  const q = Mode.state.currentQ;
  const correct = q.options.find(o => o.is_correct);
  Mode.answer(correct.key);
  const masteryNow = sandbox.Mastery.get('N_A').score;
  A.ok(masteryNow >= 80, `Mastery 達門檻(${masteryNow} ≥ 80)`);
  // next() 內部會檢查 Mastery >= 80 → 走 victory(不再出題)
  Mode.next();
  // victory() 內把 cachedBosses 清為 null
  A.eq(Mode.cachedBosses, null,
    'victory 後 cachedBosses 清為 null(下次回地圖重新偵測弱點)');
}

process.exit(A.summary('Mode5 attack/takeDamage/bounds'));
