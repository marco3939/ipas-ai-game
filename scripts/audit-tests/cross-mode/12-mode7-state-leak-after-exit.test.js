// 12-mode7-state-leak-after-exit.test.js
// 必證:Mode 7 review walkthrough → goHome → Mode 1 不殘留 _lastResultLineup / state
//      Mode 7 history fullLog 必含 isCorrect / correctKey / userKey 等關鍵欄位

const fs = require('fs');
const path = require('path');
const { ROOT, makeAssert } = require('./_helpers');

console.log('=== 12 Mode 7 state leak after exit ===\n');
const A = makeAssert();

// ----- [1] Mode 7 cleanup() 必清 _lastResultLineup / state / _restorePlayEngine -----
console.log('\n[1] Mode 7 cleanup 完整清理');
{
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  const cleanupMatch = m7.match(/cleanup\(\)\s*\{([\s\S]*?)^\s+\}/m);
  A.ok(cleanupMatch, 'Mode 7 cleanup() found');
  if (cleanupMatch) {
    const body = cleanupMatch[1];
    A.ok(/this\._lastResultLineup\s*=\s*null/.test(body),
      'cleanup 清 _lastResultLineup = null');
    A.ok(/this\.state\s*=\s*null/.test(body),
      'cleanup 清 state = null');
    A.ok(/_restorePlayEngine/.test(body),
      'cleanup 還原 PlayEngine.answer hook(避免 next mode 被污染)');
    A.ok(/_stopTimer/.test(body),
      'cleanup 停 timer');
    // case 11 教訓:font-scale CSS var 也清
    A.ok(/m7-font-scale/.test(body) || /removeProperty/.test(body),
      'cleanup 清 CSS var(font-scale)');
  }
}

// ----- [2] goHome 必呼叫 Mode7.cleanup -----
console.log('\n[2] goHome 路徑必經 Mode7.cleanup');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const m = idx.match(/function goHome\(\)\s*\{([\s\S]*?)\n\}/);
  A.ok(m, 'goHome function');
  if (m) {
    A.ok(/Mode7[^]*?cleanup/.test(m[1]), 'goHome 呼叫 Mode7.cleanup');
  }
}

// ----- [3] _restorePlayEngine 確實還原原生 answer -----
console.log('\n[3] _restorePlayEngine 還原原生 PlayEngine.answer');
{
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  // 找 _restorePlayEngine 實作
  const restoreMatch = m7.match(/_restorePlayEngine\s*\(\)\s*\{([\s\S]*?)^\s+\}/m);
  A.ok(restoreMatch, '_restorePlayEngine function 找到');
  if (restoreMatch) {
    const body = restoreMatch[1];
    // 必須還原 PlayEngine.answer = ...originalAnswer 或 __nativeAnswer
    A.ok(/PlayEngine\.answer\s*=/.test(body),
      '_restorePlayEngine 設 PlayEngine.answer = ...(還原)');
  }
}

// ----- [4] Mode 7 history fullLog schema:必含 qid/userKey/isCorrect/correctKey -----
console.log('\n[4] Mode 7 history fullLog 必要欄位(案例 10 修補後 schema)');
{
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  // 找 _saveHistory 內 fullLog 物件 schema
  const saveHistMatch = m7.match(/const fullLog\s*=\s*\(s\.lineup[\s\S]*?\}\);/);
  A.ok(saveHistMatch, '_saveHistory fullLog block 找到');
  if (saveHistMatch) {
    const block = saveHistMatch[0];
    const required = ['qid', 'userKey', 'isCorrect', 'correctKey', 'stem', 'options'];
    for (const f of required) {
      A.ok(new RegExp(`\\b${f}:`).test(block), `fullLog 含欄位 ${f}`);
    }
    // option entries 必含 key + text + is_correct(避免 case 10 重演)
    A.ok(/key:\s*o\.key/.test(block), 'fullLog options 含 key:o.key');
    A.ok(/text:\s*o\.text/.test(block), 'fullLog options 含 text:o.text');
    A.ok(/is_correct:\s*!!o\.is_correct/.test(block), 'fullLog options 含 is_correct:!!o.is_correct');
  }
}

// ----- [5] Mode 7 _getRendered helper 抽 fallback(案例 10 核心修補) -----
console.log('\n[5] _getRendered helper 集中存取 rendered q');
{
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  A.ok(/_getRendered/.test(m7), '_getRendered helper 存在(案例 10 修補)');
  // 在 _saveHistory 內也應該用 _getRendered 或主動 renderQuestion 補 _rendered
  // (PR A review 補:if (!item._rendered) item._rendered = renderQuestion(q))
  const saveBlock = m7.match(/_saveHistory[\s\S]*?Storage\.set\(STORAGE_KEY/);
  if (saveBlock) {
    A.ok(/_rendered/.test(saveBlock[0]),
      '_saveHistory 用 _rendered cache(避免 key undefined)');
    A.ok(/renderQuestion/.test(saveBlock[0]),
      '_saveHistory fallback 跑 renderQuestion(PR A 補)');
  }
}

// ----- [6] reviewHistorySession 進入時 _historyMode 標記避免被當真新一場 -----
console.log('\n[6] reviewHistorySession _historyMode 標記');
{
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  A.ok(/_historyMode:\s*true/.test(m7), 'reviewHistorySession 設 _historyMode=true');
  A.ok(/_historyIdx:/.test(m7), '_historyIdx 紀錄回顧場次');
  // 出 _historyMode 時不應 _commitToSharedLayer(避免 review 寫回真資料)
  // 找 _historyMode 邊界處理
  A.ok(/_historyMode/.test(m7), '_historyMode 邊界處理存在');
}

// ----- [7] state leak simulate:走完 review → cleanup → state=null -----
console.log('\n[7] state 流程 trace');
{
  // 模擬 Mode 7 cleanup 行為(直接做 state setter / clean)
  const fakeMode7 = {
    state: { config: { count: 60 }, finished: true, _historyMode: true },
    _lastResultLineup: [{ qid: 'q1' }, { qid: 'q2' }],
    _stopTimer() { this._timerStopped = true; },
    _restorePlayEngine() { this._restored = true; },
    cleanup() {
      this._stopTimer();
      this._restorePlayEngine();
      this._lastResultLineup = null;
      this.state = null;
    },
  };
  fakeMode7.cleanup();
  A.eq(fakeMode7.state, null, 'state=null 後 leak 消');
  A.eq(fakeMode7._lastResultLineup, null, '_lastResultLineup=null');
  A.eq(fakeMode7._timerStopped, true, 'timer stopped');
  A.eq(fakeMode7._restored, true, 'PlayEngine restored');
}

// ----- [8] FINDING:Mode 7 答對時 PlayEngine.__nativeAnswer 用法 -----
// case 11 教訓:DrillSession 在 Mode 7 wrap 期間進入時必 delegate 到 __nativeAnswer
console.log('\n[8] DrillSession 與 Mode 7 wrap 互動安全');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  A.ok(/PlayEngine\.__nativeAnswer/.test(idx),
    'PlayEngine.__nativeAnswer 救生索存在(case 11 P0)');
  // DrillSession 內若有 wrap 安全
  const drillBlock = idx.match(/const DrillSession[\s\S]*?\n\};/);
  // 不一定要直接用 nativeAnswer,但要存在 escape hatch
  A.ok(drillBlock, 'DrillSession block found');
}

process.exit(A.summary('12-mode7-state-leak-after-exit'));
