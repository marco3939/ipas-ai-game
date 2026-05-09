// Mode1 BOSS keyword pool verification.
// Mocks pickQuestionsForBoss logic to verify each of 12 BOSSES can find enough questions.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

// Mirror the file list from index.html loadQuestions()
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
  'questions-batch-n8-eval-gov.json'
];

let QUESTIONS = [];
for (const f of FILES) {
  const p = path.join(SRC, f);
  if (!fs.existsSync(p)) { console.warn('MISSING', f); continue; }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    QUESTIONS.push(...(j.questions || []));
  } catch (e) {
    console.error('PARSE ERROR', f, e.message);
  }
}
console.log(`Total loaded: ${QUESTIONS.length} questions\n`);

// Mirror BOSSES from mode1.js
const BOSSES = [
  { key: 'ecommerce', name: '王董', keywords: ['電商','顧客','評論','行銷','推薦','流失','RFM','個人化'] },
  { key: 'finance', name: '李行長', keywords: ['金融','銀行','信用','風控','詐欺','評分卡','監管','PSI'] },
  { key: 'medical', name: '陳主任', keywords: ['醫療','醫院','診斷','病人','臨床','陽性','偵測','SMOTE'] },
  { key: 'autonomous', name: '林博士', keywords: ['自駕','自動駕駛','車輛','影像','物件','分割','CNN','即時'] },
  { key: 'manufacturing', name: '張廠長', keywords: ['製造','智慧製造','生產線','瑕疵','感測器','故障','設備','預測'] },
  { key: 'energy', name: '吳總', keywords: ['電力','太陽能','能源','風險','機率','分布','預測','時序'] },
  { key: 'telecom', name: '黃副總', keywords: ['電信','客戶流失','通話','頻率','LASSO','特徵','多重共線'] },
  { key: 'media', name: '蘇導演', keywords: ['媒體','行銷','廣告','生成','Stable Diffusion','GAN','侵權','著作權'] },
  { key: 'smartcity', name: '周局長', keywords: ['智慧城市','監控','交通','人臉','族群','偏誤','公平性'] },
  { key: 'education', name: '高教授', keywords: ['教育','學生','個人化','學習','多模態','CLIP','資料缺失'] },
  { key: 'logistics', name: '羅董', keywords: ['物流','配送','即時','推論','部署','API','延遲','水平擴展'] },
  { key: 'legal', name: '簡律師', keywords: ['法律','律師','NLP','RAG','檢索','幻覺','BERT','契約'] }
];

// Mirror the matching logic exactly
function pickPool(boss) {
  const matched = QUESTIONS.filter(q => {
    const text = (q.stem || '') + ' ' + (q.tags || []).join(' ');
    return boss.keywords.some(k => text.includes(k));
  });
  return [...new Set(matched)];
}

console.log('BOSS\t\tdirect-matches  general-pool-fallback');
console.log('---------------------------------------------------------');

for (const boss of BOSSES) {
  const pool = pickPool(boss);
  const general = QUESTIONS.filter(q => q.subject === 1 && !pool.includes(q));
  const totalAvail = pool.length + general.length;
  const status = pool.length === 0 ? '!! ZERO MATCH' : (pool.length < 3 ? `WARN <3` : 'OK');
  console.log(`${boss.key.padEnd(15)} ${String(pool.length).padStart(3)}            (subject=1 fallback: ${general.length})  ${status}`);
  // List first 2 matches' stems
  if (pool.length > 0 && pool.length < 3) {
    pool.slice(0, 3).forEach((q, i) => console.log(`    [${i+1}] ${(q.stem || '').substring(0, 60)}...`));
  }
}

// also check subject=1 count overall (for the fallback to work)
const s1 = QUESTIONS.filter(q => q.subject === 1).length;
console.log(`\nTotal subject=1 questions: ${s1}`);
console.log(`Total subject=3 questions: ${QUESTIONS.filter(q => q.subject === 3).length}`);
console.log(`Other: ${QUESTIONS.filter(q => q.subject !== 1 && q.subject !== 3).length}`);
