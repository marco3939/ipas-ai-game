// 鐵律 #2+#5 額外稽核:模擬 renderQuestion 跑 case 替換,驗 rendered output 不含未替換 placeholder
// 用法:node scripts/audit-render.js
//
// 為何要這支腳本:
// QA Round 1+2 都漏抓 calculation 題的 {answer} {wrong1} placeholder 沒被 renderQuestion 替換的 critical bug。
// 原因:其他 audit 看 schema(原始 options[].text 字面字串),不看 rendered output。
// 此腳本模擬 renderQuestion 的 case 替換邏輯,確保每題每 case 渲染後輸出乾淨。

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

// 模擬 index.html renderQuestion 的 case 替換邏輯
function simulateRender(q, caseKey) {
  const r = JSON.parse(JSON.stringify(q));
  if (q.format === 'calculation' && q.stem_variables && q.stem_variables[caseKey]) {
    const c = q.stem_variables[caseKey];
    const subAll = (s) => {
      if (typeof s !== 'string') return s;
      let out = s;
      for (const [k, v] of Object.entries(c)) out = out.replaceAll(`{${k}}`, v);
      return out;
    };
    r.stem = subAll(r.stem);
    r.options = r.options.map(o => ({ ...o, text: subAll(o.text) }));
    if (r.explanation) {
      if (r.explanation.correct) r.explanation.correct = subAll(r.explanation.correct);
      if (r.explanation.hook) r.explanation.hook = subAll(r.explanation.hook);
      if (r.explanation.wrong) {
        const nw = {};
        for (const [k, v] of Object.entries(r.explanation.wrong)) nw[subAll(k)] = subAll(v);
        r.explanation.wrong = nw;
      }
    }
  } else if (q.stem_variables) {
    // single_choice 等帶變數池的題型(stem_variables 是 array 池)
    for (const [k, pool] of Object.entries(q.stem_variables)) {
      if (Array.isArray(pool) && pool.length > 0) {
        r.stem = r.stem.replaceAll(`{${k}}`, pool[0]); // 取第一個值代表
      }
    }
  }
  return r;
}

// 找出 rendered 物件內所有殘留的 {xxx} placeholder
function findResidualPlaceholders(rendered) {
  const hits = [];
  const PH_RE = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
  const scan = (label, str) => {
    if (typeof str !== 'string') return;
    const ms = str.match(PH_RE);
    if (ms) hits.push({ label, residuals: [...new Set(ms)] });
  };
  scan('stem', rendered.stem);
  (rendered.options || []).forEach((o, i) => scan(`options[${i}].text`, o.text));
  if (rendered.explanation) {
    scan('explanation.correct', rendered.explanation.correct);
    scan('explanation.hook', rendered.explanation.hook);
    if (rendered.explanation.wrong) {
      Object.entries(rendered.explanation.wrong).forEach(([k, v]) => {
        scan(`explanation.wrong key`, k);
        scan(`explanation.wrong[${k}]`, v);
      });
    }
  }
  return hits;
}

const violations = [];
let totalQ = 0, calcQ = 0, casesChecked = 0;

for (const f of FILES) {
  const fp = path.join(SRC_DIR, f);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.questions || data;
  if (!Array.isArray(list)) continue;

  list.forEach(q => {
    totalQ++;
    if (q.format === 'calculation') {
      calcQ++;
      const cases = Object.keys(q.stem_variables || {}).filter(k => k.startsWith('case_'));
      if (cases.length === 0) {
        violations.push({ file: f, id: q.id, type: 'NO_CASES', detail: 'calculation 題缺 stem_variables.case_X' });
        return;
      }
      // 對每個 case 都跑一次,確保任何 case 都不會殘留
      cases.forEach(ck => {
        casesChecked++;
        const r = simulateRender(q, ck);
        const hits = findResidualPlaceholders(r);
        if (hits.length > 0) {
          violations.push({ file: f, id: q.id, type: 'RESIDUAL_PLACEHOLDER', case: ck, hits });
        }
        // 額外:驗證有且只有 1 個 is_correct
        const correctCount = (r.options || []).filter(o => o.is_correct).length;
        if (correctCount !== 1) {
          violations.push({ file: f, id: q.id, type: 'IS_CORRECT_BAD', case: ck, detail: `is_correct count = ${correctCount}` });
        }
      });
    } else {
      // 非 calc 題也檢查 stem 變數池有沒有殘留
      const r = simulateRender(q);
      const hits = findResidualPlaceholders(r);
      if (hits.length > 0) {
        violations.push({ file: f, id: q.id, type: 'RESIDUAL_PLACEHOLDER_NONCALC', hits });
      }
    }
  });
}

const report = {
  summary: { totalQ, calcQ, casesChecked, violations: violations.length },
  violations,
};

fs.writeFileSync(path.join(__dirname, 'audit-render.report.json'), JSON.stringify(report, null, 2), 'utf8');

try {
  console.log('=== iron-rule render audit ===');
  console.log(`totalQ: ${totalQ}, calculation: ${calcQ}, cases checked: ${casesChecked}`);
  console.log(`violations: ${violations.length}`);
  if (violations.length > 0) {
    console.log('--- violations (first 20) ---');
    violations.slice(0, 20).forEach(v => {
      console.log(`[${v.file}] ${v.id} ${v.type}${v.case ? ' '+v.case : ''}`);
      if (v.hits) v.hits.forEach(h => console.log(`  ${h.label}: ${h.residuals.join(', ')}`));
      if (v.detail) console.log(`  ${v.detail}`);
    });
    process.exitCode = 1;
  } else {
    console.log('PASS — no residual placeholder, all is_correct counts OK');
  }
  console.log(`\n-> report: scripts/audit-render.report.json`);
} catch (e) {}
