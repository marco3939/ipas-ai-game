// ============================================================
// audit-subject-isolation.js — 鐵律 #6 科目隔離性靜態驗證
// 2026-05-19:防止「一檔混 subject」「subject 與 KB code 漂移」
// ------------------------------------------------------------
// 4 個 check:
//   A. subject 欄位 ↔ knowledge_code 開頭對齊(L21→1 / L22→2 / L23→3)
//   B. 單一 batch 檔內所有題目 subject 一致(allowlist 內的共用題庫除外)
//   C. node_id 開頭 = 'n_<knowledge_code>_'
//   D. knowledge_code ∈ kb-allowed-nodes.json top-level keys(白名單)
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// ------------------------------------------------------------
// 跨 subject 共用題庫(BOSS / mode 共用 / 全考綱通用)
// 此 allowlist 內的檔案不受 check B「單檔同 subject」限制
// 仍受 check A/C/D 限制
// ------------------------------------------------------------
const CROSS_SUBJECT_ALLOWLIST = new Set([
  'questions.json',                     // 全考綱基礎題庫
  'questions-batch-boss-fill.json',     // BOSS 補位池(跨 subject)
  'questions-mode8-trace.json',         // Mode 8 trace 題庫(L22+L23 共用)
  'questions-confusion-matrix.json',    // 混淆矩陣練習(可跨 subject)
  'questions-pa-code.json',             // Mode-specific code 題(跨 subject)
  'questions-pb-visual.json',           // 視覺題(跨 subject)
  'questions-pc-modes.json',            // mode 題型題(跨 subject)
  'questions-pd-scenario.json',         // scenario 題(跨 subject)
  'questions-pe-advanced-s1.json',      // 進階科一(單 subject 但歷史保留命名)
  'questions-pf-advanced-s3.json',      // 進階科三(單 subject 但歷史保留命名)
  'questions-pg-eval.json',             // 評估題(跨 subject)
  'questions-ph-mlops.json',            // MLOps(跨 subject)
]);

// L21 → 1 / L22 → 2 / L23 → 3
function expectedSubject(kc) {
  if (!kc || typeof kc !== 'string') return null;
  if (kc.startsWith('L21')) return 1;
  if (kc.startsWith('L22')) return 2;
  if (kc.startsWith('L23')) return 3;
  return null;
}

// ------------------------------------------------------------
// 載入 manifest(single source of truth)
// ------------------------------------------------------------
const manifestPath = path.join(SRC, 'questions-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.log('✗ questions-manifest.json 不存在 — 請先跑 `node scripts/update-manifest.js`');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const files = manifest.files || [];

// ------------------------------------------------------------
// 載入 kb-allowed-nodes 白名單(top-level keys = 合法 knowledge_code)
// ------------------------------------------------------------
const kbAllowedPath = path.join(__dirname, 'kb-allowed-nodes.json');
if (!fs.existsSync(kbAllowedPath)) {
  console.log('✗ scripts/kb-allowed-nodes.json 不存在');
  process.exit(1);
}
const kbAllowed = JSON.parse(fs.readFileSync(kbAllowedPath, 'utf8'));
const allowedCodes = new Set(Object.keys(kbAllowed));

// ------------------------------------------------------------
// 掃描所有題目
// ------------------------------------------------------------
const violations = [];
const allQs = [];
const subjectDist = { 1: 0, 2: 0, 3: 0, other: 0 };

files.forEach(f => {
  const fp = path.join(SRC, f);
  if (!fs.existsSync(fp)) return;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.questions || data;
  if (!Array.isArray(list)) return;
  list.forEach(q => allQs.push({ ...q, _file: f }));
});

// 統計分佈
allQs.forEach(q => {
  if (q.subject === 1 || q.subject === 2 || q.subject === 3) subjectDist[q.subject]++;
  else subjectDist.other++;
});

// ============================================================
// check A:subject ↔ knowledge_code prefix 對齊
// ============================================================
console.log('=== A: subject ↔ knowledge_code prefix 對齊 ===');
let countA = 0;
allQs.forEach(q => {
  const exp = expectedSubject(q.knowledge_code);
  if (exp !== null && q.subject !== exp) {
    countA++;
    violations.push({
      check: 'A',
      file: q._file,
      qid: q.id,
      kc: q.knowledge_code,
      actual_subject: q.subject,
      expected_subject: exp,
      issue: `subject=${q.subject} 與 knowledge_code=${q.knowledge_code} 不一致(預期 subject=${exp})`,
    });
  }
});
if (countA > 0) console.log('✗ ' + countA + ' 題 subject 與 knowledge_code prefix 不一致');
else console.log('✓ 全部 ' + allQs.length + ' 題 subject ↔ knowledge_code prefix 對齊');

// ============================================================
// check B:單一 batch 檔內 subject 一致(allowlist 除外)
// ============================================================
console.log('\n=== B: 單一 batch 檔 subject 一致性 ===');
const fileSubjects = {};
allQs.forEach(q => {
  if (!fileSubjects[q._file]) fileSubjects[q._file] = new Set();
  if (q.subject === 1 || q.subject === 2 || q.subject === 3) {
    fileSubjects[q._file].add(q.subject);
  }
});
let countB = 0;
Object.entries(fileSubjects).forEach(([f, subSet]) => {
  if (CROSS_SUBJECT_ALLOWLIST.has(f)) return; // 跳過跨 subject 共用題庫
  if (subSet.size > 1) {
    countB++;
    const mixed = Array.from(subSet).sort();
    violations.push({
      check: 'B',
      file: f,
      issue: `單一檔案混了 ${subSet.size} 個 subject:[${mixed.join(', ')}](非 allowlist 檔案禁止跨 subject)`,
      subjects_found: mixed,
    });
    console.log('✗ ' + f + ' 混 subject [' + mixed.join(', ') + ']');
  }
});
if (countB === 0) console.log('✓ 全部 batch 檔 subject 一致(allowlist 共 ' + CROSS_SUBJECT_ALLOWLIST.size + ' 檔豁免)');

// ============================================================
// check C:node_id 開頭 ↔ knowledge_code
// ============================================================
console.log('\n=== C: node_id 開頭 ↔ knowledge_code ===');
let countC = 0;
allQs.forEach(q => {
  if (!q.node_id || !q.knowledge_code) return; // 缺欄位另案,鐵律 #5 audit 已處理
  const expectedPrefix = 'n_' + q.knowledge_code + '_';
  if (!q.node_id.startsWith(expectedPrefix)) {
    countC++;
    violations.push({
      check: 'C',
      file: q._file,
      qid: q.id,
      node_id: q.node_id,
      kc: q.knowledge_code,
      expected_prefix: expectedPrefix,
      issue: `node_id "${q.node_id}" 不以 "${expectedPrefix}" 開頭`,
    });
  }
});
if (countC > 0) console.log('✗ ' + countC + ' 題 node_id 開頭與 knowledge_code 不對齊');
else console.log('✓ 全部 node_id 都以 n_<knowledge_code>_ 開頭');

// ============================================================
// check D:knowledge_code 在 kb-allowed-nodes 白名單
// ============================================================
console.log('\n=== D: knowledge_code 白名單 ===');
let countD = 0;
allQs.forEach(q => {
  if (!q.knowledge_code) return; // 缺欄位另案
  if (!allowedCodes.has(q.knowledge_code)) {
    countD++;
    violations.push({
      check: 'D',
      file: q._file,
      qid: q.id,
      kc: q.knowledge_code,
      issue: `knowledge_code "${q.knowledge_code}" 不在 kb-allowed-nodes.json 白名單(${allowedCodes.size} 個合法 code)`,
    });
  }
});
if (countD > 0) console.log('✗ ' + countD + ' 題 knowledge_code 不在白名單');
else console.log('✓ 全部 knowledge_code 都在白名單(' + allowedCodes.size + ' 個合法 code)');

// ============================================================
// 報告
// ============================================================
console.log('\n=== iron-rule-6 subject isolation audit ===');
console.log('totalQ: ' + allQs.length + ', checked from ' + files.length + ' files');
console.log('violations: ' + violations.length);

if (violations.length === 0) {
  console.log('PASS — 全 subject 對齊,單檔同 subject,node_id 對齊,knowledge_code 白名單');
  console.log('\n[info] subject 分佈統計:');
  console.log('  科一(subject=1): ' + subjectDist[1] + ' 題');
  console.log('  科二(subject=2): ' + subjectDist[2] + ' 題');
  console.log('  科三(subject=3): ' + subjectDist[3] + ' 題');
  if (subjectDist.other > 0) console.log('  其他/缺失: ' + subjectDist.other + ' 題');
} else {
  console.log('FAIL — ' + violations.length + ' 違規(A:' + countA + ' B:' + countB + ' C:' + countC + ' D:' + countD + ')');
  // 印前 20 條(每 check 各最多顯示一些)
  const byCheck = { A: [], B: [], C: [], D: [] };
  violations.forEach(v => byCheck[v.check].push(v));
  ['A', 'B', 'C', 'D'].forEach(c => {
    if (byCheck[c].length === 0) return;
    console.log('\n  [check ' + c + '] ' + byCheck[c].length + ' 違規,前 5 條:');
    byCheck[c].slice(0, 5).forEach(v => {
      const loc = v.file + (v.qid ? ' / ' + v.qid : '');
      console.log('    - ' + loc + ' → ' + v.issue);
    });
  });
}

// 寫 report
const report = {
  generated_at: new Date().toISOString(),
  totalQ: allQs.length,
  fileCount: files.length,
  subjectDistribution: subjectDist,
  totalViolations: violations.length,
  violationsByCheck: {
    A: violations.filter(v => v.check === 'A').length,
    B: violations.filter(v => v.check === 'B').length,
    C: violations.filter(v => v.check === 'C').length,
    D: violations.filter(v => v.check === 'D').length,
  },
  crossSubjectAllowlist: Array.from(CROSS_SUBJECT_ALLOWLIST),
  violations,
};
fs.writeFileSync(
  path.join(__dirname, 'audit-subject-isolation.report.json'),
  JSON.stringify(report, null, 2),
  'utf8'
);
console.log('\n-> report: scripts/audit-subject-isolation.report.json');

process.exit(violations.length > 0 ? 1 : 0);
