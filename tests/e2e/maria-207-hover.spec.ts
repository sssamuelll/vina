import { test, expect, Page } from '@playwright/test';

/**
 * maria-207 — "el efecto de Hoover, al pasar el mouse sobre las piezas hace
 * conflicto para que las herramientas editar o mover puntos dejen clicarlos y
 * editarlos. Aparte no queremos ese efecto porque iluminan constantemente la
 * pieza [...] es muy molesta esa iluminación persistente. Osea que eliminemos
 * a Hoover."
 *
 * maria-210 — "al crear costuras [...] se queda sombreado todo el rato y al
 * pasar el ratón por esas líneas aparece información de esta costura pero eso
 * solo debería verse al activar el menu de costuras porque es información que
 * molesta y no debería mostrarse mientras editamos el patron".
 *
 * Reproducido y medido antes de tocar nada (2026-08-10):
 *  - El relleno de hover pasaba de opacidad 0 a 0.1 sobre CUALQUIER pieza.
 *  - `.pattern-piece { cursor: pointer }` pisaba el cursor que la herramienta
 *    activa pide: con el tool Punto, getCursor() devolvía "crosshair" y el
 *    usuario veía "pointer" — es decir, la única superficie donde el tool se
 *    usa era la única donde su cursor no se veía. (El clic SÍ funcionaba: el
 *    contorno pasó de 5 a 6 comandos. Lo roto era la señal, no el verbo.)
 *  - Con una costura hecha y la flecha activa se pintaban 2 resaltes y el
 *    hover sacaba .seam-detail a opacidad 1 mientras se editaba el patrón.
 */

interface StoreWindow {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => { tools: { activeTool2D: string } };
  };
}

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function setTool(page: Page, id: string) {
  await page.evaluate(i => {
    const s = (window as unknown as StoreWindow).__VINA_STORE__;
    s.dispatch({ type: 'editor/setActiveTool', payload: i });
    s.dispatch({ type: 'tools/setActiveTool2D', payload: i });
  }, id);
  await page.waitForTimeout(150);
}

const activeTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D);

async function drawRect(page: Page) {
  await page.keyboard.press('s');
  await expect.poll(() => activeTool(page)).toBe('rectangle');
  await page.waitForTimeout(150);
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no pattern svg');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 170, cy - 95);
  await page.mouse.down();
  await page.mouse.move(cx + 170, cy + 95, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { cx, cy, top: cy - 95 };
}

const rect = (w: number) => ([
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
]);

async function sewTwoPieces(page: Page) {
  const base = { internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1 };
  await page.evaluate(([a, b, s]) => {
    const st = (window as unknown as StoreWindow).__VINA_STORE__;
    st.dispatch({ type: 'project/addPiece', payload: a });
    st.dispatch({ type: 'project/addPiece', payload: b });
    st.dispatch({ type: 'project/addSeam', payload: s });
  }, [
    { ...base, id: 'm207-a', name: 'A', outline: rect(100), position: { x: 60, y: 160 } },
    { ...base, id: 'm207-b', name: 'B', outline: rect(160), position: { x: 260, y: 160 } },
    { id: 'm207-s', pieceA: { pieceId: 'm207-a', edgeName: 'edge-0' }, pieceB: { pieceId: 'm207-b', edgeName: 'edge-0' }, type: 'standard', tension: 80, strength: 1, active: true, taped: false, tapeWidth: 10 },
  ]);
  await page.waitForTimeout(500);
}

test.describe('maria-207 — fuera el resaltado al pasar el ratón', () => {
  test.setTimeout(120_000);

  test('pasar el ratón por una pieza ya no la ilumina', async ({ page }) => {
    await waitForApp(page);
    const { cx, cy } = await drawRect(page);
    await setTool(page, 'select');

    // El overlay de hover ya no existe en el DOM: no hay nada que encender.
    await expect(page.locator('[data-piece-id] .piece-hover-fill')).toHaveCount(0);

    // Y la pieza no cambia de pinta entre "sin ratón" y "con ratón encima".
    const fill = page.locator('[data-piece-id] .piece-fill').first();
    await page.mouse.move(cx, cy + 320);
    await page.waitForTimeout(200);
    const fuera = await fill.evaluate(el => getComputedStyle(el).fill);
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(200);
    expect(await fill.evaluate(el => getComputedStyle(el).fill)).toBe(fuera);
  });

  test('el cursor que pide la herramienta sobrevive encima de la pieza', async ({ page }) => {
    await waitForApp(page);
    const { cx, top } = await drawRect(page);
    await setTool(page, 'point');
    await page.mouse.move(cx, top);
    await page.waitForTimeout(250);

    // Lo que el SVG declara y lo que se ve encima de la pieza tienen que coincidir.
    const pedido = await page.locator('svg.pattern-svg').evaluate(el => (el as SVGElement).style.cursor);
    const visto = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? getComputedStyle(el).cursor : 'nada';
    }, [cx, top]);
    expect(pedido).not.toBe('');
    expect(visto).toBe(pedido);
  });
});

test.describe('maria-210 — la info de costura solo con el menú de costuras', () => {
  test.setTimeout(120_000);

  test('editando el patrón no se pinta ninguna costura', async ({ page }) => {
    await waitForApp(page);
    await sewTwoPieces(page);

    await setTool(page, 'select');
    await page.waitForTimeout(300);
    await expect(page.locator('.seam-connection')).toHaveCount(0);
  });

  test('al entrar al menú de costuras vuelven a verse', async ({ page }) => {
    await waitForApp(page);
    await sewTwoPieces(page);

    await setTool(page, 'seam');
    await page.waitForTimeout(300);
    await expect(page.locator('.seam-connection')).toHaveCount(1);
  });
});
