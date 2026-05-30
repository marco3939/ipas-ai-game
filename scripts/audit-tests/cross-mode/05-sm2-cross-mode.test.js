// 05-sm2-cross-mode.test.js  ★ PR #27 SM-1 修補
// 必證:Mode 1/2/3/4/5/7/8 全部 SM2.recordAnswer
//      首頁 sm2-due-count 累進

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 05 SM2 cross-mode ===\n');
const A = makeAssert();

// ----- [1] 各 mode 呼叫 SM2.recordAnswer 覆蓋 -----
// 2026-05-30 更新契約(對齊 PR #46 SSOT 重構):
//   mode1/2/5 改走 PlayEngine.commitAnswer SSOT(SSOT 內含 SM2.recordAnswer 呼叫),
//   mode3/4/7/8 仍裸呼叫。驗證新契約如下。
console.log('\n[1] mode SM2.recordAnswer 覆蓋率(SSOT 對齊 PR #46)');
{
  // 1a:走 SSOT 的 mode(裸字串可不存在)
  const ssotModes = ['mode1.js','mode2.js','mode5.js'];
  for (const f of ssotModes) {
    const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
    const directRec = /SM2\.recordAnswer\s*\(/.test(src);
    const viaSSOT = /PlayEngine\.commitAnswer\s*\(/.test(src);
    A.ok(directRec || viaSSOT, `${f}: 含 SM2.recordAnswer 或走 PlayEngine.commitAnswer SSOT`);
  }
  // 1b:仍裸呼叫的 mode
  const directModes = ['mode3.js','mode4.js','mode7.js','mode8.js'];
  for (const f of directModes) {
    const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
    A.ok(/SM2\.recordAnswer\s*\(/.test(src), `${f}: SM2.recordAnswer 裸呼叫`);
  }
  // 1c:index.html PlayEngine.answer / commitAnswer 含 SM2.recordAnswer
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  A.ok(/SM2\.recordAnswer\s*\(/.test(idx), 'PlayEngine.answer / commitAnswer 含 SM2.recordAnswer');
  // 1d:確認 commitAnswer 內含 SM2.recordAnswer(SSOT 契約)
  const commitMatch = idx.match(/commitAnswer\s*\([^)]*\)\s*\{[\s\S]*?\n\s{2}\},/);
  A.ok(commitMatch && /SM2\.recordAnswer\s*\(/.test(commitMatch[0]),
    'PlayEngine.commitAnswer 內含 SM2.recordAnswer(SSOT 契約)');
}

// ----- [2] PR #27 SM-1 critical:Mode 5 也 record(原本可能漏) -----
// 2026-05-30 更新:Mode 5 改走 PlayEngine.commitAnswer SSOT,SSOT 內 SM2.recordAnswer 已驗(本檔 [1d])
console.log('\n[2] PR #46 SSOT:Mode 5 走 commitAnswer(SSOT 內含 SM2.recordAnswer)');
{
  const m5 = fs.readFileSync(path.join(ROOT, 'src/modes/mode5.js'), 'utf8');
  A.ok(/PlayEngine\.commitAnswer\s*\(/.test(m5),
    'Mode 5 走 PlayEngine.commitAnswer SSOT(SSOT 內含 SM2.recordAnswer)');
  const m5Lines = m5.split('\n');
  const commitLines = m5Lines.map((l, i) => ({l, i})).filter(x => /PlayEngine\.commitAnswer/.test(x.l));
  A.ok(commitLines.length >= 1, `Mode 5 PlayEngine.commitAnswer 至少 1 處(${commitLines.length})`);
}

// ----- [3] SM2 行為:recordAnswer 寫 storage + countDueToday 即時更新 -----
console.log('\n[3] recordAnswer → countDueToday 累進');
{
  const sb = makeSandbox();
  const { SM2 } = loadSharedLayer(sb);
  A.eq(SM2.countDueToday(), 0, '初始 due=0');
  A.eq(SM2.totalTracked(), 0, '初始 tracked=0');
  // 答錯:interval=1,nextDue = now + 1 day → 今日不 due,明日 due
  SM2.recordAnswer('q_1', false, false);
  A.eq(SM2.totalTracked(), 1, 'recordAnswer 1 次 → tracked=1');
  // 答對(主場 grade=5):repetition=1, interval=1, nextDue=now+1day
  SM2.recordAnswer('q_2', true, false);
  // 第二次答對:repetition=2, interval=6 days
  SM2.recordAnswer('q_2', true, false);
  const all = SM2.load();
  A.eq(all['q_2'].repetition, 2, 'q_2 repetition=2 after 2 corrects');
  A.eq(all['q_2'].interval, 6, 'q_2 interval=6 days after 2 corrects');
}

// ----- [4] EF 範圍守:grade=2 多次後 EF=1.3(MIN_EF) -----
console.log('\n[4] EF 下限守 1.3');
{
  const sb = makeSandbox();
  const { SM2 } = loadSharedLayer(sb);
  // 連續答錯多次,EF 應該被夾到 MIN_EF=1.3
  for (let i = 0; i < 10; i++) SM2.recordAnswer('q_bad', false, false);
  const s = SM2.load()['q_bad'];
  A.eq(s.ef, 1.3, `EF 夾到 1.3(got ${s.ef})`);
}

// ----- [5] drill grade=4 vs 主場 grade=5 EF 不同 -----
console.log('\n[5] drill(grade=4)vs 主場(grade=5)EF 累積差異');
{
  const sb = makeSandbox();
  const { SM2 } = loadSharedLayer(sb);
  // 主場 5 次
  for (let i = 0; i < 5; i++) SM2.recordAnswer('q_main', true, false);
  // drill 5 次(相同題目)
  for (let i = 0; i < 5; i++) SM2.recordAnswer('q_drill', true, true);
  const efMain = SM2.load()['q_main'].ef;
  const efDrill = SM2.load()['q_drill'].ef;
  A.ok(efMain >= efDrill, `main grade=5 累積 EF=${efMain} >= drill grade=4 EF=${efDrill}`);
}

// ----- [6] 首頁 sm2-due-count 統計同步(refreshHome 路徑) -----
console.log('\n[6] sm2-due-count 統計同步');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  // refreshHome 內必含 SM2.countDueToday() 寫 sm2-due-count
  A.ok(/sm2-due-count/.test(idx), 'index.html 有 sm2-due-count element id');
  A.ok(/SM2\.countDueToday\s*\(\s*\)/.test(idx), 'refreshHome 呼叫 SM2.countDueToday');
  A.ok(/SM2\.totalTracked\s*\(\s*\)/.test(idx), 'refreshHome 呼叫 SM2.totalTracked');
}

// ----- [7] countDueToday vs countOverdue 區分 -----
console.log('\n[7] countDueToday vs countOverdue');
{
  const sb = makeSandbox();
  const { SM2 } = loadSharedLayer(sb);
  // 寫一個「過期 3 天」題目:直接 mutate state
  const fakeStore = { 'q_overdue': { ef: 2.5, interval: 1, repetition: 1, lastReview: Date.now() - 4*86400000, nextDue: Date.now() - 3*86400000 } };
  SM2.save(fakeStore);
  A.eq(SM2.countDueToday(), 1, 'overdue 算 due');
  A.eq(SM2.countOverdue(), 1, 'countOverdue 也算');
}

process.exit(A.summary('05-sm2-cross-mode'));
