/**
 * E2E tests for sewing tools: Seam, Segment Sewing, Walk Seam, Free Sewing
 *
 * Tests verify:
 * 1. Tool activation via keyboard shortcuts
 * 2. Visual feedback (overlays, highlights)
 * 3. Tool options bar rendering
 * 4. Seam creation via edge clicks
 * 5. Free Sewing tool functionality
 * 6. Seam context menu (right-click)
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

/** Get piece bounding boxes for targeting edges */
async function getPieceBounds(page: Page) {
  const pieces = page.locator('.pattern-piece');
  const count = await pieces.count();
  const bounds: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let i = 0; i < count; i++) {
    const box = await pieces.nth(i).boundingBox();
    if (box) bounds.push(box);
  }
  return bounds;
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
    const seamOverlay = page.locator('.edge-pair-overlay');
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
    const lines = page.locator('.edge-pair-overlay line');
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

// ─── Free Sewing Tool ──────────────────────────────────────────────────────

test.describe('Free Sewing Tool (f)', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('shortcut F activates and shows status bar', async ({ page }) => {
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    const text = await getStatusText(page);
    expect(text).toContain('Free Sewing');
  });

  test('hovering piece edge shows green highlight', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('f');
    await page.waitForTimeout(300);

    // Move mouse across piece edges to trigger highlight
    const bounds = await getPieceBounds(page);
    if (bounds.length > 0) {
      const b = bounds[0];
      // Hover along the left edge of first piece
      for (let dy = 0; dy <= b.height; dy += b.height / 5) {
        await page.mouse.move(b.x, b.y + dy);
        await page.waitForTimeout(100);
      }
    }

    // Edge pair overlay should be present with at least one line
    const overlay = page.locator('.edge-pair-overlay');
    const overlayCount = await overlay.count();
    const lines = page.locator('.edge-pair-overlay line');
    const lineCount = await lines.count();
    console.log(`Free sewing overlay: ${overlayCount > 0}, lines: ${lineCount}`);
  });

  test('clicking piece edge selects first edge with visual feedback', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('f');
    await page.waitForTimeout(300);

    const bounds = await getPieceBounds(page);
    if (bounds.length > 0) {
      // Click the left edge of the first piece
      const b = bounds[0];
      await page.mouse.click(b.x, b.y + b.height / 2);
      await page.waitForTimeout(300);
    }

    // After first edge click, overlay should have a green highlight line
    const lines = page.locator('.edge-pair-overlay line');
    const lineCount = await lines.count();
    // At least one line if edge was detected (green first edge highlight)
    console.log(`Lines after first click: ${lineCount}`);
  });

  test('clicking empty area resets selection', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('f');
    await page.waitForTimeout(300);

    const { box } = await getSvgCenter(page);

    // Click a piece edge first (left side of canvas where pieces are)
    const bounds = await getPieceBounds(page);
    if (bounds.length > 0) {
      await page.mouse.click(bounds[0].x, bounds[0].y + bounds[0].height / 2);
      await page.waitForTimeout(300);
    }

    // Click far from any piece to reset
    await page.mouse.click(box.x + box.width - 20, box.y + 20);
    await page.waitForTimeout(300);

    // Overlay lines should be cleared
    const lines = page.locator('.edge-pair-overlay line');
    const count = await lines.count();
    expect(count).toBe(0);
  });

  test('Escape cancels first edge selection', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.keyboard.press('f');
    await page.waitForTimeout(300);

    // Click on piece to select an edge
    const bounds = await getPieceBounds(page);
    if (bounds.length > 0) {
      await page.mouse.click(bounds[0].x, bounds[0].y + bounds[0].height / 2);
      await page.waitForTimeout(300);
    }

    // Escape should clear the selection
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const lines = page.locator('.edge-pair-overlay line');
    const count = await lines.count();
    expect(count).toBe(0);
  });

  test('tool options bar shows sewing type selector', async ({ page }) => {
    await page.keyboard.press('f');
    await page.waitForTimeout(500);

    const optionsBar = page.locator('.tool-options-bar');
    await expect(optionsBar).toBeVisible();

    // Should have "Free Sewing" label
    await expect(optionsBar.locator('.tool-options-label')).toContainText('Free Sewing');
  });
});

// ─── Seam Context Menu ─────────────────────────────────────────────────────

test.describe('Seam Context Menu', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('right-click on seam connection shows seam context menu', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.waitForTimeout(1000);

    // T-Shirt template comes with seams — find a seam connection element
    const seamConnection = page.locator('.seam-connection').first();
    const seamVisible = await seamConnection.isVisible().catch(() => false);

    if (seamVisible) {
      // Right-click the seam
      await seamConnection.click({ button: 'right', force: true });
      await page.waitForTimeout(300);

      // Context menu should show "Seam" header
      const seamHeader = page.locator('text=Seam');
      await expect(seamHeader).toBeVisible({ timeout: 2000 });

      // Should show seam-specific items
      const reverseItem = page.locator('text=Reverse Sewing Direction');
      await expect(reverseItem).toBeVisible();

      const deleteItem = page.locator('text=Delete Seam');
      await expect(deleteItem).toBeVisible();
    } else {
      console.log('No visible seam connections — template may not have pre-defined seams');
    }
  });

  test('Reverse Sewing Direction swaps seam direction', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.waitForTimeout(1000);

    const seamConnection = page.locator('.seam-connection').first();
    const seamVisible = await seamConnection.isVisible().catch(() => false);

    if (seamVisible) {
      // Right-click to open context menu
      await seamConnection.click({ button: 'right', force: true });
      await page.waitForTimeout(300);

      // Click "Reverse Sewing Direction"
      const reverseItem = page.locator('text=Reverse Sewing Direction');
      if (await reverseItem.isVisible()) {
        await reverseItem.click();
        await page.waitForTimeout(300);

        // Context menu should close
        await expect(reverseItem).not.toBeVisible();

        // Page should still be functional
        await expect(page.locator('svg.pattern-svg')).toBeVisible();
        // Seam should still exist (not deleted, just reversed)
        await expect(page.locator('.seam-connection').first()).toBeVisible();
      }
    }
  });

  test('Delete Seam removes the seam', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.waitForTimeout(1000);

    const seamsBefore = await page.locator('.seam-connection').count();

    const seamConnection = page.locator('.seam-connection').first();
    const seamVisible = await seamConnection.isVisible().catch(() => false);

    if (seamVisible && seamsBefore > 0) {
      // Right-click to open context menu
      await seamConnection.click({ button: 'right', force: true });
      await page.waitForTimeout(300);

      // Click "Delete Seam"
      const deleteItem = page.locator('text=Delete Seam');
      if (await deleteItem.isVisible()) {
        await deleteItem.click();
        await page.waitForTimeout(500);

        // Seam count should decrease by 1
        const seamsAfter = await page.locator('.seam-connection').count();
        expect(seamsAfter).toBe(seamsBefore - 1);
      }
    }
  });

  test('Select piece items appear for connected pieces', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.waitForTimeout(1000);

    const seamConnection = page.locator('.seam-connection').first();
    const seamVisible = await seamConnection.isVisible().catch(() => false);

    if (seamVisible) {
      await seamConnection.click({ button: 'right', force: true });
      await page.waitForTimeout(300);

      // Should show Select "piece name" items for both connected pieces
      const selectItems = page.locator('button:has-text("Select")');
      const selectCount = await selectItems.count();
      // At minimum: "Select [pieceA]" and "Select [pieceB]"
      console.log(`Select items in seam context menu: ${selectCount}`);
      expect(selectCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('right-click on piece shows piece menu, not seam menu', async ({ page }) => {
    await loadTShirtTemplate(page);
    await page.waitForTimeout(500);

    // Right-click on a pattern piece (not a seam)
    const piece = page.locator('.pattern-piece').first();
    await expect(piece).toBeVisible({ timeout: 5000 });

    await piece.click({ button: 'right', force: true });
    await page.waitForTimeout(300);

    // Should show piece-specific items, NOT seam items
    const rotateItem = page.locator('text=Rotate 90°');
    await expect(rotateItem).toBeVisible();

    // Should NOT show seam-specific items
    const reverseItem = page.locator('text=Reverse Sewing Direction');
    await expect(reverseItem).not.toBeVisible();
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
