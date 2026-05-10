// 一次性驗證:mode2 新「資料視覺化判讀靈」BOSS 題池實際存在於題庫
// 複製 mode2.js 中的 BOSS qids 與 effectiveBossHp 公式,跨 17 題庫檔模擬篩題
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const FILES = [
  'questions.json', 'questions-pa-code.json', 'questions-pb-visual.json',
  'questions-pc-modes.json', 'questions-pd-scenario.json',
  'questions-pe-advanced-s1.json', 'questions-pf-advanced-s3.json',
  'questions-pg-eval.json', 'questions-ph-mlops.json',
  'questions-batch-n1-nlp.json', 'questions-batch-n2-cv.json',
  'questions-batch-n3-genai.json', 'questions-batch-n4-planning.json',
  'questions-batch-n5-deploy.json', 'questions-batch-n6-ml-core.json',
  'questions-batch-n7-dl.json', 'questions-batch-n8-eval-gov.json',
];

// 載入所有題目到一個 map
const QUESTIONS = [];
for (const f of FILES) {
  const fp = path.join(SRC_DIR, f);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.questions || data;
  if (Array.isArray(list)) QUESTIONS.push(...list);
}

// 同步 mode2.js 的 6 個 BOSS qids(可由人工核對更新)
const BOSSES = [
  { key: 'numpy', hp: 140, qids: ['q_pa_001', 'q_pa_002', 'q_pa_003', 'q_pa_004', 'q_pa_005'] },
  { key: 'sklearn', hp: 130, qids: ['q_pa_006', 'q_pa_007', 'q_pa_008', 'q_pa_009'] },
  { key: 'pytorch', hp: 130, qids: ['q_pa_010', 'q_pa_011', 'q_pa_012', 'q_0029'] },
  { key: 'pandas', hp: 90, qids: ['q_pa_013', 'q_pa_014'] },
  { key: 'visualization', hp: 100, qids: ['q_pb_001', 'q_pb_007', 'q_pb_009', 'q_pb_010'] },
  { key: 'probability', hp: 70, qids: ['q_0024'] },
];

function effectiveBossHp(boss, qcount) {
  if (qcount <= 0) return 0;
  const perQ = 25;
  const calc = qcount * perQ;
  return Math.min(boss.hp, Math.max(perQ, calc));
}

console.log('=== Mode2 BOSS 題池存活檢查 ===');
console.log(`題庫總題數:${QUESTIONS.length}`);
console.log('');

let totalDisabled = 0;
let allOk = true;

for (const b of BOSSES) {
  const hits = b.qids.filter(id => QUESTIONS.find(q => q.id === id));
  const dynHp = effectiveBossHp(b, hits.length);
  const disabled = hits.length === 0;
  const status = disabled ? '🚧 DISABLED' : (hits.length < b.qids.length ? '⚠️ REDUCED' : '✅ FULL');
  console.log(`${status} [${b.key}] ${hits.length}/${b.qids.length} 題  HP ${dynHp}/${b.hp}`);
  hits.forEach(id => console.log(`     · ${id}`));
  if (disabled) { totalDisabled++; allOk = false; }
}

console.log('');
console.log(`Disabled BOSSes: ${totalDisabled}`);

// 驗 visualization 不再 disabled
const viz = BOSSES.find(b => b.key === 'visualization');
const vizHits = viz.qids.filter(id => QUESTIONS.find(q => q.id === id));
if (vizHits.length === 0) {
  console.log('FAIL — visualization BOSS 仍 disabled');
  process.exitCode = 1;
} else if (vizHits.length < 3) {
  console.log(`WARN — visualization BOSS 題數 ${vizHits.length} < 3,撐戰時間可能太短`);
  process.exitCode = 1;
} else {
  console.log(`PASS — visualization BOSS 題數 ${vizHits.length} ≥ 3,可正常開戰`);
}

// 額外驗:所有 q_pb 題都是 table_reading 且具有 table_data
console.log('');
console.log('=== visualization BOSS 題目 schema 驗證 ===');
for (const id of viz.qids) {
  const q = QUESTIONS.find(x => x.id === id);
  if (!q) { console.log(`MISS ${id}`); continue; }
  const hasTable = !!q.table_data;
  const hasExpl = !!(q.explanation && q.explanation.correct);
  const hasShuf = q.shuffle_options === true;
  console.log(`  ${id}: format=${q.format}  table_data=${hasTable ? '✓' : '✗'}  explanation=${hasExpl ? '✓' : '✗'}  shuffle=${hasShuf ? '✓' : '✗'}  knowledge_code=${q.knowledge_code}`);
}
