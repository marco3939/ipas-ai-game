// 05-engageBoss-state.test.js
// 驗證 Mode5.engageBoss(idx) 後 state 各欄位初始化正確,reset 乾淨,並對 invalid idx 防呆。
//
// Mode 5 state shape(以 mode5.js:298-319 為真相來源):
//   { boss, bossIdx, questions, idx, currentQ, bossHpMax, bossHp, startMastery,
//     correct, wrong, combo, maxCombo, totalDamage, analyzeUsed, avatarIcon }
//
// 注意:任務 spec 提到的 qsAnswered / score / battleStartTs 三個欄位 mode5.js 並不存在(它走
// Player.hp / Mastery.score 雙 track,而非自管 state.score)。本檔對齊 mode5.js 現有行為,
// 不創造不存在的欄位 assertion。
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 engageBoss state init / reset / invalid-idx tests ===');
const A = makeAssert();

function setup({ questions, bosses } = {}) {
  questions = questions || [
    makeQ('qA1', { node_id: 'N_A' }),
    makeQ('qA2', { node_id: 'N_A' }),
    makeQ('qB1', { node_id: 'N_B' }),
  ];
  const r = loadMode(5, { questions });
  // 注入 cachedBosses,避免依賴 selectWeakBosses RNG
  r.Mode.cachedBosses = bosses || [
    { nodeId: 'N_A', source: 'wrongbook', weak: 3 },
    { nodeId: 'N_B', source: 'mastery', weak: 1 },
  ];
  return r;
}

// --- 1: engageBoss(0) 後 state 主要欄位初始化正確 ---
{
  const { Mode } = setup();
  Mode.engageBoss(0);
  A.ok(Mode.state !== null, 'state 已建立(不是 null)');
  A.eq(Mode.state.boss.nodeId, 'N_A', 'state.boss = cachedBosses[0]');
  A.eq(Mode.state.bossIdx, 0, 'state.bossIdx = 0');
  A.eq(Mode.state.idx, 0, 'state.idx = 0(尚未開始答題)');
  A.eq(Mode.state.currentQ, null, 'state.currentQ 初始 null(showQuestion 之前)');
  A.eq(Mode.state.correct, 0, 'state.correct = 0');
  A.eq(Mode.state.wrong, 0, 'state.wrong = 0');
  A.eq(Mode.state.combo, 0, 'state.combo = 0');
  A.eq(Mode.state.maxCombo, 0, 'state.maxCombo = 0');
  A.eq(Mode.state.totalDamage, 0, 'state.totalDamage = 0');
  A.eq(Mode.state.analyzeUsed, false, 'state.analyzeUsed = false(skill 未用)');
  A.eq(Mode.state.bossHpMax, 100, 'state.bossHpMax = 100');
  A.eq(Mode.state.bossHp, 100, 'state.bossHp = 100(滿血)');
  A.ok(typeof Mode.state.startMastery === 'number',
    `state.startMastery 是 number(${typeof Mode.state.startMastery})`);
  A.ok(typeof Mode.state.avatarIcon === 'string' && Mode.state.avatarIcon.length > 0,
    `state.avatarIcon 是非空 string(${Mode.state.avatarIcon})`);
  A.ok(Array.isArray(Mode.state.questions) && Mode.state.questions.length > 0,
    `state.questions 是非空 array(len=${Mode.state.questions.length})`);
}

// --- 2: engageBoss(1) 抓對應 bosses[1],idx 與 nodeId 對齊 ---
{
  const { Mode } = setup();
  Mode.engageBoss(1);
  A.eq(Mode.state.boss.nodeId, 'N_B', 'engageBoss(1) → cachedBosses[1] = N_B');
  A.eq(Mode.state.bossIdx, 1, 'state.bossIdx = 1');
}

// --- 3: 連 call engageBoss(0) → engageBoss(1),state 完全 reset,不殘留前一場 combo / correct / wrong / damage ---
{
  const { Mode } = setup();
  Mode.engageBoss(0);
  // 模擬玩家先在 BOSS0 已累積戰績
  Mode.state.combo = 7;
  Mode.state.maxCombo = 7;
  Mode.state.correct = 4;
  Mode.state.wrong = 2;
  Mode.state.totalDamage = 60;
  Mode.state.analyzeUsed = true;
  Mode.state.idx = 3;
  // 再 engage 下一個 BOSS
  Mode.engageBoss(1);
  A.eq(Mode.state.boss.nodeId, 'N_B', '切換到 BOSS1');
  A.eq(Mode.state.combo, 0, '新 BOSS state.combo reset 為 0(不殘留 7)');
  A.eq(Mode.state.maxCombo, 0, '新 BOSS state.maxCombo reset 為 0');
  A.eq(Mode.state.correct, 0, '新 BOSS state.correct reset 為 0');
  A.eq(Mode.state.wrong, 0, '新 BOSS state.wrong reset 為 0');
  A.eq(Mode.state.totalDamage, 0, '新 BOSS state.totalDamage reset 為 0');
  A.eq(Mode.state.analyzeUsed, false, '新 BOSS state.analyzeUsed reset 為 false');
  A.eq(Mode.state.idx, 0, '新 BOSS state.idx reset 為 0');
}

// --- 4: invalid idx(超界 / 負數)→ 防呆 showToast,不 crash,不污染既有 state ---
{
  const { Mode, stats } = setup();
  // 先建立合法 state(BOSS0)
  Mode.engageBoss(0);
  const stateBefore = Mode.state;
  const toastBefore = stats.toasts.length;

  // 超界
  A.nothrow(() => Mode.engageBoss(99), 'engageBoss(99) 超界不 crash');
  A.ok(stats.toasts.length > toastBefore, 'engageBoss(99) showToast「BOSS 不存在」(防呆訊息)');
  A.ok(stats.toasts[stats.toasts.length - 1].includes('BOSS'),
    `toast 內容含「BOSS」(${stats.toasts[stats.toasts.length - 1]})`);
  A.ok(Mode.state === stateBefore,
    'engageBoss(99) 防呆後 state 物件未被替換(沿用前一場)');

  // 負數
  const toastBefore2 = stats.toasts.length;
  A.nothrow(() => Mode.engageBoss(-1), 'engageBoss(-1) 負數不 crash');
  A.ok(stats.toasts.length > toastBefore2, 'engageBoss(-1) 也 showToast');
}

// --- 5: 該節點題庫不足(direct + generateVariation 都 0)→ 跳過,state 不變 ---
{
  // 題庫只有 N_A,但 cachedBosses 指 N_NONE → pickQuestionsForNode 返空 → showToast 跳過
  const r = setup({
    questions: [makeQ('qA', { node_id: 'N_A' })],
    bosses: [{ nodeId: 'N_NONE', source: 'wrongbook', weak: 1 }],
  });
  const stateBefore = r.Mode.state;
  const toastBefore = r.stats.toasts.length;
  A.nothrow(() => r.Mode.engageBoss(0), 'engageBoss(node 無題)不 crash');
  A.ok(r.stats.toasts.length > toastBefore, '節點題庫不足時 showToast');
  A.ok(r.Mode.state === stateBefore,
    'engageBoss(node 無題)時 state 未被覆寫(仍 null 或前一場)');
}

// --- 6: prog.runs +1 — engageBoss 成功必 bump runs(視為一場出征) ---
{
  const { Mode } = setup();
  const prog0 = Mode.loadProg();
  const runs0 = prog0.runs || 0;
  Mode.engageBoss(0);
  const prog1 = Mode.loadProg();
  A.eq(prog1.runs, runs0 + 1, `engageBoss 成功一次 prog.runs +1(${runs0} → ${prog1.runs})`);

  Mode.engageBoss(1);
  const prog2 = Mode.loadProg();
  A.eq(prog2.runs, runs0 + 2, '第二次 engageBoss 成功 runs 再 +1(累計)');
}

process.exit(A.summary('Mode5 engageBoss state'));
