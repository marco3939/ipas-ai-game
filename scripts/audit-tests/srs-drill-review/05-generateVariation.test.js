// 05-generateVariation.test.js — generateVariation 變化型生成策略
const { makeSandbox, loadStorage, loadRNG, loadRenderHelpers,
        loadGenerateVariation, makeAssert } = require('./_helpers');
const vm = require('vm');

console.log('=== generateVariation tests ===');
const A = makeAssert();

function setup(QUESTIONS) {
  const sb = makeSandbox({ QUESTIONS });
  loadStorage(sb);
  loadRNG(sb);
  loadRenderHelpers(sb);
  // QUESTIONS 是 generateVariation 內裸名,所以需要把它顯式暴露成 sandbox global
  sb.QUESTIONS = QUESTIONS;
  const gv = loadGenerateVariation(sb);
  return { sb, gv };
}

// 共用題庫工廠
function q(id, opts = {}) {
  return Object.assign({
    id,
    node_id: 'N1',
    knowledge_code: 'K1',
    subject: 'S1',
    difficulty: 'medium',
    format: 'mcq',
    interaction_type: 'mcq',
    options: [{ key: 'A', text: 'a', is_correct: true }, { key: 'B', text: 'b' }],
    tags: ['tag1', 'tag2'],
    misconceptions: ['common-error'],
    explanation: { hook: 'hook keyword' },
    related_node_ids: [],
  }, opts);
}

// ----- 1. 同 node_id 換 format 變化 -----
console.log('\n[1] same node_id, different format → 換角度');
{
  const orig = q('orig', { format: 'mcq' });
  const sameNodeDiffFormat = q('sndf', { format: 'matching' });
  const sameNodeSameFormat = q('snsf', { format: 'mcq' });
  const { gv } = setup([orig, sameNodeDiffFormat, sameNodeSameFormat]);
  const out = gv(orig, 3);
  A.ok(out.length >= 1, `generated ${out.length} variations`);
  A.ok(out.some(v => v.id === 'sndf'), 'diff-format pick included');
}

// ----- 2. related_node_ids 涵蓋 -----
console.log('\n[2] related_node_ids → 易混淆對手');
{
  const orig = q('orig', { related_node_ids: ['N2'] });
  const related = q('rel', { node_id: 'N2' });
  const irrelevant = q('irr', { node_id: 'N99', knowledge_code: 'K99', subject: 'S99' });
  const { gv } = setup([orig, related, irrelevant]);
  const out = gv(orig, 3);
  A.ok(out.some(v => v.id === 'rel'), 'related_node_ids pick included');
}

// ----- 3. 同 knowledge_code fallback -----
console.log('\n[3] same knowledge_code fallback');
{
  const orig = q('orig', { node_id: 'N1', knowledge_code: 'K1' });
  const sameCode = q('sc', {
    node_id: 'N9', knowledge_code: 'K1',
    tags: ['tag1', 'tag2'],
    misconceptions: ['common-error'],
    explanation: { hook: 'hook keyword extra' }, // 含 'hook' & 'tag1' 等關鍵詞
  });
  const { gv } = setup([orig, sameCode]);
  const out = gv(orig, 3);
  A.ok(out.length >= 1, `fallback to same-code: ${out.length} variations`);
}

// ----- 4. 題庫只有 1 題 → 空結果 -----
console.log('\n[4] candidate pool empty (only origQ)');
{
  const orig = q('only');
  const { gv } = setup([orig]);
  const out = gv(orig, 3);
  A.eq(out.length, 0, 'only origQ in pool → 0 variations');
}

// ----- 5. 題庫只有 1 題且該題就是 origQ 自己 -----
console.log('\n[5] sole question = origQ → no pick');
{
  const orig = q('orig');
  const { gv } = setup([orig]);
  const out = gv(orig, 3);
  A.eq(out.length, 0, 'self-only: empty');
}

// ----- 6. 排除 interaction_type='confusion-matrix' -----
console.log('\n[6] confusion-matrix excluded');
{
  const orig = q('orig');
  const cm = q('cm', { interaction_type: 'confusion-matrix' });
  const { gv } = setup([orig, cm]);
  const out = gv(orig, 3);
  A.ok(!out.some(v => v.id === 'cm'), 'confusion-matrix NOT included');
}

// ----- 7. 攻擊:originalQ.id 為 null/undefined -----
console.log('\n[7] attack: originalQ.id is null');
{
  const orig = q(null); // id=null
  const other = q('other');
  const { gv } = setup([orig, other]);
  // gv 內 filter `q.id !== originalQ.id` 對 null != 'other' 正常
  A.nothrow(() => gv(orig, 3), 'null id no throw');
}

// ----- 8. 攻擊:originalQ.explanation 為 undefined -----
console.log('\n[8] attack: originalQ.explanation undefined');
{
  const orig = q('orig', { explanation: undefined, tags: undefined, misconceptions: undefined });
  const sameNode = q('sn');
  const { gv } = setup([orig, sameNode]);
  A.nothrow(() => gv(orig, 3), 'missing explanation/tags no throw');
}

// ----- 9. 攻擊:originalQ.id 含特殊字元 -----
console.log('\n[9] attack: originalQ.id with special chars');
{
  const orig = q('orig"><script>', { id: 'orig"><script>' });
  const sameNode = q('sn');
  const { gv } = setup([orig, sameNode]);
  A.nothrow(() => gv(orig, 3), 'special-char id no throw');
}

// ----- 10. _drillStrategy 標籤被打上 -----
console.log('\n[10] _drillStrategy tagged on output');
{
  const orig = q('orig', { format: 'mcq' });
  const v1 = q('v1', { format: 'matching' }); // 換角度候選
  const { gv } = setup([orig, v1]);
  const out = gv(orig, 3);
  A.ok(out.length >= 1, `got ${out.length} variations`);
  if (out.length > 0) {
    A.ok(typeof out[0]._drillStrategy === 'string',
      `first variation tagged with strategy: "${out[0]._drillStrategy}"`);
  }
}

// ----- 11. 從原題庫挑時不重複(used Set) -----
console.log('\n[11] no duplicate picks');
{
  const orig = q('orig', { related_node_ids: ['N2'] });
  const v1 = q('v1', { node_id: 'N1', format: 'matching' });   // 換角度候選
  const v2 = q('v2', { node_id: 'N2' });                       // 易混淆候選
  const { gv } = setup([orig, v1, v2]);
  const out = gv(orig, 3);
  const ids = out.map(x => x.id);
  const unique = new Set(ids);
  A.eq(unique.size, ids.length, 'no duplicate ids in output');
}

// ----- 12. format 排除 confusion-matrix interaction_type -----
console.log('\n[12] multiple confusion-matrix all excluded');
{
  const orig = q('orig');
  const cms = [
    q('cm1', { interaction_type: 'confusion-matrix' }),
    q('cm2', { interaction_type: 'confusion-matrix' }),
    q('cm3', { interaction_type: 'confusion-matrix' }),
  ];
  const sn = q('sn');
  const { gv } = setup([orig, ...cms, sn]);
  const out = gv(orig, 3);
  out.forEach(v => A.ok(v.interaction_type !== 'confusion-matrix', `${v.id} not confusion-matrix`));
}

// ----- 13. 2026-05-17 鐵律 #1:同 subject 大規模 fallback 已移除 → 跨度太大不下鑽 -----
console.log('\n[13] 2026-05-17 鐵律 #1:寬鬆延伸已移除');
{
  const orig = q('orig', { node_id: 'N1', knowledge_code: 'K1', subject: 'S1' });
  const anyInSubject = q('any', {
    node_id: 'N99', knowledge_code: 'K99', subject: 'S1',
    tags: [], misconceptions: [], explanation: { hook: 'nothing matching' },
  });
  const { gv } = setup([orig, anyInSubject]);
  const out = gv(orig, 3);
  // 新規則:跨 node_id / 跨 code / 關鍵詞 < 2 重疊 → 跨度太大不下鑽,寧可回空
  A.eq(out.length, 0, `✅ 2026-05-17:跨度太大(only same-subject)→ 0 variations(實際 ${out.length})`);
}

// ----- 14. 完全不相關題庫 → 0 -----
console.log('\n[14] no overlapping question → empty');
{
  const orig = q('orig', { node_id: 'N1', knowledge_code: 'K1', subject: 'S1', related_node_ids: [] });
  const unrelated = q('u', { node_id: 'X', knowledge_code: 'Y', subject: 'Z' });
  const { gv } = setup([orig, unrelated]);
  const out = gv(orig, 3);
  A.eq(out.length, 0, 'totally unrelated pool → 0 variations');
}

process.exit(A.summary('generateVariation'));
