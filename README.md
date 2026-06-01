# IPAS AI 應用規劃師中級 — 互動學習遊戲

> 為 2026-05-23 IPAS AI 應用規劃師中級能力鑑定設計的 **8 mode 互動學習遊戲**。
> 純前端 SPA,**1014 題原創題庫(科一 256 / 科二 340 / 科三 418)** + **錯題驅動下鑽** + **動態題庫(防死記)** + **11 主題色系** + **無障礙(WCAG AA + 鍵盤 + 報讀器)**。

[![License: MIT](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Content: CC BY-NC-SA 4.0](https://img.shields.io/badge/Content-CC%20BY--NC--SA%204.0-orange.svg)](LICENSE-CONTENT.md)
[![CI](https://github.com/marco3939/ipas-ai-game/actions/workflows/audit.yml/badge.svg)](https://github.com/marco3939/ipas-ai-game/actions/workflows/audit.yml)

---

## 免責聲明 / Disclaimer

> **本專案為獨立社群作品**,**非經濟部產業發展署 / 經濟部 iPAS 官方**製作,亦非工業技術研究院產業學院授權。
>
> 「iPAS AI 應用規劃師中級」為**經濟部產業發展署**所推動之**產業人才能力鑑定**(iPAS,小寫 i + 大寫 PAS)服務標章。
> 本專案題庫為**原創改寫**(嚴守鐵律 #3 不複製 114-2 原題),僅作為**非商業性學習練習工具**,**不代表官方考試內容**,亦**不可作為官方應試替代品**。
>
> 正式應試請以 iPAS 官方公告為準:<https://www.ipas.org.tw/>

---

## 七大鐵律(設計原則,不可妥協)

| # | 鐵律 | 為何重要 |
|:-:|:--|:--|
| 1 | **錯題驅動下鑽學習** | 每題必有完整 explanation,答錯可進入「換角度 → 易混淆對手 → 加深難度」三階變化型訓練,不是按下一題就過 |
| 2 | **題庫動態化** | 每場 ABCD 順序不同,計算題用 `stem_variables` 多 case 池,每場 RNG seed 變動,**防止死記題目** |
| 3 | **不複製 114-2 原題** | 全原創跨產業情境(醫療/金融/製造/零售/教育/自駕車...),可參考知識點但改情境 |
| 4 | **選項長度均衡** | 正解 / 平均錯解 ∈ [0.85, 1.20],「最長 = 正解」≤ 35%(目前 **24.9%**),**防止「選最長就對」** |
| 5 | **來源忠實性(零幻覺)** | 每題 `knowledge_code` / `node_id` 必須在官方 IPAS scope + kb 真實節點,**不考超綱工程細節** |
| 6 | **科目隔離性** | 新增 X 科資料不得修改其他科目既有題庫;共用層只允許 additive 修改(由 `audit-subject-isolation.js` 自動驗) |
| 7 | **題庫單一真相來源** | `src/questions-manifest.json` 是唯一 file list 真相,新增題庫檔必跑 `update-manifest.js`(由 `audit-qbank-integrity.js` 自動驗) |

完整定義見 [`ipas-ai-game-prompt.md`](ipas-ai-game-prompt.md)。

---

## 八個遊戲模式

| 案 | 名稱 | 玩法 | 題型來源 |
|:-:|:--|:--|:--|
| 1 | **AI 顧問救援 RPG** | 12 BOSS 對戰、HP/MP/Combo/3 招式、暴擊系統 | 全題庫(BOSS keyword 篩) |
| 2 | **程式判讀道場(Bug 獵人)** | 6 BOSS、靜態分析/執行模擬/Code Review 招式、code_block 語法高亮 | `format='code_reading'` |
| 3 | **ML Pipeline 拼圖** | SVG 渲染管線 + HTML5 native drag-drop + Pointer Events 行動裝置 fallback,90s 倒數 | `format='sequence'` |
| 4 | **易混淆配對戰(Match-3)** | 4×4/4×3/4×2 動態棋盤、Pointer Events 真拖拉、揭露/凍結/重排招式 | `format='matching'` |
| 5 | **弱點獵人** | 從個人 Wrongbook + Mastery 動態決定 BOSS,自適應難度,擊敗條件 mastery ≥ 0.8 | 動態 |
| 6 | **卡牌圖鑑** | 87+ KB 節點卡牌 + 主題挑戰(批次答題)+ 三科目過濾 | KB 節點 |
| 7 | **模擬考(80 分鐘)** | 60 題模考 + 倒數 + 標記 + 結算回顧 + SM-2 間隔重複複習 | 全題庫 |
| 8 | **程式追蹤道場** | step-by-step 程式碼追蹤(predict output / variable state)| `format='code_trace'`,57 題 |

**P3 視覺統一(2026-05)**:右上 🎨 主題切換按鈕,11 主題色系(預設電玩 Slate + Ocean / Sunset / Forest / Minimalist / Golden / Arctic / Desert / Tech / Botanical / Galaxy),`localStorage` 持久化。

**無障礙 a11y**:`prefers-reduced-motion` 全域自動跳動畫 / 鍵盤 `:focus-visible` ring / 報讀器 aria-label + live region / WCAG AA 對比 + 44×44px 觸控目標 / `role="progressbar"` HP / timer。

---

## 題庫(1014 題 / 53 檔)

| 科目 | 題數 | 占比 | 涵蓋編碼 |
|:--|:-:|:-:|:--|
| 科一(L21)| **256** | 25% | L21101-L21302 全 9 編碼 |
| 科二(L22)| **340** | 34% | L22101-L22404 全 13 編碼 |
| 科三(L23)| **418** | 41% | L23101-L23401 全 12 編碼 |
| **合計** | **1014** | | **34 個官方編碼全覆蓋** |

題目檔案位於 `src/questions*.json`,由 `src/questions-manifest.json`(鐵律 #7 SSOT)動態列載入。

每題經 **11 個自動 audit**(`scripts/audit-*.js`)+ **CI gate**(GitHub Actions):
- **鐵律 #4** `audit-option-length.js` — 均衡 98.1%、avg ratio 1.03x、「最長=正解」**24.9%**(達 ≤25% 目標)
- **鐵律 #5** `audit-source-fidelity.js` — 100% 合規(零超綱)
- **鐵律 #6** `audit-subject-isolation.js` — subject ↔ knowledge_code prefix 對齊 + 單檔同 subject
- **鐵律 #7** `audit-qbank-integrity.js` — manifest ≡ 實體 / 漂移偵測
- **案例 13** `audit-explanation-desync.js` — `explanation.wrong` key ↔ option.text 對齊(全題庫 **desync = 0**)
- 還有 `audit-render` / `audit-calculation` / `verify-calc-numeric` / `audit-mode-flow` / `audit-marker-integrity` / `audit-theme-tokens`

---

## 知識庫

`kb/` 87+ 個真實節點,從 IPAS 官方學習指引 + 勘誤表 + 114-2 歷屆考題抽取:

```
kb/
├── scope.json                     # 34 個官方 knowledge_codes(L21/L22 邊界/L23)
├── exam-patterns.json             # 題型分析
├── nodes-subject-1.json           # 科一節點
├── nodes-subject-1-extended.json
├── nodes-subject-3.json           # 科三節點
└── nodes-subject-3-extended.json
```

---

## 啟動

### 本機
```powershell
cd src
python -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

### 進度同步
所有遊戲進度寫入 `localStorage`(`ipas_progress_v1` / `ipas_player_v1` / `ipas_mastery_v1` / `ipas_wrongbook_v1` 等),清 cache 即重置。

---

## 結構

```
.
├── ipas-ai-game-prompt.md       # 主提示詞(任何 AI 接手必讀)
├── LICENSE                      # MIT(程式碼)
├── LICENSE-CONTENT.md           # CC BY-NC-SA 4.0(題庫/kb/docs)
├── src/
│   ├── index.html               # SPA 主檔(共用層 + style)
│   ├── modes/                   # 5 案遊戲 mode 檔
│   │   ├── mode1.js             # 案 1 RPG
│   │   ├── mode2.js             # 案 2 Bug 獵人
│   │   ├── mode3.js             # 案 3 Pipeline 拼圖
│   │   ├── mode4.js             # 案 4 Match-3
│   │   └── mode5.js             # 案 5 弱點獵人
│   └── questions*.json          # 17 題庫檔
├── kb/                          # 知識庫(94 nodes / 21 codes)
├── scripts/                     # 稽核 + 工具
│   ├── audit-option-length.js   # 鐵律 #4
│   ├── audit-source-fidelity.js # 鐵律 #5
│   ├── kb-allowed-nodes.json    # sub agent 寫題白名單
│   └── check-globals*.js        # 跨檔契約掃描
├── docs/
│   ├── progress.md              # 當前進度
│   ├── plan.md                  # 歷次決議
│   └── design.md                # 階段 5 設計
└── 01指引/ 02歷年考題/ 03參考資料/   # 教材(gitignored)
```

---

## 開發歷史

| # | 階段 | 重點 |
|:-:|:--|:--|
| 0 | 環境核對 | 移到 `~/.ipas-ai-game` 避空殼 git repo |
| 1 | 範圍劃定 | 讀官方學習指引 → scope.json |
| 2 | 考古題分析 | exam-patterns.json |
| 3 | 知識節點抽取 | 87+ kb 節點 |
| 4 | 5 案方案提案 | 使用者選「全做」 |
| 5 | 詳細設計 | docs/design.md |
| 6 | 題庫生成 | 325 題,5 鐵律全合規 |
| 7 | 網站建置 | 5 案 RPG 化 |
| 7-QA | 雞蛋挑骨頭 QA | Round 1 + Round 2 共修 **68 處 bug** |
| 8 | 推上 GitHub | 本檔狀態 |

詳見 `docs/progress.md`。

---

## QA 機制

本專案經兩輪 sub agent QA:

### Round 1(5 mode QA + 4 題庫 agent)
- 修補 59 處 bug
- 但漏抓「`window.QUESTIONS` 對 `let QUESTIONS` 永遠是 undefined」這個 critical bug,因為**只做靜態 read code 沒驗證執行時**

### Round 2(5 mode QA + 1 整合契約 QA)
- 補修 9 處 bug
- 新增**跨檔契約對照** + **Happy Path data flow trace** + **Node mock 執行時驗證**
- 寫成「7 個典型案例庫」記在 `ipas-ai-game-prompt.md` §9,防止重蹈覆轍

完整教訓見 `ipas-ai-game-prompt.md` §9-10。

---

## 授權

- **程式碼**(`src/*.html` / `src/modes/*.js` / `scripts/*`):**MIT License**(`LICENSE`)
- **題庫 + 知識庫 + 文件**(`src/questions*.json` / `kb/*.json` / `docs/*.md` / `ipas-ai-game-prompt.md`):**CC BY-NC-SA 4.0**(`LICENSE-CONTENT.md`)
- **教材**(`01指引/` / `02歷年考題/` / `03參考資料/`):**不在本專案版控**,著作權歸經濟部 IPAS / 原出版單位

商業授權請另洽作者。

---

## 貢獻

任何 PR / 修改前**必先讀 `ipas-ai-game-prompt.md`**,該檔是專案唯一可執行 spec,涵蓋:
- 五大鐵律的硬約束
- Sub agent 派送原則(避免 stall / 避免主動防呆引入 bug)
- 自我驗證模板(改 `window.X` 前三步驟、跨檔契約對照、Happy Path Trace)
- 7 個案例庫(Round 1/2 漏抓的 bug 模式)

任何新規則 / 新 bug 模式 → **必須回頭更新 `ipas-ai-game-prompt.md` §9 與 §12 修訂歷史**。

---

## 致謝

- 經濟部 iPAS 提供官方學習指引與考綱(指稱性引用,非授權關係)
- Anthropic Claude Code 協作開發

### 第三方依賴授權

| 套件 | 版本 | 授權 | 官方授權連結 |
|:--|:--|:--|:--|
| [GSAP](https://gsap.com/) | 3.12.5 | **GreenSock Standard "No Charge" License**(2024 年由 Webflow 收購後對所有人免費,**含商業用途**;但禁止用於開發競爭性「無程式碼視覺動畫建構工具」、禁止 reverse engineering 製造競品、禁止移除內建 proprietary notice) | <https://gsap.com/standard-license> |
| [canvas-confetti](https://github.com/catdad/canvas-confetti) | 1.9.3 | **ISC License**(© 2020 Kiril Vatev,permissive,與 MIT 法律效力等價) | <https://github.com/catdad/canvas-confetti/blob/master/LICENSE> |

> **下游 fork 注意**:GSAP 並非 MIT 授權,fork 本專案者仍須遵守 GreenSock Standard No Charge License 條款(主要影響「不得用於建構與 Webflow 競爭的視覺動畫工具」)。本專案作為教育用 SPA RPG 遊戲,使用情境**合規**。

---

> 為了讓考生真正理解,而不是只記住答案。
