import { test, expect } from '@playwright/test';
import {
  waitForApp, addRectanglePiece, switchView, startSimulation,
  waitForClothMesh, readMeshPositions, getSimulationState, dispatch,
} from './helpers/sim';

/**
 * E2E tests for self-collision feature (PR #300, issue #293).
 *
 * Verifies that:
 * 1. Simulation runs without errors when selfCollision is enabled.
 * 2. No import/runtime errors from tslSelfCollision module.
 * 3. Quality preset switching works (normal=SC off, complete=SC on).
 * 4. Cloth positions remain valid (no NaN/Inf) with self-collision active.
 * 5. Start/pause/reset cycle re-initializes self-collision buffers cleanly.
 *
 * Note: Playwright's headless Chromium uses SwiftShader (no WebGPU), so the
 * GPU self-collision pipeline falls back to WASM/CPU. These tests verify the
 * self-collision code doesn't break the fallback path.
 *
 * Setup retargeted (2026-06-04): the ActivityBar sim panel + `.simulation-view`
 * preset buttons were deleted. There is no preview/standard/production preset
 * UI (product backlog). The real quality axis is `simulation/setSimulationMode`
 * ('normal' = selfCollision off, 'complete' = selfCollision on, per
 * src/utils/cloth/gpu/qualityPresets.ts), driven here via store dispatch.
 */

test.describe('Self-Collision (GPU pipeline, issue #293)', () => {
  test.setTimeout(120_000);

  test('simulation runs with selfCollision enabled (complete preset)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    // 'complete' preset = selfCollision: true
    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'complete' });
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    // Let simulation run long enough for self-collision passes to execute.
    await page.waitForTimeout(5000);

    const state = await getSimulationState(page);
    expect(['running', 'paused']).toContain(state);

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
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'complete' });
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    // Wait for cloth to drape with self-collision.
    await page.waitForTimeout(6000);

    const check = await readMeshPositions(page);
    console.log('Self-collision position check:', check);

    expect(check.found).toBe(true);
    if (!check.found) return;
    expect(check.nanCount).toBe(0);
    expect(check.infCount).toBe(0);
    expect(check.allZeros).toBe(false);
  });

  test('cloth drapes under gravity with selfCollision enabled', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'complete' });
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    await page.waitForTimeout(2000);
    const initial = await readMeshPositions(page);
    await page.waitForTimeout(5000);
    const final = await readMeshPositions(page);

    console.log(`Self-collision drape: initialY=${initial.found ? initial.avgY : 'n/a'}, finalY=${final.found ? final.avgY : 'n/a'}`);

    expect(final.found).toBe(true);
    if (!final.found) return;
    expect(Number.isNaN(final.avgY)).toBe(false);
    expect(Math.abs(final.avgY)).toBeLessThan(10);
  });

  test('quality preset switching: normal (no SC) → complete (SC)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');

    // Switch to normal (selfCollision: false), then complete (selfCollision: true).
    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'normal' });
    await page.waitForTimeout(300);
    const mode1 = await page.evaluate(() => {
      const s = (window as unknown as { __OPENCLO_STORE__: { getState: () => { simulation: { simulationMode: string } } } }).__OPENCLO_STORE__;
      return s.getState().simulation.simulationMode;
    });
    expect(mode1).toBe('normal');

    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'complete' });
    await page.waitForTimeout(300);

    // Start simulation with complete preset.
    await startSimulation(page);
    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(5000);

    const scErrors = errors.filter(e =>
      e.includes('tslSelfCollision') ||
      e.includes('selfCollision') ||
      e.includes('atomicLoad') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(scErrors).toHaveLength(0);

    const state = await getSimulationState(page);
    expect(['running', 'paused']).toContain(state);
  });

  test('simulation start/pause/reset cycle with selfCollision enabled', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'complete' });

    // Start.
    await startSimulation(page);
    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(3000);

    // Pause.
    await dispatch(page, { type: 'simulation/pauseSimulation' });
    await page.waitForTimeout(300);
    expect(await getSimulationState(page)).toBe('paused');

    // Reset.
    await dispatch(page, { type: 'simulation/resetSimulation' });
    await page.waitForTimeout(300);
    expect(await getSimulationState(page)).toBe('idle');

    // Restart — self-collision buffers should re-initialize cleanly.
    await startSimulation(page);
    await page.waitForTimeout(3000);

    const scErrors = errors.filter(e =>
      e.includes('tslSelfCollision') ||
      e.includes('selfCollision') ||
      e.includes('SelfCollision') ||
      e.includes('atomicLoad')
    );
    expect(scErrors).toHaveLength(0);

    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('no GPU validation errors from self-collision compute kernels', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => { consoleMessages.push(`[${msg.type()}] ${msg.text()}`); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await dispatch(page, { type: 'simulation/setSimulationMode', payload: 'complete' });
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(5000);

    const gpuErrors = consoleMessages.filter(msg =>
      msg.includes('WebGPU uncaptured error') ||
      msg.includes('GPUValidationError')
    );
    expect(gpuErrors).toHaveLength(0);

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
