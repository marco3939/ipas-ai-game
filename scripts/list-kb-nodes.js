// 列出 kb 所有真實 node_id,by knowledge_code 分組,作為 P2 sub agent 唯一可用清單
const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '..', 'kb');
const KB_FILES = ['nodes-subject-1.json', 'nodes-subject-1-extended.json', 'nodes-subject-3.json', 'nodes-subject-3-extended.json'];

const byCode = {};
let total = 0;
for (const f of KB_FILES) {
  const fp = path.join(KB_DIR, f);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = data.nodes || data;
  if (!Array.isArray(list)) continue;
  list.forEach(n => {
    if (!n.knowledge_code || !n.node_id) return;
    byCode[n.knowledge_code] = byCode[n.knowledge_code] || [];
    byCode[n.knowledge_code].push({ id: n.node_id, title: n.title });
    total++;
  });
}

console.log(`Total: ${total} kb nodes`);
console.log('');
Object.keys(byCode).sort().forEach(code => {
  console.log(`### ${code} (${byCode[code].length} nodes)`);
  byCode[code].forEach(n => console.log(`  - ${n.id}  ${n.title}`));
  console.log('');
});

// Save as JSON for sub agent to read
fs.writeFileSync(
  path.join(__dirname, 'kb-allowed-nodes.json'),
  JSON.stringify(byCode, null, 2),
  'utf8'
);
console.log(`\n→ saved to scripts/kb-allowed-nodes.json (${total} nodes, ${Object.keys(byCode).length} codes)`);
