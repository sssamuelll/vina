/**
 * Caja negra 3D — la puerta, no solo el cuarto.
 *
 * Plan: docs/plans/2026-08-28-caja-negra-telemetria-3d.md § 5, escenarios
 * 1, 2 y 5. Simular y exportar el diagnóstico por la misma puerta que usa
 * María (menú Vina ▸ Archivo ▸ Exportar diagnóstico) tiene que producir un
 * JSON que cuente la cascada, la config que el solver recibió y una foto
 * física cuyo conteo cuadra con el manifiesto por pieza.
 *
 * Primer e2e del repo que intercepta una descarga: queda como patrón.
 * Los eventos del menú van por `dispatchEvent` y no por `hover`/`click`:
 * con el tier CPU a ~9 fps las comprobaciones de estabilidad del locator
 * tardan más que el presupuesto del test.
 */
import { test, expect, type Page } from '@playwright/test';
import { addRectanglePiece, waitForApp } from './helpers/sim';
import { exportBundle as exportBundleRaw } from './helpers/diagnostico';

interface SolverEventLike {
  kind: string;
  generation: number;
  data: { tier?: string; reason?: string };
}

interface BundleLike {
  solver: {
    activeTier: string;
    events: SolverEventLike[];
    appliedConfig: { tier: string; init: Record<string, unknown>; postInit: Record<string, unknown> } | null;
    meshManifest: Array<{ pieceId: string; vertexCount: number; vertexOffset: number }> | null;
    clothSnapshot: { vertexCount: number; positions: string | null; positionsOmitted: boolean; manifestMismatch: boolean } | null;
  };
}

type StoreWindow = {
  __VINA_STORE__: {
    dispatch: (a: unknown) => void;
    getState: () => { simulation: { solverTier: string; frameTimeMs: number } };
  };
};

const dispatch = (page: Page, type: string, payload?: unknown) =>
  page.evaluate(([t, p]) => {
    (window as unknown as StoreWindow).__VINA_STORE__.dispatch({ type: t, payload: p });
  }, [type, payload] as const);

const solverTier = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().simulation.solverTier);

/** El solver arrancó de verdad: hay frames medidos, no solo un tier elegido. */
const waitForFrames = (page: Page) =>
  expect.poll(
    () => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().simulation.frameTimeMs),
    { timeout: 90_000 },
  ).toBeGreaterThan(0);

async function enter3DAndStart(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForSelector('canvas', { state: 'visible', timeout: 60_000 });
  await dispatch(page, 'simulation/setViewMode3D', 'simulate');
  await dispatch(page, 'simulation/startSimulation');
}

/** Mecanismo (menú por dispatchEvent + waitForEvent('download')) vive en el helper; aquí solo se recupera el tipo local. */
async function exportBundle(page: Page): Promise<BundleLike> {
  return (await exportBundleRaw(page)) as unknown as BundleLike;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
});

test('escenario 1: flag apagado — el bundle cuenta la cascada, la config y trae la foto', async ({ page }) => {
  test.setTimeout(180_000);
  await waitForApp(page);
  await addRectanglePiece(page, 'Panel');
  await enter3DAndStart(page);
  await expect.poll(() => solverTier(page), { timeout: 60_000 }).toBe('wasm');
  await waitForFrames(page);

  const bundle = await exportBundle(page);

  const kinds = bundle.solver.events.map(e => [e.kind, e.data.tier, e.data.reason]);
  expect(kinds).toContainEqual(['tier:skipped', 'webgpu', 'flag-off']);
  expect(kinds).toContainEqual(['tier:selected', 'wasm', undefined]);
  expect(bundle.solver.activeTier).toBe('wasm');
  expect(bundle.solver.appliedConfig?.tier).toBe('wasm');
  expect(bundle.solver.appliedConfig?.init).toHaveProperty('substeps');

  const manifest = bundle.solver.meshManifest!;
  const snapshot = bundle.solver.clothSnapshot!;
  expect(manifest.length).toBeGreaterThan(0);
  expect(snapshot.positionsOmitted).toBe(false);
  expect(snapshot.manifestMismatch).toBe(false);
  expect(snapshot.vertexCount).toBe(manifest.reduce((s, m) => s + m.vertexCount, 0));
  expect(snapshot.positions!.length).toBeGreaterThan(0);
});

test('escenario 2: con el binario WASM bloqueado, el bundle dice tier:failed{wasm} y cae a CPU', async ({ page }) => {
  // La cascada entera (detección WASM fallida + init del worker CPU) tarda
  // más que el timeout por defecto de un test.
  test.setTimeout(180_000);
  // El cliente añade `?v=<build>` al binario: un glob sin query no lo pilla.
  await page.route(/xpbd_wasm_bg\.wasm/, route => route.abort());
  await waitForApp(page);
  await addRectanglePiece(page, 'Panel');
  await enter3DAndStart(page);
  await expect.poll(() => solverTier(page), { timeout: 60_000 }).toBe('cpu-worker');
  await waitForFrames(page);

  const bundle = await exportBundle(page);

  const kinds = bundle.solver.events.map(e => [e.kind, e.data.tier]);
  expect(kinds).toContainEqual(['tier:failed', 'wasm']);
  expect(kinds).toContainEqual(['tier:selected', 'cpu-worker']);
  expect(bundle.solver.activeTier).toBe('cpu-worker');
  expect(bundle.solver.appliedConfig?.tier).toBe('cpu-worker');
});

test('escenario 5: Stop→Play deja dos corridas con generaciones distintas y la última viva', async ({ page }) => {
  test.setTimeout(180_000);
  await waitForApp(page);
  await addRectanglePiece(page, 'Panel');
  await enter3DAndStart(page);
  // La primera corrida eligió tier (su init puede seguir en vuelo).
  await expect.poll(() => solverTier(page), { timeout: 60_000 }).toBe('wasm');
  // Stop→Play en ticks distintos: en el mismo tick React batchea los dos
  // dispatches y el efecto de la cascada solo vería el estado final. Stop es
  // «Restablecer» (idle): pausar ya no suelta el solver ni abre otra corrida.
  await dispatch(page, 'simulation/resetSimulation');
  await page.waitForTimeout(200);
  await dispatch(page, 'simulation/startSimulation');
  await waitForFrames(page);

  const bundle = await exportBundle(page);

  const starts = bundle.solver.events.filter(e => e.kind === 'cascade:start');
  expect(starts.length).toBeGreaterThanOrEqual(2);
  expect(new Set(starts.map(e => e.generation)).size).toBe(starts.length);
  const lastSelected = bundle.solver.events.filter(e => e.kind === 'tier:selected').at(-1)!;
  expect(lastSelected.generation).toBe(Math.max(...starts.map(e => e.generation)));
  expect(bundle.solver.activeTier).toBe('wasm');
});
