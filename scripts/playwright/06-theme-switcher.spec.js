// @ts-check
// 06: 🎨 主題切換器(PR #48/#49)
// 驗證:
//   1) 右上 #global-theme-btn 存在且 visible
//   2) 點按鈕 → modal #theme-picker-backdrop 跳出
//   3) modal 內 11 個 button[data-theme-id]
//   4) 主題 id 順序正確(11 個)
//   5) 點 tech-innovation 卡 → :root --primary 變 #0066ff
//   6) reload 後主題沿用(localStorage ipas_theme_v1 = 'tech-innovation')
//   7) 點 ✕ 關閉按鈕 → modal 消失
//   8) 點 modal 外圍(backdrop)→ modal 消失
const { test, expect } = require('@playwright/test');

const EXPECTED_THEME_IDS = [
  'default',
  'ocean-depths',
  'sunset-boulevard',
  'forest-canopy',
  'modern-minimalist',
  'golden-hour',
  'arctic-frost',
  'desert-rose',
  'tech-innovation',
  'botanical-garden',
  'midnight-galaxy',
];

test('#global-theme-btn 存在且 visible(右上 header)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const btn = page.locator('#global-theme-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('主題');
});

test('點 #global-theme-btn → modal #theme-picker-backdrop 跳出', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#theme-picker-backdrop')).toHaveCount(0);
  await page.locator('#global-theme-btn').click();
  const backdrop = page.locator('#theme-picker-backdrop');
  await expect(backdrop).toBeVisible({ timeout: 3_000 });
});

test('modal 內 11 個 button[data-theme-id]', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#global-theme-btn').click();
  await page.waitForSelector('#theme-picker-backdrop', { timeout: 3_000 });
  const cards = page.locator('#theme-picker-backdrop button[data-theme-id]');
  await expect(cards).toHaveCount(11);
});

test('主題 id 順序正確(11 個)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#global-theme-btn').click();
  await page.waitForSelector('#theme-picker-backdrop', { timeout: 3_000 });
  const ids = await page
    .locator('#theme-picker-backdrop button[data-theme-id]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-theme-id')));
  expect(ids).toEqual(EXPECTED_THEME_IDS);
});

test('點 tech-innovation 卡 → :root --primary = #0066ff', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#global-theme-btn').click();
  await page.waitForSelector('#theme-picker-backdrop', { timeout: 3_000 });
  await page
    .locator('#theme-picker-backdrop button[data-theme-id="tech-innovation"]')
    .click();
  // apply 後 backdrop 應 remove
  await expect(page.locator('#theme-picker-backdrop')).toHaveCount(0, {
    timeout: 3_000,
  });
  const primary = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--primary').trim(),
  );
  expect(primary).toBe('#0066ff');
});

test('reload 後主題沿用(localStorage ipas_theme_v1 = tech-innovation)', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#global-theme-btn').click();
  await page.waitForSelector('#theme-picker-backdrop', { timeout: 3_000 });
  await page
    .locator('#theme-picker-backdrop button[data-theme-id="tech-innovation"]')
    .click();
  await expect(page.locator('#theme-picker-backdrop')).toHaveCount(0, {
    timeout: 3_000,
  });

  // 重整
  await page.reload();
  await page.waitForLoadState('networkidle');

  const stored = await page.evaluate(() => localStorage.getItem('ipas_theme_v1'));
  expect(stored).toBe('tech-innovation');

  // ThemeManager.init 應在重整後自動再套一次 → --primary 仍為 #0066ff
  const primaryAfterReload = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--primary').trim(),
  );
  expect(primaryAfterReload).toBe('#0066ff');
});

test('點 ✕ 關閉按鈕 → modal 消失', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#global-theme-btn').click();
  const backdrop = page.locator('#theme-picker-backdrop');
  await expect(backdrop).toBeVisible({ timeout: 3_000 });

  // ✕ 按鈕是 modal 內第一個 button(非 data-theme-id 的那顆)
  const closeBtn = page
    .locator('#theme-picker-backdrop button:not([data-theme-id])')
    .filter({ hasText: '✕' });
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();

  await expect(page.locator('#theme-picker-backdrop')).toHaveCount(0, {
    timeout: 3_000,
  });
});

test('點 modal 外圍(backdrop)→ modal 消失', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#global-theme-btn').click();
  const backdrop = page.locator('#theme-picker-backdrop');
  await expect(backdrop).toBeVisible({ timeout: 3_000 });

  // backdrop click handler:e.target === backdrop 才 remove。
  // viewport 1280x800,modal max-width 720 + 置中,(10,10) 角落必落在 backdrop 上、不在 modal 上。
  await backdrop.click({ position: { x: 10, y: 10 } });

  await expect(page.locator('#theme-picker-backdrop')).toHaveCount(0, {
    timeout: 3_000,
  });
});
