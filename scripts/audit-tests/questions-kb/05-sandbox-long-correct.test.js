#!/usr/bin/env node
// Agent G - 05: 沙箱攻擊 #4 — 正解比錯解長 3 倍(鐵律 #4)
const { auditOptionLength } = require('./sandbox-lib');

const attacks = [
  {
    id: 'sbx_long_01',
    knowledge_code: 'L21101', node_id: 'n_L21101_001', subject: 1,
    format: 'single_choice', stem: 'x',
    options: [
      { text: '這是非常非常非常非常非常非常非常非常長的正解內容,包含大量細節讓玩家一眼看出是答案,違反鐵律#4(這段約 50 字)', is_correct: true },
      { text: '錯1' },
      { text: '錯2' },
      { text: '錯3' },
    ],
  },
  {
    id: 'sbx_long_02',
    knowledge_code: 'L21101', node_id: 'n_L21101_001', subject: 1,
    format: 'single_choice', stem: 'x',
    options: [
      { text: '正解很長很長很長很長很長很長很長很長很長很長很長很長很長很長', is_correct: true }, // 30 字 vs 4 字錯解 = 7.5x
      { text: '錯1' },
      { text: '錯2' },
      { text: '錯3' },
    ],
  },
  // 控制組:正常均衡的題目應不被旗
  {
    id: 'sbx_long_ctrl',
    knowledge_code: 'L21101', node_id: 'n_L21101_001', subject: 1,
    format: 'single_choice', stem: 'x',
    options: [
      { text: 'AAAAAAAAAAAAAAAA', is_correct: true },
      { text: 'BBBBBBBBBBBBBBBB' },
      { text: 'CCCCCCCCCCCCCCCC' },
      { text: 'DDDDDDDDDDDDDDDD' },
    ],
  },
];

console.log('=== 05: 沙箱 — 鐵律 #4 正解過長 ===');
let allOk = true;
for (const q of attacks) {
  const r = auditOptionLength(q);
  console.log(' ', q.id, JSON.stringify(r));
  const expectFlag = q.id !== 'sbx_long_ctrl';
  if (expectFlag !== r.flagged) {
    console.log('   !! mismatch — expected flagged=' + expectFlag + ' got ' + r.flagged);
    allOk = false;
  }
}

if (!allOk) { console.log('FAIL — sandbox heuristic mismatch'); process.exit(1); }
console.log('PASS — 鐵律 #4 過長正解被旗、均衡題目通過');
console.log('NOTE: 真實 corpus audit-option-length 旗標數=0(個別題目層級)');
console.log('  但「最長=正解」比例 42.29% 超過 35% 全域上限(系統性偏差,需後續修題)');
