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

// 抓出 src 內所有 questions*.json(排除 manifest 自身)
function allQuestionFiles() {
  return fs.readdirSync(SRC).filter(f =>
    f.startsWith('questions') && f.endsWith('.json') && f !== 'questions-manifest.json'
  );
}

const violations = [];

const files = allQuestionFiles();

// ============================================================
// 檢查 A:index.html 是否動態 fetch manifest(取代寫死 list)
// ============================================================
console.log('=== A: index.html 動態化載入 ===');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const usesManifest = html.includes("fetch('questions-manifest.json')") || html.includes('fetch("questions-manifest.json")');
if (!usesManifest) {
  console.log('✗ index.html loadQuestions 沒用 manifest 動態載入(可能還有寫死的 file list 沒同步)');
  violations.push({ check: 'A', issue: 'index.html 仍寫死 file list 而非 fetch manifest' });
} else {
  console.log('✓ index.html loadQuestions 走 manifest 動態載入');
}

// ============================================================
// 檢查 B:manifest 是否與實體檔一致(single source of truth 防漂移)
// ============================================================
console.log('\n=== B: manifest 與實體檔一致性 ===');
const manifestPath = path.join(SRC, 'questions-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.log('✗ questions-manifest.json 不存在 — 請跑 `node scripts/update-manifest.js`');
  violations.push({ check: 'B', issue: 'manifest 不存在' });
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestFiles = (manifest.files || []).slice().sort();
  const actualFiles = files.slice().sort();
  const inActualNotManifest = actualFiles.filter(f => !manifestFiles.includes(f));
  const inManifestNotActual = manifestFiles.filter(f => !actualFiles.includes(f));
  if (inActualNotManifest.length > 0) {
    console.log('✗ 實體存在但 manifest 漏:' + inActualNotManifest.join(', '));
    inActualNotManifest.forEach(f => violations.push({ check: 'B', file: f, issue: 'in src but not in manifest — 請跑 update-manifest.js' }));
  }
  if (inManifestNotActual.length > 0) {
    console.log('✗ manifest 列但實體不存在:' + inManifestNotActual.join(', '));
    inManifestNotActual.forEach(f => violations.push({ check: 'B', file: f, issue: 'in manifest but not in src — 請跑 update-manifest.js' }));
  }
  if (inActualNotManifest.length === 0 && inManifestNotActual.length === 0) {
    console.log('✓ manifest 與實體檔完全一致(' + manifestFiles.length + ' 個檔)');
  }
}

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
