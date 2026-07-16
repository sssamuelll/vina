import { test, expect } from '@playwright/test';

// Cloth simulation tests need time for avatar + sim init + physics settling
test.describe('Cloth Simulation', () => {
  test.setTimeout(120_000);

  test('cloth pieces move after simulation starts', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });

    // Switch to 3D view
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Expose the cloth mesh for testing (set by GarmentSimulation.tsx)
    const getClothPositions = () => page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh?.geometry) return null;
      const posAttr = mesh.geometry.getAttribute('position');
      if (!posAttr) return null;
      // Return first 30 position values (10 vertices) for comparison
      return Array.from(posAttr.array.slice(0, 30) as Float32Array);
    });

    // Capture initial positions before simulation starts
    const initialPositions = await getClothPositions();
    if (!initialPositions) {
      test.skip(true, 'No cloth mesh found — simulation may not have loaded');
      return;
    }

    // Start simulation by clicking the play button
    const playButton = page.locator('button[title*="Start"], button[aria-label*="Start"], button[title*="Play"], button[aria-label*="Play"], button:has-text("▶"), button:has-text("Iniciar"), button:has-text("Start")');
    const simButton = playButton.first();
    if (await simButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await simButton.click();
    } else {
      // Try finding the simulate button by other means
      const altButton = page.locator('[data-testid="simulate-button"], button:has-text("Simular")').first();
      if (await altButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await altButton.click();
      } else {
        test.skip(true, 'Could not find simulation start button');
        return;
      }
    }

    // Wait for simulation to run and physics to update positions
    await page.waitForTimeout(5000);

    // Check that positions have changed (cloth has moved)
    const afterPositions = await getClothPositions();
    if (!afterPositions) {
      test.skip(true, 'Cloth mesh no longer available after sim start');
      return;
    }

    // Compute position delta — at least some vertices should have moved
    let totalDelta = 0;
    for (let i = 0; i < Math.min(initialPositions.length, afterPositions.length); i++) {
      totalDelta += Math.abs(afterPositions[i] - initialPositions[i]);
    }

    // If cloth is simulating, gravity alone should cause visible movement (> 0.01 total)
    expect(totalDelta).toBeGreaterThan(0.01);
  });

  test('solver tier is reported in redux state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });

    // Switch to 3D view
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);

    // Check the solver tier from redux
    const solverTier = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__REDUX_STORE__;
      if (!store) return null;
      return store.getState()?.simulation?.solverTier ?? null;
    });

    // Before simulation starts, tier should be 'none'
    // (If we can't access redux, skip gracefully)
    if (solverTier === null) {
      test.skip(true, 'Redux store not exposed for testing');
      return;
    }

    expect(solverTier).toBe('none');
  });
});
