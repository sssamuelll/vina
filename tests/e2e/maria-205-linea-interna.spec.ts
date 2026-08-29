/**
 * maria-205 / #206 / #209 — "Línea interna", una sola herramienta.
 *
 * El mismo experimento que reprodujo las tarjetas el 2026-08-29, ahora en
 * verde: cambiar de herramienta no deja un inicio fantasma (Línea creaba una
 * línea desde el punto viejo al volver); Enter y el doble clic terminan una
 * línea abierta (Forma interna solo cerraba con Z); clicar a 5 px de un
 * vértice guarda el vértice exacto (guardaba el punto a 5,00 mm); y la línea
 * cae en la pieza bajo el cursor (caía en la última creada).
 *
 * Spec: docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md § 12.2
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type Piece = {
  id: string; name: string; outline: Cmd[]; position: { x: number; y: number }; rotation: number;
  internals: Array<{ id: string; type: string; path: Cmd[] }>;
};
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

async function addPiece(page: Page, id: string, pos: { x: number; y: number }, rotation = 0, w = 200, h = 150) {
  await dispatch(page, 'project/addPiece', {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
      { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
    ],
    internals: [], position: pos, rotation, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
}

/** patrón → pantalla, leyendo zoom/pan reales del store. */
async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}
async function clickAt(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(150);
}
async function tool(page: Page, key: string, expected: string) {
  await page.keyboard.press(key);
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe(expected);
  await page.waitForTimeout(150);
}
const internalsOf = async (page: Page, id: string) =>
  (await st(page)).project.pieces.find(p => p.id === id)!.internals;

/** El mismo transform de pieceSpace.ts: giro alrededor del centro del bbox, luego posición. */
function localToWorld(local: { x: number; y: number }, piece: { position: { x: number; y: number }; rotation: number }, w = 200, h = 150) {
  const cx = w / 2, cy = h / 2;
  const rad = (piece.rotation * Math.PI) / 180;
  const dx = local.x - cx, dy = local.y - cy;
  const x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  return { x: x + piece.position.x, y: y + piece.position.y };
}

test.describe('maria-205 — línea interna', () => {
  test.setTimeout(90_000);

  test('cambiar de herramienta no deja un inicio fantasma', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 200, y: 200 });
    await tool(page, 'z', 'select');
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 260, y: 230 });
    expect(await internalsOf(page, 'A')).toHaveLength(0);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    expect(await internalsOf(page, 'A')).toHaveLength(0);
    await page.keyboard.press('Escape');
  });

  test('Enter termina una línea abierta y el doble clic también, sin nodo repetido', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 200, y: 200 });
    await clickAt(page, { x: 240, y: 230 });
    await clickAt(page, { x: 290, y: 200 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    let ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(1);
    expect(ils[0].path.map(c => c.type).join('')).toBe('MLL');
    expect(ils[0].type).toBe('reference');

    await clickAt(page, { x: 200, y: 260 });
    await clickAt(page, { x: 240, y: 280 });
    const s = await toScreen(page, { x: 290, y: 260 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.dblclick(s.x, s.y);
    await page.waitForTimeout(300);
    ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(2);
    expect(ils[1].path.map(c => c.type).join('')).toBe('MLL');
  });

  test('clicar a 5 px de un vértice engancha exacto, también con la pieza girada', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    // Debajo de A y no a su derecha: en vista Split el lienzo 2D mide ~640 px
    // de ancho y el vértice girado de una B en (500,150) caía fuera del SVG.
    await addPiece(page, 'B', { x: 150, y: 350 }, 90);
    await tool(page, 'g', 'internalShape');

    await clickAt(page, { x: 154, y: 153 });
    await clickAt(page, { x: 250, y: 220 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const a = await internalsOf(page, 'A');
    expect(a).toHaveLength(1);
    expect(a[0].path[0].values[0]).toBeCloseTo(0, 6);
    expect(a[0].path[0].values[1]).toBeCloseTo(0, 6);

    const b = (await st(page)).project.pieces.find(p => p.id === 'B')!;
    const v = localToWorld({ x: 0, y: 0 }, b);
    await clickAt(page, { x: v.x + 4, y: v.y + 3 });
    const inside = localToWorld({ x: 100, y: 75 }, b);
    await clickAt(page, inside);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const bi = await internalsOf(page, 'B');
    expect(bi).toHaveLength(1);
    expect(bi[0].path[0].values[0]).toBeCloseTo(0, 6);
    expect(bi[0].path[0].values[1]).toBeCloseTo(0, 6);
  });

  test('la línea cae en la pieza bajo el cursor y el doble clic sobre el primer nodo cierra sin fantasma', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await addPiece(page, 'B', { x: 150, y: 350 });
    await tool(page, 'g', 'internalShape');

    await clickAt(page, { x: 200, y: 200 });
    await clickAt(page, { x: 260, y: 230 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect(await internalsOf(page, 'A')).toHaveLength(1);
    expect(await internalsOf(page, 'B')).toHaveLength(0);
    expect((await internalsOf(page, 'A'))[0].path[0].values).toEqual([50, 50]);

    await clickAt(page, { x: 200, y: 260 });
    await clickAt(page, { x: 260, y: 260 });
    await clickAt(page, { x: 230, y: 290 });
    const s = await toScreen(page, { x: 202, y: 261 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.dblclick(s.x, s.y);
    await page.waitForTimeout(300);
    const ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(2);
    expect(ils[1].path.map(c => c.type).join('')).toBe('MLLZ');
    // Sin trazo fantasma: un Enter después no crea nada.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect(await internalsOf(page, 'A')).toHaveLength(2);
  });
});
