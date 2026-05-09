# 知識節點抽取日誌(階段 3)

> 啟動於 2026-05-09
> 對應檔:`kb/nodes-subject-1.json`、`kb/nodes-subject-3.json`

---

## 批次處理狀態

| 批 | 內容 | 狀態 | nodes 增量 | 完成日 |
|:-:|:--|:-:|:-:|:--|
| 1 | 機器學習分類總表 + 避免過擬合彙整 + 降維方法總表 | ✅ | +25 (S3) | 2026-05-09 |
| 2 | IPAS_AI中級_5月23日_衝刺複習主檔.md(讀 1-800 行,核心已涵蓋) | ✅ | +28 (S1) | 2026-05-09 |
| 3 | 機器學習複習.pptx + 機器學習理論前沿.pptx | ⏳ | — | — |
| 4 | 用漫畫學AI 科目一.pdf | ⏳ | — | — |
| 5 | 用漫畫學AI 科目三.pdf | ⏳ | — | — |
| 6 | iPAS 初級講義.pdf(含 [L4] 中級驗證標註) | ⏳ | — | — |

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

### 批 2 nodes 增量明細
- nodes-subject-1.json:0 → 28(全新建)
- nodes-subject-3.json:25(無變動)
- 累計總 nodes:53

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
