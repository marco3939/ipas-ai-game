// browser-sim.test.js — jsdom-based smoke test for PR #49 changes
// 不需要真瀏覽器,跑真實 DOM + theme.js + index.html 結構驗證
// 確認 merge 前所有 user-facing 路徑都活著
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let pass = 0, fail = 0;
const log = (ok, msg) => { ok ? (pass++, console.log('  ✓', msg)) : (fail++, console.log('  ✗', msg)); };

async function main() {
  console.log('=== Browser simulation tests (jsdom) ===\n');

  console.log('[1] HTML loads + themes.js executes');
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const themesJs = fs.readFileSync(path.join(SRC, 'themes.js'), 'utf8');

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.eval(themesJs);

  log(typeof window.ThemeManager === 'object', 'window.ThemeManager exists');
  log(Array.isArray(window.THEMES), 'window.THEMES is array');
  log(window.THEMES.length === 11, `11 themes loaded (got ${window.THEMES.length})`);
  log(window.THEMES[0].id === 'default', 'first theme = default (Slate)');

  console.log('\n[2] Header button present');
  const themeBtn = window.document.getElementById('global-theme-btn');
  log(!!themeBtn, '#global-theme-btn 存在');
  log(themeBtn && themeBtn.textContent.includes('主題'), 'button 文字含 主題');
  log(themeBtn && themeBtn.getAttribute('onclick').includes('ThemeManager.openPicker'),
    'onclick 呼叫 ThemeManager.openPicker');

  const homeBtn = window.document.getElementById('global-home-btn');
  log(!!homeBtn && homeBtn.textContent.includes('首頁'), '#global-home-btn 仍存在');

  console.log('\n[3] ThemeManager.openPicker() 建模態框');
  const oldBackdrop = window.document.getElementById('theme-picker-backdrop');
  if (oldBackdrop) oldBackdrop.remove();
  window.ThemeManager.openPicker();
  const backdrop = window.document.getElementById('theme-picker-backdrop');
  log(!!backdrop, 'theme-picker-backdrop 已建立');
  const themeBtns = backdrop ? backdrop.querySelectorAll('button[data-theme-id]') : [];
  log(themeBtns.length === 11, `11 個主題卡 button (got ${themeBtns.length})`);

  const btnIds = Array.from(themeBtns).map(b => b.getAttribute('data-theme-id'));
  const expectedIds = ['default', 'ocean-depths', 'sunset-boulevard', 'forest-canopy',
    'modern-minimalist', 'golden-hour', 'arctic-frost', 'desert-rose',
    'tech-innovation', 'botanical-garden', 'midnight-galaxy'];
  log(JSON.stringify(btnIds) === JSON.stringify(expectedIds), '主題卡 id 順序符合預期');

  console.log('\n[4] ThemeManager.apply() 覆寫 :root variable');
  window.ThemeManager.apply('tech-innovation');
  const root = window.document.documentElement;
  const primaryAfter = root.style.getPropertyValue('--primary');
  log(primaryAfter === '#0066ff',
    `tech-innovation --primary = '#0066ff' (got '${primaryAfter}')`);
  const bgAfter = root.style.getPropertyValue('--bg');
  log(bgAfter === '#0a0e1a',
    `tech-innovation --bg = '#0a0e1a' (got '${bgAfter}')`);

  window.ThemeManager.apply('default');
  const primaryDefault = root.style.getPropertyValue('--primary');
  log(primaryDefault === '',
    `default theme 清空 setProperty (got '${primaryDefault}'),fallback 回 :root`);

  console.log('\n[5] localStorage 持久化');
  window.ThemeManager.apply('ocean-depths');
  const stored = window.localStorage.getItem('ipas_theme_v1');
  log(stored === 'ocean-depths', `localStorage[ipas_theme_v1] = 'ocean-depths' (got '${stored}')`);

  console.log('\n[6] :root tokens 完整');
  const rootMatch = html.match(/:root\s*\{([\s\S]*?)\}/);
  const tokens = new Set();
  if (rootMatch) {
    const re = /--([a-zA-Z0-9_-]+)\s*:/g;
    let m;
    while ((m = re.exec(rootMatch[1])) !== null) tokens.add('--' + m[1]);
  }
  const required = ['--grad-hp-good', '--grad-hp-low', '--grad-hp-critical',
    '--grad-time-bar', '--grad-hero-success', '--grad-hero-warning', '--grad-hero-danger',
    '--grad-primary', '--grad-info', '--grad-fire',
    '--accent-gold', '--accent-blue', '--accent-green', '--accent-red'];
  for (const t of required) {
    log(tokens.has(t), `:root 定義 ${t}`);
  }

  console.log('\n[7] Mode 5 null guard 存在(C agent fix)');
  const mode5 = fs.readFileSync(path.join(SRC, 'modes', 'mode5.js'), 'utf8');
  log(/const opt = q\.options\.find\([^)]+\);\s*\n\s*if \(!opt\) return;/.test(mode5),
    'Mode 5 answer() 有 if (!opt) return; null guard');

  console.log('\n[8] Mode 7 var(--accent) typo 已修');
  const mode7 = fs.readFileSync(path.join(SRC, 'modes', 'mode7.js'), 'utf8');
  log(!/var\(--accent\)/.test(mode7), 'Mode 7 不再有 var(--accent)');

  console.log('\n[9] ipas_theme_v1 不在 ALLOWED_KEYS_EXACT');
  const allowedSection = html.match(/ALLOWED_KEYS_EXACT:\s*new Set\(\[([\s\S]*?)\]\)/);
  log(!!allowedSection, 'ALLOWED_KEYS_EXACT 區塊存在');
  log(allowedSection && !allowedSection[1].includes('ipas_theme_v1'),
    'ipas_theme_v1 NOT 在 ALLOWED_KEYS_EXACT 內');

  console.log('\n[10] GameFX.levelUp null guard(D 修)');
  log(html.includes('if (window.gsap && card)') && html.includes('else if (card)'),
    'GameFX.levelUp 對 card 加 null 守衛');

  console.log('\n[11] index.html .hp-fill 已抽到 var()');
  log(html.includes('.hp-fill { height: 100%; background: var(--grad-hp-good);'),
    '.hp-fill 用 var(--grad-hp-good)');
  log(html.includes('.hp-fill.low { background: var(--grad-hp-low);'),
    '.hp-fill.low 用 var(--grad-hp-low)');
  log(html.includes('.hp-fill.critical { background: var(--grad-hp-critical);'),
    '.hp-fill.critical 用 var(--grad-hp-critical)');

  console.log('\n[12] Mode 4/7 ternary 改 var()');
  const mode4 = fs.readFileSync(path.join(SRC, 'modes', 'mode4.js'), 'utf8');
  log(mode4.includes("? 'var(--grad-hp-critical)'") && mode4.includes("'var(--grad-time-bar)'"),
    'Mode 4 ternary 用 var() token');
  log(mode7.includes("? 'var(--grad-hp-critical)'") && mode7.includes("'var(--grad-time-bar)'"),
    'Mode 7 ternary 用 var() token');

  console.log('\n[13] themes.js 設計註解');
  log(themesJs.includes('刻意不收進 ProgressIO.ALLOWED_KEYS_EXACT'),
    'themes.js 解釋 ipas_theme_v1 不收進 ALLOWED_KEYS_EXACT');

  console.log('\n[14] 全 codebase 無 undefined var(--X)(無 fallback)');
  const allVarRefs = new Set();
  for (const f of ['index.html', ...['mode1','mode2','mode3','mode4','mode5','mode6','mode7','mode8'].map(m => `modes/${m}.js`)]) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    const re = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (!m[2]) allVarRefs.add(m[1]);
    }
  }
  const undefined_refs = [...allVarRefs].filter(v => !tokens.has(v) && v !== '--m7-font-scale');
  log(undefined_refs.length === 0,
    `無 undefined var() (got ${undefined_refs.length}: ${undefined_refs.slice(0,3).join(', ')})`);

  console.log('\n[15] questions-manifest.json 真實');
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'questions-manifest.json'), 'utf8'));
  log(Array.isArray(manifest.files), 'manifest.files 是陣列');
  log(manifest.files.length >= 40, `題庫檔數量合理(got ${manifest.files.length},應 ≥ 40)`);
  // 驗證 manifest 列的每個檔案都真的存在(防漂移)
  const allExist = manifest.files.every(f => fs.existsSync(path.join(SRC, f)));
  log(allExist, `manifest ≡ 實體檔案(${manifest.files.length} 檔全部存在)`);

  console.log('\n=================================');
  console.log(`Browser-sim SUMMARY: ${pass}/${pass+fail} PASS`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
