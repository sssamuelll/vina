import { test, expect } from '@playwright/test';

test.describe('Pattern Editor Tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('rectangle tool draws a piece', async ({ page }) => {
    await page.keyboard.press('r');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx - 80, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('text=Pieces: 1')).toBeVisible({ timeout: 3000 });
  });

  test('view switching 2D → Split → 3D', async ({ page }) => {
    await page.click('button:has-text("2D")');
    await page.waitForTimeout(300);
    expect(await page.locator('svg.pattern-svg').isVisible()).toBe(true);

    await page.click('button:has-text("Split")');
    await page.waitForTimeout(300);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('svg.pattern-svg')).toBeVisible();

    await page.click('button:has-text("3D")');
    await page.waitForTimeout(300);
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('StatusBar shows correct info', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toBeVisible();
    await expect(statusBar.locator('text=/Pieces.*0/')).toBeVisible();
  });
});

test.describe('Sidebar Views', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('all ActivityBar icons visible', async ({ page }) => {
    for (const title of ['Pattern Explorer', 'Simulation', 'Avatar']) {
      await expect(page.locator(`.activity-bar-item[title="${title}"]`)).toBeVisible();
    }
  });

  test('BottomPanel tabs visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Problems' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Output' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nesting Preview' })).toBeVisible();
  });
});
