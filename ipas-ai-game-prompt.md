# IPAS AI 遊戲專案 — 主提示詞(Meta-Prompt)

> **此檔角色**:單一可執行 spec,給任何接手的 AI agent / sub agent / 新會話用。讀完此檔即可不斷層續建本專案。
>
> **維護規則**:每次對話新增規則、修正缺陷、發現漏抓 bug 模式時,**必須回頭更新此檔**(對應段落 + 「修訂歷史」)。違反此維護規則 = 累積技術債。
>
> **檔案絕對路徑**:`C:\Users\marco\.ipas-ai-game\ipas-ai-game-prompt.md`

---

## 0. 專案宣言(必讀,不可妥協)

| 項目 | 值 |
|:--|:--|
| 名稱 | IPAS AI 應用規劃師中級互動學習遊戲 |
| 考試名稱 | IPAS AI 應用規劃師中級能力鑑定 |
| 考試日 | **2026-05-23** |
| 開發啟動 | 2026-05-09 |
| 主目錄 | `C:\Users\marco\.ipas-ai-game`(注意:不在 Documents 下,避開 home 空殼 git repo) |
| 部署 | 純前端 SPA,單檔 HTML + 動態載入 mode JS,本機 `python -m http.server 8000` |
| Git remote | `marco3939/ipas-ai-game`(階段 8 才 push) |
| 範圍 | 科目一 (L21) + 科目三 (L23) + 科目二 (L22) 邊界重疊 |
| 風格 | RPG / Match-3 / Pipeline 拼圖 / Bug 獵人 / 弱點獵人 — 五案並做,**真互動非按鈕劇** |

---

## 1. 六大鐵律(Iron Rules,違反即任務失敗)

> 所有 sub agent prompt 必須複製這六條進去,作為硬約束。

### 鐵律 #1 — 錯題驅動下鑽學習
**規範**:
- 每題必有完整 `explanation.correct + explanation.wrong(每錯選項都有 key) + explanation.hook`
- `misconceptions ≥ 1 條` + `related_node_ids ≥ 1 個 kb 真實節點`
- 答錯後可進入 `DrillSession`(三階下鑽:換角度 → 易混淆對手 → 加深難度)
- DrillSession 回戰鬥用 `onComplete` callback,**不可踢回主頁**
- DrillSession 內再答錯能再下鑽(deep drill)

**Why**:使用者明示為設計鐵律。違反 = 學習迴圈斷裂 = 設計失敗。

**How to apply**:
- 階段 6 題庫生成時 enforce schema
- 階段 7 mode 開發時必呼叫 `DrillSession.start(nodeId, generateVariation(q,3), q, callback)`
- callback 內務必檢查 `state` 仍存在(避免 stale gameOver setTimeout 洗掉畫面)

### 鐵律 #2 — 題庫動態化(每場不同)
**規範**:
- `shuffle_options: true`(每題必加,每場 ABCD 順序不同)
- 計算題 / 數值題用 `stem_variables` 多 case 池(≥ 3 case)
- 每場遊戲 `RNG.set(Date.now())` 重新洗牌
- 變化型在執行時動態生成(`generateVariation`)

**Why**:防止死記題目,符合臨場考試多樣性。

**How to apply**:
- `questions*.json` schema 為「模板 + 變數池」
- 共用層 `renderQuestion` 自動帶入變數 + 洗牌

### 鐵律 #3 — 不可複製 114-2 原題(全原創)
**規範**:
- 全原創情境(醫療 / 金融 / 製造 / 零售 / 教育 / 自駕車 / 政府...)
- 可參考 114-2 知識點但**改情境、改數字、改角度**
- 原題禁區:不可直接複製 stem 文字、選項、答案組合

**Why**:避免侵權 + 增加陷阱深度 + 跨產業應用思維。

**How to apply**:
- 每批題目生成後,人工抽樣比對 114-2 原題
- 若高度相似 → 重寫情境

### 鐵律 #4 — 選項長度均衡(防「選最長 = 對」)
**規範**:
- 單選題:**正解長度 / 平均錯解長度 ∈ [0.85, 1.20]**
- 「最長 = 正解」比例 ≤ 35%(理想 25%,即與隨機相當)
- 錯解必須是「看似專業合理的另一個描述」,**不可短小敷衍**
- 不得標示「(錯誤)」「(混淆)」「(陷阱)」等洩漏答案的詞語

**Why**:使用者實測發現「只要選最長的就幾乎全對」,等於繞過真正的學習。

**How to apply**:
- **稽核腳本**:`node scripts/audit-option-length.js`(必須通過)
- 修法雙手法:**錯解擴寫**(主)+ **正解精簡**(次,把英文補語移到 explanation)
- 寫題後 self-check ratio,不通過自動重寫

### 鐵律 #5 — 來源忠實性(零幻覺)
**規範**:
- 每題的 `knowledge_code` 必須是 `kb/scope.json` 列出且 `include=true` 的合法編碼(L21/L22 邊界/L23,共 ~29 個)
- 每題的 `node_id` 必須是 `scripts/kb-allowed-nodes.json` 中真實存在的 ID
- `related_node_ids` 內每個 ID 都必須在 kb 真實
- **絕對不可造假**:技術名詞、公式、流程必須在 kb 該節點 summary/key_points/misconceptions 涵蓋,或在 IPAS 中級官方考綱範圍
- **不可考超出中級的工程細節**:LoRA / RLHF / GPTQ / SentencePiece / SHAP / Xavier 初始化 / BatchNorm / ResNet 數學證明 / Cohen Kappa / Hyperband / TPE / Feature Store / INT8 量化 / Triton / DP-SGD / PATE / Counterfactual Fairness / Calibration Plot — 全部禁用

**Why**:使用者明示「絕對不可以有幻覺產生的考題跟有幻覺的正確解答」。違反 = 誤導考生 = 設計失敗。

**How to apply**:
- **稽核腳本**:`node scripts/audit-source-fidelity.js`(必須 100% 合規)
- Sub agent 寫題時**禁止憑空**,必須先讀 `scripts/kb-allowed-nodes.json` 限定 node_id
- 升級 mode 時不得新增題目(只能用既有 questions*.json),違者標 NEEDS_DELETION

### 鐵律 #6 — 科目隔離性(新增科目資料不污染其他科目)
**規範**:
- 新增**任一**科目(科一/科二/科三)的題目或 KB 節點時,**禁止修改其他科目既有的 `questions*.json` 與 `kb/nodes-subject-*.json`**
- 新題庫一律放**獨立檔**(如 `questions-batch-nN-subjectK.json`),不得 inline 進其他科目批次檔
- 新 KB 節點放對應科目檔(如 `kb/nodes-subject-2.json`),不得借用其他科目檔承載
- 跨檔共用層(`scripts/audit-*.js` Q_FILES、`scripts/kb-allowed-nodes.json`、`src/index.html` `loadQuestions()` 清單、`src/modes/mode6.js` 科目 filter)的修改僅限**純 additive**(加分支、加檔名),不得改既有科目的處理邏輯
- 跨科目重疊概念(如 L22101 ↔ L23101 統計):新增科目的節點 `related_node_ids` 可指向其他科目節點,但**反向不可**(不得回頭修既有節點加新引用)

**Why**:使用者明示「新加入的科目二資料不可以影響到其他科目的考題跟 KB」。違反 = 既有 mastery / wrongbook / drill 行為被連坐改變 = 已通過驗證的科目資料退化。

**How to apply**:
- 開工前列「**新增檔清單**」與「**additive 修改檔清單**」兩類,任一檔出現「修改既有科目內容」即為違反
- Commit diff 自驗:`git diff` 不得出現既有 `questions-batch-n[1-8]*.json`、`kb/nodes-subject-1*.json`、`kb/nodes-subject-3*.json` 的內容變更
- Sub agent prompt 必含本鐵律 + 嚴格約束「你只能新建以下檔案 / 你不可修改以下檔案」清單

---

## 2. 工作目錄與檔案結構

```
C:\Users\marco\.ipas-ai-game\
├─ ipas-ai-game-prompt.md       # 本檔(meta-prompt,任何 AI 第一個讀)
├─ src\
│  ├─ index.html                 # 主檔(SPA + 共用層 + style),~1219 行
│  ├─ modes\                     # 5 案遊戲 mode 檔
│  │  ├─ mode1.js                # 案 1 AI 顧問救援 RPG(BOSS 戰)
│  │  ├─ mode2.js                # 案 2 程式判讀道場(Bug 獵人 RPG)
│  │  ├─ mode3.js                # 案 3 ML Pipeline 拼圖(SVG drag-drop)
│  │  ├─ mode4.js                # 案 4 易混淆配對戰(Match-3 + Pointer Events)
│  │  └─ mode5.js                # 案 5 弱點獵人(自適應 RPG,Wrongbook 驅動)
│  └─ questions*.json            # 17 題庫檔,共 325 題
│     ├─ questions.json                  # 50 baseline
│     ├─ questions-pa-code.json          # 程式判讀
│     ├─ questions-pb-visual.json        # 表格判讀
│     ├─ questions-pc-modes.json         # matching/sequence/calc(各 mode 必需)
│     ├─ questions-pd-scenario.json      # 情境決策
│     ├─ questions-pe~ph                 # 進階(已大幅縮減,P1 刪 27 後)
│     └─ questions-batch-n1~n8.json      # P2 sub agent 生成的 197 題
├─ kb\                           # 87+ 個 kb 真實節點
│  ├─ scope.json                 # 34 個合法 knowledge_code(IPAS 官方)
│  ├─ exam-patterns.json         # 考試題型分析
│  ├─ nodes-subject-1.json       # 科一節點
│  ├─ nodes-subject-1-extended.json
│  ├─ nodes-subject-3.json       # 科三節點
│  └─ nodes-subject-3-extended.json
├─ docs\
│  ├─ progress.md                # 當前進度快照(每階段更新)
│  ├─ plan.md                    # 歷次決議
│  ├─ design.md                  # 階段 5 設計文件
│  └─ ...
├─ scripts\                      # 稽核 + 工具腳本(必跑)
│  ├─ audit-option-length.js     # 鐵律 #4 稽核
│  ├─ audit-source-fidelity.js   # 鐵律 #5 稽核
│  ├─ audit-source-classify.js   # #5 違反分類
│  ├─ kb-allowed-nodes.json      # sub agent 寫題白名單(94 nodes/21 codes)
│  ├─ list-kb-nodes.js           # 重新生成白名單
│  ├─ check-globals.js / v2 / v3 # 跨檔契約掃描(QA Round 2 工具)
│  ├─ check-mode1-boss-pool.js   # BOSS 篩題量化
│  └─ delete-questions.js        # 批次刪題工具
├─ 01指引\ 02歷年考題\ 03參考資料\  # 來源資料(gitignored)
└─ .gitignore / README.md / CHANGELOG.md
```

---

## 3. 共用層 API 契約(index.html)

> Mode 檔不可重新實作這些;直接呼叫即可。

### 3.1 全域變數(scope 規則 — 重要!)

| 名稱 | 宣告類型 | 行 | 是否掛 window |
|:--|:--|:--:|:--|
| `QUESTIONS` | `let QUESTIONS = []` | 537 | **不掛** — 但 line 564 顯式 sync `window.QUESTIONS = QUESTIONS` 雙保險 |
| `Storage` | `const` | 393 | 不掛(裸名讀) |
| `RNG` | `const` | 405 | 不掛 |
| `Progress` | `const` | 466 | 不掛 |
| `Mastery` | `const` | 483 | 不掛 |
| `Wrongbook` | `const` | 514 | 不掛 |
| `PlayEngine` | `const` | 726 | 不掛 |
| `DrillSession` | `const` | 874 | 不掛 |
| `GameFX` | `const` | 1075 | 不掛 |
| `Player` | `const` | 1188 | 不掛 |
| `Mode4` | `const` | 1041 | 預設 placeholder,mode4.js 用 `Object.assign` 就地替換 |
| `applyVariables / pickCase / renderQuestion / loadQuestions / generateVariation / showToast / show / goHome / goStats / refreshHome / renderWeakList / enterMode / renderStats / resetAll / highlightCodeSimple / renderVisualData` | `function` | 各處 | **掛 window**(function 宣告自動掛) |

### 3.2 黃金規則 — Mode 檔讀全域變數
- ✅ **裸名讀** const/let/function:`QUESTIONS.filter(...)`、`Player.load()`、`GameFX.flash()`
- ❌ **不可** `window.X` 讀 const/let:`window.QUESTIONS` 對 `let QUESTIONS` 永遠是 undefined → critical bug
- 例外:`window.Mode1~5` 由 mode 檔顯式 `window.ModeN = ModeN` 設定,可以讀

### 3.3 Mode 接口(window.ModeN)
- 必要:`Mode_.start()` — 進入該案的入口
- 慣例:`Mode_.state` — 戰鬥狀態(離場時必須清為 null)
- index.html `enterMode(n)` 行 712-723:
  - `mode === 4`:走 const `Mode4.start()`(注意!不是 window.Mode4)
  - 其他:走 `window['Mode' + mode].start()`

### 3.4 必呼叫的 API
- `Storage.get/set/del(key)` — localStorage 包裝
- `RNG.set(seed) / pick(arr) / pickN(arr,n) / shuffle(arr)`
- `Player.load() / save(p) / damage(n) / heal(n) / gainExp(n) / reset()`
- `Mastery.load() / save() / get(nodeId) / update(nodeId, isCorrect) / drillBonus(nodeId)` — 0-100 score
- `Wrongbook.add(qid, nodeId, userChoice, correctChoice) / load() / markMastered(qid)`
- `Progress.addAnswer(isCorrect) / addSession()`
- `GameFX.flash(kind) / shake(el) / damageNumber(el, n, opts) / attackAnim(from, to) / combo(n) / hideCombo() / confetti() / bigConfetti() / levelUp(n)`
- `DrillSession.start(nodeId, questions, originalQ, onComplete)`
- `generateVariation(originalQ, count=3)` — 三階下鑽變化型
- `renderQuestion(q)` — 帶入 stem_variables + 洗牌 options
- `renderVisualData(q)` — 渲染 table_data / chart_data
- `highlightCodeSimple(code)` — 程式碼語法高亮
- `showToast(msg, ms?) / show(viewId) / goHome() / refreshHome()`

---

## 4. 題目 Schema(每題必遵守)

```json
{
  "id": "q_xxx_001",
  "knowledge_code": "L21101",                    // 必在 scope.json
  "node_id": "n_L21101_002",                     // 必在 kb-allowed-nodes.json
  "subject": 1,                                  // 1 / 2 / 3
  "format": "single_choice",                     // 或 matching / sequence / calculation / code_reading
  "difficulty": "medium",                        // easy / medium / hard
  "source_level": "L1",
  "errata_critical": false,                      // 高頻必出題
  "must_cover": false,
  "stem": "...{descriptor}...",                  // 可帶 {變數}
  "stem_variables": { "descriptor": ["主要","核心"] },
  "code_block": "...",                           // 程式判讀題用
  "table_data": { "header": [], "rows": [[]] },  // 表格判讀題用
  "chart_data": { "type": "bar", ... },          // 圖表題用
  "options": [
    { "text": "...", "is_correct": false, "trap_type": "...錯點本質..." },
    { "text": "...", "is_correct": true },
    ...
  ],
  "shuffle_options": true,                       // 鐵律 #2 必加
  "explanation": {
    "correct": "為何此選項正確...",
    "wrong": {
      "<錯選項text 全文>": "為何錯,正確觀念為何...",
      ...
    },
    "hook": "口訣 / 對比 / 記憶提示"
  },
  "misconceptions": ["常見誤解 1", "常見誤解 2"],
  "related_node_ids": ["n_L21101_xxx"],
  "exam_appearance": [{"exam":"114-2","q":16,"subject":3}],
  "tags": ["NLP", "Transformer", "..."]
}
```

**計算題額外**:`options_template` 可定義隨 case 變動的選項。

---

## 5. 開發階段(已執行歷史)

| # | 階段 | 狀態 | 重點 |
|:-:|:--|:-:|:--|
| 0 | 環境核對與目錄建構 | ✅ | 移到 `~/.ipas-ai-game` 避空殼 git |
| 1 | 範圍劃定(讀 01指引/) | ✅ | scope.json 34 個合法 codes |
| 2 | 考古題模式分析 | ✅ | exam-patterns.json |
| 3 | 知識節點抽取 | ✅ | 87+ kb nodes |
| 4 | 5 種遊戲方案提案 | ✅ | 使用者選「全做」 |
| 5 | 詳細設計討論 | ✅ | docs/design.md |
| 6 | 題庫生成 | ✅ | 325 題,5 鐵律全合規 |
| 7 | 網站建置(共用層 + 5 模式) | ✅ | RPG / Match-3 / Pipeline / Bug Hunter / Weakness Hunter |
| 7-QA | 雞蛋挑骨頭 QA(Round 1+2) | ✅ | 68 處 bug 修補 |
| 8 | 推送 GitHub | ⏳ | LICENSE 雙軌(MIT for code + CC BY-NC-SA for content)、README、dev branch + PR |

---

## 6. Sub Agent 派送原則(從 Round 1/2 學到)

### 6.1 派送決策樹
- **單檔變動 + 範圍清楚** → 1 個 agent
- **多檔但獨立**(如 8 個 batch JSON、5 個 mode) → N 個平行 agent,每 agent 一檔
- **大規模重做**(155 題重指、200 題生題) → 4-8 個 agent,按主題切分
- **Cross-cutting 整合驗證** → 1 個 integration agent(讀全部、不修)

### 6.2 Prompt 必含元素(模板)
```
## 任務(動詞 + 範圍 + 目標數值)

## 背景(專案脈絡 + Why,讓 agent 知道意義)

## 工作目錄
C:\Users\marco\.ipas-ai-game

## 你只能改 X 個檔(列清單)
嚴禁改動:其他 modes/、index.html、questions*.json、kb/(視任務)

## 必讀(請先 Read 完整檔案)
1. ...
2. scripts/kb-allowed-nodes.json(若涉題庫)

## 五大鐵律(複製本檔 §1)
- 不重複貼,但明確列「本任務最關鍵的鐵律是 #X」

## 嚴格約束(可改 vs 不可改清單)
- 可以改:options[i].text + explanation.wrong key
- 絕對不可改:id / stem / answer / is_correct ...

## 工具
- Read / Edit(每題一個 Edit,不要 Write 整檔重寫)
- Bash:`node -c file.js` 語法檢查

## 完成後請回報(繁體中文,結構化)
```
1. 修正了什麼(列清單)
2. NEEDS_REVIEW(列清單)
3. 自驗結果(鐵律 ratio / 契約檢查)
4. 不確定點
```

請開始,**不要過度思考**,直接讀檔→改檔→驗證→回報。
```

### 6.3 反模式(避免)
- ❌ **Vague 指令**:「改善 mode2」→ 沒有可驗收標準
- ❌ **同一檔多 agent**:race condition,結果互蓋
- ❌ **未列鐵律**:agent 可能憑空生成違反鐵律
- ❌ **未列 white list**:agent 自造 knowledge_code / node_id
- ❌ **過大批次**:Agent 處理 24+ 題 + 多 Edit 容易 stall(Round 1 經驗:Agent B 600s 無進度)
- ❌ **「主動防呆」**:Sub agent 沒被要求加 null guard 時別主動加(Round 1 QA3/4 主動把 `QUESTIONS` 改 `window.QUESTIONS || []` 引入 P0 bug)

### 6.4 派送上限
- 同時最多 8-10 個背景 agent(避免主對話 context 爆炸)
- 拆批:24+ 題的任務拆成 12+12 兩個 agent

---

## 7. 稽核機制(每次 commit 前必跑)

### 7.1 自動化 audit
```powershell
cd C:\Users\marco\.ipas-ai-game
node scripts/audit-option-length.js      # 鐵律 #4
node scripts/audit-source-fidelity.js    # 鐵律 #5
```

**通過標準**:
- 鐵律 #4:`旗標題 = 0`、`均衡率 ≥ 95%`、`avg ratio ∈ [0.95, 1.15]`
- 鐵律 #5:`合規率 = 100%`、`違反 = 0`

### 7.2 跨檔契約檢查(QA Round 2 教訓)
**「靜態審查 ≠ 執行測試」** — 必須做以下:
1. **列 mode 用到的所有外部全域**(grep `window.X` + 裸名 X)
2. **對照 index.html 宣告類型**:`let/const` 不掛 window;`var/function` 自動掛
3. **找契約破洞**:`window.X` 讀取但 X 是 `let/const` = critical bug(就像 Mode3/4 的 `window.QUESTIONS`)
4. **跑 Node mock**:用 `node -e "..."` 載入 questions JSON,模擬 mode.start 的 filter 邏輯,驗證 length > 0

### 7.3 Happy Path Trace(每個 mode 必做)
模擬使用者操作,逐步寫出每行的 data flow:
1. `enterMode(N)` → `Mode_.start()` 入口
2. 讀題庫 / 渲染 UI
3. 答對 / 答錯 / 用招式
4. DrillSession 入口 + onComplete callback
5. victory / defeat / gameOver
6. **每步驟列**:用到哪些全域、哪些 setTimeout / GSAP timeline、哪些 DOM 元素、哪些可能 silent fail / throw

### 7.4 Edge Case 檢查清單
- [ ] 題庫不足 N 題(被刪題後)
- [ ] HP=0 時點下鑽會被 gameOver setTimeout 洗掉?
- [ ] 中途點 home 後 timer 仍跑導致畫面被搶?
- [ ] 連續快速點擊雙扣 HP?
- [ ] DrillSession 中再答錯能再下鑽(deep drill)?
- [ ] Combo 上限後再加是否爆?
- [ ] 升級恰擊敗 BOSS 同 race?
- [ ] Wrongbook / Mastery 殘留 stale nodeId 怎處理?
- [ ] 多指(touch)同時拖拉?
- [ ] 拖出視窗外 elementFromPoint 回 null?

---

## 8. 自我驗證機制(防止「上次漏抓 bug」再現)

### 8.1 改 `window.X` 之前必做
1. **Grep `window\.X`** 在整個專案出現幾次
2. **Grep `let X` / `const X` / `var X` / `function X`** 在 index.html 怎麼宣告
3. 若 `let/const X` + 任一處讀 `window.X` → 拒絕此修改,改用裸名

### 8.2 改 mode 邏輯之前必做
1. **跑 `node -c modes/modeN.js`** 語法檢查
2. **寫 mock 腳本**(在 `scripts/` 下)模擬 happy path 跑一遍
3. **跑 audit**:鐵律 #4 + #5 不可退步

### 8.3 加 sub agent 修補之前必做
1. **明確列 critical path**(start → render → answer → drill → finish)
2. **明確列「不可改」清單**(stem / answer / explanation / kb 真實 ID)
3. **要求 agent 跑 `node -c` 自驗**

### 8.4 每次 commit 前 checklist
- [ ] `audit-option-length.js` 通過
- [ ] `audit-source-fidelity.js` 通過
- [ ] 5 個 mode 各自 `node -c modes/modeN.js` 通過
- [ ] `git diff` 看實際變動(不只看 agent 的回報摘要)
- [ ] commit message 含「Why」、「What changed」、「破洞如何抓到」

---

## 9. Round 1 + Round 2 累積教訓(寫實案例庫)

> 任何新 sub agent 必讀此節,避免重蹈覆轍。

### 案例 1:`window.QUESTIONS` 對 `let QUESTIONS`(QA Round 1 漏抓,critical)
- **症狀**:Mode3/4 開啟立刻顯示「找不到題目」
- **根因**:QA3/QA4 為 null safety 把 `QUESTIONS` 改 `window.QUESTIONS || []`,但 `let QUESTIONS` 不掛 window 永遠 undefined
- **教訓**:讀 `window.X` 前必須驗證 X 在 window 上;改 const/let 讀取方式時必跨檔 grep 對稱性
- **防禦**:本檔 §3.1 必讀;改前跑 §8.1 三步驟

### 案例 2:Sub agent stall(Round 1 Agent B,600s 無進度)
- **症狀**:24 題的批次工作卡住,完全沒進度
- **根因**:批次太大 + 每題多 Edit + 解釋擴寫太冗長
- **教訓**:超過 20 題的工作要拆批;prompt 加「不要過度思考」
- **防禦**:派送策略 §6.4

### 案例 3:enterMode(4) 走 const-bound `Mode4`(Round 1 QA4 抓到)
- **症狀**:Match-3 永遠不會被觸發,跑舊 inline placeholder
- **根因**:`const Mode4 = {...}` 在 index.html,動態載入 mode4.js 後 `window.Mode4 = ...` 不影響 const
- **修法**:mode4.js 用 `Object.keys(Mode4).forEach(delete) + Object.assign(Mode4, NewImpl)` 就地替換

### 案例 4:Mastery 整合斷層(Round 1 QA5 抓到)
- **症狀**:Mode5 玩 1000 題,首頁弱點分析仍說「尚無資料」
- **根因**:Mode5 用 `adjustMasteryScore` 自寫 mastery,沒 bump `attempts/correct/streak`,首頁 `renderWeakList` 篩 `attempts > 0` 看不到
- **教訓**:繞過共用層自寫機制要驗證觀測點

### 案例 5:Stale nodeId 阻斷 Step 3 fallback(Round 2 抓到)
- **症狀**:Wrongbook 殘留指向已刪題目的 nodeId,Step 1/2 占滿但全 stale,Step 3 不啟動,玩家卡空 BOSS 列表
- **根因**:過濾 stale 在最後做 `validBosses.filter`,但沒過濾 Step 3 觸發條件
- **教訓**:過濾要前置到資料源,不要等到最後 hack

### 案例 6:drillThis vs gameOver setTimeout race(Round 2 抓到)
- **症狀**:HP=0 時點「立即下鑽」進 DrillSession,1.5s 後 gameOver setTimeout 醒來把畫面洗成「你倒下了」
- **根因**:單看一函數 OK,跨函數時序賽跑現形
- **教訓**:Happy Path Trace 必跨函數 trace setTimeout / GSAP / async

### 案例 7:題庫被刪後 BOSS HP 殘血(Round 1 → Round 2 補修)
- **症狀**:probability BOSS HP 50,玩家答對 1 題只造 27 傷,殘 23 HP 後突然跳 victory
- **根因**:Round 1 修補時用固定 HP floor=50,沒對齊實際 baseDmg=27
- **教訓**:平衡公式必須 trace 上下游;Mode2 改用 `max(perQ, qcount*perQ)` 對齊

### 案例 8:Calculation 題 placeholder 沒替換(critical,Round 1+2 + 交叉驗證全漏抓)
- **症狀**:瀏覽器顯示 `A. {answer}` `B. {wrong1}`,而非實際數值如 `A. 2.50` `B. 0.50`
- **根因**:`renderQuestion` 函數只對 `stem` 做 placeholder 替換,**沒處理 `options[].text` 與 `explanation.correct/wrong/hook`**;且原本一行 `is_correct: o.text === v` 因 string 比較失敗反而把 is_correct 從 true 改成 false → **正解標記都被吃掉了**(嚴重副作用)
- **影響**:全部 17 題 calculation 題都壞,玩家完全看不到正解
- **為何 QA Round 1+2 + 機器稽核全部漏抓**(系統性盲點):
  1. **沒人實際開瀏覽器測試**:全部做靜態 read code + Node mock + audit script,但 `renderQuestion` 在瀏覽器執行才會跑;Node mock 沒 stub `document` / DOM,執行路徑沒觸發
  2. **Audit scripts 看 schema 不看 rendered output**:`audit-option-length.js` 量字串長度,`{answer}` 也是字串通過檢查;`audit-source-fidelity.js` 只看 knowledge_code / node_id;**沒有 audit 檢查 rendered output 的 placeholder 殘留**
  3. **共用層被當黑盒**:5 mode QA 看 mode 檔,但 `renderQuestion` 在 index.html 共用層;Integration QA 看跨檔契約但沒驗共用層邏輯正確性
  4. **Happy Path Trace 沒涵蓋 calculation 路徑**:QA trace 預設 `single_choice`,calculation 分支(5% 題目)沒被走過
  5. **寫題 sub agent 沒驗自己題目能渲染**:N1~N8 確認 stem_variables 結構對,但沒模擬 renderQuestion 跑一次
- **修補**:重寫 `renderQuestion` 的 case 替換,對 stem + options.text + explanation.correct/wrong/hook 全面 placeholder 替換;移除有問題的 `is_correct: o.text === v`
- **加固**:新增 `scripts/audit-render.js`(模擬 renderQuestion 驗 rendered output 無 placeholder 殘留 + is_correct count 正確),加入 commit 必跑清單
- **教訓**:
  - **Audit 腳本必涵蓋執行時行為**(不只 raw schema)
  - **共用層必有獨立 QA 角色**,不可被當黑盒
  - **Happy Path Trace 必涵蓋每種 format**(single / matching / sequence / calculation / code_reading)
  - **任何渲染相關修改必跑 mock render 驗輸出**
  - **使用者人工抽查瀏覽器是目前唯一可靠的「真實渲染驗證」**

---

## 10. Sub Agent 自我驗證模板(每個 sub agent prompt 結尾必加)

```
## 完成前必跑(自我驗證)

1. 語法檢查
   - 若改 .js 檔:`node -c &lt;檔案&gt;`
   - 若改 .json 檔:`node -e "JSON.parse(require('fs').readFileSync('&lt;path&gt;','utf8'))"`

2. 鐵律自驗
   - 若涉題庫:`node scripts/audit-option-length.js` + `node scripts/audit-source-fidelity.js`
   - 若涉 mode:跑 mock 模擬 start() 的篩題邏輯,確認 length > 0

3. 跨檔契約自驗(若改 mode 檔)
   - 列你用到的所有外部全域(window.X + 裸 X)
   - 對照 index.html 的宣告類型
   - **凡 `window.X` 讀取且 X 是 let/const 宣告 → REJECT,改裸名**

4. Happy Path Trace
   - 簡述 start() → render → answer → drill → finish 各步用到哪些全域與 timer
   - 標出可能 silent fail 點

5. 回報格式(必須結構化)
```
## 任務報告

### 自動修正(N 處)
1. ...

### NEEDS_REVIEW(M 項)
1. ...

### 自驗結果
- 語法:OK / FAIL
- 鐵律 #4 ratio:...
- 鐵律 #5 合規:...
- 跨檔契約:OK / 破洞列出

### 不確定點
1. ...
```
```

---

## 11. Git Workflow

### 11.1 Commit 顆粒度
- 一個邏輯變更 = 一個 commit
- 訊息格式:`type(scope): summary` + 多行詳細(`-m`)
- types:`feat / fix / refactor / docs / chore / test`

### 11.2 階段 8 Push 前 checklist
- [ ] LICENSE 雙軌(MIT for code + CC BY-NC-SA 4.0 for content)
- [ ] README.md 加完整使用說明 + 截圖
- [ ] 鐵律 #4 / #5 audit 全 100%
- [ ] 5 mode 全 `node -c` 通過
- [ ] dev/* branch 推 + PR
- [ ] CHANGELOG.md 更新

### 11.3 不可
- 不可 `git push --force` 到 main
- 不可 `--no-verify` 跳 hook
- 不可未經使用者同意 push 到 GitHub

---

## 12. 修訂歷史(每次更新此檔必加一行)

| 日期 | 版本 | 重點變更 | 觸發原因 |
|:--|:-:|:--|:--|
| 2026-05-09 | v0 | 專案啟動,5 鐵律前 4 條 | 階段 1-7 完成 |
| 2026-05-09 | v1 | 加鐵律 #4 選項長度均衡 | 使用者實測「選最長就對」 |
| 2026-05-09 | v2 | 加鐵律 #5 來源忠實性 | 使用者要求嚴查幻覺考點 |
| 2026-05-10 | v3 | 五案 RPG 化完成 + 題庫擴到 325 + QA Round 1 修 59 bugs | 使用者要求遊戲化 + 新題庫到 300 |
| 2026-05-10 | v4 | QA Round 2 修 9 bugs + 整合契約檢查 + 案例庫 §9 | 使用者抓出 Mode3/4 進不去,要更嚴 QA |
| 2026-05-10 | v5 | 首次寫此 meta-prompt 整合所有規則 | 使用者要求建立可維護的主提示詞 |
| **2026-05-10** | **v6** | **加案例 8 Calculation placeholder 殘留 + 強化 audit 機制** | **使用者抓出 calculation 題顯示 `{answer}`,QA 全部漏抓** |

---

## 13. 給未來接手 AI 的訊息

讀完此檔,你已經知道:
- 專案目標、時程、目錄結構
- 五大鐵律(任何違反 = 任務失敗)
- 共用層 API 契約 + scope 規則(`let/const` 不掛 window!)
- 題目 schema
- Sub agent 派送原則(拆批、明確、自驗)
- 稽核機制(audit scripts + 跨檔契約 + Happy Path Trace)
- Round 1/2 漏抓的 7 個典型案例

**下一步行動指南**:
1. 第一次接手 → 讀 `docs/progress.md` 了解當前進度,讀本檔知規則
2. 任何修改 → 跑 §8.4 commit 前 checklist
3. 任何發現新 bug 模式 / 新規則 → **更新本檔 §9 與 §12**
4. 任何 sub agent 派送 → 用 §6.2 模板 + §10 自驗模板

**最重要的一條**:**Static review ≠ Execution validation**。看 code 看似合理,跑起來才知有 bug。永遠跑 `node -c` + Node mock + audit 三件套。

---

> 此檔結束。違反此檔規則前請先更新此檔(走 §12 修訂歷史)。
