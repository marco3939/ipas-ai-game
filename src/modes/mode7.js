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

    // === 2026-05-16 案例 10 修補:集中 rendered 快照 fallback ===
    // 為何需要:state.lineup[i].q 是 QUESTIONS 原版,options 沒洗牌後的 key
    // (renderQuestion 在 index.html:685-689 洗牌後才指派 A/B/C/D)。
    // 任何讀 q.options.find(o.key === userKey) 的地方必須用 _rendered.options
    // (或 PlayEngine.current 若 id 匹配)才能對得上;否則 isCorrect 永遠 false、
    // correctKey 永遠 undefined。
    // 使用者:`const renderedQ = Mode7._getRendered(item);`
    _getRendered(item) {
      if (!item) return null;
      if (item._rendered) return item._rendered;
      if (typeof PlayEngine !== 'undefined' && PlayEngine.current
          && item.q && PlayEngine.current.id === item.q.id) {
        return PlayEngine.current;
      }
      return item.q || null;
    },

    // 案例 10 LOW-2:HTML escape helper(stem/code/text 經 user-controlled snapshot 進來)
    // defense in depth — 題庫信任 + 強型別仍可能因匯入 fullLog 受外部資料污染
    // 2026-05-19 R1 simplify:轉呼叫 window.escHTML(API 別名保留)
    _esc(s) { return escHTML(s); },

    // ===== 入口 =====
    start() {
      // 進場前先清理上一場殘留(若有)
      this.cleanup();
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      this.renderSetup();
    },

    // ===== 2026-05-17 新入口:接收外部預過濾題池,跳過 setup 直接開戰 =====
    // 由 Mode 6(卡牌圖鑑)「篩選後模擬考」按鈕呼叫:
    //   Mode7.startWithCustomPool(questionList, { qcount, minutes, label })
    //   - questionList: 已預過濾的 question 物件陣列(來自 Mode 6 _filterCards → 對應 codes 篩 QUESTIONS)
    //   - opts.qcount: 玩家選的題數(若 > pool size 則自動截至 pool size)
    //   - opts.minutes: 玩家選的時長分鐘
    //   - opts.label: history 顯示用標籤(e.g. "卡牌:科三-已解鎖")
    // 設計理由(2026-05-17 §8 合規):
    //   - 100% 複用 _startBattle 後的所有流程(_installPlayEngineHook / _showCurrentQuestion / _startTimer / 結算 / fullLog 回顧 / Wrongbook 寫入)
    //   - 用 state.source = 'mode6_codex' 區隔 history,避免污染原 Mode 7 模考紀錄
    //   - 不動 _drawQuestions / scope / difficulty 邏輯,僅 bypass setup
    startWithCustomPool(questionList, opts) {
      this.cleanup();
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      opts = opts || {};
      if (!Array.isArray(questionList) || questionList.length === 0) {
        showToast('⚠️ 卡牌池為空,無法開戰', 3000);
        return;
      }
      // 夾在 [1, pool.length] 之間;預設依池大小推估
      const maxPool = questionList.length;
      const requestedQ = Math.max(1, parseInt(opts.qcount || Math.min(30, maxPool), 10));
      const qcount = Math.min(requestedQ, maxPool);
      // 時長:opts.minutes 優先;否則對齊真考 ~1.2 min/題,最低 10 分鐘
      const minutes = Math.max(1, parseInt(opts.minutes || Math.max(10, Math.round(qcount * 1.2)), 10));
      const totalSeconds = minutes * 60;
      // 構建 lineup:隨機洗牌 + npcIdx 輪轉(對齊 _drawQuestions 出來的結構)
      const shuffled = RNG.shuffle(questionList.slice()).slice(0, qcount);
      const lineup = shuffled.map((q, i) => ({ q: q, npcIdx: i % NPCS.length }));

      this.state = {
        source: 'mode6_codex',                    // 區隔 history 來源
        sourceLabel: opts.label || '卡牌模擬',     // 結算 / history 顯示
        config: { qcount: qcount, minutes: minutes, scope: 'codex', difficulty: 'mixed' },
        lineup: lineup,
        idx: 0,
        total: lineup.length,
        correct: 0,
        wrongs: [],
        perQuestionTime: [],
        questionStartTs: 0,
        startedAt: Date.now(),
        totalSeconds: totalSeconds,
        remainSeconds: totalSeconds,
        finished: false,
        outcomeRendered: false,
        currentNpcIdx: -1,
        markedIds: new Set(),
        answers: {},
        draft: {},
        locked: new Set(),
        reviewMode: false,
        reviewIdx: 0,
        reviewedSet: new Set()
      };

      this._applyFontScale(this._loadFontScale());
      this._installPlayEngineHook();
      this._showCurrentQuestion();
      this._startTimer();
      // 2026-05-19 考試保護:進入戰鬥即標記,goHome 跳 confirm
      if (typeof _setExamMode === 'function') _setExamMode(true, 'Mode 7 模擬劇場');
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
      const recent = data.history.slice(-10).reverse();
      const allQ = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);

      // scope label 對照(2026-05-17 §8 follow-up:加 codex 對應)
      const scopeLabel = (k) => ({
        all: '全主題', s1: '科一', s2: '科二', s3: '科三',
        wrongbook: '錯題本', weak: '弱點優先', codex: '🃏 卡牌篩選'
      }[k] || (k || '?'));
      // difficulty label
      const diffLabel = (k) => ({ easy: '簡單', medium: '中等', hard: '困難', mixed: '混合' }[k] || '?');

      const cards = recent.map((h, idx) => {
        const date = new Date(h.ts);
        const ds = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
        const r = h.result || {};
        const c = h.config || {};
        const pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
        const lvlColor = r.estLevel === '高' ? '#4ade80' : r.estLevel === '中' ? '#facc15' : '#f87171';
        const lvlEmoji = r.estLevel === '高' ? '🥇' : r.estLevel === '中' ? '🥈' : '🥉';
        const tu = r.timeUsed || 0;
        const tuStr = `${Math.floor(tu/60)}m ${tu%60}s`;
        const avgPerQ = r.total > 0 ? Math.round(tu / r.total) : 0;
        // 分科目區塊
        const bc = r.byCategory || {};
        const catRow = ['L21','L22','L23','other'].map(k => {
          const v = bc[k] || '0/0';
          const [cc, tt] = v.split('/').map(Number);
          if (!tt) return '';
          const p = tt ? Math.round(cc/tt*100) : 0;
          const col = p >= 80 ? '#4ade80' : p >= 60 ? '#facc15' : '#f87171';
          const lbl = k === 'L21' ? '科一' : k === 'L22' ? '科二' : k === 'L23' ? '科三' : '其他';
          return `<span style="display:inline-block;background:var(--bg-3);padding:4px 10px;border-radius:4px;margin:2px 4px 2px 0;font-size:0.82rem">
            ${lbl} <strong style="color:${col}">${v}</strong> (${p}%)
          </span>`;
        }).filter(Boolean).join('');

        // Top wrong 區塊
        const tw = Array.isArray(h.topWrong) ? h.topWrong : [];
        const twHtml = tw.length === 0
          ? `<div style="color:var(--success);padding:8px;text-align:center">🎉 此場無錯題</div>`
          : tw.map((qid, i) => {
              const q = allQ.find(x => x.id === qid);
              const stem = q ? (q.stem || '').substring(0, 60).replace(/\{[^}]+\}/g, '') : '(題目已不在題庫)';
              const kc = q ? (q.knowledge_code || '') : '?';
              return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;margin:4px 0;background:rgba(255,255,255,0.03);border-radius:4px;border-left:3px solid #f87171">
                <div style="flex:1;min-width:0">
                  <div style="font-size:0.75rem;color:var(--fg-dim)">#${i+1} · ${kc} · ${qid}</div>
                  <div style="font-size:0.85rem;color:var(--fg);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${stem}${stem.length >= 55 ? '…' : ''}</div>
                </div>
                ${q ? `<button class="btn btn-warn" style="font-size:0.75rem;padding:4px 10px;flex-shrink:0" onclick="event.stopPropagation();Mode7.drillWrong('${qid}')">🎯 下鑽</button>` : ''}
              </div>`;
            }).join('');

        const validTw = tw.filter(qid => allQ.find(x => x.id === qid));
        // 真歷史 array 中的 index(slice(-10).reverse() 後位置與原 history index 對應)
        const realHistoryIdx = data.history.length - 1 - idx;
        const drillAllBtn = validTw.length > 0
          ? `<button class="btn btn-warn" style="font-size:0.82rem;padding:6px 14px;margin-top:8px;margin-right:6px" onclick="event.stopPropagation();Mode7.drillHistoryAllWrong(${realHistoryIdx})">🎯 此場錯題全部下鑽(${validTw.length})</button>`
          : '';
        // 完整逐題回顧按鈕(只在有 fullLog 時顯示)
        const hasFullLog = Array.isArray(h.fullLog) && h.fullLog.length > 0;
        // 2026-05-17 critical:偵測 PR #21 (案例 10) 修補前留下的壞紀錄。
        // 症狀:fullLog 內 options 雖有 text 但 key 為空(o.key === '' 或 undefined),
        //       且 correctKey 為空字串 → state.correct 永遠是 0,結算頁顯示 0/N 假分數。
        // 偵測:有 fullLog 且 result.correct === 0(零分),且至少一題 option 缺 key → 視為壞掉。
        const isCorruptedLegacy = hasFullLog && (r.correct === 0 || !r.correct) && h.fullLog.some(e =>
          e.answered && Array.isArray(e.options) && e.options.length > 0 &&
          e.options.some(o => !o.key || typeof o.key !== 'string' || !/^[A-Z]$/.test(o.key))
        );
        const reviewAllBtn = hasFullLog
          ? `<button class="btn btn-primary" style="font-size:0.82rem;padding:6px 14px;margin-top:8px" onclick="event.stopPropagation();Mode7.reviewHistorySession(${realHistoryIdx})">📚 完整逐題回顧(${h.fullLog.length} 題)</button>`
          : `<span style="font-size:0.78rem;color:var(--fg-dim);display:inline-block;margin-top:8px">(舊紀錄無逐題資料,新模考起會自動儲存)</span>`;
        // 2026-05-17:壞掉的舊紀錄加紅色警告 + 刪除按鈕(避免使用者誤以為現在出 bug)
        const corruptedWarn = isCorruptedLegacy
          ? `<div style="margin:8px 0;padding:8px 12px;background:rgba(220,38,38,0.12);border:1px solid #dc2626;border-radius:4px;color:#fca5a5;font-size:0.82rem;line-height:1.5">
              <strong style="color:#f87171">⚠️ 此場為 PR #21(2026-05-16)修補前的舊紀錄</strong><br>
              當時計分有 bug:即使全部答對,分數也會被永久記成 0/${this._esc(String(r.total || '?'))}。<br>
              <span style="color:#fde68a">逐題回顧的「✓ 答對 / ✗ 答錯」與「你選的紅框」可能完全不準。</span><br>
              <span style="color:#86efac">建議刪除本場 — 從新一場模考開始計分會正確。</span>
            </div>`
          : '';
        const deleteBtn = isCorruptedLegacy
          ? `<button class="btn" style="font-size:0.82rem;padding:6px 14px;margin-top:8px;background:#7f1d1d;color:#fef2f2;border:1px solid #dc2626" onclick="event.stopPropagation();Mode7.deleteHistoryEntry(${realHistoryIdx})">🗑️ 刪除此場壞紀錄</button>`
          : '';

        return `<details class="m7-history-card" style="background:var(--bg-2);border:1px solid var(--bg-3);border-radius:6px;padding:0;margin-bottom:8px">
          <summary style="cursor:pointer;padding:10px 14px;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;min-width:0">
              <span style="font-size:0.85rem;color:var(--fg-dim);font-family:monospace">${ds}</span>
              <span style="font-size:0.78rem;color:var(--fg-dim)">${h.sourceLabel ? this._esc(h.sourceLabel) : scopeLabel(c.scope)} · ${diffLabel(c.difficulty)} · ${c.qcount || '?'}題</span>
              <strong style="color:${lvlColor};font-size:1rem">${lvlEmoji} ${r.correct || 0}/${r.total || 0}</strong>
              <span style="color:${lvlColor};font-weight:700">${pct}%</span>
              <span style="font-size:0.78rem;color:var(--fg-dim)">⏱ ${tuStr}</span>
            </div>
            <span style="color:var(--fg-dim);font-size:0.85rem">點此展開 ▼</span>
          </summary>
          <div style="padding:0 14px 14px 14px;border-top:1px solid var(--bg-3)">
            <div style="margin:10px 0">
              <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:4px">📊 分科目得分</div>
              <div>${catRow || '<span style="color:var(--fg-dim)">(無分科資料)</span>'}</div>
            </div>
            <div style="margin:10px 0;font-size:0.85rem;color:var(--fg-dim)">
              ⏱ 用時 ${tuStr} · 平均每題 ${avgPerQ}s · 等級 <strong style="color:${lvlColor}">${r.estLevel || '-'}</strong>
            </div>
            ${corruptedWarn}
            <div style="margin:14px 0 6px;font-size:0.9rem;color:#f87171;font-weight:700">🎯 Top 卡題錯題(${tw.length})</div>
            ${twHtml}
            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
              ${reviewAllBtn}
              ${drillAllBtn}
              ${deleteBtn}
            </div>
          </div>
        </details>`;
      }).join('');

      return `<div class="card">
        <h3>📜 最近 ${recent.length} 場模考紀錄 <span style="font-size:0.75rem;color:var(--fg-dim);font-weight:normal">(點任一場展開,可逐題下鑽複習)</span></h3>
        ${cards}
      </div>`;
    },

    // 此場 topWrong 全部下鑽(串接 generateVariation 各取 1)
    drillHistoryAllWrong(historyIdx) {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !data.history || !data.history[historyIdx]) {
        showToast('找不到此場紀錄', 2000);
        return;
      }
      const h = data.history[historyIdx];
      const tw = Array.isArray(h.topWrong) ? h.topWrong : [];
      const allQ = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);
      const validQs = tw.map(qid => allQ.find(x => x.id === qid)).filter(Boolean);
      if (validQs.length === 0) {
        showToast('此場無可下鑽錯題(題目可能已從題庫移除)', 2500);
        return;
      }
      // 取每題 1 個 variation 串接(若題目自己沒 variation 就跳過)
      const queue = [];
      validQs.forEach(q => {
        const vs = generateVariation(q, 1);
        if (vs && vs.length > 0) queue.push(...vs);
      });
      if (queue.length === 0) {
        showToast('⚠️ 這些題的知識點變化型不足', 2500);
        return;
      }
      // 隨第 1 題的 node_id 作 DrillSession seed
      DrillSession.start(validQs[0].node_id, queue, validQs[0], () => {
        goHome();
      });
    },

    _getLastConfig() {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !data.history || data.history.length === 0) return null;
      return data.history[data.history.length - 1].config || null;
    },

    // ===== 抽題池 =====
    _buildPool(cfg) {
      // 2026-05-18:排除 code_trace 題(雞肋:頂層 options 只有「全部步驟正確/任一錯誤」,
      // 玩家永遠選 A 必對 — code_trace 真考點在 trace_steps,只有 Mode 8 道場才會逐步答)
      const all = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).filter(q =>
        q && q.id && q.options && q.format !== 'code_trace'
      );
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
      for (let i = 0; i < NPCS.length; i++) {
        const t = Math.min(segSize, remain);
        slots[i].target = t;
        remain -= t;
      }
      // 從 buckets 拉題填 slots(優先匹配 NPC,不足從別的 bucket 借)
      for (let i = 0; i < NPCS.length; i++) {
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
        answers: {},                // {idx: {userKey, isCorrect, correctKey}} — 已『送出』的答案(locked)
        // 2026-05-16 強化作弊防護:加 locked/draft 兩層
        // - draft: 已點選但未送出 — 只記 userKey,不算 isCorrect、不顯示 ✓/✗
        // - locked: 已送出本題 — 答案進入 state.answers,UI 禁用選項,不可改
        // 此設計對齊真考:答題期 hide 對錯,送出鎖定;結算才揭曉
        draft: {},                  // {idx: {userKey}} — 草稿選擇,未送出
        locked: new Set(),          // 已送出本題的 idx 集合(送出後 options 鎖定)
        // 2026-05-16 結算後逐題回顧 mode(使用者要求:考完可逐題 review 確認看完才能離開)
        reviewMode: false,          // 是否進入結算後 review 模式
        reviewIdx: 0,               // review 當前題目索引
        reviewedSet: new Set()      // 已檢視過的題目 idx(進 review 即標記)
      };

      // 套用字級設定(從 localStorage 載入)
      this._applyFontScale(this._loadFontScale());

      // 進入第一題
      this._installPlayEngineHook();
      this._showCurrentQuestion();
      this._startTimer();
      // 2026-05-19 考試保護:進入戰鬥即標記,goHome 跳 confirm
      if (typeof _setExamMode === 'function') _setExamMode(true, 'Mode 7 模擬劇場');
    },

    // ===== 字級調整(UX feature #1)=====
    _loadFontScale() {
      const key = Storage.get(FONT_SCALE_KEY, null);
      if (key && FONT_SCALE_LEVELS.find(l => l.key === key)) return key;
      return 'L';
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

    // ===== 2026-05-16 lenient 改造:即時重算 correct / wrongs(從 state.answers 推導)=====
    // 重答可能改變對錯結果,計分顯示需即時反映。共用層寫入仍延後至 _finalize 統一處理。
    _recomputeStats() {
      if (!this.state) return;
      const s = this.state;
      let correct = 0;
      const wrongs = [];
      for (let idx = 0; idx < s.total; idx++) {
        const a = s.answers[idx];
        if (!a) continue;
        if (a.isCorrect) {
          correct++;
        } else {
          const item = s.lineup && s.lineup[idx];
          if (item && item.q) {
            wrongs.push({
              qid: item.q.id,
              nodeId: item.q.node_id,
              q: item.q,
              userKey: a.userKey,
              correctKey: a.correctKey,
              npcIdx: item.npcIdx || 0,
              timeUsed: s.perQuestionTime[idx] || 0
            });
          }
        }
      }
      s.correct = correct;
      s.wrongs = wrongs;
    },

    // 統一寫共用層(_finalize 前唯一寫入點)
    // lenient 改造:答題期間 hook 不寫共用層,等交卷時用「最終 answers」一次性寫入
    // 這保證末答計分:首答錯 → 重答對 → 算對(寫 Mastery true / 不寫 Wrongbook)
    _commitToSharedLayer() {
      if (!this.state) return;
      const s = this.state;
      for (let idx = 0; idx < s.total; idx++) {
        const a = s.answers[idx];
        if (!a) continue;
        const item = s.lineup && s.lineup[idx];
        if (!item || !item.q) continue;
        // 案例 10:用 rendered 取洗牌後 options(含 key);未渲染過則 fallback 原版
        const renderedQ = this._getRendered(item);
        const q = item.q;   // q.id/node_id 從原版取(穩定)
        if (q.node_id) Mastery.update(q.node_id, a.isCorrect);
        Progress.addAnswer(a.isCorrect);
        if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, a.isCorrect, false);
        // 案例 10 audit C-4 critical:Mode 7 覆寫 PlayEngine.answer 跳過原生 SeenCorrect.mark,
        // 這裡是唯一 commit 點,缺這條會讓模考答對的所有題在 Mode 1/2/4/5/8 不被排除
        if (a.isCorrect && q.id && typeof SeenCorrect !== 'undefined') SeenCorrect.mark(q.id);
        if (!a.isCorrect) {
          const userOpt = (renderedQ.options || []).find(o => o.key === a.userKey);
          const correctOpt = (renderedQ.options || []).find(o => o.is_correct);
          Wrongbook.add(
            q.id, q.node_id, a.userKey, a.correctKey,
            (userOpt && userOpt.text) || '',
            (correctOpt && correctOpt.text) || ''
          );
        }
      }
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
      // 案例 10 補:時間到自動交卷時也要把所有 draft 升格為 answers(與 submitMock 一致)
      // 不然「已選但沒按送出本題」的題在 _commitToSharedLayer 全變未答 → 使用者誤以為自己沒選
      this._autoLockDrafts();
      this._finalize('time_up');
    },

    // 抽出 submitMock 內的「自動升格 draft」邏輯,讓 _timeUp 也能呼叫
    // 案例 10 critical fix:用 _getRendered 才有洗牌後 key
    _autoLockDrafts() {
      if (!this.state) return;
      for (let i = 0; i < this.state.total; i++) {
        if (this.state.locked.has(i)) continue;
        const draft = this.state.draft[i];
        if (!draft || !draft.userKey) continue;
        const item = this.state.lineup[i];
        let renderedQ = this._getRendered(item);
        // 2026-05-19 §8 H2 修補:若拿不到 rendered options(item._rendered 未 cache,
        // 玩家從題目列表跳到此題未進過 _showCurrentQuestion),主動跑 renderQuestion 補 cache
        // 避免 rOpts 為空 → opt undefined → 寫入 correctKey='' → Wrongbook 殘留型污染(案例 10)
        const rOptsInitial = (renderedQ && renderedQ.options) || [];
        if (rOptsInitial.length === 0 && item && item.q && typeof renderQuestion === 'function') {
          try {
            item._rendered = renderQuestion(item.q);
            renderedQ = item._rendered;
          } catch (_) {}
        }
        const rOpts = (renderedQ && renderedQ.options) || [];
        const opt = rOpts.find(o => o.key === draft.userKey);
        const isCorrect = !!(opt && opt.is_correct);
        const correctOpt = rOpts.find(o => o.is_correct);
        const correctKey = correctOpt ? correctOpt.key : '';
        this.state.answers[i] = { userKey: draft.userKey, isCorrect, correctKey };
        this.state.locked.add(i);
      }
      // 案例 10 review 補:寫入 answers 後必重算 stats(否則 s.correct/s.wrongs 不更新,
      // 結算頁分數偏少)。放這裡讓 submitMock + _timeUp 兩條路徑永不分歧。
      this._recomputeStats();
    },

    // ===== 顯示當前題目(用 PlayEngine.show + 包裹 NPC 框)=====
    _showCurrentQuestion() {
      if (!this.state) return;
      const item = this.state.lineup[this.state.idx];
      if (!item) { this._finalize('all_done'); return; }
      // 案例 10:同題重複進入 renderQuestion 會重洗牌 → 同 idx 的 D 在不同次指向不同 text
      // → draft.userKey 失準。首次渲染後 cache 到 item._rendered,後續傳
      // {...item._rendered, shuffle_options:false} 跳洗牌維持相同順序與 key。
      const baseQ = item._rendered
        ? Object.assign({}, item._rendered, { shuffle_options: false })
        : item.q;
      const { npcIdx } = item;
      const q = baseQ;
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
      // 答題狀態(三種):locked(已送出)/ draft(已選未送)/ 未答
      const prevAnswer = this.state.answers[this.state.idx];
      const draft = this.state.draft[this.state.idx];
      const isLocked = this.state.locked.has(this.state.idx);
      let answeredHint = '';
      if (isLocked) {
        // 2026-05-16:重訪已送出題,直接顯示對錯狀態(學習模式 UX)
        answeredHint = prevAnswer.isCorrect
          ? `<div class="m7-answered-hint" style="color:#4ade80">🔒 已送出 <strong>${prevAnswer.userKey}</strong> · ✅ 答對(正解 ${prevAnswer.correctKey})</div>`
          : `<div class="m7-answered-hint" style="color:#f87171">🔒 已送出 <strong>${prevAnswer.userKey}</strong> · ❌ 答錯 · 正解:<strong style="color:#4ade80">${prevAnswer.correctKey}</strong></div>`;
      } else if (draft && draft.userKey) {
        answeredHint = `<div class="m7-answered-hint" style="color:var(--fg-dim)">📝 已選 <strong>${draft.userKey}</strong> — 點選項可改 / 按「送出本題」鎖定</div>`;
      }

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
      // 案例 10:第一次渲染後 cache 洗牌結果(供 submit/review/snapshot 等下游使用)
      if (!item._rendered && PlayEngine.current && PlayEngine.current.id === item.q.id) {
        item._rendered = PlayEngine.current;
      }

      // 還原該題的視覺狀態:locked (已送出) / draft (已選未送) / unanswered
      // 三種狀態 _showPreviousAnswerState 內部會分別處理(包含 disable options for locked)
      if (prevAnswer || this.state.draft[this.state.idx] || this.state.locked.has(this.state.idx)) {
        this._showPreviousAnswerState(prevAnswer);
      }

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
          .m7-nav-submit-question { background:var(--primary); color:#fff; border:2px solid var(--primary);
            padding:10px 18px; border-radius:var(--radius-sm); cursor:pointer; font-weight:700;
            transition:all 0.15s; }
          .m7-nav-submit-question:not(:disabled):hover { transform:translateY(-1px);
            box-shadow:0 0 16px rgba(59,130,246,0.5); }
          .m7-nav-submit-question:disabled { opacity:0.45; cursor:not-allowed; }
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
          .m7-qlist-cell.submitted-correct { background:rgba(74,222,128,0.22); border-color:#4ade80; color:#86efac; }
          .m7-qlist-cell.submitted-wrong { background:rgba(248,113,113,0.22); border-color:#f87171; color:#fca5a5; }
          .m7-qlist-cell.drafted { background:rgba(250,204,21,0.18); border-color:#facc15; color:#fde047; }
          .m7-qlist-cell.current { box-shadow:0 0 0 2px var(--warn); }
          .m7-qlist-cell .m7-qlist-mark { position:absolute; top:-4px; right:-4px;
            font-size:0.85rem; line-height:1; }
          .m7-qlist-cell .m7-qlist-result { position:absolute; top:-2px; left:-2px;
            font-size:0.95rem; line-height:1; font-weight:900; }
          .m7-qlist-legend { margin-top:10px; padding-top:10px; border-top:1px solid var(--border);
            font-size:0.75rem; color:var(--fg-dim); display:flex; gap:14px; flex-wrap:wrap; }
        </style>
      `;
    },

    // 把已答過 / 已選 / 已送出的題目視覺狀態還原(navigate back / jump 用)
    // 僅對標準選項題型有意義(confusion-matrix 題型有自己的狀態管理,跳過)
    // 2026-05-16 強化:locked 題 disable 選項 + 顯示「🔒 已送出」中性提示
    _showPreviousAnswerState(prevAnswer) {
      const opts = document.querySelectorAll('#play-options .option-btn');
      if (opts.length === 0) return;
      const idx = this.state.idx;
      const isLocked = this.state.locked.has(idx);
      const draft = this.state.draft[idx];
      // 已送出:取 answers.userKey;否則取 draft.userKey
      const selectedKey = isLocked ? (prevAnswer && prevAnswer.userKey) :
                          (draft && draft.userKey) || (prevAnswer && prevAnswer.userKey);
      opts.forEach(b => {
        if (b.dataset.key === selectedKey) {
          b.style.background = 'var(--bg-2)';
          b.style.borderColor = 'var(--primary)';
        }
        if (isLocked) {
          b.disabled = true;
          b.style.cursor = 'not-allowed';
          b.style.opacity = '0.7';
        }
      });
      // 已送出題:顯示鎖定中性訊息(不洩漏對錯)
      if (isLocked) this._renderLockedFeedback();
      else if (draft && draft.userKey) this._renderNeutralDraftFeedback(draft.userKey);
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
      const hasDraft = !!(this.state.draft[idx] && this.state.draft[idx].userKey);
      const isLocked = this.state.locked.has(idx);
      const submitText = isLocked ? '🔒 已送出' : (hasDraft ? '📤 送出本題' : '📤 送出本題(先選答案)');
      const submitDisabled = (isLocked || !hasDraft) ? 'disabled' : '';
      const examBtn = isLast
        ? `<button class="m7-nav-submit" onclick="Mode7.submitMock()">📤 交卷</button>`
        : `<button class="m7-nav-next" onclick="Mode7.navigateNext()">下一題 →</button>`;

      const nav = document.createElement('div');
      nav.className = 'm7-nav-bar';
      nav.innerHTML = `
        <button class="m7-nav-prev" onclick="Mode7.navigatePrev()" ${prevDisabled}>← 上一題</button>
        <button class="m7-nav-submit-question" onclick="Mode7.submitCurrent()" ${submitDisabled}>${submitText}</button>
        <span class="m7-nav-info">${idx + 1} / ${total}</span>
        ${examBtn}
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
      // 統計三類:已送出 / 已選但未送出(草稿) / 完全未答
      const submitted = [];
      const drafted = [];
      const unanswered = [];
      for (let i = 0; i < this.state.total; i++) {
        if (this.state.locked.has(i)) submitted.push(i + 1);
        else if (this.state.draft[i] && this.state.draft[i].userKey) drafted.push(i + 1);
        else unanswered.push(i + 1);
      }
      let msg = `確定交卷?\n• 已送出 ${submitted.length}/${this.state.total} 題`;
      if (drafted.length > 0) {
        msg += `\n• 已選未送出:${drafted.slice(0, 10).join(', ')}${drafted.length > 10 ? '...' : ''}`;
        msg += `\n  → 交卷時將自動以草稿選擇送出計分`;
      }
      if (unanswered.length > 0) {
        msg += `\n• 完全未答:${unanswered.slice(0, 10).join(', ')}${unanswered.length > 10 ? '...' : ''}(視為答錯)`;
      }
      if (!confirm(msg)) return;
      // 自動把所有 draft 升格為 answers(交卷時送出剩餘草稿)
      // _autoLockDrafts 內已含 _recomputeStats(避免兩條路徑分歧)
      this._autoLockDrafts();
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
      // 案例 10 LOW-5:統一用 _getRendered helper(原本直用 PlayEngine.current,改為同條 fallback 鏈)
      const rendered = this._getRendered(item) || item.q;
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
        const ans = this.state.answers[i];
        const isLocked = this.state.locked.has(i);
        const draft = this.state.draft[i];
        const isMarked = this.state.markedIds.has(qid);
        const isCurrent = i === this.state.idx;
        const classes = ['m7-qlist-cell'];
        // 已送出且答對:綠 ✓;已送出且答錯:紅 ✗;已選未送出:黃;未答:灰
        let icon = '';
        let titleSuffix = '';
        if (isLocked && ans) {
          if (ans.isCorrect) { classes.push('submitted-correct'); icon = '✓'; titleSuffix = ' (已送出 · 答對)'; }
          else { classes.push('submitted-wrong'); icon = '✗'; titleSuffix = ' (已送出 · 答錯)'; }
        } else if (draft && draft.userKey) {
          classes.push('drafted');
          titleSuffix = ` (已選 ${draft.userKey} · 未送出)`;
        }
        if (isCurrent) classes.push('current');
        cells.push(`<button class="${classes.join(' ')}" onclick="Mode7.jumpToQuestion(${i})"
          title="第 ${i + 1} 題${titleSuffix}${isMarked ? ' 🔖' : ''}">
          ${i + 1}${icon ? `<span class="m7-qlist-result">${icon}</span>` : ''}${isMarked ? '<span class="m7-qlist-mark">🔖</span>' : ''}
        </button>`);
      }
      const submitted = this.state.locked.size;
      const drafted = Object.keys(this.state.draft).filter(k => this.state.draft[k]).length;
      const marked = this.state.markedIds.size;

      backdrop.innerHTML = `
        <div class="m7-qlist-modal">
          <div class="m7-qlist-header">
            <div class="m7-qlist-title">📋 題目列表 (${submitted}/${this.state.total} 已送出 · ${drafted} 草稿 · ${marked} 標記)</div>
            <button class="m7-qlist-close" onclick="Mode7.closeQuestionList()">✕</button>
          </div>
          <div class="m7-qlist-grid">${cells.join('')}</div>
          <div class="m7-qlist-legend">
            <span style="color:#4ade80">■ ✓ 已送出答對</span>
            <span style="color:#f87171">■ ✗ 已送出答錯</span>
            <span style="color:#facc15">■ 已選未送出</span>
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
      // 2026-05-16 強化作弊防護重寫:
      // - 點選項 = 進 state.draft(草稿),NOT state.answers(已送出)
      // - 不立即顯示 ✓/✗、不閃光、不寫共用層、不自動跳題
      // - 已 locked 的題:選項 disabled,點擊無效
      // - 真正的『送出』在 submitCurrent() 才把 draft 升格成 answers + 鎖定 + 跳下一題
      PlayEngine.answer = function (key) {
        // case 11 (2026-05-17 P0):結算後若被 DrillSession.next wrap 抓到當 origAnswer,
        // 不能 silent return — 要 delegate 給原生 answer,讓下鑽 click 能正常觸發。
        // 救生索優先序:__nativeAnswer(永遠原生)> _origAnswer(本 hook 安裝前的版本)
        if (!self.state || self.state.finished) {
          if (PlayEngine.__nativeAnswer) return PlayEngine.__nativeAnswer.call(this, key);
          if (self._origAnswer) return self._origAnswer(key);
          return;
        }
        const idx = self.state.idx;
        // 鎖定後不能改
        if (self.state.locked.has(idx)) {
          if (typeof showToast === 'function') showToast('此題已送出,無法修改', 1800);
          return;
        }
        const opt = this.current.options.find(o => o.key === key);
        if (!opt) return;

        // 草稿選擇:只記 userKey,不算 isCorrect 也不寫 answers
        self.state.draft[idx] = { userKey: key };

        // 視覺:選中該選項(淺色框)+ 還原其他選項
        document.querySelectorAll('#play-options .option-btn').forEach(b => {
          if (b.dataset.key === key) {
            b.style.background = 'var(--bg-2)';
            b.style.borderColor = 'var(--primary)';
          } else {
            b.style.background = '';
            b.style.borderColor = '';
          }
        });

        // 記錄用時(僅首次「選擇」記錄)
        if (typeof self.state.perQuestionTime[idx] === 'undefined') {
          self.state.perQuestionTime[idx] = Date.now() - self.state.questionStartTs;
        }

        // NPC 對話:中性提示「已選 X,請按送出」(不洩漏對錯)
        self._renderNeutralDraftFeedback(key);

        // 更新送出按鈕 enabled 狀態
        self._refreshSubmitButton();
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
      // 2026-05-16 作弊防護重寫:此函式不再在答題時被呼叫,改為結算頁/locked 後使用
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

    // 草稿選擇後的中性 NPC 提示(不洩漏對錯)
    _renderNeutralDraftFeedback(key) {
      const dialogEl = document.querySelector('.m7-npc-line');
      if (dialogEl) {
        dialogEl.textContent = `📝 已選 ${key},請按「送出本題」鎖定答案`;
        dialogEl.style.color = 'var(--fg-dim)';
      }
    },

    // 2026-05-16:送出鎖定後立即顯示對錯 + 正解(學習模式 UX,反正鎖了就不能改答案)
    _renderLockedFeedback() {
      const dialogEl = document.querySelector('.m7-npc-line');
      if (!dialogEl) return;
      const idx = this.state.idx;
      const ans = this.state.answers[idx];
      if (!ans) {
        dialogEl.textContent = '🔒 本題已送出';
        dialogEl.style.color = '#facc15';
        return;
      }
      // 案例 10:用 _getRendered 取洗牌後 options(含 key)
      const item = this.state.lineup[idx] || {};
      const renderedQ = this._getRendered(item) || {};
      const correctOpt = (renderedQ.options || []).find(o => o.is_correct);
      const userOpt = (renderedQ.options || []).find(o => o.key === ans.userKey);
      // 2026-05-19 R1 simplify:改用 window.escHTML(原 3-char 殘缺版本升為 5-char 完整 escape)
      const esc = escHTML;
      const correctTxt = esc((correctOpt && correctOpt.text) || '');
      const userTxt = esc((userOpt && userOpt.text) || '');
      if (ans.isCorrect) {
        dialogEl.innerHTML = `<span style="color:#4ade80;font-weight:700">✅ 答對!</span> 正解 <strong>${esc(ans.correctKey)}. ${correctTxt}</strong>`;
        dialogEl.style.color = 'var(--fg)';
      } else {
        dialogEl.innerHTML = `<span style="color:#f87171;font-weight:700">❌ 答錯</span> · 你選 <span style="color:#f87171">${esc(ans.userKey)}. ${userTxt}</span><br>正解:<strong style="color:#4ade80">${esc(ans.correctKey)}. ${correctTxt}</strong>`;
        dialogEl.style.color = 'var(--fg)';
      }
    },

    // ===== 送出本題 =====
    submitCurrent() {
      if (!this.state || this.state.finished) return;
      const idx = this.state.idx;
      if (this.state.locked.has(idx)) return;  // 已送出,no-op
      const draft = this.state.draft[idx];
      if (!draft || !draft.userKey) {
        if (typeof showToast === 'function') showToast('請先選擇答案再送出', 1800);
        return;
      }
      // 升格 draft → answers + lock(案例 10:用 _getRendered 才有洗牌後 key)
      const item = this.state.lineup[idx];
      const renderedQ = this._getRendered(item);
      const rOpts = (renderedQ && renderedQ.options) || [];
      const opt = rOpts.find(o => o.key === draft.userKey);
      const isCorrect = !!(opt && opt.is_correct);
      const correctOpt = rOpts.find(o => o.is_correct);
      const correctKey = correctOpt ? correctOpt.key : '';
      this.state.answers[idx] = { userKey: draft.userKey, isCorrect, correctKey };
      this.state.locked.add(idx);
      // 移除 draft(已升格)
      delete this.state.draft[idx];
      // 重算 stats(顯示得分用,但 UI 不立即洩漏 isCorrect)
      this._recomputeStats();
      // UI:disabled options + locked dialog + 重畫送出按鈕
      this._renderLockedFeedback();
      this._lockOptionButtons();
      this._refreshSubmitButton();
      // 自動跳下一個未鎖定的題(學習模式 UX:延遲 1500ms 讓使用者看清楚對錯與正解)
      if (idx < this.state.total - 1) {
        setTimeout(() => {
          if (!this.state || this.state.finished) return;
          if (this.state.idx !== idx) return; // 已手動跳走
          this.state.idx = idx + 1;
          this._showCurrentQuestion();
        }, 1500);
      } else {
        if (typeof showToast === 'function') {
          showToast('✅ 已送出最後一題,可按「交卷」結算', 2500);
        }
      }
    },

    // 鎖定當前題選項按鈕(送出後 / navigate 進已鎖定題)
    // 2026-05-16:鎖定後上色 — 正解綠、使用者選的錯解紅、其他灰
    _lockOptionButtons() {
      const idx = this.state.idx;
      const ans = this.state.answers[idx];
      document.querySelectorAll('#play-options .option-btn').forEach(b => {
        b.disabled = true;
        b.style.cursor = 'not-allowed';
        if (!ans) { b.style.opacity = '0.7'; return; }
        const key = b.dataset.key || b.getAttribute('data-key');
        if (key === ans.correctKey) {
          b.classList.add('correct');
          b.style.opacity = '1';
        } else if (key === ans.userKey && !ans.isCorrect) {
          b.classList.add('wrong');
          b.style.opacity = '0.95';
        } else {
          b.style.opacity = '0.5';
        }
      });
    },

    // 重畫送出按鈕 enabled / disabled
    _refreshSubmitButton() {
      const btn = document.querySelector('.m7-nav-submit-question');
      if (!btn) return;
      const idx = this.state.idx;
      const hasDraft = !!(this.state.draft[idx] && this.state.draft[idx].userKey);
      const isLocked = this.state.locked.has(idx);
      btn.disabled = isLocked || !hasDraft;
      if (isLocked) btn.textContent = '🔒 已送出';
      else if (hasDraft) btn.textContent = '📤 送出本題';
      else btn.textContent = '📤 送出本題(先選答案)';
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
      // 2026-05-19:結算後不再算「考試中」(寬鬆 — 結算頁可自由跳首頁)
      if (typeof _setExamMode === 'function') _setExamMode(false);
      this._stopTimer();
      // 還原 PlayEngine
      this._restorePlayEngine();

      // 2026-05-19 §8 H2 修補:_saveHistory 內會跑 renderQuestion 補所有 item._rendered,
      // 但 _commitToSharedLayer 在它之前呼叫 → 未 cache 題的 Wrongbook 寫入可能用空 key。
      // 修補:把 _saveHistory 的 render-cache pre-pass 提前(以下 loop),
      // 確保 _commitToSharedLayer 拿到的 _getRendered 永遠有 key。
      const s = this.state;
      if (s && Array.isArray(s.lineup) && typeof renderQuestion === 'function') {
        s.lineup.forEach(item => {
          if (item && item.q && !item._rendered) {
            try { item._rendered = renderQuestion(item.q); } catch (_) {}
          }
        });
      }

      // 2026-05-16 lenient 改造:答題期間 hook 不寫共用層,交卷時統一寫最終 answers
      // 這支持「首答錯 → 重答對 → 算對」的真考一致性
      this._commitToSharedLayer();

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
      // 2026-05-16 加 fullLog:整場每題的 qid + 玩家答案 + 正解,讓未來可逐題回顧
      const s = this.state;
      const fullLog = (s.lineup || []).map((item, i) => {
        const q = item.q;
        const a = s.answers[i];  // {userKey, isCorrect, correctKey} or undefined
        // 案例 10:用 _getRendered 取洗牌後 options(含 key)+ 替換後 stem/code
        // PR A review 補:若使用者跳題未進過 _showCurrentQuestion(_rendered 未 cache),
        // 主動跑一次 renderQuestion 取得帶 key 的 snapshot,避免 fullLog 存 key:undefined
        if (!item._rendered && typeof renderQuestion === 'function') {
          try { item._rendered = renderQuestion(q); } catch (_) {}
        }
        const renderedQ = this._getRendered(item) || q;
        const correctOpt = (renderedQ.options || []).find(o => o.is_correct);
        return {
          qid: q.id,
          npcIdx: item.npcIdx,
          kc: q.knowledge_code || '',
          userKey: a ? a.userKey : '',
          isCorrect: a ? a.isCorrect : false,
          correctKey: a ? a.correctKey : (correctOpt ? correctOpt.key : ''),
          answered: !!a,
          marked: s.markedIds && s.markedIds.has(q.id),
          // rendered snapshot — 洗牌後實際看到的版本(歷史回顧時用)
          stem: renderedQ.stem || q.stem || '',
          code_block: renderedQ.code_block || q.code_block || '',
          options: (renderedQ.options || []).map(o => ({
            key: o.key, text: o.text || '', is_correct: !!o.is_correct
          }))
        };
      });
      data.history.push({
        ts: Date.now(),
        // 2026-05-17 §8 follow-up:卡牌模擬考(Mode 6)發起的場次,寫入 source/sourceLabel 區隔
        // 讓 _renderHistory 能顯示「🃏 卡牌:科三-已解鎖」而非原始字串 "codex"
        source: this.state.source || 'mode7',
        sourceLabel: this.state.sourceLabel || null,
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
        topWrong: result.topWrong.map(w => w.qid),
        fullLog
      });
      // 2026-05-17 F-007:rolling cap 50 → 10。原註 3KB/場 是 fullLog 加入前的舊估算;
      // PR #21 加 fullLog(stem + code_block + options.text × 60 題)後實測 ~50KB/場,
      // 50 場可達 2.5MB,逼近 5MB localStorage 容量上限。降到 N=10 ≈ 500KB,留足安全餘裕。
      if (data.history.length > 10) data.history = data.history.slice(-10);
      Storage.set(STORAGE_KEY, data);
    },

    _renderResult(result, reason) {
      const overallPct = result.total > 0 ? Math.round(result.correct / result.total * 100) : 0;
      const wrongCount = result.total - result.correct - (result.unanswered || 0);
      const isHigh = result.estLevel === '高';
      const isMid = result.estLevel === '中';
      // 等級配色:高=綠系 / 中=琥珀系 / 低=赤紅系(對比強烈)
      const lvlColor = isHigh ? '#4ade80' : isMid ? '#facc15' : '#f87171';
      const lvlColorDark = isHigh ? '#166534' : isMid ? '#854d0e' : '#7f1d1d';
      const lvlEmoji = isHigh ? '🥇' : isMid ? '🥈' : '🥉';
      const lvlLabel = isHigh ? '高分通過候選' : isMid ? '及格邊緣' : '需加強練習';
      const lvlHintText = isHigh ? '≥80% 真考有機會通過' : isMid ? '60-79% 接近及格邊緣' : '<60% 需要加強練習';
      // Hero 漸層:依等級切換深底色(深紫紅 / 深琥珀 / 深綠暗黑)
      const heroBg = isHigh
        ? 'radial-gradient(circle at 30% 0%, #064e3b 0%, #022c22 60%, #021711 100%)'
        : isMid
          ? 'radial-gradient(circle at 30% 0%, #78350f 0%, #451a03 60%, #1c0a01 100%)'
          : 'radial-gradient(circle at 30% 0%, #7f1d1d 0%, #450a0a 60%, #1a0404 100%)';
      const reasonText = reason === 'time_up' ? '⏰ 時間到自動交卷' :
                         reason === 'surrender' ? '🏳️ 投降結束' :
                         reason === 'submit' ? '📤 已交卷' :
                         '✅ 全部完成';

      // 儲存結算用的 lineup(供 _renderAllExplanations + reviewMode 使用)
      this._lastResultLineup = result.lineup || [];
      this._lastResult = result;
      this._lastResultReason = reason;

      // 用時格式化
      const totalMin = Math.floor(result.timeUsed / 60);
      const totalSec = result.timeUsed % 60;
      const timeStr = `${totalMin}m ${totalSec}s`;
      // Pace 統計:平均 / 最長
      const ptimes = (result.perQuestionTime || []).filter(t => typeof t === 'number');
      const avgSec = ptimes.length ? Math.round(ptimes.reduce((a, b) => a + b, 0) / ptimes.length / 1000) : 0;
      const maxSec = ptimes.length ? Math.round(Math.max(...ptimes) / 1000) : 0;
      const slowCount = ptimes.filter(t => t > 90000).length;

      // Pace Heatmap
      const heatmap = this._buildHeatmapHTML(result);

      // === KPI 卡片 ===
      const kpi = (icon, label, value, accent, sub) => `
        <div style="flex:1;min-width:130px;background:var(--bg-2);border:1px solid var(--border);border-left:4px solid ${accent};border-radius:var(--radius-sm);padding:12px 14px">
          <div style="font-size:0.72rem;color:var(--fg-dim);font-weight:700;letter-spacing:0.05em;text-transform:uppercase">${icon} ${label}</div>
          <div style="font-size:1.7rem;font-weight:900;color:${accent};margin-top:4px;line-height:1.1">${value}</div>
          ${sub ? `<div style="font-size:0.72rem;color:var(--fg-mute);margin-top:2px">${sub}</div>` : ''}
        </div>`;
      const kpiRow = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
          ${kpi('✅', '正確', `${result.correct}`, '#4ade80', `共 ${result.total} 題`)}
          ${kpi('❌', '錯題', `${wrongCount}`, '#f87171', result.unanswered > 0 ? `+${result.unanswered} 未答` : '全題作答')}
          ${kpi('⏱️', '總用時', timeStr, '#38bdf8', avgSec ? `平均 ${avgSec}s/題` : '—')}
          ${kpi(lvlEmoji, '預估等級', result.estLevel, lvlColor, lvlLabel)}
        </div>`;

      // === 分科目得分(progress bar)===
      const catRow = (code, data) => {
        const label = code === 'L21' ? '科一 · L21' : code === 'L22' ? '科二 · L22' : code === 'L23' ? '科三 · L23' : '其他 / 邊界';
        const pct = data.total > 0 ? Math.round(data.correct / data.total * 100) : 0;
        const color = pct >= 80 ? '#4ade80' : pct >= 60 ? '#facc15' : data.total > 0 ? '#f87171' : '#475569';
        const muted = data.total === 0;
        return `<div style="margin:10px 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
            <strong style="font-size:0.9rem;color:${muted ? 'var(--fg-mute)' : 'var(--fg)'}">${label}</strong>
            <span style="font-size:0.85rem;color:${color};font-weight:800">${data.correct}/${data.total}${data.total > 0 ? ` · ${pct}%` : ''}</span>
          </div>
          <div class="hp-track" style="height:10px;background:var(--bg-3)">
            <div class="hp-fill" style="background:linear-gradient(90deg,${color},${color}cc);width:${pct}%"></div>
          </div>
        </div>`;
      };
      const catBlock = `
        <div style="margin-top:8px">
          ${['L21', 'L22', 'L23', 'other'].map(c => catRow(c, result.byCategory[c])).join('')}
        </div>`;

      // === Top 5 錯題卡片 ===
      const topWrongBlock = result.topWrong.length === 0 ? `
        <div style="text-align:center;color:var(--success);padding:18px;background:rgba(74,222,128,0.08);border-radius:var(--radius-sm);border:1px dashed var(--success)">
          🎉 沒有錯題,完美演出!
        </div>` : `
        <div class="weak-list" style="margin-top:8px">
          ${result.topWrong.map((w, i) => {
            const stem = (w.q.stem || '').substring(0, 80).replace(/\{[^}]+\}/g, '');
            const npc = NPCS[w.npcIdx] || NPCS[0];
            const tsec = Math.round((w.timeUsed || 0) / 1000);
            const isSlow = tsec >= 90;
            return `<div class="weak-item" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px;background:var(--bg-3);border:1px solid var(--border);border-left:4px solid #f87171">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                <span style="font-size:0.78rem;color:var(--fg-dim);font-weight:600">
                  <span style="background:#f87171;color:#fff;padding:1px 7px;border-radius:9px;font-weight:800;margin-right:6px">#${i+1}</span>
                  ${npc.avatar} ${this._esc(npc.name || '')} · ${this._esc(w.q.knowledge_code || '')}
                </span>
                <span class="badge" style="background:${isSlow ? 'rgba(248,113,113,0.2)' : 'var(--bg-2)'};color:${isSlow ? '#fca5a5' : 'var(--fg-dim)'};font-weight:700">
                  ⏱️ ${tsec}s${isSlow ? ' · 卡題' : ''}
                </span>
              </div>
              <div style="font-size:0.9rem;color:var(--fg);line-height:1.55">${this._esc(stem)}…</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-warn" style="font-size:0.8rem;padding:6px 14px"
                  onclick="Mode7.drillWrong('${w.qid}')">🎯 進下鑽</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;

      // === 標記題清單(UX #2)===
      const markedBlock = (result.markedQids && result.markedQids.length > 0) ? `
        <div class="card">
          <h2>🔖 已標記的題目 <span style="font-size:0.85rem;color:var(--fg-dim);font-weight:normal">(${result.markedQids.length} 題)</span></h2>
          <p style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:8px">
            這些是你模考中主動標記的題目,建議回頭複習
          </p>
          <div class="weak-list" style="margin-top:8px">
            ${result.markedQids.map((qid, i) => {
              const allQ = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);
              const q = allQ.find(x => x.id === qid);
              if (!q) return '';
              const stem = (q.stem || '').substring(0, 80).replace(/\{[^}]+\}/g, '');
              return `<div class="weak-item" style="flex-direction:column;align-items:stretch;gap:6px;padding:10px;border-left:4px solid #facc15">
                <div style="font-size:0.78rem;color:var(--fg-dim)">🔖 #${i+1} · ${this._esc(q.knowledge_code || '')}</div>
                <div style="font-size:0.88rem;color:var(--fg);line-height:1.55">${this._esc(stem)}…</div>
              </div>`;
            }).join('')}
          </div>
        </div>` : '';

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="m7-mock-view">

        <!-- HERO:大標題 + 等級徽章 + 大字正確率 -->
        <div class="card" style="background:${heroBg};border:1px solid ${lvlColorDark};box-shadow:0 0 40px ${lvlColor}33,0 4px 20px rgba(0,0,0,0.5);overflow:hidden;position:relative">
          <div style="position:absolute;top:0;right:0;width:240px;height:240px;background:radial-gradient(circle, ${lvlColor}22 0%, transparent 70%);pointer-events:none"></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;position:relative">
            <div>
              <div style="font-size:0.78rem;color:#fef3c7cc;letter-spacing:0.15em;font-weight:700;text-transform:uppercase">🎬 Mode 7 · 模考結算</div>
              <h1 style="color:#fef3c7;font-size:1.6rem;margin-top:4px">${reasonText}</h1>
            </div>
            <div style="background:${lvlColor};color:${lvlColorDark};padding:6px 14px;border-radius:999px;font-weight:900;font-size:0.95rem;box-shadow:0 0 18px ${lvlColor}66">
              ${lvlEmoji} ${result.estLevel} 級
            </div>
          </div>

          <div style="text-align:center;margin:22px 0 12px;position:relative">
            <div style="font-size:5rem;font-weight:900;color:${lvlColor};text-shadow:0 0 30px ${lvlColor}88;line-height:1;letter-spacing:-0.03em">
              ${overallPct}<span style="font-size:2.2rem;margin-left:2px">%</span>
            </div>
            <div style="font-size:1.1rem;color:#fef3c7;margin-top:8px;font-weight:600">
              ${result.correct} / ${result.total} 題答對
              ${result.unanswered > 0 ? `<span style="color:#fde68a99"> · ${result.unanswered} 題未答</span>` : ''}
            </div>
            <div style="font-size:0.85rem;color:${lvlColor};margin-top:6px;font-weight:700;opacity:0.9">
              ${lvlHintText}
            </div>
          </div>

          <!-- 大型橫條:正確率視覺條 -->
          <div style="background:rgba(0,0,0,0.5);height:14px;border-radius:7px;overflow:hidden;margin-top:8px;border:1px solid rgba(255,255,255,0.08)">
            <div style="height:100%;width:${overallPct}%;background:linear-gradient(90deg,${lvlColor},${lvlColor}aa);box-shadow:0 0 12px ${lvlColor};transition:width 1s cubic-bezier(.4,0,.2,1)"></div>
          </div>
        </div>

        <!-- KPI 卡片區 -->
        <div class="card" style="padding:14px 16px">
          <div style="font-size:0.85rem;color:var(--fg-dim);font-weight:700">📈 關鍵指標</div>
          ${kpiRow}
        </div>

        <!-- 分科目得分(progress bar)-->
        <div class="card">
          <h2>📊 分科目得分細目</h2>
          <p style="font-size:0.82rem;color:var(--fg-dim);margin-bottom:6px">綠 ≥80% · 黃 60-79% · 紅 <60%</p>
          ${catBlock}
        </div>

        <!-- Pace Heatmap -->
        <div class="card">
          <h2>🌡️ Pace Heatmap(每題用時)</h2>
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.82rem;color:var(--fg-dim);margin-bottom:10px;align-items:center">
            <span><span style="display:inline-block;width:12px;height:12px;background:#4ade80;border-radius:2px;vertical-align:middle"></span> ≤60s 穩</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:#facc15;border-radius:2px;vertical-align:middle"></span> 60-90s 尚可</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:#f87171;border-radius:2px;vertical-align:middle"></span> ≥90s 卡題</span>
            ${avgSec > 0 ? `<span style="margin-left:auto;color:var(--fg)"><strong>平均 ${avgSec}s</strong> · 最長 ${maxSec}s · 卡題 ${slowCount} 題</span>` : ''}
          </div>
          ${heatmap}
        </div>

        <!-- Top 5 錯題 -->
        <div class="card">
          <h2>🎯 Top 5 卡題錯題</h2>
          <p style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:8px">
            用時最長且答錯的題目 — 進下鑽針對性訓練(鐵律 #1)
          </p>
          ${topWrongBlock}
        </div>

        ${markedBlock}

        <!-- ACTION BAR(顯眼漸層主 CTA)-->
        <div class="card" style="background:linear-gradient(180deg,var(--bg-2),var(--bg-3));border:1px solid var(--primary);box-shadow:0 0 24px rgba(56,189,248,0.18)">
          <p style="font-size:0.88rem;color:var(--fg);margin-bottom:12px;text-align:center;line-height:1.6">
            💡 建議先 <strong style="color:var(--primary)">逐題回顧</strong> 確認每題都看過(可加入錯題本),再離開模考
          </p>
          <div class="actions" style="justify-content:center;flex-wrap:wrap;gap:10px">
            <button class="btn btn-primary" onclick="Mode7.startReview()"
              style="background:linear-gradient(135deg,#38bdf8,#0284c7);color:#fff;font-size:1rem;padding:12px 22px;box-shadow:0 4px 14px rgba(56,189,248,0.4);border:none">
              📚 逐題回顧
              <span id="m7-review-progress-badge" style="font-size:0.82rem;opacity:0.9;margin-left:4px">(${this.state && this.state.reviewedSet ? this.state.reviewedSet.size : 0}/${result.total} 已看)</span>
            </button>
            <button class="btn btn-warn" onclick="Mode7.drillAllWrong()" ${result.topWrong.length === 0 ? 'disabled' : ''}>🎯 全部錯題下鑽</button>
            <button class="btn btn-ghost" onclick="Mode7.expandAllExplanations()">📖 展開所有解析</button>
            <button class="btn btn-ghost" onclick="Mode7.start()">🔁 再來一場</button>
            <button class="btn btn-ghost" onclick="Mode7._confirmExitFromResult()">🏠 回首頁</button>
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

    // ===== 2026-05-16 結算後逐題回顧 mode =====
    // 需求:考完可進 review 模式逐題確認,每題可手動加入錯題本,看完才能離開
    startReview() {
      if (!this.state || !this._lastResultLineup) return;
      this.state.reviewMode = true;
      this.state.reviewIdx = 0;
      // 已看過的不重置(支持回首頁前的多次進出)
      if (!this.state.reviewedSet) this.state.reviewedSet = new Set();
      this._renderReviewQuestion(0);
    },

    _renderReviewQuestion(idx) {
      const lineup = this._lastResultLineup || [];
      const total = lineup.length;
      if (total === 0) { showToast('無題目可回顧', 1500); return; }
      idx = Math.max(0, Math.min(total - 1, idx));
      this.state.reviewIdx = idx;
      this.state.reviewedSet.add(idx);

      const item = lineup[idx];
      // 案例 10:結算後即時 review 需用 _getRendered 才有洗牌後 key;歷史回顧的
      // lineup 已用 fullLog snapshot 重建(item.q 已含 key),fallback 也對齊
      const q = this._getRendered(item) || item.q;
      const npc = NPCS[item.npcIdx] || NPCS[0];
      const userAns = this.state.answers[idx];                // {userKey, isCorrect, correctKey} or undefined
      const correctOpt = (q.options || []).find(o => o.is_correct);
      const correctKey = correctOpt ? correctOpt.key : '';
      const userKey = userAns ? userAns.userKey : '';
      const isCorrect = userAns ? userAns.isCorrect : false;
      const unanswered = !userAns;

      // 狀態 badge
      let statusBadge;
      if (unanswered) statusBadge = '<span style="background:#475569;color:#fff;padding:3px 10px;border-radius:4px;font-size:0.8rem">⊘ 未答</span>';
      else if (isCorrect) statusBadge = '<span style="background:#16a34a;color:#fff;padding:3px 10px;border-radius:4px;font-size:0.8rem">✓ 答對</span>';
      else statusBadge = '<span style="background:#dc2626;color:#fff;padding:3px 10px;border-radius:4px;font-size:0.8rem">✗ 答錯</span>';

      // 選項列(高亮使用者選的 + 正解)
      const optsHtml = (q.options || []).map(o => {
        const isUser = o.key === userKey;
        const isAns = !!o.is_correct;
        let bg = 'rgba(255,255,255,0.04)', border = '1px solid var(--bg-3)', tag = '';
        if (isAns && isUser) { bg = 'rgba(22,163,74,0.18)'; border = '2px solid #16a34a'; tag = '<span style="color:#16a34a;font-weight:700;margin-left:8px">✓ 你選的 = 正解</span>'; }
        else if (isAns) { bg = 'rgba(22,163,74,0.12)'; border = '2px solid #16a34a'; tag = '<span style="color:#16a34a;font-weight:700;margin-left:8px">✓ 正解</span>'; }
        else if (isUser) { bg = 'rgba(220,38,38,0.14)'; border = '2px solid #dc2626'; tag = '<span style="color:#f87171;font-weight:700;margin-left:8px">✗ 你選的</span>'; }
        return `<div style="padding:8px 12px;margin:4px 0;background:${bg};border:${border};border-radius:6px;font-size:0.95rem">
          <strong>${this._esc(o.key || '')}.</strong> ${this._esc(o.text || '')}${tag}
        </div>`;
      }).join('');

      // explanation
      // 案例 10 LOW-2 補完:explanation 來自 fullLog 也屬可污染面,inject 前 escape
      const explCorrect = this._esc((q.explanation && q.explanation.correct) || '(此題未提供詳細解釋)');
      const hook = this._esc((q.explanation && q.explanation.hook) || '');
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
        // 案例 10 LOW-2 補完:trap_type / exp / o.text 全 escape(fullLog 匯入污染面)
        if (!exp) exp = o.trap_type ? `陷阱類型:${this._esc(o.trap_type)}` : '此選項不正確';
        else exp = this._esc(exp);
        return `<div style="padding:6px 10px;margin:4px 0;background:rgba(255,255,255,0.04);border-radius:4px;border-left:3px solid #94a3b8">
          <div style="color:#cbd5e1;font-weight:600;font-size:0.85rem">${this._esc(o.key || '')}. ${this._esc(o.text || '')}</div>
          <div style="color:var(--fg-dim);font-size:0.8rem;margin-top:2px">└ ${exp}</div>
        </div>`;
      }).join('');

      // 錯題本狀態
      const wbList = Wrongbook.load();
      const wbEntry = wbList.find(x => x.qid === q.id && !x.mastered);
      const wbBtn = wbEntry
        ? `<button class="btn btn-ghost" onclick="Mode7.toggleWrongbookFromReview('${q.id}')" style="background:rgba(250,204,21,0.15);border:1px solid #facc15;color:#facc15">✅ 已在錯題本(點此移出)</button>`
        : `<button class="btn btn-warn" onclick="Mode7.toggleWrongbookFromReview('${q.id}')">🔖 加入錯題本</button>`;

      // 進度
      const reviewed = this.state.reviewedSet.size;
      const progPct = total > 0 ? Math.round(reviewed / total * 100) : 0;

      // code_block(若有)
      // 2026-05-19 R1 simplify:改用 window.escHTML(集中 helper)
      const codeBlock = q.code_block
        ? `<pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;font-size:0.85rem;overflow-x:auto;margin:8px 0"><code>${escHTML(q.code_block)}</code></pre>`
        : '';

      const isHistoryMode = !!(this.state && this.state._historyMode);
      const isLegacyData = !!(this.state && this.state._legacyData);
      const modeLabel = isHistoryMode ? '📜 歷史模考逐題回顧' : '📚 逐題回顧';
      const exitBtnLabel = isHistoryMode ? '📋 回考古題首頁' : '📋 回結算頁';
      // 2026-05-16 fix:舊紀錄沒存洗牌後 options 與 keys,無法重建「你選的紅框」
      // 2026-05-17 強化:案例 10 (PR #21) 修補前的壞紀錄不只「紅框失效」,連「結算分數」也是假的
      //   因為當時 isCorrect 永遠 false → state.correct = 0 → 顯示 0/N 假分數
      // 跳警告 banner 讓使用者清楚這是技術限制不是 bug
      const legacyWarning = isLegacyData
        ? `<div class="card" style="background:rgba(220,38,38,0.12);border:1px solid #dc2626;color:#fecaca;font-size:0.85rem;line-height:1.6">
            <strong style="color:#f87171">⚠️ 此場為 PR #21(2026-05-16 案例 10)修補前的壞紀錄</strong><br>
            當時 Mode 7 計分有 bug:即使你答對,系統也會把該題記成答錯。<br>
            <strong style="color:#fde68a">因此這場的:</strong><br>
            • 結算頁顯示的「0/${this._esc(String(total))}」分數是假的(實際正確數不可考)<br>
            • 逐題回顧的「✓ 答對 / ✗ 答錯」badge 跟「你選的紅框」都不準<br>
            <span style="color:#4ade80">建議從考古題首頁刪除此場 → 從新模考開始,計分與回顧會完全正確。</span>
          </div>`
        : '';

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="m7-mock-view">
          <div class="card" style="position:sticky;top:0;z-index:10;background:var(--bg-2);border-bottom:2px solid var(--accent)">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <div>
                <strong style="font-size:1.1rem">${modeLabel} — 第 ${idx + 1} / ${total} 題</strong>
                <span style="margin-left:10px">${statusBadge}</span>
              </div>
              <div style="font-size:0.85rem;color:var(--fg-dim)">
                已檢視 <strong style="color:var(--success)">${reviewed}</strong> / ${total}(${progPct}%)
              </div>
            </div>
            <div style="background:var(--bg-3);height:6px;border-radius:3px;margin-top:8px;overflow:hidden">
              <div style="background:linear-gradient(90deg,#16a34a,#facc15);height:100%;width:${progPct}%;transition:width 0.3s"></div>
            </div>
          </div>
          ${legacyWarning}

          <div class="card">
            <div style="font-size:0.8rem;color:var(--fg-dim);margin-bottom:6px">
              ${npc.avatar} ${this._esc(npc.name)} · ${this._esc(q.knowledge_code || '')} · ${this._esc(q.difficulty || '')}
            </div>
            <div style="font-size:1rem;line-height:1.6;margin-bottom:10px">${this._esc(q.stem || '')}</div>
            ${codeBlock}
            ${optsHtml}
          </div>

          <div class="card">
            <h3 style="color:#4ade80;margin-bottom:8px">📖 正解詳解</h3>
            <div style="font-size:0.9rem;line-height:1.6;color:var(--fg);padding:8px;background:rgba(22,163,74,0.08);border-left:3px solid #16a34a;border-radius:4px">${explCorrect}</div>
            ${hook ? `<div style="margin-top:8px;padding:8px;background:rgba(250,204,21,0.08);border-left:3px solid #facc15;border-radius:4px;font-size:0.85rem">💡 <strong>口訣 / Hook:</strong> ${hook}</div>` : ''}

            ${wrongAnalysis ? `<h4 style="margin-top:14px;color:#cbd5e1;font-size:0.95rem">其他選項陷阱分析</h4>${wrongAnalysis}` : ''}
          </div>

          <div class="card" style="position:sticky;bottom:0;z-index:10;background:var(--bg-2);border-top:2px solid var(--accent)">
            <div class="actions" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
              <button class="btn btn-ghost" onclick="Mode7.reviewPrev()" ${idx === 0 ? 'disabled' : ''}>⬅️ 上一題</button>
              ${wbBtn}
              <button class="btn btn-ghost" onclick="Mode7.exitReviewToResult()">${exitBtnLabel}</button>
              <button class="btn btn-primary" onclick="Mode7.reviewNext()" ${idx === total - 1 ? 'disabled' : ''}>下一題 ➡️</button>
            </div>
          </div>
        </div>
        ${this._renderMode7Styles()}
      `;
      this._applyFontScale(this._currentFontKey || this._loadFontScale());
      show('view-play');
      // 捲到頂
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    reviewPrev() {
      if (!this.state || !this.state.reviewMode) return;
      this._renderReviewQuestion(Math.max(0, this.state.reviewIdx - 1));
    },
    reviewNext() {
      if (!this.state || !this.state.reviewMode) return;
      const total = (this._lastResultLineup || []).length;
      this._renderReviewQuestion(Math.min(total - 1, this.state.reviewIdx + 1));
    },
    exitReviewToResult() {
      if (!this.state) return;
      // 歷史回顧 mode → 退回 setup 頁(該頁含歷史列表)
      if (this.state._historyMode) {
        this.cleanup();
        this.renderSetup();
        return;
      }
      this.state.reviewMode = false;
      // 重渲染結算頁(順便更新「已看」徽章)
      const result = this._lastResult;
      if (result) this._renderResult(result, this._lastResultReason || 'submit');
    },

    // ===== 完整逐題回顧過去任一場考古題模考 =====
    // 從 history[historyIdx].fullLog 重建 lineup + answers,重用 _renderReviewQuestion UI
    reviewHistorySession(historyIdx) {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !data.history || !data.history[historyIdx]) {
        showToast('找不到此場紀錄', 2000);
        return;
      }
      const h = data.history[historyIdx];
      const fullLog = h.fullLog;
      if (!Array.isArray(fullLog) || fullLog.length === 0) {
        showToast('此場為舊紀錄,無逐題回顧資料(新模考起會自動儲存)', 3000);
        return;
      }
      const allQ = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);
      const lineup = [];
      const answers = {};
      const markedIds = new Set();
      let anyLegacy = false;
      fullLog.forEach((e, i) => {
        const baseQ = allQ.find(x => x.id === e.qid);
        // 優先用 fullLog 儲存的洗牌後 options 與替換後 stem/code(才能正確對齊 userKey)
        const hasSnapshot = Array.isArray(e.options) && e.options.length > 0;
        // 2026-05-17 補完案例 10 偵測:options 雖存在但 key 為空 = PR #21 修補前的壞紀錄。
        //   原 anyLegacy 只看 !hasSnapshot,漏掉「有 text 沒 key」這種更隱蔽的壞資料。
        //   症狀:逐題回顧 option 前綴顯示「.」而非「A./B./C./D.」,「✗ 你選的」紅框永遠不出現。
        const keysBroken = hasSnapshot && e.options.some(o => !o.key || typeof o.key !== 'string' || !/^[A-Z]$/.test(o.key));
        if ((!hasSnapshot || keysBroken) && e.answered) anyLegacy = true;
        if (baseQ) {
          if (hasSnapshot) {
            // spread 原 q 取得 explanation/node_id/difficulty 等,以 snapshot 覆蓋 stem/code/options
            lineup.push({
              q: Object.assign({}, baseQ, {
                stem: e.stem || baseQ.stem,
                code_block: e.code_block || baseQ.code_block,
                options: e.options
              }),
              npcIdx: e.npcIdx || 0
            });
          } else {
            // 舊紀錄無 snapshot → 用原版 (使用者紅框可能對不上,但不會 crash)
            lineup.push({ q: baseQ, npcIdx: e.npcIdx || 0 });
          }
        } else {
          // 題目已從題庫移除 → 顯示 placeholder,讓使用者知道
          // 但若有 snapshot,仍用 snapshot 顯示
          lineup.push({
            q: hasSnapshot
              ? { id: e.qid, stem: e.stem || '(無題幹)', code_block: e.code_block || '', options: e.options, knowledge_code: e.kc || '', difficulty: '?', explanation: { correct: '⚠️ 此題已從題庫移除,只能看當時的選項。' } }
              : { id: e.qid, stem: '⚠️ 此題已從題庫移除,無法顯示題幹', options: [], knowledge_code: e.kc || '', difficulty: '?', explanation: { correct: '此題已不在當前題庫,無解析可看。' } },
            npcIdx: e.npcIdx || 0
          });
        }
        if (e.answered) {
          answers[i] = { userKey: e.userKey, isCorrect: e.isCorrect, correctKey: e.correctKey };
        }
        if (e.marked) markedIds.add(e.qid);
      });
      this._lastResultLineup = lineup;
      // 建合成 state(只填 review 流程需要的欄位,標記 _historyMode 讓退出走 setup 不走結算)
      this.state = {
        answers, lineup, total: lineup.length, correct: h.result.correct || 0, wrongs: [],
        markedIds, draft: {}, locked: new Set(),
        reviewMode: true, reviewIdx: 0, reviewedSet: new Set(),
        finished: true,
        _historyMode: true,
        _historyIdx: historyIdx,
        _legacyData: anyLegacy   // 2026-05-16 後新模考有 snapshot;之前舊紀錄沒有
      };
      this._renderReviewQuestion(0);
    },
    toggleWrongbookFromReview(qid) {
      const wbList = Wrongbook.load();
      const wbEntry = wbList.find(x => x.qid === qid && !x.mastered);
      if (wbEntry) {
        // 從錯題本移出 → mark mastered
        Wrongbook.markMastered(qid);
        showToast('已從錯題本移除', 1500);
      } else {
        // 加入錯題本(案例 10:用 _getRendered 取洗牌後 options 才有 key)
        const lineup = this._lastResultLineup || [];
        const idx = lineup.findIndex(it => it.q.id === qid);
        if (idx < 0) { showToast('找不到題目資料', 1500); return; }
        const item = lineup[idx];
        const q = item.q;  // q.id/node_id 從原版取
        const renderedQ = this._getRendered(item) || q;
        const userAns = this.state.answers[idx];
        const correctOpt = (renderedQ.options || []).find(o => o.is_correct);
        const correctKey = correctOpt ? correctOpt.key : '';
        const userKey = userAns ? userAns.userKey : '';
        const userOpt = (renderedQ.options || []).find(o => o.key === userKey);
        Wrongbook.add(
          q.id, q.node_id, userKey, correctKey,
          (userOpt && userOpt.text) || '',
          (correctOpt && correctOpt.text) || ''
        );
        showToast('🔖 已加入錯題本', 1500);
      }
      // 重渲染當前題(更新按鈕狀態)
      this._renderReviewQuestion(this.state.reviewIdx);
      // 同步首頁錯題數
      try { document.getElementById('stat-wrong').textContent = Wrongbook.count(); } catch (e) {}
    },

    // 從結算頁的「🏠 回首頁」呼叫 — 若還沒看完所有題目,警示
    _confirmExitFromResult() {
      const total = (this._lastResultLineup || []).length;
      const reviewed = this.state && this.state.reviewedSet ? this.state.reviewedSet.size : 0;
      if (total > 0 && reviewed < total) {
        const unreviewed = total - reviewed;
        if (!confirm(`你還有 ${unreviewed} 題未逐題回顧。\n\n離開後此次模考結果無法回到此頁。\n\n建議先點「📚 逐題回顧」把每題看過(可加入錯題本),再離開。\n\n仍要離開?`)) return;
      }
      goHome();
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
        // 案例 10:用 _getRendered 才有洗牌後 key + 替換 placeholder 後的 stem/options/code
        const q = this._getRendered(item) || item.q;
        const baseQ = item.q;   // explanation 從原版穩定取
        const correctOpt = (q.options || []).find(o => o.is_correct);
        // 案例 10 LOW-2 補完:correctLabel / explCorrect / hook escape
        const correctLabel = correctOpt
          ? `${this._esc(correctOpt.key || '')} ${this._esc(correctOpt.text || '')}`
          : '(未提供)';
        const explCorrect = this._esc((baseQ.explanation && baseQ.explanation.correct) || '(此題未提供詳細解釋)');
        const hook = this._esc((baseQ.explanation && baseQ.explanation.hook) || '');
        const npc = NPCS[item.npcIdx] || NPCS[0];
        // 顯示其他選項解析
        const wrongOpts = (q.options || []).filter(o => !o.is_correct);
        const wrongAnalysis = wrongOpts.map(o => {
          let exp = '';
          // explanation 從原版穩定取(case_a/b/c 不會洗牌)
          if (baseQ.explanation && baseQ.explanation.wrong && typeof baseQ.explanation.wrong === 'object') {
            exp = baseQ.explanation.wrong[o.text] || '';
            if (!exp) {
              for (const k of Object.keys(baseQ.explanation.wrong)) {
                if (k && (k.includes((o.text || '').substring(0, 8)) || (o.text || '').includes(k.substring(0, 8)))) {
                  exp = baseQ.explanation.wrong[k]; break;
                }
              }
            }
          }
          // 案例 10 LOW-2 補完:trap_type / exp / o.text 全 escape
          if (!exp) exp = o.trap_type ? `陷阱類型:${this._esc(o.trap_type)}` : '此選項不正確';
          else exp = this._esc(exp);
          return `<div style="padding:6px 10px;margin:4px 0;background:rgba(255,255,255,0.04);border-radius:4px;border-left:3px solid #94a3b8">
            <div style="color:#cbd5e1;font-weight:600;font-size:0.85rem">${this._esc(o.key || '')}. ${this._esc(o.text || '')}</div>
            <div style="color:var(--fg-dim);font-size:0.8rem;margin-top:2px">└ ${exp}</div>
          </div>`;
        }).join('');
        return `<div class="card" style="margin-top:8px">
          <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:6px">
            第 ${i + 1} 題 · ${npc.avatar} ${this._esc(npc.name)} · ${this._esc(q.knowledge_code || '')} · ${this._esc(q.difficulty || '')}
          </div>
          <div class="question-stem" style="font-size:1rem;margin-bottom:10px">${this._esc(q.stem || '')}</div>
          ${q.code_block ? `<pre class="code-syntax" style="font-size:0.8rem;padding:8px">${this._esc(q.code_block)}</pre>` : ''}
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

    // 2026-05-17:刪除單一 history entry(主要給 PR #21 修補前的壞紀錄用)
    //   - confirm 二次確認,避免誤刪
    //   - 從 history 陣列移除指定 index,寫回 storage
    //   - 呼叫 refreshHome → 重渲染考古題首頁(_renderHistory 會重抓最新)
    deleteHistoryEntry(historyIdx) {
      const data = Storage.get(STORAGE_KEY, null);
      if (!data || !Array.isArray(data.history) || !data.history[historyIdx]) {
        showToast('找不到此場紀錄(可能已刪除)', 2000);
        return;
      }
      const h = data.history[historyIdx];
      const date = new Date(h.ts);
      const ds = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
      const score = `${(h.result && h.result.correct) || 0}/${(h.result && h.result.total) || 0}`;
      if (typeof confirm === 'function' && !confirm(`確定刪除此場模考紀錄?\n\n時間:${ds}\n成績:${score}\n\n刪除後無法復原,但因為這是 PR #21 修補前的壞紀錄,分數本來就不準。`)) return;
      data.history.splice(historyIdx, 1);
      Storage.set(STORAGE_KEY, data);
      showToast(`✅ 已刪除 ${ds} 那場紀錄`, 2200);
      // 重渲染首頁(若使用者在 setup 頁就會看到 history 列表更新)
      if (typeof refreshHome === 'function') refreshHome();
      // 若使用者剛好在考古題 setup 頁的 history 區塊 → 重渲染該區塊
      // (簡單做法:呼叫 setup 重畫整頁)
      try { if (this.renderSetup) this.renderSetup(); } catch (_) {}
    },

    // ===== 清理(離場/重啟前都呼叫)=====
    cleanup() {
      // 2026-05-19:離場必清考試旗標(避免 goHome 又跳 confirm)
      if (typeof _setExamMode === 'function') _setExamMode(false);
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
