// ============================================================
// Mode 2: 程式判讀道場 — Bug 獵人 RPG(v2 完整 RPG 化)
// 鐵律 #1+#5 全合規:錯題下鑽 + 題目來源忠實(只用 questions-pa-code.json + questions.json)
// 主角:資料科學偵探;BOSS:程式語意惡魔(6 種主題)
// ============================================================
(function () {
  'use strict';

  // === 9 個程式判讀 BOSS(主題分組,題目來自題庫,絕不造題)===
  // 分組依據:tags / knowledge_code(L23102=numpy / L23202=sklearn / L23302=pytorch /
  // L23402=pandas / L23502=matplotlib / L23101=機率)
  // 2026-05-16 新增 3 個 L22 大數據 BOSS(全 35 題 L22 code_reading 接入,1:1 對應 batch 檔):
  //  - 資料管線靈(15 q from n22):L22201 清理 / L22301 統計 / L22302 分析方法
  //  - 大數據鑑別 AI 靈(10 q from n23):L22401 大數據 ML / L22402 鑑別式 AI
  //  - 生成式 AI + 隱私靈(10 q from n24):L22403 生成式 AI / L22404 隱私合規
  const BOSSES = [
    // 2026-05-17:L23 程式 BOSS 題庫 ×3 擴增(numpy 5→15 / sklearn 4→12 / pytorch 2→12 / pandas 2→6 / viz 4→12 / mc 1→3)
    // 配合「每場最多 5 題隨機」(pickQuestionsForBoss 內 maxN=5),qids 池放大讓每場抽題不重複機率提升
    {
      key: 'numpy',
      name: '🔢 NumPy 矩陣惡魔',
      avatar: '🔢',
      desc: '線性代數的化身,玩弄維度與形狀的詭計',
      qids: ['q_pa_001', 'q_pa_002', 'q_pa_003', 'q_pa_004', 'q_pa_005',
             'q_pa_np_001','q_pa_np_002','q_pa_np_003','q_pa_np_004','q_pa_np_005',
             'q_pa_np_006','q_pa_np_007','q_pa_np_008','q_pa_np_009','q_pa_np_010'],
      hp: 140,
      intro: '「凡人...你以為看得懂這個矩陣?dot 與 *、跡與行列式、L1 與 L2... 這些細節會讓你血債血還。」',
      attack: ['「形狀對不上!」','「shape 看反了吧?」','「einsum 也不會讀?」'],
      defeat: ['「該死...連對角矩陣的反矩陣都被你算出...」','「線性代數的高牆被你攻破了。」']
    },
    {
      key: 'sklearn',
      name: '🤖 Sklearn API 守門者',
      avatar: '🤖',
      desc: '掌管 fit_transform 與 KFold,API 簽名的守護惡靈',
      qids: ['q_pa_006', 'q_pa_007', 'q_pa_008', 'q_pa_009',
             'q_pa_sk_001','q_pa_sk_002','q_pa_sk_003','q_pa_sk_004',
             'q_pa_sk_005','q_pa_sk_006','q_pa_sk_007','q_pa_sk_008'],
      hp: 130,
      intro: '「PCA 後的 shape 是什麼?StandardScaler 跟 MinMax 哪個是哪個?coef_ 是 1D 還是 2D?犯一個錯,你的模型就崩了。」',
      attack: ['「API 用錯了!」','「sklearn 慣例你都不熟?」','「fit 跟 fit_transform 你分得清?」'],
      defeat: ['「(n_samples, n_features) 居然這麼牢...」','「我承認你已掌握 API 的精髓。」']
    },
    {
      // 修補 2026-05-17:原 qids 含 q_pa_011/012 兩個不存在 ID(歷史殘存),已刪除;新增 q_pa_pt_001~010 共 10 題擴增到 12 個有效 qids
      key: 'pytorch',
      name: '🔥 PyTorch 訓練幽靈',
      avatar: '🔥',
      desc: 'Linear 形狀、訓練迴圈與張量 shape 的混淆師',
      qids: ['q_pa_010', 'q_0029',
             'q_pa_pt_001','q_pa_pt_002','q_pa_pt_003','q_pa_pt_004','q_pa_pt_005',
             'q_pa_pt_006','q_pa_pt_007','q_pa_pt_008','q_pa_pt_009','q_pa_pt_010'],
      hp: 130,
      intro: '「Linear 改的是哪個軸?zero_grad 漏了會怎樣?訓練迴圈裡的細節,我是專家。」',
      attack: ['「梯度累加爆了!」','「loss 永遠下不去!」','「shape 對不上!」'],
      defeat: ['「我的訓練陷阱全被你破解...」','「PyTorch 的細節已是你的本能。」']
    },
    {
      key: 'pandas',
      name: '📊 Pandas 資料惡靈',
      avatar: '📊',
      desc: 'fillna 與 drop_duplicates、groupby 與 agg 的詭計大師',
      qids: ['q_pa_013', 'q_pa_014',
             'q_pa_pd_001','q_pa_pd_002','q_pa_pd_003','q_pa_pd_004'],
      hp: 90,
      intro: '「DataFrame 的細節最折磨人。groupby 後 key 還在嗎?agg 的 columns 是什麼?快猜!」',
      attack: ['「shape 對不上!」','「columns 找不到!」'],
      defeat: ['「pandas 的別名與索引機制...你居然全記得。」']
    },
    {
      // 主題重構:原 matplotlib 圖譜妖因 q_pa_015 被刪(語法超 IPAS 中級範圍)而失去題池;
      // 改為「資料視覺化判讀靈」,題池改用 questions-pb-visual.json 的視覺化判讀題
      // (參數量表 / 混淆矩陣 / ROC 曲線),題庫忠實、不造題(鐵律 #5)
      key: 'visualization',
      name: '📊 資料視覺化判讀靈',
      avatar: '📊',
      desc: '參數量表、混淆矩陣、ROC 曲線:讀懂視覺資料才能擊敗他',
      qids: ['q_pb_001', 'q_pb_007', 'q_pb_009', 'q_pb_010',
             'q_pb_011','q_pb_012','q_pb_013','q_pb_014',
             'q_pb_015','q_pb_016','q_pb_017','q_pb_018'],
      hp: 100,
      intro: '「凡人...VGG16 參數量哪一層最多?F1 不是算術平均、是調和平均;ROC 曲線下面積你會用梯形法則嗎?把這些表讀對,我才認你。」',
      attack: ['「Accuracy 陷阱!不平衡資料看 F1 啊!」','「ROC 點看歪了吧?」','「FC 跟 Conv 參數量差幾倍?」'],
      defeat: ['「TP/FP/FN/TN... 你居然全部記得。」','「視覺資料的真相,被你看穿了。」']
    },
    {
      key: 'probability',
      name: '🎲 Monte Carlo 機率魔',
      avatar: '🎲',
      desc: '條件機率程式化:P(A|B) 的分母永遠是 B',
      qids: ['q_0024','q_pa_mc_001','q_pa_mc_002'],
      hp: 70,
      intro: '「P(A|B) 還是 P(B|A)?分母擺哪個?Monte Carlo 模擬最容易把人騙倒。」',
      attack: ['「條件反了!」','「貝氏定理不會用?」'],
      defeat: ['「機率程式的本質...你看穿了。」']
    },
    // 2026-05-16 全 35 題 L22 code_reading 接入 Mode 2(3 主題 BOSS 取代原 2 BOSS)
    // 對應 questions-batch-n22/n23/n24-L22-code-*.json 三批,每 BOSS 對應一個 batch 檔
    {
      key: 'l22_pipeline',
      name: '🗄️ 資料管線靈',
      avatar: '🗄️',
      desc: 'pandas/numpy/statsmodels 全題:清理、IQR、merge、加法分解、Markov、Apriori、time series',
      qids: ['q_n22_001','q_n22_002','q_n22_003','q_n22_004','q_n22_005',
             'q_n22_006','q_n22_007','q_n22_008','q_n22_009','q_n22_010',
             'q_n22_011','q_n22_012','q_n22_013','q_n22_014','q_n22_015'],
      hp: 375,
      intro: '「ETL 大數據管線 15 道題,從 dropna 到 Markov 穩態,從加法分解到 Apriori 頻繁項集 — 一個 axis 寫錯,整批資料就毀了。」',
      attack: ['「fillna(0) 把 mean 拉低了!」','「inner join 列數又算錯!」','「Apriori 頻繁項集數弄錯!」'],
      defeat: ['「資料管線靈的精髓...你掌握了。」','「ETL pipeline 全流程清晰,可獨當一面。」']
    },
    {
      key: 'l22_discriminative_ai',
      name: '🤖 大數據鑑別 AI 靈',
      avatar: '🤖',
      desc: 'sklearn 全 10 題:不平衡切分、SMOTE、weighted/macro precision、AUC、Precision@K',
      qids: ['q_n23_001','q_n23_002','q_n23_003','q_n23_004','q_n23_005',
             'q_n23_006','q_n23_007','q_n23_008','q_n23_009','q_n23_010'],
      hp: 250,
      intro: '「stratify、class_weight、SMOTE、weighted precision、ROC AUC、Precision@K — 10 道大數據×鑑別式 AI 評估題,搞錯一個指標模型就誤導決策。」',
      attack: ['「class_weight balanced 公式錯了!」','「multi_class AUC 形狀錯了!」','「P@K 分母搞錯了!」'],
      defeat: ['「鑑別式 AI 評估指標...你全掌握了。」','「不平衡資料思維清晰,模型上線無懼。」']
    },
    {
      key: 'l22_generative_privacy',
      name: '🔐 生成式 AI + 隱私靈',
      avatar: '🔐',
      desc: 'tokenization / corpus 去重 / TfidfVectorizer / k-匿名 / 差分隱私 / GDPR 抹除',
      qids: ['q_n24_001','q_n24_002','q_n24_003','q_n24_004','q_n24_005',
             'q_n24_006','q_n24_007','q_n24_008','q_n24_009','q_n24_010'],
      hp: 250,
      intro: '「LLM 預訓練語料、去重、Tfidf、k-匿名、Laplace DP 加噪、GDPR 抹除 — 10 道生成式 AI + 隱私合規題。一個 ε 寫錯就違反 GDPR。」',
      attack: ['「k-匿名最小群你看走眼!」','「DP 的 ε 方向反了!」','「sha256 假名化長度算錯!」'],
      defeat: ['「生成式 AI 資料治理 + 隱私合規...你看穿了。」','「跨國法務團隊都會聽你的判斷。」']
    }
  ];

  // === 取題:嚴格從 BOSS 的 qids 抓,缺題就少出(鐵律 #5)===
  // 案例 10 audit BUG-X1:HTML escape helper(defense-in-depth)
  // 2026-05-19 R1 simplify:改用 window.escHTML(集中 helper)
  const esc = escHTML;

  // 2026-05-17:配合 L23 BOSS qids ×3 擴增,加「每場最多 5 題隨機」限制
  // 設計理由:擴增後 numpy/sklearn/pytorch/viz BOSS 各 12-15 題,一場全打太累贅;
  //   用 5 題上限 + 隨機抽,讓玩家可以多次挑戰同一 BOSS 都有新鮮感
  const MAX_QUESTIONS_PER_BATTLE = 5;
  function pickQuestionsForBoss(boss, maxN) {
    if (maxN === undefined) maxN = MAX_QUESTIONS_PER_BATTLE;
    const list = [];
    for (const id of boss.qids) {
      const q = QUESTIONS.find(x => x.id === id);
      if (q) list.push(q);
    }
    // 跨關卡排除已答對(SeenCorrect):filter 後若不足 1 題則 fallback 回原 list
    let pool = list;
    if (typeof SeenCorrect !== 'undefined' && list.length > 0) {
      const fr = SeenCorrect.filterForBattle(list, 1);
      if (fr.fallback) showToast(`「${esc(boss.name||'本 BOSS')}」全題已答對過,允許重複再戰`);
      else if (fr.pool.length < list.length) pool = fr.pool;
    }
    // 隨機洗牌後取最多 maxN 題(2026-05-17:用 RNG.set(Date.now()) seed 保證每場不同序)
    return RNG.shuffle(pool).slice(0, maxN);
  }

  // 動態調整 BOSS HP 以匹配實際存活題數(避免題庫被刪後出現「打不完」殘血的視覺殘留)
  // 公式對齊 lvl 1 baseDmg≈27:每題 25 HP 為最低保證玩家答對全題能歸零 BOSS,最高不超過原 hp
  // 1 題 BOSS:25 HP → 1 hit 27 dmg 可清(probability)
  // 2 題 BOSS:50 HP → 2 hits 54 dmg 可清(pytorch reduced / pandas)
  // 5 題 BOSS:125 HP(被原 140 cap)→ 5 hits 135 dmg 可清(numpy)
  function effectiveBossHp(boss, qcount) {
    if (qcount <= 0) return 0;
    const perQ = 25;
    const calc = qcount * perQ;
    return Math.min(boss.hp, Math.max(perQ, calc));
  }

  // === 招式系統 ===
  // 1. 靜態分析(消耗 8 MP):顯示 hook(記憶口訣)
  // 2. 執行模擬(消耗 14 MP):去除一個錯選項
  // 3. Code Review(消耗 18 MP):顯示 misconceptions 與此題陷阱
  // 招式為 Mode2 專屬,不依賴 Player.skills(那是 Mode1 的解鎖系統)

  const Mode2 = {
    state: null,
    // 案例 10 deep-audit Agent H Finding 1:加 timer 管理(原本 goHome 的 Mode2._clearAllTimers guard 永遠 falsy)
    _pendingTimers: [],
    _scheduleTimeout(fn, delay) {
      const id = setTimeout(() => {
        this._pendingTimers = this._pendingTimers.filter(x => x !== id);
        fn();
      }, delay);
      this._pendingTimers.push(id);
      return id;
    },
    _clearAllTimers() {
      this._pendingTimers.forEach(id => clearTimeout(id));
      this._pendingTimers = [];
      if (typeof _setExamMode === 'function') _setExamMode(false);
    },

    start() {
      this.stopTypeText();
      this._clearAllTimers();   // 案例 10 deep-audit Agent H Finding 1:進場清舊 timer
      // 清掉殘留 state(避免從戰鬥中按「退避」回地圖後,先前 takeDamage 排好的
      // 1.5s gameOver setTimeout 仍會用 state.gameOverPending 觸發,把地圖蓋掉)
      this.state = null;
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      this.renderMap();
    },

    bossesState() { return Storage.get('ipas_mode2_bosses_v2', {}); },

    renderMap() {
      const player = Player.load();
      const bossesS = this.bossesState();
      const defeatedCount = Object.values(bossesS).filter(x => x.defeated).length;
      const playerHpPct = player.hp / player.hpMax * 100;
      const view = document.getElementById('view-play');

      view.innerHTML = `
        <div class="card">
          <h1>💻 程式判讀道場 — Bug 獵人</h1>
          <p style="color:var(--fg-dim)">你是資料科學偵探,要在 9 個程式語意惡魔的領域中找出陷阱(含 3 個科二大數據主題,共 35 題 L22 code)。答對攻擊 BOSS,答錯被反擊並進入下鑽訓練。</p>
        </div>

        <div class="battle-arena" style="padding:16px">
          <div class="player-bar">
            <div class="avatar">🕵️</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${player.level}</span> 資料科學偵探(你)</div>
              <div class="hp-track"><div class="hp-fill ${playerHpPct < 30 ? 'critical' : playerHpPct < 60 ? 'low' : ''}" style="width:${playerHpPct}%"></div></div>
              <div class="hp-text">HP ${player.hp} / ${player.hpMax} · MP ${player.mp} / ${player.mpMax} · EXP ${player.exp}/${player.expMax}</div>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:var(--fg-dim)">
            <span>💪 分析 ${player.stats.analysis}</span>
            <span>📋 規劃 ${player.stats.planning}</span>
            <span>🧠 決策 ${player.stats.decision}</span>
            <span>⚙️ 技術 ${player.stats.technical}</span>
            <span>🏆 已破關 ${defeatedCount}/${BOSSES.length}</span>
          </div>
        </div>

        <div class="card">
          <h3>🛠️ 偵探招式(每場戰鬥可用,消耗 MP)</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:0.85rem;color:var(--fg-dim)">
            <div style="padding:8px;background:var(--bg-3);border-radius:6px;border-left:3px solid #38bdf8">
              <strong style="color:#38bdf8">🔍 靜態分析(8 MP)</strong><br>顯示題目記憶口訣(hook)
            </div>
            <div style="padding:8px;background:var(--bg-3);border-radius:6px;border-left:3px solid #facc15">
              <strong style="color:#facc15">⚡ 執行模擬(14 MP)</strong><br>消除一個錯誤選項
            </div>
            <div style="padding:8px;background:var(--bg-3);border-radius:6px;border-left:3px solid #a855f7">
              <strong style="color:#a855f7">📋 Code Review(18 MP)</strong><br>顯示常見誤解與陷阱類型
            </div>
          </div>
        </div>

        <div class="card">
          <h2>⚔️ 選擇程式惡魔(BOSS)</h2>
          <div class="modes-grid">
            ${BOSSES.map(b => {
              const st = bossesS[b.key];
              const cleared = st && st.defeated;
              const perfect = st && st.perfectClear;
              const qcnt = b.qids.filter(id => QUESTIONS.find(x => x.id === id)).length;
              const dynHp = effectiveBossHp(b, qcnt);
              const disabled = qcnt === 0;
              const reducedNote = qcnt > 0 && qcnt < b.qids.length ? `<span style="color:var(--warn);font-size:0.7rem">(題庫減量,HP 已下調)</span>` : '';
              const emptyNote = disabled ? `<div style="margin-top:6px;color:var(--danger);font-size:0.75rem">⚠️ 題庫補強中,暫時無法挑戰</div>` : '';
              const titleAttr = disabled ? 'title="此 BOSS 對應題目已下架,等待新題補充"' : '';
              return `<button class="mode-card" onclick="Mode2.selectBoss('${b.key}')" ${disabled ? 'disabled' : ''} ${titleAttr} style="${cleared ? 'opacity:0.7;border-color:var(--success);' : ''}${disabled ? 'opacity:0.45;cursor:not-allowed;' : ''}">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                  <span style="font-size:2rem">${b.avatar}</span>
                  <div>
                    <div class="mode-num">${disabled ? '🚧 題庫補強中' : (cleared ? (perfect ? '⭐ 完美通關' : '✅ 已通關') : '未通關')}</div>
                    <div class="mode-title" style="font-size:0.95rem">${esc(b.name)}</div>
                  </div>
                </div>
                <div class="mode-desc" style="font-size:0.85rem">${esc(b.desc)}</div>
                <div class="mode-stats">HP ${dynHp} · ${qcnt} 題判讀 ${reducedNote}</div>
                ${emptyNote}
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-ghost" onclick="goHome()">🏠 回主頁</button>
          <button class="btn btn-ghost" onclick="if(confirm('重置案 2 的 BOSS 進度?'))Mode2.resetProgress()">🔄 重置道場進度</button>
        </div>
      `;
      show('view-play');
    },

    resetProgress() {
      Storage.del('ipas_mode2_bosses_v2');
      this.start();
    },

    selectBoss(key) {
      // 切換 BOSS 前先停掉前一個打字機,避免殘留 timer 寫到已銷毀 DOM
      this.stopTypeText();

      const boss = BOSSES.find(b => b.key === key);
      if (!boss) return;
      // M1 修補(2026-05-19):連挑同 BOSS 兩場 reseed,避免抽到一樣的題序
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      const questions = pickQuestionsForBoss(boss);
      if (questions.length === 0) {
        showToast('⚠️ 此 BOSS 對應題目已下架,題庫補強中');
        return;
      }

      const dynHp = effectiveBossHp(boss, questions.length);

      this.state = {
        boss,
        bossHp: dynHp,
        bossHpMax: dynHp,
        questions,
        idx: 0,
        combo: 0,
        maxCombo: 0,
        correct: 0,
        wrong: 0,
        totalDamage: 0,
        currentQ: null,
        answered: false,        // 答題鎖,防快速連點同一題
        gameOverPending: false, // hp=0 後的 game-over 等待中
        eliminated: new Set(),  // 已被「執行模擬」消除的選項 key
      };
      if (typeof _setExamMode === 'function') _setExamMode(true, 'Mode 2 程式判讀道場');

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena">
          <div class="enemy-bar">
            <div class="avatar boss" style="font-size:2.5rem">${boss.avatar}</div>
            <div class="bar-info">
              <div class="bar-name">${esc(boss.name)}</div>
              <div class="hp-text">HP ${dynHp} · ${questions.length} 題程式判讀${questions.length < boss.qids.length ? ' (題庫減量)' : ''}</div>
            </div>
          </div>
          <div class="dialogue-box">
            <div class="dialogue-name">${esc(boss.name)}</div>
            <div class="dialogue-text" id="m2-intro-text"></div>
          </div>
          <div class="actions" style="margin-top:16px;justify-content:center">
            <button class="btn btn-primary" onclick="Mode2.startBattle()" style="font-size:1.1rem;padding:14px 28px">🔍 開始判讀!</button>
            <button class="btn btn-ghost" onclick="Mode2.start()">退避</button>
          </div>
        </div>
      `;
      show('view-play');
      this.typeText('m2-intro-text', boss.intro, 28);
    },

    typeText(id, text, speedMs = 28) {
      this.stopTypeText();
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = '';
      let i = 0;
      this._typeTimer = setInterval(() => {
        // DOM 可能被換掉(快速切 BOSS),保險再查一次
        const cur = document.getElementById(id);
        if (!cur) { this.stopTypeText(); return; }
        if (i >= text.length) { this.stopTypeText(); return; }
        cur.textContent += text[i++];
      }, speedMs);
    },

    stopTypeText() {
      if (this._typeTimer) {
        clearInterval(this._typeTimer);
        this._typeTimer = null;
      }
    },

    startBattle() {
      this.stopTypeText();
      this.renderBattle();
      this.showQuestion();
    },

    renderBattle() {
      if (!this.state) return;
      const p = Player.load();
      const view = document.getElementById('view-play');
      if (!view) return;
      view.innerHTML = `
        <div class="battle-arena" id="m2-arena">
          <div class="enemy-bar">
            <div class="avatar boss" id="m2-boss-avatar" style="font-size:2.5rem">${this.state.boss.avatar}</div>
            <div class="bar-info">
              <div class="bar-name">${esc(this.state.boss.name)}</div>
              <div class="hp-track"><div class="hp-fill" id="m2-boss-hp-fill" style="width:100%"></div></div>
              <div class="hp-text" id="m2-boss-hp-text">${this.state.bossHp} / ${this.state.bossHpMax}</div>
            </div>
          </div>
          <div class="player-bar">
            <div class="avatar" id="m2-player-avatar">🕵️</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${p.level}</span> 資料科學偵探</div>
              <div class="hp-track"><div class="hp-fill" id="m2-player-hp-fill"></div></div>
              <div class="hp-text" id="m2-player-hp-text"></div>
            </div>
          </div>
          <div class="skill-tray" id="m2-skill-tray"></div>
          <div id="m2-battle-question"></div>
        </div>
      `;
      this.updateBars();
      this.updateSkillTray();
      show('view-play');
    },

    updateBars() {
      if (!this.state) return;
      const p = Player.load();
      const bossPct = this.state.bossHp / this.state.bossHpMax * 100;
      const playerPct = p.hp / p.hpMax * 100;
      const bossEl = document.getElementById('m2-boss-hp-fill');
      const playerEl = document.getElementById('m2-player-hp-fill');
      if (bossEl) {
        bossEl.style.width = bossPct + '%';
        bossEl.className = 'hp-fill' + (bossPct < 30 ? ' critical' : bossPct < 60 ? ' low' : '');
      }
      if (playerEl) {
        playerEl.style.width = playerPct + '%';
        playerEl.className = 'hp-fill' + (playerPct < 30 ? ' critical' : playerPct < 60 ? ' low' : '');
      }
      const bt = document.getElementById('m2-boss-hp-text');
      const pt = document.getElementById('m2-player-hp-text');
      if (bt) bt.textContent = `${this.state.bossHp} / ${this.state.bossHpMax}`;
      if (pt) pt.textContent = `HP ${p.hp}/${p.hpMax} · MP ${p.mp}/${p.mpMax}`;
      // 2026-05-19 新增:BOSS HP < 30% 開啟怒火光環、HP=0 或回血移除
      const bossAv = document.getElementById('m2-boss-avatar');
      if (bossAv) GameFX.bossEnrage(bossAv, bossPct > 0 && bossPct < 30);
    },

    updateSkillTray() {
      if (!this.state) return;
      const p = Player.load();
      const tray = document.getElementById('m2-skill-tray');
      if (!tray) return;
      // 三招系統(Mode2 專屬,不依賴 Player.skills,任何人都能用,只看 MP)
      const used = this.state.skillsUsedThisQ || {};
      const answered = this.state.answered;
      const skills = [
        `<button class="skill-btn" onclick="Mode2.useStaticAnalysis()" ${p.mp < 8 || used.hint || answered ? 'disabled' : ''}>🔍 靜態分析 <span class="skill-cost">8MP</span></button>`,
        `<button class="skill-btn" onclick="Mode2.useExecSimulate()" ${p.mp < 14 || used.eliminate || answered ? 'disabled' : ''}>⚡ 執行模擬 <span class="skill-cost">14MP</span></button>`,
        `<button class="skill-btn" onclick="Mode2.useCodeReview()" ${p.mp < 18 || used.review || answered ? 'disabled' : ''}>📋 Code Review <span class="skill-cost">18MP</span></button>`,
      ];
      tray.innerHTML = skills.join('');
    },

    showQuestion() {
      if (!this.state) return;
      if (this.state.gameOverPending) return; // gameOver 已 schedule,不再渲染新題
      if (this.state.idx >= this.state.questions.length || this.state.bossHp <= 0) {
        this.victory();
        return;
      }
      const q = renderQuestion(this.state.questions[this.state.idx]);
      this.state.currentQ = q;
      this.state.answered = false; // 解鎖新題
      this.state.eliminated = new Set();
      this.state.skillsUsedThisQ = {};

      // 程式判讀題的程式碼區塊:加上 max-height + 雙向滾動,避免長 code 撐爆畫面
      const codeBlock = q.code_block ? `<pre class="code-syntax" style="max-height:380px;overflow:auto">${highlightCodeSimple(q.code_block)}</pre>` : '';
      const visualData = renderVisualData(q);
      const battleQ = document.getElementById('m2-battle-question');
      if (!battleQ) return;
      battleQ.innerHTML = `
        <div class="question-card">
          <div class="question-meta">
            <span class="badge">第 ${this.state.idx + 1} / ${this.state.questions.length} 回合</span>
            <span class="badge">${esc(q.knowledge_code)}</span>
            <span class="badge">${esc(q.difficulty)}</span>
            <span class="badge">${esc(q.format)}</span>
          </div>
          <div class="question-stem">${esc(q.stem)}</div>
          ${codeBlock}
          ${visualData}
          <div class="options" id="m2-options">
            ${q.options.map(o => `<button class="option-btn" data-key="${esc(o.key)}" onclick="Mode2.answer('${esc(o.key)}')">
              <span class="option-key">${esc(o.key)}.</span>${esc(o.text)}</button>`).join('')}
          </div>
          <div id="m2-explanation"></div>
        </div>
      `;
      // R5b:每題 90s 倒數(Mode 2 自渲染不走 PlayEngine.show,需就地啟動 timer)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._startTimer) { PlayEngine._timerDisabled = false; PlayEngine._startTimer(90); }
      this.updateSkillTray();
    },

    answer(key) {
      // R5b:第一行先停 timer(使用者已答題,避免 race 後續被 _onTimeout 重複寫入)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      if (!this.state || !this.state.currentQ) return;
      if (this.state.answered) return; // 已答過,擋快速連點 race
      const q = this.state.currentQ;
      const opt = q.options.find(o => o.key === key);
      if (!opt) return;
      this.state.answered = true;
      const isCorrect = opt.is_correct;

      // 2026-05-19 R3 simplify:用 PlayEngine.lockOptions
      PlayEngine.lockOptions('#m2-options', q.options, key);

      // R7 (simplify-review-2026-05-19):共用層 5 步 commit 抽到 PlayEngine.commitAnswer
      const c = q.options.find(o => o.is_correct);
      const userOpt = q.options.find(o => o.key === key);
      PlayEngine.commitAnswer(q, key, isCorrect, (userOpt && userOpt.text) || '', (c && c.text) || '');

      if (isCorrect) this.attack();
      else this.takeDamage();

      this.showExplanation(opt, isCorrect);
    },

    attack() {
      this.state.combo++;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
      this.state.correct++;

      const p = Player.load();
      // 程式判讀 BOSS 的攻擊主要靠技術 + 分析屬性
      const baseDmg = 20 + p.level * 2 + Math.floor((p.stats.technical + p.stats.analysis) / 2);
      // L5 修補(2026-05-19):改用 RNG.next() 讓 seed 控制下可重現(原 Math.random 不可重現)
      const isCrit = this.state.combo >= 3 && RNG.next() < 0.4;
      let dmg = isCrit ? Math.floor(baseDmg * 2) : baseDmg;
      this.state.bossHp = Math.max(0, this.state.bossHp - dmg);
      this.state.totalDamage += dmg;

      GameFX.flash('correct');
      const playerAv = document.getElementById('m2-player-avatar');
      const bossAv = document.getElementById('m2-boss-avatar');
      GameFX.attackAnim(playerAv);
      this._scheduleTimeout(() => {
        GameFX.shake(bossAv);
        GameFX.damageNumber(bossAv, dmg, { kind: 'player', crit: isCrit });
        // 2026-05-19 新增:BOSS 命中時往後彈飛
        GameFX.bossKnockback(bossAv);
      }, 200);

      if (this.state.combo >= 2) GameFX.combo(this.state.combo);
      if (this.state.combo === 5) {
        GameFX.confetti({ count: 100, colors: ['#fbbf24', '#f59e0b', '#ef4444'] });
        showToast('🔥 5 連擊!偵探推理直擊核心!');
      }
      if (isCrit) GameFX.confetti({ count: 60, colors: ['#fb923c', '#fbbf24'] });

      // 答對回血回藍(combo 加成)
      const hpHeal = 5 + Math.min(this.state.combo, 5);
      const mpHeal = 4 + Math.min(this.state.combo, 4);
      const beforeHp = p.hp;
      p.hp = Math.min(p.hpMax, p.hp + hpHeal);
      p.mp = Math.min(p.mpMax, p.mp + mpHeal);
      Player.save(p);
      if (p.hp > beforeHp) {
        // 2026-05-19 強化:GameFX.heal 合併綠光暈 + 浮動數字
        this._scheduleTimeout(() => GameFX.heal(playerAv, p.hp - beforeHp), 400);
      }

      this.updateBars();
      this.updateSkillTray();
    },

    takeDamage() {
      this.state.combo = 0;
      this.state.wrong++;
      // 程式 bug 反噬:8 + 3% boss HP(與 Mode1 同公式)
      const dmg = 8 + Math.floor(this.state.bossHpMax * 0.03);
      Player.damage(dmg);

      GameFX.flash('wrong');
      GameFX.hideCombo();
      const playerAv = document.getElementById('m2-player-avatar');
      const bossAv = document.getElementById('m2-boss-avatar');
      GameFX.attackAnim(bossAv);
      this._scheduleTimeout(() => {
        GameFX.shake(playerAv);
        GameFX.damageNumber(playerAv, dmg, { kind: 'enemy' });
      }, 200);

      this.updateBars();
      const p = Player.load();
      if (p.hp <= 0) {
        this.state.gameOverPending = true;
        this._scheduleTimeout(() => {
          // 防呆:玩家若已退回地圖或進別場戰鬥,state 可能變更,只在仍為同場時觸發
          if (this.state && this.state.gameOverPending) this.gameOver();
        }, 1500);
      }
    },

    showExplanation(opt, isCorrect) {
      if (!this.state || !this.state.currentQ) return;
      const explainEl = document.getElementById('m2-explanation');
      if (!explainEl) return;
      const q = this.state.currentQ;
      const e = q.explanation || {};
      const correctOpt = q.options.find(o => o.is_correct);

      const findWrongExp = (option) => {
        let exp = '';
        if (e.wrong && typeof e.wrong === 'object') {
          exp = e.wrong[option.text];
          if (!exp) {
            for (const k of Object.keys(e.wrong)) {
              if (k && (k.includes(option.text.substring(0, 8)) || option.text.includes(k.substring(0, 8)))) {
                exp = e.wrong[k]; break;
              }
            }
          }
        }
        if (!exp) exp = option.trap_type ? `陷阱類型:${option.trap_type}` : '此選項不正確';
        return exp;
      };

      const otherWrongOptions = q.options.filter(o => !o.is_correct && (!opt || o.key !== opt.key));
      const otherAnalysis = otherWrongOptions.map(o => `
        <div style="padding:8px 10px;margin:6px 0;background:rgba(255,255,255,0.04);border-radius:4px;border-left:3px solid #94a3b8">
          <div style="color:#cbd5e1;font-weight:600;margin-bottom:2px">${esc(o.key)}. ${esc(o.text)}</div>
          <div style="color:var(--fg-dim);font-size:0.875rem;line-height:1.6">└ ${esc(findWrongExp(o))}</div>
        </div>
      `).join('');

      const userWrongExp = !isCorrect && opt ? findWrongExp(opt) : '';

      const enemyTaunt = !isCorrect ? `<div class="dialogue-box" style="border-color:rgba(239,68,68,0.4)">
        <div class="dialogue-name" style="color:#f87171">${esc(this.state.boss.name)}</div>
        <div class="dialogue-text">「${esc(RNG.pick(this.state.boss.attack))}」</div>
      </div>` : '';

      explainEl.innerHTML = `
        ${enemyTaunt}
        <div class="explanation">
          <div class="verdict ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '🔍 推理命中!' : '🩸 程式陷阱反噬!'}</div>

          <div style="background:rgba(74,222,128,0.12);border-left:4px solid #4ade80;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#4ade80;font-weight:700;font-size:0.95rem;margin-bottom:4px">📚 正解</div>
            <div style="font-size:1rem;margin-bottom:6px"><strong>${correctOpt ? esc(correctOpt.key) + '. ' + esc(correctOpt.text) : '(無)'}</strong></div>
            <div style="color:var(--fg);line-height:1.7">${esc(e.correct || '(此題未提供詳細解釋,請參考正確選項文字)')}</div>
          </div>

          ${!isCorrect ? `<div style="background:rgba(248,113,113,0.12);border-left:4px solid #f87171;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#f87171;font-weight:700;font-size:0.95rem;margin-bottom:4px">❌ 你選了 ${esc(opt.key)}. ${esc(opt.text)}</div>
            <div style="color:var(--fg);line-height:1.7">${esc(userWrongExp)}</div>
          </div>` : ''}

          ${otherAnalysis ? `<div style="background:rgba(148,163,184,0.08);border-left:4px solid #94a3b8;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#cbd5e1;font-weight:700;font-size:0.95rem;margin-bottom:6px">🔍 其他選項解析</div>
            ${otherAnalysis}
          </div>` : ''}

          ${e.hook ? `<div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px 0">
            <div style="color:#facc15;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>
            <div style="color:var(--fg);font-style:italic;margin-top:2px">${esc(e.hook)}</div>
          </div>` : ''}

          ${q.misconceptions && q.misconceptions.length > 0 ? `<div style="background:rgba(168,85,247,0.10);border-left:4px solid #a855f7;padding:10px 12px;border-radius:6px;margin:10px 0">
            <div style="color:#c084fc;font-weight:700;font-size:0.85rem">⚠️ 此題常見誤解</div>
            <div style="color:var(--fg);margin-top:2px">${q.misconceptions.map(m => '• ' + esc(m)).join('<br>')}</div>
          </div>` : ''}

          <div class="actions" style="margin-top:14px">
            <button class="btn btn-primary" onclick="Mode2.next()">繼續判讀 →</button>
            ${!isCorrect ? `<button class="btn btn-warn" onclick="Mode2.drillThis()">🎯 立即下鑽變化型</button>` : ''}
            ${ErrorReports.renderButton(q.id)}
          </div>
        </div>
      `;
    },

    drillThis() {
      if (!this.state || !this.state.currentQ) return;
      if (this.state.gameOverPending) return; // hp 已 0 等 GG,不下鑽
      const variations = generateVariation(this.state.currentQ, 3);
      if (!variations || variations.length === 0) {
        showToast('⚠️ 此知識點變化型不足,繼續戰鬥', 2500);
        return;
      }
      // 下鑽完成後返回戰鬥(不回首頁),走下一回合
      DrillSession.start(this.state.currentQ.node_id, variations, this.state.currentQ, () => {
        // 等下鑽結束時 state 可能已被別處清掉,這時直接回地圖
        if (!this.state) { this.start(); return; }
        this.renderBattle();
        this.next();
      });
    },

    next() {
      if (!this.state) return;
      if (this.state.gameOverPending) return; // hp 已 0,等 gameOver 接管
      this.state.idx++;
      if (this.state.bossHp <= 0) { this.victory(); return; }
      this.showQuestion();
    },

    // === 三招實作 ===
    useStaticAnalysis() {
      if (!this.state || !this.state.currentQ) return;
      if (this.state.answered) return showToast('已答題,招式無效');
      const p = Player.load();
      if (p.mp < 8) return showToast('MP 不足');
      if (this.state.skillsUsedThisQ && this.state.skillsUsedThisQ.hint) return showToast('本題已用過此招');
      p.mp -= 8;
      Player.save(p);
      this.state.skillsUsedThisQ = this.state.skillsUsedThisQ || {};
      this.state.skillsUsedThisQ.hint = true;

      const q = this.state.currentQ;
      const tip = (q.explanation && q.explanation.hook) ? q.explanation.hook : '依題意找最直接相符的選項';
      showToast('🔍 靜態分析 → ' + tip, 5000);
      this.updateBars();
      this.updateSkillTray();
    },

    useExecSimulate() {
      if (!this.state || !this.state.currentQ) return;
      if (this.state.answered) return showToast('已答題,招式無效');
      const p = Player.load();
      if (p.mp < 14) return showToast('MP 不足');
      if (this.state.skillsUsedThisQ && this.state.skillsUsedThisQ.eliminate) return showToast('本題已用過此招');
      p.mp -= 14;
      Player.save(p);
      this.state.skillsUsedThisQ = this.state.skillsUsedThisQ || {};
      this.state.skillsUsedThisQ.eliminate = true;

      // 從尚未消除、且非正解的選項中,挑一個消掉
      const wrongOpts = this.state.currentQ.options.filter(o => !o.is_correct && !this.state.eliminated.has(o.key));
      if (wrongOpts.length === 0) {
        showToast('⚡ 已無錯誤選項可消除');
      } else {
        const target = RNG.pick(wrongOpts);
        this.state.eliminated.add(target.key);
        const btn = document.querySelector(`#m2-options [data-key="${target.key}"]`);
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.3';
          btn.style.textDecoration = 'line-through';
        }
        showToast(`⚡ 執行模擬:選項 ${target.key} 被排除`);
      }
      this.updateBars();
      this.updateSkillTray();
    },

    useCodeReview() {
      if (!this.state || !this.state.currentQ) return;
      if (this.state.answered) return showToast('已答題,招式無效');
      const p = Player.load();
      if (p.mp < 18) return showToast('MP 不足');
      if (this.state.skillsUsedThisQ && this.state.skillsUsedThisQ.review) return showToast('本題已用過此招');
      p.mp -= 18;
      Player.save(p);
      this.state.skillsUsedThisQ = this.state.skillsUsedThisQ || {};
      this.state.skillsUsedThisQ.review = true;

      const q = this.state.currentQ;
      const traps = q.options.filter(o => !o.is_correct && o.trap_type).map(o => `• ${esc(o.trap_type)}`);
      const miscons = (q.misconceptions || []).map(m => '• ' + m);
      const lines = [];
      if (miscons.length) lines.push('⚠️ 常見誤解:\n' + miscons.join('\n'));
      if (traps.length) lines.push('🪤 陷阱選項類型:\n' + traps.join('\n'));
      const msg = lines.length ? lines.join('\n\n') : '此題無明顯陷阱類型,請小心讀題';
      showToast('📋 Code Review:\n' + msg, 7000);
      this.updateBars();
      this.updateSkillTray();
    },

    victory() {
      if (!this.state) return; // 防雙重呼叫
      this.stopTypeText();
      if (typeof _setExamMode === 'function') _setExamMode(false);
      // EXP 公式與 Mode1 同調(60 base + 12/題 + 完美 40 + combo*5)
      const baseExp = 60 + this.state.correct * 12;
      const perfectBonus = this.state.wrong === 0 ? 40 : 0;
      const comboBonus = this.state.maxCombo * 5;
      const totalExp = baseExp + perfectBonus + comboBonus;
      Player.gainExp(totalExp);

      const bossesS = this.bossesState();
      const prev = bossesS[this.state.boss.key] || {};
      bossesS[this.state.boss.key] = {
        defeated: true,
        perfectClear: prev.perfectClear || (this.state.wrong === 0),
        defeatedAt: Date.now(),
        bestCombo: Math.max(prev.bestCombo || 0, this.state.maxCombo)
      };
      Storage.set('ipas_mode2_bosses_v2', bossesS);

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#fbbf24;font-size:2rem">🏆 推理勝利!惡魔倒下</h1>
          <div style="font-size:4rem;margin:16px 0">${this.state.boss.avatar}</div>
          <div class="dialogue-box">
            <div class="dialogue-name">${esc(this.state.boss.name)}</div>
            <div class="dialogue-text">「${esc(RNG.pick(this.state.boss.defeat))}」</div>
          </div>
          <div style="background:rgba(0,0,0,0.5);padding:16px;border-radius:var(--radius);margin:16px 0;text-align:left">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>✅ 答對 <strong style="color:#4ade80">${this.state.correct}</strong></div>
              <div>❌ 答錯 <strong style="color:#f87171">${this.state.wrong}</strong></div>
              <div>🔥 最高連擊 <strong>${this.state.maxCombo}</strong></div>
              <div>⚔️ 總傷害 <strong>${this.state.totalDamage}</strong></div>
            </div>
            <hr style="margin:12px 0;border-color:var(--border)">
            <div style="font-size:1.3rem;color:#fbbf24;font-weight:800;text-align:center">+${totalExp} EXP</div>
            <div style="font-size:0.85rem;color:var(--fg-dim);text-align:center;margin-top:4px">
              基礎 ${baseExp} ${perfectBonus ? '+ 完美 ' + perfectBonus : ''} ${comboBonus ? '+ 連擊 ' + comboBonus : ''}
            </div>
            ${this.state.wrong === 0 ? '<div style="text-align:center;margin-top:8px;color:#4ade80;font-weight:700">⭐ 完美通關</div>' : ''}
          </div>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode2.start()">🗺️ 回道場地圖</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
          </div>
        </div>
      `;
      // 結算後清 state(避免後續招式按鈕誤觸,以及 onload 殘留)
      const bossKey = this.state.boss.key;
      this.state = null;
      this._lastBossKey = bossKey;
      GameFX.bigConfetti();
      refreshHome();
    },

    gameOver() {
      if (!this.state) return; // 防雙重呼叫
      this.stopTypeText();
      if (typeof _setExamMode === 'function') _setExamMode(false);
      const bossKeyForRetry = this.state.boss.key;
      const bossNameForRetry = this.state.boss.name;
      const lastAttack = RNG.pick(this.state.boss.attack);
      // 2026-05-16: 動態 hpMax/2,對齊「恢復一半 HP」文案(Lv1=50,升級後可能 60+)
      const _heal2 = Player.load(); Player.heal(Math.floor(_heal2.hpMax / 2));
      // 清 state(避免 1.5s 內若使用者已退到地圖,殘留 race;且按鈕點 selectBoss 會新開戰)
      this.state = null;
      const view = document.getElementById('view-play');
      if (!view) return;
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#f87171;font-size:2rem">💀 你被程式陷阱擊倒</h1>
          <div style="font-size:4rem;margin:16px 0">😵</div>
          <div class="dialogue-box">
            <div class="dialogue-name">${bossNameForRetry}</div>
            <div class="dialogue-text">「${esc(lastAttack)}」</div>
          </div>
          <p style="margin:16px 0;color:var(--fg-dim)">休息片刻後,你恢復了一半 HP...</p>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode2.selectBoss('${bossKeyForRetry}')">🔍 再戰</button>
            <button class="btn btn-ghost" onclick="Mode2.start()">🗺️ 回地圖</button>
          </div>
        </div>
      `;
    }
  };

  window.Mode2 = Mode2;
})();
