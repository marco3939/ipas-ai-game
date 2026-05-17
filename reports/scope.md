# Scope Lock — Secure Code Review v3.0 Phase 0

| Field | Value |
|:--|:--|
| Generated (UTC) | 2026-05-17T09:56:06Z |
| Trigger | post-codegen / post-merge (PR #29 + PR #30) |
| Baseline | `5ff76a5` (PR #28 merge into main, 2026-05-17) |
| Current HEAD | `ed7a4cd` (origin/main after PR #29 + #30 merges) |
| Working branch | `claude/mode7-legacy-fix-2026-05-17` (HEAD at 279ccf7, contains PR #30 squashed work) |
| Diff stats | 10 files · +760 / −67 lines |
| Compliance triggers (CRA/ISO/GDPR/HIPAA/PCI/SOC2/IEC62443) | **none** — false-positive on `npcIdx` in mode7.js |
| LLM-AUTHORED flag | **ACTIVE** — every commit in scope carries `claude.ai/code/session_*` markers (4 commits: 535dc62, f76d8b6, 11aeb7c, 279ccf7); enables §1.1 stricter Phase 1 checks |

---

## 1. Host Fingerprint

| Field | Value |
|:--|:--|
| OS | Linux 6.18.5 |
| Arch | x86_64 |
| Node | v22.22.2 |
| TZ | UTC (+0000) |
| Container | Claude Code on the web ephemeral sandbox |

## 2. Changed Files (full paths)

### Production source (T2+)

| Path | Hunks | Insertions / Deletions | Last-20-commits regression count |
|:--|:-:|:-:|:-:|
| `src/index.html` | 6 | +135 / −23 | **20/20** → REGRESSION-WATCH +1 |
| `src/modes/mode7.js` | 5 | +61 / −5 | **20/20** → REGRESSION-WATCH +1 |
| `src/modes/mode5.js` | 1 | +1 / −1 | 12/20 (comment-only change) |

### Test / audit artifacts (T0)

| Path | Purpose |
|:--|:--|
| `scripts/audit-tests/shared-layer/03-mastery.test.js` | re-spec `drillBonus` differentiated ratio |
| `scripts/audit-tests/srs-drill-review/04-drillsession-basic.test.js` | drill depth / deep drill / SeenCorrect.mark / silent fallback tests |
| `scripts/audit-tests/srs-drill-review/05-generateVariation.test.js` | strict 3-strategy assertion |
| `scripts/audit-tests/srs-drill-review/_helpers.js` | sandbox stubs (ErrorReports / SeenCorrect / generateVariation) |
| `scripts/audit-tests/mode5-8/mode7/19-repro-zero-score-bug.test.js` | NEW — 13-assertion 50q user-flow repro |
| `scripts/audit-tests/mode5-8/mode7/20-legacy-corrupted-detection.test.js` | NEW — 10-assertion legacy detection + deleteHistoryEntry |
| `scripts/audit-mode-flow.report.json` | timestamp refresh only (case-10 regression check, 0 violations) |

## 3. Changed Functions / Symbols (signatures)

### `src/index.html` (PR #29)

| Symbol | Type | Change | Critical-path tag |
|:--|:--|:--|:--|
| `Mastery.drillBonus(nodeId, ratio)` | API rewrite | added `ratio` param; differentiated bonus map {100%→25, ≥70%→15, ≥50%→10, >0→5, 0→0}; back-compat undefined ratio→25 | **scoring / persistence** |
| `generateVariation(originalQ, count)` | logic change | removed "寬鬆延伸" fallback (any-same-code / any-same-subject); now returns `[]` if strict 3 strategies cannot fill | **shared API surface** |
| `DrillSession.start(nodeId, q, originalQ, onComplete, depth)` | signature extended | new 5th param `depth`; silent empty-queue fallback (no toast, sync `onComplete()`); `_parentStack` cleared on top-level | **state mutation in user-facing flow** |
| `DrillSession.next()` | logic change | calls `Mastery.drillBonus(targetNode, ratio)`; on 100% calls `SeenCorrect.mark(originalQ.id)` | **persistence + scoring** |
| `DrillSession._enterDeep(wrongQ)` | NEW | nested drill at depth+1, max 1 layer; saves parent state to `_parentStack` | **state mutation / concurrency-adjacent** |
| `DrillSession._wasCorrect / _justAnswered / depth / _parentStack` | NEW fields | per-question wrap state for deep-drill decision | **state mutation** |
| `PlayEngine.onNext` wrap inside `DrillSession.next()` | logic change | branches on `_wasCorrect === false && depth < 1` → `_enterDeep` vs `next()` | **state mutation in user-facing flow** |

### `src/modes/mode7.js` (PR #30)

| Symbol | Type | Change | Critical-path tag |
|:--|:--|:--|:--|
| `_renderHistory()` history-card render | UI augmentation | injects `corruptedWarn` block + `🗑️ deleteBtn` when `isCorruptedLegacy = hasFullLog && (r.correct===0) && fullLog.some(option-key-empty)` | **state-mutation trigger (delete UI)** |
| `reviewHistorySession(historyIdx)` | detection rule extended | `keysBroken = hasSnapshot && e.options.some(o => !o.key || …)`; `anyLegacy = (!hasSnapshot \|\| keysBroken) && e.answered` | **persistence read path** |
| `legacyWarning` banner copy | text change | now explicitly states score is fake (not just red-box display) | UI only |
| `deleteHistoryEntry(historyIdx)` | **NEW public method** | `confirm()` → `history.splice(idx,1)` → `Storage.set(STORAGE_KEY, data)` → `refreshHome()` + `setup()` | **persistence write — destructive** |

### `src/modes/mode5.js`

| Symbol | Change |
|:--|:--|
| `Mode5.drillThis()` inline comment | text-only: "drillBonus 已自動 +20" → "drillBonus 依 ratio 差異化 +0~+25" |

## 4. Dependency / Lockfile / Infra Changes

**None.** No `package.json` / lockfile / Dockerfile / CI / k8s / `.env` modifications in scope.

## 5. DB Migration Changes

**None.** Frontend SPA, no backend DB. Persistence is `localStorage` only.

## 6. Critical-Path Inventory

| Path | Hit | Files affected |
|:--|:-:|:--|
| auth / authz | ❌ | — |
| persistence layer | ✅ | `Mastery.drillBonus` (writes Storage K_MASTERY) · `DrillSession.next` (writes K_SEEN_CORRECT) · `Mode7.deleteHistoryEntry` (writes K_THEATER) |
| serialization / deserialization | ✅ | `Mode7.deleteHistoryEntry` JSON.stringify round-trip on Storage.set |
| scoring / billing / financial | ✅ | `Mastery.drillBonus` (熟練度分數) · `DrillSession` correct count |
| **shared API surface** | ✅ | `DrillSession.start` signature change (13+ callers across Mode 1–8 + index.html) · `Mastery.drillBonus` signature change |
| **state mutation in user-facing flow** | ✅ | `DrillSession` deep-drill stack push/pop · Mode 7 `deleteHistoryEntry` destructive |
| privilege boundary / role logic | ❌ | — |
| crypto operations | ❌ | — |
| concurrency primitives | ⚠️ partial | `DrillSession._parentStack` not concurrency-safe but app is single-threaded SPA; `PlayEngine.answer` wrap reentrancy risk if drill triggers during drill (already audited in §8 review PASS) |

## 7. Tier Determination (§0.11)

| File | Base tier | Escalation | Final tier | Phases required |
|:--|:-:|:-:|:-:|:--|
| `src/index.html` | T3 (shared API, scoring, persistence, state mutation) | +1 (regression-watch ≥3) | **T4** | 1, 2, 3, 4, 5, 6 |
| `src/modes/mode7.js` | T3 (persistence, destructive write) | +1 (regression-watch ≥3) | **T4** | 1, 2, 3, 4, 5, 6 |
| `src/modes/mode5.js` | T0 (comment-only) | — | T0 | 1 |
| `audit-tests/*.test.js` | T0 (test code) | — | T0 | 1 |

**Overall tier (highest wins): T4 → full pipeline (Phases 1–6) mandatory.**

> Note: Phase 6 (compliance) is **conditionally relaxed** because no real CRA/ISO/GDPR/HIPAA/PCI/SOC2/IEC62443 scope detected. Pure-T4 tier triggers it, but the compliance map will be minimal (frontend SPA, localStorage only, no PII pipelines). Will execute Phase 6 with reduced clause map and document `NOT_APPLICABLE` for irrelevant clauses.

## 8. Flags Summary

| Flag | State |
|:--|:--|
| REGRESSION-WATCH | ✅ ACTIVE — `src/index.html` + `src/modes/mode7.js` |
| LLM-AUTHORED | ✅ ACTIVE — all 4 commits in scope are Claude-authored (session markers) |
| Compliance | ❌ INACTIVE — no real keyword hits, Phase 6 minimal |
| Subagent depth limit | L0 orchestrator running; Phase 1+ will spawn L1 Executor + L1 Auditor (≤8 active, ≤20 total) |
| Mutation isolation (§0.3) | ✅ — reports/ writes pre-authorized; no other writes until EXECUTE confirmed |

## 9. Open Questions for Human Gate

1. **Phase 6 scope**: confirm minimal-clause map is acceptable (no real compliance triggers detected)?
2. **Sandbox baseline image**: project has no Dockerfile or pinned container digest. Phase 3 will need a baseline (proposal: `node:22.22.2-alpine` pinned by digest). Acceptable?
3. **DAST tool availability**: Phase 4 needs ZAP / schemathesis / similar — not installed in this container. Per §0.4, will report missing and wait. Pre-empt?
4. **Test harness on existing files**: Mode 7 / index.html test scripts use vm sandbox + ad-hoc assertion helper. Phase 2 will treat that as harness ✅; no need to install Jest/Vitest. Confirm?

---

**Phase 0 STATE: SCOPE_READY → awaiting "continue" (per §7 control)**

Reports:
- `reports/scope.md` (this file)
- `reports/index.json` (initialized at Phase 1 start)
