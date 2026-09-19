import { test, expect, Page } from '@playwright/test';

/**
 * maria-218 — "Estando ahora en la herramienta punto, cuando he creado un
 * punto, clicando en la linea de la pieza, se crea automáticamente el nuevo
 * punto pero tambien aparece como un marco con los mismos puntos de la pieza
 * pero trasladados en otro sitio, como si fuera un eco."
 *
 * Los fantasmas de su foto son glifos `bezierAnchor` — círculos huecos con halo
 * blanco — flotando sobre lona vacía, lejos de cualquier pieza.
 *
 * Causa, reproducida el 2026-08-11: los verbos de `useEditPattern` aceptan un
 * `pieceId` explícito "para callers fuera del modo edición", y el tool Punto es
 * uno. Pero `dispatchAndRefresh` pisaba `state.nodes` con las anclas de la
 * pieza que tocó el verbo sin mirar cuál se está editando. Con "Editar patrón"
 * abierto sobre A y un punto puesto sobre B, el overlay se quedaba con las
 * anclas de B y la transformada de A: coordenadas locales de una pieza pintadas
 * en el sitio de otra.
 *
 * No es el #194 otra vez. Aquel era el arrastre (posición de Redux contra
 * transform de DOM) y se cerró escondiendo las anclas mientras dura. Este no
 * necesita ningún arrastre — que es justo por lo que aquel fix no lo tapó.
 */

interface StoreWindow {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => { tools: { activeTool2D: string }; project: { pieces: { id: string }[] } };
  };
}

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function setTool(page: Page, id: string) {
  await page.evaluate(i => {
    const s = (window as unknown as StoreWindow).__VINA_STORE__;
    s.dispatch({ type: 'editor/setActiveTool', payload: i });
    s.dispatch({ type: 'tools/setActiveTool2D', payload: i });
  }, id);
  await page.waitForTimeout(200);
}

const activeTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D);

const pieceCount = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces.length);

/** Vértices del contorno de cada pieza. Poner un punto hace crecer uno. */
const outlineLengths = (page: Page): Promise<number[]> =>
  page.evaluate(() =>
    (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces.map(
      (p) => (p as unknown as { outline: unknown[] }).outline.length,
    ));

/** Dibuja un rectángulo entre dos esquinas de pantalla. */
async function drawRectAt(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.keyboard.press('s');
  await expect.poll(() => activeTool(page)).toBe('rectangle');
  // El cartel de lona vacía se come el primer arrastre si no se espera a que
  // se desmonte: sin esto, el primer rectángulo no llega a existir.
  await page.locator('[data-testid="empty-state-2d"]')
    .waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

/**
 * Censo de anclas con su DUEÑO.
 *
 * Desde #1144 (06-09) hay DOS capas que pintan `[data-anchor-role]`:
 * `PuntosDelContorno`, ambiente, que cuelga de un `[data-piece-id]` y dibuja
 * los puntos de TODAS las piezas en su sitio; y el overlay de edición, que no
 * cuelga de ninguna pieza y coloca las anclas con la transformada de la pieza
 * que se está editando. El eco de María vive en la segunda: es la lista de
 * nodos de una pieza pintada con la transformada de otra.
 *
 * Por eso cada ancla se anota con su dueño y con la caja de ese dueño: la del
 * overlay se compara contra la pieza en edición, y la ambiente contra su
 * propia pieza.
 */
const anchorCentres = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-anchor-role]')).map(el => {
    const r = (el as SVGGElement).getBoundingClientRect();
    const dueño = el.closest('[data-piece-id]');
    // La caja se toma del TRAZO de la pieza (`.piece-fill`), no del grupo. El
    // grupo contiene a las propias anclas, así que un ancla descolocada
    // agrandaría la caja hasta contenerse a sí misma y el oráculo pasaría en
    // verde con el eco dentro. El trazo es geometría pura y no puede crecer.
    const c = dueño?.querySelector('.piece-fill')?.getBoundingClientRect();
    return {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      pieza: dueño?.getAttribute('data-piece-id') ?? null,
      caja: c ? { left: c.left, top: c.top, right: c.right, bottom: c.bottom } : null,
    };
  }));

type Caja = { left: number; top: number; right: number; bottom: number };
/** El glifo mide unos 10px y la caja es la del trazo, así que el margen es 30. */
const M = 30;
const fueraDe = (a: { x: number; y: number }, c: Caja) =>
  a.x < c.left - M || a.x > c.right + M || a.y < c.top - M || a.y > c.bottom + M;

/**
 * Censo de todo trazo discontinuo del lienzo, con su caja en pantalla.
 *
 * Discontinuo porque es lo que María describe ("se ven discontinuas"), y
 * porque en el lienzo lo son justo las superficies que se colocan sumando
 * `piece.position` de Redux: POM, costuras, ghost de piquete espejo.
 */
const dashedBoxes = (page: Page) => page.evaluate(() => {
  const out: { etiqueta: string; x: number; y: number }[] = [];
  document.querySelectorAll('svg.pattern-svg *').forEach((el) => {
    const da = (el as SVGElement).getAttribute('stroke-dasharray');
    if (!da || da === 'none') return;
    const r = (el as SVGGraphicsElement).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    out.push({ etiqueta: `${el.tagName} dash=${da}`, x: Math.round(r.x), y: Math.round(r.y) });
  });
  return out;
});

test.describe('maria-218 — el eco de la pieza al crear un punto', () => {
  test.setTimeout(120_000);

  test('poner un punto en otra pieza no deja anclas flotando fuera de la que se edita', async ({ page }) => {
    await waitForApp(page);
    const box = await page.locator('svg.pattern-svg').boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    // Pieza A, a la izquierda. Pieza B, bien separada a la derecha.
    // Dentro de ±170 del centro: fuera de esa banda el arrastre no llega a la
    // lona y la pieza no se crea.
    const A = { left: cx - 160, top: cy - 130, right: cx - 20, bottom: cy - 20 };
    const B = { left: cx + 20, top: cy + 20, right: cx + 160, bottom: cy + 130 };
    await drawRectAt(page, A.left, A.top, A.right, A.bottom);
    await drawRectAt(page, B.left, B.top, B.right, B.bottom);
    await expect.poll(() => pieceCount(page)).toBe(2);

    // Editar patrón sobre A: sus anclas quedan pintadas.
    //
    // El clic va al INTERIOR de A, no a su borde inferior. Antes iba al borde
    // y eso lo hacía depender de un píxel de frontera: con `snapToGrid`, el
    // borde dibujado no cae exactamente donde el arrastre lo pidió, así que
    // acertar dependía de dónde cayera el centro del lienzo. Medido el
    // 2026-08-16 con la canaleta de opciones (#1049), que le quita 41px de
    // alto: el borde real quedaba 2px por encima del punto clicado y la pieza
    // no se seleccionaba. Seleccionar A es PREPARACIÓN, no lo que este test
    // vigila; clicar dentro lo consigue igual y no depende del subpíxel.
    await setTool(page, 'editPattern');
    await page.mouse.click((A.left + A.right) / 2, (A.top + A.bottom) / 2);
    await page.waitForTimeout(400);
    // Las del overlay son las que prueban que la edición de A entró de verdad;
    // las ambiente están desde que existe la pieza y no prueban nada de eso.
    const enA = (await anchorCentres(page)).filter(a => a.pieza === null);
    expect(enA.length, 'el overlay de edición no pintó ninguna ancla: A no entró en edición').toBeGreaterThan(0);

    // Sin salir de la edición, herramienta punto y clic sobre el borde de B.
    await setTool(page, 'point');
    await page.waitForTimeout(300);
    const vérticesAntes = await outlineLengths(page);
    await page.mouse.click((B.left + B.right) / 2, B.top);
    await page.waitForTimeout(600);

    // El punto TIENE que haberse insertado. Sin esta comprobación, un clic que
    // falle el borde deja el test en verde sin haber ejercido nada: la
    // aserción de abajo cuenta anclas fuera de sitio, y si nunca se puso el
    // punto no hay ninguna. Un verde vacío es peor que un rojo.
    const vérticesDespués = await outlineLengths(page);
    expect(
      vérticesDespués.some((n, i) => n > vérticesAntes[i]),
      `ninguna pieza ganó un vértice: antes ${vérticesAntes}, después ${vérticesDespués}`,
    ).toBe(true);

    // Ni una sola ancla puede caer lejos de la pieza a la que pertenece.
    //
    // El oráculo viejo decía «ninguna ancla fuera de la caja de A» y valía
    // cuando A era la única pieza con anclas pintadas. Desde #1144 las
    // ambiente salen para TODAS las piezas, así que las cuatro de B en su
    // propio sitio —correctas— lo tumbaban. Este mide la propiedad de verdad,
    // que es la que María describió: una pieza no puede aparecer dibujada
    // donde no está.
    const censo = await anchorCentres(page);
    expect(censo.length, 'no quedó ni un ancla que mirar: el test no ejerce nada').toBeGreaterThan(0);
    const overlay = censo.filter(a => a.pieza === null);
    const ambiente = censo.filter(a => a.caja !== null);

    // Aquí NO se exige que el overlay exista. Medido el 2026-09-19: está
    // gateado por `activeTool === 'editPattern'`, así que al pasar a la
    // herramienta punto se desmonta y esta lista viene vacía. Exigirlo era el
    // error del primer intento de arreglo. El peso lo lleva `ambiente`, que
    // es la capa que hoy SÍ dibuja durante todo el recorrido de María.
    //
    // Consecuencia honesta: por la vía del overlay este recorrido ya no puede
    // reproducir el eco, porque el overlay no llega vivo hasta el final. La
    // propiedad se sigue vigilando en la capa que sí llega.
    const ecoDelOverlay = overlay.filter(a => fueraDe(a, A));
    expect(
      ecoDelOverlay,
      `anclas del overlay de edición fuera de la pieza que se edita: ${JSON.stringify(ecoDelOverlay)}`,
    ).toHaveLength(0);

    // Ambiente: cada una sobre su propia pieza. Si `dispatchAndRefresh`
    // volviera a pisar los nodos de una pieza con los de otra, el grupo de A
    // pintaría las anclas de B con la transformada de A y caerían aquí.
    const ecoAmbiente = ambiente.filter(a => fueraDe(a, a.caja!));
    expect(
      ecoAmbiente,
      `anclas pintadas lejos de su propia pieza: ${JSON.stringify(ecoAmbiente)}`,
    ).toHaveLength(0);
  });

  /**
   * La SEGUNDA mitad de su nota, la que quedó abierta:
   *
   *   "Y eso también me ha ocurrido con la herramienta mover pieza pero en vez
   *    de puntos son las líneas y se ven discontinuas trasladadas en otro sitio."
   *
   * Samuel aportó el camino: venía de "Editar patrón".
   *
   * Mecanismo: durante el arrastre la pieza se mueve por DOM directo
   * (`useEditorInteractions.ts:818`), mientras ONCE overlays se colocan sumando
   * `piece.position` — la posición de REDUX — y se quedan clavados. El fix del
   * #194 puso el candado a mano en TRES sitios; los otros nueve quedaron. De
   * ellos `POMOverlay` es el único que se monta sin condición de herramienta
   * ("always visible", ToolOverlay.tsx:177), así que es el que se ve hoy.
   *
   * Este test no vigila POM: vigila la PROPIEDAD. Cualquier superficie futura
   * que se coloque con Redux y no se tape cae aquí.
   */
  test('arrastrar una pieza no deja trazos clavados en el sitio viejo', async ({ page }) => {
    await waitForApp(page);
    const box = await page.locator('svg.pattern-svg').boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    const A = { left: cx - 160, top: cy - 130, right: cx - 20, bottom: cy - 20 };
    await drawRectAt(page, A.left, A.top, A.right, A.bottom);
    await expect.poll(() => pieceCount(page)).toBe(1);

    // Un POM sobre la pieza. Sin nada encima el eco no sale: con rectángulos
    // pelados el censo da cero a mitad del arrastre, y por eso tres rondas de
    // leer código no lo encontraron.
    await page.evaluate(() => {
      const s = (window as unknown as StoreWindow).__VINA_STORE__;
      const a = s.getState().project.pieces[0];
      const t = 1755400000000; // fijo: Date.now() haría el test no determinista
      s.dispatch({ type: 'project/addPOM', payload: {
        id: 'eco-pom', name: 'Eco', category: 'custom', method: 'straight',
        pointA: { pieceId: a.id, localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: a.id, localPosition: { x: 140, y: 0 } },
        value: 140, createdAt: t, updatedAt: t,
      } });
    });
    await page.waitForTimeout(300);

    // Su camino: entrar a Editar patrón y volver a la flecha SIN pulsar Esc.
    await setTool(page, 'editPattern');
    await page.mouse.click((A.left + A.right) / 2, (A.top + A.bottom) / 2);
    await page.waitForTimeout(400);
    await setTool(page, 'select');
    await page.waitForTimeout(300);

    const antes = await dashedBoxes(page);
    expect(antes.length, 'sin trazo discontinuo antes, el test no ejerce nada').toBeGreaterThan(0);

    // Arrastrar bien lejos y NO soltar: el eco solo existe durante el gesto.
    const desdeX = (A.left + A.right) / 2, desdeY = (A.top + A.bottom) / 2;
    await page.mouse.move(desdeX, desdeY);
    await page.mouse.down();
    await page.mouse.move(desdeX + 130, desdeY + 75, { steps: 8 });
    await page.mouse.move(desdeX + 260, desdeY + 150, { steps: 8 });
    await page.waitForTimeout(300);

    const clavados = (await dashedBoxes(page)).filter(d =>
      antes.some(a => a.etiqueta === d.etiqueta && Math.abs(a.x - d.x) < 3 && Math.abs(a.y - d.y) < 3));

    await page.mouse.up();

    expect(
      clavados,
      `trazos que no se movieron con la pieza: ${JSON.stringify(clavados)}`,
    ).toHaveLength(0);
  });
});
