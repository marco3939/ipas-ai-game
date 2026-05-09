/* ============================================================
 * Mode 5 「弱點獵人」(自適應 + Boss 戰)
 * 鐵律 #1:錯題立即下鑽變化型(本模式更激進 — 強制連戰 3~5 題)
 * 鐵律 #2:每場新 random seed → 變數池替換 + 洗牌
 * ============================================================ */
const Mode5 = {
  /* ---------- Boss 名單(5 errata + 7 high priority)---------- */
  bossList: [
    { qid: 'q_0001', name: 'Recall 公式 Boss',     icon: '⚙️', tag: 'errata' },
    { qid: 'q_0002', name: 'PDPA 六項 Boss',       icon: '⚖️', tag: 'errata' },
    { qid: 'q_0003', name: 'NMF 非負矩陣 Boss',     icon: '🔢', tag: 'errata' },
    { qid: 'q_0004', name: 'Logistic 迴歸 Boss',   icon: '📈', tag: 'errata' },
    { qid: 'q_0005', name: '加權求和集成 Boss',     icon: '➗', tag: 'errata' },
    // 7 個高優先預測 Boss(must_cover=true 或 tags 含高優先/高頻 — 動態載入)
  ],

  state: {
    progress: { passedBosses: [] },
    queue: [],
    currentBoss: null,
    bossHp: 100,
    drillStreak: 0,
    pendingDrill: [],
    sessionStats: { correct: 0, wrong: 0, answered: 0 },
    mode: null
  },

  STORAGE_KEY: 'ipas_mode5_progress_v1',

  /* ---------------- 入口 ---------------- */
  start() {
    RNG.set(Date.now());                              // 鐵律 #2
    this.loadProgress();
    this.fillHighPriorityBosses();
    this.renderMenu();
  },

  loadProgress() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) this.state.progress = JSON.parse(raw);
      if (!Array.isArray(this.state.progress.passedBosses)) {
        this.state.progress.passedBosses = [];
      }
    } catch (e) {
      this.state.progress = { passedBosses: [] };
    }
  },

  saveProgress() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state.progress));
  },

  /* 動態補齊 7 個高優先 Boss */
  fillHighPriorityBosses() {
    if (this.bossList.length >= 12) return;
    const existing = new Set(this.bossList.map(b => b.qid));
    const candidates = QUESTIONS.filter(q =>
      !existing.has(q.id) && !q.errata_critical &&
      (q.must_cover === true ||
       (Array.isArray(q.tags) && q.tags.some(t => /高優先|高頻|must_cover/i.test(t))))
    );
    const icons = ['🔥','⭐','💎','🎯','🛡️','⚡','🌪️'];
    const need = 12 - this.bossList.length;
    const picks = candidates.slice(0, need);
    picks.forEach((q, i) => {
      const title = (q.title || q.question || q.stem || '').slice(0, 14) || ('Boss ' + (i + 6));
      this.bossList.push({
        qid: q.id,
        name: title + ' Boss',
        icon: icons[i % icons.length],
        tag: 'high_priority'
      });
    });
    while (this.bossList.length < 12) {
      const fallback = QUESTIONS.find(q => !existing.has(q.id));
      if (!fallback) break;
      existing.add(fallback.id);
      this.bossList.push({
        qid: fallback.id,
        name: 'Boss ' + (this.bossList.length + 1),
        icon: '🎲',
        tag: 'fallback'
      });
    }
  },

  /* ---------------- 主選單 ---------------- */
  renderMenu() {
    const passed = this.state.progress.passedBosses.length;
    const totalBosses = this.bossList.length;
    const masteredCount = (typeof Mastery.countMastered === 'function') ? Mastery.countMastered() : 0;
    const root = document.getElementById('view-mode5') || document.getElementById('view-result');
    const html = `
      <div class="card">
        <h2>🎯 弱點獵人</h2>
        <p style="color:#666;">自適應訓練 × 12 場 Boss 戰 — 把鐵律推到極限</p>
        <div class="boss-bar" style="margin:12px 0;">
          <span class="boss-name">當前進度</span>
          <span class="boss-hp"><span class="boss-hp-fill" style="width:${(passed/totalBosses)*100}%"></span></span>
          <span style="margin-left:8px;">${passed} / ${totalBosses}</span>
        </div>
        <p style="color:#888;font-size:13px;">已熟練節點:${masteredCount}</p>
        <div class="modes-grid" style="margin-top:16px;">
          <div class="mode-card" id="m5-quick">
            <h3>🩺 快速診斷</h3>
            <p>20 題冷啟動,建立熟練度起點</p>
            <button class="btn btn-primary" onclick="Mode5.startQuickDiagnosis()">開始</button>
          </div>
          <div class="mode-card" id="m5-weak">
            <h3>🎯 弱點訓練</h3>
            <p>從最弱 5 個節點循環抽題,錯了立即連戰 3 變化型</p>
            <button class="btn btn-warn" onclick="Mode5.startWeaknessMode()">開始</button>
          </div>
          <div class="mode-card" id="m5-boss">
            <h3>👹 Boss 戰</h3>
            <p>逐關打 12 個 Boss,熟練度需 ≥ 90% 才過關</p>
            <button class="btn btn-danger" onclick="Mode5.startBossMode()">開始</button>
          </div>
        </div>
        <div class="actions" style="margin-top:14px;">
          <button class="btn" onclick="Mode5.renderBossList()">查看 Boss 列表</button>
          <button class="btn" onclick="goHome()">返回主選單</button>
        </div>
      </div>`;
    if (root) root.innerHTML = html;
    if (typeof show === 'function') show('view-result');
  },

  renderBossList() {
    const passed = new Set(this.state.progress.passedBosses);
    const items = this.bossList.map((b, idx) => {
      const done = passed.has(b.qid);
      const m = Mastery.get(b.node_id || (this.findQ(b.qid) || {}).node_id) || { score: 0 };
      const score = Math.round(m.score || 0);
      const cls = score >= 90 ? 'high' : (score >= 60 ? 'mid' : 'low');
      return `<div class="weak-item">
        <span>${b.icon} ${idx + 1}. ${b.name} ${done ? '✅' : ''}</span>
        <span class="weak-score ${cls}">${score}%</span>
      </div>`;
    }).join('');
    const root = document.getElementById('view-result');
    if (root) {
      root.innerHTML = `
        <div class="card">
          <h2>👹 12 Boss 名單</h2>
          <div class="weak-list">${items}</div>
          <div class="actions" style="margin-top:14px;">
            <button class="btn btn-primary" onclick="Mode5.renderMenu()">返回</button>
          </div>
        </div>`;
    }
    if (typeof show === 'function') show('view-result');
  },

  findQ(qid) {
    return QUESTIONS.find(q => q.id === qid);
  },

  /* ---------------- 模式 1:快速診斷 ---------------- */
  startQuickDiagnosis() {
    this.state.mode = 'quick';
    this.state.sessionStats = { correct: 0, wrong: 0, answered: 0 };
    // 各 knowledge_code 平均抽題
    const buckets = {};
    QUESTIONS.forEach(q => {
      const k = q.knowledge_code || q.code || 'X';
      (buckets[k] = buckets[k] || []).push(q);
    });
    const codes = Object.keys(buckets);
    const perCode = Math.max(1, Math.floor(20 / codes.length));
    let pool = [];
    codes.forEach(c => pool = pool.concat(RNG.pickN(buckets[c], perCode)));
    if (pool.length < 20) {
      const remaining = QUESTIONS.filter(q => !pool.includes(q));
      pool = pool.concat(RNG.pickN(remaining, 20 - pool.length));
    }
    this.state.queue = RNG.shuffle(pool).slice(0, 20);
    this.nextQuick();
  },

  nextQuick() {
    if (this.state.queue.length === 0) return this.finish('quick');
    const q = this.state.queue.shift();
    PlayEngine.show(q, { showProgress: true, total: 20, current: this.state.sessionStats.answered + 1 });
    PlayEngine.onNext = (isCorrect) => {
      this.state.sessionStats.answered++;
      if (isCorrect) this.state.sessionStats.correct++;
      else this.state.sessionStats.wrong++;
      // 快速診斷不下鑽,只更新 mastery(主檔已自動)
      this.nextQuick();
    };
  },

  /* ---------------- 模式 2:弱點訓練 ---------------- */
  startWeaknessMode() {
    this.state.mode = 'weakness';
    this.state.sessionStats = { correct: 0, wrong: 0, answered: 0 };
    // 取所有 attempts > 0 的 node
    const allNodes = [...new Set(QUESTIONS.map(q => q.node_id).filter(Boolean))];
    const trained = allNodes.filter(nid => {
      const m = Mastery.get(nid);
      return m && m.attempts > 0;
    });
    if (trained.length < 5) {
      showToast('資料不足!請先跑快速診斷建立起點');
      return this.renderMenu();
    }
    this.state.pendingDrill = [];
    this.state.drillStreak = 0;
    this.nextWeakness();
  },

  pickWeaknessQuestion() {
    const allNodes = [...new Set(QUESTIONS.map(q => q.node_id).filter(Boolean))];
    const weakest = Mastery.getWeakest(allNodes, 5) || [];
    if (!weakest.length) return RNG.pick(QUESTIONS);
    const targetNode = RNG.pick(weakest);
    const nodeId = (typeof targetNode === 'string') ? targetNode : (targetNode.node_id || targetNode.id);
    const pool = QUESTIONS.filter(q => q.node_id === nodeId);
    return pool.length ? RNG.pick(pool) : RNG.pick(QUESTIONS);
  },

  nextWeakness() {
    // 結束條件:答對 ≥ 15 題或使用者主動結束
    if (this.state.sessionStats.answered >= 30) return this.finish('weakness');

    let q;
    if (this.state.pendingDrill.length) {
      q = this.state.pendingDrill.shift();
    } else {
      q = this.pickWeaknessQuestion();
    }

    PlayEngine.show(q, {
      showProgress: true,
      total: 30,
      current: this.state.sessionStats.answered + 1,
      modeBadge: this.state.drillStreak > 0
        ? `🔥 變化型連戰 ${this.state.drillStreak}/3`
        : '🎯 弱點訓練'
    });

    PlayEngine.onNext = (isCorrect) => {
      this.state.sessionStats.answered++;
      if (isCorrect) {
        this.state.sessionStats.correct++;
        if (this.state.drillStreak > 0) {
          this.state.drillStreak++;
          if (this.state.drillStreak >= 3 && this.state.pendingDrill.length === 0) {
            // 連戰結束 → 解除連戰
            showToast('🎉 連戰過關!熟練度 +20');
            Mastery.drillBonus(q.node_id);
            this.state.drillStreak = 0;
            Wrongbook.markMastered(q.id);
          }
        }
      } else {
        this.state.sessionStats.wrong++;
        // 鐵律 #1 強制連戰 3 變化型
        this.drillIfWrong(q, false);
      }
      this.nextWeakness();
    };
  },

  /* ---------------- 模式 3:Boss 戰 ---------------- */
  startBossMode() {
    this.state.mode = 'boss';
    this.state.sessionStats = { correct: 0, wrong: 0, answered: 0 };
    const passed = new Set(this.state.progress.passedBosses);
    const next = this.bossList.find(b => !passed.has(b.qid));
    if (!next) return this.graduate();
    this.engageBoss(next);
  },

  engageBoss(boss) {
    this.state.currentBoss = boss;
    this.state.bossHp = 100;
    this.state.drillStreak = 0;
    this.state.pendingDrill = [];
    const q = this.findQ(boss.qid);
    if (!q) {
      showToast('Boss 題目找不到,跳過');
      this.state.progress.passedBosses.push(boss.qid);
      this.saveProgress();
      return this.startBossMode();
    }
    this.renderBossIntro(boss, q);
  },

  renderBossIntro(boss, q) {
    const root = document.getElementById('view-result');
    const idx = this.bossList.findIndex(b => b.qid === boss.qid) + 1;
    const m = Mastery.get(q.node_id) || { score: 0 };
    if (root) {
      root.innerHTML = `
        <div class="card">
          <div class="boss-bar">
            <span class="boss-name">${boss.icon} 第 ${idx} 關 — ${boss.name}</span>
            <span class="boss-hp"><span class="boss-hp-fill" style="width:100%"></span></span>
          </div>
          <p style="margin-top:10px;color:#666;">節點:<code>${q.node_id || '—'}</code> 目前熟練度:${Math.round(m.score || 0)}%</p>
          <p style="color:#a40;">⚠ 過關條件:該節點熟練度 ≥ 90%。答錯立即連戰 5 題變化型!</p>
          <div class="actions">
            <button class="btn btn-danger" onclick="Mode5.fightBoss()">開戰</button>
            <button class="btn" onclick="Mode5.renderMenu()">退出</button>
          </div>
        </div>`;
    }
    if (typeof show === 'function') show('view-result');
  },

  fightBoss() {
    const boss = this.state.currentBoss;
    const q = this.findQ(boss.qid);
    PlayEngine.show(q, {
      showProgress: true,
      modeBadge: `${boss.icon} ${boss.name}`,
      bossMode: true,
      bossHp: this.state.bossHp
    });
    PlayEngine.onNext = (isCorrect) => {
      this.state.sessionStats.answered++;
      if (isCorrect) {
        this.state.sessionStats.correct++;
        this.state.bossHp = 0;
        this.afterBossHit(true);
      } else {
        this.state.sessionStats.wrong++;
        // 答錯 → 注入 5 變化型強制連戰
        const variations = generateVariation(q, 5) || [];
        this.state.pendingDrill = variations.length
          ? variations
          : RNG.pickN(QUESTIONS.filter(x => x.node_id === q.node_id && x.id !== q.id), 5);
        this.state.drillStreak = 0;
        showToast('💥 答錯!Boss 反擊 — 強制連戰 5 變化型');
        this.fightBossDrill();
      }
    };
  },

  fightBossDrill() {
    if (this.state.pendingDrill.length === 0) {
      return this.afterBossHit(false);
    }
    const q = this.state.pendingDrill.shift();
    this.state.drillStreak++;
    PlayEngine.show(q, {
      modeBadge: `🔥 Boss 連戰 ${this.state.drillStreak}/5`,
      bossMode: true,
      bossHp: this.state.bossHp
    });
    PlayEngine.onNext = (isCorrect) => {
      this.state.sessionStats.answered++;
      if (isCorrect) {
        this.state.sessionStats.correct++;
        Mastery.drillBonus(q.node_id);
      } else {
        this.state.sessionStats.wrong++;
      }
      this.fightBossDrill();
    };
  },

  afterBossHit(victoryFromMain) {
    const boss = this.state.currentBoss;
    const q = this.findQ(boss.qid);
    const m = Mastery.get(q.node_id) || { score: 0 };
    const score = Math.round(m.score || 0);
    const passed = score >= 90;
    const root = document.getElementById('view-result');

    if (passed) {
      if (!this.state.progress.passedBosses.includes(boss.qid)) {
        this.state.progress.passedBosses.push(boss.qid);
        this.saveProgress();
      }
      Wrongbook.markMastered(boss.qid);
    }

    const totalDone = this.state.progress.passedBosses.length;
    const allDone = totalDone >= this.bossList.length;

    if (root) {
      root.innerHTML = `
        <div class="card">
          <div class="boss-bar">
            <span class="boss-name">${boss.icon} ${boss.name}</span>
            <span class="boss-hp"><span class="boss-hp-fill" style="width:${passed ? 0 : 100}%"></span></span>
          </div>
          <h2 style="margin-top:14px;">${passed ? '🏆 過關!' : '💢 未達 90% — 再戰!'}</h2>
          <p>節點熟練度:<b style="color:${passed ? '#1a7' : '#c33'}">${score}%</b> / 90%</p>
          <p style="color:#666;">本場答題:${this.state.sessionStats.answered} 題(對 ${this.state.sessionStats.correct} / 錯 ${this.state.sessionStats.wrong})</p>
          <div class="actions" style="margin-top:14px;">
            ${passed
              ? (allDone
                  ? `<button class="btn btn-primary" onclick="Mode5.graduate()">查看畢業典禮 🎓</button>`
                  : `<button class="btn btn-primary" onclick="Mode5.startBossMode()">挑戰下一關</button>`)
              : `<button class="btn btn-warn" onclick="Mode5.engageBoss(Mode5.state.currentBoss)">再戰一次</button>`}
            <button class="btn" onclick="Mode5.renderMenu()">回主選單</button>
          </div>
        </div>`;
    }
    if (typeof show === 'function') show('view-result');
  },

  /* ---------------- 鐵律 #1 強制連戰 ---------------- */
  drillIfWrong(q, isCorrect) {
    if (isCorrect) return;
    const variations = generateVariation(q, 3) || [];
    const drills = variations.length
      ? variations
      : RNG.pickN(QUESTIONS.filter(x => x.node_id === q.node_id && x.id !== q.id), 3);
    this.state.pendingDrill.push(...drills);
    this.state.drillStreak = 1;
    showToast('💥 鐵律啟動!連戰 3 變化型');
  },

  /* ---------------- 結算 ---------------- */
  finish(mode) {
    const s = this.state.sessionStats;
    const acc = s.answered ? Math.round(s.correct / s.answered * 100) : 0;
    const root = document.getElementById('view-result');
    const titleMap = {
      quick: '🩺 快速診斷完成',
      weakness: '🎯 弱點訓練結束',
      boss: '👹 Boss 戰結算'
    };
    if (root) {
      root.innerHTML = `
        <div class="card">
          <h2>${titleMap[mode] || '本場結束'}</h2>
          <p>答對:<b>${s.correct}</b> / 答錯:<b>${s.wrong}</b> / 總題數:${s.answered}</p>
          <p>正確率:<b style="color:${acc>=80?'#1a7':acc>=60?'#a70':'#c33'}">${acc}%</b></p>
          <p style="color:#888;">熟練節點數:${Mastery.countMastered ? Mastery.countMastered() : '—'}</p>
          <div class="actions" style="margin-top:14px;">
            <button class="btn btn-primary" onclick="Mode5.renderMenu()">回 Mode 5 選單</button>
            <button class="btn" onclick="goHome()">回主畫面</button>
          </div>
        </div>`;
    }
    if (typeof show === 'function') show('view-result');
  },

  /* ---------------- 畢業特效 ---------------- */
  graduate() {
    const root = document.getElementById('view-result');
    if (root) {
      root.innerHTML = `
        <div class="card" style="text-align:center;background:linear-gradient(135deg,#fff7e6,#ffeccd);border:2px solid #f7b500;">
          <h1 style="font-size:42px;margin:18px 0;">🎓 弱點獵人 — 畢業 🎓</h1>
          <p style="font-size:18px;color:#a40;">所有 ${this.bossList.length} 場 Boss 戰全數攻克!</p>
          <div style="font-size:64px;margin:20px 0;letter-spacing:8px;">🏆🎯💎🔥⚡</div>
          <p style="color:#666;">你已將 IPAS AI 核心節點熟練度推至 90% 以上。</p>
          <p style="color:#888;font-size:13px;">建議:回到主畫面跑「混合模擬考」驗證實戰。</p>
          <div class="actions" style="justify-content:center;margin-top:20px;">
            <button class="btn btn-primary" onclick="Mode5.resetProgress()">🔄 重置畢業進度</button>
            <button class="btn" onclick="goHome()">回主畫面</button>
          </div>
        </div>`;
    }
    if (typeof show === 'function') show('view-result');
  },

  resetProgress() {
    if (!confirm('確定要清空 12 Boss 過關紀錄?')) return;
    this.state.progress = { passedBosses: [] };
    this.saveProgress();
    showToast('進度已重置');
    this.renderMenu();
  }
};

window.Mode5 = Mode5;
