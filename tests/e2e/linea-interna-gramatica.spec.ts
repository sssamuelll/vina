/**
 * Línea interna — la gramática entera en navegador real (spec 2026-08-29
 * § 4.3–§ 4.6, § 8). `maria-205-linea-interna.spec.ts` cubre el recorrido de
 * las tarjetas; esto cubre lo que quedaba solo en jsdom: tipos de punto,
 * enganche a extremos y bordes, teclado en captura, botón derecho, bloqueo,
 * anfitriona borrada y la migración del dock.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type Piece = {
  id: string; name: string; outline: Cmd[]; position: { x: number; y: number }; rotation: number;
  locked?: boolean; internals: Array<{ id: string; type: string; path: Cmd[] }>;
};
type StoreWindow = {
  __VINA_STORE__: {
    dispatch: (a: unknown) => void;
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number }; selectedPieceIds: string[] };
      project: { pieces: Piece[] };
      tools: { toolOptions: Record<string, Record<string, unknown>> };
    };
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());
const dispatch = (page: Page, type: string, payload?: unknown, meta?: unknown) =>
  page.evaluate(([t, p, m]) => (window as unknown as StoreWindow).__VINA_STORE__.dispatch({ type: t, payload: p, meta: m }), [type, payload, meta] as const);

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
const internalsOf = async (page: Page, id: string) =>
  (await st(page)).project.pieces.find(p => p.id === id)?.internals ?? [];
const types = (path: Cmd[]) => path.map(c => c.type).join('');

test.describe('línea interna — gramática', () => {
  test.setTimeout(90_000);

  test('curva por puntos desde la barra y bezier con arrastre', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await tool(page, 'g', 'internalShape');
    await page.locator('#opcion-nodeType').getByRole('button', { name: 'Curva por puntos' }).click();
    await expect.poll(async () => (await st(page)).tools.toolOptions.internalShape?.nodeType).toBe('curvePoints');
    await clickAt(page, { x: 200, y: 200 });
    await clickAt(page, { x: 240, y: 240 });
    await clickAt(page, { x: 290, y: 200 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    let ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(1);
    expect(types(ils[0].path)).toBe('MCC');

    await page.locator('#opcion-nodeType').getByRole('button', { name: 'Recta' }).click();
    const a = await toScreen(page, { x: 200, y: 260 });
    const b = await toScreen(page, { x: 230, y: 280 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    await clickAt(page, { x: 300, y: 260 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(2);
    expect(types(ils[1].path)).toBe('MC');
  });

  test('engancha al extremo de otra interna y al borde del contorno', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 200, y: 200 });
    await clickAt(page, { x: 260, y: 200 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    // A 5 px del extremo (260,200) → local (110,50) exacto
    await clickAt(page, { x: 263, y: 203 });
    await clickAt(page, { x: 290, y: 240 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    let ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(2);
    expect(ils[1].path[0].values[0]).toBeCloseTo(110, 6);
    expect(ils[1].path[0].values[1]).toBeCloseTo(50, 6);
    // A 6 px por debajo del borde superior (y=150) → sobre el borde, x conservada
    await clickAt(page, { x: 320, y: 156 });
    await clickAt(page, { x: 330, y: 240 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(3);
    expect(ils[2].path[0].values[0]).toBeCloseTo(170, 6);
    expect(ils[2].path[0].values[1]).toBeCloseTo(0, 6);
  });

  test('Retroceso quita el último sin borrar la pieza seleccionada; botón derecho abre la pareja sin menú; Escape descarta', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    await dispatch(page, 'editor/selectPiece', 'A');
    await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual(['A']);
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 200, y: 200 });
    await clickAt(page, { x: 240, y: 230 });
    await clickAt(page, { x: 290, y: 200 });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);
    expect((await st(page)).project.pieces).toHaveLength(1);
    // ENMENDADO el 2026-09-14. El título dice "botón derecho mudo" y eso dejó
    // de ser cierto con la firma D6 de María (13-09, #1160): a mitad de trazo el
    // botón derecho abre la misma pareja Largo/Ángulo que Tab. Mudo sigue
    // estándolo el MENÚ —ni el del navegador ni el de Vina— que es lo que este
    // caso vigilaba; lo que cambió es que ahora además hace algo.
    //
    // Este archivo llevaba rojo desde la PR #1166 sin que nadie lo notara: el
    // hermano de la Pluma (`medidas-escritas-gramatica.spec.ts`) sí se
    // actualizó, este no, y no está entre los doce specs del gate de deploy.
    await clickAt(page, { x: 280, y: 250 }, 'right');
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await expect(
      page.locator('input.cota--editando[aria-label="Largo"]'),
      'el derecho abre la pareja como Tab (firma D6)',
    ).toBeVisible({ timeout: 5000 });

    // Con la pareja abierta, Enter TRAZA (firma de María del 13-09). Para que
    // el Enter de abajo cierre la línea hay que soltarla antes: es la escalera
    // de Escape. El PRIMERO cierra el campo y se lo come el propio chip (no
    // llega al router); el SEGUNDO suelta la pareja. Ninguno de los dos toca el
    // borrador, y se ve en este mismo caso: si alguno lo descartara, el Enter
    // de abajo no tendría trazo que cerrar y `ils` saldría 0, no 1.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    let ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(1);
    expect(types(ils[0].path)).toBe('ML');

    await clickAt(page, { x: 200, y: 260 });
    await clickAt(page, { x: 240, y: 280 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    ils = await internalsOf(page, 'A');
    expect(ils).toHaveLength(1);
  });

  test('una pieza bloqueada avisa y no arma; la anfitriona borrada a mitad de trazo avisa y descarta', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });
    const piece = (await st(page)).project.pieces[0];
    await dispatch(page, 'project/updatePiece', { ...piece, locked: true });
    await page.waitForTimeout(200);
    await tool(page, 'g', 'internalShape');
    await clickAt(page, { x: 200, y: 200 });
    await expect(page.locator('.toast__message', { hasText: /bloqueada/i })).toBeVisible();
    await clickAt(page, { x: 240, y: 230 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect(await internalsOf(page, 'A')).toHaveLength(0);

    await dispatch(page, 'project/updatePiece', { ...piece, locked: false });
    await page.waitForTimeout(200);
    await clickAt(page, { x: 200, y: 200 });
    await clickAt(page, { x: 240, y: 230 });
    await dispatch(page, 'project/removePiece', 'A', { skipConfirmation: true });
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast__message', { hasText: /ya no existe/i })).toBeVisible();
    expect((await st(page)).project.pieces).toHaveLength(0);
  });
});

test.describe('línea interna — dock persistido', () => {
  test('un dock guardado con "line" arranca con Línea interna en su ranura', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vina-docks', JSON.stringify({
        version: 1,
        data: {
          pinnedExtra: { left: [], right: [] }, signaling: 'subtle',
          tools2d: ['select', 'editPattern', 'point', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam', 'seamEdit', 'seamAllowance', 'notch'],
        },
      }));
    });
    await waitForApp(page);
    await expect(page.getByRole('button', { name: /^Línea interna/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Línea ·/ })).toHaveCount(0);
  });
});
