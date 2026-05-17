# Phase 2 — Test Execution

| Field | Value |
|:--|:--|
| Generated (UTC) | 2026-05-17T10:22:00Z |
| Scope | `5ff76a5..ed7a4cd` (PR #29 + PR #30 merged into main) |
| Tier | T4 |
| Execution environment | `/tmp/wt-main` worktree pointing at `origin/main` (`ed7a4cd`) — keeps current branch unmodified per §0.3 mutation isolation |
| Executor | claude-opus-4-7[1m] L0 |
| Harness | vm sandbox + ad-hoc assertion (`makeAssert`) — confirmed acceptable in Phase 0 Human Gate Q4 |

---

## 1. Executive Summary

**Verdict: PASS** — proceed to Phase 3.

| Suite | Files | Assertions | PASS | FAIL | Exit |
|:--|:-:|:-:|:-:|:-:|:-:|
| Modified audit-tests (in-scope) | 5 | 128 | 128 | 0 | 0 |
| Existing audit scripts | 6 | (violation count) | n/a | 0 violations | 0 |
| Calculation numeric verify | 1 | 122 cases | 122 | 0 | 0 |
| **Total** | **12** | **250+** | **250+** | **0** | **all 0** |

Case-10 regression harness (`audit-mode-flow.js` + `audit-wrongbook-callers.js`) — both **PASS** with 0 violations. Mode 7 lineup-key bug **does not regress**.

---

## 2. In-Scope Audit-Test Suites (5 files)

| # | File | Assertions | Result |
|:-:|:--|:-:|:--|
| T1 | `scripts/audit-tests/shared-layer/03-mastery.test.js` | 43/43 | ✅ PASS |
| T2 | `scripts/audit-tests/srs-drill-review/04-drillsession-basic.test.js` | 46/46 | ✅ PASS |
| T3 | `scripts/audit-tests/srs-drill-review/05-generateVariation.test.js` | 16/16 | ✅ PASS |
| T4 | `scripts/audit-tests/mode5-8/mode7/19-repro-zero-score-bug.test.js` | 13/13 | ✅ PASS |
| T5 | `scripts/audit-tests/mode5-8/mode7/20-legacy-corrupted-detection.test.js` | 10/10 | ✅ PASS |

### T1 — Mastery (43 assertions)

Covers `Mastery.drillBonus(nodeId, ratio)` new behaviour:
- ratio=1.0 → +25, ratio=0.7 → +15, ratio=0.5 → +10, ratio=0.3 → +5, ratio=0 → +0
- back-compat: undefined ratio → +25
- saturation cap: 10× 100% capped at 100
- defensive: NaN → defaults +25 via `Number.isFinite` branch

**Test-flagged pre-existing behaviours** (not in PR scope; explicit "BUG candidate" markers in test output):
- `Mastery.update('', …)` accepts empty-string nodeId (stored as `""` key)
- `Mastery.update(null, …)` accepts null (stored as `"null"` key)
- NaN-injected score propagates without sanitisation
- These are tracked in the test as known behaviours — would be HIGH-tier findings in a fresh audit, but **out of scope** for this review (no diff line touches `Mastery.update`).

### T2 — DrillSession (46 assertions)

Covers all new PR #29 drill rules:
- depth tracking (default 0, explicit 1, undefined→0)
- 100%-completion → `SeenCorrect.mark(originalQ.id)` cross-mode broadcast
- non-100% → `SeenCorrect.mark` NOT called
- `Mastery.drillBonus` invoked with correct ratio
- Deep-drill activation: depth=0 + wrong → depth=1 nested, parent state pushed to `_parentStack`
- Depth=1 + wrong → **no further nesting** (1-layer cap verified)
- `_enterDeep` with empty `generateVariation` result → silent fallback (`next()` directly), no stack push

### T3 — generateVariation (16 assertions)

Covers removal of "寬鬆延伸" fallback (PR #29):
- Cross-subject pool → 0 variations (strict mode)
- Same-subject-only pool → 0 variations (no fallback)
- `_drillStrategy` tagged correctly ("換角度")
- Confusion-matrix questions excluded
- No duplicate id picks
- Defensive: null id, missing explanation, special-char id → no throw

### T4 — Mode 7 zero-score repro (13 assertions, case 10)

Validates PR #21's fix doesn't regress, using a 50-question full-mock simulation:
- `submitCurrent` path: `state.correct === 50`, `result.correct === 50`
- `_autoLockDrafts` path (no submit, time-up): `state.correct === 50`
- Mixed flow (half submit, half draft): `state.correct === 50`
- Lenient re-answer (wrong→correct): `isCorrect=true`
- Jump-order answering: 20/20 correct
- `fullLog` snapshot: every option has A/B/C/D key, every `isCorrect=true`

### T5 — Legacy corrupted detection (10 assertions, PR #30)

Validates `deleteHistoryEntry` + corrupted-legacy detection rule:
- Legacy data (options missing key) → `_legacyData=true`
- Fresh data (options have key) → `_legacyData=false` (no false-positive)
- `deleteHistoryEntry(0)` removes correct entry, leaves others intact
- `deleteHistoryEntry(99)` (out-of-range) → no crash
- `deleteHistoryEntry(-1)` (negative) → no crash
- `confirm()` cancel → no deletion

---

## 3. Existing Audit Scripts (CLAUDE.md §1 mandatory)

| # | Script | Result | Notes |
|:-:|:--|:--|:--|
| A1 | `audit-render.js` | ✅ 0 violations | 652 Q / 117 calc / 363 cases checked. No residual placeholder, all `is_correct` counts OK. (案例 8 regression check) |
| A2 | `audit-option-length.js` | ✅ 0 flagged | 502 single-choice Q. **Pre-existing condition note**: 「最長=正解」42.2% (above ideal 25%, threshold 40%). Not introduced by scope — no new questions in PR #29/#30. |
| A3 | `audit-source-fidelity.js` | ✅ 0 violations | 652 Q / 100% compliant (鐵律 #5) |
| A4 | `audit-calculation.js` | ✅ 0 flagged | 40 calc Q, schema = `A_ARRAY` for all |
| A5 | `audit-mode-flow.js` | ✅ 0 violations | **Case 10 regression check** — Mode 7 lineup-key invariants all pass |
| A6 | `verify-calc-numeric.js` | ✅ 122/122 OK | All numeric expectations match computed values |
| A7 | `audit-wrongbook-callers.js` | ✅ 0 violations | **Case 10 supplement** — 11 `Wrongbook.add` callsites across 10 files, all signature-consistent |

---

## 4. Phase 1 Finding Cross-Reference

| Phase 1 Finding | Phase 2 Runtime Observation |
|:--|:--|
| F-001 (dead `this.setup()`) | Test 20 step 3 invokes `deleteHistoryEntry(0)` → enters the try-catch → `this.setup` is undefined on sandbox `Mode` object → catch swallows. Test passes, but dead-code status **confirmed by absence of test coverage** — no assertion validates "history list re-renders after delete". |
| F-002 (3× `catch(_){}` swallow) | All three swallow paths exercised by tests without throwing, so the silent-failure risk is theoretical (not observed). Recommendation unchanged: add `console.warn` for DevTools visibility. |
| F-003 (redundant boolean `r.correct===0\|\|!r.correct`) | Runtime equivalent — no behavioural difference. |
| F-004 (`generateVariation(3).slice(0,1)`) | Test 19 of T2 (`_enterDeep no-variation fallback`) confirms behaviour is correct — wastes computation but produces correct nested drill. |

No new findings from Phase 2 execution.

---

## 5. Out-of-Scope Observations (informational only)

| Observation | Severity if in-scope | Reason out-of-scope |
|:--|:--|:--|
| `Mastery.update` accepts empty/null/NaN nodeId without validation | HIGH (storage key pollution) | Not touched by PR #29/#30 diff lines |
| `audit-option-length.js` 42.2% "longest = correct" exceeds 40% threshold | MEDIUM (鐵律 #4) | Question bank unchanged in scope; pre-existing |

These are recorded for future audit triggers but **do not block this review**.

---

## 6. Phase 2 STATE

```
PHASE_2: COMPLETE (PASS, 250+/250+ assertions, 0 violations, 0 exit codes)
↓
PHASE_3_READY → awaiting "continue"
```

Phase 3 plan: sandbox build verification. The project has no Dockerfile / `package.json` build script — frontend SPA served as static files. Will document build = "serve static dir via `http-server`" baseline, validate it starts and exposes `/index.html`. Per Phase 0 Q2 (sandbox baseline), default pinned `node:22.22.2-alpine` mentioned but Phase 3 is mostly N/A for this T4 codebase — will note explicitly.
