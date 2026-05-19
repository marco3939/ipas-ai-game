// @ts-check
// 01: 首頁載入 + 7 個 mode 入口按鈕可見
// 驗證 SPA 初始化:view-home active、questions-manifest 載完、9 顆 mode-card(7 mode + 錯題 + SM2)可見且可點。
const { test, expect } = require('@playwright/test');

test.describe('首頁載入', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
  });

  test('view-home 為 active', async ({ page }) => {
    const home = page.locator('#view-home');
    await expect(home).toBeVisible();
    await expect(home).toHaveClass(/active/);
  });

  test('7 個 mode 入口 + 錯題本 + SM2 入口都可見', async ({ page }) => {
    // 7 mode (enterMode 1..8 共 7 個有效 mode,不含 mode placeholder) + review + SM2 = 9
    const modeCards = page.locator('button.mode-card');
    await expect(modeCards).toHaveCount(9);
    // 各 enterMode(N) 入口
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const btn = page.locator(`button.mode-card[onclick="enterMode(${n})"]`);
      await expect(btn).toBeVisible();
    }
    // 錯題本
    await expect(
      page.locator('button.mode-card[onclick="enterMode(\'review\')"]'),
    ).toBeVisible();
    // SM2 復習
    await expect(
      page.locator('button.mode-card[onclick="SM2.enterReview()"]'),
    ).toBeVisible();
  });

  test('右上首頁按鈕預設為「🏠 首頁」(非 ⚠️ 退出考試)', async ({ page }) => {
    const navBtn = page.locator('#global-home-btn');
    await expect(navBtn).toBeVisible();
    await expect(navBtn).toContainText('首頁');
  });

  test('題庫 manifest 載完(QUESTIONS 不為空)', async ({ page }) => {
    // 等 loadQuestions 跑完;QUESTIONS 是 let,但 index.html 行 564 顯式 sync 到 window.QUESTIONS
    await page.waitForFunction(
      () => Array.isArray(window.QUESTIONS) && window.QUESTIONS.length > 0,
      null,
      { timeout: 8_000 },
    );
    const total = await page.evaluate(() => window.QUESTIONS.length);
    expect(total).toBeGreaterThan(0);
  });
});
