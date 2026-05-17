// 20-legacy-corrupted-detection.test.js — 2026-05-17
// 驗證:PR #21 修補前留下的「options 有 text 但 key 為空 + result.correct=0」壞紀錄
//   1) 被偵測為 corrupted legacy
//   2) reviewHistorySession 進入時 _legacyData=true(觸發紅色警告 banner)
//   3) deleteHistoryEntry 能正確從 storage 移除
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 legacy corrupted detection (2026-05-17 case 10 follow-up) ===');
const A = makeAssert();

function setup() {
  const questions = [];
  for (let i = 0; i < 10; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i}`,
      knowledge_code: 'L21101',
      options: [
        { text: 'opt1-' + i, is_correct: true },
        { text: 'opt2-' + i, is_correct: false },
        { text: 'opt3-' + i, is_correct: false },
        { text: 'opt4-' + i, is_correct: false },
      ],
      explanation: { correct: 'r', wrong: {} },
    }));
  }
  return loadMode(7, { questions });
}

// ----- 1. 壞紀錄(case 10 pre-fix):result.correct=0 + fullLog options 缺 key -----
console.log('\n[1] PR #21 前的壞紀錄被偵測 → reviewHistorySession 標 _legacyData=true');
{
  const { Mode, sandbox } = setup();
  sandbox.confirm = () => true;
  const STORAGE_KEY = 'ipas_mode7_theater_v1';
  // 寫入一筆模擬壞紀錄:5 題,result.correct=0,fullLog 內 options 缺 key
  sandbox.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: '1.0',
    history: [{
      ts: Date.now() - 86400000,
      config: { qcount: 5, scope: 'all', difficulty: 'mixed' },
      result: { correct: 0, total: 5, timeUsed: 600, byCategory: {} },
      topWrong: [],
      fullLog: [
        // 答完 5 題,但 isCorrect=false + correctKey='' + options 無 key(case 10 bug 留下)
        { qid: 'q0', kc: 'L21101', userKey: 'A', isCorrect: false, correctKey: '', answered: true,
          stem: 's0', options: [
            { key: '', text: 'opt1-0', is_correct: true },
            { key: '', text: 'opt2-0', is_correct: false },
            { key: '', text: 'opt3-0', is_correct: false },
            { key: '', text: 'opt4-0', is_correct: false },
          ]},
        { qid: 'q1', kc: 'L21101', userKey: 'B', isCorrect: false, correctKey: '', answered: true,
          stem: 's1', options: [
            { key: '', text: 'opt1-1', is_correct: true },
            { key: '', text: 'opt2-1', is_correct: false },
            { key: '', text: 'opt3-1', is_correct: false },
            { key: '', text: 'opt4-1', is_correct: false },
          ]},
        { qid: 'q2', kc: 'L21101', userKey: 'C', isCorrect: false, correctKey: '', answered: true,
          stem: 's2', options: [
            { key: '', text: 'opt1-2', is_correct: true },
            { key: '', text: 'opt2-2', is_correct: false },
            { key: '', text: 'opt3-2', is_correct: false },
            { key: '', text: 'opt4-2', is_correct: false },
          ]},
        { qid: 'q3', kc: 'L21101', userKey: 'A', isCorrect: false, correctKey: '', answered: true,
          stem: 's3', options: [
            { key: '', text: 'opt1-3', is_correct: true },
            { key: '', text: 'opt2-3', is_correct: false },
            { key: '', text: 'opt3-3', is_correct: false },
            { key: '', text: 'opt4-3', is_correct: false },
          ]},
        { qid: 'q4', kc: 'L21101', userKey: 'D', isCorrect: false, correctKey: '', answered: true,
          stem: 's4', options: [
            { key: '', text: 'opt1-4', is_correct: true },
            { key: '', text: 'opt2-4', is_correct: false },
            { key: '', text: 'opt3-4', is_correct: false },
            { key: '', text: 'opt4-4', is_correct: false },
          ]},
      ]
    }]
  }));

  Mode.reviewHistorySession(0);
  A.eq(Mode.state._legacyData, true,
    `✅ corrupted legacy 偵測成功:_legacyData=${Mode.state._legacyData}`);
  A.eq(Mode.state._historyMode, true, 'historyMode flag set');
}

// ----- 2. 正常新紀錄(post-PR #21):有 key,_legacyData=false -----
console.log('\n[2] 新紀錄(options 有 key)→ _legacyData=false');
{
  const { Mode, sandbox } = setup();
  sandbox.confirm = () => true;
  const STORAGE_KEY = 'ipas_mode7_theater_v1';
  sandbox.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: '1.0',
    history: [{
      ts: Date.now(),
      config: { qcount: 3, scope: 'all', difficulty: 'mixed' },
      result: { correct: 3, total: 3, timeUsed: 300, byCategory: {} },
      topWrong: [],
      fullLog: [
        { qid: 'q0', kc: 'L21101', userKey: 'A', isCorrect: true, correctKey: 'A', answered: true,
          stem: 's0', options: [
            { key: 'A', text: 'opt1-0', is_correct: true },
            { key: 'B', text: 'opt2-0', is_correct: false },
            { key: 'C', text: 'opt3-0', is_correct: false },
            { key: 'D', text: 'opt4-0', is_correct: false },
          ]},
        { qid: 'q1', kc: 'L21101', userKey: 'C', isCorrect: true, correctKey: 'C', answered: true,
          stem: 's1', options: [
            { key: 'A', text: 'wrong1', is_correct: false },
            { key: 'B', text: 'wrong2', is_correct: false },
            { key: 'C', text: 'opt1-1', is_correct: true },
            { key: 'D', text: 'wrong3', is_correct: false },
          ]},
        { qid: 'q2', kc: 'L21101', userKey: 'D', isCorrect: true, correctKey: 'D', answered: true,
          stem: 's2', options: [
            { key: 'A', text: 'wrong1', is_correct: false },
            { key: 'B', text: 'wrong2', is_correct: false },
            { key: 'C', text: 'wrong3', is_correct: false },
            { key: 'D', text: 'opt1-2', is_correct: true },
          ]},
      ]
    }]
  }));

  Mode.reviewHistorySession(0);
  A.eq(Mode.state._legacyData, false,
    `✅ 新紀錄不被誤判:_legacyData=${Mode.state._legacyData}`);
}

// ----- 3. deleteHistoryEntry 能正確從 storage 移除 -----
console.log('\n[3] deleteHistoryEntry 從 storage 移除');
{
  const { Mode, sandbox } = setup();
  sandbox.confirm = () => true;
  const STORAGE_KEY = 'ipas_mode7_theater_v1';
  sandbox.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: '1.0',
    history: [
      { ts: 1000, config: { qcount: 3 }, result: { correct: 0, total: 3 }, fullLog: [{qid:'q0',answered:true,options:[{key:'',text:'x',is_correct:true}]}] },
      { ts: 2000, config: { qcount: 3 }, result: { correct: 2, total: 3 }, fullLog: [{qid:'q1',answered:true,options:[{key:'A',text:'x',is_correct:true}]}] },
      { ts: 3000, config: { qcount: 3 }, result: { correct: 3, total: 3 }, fullLog: [{qid:'q2',answered:true,options:[{key:'A',text:'x',is_correct:true}]}] },
    ]
  }));

  // 刪 idx=0(第一場壞紀錄)
  Mode.deleteHistoryEntry(0);
  const after = JSON.parse(sandbox.localStorage.getItem(STORAGE_KEY));
  A.eq(after.history.length, 2, '✅ 壞紀錄已刪除,剩 2 場');
  A.eq(after.history[0].ts, 2000, '✅ 剩餘第 1 場是 ts=2000');
  A.eq(after.history[1].ts, 3000, '✅ 剩餘第 2 場是 ts=3000');
}

// ----- 4. deleteHistoryEntry 對不存在 idx 不 crash -----
console.log('\n[4] deleteHistoryEntry 不存在 idx 不 crash');
{
  const { Mode, sandbox } = setup();
  sandbox.confirm = () => true;
  const STORAGE_KEY = 'ipas_mode7_theater_v1';
  sandbox.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: '1.0',
    history: [{ ts: 1000, result: { correct: 0, total: 3 }, fullLog: [] }]
  }));
  A.nothrow(() => Mode.deleteHistoryEntry(99), '✅ idx=99 不 crash');
  A.nothrow(() => Mode.deleteHistoryEntry(-1), '✅ idx=-1 不 crash');
  // history 應該還在(刪除 idx 99 沒效)
  const after = JSON.parse(sandbox.localStorage.getItem(STORAGE_KEY));
  A.eq(after.history.length, 1, '✅ history 完好(idx 不存在不刪)');
}

// ----- 5. deleteHistoryEntry confirm cancel → 不刪 -----
console.log('\n[5] confirm cancel → 不刪');
{
  const { Mode, sandbox } = setup();
  sandbox.confirm = () => false;  // user clicks Cancel
  const STORAGE_KEY = 'ipas_mode7_theater_v1';
  sandbox.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: '1.0',
    history: [{ ts: 1000, result: { correct: 0, total: 3 }, fullLog: [] }]
  }));
  Mode.deleteHistoryEntry(0);
  const after = JSON.parse(sandbox.localStorage.getItem(STORAGE_KEY));
  A.eq(after.history.length, 1, '✅ confirm cancel → 紀錄保留');
}

process.exit(A.summary('Mode7 legacy corrupted detection'));
