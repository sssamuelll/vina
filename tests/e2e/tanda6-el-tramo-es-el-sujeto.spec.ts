/**
 * Reunión María 2026-09-07 — causas G y A, que son la misma por debajo.
 *
 * G, la granularidad:
 *   [23:32] "tampoco me gusta que se creen grupos. Yo creé estas líneas de
 *            una vez y estas de otra, pero en verdad hay dos líneas, entonces
 *            aquí debería haber un punto"
 *   [23:54] "o se clican todas o se clica solo la que estoy clicando, que
 *            sería de este extremo a este, y no las que se crearon en el
 *            mismo bloque"
 *   [24:05] "y ves, y me sobresatura toda la información"
 *
 * A, la cota que no se toca:
 *   [19:05] "no puedes seleccionarla, deberías poder seleccionarla […] es un
 *            error de la interfaz"
 *
 * Son la misma: hoy la selección de una interna es `{pieceId, lineId}`
 * (editorSlice.ts) — la entidad entera. De ahí salen las dos consecuencias
 * que ella nombró: clicar un tramo selecciona el bloque de creación, y las
 * cotas de TODOS sus tramos aparecen a la vez.
 *
 * El contrato está en 2026-09-08-contexto-y-control-numerico-design.md § 5:
 * la unidad seleccionable es el tramo entre dos nodos consecutivos, y eso NO
 * exige migrar el almacenamiento — el `path` sigue siendo uno.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, dispatch, addPiece, toScreen } from './helpers/lienzo';

async function clicEn(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(250);
}

const seleccion = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { editor: { selectedInternalLine: unknown } } } })
    .__VINA_STORE__.getState().editor.selectedInternalLine);

/** Una interna de TRES tramos: A-B-C-D, horizontal, dentro de la pieza. */
async function internaDeTresTramos(page: Page) {
  await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);
  await dispatch(page, 'project/addInternalLine', {
    pieceId: 'p1',
    line: {
      id: 'g1',
      type: 'reference',
      path: [
        { type: 'M', values: [50, 150] },
        { type: 'L', values: [150, 150] },
        { type: 'L', values: [250, 150] },
        { type: 'L', values: [350, 150] },
      ],
    },
  });
  await page.waitForTimeout(300);
}

test.describe('el sujeto es el tramo, no el bloque en que se dibujó', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await internaDeTresTramos(page);
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('select');
  });

  test('causa G — clicar dos tramos distintos de la misma interna da dos sujetos distintos', async ({ page }) => {
    // AB va de x=50 a x=150; su centro está en x=100.
    await clicEn(page, { x: 100, y: 150 });
    const enAB = await seleccion(page);
    expect(enAB, 'clicar un tramo tiene que seleccionar algo').not.toBeNull();

    // BC va de x=150 a x=250; su centro está en x=200.
    await clicEn(page, { x: 200, y: 150 });
    const enBC = await seleccion(page);

    expect(
      enBC,
      'dos tramos distintos son dos sujetos distintos: hoy los dos devuelven el mismo {pieceId, lineId}',
    ).not.toEqual(enAB);
  });

  test('causa G — seleccionar un tramo no saca las cotas de los otros dos', async ({ page }) => {
    await clicEn(page, { x: 200, y: 150 });

    // "Me sobresatura toda la información" [24:05]: hoy salen las de los tres
    // tramos porque el sujeto es la entidad entera.
    await expect(
      page.locator('.cota:not(.cota--hueca)'),
      'un tramo seleccionado enseña SU cota, no las de sus hermanos',
    ).toHaveCount(1);
  });

  test('causa A — la cota del tramo clicado se puede escribir, y solo mueve ese tramo', async ({ page }) => {
    await clicEn(page, { x: 200, y: 150 });

    const chip = page.locator('.cota:not(.cota--hueca)').first();
    await expect(chip, 'la cota del tramo tiene que estar ahí para tocarla').toBeVisible();
    await chip.click();

    const campo = page.getByRole('textbox', { name: /Largo/i });
    await expect(campo, 'y tiene que ser un campo, no un cartel').toBeVisible();
    await campo.fill('50');
    await campo.press('Enter');
    await page.waitForTimeout(300);

    const linea = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => {
        project: { pieces: Array<{ id: string; internals: Array<{ id: string; path: Array<{ values: number[] }> }> }> } } } })
        .__VINA_STORE__.getState();
      return s.project.pieces.find(p => p.id === 'p1')!.internals.find(l => l.id === 'g1')!;
    });

    // A no se movió: el extremo fijo del tramo es el que ya estaba (§ 3.1 del
    // contrato: "cambiar el largo de un tramo → el extremo fijo queda fijo").
    expect(linea.path[0].values[0], 'el primer punto no se toca').toBeCloseTo(50, 1);
    expect(linea.path[1].values[0], 'B tampoco: es el extremo fijo de BC').toBeCloseTo(150, 1);
    expect(linea.path[2].values[0], 'C se mueve para que BC mida 50').toBeCloseTo(200, 1);
    expect(linea.path[3].values[0], 'D no lo arrastra este cambio').toBeCloseTo(350, 1);
  });
});

/**
 * La puerta, no el cuarto.
 *
 * Los tres casos de arriba montan la interna con `project/addInternalLine`, y
 * por ahí pasan en verde. El recorrido encadenado de la sesión de María la
 * dibuja con la HERRAMIENTA — y ahí `PatternEditor.tsx:396` autoselecciona la
 * entidad entera sin `segmentIndex` al cerrar el trazo. Con eso vuelve entero
 * lo que esta tanda arregló: la cabecera anunció «Editando: la línea
 * seleccionada · 6 cotas» sobre una interna de tres tramos, que es literalmente
 * [24:05] "y me sobresatura toda la información".
 *
 * Y no se queda en ruido visual: las seis cotas tapan el propio dibujo, así que
 * el clic siguiente cae en una cota en vez de en el tramo, la abre a escribir y
 * el foco se queda dentro del campo. A partir de ahí los atajos globales callan
 * —`h` deja de activar Pluma— porque el manejador cede el teclado a los campos.
 * Un gesto de dibujo dejaba la aplicación sin atajos.
 *
 * El contrato ya lo decía y nadie lo ejecutó (§ 2 y § 5 de
 * 2026-09-08-contexto-y-control-numerico-design.md): "el gesto que creó varios
 * tramos NO forma un grupo de selección".
 */
test.describe('dibujar una interna no crea un grupo de selección', () => {
  test.setTimeout(120_000);

  test('al cerrar el trazo con Enter el sujeto es UN tramo, y el teclado sigue vivo', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);

    await page.keyboard.press('g');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('internalShape');
    // A partir de x=100: por debajo, el dock izquierdo tapa el lienzo y el clic
    // cae en sus botones sin avisar (el primer intento activó «Punto»).
    for (const p of [{ x: 100, y: 150 }, { x: 180, y: 150 }, { x: 260, y: 150 }, { x: 340, y: 150 }]) {
      await clicEn(page, p);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    const sel = (await seleccion(page)) as { pieceId?: string; lineId?: string; segmentIndex?: number } | null;
    expect(sel, 'el trazo recién cerrado tiene que quedar seleccionado por algo').not.toBeNull();
    expect(
      sel?.segmentIndex,
      'la creación no puede devolver la entidad entera: el sujeto es un tramo',
    ).not.toBeUndefined();

    await expect(
      page.locator('.cota:not(.cota--hueca)'),
      'tres tramos recién dibujados no pueden sacar seis cotas encima del dibujo',
    ).toHaveCount(1);

    // El campo no puede quedarse el foco: si se lo queda, la aplicación pierde
    // TODOS los atajos y solo se recupera clicando fuera.
    await page.keyboard.press('h');
    await expect
      .poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 })
      .toBe('pen');
  });

  test('un trazo CERRADO también cae en un tramo de verdad, no en la Z', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);

    await page.keyboard.press('g');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('internalShape');

    // Tres nodos y vuelta al primero: `usePolyPenTool` cierra al clicar sobre el
    // nodo 0 con tres ya puestos, y `nodesToCommands` remata el path con `Z`.
    const triangulo = [{ x: 120, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 220 }];
    for (const p of triangulo) await clicEn(page, p);
    await clicEn(page, triangulo[0]);
    await page.waitForTimeout(400);

    const linea = await page.evaluate(() => {
      const s = (window as unknown as { __VINA_STORE__: { getState: () => {
        project: { pieces: Array<{ id: string; internals: Array<{ path: Array<{ type: string }> }> }> } } } })
        .__VINA_STORE__.getState();
      return s.project.pieces.find(p => p.id === 'p1')!.internals.at(-1)!;
    });
    expect(linea.path.at(-1)!.type, 'este caso solo vale si el trazo cerró de verdad').toBe('Z');

    // `segmentPolar` solo emite tramo para los `L`: apuntar al último comando
    // daba un índice que no casa con ninguno, y la línea quedaba seleccionada
    // sin cota y sin realce — una selección muerta y en silencio.
    await expect(
      page.locator('.cota:not(.cota--hueca)'),
      'el tramo elegido al cerrar tiene que ser uno que exista',
    ).toHaveCount(1);
  });
});
