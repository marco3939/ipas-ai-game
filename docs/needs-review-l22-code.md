# NEEDS_REVIEW: L22 code_reading 35 題 Python 驗證盲點

> 自主迭代 #5 (2026-05-16) 揭露
> 來源:`scripts/mock-pa-code.py` 初試加 L22 code_reading 3 檔後 fail
> 狀態:**已從 mock-pa-code FILES 撤回**,避免 CI 破裂;等 user 派 Worker 處理

## Context

`1ff11af PR #2` 補了 35 題 L22 code_reading(n22/n23/n24)。33 題有 `stem_variables.case_*`(動態),但 **mock-pa-code.py 從未掃過此 3 檔**,所以沒有 Python 跑題驗證。

Iter #5 加 3 檔到 mock 後跑 Python,在 99 個 case 中找到 **9 題 / 19+ case 真 bug**。

## 9 題 bug 分類

### A. 題目 code_block 真 bug(7 題,**最高優先**)

#### A1. 雙花括號 `{{` 被當 Python set / dict(3 題)
- **q_n24_005** case a/b/c:`train_set = {{'A→D','B→D','C→D','D→D'}}` → `TypeError: unhashable type: 'set'`
  - Python 把 `{{...}}` 解析為「外層 set 包含內層 set」,內層 set 不可 hash
  - 應為單層 `{` — 可能是 placeholder substitution 留下的字面 `{` 被誤雙重

- **q_n24_006** case a/b/c:同類 `df = pd.DataFrame({{...}})` 雙花括號 → `TypeError: unhashable type: 'dict'`

- **q_n24_008** case a:同類 `pd.DataFrame({{'user_id': [...]}})` → 同 error

#### A2. `...` ellipsis 被當 Ellipsis object(1 題)
- **q_n24_004** case a/b/c:sklearn `TfidfVectorizer.fit_transform` 接收 `...` 變成 `'ellipsis' object has no attribute 'lower'`
  - code_block 含 `corpus = [...]` 字面,被 placeholder 替換後沒填內容

#### A3. 多 print 一行(1 題)
- **q_n23_007** case a/b/c:expected='0.471' got=`'[[810 90]\n[ 20 80]]\n0.471'`
  - code_block 多印 confusion matrix,stdout 多一行
  - 修法:code_block 移除多餘 print,只留最終結果

#### A4. stem.answer 跟 code stdout 格式不對齊(1 題)
- **q_n24_007** case a/b/c:expected=`'λ=0.1 scale=10、λ=10 scale=0.1,λ 大尺度小'` got=`'scale_strong: 10.0 scale_weak: 0.1'`
  - 完全不對應 — answer 是中文描述,code 印的是英文鍵值
  - 修法:把 answer 改成跟 code stdout 一致,或反過來改 code

### B. 環境缺套件(1 題)
- **q_n23_003** case a/b/c:`ModuleNotFoundError: No module named 'imblearn'`
  - SMOTE 需 imbalanced-learn 套件
  - 修法:Worker 確認本機 / CI 環境是否裝 imblearn;或改題目用 sklearn 內建 over_sampling

### C. numpy print 格式差(1 題)
- **q_n23_002** case_c:expected=`'[0.526 10.0 ]'` got=`'[ 0.526 10.   ]'`
  - numpy print 預設留 leading space + 縮減尾巴 0
  - 修法:answer 改 `'[ 0.526 10.   ]'`(對齊 numpy 實際 print)

## 修補範圍

| 題 id | 類別 | 嚴重度 | 修法複雜度 |
|:--|:--|:--|:--|
| q_n24_005 | A1 雙花括號 | 高(題目跑不了)| 低(改 `{{` → `{`) |
| q_n24_006 | A1 同 | 高 | 低 |
| q_n24_008 | A1 同 | 高 | 低 |
| q_n24_004 | A2 ellipsis | 高 | 中(需填實際 corpus) |
| q_n23_007 | A3 多 print | 中 | 低(移多餘 print) |
| q_n24_007 | A4 answer 不對齊 | 高(教學錯)| 中(改 stem.answer + 可能改 code) |
| q_n23_003 | B 缺套件 | 中 | 中(改題或裝套件)|
| q_n23_002 c | C numpy format | 低 | 低(改 answer 字串)|

## 派工建議

派 1 個 Worker 修 7 件 A 類 + C 類(8 件,代碼層級),B 類另外 escalate 給 user 決定環境政策。

Worker 完成後:
1. 把 3 檔重新加進 `mock-pa-code.py` FILES
2. 跑 mock 確認 PASS = (51 既有 + 99 新)= 150 / 0 fail(扣除 SMOTE 案例若 user 決定移除)
3. commit + push

---

> 此檔自主迭代產生,等 user 任意指示派 Worker 即可清。
