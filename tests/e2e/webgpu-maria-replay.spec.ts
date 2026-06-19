/**
 * F4 (#897): replay del DoD de la camisa de María en el tier webgpu (TSL).
 * Es el replay M4 (seam-parity-replay.spec.ts) corriendo sobre GPU real:
 * mismos umbrales de drape, tier 'webgpu' en vez de 'wasm', más el DoD de
 * la épica — ≥30fps sostenidos o nadie usa la herramienta.
 *
 * ANCLAJE A TIEMPO DE SIMULACIÓN, no de pared (F4.3e). En este tier el
 * tiempo de sim = framesRenderizados/60 (dt fijo por useFrame), así que
 * "esperar 25s de pared" mide una cantidad de física que depende de los
 * fps: el replay M4 WASM a ~1.4fps de solver simulaba ~0.6s; el pase GPU
 * de F2.6 a ~5fps, ~2s; a los ~31fps actuales serían ~13s. Toda la
 * verificación histórica del estándar M4 quedó a ≤2.5s de SIM — ese es el
 * checkpoint real del estándar (la prenda asentada tras cerrar costuras),
 * y ahí se ancla el assert: 150 frames acumulados = 2.5s de sim. El creep
 * lento (#902) se ARREGLÓ con stiction de Coulomb; a 10s de sim hay una red
 * de regresión con banda de tolerancia relativa al checkpoint de 2.5s (#912).
 *
 * Correr: npm run test:e2e:gpu -- webgpu-maria-replay
 * (config webgpu: headed, GPU real, sin SwiftShader; @gpu-local ⇒ CI nunca
 * lo corre — el config base no incluye el grep y CI no tiene GPU). A
 * diferencia de perf-baseline NO hay gate por env var: este replay es el
 * DoD de la épica y se auto-selecciona vía el grep @gpu-local.
 *
 * Dos tests deliberadamente separados (flujo completo duplicado):
 *  1. drape M4 — corrección física en el tier webgpu, al checkpoint M4.
 *  2. ≥30fps — el assert de perf AISLADO, para que un fallo de perf no
 *     enmascare el veredicto de drape (y viceversa). Sin test.fail().
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
    const store = (window as unknown as Record<string, unknown>).__OPENCLO_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    return p
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], store.getState()) as T;
  }, sel) as Promise<T>;
}

/**
 * Flujo compartido: opt-in WebGPU → import DXF → ⌘K Auto-Sew → 3D →
 * simular → tier webgpu confirmado. Mecánica copiada de perf-baseline.
 */
async function importSewAndSimulate(page: Page) {
  // F4.1: el bypass fue eliminado y la capability está flipped — el único
  // switch es el opt-in de usuario, y debe existir ANTES de cargar la app.
  await page.addInitScript(() => localStorage.setItem('openclo-use-webgpu', 'true'));

  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__),
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
  await page.getByText('Auto-Sew Pieces', { exact: false }).first().click();
  await expect
    .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(6);

  await switchView(page, '3D');

  // Contador de ventanas de frames ANTES de arrancar la sim, para no perder
  // la ventana 1. El store publica frameTimeMs una vez cada 30 frames
  // renderizados (useSimulationLifecycle) ⇒ ventanas×30 = frames acumulados
  // = tiempo de sim×60. Cuenta por CAMBIO de valor (mismo muestreo que el
  // test de fps): dos ventanas consecutivas con la misma media redondeada
  // se perderían — sesgo conservador, el checkpoint solo puede caer MÁS
  // TARDE (nunca antes) del tiempo de sim nominal.
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
}

/** Espera hasta acumular ≥`windows` ventanas de 30 frames (0.5s de sim c/u). */
async function waitForSimWindows(page: Page, windows: number, timeout: number) {
  await page.waitForFunction(
    (min) =>
      ((window as unknown as { __SIM_WINDOWS__?: number }).__SIM_WINDOWS__ ?? 0) >= min,
    windows,
    { timeout },
  );
}

/** Métricas de drape M4 sobre el mesh de tela (mismas que el replay WASM). */
async function readDrape(page: Page) {
  return page.evaluate(() => {
    const mesh = (window as unknown as { __OPENCLO_CLOTH_MESH__?: {
      geometry: { attributes: { position: { count: number; getY: (i: number) => number } } };
    } }).__OPENCLO_CLOTH_MESH__;
    if (!mesh) return null;
    const pos = mesh.geometry.attributes.position;
    const n = pos.count;
    let belowHip = 0;
    let nan = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      if (Number.isNaN(y)) { nan++; continue; }
      if (y < 0.8) belowHip++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { n, nan, belowHipPct: (belowHip / n) * 100, minY, maxY };
  });
}

test.describe('WebGPU María replay @gpu-local — DoD #897 (F4)', () => {
  test('drape M4 en tier webgpu', async ({ page }) => {
    test.setTimeout(240_000);
    await importSewAndSimulate(page);

    // La colisión del avatar DEBE estar cargada (mismo pin que el replay
    // M4: la extracción degrada en silencio si su timeout vence).
    await expect
      .poll(async () => getState<boolean>(page, 'simulation.bodyCollision'), { timeout: 30_000 })
      .toBe(true);

    // #895: las CINCO piezas malladas (~29.3k partículas a 5mm).
    expect(await getState<number>(page, 'simulation.particleCount')).toBeGreaterThan(25_000);

    // Costuras resueltas EN el tier GPU: >300 constraints reales (paridad
    // F1.3 — el empaquetado LOCAL→GLOBAL) y ninguna costura a cero.
    const resolution = await getState<{
      totalConstraints: number;
      zeroConstraintSeams: unknown[];
    }>(page, 'simulation.seamResolution');
    expect(resolution!.totalConstraints).toBeGreaterThan(300);
    expect(resolution!.zeroConstraintSeams).toHaveLength(0);

    // Checkpoint M4: 150 frames acumulados = 2.5s de SIMULACIÓN — la región
    // que el estándar M4 verificó de verdad (costuras cerradas, prenda
    // asentada). Ver el bloque de cabecera: 25s de pared era fps-confundido.
    await waitForSimWindows(page, 5, 120_000);
    const drape = await readDrape(page);

    expect(drape).not.toBeNull();
    expect(drape!.nan).toBe(0);
    // Anti-colapso: la maraña/blob ponía la prenda entera en el suelo.
    expect(drape!.belowHipPct).toBeLessThan(5);
    // El hem queda en la cadera (~0.88) — nada cuelga hacia el suelo.
    expect(drape!.minY).toBeGreaterThan(0.5);
    // Los hombros siguen arriba: la prenda no se escurrió entera.
    expect(drape!.maxY).toBeGreaterThan(1.3);
    console.log(
      `[drape-m4] simSeconds=2.5 belowHipPct=${drape!.belowHipPct.toFixed(2)} minY=${drape!.minY.toFixed(3)} maxY=${drape!.maxY.toFixed(3)} nan=${drape!.nan}`,
    );

    // Largo horizonte (600 frames = 10s de sim): RED DE REGRESIÓN del fix de
    // stiction (#902 / #912). Banda de tolerancia relativa al checkpoint M4 de
    // 2.5s (`drape`): la prenda asentada NO debe degradarse a 10s. Banda (no
    // umbral absoluto) para sobrevivir el caos de float run-to-run en la
    // selección de triángulo de contacto.
    await waitForSimWindows(page, 20, 120_000);
    const creep = await readDrape(page);
    console.log(
      `[creep-watch] simSeconds=10 belowHipPct=${creep!.belowHipPct.toFixed(2)} minY=${creep!.minY.toFixed(3)} maxY=${creep!.maxY.toFixed(3)} nan=${creep!.nan} (issue #902)`,
    );
    expect(creep).not.toBeNull();
    expect(creep!.nan).toBe(0);
    expect(creep!.belowHipPct).toBeLessThanOrEqual(drape!.belowHipPct + 3);
    expect(creep!.minY).toBeGreaterThanOrEqual(drape!.minY - 0.1);
    expect(creep!.maxY).toBeGreaterThan(1.3);
  });

  test('DoD #897: ≥30fps sostenidos', async ({ page }) => {
    test.setTimeout(300_000);
    await importSewAndSimulate(page);

    // Acumula cada CAMBIO de frameTimeMs (el store publica una vez por
    // ventana de 30 frames) — mismo muestreo que perf-baseline para que
    // los números sean conmensurables con el baseline F0.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const store = w.__OPENCLO_STORE__ as {
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
    const [, ...samples] = await page.evaluate(
      () => (window as unknown as { __PERF_FRAMETIMES__: number[] }).__PERF_FRAMETIMES__,
    ); // descarta ventana 1 = arranque frío

    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const medianMs = med(samples);
    console.log(
      `[webgpu-maria-replay] solverFrameMs(median)=${medianMs.toFixed(1)} fps=${(1000 / medianMs).toFixed(1)} windows=${samples.length}`,
    );
    // El DoD de la épica. Hoy (F4.3a) se espera que falle — sin test.fail():
    // el rojo es la evidencia, y se pone verde cuando la épica cierra.
    expect(1000 / medianMs).toBeGreaterThanOrEqual(30);
  });
});
