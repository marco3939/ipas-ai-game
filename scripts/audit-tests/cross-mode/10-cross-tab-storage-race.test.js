// 10-cross-tab-storage-race.test.js
// 必證:
//   - 兩 tab 同時寫 ipas_mastery_v1 → last-write-wins(localStorage 行為)
//   - ProgressIO 有 _setupCrossTabGuard,import 期間偵測別 tab 寫入會 abort
//   - 預期:UX 不影響但 mastery 可能丟一些累積(待解,寫進 finding)

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 10 Cross-tab storage race ===\n');
const A = makeAssert();

// ----- [1] last-write-wins:兩個 sandbox 共用同一 storage Map 模擬 -----
console.log('\n[1] last-write-wins 行為');
{
  // 共用同一 storage 物件:用 vm 跑兩個 sandbox 但 inject 同一 localStorage
  // 簡化:直接拿 sb1 layer 的 Storage 模擬「兩個 caller」交錯
  const sb = makeSandbox();
  const { Mastery } = loadSharedLayer(sb);

  // Tab A:讀 mastery,得空,準備寫
  const masteryA = Mastery.load();
  masteryA['L21101'] = { score: 50, attempts: 1, correct: 1, streak: 1 };

  // Tab B:讀 mastery,也得空(因為 A 還沒 save),準備寫
  const masteryB = Mastery.load();
  masteryB['L21201'] = { score: 30, attempts: 1, correct: 0, streak: 0 };

  // A save
  Mastery.save(masteryA);
  // B save —— 覆寫 A
  Mastery.save(masteryB);

  // 結果:L21101 丟了
  const finalMastery = Mastery.load();
  A.ok(!finalMastery['L21101'], 'last-write-wins:tab A 的 L21101 被覆寫(lost-update)');
  A.ok(finalMastery['L21201'], 'tab B 的 L21201 保留');
  // 這就是 finding:lost-update 風險
  console.log('  FINDING: cross-tab lost-update 是 localStorage 固有行為,沒安全問題但有 UX 風險');
}

// ----- [2] ProgressIO 有 _setupCrossTabGuard 偵測 import 期間別 tab 寫入 -----
console.log('\n[2] ProgressIO cross-tab guard 存在');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  A.ok(/_setupCrossTabGuard/.test(idx), 'ProgressIO._setupCrossTabGuard 存在');
  A.ok(/_crossTabAbort/.test(idx), '_crossTabAbort flag 存在');
  // import 期間若別 tab 寫 ipas_* 應該 abort
  const importBlock = idx.match(/_setupCrossTabGuard\(\)\s*\{([\s\S]*?)^\s+\}/m);
  A.ok(importBlock, '_setupCrossTabGuard function 主體');
  if (importBlock) {
    A.ok(/storage/.test(importBlock[1]), 'cross-tab guard 監聽 storage event');
    A.ok(/ipas_/.test(importBlock[1]), 'cross-tab guard 過濾 ipas_ prefix');
  }
}

// ----- [3] 真實 storage event 觸發:simulate 別 tab 寫 ipas_progress_v1 -----
console.log('\n[3] simulate storage event 觸發 _crossTabAbort');
{
  // 提取 ProgressIO 抽 sliceBetween 較難 — 改 grep-based 驗:確認 setupCrossTabGuard 內
  // 對 e.key === null 或 startsWith('ipas_') 兩種都 set abort=true(case 11 / case 10 修補)
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const m = idx.match(/_setupCrossTabGuard\(\)\s*\{[\s\S]*?addEventListener\([^)]+\)[^;]+;[\s\S]*?\}\)/);
  if (m) {
    const block = m[0];
    A.ok(/e\.key\s*===\s*null/.test(block), 'guard 處理 clear() 觸發(e.key=null)');
    A.ok(/startsWith\(['"]ipas_['"]\)/.test(block), 'guard 過濾 ipas_ prefix');
    A.ok(/_crossTabAbort\s*=\s*true/.test(block), 'guard 設 _crossTabAbort=true');
  } else {
    A.ok(false, '_setupCrossTabGuard 內部 addEventListener block 找不到');
  }
}

// ----- [4] FINDING:Mastery / Wrongbook 等共用層沒有 storage event 同步 -----
console.log('\n[4] FINDING:共用層無 cross-tab 同步機制');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  // 抓 Mastery / Wrongbook / SeenCorrect 模組是否有 storage event listener
  const masterySection = idx.match(/const Mastery = \{[\s\S]+?\n\};/);
  const wbSection = idx.match(/const Wrongbook = \{[\s\S]+?\n\};/);
  const scSection = idx.match(/const SeenCorrect = \{[\s\S]+?\n\};/);
  const hasStorageEvent = (s) => s && /addEventListener\(['"]storage['"]/.test(s[0]);
  A.ok(!hasStorageEvent(masterySection), 'FINDING: Mastery 無 storage event listener(lost-update 風險)');
  A.ok(!hasStorageEvent(wbSection), 'FINDING: Wrongbook 無 storage event listener(lost-update 風險)');
  A.ok(!hasStorageEvent(scSection), 'FINDING: SeenCorrect 無 storage event listener(lost-update 風險)');
  console.log('  FINDING: cross-tab 兩 tab 同時做題會 lost-update。建議:長期解決方案是 BroadcastChannel 或 storage event listener,短期由使用者「單 tab」避免');
}

// ----- [5] BroadcastChannel / storage event 整體覆蓋掃 -----
console.log('\n[5] cross-tab 通訊機制整體掃');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const bc = (idx.match(/BroadcastChannel/g) || []).length;
  const se = (idx.match(/addEventListener\(['"]storage['"]/g) || []).length;
  console.log(`  BroadcastChannel: ${bc}, storage event listener: ${se}`);
  // 只有 ProgressIO 用,其他沒用
  A.ok(se >= 1, '至少 ProgressIO 有 storage event listener');
}

process.exit(A.summary('10-cross-tab-storage-race'));
