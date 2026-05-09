# 計畫與決議紀錄

本檔留存各階段的關鍵決議、阻擋處置、風險登記。/clear 後讀此檔可恢復脈絡。

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

### 階段 0 產出
- 目錄:`kb/`、`src/`、`docs/`(各帶 .gitkeep)
- 檔案:`.gitignore`、`docs/progress.md`、`docs/plan.md`(本檔)、`CHANGELOG.md`、`README.md`(殼)
- Git:init -b main + remote origin → marco3939/ipas-ai-game
- Commit:`chore: scaffold project structure`
- **暫不 push**(階段 8 才推送)
