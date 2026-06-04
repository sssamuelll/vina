import { test, expect } from '@playwright/test';

/**
 * Workspace layout smoke tests — SLIM (2026-06-04 rewrite).
 *
 * The legacy VS-Code-style shell (ActivityBar, Sidebar, BottomPanel with
 * Problems/Output/Copilot tabs, StatusBar) was deleted in the canvas-2d /
 * side-docks redesign. Those tests were removed. What remains is the
 * figma-style canvas shell: TopBar view pills (2D / Split / 3D) driving two
 * panes — `.canvas-area__2d` and `.canvas-area__3d` — sized via inline width
 * (collapsed = `display:none` + width 0%), separated in split mode by
 * `.canvas-area__divider`.
 */

test.describe('Canvas shell — view modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  });

  test('default view mode is split (both panes visible)', async ({ page }) => {
    await expect(page.locator('.canvas-area__2d')).toBeVisible();
    await expect(page.locator('.canvas-area__3d')).toBeVisible();
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('2D mode hides the 3D pane', async ({ page }) => {
    await page.click('button:has-text("2D")');
    await page.waitForTimeout(400);
    await expect(page.locator('.canvas-area__2d')).toBeVisible();
    // 3D pane is display:none in 2D mode.
    await expect(page.locator('.canvas-area__3d')).toBeHidden();
  });

  test('3D mode hides the 2D pane', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(400);
    await expect(page.locator('.canvas-area__3d')).toBeVisible();
    await expect(page.locator('.canvas-area__2d')).toBeHidden();
  });

  test('Split mode shows both panes', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Split")');
    await page.waitForTimeout(400);
    await expect(page.locator('.canvas-area__2d')).toBeVisible();
    await expect(page.locator('.canvas-area__3d')).toBeVisible();
  });
});

test.describe('Canvas shell — split divider', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  });

  test('divider is visible in split mode', async ({ page }) => {
    // Default is split.
    await expect(page.locator('.canvas-area__divider')).toBeVisible();
  });

  test('dragging divider resizes panes', async ({ page }) => {
    const divider = page.locator('.canvas-area__divider');
    await expect(divider).toBeVisible();
    const box = await divider.boundingBox();
    if (!box) throw new Error('no divider');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const pane2d = page.locator('.canvas-area__2d');
    const initialBox = await pane2d.boundingBox();
    if (!initialBox) throw new Error('no 2d pane');

    // Drag the divider 120px to the right → 2D pane should widen.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const newBox = await pane2d.boundingBox();
    if (!newBox) throw new Error('no 2d pane after drag');
    expect(newBox.width).toBeGreaterThan(initialBox.width);
  });
});
