// 07-review-xss-sandbox.test.js — Review.start 對 XSS payload 之 escape 驗證
const { makeSandbox, loadStorage, loadWrongbook, loadErrorReports, loadReview,
        makeAssert } = require('./_helpers');
const vm = require('vm');

console.log('=== Review XSS tests ===');
const A = makeAssert();

function setup(QUESTIONS) {
  const sb = makeSandbox({ QUESTIONS });
  loadStorage(sb);
  loadWrongbook(sb);
  loadErrorReports(sb);
  sb.document.__inject('view-review');
  return sb;
}

// ----- 1. XSS in qid -----
console.log('\n[1] XSS in qid');
{
  const xssQid = '<img src=x onerror=alert(1)>';
  const sb = setup([{ id: xssQid, stem: 'normal', knowledge_code: 'K1' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{ qid: xssQid, userChoice: 'A', correctChoice: 'B',
    userText: 'u', correctText: 'c', wrongCount: 1, mastered: false }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!/<img[^>]*onerror/.test(html), 'no executable <img onerror>');
  A.ok(html.includes('&lt;img'), 'qid < escaped');
}

// ----- 2. XSS in userText -----
console.log('\n[2] XSS in userText');
{
  const sb = setup([{ id: 'q1', stem: 'q1', knowledge_code: 'K' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{
    qid: 'q1', userChoice: 'A', correctChoice: 'B',
    userText: '<script>alert("user")</script>',
    correctText: 'safe',
    wrongCount: 1, mastered: false,
  }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!html.includes('<script>alert("user")'), 'no raw <script> in userText');
  A.ok(html.includes('&lt;script&gt;') || html.includes('&lt;script'), 'userText script escaped');
}

// ----- 3. XSS in correctText -----
console.log('\n[3] XSS in correctText');
{
  const sb = setup([{ id: 'q1', stem: 'q1', knowledge_code: 'K' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{
    qid: 'q1', userChoice: 'A', correctChoice: 'B',
    userText: 'safe',
    correctText: '<img onerror=alert(2)>',
    wrongCount: 1, mastered: false,
  }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!/<img[^>]*onerror/.test(html), 'no executable <img onerror> in correctText');
  A.ok(html.includes('&lt;img'), 'correctText < escaped');
}

// ----- 4. XSS in userChoice -----
console.log('\n[4] XSS in userChoice (single letter normally, but attacker can inject)');
{
  const sb = setup([{ id: 'q1', stem: 'q1', knowledge_code: 'K' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{
    qid: 'q1', userChoice: '"><script>alert(3)</script>', correctChoice: 'B',
    userText: '', correctText: '', wrongCount: 1, mastered: false,
  }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!html.includes('"><script>'), 'userChoice attack escaped');
  A.ok(html.includes('&quot;') || html.includes('&#39;') || html.includes('&lt;'),
    'some entity-encoded variant present');
}

// ----- 5. XSS in stem -----
console.log('\n[5] XSS in stem');
{
  const sb = setup([{ id: 'q1', stem: '<svg onload=alert(4)>safe</svg>', knowledge_code: 'K' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{
    qid: 'q1', userChoice: 'A', correctChoice: 'B',
    userText: '', correctText: '', wrongCount: 1, mastered: false,
  }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!/<svg[^>]*onload/.test(html), 'no raw <svg onload>');
}

// ----- 6. XSS in knowledge_code -----
console.log('\n[6] XSS in knowledge_code');
{
  const sb = setup([{ id: 'q1', stem: 's', knowledge_code: '<iframe src=x>' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{
    qid: 'q1', userChoice: 'A', correctChoice: 'B',
    userText: '', correctText: '', wrongCount: 1, mastered: false,
  }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!html.includes('<iframe src=x>'), 'no raw <iframe>');
  A.ok(html.includes('&lt;iframe'), 'iframe escaped');
}

// ----- 7. onclick attr injection via qid -----
console.log('\n[7] qid breaking out of onclick attribute');
{
  // qid 嵌到 onclick="Review.drillItem('${esc(x.qid)}')"
  // 攻擊者試圖 break 出單引號
  const xssQid = "'); alert(1); //";
  const sb = setup([{ id: xssQid, stem: 's', knowledge_code: 'K' }]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([{
    qid: xssQid, userChoice: 'A', correctChoice: 'B',
    userText: '', correctText: '', wrongCount: 1, mastered: false,
  }]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  // 確保 ' 被 escape 成 &#39;
  A.ok(!html.match(/onclick="[^"]*'\); alert/),
    'no broken-out onclick (esc with &#39; preserves quoting)');
}

// ----- 8. multiple entries + mixed XSS -----
console.log('\n[8] multiple entries with mixed XSS');
{
  const sb = setup([
    { id: 'q1', stem: 'a', knowledge_code: 'K1' },
    { id: 'q2', stem: '<b>b</b>', knowledge_code: 'K2' },
  ]);
  const Wrongbook = vm.runInContext('Wrongbook', sb);
  Wrongbook.save([
    { qid: 'q1', userText: '<i>1</i>', correctText: '', userChoice: 'A', correctChoice: 'B', wrongCount: 1, mastered: false },
    { qid: 'q2', userText: '<script>2</script>', correctText: '<x>3</x>', userChoice: 'A', correctChoice: 'B', wrongCount: 1, mastered: false },
  ]);
  const Review = loadReview(sb);
  Review.start();
  const html = sb.document.getElementById('view-review').innerHTML;
  A.ok(!html.includes('<i>1</i>'), 'q1 userText escaped');
  A.ok(!html.includes('<script>2</script>'), 'q2 userText escaped');
  A.ok(!html.includes('<x>3</x>'), 'q2 correctText escaped');
  A.ok(!html.includes('<b>b</b>'), 'q2 stem escaped');
}

// ----- 9. ErrorReports._esc 對 undefined/null 不 throw -----
console.log('\n[9] ErrorReports._esc null/undefined');
{
  const sb = setup([]);
  const ER = loadErrorReports(sb);
  A.eq(ER._esc(null), '', '_esc(null) = ""');
  A.eq(ER._esc(undefined), '', '_esc(undefined) = ""');
  A.eq(ER._esc(0), '0', '_esc(0) = "0"');
  A.eq(ER._esc(false), 'false', '_esc(false) = "false"');
  A.eq(ER._esc('<script>'), '&lt;script&gt;', 'standard escape');
}

// ----- 10. ErrorReports._esc 全部 5 個字元 -----
console.log('\n[10] ErrorReports._esc 5-char coverage');
{
  const sb = setup([]);
  const ER = loadErrorReports(sb);
  A.eq(ER._esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;', 'all 5 chars escaped');
}

process.exit(A.summary('Review XSS'));
