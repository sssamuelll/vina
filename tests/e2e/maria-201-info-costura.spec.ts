import { test, expect, Page } from '@playwright/test';

/**
 * maria-201 — "al coser contornos se puso en la pantalla un texto de la
 * diferencia entre largos... si se queda escrita en la pantalla y no se va,
 * molesta. En Clo3D aparece solo cuando uno pasa el ratón por encima del
 * tramo cosido... necesito que desaparezca para poder manipular bien".
 *
 * El label de mismatch (y el de tensión) se renderizaban incondicionales,
 * fuera del grupo .seam-detail que ya tiene el comportamiento
 * hover/selección vía CSS. Contrato: la info de costura aparece al pasar el
 * ratón por el tramo cosido y desaparece al quitarlo.
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

const rect = (w: number): Array<{ type: string; values: number[] }> => ([
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
]);

/** Dos piezas con el borde superior de largos distintos (60mm de mismatch)
 *  y una costura con tensión 80% — las dos etiquetas presentes. */
async function sewMismatchedPieces(page: Page) {
  const base = { internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1 };
  await dispatch(page, { type: 'project/addPiece', payload: { ...base, id: 'm201-a', name: 'A', outline: rect(100), position: { x: 60, y: 160 } } });
  await dispatch(page, { type: 'project/addPiece', payload: { ...base, id: 'm201-b', name: 'B', outline: rect(160), position: { x: 260, y: 160 } } });
  // Cosido por el borde superior (`topEdge`, el nombre que le pone addPiece).
  // Antes decía `edge-0`, que es la `M` y no resuelve: el lienzo medía por
  // accidente el comando 1 (revisión de la entrega 1a de la superficie).
  await dispatch(page, { type: 'project/addSeam', payload: { id: 'm201-s', pieceA: { pieceId: 'm201-a', edgeName: 'topEdge' }, pieceB: { pieceId: 'm201-b', edgeName: 'topEdge' }, type: 'standard', tension: 80, strength: 1, active: true, taped: false, tapeWidth: 10 } });
  // La info de costura vive en el menú de costuras (maria-210): fuera de él ya
  // no se pinta nada. Este spec mide ESA info, así que entra a su superficie.
  await dispatch(page, { type: 'editor/setActiveTool', payload: 'seam' });
  await dispatch(page, { type: 'tools/setActiveTool2D', payload: 'seam' });
  await page.waitForTimeout(500);
}

const detailOpacity = (page: Page) =>
  page.locator('.seam-connection .seam-detail').evaluate(el => getComputedStyle(el).opacity);

test.describe('maria-201 — la info de costura aparece al pasar el ratón', () => {
  test.setTimeout(120_000);

  test('mismatch y tensión viven dentro de .seam-detail y ocultos por defecto', async ({ page }) => {
    await waitForApp(page);
    await sewMismatchedPieces(page);

    await expect(page.locator('.seam-connection')).toHaveCount(1);
    // Las dos etiquetas existen — pero DENTRO del grupo de detalle
    await expect(page.locator('.seam-connection .seam-detail text').filter({ hasText: '⚠' })).toHaveCount(1);
    await expect(page.locator('.seam-connection .seam-detail text').filter({ hasText: 'fruncido' })).toHaveCount(1);
    // Y el grupo arranca invisible
    expect(await detailOpacity(page)).toBe('0');
  });

  test('pasar el ratón por el tramo cosido la enseña; quitarlo la esconde', async ({ page }) => {
    await waitForApp(page);
    await sewMismatchedPieces(page);

    const edge = page.locator('.seam-connection path').first();
    const bb = await edge.boundingBox();
    if (!bb) throw new Error('no seam edge');

    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect.poll(() => detailOpacity(page)).toBe('1');

    await page.mouse.move(bb.x + bb.width / 2, bb.y + 200);
    await expect.poll(() => detailOpacity(page)).toBe('0');
  });
});
