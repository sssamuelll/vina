/**
 * maria-195 — "estaría guay que saliera un menú donde tú pudieras elegir qué
 * largo de línea quieres crear, incluso el ángulo respecto al origen".
 *
 * Tab abre "Siguiente punto" en la pluma (y en la línea interna); Enter
 * dentro coloca y el panel se queda abierto; Escape lo cierra; Enter fuera
 * termina. 0° a la derecha, 90° hacia arriba tal como se ve en pantalla.
 *
 * Spec: docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md § 7.2
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type StoreWindow = {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number } };
      project: { pieces: Array<{ outline: Cmd[]; position: { x: number; y: number } }> };
    };
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());

async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}

test.describe('maria-195 — siguiente punto por largo y ángulo', () => {
  test.setTimeout(90_000);

  test('pluma: Tab, 80/90, Enter, 50/0, Enter, Escape, Enter → tres puntos exactos', async ({ page }) => {
    await waitForApp(page);
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    const s = await toScreen(page, { x: 300, y: 400 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(150);

    await page.keyboard.press('Tab');
    const panel = page.getByRole('dialog', { name: 'Siguiente punto' });
    await expect(panel).toBeVisible();

    await page.locator('#next-point-length').fill('80');
    await page.locator('#next-point-angle').fill('90');
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(page.locator('#next-point-length')).toBeFocused();

    await page.locator('#next-point-length').fill('50');
    await page.locator('#next-point-angle').fill('0');
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    // Fuera del panel, Enter termina la pieza abierta.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(1);
    const pts = pieces[0].outline.filter(c => c.type !== 'Z').map(c => {
      const v = c.values;
      return [v[v.length - 2] + pieces[0].position.x, v[v.length - 1] + pieces[0].position.y];
    });
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(300, 4); expect(pts[0][1]).toBeCloseTo(400, 4);
    expect(pts[1][0]).toBeCloseTo(300, 4); expect(pts[1][1]).toBeCloseTo(320, 4);
    expect(pts[2][0]).toBeCloseTo(350, 4); expect(pts[2][1]).toBeCloseTo(320, 4);
  });
});
