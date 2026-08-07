import { test, expect, Page } from '@playwright/test';

/**
 * maria-200 — "cuando arrastras la pieza hacia otro sitio se queda una sombra
 * o residuo del sitio que la moviste... el rectangulo que contiene en el
 * espacio de esa pieza... si una pieza se va a mover que no haya residuo".
 *
 * El drag mueve la pieza por DOM directo (sin Redux por frame); la caja de
 * transformación y la barra flotante se pintan desde Redux, así que se
 * quedaban clavadas en el origen durante todo el arrastre. Y un arrastre por
 * debajo del umbral de 3px nunca comiteaba, dejando el DOM desplazado sin
 * estado que lo respalde.
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string };
    };
  };
}

const editorTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool);

async function drawRectAndSelect(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);

  await page.keyboard.press('s');
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no svg');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 150, cy - 150);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy - 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  await page.keyboard.press('z');
  await expect.poll(() => editorTool(page), { timeout: 2000 }).toBe('select');
  const px = cx - 65, py = cy - 95;
  await page.mouse.click(px, py);
  await page.waitForTimeout(400);
  return { px, py };
}

test.describe('maria-200 — mover piezas sin residuo', () => {
  test.setTimeout(120_000);

  test('la caja de seleccion se esconde durante el arrastre y vuelve al soltar', async ({ page }) => {
    const { px, py } = await drawRectAndSelect(page);

    // Seleccionada: caja visible
    await expect(page.locator('.transform-handles')).toHaveCount(1);

    // A mitad de arrastre: ni caja fantasma ni barra flotante
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 170, py + 120, { steps: 15 });
    await expect(page.locator('.transform-handles')).toHaveCount(0);
    await expect(page.locator('.floating-action-bar')).toHaveCount(0);

    // Al soltar: la caja vuelve, ya en la posición nueva
    await page.mouse.up();
    await expect(page.locator('.transform-handles')).toHaveCount(1);
  });

  test('un arrastre sub-umbral devuelve la pieza exactamente a su sitio', async ({ page }) => {
    const { px, py } = await drawRectAndSelect(page);

    const pieceG = page.locator('svg.pattern-svg [data-piece-id]').first();
    const before = await pieceG.getAttribute('transform');

    // 2px de temblor: clic, no movimiento — el DOM debe quedar como estaba
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 2, py + 1);
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await pieceG.getAttribute('transform')).toBe(before);
  });
});
