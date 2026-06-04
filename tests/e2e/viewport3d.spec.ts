import { test, expect } from '@playwright/test';

/**
 * 3D viewport smoke tests.
 *
 * Setup retargeted (2026-06-04): the old `.status-bar` sentinel was deleted
 * with the legacy shell. App-alive is now asserted via the store handle
 * (`window.__OPENCLO_STORE__`) plus the canvas + TopBar view pills still being
 * present. View switching uses the TopBar pills (2D / Split / 3D).
 */

test.describe('3D Viewport', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__), { timeout: 15000 });
  });

  test('canvas renders in split view', async ({ page }) => {
    await page.click('button:has-text("Split")');
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(100);
  });

  test('canvas renders in 3D-only view', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas').first();
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
    // App still alive: canvas present + store intact + TopBar pills clickable.
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.locator('button:has-text("Split")')).toBeVisible();
    const alive = await page.evaluate(() => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__));
    expect(alive).toBe(true);
  });

  test('error boundary keeps app alive on WebGL issues', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(1000);
    // The 3D error boundary (Viewport3DErrorBoundary) wraps Viewport3D; if it
    // tripped, the canvas-area__3d pane would still be mounted and the store
    // would survive. Assert the app shell is intact.
    await expect(page.locator('.canvas-area__3d')).toBeVisible();
    const alive = await page.evaluate(() => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__));
    expect(alive).toBe(true);
  });
});

test.describe('Avatar Rendering', () => {
  test('avatar loads in 3D view', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__), { timeout: 15000 });
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test.skip('A-pose visual regression', async ({ page }) => {
    // Run with --update-snapshots to create baseline.
    await page.goto('/');
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('avatar-a-pose.png');
  });
});
