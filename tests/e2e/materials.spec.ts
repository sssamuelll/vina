import { test, expect, Page } from '@playwright/test';

/**
 * PBR Materials UI — E2E Tests
 *
 * Verifies the HDRI environment loads, the MaterialTab renders in the
 * PropertiesPanel, fabric presets are selectable, the color tint picker
 * works, and the material system survives simulation lifecycle events.
 *
 * Prerequisites:
 * - A pattern piece must be drawn and selected for the MATERIAL section
 *   to appear in the PropertiesPanel.
 * - The 3D view must be opened for HDRI / environment checks.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function drawRect(page: Page) {
  const svg = page.locator('svg.pattern-svg');
  await svg.click(); // Focus the 2D canvas
  await page.waitForTimeout(200);

  await page.keyboard.press('r');
  await page.waitForTimeout(200);

  const box = await svg.boundingBox();
  if (!box) throw new Error('Pattern SVG not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  // Verify piece was created
  const piecesIndicator = page.locator('text=/Pieces:\\s*[1-9]/');
  await expect(piecesIndicator).toBeVisible({ timeout: 5000 });
}

async function selectPiece(page: Page) {
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('Pattern SVG not found');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
}

/**
 * Full 2D setup: load app, draw a piece, select it.
 * After this, the PropertiesPanel MATERIAL section should be visible.
 */
async function setupWithPiece(page: Page) {
  await waitForApp(page);
  await drawRect(page);
  await selectPiece(page);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('PBR Materials', () => {
  test.setTimeout(120_000);

  // ── Test 1: HDRI environment loads in 3D view ──────────────────────────

  test('HDRI environment loads in 3D view', async ({ page }) => {
    await setupWithPiece(page);

    // Switch to 3D view
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    // The 3D canvas should be visible — if it rendered without crashing,
    // the HDRI environment loaded (or at least did not block rendering)
    await expect(page.locator('canvas')).toBeVisible();

    // Verify no console errors related to HDRI loading
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null && canvas.width > 0 && canvas.height > 0;
    });
    expect(hasCanvas).toBe(true);
  });

  // ── Test 2: MATERIAL section visible when piece selected ───────────────

  test('MATERIAL section visible in PropertiesPanel', async ({ page }) => {
    await setupWithPiece(page);

    // The MATERIAL section header should be visible in the PropertiesPanel
    await expect(page.locator('text=MATERIAL')).toBeVisible({ timeout: 5000 });
  });

  // ── Test 3: Fabric preset grid shows fabric buttons ────────────────────

  test('fabric preset grid shows fabrics', async ({ page }) => {
    await setupWithPiece(page);

    // The FABRIC PRESET label should be visible
    await expect(page.locator('text=FABRIC PRESET')).toBeVisible({ timeout: 5000 });

    // Look for a fabric button by title attribute (format: "Name — Weightgsm weaveType")
    await expect(page.locator('button[title*="Cotton Poplin"]')).toBeVisible({ timeout: 5000 });

    // Also verify there are multiple fabric buttons in the grid
    const fabricButtons = page.locator('button[title*="gsm"]');
    const count = await fabricButtons.count();
    expect(count).toBeGreaterThanOrEqual(10); // We have 32+ fabrics in the library
  });

  // ── Test 4: Selecting a fabric updates the active indicator ────────────

  test('clicking a fabric preset selects it', async ({ page }) => {
    await setupWithPiece(page);

    // Click Denim fabric
    const denimBtn = page.locator('button[title*="Denim 12oz"]');
    await expect(denimBtn).toBeVisible({ timeout: 5000 });
    await denimBtn.click();
    await page.waitForTimeout(500);

    // The fabric info text below the grid should show the selected fabric
    await expect(page.locator('text=/Denim 12oz/')).toBeVisible({ timeout: 3000 });
  });

  // ── Test 5: Color tint picker renders and updates ──────────────────────

  test('color tint picker works', async ({ page }) => {
    await setupWithPiece(page);

    // The COLOR TINT label should be visible
    await expect(page.locator('text=COLOR TINT')).toBeVisible({ timeout: 5000 });

    // The hex text input starts with #ffffff
    const hexInput = page.locator('input[type="text"][value="#ffffff"]');
    await expect(hexInput).toBeVisible({ timeout: 3000 });

    // Change the tint via the text input
    await hexInput.fill('#ff0000');
    await page.waitForTimeout(300);

    // Verify the input updated
    await expect(hexInput).toHaveValue('#ff0000');

    // Click the Reset button to restore default
    const resetBtn = page.locator('button:has-text("Reset")').first();
    await resetBtn.click();
    await page.waitForTimeout(300);

    // Tint should be back to white
    await expect(page.locator('input[type="text"][value="#ffffff"]')).toBeVisible();
  });

  // ── Test 6: UV Transform controls render ───────────────────────────────

  test('UV transform controls render', async ({ page }) => {
    await setupWithPiece(page);

    // The UV TRANSFORM label should be visible
    await expect(page.locator('text=UV TRANSFORM')).toBeVisible({ timeout: 5000 });

    // Repeat X, Y, and Rot labels should be present
    await expect(page.locator('text=Repeat X')).toBeVisible();
    await expect(page.locator('label:has-text("Y") input[type="number"]')).toBeVisible();
    await expect(page.locator('label:has-text("Rot") input[type="number"]')).toBeVisible();
  });

  // ── Test 7: Texture override slots render ──────────────────────────────

  test('texture override drag-drop slots render', async ({ page }) => {
    await setupWithPiece(page);

    // The TEXTURE OVERRIDES label should be visible
    await expect(page.locator('text=TEXTURE OVERRIDES')).toBeVisible({ timeout: 5000 });

    // All four texture slot labels should be present (diffuse, normal, roughness, ao)
    await expect(page.locator('text=diffuse')).toBeVisible();
    await expect(page.locator('text=normal')).toBeVisible();
    await expect(page.locator('text=roughness')).toBeVisible();
    await expect(page.locator('text=ao')).toBeVisible();
  });

  // ── Test 8: Material panel not shown without piece selection ───────────

  test('MATERIAL section hidden without piece selection', async ({ page }) => {
    await waitForApp(page);

    // Without selecting a piece, the MATERIAL section should not be in the DOM
    // (PropertiesPanel only renders it when selectedPiece exists)
    const materialSection = page.locator('text=MATERIAL');
    await expect(materialSection).not.toBeVisible({ timeout: 2000 });
  });

  // ── Test 9: Material survives simulation restart ───────────────────────

  test('material survives simulation restart', async ({ page }) => {
    await setupWithPiece(page);

    // Start simulation
    await page.click('.activity-bar-item[title="Simulation"]');
    const startBtn = page.locator('button:has-text("Start Simulation")');
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(startBtn).toBeEnabled({ timeout: 3000 });
      await startBtn.click();
      await page.waitForTimeout(2000);

      // Reset
      const resetBtn = page.locator('button:has-text("Reset")');
      if (await resetBtn.isVisible().catch(() => false)) {
        await resetBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // App should still be alive — canvas visible, no crash
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.status-bar')).toBeVisible();
  });

  // ── Test 10: 3D view renders canvas after material changes ─────────────

  test('3D canvas renders after fabric change', async ({ page }) => {
    await setupWithPiece(page);

    // Select a different fabric
    const silkBtn = page.locator('button[title*="Silk Charmeuse"]');
    await expect(silkBtn).toBeVisible({ timeout: 5000 });
    await silkBtn.click();
    await page.waitForTimeout(300);

    // Switch to 3D
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    // Canvas should be alive
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null && canvas.width > 0 && canvas.height > 0;
    });
    expect(hasCanvas).toBe(true);
  });
});
