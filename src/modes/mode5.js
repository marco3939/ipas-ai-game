// ============================================================
// Mode 5: 弱點獵人 — 自適應 RPG 戰鬥(完整重做 v3)
// 主角:弱點獵人(自我修煉)
// BOSS:從 Wrongbook + Mastery 動態決定的「玩家最弱知識點」
// 鐵律 #1 + #5 全合規(只用 questions*.json + generateVariation)
// ============================================================
(function () {

  // === 工具:Mastery score 0-100 ↔ 任務語意的 0-1 ===
  // 任務描述用 0-1 (e.g. <0.4, ≥0.8, +0.15);共用層 score 採 0-100。換算如下:
  //   Mastery.get(nodeId).score / 100 = 「百分比進度」
  //   任務的 +0.15 → score +15;任務的 +0.10 → +10;任務的 -0.05 → -5
  const SCORE_DELTA_CORRECT = 15;   // 答對 mastery +0.15
  const SCORE_DELTA_WRONG   = 5;    // 答錯 mastery -0.05
  const SCORE_DELTA_REINFORCE = 10; // 強化記憶招式 +0.10
  const MASTERY_DEFEAT_THRESHOLD = 80; // ≥ 0.8 才算擊敗 BOSS
  const MASTERY_WEAK_THRESHOLD   = 40; // < 0.4 視為「弱點」

  // === 直接調整 score 的小工具(用 Mastery.load/save 確保格式一致)===
  // 注意:同時 bump attempts/correct/streak,讓首頁「弱點分析」能感知 Mode5 戰鬥紀錄
  // opts.attempts: 是否計入一次 attempt(預設 true);opts.correct: 是否答對(預設依 delta 正負)
  function adjustMasteryScore(nodeId, delta, opts = {}) {
    if (!nodeId) return null;
    let m;
    try { m = Mastery.load(); } catch { m = {}; }
    const node = m[nodeId] || { score: 0, attempts: 0, correct: 0, streak: 0 };
    node.score = Math.max(0, Math.min(100, (node.score || 0) + delta));
    if (opts.attempts !== false) {
      const isCorrect = opts.correct != null ? !!opts.correct : (delta > 0);
      node.attempts = (node.attempts || 0) + 1;
      if (isCorrect) {
        node.correct = (node.correct || 0) + 1;
        node.streak = (node.streak || 0) + 1;
      } else {
        node.streak = 0;
      }
    }
    node.lastSeen = Date.now();
    m[nodeId] = node;
    try { Mastery.save(m); } catch (e) { console.warn('mastery save failed:', e); }
    return node;
  }

  // === 弱點 BOSS 候選選擇:嚴格三步驟 ===
  // Step 1: Wrongbook 答錯次數最多的前 5 個 node_id
  // Step 2: Mastery < 0.4 的節點補進 BOSS 名單,共最多 5 個
  // Step 3: 若 Wrongbook 為空(新玩家),fallback 隨機 3 個節點
  function selectWeakBosses() {
    const sources = []; // { nodeId, weak, source }
    // 預先建一個「題庫真的有題目可用」的 nodeId 集合,用於 Step 1/2/3 全域過濾,
    // 避免 Wrongbook / Mastery 殘留指向已刪題目的 nodeId(stale node)導致 BOSS 名單卡空。
    const liveNodeSet = new Set(QUESTIONS.map(q => q.node_id).filter(Boolean));

    // Step 1:Wrongbook 聚合(只取題庫仍存在的 nodeId)
    const wb = Wrongbook.load().filter(x => !x.mastered && x.nodeId && liveNodeSet.has(x.nodeId));
    const nodeWrongCount = {};
    wb.forEach(x => {
      nodeWrongCount[x.nodeId] = (nodeWrongCount[x.nodeId] || 0) + (x.wrongCount || 1);
    });
    const sortedWrong = Object.entries(nodeWrongCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nodeId, count]) => ({ nodeId, weak: count, source: 'wrongbook' }));
    sources.push(...sortedWrong);

    // Step 2:Mastery < 0.4 補進(只取題庫仍存在的 nodeId,若名單尚未滿 5 個)
    if (sources.length < 5) {
      const m = Mastery.load();
      const existing = new Set(sources.map(s => s.nodeId));
      const lowMastery = Object.entries(m)
        .filter(([nodeId, node]) =>
          !existing.has(nodeId) &&
          liveNodeSet.has(nodeId) &&
          (node.attempts || 0) > 0 &&
          (node.score || 0) < MASTERY_WEAK_THRESHOLD
        )
        .sort((a, b) => (a[1].score || 0) - (b[1].score || 0))
        .slice(0, 5 - sources.length)
        .map(([nodeId, node]) => ({ nodeId, weak: Math.round(MASTERY_WEAK_THRESHOLD - (node.score || 0)), source: 'mastery' }));
      sources.push(...lowMastery);
    }

    // Step 3:新玩家 fallback —— 沒任何 valid 弱點資料時,隨機 3 個 node
    if (sources.length === 0) {
      const picks = RNG.pickN([...liveNodeSet], Math.min(3, liveNodeSet.size));
      picks.forEach(nodeId => sources.push({ nodeId, weak: 1, source: 'fallback' }));
    }

    // 雙保險:即使前面已過濾,仍再做一次 sanity check(液態題庫變動或 stub 失效)
    const validBosses = sources.filter(s => liveNodeSet.has(s.nodeId));
    return validBosses.slice(0, 5);
  }

  // === 題庫挑題:該 node 的所有題目 + generateVariation 變化型 ===
  function pickQuestionsForNode(nodeId, baseCount = 5) {
    const direct = QUESTIONS.filter(q => q.node_id === nodeId);
    if (direct.length === 0) return [];
    // 先放 direct(順序洗牌),不夠再用 generateVariation 補(由 base[0] 衍生)
    let pool = RNG.shuffle(direct);
    if (pool.length < baseCount && direct[0]) {
      const variations = generateVariation(direct[0], baseCount - pool.length) || [];
      pool = pool.concat(variations.filter(v => !pool.find(p => p.id === v.id)));
    }
    // 直接整池回傳(別 slice 掉題目),baseCount 只是初始期望數量
    return pool;
  }

  // === 招式語意 metadata(自家實作,不抄 mode1)===
  const SKILLS = {
    analyze:   { name: '弱點分析', cost: 12, icon: '🔍', desc: '消 12 MP,標記出 BOSS 弱點(消 2 個錯誤選項)' },
    reinforce: { name: '強化記憶', cost: 18, icon: '🧠', desc: '消 18 MP,該節點熟練度 +0.10' },
    drill:     { name: '下鑽訓練', cost: 0,  icon: '🎯', desc: '直接進入該題的下鑽變化型(不消 MP)' }
  };

  // === BOSS 名稱化(用 node_id 簡寫)===
  function nodeDisplayName(nodeId) {
    if (!nodeId) return '未知節點';
    const sample = QUESTIONS.find(q => q.node_id === nodeId);
    if (sample) {
      // 取 knowledge_code 與 stem 前 12 字
      const stem = (sample.stem || '').replace(/\{[^}]*\}/g, '').slice(0, 16);
      return `${sample.knowledge_code} · ${stem || nodeId}`;
    }
    return nodeId;
  }

  function bossAvatar(idx) {
    const icons = ['👹', '🦂', '🐉', '🦑', '👻'];
    return icons[idx % icons.length];
  }

  // === highlight code(內建,避免依賴 mode1 的)===
  function highlightCode(code) {
    if (!code) return '';
    let s = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/(#[^\n]*)/g, '<span class="com">$1</span>');
    s = s.replace(/(["'])((?:(?!\1).)*)\1/g, '<span class="str">$1$2$1</span>');
    // 2026-05-11 bug fix(同 index.html:highlightCodeSimple):移除 'class' 避免咬到 <span class="str"> 屬性產生 <span <span...> 巢狀破爛 HTML
    s = s.replace(/\b(import|from|def|return|if|else|elif|for|while|in|as|with|try|except|None|True|False|lambda|pass|self|print|len|range|np|pd|sklearn|torch|nn|tf)\b/g, '<span class="kw">$1</span>');
    s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    return s;
  }

  // ============================================================
  // 主物件
  // ============================================================
  const Mode5 = {
    state: null,
    cachedBosses: null, // 快取本回合的 BOSS 名單,避免 engageBoss(idx) 因 RNG / Wrongbook 變化抓錯目標

    start() {
      RNG.set(Date.now());
      this.cachedBosses = null; // 進案時重新偵測
      this.renderMap();
    },

    // 進度 storage(用來記錄哪些 BOSS 已被擊敗 + 起始 mastery)
    progressKey: 'ipas_mode5_v3_progress',
    loadProg() {
      try { return Storage.get(this.progressKey, { defeated: [], runs: 0 }); }
      catch { return { defeated: [], runs: 0 }; }
    },
    saveProg(p) {
      try { Storage.set(this.progressKey, p); }
      catch (e) { console.warn('mode5 progress save failed:', e); }
    },

    // ============================================================
    // 地圖:列出 BOSS 名單(動態)
    // ============================================================
    renderMap() {
      const player = Player.load();
      // 使用快取避免 engageBoss(idx) 對應錯亂(尤其 fallback 隨機路徑、Wrongbook 已被新增)
      if (!this.cachedBosses) this.cachedBosses = selectWeakBosses();
      const bosses = this.cachedBosses;
      const prog = this.loadProg();
      const defeatedSet = new Set(prog.defeated || []);
      const playerHpPct = player.hp / player.hpMax * 100;

      const bossListHTML = bosses.length === 0
        ? `<div class="empty" style="padding:24px;color:var(--fg-mute)">⚠️ 尚未蒐集到任何弱點資料,且題庫節點全為空。請先用其他模式做題。</div>`
        : bosses.map((b, idx) => {
            const m = Mastery.get(b.nodeId);
            const score = Math.round(m.score || 0);
            const masteryCls = score >= 80 ? 'high' : (score >= 40 ? 'mid' : 'low');
            const defeated = defeatedSet.has(b.nodeId);
            const sourceLabel = b.source === 'wrongbook'
              ? `❌ 錯 ${b.weak} 次`
              : (b.source === 'mastery' ? `📉 熟練度低` : `🎲 新玩家初探`);
            const dangerClass = defeated ? '' : 'pulse';
            return `<button class="mode-card ${dangerClass}" onclick="Mode5.engageBoss(${idx})" style="${defeated ? 'opacity:0.65;border-color:var(--success)' : 'border-color:var(--danger)'}">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <span style="font-size:2rem">${bossAvatar(idx)}</span>
                <div style="flex:1;text-align:left">
                  <div class="mode-num" style="color:${defeated ? 'var(--success)' : 'var(--danger)'}">${defeated ? '✅ 已克服弱點' : `弱點等級 ${b.weak}`}</div>
                  <div class="mode-title" style="font-size:0.95rem">${nodeDisplayName(b.nodeId)}</div>
                </div>
              </div>
              <div class="mode-desc" style="font-size:0.82rem;text-align:left">${sourceLabel}</div>
              <div style="margin-top:8px">
                <div class="hp-track" style="height:10px"><div class="hp-fill" style="width:${score}%;background:linear-gradient(90deg,#facc15,#4ade80)"></div></div>
                <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.75rem;color:var(--fg-mute)">
                  <span>熟練度</span><span>${score}% / ${MASTERY_DEFEAT_THRESHOLD}%</span>
                </div>
              </div>
            </button>`;
          }).join('');

      // 候選來源說明(教育性透明度)
      const sourceCounts = bosses.reduce((acc, b) => { acc[b.source] = (acc[b.source] || 0) + 1; return acc; }, {});
      const sourceText = [];
      if (sourceCounts.wrongbook) sourceText.push(`錯題本 ${sourceCounts.wrongbook} 個`);
      if (sourceCounts.mastery)   sourceText.push(`低熟練 ${sourceCounts.mastery} 個`);
      if (sourceCounts.fallback)  sourceText.push(`新玩家初探 ${sourceCounts.fallback} 個`);

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card">
          <h1>🎯 弱點獵人 — 自適應 BOSS 戰</h1>
          <p style="color:var(--fg-dim)">系統依你的<strong>錯題本</strong>與<strong>熟練度</strong>動態鎖定 BOSS。每個 BOSS 是一個你最弱的知識節點,熟練度推到 80% 以上才算擊敗。</p>
          ${sourceText.length ? `<p style="color:var(--fg-mute);font-size:0.85rem;margin-top:8px">📊 BOSS 來源:${sourceText.join(' · ')}</p>` : ''}
        </div>

        <div class="battle-arena" style="padding:16px">
          <div class="player-bar">
            <div class="avatar">🏹</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${player.level}</span> 弱點獵人(你)</div>
              <div class="hp-track"><div class="hp-fill ${playerHpPct < 30 ? 'critical' : playerHpPct < 60 ? 'low' : ''}" style="width:${playerHpPct}%"></div></div>
              <div class="hp-text">HP ${player.hp} / ${player.hpMax} · MP ${player.mp} / ${player.mpMax} · EXP ${player.exp}/${player.expMax}</div>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:var(--fg-dim)">
            <span>❌ 錯題本:${Wrongbook.count()} 題</span>
            <span>🏆 已克服弱點:${(prog.defeated || []).length}</span>
            <span>⚔️ 出征次數:${prog.runs || 0}</span>
          </div>
        </div>

        <div class="card">
          <h2>👹 你最弱的 ${bosses.length} 個知識節點</h2>
          <div class="modes-grid">${bossListHTML}</div>
        </div>

        <div class="actions">
          <button class="btn btn-ghost" onclick="goHome()">🏠 回主頁</button>
          <button class="btn btn-ghost" onclick="Mode5.refreshBosses()">🔄 重新偵測弱點</button>
          ${(prog.defeated || []).length ? `<button class="btn btn-ghost" onclick="if(confirm('清除『已克服弱點』紀錄?'))Mode5.resetProgress()">♻️ 重置進度</button>` : ''}
        </div>
      `;
      show('view-play');
    },

    refreshBosses() {
      RNG.set(Date.now());
      this.cachedBosses = null; // 主動重新偵測
      this.renderMap();
      showToast('🔄 已重新偵測弱點');
    },

    resetProgress() {
      this.saveProg({ defeated: [], runs: 0 });
      this.cachedBosses = null;
      showToast('進度已重置');
      this.renderMap();
    },

    // ============================================================
    // 接戰
    // ============================================================
    engageBoss(idx) {
      // 用快取的名單,確保與 renderMap 顯示完全一致
      const bosses = this.cachedBosses || selectWeakBosses();
      const target = bosses[idx];
      if (!target) { showToast('BOSS 不存在'); return; }
      const questions = pickQuestionsForNode(target.nodeId, 5);
      if (questions.length === 0) {
        showToast('該節點題庫不足,跳過');
        return;
      }
      const startMastery = Mastery.get(target.nodeId).score || 0;

      // 戰鬥狀態
      this.state = {
        boss: target,
        bossIdx: idx,
        questions,
        idx: 0,
        currentQ: null,
        // BOSS HP 視覺化:從「目標 80% - 當前」對應
        bossHpMax: 100,
        bossHp: 100,
        // 運算狀態
        startMastery,
        correct: 0,
        wrong: 0,
        combo: 0,
        maxCombo: 0,
        totalDamage: 0,
        // 招式狀態
        analyzeUsed: false,
        // 進度標記
        avatarIcon: bossAvatar(idx)
      };

      // run 次數 +1
      const prog = this.loadProg();
      prog.runs = (prog.runs || 0) + 1;
      this.saveProg(prog);

      this.renderIntro();
    },

    renderIntro() {
      const s = this.state;
      const m = Mastery.get(s.boss.nodeId);
      const score = Math.round(m.score || 0);
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena">
          <div class="enemy-bar">
            <div class="avatar boss" style="font-size:2.5rem">${s.avatarIcon}</div>
            <div class="bar-info">
              <div class="bar-name">弱點 BOSS:${nodeDisplayName(s.boss.nodeId)}</div>
              <div class="hp-text">當前熟練度 ${score}% · 目標 ≥ ${MASTERY_DEFEAT_THRESHOLD}%</div>
            </div>
          </div>
          <div class="dialogue-box">
            <div class="dialogue-name">🎯 弱點獵人系統</div>
            <div class="dialogue-text" id="m5-intro-text"></div>
          </div>
          <div class="actions" style="margin-top:16px;justify-content:center">
            <button class="btn btn-primary" onclick="Mode5.startBattle()" style="font-size:1.1rem;padding:14px 28px">⚔️ 出擊!</button>
            <button class="btn btn-ghost" onclick="Mode5.renderMap()">退避</button>
          </div>
        </div>
      `;
      show('view-play');
      this.typeText('m5-intro-text',
        `偵測到此節點「${nodeDisplayName(s.boss.nodeId)}」是你的弱點。${s.boss.source === 'wrongbook' ? `你已在這裡錯了 ${s.boss.weak} 次。` : (s.boss.source === 'mastery' ? `你的熟練度只有 ${score}%。` : '這是新玩家初探,讓我們建立基準。')}打到熟練度 ≥ 80% 才算克服!`,
        25);
    },

    typeText(id, text, speed = 30) {
      const el = document.getElementById(id);
      if (!el) return;
      // 若先前還有 typewriter 在跑,先清掉(避免 view 切換時殘留 setInterval)
      if (this._typeTimer) { clearInterval(this._typeTimer); this._typeTimer = null; }
      el.textContent = '';
      let i = 0;
      this._typeTimer = setInterval(() => {
        // 若 element 已從 DOM 移除(view 切換),停止
        if (!document.body.contains(el)) {
          clearInterval(this._typeTimer); this._typeTimer = null; return;
        }
        if (i >= text.length) { clearInterval(this._typeTimer); this._typeTimer = null; return; }
        el.textContent += text[i++];
      }, speed);
    },

    startBattle() {
      this.renderBattle();
      this.showQuestion();
    },

    // ============================================================
    // 戰鬥畫面骨架
    // ============================================================
    renderBattle() {
      const p = Player.load();
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" id="m5-arena">
          <div class="enemy-bar">
            <div class="avatar boss" id="m5-boss-avatar" style="font-size:2.5rem">${this.state.avatarIcon}</div>
            <div class="bar-info">
              <div class="bar-name">弱點 BOSS:${nodeDisplayName(this.state.boss.nodeId)}</div>
              <div class="hp-track"><div class="hp-fill" id="m5-boss-hp-fill"></div></div>
              <div class="hp-text" id="m5-boss-hp-text"></div>
            </div>
          </div>
          <div class="player-bar">
            <div class="avatar" id="m5-player-avatar">🏹</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${p.level}</span> 弱點獵人</div>
              <div class="hp-track"><div class="hp-fill" id="m5-player-hp-fill"></div></div>
              <div class="hp-text" id="m5-player-hp-text"></div>
            </div>
          </div>
          <div class="skill-tray" id="m5-skill-tray"></div>
          <div id="m5-question"></div>
        </div>
      `;
      this.updateBars();
      this.updateSkillTray();
      show('view-play');
    },

    updateBars() {
      const p = Player.load();
      // BOSS HP 對應到「離 80% 熟練度還差多少」
      const m = Mastery.get(this.state.boss.nodeId);
      const score = Math.min(100, Math.max(0, m.score || 0));
      // BOSS HP = (target - score) / target * 100 (score 達 80 時 BOSS HP = 0)
      const remainingPct = Math.max(0, (MASTERY_DEFEAT_THRESHOLD - score) / MASTERY_DEFEAT_THRESHOLD * 100);
      this.state.bossHp = Math.round(remainingPct);
      const playerPct = p.hp / p.hpMax * 100;

      const bossEl = document.getElementById('m5-boss-hp-fill');
      const playerEl = document.getElementById('m5-player-hp-fill');
      if (bossEl) {
        bossEl.style.width = remainingPct + '%';
        bossEl.className = 'hp-fill' + (remainingPct < 30 ? ' critical' : remainingPct < 60 ? ' low' : '');
      }
      if (playerEl) {
        playerEl.style.width = playerPct + '%';
        playerEl.className = 'hp-fill' + (playerPct < 30 ? ' critical' : playerPct < 60 ? ' low' : '');
      }
      const bt = document.getElementById('m5-boss-hp-text');
      const pt = document.getElementById('m5-player-hp-text');
      if (bt) bt.textContent = `熟練度 ${score}% / ${MASTERY_DEFEAT_THRESHOLD}%(BOSS HP ${Math.round(remainingPct)}%)`;
      if (pt) pt.textContent = `HP ${p.hp}/${p.hpMax} · MP ${p.mp}/${p.mpMax}`;
    },

    updateSkillTray() {
      const tray = document.getElementById('m5-skill-tray');
      if (!tray) return;
      const p = Player.load();
      const buttons = [
        `<button class="skill-btn" onclick="Mode5.skillAnalyze()" ${p.mp < SKILLS.analyze.cost || this.state.analyzeUsed ? 'disabled' : ''}>${SKILLS.analyze.icon} ${SKILLS.analyze.name} <span class="skill-cost">${SKILLS.analyze.cost}MP</span></button>`,
        `<button class="skill-btn" onclick="Mode5.skillReinforce()" ${p.mp < SKILLS.reinforce.cost ? 'disabled' : ''}>${SKILLS.reinforce.icon} ${SKILLS.reinforce.name} <span class="skill-cost">${SKILLS.reinforce.cost}MP</span></button>`,
        `<button class="skill-btn" onclick="Mode5.skillDrill()">${SKILLS.drill.icon} ${SKILLS.drill.name}</button>`
      ];
      tray.innerHTML = buttons.join('');
    },

    // ============================================================
    // 問題渲染
    // ============================================================
    showQuestion() {
      const s = this.state;
      // 勝利條件:熟練度 ≥ 80%
      const m = Mastery.get(s.boss.nodeId);
      if ((m.score || 0) >= MASTERY_DEFEAT_THRESHOLD) {
        return this.victory();
      }
      // 題庫耗盡 → 用 generateVariation 補
      if (s.idx >= s.questions.length) {
        // 動態補變化型(嚴守鐵律 #5,只用 generateVariation)
        const last = s.questions[s.questions.length - 1];
        if (last) {
          const seenIds = new Set(s.questions.map(q => q.id));
          const more = (generateVariation(last, 3) || []).filter(q => !seenIds.has(q.id));
          if (more.length) {
            s.questions = s.questions.concat(more);
          } else {
            // 都生不出來 → 結束戰鬥(BOSS 還沒倒就視為敗退)
            return this.questionPoolExhausted();
          }
        } else {
          return this.questionPoolExhausted();
        }
      }
      const q = renderQuestion(s.questions[s.idx]);
      s.currentQ = q;

      const codeBlock = q.code_block ? `<pre class="code-syntax">${highlightCode(q.code_block)}</pre>` : '';
      // 引用共用 renderVisualData(若可用)
      const visualData = (typeof renderVisualData === 'function') ? renderVisualData(q) : '';

      document.getElementById('m5-question').innerHTML = `
        <div class="question-card">
          <div class="timer-bar" id="play-timer-bar"><span class="timer-icon">⏱</span><span>剩餘 <span id="play-timer-value">90</span> 秒</span></div>
          <div class="question-meta">
            <span class="badge">第 ${s.idx + 1} 回合</span>
            <span class="badge">${q.knowledge_code}</span>
            <span class="badge">${q.difficulty}</span>
            <span class="badge">${q.format}</span>
            ${q.errata_critical ? '<span class="badge" style="background:var(--danger);color:white">⚠️ 必出</span>' : ''}
          </div>
          <div class="question-stem">${q.stem}</div>
          ${codeBlock}
          ${visualData}
          <div class="options" id="m5-options">
            ${q.options.map(o => `<button class="option-btn" data-key="${o.key}" onclick="Mode5.answer('${o.key}')">
              <span class="option-key">${o.key}.</span>${o.text}</button>`).join('')}
          </div>
          <div id="m5-explanation"></div>
        </div>
      `;
      // R5b:每題 90s 倒數(Mode 5 自渲染不走 PlayEngine.show,需就地啟動 timer)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._startTimer) { PlayEngine._timerDisabled = false; PlayEngine._startTimer(90); }
      this.updateBars();
      this.updateSkillTray();
    },

    answer(key) {
      // R5b:第一行先停 timer(使用者已答題,避免 race 後續被 _onTimeout 重複寫入)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      const s = this.state;
      const q = s.currentQ;
      const opt = q.options.find(o => o.key === key);
      const isCorrect = opt.is_correct;

      // 鎖定按鈕、標示對錯
      document.querySelectorAll('#m5-options .option-btn').forEach(b => {
        b.disabled = true;
        const k = b.dataset.key;
        const od = q.options.find(o => o.key === k);
        if (od && od.is_correct) b.classList.add('correct');
        else if (k === key && !isCorrect) b.classList.add('wrong');
      });

      // 共用層:更新答題進度
      Progress.addAnswer(isCorrect);

      if (isCorrect) {
        this.attack();
      } else {
        // 寫入 Wrongbook(案例 10 補:加 userText/correctText 對照)
        const correctOpt = q.options.find(o => o.is_correct);
        const userOpt = q.options.find(o => o.key === key);
        Wrongbook.add(
          q.id, q.node_id || s.boss.nodeId,
          key, correctOpt ? correctOpt.key : null,
          (userOpt && userOpt.text) || '',
          (correctOpt && correctOpt.text) || ''
        );
        this.takeDamage();
      }

      this.showExplanation(opt, isCorrect);
    },

    // ===== 攻擊(答對)=====
    attack() {
      const s = this.state;
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.correct++;

      // 對 BOSS 造成熟練度傷害(+0.15 = score +15);同時 bump attempts/correct/streak
      adjustMasteryScore(s.boss.nodeId, SCORE_DELTA_CORRECT, { correct: true });

      // 玩家恢復 HP / MP
      const p = Player.load();
      const hpHeal = 6 + Math.min(s.combo, 4);   // 6~10
      const mpHeal = 5 + Math.min(s.combo, 3);   // 5~8
      const beforeHp = p.hp;
      p.hp = Math.min(p.hpMax, p.hp + hpHeal);
      p.mp = Math.min(p.mpMax, p.mp + mpHeal);
      Player.save(p);

      // 視覺特效
      const playerAv = document.getElementById('m5-player-avatar');
      const bossAv = document.getElementById('m5-boss-avatar');
      GameFX.flash('correct');
      GameFX.attackAnim(playerAv);
      const dmgShow = SCORE_DELTA_CORRECT; // 對 BOSS 顯示「-15 弱化」
      setTimeout(() => {
        GameFX.shake(bossAv);
        GameFX.damageNumber(bossAv, dmgShow, { kind: 'player' });
      }, 200);
      if (p.hp > beforeHp) {
        setTimeout(() => GameFX.damageNumber(playerAv, '+' + (p.hp - beforeHp), { kind: 'player' }), 400);
      }
      if (s.combo >= 2) GameFX.combo(s.combo);
      if (s.combo === 5) {
        GameFX.confetti({ count: 100, colors: ['#fbbf24', '#f59e0b', '#ef4444'] });
        showToast('🔥 5 連擊!弱點正在崩解!');
      }

      s.totalDamage += dmgShow;
      this.updateBars();
      this.updateSkillTray();
    },

    // ===== 受擊(答錯)=====
    takeDamage() {
      const s = this.state;
      s.combo = 0;
      s.wrong++;

      // BOSS 反擊 = 玩家 HP 損失;同時該 node mastery -5(計入 attempts、不算 correct、清 streak)
      adjustMasteryScore(s.boss.nodeId, -SCORE_DELTA_WRONG, { correct: false });

      const dmg = 8 + Math.floor(s.bossHpMax * 0.03);
      Player.damage(dmg);

      // 視覺特效
      const playerAv = document.getElementById('m5-player-avatar');
      const bossAv = document.getElementById('m5-boss-avatar');
      GameFX.flash('wrong');
      GameFX.hideCombo();
      GameFX.attackAnim(bossAv);
      setTimeout(() => {
        GameFX.shake(playerAv);
        GameFX.damageNumber(playerAv, dmg, { kind: 'enemy' });
      }, 200);
      this.updateBars();

      const p = Player.load();
      if (p.hp <= 0) {
        setTimeout(() => this.gameOver(), 1500);
      }
    },

    // ============================================================
    // 解釋畫面
    // ============================================================
    showExplanation(opt, isCorrect) {
      const s = this.state;
      const q = s.currentQ;
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
          <div style="color:#cbd5e1;font-weight:600;margin-bottom:2px">${o.key}. ${o.text}</div>
          <div style="color:var(--fg-dim);font-size:0.875rem;line-height:1.6">└ ${findWrongExp(o)}</div>
        </div>
      `).join('');

      const userWrongExp = !isCorrect && opt ? findWrongExp(opt) : '';

      document.getElementById('m5-explanation').innerHTML = `
        <div class="explanation">
          <div class="verdict ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '🎯 正中弱點要害!熟練度 +15' : '🩸 BOSS 反噬!熟練度 -5'}</div>

          <div style="background:rgba(74,222,128,0.12);border-left:4px solid #4ade80;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#4ade80;font-weight:700;font-size:0.95rem;margin-bottom:4px">📚 正確答案</div>
            <div style="font-size:1rem;margin-bottom:6px"><strong>${correctOpt ? correctOpt.key + '. ' + correctOpt.text : '(無)'}</strong></div>
            <div style="color:var(--fg);line-height:1.7">${e.correct || '(此題未提供詳細解釋)'}</div>
          </div>

          ${!isCorrect ? `<div style="background:rgba(248,113,113,0.12);border-left:4px solid #f87171;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#f87171;font-weight:700;font-size:0.95rem;margin-bottom:4px">❌ 你選了 ${opt.key}. ${opt.text}</div>
            <div style="color:var(--fg);line-height:1.7">${userWrongExp}</div>
          </div>` : ''}

          ${otherAnalysis ? `<div style="background:rgba(148,163,184,0.08);border-left:4px solid #94a3b8;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#cbd5e1;font-weight:700;font-size:0.95rem;margin-bottom:6px">🔍 其他選項解析</div>
            ${otherAnalysis}
          </div>` : ''}

          ${e.hook ? `<div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px 0">
            <div style="color:#facc15;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>
            <div style="color:var(--fg);font-style:italic;margin-top:2px">${e.hook}</div>
          </div>` : ''}

          ${q.misconceptions && q.misconceptions.length > 0 ? `<div style="background:rgba(168,85,247,0.10);border-left:4px solid #a855f7;padding:10px 12px;border-radius:6px;margin:10px 0">
            <div style="color:#c084fc;font-weight:700;font-size:0.85rem">⚠️ 常見誤解</div>
            <div style="color:var(--fg);margin-top:2px">${q.misconceptions.map(m => '• ' + m).join('<br>')}</div>
          </div>` : ''}

          <div class="actions" style="margin-top:14px">
            <button class="btn btn-primary" onclick="Mode5.next()">繼續攻擊 →</button>
            ${!isCorrect ? `<button class="btn btn-warn" onclick="Mode5.drillThis()">🎯 立即下鑽變化型</button>` : ''}
            ${ErrorReports.renderButton(q.id)}
          </div>
        </div>
      `;
    },

    // ============================================================
    // 招式
    // ============================================================
    skillAnalyze() {
      const p = Player.load();
      if (p.mp < SKILLS.analyze.cost) return showToast('MP 不足');
      const q = this.state.currentQ;
      if (!q) return showToast('無當前題目');
      p.mp -= SKILLS.analyze.cost;
      Player.save(p);
      this.state.analyzeUsed = true;
      // 高亮 BOSS 弱點:消除 2 個錯誤選項
      const wrongs = q.options.filter(o => !o.is_correct);
      const elim = RNG.pickN(wrongs, Math.min(2, wrongs.length));
      elim.forEach(e => {
        const btn = document.querySelector(`#m5-options [data-key="${e.key}"]`);
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.3';
          btn.style.textDecoration = 'line-through';
        }
      });
      showToast('🔍 弱點分析啟動 — 已消除 2 個錯誤選項');
      this.updateBars();
      this.updateSkillTray();
    },

    skillReinforce() {
      const p = Player.load();
      if (p.mp < SKILLS.reinforce.cost) return showToast('MP 不足');
      p.mp -= SKILLS.reinforce.cost;
      Player.save(p);
      // 強化記憶不算入 attempts(避免被視為練習一次),只 +score 不影響 streak/correct 比率
      adjustMasteryScore(this.state.boss.nodeId, SCORE_DELTA_REINFORCE, { attempts: false });
      const bossAv = document.getElementById('m5-boss-avatar');
      if (bossAv) GameFX.damageNumber(bossAv, SCORE_DELTA_REINFORCE, { kind: 'player' });
      showToast(`🧠 強化記憶!該節點熟練度 +${SCORE_DELTA_REINFORCE}`);
      this.updateBars();
      this.updateSkillTray();

      // 若直接打到 80%,進入勝利
      const m = Mastery.get(this.state.boss.nodeId);
      if ((m.score || 0) >= MASTERY_DEFEAT_THRESHOLD) {
        setTimeout(() => this.victory(), 800);
      }
    },

    skillDrill() {
      // 直接以當前題進入下鑽
      const q = this.state.currentQ || this.state.questions[this.state.idx];
      if (!q) return showToast('無題可下鑽');
      const variations = generateVariation(q, 3);
      if (!variations || variations.length === 0) {
        return showToast('⚠️ 此節點變化型不足');
      }
      DrillSession.start(q.node_id || this.state.boss.nodeId, variations, q, () => {
        // DrillSession 完成 → drillBonus 已自動 +20 → 重建戰鬥
        this.renderBattle();
        // 若已過門檻,直接勝利
        const m = Mastery.get(this.state.boss.nodeId);
        if ((m.score || 0) >= MASTERY_DEFEAT_THRESHOLD) {
          this.victory();
        } else {
          this.showQuestion();
        }
      });
    },

    drillThis() {
      // 在「答錯後」按下:對該題下鑽變化型
      const q = this.state.currentQ;
      const variations = generateVariation(q, 3);
      if (!variations || variations.length === 0) {
        return showToast('⚠️ 此節點變化型不足,繼續戰鬥', 2500);
      }
      DrillSession.start(q.node_id || this.state.boss.nodeId, variations, q, () => {
        this.renderBattle();
        // 下鑽完跳下一回合
        this.next();
      });
    },

    next() {
      const s = this.state;
      // 先檢查熟練度是否已達目標
      const m = Mastery.get(s.boss.nodeId);
      if ((m.score || 0) >= MASTERY_DEFEAT_THRESHOLD) {
        return this.victory();
      }
      s.idx++;
      this.showQuestion();
    },

    // ============================================================
    // 結局
    // ============================================================
    victory() {
      const s = this.state;
      // 移除 / 標記該 node 已克服:把 Wrongbook 中所有屬於該 nodeId 的題目標記 mastered
      const wb = Wrongbook.load();
      wb.forEach(x => { if (x.nodeId === s.boss.nodeId) x.mastered = true; });
      Wrongbook.save(wb);

      // 紀錄已擊敗
      const prog = this.loadProg();
      if (!prog.defeated.includes(s.boss.nodeId)) prog.defeated.push(s.boss.nodeId);
      this.saveProg(prog);

      // 擊敗後讓下次回到地圖時重新偵測弱點(BOSS 名單應更新)
      this.cachedBosses = null;

      // EXP 獎勵
      const baseExp = 50 + s.correct * 12;
      const perfectBonus = s.wrong === 0 ? 40 : 0;
      const comboBonus = s.maxCombo * 5;
      const totalExp = baseExp + perfectBonus + comboBonus;
      Player.gainExp(totalExp);

      // 弱點克服報告
      const endMastery = Mastery.get(s.boss.nodeId).score || 0;
      const masteryDelta = Math.round(endMastery - s.startMastery);

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#fbbf24;font-size:2rem">🏆 弱點已克服!</h1>
          <div style="font-size:4rem;margin:16px 0">${s.avatarIcon} ➜ ✨</div>
          <div class="dialogue-box">
            <div class="dialogue-name">🎯 弱點獵人系統</div>
            <div class="dialogue-text">「節點『${nodeDisplayName(s.boss.nodeId)}』已從你的弱點清單移除。下一個目標!」</div>
          </div>

          <div style="background:rgba(0,0,0,0.5);padding:16px;border-radius:var(--radius);margin:16px 0;text-align:left">
            <h3 style="color:#fbbf24;margin-top:0">📋 弱點克服報告</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
              <div>✅ 答對 <strong style="color:#4ade80">${s.correct}</strong></div>
              <div>❌ 答錯 <strong style="color:#f87171">${s.wrong}</strong></div>
              <div>🔥 最高連擊 <strong>${s.maxCombo}</strong></div>
              <div>⚔️ 累計傷害 <strong>${s.totalDamage}</strong></div>
            </div>
            <hr style="margin:12px 0;border-color:var(--border)">
            <div style="font-size:1rem;color:var(--fg)">節點熟練度提升:
              <span style="color:#facc15">${Math.round(s.startMastery)}%</span>
              ➜
              <span style="color:#4ade80;font-weight:800">${Math.round(endMastery)}%</span>
              <span style="color:#fbbf24;margin-left:6px">(+${masteryDelta})</span>
            </div>
            <div style="font-size:1.3rem;color:#fbbf24;font-weight:800;text-align:center;margin-top:8px">+${totalExp} EXP</div>
            <div style="font-size:0.85rem;color:var(--fg-dim);text-align:center;margin-top:4px">
              基礎 ${baseExp} ${perfectBonus ? '+ 完美 ' + perfectBonus : ''} ${comboBonus ? '+ 連擊 ' + comboBonus : ''}
            </div>
            ${s.wrong === 0 ? '<div style="text-align:center;margin-top:8px;color:#4ade80;font-weight:700">⭐ 完美克服</div>' : ''}
          </div>

          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode5.renderMap()">🗺️ 回弱點地圖</button>
            <button class="btn btn-warn" onclick="Mode5.reDrill()">🎯 再下鑽該節點</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
          </div>
        </div>
      `;
      GameFX.bigConfetti();
      refreshHome();
    },

    // 鐵律 #1 延伸:擊敗 BOSS 後仍可「再下鑽」
    reDrill() {
      const s = this.state;
      const sample = QUESTIONS.find(q => q.node_id === s.boss.nodeId);
      if (!sample) return showToast('該節點題庫不足');
      const variations = generateVariation(sample, 3);
      if (!variations || variations.length === 0) return showToast('變化型不足');
      DrillSession.start(s.boss.nodeId, variations, sample, () => {
        this.renderMap();
      });
    },

    gameOver() {
      // 2026-05-16: 動態 hpMax/2,對齊「恢復一半 HP」文案
      const _heal5 = Player.load(); Player.heal(Math.floor(_heal5.hpMax / 2));
      const s = this.state;
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#f87171;font-size:2rem">💀 你倒下了</h1>
          <div style="font-size:4rem;margin:16px 0">😵</div>
          <div class="dialogue-box">
            <div class="dialogue-name">🎯 弱點獵人系統</div>
            <div class="dialogue-text">「弱點還沒被克服,但你撐不下去了。休息一下,你恢復了一半 HP。」</div>
          </div>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode5.engageBoss(${s.bossIdx})">⚔️ 再戰</button>
            <button class="btn btn-ghost" onclick="Mode5.renderMap()">🗺️ 回地圖</button>
          </div>
        </div>
      `;
    },

    questionPoolExhausted() {
      const s = this.state;
      const view = document.getElementById('view-play');
      const m = Mastery.get(s.boss.nodeId);
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:var(--warn)">⚠️ 題庫耗盡</h1>
          <p>該節點題庫題目已全部出完,且無法再生成有效變化型。</p>
          <p>當前熟練度:<strong>${Math.round(m.score || 0)}%</strong> / ${MASTERY_DEFEAT_THRESHOLD}%</p>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode5.renderMap()">🗺️ 回地圖</button>
          </div>
        </div>
      `;
    }
  };

  window.Mode5 = Mode5;
})();
