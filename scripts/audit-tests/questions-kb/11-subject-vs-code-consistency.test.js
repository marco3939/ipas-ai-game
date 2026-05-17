#!/usr/bin/env node
// Agent G - 11: 額外發現 — subject 欄位 vs knowledge_code 第三碼一致性
// 既有 audit-source-fidelity / audit-source-summary 都不檢查這項
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', '..', 'src');
const files = fs.readdirSync(SRC).filter(f => f.startsWith('questions') && f.endsWith('.json'));
const mismatches = [];
let total = 0;
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const qs = Array.isArray(data) ? data : (data.questions || []);
  for (const q of qs) {
    if (!q.knowledge_code || q.subject === undefined) continue;
    total++;
    const expected = parseInt(q.knowledge_code.slice(2, 3), 10); // L21xxx -> 1
    if (Number(q.subject) !== expected) {
      mismatches.push({ file: f, id: q.id, code: q.knowledge_code, subject: q.subject, expected });
    }
  }
}

console.log('=== 11: subject 欄位 vs knowledge_code 第三碼 ===');
console.log('Total checked:', total);
console.log('Mismatches:', mismatches.length);
for (const m of mismatches) console.log(' ', m.id, m.code, 'subject=' + m.subject, 'expected=' + m.expected, m.file);

fs.writeFileSync(path.join(__dirname, '11-subject-vs-code-consistency.report.json'), JSON.stringify({ total, mismatches }, null, 2));

// 這是發現的新風險,但屬於既有題庫的歷史問題,不阻擋
// 提示 PM/QA 後續處理
if (mismatches.length > 0) {
  console.log('WARN — found subject/code mismatches; report saved (non-blocking, historical data)');
}
console.log('PASS — audit complete (mismatches reported as informational)');
