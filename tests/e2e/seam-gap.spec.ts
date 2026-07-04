/**
 * seam-gap @gpu-local — la sonda que faltaba: ¿las costuras CIERRAN?
 *
 * El overlay cuenta constraints (474) y el gate M4 mide retención de manga,
 * pero NADIE medía el residual de cierre en vivo. Síntoma que motivó esto
 * (2026-07-04): "chaleco + brazaletes" — la costura armhole↔sleeveCap queda
 * abierta ~8-10cm a los 10s mientras todo lo demás reporta verde.
 *
 * Mide, por costura, mean/max de distancia de sus pares (globales, publicados
 * por useSimulationLifecycle en __OPENCLO_SEAM_DEBUG__) sobre las posiciones
 * REALES del solver (__OPENCLO_CLOTH_MESH__, readback cada 15 frames ⇒
 * staleness ≤0.25s) en t≈0 / 1s / 2.5s / 10s de sim.
 *
 * Experimento discriminante (verdict del workflow 2026-07-04): correr DOS
 * veces y comparar curvas —
 *   npx playwright test --config playwright.webgpu.config.ts seam-gap
 *   SEAM_GAP_TETHER=off npx playwright test --config playwright.webgpu.config.ts seam-gap
 * (a) curva plana en ~24cm → la constraint nunca tira (empaquetado roto);
 * (b) baja y se estanca ≈ SLEEVE_CAP_MARGIN → la física gana (margen+fricción);
 * (c) OFF sigue bajando después de 2.5s donde ON se aplana → tether lock-in.
 */
import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation } from './helpers/sim';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

const TETHER_OFF = process.env.SEAM_GAP_TETHER === 'off';

interface SeamGapRow {
  id: string;
  label: string;
  pairs: number;
  meanM: number;
  maxM: number;
  /** 5 muestras de distancia a lo largo de la costura (t=0,.25,.5,.75,1). */
  profile: number[];
  /** Pares con distancia >3cm: índice + posiciones mundo (diagnóstico de huecos). */
  openPairs: Array<{ k: number; d: number; a: number[]; b: number[] }>;
}

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

/** mean/max de distancia por costura sobre el mesh publicado por el solver. */
async function measureSeams(page: Page): Promise<SeamGapRow[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __OPENCLO_SEAM_DEBUG__?: Array<{
        id: string; edgeA: string; edgeB: string; globalPairs: number[];
      }>;
      __OPENCLO_CLOTH_MESH__?: { geometry: { attributes: { position: { array: ArrayLike<number> } } } };
    };
    const seams = w.__OPENCLO_SEAM_DEBUG__ ?? [];
    const pos = w.__OPENCLO_CLOTH_MESH__?.geometry.attributes.position.array;
    if (!pos) return [];
    return seams.map(s => {
      let sum = 0, max = 0;
      const n = s.globalPairs.length / 2;
      const dists: number[] = [];
      for (let k = 0; k < n; k++) {
        const a = s.globalPairs[2 * k] * 3, b = s.globalPairs[2 * k + 1] * 3;
        const d = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
        dists.push(d);
        sum += d;
        if (d > max) max = d;
      }
      // Perfil a lo largo de la costura (5 muestras t=0..1): distingue si el
      // residual vive en el hombro o en la axila.
      const profile = n
        ? [0, 0.25, 0.5, 0.75, 1].map(t => dists[Math.min(n - 1, Math.round(t * (n - 1)))])
        : [];
      // Pares ABIERTOS (>3cm): índice + posiciones mundo de ambos extremos —
      // localiza el hueco visible (hombro vs axila) sin adivinar.
      const openPairs: Array<{ k: number; d: number; a: number[]; b: number[] }> = [];
      for (let k = 0; k < n; k++) {
        if (dists[k] <= 0.03) continue;
        const a = s.globalPairs[2 * k] * 3, b = s.globalPairs[2 * k + 1] * 3;
        openPairs.push({
          k,
          d: dists[k],
          a: [pos[a], pos[a + 1], pos[a + 2]],
          b: [pos[b], pos[b + 1], pos[b + 2]],
        });
      }
      return { id: s.id, label: `${s.edgeA} ↔ ${s.edgeB}`, pairs: n, meanM: n ? sum / n : 0, maxM: max, profile, openPairs };
    });
  });
}

const isSisa = (r: SeamGapRow) => /armhole/i.test(r.label) && /sleevecap/i.test(r.label);
const fmt = (r: SeamGapRow) =>
  `${r.label}: ${r.pairs} pares, media=${(r.meanM * 100).toFixed(1)}cm, max=${(r.maxM * 100).toFixed(1)}cm, perfil=[${r.profile.map(d => (d * 100).toFixed(1)).join(', ')}]cm`;

test(`seam-gap: residual de cierre por costura (tether ${TETHER_OFF ? 'OFF' : 'ON'}) @gpu-local`, async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript((tetherOff) => {
    localStorage.setItem('openclo-use-webgpu', 'true');
    if (tetherOff) localStorage.setItem('openclo-tether-disabled', 'true');
  }, TETHER_OFF);
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__),
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
  await page.getByText('Auto-Sew Pieces', { exact: false }).first().click();
  await expect
    .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(6);
  await switchView(page, '3D');
  await page.waitForTimeout(3000);

  // Contador de ventanas de sim (30 frames ≈ 0.5s c/u) — mismo patrón que
  // webgpu-maria-replay / workflow-demo.
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

  const checkpoints: Array<[string, number]> = [
    ['t≈0.5s', 1],
    ['t≈1s', 2],
    ['t≈2.5s', 5],
    ['t≈10s', 20],
  ];

  const series = new Map<string, number[]>(); // label sisa → medias por checkpoint
  for (const [name, windows] of checkpoints) {
    await waitWindows(windows, windows >= 20 ? 150_000 : 60_000);
    const rows = await measureSeams(page);
    expect(rows.length, 'seam debug publicado').toBeGreaterThanOrEqual(6);

    console.log(`\n[seam-gap ${TETHER_OFF ? 'tether-OFF' : 'tether-ON'}] ${name}:`);
    for (const r of rows) {
      console.log(`  ${fmt(r)}${isSisa(r) ? '   ← SISA' : ''}`);
      if (name === 't≈10s') {
        for (const p of r.openPairs) {
          const f = (v: number[]) => `(${v.map(x => x.toFixed(3)).join(',')})`;
          console.log(`    OPEN k=${p.k}/${r.pairs} d=${(p.d * 100).toFixed(1)}cm A=${f(p.a)} B=${f(p.b)}`);
        }
      }
    }

    for (const r of rows.filter(isSisa)) {
      expect(r.pairs, `${r.label} tiene pares`).toBeGreaterThan(0);
      expect(Number.isFinite(r.meanM), `${r.label} media finita`).toBe(true);
      const prev = series.get(r.id) ?? [];
      prev.push(r.meanM);
      series.set(r.id, prev);
    }
    expect([...series.keys()].length, 'ambas sisas medidas').toBeGreaterThanOrEqual(2);
  }

  // Veredicto de forma de curva (log-only — esta sonda MIDE, el gate vendrá
  // cuando el fix aterrice y sepamos qué número exigir).
  for (const [id, means] of series) {
    const first = means[0], last = means[means.length - 1];
    const shape = last < 0.03
      ? 'CIERRA ✓'
      : Math.abs(last - first) < 0.02
        ? 'PLANA (nunca tira o ya estancada)'
        : 'BAJA Y SE ESTANCA (la física gana)';
    console.log(`[seam-gap] sisa ${id}: ${means.map(m => (m * 100).toFixed(1) + 'cm').join(' → ')} → ${shape}`);
  }
});
