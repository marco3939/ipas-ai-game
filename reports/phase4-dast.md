# Phase 4 — DAST (Dynamic Equivalent)

| Field | Value |
|:--|:--|
| Generated (UTC) | 2026-05-17T10:55:00Z |
| Scope | `5ff76a5..ed7a4cd` |
| Tier | T4 (mandatory) |
| DAST tool ZAP / schemathesis | NOT AVAILABLE in container (Phase 0 Q3 noted) |
| Substitute | vm-sandbox dataflow probes + adversarial-payload simulation |
| Executor | claude-opus-4-7[1m] L0 |

---

## 1. Executive Summary

**Verdict: PASS** — proceed to Phase 5. One new LOW finding (defence-in-depth).

| Category | Result |
|:--|:--|
| Network DAST (HTTP fuzzing / OWASP API / SQLi / open-redirect) | **NOT_APPLICABLE** — no backend, no API, no server-side routing |
| Auth bypass / privilege escalation | **NOT_APPLICABLE** — no auth, no roles, single-user local SPA |
| Cross-origin / CORS abuse | **NOT_APPLICABLE** — no fetch to user-controlled origins; only CDN GET with SRI-pin |
| Reflected XSS via URL params / hash routing | ✅ **No surface** — `location.hash/search/searchParams` not parsed (single `location = location.href` reload only) |
| Stored XSS via localStorage round-trip | ⚠️ **F-005 LOW** — `r.total` and `total` interpolated raw into `innerHTML`. Defence-in-depth gap, no remote-exploit vector. |
| JSON parse safety | ✅ `Storage.get` try/catch returns default on malformed JSON |
| Prototype pollution via `__proto__` in JSON | ✅ `JSON.parse` does NOT set `Object.prototype.*` (Node + V8 spec-correct behaviour) |
| Quota / storage exhaustion | ✅ `Storage.set` try/catch + console.warn; no uncaught throw |

---

## 2. Threat Surface Map (this SPA)

| Surface | Present? | Notes |
|:--|:-:|:--|
| HTTP API endpoints | ❌ | static SPA |
| WebSocket / SSE | ❌ | none |
| Form `<input>` accepting free-text into Storage | ⚠️ partial | nickname input + custom question import — see §6 out-of-scope |
| URL hash/route parsing | ❌ | not implemented (`location.hash` never read) |
| URL query / `searchParams` | ❌ | not used |
| `postMessage` / `<iframe>` / `window.open` | ❌ | none |
| External fetch (`fetch`/XHR) to non-CDN | ❌ | only static asset GET |
| External script loading | ✅ CDN with SRI | `canvas-confetti`, `gsap` — both `sha384-` pinned |
| `localStorage` round-trip → DOM | ✅ | **primary trust boundary** — adversarial payload probe below |
| `eval` / `new Function` | ❌ | static scan Phase 1 confirmed |

---

## 3. DAST Probe Results

> Conducted with `node` + `vm` sandbox, feeding crafted `localStorage` payloads through the actual `Storage.get` helper extracted from `src/index.html`. Then simulated the affected Mode 7 template-literal interpolations.

### Probe T1 — Storage.get JSON round-trip preserves adversarial strings

Payload set in localStorage:

```json
{
  "version": "1.0",
  "history": [{
    "ts": <now>,
    "config": { "qcount": 30, "scope": "all", "difficulty": "mid" },
    "result": { "correct": 0, "total": "<img src=x onerror=alert('XSS')>" },
    "fullLog": [{ ... "options": [{ "key": "", "text": "<script>alert('XSS')</script>" }, ...] }]
  }]
}
```

**Result**: `Storage.get` returns the object exactly as written. **`r.total` is now a string containing `<img onerror>`**.

```
type of data: object
r.total raw: "<img src=x onerror=alert(\"XSS-total\")>"
r.total type: string
```

By design — `Storage.get` is just `JSON.parse(localStorage.getItem(k))`. Sanitisation is the responsibility of the renderer.

### Probe T2 — Mode 7 corruptedWarn template interpolates raw

Template (`src/modes/mode7.js:373`):

```js
const corruptedWarn = isCorruptedLegacy
  ? `<div ...>分數也會被永久記成 0/${r.total || '?'}。</div>`
  : '';
```

**Result**:

```
<div>分數也會被永久記成 0/<img src=x onerror=alert("XSS-total")>。</div>
```

`<img onerror>` payload **passes through unescaped** into the final HTML. Same applies to `legacyWarning` (`src/modes/mode7.js:1922-1928`) using `${total}`.

This is then assigned via `view.innerHTML = …` (the parent template wrapping `_renderHistory()` output at `src/modes/mode7.js:217`) — **the payload would execute in a real browser**.

### Probe T3 — Storage.get malformed JSON

Payload: `{bad json}` raw string.

**Result**: returns default value (`'DEFAULT'`). The `Storage.get` body wraps `JSON.parse` in try/catch — ✅ graceful degradation.

### Probe T4 — Storage.get `__proto__` pollution attempt

Payload: `{"__proto__": {"polluted": true}}` parsed via `Storage.get`.

**Result**: `Object.prototype.polluted === undefined` after parse. ✅ `JSON.parse` correctly treats `__proto__` as a regular own-property key (per ECMAScript spec); does NOT set the prototype. **No prototype pollution.**

### Probe T5 — Storage.set quota handling

Simulated localStorage.setItem throwing `QuotaExceededError`.

**Result**: `Storage.set` catches and logs `storage full: Error …` via `console.warn`. No uncaught throw. ✅

---

## 4. New Finding

### F-005 (LOW · stored-XSS defence-in-depth gap)

| Field | Value |
|:--|:--|
| Files | `src/modes/mode7.js:373` (corruptedWarn template) · `src/modes/mode7.js:1922-1928` (legacyWarning template) |
| Pattern | Numeric-typed localStorage field (`r.total` / `total`) interpolated into `innerHTML`-bound template-literal without `esc()` |
| Attacker model | Requires same-origin JS execution to write adversarial value into `localStorage['ipas_mode7_theater_v1']` |
| Remote exploitability | **NONE** — cross-origin pages cannot write to victim's localStorage; same-origin JS already has full XSS capability |
| Why still LOW (not INFO) | (a) defence-in-depth principle: the rest of Mode 7's render path consistently uses `_esc()` / `esc()` for every localStorage-sourced string. The 2 new templates in scope break that pattern. (b) If app logic ever stores user-typed digits to `r.total` (currently sourced only from a fixed `QCOUNT_OPTIONS` list, but future refactors may not), the surface becomes live. |
| Recommendation | Wrap with `esc(r.total)` and `esc(total)` to match existing pattern. Trivial 2-line change. |
| Block status | **Non-blocking** — review can proceed; recommend addressing in a follow-up commit. |

---

## 5. Probes That PASSED (no findings)

| Probe | Status |
|:--|:--|
| URL hash/route reflection | ✅ N/A — no URL parsing |
| `window.opener` tab-nabbing | ✅ N/A — no `window.open` |
| postMessage origin validation | ✅ N/A — no postMessage listener |
| CORS preflight bypass | ✅ N/A — no cross-origin fetch |
| `<iframe>` clickjacking | ✅ N/A — no iframes; deploy-time CSP frame-ancestors recommended (out of scope) |
| Open redirect via URL params | ✅ N/A |
| `eval` / `new Function` chain | ✅ Phase 1 verified absent |
| CSRF (no state-changing cross-origin requests) | ✅ N/A — all writes are local |
| Prototype pollution via JSON | ✅ Probe T4 |
| JSON parse DoS / malformed | ✅ Probe T3 |
| Quota / storage exhaustion crash | ✅ Probe T5 |

---

## 6. Out-of-Scope DAST Observations

These are surfaces noticed during DAST mapping but **not touched by PR #29 / #30**:

| Observation | Severity if in-scope |
|:--|:--|
| Player nickname (`K_USER_NICKNAME`) — free-text input → localStorage → rendered in greetings | MEDIUM (stored-XSS) if rendered without escape; needs separate audit |
| Custom question import via JSON paste (if implemented) | HIGH if rendered without escape |
| Error report comments (`K_ERROR_REPORTS`) — user-typed | MEDIUM |

These are recorded as **out-of-scope-followup-candidates** for future review trigger.

---

## 7. Phase 4 STATE

```
PHASE_4: COMPLETE (PASS, 1 new LOW + 0 HIGH/CRITICAL)
↓
PHASE_5_READY → awaiting "continue"
```

Phase 5 plan: threat model + cross-validation. Will exercise:
- §1.1 LLM-AUTHORED stricter cross-validation: independent re-read of `_enterDeep` and `deleteHistoryEntry` from a hostile reviewer's perspective.
- Case 10 dataflow trace one more time — adversarial scenarios (drill abort mid-deep, page refresh mid-deep, concurrent drill triggers via setTimeout-driven UI).
- Cumulative finding map: F-001..F-005 across phases.
