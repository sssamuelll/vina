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

  // El enlace tecla ↔ id de herramienta vive en src/shortcuts/defaults.ts (el
  // campo `shortcut` de src/tools/definitions/*.tsx no lo lee nadie).
  // seam pasó de 'b' a 'n' (#1028, paridad CLO3D); las dos herramientas que
  // absorbió (tramos parciales por clic-clic-Enter, coser sin snap de borde)
  // se retiraron del todo en la Tarea 7 (#1029) — ya no existen como tool.
  const toolShortcuts: [string, string][] = [
    ['z', 'select'],
    ['h', 'pen'],
    ['s', 'rectangle'],
    // La 'e' vive AQUÍ desde #1140: el círculo recuperó su gesto (#1111) y con
    // él el atajo, así que salió de ATAJOS_2D_SIN_GESTO. Estaba abajo, entre
    // las reservadas, y ese test llevaba rojo desde el 05-09.
    ['e', 'circle'],
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

  // Hallazgo F7 de la revisión adversarial del 2026-09-04: siete teclas del
  // lienzo metían a María en un modo inerte —la tira le dibujaba la cabina, el
  // cursor se ponía en cruz, y ningún clic hacía nada— porque el despachador
  // (src/components/PatternEditor/useEditorInteractions.ts) no conduce esos
  // ids. Quedaron reservadas en ATAJOS_2D_SIN_GESTO (src/shortcuts/defaults.ts)
  // y vuelven a la lista de arriba cuando la herramienta exista, como ya hizo
  // la 'e' del círculo en #1140.
  //
  // Antes esto vigilaba DOS teclas y una de ellas ('e') dejó de ser cierta sin
  // que nadie lo notara. Ahora van las SEIS de la lista, y en una sola corrida:
  // un test por tecla son seis arranques de app, y bajo carga los arranques son
  // lo primero que se cae.
  const teclasReservadas: [string, string][] = [
    ['d', 'dart'],
    ['c', 'editConstrain'],
    ['w', 'pin'],
    ['p', 'pomMeasure'],
    ['t', 'topstitchEdit'],
    ['i', 'trace'],
  ];

  test('las teclas de ATAJOS_2D_SIN_GESTO no meten a la usuaria en un modo inerte (F7)', async ({ page }) => {
    const colados: string[] = [];
    for (const [key, toolId] of teclasReservadas) {
      // Se ancla a una herramienta CONCRETA antes de pulsar. Comparar el
      // después con el antes a secas pasaba en vacío si `__VINA_STORE__` no
      // estaba: las dos lecturas daban null y el test se felicitaba solo.
      await page.keyboard.press('z');
      await expect.poll(() => getActiveTool2D(page), { timeout: 3000 }).toBe('select');

      await page.keyboard.press(key);
      await page.waitForTimeout(200);
      const tras = await getActiveTool2D(page);
      if (tras !== 'select') colados.push(`'${key}' → ${tras} (reservada para ${toolId})`);
    }
    expect(colados, `teclas sin gesto que sí cambian de herramienta: ${colados.join(', ')}`).toEqual([]);
  });
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
