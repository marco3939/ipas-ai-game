#!/usr/bin/env node
// Agent G - 03: 沙箱攻擊 #2 — node_id / knowledge_code 不在白名單(鐵律 #5)
const { auditSourceFidelity } = require('./sandbox-lib');

const attacks = [
  {
    id: 'sbx_node_01',
    knowledge_code: 'L21101',
    node_id: 'n_L99999_999', // 不存在
    subject: 1,
    format: 'single_choice',
    stem: 'x',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }],
  },
  {
    id: 'sbx_node_02',
    knowledge_code: 'L99999', // 不存在
    node_id: 'n_L21101_001',
    subject: 1,
    format: 'single_choice',
    stem: 'x',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }],
  },
  {
    id: 'sbx_node_03',
    // 缺 node_id 與 knowledge_code 兩者
    subject: 1,
    format: 'single_choice',
    stem: 'x',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }],
  },
  {
    id: 'sbx_node_04',
    knowledge_code: 'L21101',
    node_id: 'n_L21101_001',
    related_node_ids: ['n_L21101_001', 'n_FAKE_123'], // related 含假節點
    subject: 1,
    format: 'single_choice',
    stem: 'x',
    options: [{ text: 'a', is_correct: true }, { text: 'b' }],
  },
];

const violations = auditSourceFidelity(attacks);
console.log('=== 03: 沙箱 — node_id/knowledge_code 不在白名單 ===');
for (const v of violations) console.log(' ', v.id, '->', v.issues.join('; '));
console.log('Total attacks:', attacks.length, ' violations detected:', violations.length);

if (violations.length !== 4) {
  console.log('FAIL — expected 4 attacks all flagged, got', violations.length);
  process.exit(1);
}
console.log('PASS — audit-source-fidelity catches all 4 attack vectors');
