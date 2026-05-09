// ============================================================
// Mode 1: AI 顧問實驗室 (RPG 情境決策模式)
// 玩家扮演企業 AI 顧問,接收 12 個產業任務,以 RPG 對話方式答題
// ============================================================
(function () {
  'use strict';

  const PROGRESS_KEY = 'ipas_mode1_progress_v1';

  const Mode1 = {
    // ---------- 12 個產業任務設定 ----------
    industries: [
      { key: 'ecommerce',  name: '電商零售',   icon: '🛒', role: '電商營運長',
        keywords: ['電商', '電子商務', '顧客', '評論', '行銷', '購物', '消費者', '商品推薦'],
        scene: '線上購物平台會議室,儀表板顯示即時訂單與顧客行為熱圖。' },
      { key: 'finance',    name: '金融科技',   icon: '💰', role: '銀行風控長',
        keywords: ['金融', '銀行', '信用', '風控', '詐欺', '保險', '貸款', '理財'],
        scene: '金融機構交易監控中心,大螢幕顯示即時風險評分。' },
      { key: 'healthcare', name: '智慧醫療',   icon: '🏥', role: '醫院資訊主任',
        keywords: ['醫療', '醫院', '診斷', '病人', '臨床', '藥', '影像', '健康'],
        scene: '醫院資訊室,牆上掛著放射影像與電子病歷介面。' },
      { key: 'autonomous', name: '自駕車輛',   icon: '🚗', role: '車聯網總工程師',
        keywords: ['自駕', '自動駕駛', '車輛', '感測器', '行車', '交通'],
        scene: '車廠測試場,自駕原型車正進行道路情境模擬。' },
      { key: 'manufacturing', name: '智慧製造', icon: '🏭', role: '工廠廠長',
        keywords: ['製造', '智慧製造', '生產線', '瑕疵', '工廠', '設備', '品質', '預測維護'],
        scene: '智慧工廠中控室,生產線數據與良率即時更新。' },
      { key: 'energy',     name: '能源電力',   icon: '⚡', role: '電網調度主管',
        keywords: ['電力', '太陽能', '能源', '電網', '發電', '用電', '再生能源'],
        scene: '電網控制中心,牆面投影著各區用電負載圖。' },
      { key: 'telecom',    name: '電信通訊',   icon: '📡', role: '電信營運主管',
        keywords: ['電信', '客戶流失', '通話', '基地台', '5G', '網路', '訊號'],
        scene: '電信營運中心,監控全國基地台與客戶留存率。' },
      { key: 'media',      name: '媒體行銷',   icon: '📰', role: '媒體總編輯',
        keywords: ['媒體', '新聞', '廣告', '行銷素材', '內容', '社群', '影音'],
        scene: '媒體編輯台,多螢幕同步顯示熱門話題與廣告投放成效。' },
      { key: 'smartcity',  name: '智慧城市',   icon: '🏙️', role: '市政科技長',
        keywords: ['智慧城市', '監控', '交通', '城市', '路口', '行人', '公共'],
        scene: '市政指揮中心,大螢幕呈現城市攝影機與感測器網絡。' },
      { key: 'education',  name: '智慧教育',   icon: '🎓', role: '教育科技長',
        keywords: ['教育', '學生', '學習', '教學', '課程', '考試'],
        scene: '線上學習平台後台,顯示學生互動與學習軌跡。' },
      { key: 'logistics',  name: '物流供應鏈', icon: '🚚', role: '供應鏈總監',
        keywords: ['物流', '配送', '倉儲', '供應鏈', '貨運', '路徑'],
        scene: '物流調度中心,即時追蹤車隊與倉庫吞吐量。' },
      { key: 'legal',      name: '法律科技',   icon: '⚖️', role: '法務長',
        keywords: ['法律', '法務', '契約', '合規', '隱私', '個資', 'GDPR'],
        scene: '律師事務所合議室,牆上掛滿契約審查流程圖。' }
    ],

    // ---------- 執行階段狀態 ----------
    state: {
      current: null,     // 目前產業 key
      queue: [],         // 該產業待答題目
      total: 0,
      correct: 0,
      idx: 0
    },

    // ---------- 進入點 ----------
    start() {
      this.renderMap();
    },

    // ---------- 進度存取 ----------
    loadProgress() {
      try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }
      catch (e) { return {}; }
    },
    saveProgress(p) {
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
    },

    // ---------- 從 QUESTIONS 篩出符合該產業的題目 ----------
    pickIndustryQuestions(ind, n) {
      const all = (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS)) ? QUESTIONS : [];
      const matched = all.filter(q => {
        const stem = (q.stem || '') + ' ' + ((q.tags || []).join(' '));
        return ind.keywords.some(k => stem.indexOf(k) !== -1);
      });
      let pool = matched;
      // 若該產業關鍵字命中題目不足,從 subject=1 的題庫補上
      if (pool.length < n) {
        const fallback = all.filter(q => q.subject === 1 && pool.indexOf(q) === -1);
        pool = pool.concat(RNG.shuffle(fallback).slice(0, n - pool.length));
      }
      return RNG.pickN(pool, Math.min(n, pool.length));
    },

    // ---------- 任務地圖 ----------
    renderMap() {
      const progress = this.loadProgress();
      const cards = this.industries.map(ind => {
        const p = progress[ind.key];
        const done = p ? `${p.correct}/${p.total}` : '尚未挑戰';
        const rate = p && p.total ? Math.round(p.correct / p.total * 100) : 0;
        const badge = p && p.total ? (rate >= 80 ? '🏆' : rate >= 60 ? '🥈' : '🥉') : '';
        const tip = p ? `完成度 ${rate}% ${badge}` : '點擊開始任務';
        return `
          <button class="mode-card" onclick="Mode1.selectIndustry('${ind.key}')">
            <div style="font-size:34px;line-height:1">${ind.icon}</div>
            <div style="font-weight:700;margin-top:6px">${ind.name}</div>
            <div style="font-size:12px;opacity:.75;margin-top:4px">${ind.role}</div>
            <div style="font-size:11px;margin-top:8px;color:#9ad">${done} ${badge}</div>
            <div style="font-size:10px;opacity:.55;margin-top:2px">${tip}</div>
          </button>`;
      }).join('');

      const html = `
        <div class="card rpg-scene">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:20px;font-weight:800">🧑‍💼 AI 顧問實驗室</div>
              <div style="font-size:13px;opacity:.8;margin-top:4px">選擇一個產業任務,以企業 AI 顧問身分進行情境決策</div>
            </div>
            <button class="btn btn-ghost" onclick="goHome()">← 返回首頁</button>
          </div>
        </div>
        <div class="card">
          <div style="font-size:14px;font-weight:600;margin-bottom:10px">📋 任務地圖 (12 個產業)</div>
          <div class="modes-grid">${cards}</div>
        </div>`;

      const playEl = document.getElementById('view-play');
      if (playEl) playEl.innerHTML = html;
      show('view-play');
    },

    // ---------- 選擇產業並開始 ----------
    selectIndustry(key) {
      const ind = this.industries.find(i => i.key === key);
      if (!ind) return;
      const N = 5 + Math.floor(Math.random() * 4); // 5-8 題
      const qs = this.pickIndustryQuestions(ind, N);
      if (!qs.length) {
        showToast('題庫不足,請稍後再試');
        return;
      }
      this.state = {
        current: key,
        queue: qs,
        total: qs.length,
        correct: 0,
        idx: 0
      };

      // 接管 PlayEngine 的下一題回調
      if (typeof PlayEngine !== 'undefined') {
        PlayEngine.onNext = () => Mode1.nextQuestion();
      }
      this.nextQuestion();
    },

    // ---------- 取下一題 ----------
    nextQuestion() {
      const s = this.state;
      const ind = this.industries.find(i => i.key === s.current);
      if (!ind) return;

      // 結束:已答完所有題
      if (s.idx >= s.queue.length) {
        this.finishIndustry(ind);
        return;
      }

      const q = s.queue[s.idx];
      s.idx++;

      // 由前一題的對錯記錄(PlayEngine 已寫入 Wrongbook,我們從 Mastery 推斷)
      // 這裡採直接統計:答題後,回到我們的 onNext 時,就把 idx-1 的對錯回填
      // 為了精確統計,改用攔截 PlayEngine.show 後的選項點擊事件
      const ctxHTML = this._buildContextHTML(ind, s.idx, s.queue.length);

      if (typeof PlayEngine !== 'undefined' && typeof PlayEngine.show === 'function') {
        // 包一層攔截:捕獲本題答對與否
        const origOnNext = PlayEngine.onNext;
        PlayEngine.onNext = () => {
          // 從 DOM 結果區判斷對錯
          const res = document.querySelector('#play-result');
          if (res) {
            const txt = res.textContent || '';
            if (txt.indexOf('答對') !== -1 || txt.indexOf('正確') !== -1) {
              s.correct++;
            }
          }
          if (typeof origOnNext === 'function') origOnNext();
          else Mode1.nextQuestion();
        };
        PlayEngine.show(q, { contextHTML: ctxHTML });
      }
    },

    // ---------- 上方 RPG 對話標頭 ----------
    _buildContextHTML(ind, cur, total) {
      const npc = this._npcLine(ind);
      return `
        <div class="rpg-scene" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div class="rpg-industry-tag">${ind.icon} ${ind.name} 任務</div>
            <div style="font-size:12px;opacity:.8">第 ${cur} / ${total} 題</div>
          </div>
          <div class="rpg-character" style="margin-top:10px">
            <div class="rpg-avatar">${ind.icon}</div>
            <div class="rpg-dialogue">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${ind.role}</div>
              <div style="font-size:13px;opacity:.9">「${npc}」</div>
              <div style="font-size:11px;opacity:.6;margin-top:6px">📍 ${ind.scene}</div>
            </div>
          </div>
          <div style="margin-top:10px;font-size:12px;opacity:.7">🧑‍💼 你是受邀的 AI 顧問,請依下方情境選擇最佳行動方案:</div>
        </div>`;
    },

    // ---------- 隨機 NPC 開場白(讓對話有變化) ----------
    _npcLine(ind) {
      const lines = {
        ecommerce:    ['顧問,推薦系統最近怪怪的,我們需要您的判斷。', '雙11 流量飆升,演算法該怎麼調?', '客訴模型誤判好多,該怎麼辦?'],
        finance:      ['這筆交易看起來怪怪的,請給我建議。', '監理機關要求模型可解釋,怎麼做?', '反詐欺模型誤殺率太高,怎麼處理?'],
        healthcare:   ['影像 AI 給的建議,我們該完全相信嗎?', '病人資料不能出院,模型要怎麼訓練?', '臨床準確率與公平性怎麼平衡?'],
        autonomous:   ['這個感測器資料是不是被汙染了?', '路測情境太極端,模型總是犯錯。', '系統出錯了,責任該怎麼界定?'],
        manufacturing:['瑕疵檢測模型誤報率上升了,怎麼辦?', '設備預測維護的訊號太雜,如何處理?', '產線資料外洩風險,該怎麼防?'],
        energy:       ['用電預測誤差太大,該怎麼修正?', '再生能源波動,模型跟不上。', '智慧電網的隱私問題該怎麼解?'],
        telecom:      ['客戶流失模型,我們該採取行動了嗎?', '5G 訊號優化的 AI 該怎麼部署?', '基地台異常偵測誤報太多。'],
        media:        ['這則新聞是不是 AI 生成的?', '推薦演算法製造了同溫層,怎麼解?', 'AI 生成廣告素材有版權問題嗎?'],
        smartcity:    ['人臉辨識的隱私爭議,我們該如何因應?', '交通號誌 AI 控制有公平問題嗎?', '城市監控資料治理該怎麼做?'],
        education:    ['AI 出題評量的公平性怎麼保證?', '學生使用生成式 AI 寫作業,該擋嗎?', '個性化學習如何不貼標籤?'],
        logistics:    ['路徑優化模型常常推薦違規路線,怎麼辦?', '倉儲機器人撞貨了,該找誰負責?', '預測補貨資料外洩,如何處理?'],
        legal:        ['這份合約 AI 審完,我們敢直接送出嗎?', '個資法新規的 AI 合規,怎麼做?', 'AI 生成的法律意見書有效力嗎?']
      };
      return RNG.pick(lines[ind.key] || ['顧問,請就此情境給我們建議。']);
    },

    // ---------- 完成該產業的結算頁 ----------
    finishIndustry(ind) {
      const s = this.state;
      const rate = s.total ? Math.round(s.correct / s.total * 100) : 0;
      const tier = rate >= 80 ? { e: '🏆', n: '黃金顧問', c: '#fbbf24' }
                 : rate >= 60 ? { e: '🥈', n: '資深顧問', c: '#cbd5e1' }
                 : { e: '🥉', n: '見習顧問', c: '#d97706' };

      // 寫入進度
      const prog = this.loadProgress();
      const prev = prog[ind.key];
      if (!prev || (s.correct / s.total) > (prev.correct / prev.total)) {
        prog[ind.key] = { correct: s.correct, total: s.total, ts: Date.now() };
      }
      this.saveProgress(prog);

      // 解鎖下個任務的提示
      const idx = this.industries.findIndex(i => i.key === ind.key);
      const next = this.industries[(idx + 1) % this.industries.length];

      const html = `
        <div class="card rpg-scene">
          <div style="text-align:center">
            <div style="font-size:64px">${tier.e}</div>
            <div style="font-size:22px;font-weight:800;color:${tier.c};margin-top:6px">${tier.n}徽章</div>
            <div style="font-size:14px;opacity:.85;margin-top:8px">${ind.icon} ${ind.name} 任務完成</div>
          </div>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-around;text-align:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-size:12px;opacity:.7">答對</div>
              <div style="font-size:24px;font-weight:800;color:#34d399">${s.correct}</div>
            </div>
            <div>
              <div style="font-size:12px;opacity:.7">總題數</div>
              <div style="font-size:24px;font-weight:800">${s.total}</div>
            </div>
            <div>
              <div style="font-size:12px;opacity:.7">完成率</div>
              <div style="font-size:24px;font-weight:800;color:${tier.c}">${rate}%</div>
            </div>
          </div>
          <div style="margin-top:14px;padding:10px;background:rgba(52,211,153,.08);border-radius:8px;font-size:13px">
            ${rate >= 80 ? '太精彩了!您的決策展現專業 AI 顧問的洞見。' :
              rate >= 60 ? '不錯的表現,持續累積各產業的決策經驗。' :
              '別氣餒,錯題已自動進入錯題本,記得下鑽複習!'}
          </div>
          <div style="margin-top:12px;padding:10px;background:rgba(96,165,250,.08);border-radius:8px;font-size:12px">
            🔓 下個任務推薦: ${next.icon} ${next.name} (${next.role})
          </div>
          <div class="actions" style="margin-top:14px">
            <button class="btn btn-primary" onclick="Mode1.start()">🗺️ 回任務地圖</button>
            <button class="btn btn-ghost" onclick="Mode1.selectIndustry('${ind.key}')">🔁 重新挑戰</button>
            <button class="btn btn-ghost" onclick="Mode1.selectIndustry('${next.key}')">▶️ 下一個任務</button>
            <button class="btn btn-warn" onclick="goHome()">🏠 結束回首頁</button>
          </div>
        </div>`;

      const resEl = document.getElementById('view-result');
      if (resEl) resEl.innerHTML = html;
      show('view-result');
    }
  };

  window.Mode1 = Mode1;
})();
