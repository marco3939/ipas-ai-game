# Changelog

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/),版本管理採 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### 2026-05-30 — 指揮官三軸 + Codex review 收官(本 round 12 PR / +109 題)

**A 線(安全)**
- CSP Report-Only meta(觀測模式,零破功能風險)
- `escHTML` 補強(mode5 / sm2 / confusion-matrix 三檔)
- Mode loader 白名單(防 createElement script 走漏)

**B 線(美觀 / 無障礙 — 兩批 12 個 a11y patch)**
- `prefers-reduced-motion` 全域 kill switch + JS GameFX guard(confetti / gsap / flash 全跳)
- `:focus-visible` 全域焦點 ring(鍵盤使用者看得到 Tab 位置)
- `aria-label` 標 header / bottom-nav / option button(報讀器朗讀完整)
- Modal `role="dialog"` + `aria-modal` + Esc 關閉 + 進場 focus(themes.js)
- WCAG AA 對比(light theme `--fg-mute` 2.56→5.x:1)
- WCAG 2.5.5 觸控目標 ≥ 44×44px
- `#play-explanation` `aria-live="polite"` 答題回饋自動宣告
- HP/timer/progress 加 `role="progressbar"` + `aria-valuenow` 同步
- `.m8-grid` mobile 單欄(Codex P2 修 CSS cascade 失效)

**C 線(考題)**
- L23 子代碼補平衡:+52 題(L23101/L23302/L23401 從 ~8 拉到 ~25 題)
- 鐵律 #4「最長=正解」 **40.1% → 24.9%**(達 ≤ 25% 目標,99 題 rebalance)
- `explanation.wrong` key ↔ option.text 同步 **285 → 0**(Codex P2 抓到後集中修)
- 修 3 個 subject-isolation 違規(n28 混 L22 + n7 knowledge_code 對不齊 node_id)

**測試與 CI**
- GitHub Actions 自動 audit gate(每 PR 跑 11 audit + 122 sandbox + jsdom browser-sim)
- 新增 `audit-subject-isolation.js`(鐵律 #6)+ `audit-explanation-desync.js`(案例 13)
- 新增 49 → 122 個 sandbox test(Mode 5+8 各 +3 / cross-mode + shared-layer + questions-kb 全清乾淨)
- 子代理 worktree 並行框架:11 個 agent 同時跑,7-13× 加速
- 新增 jsdom browser-sim test(44 assertion 真實 DOM 模擬)

**P3 視覺**
- `themes.js` + 11 主題色系(theme-factory) + 🎨 切換按鈕 + `localStorage` 持久化
- `:root` 抽 SSOT gradient token(`--grad-hp-*` / `--grad-time-bar` / `--grad-hero-*` 等)

**文件**
- `CLAUDE.md` 案例 11(sandbox 預設值 vs production 不對齊)
- `CLAUDE.md` 案例 12(exam-exit-protection 對稱配對)
- `CLAUDE.md` 案例 13(post-merge state drift,git 同 JSON value 互蓋)

**量化終局**
- 題目:905 → **1014**(+109)
- 三科占比:科一 22% → **25%**;科二 37% → 34%;科三 41% → 41%
- 「最長=正解」40.1% → **24.9%**
- 全題庫 desync 285 → **0**(+ CI gate 鎖死)
- 全 sandbox 失敗 6 → **0**(122/122 PASS)
- Codex P2 review 5 個全修(#53/#54/#60/#61×2/#62)

**已知 follow-up(Issue #58)**
- `explanation.wrong` schema 重構 `[{key, exp}]` 陣列(消除 key 脆弱性,10-14 小時專屬 session)

### Added — 2026-05-09(階段 0)
- 專案骨架:`kb/`、`src/`、`docs/` 目錄
- `.gitignore`(排除 materials 三個資料夾、所有 PDF/PPTX/DOCX、`.claude/`、敏感檔案類型)
- `docs/progress.md`(進度追蹤,/clear 後復原依據)
- `docs/plan.md`(各階段決議與風險登記)
- `README.md`(基本說明,階段 7 補完)
- Git 初始化於 `C:\Users\marco\.ipas-ai-game`,remote `origin` 指向 `marco3939/ipas-ai-game`

### Notes
- 工作目錄已從 `%USERPROFILE%\Documents\Claude\Projects\ipas-ai-game` 遷移至 `%USERPROFILE%\.ipas-ai-game`,理由見 `docs/plan.md`「環境意外」段。

### Added — 2026-05-09(階段 1)
- `kb/scope.json`:34 個官方知識編碼之納入/排除判定,29 納入 + 5 排除
- `docs/scope-review.md`:三欄對照表、邊界判定邏輯、勘誤要點、審視檢查清單(供使用者人工審視)
- 採用模式 B(輕量 bypass):階段內動作直接執行,僅在決策節點強制停
- 修正官方 PDF 排版錯字:科三 L233 之 L22303/L22304 → 正確 L23303/L23304

### Added — 2026-05-09(階段 3)
- `kb/nodes-subject-1.json`:28 nodes(科一 7/8 編碼覆蓋,L21201 留階段 6 生成)
- `kb/nodes-subject-3.json`:25 nodes(批 1)
- `kb/nodes-subject-3-extended.json`:32 nodes(批 2 擴充,科三 12 編碼全覆蓋)
- `kb/extraction-log.md`:6 批處理紀錄與決策
- 累計 85 nodes,全合規鐵律 #1(misconceptions / explanation_hooks / variation_seeds)
- 5 個 errata_critical 已嵌入

### Added — 2026-05-09(階段 2)
- `kb/exam-patterns.json`:114-2 考古題 100 題完整解析(科一+科三,科二邊界跳過)
- `docs/exam-pattern-summary.md`:Top 15 高頻主題、14 組易混淆配對、Python 程式碼考點、題型分布、權重建議
- 7 個高優先預測(Recall 公式、PDPA 六項、VGG16、DBSCAN、CV 方法、Drift、VAE/GAN/Diffusion)
- 題庫設計權重:科一 50% / 科三 50%,題型 70% 概念 + 20% 程式碼 + 5% 圖表 + 5% 計算
