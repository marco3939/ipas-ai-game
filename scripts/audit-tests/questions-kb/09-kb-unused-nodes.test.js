#!/usr/bin/env node
// Agent G - 09: KB 一致性 — 白名單裡的節點有沒有被題庫覆蓋?
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const wl = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'kb-allowed-nodes.json'), 'utf8'));

const allWlNodes = new Set();
for (const c of Object.keys(wl)) for (const n of wl[c]) allWlNodes.add(n.id);

const usedNodes = new Set();
const usedRelated = new Set();
const files = fs.readdirSync(SRC).filter(f => f.startsWith('questions') && f.endsWith('.json'));
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const qs = Array.isArray(data) ? data : (data.questions || []);
  for (const q of qs) {
    if (q.node_id) usedNodes.add(q.node_id);
    if (Array.isArray(q.related_node_ids)) for (const r of q.related_node_ids) usedRelated.add(r);
  }
}

const unusedPrimary = [...allWlNodes].filter(n => !usedNodes.has(n)).sort();
const unusedAny = [...allWlNodes].filter(n => !usedNodes.has(n) && !usedRelated.has(n)).sort();

console.log('=== 09: KB 未使用節點(白名單覆蓋率)===');
console.log('Whitelist nodes total:', allWlNodes.size);
console.log('Used as primary node_id:', usedNodes.size, '/', allWlNodes.size);
console.log('Used anywhere (primary or related):', allWlNodes.size - unusedAny.length, '/', allWlNodes.size);
console.log('Unused as PRIMARY (info):', unusedPrimary.length);
console.log('Unused ANYWHERE (waste):', unusedAny.length);
if (unusedAny.length) console.log('  sample unused:', unusedAny.slice(0, 15));

const report = {
  totalWhitelistNodes: allWlNodes.size,
  usedAsPrimary: usedNodes.size,
  unusedPrimaryCount: unusedPrimary.length,
  unusedAnywhereCount: unusedAny.length,
  unusedPrimary,
  unusedAnywhere: unusedAny,
};
fs.writeFileSync(path.join(__dirname, '09-kb-unused-nodes.report.json'), JSON.stringify(report, null, 2));
// 這是 info-level audit:有未使用節點屬規劃缺口,不阻擋
console.log('PASS (info-level) — 未使用節點為規劃資訊,非錯誤');
