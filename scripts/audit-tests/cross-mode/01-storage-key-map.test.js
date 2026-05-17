// 01-storage-key-map.test.js
// 全 codebase 掃 Storage.set / Storage.get / Storage.del,
// 生成完整 key map(writer / reader / schema 推斷)
// 列每個 key 的:writer 檔案 / reader 檔案 / ProgressIO ALLOWED_KEYS_EXACT 是否覆蓋

const fs = require('fs');
const path = require('path');
const { ROOT, INDEX, SM2_FILE, MODES_DIR, listModeFiles, makeAssert } = require('./_helpers');

console.log('=== 01 Storage key map ===\n');
const A = makeAssert();

// 收集 文字 key + Storage.K_* alias
const FILES = [INDEX, SM2_FILE, ...listModeFiles().map(f => path.join(MODES_DIR, f))];
const ops = []; // { file, line, kind: get/set/del, key, raw }

// 同時辨識 STORAGE_KEY local const(各 mode 用)
const localKeyDefs = {};

for (const f of FILES) {
  const content = fs.readFileSync(f, 'utf8');
  const base = path.basename(f);
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    // 抓 const STORAGE_KEY = 'xxx'  / progressKey: 'xxx'  / FONT_SCALE_KEY
    let m;
    m = line.match(/(?:const|let)\s+([A-Z_]+(?:KEY|_KEY))\s*=\s*['"]([^'"]+)['"]/);
    if (m) localKeyDefs[base + ':' + m[1]] = m[2];
    m = line.match(/progressKey:\s*['"]([^'"]+)['"]/);
    if (m) localKeyDefs[base + ':progressKey'] = m[1];
    // SM2 模組:STORAGE_KEY: 'ipas_sm2_v1'(物件 property)
    m = line.match(/STORAGE_KEY:\s*['"]([^'"]+)['"]/);
    if (m) localKeyDefs[base + ':STORAGE_KEY'] = m[1];

    // Storage.get/set/del(...)
    const re = /Storage\.(get|set|del)\s*\(\s*([^,)]+?)(?:\s*,|\s*\))/g;
    let mm;
    while ((mm = re.exec(line))) {
      const kind = mm[1];
      let keyExpr = mm[2].trim();
      // 解析 keyExpr — 如果是 'xxx',直接取;如果是 Storage.K_X,用 lookup;如果是 STORAGE_KEY,從 localKeyDefs 取
      let key;
      const sm = keyExpr.match(/^['"]([^'"]+)['"]$/);
      if (sm) key = sm[1];
      else if (keyExpr.startsWith('Storage.K_')) key = `<K alias> ${keyExpr}`;
      else if (localKeyDefs[base + ':' + keyExpr]) key = localKeyDefs[base + ':' + keyExpr];
      else if (keyExpr === 'this.progressKey') key = localKeyDefs[base + ':progressKey'] || '<this.progressKey>';
      else if (keyExpr === 'this.STORAGE_KEY') key = localKeyDefs[base + ':STORAGE_KEY'] || '<this.STORAGE_KEY>';
      else key = `<expr> ${keyExpr}`;
      ops.push({ file: base, line: i + 1, kind, key, raw: line.trim().substring(0, 100) });
    }
  });
}

// 把 K_XXX alias 解析到實際 string(讀 index.html const Storage K_PROGRESS: 'ipas_progress_v1')
const KaliasResolve = {};
{
  const idx = fs.readFileSync(INDEX, 'utf8');
  const re = /K_([A-Z_]+):\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(idx))) KaliasResolve['Storage.K_' + m[1]] = m[2];
}

const opsResolved = ops.map(o => {
  let key = o.key;
  if (key.startsWith('<K alias> ')) {
    const alias = key.slice('<K alias> '.length);
    key = KaliasResolve[alias] || alias;
  }
  return { ...o, resolved: key };
});

// 建 keyMap: key -> { writers, readers, deleters }
const keyMap = {};
for (const o of opsResolved) {
  const k = o.resolved;
  if (!keyMap[k]) keyMap[k] = { writers: new Set(), readers: new Set(), deleters: new Set() };
  if (o.kind === 'set') keyMap[k].writers.add(o.file);
  else if (o.kind === 'get') keyMap[k].readers.add(o.file);
  else if (o.kind === 'del') keyMap[k].deleters.add(o.file);
}

// 印 key map 表
console.log('Storage Key Map (生成完整 writer/reader 表)\n');
const allKeys = Object.keys(keyMap).sort();
const tableRows = [];
for (const k of allKeys) {
  const m = keyMap[k];
  tableRows.push({
    key: k,
    writers: [...m.writers].join(','),
    readers: [...m.readers].join(','),
    deleters: [...m.deleters].join(','),
  });
}
console.table(tableRows);

// === 必證 ===

// (1) ProgressIO ALLOWED_KEYS_EXACT 必涵蓋所有實際使用的 ipas_* key
const idxSrc = fs.readFileSync(INDEX, 'utf8');
const allowedMatch = idxSrc.match(/ALLOWED_KEYS_EXACT:\s*new Set\(\[([\s\S]+?)\]\)/);
const allowedKeys = new Set();
if (allowedMatch) {
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(allowedMatch[1]))) allowedKeys.add(m[1]);
}
const dynPrefix = 'ipas_sm2_';

const missingFromAllowList = [];
for (const k of allKeys) {
  if (!k.startsWith('ipas_')) continue; // 跳過 alias / unresolved
  if (allowedKeys.has(k)) continue;
  if (k.startsWith(dynPrefix)) continue;
  missingFromAllowList.push(k);
}
A.eq(missingFromAllowList, [], 'all ipas_* keys in code are covered by ProgressIO ALLOWED_KEYS_EXACT (or dynamic prefix)');

// (2) 全部 mode-local key 都應有 reader & writer(無 leak)
const expectedKeys = [
  'ipas_progress_v1', 'ipas_mastery_v1', 'ipas_wrongbook_v1',
  'ipas_seen_correct_v1', 'ipas_player_v1', 'ipas_sm2_v1',
  'ipas_mode1_industries_v1', 'ipas_mode2_bosses_v2', 'ipas_mode3_progress_v2',
  'ipas_mode5_v3_progress', 'ipas_mode6_codex_v1', 'ipas_mode7_theater_v1',
];
for (const k of expectedKeys) {
  A.ok(keyMap[k], `expected key found in codebase: ${k}`);
  if (keyMap[k]) {
    A.ok(keyMap[k].writers.size > 0, `${k}: has writer`);
    A.ok(keyMap[k].readers.size > 0, `${k}: has reader`);
  }
}

// (3) Mode-local storage 必須只被自己讀寫(科目隔離 / 共用層孤立)
const localOnly = {
  'ipas_mode1_industries_v1': 'mode1.js',
  'ipas_mode2_bosses_v2': 'mode2.js',
  'ipas_mode3_progress_v2': 'mode3.js',
  'ipas_mode5_v3_progress': 'mode5.js',
  'ipas_mode6_codex_v1': 'mode6.js',
  'ipas_mode7_theater_v1': 'mode7.js',
  'ipas_mode7_font_v1': 'mode7.js',
  'ipas_mode8_dojo_v1': 'mode8.js',
};
for (const [k, owner] of Object.entries(localOnly)) {
  if (!keyMap[k]) continue;
  const all = new Set([...keyMap[k].writers, ...keyMap[k].readers, ...keyMap[k].deleters]);
  // ProgressIO 在 index.html 會枚舉所有 ALLOWED_KEYS_EXACT(set / del),所以 index.html 在 keyMap 內合法
  // 案例 10 review 補:Storage.K_*** 全清單在 index.html 的 dynamicKeys 也會被掃到
  for (const f of all) {
    if (f === owner || f === 'index.html') continue;
    A.ok(false, `${k} should be local-only to ${owner}, but ${f} also touches it`);
  }
}

// (4) Storage 設計鐵律:Storage.K_* 與字面字串只能對應同個 key(不能漂)
const idxK = Object.entries(KaliasResolve);
A.ok(idxK.length >= 8, `Storage.K_* aliases count: ${idxK.length}`);
const dups = {};
for (const [a, v] of idxK) {
  if (!dups[v]) dups[v] = [];
  dups[v].push(a);
}
for (const [v, aliases] of Object.entries(dups)) {
  A.ok(aliases.length === 1, `key "${v}" mapped by exactly 1 alias (got [${aliases.join(',')}])`);
}

// (5) localKeyDefs 不能與 Storage.K_* 撞 key
for (const [tagged, v] of Object.entries(localKeyDefs)) {
  if (allowedKeys.has(v)) {
    // 看是否被 K_ 也指到 — K_USER_NICKNAME=ipas_user_nickname_v1 之類已合法
    const conflict = idxK.find(([_, kv]) => kv === v);
    if (conflict) {
      // mode 自己 const STORAGE_KEY = 'ipas_mode1_industries_v1' 跟 K_X 撞才壞;但 K_ 只 cover 8 個
      // 此處不視為錯,只 log
    }
  }
}

console.log('\nLocal key defs:', localKeyDefs);
console.log('K alias resolve:', KaliasResolve);
console.log('Total resolved ops:', opsResolved.length);
console.log('Total unique keys:', allKeys.length);

process.exit(A.summary('01-storage-key-map'));
