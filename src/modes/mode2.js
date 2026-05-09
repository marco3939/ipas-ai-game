/* ============================================================
 * 案 2:程式判讀道場 (Mode 2)
 * 三種挑戰:入門關 / VGG16 連戰(Boss) / 混戰模式
 * 鐵律 #1:錯題自動進錯題本 + 顯眼下鑽按鈕(PlayEngine 內建)
 * 鐵律 #2:題目透過 PlayEngine.show 自動處理變數池+選項洗牌
 * ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'ipas_mode2_progress_v1';
  const VGG_IDS = ['q_0070', 'q_0071', 'q_0072', 'q_0073'];

  /* ---------- 進度儲存 ---------- */
  const Mode2Progress = {
    load() {
      return Storage.get(STORAGE_KEY, {
        beginnerRuns: 0, beginnerBest: 0,
        vggRuns: 0, vggBest: 0, vggCleared: false,
        mixedRuns: 0, mixedBest: 0,
        totalCorrect: 0, totalAnswered: 0
      });
    },
    save(p) { Storage.set(STORAGE_KEY, p); },
    record(modeKey, correct, total) {
      const p = this.load();
      const rate = total > 0 ? correct / total : 0;
      p.totalCorrect += correct;
      p.totalAnswered += total;
      if (modeKey === 'beginner') {
        p.beginnerRuns++;
        p.beginnerBest = Math.max(p.beginnerBest, rate);
      } else if (modeKey === 'vgg') {
        p.vggRuns++;
        p.vggBest = Math.max(p.vggBest, rate);
        if (correct === total && total === VGG_IDS.length) p.vggCleared = true;
      } else if (modeKey === 'mixed') {
        p.mixedRuns++;
        p.mixedBest = Math.max(p.mixedBest, rate);
      }
      this.save(p);
    }
  };

  /* ---------- 題庫篩選 ---------- */
  function getCodeReadingPool() {
    return QUESTIONS.filter(q => q.format === 'code_reading' || q.format === 'table_reading');
  }
  function getBeginnerPool() {
    return QUESTIONS.filter(q =>
      q.format === 'code_reading' &&
      (q.difficulty === 'easy' || q.difficulty === 'medium') &&
      !VGG_IDS.includes(q.id)
    );
  }
  function getVggBossQueue() {
    // 依固定順序回傳 VGG16 4 連戰
    const ordered = [];
    VGG_IDS.forEach(id => {
      const q = QUESTIONS.find(x => x.id === id);
      if (q) ordered.push(q);
    });
    return ordered;
  }

  /* ---------- 主入口 ---------- */
  const Mode2 = {
    state: null,

    start() {
      this.renderMenu();
    },

    renderMenu() {
      const p = Mode2Progress.load();
      const pool = getCodeReadingPool();
      const beginnerCnt = getBeginnerPool().length;
      const vggCnt = getVggBossQueue().length;

      const view = document.getElementById('view-play');
      view.innerHTML = `
        <div class="card">
          <h1>💻 程式判讀道場</h1>
          <p style="color:var(--fg-dim)">
            numpy / sklearn / PyTorch / VGG16 程式碼與表格判讀題庫共 ${pool.length} 題。
            連戰中錯題自動下鑽變化型(鐵律 #1)。
          </p>
        </div>

        <div class="card">
          <h2>📊 道場戰績</h2>
          <p style="font-size:0.9rem;color:var(--fg-dim)">
            場次:入門 ${p.beginnerRuns} · VGG ${p.vggRuns}${p.vggCleared ? ' (✅ 已通關)' : ''} · 混戰 ${p.mixedRuns}
            &nbsp;|&nbsp;
            正答率:${p.totalAnswered > 0 ? Math.round(p.totalCorrect / p.totalAnswered * 100) : 0}%
          </p>
        </div>

        <div class="card">
          <h2>🎯 選擇挑戰模式</h2>
          <div class="modes-grid">
            <button class="mode-card" onclick="Mode2.startBeginnerMode()">
              <div class="mode-num">入門關</div>
              <div class="mode-title">📘 單題程式判讀</div>
              <div class="mode-desc">numpy / sklearn 基礎,單題練習,適合熱身</div>
              <div class="mode-stats">${beginnerCnt} 題池 · 最佳 ${Math.round(p.beginnerBest * 100)}%</div>
            </button>
            <button class="mode-card" onclick="Mode2.startVggBoss()" ${vggCnt < 4 ? 'disabled style="opacity:0.5"' : ''}>
              <div class="mode-num">Boss 戰</div>
              <div class="mode-title">🔥 VGG16 4 連戰</div>
              <div class="mode-desc">VGG16 表格判讀 + 遷移學習,連續挑戰扣 HP</div>
              <div class="mode-stats">${vggCnt} 題 · ${p.vggCleared ? '🏆 全勝紀錄' : '尚未通關'}</div>
            </button>
            <button class="mode-card" onclick="Mode2.startMixedMode()">
              <div class="mode-num">混戰</div>
              <div class="mode-title">⚡ 混戰模式</div>
              <div class="mode-desc">所有 code_reading + table_reading 隨機 5-8 題</div>
              <div class="mode-stats">${pool.length} 題池 · 最佳 ${Math.round(p.mixedBest * 100)}%</div>
            </button>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn btn-ghost" onclick="goHome()">← 回首頁</button>
          </div>
        </div>
      `;
      show('view-play');
    },

    /* ============ 入門關 ============ */
    startBeginnerMode() {
      const pool = getBeginnerPool();
      if (pool.length === 0) {
        showToast('入門題不足');
        this.renderMenu();
        return;
      }
      const queue = RNG.pickN(pool, Math.min(5, pool.length));
      this.state = {
        modeKey: 'beginner',
        title: '📘 入門關 — 程式判讀',
        queue,
        idx: 0,
        correct: 0,
        wrong: [],
        boss: false
      };
      this.next();
    },

    /* ============ VGG16 Boss 連戰 ============ */
    startVggBoss() {
      const queue = getVggBossQueue();
      if (queue.length < 4) {
        showToast('VGG16 題庫缺題');
        this.renderMenu();
        return;
      }
      this.state = {
        modeKey: 'vgg',
        title: '🔥 Boss 戰 — VGG16 4 連戰',
        queue,
        idx: 0,
        correct: 0,
        wrong: [],
        boss: true,
        bossName: '🦖 VGG16 巨獸',
        bossMaxHP: queue.length,
        bossHP: queue.length    // 每答對減 1(視覺上每題占 25%)
      };
      showToast('🔥 Boss 戰開始!擊倒 VGG16 巨獸');
      this.next();
    },

    /* ============ 混戰模式 ============ */
    startMixedMode() {
      const pool = getCodeReadingPool();
      if (pool.length === 0) {
        showToast('題庫不足');
        this.renderMenu();
        return;
      }
      const n = Math.min(pool.length, RNG.pick([5, 6, 7, 8]));
      const queue = RNG.pickN(pool, n);
      this.state = {
        modeKey: 'mixed',
        title: '⚡ 混戰模式 — 程式 + 表格綜合',
        queue,
        idx: 0,
        correct: 0,
        wrong: [],
        boss: false
      };
      this.next();
    },

    /* ---------- 連續題目控制 ---------- */
    next() {
      const s = this.state;
      if (!s) { goHome(); return; }
      if (s.idx >= s.queue.length) { this.finish(); return; }

      const q = s.queue[s.idx];
      const ctx = this._buildContext();

      // 包裝 PlayEngine.answer 以攔截結果(僅統計用,不影響鐵律 #1 的內建錯題本與下鑽)
      const originalAnswer = PlayEngine.answer.bind(PlayEngine);
      PlayEngine.answer = (key) => {
        const opt = PlayEngine.current.options.find(o => o.key === key);
        const isCorrect = !!(opt && opt.is_correct);
        if (isCorrect) {
          s.correct++;
          if (s.boss) {
            s.bossHP = Math.max(0, s.bossHP - 1);
            this._flashBoss(true);
          }
        } else {
          s.wrong.push({ qid: PlayEngine.current.id, nodeId: PlayEngine.current.node_id });
          if (s.boss) this._flashBoss(false);
        }
        // 還原為原本實作再呼叫,避免遞迴
        PlayEngine.answer = originalAnswer;
        originalAnswer(key);
      };

      PlayEngine.show(q, { contextHTML: ctx });
      PlayEngine.onNext = () => {
        this.state.idx++;
        this.next();
      };
    },

    _buildContext() {
      const s = this.state;
      const total = s.queue.length;
      const cur = s.idx + 1;
      if (s.boss) {
        const hpPct = Math.max(0, (s.bossHP / s.bossMaxHP) * 100);
        return `
          <div class="boss-bar">
            <div class="boss-name">${s.bossName} — 第 ${cur}/${total} 戰</div>
            <div class="boss-hp"><div class="boss-hp-fill" style="width:${hpPct}%"></div></div>
            <div style="color:white;font-size:0.85rem;margin-top:4px">
              HP ${s.bossHP}/${s.bossMaxHP} · 命中 ${s.correct} · 失手 ${s.wrong.length}
            </div>
          </div>
          <div class="card" style="margin-bottom:8px">
            <div style="font-size:0.85rem;color:var(--fg-dim)">
              ⚠️ Boss 戰連戰:錯一題立即下鑽變化型(鐵律 #1)
            </div>
          </div>
        `;
      }
      return `
        <div class="card" style="margin-bottom:8px">
          <h2 style="margin:0">${s.title}</h2>
          <div style="font-size:0.85rem;color:var(--fg-dim);margin-top:4px">
            進度 ${cur}/${total} · 命中 ${s.correct} · 失手 ${s.wrong.length}
          </div>
        </div>
      `;
    },

    _flashBoss(hit) {
      // 簡單視覺回饋(不阻塞)
      const bar = document.querySelector('.boss-bar');
      if (!bar) return;
      bar.style.transition = 'transform 0.18s';
      bar.style.transform = hit ? 'translateX(-6px)' : 'translateX(6px)';
      setTimeout(() => { bar.style.transform = ''; }, 180);
    },

    /* ---------- 結算 ---------- */
    finish() {
      const s = this.state;
      const total = s.queue.length;
      const rate = total > 0 ? Math.round(s.correct / total * 100) : 0;
      Mode2Progress.record(s.modeKey, s.correct, total);

      // 推薦下鑽(取最後 1-3 個錯題)
      const drillSrcs = s.wrong.slice(-3).map(w => QUESTIONS.find(q => q.id === w.qid)).filter(Boolean);
      const drillBtns = drillSrcs.map(q => `
        <button class="btn btn-warn" onclick='Mode2.drillFromResult("${q.id}")' style="margin:4px">
          🎯 下鑽:${(q.stem || '').replace(/<[^>]+>/g, '').replace(/\*\*/g, '').substring(0, 28)}…
        </button>
      `).join('');

      let bossLine = '';
      if (s.boss) {
        if (s.bossHP === 0 && s.wrong.length === 0) {
          bossLine = '<p style="color:var(--success);font-weight:700">🏆 完美擊殺!VGG16 巨獸倒下!</p>';
        } else if (s.bossHP === 0) {
          bossLine = `<p style="color:var(--success)">✅ 通關!但失手 ${s.wrong.length} 題,建議下鑽</p>`;
        } else {
          bossLine = `<p style="color:var(--warn)">⚠️ Boss 殘血 ${s.bossHP}/${s.bossMaxHP},建議重戰</p>`;
        }
      }

      const headline =
        s.modeKey === 'beginner' ? '📘 入門關結算' :
        s.modeKey === 'vgg' ? '🔥 VGG16 Boss 戰結算' : '⚡ 混戰結算';

      document.getElementById('view-result').innerHTML = `
        <div class="card">
          <h2>${headline}</h2>
          ${bossLine}
          <p>正答率:<strong style="color:${rate >= 80 ? 'var(--success)' : rate >= 60 ? 'var(--warn)' : 'var(--danger)'}">${rate}%</strong>
             (${s.correct}/${total})</p>
          <p>新增錯題:<strong>${s.wrong.length}</strong> 題(已自動進錯題本,鐵律 #1)</p>
          ${drillBtns ? `
            <h3 style="margin-top:16px">🎯 推薦下鑽變化型</h3>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${drillBtns}</div>
          ` : '<p style="color:var(--fg-dim);margin-top:12px">本場無錯題,優異表現!</p>'}
          <div class="actions" style="margin-top:20px">
            <button class="btn btn-primary" onclick="Mode2.start()">↩ 回道場</button>
            ${s.modeKey === 'vgg' ? '<button class="btn btn-warn" onclick="Mode2.startVggBoss()">🔥 再戰 VGG</button>' : ''}
            ${s.modeKey === 'mixed' ? '<button class="btn btn-warn" onclick="Mode2.startMixedMode()">⚡ 再來一場混戰</button>' : ''}
            ${s.modeKey === 'beginner' ? '<button class="btn btn-warn" onclick="Mode2.startBeginnerMode()">📘 再做 5 題</button>' : ''}
            <button class="btn btn-ghost" onclick="goHome()">回首頁</button>
          </div>
        </div>
      `;
      this.state = null;
      show('view-result');
    },

    drillFromResult(qid) {
      const q = QUESTIONS.find(x => x.id === qid);
      if (!q) { showToast('找不到原題'); return; }
      const variations = generateVariation(q, 3);
      if (!variations || variations.length === 0) { showToast('無變化型可生成'); return; }
      DrillSession.start(q.node_id, variations);
    }
  };

  window.Mode2 = Mode2;
})();
