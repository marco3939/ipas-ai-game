// ============================================================
// update-manifest.js — 自動掃 src/questions*.json 產生 manifest
// 2026-05-18:取代散布在 6 個地方的 hardcoded Q_FILES list
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MANIFEST_PATH = path.join(SRC, 'questions-manifest.json');

function expectedSubject(kc) {
  if (!kc) return null;
  if (kc.startsWith('L21')) return 1;
  if (kc.startsWith('L22')) return 2;
  if (kc.startsWith('L23')) return 3;
  return null;
}

// 掃描所有 questions*.json(自身 manifest 不算)
const files = fs.readdirSync(SRC)
  .filter(f => f.startsWith('questions') && f.endsWith('.json') && f !== 'questions-manifest.json')
  .sort();

const entries = [];
let totalQ = 0;
const subjectTotals = { 1: 0, 2: 0, 3: 0 };

files.forEach(f => {
  const j = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const qs = Array.isArray(j.questions) ? j.questions : [];
  const subjStats = { 1: 0, 2: 0, 3: 0 };
  qs.forEach(q => {
    if (q.subject === 1) { subjStats[1]++; subjectTotals[1]++; }
    else if (q.subject === 2) { subjStats[2]++; subjectTotals[2]++; }
    else if (q.subject === 3) { subjStats[3]++; subjectTotals[3]++; }
  });
  entries.push({
    file: f,
    count: qs.length,
    subjects: subjStats
  });
  totalQ += qs.length;
});

const manifest = {
  version: '1.0',
  generated_at: new Date().toISOString(),
  // 這是 single source of truth — index.html / 5 個 audit script 都讀此檔
  // 新增題庫檔不需要改任何 hardcoded list,只要跑 `node scripts/update-manifest.js`
  total_files: entries.length,
  total_questions: totalQ,
  subject_totals: subjectTotals,
  files: entries.map(e => e.file),  // 給 index.html / audit 用的扁平 list
  details: entries                  // 每檔細目(題數 + subject 分布)
};

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log('✓ Wrote ' + MANIFEST_PATH);
console.log('  files: ' + entries.length);
console.log('  total questions: ' + totalQ);
console.log('  subject totals: 1=' + subjectTotals[1] + ' / 2=' + subjectTotals[2] + ' / 3=' + subjectTotals[3]);
