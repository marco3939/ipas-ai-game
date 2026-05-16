// 鐵律 #4 稽核:檢查「選最長 = 選對」的比例
// 用法:node scripts/audit-option-length.js
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const FILES = [
  'questions.json',
  'questions-pa-code.json',
  'questions-pb-visual.json',
  'questions-pc-modes.json',
  'questions-pd-scenario.json',
  'questions-pe-advanced-s1.json',
  'questions-pf-advanced-s3.json',
  'questions-pg-eval.json',
  'questions-ph-mlops.json',
  'questions-batch-n1-nlp.json',
  'questions-batch-n2-cv.json',
  'questions-batch-n3-genai.json',
  'questions-batch-n4-planning.json',
  'questions-batch-n5-deploy.json',
  'questions-batch-n6-ml-core.json',
  'questions-batch-n7-dl.json',
  'questions-batch-n8-eval-gov.json',
  'questions-batch-n9-subject2.json',
  'questions-batch-n10-L22102.json', 'questions-batch-n11-L22103.json',
  'questions-batch-n12-L22201.json', 'questions-batch-n13-L22202.json', 'questions-batch-n14-L22203.json',
  'questions-batch-n15-L22301.json', 'questions-batch-n16-L22302.json', 'questions-batch-n17-L22303.json',
  'questions-batch-n18-L22401.json', 'questions-batch-n19-L22402.json', 'questions-batch-n20-L22403.json', 'questions-batch-n21-L22404.json',
  'questions-batch-n22-L22-code-data.json', 'questions-batch-n23-L22-code-ml.json', 'questions-batch-n24-L22-code-gen.json',
  'questions-confusion-matrix.json',
  'questions-mode8-trace.json',
];

const stats = {
  singleChoice: 0,
  longestIsCorrect: 0,
  shortestIsCorrect: 0,
  ratios: [],
  flagged: [], // 正解明顯比平均錯解長 ≥1.3x
  acceptable: 0, // ratio in [0.8, 1.25]
};

function getOptionText(o) {
  if (typeof o === 'string') return o;
  return o.text || o.label || o.content || '';
}

function isCorrect(o, q, idx) {
  if (typeof o === 'object' && 'is_correct' in o) return o.is_correct === true;
  if (q.answer) {
    const key = ['a','b','c','d','e'][idx];
    return q.answer === key || q.answer === o.key;
  }
  return false;
}

function analyzeQuestion(q, file) {
  // 接受 single_choice / single
  const fmt = q.format || q.type;
  if (fmt && !/single/.test(fmt) && fmt !== 'single_choice') return;
  if (!q.options || !Array.isArray(q.options) || q.options.length < 2) return;

  // 取選項
  const opts = q.options.map((o, i) => ({
    idx: i,
    text: getOptionText(o),
    correct: isCorrect(o, q, i),
  }));
  // 過濾過短(可能是公式選項,不算)
  const allLen = opts.map(o => o.text.length);
  const correct = opts.find(o => o.correct);
  if (!correct) return; // 沒標正解(matching/sequence/calc),略過

  stats.singleChoice++;

  const sorted = [...opts].sort((a, b) => b.text.length - a.text.length);
  const longest = sorted[0];
  const shortest = sorted[sorted.length - 1];

  if (longest === correct) stats.longestIsCorrect++;
  if (shortest === correct) stats.shortestIsCorrect++;

  const wrongs = opts.filter(o => !o.correct);
  const avgWrongLen = wrongs.reduce((s, o) => s + o.text.length, 0) / wrongs.length;
  const ratio = correct.text.length / Math.max(avgWrongLen, 1);
  stats.ratios.push(ratio);

  if (ratio >= 0.8 && ratio <= 1.25) stats.acceptable++;

  if (ratio >= 1.3 && correct.text.length >= 15) {
    stats.flagged.push({
      file,
      id: q.id,
      stem: (q.stem || q.stem_template || '').substring(0, 60),
      correctText: correct.text.substring(0, 80),
      correctLen: correct.text.length,
      avgWrongLen: avgWrongLen.toFixed(1),
      ratio: ratio.toFixed(2),
      wrongLens: wrongs.map(w => w.text.length),
    });
  }
}

for (const f of FILES) {
  const fp = path.join(SRC_DIR, f);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.questions || data;
  if (!Array.isArray(list)) continue;
  list.forEach(q => analyzeQuestion(q, f));
}

const longestPct = (stats.longestIsCorrect / stats.singleChoice * 100).toFixed(1);
const shortestPct = (stats.shortestIsCorrect / stats.singleChoice * 100).toFixed(1);
const avgRatio = (stats.ratios.reduce((s,r)=>s+r,0) / stats.ratios.length).toFixed(2);
const acceptablePct = (stats.acceptable / stats.singleChoice * 100).toFixed(1);

console.log('═══ 鐵律 #4 稽核報告 ═══');
console.log(`單選題總數:${stats.singleChoice}`);
console.log(`「最長 = 正解」題數:${stats.longestIsCorrect}/${stats.singleChoice} = ${longestPct}%  (理想 ≈ 25%,>40% 即偏差)`);
console.log(`「最短 = 正解」題數:${stats.shortestIsCorrect}/${stats.singleChoice} = ${shortestPct}%  (理想 ≈ 25%)`);
console.log(`正解平均長度 / 錯解平均長度:${avgRatio}x  (理想 ≈ 1.0x,> 1.2 即偏差)`);
console.log(`長度均衡(0.8x ~ 1.25x):${stats.acceptable}/${stats.singleChoice} = ${acceptablePct}%`);
console.log(`\n旗標題目(正解 ≥ 1.3x 平均錯解,且 ≥ 15 字):${stats.flagged.length}`);
stats.flagged.slice(0, 30).forEach(f => {
  console.log(`  [${f.file}] ${f.id}  ${f.correctLen}字 vs 錯${f.avgWrongLen}字 = ${f.ratio}x`);
  console.log(`     Q: ${f.stem}`);
  console.log(`     ✅: ${f.correctText}`);
});
if (stats.flagged.length > 30) console.log(`  ... 另 ${stats.flagged.length - 30} 題`);

fs.writeFileSync(
  path.join(__dirname, 'audit-option-length.report.json'),
  JSON.stringify({ summary: { total: stats.singleChoice, longestPct, shortestPct, avgRatio, acceptablePct, flaggedCount: stats.flagged.length }, flagged: stats.flagged }, null, 2),
  'utf8'
);
console.log(`\n→ 完整報告已寫入 scripts/audit-option-length.report.json`);
