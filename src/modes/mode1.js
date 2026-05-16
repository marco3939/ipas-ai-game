// ============================================================
// Mode 1: AI 顧問救援 — 真 RPG 戰鬥系統(v2 完整重做)
// 鐵律 #1+#2 全合規 + 完整遊戲化(GSAP + canvas-confetti + GameFX)
// ============================================================
(function () {

  // === 戰鬥平衡常數 ===
  // 每場 BOSS 戰題數(原 7,2026-05-10 升 20 — 使用者實測抱怨太短 + 題庫已 325 題支撐)
  const BOSS_QUESTIONS_PER_BATTLE = 20;
  // BOSS HP 縮放(對應題數 7→20,維持「答對 60~80% 才能勝」的戰鬥節奏)
  // baseDmg ~ 20(Lv1 18+2*1+0), 20 題 80% 答對 ≈ 16 題 × 平均 28 dmg = 448 → HP_MULTIPLIER=4.0 對應平均 HP 524,需 ~19 題 KO
  // 2026-05-10 從 2.4 升 4.0:原 2.4 算錯 baseDmg(以為 25 實為 20),導致 16 題即 KO 提早結束
  const BOSS_HP_MULTIPLIER = 4.0;

  // === 12 產業 BOSS 配置 ===
  const BOSSES = [
    { key: 'ecommerce', name: '王董(電商集團 CEO)', avatar: '🛒', hp: 120,
      desc: '客戶流失率上升,推薦系統失準',
      keywords: ['電商','顧客','評論','行銷','推薦','流失','RFM','個人化'],
      intro: '「我們上個月損失了 23% 活躍會員!模型卻沒抓到任何徵兆。你能不能查清楚問題?」',
      attack: ['「這也不會?」','「我顧問費白付了!」','「快點!股東等不及!」'],
      defeat: ['「太厲害了,你救了集團!」','「下季度起,你是首席 AI 顧問。」'] },
    { key: 'finance', name: '李行長(銀行風控長)', avatar: '💰', hp: 130,
      desc: 'AI 風控被駭客對抗性攻擊',
      keywords: ['金融','銀行','信用','風控','詐欺','評分卡','監管','PSI'],
      intro: '「駭客在交易輸入動了手腳,模型被欺騙了。我們需要從根本解決,不是加防火牆而已。」',
      attack: ['「監理會發函了!」','「你還在猶豫?」','「合規截止日剩 3 天!」'],
      defeat: ['「這就是真功夫。」','「金融業需要你這種人才。」'] },
    { key: 'medical', name: '陳主任(醫院 AI 中心)', avatar: '🏥', hp: 140,
      desc: '輔助診斷模型 + 不平衡資料',
      keywords: ['醫療','醫院','診斷','病人','臨床','陽性','偵測','SMOTE'],
      intro: '「正樣本只有 3%,Accuracy 看起來 97% 但漏診重症。再不解決,要出人命。」',
      attack: ['「人命關天!」','「你不懂病人的痛苦。」','「FDA 在看著!」'],
      defeat: ['「這次,我們真的能救人了。」','「醫療 AI 終於有救星。」'] },
    { key: 'autonomous', name: '林博士(自駕車 AI)', avatar: '🚗', hp: 150,
      desc: '即時影像辨識 + 全景分割',
      keywords: ['自駕','自動駕駛','車輛','影像','物件','分割','CNN','即時'],
      intro: '「行人偵測模型混淆了多位行人實體,差點釀成車禍。我們需要可靠的分割架構。」',
      attack: ['「秒殺人命的責任,你扛得起?」','「邊緣運算延遲超標!」'],
      defeat: ['「這就是自駕的下一步。」'] },
    { key: 'manufacturing', name: '張廠長(智慧製造)', avatar: '🏭', hp: 130,
      desc: '瑕疵檢測 CNN + 邊緣運算',
      keywords: ['製造','智慧製造','生產線','瑕疵','感測器','故障','設備','預測'],
      intro: '「產線每分鐘 200 片 PCB,瑕疵檢測 CNN 在線上飄移了。我需要穩定方案。」',
      attack: ['「停線一分鐘損失 5 萬!」','「客戶要驗廠了!」'],
      defeat: ['「智慧工廠終於名實相符。」'] },
    { key: 'energy', name: '吳總(再生能源)', avatar: '⚡', hp: 130,
      desc: '電力預測 + 蒙地卡羅模擬',
      keywords: ['電力','太陽能','能源','風險','機率','分布','預測','時序'],
      intro: '「氣候越來越極端,傳統時序模型失準。我需要能評估極端風險的方法。」',
      attack: ['「電網崩潰你負責?」','「綠電承諾跳票!」'],
      defeat: ['「這才是 AI 該有的格局。」'] },
    { key: 'telecom', name: '黃副總(電信流失)', avatar: '📞', hp: 110,
      desc: '客戶流失預測 + 多重共線性',
      keywords: ['電信','客戶流失','通話','頻率','LASSO','特徵','多重共線'],
      intro: '「100 個特徵高度相關,模型不穩。我要能自動篩選代表性的方法。」',
      attack: ['「KPI 每季都掉!」','「對手挖角我的客戶!」'],
      defeat: ['「終於找到救兵。」'] },
    { key: 'media', name: '蘇導演(媒體生成)', avatar: '🎬', hp: 140,
      desc: '生成式 AI + 著作權風險',
      keywords: ['媒體','行銷','廣告','生成','Stable Diffusion','GAN','侵權','著作權'],
      intro: '「行銷團隊用 Stable Diffusion 生成的素材被告侵權。我需要從源頭預防。」',
      attack: ['「律師函滿天飛!」','「品牌信譽崩盤!」'],
      defeat: ['「創作與合規,你做到了。」'] },
    { key: 'smartcity', name: '周局長(智慧城市)', avatar: '🏙️', hp: 150,
      desc: 'CV 監控 + 隱式偏誤治理',
      keywords: ['智慧城市','監控','交通','人臉','族群','偏誤','公平性'],
      intro: '「監控 AI 在不同族群辨識率差異 30%。媒體要爆出來了,你能修正嗎?」',
      attack: ['「市長要我引咎下台!」','「人權團體在門口示威!」'],
      defeat: ['「公平的 AI,真的存在。」'] },
    { key: 'education', name: '高教授(智慧教育)', avatar: '🎓', hp: 120,
      desc: '個人化學習 + 多模態',
      keywords: ['教育','學生','個人化','學習','多模態','CLIP','資料缺失'],
      intro: '「學生只有影像沒文字描述,模態缺失嚴重。模型表現掉了一半。」',
      attack: ['「論文發不出去!」','「科技部審查不過!」'],
      defeat: ['「教育的未來,在這裡誕生。」'] },
    { key: 'logistics', name: '羅董(物流大亨)', avatar: '🚚', hp: 130,
      desc: '路徑優化 + 即時推論',
      keywords: ['物流','配送','即時','推論','部署','API','延遲','水平擴展'],
      intro: '「黑五訂單暴增 10 倍,推論服務崩了。我要能撐住峰值的架構。」',
      attack: ['「客訴塞爆!」','「商家要違約金!」'],
      defeat: ['「物流大數據,終於聽我使喚。」'] },
    { key: 'legal', name: '簡律師(法律 AI)', avatar: '⚖️', hp: 140,
      desc: 'NLP 法條檢索 + RAG',
      keywords: ['法律','律師','NLP','RAG','檢索','幻覺','BERT','契約'],
      intro: '「LLM 在法條問答中產生幻覺,引用不存在的判例。我們要 RAG 但檢索品質太差。」',
      attack: ['「律師失格我就完了!」','「客戶要告我!」'],
      defeat: ['「正義的 AI,謝謝你。」'] }
  ];

  function highlightCode(code) {
    if (!code) return '';
    let s = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    s = s.replace(/(#[^\n]*)/g, '<span class="com">$1</span>');
    s = s.replace(/(["'])((?:(?!\1).)*)\1/g, '<span class="str">$1$2$1</span>');
    // 2026-05-11 bug fix(同 index.html:highlightCodeSimple):移除 'class' 避免咬到 <span class="str"> 屬性產生 <span <span...> 巢狀破爛 HTML
    s = s.replace(/\b(import|from|def|return|if|else|elif|for|while|in|as|with|try|except|None|True|False|lambda|pass|self|print|len|range|np|pd|sklearn|torch|nn|tf)\b/g, '<span class="kw">$1</span>');
    s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    return s;
  }

  // 取題:keyword 直配 + subject=1 通用題池擴充
  // 池擴展策略(2026-05-10 為 20 題場 + 真隨機重做):
  //  1. keyword 直配池(boss-specific)
  //  2. 池 < VARIATION_FLOOR 時補 subject=1 通用題,確保 RNG.pickN 有足夠變化空間
  //     設 floor = 2n(n=20 時 = 40),讓「跨場 Jaccard IoU < 0.5」成立(平均一半題目不同)
  //  3. 最終池仍 < n 時接受較短戰鬥(showToast 提醒)
  // ※ 不可造題,僅用 QUESTIONS 內既有(鐵律 #5 來源忠實性)
  function pickQuestionsForBoss(boss, n = BOSS_QUESTIONS_PER_BATTLE) {
    const matched = QUESTIONS.filter(q => {
      const text = (q.stem || '') + ' ' + (q.tags || []).join(' ');
      return boss.keywords.some(k => text.includes(k));
    });
    let pool = [...new Set(matched)];
    // 抽樣空間目標:抽 n 題的 2 倍 = 至少 40 題
    // 數學:從 pool=2n 抽 n,跨場最小 IoU = (2n-n)/(2n+n) ≈ 0.33,平均 < 0.5 達標
    const VARIATION_FLOOR = n * 2;
    if (pool.length < VARIATION_FLOOR) {
      // 2026-05-16 H1 fix: subject 2 (L22 大數據) 與商業/產業 BOSS 主題天然相關
      // (資料工程、隱私、生成式 AI 應用等);擴大 filler pool 涵蓋三科,
      // 避免 L22 題目在 keyword pool 不足時被排除。
      const general = QUESTIONS.filter(q => [1, 2, 3].includes(q.subject) && !pool.includes(q));
      // 把缺口補到 floor,一次抽 (floor - pool.length) 題進池
      pool = [...pool, ...RNG.pickN(general, Math.max(0, VARIATION_FLOOR - pool.length))];
    }
    // 跨關卡排除已答對(SeenCorrect):戰鬥模式不重複出已掌握題
    // 若 filter 後池 < n,fallback 回原池 + showToast 提醒
    if (typeof SeenCorrect !== 'undefined') {
      const fr = SeenCorrect.filterForBattle(pool, n);
      if (fr.fallback) showToast('本 BOSS 可用新題不足,允許重複出已答對的舊題');
      else pool = fr.pool;
    }
    return RNG.pickN(pool, Math.min(n, pool.length));
  }

  const Mode1 = {
    state: null,
    _timers: [], // QA 修補:集中管理 setTimeout/setInterval,避免切換 view 後殘留 callback
    _intro: null, // QA 修補:typeText setInterval ref

    // QA 修補:統一排程,離開戰鬥時可一次清除
    _scheduleTimeout(fn, ms) {
      const id = setTimeout(() => {
        // 清掉自己的 ref
        const i = this._timers.indexOf(id);
        if (i >= 0) this._timers.splice(i, 1);
        fn();
      }, ms);
      this._timers.push(id);
      return id;
    },
    _clearAllTimers() {
      this._timers.forEach(id => clearTimeout(id));
      this._timers = [];
      if (this._intro) { clearInterval(this._intro); this._intro = null; }
    },

    start() {
      this._clearAllTimers();    // QA 修補 A35:回任務地圖前先清掉戰鬥殘留 timer
      // 強化隨機種子:Date.now() 同毫秒重入會抽到同題,加入 Math.random() 高熵尾數
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      this.renderMap();
    },

    industriesState() { return Storage.get('ipas_mode1_industries_v1', {}); },

    renderMap() {
      const player = Player.load();
      const industries = this.industriesState();
      const defeatedCount = Object.values(industries).filter(x => x.defeated).length;
      const view = document.getElementById('view-play');
      const playerHpPct = player.hp / player.hpMax * 100;

      view.innerHTML = `
        <div class="card">
          <h1>🗺️ AI 顧問救援 — 任務地圖</h1>
          <p style="color:var(--fg-dim)">12 個產業客戶等待協助。挑選一場 BOSS 戰鬥開始。答對攻擊敵人、答錯被反擊。</p>
        </div>

        <div class="battle-arena" style="padding:16px">
          <div class="player-bar">
            <div class="avatar">🧑‍💼</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${player.level}</span> AI 顧問(你)</div>
              <div class="hp-track"><div class="hp-fill ${playerHpPct < 30 ? 'critical' : playerHpPct < 60 ? 'low' : ''}" style="width:${playerHpPct}%"></div></div>
              <div class="hp-text">HP ${player.hp} / ${player.hpMax} · MP ${player.mp} / ${player.mpMax} · EXP ${player.exp}/${player.expMax}</div>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:var(--fg-dim)">
            <span>💪 分析 ${player.stats.analysis}</span>
            <span>📋 規劃 ${player.stats.planning}</span>
            <span>🧠 決策 ${player.stats.decision}</span>
            <span>⚙️ 技術 ${player.stats.technical}</span>
            <span>🛠 技能點 <strong style="color:var(--warn)">${player.skillPoints}</strong></span>
            <span>🏆 已破關 ${defeatedCount}/12</span>
          </div>
        </div>

        ${player.skillPoints > 0 ? `<div class="card" style="border-color:var(--warn)">
          <h3>⭐ 你有 ${player.skillPoints} 個技能點可分配</h3>
          <div class="actions">
            ${!player.skills.hint ? `<button class="btn btn-warn" onclick="Mode1.unlockSkill('hint')">💡 解鎖『提示』(看記憶口訣)</button>` : ''}
            ${!player.skills.eliminate ? `<button class="btn btn-warn" onclick="Mode1.unlockSkill('eliminate')">❌ 解鎖『消除』(消 2 錯誤選項)</button>` : ''}
            ${!player.skills.double ? `<button class="btn btn-warn" onclick="Mode1.unlockSkill('double')">⚡ 解鎖『雙倍傷害』(下一擊 ×2)</button>` : ''}
          </div>
        </div>` : ''}

        <div class="card">
          <h2>⚔️ 選擇任務(BOSS)</h2>
          <div class="modes-grid">
            ${BOSSES.map(b => {
              const st = industries[b.key];
              const cleared = st && st.defeated;
              const perfect = st && st.perfectClear;
              return `<button class="mode-card" onclick="Mode1.selectBoss('${b.key}')" style="${cleared ? 'opacity:0.7;border-color:var(--success)' : ''}">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                  <span style="font-size:2rem">${b.avatar}</span>
                  <div>
                    <div class="mode-num">${cleared ? (perfect ? '⭐ 完美通關' : '✅ 已通關') : '未通關'}</div>
                    <div class="mode-title" style="font-size:0.95rem">${b.name}</div>
                  </div>
                </div>
                <div class="mode-desc" style="font-size:0.85rem">${b.desc}</div>
                <div class="mode-stats">HP ${Math.round(b.hp * BOSS_HP_MULTIPLIER)} · ${BOSS_QUESTIONS_PER_BATTLE} 題</div>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-ghost" onclick="goHome()">🏠 回主頁</button>
          <button class="btn btn-ghost" onclick="if(confirm('重置玩家進度?'))Mode1.resetPlayer()">🔄 重置角色</button>
        </div>
      `;
      show('view-play');
    },

    resetPlayer() {
      Player.reset();
      Storage.del('ipas_mode1_industries_v1');
      this.start();
    },

    unlockSkill(name) {
      const p = Player.load();
      if (p.skillPoints <= 0) return;
      p.skillPoints--; p.skills[name] = true;
      Player.save(p);
      showToast(`✨ 解鎖技能:${name}`);
      this.renderMap();
    },

    selectBoss(key) {
      this._clearAllTimers();   // QA 修補 A35:選新 BOSS 前清掉舊計時(避免上一場 gameOver/victory 飄出)
      // 真隨機:每次進 BOSS 都重新洗種子,確保「同一張地圖連挑同 BOSS」也抽到不同題
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      const boss = BOSSES.find(b => b.key === key);
      if (!boss) return;
      const questions = pickQuestionsForBoss(boss, BOSS_QUESTIONS_PER_BATTLE);
      if (questions.length === 0) { showToast('題庫不足'); return; }
      if (questions.length < BOSS_QUESTIONS_PER_BATTLE) {
        showToast(`⚠️ 此 BOSS 題庫僅 ${questions.length} 題,本場較短`, 2500);
      }

      // BOSS HP 縮放(20 題場,baseDmg×0.8 命中率 ≈ 必須拉高 HP 才有戰鬥感)
      const bossHpScaled = Math.round(boss.hp * BOSS_HP_MULTIPLIER);
      this.state = { boss, bossHp: bossHpScaled, bossHpMax: bossHpScaled,
        questions, idx: 0, combo: 0, maxCombo: 0,
        correct: 0, wrong: 0, totalDamage: 0,
        doubleNext: false, currentQ: null,
        answering: false, // QA 修補 A1:防止快速雙擊重入
        bossKnockedOutShown: false }; // 2026-05-10:BOSS 倒下後仍跑滿 20 題,只顯示一次衝刺加分提示

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena">
          <div class="enemy-bar">
            <div class="avatar boss" style="font-size:2.5rem">${boss.avatar}</div>
            <div class="bar-info">
              <div class="bar-name">${boss.name}</div>
              <div class="hp-text">HP ${Math.round(boss.hp * BOSS_HP_MULTIPLIER)}</div>
            </div>
          </div>
          <div class="dialogue-box">
            <div class="dialogue-name">${boss.name}</div>
            <div class="dialogue-text" id="intro-text"></div>
          </div>
          <div class="actions" style="margin-top:16px;justify-content:center">
            <button class="btn btn-primary" onclick="Mode1.startBattle()" style="font-size:1.1rem;padding:14px 28px">⚔️ 開戰!</button>
            <button class="btn btn-ghost" onclick="Mode1.start()">退避</button>
          </div>
        </div>
      `;
      show('view-play');
      this.typeText('intro-text', boss.intro, 30);
    },

    typeText(id, text, speedMs = 30) {
      // QA 修補 A4/A24:存 interval ref,避免重入造成多個 typer 同時寫
      if (this._intro) { clearInterval(this._intro); this._intro = null; }
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = '';
      let i = 0;
      this._intro = setInterval(() => {
        // 防呆:節點被移除就停
        if (!document.body.contains(el)) { clearInterval(this._intro); this._intro = null; return; }
        if (i >= text.length) { clearInterval(this._intro); this._intro = null; return; }
        el.textContent += text[i++];
      }, speedMs);
    },

    startBattle() {
      // QA 修補 A4:離開 intro 前清掉 typer
      if (this._intro) { clearInterval(this._intro); this._intro = null; }
      if (!this.state) { showToast('狀態遺失,回主地圖'); this.start(); return; } // QA 修補:防呆
      this.renderBattle();
      this.showQuestion();
    },

    renderBattle() {
      const p = Player.load();
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" id="arena">
          <div class="enemy-bar">
            <div class="avatar boss" id="boss-avatar" style="font-size:2.5rem">${this.state.boss.avatar}</div>
            <div class="bar-info">
              <div class="bar-name">${this.state.boss.name}</div>
              <div class="hp-track"><div class="hp-fill" id="boss-hp-fill" style="width:100%"></div></div>
              <div class="hp-text" id="boss-hp-text">${this.state.bossHp} / ${this.state.bossHpMax}</div>
            </div>
          </div>
          <div class="player-bar">
            <div class="avatar" id="player-avatar">🧑‍💼</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${p.level}</span> AI 顧問</div>
              <div class="hp-track"><div class="hp-fill" id="player-hp-fill"></div></div>
              <div class="hp-text" id="player-hp-text"></div>
            </div>
          </div>
          <div class="skill-tray" id="skill-tray"></div>
          <div id="battle-question"></div>
        </div>
      `;
      this.updateBars(); this.updateSkillTray(); show('view-play');
    },

    updateBars() {
      const p = Player.load();
      const bossPct = this.state.bossHp / this.state.bossHpMax * 100;
      const playerPct = p.hp / p.hpMax * 100;
      const bossEl = document.getElementById('boss-hp-fill');
      const playerEl = document.getElementById('player-hp-fill');
      if (bossEl) { bossEl.style.width = bossPct + '%'; bossEl.className = 'hp-fill' + (bossPct < 30 ? ' critical' : bossPct < 60 ? ' low' : ''); }
      if (playerEl) { playerEl.style.width = playerPct + '%'; playerEl.className = 'hp-fill' + (playerPct < 30 ? ' critical' : playerPct < 60 ? ' low' : ''); }
      const bt = document.getElementById('boss-hp-text');
      const pt = document.getElementById('player-hp-text');
      if (bt) bt.textContent = `${this.state.bossHp} / ${this.state.bossHpMax}`;
      if (pt) pt.textContent = `HP ${p.hp}/${p.hpMax} · MP ${p.mp}/${p.mpMax}`;
    },

    updateSkillTray() {
      const p = Player.load();
      const tray = document.getElementById('skill-tray');
      if (!tray) return;
      const skills = [];
      if (p.skills.hint) skills.push(`<button class="skill-btn" onclick="Mode1.useHint()" ${p.mp<10?'disabled':''}>💡 提示 <span class="skill-cost">10MP</span></button>`);
      if (p.skills.eliminate) skills.push(`<button class="skill-btn" onclick="Mode1.useEliminate()" ${p.mp<15?'disabled':''}>❌ 消除2項 <span class="skill-cost">15MP</span></button>`);
      if (p.skills.double) skills.push(`<button class="skill-btn" onclick="Mode1.useDouble()" ${p.mp<20||this.state.doubleNext?'disabled':''}>⚡ 雙倍 <span class="skill-cost">20MP</span></button>`);
      tray.innerHTML = skills.length ? skills.join('') : '<span style="color:var(--fg-mute);font-size:0.85rem">通關 BOSS 升級後可解鎖技能</span>';
    },

    showQuestion() {
      if (!this.state) return; // QA 修補:防呆
      // 即使 BOSS HP 歸零,仍跑完 20 題(衝刺加分模式,提供額外練習機會)
      if (this.state.idx >= this.state.questions.length) { this.victory(); return; }
      this.state.answering = false; // QA 修補 A1:新題開始解鎖(避免上一題殘留)
      const q = renderQuestion(this.state.questions[this.state.idx]);
      this.state.currentQ = q;
      const codeBlock = q.code_block ? `<pre class="code-syntax">${highlightCode(q.code_block)}</pre>` : '';
      const visualData = renderVisualData(q);
      document.getElementById('battle-question').innerHTML = `
        <div class="question-card">
          <div class="timer-bar" id="play-timer-bar"><span class="timer-icon">⏱</span><span>剩餘 <span id="play-timer-value">90</span> 秒</span></div>
          <div class="question-meta">
            <span class="badge">第 ${this.state.idx + 1} / ${this.state.questions.length} 回合</span>
            <span class="badge">${q.knowledge_code}</span>
            <span class="badge">${q.difficulty}</span>
            ${q.errata_critical ? '<span class="badge" style="background:var(--danger);color:white">⚠️ 必出</span>' : ''}
          </div>
          <div class="question-stem">${q.stem}</div>
          ${codeBlock}
          ${visualData}
          <div class="options" id="m1-options">
            ${q.options.map(o => `<button class="option-btn" data-key="${o.key}" onclick="Mode1.answer('${o.key}')">
              <span class="option-key">${o.key}.</span>${o.text}</button>`).join('')}
          </div>
          <div id="m1-explanation"></div>
        </div>
      `;
      // R5b:每題 90s 倒數(Mode 1/2/3/5 自渲染不走 PlayEngine.show,需就地啟動 timer)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._startTimer) { PlayEngine._timerDisabled = false; PlayEngine._startTimer(90); }
      this.updateSkillTray();
    },

    answer(key) {
      // R5b:第一行先停 timer(使用者已答題,避免 race 後續被 _onTimeout 重複寫入)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      // QA 修補 A1:重入鎖,防止快速雙擊 / Enter 連按造成 HP 雙扣
      if (!this.state || this.state.answering) return;
      const q = this.state.currentQ;
      if (!q || !q.options) return; // QA 修補:防呆
      const opt = q.options.find(o => o.key === key);
      if (!opt) return; // QA 修補:防呆
      this.state.answering = true;
      const isCorrect = !!opt.is_correct;

      document.querySelectorAll('#m1-options .option-btn').forEach(b => {
        b.disabled = true;
        const k = b.dataset.key;
        const od = q.options.find(o => o.key === k);
        if (od && od.is_correct) b.classList.add('correct');
        else if (k === key && !isCorrect) b.classList.add('wrong');
      });

      if (q.node_id) Mastery.update(q.node_id, isCorrect);
      if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, isCorrect, false);
      Progress.addAnswer(isCorrect);
      if (!isCorrect) {
        const c = q.options.find(o => o.is_correct);
        if (c) Wrongbook.add(q.id, q.node_id, key, c.key);
      }

      if (isCorrect) this.attack();
      else this.takeDamage();
      this.showExplanation(opt, isCorrect);
    },

    attack() {
      this.state.combo++;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
      this.state.correct++;
      const p = Player.load();
      const baseDmg = 18 + p.level * 2 + p.stats.analysis;
      const isCrit = this.state.combo >= 3 && Math.random() < 0.4;
      let dmg = isCrit ? Math.floor(baseDmg * 2) : baseDmg;
      if (this.state.doubleNext) { dmg *= 2; this.state.doubleNext = false; }
      this.state.bossHp = Math.max(0, this.state.bossHp - dmg);
      this.state.totalDamage += dmg;

      // 偵測 BOSS 剛倒下的瞬間(從 >0 變 0):顯示「衝刺加分模式」訊息
      if (this.state.bossHp === 0 && !this.state.bossKnockedOutShown) {
        this.state.bossKnockedOutShown = true;
        showToast('💥 BOSS 已倒下!衝刺加分模式 — 答完剩餘題目可獲得額外經驗', 3500);
      }

      GameFX.flash('correct');
      const playerAv = document.getElementById('player-avatar');
      const bossAv = document.getElementById('boss-avatar');
      GameFX.attackAnim(playerAv);
      // QA 修補 A35/A14:用集中 timer + 防呆,離開戰鬥時不殘留
      this._scheduleTimeout(() => {
        if (!this.state) return;
        GameFX.shake(bossAv); GameFX.damageNumber(bossAv, dmg, { kind: 'player', crit: isCrit });
      }, 200);
      if (this.state.combo >= 2) GameFX.combo(this.state.combo);
      if (this.state.combo === 5) { GameFX.confetti({ count: 100, colors: ['#fbbf24','#f59e0b','#ef4444'] }); showToast('🔥 5 連擊!氣勢正盛!'); }
      if (isCrit) GameFX.confetti({ count: 60, colors: ['#fb923c','#fbbf24'] });

      // 答對回血回藍(連擊加成)
      // 2026-05-10:題數 7→20,治療下調(原 6~10/5~8 → 2~5/2~5),避免 20 題後玩家無痛滿血
      const hpHeal = 2 + Math.min(this.state.combo, 3);    // 3~5 (combo 1~3+)
      const mpHeal = 2 + Math.min(this.state.combo, 3);    // 3~5
      const beforeHp = p.hp;
      p.hp = Math.min(p.hpMax, p.hp + hpHeal);
      p.mp = Math.min(p.mpMax, p.mp + mpHeal);
      Player.save(p);
      // 顯示綠色治療數字
      if (p.hp > beforeHp) {
        this._scheduleTimeout(() => {
          if (!this.state) return;
          GameFX.damageNumber(playerAv, '+' + (p.hp - beforeHp), { kind: 'player' });
        }, 400);
      }
      this.updateBars(); this.updateSkillTray();
    },

    takeDamage() {
      this.state.combo = 0; this.state.wrong++;
      // 傷害下調(原 12 + 5% boss HP → 8 + 3%),避免 5 錯就 GG
      const dmg = 8 + Math.floor(this.state.bossHpMax * 0.03);
      Player.damage(dmg);
      GameFX.flash('wrong'); GameFX.hideCombo();
      const playerAv = document.getElementById('player-avatar');
      const bossAv = document.getElementById('boss-avatar');
      GameFX.attackAnim(bossAv);
      // QA 修補 A35/A14:集中 timer 管理 + 防呆
      this._scheduleTimeout(() => {
        if (!this.state) return;
        GameFX.shake(playerAv); GameFX.damageNumber(playerAv, dmg, { kind: 'enemy' });
      }, 200);
      this.updateBars();
      const p = Player.load();
      if (p.hp <= 0) this._scheduleTimeout(() => { if (this.state) this.gameOver(); }, 1500);
    },

    showExplanation(opt, isCorrect) {
      const q = this.state.currentQ;
      const e = q.explanation || {};
      const correctOpt = q.options.find(o => o.is_correct);

      // 寬容查找任意選項的 wrong 解釋
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

      // 其他錯誤選項(不含使用者選的、不含正解)
      const otherWrongOptions = q.options.filter(o => !o.is_correct && (!opt || o.key !== opt.key));
      const otherAnalysis = otherWrongOptions.map(o => `
        <div style="padding:8px 10px;margin:6px 0;background:rgba(255,255,255,0.04);border-radius:4px;border-left:3px solid #94a3b8">
          <div style="color:#cbd5e1;font-weight:600;margin-bottom:2px">${o.key}. ${o.text}</div>
          <div style="color:var(--fg-dim);font-size:0.875rem;line-height:1.6">└ ${findWrongExp(o)}</div>
        </div>
      `).join('');

      const userWrongExp = !isCorrect && opt ? findWrongExp(opt) : '';

      const enemyTaunt = !isCorrect ? `<div class="dialogue-box" style="border-color:rgba(239,68,68,0.4)">
        <div class="dialogue-name" style="color:#f87171">${this.state.boss.name}</div>
        <div class="dialogue-text">「${RNG.pick(this.state.boss.attack)}」</div>
      </div>` : '';

      document.getElementById('m1-explanation').innerHTML = `
        ${enemyTaunt}
        <div class="explanation">
          <div class="verdict ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '⚔️ 攻擊命中!' : '🩸 你受到攻擊!'}</div>

          <div style="background:rgba(74,222,128,0.12);border-left:4px solid #4ade80;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#4ade80;font-weight:700;font-size:0.95rem;margin-bottom:4px">📚 正確答案</div>
            <div style="font-size:1rem;margin-bottom:6px"><strong>${correctOpt ? correctOpt.key + '. ' + correctOpt.text : '(無)'}</strong></div>
            <div style="color:var(--fg);line-height:1.7">${e.correct || '(此題未提供詳細解釋,請參考正確選項文字)'}</div>
          </div>

          ${!isCorrect ? `<div style="background:rgba(248,113,113,0.12);border-left:4px solid #f87171;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#f87171;font-weight:700;font-size:0.95rem;margin-bottom:4px">❌ 你選了 ${opt.key}. ${opt.text}</div>
            <div style="color:var(--fg);line-height:1.7">${userWrongExp}</div>
          </div>` : ''}

          ${otherAnalysis ? `<div style="background:rgba(148,163,184,0.08);border-left:4px solid #94a3b8;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#cbd5e1;font-weight:700;font-size:0.95rem;margin-bottom:6px">🔍 其他選項解析(為何也不是答案)</div>
            ${otherAnalysis}
          </div>` : ''}

          ${e.hook ? `<div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px 0">
            <div style="color:#facc15;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>
            <div style="color:var(--fg);font-style:italic;margin-top:2px">${e.hook}</div>
          </div>` : ''}

          ${q.misconceptions && q.misconceptions.length > 0 ? `<div style="background:rgba(168,85,247,0.10);border-left:4px solid #a855f7;padding:10px 12px;border-radius:6px;margin:10px 0">
            <div style="color:#c084fc;font-weight:700;font-size:0.85rem">⚠️ 此題常見誤解</div>
            <div style="color:var(--fg);margin-top:2px">${q.misconceptions.map(m => '• ' + m).join('<br>')}</div>
          </div>` : ''}

          <div class="actions" style="margin-top:14px">
            <button class="btn btn-primary" onclick="Mode1.next()">繼續戰鬥 →</button>
            ${!isCorrect ? `<button class="btn btn-warn" onclick="Mode1.drillThis()">🎯 立即下鑽變化型</button>` : ''}
            ${ErrorReports.renderButton(q.id)}
          </div>
        </div>
      `;
    },

    drillThis() {
      // QA 修補:防呆
      if (!this.state || !this.state.currentQ) return;
      const variations = generateVariation(this.state.currentQ, 3);
      if (!variations || variations.length === 0) {
        showToast('⚠️ 此知識點變化型不足,繼續戰鬥', 2500);
        return;
      }
      // QA Round2:清掉 takeDamage 排的 gameOver timer(若 HP=0 後立即下鑽,
      // 否則 1.5s 後 gameOver 會把 view-play 寫成「你倒下了」蓋掉下鑽中的題目)
      this._clearAllTimers();
      // 下鑽完成後返回戰鬥(不回首頁),繼續下一回合
      DrillSession.start(this.state.currentQ.node_id, variations, this.state.currentQ, () => {
        // QA 修補:若中途使用者已切回主地圖,state 可能被清,直接放棄
        if (!this.state) return;
        // 若 HP 已歸 0(下鑽前 takeDamage 觸發但 timer 已被清),改走 gameOver
        const p = Player.load();
        if (p.hp <= 0) { this.gameOver(); return; }
        this.renderBattle();   // 重建戰鬥介面(因為 view-play 已被 DrillSession 覆蓋)
        this.next();           // 進到下一回合
      });
    },

    next() {
      if (!this.state) return; // QA 修補:防呆
      this.state.answering = false; // QA 修補 A1:解鎖
      this.state.idx++;
      // 不在此提早跳 victory,讓題目跑滿(由 showQuestion 的 idx 條件統一判定)
      this.showQuestion();
    },

    useHint() {
      // QA 修補:無題目或已答完(answering=true)不可用
      if (!this.state || !this.state.currentQ || this.state.answering) return;
      const p = Player.load();
      if (p.mp < 10) return showToast('MP 不足');
      p.mp -= 10; Player.save(p);
      const q = this.state.currentQ;
      const tip = q.explanation && q.explanation.hook ? q.explanation.hook : '依題意找最直接相符的選項';
      showToast('💡 ' + tip, 4000);
      this.updateBars(); this.updateSkillTray();
    },

    useEliminate() {
      // QA 修補:無題目或已答完不可用
      if (!this.state || !this.state.currentQ || this.state.answering) return;
      const p = Player.load();
      if (p.mp < 15) return showToast('MP 不足');
      p.mp -= 15; Player.save(p);
      const wrongs = this.state.currentQ.options.filter(o => !o.is_correct);
      const elim = RNG.pickN(wrongs, Math.min(2, wrongs.length));
      elim.forEach(e => {
        const btn = document.querySelector(`#m1-options [data-key="${e.key}"]`);
        if (btn) { btn.disabled = true; btn.style.opacity = '0.3'; btn.style.textDecoration = 'line-through'; }
      });
      showToast('❌ 已消除 2 個錯誤選項');
      this.updateBars(); this.updateSkillTray();
    },

    useDouble() {
      // QA 修補:無題目不可用,且已蓄能不可重複
      if (!this.state || !this.state.currentQ) return;
      if (this.state.doubleNext) return showToast('已蓄能,先擊出再蓄');
      const p = Player.load();
      if (p.mp < 20) return showToast('MP 不足');
      p.mp -= 20; Player.save(p);
      this.state.doubleNext = true;
      showToast('⚡ 下一擊雙倍傷害已蓄能!');
      this.updateBars(); this.updateSkillTray();
    },

    victory() {
      const baseExp = 60 + this.state.correct * 12;
      const perfectBonus = this.state.wrong === 0 ? 40 : 0;
      const comboBonus = this.state.maxCombo * 5;
      const totalExp = baseExp + perfectBonus + comboBonus;
      Player.gainExp(totalExp);

      const industries = this.industriesState();
      const prev = industries[this.state.boss.key] || {};
      industries[this.state.boss.key] = {
        defeated: true,
        perfectClear: prev.perfectClear || (this.state.wrong === 0),
        defeatedAt: Date.now(),
        bestCombo: Math.max(prev.bestCombo || 0, this.state.maxCombo)
      };
      Storage.set('ipas_mode1_industries_v1', industries);

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#fbbf24;font-size:2rem">🏆 戰鬥勝利!</h1>
          <div style="font-size:4rem;margin:16px 0">${this.state.boss.avatar}</div>
          <div class="dialogue-box">
            <div class="dialogue-name">${this.state.boss.name}</div>
            <div class="dialogue-text">「${RNG.pick(this.state.boss.defeat)}」</div>
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
            <button class="btn btn-primary" onclick="Mode1.start()">🗺️ 回任務地圖</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
          </div>
        </div>
      `;
      GameFX.bigConfetti();
      refreshHome();
    },

    gameOver() {
      // QA Round2:文案說「恢復一半 HP」,Player.heal(50) 在 Lv1 hpMax=100 時剛好 50%,
      // 但升級後 hpMax 增加(每級 +20),50 點就低於一半。改為 Math.floor(hpMax/2) 一致化。
      const before = Player.load();
      Player.heal(Math.floor(before.hpMax / 2));
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#f87171;font-size:2rem">💀 你倒下了</h1>
          <div style="font-size:4rem;margin:16px 0">😵</div>
          <div class="dialogue-box">
            <div class="dialogue-name">${this.state.boss.name}</div>
            <div class="dialogue-text">「${RNG.pick(this.state.boss.attack)}」</div>
          </div>
          <p style="margin:16px 0;color:var(--fg-dim)">休息片刻後,你恢復了一半 HP...</p>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode1.selectBoss('${this.state.boss.key}')">⚔️ 再戰</button>
            <button class="btn btn-ghost" onclick="Mode1.start()">🗺️ 回地圖</button>
          </div>
        </div>
      `;
    }
  };

  window.Mode1 = Mode1;
})();
