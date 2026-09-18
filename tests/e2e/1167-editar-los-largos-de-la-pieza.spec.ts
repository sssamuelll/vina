/**
 * #1167 — editar los largos de una pieza que ya existe.
 *
 * María, firma D2 del 13-09:
 *
 *   «el editable de largos me gustaría que apareciera solo cuando uno clica
 *    Tab, como al crear una línea con pluma en el dibujo libre, y que también
 *    al salir de crear y volver a clicar la pieza una pudiera editar clicando
 *    TAB; pero creo que debería ser lo mismo cuando uno clica la línea y la
 *    mueve: sin clicar TAB, solo arrastrando una línea, el programa entiende
 *    que quieres cambiar largos, entonces también aparezca el menú.»
 *
 *   «Además piensa que en patronaje pocas piezas son un rectángulo; en verdad
 *    las piezas van a ser mucho más complejas que un rectángulo.»
 *
 * jsdom no ve layout ni apilamiento: las tres pruebas de aceptación de la spec
 * (2026-09-18 § 6) viven aquí, en un navegador de verdad.
 */
import { test, expect, type Page } from '@playwright/test';
import { addPiece, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

const MARIA = { width: 1366, height: 643 };

const caja = (page: Page) => page.locator('.cotas button.cota[aria-label^="Largo"]');
const campo = (page: Page, nombre: string) =>
  page.locator(`input.cota--editando[aria-label="${nombre}"]`);
/** Los puntos del contorno, en local, sin la `Z`. */
const contorno = async (page: Page) =>
  (await st(page)).project.pieces[0].outline.filter(c => c.type !== 'Z').map(c => c.values);

async function unRectanguloSeleccionado(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(600);
  // 200 mm de ancho × 150 de alto, esquina superior izquierda en (200,200).
  await addPiece(page, 'p1', { x: 200, y: 200 }, 200, 150);
  await dispatch(page, 'editor/selectPiece', 'p1');
  await page.waitForTimeout(300);
}

/** Deja el cursor sobre un punto del patrón, sin clicar: Tab lee de ahí. */
async function elRatonSobre(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.waitForTimeout(150);
}

test.describe('editar los largos de una pieza que ya existe', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  test('darle 250 mm al lado de abajo sin calcular nada', async ({ page }) => {
    await unRectanguloSeleccionado(page);

    // Con la pieza seleccionada y sin tocar Tab no hay caja de lado: lo que
    // hay es Ancho y Alto, que es otra cosa.
    expect(await caja(page).count(), 'la caja del lado sale sin pedirla').toBe(0);

    // El lado de abajo va de (400,350) a (200,350) en patrón. El ratón encima.
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);

    await expect(
      campo(page, 'Largo'),
      'Tab sobre la pieza no abrió el largo de ningún lado',
    ).toBeVisible();
    const antes = await campo(page, 'Largo').inputValue();
    expect(antes, `el lado que abrió no es el de 200 mm: ${antes}`).toContain('200');

    await page.keyboard.press('Control+a');
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // El lado (200,150)→(0,150) en local. Partida fija en (200,150); llegada a
    // 250 sobre la misma recta, o sea (-50,150). Los otros dos no se mueven.
    const puntos = await contorno(page);
    expect(puntos[0], 'la esquina de arriba a la izquierda se movió').toEqual([0, 0]);
    expect(puntos[1], 'la de arriba a la derecha se movió').toEqual([200, 0]);
    expect(puntos[2], 'el extremo de PARTIDA se movió: debía quedar fijo').toEqual([200, 150]);
    expect(puntos[3][0], 'el lado no aterrizó a 250 del extremo fijo').toBeCloseTo(-50, 3);
    expect(puntos[3][1], 'el lado giró en vez de alargarse').toBeCloseTo(150, 3);
  });

  test('y se deshace de una vez', async ({ page }) => {
    await unRectanguloSeleccionado(page);
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const puntos = await contorno(page);
    expect(puntos[3][0], 'Ctrl+Z no devolvió el lado a su sitio').toBeCloseTo(0, 3);
  });

  test('el cuarto lado del rectángulo también: el de cierre', async ({ page }) => {
    // El hueco de §4 de la spec: el lado de cierre no es una `L`, es la `Z`.
    // Sin tratarlo, el lado izquierdo de todo rectángulo se quedaba sin caja —
    // el mismo hueco que #1120 pagó una vez en las etiquetas de «Largos».
    await unRectanguloSeleccionado(page);

    // El lado izquierdo va de (200,350) a (200,200): mide 150 mm.
    await elRatonSobre(page, { x: 200, y: 275 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);

    await expect(campo(page, 'Largo'), 'el lado de cierre no tiene caja').toBeVisible();
    const valor = await campo(page, 'Largo').inputValue();
    expect(valor, `la caja no es la del lado de cierre (150 mm): ${valor}`).toContain('150');
  });

  test('arrastrar un lado en Editar patrón deja su caja, y solo la suya', async ({ page }) => {
    // «solo arrastrando una línea, el programa entiende que quieres cambiar
    //  largos, entonces también aparezca el menú.»
    await unRectanguloSeleccionado(page);
    await dispatch(page, 'editor/setActiveTool', 'editPattern');
    await dispatch(page, 'tools/setActiveTool2D', 'editPattern');
    await page.waitForTimeout(300);
    const dentro = await toScreen(page, { x: 300, y: 275 });
    await page.mouse.dblclick(dentro.x, dentro.y);
    await page.waitForTimeout(400);

    // Agarrar el lado de arriba por su medio y bajarlo 20 mm.
    const desde = await toScreen(page, { x: 300, y: 200 });
    const hasta = await toScreen(page, { x: 300, y: 220 });
    await page.mouse.move(desde.x, desde.y);
    await page.mouse.down();
    await page.mouse.move(hasta.x, hasta.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect(caja(page), 'arrastrar un lado no dejó su caja').toHaveCount(1);
    // UNA caja, no las de sus hermanos (§ 5.1 del 08-09).
    const cuantas = await page.locator('.cotas button.cota').count();
    expect(cuantas, `salieron ${cuantas} cajas en vez de una`).toBe(1);
  });

  test('Escape suelta el lado y devuelve el sujeto a la pieza, sin deseleccionarla', async ({ page }) => {
    await unRectanguloSeleccionado(page);
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await expect(campo(page, 'Largo')).toBeVisible();

    await page.keyboard.press('Escape');   // cierra el campo del chip
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');   // suelta el lado
    await page.waitForTimeout(350);

    expect(await caja(page).count(), 'el lado siguió siendo el sujeto tras Escape').toBe(0);
    const { editor } = await st(page);
    expect(editor.selectedPieceIds, 'un Esc se comió DOS niveles: también la pieza').toEqual(['p1']);
  });

  test('con la pieza bloqueada, Tab no se traga la tecla', async ({ page }) => {
    // Tragarse Tab sin abrir nada es peor que no hacer nada: el
    // `preventDefault` del router deja además muerto el Tab nativo.
    await unRectanguloSeleccionado(page);
    await dispatch(page, 'project/lockPiece', 'p1');
    await page.waitForTimeout(300);
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    expect(await caja(page).count(), 'abrió la caja de una pieza bloqueada').toBe(0);
  });

  test('al SALIR de crear y volver a clicar la pieza, Tab ya abre el lado', async ({ page }) => {
    // Su frase entera: «al salir de crear y volver a clicar la pieza una
    // pudiera editar clicando TAB». Mientras el rectángulo sigue caliente, Tab
    // conserva Ancho —la medida que acaba de dibujar, #223/#225—; en cuanto
    // sale de crear, abre el largo del lado.
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
    await page.waitForTimeout(600);
    await page.keyboard.press('s');                       // Rectángulo
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 15000 }).toBe('rectangle');
    const donde = await toScreen(page, { x: 250, y: 250 });
    await page.mouse.move(donde.x, donde.y);
    await page.mouse.click(donde.x, donde.y);             // un clic crea 100×100
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);

    // Caliente: Tab sigue siendo el Ancho.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await expect(
      page.getByRole('button', { name: /^Ancho de la pieza:/ }),
      'la pieza recién creada perdió su Ancho en el camino de teclado',
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Salir de crear y volver a clicar la pieza.
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 15000 }).toBe('select');
    await clickAt(page, { x: 300, y: 300 });
    await page.waitForTimeout(300);
    await elRatonSobre(page, { x: 300, y: 350 });          // el lado de abajo
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);

    await expect(
      campo(page, 'Largo'),
      'tras salir de crear, Tab no abrió el largo del lado',
    ).toBeVisible();
    const valor = await campo(page, 'Largo').inputValue();
    expect(valor, `no es el lado de 100 mm: ${valor}`).toContain('100');
  });
});
