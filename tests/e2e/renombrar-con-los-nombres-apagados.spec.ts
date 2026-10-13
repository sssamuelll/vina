import { test, expect } from '@playwright/test';
import { activarHerramienta, addPiece, dispatch, st } from './helpers/lienzo';

/**
 * «Renombrar…» con los nombres de pieza apagados, que es como viene de
 * fábrica (13-10). El campo vive en la etiqueta de la pieza y la etiqueta solo
 * se pintaba con los nombres encendidos: el menú ofrecía renombrar y no salía
 * nada. El gesto entero: clic derecho, «Renombrar…», el campo a la vista y sin
 * nada encima, escribir y Enter.
 */

const ID = 'pr';

test('Renombrar con los nombres apagados abre el campo y guarda el nombre', async ({ page }) => {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
  await addPiece(page, ID, { x: 0, y: 0 }, 200, 150);
  await dispatch(page, 'editor/setZoom2D', 1);
  await dispatch(page, 'editor/setPan2D', { x: 150, y: 150 });
  await activarHerramienta(page, 'z', 'select');
  await page.waitForTimeout(200);

  const nombresVisibles = await page.evaluate(() =>
    (window as unknown as { __VINA_STORE__: { getState: () => { editor: { showPieceNames: boolean } } } })
      .__VINA_STORE__.getState().editor.showPieceNames);
  expect(nombresVisibles, 'de fábrica los nombres están apagados').toBe(false);
  await expect(page.locator('.piece-label-block')).toHaveCount(0);

  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const centro = { x: box.x + 150 + 100, y: box.y + 150 + 75 };
  await page.mouse.move(centro.x, centro.y);
  await page.mouse.click(centro.x, centro.y, { button: 'right' });
  const fila = page.locator('.context-menu').getByText('Renombrar…', { exact: true });
  await expect(fila, 'el menú de la pieza ofrece «Renombrar…»').toBeVisible({ timeout: 5000 });
  await fila.click();

  const campo = page.locator('svg.pattern-svg foreignObject input');
  await expect(campo, 'el campo aparece aunque los nombres estén apagados').toBeVisible({ timeout: 3000 });
  await expect(campo).toBeFocused();
  const encima = await campo.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
  });
  expect(encima, 'nada tapa el campo').toBe(true);

  await page.keyboard.type('Delantero');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  expect((await st(page)).project.pieces.find(p => p.id === ID)!.name).toBe('Delantero');
  await expect(campo, 'Enter cierra el campo').toHaveCount(0);
  await expect(page.locator('.piece-label-block'), 'la etiqueta vuelve a no verse').toHaveCount(0);
});
