// 驗證 Mode1 新版 pickQuestionsForBoss 的真隨機性
// 用法:node scripts/verify-mode1-randomness.js
//
// 為何要這支腳本:
// 使用者實測抱怨「每場題目幾乎一樣」,推測原因是 Date.now() 同毫秒重入,RNG 種子相同,
// 導致 RNG.pickN(pool, n) 抽到一樣的題目組。本腳本模擬新邏輯(pool 擴大 + 強化種子),
// 驗證連跑 N 場是否真有變化(集合 IoU 應 < 0.5)。
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
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

let QUESTIONS = [];
for (const f of FILES) {
  const p = path.join(SRC, f);
  if (!fs.existsSync(p)) continue;
  try { QUESTIONS.push(...(JSON.parse(fs.readFileSync(p, 'utf8')).questions || [])); }
  catch (e) { console.error('PARSE ERROR', f, e.message); }
}

// 鏡像 index.html const RNG mulberry32
const RNG = {
  seed: Date.now(),
  set(s) { this.seed = s; },
  next() {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  },
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  pickN(arr, n) { return this.shuffle(arr).slice(0, n); }
};

const BOSSES = [
  { key: 'ecommerce', keywords: ['電商','顧客','評論','行銷','推薦','流失','RFM','個人化'] },
  { key: 'finance', keywords: ['金融','銀行','信用','風控','詐欺','評分卡','監管','PSI'] },
  { key: 'medical', keywords: ['醫療','醫院','診斷','病人','臨床','陽性','偵測','SMOTE'] },
  { key: 'autonomous', keywords: ['自駕','自動駕駛','車輛','影像','物件','分割','CNN','即時'] },
  { key: 'manufacturing', keywords: ['製造','智慧製造','生產線','瑕疵','感測器','故障','設備','預測'] },
  { key: 'energy', keywords: ['電力','太陽能','能源','風險','機率','分布','預測','時序'] },
  { key: 'telecom', keywords: ['電信','客戶流失','通話','頻率','LASSO','特徵','多重共線'] },
  { key: 'media', keywords: ['媒體','行銷','廣告','生成','Stable Diffusion','GAN','侵權','著作權'] },
  { key: 'smartcity', keywords: ['智慧城市','監控','交通','人臉','族群','偏誤','公平性'] },
  { key: 'education', keywords: ['教育','學生','個人化','學習','多模態','CLIP','資料缺失'] },
  { key: 'logistics', keywords: ['物流','配送','即時','推論','部署','API','延遲','水平擴展'] },
  { key: 'legal', keywords: ['法律','律師','NLP','RAG','檢索','幻覺','BERT','契約'] }
];

const BOSS_QUESTIONS_PER_BATTLE = 20;

// 鏡像新版 pickQuestionsForBoss
function pickQuestionsForBoss(boss, n = BOSS_QUESTIONS_PER_BATTLE) {
  const matched = QUESTIONS.filter(q => {
    const text = (q.stem || '') + ' ' + (q.tags || []).join(' ');
    return boss.keywords.some(k => text.includes(k));
  });
  let pool = [...new Set(matched)];
  const VARIATION_FLOOR = n * 2;
  if (pool.length < VARIATION_FLOOR) {
    const general = QUESTIONS.filter(q => q.subject === 1 && !pool.includes(q));
    pool = [...pool, ...RNG.pickN(general, Math.max(0, VARIATION_FLOOR - pool.length))];
  }
  return RNG.pickN(pool, Math.min(n, pool.length));
}

console.log('=== Mode1 隨機性驗證:每 BOSS 連跑 5 場(不同種子)===\n');
console.log('BOSS            題數  唯一題ID聯集  跨場 IoU(平均)  判定');
console.log('---------------------------------------------------------------');

const RUNS = 5;
let allPass = true;

for (const boss of BOSSES) {
  // 用不同種子 5 次
  const battles = [];
  for (let r = 0; r < RUNS; r++) {
    RNG.set(Date.now() + r * 12345 + Math.floor(Math.random() * 1e5));
    const qs = pickQuestionsForBoss(boss);
    battles.push(new Set(qs.map(q => q.id || q.qid || JSON.stringify(q.stem))));
  }
  const sizes = battles.map(s => s.size);
  const unionAll = new Set();
  battles.forEach(s => s.forEach(id => unionAll.add(id)));

  // 計算所有 pair 的 Jaccard,取平均
  let pairCount = 0, iouSum = 0;
  for (let i = 0; i < battles.length; i++) {
    for (let j = i + 1; j < battles.length; j++) {
      const a = battles[i], b = battles[j];
      const inter = [...a].filter(x => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      iouSum += union === 0 ? 0 : inter / union;
      pairCount++;
    }
  }
  const avgIoU = pairCount === 0 ? 0 : iouSum / pairCount;
  // 標準:平均 IoU < 0.5 = 集合差異 ≥ 50%(任意兩場至少一半題目不同)
  const pass = avgIoU < 0.5;
  if (!pass) allPass = false;

  console.log(
    `${boss.key.padEnd(14)} ${String(sizes[0]).padStart(3)}   ${String(unionAll.size).padStart(3)}        ${avgIoU.toFixed(3)}            ${pass ? 'PASS' : 'FAIL'}`
  );
}

console.log('\n=== 控制組:RNG.set(0) 5 次(固定種子應抽到完全相同題)===');
const ctlBoss = BOSSES[0];
const ctlBattles = [];
for (let r = 0; r < RUNS; r++) {
  RNG.set(0);
  const qs = pickQuestionsForBoss(ctlBoss);
  ctlBattles.push(new Set(qs.map(q => q.id || q.qid || JSON.stringify(q.stem))));
}
let allSame = true;
for (let i = 1; i < ctlBattles.length; i++) {
  const a = ctlBattles[0], b = ctlBattles[i];
  if (a.size !== b.size) { allSame = false; break; }
  for (const x of a) if (!b.has(x)) { allSame = false; break; }
}
console.log(`Same seed → identical sets: ${allSame ? 'YES (RNG 工作正常)' : 'NO (RNG 有不確定性,異常)'}`);

console.log('\n=== 整體判定 ===');
console.log(allPass ? 'PASS — 真隨機驗證通過(每 BOSS 跨場 IoU < 0.5)' : 'FAIL — 部分 BOSS 池太小,跨場重複度高');
process.exit(allPass ? 0 : 1);
