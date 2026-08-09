/**
 * Simulación de tela — E2E.
 *
 * Reescrito 2026-08-09 (#1009). Los dos tests de este archivo reportaban verde
 * sin asertar nada: corrida real = `2 skipped`.
 *   - "cloth pieces move": nunca sembraba una pieza, así que no había malla que
 *     encontrar y caía en `test.skip('No cloth mesh found — may not have loaded')`.
 *   - "solver tier": leía `window.__REDUX_STORE__`, un global que la app no
 *     expone (el canónico es `__VINA_STORE__`), así que siempre daba null y
 *     caía en `test.skip('Redux store not exposed')`. Es el mismo error que ya
 *     estaba corregido en mesh-grab y steam-brush y advertido en helpers/sim.ts:14.
 *
 * Ahora el setup usa los helpers del cluster de simulación y la ausencia de
 * malla es un fallo duro, no un skip: si la sim no arranca, esto se pone rojo.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  waitForApp,
  addRectanglePiece,
  switchView,
  startSimulation,
  waitForClothMesh,
  getSolverTier,
} from './helpers/sim';

/** Primeros 30 valores del atributo position — sensible a cualquier vértice que se mueva. */
async function clothPositions(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const mesh = (window as unknown as { __VINA_CLOTH_MESH__?: {
      geometry?: { getAttribute(n: string): { array: ArrayLike<number> } | null };
    } }).__VINA_CLOTH_MESH__;
    const pos = mesh?.geometry?.getAttribute('position');
    if (!pos) return null;
    return Array.from(pos.array).slice(0, 30);
  });
}

test.describe('Cloth Simulation', () => {
  test.setTimeout(120_000);

  test('cloth pieces move after simulation starts', async ({ page }) => {
    await waitForApp(page);
    await addRectanglePiece(page, 'Panel');
    await switchView(page, '3D');
    await startSimulation(page);

    expect(await waitForClothMesh(page, 40_000), 'la malla de tela nunca apareció tras arrancar la sim').toBe(true);

    const before = await clothPositions(page);
    expect(before, 'atributo position ausente en la malla').not.toBeNull();

    // La gravedad sola tiene que mover vértices. Poll en vez de espera fija:
    // el primer frame de física puede tardar según el tier que resuelva.
    await expect.poll(
      async () => {
        const after = await clothPositions(page);
        if (!after) return -1;
        return before!.reduce((acc, v, i) => acc + Math.abs(after[i] - v), 0);
      },
      { timeout: 30_000, intervals: [1000], message: 'la tela no se movió: el solver no está integrando' },
    ).toBeGreaterThan(0.01);
  });

  test('solver tier is reported in redux state', async ({ page }) => {
    await waitForApp(page);
    await switchView(page, '3D');

    // Antes de arrancar no hay solver montado.
    expect(await getSolverTier(page)).toBe('none');
  });
});
