import { test, expect, Page } from '@playwright/test';

/**
 * #1033 — "cuando se selecciona una pieza que ha mutado de forma se selecciona
 * como si fuera un rectangulo... me gusta el control de giro del angulo pero
 * actualmente no funciona bien".
 *
 * La caja de transformación no sabía que las piezas tienen orientación:
 * `computeBoundingBox` ignoraba `piece.rotation`. Medido antes del arreglo, con
 * la pieza a 45° caía 1 de sus 6 vértices dentro del marco dibujado, y el
 * tirador de giro se quedaba clavado en el mismo punto para 0°, 45° y 90°.
 *
 * Esto vive en un navegador y no en jsdom a propósito: los unitarios prueban
 * que `computeHandlePositions` DEVUELVE posiciones giradas, no que se puedan
 * AGARRAR. jsdom no tiene `elementFromPoint` y su `getBoundingClientRect()`
 * devuelve ceros, así que la pregunta "¿el tirador está donde se dibuja?" solo
 * la contesta layout de verdad.
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  return page.evaluate((act) => {
    const root = document.getElementById('root');
    if (!root) return;
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    if (!key) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = [(root as any)[key]];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (node.memoizedProps?.store?.dispatch) {
        node.memoizedProps.store.dispatch(act);
        return;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
  }, action);
}

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; selectedPieceIds: string[] };
      project: { pieces: Array<{ rotation: number }> };
    };
  };
}

/** Pieza MUTADA: forma de L, asimétrica en los dos ejes. Un rectángulo no
 *  sirve — su caja eje-alineada no se entera de que gira. */
const L_SHAPE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [160, 0] },
  { type: 'L', values: [160, 60] },
  { type: 'L', values: [60, 60] },
  { type: 'L', values: [60, 220] },
  { type: 'L', values: [0, 220] },
  { type: 'Z', values: [] },
];

async function ponerPiezaGirada(page: Page, rotation: number) {
  await dispatch(page, { type: 'project/addPiece', payload: {
    id: 'i1033', name: 'Mutada', outline: L_SHAPE,
    internals: [], position: { x: 150, y: 180 }, rotation, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  } });
  await page.waitForTimeout(400);

  await page.keyboard.press('z');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool))
    .toBe('select');
  await dispatch(page, { type: 'editor/selectPiece', payload: 'i1033' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.selectedPieceIds.length))
    .toBe(1);
  await page.waitForTimeout(400);
}

/** Rectángulo en pantalla del marco de selección, con su transform aplicado. */
const marcoEnPantalla = (page: Page) =>
  page.locator('g.transform-handles > rect').first().boundingBox();

/** Rectángulo en pantalla de la LÍNEA DE CORTE. El grupo entero no sirve de
 *  referencia: incluye `g.anchor-points`, cuyos cuadritos de 6 px sobresalen
 *  6·√2 a 45° y meterían un desfase que no es de la caja. */
const piezaEnPantalla = (page: Page) =>
  page.locator('[data-piece-id="i1033"] path.piece-fill').first().boundingBox();

test.describe('#1033 — la caja de selección sigue a la pieza', () => {
  test.setTimeout(120_000);

  test('el marco encierra a la pieza girada, no al fantasma sin girar', async ({ page }) => {
    await waitForApp(page);
    await ponerPiezaGirada(page, 45);

    const marco = await marcoEnPantalla(page);
    const pieza = await piezaEnPantalla(page);
    if (!marco || !pieza) throw new Error('sin marco o sin pieza en pantalla');

    // El contorno local es ajustado, así que la caja orientada circunscribe la
    // pieza y las dos huellas coinciden. No es "parecido": medido, salen
    // idénticas a dos decimales, porque la caja se coloca con el MISMO
    // `rotate(deg, cx, cy)` que el renderizador aplica a la pieza. Antes del
    // arreglo el marco se quedaba donde estaba la pieza SIN girar.
    expect(Math.abs(marco.x - pieza.x)).toBeLessThan(2);
    expect(Math.abs(marco.y - pieza.y)).toBeLessThan(2);
    // Tolerancia de 2 px sobre una caja de ~268: lo que sobra es TINTA, no
    // posición. Un píxel de diferencia de grosor de trazo infla la huella en
    // √2 ≈ 1.414 cuando la forma va a 45°, y eso es exactamente lo que se mide
    // aquí. Con los trazos igualados las dos huellas salen idénticas a dos
    // decimales.
    expect(Math.abs(marco.width - pieza.width)).toBeLessThan(2);
    expect(Math.abs(marco.height - pieza.height)).toBeLessThan(2);
  });

  test('el tirador de giro se puede AGARRAR donde se dibuja', async ({ page }) => {
    await waitForApp(page);
    await ponerPiezaGirada(page, 45);

    // Quién pinta encima en el punto donde el círculo dice estar. Si el
    // tirador se dibuja en un sitio y vive en otro, esto no lo encuentra.
    const agarrable = await page.evaluate(() => {
      const c = document.querySelector('g.transform-handles circle');
      if (!c) return 'sin tirador';
      const r = c.getBoundingClientRect();
      const encima = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return encima === c ? 'el tirador' : (encima?.tagName ?? 'nada');
    });
    expect(agarrable).toBe('el tirador');
  });

  test('girar con el tirador escribe el ángulo y no deja la pieza a la deriva', async ({ page }) => {
    await waitForApp(page);
    await ponerPiezaGirada(page, 0);

    const svg = await page.locator('svg.pattern-svg').boundingBox();
    const circulo = await page.locator('g.transform-handles circle').first().boundingBox();
    if (!svg || !circulo) throw new Error('sin svg o sin tirador');
    const cx = circulo.x + circulo.width / 2;
    const cy = circulo.y + circulo.height / 2;

    // El pivote es el centro del contorno local más la posición: (230, 290).
    const pivotX = svg.x + 230;
    const pivotY = svg.y + 290;

    // Ida: un cuarto de vuelta, del norte al este del pivote.
    const radio = Math.hypot(cx - pivotX, cy - pivotY);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(pivotX + radio, pivotY, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const despues = await page.evaluate(() =>
      (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces
        .find(p => (p as unknown as { id: string }).id === 'i1033')!.rotation);

    // El ángulo vive en el campo, no horneado en las coordenadas.
    expect(Math.abs(despues)).toBeGreaterThan(60);
  });
});
