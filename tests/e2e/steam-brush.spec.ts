import { test, expect } from '@playwright/test';
import {
  waitForApp, addRectanglePiece, switchView, startSimulation,
  waitForClothMesh, getSimulationState,
} from './helpers/sim';

/**
 * E2E tests for steam brush tool (PR #306, issue #303).
 *
 * Verifies:
 * 1. Redux steam brush state has correct defaults.
 * 2. Tool activates via keyboard shortcut ('b') in 3D context.
 * 3. Redux steam brush state updates / clamps via dispatch.
 * 4. Simulation runs while steam brush is active — no errors.
 *
 * Setup retargeted (2026-06-04): store handle is `__VINA_STORE__` (NOT
 * `__REDUX_STORE__`); pieces are dispatched into project state; the sim is
 * started via store dispatch. The 'b' shortcut maps to `tool3d.steamBrush`
 * (src/shortcuts/defaults.ts) which only resolves in the 3D shortcut context —
 * so we focus an element inside `.canvas-area__3d` (which carries
 * `data-shortcut-context="3d"`) before pressing the key. In the unscoped
 * (no-focus) context, 'b' would resolve to the 2D `tool.seam` binding first.
 */

test.describe('Steam Brush Tool (issue #303)', () => {
  test.setTimeout(120_000);

  test('steam brush Redux state has correct defaults', async ({ page }) => {
    await waitForApp(page);
    const state = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => { simulation: { steamBrush: unknown } } } }).__VINA_STORE__;
      return s.getState().simulation.steamBrush;
    });
    expect(state).toEqual({ active: false, radius: 0.05, strength: 0.3 });
  });

  test('steam brush tool activates via shortcut key', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');

    // Focus an element inside the 3D pane so the shortcut resolves to the 3D
    // context (otherwise 'b' hits the 2D seam tool first).
    await page.locator('nav[aria-label="Herramientas del 3D"] [aria-label="Avatar"]').focus();
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    const activeTool = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => { tools: { activeTool3D: string } } } }).__VINA_STORE__;
      return s.getState().tools.activeTool3D;
    });
    expect(activeTool).toBe('steamBrush');
  });

  test('steam brush state updates via Redux dispatch', async ({ page }) => {
    await waitForApp(page);
    const updated = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: {
        dispatch: (a: unknown) => void;
        getState: () => { simulation: { steamBrush: { radius: number; strength: number; active: boolean } } };
      } }).__VINA_STORE__;
      s.dispatch({ type: 'simulation/setSteamBrushRadius', payload: 0.1 });
      s.dispatch({ type: 'simulation/setSteamBrushStrength', payload: 0.8 });
      s.dispatch({ type: 'simulation/setSteamBrushActive', payload: true });
      return s.getState().simulation.steamBrush;
    });
    expect(updated.radius).toBe(0.1);
    expect(updated.strength).toBe(0.8);
    expect(updated.active).toBe(true);
  });

  test('steam brush clamping works via Redux', async ({ page }) => {
    await waitForApp(page);
    const clamped = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: {
        dispatch: (a: unknown) => void;
        getState: () => { simulation: { steamBrush: { radius: number; strength: number } } };
      } }).__VINA_STORE__;
      s.dispatch({ type: 'simulation/setSteamBrushRadius', payload: 0 });
      const r1 = s.getState().simulation.steamBrush.radius;
      s.dispatch({ type: 'simulation/setSteamBrushRadius', payload: 2 });
      const r2 = s.getState().simulation.steamBrush.radius;
      s.dispatch({ type: 'simulation/setSteamBrushStrength', payload: -1 });
      const s1 = s.getState().simulation.steamBrush.strength;
      s.dispatch({ type: 'simulation/setSteamBrushStrength', payload: 5 });
      const s2 = s.getState().simulation.steamBrush.strength;
      return { r1, r2, s1, s2 };
    });
    expect(clamped.r1).toBe(0.01);
    expect(clamped.r2).toBe(0.5);
    expect(clamped.s1).toBe(0);
    expect(clamped.s2).toBe(1);
  });

  test('simulation runs with steam brush active — no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await addRectanglePiece(page);
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page)).toBe(true);

    // Activate steam brush via the 3D shortcut.
    await page.locator('nav[aria-label="Herramientas del 3D"] [aria-label="Avatar"]').focus();
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    await page.waitForTimeout(3000);
    expect(['running', 'paused']).toContain(await getSimulationState(page));

    const brushErrors = errors.filter(e =>
      e.includes('steamBrush') ||
      e.includes('setBrushParams') ||
      e.includes('brushDragging') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(brushErrors).toHaveLength(0);
  });
});
