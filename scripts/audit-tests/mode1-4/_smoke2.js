// Smoke 2 — test answer flow, mode2/3/4 load
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, fixtureQuestion, fixtureMatchingQuestion, fixtureSequenceQuestion } = require('./_helpers');

function buildSandbox(extraQuestions = []) {
  const indexSrc = readFile(INDEX);
  const questions = extraQuestions.slice();
  // 加 50 個一般 mcq 題涵蓋常見產業
  for (let i = 0; i < 50; i++) {
    questions.push(fixtureQuestion({
      id: 'q_test_' + String(i).padStart(3, '0'),
      tags: ['電商', '推薦', '客戶', '金融'],
      knowledge_code: 'L21101'
    }));
  }
  const sb = makeSandbox({ questions });
  loadSharedLayer(sb, indexSrc);
  vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);
  return sb;
}

// Test 1: Mode1 startBattle + answer
{
  const sb = buildSandbox();
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode1.js'));
  vm.runInContext('Mode1.start(); Mode1.selectBoss("ecommerce"); Mode1.startBattle();', sb);
  const stateBefore = vm.runInContext('JSON.stringify({idx: Mode1.state.idx, correct: Mode1.state.correct, currentQ: !!Mode1.state.currentQ})', sb);
  console.log('Mode1 startBattle state:', stateBefore);
  // 找出 currentQ 的正解 key
  const correctKey = vm.runInContext('Mode1.state.currentQ.options.find(o => o.is_correct).key', sb);
  console.log('correctKey:', correctKey);
  vm.runInContext(`Mode1.answer("${correctKey}")`, sb);
  const stateAfter = vm.runInContext('JSON.stringify({correct: Mode1.state.correct, bossHp: Mode1.state.bossHp, answering: Mode1.state.answering})', sb);
  console.log('Mode1 after answer:', stateAfter);
}

// Test 2: Mode2 — need q_pa_001..005 in QUESTIONS
{
  const extra = [];
  for (let i = 1; i <= 5; i++) {
    extra.push(fixtureQuestion({ id: 'q_pa_00' + i, knowledge_code: 'L23102' }));
  }
  const sb = buildSandbox(extra);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode2.js'));
  vm.runInContext('Mode2.start(); Mode2.selectBoss("numpy"); Mode2.startBattle();', sb);
  const st = vm.runInContext('JSON.stringify({bossHp: Mode2.state.bossHp, qcount: Mode2.state.questions.length, currentQ: !!Mode2.state.currentQ})', sb);
  console.log('Mode2 state:', st);
}

// Test 3: Mode3
{
  const extra = [fixtureSequenceQuestion()];
  const sb = buildSandbox(extra);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode3.js'));
  vm.runInContext('Mode3.start(); Mode3.selectStage("q_pc_seq_001");', sb);
  const st = vm.runInContext('JSON.stringify({steps: Mode3.state.steps.length, pool: Mode3.state.pool.length, timeLeft: Mode3.state.timeLeft})', sb);
  console.log('Mode3 state:', st);
  vm.runInContext('Mode3.stopTimer();', sb);
}

// Test 4: Mode4
{
  const extra = [];
  for (let i = 0; i < 6; i++) {
    extra.push(fixtureMatchingQuestion({
      id: 'q_match_' + i,
      stem: `配對概念:**概念${i}** 對應的描述是?`,
      options: [
        { text: `這是概念 ${i} 的正確描述`, is_correct: true },
        { text: `干擾 ${i}-1`, is_correct: false },
        { text: `干擾 ${i}-2`, is_correct: false },
        { text: `干擾 ${i}-3`, is_correct: false }
      ]
    }));
  }
  const sb = buildSandbox(extra);
  loadMode(sb, path.join(__dirname, '../../../src/modes/mode4.js'));
  vm.runInContext('Mode4.start();', sb);
  const st = vm.runInContext('JSON.stringify({pairCount: Mode4.state.pairCount, cards: Mode4.state.cards.length, matched: Mode4.state.matched})', sb);
  console.log('Mode4 state:', st);
  vm.runInContext('Mode4.stopTimer();', sb);
}

console.log('all smoke OK');
process.exit(0);
