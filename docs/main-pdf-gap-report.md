# 主檔模型圖卡 56 頁 — KB Gap Report (2026-05-18)

來源:`機器學習模型圖卡(全).pdf` → render 為 `scripts/_main_page_001.png` ~ `_main_page_056.png`
分析人:visual analyzer subagent / 對照 KB:`kb/nodes-subject-{1,2,3}*.json`

---

## 1. 模型卡片完整清單(56 頁逐頁摘要)

| Page | 模型 (中) | 英文 | 主題 | KB 狀態 | 一句話總結 | 易混淆 |
|---|---|---|---|---|---|---|
| 1 | (封面)機器學習模型圖卡 | — | — | — | — | — |
| 2 | 模型總覽心智圖 + 應用領域對映 | — | 心智圖 | missing | 50+ 模型分類圖 + 五大業務情境對映 | — |
| 3 | 一元線性迴歸 | Simple Linear Regression | 監督/迴歸 | **partial** (n_L23202_013) | 找最佳擬合線 minimize SSE,斜率 β₁ 是 x 對 y 影響力 | 多元線性迴歸 |
| 4 | 二元線性迴歸 | Binary Linear Regression | 監督/迴歸 | **partial** (n_L23202_013) | 用兩個輸入預測一個連續輸出(平面擬合) | 一元 / 多元 |
| 5 | 多元線性迴歸 | Multiple Linear Regression | 監督/迴歸 | **partial** (n_L23202_013) | 多輸入 → 連續輸出,OLS 最小平方法 | 一元 / 邏輯迴歸 |
| 6 | 多項式迴歸 | Polynomial Regression | 監督/迴歸 | **missing** | 用 N 次方項擬合曲線型資料,次數太低/太高 → 欠/過擬合 | 線性迴歸 |
| 7 | 套索迴歸 LASSO (L1) | LASSO Regression | 監督/迴歸/正則化 | **covered** (n_L23304_002) | L1 強制稀疏化 → 自動特徵選擇 | Ridge |
| 8 | 脊迴歸 Ridge (L2) | Ridge Regression | 監督/迴歸/正則化 | **covered** (n_L23304_002) | L2 抑制權重過大,適合多重共線性 | LASSO |
| 9 | 彈性網路迴歸 ElasticNet | ElasticNet (L1+L2) | 監督/迴歸/正則化 | **missing** | L1+L2 綜合:既選特徵又穩定權重,適合高相關變數組 | LASSO / Ridge |
| 10 | 決策樹迴歸 | Decision Tree Regression | 監督/迴歸 | **partial** (n_L23202_005) | 用 if-else 條件分割預測連續數值,MSE 為損失,可解釋性高 | RF / 線性迴歸 |
| 11 | 隨機森林迴歸 | Random Forest Regression | 監督/迴歸/集成 | **partial** (n_L23202_011) | 多棵 DT 平均預測,降低過擬合 | 多元線性 / 單棵 DT |
| 12 | XGBoost 迴歸 | XGBoost Regression | 監督/迴歸/Boosting | **partial** (n_L23202_006) | 殘差學習 + 正則化,結構化資料王者 | RF |
| 13 | 邏輯斯迴歸 | Logistic Regression | 監督/分類 | **covered** (n_L23202_003) | Sigmoid 把線性組合壓到 [0,1],二元分類機率模型 | 線性迴歸 |
| 14 | KNN 最近鄰分類 | K-Nearest Neighbors | 監督/分類 | **covered** (n_L23202_010) | 多數決定分類,物理距離最關鍵;K 太小過擬合,太大欠擬合 | K-means |
| 15 | 支持向量機 SVM | Support Vector Machine | 監督/分類 | **covered** (n_L23202_004) | 找最大邊界(Maximum Margin)的完美分割超平面 | KNN |
| 16 | 樸素貝氏 | Naive Bayes | 監督/分類 | **missing** | 條件機率 + 屬性獨立假設,適合文本/垃圾郵件高維分類 | 決策樹 |
| 17 | 決策樹(基礎型) | Decision Tree | 監督/分類 | **covered** (n_L23202_005) | (頁卡標題寫決策樹但圖解內容沿用 NB,**主檔疑似排版錯誤**) | NB |
| 18 | 隨機森林 | Random Forest | 監督/分類/集成 | **covered** (n_L23202_011) | 多棵樹投票 = Bagging + 特徵抽樣,聽千棵樹的小決策 | 單棵 DT / SVM |
| 19 | XGBoost(極端梯度提升) | XGBoost | 監督/分類/Boosting | **covered** (n_L23202_006) | 結構化資料王;正則化是核心亮點,順序訓練 | RF |
| 20 | LDA 線性判別分析 | Linear Discriminant Analysis | 監督/降維 | **covered** (n_L23102_002) | 最大化類間距離,最小化類內方差,監督式降維 | PCA |
| 21 | QDA 二次判別分析 | Quadratic Discriminant Analysis | 監督/分類/非線性 | **missing** | 用二次方程邊界處理非線性,每類別獨立協方差 | LDA |
| 22 | ICA 獨立成分分析 | Independent Component Analysis | 非監督/降維/盲訊號 | **covered** (n_L23102_003) | 雞尾酒會問題;分離非高斯獨立源訊號 | PCA |
| 23 | PCA 主成分分析 | Principal Component Analysis | 非監督/降維 | **covered** (n_L23102_001) | 降維、抓最大變異方向,正交無相關 | LDA / t-SNE |
| 24 | t-SNE | t-distributed SNE | 非監督/降維/視覺化 | **covered** (n_L23102_005) | 高維非線性映射到 2D/3D,保留群聚靈魂;只做視覺化非通用降維 | UMAP / PCA |
| 25 | CFA 驗證性因子分析 | Confirmatory Factor Analysis | 統計/驗證 | **missing** | 驗證「潛在因子 ↔ 觀察指標」假設結構,不產生新因子 | EFA / PCA |
| 26 | CCA 典型相關分析 | Canonical Correlation Analysis | 統計/多變量 | **missing** | 找兩組變數的整體最大相關,而非單一對相關 | PCA |
| 27 | UMAP 流形學習 | UMAP | 非監督/降維/非線性 | **covered** (n_L23102_006) | 高維非線性降維,保留鄰近關係,比 t-SNE 快 | t-SNE / PCA |
| 28 | K-means 平均數聚類 | K-means | 非監督/聚類 | **covered** (n_L23202_008/012) | 自動劃分 K 個球形群,需預設 K | DBSCAN / GMM |
| 29 | GMM 高斯混合模型 | Gaussian Mixture Model | 非監督/聚類/軟性 | **missing** | 多個高斯分布加權,讓資料「看見」自己屬於每群的機率(EM 演算法) | K-means |
| 30 | 分層聚類 | Hierarchical Clustering | 非監督/聚類 | **missing** | 不需預設 K,用樹狀圖(Dendrogram)決定群數;成本高(O(n²)),小資料才用 | K-means / DBSCAN |
| 31 | DBSCAN 密度聚類 | DBSCAN | 非監督/聚類/密度 | **covered** (n_L23202_002/008) | 半徑 ε + MinPts 決定密度,自動識別雜訊;不需預設 K | K-means |
| 32 | 光譜聚類 | Spectral Clustering | 非監督/聚類/圖論 | **missing** | 用拉普拉斯矩陣 + 特徵向量處理非球形群(如月牙、環形),K-means 只能球形 | K-means / DBSCAN |
| 33 | 完全可觀測 MDP | Fully Observable MDP | 強化學習 | **partial** (n_L23201_004) | Agent 看到完整狀態 S,馬可夫性質做長期最佳決策 | POMDP |
| 34 | POMDP 部分可觀測 | Partially Observable MDP | 強化學習 | **missing** | 環境狀態隱藏,結合觀察值 + 信念狀態(Belief)推測;霧中開車 | MDP |
| 35 | SARSA | SARSA | 強化學習/On-policy | **missing** | On-policy 用「實際下一動作」更新 Q,偏保守安全 | Q-Learning |
| 36 | Q-Learning | Q-Learning | 強化學習/Off-policy | **missing** | 表格式 Q-Table,Off-policy 用「未來最大 Q」更新,小狀態空間用 | SARSA / DP |
| 37 | DDPG | Deep Deterministic Policy Gradient | 強化學習/連續動作 | **missing** | Actor-Critic + 連續動作空間,適合機械手臂精細控制 | DQN |
| 38 | PPO | Proximal Policy Optimization | 強化學習/策略 | **missing** | 限制策略更新幅度防發散,提升穩定性 | TRPO |
| 39 | A3C 並行訓練 | Asynchronous Advantage Actor-Critic | 強化學習/並行 | **missing** | 多 Worker 異步更新主網路,消除資料相關性,大幅縮短訓練 | A2C |
| 40 | DQN 深度 Q 網路 | Deep Q-Network | 強化學習/深度 | **missing** | 神經網路替代 Q-Table,處理大狀態空間(Atari),Model-Free | Q-Learning |
| 41 | Perceptron 感知機 | Perceptron | 深度學習/基礎 | **partial** (n_L23203_003) | 無隱藏層的單層神經元,只能線性可分;NN 的最基本單元 | NN / MLP |
| 42 | MLP 多層感知機 | Multi-Layer Perceptron | 深度學習/前饋 | **missing** | 多層 + 非線性激活函數 → 可處理非線性數據,基礎前饋網路 | Perceptron / DNN |
| 43 | DNN 深度前饋神經網路 | Deep Neural Network | 深度學習/前饋 | **missing** | 多層 MLP + 前饋結構,學習複雜模式;表格資料常用 | MLP / CNN |
| 44 | CNN 卷積神經網路 | Convolutional Neural Network | 深度學習/視覺 | **missing** | 卷積層 + 池化 + 非線性 → 影像辨識核心 | RNN / DNN |
| 45 | RNN 循環神經網路 | Recurrent Neural Network | 深度學習/序列 | **partial** (n_L23203_002) | 隱藏狀態 h_t 傳遞「記憶」,處理時序/文本;有梯度消失問題 | CNN / LSTM |
| 46 | LSTM 長短期記憶網路 | Long Short-Term Memory | 深度學習/序列 | **partial** (n_L23203_002) | 三個門控(Sigmoid/Tanh)+ Cell State,解決 RNN 長期依賴問題 | RNN / GRU |
| 47 | Transformer 架構 | Transformer | 深度學習/注意力 | **missing** | Self-Attention + 平行處理,Encoder-Decoder,NLP 取代 RNN | RNN / LSTM |
| 48 | ResNet 殘差網路 | Residual Network | 深度學習/視覺 | **missing** | 跳躍連接學殘差,深層也不怕性能退化(可訓 100+ 層) | DNN |
| 49 | EfficientNet 效率優化 | EfficientNet | 深度學習/視覺 | **missing** | 複合縮放:同時縮放深度 D / 寬度 W / 解析度 R,平衡優化 | ResNet |
| 50 | Bi-LSTM 雙向 LSTM | Bidirectional LSTM | 深度學習/序列 | **missing** | 同時用過去 + 未來資訊,全面理解上下文 | 單向 LSTM |
| 51 | GRU 門控循環單元 | Gated Recurrent Unit | 深度學習/序列 | **partial** (n_L23203_002) | LSTM 簡化版,2 個門(更新 z_t + 重置 r_t),計算效率高 | LSTM / RNN |
| 52 | BERT | Bidirectional Encoder Representations | NLP/LLM | **missing** | 雙向預訓練 + 微調;MLM 遮蔽語言模型 + NSP,Encoder-based | GPT |
| 53 | GPT 語言生成 | Generative Pre-trained Transformer | NLP/LLM | **missing** | Decoder + 自迴歸生成下一個字,Decoder-based | BERT |
| 54 | Informer 高效時序 | Informer | 深度學習/長時序 | **missing** | ProbSparse Attention 處理長時序,解決 Transformer O(L²) 運算 | Transformer / RNN |
| 55 | VAE 變分自編碼器 | Variational Autoencoder | 深度學習/生成 | **missing** | 編碼器輸出機率分布 N(μ, σ²),重參數化 + KL 散度,生成新資料 | AE / GAN |
| 56 | GAN 生成對抗網路 | Generative Adversarial Network | 深度學習/生成 | **missing** | Generator (偽造者) vs Discriminator (鑑識專家) 對抗訓練 | VAE |

**統計**:cover 完整 13、partial 11、missing 30(+1 主檔頁 2 心智圖 + 業務對映表)。Page 17 主檔疑似排版錯誤(基本資訊寫決策樹但內文同 page 16 NB)。

---

## 2. 缺失節點清單(missing,優先級排序)

### Tier A — IPAS 必考 + KB 完全沒(建議立即加)

依「考古題出現頻率 × 主檔強調度 × 與既有節點互補性」排序:

1. **n_L23202_014 / L23202 / Naive Bayes 樸素貝氏**(page 16)
   - 為何必加:IPAS 常考分類三大基礎之一(LR / DT / NB);主檔強調「條件機率獨立假設 + 高維文本分類」與決策樹對照
   - 對應主檔考點:獨立假設限制、即時應用速度、垃圾郵件實例

2. **n_L23202_015 / L23202 / GMM 高斯混合模型**(page 29)
   - 為何必加:KB 已有 K-means/DBSCAN 但缺 GMM「軟性分群 vs K-means 硬性分群」對照組;EM 演算法解強化考點
   - 對應主檔考點:屬於每群的機率、適合橢圓形群、用 AIC/BIC 決定 K

3. **n_L23202_016 / L23202 / 分層聚類 Hierarchical Clustering**(page 30)
   - 為何必加:聚類三大典型(K-means / DBSCAN / Hierarchical),KB 缺第三條腿;Dendrogram 是主檔考試關鍵
   - 對應主檔考點:不需預設 K、O(n²) 計算成本高、客戶分層

4. **n_L23202_017 / L23202 / 光譜聚類 Spectral Clustering**(page 32)
   - 為何必加:處理非球形群(K-means 限制最常考點之一);拉普拉斯矩陣 + 特徵向量是線代與聚類交集
   - 對應主檔考點:圖論基底、月牙/環形資料、轉換後再 K-means

5. **n_L23202_018 / L23202 / 多項式迴歸 + 過擬合連動**(page 6)
   - 為何必加:N 次數選擇 = 欠/過擬合教科書案例;主檔強調「不考公式,考次數合理解釋」
   - 對應主檔考點:溶解度溫度關係、二/三次方程、與線性迴歸對照

6. **n_L23304_006 / L23304 / ElasticNet 彈性網路迴歸**(page 9)
   - 為何必加:KB 有 LASSO/Ridge 但缺 L1+L2 綜合;高相關變數組唯一解
   - 對應主檔考點:λ₁/λ₂ 雙係數、特徵選擇 + 權重抑制兼具

7. **n_L23201_005 / L23201 / Q-Learning + SARSA 雙模型(On-policy vs Off-policy 對照)**(page 35-36)
   - 為何必加:RL 最常考的對照組;KB 只有籠統 RL 節點(n_L23201_004)
   - 對應主檔考點:On-policy 用實際 a_{t+1} vs Off-policy 用 max Q;Q-Table 更新公式

8. **n_L23201_006 / L23201 / DQN(Deep Q-Network)**(page 40)
   - 為何必加:深度強化學習入門代表;主檔強調「神經網路替代 Q-Table」是 Q-Learning → DQN 演進主線
   - 對應主檔考點:Atari、Model-Free、無模型 vs 動態規劃

9. **n_L23203_004 / L23203 / Transformer + Self-Attention**(page 47)
   - 為何必加:NLP 革命性架構,IPAS 中級已開始考;「Attention Is All You Need」核心
   - 對應主檔考點:平行處理 vs RNN 順序、Multi-Head Attention、Encoder-Decoder

10. **n_L23203_005 / L23203 / CNN 卷積神經網路**(page 44)
    - 為何必加:深度學習三大架構(MLP/CNN/RNN)之 CNN 缺;影像辨識核心
    - 對應主檔考點:卷積層、池化層、非線性分類、Atari 應用

### Tier B — IPAS 可能考 + 主檔詳細但 KB 簡略

11. **n_L23203_006 / L23203 / MLP / DNN 前饋網路**(page 42-43)— 與既有 Perceptron(n_L23203_003)合併補強或獨立
12. **n_L23202_019 / L23202 / QDA 二次判別分析**(page 21)— LDA 對照組
13. **n_L23102_013 / L23102 / CCA 典型相關分析**(page 26)— PCA 延伸,兩組變數整體關聯
14. **n_L23102_014 / L23102 / CFA 驗證性因子分析**(page 25)— 與 PCA/EFA 對照;統計考點
15. **n_L23201_007 / L23201 / MDP + POMDP(可觀測性對照)**(page 33-34)— RL 理論基礎
16. **n_L23203_007 / L23203 / BERT vs GPT 對照**(page 52-53)— LLM 雙巨頭

### Tier C — 深度模型細節(IPAS 中級不太考,Optional)

17. ResNet(page 48)、EfficientNet(page 49)、Bi-LSTM(page 50)、Informer(page 54)、VAE(page 55)、GAN(page 56)、DDPG(page 37)、PPO(page 38)、A3C(page 39)
    - 主檔有但 IPAS 中級題庫近 3 年罕見;若補,單獨成「深度模型補充包」一檔即可

---

## 3. partial 節點補強建議

| 節點 | 主檔頁 | 可補強的考試重點 |
|---|---|---|
| **n_L23202_013** (Linear Regression OLS) | page 3-5 | 主檔分一元 / 二元 / 多元三層;可補「平面擬合(二元)」與「多元 = 多輸入單輸出」差異,並強調「斜率 β 解釋意義」 |
| **n_L23202_005** (Decision Tree + 資訊增益) | page 10, 17 | 主檔強調「DT 迴歸用 MSE 分裂」與「DT 分類用資訊增益/Gini」差異;可補「DT 容易過擬合 → RF 解決」連動 |
| **n_L23202_011** (Random Forest) | page 11, 18 | 主檔強調 RF = Bagging + 列(樣本)抽樣 + 行(特徵)抽樣;可補「特徵抽樣是 RF 高於單純 Bagging 關鍵」 |
| **n_L23202_006** (XGBoost vs GBDT) | page 12, 19 | 主檔強調「正則化是 XGBoost 與 GBDT 最大區別」;可補 n_estimators / learning_rate 過擬合風險 |
| **n_L23202_008** (K-means vs DBSCAN) | page 28, 31 | 主檔強調 DBSCAN「ε + MinPts 自動識別雜訊」;可補「K-means 須預設 K 且偏球形 vs DBSCAN 不需 K 但需調 ε」更明確對照 |
| **n_L23202_002** (DBSCAN 三類點) | page 31 | 可補「高密度區 → 形成聚類,低密度區 → 雜訊(離群)」視覺化說明 |
| **n_L23203_002** (LSTM 與 GRU) | page 46, 51 | 主檔分兩頁細講:LSTM 有 3 門(Sigmoid×2 + Tanh×1)+ Cell State;GRU 簡化為 2 門(z 更新 + r 重置)無 Cell State;可拆成兩節點或補對照表 |
| **n_L23203_003** (感知器加權求和) | page 41 | 主檔強調「Perceptron = 無隱藏層單層 NN,僅線性可分」是 MLP/NN 的最基本單元;可補「為何加隱藏層 → 非線性」 |
| **n_L23201_004** (RL 總體) | page 33-40 | 主檔分 8 頁細講 MDP/POMDP/SARSA/Q-Learning/DQN/DDPG/PPO/A3C;籠統節點需拆解或補強至少 Q-Learning 與 DQN |
| **n_L23304_002** (L1/L2 對照) | page 7-9 | 主檔分三頁 LASSO/Ridge/ElasticNet;可補「ElasticNet 為高相關變數組唯一解」進易混淆 |
| **n_L23102_001** (PCA) | page 23 | 主檔強調「PC1 保留最多變異,PCs 彼此正交無相關」;可補「PCA 是非監督找方差最大方向 vs LDA 監督找分類最佳方向」對照 |

---

## 4. 跨頁的「使用情境/應用領域對映表」(page 2 心智圖右下角)

主檔 page 2 明確列出「應用領域 / 財務金融」對映:

| 業務情境 | 推薦模型(主檔語) |
|---|---|
| 生產營運 / 股票預測 | XGBoost、CNN、RNN |
| 銷售管理 / 信用評分 | LASSO、分類模型 |
| 人事資源 / 詐欺偵測 | KMeans、SVM、深度學習 |
| 研發創新 / 資產配置 | 深度學習、強化學習 |
| 財務管理 / 財務預測 | LSTM、GRU、ElasticNet |

**強烈建議獨立節點**:
- **n_L22402_007 / L22402 / 「ML 模型 × 業務情境對映表」**(對映既有 L22402 鑑別式 AI 預測任務分類節點)
- 為何加:IPAS 第 2 科考古題「給情境選模型」高頻題型;主檔的對映是業界共識,可直接出 5-10 題情境選擇題

---

## 5. 結論

- **預估可加新節點**:Tier A 10 個 + Tier B 6 個 + 業務對映表 1 個 = **17 個**(Tier C 9 個視時間決定)
- **預估可補強既有節點**:**11 個**(主要是 RL 籠統節點拆分、LR/DT/RF/XGBoost 主檔細節、LSTM/GRU 拆分)
- **預估可生新題**:
  - 每個 Tier A 新節點 ~ 3-5 題 → 30-50 題
  - 每個 Tier B 新節點 ~ 2-3 題 → 12-18 題
  - partial 補強 ~ 每節點 2 題 → 22 題
  - 業務對映情境題 ~ 8-10 題
  - **總計約 70-100 題新題庫產能**
- **建議下一步優先順序**:
  1. 先補 Tier A 第 1-6 號(NB / GMM / Hierarchical / Spectral / Polynomial / ElasticNet)— 純 ML 經典必考
  2. 同時補 partial #1-5(RL 拆解、LR 分層、DT/RF/XGBoost 細節)
  3. 再補 Tier A 第 7-10 號(Q-Learning / DQN / Transformer / CNN)— DL 入門
  4. 業務對映表獨立節點(高 CP 值題型)
  5. Tier B 視 2026-05-23 應試前剩餘時間決定
  6. Tier C 應試後再補

**主檔疑似錯誤標註**:Page 17 標題寫「決策樹(基礎型)」但內文圖解與 page 16 Naive Bayes 完全相同(主題、易混淆對照都還寫「樸素貝氏 vs 決策樹」),疑似主檔排版錯誤,需查證 PDF 原始檔。
