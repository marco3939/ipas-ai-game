// Simulate renderQuestion for all calculation questions, ensure no placeholder leftovers in case_a render.
const fs = require('fs');
const path = require('path');

function applyVariables(text, vars) {
  // mimics the bank's approach: only handles array vars (variable pool); calc cases handled separately.
  let result = text;
  if (!vars) return result;
  for (const [k, v] of Object.entries(vars)) {
    if (Array.isArray(v) && v.length > 0) {
      result = result.replaceAll(`{${k}}`, v[0]);
    }
  }
  return result;
}

function pickCase(q, key='case_a') {
  if (q.format !== 'calculation' || !q.stem_variables) return null;
  return q.stem_variables[key] || null;
}

function renderQuestion(q, caseKey='case_a') {
  const rendered = JSON.parse(JSON.stringify(q));
  const c = pickCase(rendered, caseKey);
  if (c) {
    const subAll = (s) => {
      let r = s;
      for (const [k, v] of Object.entries(c)) r = r.replaceAll(`{${k}}`, v);
      return r;
    };
    rendered.stem = subAll(rendered.stem);
    if (Array.isArray(rendered.options)) {
      rendered.options = rendered.options.map(o => ({...o, text: subAll(o.text)}));
    }
    if (rendered.explanation) {
      if (rendered.explanation.correct) rendered.explanation.correct = subAll(rendered.explanation.correct);
      if (rendered.explanation.hook) rendered.explanation.hook = subAll(rendered.explanation.hook);
      if (rendered.explanation.wrong) {
        const newWrong = {};
        for (const [oldKey, oldVal] of Object.entries(rendered.explanation.wrong)) {
          newWrong[subAll(oldKey)] = subAll(oldVal);
        }
        rendered.explanation.wrong = newWrong;
      }
    }
  }
  rendered.stem = applyVariables(rendered.stem, rendered.stem_variables);
  return rendered;
}

function findPlaceholders(s) {
  if (typeof s !== 'string') return [];
  return s.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
}

const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter(f => f.startsWith('questions') && f.endsWith('.json'));
const issues = [];
const ok = [];

files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  (d.questions || []).forEach(q => {
    if (q.format !== 'calculation') return;
    const cases = Object.keys(q.stem_variables||{}).filter(k => k.startsWith('case_'));
    if (cases.length === 0) {
      // C_NO_VARS — skip render verification (no placeholders anyway)
      ok.push({id: q.id, file: f, schema: 'C_NO_VARS'});
      return;
    }
    cases.forEach(ck => {
      const r = renderQuestion(q, ck);
      const stemPH = findPlaceholders(r.stem);
      const optsPH = (r.options||[]).flatMap(o => findPlaceholders(o.text));
      const explPH = [
        ...findPlaceholders(r.explanation?.correct || ''),
        ...findPlaceholders(r.explanation?.hook || ''),
        ...(r.explanation?.wrong ? Object.entries(r.explanation.wrong).flatMap(([k,v]) => findPlaceholders(k).concat(findPlaceholders(v))) : []),
      ];
      const allPH = [...stemPH, ...optsPH, ...explPH];
      if (allPH.length > 0) {
        issues.push({id: q.id, file: f, case: ck, leftover: allPH, stem: r.stem.slice(0,80)});
      }
    });
    ok.push({id: q.id, file: f, schema: 'A_ARRAY', cases: cases.length});
  });
});

console.log(JSON.stringify({summary: {ok: ok.length, issues: issues.length}, issues, ok}, null, 2));
