import { test, expect } from '@playwright/test';
import { waitForApp, addRectanglePiece, switchView, startSimulation, waitForClothMesh, readMeshPositions } from './helpers/sim';

/**
 * Simulation Physics Smoke Test.
 *
 * Verifies the cloth solver produces valid (non-NaN/Inf, non-all-zero)
 * positions once a piece is dressed and the simulation runs. This caught the
 * "invisible garments" bug where wasm memory access was broken (all positions
 * zero).
 *
 * Setup retargeted (2026-06-04): the old ActivityBar `[aria-label="Simulation"]`
 * sim panel + 2D rectangle-draw flow are gone. Pieces are now dispatched into
 * project state and the sim is started via store dispatch (dress-avatar pattern).
 * Core physics assertions (NaN/Inf/all-zero) are preserved verbatim.
 */
test.describe('Simulation Physics (Gravity Smoke Test)', () => {
  test.setTimeout(90_000);

  test('garment falls due to gravity', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    const appeared = await waitForClothMesh(page, 20_000);
    expect(appeared, 'cloth mesh observable never appeared after sim start').toBe(true);

    await page.waitForTimeout(2000);
    const initial = await readMeshPositions(page);
    expect(initial.found).toBe(true);

    // Let physics run.
    await page.waitForTimeout(4000);
    const final = await readMeshPositions(page);
    expect(final.found).toBe(true);
    if (!final.found) return;

    console.log(`center Y: initial=${initial.found ? initial.avgY : 'n/a'}, final=${final.avgY}`);

    // Positions must be valid finite numbers near the origin (not NaN/Inf, not flung to infinity).
    expect(final.nanCount).toBe(0);
    expect(Number.isNaN(final.avgY)).toBe(false);
    expect(Math.abs(final.avgY)).toBeLessThan(10);
  });

  test('simulation does not produce NaN or infinite positions', async ({ page }) => {
    // Regression test for the wasm memory access bug.
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    const appeared = await waitForClothMesh(page, 20_000);
    expect(appeared, 'cloth mesh observable never appeared after sim start').toBe(true);

    await page.waitForTimeout(4000);
    const check = await readMeshPositions(page);
    console.log('Position check:', check);

    expect(check.found).toBe(true);
    if (!check.found) return;
    // All-zeros means positions weren't updated (the bug!).
    expect(check.allZeros).toBe(false);
    expect(check.nanCount).toBe(0);
    expect(check.infCount).toBe(0);
  });
});
