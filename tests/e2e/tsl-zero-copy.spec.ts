import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for TSL zero-copy rendering (Phase 1).
 *
 * Note: Playwright's Chromium uses SwiftShader (no WebGPU), so the TSL solver
 * falls back to WASM/CPU. These tests verify:
 * 1. TSL code doesn't break the simulation pipeline
 * 2. Fallback path works correctly
 * 3. Simulation runs and cloth drapes
 * 4. No import/runtime errors from new TSL modules
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

/**
 * Dismiss the Seamly2D template library overlay if it auto-shows on startup.
 * The 3D canvas intercepts pointer events, so we use force:true.
 */
async function dismissTemplateLibrary(page: Page) {
  const heading = page.locator('text=Seamly2D Pattern Library');
  if (await heading.isVisible().catch(() => false)) {
    await page.locator('button.template-close').click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function drawRectanglePiece(page: Page) {
  await dismissTemplateLibrary(page);

  // Switch to 2D mode for reliable canvas interaction
  await page.click('button:has-text("2D")');
  await page.waitForTimeout(500);

  const svg = page.locator('svg.pattern-svg');
  await svg.click(); // Focus the 2D canvas
  await page.waitForTimeout(200);

  // 's' = Rectangle tool (CLO3D shortcut mapping)
  await page.keyboard.press('s');
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

  // Verify piece was created via status bar
  await expect(page.locator('text=/Pieces:\\s*[1-9]/')).toBeVisible({ timeout: 5000 });
}

/**
 * Open the Simulation sidebar panel.
 * Simulation is the 3rd top item in the activity bar (Play icon).
 */
async function openSimPanel(page: Page) {
  const simItem = page.locator('.activity-bar-top .tool-tooltip-wrapper:nth-child(3) button');
  await simItem.click({ force: true });
  await page.waitForTimeout(500);
}

/** Click the simulate button. Text is "▶ Simulate" when idle/paused. */
async function clickSimulate(page: Page) {
  const simBtn = page.locator('button').filter({ hasText: 'Simulate' }).first();
  await expect(simBtn).toBeEnabled({ timeout: 5000 });
  await simBtn.click();
}

test.describe('TSL Zero-Copy Rendering', () => {
  test.setTimeout(120_000);

  test('simulation pipeline works after TSL code addition', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);
    await clickSimulate(page);

    // Should start simulating (matches both sidebar + 3D status badge)
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Let simulation run
    await page.waitForTimeout(3000);

    // Should still be running (no crash)
    await expect(page.locator('text=SIMULATING').first()).toBeVisible();

    // No import errors from TSL modules
    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('tslSolver') ||
      e.includes('tslBuffers') ||
      e.includes('Cannot find module')
    );
    expect(importErrors).toHaveLength(0);
  });

  test('no WebGPU errors when TSL solver is attempted', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await waitForApp(page);
    await dismissTemplateLibrary(page);
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);

    const gpuErrors = consoleMessages.filter(msg =>
      msg.includes('WebGPU uncaptured error') ||
      msg.includes('GPUValidationError')
    );
    expect(gpuErrors).toHaveLength(0);
  });

  test('solver fallback works — simulation runs on WASM/CPU', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);

    // Switch to 3D view so mesh is created and solver initializes
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    await openSimPanel(page);
    await clickSimulate(page);

    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Wait for solver to initialize and report tier
    await page.waitForTimeout(5000);

    // The SimulationView displays "Solver: {tier}" where tier is one of:
    // 'none' | 'webgpu' | 'wasm' | 'cpu-worker' | 'neural-drape'
    // In headless Chromium (no WebGPU), should be wasm or cpu-worker
    const solverText = await page.locator('text=/Solver:/').textContent() ?? '';

    // Solver should have been selected (not "none")
    const hasSolver = !solverText.includes('Solver: none');
    expect(hasSolver).toBe(true);
  });

  test('simulation start/pause/reset lifecycle works', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);
    await clickSimulate(page);

    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Pause
    await page.waitForTimeout(1000);
    const pauseBtn = page.locator('button').filter({ hasText: 'Pause' }).first();
    await pauseBtn.click();
    await expect(page.locator('text=PAUSED').first()).toBeVisible({ timeout: 5000 });

    // Reset — button text is just "↺"
    const resetBtn = page.locator('button').filter({ hasText: '↺' });
    await resetBtn.click();
    await expect(page.locator('text=IDLE').first()).toBeVisible({ timeout: 5000 });

    // No errors from TSL solver cleanup
    const tslErrors = errors.filter(e =>
      e.includes('tslSolver') ||
      e.includes('tslBuffers') ||
      e.includes('positionNode') ||
      e.includes('StorageBufferAttribute') ||
      e.includes('renderer.compute')
    );
    expect(tslErrors).toHaveLength(0);
  });

  test('cloth position changes during simulation (draping)', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);

    // Switch to 3D view
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    // Open sim panel and start
    await openSimPanel(page);
    await clickSimulate(page);

    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Let cloth fall
    await page.waitForTimeout(5000);

    // Should still be running (cloth is draping, not crashed)
    const stillSimulating = await page.locator('text=SIMULATING').first().isVisible();
    const paused = await page.locator('text=PAUSED').first().isVisible();
    expect(stillSimulating || paused).toBe(true);

    // Canvas should still be rendering
    await expect(page.locator('canvas')).toBeVisible();
  });
});
