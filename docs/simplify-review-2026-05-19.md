# Simplify Review Report — 2026-05-19

> Static reviewer scan of `src/index.html` + `src/modes/*.js`(11,190 LOC)。只指出重複 / dead / 過度複雜 / 不必要抽象;不修補、不指 bug。

---

## 重複 code(可抽 helper 的)

### R1. `esc()` HTML escape — 5 字元 replace chain 重複 **15+ 處**
- 出現地點:
  - `src/index.html:1179-1183`(`ErrorReports._esc`)
  - `src/index.html:2007`(DrillSession `_drillEsc` inline)
  - `src/index.html:2107`(history rendering inline)
  - `src/index.html:2329-2331`(`highlightCodeSimple` 前 3 行)
  - `src/index.html:2467-2469`(`ProgressIO.escapeHTML`)
  - `src/modes/mode1.js:114-118`
  - `src/modes/mode2.js:141-145`
  - `src/modes/mode3.js:24-28`
  - `src/modes/mode4.js:275`(只 escape & < > — 不完整)
  - `src/modes/mode4.js:561-563`(inline)
  - `src/modes/mode6.js:161-164`
  - `src/modes/mode7.js:161-165`(`_esc`)
  - `src/modes/mode7.js:1501`(inline 不完整,只 escape & < >)
  - `src/modes/mode7.js:1985`(inline)
  - `src/modes/mode8.js:538-546`
- 重複片段:
  ```js
  String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  ```
- 建議 helper:`window.escHTML(s)` 集中放 index.html(function 宣告自動掛 window,合 §2 黃金規則);所有 mode `function esc(s)` 改成 `const esc = escHTML;` 或直接呼叫
- **注意**:mode4:275 與 mode7:1501 是「殘缺版」(只 escape 3 字元) — 不是設計差異,是疏漏。修補時需驗證可改成完整 5-字元版本(若 stem/text 內已知不含引號可能影響 title attr)

### R2. `highlightCode` Python 簡易 syntax highlight — 完全相同 **3 處**
- `src/index.html:2329-2340`(`highlightCodeSimple`,9 行)
- `src/modes/mode1.js:120-129`(`highlightCode`,9 行)
- `src/modes/mode5.js:133-142`(`highlightCode`,9 行)
- 三份**含同樣的 2026-05-11 註解 + 同樣的 keyword list**(`import|from|def|return|if|else|...nn|tf`)
- 建議:刪 mode1 / mode5 的本地版,直接讀 `window.highlightCodeSimple`(index.html 已掛 window,合 §2)。mode2 / mode8 已正確使用 `highlightCodeSimple`。
- 可刪 ~20 行

### R3. 「鎖選項按鈕 + 標 correct/wrong class」— 6 行 `forEach` 重複 **4 處**
- `src/modes/mode1.js:453-459`
- `src/modes/mode2.js:514-520`
- `src/modes/mode5.js:531-537`
- `src/index.html:1780`(DrillSession 內,可能略不同)
- 重複片段:
  ```js
  document.querySelectorAll('#mN-options .option-btn').forEach(b => {
    b.disabled = true;
    const k = b.dataset.key;
    const od = q.options.find(o => o.key === k);
    if (od && od.is_correct) b.classList.add('correct');
    else if (k === key && !isCorrect) b.classList.add('wrong');
  });
  ```
- 建議 helper:`PlayEngine.lockOptions(containerSelector, options, userKey)`(原本就有 `PlayEngine`,加 method 不破壞模組界線)。或更輕量 `function lockAnswerButtons(sel, options, userKey)` 掛 window。
- 可刪 ~12 行

### R4. `estLevel` → emoji/color/label 三元映射 重複 **2 處**
- `src/modes/mode7.js:379-380`(`_renderHistory`)
- `src/modes/mode7.js:1740-1746`(`_renderResult`)
- 完全相同的 `estLevel === '高' ? '#4ade80' : ...` 映射,定義在兩處
- 建議:`Mode7._levelMeta = { '高': {color:'#4ade80', emoji:'🥇', label:'高分通過候選'}, ... }` 一張查表
- 可刪 ~6 行

### R5. `byCategory` 結果格式化 — 4 行重複公式
- `src/modes/mode7.js:1720-1723`:
  ```js
  L21: result.byCategory.L21.total > 0 ? `${result.byCategory.L21.correct}/${result.byCategory.L21.total}` : '0/0',
  L22: result.byCategory.L22.total > 0 ? ...,
  L23: ...,
  other: ...
  ```
- 建議:`Object.fromEntries(['L21','L22','L23','other'].map(c => [c, fmt(result.byCategory[c])]))`,`fmt` 簡單寫法 `({correct,total}) => total ? \`${correct}/${total}\` : '0/0'`
- 可刪 ~3 行

### R6. `_pendingTimers / _scheduleTimeout / _clearAllTimers` — 完全相同 12 行 重複 **4 處**
- `src/modes/mode1.js:172-189`
- `src/modes/mode2.js:189-208`
- `src/modes/mode5.js:152-164`
- `src/modes/mode8.js`(類似 `_timers`)
- 註解明寫「對齊 Mode 1 _scheduleTimeout / _clearAllTimers 模式」自承複製
- 建議:抽 `window.TimerBag` 工廠 — `const TimerBag = () => ({ list:[], schedule(fn,ms){...}, clearAll(){...} })`,mode 內 `this._timers = TimerBag()`
- 可刪 ~30 行(扣掉一處保留為實作)

### R7. 答題後 user-facing 共用層更新(Mastery+Progress+SeenCorrect+SM2+Wrongbook) 樣板 **3 處**
- `src/modes/mode1.js:458-468`、`src/modes/mode2.js:520-530`、`src/modes/mode5.js:540-558`
- 結構固定:`if (q.node_id) Mastery.update(...)` → `if (SM2) SM2.recordAnswer(...)` → `Progress.addAnswer(...)` → `if (isCorrect && q.id) SeenCorrect.mark(...)` → `if (!isCorrect) Wrongbook.add(q.id, q.node_id, key, c.key, userText, correctText)`
- 註解都掛「案例 10 LOW-1 / 補:傳 userText/correctText」自承 cargo-cult 抄了 3 處
- 建議 helper:`PlayEngine.commitAnswer(q, key, isCorrect)`(集中所有共用層 side-effect,case 10 教訓的根因預防 — 漏抄一處 = 系統靜默壞)
- 可刪 ~24 行 + **大幅降低類似案例 10 漏抄類 bug 復發機率**

---

## Dead code

### D1. `const Mode4` placeholder 完整實作(28 行)— 永遠不被執行
- `src/index.html:2229-2258`
- 根據:`src/modes/mode4.js:809-812`,mode4.js 啟動時跑 `Object.keys(Mode4).forEach(delete)` 然後 `Object.assign(Mode4, Mode4Impl)`。placeholder 的 `start / nextOne / finish` 方法在 mode4.js 載入後**全被刪掉**;`enterMode(4)` 跑的是 mode4.js 的真實作。
- 為何不能整段刪:**只需保留 `const Mode4 = {};`** — mode4.js 內 `Object.assign(Mode4, Mode4Impl)` 需要 const 綁定的目標存在(CLAUDE.md 案例 3)
- 可刪約 25 行(保留 `const Mode4 = {};` 1 行 + 註解)

### D2. `script_init` 前 `// === 模式佔位符` 註解區
- `src/index.html:2222-2228`、`src/index.html:2260-2261`
- 註解描述「Mode1/2/3/5 由 sub agent 實作」,屬歷史開發筆記,當前狀態已穩定 — narrating change
- 可刪約 8 行

### D3. `Mode4.stopTimer` 在 goHome 內呼叫但 mode4 沒這方法
- `src/index.html:1560`:`if (typeof Mode4 !== 'undefined' && Mode4.stopTimer) Mode4.stopTimer();`
- mode4.js 內無 `stopTimer` 定義(只有 `cleanup` 透過 `_clearAllTimers` 等不同 API)
- 結果:guard 永遠 false,該行 dead;但若日後加 stopTimer 又會無聲變活
- 建議:改成 `Mode4.cleanup && Mode4.cleanup()`(對齊 Mode5/6),或刪除該行 + 在 Mode4 內補 cleanup wiring

### D4. `_saveFontScale` 包裝(Mode7)— 一行 trivial 包裝只在 _applyFontScale 內呼叫一次
- `src/modes/mode7.js:706-708`、唯一 caller `mode7.js:720`
- 內容:`Storage.set(FONT_SCALE_KEY, key);`
- 建議:inline 進 `_applyFontScale`,刪函式本體
- 可刪 3 行(微收益,可不做)

---

## 過度複雜

### S1. `renderQuestion` 內巢狀 `subAll / subDeep / 個別欄位替換` 5 個分支
- `src/index.html:893-961`(69 行)
- 對 stem / options / explanation.correct / explanation.hook / explanation.wrong / matrix_data / expected_answer / extra_classes / code_block / trace_steps 個別寫 if-then-replace,每處重複 `if (rendered.X) rendered.X = subAll(...)`
- 建議:把所有「需 placeholder 替換的欄位 path」列成 list `[['stem'], ['code_block'], ['expected_answer'], ['matrix_data','deep'], ['extra_classes','deep'], ['explanation.correct'], ['explanation.hook'], ['explanation.wrong','keys+vals'], ['options[].text'], ['trace_steps[].ask'], ['trace_steps[].options[].text','trap_type']]`,迴圈套用
- 現 ~50 行可簡化至 ~20 行
- **注意**:此檔對應 CLAUDE.md 案例 8(critical 教訓),改動要連動 `audit-render.js` 驗 placeholder 殘留 — 但減複雜性可降低未來漏 path 的機率(目前每加一個新 placeholder 欄位都得手動加 branch)

### S2. `_setExamMode` 內 button style 反覆設成空字串
- `src/index.html:1509-1528`(20 行)
- inactive 分支寫 4 行 `btn.style.X = '';`
- 建議:用兩組 class `is-exam-mode` / 預設值,toggle class;style 全寫 CSS。可從 20 行 → 6 行
- 額外好處:符合「CSS 是 frontend-design 的事」分離

### S3. `resetAll` 內 19 個 hardcoded storage key 列表 + 動態 sm2_* 掃描
- `src/index.html:2186-2220`(35 行 + 大段註解)
- 同樣的 19 個 key 名稱在 `ProgressIO.ALLOWED_KEYS_EXACT` (2472-2479) 也列了一份;**兩份 list 必須手動同步**(否則 export 涵蓋 ≠ reset 涵蓋)
- 建議:讓 `resetAll` 直接讀 `ProgressIO.ALLOWED_KEYS_EXACT` + `ALLOWED_KEY_PREFIXES_DYNAMIC` 動態掃 localStorage,刪除手寫 list
- 可刪 ~15 行 + 消除 single-source-of-truth 違反(對應 CLAUDE.md 鐵律 #7 精神)

---

## 不必要抽象

### A1. `_drillEsc` 與 `esc` inline lambda 用 `ErrorReports._esc` fallback ladder
- `src/index.html:2007`、`src/index.html:2107`
- 寫法:`(s) => ErrorReports && ErrorReports._esc ? ErrorReports._esc(s) : String(s||'').replace(...)`
- 兩處都先檢查 ErrorReports 存在然後 fallback inline — `ErrorReports` 是 index.html 內**確定先宣告**(行 1179)的 const,fallback 永遠不會走到
- 建議:刪 fallback,直接 `const esc = ErrorReports._esc;`(若延伸建議 R1 的 `escHTML` helper,直接用 `escHTML`)
- 收益:消除 violates 「不為假想未來抽象」(CLAUDE.md §7)的防禦性碼

### A2. `_loadFontScale` 三行 wrapper
- `src/modes/mode7.js:701-705`
- 內容只是 `Storage.get(FONT_SCALE_KEY, null)` + validate + default 'L'
- 不算過度抽象,但合 `_saveFontScale`(D4)一起評估若都只用 1 處 inline 即可

---

## 預估收益

| 類別 | 數量 | 估計可刪行數 |
|:--|:-:|:-:|
| 重複 code | 7 | ~98 行 |
| Dead code | 4 | ~36 行 |
| 過度複雜 | 3 | ~37 行(原 ~95 行 → 縮至 ~58 行)|
| 不必要抽象 | 2 | ~6 行 |
| **總計** | **16 findings** | **~177 行** |

**最高優先級(收益 vs 風險最佳)**:
1. **R7 `commitAnswer` helper** — 不只是減 24 行,是 CLAUDE.md 案例 10 根因預防(漏抄共用層更新)
2. **R2 `highlightCode` 統一** — 刪 2 份 dead 複製,純淨;mode2/mode8 已示範可行
3. **D1 Mode4 placeholder 收成 1 行** — 純 dead,風險極低
4. **R1 `escHTML` 統一** — 解決 mode4:275 / mode7:1501 殘缺版本一致性問題

**動之前必跑**(CLAUDE.md §9):
- 動 mode*.js 計分路徑 → `audit-mode-flow.js` + 對應 `audit-tests/`
- 動 index.html 共用層(R1 / S1 / S3)→ 全套 audit + §8 強制 code-review subagent
- R7(`commitAnswer`)動到 user-facing 計分 → 必派 code-review subagent dataflow trace
