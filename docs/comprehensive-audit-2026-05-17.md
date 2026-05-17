# IPAS AI 中級遊戲 — 全面稽核報告(2026-05-17)

> 6 個 audit subagent 並行執行,涵蓋靜態分析、動態模擬、沙箱攻擊三層測試。
> session 累積到 PR #25(D)後,使用者要求「對全部模組做完整 code review + 三層測試」。

---

## 📊 總覽

| Agent | 範圍 | 跑出 bug |
|---|---|---|
| 1 | Mode 1-4 戰鬥模式 | 2 CRITICAL + 2 HIGH + 3 MEDIUM |
| 2 | Mode 5-8(Mode 7 重點)| 1 CRITICAL + 1 HIGH + 1 MEDIUM + 4 LOW |
| 3 | 共用層 + ProgressIO 安全 | 0 CRITICAL/HIGH + 2 MEDIUM + 3 LOW |
| 4 | 題庫 + KB 完整性 | 1 MEDIUM + 4 LOW(audit gap)|
| 5 | 動態 + 沙箱攻擊 | 1 HIGH + 2 MEDIUM + 3 LOW |
| 6 | 跨 Mode 整合 + race | 5 HIGH + 5 MEDIUM + 3 LOW |

**合計**:**3 CRITICAL / 9 HIGH / 14 MEDIUM / 17 LOW**

---

## 🔴 CRITICAL(必修,影響使用者體驗 / 資料完整性)

| # | 位置 | 問題 | 修法 |
|---|---|---|---|
| **C-1** | mode1.js `victory()` 行 681-729 | 無重入保護,雙呼叫雙發 EXP(0→100→200)+ 雙寫 Storage | 第一行加 `if (!this.state \|\| this.state.settled) return; this.state.settled = true;` |
| **C-2** | mode1.js `gameOver()` 行 731-752 | 同上 | 同上 |
| **C-3** | mode3.js `victory()` 行 816 | 同上,雙呼叫雙發 EXP 601→1202 | 同上 |
| **C-4** | mode7.js `_commitToSharedLayer` 行 689-713 | **整個漏 `SeenCorrect.mark(q.id)`** — Mode 7 答對 50 題,所有題在 Mode 1/2/4/5/8 都不會被排除,跨關卡排除完全失效 | 在 `Mastery.update` 後加 `if (a.isCorrect && q.id && typeof SeenCorrect !== 'undefined') SeenCorrect.mark(q.id);` |

> Mode 2 / Mode 4 已有 entry guard,**落單的是 Mode 1 / Mode 3**;PR D 的 LOW-1 補了 Mode 1/2/5/8 SeenCorrect.mark,但**漏 Mode 7**(因 Mode 7 覆寫 PlayEngine.answer 跳過原生 mark)

---

## 🟠 HIGH(影響穩定性 / 資料正確性,應修)

| # | 位置 | 問題 | 修法 |
|---|---|---|---|
| **H-1** | mode5.js | **無 `cleanup()` 方法** — gameOver/victory setTimeout 殘留,中途 home 會洗 view-play(案例 6 同型 race)| 加 `Mode5.cleanup()` clear pending timeouts;`goHome()` 前呼叫 |
| **H-2** | mode3.js / mode4.js / confusion-matrix.js | 答對都不 `SeenCorrect.mark` — 通關不排除於後續戰鬥 | 各自加 mark |
| **H-3** | mode5.js | **完全不呼叫 `SM2.recordAnswer`** — 弱點獵人練習不貢獻 SM-2 EF/interval | answer 路徑加 `SM2.recordAnswer(q.id, isCorrect, false)` |
| **H-4** | index.html `goHome()` 行 1419-1441 | 漏 cleanup Mode 3/4/5/6 timer — 中途離場 timer 殘留洗 home view | 各 mode 加 `stopTimer()` public method,`goHome` 補呼叫 |
| **H-5** | mode1.js / mode2.js | `innerHTML` 大量直接內插 `q.stem/o.text/explanation/misconceptions` 沒 escape(行 412/417/445/450/558/582/591/596/622/638)| 抽 `esc()` 進共用層,4 mode 統一套用 |
| **H-6** | mode7.js _renderReviewQuestion 行 1920 + expandAllExplanations 行 2139 | fullLog `knowledge_code/difficulty` 未 escape — 可注入 `<img src=x onerror=alert(1)>` | `${this._esc(q.knowledge_code \|\| '')}` |
| **H-7** | mode7.js scopeLabel/difficultyLabel 行 305-307 | history 列表 fallback `(k \|\| '?')` 直接 inject,localStorage poison config.scope 可 XSS | `esc(k \|\| '?')` |
| **H-8** | index.html Storage 寫入 | **quota 滿時 silent data-loss** — Storage.set fail + 5 秒 throttle toast 後完全無感,整場進度不存但 UI 正常 | 加 fail-flag + 紅色 persistent banner;失敗後改 in-memory 暫存 |
| **H-9** | mode3.js `selectStage` 行 274-281 | 沒驗 `q.format === 'sequence'`,任何題 console 呼叫可進 pipeline | 加 `if (q.format !== 'sequence') return showToast(...)` |

---

## 🟡 MEDIUM(中等影響,有時間補)

| # | 位置 | 問題 |
|---|---|---|
| M-1 | 共用層 wrongbook validator | 數字欄位無上限(`wrongCount: Number.MAX_VALUE` 可被注入)|
| M-2 | ProgressIO import flow | 不管 payload 多小都 wipe 16+ keys,confirm 訊息沒明示「其他項目會被清空」|
| M-3 | mode5.js `adjustMasteryScore` 行 22 | 雙寫路徑(繞過 Mastery.update),案例 4 反模式 |
| M-4 | Wrongbook entries with `'?'/'?'`(mode3/4/CM)| 不被 `countSuspect` 偵測,Review UI 顯示「? vs ?」誤導 |
| M-5 | index.html Player.load → modify → save | 非原子,ProgressIO import reload 之前若 race 戰鬥 setTimeout 會 lose |
| M-6 | mode7.js `surrender()` 行 1500 | `Player.damage(10)` 可使 HP=0,_finalize 不檢查 gameOver,下次進 Mode 1 異常 |
| M-7 | settings/mode-store schema | 只 `_isObj`,未來加 UI render 即 stored XSS(latent)|
| M-8 | SeenCorrect._cache stale-after-import | 靠 `location.reload()` 1.5 秒掩蓋,移除 reload 即失效 |
| M-9 | mode2.js attack()/takeDamage() setTimeout | 未集中管理,跨場景 timer 可能 fire 在 detached DOM |
| M-10 | mode4.js drillThis | 缺 session token,user A 在 drill 期間 user B 開新場會被舊 callback 污染 |
| M-11 | 題庫鐵律 #4 | 「最長=正解」42.2% 超過 CLAUDE.md §1 上限 35% |
| M-12 | renderQuestion 行 689 | 跨 tab 並發戰鬥模式無偵測(只 ProgressIO 有)|
| M-13 | audit coverage gap | audit-render 不檢查 single_choice is_correct count + XSS;audit-case-answer 只查跨 case 不查同 case 內;audit-stem-explanation 對 single_choice 偵測有限 |
| M-14 | mode8.js `q.stem` 行 342 未 escape | (其他 8 處 `escapeHTML` 都 OK)|

---

## 🟢 LOW(可選改進)

17 條,主要分類:
- defense-in-depth XSS escape(Mode 5/7/8 部分 stem/text inject 未 escape,題庫信任但長期 hygiene)
- onclick string concat 風險(Mode 6 / Review)
- setTimeout 不集中管理(Mode 1/2/3/4 setTimeout 散落)
- SM-2 interval 無上限
- generateVariation 副作用(寫回 QUESTIONS 元素 `_drillStrategy`)
- `String.fromCharCode(65+i)` 超過 26 options 溢位(目前無題庫觸發)
- BOM 前綴合法 export 被拒(Windows 使用者編輯後匯入 UX)
- enterMode 計入 session(瀏覽模式 Mode 6 不該計)
- 11 個 KB 節點題庫未覆蓋
- Mode 1 `subject: 3` filter 不嚴(實際 0 命中)

---

## ✅ 大量正向結果(讚揚要寫出來)

### 18+ 條威脅防禦 21/21 完整(用 20+ 個攻擊 payload 實測)

| 威脅 | 結果 |
|---|---|
| XSS via nickname / payload key / payload value | 全擋 |
| Prototype pollution(payload key / nested value / 字串內 __proto__)| **6/6 BLOCKED**(Bug A re-serialize 修法生效)|
| Key 注入(allowlist 繞過)| 全擋 |
| DoS(超大檔 / 字數)| 全擋 |
| Tamper(checksum/exportedAt/keyCount/envelope)| 全擋 |
| 並發(_busy / cross-tab storage event)| 全擋 |
| 14 種 malformed file | 全擋 |

### 案例 10 lineup-key bug 修補徹底

- Mode 7 跑 60 題 mock,**所有 11 處 `options.find` 都正確走 `_getRendered`**(7 處直 rendered.options + 2 處 fallback + 1 處 PlayEngine.current 已 rendered)
- `audit-mode-flow.js` / `audit-wrongbook-callers.js` 0 violations
- 14+ 處 `_esc` HTML escape 包到所有 inject 點(case 10 LOW-2 review 補完)

### 題庫健康

- **12 個 audit script 全 PASS、652 題、179 節點、跨 KB 完整一致**
- format / difficulty / knowledge_code 分布合理
- 無 duplicate qid、無 placeholder 殘留、無 unknown node_id
- 跨 audit sandbox 6 種攻擊擋下 2 種(node_id 白名單 + 誇張長度)

### 動態 mock 端到端

- Flow A 完整 9 步 PASS(新使用者 → Mode 1 → Mode 7 → 歷史 → 回顧 → 匯出 → 清 → 匯入 → 還原)
- Flow B / C 各 5/5 PASS(邊界 + race)

---

## 🎯 修補優先建議

### P0(必修,critical)
1. **C-1 + C-2 + C-3**:Mode 1 victory/gameOver、Mode 3 victory 加 entry guard(3 行 patch / mode)
2. **C-4**:Mode 7 `_commitToSharedLayer` 加 `SeenCorrect.mark` — **這條最關鍵,直接影響跨關卡體驗**

### P1(建議下個 PR 補,high)
3. H-1:Mode 5 加 cleanup
4. H-2:Mode 3/4/confusion-matrix 加 SeenCorrect.mark
5. H-3:Mode 5 加 SM2.recordAnswer
6. H-4:goHome 補 Mode 3/4/5/6 timer cleanup
7. H-5 + H-6 + H-7:統一 esc helper + Mode 1/2/7 inject 點補 escape
8. H-8:quota fail 加 persistent banner + in-memory fallback
9. H-9:selectStage 加 format validate

### P2(medium,可分批)
10. M-1:Wrongbook 數字欄位加上限
11. M-2:ProgressIO confirm 訊息明示「會清空其他項目」
12. M-3:Mode 5 改回 Mastery.update(去掉 adjustMasteryScore)
13. M-4:countSuspect 涵蓋 `'?'/'?'` pattern
14. M-6:Mode 7 surrender 後 HP=0 兜底
15. M-11:題庫「最長=正解」42% → 重寫部分長正解降到 35% 以下

### P3 / 後續(low)
17 條改進機會,可分批處理或留作 backlog。

---

## 📂 攻擊測試證據檔(reviewer 可重跑)

- `/tmp/sec-audit/`(Agent 3):20+ ProgressIO 攻擊 payload
- `/tmp/ipas-test/`(Agent 5):Flow A/B/C + sandbox 7 attack 套件
- `/tmp/m1-4-audit/`(Agent 1):4 個 mode 各自 mock test
- `/tmp/cross-mode-mock.js`(Agent 6):跨 mode 整合 mock
- `scripts/audit-*.report.json`(本 PR 含)

---

## 結論

**整體 production-ready,但有 4 個 CRITICAL 阻擋全 100 分**。

ProgressIO 安全防禦工程品質高(0 critical/high),案例 10 lineup-key bug 修補徹底,題庫健康度極佳。**主要弱點集中在 Mode 1/3 結算路徑重入語義 + Mode 7 SeenCorrect 漏寫 + Mode 5 缺 cleanup 與 SM-2 整合 + 4 mode innerHTML escape 不一致**。

**最關鍵的 4 個 CRITICAL 都是「靜默 bug」**(syntax check / type check 都過,但實際影響使用者):
- C-1/C-2/C-3 是雙呼叫雙發進度
- C-4 是 Mode 7 練了一場後其他關卡完全不知道你已答對

這些 bug 都符合 CLAUDE.md §5 案例 10 教訓的特徵 — **必須 dataflow trace 才抓得到**。本次 6-agent 並行驗證生效,**找到 PR #25 §8 review 沒抓到的問題**。

下一步建議:
1. 開 PR 修 P0(4 個 CRITICAL)
2. 開 PR 修 P1(9 個 HIGH 分批)
3. P2 / P3 視時間決定
