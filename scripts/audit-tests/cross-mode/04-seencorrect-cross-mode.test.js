// 04-seencorrect-cross-mode.test.js  ★ PR #27 C-4 重點
// 必證:
//   - Mode 1/2/3/4/5/7/8 + CM(ConfusionMatrix)答對都呼叫 SeenCorrect.mark
//   - Mode 5 不 read filterForBattle(本意:弱點要重複)但仍 write mark
//   - SeenCorrect.filterForBattle 真排除已答對的題

const fs = require('fs');
const path = require('path');
const { ROOT, makeSandbox, loadSharedLayer, makeAssert } = require('./_helpers');

console.log('=== 04 SeenCorrect cross-mode ===\n');
const A = makeAssert();

// ----- [1] 各 mode 是否呼叫 SeenCorrect.mark(正解時) -----
// 2026-05-30 更新契約(對齊 PR #46 SSOT 重構 + CLAUDE.md 案例 11):
//   PR #46 把 mode1/2/5 的「SeenCorrect.mark + SM2.recordAnswer + Progress.addAnswer
//   + Mastery.update + Wrongbook.add」5 步抽到共用層 PlayEngine.commitAnswer(...) SSOT。
//   所以 mode1/2/5 內裸 `SeenCorrect.mark(` 字串不存在 ≠ 漏 mark,而是改走 SSOT。
//   驗證新契約:
//     - mode1/2/5:走 PlayEngine.commitAnswer(SSOT 內 grep 已驗 SeenCorrect.mark)
//     - mode3/4/7/8:仍裸呼叫(尚未抽 SSOT)
//     - index.html PlayEngine.answer + commitAnswer 兩條路徑都含 SeenCorrect.mark
console.log('\n[1] mode 呼叫 SeenCorrect.mark 覆蓋率(SSOT 對齊 PR #46)');
{
  // 1a:走 PlayEngine.commitAnswer SSOT 的 mode(裸字串可不出現)
  const ssotModes = ['mode1.js', 'mode2.js', 'mode5.js'];
  for (const f of ssotModes) {
    const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
    const directMark = /SeenCorrect\.mark\s*\(/.test(src);
    const viaSSOT = /PlayEngine\.commitAnswer\s*\(/.test(src);
    A.ok(directMark || viaSSOT, `${f}: 含 SeenCorrect.mark 或走 PlayEngine.commitAnswer SSOT`);
  }
  // 1b:仍裸呼叫的 mode
  const directModes = ['mode3.js', 'mode4.js', 'mode7.js', 'mode8.js'];
  for (const f of directModes) {
    const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
    A.ok(/SeenCorrect\.mark\s*\(/.test(src), `${f}: SeenCorrect.mark 裸呼叫`);
  }
  // 1c:共用層 PlayEngine.answer + commitAnswer 都含 SeenCorrect.mark
  const idxSrc = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  A.ok(/SeenCorrect\.mark\s*\(/.test(idxSrc), 'index.html PlayEngine.answer / commitAnswer 含 SeenCorrect.mark');
  // 1d:確認 commitAnswer 內含 SeenCorrect.mark(SSOT 內部契約)
  const commitMatch = idxSrc.match(/commitAnswer\s*\([^)]*\)\s*\{[\s\S]*?\n\s{2}\},/);
  A.ok(commitMatch && /SeenCorrect\.mark\s*\(/.test(commitMatch[0]),
    'PlayEngine.commitAnswer 內含 SeenCorrect.mark(SSOT 契約)');
}

// ----- [2] Mode 5 不 read filterForBattle 但 write mark(PR #27 設計) -----
// 2026-05-30 更新:mode5 改走 PlayEngine.commitAnswer SSOT(PR #46),SSOT 內含 SeenCorrect.mark
// (本檔 [1d] 已驗),所以裸字串不出現是正常設計。保留「不 read filterForBattle」校驗。
console.log('\n[2] Mode 5 設計:write mark(走 SSOT)但 *不 read* filterForBattle');
{
  const m5 = fs.readFileSync(path.join(ROOT, 'src/modes/mode5.js'), 'utf8');
  // 走 SSOT 即等價於「寫 SeenCorrect.mark」
  A.ok(/PlayEngine\.commitAnswer\s*\(/.test(m5),
    'Mode 5 走 PlayEngine.commitAnswer SSOT(SSOT 內含 SeenCorrect.mark)');
  // Mode 5 弱點獵人本意要重複出弱題,不能濾掉已答對
  // 預期:不出現 SeenCorrect.filterForBattle / SeenCorrect.has
  A.ok(!/SeenCorrect\.filterForBattle\s*\(/.test(m5),
    'Mode 5 *不*呼叫 SeenCorrect.filterForBattle(設計:弱點需重複)');
  A.ok(!/SeenCorrect\.has\s*\(/.test(m5),
    'Mode 5 *不*呼叫 SeenCorrect.has(設計:弱點需重複)');
}

// ----- [3] 戰鬥模式有 read filterForBattle -----
console.log('\n[3] 戰鬥 mode 1/2/4/8 read SeenCorrect.filterForBattle');
{
  const battle = ['mode1.js', 'mode2.js', 'mode4.js', 'mode8.js'];
  for (const f of battle) {
    const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
    A.ok(/SeenCorrect\.filterForBattle\s*\(/.test(src),
      `${f}: read filterForBattle 過濾已答對`);
  }
}

// ----- [4] filterForBattle 行為驗證 -----
console.log('\n[4] filterForBattle 行為驗證');
{
  const sb = makeSandbox();
  const { SeenCorrect } = loadSharedLayer(sb);
  SeenCorrect.mark('q_a');
  SeenCorrect.mark('q_b');
  const pool = [{id:'q_a'},{id:'q_b'},{id:'q_c'},{id:'q_d'}];
  const fr = SeenCorrect.filterForBattle(pool, 1);
  A.eq(fr.pool.map(p=>p.id), ['q_c','q_d'], 'filter 排除 q_a,q_b');
  A.eq(fr.fallback, false, 'fallback=false 因為剩 2 ≥ minNeeded=1');
  // 不足時 fallback
  SeenCorrect.mark('q_c'); SeenCorrect.mark('q_d');
  const fr2 = SeenCorrect.filterForBattle(pool, 2);
  A.eq(fr2.pool.length, 4, 'fallback:剩 0 < 2 → 回原 4 題');
  A.eq(fr2.fallback, true, 'fallback=true');
}

// ----- [5] PR #27 C-4 critical:Mode 7 答對也 mark -----
// Mode 7 自己 wrap PlayEngine.answer,若沒主動 SeenCorrect.mark 會跳過
console.log('\n[5] PR #27 C-4 critical:Mode 7 wrap answer 後仍 mark');
{
  const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
  // 案例 10 audit C-4 critical:必含 SeenCorrect.mark
  A.ok(/SeenCorrect\.mark\s*\(/.test(m7),
    'Mode 7 wrap PlayEngine.answer 後主動呼叫 SeenCorrect.mark(C-4)');
  // 必含 isCorrect 條件守(只在答對時 mark)
  const ok = /isCorrect[^\n]*SeenCorrect\.mark|a\.isCorrect[^\n]*SeenCorrect\.mark/.test(m7);
  A.ok(ok, 'Mode 7 SeenCorrect.mark 在 isCorrect 條件內');
}

// ----- [6] cache 持久化:reset 後 storage 清空 -----
console.log('\n[6] reset 清 cache + storage');
{
  const sb = makeSandbox();
  const { SeenCorrect } = loadSharedLayer(sb);
  SeenCorrect.mark('q_x');
  A.eq(SeenCorrect.size(), 1, 'mark 後 size=1');
  A.ok(sb.__storageMap.has('ipas_seen_correct_v1'), 'storage 有寫入');
  SeenCorrect.reset();
  A.eq(SeenCorrect.size(), 0, 'reset 後 size=0');
  const stored = JSON.parse(sb.__storageMap.get('ipas_seen_correct_v1'));
  A.eq(stored, [], 'reset 後 storage 是空陣列');
}

// ----- [7] 跨 session 持久化(模擬 reload):新 sandbox + 注入舊資料 -----
console.log('\n[7] 跨 session 持久化');
{
  const sb1 = makeSandbox();
  const layer1 = loadSharedLayer(sb1);
  layer1.SeenCorrect.mark('q_persisted_1');
  layer1.SeenCorrect.mark('q_persisted_2');
  // 模擬 reload:把 sb1 的 storage 內容拷貝到新 sb2
  const persisted = sb1.__storageMap.get('ipas_seen_correct_v1');
  const sb2 = makeSandbox();
  sb2.__storageMap.set('ipas_seen_correct_v1', persisted);
  // 新 layer 進來時 _load() 會從 localStorage 撈,cache 重建
  const layer2 = loadSharedLayer(sb2);
  A.ok(layer2.SeenCorrect.has('q_persisted_1'), '跨 session:q_persisted_1 仍 has');
  A.ok(layer2.SeenCorrect.has('q_persisted_2'), '跨 session:q_persisted_2 仍 has');
}

process.exit(A.summary('04-seencorrect-cross-mode'));
