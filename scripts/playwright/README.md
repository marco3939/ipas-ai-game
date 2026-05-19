# Playwright E2E Baseline — IPAS AI 遊戲

真實瀏覽器(headless chromium)互動測試,涵蓋 SPA critical paths。
補充既有 `scripts/audit-tests/`(node vm sandbox 模擬)沒涵蓋的「真實 DOM / event / dialog / view 切換」層。

---

## 為何加這層

`audit-tests/` 跑的是 jsdom-style sandbox(mock window / document),抓得到「函式邏輯」bug,**抓不到**:
- view 切換是否真的 `.active` 切換
- `onclick=` inline 是否真的綁到對的 handler
- `window.confirm` 對話框是否真的被觸發(案例 12,Mode 7 退出保護)
- 批次選取 / 過濾選單 / 標記題的 UI state(案例 10)

E2E 就是補這個。

---

## 5 個 spec 對應的場景

| Spec | 場景 | 對應 CLAUDE.md 案例 |
|:--|:--|:--|
| `01-home-load.spec.js` | 首頁 view-home active、9 顆 mode-card 全可見、QUESTIONS manifest 載完 | 鐵律 #7 |
| `02-mode1-boss-flow.spec.js` | Mode 1 selectBoss → startBattle → 答 1 題 → next/victory/gameOver UI 出現 | 案例 1 (window.QUESTIONS) |
| `03-mode7-mock-exam.spec.js` | Mode 7 _startBattle → 答 3 題 → 標記題切換 marked class → 退出觸發 confirm | 案例 10 (lineup.q.options) |
| `04-exam-exit-protection.spec.js` | Mode 1 / 7 / 8 開戰後右上「⚠️ 退出考試」必跳 confirm + accept 後回首頁 | 案例 12 (2026-05-19) |
| `05-mode6-cards-grid.spec.js` | Mode 6 grid 載入 + subject 過濾 + 批次模式 toggle(state.batchMode) | PR #38 / case 11 |

---

## 跑法

### 1. 安裝(僅首次)

```bash
cd /home/user/ipas-ai-game/scripts/playwright
npm install
npx playwright install chromium    # 或 npm run install-browsers
```

### 2. 起 http server(另一個 terminal)

Playwright 需要真正的 HTTP server(`file://` 路徑會被同源策略卡)。從專案根的 `src/` 起:

```bash
cd /home/user/ipas-ai-game/src
python3 -m http.server 8000
```

或從 `scripts/playwright/`:

```bash
cd /home/user/ipas-ai-game/scripts/playwright
npm run serve     # = cd ../../src && python3 -m http.server 8000
```

### 3. 跑測試

```bash
cd /home/user/ipas-ai-game/scripts/playwright
npm test                              # 跑全部
npx playwright test 04-exam-exit      # 跑單個
npm run test:headed                   # 帶 UI 跑(debug 用)
```

### 4. 換 base URL(可選)

```bash
PW_BASE_URL=http://localhost:5500 npx playwright test
```

---

## 設計決定

- **headless chromium only**:CI 跑 100ms 一輪,夠用;multi-browser 之後需要再加 firefox/webkit projects。
- **`fullyParallel: false` + `workers: 1`**:題庫 / Storage 是全域單例,平行跑會互相污染 localStorage。
- **`actionTimeout: 5_000` / `navigationTimeout: 10_000`**:本機 static server 應該都在 1s 內回,給 5x 緩衝。
- **`trace: 'retain-on-failure'` + `screenshot: 'only-on-failure'`**:失敗時自動留 trace,看 `test-results/` 重播。

---

## 不在 baseline 範圍(後續)

- Mode 2 / 3 / 4 / 5 / 8 詳細流程(只 02 跑了 Mode 1、03 跑了 Mode 7、04 抽 Mode 1+7+8 抽樣)
- DrillSession 下鑽 → callback → 父場結算回流(案例 6)
- Storage migration(案例 9)
- Visual regression(snapshot 比對)
- Cross-browser(firefox / webkit)

加新 spec 命名規則:`NN-<feature>.spec.js`,`NN >= 06`。
