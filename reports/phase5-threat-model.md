# Phase 5 — Threat Model + Cross-Validation

| Field | Value |
|:--|:--|
| Generated (UTC) | 2026-05-17T11:08:00Z |
| Scope | `5ff76a5..ed7a4cd` |
| Tier | T4 (mandatory) |
| L0 Orchestrator | claude-opus-4-7[1m] |
| L1 Auditor | independent general-purpose agent (no prior phase context) |
| LLM-AUTHORED §1.1 stricter cross-validation | ✅ executed |

---

## 1. Executive Summary

**Verdict: PASS with RECOMMEND-FIX** — no CRITICAL/HIGH blockers, but L1 cross-validation surfaced **2 MEDIUM** findings the orchestrator missed in Phases 1–4. Recommend addressing F-006 + F-007 in a follow-up commit before this branch is treated as fully cleared. Phase 6 may proceed regardless (compliance is minimal per Phase 0).

### Cumulative finding count (revised post-L1)

| Severity | Count | Change from Phase 4 |
|:--|:-:|:-:|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| **MEDIUM** | **3** | **+3** (F-001 upgraded; F-006, F-007 new) |
| LOW | 7 | +5 |
| INFO | 4 | +2 |
| Total | **14** | +10 since Phase 4 |

> The volume increase is not a regression. It is the expected outcome of an independent reviewer applying §1.1 LLM-AUTHORED stricter cross-validation to LLM-authored code. CLAUDE.md case 10 documents that L0-only review missed identical-pattern bugs across 14 PRs; this protocol exists precisely to surface them in 1 review.

---

## 2. Threat Model

### 2.1 Asset inventory

| ID | Asset | Storage | Sensitivity |
|:--|:--|:--|:--|
| A1 | Mode 7 mock-test history | `localStorage['ipas_mode7_theater_v1']` | Integrity-critical (scoring/timeline) |
| A2 | Mastery scores | `localStorage['ipas_mastery_v1']` | Integrity-critical (progression) |
| A3 | SeenCorrect set | `localStorage['ipas_seen_correct_v1']` | Integrity (cross-mode dedup) |
| A4 | DrillSession runtime state | in-memory only | Ephemeral |
| A5 | Question bank | static JSON files, served read-only | Integrity (build-time) |
| A6 | User nickname / error reports | `localStorage` (out of scope) | Low |

**No PII pipeline. No auth tokens. No financial data. No backend.**

### 2.2 Trust boundaries

| ID | Boundary | Direction | In-scope changes affect? |
|:--|:--|:--|:--|
| TB1 | localStorage owner ↔ JS app | read + write | ✅ `Mode7.deleteHistoryEntry` (write), `Mastery.drillBonus` (write), `SeenCorrect.mark` (write) |
| TB2 | CDN scripts (SRI-pinned) ↔ JS app | read | ❌ unchanged |
| TB3 | Static question JSON ↔ JS app | read | ❌ unchanged |
| TB4 | User DOM events ↔ JS app | input | ✅ delete button click, confirm dialog |
| — | server boundary | — | N/A (no backend) |

### 2.3 Attacker model

| Attacker | Capability | Relevant findings |
|:--|:--|:--|
| **Remote (cross-origin)** | cannot write victim's localStorage; can only deliver malicious CDN payload | mitigated by SRI |
| **Local (same-origin already-XSS)** | full app capability | F-005 (defence-in-depth only) |
| **Local user (own device)** | own localStorage; can craft adversarial JSON | not a threat — same as user with own data |
| **Cross-tab same-origin** | concurrent writes to shared localStorage | **F-007 (cross-tab race in deleteHistoryEntry)** |
| **Stale-state user** | navigates back/forward, abandons mid-flow | **F-006 (parent stack wipe)** |

---

## 3. Cumulative Findings Table (post-L1 cross-validation)

| ID | Severity | Source | Phase | Category | Title |
|:--|:--|:--|:-:|:--|:--|
| F-001 | **MEDIUM** ⬆ | L0+L1 | 1+5 | Hallucinated API + Repudiation | dead `this.setup()` → setup-view re-render not happening |
| F-002 | LOW | L0 | 1 | Repudiation | 3× `catch (_) {}` swallows error signals |
| F-003 | INFO | L0 | 1 | Code quality | redundant `(r.correct===0 \|\| !r.correct)` |
| F-004 | INFO | L0 | 1 | Performance | `generateVariation(3).slice(0,1)` discards 2/3 |
| F-005 | LOW | L0 | 4 | Tampering (stored XSS, no remote vector) | `r.total`/`total` raw to innerHTML defence-in-depth gap |
| **F-006** | **MEDIUM** 🆕 | L1 | 5 | Tampering (silent data loss) | `_parentStack` wipe on top-level re-entry abandons in-progress deep drill |
| **F-007** | **MEDIUM** 🆕 | L1 | 5 | Tampering (cross-tab race) | `deleteHistoryEntry` reads + writes around blocking `confirm()` → data loss |
| F-008 | LOW | L1 | 5 | Tampering (key pollution) | `wrongQ.node_id \|\| this.targetNode` can pollute Mastery with `'mixed'`/null keys |
| F-009 | LOW | L1 | 5 | Tampering (race) | `DrillSession.correct++` before `origAnswer(key)` — increment leaks on throw |
| F-010 | LOW | L1 | 5 | Repudiation | `Storage.set` quota silent-fail → misleading "已刪除" toast |
| F-011 | LOW | L1 | 5 | DoS (own UI) | `confirm()` throw uncaught — handler aborts in sandboxed contexts |
| F-012 | LOW | L1 | 5 | Detection gap (acceptable) | `e.answered` requirement misses all-abandoned corrupted-legacy sessions |
| F-013 | INFO | L1 | 5 | Comment-code drift | "向後相容 ratio undefined→1" but no caller passes undefined |
| F-014 | INFO | L1 | 5 | Magic numbers | 0.7 / 0.5 ratio thresholds undocumented |

> 🆕 = new in Phase 5. ⬆ = severity upgraded.

---

## 4. New Findings Detail (L1 contributions)

### F-006 (MEDIUM 🆕 · Tampering — silent Mastery/Wrongbook data loss)

| Field | Value |
|:--|:--|
| File | `src/index.html:1845` (`if (this.depth === 0) this._parentStack = []`) |
| Scenario | Player in Mode 5 boss-fight → answers wrong → parent drill starts (depth=0) → answers wrong again → `_enterDeep` pushes parent state to `_parentStack`, starts deep drill (depth=1). Player browser-back → home → enters Mode 7 setup → clicks "🎯 下鑽" on a history card → `Mode7.drillWrong` calls `DrillSession.start(q.node_id, …)` at depth=0. |
| Impact | The new top-level `start()` resets `_parentStack = []`. The abandoned parent's accumulated `correct` count never reaches `Mastery.drillBonus`. `Wrongbook.markMastered` for the parent's `PlayEngine.current` is skipped. Silent integrity loss in Mastery scoring without any user feedback. |
| Likelihood | Medium — players regularly navigate mid-drill (browser-back is the most natural exit). The `_parentStack` is currently never logged or warned about. |
| Recommendation | Either (a) flush `_parentStack` parents on a CLEAN exit only (after `drillBonus`+`markMastered` applied to each parent), or (b) emit `console.warn` when a top-level start nukes a non-empty `_parentStack` so the silent loss surfaces during dev/QA. Trivial fix. |

### F-007 (MEDIUM 🆕 · Tampering — cross-tab data loss race)

| Field | Value |
|:--|:--|
| File | `src/modes/mode7.js:2293-2304` (`deleteHistoryEntry`) |
| Scenario | Tab A: user opens Mode 7 setup, clicks 🗑️ on a corrupted-legacy card → `data = Storage.get(STORAGE_KEY, null)` snapshot read → `confirm()` dialog opens (synchronous-blocking in tab A only). Tab B: user finishes a mock-test → `submitMock` appends a new history entry → `Storage.set(STORAGE_KEY, newData)`. Tab A: user clicks OK → `data.history.splice(historyIdx, 1)` on the **stale** snapshot → `Storage.set(STORAGE_KEY, data)` **overwrites tab B's new entry**. |
| Impact | **Permanent loss of tab B's completed mock-test record** (timeline + Top 5 wrong-questions + fullLog all gone). No recovery — localStorage is the source of truth. No audit log. |
| Why no listener saves us | grep confirmed no `storage` event listener in `mode7.js` or `index.html`. |
| Likelihood | Low practical (requires concurrent two-tab usage during a confirm dialog) but trivially reproducible in QA. The IPAS app is a typical "leave one tab open while studying on another" target. |
| Recommendation | After `confirm()` returns true, **re-read** `Storage.get(STORAGE_KEY)` and re-locate the entry by `h.ts` (timestamp fingerprint match) before `splice`. If the entry has moved index, look up the new index; if it's gone, no-op with toast. 5-line fix. |

### F-008 (LOW 🆕 · Mastery key pollution)

| Field | Value |
|:--|:--|
| File | `src/index.html:1990` (`this.start(wrongQ.node_id \|\| this.targetNode, …)`) |
| Scenario | If `wrongQ.node_id` is undefined (legacy data) AND parent drill came from Mode 7 (`DrillSession.start('mixed', variations, null, …)` at mode7.js:2277) so `this.targetNode = 'mixed'`, the deep drill targets the literal string `'mixed'`. `Mastery.drillBonus('mixed', ratio)` creates `m['mixed']` entry — a non-existent "node" polluting all node-list aggregations. |
| Recommendation | Validate `node_id` is a real KB node before launching deep drill; otherwise skip the deep step. |

### F-009 (LOW 🆕 · correct-counter race)

| Field | Value |
|:--|:--|
| File | `src/index.html:1955-1957` |
| Scenario | `if (isCorrect) DrillSession.correct++; origAnswer(key);` — `correct++` runs BEFORE `origAnswer`. If `origAnswer` (native `PlayEngine.answer`) throws after, `correct` is already incremented. Native's button-disable loop may not run (throws early), leaving buttons re-clickable. A second click double-counts under specific malformed-state preconditions. |
| Practical risk | Very low — requires `PlayEngine.current.options = null` or similar between wrap entry and native dispatch in single-threaded JS. |
| Recommendation | Move `correct++` to after `origAnswer(key)` (still inside try block). |

### F-010 (LOW 🆕 · Storage quota silent fail)

| Field | Value |
|:--|:--|
| File | `src/modes/mode7.js:2303-2305` |
| Scenario | `Storage.set(STORAGE_KEY, data); showToast('✅ 已刪除 …', 2200);` — `Storage.set` catches QuotaExceeded internally (src/index.html:756-766) and surfaces via a separate banner mechanism but returns silently. `deleteHistoryEntry` does not check the failure flag. User sees "✅ 已刪除" toast; on refresh, entry is still present. Confusing UX. |
| Recommendation | Check `Storage._writeFailed` flag (or have `Storage.set` return boolean) and show "❌ 寫入失敗,空間已滿" toast instead. |

### F-011 (LOW 🆕 · confirm throw uncaught)

| Field | Value |
|:--|:--|
| File | `src/modes/mode7.js:2302` |
| Scenario | Some embedded browsers (iframe sandbox without `allow-modals`) throw on `confirm()`. The `typeof confirm === 'function'` guard checks existence but invocability — throw propagates uncaught; handler aborts. Data not corrupted (fail-safe) but user gets no feedback. |
| Recommendation | Wrap in try/catch with fallback. |

### F-012 (LOW 🆕 · all-abandoned legacy slip-through)

| Field | Value |
|:--|:--|
| File | `src/modes/mode7.js:363, 2032` |
| Scenario | `isCorruptedLegacy` requires `h.fullLog.some(e => e.answered && …)`. An all-abandoned PR #21-pre session (user started, answered 0 questions, exited) has `e.answered=false` on every entry → detection misses it → no warning, no delete button. |
| Author intent | The warning text says "計分有 bug" which doesn't apply to all-abandoned (correct=0 because nothing was answered, not because of the lineup-key bug). |
| Verdict | Acceptable as-is. Note for future improvement. |

---

## 5. STRIDE Map (final, post-L1)

| Threat | Findings | Notes |
|:--|:--|:--|
| **S** (Spoofing) | — | No identity layer. |
| **T** (Tampering) | F-005 (stored XSS DiD), F-006 (data loss), F-007 (cross-tab race), F-008 (key pollution), F-009 (race) | All within same-origin local trust boundary. |
| **R** (Repudiation) | F-001 (silent UI failure), F-002 (silent error), F-010 (misleading toast) | No audit log for any localStorage mutation — pre-existing design choice. |
| **I** (Info Disclosure) | — | No secrets, no PII. |
| **D** (DoS) | F-011 (own UI hang in sandboxed iframe) | Self-DoS only, no remote vector. |
| **E** (Elevation) | — | No privilege boundary. |

---

## 6. L0 / L1 Cross-Validation Agreement

| Finding | L0 verdict | L1 verdict | Synthesis |
|:--|:--|:--|:--|
| F-001 (dead `this.setup()`) | LOW (dead code) | MEDIUM (intent unfulfilled — re-render relies on `refreshHome()` side-effect) | **Upgraded to MEDIUM** — L1's "lucky save via refreshHome" framing is correct. The author's stated intent ("重渲染該區塊") fails silently. |
| F-002 (3× catch swallow) | LOW (style) | LOW (corroborated as inconsistent error handling) | **Confirmed LOW** |
| F-005 (stored XSS DiD) | LOW (no remote vector) | not raised | **L1 didn't surface — L0 wins this lane** |
| F-006 (parentStack wipe) | not raised | MEDIUM | **L1 unique catch — accepted MEDIUM** |
| F-007 (cross-tab race) | not raised | MEDIUM | **L1 unique catch — accepted MEDIUM** |

**Net result**: L0 + L1 catch is **complementary**. Neither solo found everything. Per CLAUDE.md §8: this is exactly the cross-validation that case 10 mandated.

---

## 7. Recommended Disposition

> **Per Tier T4 protocol §5**: MEDIUM findings should be addressed in same branch when feasible, otherwise tracked in a follow-up issue with explicit owner. CRITICAL/HIGH block merge; MEDIUM does not.

| Finding | Recommended action |
|:--|:--|
| F-001 (MEDIUM) | **Fix in same branch** — 1-line: `this.setup` → `this.renderSetup`. Then verify with a manual click-through. |
| F-005 (LOW) | **Fix in same branch** — 2-line: wrap `r.total` and `total` in `esc()`. |
| F-006 (MEDIUM) | **Follow-up commit/PR** — design choice (silent-clear vs warn vs preserve); needs author input. |
| F-007 (MEDIUM) | **Follow-up commit/PR** — re-read + ts-fingerprint re-locate; 5-line fix but should ship with cross-tab test case. |
| F-008–F-012 (LOW) | **Follow-up** — bundle into a "Mode 7 cross-tab + edge case" hardening PR. |
| F-002, F-013, F-014 (LOW/INFO) | **Optional** — code quality, not security. |

---

## 8. Phase 5 STATE

```
PHASE_5: COMPLETE (PASS w/ recommend-fix; 0 CRITICAL/HIGH, 3 MEDIUM, 7 LOW, 4 INFO)
↓
PHASE_6_READY → awaiting "continue"
```

Phase 6 (compliance, minimal map per Phase 0 §6): expected to be short — no real CRA/ISO/GDPR/HIPAA/PCI clauses apply to this frontend SPA. Will produce a `NOT_APPLICABLE` map per clause family with rationale and a final "review-complete" summary.
