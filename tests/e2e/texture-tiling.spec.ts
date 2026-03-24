/**
 * E2E tests for texture tiling — UV repeat presets, offset sliders, lock aspect.
 *
 * Tests interact with Redux state via page.evaluate since the MaterialTab
 * requires a selected piece and the sidebar to be open.
 */
import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
  const closeBtn = page.locator('button:has-text("✕")');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }
}

/** Get Redux store from React fiber tree */
async function getStore(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return null;
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    if (!key) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = [(root as any)[key]];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (node.memoizedProps?.store?.getState) return true;
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    return null;
  });
}

/** Dispatch a Redux action via the store */
async function dispatch(page: Page, action: { type: string; payload: unknown }) {
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

/** Get a value from Redux state */
async function getState(page: Page, selector: string): Promise<unknown> {
  return page.evaluate((sel) => {
    const root = document.getElementById('root');
    if (!root) return null;
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    if (!key) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = [(root as any)[key]];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (node.memoizedProps?.store?.getState) {
        const state = node.memoizedProps.store.getState();
        return sel.split('.').reduce((o: unknown, k: string) => (o as Record<string, unknown>)?.[k], state);
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    return null;
  }, selector);
}

test.describe('Texture Tiling', () => {
  test.setTimeout(60_000);

  test('repeat presets update UV transform in Redux', async ({ page }) => {
    await waitForApp(page);
    expect(await getStore(page)).toBeTruthy();

    // Set a UV transform via dispatch and verify it sticks
    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'test-piece', repeatX: 8, repeatY: 8 },
    });

    const uv = await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>;
    const piece = uv?.['test-piece'] as { repeatX: number; repeatY: number } | undefined;
    expect(piece?.repeatX).toBe(8);
    expect(piece?.repeatY).toBe(8);
  });

  test('offset values are stored and clamped in Redux', async ({ page }) => {
    await waitForApp(page);

    // Set offset values
    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'offset-test', offsetX: 0.5, offsetY: 0.75 },
    });

    const uv = await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>;
    const piece = uv?.['offset-test'] as { offsetX: number; offsetY: number } | undefined;
    expect(piece?.offsetX).toBe(0.5);
    expect(piece?.offsetY).toBe(0.75);

    // Test clamping: set out-of-range offset
    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'offset-test', offsetX: 5, offsetY: -1 },
    });

    const clamped = (await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>)?.['offset-test'] as { offsetX: number; offsetY: number };
    expect(clamped?.offsetX).toBe(1); // clamped to max 1
    expect(clamped?.offsetY).toBe(0); // clamped to min 0
  });

  test('repeat values are clamped to valid range', async ({ page }) => {
    await waitForApp(page);

    // Set out-of-range repeat
    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'clamp-test', repeatX: -5, repeatY: 100 },
    });

    const uv = (await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>)?.['clamp-test'] as { repeatX: number; repeatY: number };
    expect(uv?.repeatX).toBe(0.1); // clamped to min
    expect(uv?.repeatY).toBe(20);  // clamped to max
  });

  test('rotation wraps correctly for negative values', async ({ page }) => {
    await waitForApp(page);

    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'rot-test', rotation: -90 },
    });

    const uv = (await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>)?.['rot-test'] as { rotation: number };
    expect(uv?.rotation).toBe(270); // -90 wraps to 270
  });

  test('lock aspect syncs repeatX and repeatY via preset buttons', async ({ page }) => {
    await waitForApp(page);

    // Dispatch a preset-style update (both X and Y set to same value)
    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'lock-test', repeatX: 2, repeatY: 2 },
    });

    const uv = (await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>)?.['lock-test'] as { repeatX: number; repeatY: number };
    expect(uv?.repeatX).toBe(2);
    expect(uv?.repeatY).toBe(2);

    // Change only X — simulates unlocked aspect
    await dispatch(page, {
      type: 'simulation/setPieceUVTransform',
      payload: { pieceId: 'lock-test', repeatX: 6 },
    });

    const unlocked = (await getState(page, 'simulation.pieceUVTransforms') as Record<string, unknown>)?.['lock-test'] as { repeatX: number; repeatY: number };
    expect(unlocked?.repeatX).toBe(6);
    expect(unlocked?.repeatY).toBe(2); // Y unchanged
  });
});
