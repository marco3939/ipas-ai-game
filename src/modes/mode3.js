// ============================================================
// Mode 3: ML Pipeline 拼圖 — 真拖拉 + SVG 管線視覺(v2 完整重做)
// 鐵律 #1(下鑽)+ #2(洗牌)+ #5(來源忠實:只用 questions json 內 sequence 題)
// 主角:資料科學工程師
// 機制:HTML5 native drag-drop 拖拉節點到 SVG 管線坑位 + 計時 + Combo
// ============================================================
(function () {
  'use strict';

  const STORAGE_KEY = 'ipas_mode3_progress_v2';

  // 4 關 pipeline 主題配置(對應 q_pc_seq_001~004)
  const STAGE_META = {
    'q_pc_seq_001': { name: 'CNN 影像分類產線', avatar: '🖼️', timeLimit: 90,
      hint: '從像素到上線:八個關卡缺一不可', desc: '客戶要做寵物品種辨識' },
    'q_pc_seq_002': { name: 'BERT 情感分析微調線', avatar: '🧠', timeLimit: 90,
      hint: '預訓練 → 對齊任務 → 上線', desc: '社群輿情分類專案' },
    'q_pc_seq_003': { name: 'GDPR 合規部署管線', avatar: '⚖️', timeLimit: 90,
      hint: '合規不是事後補救', desc: '歐盟客戶法遵稽核' },
    'q_pc_seq_004': { name: 'AutoML 自動化模型線', avatar: '🤖', timeLimit: 90,
      hint: '定義先行、搜索後行', desc: '中型企業導入 AutoML' }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loadProgress() {
    try { return Storage.get(STORAGE_KEY, { stages: {}, totalCleared: 0 }); }
    catch { return { stages: {}, totalCleared: 0 }; }
  }
  function saveProgress(p) { Storage.set(STORAGE_KEY, p); }

  // 從 option.text 拆出步驟
  function parseSteps(text) {
    if (!text) return [];
    return text.split(/\s*→\s*|\s*->\s*/g).map(s => s.trim()).filter(Boolean);
  }

  // 注入專屬 CSS(只一次)
  function injectStyles() {
    if (document.getElementById('mode3-styles')) return;
    const s = document.createElement('style');
    s.id = 'mode3-styles';
    s.textContent = `
      .m3-arena { background: linear-gradient(135deg,#0c4a6e,#0e7490,#155e75);
        border-radius: var(--radius); padding: 16px; margin-bottom: 12px;
        box-shadow: 0 0 30px rgba(14,165,233,0.25); position: relative; overflow: hidden; }
      .m3-arena::before { content: ''; position: absolute; inset: 0;
        background: radial-gradient(ellipse at top, rgba(255,255,255,0.08), transparent 60%);
        pointer-events: none; }
      .m3-timer { display: inline-block; padding: 4px 12px; background: rgba(0,0,0,0.45);
        border-radius: 18px; font-weight: 800; color: #fef3c7; font-size: 1.1rem;
        border: 1px solid rgba(254,243,199,0.3); min-width: 70px; text-align: center; }
      .m3-timer.warn { color: #fb923c; animation: pulse 0.7s infinite; }
      .m3-timer.critical { color: #f87171; animation: pulse 0.4s infinite; }
      .m3-status-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
        background: rgba(0,0,0,0.35); padding: 8px 12px; border-radius: 8px; margin-bottom: 10px; }
      .m3-svg-wrap { background: rgba(255,255,255,0.04); border-radius: 10px;
        padding: 8px; margin: 12px 0; overflow-x: auto; border: 1px solid rgba(255,255,255,0.1); }
      .m3-svg { display: block; width: 100%; min-width: 760px; height: 360px; }
      .m3-slot { fill: rgba(15,23,42,0.55); stroke: #475569; stroke-width: 2;
        stroke-dasharray: 6 4; transition: all 0.25s; }
      .m3-slot.hover { fill: rgba(56,189,248,0.25); stroke: #38bdf8; stroke-dasharray: none;
        filter: drop-shadow(0 0 8px rgba(56,189,248,0.6)); }
      .m3-slot.filled { fill: rgba(74,222,128,0.18); stroke: #4ade80; stroke-dasharray: none; }
      .m3-slot.wrong-flash { fill: rgba(248,113,113,0.3); stroke: #f87171; stroke-dasharray: none; }
      .m3-edge { stroke: #94a3b8; stroke-width: 2; fill: none; opacity: 0.6;
        stroke-dasharray: 5 4; }
      .m3-edge.live { stroke: #4ade80; opacity: 1; stroke-dasharray: none;
        filter: drop-shadow(0 0 4px #4ade80); animation: m3-glow 1.4s infinite; }
      @keyframes m3-glow { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
      .m3-step-label { fill: var(--fg-dim); font-size: 11px; font-weight: 700;
        text-anchor: middle; pointer-events: none; }
      .m3-step-num { fill: #fef3c7; font-size: 14px; font-weight: 900;
        text-anchor: middle; pointer-events: none; }
      .m3-placed-text { fill: #f0fdfa; font-size: 11px; font-weight: 600;
        text-anchor: middle; pointer-events: none; }
      .m3-pool { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px;
        background: rgba(0,0,0,0.35); border-radius: 10px; min-height: 80px;
        border: 1px solid rgba(255,255,255,0.08); }
      .m3-card { background: linear-gradient(135deg,#1e293b,#334155); color: #f1f5f9;
        padding: 10px 14px; border-radius: 8px; border: 2px solid #475569;
        cursor: grab; user-select: none; font-size: 0.88rem; font-weight: 600;
        max-width: 280px; transition: all 0.2s; position: relative; }
      .m3-card:hover { border-color: #38bdf8; transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(56,189,248,0.4); }
      .m3-card:active { cursor: grabbing; }
      .m3-card.dragging { opacity: 0.4; transform: scale(0.95); }
      .m3-card.placed { opacity: 0.25; pointer-events: none;
        background: linear-gradient(135deg,#14532d,#16a34a); border-color: #4ade80; }
      .m3-card.shake { animation: m3-shake 0.5s; border-color: #f87171; }
      @keyframes m3-shake { 0%,100% { transform: translateX(0); }
        20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
      .m3-skill-row { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
      .m3-skill { padding: 6px 12px; background: rgba(0,0,0,0.4);
        border: 1px solid rgba(254,243,199,0.4); border-radius: 18px;
        color: #fef3c7; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
      .m3-skill:hover:not(:disabled) { background: rgba(254,243,199,0.15); transform: translateY(-1px); }
      .m3-skill:disabled { opacity: 0.4; cursor: not-allowed; }
      .m3-stage-card { background: var(--bg-2); border: 2px solid var(--border);
        border-radius: var(--radius); padding: 14px; cursor: pointer;
        transition: all 0.2s; text-align: left; }
      .m3-stage-card:hover { border-color: #38bdf8; transform: translateY(-2px); }
      .m3-stage-card.cleared { border-color: var(--success);
        background: linear-gradient(135deg, var(--bg-2), rgba(74,222,128,0.08)); }
      .m3-x-mark { position: absolute; font-size: 4rem; color: #f87171;
        font-weight: 900; pointer-events: none; z-index: 200; opacity: 0;
        text-shadow: 0 0 20px #f87171; }
    `;
    document.head.appendChild(s);
  }

  // 計算 SVG 節點座標(均勻排版,自動換行)
  // 8 步:4×2 排版
  function computeLayout(n, svgW = 760, svgH = 360) {
    const cols = Math.min(4, Math.ceil(Math.sqrt(n * (svgW / svgH))));
    const rows = Math.ceil(n / cols);
    const nodeW = 150, nodeH = 64;
    const xGap = (svgW - cols * nodeW) / (cols + 1);
    const yGap = (svgH - rows * nodeH) / (rows + 1);
    const positions = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      // 蛇形:奇數列由右往左
      const cc = (r % 2 === 1) ? (cols - 1 - c) : c;
      // 但若該列實際數量不滿,要修正
      const itemsInThisRow = Math.min(cols, n - r * cols);
      const realC = (r % 2 === 1)
        ? (itemsInThisRow - 1 - (i - r * cols))
        : (i - r * cols);
      positions.push({
        x: xGap + realC * (nodeW + xGap),
        y: yGap + r * (nodeH + yGap),
        w: nodeW, h: nodeH,
        index: i, row: r, col: realC
      });
    }
    return positions;
  }

  // 文字截斷(SVG 不會自動換行)
  function truncate(text, max = 14) {
    if (!text) return '';
    const t = text.replace(/\s+/g, '').replace(/[()()\[\]【】]/g, '');
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }
  // 切割文字為最多 2 行,每行不超過 maxPerLine 字
  function splitForSVG(text, maxPerLine = 11) {
    const t = String(text || '').replace(/\s+/g, '').replace(/[()()\[\]【】]/g, '');
    if (t.length <= maxPerLine) return [t];
    // 兩行各取最多 maxPerLine,超過第二行尾就用「…」
    const line1 = t.slice(0, maxPerLine);
    let line2 = t.slice(maxPerLine, maxPerLine * 2);
    if (t.length > maxPerLine * 2) {
      line2 = line2.slice(0, maxPerLine - 1) + '…';
    }
    return [line1, line2];
  }

  const Mode3 = {
    state: null,
    timer: null,

    start() {
      injectStyles();
      RNG.set(Date.now());
      this.renderStageMenu();
    },

    getStages() {
      const all = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).filter(q => q.format === 'sequence');
      // 鐵律 #5:只用題庫內既有的;若不足就只開放實際存在的
      return all;
    },

    renderStageMenu() {
      // 進入 menu 一定要清掉 timer / ghost / cooldown
      // R5b:同步停 PlayEngine 計時器(防呆:從異常路徑進入也能歸零)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      this.stopTimer();
      this._placeCooldown = false;
      this._dragCardId = null;
      this._cleanupGhosts && this._cleanupGhosts();
      const view = document.getElementById('view-play');
      if (!view) return;
      const player = Player.load();
      const stages = this.getStages();
      const progress = loadProgress();
      const playerHpPct = player.hp / player.hpMax * 100;

      if (!stages.length) {
        view.innerHTML = `
          <div class="card">
            <h1>🔧 ML Pipeline 工坊</h1>
            <p style="color:var(--fg-dim)">題庫中找不到 sequence 題目,請先載入 questions-pc-modes.json。</p>
            <div class="actions"><button class="btn btn-ghost" onclick="goHome()">🏠 回主頁</button></div>
          </div>`;
        show('view-play');
        return;
      }

      const cleared = stages.filter(q => progress.stages[q.id]?.cleared).length;

      view.innerHTML = `
        <div class="card">
          <h1>🔧 ML Pipeline 工坊 — 拖拉拼圖</h1>
          <p style="color:var(--fg-dim)">
            身份:資料科學工程師。每關一條 ML 管線,從打亂的步驟卡片中
            <strong style="color:var(--primary)">拖拉</strong>到 SVG 管線正確坑位。
            時間越快、Combo 越高、傷害越爆。
          </p>
        </div>

        <div class="m3-arena" style="padding:14px">
          <div class="player-bar">
            <div class="avatar">🧑‍💻</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${player.level}</span> 資料科學工程師</div>
              <div class="hp-track"><div class="hp-fill ${playerHpPct < 30 ? 'critical' : playerHpPct < 60 ? 'low' : ''}" style="width:${playerHpPct}%"></div></div>
              <div class="hp-text">HP ${player.hp} / ${player.hpMax} · MP ${player.mp} / ${player.mpMax} · EXP ${player.exp}/${player.expMax}</div>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:var(--fg-dim)">
            <span>🏆 已通關 ${cleared} / ${stages.length}</span>
            <span>📦 題庫 sequence 題:${stages.length}</span>
          </div>
        </div>

        <div class="card">
          <h2>🗂 選擇 Pipeline 案件</h2>
          <div class="modes-grid">
            ${stages.map(q => {
              const meta = STAGE_META[q.id] || { name: q.stem.slice(0, 18), avatar: '🔧', desc: '', timeLimit: 90 };
              const st = progress.stages[q.id];
              const ok = st && st.cleared;
              const perfect = st && st.perfect;
              const best = st && st.bestTime != null ? `${st.bestTime}s` : '—';
              return `<button class="m3-stage-card ${ok ? 'cleared' : ''}" onclick="Mode3.selectStage('${q.id}')">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                  <span style="font-size:2rem">${meta.avatar}</span>
                  <div>
                    <div class="mode-num">${ok ? (perfect ? '⭐ 完美通關' : '✅ 已通關') : '未通關'}</div>
                    <div class="mode-title" style="font-size:0.95rem">${esc(meta.name)}</div>
                  </div>
                </div>
                <div class="mode-desc" style="font-size:0.85rem">${esc(meta.desc)}</div>
                <div class="mode-stats">
                  ⏱ ${meta.timeLimit}s · 步驟 ${parseSteps(q.options.find(o => o.is_correct)?.text).length}
                  · 最佳 ${best}
                </div>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-ghost" onclick="goHome()">🏠 回主頁</button>
          <button class="btn btn-ghost" onclick="if(confirm('重置 Pipeline 進度?'))Mode3.resetProgress()">🔄 重置進度</button>
        </div>
      `;
      show('view-play');
    },

    resetProgress() {
      Storage.del(STORAGE_KEY);
      this.renderStageMenu();
    },

    selectStage(qid) {
      const q = (typeof QUESTIONS !== 'undefined' ? QUESTIONS : []).find(x => x.id === qid);
      if (!q) { showToast('找不到此題'); return; }
      const correct = q.options.find(o => o.is_correct);
      const steps = parseSteps(correct ? correct.text : '');
      if (steps.length === 0) { showToast('此題無法解析步驟'); return; }
      if (steps.length === 1) { showToast('此題步驟不足無法形成排序挑戰'); return; }

      // 進入新關卡前先清理上一關狀態
      this.stopTimer();
      this._placeCooldown = false;
      this._dragCardId = null;
      this._cleanupGhosts && this._cleanupGhosts();

      const meta = STAGE_META[q.id] || { name: q.stem.slice(0, 20), avatar: '🔧', timeLimit: 90, hint: '依正確順序排列' };

      // 鐵律 #2:洗牌候選池(seed 重設確保每場不同)
      RNG.set(Date.now() + Math.floor(Math.random() * 100000));
      const shuffled = RNG.shuffle(steps.slice());

      this.state = {
        q, steps, // 正確順序
        meta,
        pool: shuffled.map((s, i) => ({ id: 'card-' + i, text: s, placed: false })),
        slots: steps.map(() => null), // 每個 slot 放卡片 id 或 null
        timeLeft: meta.timeLimit,
        startedAt: Date.now(),
        used: { autoplace: 0, hint: 0, skip: 0 },
        wrongDrops: 0,
        correctPlacements: 0,
        combo: 0,
        maxCombo: 0,
        finished: false
      };

      this.renderStage();
      this.startTimer();
      // R5b:同時啟動 PlayEngine 90s timer(視覺一致),Mode 3 自有 m3-timer 平行運作。
      // 只在 selectStage 啟動一次,renderStage 重繪時不重設(避免每次拖放都重置 90s)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._startTimer) { PlayEngine._timerDisabled = false; PlayEngine._startTimer(90); }
    },

    startTimer() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      this.timer = setInterval(() => {
        if (!this.state || this.state.finished) { clearInterval(this.timer); this.timer = null; return; }
        // 防呆:若使用者已離開 play view(例如點 header 🏠 首頁),靜默清理,不要強拉回敗北畫面
        const playView = document.getElementById('view-play');
        if (!playView || !playView.classList.contains('active')) {
          clearInterval(this.timer); this.timer = null;
          if (this.state) this.state.finished = true;
          this._placeCooldown = false;
          this._dragCardId = null;
          this._cleanupGhosts && this._cleanupGhosts();
          return;
        }
        this.state.timeLeft--;
        if (this.state.timeLeft < 0) this.state.timeLeft = 0;
        const el = document.getElementById('m3-timer');
        if (el) {
          el.textContent = `⏱ ${this.state.timeLeft}s`;
          el.className = 'm3-timer' + (this.state.timeLeft <= 10 ? ' critical'
            : this.state.timeLeft <= 25 ? ' warn' : '');
        }
        if (this.state.timeLeft <= 0) {
          clearInterval(this.timer); this.timer = null;
          this.timeUp();
        }
      }, 1000);
    },

    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

    renderStage() {
      const view = document.getElementById('view-play');
      if (!view) return;
      const s = this.state;
      const player = Player.load();
      const playerHpPct = player.hp / player.hpMax * 100;

      const layout = computeLayout(s.steps.length);

      // SVG 節點 + 連線
      const svgW = 760, svgH = 360;
      // 連線(以順序連接相鄰)
      const edges = [];
      for (let i = 0; i < layout.length - 1; i++) {
        const a = layout[i], b = layout[i + 1];
        const ax = a.x + a.w / 2, ay = a.y + a.h;
        const bx = b.x + b.w / 2, by = b.y;
        // 控制點
        const midY = (ay + by) / 2;
        const live = (s.slots[i] != null && s.slots[i + 1] != null) ? 'live' : '';
        edges.push(`<path class="m3-edge ${live}"
          d="M${ax},${ay} C${ax},${midY} ${bx},${midY} ${bx},${by}"
          marker-end="url(#m3-arrow)" data-edge="${i}-${i+1}" />`);
      }

      const slots = layout.map((p, i) => {
        const filled = s.slots[i] != null;
        const cardId = s.slots[i];
        const cardText = cardId ? (s.pool.find(c => c.id === cardId)?.text || '') : '';
        const lines = filled ? splitForSVG(cardText, 11) : [];
        const labelLines = lines.length ? lines.map((ln, li) => {
          const yOff = (li - (lines.length - 1) / 2) * 14 + 4;
          return `<text class="m3-placed-text" x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + yOff}">${esc(ln)}</text>`;
        }).join('') : `<text class="m3-step-label" x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 4}">待填入</text>`;

        return `
          <g class="m3-slot-group" data-slot="${i}">
            <rect class="m3-slot ${filled ? 'filled' : ''}" id="m3-slot-${i}"
              x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" ry="8"
              data-slot-index="${i}" />
            <circle cx="${p.x + 14}" cy="${p.y + 14}" r="11" fill="#0c4a6e" stroke="#38bdf8" stroke-width="1.5"/>
            <text class="m3-step-num" x="${p.x + 14}" y="${p.y + 18}">${i + 1}</text>
            ${labelLines}
          </g>`;
      }).join('');

      // 候選卡片(已放的標 placed)
      const cards = s.pool.map(c => `
        <div class="m3-card ${c.placed ? 'placed' : ''}"
             draggable="${!c.placed}"
             data-card-id="${c.id}"
             ondragstart="Mode3._dragStart(event,'${c.id}')"
             ondragend="Mode3._dragEnd(event)">
          ${esc(c.text)}
        </div>`).join('');

      view.innerHTML = `
        <div class="m3-arena">
          <div class="m3-status-row">
            <span style="font-size:1.6rem">${s.meta.avatar}</span>
            <div style="flex:1">
              <div style="font-weight:800;color:#f0f9ff">${esc(s.meta.name)}</div>
              <div style="font-size:0.8rem;color:#a5f3fc">${esc(s.q.stem)}</div>
            </div>
            <span class="m3-timer" id="m3-timer">⏱ ${s.timeLeft}s</span>
          </div>

          <div class="player-bar">
            <div class="avatar" id="m3-player-avatar">🧑‍💻</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${player.level}</span>
                填入 ${s.correctPlacements} / ${s.steps.length}
                · 連擊 <strong style="color:#fbbf24">${s.combo}</strong>
              </div>
              <div class="hp-track"><div class="hp-fill ${playerHpPct < 30 ? 'critical' : playerHpPct < 60 ? 'low' : ''}" style="width:${playerHpPct}%"></div></div>
              <div class="hp-text">HP ${player.hp}/${player.hpMax} · MP ${player.mp}/${player.mpMax} · 錯放 ${s.wrongDrops}</div>
            </div>
          </div>

          <div class="m3-skill-row">
            <button class="m3-skill" onclick="Mode3.skillAutoPlace()" ${player.mp < 10 ? 'disabled' : ''}>
              ✨ 自動定位 1 格 (10 MP)
            </button>
            <button class="m3-skill" onclick="Mode3.skillHint()" ${player.mp < 8 ? 'disabled' : ''}>
              💡 顯示口訣 (8 MP)
            </button>
            <button class="m3-skill" onclick="Mode3.skillSkip()">
              ⏭ 跳過此關 (扣 15 HP)
            </button>
          </div>

          <div class="m3-svg-wrap">
            <svg class="m3-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
              <defs>
                <marker id="m3-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
                </marker>
              </defs>
              ${edges.join('')}
              ${slots}
            </svg>
          </div>

          <div style="font-size:0.82rem;color:#cbd5e1;margin:6px 0">
            🖱 從下方候選步驟 <strong>拖拉</strong> 到對應編號的管線方塊
          </div>

          <div class="m3-pool" id="m3-pool"
            ondragover="Mode3._dragOver(event)"
            ondrop="Mode3._dropToPool(event)">
            ${cards}
          </div>

          <div class="actions" style="margin-top:12px">
            <button class="btn btn-ghost" onclick="Mode3.abandon()">🚪 放棄回選單</button>
          </div>
        </div>
      `;
      show('view-play');

      // 清理可能殘留的 ghost / X mark
      this._cleanupGhosts();

      // 為每個 slot rect 加上 drop handler
      requestAnimationFrame(() => {
        document.querySelectorAll('#view-play .m3-slot').forEach(rect => {
          rect.addEventListener('dragover', (e) => {
            e.preventDefault();
            rect.classList.add('hover');
          });
          rect.addEventListener('dragleave', () => rect.classList.remove('hover'));
          rect.addEventListener('drop', (e) => {
            e.preventDefault();
            rect.classList.remove('hover');
            const slotIdx = parseInt(rect.dataset.slotIndex, 10);
            let cardId = '';
            try { cardId = e.dataTransfer.getData('text/plain'); } catch (err) {}
            cardId = cardId || this._dragCardId;
            if (cardId) this.tryPlace(cardId, slotIdx);
          });
        });
        // 為每張卡片加上 touch 監聽(mobile 支援)
        document.querySelectorAll('#view-play .m3-card').forEach(cardEl => {
          const cid = cardEl.getAttribute('data-card-id');
          if (cid && !cardEl.classList.contains('placed')) this._touchInit(cardEl, cid);
        });
      });
    },

    _cleanupGhosts() {
      // 清掉拖拉殘留的 X mark / ghost
      document.querySelectorAll('.m3-x-mark').forEach(n => n.remove());
      // 清除遺留的 ghost(touch fallback 若異常結束)
      document.querySelectorAll('.m3-card.dragging').forEach(n => n.classList.remove('dragging'));
    },

    // === Drag & Drop handlers ===
    _dragStart(ev, cardId) {
      this._dragCardId = cardId;
      try { ev.dataTransfer.setData('text/plain', cardId); } catch (e) {}
      try { ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
      // 用 currentTarget 取外層 .m3-card,避免 ev.target 落在子元素
      const cardEl = ev.currentTarget || ev.target.closest('.m3-card');
      if (cardEl && cardEl.classList) cardEl.classList.add('dragging');
    },
    _dragEnd(ev) {
      const cardEl = ev.currentTarget || ev.target.closest('.m3-card');
      if (cardEl && cardEl.classList) cardEl.classList.remove('dragging');
      document.querySelectorAll('.m3-slot.hover').forEach(r => r.classList.remove('hover'));
      // 清理拖拉狀態,避免下次 drop race
      this._dragCardId = null;
    },
    _dragOver(ev) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch(e){} },
    _dropToPool(ev) {
      // 拖回候選池 = 從 slot 取回
      ev.preventDefault();
      let cardId = '';
      try { cardId = ev.dataTransfer.getData('text/plain'); } catch (e) {}
      cardId = cardId || this._dragCardId;
      if (!cardId || !this.state) return;
      // 找這張卡是否已在某 slot
      const slotIdx = this.state.slots.findIndex(x => x === cardId);
      if (slotIdx >= 0) {
        // 取回(無懲罰,但這格的 correct 計數要回退)
        const card = this.state.pool.find(c => c.id === cardId);
        const wasCorrect = card && card.text === this.state.steps[slotIdx];
        this.state.slots[slotIdx] = null;
        if (card) card.placed = false;
        if (wasCorrect) {
          this.state.correctPlacements = Math.max(0, this.state.correctPlacements - 1);
          this.state.combo = 0;
        }
        this.renderStage();
      }
    },

    // === Mobile / Touch fallback(HTML5 DnD 在多數行動裝置不會觸發)===
    // 使用單指 touchstart/touchmove/touchend 模擬拖拉,長按啟動以避免誤觸滾動
    _touchInit(cardEl, cardId) {
      const self = this;
      let dragging = false;
      let ghost = null;
      let longPressTimer = null;
      let startX = 0, startY = 0;

      const onTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
        // 200ms 長按啟動拖拉
        longPressTimer = setTimeout(() => {
          dragging = true;
          self._dragCardId = cardId;
          cardEl.classList.add('dragging');
          ghost = cardEl.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.pointerEvents = 'none';
          ghost.style.zIndex = '9999';
          ghost.style.opacity = '0.85';
          ghost.style.transform = 'scale(0.9)';
          ghost.style.left = (t.clientX - 80) + 'px';
          ghost.style.top = (t.clientY - 20) + 'px';
          ghost.classList.remove('dragging');
          document.body.appendChild(ghost);
        }, 200);
      };
      const onTouchMove = (e) => {
        if (!dragging) {
          // 在啟動前若手指偏移過大,取消長按
          if (longPressTimer) {
            const t = e.touches[0];
            if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
              clearTimeout(longPressTimer); longPressTimer = null;
            }
          }
          return;
        }
        e.preventDefault();
        const t = e.touches[0];
        if (ghost) {
          ghost.style.left = (t.clientX - 80) + 'px';
          ghost.style.top = (t.clientY - 20) + 'px';
        }
        // 高亮 slot
        document.querySelectorAll('.m3-slot.hover').forEach(r => r.classList.remove('hover'));
        const under = self._elementAt(t.clientX, t.clientY);
        if (under && under.classList && under.classList.contains('m3-slot')) {
          under.classList.add('hover');
        }
      };
      const onTouchEnd = (e) => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        if (!dragging) return;
        dragging = false;
        cardEl.classList.remove('dragging');
        if (ghost) { ghost.remove(); ghost = null; }
        document.querySelectorAll('.m3-slot.hover').forEach(r => r.classList.remove('hover'));
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) { self._dragCardId = null; return; }
        const under = self._elementAt(t.clientX, t.clientY);
        if (under && under.classList && under.classList.contains('m3-slot')) {
          const slotIdx = parseInt(under.dataset.slotIndex, 10);
          if (!Number.isNaN(slotIdx)) self.tryPlace(cardId, slotIdx);
        } else if (under && under.closest && under.closest('#m3-pool')) {
          // 拖回候選池
          const sIdx = self.state ? self.state.slots.findIndex(x => x === cardId) : -1;
          if (sIdx >= 0) {
            const card = self.state.pool.find(c => c.id === cardId);
            const wasCorrect = card && card.text === self.state.steps[sIdx];
            self.state.slots[sIdx] = null;
            if (card) card.placed = false;
            if (wasCorrect) {
              self.state.correctPlacements = Math.max(0, self.state.correctPlacements - 1);
              self.state.combo = 0;
            }
            self.renderStage();
          }
        }
        self._dragCardId = null;
      };
      cardEl.addEventListener('touchstart', onTouchStart, { passive: true });
      cardEl.addEventListener('touchmove', onTouchMove, { passive: false });
      cardEl.addEventListener('touchend', onTouchEnd);
      cardEl.addEventListener('touchcancel', onTouchEnd);
    },

    _elementAt(x, y) {
      // 拖拉時 ghost 開了 pointer-events:none,所以 elementFromPoint 可拿到下方元素
      return document.elementFromPoint(x, y);
    },

    // 嘗試把卡片放到 slot
    tryPlace(cardId, slotIdx) {
      const s = this.state;
      if (!s || s.finished) return;
      // 防止短時間內重複觸發(動畫尚未播完時)
      if (this._placeCooldown) return;
      if (typeof slotIdx !== 'number' || slotIdx < 0 || slotIdx >= s.slots.length) return;
      const card = s.pool.find(c => c.id === cardId);
      if (!card) return;

      const expected = s.steps[slotIdx];
      const isRight = card.text === expected;

      if (isRight) {
        // 對的才允許覆寫:先處理被替換掉的舊卡 + 卡片先前所在的 slot
        if (s.slots[slotIdx] && s.slots[slotIdx] !== cardId) {
          const prevId = s.slots[slotIdx];
          const prev = s.pool.find(c => c.id === prevId);
          if (prev) {
            prev.placed = false;
            if (prev.text === s.steps[slotIdx]) {
              s.correctPlacements = Math.max(0, s.correctPlacements - 1);
            }
          }
        }
        const oldIdx = s.slots.findIndex(x => x === cardId);
        if (oldIdx >= 0 && oldIdx !== slotIdx) {
          const oldCorrect = card.text === s.steps[oldIdx];
          s.slots[oldIdx] = null;
          if (oldCorrect) s.correctPlacements = Math.max(0, s.correctPlacements - 1);
        }

        s.slots[slotIdx] = cardId;
        card.placed = true;
        s.correctPlacements++;
        s.combo++;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
        // 加血加魔(連擊加成)
        const p = Player.load();
        const before = { hp: p.hp, mp: p.mp };
        p.hp = Math.min(p.hpMax, p.hp + 3 + Math.min(s.combo, 5));
        p.mp = Math.min(p.mpMax, p.mp + 2 + Math.min(s.combo, 4));
        Player.save(p);

        GameFX.flash('correct');
        const av = document.getElementById('m3-player-avatar');
        if (av && p.hp > before.hp) {
          GameFX.damageNumber(av, '+' + (p.hp - before.hp), { kind: 'player' });
        }
        if (s.combo >= 2) GameFX.combo(s.combo);
        if (s.combo === 3) GameFX.confetti({ count: 40, colors: ['#4ade80','#22c55e','#facc15'] });

        // 檢查是否全對
        if (s.correctPlacements >= s.steps.length) {
          this.victory();
          return;
        }
        this.renderStage();
      } else {
        // 錯放:不改 state.slots / card.placed,只給視覺懲罰並彈回
        s.wrongDrops++;
        s.combo = 0;
        const dmg = 4 + Math.floor(s.steps.length * 0.5);
        Player.damage(dmg);

        // 設置短暫冷卻,避免動畫期間誤觸
        this._placeCooldown = true;
        setTimeout(() => { this._placeCooldown = false; }, 600);

        const slotEl = document.getElementById('m3-slot-' + slotIdx);
        if (slotEl) {
          slotEl.classList.add('wrong-flash');
          setTimeout(() => {
            const el = document.getElementById('m3-slot-' + slotIdx);
            if (el) el.classList.remove('wrong-flash');
          }, 600);
        }
        const cardEl = document.querySelector('[data-card-id="' + cardId + '"]');
        if (cardEl) {
          cardEl.classList.add('shake');
          setTimeout(() => {
            const el = document.querySelector('[data-card-id="' + cardId + '"]');
            if (el) el.classList.remove('shake');
          }, 500);
        }

        // 飛紅 X
        this._showXMark(slotEl);

        GameFX.flash('wrong');
        GameFX.hideCombo();
        const av = document.getElementById('m3-player-avatar');
        if (av) { GameFX.shake(av); GameFX.damageNumber(av, dmg, { kind: 'enemy' }); }

        showToast('❌ 第 ' + (slotIdx + 1) + ' 步不是這個', 1500);

        const p = Player.load();
        if (p.hp <= 0) { this.gameOver(); return; }
        // 不立即 re-render,讓動畫播完
        setTimeout(() => { if (this.state && !this.state.finished) this.renderStage(); }, 700);
      }
    },

    _showXMark(slotEl) {
      if (!slotEl) return;
      const r = slotEl.getBoundingClientRect();
      const x = document.createElement('div');
      x.className = 'm3-x-mark';
      x.textContent = '✗';
      x.style.left = (r.left + r.width / 2 - 30) + 'px';
      x.style.top = (r.top + r.height / 2 - 30) + 'px';
      x.style.position = 'fixed';
      document.body.appendChild(x);
      if (window.gsap) {
        gsap.fromTo(x, { scale: 0, opacity: 0, rotate: -30 },
          { scale: 1.2, opacity: 1, rotate: 0, duration: 0.25, ease: 'back.out(2)',
            onComplete: () => {
              gsap.to(x, { opacity: 0, scale: 1.5, duration: 0.4, delay: 0.2,
                onComplete: () => x.remove() });
            }
          });
      } else {
        x.style.opacity = '1';
        setTimeout(() => x.remove(), 800);
      }
    },

    // === 招式 ===
    skillAutoPlace() {
      const s = this.state; if (!s || s.finished) return;
      if (this._placeCooldown) { showToast('請稍候,動畫進行中'); return; }
      const p = Player.load();
      if (p.mp < 10) { showToast('MP 不足'); return; }
      // 找第一個未填正確的 slot
      const slotIdx = s.slots.findIndex((v, i) => {
        if (v == null) return true;
        const card = s.pool.find(c => c.id === v);
        return !card || card.text !== s.steps[i];
      });
      if (slotIdx < 0) { showToast('已全對'); return; }
      const expectedText = s.steps[slotIdx];
      // 找對應卡片(可能還在 pool 或在錯位 slot)
      const card = s.pool.find(c => c.text === expectedText);
      if (!card) { showToast('找不到對應卡片'); return; }
      p.mp = Math.max(0, p.mp - 10); Player.save(p);
      s.used.autoplace++;
      // 把該卡放對位置
      this.tryPlace(card.id, slotIdx);
      // tryPlace 可能已觸發 victory(全對最後一格),此時 state 已 finished,不再彈 toast 干擾結算畫面
      if (this.state && !this.state.finished) {
        showToast('✨ 已自動定位第 ' + (slotIdx + 1) + ' 格');
      }
    },

    skillHint() {
      const s = this.state; if (!s || s.finished) return;
      const p = Player.load();
      if (p.mp < 8) { showToast('MP 不足'); return; }
      p.mp = Math.max(0, p.mp - 8); Player.save(p);
      s.used.hint++;
      const hook = (s.q.explanation && s.q.explanation.hook) || s.meta.hint;
      showToast('💡 ' + hook, 5500);
      // 不 re-render,避免打斷使用者拖拉節奏
      // 但 MP/HP 條會在下次 render 時更新
    },

    skillSkip() {
      const s = this.state; if (!s || s.finished) return;
      if (!confirm('跳過此關?會扣 15 HP 且本次不算通關。')) return;
      Player.damage(15);
      // afterFail 會處理 stopTimer / finished / cleanup
      const p = Player.load();
      if (p.hp <= 0) { this.gameOver(); return; }
      this.afterFail('skip');
    },

    // === 結算 ===
    victory() {
      const s = this.state;
      // R5b:停掉 PlayEngine 計時器(平行運作,需獨立停止)
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      this.stopTimer();
      this._placeCooldown = false;
      this._dragCardId = null;
      this._cleanupGhosts();
      s.finished = true;

      const elapsed = Math.max(0, s.meta.timeLimit - s.timeLeft);
      const perfect = s.wrongDrops === 0;
      const timeBonus = Math.max(0, s.timeLeft);
      const comboMultiplier = 1 + Math.min(s.maxCombo, 8) * 0.1; // 1.0 ~ 1.8x
      const baseExp = 50 + s.steps.length * 8;
      const totalExp = Math.max(0, Math.floor((baseExp + timeBonus * 2 + (perfect ? 40 : 0)) * comboMultiplier));

      Player.gainExp(totalExp);
      Mastery.update(s.q.node_id || s.q.id, true);
      if (typeof SM2 !== 'undefined' && s.q.id) SM2.recordAnswer(s.q.id, true, false);
      Progress.addAnswer(true);

      const progress = loadProgress();
      const prev = progress.stages[s.q.id] || {};
      progress.stages[s.q.id] = {
        cleared: true,
        perfect: prev.perfect || perfect,
        bestTime: (prev.bestTime == null || elapsed < prev.bestTime) ? elapsed : prev.bestTime,
        bestCombo: Math.max(prev.bestCombo || 0, s.maxCombo),
        bestWrong: (prev.bestWrong == null || s.wrongDrops < prev.bestWrong) ? s.wrongDrops : prev.bestWrong
      };
      saveProgress(progress);

      GameFX.bigConfetti();

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="m3-arena" style="text-align:center;padding:24px">
          <h1 style="color:#fbbf24;font-size:1.8rem">🏆 Pipeline 啟動成功!</h1>
          <div style="font-size:3.5rem;margin:14px 0">${s.meta.avatar}</div>
          <div style="background:rgba(0,0,0,0.45);padding:14px;border-radius:10px;margin:14px auto;max-width:480px;text-align:left">
            <div style="font-weight:800;color:#f0f9ff;margin-bottom:8px">📋 ${esc(s.meta.name)} 啟動報告</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.9rem;color:#cbd5e1">
              <div>🎯 步驟 ${s.steps.length} 全對</div>
              <div>⏱ 用時 ${elapsed}s / ${s.meta.timeLimit}s</div>
              <div>❌ 錯放 ${s.wrongDrops} 次</div>
              <div>🔥 最高連擊 ${s.maxCombo}</div>
              <div>✨ 自動定位 ${s.used.autoplace} 次</div>
              <div>💡 看口訣 ${s.used.hint} 次</div>
            </div>
            <hr style="margin:10px 0;border-color:rgba(255,255,255,0.15)">
            <div style="text-align:center">
              <div style="color:#fbbf24;font-weight:900;font-size:1.4rem">+${totalExp} EXP</div>
              <div style="font-size:0.78rem;color:#94a3b8">基礎 ${baseExp} + 剩餘秒數 ${timeBonus * 2} ${perfect ? '+ 完美 40' : ''} × Combo ${comboMultiplier.toFixed(1)}x</div>
              ${perfect ? '<div style="margin-top:6px;color:#4ade80;font-weight:700">⭐ 完美通關</div>' : ''}
            </div>
          </div>

          <div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px auto;max-width:520px;text-align:left">
            <div style="color:#fef3c7;font-weight:700;font-size:0.9rem">💡 記憶口訣</div>
            <div style="color:#f1f5f9;margin-top:4px">${esc((s.q.explanation && s.q.explanation.hook) || s.meta.hint)}</div>
          </div>

          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode3.renderStageMenu()">🗂 回案件選單</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
          </div>
        </div>
      `;
      show('view-play');
    },

    timeUp() {
      this.afterFail('timeup');
    },

    afterFail(reason) {
      const s = this.state;
      if (!s) { this.renderStageMenu(); return; }
      // R5b:停掉 PlayEngine 計時器
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      this.stopTimer();
      this._placeCooldown = false;
      this._dragCardId = null;
      this._cleanupGhosts();
      s.finished = true;

      // 加入錯題本(鐵律 #1)
      // 2026-05-16 案例 10 補:Wrongbook.add 簽名是 (qid, nodeId, userChoice, correctChoice, userText, correctText)
      // 原本把長 fail 訊息塞 userChoice、把 correctText 塞 correctChoice,channel 錯位 → Review UI 顯示怪
      // Mode 3 是 pipeline drag,沒有 A/B/C/D 概念,userChoice/correctChoice 留 '?',文字放對欄位
      const correctOpt = s.q.options.find(o => o.is_correct);
      const failMsg = '(Pipeline 拖拉失敗 · 錯放 ' + s.wrongDrops + ' / 完成 ' + s.correctPlacements + '/' + s.steps.length + ')';
      Wrongbook.add(
        s.q.id,
        s.q.node_id || s.q.id,
        '?', '?',
        failMsg,
        (correctOpt && correctOpt.text) || ''
      );
      Mastery.update(s.q.node_id || s.q.id, false);
      if (typeof SM2 !== 'undefined' && s.q.id) SM2.recordAnswer(s.q.id, false, false);
      Progress.addAnswer(false);

      const reasonText = reason === 'timeup' ? '⏰ 時間到!Pipeline 部署超時'
        : reason === 'skip' ? '⏭ 跳關!此關不算通關'
        : '🚪 你選擇放棄此關';

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="m3-arena" style="text-align:center;padding:24px">
          <h1 style="color:#f87171;font-size:1.6rem">${reasonText}</h1>
          <div style="font-size:3rem;margin:12px 0">😓</div>

          <div style="background:rgba(0,0,0,0.45);padding:14px;border-radius:10px;margin:14px auto;max-width:520px;text-align:left">
            <div style="font-weight:700;color:#f0f9ff;margin-bottom:6px">完成進度</div>
            <div style="font-size:0.9rem;color:#cbd5e1">已正確填入 ${s.correctPlacements} / ${s.steps.length} 步,錯放 ${s.wrongDrops} 次</div>
            <hr style="margin:10px 0;border-color:rgba(255,255,255,0.15)">
            <div style="font-weight:700;color:#4ade80;margin-bottom:4px">✅ 正確順序</div>
            <ol style="padding-left:24px;color:#e2e8f0;font-size:0.85rem;line-height:1.7">
              ${s.steps.map(st => `<li>${esc(st)}</li>`).join('')}
            </ol>
          </div>

          ${s.q.explanation && s.q.explanation.hook ? `
            <div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px auto;max-width:520px;text-align:left">
              <div style="color:#fef3c7;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>
              <div style="color:#f1f5f9;margin-top:2px">${esc(s.q.explanation.hook)}</div>
            </div>` : ''}

          <div class="actions" style="justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="Mode3.selectStage('${s.q.id}')">🔁 再戰一次</button>
            <button class="btn btn-warn" onclick="Mode3.drillThis()">🎯 立即下鑽變化型</button>
            <button class="btn btn-ghost" onclick="Mode3.renderStageMenu()">🗂 回案件選單</button>
          </div>
        </div>
      `;
      show('view-play');
    },

    drillThis() {
      const s = this.state;
      if (!s) return;
      const variations = (typeof generateVariation === 'function')
        ? generateVariation(s.q, 3)
        : [];
      if (!variations || variations.length === 0) {
        showToast('⚠️ 此知識點變化型不足,先重做本題或回選單', 3000);
        return;
      }
      DrillSession.start(s.q.node_id || s.q.id, variations, s.q, () => {
        // 下鑽完成後回 stage menu
        this.renderStageMenu();
      });
    },

    abandon() {
      if (!confirm('放棄此關回案件選單?')) return;
      // R5b:停掉 PlayEngine 計時器
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      this.stopTimer();
      if (this.state) this.state.finished = true;
      this.renderStageMenu();
    },

    gameOver() {
      // R5b:停掉 PlayEngine 計時器
      if (typeof PlayEngine !== 'undefined' && PlayEngine._stopTimer) PlayEngine._stopTimer();
      this.stopTimer();
      this._placeCooldown = false;
      this._dragCardId = null;
      this._cleanupGhosts();
      if (!this.state) { this.renderStageMenu(); return; }
      this.state.finished = true;
      // 2026-05-16: 動態 hpMax/2,對齊「恢復一半 HP」文案
      const _heal3 = Player.load(); Player.heal(Math.floor(_heal3.hpMax / 2));
      const s = this.state;
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="m3-arena" style="text-align:center;padding:24px">
          <h1 style="color:#f87171;font-size:1.8rem">💀 你體力透支了</h1>
          <div style="font-size:3.5rem;margin:14px 0">😵</div>
          <p style="color:#cbd5e1">休息片刻後,你恢復了一半 HP...</p>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode3.selectStage('${s.q.id}')">🔁 再戰</button>
            <button class="btn btn-ghost" onclick="Mode3.renderStageMenu()">🗂 案件選單</button>
          </div>
        </div>
      `;
      show('view-play');
    }
  };

  window.Mode3 = Mode3;
})();
