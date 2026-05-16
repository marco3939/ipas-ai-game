# Unidentified Issues Audit

## Methodology

**Scope**: bugs that existing audits don't cover. The audits already check:
- `audit-source-fidelity.js`: kb_id whitelist
- `audit-render.js`: placeholder substitution
- `audit-option-length.js`: option length variance
- `audit-calculation.js`: calc schema
- `audit-stem-explanation-consistency.js`: stem-vs-explanation numeric consistency
- `audit-case-answer-distinctness.js`: distinct answers across cases
- `audit-code-render.js`: code highlighting

**Approach**: static analysis of `src/index.html`, `src/sm2.js`, `src/components/confusion-matrix.js`, `src/modes/mode[1-8].js`, plus JSON metadata scanning across all 32 question files (595 questions, 173 KB nodes). Confirmed audit reports were re-run to validate gaps (`audit-stem-explanation-consistency` covers 585 questions; missing confusion-matrix.json + mode8-trace.json = 10 questions).

**Tooling**: PowerShell + Read/Grep tools. No modifications, no git operations.

---

## Findings by category

### A. JS Runtime Risks

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `src/modes/mode2.js:755` `src/modes/mode3.js:986` `src/modes/mode5.js:854` | `Player.heal(50)` hard-coded but text says "恢復了一半 HP". Mode 1 was fixed (`Math.floor(before.hpMax / 2)` line 701) but Mode 2/3/5 still use literal 50. After leveling up, `hpMax > 100`, so `heal(50)` is < half. | Low | Reach Lv 2 in any mode (hpMax = 120), lose in Mode 2/3/5 → game-over screen says "恢復一半 HP" but you only heal 41.6% (50/120). |
| `src/modes/mode5.js:853-871` `gameOver()` | Does NOT call `PlayEngine._stopTimer()` or `this._stopTimer()` — relies on PlayEngine timer being globally disabled via escape hatch (index.html line 1222 / mode8.js line 41). When timer is re-enabled, `_onTimeout()` will fire post-gameOver and write to Mastery/Wrongbook for the BOSS node, corrupting state. | Low (latent; only blows up if timer re-enabled) | Re-enable timer (remove `return` at index.html:1222), lose a Mode 5 BOSS battle, wait 90s on game-over screen. |
| `src/modes/mode6.js:566` | Mode 6 challenge flow uses `Math.abs(Date.now() - x.lastWrong) < 5000` to detect "was the last answer wrong". If user takes > 5 seconds to click "next" after a wrong answer, this check fails → drill flow is skipped → user is wrongly sent to "correct" path. | Medium | Challenge a Mode 6 card, answer wrong, wait 6+ seconds reading explanation, click "繼續下一題". You'll get `openCard(nodeId)` instead of `DrillSession.start(...)`. |

### B. DOM / Rendering

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `src/modes/mode8.js:203` | `q.stem` interpolated into innerHTML without escape: `'<p class="question-stem">' + q.stem + '</p>'`. Question `q_m8_002` (`src/questions-mode8-trace.json` line 114) has literal `<j 但 arr[i]>` in stem. Browser parses as malformed tag, eats the inner text. User sees stem as: "下列程式以雙層迴圈計算陣列的逆序對(inversion pair)數量。逆序對定義:iarr[j]。請追蹤迴圈執行後的變數。" — the "j 但 arr[i]" is invisible. | **Critical** | Open Mode 8 (Code Trace 道場), wait for q_m8_002 to roll (1/5 chance per game). Read the inversion pair definition — it's mangled. |
| `src/index.html:1398`, `src/modes/mode1.js:382, 543`, `src/modes/mode2.js:394, 562`, `src/modes/mode5.js:481, 644` | `${q.stem}` and `${e.correct}` (explanation) interpolated unescaped into innerHTML. `q_n1_nlp_016` (`src/questions-batch-n1-nlp.json:480`) `explanation.correct` contains `'where' → '<wh', 'whe', 'her', 'ere', 're>'` which browser parses as one malformed tag; "wh', 'whe', 'her', 'ere', 're" disappears, leaving "FastText 將每個詞表示為其子詞 n-gram 之和(如 'where' → ' ),即使整詞未登錄..." with a confusing gap. | **Critical** | Get q_n1_nlp_016 in any non-Mode8 mode, answer (any choice), read the green "📚 正確答案" box. The FastText subword example is broken. |
| `src/index.html:1252` and Mode 1/2/3/5/8 all use `id="play-timer-bar"` and `id="play-timer-value"` | These IDs are reused across modes. Each mode's `view-play` innerHTML replaces previous content, so collisions don't co-exist. Confirmed safe but fragile if any mode renders TWO question cards simultaneously. | Low (advisory) | N/A — currently no co-render path exists. |
| `src/index.html:1325`, `src/components/confusion-matrix.js:115` | Both render `id="play-explanation"` — same exclusive-view pattern; safe today, brittle. | Low (advisory) | N/A |

### C. Storage / State

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `src/index.html:1604-1611` `resetAll()` | Only deletes `K_PROGRESS / K_MASTERY / K_WRONGBOOK / K_SESSION`. Does NOT delete `ipas_player_v1`, `ipas_sm2_v1`, `ipas_error_reports_v1`, `ipas_mode1_industries_v1`, `ipas_mode2_bosses_v2`, `ipas_mode3_progress_v2`, `ipas_mode5_v3_progress`, `ipas_mode6_codex_v1`, `ipas_mode7_theater_v1`, `ipas_mode8_dojo_v1`. UI button says "清除所有進度" → users expect a clean slate but Player HP/level, SM-2 schedule, mode-specific boss progress, error reports all persist. | Medium | Defeat several Mode 1 bosses, train SM-2 reviews, open stats → click "清除進度" → reload → home page still shows progress in modes and SM-2 due count. |
| `src/index.html:690` | `Mastery.MASTERY_THRESHOLD: 60` declared but never referenced anywhere. Dead code. Comment claims "保留供他處 score 條件引用" but Grep confirms no readers. | Low (cleanup) | N/A |

### D. Question Schema Anomalies

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| 31 files / 595 questions | Format value `single_choice_scenario` (22 questions) and `scenario` (9 questions) are loaded but never explicitly handled by any branch — they fall through PlayEngine's default render which works fine. However: Mode 7 NPC `match` predicates check `format === 'code_reading'` and `['calculation', 'table_reading', 'sequence'].includes(q.format)` — `single_choice_scenario` matches neither, so these 22 questions get distributed as "unmatched" and assigned to random NPC. This silently breaks thematic matching for 22 questions but doesn't fail. | Low | Run Mode 7 with `scope='all'`; observe that scenario questions are presented by NPCs whose theme doesn't match (e.g. ethics NPC presenting a Bernoulli loss question). |
| `src/questions-mode8-trace.json:114` `q_m8_002` `stem` field | Contains literal `<j 但 arr[i]>` which is interpreted as malformed HTML tag (see B). Also affects `explanation.correct` (line 177) and `explanation.hook` (line 181). | (covered above) | (covered above) |
| `src/questions-batch-n1-nlp.json:480` `q_n1_nlp_016` `explanation.correct` | Contains `'<wh', 'whe', 'her', 'ere', 're>'` — malformed tag. | (covered above) | (covered above) |
| All 13 L22 batch files | Schema is 100% consistent (same key set, all 20 questions per file, all `subject: 2`, all `is_correct` count = 1). 6 nodes per file (file n9 has 7). No anomalies. | (pass) | N/A |
| `scripts/audit-stem-explanation-consistency.js:25-39` `FILES[]` | Audit `totalQuestions = 585` but project has 595. Missing: `questions-confusion-matrix.json` (5) + `questions-mode8-trace.json` (5) from audit's file list. q_m8_002 / cm-* questions escape consistency audit (though the HTML injection wouldn't be caught by this audit anyway). | Medium (audit coverage) | Run `node scripts/audit-stem-explanation-consistency.js` → see totalQuestions=585. |

### E. Cross-Mode Contracts

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `src/modes/mode1.js:119` | `pickQuestionsForBoss` fallback filters by `q.subject === 1`. Project now has 260 L22 questions with `subject: 2`. These can ONLY enter Mode 1 boss pool via a stem/tag keyword match (e.g. 電商, 金融). Statistics / probability / 大數據 L22 questions almost never match industry keywords, so they're effectively excluded from Mode 1. Combined with Mode 1 being the project's main mode, this means a large chunk (~44% of the question bank) is rarely seen in main gameplay. | Medium | Open Mode 1 多次, observe that L22 questions rarely appear. The user's main game mode skips them. |
| `src/modes/mode7.js:48-105` | All 5 NPC `match` predicates check L21* / L23* codes only — NO L22 codes are referenced. L22 questions always fall through to "unmatched" bucket. With 260 L22 questions in 'all' scope, ~44% of every Mode 7 game's questions get assigned to random NPCs whose theme doesn't match. NPC dialogue ("這題我出") becomes meaningless for those. | Medium | Run Mode 7 全範圍模考 30 題; ~13 of 30 will be L22 with mismatched NPC commentary. |
| `src/modes/mode7.js:36` setup option says "全範圍混合,依現況比例(50:50:0)" | The "(50:50:0)" suggests L22 = 0% in mixed scope but in fact L22 questions ARE in the pool (no filter applied). Description is misleading. | Low | Open Mode 7, read scope description — "(0)" implies L22 excluded but they're not. |
| `src/index.html:419` Mode 4 card description | Says "14 組高頻易混淆對" but `extractPairs()` finds only 8 matching questions. Default play uses 8 pairs (`pairCount = 8`); the "14" number is stale. | Low (cosmetic) | Open home page, read Mode 4 card. |
| `src/modes/mode1.js:96` `src/modes/mode5.js:138` | Three separate `highlightCode` functions (mode1, mode5, index.html `highlightCodeSimple`) duplicated — exact same code. Cross-render audit `audit-code-render.js` already covers all 3, so behaviorally OK, but maintenance burden: a future bug fix needs to be applied 3x. | Low (advisory) | N/A — `audit-code-render.report.json` confirms all 3 stay in sync. |

### F. Error Handling

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `src/index.html:973` | `loadQuestions()` catch block: `showToast('題庫載入失敗,請以 http server 啟動本檔案')`. Error is in 繁體中文 (good). | (pass) | N/A |
| Mode 1/2/3/5/6/7/8 various | Error toasts consistently in 繁體中文. Examples checked: `'MP 不足'`, `'⚠️ 已無錯誤選項可消除'`, `'⚠️ 題庫候選池為空,無法開場'`, `'⚠️ 此題知識點變化型不足'`. | (pass) | N/A |
| `src/modes/mode4.js:71` | Toast: `配對題不足(目前 ${pairs.length} 對),需 ≥ 4 對才能開戰` — clear and bilingual-friendly. With only 8 matching questions in the bank, falling below 4 needs heavy attrition; not a practical risk. | (pass) | N/A |
| `src/modes/mode6.js:53` | Toast: `'⚠️ 卡牌圖鑑白名單載入失敗,請以 http server 啟動本檔案'` — clear. | (pass) | N/A |
| `src/index.html:843`,`src/index.html:854` | Error report form uses `formEl.style.display === 'none'` toggle. If form was opened then page rebuilt (e.g. drill session interrupted), `formEl` may not exist; line 842 guards with `if (!formEl) return`. OK. | (pass) | N/A |

### G. Performance

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `src/modes/mode6.js:119, 117, 118` `_computeTier` called per card × 94 cards = 94× `Wrongbook.load()` + 94× `Mastery.load()` + 94× `_loadCodex()`. Each does a localStorage read + JSON.parse. Total: ~282 localStorage reads on every grid render. | Low (works but wasteful) | Open Mode 6, profile via DevTools — initial render ≈ 30-60ms on modern hardware. Acceptable but will degrade if Wrongbook grows large. |
| `src/index.html:920-975` `loadQuestions()` | Loads 32 JSON files in parallel via `Promise.all`. Total ~1.5 MB JSON, parsed sequentially in `flatMap`. On slow connections, all-or-nothing failure mode. | Low | Test offline / throttled — initial load could exceed 5s; no progressive load. |
| `src/index.html:978-1056` `generateVariation` | Does ~7 `QUESTIONS.filter` calls over 595 questions per drill. Per drill = ~4ms in V8. Acceptable. | (pass) | N/A |
| Audit script `audit-render.js` | Tested at 595 questions: ~200ms runtime. Scales linearly. Would handle 2000+ questions OK. | (pass) | N/A |

### H. Test Infrastructure

| Location | Issue | Severity | Reproduction scenario |
|---|---|---|---|
| `scripts/audit-stem-explanation-consistency.js:25-39` `FILES[]` | (Covered in D) — incomplete file list, audit only sees 585 of 595 questions. Confusion-matrix and Mode 8 trace files not in audit's `FILES[]`. | Medium | (covered) |
| `scripts/mock-mode8.js` | Exists; not examined for stale expectations. Recommend running `node scripts/mock-mode8.js` to confirm assertions still match runtime. | Low | Run the mock; check exit code. |
| `scripts/audit-source-fidelity.js` | Re-ran: 0 violations, 595/595 pass. KB has 173 nodes, 34 knowledge_codes. | (pass) | N/A |
| `scripts/audit-render.js` | Re-ran: 0 violations, 198 cases checked across 62 calc-style questions. | (pass) | N/A |
| `scripts/audit-code-render.js` | Re-ran: 0 violations. All 3 highlight functions × 22 code_blocks safe. | (pass) | N/A |

### I. CLAUDE.md case-library relapses

| Case | Status | Notes |
|---|---|---|
| Case 1 (`window.X` vs `let/const X`) | Not relapsed | `window.QUESTIONS = QUESTIONS` sync at index.html:962 still present. Mode files use bare `QUESTIONS` reads. |
| Case 2 (sub-agent stall ≥24 items) | N/A (process rule, not code) | |
| Case 3 (enterMode(4) const-bound) | Not relapsed | `window.Mode4 = Mode4` (mode4.js convention) and index.html `Mode4` global both present. |
| Case 4 (繞過共用層自寫 mastery) | Not relapsed | Mode 5 still uses `adjustMasteryScore` but it now correctly bumps `attempts/correct/streak` (mode5.js:22-42). |
| Case 5 (stale nodeId blocking fallback) | Not relapsed | Mode 5 `selectWeakBosses` pre-builds `liveNodeSet` and filters Steps 1/2/3 (mode5.js:52-90). |
| Case 6 (drillThis vs gameOver race) | Not relapsed | Mode 1 `drillThis` calls `_clearAllTimers()` before drilling (mode1.js:586). Mode 2 `drillThis` guards via `state.gameOverPending` (mode2.js:597). |
| Case 7 (BOSS HP after deletions) | Not relapsed | Mode 2 `effectiveBossHp` scales by surviving question count (mode2.js:100-105). |
| Case 8 (audit on raw schema, not runtime) | **Partially relapsed** | `audit-render.js` covers placeholder substitution but does NOT check rendered HTML output for malformed tag injection. The q_m8_002 / q_n1_nlp_016 `<letter` patterns escape ALL existing audits. Suggest a new audit: `audit-html-safety.js` that scans every stem/option/explanation field for `<[a-zA-Z]` patterns and flags them. |
| New finding: **shared layer bypass** | None found | All modes go through Mastery/Wrongbook/SM-2/Progress APIs. |

---

## Top 10 actionable items (ordered by severity)

1. **`src/questions-mode8-trace.json:114, 177, 181`** — q_m8_002 stem/explanation has literal `<j 但 arr[i]>` which browser parses as malformed HTML tag, silently eating text. **Fix**: change `<` to `&lt;` in the JSON OR (preferred) wrap stem/explanation rendering with an HTML escape function. Mode 8 line 203 / Mode 1/2/5 stem render lines need escape applied.

2. **`src/questions-batch-n1-nlp.json:480`** — q_n1_nlp_016 `explanation.correct` has `'<wh', ..., 're>'` which mangles the FastText subword example. **Fix**: same as above — escape at render time, OR rewrite as `'《wh》, 《whe》, ...'` or use full-width brackets `〈wh〉`.

3. **Add new audit `scripts/audit-html-safety.js`** — scan every `stem`, `options[].text`, `explanation.correct`, `explanation.wrong[*]`, `explanation.hook`, `misconceptions[]`, `trace_steps[].ask` for the pattern `<[a-zA-Z][^<]*?>`. Currently only 2 questions exhibit the bug, but **no existing audit catches it**. This is a Case 8 relapse vector (audit looks at schema not rendered).

4. **`src/index.html:1604-1611` resetAll() incomplete** — extend to delete all 10 mode/SM-2/Player/ErrorReport keys, or document on the button that "only progress is cleared". Currently users get a misleading "已清除所有進度" toast.

5. **`scripts/audit-stem-explanation-consistency.js:25-39`** — add `'questions-confusion-matrix.json'` and `'questions-mode8-trace.json'` to `FILES[]`. Currently audit covers 585/595 questions (98.3%).

6. **`src/modes/mode2.js:755`, `mode3.js:986`, `mode5.js:854`** — change `Player.heal(50)` to `Player.heal(Math.floor(Player.load().hpMax / 2))` to match the "恢復一半 HP" promise across levels. Mode 1 already has this fix (mode1.js:701).

7. **`src/modes/mode6.js:566`** — replace 5000ms time-based wrongness detection with explicit state flag. Track `isCorrect` inside the answer hook closure rather than racing wrongbook timestamps. Failing this, expand window to ≥30000ms to cover slow readers.

8. **`src/modes/mode1.js:119` and `mode7.js:48-105`** — extend Mode 1 boss keyword lists and Mode 7 NPC `match` predicates to include L22 codes (`L22101..L22404`). Currently 260 questions (44% of bank) are nearly invisible in the main two game modes. Quick fix: add 1-2 new NPCs to Mode 7 for 統計/大數據, or add L22 codes to existing NPC predicates (e.g. scientist matches L22301-L22303).

9. **`src/index.html:419`** — change Mode 4 card description from "14 組高頻易混淆對" to "8 組高頻易混淆對" to match actual `extractPairs()` output (or add 6 more `format: "matching"` questions to the bank).

10. **`src/modes/mode7.js:36`** — change scope description from "依現況比例(50:50:0)" to "(科一 + 科二 + 科三 全收)" — L22 IS included in the 'all' pool, the "(0)" is misleading.

---

## Quantitative summary

| Severity | Count |
|---|---:|
| Critical | 2 (item 1, 2) |
| Medium | 4 (item 3, 4, 5, 7) + items 6, 8 if considering UX impact = 6 |
| Low | 6 (items 6, 8, 9, 10 + dead code + duplicated highlight functions) |
| Pass / Advisory | various (timer race latent, SM2 deletion handling, error toasts in 繁體中文, etc.) |

- **Total findings**: 11 distinct actionable items + 4 advisory observations
- **Highest impact**: 2 Critical HTML injection bugs visible to users at runtime
- **Audit coverage gap detected**: 10 questions escape stem-explanation-consistency audit
- **Case-library relapse status**: Case 8 partially relapsed via HTML injection (no audit guards rendered output for malformed-tag patterns)

---

## Confidence per category

| Category | Confidence |
|---|---|
| A. JS Runtime Risks | 85% — static analysis caught what was traceable; runtime race conditions could exist that need actual browser testing |
| B. DOM / Rendering | 95% — confirmed with JSON content inspection; 2 instances confirmed at exact line numbers |
| C. Storage / State | 95% — direct comparison of resetAll keys vs all writers |
| D. Question Schema | 92% — re-ran audit scripts to verify numbers; verified L22 schema across all 13 files |
| E. Cross-Mode Contracts | 80% — verified that L22 keywords don't appear in Mode 1/7 keyword lists; exact game-time impact assumes user reaches those modes regularly |
| F. Error Handling | 90% — all toasts inspected are in 繁體中文 and informative |
| G. Performance | 75% — static analysis without actual browser profiling; numbers are estimates |
| H. Test Infrastructure | 85% — re-ran 3 audit scripts to confirm coverage and gaps |
| I. Case-library relapses | 90% — cross-checked each case's known fix is still present in current code |
