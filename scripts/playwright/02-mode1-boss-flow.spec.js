// @ts-check
// 02: Mode 1 selectBoss → 開戰 → 答 1 題 → 結算頁或下一題出現
// 驗證 Mode 1 RPG 流程:點 mode-card(1) → 進地圖 → 選一個 boss → 點「⚔️ 開戰!」→ 看到 option-btn → 點第一個 → 顯示「繼續戰鬥」或結算。
const { test, expect } = require('@playwright/test');

test.describe('Mode 1 BOSS 流程', () => {
  test('selectBoss → 開戰 → 答一題 → 結算 / 下一題出現', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    // 等題庫
    await page.waitForFunction(
      () => Array.isArray(window.QUESTIONS) && window.QUESTIONS.length > 0,
      null,
      { timeout: 8_000 },
    );

    // 進 Mode 1
    await page.click('button.mode-card[onclick="enterMode(1)"]');
    await page.waitForSelector('#view-play.active', { timeout: 5_000 });

    // 地圖頁:挑第一個 boss(selectBoss('...'))
    const bossBtn = page
      .locator('#view-play button.mode-card[onclick^="Mode1.selectBoss"]')
      .first();
    await expect(bossBtn).toBeVisible();
    await bossBtn.click();

    // 戰前確認頁:點「⚔️ 開戰!」
    const startBtn = page.locator(
      '#view-play button[onclick="Mode1.startBattle()"]',
    );
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 進戰鬥:等 option-btn 出現
    await page.waitForSelector('#view-play .option-btn', { timeout: 5_000 });
    const opts = page.locator('#view-play .option-btn');
    const count = await opts.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // 點第一個選項
    await opts.first().click();

    // 答題後:應顯示「繼續戰鬥」(Mode1.next) 或「再戰 / 回地圖」(victory/gameOver)
    // 三條候選任一條件達成即過
    await expect(
      page.locator(
        '#view-play button[onclick="Mode1.next()"], ' +
          '#view-play button[onclick^="Mode1.selectBoss"], ' +
          '#view-play button[onclick="Mode1.start()"]',
      ).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
