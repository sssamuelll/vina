/**
 * B2: gate Cusick virtual — pata @gpu-local (el tier GPU, lo que Samuel VE).
 * Complemento del runner CPU/CI (src/utils/cloth/__tests__/cusickGate.cpu.test.ts):
 * "dos gates, dos baselines" (plan drape-profesional §B2/§6) — el tier GPU lleva
 * self-collision always-on + strain-limit que el CPU no tiene, así que sus
 * números NO son conmensurables con el baseline CPU (DC 23.0/34.1) hasta el
 * backport del strain-limit.
 *
 * Escena: harness DEV-only (?testScene=cusick&fabric=<id>, ver
 * src/components/testScenes/CusickHarness.tsx) — disco de 30 cm (seed 42) sobre
 * pedestal de 18 cm, 300 frames = 5 s de sim, física del tier GPU real.
 *
 * Correr: npm run test:e2e:gpu -- cusick-gate
 * (config webgpu: headed, GPU real, sin SwiftShader; @gpu-local ⇒ CI nunca lo
 * corre — el config base excluye el grep y CI no tiene GPU.)
 *
 * Asserts = sanidad v1 (espejo del runner CPU): sin NaN, DC finito en rango
 * físicamente plausible, hem sobre la base del pedestal, y el ordering ISO
 * DC(fluida) < DC(rígida). Las bandas ABSOLUTAS (anclas chiffon ~30 / canvas
 * ~85) son LOG-ONLY: el baseline GPU es desconocido hasta la primera corrida
 * real — la primera corrida DEFINE el baseline, no lo verifica.
 */
import { test, expect, Page } from '@playwright/test';

const FLUID_FABRIC = 'chiffon';
const STIFF_FABRIC = 'canvas-12oz';
// El hem no puede caer bajo la base del pedestal (topY 0.85 − height 0.4).
const HEM_FLOOR_Y = 0.45;

interface CusickGpuResult {
  done: boolean;
  fabric: string;
  dc: number;
  folds: number;
  minY: number;
  nanCount: number;
  frames: number;
  error?: string;
}

async function runCusick(page: Page, fabricId: string): Promise<CusickGpuResult> {
  await page.addInitScript(() => {
    // Opt-in WebGPU ANTES de cargar la app (mismo patrón que webgpu-maria-replay).
    localStorage.setItem('openclo-use-webgpu', 'true');
    // B1: suprime la captura del settle-tether — el harness no lo despacha,
    // pero el flag mantiene el contrato del gate explícito en el entorno.
    localStorage.setItem('openclo-tether-disabled', 'true');
  });
  await page.goto(`/?testScene=cusick&fabric=${fabricId}`);
  await page.waitForFunction(
    () =>
      (window as unknown as { __OPENCLO_CUSICK__?: { done?: boolean } }).__OPENCLO_CUSICK__
        ?.done === true,
    undefined,
    { timeout: 120_000 },
  );
  const r = await page.evaluate(
    () => (window as unknown as { __OPENCLO_CUSICK__: CusickGpuResult }).__OPENCLO_CUSICK__,
  );
  // Línea estructurada en el reporte Playwright (el harness ya la logueó en consola del browser).
  console.log(
    `[cusick-gpu] fabric=${r.fabric} DC=${r.dc?.toFixed?.(1) ?? r.dc} folds=${r.folds} ` +
    `minY=${r.minY?.toFixed?.(3) ?? r.minY} nan=${r.nanCount} frames=${r.frames}` +
    (r.error ? ` error=${r.error}` : ''),
  );
  return r;
}

// Cache espejo del runner CPU: cada tela se simula UNA vez por worker; el test
// de ordering reusa resultados si los tests de sanidad ya corrieron (workers=1
// en el config webgpu ⇒ mismo proceso), o corre ambas telas él mismo si se
// filtró en solitario.
const cache = new Map<string, CusickGpuResult>();
async function getResult(page: Page, fabricId: string): Promise<CusickGpuResult> {
  let r = cache.get(fabricId);
  if (!r) {
    r = await runCusick(page, fabricId);
    cache.set(fabricId, r);
  }
  return r;
}

function expectSane(r: CusickGpuResult): void {
  expect(r.error, `harness reported error: ${r.error}`).toBeUndefined();
  // Sin NaN en las posiciones finales (nanCount lo computa el harness sobre
  // el readback completo; -1 = readback fallido).
  expect(r.nanCount, 'final positions contain NaN/Inf (or readback failed)').toBe(0);
  // DC finito y en rango físicamente plausible.
  expect(Number.isFinite(r.dc), 'DC is not finite').toBe(true);
  expect(r.dc).toBeGreaterThan(-10);
  expect(r.dc).toBeLessThan(110);
  // El hem no cayó bajo la base del pedestal (la tela no "se derramó" entera).
  expect(r.minY).toBeGreaterThan(HEM_FLOOR_Y);
}

test.describe('Cusick virtual gate @gpu-local — GPU tier baseline', () => {
  test(`${FLUID_FABRIC}: drape sano en GPU (sin NaN, DC en rango, hem sobre la base)`, async ({ page }) => {
    test.setTimeout(240_000);
    const r = await getResult(page, FLUID_FABRIC);
    expectSane(r);
    // Banda absoluta vs ancla física (chiffon DC~30): LOG-ONLY — el baseline
    // GPU no existe hasta esta primera corrida ("dos gates, dos baselines"
    // hasta el backport del strain-limit). No assert.
    console.log(`[cusick-gpu-band] ${FLUID_FABRIC} DC=${r.dc.toFixed(1)} (ancla física ~30, log-only)`);
  });

  test(`${STIFF_FABRIC}: drape sano en GPU (sin NaN, DC en rango, hem sobre la base)`, async ({ page }) => {
    test.setTimeout(240_000);
    const r = await getResult(page, STIFF_FABRIC);
    expectSane(r);
    // LOG-ONLY, mismo racional que arriba (ancla física canvas DC~85).
    console.log(`[cusick-gpu-band] ${STIFF_FABRIC} DC=${r.dc.toFixed(1)} (ancla física ~85, log-only)`);
  });

  test(`ordering ISO: DC(${FLUID_FABRIC}) < DC(${STIFF_FABRIC})`, async ({ page }) => {
    // Puede correr ambas telas si se filtró en solitario (2 × ~5 s de sim + init).
    test.setTimeout(360_000);
    // Si este assert FALLA, NO borrarlo (espejo del runner CPU): el CPU
    // sostiene hoy el ordering por 11.1 DC (23.0 vs 34.1); un ordering
    // invertido en GPU sería evidencia de divergencia del tier
    // (self-collision/strain-limit), no ruido — reportarlo.
    const fluid = await getResult(page, FLUID_FABRIC);
    const stiff = await getResult(page, STIFF_FABRIC);
    expect(fluid.error, `harness error (${FLUID_FABRIC}): ${fluid.error}`).toBeUndefined();
    expect(stiff.error, `harness error (${STIFF_FABRIC}): ${stiff.error}`).toBeUndefined();
    expect(fluid.dc).toBeLessThan(stiff.dc);
  });
});
