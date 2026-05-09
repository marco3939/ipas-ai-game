# 詳細設計文件 — 階段 5

> 產出於 2026-05-09
> **此檔需使用者人工確認後方可進階段 6**
> 鐵律 #1 全程約束:錯題解釋 + 變化型 + 下鑽 + 個人化錯題本

---

## 1. 整體架構

### 1.1 部署模式
- **單頁應用(SPA)**,單檔 `src/index.html` + `style.css` + `script.js`(可拆分為多 JS 模組)
- 本機啟動:`python -m http.server 8000`,開 `http://localhost:8000`
- **無外部 CDN**(自含所有依賴)
- localStorage 為唯一持久層,無後端
- 響應式:Mobile First,手機 → 平板 → 桌機

### 1.2 技術選型
- 原生 JS(ES2022+),不依賴 React/Vue/任何框架
- CSS 採 CSS Variables + Flex/Grid,無 framework
- 字型:`system-ui` fallback,中文 `Noto Sans TC` system fallback
- 無 build step(直接寫 .js 檔)

### 1.3 模組組織
```
src/
├─ index.html              # 入口 + 路由
├─ style.css               # 全域樣式 + 主題
├─ js/
│  ├─ app.js               # 主控制器、路由
│  ├─ data/
│  │  ├─ questions.json    # 題庫(階段 6 產出)
│  │  ├─ nodes.json        # 知識節點(merged from kb/)
│  │  └─ exam-config.json  # 考試日、權重、分布
│  ├─ core/
│  │  ├─ storage.js        # localStorage 包裝
│  │  ├─ progress.js       # 進度系統
│  │  ├─ wrongbook.js      # 錯題本
│  │  ├─ mastery.js        # 熟練度系統
│  │  ├─ variation.js      # 變化型生成器
│  │  └─ countdown.js      # 距考試倒數
│  ├─ ui/
│  │  ├─ home.js           # 首頁(模式選擇 + 統計)
│  │  ├─ result.js         # 結算頁
│  │  ├─ review.js         # 錯題回顧 + 下鑽
│  │  └─ stats.js          # 弱點分析
│  └─ modes/
│     ├─ mode4-pairing.js  # 案 4 易混淆配對
│     ├─ mode2-code.js     # 案 2 程式判讀
│     ├─ mode5-hunter.js   # 案 5 弱點獵人
│     ├─ mode1-rpg.js      # 案 1 AI 顧問
│     └─ mode3-pipeline.js # 案 3 Pipeline 拼圖
└─ assets/
   └─ icons/               # 內嵌 SVG / Emoji
```

---

## 2. 畫面流程(共用)

```
┌─────────────────────────────────────────┐
│  首頁 Home                              │
│  ├─ 距考試倒數(置頂大字 D-14)         │
│  ├─ 整體進度條(% 知識點熟練)          │
│  ├─ 熱門弱點 Top 3                      │
│  ├─ 5 案模式入口卡(已解鎖/未解鎖)     │
│  └─ 錯題本入口(顯示未復習數)          │
└─────────┬───────────────────────────────┘
          │ 選模式
          ▼
┌─────────────────────────────────────────┐
│  模式中介 Mode Intro                    │
│  ├─ 該案說明                            │
│  ├─ 該案內弱點熱點                      │
│  └─ 開始按鈕                            │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│  Play 答題中                            │
│  ├─ 題目 + 選項                         │
│  ├─ 提示按鈕(消耗熟練度,顯示 hint)   │
│  ├─ 進度(本場 N/M)                    │
│  └─ 暫停按鈕                            │
└─────────┬───────────────────────────────┘
          │ 答完一題
          ▼
┌─────────────────────────────────────────┐
│  即時解釋頁(鐵律 #1)                  │
│  ├─ 對 / 錯標示                         │
│  ├─ explanation(從 node 取材)         │
│  ├─ misconceptions 提示                 │
│  ├─ related_node_ids 提示              │
│  └─ 三選一:                            │
│     ├─ [繼續下一題]                    │
│     ├─ [立即下鑽 → 變化型挑戰]         │
│     └─ [加入錯題本(自動,可標記)]   │
└─────────┬───────────────────────────────┘
          │ 完成本場
          ▼
┌─────────────────────────────────────────┐
│  結算 Result                            │
│  ├─ 本場分數 + 正答率                   │
│  ├─ 熟練度變化                          │
│  ├─ 新增錯題                            │
│  ├─ 推薦下鑽路徑(自動演算)             │
│  └─ 三選一:                            │
│     ├─ [回首頁]                         │
│     ├─ [挑戰錯題下鑽]                   │
│     └─ [再來一場]                       │
└─────────────────────────────────────────┘
```

### 下鑽流程(鐵律 #1 核心)
```
答錯一題 → 加入錯題本
  ↓
立即下鑽 OR 結算後下鑽
  ↓
進入「變化型訓練」
  ↓ 系統根據 variation_seeds + related_node_ids
生成 3-5 道同知識點變化型(換情境/換陷阱)
  ↓
全部答對 → 該節點熟練度 +20%
  ↓
若仍錯 → 強制再生成,直到答對
```

---

## 3. 資料結構

### 3.1 questions.json(階段 6 產出 schema)
```json
{
  "version": "1.0",
  "generated_at": "2026-05-XX",
  "based_on_nodes": 87,
  "questions": [
    {
      "id": "q_0001",
      "knowledge_code": "L23303",
      "node_id": "n_L23303_002",
      "subject": 3,
      "category": "formula",
      "difficulty": "easy|medium|hard",
      "source_level": "L1|L2|L3|L4",
      "format": "single_choice|code_reading|matching|sequence|calculation",
      "stem": "Recall 的正確公式為?",
      "options": [
        {"key": "A", "text": "TP/(TP+FP)", "is_correct": false, "trap_type": "與 Precision 混淆"},
        {"key": "B", "text": "TP/(TP+FN)", "is_correct": true, "trap_type": null},
        {"key": "C", "text": "TP/(FN+TN)", "is_correct": false, "trap_type": "分母錯誤組合"},
        {"key": "D", "text": "TP/(FP+FN)", "is_correct": false, "trap_type": "分母錯誤組合"}
      ],
      "explanation": {
        "correct_reason": "Recall 衡量『真為正中被找出的比例』,分母為實際正例 = TP + FN",
        "wrong_reasons": {
          "A": "此為 Precision 公式,Precision 看『預測為正中真為正』",
          "C": "FN+TN 並非任何標準指標分母",
          "D": "FP+FN 並非任何標準指標分母"
        },
        "memory_hook": "Recall 看『實際』(分母含 FN);Precision 看『預測』(分母含 FP)"
      },
      "misconceptions": ["把 Precision 與 Recall 公式互調", "Recall 分母誤記為 TP+FP(原 PDF 錯誤)"],
      "related_node_ids": ["n_L23303_001", "n_L23303_004"],
      "variation_seed_id": "v_recall_001",
      "errata_critical": true,
      "exam_appearance": [{"exam": "114-2", "question_no": 16, "subject": 3}],
      "tags": ["評估指標", "混淆矩陣", "公式"]
    }
  ]
}
```

### 3.2 localStorage Schema
```json
{
  "ipas_progress_v1": {
    "user_id": "local_only",
    "started_at": "2026-05-09T10:00:00Z",
    "exam_date": "2026-05-23",
    "total_play_seconds": 12345,
    "sessions_count": 23
  },
  "ipas_mastery_v1": {
    "n_L23303_002": {
      "score": 85,
      "attempts": 7,
      "correct": 6,
      "last_seen": "2026-05-15T11:30:00Z",
      "streak": 3,
      "needs_drill": false
    }
  },
  "ipas_wrongbook_v1": [
    {
      "question_id": "q_0001",
      "node_id": "n_L23303_002",
      "wrong_at": "2026-05-10T20:15:00Z",
      "wrong_count": 2,
      "user_choice": "A",
      "correct_choice": "B",
      "tagged": "high_priority",
      "drill_count": 0,
      "mastered": false
    }
  ],
  "ipas_session_state_v1": {
    "current_mode": "mode5",
    "current_question_idx": 4,
    "score": 12,
    "started_at": "2026-05-15T11:00:00Z"
  },
  "ipas_settings_v1": {
    "theme": "auto|light|dark",
    "font_size": "normal|large",
    "sound_effects": true,
    "auto_drill_threshold": 90
  }
}
```

### 3.3 熟練度演算
- 初始 `score = 0`
- 答對 +10(連對 streak: +15、+20、+25)
- 答錯 -5
- 變化型全對 +20(下鑽獎勵)
- `score >= 90` → mastered = true,不再優先出題
- `score < 60` → needs_drill = true,弱點優先

---

## 4. 統計與弱點分析(首頁 + Stats 頁)

### 首頁卡片
```
[D-14 距考試倒數]
今天 已熟練 47 / 87 (54%)
弱點 Top 3:
  1. n_L23303_002 Recall 公式(熟練度 25%)
  2. n_L21203_001 PDPA 六項(熟練度 30%)
  3. n_L23202_002 DBSCAN 三類點(熟練度 40%)

[本週統計]
作答 156 題 / 正答率 72%
新增錯題 23 題 / 已下鑽 18 題
```

### Stats 頁(深度分析)
- 各編碼熟練度雷達圖(用 SVG 畫,無外部 lib)
- 答題歷史時序圖
- 錯題類型分布(misconceptions 群組)
- 今日推薦下鑽路徑

---

## 5. 響應式設計

| 斷點 | 寬度 | 設計 |
|:--|:--|:--|
| Mobile | < 600px | 單欄 / 大按鈕 / 隱藏次要資訊 |
| Tablet | 600–1024px | 雙欄 / 側邊統計 |
| Desktop | > 1024px | 三欄 / 完整 stats |

互動:Touch + Mouse + Keyboard 三方支援(配對戰可鍵盤快速操作)。

---

## 6. 五案模式各自設計細節

### 案 4:易混淆配對戰
- **UI**:左右兩列卡片,點擊 → 配對
- **題型**:14 組已預設(L1↔L2、Skip-gram↔CBOW...)
- **計時**:60 秒挑戰模式 + 無限模式
- **變化型**:同概念換包裝(如 L1 不只「稀疏」描述,還有「特徵選擇」「絕對值懲罰」)

### 案 2:程式判讀道場
- **UI**:程式碼塊(等寬字)+ 4 選項
- **題型**:
  - 給程式問輸出
  - 給程式問概念對應
  - 給概念問正確程式
- **連戰**:VGG16 4 連題、Titanic 3 連題作為「Boss 連戰」
- **變化型**:換變數名、換函式、換選項陷阱

### 案 5:弱點獵人(鐵律最徹底)
- **UI**:暗色調、緊張感、進度條
- **演算**:
  - 排序所有 87 nodes 之熟練度
  - 從最弱 Top 5 隨機抽
  - 該題答對:該 node 加分
  - 該題答錯:加 3 個變化型強制連戰直到對
  - 達 90% 解鎖下個 Boss
- **Boss**:5 個 errata_critical + 7 個高優先預測 = 12 個 Boss
- **變化型**:從 variation_seeds 動態取

### 案 1:AI 顧問實驗室
- **UI**:對話框 + 角色頭像(SVG)+ 情境圖示
- **任務集**:12 個產業任務(電商/金融/醫療/自駕/...)
- **每任務**:5–8 道情境決策題
- **解鎖**:過關得徽章,案 5 弱點獵人會優先用該情境

### 案 3:Pipeline 拼圖工坊(技術最複雜,可延後)
- **UI**:HTML5 Drag and Drop API
- **題庫**:6 個情境的 pipeline(各 5–8 步驟)
- **驗證**:嚴格順序 + 容許部分順序
- **MVP 簡化**:若時程緊迫,降級為「點擊排序」(無拖拉),仍滿足鐵律

---

## 7. 距考試倒數(置頂)

```
[首頁頂端永遠顯示]
距 IPAS AI 中級鑑定:剩 14 天 (D-14)
已準備:54%
今日建議目標:做 30 題 + 下鑽 5 個錯題
```

倒數計算:`Date('2026-05-23T00:00:00') - Date.now()` → `Math.ceil(ms / 86400000)`

---

## 8. 實作優先序與里程碑

| 里程碑 | 內容 | 預估 |
|:--|:--|:-:|
| M1 | 共用基礎層(localStorage、進度、倒數、首頁殼) | 4-6h |
| M2 | 案 4 + 端到端流程驗證(可上線最小單元) | 1-2h |
| M3 | 案 2 + 案 5 | 4-6h |
| M4 | 案 1 RPG 情境 | 3-4h |
| M5 | 案 3 Pipeline(若時間不足可延 / 降級) | 4-6h |
| M6 | 整合測試 + 響應式微調 + 部署 | 2-3h |

---

## 9. 鐵律 #1 合規最終檢查

| 項 | 實現位置 |
|:--|:--|
| 每題必有解釋 | `questions.json` 之 `explanation` 欄位(含 correct_reason / wrong_reasons / memory_hook) |
| 錯題可生成變化型 | `variation.js` 從 `variation_seeds` 動態生成 |
| 下鑽學習路徑 | 即時解釋頁「立即下鑽」按鈕 + 結算頁推薦下鑽 |
| 個人化錯題本 | localStorage `ipas_wrongbook_v1` + 案 5 弱點獵人 |

---

## 10. 待使用者確認(進階段 6 前)

- [ ] 整體 SPA 架構(單檔多模組)接受
- [ ] localStorage schema(含 mastery、wrongbook、settings)接受
- [ ] 5 案實作順序(案 4 → 2 → 5 → 1 → 3)接受
- [ ] 案 3 若時程緊迫可降級為「點擊排序」接受
- [ ] 響應式 Mobile First 接受
- [ ] 主題:暗色為主 + 自動切換 / 全暗色 / 全亮色 → **請選**
- [ ] 字型:system-ui fallback / Noto Sans TC → **請選**

---

## 11. 風險登記

| # | 風險 | 影響 | 對策 |
|:-:|:--|:--|:--|
| R6 | 案 3 Pipeline 拖拉介面複雜 | 時程吃緊 | 降級為點擊排序,仍滿足鐵律 |
| R7 | localStorage 容量限制(5MB) | 大量錯題後可能溢出 | 老錯題自動歸檔 |
| R8 | 變化型生成器演算法品質 | 變化型可能與原題太像 | 採用「換情境 + 換陷阱選項」雙因子變化 |
| R9 | 行動裝置 iOS Safari 兼容 | 部分 ES2022 功能可能失敗 | 保守只用 ES2018 語法 |
| R10 | 案 5 熟練度演算冷啟動 | 新使用者所有 node 都 0 分,選題隨機 | 首次提供「快速診斷 20 題」決定起點 |
