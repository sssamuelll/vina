/**
 * Revisión asistida 2026-09-09 — Samuel probando, Claude guiando, sobre la
 * propia rama de la reunión del 07-09. Tres de los nueve pasos dejaron nota de
 * diseño y este fichero las mide.
 *
 * La frase que ordena todo:
 *   "la información es importante pero es más importante saber cuándo mostrarla
 *    y hacerle ver al usuario que es editable (accionable)."
 *
 * Contrato: docs/superpowers/specs/2026-09-09-lo-que-se-ve-y-cuando-design.md
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, toScreen } from './helpers/lienzo';

const lecturas = (page: Page) => page.locator('.cota--lectura');
const chipPieza = (page: Page, nombre: 'Ancho' | 'Alto') =>
  page.getByRole('button', { name: new RegExp(`^${nombre} de la pieza:`) });

async function clicEn(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(220);
}

/**
 * TODA medida visible sobre el patrón, viva donde viva en el DOM: los chips
 * HTML de la capa de cotas y los rótulos SVG del contorno. Mirar solo una de
 * las dos familias es lo que hacía vacua la primera versión de este oráculo —
 * no podía ver la duplicación que la motivó, porque estaba en el otro subárbol.
 */
async function medidasVisibles(page: Page): Promise<string[]> {
  const chips = await page.locator('.cotas .cota').allTextContents();
  const rotulos = await page.locator('.line-length-labels text').allTextContents();
  return [...chips, ...rotulos]
    .map(t => t.replace(/\s*mm\s*/gi, '').replace(',', '.').trim())
    .filter(Boolean)
    .map(t => String(Number.parseFloat(t)));
}

test.describe('D1 — los largos se ven cuando se trabaja la pieza, no siempre', () => {
  test.setTimeout(120_000);

  test('proyecto recién abierto: ningún largo a la vista y modo Al crear', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.waitForTimeout(300);

    // La tanda 4 lo encendió de fábrica y eso es lo que se enmienda: el fallo 4
    // era que ella NUNCA los veía, y la selección lo cierra mejor que un
    // interruptor que no encontró — sin el ruido permanente.
    expect(
      (await st(page)).editor.lineLengthMode,
      'Largos nace en Al crear',
    ).toBe('creation');

    await expect(
      lecturas(page),
      'sin selección no hay largos encima del patrón',
    ).toHaveCount(0);
  });

  test('una pieza fría seleccionada no saca largos; Todas los muestra como lectura', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('select');

    await clicEn(page, { x: 200, y: 150 });
    await expect.poll(async () => (await st(page)).editor.selectedPieceIds.length).toBe(1);

    await expect(lecturas(page), 'seleccionarla no la vuelve recién creada').toHaveCount(0);
    await page.getByRole('combobox', { name: 'Largos' }).selectOption('all');
    await expect(lecturas(page)).not.toHaveCount(0);

    // § 2: son LECTURA, no mando. Un chip que parece accionable y no lo es
    // miente peor que un texto gris.
    const primera = lecturas(page).first();
    await expect(primera).toHaveCSS('pointer-events', 'none');
  });

  test('un tramo de interna es el sujeto: NO se encienden los largos del contorno', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.evaluate(() => {
      const store = (window as unknown as { __VINA_STORE__: { dispatch: (a: unknown) => void } }).__VINA_STORE__;
      store.dispatch({ type: 'project/addInternalLine', payload: { pieceId: 'p1', line: {
        id: 'g1', type: 'reference',
        path: [{ type: 'M', values: [80, 150] }, { type: 'L', values: [200, 150] }, { type: 'L', values: [320, 150] }],
      } } });
    });
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('select');
    await page.getByRole('combobox', { name: 'Largos' }).selectOption('all');
    await expect(lecturas(page), 'control: Todas sí enseña el contorno antes de elegir la interna').not.toHaveCount(0);
    await clicEn(page, { x: 140, y: 150 });

    await expect
      .poll(async () => (await st(page)).editor.selectedInternalLine, { timeout: 5000 })
      .not.toBeNull();

    // `selectInternalLine` deja selectedPieceIds = [pieceId] (editorSlice.ts:123),
    // así que "la pieza está seleccionada" es CIERTO aquí — y aun así sus largos
    // no van. El sujeto no es la pieza tocada, es lo más fino que se toca; si es
    // un tramo, el contorno es ruido. Es [24:05] "me sobresatura toda la
    // información" entrando por la puerta de al lado.
    await expect(
      lecturas(page),
      'con un tramo por sujeto, el contorno de su pieza se queda callado',
    ).toHaveCount(0);
  });

  test('el modo «Todas» las saca sin selección', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.getByRole('combobox', { name: 'Largos' }).selectOption('all');
    await page.waitForTimeout(300);

    await expect(
      lecturas(page),
      'el interruptor sigue siendo la puerta para verlas todas, todo el tiempo',
    ).not.toHaveCount(0);
  });
});

test.describe('D3 — un lado que ya lleva chip no lleva además su lectura', () => {
  test.setTimeout(120_000);

  test('rectángulo seleccionado: ningún número repetido', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('select');
    await page.getByRole('combobox', { name: 'Largos' }).selectOption('all');
    await clicEn(page, { x: 200, y: 150 });

    await expect(chipPieza(page, 'Ancho')).toBeVisible();
    await expect(chipPieza(page, 'Alto')).toBeVisible();

    // Lo que Samuel fotografió: el lado de arriba con el chip «400 mm» y justo
    // debajo «400.0 mm» en gris. El mismo número, dos veces, en dos idiomas
    // visuales — la causa C viva sobre el contorno.
    //
    // El oráculo es el CONTEO, no «ningún número repetido»: en un rectángulo
    // dos lados opuestos miden lo mismo de forma legítima, así que buscar
    // valores repetidos daría rojo incluso con el arreglo puesto. Un rectángulo
    // seleccionado tiene cuatro lados y debe enseñar CUATRO medidas — Ancho
    // (arriba), Alto (derecha) y las lecturas de los dos lados que ningún chip
    // cubre. Hoy salen seis: los dos chips más los cuatro rótulos, y dos de
    // esos rótulos caen encima de un chip que ya dice ese número.
    const medidas = await medidasVisibles(page);
    expect(
      medidas.length,
      `un lado con chip no lleva además su lectura: cuatro lados, cuatro medidas. Salieron ${medidas.length}: ${medidas.join(' · ')}`,
    ).toBe(4);
  });
});

test.describe('D4 — Pluma cierra sola, y deshacer es la salida', () => {
  test.setTimeout(120_000);

  test('tres clics y Enter: la pieza cierra y NO sale el aviso', async ({ page }) => {
    await waitForApp(page);
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    for (const p of [{ x: 150, y: 500 }, { x: 350, y: 500 }, { x: 350, y: 640 }]) await clicEn(page, p);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await st(page)).project.pieces.length, { timeout: 5000 }).toBe(1);

    const pieza = (await st(page)).project.pieces[0];
    // Contrato de interfaz § 4: actuar y ofrecer deshacer antes que preguntar.
    expect(
      pieza.outline.map((c: { type: string }) => c.type),
      'con tres nodos Enter cierra el trazo solo',
    ).toContain('Z');

    await expect(
      page.locator('.toast__message').filter({ hasText: 'no se puede simular' }),
      'no queda nada que avisar: se resolvió en vez de advertirlo',
    ).toHaveCount(0);

    // La salida si no era eso: deshacer, no un modal.
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(0);
  });

  test('dos clics y Enter: no hay área que cerrar, y ya no es una pieza de la que avisar', async ({ page }) => {
    // ENMENDADO el 2026-09-12 (spec `2026-09-12-trazos-lineas-de-construccion`
    // § 3.1-3.2, #1158): este caso pedía que el aviso "SIGUE saliendo" con dos
    // nodos, precisamente porque en ese momento era el único caso donde la
    // Pluma dejaba una pieza abierta. Esa puerta se cerró: con dos nodos nace
    // un trazo, no una pieza, y un trazo no lleva aviso de simulación.
    await waitForApp(page);
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    for (const p of [{ x: 150, y: 500 }, { x: 350, y: 500 }]) await clicEn(page, p);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await st(page)).project.trazos.length, { timeout: 5000 }).toBe(1);

    const { pieces, trazos } = (await st(page)).project;
    expect(pieces, 'dos nodos no son un polígono: no debe nacer ninguna pieza').toHaveLength(0);
    expect(
      trazos[0].path.map((c: { type: string }) => c.type),
      'dos nodos son una raya: no hay polígono que cerrar',
    ).not.toContain('Z');

    await expect(
      page.locator('.toast__message').filter({ hasText: 'no se puede simular' }),
      'un trazo no es una pieza: no hay nada que avisar',
    ).toHaveCount(0);
  });
});

test.describe('D5 — un tramo convertible se ve convertible', () => {
  test.setTimeout(120_000);

  test('con Editar patrón, el tramo bajo el puntero se resalta y vuelve al salir', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
    await page.keyboard.press('q');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('editPattern');
    await clicEn(page, { x: 200, y: 150 });

    // Sobre el lado de arriba, a media distancia entre las dos esquinas.
    const encima = await toScreen(page, { x: 200, y: 0 });
    await page.mouse.move(encima.x, encima.y, { steps: 4 });
    await page.waitForTimeout(200);

    const resaltado = page.locator('[data-tramo-hover]');
    await expect(
      resaltado,
      'el tramo bajo el puntero dice que acepta el clic derecho («que se entienda que es accionable»)',
    ).toHaveCount(1);

    // Contrato § 4: el hover anticipa, nunca cambia de contexto — y al salir,
    // reposo.
    const fuera = await toScreen(page, { x: 200, y: 150 });
    await page.mouse.move(fuera.x, fuera.y, { steps: 4 });
    await page.waitForTimeout(200);
    await expect(resaltado, 'al salir vuelve a reposo').toHaveCount(0);
  });
});
