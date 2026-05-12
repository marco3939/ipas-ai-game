# Spec — Python 題庫動態化(鐵律 #2 治本)

> 撰寫:Orchestrator,2026-05-11(於 Round 3 commit `8a6659e` 後)
> 觸發:使用者實際玩測發現「Python 題目都跟範例一模一樣沒變化,記住答案就過」— 違反鐵律 #2
> 範圍:27 題(22 code_reading + 5 code_trace)全面 retrofit
> 路徑:R4C(基礎)→ R4A + R4B(並行 retrofit)

---

## 1. 問題定義

**現況**:
- `src/questions-pa-code.json` 12 題:`stem` / `code_block` / `options` 全固定,只有 `shuffle_options: true`
- `src/questions-batch-n7-dl.json` 3 題 + `src/questions.json` 2 題:同上,固定
- `src/questions-mode8-trace.json` 5 題:Round 3 v0-minimal **故意**略過 stem_variables
- 使用者實玩:相同程式碼 + 相同答案 → 第二次直接記答案點下去 → 無學習價值

**鐵律 #2 動態題庫** 違反,專案層 §0 紅線等級問題。

---

## 2. 解法總綱(A 治本)

對 27 題全面套用 **stem_variables case_a/b/c 池**(每題至少 3 case),pattern 參考既有 `src/questions-pc-modes.json` 計算題:

```json
{
  "id": "q_pa_001",
  "stem": "...向量化白化(whitening)...trace 為何?",
  "code_block": "import numpy as np\nC = np.array([[{a}, 0.0],\n              [0.0, {b}]])\nC_inv = np.linalg.inv(C)\nprint(np.trace(C_inv))",
  "stem_variables": {
    "case_a": {"a": "2.0", "b": "4.0", "answer": "0.75", "wrong1": "6.0", "wrong2": "0.125", "wrong3": "ValueError"},
    "case_b": {"a": "4.0", "b": "5.0", "answer": "0.45", "wrong1": "9.0", "wrong2": "0.05", "wrong3": "ValueError"},
    "case_c": {"a": "1.0", "b": "8.0", "answer": "1.125", "wrong1": "9.0", "wrong2": "0.125", "wrong3": "ValueError"}
  },
  "options": [
    {"text": "{answer}", "is_correct": true},
    {"text": "{wrong1}", "is_correct": false, "trap_type": "誤算 trace 為和"},
    {"text": "{wrong2}", "is_correct": false, "trap_type": "誤算反矩陣"},
    {"text": "{wrong3}", "is_correct": false, "trap_type": "誤以為反矩陣失敗"}
  ],
  "explanation": {
    "correct": "對角矩陣的反矩陣為對角元素取倒數,C_inv = diag(1/{a}, 1/{b})。np.trace 取對角線和 = 1/{a}+1/{b} = {answer}",
    "wrong": { "{wrong1}": "...", "{wrong2}": "...", "{wrong3}": "..." }
  }
}
```

**每次 render 流程**:
1. `pickCase(question)` 隨機從 case_a/b/c 抽一個(既有函數,index.html:469-474)
2. `renderQuestion` 用 case 值替換所有 placeholder(現有 stem/options/explanation 已支援,**新增 `code_block` 支援為 R4C 重點**)
3. `shuffle_options: true` 額外打散選項位置 → 同一 case 但顯示順序也變

---

## 3. R4C — 基礎工程(必先做)

### 3.1 `src/index.html` renderQuestion 擴展

Round 2 Fix R1 已加 `subDeep` recursive helper(約 534-545 行)。當前已對 `matrix_data` / `expected_answer` / `extra_classes` 套用。

**新增**:對 `code_block`(string,可能含 `\n`)套用 `subAll`(string substitution,既有)。

精確改動:在既有 `subDeep` block 之後新增:

```js
// 動態 Python 題:code_block 內 placeholder 替換
if (typeof rendered.code_block === 'string') {
  rendered.code_block = subAll(rendered.code_block, c);
}
// trace_steps(Mode 8 動態化用):每步 ask + 每個 option text + trap_type
if (Array.isArray(rendered.trace_steps)) {
  rendered.trace_steps = rendered.trace_steps.map(step => ({
    ...step,
    ask: typeof step.ask === 'string' ? subAll(step.ask, c) : step.ask,
    options: Array.isArray(step.options) ? step.options.map(o => ({
      ...o,
      text: typeof o.text === 'string' ? subAll(o.text, c) : o.text,
      trap_type: typeof o.trap_type === 'string' ? subAll(o.trap_type, c) : o.trap_type
    })) : step.options
  }));
}
```

### 3.2 `scripts/audit-render.js` 對稱擴展

`simulateRender` 同步加上述邏輯。`findResidualPlaceholders` 的 `scanDeep` 對 `code_block` + `trace_steps` 遞迴掃描。

### 3.3 `scripts/mock-confusion-matrix.js`、`mock-mode8.js` 無需變更(各自 module scope,不交集)

### 3.4 R4C 自驗

- `node scripts/audit-render.js` → 0 violations(R4A/R4B 未動前,既有題庫不變不引入殘留 placeholder)
- `node scripts/audit-source-fidelity.js` → 0 violations
- Round 2 mock + Round 3 mock 無回歸

---

## 4. R4A — `code_reading` retrofit(22 題)

### 4.1 適用檔案

| 檔案 | 題數 | 範圍 |
|:--|:-:|:--|
| `src/questions-pa-code.json` | 12 | q_pa_001..q_pa_014(中間有空 id)|
| `src/questions-batch-n7-dl.json` | 3 | code_reading 題(找出 id 後列)|
| `src/questions.json` | 2 | code_reading 題 |

### 4.2 Retrofit 規則

每題 **至少 3 個 case**(case_a / case_b / case_c)。每 case 含:
- 程式碼變數值(`{a}`, `{n}`, `{batch}`, 等視題型而定 — Worker 自選命名)
- `answer`: 正解(經 Python 實跑確認)
- `wrong1/2/3`: 3 個錯誤答案(維持原 trap_type 邏輯,只是數值對應新 case)

**鐵律 #4 選項等長**:同 case 4 選項字數差 ≤ 25%(計算題 placeholder 替換後實測,Worker 主動把關)。

### 4.3 Python 驗證 mock

新檔 `scripts/mock-pa-code.py`:
- 讀 `src/questions-pa-code.json` + `src/questions-batch-n7-dl.json` + `src/questions.json`
- 對每題每 case:
  1. 字串替換 `code_block` 內 placeholder
  2. `subprocess.run(["python", "-c", code_substituted])` 抓 stdout
  3. 跟 case `answer` 字串比對
- 任一不符 → FAIL,單題級回報

### 4.4 R4A 自驗

- `node --check` 對所有改過的 JSON 檔(各自 JSON.parse)
- `python scripts/mock-pa-code.py` → PASS 全部(預期 22 題 × 3 case = 66 PASS)
- `node scripts/audit-source-fidelity.js` → 0 violations
- `node scripts/audit-render.js` → 0 violations(R4C 擴展後對 code_block 不應殘留)
- `node scripts/audit-option-length.js` → 觀察新題是否新增違規

---

## 5. R4B — `code_trace` retrofit(5 題)

### 5.1 適用檔案

`src/questions-mode8-trace.json` — 5 題 q_m8_001..q_m8_005,每題 3-4 個 trace_steps。

### 5.2 Retrofit 規則

每題 **至少 3 個 case**。每 case 含:
- `code_block` 內變數值(視題:`{v0}`, `{v1}`, `{n}`, 等)
- 每個 trace_step 的所有 option 對應值(以 step+option 為單位的 key,例:`{s1_correct}`, `{s1_w1}`, `{s1_w2}`, `{s1_w3}`)
- `explanation.correct` 內提到的具體數字也用 placeholder

trace_steps schema 修改範例:
```json
"trace_steps": [
  {
    "after_line": 2,
    "ask": "執行第 2 行後,v 的 shape 為?",
    "options": [
      {"text": "{s1_correct}", "is_correct": true},
      {"text": "{s1_w1}", "is_correct": false, "trap_type": "..."},
      {"text": "{s1_w2}", "is_correct": false, "trap_type": "..."},
      {"text": "{s1_w3}", "is_correct": false, "trap_type": "..."}
    ]
  },
  ...
]
```

`stem_variables.case_a` 提供 `{v0, v1, ..., s1_correct, s1_w1, s1_w2, s1_w3, s2_correct, ...}` 整組值。

### 5.3 Python 驗證 mock

擴 `scripts/mock-mode8-trace.py`(R3 已有,需擴 case-aware):
- 對每題每 case:
  1. 字串替換 `code_block` 內 placeholder
  2. 對每個 trace_step:
     - `exec(code_block_substituted[:after_line])` 在隔離 namespace
     - 對 step 的 `ask` 描述抓對應變數值(目前用 hardcode regex parse;改成讀 step 自帶的 `verify_expr` 欄位較清晰 — 但為避免破壞 R3 schema,延用 hardcoded 規則 + Worker 在 case 內提供 `s{N}_correct` 已是答案字串本身,Python 跑出來實際結果跟它比)
- 全 PASS(預期 5 題 × 3 case × 平均 3 step ≈ 45 PASS)

### 5.4 R4B 自驗

- JSON.parse PASS
- `python scripts/mock-mode8-trace.py` 全 PASS
- `node scripts/mock-mode8.js` 仍 PASS(Mode 8 state machine 不變)
- audit-source-fidelity 0 violations
- audit-render 0 violations

---

## 6. NEEDS_REVIEW(orchestrator 已預決)

- **每題 case 數**:至少 3 個(spec 強制)。Worker 可加到 4 個若該題容易設計(例如純數值代換);但 trace 題 trace_steps 多時 case 4 工時成本高,3 個為穩定線。
- **batch-n7-dl 與 questions.json 的 code 題是否也要 retrofit**:**是**。鐵律 #2 全範圍適用,不能只救 pa-code。
- **deep learning 題若涉 PyTorch / 隨機數**:Python 驗證需固定 seed(`torch.manual_seed(0)`)+ Worker 在 case 中提供 deterministic 預期值。
- **shuffle_options 是否與 case 池並用**:**並用**。case 變化 stem/code/options 內容,shuffle 變化選項位置,雙保險。
- **case 內 placeholder 命名**:由 Worker 自決(snake_case 字母開頭),但同題內 case_a/b/c 必須有完全相同的 key set(R4 Validator 強制檢查)。

---

## 7. 跨檔契約

| 檔案 | R4C 修改 | R4A 修改 | R4B 修改 |
|:--|:-:|:-:|:-:|
| `src/index.html` | ✓(renderQuestion + subDeep) | – | – |
| `scripts/audit-render.js` | ✓(simulateRender + scanDeep) | – | – |
| `src/questions-pa-code.json` | – | ✓(12 題加 stem_variables + 替換 code_block) | – |
| `src/questions-batch-n7-dl.json` | – | ✓(3 題,同上) | – |
| `src/questions.json` | – | ✓(2 題,同上) | – |
| `src/questions-mode8-trace.json` | – | – | ✓(5 題加 stem_variables + 改 trace_steps schema)|
| `scripts/mock-pa-code.py` | – | ✓ NEW | – |
| `scripts/mock-mode8-trace.py` | – | – | ✓(R3 已有,擴 case-aware)|

**並行衝突**:R4A 與 R4B 修改不同檔,無衝突。R4C 是 R4A/R4B 的前置(renderQuestion 必須先支援 code_block + trace_steps 替換)。

**派工順序**:R4C 先做完並 commit → R4A 與 R4B 並行 → 各自 Validator → ground truth → commit。

---

## 8. 預計工時

| Round | 工作 | 工時 |
|:--|:--|:-:|
| R4C | renderQuestion 擴 + audit-render 擴 | 30 分鐘 |
| R4A | 17 題 × 3 case = 51 case Python 驗算 + 寫 mock | 2.5-3.5 小時 |
| R4B | 5 題 × 3 case × 平均 3 step = 45 step 驗算 + mock 擴 | 1.5-2.5 小時 |
| Validators × 3 + ground truth + commit × 4 | 跨檔審 + git 收尾 | 1-1.5 小時 |
| **總計** | | **5.5-7.5 小時** |

剩 12 天,即便走悲觀 7.5 小時,當天完成 + 玩測仍有 11 天緩衝。

---

## 9. 鐵律對齊

| 鐵律 | R4 修改影響 |
|:--|:--|
| #1 錯題下鑽 | 不影響 — Wrongbook 結構不變 |
| #2 動態題庫 | **此次主旨**,違反現況 → 完全治本 |
| #3 不抄 114-2 | 不影響 — 既有題已合規,Retrofit 僅替換變數值,不換場景 |
| #4 選項等長 | Worker 必須對每個 case 替換後手動驗 ≤25% 字數差 |
| #5 來源忠實 | 不影響 — node_id / kb 引用不變 |

---

> 此規格由 orchestrator 撰寫。任何 Worker 在開工前**必先讀此檔**。
