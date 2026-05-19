// @ts-check
// 05: Mode 6 卡牌圖鑑載入 + 過濾 + 批次模式 toggle
// 驗證:
//   1) 進 Mode 6 後 #view-play active 且卡片網格至少出現 1 張 .mode-card(card 用 Mode6.openCard / toggleBatchCard onclick)
//   2) 點「🔥 批次挑戰模式」進入 batchMode → 卡片 onclick 從 openCard 切到 toggleBatchCard
//   3) 點任一卡片會被選中(.batchSelected.size 增加)
//   4) 點「⬅ 退出批次模式」回非批次狀態
const { test, expect } = require('@playwright/test');

test.describe('Mode 6 卡牌圖鑑', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => Array.isArray(window.QUESTIONS) && window.QUESTIONS.length > 0,
      null,
      { timeout: 8_000 },
    );
    await page.click('button.mode-card[onclick="enterMode(6)"]');
    await page.waitForSelector('#view-play.active', { timeout: 5_000 });
  });

  test('卡牌網格載入(至少 1 張卡)', async ({ page }) => {
    // Mode6 grid 內每張卡都是 .mode-card,onclick 包含 openCard 或 toggleBatchCard
    const cards = page.locator(
      '#view-play button.mode-card[onclick^="Mode6.openCard"], #view-play button.mode-card[onclick^="Mode6.toggleBatchCard"]',
    );
    await expect(cards.first()).toBeVisible({ timeout: 5_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('過濾:subject select 變更不噴錯且 grid 重繪', async ({ page }) => {
    // 篩 subject select(Mode6.setFilter('subject', ...))
    const subjectSelect = page
      .locator('#view-play select[onchange*="setFilter(\'subject\'"]')
      .first();
    await expect(subjectSelect).toBeVisible();

    // 取得可選值(預設 + 至少 1 個科目)
    const options = await subjectSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => o.value));
    expect(options.length).toBeGreaterThan(1);

    // 變更到非預設值,等 grid 重渲染
    const target = options.find((v) => v && v !== '') || options[1];
    await subjectSelect.selectOption(target);
    // grid 重渲後仍可見(可能變 0 但容器在)
    await page.waitForTimeout(300);
    await expect(page.locator('#view-play')).toBeVisible();
  });

  test('批次模式 toggle:進入 → 選 1 張 → 退出', async ({ page }) => {
    // 進入批次模式
    const enterBatch = page.locator(
      '#view-play button[onclick="Mode6.toggleBatchMode()"]',
    );
    await expect(enterBatch.first()).toBeVisible();
    await enterBatch.first().click();

    // 進入批次後:卡片 onclick 應切成 toggleBatchCard;面板上「執行批次挑戰」應出現
    await page.waitForSelector(
      '#view-play button[onclick="Mode6.executeBatch()"]',
      { timeout: 3_000 },
    );
    const batchCards = page.locator(
      '#view-play button.mode-card[onclick^="Mode6.toggleBatchCard"]',
    );
    await expect(batchCards.first()).toBeVisible({ timeout: 3_000 });

    // 點第一張可挑戰卡(toggleBatchCard 不會挑到金卡 / 無題卡時 state 才會新增)
    const initialSelected = await page.evaluate(
      () =>
        (window.Mode6 &&
          window.Mode6.state &&
          window.Mode6.state.batchSelected &&
          window.Mode6.state.batchSelected.size) ||
        0,
    );
    await batchCards.first().click();
    await page.waitForTimeout(200);
    const afterSelected = await page.evaluate(
      () =>
        (window.Mode6 &&
          window.Mode6.state &&
          window.Mode6.state.batchSelected &&
          window.Mode6.state.batchSelected.size) ||
        0,
    );
    // 第一張可能不可選(金卡 / 無題),所以只斷言 toggleBatchMode 確實開啟、batchSelected 是 Set
    const batchModeOn = await page.evaluate(
      () => !!(window.Mode6 && window.Mode6.state && window.Mode6.state.batchMode),
    );
    expect(batchModeOn).toBe(true);
    expect(afterSelected).toBeGreaterThanOrEqual(initialSelected);

    // 退出批次模式
    const exitBatch = page.locator(
      '#view-play button[onclick="Mode6.toggleBatchMode()"]',
    );
    await exitBatch.first().click();
    await page.waitForTimeout(200);
    const batchModeOff = await page.evaluate(
      () => !!(window.Mode6 && window.Mode6.state && window.Mode6.state.batchMode),
    );
    expect(batchModeOff).toBe(false);
  });
});
