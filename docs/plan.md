# 計畫與決議紀錄

本檔留存各階段的關鍵決議、阻擋處置、風險登記。/clear 後讀此檔可恢復脈絡。

---

## 🔴 專案級設計鐵律(跨階段強制遵守)

### 鐵律 #2:題庫動態化(2026-05-09 確認)

**規範**:
1. 題庫不應為「固定 N 題」,每場遊戲必須**可隨機變動**
2. 每知識點有多個基礎模板 + 變數池(`{industry}`、`{context}`、`{descriptor}` 等)
3. 選項洗牌(每場 ABCD 順序不同)
4. 變化型在執行時動態生成,不依賴預存固定變化
5. 每場遊戲使用新隨機種子,確保連續遊玩不重複

**Why**:防止使用者「死記題目」而非「理解概念」,符合臨場考試之多樣性

**How to apply**:
- 階段 6 questions.json schema 升級為「模板 + 變數池」結構
- 階段 7 script.js 內建 `randomizer.js`、`variation.js`、`shuffler.js`
- 每場遊戲:`seed = Date.now()` → 從模板池抽樣 → 變數替換 → 選項洗牌 → 渲染

### 鐵律 #1:錯題驅動下鑽學習(2026-05-09 確認)

**規範**:
1. **每題必有完整解釋**:不只「正確答案」,還要解釋「為什麼錯選項錯」
2. **錯題可生成變化型**:同一 knowledge node 的不同包裝、情境、陷阱位置
3. **下鑽學習路徑**:答錯後可選擇「針對此錯題深入」,進入該知識點變化型題目連續訓練模式
4. **個人化錯題本**:錯題本不只記錄,而是驅動後續學習;熟練度系統追蹤每題正確率

**Why**:使用者明確指示為遊戲鐵律,違反此鐵律即遊戲設計失敗

**How to apply**(各階段必須):
- **階段 3(知識抽取)**:每節點必須抽「常見誤區 / 易錯點 / 解釋鉤點 / 變化型生成提示」欄位
- **階段 4(遊戲方案)**:5 案必須**全部具備**錯題下鑽機制,否則該案淘汰
- **階段 5(詳細設計)**:UI 流程必須包含「錯題 → 解釋 → 變化型挑戰 → 下鑽」之 review mode
- **階段 6(題庫生成)**:每題必加 `explanation`、`misconceptions`、`related_node_ids`、`variation_seed_id`
- **階段 7(網站)**:錯題本 + 變化型生成器 + 熟練度追蹤皆為 MVP 必要功能

---

## 階段 0:環境核對與目錄建構(2026-05-09)

### 環境核對
- **既有教材**:
  - 01指引/(5 PDF,15.8 MB)
  - 02歷年考題/(3 PDF,2.6 MB)
  - 03參考資料/(10 檔,146.8 MB)
- **格式分布**:13 PDF + 2 PPTX + 1 MD,5 檔超過 20 MB
- **樣本限制**:歷年考題僅 114-2(1 次),題型權重統計信賴區間將偏寬

### Q1 決議:來源合法性
- 「iPAS初級AI規劃師證照班-全文講義版(解密).pdf」
- 使用者確認 **(a) 為合法授權教材,僅檔名誤導**
- 處理:納入,但題庫產出僅以 [L2] 改編形式呈現,不直接複製原文

### Q2 決議:授權選擇
- 採 **(c) 雙軌**:程式碼 MIT + 題庫 CC BY-NC-SA 4.0
- LICENSE 檔於**階段 8** 才實際建立

### Q3 決議:Git 使用者識別
- 全域 config 已設:`user.name=Marco Lin` / `user.email=marcolin.888@gmail.com`
- 沿用全域,**不在 local repo 設置覆寫**

### Q4 決議:GitHub Repo 現況
- **(a) 已建立空 repo**(無 README/LICENSE/.gitignore 初始檔)
- 階段 8 push 可直接乾淨推送,無需 pull/rebase

### 環境意外:Git Repo 範圍誤定義
- 發現 `C:\Users\marco\.git/` 為**空殼 repo**(0 commit, 0 branch, 0 remote)接管整個 home 目錄
- 直接在原位置 `C:\Users\marco\Documents\Claude\Projects\ipas-ai-game` 內 commit 將洩漏整個 home 內容(包含 .ssh、.claude.json 等)
- **處置**:不動 home `.git/`(留作不影響),將專案內容搬到 `C:\Users\marco\.ipas-ai-game`,在新位置 init 獨立 repo
- 舊位置留 `README-MOVED.txt` 指引,空殼保留(可逆)

### 風險登記
| 編號 | 風險 | 對策 |
|:--|:--|:--|
| R1 | 歷年考題樣本僅 1 次,題型權重信賴區間寬 | 階段 2 報告明示樣本限制,權重以「示意」呈現 |
| R2 | 巨型 PDF(20–42 MB)抽取耗 token | 階段 3 強制單檔單批 + /clear |
| R3 | 科二 / 科一∩科三 邊界 | 階段 1 三欄對照表強制人工審視 |
| R4 | PPTX 巨檔(16 MB)圖文混排難解析 | 階段 3 進場前先試解析,失敗則降級為純文字摘錄 |
| R5 | iPAS 初級講義(42 MB)為「初級」資料 | 階段 3 抽取時須加 [L4] 標註「初級資料,中級難度需另行驗證」 |

### 階段 3 後續行動(Q2 OCR 補強,2026-05-09)

使用者選擇 (b) 安裝 OCR 工具補抽漫畫科一/科三 + 初級講義。

**建議安裝順序**(階段 4 後同步進行,不阻擋主流程):
```powershell
# 1. 安裝 Tesseract OCR
winget install UB-Mannheim.TesseractOCR
# 或下載安裝:https://github.com/UB-Mannheim/tesseract/wiki

# 2. 安裝中文語言包(繁中)
# Tesseract 安裝時勾選 chi_tra(繁體中文)+ chi_tra_vert(直書)

# 3. 安裝 Python 套件
py -3.13 -m pip install pytesseract pdf2image Pillow
# pdf2image 需要 poppler:https://github.com/oschwartz10612/poppler-windows

# 4. 測試
py -c "import pytesseract; print(pytesseract.image_to_string(Image.open('test.png'), lang='chi_tra'))"
```

**處理時程預估**:
- 漫畫科一(20 頁)+ 漫畫科三(15 頁):OCR 約 5–10 分鐘 / 檔
- 初級講義(543 頁):OCR 約 30–60 分鐘
- 抽 nodes:每檔 15–30 分鐘

**評估標準**:
- 中文 OCR 準確度通常 85–95%(漫畫排版可能更低)
- 若漫畫 OCR 結果雜亂無章 → 放棄,維持現狀
- 若可讀性 ≥ 90% → 抽 nodes 補 nodes-subject-1-ocr.json / nodes-subject-3-ocr.json

**何時做**:
- 階段 4 5 案提案完成後,使用者選定方案
- 階段 5 詳細設計時或階段 6 題庫生成前空檔
- 不阻擋階段 4-7 主流程

### 階段 0 產出
- 目錄:`kb/`、`src/`、`docs/`(各帶 .gitkeep)
- 檔案:`.gitignore`、`docs/progress.md`、`docs/plan.md`(本檔)、`CHANGELOG.md`、`README.md`(殼)
- Git:init -b main + remote origin → marco3939/ipas-ai-game
- Commit:`chore: scaffold project structure`
- **暫不 push**(階段 8 才推送)
