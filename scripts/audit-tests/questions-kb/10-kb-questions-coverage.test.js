#!/usr/bin/env node
// Agent G - 10: KB 覆蓋率 — 每個 knowledge_code 至少 1 題
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const scope = JSON.parse(fs.readFileSync(path.join(ROOT, 'kb', 'scope.json'), 'utf8'));
const wl = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'kb-allowed-nodes.json'), 'utf8'));

const includedCodes = new Set(scope.knowledge_codes.filter(c => c.include).map(c => c.code));
const wlCodes = new Set(Object.keys(wl));

const codeCounts = {};
const files = fs.readdirSync(SRC).filter(f => f.startsWith('questions') && f.endsWith('.json'));
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const qs = Array.isArray(data) ? data : (data.questions || []);
  for (const q of qs) {
    const c = q.knowledge_code;
    if (!c) continue;
    codeCounts[c] = (codeCounts[c] || 0) + 1;
  }
}

const missing = [];
for (const c of wlCodes) {
  if (!codeCounts[c]) missing.push(c);
}
const includedMissing = [...includedCodes].filter(c => !codeCounts[c]);

const dist = [...Object.entries(codeCounts)].sort((a, b) => a[1] - b[1]);
console.log('=== 10: KB knowledge_code 覆蓋率 ===');
console.log('Whitelist codes:', wlCodes.size);
console.log('Codes with ≥1 question:', Object.keys(codeCounts).length);
console.log('Whitelist codes with 0 question:', missing);
console.log('Scope.included codes with 0 question:', includedMissing);
console.log('Min coverage:', dist.slice(0, 5));
console.log('Max coverage:', dist.slice(-5));

const report = {
  totalWhitelistCodes: wlCodes.size,
  codesWithQuestions: Object.keys(codeCounts).length,
  missingFromWhitelist: missing,
  missingFromScope: includedMissing,
  codeCounts,
};
fs.writeFileSync(path.join(__dirname, '10-kb-questions-coverage.report.json'), JSON.stringify(report, null, 2));

// 應該全部 covered(34 codes whitelist 對應 34 codes 在題庫)
if (missing.length > 0) {
  console.log('FAIL — whitelist codes with 0 questions:', missing.length);
  process.exit(1);
}
console.log('PASS — every whitelist code has at least 1 question');
