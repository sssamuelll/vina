import { test, expect, Page } from '@playwright/test';

/**
 * Los chips de cota se comían dos de los diez mandos del transform box.
 *
 * Medido en el navegador el 2026-09-04 con una pieza de 140×100 mm
 * seleccionada: `document.elementFromPoint` sobre el centro del asa `e` y del
 * asa `rotate` devolvía `BUTTON.cota`, no el `rect`/`circle` de la caja. El
 * A/B de apagar los chips lo confirmó — el este pasó de 260→260 a 260→320, y
 * la rotación de 0°→0° a 0°→90°.
 *
 * Y el gesto robado no se perdía: se convertía en un scrub del chip. Tirar del
 * "asa este" 60 px a la derecha dejaba el ancho en 140 y subía el ALTO de 100
 * a 160 mm. María tiraba para ensanchar y la pieza le crecía hacia abajo,
 * escribiéndole una medida que no pidió.
 *
 * Es la prueba que la unitaria no puede dar: jsdom no calcula apilamiento, así
 * que `cotas-no-tapan-las-asas.test.ts` fija la geometría y esta fija que en un
 * navegador de verdad el clic llega a quien tiene que llegar.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md y la memoria
 * "superficies flotantes chocan sin dueño de emplazamiento".
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; selectedPieceIds: string[] };
      project: {
        pieces: Array<{
          rotation: number;
          outline: Array<{ type: string; values: number[] }>;
          position: { x: number; y: number };
        }>;
      };
    };
  };
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  return page.evaluate((act) => {
    const root = document.getElementById('root');
    if (!root) return;
    const key = Object.keys(root).find((k) => k.startsWith('__reactContainer'));
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

const bbox = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cmd of p.outline) {
      const v = cmd.values;
      for (let i = 0; i + 1 < v.length; i += 2) {
        const x = v[i] + p.position.x, y = v[i + 1] + p.position.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, maxX, minY, maxY, ancho: maxX - minX, alto: maxY - minY };
  });

const rotacion = (page: Page) =>
  page.evaluate(
    () => (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].rotation,
  );

async function piezaSeleccionada(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);

  await dispatch(page, {
    type: 'project/addPiece',
    payload: {
      id: 'cotas-asas', name: 'Delantero',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [140, 0] },
        { type: 'L', values: [140, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [], position: { x: 120, y: 200 }, rotation: 0, mirrored: false,
      seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    },
  });
  await page.waitForTimeout(400);

  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');

  await page.keyboard.press('z');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool))
    .toBe('select');
  await page.mouse.click(box.x + 190, box.y + 250);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.selectedPieceIds.length,
      ),
    )
    .toBe(1);
  await page.waitForTimeout(500);
  return box;
}

test.describe('los chips de cota no se comen los mandos del transform box', () => {
  test.setTimeout(120_000);

  test('ningún chip tapa ninguna de las asas', async ({ page }) => {
    const box = await piezaSeleccionada(page);

    const tapadas = await page.evaluate(({ bx, by }) => {
      const asas = [
        ...document.querySelectorAll('g.transform-handles rect, g.transform-handles circle'),
      ].filter((e) => {
        // El rect grande sin cursor es la caja punteada, no un mando.
        const c = (e as SVGElement).style.cursor || e.getAttribute('cursor');
        return !!c && c !== 'default';
      });

      const malas: string[] = [];
      for (const asa of asas) {
        const r = asa.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const encima = document.elementFromPoint(cx, cy);
        if (encima && encima !== asa && encima.closest('.cota')) {
          malas.push(
            `${(asa as SVGElement).style.cursor || 'asa'}@${Math.round(cx - bx)},${Math.round(cy - by)}`
              + ` la tapa "${(encima.textContent || '').trim()}"`,
          );
        }
      }
      return { malas, cuantas: asas.length };
    }, { bx: box.x, by: box.y });

    // Red contra el arreglo perezoso: si el transform box dejara de pintarse,
    // "ningún chip tapa nada" pasaría en vacío.
    expect(tapadas.cuantas, 'no se están pintando las asas: el test pasaría vacío').toBeGreaterThanOrEqual(9);
    expect(tapadas.malas, 'hay mandos del transform box debajo de un chip').toEqual([]);
  });

  test('tirar del asa este ensancha, y no cambia el alto (#198 por otra puerta)', async ({ page }) => {
    const box = await piezaSeleccionada(page);
    const antes = await bbox(page);
    expect(antes).toMatchObject({ minX: 120, maxX: 260, minY: 200, maxY: 300 });

    await page.mouse.move(box.x + 260, box.y + 250);
    await page.mouse.down();
    await page.mouse.move(box.x + 320, box.y + 250, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const despues = await bbox(page);
    expect(despues.maxX, 'el este no creció: el chip se comió el arrastre').toBeGreaterThan(310);
    expect(Math.abs(despues.minX - 120), 'el oeste se movió').toBeLessThan(1);
    expect(
      Math.abs(despues.alto - 100),
      `tirar a la derecha le cambió el ALTO a ${despues.alto}: el gesto se volvió un scrub del chip`,
    ).toBeLessThan(1);
  });

  test('el asa de rotación se puede agarrar', async ({ page }) => {
    const box = await piezaSeleccionada(page);
    expect(await rotacion(page)).toBe(0);

    const asa = await page.evaluate(({ bx, by }) => {
      const c = document.querySelector('g.transform-handles circle');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2 - bx, y: r.y + r.height / 2 - by };
    }, { bx: box.x, by: box.y });
    expect(asa, 'no se pintó el asa de rotación').not.toBeNull();

    await page.mouse.move(box.x + asa!.x, box.y + asa!.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 250, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect(await rotacion(page), 'la pieza no giró: el chip se comió el asa').not.toBe(0);
  });
});
