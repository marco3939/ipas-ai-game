// 01 — Mode 1 selectBoss happy path
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  // 2026-05-18 治本方案 C 跟進:Mode 1 改用 boss_topics 精準篩,test 也輪流分配 15 BOSS
  // 每 BOSS 至少 4 題(60/15=4),確保 selectBoss 對所有 BOSS 都能初始化 state
  const ALL_BOSSES = ['ecommerce','finance','medical','autonomous','manufacturing',
                       'energy','telecom','media','smartcity','education','logistics',
                       'legal','data_eng','ml_bigdata','privacy'];
  const questions = [];
  for (let i = 0; i < 60; i++) {
    questions.push(fixtureQuestion({
      id: 'q_t_' + String(i).padStart(3, '0'),
      tags: ['電商', '推薦', '客戶', '金融', '醫療', '製造', '電信'],
      knowledge_code: 'L21101',
      boss_topics: [ALL_BOSSES[i % ALL_BOSSES.length]]
    }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode1.js'));
  return sb;
}

console.log('=== Mode 1 — selectBoss happy path ===');

// [1] start() 不 throw + view-play 存在
{
  const sb = build();
  let err = null;
  try { vm.runInContext('Mode1.start();', sb); } catch (e) { err = e; }
  A.ok(!err, 'Mode1.start() does not throw');
  A.ok(sb.document.getElementById('view-play'), 'view-play exists after start');
  A.eq(vm.runInContext('Mode1.state', sb), null, 'state is null on map view');
}

// [2] selectBoss(ecommerce) → state 正確初始化
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce");', sb);
  const st = vm.runInContext('Mode1.state', sb);
  A.ok(st, 'state created');
  A.eq(st.boss.key, 'ecommerce', 'boss.key = ecommerce');
  A.eq(st.idx, 0, 'idx = 0');
  A.eq(st.correct, 0, 'correct = 0');
  A.eq(st.wrong, 0, 'wrong = 0');
  A.eq(st.combo, 0, 'combo = 0');
  A.eq(st.answering, false, 'answering = false');
  A.eq(st.bossKnockedOutShown, false, 'bossKnockedOutShown = false');
  A.ok(st.bossHp > 0, 'bossHp > 0');
  A.eq(st.bossHp, st.bossHpMax, 'bossHp == bossHpMax');
  A.ok(Array.isArray(st.questions), 'questions is array');
  A.ok(st.questions.length > 0, 'questions length > 0');
}

// [3] selectBoss('invalid') 不 throw,state 不變
{
  const sb = build();
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce");', sb);
  const bossBefore = vm.runInContext('Mode1.state.boss.key', sb);
  let err = null;
  try { vm.runInContext('Mode1.selectBoss("doesnotexist");', sb); } catch (e) { err = e; }
  A.ok(!err, 'selectBoss(invalid) does not throw');
  const bossAfter = vm.runInContext('Mode1.state.boss.key', sb);
  A.eq(bossAfter, bossBefore, 'invalid boss → state.boss not overwritten');
}

// [4] HTML escape — boss avatar / name / desc 經 esc()(防 XSS),題庫 stem 含 <script> 不該執行
//     我們驗:innerHTML 字串裡不含 raw `<script>` tag(被 esc 後變 &lt;script&gt;)
{
  const xssQ = fixtureQuestion({
    id: 'q_xss_001',
    stem: '<script>alert(1)</script>正常題目',
    tags: ['電商'],
    options: [
      { text: '<img src=x onerror=alert(1)>', is_correct: true },
      { text: '一般選項 A', is_correct: false },
      { text: '一般選項 B', is_correct: false },
      { text: '一般選項 C', is_correct: false }
    ]
  });
  const sb = (() => {
    const questions = [xssQ];
    for (let i = 0; i < 50; i++) {
      questions.push(fixtureQuestion({ id: 'q_t_' + i, tags: ['電商'] }));
    }
    const ctx = makeSandbox({ questions });
    loadSharedLayer(ctx, indexSrc);
    vm.runInContext('QUESTIONS = window.QUESTIONS;', ctx);
    loadMode(ctx, path.join(__dirname, '../../../src/modes/mode1.js'));
    return ctx;
  })();

  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const view = sb.document.getElementById('view-play');
  // 確保 innerHTML 中不含 raw <script> (被 escape 後變 &lt;)
  // 我們檢查 question-stem 區域(用粗暴方式: 找 view.innerHTML 的 raw 字串)
  // 由於我們的 DOM mock 只記錄 innerHTML 字串,直接 inspect
  const html = view.innerHTML;
  A.ok(!html.includes('<script>'), 'innerHTML does not contain raw <script> tag (XSS escaped)');
  A.ok(!html.includes('onerror='), 'innerHTML does not contain raw onerror= (XSS escaped in options)');
}

// [5] BOSSES list 包含 12 + 3 L22 = 15 個 (mode1.js 註解說 12 產業 + 3 L22)
{
  const sb = build();
  // 從 view 文字數 boss avatar 出現次數 — 我們改用 state 內間接確認
  // 簡化:確認所有 BOSS keys 都能 select
  const keys = ['ecommerce','finance','medical','autonomous','manufacturing','energy',
                'telecom','media','smartcity','education','logistics','legal',
                'data_eng','ml_bigdata','privacy'];
  vm.runInContext('Mode1.start();', sb);
  let succCount = 0;
  for (const k of keys) {
    try {
      vm.runInContext(`Mode1.selectBoss("${k}");`, sb);
      const st = vm.runInContext('Mode1.state', sb);
      if (st && st.boss && st.boss.key === k) succCount++;
    } catch (e) { /* ignore */ }
    vm.runInContext('Mode1.start();', sb); // 回地圖
  }
  A.eq(succCount, 15, 'all 15 BOSSES selectable (12 industries + 3 L22)');
}

process.exit(A.summary('mode1.01.selectBoss-happy'));
