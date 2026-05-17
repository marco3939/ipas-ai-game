/* === Interactive Confusion Matrix Component ===
 * 規格:docs/spec-confusion-matrix.md
 * 全域:`ConfusionMatrix`(裸名讀,不掛 window — 與 SM2 / PlayEngine / Mastery 慣例一致)
 *
 * 互動:HTML5 drag-drop(desktop) + click-to-select fallback(touch)
 * 整合點:PlayEngine.show() 偵測 question.interaction_type === 'confusion-matrix' 後分流到本元件
 * 答題完成後:bypass PlayEngine.answer,直接複製 Mastery/Wrongbook/SM2 邏輯(spec §4.3)
 */
const ConfusionMatrix = {
  state: null,
  // state schema:
  //   { qid, container, question,
  //     slots: { tp_cell: null|labelKey, fp_cell: ..., fn_cell: ..., tn_cell: ... },
  //     matrix: { tp, fp, fn, tn },
  //     expectedMetric, expectedAnswer,
  //     selectedSourceKey: null,  // touch click-mode 已選的 label key
  //     isTouch: bool,
  //     submitted: bool }

  // 4 個拖曳源的固定資料
  // labelKey = 'tp_label' 等(對應 question.matrix_data.labels[labelKey])
  // 正確位置:tp_label → tp_cell, fp_label → fp_cell, ...
  CELL_POSITIONS: ['tp_cell', 'fp_cell', 'fn_cell', 'tn_cell'],
  LABEL_KEYS: ['tp_label', 'fp_label', 'fn_label', 'tn_label'],

  render(question, container) {
    if (!question || !container) return;
    const md = question.matrix_data || {};
    const labels = md.labels || {};
    const tp = Number(md.tp) || 0;
    const fp = Number(md.fp) || 0;
    const fn = Number(md.fn) || 0;
    const tn = Number(md.tn) || 0;

    this.state = {
      qid: question.id,
      container,
      question,
      slots: { tp_cell: null, fp_cell: null, fn_cell: null, tn_cell: null },
      matrix: { tp, fp, fn, tn },
      expectedMetric: question.expected_metric || 'f1',
      expectedAnswer: question.expected_answer || '',
      selectedSourceKey: null,
      isTouch: ('ontouchstart' in window),
      submitted: false
    };

    // 樣本說明文字 = labels[labelKey] + 數量(含 case_b 的視覺資料)
    const cellsHTML = this.CELL_POSITIONS.map(pos => {
      const headerMap = { tp_cell: '預測陽 / 真實陽 (TP)', fp_cell: '預測陽 / 真實陰 (FP)',
                          fn_cell: '預測陰 / 真實陽 (FN)', tn_cell: '預測陰 / 真實陰 (TN)' };
      return `<div class="cm-cell" data-position="${pos}">
        <div style="font-size:0.75rem;color:var(--fg-mute);margin-bottom:4px">${headerMap[pos]}</div>
        <div class="cm-cell-content" data-content="${pos}"></div>
      </div>`;
    }).join('');

    const sourcesHTML = this.LABEL_KEYS.map(key => {
      const numKey = key.replace('_label', '');  // tp_label → tp
      const num = this.state.matrix[numKey];
      const txt = labels[key] || key;
      return `<div class="cm-source" draggable="true" data-label-key="${key}">
        <strong>${txt}</strong>
        <span style="margin-left:8px;color:var(--fg-dim)">(${num} 例)</span>
      </div>`;
    }).join('');

    const metricNames = { f1: 'F1-Score', precision: 'Precision', recall: 'Recall',
                          accuracy: 'Accuracy', macro_f1: 'macro F1' };
    const metricLabel = metricNames[this.state.expectedMetric] || 'F1';

    // 對 Q5 macro_f1:在輸入區下方顯示 class B / C 的 F1(從 question.extra_classes 讀)
    const extraInfo = (question.extra_classes && question.extra_classes.length > 0) ?
      `<div style="margin-top:8px;font-size:0.875rem;color:var(--fg-dim)">補充:${
        question.extra_classes.map(c => `${c.name} F1 = ${c.f1}`).join(', ')
      }</div>` : '';

    container.innerHTML = `
      <div class="question-card">
        <div class="question-meta">
          <span class="badge">編碼 ${question.knowledge_code}</span>
          <span class="badge">${question.difficulty || ''}</span>
          <span class="badge">互動矩陣 · ${metricLabel}</span>
        </div>
        <div class="question-stem">${question.stem}</div>

        <div style="margin:12px 0;color:var(--fg-dim);font-size:0.875rem">
          ${this.state.isTouch ? '📱 點擊模式:先點下方樣本 → 再點對應格子' : '🖱️ 拖曳模式:把樣本拖到對應格子'}
        </div>

        <div style="margin-bottom:12px">
          <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:6px">樣本池(拖曳源):</div>
          <div style="display:flex;flex-direction:column;gap:6px">${sourcesHTML}</div>
        </div>

        <div style="margin-bottom:12px">
          <div style="font-size:0.85rem;color:var(--fg-dim);margin-bottom:6px">2×2 混淆矩陣(把樣本拖到正確格):</div>
          <div class="cm-grid">${cellsHTML}</div>
        </div>

        <div style="margin-top:16px;padding:12px;background:var(--bg-3);border-radius:var(--radius-sm)">
          <label style="display:block;margin-bottom:6px;font-size:0.95rem">
            請計算 <strong>${metricLabel}</strong>(${question.answer_format || '小數三位'}):
          </label>
          <input type="text" id="cm-answer-input" placeholder="例如 0.800"
            style="font-family:monospace;font-size:1.1rem;padding:8px 12px;background:var(--bg-2);
                   color:var(--fg);border:2px solid var(--border);border-radius:var(--radius-sm);width:140px">
          ${extraInfo}
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="cm-submit-btn">✅ 提交答案</button>
            <button class="btn btn-ghost" id="cm-reset-btn">🔄 重置</button>
          </div>
        </div>

        <div id="play-explanation"></div>
      </div>
    `;

    this._attachListeners();
  },

  _attachListeners() {
    const c = this.state.container;
    const sources = c.querySelectorAll('.cm-source');
    const cells = c.querySelectorAll('.cm-cell');

    if (this.state.isTouch) {
      // === 觸控:click-to-select 模式 ===
      sources.forEach(src => {
        src.addEventListener('click', () => {
          if (this.state.submitted) return;
          // 切換選取
          sources.forEach(s => s.classList.remove('selected'));
          this.state.selectedSourceKey = src.dataset.labelKey;
          src.classList.add('selected');
        });
      });
      cells.forEach(cell => {
        cell.addEventListener('click', () => {
          if (this.state.submitted) return;
          if (!this.state.selectedSourceKey) return;
          this.placeLabel(cell.dataset.position, this.state.selectedSourceKey);
          // 取消選取
          sources.forEach(s => s.classList.remove('selected'));
          this.state.selectedSourceKey = null;
        });
      });
    } else {
      // === 桌面:HTML5 drag-drop 模式 ===
      sources.forEach(src => {
        src.addEventListener('dragstart', (ev) => {
          if (this.state.submitted) { ev.preventDefault(); return; }
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', src.dataset.labelKey);
          src.classList.add('dragging');
        });
        src.addEventListener('dragend', () => src.classList.remove('dragging'));
      });
      cells.forEach(cell => {
        cell.addEventListener('dragover', (ev) => {
          if (this.state.submitted) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          cell.classList.add('drag-over');
        });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (ev) => {
          ev.preventDefault();
          cell.classList.remove('drag-over');
          if (this.state.submitted) return;
          const labelKey = ev.dataTransfer.getData('text/plain');
          if (!labelKey) return;
          this.placeLabel(cell.dataset.position, labelKey);
        });
      });
    }

    // submit / reset
    const submitBtn = c.querySelector('#cm-submit-btn');
    const resetBtn = c.querySelector('#cm-reset-btn');
    if (submitBtn) submitBtn.addEventListener('click', () => this.submit());
    if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
  },

  placeLabel(cellPosition, labelKey) {
    if (!this.state || this.state.submitted) return;
    if (!this.CELL_POSITIONS.includes(cellPosition)) return;
    if (!this.LABEL_KEYS.includes(labelKey)) return;

    // 若該 label 已放在其他 cell,先清掉舊位置
    for (const pos of this.CELL_POSITIONS) {
      if (this.state.slots[pos] === labelKey) this.state.slots[pos] = null;
    }
    this.state.slots[cellPosition] = labelKey;

    // 重繪該格與被清空的格
    this._refreshCells();
  },

  _refreshCells() {
    const c = this.state.container;
    const labels = this.state.question.matrix_data.labels || {};
    for (const pos of this.CELL_POSITIONS) {
      const cell = c.querySelector(`.cm-cell[data-position="${pos}"]`);
      if (!cell) continue;
      const contentEl = cell.querySelector('.cm-cell-content');
      const labelKey = this.state.slots[pos];
      cell.classList.remove('has-label', 'correct-placement', 'wrong-placement');
      if (labelKey) {
        cell.classList.add('has-label');
        const numKey = labelKey.replace('_label', '');
        const num = this.state.matrix[numKey];
        const txt = labels[labelKey] || labelKey;
        if (contentEl) contentEl.innerHTML = `<strong>${txt}</strong><br><span style="color:var(--fg-dim)">(${num} 例)</span>`;
      } else {
        if (contentEl) contentEl.innerHTML = '<span style="color:var(--fg-mute)">(尚未放置)</span>';
      }
    }
    // source 視覺:已使用的 source 變灰
    const used = new Set(Object.values(this.state.slots).filter(Boolean));
    c.querySelectorAll('.cm-source').forEach(src => {
      if (used.has(src.dataset.labelKey)) src.classList.add('used');
      else src.classList.remove('used');
    });
  },

  // 檢查 4 格放置是否全部正確(tp_label → tp_cell 對稱對應)
  validateLayout() {
    if (!this.state) return false;
    return this.CELL_POSITIONS.every(pos => {
      const expected = pos.replace('_cell', '_label');
      return this.state.slots[pos] === expected;
    });
  },

  // 從 state.matrix 計算指定 metric(根據 question.expected_metric)
  // 注意:此函數讀題庫實際數值,非使用者放置結果(layout 對錯獨立判定)
  computeUserAnswer(method) {
    if (!this.state) return '';
    const m = method || this.state.expectedMetric;
    const { tp, fp, fn, tn } = this.state.matrix;
    let val = 0;
    if (m === 'precision') {
      val = (tp + fp === 0) ? 0 : tp / (tp + fp);
    } else if (m === 'recall') {
      val = (tp + fn === 0) ? 0 : tp / (tp + fn);
    } else if (m === 'accuracy') {
      const total = tp + fp + fn + tn;
      val = (total === 0) ? 0 : (tp + tn) / total;
    } else if (m === 'macro_f1') {
      // class A 從矩陣計;class B/C 從 question.extra_classes 讀
      const pA = (tp + fp === 0) ? 0 : tp / (tp + fp);
      const rA = (tp + fn === 0) ? 0 : tp / (tp + fn);
      const f1A = (pA + rA === 0) ? 0 : 2 * pA * rA / (pA + rA);
      const extras = this.state.question.extra_classes || [];
      const others = extras.map(c => Number(c.f1) || 0);
      const all = [f1A, ...others];
      val = all.reduce((s, v) => s + v, 0) / all.length;
    } else {
      // f1 (default)
      const p = (tp + fp === 0) ? 0 : tp / (tp + fp);
      const r = (tp + fn === 0) ? 0 : tp / (tp + fn);
      val = (p + r === 0) ? 0 : 2 * p * r / (p + r);
    }
    // 預設三位小數
    return val.toFixed(3);
  },

  submit() {
    if (!this.state || this.state.submitted) return;
    const inputEl = this.state.container.querySelector('#cm-answer-input');
    const userInput = (inputEl && inputEl.value || '').trim();
    if (!userInput) {
      if (typeof showToast === 'function') showToast('⚠️ 請先輸入答案', 2000);
      return;
    }
    // 4 格全部放滿才能提交
    const allPlaced = this.CELL_POSITIONS.every(pos => this.state.slots[pos] !== null);
    if (!allPlaced) {
      if (typeof showToast === 'function') showToast('⚠️ 請先把 4 個樣本放到對應格子', 2500);
      return;
    }

    const layoutCorrect = this.validateLayout();
    // 數值比對:使用者輸入 vs expectedAnswer(字串比較,或 ±0.001 容差)
    const expected = String(this.state.expectedAnswer).trim();
    const valueCorrect = this._compareAnswer(userInput, expected);
    const isCorrect = layoutCorrect && valueCorrect;

    this.state.submitted = true;

    // 視覺反饋:每格標 correct/wrong-placement
    for (const pos of this.CELL_POSITIONS) {
      const cell = this.state.container.querySelector(`.cm-cell[data-position="${pos}"]`);
      if (!cell) continue;
      const expectedLabel = pos.replace('_cell', '_label');
      if (this.state.slots[pos] === expectedLabel) cell.classList.add('correct-placement');
      else cell.classList.add('wrong-placement');
    }

    // 鎖 input/buttons
    if (inputEl) inputEl.disabled = true;
    const submitBtn = this.state.container.querySelector('#cm-submit-btn');
    const resetBtn = this.state.container.querySelector('#cm-reset-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (resetBtn) resetBtn.disabled = true;

    // === 走 PlayEngine 既有判定路徑(spec §4.3 推薦方式)===
    const q = this.state.question;
    if (typeof Mastery !== 'undefined' && q.node_id) Mastery.update(q.node_id, isCorrect);
    if (typeof Progress !== 'undefined') Progress.addAnswer(isCorrect);
    // 案例 10 audit S-3:CM 答對 mark SeenCorrect 讓跨關卡排除生效
    if (isCorrect && q.id && typeof SeenCorrect !== 'undefined') SeenCorrect.mark(q.id);
    if (!isCorrect && typeof Wrongbook !== 'undefined') {
      // 2026-05-16 案例 10 補:Wrongbook.add 簽名是 (qid, nodeId, userChoice, correctChoice, userText, correctText)
      // Confusion-matrix 題型沒有 A/B/C/D key,userInput 是數字字串。文字放對欄位、key 槽留 '?'
      const correctOpt = (q.options || []).find(o => o.is_correct);
      Wrongbook.add(
        q.id, q.node_id, '?', '?',
        userInput || '',
        (correctOpt && correctOpt.text) || ''
      );
    }
    if (typeof SM2 !== 'undefined' && q.id) SM2.recordAnswer(q.id, isCorrect, false);

    // 更新 PlayEngine.current 對應(供 ErrorReports.renderButton 取得 context)
    if (typeof PlayEngine !== 'undefined') PlayEngine.current = q;

    // 自寫 explanation(模仿 PlayEngine.showExplanation 結構,但簡化)
    this._renderExplanation(isCorrect, userInput, layoutCorrect, valueCorrect);

    if (typeof refreshHome === 'function') refreshHome();
  },

  _compareAnswer(userInput, expected) {
    // 容許「0.8」對「0.800」、「30%」對「30」等
    const norm = s => String(s).replace(/[%\s]/g, '').trim();
    const a = norm(userInput);
    const b = norm(expected);
    if (a === b) return true;
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) <= 0.001;
    return false;
  },

  _renderExplanation(isCorrect, userInput, layoutCorrect, valueCorrect) {
    const q = this.state.question;
    const e = q.explanation || {};
    const correctOpt = (q.options || []).find(o => o.is_correct);
    const expBox = this.state.container.querySelector('#play-explanation');
    if (!expBox) return;

    const layoutMsg = layoutCorrect ?
      '✅ 4 格樣本放置全部正確' :
      '❌ 樣本放置有誤';
    const valueMsg = valueCorrect ?
      `✅ 數值 ${userInput} 正確` :
      `❌ 數值 ${userInput}(正解 ${this.state.expectedAnswer})`;

    const errorBtnHTML = (typeof ErrorReports !== 'undefined') ? ErrorReports.renderButton(q.id) : '';

    const html = `
      <div class="explanation">
        <div class="verdict ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '✅ 答對!' : '❌ 答錯了'}</div>

        <div style="margin:8px 0;font-size:0.95rem">
          <div>${layoutMsg}</div>
          <div>${valueMsg}</div>
        </div>

        <div style="background:rgba(74,222,128,0.12);border-left:4px solid #4ade80;padding:12px;border-radius:6px;margin:10px 0">
          <div style="color:#4ade80;font-weight:700;font-size:0.95rem;margin-bottom:4px">📚 正確答案</div>
          <div style="font-size:1rem;margin-bottom:6px"><strong>${correctOpt ? correctOpt.text : this.state.expectedAnswer}</strong></div>
          <div style="color:var(--fg);line-height:1.7">${e.correct || '請參考正確選項數值'}</div>
        </div>

        ${e.hook ? `<div style="background:rgba(250,204,21,0.12);border-left:4px solid #facc15;padding:10px 12px;border-radius:6px;margin:10px 0">
          <div style="color:#facc15;font-weight:700;font-size:0.85rem">💡 記憶口訣</div>
          <div style="color:var(--fg);font-style:italic;margin-top:2px">${e.hook}</div>
        </div>` : ''}

        ${q.misconceptions && q.misconceptions.length > 0 ? `<div style="background:rgba(168,85,247,0.10);border-left:4px solid #a855f7;padding:10px 12px;border-radius:6px;margin:10px 0">
          <div style="color:#c084fc;font-weight:700;font-size:0.85rem">⚠️ 常見誤解</div>
          <div style="color:var(--fg);margin-top:2px">${q.misconceptions.map(m => '• ' + m).join('<br>')}</div>
        </div>` : ''}

        <div class="actions" style="margin-top:14px">
          <button class="btn btn-primary" onclick="PlayEngine.next()">繼續下一題 →</button>
          ${!isCorrect ? `<button class="btn btn-warn" onclick="PlayEngine.drill()">🎯 立即下鑽變化型</button>` : ''}
          ${errorBtnHTML}
          <button class="btn btn-ghost" onclick="goHome()">回首頁</button>
        </div>
      </div>
    `;
    expBox.innerHTML = html;
  },

  reset() {
    if (!this.state || this.state.submitted) return;
    for (const pos of this.CELL_POSITIONS) this.state.slots[pos] = null;
    this.state.selectedSourceKey = null;
    const c = this.state.container;
    c.querySelectorAll('.cm-source').forEach(s => s.classList.remove('selected', 'used', 'dragging'));
    c.querySelectorAll('.cm-cell').forEach(cell => cell.classList.remove('has-label', 'correct-placement', 'wrong-placement'));
    this._refreshCells();
    const inputEl = c.querySelector('#cm-answer-input');
    if (inputEl) inputEl.value = '';
  }
};
