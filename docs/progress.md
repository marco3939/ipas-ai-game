# IPAS AI 遊戲開發進度

- **考試日**:2026-05-23
- **專案啟動**:2026-05-09(剩 14 天,實際進度約第 1 天)
- **工作目錄**:`C:\Users\marco\.ipas-ai-game`

## 階段狀態

| # | 階段 | 狀態 | 完成日 |
|:-:|:--|:-:|:--|
| 0 | 環境核對與目錄建構 | ✅ | 2026-05-09 |
| 1 | 範圍劃定(讀 01指引/) | ✅ | 2026-05-09 |
| 2 | 考古題模式分析(讀 02歷年考題/) | ✅ | 2026-05-09 |
| 3 | 知識節點抽取(分批讀 03參考資料/) | ✅ 87 nodes | 2026-05-09 |
| 4 | 5 種遊戲方案提案 | ✅ 使用者選「全做」 | 2026-05-09 |
| 5 | 詳細設計討論 | ✅ | 2026-05-09 |
| 6 | 題庫生成 | ✅ **155 題** | 2026-05-09 |
| 7 | 網站建置(共用層 + 5 模式) | 🔄 **進行中** | — |
| 8 | 推送 GitHub | ⏳ | — |

---

## 🔴 五大鐵律(跨階段強制)

1. **鐵律 #1**:錯題驅動下鑽學習
   - 每題必有 explanation.correct/wrong/hook + misconceptions + related_node_ids
   - 答錯可下鑽變化型訓練
   - **結構化下鑽**:三階策略(換角度 → 易混淆 → 加深難度)
2. **鐵律 #2**:題庫動態化
   - shuffle_options:true(每場洗牌)
   - 計算題 stem_variables 多 case 池
   - 每場 RNG.set(Date.now())
3. **鐵律 #3**:不可複製 114-2 原題
   - 全原創情境 + 更深陷阱 + 跨產業綜合
4. **鐵律 #4**:選項長度均衡(2026-05-09 新增)
   - 正解/平均錯解長度比落在 [0.8x, 1.25x]
   - 「最長 = 正解」比例 ≤ 35%(理想 25%)
   - 錯解必須寫成「看起來專業合理的另一個描述」,不可短小敷衍
   - 稽核腳本:`node scripts/audit-option-length.js`
5. **鐵律 #5**:來源忠實性(2026-05-09 新增)
   - 每題 knowledge_code / node_id 必須對應 kb/*.json 真實 node
   - 禁止憑空生成不在來源資料的知識點/技術名詞/公式
   - sub agent 升級 mode 時不得新增題目,只能從現有 9 檔 questions*.json 抓題
   - 階段 8 push 前需做 source-fidelity audit

---

## 階段 7 詳細進度(目前位置)

### 共用層(src/index.html, ~50KB)
- ✅ SPA 架構(單檔多模組)
- ✅ localStorage:Storage / Progress / Mastery / Wrongbook / Player(角色系統)
- ✅ RNG / shuffle / variable substitution
- ✅ PlayEngine(共用渲染 + 答題 + 解釋頁)
- ✅ DrillSession(三階結構化下鑽)
- ✅ generateVariation(換角度 / 易混淆 / 加深難度,排除原題)
- ✅ renderVisualData(table_data + chart_data 渲染)
- ✅ highlightCodeSimple(共用程式碼語法高亮)
- ✅ GameFX(GSAP + canvas-confetti):flash / damageNumber / shake / attackAnim / confetti / combo / levelUp
- ✅ Player 系統(HP/MP/Level/EXP/4 屬性/技能)
- ✅ CDN 已加:canvas-confetti 1.9.3 + gsap 3.12.5
- ✅ 暗色主題、響應式、Mobile Bottom Nav

### 各案模式(src/modes/)
| 案 | 狀態 | 描述 |
|:-:|:-:|:--|
| 案 1 RPG 顧問救援 | ✅ **完整重做為 RPG**(485 行) | 12 BOSS 戰鬥、HP/Combo/技能、視覺特效全套 |
| 案 2 程式判讀道場 | ⚠️ **初版**(待升級遊戲化) | sub agent 寫的初版,只是 UI 殼包 ABCD |
| 案 3 Pipeline 拼圖 | ⚠️ **初版**(點擊排序) | 待真拖拉 + 視覺管線 |
| 案 4 配對戰 | ⚠️ **初版**(主檔內建) | 待真拖拉 Match-3 風格 + 計時 |
| 案 5 弱點獵人 | ⚠️ **初版** | sub agent 寫的初版,待 RPG 戰鬥升級 |

### 題庫(src/, 9 JSON 檔, 155 題)
```
questions.json                   50  baseline (批 1)
questions-pa-code.json           15  程式判讀(numpy/sklearn/PyTorch/pandas/matplotlib)
questions-pb-visual.json         10  表格判讀(VGG16 完整 39 行 + Transformer + 混淆矩陣 + ROC)
questions-pc-modes.json          15  matching 8 + sequence 4 + calc 3
questions-pd-scenario.json       15  情境決策進化(errata + 高優先 + 跨產業)
questions-pe-advanced-s1.json    12  進階 NLP/CV/GenAI/Multimodal
questions-pf-advanced-s3.json    12  進階 ML 演算法選型
questions-pg-eval.json           13  進階評估/不平衡/CV/調校
questions-ph-mlops.json          13  進階 MLOps/治理/隱私
─────────────────────────────────────────
廢棄:questions-extra.json.deprecated.bak(舊 100 題抄 114-2 風格)
```

### Knowledge Base(kb/, 87 nodes)
- nodes-subject-1.json:28
- nodes-subject-1-extended.json:2(L21201)
- nodes-subject-3.json:25
- nodes-subject-3-extended.json:32
- scope.json / exam-patterns.json / extraction-log.md

---

## Git State

最新 commit:**039b816**(`fix(drill): structured 3-tier drill`)

```
039b816 fix(drill): structured 3-tier drill (換角度/易混淆/加深難度) with strategy header
0538122 feat(phase-7-redo): integrate 50 advanced original questions (total ~155)
d04df19 fix(PlayEngine): render visual data (table) + code syntax highlight in shared layer
b70a68a feat(phase-7-redo): replace 100 low-quality questions with 55 original high-quality
5d57e7f feat(mode1-v2): complete RPG battle system with HP/combo/skills/effects
32dd228 feat(phase-7-redo): mode1 RPG complete + game engine + CDN
dfbd8c3 fix(index.html): replace const ModeN placeholders with dynamic window.ModeN lookup
eb74351 fix(questions-extra): remove trailing comma at line 1119
19c811f feat(phase-7): SPA + 5 game modes complete
29cf760 feat(phase-6): question bank batch 2+3 (total 150 questions)
7a13919 feat(phase-5+6): design + question bank batch 1
... (共 14 commits)
```

Branch:main(尚未推送 GitHub)
Remote:https://github.com/marco3939/ipas-ai-game.git(階段 8 才推)

---

## 模式 B 採用(輕量 bypass)

階段內動作直接執行,只在以下強制停留點停:
- 階段 7 → 8(本機驗收)— 當前位置
- 階段 8 push 前清單

---

## 待辦清單(/compact 後續做)

### 優先 1:案 2/3/5 遊戲化升級(類似案 1 RPG 規格)
- 案 2 程式判讀道場:加 Boss 戰系統、程式碼互動點選、HP/Combo
- 案 3 Pipeline 拼圖:升級為真拖拉 + SVG 管線視覺
- 案 5 弱點獵人:RPG 戰鬥動畫、自適應難度、Boss 戰
- 建議用 sub agent 平行(每個 mode 一個 agent)

### 優先 2:案 4 配對戰升級
- 真拖拉(HTML5 DnD 或自製)
- 計時急速模式 + Combo
- Match-3 風格視覺

### 優先 3:本機驗收(使用者測試)
- 案 1 RPG 體驗測試
- 結構化下鑽機制測試(剛修復:換角度/易混淆/加深難度)
- 表格題視覺資料是否正確渲染

### 優先 4:階段 8 推送 GitHub
push 前清單:
- [ ] LICENSE 雙軌建立(MIT for code + CC BY-NC-SA 4.0 for content)
- [ ] README.md 加完整使用說明
- [ ] dev/ branch 推送 + PR

---

## /clear 或 /compact 後復原指令

```
讀以下檔案恢復脈絡:
1. C:\Users\marco\.ipas-ai-game\docs\progress.md(本檔,完整狀態)
2. C:\Users\marco\.ipas-ai-game\docs\plan.md(歷次決議)
3. C:\Users\marco\.ipas-ai-game\src\index.html(主檔,~50KB)
4. C:\Users\marco\.ipas-ai-game\src\modes\mode1.js(案 1 RPG 完整版,485 行)
5. git log --oneline 看歷史

當前階段 7(網站建置)進行中:
- 案 1 已完整 RPG 化(範本)
- 案 2/3/4/5 待升級為相同遊戲化規格
- 題庫 155 題已就位且 3 鐵律全合規
- 結構化下鑽機制剛修復(commit 039b816)

下一步建議:
- 用 4 個 sub agent 平行重做 案 2/3/4/5 mode 為 RPG 規格
- 或等使用者試玩案 1 給回饋後再決定方向
```

---

## 關鍵檔案路徑速查

```
C:\Users\marco\.ipas-ai-game\
├─ src\
│  ├─ index.html                  # 主檔(SPA + 共用層 + Mode4)
│  ├─ modes\
│  │  ├─ mode1.js                 # ✅ RPG 完整版(485 行範本)
│  │  ├─ mode2.js                 # ⚠️ 待升級
│  │  ├─ mode3.js                 # ⚠️ 待升級
│  │  └─ mode5.js                 # ⚠️ 待升級
│  └─ questions*.json             # 9 檔 155 題
├─ kb\                            # 87 nodes + scope + exam-patterns
├─ docs\
│  ├─ progress.md                 # 本檔
│  ├─ plan.md                     # 歷次決議
│  ├─ design.md                   # 階段 5 設計文件
│  ├─ scope-review.md             # 階段 1 審視
│  ├─ exam-pattern-summary.md     # 階段 2 摘要
│  └─ question-bank-stats.md      # 階段 6 抽樣
├─ 01指引\ 02歷年考題\ 03參考資料\  # gitignored
└─ .gitignore / README.md / CHANGELOG.md
```

---

## 啟動本機 server 指令

```powershell
cd C:\Users\marco\.ipas-ai-game\src
python -m http.server 8000
# 開啟 http://localhost:8000
```
