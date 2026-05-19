/* === SM-2 間隔重複系統 ===
 * 規格:docs/spec-sm2.md
 * 鍵位:Storage key `ipas_sm2_v1`,值 `{ [qid]: { ef, interval, repetition, lastReview, nextDue } }`
 * 與 Mastery 並存(Mastery 用 nodeId,SM-2 用 qid)— 不取代,不合併
 * 全域:`SM2`(裸名讀,不掛 window — 與 Mastery / PlayEngine 慣例一致)
 */
const SM2 = {
  // === 常數 ===
  MIN_EF: 1.3,
  INITIAL_EF: 2.5,
  MS_PER_DAY: 86400000,
  STORAGE_KEY: 'ipas_sm2_v1',

  // === Storage ===
  load() { return Storage.get(this.STORAGE_KEY, {}); },
  save(s) { Storage.set(this.STORAGE_KEY, s); },
  getState(qid) {
    const all = this.load();
    return all[qid] || { ef: this.INITIAL_EF, interval: 0, repetition: 0, lastReview: 0, nextDue: 0 };
  },

  // === 計算下次狀態(純函數;state 可為 null/undefined,fallback 初始值)===
  computeNext(state, grade) {
    let { ef, interval, repetition } = state || { ef: this.INITIAL_EF, interval: 0, repetition: 0 };
    if (typeof ef !== 'number' || !Number.isFinite(ef)) ef = this.INITIAL_EF;
    if (typeof interval !== 'number' || !Number.isFinite(interval)) interval = 0;
    if (typeof repetition !== 'number' || !Number.isFinite(repetition)) repetition = 0;
    // 案例 10 deep-audit Agent D D-1:grade=NaN 不防會讓 ef 變 NaN 寫入 storage
    if (!Number.isFinite(grade)) grade = 0;  // 落到 fail 路徑
    grade = Math.max(0, Math.min(5, grade));  // clamp [0,5]
    if (grade < 3) {
      // 答錯:重置 repetition,interval=1(明天再考)
      repetition = 0;
      interval = 1;
    } else {
      // 答對:repetition++,interval 依 SM-2 表
      if (repetition === 0) interval = 1;
      else if (repetition === 1) interval = 6;
      else interval = Math.round(interval * ef);
      repetition += 1;
    }
    // EF' = EF + (0.1 - (5-q) * (0.08 + (5-q)*0.02))
    ef = ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (!Number.isFinite(ef) || ef < this.MIN_EF) ef = this.MIN_EF;   // double-safe
    const now = Date.now();
    return {
      ef: Number(ef.toFixed(3)),
      interval,
      repetition,
      lastReview: now,
      nextDue: now + interval * this.MS_PER_DAY
    };
  },

  // === 記錄一次答題(由各 mode 與 PlayEngine.answer hook 呼叫)===
  // grade mapping:答對(主場)=5,答對(下鑽)=4,答錯=2
  // 2026-05-19 §8 H5 修補:幫所有 SM2 公開查詢加 stale qid 過濾器
  // 題庫一旦移除某 qid(歷史 q_pa_011/q_pa_012 被刪),SM2 仍存舊卡片 → 首頁顯示假到期數
  // 此 helper 統一在「讀」端過濾,避免每處重複寫
  _isLiveQid(qid) {
    if (typeof QUESTIONS === 'undefined' || !Array.isArray(QUESTIONS)) return true; // 安全 fallback:沒題庫時不過濾
    return QUESTIONS.some(function (q) { return q && q.id === qid; });
  },

  recordAnswer(qid, isCorrect, viaDrill) {
    if (!qid) return null;
    // §8 H5 修補:對已從題庫刪除的 qid 不再寫入新狀態
    if (!this._isLiveQid(qid)) return null;
    const grade = isCorrect ? (viaDrill ? 4 : 5) : 2;
    const all = this.load();
    const cur = all[qid] || { ef: this.INITIAL_EF, interval: 0, repetition: 0, lastReview: 0, nextDue: 0 };
    all[qid] = this.computeNext(cur, grade);
    this.save(all);
    return all[qid];
  },

  // === 今日 due 佇列 ===
  // overdueOnly=true:只取 nextDue <= now
  // overdueOnly=false:取 nextDue <= now + 1 day(包含今日內到期)
  // 2026-05-19 §8 H5:加 _isLiveQid 過濾 stale,避免 review session 跑空隙
  getDueQueue(overdueOnly) {
    if (overdueOnly === undefined) overdueOnly = true;
    const all = this.load();
    const now = Date.now();
    const cutoff = overdueOnly ? now : now + this.MS_PER_DAY;
    const self = this;
    return Object.entries(all)
      .filter(function (e) { return e[1].nextDue > 0 && e[1].nextDue <= cutoff && self._isLiveQid(e[0]); })
      .sort(function (a, b) { return a[1].nextDue - b[1].nextDue; })
      .map(function (e) { return { qid: e[0], state: e[1] }; });
  },

  // === 統計(首頁 / review view 顯示用)===
  countDueToday() { return this.getDueQueue(true).length; },
  countOverdue() {
    const all = this.load();
    const now = Date.now();
    const self = this;
    // §8 H5 修補:統計同樣過濾 stale qid,首頁不再顯示假到期數
    return Object.entries(all).filter(function (e) {
      return e[1].nextDue > 0 && e[1].nextDue < now - SM2.MS_PER_DAY && self._isLiveQid(e[0]);
    }).length;
  },
  totalTracked() { return Object.keys(this.load()).length; },

  // === Review flow 內部狀態 ===
  queue: [],
  idx: 0,
  correct: 0,

  // === Review flow ===
  enterReview() {
    this.queue = this.getDueQueue(false); // 包含明日內到期
    if (this.queue.length === 0) {
      if (typeof showToast === 'function') showToast('🎉 今日無待複習題目', 1800);
      if (typeof goHome === 'function') goHome();
      return;
    }
    this.idx = 0;
    this.correct = 0;
    if (typeof _setExamMode === 'function') _setExamMode(true, '📅 SM-2 間隔重複複習');
    this.renderReviewList();
    if (typeof show === 'function') show('view-sm2-review');
  },

  renderReviewList() {
    const view = document.getElementById('view-sm2-review');
    if (!view) return;
    const now = Date.now();
    const items = this.queue.map(function (item, i) {
      const overdue = item.state.nextDue <= now;
      const dueLabel = overdue ? '⏰ 已到期' : '📅 今日到期';
      const q = (typeof QUESTIONS !== 'undefined') ? QUESTIONS.find(function (qq) { return qq.id === item.qid; }) : null;
      const stem = q ? (q.stem || '').substring(0, 60).replace(/\{[^}]+\}/g, '?') : '(題庫已移除)';
      const safeQid = String(item.qid).replace(/[<>&"']/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
      });
      const safeStem = String(stem).replace(/[<>&"']/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
      });
      return '<div class="sm2-queue-item">' +
        '<div class="sm2-queue-row">' +
          '<span class="sm2-queue-idx">' + (i + 1) + '</span>' +
          '<strong>' + safeQid + '</strong>' +
          '<span class="sm2-due-label ' + (overdue ? 'overdue' : 'today') + '">' + dueLabel + '</span>' +
          '<span class="sm2-ef">EF ' + Number(item.state.ef).toFixed(2) + '</span>' +
        '</div>' +
        '<div class="sm2-queue-stem">' + safeStem + '...</div>' +
      '</div>';
    }).join('');
    const total = this.queue.length;
    const tracked = this.totalTracked();
    let avgEf = 0;
    if (tracked > 0) {
      const all = this.load();
      const sum = Object.values(all).reduce(function (a, s) { return a + (s.ef || 0); }, 0);
      avgEf = sum / tracked;
    }
    view.innerHTML =
      '<div class="card sm2-review">' +
        '<h1>📅 今日複習(SM-2)</h1>' +
        '<p style="color:var(--fg-dim)">' + total + ' 題到期 · 已追蹤 ' + tracked + ' 題 · EF 平均 ' + avgEf.toFixed(2) + '</p>' +
        '<div class="sm2-queue-list">' + items + '</div>' +
        '<div class="actions" style="justify-content:center;margin-top:14px">' +
          '<button class="btn btn-primary" onclick="SM2.startReviewSession()">▶ 開始複習(' + total + ' 題)</button>' +
          '<button class="btn btn-ghost" onclick="goHome()">回首頁</button>' +
        '</div>' +
      '</div>';
  },

  startReviewSession() {
    if (this.queue.length === 0) return this.finishReview();
    if (this.idx >= this.queue.length) return this.finishReview();
    const item = this.queue[this.idx];
    const q = (typeof QUESTIONS !== 'undefined') ? QUESTIONS.find(function (qq) { return qq.id === item.qid; }) : null;
    if (!q) {
      // 題目已被刪除,跳下一題
      this.idx++;
      return this.startReviewSession();
    }
    const ctx = '<div class="card"><h2>📅 SM-2 複習 ' + (this.idx + 1) + ' / ' + this.queue.length + '</h2>' +
      '<p style="color:var(--fg-dim)">EF ' + Number(item.state.ef).toFixed(2) +
      ' · interval ' + item.state.interval + ' 天' +
      ' · 連對 ' + item.state.repetition + ' 次</p></div>';
    if (typeof PlayEngine !== 'undefined') {
      PlayEngine.show(q, { contextHTML: ctx });
      const self = this;
      PlayEngine.onNext = function () {
        self.idx++;
        self.startReviewSession();
      };
    }
  },

  finishReview() {
    if (typeof _setExamMode === 'function') _setExamMode(false);
    const view = document.getElementById('view-result') || document.getElementById('view-sm2-review');
    if (view) {
      view.innerHTML =
        '<div class="card" style="text-align:center">' +
          '<h1>🎉 複習完成</h1>' +
          '<p>共複習 ' + this.queue.length + ' 題</p>' +
          '<div class="actions" style="justify-content:center">' +
            '<button class="btn btn-primary" onclick="SM2.enterReview()">繼續複習</button>' +
            '<button class="btn btn-ghost" onclick="goHome()">回首頁</button>' +
          '</div>' +
        '</div>';
      if (typeof show === 'function') show(view.id);
    }
    this.queue = [];
    this.idx = 0;
  }
};
