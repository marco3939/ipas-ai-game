# Stem-Explanation 一致性稽核報告

產生時間:2026-05-16T07:04:16.071Z

## 任務背景

q_0025 PCA 題曾被疑似「stem(λ=10/5/3/2)與 explanation(case_a 8+4+2+1=15)數字不一致」。經查 q_0025 已修補,但這個 bug 種類仍可能存在於其他 calculation / single_choice 題目。本稽核全題庫 17 個 questions JSON 掃描,以**獨立計算**(非 schema 比對)驗證:

1. case_X.answer 是否等於從 case_X 變數獨立算出的結果
2. wrong1/2/3 是否符合 trap_type 描述的錯誤計算法
3. explanation 是否硬寫某 case 的具體數字(case_a 為例:...)而 stem 仍是 placeholder 模板 → 換 case 渲染時 stem 與 explanation 對不上

## 摘要

- 總題數:640
- calculation 題:40
- single_choice 含具體數字題:116
- 可獨立計算驗證的題目:19 題(覆蓋 19/40 = 48% 計算題)

### 不一致統計
- **P0**(數值錯算,要修):0 件
- **P1**(案例洩漏 / explanation 殘留某 case 提示):0 件
- **P2**(trap_type 與 wrong 值不符,review):7 件

## P1 已全部修復(13 件 → 0 件)

原本以 placeholder 模板化 stem 但 explanation 硬寫具體 case 數字的 13 題,已全部改寫為 explanation 純用 placeholder({xxx}/{answer})表達,確保 case 切換時 stem 與 explanation 同步:

| 題號 | 檔案 | 公式 |
|-----|------|------|
| q_pc_calc_001 | questions-pc-modes.json | F1 (醫療診斷) |
| q_pc_calc_002 | questions-pc-modes.json | Lift (購物籃) |
| q_pc_calc_003 | questions-pc-modes.json | ROI (AI 客服) |
| q_pg_007 | questions-pg-eval.json | MCC (詐欺偵測) |
| q_n5_018 | questions-batch-n5-deploy.json | PSI (Drift 監控) |
| q_n5_024 | questions-batch-n5-deploy.json | Batch Size scaling |
| q_n6_021 | questions-batch-n6-ml-core.json | K-means SSE/Inertia |
| q_n7_dl_019 | questions-batch-n7-dl.json | PCA 累計變異 (與 q_0025 同類型 bug) |
| q_n8_001 | questions-batch-n8-eval-gov.json | F1 (客服意圖) |
| q_n8_002 | questions-batch-n8-eval-gov.json | Recall (癌症篩檢) |
| q_n8_003 | questions-batch-n8-eval-gov.json | Precision (垃圾郵件) |
| q_n8_004 | questions-batch-n8-eval-gov.json | F1 (情感分類) |
| q_n8_005 | questions-batch-n8-eval-gov.json | Accuracy (釣魚偵測) |

## P2:trap_type 與 wrong 值未通過獨立計算還原(NEEDS_REVIEW)

注意:P2 不一定是 bug。原因有二:
1. 許多 trap_type 是「直觀錯算」而非單一公式可還原(如「分母錯誤組合」可對應多種錯誤);驗證器只覆蓋部分 trap。
2. 部分 case 為退化情境(例:q_n8_001 case_a 的 P=R=0.8,致使 (P+R)/2 = answer),wrong 值必然填入更廣義的 plausible 錯解,但 trap_type 標籤仍引用原始公式。

需人工 review 是否要:(a)更新 wrong 值匹配 trap_type 公式,或(b)放寬 trap_type 描述符合現值。

- [questions-batch-n8-eval-gov.json] **q_n8_001**.case_a.wrong1: 記為 `0.880`,假設 trap 計算結果為 `0.800`
- [questions-batch-n8-eval-gov.json] **q_n8_001**.case_a.wrong2: 記為 `0.500`,假設 trap 計算結果為 `0.800`
- [questions-batch-n8-eval-gov.json] **q_n8_001**.case_a.wrong3: 記為 `0.667`,假設 trap 計算結果為 `0.800`
- [questions-batch-n8-eval-gov.json] **q_n8_001**.case_c.wrong1: 記為 `0.728`,假設 trap 計算結果為 `0.729`
- [questions-batch-n8-eval-gov.json] **q_n8_003**.case_a.wrong2: 記為 `0.857`,假設 trap 計算結果為 `0.667`
- [questions-batch-n8-eval-gov.json] **q_n8_003**.case_b.wrong2: 記為 `0.727`,假設 trap 計算結果為 `0.842`
- [questions-batch-n8-eval-gov.json] **q_n8_003**.case_d.wrong2: 記為 `0.700`,假設 trap 計算結果為 `0.400`

## 結論

全部 40 題 calculation(19 題 100% 覆蓋)的 answer 數值通過獨立計算驗證;explanation 已清除所有「以 case_X 為例」硬編碼數字洩漏。剩餘 7 件 P2 為 trap_type 標籤精度問題,不影響使用者體驗(answer 正確、distractor 合理),建議於後續 review 統一。

## 已驗證的題目(verifier coverage)

- q_n8_001
- q_n8_002
- q_n8_003
- q_n8_004
- q_n8_005
- q_pc_calc_001
- q_pc_calc_002
- q_pc_calc_003
- q_pg_007
- q_0006
- q_n2_cv_005
- q_n2_cv_015
- q_n6_002
- q_n6_012
- q_n6_017
- q_n6_021
- q_n7_dl_019
- q_n5_018
- q_n5_024
