# IPAS AI 遊戲專案 — 專案層 CLAUDE.md

> **基線**:全域 `~/.claude/CLAUDE.md` v3.1(orchestrator 通用合規 + 工作流框架)
> **本檔角色**:IPAS AI 中級互動學習遊戲**專案專屬** override / 補充規則
> **讀取順序**:全域先讀(基線)→ 本檔後讀(專案 override / 補充)
> 全域已涵蓋的內容(cardinal rules、3-phase pipeline、cross-validation modes、ground truth automation、anti-patterns、合規法規)**不在此檔重複**

---

## 1. 專案六大鐵律(IPAS 題庫設計專屬,完整定義見 `ipas-ai-game-prompt.md` §1)

| # | 鐵律 | 一句話 |
|:-:|:--|:--|
| 1 | **錯題驅動下鑽學習** | 每題必有完整 explanation;答錯走 `DrillSession.start(nodeId, generateVariation(q,3), q, callback)`;callback 必檢查 state 仍存在 |
| 2 | **題庫動態化** | 每題 `shuffle_options:true`;計算題 `stem_variables` 多 case 池;每場 `RNG.set(Date.now())` |
| 3 | **不複製 114-2 原題** | 全原創跨產業情境;改 ≥ 2 維度(情境 + 數字 / 選項措辭) |
| 4 | **選項長度均衡** | 正解/平均錯解 ∈ [0.85, 1.20];「最長=正解」≤ 35%;錯解寫得跟正解同等專業 |
| 5 | **來源忠實性** | `knowledge_code` 必在 `kb/scope.json` `include=true`;`node_id` 必在 `scripts/kb-allowed-nodes.json` |
| 6 | **科目隔離性** | 新增 X 科資料**不得**修改其他科目既有 `questions*.json` / `kb/nodes-subject-*.json`;新題庫放獨立檔;共用層(audit / index.html / mode6)只允許 additive(加分支、加檔名) |

**稽核腳本**(全域 §10 ground truth 在本專案的具體命令):
```powershell
cd C:\Users\marco\.ipas-ai-game
node scripts/audit-option-length.js     # 鐵律 #4
node scripts/audit-source-fidelity.js   # 鐵律 #5
node scripts/audit-render.js            # 渲染輸出(案例 8 教訓)
node scripts/audit-calculation.js       # calculation 題 schema
node scripts/verify-calc-numeric.js     # 數值正確性獨立驗算
node scripts/audit-mode-flow.js         # mode 流程跑驗 isCorrect/correctKey 非空(案例 10,待寫)
node scripts/audit-wrongbook-callers.js # Wrongbook.add 跨檔簽名一致性(案例 10,待寫)
```

---

## 2. 共用層 API 契約(JS 專案專屬,語言層級規則放專案層)

### 黃金規則 — `let/const` **不掛 window**
- ✅ 裸名讀:`QUESTIONS.filter(...)`、`Player.load()`、`GameFX.flash()`
- ❌ `window.X` 讀 `let/const X` = critical bug(案例 1 / Round 1 漏抓的根因)
- 例外:`window.ModeN` 由 mode 檔顯式 `window.ModeN = ModeN` 設定,可讀

### index.html 全域宣告類型對照(改 `window.X` 前必查)
| 名稱 | 宣告 | 行 | 是否掛 window |
|:--|:--|:-:|:--|
| `QUESTIONS` | `let` | 537 | **不掛** + 行 564 顯式 sync(雙保險) |
| `Storage` `RNG` `Progress` `Mastery` `Wrongbook` `PlayEngine` `DrillSession` `GameFX` `Player` `Mode4` | `const` | 各處 | 不掛(裸名讀) |
| `applyVariables` `pickCase` `renderQuestion` `loadQuestions` `generateVariation` `showToast` `show` `goHome` `refreshHome` `enterMode` `highlightCodeSimple` `renderVisualData` 等 | `function` | 各處 | **掛 window**(function 宣告自動掛) |

### Mode 接口
- 必要:`Mode_.start()`
- 慣例:`Mode_.state` — 戰鬥狀態(離場時必清為 null,避免 setTimeout race)
- enterMode(4) 走 const `Mode4`(非 window.Mode4),mode4.js 用 `Object.assign(Mode4, NewImpl)` 就地替換(案例 3)

---

## 3. 題目 Schema 與題庫白名單(專案資料層規則)

完整 schema 見 `ipas-ai-game-prompt.md` §4。

**白名單**:`scripts/kb-allowed-nodes.json`(94 nodes / 21 codes,sub agent 寫題唯一可用清單)

**禁用主題**(超出 IPAS 中級考綱,違反鐵律 #5):
LoRA / RLHF / DPO / GPTQ / SentencePiece / DAPT / RandAugment / Mixup / CutMix / ControlNet / SHAP / Permutation Importance / Xavier 初始化 / BatchNorm / LayerNorm / ResNet 殘差數學證明 / Gradient Clipping / WGAN / Isolation Forest / OC-SVM / Cohen Kappa / Calibration Plot / Hyperband / TPE / Feature Store / INT8 量化 / Triton / TorchServe / vLLM / DP-SGD / RDP / PATE / Counterfactual Fairness

---

## 4. Sub Agent Prompt 補充欄位(全域 §5 之上的專案層補充)

派 sub agent 改題庫 / 改 mode 時,prompt **必含**(全域 §5 已有,此處強調 IPAS 高頻踩雷點):

- **題庫改寫**:必貼 `kb/scope.json` 合法 codes 與 `scripts/kb-allowed-nodes.json` 白名單;明列「禁用主題清單」(本檔 §3)
- **改 mode 檔**:必列「**`window.X` 讀取前先 grep `let/const X`**」自驗(案例 1)
- **改共用層 renderQuestion / PlayEngine**:必跑 `audit-render.js` mock 驗 placeholder 殘留(案例 8)
- **改 BOSS 平衡參數**:必跨變數驗(boss HP vs baseDmg / qcount vs HP floor),案例 7 教訓

---

## 5. IPAS 專案 Known Failure Patterns(語言/框架/專案特定,全域 §14 不收)

> 全域 §14 已收錄**語言無關**共通模式。本節是本專案 JS / SPA / 題庫特定的補充案例。

### 案例 1:`window.QUESTIONS` 對 `let QUESTIONS`(critical)
- 症狀:Mode3/4 開啟立刻顯示「找不到題目」
- 根因:QA 為 null safety 改成 `window.QUESTIONS || []`,但 `let QUESTIONS` 不掛 window 永遠 undefined
- 修補:`window.QUESTIONS = QUESTIONS` sync;Mode 改回裸名讀
- 教訓:改 `window.X` 前必跨檔 grep `let/const X` 對稱性

### 案例 2:Sub agent stall(批次 24+ 題 600s 無進度)
- 修補:超過 20 條的工作必拆;prompt 加「不要過度思考」

### 案例 3:enterMode(4) 走 const-bound `Mode4`
- 症狀:Match-3 永遠不會被觸發,跑舊 placeholder
- 修補:`Object.keys(Mode4).forEach(delete) + Object.assign(Mode4, NewImpl)` 就地替換

### 案例 4:Mastery 整合斷層
- 症狀:Mode5 玩 1000 題首頁仍說「尚無資料」
- 根因:繞過共用層 `Mastery.update` 自寫 `adjustMasteryScore`,沒 bump `attempts/correct/streak`
- 教訓:繞過共用層自寫機制要驗證下游觀測點(對應全域 §14 第 2 條共通模式)

### 案例 5:Stale nodeId 阻斷 Step 3 fallback
- 症狀:Wrongbook 殘留指向已刪題目的 nodeId,Step 1/2 占滿但全 stale,Step 3 不啟動 → 玩家卡空 BOSS
- 修補:預建 `liveNodeSet` 在 Step 1/2/3 全域過濾(過濾要前置到資料源,對應全域 §14 第 3 條)

### 案例 6:drillThis vs gameOver setTimeout race
- 症狀:HP=0 點下鑽進 DrillSession,1.5s 後 gameOver 把畫面洗掉
- 修補:drillThis 前 `_clearAllTimers()` 清 pending gameOver;onComplete 內檢查 hp ≤ 0 走 gameOver
- 教訓:Happy path trace 必跨函數 trace setTimeout / Promise / GSAP timeline(全域 §14 第 4 條)

### 案例 7:題庫被刪後 BOSS HP 殘血
- 症狀:probability BOSS HP 50,玩家 1 hit 27 傷,殘 23 HP 才跳 victory
- 修補:`max(perQ, qcount * perQ)` 對齊 baseDmg(全域 §14 第 5 條共通模式)

### 案例 8:Calculation 題 placeholder 沒替換(critical,所有 QA 全漏抓)
- 症狀:瀏覽器顯示 `A. {answer}` `B. {wrong1}` 而非數值
- 根因:`renderQuestion` 只對 stem 替換,沒處理 options/explanation;且 `is_correct: o.text === v` string 比較失敗反而把 is_correct 從 true 改成 false
- 修補:`subAll(s)` helper 對所有 placeholder 全替換;移除 `is_correct: o.text === v`
- 加固:`scripts/audit-render.js` 模擬 renderQuestion 驗 placeholder 殘留 + is_correct count
- 教訓:audit 必涵蓋執行時行為(全域 §14 第 6 條共通模式);**使用者人工抽查瀏覽器是不可省略的最後一道防線**

### 案例 9:Stale cache as ground truth illusion(從 q_0025 場景學到)
- 症狀:使用者報「題目顯示舊版」,但本機 + raw GitHub URL 都是新版
- 根因:Browser / GitHub Pages / CDN cache,不是真 bug
- 修補:任何「使用者實測 vs 本機確認」不一致時,先驗證部署層 ground truth(raw URL / build status / cache headers)
- 注意:此模式已建議補進全域 §14(語言無關共通模式)

### 案例 10:Lineup.q.options 無洗牌後 key — 從 PR #5 起埋 13 PR 後爆發(critical)
- 症狀(2026-05-16 使用者回報):Mode 7 模考送出鎖定後對話框顯示「正解:undefined」,選對的選項被判答錯;歷史回顧紅框失效;Wrongbook userText/correctText 寫空字串;Mastery / SeenCorrect / SM2 / Progress 全部被污染(答對被記答錯)。
- 根因:`renderQuestion`(index.html:685-689)流程是「先洗牌再指派 A/B/C/D 鍵」,所以原始 QUESTIONS 的 options **沒有 key 欄位**;但 `state.lineup[i].q` 直接持有原版引用,Mode 7 內 9+ 處(submitCurrent / submitMock / _renderLockedFeedback / _commitToSharedLayer / _saveHistory / _renderReviewQuestion / expandAllExplanations / toggleWrongbookFromReview / _timeUp)用 `lineup.q.options.find(o => o.key === userKey)` 永遠找不到 → isCorrect=false / correctKey=''。
- 為何 13 PR 都沒抓到:PR #5 引入時 `_renderLockedFeedback` 是中性的(只說「結算後可看對錯」),bug 沉默 13 個月;PR #18 加「立即顯示對錯 + 正解」UI 才曝光「正解:undefined」字面;此期間 PR #11/#16/#17 都修「歷史回顧紅框」但因 fullLog snapshot 也用 lineup.q.options 抓 → snapshot 內 keys 全 undefined → 修了像沒修。
- 修補:render 後 cache 到 `item._rendered`(`_showCurrentQuestion` 第一次渲染後寫入,後續傳 `{...item._rendered, shuffle_options:false}` 跳洗牌);所有讀 `state.lineup[i].q.options` 的地方一律用 `item._rendered.options`;抽 `_getRenderedQ(item)` helper 集中 fallback;**新加 audit-mode-flow.js mock 一場 Mode 7 驗證 isCorrect / correctKey 在所有 commit point 都非空**。
- 教訓(本案最大收穫):
  1. **「靜默計分錯誤」型 bug 不會被 syntax check 抓到**,必須 dataflow trace。從這次起任何「user-facing 計分 / 狀態 / 持久化」的改動 merge 前必派 code-review subagent(見 §8 強制流程)。
  2. **任何 bug 修補後必跨檔 grep 同根因模式**(本案:`q\.options.*find` 在 9 處出現,只修 4 處 = 沒修)。
  3. **既存程式碼不可信**:做改動前必 dataflow trace,不可假設 PR #5 寫的就對。
  4. **PR 描述「驗證點」不是驗證**:寫了 checklist 卻沒實際跑,等於沒驗證。
  5. **連續 3+ PR 動同一檔**:每 3 個 PR 派一次 regression review subagent。

---

## 8. 共用層 / user-facing 改動 必派 code-review subagent(2026-05-16 案例 10 後新增)

> 案例 10 教訓:syntax check 不夠。任何使用者面 critical 流程改動 merge 前必經人工或 subagent 深度檢查。

### 觸發條件(任一即觸發)

- 改 `src/index.html` Storage / PlayEngine / Wrongbook / Mastery / Progress / SeenCorrect / SM2 / ProgressIO 等共用模組
- 改 `src/modes/modeN.js` 的 submit / answer / lock / state mutation / commit-to-shared 路徑
- 改 user-facing 計分、UI feedback、持久化(localStorage 寫入)流程
- 連續 3+ PR 動同一檔(regression risk)
- 修使用者回報的 bug(可能漏抓同根因)

### 必做的 4 項檢查(subagent 至少做 2 項才能 merge)

1. **Dataflow trace**:列出每個 state mutation 的 input/output type 與不變量(例:`q.options[i].key` 從哪來?是 'A/B/C/D' 還是 undefined?)
2. **Cross-file caller 一致性**:grep 所有 caller 確認簽名相容(例:`Wrongbook.add(` 全 codebase grep 看 6 個參數是否都正確傳)
3. **邊界 case + 反例**:空 / undefined / race / 第一次 / 最後一次 / 跨函式呼叫順序
4. **同根因模式 grep**:剛修的 pattern 整個 codebase 還有沒有其他出現點

### 不接受的 validation

- ❌ `node --check` syntax 為唯一 validation
- ❌ PR 描述的 markdown「驗證點」清單(若我自己沒實際執行)
- ❌ 「應該沒問題」/「邏輯看起來對」(必須 trace 證據)

### 失敗示範(歷史紀錄)

- PR #5 引入 lineup.q.options 無 key bug → PR #11 / #16 / #17 / #18 連續 4 個修法都沒抓到根因 → PR #19 還只修 4 處漏 4 處 → 14 個 PR + 5 個 review subagent 才把 bug 全清。
- 教訓:這 14 個 PR 任何一個若先派 code-review agent dataflow trace,3 PR 內就能抓到。

---

## 6. 專案結構(完整見 `ipas-ai-game-prompt.md` §2)

```
C:\Users\marco\.ipas-ai-game\
├─ CLAUDE.md(本檔,專案層)
├─ ipas-ai-game-prompt.md      # 專案完整 spec(鐵律詳解 + 結構 + 開發階段 + 完整案例庫)
├─ claude-code-system-prompt.md # (歷史檔,內容已大半被全域 v3.1 取代;保留作專案 spec 補充)
├─ src/
│  ├─ index.html               # SPA 主檔(共用層 1219 行)
│  ├─ modes/mode1~5.js         # 5 案 RPG
│  └─ questions*.json          # 17 題庫檔 / 325 題
├─ kb/                         # 87+ 個 IPAS 真實節點(scope + nodes + exam-patterns)
├─ scripts/
│  ├─ audit-*.js               # 5 支稽核腳本(必跑)
│  ├─ verify-calc-numeric.js   # 數值正確性獨立驗算
│  ├─ kb-allowed-nodes.json    # sub agent 白名單
│  └─ check-globals*.js        # 跨檔契約掃描
├─ docs/                       # progress / plan / design / 各 audit 報告
└─ 01指引/ 02歷年考題/ 03參考資料/   # 教材(.gitignored)
```

---

## 7. 維護規則(專案層)

- 新失敗模式 — **語言無關** → 全域 §14;**JS / SPA / 題庫特定** → 本檔 §5
- 新鐵律 / 鐵律修正 → `ipas-ai-game-prompt.md` §1 + 本檔 §1 摘要表同步
- 新 audit script → 本檔 §1 稽核腳本清單 + `ipas-ai-game-prompt.md` §7 同步
- 新禁用主題 → 本檔 §3 禁用主題清單
- 新案例 → 本檔 §5(編號續加)
- 任何新規則 → 修訂歷史(本檔頁尾)+ `ipas-ai-game-prompt.md` §12 修訂歷史

---

## 修訂歷史

| 版次 | 日期 | 重點 |
|:--|:-:|:--|
| v1 | 2026-05-10 | 首次寫專案層 CLAUDE.md(同時包含全域內容,~70 行) |
| v2 | 2026-05-10 | 全域 v3.1 上線後重構 — 移除全域已涵蓋通用內容,只保留 IPAS 專案專屬規則(五大鐵律、共用層 JS scope 規則、題庫白名單、9 個案例庫、稽核腳本清單) |
| **v3** | **2026-05-16** | **新增鐵律 #6 科目隔離性(配合科二補齊任務):新增 X 科資料不得修改既有 X' 科 questions/KB;共用層只允許 additive 修改。對應同步更新 `ipas-ai-game-prompt.md` §1。** |

---

> 本檔僅含 IPAS 專案專屬規則。通用工作流、cardinal rules、cross-validation modes、ground truth 自動化、合規法規,全部在 `~/.claude/CLAUDE.md` v3.1。
