import { test, expect } from '@playwright/test';
import {
  waitForApp, addRectanglePiece, switchView, startSimulation,
  waitForClothMesh, getSimulationState,
} from './helpers/sim';

/**
 * E2E tests for mesh grab tool (PR #312, issue #135).
 *
 * Verifies:
 * 1. Mesh grab Redux state has correct defaults.
 * 2. Tool activates via keyboard shortcut ('o') in 3D context.
 * 3. Redux state updates / clamps via dispatch.
 * 4. Simulation runs with grab tool active — no errors.
 *
 * Setup retargeted (2026-06-04): store handle fixed from `__REDUX_STORE__`
 * (never exposed) to `__VINA_STORE__`; defaults aligned to the live slice
 * (src/store/simulationSlice.ts: radius 0.08, strength 0.6 — the old spec's
 * 0.05/0.8 was stale); the 'o' shortcut maps to `tool3d.meshGrab` which only
 * resolves in the 3D shortcut context, so we focus an element inside
 * `.canvas-area__3d` (carrying `data-shortcut-context="3d"`) before pressing.
 */

test.describe('Mesh Grab Tool (issue #135)', () => {
  test.setTimeout(120_000);

  test('mesh grab Redux state has correct defaults', async ({ page }) => {
    await waitForApp(page);
    const state = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => { simulation: { meshGrab: unknown } } } }).__VINA_STORE__;
      return s.getState().simulation.meshGrab;
    });
    expect(state).toEqual({ active: false, radius: 0.08, strength: 0.6 });
  });

  test('mesh grab tool activates via shortcut key', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');

    await page.locator('nav[aria-label="Herramientas del 3D"] [aria-label="Avatar"]').focus();
    await page.keyboard.press('o');
    await page.waitForTimeout(300);

    const activeTool = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => { tools: { activeTool3D: string } } } }).__VINA_STORE__;
      return s.getState().tools.activeTool3D;
    });
    expect(activeTool).toBe('meshGrab');
  });

  test('mesh grab state updates via Redux dispatch', async ({ page }) => {
    await waitForApp(page);
    const updated = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: {
        dispatch: (a: unknown) => void;
        getState: () => { simulation: { meshGrab: { radius: number; strength: number; active: boolean } } };
      } }).__VINA_STORE__;
      s.dispatch({ type: 'simulation/setMeshGrabRadius', payload: 0.1 });
      s.dispatch({ type: 'simulation/setMeshGrabStrength', payload: 0.5 });
      s.dispatch({ type: 'simulation/setMeshGrabActive', payload: true });
      return s.getState().simulation.meshGrab;
    });
    expect(updated.radius).toBe(0.1);
    expect(updated.strength).toBe(0.5);
    expect(updated.active).toBe(true);
  });

  test('mesh grab clamping works via Redux', async ({ page }) => {
    await waitForApp(page);
    const clamped = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: {
        dispatch: (a: unknown) => void;
        getState: () => { simulation: { meshGrab: { radius: number; strength: number } } };
      } }).__VINA_STORE__;
      s.dispatch({ type: 'simulation/setMeshGrabRadius', payload: 0 });
      const r1 = s.getState().simulation.meshGrab.radius;
      s.dispatch({ type: 'simulation/setMeshGrabRadius', payload: 2 });
      const r2 = s.getState().simulation.meshGrab.radius;
      s.dispatch({ type: 'simulation/setMeshGrabStrength', payload: -1 });
      const s1 = s.getState().simulation.meshGrab.strength;
      s.dispatch({ type: 'simulation/setMeshGrabStrength', payload: 5 });
      const s2 = s.getState().simulation.meshGrab.strength;
      return { r1, r2, s1, s2 };
    });
    expect(clamped.r1).toBe(0.01);
    expect(clamped.r2).toBe(0.5);
    expect(clamped.s1).toBe(0);
    expect(clamped.s2).toBe(1);
  });

  test('simulation runs with mesh grab active — no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    await page.locator('nav[aria-label="Herramientas del 3D"] [aria-label="Avatar"]').focus();
    await page.keyboard.press('o');
    await page.waitForTimeout(500);

    await page.waitForTimeout(3000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const grabErrors = errors.filter(e =>
      e.includes('meshGrab') ||
      e.includes('grabDragging') ||
      e.includes('makeGrabComputeNode') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(grabErrors).toHaveLength(0);
  });
});
