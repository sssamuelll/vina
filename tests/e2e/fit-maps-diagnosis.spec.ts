/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation as startSimHelper } from './helpers/sim';

const MARIA_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

/**
 * Diagnóstico #1010 — ¿por qué nadie ha visto un fit map?
 *
 * Corre el MISMO escenario (pieza + simulación + modo strain) en los dos
 * tiers y registra dónde muere el dato, leyendo el global de instrumentación
 * `window.__VINA_FITMAP_DIAG__` (GarmentSimulation.tsx, useFrame).
 *
 * Evidencia estática que este spec vuelve empírica:
 *  - useSimulationLifecycle.ts: `edgeDataRef` solo lo llenan los callbacks
 *    onEdgeData de los clientes WASM (:627) y CPU (:681). La rama TSL nunca
 *    lo toca — en el tier default es null para siempre.
 *  - GarmentSimulation.tsx: la rama TSL del useFrame hace `return` ANTES del
 *    bloque "Fit map overlay (CPU readback path only)".
 *  ⇒ Desde #897 (WebGPU default), los fit maps son inalcanzables para
 *    cualquier usuario que no fuerce el tier. La hipótesis "readback stale"
 *    (#759) no aplica: el camino no existe, no es que sirva datos viejos.
 */

// ─── Helpers (espejo de fit-maps.spec.ts) ───────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  await page.evaluate((act) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { dispatch: (a: unknown) => void }
      | undefined;
    store?.dispatch(act);
  }, action);
}

async function getState<T = unknown>(page: Page, path: string): Promise<T> {
  return page.evaluate((sel) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    const state = store.getState();
    return sel
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], state) as T;
  }, path) as Promise<T>;
}

async function addPiece(page: Page) {
  await dispatch(page, {
    type: 'project/addPiece',
    payload: {
      id: 'fitmap-diag-piece-1',
      name: 'Panel',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 300] },
        { type: 'L', values: [0, 300] },
        // `Z`, como emite `useRectangleTool`: el cuarto lado no tiene
        // comando propio. El `L` de vuelta al origen hacía que el cierre no
        // existiera como tal — por ahí pasó #1092 en verde (#1120).
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 60, y: 40 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      layer: 1,
      sublayer: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  await page.waitForTimeout(300);
}

async function setupSimulation(page: Page) {
  await waitForApp(page);
  await addPiece(page);

  // El viewport 3D debe existir ANTES de arrancar la sim. Con el
  // `waitForTimeout(2000)` que había aquí, bajo carga se despachaba
  // startSimulation contra un árbol 3D todavía sin montar: el store quedaba en
  // 'running' y el useFrame no corría nunca (diag=AUSENTE) — el test esperaba
  // 2 minutos datos de una simulación inexistente.
  await page.click('button:has-text("3D")');
  await page.waitForSelector('canvas', { state: 'visible', timeout: 60_000 });

  await dispatch(page, { type: 'simulation/setViewMode3D', payload: 'simulate' });
  await dispatch(page, { type: 'simulation/startSimulation' });
  await expect.poll(
    async () => getState<string>(page, 'simulation.simulationState'),
    { timeout: 30000 },
  ).toBe('running');

  // Loop de la sim vivo: el diag se publica en el primer useFrame. Sin esta
  // guarda, un 3D que no arrancó falla tarde y sin explicación.
  // 'neural-drape' es condición TERMINAL, no un estado de paso: ese tier no
  // corre este useFrame ni expone edge data, así que esperarlo es esperar en
  // vano. Se reconoce acá y el test se salta explícitamente abajo.
  await expect.poll(
    () => page.evaluate(() => {
      const w = window as any;
      const tier = w.__VINA_STORE__?.getState().simulation.solverTier;
      if (tier === 'neural-drape') return 'NEURAL';
      return w.__VINA_FITMAP_DIAG__ ? 'VIVO' : `SIN FRAMES tier=${tier}`;
    }),
    { timeout: 90_000, message: 'useFrame nunca corrió — la simulación no arrancó' },
  ).toMatch(/VIVO|NEURAL/);
}

interface Diag {
  path: 'none' | 'tsl' | 'cpu';
  frames: number;
  fitMapMode: string;
  edgeDataPresent: boolean;
  fitMapBlockRan: boolean;
}

interface Evidence {
  tier: string | null;
  diag: Diag | null;
  stats: { min: number; max: number; mean: number } | null;
}

/**
 * Activa el modo strain vía store y espera (por condición, no por timeout
 * ciego) a que se cumpla el contrato. Devuelve la foto de la evidencia.
 */
async function collectEvidence(page: Page): Promise<Evidence> {
  await dispatch(page, { type: 'simulation/setFitMapMode', payload: 'strain' });

  // Se espera por el CONTRATO — "el bloque de fit map corrió con el modo activo
  // y publicó stats" — no por un proxy de N frames acumulados.
  // El poll devuelve la foto del diag, no un booleano: cuando falla, Playwright
  // imprime el último valor recibido y se ve EN QUÉ eslabón murió el dato
  // (¿frames congelados? ¿modo no propagado? ¿edge data ausente?).
  await expect.poll(
    () => page.evaluate(() => {
      const w = window as any;
      const d = w.__VINA_FITMAP_DIAG__;
      if (!d) return 'diag=AUSENTE (useFrame nunca corrió)';
      const ready = d.fitMapMode === 'strain' && d.fitMapBlockRan && Boolean(w.__VINA_FIT_MAP_STATS__);
      return `${ready ? 'READY' : 'PENDIENTE'} path=${d.path} frames=${d.frames} mode=${d.fitMapMode} edgeData=${d.edgeDataPresent} blockRan=${d.fitMapBlockRan} stats=${Boolean(w.__VINA_FIT_MAP_STATS__)} tier=${w.__VINA_STORE__?.getState().simulation.solverTier}`;
    }),
    { timeout: 60_000, message: 'el bloque de fit map nunca publicó stats con fitMapMode=strain' },
  ).toContain('READY');

  return page.evaluate(() => {
    const w = window as any;
    return {
      tier: w.__VINA_STORE__?.getState().simulation.solverTier ?? null,
      diag: w.__VINA_FITMAP_DIAG__ ? { ...w.__VINA_FITMAP_DIAG__ } : null,
      stats: w.__VINA_FIT_MAP_STATS__ ?? null,
    };
  });
}

// ─── Tier WASM/CPU (control: la ruta de datos SÍ funciona) ──────────────────

test.describe('diagnóstico #1010 — tier WASM/CPU (webgpu OFF)', () => {
  test.beforeEach(async ({ page }) => {
    // 180 s: con los 7 workers del config local el arranque de la sim llegó a
    // pasar de 60 s. El guard de montaje de abajo es quien falla rápido y con
    // mensaje si el 3D de verdad no montó.
    test.setTimeout(180_000);
    await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
    await setupSimulation(page);
  });

  test('control: edge data llega, el bloque de fit map corre y publica stats', async ({ page }, testInfo) => {
    // Skip explícito y anotado: si la cascada cayó hasta el tier neural (init
    // de WASM y CPU agotados bajo contención), no hay edge data que medir —
    // hueco de capacidad conocido (A7), no degradación del entorno.
    const tier0 = await getState<string>(page, 'simulation.solverTier');
    test.skip(tier0 === 'neural-drape', `tier ${tier0}: sin edge data, no soporta fit maps (A7)`);

    const ev = await collectEvidence(page);
    console.log('[diag WASM/CPU]', JSON.stringify(ev, null, 2));

    expect(ev.tier, 'con webgpu OFF el tier no debe ser webgpu').not.toBe('webgpu');
    expect(ev.diag, 'diag global no publicado — ¿useFrame no corre?').not.toBeNull();
    expect(ev.diag!.path, 'la rama activa debe ser el CPU readback path').toBe('cpu');
    expect(ev.diag!.edgeDataPresent, 'edge data ausente incluso en tier CPU/WASM').toBe(true);
    expect(ev.diag!.fitMapBlockRan, 'el bloque de fit map nunca corrió').toBe(true);
    expect(ev.stats, 'stats global no publicado pese a que el bloque corrió').not.toBeNull();
    expect(Number.isFinite(ev.stats!.min), `min no finito: ${ev.stats!.min}`).toBe(true);
    expect(Number.isFinite(ev.stats!.max), `max no finito: ${ev.stats!.max}`).toBe(true);
    expect(Number.isFinite(ev.stats!.mean), `mean no finito: ${ev.stats!.mean}`).toBe(true);
    // Red de regresión del bug de edges degenerados (#1010): un restLen ~1e-7
    // daba strains de 10^6 %. El fix vive en fitMaps.ts (epsilon de 0.1 mm),
    // compartido por los tres tiers — este assert lo cubre en el tier CI.
    // Sobre la media, no el máximo (ver nota en fit-maps.spec.ts).
    expect(ev.stats!.mean, `strain medio absurdo: ${ev.stats!.mean}`).toBeLessThan(500);

    // #1010 CE2: evidencia de que el tier WASM produce el mismo dato.
    const shot = testInfo.outputPath('fitmap-strain-wasm.png');
    await page.screenshot({ path: shot });
    await testInfo.attach('fitmap-strain-wasm', { path: shot, contentType: 'image/png' });
  });
});

// ─── Tier WebGPU (default #897: la ruta de datos NO existe) ─────────────────

// @gpu-local: requiere WebGPU real (npm run test:e2e:gpu). En el config
// default (SwiftShader) el tier cae a WASM y estos tests hacen skip explícito.
test.describe('diagnóstico #1010 — tier WebGPU (default) @gpu-local', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    // Errores de página/consola al log del test — un kernel TSL que lanza al
    // construirse mata el useFrame en silencio (r3f error boundary).
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[console.${msg.type()}]`, msg.text().slice(0, 400));
      }
    });
    await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'true'));
    await setupSimulation(page);
  });

  test('CONTRATO (#1009): el tier default publica stats numéricas de fit map', async ({ page }) => {
    const ev = await collectEvidence(page);
    console.log('[contrato WebGPU]', JSON.stringify(ev, null, 2));

    test.skip(ev.tier !== 'webgpu', `WebGPU no disponible (tier=${ev.tier})`);

    // Fix #1010 slice 1: GpuSolverClient publica edge data (behavior #16) y
    // el bloque de fit map corre sobre el readback periódico de la rama TSL.
    expect(ev.diag!.path, 'la rama activa es la TSL').toBe('tsl');
    expect(ev.diag!.edgeDataPresent, 'edgeDataRef poblado vía onEdgeData del cliente GPU').toBe(true);
    expect(ev.diag!.fitMapBlockRan, 'el bloque de fit map corre en el readback TSL').toBe(true);
    expect(ev.stats, 'stats publicadas en el tier default').not.toBeNull();
    expect(Number.isFinite(ev.stats!.min), `min no finito: ${ev.stats!.min}`).toBe(true);
    expect(Number.isFinite(ev.stats!.max), `max no finito: ${ev.stats!.max}`).toBe(true);
    expect(Number.isFinite(ev.stats!.mean), `mean no finito: ${ev.stats!.mean}`).toBe(true);
  });

  test('PARIDAD (slice 2): el kernel colorize GPU replica los ramps CPU de fitMaps.ts', async ({ page }) => {
    const ev = await collectEvidence(page);
    test.skip(ev.tier !== 'webgpu', `WebGPU no disponible (tier=${ev.tier})`);

    // El bloque de readback (DEV) publica una muestra de 100 vértices de
    // ambos lados: colores del kernel GPU y colores CPU del mismo readback.
    const parity = await page.evaluate(() => {
      return ((window as any).__VINA_FITMAP_PARITY__ ?? null) as
        | { gpu: number[]; cpu: number[]; n: number }
        | null;
    });
    expect(parity, 'muestra de paridad no publicada (¿readFitColorsToCPU falló?)').not.toBeNull();
    expect(parity!.gpu.length).toBe(parity!.cpu.length);

    // RGB válido en [0,1] (kernel escribiendo basura → fuera de rango o NaN).
    for (const v of parity!.gpu) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.001);
    }

    // Paridad numérica: mismo frame de readback, tolerancia por el drift de
    // ≤1 frame entre el colorize (posiciones GPU) y el cálculo CPU.
    const diffs = parity!.gpu.map((g, i) => Math.abs(g - parity!.cpu[i]));
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    console.log(`[paridad] meanDiff=${meanDiff.toFixed(4)} maxDiff=${Math.max(...diffs).toFixed(4)}`);
    console.log('[paridad] gpu[0..11]:', parity!.gpu.slice(0, 12).map((v) => v.toFixed(3)).join(','));
    console.log('[paridad] cpu[0..11]:', parity!.cpu.slice(0, 12).map((v) => v.toFixed(3)).join(','));
    expect(meanDiff, 'divergencia media GPU vs CPU').toBeLessThan(0.1);
  });
});

// ─── Escenario real: patrón de María cosido (temp.dxf ≡ fixture 2M) ─────────
//
// Pedido del dueño (2026-08-09): validar el fit map sobre el DXF real con el
// que la costura ya está probada (C:\Users\simon\Desktop\temp.dxf es
// byte-idéntico al fixture maria_patrones_samuel_2M.dxf — hash cbc37d91).
// Flujo copiado de webgpu-maria-replay.spec.ts: import → ⌘K Auto-Sew → 3D →
// simular → tier webgpu. Checkpoint M4 (~150 frames = 2.5s de sim) antes de
// activar el modo — prenda asentada tras cerrar costuras.

test.describe('diagnóstico #1010 — fit map sobre el patrón real de María @gpu-local', () => {
  test('strain map cosido: stats reales + paridad GPU↔CPU + captura', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    // Flujo probado del replay (F4 #897)
    await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'true'));
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __VINA_STORE__?: unknown }).__VINA_STORE__),
      { timeout: 15_000 },
    );
    await page.waitForTimeout(500);

    await page.locator('input[accept=".dxf"]').setInputFiles(MARIA_FIXTURE);
    await expect
      .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, {
        timeout: 30_000,
      })
      .toBe(5);

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
    await startSimHelper(page);
    await expect
      .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
      .toBe('webgpu');

    // Asentar hasta el checkpoint M4 (~150 frames de sim).
    await expect.poll(
      () => page.evaluate(() => ((window as any).__VINA_FITMAP_DIAG__?.frames ?? 0) as number),
      { timeout: 60_000, message: 'la sim nunca acumuló 150 frames' },
    ).toBeGreaterThan(150);

    // Activar strain y esperar stats (llegan con la cadencia de readback).
    const ev = await collectEvidence(page);
    console.log('[maria strain]', JSON.stringify(ev, null, 2));

    expect(ev.tier).toBe('webgpu');
    expect(ev.diag!.edgeDataPresent).toBe(true);
    expect(ev.stats, 'stats de strain sobre la prenda cosida').not.toBeNull();
    expect(Number.isFinite(ev.stats!.max)).toBe(true);
    // Prenda cosida sobre María: la costura tracciona — deformación no
    // degenerada (max > min). El valor exacto es evidencia, no assert.
    expect(ev.stats!.max).toBeGreaterThan(ev.stats!.min);
    // Techo del bug de edges degenerados (#1010) sobre geometría DXF real —
    // esta era exactamente la malla que daba 3.68M %. Media, no máximo: el
    // máximo aquí es ~990 % por la cola de edges sub-mm de la malla (ver nota
    // en fit-maps.spec.ts); la media se queda en ~129 %.
    expect(ev.stats!.mean, `strain medio absurdo: ${ev.stats!.mean}`).toBeLessThan(500);

    // Paridad GPU↔CPU sobre geometría real.
    const parity = await page.evaluate(() => {
      return ((window as any).__VINA_FITMAP_PARITY__ ?? null) as
        | { gpu: number[]; cpu: number[]; n: number }
        | null;
    });
    expect(parity, 'muestra de paridad no publicada').not.toBeNull();
    const diffs = parity!.gpu.map((g, i) => Math.abs(g - parity!.cpu[i]));
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    console.log(`[maria paridad] meanDiff=${meanDiff.toFixed(4)} maxDiff=${Math.max(...diffs).toFixed(4)}`);
    expect(meanDiff, 'divergencia media GPU vs CPU sobre la prenda real').toBeLessThan(0.1);

    // Captura del primer avistamiento (criterio de cierre de #1010).
    const shot = testInfo.outputPath('fitmap-strain-maria.png');
    await page.screenshot({ path: shot });
    await testInfo.attach('fitmap-strain-maria', { path: shot, contentType: 'image/png' });
    console.log('[captura]', shot);
  });
});
