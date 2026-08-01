/**
 * D12 del pivote workflow (acta 2026-07-03 §5) — la pasada María-VÍA-FLUJO
 * @gpu-local (maintainer-run): valida el pipeline del contrato de colocación
 * end-to-end: binding escrito → preview resuelto → seed de la sim → drape
 * sano (≥ al del auto-flow en los mismos checkpoints del gate M4).
 *
 * El click de UI (pieza → anchor) está cubierto por unit tests
 * (anchorClick.test.ts) + la validación manual de Samuel (kill-switch
 * 17-jul); aquí el binding se despacha directo al store — lo que este spec
 * pinea es que UN BINDING REAL atraviesa resolveArrangement → wrap frame →
 * solver seed → drape, no la mecánica del mouse.
 *
 * Correr: npx playwright test --config playwright.webgpu.config.ts arrangement-flow
 */
import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation } from './helpers/sim';

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

test('arrangement flow: binding → preview → seed → drape @gpu-local', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'true'));
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __VINA_STORE__?: unknown }).__VINA_STORE__),
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
  await expect
    .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, { timeout: 30_000 })
    .toBe(5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.getByText('Coser piezas automáticamente', { exact: false }).first().click();
  await expect
    .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(6);
  await switchView(page, '3D');

  // ── El flujo: binding frame-delta sobre la pieza frontal (bajarla 4cm a lo
  // largo del tangent del frame — el gesto "click en el anillo de cintura").
  // Se despacha por el MISMO reducer que el click del humano y el tool del
  // agente usan (setArrangementBinding — una autoridad, un esquema).
  const bound = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const store = w.__VINA_STORE__;
    const pieces = store.getState().project.pieces as Array<{ id: string; name: string; category?: string; side?: string }>;
    // Clasificación real: category ('bodice'...) + side ('front'/'back'). Los
    // nombres del DXF son técnicos. Fallback: el bodice más ancho (el torso).
    const front = pieces.find((p) => p.category === 'bodice' && p.side === 'front')
      ?? pieces.find((p) => p.category === 'bodice')
      ?? pieces.find((p) => /front/i.test(p.name));
    if (!front) return null;
    store.dispatch({
      type: 'project/setArrangementBinding',
      payload: {
        pieceId: front.id,
        binding: {
          space: 'frame',
          posDelta: [0, 0, -0.04], // 4cm hacia abajo a lo largo del tangent (frame torso: t = +Y)
          rotDelta: [0, 0, 0, 1],
          anchorId: 'front-torso.ring1.front', // proveniencia estilo click de cintura
        },
      },
    });
    return front.id;
  });
  expect(bound, 'Front piece not found').not.toBeNull();

  // El override quedó en el store como binding (no V3).
  const stored = await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return w.__VINA_STORE__.getState().project.arrangementOverrides[id];
  }, bound!);
  expect(stored?.space).toBe('frame');
  expect(stored?.anchorId).toBe('front-torso.ring1.front');

  // ── Simular desde el binding: mismo boot de ventanas que el gate M4.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const store = w.__VINA_STORE__ as {
      getState: () => { simulation: { frameTimeMs: number } };
      subscribe: (f: () => void) => void;
    };
    let last = store.getState().simulation.frameTimeMs;
    let windows = 0;
    w.__SIM_WINDOWS__ = 0;
    store.subscribe(() => {
      const v = store.getState().simulation.frameTimeMs;
      if (v !== last) {
        last = v;
        if (v > 0) w.__SIM_WINDOWS__ = ++windows;
      }
    });
  });
  await startSimulation(page);
  await expect
    .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
    .toBe('webgpu');

  await page.waitForFunction(
    (min) => ((window as unknown as { __SIM_WINDOWS__?: number }).__SIM_WINDOWS__ ?? 0) >= min,
    5,
    { timeout: 60_000 },
  ); // t≈2.5s — el checkpoint M4

  const drape = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesh = (window as any).__VINA_CLOTH_MESH__;
    if (!mesh) return null;
    const pos = mesh.geometry.attributes.position;
    let nan = 0, belowHip = 0, sleeve = 0;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (Number.isNaN(y)) { nan++; continue; }
      if (y < 0.8) belowHip++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (Math.abs(pos.getX(i)) > 0.25) sleeve++;
    }
    return { nan, belowHipPct: (belowHip / pos.count) * 100, minY, maxY, sleeve };
  });
  console.log(
    `[arrangement-flow] t=2.5s belowHip=${drape?.belowHipPct.toFixed(2)} minY=${drape?.minY.toFixed(3)} maxY=${drape?.maxY.toFixed(3)} sleeve=${drape?.sleeve} nan=${drape?.nan} (barras del gate M4: belowHip≤0.5%, sleeve≥50, nan=0)`,
  );
  expect(drape).not.toBeNull();
  // El drape desde el binding cumple las MISMAS barras que el auto-flow.
  expect(drape!.nan).toBe(0);
  expect(drape!.belowHipPct).toBeLessThanOrEqual(0.5);
  expect(drape!.sleeve).toBeGreaterThanOrEqual(50);
});
