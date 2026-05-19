// 07-drillThis-callback.test.js
// 案例 6:drillThis vs gameOver setTimeout race
//   HP=0 點下鑽進 DrillSession,1.5s 後 gameOver 把畫面洗掉。
//   Mode 1 治本方案:drillThis 前 _clearAllTimers + onComplete 內檢查 hp ≤ 0 走 gameOver。
//
// 重要發現:**Mode 5 目前的 drillThis 並沒有實施案例 6 的兩個防護**(mode5.js:759-771):
//   1. 沒 _clearAllTimers(若上一輪 takeDamage 排了 gameOver timer,會在 DrillSession 期間觸發)
//   2. onComplete callback 沒檢查 Player.hp <= 0 → 直接走 next()
//
// 任務指示:**不要改 mode5.js**,把 test 案例 expect 對齊現有行為,並在回報中註明 potential bug。
// 本檔的 contract test 對應 mode5.js 當前實作:
//   - drillThis 必呼叫 DrillSession.start 帶 nodeId/variations/sourceQ/callback
//   - callback 是 function,執行時走 renderBattle + next
//   - 中途 state 被清(goHome)後 callback 應不 crash(目前是否如此需要 test 驗證)
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 5 drillThis callback (case 6) tests ===');
const A = makeAssert();

function setup(opts = {}) {
  const questions = opts.questions || [
    makeQ('q1', { node_id: 'N_A' }),
    makeQ('q2', { node_id: 'N_A' }),
    makeQ('q3', { node_id: 'N_A' }),
  ];
  const r = loadMode(5, { questions });
  r.Mode.cachedBosses = [{ nodeId: 'N_A', source: 'wrongbook', weak: 1 }];
  r.Mode.engageBoss(0);
  r.Mode.showQuestion();
  return r;
}

// --- 1: 答錯後 drillThis 啟動 DrillSession.start,帶 4 個正確 args ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  Mode.answer(wrong.key);

  Mode.drillThis();
  A.eq(stats.drillStarts.length, 1, 'DrillSession.start 被呼叫一次');
  const d = stats.drillStarts[0];
  A.eq(d.nodeId, q.node_id, 'DrillSession arg1 = nodeId');
  A.ok(Array.isArray(d.variations) && d.variations.length > 0,
    `arg2 = variations array(len=${d.variations && d.variations.length})`);
  A.ok(d.sourceQ === q || (d.sourceQ && d.sourceQ.id === q.id),
    'arg3 = sourceQ(原題,供 DrillSession 結算用)');
  A.ok(typeof d.onComplete === 'function', 'arg4 = onComplete callback (案例 1)');
}

// --- 2: onComplete callback 內 hp > 0 → 走 renderBattle + next(繼續戰鬥) ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  Mode.answer(wrong.key);
  const idxBefore = Mode.state.idx;

  Mode.drillThis();
  const cb = stats.drillStarts[0].onComplete;
  // hp 還在(預設 100),不應走 gameOver
  A.nothrow(() => cb(), 'onComplete(hp>0)執行不 crash');
  A.eq(Mode.state.idx, idxBefore + 1,
    `onComplete 走 next() 推進 idx(${idxBefore} → ${Mode.state.idx})`);
}

// --- 3: variations 不足 → drillThis showToast 不啟動 DrillSession ---
{
  // generateVariation 的 sandbox stub:傳 q 就會回 N 變化,但 q 不存在 → 回 []
  const { Mode, stats, sandbox } = setup();
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  Mode.answer(wrong.key);
  // monkey-patch generateVariation 暫返空
  const orig = sandbox.generateVariation;
  sandbox.generateVariation = () => [];
  const drillBefore = stats.drillStarts.length;
  const toastBefore = stats.toasts.length;
  Mode.drillThis();
  A.eq(stats.drillStarts.length, drillBefore,
    'variations=[] 時 DrillSession.start 不被呼叫');
  A.ok(stats.toasts.length > toastBefore,
    'variations=[] 時 showToast 「變化型不足」');
  sandbox.generateVariation = orig; // restore
}

// --- 4: drillThis 後 state.currentQ 仍指向原題(下鑽期間 sourceQ 保留) ---
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  Mode.answer(wrong.key);
  Mode.drillThis();
  // drillThis 不改 currentQ,只把 sourceQ 傳給 DrillSession
  A.ok(Mode.state.currentQ === q,
    'drillThis 期間 state.currentQ 仍指向原題(供 callback 結算用)');
  A.ok(stats.drillStarts[0].sourceQ === q,
    'DrillSession.start 收到的 sourceQ 是原題引用');
}

// --- 5: callback 內 state 已被清(模擬 goHome / cleanup)→ callback 不 crash ---
//   雖然 mode5.cleanup 不 null state(deliberate),但若日後改變或 race 把 state 清空,
//   callback 應 defensive。
//   注意:目前 mode5.js drillThis callback 並沒有 state-null guard,**會 crash**。
//   本 case 對齊現實 = expect crash(把這個現實記成 contract,改動時要明白破壞此 contract)。
{
  const { Mode, stats } = setup();
  const q = Mode.state.currentQ;
  const wrong = q.options.find(o => !o.is_correct);
  Mode.answer(wrong.key);
  Mode.drillThis();
  const cb = stats.drillStarts[0].onComplete;
  // 模擬中途 goHome / cleanup 把 state 清為 null
  Mode.state = null;
  let threw = false;
  try { cb(); } catch { threw = true; }
  // 目前現實:state=null 時 callback 內讀 s.boss.nodeId 會 throw
  // 此 assertion 把現實寫死成 contract;若日後加 state-null guard,此 assertion 要改為 ok(!threw)
  A.ok(threw,
    'state=null 後 callback 會 throw(現實對齊;若日後加 guard,需更新此 expect)');
}

process.exit(A.summary('Mode5 drillThis callback'));
