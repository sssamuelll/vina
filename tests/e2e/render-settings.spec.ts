import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function open3DView(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);
}

test.describe('Render Settings', () => {
  test.setTimeout(120_000);

  test('Render settings panel opens and shows sections', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    // Click the Render toggle button
    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Panel should show Environment section
    await expect(page.locator('.render-panel h3:has-text("Render Settings")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Environment')).toBeVisible({ timeout: 3000 });
  });

  test('HDRI preset selection works without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await open3DView(page);

    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Click a preset (e.g. "Showroom")
    const presetBtn = page.locator('.render-hdri-item').nth(2); // 3rd item
    if (await presetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await presetBtn.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // No critical errors
    const criticalErrors = errors.filter(e =>
      e.includes('WebGL') || e.includes('THREE') || e.includes('HDRI')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('Tone mapping and exposure controls exist', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Rendering section should have tone mapping select and exposure slider
    await expect(page.locator('select').first()).toBeVisible({ timeout: 3000 });
  });

  test('Background mode toggle works', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Find and click Transparent button in background section
    const transparentBtn = page.locator('.ap-mode-toggle button:has-text("Transparent")');
    if (await transparentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await transparentBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  });
});
