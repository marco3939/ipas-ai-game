// ============================================================
// Mode 4: 易混淆配對戰 — Match-3 風格真拖拉(v2 完整重做)
// 鐵律 #5(來源忠實性):配對來源僅 questions-pc-modes.json format='matching'
// 鐵律 #1(下鑽):配對錯誤可即時下鑽該知識點變化型
// 互動:Pointer Events 真拖拉(touch + mouse),HP/MP/Combo/限時
// ============================================================
(function () {

  const ROUND_SECONDS = 90;       // 每場 90 秒
  const FREEZE_SECONDS = 5;       // 凍結時間 5 秒
  const HINT_COST = 12;           // MP 消耗
  const FREEZE_COST = 18;
  const SHUFFLE_COST = 8;

  // ===== 從題庫抽出配對對 =====
  // 鐵律 #5:絕不自造,僅取 format='matching' 題目的「**中心概念** ↔ 正確選項」
  function extractPairs() {
    const matches = (window.QUESTIONS || []).filter(q => q.format === 'matching');
    const pairs = [];
    for (const q of matches) {
      const m = (q.stem || '').match(/\*\*(.+?)\*\*/);
      if (!m) continue;
      const concept = m[1].trim();
      const correct = (q.options || []).find(o => o.is_correct);
      if (!concept || !correct || !correct.text) continue;
      pairs.push({
        pairId: q.id,
        nodeId: q.node_id,
        concept,
        description: correct.text,
        hook: (q.explanation && q.explanation.hook) || '',
        knowledge_code: q.knowledge_code,
        difficulty: q.difficulty,
        sourceQ: q   // 用於下鑽
      });
    }
    return pairs;
  }

  // 文字截斷(描述太長時)
  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.substring(0, n) + '…' : s;
  }

  const Mode4 = {
    state: null,
    timer: null,
    dragState: null,

    start() {
      RNG.set(Date.now());
      const pairs = extractPairs();
      if (pairs.length < 4) {
        showToast(`配對題不足(目前 ${pairs.length} 對),需 ≥ 4 對才能開戰`, 3500);
        goHome();
        return;
      }

      // 棋盤大小決策(鐵律 #5:不足時用較小棋盤,絕不自造)
      let boardSize, pairCount;
      if (pairs.length >= 8)      { boardSize = 4; pairCount = 8; }   // 4x4 = 16 卡(8 對)
      else if (pairs.length >= 6) { boardSize = 4; pairCount = 6; }   // 4x3 = 12 卡(6 對)
      else                        { boardSize = 4; pairCount = 4; }   // 4x2 = 8 卡(4 對)

      const chosen = RNG.pickN(pairs, pairCount);

      // 把每對拆成 2 張卡(concept 卡 + description 卡)
      const cards = [];
      chosen.forEach((p, i) => {
        cards.push({ id: 'c-' + i + '-A', pairId: p.pairId, kind: 'concept',     text: p.concept,            data: p, matched: false });
        cards.push({ id: 'c-' + i + '-B', pairId: p.pairId, kind: 'description', text: truncate(p.description, 90), full: p.description, data: p, matched: false });
      });
      const shuffled = RNG.shuffle(cards);

      this.state = {
        boardSize, pairCount,
        cards: shuffled,
        time: ROUND_SECONDS,
        combo: 0, maxCombo: 0,
        matched: 0, mismatched: 0,
        score: 0,
        revealed: new Set(),       // 已用「揭露一對」記住的 pairId
        frozen: 0,                 // 剩餘凍結秒數
        finished: false,
        playerSnap: Player.load()  // 起點 HP/MP 快照(用於結算對比)
      };

      this.render();
      this.startTimer();
    },

    startTimer() {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (this.state.finished) return;
        if (this.state.frozen > 0) {
          this.state.frozen--;
        } else {
          this.state.time--;
        }
        this.updateHud();
        if (this.state.time <= 0) this.timeUp();
      }, 1000);
    },

    stopTimer() { clearInterval(this.timer); this.timer = null; },

    render() {
      const p = Player.load();
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" id="m4-arena">
          <div class="enemy-bar">
            <div class="avatar boss" style="font-size:2rem">⚡</div>
            <div class="bar-info">
              <div class="bar-name">易混淆配對戰 BOSS</div>
              <div class="hp-track"><div class="hp-fill" id="m4-time-bar" style="width:100%;background:linear-gradient(90deg,#38bdf8,#a855f7)"></div></div>
              <div class="hp-text" id="m4-time-text">⏱️ ${this.state.time}s · 配對 0/${this.state.pairCount} · COMBO 0</div>
            </div>
          </div>
          <div class="player-bar">
            <div class="avatar" id="m4-player-avatar">🧠</div>
            <div class="bar-info">
              <div class="bar-name"><span class="level">Lv.${p.level}</span> 概念對戰選手(你)</div>
              <div class="hp-track"><div class="hp-fill" id="m4-hp-fill"></div></div>
              <div class="hp-text" id="m4-hp-text"></div>
            </div>
          </div>

          <div class="skill-tray" id="m4-skills"></div>

          <div id="m4-board" class="m4-board" style="
            display:grid;
            grid-template-columns:repeat(${this.state.boardSize}, 1fr);
            gap:8px;
            position:relative;
            min-height:320px;
            padding:8px;
            background:rgba(0,0,0,0.25);
            border-radius:var(--radius);
          "></div>

          <div id="m4-hint" style="margin-top:10px;font-size:0.85rem;color:var(--fg-dim);text-align:center">
            🖐️ <strong>拖拉一張卡片</strong>到另一張卡片上,系統會檢查兩張是否為一對
          </div>

          <div class="actions" style="margin-top:12px;justify-content:center">
            <button class="btn btn-ghost" onclick="Mode4.exit()">🚪 撤退(放棄本場)</button>
          </div>
        </div>

        <style>
          .m4-card {
            background: var(--bg-2);
            border: 2px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 8px;
            min-height: 70px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-size: 0.85rem;
            line-height: 1.35;
            user-select: none;
            -webkit-user-select: none;
            cursor: grab;
            transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
            touch-action: none;
            position: relative;
            word-break: break-word;
          }
          .m4-card.concept {
            background: linear-gradient(135deg, #1e3a8a, #3730a3);
            color: #e0e7ff;
            font-weight: 700;
            font-size: 0.95rem;
          }
          .m4-card.description {
            background: linear-gradient(135deg, #1e293b, #334155);
            color: #cbd5e1;
            font-size: 0.78rem;
          }
          .m4-card.dragging {
            cursor: grabbing;
            opacity: 0.85;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            z-index: 1000;
          }
          .m4-card.drop-target {
            border-color: var(--warn);
            box-shadow: 0 0 16px rgba(250,204,21,0.6);
            transform: scale(1.05);
          }
          .m4-card.matched {
            border-color: var(--success);
            background: linear-gradient(135deg, rgba(74,222,128,0.25), rgba(34,197,94,0.15));
            cursor: default;
            animation: m4-pop 0.4s ease;
          }
          .m4-card.mismatched {
            border-color: var(--danger);
            animation: m4-shake 0.4s;
          }
          .m4-card.revealed {
            border-color: #facc15;
            box-shadow: 0 0 10px rgba(250,204,21,0.4);
          }
          .m4-card.frozen-overlay::after {
            content: '❄️';
            position: absolute;
            top: 4px; right: 6px;
            font-size: 1rem;
            opacity: 0.7;
          }
          @keyframes m4-pop {
            0% { transform: scale(1); }
            50% { transform: scale(1.12); }
            100% { transform: scale(1); }
          }
          @keyframes m4-shake {
            0%,100% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            75% { transform: translateX(8px); }
          }
        </style>
      `;
      this.renderBoard();
      this.updateHud();
      this.updateSkillTray();
      show('view-play');
    },

    renderBoard() {
      const board = document.getElementById('m4-board');
      if (!board) return;
      board.innerHTML = this.state.cards.map(c => {
        const cls = ['m4-card', c.kind];
        if (c.matched) cls.push('matched');
        if (this.state.revealed.has(c.pairId) && !c.matched) cls.push('revealed');
        const safe = (c.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const full = c.full ? `title="${c.full.replace(/"/g,'&quot;')}"` : '';
        return `<div class="${cls.join(' ')}" data-id="${c.id}" data-pair="${c.pairId}" data-kind="${c.kind}" ${full}>${safe}</div>`;
      }).join('');
      this.bindDrag();
    },

    // ===== Pointer-based 真拖拉(touch + mouse 通用)=====
    bindDrag() {
      const board = document.getElementById('m4-board');
      if (!board) return;
      board.querySelectorAll('.m4-card').forEach(card => {
        if (card.classList.contains('matched')) return;
        card.addEventListener('pointerdown', (e) => this.onPointerDown(e, card));
      });
    },

    onPointerDown(e, card) {
      if (this.state.finished) return;
      if (card.classList.contains('matched')) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      // 建立 ghost(視覺跟隨,原 card 留在原位顯示半透明)
      const ghost = card.cloneNode(true);
      ghost.classList.add('dragging');
      ghost.style.position = 'fixed';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.pointerEvents = 'none';
      ghost.style.margin = '0';
      document.body.appendChild(ghost);
      card.style.opacity = '0.4';

      this.dragState = {
        sourceCard: card,
        sourceId: card.dataset.id,
        sourcePair: card.dataset.pair,
        ghost,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        currentTarget: null
      };

      const onMove = (ev) => this.onPointerMove(ev);
      const onUp = (ev) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        this.onPointerUp(ev);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },

    onPointerMove(e) {
      const ds = this.dragState;
      if (!ds) return;
      ds.ghost.style.left = (e.clientX - ds.offsetX) + 'px';
      ds.ghost.style.top = (e.clientY - ds.offsetY) + 'px';

      // 偵測底下卡片(忽略 ghost 與自身)
      ds.ghost.style.display = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      ds.ghost.style.display = '';

      const targetCard = el ? el.closest('.m4-card') : null;
      const validTarget = targetCard
        && targetCard !== ds.sourceCard
        && !targetCard.classList.contains('matched');

      if (ds.currentTarget && ds.currentTarget !== targetCard) {
        ds.currentTarget.classList.remove('drop-target');
      }
      if (validTarget) {
        targetCard.classList.add('drop-target');
        ds.currentTarget = targetCard;
      } else {
        ds.currentTarget = null;
      }
    },

    onPointerUp(e) {
      const ds = this.dragState;
      if (!ds) return;
      // 還原來源
      ds.sourceCard.style.opacity = '';
      // 拿到目前 target(用 elementFromPoint 再算一次,避免 currentTarget 殘留)
      ds.ghost.style.display = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      ds.ghost.style.display = '';
      const targetCard = el ? el.closest('.m4-card') : null;

      if (ds.currentTarget) ds.currentTarget.classList.remove('drop-target');
      ds.ghost.remove();

      const valid = targetCard
        && targetCard !== ds.sourceCard
        && !targetCard.classList.contains('matched');

      this.dragState = null;

      if (valid) {
        this.tryMatch(ds.sourceCard, targetCard);
      }
    },

    // ===== 配對檢查 =====
    tryMatch(cardA, cardB) {
      if (this.state.finished) return;
      const samePair = cardA.dataset.pair === cardB.dataset.pair;
      const diffKind = cardA.dataset.kind !== cardB.dataset.kind;

      if (samePair && diffKind) {
        this.onMatch(cardA, cardB);
      } else {
        this.onMismatch(cardA, cardB, samePair);
      }
    },

    onMatch(cardA, cardB) {
      // 標記資料層
      const ids = [cardA.dataset.id, cardB.dataset.id];
      this.state.cards.forEach(c => { if (ids.includes(c.id)) c.matched = true; });

      this.state.matched++;
      this.state.combo++;
      if (this.state.combo > this.state.maxCombo) this.state.maxCombo = this.state.combo;

      // 分數:基礎 100 + Combo 倍率
      const baseScore = 100;
      const comboBonus = Math.max(0, this.state.combo - 1) * 25;
      this.state.score += baseScore + comboBonus;

      // HP/MP 回血(配對對 +6/+5,Combo 加成)
      const player = Player.load();
      const hpHeal = 6 + Math.min(this.state.combo, 4);
      const mpHeal = 5 + Math.min(this.state.combo, 4);
      const before = { hp: player.hp, mp: player.mp };
      player.hp = Math.min(player.hpMax, player.hp + hpHeal);
      player.mp = Math.min(player.mpMax, player.mp + mpHeal);
      Player.save(player);

      // 視覺反饋
      cardA.classList.add('matched');
      cardB.classList.add('matched');
      // 移除拖拉綁定(matched 之後不可拖)
      cardA.style.cursor = 'default';
      cardB.style.cursor = 'default';

      GameFX.flash('correct');
      const playerAv = document.getElementById('m4-player-avatar');
      GameFX.attackAnim(playerAv);
      if (player.hp > before.hp) {
        setTimeout(() => GameFX.damageNumber(playerAv, '+' + (player.hp - before.hp), { kind: 'player' }), 200);
      }
      if (this.state.combo >= 2) GameFX.combo(this.state.combo);
      if (this.state.combo >= 3) {
        GameFX.confetti({ count: 60, colors: ['#fbbf24','#a855f7','#38bdf8'] });
      }
      if (this.state.combo === 5) {
        showToast('🔥 5 連配!概念戰神!', 2000);
      }

      // 鐵律 #1:依舊更新 mastery(答對 = 配對成功)
      const pairData = this.state.cards.find(c => c.id === cardA.dataset.id).data;
      if (pairData && pairData.nodeId) Mastery.update(pairData.nodeId, true);
      Progress.addAnswer(true);

      this.updateHud();
      this.updateSkillTray();

      // 全配完 → 勝利
      if (this.state.matched >= this.state.pairCount) {
        setTimeout(() => this.victory(), 600);
      }
    },

    onMismatch(cardA, cardB, samePair) {
      this.state.combo = 0;
      this.state.mismatched++;

      // 扣 HP(基礎 6,連續錯加重)
      const dmg = 6 + Math.min(this.state.mismatched, 6);
      Player.damage(dmg);

      // 視覺反饋
      cardA.classList.add('mismatched');
      cardB.classList.add('mismatched');
      GameFX.flash('wrong');
      GameFX.hideCombo();
      const playerAv = document.getElementById('m4-player-avatar');
      GameFX.shake(playerAv);
      GameFX.damageNumber(playerAv, dmg, { kind: 'enemy' });

      setTimeout(() => {
        cardA.classList.remove('mismatched');
        cardB.classList.remove('mismatched');
      }, 500);

      // 鐵律 #1:配對錯,記錄錯題 + 提供下鑽
      const pairData = this.state.cards.find(c => c.id === cardA.dataset.id).data;
      const otherData = this.state.cards.find(c => c.id === cardB.dataset.id).data;
      if (pairData && pairData.nodeId) Mastery.update(pairData.nodeId, false);
      Progress.addAnswer(false);
      if (pairData && pairData.sourceQ) {
        const correctOpt = pairData.sourceQ.options.find(o => o.is_correct);
        if (correctOpt) Wrongbook.add(pairData.sourceQ.id, pairData.nodeId, '?', correctOpt.text.substring(0, 4));
      }

      // 顯示提示框,允許玩家立即下鑽
      this.showMismatchToast(pairData, otherData);

      this.updateHud();
      this.updateSkillTray();

      // HP 0 → 失敗
      const player = Player.load();
      if (player.hp <= 0) {
        setTimeout(() => this.gameOver(), 1200);
      }
    },

    showMismatchToast(pairA, pairB) {
      // 在頂部彈出小提示,玩家可選擇立即下鑽
      const existing = document.getElementById('m4-mismatch-toast');
      if (existing) existing.remove();
      const t = document.createElement('div');
      t.id = 'm4-mismatch-toast';
      t.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
        background: rgba(15,23,42,0.96); border: 2px solid var(--danger);
        padding: 10px 14px; border-radius: var(--radius); z-index: 250;
        max-width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.6);
        font-size: 0.85rem; line-height: 1.5;
      `;
      const conceptA = pairA && pairA.concept ? pairA.concept : '?';
      const conceptB = pairB && pairB.concept ? pairB.concept : '?';
      t.innerHTML = `
        <div style="color:#f87171;font-weight:700;margin-bottom:4px">❌ 配對失敗</div>
        <div style="color:var(--fg-dim);margin-bottom:6px">「${conceptA}」 ✗ 「${conceptB}」 不是同一對</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-warn" style="padding:4px 10px;font-size:0.8rem" onclick="Mode4.drillThis('${pairA && pairA.pairId || ''}')">🎯 立即下鑽變化型</button>
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:0.8rem" onclick="document.getElementById('m4-mismatch-toast')?.remove()">關閉</button>
        </div>
      `;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4500);
    },

    drillThis(pairId) {
      // 鐵律 #1:對該配對的原題做結構化下鑽
      const card = this.state.cards.find(c => c.pairId === pairId);
      if (!card || !card.data || !card.data.sourceQ) {
        showToast('找不到下鑽來源題', 2000);
        return;
      }
      const toast = document.getElementById('m4-mismatch-toast');
      if (toast) toast.remove();

      const sourceQ = card.data.sourceQ;
      const variations = generateVariation(sourceQ, 3);
      if (!variations || variations.length === 0) {
        showToast('⚠️ 此知識點變化型不足,繼續配對戰', 2500);
        return;
      }

      // 暫停計時、進入下鑽,結束後恢復
      this.stopTimer();
      const savedTime = this.state.time;
      DrillSession.start(sourceQ.node_id, variations, sourceQ, () => {
        // 恢復:重新渲染配對戰並接續計時
        this.state.time = savedTime;
        this.render();
        this.startTimer();
      });
    },

    // ===== HUD / 技能 =====
    updateHud() {
      const timeEl = document.getElementById('m4-time-text');
      const barEl = document.getElementById('m4-time-bar');
      const hpFill = document.getElementById('m4-hp-fill');
      const hpText = document.getElementById('m4-hp-text');
      if (!timeEl) return;

      const pct = (this.state.time / ROUND_SECONDS) * 100;
      barEl.style.width = pct + '%';
      barEl.style.background = pct < 30
        ? 'linear-gradient(90deg,#ef4444,#dc2626)'
        : pct < 60
          ? 'linear-gradient(90deg,#facc15,#f59e0b)'
          : 'linear-gradient(90deg,#38bdf8,#a855f7)';

      const frozenLabel = this.state.frozen > 0 ? ` ❄️${this.state.frozen}s` : '';
      timeEl.textContent = `⏱️ ${this.state.time}s${frozenLabel} · 配對 ${this.state.matched}/${this.state.pairCount} · COMBO ${this.state.combo} · 分數 ${this.state.score}`;

      const p = Player.load();
      if (hpFill) {
        const hpPct = p.hp / p.hpMax * 100;
        hpFill.style.width = hpPct + '%';
        hpFill.className = 'hp-fill' + (hpPct < 30 ? ' critical' : hpPct < 60 ? ' low' : '');
      }
      if (hpText) hpText.textContent = `HP ${p.hp}/${p.hpMax} · MP ${p.mp}/${p.mpMax}`;
    },

    updateSkillTray() {
      const tray = document.getElementById('m4-skills');
      if (!tray) return;
      const p = Player.load();
      tray.innerHTML = `
        <button class="skill-btn" onclick="Mode4.useReveal()" ${p.mp < HINT_COST ? 'disabled' : ''}>🔍 揭露一對 <span class="skill-cost">${HINT_COST}MP</span></button>
        <button class="skill-btn" onclick="Mode4.useFreeze()" ${p.mp < FREEZE_COST || this.state.frozen > 0 ? 'disabled' : ''}>❄️ 凍結 ${FREEZE_SECONDS}s <span class="skill-cost">${FREEZE_COST}MP</span></button>
        <button class="skill-btn" onclick="Mode4.useShuffle()" ${p.mp < SHUFFLE_COST ? 'disabled' : ''}>🔀 重排棋盤 <span class="skill-cost">${SHUFFLE_COST}MP</span></button>
      `;
    },

    useReveal() {
      const p = Player.load();
      if (p.mp < HINT_COST) return showToast('MP 不足');
      // 找一對尚未配對成功的
      const candidates = this.state.cards.filter(c => !c.matched && !this.state.revealed.has(c.pairId));
      if (candidates.length === 0) return showToast('沒有可揭露的配對');
      const pick = RNG.pick(candidates);
      this.state.revealed.add(pick.pairId);
      p.mp -= HINT_COST; Player.save(p);
      showToast(`💡 已標示一對:「${pick.data.concept}」(黃框)`, 2500);
      this.renderBoard();
      this.updateSkillTray();
    },

    useFreeze() {
      const p = Player.load();
      if (p.mp < FREEZE_COST) return showToast('MP 不足');
      if (this.state.frozen > 0) return;
      p.mp -= FREEZE_COST; Player.save(p);
      this.state.frozen = FREEZE_SECONDS;
      showToast(`❄️ 凍結時間 ${FREEZE_SECONDS} 秒`, 2000);
      this.updateHud();
      this.updateSkillTray();
    },

    useShuffle() {
      const p = Player.load();
      if (p.mp < SHUFFLE_COST) return showToast('MP 不足');
      p.mp -= SHUFFLE_COST; Player.save(p);
      // 只洗未配對的卡片(matched 保留位置)
      const matched = this.state.cards.filter(c => c.matched);
      const unmatched = this.state.cards.filter(c => !c.matched);
      const shuffled = RNG.shuffle(unmatched);
      // 重組:依原始 cards 順序填入,matched 留原位,unmatched 填入打亂的
      let i = 0;
      this.state.cards = this.state.cards.map(c => c.matched ? c : shuffled[i++]);
      showToast('🔀 棋盤已重排', 1500);
      this.renderBoard();
      this.updateSkillTray();
    },

    // ===== 結算 =====
    timeUp() {
      if (this.state.finished) return;
      this.state.finished = true;
      this.stopTimer();
      const allMatched = this.state.matched >= this.state.pairCount;
      if (allMatched) this.victory();
      else this.defeat('⏰ 時間到!');
    },

    victory() {
      if (this.state.finished && this.state.matched < this.state.pairCount) return;
      this.state.finished = true;
      this.stopTimer();

      // EXP 獎勵
      const baseExp = 50 + this.state.matched * 8;
      const timeBonus = this.state.time * 2;
      const comboBonus = this.state.maxCombo * 10;
      const perfectBonus = this.state.mismatched === 0 ? 60 : 0;
      const totalExp = baseExp + timeBonus + comboBonus + perfectBonus;
      Player.gainExp(totalExp);

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#fbbf24;font-size:2rem">🏆 配對戰勝利!</h1>
          <div style="font-size:4rem;margin:16px 0">⚡</div>
          <div style="background:rgba(0,0,0,0.5);padding:16px;border-radius:var(--radius);margin:16px 0;text-align:left">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>✅ 配對 <strong style="color:#4ade80">${this.state.matched}/${this.state.pairCount}</strong></div>
              <div>❌ 失誤 <strong style="color:#f87171">${this.state.mismatched}</strong></div>
              <div>🔥 最高連配 <strong>${this.state.maxCombo}</strong></div>
              <div>⏱️ 剩餘時間 <strong>${this.state.time}s</strong></div>
              <div>🏅 分數 <strong>${this.state.score}</strong></div>
              <div>⭐ 完美 <strong>${this.state.mismatched === 0 ? '是' : '否'}</strong></div>
            </div>
            <hr style="margin:12px 0;border-color:var(--border)">
            <div style="font-size:1.3rem;color:#fbbf24;font-weight:800;text-align:center">+${totalExp} EXP</div>
            <div style="font-size:0.85rem;color:var(--fg-dim);text-align:center;margin-top:4px">
              基礎 ${baseExp} + 時間 ${timeBonus} + 連配 ${comboBonus}${perfectBonus ? ' + 完美 ' + perfectBonus : ''}
            </div>
          </div>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode4.start()">🔁 再戰一場</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
          </div>
        </div>
      `;
      GameFX.bigConfetti();
      refreshHome();
    },

    defeat(reason) {
      this.state.finished = true;
      this.stopTimer();
      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="battle-arena" style="text-align:center">
          <h1 style="color:#f87171;font-size:2rem">${reason}</h1>
          <div style="font-size:4rem;margin:16px 0">😵</div>
          <p style="color:var(--fg-dim)">本場結算:配對 ${this.state.matched}/${this.state.pairCount} · 失誤 ${this.state.mismatched} · 最高連配 ${this.state.maxCombo}</p>
          <div class="actions" style="justify-content:center">
            <button class="btn btn-primary" onclick="Mode4.start()">🔁 再戰</button>
            <button class="btn btn-ghost" onclick="goHome()">🏠 主頁</button>
          </div>
        </div>
      `;
      refreshHome();
    },

    gameOver() {
      Player.heal(40);
      this.defeat('💀 你倒下了');
    },

    exit() {
      if (!confirm('放棄本場配對戰?(進度不會保留)')) return;
      this.state.finished = true;
      this.stopTimer();
      goHome();
    }
  };

  window.Mode4 = Mode4;
})();
