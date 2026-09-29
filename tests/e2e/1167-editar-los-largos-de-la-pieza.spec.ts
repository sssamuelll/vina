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
  await page.goto('/app/');
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

    await page.keyboard.press('ControlOrMeta+a');
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
    await page.keyboard.press('ControlOrMeta+a');
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

  /**
   * «Tab se tragó la tecla y no abrió nada» y «Tab siguió su camino y no abrió
   * nada» dan el mismo cero de cajas. Lo único que los distingue es si el
   * router hizo `preventDefault`, así que eso es lo que se mide: un oráculo que
   * no puede ver el fallo pasa en verde con el bug dentro.
   */
  async function tabSeTragoLaTecla(page: Page): Promise<boolean> {
    await page.evaluate(() => {
      (window as unknown as { __tab?: boolean }).__tab = undefined;
      const oyente = (e: KeyboardEvent) => {
        if (e.key === 'Tab') (window as unknown as { __tab?: boolean }).__tab = e.defaultPrevented;
      };
      // En CAPTURA y sobre `window`, igual que el router. `stopPropagation` NO
      // detiene a los oyentes del MISMO nodo en la MISMA fase, así que este
      // corre después del suyo y ve su `preventDefault`.
      //
      // La primera versión de este helper escuchaba en burbuja, y ahí el
      // `stopPropagation` del router lo dejaba sin correr: devolvía `false`
      // SIEMPRE, incluso cuando la tecla se la tragaban. Un oráculo que solo
      // sabe decir una cosa pasa en verde con el fallo dentro — que es justo lo
      // que este helper vino a arreglar.
      window.addEventListener('keydown', oyente, { capture: true, once: true });
    });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    return page.evaluate(() => (window as unknown as { __tab?: boolean }).__tab === true);
  }

  test('el detector de «tecla tragada» sabe decir que SÍ (control)', async ({ page }) => {
    // Un detector sin su caso positivo es una opinión: si solo sabe decir «no»,
    // los tres tests que lo usan pasan en verde con el fallo dentro.
    await unRectanguloSeleccionado(page);
    await elRatonSobre(page, { x: 300, y: 350 });
    expect(
      await tabSeTragoLaTecla(page),
      'abriendo el lado, el router SÍ consume el Tab — si aquí sale false, el detector está ciego',
    ).toBe(true);
    await expect(campo(page, 'Largo')).toBeVisible();
  });

  test('con la pieza bloqueada, Tab no se traga la tecla', async ({ page }) => {
    await unRectanguloSeleccionado(page);
    await dispatch(page, 'project/lockPiece', 'p1');
    await page.waitForTimeout(300);
    await elRatonSobre(page, { x: 300, y: 350 });
    expect(await tabSeTragoLaTecla(page), 'Tab se consumió sin abrir nada: tecla muerta').toBe(false);
    expect(await caja(page).count(), 'abrió la caja de una pieza bloqueada').toBe(0);
  });

  test('en Medir, Tab ni abre ni se traga la tecla', async ({ page }) => {
    // § 4 del contrato del 08-09, en negrita suya: «Medir `M` | obtener
    // medidas; ningún gesto modifica geometría». La primera versión de esta
    // puerta no miraba la herramienta EN NINGUNA LÍNEA, así que abría una caja
    // editable aquí y en las otras ~18.
    await unRectanguloSeleccionado(page);
    await dispatch(page, 'editor/setActiveTool', 'measure');
    await dispatch(page, 'tools/setActiveTool2D', 'measure');
    await page.waitForTimeout(400);
    await elRatonSobre(page, { x: 300, y: 350 });
    expect(await tabSeTragoLaTecla(page), 'Medir se comió el Tab').toBe(false);
    expect(await caja(page).count(), 'Medir abrió una caja que escribe geometría').toBe(0);
  });

  test('el lado no sobrevive al cambio de herramienta', async ({ page }) => {
    // Medido en navegador antes de arreglarlo: la tira decía «Pluma · Editando:
    // el lado seleccionado» y la caja seguía plantada sobre el lienzo. § 2.2:
    // «Herramienta de creación vs. pieza ya seleccionada → gana la herramienta,
    // y desaparecen las cotas externas mientras dibuja».
    await unRectanguloSeleccionado(page);
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');            // cerrar el campo, chip en reposo
    await page.waitForTimeout(250);
    await expect(caja(page)).toHaveCount(1);

    await dispatch(page, 'editor/setActiveTool', 'pen');
    await dispatch(page, 'tools/setActiveTool2D', 'pen');
    await page.waitForTimeout(500);
    expect(await caja(page).count(), 'la caja del lado sobrevivió a la Pluma').toBe(0);
  });

  test('con el menú contextual abierto, Escape cierra EL MENÚ y no el lado', async ({ page }) => {
    // La puerta engancha su Escape en CAPTURA y con `stopPropagation`: un «sí»
    // de más mata la tecla para todo lo que venga después, y el Escape del menú
    // está en burbuja. Es la regresión que `useEditorInteractions` documenta
    // haber pagado una vez (#1115) y que la primera versión reintrodujo.
    await unRectanguloSeleccionado(page);
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    await clickAt(page, { x: 300, y: 275 }, 'right');
    await page.waitForTimeout(400);
    await expect(page.locator('.context-menu'), 'no se abrió el menú contextual').toHaveCount(1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(
      page.locator('.context-menu'),
      'el Escape se lo comió el lado y el menú se quedó abierto',
    ).toHaveCount(0);
  });

  test('el camino de verdad: clicar la pieza y pulsar Tab sin mover el ratón', async ({ page }) => {
    // Los otros casos mueven el ratón sobre el lado justo antes del Tab. Este
    // es el que ella va a hacer de verdad —clic en la pieza, Tab— y ahí el
    // ratón se quedó DENTRO, en el punto del clic. Tiene que abrir igual, y
    // abrir el lado que ese punto tiene más cerca.
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
    await page.waitForTimeout(600);
    await addPiece(page, 'p1', { x: 200, y: 200 }, 200, 150);
    await page.waitForTimeout(200);
    // Clic dentro, cerca del borde de abajo: (300, 340) está a 10 mm de él.
    await clickAt(page, { x: 300, y: 340 });
    await page.waitForTimeout(300);
    expect((await st(page)).editor.selectedPieceIds, 'el clic no seleccionó la pieza').toEqual(['p1']);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await expect(campo(page, 'Largo'), 'Tab tras clicar la pieza no abrió nada').toBeVisible();
    const valor = await campo(page, 'Largo').inputValue();
    expect(valor, `abrió un lado que no es el de abajo (200 mm): ${valor}`).toContain('200');
  });

  test('al SALIR de crear y volver a clicar la pieza, Tab ya abre el lado', async ({ page }) => {
    // Su frase entera: «al salir de crear y volver a clicar la pieza una
    // pudiera editar clicando TAB». Mientras el rectángulo sigue caliente, Tab
    // conserva Ancho —la medida que acaba de dibujar, #223/#225—; en cuanto
    // sale de crear, abre el largo del lado.
    await page.goto('/app/');
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

  test('el lado elegido con Tab en Z no se cuela en Editar patrón', async ({ page }) => {
    // Las dos puertas son excluyentes por herramienta. Con un `??` entre ellas,
    // el lado de `Z` seguía siendo el sujeto en `Q` sin nada seleccionado, y
    // además se quedaba el Escape que le tocaba a `editPattern`.
    await unRectanguloSeleccionado(page);
    await elRatonSobre(page, { x: 300, y: 350 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await expect(caja(page)).toHaveCount(1);

    await dispatch(page, 'editor/setActiveTool', 'editPattern');
    await dispatch(page, 'tools/setActiveTool2D', 'editPattern');
    await page.waitForTimeout(500);
    expect(await caja(page).count(), 'el lado de Z se coló en Editar patrón').toBe(0);

    // Y al volver a Z sigue ahí: es una selección, no una edición pendiente.
    await dispatch(page, 'editor/setActiveTool', 'select');
    await dispatch(page, 'tools/setActiveTool2D', 'select');
    await page.waitForTimeout(500);
    await expect(caja(page), 'volver a Z no recuperó el lado seleccionado').toHaveCount(1);
  });
});
