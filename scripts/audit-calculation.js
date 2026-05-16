// Calculation question deep audit (v2 - aware of options_template schema)
// Schema variants observed:
//   A. options array + stem_variables.case_X.{answer,wrongN}; option text uses {answer}/{wrongN}
//   B. options_template[case_X] = array; explanation.wrong keys are LITERAL values
//   C. No stem_variables (placeholder bug class)
// renderQuestion only handles variant A correctly. variant B requires per-case options.

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter(f => f.startsWith('questions') && f.endsWith('.json'));

const results = [];

function extractPlaceholders(s) {
  if (typeof s !== 'string') return [];
  const matches = s.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  return matches.map(m => m.slice(1, -1));
}

function unique(arr) { return [...new Set(arr)]; }

files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  (d.questions || []).forEach(q => {
    if (q.format !== 'calculation') return;
    const violations = [];
    const sv = q.stem_variables || {};
    const cases = Object.entries(sv).filter(([k]) => k.startsWith('case_'));
    const nonCaseKeys = Object.entries(sv).filter(([k]) => !k.startsWith('case_'));
    const hasOptionsArr = Array.isArray(q.options);
    const hasOptionsTpl = !!q.options_template;
    const hasStemVars = !!q.stem_variables;
    const schemaVariant = !hasStemVars ? 'C_NO_VARS' : (hasOptionsTpl ? 'B_TEMPLATE' : (hasOptionsArr ? 'A_ARRAY' : 'UNKNOWN'));

    // 1. Basic schema sanity
    if (!hasStemVars) violations.push('NO_STEM_VARIABLES');
    else if (cases.length < 1) violations.push('NO_CASES');
    if (!hasOptionsArr && !hasOptionsTpl) violations.push('NO_OPTIONS_NOR_TEMPLATE');

    // Schema A path
    if (schemaVariant === 'A_ARRAY') {
      const opts = q.options;
      const correctCount = opts.filter(o => o.is_correct === true).length;
      if (correctCount === 0) violations.push('A: NO_CORRECT_OPTION');
      if (correctCount > 1) violations.push(`A: MULTIPLE_CORRECT_OPTIONS (${correctCount})`);
      if (opts.length < 4) violations.push(`A: OPTIONS_TOO_FEW (${opts.length})`);

      // Each case must have answer + every option placeholder
      const optionsPH = unique(opts.flatMap(o => extractPlaceholders(o.text || '')));
      const stemPH = extractPlaceholders(q.stem || '');
      cases.forEach(([k, v]) => {
        if (!v || typeof v !== 'object') { violations.push(`A: ${k} NOT_OBJECT`); return; }
        // every placeholder used in stem must be in case (or non-case pool)
        stemPH.forEach(ph => {
          if (Object.prototype.hasOwnProperty.call(v, ph)) return;
          if (nonCaseKeys.some(([nk]) => nk === ph)) return;
          violations.push(`A: ${k} missing stem placeholder {${ph}}`);
        });
        // every placeholder used in options must be in case
        optionsPH.forEach(ph => {
          if (Object.prototype.hasOwnProperty.call(v, ph)) return;
          if (nonCaseKeys.some(([nk]) => nk === ph)) return;
          violations.push(`A: ${k} missing option placeholder {${ph}}`);
        });
      });

      // explanation.wrong keys should be placeholders for variant A
      if (q.explanation?.wrong) {
        Object.keys(q.explanation.wrong).forEach(wk => {
          const phs = extractPlaceholders(wk);
          if (phs.length === 0) {
            violations.push(`A: EXPL_WRONG_KEY_NOT_PLACEHOLDER: "${wk}"`);
          } else {
            phs.forEach(p => {
              if (!optionsPH.includes(p)) violations.push(`A: EXPL_WRONG_KEY_PH_NOT_IN_OPTIONS: {${p}}`);
            });
          }
        });
      }
    }

    // Schema B path: options_template
    if (schemaVariant === 'B_TEMPLATE') {
      const tplKeys = Object.keys(q.options_template);
      // Every case must have a corresponding template
      const caseKeys = cases.map(([k]) => k);
      caseKeys.forEach(ck => {
        if (!tplKeys.includes(ck)) violations.push(`B: TEMPLATE_MISSING_FOR_${ck}`);
      });
      tplKeys.forEach(tk => {
        if (!caseKeys.includes(tk)) violations.push(`B: TEMPLATE_HAS_EXTRA_${tk}`);
      });
      // Each template must have exactly 1 is_correct, length>=2
      tplKeys.forEach(tk => {
        const arr = q.options_template[tk];
        if (!Array.isArray(arr)) { violations.push(`B: TEMPLATE_${tk}_NOT_ARRAY`); return; }
        if (arr.length < 4) violations.push(`B: TEMPLATE_${tk}_OPTIONS_TOO_FEW (${arr.length})`);
        const correctCount = arr.filter(o => o.is_correct === true).length;
        if (correctCount === 0) violations.push(`B: TEMPLATE_${tk}_NO_CORRECT`);
        if (correctCount > 1) violations.push(`B: TEMPLATE_${tk}_MULTIPLE_CORRECT (${correctCount})`);
        // duplicate option texts
        const texts = arr.map(o => String(o.text));
        const dups = texts.filter((x, i) => texts.indexOf(x) !== i);
        if (dups.length > 0) violations.push(`B: TEMPLATE_${tk}_DUP_OPTIONS: ${unique(dups).join(', ')}`);
        // correct option's text should match case's answer
        const correctOpt = arr.find(o => o.is_correct === true);
        const caseObj = sv[tk];
        if (correctOpt && caseObj && Object.prototype.hasOwnProperty.call(caseObj, 'answer')) {
          if (String(correctOpt.text) !== String(caseObj.answer)) {
            violations.push(`B: TEMPLATE_${tk}_CORRECT_NOT_MATCH_ANSWER (option="${correctOpt.text}", case.answer="${caseObj.answer}")`);
          }
        } else if (correctOpt && caseObj && !Object.prototype.hasOwnProperty.call(caseObj, 'answer')) {
          violations.push(`B: CASE_${tk}_NO_ANSWER_KEY`);
        }
      });
      // CRITICAL FOR RENDER BUG: B schema is broken because index.html only renders q.options.
      // If q.options doesn't exist, the question won't have a usable options array at runtime.
      // (Verified by reading renderQuestion: it indexes rendered.options.map().)
      if (!hasOptionsArr) violations.push('B: NO_q.options_FIELD (renderQuestion cannot pick per-case template — runtime breakage)');
    }

    // Schema C path
    if (schemaVariant === 'C_NO_VARS') {
      // No stem_variables — must have options array, and explanation.wrong should be placeholder-keyed for consistency.
      if (!hasOptionsArr) violations.push('C: NO_OPTIONS');
    }

    // Common: explanation completeness
    if (!q.explanation) violations.push('NO_EXPLANATION');
    else {
      if (!q.explanation.correct) violations.push('NO_EXPLANATION_CORRECT');
      if (!q.explanation.wrong || Object.keys(q.explanation.wrong).length === 0) violations.push('NO_EXPLANATION_WRONG');
    }

    // Duplicated case values
    const seenSig = new Map();
    cases.forEach(([k, v]) => {
      const sig = JSON.stringify(v);
      if (seenSig.has(sig)) violations.push(`DUPLICATE_CASE: ${k} == ${seenSig.get(sig)}`);
      else seenSig.set(sig, k);
    });

    results.push({
      file: f, id: q.id, knowledge_code: q.knowledge_code,
      schemaVariant, hasOptionsArr, hasOptionsTpl, casesCount: cases.length,
      stem_excerpt: (q.stem || '').slice(0, 100),
      violations,
    });
  });
});

// 2026-05-16: 寫 report file(與其他 audit 一致),避免舊報告 stale 誤導
// 之前只 console.log → audit-calculation.report.json 從未被更新 → 顯示 ghost violations
const flagged = results.filter(r => r.violations && r.violations.length > 0);
const report = {
  generated_at: new Date().toISOString(),
  summary: {
    totalCalcQuestions: results.length,
    flagged: flagged.length,
    schemaCounts: results.reduce((acc, r) => {
      acc[r.schemaVariant] = (acc[r.schemaVariant] || 0) + 1;
      return acc;
    }, {})
  },
  violations: flagged,
  // 所有 calc 題的 summary(若需 spot-check,但保持較小體積:不含 violations 空的 detail)
  allCalcSummary: results.map(r => ({ id: r.id, file: r.file, schemaVariant: r.schemaVariant, casesCount: r.casesCount, violationCount: r.violations.length }))
};
fs.writeFileSync(require('path').join(__dirname, 'audit-calculation.report.json'), JSON.stringify(report, null, 2));

console.log('=== audit-calculation ===');
console.log(`totalCalcQuestions: ${results.length}, flagged: ${flagged.length}`);
console.log('schemaCounts:', JSON.stringify(report.summary.schemaCounts));
if (flagged.length > 0) {
  console.log('--- violations ---');
  flagged.forEach(r => {
    console.log(`  ${r.file} | ${r.id} | ${r.schemaVariant} | ${r.violations.join(' / ')}`);
  });
  process.exit(1);
}
console.log('PASS — all calculation questions have valid schema');
process.exit(0);
