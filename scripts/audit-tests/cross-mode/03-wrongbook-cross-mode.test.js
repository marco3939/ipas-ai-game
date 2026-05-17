// 03-wrongbook-cross-mode.test.js
// 必證:8 個 caller 都用 6-arg 簽名(qid, nodeId, userChoice, correctChoice, userText, correctText)
//      Review.start 對混合來源(mode1-8)資料能正常顯示

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 03 Wrongbook cross-mode ===\n');
const A = makeAssert();

// ----- [1] Wrongbook.add caller 簽名一致(共 9 個 caller) -----
// 從 index.html + mode1-8 抓所有 `Wrongbook.add(` 呼叫,parse 出參數個數
console.log('\n[1] 跨檔 Wrongbook.add 簽名一致性');
{
  const files = [
    'src/index.html', 'src/modes/mode1.js', 'src/modes/mode2.js',
    'src/modes/mode3.js', 'src/modes/mode4.js', 'src/modes/mode5.js',
    'src/modes/mode7.js', 'src/modes/mode8.js'
  ];
  const callers = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // 抓 multi-line Wrongbook.add(...)
    const matches = [...content.matchAll(/Wrongbook\.add\s*\(([\s\S]*?)\)\s*;/g)];
    for (const m of matches) {
      // 計 top-level 逗號 — 用 paren / bracket depth tracking
      const argsBlob = m[1];
      let depth = 0, count = 1;
      for (const ch of argsBlob) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) count++;
      }
      callers.push({ file: f, args: count, snippet: argsBlob.replace(/\s+/g,' ').substring(0, 80) });
    }
  }
  console.log(`Total Wrongbook.add callers: ${callers.length}`);
  for (const c of callers) console.log(`  ${c.file}: args=${c.args}  | ${c.snippet}`);

  // 真正的 caller:8 個 mode caller + 1 個 PlayEngine.answer(index.html)+ 1 個 mode7 history-fix
  A.ge(callers.length, 8, `at least 8 Wrongbook.add caller sites (got ${callers.length})`);
  // 全部都 6 arg(案例 10 修補後簽名)
  const wrong = callers.filter(c => c.args !== 6);
  A.eq(wrong, [], `all Wrongbook.add callers use 6-arg signature (case 10 fix)`);
}

// ----- [2] Wrongbook 寫 / 讀 / count 在 sandbox 內可運行 -----
console.log('\n[2] sandbox 寫讀混合來源資料');
{
  const sb = makeSandbox();
  const { Wrongbook } = loadSharedLayer(sb);
  // 模擬 mode1 / 3 / 5 / 7 各寫一筆,Review.start 應該看到全部
  Wrongbook.add('q_m1_1', 'L21101', 'B', 'A', 'wrong text 1', 'correct text 1');
  Wrongbook.add('q_m3_2', 'L21201', 'C', 'A', 'wrong text 2', 'correct text 2');
  Wrongbook.add('q_m5_3', 'L21301', 'D', 'A', 'wrong text 3', 'correct text 3');
  Wrongbook.add('q_m7_4', 'L22101', 'A', 'B', 'wrong text 4', 'correct text 4');

  A.eq(Wrongbook.count(), 4, 'count = 4 跨 mode 累加');
  const items = Wrongbook.load();
  A.eq(items.length, 4, 'load() 回 4 筆');
  // 每筆都該有 userText / correctText
  for (const it of items) {
    A.ok(it.userText, `${it.qid} 有 userText`);
    A.ok(it.correctText, `${it.qid} 有 correctText`);
    A.ok(it.correctChoice, `${it.qid} 有 correctChoice(非空)`);
  }
  // 同 qid 二次寫(累加 wrongCount)
  Wrongbook.add('q_m1_1', 'L21101', 'B', 'A', '', '');
  A.eq(Wrongbook.load()[0].wrongCount, 2, '同 qid 二次寫 wrongCount=2');
}

// ----- [3] 案例 10 lineup-key bug 污染掃描:countSuspect / cleanupSuspect -----
console.log('\n[3] 案例 10 lineup-key 污染清理');
{
  const sb = makeSandbox();
  const { Wrongbook } = loadSharedLayer(sb);
  // 污染:correctChoice 為 '' / null / undefined
  Wrongbook.add('q_bad_1', 'L21101', 'A', '', 'u', 'c');       // 空字串
  Wrongbook.add('q_bad_2', 'L21101', 'A', null, 'u', 'c');     // null
  // 'undefined' 字面:也算可疑
  const raw = Wrongbook.load();
  raw.push({ qid: 'q_bad_3', nodeId: 'L21101', userChoice: 'A', correctChoice: 'undefined', wrongCount:1, addedAt:Date.now() });
  Wrongbook.save(raw);

  Wrongbook.add('q_ok_1', 'L21101', 'B', 'A', 'u', 'c');

  A.eq(Wrongbook.countSuspect(), 3, 'countSuspect 偵測到 3 筆 lineup-key bug 污染');
  const qids = Wrongbook.listSuspectQids();
  A.eq(qids.sort(), ['q_bad_1', 'q_bad_2', 'q_bad_3'], 'listSuspectQids 列出可疑 qid');
  const removed = Wrongbook.cleanupSuspect();
  A.eq(removed, 3, 'cleanupSuspect 移除 3 筆');
  A.eq(Wrongbook.count(), 1, '清完剩 1 筆(q_ok_1)');
}

// ----- [4] Mastered 後不會被 countSuspect 算入 -----
console.log('\n[4] mastered 旗標排除');
{
  const sb = makeSandbox();
  const { Wrongbook } = loadSharedLayer(sb);
  Wrongbook.add('q_bad', 'L21101', 'A', '', 'u', 'c');
  Wrongbook.markMastered('q_bad');
  A.eq(Wrongbook.countSuspect(), 0, 'mastered 後不算 suspect');
}

process.exit(A.summary('03-wrongbook-cross-mode'));
