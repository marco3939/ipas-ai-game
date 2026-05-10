# 題目錯誤提報機制 — 設計規格

> **檔案路徑**:`docs/error-report-spec.md`
> **建立日期**:2026-05-10
> **狀態**:設計階段(尚未實作)
> **觸發背景**:使用者實測 q_0025 stem 與 explanation 數字不一致(後查為 cache 問題,但此 bug 種類確實可能潛伏在其他題目)。需建立人工回報通道,讓使用者答完每題後可一鍵標記疑似錯題,系統蒐集後批次審視修補。

---

## 0. 設計哲學

| 原則 | 內容 |
|:--|:--|
| **零干擾** | 預設不打斷答題節奏,按鈕只在 explanation 區塊出現,使用者選擇是否點擊 |
| **本地優先** | 所有回報只寫 localStorage,**不上傳任何後端**(本專案無後端) |
| **使用者主導** | 匯出由使用者主動下載 JSON,自行分享給開發者 |
| **共用層集中** | 改 PlayEngine.showExplanation 一次即可在 Mode3/4/Review 生效;Mode1/2/5 自寫 explanation,需另加 helper 統一注入 |
| **與 Wrongbook 對齊結構** | ErrorReports 物件介面參考 Wrongbook,降低學習成本與維護負擔 |

---

## 1. UI 流程

### 1.1 答題後 explanation 區塊新增按鈕

**位置**:`PlayEngine.showExplanation` 渲染的 `.actions` 區塊內,「繼續下一題」按鈕之後、「回首頁」按鈕之前。

**樣式**:`btn btn-ghost`,圖示 `⚠️`,文字「回報此題有誤」,對齊既有按鈕樣式。

**範例**(視覺示意):
```
┌─────────────────────────────────────┐
│ ✅ 答對! / ❌ 答錯了                  │
│ ─────────────────────────────────   │
│ 📚 正確答案 ...                      │
│ 💡 記憶口訣 ...                      │
│ ⚠️ 此題常見誤解 ...                  │
│ ─────────────────────────────────   │
│ [繼續下一題 →] [⚠️ 回報此題有誤]     │
│ [🎯 立即下鑽] [回首頁]               │
└─────────────────────────────────────┘
```

### 1.2 點擊行為:Inline Form(非 modal)

**理由**:Modal 會打斷答題節奏;inline form 在 explanation 下方就地展開,點擊「取消」可立即收回,使用者體驗較順。

**展開後 UI**:

```
┌─ 回報此題有誤 ────────────────────┐
│ 請勾選錯誤類型(可複選):           │
│ □ 題目選項與題幹不一致             │
│ □ 正解錯誤                         │
│ □ 計算題 explanation 數字對不上    │
│ □ 錯解 explanation 不正確          │
│ □ 知識點 / 編碼分類錯誤             │
│ □ 內容超出 IPAS 中級範圍            │
│ □ 其他(請於備註說明)              │
│                                   │
│ 備註(選填):                      │
│ ┌──────────────────────────────┐  │
│ │ λ 數字對不上...              │  │
│ │                              │  │
│ └──────────────────────────────┘  │
│                                   │
│ [✅ 提交回報] [取消]                │
└──────────────────────────────────┘
```

### 1.3 提交後反饋

- 顯示 toast:「✅ 已記錄回報,匯出後可分享給開發者」
- 收回 form,按鈕變為「✅ 已回報」(disabled,但可點擊「展開查看」)
- 若同一題重複點開,form 預先勾選上次回報的選項(可修改後再次提交,覆蓋舊紀錄)

### 1.4 首頁新增「📤 匯出錯誤回報」按鈕

**位置**:首頁第一張卡片(`📘 IPAS AI 中級 — 衝刺練習場`)的進度條下方,或新增獨立卡片。

**行為**:
- 若無回報資料,按鈕顯示「📤 匯出錯誤回報(0 筆)」並 disabled
- 若有回報資料,顯示「📤 匯出錯誤回報(N 筆)」
- 點擊後直接觸發瀏覽器下載 `ipas-error-reports-YYYYMMDD-HHMMSS.json`
- 下載後不清空 localStorage(使用者可能想再匯出一次,需手動點「清除已匯出回報」)

### 1.5 首頁新增「🚨 最常被回報的題目 Top 5」區塊

**位置**:現有「📊 弱點 Top 5」區塊下方,新增獨立卡片。

**內容**:
- 排序依據:`wrongCount + reportCount * 2`(回報權重較高,因為主動回報意味著使用者已注意到問題)
- 顯示前 5 題:題號、題目前 60 字、wrongCount、reportCount、回報類型摘要
- 若都未回報且未答錯,顯示「🎉 目前無異常題目」

### 1.6 (Phase 2 可選)開發者匯入工具

**形式**:獨立 HTML(`tools/error-report-viewer.html`)或在 `view-stats` 加 import 按鈕
**功能**:讀取 JSON,以表格列出每筆回報,可篩選 / 排序 / 標記「已修補」
**優先順序**:本次 Phase 1 不做,先做匯出即可

---

## 2. 資料結構(Data Schema)

### 2.1 localStorage Key
- Key: `ipas_error_reports_v1`
- 與既有 keys(`ipas_progress_v1` / `ipas_mastery_v1` / `ipas_wrongbook_v1`)同前綴 + 版本號

### 2.2 完整 JSON Schema

```json
{
  "version": "1.0",
  "generated_at": 1746834567890,
  "device_info": {
    "ua": "Mozilla/5.0 ...",
    "lang": "zh-TW"
  },
  "reports": [
    {
      "qid": "q_0025",
      "ts": 1746834567890,
      "types": [
        "stem_options_mismatch",
        "calc_inconsistent"
      ],
      "note": "λ 數字對不上,題幹說 0.5 但 explanation 算 0.3",
      "context": {
        "stem_excerpt": "某 NLP 系統的 λ 平滑參數設為 0.5,...",
        "user_choice": "B",
        "user_choice_text": "0.5",
        "correct_choice": "D",
        "correct_choice_text": "0.3",
        "is_correct": false,
        "rendered_options": ["0.1", "0.5", "0.7", "0.3"],
        "knowledge_code": "L21102",
        "node_id": "n_L21102_003",
        "format": "calculation",
        "case_used": "case_1"
      },
      "report_count": 1
    }
  ]
}
```

### 2.3 錯誤類型 Enum

| Code | 中文標籤 | 說明 |
|:--|:--|:--|
| `stem_options_mismatch` | 題目選項與題幹不一致 | 題幹講 A,選項全是 B 的選項 |
| `wrong_answer` | 正解錯誤 | 標記為正解的選項其實是錯的 |
| `calc_inconsistent` | 計算題 explanation 數字與 stem 對不上 | 案例 8 復發風險 |
| `wrong_explanation_wrong` | 錯解 explanation 不正確 | 解錯選項的解析說錯了 |
| `category_mismatch` | 知識點 / 編碼分類錯誤 | knowledge_code / node_id 不對 |
| `out_of_scope` | 內容超出 IPAS 中級範圍 | 違反鐵律 #5 |
| `other` | 其他 | 必須搭配 note 自由文字說明 |

### 2.4 重複回報處理

- 同一 `qid` 只保留**最新一筆**(覆蓋舊的)
- 但保留 `report_count` 欄位累計回報次數,用於 Top 5 排序
- `ts` 永遠記錄最新一次回報時間

### 2.5 容量規劃

- 假設 325 題全部回報,每筆平均 1KB → 325KB,遠低於 localStorage 預設 5-10MB 上限
- 風險低,無需 LRU 淘汰機制

---

## 3. 共用層 API 設計

### 3.1 ErrorReports 物件(新增)

```js
const ErrorReports = {
  K_REPORTS: 'ipas_error_reports_v1',
  load() { return Storage.get(this.K_REPORTS, []); },
  save(arr) { Storage.set(this.K_REPORTS, arr); },

  // 新增 / 更新一筆回報(若 qid 已存在則覆蓋,但累加 report_count)
  add(qid, types, note, context) { ... },

  // 取得某題的最後一筆回報(用於 form 預先勾選)
  get(qid) { ... },

  // 全部回報數(用於匯出按鈕的 N)
  count() { ... },

  // Top N 被回報題目(用於首頁 Top 5)
  top(n) { ... },

  // 觸發 JSON 檔下載
  export() { ... },

  // (可選)清空所有回報
  clear() { ... }
};
```

### 3.2 PlayEngine 改動點

只動 `showExplanation` 一處,加渲染按鈕 + 加 inline form template。

### 3.3 Mode1/2/5 改動點(關鍵!)

**坑點警告**:Mode1/2/5 各自實作了 `showExplanation`,**不是用 PlayEngine.showExplanation**。如果只改 PlayEngine,這 3 個 mode 不會出現「回報」按鈕。

**解法**:在共用層加 helper function `renderErrorReportButton(qid, contextData)`,讓 Mode1/2/5 在自己的 explanation HTML 裡呼叫此 helper 字串拼接。

```js
// 共用層 helper
function renderErrorReportSection(q, opt, isCorrect) {
  // 回傳 HTML 字串,可直接拼到 actions 區塊
  return `<button class="btn btn-ghost" onclick="ErrorReports.openForm('${q.id}', this)">⚠️ 回報此題有誤</button>
          <div id="er-form-${q.id}" class="er-form" style="display:none"></div>`;
}
```

Mode1/2/5 只需在自己的 actions 區塊加一行 `${renderErrorReportSection(q, opt, isCorrect)}`,改動量極小(每 mode 約 1 行)。

---

## 4. 整合風險與規範

### 4.1 五鐵律檢查

| 鐵律 | 影響 | 對策 |
|:--|:--|:--|
| #1 錯題下鑽 | 不影響(僅加按鈕,不改答題流程) | — |
| #2 題庫動態 | 不影響(回報儲存的是 rendered case,不影響原題) | 在 context 內記錄 `case_used` 供開發者重現 |
| #3 不複製原題 | 不影響 | — |
| #4 選項長度均衡 | 不影響 | — |
| #5 來源忠實 | 加強(回報機制是鐵律 #5 的人工後備防線) | 回報結果可加入 audit 流程 |

### 4.2 已知盲點預防

- **盲點 1**:回報按鈕本身會不會干擾既有 onClick handler?
  → 不會。按鈕是新增的,且 form 是 lazy 渲染(點擊才生成),不影響其他 DOM
- **盲點 2**:DrillSession 中也會出現回報按鈕嗎?
  → 是,DrillSession 也是 PlayEngine.show 的呼叫者,行為一致;**這是好事**,使用者下鑽時也可能發現變化型的問題
- **盲點 3**:重複點擊提交按鈕會不會雙寫?
  → 提交後立即 disable button + 用 `ts` 比對若距上次 < 1s 則忽略
- **盲點 4**:離線環境(無 fetch)能用嗎?
  → 完全可以,localStorage 是同步 API,純 client-side
- **盲點 5**:使用者清除瀏覽器資料會丟失回報?
  → 是,但這是設計取捨(無後端)。匯出按鈕讓使用者主動備份

### 4.3 Edge Cases

- [ ] 同一題在不同 mode(Mode1 戰鬥 vs Review 復習)被回報,以最後一次為準
- [ ] 第一次回報 → form 空白;第二次回報 → form 預填上次選項
- [ ] 沒勾任何 type 也沒填 note → submit 按鈕 disable
- [ ] 只填 note 不勾 type → 視為 `types: ['other']`
- [ ] qid 為空(理論上不該發生)→ console.error + showToast 提示
- [ ] localStorage 寫入失敗(quota exceeded)→ try/catch + showToast「儲存空間不足,請先匯出舊回報」

---

## 5. 隱私與授權

- **完全本機**:不發任何 HTTP request,沒有 telemetry,沒有 analytics
- **匯出可控**:JSON 檔不含個資(無使用者 ID、無 email);僅 device_info 包含 UA 和 lang(可在匯出時讓使用者選擇是否包含)
- **不影響 LICENSE**:此功能屬程式碼層,沿用 MIT;不涉及 questions content,不影響 CC BY-NC-SA

---

## 6. 實作優先順序與分階段

### Phase 1(本次設計範圍)
1. ✅ 寫此 spec(`docs/error-report-spec.md`)
2. ✅ 寫 patch 草案(`docs/error-report-patches.md`)
3. ⏳ 使用者 review spec
4. ⏳ 派 sub agent 實作(共用層 + Mode1/2/5)

### Phase 2(後續可選)
- 匯入工具(`tools/error-report-viewer.html`)
- 回報資料納入 audit 流程(自動把 `wrong_answer` / `calc_inconsistent` 類別的回報觸發 audit script 重跑)
- 回報 dashboard(分類統計、時間趨勢)

---

## 7. 驗收標準

| 項目 | 標準 |
|:--|:--|
| UI 出現位置 | PlayEngine.showExplanation + Mode1/2/5 explanation 區塊 |
| Form 互動 | 勾選複選框 + 自由 textarea + 提交/取消 |
| 儲存正確性 | localStorage `ipas_error_reports_v1` 結構符合 §2.2 |
| 重複回報 | 覆蓋舊紀錄,累加 report_count |
| 匯出檔 | 有效 JSON,包含 version + reports |
| 首頁 Top 5 | 依 wrongCount + reportCount * 2 排序 |
| 鐵律不退步 | audit-option-length / audit-source-fidelity 全 PASS |
| 跨 mode 一致 | Mode1/2/3/4/5/Review 全部能用 |
| `node -c` 通過 | index.html + modes/*.js 語法檢查 |

---

## 8. 修訂歷史

| 日期 | 版本 | 變更 |
|:--|:-:|:--|
| 2026-05-10 | v0 | 初版設計(觸發:q_0025 數字不一致疑慮) |
