# Claude Code 自動讀取入口

> 此檔由 Claude Code 自動讀取。完整規則散在另兩份文件中,請依序閱讀。

## 你必須先讀的兩份文件(順序不可顛倒)

### 1. 工作流框架 — `claude-code-system-prompt.md`
規範**如何派 sub agent、如何交叉驗證、如何防止單一 agent 自我背書**。

核心原則:
- **Trust nothing, verify everything** — 任何 sub agent 結果以 git diff + audit 為準
- **Never single-validation** — Worker 做完 → Validator 獨立交叉驗證(不看 Worker 摘要)
- **Audit script > self-report** — 機器稽核優先於 agent 自述
- **Don't let sub agents over-engineer** — 禁止主動防呆 / 重構,否則引入新 bug

### 2. 專案 Spec — `ipas-ai-game-prompt.md`
規範**這個專案的鐵律、契約、結構、開發階段、案例庫**。

核心:
- 五大鐵律(錯題下鑽 / 題庫動態 / 不抄 114-2 / 選項長度均衡 / 來源忠實)
- 共用層 API 契約(`let/const` 不掛 window 規則)
- 17 題庫檔 / 5 mode 檔結構
- Sub agent 派送模板 + 自驗模板
- 7 個 Round 1/2 案例庫

---

## 使用流程(任何接手任務的 Claude Code session)

```
1. 讀本檔 → 知道有 framework + spec 兩份
2. 讀 claude-code-system-prompt.md → 知道工作流模式
3. 讀 ipas-ai-game-prompt.md → 知道專案規則
4. 看 docs/progress.md → 知道當前進度
5. 開始任務:
   a. 拆分 → 決定 worker 配置(用 framework §2 決策樹)
   b. 派 worker(prompt 模板用 framework §3.1)
   c. worker 完成 → 派 validator(prompt 模板用 framework §3.2)
   d. validator 完成 → orchestrator 跑 ground truth(framework §7)
   e. 全 PASS → commit(checklist 用 framework §10)
6. 新 bug 模式 / 新規則 → 同步更新對應 spec 檔
```

---

## 鐵則摘要(不背完整文件,至少記這幾條)

1. **Sub agent 摘要 ≠ ground truth**,永遠跑 audit + git diff
2. **Validator 不看 Worker 摘要**,只看 ground truth
3. **不可逆動作問使用者**(push --force / 改 visibility / 刪檔)
4. **超過 20 條的批次必拆**(避免 stall)
5. **`window.X` 讀取前必 grep `let/const X`**(避開 Round 1 critical bug)
6. **3 輪 fix-verify 失敗 → escalate 給使用者**
7. **任何鐵律違反 / 安全漏洞 → 立即停 push,等使用者裁定**

---

## 重要檔案速查

| 檔案 | 用途 |
|:--|:--|
| `CLAUDE.md`(本檔) | Claude Code 自動讀取入口 |
| `claude-code-system-prompt.md` | 工作流框架(派工 + 交叉驗證) |
| `ipas-ai-game-prompt.md` | 專案 spec(鐵律 + 契約 + 結構) |
| `docs/progress.md` | 當前進度快照 |
| `scripts/audit-*.js` | 自動化稽核(ground truth) |
| `scripts/kb-allowed-nodes.json` | sub agent 寫題白名單 |
| `scripts/check-globals*.js` | 跨檔契約掃描 |

---

> 違反「先讀 framework 與 spec 才開始任務」= 累積技術債。
