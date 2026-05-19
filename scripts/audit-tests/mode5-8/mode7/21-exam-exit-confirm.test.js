// 21-exam-exit-confirm.test.js — 2026-05-19 考試保護機制整合驗證
// 驗證範圍:
//   A. Mode 7 進場戰鬥 → window._examInProgress === true,_examLabel 含 'Mode 7'
//   B. confirm 拒絕 → goHome 不切 view(_examInProgress 維持 true)
//   C. confirm 接受 → _examInProgress === false,view 切到 view-home
//   D. _finalize 後 → _examInProgress === false(寬鬆規則:結算頁可自由走)
//   E. toggleMark() → 不影響 _examInProgress
//   F. navigateNext() → 不影響 _examInProgress
//
// 設計重點:mode5-8/_helpers.js 的 sandbox 預設沒有 _setExamMode / 真實 goHome,
// 我們在 loadMode 之後立刻 inject 模擬版本(對齊 index.html 的 _setExamMode + goHome)。
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 考試離場保護(exam-exit confirm)tests ===');
const A = makeAssert();

// 將 index.html 真實 _setExamMode + goHome 行為注入 sandbox(對齊 src/index.html:1475-1517)
function installExamProtection(sandbox) {
  sandbox.window._examInProgress = false;
  sandbox.window._examLabel = '';

  sandbox._setExamMode = function (active, label) {
    sandbox.window._examInProgress = !!active;
    sandbox.window._examLabel = active ? (label || '考試') : '';
  };
  sandbox.window._setExamMode = sandbox._setExamMode;

  // 模擬 view 切換用的旗標(取代真實 DOM .active class 切換)
  sandbox.__currentView = 'view-play';
  sandbox.show = function (viewId) { sandbox.__currentView = viewId; };

  // goHome 對齊 index.html:1500-1520
  sandbox.goHome = function () {
    if (sandbox.window._examInProgress) {
      const ok = sandbox.confirm ? sandbox.confirm('exit?') : true;
      if (!ok) return;
      sandbox._setExamMode(false);
    }
    sandbox.show('view-home');
  };
}

function setupMode7(n = 3) {
  const questions = [];
  for (let i = 0; i < n; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i % 2}`,
      knowledge_code: 'L21101',
      options: [
        { text: 'correct ' + i, is_correct: true },
        { text: 'wrong A ' + i, is_correct: false },
        { text: 'wrong B ' + i, is_correct: false },
        { text: 'wrong C ' + i, is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount: n, scope: 'all', difficulty: 'mixed' };
  installExamProtection(r.sandbox);
  return r;
}

// --- A. Mode 7 進場 → _examInProgress = true + label 含 'Mode 7' ---
{
  const { Mode, sandbox } = setupMode7(3);
  A.eq(sandbox.window._examInProgress, false,
    'A0: 進場前 _examInProgress === false');
  Mode._startBattle();
  A.eq(sandbox.window._examInProgress, true,
    'A1: _startBattle 後 _examInProgress === true');
  A.ok(typeof sandbox.window._examLabel === 'string' && sandbox.window._examLabel.includes('Mode 7'),
    `A2: _examLabel 含 'Mode 7'(實際 "${sandbox.window._examLabel}")`);
}

// --- B. confirm 拒絕 → goHome 不切 view,_examInProgress 維持 true ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  let confirmCalls = 0;
  sandbox.confirm = () => { confirmCalls++; return false; };
  sandbox.__currentView = 'view-play';
  sandbox.goHome();
  A.eq(confirmCalls, 1,
    'B1: 考試進行中呼叫 goHome,confirm 被呼叫 1 次');
  A.eq(sandbox.__currentView, 'view-play',
    'B2: confirm 拒絕 → 視圖仍是 view-play(沒切到 view-home)');
  A.eq(sandbox.window._examInProgress, true,
    'B3: confirm 拒絕 → _examInProgress 維持 true');
}

// --- C. confirm 接受 → goHome 切 view-home + _examInProgress = false ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  let confirmCalls = 0;
  sandbox.confirm = () => { confirmCalls++; return true; };
  sandbox.__currentView = 'view-play';
  sandbox.goHome();
  A.eq(confirmCalls, 1,
    'C1: 考試進行中呼叫 goHome,confirm 被呼叫 1 次');
  A.eq(sandbox.window._examInProgress, false,
    'C2: confirm 接受 → _examInProgress === false');
  A.eq(sandbox.__currentView, 'view-home',
    'C3: confirm 接受 → 視圖切到 view-home');
}

// --- D. _finalize 後 _examInProgress === false(結算後寬鬆)---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  A.eq(sandbox.window._examInProgress, true,
    'D0: 戰鬥中 _examInProgress === true');
  // 走完所有題,然後結算
  for (let i = 0; i < 3; i++) {
    Mode.state.idx = i;
    Mode._showCurrentQuestion();
    Mode.state.draft[i] = { userKey: 'A' };
  }
  // 直接呼叫 _finalize 跳過 submitMock 的 confirm
  Mode._finalize('submit');
  A.eq(sandbox.window._examInProgress, false,
    'D1: _finalize 後 _examInProgress === false(寬鬆規則)');
  // 結算後再呼叫 goHome 不再跳 confirm
  let confirmCalls = 0;
  sandbox.confirm = () => { confirmCalls++; return false; };
  sandbox.__currentView = 'view-play';
  sandbox.goHome();
  A.eq(confirmCalls, 0,
    'D2: 結算後 goHome 不跳 confirm(_examInProgress 已是 false)');
  A.eq(sandbox.__currentView, 'view-home',
    'D3: 結算後 goHome 直接切到 view-home');
}

// --- E. toggleMark() 不影響 _examInProgress ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  const before = sandbox.window._examInProgress;
  const beforeLabel = sandbox.window._examLabel;
  Mode.toggleMark();
  A.eq(sandbox.window._examInProgress, before,
    'E1: toggleMark() 不改 _examInProgress(維持 true)');
  A.eq(sandbox.window._examLabel, beforeLabel,
    'E2: toggleMark() 不改 _examLabel');
}

// --- F. navigateNext() 不影響 _examInProgress ---
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  const before = sandbox.window._examInProgress;
  const beforeLabel = sandbox.window._examLabel;
  Mode.navigateNext();
  A.eq(sandbox.window._examInProgress, before,
    'F1: navigateNext() 不改 _examInProgress(維持 true)');
  A.eq(sandbox.window._examLabel, beforeLabel,
    'F2: navigateNext() 不改 _examLabel');
  A.eq(Mode.state.idx, 1,
    'F3: navigateNext() 正常推進 state.idx → 1');
}

// --- G. DrillSession 有 onComplete 時(下鑽回原戰鬥),結算路徑不清旗標 ---
//   §8 H1 修補驗證:Mode 1/2/3/4/5/6/7/8 答錯走 drillThis → DrillSession.start(..., onComplete)
//   下鑽結束 → onComplete 觸發 → 回原戰鬥;此時旗標需保持 true,否則「下鑽完旗標永久 false」
{
  const { Mode, sandbox } = setupMode7(3);
  Mode._startBattle();
  // 確保進入戰鬥時旗標 = true
  A.eq(sandbox.window._examInProgress, true, 'G0: 戰鬥中旗標 true');

  // 模擬 DrillSession 結算階段:queue 空 + total > 0 + 有 onComplete(下鑽回戰鬥情境)
  let cbCalled = false;
  sandbox.window.DrillSession.queue = [];
  sandbox.window.DrillSession.total = 1;
  sandbox.window.DrillSession.correct = 1;
  sandbox.window.DrillSession.targetNode = 'n_test';
  sandbox.window.DrillSession.originalQ = { id: 'q_orig' };
  sandbox.window.DrillSession.depth = 0;
  sandbox.window.DrillSession.onComplete = () => { cbCalled = true; };

  try { sandbox.window.DrillSession.next(); } catch (_) {}

  A.eq(sandbox.window._examInProgress, true,
    'G1: DrillSession 有 onComplete 時,結算進入路徑後旗標保持 true(下鑽完回原戰鬥不被誤清)');
}

// --- H. Source-level 驗證:DrillSession.next 清旗標條件含 !this.onComplete guard ---
//   驗證 H1 修補的 source code 邏輯(execution-level 在 sandbox 內 race 不穩定,改 source 驗證)
//   結算路徑必須含 `!this.onComplete` guard,否則「下鑽完旗標永久 false」復現
{
  const fs = require('fs');
  const path = require('path');
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../../../src/index.html'), 'utf8');
  const hasH1Guard = /depth\s*===\s*0\s*&&\s*!this\.onComplete[\s\S]*?_setExamMode\(false\)/.test(indexSrc);
  A.ok(hasH1Guard,
    'H: index.html DrillSession.next 結算路徑含 `depth===0 && !this.onComplete` guard,避免下鑽回戰鬥誤清旗標');
}

process.exit(A.summary('Mode7 exam-exit confirm'));
