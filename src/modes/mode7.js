// ============================================================
// Mode 7: 考古題模考劇場 (Theater) — 30 分鐘倒數模考
// 對標 2026-05-23 真考臨場壓力訓練
// 5 NPC 輪流出場 + 倒數計時 + Pace Heatmap 結算
//
// 鐵律合規:
//   #1 下鑽:Theater 中不可下鑽(模擬真考),結算頁 Top 5 錯題後可進 DrillSession
//   #2 動態:每場 RNG.set(Date.now()) 隨機抽題 + 選項洗牌(PlayEngine 自動)
//   #5 來源忠實:只從 QUESTIONS 全集篩,絕不造題;不引入超綱主題
//
// 共用層 API:
//   Storage / RNG / Player / Mastery / Wrongbook / GameFX
//   PlayEngine.show (自動觸發 Mastery.update + Wrongbook.add via .answer)
//   DrillSession.start (僅結算後使用)
//   showToast / show / goHome / refreshHome
// ============================================================
(function () {
  'use strict';

  const STORAGE_KEY = 'ipas_mode7_theater_v1';
  const STORAGE_VERSION = '1.0';

  // === 模考時長配置(對標 IPAS 中級真考:60 分 50 題)===
  // 25 題 30 分鐘(72s/題)/ 30 題 40 分鐘(80s/題)/ 50 題 60 分鐘(72s/題)
  const QCOUNT_OPTIONS = [
    { qcount: 25, minutes: 30, label: '🥉 衝刺 25 題 / 30 分鐘',
      desc: '快節奏體驗,適合臨睡前一場(72s/題)' },
    { qcount: 30, minutes: 40, label: '🥈 標準 30 題 / 40 分鐘',
      desc: '平衡時長與壓力(80s/題)' },
    { qcount: 50, minutes: 60, label: '🥇 全餐 50 題 / 60 分鐘',
      desc: '完整模擬真考時長(72s/題,對標 IPAS 中級單科)' }
  ];

  const SCOPE_OPTIONS = [
    { key: 'all',  label: '🌐 全範圍混合', desc: '科一 + 科三 + 邊界,依現況比例(50:50:0)' },
    { key: 's1',   label: '📚 科一 only',  desc: '人工智慧技術應用與規劃(L21*)' },
    { key: 's3',   label: '🔧 科三 only',  desc: '機器學習技術與應用(L23*)' },
    { key: 'weak', label: '🎯 弱點優先',    desc: '從錯題本 + 熟練度低的節點抽題' }
  ];

  const DIFFICULTY_OPTIONS = [
    { key: 'mixed',  label: '⚖️ 全難度混合', desc: 'easy / medium / hard 依題庫比例' },
    { key: 'hard',   label: '🔥 進階為主',   desc: 'hard 為主、medium 次之(挑戰真考)' }
  ];

  // === 5 NPC 配置(每答 ceil(qcount/5) 題切換一位)===
  // 匹配規則:依 question.format / knowledge_code / tags 派發給最契合 NPC
  const NPCS = [
    {
      key: 'engineer',
      name: '👨‍💻 工程師 阿凱',
      avatar: '👨‍💻',
      role: '程式判讀題',
      intro: '「凡人,看好我的程式碼。一個 axis 寫錯,模型就崩給你看。」',
      onCorrect: ['「漂亮!shape 你看得真準。」', '「就是這個 API 慣例!」', '「fit_transform 跟 transform 你分得清楚。」'],
      onWrong: ['「形狀對不上吧?」', '「再仔細看一次 numpy 廣播規則。」', '「sklearn fit/predict 順序很重要哦。」'],
      // 偏好:format=code_reading 或 knowledge_code=L23202(sklearn)/L23102(numpy)
      match: (q) => q.format === 'code_reading' ||
                   ['L23202', 'L23102', 'L23302'].includes(q.knowledge_code)
    },
    {
      key: 'scientist',
      name: '👩‍🔬 數據科學家 莉雅',
      avatar: '👩‍🔬',
      role: '計算 / 統計題',
      intro: '「下一題我來。算式不會做出記憶來,只能逼你動手。」',
      onCorrect: ['「準確!分母分子搞對了。」', '「公式背得熟。」', '「很好,Recall 跟 Precision 你不會搞混。」'],
      onWrong: ['「分母擺錯了喔。」', '「F1 是調和平均,不是算術平均。」', '「再驗算一次。」'],
      // 偏好:format=calculation 或 table_reading 或 sequence
      match: (q) => ['calculation', 'table_reading', 'sequence'].includes(q.format) ||
                   ['L23303', 'L23304', 'L23301'].includes(q.knowledge_code)
    },
    {
      key: 'transformer',
      name: '🤖 Trans 哥',
      avatar: '🤖',
      role: 'NLP / DL 進階題',
      intro: '「Transformer 之子上場。BERT、GPT、注意力機制,挑一個讓你頭痛。」',
      onCorrect: ['「Attention 你掌握了。」', '「Self-attention 跟 cross-attention 分得真清。」', '「序列模型的細節你都看穿了。」'],
      onWrong: ['「位置編碼很重要喔。」', '「Encoder 跟 Decoder 結構別搞混了。」', '「梯度別讓他爆。」'],
      // 偏好:knowledge_code=L21101(NLP)/ L21103(GenAI)/ L21102(CV) 且 difficulty=hard
      match: (q) => ['L21101', 'L21103', 'L21102', 'L21104'].includes(q.knowledge_code)
    },
    {
      key: 'ethics',
      name: '⚖️ 倫理委員 方爺',
      avatar: '⚖️',
      role: '風險 / 治理題',
      intro: '「年輕人,模型再準也得守法度。這題是給你心中那把尺照的。」',
      onCorrect: ['「治理思維清楚。」', '「PDPA 條文記得真熟。」', '「公平性跟可解釋性你都顧到了。」'],
      onWrong: ['「合規不是裝飾,是底線。」', '「個資保護不只是加密。」', '「Bias 不會自己消失,要主動處理。」'],
      // 偏好:knowledge_code=L21203(風險)/L23401(治理)/L23402(評估治理)
      match: (q) => ['L21203', 'L23401', 'L23402', 'L21204'].includes(q.knowledge_code)
    },
    {
      key: 'consultant',
      name: '💼 顧問 林姊',
      avatar: '💼',
      role: '規劃 / 情境題',
      intro: '「客戶等著你的方案。這題不是技術細節,是商業判斷。」',
      onCorrect: ['「決策邏輯漂亮。」', '「ROI 角度抓對了。」', '「導入順序正確,客戶會買單。」'],
      onWrong: ['「先看商業目標,再選技術。」', '「不平衡資料不是只用 SMOTE 就完事。」', '「優先順序你得排一排。」'],
      // 偏好:knowledge_code=L21201(商業)/L21202(規劃)/scenario / single_choice 但難度高
      match: (q) => ['L21201', 'L21202', 'L21301', 'L21302'].includes(q.knowledge_code)
    }
  ];

  // === Mode7 主物件 ===
  const Mode7 = {
    state: null,
    timer: null,
    // 共用層 API 備份(覆寫 PlayEngine 後恢復用)
    _origAnswer: null,
    _origShowExplanation: null,
    _origOnNext: null,

    // ===== 入口 =====
    start() {
      // 進場前先清理上一場殘留(若有)
      this.cleanup();
      RNG.set(Date.now());
      this.renderSetup();
    },

    // ===== Step 1:設定畫面 =====
    renderSetup() {
      const view = document.getElementById('view-play');
      const lastConfig = this._getLastConfig();
      view.innerHTML = `
        <div class="card">
          <h1 style="color:#f87171;font-size:1.6rem">🎭 考古題模考劇場</h1>
          <p style="color:var(--fg-dim);line-height:1.7">
            模擬 2026-05-23 真實考試:倒數計時、不可暫停、5 NPC 輪流出場。<br>
            時間到自動交卷;交卷後可看 Pace Heatmap、錯題清單,並選擇進下鑽。
          </p>
          <div style="background:rgba(248,113,113,0.10);border-left:4px solid #f87171;padding:12px;border-radius:6px;margin-top:12px">
            <strong style="color:#f87171">⚠️ 重要規則</strong><br>
            <span style="color:var(--fg-dim);font-size:0.9rem">
              • 答題後不顯示解析(模擬真考)<br>
              • 計時器啟動後不可暫停<br>
              • 投降按鈕會扣 HP 10 點<br>
              • 結算後可選 Top 5 錯題進 DrillSession 下鑽
            </span>
          </div>
        </div>

        <div class="card">
          <h2>📋 模考設定</h2>

          <h3 style="margin-top:16px">📊 題數 / 時長</h3>
          <div id="m7-qcount-grid" class="m7-opt-grid"></div>

          <h3 style="margin-top:16px">📚 主題範圍</h3>
          <div id="m7-scope-grid" class="m7-opt-grid"></div>

          <h3 style="margin-top:16px">🔥 難度</h3>
          <div id="m7-diff-grid" class="m7-opt-grid"></div>

          <div class="actions" style="margin-top:20px;justify-content:center">
            <button class="btn btn-primary" id="m7-start-btn" style="font-size:1.05rem;padding:14px 28px">🎬 開始模考</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 取消</button>
          </div>

          <div id="m7-pool-stats" style="margin-top:14px;font-size:0.85rem;color:var(--fg-dim);text-align:center"></div>
        </div>

        ${this._renderHistory()}

        <style>
          .m7-opt-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; }
          .m7-opt-card { padding:12px; background:var(--bg-3); border:2px solid var(--border);
            border-radius:var(--radius-sm); cursor:pointer; transition:all 0.2s; text-align:left; }
          .m7-opt-card:hover { border-color:var(--primary); }
          .m7-opt-card.selected { border-color:var(--warn); background:rgba(250,204,21,0.10);
            box-shadow:0 0 12px rgba(250,204,21,0.3); }
          .m7-opt-card .m7-opt-label { font-weight:700; font-size:0.95rem; color:var(--fg); }
          .m7-opt-card .m7-opt-desc { font-size:0.78rem; color:var(--fg-dim); margin-top:4px; line-height:1.5; }
        </style>
      `;
      // 預設選項(從上次或預設)
      this._setupConfig = {
        qcount:    (lastConfig && lastConfig.qcount) || 30,
        scope:     (lastConfig && lastConfig.scope)  || 'all',
        difficulty:(lastConfig && lastConfig.difficulty) || 'mixed'
      };
      this._renderSetupOptions();
      const startBtn = document.getElementById('m7-start-btn');
      if (startBtn) startBtn.addEventListener('click', () => this._startBattle());
      show('view-play');
    },

    _renderSetupOptions() {
      const cfg = this._setupConfig;
      const qg = document.getElementById('m7-qcount-grid');
      const sg = document.getElementById('m7-scope-grid');
      const dg = document.getElementById('m7-diff-grid');
      if (qg) qg.innerHTML = QCOUNT_OPTIONS.map(o => `
        <button class="m7-opt-card ${cfg.qcount === o.qcount ? 'selected' : ''}" data-qcount="${o.qcount}">
          <div class="m7-opt-label">${o.label}</div>
          <div class="m7-opt-desc">${o.desc}</div>
        </button>`).join('');
      if (sg) sg.innerHTML = SCOPE_OPTIONS.map(o => `
        <button class="m7-opt-card ${cfg.scope === o.key ? 'selected' : ''}" data-scope="${o.key}">
          <div class="m7-opt-label">${o.label}</div>
          <div class="m7-opt-desc">${o.desc}</div>
        </button>`).join('');
      if (dg) dg.innerHTML = DIFFICULTY_OPTIONS.map(o => `
        <button class="m7-opt-card ${cfg.difficulty === o.key ? 'selected' : ''}" data-diff="${o.key}">
          <div class="m7-opt-label">${o.label}</div>
          <div class="m7-opt-desc">${o.desc}</div>
        </button>`).join('');

      // 綁定事件(委派)
      [qg, sg, dg].forEach(g => {
        if (!g) return;
        g.querySelectorAll('.m7-opt-card').forEach(btn => {
          btn.addEventListener('click', () => {
            if (btn.dataset.qcount) cfg.qcount = parseInt(btn.dataset.qcount, 10);
            if (btn.dataset.scope)  cfg.scope = btn.dataset.scope;
            if (btn.dataset.diff)   cfg.difficulty = btn.dataset.diff;
            this._renderSetupOptions();
          });
        });
      });

      // 顯示池統計(讓使用者看抽題候選夠不夠)
      this._updatePoolStats();
    },

    _updatePoolStats() {
      const cfg = this._setupConfig;
      const pool = this._buildPool(cfg);
      const el = document.getElementById('m7-pool-stats');
      if (!el) return;
      if (pool.length < cfg.qcount) {
        el.innerHTML = `<span style="color:var(--warn)">⚠️ 候選池僅 ${pool.length} 題,將自動取所有可用題</span>`;
      } else {
        const s1 = pool.filter(q => q.subject === 1).length;
        const s3 = pool.filter(q => q.subject === 3).length;
        el.innerHTML = `候選池 ${pool.length} 題(科一 ${s1} / 科三 ${s3})— 將抽 ${cfg.qcount} 題`;
      }
    },

    _renderHistory() {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !data.history || data.history.length === 0) return '';
      const recent = data.history.slice(-5).reverse();
      const rows = recent.map(h => {
        const date = new Date(h.ts);
        const ds = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
        const r = h.result || {};
        const pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
        const lvlColor = r.estLevel === '高' ? '#4ade80' : r.estLevel === '中' ? '#facc15' : '#f87171';
        return `<tr>
          <td style="padding:6px 8px">${ds}</td>
          <td style="padding:6px 8px">${(h.config && h.config.qcount) || '?'} 題</td>
          <td style="padding:6px 8px"><strong>${r.correct || 0}/${r.total || 0}</strong> (${pct}%)</td>
          <td style="padding:6px 8px;color:${lvlColor};font-weight:700">${r.estLevel || '-'}</td>
        </tr>`;
      }).join('');
      return `<div class="card">
        <h3>📜 最近模考紀錄(最多 5 場)</h3>
        <table style="width:100%;font-size:0.85rem;border-collapse:collapse">
          <thead><tr style="background:var(--bg-3);color:var(--fg-dim)">
            <th style="padding:6px 8px;text-align:left">日期</th>
            <th style="padding:6px 8px;text-align:left">題數</th>
            <th style="padding:6px 8px;text-align:left">得分</th>
            <th style="padding:6px 8px;text-align:left">等級</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    },

    _getLastConfig() {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !data.history || data.history.length === 0) return null;
      return data.history[data.history.length - 1].config || null;
    },

    // ===== 抽題池 =====
    _buildPool(cfg) {
      const all = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).filter(q => q && q.id && q.options);
      let pool = all;

      // 主題範圍
      if (cfg.scope === 's1') {
        pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L21'));
      } else if (cfg.scope === 's3') {
        pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L23'));
      } else if (cfg.scope === 'weak') {
        // 弱點:Wrongbook 內 nodeId + Mastery 低分節點
        const wbNodes = new Set(Wrongbook.load()
          .filter(x => !x.mastered && x.nodeId)
          .map(x => x.nodeId));
        const m = Mastery.load();
        const weakNodes = new Set(Object.keys(m)
          .filter(id => m[id] && m[id].attempts > 0 && m[id].score < 60));
        const wantNodes = new Set([...wbNodes, ...weakNodes]);
        // 優先弱節點題;若不足,fallback 全範圍
        const weakPool = pool.filter(q => q.node_id && wantNodes.has(q.node_id));
        if (weakPool.length >= cfg.qcount) {
          pool = weakPool;
        } else {
          // 弱點題不夠,補科一+科三全範圍但弱題優先
          const weakIds = new Set(weakPool.map(q => q.id));
          const rest = pool.filter(q => !weakIds.has(q.id));
          pool = [...weakPool, ...rest];
        }
      }
      // 'all' 不額外篩選

      // 難度篩選
      if (cfg.difficulty === 'hard') {
        const hardPool = pool.filter(q => q.difficulty === 'hard');
        const medPool  = pool.filter(q => q.difficulty === 'medium');
        // 進階為主:hard 全收 + 部分 medium 補滿(補到題數 1.5 倍候選池)
        const want = Math.max(cfg.qcount, hardPool.length);
        if (hardPool.length >= cfg.qcount) {
          pool = hardPool;
        } else {
          pool = [...hardPool, ...RNG.shuffle(medPool).slice(0, want - hardPool.length)];
        }
      }
      // 'mixed' 不額外篩選

      return pool;
    },

    // 抽 qcount 題並依 5 NPC 派發
    _drawQuestions(cfg) {
      const pool = this._buildPool(cfg);
      const want = Math.min(cfg.qcount, pool.length);
      const picked = RNG.pickN(pool, want);
      // 依 NPC 匹配規則分組
      const buckets = NPCS.map(npc => ({ npc, qs: [] }));
      const unmatched = [];
      for (const q of picked) {
        let placed = false;
        for (const b of buckets) {
          if (b.npc.match(q)) { b.qs.push(q); placed = true; break; }
        }
        if (!placed) unmatched.push(q);
      }
      // 平均分配剩餘到「題數最少」的 bucket(避免偏科)
      for (const q of unmatched) {
        let minB = buckets[0];
        for (const b of buckets) {
          if (b.qs.length < minB.qs.length) minB = b;
        }
        minB.qs.push(q);
      }
      // 重排成輪流出場順序:每答 ceil(want/5) 題切換一位
      // 先讓每位 NPC 至少出 1 題(若 bucket 空,從最多者偷 1 題)
      const segSize = Math.ceil(want / 5);
      // Round-robin 切片重組
      const ordered = [];
      // 每位 NPC 出 min(segSize, bucket.qs.length) 題
      // 若不足,從其他 bucket 補
      const slots = NPCS.map((npc, i) => ({ npc, target: 0 }));
      let remain = want;
      for (let i = 0; i < 5; i++) {
        const t = Math.min(segSize, remain);
        slots[i].target = t;
        remain -= t;
      }
      // 從 buckets 拉題填 slots(優先匹配 NPC,不足從別的 bucket 借)
      for (let i = 0; i < 5; i++) {
        const slot = slots[i];
        const ownBucket = buckets[i];
        const filled = [];
        // 從自己 bucket 拿
        while (filled.length < slot.target && ownBucket.qs.length > 0) {
          filled.push(ownBucket.qs.shift());
        }
        // 不夠時從其他 bucket 拿(從最多者拿)
        while (filled.length < slot.target) {
          let donor = null;
          for (const b of buckets) {
            if (b.qs.length > 0 && (!donor || b.qs.length > donor.qs.length)) donor = b;
          }
          if (!donor) break; // 全空
          filled.push(donor.qs.shift());
        }
        // 標記每題的 NPC
        for (const q of filled) {
          ordered.push({ q, npcIdx: i });
        }
      }
      // 殘留(理論不該有,保險)
      buckets.forEach((b, i) => {
        for (const q of b.qs) ordered.push({ q, npcIdx: i });
      });
      // 確認長度等於 want(若 pool 不足會更少)
      return ordered.slice(0, want);
    },

    // ===== Step 2:啟動戰鬥 =====
    _startBattle() {
      const cfg = { ...this._setupConfig };
      const cfgOpt = QCOUNT_OPTIONS.find(o => o.qcount === cfg.qcount) || QCOUNT_OPTIONS[1];
      const totalSeconds = cfgOpt.minutes * 60;

      const lineup = this._drawQuestions(cfg);
      if (lineup.length === 0) {
        showToast('⚠️ 題庫候選池為空,無法開場。請更換主題或難度', 3500);
        return;
      }
      if (lineup.length < cfg.qcount) {
        showToast(`⚠️ 候選池僅 ${lineup.length} 題,本場以 ${lineup.length} 題開戰`, 3000);
      }

      this.state = {
        config: cfg,
        lineup,                     // [{q, npcIdx}, ...]
        idx: 0,
        total: lineup.length,
        correct: 0,
        wrongs: [],                 // {qid, nodeId, q, userKey, correctKey, npcIdx, timeUsed}
        perQuestionTime: [],        // ms per question
        questionStartTs: 0,
        startedAt: Date.now(),
        totalSeconds,
        remainSeconds: totalSeconds,
        finished: false,
        outcomeRendered: false,
        currentNpcIdx: -1
      };

      // 進入第一題
      this._installPlayEngineHook();
      this._showCurrentQuestion();
      this._startTimer();
    },

    // ===== 計時器 =====
    _startTimer() {
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (!this.state || this.state.finished) return;
        this.state.remainSeconds--;
        this._updateTimerHud();
        if (this.state.remainSeconds <= 0) {
          this._timeUp();
        }
      }, 1000);
    },

    _stopTimer() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    },

    _updateTimerHud() {
      const el = document.getElementById('m7-timer');
      if (!el) return;
      const sec = this.state.remainSeconds;
      const mm = Math.floor(sec / 60);
      const ss = sec % 60;
      const txt = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
      // 危險時段(< 5 分鐘)紅色閃爍
      const danger = sec < 300;
      el.innerHTML = `${danger ? '🚨' : '⏰'} ${txt}`;
      el.style.color = danger ? '#f87171' : '#facc15';
      el.style.fontWeight = '900';
      el.style.fontSize = danger ? '1.8rem' : '1.6rem';
      el.style.textShadow = danger ? '0 0 12px rgba(248,113,113,0.7)' : '0 0 8px rgba(250,204,21,0.5)';
      if (danger && !el.classList.contains('m7-blink')) el.classList.add('m7-blink');
      if (!danger && el.classList.contains('m7-blink')) el.classList.remove('m7-blink');

      // 進度條
      const bar = document.getElementById('m7-time-bar');
      if (bar) {
        const pct = (sec / this.state.totalSeconds) * 100;
        bar.style.width = pct + '%';
        bar.style.background = sec < 300
          ? 'linear-gradient(90deg,#ef4444,#dc2626)'
          : sec < 600
            ? 'linear-gradient(90deg,#facc15,#f59e0b)'
            : 'linear-gradient(90deg,#38bdf8,#a855f7)';
      }

      // 每題建議用時
      const sug = document.getElementById('m7-sug-time');
      if (sug) {
        const remainQ = Math.max(1, this.state.total - this.state.idx);
        const perQ = Math.max(1, Math.floor(sec / remainQ));
        sug.textContent = `每題建議用時 ${perQ}s(剩 ${remainQ} 題)`;
      }
    },

    _timeUp() {
      this._stopTimer();
      // 自動把目前題的剩餘記錄為「未答」(扣未答題)
      // 已渲染未答的題視為「答錯」(更接近真考)
      this._finalize('time_up');
    },

    // ===== 顯示當前題目(用 PlayEngine.show + 包裹 NPC 框)=====
    _showCurrentQuestion() {
      if (!this.state) return;
      const item = this.state.lineup[this.state.idx];
      if (!item) { this._finalize('all_done'); return; }
      const { q, npcIdx } = item;
      const npc = NPCS[npcIdx] || NPCS[0];

      // NPC 切換動畫(從上一題不同 NPC 切換時)
      const prevNpc = this.state.currentNpcIdx;
      const isNpcSwitch = prevNpc !== npcIdx;
      this.state.currentNpcIdx = npcIdx;

      // 上下文 HTML(NPC 對話框 + 倒數計時 + 進度條)
      const ctx = `
        <div class="m7-arena">
          <div class="m7-header">
            <div class="m7-progress-info">
              <div class="m7-progress-text">第 ${this.state.idx + 1} / ${this.state.total} 題 · 已答對 ${this.state.correct}</div>
              <div class="hp-track" style="height:8px;background:rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;margin-top:4px">
                <div class="hp-fill" id="m7-progress-bar" style="width:${(this.state.idx / this.state.total) * 100}%;
                  background:linear-gradient(90deg,#38bdf8,#a855f7);height:100%;transition:width 0.4s"></div>
              </div>
            </div>
            <div class="m7-timer-block">
              <div id="m7-timer" style="color:#facc15;font-weight:900;font-size:1.6rem">⏰ --:--</div>
              <div id="m7-sug-time" style="font-size:0.75rem;color:var(--fg-dim)"></div>
              <div class="hp-track" style="height:6px;background:rgba(0,0,0,0.4);border-radius:3px;overflow:hidden;margin-top:4px">
                <div id="m7-time-bar" style="width:100%;height:100%;background:linear-gradient(90deg,#38bdf8,#a855f7);transition:width 0.4s"></div>
              </div>
            </div>
          </div>

          <div class="m7-npc-row">
            <div class="m7-npc-avatar ${isNpcSwitch ? 'switch-anim' : ''}">${npc.avatar}</div>
            <div class="m7-npc-dialog">
              <div class="m7-npc-name">${npc.name}</div>
              <div class="m7-npc-line">${isNpcSwitch ? npc.intro : `「(${npc.role})這題我出。」`}</div>
            </div>
          </div>

          <div class="actions" style="margin-top:8px;justify-content:center">
            <button class="btn btn-ghost" onclick="Mode7.surrender()" style="font-size:0.85rem">🏳️ 投降(扣 HP 10)</button>
          </div>
        </div>

        <style>
          .m7-arena { background:linear-gradient(135deg,#1e1b4b,#7f1d1d 80%); border-radius:var(--radius);
            padding:14px; margin-bottom:14px; box-shadow:0 0 30px rgba(248,113,113,0.3); }
          .m7-header { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:12px; }
          .m7-progress-info { flex:1; min-width:200px; }
          .m7-progress-text { font-size:0.9rem; color:#fef3c7; font-weight:700; }
          .m7-timer-block { text-align:right; min-width:140px; }
          .m7-blink { animation: m7-pulse 1s infinite; }
          @keyframes m7-pulse { 0%,100% { opacity:1; } 50% { opacity:0.55; } }

          .m7-npc-row { display:flex; gap:12px; align-items:flex-start; padding:10px;
            background:rgba(0,0,0,0.35); border-radius:var(--radius-sm); border:1px solid rgba(250,204,21,0.3); }
          .m7-npc-avatar { width:54px; height:54px; border-radius:50%;
            background:linear-gradient(135deg,#312e81,#1e1b4b); display:flex; align-items:center; justify-content:center;
            font-size:2rem; flex-shrink:0; box-shadow:0 0 16px rgba(168,85,247,0.4); }
          .m7-npc-avatar.switch-anim { animation: m7-bounce 0.6s; }
          @keyframes m7-bounce {
            0% { transform:scale(0.5) rotate(-20deg); opacity:0; }
            50% { transform:scale(1.15) rotate(8deg); opacity:1; }
            100% { transform:scale(1) rotate(0); opacity:1; }
          }
          .m7-npc-dialog { flex:1; }
          .m7-npc-name { color:#facc15; font-weight:700; font-size:0.95rem; margin-bottom:4px; }
          .m7-npc-line { color:#e2e8f0; font-style:italic; line-height:1.6; }
        </style>
      `;

      this.state.questionStartTs = Date.now();
      // 用 PlayEngine.show 渲染題目;之後我們的 hook 會覆寫 answer
      PlayEngine.show(q, { contextHTML: ctx });
      this._updateTimerHud();
    },

    // ===== Hook PlayEngine,讓 Theater 模式不顯示 explanation =====
    _installPlayEngineHook() {
      if (this._origAnswer) return; // 已 hook
      this._origAnswer = PlayEngine.answer.bind(PlayEngine);
      this._origShowExplanation = PlayEngine.showExplanation.bind(PlayEngine);
      this._origOnNext = PlayEngine.onNext;

      const self = this;
      PlayEngine.answer = function (key) {
        if (!self.state || self.state.finished) {
          // 戰局結束後不再處理(避免 race)
          return;
        }
        const opt = this.current.options.find(o => o.key === key);
        if (!opt) return;
        const isCorrect = !!opt.is_correct;

        // 鎖定按鈕(基本鎖定但不顯示對錯著色;模擬真考不立即知道答案)
        document.querySelectorAll('#play-options .option-btn').forEach(b => {
          b.disabled = true;
          if (b.dataset.key === key) {
            // 玩家選的標示淺色,不洩漏對錯
            b.style.background = 'var(--bg-2)';
            b.style.borderColor = 'var(--primary)';
          }
        });

        // 鐵律 #5:答題後共用層更新 mastery / wrongbook(不顯示 explanation)
        if (this.current.node_id) Mastery.update(this.current.node_id, isCorrect);
        if (typeof SM2 !== 'undefined' && this.current.id && isCorrect) SM2.recordAnswer(this.current.id, true, false);
        Progress.addAnswer(isCorrect);
        if (!isCorrect) {
          const correctOpt = this.current.options.find(o => o.is_correct);
          Wrongbook.add(this.current.id, this.current.node_id, key, correctOpt ? correctOpt.key : '');
          if (typeof SM2 !== 'undefined' && this.current.id) SM2.recordAnswer(this.current.id, false, false);
        }

        // 記錄統計
        const elapsed = Date.now() - self.state.questionStartTs;
        self.state.perQuestionTime.push(elapsed);
        if (isCorrect) {
          self.state.correct++;
          // 答對視覺反饋(極短閃爍,不影響節奏)
          GameFX.flash('correct');
        } else {
          GameFX.flash('wrong');
          const correctOpt = this.current.options.find(o => o.is_correct);
          self.state.wrongs.push({
            qid: this.current.id,
            nodeId: this.current.node_id,
            q: this.current,
            userKey: key,
            correctKey: correctOpt ? correctOpt.key : '',
            npcIdx: self.state.lineup[self.state.idx] ? self.state.lineup[self.state.idx].npcIdx : 0,
            timeUsed: elapsed
          });
        }

        // NPC 反饋台詞(短)
        self._renderNpcFeedback(isCorrect);

        // 短延遲後進下一題(讓玩家看見 NPC 反饋)
        setTimeout(() => {
          if (!self.state || self.state.finished) return;
          self.state.idx++;
          if (self.state.idx >= self.state.total) {
            self._finalize('all_done');
          } else {
            self._showCurrentQuestion();
          }
        }, 800);
      };

      // PlayEngine.showExplanation 全程不被呼叫;我們 hook answer 後直接跳下一題
      PlayEngine.showExplanation = function () { /* suppressed in Theater */ };
      // 清掉舊 onNext(避免 Mode4/Mode2 留下的 callback 干擾)
      PlayEngine.onNext = null;
    },

    _restorePlayEngine() {
      if (this._origAnswer) {
        PlayEngine.answer = this._origAnswer;
        this._origAnswer = null;
      }
      if (this._origShowExplanation) {
        PlayEngine.showExplanation = this._origShowExplanation;
        this._origShowExplanation = null;
      }
      PlayEngine.onNext = this._origOnNext || null;
      this._origOnNext = null;
    },

    _renderNpcFeedback(isCorrect) {
      const item = this.state.lineup[this.state.idx];
      if (!item) return;
      const npc = NPCS[item.npcIdx] || NPCS[0];
      const lines = isCorrect ? npc.onCorrect : npc.onWrong;
      const line = RNG.pick(lines);
      const dialogEl = document.querySelector('.m7-npc-line');
      if (dialogEl) {
        dialogEl.textContent = `${isCorrect ? '✓ ' : '✗ '}「${line}」`;
        dialogEl.style.color = isCorrect ? '#4ade80' : '#f87171';
      }
    },

    // ===== 投降 =====
    surrender() {
      if (!this.state || this.state.finished) return;
      if (!confirm('確定投降?\n• 扣 HP 10 點\n• 立即進結算頁,顯示已答題的成績')) return;
      Player.damage(10);
      this._finalize('surrender');
    },

    // ===== 結算 =====
    _finalize(reason) {
      if (!this.state || this.state.outcomeRendered) return;
      this.state.finished = true;
      this.state.outcomeRendered = true;
      this._stopTimer();
      // 還原 PlayEngine
      this._restorePlayEngine();

      // 計算結果
      const result = this._computeResult(reason);
      // 寫入 history
      this._saveHistory(result);

      // 渲染結算頁
      this._renderResult(result, reason);
      refreshHome();
    },

    _computeResult(reason) {
      const s = this.state;
      const answered = s.idx + (reason === 'all_done' ? 0 : 0); // idx 已經指向下一題,實際答了 idx 題
      const totalAttempted = Math.min(s.idx, s.total);
      const correct = s.correct;
      const total = s.total;
      const wrongs = s.wrongs.slice();

      // 用時(秒)
      const timeUsed = s.totalSeconds - Math.max(0, s.remainSeconds);

      // 分科目得分
      const byCategory = { L21: { correct: 0, total: 0 }, L23: { correct: 0, total: 0 }, other: { correct: 0, total: 0 } };
      // 已答題:從 lineup[0..totalAttempted-1]
      for (let i = 0; i < totalAttempted; i++) {
        const q = s.lineup[i].q;
        const cat = q.knowledge_code && q.knowledge_code.startsWith('L21') ? 'L21' :
                    q.knowledge_code && q.knowledge_code.startsWith('L23') ? 'L23' : 'other';
        byCategory[cat].total++;
        // 答對:該題不在 wrongs 內
        const wasWrong = wrongs.some(w => w.qid === q.id);
        if (!wasWrong) byCategory[cat].correct++;
      }
      // 未答題:全部記為 other / total(避免 NaN)
      const unanswered = total - totalAttempted;

      // 預估等級(對應真考 60 分及格)
      const overallPct = total > 0 ? (correct / total) * 100 : 0;
      let estLevel = '低';
      if (overallPct >= 80) estLevel = '高';
      else if (overallPct >= 60) estLevel = '中';

      // Top 5 錯題(依用時長 + 重要度排序)
      const topWrong = wrongs
        .sort((a, b) => (b.timeUsed || 0) - (a.timeUsed || 0))
        .slice(0, 5);

      return {
        correct, total, totalAttempted, unanswered, timeUsed,
        byCategory, estLevel, topWrong, perQuestionTime: s.perQuestionTime.slice(),
        wrongs
      };
    },

    _saveHistory(result) {
      const data = Storage.get(STORAGE_KEY, { version: STORAGE_VERSION, history: [] });
      if (!data.version) data.version = STORAGE_VERSION;
      if (!Array.isArray(data.history)) data.history = [];
      data.history.push({
        ts: Date.now(),
        config: this.state.config,
        result: {
          correct: result.correct, total: result.total,
          timeUsed: result.timeUsed,
          byCategory: {
            L21: result.byCategory.L21.total > 0 ? `${result.byCategory.L21.correct}/${result.byCategory.L21.total}` : '0/0',
            L23: result.byCategory.L23.total > 0 ? `${result.byCategory.L23.correct}/${result.byCategory.L23.total}` : '0/0',
            other: result.byCategory.other.total > 0 ? `${result.byCategory.other.correct}/${result.byCategory.other.total}` : '0/0'
          },
          estLevel: result.estLevel
        },
        topWrong: result.topWrong.map(w => w.qid)
      });
      // 保留最近 50 場
      if (data.history.length > 50) data.history = data.history.slice(-50);
      Storage.set(STORAGE_KEY, data);
    },

    _renderResult(result, reason) {
      const overallPct = result.total > 0 ? Math.round(result.correct / result.total * 100) : 0;
      const lvlColor = result.estLevel === '高' ? '#4ade80' :
                       result.estLevel === '中' ? '#facc15' : '#f87171';
      const lvlEmoji = result.estLevel === '高' ? '🥇' : result.estLevel === '中' ? '🥈' : '🥉';
      const reasonText = reason === 'time_up' ? '⏰ 時間到自動交卷' :
                         reason === 'surrender' ? '🏳️ 投降結束' :
                         '✅ 全部完成';

      // Pace Heatmap
      const heatmap = this._buildHeatmapHTML(result);

      // 分科目得分區塊
      const catBlock = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:12px 0">
          ${['L21', 'L23', 'other'].map(c => {
            const data = result.byCategory[c];
            const label = c === 'L21' ? '科一(L21)' : c === 'L23' ? '科三(L23)' : '其他/邊界';
            const pct = data.total > 0 ? Math.round(data.correct / data.total * 100) : 0;
            const color = pct >= 80 ? '#4ade80' : pct >= 60 ? '#facc15' : '#f87171';
            return `<div style="background:var(--bg-3);padding:10px;border-radius:var(--radius-sm);text-align:center;border-left:4px solid ${color}">
              <div style="font-size:0.75rem;color:var(--fg-dim)">${label}</div>
              <div style="font-size:1.3rem;font-weight:900;color:${color}">${data.correct}/${data.total}</div>
              <div style="font-size:0.75rem;color:var(--fg-dim)">${pct}%</div>
            </div>`;
          }).join('')}
        </div>
      `;

      // Top 5 錯題清單
      const topWrongBlock = result.topWrong.length === 0 ? `
        <div style="text-align:center;color:var(--success);padding:14px">🎉 沒有錯題,完美演出!</div>` : `
        <div class="weak-list" style="margin-top:8px">
          ${result.topWrong.map((w, i) => {
            const stem = (w.q.stem || '').substring(0, 60).replace(/\{[^}]+\}/g, '');
            const npc = NPCS[w.npcIdx] || NPCS[0];
            const tsec = Math.round((w.timeUsed || 0) / 1000);
            return `<div class="weak-item" style="flex-direction:column;align-items:flex-start;gap:6px;padding:10px">
              <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
                <span style="font-size:0.8rem;color:var(--fg-dim)">#${i+1} · ${npc.avatar} · 用時 ${tsec}s · ${w.q.knowledge_code || ''}</span>
                <span class="weak-score low">錯</span>
              </div>
              <div style="font-size:0.85rem;color:var(--fg);line-height:1.5">${stem}…</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-warn" style="font-size:0.8rem;padding:6px 12px"
                  onclick="Mode7.drillWrong('${w.qid}')">🎯 進下鑽</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card" style="background:linear-gradient(135deg,#1e1b4b,#7f1d1d)">
          <h1 style="text-align:center;color:#fef3c7;font-size:1.8rem">🎬 模考結束</h1>
          <div style="text-align:center;color:var(--fg-dim);margin-top:6px">${reasonText}</div>

          <div style="text-align:center;margin:16px 0">
            <div style="font-size:3.5rem;font-weight:900;color:${lvlColor};text-shadow:0 0 20px currentColor">
              ${lvlEmoji} ${result.correct} / ${result.total}
            </div>
            <div style="font-size:1.5rem;color:var(--fg);margin-top:4px">${overallPct}%</div>
            <div style="margin-top:8px;font-size:1rem;color:${lvlColor};font-weight:700">
              預估等級:${result.estLevel}
              <span style="font-size:0.8rem;color:var(--fg-dim);font-weight:normal">
                (${result.estLevel === '高' ? '≥80% 真考有機會通過' :
                   result.estLevel === '中' ? '60-79% 接近及格邊緣' :
                   '<60% 需要加強練習'})
              </span>
            </div>
          </div>

          <div style="background:rgba(0,0,0,0.4);padding:12px;border-radius:var(--radius-sm);font-size:0.9rem;color:var(--fg-dim);text-align:center">
            ⏱️ 用時 ${Math.floor(result.timeUsed / 60)}m ${result.timeUsed % 60}s
            · 已答 ${result.totalAttempted}/${result.total}
            ${result.unanswered > 0 ? ` · 未答 ${result.unanswered}` : ''}
          </div>
        </div>

        <div class="card">
          <h2>📊 分科目得分</h2>
          ${catBlock}
        </div>

        <div class="card">
          <h2>🌡️ Pace Heatmap(每題用時)</h2>
          <p style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:8px">
            🟢 ≤60s(穩) · 🟡 60-90s(尚可) · 🔴 ≥90s(卡題)
          </p>
          ${heatmap}
        </div>

        <div class="card">
          <h2>🎯 Top 5 卡題錯題(可進下鑽)</h2>
          <p style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:8px">
            這些是你用時最長且答錯的題目,進下鑽針對性訓練(鐵律 #1)
          </p>
          ${topWrongBlock}
        </div>

        <div class="card">
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode7.start()">🔁 再來一場</button>
            <button class="btn btn-warn" onclick="Mode7.drillAllWrong()" ${result.topWrong.length === 0 ? 'disabled' : ''}>🎯 全部錯題下鑽</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 回首頁</button>
          </div>
        </div>
      `;
      // 全大撒花(若 ≥80%)
      if (overallPct >= 80) GameFX.bigConfetti();
      else if (overallPct >= 60) GameFX.confetti({ count: 60 });
      show('view-play');
    },

    _buildHeatmapHTML(result) {
      const times = result.perQuestionTime || [];
      const cellColor = (ms) => {
        const sec = ms / 1000;
        if (sec <= 60) return '#4ade80'; // 綠
        if (sec <= 90) return '#facc15'; // 黃
        return '#f87171';                 // 紅
      };
      // 為已答題著色(用時),未答題用灰
      const cells = [];
      for (let i = 0; i < result.total; i++) {
        const t = times[i];
        const wrongFlag = result.wrongs && result.wrongs.some(w => w.qid === (this.state && this.state.lineup[i] && this.state.lineup[i].q.id));
        if (t === undefined) {
          cells.push(`<div title="第 ${i+1} 題:未答" style="width:24px;height:24px;background:var(--bg-3);
            border:1px solid var(--border);border-radius:3px"></div>`);
        } else {
          const sec = Math.round(t / 1000);
          const color = cellColor(t);
          const wrongMark = wrongFlag ? '✗' : '';
          cells.push(`<div title="第 ${i+1} 題:${sec}s${wrongFlag ? ' (錯)' : ' (對)'}"
            style="width:24px;height:24px;background:${color};border-radius:3px;
            display:flex;align-items:center;justify-content:center;font-size:0.65rem;
            color:rgba(0,0,0,0.6);font-weight:700;cursor:help">${wrongMark}</div>`);
        }
      }
      return `<div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;background:var(--bg-3);border-radius:var(--radius-sm)">${cells.join('')}</div>`;
    },

    // ===== 結算頁:錯題下鑽 =====
    drillWrong(qid) {
      const q = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).find(x => x.id === qid);
      if (!q) {
        showToast('找不到題目原本資料', 2500);
        return;
      }
      const variations = generateVariation(q, 3);
      if (!variations || variations.length === 0) {
        showToast('⚠️ 此題知識點變化型不足', 2500);
        return;
      }
      // 結算後不再有計時器、不再受 PlayEngine hook 影響
      // 退場時要 cleanup;這裡就不再清,DrillSession 自己會處理 onComplete
      DrillSession.start(q.node_id, variations, q, () => {
        // 下鑽完成回首頁
        goHome();
      });
    },

    drillAllWrong() {
      // 把結算頁所有錯題各取 1 變化型,串成大下鑽
      const lastResult = this._getLastHistoryResult();
      if (!lastResult || !lastResult.topWrong || lastResult.topWrong.length === 0) {
        showToast('沒有錯題可下鑽', 2000);
        return;
      }
      const all = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);
      const variations = [];
      for (const qid of lastResult.topWrong) {
        const q = all.find(x => x.id === qid);
        if (!q) continue;
        const v = generateVariation(q, 1);
        if (v && v.length > 0) variations.push(...v);
      }
      if (variations.length === 0) {
        showToast('⚠️ 變化型都不足,改建議單題下鑽', 2500);
        return;
      }
      DrillSession.start('mixed', variations, null, () => {
        goHome();
      });
    },

    _getLastHistoryResult() {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !data.history || data.history.length === 0) return null;
      return data.history[data.history.length - 1];
    },

    // ===== 清理(離場/重啟前都呼叫)=====
    cleanup() {
      this._stopTimer();
      this._restorePlayEngine();
      this.state = null;
    }
  };

  // 註冊到 window(index.html enterMode 動態查找)
  window.Mode7 = Mode7;
})();
