/**
 * #1112 — «cuánto lo quieres mover en esa dirección».
 *
 * María, audio del 30-08:
 *
 *   [01:37] «cuando yo lo muevo, cómo sé cuánto lo muevo… necesito poder
 *    controlar de alguna manera lo que yo muevo ahora aquí, mi punto, respecto
 *    a este punto, respecto a este punto y respecto a donde estaba el anterior,
 *    porque si no cómo controlo cuál es el cambio de mi patrón.»
 *
 *   [02:34] «si yo vuelvo a editar y le doy al clic derecho, como en CLO me
 *    saldría un submenú que diría vale cuánto lo quieres mover en esa dirección.»
 *
 * Hasta hoy, con «Editar patrón» activo NO había un solo número en pantalla:
 * `CON_COTAS_DE_PIEZA` no incluía la herramienta, así que la maquinaria de
 * cotas estaba apagada, y la fila `point.node` del menú contextual estaba VACÍA
 * —clic derecho sobre un punto no abría nada—.
 *
 * Lo que se prueba aquí es lo que ella pidió, en el orden en que lo pidió:
 * que el número exista, que se pueda escribir, y que el clic derecho lleve a él.
 */
import { test, expect, type Page } from '@playwright/test';
import { addPiece, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

const MARIA = { width: 1366, height: 643 };

const chip = (page: Page, nombre: string) =>
  page.locator(`.cotas button.cota[aria-label^="${nombre}"]`);
const campo = (page: Page, nombre: string) =>
  page.locator(`input.cota--editando[aria-label="${nombre}"]`);

async function unRectanguloEnEdicion(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(600);
  await addPiece(page, 'p1', { x: 200, y: 200 }, 200, 150);
  await dispatch(page, 'editor/setActiveTool', 'editPattern');
  await dispatch(page, 'tools/setActiveTool2D', 'editPattern');
  await page.waitForTimeout(300);
  // Doble clic dentro entra en edición de puntos.
  const dentro = await toScreen(page, { x: 300, y: 275 });
  await page.mouse.dblclick(dentro.x, dentro.y);
  await page.waitForTimeout(400);
}

test.describe('mover el punto con número', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  test('clicar un punto enseña su distancia a los dos vecinos', async ({ page }) => {
    await unRectanguloEnEdicion(page);

    // Antes de tocar nada no hay cotas: el sujeto es el punto, no la pieza.
    expect(await chip(page, 'Al punto').count(), 'salen cotas sin punto elegido').toBe(0);

    // La esquina de arriba a la derecha: 200 al anterior, 150 al siguiente.
    await clickAt(page, { x: 400, y: 200 });
    await page.waitForTimeout(400);

    await expect(chip(page, 'Al punto anterior'), 'el punto no enseña su distancia al vecino anterior').toHaveCount(1);
    await expect(chip(page, 'Al punto siguiente'), 'ni al siguiente').toHaveCount(1);

    const anterior = await chip(page, 'Al punto anterior').getAttribute('aria-label');
    const siguiente = await chip(page, 'Al punto siguiente').getAttribute('aria-label');
    expect(anterior, `la distancia al anterior no es 200: ${anterior}`).toContain('200');
    expect(siguiente, `la distancia al siguiente no es 150: ${siguiente}`).toContain('150');
  });

  test('escribir 150 mueve el punto POR esa recta, y el contorno lo dice', async ({ page }) => {
    await unRectanguloEnEdicion(page);
    await clickAt(page, { x: 400, y: 200 });
    await page.waitForTimeout(400);

    await chip(page, 'Al punto anterior').click();
    await expect(campo(page, 'Al punto anterior')).toBeVisible();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // El punto estaba en local (200,0) y su vecino anterior en (0,0): a 150 de
    // él, sobre la misma recta, es (150,0). Ni gira el tramo ni mueve al vecino.
    const pieza = (await st(page)).project.pieces[0];
    const puntos = pieza.outline.filter((c) => c.type !== 'Z').map((c) => c.values);
    expect(puntos[0], 'el vecino anterior se movió: solo se pidió mover UNO').toEqual([0, 0]);
    expect(puntos[1][0], 'el punto no aterrizó a 150 del vecino').toBeCloseTo(150, 3);
    expect(puntos[1][1], 'el tramo giró en vez de acortarse').toBeCloseTo(0, 3);
    expect(puntos[2], 'el vecino siguiente se movió').toEqual([200, 150]);
  });

  test('y se deshace de una vez, como cualquier otra edición', async ({ page }) => {
    // Escribir una medida es una edición, no dos: si dejara dos entradas en el
    // historial, Ctrl+Z devolvería a medias.
    await unRectanguloEnEdicion(page);
    await clickAt(page, { x: 400, y: 200 });
    await page.waitForTimeout(400);
    await chip(page, 'Al punto anterior').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const puntos = (await st(page)).project.pieces[0].outline.filter((c) => c.type !== 'Z').map((c) => c.values);
    expect(puntos[1][0], 'Ctrl+Z no devolvió el punto a su sitio').toBeCloseTo(200, 3);
  });

  test('clic derecho sobre el punto ofrece «Mover exacto…», y lleva al chip', async ({ page }) => {
    // [02:34], su literal. La entrada no abre ningún campo nuevo: enfoca el que
    // ya está en pantalla. La fila `point.node` del menú estaba VACÍA, así que
    // hasta hoy el clic derecho sobre un punto no abría absolutamente nada.
    await unRectanguloEnEdicion(page);
    await clickAt(page, { x: 400, y: 200 });
    await page.waitForTimeout(400);

    await clickAt(page, { x: 400, y: 200 }, 'right');
    await page.waitForTimeout(400);

    // El menú contextual del lienzo pinta `<button>` pelados, sin `role` de
    // menú — hueco de accesibilidad real, anotado y fuera de este lote.
    const entrada = page.locator('.context-menu button', { hasText: 'Mover exacto' });
    await expect(entrada, 'el clic derecho sobre un punto no ofrece mover exacto').toHaveCount(1);
    await entrada.click();
    await page.waitForTimeout(400);

    await expect(
      campo(page, 'Al punto anterior'),
      '«Mover exacto…» no llevó al número: sería una puerta a ningún sitio',
    ).toBeVisible();
  });
});
