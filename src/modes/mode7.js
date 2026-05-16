// ============================================================
// Mode 7: 考古題模考劇場 (Theater) — 30 分鐘倒數模考
// 對標 2026-05-23 真考臨場壓力訓練
// 6 NPC 輪流出場 + 倒數計時 + Pace Heatmap 結算
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

  // UX 功能 — 字級調整(2026-05-16):S/M/L/XL/XXL 對應 scale
  // 持久化 key 與 5 級對應 scale(只影響 Mode 7 view-play,離場時清掉 CSS var)
  const FONT_SCALE_KEY = 'ipas_mode7_font_v1';
  const FONT_SCALE_LEVELS = [
    { key: 'S',   scale: 0.85, label: 'S' },
    { key: 'M',   scale: 1.00, label: 'M' },
    { key: 'L',   scale: 1.20, label: 'L' },
    { key: 'XL',  scale: 1.40, label: 'XL' },
    { key: 'XXL', scale: 1.60, label: 'XXL' }
  ];

  // === 模考時長配置(嚴格對標 IPAS AI 中級真考:單科 50 題 90 分鐘 = 108 秒/題)===
  // 2026-05-16 修:user 要求以真考標準比例延伸,50→90 / 30→54 / 25→45 / 20→36 分鐘,皆 108s/題
  const QCOUNT_OPTIONS = [
    { qcount: 20, minutes: 36, label: '🥉 短場 20 題 / 36 分鐘',
      desc: '時間有限版,真考比例 108s/題' },
    { qcount: 25, minutes: 45, label: '🏃 衝刺 25 題 / 45 分鐘',
      desc: '半場演練,真考比例 108s/題' },
    { qcount: 30, minutes: 54, label: '🥈 標準 30 題 / 54 分鐘',
      desc: '考前壓力訓練,真考比例 108s/題' },
    { qcount: 50, minutes: 90, label: '🥇 全餐 50 題 / 90 分鐘',
      desc: '完整對標 IPAS AI 中級單科真考(108s/題)' }
  ];

  const SCOPE_OPTIONS = [
    { key: 'all',  label: '🌐 全範圍混合', desc: '科一 + 科二 + 科三 全包,依題庫實際分佈' },
    { key: 's1',   label: '📚 科一 only',  desc: '人工智慧技術應用與規劃(L21*)' },
    { key: 's2',   label: '🗄️ 科二 only',  desc: '大數據處理分析與應用(L22*)' },
    { key: 's3',   label: '🔧 科三 only',  desc: '機器學習技術與應用(L23*)' },
    { key: 'weak', label: '🎯 弱點優先',    desc: '從錯題本 + 熟練度低的節點抽題' }
  ];

  const DIFFICULTY_OPTIONS = [
    { key: 'mixed',  label: '⚖️ 全難度混合', desc: 'easy / medium / hard 依題庫比例' },
    { key: 'hard',   label: '🔥 進階為主',   desc: 'hard 為主、medium 次之(挑戰真考)' }
  ];

  // === 6 NPC 配置(每答 ceil(qcount/6) 題切換一位)===
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
    },
    {
      key: 'bigdata',
      name: '🗄️ 大數據工程師 阿勇',
      avatar: '🗄️',
      role: '科二大數據題(統計 / 數據生命週期 / 大數據 × AI)',
      intro: '「Lake、Warehouse、Streaming Pipeline,十三個編碼一個都別放過。」',
      onCorrect: ['「分佈選對了!」', '「假設檢定五步驟很熟。」', '「PDPA 條文你抓到關鍵了。」'],
      onWrong: ['「先看資料規模再選方法。」', '「CAP 三選二不是萬靈丹。」', '「DP 的 ε 方向別搞反。」'],
      // 偏好:科二 13 編碼(L22101..L22404 全包)
      match: (q) => q.knowledge_code && q.knowledge_code.startsWith('L22')
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
            模擬 2026-05-23 真實考試:倒數計時、不可暫停、6 NPC 輪流出場。<br>
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
        const s2 = pool.filter(q => q.subject === 2).length;
        const s3 = pool.filter(q => q.subject === 3).length;
        el.innerHTML = `候選池 ${pool.length} 題(科一 ${s1} / 科二 ${s2} / 科三 ${s3})— 將抽 ${cfg.qcount} 題`;
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
      } else if (cfg.scope === 's2') {
        pool = pool.filter(q => q.knowledge_code && q.knowledge_code.startsWith('L22'));
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

    // 抽 qcount 題並依 6 NPC 派發
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
      // 重排成輪流出場順序:每答 ceil(want / NPCS.length) 題切換一位
      // 先讓每位 NPC 至少出 1 題(若 bucket 空,從最多者偷 1 題)
      const segSize = Math.ceil(want / NPCS.length);
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
        currentNpcIdx: -1,
        // UX features (2026-05-16):
        markedIds: new Set(),       // 標記題 qid 集合
        answers: {},                // {idx: {userKey, isCorrect, correctKey}} — 已答題記錄,支援上一題回看
        recordedQids: new Set()     // 已寫入 Mastery/Wrongbook 的 qid,避免重答重複寫入
      };

      // 套用字級設定(從 localStorage 載入)
      this._applyFontScale(this._loadFontScale());

      // 進入第一題
      this._installPlayEngineHook();
      this._showCurrentQuestion();
      this._startTimer();
    },

    // ===== 字級調整(UX feature #1)=====
    _loadFontScale() {
      const key = Storage.get(FONT_SCALE_KEY, null);
      if (key && FONT_SCALE_LEVELS.find(l => l.key === key)) return key;
      return 'M';
    },
    _saveFontScale(key) {
      Storage.set(FONT_SCALE_KEY, key);
    },
    _applyFontScale(key) {
      const level = FONT_SCALE_LEVELS.find(l => l.key === key) || FONT_SCALE_LEVELS[1];
      // CSS variable 設在所有 .m7-mock-view 上(scope 限制在 Mode 7 wrapper 內)
      // 因 m7-mock-view div 隨 view-play.innerHTML 替換而消失,離場後不會污染其他 mode
      document.querySelectorAll('.m7-mock-view').forEach(el => {
        el.style.setProperty('--m7-font-scale', String(level.scale));
      });
      // 同時也設 view-play(讓 question-card 兄弟也能讀取到 — CSS var 屬性繼承)
      const view = document.getElementById('view-play');
      if (view) view.style.setProperty('--m7-font-scale', String(level.scale));
      this._currentFontKey = level.key;
      this._saveFontScale(level.key);
      // 更新按鈕 active 狀態(若已渲染)
      document.querySelectorAll('.m7-font-size-btn').forEach(btn => {
        if (btn.dataset.fontKey === level.key) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    },
    setFontScale(key) { this._applyFontScale(key); },

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

      // UX 計算:目前得分 + 進度比
      // 2026-05-16:max 動態化(每題 2 分,真考標準),20題→40 / 25→50 / 30→60 / 50→100
      // 舊「/100」字面在 20/25/30 題場是錯的(可選 max 上限非 100)
      const score = this.state.correct * 2;
      const maxScore = this.state.total * 2;
      const progPct = this.state.total > 0 ? (this.state.idx / this.state.total) * 100 : 0;

      // 字級按鈕 group
      const currentFont = this._currentFontKey || this._loadFontScale();
      const fontBtns = FONT_SCALE_LEVELS.map(l => `
        <button class="m7-font-size-btn ${l.key === currentFont ? 'active' : ''}"
          data-font-key="${l.key}" onclick="Mode7.setFontScale('${l.key}')"
          title="字級 ${l.label} (${l.scale}x)">${l.label}</button>`).join('');

      // 已標記狀態
      const isMarked = this.state.markedIds.has(q.id);
      // 已答狀態
      const prevAnswer = this.state.answers[this.state.idx];
      const answeredHint = prevAnswer
        ? `<div class="m7-answered-hint">📝 已選 <strong>${prevAnswer.userKey}</strong>(再點任一選項可改答)</div>` : '';

      // 上下文 HTML(NPC 對話框 + 倒數計時 + 進度條 + UX 工具列)
      const ctx = `
        <div class="m7-mock-view">
        <div class="m7-toolbar">
          <div class="m7-toolbar-left">
            <span class="m7-toolbar-label">字級</span>
            <div class="m7-font-size-group">${fontBtns}</div>
          </div>
          <div class="m7-toolbar-right">
            <span class="m7-toolbar-score">📊 得分 <strong>${score}</strong> / ${maxScore}</span>
          </div>
        </div>

        <div class="m7-arena">
          <div class="m7-header">
            <div class="m7-progress-info">
              <div class="m7-progress-text">第 ${this.state.idx + 1} / ${this.state.total} 題 · 已答對 ${this.state.correct}</div>
              <div class="hp-track" style="height:8px;background:rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;margin-top:4px">
                <div class="hp-fill" id="m7-progress-bar" style="width:${progPct}%;
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

          <div class="m7-action-row">
            <button class="m7-mark-btn ${isMarked ? 'marked' : ''}" onclick="Mode7.toggleMark()"
              title="標記此題以便日後複習">${isMarked ? '🔖 已標記' : '🔖 標記此題'}</button>
            <button class="m7-tool-btn" onclick="Mode7.copyQuestion()"
              title="複製題目與選項到剪貼簿">📋 複製題目</button>
            <button class="m7-tool-btn" onclick="Mode7.openQuestionList()"
              title="顯示所有題目清單">📋 題目列表</button>
            <button class="btn btn-ghost" onclick="Mode7.surrender()" style="font-size:0.85rem">🏳️ 投降(扣 HP 10)</button>
          </div>
          ${answeredHint}
        </div>

        ${this._renderMode7Styles()}
        </div>
      `;

      this.state.questionStartTs = Date.now();
      // 用 PlayEngine.show 渲染題目;之後我們的 hook 會覆寫 answer
      // R5 task 1:Theater 模式已有整場倒數,禁用 PlayEngine 每題 90s 計時器
      PlayEngine.show(q, { contextHTML: ctx, disableTimer: true });

      // 若該題已答過(navigate back 場景),把先前選項視覺鎖在「已選」狀態(不洩漏對錯)
      if (prevAnswer) this._showPreviousAnswerState(prevAnswer);

      // 渲染導航按鈕(上一題 / 下一題 / 交卷)
      this._renderNavButtons();

      // 套用字級(view-play 已重渲染,需重新 setProperty)
      this._applyFontScale(currentFont);

      this._updateTimerHud();
    },

    // 樣式統一輸出(包含字級 CSS variable 應用)
    _renderMode7Styles() {
      return `
        <style>
          /* === Mode 7 字級調整(UX #1)===
             用 .m7-mock-view ~ 兄弟選擇器作用域限制 — m7-mock-view div 隨 view-play.innerHTML 替換而消失,
             不會污染其他 mode(避免 goHome 後其他 mode 仍受影響) */
          /* m7-mock-view 是 ctx 的 wrapper div,question-card 是 PlayEngine.show 寫的兄弟 div */
          #view-play .m7-mock-view ~ .question-card .question-stem,
          #view-play .m7-mock-view .question-stem { font-size: calc(1.1rem * var(--m7-font-scale, 1)); line-height: 1.8; }
          #view-play .m7-mock-view ~ .question-card .option-btn,
          #view-play .m7-mock-view .option-btn { font-size: calc(0.95rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view ~ .question-card .code-syntax,
          #view-play .m7-mock-view .code-syntax { font-size: calc(0.85rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view ~ .question-card .code-question,
          #view-play .m7-mock-view .code-question { font-size: calc(0.875rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view ~ .question-card .question-code,
          #view-play .m7-mock-view .question-code { font-size: calc(0.875rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view h2 { font-size: calc(1.25rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view h3 { font-size: calc(1.1rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view .m7-npc-line { font-size: calc(1rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view .m7-progress-text { font-size: calc(0.9rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view .m7-answered-hint { font-size: calc(0.85rem * var(--m7-font-scale, 1)); }
          #view-play .m7-mock-view ~ .question-card .explanation,
          #view-play .m7-mock-view .explanation { font-size: calc(1rem * var(--m7-font-scale, 1)); }

          .m7-toolbar { display:flex; justify-content:space-between; align-items:center;
            gap:12px; padding:8px 12px; background:var(--bg-2); border:1px solid var(--border);
            border-radius:var(--radius-sm); margin-bottom:10px; flex-wrap:wrap; }
          .m7-toolbar-left { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .m7-toolbar-right { display:flex; align-items:center; gap:8px; }
          .m7-toolbar-label { font-size:0.8rem; color:var(--fg-dim); font-weight:700; }
          .m7-toolbar-score { font-size:0.9rem; color:var(--fg); }
          .m7-toolbar-score strong { color:var(--warn); font-size:1.1rem; }
          .m7-font-size-group { display:flex; gap:4px; }
          .m7-font-size-btn { padding:4px 10px; background:var(--bg-3); border:2px solid var(--border);
            border-radius:var(--radius-sm); color:var(--fg-dim); font-weight:700; font-size:0.85rem;
            cursor:pointer; transition:all 0.15s; min-width:36px; }
          .m7-font-size-btn:hover { border-color:var(--primary); color:var(--fg); }
          .m7-font-size-btn.active { background:var(--primary); color:var(--primary-fg); border-color:var(--primary); }

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

          /* === UX 工具按鈕(標記 / 複製 / 題目列表 / 投降)=== */
          .m7-action-row { display:flex; gap:8px; margin-top:10px; justify-content:center; flex-wrap:wrap; }
          .m7-mark-btn, .m7-tool-btn { padding:8px 14px; border:2px solid rgba(250,204,21,0.3);
            background:rgba(0,0,0,0.35); color:#e2e8f0; border-radius:var(--radius-sm);
            cursor:pointer; font-size:0.85rem; font-weight:600; transition:all 0.15s; }
          .m7-mark-btn:hover, .m7-tool-btn:hover { border-color:#facc15; background:rgba(250,204,21,0.15); }
          .m7-mark-btn.marked { background:rgba(250,204,21,0.25); border-color:#facc15; color:#fef3c7; }
          .m7-answered-hint { margin-top:10px; padding:8px 12px; background:rgba(56,189,248,0.12);
            border-left:3px solid var(--primary); border-radius:var(--radius-sm); color:#bae6fd;
            font-size:0.85rem; text-align:center; }

          /* === 導航按鈕(上一題 / 下一題 / 交卷)=== */
          .m7-nav-bar { display:flex; justify-content:space-between; align-items:center;
            margin-top:14px; padding:10px 14px; background:var(--bg-2); border:1px solid var(--border);
            border-radius:var(--radius-sm); gap:10px; flex-wrap:wrap; }
          .m7-nav-prev, .m7-nav-next, .m7-nav-submit { padding:10px 18px; border:2px solid var(--border);
            border-radius:var(--radius-sm); background:var(--bg-3); color:var(--fg);
            cursor:pointer; font-weight:700; font-size:0.95rem; transition:all 0.2s; }
          .m7-nav-prev:hover:not(:disabled), .m7-nav-next:hover:not(:disabled) {
            border-color:var(--primary); transform:translateY(-1px); }
          .m7-nav-prev:disabled, .m7-nav-next:disabled { opacity:0.4; cursor:not-allowed; }
          .m7-nav-submit { background:var(--warn); color:#0c0c0c; border-color:var(--warn); }
          .m7-nav-submit:hover { transform:translateY(-1px); box-shadow:0 0 16px rgba(250,204,21,0.5); }
          .m7-nav-info { font-size:0.85rem; color:var(--fg-dim); }

          /* === 題目列表 modal === */
          .m7-qlist-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.65);
            display:flex; align-items:center; justify-content:center; z-index:500;
            animation:m7-fadeIn 0.2s; padding:20px; }
          @keyframes m7-fadeIn { from { opacity:0; } to { opacity:1; } }
          .m7-qlist-modal { background:var(--bg-2); border:1px solid var(--border);
            border-radius:var(--radius); padding:20px; max-width:720px; width:100%;
            max-height:80vh; display:flex; flex-direction:column; box-shadow:var(--shadow); }
          .m7-qlist-header { display:flex; justify-content:space-between; align-items:center;
            margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border); }
          .m7-qlist-title { font-size:1.1rem; font-weight:700; color:var(--primary); }
          .m7-qlist-close { background:none; border:none; color:var(--fg-dim); font-size:1.3rem;
            cursor:pointer; padding:4px 10px; border-radius:var(--radius-sm); }
          .m7-qlist-close:hover { background:var(--bg-3); color:var(--fg); }
          .m7-qlist-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr));
            gap:6px; overflow-y:auto; padding:4px; }
          .m7-qlist-cell { padding:10px 6px; background:var(--bg-3); border:2px solid var(--border);
            border-radius:var(--radius-sm); cursor:pointer; text-align:center; transition:all 0.15s;
            position:relative; font-size:0.85rem; font-weight:700; color:var(--fg); }
          .m7-qlist-cell:hover { border-color:var(--primary); transform:translateY(-1px); }
          .m7-qlist-cell.answered { background:rgba(74,222,128,0.18); border-color:#4ade80; color:#86efac; }
          .m7-qlist-cell.current { box-shadow:0 0 0 2px var(--warn); }
          .m7-qlist-cell .m7-qlist-mark { position:absolute; top:-4px; right:-4px;
            font-size:0.85rem; line-height:1; }
          .m7-qlist-legend { margin-top:10px; padding-top:10px; border-top:1px solid var(--border);
            font-size:0.75rem; color:var(--fg-dim); display:flex; gap:14px; flex-wrap:wrap; }
        </style>
      `;
    },

    // 把已答過的題目鎖定到「已選」視覺狀態(navigate back 用)
    // 僅對標準選項題型有意義(confusion-matrix 題型有自己的狀態管理,跳過)
    _showPreviousAnswerState(prevAnswer) {
      const opts = document.querySelectorAll('#play-options .option-btn');
      if (opts.length === 0) return; // 非標準選項題型(e.g. confusion-matrix)
      opts.forEach(b => {
        if (b.dataset.key === prevAnswer.userKey) {
          b.style.background = 'var(--bg-2)';
          b.style.borderColor = 'var(--primary)';
        }
      });
      // 注意:不 disable(允許重答)
    },

    // 渲染上一題 / 下一題 / 交卷 button(UX #3)
    _renderNavButtons() {
      if (!this.state) return;
      // 找 attach 點:優先 play-options 的 parent;若 confusion-matrix 題型則用 cm-container 的 parent;
      // 都無則直接 view-play
      const playOpts = document.getElementById('play-options');
      const cm = document.getElementById('cm-container');
      let parent = null;
      if (playOpts) parent = playOpts.parentElement;
      else if (cm) parent = cm.parentElement;
      if (!parent) parent = document.getElementById('view-play');
      if (!parent) return;
      // 移除舊的(避免重複)
      const old = parent.querySelector('.m7-nav-bar');
      if (old) old.remove();

      const idx = this.state.idx;
      const total = this.state.total;
      const isLast = idx === total - 1;
      const prevDisabled = idx === 0 ? 'disabled' : '';
      const nextBtn = isLast
        ? `<button class="m7-nav-submit" onclick="Mode7.submitMock()">📤 交卷</button>`
        : `<button class="m7-nav-next" onclick="Mode7.navigateNext()">下一題 →</button>`;

      const nav = document.createElement('div');
      nav.className = 'm7-nav-bar';
      nav.innerHTML = `
        <button class="m7-nav-prev" onclick="Mode7.navigatePrev()" ${prevDisabled}>← 上一題</button>
        <span class="m7-nav-info">${idx + 1} / ${total}</span>
        ${nextBtn}
      `;
      parent.appendChild(nav);
    },

    // ===== UX #3 上一題 / 下一題導航(允許回看 / 改答 — 真考也允許)=====
    navigatePrev() {
      if (!this.state || this.state.finished) return;
      if (this.state.idx <= 0) return;
      // 計時器持續(嚴格不暫停)
      this.state.idx--;
      this._showCurrentQuestion();
    },
    navigateNext() {
      if (!this.state || this.state.finished) return;
      if (this.state.idx >= this.state.total - 1) return;
      this.state.idx++;
      this._showCurrentQuestion();
    },
    submitMock() {
      if (!this.state || this.state.finished) return;
      const unanswered = [];
      for (let i = 0; i < this.state.total; i++) {
        if (!this.state.answers[i]) unanswered.push(i + 1);
      }
      let msg = `確定交卷?\n• 已答 ${this.state.total - unanswered.length}/${this.state.total} 題`;
      if (unanswered.length > 0) msg += `\n• 未答題:${unanswered.slice(0, 10).join(', ')}${unanswered.length > 10 ? '...' : ''}(視為答錯)`;
      if (!confirm(msg)) return;
      this._finalize('submit');
    },

    // ===== UX #2 標記此題 =====
    toggleMark() {
      if (!this.state || this.state.finished) return;
      const item = this.state.lineup[this.state.idx];
      if (!item) return;
      const qid = item.q.id;
      if (this.state.markedIds.has(qid)) {
        this.state.markedIds.delete(qid);
        showToast('已取消標記', 1500);
      } else {
        this.state.markedIds.add(qid);
        showToast('🔖 已標記此題', 1500);
      }
      // 更新按鈕視覺
      const btn = document.querySelector('.m7-mark-btn');
      if (btn) {
        if (this.state.markedIds.has(qid)) {
          btn.classList.add('marked');
          btn.textContent = '🔖 已標記';
        } else {
          btn.classList.remove('marked');
          btn.textContent = '🔖 標記此題';
        }
      }
    },

    // ===== UX #5 複製題目與選項到剪貼簿 =====
    copyQuestion() {
      if (!this.state || this.state.finished) return;
      const item = this.state.lineup[this.state.idx];
      if (!item) return;
      // PlayEngine.current 是 renderQuestion 後的版本(已替換 placeholder + 洗牌選項)
      const rendered = (typeof PlayEngine !== 'undefined' && PlayEngine.current) ? PlayEngine.current : item.q;
      const stem = rendered.stem || '';
      const opts = (rendered.options || [])
        .map(o => `${o.key || ''}. ${o.text || ''}`)
        .join('\n');
      const code = rendered.code_block ? `\n\n${rendered.code_block}\n` : '';
      const intType = rendered.interaction_type ? `\n[特殊互動題型:${rendered.interaction_type}]` : '';
      const text = `[${rendered.knowledge_code || ''}] 第 ${this.state.idx + 1} 題${intType}\n\n${stem}${code}${opts ? '\n\n' + opts : ''}`;
      const finish = () => showToast('📋 已複製題目與選項到剪貼簿', 2000);
      const fail = () => showToast('⚠️ 複製失敗,請手動選取', 2500);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(finish).catch(() => {
          // Fallback
          this._fallbackCopy(text) ? finish() : fail();
        });
      } else {
        this._fallbackCopy(text) ? finish() : fail();
      }
    },
    _fallbackCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    },

    // ===== UX #4 題目列表(grid view + click jump)=====
    openQuestionList() {
      if (!this.state || this.state.finished) return;
      // 移除舊的(若有)
      this.closeQuestionList();
      const backdrop = document.createElement('div');
      backdrop.className = 'm7-qlist-backdrop';
      backdrop.id = 'm7-qlist-backdrop';
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeQuestionList();
      });

      const cells = [];
      for (let i = 0; i < this.state.total; i++) {
        const item = this.state.lineup[i];
        const qid = item.q.id;
        const isAnswered = !!this.state.answers[i];
        const isMarked = this.state.markedIds.has(qid);
        const isCurrent = i === this.state.idx;
        const classes = ['m7-qlist-cell'];
        if (isAnswered) classes.push('answered');
        if (isCurrent) classes.push('current');
        cells.push(`<button class="${classes.join(' ')}" onclick="Mode7.jumpToQuestion(${i})"
          title="第 ${i + 1} 題${isAnswered ? ' (已答)' : ''}${isMarked ? ' 🔖' : ''}">
          ${i + 1}${isMarked ? '<span class="m7-qlist-mark">🔖</span>' : ''}
        </button>`);
      }
      const answered = Object.keys(this.state.answers).length;
      const marked = this.state.markedIds.size;

      backdrop.innerHTML = `
        <div class="m7-qlist-modal">
          <div class="m7-qlist-header">
            <div class="m7-qlist-title">📋 題目列表 (${answered}/${this.state.total} 已答 · ${marked} 標記)</div>
            <button class="m7-qlist-close" onclick="Mode7.closeQuestionList()">✕</button>
          </div>
          <div class="m7-qlist-grid">${cells.join('')}</div>
          <div class="m7-qlist-legend">
            <span style="color:#86efac">■ 已答</span>
            <span style="color:var(--fg-dim)">■ 未答</span>
            <span style="color:#facc15">🔖 標記</span>
            <span style="color:var(--warn)">□ 當前題</span>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
    },
    closeQuestionList() {
      const old = document.getElementById('m7-qlist-backdrop');
      if (old) old.remove();
    },
    jumpToQuestion(idx) {
      if (!this.state || this.state.finished) return;
      if (idx < 0 || idx >= this.state.total) return;
      this.closeQuestionList();
      this.state.idx = idx;
      this._showCurrentQuestion();
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
        const idx = self.state.idx;
        const qid = this.current.id;
        const correctOpt = this.current.options.find(o => o.is_correct);
        const correctKey = correctOpt ? correctOpt.key : '';
        // 重答檢查(navigate back 後重新作答):上一次的答案(若有)
        const prevAnswer = self.state.answers[idx];
        const isReanswer = !!prevAnswer;

        // 鎖定按鈕視覺(基本鎖定但不顯示對錯著色;模擬真考不立即知道答案)
        // UX #3 允許重答:不 disable,讓使用者能再改
        document.querySelectorAll('#play-options .option-btn').forEach(b => {
          if (b.dataset.key === key) {
            // 玩家選的標示淺色,不洩漏對錯
            b.style.background = 'var(--bg-2)';
            b.style.borderColor = 'var(--primary)';
          } else {
            // 還原其他選項(若是重答,清掉先前選的視覺)
            b.style.background = '';
            b.style.borderColor = '';
          }
        });

        // 記錄這題的當前答案
        self.state.answers[idx] = { userKey: key, isCorrect, correctKey };

        // 鐵律 #5:答題後共用層更新 mastery / wrongbook(不顯示 explanation)
        // 但只在「首次作答」時寫入 Mastery/Wrongbook/SM2/Progress(避免重答重複扣分)
        if (!self.state.recordedQids.has(qid)) {
          self.state.recordedQids.add(qid);
          if (this.current.node_id) Mastery.update(this.current.node_id, isCorrect);
          if (typeof SM2 !== 'undefined' && qid && isCorrect) SM2.recordAnswer(qid, true, false);
          Progress.addAnswer(isCorrect);
          if (!isCorrect) {
            Wrongbook.add(qid, this.current.node_id, key, correctKey);
            if (typeof SM2 !== 'undefined' && qid) SM2.recordAnswer(qid, false, false);
          }
        }

        // 記錄用時(首次作答記錄;重答不覆蓋 — 真考用時以首次為準)
        if (!isReanswer) {
          const elapsed = Date.now() - self.state.questionStartTs;
          self.state.perQuestionTime[idx] = elapsed;
          if (isCorrect) {
            self.state.correct++;
            GameFX.flash('correct');
          } else {
            GameFX.flash('wrong');
            self.state.wrongs.push({
              qid,
              nodeId: this.current.node_id,
              q: this.current,
              userKey: key,
              correctKey,
              npcIdx: self.state.lineup[idx] ? self.state.lineup[idx].npcIdx : 0,
              timeUsed: elapsed
            });
          }
        } else {
          // 重答:更新 wrongs 內的 userKey(若該題在 wrongs 中)
          // 注意:不調整 correct 計數,避免使用者重答多次累加。重答僅更新 answers[idx]
          // 真考:首次作答的對錯就是真實成績,重答只是讓使用者「檢查」與「修正」自己選的選項。
          // 為了精準對應真考體驗,我們把「首次答對 → 重答錯」記為「首次答對」(不變);
          // 「首次答錯 → 重答對」也記為「首次答錯」(不變)。考試現場僅以首次答錯為真實。
          // 但 answers[idx] 已更新,UI 上顯示使用者最新選擇,反饋台詞用最新選擇對錯判斷。
          // 此設計:成績嚴格不放鬆(首次為準),但 UX 允許重看自己選了什麼
        }

        // NPC 反饋台詞(用本次選擇的對錯)
        self._renderNpcFeedback(isCorrect);

        // 自動進下一題(僅在「首次作答」且非最後一題時自動跳;重答不自動跳,讓使用者用導航 button)
        if (!isReanswer) {
          if (idx >= self.state.total - 1) {
            // 最後一題答完:不自動 finalize,等使用者按交卷(讓他有機會回看)
            setTimeout(() => {
              if (!self.state || self.state.finished) return;
              // 若使用者已手動導航到別題,跳過 toast(避免干擾)
              if (self.state.idx !== idx) return;
              self._renderNavButtons(); // 確保最後一題的 button 是「交卷」
              showToast('✅ 已答完最後一題,可按「交卷」或上一題回看', 3000);
            }, 800);
          } else {
            setTimeout(() => {
              if (!self.state || self.state.finished) return;
              // race guard:若使用者已手動導航到別題(navigatePrev / navigateNext / jumpToQuestion),
              // 不要再自動 advance,避免雙重跳題
              if (self.state.idx !== idx) return;
              self.state.idx++;
              self._showCurrentQuestion();
            }, 800);
          }
        }
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
      // 用 answers map 而非 s.idx 計算 totalAttempted(支援 UX #3 跳題 + 重答場景)
      const answeredIdxs = Object.keys(s.answers || {}).map(Number);
      const totalAttempted = answeredIdxs.length;
      const correct = s.correct;
      const total = s.total;
      const wrongs = s.wrongs.slice();

      // 用時(秒)
      const timeUsed = s.totalSeconds - Math.max(0, s.remainSeconds);

      // 分科目得分(依 answers 集合判定哪些題已答)
      const byCategory = { L21: { correct: 0, total: 0 }, L22: { correct: 0, total: 0 }, L23: { correct: 0, total: 0 }, other: { correct: 0, total: 0 } };
      for (const i of answeredIdxs) {
        if (!s.lineup[i]) continue;
        const q = s.lineup[i].q;
        const cat = q.knowledge_code && q.knowledge_code.startsWith('L21') ? 'L21' :
                    q.knowledge_code && q.knowledge_code.startsWith('L22') ? 'L22' :
                    q.knowledge_code && q.knowledge_code.startsWith('L23') ? 'L23' : 'other';
        byCategory[cat].total++;
        // 答對:該 idx 的 answers 記錄 isCorrect=true(以首次作答為準,但 answers[idx] 記最後選擇,
        // 若首次答錯則永遠在 wrongs;不在 wrongs 即「首次答對」)
        const wasWrong = wrongs.some(w => w.qid === q.id);
        if (!wasWrong) byCategory[cat].correct++;
      }
      // 未答題
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

      // 標記題(UX #2):結算回傳給 _renderResult 顯示
      const markedQids = s.markedIds ? Array.from(s.markedIds) : [];

      return {
        correct, total, totalAttempted, unanswered, timeUsed,
        byCategory, estLevel, topWrong, perQuestionTime: s.perQuestionTime.slice(),
        wrongs, markedQids,
        lineup: s.lineup.slice() // 給「展開所有解析」用
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
            L22: result.byCategory.L22.total > 0 ? `${result.byCategory.L22.correct}/${result.byCategory.L22.total}` : '0/0',
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
                         reason === 'submit' ? '📤 已交卷' :
                         '✅ 全部完成';

      // 儲存結算用的 lineup(供 _renderAllExplanations 使用)
      this._lastResultLineup = result.lineup || [];

      // Pace Heatmap
      const heatmap = this._buildHeatmapHTML(result);

      // 分科目得分區塊
      const catBlock = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:12px 0">
          ${['L21', 'L22', 'L23', 'other'].map(c => {
            const data = result.byCategory[c];
            const label = c === 'L21' ? '科一(L21)' : c === 'L22' ? '科二(L22)' : c === 'L23' ? '科三(L23)' : '其他/邊界';
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

      // UX #2 標記題清單
      const markedBlock = (result.markedQids && result.markedQids.length > 0) ? `
        <div class="card">
          <h2>🔖 已標記的題目(${result.markedQids.length} 題)</h2>
          <p style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:8px">
            這些是你模考中主動標記的題目,建議回頭複習
          </p>
          <div class="weak-list" style="margin-top:8px">
            ${result.markedQids.map((qid, i) => {
              const allQ = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);
              const q = allQ.find(x => x.id === qid);
              if (!q) return '';
              const stem = (q.stem || '').substring(0, 60).replace(/\{[^}]+\}/g, '');
              return `<div class="weak-item" style="flex-direction:column;align-items:flex-start;gap:6px;padding:10px">
                <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
                  <span style="font-size:0.8rem;color:var(--fg-dim)">🔖 #${i+1} · ${q.knowledge_code || ''}</span>
                </div>
                <div style="font-size:0.85rem;color:var(--fg);line-height:1.5">${stem}…</div>
              </div>`;
            }).join('')}
          </div>
        </div>` : '';

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="m7-mock-view">
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

        ${markedBlock}

        <div class="card">
          <div class="actions" style="justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="Mode7.start()">🔁 再來一場</button>
            <button class="btn btn-warn" onclick="Mode7.drillAllWrong()" ${result.topWrong.length === 0 ? 'disabled' : ''}>🎯 全部錯題下鑽</button>
            <button class="btn btn-ghost" onclick="Mode7.expandAllExplanations()">📖 展開所有解析</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 回首頁</button>
          </div>
        </div>

        <div id="m7-all-explanations"></div>

        ${this._renderMode7Styles()}
        </div>
      `;
      // 套用字級到結算頁
      this._applyFontScale(this._currentFontKey || this._loadFontScale());

      // 全大撒花(若 ≥80%)
      if (overallPct >= 80) GameFX.bigConfetti();
      else if (overallPct >= 60) GameFX.confetti({ count: 60 });
      show('view-play');
    },

    // ===== UX #6 展開所有解析(結算頁)=====
    expandAllExplanations() {
      const container = document.getElementById('m7-all-explanations');
      if (!container) return;
      const lineup = this._lastResultLineup || [];
      if (lineup.length === 0) {
        showToast('無題目資料可展開', 2000);
        return;
      }
      // toggle:已展開則收起
      if (container.dataset.expanded === '1') {
        container.innerHTML = '';
        container.dataset.expanded = '0';
        showToast('已收起解析', 1500);
        return;
      }
      const blocks = lineup.map((item, i) => {
        const q = item.q;
        const correctOpt = (q.options || []).find(o => o.is_correct);
        const correctLabel = correctOpt ? `${correctOpt.key || ''} ${correctOpt.text || ''}` : '(未提供)';
        const explCorrect = (q.explanation && q.explanation.correct) || '(此題未提供詳細解釋)';
        const hook = (q.explanation && q.explanation.hook) || '';
        const npc = NPCS[item.npcIdx] || NPCS[0];
        // 顯示其他選項解析
        const wrongOpts = (q.options || []).filter(o => !o.is_correct);
        const wrongAnalysis = wrongOpts.map(o => {
          let exp = '';
          if (q.explanation && q.explanation.wrong && typeof q.explanation.wrong === 'object') {
            exp = q.explanation.wrong[o.text] || '';
            if (!exp) {
              for (const k of Object.keys(q.explanation.wrong)) {
                if (k && (k.includes((o.text || '').substring(0, 8)) || (o.text || '').includes(k.substring(0, 8)))) {
                  exp = q.explanation.wrong[k]; break;
                }
              }
            }
          }
          if (!exp) exp = o.trap_type ? `陷阱類型:${o.trap_type}` : '此選項不正確';
          return `<div style="padding:6px 10px;margin:4px 0;background:rgba(255,255,255,0.04);border-radius:4px;border-left:3px solid #94a3b8">
            <div style="color:#cbd5e1;font-weight:600;font-size:0.85rem">${o.key || ''}. ${o.text || ''}</div>
            <div style="color:var(--fg-dim);font-size:0.8rem;margin-top:2px">└ ${exp}</div>
          </div>`;
        }).join('');
        return `<div class="card" style="margin-top:8px">
          <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:6px">
            第 ${i + 1} 題 · ${npc.avatar} ${npc.name} · ${q.knowledge_code || ''} · ${q.difficulty || ''}
          </div>
          <div class="question-stem" style="font-size:1rem;margin-bottom:10px">${q.stem || ''}</div>
          ${q.code_block ? `<pre class="code-syntax" style="font-size:0.8rem;padding:8px">${q.code_block}</pre>` : ''}
          <div style="background:rgba(74,222,128,0.12);border-left:4px solid #4ade80;padding:10px;border-radius:6px;margin:8px 0">
            <div style="color:#4ade80;font-weight:700;font-size:0.9rem;margin-bottom:4px">📚 正確答案</div>
            <div style="font-size:0.95rem;margin-bottom:6px"><strong>${correctLabel}</strong></div>
            <div style="color:var(--fg);line-height:1.7;font-size:0.9rem">${explCorrect}</div>
          </div>
          ${wrongAnalysis ? `<div style="background:rgba(148,163,184,0.08);border-left:4px solid #94a3b8;padding:8px 10px;border-radius:6px;margin:6px 0">
            <div style="color:#cbd5e1;font-weight:700;font-size:0.85rem;margin-bottom:4px">🔍 其他選項解析</div>
            ${wrongAnalysis}
          </div>` : ''}
          ${hook ? `<div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:8px 10px;border-radius:6px;margin:6px 0">
            <div style="color:#facc15;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>
            <div style="color:var(--fg);font-style:italic;margin-top:2px;font-size:0.9rem">${hook}</div>
          </div>` : ''}
        </div>`;
      }).join('');

      container.innerHTML = `
        <div class="card">
          <h2>📖 全部 ${lineup.length} 題解析</h2>
          <p style="color:var(--fg-dim);font-size:0.85rem;margin-bottom:8px">
            完整題目解析,可滾動查看。再點「展開所有解析」即收起。
          </p>
        </div>
        ${blocks}
      `;
      container.dataset.expanded = '1';
      // 自動 scroll 到展開區
      setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
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
      // 清掉 UX modal(若殘留)
      const old = document.getElementById('m7-qlist-backdrop');
      if (old) old.remove();
      // 清掉 view-play 的 font scale CSS var(離場時,不影響其他 mode)
      // (m7-mock-view div 已隨 view-play.innerHTML 替換被清掉;只剩 view-play 上的 CSS var 要清)
      const view = document.getElementById('view-play');
      if (view) view.style.removeProperty('--m7-font-scale');
      this._lastResultLineup = null;
      this.state = null;
    }
  };

  // 註冊到 window(index.html enterMode 動態查找)
  window.Mode7 = Mode7;
})();
