// 13 — Mode 4 配對成功 happy path
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureMatchingQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build(n = 8) {
  const questions = [];
  for (let i = 0; i < n; i++) {
    questions.push(fixtureMatchingQuestion({
      id: 'q_match_' + i,
      node_id: 'L21102.B',
      stem: `配對概念:**概念${i}** 對應的描述是?`,
      options: [
        { text: `這是概念${i}的正解描述,夠長以通過長度檢查`, is_correct: true },
        { text: `干擾選項${i}-A,同等長度`, is_correct: false },
        { text: `干擾選項${i}-B`, is_correct: false },
        { text: `干擾選項${i}-C`, is_correct: false }
      ]
    }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode4.js'));
  return sb;
}

// 用 cardA/cardB DOM mock 模擬 tryMatch — 直接呼叫 tryMatch(cardAEl, cardBEl)
// 我們從 state.cards 取兩張卡的 id 與 pairId,建 stub element
function makeCardEl(card) {
  return {
    dataset: { id: card.id, pair: card.pairId, kind: card.kind },
    classList: {
      _set: new Set(),
      add: function(c) { this._set.add(c); },
      remove: function(c) { this._set.delete(c); },
      contains: function(c) { return this._set.has(c); }
    },
    style: { cursor: '' }
  };
}

console.log('=== Mode 4 — pair match happy path ===');

// [1] start() — boardSize / pairCount 根據 pool 決定
{
  const sb = build(8);
  vm.runInContext('Mode4.start();', sb);
  const st = vm.runInContext('Mode4.state', sb);
  A.ok(st, 'state created');
  A.eq(st.pairCount, 8, 'pairCount = 8 (pool >= 8)');
  A.eq(st.cards.length, 16, 'cards = 16 (8 pairs × 2)');
  A.ok(st.cards.every(c => !c.matched), 'all cards initially unmatched');
  A.eq(st.matched, 0, 'matched = 0');
  A.eq(st.combo, 0, 'combo = 0');
  A.eq(st.time, 90, 'time = 90');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [2] 配對池 = 6 → boardSize 4, pairCount 6
{
  const sb = build(6);
  vm.runInContext('Mode4.start();', sb);
  A.eq(vm.runInContext('Mode4.state.pairCount', sb), 6, 'pairCount = 6');
  A.eq(vm.runInContext('Mode4.state.cards.length', sb), 12, 'cards = 12');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [3] 配對池 = 4 → boardSize 4, pairCount 4
{
  const sb = build(4);
  vm.runInContext('Mode4.start();', sb);
  A.eq(vm.runInContext('Mode4.state.pairCount', sb), 4, 'pairCount = 4');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [4] 配對池 < 4 → 不開戰,goHome
{
  const sb = build(2);
  vm.runInContext('Mode4.start();', sb);
  A.eq(vm.runInContext('Mode4.state', sb), null, 'state stays null when pool < 4');
}

// [5] 配對成功(tryMatch:concept + description 同 pairId)
{
  const sb = build(8);
  vm.runInContext('Mode4.start();', sb);
  // 找一對:cards 內 pairId = X 的兩張(concept + description)
  const cards = vm.runInContext('Mode4.state.cards', sb);
  const sample = cards[0];
  const partner = cards.find(c => c.pairId === sample.pairId && c.id !== sample.id);
  A.ok(partner, 'partner card exists');
  // 建 mock element
  const cardA = makeCardEl(sample);
  const cardB = makeCardEl(partner);
  sb._mockA = cardA;
  sb._mockB = cardB;
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
  A.eq(vm.runInContext('Mode4.state.matched', sb), 1, 'matched = 1');
  A.eq(vm.runInContext('Mode4.state.combo', sb), 1, 'combo = 1');
  A.eq(vm.runInContext('Mode4.state.mismatched', sb), 0, 'mismatched = 0');
  A.ok(vm.runInContext('Mode4.state.score', sb) > 0, 'score increased');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [6] 同卡片自己配自己 → 無效拖拉(視同無事)
{
  const sb = build(8);
  vm.runInContext('Mode4.start();', sb);
  const c0 = vm.runInContext('Mode4.state.cards[0]', sb);
  const sameA = makeCardEl(c0);
  const sameB = makeCardEl(c0); // 同一張(同 id)
  sb._mockA = sameA;
  sb._mockB = sameB;
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
  A.eq(vm.runInContext('Mode4.state.matched', sb), 0, 'self-self → matched = 0');
  A.eq(vm.runInContext('Mode4.state.mismatched', sb), 0, 'self-self → mismatched = 0');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [7] HTML escape — concept 含 HTML 特殊符號不該注入
{
  const xss = fixtureMatchingQuestion({
    id: 'q_match_xss',
    stem: '配對概念:**<script>alert(1)</script>** 對應的描述是?',
    options: [
      { text: '<img src=x onerror=evil()>正解描述', is_correct: true },
      { text: '干擾 A', is_correct: false },
      { text: '干擾 B', is_correct: false },
      { text: '干擾 C', is_correct: false }
    ]
  });
  const extra = [xss];
  for (let i = 0; i < 7; i++) extra.push(fixtureMatchingQuestion({
    id: 'q_match_' + i,
    stem: `配對概念:**概念${i}** 對應的描述是?`,
    options: [
      { text: `這是概念${i}的正解描述`, is_correct: true },
      { text: `干擾 ${i}-A`, is_correct: false },
      { text: `干擾 ${i}-B`, is_correct: false },
      { text: `干擾 ${i}-C`, is_correct: false }
    ]
  }));
  const sb = makeSandbox({ questions: extra });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode4.js'));
  vm.runInContext('Mode4.start();', sb);
  const view = sb.document.getElementById('view-play');
  A.ok(!view.innerHTML.includes('<script>alert(1)</script>'), 'no raw <script>');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [8] 全配完 8 對 → finished=true(victory 0.6s 後觸發,但 finished 立即標)
{
  const sb = build(8);
  vm.runInContext('Mode4.start();', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  // 找出所有 pairId,各配一次
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c.pairId)) continue;
    seen.add(c.pairId);
    const partner = cards.find(o => o.pairId === c.pairId && o.id !== c.id);
    if (!partner) continue;
    sb._mockA = makeCardEl(c);
    sb._mockB = makeCardEl(partner);
    vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
    // 標記資料層 matched(因 mode4 是用 dataset 找 state.cards 標 matched,我們的 mock 不在 board 內,
    // 故重新驗證:看 state.matched 計數即可)
  }
  A.eq(vm.runInContext('Mode4.state.matched', sb), 8, 'all 8 pairs matched');
  A.eq(vm.runInContext('Mode4.state.finished', sb), true, 'finished = true (after match all)');
  vm.runInContext('Mode4.stopTimer();', sb);
}

process.exit(A.summary('mode4.13.pair-match-happy'));
