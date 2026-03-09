import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function drawAndSelectPiece(page: Page) {
  await page.click('button:has-text("2D")');
  await page.waitForTimeout(300);
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('Pattern SVG not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(page.locator('.status-bar')).toContainText(/Pieces.*[1-9]/, { timeout: 5000 });
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
}

test.describe('UI Layout Cleanup', () => {
  test.setTimeout(120_000);

  test('PropertiesPanel shows only PIECE, MATERIAL, SEAMS when piece selected', async ({ page }) => {
    await waitForApp(page);
    await drawAndSelectPiece(page);
    await expect(page.locator('text=MATERIAL')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.properties-panel >> text=PROJECT')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=AVATAR')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=DISPLAY')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=EXPORT')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=SIMULATION')).not.toBeVisible({ timeout: 2000 });
  });

  test('PropertiesPanel shows empty state without piece selection', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('text=Select a piece to edit')).toBeVisible({ timeout: 5000 });
  });
});
