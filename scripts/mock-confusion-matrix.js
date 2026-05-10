// Mock self-validation for src/questions-confusion-matrix.json
//
// 目的:DRIVE 真實 renderQuestion() 執行路徑(從 src/index.html 抽出),驗證:
//   1. matrix_data / expected_answer / extra_classes 不殘留 placeholder
//   2. matrix_data 的 tp/fp/fn/tn 與 extra_classes[].f1 經 Number() 不為 NaN
//   3. 用 rendered.matrix_data 計算 metric,結果與 rendered.expected_answer 容差 ±0.001 內相符
//   4. 每題 ≥2 case,逐 case 都跑(透過暫時覆寫 pickCase 強制選 case_X)
//
// 與舊版本差異(§14 案例 8 修正):
//   舊版本自寫 renderCase() substitution,等同自跑「期望中的替換」,bypass 真實 renderQuestion 路徑
//   → Worker mock 報 PASS 但 UI 仍使用未替換的字面字串 → typical 「audit 看 raw schema 不看 runtime output」
//   新版本把 src/index.html 的 renderQuestion 抽出實際執行,測的是真實使用者會看到的渲染結果
//
// 用法:node scripts/mock-confusion-matrix.js
//   exit 0 = 全 PASS;exit 1 = 任一檢查 FAIL

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(REPO_ROOT, 'src', 'index.html');
const QFILE = path.join(REPO_ROOT, 'src', 'questions-confusion-matrix.json');

// 1) 從 src/index.html 抽出 renderQuestion / applyVariables / pickCase / RNG 並執行於 sandbox
//    手段:讀 HTML、找最大的 <script>(主邏輯所在),擷取所需符號的程式碼區塊
const html = fs.readFileSync(HTML_PATH, 'utf8');

// 簡化:擷取 RNG / applyVariables / pickCase / renderQuestion 四段(以函式 / const 起頭、下一個同層宣告止)
function extractBlock(src, startMarker, endMarkers) {
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) throw new Error('cannot find marker: ' + startMarker);
  let endIdx = src.length;
  for (const em of endMarkers) {
    const pos = src.indexOf(em, startIdx + startMarker.length);
    if (pos > 0 && pos < endIdx) endIdx = pos;
  }
  return src.slice(startIdx, endIdx);
}

const rngBlock = extractBlock(html, 'const RNG = {', ['\n// === Variation', '\nfunction applyVariables']);
const applyVarsBlock = extractBlock(html, 'function applyVariables', ['\n// === 計算題 case', '\nfunction pickCase']);
const pickCaseBlock = extractBlock(html, 'function pickCase', ['\n// === 渲染題目', '\nfunction renderQuestion']);
const renderQBlock = extractBlock(html, 'function renderQuestion', ['\n// === 進度', '\nconst Progress']);

// 注入 sandbox 的 source(只含必要 4 段;不引入整個 HTML script 以避免 DOM 依賴)
const sandboxSrc = [rngBlock, applyVarsBlock, pickCaseBlock, renderQBlock].join('\n');

// 2) 建 sandbox(極簡)— renderQuestion 用到 JSON / Object,皆是內建。pickCase 用 RNG。
const sandbox = { console, JSON, Object, Array, String, Math };
vm.createContext(sandbox);
try {
  vm.runInContext(sandboxSrc, sandbox);
} catch (e) {
  console.error('SANDBOX SETUP FAIL — cannot eval renderQuestion source:', e.message);
  console.error('--- extracted source (first 200 chars) ---');
  console.error(sandboxSrc.slice(0, 200));
  process.exit(2);
}

if (typeof sandbox.renderQuestion !== 'function') {
  console.error('FAIL: renderQuestion not available in sandbox after eval');
  process.exit(2);
}

// 3) 對每題每 case 強制選定該 case(覆寫 pickCase)、跑真實 renderQuestion、驗結果
const data = JSON.parse(fs.readFileSync(QFILE, 'utf8'));

const PH_RE = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
function findResiduals(val, label, hits) {
  if (typeof val === 'string') {
    const ms = val.match(PH_RE);
    if (ms) hits.push({ label, residuals: [...new Set(ms)] });
  } else if (Array.isArray(val)) {
    val.forEach((item, i) => findResiduals(item, `${label}[${i}]`, hits));
  } else if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) findResiduals(v, `${label}.${k}`, hits);
  }
}

function computeMetric(metric, m, extraClasses) {
  const tp = Number(m.tp), fp = Number(m.fp), fn = Number(m.fn), tn = Number(m.tn);
  if ([tp, fp, fn, tn].some(v => Number.isNaN(v))) return NaN;
  let val = 0;
  if (metric === 'precision') val = (tp + fp === 0) ? 0 : tp / (tp + fp);
  else if (metric === 'recall') val = (tp + fn === 0) ? 0 : tp / (tp + fn);
  else if (metric === 'accuracy') {
    const total = tp + fp + fn + tn;
    val = (total === 0) ? 0 : (tp + tn) / total;
  } else if (metric === 'macro_f1') {
    const pA = (tp + fp === 0) ? 0 : tp / (tp + fp);
    const rA = (tp + fn === 0) ? 0 : tp / (tp + fn);
    const f1A = (pA + rA === 0) ? 0 : 2 * pA * rA / (pA + rA);
    const others = (extraClasses || []).map(c => Number(c.f1));
    if (others.some(v => Number.isNaN(v))) return NaN;
    const all = [f1A, ...others];
    val = all.reduce((s, v) => s + v, 0) / all.length;
  } else {
    const p = (tp + fp === 0) ? 0 : tp / (tp + fp);
    const r = (tp + fn === 0) ? 0 : tp / (tp + fn);
    val = (p + r === 0) ? 0 : 2 * p * r / (p + r);
  }
  return val;
}

let passCount = 0;
let failCount = 0;
const errors = [];

for (const q of data.questions) {
  const caseKeys = Object.keys(q.stem_variables || {}).filter(k => k.startsWith('case_'));
  if (caseKeys.length < 2) {
    errors.push(`${q.id}: case 數 = ${caseKeys.length} (< 2,違反鐵律 #2)`);
    failCount++;
    continue;
  }

  for (const ck of caseKeys) {
    // 覆寫 sandbox.pickCase,強制選定該 case(回傳 stem_variables[ck])
    sandbox.pickCase = function (question) {
      if (question.format !== 'calculation' || !question.stem_variables) return null;
      return question.stem_variables[ck] || null;
    };

    let rendered;
    try {
      // 用 sandbox 真實的 renderQuestion 執行
      rendered = sandbox.renderQuestion(q);
    } catch (e) {
      failCount++;
      errors.push(`${q.id} ${ck}: renderQuestion 拋例外 — ${e.message}`);
      continue;
    }

    // (a) 殘留 placeholder 檢查 — matrix_data / expected_answer / extra_classes
    const hits = [];
    if (rendered.matrix_data) findResiduals(rendered.matrix_data, 'matrix_data', hits);
    if (typeof rendered.expected_answer === 'string') findResiduals(rendered.expected_answer, 'expected_answer', hits);
    if (Array.isArray(rendered.extra_classes)) findResiduals(rendered.extra_classes, 'extra_classes', hits);
    if (hits.length > 0) {
      failCount++;
      errors.push(`${q.id} ${ck}: 殘留 placeholder — ` + hits.map(h => `${h.label}=${h.residuals.join(',')}`).join('; '));
      continue;
    }

    // (b) Number() 可解析性檢查 — matrix_data 四欄 + extra_classes[].f1
    const md = rendered.matrix_data || {};
    const numChecks = { tp: md.tp, fp: md.fp, fn: md.fn, tn: md.tn };
    const nanFields = Object.entries(numChecks).filter(([_, v]) => Number.isNaN(Number(v))).map(([k]) => k);
    if (nanFields.length > 0) {
      failCount++;
      errors.push(`${q.id} ${ck}: matrix_data 數值 Number() = NaN 於 ${nanFields.join(',')}(實際值 ${nanFields.map(k => k+'='+JSON.stringify(numChecks[k])).join(', ')})`);
      continue;
    }
    if (Array.isArray(rendered.extra_classes)) {
      const badF1 = rendered.extra_classes.filter(c => Number.isNaN(Number(c.f1)));
      if (badF1.length > 0) {
        failCount++;
        errors.push(`${q.id} ${ck}: extra_classes 有 ${badF1.length} 個 f1 值 Number() = NaN`);
        continue;
      }
    }

    // (c) expected_answer 經 parseFloat 不為 NaN
    const expectedNum = parseFloat(rendered.expected_answer);
    if (Number.isNaN(expectedNum)) {
      failCount++;
      errors.push(`${q.id} ${ck}: expected_answer 解析為 NaN(實際值 ${JSON.stringify(rendered.expected_answer)})`);
      continue;
    }

    // (d) 用 rendered 數值跑 metric 計算,與 rendered.expected_answer 比對
    const computed = computeMetric(rendered.expected_metric || 'f1', md, rendered.extra_classes || []);
    if (Number.isNaN(computed)) {
      failCount++;
      errors.push(`${q.id} ${ck}: 計算結果為 NaN`);
      continue;
    }
    const diff = Math.abs(computed - expectedNum);
    if (diff > 0.001) {
      failCount++;
      errors.push(`${q.id} ${ck}: metric=${q.expected_metric}, computed=${computed.toFixed(3)}, expected=${expectedNum.toFixed(3)}, diff=${diff.toFixed(4)}`);
      continue;
    }

    passCount++;
  }

  // (e) 全題層級:options 必有恰 1 個 is_correct: true
  const correctCount = (q.options || []).filter(o => o.is_correct === true).length;
  if (correctCount !== 1) {
    failCount++;
    errors.push(`${q.id}: is_correct 計數 = ${correctCount},應為 1`);
  }
}

const total = passCount + failCount;
console.log(`mock-confusion-matrix.js (drives real renderQuestion): PASS=${passCount}/${total}, FAIL=${failCount}`);
if (errors.length > 0) {
  console.log('--- errors ---');
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('all rendered outputs verified — no residual placeholders, numeric values valid, metric computations match expected_answer');
