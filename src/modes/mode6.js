// ============================================================
// Mode 6: 卡牌圖鑑大全(Codex)— 87+ kb 節點認知預習
// 填補「教學預習段」缺口:預習(讀)→ 挑戰(寫)→ 升階(收集)
// 鐵律 #1(下鑽)+ #2(動態)+ #5(來源忠實)全合規
// ============================================================
(function () {

  // === 卡片狀態(4 階)===
  // 0: 灰卡(未接觸)— 只顯示 knowledge_code + title
  // 1: 半透卡(接觸過)— 該節點曾出題且答錯 ≥ 1 次,顯示 summary
  // 2: 彩卡(熟練中)— Mastery score ≥ 50,顯示 summary + key_points
  // 3: 金卡(精通)— Mastery score ≥ 90 或本案連對 ≥ 3,顯示 summary + key_points + misconceptions + hooks
  const TIER = { LOCKED: 0, TOUCHED: 1, COLOR: 2, GOLD: 3 };
  const TIER_LABEL = { 0: '🔒 未接觸', 1: '🌫 接觸過', 2: '🌈 熟練中', 3: '👑 精通' };

  // 升階閾值
  const SCORE_COLOR_THRESHOLD = 50;   // mastery score ≥ 50 → 彩卡
  const SCORE_GOLD_THRESHOLD  = 90;   // mastery score ≥ 90 → 金卡
  const STREAK_GOLD_THRESHOLD = 3;    // 本案連對 ≥ 3 → 金卡(雙路徑)

  // 挑戰消耗
  const MP_COST_CHALLENGE = 5;

  // localStorage key
  const STORAGE_KEY = 'ipas_mode6_codex_v1';
  const STORAGE_VERSION = '1.0';

  // === 內部狀態 ===
  // _allowList:從 scripts/kb-allowed-nodes.json 讀來的白名單(94 nodes,鐵律 #5 ground truth)
  //   結構:[{ id, title, knowledge_code }]
  // _kbIndex:從 kb/nodes-subject-{1,3}{,-extended}.json 讀來,以 node_id → 完整節點資料
  //   只用來補 summary / key_points / common_misconceptions / explanation_hooks
  let _allowList = null;
  let _kbIndex = null;
  let _loadingPromise = null;

  // === KB / 白名單 載入(只做一次,快取於模組區域)===
  // 路徑:SPA 從 src/ 啟動(loadQuestions fetch 'questions.json' 不帶前綴)
  //   故 kb 與 scripts 用 ../ 上溯
  async function _loadCodexData() {
    if (_allowList && _kbIndex) return { allowList: _allowList, kbIndex: _kbIndex };
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = (async () => {
      // 1) 白名單(必須成功,否則沒卡可顯示)
      let allowJson;
      try {
        const r = await fetch('../scripts/kb-allowed-nodes.json');
        if (!r.ok) throw new Error('allowList fetch fail: ' + r.status);
        allowJson = await r.json();
      } catch (e) {
        console.error('[Mode6] 白名單載入失敗', e);
        showToast('⚠️ 卡牌圖鑑白名單載入失敗,請以 http server 啟動本檔案', 4000);
        throw e;
      }
      // 攤平為 array
      const list = [];
      for (const [code, nodes] of Object.entries(allowJson)) {
        if (!Array.isArray(nodes)) continue;
        nodes.forEach(n => {
          if (n && n.id && n.title) {
            list.push({ id: n.id, title: n.title, knowledge_code: code });
          }
        });
      }
      _allowList = list;

      // 2) KB 詳情(任一檔失敗不致命,只是該節點不顯示詳細內容)
      const kbFiles = [
        '../kb/nodes-subject-1.json',
        '../kb/nodes-subject-1-extended.json',
        '../kb/nodes-subject-2.json',
        '../kb/nodes-subject-2-stats.json',
        '../kb/nodes-subject-2-data.json',
        '../kb/nodes-subject-2-bdapp.json',
        '../kb/nodes-subject-2-bdml.json',
        '../kb/nodes-subject-3.json',
        '../kb/nodes-subject-3-extended.json'
      ];
      const kbResults = await Promise.all(kbFiles.map(f =>
        fetch(f).then(r => r.ok ? r.json() : { nodes: [] })
                .catch(() => ({ nodes: [] }))
      ));
      const idx = {};
      kbResults.forEach(j => {
        const nodes = (j && j.nodes) || [];
        nodes.forEach(n => { if (n && n.node_id) idx[n.node_id] = n; });
      });
      _kbIndex = idx;
      console.log(`[Mode6] 白名單 ${list.length} nodes,kb 詳情命中 ${Object.keys(idx).length}`);
      return { allowList: _allowList, kbIndex: _kbIndex };
    })();
    return _loadingPromise;
  }

  // === Codex 持久化:本案專屬計數(挑戰次數 / 連對 / 本案內最高 tier)===
  function _loadCodex() {
    const data = Storage.get(STORAGE_KEY, null);
    if (!data || data.version !== STORAGE_VERSION) {
      return { version: STORAGE_VERSION, unlocks: {} };
    }
    return data;
  }
  function _saveCodex(data) { Storage.set(STORAGE_KEY, data); }
  function _getEntry(nodeId) {
    const d = _loadCodex();
    return d.unlocks[nodeId] || { tier: 0, challenges: 0, correct: 0, streak: 0, lastSeen: 0 };
  }
  function _setEntry(nodeId, entry) {
    const d = _loadCodex();
    d.unlocks[nodeId] = entry;
    _saveCodex(d);
  }

  // === Tier 計算(雙來源:Mastery + Wrongbook + Codex 自有計數)===
  // 規則:
  //   tier 0(灰):無任何接觸
  //   tier 1(半透):Wrongbook 有此 node 的錯題,或 Mastery attempts > 0
  //   tier 2(彩):Mastery score ≥ 50
  //   tier 3(金):Mastery score ≥ 90 或 codex.streak ≥ 3
  function _computeTier(nodeId) {
    const m = Mastery.get(nodeId);
    const codex = _getEntry(nodeId);
    const wb = Wrongbook.load().some(x => x.nodeId === nodeId);

    if ((m.score >= SCORE_GOLD_THRESHOLD) || (codex.streak >= STREAK_GOLD_THRESHOLD)) {
      return TIER.GOLD;
    }
    if (m.score >= SCORE_COLOR_THRESHOLD) return TIER.COLOR;
    if (wb || (m.attempts || 0) > 0 || codex.challenges > 0) return TIER.TOUCHED;
    return TIER.LOCKED;
  }

  // === 過濾用 helper ===
  function _filterCards(cards, filters) {
    let out = cards;
    if (filters.subject && filters.subject !== 'all') {
      // 科目從 knowledge_code 推:L21*=科一 / L22*=科二(boundary subject) / L23*=科三
      const prefix = filters.subject === '1' ? 'L21' : filters.subject === '2' ? 'L22' : filters.subject === '3' ? 'L23' : null;
      if (prefix) out = out.filter(c => c.knowledge_code.startsWith(prefix));
    }
    if (filters.code && filters.code !== 'all') {
      out = out.filter(c => c.knowledge_code === filters.code);
    }
    if (filters.tier && filters.tier !== 'all') {
      const t = parseInt(filters.tier, 10);
      out = out.filter(c => _computeTier(c.id) === t);
    }
    if (filters.q) {
      const kw = filters.q.toLowerCase();
      out = out.filter(c =>
        c.id.toLowerCase().includes(kw) ||
        c.title.toLowerCase().includes(kw) ||
        c.knowledge_code.toLowerCase().includes(kw)
      );
    }
    return out;
  }

  // === HTML escape ===
  function esc(s) {
    if (s == null) return '';
    return (s + '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // === 主 Mode 物件 ===
  const Mode6 = {
    state: null,

    // 入口:start()
    async start() {
      RNG.set(Date.now()); // 鐵律 #2:每場新 seed
      // 還原可能殘留的 PlayEngine hook(若上次 challenge 中途離開)
      if (this._origAnswer) { PlayEngine.answer = this._origAnswer; this._origAnswer = null; }
      if (this._origOnNext !== undefined && this._origOnNext !== null) { PlayEngine.onNext = this._origOnNext; this._origOnNext = null; }
      try {
        await _loadCodexData();
      } catch (e) {
        // 已 toast,直接回首頁
        goHome();
        return;
      }
      this.state = {
        filters: { subject: 'all', code: 'all', tier: 'all', q: '' },
        currentNodeId: null
      };
      this.renderGrid();
    },

    // === 圖鑑網格主畫面 ===
    renderGrid() {
      if (!this.state) this.state = { filters: { subject: 'all', code: 'all', tier: 'all', q: '' }, currentNodeId: null };
      const cards = _allowList || [];
      const total = cards.length;
      const player = Player.load();

      // 統計
      let countLocked = 0, countTouched = 0, countColor = 0, countGold = 0;
      cards.forEach(c => {
        const t = _computeTier(c.id);
        if (t === TIER.GOLD) countGold++;
        else if (t === TIER.COLOR) countColor++;
        else if (t === TIER.TOUCHED) countTouched++;
        else countLocked++;
      });
      const unlocked = total - countLocked;

      // 過濾後清單
      const visible = _filterCards(cards, this.state.filters);

      // 所有 codes(從 allowList 動態取得,不寫死)
      const allCodes = [...new Set(cards.map(c => c.knowledge_code))].sort();

      // 過濾條
      const filterBar = `
        <div class="card" style="padding:12px">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <strong style="color:var(--fg-dim);font-size:0.85rem">🔍 過濾</strong>
            <select onchange="Mode6.setFilter('subject', this.value)" style="padding:6px 10px;border-radius:6px;background:var(--bg-3);color:var(--fg);border:1px solid var(--border)">
              <option value="all" ${this.state.filters.subject==='all'?'selected':''}>全科目</option>
              <option value="1" ${this.state.filters.subject==='1'?'selected':''}>科一(L21*)</option>
              <option value="2" ${this.state.filters.subject==='2'?'selected':''}>科二(L22*)</option>
              <option value="3" ${this.state.filters.subject==='3'?'selected':''}>科三(L23*)</option>
            </select>
            <select onchange="Mode6.setFilter('code', this.value)" style="padding:6px 10px;border-radius:6px;background:var(--bg-3);color:var(--fg);border:1px solid var(--border)">
              <option value="all" ${this.state.filters.code==='all'?'selected':''}>全編碼</option>
              ${allCodes.map(c => `<option value="${c}" ${this.state.filters.code===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <select onchange="Mode6.setFilter('tier', this.value)" style="padding:6px 10px;border-radius:6px;background:var(--bg-3);color:var(--fg);border:1px solid var(--border)">
              <option value="all" ${this.state.filters.tier==='all'?'selected':''}>全階級</option>
              <option value="0" ${this.state.filters.tier==='0'?'selected':''}>🔒 未接觸</option>
              <option value="1" ${this.state.filters.tier==='1'?'selected':''}>🌫 接觸過</option>
              <option value="2" ${this.state.filters.tier==='2'?'selected':''}>🌈 熟練中</option>
              <option value="3" ${this.state.filters.tier==='3'?'selected':''}>👑 精通</option>
            </select>
            <input type="text" placeholder="搜尋 ID / 標題..." value="${esc(this.state.filters.q)}"
              oninput="Mode6.setFilter('q', this.value)"
              style="padding:6px 10px;border-radius:6px;background:var(--bg-3);color:var(--fg);border:1px solid var(--border);min-width:160px;flex:1">
            ${(this.state.filters.subject!=='all'||this.state.filters.code!=='all'||this.state.filters.tier!=='all'||this.state.filters.q)
              ? `<button class="btn btn-ghost" style="padding:6px 12px" onclick="Mode6.clearFilters()">清除</button>` : ''}
          </div>
        </div>`;

      // 統計列
      const statsBar = `
        <div class="card" style="padding:12px">
          <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:0.9rem">
            <div>📚 總卡片 <strong>${total}</strong></div>
            <div>🔓 已解鎖 <strong style="color:#4ade80">${unlocked}</strong> / ${total} (${Math.round(unlocked/total*100)}%)</div>
            <div>👑 金卡 <strong style="color:#fbbf24">${countGold}</strong></div>
            <div>🌈 彩卡 <strong style="color:#60a5fa">${countColor}</strong></div>
            <div>🌫 半透卡 <strong style="color:#a3a3a3">${countTouched}</strong></div>
            <div>🔒 未接觸 <strong style="color:var(--fg-mute)">${countLocked}</strong></div>
            <div style="margin-left:auto">⚡ MP ${player.mp} / ${player.mpMax}</div>
          </div>
          <div class="hp-track" style="margin-top:10px;height:8px;background:rgba(255,255,255,0.06)">
            <div class="hp-fill" style="width:${Math.round(unlocked/total*100)}%;background:linear-gradient(90deg,#60a5fa,#fbbf24)"></div>
          </div>
        </div>`;

      // 卡片網格
      const gridHtml = visible.length === 0
        ? `<div class="card" style="text-align:center;padding:32px;color:var(--fg-dim)">沒有符合條件的卡片,試試清除過濾</div>`
        : `<div class="modes-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
            ${visible.map(c => this._renderCard(c)).join('')}
          </div>`;

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card">
          <h1>🃏 卡牌圖鑑大全</h1>
          <p style="color:var(--fg-dim)">收集 ${total} 張 IPAS 知識點卡牌。點任一卡 → 預習內容 → 挑戰封印解封升階。</p>
          <div style="font-size:0.85rem;color:var(--fg-mute);margin-top:6px">
            🔒 灰卡(未接觸) → 🌫 半透卡(接觸過) → 🌈 彩卡(熟練 ≥50) → 👑 金卡(精通 ≥90 或本案連對 ${STREAK_GOLD_THRESHOLD})
          </div>
        </div>
        ${statsBar}
        ${filterBar}
        <div class="card" style="padding:12px">
          ${gridHtml}
        </div>
        <div class="actions">
          <button class="btn btn-ghost" onclick="goHome()">🏠 回主頁</button>
          <button class="btn btn-ghost" onclick="Mode6.shareProgress()">📤 分享收藏進度</button>
          <button class="btn btn-ghost" onclick="if(confirm('重置圖鑑進度?(只清本案計數,不影響全域 Mastery / 錯題本)'))Mode6.resetCodex()">🔄 重置圖鑑</button>
        </div>
      `;
      show('view-play');
    },

    // 單張卡片 HTML
    _renderCard(card) {
      const tier = _computeTier(card.id);
      const m = Mastery.get(card.id);
      const codex = _getEntry(card.id);

      // 視覺樣式(按 tier 漸進)
      let style = '';
      let extraBadge = '';
      if (tier === TIER.LOCKED) {
        style = 'opacity:0.45;filter:grayscale(0.85)';
      } else if (tier === TIER.TOUCHED) {
        style = 'opacity:0.75';
      } else if (tier === TIER.COLOR) {
        style = 'border-color:#60a5fa;box-shadow:0 0 6px rgba(96,165,250,0.35)';
        extraBadge = `<span class="badge" style="background:#1e3a8a;color:#dbeafe">🌈 彩</span>`;
      } else if (tier === TIER.GOLD) {
        style = 'border-color:#fbbf24;box-shadow:0 0 14px rgba(251,191,36,0.55);background:linear-gradient(135deg,rgba(251,191,36,0.08),rgba(180,83,9,0.04))';
        extraBadge = `<span class="badge" style="background:#78350f;color:#fef3c7">👑 金</span>`;
      }

      // 預覽文字(按 tier 顯示不同層次)
      const kbNode = _kbIndex && _kbIndex[card.id];
      let preview = '';
      if (tier >= TIER.TOUCHED && kbNode && kbNode.summary) {
        const summary = kbNode.summary;
        preview = `<div style="font-size:0.78rem;color:var(--fg-dim);line-height:1.4;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(summary)}</div>`;
      }

      const masteryBar = (m.attempts || 0) > 0
        ? `<div class="hp-track" style="margin-top:6px;height:4px"><div class="hp-fill" style="width:${m.score}%;background:${tier===TIER.GOLD?'#fbbf24':tier===TIER.COLOR?'#60a5fa':'#94a3b8'}"></div></div>` : '';

      return `<button class="mode-card" onclick="Mode6.openCard('${card.id}')" style="text-align:left;${style}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px">
          <span class="badge" style="font-size:0.7rem">${esc(card.knowledge_code)}</span>
          ${extraBadge || `<span style="font-size:0.7rem;color:var(--fg-mute)">${TIER_LABEL[tier]}</span>`}
        </div>
        <div class="mode-title" style="font-size:0.92rem;line-height:1.3">${esc(card.title)}</div>
        <div style="font-size:0.7rem;color:var(--fg-mute);margin-top:2px">${esc(card.id)}</div>
        ${preview}
        ${masteryBar}
        ${codex.challenges > 0 ? `<div style="font-size:0.7rem;color:var(--fg-mute);margin-top:4px">挑戰 ${codex.correct}/${codex.challenges} · 連對 ${codex.streak}</div>` : ''}
      </button>`;
    },

    setFilter(key, value) {
      if (!this.state) return;
      this.state.filters[key] = value;
      this.renderGrid();
    },
    clearFilters() {
      if (!this.state) return;
      this.state.filters = { subject: 'all', code: 'all', tier: 'all', q: '' };
      this.renderGrid();
    },

    resetCodex() {
      Storage.del(STORAGE_KEY);
      showToast('🔄 圖鑑進度已重置');
      this.renderGrid();
    },

    shareProgress() {
      const cards = _allowList || [];
      let g = 0, c = 0, t = 0, l = 0;
      cards.forEach(card => {
        const tier = _computeTier(card.id);
        if (tier === TIER.GOLD) g++;
        else if (tier === TIER.COLOR) c++;
        else if (tier === TIER.TOUCHED) t++;
        else l++;
      });
      const total = cards.length;
      const text = `📚 我的 IPAS 卡牌圖鑑進度\n` +
        `總卡 ${total} 張 · 已解鎖 ${total - l}\n` +
        `👑 金卡 ${g} · 🌈 彩卡 ${c} · 🌫 半透 ${t} · 🔒 未接觸 ${l}\n` +
        `📅 ${new Date().toLocaleDateString('zh-TW')}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('📋 進度已複製到剪貼簿', 2500))
          .catch(() => showToast(text, 4500));
      } else {
        showToast(text, 4500);
      }
    },

    // === 卡片詳情面板 ===
    openCard(nodeId) {
      if (!this.state) this.state = { filters: { subject: 'all', code: 'all', tier: 'all', q: '' }, currentNodeId: null };
      const card = (_allowList || []).find(c => c.id === nodeId);
      if (!card) { showToast('找不到此節點'); return; }
      this.state.currentNodeId = nodeId;

      const tier = _computeTier(nodeId);
      const m = Mastery.get(nodeId);
      const codex = _getEntry(nodeId);
      const kbNode = (_kbIndex && _kbIndex[nodeId]) || null;
      const player = Player.load();

      // 階梯顯示:
      //   tier 0:只 title + knowledge_code(教學預習功能:預設可看 title)
      //   tier 1+:加 summary
      //   tier 2+:加 key_points
      //   tier 3:全顯(misconceptions + explanation_hooks)
      const showSummary = tier >= TIER.TOUCHED;
      const showKeyPoints = tier >= TIER.COLOR;
      const showFull = tier >= TIER.GOLD;

      const summaryHtml = (showSummary && kbNode && kbNode.summary)
        ? `<div style="background:rgba(96,165,250,0.10);border-left:4px solid #60a5fa;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#60a5fa;font-weight:700;font-size:0.85rem;margin-bottom:4px">📖 概述(summary)</div>
            <div style="line-height:1.7">${esc(kbNode.summary)}</div>
          </div>`
        : (showSummary && !kbNode)
          ? `<div style="color:var(--fg-mute);font-size:0.85rem;margin:10px 0">(此節點 kb 詳情尚未收錄,僅顯示白名單標題)</div>`
          : '';

      const keyPointsHtml = (showKeyPoints && kbNode && Array.isArray(kbNode.key_points) && kbNode.key_points.length > 0)
        ? `<div style="background:rgba(74,222,128,0.10);border-left:4px solid #4ade80;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#4ade80;font-weight:700;font-size:0.85rem;margin-bottom:6px">🎯 重點(key_points)</div>
            <ul style="margin:0;padding-left:20px;line-height:1.8">
              ${kbNode.key_points.map(k => `<li>${esc(k)}</li>`).join('')}
            </ul>
          </div>` : '';

      // schema 欄位是 common_misconceptions(不是 misconceptions)
      const misconHtml = (showFull && kbNode && Array.isArray(kbNode.common_misconceptions) && kbNode.common_misconceptions.length > 0)
        ? `<div style="background:rgba(168,85,247,0.10);border-left:4px solid #a855f7;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#c084fc;font-weight:700;font-size:0.85rem;margin-bottom:6px">⚠️ 常見誤解(common_misconceptions)</div>
            <ul style="margin:0;padding-left:20px;line-height:1.8">
              ${kbNode.common_misconceptions.map(k => `<li>${esc(k)}</li>`).join('')}
            </ul>
          </div>` : '';

      const hooksHtml = (showFull && kbNode && Array.isArray(kbNode.explanation_hooks) && kbNode.explanation_hooks.length > 0)
        ? `<div style="background:rgba(250,204,21,0.10);border-left:4px solid #facc15;padding:12px;border-radius:6px;margin:10px 0">
            <div style="color:#facc15;font-weight:700;font-size:0.85rem;margin-bottom:6px">💡 記憶口訣 / 切入點(explanation_hooks)</div>
            <ul style="margin:0;padding-left:20px;line-height:1.8">
              ${kbNode.explanation_hooks.map(k => `<li>${esc(k)}</li>`).join('')}
            </ul>
          </div>` : '';

      // 提示:尚未解鎖的下一階解封條件
      const lockHint = tier < TIER.GOLD
        ? `<div style="background:rgba(255,255,255,0.04);border-left:4px solid var(--fg-mute);padding:10px 12px;border-radius:6px;margin:10px 0;color:var(--fg-dim);font-size:0.9rem">
            🔓 解封下一階:${
              tier === TIER.LOCKED
                ? '挑戰任一題後即可看到 summary'
                : tier === TIER.TOUCHED
                  ? `Mastery 達 ${SCORE_COLOR_THRESHOLD}(目前 ${m.score})可看 key_points`
                  : `Mastery 達 ${SCORE_GOLD_THRESHOLD}(目前 ${m.score})或本案連對 ${STREAK_GOLD_THRESHOLD} 題(目前 ${codex.streak})看完整內容`
            }
          </div>` : '';

      // 該節點題庫量
      const qsForNode = QUESTIONS.filter(q => q.node_id === nodeId);
      const hasQuestions = qsForNode.length > 0;
      const mpEnough = player.mp >= MP_COST_CHALLENGE;

      const challengeBtn = !hasQuestions
        ? `<button class="btn btn-ghost" disabled>⚠️ 此節點題庫無對應題目</button>`
        : !mpEnough
          ? `<button class="btn btn-ghost" disabled>⚔️ 挑戰此節點(需 ${MP_COST_CHALLENGE} MP,目前 ${player.mp})</button>`
          : `<button class="btn btn-primary" onclick="Mode6.challenge('${nodeId}')">⚔️ 挑戰此節點(消耗 ${MP_COST_CHALLENGE} MP)</button>`;

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
            <span class="badge">${esc(card.knowledge_code)}</span>
            <span class="badge">${TIER_LABEL[tier]}</span>
            <span class="badge" style="font-size:0.7rem">${esc(nodeId)}</span>
            ${codex.challenges > 0
              ? `<span style="font-size:0.85rem;color:var(--fg-dim)">挑戰 ${codex.correct}/${codex.challenges} · 連對 ${codex.streak}</span>`
              : ''}
          </div>
          <h1 style="margin:0">${esc(card.title)}</h1>
          ${(m.attempts||0) > 0 ? `
            <div style="margin-top:10px">
              <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:4px">熟練度 ${m.score} / 100 · 嘗試 ${m.attempts} 次 · 答對 ${m.correct}</div>
              <div class="hp-track"><div class="hp-fill" style="width:${m.score}%;background:linear-gradient(90deg,#60a5fa,#fbbf24)"></div></div>
            </div>` : ''}
        </div>

        <div class="card">
          ${summaryHtml || (tier === TIER.LOCKED ? `<div style="color:var(--fg-mute);text-align:center;padding:24px">🔒 此卡尚未接觸<br><span style="font-size:0.85rem">挑戰任一題即可解封 summary</span></div>` : '')}
          ${keyPointsHtml}
          ${misconHtml}
          ${hooksHtml}
          ${lockHint}
          ${hasQuestions
            ? `<div style="font-size:0.8rem;color:var(--fg-mute);margin-top:6px">📦 此節點題庫:${qsForNode.length} 題</div>`
            : `<div style="font-size:0.8rem;color:#fbbf24;margin-top:6px">⚠️ 此節點題庫尚未建題,可先預習文字內容</div>`}
        </div>

        <div class="actions">
          ${challengeBtn}
          <button class="btn btn-ghost" onclick="Mode6.renderGrid()">⬅️ 回圖鑑</button>
          <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
        </div>
      `;
      show('view-play');
    },

    // === 挑戰節點(寫路徑) ===
    challenge(nodeId) {
      const card = (_allowList || []).find(c => c.id === nodeId);
      if (!card) return;
      const player = Player.load();
      if (player.mp < MP_COST_CHALLENGE) {
        showToast(`MP 不足(需 ${MP_COST_CHALLENGE},目前 ${player.mp})`); return;
      }
      // 鐵律 #2:每次挑戰隨機抽題(RNG.set + RNG.pickN)
      RNG.set(Date.now());
      const pool = QUESTIONS.filter(q => q.node_id === nodeId);
      if (pool.length === 0) { showToast('此節點無題目'); return; }
      const picked = RNG.pickN(pool, 1)[0];
      if (!picked) { showToast('抽題失敗'); return; }

      // 扣 MP
      player.mp = Math.max(0, player.mp - MP_COST_CHALLENGE);
      Player.save(player);

      // 計挑戰次數
      const entry = _getEntry(nodeId);
      entry.challenges = (entry.challenges || 0) + 1;
      entry.lastSeen = Date.now();
      _setEntry(nodeId, entry);

      // 渲染題目並接管 PlayEngine
      this.state = this.state || { filters: { subject: 'all', code: 'all', tier: 'all', q: '' } };
      this.state.currentNodeId = nodeId;

      const ctx = `<div class="boss-bar" style="background:linear-gradient(90deg,#1e3a8a,#0f766e)">
        <div class="boss-name">⚔️ 挑戰封印 — ${esc(card.knowledge_code)} · ${esc(card.title)}</div>
        <div style="font-size:0.85rem;color:rgba(255,255,255,0.85);margin-top:4px">
          答對:Mastery +(共用層公式)· 連對 ${STREAK_GOLD_THRESHOLD} 題升金卡<br>
          答錯:走鐵律 #1 結構化下鑽變化型訓練
        </div>
      </div>`;

      // 攔截 PlayEngine.answer 與 onNext 以追蹤本次挑戰結果並控制下一步
      // 兩者都須在所有退場路徑(包括 goHome 中途離開)還原 — 避免 Mode6 hook 殘留影響其他 mode(案例 4 教訓)
      const origAnswer = PlayEngine.answer.bind(PlayEngine);
      const origOnNext = PlayEngine.onNext;  // 可能 undefined,也要保存
      const self = this;
      // 保存以便外部 cleanup(若 challenge 啟動但使用者中途按 home,start() 下次重置)
      this._origAnswer = origAnswer;
      this._origOnNext = origOnNext;
      PlayEngine.answer = function(key) {
        const opt = this.current.options.find(o => o.key === key);
        const isCorrect = !!(opt && opt.is_correct);
        // 還原 answer(只攔一次)
        PlayEngine.answer = origAnswer;
        self._origAnswer = null;
        // 更新 codex 計數
        const e = _getEntry(nodeId);
        if (isCorrect) {
          e.correct = (e.correct || 0) + 1;
          e.streak = (e.streak || 0) + 1;
        } else {
          e.streak = 0;
        }
        e.lastSeen = Date.now();
        _setEntry(nodeId, e);
        // 委派共用層處理 Mastery / Wrongbook
        origAnswer(key);
        // 升階特效檢查
        self._checkTierUp(nodeId);
      };

      // 答完一題後行為:答對 → 回卡片詳情;答錯 → DrillSession 下鑽(鐵律 #1)
      PlayEngine.onNext = () => {
        // 還原 onNext(只攔一次,避免 hook 殘留)
        PlayEngine.onNext = origOnNext;
        self._origOnNext = null;
        // 判斷上一題對錯:從 codex.streak 推(剛才答對 streak ≥ 1,答錯則 = 0 但 challenges 已 +1)
        // 為精確,改用最後一題渲染狀態:Wrongbook.load 看 qid 是否剛被加
        const lastQ = PlayEngine.current;
        const wb = Wrongbook.load();
        const isWrongLast = lastQ && wb.some(x => x.qid === lastQ.id && Math.abs(Date.now() - x.lastWrong) < 5000);
        if (isWrongLast) {
          // 鐵律 #1:答錯走 DrillSession,完成後回卡片詳情
          const variations = generateVariation(lastQ, 3);
          if (!variations || variations.length === 0) {
            showToast('⚠️ 變化型不足,直接回卡片', 2500);
            self.openCard(nodeId);
            return;
          }
          DrillSession.start(nodeId, variations, lastQ, () => {
            self.openCard(nodeId);
          });
        } else {
          // 答對 → 回卡片詳情(可能已升階)
          self.openCard(nodeId);
        }
      };

      PlayEngine.show(picked, { contextHTML: ctx });
    },

    // === 升階特效 + tier 同步 ===
    _checkTierUp(nodeId) {
      const tierNow = _computeTier(nodeId);
      const codex = _getEntry(nodeId);
      const prevTier = codex.tier || 0;
      if (tierNow > prevTier) {
        codex.tier = tierNow;
        _setEntry(nodeId, codex);
        const card = (_allowList || []).find(c => c.id === nodeId);
        const title = card ? card.title : nodeId;
        if (tierNow === TIER.TOUCHED) {
          showToast(`🌫 「${title}」解封 — 已可看 summary`, 2500);
        } else if (tierNow === TIER.COLOR) {
          showToast(`🌈 「${title}」升彩卡!可看 key_points`, 2800);
          GameFX.confetti({ count: 60, colors: ['#60a5fa','#3b82f6','#1e3a8a'] });
        } else if (tierNow === TIER.GOLD) {
          showToast(`👑 「${title}」精通!金卡解鎖!`, 3500);
          GameFX.bigConfetti();
        }
      }
    }
  };

  window.Mode6 = Mode6;
})();
