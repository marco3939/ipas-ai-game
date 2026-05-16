# IPAS AI 遊戲專案 — Memory(踩雷史 + 制度修法)

> 用途:記錄 critical bug timeline、根因、subagent 使用模式、制度演進。
> 與 CLAUDE.md 分工:CLAUDE.md 是「規則」(必須遵守),本檔是「歷史」(怎麼踩雷學到的)。
> 任何新 critical bug 解完都要回來補一條,讓未來 session 不重蹈。

---

## 2026-05-16 Mode 7 lineup.q.options 無 key — 13 PR 才清完的 critical bug

### 時間軸

| 日期 | PR | 改動 | bug 狀態 |
|---|---|---|---|
| 2026-05-?? | #5 | 加 submit-lock 機制(`submitCurrent` / `submitMock`) | 🔴 引入 bug:用 `lineup.q.options.find(o.key === userKey)`,但原版 q 無 key — 沉默 |
| 2026-05-16 | #11 | 結算後加逐題回顧 walkthrough(`_renderReviewQuestion`) | 🔴 同根因擴散到 review path |
| 2026-05-16 | #12 | 考古題首頁加最近 10 場歷史 + 完整逐題回顧 | 🔴 fullLog 用 lineup.q.options 抓 snapshot — keys 全 undefined |
| 2026-05-16 | #16 | 顯示「你選 vs 正解」對照(原本想修紅框失效) | 🔴 修了像沒修 — fullLog snapshot 內 keys 仍 undefined |
| 2026-05-16 | #17 | 舊歷史紀錄加警告 banner | 🟡 釐清「舊資料無法救」(實際上連新資料都壞) |
| 2026-05-16 | #18 | 送出鎖定後立即顯示對錯 + 正解 | 🔴 終於曝光「正解:undefined」字面 — 使用者截圖回報 |
| 2026-05-16 | #19 | hotfix:加 `item._rendered` cache + 4 處消費端改用 | 🟡 修對 4 處,**漏 4 處**(submitMock / _renderReviewQuestion / expandAllExplanations / toggleWrongbookFromReview) |
| 待修 | #20 | 5 個 review subagent 抓出 18+ bug,完整補修 | 🔵 規劃中 |

### 根因(技術層)

`renderQuestion`(index.html:685-689):
```js
if (rendered.shuffle_options !== false) {
  rendered.options = RNG.shuffle(rendered.options);
}
rendered.options = rendered.options.map((o, i) => ({...o, key: String.fromCharCode(65+i)}));
```

**洗牌後才指派 A/B/C/D**,所以原版 QUESTIONS 的 options **沒有 `key` 欄位**。

但 `state.lineup[i].q` 直接持有原版引用,Mode 7 內 9 處用 `lineup.q.options.find(o => o.key === userKey)`:
- submitCurrent(L1390)
- submitMock(L1098-1110,**autoLockDrafts 段**)
- _renderLockedFeedback(L1359)
- _commitToSharedLayer(L670-687)
- _saveHistory fullLog snapshot(L1550-1572)
- _renderReviewQuestion in-session(L1775+1791+1806)
- expandAllExplanations(L2058-2105)
- toggleWrongbookFromReview in-session(L2014-2017)
- _timeUp(沒升格 draft → 與 submitMock 不一致)

**全部找不到 key → isCorrect 永遠 false / correctKey 永遠 undefined or ''**。

### 為何 13 個 PR 都沒抓到(根因背後的根因)

1. **PR #5 引入時 _renderLockedFeedback 是中性的**(只說「結算後可看對錯」)→ bug 沉默 N 個月
2. **`node --check` 只驗 syntax 不驗 dataflow** → 全部 PR 都「驗證 PASS」
3. **修使用者報的 bug 時沒跨檔 grep 同根因**(PR #16/#17 修的是表面 UI,沒查 fullLog 上游也壞)
4. **連續 13 PR 動同一檔沒做 regression review**
5. **PR 描述的「驗證點」清單我沒實際執行**(只是 markdown 寫一寫)
6. **subagent 心智模型錯**:把 subagent 當「內容生產工具」(寫題目),沒當「code review 工具」
7. **既存 PR #5 程式碼被信任**:做 PR #16/#18 時沒 dataflow trace `lineup.q.options[*].key` 是不是真存在

### 污染影響評估

bug 期間使用者答對的 Mode 7 題,被誤記為答錯:

| Store | 污染樣態 | 可逆? |
|---|---|---|
| Wrongbook | 答對的題被加 entry(`correctChoice:''`、`isCorrect 隱含 false`) | 部分可(掃描 `correctChoice === '' && correctText === ''` 清理)|
| Mastery | `attempts++` 已不可逆;`correct` 該 +1 沒 +1;`streak` 重置;`score` -5 而非 +10 | **不可逆** |
| Progress.totalCorrect | 該 +1 沒 +1 | **不可逆** |
| SM2 | repetition reset、interval=1、ef -0.2 | 不可逆 |
| SeenCorrect | Mode 7 設計上不 mark,無影響 | n/a |

**修復建議**:加 `Wrongbook.cleanupSuspect()` + 首頁警示;Mastery/Progress/SM2 建議「匯出 → reset → 重來」。

---

## 制度演進(本案後加的規則,落地進 CLAUDE.md §8 + system prompt)

### A. 共用層 / user-facing 改動 必派 code-review subagent

觸發條件:
- 改 src/index.html 共用模組(Storage/PlayEngine/Wrongbook/...)
- 改 src/modes/modeN.js 的 submit/answer/lock/state mutation/commit 路徑
- 連續 3+ PR 動同一檔
- 修使用者回報的 bug

必做 4 項(至少 2 項):
1. Dataflow trace
2. Cross-file caller 一致性
3. 邊界 case + 反例
4. 同根因模式 grep

### B. 不可信 validation 清單

- ❌ `node --check` syntax 為唯一 validation
- ❌ PR 描述「驗證點」markdown(若我自己沒實際執行)
- ❌ 「應該沒問題」/「邏輯看起來對」

### C. 修 user-reported bug 必跨檔 grep 同根因

修一處後 grep 整 codebase:
- 同 pattern(本案:`q\.options.*find`)出現幾處?
- 全部都修了?
- 加 audit script 防 regression

### D. 新加 audit scripts(待寫)

- `scripts/audit-mode-flow.js` — mock 一場 Mode 7 流程,驗 isCorrect/correctKey 在所有 commit point 非空
- `scripts/audit-wrongbook-callers.js` — 跨 codebase grep `Wrongbook.add(`,驗 6 個參數簽名都正確

### E. Subagent 心智模型修正

舊認知:subagent = 內容生產工具(寫題、改檔)
新認知:subagent **同樣** 是 code review 工具

**新規則**:任何 PR merge 前,若觸發 §A 條件,**必派至少 1 個 code-review subagent** 才能 merge。

---

## 其他歷史踩雷(摘要)

詳見 CLAUDE.md §5 案例 1-10。

| 案例 | 一句話 |
|---|---|
| 1 | `window.X` 對 `let X` 不掛 window |
| 2 | Sub agent stall ≥20 條 |
| 3 | enterMode 走 const-bound Mode 物件 |
| 4 | 繞過共用層自寫機制不寫下游觀測點 |
| 5 | Stale nodeId 阻 fallback |
| 6 | drillThis vs gameOver setTimeout race |
| 7 | 題庫被刪後 BOSS HP 殘血 |
| 8 | Calculation 題 placeholder 沒替換 |
| 9 | Stale cache as ground truth |
| **10** | **Lineup.q.options 無洗牌後 key — 13 PR 才清完** |

---

## 修訂歷史

| 日期 | 加入 |
|---|---|
| 2026-05-16 | 首次建檔。記 Mode 7 bug timeline 與制度修法 |
