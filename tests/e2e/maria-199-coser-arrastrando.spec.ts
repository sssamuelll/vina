import { test, expect, Page } from '@playwright/test';

/**
 * maria-199 / #219 — el recorrido de punta a punta de la herramienta de coser
 * unificada (#1029): un arrastre sobre un borde cose solo ese tramo, un clic
 * cose el borde entero, y "Editar costuras" deja ver cuál costura seleccionó
 * un clic sobre esa línea.
 *
 * Los cuatro helpers pedidos por el brief son en realidad tres: el spec
 * hermano `maria-218-eco-punto-y-mover.spec.ts` no define ningún `toScreen`
 * (grep confirmado). Sus propias interacciones post-dibujo reutilizan las
 * coordenadas crudas de pantalla con las que se dibujó cada pieza (línea 96:
 * `page.mouse.click((A.left + A.right) / 2, A.bottom)`), sin conversión —
 * válido porque `drawRectAt` nunca toca zoom2D/pan2D (quedan en su default
 * 1 / {0,0}) y la transformada screenToPattern es la misma en ambos momentos.
 * Este spec sigue esa misma convención en vez de inventar un cuarto helper
 * que no existe en el hermano.
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(600);
}

interface StoreWindow {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => {
      tools: { activeTool2D: string };
      project: { pieces: { id: string }[]; seams: unknown[] };
      editor: { selectedSeamId: string | null };
    };
  };
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

test.describe('maria-199 — coser un tramo arrastrando, y verlo en Editar costuras', () => {
  test.setTimeout(120_000);

  test('coser un tramo arrastrando, y verlo en Editar costuras', async ({ page }) => {
    await waitForApp(page);

    // Dos piezas separadas: A de x=100..250, B de x=400..550. 150px de lona
    // vacía entre ellas, para que ningún hit-test de borde sea ambiguo.
    //
    // Empezaban en y=100 y la segunda no nacía: `.tool-strip` flota sobre el
    // lienzo en x 326..626, y 64..134, así que el `mousedown` de B en (400,100)
    // caía en la tira y no en la lona. El de A, a x=100, sí entraba — por eso
    // el fallo se leía como «no se crea la costura» y no como «falta una
    // pieza». Medido con `elementFromPoint`. Bajar la banda a y=180..380 deja
    // ambas por debajo de la tira y muy por encima de `.fila-de-capas` (y≥584).
    await drawRectAt(page, 100, 180, 250, 380);
    await drawRectAt(page, 400, 180, 550, 380);

    // Las dos piezas TIENEN que existir antes de coser. Sin esto, el gesto de
    // coser cae en lona vacía y el fallo se presenta como «no hay costura»,
    // que es el síntoma equivocado: costó una reproducción entera averiguar
    // que lo que faltaba era la pieza.
    const cuantas = await page.evaluate(() =>
      (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces.length);
    expect(cuantas, 'no se dibujaron las dos piezas: el gesto cayó fuera de la lona').toBe(2);

    // Coser: arrastrar del 25% al 75% del borde derecho de la primera pieza
    // (x=250, de y=180 a y=380 → el 25%/75% cae en y=230/y=330).
    await setTool(page, 'seam');
    await page.mouse.move(250, 230);
    await page.mouse.down();
    await page.mouse.move(250, 330, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Clic entero en el borde izquierdo de la segunda pieza (x=400, punto medio
    // y=280) — cierra la costura.
    await page.mouse.click(400, 280);
    await page.waitForTimeout(300);

    // La costura existe y la mitad arrastrada (pieceA) lleva rango parcial: la
    // convención de rango completo es campos ausentes, nunca 0 y 1 — así que
    // si el arrastre no llegó a producir un tramo, esto lo delata en vez de
    // pasar por la vía del clic.
    const seam = await page.evaluate(() =>
      (window as unknown as StoreWindow).__VINA_STORE__.getState().project.seams[0]);
    expect(seam, 'no seam fue creada por el gesto de coser').toBeTruthy();
    const half = seam as { pieceA: { tStart?: number; tEnd?: number }; pieceB: { tStart?: number; tEnd?: number } };
    expect(half.pieceA.tStart, 'el arrastre no dejó tStart > 0 — ¿cayó a clic?').toBeGreaterThan(0);
    expect(half.pieceA.tEnd, 'el arrastre no dejó tEnd < 1 — ¿cayó a clic?').toBeLessThan(1);
    // El lado clicado no lleva esos campos — ni 0 ni 1, ausentes.
    expect(half.pieceB.tStart).toBeUndefined();
    expect(half.pieceB.tEnd).toBeUndefined();

    // Editar costuras: clicar el borde enseña la costura seleccionada.
    await setTool(page, 'seamEdit');
    await page.mouse.click(400, 280);
    await page.waitForTimeout(300);
    const selected = await page.evaluate(() =>
      (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.selectedSeamId);
    expect(selected, 'Editar costuras no dejó una costura seleccionada tras el clic').toBeTruthy();
  });
});
