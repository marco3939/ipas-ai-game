/* ============================================================
 * Mode 3 - Pipeline 拼圖工坊 (點擊排序版,降級設計)
 * ============================================================
 * 玩家對 ML 流程進行排序判斷
 * 題庫:format=sequence 共 5 題 (q_0090-0094)
 *
 * 核心鐵律:
 *   #1 錯題立即下鑽 (Wrongbook + 錯後變式)
 *   #2 每場洗牌  (RNG.shuffle)
 *
 * 不使用 HTML5 Drag and Drop,改為點擊式排序
 * ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'ipas_mode3_progress_v1';

  /** 從 localStorage 載入進度 */
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { completed: {}, bestErrors: {} };
    } catch (e) {
      return { completed: {}, bestErrors: {} };
    }
  }

  /** 儲存進度 */
  function saveProgress(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) { /* ignore */ }
  }

  /** 解析正確 option 文字成步驟陣列 */
  function parseSteps(text) {
    if (!text) return [];
    return text
      .split(/\s*→\s*|\s*->\s*|\s*->\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /** HTML escape */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 取得情境標題 (取 stem 前段) */
  function shortTitle(q) {
    const stem = (q.stem || '').replace(/[?？]/g, '').trim();
    if (stem.length <= 20) return stem;
    return stem.slice(0, 18) + '…';
  }

  const Mode3 = {
    /** 此模式所有 sequence 題 */
    questions: [],
    /** 當前挑戰題目 */
    current: null,
    /** 當前題的步驟正確順序 */
    correctSteps: [],
    /** 當前題已被點擊放置的步驟 index (依正確順序) */
    placedCount: 0,
    /** 此題錯誤次數 */
    errorCount: 0,
    /** 進度 */
    progress: null,

    /** 入口 */
    start() {
      this.progress = loadProgress();
      this.questions = (window.QUESTIONS || []).filter(q => q.format === 'sequence');
      if (!this.questions.length) {
        if (typeof window.show === 'function') window.show('view-play');
        const root = document.getElementById('view-play');
        if (root) {
          root.innerHTML = `
            <div class="card question-card">
              <h2>Pipeline 拼圖工坊</h2>
              <p>找不到 sequence 類型題目,請確認題庫已載入。</p>
              <div class="actions">
                <button class="btn btn-ghost" onclick="goHome()">返回主選單</button>
              </div>
            </div>`;
        }
        return;
      }
      this.renderMenu();
    },

    /** 顯示 5 個 sequence 情境清單 */
    renderMenu() {
      if (typeof window.show === 'function') window.show('view-play');
      const root = document.getElementById('view-play');
      if (!root) return;

      const items = this.questions.map(q => {
        const completed = this.progress.completed[q.id];
        const errs = this.progress.bestErrors[q.id];
        const badge = completed
          ? `<span style="color:#16a34a;font-weight:600;">已過關 (錯誤 ${errs == null ? 0 : errs})</span>`
          : `<span style="color:#6b7280;">未挑戰</span>`;
        return `
          <div class="card pipeline-step" style="cursor:pointer;display:flex;flex-direction:column;gap:6px;padding:14px;border-left:4px solid ${completed ? '#16a34a' : '#3b82f6'};"
               onclick="Mode3.enterChallenge('${q.id}')">
            <div style="font-weight:600;font-size:15px;">${esc(shortTitle(q))}</div>
            <div style="font-size:13px;color:#4b5563;line-height:1.4;">${esc(q.stem)}</div>
            <div style="font-size:12px;">${badge}</div>
          </div>`;
      }).join('');

      const totalDone = Object.keys(this.progress.completed).length;
      root.innerHTML = `
        <div class="card question-card">
          <h2>Mode 3 · Pipeline 拼圖工坊</h2>
          <p style="color:#4b5563;font-size:14px;line-height:1.5;">
            點擊式排序挑戰:依序點擊正確步驟把流程串起來。
            點錯會震動並計入錯誤次數,完成後會解鎖下個情境。
          </p>
          <p style="color:#6b7280;font-size:13px;">進度:${totalDone} / ${this.questions.length}</p>
          <div class="pipeline-list" style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
            ${items}
          </div>
          <div class="actions" style="margin-top:14px;">
            <button class="btn btn-ghost" onclick="goHome()">返回主選單</button>
          </div>
        </div>`;
    },

    /** 進入單題挑戰 */
    enterChallenge(qid) {
      const q = (window.QUESTIONS || []).find(x => x.id === qid);
      if (!q) return;
      this.current = q;
      this.placedCount = 0;
      this.errorCount = 0;

      // 取出正確 option
      const correct = (q.options || []).find(o => o.is_correct);
      this.correctSteps = parseSteps(correct ? correct.text : '');

      this.renderPuzzle();
    },

    /** 渲染拼圖排序 UI */
    renderPuzzle() {
      const root = document.getElementById('view-play');
      if (!root) return;
      const q = this.current;
      const total = this.correctSteps.length;

      // 鐵律 #2:每場洗牌
      const shuffled = (window.RNG && typeof window.RNG.shuffle === 'function')
        ? window.RNG.shuffle(this.correctSteps.slice())
        : this.correctSteps.slice().sort(() => Math.random() - 0.5);

      // 上方空格(已放區):依序填入
      const slotsHtml = this.correctSteps.map((step, i) => {
        const isPlaced = i < this.placedCount;
        const placedText = isPlaced ? esc(this.correctSteps[i]) : '待填入';
        const cls = isPlaced ? 'pipeline-step placed' : 'pipeline-step';
        return `
          <div class="${cls}" id="m3-slot-${i}" style="opacity:${isPlaced ? '1' : '0.55'};">
            <span class="step-order">${i + 1}</span>
            <span style="flex:1;">${placedText}</span>
          </div>`;
      }).join('');

      // 下方候選步驟卡片
      const cardsHtml = shuffled.map((step) => {
        const placedAlready = this.correctSteps.indexOf(step) < this.placedCount;
        const disabled = placedAlready ? 'disabled' : '';
        const opacity = placedAlready ? '0.3' : '1';
        return `
          <button class="pipeline-step btn"
                  id="m3-card-${esc(step)}"
                  data-step="${esc(step)}"
                  style="text-align:left;opacity:${opacity};"
                  ${disabled}
                  onclick="Mode3.onStepClick('${esc(step).replace(/'/g, "\\'")}')">
            ${esc(step)}
          </button>`;
      }).join('');

      root.innerHTML = `
        <div class="card question-card">
          <h2 style="font-size:16px;color:#3b82f6;">情境</h2>
          <p style="font-size:15px;line-height:1.5;margin:6px 0 16px;">${esc(q.stem)}</p>

          <h3 style="font-size:14px;margin:10px 0 8px;">正確順序 (${this.placedCount}/${total})</h3>
          <div class="pipeline-list" style="display:flex;flex-direction:column;gap:6px;background:#f9fafb;padding:10px;border-radius:8px;">
            ${slotsHtml}
          </div>

          <h3 style="font-size:14px;margin:14px 0 8px;">候選步驟 (請按正確順序點擊)</h3>
          <div class="pipeline-list" id="m3-pool" style="display:flex;flex-direction:column;gap:6px;">
            ${cardsHtml}
          </div>

          <p style="margin-top:10px;font-size:12px;color:#6b7280;">
            錯誤次數:<span id="m3-errors">${this.errorCount}</span>
          </p>

          <div class="actions" style="margin-top:14px;">
            <button class="btn btn-ghost" onclick="Mode3.renderMenu()">放棄回選單</button>
          </div>
        </div>

        <style>
          @keyframes m3shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .pipeline-step.mismatched {
            animation: m3shake 0.5s;
            background: #fee2e2 !important;
            border-color: #ef4444 !important;
          }
        </style>`;
    },

    /** 玩家點擊步驟卡片 */
    onStepClick(stepText) {
      if (!this.current) return;
      const expected = this.correctSteps[this.placedCount];
      if (stepText === expected) {
        // 答對下一個
        this.placedCount++;
        this.renderPuzzle();
        if (this.placedCount >= this.correctSteps.length) {
          // 全部完成
          setTimeout(() => this.finish(true), 250);
        }
      } else {
        // 點錯:震動 + 計數
        this.errorCount++;
        const errEl = document.getElementById('m3-errors');
        if (errEl) errEl.textContent = String(this.errorCount);
        // 找到該卡片加 mismatched
        const cards = document.querySelectorAll('#m3-pool [data-step]');
        cards.forEach(c => {
          if (c.getAttribute('data-step') === stepText) {
            c.classList.add('mismatched');
            setTimeout(() => c.classList.remove('mismatched'), 600);
          }
        });
        if (typeof window.showToast === 'function') {
          window.showToast('順序不對,再想想看');
        }
      }
    },

    /** 結算 */
    finish(allCorrect) {
      const q = this.current;
      if (!q) return;
      const noError = this.errorCount === 0;
      const isCorrect = allCorrect && noError;

      // 鐵律 #1:錯題下鑽 → 加入錯題本
      if (!isCorrect) {
        if (window.Wrongbook && typeof window.Wrongbook.add === 'function') {
          window.Wrongbook.add(
            q.id,
            q.node_id || q.id,
            `(排序錯誤 ${this.errorCount} 次)`,
            (q.options || []).find(o => o.is_correct)?.text || ''
          );
        }
      }

      // Mastery 更新
      if (window.Mastery && typeof window.Mastery.update === 'function') {
        window.Mastery.update(q.node_id || q.id, isCorrect);
      }

      // 寫入進度
      this.progress.completed[q.id] = true;
      const prevBest = this.progress.bestErrors[q.id];
      if (prevBest == null || this.errorCount < prevBest) {
        this.progress.bestErrors[q.id] = this.errorCount;
      }
      saveProgress(this.progress);

      this.renderResult(isCorrect);
    },

    /** 結算頁 */
    renderResult(isCorrect) {
      const root = document.getElementById('view-play');
      if (!root) return;
      const q = this.current;
      const correctOpt = (q.options || []).find(o => o.is_correct);
      const explain = q.explanation || '完成此 ML pipeline 排序!';

      // 找下一題未完成的
      const nextQ = this.questions.find(x => !this.progress.completed[x.id] && x.id !== q.id);

      // 錯題立即下鑽選項
      let drillBtn = '';
      if (!isCorrect) {
        drillBtn = `<button class="btn btn-primary" onclick="Mode3.drillDown()">立即下鑽 (重做本題)</button>`;
      }

      const nextBtn = nextQ
        ? `<button class="btn btn-primary" onclick="Mode3.enterChallenge('${nextQ.id}')">下一情境</button>`
        : `<button class="btn btn-primary" onclick="Mode3.renderMenu()">回到流程清單</button>`;

      root.innerHTML = `
        <div class="card question-card">
          <h2 style="color:${isCorrect ? '#16a34a' : '#f59e0b'};">
            ${isCorrect ? '完美過關!' : '完成 (有錯誤)'}
          </h2>
          <p style="font-size:14px;color:#4b5563;">
            錯誤次數:<strong>${this.errorCount}</strong> / 步驟總數:${this.correctSteps.length}
          </p>

          <h3 style="font-size:14px;margin:12px 0 6px;">正確流程</h3>
          <div class="pipeline-list" style="display:flex;flex-direction:column;gap:6px;background:#f0fdf4;padding:10px;border-radius:8px;">
            ${this.correctSteps.map((s, i) => `
              <div class="pipeline-step placed">
                <span class="step-order">${i + 1}</span>
                <span style="flex:1;">${esc(s)}</span>
              </div>`).join('')}
          </div>

          <h3 style="font-size:14px;margin:14px 0 6px;">解析</h3>
          <p style="font-size:13px;line-height:1.6;color:#374151;background:#fefce8;padding:10px;border-radius:6px;border-left:3px solid #facc15;">
            ${esc(explain)}
          </p>

          <div class="actions" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
            ${drillBtn}
            ${nextBtn}
            <button class="btn btn-ghost" onclick="Mode3.renderMenu()">流程清單</button>
            <button class="btn btn-ghost" onclick="goHome()">主選單</button>
          </div>
        </div>`;
    },

    /** 鐵律 #1:下鑽 - 重做同題或變式 */
    drillDown() {
      if (!this.current) return;
      // 嘗試生成變式;若無則重做原題
      let drillQ = this.current;
      if (typeof window.generateVariation === 'function') {
        try {
          const v = window.generateVariation(this.current, 1);
          if (v && (v.format === 'sequence' || (Array.isArray(v) && v[0]))) {
            drillQ = Array.isArray(v) ? v[0] : v;
          }
        } catch (e) { /* fallback to original */ }
      }
      this.current = drillQ;
      this.placedCount = 0;
      this.errorCount = 0;
      const correct = (drillQ.options || []).find(o => o.is_correct);
      this.correctSteps = parseSteps(correct ? correct.text : '');
      this.renderPuzzle();
    }
  };

  window.Mode3 = Mode3;
})();
