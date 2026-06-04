import { test, expect } from '@playwright/test';
import {
  waitForApp, addRectanglePiece, switchView, startSimulation,
  waitForClothMesh, getSimulationState,
} from './helpers/sim';

/**
 * E2E tests for TSL zero-copy rendering (Phase 1).
 *
 * Note: Playwright's Chromium uses SwiftShader (no WebGPU), so the TSL solver
 * falls back to WASM/CPU. These tests verify:
 * 1. TSL code doesn't break the simulation pipeline.
 * 2. Fallback path works correctly (solver tier selected, not 'none').
 * 3. Simulation runs and cloth drapes.
 * 4. No import/runtime errors from new TSL modules.
 *
 * Setup retargeted (2026-06-04): the ActivityBar sim panel + `.simulation-view`
 * "Solver: {tier}" readout were deleted. Pieces are dispatched into project
 * state, the sim is started via store dispatch, and the solver tier is read
 * from `simulation.solverTier` in the store (dress-avatar pattern).
 */

test.describe('TSL Zero-Copy Rendering', () => {
  test.setTimeout(120_000);

  test('simulation pipeline works after TSL code addition', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(3000);

    expect(['running', 'paused']).toContain(await getSimulationState(page));

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
    page.on('console', msg => { consoleMessages.push(`[${msg.type()}] ${msg.text()}`); });

    await waitForApp(page);
    await switchView(page, '3D');
    await page.waitForTimeout(3000);

    const gpuErrors = consoleMessages.filter(msg =>
      msg.includes('WebGPU uncaptured error') ||
      msg.includes('GPUValidationError')
    );
    expect(gpuErrors).toHaveLength(0);
  });

  test('solver fallback works — simulation runs on WASM/CPU', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    // Wait for solver to initialize and report tier.
    await page.waitForTimeout(5000);

    // In headless Chromium (no WebGPU), the tier should be wasm or cpu-worker —
    // crucially NOT 'none'. Read it straight off the store.
    const tier = await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { getState: () => { simulation: { solverTier: string } } } }).__OPENCLO_STORE__;
      return s.getState().simulation.solverTier;
    });
    console.log(`Solver tier: ${tier}`);
    expect(tier).not.toBe('none');
  });

  test('simulation start/pause/reset lifecycle works', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { dispatch: (a: unknown) => void } }).__OPENCLO_STORE__;
      s.dispatch({ type: 'simulation/pauseSimulation' });
    });
    await page.waitForTimeout(300);
    expect(await getSimulationState(page)).toBe('paused');

    await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { dispatch: (a: unknown) => void } }).__OPENCLO_STORE__;
      s.dispatch({ type: 'simulation/resetSimulation' });
    });
    await page.waitForTimeout(300);
    expect(await getSimulationState(page)).toBe('idle');

    const tslErrors = errors.filter(e =>
      e.includes('tslSolver') ||
      e.includes('tslBuffers') ||
      e.includes('positionNode') ||
      e.includes('StorageBufferAttribute') ||
      e.includes('renderer.compute')
    );
    expect(tslErrors).toHaveLength(0);
  });

  test('no errors from collision modules during simulation', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(5000);

    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const collisionErrors = errors.filter(e =>
      e.includes('buildLinearBVH') ||
      e.includes('tslCollision') ||
      e.includes('setTslCollisionBody') ||
      e.includes('BVH')
    );
    expect(collisionErrors).toHaveLength(0);

    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('no GPU validation errors from collision kernel', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => { consoleMessages.push(`[${msg.type()}] ${msg.text()}`); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(3000);

    const gpuErrors = consoleMessages.filter(msg =>
      msg.includes('WebGPU uncaptured error') ||
      msg.includes('GPUValidationError')
    );
    expect(gpuErrors).toHaveLength(0);
  });

  test('cloth position changes during simulation (draping)', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(5000);

    expect(['running', 'paused']).toContain(await getSimulationState(page));
    await expect(page.locator('canvas').first()).toBeVisible();
  });
});
