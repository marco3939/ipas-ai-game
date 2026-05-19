// ============================================================
// Mode 8: Code Trace 道場 — Python 程式逐行追蹤變數狀態
// 鐵律 #1+#2+#5 全合規(整題層級 Mastery / Wrongbook / SM-2)
// 規格:docs/spec-code-trace.md
// ============================================================
(function () {

  const STORAGE_KEY = 'ipas_mode8_dojo_v1';
  const QUESTIONS_PER_GAME = 5;

  // R5 expansion:程式類別 picker(spec - 入口分離 picker / trace 兩階段)
  // 篩選邏輯:題目屬於 category 若 tags 與 category.tags 有重疊 OR knowledge_code 在 kbCodes 內
  // category.key === 'all' 表示不篩(全 code_trace 池)
  // 設計原則(2026-05-16 R5):tags 用「該類別才會出現的窄詞」,不用泛用詞(避免廣譜誤命中)
  //   - 「numpy」是 numpy_la 以外的題型也常用(ReLU/DBSCAN/KNN)→ 不放 numpy_la tags
  //   - 「python」更泛 → 不放任何 category tags
  //   - 篩選邏輯:tags 重疊 OR knowledge_code 在 kbCodes;類別專屬窄詞優先,kbCodes 為次要兜底
  const CATEGORIES = [
    { key: 'numpy_la', label: '🔢 NumPy 線代', desc: 'matrix / shape / broadcasting / 降維', kbCodes: ['L23102'], tags: ['線代', 'shape', 'reshape', 'matmul', 'broadcasting', 'L2-norm', '降維'] },
    { key: 'algo', label: '⚙️ Python 演算法', desc: '迴圈 / 複雜度 / 條件', kbCodes: null, tags: ['演算法', '時間複雜度', '雙層迴圈', 'Fibonacci', '二分搜尋', 'tuple-unpacking'] },
    { key: 'activation', label: '🎯 激活函數', desc: 'ReLU / sigmoid / tanh / softmax', kbCodes: ['L23203'], tags: ['激活函數', 'ReLU', 'sigmoid', 'softmax', '數值穩定'] },
    { key: 'ml_model', label: '🤖 ML 模型', desc: 'LR / KNN / 聚類', kbCodes: ['L23202'], tags: ['邏輯迴歸', 'KNN', '聚類', 'DBSCAN', 'K-means', 'distance', '分類'] },
    { key: 'pandas', label: '📊 pandas 資料', desc: 'groupby / fillna / merge / pivot', kbCodes: ['L22201', 'L23402'], tags: ['pandas', 'groupby', 'fillna', 'merge', 'join', '缺值'] },
    // 2026-05-17:補齊 L22202(儲存)/ L22203(處理工具)/ L22303(視覺化),從 9 codes → 12 codes,題數 15 → 21(總 27 → 33+)
    { key: 'bigdata', label: '🗄️ 大數據 (科二)', desc: '統計 / 儲存 / 處理 / 視覺化 / 假設檢定 / 隱私', kbCodes: ['L22101','L22102','L22103','L22201','L22202','L22203','L22301','L22302','L22303','L22401','L22403','L22404'], tags: ['IQR','離群值','二項分佈','假設檢定','z 檢定','Apriori','Markov','SMOTE','tokenize','差分隱私','Laplace','CAP','MapReduce','event time','箱形圖','誤導視覺化'] },
    { key: 'all', label: '🌐 全類別混合', desc: '隨機抽 5 題,類別不限', kbCodes: null, tags: null }
  ];

  // 從題庫挑出 code_trace 題型(底層池)
  function tracePool() {
    return QUESTIONS.filter(function (q) { return q.format === 'code_trace'; });
  }

  // 判斷 q 是否屬於 category(tags 重疊 OR knowledge_code 在 kbCodes)
  function questionMatchesCategory(q, cat) {
    if (cat.key === 'all' || (!cat.kbCodes && !cat.tags)) return true;
    if (cat.kbCodes && q.knowledge_code && cat.kbCodes.indexOf(q.knowledge_code) >= 0) return true;
    if (cat.tags && Array.isArray(q.tags)) {
      for (var i = 0; i < q.tags.length; i++) {
        if (cat.tags.indexOf(q.tags[i]) >= 0) return true;
      }
    }
    return false;
  }

  // 篩 category 對應的題池(用於 picker 顯示題數 + startCategory 抽題)
  function poolForCategory(catKey) {
    var cat = CATEGORIES.find(function (c) { return c.key === catKey; });
    if (!cat) return [];
    var pool = tracePool();
    if (cat.key === 'all') return pool;
    return pool.filter(function (q) { return questionMatchesCategory(q, cat); });
  }

  // 從 category 對應池中抽 n 題(若池 < n,toast 提示並回傳全部可用)
  function pickQuestionsForCategory(catKey, n) {
    var pool = poolForCategory(catKey);
    if (pool.length === 0) return [];
    // 跨關卡排除已答對(SeenCorrect):戰鬥模式不重複
    if (typeof SeenCorrect !== 'undefined') {
      var fr = SeenCorrect.filterForBattle(pool, n);
      if (fr.fallback) {
        if (typeof showToast === 'function') showToast('此類可用新題不足,允許重複出已答對的舊題', 2500);
      } else {
        pool = fr.pool;
      }
    }
    if (pool.length < n) {
      if (typeof showToast === 'function') {
        showToast('此類題目不足 ' + n + ' 題,僅抽 ' + pool.length + ' 題', 2500);
      }
    }
    return RNG.pickN(pool, Math.min(n, pool.length));
  }

  // 從題庫挑出 code_trace 題型(舊行為:全池抽 5 題)
  // 保留作為 fallback / 向下相容(mock-mode8.js 若無 picker 直接 startCategory('all') 即得相同效果)
  // 鐵律 #5:不造題,僅用既有題庫(QUESTIONS 已含 questions-mode8-trace.json)
  function pickQuestions(n) {
    var pool = tracePool();
    // 跨關卡排除已答對(同 pickQuestionsForCategory 規則)
    if (typeof SeenCorrect !== 'undefined') {
      var fr = SeenCorrect.filterForBattle(pool, n);
      if (fr.fallback) {
        if (typeof showToast === 'function') showToast('Code Trace 可用新題不足,允許重複', 2500);
      } else {
        pool = fr.pool;
      }
    }
    return RNG.pickN(pool, Math.min(n, pool.length));
  }

  const Mode8 = {
    state: null,
    _timers: [],

    // === Timer 管理(同 Mode1 pattern,避免切 view 後殘留 callback) ===
    _scheduleTimeout: function (fn, ms) {
      const self = this;
      const id = setTimeout(function () {
        const i = self._timers.indexOf(id);
        if (i >= 0) self._timers.splice(i, 1);
        fn();
      }, ms);
      this._timers.push(id);
      return id;
    },
    _clearAllTimers: function () {
      if (typeof _setExamMode === 'function') _setExamMode(false);
      this._timers.forEach(function (id) { clearTimeout(id); });
      this._timers = [];
    },

    // === R5 task 1:每題 90s 倒數(覆蓋全題所有 steps,不每步重置)===
    // 2026-05-11 escape hatch:配合 PlayEngine 全域暫關 timer。移除下一行即可恢復。
    _startTimer: function (seconds) {
      return;
      this._stopTimer();
      if (!this.state) return;
      const total = (typeof seconds === 'number') ? seconds : 90;
      this.state._timerRemaining = total;
      this.state._timerDuration = total;
      this._updateTimerDOM();
      // 環境不支援 setInterval(vm sandbox / Node test runner)→ 跳過 ticker
      // 共用層寫入仍由 _handleTimeout 走,業務邏輯不受影響(timeout 在這類環境不會被觸發)
      if (typeof setInterval !== 'function') return;
      const self = this;
      this.state._timerId = setInterval(function () {
        if (!self.state) { self._stopTimer(); return; }
        self.state._timerRemaining--;
        if (self.state._timerRemaining <= 0) {
          self.state._timerRemaining = 0;
          self._updateTimerDOM();
          self._stopTimer();
          self._handleTimeout();
          return;
        }
        self._updateTimerDOM();
      }, 1000);
    },

    _stopTimer: function () {
      if (this.state && this.state._timerId) {
        if (typeof clearInterval === 'function') clearInterval(this.state._timerId);
        this.state._timerId = null;
      }
    },

    _updateTimerDOM: function () {
      const bar = document.getElementById('play-timer-bar');
      const val = document.getElementById('play-timer-value');
      if (!this.state) return;
      const rem = Math.max(0, this.state._timerRemaining);
      if (val) val.textContent = String(rem);
      if (bar) {
        bar.classList.remove('warn', 'critical');
        if (rem < 10) bar.classList.add('critical');
        else if (rem < 30) bar.classList.add('warn');
      }
    },

    // 計時器歸零:整題視為錯誤(等同所有 step 都答錯)→ 立即寫共用層 → 顯示完整解析
    _handleTimeout: function () {
      if (!this.state || !this.state.currentQ) return;
      const q = this.state.currentQ;
      // 整題視為答錯(allCorrect = false);後續 step 視為未答(stepResults 不變)
      if (q.node_id) Mastery.update(q.node_id, false);
      Progress.addAnswer(false);
      const correctOpt = (q.options || []).find(function (o) { return o.is_correct; });
      const wrongOpt = (q.options || []).find(function (o) { return !o.is_correct; });
      // 案例 10 補:傳 userText/correctText(timeout 視為選了某錯解)
      Wrongbook.add(
        q.id, q.node_id,
        wrongOpt ? wrongOpt.key : 'B',
        correctOpt ? correctOpt.key : 'A',
        (wrongOpt && wrongOpt.text) || '(時間到未答)',
        (correctOpt && correctOpt.text) || ''
      );
      if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, false, false);
      this.state.answering = true; // 鎖 step 互動
      this.showFullExplanation(false);
    },

    // === 入口(R5 expansion):進入 Mode 8 → 顯示「程式類別 picker」(不直接抽題)===
    // 入口分離兩階段:start() 設 RNG + 顯示 picker;startCategory(catKey) 才抽題進 trace
    start: function () {
      this._clearAllTimers();
      RNG.set(Date.now() + Math.floor(Math.random() * 1e5));
      var pool = tracePool();
      if (pool.length === 0) {
        showToast('Mode 8 題庫尚未載入或為空', 2500);
        goHome();
        return;
      }
      // Init state(category 尚未選定,questions 為空)
      this.state = {
        category: null,
        questions: [],
        idx: 0,
        stepIdx: 0,
        currentQ: null,
        stepResults: [],
        answering: false,
        _timerId: null,
        _timerRemaining: 0,
        _timerDuration: 90
      };
      this.renderCategoryPicker();
    },

    // === Category picker(R5 expansion):顯示 6 個類別卡 + 題數 ===
    renderCategoryPicker: function () {
      var view = document.getElementById('view-play');
      if (!view) return;
      var cardsHTML = CATEGORIES.map(function (c) {
        var pool = poolForCategory(c.key);
        var n = pool.length;
        var insufficient = n < 3;
        var warningTag = insufficient
          ? '<span class="m8-cat-warn">(題數 ' + n + ',略少)</span>'
          : '';
        var insufficientClass = insufficient ? ' m8-cat-card-warn' : '';
        var disabledAttr = n === 0 ? ' disabled' : '';
        return (
          '<button class="m8-cat-card' + insufficientClass + '" ' +
            'onclick="Mode8.startCategory(\'' + c.key + '\')"' + disabledAttr + '>' +
            '<div class="m8-cat-label">' + c.label + ' ' + warningTag + '</div>' +
            '<div class="m8-cat-desc">' + escapeHTML(c.desc) + '</div>' +
            '<div class="m8-cat-meta">題數 ' + n + '</div>' +
          '</button>'
        );
      }).join('');
      view.innerHTML =
        '<div class="card">' +
          '<h2>📝 Code Trace 道場 — 選擇程式類別</h2>' +
          '<p style="color:var(--fg-dim)">依目前題庫 ' + tracePool().length + ' 題分類;每場抽 ' + QUESTIONS_PER_GAME + ' 題</p>' +
          '<div class="m8-cat-grid">' + cardsHTML + '</div>' +
          '<div class="actions" style="margin-top:14px">' +
            '<button class="btn btn-ghost" onclick="goHome()">回首頁</button>' +
          '</div>' +
        '</div>';
      show('view-play');
    },

    // === 選擇 category 後抽題進 trace(R5 expansion)===
    startCategory: function (catKey) {
      this._clearAllTimers();
      if (!this.state) {
        // 防禦性:若 state 不存在(直接呼叫),先建一份
        this.state = {
          category: null, questions: [], idx: 0, stepIdx: 0, currentQ: null,
          stepResults: [], answering: false,
          _timerId: null, _timerRemaining: 0, _timerDuration: 90
        };
      }
      var questions = pickQuestionsForCategory(catKey, QUESTIONS_PER_GAME);
      if (questions.length === 0) {
        if (typeof showToast === 'function') showToast('此類別無可用題目', 2500);
        return;
      }
      this.state.category = catKey;
      this.state.questions = questions;
      this.state.idx = 0;
      this.state.stepIdx = 0;
      this.state.currentQ = null;
      this.state.stepResults = [];
      this.state.answering = false;
      if (typeof _setExamMode === 'function') _setExamMode(true, 'Mode 8 Code Trace 道場');
      this.showQuestion();
    },

    // === 切到下一題(從外部 next() 進入)===
    showQuestion: function () {
      if (!this.state) return;
      // R5 task 1:每進新題先停舊 timer(防上題殘留)
      this._stopTimer();
      if (this.state.idx >= this.state.questions.length) {
        this.finish();
        return;
      }
      // renderQuestion 會洗牌 options(整題層級的 [全部正確/任一錯誤]),不影響 trace_steps
      const q = renderQuestion(this.state.questions[this.state.idx]);
      this.state.currentQ = q;
      this.state.stepIdx = 0;
      this.state.stepResults = [];
      this.state.answering = false;
      this.renderTrace();
      // R5 task 1:渲染完畢後啟動 90s 計時器(整題層級,不每步重置)
      this._startTimer(90);
    },

    // === 渲染當前 trace step(每步重渲)===
    renderTrace: function () {
      if (!this.state || !this.state.currentQ) return;
      const q = this.state.currentQ;
      const step = q.trace_steps[this.state.stepIdx];
      if (!step) {
        this.showFullExplanation(this.state.stepResults.every(function (r) { return r; }));
        return;
      }

      // NEEDS_REVIEW 解決:每次 render 洗牌 step.options,防 row-position 死記
      step.options = RNG.shuffle(step.options);

      const codeLines = (q.code_block || '').split('\n');
      const view = document.getElementById('view-play');
      if (!view) return;

      const optionsHTML = step.options.map(function (o, i) {
        return '<button class="option-btn" data-key="' + i + '" onclick="Mode8.answerStep(' + i + ')">' +
               '<span class="option-key">' + String.fromCharCode(65 + i) + '.</span> ' +
               escapeHTML(o.text) +
               '</button>';
      }).join('');

      const codeHTML = codeLines.map(function (ln, i) {
        const lineNum = i + 1;
        const cursor = lineNum === step.after_line ? 'm8-line-current' : '';
        return '<div class="m8-line ' + cursor + '">' +
               '<span class="m8-lineno">' + (lineNum < 10 ? ' ' + lineNum : lineNum) + '|</span> ' +
               highlightCodeSimple(ln) +
               '</div>';
      }).join('');

      // R5 task 1:每題 90s 計時器(整題層級,跨步驟不重置)
      // 計時器目前值取 state(若已在跑就接續顯示;showQuestion 啟動時為 90)
      const remain = (this.state && typeof this.state._timerRemaining === 'number')
        ? Math.max(0, this.state._timerRemaining) : 90;
      const timerHTML =
        '<div class="timer-bar" id="play-timer-bar">' +
          '<span class="timer-icon">⏱</span>' +
          '<span>剩餘 <span id="play-timer-value">' + remain + '</span> 秒</span>' +
        '</div>';

      view.innerHTML =
        '<div class="card">' +
          timerHTML +
          '<div class="question-meta">' +
            '<span class="badge">Code Trace 道場</span>' +
            '<span class="badge">第 ' + (this.state.idx + 1) + '/' + this.state.questions.length + ' 題</span>' +
            '<span class="badge">' + escapeHTML(q.knowledge_code || '') + '</span>' +
            '<span class="badge">' + escapeHTML(q.difficulty || '') + '</span>' +
          '</div>' +
          '<h2>📝 Code Trace 道場</h2>' +
          '<p class="question-stem">' + q.stem + '</p>' +
          '<div class="m8-grid">' +
            '<div class="m8-code">' + codeHTML + '</div>' +
            '<div class="m8-prompt">' +
              '<div class="m8-step-meta">Step ' + (this.state.stepIdx + 1) + '/' + q.trace_steps.length +
                ' · 已對 ' + this.state.stepResults.filter(function (r) { return r; }).length + '</div>' +
              '<div class="m8-ask">執行第 ' + step.after_line + ' 行後 — ' + escapeHTML(step.ask) + '</div>' +
              '<div class="options" id="m8-options">' + optionsHTML + '</div>' +
              '<div id="m8-step-explanation"></div>' +
            '</div>' +
          '</div>' +
          '<div class="actions" style="margin-top:14px">' +
            '<button class="btn btn-ghost" onclick="goHome()">回首頁</button>' +
          '</div>' +
        '</div>';
      show('view-play');
      // 重渲後 DOM 換新,立即同步一次顯示(顏色階段)
      this._updateTimerDOM();
    },

    // === 使用者選某 step option ===
    answerStep: function (idx) {
      if (!this.state || this.state.answering) return;
      const q = this.state.currentQ;
      if (!q) return;
      const step = q.trace_steps[this.state.stepIdx];
      if (!step) return;
      const opt = step.options[idx];
      if (!opt) return;
      this.state.answering = true;
      const isCorrect = !!opt.is_correct;
      this.state.stepResults.push(isCorrect);

      // 鎖選項 + 標色
      const btns = document.querySelectorAll('#m8-options .option-btn');
      btns.forEach(function (b, i) {
        b.disabled = true;
        if (step.options[i].is_correct) b.classList.add('correct');
        else if (i === idx && !isCorrect) b.classList.add('wrong');
      });

      // 渲染步驟解釋
      const isLastStep = this.state.stepIdx + 1 >= q.trace_steps.length;
      const trapHTML = (!isCorrect && opt.trap_type)
        ? '<div style="color:var(--warn);margin-top:6px">陷阱類型:' + escapeHTML(opt.trap_type) + '</div>'
        : '';
      const expEl = document.getElementById('m8-step-explanation');
      if (expEl) {
        expEl.innerHTML =
          '<div class="explanation" style="margin-top:12px">' +
            '<div class="verdict ' + (isCorrect ? 'correct' : 'wrong') + '">' +
              (isCorrect ? '✓ 此步答對' : '✗ 此步答錯') +
            '</div>' +
            trapHTML +
            '<div class="actions" style="margin-top:10px">' +
              '<button class="btn btn-primary" onclick="Mode8.nextStep()">' +
                (isLastStep ? '查看完整解析 →' : '下一行 →') +
              '</button>' +
            '</div>' +
          '</div>';
      }
    },

    // === 進入下一步;若已是最後一步 → 整題結算 ===
    nextStep: function () {
      if (!this.state) return;
      this.state.answering = false;
      this.state.stepIdx++;
      const q = this.state.currentQ;
      if (!q) return;
      if (this.state.stepIdx >= q.trace_steps.length) {
        // 整題結算 — Mastery / Wrongbook / SM-2 走整題層級判定
        const allCorrect = this.state.stepResults.every(function (r) { return r; });
        if (q.node_id) Mastery.update(q.node_id, allCorrect);
        Progress.addAnswer(allCorrect);
        // 案例 10 LOW-1:全步答對才 mark SeenCorrect
        if (allCorrect && q.id && typeof SeenCorrect !== 'undefined') SeenCorrect.mark(q.id);
        if (!allCorrect) {
          // 整題 options 固定為 [{全部正確,is_correct:true}, {任一錯誤,is_correct:false}]
          // 使用者實際選了「任一錯誤」(is_correct:false),故 userChoice=B、correctChoice=A
          // 但 renderQuestion 已洗牌 + 加 key,需從實際 q.options 取 key
          const correctOpt = (q.options || []).find(function (o) { return o.is_correct; });
          const wrongOpt = (q.options || []).find(function (o) { return !o.is_correct; });
          // 案例 10 補:傳 userText/correctText
          Wrongbook.add(
            q.id, q.node_id,
            wrongOpt ? wrongOpt.key : 'B',
            correctOpt ? correctOpt.key : 'A',
            (wrongOpt && wrongOpt.text) || '',
            (correctOpt && correctOpt.text) || ''
          );
        }
        if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, allCorrect, false);
        this.showFullExplanation(allCorrect);
        return;
      }
      this.renderTrace();
    },

    // === 整題完整解釋(含 Drill 按鈕 v0 為 stub) ===
    showFullExplanation: function (allCorrect) {
      if (!this.state || !this.state.currentQ) return;
      // R5 task 1:整題結束,停 timer
      this._stopTimer();
      const q = this.state.currentQ;
      const e = q.explanation || {};
      const view = document.getElementById('view-play');
      if (!view) return;
      const correctSteps = this.state.stepResults.filter(function (r) { return r; }).length;
      const totalSteps = this.state.stepResults.length;

      const miscoHTML = (q.misconceptions && q.misconceptions.length > 0)
        ? '<div style="background:rgba(168,85,247,0.10);border-left:4px solid #a855f7;padding:10px 12px;border-radius:6px;margin:10px 0">' +
            '<div style="color:#c084fc;font-weight:700;font-size:0.85rem">⚠️ 此題常見誤解</div>' +
            '<div style="color:var(--fg);margin-top:2px">' +
              q.misconceptions.map(function (m) { return '• ' + escapeHTML(m); }).join('<br>') +
            '</div>' +
          '</div>'
        : '';

      const hookHTML = e.hook
        ? '<div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px 0">' +
            '<div style="color:#facc15;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>' +
            '<div style="color:var(--fg);font-style:italic;margin-top:2px">' + escapeHTML(e.hook) + '</div>' +
          '</div>'
        : '';

      view.innerHTML =
        '<div class="card">' +
          '<div class="explanation">' +
            '<div class="verdict ' + (allCorrect ? 'correct' : 'wrong') + '">' +
              (allCorrect ? '🎉 全部步驟答對' : '❌ 部分步驟答錯') +
              ' (' + correctSteps + '/' + totalSteps + ')' +
            '</div>' +
            '<div style="background:rgba(74,222,128,0.12);border-left:4px solid #4ade80;padding:12px;border-radius:6px;margin:10px 0">' +
              '<div style="color:#4ade80;font-weight:700;font-size:0.95rem;margin-bottom:4px">📚 完整解析</div>' +
              '<div style="color:var(--fg);line-height:1.7">' + escapeHTML(e.correct || '(此題未提供詳細解釋)') + '</div>' +
            '</div>' +
            hookHTML +
            miscoHTML +
            '<div class="actions" style="margin-top:14px">' +
              '<button class="btn btn-primary" onclick="Mode8.next()">繼續下一題 →</button>' +
              (!allCorrect ? '<button class="btn btn-warn" onclick="Mode8.drillThis()">🎯 立即下鑽變化型</button>' : '') +
              ErrorReports.renderButton(q.id) +
              '<button class="btn btn-ghost" onclick="goHome()">回首頁</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      show('view-play');
    },

    // === 下鑽 v0:toast-only stub(規格 §11 v0-minimal,真下鑽延後到 v1)===
    drillThis: function () {
      showToast('下鑽變化型功能將於 v1 上線(目前為 v0-minimal)', 3000);
    },

    // === 進入下一題 ===
    next: function () {
      if (!this.state) return;
      this.state.idx++;
      this.showQuestion();
    },

    // === 結算 ===
    finish: function () {
      if (!this.state) return;
      // R5 task 1:結算前停 timer(防殘留)
      this._stopTimer();
      if (typeof _setExamMode === 'function') _setExamMode(false);
      const view = document.getElementById('view-play');
      if (!view) return;
      var doneCount = this.state.questions.length;
      var catKey = this.state.category;
      var catLabel = '';
      if (catKey) {
        var cat = CATEGORIES.find(function (c) { return c.key === catKey; });
        if (cat) catLabel = ' · ' + cat.label;
      }
      view.innerHTML =
        '<div class="card">' +
          '<h2>📝 Code Trace 道場結束' + catLabel + '</h2>' +
          '<p>本場完成 ' + doneCount + ' 題</p>' +
          '<div class="actions">' +
            '<button class="btn btn-primary" onclick="Mode8.start()">換個類別 / 再來一場</button>' +
            '<button class="btn btn-ghost" onclick="goHome()">回首頁</button>' +
          '</div>' +
        '</div>';
      show('view-play');
      this.state = null;
    }
  };

  // 簡易 HTML escape(避免題目內容若含特殊字元被當 HTML 解析)
  // 2026-05-19 R1 simplify:改用 window.escHTML(集中 helper)
  const escapeHTML = window.escHTML;

  window.Mode8 = Mode8;
})();
