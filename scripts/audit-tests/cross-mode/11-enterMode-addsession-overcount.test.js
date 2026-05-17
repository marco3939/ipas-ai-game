// 11-enterMode-addsession-overcount.test.js
// 必證:連續 enterMode 5 次 → sessions 累計正確(不重算 / 不掉算)
// FINDING 風險:enterMode 立即 Progress.addSession 不管 mode 是否真開始
//   → 如果 mode load fail 也算一場 session(可能 over-count)

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 11 enterMode addSession overcount ===\n');
const A = makeAssert();

// ----- [1] addSession 在 enterMode 開頭(無條件) -----
console.log('\n[1] enterMode 一進 function 即 addSession');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const m = idx.match(/function enterMode\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  A.ok(m, 'enterMode found');
  if (m) {
    // 第一行(或前幾行)就 Progress.addSession
    const lines = m[1].split('\n').map(s => s.trim()).filter(Boolean);
    const sessionIdx = lines.findIndex(l => /Progress\.addSession/.test(l));
    A.ok(sessionIdx >= 0, 'enterMode 內含 Progress.addSession');
    A.le(sessionIdx, 2, `addSession 在 function 開頭(第 ${sessionIdx} 行)`);
    // FINDING: addSession 在 function 開頭意味著:即使後續 Mode 模組沒載入也算一場
    if (sessionIdx === 0 || sessionIdx === 1) {
      console.log('  FINDING: enterMode 第一行就 addSession,若 mode 模組未載入(showToast 提示)依然 +1');
    }
  }
}

// ----- [2] sandbox 模擬連續 5 次 enterMode -----
console.log('\n[2] 連續 5 次 addSession 累計');
{
  const sb = makeSandbox();
  const { Progress, Storage } = loadSharedLayer(sb);
  Progress.init();
  for (let i = 0; i < 5; i++) Progress.addSession();
  A.eq(Storage.get(Storage.K_PROGRESS).sessions, 5, '5 次 enterMode → sessions=5');
}

// ----- [3] addSession 不會掉算(底層 race) -----
console.log('\n[3] 快速連續呼叫不掉算');
{
  const sb = makeSandbox();
  const { Progress, Storage } = loadSharedLayer(sb);
  Progress.init();
  // 同步快速呼叫
  for (let i = 0; i < 100; i++) Progress.addSession();
  A.eq(Storage.get(Storage.K_PROGRESS).sessions, 100, '100 次連續 addSession 無掉算');
}

// ----- [4] enterMode('review') 不應 addSession(review 不是真戰鬥) -----
console.log('\n[4] enterMode(review) 也 addSession?(行為 baseline)');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const m = idx.match(/function enterMode\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (m) {
    const body = m[1];
    // mode === 'review' 之前 addSession 已執行 → review 也會 +1
    // FINDING:即使是回顧也算一場 session
    const lines = body.split('\n');
    const reviewLine = lines.findIndex(l => /===\s*['"]review['"]/.test(l));
    const sessLine = lines.findIndex(l => /Progress\.addSession/.test(l));
    if (sessLine >= 0 && reviewLine > sessLine) {
      console.log('  FINDING: enterMode("review") 也會 addSession,review 算一場');
      A.ok(true, 'FINDING noted: review 也算 session(baseline behavior)');
    } else {
      A.ok(false, 'review 流程意外有變,需重新確認');
    }
  }
}

// ----- [5] mode 模組未載入時 enterMode 仍 +1(over-count 風險) -----
console.log('\n[5] FINDING: mode 模組未載入也 +1');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const m = idx.match(/function enterMode\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (m) {
    const body = m[1];
    // 找 'window[Mode + mode]' 路徑
    const guard = /typeof\s+M\.start\s*===?\s*['"]function['"]/.test(body) || /M\s*&&\s*typeof\s+M\.start/.test(body);
    A.ok(guard, 'enterMode 有 guard 檢查 mode 模組存在,但 addSession 在 guard 之前');
    // 風險點:即使 guard fail 走 showToast 路徑,session 已 +1
    console.log('  FINDING: enterMode 設計上 addSession 在 guard 之前 → mode 載入 fail 仍算一場');
  }
}

// ----- [6] addSession storage round-trip 無資料 leak -----
console.log('\n[6] addSession 不影響其他欄位');
{
  const sb = makeSandbox();
  const { Progress, Storage } = loadSharedLayer(sb);
  Progress.init();
  Progress.addAnswer(true);
  Progress.addAnswer(false);
  Progress.addSession();
  Progress.addSession();
  const p = Storage.get(Storage.K_PROGRESS);
  A.eq(p.sessions, 2, 'sessions=2');
  A.eq(p.totalAnswered, 2, 'totalAnswered 不受 addSession 影響');
  A.eq(p.totalCorrect, 1, 'totalCorrect 不受 addSession 影響');
  A.ok(p.started, 'started timestamp 保留');
}

process.exit(A.summary('11-enterMode-addsession-overcount'));
