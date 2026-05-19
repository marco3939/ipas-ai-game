# Adversarial Review Report — 2026-05-19

Reviewer: adversarial sweep of `/home/user/ipas-ai-game/src/`(index.html / mode1-8 / sm2)。優先級依「玩家進度受影響程度」排序。

---

## HIGH 風險(critical bug,影響玩家進度 / 計分)

### H1. Mode 7 結算後 `goHome` 不會 cleanup `state`,exam mode 旗標卻已清 → `Mode7.cleanup` 取消歸 null,但 `_lastResultLineup` / state 殘留可被批次回顧 / drillWrong 抓到舊 lineup
- `src/modes/mode7.js:1599-1622`(`_finalize` 設 `_setExamMode(false)` 但保留 `this.state` 為 finished 物件)+ `src/index.html:1552`(`goHome` 呼叫 `Mode7.cleanup`)
- `_finalize` 把 `state.finished = true` 但 state 仍持有 lineup 物件,且 `_setExamMode(false)` 已先清旗標。若使用者結算後不點「回首頁」、改在 view-play 直接點右上「🏠 首頁」(此時旗標 false,不跳 confirm),Mode7.cleanup 才把 state 清 null。但若使用者點結算後的「再來一場」(Mode7.start → cleanup),也同 OK。問題在「結算後 drillWrong → DrillSession.start(... onComplete=goHome)」這條 path:goHome 跑 Mode7.cleanup 清 state,但 DrillSession 已用舊 state.lineup ref 開始,DrillSession 期間若使用者再按一次右上首頁,_setExamMode 已被 DrillSession.next 清(line 1978)旗標 false → 不跳 confirm → 直接斷下鑽。
- 觸發:結算 → 點 Top 5 錯題下鑽 → 進 DrillSession 第 1 題後 → 點右上「🏠 首頁」 → 進度遺失無 confirm。
- 修補方向:DrillSession 進行中(`depth === 0` 且 `total > 0`)永遠保持 exam flag = true,直到 `next()` 真的進 `goHome()` 那一刻才清。或在 `_finalize` 完成後立即 `Mode7.cleanup`(讓結算頁 state=null,避免懸掛引用)。

### H2. `Wrongbook.add` 對 `userChoice`/`correctChoice` 缺存在性校驗,Mode 7 `_commitToSharedLayer` 在 lineup 中找不到 rendered options 時可寫入 `''`,重新引發案例 10 殘留型污染
- `src/modes/mode7.js:781-808`(`_commitToSharedLayer`)+ `src/index.html:1108-1128`(`Wrongbook.add`)
- `_commitToSharedLayer` 用 `renderedQ = this._getRendered(item)`,但 `_getRendered` 對 `!item._rendered && !PlayEngine.current 匹配` 時 fallback 到 `item.q`(原版,無 key)。若使用者「未訪問題目就直接交卷」(全 unanswered,或從 `state.answers[idx]` 雜散填入但對應 item._rendered 未生成),`a.correctKey` 已是 `''`(`_autoLockDrafts` 取 `correctOpt.key` 而 `rOpts` 來自 `_getRendered` 的 fallback 原版,沒 key),Wrongbook 寫入 `correctChoice: ''`。
- 雖然 `_saveHistory` 已預先 `renderQuestion(q)` 補 `item._rendered`(line 1687),但只在 `_saveHistory` 跑;`_commitToSharedLayer` 在 `_saveHistory` 之前呼叫(`_finalize` line 1612 → 1617),Wrongbook 此時就寫入空 key 了。
- 觸發:Mode 7 開戰 → 不點任一題 → time_up → `_autoLockDrafts` 沒事做 → `_commitToSharedLayer` 試圖寫 `s.answers`(空)→ 無寫入,反而沒事。但若「跳到第 30 題 → 選 A 草稿(沒進過第 1-29 題的 `_showCurrentQuestion`)→ 直接交卷」,第 1-29 題 item._rendered 全 undefined,_autoLockDrafts 對第 30 題 OK,但 _commitToSharedLayer 不影響;**真正風險路徑**:`_autoLockDrafts` 對未渲染題的 draft.userKey 也試 `_getRendered(item)` → 拿到原版無 key options → `opt = rOpts.find(o.key === draft.userKey)` 必 undefined → `isCorrect=false`、`correctKey=''` → answers 寫入空 key → commit 寫 Wrongbook 空 key 殘留。
- 修補方向:`_autoLockDrafts` 在 fallback path 主動 `renderQuestion(q)` 補 `item._rendered`(對齊 `_saveHistory` 那段),或 `_getRendered` 永遠保證返回有 key 的 rendered options(內部 fallback 走 renderQuestion 而非 raw q)。

### H3. `DrillSession.next()` PlayEngine.answer wrap 在 finally 還原 `origAnswer`,若使用者點 `PlayEngine.drill` 進入 DrillSession 後又快速點同題的「下鑽變化型」按鈕,wrap 鏈會被覆蓋並還原成「上一層」origAnswer 而非真原生
- `src/index.html:2039-2053`
- `const origAnswer = (PlayEngine.__nativeAnswer || PlayEngine.answer).bind(PlayEngine)` 第一行抓 `PlayEngine.answer`,但若已被某 Mode hook(Mode 6 / Mode 7 殘存)wrap,即使優先用 `__nativeAnswer`,`finally { PlayEngine.answer = origAnswer; }` 還是會把 answer 設成 `origAnswer.bind(PlayEngine)`(已 bind 過的函式)。case 11 註解說「__nativeAnswer 永遠原生」,但 origAnswer 變數已 `.bind(PlayEngine)` 一層;後續若再次 wrap → 再 bind,鏈會變 origAnswer(bind(bind(__nativeAnswer)))。bind 鏈本身不會壞,但若中間有 mode 把 `__nativeAnswer` 也覆蓋(理論不該但實務上 `PlayEngine.__nativeAnswer = PlayEngine.answer` line 1907 在 module load 時跑了一次,之後任何人改 `__nativeAnswer` 都會污染)。
- 觸發:Mode 7 結算後 drillWrong → 進 DrillSession → DrillSession 內 next() 第二題 wrap → 第一題 finally 還原成「第一題 wrap 之前的版本」,即 Mode 7 殘存 hook(若 `_restorePlayEngine` 在 `_finalize` 已跑),OK。但若使用者在進 drill 前未走 `_finalize`(例如時間到走特殊路徑),會有 hook 殘存。
- 修補方向:`finally` 改成 `PlayEngine.answer = PlayEngine.__nativeAnswer || origAnswer`,永遠回到絕對原生。並考慮 `__nativeAnswer` 寫 `Object.defineProperty(... writable: false)` 防覆蓋。

### H4. `Mastery.update` 同時 bump `attempts/correct/streak`,但 Mode 5 `adjustMasteryScore` 與 `skillReinforce`(`attempts:false`)和 `Mastery.drillBonus` 都繞過此 helper,造成「Mode 5 強化記憶 +10 不計 attempts → countMastered 仍認你練過 0 次此節點」
- `src/index.html:985-998`(`Mastery.update`)+ `src/modes/mode5.js:738-756`(`skillReinforce`)+ `src/index.html:1007-1020`(`drillBonus`)
- `countMastered` 判定為「node.correct >= min(3, qPerNode)」(line 1037-1040),但 `drillBonus` 與 `skillReinforce` 都只動 `score`,不動 `correct`。理論上「Mastery score = 100」應該等同熟練,但 countMastered 不看 score。後果:玩家在 Mode 5 用 skillReinforce 把 score 推到 100,但 correct 還是 0(因為玩家答對也走 `adjustMasteryScore`,並非 `Mastery.update`)→ 首頁「已熟練 0/N」永遠 0。
- 觸發:Mode 5 戰鬥用 skillReinforce 5 次推到 100 score → 看首頁仍說「尚無資料」或「0 熟練」。案例 4 的根因再現(只是 mode5 的 adjustMasteryScore 本身有 bump attempts 是好的,但 skillReinforce 走 `{attempts:false}` 跳過,跟 drillBonus 一樣只動 score)。
- 修補方向:countMastered 同時考量 `score >= 80` 條件;或 skillReinforce / drillBonus 即使「不算 attempts」也要 bump `correct`(`+1` 即可)。

### H5. SM-2 `recordAnswer` 對 `qid` 不存在的題目(已從題庫刪除)仍寫入,且 `getDueQueue` 不排除 stale qid → SM2 review 視圖跑空隙
- `src/sm2.js:57-65, 99-104, 162-178`
- `recordAnswer(qid, ...)` 直接寫 `all[qid]`,無 `QUESTIONS.find(...).id === qid` 校驗。題庫一旦移除某 qid(historically q_pa_011/012 被刪),localStorage 仍存舊 SM2 卡片。`getDueQueue` 沒過濾 → enterReview 顯示「題目已刪除」placeholder(line 119-120),`startReviewSession` 也只是 idx++ 跳過(line 164),但統計 `countDueToday` / `countOverdue` 會把 stale qid 計入分母,導致首頁「📅 2 題到期」實際 0 題,玩家點進去發現「無題目可顯示」直接結束。
- 觸發:玩家 SM2 累積 50 題 → 題庫修補刪 2 題 → 首頁顯示「📅 48 題到期」但實際只有 46 題,且 enterReview 的「🎉 今日無待複習題目」永遠不會觸發(因為 queue.length > 0 但全 stale)。
- 修補方向:`getDueQueue` 加 `QUESTIONS.find(qq => qq.id === e[0])` 過濾;`countDueToday` / `countOverdue` 同步用 filter 後 length。`recordAnswer` 寫入前確認 qid 存在。

---

## MEDIUM 風險

### M1. `RNG.set(Date.now())` 在多 mode 在同一毫秒(或下鑽接力)連續呼叫 → 同 seed 同抽題序
- `src/modes/mode1.js:192`(用 `Date.now() + Math.random()*1e5` 強化過)、`mode2.js:211`(只 `Date.now()`)、`mode5.js:177`、`mode6.js:189`、`mode7.js:171`
- Mode 1 已用 `Date.now() + Math.floor(Math.random() * 1e5)` 強化,但 Mode 2/5/6/7 都還是純 `Date.now()`。在 JS event loop 同 tick 進 enterMode(quick switch)兩次,seed 完全一樣 → 抽到一模一樣的題序。Mode 2 selectBoss 沒重設 seed(直接用 start 時設的),連挑同 BOSS 連續兩場可能抽相同 5 題(雖 `RNG.shuffle` 後 slice 應隨機,但同 seed 同結果)。
- 修補方向:統一改 `RNG.set(Date.now() + (performance.now ? Math.floor(performance.now()*1000)%1e5 : Math.random()*1e5))`;Mode 2 `selectBoss` 也補一行 reseed。

### M2. `Mode4` (`src/index.html:2230-2258`) `nextOne` 只渲染 PlayEngine.show 但不 hook answer,共用層 PlayEngine.answer 已寫 Mastery / SM2 / Wrongbook / SeenCorrect → OK,但 `Mode4.queue` / `idx` 與 PlayEngine.onNext 緊耦合;若 DrillSession 在 PlayEngine.answer 之後接 wrap,Mode4.onNext 還是會被叫但 state.idx 已被改
- `src/index.html:2230-2247`
- Mode 4 完全依賴 PlayEngine.onNext 推進 idx,但若使用者答錯後點「立即下鑽變化型」(PlayEngine.drill,line 1884),`DrillSession.start` 沒帶 onComplete → 完成後走 `PlayEngine.onNext`,等於 `Mode4.nextOne()` 接力(line 2246 設定的);這 OK。但若 Mode 4 中途切到別 mode 然後又回,`PlayEngine.onNext = () => this.nextOne()` 還掛著舊 closure 的 `this` 指向 Mode4,this.idx 也舊。
- 觸發:Mode 4 第 3 題答錯下鑽 → DrillSession 中按右上「⚠️ 退出考試」確認退出 → goHome 走 Mode4.stopTimer(line 1560,Mode 4 沒有 stopTimer 方法 → undefined),不 cleanup PlayEngine.onNext。下次進 Mode 7,PlayEngine.onNext 可能仍是舊 Mode 4 closure → Mode 7 結算流程被污染。
- 修補方向:Mode 4 補 `cleanup` 方法清 PlayEngine.onNext;index.html `goHome` line 1560 改 `Mode4.cleanup ? Mode4.cleanup() : null`。

### M3. `Storage.set` quota exceeded 顯示 banner 但 _writeFailed 旗標永遠不清,後續所有寫入都「不再 toast」但仍 silently fail
- `src/index.html:820-838`
- `Storage._writeFailed = true` 設了之後沒地方重置。即使使用者點關閉 banner、清掉一些舊資料後 quota 又有了,`_writeFailed` 還是 true。下次寫成功會 toast 觸發新 banner,但 banner _showQuotaBanner 已 guard 重複(`if (document.getElementById('storage-quota-banner')) return`),所以使用者「清掉一些 SM2 / Wrongbook 後」其實寫入恢復了,但 UI 完全不知道。
- 修補方向:成功寫入時清 `_writeFailed = false`(在 `try` block 內 setItem 成功後);banner 可加「我已清完,測試是否恢復」按鈕。

### M4. `DrillSession._enterDeep` 對「同題深度下鑽」沒去重,可能對 deep drill 又抓到原題本身做變化(generateVariation 內 `q.id !== originalQ.id` 過濾 OK,但 deep 的 originalQ 是「父層的下鑽題」,變化型可能等於更上層的原題)
- `src/index.html:2059-2095`
- 父層 originalQ 是 outerQ;deep 進入時 wrongQ 是「父層第 1 個變化型」,然後 generateVariation(wrongQ, 3) 可能抓到包含 outerQ 本身的題(generateVariation 內只排除 `q.id !== originalQ.id`,這個 originalQ 是 wrongQ,不是 outerQ)→ deep drill 題池可能含 outerQ。
- 觸發:玩家在 Mode 1 答錯 q_001 → 進下鑽變化型 q_002 → 又答錯 → deep drill 抓到 q_001(原題本身)→ 等於沒下鑽。
- 修補方向:`_enterDeep` 呼叫 generateVariation 時把父層 originalQ 與已 queue 過的題目都排除(透過第二個 excludeIds 參數)。

### M5. `Mode7._timeUp` → `_autoLockDrafts` → `_finalize`,但 `_autoLockDrafts` 內 `_getRendered(item)` 對「未訪問過的題目」(item._rendered === undefined)會 fallback 到 `item.q` 原版,沒 key → opt 永遠 undefined → isCorrect=false → 已選 draft 強記為錯
- `src/modes/mode7.js:858-877`
- 玩家在 Mode 7 從題目列表跳到第 30 題選 A draft、再跳回第 1 題沒看就 time_up。第 30 題的 draft.userKey='A' 但 item._rendered 確實存在(因為 _showCurrentQuestion 跑過)。但**第 30 題本身有 draft 卻沒被進過 _showCurrentQuestion(從 jumpToQuestion 進的)**：jumpToQuestion 呼叫 _showCurrentQuestion(line 1382),OK,_rendered 會被 cache。所以這個 path 通常 OK。但 startWithCustomPool path(Mode 6 觸發)直接設 state.lineup 並呼叫 `_showCurrentQuestion()` 只渲染第 1 題,_rendered 只 cache 第 1 題,後續題若被「未訪問就 _autoLockDrafts」(可能不會發生因為要先進 draft 就必經 _showCurrentQuestion),理論上 OK。但 review path 透過 `submitMock` confirm 後直接走 `_finalize` 也跑 `_autoLockDrafts`(line 1241)。
- 修補方向:`_autoLockDrafts` 在拿不到 rendered options(rOpts.length === 0)時先 try `renderQuestion(item.q)` 補 cache;對齊 `_saveHistory` 的 defensive pattern。

### M6. `Mode6._runNextBatch` 對 `_setExamMode` 旗標的同步處理在「批次中 challenge 答錯走 DrillSession,DrillSession 完成走 onComplete(self._runNextBatch)」會有 race
- `src/modes/mode6.js:776-797`(challenge 中 DrillSession.start)+ `index.html:1978-1980`(DrillSession.next 對 depth === 0 && !onComplete 清旗標)
- 批次模式:Mode6.executeBatch 設 `_setExamMode(true, 'Mode 6 批次挑戰')`;challenge 答錯進 DrillSession.start,有 onComplete(self._runNextBatch),所以 DrillSession.next 不清旗標(因為 onComplete 存在);OK。但若使用者在 DrillSession 中按右上首頁(旗標 true,跳 confirm),確認後 goHome:
  - goHome 清旗標
  - `Mode6.cleanup` 還原 hook
  - 但 DrillSession.queue 還有題目,onComplete 還持有 _runNextBatch reference → 若 DrillSession 沒被 cleanup,下次進 Mode 6 殘留 callback
- 修補方向:goHome 加 `DrillSession.queue = []; DrillSession.onComplete = null;`;或 `_setExamMode(false)` 順帶清 DrillSession 全域狀態。

---

## LOW 風險

### L1. `Mode1.pickQuestionsForBoss` 對 `MIN_POOL_TO_BATTLE = 5` 的 BOSS 在「SeenCorrect filter 後不足」時 fallback 回原 pool,但 minNeeded 取 `Math.min(5, pool.length)` 在小 pool BOSS(autonomous 8 題)會反覆出已答對
- `src/modes/mode1.js:151-163`
- pool=8,SeenCorrect mark 5 → filter 剩 3 < `min(5, 8)=5` → fallback → 重複出 5 題已答對。鐵律 #1 sweat。
- 修補方向:minNeeded 用 `max(1, Math.ceil(pool.length / 4))` 之類比例。

### L2. `pickCase` 用 `RNG.pick` 但對只有 `case_a` 一個 case 的題目仍走隨機(只是固定回 case_a),浪費 RNG state
- `src/index.html:885-890`
- 不會出錯,純效能 / RNG 抖動。

### L3. `Wrongbook.add` 對 `existing.userChoice = userChoice` 無條件覆寫;但若使用者在 Mode 1 答錯 q_001(userChoice=B)→ Mode 7 又錯了同題(userChoice=C),最後一次的 userChoice 蓋掉。Review UI 顯示「你選 C」可能不是這一次玩家的選擇
- `src/index.html:1110-1119`
- 是設計選擇還是 bug 看歷史;但 wrongCount 累加、userText/correctText 只在「!existing.userText」時補,userChoice 卻無條件覆寫,這個不一致暗示某條 path 有意外行為。
- 修補方向:userText 同步覆寫,或都改成「保留首次」。

### L4. `generateVariation` 對 `originalQ.related_node_ids` 不存在(undefined)時 fallback `[]`,OK;但對 `originalQ.tags` 為 `undefined` 時 `[]` map OK,然而 `upperKeywords.size === 0` 時 sameCodeFiltered 永遠 `hits >= 2` 不成立 → 跳過 sameCodeFiltered 補位,只剩 sameNode / relatedNode → 變化型品質下降
- `src/index.html:1432-1439`
- 新題沒 hook / tags / misconceptions 時(理論不該但測試 fixture 可能)。
- 修補方向:upperKeywords.size === 0 時降級用 same knowledge_code 作 sameCodeFiltered fallback。

### L5. `Mode2.attack` 用 `Math.random()` 算 crit(line 546),不是用 `RNG.next()`,不可重現
- 全 mode 都有此問題,但純運氣感受不影響進度。

### L6. `ProgressIO.importProgress` 階段 7 寫入時用 `for...of localStorage` rollback,但 `localStorage.length` 在 removeItem 期間動態變化 → 第二個 for 迴圈寫 cleanPayload 時 quota 計算可能誤判
- `src/index.html:2865-2883`
- 已有 try/catch rollback,實際失敗 path 會還原;但 rollback snapshot 是寫入前,若使用者匯入比現在更大 → quota → catch → 還原 → 但 catch 區內 removeItem 再 setItem,順序保證大致 OK;偏 paranoid review。
- 修補方向:先 setItem 嘗試到 temp key,成功再 remove 舊 key,避免「remove 後 set fail」造成空狀態。

---

## 已確認穩固(列點)

- `Player.gainExp` 有 `maxLevelUps = 1000` 守衛防 expMax 損壞無窮迴圈(line 2411)
- `SM2.computeNext` 對 NaN/Infinity grade 都已 clamp(sm2.js:25-30)
- `Wrongbook.cleanupSuspect` 對 correctChoice 失效有 listSuspectQids dry-run preview,且只清非 mastered
- `ProgressIO` strict mode 完整七階段(file size / text length / JSON parse with reviver / envelope schema / checksum / per-key validator / atomic write with rollback)
- `_setExamMode` 在所有正常離場路徑(cleanup / gameOver / victory / _finalize / drillSession.next)有 set false
- Mode 1 / 2 / 5 / 8 都有 `_clearAllTimers` 集中管理 setTimeout,goHome 都會清
- `RNG.shuffle` Fisher-Yates 正確實作
- `renderQuestion` 對 calculation/code_block/trace_steps 都做 placeholder 替換(案例 8 已修補)
- DrillSession `_parentStack` 在頂層 start 時清空,防 stack 永久長大
