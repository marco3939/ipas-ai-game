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
      const recent = data.history.slice(-10).reverse();
      const allQ = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []);

      // scope label 對照
      const scopeLabel = (k) => ({
        all: '全主題', s1: '科一', s2: '科二', s3: '科三',
        wrongbook: '錯題本', weak: '弱點優先'
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
        const reviewAllBtn = hasFullLog
          ? `<button class="btn btn-primary" style="font-size:0.82rem;padding:6px 14px;margin-top:8px" onclick="event.stopPropagation();Mode7.reviewHistorySession(${realHistoryIdx})">📚 完整逐題回顧(${h.fullLog.length} 題)</button>`
          : `<span style="font-size:0.78rem;color:var(--fg-dim);display:inline-block;margin-top:8px">(舊紀錄無逐題資料,新模考起會自動儲存)</span>`;

        return `<details class="m7-history-card" style="background:var(--bg-2);border:1px solid var(--bg-3);border-radius:6px;padding:0;margin-bottom:8px">
          <summary style="cursor:pointer;padding:10px 14px;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;min-width:0">
              <span style="font-size:0.85rem;color:var(--fg-dim);font-family:monospace">${ds}</span>
              <span style="font-size:0.78rem;color:var(--fg-dim)">${scopeLabel(c.scope)} · ${diffLabel(c.difficulty)} · ${c.qcount || '?'}題</span>
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
            <div style="margin:14px 0 6px;font-size:0.9rem;color:#f87171;font-weight:700">🎯 Top 卡題錯題(${tw.length})</div>
            ${twHtml}
            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
              ${reviewAllBtn}
              ${drillAllBtn}
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
        const q = item.q;
        if (q.node_id) Mastery.update(q.node_id, a.isCorrect);
        Progress.addAnswer(a.isCorrect);
        if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, a.isCorrect, false);
        if (!a.isCorrect) {
          Wrongbook.add(q.id, q.node_id, a.userKey, a.correctKey);
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
      // 答題狀態(三種):locked(已送出)/ draft(已選未送)/ 未答
      const prevAnswer = this.state.answers[this.state.idx];
      const draft = this.state.draft[this.state.idx];
      const isLocked = this.state.locked.has(this.state.idx);
      let answeredHint = '';
      if (isLocked) {
        answeredHint = `<div class="m7-answered-hint" style="color:#facc15">🔒 本題已送出(${prevAnswer.userKey}),不可修改;結算後可看對錯</div>`;
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
      for (let i = 0; i < this.state.total; i++) {
        if (this.state.locked.has(i)) continue;
        const draft = this.state.draft[i];
        if (!draft || !draft.userKey) continue;
        const item = this.state.lineup[i];
        const q = item.q;
        const opt = (q.options || []).find(o => o.key === draft.userKey);
        const isCorrect = !!(opt && opt.is_correct);
        const correctOpt = (q.options || []).find(o => o.is_correct);
        const correctKey = correctOpt ? correctOpt.key : '';
        this.state.answers[i] = { userKey: draft.userKey, isCorrect, correctKey };
        this.state.locked.add(i);
      }
      this._recomputeStats();
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
        if (!self.state || self.state.finished) return;
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

    // 已送出後的中性 NPC 提示(不洩漏對錯,即使本題答對 / 答錯都顯示「已送出」)
    _renderLockedFeedback() {
      const dialogEl = document.querySelector('.m7-npc-line');
      if (dialogEl) {
        dialogEl.textContent = `🔒 本題已送出,結算後可看對錯`;
        dialogEl.style.color = '#facc15';
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
      // 升格 draft → answers + lock
      const item = this.state.lineup[idx];
      const q = item.q;
      const opt = (q.options || []).find(o => o.key === draft.userKey);
      const isCorrect = !!(opt && opt.is_correct);
      const correctOpt = (q.options || []).find(o => o.is_correct);
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
      // 自動跳下一個未鎖定的題(若沒有則 stay,讓使用者按交卷)
      if (idx < this.state.total - 1) {
        setTimeout(() => {
          if (!this.state || this.state.finished) return;
          if (this.state.idx !== idx) return; // 已手動跳走
          this.state.idx = idx + 1;
          this._showCurrentQuestion();
        }, 350);
      } else {
        if (typeof showToast === 'function') {
          showToast('✅ 已送出最後一題,可按「交卷」結算', 2500);
        }
      }
    },

    // 鎖定當前題選項按鈕(送出後 / navigate 進已鎖定題)
    _lockOptionButtons() {
      document.querySelectorAll('#play-options .option-btn').forEach(b => {
        b.disabled = true;
        b.style.cursor = 'not-allowed';
        b.style.opacity = '0.7';
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
      this._stopTimer();
      // 還原 PlayEngine
      this._restorePlayEngine();

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
        const correctOpt = (q.options || []).find(o => o.is_correct);
        return {
          qid: q.id,
          npcIdx: item.npcIdx,
          kc: q.knowledge_code || '',
          userKey: a ? a.userKey : '',
          isCorrect: a ? a.isCorrect : false,
          correctKey: a ? a.correctKey : (correctOpt ? correctOpt.key : ''),
          answered: !!a,
          marked: s.markedIds && s.markedIds.has(q.id)
        };
      });
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
        topWrong: result.topWrong.map(w => w.qid),
        fullLog
      });
      // 保留最近 50 場(每場 60 題 × ~50B ≈ 3KB,50 場 ≈ 150KB,localStorage 容量無虞)
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

      // 儲存結算用的 lineup(供 _renderAllExplanations + reviewMode 使用)
      this._lastResultLineup = result.lineup || [];
      this._lastResult = result;
      this._lastResultReason = reason;

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
          <p style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:8px;text-align:center">
            💡 建議先「📚 逐題回顧」確認每題都看過(每題可加入錯題本),再離開模考結果
          </p>
          <div class="actions" style="justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="Mode7.startReview()">📚 逐題回顧 <span id="m7-review-progress-badge" style="font-size:0.85rem;opacity:0.85">(${this.state.reviewedSet ? this.state.reviewedSet.size : 0}/${result.total} 已看)</span></button>
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
      const q = item.q;
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
          <strong>${o.key || ''}.</strong> ${o.text || ''}${tag}
        </div>`;
      }).join('');

      // explanation
      const explCorrect = (q.explanation && q.explanation.correct) || '(此題未提供詳細解釋)';
      const hook = (q.explanation && q.explanation.hook) || '';
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
      const codeBlock = q.code_block
        ? `<pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;font-size:0.85rem;overflow-x:auto;margin:8px 0"><code>${q.code_block.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`
        : '';

      const isHistoryMode = !!(this.state && this.state._historyMode);
      const modeLabel = isHistoryMode ? '📜 歷史模考逐題回顧' : '📚 逐題回顧';
      const exitBtnLabel = isHistoryMode ? '📋 回考古題首頁' : '📋 回結算頁';

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

          <div class="card">
            <div style="font-size:0.8rem;color:var(--fg-dim);margin-bottom:6px">
              ${npc.avatar} ${npc.name} · ${q.knowledge_code || ''} · ${q.difficulty || ''}
            </div>
            <div style="font-size:1rem;line-height:1.6;margin-bottom:10px">${q.stem || ''}</div>
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
      fullLog.forEach((e, i) => {
        const q = allQ.find(x => x.id === e.qid);
        if (q) {
          lineup.push({ q, npcIdx: e.npcIdx || 0 });
        } else {
          // 題目已從題庫移除 → 顯示 placeholder,讓使用者知道
          lineup.push({
            q: { id: e.qid, stem: '⚠️ 此題已從題庫移除,無法顯示題幹', options: [], knowledge_code: e.kc || '', difficulty: '?', explanation: { correct: '此題已不在當前題庫,無解析可看。' } },
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
        _historyIdx: historyIdx
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
        // 加入錯題本(從 lineup 找出 nodeId + 用戶答案)
        const lineup = this._lastResultLineup || [];
        const idx = lineup.findIndex(it => it.q.id === qid);
        if (idx < 0) { showToast('找不到題目資料', 1500); return; }
        const item = lineup[idx];
        const q = item.q;
        const userAns = this.state.answers[idx];
        const correctOpt = (q.options || []).find(o => o.is_correct);
        const correctKey = correctOpt ? correctOpt.key : '';
        const userKey = userAns ? userAns.userKey : '';
        Wrongbook.add(q.id, q.node_id, userKey, correctKey);
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
