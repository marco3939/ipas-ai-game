// 鐵律 #5 稽核:檢查每題的 node_id / knowledge_code / related_node_ids 是否對應 kb/ 真實節點
// 用法:node scripts/audit-source-fidelity.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KB_DIR = path.join(ROOT, 'kb');
const SRC_DIR = path.join(ROOT, 'src');

const KB_FILES = ['nodes-subject-1.json', 'nodes-subject-1-extended.json', 'nodes-subject-3.json', 'nodes-subject-3-extended.json'];
const Q_FILES = [
  'questions.json', 'questions-pa-code.json', 'questions-pb-visual.json',
  'questions-pc-modes.json', 'questions-pd-scenario.json',
  'questions-pe-advanced-s1.json', 'questions-pf-advanced-s3.json',
  'questions-pg-eval.json', 'questions-ph-mlops.json',
  'questions-batch-n1-nlp.json', 'questions-batch-n2-cv.json',
  'questions-batch-n3-genai.json', 'questions-batch-n4-planning.json',
  'questions-batch-n5-deploy.json', 'questions-batch-n6-ml-core.json',
  'questions-batch-n7-dl.json', 'questions-batch-n8-eval-gov.json',
  'questions-confusion-matrix.json',
];

// === 1. 建立 kb 合法集合 ===
const validNodeIds = new Set();
const validKnowledgeCodes = new Set();
const nodeMeta = {}; // node_id -> {title, code}
let kbNodeCount = 0;

for (const f of KB_FILES) {
  const fp = path.join(KB_DIR, f);
  if (!fs.existsSync(fp)) { console.log(`(skip) ${f} 不存在`); continue; }
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.nodes || data;
  if (!Array.isArray(list)) continue;
  list.forEach(n => {
    if (n.node_id) {
      validNodeIds.add(n.node_id);
      kbNodeCount++;
      nodeMeta[n.node_id] = { title: n.title, code: n.knowledge_code };
    }
    if (n.knowledge_code) validKnowledgeCodes.add(n.knowledge_code);
  });
}
console.log(`KB 載入:${kbNodeCount} 個 nodes,${validKnowledgeCodes.size} 個 knowledge_codes`);

// === 2. 掃描所有題目 ===
const violations = [];
let totalQ = 0;

for (const f of Q_FILES) {
  const fp = path.join(SRC_DIR, f);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.questions || data;
  if (!Array.isArray(list)) continue;

  list.forEach(q => {
    totalQ++;
    const issues = [];

    // 主 node_id
    if (q.node_id && !validNodeIds.has(q.node_id)) {
      issues.push(`node_id "${q.node_id}" 不存在於 kb`);
    }
    // knowledge_code
    if (q.knowledge_code && !validKnowledgeCodes.has(q.knowledge_code)) {
      issues.push(`knowledge_code "${q.knowledge_code}" 不存在於 kb`);
    }
    // related_node_ids 每個都要在 kb
    if (Array.isArray(q.related_node_ids)) {
      q.related_node_ids.forEach(rid => {
        if (!validNodeIds.has(rid)) issues.push(`related_node_ids 中 "${rid}" 不存在於 kb`);
      });
    }
    // 必要欄位:必須有 node_id 或 knowledge_code 至少一個
    if (!q.node_id && !q.knowledge_code) {
      issues.push('缺少 node_id 與 knowledge_code(無法溯源)');
    }

    if (issues.length > 0) {
      violations.push({ file: f, id: q.id, stem: (q.stem||q.stem_template||'').substring(0,60), issues });
    }
  });
}

// === 3. 先寫 JSON(避免 stdout 編碼錯誤導致檔案未寫)===
fs.writeFileSync(
  path.join(__dirname, 'audit-source-fidelity.report.json'),
  JSON.stringify({
    summary: { totalQ, violationCount: violations.length, compliantPct: ((1 - violations.length / totalQ) * 100).toFixed(1), kbNodeCount, kbCodeCount: validKnowledgeCodes.size },
    violations,
  }, null, 2),
  'utf8'
);

// === 4. 報告(stdout 可能在 PowerShell 編碼出錯,但 JSON 已寫) ===
try {
  console.log(`\n=== iron-rule-5 audit ===`);
  console.log(`total: ${totalQ}, violations: ${violations.length}, compliantPct: ${((1 - violations.length / totalQ) * 100).toFixed(1)}%`);
  console.log(`-> report written to scripts/audit-source-fidelity.report.json`);
} catch(e) {}
