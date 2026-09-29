import { test, expect, Page } from '@playwright/test';

/**
 * #1061 — "soltar fuera del borde cae a clic y cose el borde entero".
 *
 * Los unitarios ya prueban que el hook devuelve el tramo. Esto vive en un
 * navegador por lo que ellos NO pueden probar: el `setPointerCapture` del press
 * está mockeado en jsdom, así que la fila 5 de § 3.4 del spec —"fuera del
 * lienzo: el `pointerup` llega igual"— nunca se ejerce de verdad. Aquí se
 * suelta el ratón FUERA del svg, con captura real, y se mide la costura que
 * queda guardada en el store.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 3.4
 */

async function waitForApp(page: Page) {
  await page.goto('/app/');
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
      editor: { activeTool: string };
      project: {
        seams: Array<{
          pieceA: { pieceId: string; tStart?: number; tEnd?: number };
          pieceB: { pieceId: string; tStart?: number; tEnd?: number };
        }>;
      };
    };
  };
}

/** Solo las costuras de ESTAS piezas: si el proyecto arrancara con algo
 *  cargado, `seams[0]` podría no ser la que acabamos de hacer. */
const seams = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as StoreWindow).__VINA_STORE__.getState().project.seams
      .filter(s => s.pieceA.pieceId === 'pA' || s.pieceB.pieceId === 'pA'));

/** Borde de arriba partido en DOS comandos: un rectángulo de un comando por
 *  lado esconde justo esta familia de fallos. */
const OUTLINE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [30, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 120] },
  { type: 'L', values: [0, 120] },
  { type: 'Z', values: [] },
];

const EDGES = [
  { id: 'e-arriba', name: 'arriba', segmentRange: [1, 3] },
  { id: 'e-derecha', name: 'derecha', segmentRange: [3, 4] },
  { id: 'e-abajo', name: 'abajo', segmentRange: [4, 5] },
];

async function dosPiezas(page: Page) {
  for (const [id, x] of [['pA', 100], ['pB', 400]] as const) {
    await dispatch(page, { type: 'project/addPiece', payload: {
      id, name: id, outline: OUTLINE, edges: EDGES,
      internals: [], position: { x, y: 150 }, rotation: 0, mirrored: false,
      seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    } });
  }
  await page.waitForTimeout(400);

  await page.keyboard.press('n');
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool))
    .toBe('seam');

  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('sin svg');
  return box;
}

test.describe('#1061 — soltar lejos del borde marca el tramo', () => {
  test.setTimeout(120_000);

  test('soltar 200 px por debajo del borde cose el tramo, no el lado entero', async ({ page }) => {
    await waitForApp(page);
    const box = await dosPiezas(page);

    // Borde de arriba de pA: y=150, x de 100 a 200. Del 25% al 75%.
    await page.mouse.move(box.x + 125, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 250, { steps: 6 });
    await page.mouse.move(box.x + 175, box.y + 350, { steps: 6 }); // 200 px abajo
    await page.mouse.up();
    await page.waitForTimeout(300);

    // La otra mitad, con un clic pelado: el borde entero.
    await page.mouse.click(box.x + 450, box.y + 150);
    await page.waitForTimeout(400);

    const [seam] = await seams(page);
    expect(seam).toBeTruthy();
    // Hasta 2026-08-21 esto salía sin tStart/tEnd: la convención de "lado
    // completo", o sea justo lo que ella NO marcó.
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 1);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 1);
    // La mitad B sí es el borde entero, y eso no cambia.
    expect(seam.pieceB.tStart).toBeUndefined();
  });

  test('soltar FUERA del lienzo conserva el tramo (captura de puntero)', async ({ page }) => {
    await waitForApp(page);
    const box = await dosPiezas(page);

    await page.mouse.move(box.x + 125, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 200, { steps: 6 });
    // Arriba del svg y a la izquierda: fuera del lienzo del todo. Sin la
    // captura del press, este mouseup no llegaría y el gesto quedaría colgado.
    await page.mouse.move(box.x + 175, Math.max(0, box.y - 40), { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.mouse.click(box.x + 450, box.y + 150);
    await page.waitForTimeout(400);

    const [seam] = await seams(page);
    expect(seam).toBeTruthy();
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 1);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 1);
  });

  test('un clic pelado SIGUE cosiendo el borde entero', async ({ page }) => {
    await waitForApp(page);
    const box = await dosPiezas(page);

    await page.mouse.click(box.x + 150, box.y + 150);
    await page.waitForTimeout(300);
    await page.mouse.click(box.x + 450, box.y + 150);
    await page.waitForTimeout(400);

    const [seam] = await seams(page);
    expect(seam).toBeTruthy();
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceA.tEnd).toBeUndefined();
    expect(seam.pieceB.tStart).toBeUndefined();
  });
});
