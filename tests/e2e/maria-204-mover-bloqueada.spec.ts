import { test, expect, Page } from '@playwright/test';

/**
 * maria-204 — "yo permitiría que se pudiera mover una pieza bloqueada dentro
 * de la pantalla 2D porque puede molestar en algún momento. Que se pudiera
 * mover pero no modificar, eso sí."
 *
 * Bloqueada = intocable la GEOMETRÍA, no el sitio. Mover: permitido.
 * Modificar: bloqueado en TODAS las superficies — y de paso se cierran los
 * bypasses que existían: el tool transform redimensionaba piezas bloqueadas
 * y los editores de nodos (Q / doble clic) entraban sin chequear el lock.
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
      project: { pieces: Array<{ id: string; position: { x: number; y: number } }> };
    };
  };
}

const piecePosition = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].position);

async function addLockedPiece(page: Page) {
  await dispatch(page, { type: 'project/addPiece', payload: {
    id: 'm204', name: 'Bloqueada',
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
  await dispatch(page, { type: 'project/lockPiece', payload: 'm204' });
  await page.waitForTimeout(400);

  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no svg');
  // Centro de la pieza en pantalla (pattern ≈ screen + origen del svg, zoom 1)
  return { bx: box.x + 190, by: box.y + 250 };
}

test.describe('maria-204 — pieza bloqueada: mover sí, modificar no', () => {
  test.setTimeout(120_000);

  test('se puede arrastrar a otro sitio', async ({ page }) => {
    await waitForApp(page);
    const { bx, by } = await addLockedPiece(page);

    await page.keyboard.press('z');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().editor.activeTool))
      .toBe('select');

    await page.mouse.move(bx, by);
    await page.mouse.down();
    await page.mouse.move(bx + 130, by + 60, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const pos = await piecePosition(page);
    expect(pos.x).toBeGreaterThan(200); // partió de 120
    expect(pos.y).toBeGreaterThan(230); // partió de 200
  });

  test('el doble clic no abre el editor de nodos y avisa por qué', async ({ page }) => {
    await waitForApp(page);
    const { bx, by } = await addLockedPiece(page);

    await page.keyboard.press('z');
    await page.mouse.dblclick(bx, by);
    await page.waitForTimeout(400);

    await expect(page.locator('.node-editor')).toHaveCount(0);
    await expect(page.locator('.toast__message').filter({ hasText: 'bloqueada' })).toBeVisible();
  });
});
