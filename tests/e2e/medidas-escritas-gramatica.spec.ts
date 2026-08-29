/**
 * Medidas escritas — la gramática en navegador real (spec 2026-08-29 § 5,
 * § 6, § 7.2, § 8). `maria-191` y `maria-195` cubren el recorrido de las
 * tarjetas; esto cubre lo que quedaba solo en jsdom: Tab en la línea interna,
 * el panel que no se traga las teclas del trazo, Escape y botón derecho a
 * mitad de arrastre del rectángulo, y el botón derecho / Retroceso / doble
 * clic de la pluma.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type Piece = { id: string; outline: Cmd[]; position: { x: number; y: number }; internals: Array<{ path: Cmd[] }> };
type StoreWindow = {
  __VINA_STORE__: {
    dispatch: (a: unknown) => void;
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number } };
      project: { pieces: Piece[] };
    };
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());
const dispatch = (page: Page, type: string, payload?: unknown) =>
  page.evaluate(([t, p]) => (window as unknown as StoreWindow).__VINA_STORE__.dispatch({ type: t, payload: p }), [type, payload] as const);

async function addPiece(page: Page, id: string, pos: { x: number; y: number }, w = 200, h = 150) {
  await dispatch(page, 'project/addPiece', {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
      { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
    ],
    internals: [], position: pos, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
}
async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}
async function clickAt(page: Page, p: { x: number; y: number }, button: 'left' | 'right' = 'left') {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y, { button });
  await page.waitForTimeout(150);
}
async function tool(page: Page, key: string, expected: string) {
  await page.keyboard.press(key);
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe(expected);
  await page.waitForTimeout(150);
}
const anchors = (path: Cmd[]) => path.filter(c => c.type !== 'Z').map(c => [c.values[c.values.length - 2], c.values[c.values.length - 1]]);

test.describe('medidas escritas — gramática', () => {
  test.setTimeout(90_000);

  test('línea interna: Tab abre el panel, Enter dentro coloca, Retroceso dentro no toca el trazo, Escape cierra y el trazo sigue', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 200, y: 250 });
    await page.keyboard.press('Tab');
    const panel = page.getByRole('dialog', { name: 'Siguiente punto' });
    await expect(panel).toBeVisible();
    await page.locator('#next-point-length').fill('80');
    await page.locator('#next-point-angle').fill('90');
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    // Retroceso dentro del campo es del campo: no quita nodos.
    await page.locator('#next-point-length').focus();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await clickAt(page, { x: 300, y: 170 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const ils = (await st(page)).project.pieces[0].internals;
    expect(ils).toHaveLength(1);
    const pts = anchors(ils[0].path);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual([50, 100]);
    expect(pts[1][0]).toBeCloseTo(50, 4);
    expect(pts[1][1]).toBeCloseTo(20, 4);
    expect(pts[2]).toEqual([150, 20]);
  });

  test('rectángulo: Escape y botón derecho a mitad de arrastre cancelan sin crear ni abrir el menú', async ({ page }) => {
    await waitForApp(page);
    await tool(page, 's', 'rectangle');
    const a = await toScreen(page, { x: 200, y: 200 });
    const b = await toScreen(page, { x: 300, y: 280 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect((await st(page)).project.pieces).toHaveLength(0);

    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.locator('.context-menu')).toHaveCount(0);
    expect((await st(page)).project.pieces).toHaveLength(0);
  });

  test('pluma: botón derecho mudo con trazo, Retroceso quita el último, doble clic termina abierta', async ({ page }) => {
    await waitForApp(page);
    await tool(page, 'h', 'pen');
    await clickAt(page, { x: 300, y: 300 });
    await clickAt(page, { x: 400, y: 300 });
    await clickAt(page, { x: 400, y: 400 });
    await clickAt(page, { x: 450, y: 450 }, 'right');
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);
    const s = await toScreen(page, { x: 300, y: 400 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.dblclick(s.x, s.y);
    await page.waitForTimeout(300);
    const pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(1);
    const pts = anchors(pieces[0].outline).map(([x, y]) => [x + pieces[0].position.x, y + pieces[0].position.y]);
    expect(pts).toEqual([[300, 300], [400, 300], [300, 400]]);
    expect(pieces[0].outline.some(c => c.type === 'Z')).toBe(false);
  });
});
