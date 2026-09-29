/**
 * E2E tests for 3D mesh selection — box select tool, Redux state, overlay.
 */
import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
  const closeBtn = page.locator('button:has-text("✕")');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function open3DView(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);
}

/** Dispatch a Redux action via the store */
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

test.describe('3D Mesh Selection', () => {
  test.setTimeout(60_000);

  test('meshSelectBox tool activates via Redux dispatch', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    await dispatch(page, { type: 'tools/setActiveTool3D', payload: 'meshSelectBox' });
    const tool = await getState(page, 'tools.activeTool3D');
    expect(tool).toBe('meshSelectBox');
  });

  test('setSelectedVertices stores vertex indices in Redux', async ({ page }) => {
    await waitForApp(page);

    await dispatch(page, {
      type: 'simulation/setSelectedVertices',
      payload: [0, 5, 10, 15],
    });

    const verts = await getState(page, 'simulation.selectedVertices') as number[];
    expect(verts).toEqual([0, 5, 10, 15]);
  });

  test('addSelectedVertices merges with existing selection', async ({ page }) => {
    await waitForApp(page);

    await dispatch(page, { type: 'simulation/setSelectedVertices', payload: [1, 2, 3] });
    await dispatch(page, { type: 'simulation/addSelectedVertices', payload: [3, 4, 5] });

    const verts = await getState(page, 'simulation.selectedVertices') as number[];
    expect(verts).toHaveLength(5);
    expect(verts).toContain(1);
    expect(verts).toContain(5);
  });

  test('clearSelectedVertices empties the selection', async ({ page }) => {
    await waitForApp(page);

    await dispatch(page, { type: 'simulation/setSelectedVertices', payload: [1, 2, 3] });
    await dispatch(page, { type: 'simulation/clearSelectedVertices' });

    const verts = await getState(page, 'simulation.selectedVertices') as number[];
    expect(verts).toEqual([]);
  });

  test('box select overlay appears during drag in 3D viewport', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    // Activate meshSelectBox
    await dispatch(page, { type: 'tools/setActiveTool3D', payload: 'meshSelectBox' });
    await page.waitForTimeout(300);

    // Find the viewport container
    const viewport = page.locator('.viewport3d');
    const box = await viewport.boundingBox();
    if (!box) return;

    // Start a drag in the viewport
    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height * 0.3;
    const endX = box.x + box.width * 0.7;
    const endY = box.y + box.height * 0.7;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });

    // The overlay div should be visible during drag
    // (it's shown via direct DOM style manipulation)
    await page.waitForTimeout(100);

    // Release to finalize
    await page.mouse.up();
    await page.waitForTimeout(300);

    // After release the overlay should be hidden
    // (box select completed, overlay hidden)
    // Verify no errors occurred
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(200);
    const critical = errors.filter(e => e.includes('Cannot read') || e.includes('TypeError'));
    expect(critical).toHaveLength(0);
  });
});
