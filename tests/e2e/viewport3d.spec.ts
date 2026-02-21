import { test, expect } from '@playwright/test';

test.describe('3D Viewport', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('canvas renders in split view', async ({ page }) => {
    await page.click('button:has-text("Split")');
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(100);
  });

  test('canvas renders in 3D-only view', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(300);
  });

  test('rapid view switching stress test', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.click('button:has-text("2D")');
      await page.waitForTimeout(150);
      await page.click('button:has-text("Split")');
      await page.waitForTimeout(150);
      await page.click('button:has-text("3D")');
      await page.waitForTimeout(150);
    }
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.status-bar')).toBeVisible();
  });

  test('error boundary keeps app alive on WebGL issues', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(1000);
    await expect(page.locator('.status-bar')).toBeVisible();
  });
});

test.describe('Avatar Rendering', () => {
  test('avatar loads in 3D view', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);
    await expect(page.locator('canvas')).toBeVisible();
  });

  test.skip('A-pose visual regression', async ({ page }) => {
    // Run with --update-snapshots to create baseline
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('avatar-a-pose.png');
  });
});
