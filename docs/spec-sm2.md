# Spec — SM-2 間隔重複系統(方案 4)

> 撰寫:exploration agent,2026-05-11
> 角色:供 Worker 實作前的精確規格(file-level / line-level 約束齊備)
> 前置必讀:`docs/architecture-current.md`

---

## 1. 目標

SuperMemo-2(SM-2)演算法 — 為每題建立 EF(Easiness Factor)/ interval(下次複習間隔,天)/ repetition(連對次數)狀態,每天進入「今日複習」佇列,依 due 時間排序顯示,提升長期保留。

考前 13 天用途:**集中複習過去答錯與低 EF 的題**,而非單純練新題。

---

## 2. SM-2 演算法(JS 實作)

### 2.1 評分量表(決定:採用 0-5 整數,**非** Anki 的 4 按鈕)

**選擇 0-5 整數**(SM-2 原始論文用法)而非 Anki 的 Again/Hard/Good/Easy 4 按鈕,理由:
- 本專案題目正解 / 錯解二元判斷,使用者**不主動評分**(不問「你覺得這題多難?」)
- 改自動 mapping:答對 → grade=5,答錯 → grade=2(SM-2 規則:grade < 3 重置 repetition)
- 簡化使用者心智負擔(不增加新介面)

**Mapping**(在 `recordAnswer` 內 hardcode):
| 使用者行為 | grade |
|:--|:-:|
| 答對(無下鑽介入)| 5 |
| 答對(走過下鑽訓練)| 4 |
| 答錯 | 2 |
| (未來)若新增「需要看口訣才答對」按鈕 | 3 |

### 2.2 SM-2 公式(JS function 簽章)

```js
// src/sm2.js

const SM2 = {
  // === 常數 ===
  MIN_EF: 1.3,
  INITIAL_EF: 2.5,
  MS_PER_DAY: 86400000,

  // === 計算下次狀態(純函數)===
  // 輸入:當前狀態 + grade(0-5)
  // 輸出:新狀態 {ef, interval (days), repetition, lastReview, nextDue}
  computeNext(state, grade) {
    let { ef, interval, repetition } = state || { ef: this.INITIAL_EF, interval: 0, repetition: 0 };
    if (grade < 3) {
      // 答錯 → 重置 repetition,interval 設 1 天(明天再考)
      repetition = 0;
      interval = 1;
    } else {
      // 答對 → repetition++,間隔依 SM-2 公式
      if (repetition === 0) interval = 1;
      else if (repetition === 1) interval = 6;
      else interval = Math.round(interval * ef);
      repetition += 1;
    }
    // EF 更新公式(SM-2 原始):EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
    ef = ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (ef < this.MIN_EF) ef = this.MIN_EF;
    const now = Date.now();
    return {
      ef: Number(ef.toFixed(3)),
      interval,
      repetition,
      lastReview: now,
      nextDue: now + interval * this.MS_PER_DAY
    };
  },

  // === Storage ===
  STORAGE_KEY: 'ipas_sm2_v1',
  load() { return Storage.get(this.STORAGE_KEY, {}); }, // { [qid]: state }
  save(s) { Storage.set(this.STORAGE_KEY, s); },
  getState(qid) {
    const all = this.load();
    return all[qid] || { ef: this.INITIAL_EF, interval: 0, repetition: 0, lastReview: 0, nextDue: 0 };
  },

  // === 記錄一次答題(由 Mastery hook 點呼叫)===
  recordAnswer(qid, isCorrect, viaDrill = false) {
    if (!qid) return;
    const grade = isCorrect ? (viaDrill ? 4 : 5) : 2;
    const all = this.load();
    const cur = all[qid] || { ef: this.INITIAL_EF, interval: 0, repetition: 0, lastReview: 0, nextDue: 0 };
    all[qid] = this.computeNext(cur, grade);
    this.save(all);
    return all[qid];
  },

  // === 今日 due 佇列 ===
  // 返回 [{qid, state}, ...],按 nextDue ASC 排序(最早 due 在前)
  // overdueOnly=false 時包含「nextDue <= now + 1day」(明日內到期),否則僅當下到期
  getDueQueue(overdueOnly = true) {
    const all = this.load();
    const now = Date.now();
    const cutoff = overdueOnly ? now : now + this.MS_PER_DAY;
    return Object.entries(all)
      .filter(([_, s]) => s.nextDue > 0 && s.nextDue <= cutoff)
      .sort(([, a], [, b]) => a.nextDue - b.nextDue)
      .map(([qid, state]) => ({ qid, state }));
  },

  // === 統計(首頁顯示用)===
  countDueToday() { return this.getDueQueue(true).length; },
  countOverdue() {
    const all = this.load();
    const now = Date.now();
    return Object.values(all).filter(s => s.nextDue > 0 && s.nextDue < now - this.MS_PER_DAY).length;
  },
  totalTracked() { return Object.keys(this.load()).length; }
};
```

### 2.3 數值範例(供 Worker 自我驗算)

| 起始狀態 | grade | 結果(預期)|
|:--|:-:|:--|
| `{ef:2.5, int:0, rep:0}` | 5 | `{ef:2.6, int:1, rep:1}` |
| `{ef:2.5, int:0, rep:0}` | 2 | `{ef:2.18, int:1, rep:0}` |
| `{ef:2.6, int:1, rep:1}` | 5 | `{ef:2.7, int:6, rep:2}` |
| `{ef:2.7, int:6, rep:2}` | 5 | `{ef:2.8, int:round(6*2.7)=16, rep:3}` |
| `{ef:1.3, int:1, rep:0}` | 2 | `{ef:1.3 (hit floor), int:1, rep:0}` |

Worker 應在實作後跑下列 mock 自驗:
```js
console.assert(SM2.computeNext({ef:2.5,interval:0,repetition:0}, 5).interval === 1);
console.assert(SM2.computeNext({ef:2.6,interval:1,repetition:1}, 5).interval === 6);
```

---

## 3. Storage Schema

### 3.1 Key:`ipas_sm2_v1`

```json
{
  "q_0001": { "ef": 2.6, "interval": 1, "repetition": 1, "lastReview": 1747000000000, "nextDue": 1747086400000 },
  "q_pa_001": { "ef": 2.18, "interval": 1, "repetition": 0, "lastReview": 1747000000000, "nextDue": 1747086400000 }
}
```

### 3.2 跟既有 key 無衝突

| 既有 key | 衝突? |
|:--|:--|
| `ipas_mastery_v1` | 否 — Mastery 用 nodeId 鍵,SM-2 用 qid 鍵,目的不同(Mastery=節點熟練,SM-2=每題下次複習)|
| `ipas_wrongbook_v1` | 否 — 結構獨立,但 SM-2 的「答錯題」與 Wrongbook 的「錯題」有資料重複現象。**保留兩者**(SM-2 也追答對題的下次間隔,Wrongbook 不追)|
| `ipas_progress_v1` | 否 |

---

## 4. 整合點(精確 line-range)

### 4.1 共用層 hook

**位置 1:`PlayEngine.answer()` — index.html:1078**

```js
// 既有(line 1078):
if (this.current.node_id) Mastery.update(this.current.node_id, isCorrect);
// 新增(緊接其後):
if (typeof SM2 !== 'undefined' && this.current.id) SM2.recordAnswer(this.current.id, isCorrect, false);
```

**位置 2:`Mode1.answer()` — mode1.js:411**

```js
// 既有(line 411):
if (q.node_id) Mastery.update(q.node_id, isCorrect);
// 新增(緊接其後):
if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, isCorrect, false);
```

**位置 3:`Mode2.answer()` — mode2.js:425**

```js
// 既有(line 425):
if (q.node_id) Mastery.update(q.node_id, isCorrect);
// 新增(緊接其後):
if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, isCorrect, false);
```

**位置 4-7:類同 — 各 mode hook 點**:
- `mode3.js:827`(答對)→ 加 `SM2.recordAnswer(s.q.id, true, false)`
- `mode3.js:901`(答錯)→ 加 `SM2.recordAnswer(s.q.id, false, false)`
- `mode4.js:461`(答對)→ 加 `SM2.recordAnswer(pairData.sourceQ.id, true, false)`
- `mode4.js:501`(答錯)→ 加 `SM2.recordAnswer(pairData.sourceQ.id, false, false)`
- `mode5.js`:Mode5 走 PlayEngine.answer 路徑(已被位置 1 覆蓋)— **不重複加**
- `mode6.js`:Mode6 走 PlayEngine 路徑 — 不重複加
- `mode7.js:606`(答對)/ `mode7.js:610`(答錯)→ 各加一行

**位置 8:`DrillSession.next()` — index.html:1206**

```js
// 既有(line 1206):
Mastery.drillBonus(this.targetNode);
// 新增(緊接其後):若使用者剛走完下鑽且全對,提升 SM-2 grade
// (drill 用 viaDrill=true,grade=4 而非 5,反映「需提示才會的題」)
// 注意:DrillSession 中每題實際走 PlayEngine.answer 路徑,SM-2 已被位置 1 自動 record(grade=5)
// 因此此處不重複呼叫 SM2.recordAnswer,以避免雙寫
```

決策:**DrillSession 不重複 hook**(SM-2 在 PlayEngine.answer 已 record)。若未來需區分「下鑽 vs 主場答題」,新增 `viaDrill` 旗標傳遞。

### 4.2 新增載入 SM-2 模組

**index.html:1524**(動態載入 mode 的 for 迴圈之外,**之前**先載 `sm2.js`):

```js
// === 啟動 ===
(async function() {
  Progress.init();
  await loadQuestions();
  // 新增:先載 sm2.js(scrip 標籤,純同步 const)
  await new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'sm2.js';
    s.onload = res; s.onerror = () => { console.warn('sm2.js 載入失敗'); res(); };
    document.head.appendChild(s);
  });
  // 動態載入 mode 模組(既有)
  for (const name of ['mode1', 'mode2', 'mode3', 'mode4', 'mode5', 'mode6', 'mode7']) { ... }
  refreshHome();
})();
```

或更簡單的替代方案:**在 `<head>` 內加 `<script src="src/sm2.js"></script>`**(在 1424 `<script>` 行之前),這樣 SM-2 是同步全域常數,順序保證 mode files 已可見 `SM2`。

**Worker 推薦方案**:採後者(`<head>` 內 `<script src="sm2.js"></script>` 同步載),簡化載入時序。

### 4.3 新增 view-sm2-review

**index.html:413**(view-stats 後):

```html
  <!-- SM-2 複習佇列 -->
  <section id="view-sm2-review" class="view"></section>
```

**index.html 339-388 `<div class="modes-grid">` 內**(模式選單末尾,在錯題本按鈕之前或之後):

```html
        <button class="mode-card" onclick="SM2.enterReview()">
          <div class="mode-num">📅</div>
          <div class="mode-title">📅 今日複習(SM-2)</div>
          <div class="mode-desc">
            <span id="sm2-due-count">0</span> 題到期 ·
            追蹤 <span id="sm2-tracked">0</span> 題
          </div>
          <div class="mode-stats">間隔重複 · 長期記憶</div>
        </button>
```

**首頁 refreshHome 同步**(index.html:927-953,新增 SM-2 統計):

```js
// 在 refreshHome() 末尾(line 952 之前)新增:
if (typeof SM2 !== 'undefined') {
  const due = SM2.countDueToday();
  const tracked = SM2.totalTracked();
  const dueEl = document.getElementById('sm2-due-count');
  const trackedEl = document.getElementById('sm2-tracked');
  if (dueEl) dueEl.textContent = due;
  if (trackedEl) trackedEl.textContent = tracked;
}
```

---

## 5. 新 review view 文字 wireframe

```
┌─ 📅 今日複習 ────────────────────────┐
│ 13 題到期 · 已追蹤 87 題 · EF 平均 2.4│
├──────────────────────────────────────┤
│  [按到期排序  ↓]  [按 EF 升序  ↓]    │
├──────────────────────────────────────┤
│ ① q_0001  ⏰ 已到期  EF 1.45          │
│   Recall 公式...(stem 前 60 字)     │
│                                      │
│ ② q_pa_004  ⏰ 已到期  EF 2.31        │
│   numpy dot...                       │
│                                      │
│ ③ q_pc_calc_001  📅 今日到期  EF 2.6 │
│   F1 計算...                         │
│ ...                                  │
├──────────────────────────────────────┤
│ [▶ 開始複習(13 題)]  [回首頁]      │
└──────────────────────────────────────┘
```

點「開始複習」→ 走類似 Mode4 的 PlayEngine 連戰流程(內部:`SM2.startReviewSession()` → 對佇列每題呼叫 `PlayEngine.show()`,`onNext` 串到下一題),全部完成後寫 `view-result`。

### Sub-state machine

```js
SM2.enterReview() = function() {
  this.queue = this.getDueQueue(false);  // include明日內到期
  if (this.queue.length === 0) {
    showToast('🎉 今日無待複習題目'); goHome(); return;
  }
  this.idx = 0;
  this.correct = 0;
  this.renderReviewList();
  show('view-sm2-review');
};

SM2.startReviewSession() = function() {
  if (this.queue.length === 0) return this.finishReview();
  const item = this.queue[this.idx];
  const q = QUESTIONS.find(qq => qq.id === item.qid);
  if (!q) {  // 題目已被刪除
    this.idx++; return this.startReviewSession();
  }
  PlayEngine.show(q, { contextHTML: `<div class="card"><h2>📅 SM-2 複習 ${this.idx+1}/${this.queue.length}</h2><p>EF ${item.state.ef.toFixed(2)} · 上次 ${...}</p></div>` });
  PlayEngine.onNext = () => { this.idx++; this.startReviewSession(); };
};
```

---

## 6. 鐵律相容性

| 鐵律 | 衝突? | 說明 |
|:-:|:-:|:--|
| #1 錯題驅動下鑽 | △ | **可疊用**:答錯時 SM-2 設 grade=2 + interval=1,**同時** PlayEngine.drill 走變化型下鑽。下鑽結束後既有 `Mastery.drillBonus` 不被 SM-2 覆寫 |
| #2 動態題庫 | – | 完全相容,SM-2 只追 qid 狀態,不影響 stem_variables / shuffle_options |
| #3 不抄 114-2 | – | 無關 |
| #4 選項長度 | – | 無關(SM-2 不改題目)|
| #5 來源忠實 | – | SM-2 不引入新 node_id,只用既有 qid 索引 |

**Mastery vs SM-2 兩者並存的理由**:
- **Mastery** = 節點層次(nodeId) → 用於「弱點 Top5」、首頁進度條、`countMastered()` 判定 87 節點熟練度
- **SM-2** = 題目層次(qid) → 用於「今日複習」、決定哪題該重新出
- 兩者**互補不重複**,不互相取代

**Migration 策略**:既有 `ipas_mastery_v1` 不動。SM-2 在使用者答下一題時開始累積資料(冷啟動,沒 backfill)。理由:13 天時間有限,不額外做 migration code。

---

## 7. 檔案級 / 行級約束(Worker 守則)

### MAY modify

| 檔案 | 行 | 動作 |
|:--|:-:|:--|
| `src/sm2.js` | NEW | 整檔新建 |
| `src/index.html` | 約 309(`</style>` 後)| 新增 `<script src="src/sm2.js"></script>` 一行 |
| `src/index.html` | 339-388(modes-grid 內)| 新增 SM-2 複習 mode-card |
| `src/index.html` | 413(view-stats 後)| 新增 `<section id="view-sm2-review">` |
| `src/index.html` | 927-953(refreshHome)| 末尾新增 SM-2 統計同步 |
| `src/index.html` | 1078(PlayEngine.answer)| 緊接 Mastery.update 加一行 SM2.recordAnswer |
| `src/modes/mode1.js` | 411 | 緊接 Mastery.update 加 SM2.recordAnswer |
| `src/modes/mode2.js` | 425 | 同上 |
| `src/modes/mode3.js` | 827 + 901 | 答對/答錯各加 SM2.recordAnswer |
| `src/modes/mode4.js` | 461 + 501 | 同上 |
| `src/modes/mode7.js` | 606 + 610 | 同上 |

### MUST NOT modify

- `kb/` 任何檔
- `src/questions*.json` 任何檔(SM-2 不需新 schema)
- `scripts/audit-*.js` 任何檔(SM-2 不影響既有稽核;新檔 sm2.js 是純行為層,沒 schema 變動)
- `src/modes/mode5.js`(走 PlayEngine 路徑,已自動覆蓋)
- `src/modes/mode6.js`(走 PlayEngine 路徑)

### 自驗腳本

Worker 完工後跑:
```bash
node -c src/sm2.js  # 語法檢查(JS 嚴格說沒這命令,改用 node --check)
node --check src/sm2.js
node -e "
  // 直接驗算 SM-2 公式(不走瀏覽器,避免 DOM)
  const { SM2 } = require('./src/sm2.js'); // 若有 export;否則 readFileSync + eval
  // ... 跑章節 2.3 數值範例驗算
"
node scripts/audit-source-fidelity.js  # 既有審計依然 PASS
node scripts/audit-render.js
node scripts/audit-option-length.js
```

---

## 8. 估計實作成本

- **sm2.js 新檔**:~120 LOC(含 computeNext / Storage / queue / enterReview / startReviewSession / finishReview / renderReviewList)
- **index.html 改動**:~30 LOC(script 標籤、view 區塊、mode-card、refreshHome 末尾、PlayEngine.answer 一行)
- **mode 檔改動**:每檔 1-2 行,5 個檔總共 ~10 LOC
- **總計**:~160 LOC

**開發時間**:1-1.5 天(熟悉 codebase 後)。包含寫 mock 驗算 + 跑既有 audit 確認無 regression。

**測試**:Worker 自驗 → independent validator → 跑 §10 ground truth。

---

## 9. NEEDS_REVIEW

- [ ] **viaDrill grade=4 vs 5 的決策**:目前 spec 規範下鑽路徑也走 PlayEngine.answer(grade=5)。若使用者實際反饋「下鑽不該算 grade=5」,Worker 可改傳第三參數;但這需要在 PlayEngine.answer 簽章新增 `opts.viaDrill`,屬侵入式改動
- [ ] **與 Mastery 雙重寫法的長期治理**:SM-2 / Mastery 各管一邊,首頁顯示要不要合併視覺?spec 暫不合併(風險過大)
- [ ] **冷啟動體驗**:第一週使用者 SM-2 佇列為空 / 很少。考前 13 天該不該 backfill 既有 Wrongbook?spec 暫**不 backfill**
