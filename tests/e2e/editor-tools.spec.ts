import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function getSvgCenter(page: Page) {
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no svg');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, box };
}

// Read the active 2D tool id from Redux. Used in place of stale
// `.tool-btn[title*="..."]` selectors — buttons no longer expose `title`.
async function getActiveTool2D(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as { __VINA_STORE__?: { getState: () => { tools: { activeTool2D: string } } } }).__VINA_STORE__;
    return store ? store.getState().tools.activeTool2D : null;
  });
}

// Piece count straight from Redux — deterministic, replaces the dead `.status-bar`.
async function getPieceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (window as unknown as { __VINA_STORE__?: { getState: () => { project: { pieces: unknown[] } } } }).__VINA_STORE__;
    return store ? store.getState().project.pieces.length : -1;
  });
}

// Activate a 2D drawing tool by keyboard shortcut and wait for EmptyState2D to
// unmount. EmptyState2D overlays the canvas when 0 pieces AND activeTool ===
// 'select' and intercepts pointer events — so it MUST be gone before drawing.
async function activateTool(page: Page, shortcut: string, toolId: string) {
  await page.keyboard.press(shortcut);
  await expect.poll(() => getActiveTool2D(page), { timeout: 2000 }).toBe(toolId);
  // Wait for the empty-state overlay to disappear (only present at 0 pieces).
  await page.locator('[data-testid="empty-state-2d"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(100);
}

async function drawRect(page: Page) {
  await activateTool(page, 's', 'rectangle');
  const { cx, cy } = await getSvgCenter(page);
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { cx, cy };
}

async function drawPenShape(page: Page) {
  await activateTool(page, 'h', 'pen');
  const { cx, cy } = await getSvgCenter(page);
  // Draw a triangle
  await page.mouse.click(cx - 60, cy - 40);
  await page.mouse.click(cx + 60, cy - 40);
  await page.mouse.click(cx, cy + 40);
  // Close shape by clicking near the start
  await page.mouse.click(cx - 60, cy - 40);
  await page.waitForTimeout(500);
  return { cx, cy };
}

// ─── Rectangle Tool ────────────────────────────────────────────────────────

test.describe('Rectangle Tool', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('draws a piece via drag', async ({ page }) => {
    await drawRect(page);
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(1);
  });

  test('keyboard shortcut S activates rectangle tool', async ({ page }) => {
    await page.keyboard.press('s');
    expect(await getActiveTool2D(page)).toBe('rectangle');
  });

  test('drawing multiple rectangles increments piece count', async ({ page }) => {
    await drawRect(page);
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(1);

    // Draw second rectangle further offset to avoid overlap
    await page.keyboard.press('s');
    const { cx, cy } = await getSvgCenter(page);
    await page.mouse.move(cx + 150, cy + 80);
    await page.mouse.down();
    await page.mouse.move(cx + 280, cy + 180, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(2);
  });
});

// ─── Pen Tool ───────────────────────────────────────────────────────────────

test.describe('Pen Tool', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('keyboard shortcut H activates pen tool', async ({ page }) => {
    await page.keyboard.press('h');
    expect(await getActiveTool2D(page)).toBe('pen');
  });

  test('draws a closed shape', async ({ page }) => {
    await drawPenShape(page);
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(1);
  });
});

// ─── Select Tool ────────────────────────────────────────────────────────────

test.describe('Select Tool', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('keyboard shortcut Z activates select tool', async ({ page }) => {
    // First switch away from select
    await page.keyboard.press('s');
    await page.keyboard.press('z');
    expect(await getActiveTool2D(page)).toBe('select');
  });

  test('clicking a piece selects it', async ({ page }) => {
    const { cx, cy } = await drawRect(page);
    await page.keyboard.press('z');
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);
    // Selection lives in Redux (editor.selectedPieceIds). The piece survives.
    const selectedCount = await page.evaluate(() => {
      const store = (window as unknown as { __VINA_STORE__?: { getState: () => { editor: { selectedPieceIds?: unknown[]; selectedIds?: unknown[] } } } }).__VINA_STORE__;
      if (!store) return -1;
      const ed = store.getState().editor;
      const ids = ed.selectedPieceIds ?? ed.selectedIds ?? [];
      return ids.length;
    });
    expect(selectedCount).toBeGreaterThanOrEqual(1);
    expect(await getPieceCount(page)).toBe(1);
  });
});

// ─── All Tool Shortcuts ─────────────────────────────────────────────────────

test.describe('Tool keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  // shortcuts ↔ tool ids defined in src/tools/definitions/*.tsx
  // seam pasó de 'b' a 'n' (#1028, paridad CLO3D); segmentSewing y freesewing
  // se quedaron sin atajo a propósito en la misma tarea — sus filas de tecla
  // se borraron, no se adaptaron (no hay tecla que las active hoy).
  const toolShortcuts: [string, string][] = [
    ['z', 'select'],
    ['h', 'pen'],
    ['s', 'rectangle'],
    ['e', 'circle'],
    ['d', 'dart'],
    ['n', 'seam'],
    ['m', 'measure'],
    ['x', 'scissors'],
  ];

  for (const [key, toolId] of toolShortcuts) {
    test(`pressing '${key}' activates ${toolId} tool`, async ({ page }) => {
      await page.keyboard.press(key);
      expect(await getActiveTool2D(page)).toBe(toolId);
    });
  }
});

// ─── Undo / Redo ────────────────────────────────────────────────────────────

test.describe('Undo / Redo', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('undo removes drawn piece', async ({ page }) => {
    await drawRect(page);
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(1);

    await page.keyboard.press('Control+z');
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(0);
  });

  test('redo restores undone piece', async ({ page }) => {
    await drawRect(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(1);
  });

  test('undo button in toolbar works', async ({ page }) => {
    await drawRect(page);
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(1);
    // TopBar (`src/components/shell/TopBar.tsx`) exposes `aria-label="Deshacer"`.
    await page.click('button[aria-label="Deshacer"]');
    await expect.poll(() => getPieceCount(page), { timeout: 3000 }).toBe(0);
  });
});
