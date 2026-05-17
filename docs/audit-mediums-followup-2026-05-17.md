# Audit MEDIUMs Follow-up Record — 2026-05-17

> **範圍**:案例 10(lineup-key 根因)修補完成後,對 `src/modes/mode7.js` 做的深度審查所列 6 個 MEDIUM finding 的後續處置。
> **結果**:F-001 / F-005 / F-007 修補完成並合併;F-002 / F-003 / F-004 拒收;F-006 撤銷。
> **相關 PR**:#31(F-001 + F-005)、#32(F-007 + F-006 撤銷)
> **commit on main**:`8309330`(#31)、`d9f9792`(#32)

---

## 一、6 個 MEDIUM finding 處置總覽

| ID | 標題 | 處置 | 理由 / 證據 |
|:-:|:--|:--|:--|
| **F-001** | `submitSetup()` 呼叫不存在的 `this.setup()` | ✅ 修補 (PR #31) | 驗證失敗路徑直接 throw TypeError 卡死,使用者無錯誤回饋 |
| F-002 | renderQuestion shuffle 副作用建議深拷貝 | ❌ 拒收 | `_rendered` cache 已避開重複 render,無實際 bug;改動會破壞 quiz mode 既有預期 |
| F-003 | Storage.get 失敗的 try/catch 建議 | ❌ 拒收 | `Storage.get` 已有預設 fallback;再加 try/catch 是過度防禦,違反 CLAUDE.md「不為不會發生的情境加防禦」 |
| F-004 | 抽出 `_pickFromPool` helper | ❌ 拒收 | 三處共用碼 < 10 行,抽 helper = 過早抽象;違反 CLAUDE.md「三行重複勝過過早抽象」 |
| **F-005** | `_renderResultSlide` aria-label 模板未 `_esc` 包覆 | ✅ 修補 (PR #31) | 防禦性加固;雖目前來源是 server-side number,案例 10 教訓:user-facing 字串一律 `_esc` |
| F-006 | `cleanup()` vs `_clearAllTimers()` 雙清理路徑 | 🟡 撤銷 | **審查時誤判**。`_clearAllTimers()` 不存在於 mode7.js;`cleanup()` / `_finalize()` 是刻意分工(state 保留時機不同) |
| **F-007** | history rolling cap = 50 太高 | ✅ 修補 (PR #32) | PR #21 加 fullLog 後實測 ~50KB/場,50 場 = 2.5MB,逼近 5MB localStorage quota |

> 命中率:6 個 MEDIUM 中 **3 個真實 bug + 1 個誤判**,審查信號雜訊比約 50%。事後總結:F-002 / F-003 / F-004 屬於「stylistic suggestion」,不該列在 MEDIUM 級。

---

## 二、F-001:`submitSetup` → `this.setup()` 不存在(critical UX bug)

### 觸發路徑

```text
使用者開 setup 表單 → 改 N=NaN / 各科總和 ≠ N / 出題不足
→ 點「開始模考」按鈕
→ submitSetup() 驗證失敗 → this.setup()  ← TypeError, this.setup is not a function
→ 整個 JS 流程卡死,使用者收不到任何錯誤提示
```

### 根因

整個 `Mode7` object 只有 `renderSetup()`(line ~890),沒有 `setup()`。歷史上應該是命名重構漏改一處。

### 修補

```diff
- if (!validateConfig(config)) {
-   this.setup();
-   return;
- }
+ if (!validateConfig(config)) {
+   this.renderSetup();
+   return;
+ }
```

### 加固

新增兩支 audit test:

1. **`audit-tests/mode5-8/mode7/01-method-references-exist.test.js`**
   靜態掃描 mode7.js 內所有 `this.xxx()` / `Mode.xxx()` call site,反查整檔 method 表,有缺即 fail。
   防止未來再發生「打字機誤把 method name 弄錯」沒人發現。

2. **`audit-tests/mode5-8/mode7/02-submitSetup-validation-paths.test.js`**
   mock 三條驗證失敗路徑(NaN / 加總≠N / 出題不足),assert 三條都正確走回 `renderSetup`(而非 throw)。

---

## 三、F-005:`_renderResultSlide` aria-label 防禦性加固

### Code

```diff
- aria-label="正確率 ${result.accuracyPct}%"
+ aria-label="正確率 ${_esc(String(result.accuracyPct))}%"
```

### 為什麼做

雖然 `result.accuracyPct` 來源是 `_computeResult()` 自算的 number,目前不可能含 XSS payload。但案例 10 教訓「**既存程式碼不可信**」適用於此:

- 若日後 `accuracyPct` 改成從 server / localStorage 讀,沒 `_esc` 就 XSS
- 加 `_esc(String(n))` 成本 = 0(number → string 不會錯)
- 跟整檔其他所有 user-facing 字串模板一致(全用 `_esc`)

### 不做的事

審查另提到 `.textContent =` 賦值的地方不需要 `_esc`(textContent 本身就會 escape)— 那部分維持原樣。

---

## 四、F-007:模考 history rolling cap 50 → 10(silent data loss 防護)

### 根因 timeline

| Phase | 時點 | history entry 大小 | 50 場容量 |
|:-:|:--|:-:|:-:|
| Phase A | PR #21 之前 | ~3KB(只存 qid + topWrong) | 150KB ✅ |
| Phase B | PR #21 ~ 案例 10 修補完成 | **~50KB**(加 fullLog 含 stem / code_block / options.text × 60 題) | **2.5MB** ⚠️ |

PR #21 為了支援案例 10 修補後的「逐題回顧紅框」UI,在每場 history entry 加上 fullLog snapshot(因為原本 `lineup.q.options` 沒 key,snapshot 是讓回顧頁有「答題當下的 keys 對應」唯一資料源)。

但 `_saveHistory()` 的 rolling cap 還停在 PR #21 之前的 50,**且原註解寫的「3KB/場」也是 PR #21 前的估算**。

### 風險

瀏覽器 localStorage quota = 5MB(per origin)。其他 Storage key 也吃 quota:
- `ipas_progress_v1`(Player / Mastery / Wrongbook / Progress / SeenCorrect / SM2):~500KB-1MB(累積)
- `ipas_mode4_session_v1` / `ipas_mode5_session_v1` 等 mode 場內快取:~50KB
- `ipas_mode7_theater_v1`(本案):cap 50 × 50KB = **2.5MB**

加總接近 4MB,**任何一場新模考觸頂時 Storage.set 會丟 `QuotaExceededError`**,且本檔 `Storage.set` 沒包 try/catch → 最新一場模考紀錄會 silent 寫不進去。

### 修補

```diff
- // 保留最近 50 場(每場 60 題 × ~50B ≈ 3KB,50 場 ≈ 150KB,localStorage 容量無虞)
- if (data.history.length > 50) data.history = data.history.slice(-50);
+ // 2026-05-17 F-007:rolling cap 50 → 10。原註 3KB/場 是 fullLog 加入前的舊估算;
+ // PR #21 加 fullLog(stem + code_block + options.text × 60 題)後實測 ~50KB/場,
+ // 50 場可達 2.5MB,逼近 5MB localStorage 容量上限。降到 N=10 ≈ 500KB,留足安全餘裕。
+ if (data.history.length > 10) data.history = data.history.slice(-10);
```

10 場 ≈ 500KB,加上其他 key 約 1.5MB 總量,留 3.5MB 餘裕。

### 加固

更新既有 `13-saveHistory-fullLog-snapshot.test.js` 第 6 個 block:

1. 原 assert `data.history.length === 50` 改 `=== 10`
2. **新增** 一條 assertion 明確驗證 `slice(-10)` 保留**最新** 10 場(非最舊):
   ```js
   const oldestTs = data.history[0].ts;
   A.ok(oldestTs >= 11, `slice(-10) keeps latest entries (oldest ts=${oldestTs}, expected ≥ 11)`);
   ```

### 後續可考慮(本案不做)

- 加 UI 讓使用者主動把重要場次「釘住」不被 rolling 淘汰
- `Storage.set` 統一包 try/catch + 觸頂時提示使用者(目前已在 PR #30 處理部分壞紀錄場景)

---

## 五、F-006 撤銷紀錄

### 我審查報告原文(錯誤)

> `cleanup()` and `_clearAllTimers()` both exist with overlapping responsibilities — should be unified.

### 實際 grep 證據

```text
$ grep -n "_clearAllTimers\|cleanup\s*(\|_finalize" src/modes/mode7.js
1534:  _finalize(reason) {
2314:  cleanup() {
```

- `_clearAllTimers` **不存在於 mode7.js**(mode1 / mode2 / mode5 / mode8 各有自己的,跟本案無關)
- 真正並存的是 `cleanup()` 和 `_finalize(reason)`,**刻意分工**:
  - `_finalize` = 答題結束進結算頁,**state 必須保留**讓結算頁渲染
  - `cleanup` = 離開 Mode 7 完整 teardown,`state = null`
- 兩者只重疊頭兩行 `_stopTimer() + _restorePlayEngine()`,合一會把 state 提早清掉 → 結算頁壞

### 教訓

- 審查時不能只記函式名 + 印象,要 grep 證據
- 把 F-006 列 MEDIUM 是審查的偽陽性。**事後信號雜訊比應該揭露在 PR body**,不是私下塞掉

---

## 六、F-002 / F-003 / F-004 拒收紀錄

### F-002:renderQuestion shuffle 副作用 → 建議深拷貝

**審查論點**:`renderQuestion(q, opts)` 會 `q.options = shuffled(q.options)`,污染原 q 物件。

**為何拒收**:
- 案例 10 修補時已用 `item._rendered` cache,renderQuestion 第二次起跳過洗牌
- quiz mode 預期就是「同一題只 render 一次,後續用 cache」
- 改深拷貝會破壞這個契約,效能也下降

### F-003:Storage.get 失敗的 try/catch

**審查論點**:`Storage.get(KEY, fallback)` 內部已 catch,但 caller 也該再 catch 防 JSON parse 異常。

**為何拒收**:
- `Storage.get` 已經 catch JSON.parse + 回 fallback(`src/index.html:Storage` 定義)
- caller 再 catch = 過度防禦
- 違反 CLAUDE.md「不為不會發生的情境加防禦」

### F-004:抽 `_pickFromPool` helper

**審查論點**:三處(_startBattle / _replenishPool / _generateLineup)都有「從 pool 抽 N 題 + 取補集」邏輯,可抽 helper。

**為何拒收**:
- 三處的「補集邏輯」實際不同(一處按 KC 平衡,一處按難度,一處純隨機)
- 強行統一 helper 會多出 if/else 分支,反而更複雜
- 違反 CLAUDE.md「不為假想未來需求設計;三行類似程式碼勝過過早抽象」

---

## 七、整體驗證

### 兩個 PR 合併前的最終驗證

```text
node --check src/modes/mode7.js                                        → OK
node scripts/audit-tests/mode5-8/mode7/01-method-references-exist      → PASS (新)
node scripts/audit-tests/mode5-8/mode7/02-submitSetup-validation       → PASS (新)
node scripts/audit-tests/mode5-8/mode7/13-saveHistory-fullLog-snapshot → 35/35 PASS(改 cap=10 + 新增 latest assertion)
node scripts/audit-render.js                                           → 0 violations / 363 cases
node scripts/audit-source-fidelity.js                                  → 100.0% / 652 entries
node scripts/audit-option-length.js                                    → 0 flagged
node scripts/audit-mode-flow.js                                        → 13/13 PASS
```

### 鐵律對照

- 鐵律 #1(錯題下鑽):未動,DrillSession.start callback 路徑不變
- 鐵律 #4(選項長度均衡):未動
- 鐵律 #5(來源忠實性):未動
- 鐵律 #6(科目隔離性):兩 PR 都只動 mode7.js 共用層 + audit-tests,屬 additive,合規

### 案例 10 根因不受影響

- `_rendered` cache 機制完整保留
- `_getRenderedQ(item)` helper 未改
- 9 處 `lineup.q.options.find(...)` callsite 已全改 `item._rendered.options`,本兩 PR 不動

---

## 八、新增教訓(將同步進 CLAUDE.md §5 案例 11)

### 案例 11:fullLog snapshot 加入後 history rolling cap 沒同步更新(silent data loss risk)

- **症狀(尚未在 prod 觀察到,F-007 是 proactive 修補)**:重度使用者跑 50 場模考後,新模考紀錄 silent 寫不進 localStorage
- **根因**:PR #21 為支援案例 10 後的逐題回顧加 fullLog snapshot,每場 entry 從 ~3KB 暴增到 ~50KB,但同檔 `_saveHistory` 的 rolling cap = 50 沒同步檢討;原註解寫的「3KB/場」估算也沒更新
- **教訓**:
  1. **改 Storage 寫入 shape 時必同步檢討 cap / quota 計算**(本案漏這一步漏了 14 個 PR)
  2. **註解寫的容量估算 = 寫入當下的快照,改 shape 時必同步更新註解**
  3. **`Storage.set` 在 quota-critical 路徑應有 try/catch + 使用者提示**(本案不做,留待後續)
  4. **PR review checklist 應加入「本 PR 是否改變 localStorage 任一 key 的 entry size?若是,rolling cap / quota 估算是否同步檢討?」**

### 審查報告本身的偽陽性檢討

本次 6 MEDIUMs 命中率 50%(3 真 + 1 撤銷 + 2 stylistic suggestion 拒收)。改進方向:

- 審查時對「重構建議型」finding 應明確分級為 `nit`(stylistic)而非 `MEDIUM`(real risk)
- 對「兩個函式有共同邏輯應合一」這類聲明,**必須先 grep 證明兩個函式都存在**(F-006 失敗點)
- 對「應該加 try/catch」這類聲明,**必須先 trace 既有錯誤處理路徑**(F-003 失敗點)

---

## 修訂歷史

| 版次 | 日期 | 重點 |
|:--|:-:|:--|
| v1 | 2026-05-17 | 首版 — 紀錄 #31 + #32 兩 PR 的 6 MEDIUM finding 處置全貌 |
