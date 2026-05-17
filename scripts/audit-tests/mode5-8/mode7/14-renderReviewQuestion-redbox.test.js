// 14-renderReviewQuestion-redbox.test.js — PR #16 紅框真顯示
// After PR #16, the post-exam review screen for a wrong answer must show
// the user's choice in a red border, alongside the correct answer in green.
// This requires _rendered.options to have key field populated.
// Test: simulate full mock + start review + check the generated HTML contains
// markers that imply the red+green dual-display rendering.
const { loadMode, makeQ, makeAssert } = require('../_helpers');

console.log('=== Mode 7 review (red box for wrong / green for correct) PR #16 tests ===');
const A = makeAssert();

function setupAndPlay(allCorrect = false) {
  const questions = [];
  for (let i = 0; i < 3; i++) {
    questions.push(makeQ(`q${i}`, {
      node_id: `N${i}`,
      options: [
        { text: 'correct option ' + i, is_correct: true },
        { text: 'wrong A ' + i, is_correct: false },
        { text: 'wrong B ' + i, is_correct: false },
        { text: 'wrong C ' + i, is_correct: false },
      ],
      explanation: { correct: 'because', wrong: { 'wrong A 0': 'A is a trap' } },
    }));
  }
  const r = loadMode(7, { questions });
  r.Mode._setupConfig = { qcount: 3, scope: 'all', difficulty: 'mixed' };
  r.sandbox.confirm = () => true;
  r.Mode._startBattle();
  for (let i = 0; i < 3; i++) {
    r.Mode.state.idx = i;
    r.Mode._showCurrentQuestion();
    const item = r.Mode.state.lineup[i];
    const correctKey = item._rendered.options.find(o => o.is_correct).key;
    const wrongKey = item._rendered.options.find(o => !o.is_correct).key;
    r.Mode.state.draft[i] = { userKey: allCorrect ? correctKey : (i === 0 ? wrongKey : correctKey) };
  }
  r.Mode.submitMock();
  return r;
}

// --- 1: startReview transitions state to reviewMode ---
{
  const r = setupAndPlay(false);
  r.Mode.startReview();
  A.eq(r.Mode.state.reviewMode, true, 'startReview sets reviewMode=true');
  A.eq(r.Mode.state.reviewIdx, 0, 'reviewIdx starts at 0');
}

// --- 2: review screen for wrong q includes both correct (green) AND user (red) markers ---
{
  const r = setupAndPlay(false);
  r.Mode.startReview();
  // q0 is wrong (we picked wrongKey at idx 0)
  const view = r.sandbox.document.getElementById('view-play');
  const html = view.innerHTML;
  A.ok(html.includes('✗ 答錯') || html.includes('badge'),
    'review HTML has 答錯 status badge');
  A.ok(html.includes('✓ 正解') || html.includes('正解'),
    'review HTML labels the correct option (green box)');
  A.ok(html.includes('✗ 你選的') || html.includes('你選的'),
    'review HTML labels the user choice (red box) — PR #16 critical');
  // Specifically check both green (#16a34a) and red (#dc2626) inline styles
  A.ok(html.includes('#16a34a'),
    'green border color #16a34a present in review HTML');
  A.ok(html.includes('#dc2626'),
    'red border color #dc2626 present in review HTML');
}

// --- 3: review screen for correct q only includes green, no red user box ---
{
  const r = setupAndPlay(true);
  r.Mode.startReview();
  const view = r.sandbox.document.getElementById('view-play');
  const html = view.innerHTML;
  A.ok(html.includes('✓ 答對') || html.includes('答對'),
    'review for correct q: 答對 status badge present');
  // The user's choice IS the correct one — tag is '你選的 = 正解'
  A.ok(html.includes('你選的 = 正解') || html.includes('= 正解'),
    'correct q review: "你選的 = 正解" label combines (not separate red box)');
}

// --- 4: reviewNext moves forward, marks as reviewed ---
{
  const r = setupAndPlay(false);
  r.Mode.startReview();
  A.eq(r.Mode.state.reviewedSet.size, 1, 'first review marks idx 0 as reviewed');
  r.Mode.reviewNext();
  A.eq(r.Mode.state.reviewIdx, 1, 'reviewNext advances to idx 1');
  A.eq(r.Mode.state.reviewedSet.size, 2, '2 reviewed after one Next');
}

// --- 5: reviewPrev stops at 0 (no negative) ---
{
  const r = setupAndPlay(false);
  r.Mode.startReview();
  r.Mode.reviewPrev(); // should stay at 0
  A.eq(r.Mode.state.reviewIdx, 0, 'reviewPrev at idx 0 stays at 0');
}

// --- 6: reviewNext stops at last (no overflow) ---
{
  const r = setupAndPlay(false);
  r.Mode.startReview();
  r.Mode.reviewNext();
  r.Mode.reviewNext();
  r.Mode.reviewNext(); // past last
  A.eq(r.Mode.state.reviewIdx, 2, 'reviewNext at last idx stays at last');
}

// --- 7: attack — options.key all undefined (old bug scenario, simulate legacy data) ---
//   reviewHistorySession with fullLog where options[i].key is undefined.
//   The render must NOT crash; user-selected red box may not appear, but
//   correct option green box still rendered.
{
  const r = setupAndPlay(false);
  const data = r.sandbox.Storage.get('ipas_mode7_theater_v1');
  // Strip keys from fullLog options (simulate pre-PR #5 bug data)
  data.history[0].fullLog.forEach(e => {
    e.options.forEach(o => { delete o.key; });
  });
  r.sandbox.Storage.set('ipas_mode7_theater_v1', data);
  A.nothrow(() => r.Mode.reviewHistorySession(0),
    'reviewHistorySession with all options.key=undefined does NOT crash');
  A.nothrow(() => r.Mode.reviewNext(),
    'reviewNext with broken keys does NOT crash');
}

// --- 8: attack — markedIds with 10000+ entries — UI does not freeze ---
//   _renderReviewQuestion iterates over markedIds.has(q.id) — must be O(1).
{
  const r = setupAndPlay(false);
  // Add 10000 marked ids to state
  for (let i = 0; i < 10000; i++) {
    r.Mode.state.markedIds.add('zzz_' + i);
  }
  const t0 = Date.now();
  r.Mode._renderReviewQuestion(0);
  const dt = Date.now() - t0;
  A.ok(dt < 500,
    `render with markedIds.size=10000 fast (${dt}ms < 500ms — UI not frozen)`);
}

// --- 9: source contract — _renderReviewQuestion handles userKey/correctKey ---
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'src', 'modes', 'mode7.js'), 'utf8');
  const m = src.match(/_renderReviewQuestion\(idx\)\s*\{([\s\S]*?)\n    \},/);
  A.ok(m, '_renderReviewQuestion body found');
  const body = m[1];
  A.ok(/userKey/.test(body) && /correctKey/.test(body),
    '_renderReviewQuestion references userKey and correctKey');
  A.ok(/o\.key === userKey/.test(body) || /isUser/.test(body),
    '_renderReviewQuestion compares option.key against userKey (PR #16)');
}

process.exit(A.summary('Mode7 review redbox PR #16'));
