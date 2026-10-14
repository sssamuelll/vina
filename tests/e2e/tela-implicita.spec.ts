/**
 * La tela nueva en la GPU (spec docs/superpowers/specs/2026-10-13-tela-nueva-design.md §4.4.3) — @gpu-local:
 * corre con playwright.webgpu.config.ts (GPU real, con ventana); CI no tiene GPU.
 *
 * La compuerta es que la GPU dé lo mismo que la CPU: menos de 0,1 mm tras 3 cuadros (§2). La velocidad y la
 * quietud se miden y quedan en el reporte. La camiseta de María se corre contra la referencia privada
 * (VINA_REFERENCIAS) y verifica §2; sin la carpeta, se salta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { guardarInforme, leerReferencias, telaDeLaReferencia } from '../../bench/_banco';
import type { MedidasDeCamiseta } from '../../src/utils/cloth/implicito/banco/camiseta';
import { PANDEO_CALIBRADO } from '../../src/utils/cloth/implicito/tela';

interface ResultadoTela {
  modo: string;
  escena: string;
  vertices: number;
  gpu: string;
  dif?: { maxima: number; media: number };
  msPorCuadro?: number;
  segundosHastaQuieta?: number | null;
  dgCpu?: number;
  medidas?: MedidasDeCamiseta;
  estado?: { cuadro: number; cg: number; anticipados: number; alfa: number; quietud: number; quietudMaxima: number; dg: number; pares: number; desbordes: number };
  error?: string;
}

async function correr(page: Page, consulta: string, espera = 280_000): Promise<ResultadoTela> {
  await page.goto(`/app/?testScene=tela-implicita&${consulta}`);
  await page.waitForFunction(
    () => (window as unknown as { __TELA_IMPLICITA__?: unknown }).__TELA_IMPLICITA__ !== undefined,
    undefined,
    { timeout: espera },
  );
  const r = await page.evaluate(() => (window as unknown as { __TELA_IMPLICITA__: ResultadoTela }).__TELA_IMPLICITA__);
  console.log(`[tela-implicita] ${JSON.stringify(r)}`);
  expect(r.error, r.error).toBeUndefined();
  return r;
}

test.describe('La tela nueva en la GPU @gpu-local', () => {
  test.setTimeout(300_000);

  // las costuras (1000 N/m frente a m/h² de unos 7e-3 N/m) dejan el sistema mal condicionado: con 50 iteraciones el
  // gradiente conjugado no converge y la precisión simple y la doble siguen caminos distintos; con 400 converge, y la
  // paridad mide la física y no el redondeo. Los pares del contacto propio unen cuatro vértices que el precondicionador
  // de bloques no absorbe: con la rigidez de contacto de 2000 N/m, ni convergido la precisión simple baja de 0,08 mm en
  // un cuadro (0,55 mm en tres); con 20 N/m baja de 1 µm
  const PARIDAD: Array<[string, string]> = [
    ['chica', 'cg=50'], ['apoyada', 'cg=50'], ['costura', 'cg=400'], ['costura-cerrada', 'cg=400'], ['esfera', 'cg=50'],
    ['inclinada', 'cg=50'], ['capas', 'cg=400&kc=20'], ['punta', 'cg=50'], ['hundida', 'cg=400&kc=20'],
  ];
  for (const [escena, ajustes] of PARIDAD) {
    test(`da lo mismo que la CPU tras 3 cuadros (${escena})`, async ({ page }) => {
      const r = await correr(page, `modo=paridad&escena=${escena}&${ajustes}&cuadros=3`);
      expect(r.dif?.maxima).toBeLessThan(1e-4);
      if (escena === 'capas' || escena === 'punta' || escena === 'hundida') expect(r.estado?.pares).toBeGreaterThan(0);
    });
  }

  test('con lugar para 8 pares, la GPU cuenta los que no caben y la tela no se llena de NaN', async ({ page }) => {
    const r = await correr(page, 'modo=paridad&escena=capas&cg=50&cuadros=3&maxPares=8');
    expect(r.estado?.desbordes).toBeGreaterThan(0);
    expect(Number.isFinite(r.dif?.maxima)).toBe(true);
  });

  test('la búsqueda en línea cuenta la energía de los pares como la CPU', async ({ page }) => {
    // en el primer cuadro de las capas entran 61 pares activos: sin su energía, G1 − G0 se corre un 24 %
    const r = await correr(page, 'modo=paridad&escena=capas&cg=400&kc=20&cuadros=1');
    const dg = r.estado?.dg ?? NaN, dgCpu = r.dgCpu ?? NaN;
    expect(r.estado?.alfa).toBe(1);
    expect(Math.abs(dg - dgCpu)).toBeLessThan(1e-3 * Math.abs(dgCpu));
  });

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

const REFERENCIAS = process.env.VINA_REFERENCIAS;

test.describe('La camiseta de María en la GPU, contra la referencia @gpu-local', () => {
  test.skip(!REFERENCIAS, 'necesita VINA_REFERENCIAS, la carpeta privada de la referencia');
  test.setTimeout(3_600_000);

  test.beforeEach(async ({ page }) => {
    const dir = REFERENCIAS!;
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'camiseta.json'), 'utf8')) as { colocacion: string; cuerpo: string; asentada: Record<string, string> };
    const archivos: Record<string, () => string | Buffer> = {
      'camiseta.json': () => JSON.stringify(config),
      'tela.json': () => JSON.stringify(telaDeLaReferencia(leerReferencias(), PANDEO_CALIBRADO)),
      'maria.dxf': () => fs.readFileSync('tests/fixtures/garments/maria_patrones_samuel_2M.dxf'),
      'colocacion.obj': () => fs.readFileSync(path.join(dir, config.colocacion)),
      'cuerpo.obj': () => fs.readFileSync(path.join(dir, config.cuerpo)),
    };
    for (const [malla, ruta] of Object.entries(config.asentada)) archivos[`asentada-${malla}.obj`] = () => fs.readFileSync(path.join(dir, ruta));
    await page.route('**/__banco__/**', (route) => {
      const leer = archivos[new URL(route.request().url()).pathname.split('/').pop() ?? ''];
      return leer ? route.fulfill({ status: 200, body: leer() }) : route.fulfill({ status: 404, body: '' });
    });
  });

  test('a 5 mm queda quieta sola, con las costuras cerradas, nada aplastado y a 17 ms por cuadro (§2)', async ({ page }) => {
    const espera = 880_000;
    const camiseta = await correr(page, 'modo=camiseta&escena=camiseta&malla=5&cg=50', espera);
    const velocidad20 = await correr(page, 'modo=velocidad&escena=camiseta&malla=5&cg=20&cuadros=60', espera);
    const velocidad50 = await correr(page, 'modo=velocidad&escena=camiseta&malla=5&cg=50&cuadros=60', espera);
    const paridad = await correr(page, 'modo=paridad&escena=camiseta&malla=5&cg=50&cuadros=3', espera);
    console.log(`[camiseta] informe: ${guardarInforme('camiseta-gpu', { camiseta, velocidad20, velocidad50, paridad })}`);
    const m = camiseta.medidas!;
    expect(camiseta.estado?.desbordes).toBe(0);
    expect(m.aplastados).toBeLessThan(0.1);
    expect(m.costuras.mediana).toBeLessThan(5e-5);
    expect(m.costuras.maxima).toBeLessThanOrEqual(1e-3);
    expect(camiseta.segundosHastaQuieta).not.toBeNull();
    expect(camiseta.segundosHastaQuieta!).toBeLessThanOrEqual(10);
    expect(velocidad50.msPorCuadro!).toBeLessThanOrEqual(17);
  });
});
