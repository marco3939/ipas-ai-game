# 題目錯誤提報機制 — Patch 草案

> **檔案路徑**:`docs/error-report-patches.md`
> **建立日期**:2026-05-10
> **狀態**:草案(由使用者 review 後派 sub agent 實作)
> **配套規格**:`docs/error-report-spec.md`

---

## 0. 修改檔案總覽

| 檔案 | 動作 | 約略行數 |
|:--|:--|:--:|
| `src/index.html` | 新增 ErrorReports 物件 + 修改 showExplanation + 修改 refreshHome + 修改 view-home | +180 行 |
| `src/modes/mode1.js` | showExplanation 加 1 行(呼叫 helper) | +1 行 |
| `src/modes/mode2.js` | showExplanation 加 1 行 | +1 行 |
| `src/modes/mode5.js` | showExplanation 加 1 行 | +1 行 |
| `src/modes/mode3.js` | **不需動**(Pipeline 流程,不顯示 explanation) | 0 |
| `src/modes/mode4.js` | **不需動**(Match-3 無傳統 explanation) | 0 |
| `questions*.json` | **不需動** | 0 |

**總改動量**:約 +183 行,皆為新增,**不刪除任何既有 code**(零回退風險)。

---

## 1. Patch A:src/index.html — ErrorReports 物件 + Storage Key

### 1.1 在 Storage 物件加 K_ERROR_REPORTS

**位置**:約 line 397-406,Storage 物件內

```diff
 const Storage = {
   K_PROGRESS: 'ipas_progress_v1',
   K_MASTERY: 'ipas_mastery_v1',
   K_WRONGBOOK: 'ipas_wrongbook_v1',
+  K_ERROR_REPORTS: 'ipas_error_reports_v1',
   K_SETTINGS: 'ipas_settings_v1',
   K_SESSION: 'ipas_session_state_v1',
   get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
   set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.warn('storage full:', e); } },
   del(k) { localStorage.removeItem(k); }
 };
```

### 1.2 在 Wrongbook 物件下方新增 ErrorReports 物件

**位置**:約 line 549 之後(Wrongbook 物件結尾後)

```js
// === ErrorReports 錯誤回報(僅本機儲存,不上傳)===
const ErrorReports = {
  TYPES: {
    stem_options_mismatch: '題目選項與題幹不一致',
    wrong_answer: '正解錯誤',
    calc_inconsistent: '計算題 explanation 數字與 stem 對不上',
    wrong_explanation_wrong: '錯解 explanation 不正確',
    category_mismatch: '知識點 / 編碼分類錯誤',
    out_of_scope: '內容超出 IPAS 中級範圍',
    other: '其他'
  },
  load() { return Storage.get(Storage.K_ERROR_REPORTS, []); },
  save(arr) { Storage.set(Storage.K_ERROR_REPORTS, arr); },

  add(qid, types, note, context) {
    if (!qid) { console.error('ErrorReports.add: qid 為空'); return; }
    if ((!types || types.length === 0) && !note) {
      console.error('ErrorReports.add: types 與 note 不能同時為空');
      return;
    }
    const reports = this.load();
    const existing = reports.find(r => r.qid === qid);
    const now = Date.now();
    // 防雙擊:1 秒內重複 add 視為同一次
    if (existing && (now - existing.ts) < 1000) return;

    const finalTypes = (types && types.length > 0) ? types : ['other'];
    if (existing) {
      existing.types = finalTypes;
      existing.note = note || '';
      existing.context = context || existing.context;
      existing.ts = now;
      existing.report_count = (existing.report_count || 1) + 1;
    } else {
      reports.push({
        qid, ts: now,
        types: finalTypes,
        note: note || '',
        context: context || {},
        report_count: 1
      });
    }
    this.save(reports);
  },

  get(qid) { return this.load().find(r => r.qid === qid); },
  count() { return this.load().length; },

  top(n = 5) {
    // 依 wrongCount + reportCount*2 排序(回報權重較高)
    const reports = this.load();
    const wrongbook = Wrongbook.load();
    const map = {};
    reports.forEach(r => {
      map[r.qid] = map[r.qid] || { qid: r.qid, wrongCount: 0, reportCount: 0, types: [], lastReportTs: 0 };
      map[r.qid].reportCount = r.report_count || 1;
      map[r.qid].types = r.types || [];
      map[r.qid].lastReportTs = r.ts;
    });
    wrongbook.forEach(w => {
      map[w.qid] = map[w.qid] || { qid: w.qid, wrongCount: 0, reportCount: 0, types: [], lastReportTs: 0 };
      map[w.qid].wrongCount = w.wrongCount || 1;
    });
    return Object.values(map)
      .map(x => ({ ...x, score: x.wrongCount + x.reportCount * 2 }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  },

  export() {
    const data = {
      version: '1.0',
      generated_at: Date.now(),
      device_info: { ua: navigator.userAgent, lang: navigator.language },
      reports: this.load()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ipas-error-reports-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`✅ 已匯出 ${data.reports.length} 筆回報`, 2500);
  },

  clear() {
    if (!confirm('確定清除所有錯誤回報?(建議先匯出再清除)')) return;
    this.save([]);
    showToast('已清除所有錯誤回報');
    refreshHome();
  },

  // === Form UI helpers ===
  // 在 explanation 區塊呼叫此 helper 拼接按鈕 + 隱藏 form
  renderButton(qid) {
    const existing = this.get(qid);
    const label = existing ? '✅ 已回報(可修改)' : '⚠️ 回報此題有誤';
    return `<button class="btn btn-ghost" onclick="ErrorReports.toggleForm('${qid}')" id="er-btn-${qid}">${label}</button>
            <div id="er-form-${qid}" class="er-form" style="display:none;margin-top:10px;padding:12px;background:rgba(250,204,21,0.08);border-left:4px solid #facc15;border-radius:6px"></div>`;
  },

  toggleForm(qid) {
    const formEl = document.getElementById(`er-form-${qid}`);
    if (!formEl) return;
    if (formEl.style.display === 'none') {
      formEl.innerHTML = this._renderFormHTML(qid);
      formEl.style.display = 'block';
    } else {
      formEl.style.display = 'none';
    }
  },

  _renderFormHTML(qid) {
    const existing = this.get(qid);
    const checkedTypes = existing ? existing.types : [];
    const note = existing ? existing.note : '';
    const checkboxes = Object.entries(this.TYPES).map(([code, label]) => {
      const checked = checkedTypes.includes(code) ? 'checked' : '';
      return `<label style="display:block;margin:4px 0;cursor:pointer">
        <input type="checkbox" class="er-type-cb" value="${code}" ${checked} style="margin-right:6px"/>${label}
      </label>`;
    }).join('');
    return `
      <div style="font-weight:700;color:#facc15;margin-bottom:8px">⚠️ 回報此題有誤</div>
      <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:6px">請勾選錯誤類型(可複選):</div>
      ${checkboxes}
      <div style="margin-top:8px">
        <label style="display:block;color:var(--fg-dim);font-size:0.85rem;margin-bottom:4px">備註(選填):</label>
        <textarea id="er-note-${qid}" rows="3" style="width:100%;padding:6px;background:rgba(0,0,0,0.3);color:var(--fg);border:1px solid rgba(255,255,255,0.1);border-radius:4px;font-family:inherit">${note.replace(/</g, '&lt;')}</textarea>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn btn-primary" onclick="ErrorReports._submit('${qid}')">✅ 提交回報</button>
        <button class="btn btn-ghost" onclick="ErrorReports.toggleForm('${qid}')">取消</button>
      </div>
    `;
  },

  _submit(qid) {
    const formEl = document.getElementById(`er-form-${qid}`);
    if (!formEl) return;
    const types = Array.from(formEl.querySelectorAll('.er-type-cb:checked')).map(cb => cb.value);
    const note = (document.getElementById(`er-note-${qid}`).value || '').trim();
    if (types.length === 0 && !note) {
      showToast('⚠️ 請至少勾選一個錯誤類型或填寫備註', 2500);
      return;
    }
    // 取得 context(優先從 PlayEngine.current,若無則從 DrillSession.originalQ 或 fallback minimal)
    const context = this._buildContext(qid);
    this.add(qid, types, note, context);
    formEl.style.display = 'none';
    const btn = document.getElementById(`er-btn-${qid}`);
    if (btn) btn.textContent = '✅ 已回報(可修改)';
    showToast('✅ 已記錄回報,可在首頁匯出', 2500);
  },

  _buildContext(qid) {
    // 從 PlayEngine.current 取得當前題目的 rendered 狀態
    const cur = (typeof PlayEngine !== 'undefined' && PlayEngine.current && PlayEngine.current.id === qid)
      ? PlayEngine.current
      : null;
    if (!cur) return { qid };
    const correctOpt = cur.options.find(o => o.is_correct);
    return {
      stem_excerpt: (cur.stem || '').substring(0, 200),
      knowledge_code: cur.knowledge_code,
      node_id: cur.node_id,
      format: cur.format,
      rendered_options: cur.options.map(o => `${o.key}. ${o.text}`),
      correct_choice: correctOpt ? correctOpt.key : null,
      correct_choice_text: correctOpt ? correctOpt.text : null
    };
  }
};
```

### 1.3 修改 PlayEngine.showExplanation 加按鈕

**位置**:約 line 861-864 的 actions 區塊

```diff
         <div class="actions" style="margin-top:14px">
           <button class="btn btn-primary" onclick="PlayEngine.next()">繼續下一題 →</button>
           ${!isCorrect ? `<button class="btn btn-warn" onclick="PlayEngine.drill()">🎯 立即下鑽變化型</button>` : ''}
+          ${ErrorReports.renderButton(q.id)}
           <button class="btn btn-ghost" onclick="goHome()">回首頁</button>
         </div>
```

### 1.4 修改 refreshHome / view-home 加匯出按鈕 + Top 5

**位置 1**:view-home 第一張卡片(約 line 318-322)新增匯出按鈕

```diff
     <div class="card">
       <h1>📘 IPAS AI 中級 — 衝刺練習場</h1>
       <p style="color:var(--fg-dim)">考試日:2026-05-23 · 鐵律驅動的個人化學習</p>
       <div class="progress-bar"><div class="progress-fill" id="overall-progress" style="width:0%"></div></div>
+      <div class="actions" style="margin-top:10px">
+        <button class="btn btn-ghost" id="er-export-btn" onclick="ErrorReports.export()" disabled>📤 匯出錯誤回報(0 筆)</button>
+        <button class="btn btn-ghost" onclick="ErrorReports.clear()">🗑️ 清除回報</button>
+      </div>
     </div>
```

**位置 2**:在「弱點 Top 5」卡片下方新增「最常被回報題目」卡片(約 line 369 之後)

```diff
     <div class="card">
       <h2>📊 弱點 Top 5</h2>
       <div class="weak-list" id="weak-list"><div class="empty">尚無資料,先做題再回來看</div></div>
     </div>
+
+    <div class="card">
+      <h2>🚨 最常被回報的題目 Top 5</h2>
+      <p style="color:var(--fg-dim);font-size:0.85rem;margin-bottom:8px">綜合錯題次數與回報次數(回報權重較高)</p>
+      <div class="weak-list" id="error-top-list"><div class="empty">🎉 目前無異常題目</div></div>
+    </div>
   </section>
```

**位置 3**:`refreshHome` 函數內新增匯出按鈕狀態 + Top 5 渲染(約 line 688-706)

```diff
 function refreshHome() {
   // 倒數
   const d = Progress.daysLeft();
   const cd = document.getElementById('countdown');
   cd.textContent = `D-${d}`;
   if (d <= 7) cd.classList.add('urgent');
   // 統計
   document.getElementById('stat-mastered').textContent = Mastery.countMastered();
   document.getElementById('stat-wrong').textContent = Wrongbook.count();
   const sess = Storage.get(Storage.K_PROGRESS, {sessions:0}).sessions;
   document.getElementById('stat-sessions').textContent = sess;
   // 進度條
   const total = QUESTIONS.length;
   const masterCount = Mastery.countMastered();
   const pct = total > 0 ? Math.round(masterCount / total * 100) : 0;
   document.getElementById('overall-progress').style.width = pct + '%';
   // 弱點
   renderWeakList();
+  // 錯誤回報相關
+  renderErrorTopList();
+  refreshExportButton();
 }
+
+function refreshExportButton() {
+  const btn = document.getElementById('er-export-btn');
+  if (!btn) return;
+  const n = ErrorReports.count();
+  btn.textContent = `📤 匯出錯誤回報(${n} 筆)`;
+  btn.disabled = (n === 0);
+}
+
+function renderErrorTopList() {
+  const top = ErrorReports.top(5);
+  const el = document.getElementById('error-top-list');
+  if (!el) return;
+  if (top.length === 0) {
+    el.innerHTML = '<div class="empty">🎉 目前無異常題目</div>';
+    return;
+  }
+  el.innerHTML = top.map(t => {
+    const q = QUESTIONS.find(qq => qq.id === t.qid);
+    const stemPreview = q ? (q.stem || '').substring(0, 60).replace(/\{[^}]+\}/g, '?') : '(題庫已移除)';
+    const typeLabels = (t.types || []).map(c => ErrorReports.TYPES[c] || c).slice(0, 2).join('、');
+    const cls = t.score >= 5 ? 'low' : t.score >= 3 ? 'mid' : 'high';
+    return `<div class="weak-item">
+      <span style="text-align:left;flex:1">
+        <strong>${t.qid}</strong>
+        <span style="color:var(--fg-dim);font-size:0.85rem"> · 錯 ${t.wrongCount} 次 · 回報 ${t.reportCount} 次</span>
+        <div style="font-size:0.8rem;color:var(--fg-dim);margin-top:2px">${stemPreview}...</div>
+        ${typeLabels ? `<div style="font-size:0.75rem;color:#facc15;margin-top:2px">⚠️ ${typeLabels}</div>` : ''}
+      </span>
+      <span class="weak-score ${cls}">優先度 ${t.score}</span>
+    </div>`;
+  }).join('');
+}
```

---

## 2. Patch B:src/modes/mode1.js — Mode1 explanation 加按鈕

**位置**:約 line 525-528 的 actions 區塊

```diff
           <div class="actions" style="margin-top:14px">
             <button class="btn btn-primary" onclick="Mode1.next()">繼續戰鬥 →</button>
             ${!isCorrect ? `<button class="btn btn-warn" onclick="Mode1.drillThis()">🎯 立即下鑽變化型</button>` : ''}
+            ${ErrorReports.renderButton(q.id)}
           </div>
```

**注意**:Mode1 的 `q` 是 `this.state.currentQ`,確認 q.id 存在後才呼叫(若中途清掉 state 應做 null guard,但 explanation 渲染時 currentQ 必存在,風險低)。

---

## 3. Patch C:src/modes/mode2.js — Mode2 explanation 加按鈕

**位置**:約 line 577-580 的 actions 區塊

```diff
           <div class="actions" style="margin-top:14px">
             <button class="btn btn-primary" onclick="Mode2.next()">繼續判讀 →</button>
             ${!isCorrect ? `<button class="btn btn-warn" onclick="Mode2.drillThis()">🎯 立即下鑽變化型</button>` : ''}
+            ${ErrorReports.renderButton(q.id)}
           </div>
```

---

## 4. Patch D:src/modes/mode5.js — Mode5 explanation 加按鈕

**位置**:約 line 661-664 的 actions 區塊

```diff
           <div class="actions" style="margin-top:14px">
             <button class="btn btn-primary" onclick="Mode5.next()">繼續攻擊 →</button>
             ${!isCorrect ? `<button class="btn btn-warn" onclick="Mode5.drillThis()">🎯 立即下鑽變化型</button>` : ''}
+            ${ErrorReports.renderButton(q.id)}
           </div>
```

---

## 5. Patch E:Mode3 / Mode4 — 不需動

### Mode3(Pipeline 拼圖)
- 流程是「拼圖排序 + 結果頁」,無傳統 explanation 區塊
- 若使用者發現某 pipeline 題有問題 → 只能在 Review(錯題本)模式重做時才能回報
- **此為已知限制**,Phase 2 可考慮在 Mode3 結算頁加總回報入口

### Mode4(易混淆配對戰)
- Match-3 拖拉,沒有「答完 → 看 explanation → 點按鈕」流程
- 配對成功 / 失敗會走 PlayEngine.show(若觸發下鑽),屆時會自動有按鈕
- **此為已知限制**,可接受

---

## 6. CSS 新增(可選微調)

**位置**:`src/index.html` 內 `<style>` 區塊
**目的**:讓 `.er-form` 在小螢幕上更舒適

```css
/* === 錯誤回報 form === */
.er-form { font-size: 0.9rem; }
.er-form label { user-select: none; }
.er-form .er-type-cb { transform: scale(1.1); }
.er-form textarea { resize: vertical; min-height: 60px; }
@media (max-width: 600px) {
  .er-form textarea { font-size: 16px; } /* iOS 防自動縮放 */
}
```

---

## 7. 自驗清單(實作後 sub agent 必跑)

```
1. 語法檢查
   - node -c src/modes/mode1.js
   - node -c src/modes/mode2.js
   - node -c src/modes/mode5.js
   - 對 index.html:Live Server 開瀏覽器,Console 無 SyntaxError

2. 功能驗證
   - 在 Mode4 / Review 答 1 題,explanation 出現「⚠️ 回報此題有誤」按鈕
   - 在 Mode1/2/5 答 1 題,explanation 出現按鈕
   - 點擊按鈕 → 出現 form
   - 勾 2 個 type + 填 note → 提交
   - localStorage 出現 `ipas_error_reports_v1`,結構符合 §2.2
   - 同一題再點 → form 預先勾選上次選項
   - 首頁匯出按鈕變「📤 匯出錯誤回報(1 筆)」並 enabled
   - 點匯出 → 下載 JSON 檔
   - 首頁出現「最常被回報的題目 Top 5」卡片

3. 鐵律自驗
   - node scripts/audit-option-length.js  (應 PASS,本次不動題庫)
   - node scripts/audit-source-fidelity.js (應 PASS)

4. 跨檔契約檢查
   - grep "ErrorReports" src/modes/  → 應只在 mode1/2/5 出現
   - grep "window.ErrorReports" → 應為 0(用裸名)
   - 確認 ErrorReports 用 const 宣告,在 index.html 內,mode 檔讀取裸名
```

---

## 8. 風險與 NEEDS_REVIEW

### 8.1 風險清單

| Risk | 影響 | 緩解 |
|:--|:--|:--|
| Mode1/2/5 自寫 explanation 容易遺漏 | 部分 mode 沒有按鈕 | Patch B/C/D 明確指定 + sub agent 三檔同時改 |
| ErrorReports 是 const,Mode 讀裸名(同 QUESTIONS 教訓) | mode 寫 `window.ErrorReports` 會 undefined | 強調必裸名讀取(寫進 sub agent prompt) |
| Mode3 / Mode4 沒按鈕 | 部分題目無回報通道 | 可接受;Mode3 Phase 2 改進 |
| 同題在不同場景 ID 衝突 | localStorage 回報互蓋 | 設計上即以 qid 為 key,屬預期行為 |
| Form HTML 注入(若 note 含 `<script>`) | XSS | `textContent` / 跳脫 `<` 為 `&lt;` |

### 8.2 NEEDS_REVIEW(由使用者決定)

1. **Modal vs Inline form**:草案選 inline,若使用者想要 modal 風格(覆蓋全螢幕),需重寫 form 渲染
2. **是否在 DrillSession 中也允許回報**:目前設計是「會」,若使用者想關閉(避免下鑽變化型干擾),需在 PlayEngine.showExplanation 偵測 `DrillSession.queue.length > 0` 時隱藏按鈕
3. **匯出檔名格式**:目前是 `ipas-error-reports-2026-05-10T08-00-00.json`,可改為純日期 `ipas-error-reports-20260510.json`
4. **「清除回報」是否需要先強制匯出**:目前是 confirm,可加強為「未匯出禁清除」
5. **Top 5 排序權重**:目前 `wrongCount + reportCount * 2`,可調權重
6. **是否在 Stats 頁也加匯出按鈕**:目前只在首頁,可雙保險
7. **Mode3 結算頁是否加批次回報入口**:目前不加,Phase 2 處理
8. **回報資料是否要納入 audit script**:Phase 2 處理,可寫 `scripts/audit-error-reports.js` 自動把 `wrong_answer` / `calc_inconsistent` 類別轉成 audit 重跑指令

---

## 9. 實作派工建議

### 派 1 個 worker + 1 個 validator(中等規模任務)

**Worker prompt 重點**:
- 改 4 檔(index.html + mode1/2/5)
- 嚴格 follow §1-§4 的 diff
- 不可主動加防呆 / 重構(教訓 §0 cardinal rule #4)
- 跑 §7 自驗清單

**Validator 任務**:
- 不看 worker 回報摘要,直接 read 改後的 4 個檔案
- 跑 §7 第 2 / 3 / 4 步
- 寫獨立判定(PASS / FAIL / CONDITIONAL)

---

## 10. 修訂歷史

| 日期 | 版本 | 變更 |
|:--|:-:|:--|
| 2026-05-10 | v0 | 初版 patch 草案(配套 spec v0) |
