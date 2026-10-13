import { test, expect, type Page } from '@playwright/test';
import { activarHerramienta, addPiece, dispatch, st } from './helpers/lienzo';

/**
 * maria-212 (Trello T#212, 09-08): «cuando los quiero mover solo se mueven unos
 * pocos milímetros y mayor rango de movimiento queda bloqueado».
 *
 * Dos causas, reproducidas el 13-10 contra el build de main (69910bcd), el
 * mismo que estaba desplegado:
 *  A. El arrastre de la pieza solo oía `mousemove` sobre el <svg>. Al salir del
 *     lienzo la pieza se quedaba en el borde; con zoom alto el lienzo abarca
 *     unos 30 mm, y eso era todo lo que avanzaba por arrastre.
 *  B. Soltar sobre la barra superior dejaba su texto seleccionado, y la
 *     selección cubría el lienzo. Desde ahí cada arrastre que empezaba en el
 *     lienzo era un arrastre NATIVO del navegador (dragstart a ~6 px), sin más
 *     mousemove ni mouseup: la pieza se veía moverse y lo guardado no.
 *
 * B no es de la pieza: cualquier gesto que empiece en el lienzo con esa
 * selección viva acaba igual. Por eso hay un caso con el barrido de la
 * selección y otro con la selección puesta a mano.
 */

const ID = 'p212';
const ANCHO = 200;
const ALTO = 150;

/** Pieza de 200×150 mm a zoom 1, con su esquina a 150 px del borde del lienzo. */
async function prepararPieza(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
  await addPiece(page, ID, { x: 0, y: 0 }, ANCHO, ALTO);
  await dispatch(page, 'editor/setZoom2D', 1);
  await dispatch(page, 'editor/setPan2D', { x: 150, y: 150 });
  await activarHerramienta(page, 'z', 'select');
  await page.waitForTimeout(200);
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return {
    box,
    zoom: editor.zoom2D,
    centro: { x: box.x + 150 + (ANCHO / 2) * editor.zoom2D, y: box.y + 150 + (ALTO / 2) * editor.zoom2D },
  };
}

const posicion = async (page: Page) =>
  (await st(page)).project.pieces.find(p => p.id === ID)!.position;

const seleccion = (page: Page) =>
  page.evaluate(() => String(window.getSelection()).replace(/\s+/g, ' ').trim());

/**
 * Arrastres nativos que ARRANCAN: el dragstart que llega a window en burbuja,
 * después de React, sin cancelar. Cancelado, el navegador no arrastra nada y
 * siguen llegando mousemove y mouseup.
 */
async function contarDragstart(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __ds: number }).__ds = 0;
    window.addEventListener('dragstart', e => {
      if (!e.defaultPrevented) (window as unknown as { __ds: number }).__ds++;
    });
  });
  return () => page.evaluate(() => (window as unknown as { __ds: number }).__ds);
}

async function devolverAlOrigen(page: Page) {
  await dispatch(page, 'project/movePiece', { id: ID, x: 0, y: 0 });
  await page.waitForTimeout(300);
}

/** Arrastre de 100 px a la izquierda, entero dentro del lienzo. */
async function arrastreCorto(page: Page, centro: { x: number; y: number }) {
  await page.mouse.move(centro.x, centro.y);
  await page.mouse.down();
  await page.mouse.move(centro.x - 100, centro.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test.describe('maria-212 — mover piezas sin tope', () => {
  test.setTimeout(120_000);

  test('A: la pieza sigue al puntero fuera del lienzo y queda donde se suelta', async ({ page }) => {
    const { box, zoom, centro } = await prepararPieza(page);

    // Sale por la izquierda, sobre el margen de herramientas, y sigue bajando
    // fuera del lienzo con el botón apretado.
    const fuera = { x: box.x - 25, y: centro.y };
    await page.mouse.move(centro.x, centro.y);
    await page.mouse.down();
    await page.mouse.move(fuera.x, fuera.y, { steps: 20 });
    await page.mouse.move(fuera.x, fuera.y + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const p = await posicion(page);
    expect(Math.abs(p.x - (fuera.x - centro.x) / zoom), `x guardada ${p.x}`).toBeLessThan(1);
    expect(Math.abs(p.y - 120 / zoom), `y guardada ${p.y}`).toBeLessThan(1);
  });

  test('A: el paneo con el botón del medio también sigue fuera del lienzo', async ({ page }) => {
    // El reenvío es del gesto, no de la pieza: el paneo tenía el mismo tope.
    const { box } = await prepararPieza(page);
    const pan0 = (await st(page)).editor.pan2D;

    const vacio = { x: box.x + 60, y: box.y + 60 };
    const fuera = { x: box.x - 25, y: vacio.y };
    await page.mouse.move(vacio.x, vacio.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(fuera.x, fuera.y, { steps: 20 });
    await page.mouse.move(fuera.x, fuera.y + 120, { steps: 10 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(300);

    const pan = (await st(page)).editor.pan2D;
    expect(Math.abs(pan.x - (pan0.x + fuera.x - vacio.x)), `pan x ${pan.x}`).toBeLessThan(1);
    expect(Math.abs(pan.y - (pan0.y + 120)), `pan y ${pan.y}`).toBeLessThan(1);
  });

  test('B: soltar sobre la barra superior no deja texto seleccionado ni secuestra el siguiente arrastre', async ({ page }) => {
    const { zoom, centro } = await prepararPieza(page);
    const dragstarts = await contarDragstart(page);

    await page.mouse.move(centro.x, centro.y);
    await page.mouse.down();
    await page.mouse.move(centro.x, 15, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await seleccion(page), 'texto seleccionado tras soltar en la barra').toBe('');

    await devolverAlOrigen(page);
    await arrastreCorto(page, centro);
    expect(await dragstarts(), 'arrastres nativos').toBe(0);
    expect(Math.abs((await posicion(page)).x + 100 / zoom)).toBeLessThan(1);
  });

  test('B: barrer con la selección hasta la barra tampoco secuestra el arrastre de la pieza', async ({ page }) => {
    const { box, zoom, centro } = await prepararPieza(page);
    const dragstarts = await contarDragstart(page);

    // Barrido de selección desde el lienzo vacío hasta la barra superior.
    const vacio = { x: box.x + 40, y: box.y + box.height - 40 };
    await page.mouse.move(vacio.x, vacio.y);
    await page.mouse.down();
    await page.mouse.move(vacio.x + 60, 15, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await seleccion(page), 'texto seleccionado tras barrer hasta la barra').toBe('');

    await arrastreCorto(page, centro);
    expect(await dragstarts(), 'arrastres nativos').toBe(0);
    expect(Math.abs((await posicion(page)).x + 100 / zoom)).toBeLessThan(1);
  });

  test('B: con una selección que ya cubre el lienzo, el arrastre no se vuelve nativo', async ({ page }) => {
    const { zoom, centro } = await prepararPieza(page);
    const dragstarts = await contarDragstart(page);

    await page.evaluate(() => window.getSelection()!.selectAllChildren(document.body));
    await arrastreCorto(page, centro);

    expect(await dragstarts(), 'arrastres nativos').toBe(0);
    expect(Math.abs((await posicion(page)).x + 100 / zoom)).toBeLessThan(1);
  });
});
