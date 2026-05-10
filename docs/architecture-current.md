# IPAS AI 遊戲 — 現行架構速查表

> 撰寫:exploration agent (read-only),2026-05-11
> 目的:供未來 Worker agent 在不重新探索 src/ 的前提下精確改碼
> 來源:src/index.html (1537 行) + src/modes/mode1-7.js + scripts/audit-*.js + kb/

---

## 1. View 列表(全部寫死於 src/index.html)

實際 codebase 只有以下 5 個 `view-*` 區塊。**不存在 `view-game-modeN` 模式** —— 所有 mode 共用 `view-play`,以 `innerHTML` 重寫。

| view id | line(index.html) | 用途 | 寫入者 |
|:--|:--|:--|:--|
| `view-home` | 326 | 首頁(模式選單 + 弱點 Top5 + 錯題回報 Top5) | `refreshHome()`(index.html 927) |
| `view-play` | 404 | 共用答題區 — 所有 Mode1~7 + DrillSession + PlayEngine.show() 全部寫入此區 | 各 mode + `PlayEngine.show()`(1037) |
| `view-result` | 407 | 結算畫面 | `Mode4.finish()`、各 mode 自寫 |
| `view-review` | 410 | 錯題本 | `Review.start()`(index.html 1270) |
| `view-stats` | 413 | 學習統計 | `renderStats()`(index.html 1312) |

`show(viewId)` (index.html 918) 切換 active class。

**首頁模式按鈕**:`onclick="enterMode(N)"`,`enterMode()` 位於 index.html 1017。
- mode 1/2/3/5/6/7:走 `window['Mode' + mode].start()`(動態查找,因為 mode files 由 IIFE 包裹後 `window.ModeN = ModeN`)
- mode 4:直接走 const `Mode4.start()`(index.html 1019)— 因為 mode4 用 `Object.assign` 就地替換 placeholder(避免時序問題,案例 3)
- `enterMode('review')`:走 const `Review.start()`(index.html 1020)

新增 mode 8 時 enterMode 需新增 case(line 1019-1027)。

---

## 2. Storage Keys 表

**全部已使用的 key**(grep `ipas_*_v1` / `ipas_*_v2` / `ipas_*_v3`):

| key | 宣告位置 | 寫入者 | schema(一行)|
|:--|:--|:--|:--|
| `ipas_progress_v1` | `Storage.K_PROGRESS`(index.html 429) | Progress.init/addSession/addAnswer | `{started, sessions, totalAnswered, totalCorrect}` |
| `ipas_mastery_v1` | `Storage.K_MASTERY`(430) | Mastery.update/drillBonus | `{ [nodeId]: {score, attempts, correct, streak, lastSeen} }` |
| `ipas_wrongbook_v1` | `Storage.K_WRONGBOOK`(431) | Wrongbook.add/markMastered | `[ {qid, nodeId, userChoice, correctChoice, wrongCount, addedAt, lastWrong, mastered, drillCount} ]` |
| `ipas_error_reports_v1` | `Storage.K_ERROR_REPORTS`(432) | ErrorReports.add/clear | `[ {qid, ts, types, note, context, report_count} ]` |
| `ipas_settings_v1` | `Storage.K_SETTINGS`(433) | (預留,目前無寫入)| 未定義 |
| `ipas_session_state_v1` | `Storage.K_SESSION`(434) | (預留)| 未定義 |
| `ipas_player_v1` | hardcode 字串(index.html 1496/1501/1516)| Player.load/save/reset | `{hp, hpMax, mp, mpMax, level, exp, expMax, skillPoints, stats:{analysis,planning,decision,technical}, skills:{hint,eliminate,double}}` |
| `ipas_mode1_industries_v1` | mode1.js 154/229/655 | Mode1.industriesState | `{ [bossKey]: {defeated, perfectClear, lastClearedAt, ...} }` |
| `ipas_mode2_bosses_v2` | mode2.js 125/211/704 | Mode2 內部 | (mode2 自管,類似 mode1) |
| `ipas_mode3_progress_v2` | mode3.js 10(`STORAGE_KEY`)| Mode3 內部 | (mode3 自管) |
| `ipas_mode5_v3_progress` | mode5.js 157(`progressKey`)| Mode5 內部 | (mode5 自管) |
| `ipas_mode6_codex_v1` | mode6.js 25(`STORAGE_KEY`)| Mode6 內部 | 卡牌圖鑑進度 |
| `ipas_mode7_theater_v1` | mode7.js 20(`STORAGE_KEY`)| Mode7 內部 | (mode7 自管) |

**新 key 命名建議**:`ipas_<feature>_<version>` 一致採用 `_v1` 後綴。新增 key 必更新本表。

---

## 3. PlayEngine API 表面

宣告:index.html 1031-1177(const PlayEngine)。

| 方法 | 行 | 簽章 | 行為 |
|:--|:-:|:--|:--|
| `current` | 1032 | property | 當前題目(已 renderQuestion 處理過 + 加 key A/B/C/D)|
| `history` | 1033 | property | (預留)|
| `show(question, opts)` | 1035-1064 | `(question, {contextHTML})` | 渲染題目進入 view-play(會自動呼叫 `renderQuestion` + `renderVisualData` + `highlightCodeSimple`)|
| `answer(key)` | 1066-1086 | `(key: 'A'|'B'|'C'|'D')` | 鎖選項、`Mastery.update`、`Wrongbook.add`、呼叫 showExplanation |
| `showExplanation(opt, isCorrect)` | 1088-1161 | private | 渲染解析(含 `ErrorReports.renderButton`)|
| `drill()` | 1163-1171 | () | 走 `generateVariation` → `DrillSession.start` |
| `next()` | 1173-1176 | () | 呼叫 `this.onNext` 或 goHome |

**重要常數**:Mode 自寫 explanation 時(mode1/mode2/mode5/mode7),不走 PlayEngine.showExplanation,要自己處理 `ErrorReports.renderButton(qid)` 的注入(見 mode1.js 563)。

---

## 4. Mastery API

宣告:index.html 530-562(const Mastery)。

| 方法 | 行 | 簽章 |
|:--|:-:|:--|
| `load()` | 531 | () → `{ [nodeId]: state }` |
| `save(m)` | 532 | (m) → void |
| `get(nodeId)` | 533 | (nodeId) → `{score, attempts, correct, streak}` |
| `update(nodeId, isCorrect)` | 534-548 | 累加 `attempts/correct/streak`、調 `score`(±10/±5)|
| `drillBonus(nodeId)` | 549-550 | `score += 20`(下鑽完成時呼叫)|
| `getWeakest(nodeIds, n)` | 551-556 | 取最弱 n 個 |
| `MASTERY_THRESHOLD` | 558 | 60(legacy 保留供他處引用)|
| `countMastered()` | 561 | 數 `correct >= 3` 的 node 數(鐵律 #1 mastered 判定)|

**呼叫者**(grep `Mastery.update`):mode1.js:411、mode2.js:425、mode3.js:827/901、mode4.js:461/501、mode5.js(經 PlayEngine)、mode6.js(經 PlayEngine)、mode7.js:606、index.html PlayEngine.answer:1078。

`Mastery.drillBonus` 由 `DrillSession.next()`(index.html 1206)在下鑽完成時呼叫一次。

---

## 5. ErrorReports API

宣告:index.html 590-785(const ErrorReports)。

| 方法 | 行 | 用途 |
|:--|:-:|:--|
| `TYPES` | 591-599 | 7 種錯誤類型代號表 |
| `_esc(s)` | 601-605 | XSS escape |
| `load/save` | 606-607 | localStorage |
| `add(qid, types, note, context)` | 610-638 | 新增/覆蓋 |
| `get(qid)` | 640 | 查單筆 |
| `list/count` | 641-642 | |
| `top(n)` | 645-665 | 綜合 wrongCount + reportCount\*2 排序 |
| `export()` | 668-687 | 下載 JSON |
| `clear()` | 690-695 | 清空 |
| `renderButton(qid)` | 698-705 | 回傳 HTML 字串(mode 自寫 explanation 時嵌入)|
| `toggleForm(qid)` | 708-717 | inline form 展開 |
| `_renderFormHTML(qid)` | 719-743 | private |
| `_submit(qid)` | 745-762 | private |
| `_buildContext(qid)` | 765-784 | private |

---

## 6. 題目 Schema(完整欄位表)

從 src/questions*.json 17 個檔(325 題)+ 各 mode 程式碼提取:

| 欄位 | 型別 | 必填 | 範例 / 說明 |
|:--|:--|:-:|:--|
| `id` | string | ✓ | `q_0001` / `q_pa_001` / `q_pc_match_001`(file 內唯一)|
| `knowledge_code` | string | ✓ | `L23303`(必在 `kb/scope.json` include=true)|
| `node_id` | string | △ | `n_L23303_002`(必在 `scripts/kb-allowed-nodes.json`,鐵律 #5)|
| `subject` | int | △ | 1 或 3 |
| `format` | string | ✓ | `single_choice` / `code_reading` / `calculation` / `matching` / `sequence` |
| `difficulty` | string | △ | `easy` / `medium` / `hard` |
| `source_level` | string | △ | `L1` / `L2`(L1=直接從教材出,L2=改寫)|
| `errata_critical` | bool | – | 標記勘誤必出題(顯示 ⚠️ 必出 badge,index.html 1048)|
| `must_cover` | bool | – | 必出題標記 |
| `stem` | string | ✓ | 題幹,可含 `{var}` placeholder 與 `{case_X}` 變數 |
| `stem_variables` | object | – | 兩種模式:(a) `{key: [pool]}` 變數池(applyVariables);(b) `{case_a: {tp,fp,...,answer,wrong1,...}}` 計算題 case 池 |
| `code_block` | string | – | code_reading 題的程式碼(渲染為 `<pre class="code-syntax">`)|
| `options` | array | ✓ | `[{text, is_correct, trap_type?}, ...]` 通常 4 個 |
| `shuffle_options` | bool | – | 預設 true,`renderQuestion` 會洗牌(index.html 504)|
| `explanation.correct` | string | △ | 正確選項解析 |
| `explanation.wrong` | object | △ | `{ optionText: explanation }` 對應錯誤選項解析 |
| `explanation.hook` | string | △ | 記憶口訣 |
| `misconceptions` | array<string> | – | 常見誤解 |
| `related_node_ids` | array<string> | – | 易混淆相關節點 |
| `exam_appearance` | array<object> | – | `[{exam, q, subject}]` 對應歷年題出處 |
| `tags` | array<string> | – | tag 列表 |
| `table_data` | array<object> | – | 表格資料(`renderVisualData` 渲染,index.html 1461)|
| `table_columns` | array<string> | – | 表頭(若無則用 `Object.keys(table_data[0])`)|
| `highlight_cells` | array<string> | – | `["rowKey|colKey", ...]` 高亮 |
| `chart_data` | object | – | `{type:'bar', labels, values}` |

**範例**(完整 calculation 題,questions-pc-modes.json:362):
```json
{
  "id": "q_pc_calc_001",
  "knowledge_code": "L23303",
  "node_id": "n_L23303_001",
  "subject": 3,
  "format": "calculation",
  "stem": "...TP={tp}、FP={fp}、FN={fn}、TN={tn}...F1-Score?",
  "stem_variables": {
    "case_a": {"tp":"60","fp":"20","fn":"10","tn":"910","answer":"0.800","wrong1":"0.857","wrong2":"0.667","wrong3":"0.750"},
    "case_b": {...}, "case_c": {...}, "case_d": {...}
  },
  "options": [
    {"text":"{answer}","is_correct":true},
    {"text":"{wrong1}","is_correct":false,"trap_type":"..."},
    ...
  ],
  ...
}
```

---

## 7. 鐵律 #5 來源忠實 — kb_id 驗證機制

**白名單**:`scripts/kb-allowed-nodes.json` —— **94 個節點 / 21 個 knowledge_codes**(實測 node 計 94 個,文件中曾稱 87 個是早期數字)。

驗證腳本:`scripts/audit-source-fidelity.js`(81 行)
- 讀 `kb/nodes-subject-1.json` + `nodes-subject-1-extended.json` + `nodes-subject-3.json` + `nodes-subject-3-extended.json`
- 對每題的 `node_id` / `knowledge_code` / `related_node_ids[]` 全部驗證
- 任一違反 → 寫入 `scripts/audit-source-fidelity.report.json`

**21 個 knowledge_codes**:`L21101 L21102 L21103 L21104 L21202 L21203 L21302 L21301 L21201 L23201 L23202 L23304 L23102 L23101 L23103 L23203 L23301 L23302 L23303 L23401 L23402`

新題 / 新功能用到 node_id 時,Worker 必須選擇白名單內的 node_id。

---

## 8. View ↔ Mode 啟動流程

```
頁面載入
  ↓
(async IIFE in index.html 1520)
  ↓
Progress.init() → loadQuestions() → 動態載入 modes/mode{1..7}.js
  ↓
refreshHome() → show('view-home')

使用者點 mode card
  ↓
enterMode(N)
  ↓ (index.html 1017-1028)
  - mode 4:直接 Mode4.start()
  - mode 'review':直接 Review.start()
  - 其他:window['Mode' + N].start()
  ↓
ModeN.start() 寫 view-play.innerHTML + show('view-play')
  ↓
迴圈:題目 → 答題 → 解析 → next() → ...
  ↓
goHome() / 結算 → show('view-home') / 'view-result'
```

**動態載入 mode 順序**(index.html 1524):`mode1 → mode2 → ... → mode7`(序列載入,有 race 風險:`enterMode` 可能在某 mode 還沒載完時觸發,但有 fallback toast)。

---

## 9. Audit Script 表

執行目錄:`C:\Users\marco\.ipas-ai-game`,命令:`node scripts/<script>`。

| script | 用途 | 輸出 |
|:--|:--|:--|
| `audit-option-length.js` | 鐵律 #4(選項長度均衡)| `audit-option-length.report.json` |
| `audit-source-fidelity.js` | 鐵律 #5(node_id / knowledge_code / related_node_ids 必在 KB)| `audit-source-fidelity.report.json` |
| `audit-render.js` | 鐵律 #2(模擬 renderQuestion,驗 case 替換無殘留 placeholder + is_correct count = 1)| `audit-render.report.json` |
| `audit-calculation.js` | calculation 題 schema 完整性 | `audit-calculation.report.json` |
| `audit-stem-explanation-consistency.js` | stem 與 explanation 數字 / 選項一致性 | `audit-stem-explanation.report.json` |
| `audit-source-classify.js` | 主題分類 | `audit-source-classify.report.json` |
| `verify-calc-numeric.js` | 計算題數值正確性獨立驗算 | console |
| `security-scan-secrets.js` / `security-scan-xss.js` | 安全掃描 | `*.report.json` |
| `check-globals*.js` | 跨檔契約掃描(global 名稱使用一致性)| console |
| `verify-mode1-randomness.js` | mode1 BOSS 抽題隨機性 | console |
| `verify-mode2-viz-boss.js` | mode2 視覺資料配置驗證 | console |

新功能(SM-2 / Confusion Matrix / Mode 8)若引入新題型或新欄位,**必同步**:
1. `audit-source-fidelity.js` Q_FILES 列表新增題庫檔(若有新題庫)
2. `audit-render.js` FILES 列表新增題庫檔
3. `audit-option-length.js` analyzeQuestion 對新 format 的處理(若 format 不是 single*)

---

## 10. 重要全域函數速查(Worker 可裸名讀)

宣告於 index.html script 區塊,全部都掛 window(因為是 `function` 宣告):

| 函數 | 行 | 用途 |
|:--|:-:|:--|
| `applyVariables(stem, vars)` | 456-466 | 變數池替換 |
| `pickCase(question)` | 469-474 | 計算題隨機抽 case |
| `renderQuestion(q)` | 477-510 | **核心**:case 替換 → 變數池 → 洗牌 → 加 key A/B/C/D |
| `loadQuestions()` | 789-825 | async,讀 17 個 JSON 合併到 QUESTIONS |
| `generateVariation(originalQ, count=3)` | 828-906 | 生成下鑽變化型(換角度/易混淆/加深難度)|
| `showToast(msg, ms)` | 909-915 | |
| `show(viewId)` | 918-922 | view 切換 |
| `goHome()` / `goStats()` | 924-925 | |
| `refreshHome()` | 927-953 | 首頁刷新(必含 weak list / error top list)|
| `enterMode(mode)` | 1017-1028 | |
| `highlightCodeSimple(code)` | 1446-1454 | Python 語法高亮 |
| `renderVisualData(q)` | 1457-1491 | table_data / chart_data 渲染 |

**const 全域物件**(裸名讀,**不掛 window**,案例 1 教訓):`Storage`、`RNG`、`Progress`、`Mastery`、`Wrongbook`、`ErrorReports`、`PlayEngine`、`DrillSession`、`Review`、`Mode4`、`GameFX`、`Player`。

**let 全域變數**:`QUESTIONS`(line 788,**且** 815 有顯式 `window.QUESTIONS = QUESTIONS` sync,雙保險,因為 mode3/mode4 有讀 `window.QUESTIONS`)。

---

## 11. Worker 注意事項摘要

新增 mode N(N >= 8) Worker 應:
1. 在 `src/modes/modeN.js` 新建 IIFE 包裹的 `const ModeN = { state, start(), ... }`,結尾 `window.ModeN = ModeN`
2. 在 index.html 第 1524 行 `for (const name of [...])` 字串陣列加 `'modeN'`
3. 在 index.html 1017-1028 `enterMode()` 內加處理(若需特殊邏輯;否則 fallback 走 `window['Mode' + mode].start()`)
4. 在 index.html 339-388 `<div class="modes-grid">` 內加 `<button class="mode-card" onclick="enterMode(N)">` UI
5. 寫入 `view-play`(共用)以 innerHTML,呼叫 `show('view-play')`
6. 答題時呼叫 `Mastery.update(node_id, isCorrect)` + `Wrongbook.add(...)` + `Progress.addAnswer(isCorrect)`
7. 解析按鈕區嵌入 `ErrorReports.renderButton(qid)` 字串
8. 下鑽用 `DrillSession.start(node_id, generateVariation(q, 3), q, onCompleteCallback)`(callback 內必檢查 state 仍存在)
9. 切換 view 前清 timer(`_clearAllTimers()` pattern,案例 6 教訓)

---

> 此檔由 read-only exploration agent 撰寫。任何 Worker 在開工前**必先讀此檔**,以免重複探索 src/。
