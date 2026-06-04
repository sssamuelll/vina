/**
 * E2E tests for Click'n'Go — expert mode + tool memory (Redux-level).
 *
 * SCOPE NOTE (current shell): the confirmation-dialog UI (`.copilot-confirm-*`)
 * and the EXPERT status-bar badge do NOT exist as user-reachable surfaces.
 * The confirmation middleware exists (it gates destructive actions and can
 * dispatch `showConfirmation`), but there is no rendered dialog component, and
 * the StatusBar that once hosted the EXPERT badge is no longer mounted. Those
 * UI surfaces are product backlog. The tests below verify the parts that are
 * real today: expert-mode + tool-memory Redux state, the setToolOption→
 * toolMemory mirror middleware, and persistence to localStorage across reload.
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

interface StoreLike {
  getState: () => {
    workflow: { expertMode: boolean; toolMemory: Record<string, Record<string, unknown>> };
  };
  dispatch: (action: { type: string; payload?: unknown }) => void;
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  await page.evaluate((a) => {
    const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
    store?.dispatch(a);
  }, action);
}

async function getExpertMode(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
    return store ? store.getState().workflow.expertMode : null;
  });
}

async function getToolMemory(page: Page): Promise<Record<string, Record<string, unknown>>> {
  return page.evaluate(() => {
    const store = (window as unknown as { __OPENCLO_STORE__?: StoreLike }).__OPENCLO_STORE__;
    return store ? store.getState().workflow.toolMemory : {};
  });
}

// ─── Expert Mode (state) ──────────────────────────────────────────────────────

test.describe('Expert Mode', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('expert mode flag toggles in workflow state', async ({ page }) => {
    expect(await getExpertMode(page)).toBe(false);

    await dispatch(page, { type: 'workflow/setExpertMode', payload: true });
    await page.waitForTimeout(200);
    expect(await getExpertMode(page)).toBe(true);

    await dispatch(page, { type: 'workflow/setExpertMode', payload: false });
    await page.waitForTimeout(200);
    expect(await getExpertMode(page)).toBe(false);
  });
});

// ─── Tool Memory ────────────────────────────────────────────────────────────

test.describe('Tool Memory', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('tool options are mirrored to toolMemory via middleware', async ({ page }) => {
    await dispatch(page, {
      type: 'tools/setToolOption',
      payload: { toolId: 'notch', optionId: 'notchType', value: 'V' },
    });
    await page.waitForTimeout(300);

    const memory = await getToolMemory(page);
    expect(memory.notch).toBeDefined();
    expect(memory.notch.notchType).toBe('V');
  });

  test('workflow state persists to localStorage', async ({ page }) => {
    await dispatch(page, { type: 'workflow/setExpertMode', payload: true });
    await dispatch(page, {
      type: 'workflow/updateToolMemory',
      payload: { tool: 'scissors', values: { splitMode: 'curve' } },
    });

    // Wait for debounced persistence (500ms + buffer)
    await page.waitForTimeout(1000);

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('openclo-workflow');
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.version).toBe(1);
    expect(stored.data.expertMode).toBe(true);
    expect(stored.data.toolMemory.scissors).toBeDefined();
    expect(stored.data.toolMemory.scissors.splitMode).toBe('curve');
  });

  test('expert mode persists across page reload', async ({ page }) => {
    await dispatch(page, { type: 'workflow/setExpertMode', payload: true });

    // Wait for persistence
    await page.waitForTimeout(1000);

    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('openclo-workflow');
      return raw ? JSON.parse(raw) : null;
    });
    expect(before?.data?.expertMode).toBe(true);

    await page.reload();
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // State should rehydrate expert mode from localStorage.
    expect(await getExpertMode(page)).toBe(true);
  });
});
