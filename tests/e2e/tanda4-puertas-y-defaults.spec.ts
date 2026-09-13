/**
 * Reunión María 2026-09-07 — tres cosas pequeñas y de distinta naturaleza que
 * comparten una idea: lo que la app ofrece tiene que corresponderse con lo que
 * la app puede hacer, y lo que ella pide tiene que venir puesto.
 *
 *  · Fallo 10 — Línea interna se puede activar sin patrón. [12:32] "si no hay
 *    patrón, ¿para qué activar esa opción?". La prohibición geométrica YA
 *    existe (`usePolyPenTool` aborta el primer clic sin anfitriona): lo que
 *    falta es que la puerta no se ofrezca. Ofrecer y luego no hacer nada es
 *    peor que no ofrecer.
 *
 *  · Fallo 9 — el dock izquierdo se desplaza y pierde su cabecera. [20:44]
 *    "esto se ha bajado, eso no debería bajarse, esa barra debe estar fija".
 *    El scroll es DELIBERADO (Dock.css, por #1095: a 1366×643 siete botones
 *    quedaban fuera sin señal). No se quita: lo que se arregla es que el
 *    rótulo no se vaya con él, que es lo que le da la sensación de que la
 *    barra se movió.
 *
 *  · Fallo 4 — los largos de cada lado. [06:55] "me sería muy interesante que
 *    encima de cada línea me dijera cuánto mide cada línea". Existe: es el
 *    chip "Largos" de la fila de abajo, que ella tenía delante en toda la
 *    sesión y nunca encendió. Con una sola usuaria, el default correcto es el
 *    que ella quiere: nace encendido, y el chip queda para apagarlo.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, toScreen } from './helpers/lienzo';

const estado = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { editor: Record<string, unknown> } } })
    .__VINA_STORE__.getState().editor);

test.describe('tanda 4 — puertas que no mienten y defaults que ella quiere', () => {
  test.setTimeout(120_000);

  test('fallo 10 — sin patrón, Línea interna ni se ofrece ni se activa por atajo', async ({ page }) => {
    await waitForApp(page);
    expect((await st(page)).project.pieces, 'este caso necesita el proyecto vacío').toHaveLength(0);

    await expect(
      page.getByRole('button', { name: /^Línea interna/ }),
      'sin pieza donde colgarla, la puerta tiene que estar apagada',
    ).toBeDisabled();

    // Y el atajo es la otra entrada al mismo sitio: apagar solo el botón
    // dejaría la puerta cerrada y la ventana abierta.
    await page.keyboard.press('g');
    await page.waitForTimeout(300);
    expect(
      (await st(page)).editor.activeTool,
      'el atajo tampoco puede meterla en una herramienta que no puede hacer nada',
    ).not.toBe('internalShape');
  });

  test('fallo 10 — con una pieza, la puerta se abre', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'pieza', { x: 100, y: 100 }, 200, 150);

    await expect(
      page.getByRole('button', { name: /^Línea interna/ }),
      'en cuanto hay dónde dibujarla, la herramienta vuelve',
    ).toBeEnabled();
    await page.keyboard.press('g');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 3000 }).toBe('internalShape');
  });

  test('fallo 9 — el dock se desplaza pero su cabecera no se va', async ({ page }) => {
    // Ventana corta a propósito: es la condición que hace scrollear el dock, y
    // es la que ella tenía. Sin esto el caso pasa sin probar nada.
    await page.setViewportSize({ width: 1280, height: 520 });
    await waitForApp(page);

    const dock = page.locator('.dock--left');
    const rotulo = dock.locator('.dock__label').first();
    await expect(rotulo, 'el rótulo "2D" está a la vista antes de tocar nada').toBeVisible();

    const alcanzable = await dock.evaluate(el => el.scrollHeight - el.clientHeight);
    expect(alcanzable, 'el dock tiene que desbordar para que este caso mida algo').toBeGreaterThan(0);

    await dock.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(200);

    // Lo que ella vio: el rótulo se fue con el scroll y la barra "se bajó".
    const cajaRotulo = await rotulo.boundingBox();
    const cajaDock = await dock.boundingBox();
    expect(cajaRotulo, 'el rótulo tiene que seguir teniendo caja').not.toBeNull();
    expect(cajaDock).not.toBeNull();
    // El assert tiene que ser "no se fue por ARRIBA", no "está cerca de
    // arriba": un rótulo que se va con el scroll queda POR ENCIMA del dock, y
    // un `y < dockY + 40` se cumpliría igual. Una comprobación floja da señal
    // falsa y pasa en verde con el fallo dentro.
    expect(
      cajaRotulo!.y,
      'con el dock desplazado hasta abajo, el rótulo no puede haberse ido por arriba',
    ).toBeGreaterThanOrEqual(cajaDock!.y - 1);
  });

  test('fallo 4 — Largos es un interruptor apagado de fábrica, y seleccionar una pieza no lo enciende', async ({ page }) => {
    await waitForApp(page);

    // ENMENDADO el 2026-09-09 (contrato `2026-09-09-lo-que-se-ve-y-cuando`
    // § 1). Esta prueba exigía `showLineLengths === true` de fábrica, y esa era
    // la forma equivocada de cerrar el fallo 4.
    //
    // El fallo 4 nunca fue "el interruptor está apagado": fue que María tuvo
    // los largos delante 25 minutos SIN VERLOS. Encenderlos para todas las
    // piezas todo el tiempo los hacía visibles al precio de convertirlos en
    // ruido permanente sobre el patrón — Samuel, probándolo el 09-09: "nunca
    // desaparecen y es un poco anoying […] siempre allí contaminando la vista".
    //
    // ENMENDADO otra vez el 2026-09-13 con la firma de María: ni «cuando
    // clico» (09-09) ni tres estados con «Al crear» (12-09). Textual: «no
    // quiero ese desplegable con 3 opciones, no quiero opciones … el botón de
    // activar el visualizador de líneas o desactivar, como aparecen cuando
    // uno va a medir, eso es TOP, pero solo eso». Un interruptor, apagado de
    // fábrica, sin vínculo con la creación ni con la selección.
    expect((await estado(page)).lineLengthMode).toBe('none');

    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.keyboard.press('z');
    await expect.poll(async () => (await estado(page)).activeTool, { timeout: 5000 }).toBe('select');
    await expect(page.locator('.cota--lectura'), 'sin tocar nada, ningún largo').toHaveCount(0);

    const s = await toScreen(page, { x: 200, y: 150 });
    await page.mouse.click(s.x, s.y);
    await expect.poll(async () => (await estado(page)).selectedPieceIds.length).toBe(1);

    await expect(page.locator('.cota--lectura'), 'seleccionarla no enciende sus largos').toHaveCount(0);

    const largos = page.getByRole('button', { name: 'Largos', exact: true });
    await expect(largos).toBeVisible();
    await expect(largos).toHaveAttribute('aria-pressed', 'false');
    await largos.click();
    await expect(page.locator('.cota--lectura')).not.toHaveCount(0);
    expect((await estado(page)).lineLengthMode).toBe('all');
    await largos.click();
    await expect(page.locator('.cota--lectura')).toHaveCount(0);
    expect((await estado(page)).lineLengthMode).toBe('none');
  });
});
