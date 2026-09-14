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
 * dibuja con la HERRAMIENTA, y ahí el cierre del trazo autoseleccionaba algo.
 *
 * ENMENDADO el 2026-09-14 (#1154). Este bloque nació el 09-09 exigiendo que el
 * cierre dejara seleccionado UN TRAMO, porque lo que había antes era peor: la
 * entidad entera, «Editando: la línea seleccionada · 6 cotas» sobre una interna
 * de tres tramos, que es literalmente [24:05] "y me sobresatura toda la
 * información". Bajar de seis cotas a una arregló el ruido y dejó el resto.
 *
 * Lo que quedaba lo dijo ella misma el 10-09 [09:32], dibujando internas con
 * `G`: *"el zoom este me está molestando mucho, porque se pone esto aquí"*. No
 * era el zoom. Era esa cota — la única que quedaba — plantada BAJO EL CURSOR,
 * justo donde iba el clic siguiente (fotogramas `t_09-30.jpg` y `t_09-40.jpg`:
 * la píldora gris del tramo en curso y el chip azul del anterior, pegados).
 *
 * Una cota es una menos que seis, pero encima del punto donde va el siguiente
 * gesto sigue siendo una de más. Y la autoselección nunca la firmó nadie: el
 * contrato 2026-09-08 § 5 solo dice que el gesto NO forma grupo de selección;
 * lo de «queda seleccionado el último tramo» lo decidió el código. María firmó
 * lo contrario el 13-09 — Enter traza y la herramienta vuelve al ratón, nada se
 * abre solo. Así que al cerrar un trazo no se selecciona nada.
 *
 * Lo que esos casos medían sigue medido, solo que sobre un sujeto que se elige
 * clicándolo: la forma del chip y su tamaño de letra viven en
 * `tanda5-un-cuadro-y-un-aviso.spec.ts`, que ahora lo selecciona con el ratón.
 */
test.describe('cerrar una interna no selecciona nada', () => {
  test.setTimeout(120_000);

  test('al cerrar el trazo con Enter no queda sujeto ni cota, y el teclado sigue vivo', async ({ page }) => {
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

    expect(
      await seleccion(page),
      'el trazo se guarda; lo que no puede es quedarse agarrado de un sujeto que ella no pidió',
    ).toBeNull();

    await expect(
      page.locator('.cota:not(.cota--hueca)'),
      'ninguna cota: ni las seis de la entidad ni la una del último tramo',
    ).toHaveCount(0);

    // El campo no puede quedarse el foco: si se lo queda, la aplicación pierde
    // TODOS los atajos y solo se recupera clicando fuera.
    await page.keyboard.press('h');
    await expect
      .poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 })
      .toBe('pen');
  });

  test('un trazo CERRADO tampoco deja sujeto', async ({ page }) => {
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

    // El cierre por clic entra por el mismo sitio que el cierre por Enter, así
    // que si uno se dejara sujeto el otro también: este es el control.
    expect(await seleccion(page), 'cerrar clicando el primer nodo tampoco selecciona').toBeNull();
    await expect(page.locator('.cota:not(.cota--hueca)')).toHaveCount(0);
  });

  /**
   * El oráculo de #1154, que es lo que ella vio: no «hay una cota de más» sino
   * «la cota me come el clic». Se mide donde duele — en el punto exacto donde
   * cae el gesto siguiente — y con la consecuencia detrás: que ese clic
   * empiece de verdad la interna siguiente.
   */
  test('el punto donde cae el clic siguiente no lo ocupa una cota', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 400, 300);

    await page.keyboard.press('g');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('internalShape');

    const ultimoNodo = { x: 260, y: 150 };
    for (const p of [{ x: 100, y: 150 }, { x: 180, y: 150 }, ultimoNodo]) await clicEn(page, p);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // El ratón sigue donde terminó el trazo: exactamente la postura de María en
    // `t_09-40.jpg`, y exactamente donde ella iba a clicar otra vez.
    const s = await toScreen(page, ultimoNodo);
    const quienEstaAhi = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest('button.cota') ? 'cota' : el.tagName.toLowerCase()) : 'nada';
    }, [s.x, s.y] as const);
    expect(
      quienEstaAhi,
      'donde ella va a clicar no puede haber un chip de cota esperando a comerse el gesto',
    ).not.toBe('cota');

    // Y la consecuencia, que es lo que ella notó: el clic siguiente dibuja.
    const antes = (await st(page)).project.pieces.find(p => p.id === 'p1')!.internals.length;
    await clicEn(page, ultimoNodo);
    await clicEn(page, { x: 260, y: 240 });
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await st(page)).project.pieces.find(p => p.id === 'p1')!.internals.length, { timeout: 5000 })
      .toBe(antes + 1);
  });
});
