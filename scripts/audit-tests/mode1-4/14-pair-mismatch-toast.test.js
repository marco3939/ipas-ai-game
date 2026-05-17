// 14 — Mode 4 配對失敗 → showMismatchToast + Wrongbook
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, makeAssert, fixtureMatchingQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const A = makeAssert();

function build() {
  const questions = [];
  for (let i = 0; i < 8; i++) {
    questions.push(fixtureMatchingQuestion({
      id: 'q_match_' + i,
      node_id: 'L21102.' + String.fromCharCode(65 + i),
      stem: `配對概念:**概念${i}** 對應的描述是?`,
      options: [
        { text: `這是概念${i}的正解描述`, is_correct: true },
        { text: `干擾 ${i}-A`, is_correct: false },
        { text: `干擾 ${i}-B`, is_correct: false },
        { text: `干擾 ${i}-C`, is_correct: false }
      ]
    }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode4.js'));
  return sb;
}

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

console.log('=== Mode 4 — pair mismatch & Wrongbook ===');

// [1] 不同 pairId 的兩張 → mismatched++, combo 歸 0, HP 下降
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  // 找兩個不同 pairId 的卡(且不同 kind)
  const cardA = cards[0];
  const cardB = cards.find(c => c.pairId !== cardA.pairId && c.kind !== cardA.kind);
  A.ok(cardB, 'found mismatched partner');
  sb._mockA = makeCardEl(cardA);
  sb._mockB = makeCardEl(cardB);
  const hpBefore = vm.runInContext('Player.load().hp', sb);
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
  A.eq(vm.runInContext('Mode4.state.mismatched', sb), 1, 'mismatched = 1');
  A.eq(vm.runInContext('Mode4.state.combo', sb), 0, 'combo = 0');
  A.ok(vm.runInContext('Player.load().hp', sb) < hpBefore, 'HP decreased');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [2] 配錯 → Wrongbook 寫入(qid 來自 sourceQ)
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  const cardA = cards[0];
  const cardB = cards.find(c => c.pairId !== cardA.pairId && c.kind !== cardA.kind);
  sb._mockA = makeCardEl(cardA);
  sb._mockB = makeCardEl(cardB);
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
  const wb = vm.runInContext('Wrongbook.load()', sb);
  A.ok(wb.length >= 1, 'Wrongbook has entry');
  const entry = wb[0];
  A.eq(entry.userChoice, '?', 'userChoice = ?');
  A.eq(entry.correctChoice, '?', 'correctChoice = ?');
  A.ok(entry.userText && entry.userText.length > 0, 'userText non-empty');
  A.ok(entry.correctText && entry.correctText.length > 0, 'correctText non-empty');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [3] showMismatchToast 在 body 中加入 m4-mismatch-toast,且按下「立即下鑽變化型」呼叫 drillThis
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  const cardA = cards[0];
  const cardB = cards.find(c => c.pairId !== cardA.pairId && c.kind !== cardA.kind);
  // showMismatchToast 直接傳 pair data
  vm.runInContext(`
    const aState = Mode4.state.cards[0];
    const bState = Mode4.state.cards.find(c => c.pairId !== aState.pairId && c.kind !== aState.kind);
    Mode4.showMismatchToast(aState.data, bState.data);
  `, sb);
  const toast = sb.document.getElementById('m4-mismatch-toast');
  A.ok(toast, 'mismatch toast added to body');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [4] HP 歸 0 → gameOver scheduled
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Player.save({...Player.load(), hp: 1, hpMax: 100});', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  const cardA = cards[0];
  const cardB = cards.find(c => c.pairId !== cardA.pairId && c.kind !== cardA.kind);
  sb._mockA = makeCardEl(cardA);
  sb._mockB = makeCardEl(cardB);
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
  // hp -= 6+1 = 7, hp now negative → setTimeout 1.2s gameOver
  A.ok(vm.runInContext('Player.load().hp', sb) <= 0, 'HP <= 0 after mismatch');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [5] 雙擊配錯(連續 onMismatch)— 雖然 onPointerUp 已 clear dragState,但若直接 tryMatch 連呼叫 2 次:
//     mismatched=2,Wrongbook 已存在的 entry wrongCount++(同 qid)
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  const cardA = cards[0];
  const cardB = cards.find(c => c.pairId !== cardA.pairId && c.kind !== cardA.kind);
  sb._mockA = makeCardEl(cardA);
  sb._mockB = makeCardEl(cardB);
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB); Mode4.tryMatch(_mockA, _mockB);', sb);
  A.eq(vm.runInContext('Mode4.state.mismatched', sb), 2, 'mismatched = 2 (no entry guard at tryMatch level)');
  // Wrongbook 同 qid 只有 1 entry
  const wb = vm.runInContext('Wrongbook.load()', sb);
  A.eq(wb.length, 1, 'Wrongbook still 1 entry (same qid wrongCount++)');
  A.ok(wb[0].wrongCount >= 2, 'wrongCount incremented');
  vm.runInContext('Mode4.stopTimer();', sb);
}

// [6] finished=true 後 tryMatch 不再生效
{
  const sb = build();
  vm.runInContext('Mode4.start();', sb);
  vm.runInContext('Mode4.state.finished = true;', sb);
  const cards = vm.runInContext('Mode4.state.cards', sb);
  const cardA = cards[0];
  const cardB = cards.find(c => c.pairId !== cardA.pairId);
  sb._mockA = makeCardEl(cardA);
  sb._mockB = makeCardEl(cardB);
  vm.runInContext('Mode4.tryMatch(_mockA, _mockB);', sb);
  A.eq(vm.runInContext('Mode4.state.mismatched', sb), 0, 'tryMatch noop when finished');
  vm.runInContext('Mode4.stopTimer();', sb);
}

process.exit(A.summary('mode4.14.pair-mismatch-toast'));
