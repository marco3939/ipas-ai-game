// 07-xss-sandbox.test.js
// Coverage: XSS / injection surface in render pipeline.
//
// Threat model: question authors are trusted (kb/scope.json whitelist), but
// it's still worth knowing exactly how dangerous strings pass through.
//
// We trace the path:
//   1. renderQuestion: does NOT escape stem / options.text — fields stay raw.
//   2. PlayEngine.show: uses template-literal `${this.current.stem}` into
//      view.innerHTML.  This DOES execute injected <script> on a real DOM.
//   3. highlightCodeSimple: DOES escape & < > before highlighting (good).
//   4. renderVisualData: inserts table_data values via `${v}` into td — NO
//      escape.  Same XSS surface as stem.
//
// We assert the (somewhat undesirable) status quo so any future change is
// caught:
//   - if renderQuestion starts to escape, we want to know
//   - if highlightCodeSimple stops escaping, we want to know

const { freshContext } = require('./_loader.js');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; fails.push({ label, got, want }); }
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label);
}
function truthy(label, v) {
  const ok = !!v;
  if (ok) pass++; else { fail++; fails.push({ label, got: v }); }
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label);
}

function makeCtx() {
  const { sandbox, context } = freshContext();
  const elementStore = {};
  sandbox.document = {
    getElementById(id) {
      if (!elementStore[id]) {
        elementStore[id] = { id, innerHTML: '', appendChild() {}, querySelectorAll() { return []; },
          classList: { add(){}, remove(){}, toggle(){} }, dataset: {}, style: {} };
      }
      return elementStore[id];
    },
    querySelectorAll: () => [],
    createElement: () => ({ className: '', textContent: '', remove() {} })
  };
  return { sandbox, context, elementStore };
}

console.log('=== Test 1: renderQuestion does NOT escape <script> in stem ===');
{
  const { context } = makeCtx();
  const renderQuestion = vm.runInContext('renderQuestion', context);
  vm.runInContext('RNG.set(1);', context);
  const r = renderQuestion({
    id: 'x1', stem: '<script>alert("xss")</script>',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  truthy('stem kept verbatim (no escape)',
    r.stem === '<script>alert("xss")</script>');
}

console.log('\n=== Test 2: renderQuestion does NOT escape <img onerror> in options ===');
{
  const { context } = makeCtx();
  const renderQuestion = vm.runInContext('renderQuestion', context);
  vm.runInContext('RNG.set(1);', context);
  const r = renderQuestion({
    id: 'x2', stem: '?', shuffle_options: false,
    options: [
      { text: '<img src=x onerror="alert(1)">', is_correct: true },
      { text: 'safe' }, { text: 'safe' }, { text: 'safe' }
    ]
  });
  truthy('option text with img onerror kept verbatim',
    r.options[0].text === '<img src=x onerror="alert(1)">');
}

console.log('\n=== Test 3: PlayEngine.show injects stem RAW into innerHTML ===');
{
  const { sandbox, context, elementStore } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'x3', stem: '<script>WAS_INJECTED=1</script>',
    knowledge_code: 'L1', difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  const html = elementStore['view-play'].innerHTML;
  truthy('view-play HTML contains the raw <script> tag (XSS surface)',
    html.includes('<script>WAS_INJECTED=1</script>'));
  console.log('  FINDING: stem is injected RAW via template-literal innerHTML.');
  console.log('  In a real browser this would execute the script tag.');
  console.log('  Mitigation: question authoring is trusted (whitelist scope.json).');
  console.log('  RECOMMENDATION: if any user-supplied text ever reaches stem, sanitize first.');
}

console.log('\n=== Test 4: javascript: URL in stem stays in innerHTML ===');
{
  const { sandbox, context, elementStore } = makeCtx();
  const PlayEngine = vm.runInContext('PlayEngine', context);
  vm.runInContext('RNG.set(1);', context);
  PlayEngine.show({
    id: 'x4', stem: '<a href="javascript:alert(1)">click</a>',
    knowledge_code: 'L1', difficulty: 'easy', format: 'mc', shuffle_options: false,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  truthy('javascript: URL preserved verbatim',
    elementStore['view-play'].innerHTML.includes('javascript:alert(1)'));
}

console.log('\n=== Test 5: highlightCodeSimple DOES escape &, <, > ===');
{
  const { context } = makeCtx();
  const hcs = vm.runInContext('highlightCodeSimple', context);
  const out = hcs('if x < y and a > b and c & d:');
  // Should NOT contain raw < or > except inside <span> tags we generated.
  // Strip <span ...> and </span>:
  const stripped = out.replace(/<\/?span[^>]*>/g, '');
  truthy('code "<" escaped to "&lt;"', !stripped.includes('<'));
  truthy('code ">" escaped to "&gt;"', !stripped.includes('>'));
  truthy('code "&" escaped to "&amp;"',
    !stripped.match(/&(?!amp;|lt;|gt;|quot;|#\d+;)/));
  console.log('  highlightCodeSimple output (stripped of <span>):', stripped);
}

console.log('\n=== Test 6: highlightCodeSimple with <script> in code -> escaped ===');
{
  const { context } = makeCtx();
  const hcs = vm.runInContext('highlightCodeSimple', context);
  const out = hcs('x = "<script>alert(1)</script>"');
  truthy('script tag in code IS escaped (no raw <script>)',
    !out.includes('<script>') && out.includes('&lt;script&gt;'));
  console.log('  output:', out);
}

console.log('\n=== Test 7: renderVisualData with table_data — VALUES are NOT escaped ===');
{
  const { context } = makeCtx();
  const rvd = vm.runInContext('renderVisualData', context);
  const html = rvd({
    table_data: [
      { col1: '<script>alert(1)</script>', col2: 'safe' }
    ],
    table_columns: ['col1', 'col2']
  });
  truthy('table_data value with <script> renders RAW (NOT escaped) — FINDING',
    html.includes('<script>alert(1)</script>'));
  console.log('  FINDING: renderVisualData table cells are NOT HTML-escaped.');
  console.log('  Inputs are authored values; still, recommend escaping for defense-in-depth.');
}

console.log('\n=== Test 8: renderVisualData with chart_data labels — NOT escaped ===');
{
  const { context } = makeCtx();
  const rvd = vm.runInContext('renderVisualData', context);
  const html = rvd({
    chart_data: {
      type: 'bar',
      labels: ['<g/onclick=alert(1)>'],
      values: [10]
    }
  });
  truthy('chart_data label with SVG injection rendered RAW — FINDING',
    html.includes('<g/onclick=alert(1)>'));
  console.log('  FINDING: chart_data labels go into SVG <text> RAW.');
  console.log('  Authored data only; consider escaping if user input ever reaches here.');
}

console.log('\n=== Test 9: option text with __proto__-like content does NOT pollute ===');
{
  const { context } = makeCtx();
  const renderQuestion = vm.runInContext('renderQuestion', context);
  vm.runInContext('RNG.set(1);', context);
  const r = renderQuestion({
    id: 'x9', stem: '?',
    options: [
      { text: '__proto__', is_correct: true },
      { text: 'constructor.prototype.polluted = true' },
      { text: 'normal' }, { text: 'normal' }
    ]
  });
  truthy('Object.prototype not polluted', ({}).polluted === undefined);
  truthy('option texts preserved literally',
    r.options.some(o => o.text === '__proto__') &&
    r.options.some(o => o.text === 'constructor.prototype.polluted = true'));
}

console.log('\n=== Test 10: super-long stem (1MB) ===');
{
  const { context } = makeCtx();
  const renderQuestion = vm.runInContext('renderQuestion', context);
  vm.runInContext('RNG.set(1);', context);
  const bigStem = 'A'.repeat(1024 * 1024);
  const r = renderQuestion({
    id: 'x10', stem: bigStem,
    options: [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]
  });
  truthy('1MB stem rendered (no truncation, no crash)', r.stem.length === bigStem.length);
}

console.log('\n=== SUMMARY ===');
console.log('PASS:', pass, 'FAIL:', fail);
if (fail > 0) { console.log('FAILURES:'); fails.forEach(f => console.log(' -', JSON.stringify(f))); process.exit(1); }
