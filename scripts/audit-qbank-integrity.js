// ============================================================
// audit-qbank-integrity.js — 題庫完整性 + subject 對齊檢查
// 2026-05-18:防止再次發生「index.html 漏載」+「subject 標錯」
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// 規則:L21* → subject 1 / L22* → 2 / L23* → 3
function expectedSubject(kc) {
  if (!kc || typeof kc !== 'string') return null;
  if (kc.startsWith('L21')) return 1;
  if (kc.startsWith('L22')) return 2;
  if (kc.startsWith('L23')) return 3;
  return null;
}

// 抓出 src 內所有 questions*.json
function allQuestionFiles() {
  return fs.readdirSync(SRC).filter(f => f.startsWith('questions') && f.endsWith('.json'));
}

const violations = [];

// ============================================================
// 檢查 A:index.html loadQuestions 是否載了所有 questions*.json
// ============================================================
console.log('=== A: index.html loadQuestions 完整性 ===');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const files = allQuestionFiles();
const missingInHtml = files.filter(f => !html.includes(f));
if (missingInHtml.length > 0) {
  console.log('✗ index.html 漏載 ' + missingInHtml.length + ' 個檔:');
  missingInHtml.forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    const n = Array.isArray(j.questions) ? j.questions.length : 0;
    console.log('    ' + f + ' (' + n + ' 題)');
    violations.push({ check: 'A', file: f, issue: 'missing in index.html loadQuestions', count: n });
  });
} else {
  console.log('✓ index.html 載入了全部 ' + files.length + ' 個題庫檔');
}

// ============================================================
// 檢查 B:audit script Q_FILES 是否與實體檔同步
// ============================================================
console.log('\n=== B: audit script Q_FILES 完整性 ===');
const AUDIT_FILES = [
  'audit-source-fidelity.js',
  'audit-render.js',
  'audit-option-length.js',
  'audit-case-answer-distinctness.js',
  'audit-stem-explanation-consistency.js'
];
AUDIT_FILES.forEach(af => {
  const fp = path.join(ROOT, 'scripts', af);
  if (!fs.existsSync(fp)) { console.log('? ' + af + ' 不存在'); return; }
  const src = fs.readFileSync(fp, 'utf8');
  const missing = files.filter(f => !src.includes(f));
  if (missing.length > 0) {
    console.log('✗ ' + af + ' 漏列 ' + missing.length + ' 個檔:' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' ...' : ''));
    missing.forEach(f => violations.push({ check: 'B', script: af, file: f }));
  } else {
    console.log('✓ ' + af + ' 完整');
  }
});

// ============================================================
// 檢查 C:題目 subject vs KB code prefix 對齊
// ============================================================
console.log('\n=== C: 題目 subject vs knowledge_code 對齊 ===');
const allQs = [];
files.forEach(f => {
  const j = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  if (Array.isArray(j.questions)) j.questions.forEach(q => allQs.push({ ...q, _file: f }));
});
const mismatches = allQs.filter(q => {
  const exp = expectedSubject(q.knowledge_code);
  return exp !== null && q.subject !== exp;
});
if (mismatches.length > 0) {
  console.log('✗ ' + mismatches.length + ' 題 subject 與 KB code 前綴不一致(L21→1 / L22→2 / L23→3)');
  // 按檔分組
  const byFile = {};
  mismatches.forEach(m => { (byFile[m._file] = byFile[m._file] || []).push(m); });
  Object.entries(byFile).forEach(([f, ms]) => {
    console.log('    ' + f + ': ' + ms.length + ' 題');
    ms.slice(0, 3).forEach(m => console.log('      ' + m.id + ' kc=' + m.knowledge_code + ' subject=' + m.subject + ' (預期 ' + expectedSubject(m.knowledge_code) + ')'));
  });
  mismatches.forEach(m => violations.push({ check: 'C', id: m.id, kc: m.knowledge_code, subject: m.subject, expected: expectedSubject(m.knowledge_code), file: m._file }));
} else {
  console.log('✓ 全部 ' + allQs.length + ' 題的 subject 都對齊 KB code prefix');
}

// ============================================================
// 總結
// ============================================================
console.log('\n=== SUMMARY ===');
console.log('題庫檔總數: ' + files.length);
console.log('題目總數: ' + allQs.length);
console.log('違規: ' + violations.length);

// 寫 report
fs.writeFileSync(
  path.join(ROOT, 'scripts', 'audit-qbank-integrity.report.json'),
  JSON.stringify({
    generated_at: new Date().toISOString(),
    summary: {
      questionFileCount: files.length,
      totalQuestions: allQs.length,
      violations: violations.length
    },
    violations
  }, null, 2)
);
console.log('\n→ report: scripts/audit-qbank-integrity.report.json');

if (violations.length > 0) {
  console.log('\n❌ FAIL — 詳見 report');
  process.exit(1);
} else {
  console.log('\n✅ PASS');
  process.exit(0);
}
