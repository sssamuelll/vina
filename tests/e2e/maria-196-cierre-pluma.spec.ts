import { test, expect, Page } from '@playwright/test';

/**
 * maria-196 — "no hay un seguro cuando te acercas al punto de origen de que
 * lo esté cerrando ahí... debería iluminarse o algo para saber que al clicar
 * allí se cierra, sin embargo ahora mismo te lo tapa la medida del largo de
 * línea y uno siente que no tiene el control de nada".
 *
 * El snap de cierre (12px) existía pero era invisible, y el pill de medida
 * se centraba EN el cursor — tapaba el punto de origen justo en el momento
 * de cerrar. Contrato: al entrar en rango de cierre el origen se ilumina y
 * la medida se quita del medio; fuera de rango, la medida vive desplazada
 * del cursor, no debajo.
 */

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string };
      project: { pieces: unknown[] };
    };
  };
}

const editorTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool);

test.describe('maria-196 — cerrar con la pluma se ve venir', () => {
  test.setTimeout(120_000);

  test('cerca del origen: anillo de cierre encendido y medida fuera del medio', async ({ page }) => {
    await waitForApp(page);

    await page.keyboard.press('h');
    await expect.poll(() => editorTool(page)).toBe('pen');

    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no svg');
    const ox = box.x + 200, oy = box.y + 200;

    // Tres puntos de un contorno
    await page.mouse.click(ox, oy);
    await page.mouse.click(ox + 150, oy + 20);
    await page.mouse.click(ox + 100, oy + 130);
    await page.waitForTimeout(300);

    // Lejos del origen: sin anillo, y la medida NO está centrada en el cursor
    await page.mouse.move(ox + 60, oy + 90);
    await page.waitForTimeout(200);
    await expect(page.locator('.pen-close-ring')).toHaveCount(0);
    const label = page.locator('.pen-distance-label');
    await expect(label).toHaveCount(1);
    const lb = await label.boundingBox();
    if (!lb) throw new Error('no label bbox');
    const labelCenter = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 };
    const distToCursor = Math.hypot(labelCenter.x - (ox + 60), labelCenter.y - (oy + 90));
    expect(distToCursor).toBeGreaterThan(10);

    // En rango de cierre (≤12px del origen): anillo encendido, medida fuera
    await page.mouse.move(ox + 5, oy + 3);
    await page.waitForTimeout(200);
    await expect(page.locator('.pen-close-ring')).toHaveCount(1);
    await expect(page.locator('.pen-distance-label')).toHaveCount(0);

    // Y clicar ahí cierra la pieza de verdad
    await page.mouse.click(ox + 5, oy + 3);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces.length))
      .toBe(1);
  });
});
