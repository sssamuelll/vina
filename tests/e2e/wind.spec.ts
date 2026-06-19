import { test, expect } from '@playwright/test';
import {
  waitForApp, addRectanglePiece, switchView, startSimulation,
  waitForClothMesh, readMeshPositions, getSimulationState, getSolverTier, dispatch,
} from './helpers/sim';

/**
 * E2E tests for wind force feature (PR #301, issue #241) — ENGINE LEVEL.
 *
 * Wind UI is product backlog: the current shell has no wind enable checkbox,
 * axis sliders, or drag-coefficient control (those lived in the deleted
 * `.simulation-view` sidebar). The UI-coupled tests ('controls visible',
 * 'checkbox toggling', 'updates via UI') were DELETED in the 2026-06-04
 * retarget. The physics behavior is driven directly via store dispatch
 * (`simulation/setWindEnabled` + `simulation/setWindForce`), which is the
 * real write surface those controls would have used.
 *
 * Note: Playwright headless Chromium uses SwiftShader (no WebGPU), so the GPU
 * wind pipeline falls back to WASM/CPU. These tests verify the wind code
 * doesn't break the fallback path.
 */

test.describe('Wind Force (engine-level, issue #241)', () => {
  test.setTimeout(120_000);

  test('simulation runs with wind enabled — no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');

    // Enable wind with a lateral force before starting.
    await dispatch(page, { type: 'simulation/setWindEnabled', payload: true });
    await dispatch(page, { type: 'simulation/setWindForce', payload: [10, 0, 0] });

    await startSimulation(page);
    expect(await waitForClothMesh(page)).toBe(true);

    await page.waitForTimeout(5000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const windErrors = errors.filter(e =>
      e.includes('tslWind') ||
      e.includes('windForce') ||
      e.includes('setWind') ||
      e.includes('WindGizmo') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(windErrors).toHaveLength(0);
  });

  test('cloth responds to wind force — positions shift under a perpendicular gust', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    // Live wind is applied only by the WASM and WebGPU tiers; the CPU worker
    // (ClothWorkerClient) has no setWind (useSimulationLifecycle.ts:699). Under
    // SwiftShader the GPU tier is unavailable so this normally runs on WASM —
    // but if WASM availability flaps to the CPU tier under load, the dispatched
    // wind is silently ignored. Skip rather than assert a force the tier never
    // applies (a hard zero-displacement flake otherwise).
    const tier = await getSolverTier(page);
    test.skip(tier !== 'wasm' && tier !== 'webgpu', `solver tier '${tier}' does not apply live wind`);

    // Let cloth settle under gravity (no wind yet).
    await page.waitForTimeout(4000);
    const before = await readMeshPositions(page);
    expect(before.found).toBe(true);
    if (!before.found) return;

    // Push wind with a strong component NORMAL to the draped panel. The single
    // unknown rectangle is placed as a vertical front-torso panel (Rx=-π/2), so
    // it lies in the XY plane with its normal ~along ∓Z. A pure lateral +X gust
    // (the old signal) is nearly tangent — dot(wind,normal)≈0 → near-zero force,
    // the flake. We use a Z-dominant gust that hits the face head-on (dot≈1),
    // keeping an X component so it still catches the panel under any resting
    // orientation, and measure displacement in the horizontal plane (X-Z),
    // which is clean of the gravity settle (Y).
    await dispatch(page, { type: 'simulation/setWindEnabled', payload: true });
    await dispatch(page, { type: 'simulation/setWindForce', payload: [20, 0, 30] });

    let shift = 0;
    await expect
      .poll(
        async () => {
          const after = await readMeshPositions(page);
          if (!after.found) return 0;
          shift = Math.hypot(after.avgX - before.avgX, after.avgZ - before.avgZ);
          return shift;
        },
        { timeout: 18_000, intervals: [500, 1000, 1500, 2000] },
      )
      .toBeGreaterThan(0.0005);
    console.log(`Wind horizontal displacement: ${shift.toFixed(4)} m (tier=${tier})`);
  });

  test('no NaN positions with wind active', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');

    await dispatch(page, { type: 'simulation/setWindEnabled', payload: true });
    await dispatch(page, { type: 'simulation/setWindForce', payload: [10, 0, 0] });

    await startSimulation(page);
    expect(await waitForClothMesh(page)).toBe(true);

    await page.waitForTimeout(6000);
    const check = await readMeshPositions(page);
    console.log('Wind position check:', check);

    expect(check.found).toBe(true);
    if (!check.found) return;
    expect(check.nanCount).toBe(0);
    expect(check.infCount).toBe(0);
  });

  test('toggle wind on/off mid-simulation without restart', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);
    await page.waitForTimeout(2000);

    // Enable wind mid-simulation.
    await dispatch(page, { type: 'simulation/setWindEnabled', payload: true });
    await dispatch(page, { type: 'simulation/setWindForce', payload: [12, 0, 0] });
    await page.waitForTimeout(2000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    // Disable wind mid-simulation.
    await dispatch(page, { type: 'simulation/setWindEnabled', payload: false });
    await page.waitForTimeout(2000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    // Re-enable wind.
    await dispatch(page, { type: 'simulation/setWindEnabled', payload: true });
    await page.waitForTimeout(2000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const windErrors = errors.filter(e =>
      e.includes('tslWind') ||
      e.includes('windForce') ||
      e.includes('setWind')
    );
    expect(windErrors).toHaveLength(0);
  });
});
