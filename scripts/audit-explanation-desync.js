// audit-explanation-desync.js — explanation.wrong key ↔ option.text 同步驗證
//
// 動機:CLAUDE.md 案例 13(2026-05-30)
//   `explanation.wrong` 字典用「整段 option text」當 key,option text 一改 key 就失效。
//   PR #53 + #55 + #56 + #59 已把 285 個歷史 desync 全清。本 audit 鎖死 0 = 0,
//   未來任何 PR 改 option text 沒同步 key 都會被擋下。
//
// 三類分類(對齊案例 13 修補腳本 + #59 fill 邏輯):
//   case1 — equal: orphan_keys.length === orphan_options.length(可配對 / 已修補類)
//   case2 — missing: option 多於 key(「漏寫 explanation」結構問題,需新內容)
//   case3 — stale:  key 多於 option(舊 key 殘留,該刪)
//
// PASS criterion: 全題庫 desync = 0(0 個 option 缺對應 key)
//
// CLI:
//   node scripts/audit-explanation-desync.js          # 退出碼 0=PASS / 1=FAIL
//   node scripts/audit-explanation-desync.js --json   # 機器可讀(用於 CI annotation)
//
// 共用層使用方:
//   Issue #58 schema 重構落地後,本 audit 改驗 [{key, exp}] 陣列形態
//   (改一處,reader 與 audit 一起遷移)

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MANIFEST = path.join(SRC, 'questions-manifest.json');

function scan() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const violations = []; // { file, qid, type, missing, stale }
  let totalQ = 0;
  let totalChecked = 0;
  let totalWrongOpts = 0;

  for (const f of manifest.files) {
    const filePath = path.join(SRC, f);
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const qs = Array.isArray(data) ? data : (data.questions || []);
    totalQ += qs.length;

    for (const q of qs) {
      if (!q.options || !q.explanation || !q.explanation.wrong) continue;
      totalChecked++;
      const wrongKeys = Object.keys(q.explanation.wrong);
      const wrongOpts = q.options.filter(o => !o.is_correct);
      totalWrongOpts += wrongOpts.length;

      const missing = wrongOpts.filter(o => !wrongKeys.includes(o.text));
      const stale = wrongKeys.filter(k => !wrongOpts.find(o => o.text === k));

      if (missing.length === 0 && stale.length === 0) continue;

      let type;
      if (missing.length === stale.length && missing.length > 0) type = 'case1_equal';
      else if (missing.length > stale.length) type = 'case2_missing_exp';
      else type = 'case3_stale_key';

      violations.push({
        file: f,
        qid: q.id,
        type,
        missingCount: missing.length,
        staleCount: stale.length,
        missingOpts: missing.map(o => (o.text || '').slice(0, 60)),
        staleKeys: stale.map(k => k.slice(0, 60)),
      });
    }
  }

  return { violations, totalQ, totalChecked, totalWrongOpts };
}

function main() {
  const jsonMode = process.argv.includes('--json');
  const { violations, totalQ, totalChecked, totalWrongOpts } = scan();

  const totalDesync = violations.reduce((s, v) => s + v.missingCount, 0);

  const report = {
    timestamp: new Date().toISOString(),
    totalQ,
    totalChecked,
    totalWrongOpts,
    totalDesync,
    violations,
    summary: {
      case1_equal: violations.filter(v => v.type === 'case1_equal').length,
      case2_missing_exp: violations.filter(v => v.type === 'case2_missing_exp').length,
      case3_stale_key: violations.filter(v => v.type === 'case3_stale_key').length,
    },
  };

  fs.writeFileSync(
    path.join(ROOT, 'scripts', 'audit-explanation-desync.report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );

  if (jsonMode) {
    console.log(JSON.stringify(report));
    process.exit(totalDesync === 0 ? 0 : 1);
  }

  console.log(`=== explanation.wrong key desync audit(CLAUDE.md 案例 13)===`);
  console.log(`total questions:           ${totalQ}`);
  console.log(`questions with explanation: ${totalChecked}`);
  console.log(`total wrong options:       ${totalWrongOpts}`);
  console.log(`desync count:              ${totalDesync}`);
  console.log(`  - case1 (可配對 — 改 text 漏同步 key):  ${report.summary.case1_equal}`);
  console.log(`  - case2 (漏寫 explanation):             ${report.summary.case2_missing_exp}`);
  console.log(`  - case3 (stale key 殘留):              ${report.summary.case3_stale_key}`);
  console.log('');

  if (totalDesync === 0) {
    console.log('✅ PASS — 全題庫 explanation.wrong key 全對齊 option.text');
  } else {
    console.log(`❌ FAIL — ${totalDesync} 個 option 缺對應 explanation.wrong key`);
    console.log('');
    console.log('Top 5 violations:');
    for (const v of violations.slice(0, 5)) {
      console.log(`  [${v.type}] ${v.file} / ${v.qid}`);
      if (v.missingOpts.length) console.log(`    missing: ${v.missingOpts.join(' | ')}`);
      if (v.staleKeys.length) console.log(`    stale  : ${v.staleKeys.join(' | ')}`);
    }
    console.log('');
    console.log('修補:用 scripts/audit-explanation-desync.report.json 內 violations 列表逐題對齊');
    console.log('     參考 PR #56 auto-fix logic(case1 可批次配對)/ PR #59 case2 補寫');
  }

  console.log('');
  console.log(`-> report: scripts/audit-explanation-desync.report.json`);
  process.exit(totalDesync === 0 ? 0 : 1);
}

main();
