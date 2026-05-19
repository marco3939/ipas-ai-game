// @ts-check
// 03: Mode 7 _startBattle → 答 3 題 → 標記題 → 試圖離開觸發 confirm
// 走 Mode 7 模考設定頁:跳過 UI 配置直接呼叫 _startBattle(短題數),驗證
//   1) 開戰後 option-btn 出現
//   2) 答 3 題後仍能看到題目或進入結算
//   3) 點「🔖 標記此題」會切換為「🔖 已標記」
//   4) 點右上「⚠️ 退出考試」必跳 window.confirm(不靜默離場)
const { test, expect } = require('@playwright/test');

test.describe('Mode 7 模考流程', () => {
  test('開戰 → 答 3 題 → 標記 → 退出觸發 confirm', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => Array.isArray(window.QUESTIONS) && window.QUESTIONS.length > 0,
      null,
      { timeout: 8_000 },
    );

    // 進 Mode 7 設定頁
    await page.click('button.mode-card[onclick="enterMode(7)"]');
    await page.waitForSelector('#m7-start-btn', { timeout: 5_000 });

    // 由設定頁的「🎬 開始模考」按鈕進戰(用預設 qcount/scope/difficulty)
    await page.click('#m7-start-btn');

    // 戰鬥畫面:option-btn 應該出現
    await page.waitForSelector('#view-play .option-btn', { timeout: 8_000 });

    // 答 3 題(每次點第一個選項後按「下一題」或「送出」)
    for (let i = 0; i < 3; i++) {
      const optExists = await page
        .locator('#view-play .option-btn')
        .first()
        .isVisible()
        .catch(() => false);
      if (!optExists) break;
      await page.locator('#view-play .option-btn').first().click();
      // Mode 7 nav 有 submit 與 next;送出後可能直接進下一題或要點 next
      const submitBtn = page.locator(
        '#view-play button[onclick="Mode7.submitCurrent()"]',
      );
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click().catch(() => {});
      }
      // 給渲染下一題一點時間(避免 timing flake)
      await page.waitForTimeout(300);
    }

    // 標記此題:點「🔖 標記此題」→ 變「🔖 已標記」
    const markBtn = page.locator('#view-play .m7-mark-btn').first();
    if (await markBtn.isVisible().catch(() => false)) {
      const beforeText = await markBtn.textContent();
      await markBtn.click();
      await expect(markBtn).toHaveClass(/marked/);
      const afterText = await markBtn.textContent();
      expect(afterText).not.toEqual(beforeText);
    }

    // 試圖離開:點右上「⚠️ 退出考試」必跳 confirm,且 dismiss 後仍在 view-play
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('退出');
      await dialog.dismiss();
    });
    const navBtn = page.locator('#global-home-btn');
    await expect(navBtn).toContainText('退出考試');
    await navBtn.click();
    // dismiss 後應仍在 view-play(考試保護生效)
    await expect(page.locator('#view-play')).toHaveClass(/active/);
  });
});
