// 08-cleanup-race-modes.test.js
// 必證:goHome 必 cleanup Mode 1/2/3/4/5/6/7/8 timer + state(PR #27 修補)
//       setTimeout 殘留不會洗 view-play

const fs = require('fs');
const path = require('path');
const { ROOT, makeAssert } = require('./_helpers');

console.log('=== 08 Cleanup race modes ===\n');
const A = makeAssert();

(async function run() {
  // ----- [1] goHome 函式必呼叫各 mode 的 cleanup / stopTimer -----
  console.log('\n[1] goHome cleanup 各 mode 覆蓋(PR #27 補 Mode 3/4/5/6)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
    const m = idx.match(/function goHome\(\)\s*\{([\s\S]*?)\n\}/);
    A.ok(m, 'goHome function 存在');
    const body = m ? m[1] : '';
    const expectations = [
      { pat: /Mode1[^]*?_clearAllTimers/, label: 'Mode 1 _clearAllTimers' },
      { pat: /Mode2[^]*?_clearAllTimers/, label: 'Mode 2 _clearAllTimers' },
      { pat: /Mode3[^]*?stopTimer/, label: 'Mode 3 stopTimer (PR #27 C-1)' },
      { pat: /Mode4[^]*?stopTimer/, label: 'Mode 4 stopTimer (PR #27 C-1)' },
      { pat: /Mode5[^]*?cleanup/, label: 'Mode 5 cleanup (PR #27 C-1)' },
      { pat: /Mode6[^]*?cleanup/, label: 'Mode 6 cleanup (PR #27 C-1)' },
      { pat: /Mode7[^]*?cleanup/, label: 'Mode 7 cleanup' },
      { pat: /Mode8[^]*?_clearAllTimers/, label: 'Mode 8 _clearAllTimers' },
    ];
    for (const e of expectations) {
      A.ok(e.pat.test(body), `goHome 含: ${e.label}`);
    }
  }

  // ----- [2] 各 mode 都有 cleanup 或 _clearAllTimers 函式 -----
  console.log('\n[2] 各 mode 自身有 cleanup / stopTimer / _clearAllTimers');
  {
    const expected = {
      'mode1.js': /(_clearAllTimers|cleanup)\s*[(:]/,
      // FINDING: mode2.js 沒有 _clearAllTimers,但 goHome 用 optional-chaining 守護
      // 風險:mode2 有多個裸 setTimeout(523/543/562/571)中途離場會殘留
      'mode2.js': /setTimeout/,  // 至少確認有 timer 需要清,後續會 fail flag 提醒補修
      'mode3.js': /stopTimer\s*[(:]/,
      'mode4.js': /stopTimer\s*[(:]/,
      'mode5.js': /(cleanup|_clearAllTimers)\s*[(:]/,
      'mode6.js': /cleanup\s*[(:]/,
      'mode7.js': /cleanup\s*[(:]/,
      'mode8.js': /(_clearAllTimers|stopTimer|cleanup)\s*[(:]/,
    };
    for (const [f, re] of Object.entries(expected)) {
      const src = fs.readFileSync(path.join(ROOT, 'src/modes', f), 'utf8');
      A.ok(re.test(src), `${f}: 自有 cleanup/stopTimer/_clearAllTimers`);
    }
  }

  // ----- [3] Mode 5 _scheduleTimeout 集中管理 timer -----
  console.log('\n[3] Mode 5 _scheduleTimeout 集中管理');
  {
    const m5 = fs.readFileSync(path.join(ROOT, 'src/modes/mode5.js'), 'utf8');
    A.ok(/_scheduleTimeout\s*\(/.test(m5), 'mode5 _scheduleTimeout 存在');
    A.ok(/_clearAllTimers\s*\(\s*\)\s*\{/.test(m5), 'mode5 _clearAllTimers 實作');
    A.ok(/_pendingTimers/.test(m5), 'mode5 _pendingTimers 記錄');
  }

  // ----- [4] cleanup 內必呼叫 _clearAllTimers + state = null -----
  console.log('\n[4] cleanup 內呼叫清理');
  {
    const m5 = fs.readFileSync(path.join(ROOT, 'src/modes/mode5.js'), 'utf8');
    const cleanup5 = m5.match(/cleanup\(\)\s*\{([\s\S]*?)^\s+\},?\n/m);
    A.ok(cleanup5, 'mode5 cleanup function 找到');
    if (cleanup5) {
      A.ok(/_clearAllTimers\s*\(/.test(cleanup5[1]), 'mode5 cleanup 呼叫 _clearAllTimers');
    }
    const m6 = fs.readFileSync(path.join(ROOT, 'src/modes/mode6.js'), 'utf8');
    const cleanup6 = m6.match(/cleanup\(\)\s*\{([\s\S]*?)^\s+\},?\n/m);
    A.ok(cleanup6, 'mode6 cleanup function 找到');
    const m7 = fs.readFileSync(path.join(ROOT, 'src/modes/mode7.js'), 'utf8');
    const cleanup7 = m7.match(/cleanup\(\)\s*\{([\s\S]*?)^\s+\}/m);
    A.ok(cleanup7, 'mode7 cleanup function 找到');
    if (cleanup7) {
      A.ok(/_stopTimer\s*\(/.test(cleanup7[1]), 'mode7 cleanup 呼叫 _stopTimer');
      A.ok(/_restorePlayEngine\s*\(/.test(cleanup7[1]), 'mode7 cleanup 還原 PlayEngine hook');
      A.ok(/state\s*=\s*null/.test(cleanup7[1]), 'mode7 cleanup state=null');
    }
  }

  // ----- [5] 真 timer race simulation -----
  console.log('\n[5] 真 setTimeout race simulation(_clearAllTimers 真清空)');
  await new Promise(resolve => {
    const fm = {
      _pendingTimers: [],
      _viewWritten: false,
      _scheduleTimeout(fn, delay) {
        const id = setTimeout(() => {
          this._pendingTimers = this._pendingTimers.filter(x => x !== id);
          fn();
        }, delay);
        this._pendingTimers.push(id);
        return id;
      },
      _clearAllTimers() {
        this._pendingTimers.forEach(id => clearTimeout(id));
        this._pendingTimers = [];
      },
    };
    fm._scheduleTimeout(() => fm._viewWritten = 'one', 20);
    fm._scheduleTimeout(() => fm._viewWritten = 'two', 40);
    fm._scheduleTimeout(() => fm._viewWritten = 'three', 60);
    setTimeout(() => {
      fm._clearAllTimers();
      setTimeout(() => {
        A.eq(fm._viewWritten, false, '_clearAllTimers 後 timer 全清,view 未被改寫');
        A.eq(fm._pendingTimers.length, 0, '_pendingTimers 清空');
        resolve();
      }, 100);
    }, 10);
  });

  // ----- [5b] FINDING:mode2.js 無 _clearAllTimers — 中途離場 timer race 風險 -----
  console.log('\n[5b] FINDING:mode2 缺 _clearAllTimers(裸 setTimeout 殘留風險)');
  {
    const m2 = fs.readFileSync(path.join(ROOT, 'src/modes/mode2.js'), 'utf8');
    const hasClearAll = /_clearAllTimers\s*[(:]/.test(m2);
    const hasBareSetTimeout = (m2.match(/setTimeout\s*\(/g) || []).length;
    if (!hasClearAll && hasBareSetTimeout > 0) {
      console.log(`  WARN mode2.js 有 ${hasBareSetTimeout} 處裸 setTimeout 但無 _clearAllTimers — goHome 守 optional, 可能殘留洗 view-play`);
      A.ok(false, `mode2.js 應補 _clearAllTimers(同 mode1 _pendingTimers 模式)— 目前裸 setTimeout ${hasBareSetTimeout} 處`);
    } else {
      A.ok(true, 'mode2 timer 管理 OK');
    }
  }

  // ----- [6] PlayEngine.current = null 在 goHome 內 -----
  console.log('\n[6] goHome PlayEngine.current = null');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
    const m = idx.match(/function goHome\(\)\s*\{([\s\S]*?)\n\}/);
    if (m) {
      A.ok(/PlayEngine\.current\s*=\s*null/.test(m[1]), 'goHome 設 PlayEngine.current=null');
    }
  }

  process.exit(A.summary('08-cleanup-race-modes'));
})().catch(e => { console.error(e); process.exit(1); });
