/**
 * E2E smoke tests for input-scheme (Fase 2 input-scheme work).
 *
 * Covers:
 *  1. trackpad preset: plain wheel → pan (no zoom change)
 *  2. mouse preset (default): plain wheel → zoom
 *  3. explicit user choice survives reload (IDB persistence)
 *
 * Implementation notes:
 *  - Wheel events go through a native listener + rAF-coalesced flush
 *    (useEditorInteractions). After `page.mouse.wheel`, we must wait for the
 *    rAF to fire and then for Redux to commit. `expect.poll` handles both.
 *  - `page.mouse.wheel` fires without ctrlKey (plain scroll), which is what
 *    the heuristic and intent router use for scheme-based routing.
 *  - Fresh Playwright context per test = fresh IDB, so scheme-persistence
 *    tests cannot leak between tests.
 */
import { test, expect, type Page } from '@playwright/test';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditorState {
  zoom2D: number;
  pan2D: { x: number; y: number };
}

interface InputSchemeState {
  scheme: 'mouse' | 'trackpad';
  source: 'default' | 'auto' | 'user';
}

interface StoreLike {
  getState: () => {
    editor: EditorState;
    inputScheme: InputSchemeState;
  };
  dispatch: (action: { type: string; payload?: unknown }) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function dispatchAction(page: Page, type: string, payload?: unknown) {
  await page.evaluate(
    ({ t, p }) => {
      const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
      store?.dispatch({ type: t, payload: p });
    },
    { t: type, p: payload },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('input scheme', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('trackpad preset: plain wheel pans the 2D canvas (no zoom change)', async ({ page }) => {
    // Force trackpad scheme via Redux dispatch (source:'user' → heuristic disabled)
    await dispatchAction(page, 'inputScheme/setUserScheme', 'trackpad');

    const before = await page.evaluate(() => {
      const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
      if (!store) throw new Error('store missing');
      const s = store.getState();
      return { zoom: s.editor.zoom2D, pan: s.editor.pan2D };
    });

    const svg = page.locator('svg.pattern-svg');
    await svg.hover();
    // Plain downward scroll (deltaY=120, no ctrlKey) → 'pan' intent in trackpad scheme
    await page.mouse.wheel(0, 120);

    // Wait for rAF flush + Redux commit
    await expect.poll(
      async () => {
        const s = await page.evaluate(() => {
          const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
          return store?.getState().editor.pan2D.y;
        });
        return s;
      },
      { timeout: 5000 },
    ).not.toBe(before.pan.y);

    // Zoom must not change (plain wheel → pan, not zoom)
    const zoomAfter = await page.evaluate(() => {
      const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
      return store?.getState().editor.zoom2D;
    });
    expect(zoomAfter).toBeCloseTo(before.zoom, 5);
  });

  test('mouse preset (default): plain wheel zooms the 2D canvas', async ({ page }) => {
    // Default scheme is 'mouse' — no dispatch needed; verify via state for robustness
    const initialScheme = await page.evaluate(() => {
      const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
      return store?.getState().inputScheme.scheme;
    });
    expect(initialScheme).toBe('mouse');

    const before = await page.evaluate(() => {
      const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
      if (!store) throw new Error('store not ready: zoom2D missing');
      return store.getState().editor.zoom2D;
    });

    const svg = page.locator('svg.pattern-svg');
    await svg.hover();
    // Scroll up (deltaY = -120, no ctrlKey) → zoom in on mouse scheme
    await page.mouse.wheel(0, -120);

    // Zoom should increase (wheel up → zoom in)
    await expect.poll(
      async () => {
        return page.evaluate(() => {
          const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
          return store?.getState().editor.zoom2D;
        });
      },
      { timeout: 5000 },
    ).toBeGreaterThan(before);
  });

  test('explicit user choice survives reload (IDB persistence)', async ({ page }) => {
    await dispatchAction(page, 'inputScheme/setUserScheme', 'trackpad');

    // persist is a fire-and-forget IDB write — give it a beat to flush
    await page.waitForTimeout(500);

    await page.reload();
    await expect(page.locator('svg.pattern-svg')).toBeVisible();

    // Hydration from IDB is async; poll until the store reflects the persisted value
    await expect.poll(
      async () => {
        return page.evaluate(() => {
          const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
          return store?.getState().inputScheme;
        });
      },
      { timeout: 10000 },
    ).toEqual({ scheme: 'trackpad', source: 'user' });
  });
});

