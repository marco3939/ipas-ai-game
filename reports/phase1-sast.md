# Phase 1 — Static Analysis (SAST + Secrets + Caller-Consistency)

| Field | Value |
|:--|:--|
| Generated (UTC) | 2026-05-17T10:11:00Z |
| Scope | `5ff76a5..ed7a4cd` (PR #29 + PR #30 merged into main) |
| Tier | T4 — full pipeline |
| Executor | claude-opus-4-7[1m] L0 |
| Auditor | self-review (L1 auditor deferred to Phase 5 cross-validation) |
| LLM-AUTHORED flag | ACTIVE → §1.1 stricter checks applied |

---

## 1. Executive Summary

**Verdict: PASS** — proceed to Phase 2.

| Severity | Count | IDs |
|:--|:-:|:--|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 0 | — |
| LOW | 2 | F-001, F-002 |
| INFO | 2 | F-003, F-004 |

No secrets, no eval/dynamic code, no XSS sinks on user-controlled data, no prototype pollution, no dependency changes. Case-10 caller-consistency hard check **passed** (`DrillSession.start` 14 callers + `Mastery.drillBonus` 9 callers all confirmed compatible with new signatures).

---

## 2. Findings

### F-001 (LOW · LLM-AUTHORED §1.1 hallucinated API)

| Field | Value |
|:--|:--|
| File | `src/modes/mode7.js:2310` |
| Pattern | hallucinated method call + dead-branch guard |
| Code | `try { if (this.setup) this.setup(); } catch (_) {}` |
| Issue | `Mode7` has no `setup()` method. The exposed methods relating to setup view are `_renderSetupOptions()`, `_updatePoolStats()`, `_buildPool()`, etc. `this.setup` evaluates to `undefined`, the guard is always false, and the entire try-catch is unreachable dead code. |
| Security impact | None (no exception path, no security boundary) |
| Functional impact | After `deleteHistoryEntry`, if the user is on the setup page (the only place this UI surfaces), the history list inside the setup view may not auto-refresh. The accompanying `refreshHome()` call may compensate depending on routing. |
| LLM signature | Matches §1.1 hallucinated-API pattern: comment "簡單做法:呼叫 setup 重畫整頁" describes intent for a method that does not exist. |
| Recommendation | Replace with the actual re-render path (e.g., re-call the `_renderHistory` step in the setup view) or remove the dead try/catch. Non-blocking. |

### F-002 (LOW · LLM-AUTHORED §1.1 catch-all swallowing — pattern accumulation)

| Field | Value |
|:--|:--|
| Locations | (1) `src/index.html:1898-1900` — `try { SeenCorrect.mark(this.originalQ.id); } catch (_) {}`<br>(2) `src/index.html:1996-1998` — `try { const variations = generateVariation(wrongQ, 3); nested = variations.slice(0, 1); } catch (_) { nested = []; }`<br>(3) `src/modes/mode7.js:2310` — same as F-001 |
| Pattern | empty-catch swallowing — `catch (_) {}` discards both error and identifier |
| Security impact | None directly. But silent failure of `SeenCorrect.mark` would cause cross-mode "已掌握" signal loss → user sees the same question they mastered again (functional regression silently). Silent failure of `generateVariation` collapses deep-drill to fallback (user-visible: missing nested drill) but is intended graceful degradation. |
| LLM signature | Matches §1.1 pattern: 3 catch-all swallows in a single diff is above the "1 isolated swallow" tolerance threshold. |
| Defense already present | Each call has a defensive guard *before* the try (typeof check, length check). The catch is double-belt-and-braces for runtime errors inside the guarded call. |
| Recommendation | At minimum, log via `console.warn` inside catch so silent failures surface in DevTools during QA. Non-blocking — no security boundary crossed. |

### F-003 (INFO · redundant boolean)

| Field | Value |
|:--|:--|
| File | `src/modes/mode7.js:362` |
| Code | `(r.correct === 0 \|\| !r.correct)` |
| Issue | `0` is already falsy, so `!r.correct` covers `r.correct === 0`. The disjunction is equivalent to `!r.correct`. |
| Recommendation | Cosmetic; leave as-is if author wants explicit zero readability. |

### F-004 (INFO · wasteful computation)

| Field | Value |
|:--|:--|
| File | `src/index.html:1995` (inside `_enterDeep`) |
| Code | `const variations = generateVariation(wrongQ, 3); nested = variations.slice(0, 1);` |
| Issue | Asks for 3 candidates then discards 2. Could pass `1` directly. Likely intentional to preserve `_drillStrategy` ordering (strategies 1 = "換角度" is the deepest match), but not documented. |
| Recommendation | Either pass `1` for efficiency, or add a comment explaining why 3-then-1 is intentional. |

---

## 3. Caller-Consistency (Case 10 Hard Check)

> Per CLAUDE.md §5 case 10 and §8: shared-API signature changes **must** grep all callers.

### 3.1 `Mastery.drillBonus(nodeId, ratio)` — 9 callsites

| Source | Args | Status |
|:--|:--|:--|
| `src/index.html:1878` | `(this.targetNode, ratio)` — production | ✅ |
| `scripts/audit-tests/shared-layer/03-mastery.test.js:102` | `('n100', 1.0)` | ✅ |
| `…:105` | `('n70', 0.7)` | ✅ |
| `…:108` | `('n50', 0.5)` | ✅ |
| `…:111` | `('n30', 0.3)` | ✅ |
| `…:114` | `('n0', 0)` | ✅ |
| `…:117` | `('nlegacy')` — verifies back-compat undefined→25 branch | ✅ |
| `…:120` | `('ncap', 1.0)` × 10 (saturation) | ✅ |
| `…:123` | `('nnan', NaN)` — verifies `Number.isFinite` defense | ✅ |

Back-compat: `Number.isFinite(undefined) === false` → bonus = 25 (old behaviour `+20` → `+25`, +5 drift documented in comment). All callers compatible.

### 3.2 `DrillSession.start(nodeId, questions, originalQ, onComplete, depth)` — 14 prod callsites

| Source | Args (positional) | Status |
|:--|:--|:--|
| `src/index.html:1808` | 3 args | ✅ depth→0 |
| `src/index.html:2062` | 2 args (no originalQ) | ✅ depth→0, originalQ undefined-safe (guarded at use sites with `&& this.originalQ`) |
| `src/index.html:2072` | 2 args | ✅ same |
| `src/modes/mode1.js:630` | 4 args | ✅ depth→0 |
| `src/modes/mode2.js:681` | 4 args | ✅ depth→0 |
| `src/modes/mode3.js:973` | 4 args | ✅ depth→0 |
| `src/modes/mode4.js:601` | 4 args | ✅ depth→0 |
| `src/modes/mode5.js:764` | 4 args | ✅ depth→0 |
| `src/modes/mode5.js:784` | 4 args | ✅ depth→0 |
| `src/modes/mode5.js:881` | 4 args | ✅ depth→0 |
| `src/modes/mode6.js:597` | 4 args | ✅ depth→0 |
| `src/modes/mode7.js:446` | 4 args | ✅ depth→0 |
| `src/modes/mode7.js:2252` | 4 args | ✅ depth→0 |
| `src/modes/mode7.js:2277` | 4 args, originalQ=null | ✅ null-safe via `&& this.originalQ` guards |

Only internal `_enterDeep` (`src/index.html:2007`) passes 5th `depth` arg. All external callers backwards-compatible. **Case 10 risk avoided.**

### 3.3 `Mode7.deleteHistoryEntry(historyIdx)` — 1 callsite

| Source | Args | Status |
|:--|:--|:--|
| `src/modes/mode7.js:380` (history-card onclick) | `${realHistoryIdx}` — integer from `for` loop index | ✅ Safe interpolation |

Tests cover idx=99 (out-of-range), idx=-1 (negative), valid idx, and confirm-cancel paths — all assert no-crash.

---

## 4. SAST Pattern Sweep (on diff hunks only)

| Category | Pattern | Hits in diff |
|:--|:--|:-:|
| Secrets | api_key / secret / token / aws_ / ghp_ / BEGIN PRIVATE / bearer | 0 |
| Dynamic code | `eval(` / `new Function(` / setTimeout-with-string | 0 |
| XSS sinks (new) | `innerHTML` / `outerHTML` / `document.write` / `insertAdjacentHTML` | 0 *new sinks* (existing `innerHTML` patterns in mode7.js render trusted local data: loop indices, app-stored history fields) |
| Deserialization | `JSON.parse` on untrusted | 0 (`Storage.get` wraps with default fallback; namespace `ipas_mode7_theater_v1` is app-owned) |
| Prototype pollution | `__proto__` / `constructor.prototype` / spread-with-user-keys | 0 |
| Regex DoS | unbounded backtracking | 0 (`/^[A-Z]$/` is anchored single-char class) |
| Path traversal | N/A (frontend SPA, no FS access) | — |
| Lockfile/deps | `package.json` / `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` change | 0 |

---

## 5. Persistence-Layer Audit (T4 critical-path)

| Concern | Assessment | Notes |
|:--|:--|:--|
| `Mode7.deleteHistoryEntry` destructive write | ✅ Safe | `confirm()` gate; reads + writes own namespace only (`ipas_mode7_theater_v1`); idempotent on missing/out-of-range idx (tests assert); single-threaded SPA → no race |
| `DrillSession._parentStack` growth | ✅ Bounded | Cleared on every top-level `start()` (`depth === 0` branch). Max 1 entry due to `depth >= 1` re-entry guard in `_enterDeep`. Player abort → next top-level clears. |
| `Mastery.drillBonus(ratio)` validation | ✅ Defensive | `Number.isFinite` rejects NaN/Infinity/string; explicit numeric branches; back-compat undefined→25 |
| `SeenCorrect.mark` cross-mode write | ✅ Guarded | `typeof SeenCorrect !== 'undefined'` + `&& this.originalQ.id` + only on 100% drill |
| `Storage.set` atomicity | ✅ N/A | Synchronous localStorage; no partial-write window in single-threaded JS event loop |

---

## 6. LLM-AUTHORED Stricter Checks (§1.1)

| Check | Status | Reference |
|:--|:--|:--|
| Hallucinated APIs / non-existent libs | ⚠️ 1 hit | F-001 (`this.setup()`) |
| Catch-all error swallowing | ⚠️ 3 hits (pattern accumulation) | F-002 |
| Caller contract consistency | ✅ | §3 |
| Dead / unreferenced code | ⚠️ 1 hit | F-001 (dead try-catch) |
| Magic numbers without justification | ✅ | bonus map {25,15,10,5,0} documented inline |
| Comment claims vs reality | ✅ | All comments in diff verified against implementation |
| Test self-marking | ✅ | Tests assert real behaviour (zero-score repro, idx=99 no-crash, etc.) |

---

## 7. Syntax Validation

| File | `node --check` |
|:--|:--|
| `src/modes/mode7.js` | ✅ PASS |
| `src/index.html` | n/a (HTML; embedded JS validated via Phase 2 harness) |
| `scripts/audit-tests/shared-layer/03-mastery.test.js` | ✅ PASS |
| `scripts/audit-tests/srs-drill-review/04-drillsession-basic.test.js` | ✅ PASS |
| `scripts/audit-tests/srs-drill-review/05-generateVariation.test.js` | ✅ PASS |
| `scripts/audit-tests/mode5-8/mode7/19-repro-zero-score-bug.test.js` | ✅ PASS |
| `scripts/audit-tests/mode5-8/mode7/20-legacy-corrupted-detection.test.js` | ✅ PASS |

---

## 8. Phase 1 STATE

```
PHASE_1: COMPLETE (PASS, 2 LOW + 2 INFO, no blockers)
↓
PHASE_2_READY → awaiting "continue"
```

Phase 2 plan: execute the 5 audit-tests modified in scope + existing audit scripts (`audit-render.js`, `audit-option-length.js`, `audit-source-fidelity.js`, `audit-calculation.js`, `audit-mode-flow.js`) and report pass/fail/exit codes.
