# 版權/授權合規審查報告(Public 上架前)

**審查日期**: 2026-05-10
**目標 commit**: `9cd0052` (chore: add start-server.bat for one-click local server)
**審查範圍**: marco3939/ipas-ai-game(即將改 public + GitHub Pages)
**審查者**: Claude (Opus 4.7)
**審查方法**: 靜態檔案掃描 + 抽樣 20 題 + 與 114-2 真題 PDF 逐字比對 + 第三方依賴授權查證(WebFetch + npm package.json)

---

## 結論

- [ ] PASS 可改 public
- [x] **CONDITIONAL** + 建議事項
- [ ] FAIL 需修補

**最大風險(P0)**:**鐵律 #3「不複製 114-2 原題」實質上有違反**。在 44 題自承「exam_appearance: 114-2」的題目中,經逐字比對,**至少 6 題**(q_0028、q_0033、q_0046、q_0035、q_0017、q_0030)的 stem 主幹 + 選項與 114-2 真題達到「壓縮逐字複製」程度,僅做了去除括號補充說明、合併情境句、選項用字微調等表面改動,未做「情境/數字/角度」的實質改寫。此違反:

1. **內部鐵律 #3**(全原創跨產業情境)
2. **官方 114-2 試題著作權**(雖屬公告試題,但未經經濟部產業發展署授權,仍受著作權保護)
3. **README 第 17 行**「不複製 114-2 原題:全原創跨產業情境」之公開承諾(可能構成消費者誤導)

**第二風險(P0)**: GSAP 3.12.5 雖然「免費商用」,但其授權書面條款是 **GreenSock Standard No Charge License**(非 MIT)。本專案目前 README 致謝段未列出 GSAP 的 license 名稱與商業限制條款。CC BY-NC-SA 4.0 與 GSAP No Charge 兩個條款並存無直接衝突,但本專案的衍生作品(下游用戶 fork)若做出「視覺動畫無程式碼建構工具」競爭 Webflow 將觸法。**建議在 NOTICE / README 加註**。

**第三風險(P1)**: README 標示 canvas-confetti 為 "MIT",但官方 LICENSE 與 npm package.json 均為 **ISC**(雖然兩者實質等價,但公開揭露不準確需修正)。

**良好項目**:
- LICENSE 雙軌(MIT for code / CC BY-NC-SA 4.0 for content)結構清晰、無實質衝突。
- `01指引/ 02歷年考題/ 03參考資料/` 在 `.gitignore` 中,git history 從未追蹤過(已驗證)。
- 字體使用 system-ui + 開源 fallback(Noto Sans TC、Cascadia Code、JetBrains Mono),無 Font Awesome / Material Icons / Google Fonts CDN 引用。
- Emoji 使用 Unicode 標準字元,免授權。
- `kb/scope.json` 等知識節點 source_refs 標註合理。

---

## A. LICENSE 雙軌完整性

### LICENSE(MIT for code)

- 內容**完整且法律有效**(Standard MIT 條文 + 自訂上半段適用範圍說明)。
- 適用範圍清楚:`src/index.html`、`src/modes/*.js`、`scripts/*.js / *.html` 與其他 JS/HTML/CSS 程式碼。
- 明確排除題庫(`src/questions*.json`)與知識庫(`kb/*.json`)。
- Copyright holder = "marco3939"(GitHub username,**非真名**),這是合適做法。

### LICENSE-CONTENT.md(CC BY-NC-SA 4.0 for content)

- 內容完整,包含:
  - 適用範圍清單(題庫 / kb / docs / 主提示詞)
  - 完整法律條文 URL(zh-Hant)
  - 摘要說明(可分享、需姓名標示、非商業、相同方式分享)
  - **不適用範圍說明**(明確指 `01指引/` 等教材不在版控、著作權歸經濟部 IPAS / 原出版單位)
- 文字寫得不錯,有清楚帶到「為何採用 CC BY-NC-SA 4.0」的脈絡(防止商業教培機構直接圈題販售)。

### README 授權揭露(第 158-164 行)

- 雙軌已揭露,項目分類清楚。
- 「商業授權請另洽作者」一句語意正確但缺**聯絡方式**(目前需透過 GitHub issues 或 commit history 找 email)。

### 雙軌衝突 / 灰色地帶

- **無實質衝突**。MIT(code)+ CC BY-NC-SA 4.0(content)的雙軌做法在開源領域有先例(如 OpenStreetMap 拆 ODbL data + MIT code)。
- **灰色地帶**: `index.html`(根目錄 redirect)在 LICENSE 中**未明確列出**。雖然合理推論為 MIT,但不在 LICENSE 第 6-9 行的列表內。**建議補正**(將 `index.html` 加入 MIT 適用範圍)。
- `scripts/audit-*.report.json` 是 audit 工具的輸出,屬於原創 metadata,目前歸類不明。**建議**:可歸到 MIT(因為是程式輸出而非考試內容)。

**小結**: A 段落 **PASS**,只有小幅補強建議。

---

## B. 題庫原創性審查(鐵律 #3)

### 樣本選取

從 17 個題庫檔(共 325 題)抽樣 20 題,規則:
- 8 題從帶 `exam_appearance: 114-2` 的 44 題中挑選最具代表性(stem 重疊度高的)
- 12 題從各檔(n1-n8、pa-ph、questions.json)均勻取一題

### 與 114-2 真題 PDF 逐字比對結果

審查依據:已讀完 114-2 第一科(50 題)+ 第三科(47 題)的官方公告 PDF 全文。

| 題庫 ID | 對應 114-2 題 | 重疊度評估 | 風險等級 |
|:--|:--|:--|:--|
| q_0007 | 第三科 Q.2 + Q.32 | stem 改寫(從問效果改為問選擇) | LOW |
| **q_0014** | 第三科 Q.19 | stem 後半「下列哪一種作法**最不適合**用於提升對少數類病例的預測能力」逐字、「正樣本(確診病例)僅佔 3%」逐字、未改數字未改情境 | **HIGH** |
| **q_0017** | 第三科 Q.26 | stem「不屬於降低模型複雜度或限制學習能力」逐字、4 選項與真題完全對應(Dropout/L1L2/Early Stopping/擴增特徵) | **MED-HIGH** |
| q_0018 | 第三科 Q.18 | XGBoost 改寫,選項 A 包含「正則化抑制過擬合,並支援缺失值自動處理與並行化訓練」逐字,但其他選項已重組 | MED |
| **q_0028** | 第三科 Q.7 | stem「下列哪一種應用最適合採用 LSTM 模型?」逐字壓縮(只把全名縮成簡寫);**4 個選項全部 verbatim** | **CRITICAL** |
| **q_0030** | 第三科 Q.15 | stem 主幹幾近逐字(「線性迴歸模型 R² 值為 0.85,其意義為何?」);選項擴展補充說明 | **MED-HIGH** |
| **q_0033** | 第三科 Q.9 | stem 與真題**完全相同**(只差「方式」二字) | **CRITICAL** |
| q_0034 | 第一科 Q.31 | stem 改寫(加數字 RPS=10000)、選項保留情境 | MED |
| **q_0035** | 第一科 Q.23 | stem 大幅 verbatim、4 選項**全部 verbatim** | **CRITICAL** |
| q_0036 | 第一科 Q.24 | stem 壓縮、選項用字微調但意思相同 | MED |
| q_0037 | 第一科 Q.30 | stem「不可否認性(Non-repudiation)」「為每筆推論記錄輸入與輸出之 Hash + 數位簽章」皆 verbatim | MED-HIGH |
| q_0042 | 第三科 Q.33 | stem 壓縮但情境與術語保留 | MED |
| **q_0046** | 第三科 Q.4 | stem 多處 verbatim、4 選項 verbatim(雜訊點/鄰近點/邊界點/潛在點) | **CRITICAL** |
| q_0049 | 第三科 Q.32 | stem 中度改寫,「自動篩選出較具代表性的特徵」「使部分特徵係數縮為 0」幾乎逐字 | MED |
| q_0021 | 第三科 Q.36 | stem 中度壓縮、「加密狀態下直接進行數值運算」逐字 | MED |
| q_0023 | 第一科 Q.35 | stem 壓縮複製,情境(媒體公司、CLIP)保留;選項擴寫術語 | MED |
| q_0025 | 第三科 Q.35 | stem 壓縮複製,數值 λ₁=6.0、λ₂=3.0、λ₃=1.0 完全相同;答案陳述差不多 | MED-HIGH |

#### 抽樣自批次新題庫(n1-n8、pa-ph)— 5 題均無問題

| 題庫 ID | 評估 |
|:--|:--|
| q_pa_007 | 完全原創(電商 KFold 程式碼推理) |
| q_pb_006 | 完全原創(Transformer Decoder 6 層延遲表) |
| q_pc_match_008 | 完全原創(Macro F1 配對戰) |
| q_pe_006 | 完全原創(U-Net/Mask R-CNN/SAM 三選擇) |
| q_pf_adv_s3_005 | 完全原創(半導體晶圓缺陷 RBF-SVM 超參調整) |
| q_pg_005 | 完全原創(三種時間序列 CV 比較) |
| q_n1_nlp_013 | 完全原創(自駕車對話介面) |
| q_n4_013 | 完全原創(連鎖超市 POC 計畫) |
| q_n6_012 | 完全原創(B2B 媒合平台 O(n²)) |

**新批次 197 題的鐵律 #3 抽樣未發現違反**。新題庫(8 個 sub agent 平行生成的)情境設計確實有換成跨產業情境(自駕車、半導體、零售、媒體、B2B 等),這部分**符合**鐵律 #3。

### grep 全題庫高風險 phrase 命中(從真題逐字抽取的句子)

```
"預測未來七天的電力需求變化趨勢"     -> q_0028 命中(LSTM 應用)
"辨識監視影像中不同類別的物件"       -> q_0028 命中
"將大量顧客資料依相似特徵自動分群"   -> q_0028 命中
"將高維度感測器資料壓縮成低維表示"   -> q_0028 命中
"雜訊點(Noise Point)"                -> q_0046 命中
"邊界點(Border Point)"               -> q_0046 命中
"潛在點(Potential Point)"            -> q_0046 命中
"在建構以距離為基礎的機器學習模型"   -> q_0033 命中(逐字)
"逐一比對每位客戶"                   -> q_0042 命中
"自動篩選代表性特徵"                 -> q_0049 命中
"PSI(穩定度)指數"                   -> q_0008 命中
"陷入局部最優解"                     -> q_0032 命中
"前 2 個主成分(累計 90%)"           -> q_0025 命中
"集成內的弱分類器"                   -> q_0018 命中
```

### 整體評估

- **44 題自承「exam_appearance: 114-2」中,約 6-10 題的改寫程度未達到鐵律 #3 的標準**。
- 改寫策略以「壓縮 stem 文字」「移除產業情境句」「術語簡寫」為主,**未做「情境/數字/角度」三選一的實質改變**。
- **CRITICAL 4 題**(q_0028、q_0033、q_0046、q_0035)實質為原題 minor edit,法律與道德上構成「直接複製」。
- **MED-HIGH 級 5-6 題**雖然不到逐字複製,但改寫深度不足,在嚴格審查下仍有風險。

### 建議

1. **P0(必修)**: 重做 q_0028、q_0033、q_0046、q_0035 這 4 題的 CRITICAL 級題目。具體方法:
   - q_0028 LSTM:換成「股價預測」「IoT 設備溫度時序」等不同情境,選項全部換成新場景。
   - q_0033 KNN/SVM 距離:加入產業情境(如「房價估價系統」「客戶分群推薦」),選項改寫更具體。
   - q_0046 DBSCAN:加入「物聯網異常偵測」「社群網路節點分類」等具體情境。
   - q_0035 醫院 Phased Rollout:換成「製造業 AI 良率系統」「金融 AML 系統」等不同產業 rollout 情境。
2. **P0(必修)**: 再嚴審 MED-HIGH 級 5-6 題(q_0014、q_0017、q_0030、q_0049、q_0037、q_0025),做更深度改寫。
3. **P1(建議)**: 重新運行 `audit-source-fidelity.js` 與 `audit-option-length.js`,確保新版本仍合規。
4. **P2(建議)**: 在 `kb/exam-patterns.json` 寫一條 review checklist,要求未來任何新題目寫作前必驗證:
   - stem 是否有 ≥10 個連續字元與 PDF verbatim?
   - 4 個選項是否與真題選項在語意上一一對應?
   - 情境名詞(產業、設備、機構類型)是否與真題完全相同?

---

## C. 第三方依賴授權

### GSAP 3.12.5(`gsap.min.js`)

- **授權**:**GreenSock Standard No Charge License**(非 MIT)
- **驗證來源**:
  - https://gsap.com/standard-license(官方)
  - `cdn.jsdelivr.net/npm/gsap@3.12.5/package.json` 的 `license` 欄位:`"Standard 'no charge' license: https://gsap.com/standard-license. Club GSAP members get more: https://gsap.com/licensing/. Why GreenSock doesn't employ an MIT license: https://gsap.com/why-license/"`
- **重要更正**:任務描述提到「GSAP 3.13+ 是 MIT」,**這是錯誤資訊**。經查 `gsap@3.13.0` 的 `package.json` 仍是 `Standard No Charge License`。GSAP 並沒有改 MIT 計畫,只是「對所有人免費」(2024 年由 Webflow 收購後變更政策)。
- **商業限制條款**:
  - 允許:任何網站、Web app、商業專案、AI 生成程式碼、教育用途
  - 禁止:用 GSAP 開發**競爭 Webflow 視覺動畫建構工具**(Visual Animation Builder)
  - 禁止:Reverse engineer GSAP 製造競品
  - 禁止:移除 GSAP 內建的 proprietary notice / branding
- **本專案使用情境**: 教育用 SPA RPG 遊戲,**不屬於**競爭性視覺動畫建構工具。**合規,可繼續使用**。
- **與 CC BY-NC-SA 4.0 的相容性**:
  - 兩個條款分別管轄不同檔案(GSAP 是 third-party `script src`,本專案題庫是 CC content)。
  - GSAP No Charge 條款不要求衍生作品繼承(不是 share-alike),所以本專案的 NC + SA 條款不會被 GSAP 「污染」。
  - 但**下游 fork 用戶**仍受 GSAP No Charge 條款限制(若 fork 此專案,他們也要遵守 GSAP 的「不可建競爭視覺動畫工具」)。
- **對 Public 上架的影響**: **可改 public**。**但** README 應補一行 disclaimer 提醒下游用戶 GSAP 的非 MIT 性質。

### canvas-confetti 1.9.3(`confetti.browser.min.js`)

- **授權**:**ISC License**(不是 MIT,雖然 README 標 MIT)
- **驗證來源**:
  - https://github.com/catdad/canvas-confetti/blob/master/LICENSE(官方)
  - `cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/package.json`:`"license": "ISC"`
- **ISC vs MIT**:兩者都是 permissive license,法律效力幾乎等價,但用詞略簡。**ISC 與 MIT 完全相容**。
- **本專案使用情境**: 顯示 confetti 動畫,合規。
- **與專案雙軌的相容性**: ISC + MIT(本專案 code)+ CC BY-NC-SA 4.0(本專案 content)三方無衝突。

### CDN 服務(`jsdelivr.net`)

- 不屬於授權問題,但屬於**第三方依賴可用性**風險。
- 建議:可改 public 後,如果擔心 CDN 中斷,可考慮 self-host 兩個 .js 到 GitHub Pages(增加 ~70KB 但不再依賴外部 CDN)。

### 建議

- **P0(必修)**: 修正 README 的 canvas-confetti 授權標示,從 "ISC/MIT" 標清楚為 **ISC**。
- **P0(必修)**: 在 README 致謝段落或新增 NOTICE.md,明列各 dependency 的:
  - 名稱 + 版本
  - 授權(GSAP = Standard No Charge License,canvas-confetti = ISC)
  - 連結(官方 license URL)
- **P1(建議)**: 加一句 disclaimer 提醒下游 fork 用戶 GSAP 的非 MIT 性質與商業限制。
- **P2(建議)**: 評估 self-host CDN dependency,降低 supply chain 風險。

---

## D. IPAS 官方教材引用合規

### 教材檔案版控驗證

`git ls-files` 共 64 個 tracked file,執行 grep `指引|考題|參考資料|*.pdf|*.pptx|*.docx`:

```
教材 dirs: 上述空表示未 tracked
```

**確認**:`01指引/ 02歷年考題/ 03參考資料/` 從未被 git tracked,git history 也從未 add 過(包含 commit log 全部 33 個 commit)。

### 題庫照抄官方教材的風險

題庫中的 stem 已逐筆比對 114-2 第一科 + 第三科兩個 PDF。但**官方學習指引**(L21/L22/L23 系列三大冊指引)未做 verbatim 比對。基於目前抽樣與 audit-source-fidelity.js 的運作邏輯(`source_refs` 只標 knowledge_code 不標頁碼),無法 100% 排除「題目某句子是直接從學習指引抄」的可能。但:

- 從 q_pa~q_ph、q_n1~n8 樣本來看,新題庫的 stem 都有具體產業情境包裝,不像直接從學習指引抄(指引通常用學術中性語氣)。
- 風險主要集中在 questions.json 的 50 題(早期生成、多帶 exam_appearance)。

### kb/*.json 的 source_refs 標註

抽樣 `kb/scope.json` 與 `kb/nodes-subject-3.json` 第一頁:標註層級到「指引文件名 + 章節」,雖然沒到「第幾頁」,但已是**合理的 attribution 程度**(對於非商業學習用途)。

### 建議

- **P1(建議)**: 在 `docs/license-audit.md` 加入一條後續工作:對 questions.json 的 50 題重做與「學習指引 PDF」的 verbatim 比對(若使用者有時間)。
- **P2(可選)**: kb 節點 source_refs 補充頁碼或章節層級。

---

## E. 商標 / 註冊符號

### 「IPAS」官方名稱

- 官方全名:**「經濟部產業人才能力鑑定」**(英文 iPAS,小寫 i + 大寫 PAS)
- 主管:**經濟部產業發展署**
- 執行:工業技術研究院產業學院
- **商標狀態**:雖未明確查到智財局註冊號,但 iPAS 是經濟部產業發展署官方使用的服務識別,實務上應視為「未註冊但有先使用權的服務標章」,他人未經授權使用作為「商品/服務識別」可能有風險(但**作為「指稱對象」的學術引用不在此限**)。

### 本專案的使用方式

- README 標題使用「IPAS AI 應用規劃師中級」(全大寫 IPAS)— 與官方寫法 "iPAS" 略有差異
- 多處使用「IPAS 官方學習指引」「IPAS scope」等 — 屬於指稱性引用
- README 第 162 行已說明「教材...著作權歸經濟部 IPAS / 原出版單位」— 攻擊性聲明屬於 fair use 範圍
- README 第 182 行已說明「經濟部 IPAS 提供官方學習指引與考綱」— 致謝聲明合理

### 風險評估

- **法律風險**:**低**。本專案是非商業性學習輔助工具(由 LICENSE-CONTENT.md 強制 NC),用戶基於合理引用使用「IPAS」名稱屬於 fair use。但因「iPAS」是經濟部官方服務識別,**有可能引起經濟部產業發展署的詢問或要求**(雖然台灣實務上對非商業學習工具通常不會主動干預)。
- **品牌混淆風險**:**中**。讀者可能誤以為本專案是經濟部 / iPAS 官方產品。

### 建議

- **P0(必修)**: README 加 disclaimer 段落,例如:

  ```markdown
  ## 免責聲明

  本專案為**獨立社群作品**,**非經濟部產業發展署 / iPAS 官方**製作,亦非工業技術研究院產業學院授權。
  iPAS、AI 應用規劃師中級鑑定為經濟部產業發展署所推動之服務標章。
  本專案僅作為非商業性學習練習工具,所有題目為原創改寫,**不可作為官方應試替代品**。
  正式應試請以 iPAS 官方公告為準:<https://ipd.nat.gov.tw/ipas/>
  ```

- **P1(建議)**: README 的 "IPAS" 大寫可改為與官方一致的 "iPAS"(統一風格但非必要)。

---

## F. 字體 / Emoji / 圖示

### 字體使用

從 `src/index.html` grep:

```css
font-family: 'Noto Sans TC', 'Noto Sans CJK TC', system-ui, -apple-system, sans-serif;
font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
```

- **Noto Sans TC**:Google + Adobe 開發,**SIL Open Font License 1.1**,免費商用,可嵌入網頁
- **Noto Sans CJK TC**:同上 OFL 1.1
- **system-ui / -apple-system**:CSS 標準關鍵字,使用作業系統字體,無授權問題
- **Cascadia Code**:Microsoft 開發,**SIL OFL 1.1**,免費
- **JetBrains Mono**:JetBrains 開發,**Apache License 2.0**,免費商用
- **Consolas**:Microsoft 系統字體,使用者本機若有則 fallback,無授權問題

**重要**: 本專案**並未引用 Google Fonts CDN**(grep googleapis 為空)。所有字體都是「CSS font-family 列表 fallback」方式,不會被瀏覽器主動下載第三方資源。**無授權風險**。

### Emoji

`index.html` 第 21 行用了 🎮 (U+1F3AE)。Emoji 是 Unicode 標準字元,**免授權**。具體渲染由作業系統提供,本專案不嵌入 emoji 圖示資源。

### 圖示資源

grep `font-awesome|fontawesome|material-icons|googleapis|fontcdn` 全部 0 筆命中。**確認本專案未使用 Font Awesome / Material Icons / 任何商業圖示資源**。

### 建議

- F 段落 **PASS,無需修補**。

---

## G. 個人資訊

### git history 中的 author email

執行 `git log --all --pretty=format:'%an <%ae>' | Sort-Object -Unique`:

```
Marco Lin <<author-email-redacted>>
```

**所有 33 個 commit 都使用真實 email**(無 GitHub noreply 替代)。

### 程式碼 / 文件中的個人資訊揭露

執行 grep `marcolin\.888|marco3939|marco\.lin`:

| 檔案 | 行 | 內容 |
|:--|:-:|:--|
| `LICENSE` | 3 | `Copyright (c) 2026 marco3939` (GitHub 用戶名,**非真名,OK**) |
| `LICENSE-CONTENT.md` | 24 | 同上(指 GitHub repo) |
| `README.md` | (未直接出現,但連結 [LICENSE]) | OK |
| `CHANGELOG.md` | 13 | `marco3939/ipas-ai-game` (GitHub 用戶名,OK) |
| `ipas-ai-game-prompt.md` | 21 | 同上 |
| `docs/plan.md` | 64 | **`user.email=<author-email-redacted>` 直接揭露** |
| `docs/plan.md` | 125 | `marco3939/ipas-ai-game` (用戶名,OK) |
| `docs/progress.md` | 117 | `https://github.com/marco3939/ipas-ai-game.git` (用戶名,OK) |

### 風險評估

#### 風險 1:**git commit author email = <author-email-redacted>**

- 改 public 後:任何人可以看 `git log`,看到 33 個 commit 都是 <author-email-redacted>。
- **私隱風險**:**中**。Gmail 地址公開後可能收到 spam,被加入 LinkedIn / GitHub scraping bot 名單。但這是「自願揭露」(註冊 GitHub 用此 email),屬於可接受程度。
- **資安風險**:**中**。對主管級資安人員而言,真實 email 暴露相當於告訴攻擊者「這個身份在 GitHub 上有活動」,可能成為 social engineering 的線索(例如假冒 GitHub 通知、假冒 Anthropic 等)。

#### 風險 2:**docs/plan.md 行 64 直接 verbatim 寫出 email**

- 這比 git history 更顯眼,任何人翻文件就會看到。
- **建議刪除**或改為 redacted 版本。

### 改用 GitHub noreply email 的成本評估

GitHub noreply email 格式:`<id>+marco3939@users.noreply.github.com`(其中 `<id>` 是 GitHub user ID,可從 `https://api.github.com/users/marco3939` 查到)。

#### 選項 A:**只改未來的 commit**(成本低)

- 修改本機 git config: `git config user.email "<id>+marco3939@users.noreply.github.com"`
- 之前的 33 個 commit 仍然顯示 `<author-email-redacted>`
- 建議搭配 GitHub 帳號設定 → Email → 「Block command line pushes that expose my email」

#### 選項 B:**rebase / filter-branch 改寫所有 history**(成本高)

- 用 `git filter-branch` 或 `git filter-repo` 重寫 33 個 commit 的 author email
- **風險**:
  - 所有 commit hash 改變,所有現有 reference 失效
  - 若 already pushed to GitHub:需要 `git push --force`,Public 上線**前**做 OK,Public 上線**後**做會 break 任何 fork
  - 本機 worktree 需要 reset
- **時間成本**: 30 分鐘
- **建議**: **改 public 之前先做 git filter-repo 重寫 history,然後一次性 force push**(用戶尚未 push 過 public,沒有 fork 風險)。

### 建議

- **P0(必修)**: 在改 public 之前,執行以下其中一個方案:
  - **(推薦)選項 B**:`git filter-repo --email-callback 'return email.replace(b"<author-email-redacted>", b"<USER_ID>+marco3939@users.noreply.github.com")'` 重寫 33 個 commit 的 author email,然後 force-push。
  - 或選項 A:接受過往 history 已揭露,只設定未來 commit 用 noreply。
- **P0(必修)**: `docs/plan.md` 第 64 行的 `user.email=<author-email-redacted>` 改為 redacted(例如 `user.email=<author-email>`)。
- **P1(建議)**: GitHub 帳號 Settings → Emails 啟用 "Keep my email addresses private" 與 "Block command line pushes that expose my email"。
- **P2(可選)**: `git config --global user.email` 改設 noreply,避免未來其他 repo 也曝光。

---

## 修補建議(按優先級)

### P0(必修,Public 上架前完成)

1. **題庫鐵律 #3 違反**:重做 4 個 CRITICAL 級題目(q_0028 LSTM、q_0033 KNN/SVM、q_0046 DBSCAN、q_0035 醫院 Rollout)的 stem + 選項,加入完全不同的產業情境;重做 5-6 個 MED-HIGH 級題目。
2. **README 第三方依賴 license 標示更正**:canvas-confetti 從 "MIT" 改為 **"ISC"**;GSAP 補標 **"Standard No Charge License (free for commercial use)"**。
3. **README disclaimer**:加入「本專案非經濟部 / iPAS 官方」與「正式應試以 iPAS 官方為準」聲明。
4. **個人 email 處理**:重寫 git history 改用 GitHub noreply email,或修改 `docs/plan.md` 第 64 行 redact email,並啟用 GitHub 私密 email 設定。

### P1(建議,Public 上架後 1 週內完成)

1. 新增 `NOTICE.md`:條列 GSAP 與 canvas-confetti 的 attribution(版本 + license 名稱 + 官方 license URL)。
2. 在 `index.html` (root) 補加進 LICENSE 第 6-9 行的 MIT 適用範圍清單。
3. README 的 "IPAS" 統一為 "iPAS"(與官方一致)。
4. 嚴審 questions.json 的 50 題是否有照抄學習指引的句子(後續 verbatim 比對)。
5. 在 `kb/exam-patterns.json` 寫一條 review checklist,要求未來新題目寫作前驗證 phrase 重疊度。

### P2(可選優化)

1. Self-host 兩個 CDN dependency(GSAP + canvas-confetti)到 GitHub Pages,降低 supply chain 風險。
2. kb 節點 source_refs 補充頁碼層級。
3. 商業授權 contact 方式公開(例如建立 `/security` 頁或 issue template)。

---

## 附錄:審查使用的工具

- **靜態檔案掃描**: PowerShell + Node.js 解析 17 個題庫 JSON,精確 substring grep
- **PDF 真題比對**: PDF Tools MCP `read_pdf_content` 讀完 114-2 第一科 + 第三科官方公告 PDF
- **第三方依賴授權查證**: WebFetch 至 GSAP 官方 License page、canvas-confetti GitHub LICENSE、jsdelivr CDN 的 package.json
- **git history 驗證**: `git ls-files`、`git log --all`、`git log --diff-filter=A`

## 附錄:審查未涵蓋範圍

由於時間限制,以下項目未做 100% 比對(因應使用者要求只審 20 題抽樣):

- questions.json 50 題 vs 「IPAS 學習指引 PDF」的 verbatim 比對(目前只比對了 114-2 真題)
- 197 題新批次的兩兩相互 verbatim 比對(可能有同主題題目句子重複)
- kb/*.json 內所有節點 source_refs 是否與「指引文件章節」一一對應
- 1132(114-2 之前)與 113-1 的歷年考題是否有 verbatim 命中
