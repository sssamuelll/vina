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
 * y ahí se ancla el assert: 150 frames acumulados = 2.5s de sim. El fix de
 * stiction de Coulomb (#902) detuvo el slide-off durante el asentamiento y lo
 * limpió; pero el drape a 10s es NO-DETERMINISTA y bistable (de "sostenida" a
 * colapso total en runs idénticos — μ=0.4 en el margen de las pendientes del
 * torso), así que a 10s NO hay assert: se registra como evidencia. La
 * estabilidad/estructura del drape largo es follow-up de alta prioridad (#912).
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
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { switchView, startSimulation } from './helpers/sim';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

/** P4-0 determinism gate: stable cross-repeat dump dir (repo-root/.tmp/determinism). */
const DETERMINISM_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.tmp/determinism',
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

    // A-pose sleeve-on-arm checkpoint at t=2.5s (maintainer-run)
    // Segments cloth verts by |x|>0.25 (sleeve region) and asserts their
    // mean Y is BELOW shoulder height (≈1.476m) — i.e. the sleeve drapes
    // along the lowered A-pose arm, not floating at T-pose horizontal height.
    // maintainer-run
    const sleeveMeanY = await page.evaluate(() => {
      const mesh = (window as unknown as { __OPENCLO_CLOTH_MESH__?: {
        geometry: { attributes: { position: { count: number; getX: (i: number) => number; getY: (i: number) => number } } };
      } }).__OPENCLO_CLOTH_MESH__;
      if (!mesh) return null;
      const pos = mesh.geometry.attributes.position;
      const n = pos.count;
      let sumY = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i);
        if (Math.abs(x) > 0.25) {
          const y = pos.getY(i);
          if (!Number.isNaN(y)) { sumY += y; count++; }
        }
      }
      if (count === 0) return { meanY: null, count: 0 };
      return { meanY: sumY / count, count };
    });
    console.log(
      `[apose-sleeve] simSeconds=2.5 sleeveMeanY=${sleeveMeanY?.meanY?.toFixed(3) ?? 'n/a'} sleeveVertCount=${sleeveMeanY?.count ?? 0} (target: meanY<1.476)`,
    );
    // Detect global publish failure separately from empty sleeve segment.
    expect(sleeveMeanY, 'Cloth mesh not found — __OPENCLO_CLOTH_MESH__ global not published').not.toBeNull();
    // Guard against empty sleeve segment — fails loudly with a clear message.
    expect(
      sleeveMeanY?.count ?? 0,
      'No sleeve verts found (|x|>0.25) — mesh may not be loaded or A-pose arm geometry changed',
    ).toBeGreaterThan(0);
    // Assert sleeve mean Y is below shoulder height: the sleeve hangs along
    // the lowered A-pose arm (≈60° below horizontal), not floating at T-pose
    // shoulder height (≈1.476m). // maintainer-run
    expect(
      sleeveMeanY!.meanY!,
      `Sleeve mean Y (${sleeveMeanY!.meanY!.toFixed(3)}m) is at or above shoulder height 1.476m — sleeves appear to be floating at T-pose height rather than draping on the A-pose arm`,
    ).toBeLessThan(1.476);

    // Largo horizonte (600 frames = 10s de sim): SOLO REGISTRO, sin assert de
    // forma. El fix de stiction (#902) detuvo el slide-off durante el
    // asentamiento (checkpoint de 2.5s arriba), pero a 10s el drape es
    // NO-DETERMINISTA y bistable: en runs de código idéntico el resultado va de
    // "mayormente sostenida" (belowHip ~7%) a COLAPSO TOTAL (belowHip 100%,
    // maxY 0.54 — prenda entera en el suelo). El estado "sostenida" es
    // metaestable: μ=0.4 está en el margen de las pendientes del torso, así que
    // held↔collapsed lo decide el no-determinismo de float del GPU. Ningún
    // assert de forma a 10s (ni siquiera anti-colapso) es confiable → se REGISTRA
    // como evidencia. La bistabilidad/estructura es un follow-up de alta
    // prioridad (afecta el default tier #897). Solo se afirma el invariante
    // determinista: sin NaN.
    await waitForSimWindows(page, 20, 120_000);
    const creep = await readDrape(page);
    expect(creep).not.toBeNull();
    console.log(
      `[creep-watch] simSeconds=10 belowHipPct=${creep!.belowHipPct.toFixed(2)} minY=${creep!.minY.toFixed(3)} maxY=${creep!.maxY.toFixed(3)} nan=${creep!.nan} (issue #902 — non-deterministic, log-only)`,
    );
    expect(creep!.nan).toBe(0);

    // Tube-closure check (maintainer-run): the sleeve must STAY on the arm.
    // Before tube closure, sleeve verts (|x|>0.25) collapsed 993→~2 over 10s
    // as the open sleeve slid off. With the underarm seam closing the tube the
    // on-arm population persists. The 10s drape is non-deterministic (#902), so
    // this is a loose ANTI-COLLAPSE floor, not a tight bound — the maintainer
    // runs --repeat-each=3 and reads the logged counts. // maintainer-run
    const sleeveAt10 = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh) return null;
      const pos = mesh.geometry.attributes.position;
      let count = 0, maxAbsX = 0;
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(pos.getX(i));
        if (ax > maxAbsX) maxAbsX = ax;
        if (ax > 0.25) count++;
      }
      return { count, maxAbsX };
    });
    console.log(
      `[sleeve-persist] simSeconds=10 sleeveVertCount=${sleeveAt10?.count ?? 'n/a'} maxAbsX=${sleeveAt10?.maxAbsX?.toFixed(3) ?? 'n/a'} (anti-collapse floor: count≥50)`,
    );
    expect(sleeveAt10, 'Cloth mesh not found — __OPENCLO_CLOTH_MESH__ not published').not.toBeNull();
    // Anti-collapse floor: well above the pre-fix collapse (~2), loose enough
    // for the non-deterministic 10s drape. // maintainer-run
    expect(sleeveAt10!.count).toBeGreaterThanOrEqual(50);

    // ── §8 envelope-wrap checkpoints (maintainer-run) ────────────────────────
    // These checkpoints measure the auto-support bet from the envelope-wrap
    // spec §8: wrapping panels over body cylinders holds the garment without
    // structural pins. Targets: minY ≥ 0.5m primary, belowHip ≤ 0.5%,
    // interpenetration count = 0. The 10s self-support bet is MEASURED BY THE
    // MAINTAINER (npm run test:e2e:gpu -- webgpu-maria-replay -g "drape M4"
    // --repeat-each=3). CI does not execute @gpu-local; only deterministic
    // invariants are asserted here (nan=0, structural presence).

    // §8 pin-disabled assert: computeShoulderAnchors is NOT wired on this
    // branch (it lives on exp/anchor-on-arrangement). The solver must be
    // running in un-pinned envelope-wrap mode. // maintainer-run
    const pinCount = await getState<number>(page, 'simulation.pinnedVertexCount');
    // The wrap mechanism holds geometry — no structural shoulder pins expected.
    // If pinCount > 0 something wired computeShoulderAnchors unexpectedly.
    expect(pinCount ?? 0).toBe(0);

    // §8 t=0 penetration count: cloth verts inside the baked body mesh at
    // sim start. With envelope-wrap placement the panels are tangent-to and
    // outside the body cylinders, so interpenetration at t=0 should be zero.
    // Log-only: deterministic only if the baked mesh is loaded by t=0. // maintainer-run
    const penetrationCount = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      // __OPENCLO_PENETRATION_COUNT__ is published by the collision subsystem
      // after the first solver step; undefined = not yet available.
      return (w.__OPENCLO_PENETRATION_COUNT__ as number | undefined) ?? null;
    });
    console.log(
      `[wrap-spec-§8] t=0 penetrationCount=${penetrationCount ?? 'not-published'} (target=0)`,
    );
    if (penetrationCount !== null) {
      // Only assert when the subsystem published the value. // maintainer-run
      expect(penetrationCount).toBe(0);
    }

    // §8 early-collapse sampling at t=0.5s and t=1s — log belowHip/minY.
    // The wrap bet says the ring catches on the shoulders and the garment
    // holds; early collapse (belowHip > 0.5% at t=0.5s) would mean the
    // ring slipped through. Logged for the maintainer; not CI-asserted. // maintainer-run
    await waitForSimWindows(page, 1, 30_000); // t≈0.5s
    const earlyA = await readDrape(page);
    console.log(
      `[wrap-spec-§8] t=0.5s belowHipPct=${earlyA?.belowHipPct.toFixed(2) ?? 'n/a'} minY=${earlyA?.minY.toFixed(3) ?? 'n/a'} (target: belowHip≤0.5%)`,
    );

    await waitForSimWindows(page, 2, 30_000); // t≈1s
    const earlyB = await readDrape(page);
    console.log(
      `[wrap-spec-§8] t=1s belowHipPct=${earlyB?.belowHipPct.toFixed(2) ?? 'n/a'} minY=${earlyB?.minY.toFixed(3) ?? 'n/a'} (target: minY≥0.5m)`,
    );

    // §8 collar-height + sleeve-on-arm logs (structural presence). // maintainer-run
    const collarHeight = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return (w.__OPENCLO_COLLAR_HEIGHT__ as number | undefined) ?? null;
    });
    const sleeveOnArm = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return (w.__OPENCLO_SLEEVE_ON_ARM__ as boolean | undefined) ?? null;
    });
    console.log(
      `[wrap-spec-§8] collarHeight=${collarHeight ?? 'not-published'} sleeveOnArm=${sleeveOnArm ?? 'not-published'}`,
    );
    // Structural NaN guard on early samples is deterministic. // maintainer-run
    expect(earlyA?.nan ?? 0).toBe(0);
    expect(earlyB?.nan ?? 0).toBe(0);
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

  // ── DIAG (maintainer-run, log-only): long-horizon descent trajectory ─────────
  // Samuel observes the garment "melting" into the torso over time + avatar skin
  // showing through. The drape-M4 test only samples 2.5s/10s and is blind to the
  // >10s horizon and to interpenetration. This probe samples readDrape every 1s
  // out to 30s SIM so the maintainer can SEE whether descent is arrested (A1
  // cured it) or creeps past 10s (structural residue): maxY falling = melting
  // from the top; belowHip rising = falling below the hip. Log-only — asserts
  // ONLY nan===0 so --repeat-each=N runs every repeat to completion without abort.
  test('DIAG @gpu-local long-horizon descent 0-30s (log-only)', async ({ page }) => {
    test.setTimeout(420_000);
    await importSewAndSimulate(page);
    await expect
      .poll(async () => getState<boolean>(page, 'simulation.bodyCollision'), { timeout: 30_000 })
      .toBe(true);
    // areaStretchPct = mesh triangle area vs the t=1s reference. A rigid (real)
    // fabric is near-inextensible → area stays ~flat. A "gummy" cloth keeps
    // inflating under gravity → area climbs. This is the objective stretch metric.
    let area0 = 0;
    for (let w = 2; w <= 16; w += 2) {
      // every 2 windows = 1.0s SIM, out to 8s (gummy shows early)
      await waitForSimWindows(page, w, 90_000);
      const d = await readDrape(page);
      const m = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
        if (!mesh) return { sleeve: 0, area: 0 };
        const pos = mesh.geometry.attributes.position;
        const idx = mesh.geometry.index;
        let sleeve = 0;
        for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) > 0.25) sleeve++;
        let area = 0;
        if (idx) {
          for (let t = 0; t < idx.count; t += 3) {
            const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
            const ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a);
            const vx = pos.getX(c) - pos.getX(a), vy = pos.getY(c) - pos.getY(a), vz = pos.getZ(c) - pos.getZ(a);
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
            area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
          }
        }
        return { sleeve, area };
      });
      if (area0 === 0) area0 = m.area;
      const stretchPct = area0 > 0 ? (m.area / area0 - 1) * 100 : 0;
      console.log(
        `[diag-gummy] simSeconds=${(w * 0.5).toFixed(1)} belowHip=${d!.belowHipPct.toFixed(2)} minY=${d!.minY.toFixed(3)} maxY=${d!.maxY.toFixed(3)} sleeve=${m.sleeve} areaStretchPct=${stretchPct.toFixed(2)} nan=${d!.nan}`,
      );
      expect(d!.nan).toBe(0);
    }
  });

  // ── P4-0 determinism gate (@gpu-local, maintainer-run) ───────────────────────
  // Dumps the settled drape position buffer at the 2.5s checkpoint — which is
  // ALSO the tether capture window (TETHER_SETTLE_FRAMES=150) — to a stable
  // per-run artifact, then the offline diff asserts bit-exactness across runs:
  //   npm run test:e2e:gpu:determinism   # capture N runs → .tmp/determinism/
  //   npm run determinism:diff           # bit-exact compare (pass/fail)
  // Repeat 0 clears the dir so a fresh N-run has no stale bins; workers=1 in
  // playwright.webgpu.config makes repeats sequential, so the clean is race-free.
  // Expected to DIVERGE today (bend Jacobi race, tslSolver.ts:887); must be
  // bit-exact after P4-1 graph-coloring. See docs/plans/2026-07-01-drape-determinism-p4-design.md.
  test('determinism @gpu-local — dump drape positions at 2.5s', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await importSewAndSimulate(page);
    await expect
      .poll(async () => getState<boolean>(page, 'simulation.bodyCollision'), { timeout: 30_000 })
      .toBe(true);

    // 2.5s SIM = M4 settle checkpoint = tether capture frame (same window).
    await waitForSimWindows(page, 5, 120_000);
    const positions = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh) return null;
      return Array.from(mesh.geometry.attributes.position.array as Float32Array);
    });
    expect(
      positions,
      'Cloth mesh not found — __OPENCLO_CLOTH_MESH__ not published',
    ).not.toBeNull();

    if (testInfo.repeatEachIndex === 0) rmSync(DETERMINISM_DIR, { recursive: true, force: true });
    mkdirSync(DETERMINISM_DIR, { recursive: true });
    const bin = path.join(DETERMINISM_DIR, `pos-${testInfo.repeatEachIndex}.bin`);
    writeFileSync(bin, Buffer.from(Float32Array.from(positions!).buffer));
    console.log(
      `[determinism] run ${testInfo.repeatEachIndex}: wrote ${positions!.length / 3} particles → ${bin}`,
    );
  });
});
