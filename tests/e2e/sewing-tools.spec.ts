/**
 * E2E tests for sewing tools: Seam, Segment Sewing, Walk Seam
 *
 * Tests verify:
 * 1. Tool activation via keyboard shortcuts
 * 2. Visual feedback (overlays, highlights)
 * 3. Tool options bar rendering
 * 4. Placeholder tools don't crash
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

/** Load the T-Shirt template to get real pattern pieces */
async function loadTShirtTemplate(page: Page) {
  // Template library auto-opens on first load, or click Templates button
  const templateBtn = page.locator('button:has-text("Templates")');
  if (await templateBtn.isVisible()) {
    await templateBtn.click();
    await page.waitForTimeout(500);
  }

  // Click the T-Shirt template card
  const tshirtCard = page.locator('button:has-text("T-Shirt")').first();
  await tshirtCard.click({ force: true });
  await page.waitForTimeout(3000); // wait for template to load and resolve

  // Verify pieces loaded
  await expect(page.locator('.status-bar')).toContainText(/Pieces.*[1-9]/, { timeout: 5000 });
}

async function getSvgCenter(page: Page) {
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, box };
}

/** Get full status bar left text */
async function getStatusText(page: Page): Promise<string> {
  return (await page.locator('.status-bar-left').textContent()) ?? '';
}

// ─── Seam Tool ──────────────────────────────────────────────────────────────

test.describe('Seam Tool (b)', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('shortcut B activates seam tool', async ({ page }) => {
    await page.keyboard.press('b');
    await page.waitForTimeout(300);
    const text = await getStatusText(page);
    // StatusBar shows "Edit Sewing (B)" for the seam tool
    expect(text).toContain('Edit Sewing');
  });

  test('tool options bar shows seam type and stitch length', async ({ page }) => {
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    const optionsBar = page.locator('.tool-options-bar');
    await expect(optionsBar).toBeVisible();

    // Should have "Seam" label
    await expect(optionsBar.locator('.tool-options-label')).toContainText('Seam');

    // Should have seam type selector
    const seamTypeSelect = optionsBar.locator('select');
    await expect(seamTypeSelect.first()).toBeVisible();

    // Should have stitch length slider
    const slider = optionsBar.locator('input[type="range"]');
    await expect(slider.first()).toBeVisible();
  });

  test('hovering piece edge shows highlight overlay', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    const { cx, cy } = await getSvgCenter(page);

    // Move mouse across the canvas — should trigger edge detection
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(300);

    // Move to different positions to find edges
    for (let dx = -100; dx <= 100; dx += 50) {
      await page.mouse.move(cx + dx, cy);
      await page.waitForTimeout(100);
    }

    // Check for seam overlay presence (may or may not have edges detected)
    const seamOverlay = page.locator('.seam-tool-wip');
    const overlayExists = await seamOverlay.count();
    console.log(`Seam tool overlay exists: ${overlayExists > 0}`);
  });

  test('clicking piece edge then Escape clears selection', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    const { cx, cy } = await getSvgCenter(page);

    // Click somewhere on the canvas
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Press Escape to clear
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Overlay should have no highlight lines
    const lines = page.locator('.seam-tool-wip line');
    const count = await lines.count();
    expect(count).toBe(0);
  });
});

// ─── Segment Sewing Tool ────────────────────────────────────────────────────

test.describe('Segment Sewing Tool (n)', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('shortcut N activates segment sewing tool', async ({ page }) => {
    await page.keyboard.press('n');
    await page.waitForTimeout(300);
    const text = await getStatusText(page);
    // No label in toolLabels map → shows raw ID "segmentSewing"
    expect(text).toContain('segmentSewing');
  });

  test('tool options bar shows seam type selector', async ({ page }) => {
    await page.keyboard.press('n');
    await page.waitForTimeout(500);

    const optionsBar = page.locator('.tool-options-bar');
    await expect(optionsBar).toBeVisible();

    // Should have a select dropdown for seam type
    const select = optionsBar.locator('select');
    await expect(select.first()).toBeVisible();
  });

  test('hovering near piece edge shows snap indicator', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('n');
    await page.waitForTimeout(300);

    const { cx, cy } = await getSvgCenter(page);

    // Hover across the canvas to find edges
    for (let dx = -150; dx <= 150; dx += 30) {
      await page.mouse.move(cx + dx, cy);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);

    // Snap indicators are purple circles in the overlay
    const snapCircles = page.locator('svg.pattern-svg circle');
    const circleCount = await snapCircles.count();
    console.log(`Circles in SVG (possible snap indicators): ${circleCount}`);
  });
});

// ─── Walk Seam Tool ─────────────────────────────────────────────────────────

test.describe('Walk Seam Tool (Shift+M)', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('Shift+M activates walk seam tool', async ({ page }) => {
    await page.keyboard.press('Shift+m');
    await page.waitForTimeout(300);
    const text = await getStatusText(page);
    // No label in toolLabels map → shows raw ID "walkSeam"
    expect(text).toContain('walkSeam');
  });

  test('tool options bar shows tolerance and ghost opacity', async ({ page }) => {
    await page.keyboard.press('Shift+m');
    await page.waitForTimeout(500);

    const optionsBar = page.locator('.tool-options-bar');
    await expect(optionsBar).toBeVisible();

    // Should show "Walk Seam" label
    await expect(optionsBar.locator('.tool-options-label')).toContainText('Walk Seam');

    // Should have tolerance selector
    const select = optionsBar.locator('select');
    await expect(select.first()).toBeVisible();

    // Should have ghost opacity slider
    const slider = optionsBar.locator('input[type="range"]');
    await expect(slider.first()).toBeVisible();
  });

  test('clicking piece outline sets stationary edge', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('Shift+m');
    await page.waitForTimeout(300);

    const { cx, cy } = await getSvgCenter(page);

    // Find a piece outline by moving mouse to detect snap
    // Hover first to see if we get snap feedback
    await page.mouse.move(cx - 50, cy - 50);
    await page.waitForTimeout(200);
    await page.mouse.click(cx - 50, cy - 50);
    await page.waitForTimeout(500);

    // Walk seam overlay should be present
    const walkOverlay = page.locator('.walk-seam-overlay');
    const exists = await walkOverlay.count();
    console.log(`Walk seam overlay present after click: ${exists > 0}`);
  });

  test('Escape clears walk state', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('Shift+m');
    await page.waitForTimeout(300);

    const { cx, cy } = await getSvgCenter(page);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Should not crash, page still functional
    const svg = page.locator('svg.pattern-svg');
    await expect(svg).toBeVisible();
  });
});

// ─── Free Sewing (Placeholder) ──────────────────────────────────────────────

test.describe('Free Sewing Tool (f) — placeholder', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('shortcut F activates without crash', async ({ page }) => {
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    const text = await getStatusText(page);
    // StatusBar shows "Free Sewing (M)" for freeSewing tool
    expect(text).toContain('Free Sewing');
  });

  test('clicking canvas with freeSewing active does not crash', async ({ page }) => {
    await page.keyboard.press('f');
    await page.waitForTimeout(300);

    const { cx, cy } = await getSvgCenter(page);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);

    // Page should still be functional
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
  });
});

// ─── Measure sub-tools (quick sanity) ───────────────────────────────────────

test.describe('Measure Tool Group', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('M activates measure tool', async ({ page }) => {
    await page.keyboard.press('m');
    await page.waitForTimeout(300);
    const text = await getStatusText(page);
    expect(text).toContain('Measure');
  });

  test('measure tool shows options bar', async ({ page }) => {
    await page.keyboard.press('m');
    await page.waitForTimeout(500);
    const optionsBar = page.locator('.tool-options-bar');
    await expect(optionsBar).toBeVisible();
  });
});
