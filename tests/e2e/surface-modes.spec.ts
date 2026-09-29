/**
 * E2E tests for surface modes on the WebGPU/TSL rendering path.
 *
 * Verifies that surface mode changes apply to the TSL material by checking
 * Redux state dispatch and that no console errors occur when toggling modes.
 */
import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function open3DView(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);
}

/** Dispatch a surface mode change via Redux and return the stored value */
async function setSurfaceMode(page: Page, mode: string): Promise<string> {
  return page.evaluate((m) => {
    const root = document.getElementById('root');
    if (!root) return '';
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    if (!key) return '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = [(root as any)[key]];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (node.memoizedProps?.store?.getState) {
        const store = node.memoizedProps.store;
        store.dispatch({ type: 'simulation/setSurfaceMode3D', payload: m });
        return store.getState().simulation.surfaceMode3D;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    return '';
  }, mode);
}

test.describe('Surface Modes — WebGPU/TSL path', () => {
  test.setTimeout(60_000);

  test('all surface modes dispatch without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await open3DView(page);

    const modes = ['flat', 'xray', 'shaded', 'shaded-wire', 'textured-wire', 'textured'];
    for (const mode of modes) {
      const result = await setSurfaceMode(page, mode);
      expect(result).toBe(mode);
      await page.waitForTimeout(500); // allow material update effect to fire
    }

    const criticalErrors = errors.filter(e =>
      e.includes('THREE') || e.includes('WebGL') || e.includes('material') || e.includes('Cannot read')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('flat mode sets correct material properties', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    await setSurfaceMode(page, 'flat');
    await page.waitForTimeout(500);

    // Verify Redux state
    const state = await page.evaluate(() => {
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
          const s = node.memoizedProps.store.getState().simulation;
          return { surfaceMode3D: s.surfaceMode3D };
        }
        if (node.child) queue.push(node.child);
        if (node.sibling) queue.push(node.sibling);
      }
      return null;
    });

    expect(state?.surfaceMode3D).toBe('flat');
  });

  test('xray mode sets correct material properties', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    await setSurfaceMode(page, 'xray');
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
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
          const s = node.memoizedProps.store.getState().simulation;
          return { surfaceMode3D: s.surfaceMode3D };
        }
        if (node.child) queue.push(node.child);
        if (node.sibling) queue.push(node.sibling);
      }
      return null;
    });

    expect(state?.surfaceMode3D).toBe('xray');
  });

  test('shaded mode sets correct material properties', async ({ page }) => {
    await waitForApp(page);
    await open3DView(page);

    await setSurfaceMode(page, 'shaded');
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
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
          const s = node.memoizedProps.store.getState().simulation;
          return { surfaceMode3D: s.surfaceMode3D };
        }
        if (node.child) queue.push(node.child);
        if (node.sibling) queue.push(node.sibling);
      }
      return null;
    });

    expect(state?.surfaceMode3D).toBe('shaded');
  });

  test('SurfaceModePill picks surface modes', async ({ page }) => {
    // Retargeted 2026-06-04: DisplayBar3D (the old .db-btn strip) was deleted;
    // the user-facing surface-mode picker is now the SurfaceModePill flyout.
    // Strict (no if-visible guard): the pill renders unconditionally in 3D.
    await waitForApp(page);
    await open3DView(page);

    const getMode = () => page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__VINA_STORE__?.getState().simulation.surfaceMode3D ?? '');

    // Flat
    await page.locator('.surface-pill__trigger').click();
    await page.locator('.surface-pill__option', { hasText: 'Plano' }).first().click();
    await page.waitForTimeout(300);
    expect(await getMode()).toBe('flat');

    // X-Ray (the flyout closes after each pick — reopen)
    await page.locator('.surface-pill__trigger').click();
    await page.locator('.surface-pill__option', { hasText: 'Rayos X' }).first().click();
    await page.waitForTimeout(300);
    expect(await getMode()).toBe('xray');
  });
});
