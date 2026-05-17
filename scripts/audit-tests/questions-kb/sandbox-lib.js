// Sandbox helper: re-implements the core audit logic against an injected question array
// so we can probe how audits behave when fed malicious payloads — without touching
// real audit scripts or real question files.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const KB_DIR = path.join(ROOT, 'kb');
const WL_FILE = path.join(ROOT, 'scripts', 'kb-allowed-nodes.json');
const SRC_DIR = path.join(ROOT, 'src');

function loadWhitelist() {
  const wl = JSON.parse(fs.readFileSync(WL_FILE, 'utf8'));
  const nodeIds = new Set();
  const codes = new Set();
  for (const c of Object.keys(wl)) {
    codes.add(c);
    for (const n of wl[c]) nodeIds.add(n.id);
  }
  return { nodeIds, codes };
}

// Replicate audit-source-fidelity logic on supplied questions
function auditSourceFidelity(questions) {
  const { nodeIds, codes } = loadWhitelist();
  const violations = [];
  for (const q of questions) {
    const issues = [];
    if (q.node_id && !nodeIds.has(q.node_id)) issues.push(`node_id "${q.node_id}" not in whitelist`);
    if (q.knowledge_code && !codes.has(q.knowledge_code)) issues.push(`knowledge_code "${q.knowledge_code}" not in whitelist`);
    if (Array.isArray(q.related_node_ids)) {
      for (const r of q.related_node_ids) {
        if (!nodeIds.has(r)) issues.push(`related_node_ids "${r}" not in whitelist`);
      }
    }
    if (!q.node_id && !q.knowledge_code) issues.push('missing both node_id and knowledge_code');
    if (issues.length) violations.push({ id: q.id, issues });
  }
  return violations;
}

// Replicate audit-option-length single-question check (鐵律 #4)
function auditOptionLength(q) {
  if (q.format !== 'single_choice') return { flagged: false, reason: 'not single_choice', correctCount: 0, multipleCorrect: false };
  if (!Array.isArray(q.options) || q.options.length < 2) return { flagged: false, reason: 'too few options', correctCount: 0, multipleCorrect: false };
  const correctCount = q.options.filter(o => o.is_correct === true).length;
  const corr = q.options.find(o => o.is_correct);
  if (!corr) return { flagged: true, reason: 'no correct option', correctCount, multipleCorrect: correctCount !== 1 };
  const wrongLens = q.options.filter(o => !o.is_correct).map(o => (o.text || '').length);
  if (!wrongLens.length) return { flagged: true, reason: 'no wrong option', correctCount, multipleCorrect: correctCount !== 1 };
  const wrongAvg = wrongLens.reduce((a, b) => a + b, 0) / wrongLens.length;
  const corrLen = (corr.text || '').length;
  const ratio = wrongAvg ? corrLen / wrongAvg : 0;
  return {
    flagged: ratio > 1.3 && corrLen >= 15,
    ratio: +ratio.toFixed(2),
    correctCount,
    multipleCorrect: correctCount !== 1,
  };
}

// Detect <script> or other dangerous payload in stem / options / explanation
function detectXssPayload(q) {
  const findings = [];
  const inspect = (text, where) => {
    if (typeof text !== 'string') return;
    const dangerous = /<script\b|<\/script>|javascript:|on\w+\s*=|<iframe\b|<embed\b|<object\b/i;
    if (dangerous.test(text)) findings.push({ where, text: text.slice(0, 100) });
  };
  inspect(q.stem, 'stem');
  inspect(q.stem_template, 'stem_template');
  if (Array.isArray(q.options)) q.options.forEach((o, i) => inspect(o.text, `options[${i}]`));
  if (q.explanation) {
    if (typeof q.explanation === 'object') {
      for (const k of Object.keys(q.explanation)) {
        if (typeof q.explanation[k] === 'string') inspect(q.explanation[k], `explanation.${k}`);
      }
    } else {
      inspect(q.explanation, 'explanation');
    }
  }
  return findings;
}

// Mimics renderQuestion (subAll) applyVariables logic — does it expand __proto__?
function applyVariables(text, vars) {
  if (typeof text !== 'string' || !vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

// Detect duplicate qids inside a list
function detectDuplicateQids(questions) {
  const seen = new Set();
  const dupes = [];
  for (const q of questions) {
    if (!q.id) continue;
    if (seen.has(q.id)) dupes.push(q.id);
    seen.add(q.id);
  }
  return dupes;
}

module.exports = {
  loadWhitelist,
  auditSourceFidelity,
  auditOptionLength,
  detectXssPayload,
  applyVariables,
  detectDuplicateQids,
  KB_DIR, SRC_DIR, ROOT,
};
