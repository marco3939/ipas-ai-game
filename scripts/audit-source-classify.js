// 將鐵律 #5 違反分類:A=編碼不存在於 scope.json(完全違規) / B=編碼合法但 kb 子節點未建(kb 不完整)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const scope = JSON.parse(fs.readFileSync(path.join(ROOT, 'kb', 'scope.json'), 'utf8'));
const officialCodes = new Set(scope.knowledge_codes.map(c => c.code));
const includedCodes = new Set(scope.knowledge_codes.filter(c => c.include).map(c => c.code));
const excludedCodes = new Set(scope.knowledge_codes.filter(c => !c.include).map(c => c.code));

const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-source-fidelity.report.json'), 'utf8'));

const A = []; // 完全違規(編碼不存在於 scope)
const B = []; // 編碼合法但 kb 子節點未建
const C = []; // 編碼為 exclude(L22202/L22203 等)

r.violations.forEach(v => {
  // 取此題引用的 codes
  const codes = new Set();
  v.issues.forEach(i => {
    let m = i.match(/knowledge_code "([^"]+)"/);
    if (m) codes.add(m[1]);
    m = i.match(/node_id "(n_(L\d+)_\d+)"/);
    if (m) codes.add(m[2]); // 從 node_id 推出 code
  });

  let category = 'B'; // 預設:kb 不完整
  for (const c of codes) {
    if (!officialCodes.has(c)) { category = 'A'; break; }
    if (excludedCodes.has(c)) category = 'C';
  }

  if (category === 'A') A.push({ ...v, codes: [...codes] });
  else if (category === 'C') C.push({ ...v, codes: [...codes] });
  else B.push({ ...v, codes: [...codes] });
});

const report = {
  summary: {
    total_violations: r.violations.length,
    A_illegitimate_codes: A.length,
    B_kb_incomplete: B.length,
    C_excluded_codes: C.length,
  },
  A_must_fix: A,
  B_kb_to_add: B,
  C_excluded_in_scope: C,
};
fs.writeFileSync(path.join(__dirname, 'audit-source-classify.report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('=== Iron Rule #5 Classification ===');
console.log(`A. illegitimate codes (must fix or delete questions): ${A.length}`);
console.log(`B. kb incomplete (needs kb expansion): ${B.length}`);
console.log(`C. excluded codes (e.g. L22202): ${C.length}`);

console.log('\n--- A. Illegitimate codes ---');
const aCodes = {};
A.forEach(v => v.codes.forEach(c => aCodes[c] = (aCodes[c]||0)+1));
Object.entries(aCodes).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}: ${n} questions`));
A.forEach(v => console.log(`  [${v.file}] ${v.id}  codes=[${v.codes.join(',')}]`));

console.log('\n--- B. KB incomplete (codes legit but no node built) ---');
const bCodes = {};
B.forEach(v => v.codes.forEach(c => bCodes[c] = (bCodes[c]||0)+1));
Object.entries(bCodes).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}: ${n} questions`));

console.log('\n--- C. Excluded codes ---');
C.forEach(v => console.log(`  [${v.file}] ${v.id}  codes=[${v.codes.join(',')}]`));
