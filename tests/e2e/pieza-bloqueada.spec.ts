import { test, expect, Page } from '@playwright/test';

/**
 * maria-192 — "creo que debería cambiar a otro color o algo que cambiase, por
 * ejemplo en Clo las piezas se vuelven huecas con el margen de línea
 * discontinuo... puede ser cualquier cosa que dé a notar que algo distinto le
 * pasa a esa pieza".
 *
 * Bloqueó una pieza sin querer y creyó que el programa se había roto. Había un
 * aviso —la palabra `locked` en 10 px al centro— que no vio.
 *
 * El test que importa no es el del aspecto: es que la pieza hueca SIGA siendo
 * seleccionable. Con `fill: none` el relleno deja de pintarse y se lleva su
 * área de impacto, y la pieza quedaría imposible de desbloquear.
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      tools: { activeTool2D: string };
      editor: { selectedPieceIds: string[] };
      project: { pieces: Array<{ id: string; locked?: boolean }> };
    };
    dispatch: (a: unknown) => void;
  };
}

const store = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function drawRectangle(page: Page) {
  await page.keyboard.press('s');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D), { timeout: 3000 })
    .toBe('rectangle');
  await page.locator('[data-testid="empty-state-2d"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});

  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no pattern svg');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx - 160, cy - 90);
  await page.mouse.down();
  await page.mouse.move(cx + 160, cy + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { cx, cy };
}

const cutLine = (page: Page) =>
  page.locator('svg.pattern-svg [data-testid="piece-cut-line"]').first();

test.describe('maria-192 — una pieza bloqueada se distingue', () => {
  test.setTimeout(120_000);

  test('al bloquear se vuelve hueca y de trazos', async ({ page }) => {
    await waitForApp(page);
    const { cx, cy } = await drawRectangle(page);

    const fillPath = page.locator('svg.pattern-svg .piece-fill').first();
    const fillBefore = await fillPath.evaluate(el => getComputedStyle(el).fill);
    expect(await cutLine(page).getAttribute('stroke-dasharray')).toBeFalsy();
    expect(fillBefore).not.toBe('none');

    await page.mouse.click(cx, cy, { button: 'right' });
    await page.waitForTimeout(350);
    await page.getByText('Bloquear', { exact: true }).click();
    await page.waitForTimeout(500);

    expect((await store(page)).project.pieces[0].locked).toBe(true);

    // Hueca: el relleno ya no pinta color.
    const fillAfter = await fillPath.evaluate(el => getComputedStyle(el).fill);
    expect(fillAfter).not.toBe(fillBefore);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(fillAfter);

    // Y el contorno pasa a trazos.
    expect(await cutLine(page).getAttribute('stroke-dasharray')).toBeTruthy();
  });

  test('la pieza hueca SIGUE siendo seleccionable — si no, no habría cómo desbloquearla', async ({ page }) => {
    await waitForApp(page);
    const { cx, cy } = await drawRectangle(page);

    await page.mouse.click(cx, cy, { button: 'right' });
    await page.waitForTimeout(350);
    await page.getByText('Bloquear', { exact: true }).click();
    await page.waitForTimeout(500);

    // Suelta la selección que dejó el bloqueo, para que el clic siguiente sea
    // el que tenga que volver a encontrarla.
    await page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.dispatch({ type: 'editor/clearSelection' }));
    await page.waitForTimeout(300);
    expect((await store(page)).editor.selectedPieceIds).toHaveLength(0);

    // Clic en el INTERIOR de la pieza hueca: es exactamente el punto que
    // `fill: none` habría dejado sin área de impacto.
    await page.keyboard.press('z');
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);

    expect((await store(page)).editor.selectedPieceIds).toHaveLength(1);

    // Y desde ahí se puede desbloquear.
    await page.mouse.click(cx, cy, { button: 'right' });
    await page.waitForTimeout(350);
    await page.getByText('Desbloquear', { exact: true }).click();
    await page.waitForTimeout(400);
    expect((await store(page)).project.pieces[0].locked).toBe(false);
  });
});
