// Surgically delete specific question objects from question JSON files
// using TEXT-LEVEL bracket-balanced extraction so formatting elsewhere
// is preserved exactly. Then validate by JSON.parse.

const fs = require('fs');
const path = require('path');

const tasks = [
  {
    file: 'src/questions-pa-code.json',
    deleteIds: ['q_pa_011', 'q_pa_012', 'q_pa_015'],
  },
  {
    file: 'src/questions-pe-advanced-s1.json',
    deleteIds: ['q_pe_001', 'q_pe_003', 'q_pe_004', 'q_pe_007', 'q_pe_008', 'q_pe_009', 'q_pe_010'],
  },
  {
    file: 'src/questions-pf-advanced-s3.json',
    deleteIds: ['q_pf_adv_s3_002', 'q_pf_adv_s3_006', 'q_pf_adv_s3_007', 'q_pf_adv_s3_008', 'q_pf_adv_s3_009', 'q_pf_adv_s3_012'],
  },
  {
    file: 'src/questions-pg-eval.json',
    deleteIds: ['q_pg_008', 'q_pg_009', 'q_pg_012', 'q_pg_013'],
  },
  {
    file: 'src/questions-ph-mlops.json',
    deleteIds: ['q_ph_002', 'q_ph_004', 'q_ph_005', 'q_ph_010', 'q_ph_011', 'q_ph_012', 'q_ph_013'],
  },
];

const root = 'C:/Users/marco/.ipas-ai-game';

// Find an object boundary in JSON text given a starting index of '{'.
// Respects strings and escapes so braces inside strings don't count.
// Returns { start, endExclusive } where endExclusive points to the
// character immediately after the closing '}'.
function findObjectBounds(text, openIdx) {
  if (text[openIdx] !== '{') {
    throw new Error('findObjectBounds expected `{` at ' + openIdx);
  }
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { start: openIdx, endExclusive: i + 1 };
    }
  }
  throw new Error('Unterminated object starting at ' + openIdx);
}

// Find the start of the question object containing a given "id" property.
// We look for the literal `"id": "<targetId>"` and then walk backwards
// to find the matching open brace `{` of the enclosing object.
function findObjectStartForId(text, id) {
  // Match either `"id":\s*"q_..."` (new) — be tolerant of whitespace
  const pattern = new RegExp('"id"\\s*:\\s*"' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
  const m = pattern.exec(text);
  if (!m) return null;
  const idIdx = m.index;
  // Walk backwards to find the unmatched `{` (ignoring strings).
  // Strategy: scan from start to idIdx, tracking open brace stack.
  let depth = 0;
  let inStr = false;
  let escape = false;
  let lastOpens = [];
  for (let i = 0; i < idIdx; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') {
      depth++;
      lastOpens.push(i);
    } else if (c === '}') {
      depth--;
      lastOpens.pop();
    }
  }
  // The most recently unclosed `{` is the enclosing object's open brace.
  if (lastOpens.length === 0) {
    throw new Error('Could not find enclosing { for id ' + id);
  }
  return lastOpens[lastOpens.length - 1];
}

// Remove an object at [start, endExclusive) from text, plus exactly one
// surrounding comma (preferring the leading comma so the array tail
// stays correct). Whitespace between the comma and the brace is also
// removed. Returns new text.
function removeObjectWithComma(text, start, endExclusive) {
  // Look backwards for a comma before `start`, skipping whitespace/newlines.
  let i = start - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i >= 0 && text[i] === ',') {
    // Remove leading comma + whitespace + the object itself.
    return text.slice(0, i) + text.slice(endExclusive);
  }
  // No leading comma (first element). Try trailing comma instead.
  let j = endExclusive;
  while (j < text.length && /\s/.test(text[j])) j++;
  if (j < text.length && text[j] === ',') {
    // Remove the object itself + whitespace + trailing comma.
    return text.slice(0, start) + text.slice(j + 1);
  }
  // Lone element in the array — just remove the object.
  return text.slice(0, start) + text.slice(endExclusive);
}

const report = [];

for (const t of tasks) {
  const fp = path.join(root, t.file);
  let text = fs.readFileSync(fp, 'utf8');
  // Pre-validate
  const beforeObj = JSON.parse(text);
  const beforeCount = beforeObj.questions.length;
  const beforeIds = new Set(beforeObj.questions.map((q) => q.id));
  const removed = [];
  const missing = [];
  for (const id of t.deleteIds) {
    if (!beforeIds.has(id)) {
      missing.push(id);
      continue;
    }
    const startIdx = findObjectStartForId(text, id);
    if (startIdx === null) {
      missing.push(id);
      continue;
    }
    const { endExclusive } = findObjectBounds(text, startIdx);
    text = removeObjectWithComma(text, startIdx, endExclusive);
    removed.push(id);
  }
  // Post-validate — must still parse
  const afterObj = JSON.parse(text);
  const afterCount = afterObj.questions.length;
  fs.writeFileSync(fp, text, 'utf8');
  report.push({
    file: t.file,
    before: beforeCount,
    after: afterCount,
    removed,
    missing,
    expectedDelta: t.deleteIds.length,
    actualDelta: beforeCount - afterCount,
  });
}

console.log(JSON.stringify(report, null, 2));
