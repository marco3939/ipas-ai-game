// 03-sm2-render-xss.test.js — SM-2 renderReviewList HTML escape 驗證
const { makeSandbox, loadStorage, loadSM2, makeAssert } = require('./_helpers');

console.log('=== SM-2 render XSS tests ===');
const A = makeAssert();

function injectView(sandbox) {
  return sandbox.document.__inject('view-sm2-review');
}
function seedState(SM2, qid, partial) {
  const all = SM2.load();
  all[qid] = Object.assign(
    { ef: 2.5, interval: 1, repetition: 1, lastReview: Date.now(), nextDue: Date.now() - 1000 },
    partial
  );
  SM2.save(all);
}

// ----- 1. 正常渲染 -----
console.log('\n[1] normal render path');
{
  const sb = makeSandbox({ QUESTIONS: [{ id: 'q1', stem: 'What is X?' }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'q1', { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(view.innerHTML.includes('q1'), 'normal qid renders');
  A.ok(view.innerHTML.includes('What is X?'), 'stem renders');
  A.ok(view.innerHTML.includes('已到期') || view.innerHTML.includes('到期'), 'due label present');
}

// ----- 2. XSS qid 攻擊 -----
console.log('\n[2] XSS in qid');
{
  const xssQid = '<img src=x onerror=alert(1)>';
  const sb = makeSandbox({ QUESTIONS: [{ id: xssQid, stem: 'normal' }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, xssQid, { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(!view.innerHTML.includes('<img src=x'), 'raw <img tag NOT injected in qid path');
  A.ok(view.innerHTML.includes('&lt;img'), 'qid &lt; escape present');
  // 注意:`onerror=alert` 子字串會出現是正常的(escape 不動 = 號),
  // 真正的 XSS 條件是「外層 < 被 escape」,只要 < 變 &lt; 整段就無法執行
  // 這裡只驗證 attribute 化的形式不存在(`<img...onerror`)
  A.ok(!/<img[^>]*onerror/.test(view.innerHTML), 'no executable <img...onerror>');
}

// ----- 3. XSS in stem -----
console.log('\n[3] XSS in stem');
{
  const xssStem = '<script>alert("xss")</script>';
  const sb = makeSandbox({ QUESTIONS: [{ id: 'safe_qid', stem: xssStem }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'safe_qid', { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(!view.innerHTML.includes('<script>alert'), '<script> not raw-injected');
  A.ok(view.innerHTML.includes('&lt;script&gt;'), 'stem &lt;script&gt; escaped');
}

// ----- 4. quote / ampersand 攻擊 -----
console.log('\n[4] quote / ampersand escape');
{
  const qid = `"&'<>`;
  const sb = makeSandbox({ QUESTIONS: [{ id: qid, stem: `Quote test "&'<>` }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, qid, { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(view.innerHTML.includes('&quot;'), '" escaped to &quot;');
  A.ok(view.innerHTML.includes('&#39;'), "' escaped to &#39;");
  A.ok(view.innerHTML.includes('&amp;'), '& escaped to &amp;');
  // 不應該有未轉義的 raw <
  // (注意:innerHTML 含 SVG / HTML markup 也有 < — 我們驗證 attack 字串那段)
  A.ok(!view.innerHTML.match(/[^&]<>/), 'no raw <> from injected qid');
}

// ----- 5. 題目已刪除 (q===null) -----
console.log('\n[5] 題庫已刪除 fallback');
{
  const sb = makeSandbox({ QUESTIONS: [] }); // 空題庫
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'ghost_qid', { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(view.innerHTML.includes('題庫已移除'), 'displays fallback for deleted q');
  A.ok(view.innerHTML.includes('ghost_qid'), 'qid still shown');
}

// ----- 6. stem 含 placeholder -----
console.log('\n[6] stem with {placeholder} replaced by ?');
{
  const sb = makeSandbox({ QUESTIONS: [{ id: 'q_placeholder', stem: 'Compute {x} + {y}' }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'q_placeholder', { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(view.innerHTML.includes('Compute ? + ?'),
    'placeholder {x}{y} replaced with ?');
  A.ok(!view.innerHTML.includes('{x}'), '{x} replaced');
}

// ----- 7. stem ≥ 60 chars 截斷 -----
console.log('\n[7] stem > 60 chars truncated');
{
  const longStem = 'X'.repeat(200);
  const sb = makeSandbox({ QUESTIONS: [{ id: 'q_long', stem: longStem }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'q_long', { nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  // 60 chars + '...' 後綴
  const xCount = (view.innerHTML.match(/X/g) || []).length;
  A.ok(xCount <= 100, `stem truncated (got ${xCount} X's, was 200)`);
}

// ----- 8. 大量 queue 渲染不爆 -----
console.log('\n[8] large queue stress');
{
  const QUESTIONS = [];
  for (let i = 0; i < 100; i++) QUESTIONS.push({ id: `q_${i}`, stem: `Question ${i}` });
  const sb = makeSandbox({ QUESTIONS });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  for (let i = 0; i < 100; i++) seedState(SM2, `q_${i}`, { nextDue: Date.now() - i * 100 });
  SM2.queue = SM2.getDueQueue(true);
  A.nothrow(() => SM2.renderReviewList(), '100-item render no throw');
  A.ok(view.innerHTML.length > 0, 'innerHTML rendered');
  A.ok(view.innerHTML.includes('100 題到期'), 'total count rendered');
}

// ----- 9. EF 數字格式 -----
console.log('\n[9] EF.toFixed(2) format');
{
  const sb = makeSandbox({ QUESTIONS: [{ id: 'q1', stem: 'test' }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'q1', { ef: 2.345, nextDue: Date.now() - 1000 });
  SM2.queue = SM2.getDueQueue(true);
  SM2.renderReviewList();
  A.ok(view.innerHTML.includes('EF 2.35') || view.innerHTML.includes('EF 2.34'),
    'EF formatted to 2 decimals');
}

// ----- 10. enterReview 空 queue → showToast 而非 throw -----
console.log('\n[10] enterReview with empty queue');
{
  const sb = makeSandbox();
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  let toastMsg = '';
  sb.showToast = (m) => { toastMsg = m; };
  A.nothrow(() => SM2.enterReview(), 'enterReview no throw on empty queue');
  A.ok(toastMsg.includes('今日無') || toastMsg.includes('無待'), `toast msg: "${toastMsg}"`);
  A.ok(sb.__wentHome, 'goHome called on empty queue');
}

// ----- 11. 反例:nextDue=Infinity (寬泛驗證) -----
console.log('\n[11] Infinity nextDue boundary');
{
  const sb = makeSandbox({ QUESTIONS: [{ id: 'q_inf', stem: 'test' }] });
  loadStorage(sb);
  const SM2 = loadSM2(sb);
  const view = injectView(sb);
  seedState(SM2, 'q_inf', { nextDue: Infinity });
  // Infinity > now (any) → 不在 overdue 範圍,countDueToday=0
  A.eq(SM2.countDueToday(), 0, 'Infinity nextDue not overdue');
  // overdueOnly=false 仍 Infinity > now+DAY 也不入
  A.eq(SM2.getDueQueue(false).length, 0, 'Infinity nextDue not in tomorrow either');
}

process.exit(A.summary('SM2 render XSS'));
