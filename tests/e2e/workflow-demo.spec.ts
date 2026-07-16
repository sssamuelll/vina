/**
 * Workflow demo @gpu-local (maintainer-run) — recorre la operación COMPLETA
 * del flujo CLO3D-style y captura una imagen por etapa en .tmp/flow-demo/:
 *
 *   01 hilos de costura (abanicos range-aware, pre-sim)
 *   01b hilos a 3/4 — el cosido del TORSO (hombros/costados front↔back) es
 *       invisible de frente; esta vista lo hace legible (bloque cosido
 *       María-style, plan §6bis)
 *   02 modo arrange: anchor points horneados sobre María
 *   03 pieza seleccionada: gizmo anclado + anchors del namespace destacados
 *   04 pieza re-colocada vía binding (el gesto click-pieza→click-punto)
 *   05 rango de costura parcial (los hilos muestran "cuánto se cose")
 *   06 drape a 2.5s (checkpoint M4) · 07 drape a 10s
 *
 * No es un gate (no asserts de forma más allá de sanidad): es la cámara del
 * flujo — para revisar visualmente el estado del workflow desde cualquier
 * lado (nació de Samuel revisando en remoto desde el teléfono, 2026-07-04).
 *
 * Correr: npx playwright test --config playwright.webgpu.config.ts workflow-demo
 */
import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation } from './helpers/sim';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.tmp/flow-demo');

async function getState<T = unknown>(page: Page, sel: string): Promise<T> {
  return page.evaluate((p) => {
    const store = (window as unknown as Record<string, unknown>).__OPENCLO_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    return p
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], store.getState()) as T;
  }, sel) as Promise<T>;
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT_DIR, name) });

test('workflow demo: capturas de toda la operación @gpu-local', async ({ page }) => {
  // HOLD_OPEN alarga el límite del test para que el waitForTimeout de 10 min
  // (inspección manual, ver el final) no lo mate antes.
  test.setTimeout(process.env.HOLD_OPEN ? 900_000 : 300_000);
  mkdirSync(OUT_DIR, { recursive: true });
  // CROSSBEND=off — A/B del kill-switch del bend cross-seam (acta costura-real).
  await page.addInitScript((crossbendOff) => {
    localStorage.setItem('openclo-use-webgpu', 'true');
    if (crossbendOff) localStorage.setItem('openclo-crossbend', 'off');
  }, process.env.CROSSBEND === 'off');
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__),
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);

  // ── Import + auto-sew (el arranque del flujo)
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
  await page.waitForTimeout(3500); // avatar + piezas envueltas + hilos

  // 01 — hilos de costura (showSeamlines3D es default ON)
  await shot(page, '01-hilos-costura.png');

  // Helper de orbit (RIGHT-drag = ROTATE; LEFT/MIDDLE deshabilitados,
  // estilo CLO3D). OJO: el damping de OrbitControls hace que orbitar "de
  // vuelta" con el mouse NUNCA regrese exacto — el ángulo derivaba capturas
  // enteras (cenitales/traseras). El regreso a frontal es DETERMINISTA:
  // dispatch camera/setCameraPreset('front') (useCameraPresets anima al
  // preset y termina exacto).
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const orbit = async (dx: number) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx + dx, cy, { steps: 12 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(600); // damping settle
  };
  const resetToFront = async () => {
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__OPENCLO_STORE__.dispatch({ type: 'camera/setCameraPreset', payload: 'front' });
    });
    await page.waitForTimeout(1200); // animación del preset
  };

  // 01b — hilos a 3/4 (los del torso: hombros/costados) y regreso exacto.
  await orbit(-90);
  await shot(page, '01b-hilos-3cuartos.png');
  await resetToFront();

  // 02 — modo arrange: anchor points horneados (bake async → espera)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__OPENCLO_STORE__.dispatch({ type: 'tools/setActiveTool3D', payload: 'arrangement' });
  });
  await page.waitForTimeout(3000);
  await shot(page, '02-arrange-anchors.png');

  // 03 — pieza seleccionada: gizmo anclado a la pieza + namespace destacado
  const frontId = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__OPENCLO_STORE__;
    const pieces = store.getState().project.pieces as Array<{ id: string; category?: string; side?: string; name: string }>;
    const front = pieces.find((p) => p.category === 'bodice' && p.side === 'front')
      ?? pieces.find((p) => p.category === 'bodice');
    if (!front) return null;
    store.dispatch({ type: 'editor/selectPiece', payload: front.id });
    return front.id;
  });
  expect(frontId, 'front bodice not found').not.toBeNull();
  await page.waitForTimeout(800);
  await shot(page, '03-pieza-gizmo-anchors.png');

  // 04 — el gesto del flujo: binding (click-pieza→click-punto) → re-colocación
  await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__OPENCLO_STORE__.dispatch({
      type: 'project/setArrangementBinding',
      payload: {
        pieceId: id,
        binding: {
          space: 'frame',
          posDelta: [0, 0, -0.05],
          rotDelta: [0, 0, 0, 1],
          anchorId: 'front-torso.ring1.front',
        },
      },
    });
  }, frontId!);
  await page.waitForTimeout(800);
  await shot(page, '04-pieza-recolocada.png');
  // Volver al auto (el demo del drape usa la colocación limpia)
  await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__OPENCLO_STORE__.dispatch({ type: 'project/clearArrangementOverride', payload: id });
  }, frontId!);

  // 05 — rango parcial de costura: los hilos muestran CUÁNTO se cose
  const seamSnapshot = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__OPENCLO_STORE__;
    const seams = store.getState().project.seams as Array<Record<string, unknown>>;
    if (!seams.length) return null;
    const s = JSON.parse(JSON.stringify(seams[0]));
    const edited = JSON.parse(JSON.stringify(s));
    edited.pieceA = { ...edited.pieceA, tStart: 0.15, tEnd: 0.85 };
    edited.pieceB = { ...edited.pieceB, tStart: 0.15, tEnd: 0.85 };
    store.dispatch({ type: 'project/updateSeam', payload: edited });
    return s;
  });
  expect(seamSnapshot, 'no seams to demo range on').not.toBeNull();
  await page.waitForTimeout(800);
  await shot(page, '05-rango-parcial-hilos.png');
  await page.evaluate((original) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__OPENCLO_STORE__.dispatch({ type: 'project/updateSeam', payload: original });
  }, seamSnapshot!);

  // ── Simular (salir de arrange primero) y capturar el drape
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__OPENCLO_STORE__;
    store.dispatch({ type: 'tools/setActiveTool3D', payload: 'camera' });
    store.dispatch({ type: 'editor/clearSelection' });
  });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const store = w.__OPENCLO_STORE__ as {
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

  const waitWindows = (min: number, timeout: number) =>
    page.waitForFunction(
      (m) => ((window as unknown as { __SIM_WINDOWS__?: number }).__SIM_WINDOWS__ ?? 0) >= m,
      min,
      { timeout },
    );

  await waitWindows(5, 60_000); // ≈2.5s sim — checkpoint M4
  await shot(page, '06-drape-2.5s.png');
  await waitWindows(20, 120_000); // ≈10s sim
  await shot(page, '07-drape-10s.png');

  // 07b — drape a 3/4 (la vista del A/B contra la referencia CLO3D: se lee
  // la unión hombro→manga). Va AL FINAL: después de esto ya no hay capturas
  // frontales que el orbit pueda contaminar.
  await orbit(-90);
  await shot(page, '07b-drape-3cuartos.png');

  // HOLD_OPEN=1: deja la ventana headed abierta al final para inspección
  // manual (Samuel orbita con right-drag y juzga con su ojo — ancla híbrida
  // del 17-jul). Sin el flag el test cierra normal. Regreso a frontal para
  // que arranque en la vista de referencia.
  if (process.env.HOLD_OPEN) {
    await resetToFront();
    console.log('\n[workflow-demo] HOLD_OPEN — ventana abierta 10 min. Right-drag orbita. Ctrl+C para cerrar.\n');
    await page.waitForTimeout(600_000);
  }
});
