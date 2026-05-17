// 04-drillsession-basic.test.js — DrillSession 啟動 / 進度 / cleanup
// 不載入真 PlayEngine(太大);改用 mock PlayEngine 觀察 hook 呼叫
const { makeSandbox, loadStorage, loadWrongbook, loadMastery, loadGameFX,
        loadDrillSession, makeAssert, sliceConst, readIndex } = require('./_helpers');
const vm = require('vm');

console.log('=== DrillSession basic tests ===');
const A = makeAssert();

// 共用 setup:必要 stubs
function setup(opts = {}) {
  const sb = makeSandbox(opts);
  loadStorage(sb);
  loadWrongbook(sb);
  loadMastery(sb);
  loadGameFX(sb);
  // Mock PlayEngine
  const playLog = [];
  sb.PlayEngine = {
    current: null,
    show(q, opts2) { playLog.push({ event: 'show', q, opts: opts2 }); this.current = q; },
    answer(key) { playLog.push({ event: 'answer', key }); },
    onNext: null,
    __nativeAnswer: null,
  };
  sb.PlayEngine.__nativeAnswer = sb.PlayEngine.answer;
  // 注意:loadDrillSession 內部 vm.runInContext 會以 sandbox 為 global,
  // DrillSession.start 內呼叫 PlayEngine.show 必需找得到 sandbox.PlayEngine
  // 因此不能裸名 — runInContext 內裸名就讀 sandbox 屬性,OK
  const DrillSession = loadDrillSession(sb);
  return { sb, DrillSession, playLog };
}

// ----- 1. 空 questions 走 fallback (2026-05-17 新規則:silent fallback,無 toast 無 delay,直接 onComplete) -----
console.log('\n[1] empty questions array — silent fallback (2026-05-17)');
{
  const { sb, DrillSession } = setup();
  let cbCalled = false;
  DrillSession.start('node1', [], { id: 'q_origin' }, () => { cbCalled = true; });
  // 新規則:不顯 toast(避免打斷玩家節奏)
  A.eq(sb.__toasts.some(t => t.includes('找不到變化型')), false,
    '✅ 2026-05-17:空 queue 不再顯「找不到變化型」toast');
  // 新規則:onComplete 同步呼叫(不再 setTimeout)
  A.eq(cbCalled, true, '✅ 2026-05-17:onComplete 同步呼叫(無 setTimeout 延遲)');
}

// ----- 2. 正常 3 題啟動 -----
console.log('\n[2] start with 3 questions');
{
  const { sb, DrillSession, playLog } = setup();
  const variations = [
    { id: 'v1', _drillStrategy: '換角度', options: [{ key: 'A', is_correct: true }] },
    { id: 'v2', _drillStrategy: '易混淆對手', options: [{ key: 'B', is_correct: true }] },
    { id: 'v3', _drillStrategy: '加深難度', options: [{ key: 'C', is_correct: true }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ', explanation: { hook: 'TEST' } });
  A.eq(DrillSession.total, 3, 'total=3');
  A.eq(DrillSession.queue.length, 2, '2 remaining after first shift');
  A.eq(playLog[0].event, 'show', 'first show event');
  A.eq(playLog[0].q.id, 'v1', 'first question = v1');
  A.ok(playLog[0].opts.contextHTML.includes('下鑽訓練 1/3'),
    'contextHTML shows progress 1/3');
  A.ok(playLog[0].opts.contextHTML.includes('TEST'), 'upperHook propagated to context');
}

// ----- 3. answer correct → DrillSession.correct++ -----
console.log('\n[3] answer wrap counts correct');
{
  const { sb, DrillSession } = setup();
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
    { id: 'v2', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  // 模擬使用者答對
  sb.PlayEngine.answer('A');
  A.eq(DrillSession.correct, 1, 'correct incremented to 1');
  // try/finally 後 answer 已還原成原生
  // 再答對(在新的下鑽題 — 需要 sb.PlayEngine.current 先指到 v2)
  // 為驗證 finally 還原:check answer 是否 == original
  A.eq(sb.PlayEngine.answer, sb.PlayEngine.__nativeAnswer,
    'PlayEngine.answer restored to native after wrap (try/finally)');
}

// ----- 4. answer wrong → correct NOT incremented -----
console.log('\n[4] wrong answer does not increment');
{
  const { sb, DrillSession } = setup();
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  sb.PlayEngine.answer('B');
  A.eq(DrillSession.correct, 0, 'wrong answer: correct stays 0');
}

// ----- 5. next() 走完 → mastery + wrongbook 動作 -----
console.log('\n[5] queue exhaustion → Mastery.drillBonus + Wrongbook.markMastered');
{
  const { sb, DrillSession } = setup({ runTimers: false });
  // 設定 wrongbook 有 origQ
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.add('origQ', 'node1', 'A', 'B', 'ans', 'corr');
  A.eq(Wrongbook.load().find(x => x.qid === 'origQ').mastered, false, 'origQ not mastered yet');
  const Mastery = vm.runInContext('Mastery', sb);
  const m0 = Mastery.load();
  A.ok(!m0['node1'] || (m0['node1'].correct || 0) === 0, 'no mastery for node1');

  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }] }
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  // 模擬完成 v1
  sb.PlayEngine.current = { id: 'origQ' };
  DrillSession.next(); // queue 空了,觸發 mastery + wrongbook
  const m1 = Mastery.load();
  A.ok(m1['node1'], 'Mastery.drillBonus called → node1 entry created');
  const wb = Wrongbook.load().find(x => x.qid === 'origQ');
  A.eq(wb.mastered, true, 'Wrongbook.markMastered called');
}

// ----- 6. onComplete callback -----
console.log('\n[6] onComplete callback invocation');
{
  const { sb, DrillSession } = setup({ runTimers: true });
  let cbInvoked = 0;
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }] }
  ];
  sb.PlayEngine.current = { id: 'origQ' };
  DrillSession.start('node1', variations, { id: 'origQ' }, () => { cbInvoked++; });
  DrillSession.next();
  // runTimers=true: setTimeout 2000 cb 同步跑
  A.ok(cbInvoked >= 1, `onComplete invoked (count=${cbInvoked})`);
  // 不能重覆呼叫(clearing this.onComplete)
  A.eq(DrillSession.onComplete, null, 'onComplete cleared after first call');
}

// ----- 7. 沒 onComplete → goHome -----
console.log('\n[7] no onComplete falls through to goHome');
{
  const { sb, DrillSession } = setup({ runTimers: true });
  sb.__wentHome = false;
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }] }
  ];
  sb.PlayEngine.current = { id: 'origQ' };
  DrillSession.start('node1', variations, { id: 'origQ' });
  DrillSession.next();
  A.ok(sb.__wentHome, 'goHome called when no onComplete');
}

// ----- 8. strategyEmoji map present -----
console.log('\n[8] strategyEmoji map');
{
  const { DrillSession } = setup();
  A.ok(DrillSession.strategyEmoji['換角度'], 'has 換角度 emoji');
  A.ok(DrillSession.strategyEmoji['易混淆對手'], 'has 易混淆對手 emoji');
  A.ok(DrillSession.strategyEmoji['加深難度'], 'has 加深難度 emoji');
}

// ----- 9. 攻擊:variations 為 null (2026-05-17 新規則:silent fallback)-----
console.log('\n[9] attack: variations=null — silent fallback');
{
  const { sb, DrillSession } = setup();
  let cbCalled = false;
  A.nothrow(() => DrillSession.start('node1', null, { id: 'origQ' }, () => { cbCalled = true; }),
    'null variations: no throw');
  // 新規則:silent fallback,不顯 toast,onComplete 同步呼叫
  A.eq(sb.__toasts.some(t => t.includes('找不到變化型')), false,
    '✅ 2026-05-17:null variations 不再顯 toast');
  A.eq(cbCalled, true, '✅ 2026-05-17:null variations onComplete 同步呼叫');
}

// ----- 10. 攻擊:originalQ.explanation.hook 含 XSS -----
console.log('\n[10] XSS in originalQ.explanation.hook');
{
  const { sb, DrillSession, playLog } = setup();
  const variations = [
    { id: 'v1', _drillStrategy: '換角度', options: [{ key: 'A', is_correct: true }] }
  ];
  const origQ = {
    id: 'origQ',
    explanation: { hook: '<script>alert(1)</script>' },
    knowledge_code: '<img onerror=alert(2)>',
    misconceptions: ['<svg onload=alert(3)>'],
  };
  DrillSession.start('node1', variations, origQ);
  const ctx = playLog[0].opts.contextHTML;
  // DrillSession 內 contextHTML 直接用 template literal 插入未 escape — 是潛在 bug
  // 但此處只記錄行為,不強行斷言「應 escape」(若代碼未做就會 raw 插入)
  if (ctx.includes('<script>alert')) {
    A.assert(false, 'BUG: contextHTML does NOT escape upperHook XSS');
  } else {
    A.assert(true, 'contextHTML escapes XSS (good)');
  }
  // 至少不該 throw
  A.ok(ctx.length > 0, 'contextHTML produced');
}

// ----- 11. queue.shift() 序列正確 -----
console.log('\n[11] queue.shift order');
{
  const { sb, DrillSession } = setup();
  const variations = [
    { id: 'A', options: [{ key: 'A', is_correct: true }] },
    { id: 'B', options: [{ key: 'A', is_correct: true }] },
    { id: 'C', options: [{ key: 'A', is_correct: true }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  // 第一題已 shift 為 A
  A.eq(DrillSession.queue.length, 2, '2 left after first shift');
  A.eq(DrillSession.queue[0].id, 'B', 'next is B');
  DrillSession.next();
  A.eq(DrillSession.queue[0].id, 'C', 'after next: C');
  DrillSession.next();
  A.eq(DrillSession.queue.length, 0, 'queue empty');
}

// ----- 12. PlayEngine.onNext hook set 正確 -----
console.log('\n[12] PlayEngine.onNext hook set');
{
  const { sb, DrillSession } = setup();
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }] }
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  A.ok(typeof sb.PlayEngine.onNext === 'function', 'PlayEngine.onNext is a function');
  // 模擬使用者點下一題
  A.nothrow(() => sb.PlayEngine.onNext(), 'onNext() no throw');
}

// ----- 13. 2026-05-17 鐵律 #1:depth 起始 0,start 接受 depth 參數 -----
console.log('\n[13] depth tracking — 2026-05-17 deep drill 鐵律 #1');
{
  const { sb, DrillSession } = setup();
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }] }
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  A.eq(DrillSession.depth, 0, '預設 depth=0');
  // 重新 start 並傳 depth=1
  DrillSession.start('node1', variations, { id: 'origQ' }, null, 1);
  A.eq(DrillSession.depth, 1, 'start depth=1 被尊重');
  // 不傳 depth → 預設 0
  DrillSession.start('node1', variations, { id: 'origQ' }, null);
  A.eq(DrillSession.depth, 0, '不傳 depth → 預設 0');
}

// ----- 14. 2026-05-17 鐵律 #1:100% 全對 → SeenCorrect.mark(originalQ.id) -----
console.log('\n[14] SeenCorrect.mark on 100% — 2026-05-17 鐵律 #1');
{
  const { sb, DrillSession } = setup({ runTimers: true });
  sb.__seenMarks = []; // reset
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }] }
  ];
  // 模擬 100% 全對:start + answer 'A' + next 完成
  DrillSession.start('node1', variations, { id: 'origQ_target' });
  sb.PlayEngine.answer('A'); // correct
  DrillSession.next();       // queue 空,觸發完成邏輯
  A.ok(sb.__seenMarks.includes('origQ_target'),
    `✅ 100% 全對 → SeenCorrect.mark(originalQ.id) 被呼叫,marks=${JSON.stringify(sb.__seenMarks)}`);
}

// ----- 15. 2026-05-17 鐵律 #1:非 100% → 不 mark SeenCorrect -----
console.log('\n[15] non-100% → no SeenCorrect.mark — 2026-05-17 鐵律 #1');
{
  const { sb, DrillSession } = setup({ runTimers: true });
  sb.__seenMarks = []; // reset
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
    { id: 'v2', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ_partial' });
  sb.PlayEngine.answer('A'); // correct (1/2)
  DrillSession.next();        // 推進到 v2
  sb.PlayEngine.answer('B'); // wrong (still 1/2 = 50%)
  DrillSession.next();        // 完成
  A.eq(sb.__seenMarks.includes('origQ_partial'), false,
    `✅ 50% 不 mark SeenCorrect,marks=${JSON.stringify(sb.__seenMarks)}`);
}

// ----- 16. 2026-05-17 鐵律 #1:Mastery.drillBonus 收到 ratio 參數 -----
console.log('\n[16] Mastery.drillBonus receives ratio — 2026-05-17 鐵律 #1');
{
  const { sb, DrillSession } = setup({ runTimers: true });
  // wrap Mastery.drillBonus 觀察 ratio 參數
  const Mastery = vm.runInContext('Mastery', sb);
  const origDrillBonus = Mastery.drillBonus.bind(Mastery);
  let receivedRatio = null;
  Mastery.drillBonus = (nodeId, ratio) => { receivedRatio = ratio; return origDrillBonus(nodeId, ratio); };
  const variations = [
    { id: 'v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
    { id: 'v2', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  sb.PlayEngine.answer('A'); // correct
  DrillSession.next();
  sb.PlayEngine.answer('B'); // wrong → 1/2 = 0.5
  DrillSession.next();
  A.eq(receivedRatio, 0.5, `✅ drillBonus 收到 ratio=0.5(實際 ${receivedRatio})`);
}

// ----- 17. 2026-05-17 鐵律 #1:deep drill 觸發 — 頂層答錯 + generateVariation 有題 -----
console.log('\n[17] deep drill triggers on wrong (depth 0→1) — 2026-05-17 鐵律 #1');
{
  const { sb, DrillSession } = setup();
  // 模擬 generateVariation 回傳 1 題 nested
  sb.generateVariation = (q, n) => [
    { id: 'deep_v1', _drillStrategy: '換角度', options: [{ key: 'A', is_correct: true }] }
  ];
  const variations = [
    { id: 'top_v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ' }, null, 0);
  A.eq(DrillSession.depth, 0, '初始 depth=0');
  sb.PlayEngine.answer('B'); // wrong
  // 模擬使用者點「下一題」→ 應觸發 deep drill 而非 next()
  sb.PlayEngine.onNext();
  A.eq(DrillSession.depth, 1, '✅ wrong answer 觸發 nested drill,depth → 1');
  // nested 啟動了 1 題,start 內部會立刻 next() 將該題 shift 出,所以 queue.length === 0
  A.eq(DrillSession.total, 1, '✅ nested drill total=1(1 題 deep drill)');
  A.eq(DrillSession._parentStack.length, 1, '✅ 父層 state 已壓入 _parentStack');
}

// ----- 18. 2026-05-17 鐵律 #1:deep drill 不會無限巢狀(depth=1 不再 nested)-----
console.log('\n[18] no further nesting at depth=1 — 2026-05-17 鐵律 #1');
{
  const { sb, DrillSession } = setup();
  let varCallCount = 0;
  sb.generateVariation = (q, n) => {
    varCallCount++;
    return [{ id: 'deep' + varCallCount, _drillStrategy: '換角度', options: [{ key: 'A', is_correct: true }, { key: 'B' }] }];
  };
  // 直接以 depth=1 啟動(模擬已進 nested)
  const variations = [
    { id: 'nested_v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
  ];
  DrillSession.start('nodeX', variations, { id: 'origQ' }, null, 1);
  sb.PlayEngine.answer('B'); // wrong in nested
  // onNext 應該走 next() 而非 _enterDeep
  A.nothrow(() => sb.PlayEngine.onNext(), 'depth=1 wrong → no throw');
  A.eq(DrillSession._parentStack.length, 0,
    `✅ depth=1 答錯不 nested(_parentStack 仍空),varCallCount=${varCallCount}`);
}

// ----- 19. 2026-05-17 鐵律 #1:_enterDeep 找不到變化型 → silent fallback 進 next() -----
console.log('\n[19] _enterDeep no-variation fallback — 2026-05-17 鐵律 #1');
{
  const { sb, DrillSession } = setup();
  // generateVariation 回空 → silent fallback
  sb.generateVariation = (q, n) => [];
  const variations = [
    { id: 'top_v1', options: [{ key: 'A', is_correct: true }, { key: 'B' }] },
    { id: 'top_v2', options: [{ key: 'A', is_correct: true }] },
  ];
  DrillSession.start('node1', variations, { id: 'origQ' });
  sb.PlayEngine.answer('B'); // wrong
  sb.PlayEngine.onNext();    // 應 silent fallback,直接 next() → 顯示 top_v2
  A.eq(DrillSession.depth, 0, '✅ 沒進 nested,depth 維持 0');
  A.eq(DrillSession._parentStack.length, 0, '✅ _parentStack 空');
}

process.exit(A.summary('DrillSession'));
