import { test, expect, type Page } from '@playwright/test';
import { enReposo } from './helpers/superficies';
import { loQueSobra } from './helpers/reposo';
import { leerBaseline, fijarBaseline, techoDe } from './helpers/trinquete';
import { abrirAppVacia, cargarDxfDeMaria, reposo, cambiarVista } from './helpers/estados';

/**
 * Trinquete de reposo (spec 2026-10-02 «la interfaz en papel» § 3 ley 2 y § 9).
 *
 * En cada uno de los cuatro reposos cuenta las superficies visibles que NO
 * perduran: ni ambiente, ni documento, ni la frase de ayuda (ni, en la pantalla
 * vacía, el estado vacío). Falla si la cuenta supera la línea base guardada en
 * `reposo-baseline.json`. La meta es 0: cada fase del rediseño la baja.
 *
 * Un solo test para los cuatro: cada carga de la app con el DXF cuesta de 30 a
 * 50 s en esta máquina y este trinquete corre en el gate del deploy. Con
 * `expect.soft`, un reposo que falla no esconde a los otros tres.
 */
const BASELINE = 'tests/e2e/reposo-baseline.json';
const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};

async function registrar(estado: string, page: Page, vacia = false): Promise<void> {
  const sobran = loQueSobra(await enReposo(page), vacia);
  medidas[estado] = sobran.length;
  const techo = techoDe(baseline, estado);
  console.log(`reposo · ${estado}: sobran ${sobran.length} [${sobran.join(', ')}] · línea base ${baseline.estados[estado] ?? '—'} · meta ${baseline.meta}`);
  if (techo !== undefined) {
    expect.soft(sobran.length, `${estado}: en reposo sobran ${sobran.join(', ')}`).toBeLessThanOrEqual(techo);
  }
}

test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });
test.afterAll(() => {
  if (process.env.REPOSO_UPDATE) fijarBaseline(BASELINE, medidas);
});

test('en reposo solo está lo que perdura', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirAppVacia(page);

  await test.step('vacía', async () => {
    await cambiarVista(page, 'Split');
    await reposo(page);
    await registrar('vacía', page, true);
  });
  await test.step('2D con patrón', async () => {
    await cambiarVista(page, '2D');
    await cargarDxfDeMaria(page);
    await reposo(page);
    await registrar('2D con patrón', page);
  });
  await test.step('Split con patrón', async () => {
    await cambiarVista(page, 'Split');
    await reposo(page);
    await registrar('Split con patrón', page);
  });
  await test.step('3D con patrón', async () => {
    await cambiarVista(page, '3D');
    await reposo(page);
    await registrar('3D con patrón', page);
  });
});
