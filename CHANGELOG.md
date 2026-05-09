# Changelog

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/),版本管理採 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added — 2026-05-09(階段 0)
- 專案骨架:`kb/`、`src/`、`docs/` 目錄
- `.gitignore`(排除 materials 三個資料夾、所有 PDF/PPTX/DOCX、`.claude/`、敏感檔案類型)
- `docs/progress.md`(進度追蹤,/clear 後復原依據)
- `docs/plan.md`(各階段決議與風險登記)
- `README.md`(基本說明,階段 7 補完)
- Git 初始化於 `C:\Users\marco\.ipas-ai-game`,remote `origin` 指向 `marco3939/ipas-ai-game`

### Notes
- 工作目錄已從 `%USERPROFILE%\Documents\Claude\Projects\ipas-ai-game` 遷移至 `%USERPROFILE%\.ipas-ai-game`,理由見 `docs/plan.md`「環境意外」段。

### Added — 2026-05-09(階段 1)
- `kb/scope.json`:34 個官方知識編碼之納入/排除判定,29 納入 + 5 排除
- `docs/scope-review.md`:三欄對照表、邊界判定邏輯、勘誤要點、審視檢查清單(供使用者人工審視)
- 採用模式 B(輕量 bypass):階段內動作直接執行,僅在決策節點強制停
- 修正官方 PDF 排版錯字:科三 L233 之 L22303/L22304 → 正確 L23303/L23304

### Added — 2026-05-09(階段 2)
- `kb/exam-patterns.json`:114-2 考古題 100 題完整解析(科一+科三,科二邊界跳過)
- `docs/exam-pattern-summary.md`:Top 15 高頻主題、14 組易混淆配對、Python 程式碼考點、題型分布、權重建議
- 7 個高優先預測(Recall 公式、PDPA 六項、VGG16、DBSCAN、CV 方法、Drift、VAE/GAN/Diffusion)
- 題庫設計權重:科一 50% / 科三 50%,題型 70% 概念 + 20% 程式碼 + 5% 圖表 + 5% 計算
