# 知識節點抽取日誌(階段 3)

> 啟動於 2026-05-09
> 對應檔:`kb/nodes-subject-1.json`、`kb/nodes-subject-3.json`

---

## 批次處理狀態

| 批 | 內容 | 狀態 | nodes 增量 | 完成日 |
|:-:|:--|:-:|:-:|:--|
| 1 | 機器學習分類總表 + 避免過擬合彙整 + 降維方法總表 | ✅ | +25 (S3) | 2026-05-09 |
| 2 | IPAS_AI中級_5月23日_衝刺複習主檔.md(讀 1-800 行,核心已涵蓋) | ✅ | +28 (S1) | 2026-05-09 |
| 3 | 機器學習複習.pptx(視覺簡報) + 理論前沿.pptx(前沿議題) | ✅(空批) | 0 | 2026-05-09 |
| 4 | 用漫畫學AI 科目一.pdf | ✅(跳過) | 0(掃描型,無文字層) | 2026-05-09 |
| 5 | 用漫畫學AI 科目三.pdf | ✅(跳過) | 0(掃描型,無文字層) | 2026-05-09 |
| 6 | iPAS 初級講義.pdf | ✅(跳過) | 0(衝刺主檔 v3 已涵蓋此講義延伸概念) | 2026-05-09 |
| 2-擴充 | 衝刺主檔回頭補抽科三 8 個未覆蓋編碼 | ✅ | +32 (S3 ext) | 2026-05-09 |

科二漫畫(31.7 MB)跳過,僅作邊界參考。

---

## 批 1 抽取明細(2026-05-09)

### 來源檔案
1. `機器學習分類總表.pdf` (201 KB, 4 頁)
2. `避免過擬合彙整.pdf` (160 KB, 4 頁)
3. `降維方法考試比較總表.pdf` (297 KB, 10 頁)

### 抽取結果(全部進 nodes-subject-3.json)

| 編碼 | 主題 | nodes 數 |
|:--|:--|:-:|
| L23201 ML 原理 | 監督/非監督/半/自/RL/判別 vs 生成/聯邦 vs 分散式 | 6 |
| L23202 演算法 | 集成學習(Bagging/Boosting/Stacking) | 1 |
| L23304 調整優化 | 過擬合/L1L2/Early Stopping/Dropout/總表 | 5 |
| L23102 線性代數 | PCA/LDA/ICA/SVD/t-SNE/UMAP/AE/NMF/Kernel PCA + 對照 | 13 |
| **小計** | | **25** |

### 鐵律合規檢查
- ✅ 25 個 nodes 全部具備 `common_misconceptions`、`explanation_hooks`、`variation_seeds`
- ✅ 高頻考點(PCA、L1/L2、Dropout)的 misconceptions 結合 114-2 考古題實際陷阱選項
- ✅ NMF 已標 `errata_critical: true`,提示階段 6 強制納入該勘誤點

### Source Level 分布
- L1(指引/考古題):0
- L2(改編,源自參考整理):25
- L3(推論):0
- L4(資料不足):0

---

## 累計覆蓋(經批 1+2 後)

### 已覆蓋之 scope.json 編碼
- L21101 NLP ✅(6 nodes)— Transformer/BERT/Word2Vec/RAG/TF-IDF
- L21102 CV ✅(4 nodes)— CNN 優勢/分割四階層/IoU mAP/CNN 譜系
- L21103 生成式 AI ✅(4 nodes)— VAE/GAN/Diffusion/Mode Collapse/SD
- L21104 多模態 ✅(2 nodes)— CLIP/模態缺失
- L21202 規劃 ✅(2 nodes)— 漸進部署/POC
- L21203 風險 ✅(5 nodes)— PDPA/GDPR/對抗/著作權/不可否認
- L21301 數據準備 ✅(2 nodes)— JSON/混合特徵
- L21302 部署 ✅(7 nodes)— K8s/Registry/Drift/CI/水平/Sharding/Canary
- L23102 線性代數 ✅(13 nodes,深度高)
- L23201 ML 原理 ✅(6 nodes)
- L23202 演算法 部分 ✅(1 node)
- L23304 調整優化 ✅(5 nodes)

### 未覆蓋(待後續批次)
- L21201 評估 0(衝刺主檔提及但 nodes 數低,後續批次補)
- 科三:L23101 機率統計、L23103 數值優化、L23202 演算法(只 1 node)、L23203 深度學習、L23301-L23303、L23401-L23402

### 階段 3 最終 nodes 統計(2026-05-09)
- nodes-subject-1.json:**28 nodes**(科一 8 編碼覆蓋 7,L21201 評估規劃留白 — 階段 6 由權重生成)
- nodes-subject-3.json:**25 nodes**(批 1 原檔)
- nodes-subject-3-extended.json:**32 nodes**(批 2 擴充補強科三未覆蓋編碼)
- **累計總 nodes:85**

### 編碼覆蓋率
| 編碼 | nodes 數 | 覆蓋狀態 |
|:--|:-:|:-:|
| L21101–L21302(科一 8 編碼除 L21201) | 28 | ✅ |
| L21201 AI 導入評估 | 0 | ⚠️ 階段 6 權重生成 |
| L23101–L23402(科三 12 編碼) | 57 | ✅ 全覆蓋 |
| **總計** | **85** | **20/21 編碼有 nodes** |

### 鐵律合規 ✅
- 85 nodes 全部具備 `common_misconceptions`、`explanation_hooks`、`variation_seeds`
- 5 個 errata_critical 點已嵌入(PDPA 六項、NMF non-negative、Recall 公式、Log-Odds 譯名、加權求和索引)

### 批 4-6 處理決策(空批,2026-05-09)
- **批 4 漫畫科一(33 MB / 20 頁)**:read_pdf_content 回報「No text could be extracted (likely scanned)」+ Canvas dependency 載入失敗 → 跳過
- **批 5 漫畫科三(20 MB / 15 頁)**:同樣掃描型 → 跳過
- **批 6 初級講義(42 MB / 543 頁)**:有文字層 ✅,但內容為「初級」資料且衝刺主檔 v3 補強段已從此講義萃取 7 個關鍵中級延伸概念(Bias-Variance、AI 自治四階層、生成模型四家族、RAG 比喻、CoT、AI Agent 三要素、Hard-coding vs ML)→ 跳過避免 [L4] 風險

### 批 2 擴充(2026-05-09)
基於已讀衝刺主檔內容(1-800 行),回頭補抽科三 8 個未覆蓋編碼之 nodes:
- L23101 機率統計:3 nodes(貝氏定理、Monte Carlo、CLT)
- L23103 數值優化:4 nodes(Adam、凸非凸、學習率、O(n²))
- L23202 演算法:8 nodes(DBSCAN、邏輯迴歸、SVM、決策樹、XGBoost、信用評分卡、K-means vs DBSCAN、Apriori 三指標)
- L23203 深度學習:3 nodes(ReLU、LSTM、加權求和勘誤)
- L23301 數據準備:3 nodes(特徵縮放、互動特徵、SMOTE)
- L23302 模型選擇:1 node
- L23303 評估驗證:8 nodes(F1 計算、Precision/Recall 勘誤、R²、不平衡禁 Accuracy、CV 種類、macro F1、殘差圖、ARIMA)
- L23401 隱私:3 nodes(同態加密、技術組合、PETs 對比)
- L23402 公平性:3 nodes(Bias 三類、公平性指標、Embedding 偏見)
合計 +32 nodes 寫入 `nodes-subject-3-extended.json`

### 批 3 處理決策(空批,2026-05-09)
**1150316-機械學習複習.pptx (16.2 MB)**:
- 結構檢查:Google Slides 匯出,4 張投影片,每張為單一全頁圖片(Type 13 Picture),Placeholder TextLen=0
- 結論:純視覺化簡報,無文字可程式抽取;OCR 工具未安裝;邊際價值低於衝刺主檔
- 處置:**跳過**,不抽 nodes

**機器學習理論前沿:核心思維與爭議.pptx (1.9 MB)**:
- 結構檢查:15 張投影片,文字內容已成功抽取(透過 PowerPoint COM)
- 內容主題:GFlowNets、NTK 理論、柏拉圖表徵假說、Scaling Laws 爭議、Double Descent、Implicit Regularization
- 結論:深度高但**屬前沿研究素養補充**,與 IPAS 中級核心考點(基礎概念 + 應用情境)偏離
- 處置:**閱覽過,不抽 nodes**,避免拉高題庫難度與考試方向不一致;若使用者後續希望加入,可單獨補抽

**累計 nodes 維持 53**(批 3 增量為 0)

---

## /clear 後復原指令

若 session 中斷或主動 /clear:
1. 讀 `docs/progress.md` → 確認當前批次
2. 讀 `kb/extraction-log.md`(本檔)→ 確認已處理檔案
3. 讀 `kb/nodes-subject-3.json` 與 `kb/nodes-subject-1.json` → 確認已抽 nodes
4. 讀 `docs/plan.md` → 確認鐵律與決議
5. 進入未處理批次

---

## Context 控管建議

- 批 1 + 批 2 可在同一 session 完成(兩者輕量)
- 批 3(PPTX)後**建議 /clear**
- 批 4-6(大型 PDF)各自獨立 session,每批前 /clear
