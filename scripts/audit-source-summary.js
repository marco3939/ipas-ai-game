const fs = require('fs');
const path = require('path');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-source-fidelity.report.json'), 'utf8'));

// === A. 違反 by 檔
const byFile = {};
r.violations.forEach(v => { byFile[v.file] = (byFile[v.file] || 0) + 1; });
console.log('=== 違反數 by 檔 ===');
Object.entries(byFile).sort((a,b)=>b[1]-a[1]).forEach(([f,n]) => console.log(`  ${f}  ${n}`));

// === B. 不存在的 knowledge_code 統計
const missingCodes = {};
const missingNodes = {};
r.violations.forEach(v => {
  v.issues.forEach(i => {
    let m = i.match(/knowledge_code "([^"]+)"/);
    if (m) missingCodes[m[1]] = (missingCodes[m[1]] || 0) + 1;
    m = i.match(/node_id "([^"]+)"/);
    if (m) missingNodes[m[1]] = (missingNodes[m[1]] || 0) + 1;
  });
});

console.log('\n=== 不存在於 kb 的 knowledge_codes(被引用次數) ===');
Object.entries(missingCodes).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}  被 ${n} 處引用`));

console.log('\n=== 不存在於 kb 的 node_ids(top 20) ===');
Object.entries(missingNodes).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([id,n]) => console.log(`  ${id}  被 ${n} 處引用`));

console.log(`\n總計缺失 knowledge_codes:${Object.keys(missingCodes).length}`);
console.log(`總計缺失 node_ids:${Object.keys(missingNodes).length}`);
