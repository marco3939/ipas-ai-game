// 列出 B 類違反 by 檔
const fs = require('fs');
const path = require('path');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-source-classify.report.json'), 'utf8'));

const byFile = {};
r.B_kb_to_add.forEach(v => {
  byFile[v.file] = byFile[v.file] || [];
  byFile[v.file].push({ id: v.id, codes: v.codes });
});

console.log('=== B class (55 cases) by file ===');
Object.entries(byFile).forEach(([f, list]) => {
  console.log(`\n${f} (${list.length}):`);
  list.forEach(it => console.log(`  ${it.id}  codes=[${it.codes.join(',')}]`));
});
