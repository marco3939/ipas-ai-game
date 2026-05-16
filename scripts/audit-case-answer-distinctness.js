#!/usr/bin/env node
// audit-case-answer-distinctness.js
// 鐵律 #2 精神延伸:跨 case 答案變異性稽核
// 防止 q_pa_008 / q_n7_dl_019 反模式 — Worker 跑 Python 驗每個 case 過,
// 但所有 case 的 answer 都一樣 → 使用者死記答案,失去動態題庫意義。
//
// 規則:
//   1. 每題有 stem_variables.case_* 池 → 收集所有 case 的 answer
//      - distinct(answers) < len(answers) → DUPLICATE_ANSWER_ACROSS_CASES
//   2. code_trace 題型(沒 top-level answer,有 sN_correct 多步驟正解):
//      - 每個 sN_correct 跨 case 收集
//      - 若 *所有* sN_correct 全 case 皆相同 → NO_STEP_VARIANCE
//      - 只要有任一 step 變異即接受(結構常量如 shape/dtype 跨 case 不變 OK)
//
// 輸出:scripts/audit-case-answer-distinctness.report.json
// 退出碼:violations === 0 → 0,否則 1

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// 與 audit-render.js 同步的題庫檔清單(若新增題庫請兩處同步)
const Q_FILES = [
  'questions.json', 'questions-pa-code.json', 'questions-pb-visual.json',
  'questions-pc-modes.json', 'questions-pd-scenario.json',
  'questions-pe-advanced-s1.json', 'questions-pf-advanced-s3.json',
  'questions-pg-eval.json', 'questions-ph-mlops.json',
  'questions-batch-n1-nlp.json', 'questions-batch-n2-cv.json',
  'questions-batch-n3-genai.json', 'questions-batch-n4-planning.json',
  'questions-batch-n5-deploy.json', 'questions-batch-n6-ml-core.json',
  'questions-batch-n7-dl.json', 'questions-batch-n8-eval-gov.json',
  'questions-batch-n9-subject2.json',
  'questions-batch-n10-L22102.json', 'questions-batch-n11-L22103.json',
  'questions-batch-n12-L22201.json', 'questions-batch-n13-L22202.json', 'questions-batch-n14-L22203.json',
  'questions-batch-n15-L22301.json', 'questions-batch-n16-L22302.json', 'questions-batch-n17-L22303.json',
  'questions-batch-n18-L22401.json', 'questions-batch-n19-L22402.json', 'questions-batch-n20-L22403.json', 'questions-batch-n21-L22404.json',
  'questions-batch-n22-L22-code-data.json', 'questions-batch-n23-L22-code-ml.json', 'questions-batch-n24-L22-code-gen.json',
  'questions-confusion-matrix.json',
  'questions-mode8-trace.json',
];

let totalQuestions = 0;
let casedQuestions = 0;
const violations = [];

for (const f of Q_FILES) {
  const fp = path.join(SRC_DIR, f);
  if (!fs.existsSync(fp)) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    violations.push({ file: f, id: '(file-parse)', type: 'JSON_PARSE_ERROR', detail: e.message });
    continue;
  }
  const list = data.questions || data;
  if (!Array.isArray(list)) continue;

  for (const q of list) {
    totalQuestions++;
    if (!q || !q.stem_variables) continue;
    const cases = Object.entries(q.stem_variables).filter(([k]) => k.startsWith('case_'));
    if (cases.length === 0) continue;
    casedQuestions++;

    if (q.format === 'code_trace') {
      // 多步驟正解:從第一個 case 取所有 sN_correct keys(動態決定步驟數)
      const firstCase = cases[0][1] || {};
      const stepCorrectKeys = Object.keys(firstCase).filter(k => /^s\d+_correct$/.test(k));

      if (stepCorrectKeys.length === 0) {
        // 退回:若 code_trace 沒有 sN_correct 但有 top-level answer,則照一般題檢查
        const answers = cases.map(([, c]) => c.answer).filter(a => a !== undefined);
        if (answers.length > 0 && new Set(answers).size < answers.length) {
          violations.push({
            file: f, id: q.id, type: 'DUPLICATE_ANSWER_ACROSS_CASES',
            answers, distinct: new Set(answers).size, total: answers.length
          });
        }
        continue;
      }

      // 任一 step 在 cases 間有變異 → 接受;全部 step 皆無變異 → 違規
      let anyVaries = false;
      for (const sk of stepCorrectKeys) {
        const vals = cases.map(([, c]) => c[sk]);
        if (new Set(vals).size > 1) { anyVaries = true; break; }
      }
      if (!anyVaries) {
        // 也回報每個 sN_correct 的單一值,方便偵錯
        const stepValues = {};
        for (const sk of stepCorrectKeys) {
          stepValues[sk] = cases[0][1][sk];
        }
        violations.push({
          file: f, id: q.id, type: 'NO_STEP_VARIANCE',
          stepKeys: stepCorrectKeys, stepValues,
          distinct: 1, total: cases.length
        });
      }
    } else {
      // 一般題型:檢查 top-level answer 是否跨 case 變異
      const answers = cases.map(([, c]) => c.answer);
      // 若該題 cases 中沒有 answer 欄位(例如純 stem 替換 RAG 題),跳過
      if (answers.every(a => a === undefined)) continue;
      const distinct = new Set(answers).size;
      if (distinct < answers.length) {
        violations.push({
          file: f, id: q.id, type: 'DUPLICATE_ANSWER_ACROSS_CASES',
          answers, distinct, total: answers.length
        });
      }
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  summary: {
    totalQuestions,
    casedQuestions,
    violations: violations.length
  },
  violations
};

const reportPath = path.join(__dirname, 'audit-case-answer-distinctness.report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log('=== iron-rule-2 case-answer-distinctness audit ===');
console.log(`totalQuestions: ${totalQuestions}, casedQuestions: ${casedQuestions}, violations: ${violations.length}`);

if (violations.length > 0) {
  console.log('--- violations ---');
  for (const v of violations) {
    console.log(`  [${v.type}] ${v.file}:${v.id} — distinct ${v.distinct} / ${v.total}`);
    if (v.answers) console.log(`    answers: ${v.answers.join(' | ')}`);
    if (v.stepValues) {
      console.log(`    stepValues: ${Object.entries(v.stepValues).map(([k, val]) => `${k}=${val}`).join(' | ')}`);
    }
    if (v.detail) console.log(`    detail: ${v.detail}`);
  }
  console.log(`\n-> report: scripts/audit-case-answer-distinctness.report.json`);
  process.exit(1);
}

console.log('PASS — all case-bearing questions have distinct answers across cases');
console.log(`\n-> report: scripts/audit-case-answer-distinctness.report.json`);
process.exit(0);
