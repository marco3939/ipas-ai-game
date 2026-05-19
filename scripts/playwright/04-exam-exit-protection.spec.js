// @ts-check
// 04: 全 mode 考試保護驗證
// 走 Mode 1 / Mode 7 / Mode 8 三條路徑驗證:
//   1) 進戰鬥後 #global-home-btn 顯示「⚠️ 退出考試」
//   2) window._examInProgress === true(內部旗標)
//   3) 點下右上按鈕觸發 window.confirm,dismiss 後仍在 view-play(不會直接跳走)
//   4) accept 後 _examInProgress 變 false 且回到首頁
// 對應 CLAUDE.md §9 案例 12(2026-05-19 治本)。
const { test, expect } = require('@playwright/test');

/**
 * 通用斷言:在指定 mode 戰鬥啟動後驗證考試保護生效。
 * @param {import('@playwright/test').Page} page
 * @param {string} label - 描述用(失敗訊息)
 */
async function assertExamProtectionActive(page, label) {
  // 右上按鈕已切換成「退出考試」紅底
  const navBtn = page.locator('#global-home-btn');
  await expect(navBtn, `${label}: 右上按鈕應顯示「退出考試」`).toContainText(
    '退出考試',
  );
  // 內部旗標
  const flag = await page.evaluate(() => window._examInProgress);
  expect(flag, `${label}: window._examInProgress 應為 true`).toBe(true);

  // 點下 → 必跳 confirm,dismiss 後仍在 view-play
  let dialogTriggered = false;
  page.once('dialog', async (dialog) => {
    dialogTriggered = true;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('退出');
    await dialog.dismiss();
  });
  await navBtn.click();
  // 等 dialog handler 跑完
  await page.waitForTimeout(200);
  expect(dialogTriggered, `${label}: 點右上必觸發 confirm`).toBe(true);
  await expect(
    page.locator('#view-play'),
    `${label}: dismiss 後應留在 view-play`,
  ).toHaveClass(/active/);
}

test.describe('考試保護機制', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => Array.isArray(window.QUESTIONS) && window.QUESTIONS.length > 0,
      null,
      { timeout: 8_000 },
    );
  });

  test('預設狀態(首頁):_examInProgress = false 且按鈕顯示「🏠 首頁」', async ({
    page,
  }) => {
    const flag = await page.evaluate(() => window._examInProgress);
    expect(flag).toBe(false);
    await expect(page.locator('#global-home-btn')).toContainText('首頁');
  });

  test('Mode 1 戰鬥中:點右上必跳 confirm,dismiss 後仍在戰鬥', async ({
    page,
  }) => {
    await page.click('button.mode-card[onclick="enterMode(1)"]');
    await page.waitForSelector('#view-play.active', { timeout: 5_000 });
    const bossBtn = page
      .locator('#view-play button.mode-card[onclick^="Mode1.selectBoss"]')
      .first();
    await bossBtn.click();
    await page.click('#view-play button[onclick="Mode1.startBattle()"]');
    await page.waitForSelector('#view-play .option-btn', { timeout: 5_000 });
    await assertExamProtectionActive(page, 'Mode 1');
  });

  test('Mode 7 模考中:點右上必跳 confirm,dismiss 後仍在戰鬥', async ({
    page,
  }) => {
    await page.click('button.mode-card[onclick="enterMode(7)"]');
    await page.waitForSelector('#m7-start-btn', { timeout: 5_000 });
    await page.click('#m7-start-btn');
    await page.waitForSelector('#view-play .option-btn', { timeout: 8_000 });
    await assertExamProtectionActive(page, 'Mode 7');
  });

  test('Mode 8 戰鬥中:點右上必跳 confirm,dismiss 後仍在戰鬥', async ({
    page,
  }) => {
    await page.click('button.mode-card[onclick="enterMode(8)"]');
    // Mode 8 通常有設定 / 起手頁,等到 view-play active 並出現 option-btn 或開始按鈕
    await page.waitForSelector('#view-play.active', { timeout: 5_000 });
    // 嘗試點任一「開始」按鈕(若有設定頁);否則戰鬥已直接展開
    const startCandidates = page.locator(
      '#view-play button[onclick^="Mode8.start"], #view-play button[onclick="Mode8.beginBattle()"], #view-play button[onclick^="Mode8._startBattle"]',
    );
    if (await startCandidates.first().isVisible().catch(() => false)) {
      await startCandidates.first().click().catch(() => {});
    }
    // 戰鬥畫面進入 option-btn
    await page.waitForSelector('#view-play .option-btn', { timeout: 8_000 });
    await assertExamProtectionActive(page, 'Mode 8');
  });

  test('accept confirm 後:_examInProgress 變 false 且回到首頁', async ({
    page,
  }) => {
    // 用最短路徑 Mode 1 啟動戰鬥
    await page.click('button.mode-card[onclick="enterMode(1)"]');
    await page.waitForSelector('#view-play.active', { timeout: 5_000 });
    await page
      .locator('#view-play button.mode-card[onclick^="Mode1.selectBoss"]')
      .first()
      .click();
    await page.click('#view-play button[onclick="Mode1.startBattle()"]');
    await page.waitForSelector('#view-play .option-btn', { timeout: 5_000 });

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('#global-home-btn');
    // 旗標歸 false
    await page.waitForFunction(() => window._examInProgress === false, null, {
      timeout: 3_000,
    });
    // 回到 view-home
    await expect(page.locator('#view-home')).toHaveClass(/active/);
    await expect(page.locator('#global-home-btn')).toContainText('首頁');
  });
});
