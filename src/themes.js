// ============================================================
// themes.js — Theme Factory UI switcher
// 2026-05-19 P3 階段二:接 theme-factory 10 主題 + 預設原電玩風
//
// 原則:
//   - 只套「色」不換「字」(中文 Noto Sans TC 保留)
//   - 透過 document.documentElement.style.setProperty 覆寫 :root variable
//   - localStorage 持久化:重整後沿用
//   - 預設「電玩 Slate」不是 theme-factory,確保可隨時回原樣
//   - UI 用 DOM createElement(不用 innerHTML)防 XSS
// ============================================================
(function () {
  'use strict';

  const STORAGE_KEY = 'ipas_theme_v1';

  const THEMES = [
    { id: 'default', name: '🎮 預設電玩(Slate)', desc: '原本的深藍石板配 sky blue 強調', vars: {} },
    {
      id: 'ocean-depths', name: '🌊 Ocean Depths', desc: '深海航海 — Deep Navy + Teal',
      vars: {
        '--bg': '#0e1822', '--bg-2': '#1a2332', '--bg-3': '#2d4054',
        '--primary': '#2d8b8b', '--primary-fg': '#0c2424',
        '--accent-blue': '#a8dadc', '--accent-gold': '#f1faee',
        '--grad-primary': 'linear-gradient(135deg, #1a2332 0%, #2d8b8b 100%)',
        '--grad-info': 'linear-gradient(135deg, #2d8b8b 0%, #a8dadc 100%)'
      }
    },
    {
      id: 'sunset-boulevard', name: '🌅 Sunset Boulevard', desc: '夕陽大道 — 暖橙 + 珊瑚',
      vars: {
        '--bg': '#1a2530', '--bg-2': '#264653', '--bg-3': '#385665',
        '--primary': '#e76f51', '--primary-fg': '#2a1a10',
        '--accent-gold': '#e9c46a', '--accent-red': '#f4a261',
        '--grad-primary': 'linear-gradient(135deg, #264653 0%, #e76f51 100%)',
        '--grad-fire': 'linear-gradient(135deg, #e76f51 0%, #e9c46a 100%)',
        '--grad-info': 'linear-gradient(135deg, #f4a261 0%, #e9c46a 100%)'
      }
    },
    {
      id: 'forest-canopy', name: '🌲 Forest Canopy', desc: '森林冠層 — 大地系綠',
      vars: {
        '--bg': '#1a2818', '--bg-2': '#2d4a2b', '--bg-3': '#3d5c3a',
        '--primary': '#7d8471', '--primary-fg': '#1a2818',
        '--accent-green': '#a4ac86', '--accent-gold': '#faf9f6',
        '--grad-primary': 'linear-gradient(135deg, #2d4a2b 0%, #7d8471 100%)',
        '--grad-info': 'linear-gradient(135deg, #7d8471 0%, #a4ac86 100%)'
      }
    },
    {
      id: 'modern-minimalist', name: '⚪ Modern Minimalist', desc: '極簡灰階',
      vars: {
        '--bg': '#1f2429', '--bg-2': '#36454f', '--bg-3': '#4a5a66',
        '--primary': '#708090', '--primary-fg': '#1a1f24',
        '--accent-blue': '#d3d3d3', '--accent-gold': '#ffffff',
        '--grad-primary': 'linear-gradient(135deg, #36454f 0%, #708090 100%)',
        '--grad-info': 'linear-gradient(135deg, #708090 0%, #d3d3d3 100%)'
      }
    },
    {
      id: 'golden-hour', name: '🌻 Golden Hour', desc: '黃金時刻 — 芥末黃 + 赤陶',
      vars: {
        '--bg': '#2a221d', '--bg-2': '#4a403a', '--bg-3': '#5d4f47',
        '--primary': '#f4a900', '--primary-fg': '#2a221d',
        '--accent-gold': '#f4a900', '--accent-red': '#c1666b',
        '--grad-primary': 'linear-gradient(135deg, #4a403a 0%, #f4a900 100%)',
        '--grad-fire': 'linear-gradient(135deg, #c1666b 0%, #f4a900 100%)',
        '--grad-info': 'linear-gradient(135deg, #f4a900 0%, #d4b896 100%)'
      }
    },
    {
      id: 'arctic-frost', name: '❄️ Arctic Frost', desc: '極地寒霜 — 鋼藍 + 冰銀',
      vars: {
        '--bg': '#1a2336', '--bg-2': '#293a5a', '--bg-3': '#3d527a',
        '--primary': '#4a6fa5', '--primary-fg': '#0e1422',
        '--accent-blue': '#d4e4f7', '--accent-gold': '#fafafa',
        '--grad-primary': 'linear-gradient(135deg, #293a5a 0%, #4a6fa5 100%)',
        '--grad-info': 'linear-gradient(135deg, #4a6fa5 0%, #d4e4f7 100%)'
      }
    },
    {
      id: 'desert-rose', name: '🌸 Desert Rose', desc: '沙漠玫瑰 — 灰玫瑰 + 勃艮第',
      vars: {
        '--bg': '#2a1820', '--bg-2': '#5d2e46', '--bg-3': '#7a3e5d',
        '--primary': '#d4a5a5', '--primary-fg': '#2a1820',
        '--accent-red': '#b87d6d', '--accent-gold': '#e8d5c4',
        '--grad-primary': 'linear-gradient(135deg, #5d2e46 0%, #d4a5a5 100%)',
        '--grad-fire': 'linear-gradient(135deg, #b87d6d 0%, #d4a5a5 100%)',
        '--grad-info': 'linear-gradient(135deg, #d4a5a5 0%, #e8d5c4 100%)'
      }
    },
    {
      id: 'tech-innovation', name: '💡 Tech Innovation', desc: '科技創新 — 電光藍 + 霓虹青(電玩感最強)',
      vars: {
        '--bg': '#0a0e1a', '--bg-2': '#1e1e1e', '--bg-3': '#2d2d2d',
        '--primary': '#0066ff', '--primary-fg': '#001033',
        '--accent-blue': '#00ffff', '--accent-gold': '#ffffff',
        '--grad-primary': 'linear-gradient(135deg, #0066ff 0%, #00ffff 100%)',
        '--grad-info': 'linear-gradient(135deg, #00ffff 0%, #0066ff 100%)',
        '--grad-fire': 'linear-gradient(135deg, #ff0066 0%, #ffaa00 100%)'
      }
    },
    {
      id: 'botanical-garden', name: '🌿 Botanical Garden', desc: '植物園 — 蕨綠 + 金盞花',
      vars: {
        '--bg': '#1a2520', '--bg-2': '#2d4035', '--bg-3': '#3d5447',
        '--primary': '#4a7c59', '--primary-fg': '#0e1611',
        '--accent-gold': '#f9a620', '--accent-red': '#b7472a',
        '--grad-primary': 'linear-gradient(135deg, #2d4035 0%, #4a7c59 100%)',
        '--grad-fire': 'linear-gradient(135deg, #b7472a 0%, #f9a620 100%)',
        '--grad-info': 'linear-gradient(135deg, #4a7c59 0%, #f9a620 100%)'
      }
    },
    {
      id: 'midnight-galaxy', name: '🌌 Midnight Galaxy', desc: '午夜銀河 — 深紫 + 薰衣草(夢幻電玩風)',
      vars: {
        '--bg': '#1a0f24', '--bg-2': '#2b1e3e', '--bg-3': '#3d2e54',
        '--primary': '#a490c2', '--primary-fg': '#1a0f24',
        '--accent-blue': '#4a4e8f', '--accent-gold': '#e6e6fa',
        '--grad-primary': 'linear-gradient(135deg, #2b1e3e 0%, #4a4e8f 100%)',
        '--grad-info': 'linear-gradient(135deg, #4a4e8f 0%, #a490c2 100%)',
        '--grad-fire': 'linear-gradient(135deg, #a490c2 0%, #e6e6fa 100%)'
      }
    }
  ];

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (k === 'onclick') e.addEventListener('click', attrs[k]);
      else if (k.startsWith('data-')) e.setAttribute(k, attrs[k]);
      else e[k] = attrs[k];
    });
    (children || []).forEach(c => {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    });
    return e;
  }

  const ThemeManager = {
    THEMES: THEMES,

    current() {
      try { return localStorage.getItem(STORAGE_KEY) || 'default'; }
      catch (_) { return 'default'; }
    },

    apply(themeId) {
      const t = THEMES.find(x => x.id === themeId) || THEMES[0];
      const root = document.documentElement;
      if (this._lastKeys) this._lastKeys.forEach(k => root.style.removeProperty(k));
      const keys = Object.keys(t.vars);
      keys.forEach(k => root.style.setProperty(k, t.vars[k]));
      this._lastKeys = keys;
      try { localStorage.setItem(STORAGE_KEY, themeId); } catch (_) {}
      return t;
    },

    init() { this.apply(this.current()); },

    openPicker() {
      const cur = this.current();
      const existing = document.getElementById('theme-picker-backdrop');
      if (existing) existing.remove();

      const backdrop = el('div', {
        id: 'theme-picker-backdrop',
        style: 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto'
      });
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

      const closeBtn = el('button', {
        style: 'background:transparent;border:none;color:var(--fg);font-size:1.5rem;cursor:pointer;padding:4px 8px',
        onclick: () => backdrop.remove()
      }, ['✕']);

      const headerRow = el('div', {
        style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'
      }, [
        el('h2', { style: 'margin:0;font-size:1.3rem' }, ['🎨 主題切換']),
        closeBtn
      ]);

      const helpText = el('p', {
        style: 'color:var(--fg-dim);font-size:0.85rem;margin-bottom:14px;line-height:1.5'
      });
      helpText.appendChild(document.createTextNode('11 個主題隨選(原電玩 Slate 為預設)。切換後立即套用,localStorage 持久化。字體保留 Noto Sans TC(中文友善),只換色。'));

      const grid = el('div', {
        style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px'
      });

      THEMES.forEach(t => {
        const isActive = t.id === cur;
        const swatch = t.vars['--primary'] || '#38bdf8';
        const bg = t.vars['--bg'] || '#0f172a';
        const borderColor = isActive ? swatch : 'var(--border)';
        const boxShadow = isActive ? `box-shadow: 0 0 16px ${swatch}88;` : '';

        const swatches = el('div', { style: 'display:flex;gap:4px' });
        ['--primary', '--accent-gold', '--accent-blue', '--accent-red'].forEach((key, i) => {
          const fallback = ['#38bdf8', '#fbbf24', '#60a5fa', '#f87171'][i];
          const color = t.vars[key] || fallback;
          swatches.appendChild(el('span', {
            style: `width:24px;height:24px;border-radius:4px;background:${color}`
          }));
        });

        const card = el('button', {
          'data-theme-id': t.id,
          style: `text-align:left;padding:12px;background:${bg};border:2px solid ${borderColor};border-radius:var(--radius-sm);cursor:pointer;transition:transform 0.15s;${boxShadow}color:var(--fg)`,
          onclick: () => {
            ThemeManager.apply(t.id);
            backdrop.remove();
            if (typeof showToast === 'function') showToast(`已套用主題:${t.name}`, 2000);
          }
        }, [
          el('div', { style: 'font-weight:700;font-size:0.95rem;margin-bottom:4px' }, [t.name + (isActive ? ' ✓' : '')]),
          el('div', { style: 'font-size:0.78rem;color:var(--fg-dim);margin-bottom:8px' }, [t.desc]),
          swatches
        ]);

        grid.appendChild(card);
      });

      const modal = el('div', {
        style: 'background:var(--bg-2);border:2px solid var(--primary);border-radius:var(--radius);max-width:720px;width:100%;padding:20px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6)'
      }, [headerRow, helpText, grid]);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }
  };

  window.ThemeManager = ThemeManager;
  window.THEMES = THEMES;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
  } else {
    ThemeManager.init();
  }
})();
