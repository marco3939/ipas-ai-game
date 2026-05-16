# Mode × Subject 2 (L22) Integration Audit

> Audit timestamp: 2026-05-16
> Auditor: read-only investigation agent
> Scope: 8 modes + KB whitelist + L22 question file inventory
> Ground truth: file contents read via Read tool + format counts via PowerShell aggregation (260 L22 questions, all subject=2, formats ∈ {single_choice, single_choice_scenario, calculation, scenario})

---

## Summary

| Mode | L22 status | Severity | Why |
|---|---|---|---|
| Mode 1 BOSS | Partial (only via keyword match) | **medium** | `pickQuestionsForBoss` keyword pool catches L22 industry-scenario stems (~250/260 match at least one BOSS keyword); fallback pool hard-coded to `q.subject === 1` so when keyword pool is light, L22 is excluded from filler |
| Mode 2 程式判讀 | Excluded (correct by design) | none | All 6 bosses are hand-curated `qids` (q_pa_*, q_pb_*, q_0024 etc.) — no L22 questions are `code_reading`/visualization format anyway |
| Mode 3 Pipeline | Excluded (correct by design) | none | Only `format === 'sequence'` qualifies; zero L22 sequence questions exist |
| Mode 4 易混淆 | Excluded (correct by design) | none | Only `format === 'matching'` qualifies; zero L22 matching questions exist |
| Mode 5 弱點獵人 | Included automatically | none | `liveNodeSet = new Set(QUESTIONS.map(q => q.node_id))` is subject-agnostic; L22 nodes will appear once user has L22 wrong/low-mastery records |
| Mode 6 Codex | **Partial — cards visible but blank** | **HIGH** | Subject filter dropdown was patched (line 218 already maps L22*→subject 2). But `_loadCodexData` (line 69-74) only fetches `nodes-subject-{1,3}{,-extended}.json` — never loads any `nodes-subject-2*.json` files. 79 L22 cards show `(此節點 kb 詳情尚未收錄)` placeholder. summary / key_points / common_misconceptions / explanation_hooks are all hidden for every L22 card. |
| Mode 7 考古題模考劇場 | **Almost entirely excluded** | **CRITICAL** | (a) SCOPE_OPTIONS has no `s2` choice; (b) `_buildPool` filters only on L21/L23 prefixes; (c) `_updatePoolStats` only counts subjects 1 and 3; (d) `_computeResult` byCategory only tracks L21/L23/other (L22 falls in "other"); (e) NPC `match()` rules cover L21*/L23* knowledge codes only — no NPC ever matches L22*. Theater mocks 5/23 real exam which has 3 subjects; current state mocks at most 2. |
| Mode 8 Code Trace | Excluded (correct by design) | none | `format === 'code_trace'` filter; zero L22 code_trace questions exist (only 5 hand-authored q_m8_*) |

**Critical/High findings: Mode 6 (HIGH) + Mode 7 (CRITICAL).**
**Medium findings: Mode 1 (filler-pool blind to L22).**
**By design / not bugs: Modes 2, 3, 4, 5, 8 (subject 2 is not pedagogically eligible for these mode mechanics).**

---

## Per-Mode findings

### Mode 1 BOSS (顧問實驗室)

**Filter pattern** (`src/modes/mode1.js` line 109-124):
```js
function pickQuestionsForBoss(boss, n = BOSS_QUESTIONS_PER_BATTLE) {
  const matched = QUESTIONS.filter(q => {
    const text = (q.stem || '') + ' ' + (q.tags || []).join(' ');
    return boss.keywords.some(k => text.includes(k));
  });
  let pool = [...new Set(matched)];
  const VARIATION_FLOOR = n * 2;
  if (pool.length < VARIATION_FLOOR) {
    const general = QUESTIONS.filter(q => q.subject === 1 && !pool.includes(q));  // ← line 119
    pool = [...pool, ...RNG.pickN(general, Math.max(0, VARIATION_FLOOR - pool.length))];
  }
  return RNG.pickN(pool, Math.min(n, pool.length));
}
```

**L22 status**: Partial — L22 industry-scenario questions WILL be picked when their `stem`/`tags` contain BOSS-specific keywords. PowerShell keyword scan against 260 L22 questions returned:
- energy keywords: 39 hits
- medical: 36
- ecommerce: 31
- logistics: 29
- manufacturing: 28
- finance: 27
- media: 20
- autonomous: 19
- telecom: 11
- education: 11
- smartcity: 6
- legal: 1

So Mode 1 already pulls L22 questions for most BOSSes. **However, the filler pool at line 119 is hard-coded to `q.subject === 1`** — when the keyword pool is undersized (`< 2n = 40`), only subject-1 questions are added to reach VARIATION_FLOOR. L22 questions are never used as filler even though they would be on-theme.

**Should include L22?**: YES. BOSSes are industry/business-domain scenarios; L22 大數據 includes data engineering, data pipelines, big data ML, governance, privacy — all directly applicable to business AI consulting scenarios (the BOSS narrative). The keyword filter already proves the overlap.

**Suggested fix**: Replace `q.subject === 1` with `(q.subject === 1 || q.subject === 2)` to make filler pool include both subjects. (Subject 3 is intentionally excluded because Mode 1 is "consultant" narrative, not pure ML programming theory.)

**Severity**: medium — Mode 1 still mostly works because keyword matching is generous; impact is occasional understocked pools for niche BOSSes (telecom/education/smartcity/legal).

---

### Mode 2 程式判讀 (Bug 獵人 RPG)

**Filter pattern** (`src/modes/mode2.js` line 85-93):
```js
function pickQuestionsForBoss(boss) {
  const list = [];
  for (const id of boss.qids) {
    const q = QUESTIONS.find(x => x.id === id);
    if (q) list.push(q);
  }
  return RNG.shuffle(list);
}
```

`BOSSES[].qids` is hand-curated (lines 12-82): all entries are q_pa_*, q_pb_*, q_0024, q_0029. No L22 question IDs.

**L22 status**: Excluded.

**Should include L22?**: NO. Mode 2 theme is "programming code interpretation" (NumPy/sklearn/PyTorch/pandas/visualization charts/probability code). L22 has no `code_reading` format questions. There is no programming code in L22.

**Suggested fix**: None required. Mode 2 is correctly subject-bounded.

**Severity**: low (no action needed).

---

### Mode 3 ML Pipeline 拼圖

**Filter pattern** (`src/modes/mode3.js` line 176):
```js
const all = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).filter(q => q.format === 'sequence');
```

STAGE_META (lines 12-22) hard-codes 4 stage IDs: q_pc_seq_001..004.

**L22 status**: Excluded.

**Should include L22?**: NO. Zero L22 questions have `format === 'sequence'`. Mode 3 is end-to-end ML pipeline ordering (data → preprocess → train → deploy); creating L22 sequence questions would require new authored content, out of audit scope.

**Suggested fix**: None required. (Future: if 5/23 exam reveals subject 2 has its own pipeline ordering questions, author L22 sequence questions and add STAGE_META entries — but that's a content-creation task, not a code fix.)

**Severity**: none.

---

### Mode 4 易混淆配對戰

**Filter pattern** (`src/modes/mode4.js` line 18):
```js
const matches = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).filter(q => q.format === 'matching');
```

**L22 status**: Excluded.

**Should include L22?**: NO. Zero L22 questions have `format === 'matching'`. Mode 4 pairs concepts ↔ definitions; L22 questions are all `single_choice` with no matching pairs.

**Suggested fix**: None required. (Future: if user wants L22 易混淆配對 — e.g. "MCAR vs MAR vs MNAR" or "Bagging vs Boosting vs Stacking" — that's a content authoring task.)

**Severity**: none.

---

### Mode 5 弱點獵人

**Filter pattern** (`src/modes/mode5.js` lines 52, 95-106):
```js
const liveNodeSet = new Set(QUESTIONS.map(q => q.node_id).filter(Boolean));
// ...
function pickQuestionsForNode(nodeId, baseCount = 5) {
  const direct = QUESTIONS.filter(q => q.node_id === nodeId);
  // ...
}
```

**L22 status**: Included automatically (subject-agnostic node iteration).

**Should include L22?**: YES — and it already does, transparently. Once user accumulates L22 wrong answers (via Mode 1 keyword match, Mode 6 challenge, or Mode 7 once Mode 7 is fixed), L22 nodes will appear in BOSS candidate list per Step 1/2 (Wrongbook + Mastery). New-player fallback (Step 3) randomly picks from `liveNodeSet` which includes L22 nodes.

**Suggested fix**: None required.

**Severity**: none.

---

### Mode 6 卡牌圖鑑 (Codex)

**Filter pattern A — subject dropdown** (`src/modes/mode6.js` line 134):
```js
const prefix = filters.subject === '1' ? 'L21' : filters.subject === '2' ? 'L22' : filters.subject === '3' ? 'L23' : null;
```

**Filter pattern B — card list source** (line 32-67):
The card list is built from `scripts/kb-allowed-nodes.json`, which already contains all 79 L22 nodes (verified: L22101 x7, L22102 x6, L22103 x6, L22201 x6, L22202 x6, L22203 x6, L22301 x6, L22302 x6, L22303 x6, L22401 x6, L22402 x6, L22403 x6, L22404 x6 = 7 + 12×6 = 79 nodes — confirmed by reading file).

**Filter pattern C — kb detail fetch** (line 68-74):
```js
const kbFiles = [
  '../kb/nodes-subject-1.json',
  '../kb/nodes-subject-3.json',
  '../kb/nodes-subject-1-extended.json',
  '../kb/nodes-subject-3-extended.json'
];
```

**L22 status**: cards listed but content blank.
- L22 cards appear in grid (via whitelist).
- Tier computation works (Mastery + Wrongbook + Codex counters are nodeId-keyed, subject-agnostic).
- Filter dropdown correctly maps subject=2 → L22*.
- **BUT** `_kbIndex` never receives any L22 node data because the fetch list omits `kb/nodes-subject-2*.json` files. Result: when user opens any L22 card, `_renderCard` shows preview only if `kbNode && kbNode.summary` (line 311) — which is always false for L22. `openCard` shows the fallback string "(此節點 kb 詳情尚未收錄,僅顯示白名單標題)" (line 400).

**Should include L22?**: YES. KB files exist and are populated (verified `kb/nodes-subject-2.json` has full schema with summary/key_points/common_misconceptions/explanation_hooks/variation_seeds per node).

**Suggested fix** (Fixer):
```js
const kbFiles = [
  '../kb/nodes-subject-1.json',
  '../kb/nodes-subject-2.json',           // ADD
  '../kb/nodes-subject-2-stats.json',     // ADD
  '../kb/nodes-subject-2-data.json',      // ADD
  '../kb/nodes-subject-2-bdapp.json',     // ADD
  '../kb/nodes-subject-2-bdml.json',      // ADD
  '../kb/nodes-subject-3.json',
  '../kb/nodes-subject-1-extended.json',
  '../kb/nodes-subject-3-extended.json'
];
```

Fixer MUST verify each subject-2 KB file actually exists (`kb/nodes-subject-2.json` and four `nodes-subject-2-*.json` files were confirmed via Glob). Any non-existent file added to fetch list will silently 404 → `{ nodes: [] }` (line 77 fallback) — no breakage, just less coverage.

**Severity**: HIGH. Codex is the pre-study (預習) entry point; for subject 2 it shows 79 empty cards, which contradicts the spec promise of "Codex = read-before-write learning gate". Users cannot pre-study L22 via Mode 6.

---

### Mode 7 考古題模考劇場 (Theater)

This is the most-affected mode and the most severe finding.

**Filter pattern A — SCOPE_OPTIONS** (`src/modes/mode7.js` lines 34-39):
```js
const SCOPE_OPTIONS = [
  { key: 'all',  label: '🌐 全範圍混合', desc: '科一 + 科三 + 邊界,依現況比例(50:50:0)' },
  { key: 's1',   label: '📚 科一 only',  desc: '人工智慧技術應用與規劃(L21*)' },
  { key: 's3',   label: '🔧 科三 only',  desc: '機器學習技術與應用(L23*)' },
  { key: 'weak', label: '🎯 弱點優先',    desc: '從錯題本 + 熟練度低的節點抽題' }
];
```
No `s2` option. Even the `all` label literally says "科一 + 科三 + 邊界,依現況比例(50:50:0)".

**Filter pattern B — _buildPool** (lines 282-310):
```js
if (cfg.scope === 's1') {
  pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L21'));
} else if (cfg.scope === 's3') {
  pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L23'));
} else if (cfg.scope === 'weak') {
  // ... subject-agnostic via Wrongbook/Mastery
}
// 'all' 不額外篩選  ← this is the only path that includes L22 (no explicit filter)
```

Default behavior at `all` happens to include L22 in the pool because no positive-filter excludes it. Reading the `all` description's claim "50:50:0" is now numerically false (actually 27:45:28 with L22 added) — and even though pool DOES include L22, downstream NPC matching and category reporting still ignore subject 2.

**Filter pattern C — _updatePoolStats** (lines 230-242):
```js
const s1 = pool.filter(q => q.subject === 1).length;
const s3 = pool.filter(q => q.subject === 3).length;
el.innerHTML = `候選池 ${pool.length} 題(科一 ${s1} / 科三 ${s3})— 將抽 ${cfg.qcount} 題`;
```
Subject 2 invisible to user. Pool stats lie.

**Filter pattern D — NPC `match` rules** (lines 58-105):
```js
match: (q) => q.format === 'code_reading' || ['L23202', 'L23102', 'L23302'].includes(q.knowledge_code)   // engineer
match: (q) => ['calculation', 'table_reading', 'sequence'].includes(q.format) || ['L23303', 'L23304', 'L23301'].includes(q.knowledge_code)   // scientist
match: (q) => ['L21101', 'L21103', 'L21102', 'L21104'].includes(q.knowledge_code)   // transformer
match: (q) => ['L21203', 'L23401', 'L23402', 'L21204'].includes(q.knowledge_code)   // ethics
match: (q) => ['L21201', 'L21202', 'L21301', 'L21302'].includes(q.knowledge_code)   // consultant
```
NO NPC has L22* in its match list. The `scientist` NPC matches `format === 'calculation'` which captures the 16 L22 calculation questions, but the other 244 L22 questions (single_choice, single_choice_scenario, scenario) match NO NPC and fall to the `unmatched` bucket distributed by min-length (lines 346-352).

**Filter pattern E — _computeResult byCategory** (lines 723-733):
```js
const byCategory = { L21: {correct:0,total:0}, L23: {correct:0,total:0}, other: {correct:0,total:0} };
for (let i = 0; i < totalAttempted; i++) {
  const q = s.lineup[i].q;
  const cat = q.knowledge_code && q.knowledge_code.startsWith('L21') ? 'L21' :
              q.knowledge_code && q.knowledge_code.startsWith('L23') ? 'L23' : 'other';
  // ...
}
```
L22 questions land in `other` (line 728-729 prefix check). Result screen has 3 cards labeled 科一 / 科三 / 其他·邊界 — subject 2 is never first-class.

**L22 status**: Pool inclusion is accidental (only via `all` no-op path). NPC matching and category reporting treat L22 as out-of-scope. User CANNOT explicitly target subject 2 via UI.

**Should include L22?**: **YES, CRITICALLY**. The Mode 7 spec docstring (line 5) says "對標 2026-05-23 真考臨場壓力訓練". The 2026-05-23 IPAS exam has 3 subjects (科一/科二/科三). Excluding subject 2 from a "真考臨場壓力" mode is a top-priority defect.

**Suggested fix** (Fixer):

1. **SCOPE_OPTIONS** — add `s2` option, update `all` description:
```js
const SCOPE_OPTIONS = [
  { key: 'all',  label: '🌐 全範圍混合', desc: '科一 + 科二 + 科三,依現況比例' },
  { key: 's1',   label: '📚 科一 only',  desc: '人工智慧技術應用與規劃(L21*)' },
  { key: 's2',   label: '📊 科二 only',  desc: '大數據分析與應用(L22*)' },
  { key: 's3',   label: '🔧 科三 only',  desc: '機器學習技術與應用(L23*)' },
  { key: 'weak', label: '🎯 弱點優先',    desc: '從錯題本 + 熟練度低的節點抽題' }
];
```

2. **_buildPool** — add s2 branch (line 287):
```js
} else if (cfg.scope === 's2') {
  pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L22'));
} else if (cfg.scope === 's3') {
  // ...
```

3. **_updatePoolStats** — add s2 count (line 239-240):
```js
const s1 = pool.filter(q => q.subject === 1).length;
const s2 = pool.filter(q => q.subject === 2).length;
const s3 = pool.filter(q => q.subject === 3).length;
el.innerHTML = `候選池 ${pool.length} 題(科一 ${s1} / 科二 ${s2} / 科三 ${s3})— 將抽 ${cfg.qcount} 題`;
```

4. **NPC `match` rules** — broaden two NPCs to cover L22:
   - `scientist` (數據科學家): add L22101/L22102/L22103 (敘述統計 / 機率分佈 / 假設檢定) — natural fit.
   - `consultant` (顧問): add L22201/L22202/L22203/L22301/L22302/L22303 (資料工程 / 大數據分析方法 / 視覺化) — natural fit.
   - `ethics` (倫理委員): add L22404 (PDPA/GDPR/差分隱私/聯邦學習) — natural fit.
   - L22401/L22402/L22403 (大數據與 ML/鑑別式 AI/生成式 AI) — distribute to `transformer` or fall to unmatched bucket; consultant covers business framing.

   Suggested concrete update:
```js
// scientist
match: (q) => ['calculation', 'table_reading', 'sequence'].includes(q.format) ||
              ['L23303', 'L23304', 'L23301'].includes(q.knowledge_code) ||
              ['L22101', 'L22102', 'L22103'].includes(q.knowledge_code)

// consultant
match: (q) => ['L21201', 'L21202', 'L21301', 'L21302'].includes(q.knowledge_code) ||
              ['L22201', 'L22202', 'L22203', 'L22301', 'L22302', 'L22303',
               'L22401', 'L22402', 'L22403'].includes(q.knowledge_code)

// ethics
match: (q) => ['L21203', 'L23401', 'L23402', 'L21204'].includes(q.knowledge_code) ||
              ['L22404'].includes(q.knowledge_code)
```

5. **_computeResult byCategory** — add L22 bucket (line 723):
```js
const byCategory = { L21: {correct:0,total:0}, L22: {correct:0,total:0}, L23: {correct:0,total:0}, other: {correct:0,total:0} };
// ... and prefix check
const cat = q.knowledge_code && q.knowledge_code.startsWith('L21') ? 'L21' :
            q.knowledge_code && q.knowledge_code.startsWith('L22') ? 'L22' :
            q.knowledge_code && q.knowledge_code.startsWith('L23') ? 'L23' : 'other';
```
And `_renderResult` `catBlock` (line 792-806):
```js
${['L21', 'L22', 'L23', 'other'].map(c => {
  const data = result.byCategory[c];
  const label = c === 'L21' ? '科一(L21)' : c === 'L22' ? '科二(L22)' : c === 'L23' ? '科三(L23)' : '其他/邊界';
  // ...
```
And `_saveHistory` byCategory (lines 765-769):
```js
byCategory: {
  L21: result.byCategory.L21.total > 0 ? `${result.byCategory.L21.correct}/${result.byCategory.L21.total}` : '0/0',
  L22: result.byCategory.L22.total > 0 ? `${result.byCategory.L22.correct}/${result.byCategory.L22.total}` : '0/0',
  L23: result.byCategory.L23.total > 0 ? `${result.byCategory.L23.correct}/${result.byCategory.L23.total}` : '0/0',
  other: result.byCategory.other.total > 0 ? `${result.byCategory.other.correct}/${result.byCategory.other.total}` : '0/0'
}
```

**Severity**: CRITICAL. Theater is the headline 真考模擬 mode for the 5/23 exam.

---

### Mode 8 Code Trace 道場

**Filter pattern** (`src/modes/mode8.js` line 14):
```js
const pool = QUESTIONS.filter(function (q) { return q.format === 'code_trace'; });
```

Only `questions-mode8-trace.json` (5 hand-authored q_m8_*) has `code_trace` format. Zero L22 questions are `code_trace`.

**L22 status**: Excluded.

**Should include L22?**: NO. Mode 8 is line-by-line Python execution trace — a programming exercise. L22 is data engineering / big data concepts, not Python programs. Authoring L22 code_trace questions would be a content creation task and conceptually mismatched.

**Suggested fix**: None required.

**Severity**: none.

---

## KB whitelist (`scripts/kb-allowed-nodes.json`)

- **Includes L22 nodes? YES.** Verified by reading the file: 79 L22 nodes spanning L22101 (7) + L22102..L22404 (12 codes × 6 nodes = 72) = 79 nodes.
- audit-source-fidelity: L22 questions reference `n_L22xxx_xxx` nodeIds; whitelist contains them all. Source fidelity audit should NOT reject L22 questions.

The whitelist is **already L22-correct**. Mode 6 already sees all L22 cards in the grid; the gap is only the KB detail fetch.

---

## L22 question file inventory

13 batch files, 260 questions total, all `subject: 2`.

| File | Code | Q count | Sample stem (first 60 chars) |
|---|---|---|---|
| questions-batch-n9-subject2.json | L22101 | 20 | 某連鎖咖啡品牌調查全台 800 家門市『最受歡迎飲品種類』... |
| questions-batch-n10-L22102.json | L22102 | 20 | 某電商平台分析工程師需為下列四種變數選擇正確的分佈... |
| questions-batch-n11-L22103.json | L22103 | 20 | (假設檢定) |
| questions-batch-n12-L22201.json | L22201 | 20 | 某物流公司每日匯入車隊回傳的 GPS 軌跡 JSON、訂單 CSV... |
| questions-batch-n13-L22202.json | L22202 | 20 | (資料儲存與管理) |
| questions-batch-n14-L22203.json | L22203 | 20 | (資料處理技術與工具) |
| questions-batch-n15-L22301.json | L22301 | 20 | (統計學在大數據中的應用) |
| questions-batch-n16-L22302.json | L22302 | 20 | (常見的大數據分析方法) |
| questions-batch-n17-L22303.json | L22303 | 20 | (數據可視化工具) |
| questions-batch-n18-L22401.json | L22401 | 20 | (大數據與機器學習) |
| questions-batch-n19-L22402.json | L22402 | 20 | (大數據在鑑別式 AI 中的應用) |
| questions-batch-n20-L22403.json | L22403 | 20 | (大數據在生成式 AI 中的應用) |
| questions-batch-n21-L22404.json | L22404 | 20 | (大數據隱私保護、安全與合規) |

**Format distribution across all 260 L22 questions** (PowerShell ground truth):
- single_choice: 213
- single_choice_scenario: 22
- calculation: 16
- scenario: 9
- **code_reading / code_trace / matching / sequence / table_reading: 0**

**Global question pool ground truth** (loadQuestions reads 31 files → 595 questions):
- subject=1: 160, subject=2: 265, subject=3: 170 (subject=2 is 5 higher than L22-batch-file count of 260 — likely 5 boundary subject-2 questions exist in earlier files; not material to this audit)
- Mode 1 keyword scan: 250+ of 260 L22 questions match at least one BOSS keyword

---

## Recommended Fixer dispatch

Two fix tasks, in order of severity:

### Fix Task 1 (CRITICAL): Mode 7 Theater subject-2 integration

File: `src/modes/mode7.js`

| Line range | Change |
|---|---|
| 34-39 | Add `{ key: 's2', label: '📊 科二 only', desc: '大數據分析與應用(L22*)' }` after `s1`; update `all` description to "科一 + 科二 + 科三" |
| 58-105 | Update NPC `match` rules:<br>• scientist: add `['L22101','L22102','L22103'].includes(q.knowledge_code)` clause<br>• consultant: add `['L22201','L22202','L22203','L22301','L22302','L22303','L22401','L22402','L22403'].includes(q.knowledge_code)` clause<br>• ethics: add `['L22404'].includes(q.knowledge_code)` clause |
| 239-240 | Insert s2 count line + update template literal to display 科二 ${s2} |
| 286-290 | Insert `else if (cfg.scope === 's2') { pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L22')); }` between s1 and s3 branches |
| 723 | Change byCategory init to include `L22: {correct:0,total:0}` |
| 727-729 | Add L22 prefix check to `cat` ternary |
| 765-770 | Add L22 entry to history byCategory serialization |
| 794 | Change `['L21', 'L23', 'other']` → `['L21', 'L22', 'L23', 'other']` and add L22 label clause |

Severity rationale: Theater is the only mode that explicitly mocks 5/23 真考 cross-subject exam pressure. Excluding L22 makes Theater results misleading for exam-readiness assessment.

### Fix Task 2 (HIGH): Mode 6 Codex KB detail fetch

File: `src/modes/mode6.js`

| Line range | Change |
|---|---|
| 69-74 | Add the 5 subject-2 KB files to the `kbFiles` array:<br>• `'../kb/nodes-subject-2.json'`<br>• `'../kb/nodes-subject-2-stats.json'`<br>• `'../kb/nodes-subject-2-data.json'`<br>• `'../kb/nodes-subject-2-bdapp.json'`<br>• `'../kb/nodes-subject-2-bdml.json'` |

Fixer MUST verify each file exists (all 5 confirmed present via Glob at `kb/nodes-subject-2*.json`). Order does not matter — `idx[n.node_id] = n` deduplicates by node_id; later files override earlier ones.

Severity rationale: Mode 6 Codex is the 預習 (pre-study) entry point. For subject 2, all 79 cards currently display "(此節點 kb 詳情尚未收錄)" placeholder, blocking summary / key_points / common_misconceptions / explanation_hooks. With this 5-line fix, all L22 content becomes browsable.

### Fix Task 3 (medium, optional): Mode 1 filler pool

File: `src/modes/mode1.js`

| Line range | Change |
|---|---|
| 119 | `const general = QUESTIONS.filter(q => q.subject === 1 && !pool.includes(q));`<br>→<br>`const general = QUESTIONS.filter(q => (q.subject === 1 || q.subject === 2) && !pool.includes(q));` |

Severity rationale: Marginal improvement; Mode 1's keyword pool already catches 250/260 L22 questions, so this fix only matters for the rare under-stocked BOSS battles (telecom/legal). Defer until other fixes are landed and Mode 1 actually shows variation-floor toast in practice.

### Out-of-scope (do NOT dispatch fixes)

- Mode 2: theme bounded to programming code reading. No L22 question has `code_reading` format. No fix.
- Mode 3: theme bounded to ML pipeline sequencing. No L22 question has `sequence` format. No fix.
- Mode 4: theme bounded to concept-definition pairs. No L22 question has `matching` format. No fix.
- Mode 5: already includes L22 nodes via subject-agnostic node iteration. No fix.
- Mode 8: theme bounded to code execution trace. No L22 question has `code_trace` format. No fix.
- Confusion matrix component: scoped to L23303 by design (4-node whitelist). No fix.
- SM-2 review queue: subject-agnostic. No fix.

---

## Confidence

| Finding | Confidence |
|---|---|
| Mode 7 SCOPE_OPTIONS missing s2 | 100% (lines 34-39 directly read) |
| Mode 7 _buildPool missing L22 branch | 100% (lines 287-290 directly read) |
| Mode 7 NPC match rules exclude L22 | 100% (all 5 NPC match functions directly read; no L22 string anywhere in them) |
| Mode 7 byCategory missing L22 | 100% (lines 723 and 727-729 directly read) |
| Mode 6 kb fetch missing subject-2 files | 100% (lines 69-74 directly read; 5 subject-2 KB files confirmed via Glob) |
| Mode 6 already filter-includes L22* | 100% (line 134 directly read; was already patched) |
| Mode 1 filler pool only subject=1 | 100% (line 119 directly read) |
| L22 question count = 260 | 100% (PowerShell aggregate; ground truth) |
| L22 has zero code_reading/code_trace/matching/sequence | 100% (PowerShell grep across all 13 L22 files) |
| Mode 5 includes L22 automatically | 95% (lines 52 + 95 directly read; relies on user accumulating L22 wrong/low-mastery — verified path is subject-agnostic; new-player fallback also includes L22) |
| Mode 8 cannot include L22 by content design | 95% (filter is format-based; L22 has zero code_trace; semantic mismatch confirmed) |
| Modes 2/3/4 cannot include L22 by content design | 95% (filter is format-based; L22 has zero matching code_reading sequence matching) |

---

## Notes for orchestrator

- All fix tasks are local edits to single files, no cross-file contract breakage expected.
- Fixer should run `node -c src/modes/mode7.js` and `node -c src/modes/mode6.js` after edits (syntax check).
- Fixer should NOT modify any question JSON file, KB JSON file, or kb-allowed-nodes.json (already correct).
- Validator should grep for `subject === 1` / `L21` / `L23` patterns to spot any other subject-specific hard-coding the audit might have missed (mode2/3/4/8 designs are intentional, but if validator finds new subject hard-codes, escalate).
- Recommended Cross-Validation Mode: Mode B (batch fix per file + integration audit) since Mode 7 has ~7 distinct edit sites within one file. Validator must independently run a 30-question Theater mock with scope=s2 to confirm pool builds correctly.
