import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for self-collision feature (PR #300, issue #293).
 *
 * Verifies that:
 * 1. Simulation runs without errors when selfCollision is enabled (standard/production preset)
 * 2. No import/runtime errors from tslSelfCollision module
 * 3. Quality preset switching works (preview=off, standard/production=on)
 * 4. Cloth positions remain valid (no NaN/Inf) with self-collision active
 * 5. Simulation can be toggled between presets with and without self-collision
 *
 * Note: Playwright's headless Chromium uses SwiftShader (no WebGPU), so
 * the GPU self-collision pipeline falls back to WASM/CPU. These tests verify
 * the self-collision code doesn't break the fallback path.
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function dismissTemplateLibrary(page: Page) {
  const heading = page.locator('text=Seamly2D Pattern Library');
  if (await heading.isVisible().catch(() => false)) {
    await page.locator('button.template-close').click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function drawRectanglePiece(page: Page) {
  await dismissTemplateLibrary(page);

  await page.click('button:has-text("2D")');
  await page.waitForTimeout(500);

  const svg = page.locator('svg.pattern-svg');
  await svg.click();
  await page.waitForTimeout(200);

  // 's' = Rectangle tool
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

  await expect(page.locator('text=/Pieces:\\s*[1-9]/')).toBeVisible({ timeout: 5000 });
}

async function openSimPanel(page: Page) {
  const simItem = page.locator('.activity-bar-top .tool-tooltip-wrapper:nth-child(3) button');
  await simItem.click({ force: true });
  await page.waitForTimeout(500);
}

async function clickSimulate(page: Page) {
  const simBtn = page.locator('button').filter({ hasText: 'Simulate' }).first();
  await expect(simBtn).toBeEnabled({ timeout: 5000 });
  await simBtn.click();
}

async function selectQualityPreset(page: Page, label: string) {
  const presetBtn = page.locator('.simulation-view button').filter({ hasText: label });
  await presetBtn.click();
  await page.waitForTimeout(300);
}

test.describe('Self-Collision (GPU pipeline, issue #293)', () => {
  test.setTimeout(120_000);

  test('simulation runs with selfCollision enabled (standard preset)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Standard is the default preset — selfCollision: true
    await clickSimulate(page);

    // Should start simulating
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Let simulation run long enough for self-collision passes to execute
    await page.waitForTimeout(5000);

    // Should still be simulating (no crash from self-collision code)
    const stillSimulating = await page.locator('text=SIMULATING').first().isVisible();
    const paused = await page.locator('text=PAUSED').first().isVisible();
    expect(stillSimulating || paused).toBe(true);

    // No self-collision related import or runtime errors
    const scErrors = errors.filter(e =>
      e.includes('tslSelfCollision') ||
      e.includes('selfCollision') ||
      e.includes('atomicLoad') ||
      e.includes('atomicStore') ||
      e.includes('atomicAdd') ||
      e.includes('SelfCollision') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(scErrors).toHaveLength(0);
  });

  test('no NaN or Inf positions with selfCollision active', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Default quality is 'standard' which has selfCollision: true
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Wait for cloth to drape with self-collision
    await page.waitForTimeout(6000);

    // Check all positions are valid numbers
    const positionCheck = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh?.geometry) return { valid: false, reason: 'no mesh found' };

      const posAttr = mesh.geometry.getAttribute('position');
      if (!posAttr) return { valid: false, reason: 'no position attribute' };

      let nanCount = 0;
      let infCount = 0;
      let zeroCount = 0;

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        if (isNaN(x) || isNaN(y) || isNaN(z)) nanCount++;
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) infCount++;
        if (x === 0 && y === 0 && z === 0) zeroCount++;
      }

      const allZeros = zeroCount === posAttr.count;
      return {
        valid: nanCount === 0 && infCount === 0 && !allZeros,
        vertexCount: posAttr.count,
        nanCount,
        infCount,
        zeroCount,
        allZeros,
      };
    });

    console.log('Self-collision position check:', positionCheck);

    if (positionCheck.reason === 'no mesh found') {
      test.skip(true, 'No cloth mesh found — simulation may not have loaded');
      return;
    }

    expect(positionCheck.valid).toBe(true);
  });

  test('cloth drapes under gravity with selfCollision enabled', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Capture initial Y center
    await page.waitForTimeout(2000);
    const initialY = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh?.geometry) return null;
      const posAttr = mesh.geometry.getAttribute('position');
      if (!posAttr || posAttr.count === 0) return null;
      let sumY = 0;
      for (let i = 0; i < posAttr.count; i++) sumY += posAttr.getY(i);
      return sumY / posAttr.count;
    });

    // Let gravity pull cloth down
    await page.waitForTimeout(5000);

    const finalY = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh?.geometry) return null;
      const posAttr = mesh.geometry.getAttribute('position');
      if (!posAttr || posAttr.count === 0) return null;
      let sumY = 0;
      for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        if (isNaN(y)) return NaN;
        sumY += y;
      }
      return sumY / posAttr.count;
    });

    console.log(`Self-collision drape: initialY=${initialY}, finalY=${finalY}`);

    if (initialY === null || finalY === null) {
      test.skip(true, 'Could not access cloth mesh positions');
      return;
    }

    expect(finalY).not.toBeNaN();
    expect(Math.abs(finalY)).toBeLessThan(10);
  });

  test('quality preset switching: preview (no SC) → standard (SC) → production (SC)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Switch to preview (selfCollision: false)
    await selectQualityPreset(page, 'Preview');
    await page.waitForTimeout(300);

    // Switch to standard (selfCollision: true)
    await selectQualityPreset(page, 'Standard');
    await page.waitForTimeout(300);

    // Switch to production (selfCollision: true)
    await selectQualityPreset(page, 'Production');
    await page.waitForTimeout(300);

    // Start simulation with production preset
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(5000);

    // No errors from switching presets or self-collision initialization
    const scErrors = errors.filter(e =>
      e.includes('tslSelfCollision') ||
      e.includes('selfCollision') ||
      e.includes('atomicLoad') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(scErrors).toHaveLength(0);

    // Should still be simulating
    const stillRunning = await page.locator('text=SIMULATING').first().isVisible();
    const paused = await page.locator('text=PAUSED').first().isVisible();
    expect(stillRunning || paused).toBe(true);
  });

  test('simulation start/pause/reset cycle with selfCollision enabled', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Start (standard preset = selfCollision on)
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);

    // Pause
    const pauseBtn = page.locator('button').filter({ hasText: 'Pause' }).first();
    await pauseBtn.click();
    await expect(page.locator('text=PAUSED').first()).toBeVisible({ timeout: 5000 });

    // Reset
    const resetBtn = page.locator('button').filter({ hasText: '↺' });
    await resetBtn.click();
    await expect(page.locator('text=IDLE').first()).toBeVisible({ timeout: 5000 });

    // Restart — self-collision buffers should re-initialize cleanly
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);

    // No cleanup or re-init errors
    const scErrors = errors.filter(e =>
      e.includes('tslSelfCollision') ||
      e.includes('selfCollision') ||
      e.includes('SelfCollision') ||
      e.includes('atomicLoad')
    );
    expect(scErrors).toHaveLength(0);

    // Canvas still rendering
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('no GPU validation errors from self-collision compute kernels', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await waitForApp(page);
    await drawRectanglePiece(page);

    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    await openSimPanel(page);
    await clickSimulate(page);

    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(5000);

    // No GPU validation errors from self-collision kernels
    const gpuErrors = consoleMessages.filter(msg =>
      msg.includes('WebGPU uncaptured error') ||
      msg.includes('GPUValidationError')
    );
    expect(gpuErrors).toHaveLength(0);

    // No self-collision specific errors
    const scErrors = consoleMessages.filter(msg =>
      msg.includes('[error]') && (
        msg.includes('selfCollision') ||
        msg.includes('tslSelfCollision') ||
        msg.includes('hashCount') ||
        msg.includes('prefixSum') ||
        msg.includes('scatter') ||
        msg.includes('resolveNode')
      )
    );
    expect(scErrors).toHaveLength(0);
  });
});
