#!/usr/bin/env node
// Agent G - 08: KB 一致性 — scope.json codes vs kb-allowed-nodes.json whitelist 對齊
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const scope = JSON.parse(fs.readFileSync(path.join(ROOT, 'kb', 'scope.json'), 'utf8'));
const wl = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'kb-allowed-nodes.json'), 'utf8'));

const scopeIncludedCodes = new Set(scope.knowledge_codes.filter(c => c.include).map(c => c.code));
const scopeExcludedCodes = new Set(scope.knowledge_codes.filter(c => !c.include).map(c => c.code));
const wlCodes = new Set(Object.keys(wl));

const inScopeNotInWl = [...scopeIncludedCodes].filter(c => !wlCodes.has(c));
const inWlNotInScope = [...wlCodes].filter(c => !scopeIncludedCodes.has(c));
const excludedButInWl = [...wlCodes].filter(c => scopeExcludedCodes.has(c));

console.log('=== 08: KB scope vs whitelist 對齊 ===');
console.log('scope included codes:', scopeIncludedCodes.size);
console.log('scope excluded codes:', scopeExcludedCodes.size);
console.log('whitelist codes:', wlCodes.size);
console.log('In scope-included but NOT in whitelist:', inScopeNotInWl);
console.log('In whitelist but NOT in scope-included:', inWlNotInScope);
console.log('Excluded by scope but present in whitelist:', excludedButInWl);

const fail = inWlNotInScope.length > 0 || excludedButInWl.length > 0;
const report = {
  scopeIncluded: [...scopeIncludedCodes],
  scopeExcluded: [...scopeExcludedCodes],
  whitelistCodes: [...wlCodes],
  inScopeNotInWl,
  inWlNotInScope,
  excludedButInWl,
};
fs.writeFileSync(path.join(__dirname, '08-kb-scope-vs-whitelist.report.json'), JSON.stringify(report, null, 2));
if (fail) {
  console.log('FAIL — whitelist contains codes outside scope.json include=true');
  process.exit(1);
}
console.log('PASS — whitelist ⊆ scope.included; no excluded codes leaked into whitelist');
console.log('NOTE: inScopeNotInWl = scope 已收錄但尚無題庫節點(屬資料規劃,非錯誤)');
