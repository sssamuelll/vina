/**
 * F0 (#897): baseline de perf con el patrón real de María, GPU real (config
 * webgpu, sin SwiftShader). No asserta umbrales — imprime el baseline.
 * Correr: OPENCLO_PERF=1 npm run test:e2e:gpu -- perf-baseline
 *
 * Mecánica de import/cosido copiada del replay M4 (seam-parity-replay.spec.ts):
 * DXF por file input, Auto-Sew vía ⌘K, tier por defecto 'wasm'.
 */
import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation } from './helpers/sim';

const RUN = process.env.OPENCLO_PERF === '1';
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

async function getState<T = unknown>(page: Page, sel: string): Promise<T> {
  return page.evaluate((p) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    return p
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], store.getState()) as T;
  }, sel) as Promise<T>;
}

test.describe('perf baseline @gpu-local — camisa de María', () => {
  test.skip(!RUN, 'OPENCLO_PERF=1 para correr el baseline');

  test('mide FPS de solver y de render en el tier por defecto', async ({ page }) => {
    test.setTimeout(240_000);

    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __VINA_STORE__?: unknown }).__VINA_STORE__),
      { timeout: 15_000 },
    );
    await page.waitForTimeout(500);

    await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, {
        timeout: 30_000,
      })
      .toBe(5);

    // ⌘K abre el modo commands del UnifiedBar; click en Auto-Sew Pieces.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    await page.getByText('Coser piezas automáticamente', { exact: false }).first().click();
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(6);

    await switchView(page, '3D');
    await startSimulation(page);
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
      .not.toBe('none');
    const tier = await getState<string>(page, 'simulation.solverTier');

    // Acumula cada CAMBIO de frameTimeMs: el store solo publica una vez por
    // ventana de 30 frames (~15s en tiers lentos) — un grid fijo de 500ms
    // re-lee valores stale y la mediana colapsa a una sola ventana.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const store = w.__VINA_STORE__ as {
        getState: () => { simulation: { frameTimeMs: number } };
        subscribe: (f: () => void) => void;
      };
      const samples: number[] = [];
      let last = store.getState().simulation.frameTimeMs;
      store.subscribe(() => {
        const v = store.getState().simulation.frameTimeMs;
        if (v !== last) {
          last = v;
          if (v > 0) samples.push(v);
        }
      });
      w.__PERF_FRAMETIMES__ = samples;
    });
    await page.waitForFunction(
      () =>
        ((window as unknown as { __PERF_FRAMETIMES__?: number[] }).__PERF_FRAMETIMES__?.length ??
          0) >= 4,
      undefined,
      { timeout: 120_000 },
    );
    const [, ...solverSamples] = await page.evaluate(
      () => (window as unknown as { __PERF_FRAMETIMES__: number[] }).__PERF_FRAMETIMES__,
    ); // descarta ventana 1 = arranque frío

    const renderFps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
            else resolve(frames / 5);
          };
          requestAnimationFrame(tick);
        }),
    );
    const particleCount = await getState<number>(page, 'simulation.particleCount');

    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(
      `[perf-baseline] tier=${tier} particles=${particleCount} solverFrameMs(median)=${med(solverSamples)} solverFps=${(1000 / med(solverSamples)).toFixed(1)} renderFps=${renderFps.toFixed(1)}`,
    );
    expect(solverSamples.length).toBeGreaterThan(0);
  });
});
