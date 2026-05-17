// Smoke test:確認 helper 能成功載入 mode1
const path = require('path');
const vm = require('vm');
const { INDEX, readFile, makeSandbox, loadSharedLayer, loadMode, fixtureQuestion } = require('./_helpers');

const indexSrc = readFile(INDEX);
const questions = [];
for (let i = 0; i < 50; i++) {
  questions.push(fixtureQuestion({
    id: 'q_test_' + String(i).padStart(3, '0'),
    tags: ['電商', '推薦', '客戶']
  }));
}

const sb = makeSandbox({ questions });
loadSharedLayer(sb, indexSrc);

// 把 QUESTIONS 同步到 sandbox 的 QUESTIONS 變數(被 generateVariation / mode 程式碼裸名讀)
vm.runInContext('QUESTIONS = window.QUESTIONS;', sb);

loadMode(sb, path.join(__dirname, '../../../src/modes/mode1.js'));

// 嘗試 Mode1.start()
try {
  vm.runInContext('Mode1.start();', sb);
  console.log('mode1.start() OK');
  console.log('view-play exists:', !!sb.document.getElementById('view-play'));
} catch (e) {
  console.error('FAIL:', e.message);
  console.error(e.stack);
  process.exit(1);
}

try {
  vm.runInContext('Mode1.selectBoss("ecommerce");', sb);
  console.log('selectBoss(ecommerce) OK');
  const state = vm.runInContext('Mode1.state', sb);
  console.log('state:', state ? { idx: state.idx, qcount: state.questions.length, bossHp: state.bossHp } : null);
} catch (e) {
  console.error('FAIL selectBoss:', e.message);
  console.error(e.stack);
  process.exit(1);
}
