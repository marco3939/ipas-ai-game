#!/usr/bin/env node
/**
 * security-scan-secrets.js
 * 掃 git history(`git log -p --all`)+ 工作目錄,搜尋常見 secret patterns。
 *
 * 用法:node scripts/security-scan-secrets.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── 高敏感 secret patterns ─────────────────────────────────
// 命名規則:精準到不易誤報為主,寬鬆 fallback 為輔
const PATTERNS = [
  { name: 'AWS Access Key',           re: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'CRITICAL' },
  { name: 'AWS Secret AK token',      re: /\bASIA[0-9A-Z]{16}\b/g, severity: 'CRITICAL' },
  { name: 'AWS aws_secret_access_key',re: /aws_secret_access_key\s*=\s*['"]?([A-Za-z0-9\/+=]{40})['"]?/gi, severity: 'CRITICAL' },
  { name: 'GCP API Key',              re: /\bAIza[0-9A-Za-z_\-]{35}\b/g, severity: 'CRITICAL' },
  { name: 'GitHub PAT (classic)',     re: /\bghp_[A-Za-z0-9]{36}\b/g, severity: 'CRITICAL' },
  { name: 'GitHub OAuth',             re: /\bgho_[A-Za-z0-9]{36}\b/g, severity: 'CRITICAL' },
  { name: 'GitHub server token',      re: /\bghs_[A-Za-z0-9]{36}\b/g, severity: 'CRITICAL' },
  { name: 'GitHub user token',        re: /\bghu_[A-Za-z0-9]{36}\b/g, severity: 'CRITICAL' },
  { name: 'GitHub refresh',           re: /\bghr_[A-Za-z0-9]{36}\b/g, severity: 'CRITICAL' },
  { name: 'Slack Bot Token',          re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, severity: 'CRITICAL' },
  { name: 'Stripe Live Secret Key',   re: /\bsk_live_[A-Za-z0-9]{24,}\b/g, severity: 'CRITICAL' },
  { name: 'Stripe Live Publishable',  re: /\bpk_live_[A-Za-z0-9]{24,}\b/g, severity: 'HIGH' },
  { name: 'Anthropic API Key',        re: /\bsk-ant-[A-Za-z0-9_\-]{20,}/g, severity: 'CRITICAL' },
  { name: 'OpenAI API Key',           re: /\bsk-[A-Za-z0-9]{32,}\b/g, severity: 'CRITICAL' },
  { name: 'PEM Private Key block',    re: /-----BEGIN (RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED |)PRIVATE KEY-----/g, severity: 'CRITICAL' },
  { name: 'JWT-like token',           re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: 'HIGH' },
  { name: 'Generic Bearer header',    re: /Authorization:\s*Bearer\s+[A-Za-z0-9._\-]{20,}/gi, severity: 'HIGH' },
  { name: 'Generic password assign',  re: /\b(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi, severity: 'MEDIUM' },
  { name: 'Generic token assign',     re: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi, severity: 'MEDIUM' },
];

// ── 允許列表(已知非機密的關鍵字)─────────────────────────
// 用於把 false positive 過濾掉(例如題庫文字內提到 "API key"、"password" 為一般說明)
const ALLOWED_CONTEXT = [
  'questions-',          // 題庫檔
  'questions.json',
  'design.md',           // 設計文件
  'plan.md',
  'progress.md',
  'README.md',
  'CHANGELOG.md',
  'security-audit.md',   // 本報告自身
  'security-scan-',      // 本掃描器自身
  'ipas-ai-game-prompt', // meta-prompt 文件
];

const isAllowedFile = (filePath) =>
  ALLOWED_CONTEXT.some(token => filePath.includes(token));

// ── git log -p --all 掃描 ─────────────────────────────────
function scanGitHistory() {
  console.log('[*] 掃 git log -p --all (整個 history) ...');
  let stdout;
  try {
    // -U0 = no context, --all = 所有 ref(branch + tag)
    stdout = execSync('git log -p --all -U0', {
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024 // 256 MB,夠了
    });
  } catch (e) {
    console.error('git log 失敗:', e.message);
    return [];
  }

  // 切成 commit chunks(以 "commit <40hex>" 為界)
  const commits = stdout.split(/^commit\s+([0-9a-f]{40})/m).slice(1);
  const findings = [];
  for (let i = 0; i < commits.length; i += 2) {
    const sha = commits[i];
    const body = commits[i + 1] || '';
    // 找出此 commit 動到的檔
    const fileMatches = [...body.matchAll(/^diff --git a\/([^\s]+) b\/[^\s]+/gm)];
    const files = fileMatches.map(m => m[1]);

    for (const { name, re, severity } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(body)) !== null) {
        const matched = m[0];
        // 找出在哪個 file
        const fileForLine = guessFileForOffset(body, m.index, fileMatches) || '(unknown)';
        if (isAllowedFile(fileForLine) && severity !== 'CRITICAL') continue; // CRITICAL 不放過
        // 整題不放過 PEM / AWS / GCP / GH 等
        findings.push({
          where: 'git-history',
          commit: sha.substring(0, 12),
          file: fileForLine,
          pattern: name,
          severity,
          match: matched.length > 80 ? matched.substring(0, 60) + '...' : matched,
          allFiles: files
        });
      }
    }
  }
  return findings;
}

function guessFileForOffset(body, offset, fileMatches) {
  let best = null;
  for (const fm of fileMatches) {
    if (fm.index <= offset) best = fm[1];
    else break;
  }
  return best;
}

// ── 工作目錄掃 ───────────────────────────────────────────
function listFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git') continue;
    if (ent.name === 'node_modules') continue;
    if (ent.name === '01指引' || ent.name === '02歷年考題' || ent.name === '03參考資料') continue; // gitignored 教材
    if (ent.name.endsWith('.deprecated.bak')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, out);
    else if (ent.isFile()) {
      if (ent.name.endsWith('.pdf') || ent.name.endsWith('.png') || ent.name.endsWith('.jpg') || ent.name.endsWith('.zip')) continue;
      out.push(full);
    }
  }
  return out;
}

function scanWorkingTree() {
  console.log('[*] 掃工作目錄(排除 gitignored / 二進位)...');
  const root = process.cwd();
  const files = listFiles(root);
  const findings = [];
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf-8'); } catch { continue; }
    if (content.length > 5 * 1024 * 1024) continue; // 跳過 >5 MB
    for (const { name, re, severity } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) {
        const matched = m[0];
        const rel = path.relative(root, f).replace(/\\/g, '/');
        if (isAllowedFile(rel) && severity !== 'CRITICAL') continue;
        findings.push({
          where: 'working-tree',
          file: rel,
          pattern: name,
          severity,
          match: matched.length > 80 ? matched.substring(0, 60) + '...' : matched,
          line: content.substring(0, m.index).split(/\n/).length
        });
      }
    }
  }
  return findings;
}

// ── .env / .secrets 等敏感檔是否被追蹤 ───────────────────
function scanTrackedSensitiveFiles() {
  console.log('[*] 檢查是否有敏感檔被 git 追蹤 ...');
  const findings = [];
  const sensitiveNames = [
    '.env', '.env.local', '.env.production', '.env.development',
    'config.json', 'secrets.json', 'credentials.json',
    'id_rsa', 'id_dsa', 'id_ed25519',
    '.aws/credentials', '.npmrc', '.pypirc',
  ];
  let stdout;
  try { stdout = execSync('git ls-files', { encoding: 'utf-8' }); }
  catch (e) { console.error('git ls-files 失敗:', e.message); return findings; }
  const tracked = stdout.split(/\r?\n/);
  for (const line of tracked) {
    const base = path.basename(line).toLowerCase();
    if (sensitiveNames.some(n => base === n || line.endsWith('/' + n))) {
      findings.push({ where: 'tracked-file', file: line, severity: 'HIGH', pattern: 'sensitive-filename' });
    }
    if (line.endsWith('.key') || line.endsWith('.pem')) {
      findings.push({ where: 'tracked-file', file: line, severity: 'CRITICAL', pattern: 'sensitive-extension' });
    }
  }
  // 還要看是否有 .claude/ 被推進去
  for (const line of tracked) {
    if (line.startsWith('.claude/')) {
      findings.push({ where: 'tracked-file', file: line, severity: 'HIGH', pattern: 'should-be-gitignored (.claude)' });
    }
  }
  return findings;
}

// ── main ─────────────────────────────────────────────────
function main() {
  const all = [
    ...scanGitHistory(),
    ...scanWorkingTree(),
    ...scanTrackedSensitiveFiles(),
  ];
  const summary = {
    total: all.length,
    bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    findings: all,
  };
  for (const f of all) {
    summary.bySeverity[f.severity] = (summary.bySeverity[f.severity] || 0) + 1;
  }
  const out = path.join(process.cwd(), 'scripts', 'security-scan-secrets.report.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n=== Secret Scan Summary ===`);
  console.log(`Total findings: ${summary.total}`);
  console.log(JSON.stringify(summary.bySeverity, null, 2));
  console.log(`Detailed report: ${out}`);
  if (summary.bySeverity.CRITICAL > 0 || summary.bySeverity.HIGH > 0) {
    console.log('\n⚠️ 高嚴重度發現,需逐項確認:');
    for (const f of all.filter(x => x.severity === 'CRITICAL' || x.severity === 'HIGH')) {
      console.log(`  [${f.severity}] ${f.pattern} @ ${f.file}${f.commit ? ' (commit ' + f.commit + ')' : ''}`);
      console.log(`    └ ${f.match}`);
    }
  } else {
    console.log('\n✅ 無 CRITICAL/HIGH secret 外洩');
  }
}

main();
