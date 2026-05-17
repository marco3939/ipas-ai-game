#!/usr/bin/env node
// Agent G - 07: 沙箱攻擊 #6 — 重複 qid(會破壞 Wrongbook / Mastery 索引)
const { detectDuplicateQids } = require('./sandbox-lib');

const attacks = [
  { id: 'q_dup_001', stem: 'a' },
  { id: 'q_dup_001', stem: 'b' }, // 重複
  { id: 'q_dup_002', stem: 'c' },
  { id: 'q_dup_002', stem: 'd' }, // 重複
  { id: 'q_unique', stem: 'e' },
];
const dupes = detectDuplicateQids(attacks);
console.log('=== 07: 沙箱 — 重複 qid 偵測 ===');
console.log('Duplicates detected:', dupes);

// 也檢查真實 corpus 是否有重複(我們已在 01-stats 證實 0 個)
const fs = require('fs');
const path = require('path');
const stats = JSON.parse(fs.readFileSync(path.join(__dirname, '01-stats.report.json'), 'utf8'));
console.log('Real corpus duplicate qids:', stats.duplicateQids.length);

if (dupes.length !== 2 || !dupes.includes('q_dup_001') || !dupes.includes('q_dup_002')) {
  console.log('FAIL — sandbox dupe detector did not catch both pairs');
  process.exit(1);
}
if (stats.duplicateQids.length !== 0) {
  console.log('FAIL — real corpus has duplicate qids:', stats.duplicateQids);
  process.exit(1);
}
console.log('PASS — sandbox 偵測到 2 對重複;真實 corpus 0 重複');
