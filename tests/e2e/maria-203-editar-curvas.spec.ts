import { test, expect, Page } from '@playwright/test';

/**
 * maria-203 — "la herramienta editar no cogía el punto de curva, yo lo clicaba
 * y nada pasaba […] no encuentro la manera de entender como puedo modelar la
 * recta".
 *
 * Tres causas, tres contratos:
 *  1. El dock tool "Edit Curve Points" (v) estaba MUERTO: activaba el tool y
 *     ningún handler de mouse ruteaba hacia él. Clicar la pieza no hacía nada.
 *  2. Convertir desde el clic derecho mutaba el outline sin entrar a ningún
 *     modo de edición: los puntos nuevos existían pero no se pintaban.
 *  3. De los dos manejadores de un segmento C solo se extraía el de entrada
 *     (v[2],v[3]); el de salida (v[0],v[1]) no existía para render ni hit-test.
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      tools: { activeTool2D: string };
      editor: { activeTool: string };
      project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }> }> };
    };
  };
}

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

const activeTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D);

async function drawRect(page: Page) {
  await page.keyboard.press('s');
  await expect.poll(() => activeTool(page), { timeout: 2000 }).toBe('rectangle');
  await page.waitForTimeout(100);
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no pattern svg');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const left = cx - 170, right = cx + 170, top = cy - 95, bottom = cy + 95;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { cx, cy, top, bottom, left, right };
}

test.describe('maria-203 — editar puntos de curva', () => {
  test.setTimeout(120_000);

  test('el dock tool Edit Curve Points (v) entra a editar nodos al clicar la pieza', async ({ page }) => {
    await waitForApp(page);
    const { cx, top } = await drawRect(page);

    await page.keyboard.press('v');
    await expect.poll(() => activeTool(page), { timeout: 2000 }).toBe('editCurve');

    // Clic sobre la pieza → editor de nodos montado con sus anclas
    await page.mouse.click(cx, top + 40);
    await expect(page.locator('.node-editor')).toHaveCount(1);
  });

  test('convertir en curva por puntos muestra los puntos al instante', async ({ page }) => {
    await waitForApp(page);
    const { cx, top } = await drawRect(page);

    await page.mouse.click(cx, top, { button: 'right' });
    await page.waitForTimeout(300);
    await page.getByText('Convertir en curva por puntos', { exact: true }).click();
    await page.waitForTimeout(500);

    // Sin pasos extra: el editor de nodos queda abierto sobre la pieza
    // y la herramienta activa es la de editar curvas — en AMBAS verdades
    // (editor.activeTool rutea los clics; tools.activeTool2D pinta el dock).
    // Asertar solo una dejó pasar una media-activación (toolActivation.ts).
    await expect(page.locator('.node-editor')).toHaveCount(1);
    await expect.poll(() => activeTool(page)).toBe('editCurve');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool))
      .toBe('editCurve');

    // Y la prueba de comportamiento: arrastrar el punto medio DEBE mover la curva.
    const before = await page.evaluate(() =>
      JSON.stringify((window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].outline));
    await page.mouse.move(cx, top);
    await page.mouse.down();
    await page.mouse.move(cx, top - 70, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() =>
      JSON.stringify((window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].outline));
    expect(after).not.toBe(before);
  });

  test('un segmento bezier recién convertido expone sus dos manejadores', async ({ page }) => {
    await waitForApp(page);
    const { cx, top } = await drawRect(page);

    await page.mouse.click(cx, top, { button: 'right' });
    await page.waitForTimeout(300);
    await page.getByText('Convertir en curva', { exact: true }).click();
    await page.waitForTimeout(500);

    // El editor queda abierto y el segmento C muestra AMBOS handles.
    await expect(page.locator('.node-editor')).toHaveCount(1);
    await expect(page.locator('.node-editor__control-handle')).toHaveCount(2);
  });
});
