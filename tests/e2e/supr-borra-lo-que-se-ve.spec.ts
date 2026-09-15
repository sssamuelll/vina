/**
 * Revisión adversarial de UI del 2026-09-04 — los tres fallos de borrado
 * reproducidos en el navegador (issue #1115).
 *
 * Estos NO se pueden probar en jsdom, y no por el apilamiento sino por el
 * ORDEN DE LOS LISTENERS: el atajo global escucha en `document` en burbuja
 * (ShortcutProvider.tsx:84) y el manejador local de la línea interna en
 * `window` en burbuja (useEditorInteractions.ts:443), o sea después. Quién
 * gana la tecla solo se ve con una tecla de verdad.
 *
 *   A) Seleccionar + línea interna elegida → Supr borró LA PIEZA (2 → 1)
 *   B) Pieza bloqueada → Supr la borró (1 → 0)
 *   C) Menú Edición ▸ Eliminar en Coser → borra la pieza (LogoMenu.tsx:89-93
 *      reimplementa el borrado sin la regla de #1094)
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 4.
 */
import { test, expect, Page } from '@playwright/test';
import { activarHerramienta, clickAt, dispatch, st, type Cmd } from './helpers/lienzo';

const RECT = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
  ],
  internals: [], position: { x, y }, rotation: 0, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  ...extra,
});

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.locator('.toast__dismiss').evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click())).catch(() => {});
}

/** Supr con el ratón fuera de todo campo de texto, como lo pulsa María. */
async function pulsarSupr(page: Page) {
  await page.mouse.move(700, 620);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
}

const nPiezas = async (page: Page) => (await st(page)).project.pieces.length;

test.describe('#1115 — Supr borra lo que se ve', () => {
  test.setTimeout(90_000);

  test('A · una línea interna seleccionada se borra ella, no su pieza', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 400, 100));
    await dispatch(page, 'project/addInternalLine', {
      pieceId: 'p1',
      line: { id: 'L1', type: 'internal', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [180, 20] }] },
    });
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectInternalLine', { pieceId: 'p1', lineId: 'L1' });
    await page.waitForTimeout(300);

    expect(await nPiezas(page)).toBe(2);
    await pulsarSupr(page);

    const s = await st(page);
    const p1 = s.project.pieces.find((p) => p.id === 'p1');
    expect(s.project.pieces.length, 'Supr se llevó la pieza entera').toBe(2);
    expect(p1, 'la pieza anfitriona desapareció').toBeDefined();
    expect((p1 as unknown as { internals: unknown[] }).internals.length, 'la línea interna sigue ahí').toBe(0);
  });

  test('B · una pieza bloqueada no se borra con Supr', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('pA', 100, 100, { locked: true }));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'pA');
    await page.waitForTimeout(300);

    expect((await st(page)).editor.selectedPieceIds, 'no quedó seleccionada, el caso no se ejerce').toContain('pA');
    await pulsarSupr(page);

    expect(await nPiezas(page), 'el candado no protegió del borrado').toBe(1);
  });

  test('B2 · y el candado no bloquea el borrado de una pieza libre a su lado', async ({ page }) => {
    // La red contra el arreglo perezoso: "no borres nunca" también pasaría B.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('pA', 100, 100, { locked: true }));
    await dispatch(page, 'project/addPiece', RECT('pB', 400, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'pB');
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    const s = await st(page);
    expect(s.project.pieces.map((p) => p.id)).toEqual(['pA']);
  });

  test('C · el menú Edición ▸ Eliminar obedece la misma regla que la tecla', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 400, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(200);
    // Entrar al menú de costuras por la puerta real (el atajo), que es la que
    // deja `editor.activeTool` y `tools.activeTool2D` en su sitio.
    await page.keyboard.press('n');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('seam');
    await page.waitForTimeout(300);

    const menu = page.locator('.logo-menu__trigger, .top-bar .logo-menu, [aria-label="Menú de la aplicación"]').first();
    await menu.click();
    await page.locator('.logo-menu').waitFor({ timeout: 8000 });
    await page.getByText('Edición', { exact: true }).first().hover();
    await page.waitForTimeout(400);
    await page.locator('.logo-menu__submenu').getByText(/^Eliminar$/).first().click();
    await page.waitForTimeout(600);

    expect(await nPiezas(page), 'el menú borró la pieza estando en Coser (#1094 por la otra puerta)').toBe(2);
  });

  test('C2 · pero el menú sigue borrando cuando de verdad toca', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 400, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(300);

    const menu = page.locator('.logo-menu__trigger, .top-bar .logo-menu, [aria-label="Menú de la aplicación"]').first();
    await menu.click();
    await page.locator('.logo-menu').waitFor({ timeout: 8000 });
    await page.getByText('Edición', { exact: true }).first().hover();
    await page.waitForTimeout(400);
    await page.locator('.logo-menu__submenu').getByText(/^Eliminar$/).first().click();
    await page.waitForTimeout(600);

    const s = await st(page);
    expect(s.project.pieces.map((p) => p.id)).toEqual(['p2']);
  });
});

/**
 * La segunda mitad de #1115, la que la tanda del 09-04 no barrió (2026-09-15).
 *
 * El caso A se arregló metiendo la decisión en `resolverBorrado`, y eso cubre
 * a los sujetos que VIVEN EN EL STORE. Los sujetos que son estado LOCAL de una
 * herramienta siguen perdiendo el duelo, y por la misma razón de siempre:
 *
 *   · `ShortcutProvider` escucha en `document`, burbuja  (ShortcutProvider.tsx:84)
 *   · `routeKey` escucha en `window`, CAPTURA — gana     (useEditorInteractions.ts:633)
 *   · los dueños locales escuchan en `window`, burbuja   (useEditorInteractions.ts:490)
 *
 * `document` en burbuja corre ANTES que `window` en burbuja. Y la captura, que
 * sí llegaría primero, tiene un portón en la línea 585:
 *
 *     if (e.key !== 'Escape') return null;
 *
 * O sea: por la captura solo pasan Supr y Retroceso de la pluma, las formas
 * armadas, la línea interna EN TRAZO y el elástico. Todo lo demás llega tarde.
 *
 * Censo de quién queda fuera (grep de `'Delete'`/`'Backspace'` en
 * `src/components/PatternEditor/`, 2026-09-15): exactamente dos.
 *
 *   D) `useEditPattern.ts:848`   — Supr sobre un nodo seleccionado
 *   E) `useTopstitchTool.ts:294` — Retroceso quita el último punto del pespunte
 *
 * Medir NO está: su `handleKeyDown` solo mira Escape desde hace tiempo
 * (`useMeasureTool.ts:413`). El issue lo cita y el issue está viejo.
 */
test.describe('#1115 (2ª mitad) — el sujeto local también manda', () => {
  test.setTimeout(90_000);

  test('D · Supr sobre un nodo de Editar patrón borra el nodo, no la pieza', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    // Como llega María: la pieza venía seleccionada y ella entra a editarla.
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'q', 'editPattern');

    await clickAt(page, { x: 200, y: 175 });   // entrar a la pieza
    await clickAt(page, { x: 100, y: 100 });   // agarrar la esquina
    await page.waitForTimeout(300);

    // Sin esto el caso no se ejerce: si la pieza no está en la selección
    // global, el atajo global no tenía nada que borrar y el test pasa solo.
    expect(
      (await st(page)).editor.selectedPieceIds,
      'la pieza no quedó en la selección global: el duelo no ocurre y el test no mide nada',
    ).toContain('p1');

    const antes = (await st(page)).project.pieces.find(p => p.id === 'p1')!.outline.length;
    await pulsarSupr(page);

    const s = await st(page);
    expect(s.project.pieces.length, 'Supr se llevó la pieza entera estando en Editar patrón').toBe(2);
    const p1 = s.project.pieces.find(p => p.id === 'p1');
    expect(p1, 'la pieza que se estaba editando desapareció').toBeDefined();
    expect(p1!.outline.length, 'el nodo seleccionado no se borró, o se llevó más de uno').toBe(antes - 1);
  });

  test('E · Retroceso en Pespunte libre quita el último punto, no la pieza', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'l', 'topstitchFree');

    await clickAt(page, { x: 140, y: 140 });
    await clickAt(page, { x: 200, y: 160 });
    await clickAt(page, { x: 260, y: 200 });
    await page.waitForTimeout(300);

    expect(
      (await st(page)).editor.selectedPieceIds,
      'la pieza no quedó en la selección global: el duelo no ocurre',
    ).toContain('p1');

    await page.mouse.move(700, 620);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    expect(
      (await st(page)).project.pieces.length,
      'Retroceso, que en Pespunte libre deshace el último punto, borró la pieza',
    ).toBe(1);

    // Y que de verdad deshizo UN punto: que la pieza siga viva no lo prueba.
    // Enter cierra el pespunte libre, así que el trazo guardado cuenta los
    // puntos que quedaron — tres clics menos un Retroceso son dos.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const pieza = (await st(page)).project.pieces[0] as unknown as {
      internals: Array<{ type: string; path: Cmd[] }>;
    };
    const pespuntes = pieza.internals.filter(l => l.type === 'topstitch');
    expect(pespuntes.length, 'el pespunte no se guardó, así que el oráculo no mide nada').toBe(1);
    expect(pespuntes[0].path.length, 'el Retroceso no quitó el último punto').toBe(2);
  });

  // ── Los controles. Sin estos, «consumir siempre la tecla» pasaría D y E y
  //    dejaría a María sin poder borrar una pieza por estar en una herramienta.

  test('D2 · en Editar patrón SIN nodo agarrado, Supr sí borra la pieza', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'q', 'editPattern');

    await clickAt(page, { x: 200, y: 175 });   // entra a la pieza, sin agarrar nodo
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    expect(
      (await st(page)).project.pieces.map(p => p.id),
      'entrar a Editar patrón apagó el borrado normal',
    ).toEqual(['p2']);
  });

  test('E2 · en Pespunte libre sin puntos puestos, Retroceso sí borra la pieza', async ({ page }) => {
    // RETROCESO, no Supr. La primera versión de este control pulsaba Supr y
    // pasaba con el arreglo perezoso puesto: Pespunte nunca mira Supr, así que
    // la tecla caía al global por otro camino y el test no medía nada. El
    // control tiene que pulsar la MISMA tecla que el gancho se pelea.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'l', 'topstitchFree');
    await page.waitForTimeout(300);
    await page.mouse.move(700, 620);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    expect(
      (await st(page)).project.pieces.map(p => p.id),
      'entrar a Pespunte apagó el borrado normal',
    ).toEqual(['p2']);
  });

  test('D3 · y cuando el nodo no se puede borrar, tampoco se borra la pieza', async ({ page }) => {
    // El caso que el comentario viejo de `useEditPattern.ts` dejaba pasar: con
    // un triángulo, quitar un nodo dejaría dos puntos, así que el gancho avisa
    // y se rinde — soltando la tecla al atajo global, que se llevaba la pieza.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', {
      id: 'tri', name: 'tri',
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
        { type: 'L', values: [100, 150] }, { type: 'Z', values: [] },
      ],
      internals: [], position: { x: 100, y: 100 }, rotation: 0, mirrored: false,
      seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    });
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'tri');
    await activarHerramienta(page, 'q', 'editPattern');

    await clickAt(page, { x: 130, y: 140 });   // dentro del triángulo
    await clickAt(page, { x: 100, y: 100 });   // la esquina de arriba a la izquierda
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    await expect(
      page.locator('.toast', { hasText: /al menos 3 puntos/i }),
      'no se puede borrar el nodo y no se lo dice: silencio donde hay una regla',
    ).toBeVisible({ timeout: 4000 });

    const s = await st(page);
    expect(s.project.pieces.length, '«hacen falta 3 puntos» terminó borrando la pieza entera').toBe(1);
    expect(s.project.pieces[0].outline.length, 'el contorno se tocó pese al aviso').toBe(4);
  });

  test('D4 · y Retroceso hace lo mismo que Supr, que es la otra tecla del atajo', async ({ page }) => {
    // `edit.deleteAlt` está en Retroceso y llama al MISMO `deleteSelection`.
    // Sin este caso, estrechar el gancho a solo 'Delete' dejaba todo en verde.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'q', 'editPattern');

    await clickAt(page, { x: 200, y: 175 });
    await clickAt(page, { x: 100, y: 100 });
    await page.waitForTimeout(300);

    const antes = (await st(page)).project.pieces.find(p => p.id === 'p1')!.outline.length;
    await page.mouse.move(700, 620);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    const s = await st(page);
    expect(s.project.pieces.length, 'Retroceso se llevó la pieza entera').toBe(2);
    expect(s.project.pieces.find(p => p.id === 'p1')!.outline.length, 'el nodo no se borró').toBe(antes - 1);
  });

  test('F · un TRAMO agarrado tampoco deja que Supr se lleve la pieza', async ({ page }) => {
    // El hermano que el censo por `grep 'Delete'` no veía: `selectedSegments`
    // vive en el MISMO gancho, se pinta igual, y el Escape de arriba ya lo
    // trataba como sujeto vivo. No existe «borrar tramo» — el contrato es que
    // no pase nada, no que desaparezca la pieza.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'q', 'editPattern');

    await clickAt(page, { x: 200, y: 175 });   // entra
    await clickAt(page, { x: 200, y: 100 });   // mitad del lado de arriba: un TRAMO, no un nodo
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    const s = await st(page);
    expect(s.project.pieces.map(p => p.id), 'Supr con un tramo resaltado se llevó la pieza').toEqual(['p1', 'p2']);
    expect(s.project.pieces.find(p => p.id === 'p1')!.outline.length, 'el contorno cambió').toBe(5);
  });

  test('G · un nodo de Editar curva tampoco deja que Supr se lleve la pieza', async ({ page }) => {
    // El tercer hermano, y el que prueba que el censo estaba mal medido:
    // `useEditCurve` no contiene la cadena 'Delete' en ninguna línea, así que
    // un grep del síntoma no podía encontrarlo. Su propio comentario dice
    // «mismo escalón que useEditPattern».
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'v', 'editCurve');

    await clickAt(page, { x: 200, y: 175 });
    await clickAt(page, { x: 100, y: 100 });
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    expect(
      (await st(page)).project.pieces.map(p => p.id),
      'Supr con un nodo de curva agarrado se llevó la pieza',
    ).toEqual(['p1', 'p2']);
  });

  test('G2 · en Editar curva sin nodo agarrado, Supr sí borra la pieza', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'v', 'editCurve');
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    expect(
      (await st(page)).project.pieces.map(p => p.id),
      'entrar a Editar curva apagó el borrado normal',
    ).toEqual(['p2']);
  });

  test('H · Pespunte por tramo con un extremo puesto no pierde la pieza', async ({ page }) => {
    // El tercer modo que dibuja. La guarda de `segSnapA`/`segSnapB` nació en
    // este arreglo sin un solo test que la mirara.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 500, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await activarHerramienta(page, 'k', 'topstitchSegment');

    await clickAt(page, { x: 160, y: 100 });   // un extremo sobre el lado de arriba
    await page.waitForTimeout(300);
    await page.mouse.move(700, 620);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    expect(
      (await st(page)).project.pieces.map(p => p.id),
      'Retroceso, que en Pespunte por tramo suelta el extremo, borró la pieza',
    ).toEqual(['p1', 'p2']);
  });

  test('I · y Escape sigue cerrando el menú contextual en Editar patrón', async ({ page }) => {
    // Regresión medida: la primera versión de este arreglo subía TODAS las
    // teclas del gancho a la captura, y `stopPropagation` ahí mata la
    // propagación entera. `ContextMenu` escucha en `document` en burbuja, o sea
    // después, y el menú se quedaba abierto. Es el menú que lleva las firmas
    // de María del #1166.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await page.waitForTimeout(300);
    await activarHerramienta(page, 'q', 'editPattern');
    await clickAt(page, { x: 200, y: 175 });
    await page.waitForTimeout(300);

    await clickAt(page, { x: 200, y: 100 }, 'right');
    const menu = page.locator('.context-menu');
    await expect(menu, 'el clic derecho no abrió el menú: el caso no se ejerce').toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(menu, 'Escape dejó el menú abierto').toHaveCount(0, { timeout: 4000 });
  });
});
