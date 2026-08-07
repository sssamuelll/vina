import { test, expect, Page } from '@playwright/test';

/**
 * maria-198 — "al redimensionar arrastrando, la pieza crece simétrica por los
 * dos lados... si arrastro un punto o un lado necesito que se mueva solo lo
 * arrastrado. Además la pieza se mueve de sitio teniendo que ajustar el zoom
 * e ir a buscarla".
 *
 * El scale usaba siempre el centro del bbox como pivote: arrastrar el handle
 * este movía TAMBIÉN el lado oeste, y la pieza se desplazaba. Ahora el ancla
 * es el lado/esquina opuesto al handle: lo que no arrastras, no se mueve.
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
      project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }>; position: { x: number; y: number } }> };
    };
  };
}

/** BBox de la pieza 0 en coordenadas de patrón (outline + position). */
const pieceBBox = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cmd of p.outline) {
      const v = cmd.values;
      for (let i = 0; i + 1 < v.length; i += 2) {
        const x = v[i] + p.position.x, y = v[i + 1] + p.position.y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { minX, maxX, minY, maxY };
  });

async function addAndSelectPiece(page: Page) {
  await dispatch(page, { type: 'project/addPiece', payload: {
    id: 'm198', name: 'Delantero',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [140, 0] },
      { type: 'L', values: [140, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 120, y: 200 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  } });
  await page.waitForTimeout(400);

  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no svg');

  await page.keyboard.press('z');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool), { timeout: 2000 })
    .toBe('select');
  await page.mouse.click(box.x + 190, box.y + 250);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.selectedPieceIds.length), { timeout: 2000 })
    .toBe(1);
  await page.waitForTimeout(300);
  return box;
}

test.describe('maria-198 — resize con ancla en el lado opuesto', () => {
  test.setTimeout(120_000);

  test('arrastrar el handle este agranda solo hacia el este', async ({ page }) => {
    await waitForApp(page);
    const box = await addAndSelectPiece(page);

    const before = await pieceBBox(page);
    expect(before).toEqual({ minX: 120, maxX: 260, minY: 200, maxY: 300 });

    // Handle 'e' en pattern (260, 250) → pantalla
    await page.mouse.move(box.x + 260, box.y + 250);
    await page.mouse.down();
    await page.mouse.move(box.x + 320, box.y + 250, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await pieceBBox(page);
    // El oeste no se movió; el este creció lo arrastrado
    expect(Math.abs(after.minX - 120)).toBeLessThan(1);
    expect(after.maxX).toBeGreaterThan(310);
    // Los lados verticales tampoco
    expect(Math.abs(after.minY - 200)).toBeLessThan(1);
    expect(Math.abs(after.maxY - 300)).toBeLessThan(1);
  });

  test('arrastrar la esquina se deja la esquina nw plantada', async ({ page }) => {
    await waitForApp(page);
    const box = await addAndSelectPiece(page);

    // Esquina 'se' en pattern (260, 300)
    await page.mouse.move(box.x + 260, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 330, box.y + 350, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await pieceBBox(page);
    expect(Math.abs(after.minX - 120)).toBeLessThan(1);
    expect(Math.abs(after.minY - 200)).toBeLessThan(1);
    expect(after.maxX).toBeGreaterThan(300);
  });
});
