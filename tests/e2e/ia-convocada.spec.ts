import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, reposo, centroDePieza } from './helpers/estados';

/**
 * La IA convocada (spec 2026-10-02 «la interfaz en papel» § 6.2), en la
 * pantalla de María (1366 × 643, Split). Lo que jsdom no ve: dónde aparece la
 * cápsula, que no está en reposo, y que sus puertas abren de verdad.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });
test.use({ viewport: { width: 1366, height: 643 } });

const leer = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { ia: { abierta: boolean }; editor: { selectedPieceIds: string[] } } } })
    .__VINA_STORE__.getState());

test('no existe en reposo; «IA» la abre sobre la línea al pie, en papel, de una línea', async ({ page }) => {
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await reposo(page);
  await expect(page.locator('.unified-bar')).toHaveCount(0);
  const ia = page.getByRole('button', { name: 'Conversar con la IA' });
  await expect(ia).toHaveAttribute('aria-pressed', 'false');

  await ia.click();
  const barra = page.locator('.unified-bar');
  await expect(barra).toBeVisible();
  await expect(barra).toHaveAttribute('data-material', 'papel');
  await expect(page.getByPlaceholder('Pide algo o pregunta')).toBeFocused();
  const caja = (await barra.boundingBox())!;
  expect(Math.round(caja.width)).toBe(560);
  expect(Math.round(caja.height)).toBe(48);
  const lineaTop = await page.locator('.linea-al-pie').evaluate((e) => e.getBoundingClientRect().top);
  expect(caja.y + caja.height, 'la cápsula pisa la línea al pie').toBeLessThanOrEqual(lineaTop);
  await expect(ia).toHaveAttribute('aria-pressed', 'true');
});

test('la conversación sobrevive a ocultarla; Esc la oculta sin soltar la pieza', async ({ page }) => {
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('z');
  const c = await centroDePieza(page);
  await page.mouse.click(c.x, c.y);
  const seleccion = (await leer(page)).editor.selectedPieceIds;
  expect(seleccion.length, 'el caso no se ejerce: no hay pieza seleccionada').toBe(1);

  await page.keyboard.press('Control+/');
  const campo = page.getByPlaceholder('Pide algo o pregunta');
  await expect(campo).toBeFocused();
  await campo.fill('hola');
  await page.keyboard.press('Enter');
  await expect(page.locator('.unified-bar__panel')).toContainText('hola');

  await page.keyboard.press('Escape');
  await expect(page.locator('.unified-bar')).toHaveCount(0);
  expect((await leer(page)).editor.selectedPieceIds, 'el Escape de la barra soltó la pieza').toEqual(seleccion);

  await page.keyboard.press('Control+/');
  await expect(page.locator('.unified-bar__panel')).toContainText('hola');
});

test('Ctrl+K abre los comandos; un comando abre su panel y la barra se va', async ({ page }) => {
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Escribe un comando')).toBeFocused();
  await page.locator('.unified-bar__input').fill('IA y ratón');
  await page.locator('.unified-bar__panel').getByText('IA y ratón', { exact: true }).first().click();
  await expect(page.locator('.context-panel__header', { hasText: 'IA y ratón' })).toBeVisible();
  await expect(page.locator('.unified-bar')).toHaveCount(0);
});

test('la pantalla vacía la llama, y la cápsula no tapa «Importar DXF»', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('empty-state-2d')).toBeVisible({ timeout: 20_000 });
  await page.locator('.empty-state-2d__ai-hint').click();
  const barra = page.locator('.unified-bar');
  await expect(barra).toBeVisible();
  await expect(page.locator('.unified-bar__input')).toBeFocused();
  const importar = (await page.getByRole('button', { name: 'Importar DXF' }).boundingBox())!;
  const caja = (await barra.boundingBox())!;
  const solapan = importar.x < caja.x + caja.width && caja.x < importar.x + importar.width
    && importar.y < caja.y + caja.height && caja.y < importar.y + importar.height;
  expect(solapan, 'la cápsula tapa «Importar DXF»').toBe(false);
});
