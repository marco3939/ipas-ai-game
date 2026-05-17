// 09-storage-quota-saturation.test.js  ★ PR #27 HIGH-5D 修補
// 必證:Storage.set 在 quota 滿時:
//   - 不 throw uncaught(catch 內部)
//   - persistent banner 顯示(_showQuotaBanner)
//   - showToast 也呼叫(throttled)
//   - Storage._writeFailed = true 標記

const { makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 09 Storage quota saturation ===\n');
const A = makeAssert();

// ----- [1] 填滿 quota → 觸發 banner -----
console.log('\n[1] quota 滿觸發 persistent banner(PR #27 HIGH-5D)');
{
  // quotaBytes 只有 100 bytes,寫一筆大資料就爆
  let toastCalls = 0;
  const sb = makeSandbox({ quotaBytes: 100 });
  sb.showToast = () => toastCalls++;
  const { Storage } = loadSharedLayer(sb);

  // 1. 先寫小東西 OK
  Storage.set('ipas_progress_v1', { sessions: 1 });
  A.ok(!Storage._writeFailed, 'small write 不觸發 _writeFailed');

  // 2. 寫大東西 → quota fail
  const bigStr = 'x'.repeat(500);
  Storage.set('ipas_mastery_v1', bigStr);

  A.eq(Storage._writeFailed, true, 'Storage._writeFailed=true');
  A.ge(toastCalls, 1, 'showToast 被呼叫');

  // banner 應該已加入 DOM
  A.eq(sb.__docMock._bannerAdded, true, '_showQuotaBanner 已加入 DOM banner');
  A.ok(sb.__elements['storage-quota-banner'], 'storage-quota-banner element 存在');
  const bannerInner = sb.__elements['storage-quota-banner'].innerHTML;
  A.ok(/儲存失敗/.test(bannerInner), 'banner 內容含「儲存失敗」');
  A.ok(/匯出進度/.test(bannerInner), 'banner 提示「匯出進度」');
}

// ----- [2] banner 是 persistent — 多次失敗只加一次 -----
console.log('\n[2] banner persistent(只加一次,不重複)');
{
  const sb = makeSandbox({ quotaBytes: 100 });
  const { Storage } = loadSharedLayer(sb);
  const bigStr = 'x'.repeat(500);
  Storage.set('k1', bigStr);
  Storage.set('k2', bigStr);
  Storage.set('k3', bigStr);
  // 只有一個 banner element
  const bannerCount = Object.keys(sb.__elements).filter(k => k === 'storage-quota-banner').length;
  A.eq(bannerCount, 1, '只有 1 個 banner(_showQuotaBanner 內 dedupe)');
}

// ----- [3] toast throttle 5s 內不重發 -----
console.log('\n[3] toast 5s throttle');
{
  let toastCalls = 0;
  const sb = makeSandbox({ quotaBytes: 100 });
  sb.showToast = () => toastCalls++;
  const { Storage } = loadSharedLayer(sb);
  const bigStr = 'x'.repeat(500);
  Storage.set('k1', bigStr);
  Storage.set('k2', bigStr);
  Storage.set('k3', bigStr);
  // 三次失敗,但 5s throttle → toast 只觸發 1 次
  A.eq(toastCalls, 1, 'toast throttle:三次失敗只 1 次 toast');
}

// ----- [4] 真實場景:Storage 滿時 Mastery.update 仍不 crash -----
console.log('\n[4] quota 滿時 Mastery.update 不 crash');
{
  const sb = makeSandbox({ quotaBytes: 100 });
  const { Mastery, Storage } = loadSharedLayer(sb);
  // 先填一些東西讓 quota 接近滿
  Storage.set('filler', 'x'.repeat(80));
  // 然後 Mastery.update:會嘗試寫,失敗會 silent
  let crashed = false;
  try {
    Mastery.update('L21101', true);
    Mastery.update('L21102', false);
  } catch (e) { crashed = true; }
  A.eq(crashed, false, 'Mastery.update 在 quota 爆時 *不* throw(silent fail)');
}

// ----- [5] 確認 index.html 真的有 _showQuotaBanner 與 _writeFailed -----
console.log('\n[5] code-level audit:index.html 含 PR #27 HIGH-5D 修補');
{
  const fs = require('fs');
  const path = require('path');
  const idx = fs.readFileSync(path.join(__dirname, '../../../src/index.html'), 'utf8');
  A.ok(/_showQuotaBanner/.test(idx), 'Storage._showQuotaBanner 存在(PR #27 HIGH-5D)');
  A.ok(/_writeFailed/.test(idx), 'Storage._writeFailed 標記存在');
  A.ok(/storage-quota-banner/.test(idx), 'storage-quota-banner element id 存在');
  // 確認 banner 文案有「匯出進度」鼓勵備份
  const bannerMatch = idx.match(/_showQuotaBanner\(\)\s*\{[\s\S]*?\n\s+\}/);
  A.ok(bannerMatch, '_showQuotaBanner function 主體找到');
  if (bannerMatch) {
    A.ok(/匯出進度/.test(bannerMatch[0]), 'banner 文案提醒「匯出進度」');
  }
}

process.exit(A.summary('09-storage-quota-saturation'));
