// 06-progress-cross-mode.test.js
// 必證:8 mode + PlayEngine.answer + CM(ConfusionMatrix)全部 Progress.addAnswer

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 06 Progress cross-mode ===\n');
const A = makeAssert();

// ----- [1] 各 mode 與 index.html 都呼叫 Progress.addAnswer -----
console.log('\n[1] Progress.addAnswer 覆蓋率');
{
  const expected = ['mode1.js','mode2.js','mode3.js','mode4.js','mode5.js','mode7.js','mode8.js'];
  for (const f of expected) {
    const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
    A.ok(/Progress\.addAnswer\s*\(/.test(src),
      `${f}: 呼叫 Progress.addAnswer`);
  }
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  A.ok(/Progress\.addAnswer\s*\(/.test(idx), 'PlayEngine.answer 含 Progress.addAnswer');
}

// ----- [2] Progress.init 初始化(只在 progress 不存在時) -----
console.log('\n[2] Progress.init 冪等');
{
  const sb = makeSandbox();
  const { Progress, Storage } = loadSharedLayer(sb);
  Progress.init();
  const p1 = Storage.get(Storage.K_PROGRESS);
  A.ok(p1, 'init 後 K_PROGRESS 存在');
  A.eq(p1.sessions, 0, 'sessions 初始 0');
  A.eq(p1.totalAnswered, 0, 'totalAnswered 初始 0');
  // 再呼叫 init 不應覆寫
  Progress.addAnswer(true);
  Progress.init(); // 應該 no-op(已存在)
  const p2 = Storage.get(Storage.K_PROGRESS);
  A.eq(p2.totalAnswered, 1, '再 init 不覆寫(totalAnswered 仍=1)');
}

// ----- [3] addAnswer 跨多 mode 累加 -----
console.log('\n[3] addAnswer 累加(跨 mode 模擬)');
{
  const sb = makeSandbox();
  const { Progress, Storage } = loadSharedLayer(sb);
  Progress.init();
  // 模擬 8 mode 各答幾題
  Progress.addAnswer(true);   // mode1
  Progress.addAnswer(false);  // mode1
  Progress.addAnswer(true);   // mode2
  Progress.addAnswer(true);   // mode3
  Progress.addAnswer(false);  // mode4
  Progress.addAnswer(true);   // mode5
  Progress.addAnswer(true);   // mode7
  Progress.addAnswer(false);  // mode8
  const p = Storage.get(Storage.K_PROGRESS);
  A.eq(p.totalAnswered, 8, '累加 totalAnswered=8');
  A.eq(p.totalCorrect, 5, 'totalCorrect=5');
}

// ----- [4] addSession 在 enterMode 每次累加 -----
console.log('\n[4] addSession 在 enterMode 累加');
{
  const sb = makeSandbox();
  const { Progress, Storage } = loadSharedLayer(sb);
  Progress.init();
  // 模擬 enterMode 5 次
  Progress.addSession();
  Progress.addSession();
  Progress.addSession();
  const p = Storage.get(Storage.K_PROGRESS);
  A.eq(p.sessions, 3, 'sessions=3 after 3 enterMode');
}

// ----- [5] index.html enterMode 真的有呼叫 Progress.addSession -----
console.log('\n[5] enterMode 真呼叫 addSession');
{
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  // 找 enterMode 函式內
  const m = idx.match(/function enterMode\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  A.ok(m, 'enterMode function 存在');
  if (m) {
    A.ok(/Progress\.addSession\s*\(/.test(m[1]), 'enterMode body 含 Progress.addSession');
  }
}

// ----- [6] daysLeft 倒數計算邊界 -----
console.log('\n[6] Progress.daysLeft 邊界');
{
  const sb = makeSandbox();
  const { Progress } = loadSharedLayer(sb);
  const d = Progress.daysLeft();
  A.ok(typeof d === 'number', 'daysLeft 回 number');
  A.ok(d >= 0, `daysLeft >= 0(got ${d})`);
}

process.exit(A.summary('06-progress-cross-mode'));
