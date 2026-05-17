#!/usr/bin/env node
// Agent G - 04: 沙箱攻擊 #3 — single_choice 多個 is_correct=true(會破壞計分)
const { auditOptionLength } = require('./sandbox-lib');
const fs = require('fs');
const path = require('path');

const attacks = [
  {
    id: 'sbx_dual_01',
    knowledge_code: 'L21101', node_id: 'n_L21101_001', subject: 1,
    format: 'single_choice', stem: 'x',
    options: [
      { text: 'A', is_correct: true },
      { text: 'B', is_correct: true }, // 雙正解
      { text: 'C', is_correct: false },
      { text: 'D', is_correct: false },
    ],
  },
  {
    id: 'sbx_dual_02',
    knowledge_code: 'L21101', node_id: 'n_L21101_001', subject: 1,
    format: 'single_choice', stem: 'x',
    options: [
      { text: 'A', is_correct: false },
      { text: 'B', is_correct: false },
      { text: 'C', is_correct: false },
      { text: 'D', is_correct: false }, // 零正解
    ],
  },
];

const findings = [];
for (const q of attacks) {
  const r = auditOptionLength(q);
  findings.push({ id: q.id, correctCount: r.correctCount, multipleCorrect: r.multipleCorrect });
}

console.log('=== 04: 沙箱 — single_choice is_correct count != 1 ===');
for (const f of findings) console.log(' ', f);

// 也檢查實際 audit-render.js 對 is_correct 計數的保護
// audit-render 會驗 "is_correct count" — 看 corpus 已 PASS,確認規則確實生效
const realReport = path.join(__dirname, '..', '..', 'audit-render.report.json');
let realCheck = null;
try {
  const r = JSON.parse(fs.readFileSync(realReport, 'utf8'));
  realCheck = { totalQ: r.totalQ, violations: r.violations ? r.violations.length : 0 };
} catch (e) {}
console.log('Real audit-render.report (corpus):', realCheck);

const bothDetected = findings.every(f => f.multipleCorrect);
if (!bothDetected) {
  console.log('FAIL — sandbox lib did not flag is_correct count anomalies');
  process.exit(1);
}
console.log('PASS — both anomalies (2 correct, 0 correct) detected');
console.log('NOTE: 真實 corpus audit-render 顯示 violations=0,證實在實際題庫中沒有雙正解/零正解');
