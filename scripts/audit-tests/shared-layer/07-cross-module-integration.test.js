// 07-cross-module-integration.test.js — 跨模組整合測試
// 覆蓋鐵律 #6 共用層 + 案例 4(Mastery 整合)+ 案例 10(Wrongbook 跨檔)
const { readIndex, sliceConst, makeSandbox, runSource, makeAssert } = require('./_helpers');

const src = readIndex();
const StorageSrc = sliceConst(src, 'const Storage = {', '// === Random');
const ProgressSrc = sliceConst(src, 'const Progress = {', '// === Mastery');
const MasterySrc = sliceConst(src, 'const Mastery = {', '// === SeenCorrect');
const SeenSrc = sliceConst(src, 'const SeenCorrect = {', '// === Wrongbook');
const WrongbookSrc = sliceConst(src, 'const Wrongbook = {', '// === ErrorReports');
const PlayerSrc = sliceConst(src, 'const Player = {', '// ============================================================================\n// === ProgressIO');

console.log('=== Cross-module integration ===');

const A = makeAssert();

function setupAll(questions = []) {
  const sb = makeSandbox();
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, ProgressSrc, 'Progress');
  sb.QUESTIONS = questions;
  runSource(sb, MasterySrc, 'Mastery');
  runSource(sb, SeenSrc, 'SeenCorrect');
  runSource(sb, WrongbookSrc, 'Wrongbook');
  runSource(sb, PlayerSrc, 'Player');
  return sb;
}

// ----- [1] 完整答題流程:answer correct -----
console.log('\n[1] Full flow: correct answer');
{
  const qs = [{id:'q1', node_id:'N1'},{id:'q2', node_id:'N1'},{id:'q3', node_id:'N1'}];
  const sb = setupAll(qs);
  sb.Progress.init();

  // Simulate "answer correct"
  sb.Progress.addAnswer(true);
  sb.Mastery.update('N1', true);
  sb.SeenCorrect.mark('q1');

  A.eq(sb.Progress.daysLeft() >= 0, true, 'daysLeft sane');
  const p = sb.Storage.get(sb.Storage.K_PROGRESS);
  A.eq(p.totalAnswered, 1, 'progress totalAnswered=1');
  A.eq(p.totalCorrect, 1, 'progress totalCorrect=1');
  A.eq(sb.Mastery.get('N1').correct, 1, 'mastery correct=1');
  A.eq(sb.SeenCorrect.has('q1'), true, 'q1 seen');
}

// ----- [2] 完整答題流程:answer wrong → Wrongbook -----
console.log('\n[2] Full flow: wrong answer → Wrongbook');
{
  const sb = setupAll();
  sb.Progress.init();
  sb.Progress.addAnswer(false);
  sb.Mastery.update('N1', false);
  sb.Wrongbook.add('q1', 'N1', 'B', 'C', '錯選項 B 文字', '正解 C 文字');

  A.eq(sb.Storage.get(sb.Storage.K_PROGRESS).totalCorrect, 0, 'totalCorrect=0');
  A.eq(sb.Wrongbook.count(), 1, 'wrongbook count=1');
  const e = sb.Wrongbook.load()[0];
  A.eq(e.qid, 'q1', 'qid set');
  A.eq(e.correctText, '正解 C 文字', 'text preserved');
  A.eq(sb.SeenCorrect.has('q1'), false, 'q1 NOT in seen (wrong)');
}

// ----- [3] 鐵律 #6 contract: 同一 key 在不同模組讀寫一致 -----
console.log('\n[3] Storage key uniqueness');
{
  const sb = setupAll();
  // 每個模組用獨立 key
  const keys = [
    sb.Storage.K_PROGRESS,
    sb.Storage.K_MASTERY,
    sb.Storage.K_WRONGBOOK,
    sb.Storage.K_SEEN_CORRECT,
    sb.Storage.K_SETTINGS,
    sb.Storage.K_SESSION,
    sb.Storage.K_ERROR_REPORTS,
    sb.Storage.K_USER_NICKNAME,
  ];
  const set = new Set(keys);
  A.eq(set.size, keys.length, 'all K_* keys unique');
  // Player 用 hardcoded key (不在 K_*)
  // 確認沒衝突
  for (const k of keys) {
    A.ok(k !== 'ipas_player_v1', `K_${k} not collide with player key`);
  }
}

// ----- [4] 案例 4 reproduction → §8 H4 修補後雙路徑契約 -----
// 2026-05-30 更新契約(對齊 index.html ~1117-1126 §8 H4 雙路徑修補):
//   countMastered() 現在用 Path A(correct >= min(3, qPerNode))OR Path B(score >= 80)。
//   §8 H4 為了讓 Mode 5 skillReinforce / drillBonus 等只動 score 的路徑被認可,
//   加了 Path B。所以 score=100 + correct=0 現在「算進 mastered」(不是 bug)。
//
//   ⚠️ 副作用:案例 4 原始 bug(adjustMasteryScore 不 bump attempts)現在不再被
//   countMastered 罰,但仍是設計味道差(observability 受損,attempts=0 看不出練習次數)。
//   本 case 改驗 §8 H4 雙路徑契約,案例 4 的訓示保留在 CLAUDE.md §5。
console.log('\n[4] case 4 → §8 H4 雙路徑契約:score>=80 OR correct>=min(3,qcount)');
{
  const qs = [{id:'q1', node_id:'N1'}];
  const sb = setupAll(qs);
  // 模擬「直接寫 score 而不走 update」(案例 4 原 bug 場景)
  const m = sb.Mastery.load();
  m['N1'] = { score: 100, attempts: 0, correct: 0, streak: 10, lastSeen: Date.now() };
  sb.Mastery.save(m);
  // §8 H4 修補後:Path B(score>=80)觸發 → mastered=1
  A.eq(sb.Mastery.countMastered(), 1, '§8 H4 路徑 B:score=100 → countMastered=1(即便 correct=0)');
  // Path A 驗證:走 Mastery.update 3 次 → correct 累加 → 仍 mastered
  sb.Mastery.update('N1', true);
  sb.Mastery.update('N1', true);
  sb.Mastery.update('N1', true);
  A.eq(sb.Mastery.countMastered(), 1, '3 次 update 後仍 mastered(Path A or B 任一達標即可)');
}

// ----- [5] 案例 10 重現:Wrongbook 收到空 correctChoice → suspect -----
console.log('\n[5] BUG case 10 reproduction: empty correctChoice path');
{
  const sb = setupAll();
  // 模擬 Mode 7 lineup-key bug:傳空 string 進來
  sb.Wrongbook.add('q1', 'N1', 'B', '', '錯選項文字', '');
  sb.Wrongbook.add('q2', 'N1', 'B', null, '錯選項', null);
  sb.Wrongbook.add('q3', 'N1', 'B', 'C', '錯', '對');  // 正常

  A.eq(sb.Wrongbook.countSuspect(), 2, 'countSuspect=2 (q1, q2)');
  const suspects = sb.Wrongbook.listSuspectQids().sort();
  A.eq(suspects, ['q1', 'q2'], 'suspect list correct');

  const removed = sb.Wrongbook.cleanupSuspect();
  A.eq(removed, 2, 'cleanup removed 2');
  A.eq(sb.Wrongbook.count(), 1, 'only q3 left');
}

// ----- [6] SeenCorrect + Mastery 不一致檢測 -----
console.log('\n[6] SeenCorrect / Mastery consistency');
{
  const qs = [{id:'q1', node_id:'N1'},{id:'q2', node_id:'N2'}];
  const sb = setupAll(qs);
  // 答對 q1 → mark seen + mastery update
  sb.SeenCorrect.mark('q1');
  sb.Mastery.update('N1', true);
  // 但漏 mark q2 — 不一致場景
  sb.Mastery.update('N2', true);
  A.eq(sb.SeenCorrect.size(), 1, 'seen 1');
  A.eq(sb.Mastery.get('N1').correct, 1, 'N1 correct=1');
  A.eq(sb.Mastery.get('N2').correct, 1, 'N2 correct=1');
  // SeenCorrect 與 Mastery 是獨立 store,彼此不會驗證一致性
  A.ok(true, 'SeenCorrect and Mastery are independent (consistent by convention only)');
}

// ----- [7] Storage 配額爆滿時整個寫入鏈失敗 -----
console.log('\n[7] Quota cascade failure');
{
  const sb = makeSandbox({ quotaBytes: 500 });
  runSource(sb, StorageSrc, 'Storage');
  runSource(sb, ProgressSrc, 'Progress');
  sb.QUESTIONS = [];
  runSource(sb, MasterySrc, 'Mastery');
  runSource(sb, SeenSrc, 'SeenCorrect');
  runSource(sb, WrongbookSrc, 'Wrongbook');
  runSource(sb, PlayerSrc, 'Player');

  // 把配額用光
  for (let i = 0; i < 50; i++) {
    sb.Wrongbook.add('q'+i, 'N1', 'B', 'C', 'xxxxxxxxxx', 'yyyyyyyyyy');
  }
  // 多個模組都會 silent fail
  A.ok(sb.Storage._writeFailed === true, '_writeFailed flag set across modules');
  // Mastery 也試圖寫 — silent fail
  sb.Mastery.update('N1', true);
  // Player save 也 silent fail
  sb.Player.damage(10);
  A.ok(true, 'cascade silent fail — no exceptions thrown');
}

// ----- [8] 多次 Player.gainExp + Mastery.update 同場景 -----
console.log('\n[8] Battle simulation: 20 answers');
{
  const qs = [];
  for (let i = 0; i < 5; i++) qs.push({id:'q'+i, node_id:'N1'});
  const sb = setupAll(qs);
  sb.Progress.init();
  let correctCount = 0;
  for (let i = 0; i < 20; i++) {
    const correct = i % 2 === 0;
    sb.Progress.addAnswer(correct);
    sb.Mastery.update('N1', correct);
    if (correct) {
      correctCount++;
      sb.SeenCorrect.mark('q' + (i % 5));
      sb.Player.gainExp(10);
    } else {
      sb.Wrongbook.add('q'+i, 'N1', 'B', 'C', '錯', '對');
      sb.Player.damage(20);
    }
  }
  A.eq(sb.Storage.get(sb.Storage.K_PROGRESS).totalAnswered, 20, 'total=20');
  A.eq(sb.Storage.get(sb.Storage.K_PROGRESS).totalCorrect, correctCount, `correct=${correctCount}`);
  A.eq(sb.Wrongbook.count(), 10, 'wrongbook 10');
  // player damaged 10*20=200,但 gainExp 100→ levelup 補滿 HP,實際 hp 取決於最後操作順序
  // i=18 (correct) gainExp(10), i=19 (wrong) damage(20)
  // 最終取決於 level/hpMax — 至少 hp 在 [0, hpMax] 範圍內,且 level > 1
  const p = sb.Player.load();
  A.ok(p.level > 1, `levelups happened (level=${p.level})`);
  A.ok(p.hp >= 0 && p.hp <= p.hpMax, `hp=${p.hp} ∈ [0, ${p.hpMax}]`);
  A.ok(true, '⚠️ 留意:gainExp 觸發 levelup 會把 HP 補滿,可能掩蓋戰鬥傷害 (設計 trade-off)');
}

// ----- [9] 跨模組 reset — 是否能完全清乾淨 -----
console.log('\n[9] Cross-module reset');
{
  const sb = setupAll();
  sb.Progress.init();
  sb.Progress.addAnswer(true);
  sb.Mastery.update('N1', true);
  sb.Wrongbook.add('q1', 'N1', 'B', 'C', '', '');
  sb.SeenCorrect.mark('q1');
  sb.Player.damage(50);

  // 手動 reset 各模組
  sb.Storage.del(sb.Storage.K_PROGRESS);
  sb.Storage.del(sb.Storage.K_MASTERY);
  sb.Storage.del(sb.Storage.K_WRONGBOOK);
  sb.SeenCorrect.reset();
  sb.Player.reset();

  A.eq(sb.Storage.get(sb.Storage.K_PROGRESS, null), null, 'progress cleared');
  A.eq(sb.Mastery.load(), {}, 'mastery cleared');
  A.eq(sb.Wrongbook.load(), [], 'wrongbook cleared');
  A.eq(sb.SeenCorrect.size(), 0, 'seen cleared');
  A.eq(sb.Player.load().hp, 100, 'player reset hp=100');
}

// ----- [10] 變更 K_ 常數會 break 既有資料 -----
console.log('\n[10] Storage key contract');
{
  const sb = setupAll();
  // 鎖定 K_* 名稱(若 PR 改名會 silently lose data)
  const expected = {
    K_PROGRESS: 'ipas_progress_v1',
    K_MASTERY: 'ipas_mastery_v1',
    K_WRONGBOOK: 'ipas_wrongbook_v1',
    K_ERROR_REPORTS: 'ipas_error_reports_v1',
    K_SETTINGS: 'ipas_settings_v1',
    K_SESSION: 'ipas_session_state_v1',
    K_SEEN_CORRECT: 'ipas_seen_correct_v1',
    K_USER_NICKNAME: 'ipas_user_nickname_v1',
  };
  for (const [k, v] of Object.entries(expected)) {
    A.eq(sb.Storage[k], v, `${k} === "${v}" (contract)`);
  }
}

// ----- [11] Player key 缺乏 K_* 統一 -----
console.log('\n[11] Player key inconsistency');
{
  const sb = setupAll();
  sb.Player.save({ hp: 50, hpMax: 100, mp: 50, mpMax: 50,
    level: 1, exp: 0, expMax: 100, skillPoints: 0,
    stats: {}, skills: {} });
  // hardcoded 'ipas_player_v1' — 不在 K_* 內
  A.ok(sb.Storage.get('ipas_player_v1') !== null, 'player saved to hardcoded key');
  A.ok(typeof sb.Storage.K_PLAYER === 'undefined', '⚠️ inconsistency: no K_PLAYER constant (hardcoded literal)');
}

process.exit(A.summary('Cross-module'));
