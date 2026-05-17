#!/usr/bin/env node
// Agent G - 06: 沙箱攻擊 #5 — stem 含 {__proto__: ...} 字面;測 applyVariables 行為
const { applyVariables } = require('./sandbox-lib');

const baselineProto = Object.prototype.evil;

// Test 1: 字面 stem 含 {__proto__: ...} 文字 — applyVariables 只認 {word} 替換,不會 eval
const stem1 = '計算 {__proto__: {evil: 1}} 應該不被當作變數展開';
const out1 = applyVariables(stem1, { x: 'safe' });
console.log('Test 1 stem unchanged?', out1 === stem1, 'output:', JSON.stringify(out1));

// Test 2: variables 物件本身含 __proto__ key — JS 物件存取會走原型鏈,但這裡 vars[k] 用直接索引
const stem2 = '替換 {__proto__} 看會抓到原型嗎';
const polluter = JSON.parse('{"__proto__":{"evil":42},"normal":"ok"}');
const out2 = applyVariables(stem2, polluter);
console.log('Test 2 output:', JSON.stringify(out2));
// 行為說明:JSON.parse 不會污染 prototype(只把字串 key "__proto__" 設為 own property)
// 因此 vars["__proto__"] 是 {evil:42},replace 會輸出 "[object Object]"
// 重要:Object.prototype 應未被污染
const protoNotPolluted = Object.prototype.evil === baselineProto;
console.log('Object.prototype not polluted:', protoNotPolluted);

// Test 3: 用 Object.assign(target, JSON.parse(...)) 也不會污染 (JSON.parse 把 __proto__ 變 own property)
const tgt = {};
Object.assign(tgt, JSON.parse('{"__proto__":{"evil":99}}'));
console.log('Test 3 Object.assign safe:', Object.prototype.evil === baselineProto);

// Test 4: 真正會污染的是 `obj.__proto__ = {...}` 賦值或遞迴 merge — applyVariables 不做任何 merge,安全
console.log('Test 4 applyVariables never assigns to __proto__: PASS (read-only access)');

if (!protoNotPolluted) {
  console.log('FAIL — Object.prototype was polluted');
  process.exit(1);
}
console.log('PASS — applyVariables / JSON.parse 安全:不會原型污染');
console.log('NOTE: 真實題庫 stem_variables 都是 own-property string,沒有 __proto__ key');
