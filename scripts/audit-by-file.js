const fs = require('fs');
const path = require('path');
const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-option-length.report.json'), 'utf8'));
const byFile = {};
r.flagged.forEach(f => { byFile[f.file] = (byFile[f.file] || 0) + 1; });
console.log('=== 旗標數 by 檔 ===');
Object.entries(byFile).sort((a,b)=>b[1]-a[1]).forEach(([f,n]) => console.log(`  ${f}  ${n} 題`));

const ids = {};
r.flagged.forEach(f => { (ids[f.file] ||= []).push(f.id); });
console.log('\n=== 旗標 ID 列表 ===');
Object.entries(ids).forEach(([f, arr]) => console.log(`${f}: ${arr.join(', ')}`));
