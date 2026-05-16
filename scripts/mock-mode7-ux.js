// scripts/mock-mode7-ux.js — verify Mode 7 UX features integration
// (does not drive full DOM, but verifies key methods exist + state shape is correct)
'use strict';
const fs = require('fs');
const path = require('path');

const MODE7_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'modes', 'mode7.js'), 'utf8');

let pass = 0, fail = 0;
function chk(label, cond) {
  if (cond) { pass++; console.log('  PASS:', label); }
  else      { fail++; console.log('  FAIL:', label); }
}

console.log('=== Mode 7 UX feature presence ===');

// F1: 字級
chk('F1 — FONT_SCALE_LEVELS defined', /FONT_SCALE_LEVELS\s*=\s*\[/.test(MODE7_SRC));
chk('F1 — 5 levels (S/M/L/XL/XXL)', /'S'.*'M'.*'L'.*'XL'.*'XXL'/s.test(MODE7_SRC));
chk('F1 — _applyFontScale method', /_applyFontScale\(/.test(MODE7_SRC));
chk('F1 — setFontScale exposed', /setFontScale\(/.test(MODE7_SRC));
chk('F1 — CSS variable --m7-font-scale used', /--m7-font-scale/.test(MODE7_SRC));
chk('F1 — localStorage persistence', /FONT_SCALE_KEY/.test(MODE7_SRC) && /Storage\.(get|set)\(FONT_SCALE_KEY/.test(MODE7_SRC));

// F2: 標記
chk('F2 — toggleMark method', /toggleMark\(/.test(MODE7_SRC));
chk('F2 — state.markedIds Set', /markedIds:\s*new Set\(\)/.test(MODE7_SRC));
chk('F2 — m7-mark-btn class', /m7-mark-btn/.test(MODE7_SRC));
chk('F2 — marked indicator in qlist', /m7-qlist-mark/.test(MODE7_SRC));

// F3: 上一題 / 下一題
chk('F3 — navigatePrev method', /navigatePrev\(/.test(MODE7_SRC));
chk('F3 — navigateNext method', /navigateNext\(/.test(MODE7_SRC));
chk('F3 — submitMock method', /submitMock\(/.test(MODE7_SRC));
chk('F3 — m7-nav-bar', /m7-nav-bar/.test(MODE7_SRC));
chk('F3 — race guard in setTimeout', /race guard|self\.state\.idx\s*!==\s*idx/.test(MODE7_SRC));

// F4: 題目列表
chk('F4 — openQuestionList method', /openQuestionList\(/.test(MODE7_SRC));
chk('F4 — closeQuestionList method', /closeQuestionList\(/.test(MODE7_SRC));
chk('F4 — jumpToQuestion method', /jumpToQuestion\(/.test(MODE7_SRC));
chk('F4 — m7-qlist-grid class', /m7-qlist-grid/.test(MODE7_SRC));
chk('F4 — backdrop modal', /m7-qlist-backdrop/.test(MODE7_SRC));

// F5: 複製
chk('F5 — copyQuestion method', /copyQuestion\(/.test(MODE7_SRC));
chk('F5 — navigator.clipboard', /navigator\.clipboard/.test(MODE7_SRC));
chk('F5 — _fallbackCopy', /_fallbackCopy/.test(MODE7_SRC));
chk('F5 — execCommand fallback', /execCommand\(['"]copy['"]\)/.test(MODE7_SRC));

// F6: 展開所有解析
chk('F6 — expandAllExplanations method', /expandAllExplanations\(/.test(MODE7_SRC));
chk('F6 — 展開所有解析 button', /展開所有解析/.test(MODE7_SRC));
chk('F6 — m7-all-explanations container', /m7-all-explanations/.test(MODE7_SRC));
chk('F6 — toggle expand/collapse', /dataset\.expanded/.test(MODE7_SRC));

// F7: 進度條 + 得分
chk('F7 — m7-toolbar-score score display', /m7-toolbar-score/.test(MODE7_SRC));
chk('F7 — score calculation (×2)', /correct\s*\*\s*2/.test(MODE7_SRC));
chk('F7 — m7-progress-bar', /m7-progress-bar/.test(MODE7_SRC));

// 防破壞性檢查
chk('Strict — timer never paused (no pause method)', !/Mode7\._pause|pauseTimer/.test(MODE7_SRC));
chk('Strict — explanation hidden during answer (PlayEngine.showExplanation suppressed)', /PlayEngine\.showExplanation\s*=\s*function/.test(MODE7_SRC));
chk('Strict — first-answer scoring locked (recordedQids guard)', /recordedQids/.test(MODE7_SRC));

// State shape
chk('State — markedIds, answers, recordedQids in state', /markedIds:\s*new Set\(\).*answers:\s*\{\}.*recordedQids:\s*new Set\(\)/s.test(MODE7_SRC));

console.log('');
console.log(`PASS: ${pass}  FAIL: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
