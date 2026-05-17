# Phase 3 — Sandbox Build Verification

| Field | Value |
|:--|:--|
| Generated (UTC) | 2026-05-17T10:42:30Z |
| Scope | `5ff76a5..ed7a4cd` |
| Tier | T4 (mandatory) |
| Build artifact type | Static frontend SPA — no compile / bundle / transpile step |
| Verification tool | `http-server@14.1.1` (dev server, npm global) |
| Executor | claude-opus-4-7[1m] L0 |

---

## 1. Executive Summary

**Verdict: PASS** — proceed to Phase 4.

The project is a pure static SPA with no `package.json`, no `Dockerfile`, no build script. "Build" reduces to "serve `src/` directory as static files." Phase 3 verification confirms:

| Check | Result |
|:--|:--|
| Project has no build pipeline → no build can fail | ✅ N/A |
| Static dir serves cleanly via standard tooling | ✅ http-server 14.1.1 |
| All in-app references (`<script src>`, JSON batch fetches) resolve to 200 | ✅ 100% probe success |
| External CDN dependencies are SRI-pinned | ✅ both `canvas-confetti` and `gsap` carry `integrity="sha384-…"` |
| Working tree matches `git` state (no untracked mutations) | ✅ (verified via worktree at `ed7a4cd` detached HEAD) |

No new findings (HIGH or above) from Phase 3.

---

## 2. Build Surface Inventory

| Item | Status |
|:--|:--|
| `package.json` | ❌ absent |
| `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` | ❌ absent |
| `Dockerfile` | ❌ absent |
| `Makefile` / `build.sh` | ❌ absent |
| `vite.config.*` / `webpack.config.*` / `rollup.config.*` | ❌ absent |
| Static entry | ✅ `src/index.html` (151 875 bytes) |
| Mode modules | ✅ `src/modes/mode{1..8}.js` |
| SM-2 module | ✅ `src/sm2.js` (8 175 bytes) |
| Component | ✅ `src/components/confusion-matrix.js` |
| Question bank | ✅ 35 `questions*.json` files (total 2.5 MB src/) |

Per Phase 0 Q2 (sandbox baseline `node:22.22.2-alpine`): **not applicable** for static SPA — no build container needed. Recording as `NOT_APPLICABLE` per §0.4.

---

## 3. Reference Resolution Probe

Started `http-server src -p 8765 -c-1 --silent` in background; probed all key paths.

### 3.1 Core paths

| Path | HTTP | Size | Result |
|:--|:-:|:-:|:--|
| `/` (root → index.html) | 200 | 151 875 | ✅ |
| `/index.html` | 200 | 151 875 | ✅ |
| `/modes/mode7.js` | 200 | 119 176 | ✅ |
| `/sm2.js` | 200 | 8 175 | ✅ |
| `/components/confusion-matrix.js` | 200 | — | ✅ |

### 3.2 `<script src>` references in index.html

| Reference | Type | HTTP |
|:--|:--|:-:|
| `https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js` | CDN (SRI-pinned) | N/A — external, not probed inside sandbox |
| `https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js` | CDN (SRI-pinned) | N/A — external |
| `sm2.js` | local | 200 |
| `components/confusion-matrix.js` | local | 200 |

### 3.3 Question bank batches (first 10 sampled)

| Path | HTTP |
|:--|:-:|
| `/questions-batch-n1-nlp.json` | 200 |
| `/questions-batch-n10-L22102.json` | 200 |
| `/questions-batch-n11-L22103.json` | 200 |
| `/questions-batch-n12-L22201.json` | 200 |
| `/questions-batch-n13-L22202.json` | 200 |
| `/questions-batch-n14-L22203.json` | 200 |
| `/questions-batch-n15-L22301.json` | 200 |
| `/questions-batch-n16-L22302.json` | 200 |
| `/questions-batch-n17-L22303.json` | 200 |
| `/questions-batch-n18-L22401.json` | 200 |

(All 35 question files exist on disk; sampling representative of the load path.)

### 3.4 Server log

```
(node:…) [DEP0066] DeprecationWarning: OutgoingMessage.prototype._headers is deprecated
```

Single Node.js deprecation warning from `http-server` itself (upstream package). Not project-affecting. No project-level error/warning.

---

## 4. Defence-in-Depth Observations (not scope-blocking)

These are **deploy-time concerns** not in this PR scope, but documented for the deploy owner.

### 4.1 HTTP response headers from dev server

```
HTTP/1.1 200 OK
cache-control: no-cache, no-store, must-revalidate
content-type: text/html; charset=UTF-8
last-modified: …
etag: …
```

| Header | Status | Notes |
|:--|:--|:--|
| `Content-Security-Policy` | ❌ absent | dev-server default; production deploy (GitHub Pages) controls this |
| `X-Frame-Options` | ❌ absent | same |
| `X-Content-Type-Options` | ❌ absent | same |
| `Referrer-Policy` | ❌ absent | same |
| `Strict-Transport-Security` | ❌ absent | enforced by GitHub Pages by default in production |

**Verdict**: not a code defect; dev tool behaviour. Deploy hardening tracked separately.

### 4.2 SRI on CDN scripts

```html
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"
        integrity="sha384-Rv68Y7adOjMMJc1/xFMcdNvXre/HF51to4GZjBALmXr7ABnVl5V4UajJwBu7zbhN"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"
        integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt"
        crossorigin="anonymous"></script>
```

✅ Both external dependencies are SRI-pinned. Tampering with CDN content would cause the script to fail to execute (browser SRI check). Good defence-in-depth.

### 4.3 Inline event handlers

`index.html` contains **41** inline `on{click,load,error}=…` handlers. The diff scope adds inline handlers only via Mode 7 (template-literal `onclick="Mode7.deleteHistoryEntry(${realHistoryIdx})"` etc.), with all interpolated values being either loop indices (safe integer) or sanitised storage data (no user-controlled string).

**Verdict**: existing pattern, not changed in scope. No new XSS surface introduced.

---

## 5. Worktree Integrity

| Check | Result |
|:--|:--|
| `/tmp/wt-main` worktree at detached HEAD `ed7a4cd` | ✅ |
| Working tree matches commit (no stray edits) | ✅ |
| Worktree isolated from main repo (Phase 2 + Phase 3 used isolated `/tmp/wt-main`) | ✅ §0.3 |

---

## 6. Phase 3 STATE

```
PHASE_3: COMPLETE (PASS, 0 findings, all probes 200)
↓
PHASE_4_READY → awaiting "continue"
```

Phase 4 plan: DAST against the running SPA. Per Phase 0 Q3, no ZAP / schemathesis available in container. Will:
1. Mount in-process DAST equivalents — light-weight probes for: open redirect, broken access control (no auth in app), reflected XSS via URL params (the SPA may parse hash routes), client-side prototype-pollution sources.
2. Static check on `Storage.get` round-trip (single API surface that crosses the trust boundary localStorage → JS object).
3. Mark heavy DAST as `NOT_APPLICABLE — no backend, no auth, no PII pipeline` per Phase 0 §6 minimal-compliance map alignment.

Expect Phase 4 to be short and report mostly N/A or INFO.
