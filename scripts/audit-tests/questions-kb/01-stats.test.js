#!/usr/bin/env node
// Agent G - 01: 題庫健康度統計 (鐵律 #1/#4/#5/#6)
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', '..', '..', 'src');
const KB_DIR = path.join(__dirname, '..', '..', '..', 'kb');
const WL_FILE = path.join(__dirname, '..', '..', '..', 'scripts', 'kb-allowed-nodes.json');

const files = fs.readdirSync(SRC_DIR).filter(f => f.startsWith('questions') && f.endsWith('.json'));
const whitelist = JSON.parse(fs.readFileSync(WL_FILE, 'utf8'));
const scope = JSON.parse(fs.readFileSync(path.join(KB_DIR, 'scope.json'), 'utf8'));

// build node->code map from whitelist
const nodeIdSet = new Set();
const codeNodeMap = {};
for (const code of Object.keys(whitelist)) {
  codeNodeMap[code] = new Set();
  for (const n of whitelist[code]) {
    nodeIdSet.add(n.id);
    codeNodeMap[code].add(n.id);
  }
}
const allowedCodes = new Set(Object.keys(whitelist));

const stats = {
  totalFiles: files.length,
  totalQuestions: 0,
  byFile: {},
  byCode: {},
  byFormat: {},
  byDifficulty: {},
  bySubject: {},
  bySourceLevel: {},
  optionCountDist: {},
  missingFields: [],
  duplicateQids: [],
  longestEqCorrectViolations: { count: 0, total: 0, ratio: 0 },
  nodeIdOutsideWhitelist: [],
  codeOutsideWhitelist: [],
  scopeIncludeFalseUsage: [],
  subjectIsolation: { L21: new Set(), L22: new Set(), L23: new Set() },
  caseQuestions: 0,
  shuffleEnabled: 0,
  shuffleDisabled: 0,
  hasExplanation: 0,
  missingExplanation: [],
};

const seenQids = new Set();
const allQs = [];

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
  const qs = Array.isArray(data) ? data : (data.questions || []);
  stats.byFile[f] = qs.length;
  stats.totalQuestions += qs.length;
  for (const q of qs) {
    allQs.push({ q, file: f });
    // missing required fields
    const required = ['id', 'knowledge_code', 'node_id', 'subject', 'format', 'stem', 'options', 'explanation'];
    for (const k of required) {
      if (q[k] === undefined || q[k] === null) {
        stats.missingFields.push({ file: f, id: q.id || '(no-id)', missing: k });
      }
    }
    // dupe id
    if (q.id) {
      if (seenQids.has(q.id)) stats.duplicateQids.push({ id: q.id, file: f });
      seenQids.add(q.id);
    }
    // distributions
    const code = q.knowledge_code || '?';
    stats.byCode[code] = (stats.byCode[code] || 0) + 1;
    stats.byFormat[q.format || '?'] = (stats.byFormat[q.format || '?'] || 0) + 1;
    stats.byDifficulty[q.difficulty || '?'] = (stats.byDifficulty[q.difficulty || '?'] || 0) + 1;
    stats.bySubject[q.subject || '?'] = (stats.bySubject[q.subject || '?'] || 0) + 1;
    stats.bySourceLevel[q.source_level || '?'] = (stats.bySourceLevel[q.source_level || '?'] || 0) + 1;
    const oc = Array.isArray(q.options) ? q.options.length : 0;
    stats.optionCountDist[oc] = (stats.optionCountDist[oc] || 0) + 1;
    // shuffle
    if (q.shuffle_options === true) stats.shuffleEnabled++;
    else if (q.shuffle_options === false) stats.shuffleDisabled++;
    // explanation
    if (q.explanation && (typeof q.explanation === 'object' ? Object.keys(q.explanation).length > 0 : String(q.explanation).length > 0)) {
      stats.hasExplanation++;
    } else {
      stats.missingExplanation.push({ id: q.id, file: f });
    }
    // case bearing
    if (q.cases && Array.isArray(q.cases) && q.cases.length > 1) stats.caseQuestions++;
    // whitelist check
    if (q.knowledge_code && !allowedCodes.has(q.knowledge_code)) {
      stats.codeOutsideWhitelist.push({ id: q.id, file: f, code: q.knowledge_code });
    }
    if (q.node_id && !nodeIdSet.has(q.node_id)) {
      stats.nodeIdOutsideWhitelist.push({ id: q.id, file: f, node_id: q.node_id, code: q.knowledge_code });
    }
    // subject isolation: L21 / L22 / L23
    if (q.knowledge_code) {
      const prefix = q.knowledge_code.slice(0, 3);
      if (stats.subjectIsolation[prefix]) {
        stats.subjectIsolation[prefix].add(f);
      }
    }
  }
}

// 鐵律 #4: 最長 = 正解 比例(only single_choice with options)
let scTotal = 0;
let longestEqCorrect = 0;
for (const { q } of allQs) {
  if (q.format !== 'single_choice') continue;
  if (!Array.isArray(q.options) || q.options.length < 2) continue;
  const corr = q.options.find(o => o.is_correct);
  if (!corr) continue;
  scTotal++;
  const maxLen = Math.max(...q.options.map(o => (o.text || '').length));
  if ((corr.text || '').length === maxLen) longestEqCorrect++;
}
stats.longestEqCorrectViolations = {
  count: longestEqCorrect,
  total: scTotal,
  ratio: scTotal ? +(longestEqCorrect / scTotal * 100).toFixed(2) : 0,
  threshold: 35,
  exceedsThreshold: scTotal ? (longestEqCorrect / scTotal > 0.35) : false,
};

// scope.include = false 但被引用
const includeFalse = new Set(scope.knowledge_codes.filter(c => !c.include).map(c => c.code));
for (const { q, file } of allQs) {
  if (q.knowledge_code && includeFalse.has(q.knowledge_code)) {
    stats.scopeIncludeFalseUsage.push({ id: q.id, file, code: q.knowledge_code });
  }
}

// convert sets
stats.subjectIsolation = {
  L21_files: [...stats.subjectIsolation.L21].sort(),
  L22_files: [...stats.subjectIsolation.L22].sort(),
  L23_files: [...stats.subjectIsolation.L23].sort(),
};

// detect cross-subject pollution: files containing > 1 subject prefix
const fileToPrefixes = {};
for (const { q, file } of allQs) {
  if (!q.knowledge_code) continue;
  const p = q.knowledge_code.slice(0, 3);
  fileToPrefixes[file] = fileToPrefixes[file] || new Set();
  fileToPrefixes[file].add(p);
}
stats.crossSubjectFiles = Object.entries(fileToPrefixes)
  .filter(([, s]) => s.size > 1)
  .map(([f, s]) => ({ file: f, prefixes: [...s] }));

// summary
console.log('=== Agent G 01: 題庫健康度統計 ===');
console.log('Total files:', stats.totalFiles, ' Total questions:', stats.totalQuestions);
console.log('By knowledge_code count:', Object.keys(stats.byCode).length, 'codes');
console.log('Format dist:', JSON.stringify(stats.byFormat));
console.log('Difficulty dist:', JSON.stringify(stats.byDifficulty));
console.log('Subject dist:', JSON.stringify(stats.bySubject));
console.log('Source_level dist:', JSON.stringify(stats.bySourceLevel));
console.log('Option count dist:', JSON.stringify(stats.optionCountDist));
console.log('Missing fields:', stats.missingFields.length);
console.log('Duplicate qids:', stats.duplicateQids.length);
console.log('Shuffle enabled:', stats.shuffleEnabled, ' disabled:', stats.shuffleDisabled);
console.log('Has explanation:', stats.hasExplanation, ' missing:', stats.missingExplanation.length);
console.log('Case-bearing questions:', stats.caseQuestions);
console.log('鐵律 #4 longest=correct:', stats.longestEqCorrectViolations.count, '/', stats.longestEqCorrectViolations.total, '=', stats.longestEqCorrectViolations.ratio + '%');
console.log('  Exceeds 35% threshold:', stats.longestEqCorrectViolations.exceedsThreshold);
console.log('鐵律 #5 code-outside-whitelist:', stats.codeOutsideWhitelist.length);
console.log('鐵律 #5 node_id-outside-whitelist:', stats.nodeIdOutsideWhitelist.length);
console.log('鐵律 #5 scope-include=false referenced:', stats.scopeIncludeFalseUsage.length);
console.log('鐵律 #6 cross-subject files:', stats.crossSubjectFiles.length);
if (stats.crossSubjectFiles.length) {
  console.log('  Cross-subject files:', JSON.stringify(stats.crossSubjectFiles, null, 2));
}
console.log('L21 files:', stats.subjectIsolation.L21_files.length);
console.log('L22 files:', stats.subjectIsolation.L22_files.length);
console.log('L23 files:', stats.subjectIsolation.L23_files.length);

const REPORT = path.join(__dirname, '01-stats.report.json');
fs.writeFileSync(REPORT, JSON.stringify(stats, null, 2));
console.log('-> report:', REPORT);

// gate: critical failures
const critical = [
  stats.missingFields.length > 0,
  stats.duplicateQids.length > 0,
  stats.codeOutsideWhitelist.length > 0,
  stats.nodeIdOutsideWhitelist.length > 0,
  stats.scopeIncludeFalseUsage.length > 0,
];
const hasCritical = critical.some(Boolean);
if (hasCritical) {
  console.log('FAIL — critical violations detected');
  process.exit(1);
}
console.log('PASS — no critical violations (鐵律 #4 比例屬「告警/觀察」非阻擋)');
