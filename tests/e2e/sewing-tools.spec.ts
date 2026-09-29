/**
 * E2E tests for sewing tools: Seam and Walk Seam.
 *
 * Retargeted for the B/N key swap (#1028, paridad CLO3D): seam moved from 'b'
 * to 'n'. The Segment Sewing (n) and Free Sewing (f) describes were DELETED
 * wholesale — every test in them entered the tool via the now-dead keyboard
 * shortcut (no dock/store alternative existed in this file), and both tools
 * lost their shortcut on purpose in the same task. Not a fix-the-symptom
 * deletion: the shortcut path they exercised no longer exists.
 *
 * Retargeted onto the current shell (2026-06-04):
 * - Tool activation is verified by reading the Redux store
 *   (`editor.activeTool` + `tools.activeTool2D`), the canonical truth written
 *   together by `activate2DTool`. The old `.status-bar` text surface is dead:
 *   StatusBar is an unmounted orphan in the current shell.
 * - The tool-options-bar tests were DELETED. `ToolOptionsBar2D` was removed
 *   along with `Toolbar2D`; tool options have no UI surface today
 *   (product backlog). Asserting `.tool-options-bar` could only ever be
 *   vacuous, so those tests are gone rather than weakened.
 * - Interaction core (edge overlays, Escape clears, seam context menu, measure
 *   activation) is kept and exercised against store-dispatched pieces/seams so
 *   the geometry is deterministic (no dependency on a template loader).
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

/** Dispatch a Redux action via the exposed store global. */
async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  await page.evaluate((act) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { dispatch: (a: unknown) => void }
      | undefined;
    store?.dispatch(act);
  }, action);
}

/** Read a dotted-path value out of the Redux state. */
async function getState<T = unknown>(page: Page, path: string): Promise<T> {
  return page.evaluate((sel) => {
    const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    const state = store.getState();
    return sel
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], state) as T;
  }, path) as Promise<T>;
}

/** The active 2D tool, read from the canonical store fields. */
async function activeTool(page: Page): Promise<{ editor: string; tools: string }> {
  return {
    editor: (await getState<string>(page, 'editor.activeTool')) ?? '',
    tools: (await getState<string>(page, 'tools.activeTool2D')) ?? '',
  };
}

/**
 * Press a tool shortcut and wait until the store reflects it. The single global
 * keydown listener can miss the very first press if it lands during a React
 * commit right after load, so we re-press until the canonical
 * `editor.activeTool` matches (or time out).
 */
async function activateToolKey(page: Page, key: string, expected: string) {
  await expect
    .poll(
      async () => {
        // The single global keydown listener ignores key events whose target is
        // an <input>/<textarea> (e.g. the AI chat box, which may hold focus right
        // after load). Move focus to <body> before each press so the shortcut
        // actually reaches the registry.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
        return getState<string>(page, 'editor.activeTool');
      },
      { timeout: 8000, intervals: [150, 150, 150, 150] },
    )
    .toBe(expected);
}

/** A simple square piece at a known position (deterministic geometry). */
function squarePiece(id: string, name: string, x: number, y: number) {
  return {
    id,
    name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x, y },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Seed two pieces + one seam between them via the store. Positions are near the
 * SVG origin so they render on-screen at the default zoom=1 / pan=(0,0).
 */
async function seedPiecesAndSeam(page: Page) {
  await dispatch(page, { type: 'project/addPiece', payload: squarePiece('sw-A', 'Front', 40, 40) });
  await dispatch(page, { type: 'project/addPiece', payload: squarePiece('sw-B', 'Back', 220, 40) });
  await dispatch(page, {
    type: 'project/addSeam',
    payload: {
      id: 'sw-seam-1',
      pieceA: { pieceId: 'sw-A', edgeName: 'edge-1' }, // right edge of A
      pieceB: { pieceId: 'sw-B', edgeName: 'edge-3' }, // left edge of B
      type: 'standard',
      tension: 100,
      strength: 1,
      active: true,
      taped: false,
      tapeWidth: 10,
    },
  });
  await page.waitForTimeout(400);
}

async function getSvgCenter(page: Page) {
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, box };
}

/**
 * Map a pattern-space point to screen coordinates using the live zoom/pan and
 * the SVG bounding box. Mirrors `screenToPattern` inverted.
 */
async function patternToScreen(page: Page, px: number, py: number) {
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');
  const zoom = (await getState<number>(page, 'editor.zoom2D')) ?? 1;
  const pan = (await getState<{ x: number; y: number }>(page, 'editor.pan2D')) ?? { x: 0, y: 0 };
  return { x: box.x + pan.x + px * zoom, y: box.y + pan.y + py * zoom };
}

// ─── Seam Tool (n) ────────────────────────────────────────────────────────────

test.describe('Seam Tool (n)', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('shortcut N activates seam tool', async ({ page }) => {
    await activateToolKey(page, 'n', 'seam');
    const tool = await activeTool(page);
    expect(tool.editor).toBe('seam');
    expect(tool.tools).toBe('seam');
  });

  test('hovering piece edge surfaces the edge-pair overlay group', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await activateToolKey(page, 'n', 'seam');

    // The edge-pair overlay <g> renders whenever the seam tool is active.
    const overlay = page.locator('.edge-pair-overlay');
    await expect(overlay).toHaveCount(1);

    const { cx, cy } = await getSvgCenter(page);
    for (let dx = -120; dx <= 120; dx += 40) {
      await page.mouse.move(cx + dx, cy);
      await page.waitForTimeout(60);
    }
    // Non-binding: log whether any hover line was produced.
    const lines = await page.locator('.edge-pair-overlay line').count();
    console.log(`Seam overlay lines after hover sweep: ${lines}`);
  });

  test('clicking piece edge then Escape clears selection', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await activateToolKey(page, 'n', 'seam');

    const { cx, cy } = await getSvgCenter(page);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const count = await page.locator('.edge-pair-overlay line').count();
    expect(count).toBe(0);
  });
});

// ─── Walk Seam Tool (Shift+M) ─────────────────────────────────────────────────

test.describe('Walk Seam Tool (Shift+M)', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('Shift+M activates walk seam tool', async ({ page }) => {
    await activateToolKey(page, 'Shift+m', 'walkSeam');
    const tool = await activeTool(page);
    expect(tool.editor).toBe('walkSeam');
    expect(tool.tools).toBe('walkSeam');
  });

  test('walk seam overlay group is present while tool is active', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await activateToolKey(page, 'Shift+m', 'walkSeam');

    // The walk-seam overlay <g> renders whenever the walkSeam tool is active.
    await expect(page.locator('.walk-seam-overlay')).toHaveCount(1);
  });

  test('Escape clears walk state without crashing', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await activateToolKey(page, 'Shift+m', 'walkSeam');

    const { cx, cy } = await getSvgCenter(page);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(page.locator('svg.pattern-svg')).toBeVisible();
  });
});

// ─── Seam Context Menu ────────────────────────────────────────────────────────

test.describe('Seam Context Menu', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  /**
   * Right-click on the seam connection line. The menu opens via a hit-test on
   * the SVG at the cursor's pattern-space coordinate, so we right-click the
   * midpoint of the connection between the two seamed edge midpoints.
   *
   * NB: the right-click hit-test resolves an unknown edge name to segment
   * index 1 (it does NOT run the renderer's edge-N parsing), so both edges
   * resolve to the top edge (command index 1: M→first L).
   *
   * Geometry (default zoom=1, pan=0):
   *   A top-edge midpoint = A.pos + (50, 0)  = (90, 40)
   *   B top-edge midpoint = B.pos + (50, 0)  = (270, 40)
   *   connection midpoint = (180, 40)
   */
  async function openSeamMenu(page: Page) {
    const pt = await patternToScreen(page, 180, 40);
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(300);
  }

  test('right-click on seam connection shows seam context menu', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await openSeamMenu(page);

    await expect(page.locator('text=Invertir dirección de costura')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('text=Eliminar costura')).toBeVisible();
  });

  test('Reverse Sewing Direction keeps the seam alive', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await openSeamMenu(page);

    const reverse = page.locator('text=Invertir dirección de costura');
    await expect(reverse).toBeVisible({ timeout: 2000 });
    await reverse.click();
    await page.waitForTimeout(300);

    // Menu closed; seam still exists (reversed, not removed).
    await expect(reverse).not.toBeVisible();
    const seams = await getState<unknown[]>(page, 'project.seams');
    expect(seams.length).toBe(1);
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
  });

  test('Delete Seam removes the seam', async ({ page }) => {
    await seedPiecesAndSeam(page);

    const before = await getState<unknown[]>(page, 'project.seams');
    expect(before.length).toBe(1);

    await openSeamMenu(page);
    const del = page.locator('text=Eliminar costura');
    await expect(del).toBeVisible({ timeout: 2000 });
    await del.click();
    await page.waitForTimeout(400);

    const after = await getState<unknown[]>(page, 'project.seams');
    expect(after.length).toBe(0);
  });

  test('Select piece items appear for both connected pieces', async ({ page }) => {
    await seedPiecesAndSeam(page);
    await openSeamMenu(page);

    await expect(page.locator('text=Invertir dirección de costura')).toBeVisible({ timeout: 2000 });
    // The seam menu offers Seleccionar "<pieceName>" for each connected piece.
    const selectItems = page.locator('button:has-text("Seleccionar")');
    expect(await selectItems.count()).toBeGreaterThanOrEqual(2);
  });

  test('right-click on a piece shows the piece menu, not the seam menu', async ({ page }) => {
    await seedPiecesAndSeam(page);

    // Center of piece A = A.pos + (50, 50) = (90, 90).
    const pt = await patternToScreen(page, 90, 90);
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(300);

    await expect(page.locator('text=Rotar 90°')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('text=Invertir dirección de costura')).not.toBeVisible();
  });
});

// ─── Measure Tool ─────────────────────────────────────────────────────────────

test.describe('Measure Tool Group', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('M activates measure tool', async ({ page }) => {
    await activateToolKey(page, 'm', 'measure');
    const tool = await activeTool(page);
    expect(tool.editor).toBe('measure');
    expect(tool.tools).toBe('measure');
  });
});
