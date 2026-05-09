# 安全合規審查報告(Public 上架前)

> **審查者**:Claude Sonnet 4.7(security-review sub agent)
> **審查日期**:2026-05-10
> **目的**:`marco3939/ipas-ai-game` private → public 前的完整漏洞審查
> **審查範圍**:整個 git history(34 commits,單 branch `main`)+ 工作目錄
> **審查工具**:`scripts/security-scan-secrets.js`、`scripts/security-scan-xss.js`、人工 code review

---

## 結論

- [ ] PASS 可改 public
- [ ] FAIL 需修補後再改 public
- [x] **CONDITIONAL** 修補建議事項後改 public(P0:0、P1:3、P2:5)

**整體判斷**:技術面安全姿態良好。核心程式無 XSS/RCE/secret leak。**唯一阻擋上架**的兩件事都偏「資訊揭露」性質,不是程式漏洞:

1. **Author git 信箱 `<author-email-redacted>` 已永久寫入 git history**(34 commits 的 author email),public 後即全網可見。改 public 後**不可逆**(除非 force-push rewrite history,需重簽 GitHub 的所有 PR/issue)。
2. **`docs/plan.md:64` 文件內明文列 `<author-email-redacted>`**(冗餘 PII),建議改 public 前先移除。

只要使用者**接受 (1)** 或執行 P1-1 git history rewrite,並完成 (2),即可改 public。

---

## A. 機密外洩

### 掃描方法
- 寫了 `scripts/security-scan-secrets.js`,跑 `git log -p --all -U0`(整 history,3,4MB diff)+ 全工作目錄,以 19 種 secret pattern 比對(AWS / GCP / GitHub PAT / Slack / Stripe / Anthropic / OpenAI / PEM / JWT / Bearer / 通用 password=/api_key=)
- 還做 `git ls-files` 比對「不該被追的檔名」(.env、.aws、id_rsa、.pem、.key)、檢查 `.claude/` 是否被推

### 結果
| 類別 | 結果 |
|:--|:--|
| Git history 全掃 | **0 個 finding**(CRITICAL=0、HIGH=0、MEDIUM=0、LOW=0) |
| 工作目錄全掃 | **0 個 finding** |
| 敏感檔名追蹤 | **0 個 finding**(無 .env、.pem、.key、credentials.json 被推) |
| `.claude/` 追蹤 | **未被推**(`.gitignore` 第 15 行有 `.claude/`,實測 `git ls-files` 找不到 `.claude/`) |
| `.git/config` | **乾淨**(無嵌入 token / personal credential) |

### 細節驗證
- `.gitignore` 已排除:`.env`、`.env.*`、`*.key`、`*.pem`、`*-credentials.json`、`.claude/`、所有 `*.pdf/*.pptx/*.docx/*.xls`(教材)
- `git remote -v`:`https://github.com/marco3939/ipas-ai-game.git`(乾淨,無 token)
- 歷史中曾出現 `src/questions-extra.json`(commit b70a68a 已刪除),內容是題庫不是 secret
- 全 history 沒任何 commit message 提到 token / password / API key

### 唯一暴露:Git author identity
| 欄位 | 值 | 風險評估 |
|:--|:--|:--|
| `author.name` | `Marco Lin` | LOW — 已透過 `marco3939` GitHub handle 可關聯,無新增揭露 |
| `author.email` | `<author-email-redacted>` | **MEDIUM** — 全 34 commits 都帶這信箱,改 public 後即被搜尋引擎索引,可能收到垃圾郵件 / 釣魚信 |

> **這不是漏洞,是 git 設計使然**。但若使用者不希望這信箱關聯到 marco3939 公開 repo,**唯一處理是 push 前 rewrite history**(P1-1 修補建議)或之後接受永久揭露。

**A 段判定**:✅ 無機密外洩。但 author email 是無法移除的 PII,需使用者明確接受或 rewrite。

---

## B. XSS / 注入

### 掃描方法
- 寫了 `scripts/security-scan-xss.js`,在 `src/*.{js,html}`(6 個檔)套 11 條規則
- 重點 sink:`eval` / `new Function` / `document.write` / `setTimeout(string)` / `setInterval(string)` / `location.hash` / `location.search` / `URLSearchParams` / `window.name`
- 加上動態 HTML 拼接:inline `onclick="...${...}..."`、`.innerHTML = ...${...}...`

### 結果
| 規則 | Finding 數 | 風險判定 |
|:--|:-:|:--|
| `eval-call` (CRITICAL) | **0** | ✅ 無動態程式碼執行 |
| `new-function` (CRITICAL) | **0** | ✅ 無 |
| `document-write` (CRITICAL) | **0** | ✅ 無 |
| `settimeout-string` / `setinterval-string` | **0** | ✅ 全部 setTimeout 都用 function 形式,無字串 eval |
| `location.hash` / `location.search` (HIGH) | **0** | ✅ **整 SPA 不讀任何 URL params,完全無 URL 反射攻擊面** |
| `URLSearchParams` / `window.name` | **0** | ✅ 無 |
| `onclick-tmpl` (HIGH) | 2(false positive) | 見下方 §B.1 |
| `innerhtml-tmpl` (INFO) | 22 | 見下方 §B.2 |

### B.1 inline `onclick` 內 `${...}` 細查 — 全部安全
靜態規則旗了 2 處 HIGH(`mode5.js:190`、`mode5.js:859`),但**人工驗證後皆為 false positive**:
- `mode5.js:190`:`onclick="Mode5.engageBoss(${idx})"` — `idx` 是 `.map((b, idx) => ...)` 的陣列 index(必為非負整數)
- `mode5.js:859`:`onclick="Mode5.engageBoss(${s.bossIdx})"` — `s.bossIdx` 是程式內部 state 的 number

掃描還找到 13 處 onclick 內帶 `${...}`(mode1/2/3 boss-key、mode2 boss-key、mode3 q.id 等),全部**插入的字元集都是固定 schema**(boss key 是 hardcoded slug、q.id 是來自 JSON 的 `q_xxxx` 字串、key 是單一 ABCD)。**無使用者輸入流入**。

> **特別讚許**:`mode4.js:540-555` 採用 `data-action="drill"` + `addEventListener` 而非 inline onclick,並先 `esc()` 處理 concept 文字 — 這是 Round 2 修補的範本。

### B.2 `innerHTML = `...${...}` 細查 — 全部安全
22 處 `innerHTML` template literal 注入,插入的變數來源分類:
| 變數來源 | 例 | 評估 |
|:--|:--|:--|
| `Player` 數值 | `${player.hp}`、`${player.mp}` | 純 number,localStorage 來,但內容由程式更新,無使用者輸入 |
| `q.stem` / `o.text` / `q.knowledge_code` 等 | `${q.stem}` | 來自 17 個 JSON 題庫檔(專案作者控制)。**已實測無 `<script>`、`<img onerror=`、`javascript:` 等 payload** |
| 程式碼欄 `q.code_block` | `${highlightCodeSimple(q.code_block)}` | `highlightCodeSimple()` **先做 `&/</>` escape 再貼語法高亮**(`index.html:1142`、`mode1.js:85`、`mode5.js:135`)— ✅ 安全 |
| 配對概念文字 `concept` | mode4 `${conceptA}` | mode4 用 `esc()` 完整 escape 5 個字元(&<>"') — ✅ 安全 |

### B.3 LocalStorage 寫入 → innerHTML 流的「自我 XSS」可行性
**理論場景**:攻擊者透過 DevTools 在 victim 瀏覽器 console 改 `localStorage.setItem('ipas_wrongbook_v1', JSON.stringify([{qid:"');alert(1);//"}]))`,接著:
- `Review.start()` 渲染 `onclick="Review.drillItem('${x.qid}')"` → 注入 alert

**評估**:✅ **可成立但無實質風險**。因為:
1. 攻擊者要先有 victim 瀏覽器 console 存取(已可執行任意 JS)
2. localStorage 是 origin 隔離的,**沒有任何 remote source 寫入路徑**
3. 沒有跨 user 傳染媒介(無 share-link / no remote backend)

這屬於「self-XSS」,瀏覽器威脅模型中**不視為漏洞**(同等級於「使用者貼任意程式碼到 console」)。但若想做 P2 防禦縱深,可在 `Wrongbook.add()` 寫入時 reject 含特殊字元的 qid,或在 `Review.start()` 改用 `data-qid="..."` + `addEventListener`(同 mode4 範式)。

### B.4 視覺資料(table_data / chart_data)的 escape 缺口
`src/index.html:1151` 的 `renderVisualData()`:
```js
headers.forEach(h => html += `<th>${h}</th>`);
// ...
html += `<td class="${cls}">${v != null ? v : ''}</td>`;
```
**`${h}` / `${v}` 未 escape**。但這些值來自 JSON `q.table_data` / `q.table_columns`(專案作者控制),目前實測**無 HTML 字元**,**無實質風險**。但 P2 建議補一個 `escHTML()` 統一處理,作為防禦縱深 — 若日後有第三方貢獻題庫,可避免品質失守即漏洞。

### B 段判定
✅ **無 CRITICAL / HIGH 真實漏洞**。靜態旗的 2 處 HIGH 皆 false positive。22 處 INFO 皆是內部資料(JSON 題庫 + 數值)流入 innerHTML,在當前威脅模型下安全。建議 P2 補上 `escHTML()` 作為防禦縱深。

---

## C. 第三方資源

### 現況(`src/index.html:9-10`)
```html
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
```

### 各項評估
| 檢查項 | 狀態 |
|:--|:--|
| HTTPS | ✅ 全 https |
| 版本 pin | ✅ `@1.9.3`、`@3.12.5` 嚴格 pin,**不是 latest** |
| 路徑 pin | ✅ 完整路徑 `dist/confetti.browser.min.js`,不會跟隨 npm tag 漂移 |
| **SRI integrity hash** | ❌ **缺失** — 若 jsdelivr 被入侵或 MITM,任意 JS 可注入 |
| **crossorigin="anonymous"** | ❌ 缺失(用 SRI 必加) |
| 套件本身有無已知 CVE | ✅ canvas-confetti 1.9.3、GSAP 3.12.5 均無公開 CVE(2026-05 查) |
| jsdelivr 政策 | ✅ Cloudflare 前端,具 CSP/HSTS,本身可信度高 |

### P1 建議的修法(P1-2)
**SRI hash 已實測產生,可直接套用**:

```html
<!-- 把這兩行替換 -->
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"
        integrity="sha384-Rv68Y7adOjMMJc1/xFMcdNvXre/HF51to4GZjBALmXr7ABnVl5V4UajJwBu7zbhN"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"
        integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt"
        crossorigin="anonymous"></script>
```

**驗證方式**:這兩個 SRI hash 是用 `Get-FileHash -Algorithm SHA384` 對 jsdelivr 即時下載的檔案算出,並用 `[System.Security.Cryptography.SHA384]::Create()` 二次交叉驗證,結果一致。**修補後若 hash 不對,瀏覽器會 block 該 script(CSP 級保護)**。

> 這個修補成本極低(2 行加屬性),但效益顯著:擋住「第三方 CDN 被駭」的潛在風險,提升專案整體 trust posture。

### C 段判定
🟡 **CONDITIONAL** — 沒 SRI 不是 critical(jsdelivr 可信度高),但 public 上架後是「可被批評」的姿態瑕疵。**強烈建議 P1 修補**。

---

## D. localStorage 安全

### 全 localStorage 鍵與內容(完整列表)

| Key | 寫入位置 | 內容 | 是否含 PII / 敏感資訊 |
|:--|:--|:--|:--|
| `ipas_progress_v1` | `Progress.init/addSession/addAnswer` | `{started, sessions, totalAnswered, totalCorrect}` 全 number | ❌ 無 |
| `ipas_player_v1` | `Player.save` (mode1/2/3/4/5) | `{hp, hpMax, mp, mpMax, level, exp, expMax, skillPoints, stats:{4 stats}, skills:{3 booleans}}` 全 number/boolean | ❌ 無 |
| `ipas_mastery_v1` | `Mastery.update/drillBonus` | `{[nodeId]: {score, attempts, correct, streak, lastSeen}}` — nodeId 來自 JSON,值全 number | ❌ 無 |
| `ipas_wrongbook_v1` | `Wrongbook.add/markMastered` | `[{qid, nodeId, userChoice('A/B/C/D'), correctChoice, wrongCount, addedAt, lastWrong, mastered, drillCount}]` | ❌ 無 |
| `ipas_settings_v1` | (定義但未使用) | n/a | ❌ |
| `ipas_session_state_v1` | (定義但未使用) | n/a | ❌ |
| `ipas_mode1_industries_v1` | `mode1.js:619` | 產業列表,從 `Mode1.INDUSTRIES` 常量塗(內部) | ❌ |
| `ipas_mode2_bosses_v2` | `mode2.js:700` | bosses 進度,內部 schema | ❌ |
| `ipas_mode3_progress_v1`(STORAGE_KEY) | `mode3.js:34` | mode3 進度,內部 schema | ❌ |
| `ipas_mode5_progress_v1` | `mode5.js:163` | mode5 進度 | ❌ |

### 重要驗證
- **沒有 input 欄、沒有 prompt(),整個遊戲不收任何使用者文字輸入**(已 grep 驗證:`prompt(`、`input.value`、`getElementById(...).value` 全 0 hit)
- **player 不是「玩家姓名」,是固定的「AI 顧問/偵探/工程師」遊戲角色**,角色名硬寫在 mode 檔
- 寫入到 localStorage 的所有字串值,**來源只有兩處**:
  1. JSON 題庫的 `qid` / `nodeId`(專案作者控制)
  2. 單一 ABCD 字元(option key)

### D 段判定
✅ **無任何 PII / token / 敏感資訊寫入 localStorage**。即使 localStorage 全洩(極不可能,因 origin 隔離),也只洩出「使用者錯哪幾題」,不影響任何身份/錢/帳。

---

## E. CSP / 安全 Headers

### 現況
- GitHub Pages **預設不發 CSP / X-Frame-Options 等安全 header**
- `index.html` / `src/index.html` 都**沒有** `<meta http-equiv="Content-Security-Policy">`

### 評估:需不需要 CSP?
| 考量 | 判定 |
|:--|:--|
| 是否有 RCE/XSS 主要 sink? | 否(已驗證,§B) |
| 是否會接收第三方使用者輸入? | 否(無留言、無分享、無 backend) |
| 是否會在 iframe 裡執行? | 否(無 frame-busting 需求) |
| 是否會被瀏覽器擴充注入內容? | **是**(任何網站都會) |
| 是否會被 CDN 入侵注入? | **可能**(已透過 SRI 加固,P1-2) |

### P2 建議的 CSP(若想強化)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'none';
">
```

**注意**:本專案大量使用 inline `style="..."` 與 inline `onclick="..."`(不可避免地需要 `'unsafe-inline'` for script 與 style)。這顯著減弱 CSP 的 XSS 防護效果,但仍提供:
- 限制 script 只能從 self 與 jsdelivr 載入(擋住 attacker 注入第三方 script)
- `frame-ancestors 'none'`:防 clickjacking
- `connect-src 'self'`:擋 fetch 到外部
- `form-action 'none'`:擋 form 偷送資料

**取捨**:加 CSP 是「防禦縱深」(P2),不加也不是 critical。考量目前威脅模型(無使用者輸入、無 backend、SPA),收益相對有限。**但成本極低(1 個 meta 標籤)**,建議納入。

### E 段判定
🟢 不加 CSP 也 **OK**(因攻擊面已小)。**P2 建議加** — 成本低、收益穩。

---

## F. 個資審查

### F.1 Author identity
| 欄位 | 已暴露於 git | 評估 |
|:--|:--|:--|
| Git author name | `Marco Lin` | LOW — 跟 `marco3939` GitHub handle 一致,無增量揭露 |
| Git author email | `<author-email-redacted>` | **MEDIUM** — 改 public 後可被爬蟲索引,**有垃圾郵件/釣魚風險**。**這是無法移除的歷史資料**(除非 force-push rewrite history) |

### F.2 文件中的 PII 明文
| 位置 | 內容 | 嚴重度 | 修補 |
|:--|:--|:--|:--|
| `docs/plan.md:64` | `user.name=Marco Lin / user.email=<author-email-redacted>` | **MEDIUM** | P1-3:刪這行(僅展示流程的歷史筆記,不是運作必需) |
| `LICENSE:3` | `Copyright (c) 2026 marco3939` | LOW | OK,GitHub 帳號是公開的,本來就需要在 LICENSE 表明著作權人 |
| `docs/plan.md`、`progress.md`、`ipas-ai-game-prompt.md`、`CHANGELOG.md` | 多處 `C:\Users\marco\.ipas-ai-game` | LOW | Windows username `marco`。技術上是 PII(可能反推真名),但檔名描述上下文需要,且和 `marco3939` 已關聯 |
| `docs/plan.md:73` | 提到 `.ssh、.claude.json` 風險 | LOW | 是設計筆記(風險登記),非揭露實際內容 |

### F.3 題庫 / 知識庫 PII 掃描
- 全 17 題庫檔(`src/questions*.json`)+ 6 個 kb 檔
- 沒任何 email、台灣手機(`09xx-xxx-xxx`)、身分證(`A123456789`)
- 公司提及:Google、Microsoft、IBM、Apple、Anthropic、Meta —**全為技術討論/產品引用**(VertexAI、Fairlearn、CLIP、Faiss),**非個資/非機密**
- 真實機構提及:**經濟部 IPAS**(政府機關,公開)、**Google AI、Microsoft Research、Facebook AI** 等學術/技術引用 — 全合法
- **未提到任何個人姓名**(除 Marco Lin / marco3939)
- 題目情境的「公司/醫院/銀行」全用 `某公司`、`某金融機構` 等占位詞 — ✅ 正確

### F.4 `claude-code-system-prompt.md`(已 commit, 已追蹤)
- 已在最新 commit `852f54b` 加入,即將公開
- 內容:Claude Code 使用方法論,**無 API token、無 PII**
- 評估:**無敏感性,公開 OK**。但若使用者不希望公開內部 workflow,P2 建議移到 `.gitignore` + `git rm --cached` + 重新 commit

### F 段判定
🟡 **CONDITIONAL** — 主要風險是 (1) git author email,使用者要明確接受;(2) `docs/plan.md:64` 的冗餘明文,**P1 必修**。

---

## G. 攻擊面

### G.1 攻擊面盤點
| 攻擊面 | 存在? | 評估 |
|:--|:--|:--|
| URL 反射(`location.hash` / `search`) | ❌ 不存在 | SPA 完全不讀 URL params(已 grep 驗證) |
| Form 注入 | ❌ 不存在 | 無 form,無使用者輸入欄 |
| Backend RCE | ❌ N/A | 純前端 SPA,無後端 |
| LocalStorage 跨站讀取 | ❌ N/A | 同源策略保護,無洩漏點 |
| 第三方 CDN tampering | 🟡 LOW | jsdelivr 信譽佳,但缺 SRI(P1-2) |
| Postmessage / iframe 攻擊 | ❌ 不存在 | 無 frame、無 postMessage |
| 上傳檔案 | ❌ 不存在 | 無上傳 |
| Service Worker | ❌ 不存在 | 無 SW |
| 自我 XSS via DevTools | 🟢 N/A | 受瀏覽器威脅模型保護 |
| Browser extension XSS | 🟡 ALL SITES | 不是專案責任,通用風險 |
| Clickjacking | 🟡 LOW | 無敏感操作可被劫持(無登入、無付費)。GH Pages 預設無 X-Frame-Options |

### G.2 GitHub Pages 部署層風險
- GH Pages 是 GitHub 託管,Anti-DDOS、TLS 1.2+、HSTS 都有
- 部署 URL `marco3939.github.io/ipas-ai-game` 可被任意人 fork → 別人複製內容並無風險(已 CC BY-NC-SA 授權)
- 攻擊者可開假 fork 加 malware,但**這是 GitHub 普遍生態問題,不是本專案能解**
- 建議在 README 加「**官方連結唯一是 https://github.com/marco3939/ipas-ai-game**」防偽聲明(P2)

### G.3 Wrongbook / Mastery 跨站洩漏
- localStorage 同源限制,**只有 marco3939.github.io 自己讀得到**
- 無 cookie / 無第三方追蹤(已驗證:無 google analytics、無 hotjar、無任何 tracker)
- 改 public 後**沒有任何資料離開使用者瀏覽器**

### G 段判定
✅ 攻擊面**極小且封閉**。SPA 純前端純讀本地 JSON 是「最低風險拓樸之一」。

---

## 修補建議(按優先級)

### P0 — 阻擋上架(無)
**無 P0 項目**。所有掃描通過,沒有發現直接導致 RCE / 機密外洩 / Critical XSS 的問題。

### P1 — 強烈建議改 public 前完成

#### P1-1 決策:author email 是否 rewrite history?
**選項 A**(推薦,簡單):接受 `<author-email-redacted>` 永久揭露於 git history。後續用獨立 commit email 寫新 commit(`git config user.email` 在這個 repo 改成 noreply 形式,如 `xxxxxxx+marco3939@users.noreply.github.com`)。
**選項 B**(複雜):改 public 前 `git filter-repo --email-callback` 改寫所有 commit author email。但會破壞 commit SHA,所有人需重 clone。

> **建議選 A**:多數開源專案 maintainer 都揭露真實 email,這是常態,且**該信箱既有的 marco3939 GitHub handle 已關聯,改寫也無實質隱私收益**。
>
> **若決定選 A**,建議至少做一件事:在 GitHub `Settings → Emails → Block command line pushes that expose my email` 開啟,並改用 `xxxxxxx+marco3939@users.noreply.github.com` 做未來 commit。

#### P1-2 [必做] 加 SRI integrity 給 CDN script
**位置**:`src/index.html:9-10`
**修法**(已驗證 hash):
```html
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"
        integrity="sha384-Rv68Y7adOjMMJc1/xFMcdNvXre/HF51to4GZjBALmXr7ABnVl5V4UajJwBu7zbhN"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"
        integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt"
        crossorigin="anonymous"></script>
```
**為何重要**:防 jsdelivr 被入侵 / MITM 攻擊。成本 2 行屬性,效益顯著。

#### P1-3 [必做] 移除 `docs/plan.md:64` 明文 email
**位置**:`docs/plan.md:64`
```diff
- - 全域 config 已設:`user.name=Marco Lin` / `user.email=<author-email-redacted>`
+ - 全域 config 已設(沿用 git global,具體值見 `git config --global --get user.email`)
```
或乾脆刪整個 Q3 區塊(已是歷史筆記,不影響專案運作)。

### P2 — 建議但可不做

#### P2-1 加 CSP meta(防禦縱深)
**位置**:`src/index.html` `<head>` 內
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none';">
```
若 PR 接受第三方題庫貢獻,此 CSP 可避免品質失控時的 XSS payload。

#### P2-2 統一 escape helper
在 `src/index.html` 共用層加:
```js
const escHTML = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
```
然後把 `renderVisualData()` 內的 `${h}` / `${v}`、`${q.stem}` 等通通包 `escHTML(...)`。當前 JSON 是 trusted,但**若日後接受社群 PR 加題**,有此 escape 可保底。

#### P2-3 把 `Wrongbook` UI 改 `data-qid` + addEventListener
仿 mode4 做法,把 `src/index.html:975` 的 `onclick="Review.drillItem('${x.qid}')"` 改成 `data-qid="${x.qid}"` + delegated listener。一致性更好,徹底消除 inline-onclick attribute → JS string 雙解碼風險。

#### P2-4 README 加「官方連結」防偽聲明
README 開頭加一段:
> **官方專案位置唯一是 [`https://github.com/marco3939/ipas-ai-game`](https://github.com/marco3939/ipas-ai-game)。其他複製版本本作者不背書、不對其安全/正確性負責。**

#### P2-5 評估 `claude-code-system-prompt.md` 與 `CLAUDE.md` 是否要保留
這兩個檔目前**已 commit 在 main**(commit `852f54b`)。內容是 Claude Code 工作流方法論,不含 secret/PII。**保留也 OK**(讓人看到專案如何用 AI 協作,反而有教育價值)。**移除也 OK**(若希望內部 workflow 不公開)。建議**保留**,因為 README 已經提到「Anthropic Claude Code 協作開發」,內容呼應。

---

## 附錄

### 檢查產生的檔
- `scripts/security-scan-secrets.js` — 機密外洩掃描器(全 git history + 工作目錄)
- `scripts/security-scan-secrets.report.json` — 掃描結果(0 finding)
- `scripts/security-scan-xss.js` — XSS sink 掃描器(`src/*.{js,html}`)
- `scripts/security-scan-xss.report.json` — 24 finding(2 false-positive HIGH + 22 INFO 內部資料)

### 重新跑掃描
```powershell
cd C:\Users\marco\.ipas-ai-game
node scripts/security-scan-secrets.js
node scripts/security-scan-xss.js
```

### 若改 public 前要再跑一次
強烈建議在 push 上架前最後一次跑這兩個 script,以防中間有新 commit 帶入 secret。

---

## 終局清單(改 public 前)

- [ ] **P1-1**:決定 author email 處理方式(A 接受 / B rewrite)。若選 A,在 GitHub 設定中開啟 email 保護
- [ ] **P1-2**:加 SRI integrity 到 `src/index.html` 的兩個 CDN script(2 行屬性 + 1 個 crossorigin)
- [ ] **P1-3**:刪除 `docs/plan.md:64` 的明文 email
- [ ] **(可選 P2)** 加 CSP meta、`escHTML()`、Wrongbook 改 addEventListener、README 防偽聲明
- [ ] **最終驗證**:跑一次 `node scripts/security-scan-secrets.js` + `node scripts/security-scan-xss.js`,確認仍 0 critical / 0 真 high
- [ ] **最後一步**:GitHub Settings → Danger Zone → Change visibility → Public

完成 P1-2、P1-3 + 接受 P1-1(A 選項)即可改 public。
