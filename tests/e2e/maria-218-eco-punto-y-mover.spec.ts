import { test, expect, Page } from '@playwright/test';

/**
 * maria-218 — "Estando ahora en la herramienta punto, cuando he creado un
 * punto, clicando en la linea de la pieza, se crea automáticamente el nuevo
 * punto pero tambien aparece como un marco con los mismos puntos de la pieza
 * pero trasladados en otro sitio, como si fuera un eco."
 *
 * Los fantasmas de su foto son glifos `bezierAnchor` — círculos huecos con halo
 * blanco — flotando sobre lona vacía, lejos de cualquier pieza.
 *
 * Causa, reproducida el 2026-08-11: los verbos de `useEditPattern` aceptan un
 * `pieceId` explícito "para callers fuera del modo edición", y el tool Punto es
 * uno. Pero `dispatchAndRefresh` pisaba `state.nodes` con las anclas de la
 * pieza que tocó el verbo sin mirar cuál se está editando. Con "Editar patrón"
 * abierto sobre A y un punto puesto sobre B, el overlay se quedaba con las
 * anclas de B y la transformada de A: coordenadas locales de una pieza pintadas
 * en el sitio de otra.
 *
 * No es el #194 otra vez. Aquel era el arrastre (posición de Redux contra
 * transform de DOM) y se cerró escondiendo las anclas mientras dura. Este no
 * necesita ningún arrastre — que es justo por lo que aquel fix no lo tapó.
 */

interface StoreWindow {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => { tools: { activeTool2D: string }; project: { pieces: { id: string }[] } };
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
  await page.waitForTimeout(200);
}

const activeTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D);

const pieceCount = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces.length);

/** Dibuja un rectángulo entre dos esquinas de pantalla. */
async function drawRectAt(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.keyboard.press('s');
  await expect.poll(() => activeTool(page)).toBe('rectangle');
  // El cartel de lona vacía se come el primer arrastre si no se espera a que
  // se desmonte: sin esto, el primer rectángulo no llega a existir.
  await page.locator('[data-testid="empty-state-2d"]')
    .waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

/** Centros en pantalla de cada ancla dibujada por los overlays de edición. */
const anchorCentres = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-anchor-role]')).map(el => {
    const r = (el as SVGGElement).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }));

test.describe('maria-218 — el eco de la pieza al crear un punto', () => {
  test.setTimeout(120_000);

  test('poner un punto en otra pieza no deja anclas flotando fuera de la que se edita', async ({ page }) => {
    await waitForApp(page);
    const box = await page.locator('svg.pattern-svg').boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    // Pieza A, a la izquierda. Pieza B, bien separada a la derecha.
    // Dentro de ±170 del centro: fuera de esa banda el arrastre no llega a la
    // lona y la pieza no se crea.
    const A = { left: cx - 160, top: cy - 130, right: cx - 20, bottom: cy - 20 };
    const B = { left: cx + 20, top: cy + 20, right: cx + 160, bottom: cy + 130 };
    await drawRectAt(page, A.left, A.top, A.right, A.bottom);
    await drawRectAt(page, B.left, B.top, B.right, B.bottom);
    await expect.poll(() => pieceCount(page)).toBe(2);

    // Editar patrón sobre A: sus anclas quedan pintadas.
    await setTool(page, 'editPattern');
    await page.mouse.click((A.left + A.right) / 2, A.bottom);
    await page.waitForTimeout(400);
    const enA = await anchorCentres(page);
    expect(enA.length).toBeGreaterThan(0);

    // Sin salir de la edición, herramienta punto y clic sobre el borde de B.
    await setTool(page, 'point');
    await page.waitForTimeout(300);
    await page.mouse.click((B.left + B.right) / 2, B.top);
    await page.waitForTimeout(600);

    // Ni una sola ancla puede caer fuera de la caja de A. Antes del fix, las de
    // B aparecían con la posición de A: sobre lona vacía.
    const M = 30; // margen: el glifo mide unos 10px y la caja es la del trazo
    const fuera = (await anchorCentres(page)).filter(a =>
      a.x < A.left - M || a.x > A.right + M || a.y < A.top - M || a.y > A.bottom + M);
    expect(fuera).toHaveLength(0);
  });
});
