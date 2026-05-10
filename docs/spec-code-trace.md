# Spec — Code Trace 道場(Mode 8)

> 撰寫:exploration agent,2026-05-11
> 角色:供 Worker 實作前的精確規格
> 前置必讀:`docs/architecture-current.md`

---

## 1. 目標

新增 Mode 8 — Python 程式逐行 trace。使用者看程式碼,在每個「中斷點」(指定行)被問:「執行此行後,變數 x 的值是?」,使用者輸入或選擇答案。

**為什麼值得**:
- 既有 Mode 2(程式判讀)只問「最終輸出」,不訓練「中間狀態」
- IPAS 中級對 Python / numpy / sklearn 程式語意要求高(L23102 / L23103 整章 + L23202 經典演算法)
- Trace 強迫使用者**模擬執行**,真懂 vs 死背能立刻看出差距

**⚠️ 高風險**:trace 資料**全部需手寫驗算**,bottleneck 在出題,不在實作。

---

## 2. 模式編號 / 路徑

- **Mode number**:8
- **檔案**:`src/modes/mode8.js`
- **view id**:`view-play`(共用,同其他 mode,**非** `view-game-mode8`)
- **Storage key**:`ipas_mode8_dojo_v1`(模仿 mode1 命名)
- **進入點**:`enterMode(8)` → `window.Mode8.start()`(走 dynamic lookup,index.html:1022)

新增 mode-card UI 在 index.html 339-388 模式選單內,新 button:
```html
<button class="mode-card" onclick="enterMode(8)">
  <div class="mode-num">案 8</div>
  <div class="mode-title">📝 Code Trace 道場</div>
  <div class="mode-desc">逐行追蹤 Python 程式變數狀態</div>
  <div class="mode-stats">進階 · 程式</div>
</button>
```

新增動態載入:index.html:1524 字串陣列加 `'mode8'`。

---

## 3. 題目 Schema

新增題庫檔:`src/questions-mode8-trace.json`。

### 3.1 完整 Schema

```json
{
  "version": "1.0",
  "purpose": "Mode 8 Code Trace 題庫",
  "schema_version": "iron-rule-1+2+3",
  "questions": [
    {
      "id": "q_m8_001",
      "knowledge_code": "L23102",
      "node_id": "n_L23102_005",
      "subject": 3,
      "format": "code_trace",
      "difficulty": "easy",
      "source_level": "L2",
      "stem": "下列程式計算向量的 L2 norm。請依提示逐行追蹤變數狀態。",
      "code_block": "import numpy as np\nv = np.array([3.0, 4.0])\nsq = v ** 2\ns = sq.sum()\nresult = np.sqrt(s)",
      "trace_steps": [
        {
          "after_line": 2,
          "ask": "執行第 2 行後,v 的 shape 為?",
          "options": [
            {"text": "(2,)", "is_correct": true},
            {"text": "(2, 1)", "is_correct": false},
            {"text": "(1, 2)", "is_correct": false},
            {"text": "(2, 2)", "is_correct": false}
          ]
        },
        {
          "after_line": 3,
          "ask": "執行第 3 行後,sq 的內容為?",
          "options": [
            {"text": "[9.0, 16.0]", "is_correct": true},
            {"text": "[3.0, 4.0]", "is_correct": false, "trap_type": "未做平方"},
            {"text": "[6.0, 8.0]", "is_correct": false, "trap_type": "誤用 *2"},
            {"text": "25.0", "is_correct": false, "trap_type": "誤算 sum"}
          ]
        },
        {
          "after_line": 4,
          "ask": "執行第 4 行後,s 的值為?",
          "options": [
            {"text": "25.0", "is_correct": true},
            {"text": "[9.0, 16.0]", "is_correct": false, "trap_type": "未 sum"},
            {"text": "5.0", "is_correct": false, "trap_type": "已開根號"},
            {"text": "12.5", "is_correct": false, "trap_type": "誤用 mean"}
          ]
        },
        {
          "after_line": 5,
          "ask": "執行第 5 行後,result 的值為?",
          "options": [
            {"text": "5.0", "is_correct": true},
            {"text": "25.0", "is_correct": false, "trap_type": "未開根號"},
            {"text": "2.236", "is_correct": false, "trap_type": "誤用 sqrt(5)"},
            {"text": "4.0", "is_correct": false}
          ]
        }
      ],
      "options": [
        {"text": "(全部步驟正確)", "is_correct": true},
        {"text": "(任一步驟錯誤)", "is_correct": false}
      ],
      "shuffle_options": false,
      "explanation": {
        "correct": "L2 norm 計算流程:平方 [3²,4²]=[9,16] → 加總 25 → 開根 5。np.linalg.norm(v) 預設等同此計算",
        "wrong": {
          "(任一步驟錯誤)": "見各 trace_step 的 explanation"
        },
        "hook": "L2 norm = sqrt(平方和);平方和 = 25,sqrt(25) = 5"
      },
      "misconceptions": ["未開根號就回傳", "誤用 ** 2 vs * 2"],
      "related_node_ids": ["n_L23102_005", "n_L23102_001"],
      "tags": ["python", "numpy", "trace", "L2-norm"]
    }
  ]
}
```

### 3.2 新欄位

| 欄位 | 型別 | 必填 | 說明 |
|:--|:--|:-:|:--|
| `format` | `"code_trace"` | ✓ | 新 format(會進 audit script 白名單)|
| `code_block` | string | ✓ | Python 程式碼,**逐行 \n 分隔**(供 split 配合 line number)|
| `trace_steps` | array<object> | ✓ | 每步 `{after_line: int, ask: string, options: [{text, is_correct, trap_type?}]}`,**單題多步**|
| `options` | array<object> | ✓ | 整題層級 options(用於 PlayEngine 既有判定 + Wrongbook,**非渲染給使用者**),固定為 `[{text:"(全部步驟正確)",is_correct:true}, {text:"(任一步驟錯誤)",is_correct:false}]`|

### 3.3 為什麼 trace_steps + 整題 options?

- **trace_steps** 是 Mode 8 自渲染的真互動,使用者每步答題
- **整題 options** 是為了**保留** PlayEngine 既有的 Mastery / Wrongbook 邏輯(走 `is_correct` 旗標)。Mode 8 統計「全部步驟答對」=true 才走 `is_correct: true` 路徑

### 3.4 audit script 對 `code_trace` format 的處理

| audit | 既有行為 | 對 `code_trace` 處理 |
|:--|:--|:--|
| `audit-source-fidelity.js` | 看 `node_id / knowledge_code` | 自動適用,新 format 不影響 |
| `audit-option-length.js` | line 53 過濾 `single` 才看 | code_trace 不含 single → 自動 skip(等同 calculation 行為)|
| `audit-render.js` | calc 題替換 placeholder | code_trace 沒 stem_variables → 走 else 分支(line 114-121),自動適用 |
| `audit-calculation.js` | 只對 `format === "calculation"` | 自動 skip code_trace |

**Worker 需新增的 audit 邏輯**(可放新檔 `scripts/audit-mode8-trace.js`):
- 每題 `code_block` split('\n') 後,每步 `after_line` 必在合法範圍 [1, line_count]
- 每步 `options` 必有恰一個 `is_correct: true`
- `trace_steps` 至少 2 步(否則退化成 mode 2)

---

## 4. UI 文字 wireframe

```
┌─ 📝 Code Trace 道場 ─ 第 1/8 題 ─────┐
│ knowledge_code: L23102 · easy · trace│
└──────────────────────────────────────┘

[題目 stem]
下列程式計算向量的 L2 norm。請依提示逐行追蹤變數狀態。

┌─ 程式碼 ────┬─ 執行狀態 ────────┐
│ 1| import   │ (Step 1/4)         │
│ 2| v = ...  │ ▶ 執行中           │
│ 3| sq = ... │ 等待中             │
│ 4| s = ...  │ 等待中             │
│ 5| result   │ 等待中             │
│            │                    │
│ 紅光標在第 2 行  │ Q: 執行第 2 行後│
│            │   v 的 shape 為? │
│            │   ┌────────────┐  │
│            │   │ A. (2,)    │  │  ← 點選後鎖定
│            │   │ B. (2,1)   │  │
│            │   │ C. (1,2)   │  │
│            │   │ D. (2,2)   │  │
│            │   └────────────┘  │
└────────────┴───────────────────┘

提示:答對後光標前進到下一行(第 3 行)。
答錯後可選「再試」或「看解釋並繼續」。
```

### 4.1 元件分配

- **左側 code panel**:`<pre class="code-syntax">` 沿用既有 highlightCodeSimple,**外加** 一個 highlight overlay 標記當前 `after_line`(可用 `<span class="cursor-line">` 包該行)
- **右側 prompt panel**:題目 + ABCD 4 個 option button
- **進度條**:`Step 1/4 · 已對 1`

---

## 5. 整合點

### 5.1 mode8.js 結構

```js
// src/modes/mode8.js
(function() {
  const STORAGE_KEY = 'ipas_mode8_dojo_v1';

  // === 題庫:篩選 format === 'code_trace' 的題 ===
  function pickQuestions(n = 8) {
    const pool = QUESTIONS.filter(q => q.format === 'code_trace');
    return RNG.pickN(pool, Math.min(n, pool.length));
  }

  const Mode8 = {
    state: null,
    _timers: [],

    _scheduleTimeout(fn, ms) { ... },  // 同 mode1 pattern
    _clearAllTimers() { ... },

    start() {
      this._clearAllTimers();
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      const questions = pickQuestions(8);
      if (questions.length === 0) {
        showToast('⚠️ Mode 8 題庫尚未建立', 2500);
        goHome();
        return;
      }
      this.state = {
        questions,
        idx: 0,
        stepIdx: 0,
        currentQ: null,
        stepResults: [],  // 每步 isCorrect 紀錄
        answering: false
      };
      this.showQuestion();
    },

    showQuestion() {
      if (!this.state) return;
      if (this.state.idx >= this.state.questions.length) { this.finish(); return; }
      const q = renderQuestion(this.state.questions[this.state.idx]);
      this.state.currentQ = q;
      this.state.stepIdx = 0;
      this.state.stepResults = [];
      this.renderTrace();
    },

    renderTrace() {
      const q = this.state.currentQ;
      const step = q.trace_steps[this.state.stepIdx];
      const codeLines = q.code_block.split('\n');
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card">
          <h2>📝 Code Trace 道場 · 第 ${this.state.idx+1}/${this.state.questions.length} 題</h2>
          <p>${q.stem}</p>
          <div class="m8-grid">
            <div class="m8-code">
              ${codeLines.map((ln, i) => {
                const lineNum = i + 1;
                const cursor = lineNum === step.after_line ? 'm8-line-current' : '';
                return `<div class="m8-line ${cursor}"><span class="m8-lineno">${lineNum}|</span> ${highlightCodeSimple(ln)}</div>`;
              }).join('')}
            </div>
            <div class="m8-prompt">
              <div class="m8-step-meta">Step ${this.state.stepIdx+1}/${q.trace_steps.length}</div>
              <div class="m8-ask">${step.ask}</div>
              <div class="options" id="m8-options">
                ${step.options.map((o, i) => `
                  <button class="option-btn" data-key="${i}" onclick="Mode8.answerStep(${i})">
                    <span class="option-key">${String.fromCharCode(65+i)}.</span> ${o.text}
                  </button>
                `).join('')}
              </div>
              <div id="m8-step-explanation"></div>
            </div>
          </div>
        </div>
      `;
      show('view-play');
    },

    answerStep(idx) {
      if (this.state.answering) return;
      const q = this.state.currentQ;
      const step = q.trace_steps[this.state.stepIdx];
      const opt = step.options[idx];
      this.state.answering = true;
      const isCorrect = !!opt.is_correct;
      this.state.stepResults.push(isCorrect);
      // 鎖按鈕
      document.querySelectorAll('#m8-options .option-btn').forEach((b, i) => {
        b.disabled = true;
        if (step.options[i].is_correct) b.classList.add('correct');
        else if (i === idx && !isCorrect) b.classList.add('wrong');
      });
      // 渲染 step explanation(若 trap_type 存在,提示 trap)
      const expHTML = `<div class="explanation">
        <div class="verdict ${isCorrect?'correct':'wrong'}">${isCorrect?'✓ 對':'✗ 錯'}</div>
        ${!isCorrect && opt.trap_type ? `<div>陷阱類型:${opt.trap_type}</div>` : ''}
        <button class="btn btn-primary" onclick="Mode8.nextStep()">${this.state.stepIdx+1 < q.trace_steps.length ? '下一行 →' : '查看完整解析 →'}</button>
      </div>`;
      document.getElementById('m8-step-explanation').innerHTML = expHTML;
    },

    nextStep() {
      this.state.answering = false;
      this.state.stepIdx++;
      const q = this.state.currentQ;
      if (this.state.stepIdx >= q.trace_steps.length) {
        // 整題結束 — Mastery / Wrongbook 走整題層級判定(全步答對才算對)
        const allCorrect = this.state.stepResults.every(r => r);
        if (q.node_id) Mastery.update(q.node_id, allCorrect);
        Progress.addAnswer(allCorrect);
        if (!allCorrect) {
          const correctOpt = q.options.find(o => o.is_correct);
          Wrongbook.add(q.id, q.node_id, '?', correctOpt ? correctOpt.key : 'A');
        }
        if (typeof SM2 !== 'undefined') SM2.recordAnswer(q.id, allCorrect, false);
        this.showFullExplanation(allCorrect);
        return;
      }
      this.renderTrace();
    },

    showFullExplanation(allCorrect) {
      const q = this.state.currentQ;
      const e = q.explanation || {};
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card">
          <div class="explanation">
            <div class="verdict ${allCorrect?'correct':'wrong'}">
              ${allCorrect?'🎉 全部答對':'❌ 部分答錯'} (${this.state.stepResults.filter(r=>r).length}/${this.state.stepResults.length})
            </div>
            <div>${e.correct || ''}</div>
            ${e.hook ? `<div style="margin-top:12px"><strong>💡 ${e.hook}</strong></div>` : ''}
            <div class="actions" style="margin-top:14px">
              <button class="btn btn-primary" onclick="Mode8.next()">繼續下一題 →</button>
              ${!allCorrect ? `<button class="btn btn-warn" onclick="Mode8.drillThis()">🎯 立即下鑽變化型</button>` : ''}
              ${ErrorReports.renderButton(q.id)}
              <button class="btn btn-ghost" onclick="goHome()">回首頁</button>
            </div>
          </div>
        </div>
      `;
    },

    drillThis() {
      if (!this.state || !this.state.currentQ) return;
      const variations = generateVariation(this.state.currentQ, 3);
      if (!variations || variations.length === 0) {
        showToast('⚠️ 此知識點變化型不足', 2500); return;
      }
      this._clearAllTimers();
      DrillSession.start(this.state.currentQ.node_id, variations, this.state.currentQ, () => {
        if (!this.state) return;
        this.next();
      });
    },

    next() {
      if (!this.state) return;
      this.state.idx++;
      this.showQuestion();
    },

    finish() {
      const view = document.getElementById('view-play');
      view.innerHTML = `<div class="card">
        <h2>📝 Code Trace 道場結束</h2>
        <p>本場 ${this.state.questions.length} 題</p>
        <div class="actions">
          <button class="btn btn-primary" onclick="Mode8.start()">再來一場</button>
          <button class="btn btn-ghost" onclick="goHome()">回首頁</button>
        </div>
      </div>`;
      show('view-play');
    }
  };
  window.Mode8 = Mode8;
})();
```

### 5.2 index.html 修改

| 行 | 動作 |
|:-:|:--|
| 339-388(modes-grid)| 加 mode 8 按鈕 |
| 1017-1028 enterMode | 走 `window['Mode' + mode].start()` 既有 fallback,**無需修改**(Mode 8 走動態 lookup)|
| 1524 動態載入字串陣列 | 加 `'mode8'` |
| `<style>` 區(可選 308 之前)| 加 `.m8-grid / .m8-code / .m8-line / .m8-line-current / .m8-lineno / .m8-prompt / .m8-step-meta / .m8-ask` CSS |
| 790-808 loadQuestions files | 加 `'questions-mode8-trace.json'` |

### 5.3 audit script 同步

- `scripts/audit-source-fidelity.js`(行 11-20 Q_FILES)+= `'questions-mode8-trace.json'`
- `scripts/audit-render.js`(行 13-22 FILES)+= 同
- `scripts/audit-option-length.js`(行 7-25 FILES)+= 同(自動 skip code_trace,因為 line 53 條件)
- 新增 `scripts/audit-mode8-trace.js`(可選),驗 trace_steps 結構

---

## 6. 鐵律相容性

| 鐵律 | 衝突? | 說明 |
|:-:|:-:|:--|
| #1 錯題驅動下鑽 | – | 整題層級走 Mastery / Wrongbook(allCorrect 判定),`drillThis()` 走既有 generateVariation。下鑽出來的題仍可能是 single_choice 或 code_reading,不一定是 code_trace(可接受)|
| #2 動態題庫 | △ | code_trace 的 code_block 改成 placeholder 較難(每行可能變),v0 不支援 stem_variables case,使用者多次玩會看到相同題目 — 但**每場 RNG.pickN(8)**,8 題池夠大就不死記。題庫至少 16 題以保留變化空間 |
| #3 不抄 114-2 | – | code_trace 是新題型 |
| #4 選項長度 | △ | 每步 4 個 option 應控制長度均衡(例如不要正解 `(2,)` 寫超短而錯解 `[2.0, 4.0, 6.0]` 寫超長)。Worker 出題時手動把關,**audit script 不檢 code_trace**(自動 skip)|
| #5 來源忠實 | ⚠️ | 必選白名單內 node。code_trace 適合的節點少,見下節 |

### 6.1 鐵律 #5 — Mode 8 候選節點清單

從 `scripts/kb-allowed-nodes.json` 過濾「需要 Python 程式 trace 才能練得到」的節點:

| code | node_id | title |
|:--|:--|:--|
| L23102 | n_L23102_001 | PCA(主成分分析)— 適合 numpy 矩陣運算 trace |
| L23102 | n_L23102_004 | SVD(奇異值分解)|
| L23102 | n_L23102_005 | t-SNE / norm 計算 |
| L23102 | n_L23102_006 | UMAP |
| L23102 | n_L23102_008 | NMF |
| L23103 | n_L23103_001 | Adam 優化器 — 可 trace 內部動量更新 |
| L23103 | n_L23103_003 | 學習率控制 |
| L23103 | n_L23103_004 | 時間複雜度 — 可 trace 雙層 for 迴圈 |
| L23202 | n_L23202_002 | DBSCAN 三類點 — trace 點分類迴圈 |
| L23202 | n_L23202_003 | 邏輯迴歸 — sigmoid + gradient |
| L23202 | n_L23202_005 | 決策樹 + 資訊增益 |
| L23202 | n_L23202_008 | K-means vs DBSCAN |
| L23203 | n_L23203_001 | ReLU 激活 — 簡單 trace |
| L23203 | n_L23203_003 | 加權求和公式 |
| L23303 | n_L23303_001 | F1 計算 — 已被互動矩陣覆蓋,可避免重複 |

**Worker v0 推薦選 5-8 個節點**(覆蓋 numpy / 演算法 / 激活函數三類,避免單一主題):
1. n_L23102_005(L2 norm — easy)
2. n_L23103_004(時間複雜度迴圈 — easy)
3. n_L23203_001(ReLU — easy)
4. n_L23202_003(邏輯迴歸 sigmoid — medium)
5. n_L23103_001(Adam 動量 — medium)
6. n_L23202_002(DBSCAN 點分類 — hard)
7. n_L23102_001(PCA 中心化步驟 — hard)
8. n_L23202_005(決策樹資訊增益 — hard)

8 個節點,Worker 每節點寫 1 題 = 8 題 v0(章節 11 下鎖定 v0 數量)。

---

## 7. 檔案級 / 行級約束

### MAY modify

| 檔 | 動作 |
|:--|:--|
| `src/modes/mode8.js` | NEW |
| `src/questions-mode8-trace.json` | NEW(8 題)|
| `src/index.html` | 加 mode 8 mode-card / 動態載入 / loadQuestions files / CSS |
| `scripts/audit-source-fidelity.js` | Q_FILES 加新檔 |
| `scripts/audit-render.js` | FILES 加新檔 |
| `scripts/audit-option-length.js` | FILES 加新檔 |
| `scripts/audit-mode8-trace.js` | NEW(可選,驗 trace_steps schema)|

### MUST NOT modify

- `kb/` 全部
- 既有 `src/questions*.json` 全部
- 既有 `src/modes/mode1-7.js` 全部(獨立 mode)
- 既有 `src/index.html` 共用層 const(`Storage` / `RNG` / `Mastery` / `Wrongbook` / `PlayEngine` / `DrillSession` / `ErrorReports` / `Progress`)定義部分(行 428-785、1031-1267)
- `audit-stem-explanation-consistency.js`(可能對 code_trace 誤判,Worker 看 audit 結果若大量 false positive 可加 skip 條件)

### Field-level constraint

- Worker **不可** 在 questions-mode8-trace.json 內偽造 node_id(必在白名單)
- `format` 必為 `"code_trace"`(新值)
- `code_block` 必為實際可執行的 Python(Worker 應在開發機 `python -c` 跑一次驗算)
- `trace_steps[].after_line` 必為合法行號(1-based,不超出 code_block.split('\n').length)
- `trace_steps[].options` 必有恰 1 個 `is_correct: true`
- `options`(整題層級)固定 schema,不可省略(PlayEngine 路徑相依)

---

## 8. 自驗腳本

```bash
node --check src/modes/mode8.js
python -c "exec(open('scripts/mock-mode8-traces.py').read())"  # Worker 寫 mock script,執行每題 code_block,驗 trace_steps 答案

# 既有 audit
node scripts/audit-source-fidelity.js
node scripts/audit-render.js
node scripts/audit-option-length.js

# 新 audit(可選)
node scripts/audit-mode8-trace.js
```

**最重要**:Worker **必須**手動逐題在 Python REPL 跑一次,把每步變數狀態 print 出來,對比 `trace_steps[].options[is_correct].text`。任何一題出錯,單題 reject 整題重做。

---

## 9. 估計實作成本

### 9.1 程式碼

- `mode8.js`:~250 LOC
- `index.html` 改動:~40 LOC(CSS + mode-card + script tag + loadQuestions list)
- `audit-mode8-trace.js`(可選):~50 LOC
- **小計**:~340 LOC

### 9.2 手寫題目工時(瓶頸)

每題 trace 題寫作流程:
1. 選 node_id → 設計 6-12 行 Python 程式
2. **手動跑** Python 確認執行結果
3. 設計 3-4 個 trace_steps,每步寫 1 正解 + 3 陷阱選項
4. 確認鐵律 #4 選項長度均衡
5. 寫 `explanation.correct / wrong / hook / misconceptions`
6. 跨檔 audit(node_id 在白名單、related_node_ids 合法)

**單題工時**:30-60 分鐘(熟手 30 分,生手 60 分)。
**8 題 v0 工時**:4-8 小時手寫 + 1-2 小時驗算。

### 9.3 開發時間

- **程式實作**:1-1.5 天
- **題目手寫**:1-2 天
- **總計**:2-3.5 天

---

## 10. 與 Mastery 整合(鐵律 #1)

整題層級判定:
- `allCorrect = stepResults.every(r => r)` = true → `Mastery.update(node_id, true)`
- 任一步錯 → `Mastery.update(node_id, false)` + `Wrongbook.add`

下鑽路徑:
- 任一步錯 → 顯示「立即下鑽變化型」按鈕
- 點擊 → `generateVariation(currentQ, 3)` 從 same node_id 取變化型
- **注意**:同 node_id 可能沒其他 code_trace 題,fallback 到 single_choice / code_reading 變化型,**仍合規**(generateVariation 不限 format)

---

## 11. v0 範圍建議(critical assessment)

### 13 天到考試,Mode 8 的可行性?

| 工作項 | 樂觀工時 | 悲觀工時 |
|:--|:-:|:-:|
| mode8.js 實作 | 1 天 | 1.5 天 |
| 8 題手寫 + 驗算 | 1 天 | 2 天 |
| audit 整合 + 跑 ground truth | 0.5 天 | 1 天 |
| Worker / Validator 雙審 + 修補 | 0.5 天 | 1 天 |
| **總計** | **3 天** | **5.5 天** |

13 天 - 已配置給 SM-2 (1.5 天) - 互動矩陣 (2 天) = **9.5 天剩餘**

→ Mode 8 v0 (3-5.5 天) **可行**,但**有風險**,風險來源:
1. trace_steps schema 是新東西,Worker 第一次寫可能踩坑
2. 8 題手寫驗算會耗時(尤其要對選項長度均衡)
3. CSS 雙欄佈局(code panel + prompt panel)響應式可能耗時調校

### v0-minimal 建議

如果工時吃緊,**以下動作可同步降低 scope**:

1. **題量降到 5 題**(節省 1.5 小時/題 × 3 = ~5 小時)
   - n_L23102_005 (L2 norm)
   - n_L23103_004 (時間複雜度)
   - n_L23203_001 (ReLU)
   - n_L23202_003 (邏輯迴歸 sigmoid)
   - n_L23202_002 (DBSCAN)
2. **drill-down 整合 v0 暫不做**(`drillThis()` 留著但點擊只 toast 提示)— 節省 ~0.5 天
3. **CSS 響應式 v0 略過**(只支援桌面)— 節省 ~0.3 天
4. **audit-mode8-trace.js 暫不寫**,靠手動驗算 — 節省 ~0.3 天

如果以上全採:
- v0-minimal **2 天可完成**
- 後續若使用者反饋 OK,再補完 drill-down + 響應式 + audit script

### 推薦決策

**v0 走 minimal**:5 題、無 drill 整合、桌面優先、無自動 audit。

理由:
- 13 天到考試,使用者**核心需求是練 Mastery / SM-2 / 弱點獵人**,Mode 8 是 nice-to-have
- 5 題夠驗證概念,使用者試玩後再決定是否擴展
- 與其 Mode 8 全力投入而 SM-2 / 互動矩陣品質下降,寧可 Mode 8 minimal 但 SM-2 / 互動矩陣 polish

---

## 12. NEEDS_REVIEW

- [ ] **drill-down 整合**:Mode 8 整題層級 mastery 判定可能與「鐵律 #1 答錯立刻下鑽」對齊度不高(只有 4 步全錯才 drill)。是否該改成「任一步錯就 drill」?spec v0 暫採整題判定,後續視使用者反饋修
- [ ] **stem_variables 變化**:v0 不支援 case 替換 → 重玩死記。考前 13 天能否先放棄 trace 動態化?spec 暫**放棄**,題庫池 5+ 題以提供換題變化感
- [ ] **trap_type 文字**:每步陷阱類型寫法,Worker 應參考既有 `q_pa_*` 的 trap_type pattern,維持一致
- [ ] **整題 options 的「(全部步驟正確)」/「(任一步驟錯誤)」是否會誤導 Wrongbook**:這兩個選項是 PlayEngine 路徑相容的人造 fixture,使用者不會看到。但若使用者打開錯題本,Wrongbook 顯示這兩字串可能困惑。Mode 8 自寫 finish 時已 bypass,但若走錯題本路徑(Review.drillItem)就會看到。spec **接受此小瑕疵**(13 天時間有限)
- [ ] **是否 RNG.set 每題重抽**:目前 spec start() 重設一次,題目 trace_steps 內順序固定,可能死記。Worker 可在 renderTrace 加 `step.options = RNG.shuffle(step.options)`(每步選項打散)
