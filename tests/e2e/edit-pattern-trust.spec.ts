import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

async function activeTool2D(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __VINA_STORE__?: { getState: () => { tools: { activeTool2D: string } } };
    }).__VINA_STORE__;
    return store?.getState().tools.activeTool2D ?? null;
  });
}

async function commandValues(page: Page, pieceId: string, commandIndex: number): Promise<number[]> {
  return page.evaluate(({ id, index }) => {
    const store = (window as unknown as {
      __VINA_STORE__: { getState: () => {
        project: { pieces: Array<{ id: string; outline: Array<{ values: number[] }> }> };
      } };
    }).__VINA_STORE__;
    const piece = store.getState().project.pieces.find((item) => item.id === id)!;
    return [...piece.outline[index].values];
  }, { id: pieceId, index: commandIndex });
}

test('María DXF: editPattern visible → slow drag → undo/redo keeps marker on geometry', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('vina-docks'));
  await page.goto('/');
  const svg = page.locator('svg.pattern-svg');
  await expect(svg).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Editar patrón · Q' })).toBeVisible();

  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
  await expect.poll(async () => page.locator('[data-piece-id]').count(), {
    timeout: 30_000,
  }).toBe(5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('q');
  await expect.poll(() => activeTool2D(page)).toBe('editPattern');

  const firstPiece = page.locator('[data-piece-id]').first();
  const pieceId = (await firstPiece.getAttribute('data-piece-id'))!;
  const fill = firstPiece.locator('.piece-fill');
  const fillBox = await fill.boundingBox();
  if (!fillBox) throw new Error('DXF piece fill has no bounding box');
  await fill.dispatchEvent('mousedown', {
    button: 0,
    clientX: fillBox.x + fillBox.width / 2,
    clientY: fillBox.y + fillBox.height / 2,
  });
  await svg.dispatchEvent('mouseup', { button: 0 });

  await expect.poll(async () => page.locator('[data-anchor-role]').count())
    .toBeGreaterThan(0);
  const glyph = page.locator('[data-anchor-role="corner"]').first();
  await expect(glyph).toBeVisible();
  const commandIndex = Number(
    await glyph.evaluate((node) => node.parentElement?.getAttribute('data-command-index')),
  );
  expect(Number.isInteger(commandIndex)).toBe(true);
  const originalValues = await commandValues(page, pieceId, commandIndex);
  const originalGlyphBox = await glyph.boundingBox();
  if (!originalGlyphBox) throw new Error('Corner glyph has no bounding box');
  const startX = originalGlyphBox.x + originalGlyphBox.width / 2;
  const startY = originalGlyphBox.y + originalGlyphBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 5, startY + 2, { steps: 2 });
  await page.waitForTimeout(650);
  await page.mouse.move(startX + 14, startY + 5, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => commandValues(page, pieceId, commandIndex))
    .not.toEqual(originalValues);
  const movedValues = await commandValues(page, pieceId, commandIndex);

  await page.keyboard.press('Control+z');
  await expect.poll(() => commandValues(page, pieceId, commandIndex))
    .toEqual(originalValues);

  // The store restores first; the anchor-role pass settles ~4 frames later, so
  // the marker must be polled rather than sampled once. Address it by command
  // index too: the corner set changes while the undo lands, so `.first()` can
  // resolve to a different node and silently compare the wrong glyph.
  const draggedGlyph = page.locator(`[data-command-index="${commandIndex}"] [data-anchor-role]`);
  await expect.poll(async () => {
    const box = await draggedGlyph.boundingBox();
    if (!box) return null;
    return Math.max(
      Math.abs(box.x + box.width / 2 - startX),
      Math.abs(box.y + box.height / 2 - startY),
    );
  }).toBeLessThan(0.05);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => commandValues(page, pieceId, commandIndex)).toEqual(movedValues);
});
