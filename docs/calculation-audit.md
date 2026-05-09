# Calculation 題深度稽核報告

## 總計
- 全題庫共 22 題 calculation
- 違反 8 題 critical schema/數值問題,已全數修補
- 剩 3 題 NEEDS_REVIEW(format 標籤誤用,但 runtime 不會壞)

## Schema 變體分布(修補前 vs 修補後)
| 變體 | 修補前 | 修補後 | 說明 |
| --- | --- | --- | --- |
| A_ARRAY(`options[]` + `stem_variables.case_X.{answer,wrongN}`) | 12 | 19 | renderQuestion 唯一支援的格式 |
| B_TEMPLATE(`options_template[case_X][]` + `stem_variables.case_X.{answer}`) | 7 | 0 | renderQuestion **完全不支援**,runtime 必爆 |
| C_NO_VARS(無 stem_variables) | 3 | 3 | 屬靜態題目,不會壞但 format 標籤不準 |

## 違反明細與修補

### A. B_TEMPLATE → A_ARRAY 全部轉換(7 題)

`renderQuestion` 在 `index.html` line 444-477 只處理 `q.options.map(...)`,完全不認得 `q.options_template`。
其中 q_n2_cv_005 / q_n2_cv_015 / q_0006 的 `options_template` 還只填了 `case_a` 一筆,其他 case_b/c/d 完全沒有 options。
若這 3 題抽到 case_b/c/d,**渲染後選項會是空字串或拋例外**。

#### A1. q_n2_cv_005 (questions-batch-n2-cv.json,L21102 卷積輸出尺寸)
- 違反:`options_template` 只有 `case_a`,且整個題目沒有 `q.options` 欄位。如抽中 case_b/c/d 將完全沒有選項可顯示。
- 已修:在每個 `case_*` 內補上 `wrong1/wrong2/wrong3` 數值(分別對應「忽略 padding」「2P 算成 4P」「漏 +1」三種誤算路徑)。改寫 `q.options` 為 placeholder 形式 `{answer}/{wrong1}/{wrong2}/{wrong3}`。所有 4 個 case 答案經獨立計算驗證:32 / 112 / 24 / 31。

#### A2. q_n2_cv_015 (questions-batch-n2-cv.json,L21102 IoU)
- 違反:同上(只有 case_a 的 options_template,缺 q.options)。
- 已修:統一改 A_ARRAY,新增 wrongN 對應「(union-inter)/union(非重疊比例)」「分子分母顛倒」「誤把分母寫成 union+inter」。answer 4 case 0.60 / 0.30 / 0.75 / 0.25 全數正確。

#### A3. q_n6_002 (questions-batch-n6-ml-core.json,L23101 貝氏後驗)
- 違反:`options_template` 完整(case_a/b/c)但缺 q.options。每個 case 的 wrong 數值不同,沒有對應的 placeholder 機制。
- 已修:統一誤算路徑為 wrong1=TPR(誤把概似當後驗)、wrong2=TPR/2(誤算分母)、wrong3=FPR(誤把假警率當後驗)。answer 0.161 / 0.155 / 0.296 經獨立 Bayes 公式驗算正確。

#### A4. q_n6_012 (questions-batch-n6-ml-core.json,L23103 O(n²) 倍率)
- 違反:同 A3(完整 options_template 但缺 q.options)。
- 已修:統一誤算為 wrong1=線性(n2/n1)、wrong2=指數 2^(n2/n1)、wrong3=n log n(rlog2(r))。answer 100 / 100 / 25 / 25 正確。

#### A5. q_n6_017 (questions-batch-n6-ml-core.json,L23202 Sigmoid)
- 違反:同 A3。
- 已修:wrong1=z(誤把線性輸出當機率)、wrong2=σ(-z)(±z 混淆)、wrong3=0.500(預設未代入)。case_a (z=0) 因為 σ(0)=0.5 = w3=0.5 會衝突,單獨改為 wrong3=0.731(混淆 z=1 結果)。answer 0.500 / 0.731 / 0.269 / 0.881 正確。

#### A6. q_n6_021 (questions-batch-n6-ml-core.json,L23202 K-means SSE)
- 違反:同 A3。
- 已修:wrong1=只算單群 SSE、wrong2=SSE/n(把總和錯算成均方)、wrong3=群間質心距離平方。原 case_b 的 wrong "8.0(未開平方完成)" 數值對不上,改為 SSE/n=1.0 更精確對應「均方距離」誤算。answer 1.0 / 4.0 / 10.0 經 SSE 公式驗算正確。

#### A7. q_0006 (questions.json,L23303 F1)
- 違反:`options_template` 只有 case_a,且 case_c (P=R=0.7) 退化使 F1 / 算術平均 / max 都等於 0.7,無法區分 trap。
- 已修:案 case_c 的 (P,R) 從 (0.7, 0.7) 改為 (0.85, 0.6) 以避免退化(F1=0.703)。其他 case 不動。統一誤算路徑為 wrong1=算術平均 (P+R)/2、wrong2=P·R、wrong3=max(P,R)。answer 0.686 / 0.643 / 0.703 / 0.480 正確。
- 注意:本題標記 `exam_appearance: 114-2 q16` 為改編真題,但題目情境與選項已脫離原題,case_c 數值修改不影響真題對應。

### B. 數值算錯(1 題,critical)

#### B1. q_pg_007 (questions-pg-eval.json,L23303 MCC)
- 違反:`stem_variables.case_X.answer` **4 個 case 全部算錯**。原題 explanation.correct 寫「分母 ≈ 388927」是錯的,實際應為 ≈ 445201。
  - case_a: 30·9940-20·10=298000;sqrt(50·40·9960·9950)=sqrt(198,012,000,000)≈445201;MCC=0.669 (原寫 0.766)
  - case_b: 198000/445201≈0.445 (原寫 0.491)
  - case_c: 446400/596400≈0.748 (原寫 0.812)
  - case_d: 98000/445201≈0.220 (原寫 0.272)
- 已修:answer 改為 0.669 / 0.445 / 0.748 / 0.220;wrong1 改為 Balanced Accuracy(對應 `(Recall+Specificity)/2`,case_a 0.874、b 0.748、c 0.874、d 0.623);wrong2 統一為 F1;wrong3 統一為 Accuracy。explanation.correct 中 case_a 的計算演示也修正為「sqrt(198,012,000,000)≈445201,MCC≈298000/445201≈0.669」。options.text 中 wrong1 的 trap_type 描述從「Recall」改為「Balanced Accuracy」以匹配新的數值。

### C. NEEDS_REVIEW(3 題,非 critical)

#### C1. q_n3_genai_010 (Stable Diffusion 取樣時間)
- 現狀:`format='calculation'` 但無 `stem_variables`,題目 stem 中沒有任何 placeholder。題幹寫死「0.08 秒、25 步 → 50 步」,實質為靜態單選。
- 影響:runtime 不會壞,只是 format 標籤不準。鐵律 #2「calc 題附 stem_variables 多 case 池」未落實。
- 任務範圍:不可改 format,故僅標 NEEDS_REVIEW。建議後續加 stem_variables 變成多 case,或改成 single_choice。

#### C2. q_0025 (PCA 累計變異量,衛星觀測)
- 現狀:同 C1。題幹寫死「λ₁=4.5、λ₂=2.7、λ₃=0.9、λ₄=0.9」,沒有 placeholder。

#### C3. q_0042 (兩兩比對複雜度)
- 現狀:同 C1。其實只是「下列何者為 O(n²)」的概念題,沒任何數字計算。

## 修補前後驗證結果

### Schema 稽核 (`scripts/audit-calculation.js`)
- 修補前:10 題違反(7 B_TEMPLATE + 3 C_NO_VARS),其中 7 題 critical(runtime 必爆)。
- 修補後:3 題剩 C_NO_VARS 標籤誤用警告(非 critical,runtime 正常)。

### 數值獨立驗算 (`scripts/verify-calc-numeric.js`)
- 對 19 個 A_ARRAY 題的 74 個 case 用獨立公式重算 answer。
- 結果:**74/74 全部通過**(修補後)。

### 模擬 renderQuestion (`scripts/simulate-render.js`)
- 對 22 個 calculation 題的所有 case 跑 renderQuestion 模擬。
- 檢查渲染後 stem / options.text / explanation 是否還有 `{xxx}` placeholder leftover。
- 結果:**0 leftover**。所有 placeholder 都被正確替換。

## 修補檔案清單
- `src/questions-batch-n2-cv.json`:q_n2_cv_005, q_n2_cv_015
- `src/questions-batch-n6-ml-core.json`:q_n6_002, q_n6_012, q_n6_017, q_n6_021
- `src/questions-pg-eval.json`:q_pg_007(MCC 數值修正 + trap 重設計)
- `src/questions.json`:q_0006(case_c 數值改為 (0.85, 0.6))

## 工具(本次新增)
- `scripts/audit-calculation.js`:依 schema 變體分類並回報違反
- `scripts/verify-calc-numeric.js`:對每題每 case 用獨立公式驗算 answer
- `scripts/simulate-render.js`:模擬 index.html `renderQuestion` 邏輯,確保 placeholder 全部替換
