# Spec — 互動混淆矩陣題型(方案 2)

> 撰寫:exploration agent,2026-05-11
> 角色:供 Worker 實作前的精確規格
> 前置必讀:`docs/architecture-current.md`

---

## 1. 目標

新增「互動混淆矩陣」題型 —— 使用者拖曳 4 個樣本標籤(TP / FP / FN / TN)到 2x2 矩陣的對應格子,然後輸入 / 選擇 F1 / Precision / Recall / Accuracy 等指標數值。

**為什麼值得**:
- 純文字題只能背公式,使用者不會「看混淆矩陣立刻認出哪格是 TP」
- 互動視覺化加深「分母分子」的記憶錨點
- IPAS 中級必考(L23303 整節)

---

## 2. 題目子類型 — 新欄位設計

**決策**:在既有題目 schema 上新增**單一欄位** `interaction_type`(string),不新建 format。

### 2.1 新欄位

```json
{
  ...既有所有欄位...
  "format": "calculation",          // 沿用既有 format
  "interaction_type": "confusion-matrix"  // 新增
}
```

### 2.2 為什麼不新建 format?

- 既有 audit script 對 `format` 做白名單比對(`single_choice` / `code_reading` / `calculation` / `matching` / `sequence`)
- 新建 format 需動 6+ 個 audit script
- `interaction_type` 是「format 的渲染變體」,沿用既有 format 的 audit 邏輯,只在 PlayEngine 層分流渲染
- 與既有資料層**完全 backward-compatible**(舊題沒 `interaction_type` 欄位 → 走原渲染路徑)

### 2.3 與既有 schema 衝突檢查

| 既有欄位 | 衝突? |
|:--|:-:|
| `format` | 否(新欄位是 sub-flag)|
| `stem_variables` | 否,可繼續用 case 池 |
| `options` | 否(渲染時 PlayEngine 分流;互動矩陣題的 options 仍存在,代表可選的指標數值答案)|

---

## 3. 互動式拖曳 — HTML5 原生 API(零外部依賴)

### 3.1 為什麼不用外部 library?

- 既有 codebase 只用 GSAP + canvas-confetti,**沒** dragula / Sortable.js / interact.js
- HTML5 原生 dragstart/dragover/drop 對 4 個元件的場景**完全足夠**
- 不增加 CDN 依賴(SBOM 工作量、CSP 風險)
- mode4 / mode3 已經自寫 Pointer Events 拖曳(更複雜),mode4 的 Pointer Events 邏輯可參考但不一定要重用

### 3.2 拖曳 event flow

```js
// 拖曳源(label):TP / FP / FN / TN 四個按鈕
dragSource.draggable = true;
dragSource.addEventListener('dragstart', (ev) => {
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', dragSource.dataset.label);
  // 視覺反饋:加 .dragging class
  dragSource.classList.add('dragging');
});

dragSource.addEventListener('dragend', () => {
  dragSource.classList.remove('dragging');
});

// 放置目標(2x2 cell):4 個 td
dropCell.addEventListener('dragover', (ev) => {
  ev.preventDefault();  // 必要 — 預設行為禁止 drop
  ev.dataTransfer.dropEffect = 'move';
  dropCell.classList.add('drag-over');
});

dropCell.addEventListener('dragleave', () => {
  dropCell.classList.remove('drag-over');
});

dropCell.addEventListener('drop', (ev) => {
  ev.preventDefault();
  dropCell.classList.remove('drag-over');
  const label = ev.dataTransfer.getData('text/plain');
  ConfusionMatrix.placeLabel(dropCell.dataset.position, label);
});
```

### 3.3 行動裝置(觸控)備案

HTML5 `dragstart` 在多數行動瀏覽器**不觸發**(需 longpress)。對應 fallback:

- 提供「點擊模式」:點 label 高亮 → 點 cell 放置(等同手機友善的拖曳替代)
- 偵測:`if ('ontouchstart' in window) useClickMode();`

Worker 應實作雙模(預設 desktop drag,touch 偵測切 click)。

---

## 4. 元件檔案配置

### 4.1 檔案路徑(决策)

**檔案**:`src/components/confusion-matrix.js`

不放 `src/modes/` 因為這**不是新 mode**(沿用既有 PlayEngine + 各 mode 任意呼叫)。建立 `src/components/` 目錄(專案目前沒有此目錄,新建合理)。

**結構**:
```js
// src/components/confusion-matrix.js
const ConfusionMatrix = {
  state: null,
  // 狀態 schema:{ qid, slots: { tp_cell: null|label, fp_cell: null|label, fn_cell: null|label, tn_cell: null|label }, expectedAnswer: '0.800', isTouch: false }

  render(question, container) { ... },           // 渲染 2x2 + 拖曳源 + 數值輸入
  placeLabel(cellPosition, label) { ... },        // drop 時呼叫
  validateLayout() { ... },                       // 檢查 4 格是否全部正確
  computeUserAnswer(method) { ... },              // 從使用者放置的 4 格計算 F1 / Precision / Recall(算錯也算錯)
  submit() { ... },                               // 整體判定 + 走 PlayEngine 既有判定路徑
  reset() { ... }
};
window.ConfusionMatrix = ConfusionMatrix;
```

### 4.2 PlayEngine 整合點

**index.html:1035-1064 PlayEngine.show()** 內部新增分流:

```js
show(question, opts = {}) {
  this.current = renderQuestion(question);

  // === 新增:分流到互動元件 ===
  if (this.current.interaction_type === 'confusion-matrix') {
    const view = document.getElementById('view-play');
    const ctx = opts.contextHTML || '';
    view.innerHTML = ctx + '<div id="cm-container"></div>';
    show('view-play');
    ConfusionMatrix.render(this.current, document.getElementById('cm-container'));
    return;  // 不走原 options 渲染
  }
  // === 既有路徑 ===
  const view = document.getElementById('view-play');
  // ...原本的 innerHTML(line 1041-1062)
}
```

**精確修改範圍**:在 line 1037 `this.current = renderQuestion(question);` 之後、line 1038 之前插入上述分流邏輯。

### 4.3 答題完成後回流

`ConfusionMatrix.submit()` 內部呼叫 `PlayEngine.answer(...)` 走既有判定路徑(這樣 Mastery / Wrongbook / SM-2 自動觸發)。

**簽章**:`PlayEngine.answer(key)` 既有期待 key 是 'A' / 'B' / 'C' / 'D'。互動矩陣的「答對 = 4 格全對 + 數值正確」,需要 mapping:
- 全對 → 走 `is_correct: true` 的 option key(從 `this.current.options.find(o => o.is_correct).key`)
- 答錯 → 隨機挑一個 `is_correct: false` 的 option key

或更乾淨的方式:**bypass PlayEngine.answer**,直接複製 PlayEngine.answer 的 Mastery/Wrongbook 邏輯到 ConfusionMatrix.submit:

```js
// ConfusionMatrix.submit() 內:
const isCorrect = this.validateLayout() && this.computeUserAnswer() === this.state.expectedAnswer;
if (PlayEngine.current && PlayEngine.current.node_id) Mastery.update(PlayEngine.current.node_id, isCorrect);
Progress.addAnswer(isCorrect);
if (!isCorrect) {
  const correctOpt = PlayEngine.current.options.find(o => o.is_correct);
  Wrongbook.add(PlayEngine.current.id, PlayEngine.current.node_id, '?', correctOpt ? correctOpt.key : '?');
}
if (typeof SM2 !== 'undefined') SM2.recordAnswer(PlayEngine.current.id, isCorrect, false);
// 然後手動渲染解析(可參考 PlayEngine.showExplanation)
PlayEngine.showExplanation({ key: '?', text: this.computeUserAnswer() }, isCorrect);
```

**Worker 推薦**:採後者(不依賴 PlayEngine.answer 的 key 對應 hack),可讀性更好。

---

## 5. UI 文字 wireframe

```
┌─ 題目 ──────────────────────────────┐
│ 醫療診斷模型測試集得到下列預測:     │
│ 將每個樣本拖到正確的格子,再回答 F1。│
└─────────────────────────────────────┘

[拖曳源池](4 個 chip,每個顯示樣本說明)
┌────────────────────────────────────┐
│  🟢 [真為陽 + 預測陽 (60 個)]       │
│  🟡 [真為陰 + 預測陽 (20 個)]       │
│  🔴 [真為陽 + 預測陰 (10 個)]       │
│  🔵 [真為陰 + 預測陰 (910 個)]      │
└────────────────────────────────────┘

[2x2 矩陣](拖放區)
              預測陽 (Positive)    預測陰 (Negative)
真實陽         ┌─────────────┐  ┌─────────────┐
(Actual+)     │   ↓ TP ↓    │  │   ↓ FN ↓    │
              │ (drop here) │  │ (drop here) │
              └─────────────┘  └─────────────┘
真實陰         ┌─────────────┐  ┌─────────────┐
(Actual-)     │   ↓ FP ↓    │  │   ↓ TN ↓    │
              │ (drop here) │  │ (drop here) │
              └─────────────┘  └─────────────┘

[衍生指標輸入]
┌────────────────────────────────────┐
│ 請計算 F1-Score(取小數點後三位):  │
│ ┌──────────┐                       │
│ │ 0.___    │                       │
│ └──────────┘                       │
│                                    │
│ [✅ 提交答案]  [🔄 重置]            │
└────────────────────────────────────┘
```

### CSS 規範(複用既有變數,寫進 index.html `<style>` 或 components 內)

```css
.cm-source { padding: 12px 16px; background: var(--bg-3); border: 2px solid var(--border);
  border-radius: var(--radius-sm); cursor: move; user-select: none; }
.cm-source.dragging { opacity: 0.4; }
.cm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cm-cell { min-height: 80px; padding: 16px; background: var(--bg-2);
  border: 2px dashed var(--border); border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center; }
.cm-cell.drag-over { border-color: var(--primary); background: rgba(56,189,248,0.1); }
.cm-cell.has-label { border-style: solid; }
.cm-cell.correct-placement { border-color: var(--success); background: rgba(74,222,128,0.1); }
.cm-cell.wrong-placement { border-color: var(--danger); background: rgba(248,113,113,0.1); }
```

---

## 6. 樣例題目(完整 JSON)

放於新檔 `src/questions-confusion-matrix.json`(或併入既有 `questions-pc-modes.json`,但 Worker 推薦新檔以利後續擴充):

```json
{
  "version": "1.0",
  "schema_version": "iron-rule-1+2+3",
  "purpose": "互動式混淆矩陣題型(方案 2)",
  "questions": [
    {
      "id": "q_cm_001",
      "knowledge_code": "L23303",
      "node_id": "n_L23303_001",
      "subject": 3,
      "format": "calculation",
      "interaction_type": "confusion-matrix",
      "difficulty": "easy",
      "source_level": "L2",
      "stem": "醫療診斷模型在 1000 筆測試集上得到:60 筆真陽、20 筆假陽、10 筆假陰、910 筆真陰。請依下方資料完成 2x2 配對,並計算 F1-Score(三位小數)。",
      "matrix_data": {
        "tp": 60, "fp": 20, "fn": 10, "tn": 910,
        "labels": {
          "tp_label": "預測陽 + 真實陽",
          "fp_label": "預測陽 + 真實陰",
          "fn_label": "預測陰 + 真實陽",
          "tn_label": "預測陰 + 真實陰"
        }
      },
      "expected_metric": "f1",
      "expected_answer": "0.800",
      "options": [
        {"text": "0.800", "is_correct": true},
        {"text": "0.857", "is_correct": false, "trap_type": "只算 Precision"},
        {"text": "0.667", "is_correct": false, "trap_type": "用算術平均"},
        {"text": "0.750", "is_correct": false, "trap_type": "分母誤用"}
      ],
      "shuffle_options": false,
      "explanation": {
        "correct": "Precision = TP/(TP+FP) = 60/80 = 0.75;Recall = TP/(TP+FN) = 60/70 ≈ 0.857;F1 = 2PR/(P+R) ≈ 0.800",
        "wrong": {
          "0.857": "此為單獨 Recall;F1 需 P 與 R 調和平均",
          "0.667": "算術平均 (0.75+0.857)/2,F1 是調和平均不是算術平均",
          "0.750": "未代入正確分母"
        },
        "hook": "F1 = 2PR/(P+R),調和平均對極端值敏感"
      },
      "misconceptions": ["把 P 與 R 混用", "F1 用算術平均"],
      "related_node_ids": ["n_L23303_002", "n_L23303_006"],
      "tags": ["confusion-matrix", "F1", "互動"]
    }
  ]
}
```

**新增的非標欄位**:
- `interaction_type` ✓(已說明)
- `matrix_data`:`{tp, fp, fn, tn, labels}` 4 個整數 + 4 個拖曳源 label 文字
- `expected_metric`:`"f1"` / `"precision"` / `"recall"` / `"accuracy"`(決定 ConfusionMatrix.computeUserAnswer 算什麼)
- `expected_answer`:正確答案字串(已替換 placeholder 後)

**`options` 欄位**:仍保留,讓 PlayEngine.showExplanation 解析顯示其他選項;但 UI 不渲染這 4 個 button(因為使用者輸入數字而非選 ABCD),只用作 explanation.wrong 的 key。

### 在 `src/index.html:790-808 loadQuestions files 列表內**新增**該檔(Worker 必修)

```js
const files = [
  ...既有列表...
  'questions-confusion-matrix.json'  // 新增
];
```

### 在 `scripts/audit-source-fidelity.js` Q_FILES 列表內新增該檔(Worker 必修)

行 11-20,加 `'questions-confusion-matrix.json'`。

### `scripts/audit-render.js` FILES 列表同步新增

行 13-22。

### `scripts/audit-option-length.js` FILES 列表同步新增

行 7-25。**注意**:`audit-option-length.js` line 53 過濾條件 `if (fmt && !/single/.test(fmt) && fmt !== 'single_choice') return;` 會跳過 calculation 題,因此互動矩陣題(format=calculation)**不被本 audit 檢查**(已既有行為,無需特別處理)。

---

## 7. 鐵律相容性

| 鐵律 | 衝突? | 說明 |
|:-:|:-:|:--|
| #1 錯題驅動下鑽 | – | 答錯走既有 `Wrongbook.add` + `PlayEngine.drill()` → `generateVariation` 邏輯。互動矩陣題的 `node_id` 屬於 L23303,變化型可從同 node 的 q_0001 等同主題題目抽 |
| #2 動態題庫 | △ | 互動矩陣題的 4 個 cell 數字應變化(否則背答案)。Worker 應加 `stem_variables.case_a` 等多 case 池(沿用既有 calculation case 機制),let `matrix_data.tp` 也改成 placeholder `{tp}` 由 case 動態替換 |
| #3 不抄 114-2 | – | 互動矩陣題是新題型,無原題可抄 |
| #4 選項長度 | **N/A** | 拖曳交互無傳統 ABCD 選項;`audit-option-length.js` 對 calculation 題本就不檢查,所以**自動 N/A** |
| #5 來源忠實 | – | 必選 L23303 內節點 |

### 鐵律 #5 涉及的 KB 節點(白名單檢查)

互動矩陣題只能用以下節點(scripts/kb-allowed-nodes.json):

- `n_L23303_001` F1 分數計算(必考公式)
- `n_L23303_002` Precision / Recall 公式(勘誤關鍵)
- `n_L23303_004` 不平衡資料禁用 Accuracy
- `n_L23303_006` macro F1 跨語言失準(進階)

**Worker 不可**用其他 node_id(任何非 L23303 的混淆矩陣相關概念都不存在白名單)。

---

## 8. 檔案級 / 行級約束(Worker 守則)

### MAY modify

| 檔案 | 動作 |
|:--|:--|
| `src/components/confusion-matrix.js` | NEW |
| `src/questions-confusion-matrix.json` | NEW |
| `src/index.html`(`<head>` 區)| 加 `<script src="src/components/confusion-matrix.js"></script>` |
| `src/index.html`(行 308 `</style>` 之前)| 加 `.cm-source / .cm-grid / .cm-cell` CSS |
| `src/index.html`(行 790-808 `files` 列表)| 加新 JSON 檔名 |
| `src/index.html`(行 1037 之後)| PlayEngine.show 加 interaction_type 分流 |
| `scripts/audit-source-fidelity.js`(行 11-20 Q_FILES)| 加新檔名 |
| `scripts/audit-render.js`(行 13-22 FILES)| 加新檔名 |
| `scripts/audit-option-length.js`(行 7-25 FILES)| 加新檔名 |

### MUST NOT modify

- 任何 `kb/` 檔
- 任何**既有** `src/questions*.json`
- 任何**既有** mode 檔(`src/modes/mode1-7.js`)— 這個改動只動共用層 PlayEngine
- 既有 `audit-calculation.js`(本案不新增 stem_variables case 結構,沿用)

### MUST NOT 變更的核心欄位(field-level constraint)

- `id` / `kb_id` / `node_id` / `knowledge_code`:white-list 內,不可改
- `is_correct` 欄位語意:仍代表「正解選項」,只是 UI 不渲染傳統 ABCD button(用於 explanation 顯示)

### 自驗

```bash
node --check src/components/confusion-matrix.js
node -e "JSON.parse(require('fs').readFileSync('src/questions-confusion-matrix.json','utf8'))"
node scripts/audit-source-fidelity.js  # 必須 PASS
node scripts/audit-render.js           # 必須 PASS(case_a 用了 placeholder 應全部替換)
node scripts/audit-option-length.js    # calculation 題自動 skip,N/A
```

**手動 mock**(Worker 應寫一支 `scripts/mock-confusion-matrix-render.js`):
```js
// 模擬 ConfusionMatrix.computeUserAnswer 對 case_a 算出 F1
// 預期 0.800,實測對比 expected_answer
```

---

## 9. 估計實作成本

- `confusion-matrix.js`:~200 LOC(state / render / placeLabel / validateLayout / computeUserAnswer / submit / 觸控 fallback)
- `questions-confusion-matrix.json`:**5 題 v0**(每題 ~60 行 JSON,共 ~300 行)
- `index.html` CSS + script tag + PlayEngine 分流:~30 LOC
- audit 列表更新:~3 個檔各加 1 行
- **總計**:~530 行新增 / 修改

**開發時間**:1.5-2 天(含 5 題出題 + 互動 UX 微調)

---

## 10. 建議初始題量(v0)

**5 題覆蓋**:
1. F1 計算(基本款,L23303_001)
2. Precision 與 Recall 對比(L23303_002)
3. Accuracy 在不平衡資料的陷阱(L23303_004,故意給 970/1000 樣本看似 97% 但漏診)
4. F1 對極端值敏感(L23303_001,0/100 一邊極端)
5. 多類別 macro F1(L23303_006,進階)

5 題夠覆蓋本 sub-feature 核心使用情境,且**手寫 5 個矩陣題遠少於 mode8 trace 的工作量**。

---

## 11. NEEDS_REVIEW

- [ ] **行動裝置觸控**:HTML5 dragstart 在多數行動瀏覽器不觸發。Worker 應決定 fallback 採「點 → 點 放置」方式,但實作優先級可暫低(13 天時間有限)
- [ ] **是否需要 stem_variables case 池**:若 5 題每題只有 1 組 (tp,fp,fn,tn) 數字,使用者重玩 → 死記。建議至少加 2-3 個 case;但 5 題 × 4 case = 20 組數字也許過勞。Worker 可先 v0 不加 case,後續使用者反饋再補
- [ ] **拖曳的視覺反饋**:Worker 自決(是否要 GSAP 動畫?目前既有 mode4 用 Pointer Events 自寫動畫,可參考)
- [ ] **是否要顯示 4 格放錯位置時的提示**:spec 暫不顯示(走完整 submit → 看 explanation 才知對錯,符合既有 PlayEngine 模式),Worker 不要主動加 hint
