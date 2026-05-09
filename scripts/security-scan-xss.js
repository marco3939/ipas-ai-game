#!/usr/bin/env node
/**
 * security-scan-xss.js
 * 掃 src/ 下 .js / .html,找:
 * - innerHTML = 後接 ${...}(template literal 注入,需確認來源是否可信)
 * - inline onclick="...${...}..."(HTML 屬性 → JS 字串雙重解碼風險)
 * - eval / new Function / document.write / setTimeout(string,...) / setInterval(string,...)
 * - location.hash / location.search / URLSearchParams 直接寫入 DOM
 *
 * 用法:node scripts/security-scan-xss.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');

const RULES = [
  // 危險 sink
  { id: 'eval-call',         severity: 'CRITICAL', re: /\beval\s*\(/g,           desc: 'eval() 會執行任意字串為 JS' },
  { id: 'new-function',      severity: 'CRITICAL', re: /new\s+Function\s*\(/g,   desc: 'new Function() 會執行任意字串為 JS' },
  { id: 'document-write',    severity: 'CRITICAL', re: /document\.write\s*\(/g,  desc: 'document.write() 寫入未轉義的 HTML' },
  { id: 'settimeout-string', severity: 'CRITICAL', re: /setTimeout\s*\(\s*['"`]/g, desc: 'setTimeout 帶字串 = 隱式 eval' },
  { id: 'setinterval-string',severity: 'CRITICAL', re: /setInterval\s*\(\s*['"`]/g,desc: 'setInterval 帶字串 = 隱式 eval' },

  // URL 反射:直接讀 URL 寫入 DOM
  { id: 'location-hash',     severity: 'HIGH',     re: /location\.hash/g,         desc: 'location.hash 必定是攻擊者可控,寫 DOM 前必須 escape' },
  { id: 'location-search',   severity: 'HIGH',     re: /location\.search/g,       desc: 'location.search 必定是攻擊者可控,寫 DOM 前必須 escape' },
  { id: 'urlsearchparams',   severity: 'MEDIUM',   re: /URLSearchParams/g,        desc: 'URLSearchParams 來源是 URL,寫 DOM 前必須 escape' },
  { id: 'window-name',       severity: 'HIGH',     re: /window\.name(?!\s*=)/g,   desc: 'window.name 是跨網域攻擊向量' },

  // template literal 注入到 onclick
  { id: 'onclick-tmpl',      severity: 'HIGH',     re: /onclick=["'][^"']*\$\{[^}]+\}/g, desc: 'inline onclick 內含 ${...},需確認變數來源可信' },

  // innerHTML = `...${...}...`(動態 HTML 拼裝)
  { id: 'innerhtml-tmpl',    severity: 'INFO',     re: /\.innerHTML\s*=\s*[^;]+\$\{/g, desc: 'innerHTML 帶 ${...} 模板字串,需確認變數已 escape' },
];

function listSourceFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listSourceFiles(full, out);
    else if (ent.isFile() && /\.(js|html)$/i.test(ent.name)) out.push(full);
  }
  return out;
}

function lineOf(content, idx) {
  return content.substring(0, idx).split(/\n/).length;
}

function snippet(content, idx, len = 200) {
  return content.substring(idx, idx + len).replace(/\s+/g, ' ').substring(0, 160);
}

function main() {
  const files = listSourceFiles(ROOT);
  console.log(`[*] 掃 ${files.length} 個原始檔(.js / .html)`);

  const findings = [];
  for (const f of files) {
    const rel = path.relative(path.resolve(__dirname, '..'), f).replace(/\\/g, '/');
    const content = fs.readFileSync(f, 'utf-8');
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(content)) !== null) {
        findings.push({
          file: rel,
          line: lineOf(content, m.index),
          rule: rule.id,
          severity: rule.severity,
          match: m[0],
          context: snippet(content, m.index, 200),
          desc: rule.desc,
        });
      }
    }
  }

  // 每個 inline onclick 的變數,標出來源(讓人工 review 容易)
  const byRule = {};
  for (const f of findings) {
    byRule[f.rule] = byRule[f.rule] || [];
    byRule[f.rule].push(f);
  }

  const summary = {
    totalFiles: files.length,
    totalFindings: findings.length,
    bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, INFO: 0 },
    byRule: Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, v.length])),
    findings,
  };
  for (const f of findings) summary.bySeverity[f.severity]++;

  const out = path.join(__dirname, 'security-scan-xss.report.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), 'utf-8');

  console.log('\n=== XSS Scan Summary ===');
  console.log(`Total findings: ${summary.totalFindings}`);
  console.log('By severity:', summary.bySeverity);
  console.log('By rule:', summary.byRule);
  console.log(`Detailed report: ${out}`);

  if (summary.bySeverity.CRITICAL > 0 || summary.bySeverity.HIGH > 0) {
    console.log('\n⚠️ 高嚴重度發現,需逐項評估:');
    for (const f of findings.filter(x => x.severity === 'CRITICAL' || x.severity === 'HIGH').slice(0, 50)) {
      console.log(`  [${f.severity}] ${f.rule} ${f.file}:${f.line}`);
      console.log(`    └ ${f.context}`);
    }
  } else {
    console.log('\n✅ 無 CRITICAL/HIGH 危險 sink');
  }
}

main();
