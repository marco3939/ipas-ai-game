// ============================================================
// sandbox: Mode 6 批次挑戰 + 取消挑戰按鈕(2026-05-18)
// ============================================================
const fs = require('fs');
const path = require('path');

console.log('=== Sandbox: Mode 6 批次挑戰 + cancelChallenge 驗證 ===\n');
const src = fs.readFileSync(path.join(__dirname, '../src/modes/mode6.js'), 'utf8');

let pass = 0, fail = 0;
const assert = (cond, label) => {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
};

// === T1: 5 個新方法都存在 ===
console.log('--- T1: 新方法 API ---');
['cancelChallenge','toggleBatchMode','toggleBatchCard','selectAllChallengeableInFilter','clearBatchSelection','executeBatch','_runNextBatch'].forEach(m => {
  assert(src.includes('    ' + m), `Mode6.${m}() 存在`);
});

// === T2: cancelChallenge 邏輯 ===
console.log('\n--- T2: cancelChallenge 行為 ---');
assert(src.includes('cancelChallenge()'), '可從 UI 呼叫');
assert(src.match(/cancelChallenge\(\)[\s\S]*?this\.cleanup\(\)/), 'cancelChallenge 內呼叫 this.cleanup()');
assert(src.match(/cancelChallenge\(\)[\s\S]*?batchQueue\.length > 0/), 'cancelChallenge 處理批次中途退出');
assert(src.match(/cancelChallenge\(\)[\s\S]*?this\.renderGrid\(\)/), 'cancelChallenge 後 renderGrid');

// === T3: challenge 內 ctx 含取消按鈕 ===
console.log('\n--- T3: challenge UI 含取消按鈕 ---');
assert(src.includes('Mode6.cancelChallenge()'), '挑戰 UI 含 cancelChallenge button');
assert(src.includes('取消挑戰') && src.includes('MP 已扣不退'), 'UI 明確提示 MP 已扣不退');

// === T4: 批次模式狀態管理 ===
console.log('\n--- T4: 批次模式狀態 ---');
assert(src.match(/toggleBatchMode\(\)[\s\S]*?batchMode = !this\.state\.batchMode/), 'toggleBatchMode 切換 boolean');
assert(src.match(/toggleBatchMode\(\)[\s\S]*?batchSelected = new Set\(\)/), 'toggleBatchMode 重置 selected');
assert(src.match(/toggleBatchCard[\s\S]*?has\(nodeId\)/), 'toggleBatchCard 用 Set.has 判定');

// === T5: selectAllChallengeableInFilter — 排除金卡 + 無題卡 + 依 MP 截斷 ===
console.log('\n--- T5: 全選邏輯 ---');
assert(src.match(/selectAllChallengeableInFilter[\s\S]*?Math\.floor\(player\.mp \/ MP_COST_CHALLENGE\)/), '計算 MP 上限');
assert(src.match(/selectAllChallengeableInFilter[\s\S]*?tier >= TIER\.GOLD/), '排除金卡');
assert(src.match(/selectAllChallengeableInFilter[\s\S]*?pool\.length > 0/), '排除無題卡');

// === T6: executeBatch — MP 不足時 confirm 截短 ===
console.log('\n--- T6: executeBatch MP 不足處理 ---');
assert(src.match(/executeBatch[\s\S]*?player\.mp < needed/), '檢測 MP 不足');
assert(src.match(/executeBatch[\s\S]*?confirm\(/), 'MP 不足時跳 confirm 對話框');
assert(src.match(/executeBatch[\s\S]*?queue\.slice\(0, can\)/), '截短到可挑數量');
assert(src.match(/executeBatch[\s\S]*?_runNextBatch/), '啟動連續挑戰');

// === T7: _runNextBatch — queue 空時結束 ===
console.log('\n--- T7: _runNextBatch 終止條件 ---');
assert(src.match(/_runNextBatch[\s\S]*?batchQueue\.length === 0/), 'queue 空時結束');
assert(src.match(/_runNextBatch[\s\S]*?批次挑戰完成/), '結束時 toast 提示');
assert(src.match(/_runNextBatch[\s\S]*?this\.challenge\(nodeId\)/), 'shift queue 後呼叫 challenge');

// === T8: challenge callback 在批次模式接下一張 ===
console.log('\n--- T8: challenge callback 串連 ---');
const challengeMatch = src.match(/challenge\(nodeId\)[\s\S]*?PlayEngine\.show/);
assert(challengeMatch !== null, 'challenge() 完整段落');
assert(src.match(/答對[\s\S]*?batchQueue[\s\S]*?_runNextBatch[\s\S]*?openCard/), '答對分支:批次走 _runNextBatch,否則 openCard');
assert(src.match(/DrillSession\.start[\s\S]*?batchQueue[\s\S]*?_runNextBatch/), 'DrillSession 結束分支:批次走 _runNextBatch');

// === T9: renderGrid 批次面板 ===
console.log('\n--- T9: renderGrid 批次面板 UI ---');
assert(src.includes('批次挑戰模式') && src.includes('已選'), '批次面板含「已選 N 張」');
assert(src.includes('全選 (依 MP 上限'), '全選按鈕含 MP 上限說明');
assert(src.includes('Mode6.executeBatch()'), '面板含執行批次按鈕');
assert(src.includes('Mode6.toggleBatchMode()'), '可退出批次模式');

// === T10: _renderCard 批次模式 checkbox ===
console.log('\n--- T10: _renderCard 批次 checkbox ---');
assert(src.includes('toggleBatchCard'), '_renderCard 點擊改為 toggleBatchCard');
assert(src.includes('isSelected ? \'✅\' : \'⬜\''), 'checkbox 視覺(✅/⬜)');

// === T11: actions 區條件顯示「批次模式」按鈕 ===
console.log('\n--- T11: 入口按鈕 ---');
assert(src.includes('🔥 批次挑戰模式(依 MP 多選解鎖)'), 'actions 區含批次入口按鈕');

console.log(`\n=== SUMMARY ===`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
