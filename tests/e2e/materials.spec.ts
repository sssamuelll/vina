import { test, expect, Page } from '@playwright/test';

/**
 * PBR Materials — E2E Tests (slimmed 2026-06-04)
 *
 * SCOPE NOTE — Material panel re-surfacing is product backlog.
 * The PropertiesPanel is not mounted in the current shell (no sidebar), so the
 * MATERIAL section, fabric-preset grid, color-tint picker, UV-transform, and
 * texture-override slots have NO reachable UI. The seven tests that asserted on
 * those surfaces were DELETED rather than weakened into vacuity. When the
 * Material panel is re-surfaced (M2+), restore them from git history.
 *
 * What remains is the part that is real today:
 *  - HDRI environment loads in the 3D view (canvas renders without crashing).
 *  - Fabric/material state survives a simulation restart (driven via the store).
 *  - The 3D canvas keeps rendering after a fabric change (store dispatch).
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
  // Dismiss the auto-opened template library modal.
  const closeBtn = page.locator('button:has-text("✕")');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  await page.evaluate((act) => {
    const store = (window as unknown as Record<string, unknown>).__OPENCLO_STORE__ as
      | { dispatch: (a: unknown) => void }
      | undefined;
    store?.dispatch(act);
  }, action);
}

async function getState<T = unknown>(page: Page, path: string): Promise<T> {
  return page.evaluate((sel) => {
    const store = (window as unknown as Record<string, unknown>).__OPENCLO_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    const state = store.getState();
    return sel
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], state) as T;
  }, path) as Promise<T>;
}

/** Seed a rectangle piece via the store (the canvas draw + select flow relied
 *  on the dead StatusBar piece counter). */
async function addPiece(page: Page) {
  await dispatch(page, {
    type: 'project/addPiece',
    payload: {
      id: 'mat-piece-1',
      name: 'Panel',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 300] },
        { type: 'L', values: [0, 300] },
        { type: 'L', values: [0, 0] },
      ],
      internals: [],
      position: { x: 60, y: 40 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      layer: 1,
      sublayer: 0,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  await page.waitForTimeout(300);
  const pieces = await getState<unknown[]>(page, 'project.pieces');
  expect(pieces.length).toBeGreaterThanOrEqual(1);
}

async function setupWithPiece(page: Page) {
  await waitForApp(page);
  await addPiece(page);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('PBR Materials', () => {
  test.setTimeout(120_000);

  // ── HDRI environment loads in 3D view ──────────────────────────────────

  test('HDRI environment loads in 3D view', async ({ page }) => {
    await setupWithPiece(page);

    // Switch to 3D view
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    // The 3D canvas should be visible — if it rendered without crashing,
    // the HDRI environment loaded (or at least did not block rendering).
    await expect(page.locator('canvas')).toBeVisible();

    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null && canvas.width > 0 && canvas.height > 0;
    });
    expect(hasCanvas).toBe(true);
  });

  // ── Material/fabric state survives simulation restart ──────────────────

  test('fabric assignment survives simulation restart', async ({ page }) => {
    await setupWithPiece(page);

    // Assign a fabric via the store (the MaterialTab UI is unreachable today).
    await dispatch(page, {
      type: 'project/setPieceFabric',
      payload: { pieceId: 'mat-piece-1', fabricId: 'denim-12oz' },
    });
    await page.waitForTimeout(200);

    // Sanity: the assignment landed on the source-of-truth field.
    const before = await getState<{ fabricId?: string }[]>(page, 'project.pieces');
    expect(before[0]?.fabricId).toBe('denim-12oz');

    // Switch to 3D and drive a simulation start → reset → restart via the store.
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(1500);
    await dispatch(page, { type: 'simulation/setViewMode3D', payload: 'simulate' });
    await dispatch(page, { type: 'simulation/startSimulation' });
    await page.waitForTimeout(1500);
    await dispatch(page, { type: 'simulation/resetSimulation' });
    await page.waitForTimeout(500);

    // The persistent fabric assignment must survive the lifecycle churn.
    const after = await getState<{ fabricId?: string }[]>(page, 'project.pieces');
    expect(after[0]?.fabricId).toBe('denim-12oz');

    // App still alive.
    await expect(page.locator('canvas')).toBeVisible();
  });

  // ── 3D canvas renders after a fabric change ────────────────────────────

  test('3D canvas renders after fabric change', async ({ page }) => {
    await setupWithPiece(page);

    // Change the fabric via the store, then enter the 3D view.
    await dispatch(page, {
      type: 'project/setPieceFabric',
      payload: { pieceId: 'mat-piece-1', fabricId: 'silk-charmeuse' },
    });
    await page.waitForTimeout(200);

    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null && canvas.width > 0 && canvas.height > 0;
    });
    expect(hasCanvas).toBe(true);

    // The assignment is still intact after switching views.
    const pieces = await getState<{ fabricId?: string }[]>(page, 'project.pieces');
    expect(pieces[0]?.fabricId).toBe('silk-charmeuse');
  });
});
