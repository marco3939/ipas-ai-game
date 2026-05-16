// audit-l3-terms.js — 防止 L3 業界術語(KB 未收錄的具體產品名)回流題庫
//
// Background (2026-05-16):
// pe-advanced-s1 / ph-mlops 原本含大量 KB 未收錄的 L3 業界術語(Longformer / MLflow /
// SageMaker 等)。Agent B 改寫降回 L2 後,加此 audit 確保未來不再回流。
//
// Rule: 題目 stem / options / explanation 不可出現 banned-terms 列表中的詞。
// banned terms = 在 IPAS AI 中級考綱外且 KB 未收錄的具體業界產品/具名模型。
//
// 用法: node scripts/audit-l3-terms.js
// Exit: 0 = clean, 1 = violations found.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// L3 banned terms — derived from Agent B 2A rewrite report (Longformer/MLflow 等 KB 外實名)
// 加詞請更新此 list + 對應 Section E 文件
const BANNED_TERMS = [
  // 模型 / 架構(具名 L3)
  'Longformer', 'BigBird', 'Reformer', 'Performer',
  'GQA', // Grouped Query Attention
  'YOLOv8', 'YOLOv7', 'YOLOv6', 'YOLOv5', 'RT-DETR',
  'BLIP-2', 'BLIP2', 'Flamingo', 'LLaVA', 'Kosmos', 'GPT-4V', 'Q-Former',
  'SAM-Med', 'SAM-Sat', // Note: 'SAM' alone is too generic (Sharpness-Aware Minimization etc.); only flag specific variants
  'Mamba', 'Mistral', 'Mixtral', 'Qwen', 'Vicuna',
  'Chinese-CLIP', 'CN-CLIP', 'OpenCLIP',
  // 向量資料庫 / 工具具名
  'FAISS', 'Milvus', 'LAION',
  // MLOps tools(具名 L3)
  'MLflow', 'W&B', 'Weights & Biases',
  'Vertex AI', 'SageMaker', 'Databricks',
  'Kubeflow', 'DVC', 'Pachyderm', 'ClearML', 'Comet ML',
  'Evidently AI', 'Whylogs', 'Arize',
  'Shadow Deployment',
  // L3 部署細節
  'TensorRT', 'CSPDarknet', 'Jetson',
  'perceiver resampler',
];

// 白名單例外:特定詞在某些 context 下不該被 flag
// (例如 'CLIP' 一般 OK,只 ban Chinese-CLIP/CN-CLIP 變體;此設計用「more specific term first」hit)
// 若有 false positive 需在這加例外規則(field-level / question-id whitelist)
//
// Grandfather clause (2026-05-16):initial audit 加進來時抓到 13 件 explanation 引用具名 MLOps
// 工具/向量資料庫作為「業界代表性範例」教學說明(IPAS AI 中級考綱「模型部署」可能涵蓋此知識)。
// 接受現狀,audit 主要用途是**阻擋未來新增**的 L3 回流。
// 若使用者裁定嚴格 zero-tolerance,從本 list 移除題目 id 並改寫對應 explanation。
const WHITELIST_IDS = new Set([
  'q_n1_nlp_025',   // Milvus 列為向量資料庫代表
  'q_n3_genai_020', // Chinese-CLIP 跨模態對齊代表
  'q_n5_012',       // MLflow 列為 MLOps 工具代表
  'q_n5_013',       // MLflow / Vertex AI / SageMaker Model Registry 代表
  'q_n5_014',       // MLflow / Vertex / SageMaker Model Registry 教學
  'q_0016',         // Kubeflow vs K8s 釐清(misconceptions + hook)
]);

const Q_FILES = fs.readdirSync(SRC_DIR)
  .filter(f => f.startsWith('questions') && f.endsWith('.json'));

const violations = [];
let totalScanned = 0;

function scanField(label, str, qid, file) {
  if (typeof str !== 'string') return;
  for (const term of BANNED_TERMS) {
    if (str.includes(term)) {
      violations.push({ file, id: qid, field: label, term, snippet: str.substring(Math.max(0, str.indexOf(term) - 20), Math.min(str.length, str.indexOf(term) + term.length + 30)) });
    }
  }
}

for (const f of Q_FILES) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
  const list = data.questions || data;
  if (!Array.isArray(list)) continue;
  for (const q of list) {
    totalScanned++;
    if (WHITELIST_IDS.has(q.id)) continue;
    scanField('stem', q.stem, q.id, f);
    (q.options || []).forEach((o, i) => scanField('options[' + i + '].text', o.text, q.id, f));
    if (q.explanation) {
      scanField('explanation.correct', q.explanation.correct, q.id, f);
      scanField('explanation.hook', q.explanation.hook, q.id, f);
      if (q.explanation.wrong) {
        for (const [k, v] of Object.entries(q.explanation.wrong)) {
          scanField('explanation.wrong[' + k.substring(0, 30) + '...]', v, q.id, f);
        }
      }
    }
    (q.misconceptions || []).forEach((m, i) => scanField('misconceptions[' + i + ']', m, q.id, f));
    // trace_steps (Mode 8) — also scan
    if (Array.isArray(q.trace_steps)) {
      q.trace_steps.forEach((step, si) => {
        scanField('trace_steps[' + si + '].ask', step.ask, q.id, f);
        (step.options || []).forEach((o, oi) => {
          scanField('trace_steps[' + si + '].options[' + oi + '].text', o.text, q.id, f);
          scanField('trace_steps[' + si + '].options[' + oi + '].trap_type', o.trap_type, q.id, f);
        });
      });
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  summary: {
    totalScanned,
    bannedTermsCount: BANNED_TERMS.length,
    whitelistIdsCount: WHITELIST_IDS.size,
    violationsCount: violations.length,
  },
  violations,
};

fs.writeFileSync(path.join(__dirname, 'audit-l3-terms.report.json'), JSON.stringify(report, null, 2));

console.log('=== audit-l3-terms ===');
console.log('scanned: ' + totalScanned + ' questions, banned terms: ' + BANNED_TERMS.length);
console.log('violations: ' + violations.length);
if (violations.length > 0) {
  console.log('--- violations (first 30) ---');
  violations.slice(0, 30).forEach(v => {
    console.log('  ' + v.file + ' | ' + v.id + ' | ' + v.field + ' | "' + v.term + '" | ...' + v.snippet + '...');
  });
  if (violations.length > 30) console.log('  ... +' + (violations.length - 30) + ' more');
  process.exit(1);
}
console.log('PASS — no L3 banned terms detected');
process.exit(0);
