/**
 * La tela nueva en la GPU (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.3) — @gpu-local:
 * corre con playwright.webgpu.config.ts (GPU real, con ventana); CI no tiene GPU.
 *
 * La compuerta es que la GPU dé lo mismo que la CPU: menos de 0,1 mm tras 3 cuadros (§2). La velocidad y la
 * quietud se miden y quedan en el reporte; la meta de velocidad es de la camiseta, en la entrega 4.
 */
import { test, expect, type Page } from '@playwright/test';

interface ResultadoTela {
  modo: string;
  escena: string;
  vertices: number;
  gpu: string;
  dif?: { maxima: number; media: number };
  msPorCuadro?: number;
  segundosHastaQuieta?: number | null;
  estado?: { cuadro: number; cg: number; anticipados: number; alfa: number; quietud: number; quietudMaxima: number };
  error?: string;
}

async function correr(page: Page, consulta: string): Promise<ResultadoTela> {
  await page.goto(`/app/?testScene=tela-implicita&${consulta}`);
  await page.waitForFunction(
    () => (window as unknown as { __TELA_IMPLICITA__?: unknown }).__TELA_IMPLICITA__ !== undefined,
    undefined,
    { timeout: 280_000 },
  );
  const r = await page.evaluate(() => (window as unknown as { __TELA_IMPLICITA__: ResultadoTela }).__TELA_IMPLICITA__);
  console.log(`[tela-implicita] ${JSON.stringify(r)}`);
  expect(r.error, r.error).toBeUndefined();
  return r;
}

test.describe('La tela nueva en la GPU @gpu-local', () => {
  test.setTimeout(300_000);

  for (const escena of ['chica', 'apoyada']) {
    test(`da lo mismo que la CPU tras 3 cuadros (${escena})`, async ({ page }) => {
      const r = await correr(page, `modo=paridad&escena=${escena}&cg=50&cuadros=3`);
      expect(r.dif?.maxima).toBeLessThan(1e-4);
    });
  }

  for (const cg of [20, 50]) {
    test(`velocidad con unos 29 mil vértices y ${cg} iteraciones`, async ({ page }) => {
      const r = await correr(page, `modo=velocidad&escena=grande&cg=${cg}&cuadros=60`);
      expect(r.msPorCuadro).toBeGreaterThan(0);
    });
  }

  test('segundos de tela hasta quedar quieta (disco de 10 mm)', async ({ page }) => {
    const r = await correr(page, 'modo=quietud&escena=chica&cg=50');
    expect(r.estado?.quietud).not.toBeNaN();
  });
});
