/**
 * E2E tests for Click'n'Go — expert mode, tool memory, confirmation middleware
 *
 * Tests verify:
 * 1. Expert mode toggle and status bar badge
 * 2. Tool memory persistence across tool switches and page reload
 * 3. Confirmation dialog for destructive actions in normal mode
 * 4. Expert mode bypasses confirmation dialogs
 * 5. Override "always" forces confirmation in expert mode
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
  // Dismiss template dialog if visible
  const closeBtn = page.locator('button:has-text("✕")');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }
}

/** Obtain Redux store and expose as window.__testStore */
async function ensureStore(page: Page) {
  const found = await page.evaluate(() => {
    if ((window as any).__testStore) return true;
    const root = document.getElementById('root');
    if (!root) return false;
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    if (!key) return false;
    const queue = [(root as any)[key]];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (node.memoizedProps?.store?.getState) {
        (window as any).__testStore = node.memoizedProps.store;
        return true;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    return false;
  });
  expect(found).toBe(true);
}

/** Load T-Shirt template to get pieces */
async function loadTShirtTemplate(page: Page) {
  // Open template dialog if not already open
  const tplBtn = page.locator('button:has-text("Templates")');
  await tplBtn.click({ force: true });
  await page.waitForTimeout(500);
  // Click T-Shirt
  const tshirt = page.locator('button:has-text("T-Shirt")');
  await tshirt.click({ force: true });
  await page.waitForTimeout(2000);
  // Dismiss template dialog if still visible
  const closeBtn = page.locator('button:has-text("✕")');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }
}

// ─── Expert Mode Toggle ─────────────────────────────────────────────────────

test.describe('Expert Mode', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await ensureStore(page);
  });

  test('toggling expert mode shows EXPERT badge in status bar', async ({ page }) => {
    // Initially no EXPERT badge
    const badge = page.locator('.status-expert-badge');
    await expect(badge).not.toBeVisible();

    // Enable expert mode via Redux
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'workflow/setExpertMode',
        payload: true,
      });
    });
    await page.waitForTimeout(500);

    // EXPERT badge should appear
    await expect(badge).toBeVisible({ timeout: 3000 });
    await expect(badge).toContainText('EXPERT');

    // Disable expert mode
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'workflow/setExpertMode',
        payload: false,
      });
    });
    await page.waitForTimeout(500);

    // Badge should disappear
    await expect(badge).not.toBeVisible();
  });
});

// ─── Confirmation Middleware ────────────────────────────────────────────────

test.describe('Confirmation Middleware', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await ensureStore(page);
    await loadTShirtTemplate(page);
  });

  test('removePiece in normal mode shows confirmation dialog', async ({ page }) => {
    // Ensure expert mode is OFF
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'workflow/setExpertMode',
        payload: false,
      });
    });

    const initialPieces = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces.length;
    });
    expect(initialPieces).toBeGreaterThanOrEqual(1);

    const pieceId = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces[0].id;
    });

    // Dispatch removePiece — should be intercepted
    await page.evaluate((id: string) => {
      (window as any).__testStore.dispatch({
        type: 'project/removePiece',
        payload: id,
      });
    }, pieceId);
    await page.waitForTimeout(500);

    // Confirmation dialog should appear
    const dialog = page.locator('.copilot-confirm-dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator('#confirm-title')).toContainText('Remove Pattern Piece');

    // Piece should NOT be removed yet
    const piecesBlocked = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces.length;
    });
    expect(piecesBlocked).toBe(initialPieces);

    // Cancel
    await page.locator('.copilot-confirm-btn-cancel').click();
    await page.waitForTimeout(300);
    await expect(dialog).not.toBeVisible();
  });

  test('confirming destructive action executes it', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'workflow/setExpertMode',
        payload: false,
      });
    });

    const initialPieces = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces.length;
    });

    const pieceId = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces[0].id;
    });

    await page.evaluate((id: string) => {
      (window as any).__testStore.dispatch({
        type: 'project/removePiece',
        payload: id,
      });
    }, pieceId);
    await page.waitForTimeout(500);

    // Click confirm button
    const confirmBtn = page.locator('.copilot-confirm-btn-destructive');
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();
    await page.waitForTimeout(500);

    // Piece should be removed
    const piecesAfter = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces.length;
    });
    expect(piecesAfter).toBe(initialPieces - 1);
  });

  test('expert mode bypasses confirmation for destructive actions', async ({ page }) => {
    // Enable expert mode
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'workflow/setExpertMode',
        payload: true,
      });
    });

    const initialPieces = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces.length;
    });

    const pieceId = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces[0].id;
    });

    await page.evaluate((id: string) => {
      (window as any).__testStore.dispatch({
        type: 'project/removePiece',
        payload: id,
      });
    }, pieceId);
    await page.waitForTimeout(300);

    // No confirmation dialog
    const dialog = page.locator('.copilot-confirm-dialog');
    await expect(dialog).not.toBeVisible();

    // Piece removed immediately
    const piecesAfter = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces.length;
    });
    expect(piecesAfter).toBe(initialPieces - 1);
  });

  test('override "always" shows confirmation even in expert mode', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__testStore;
      store.dispatch({ type: 'workflow/setExpertMode', payload: true });
      store.dispatch({
        type: 'workflow/setConfirmOverride',
        payload: { operation: 'removePiece', value: 'always' },
      });
    });

    const pieceId = await page.evaluate(() => {
      return (window as any).__testStore.getState().project.pieces[0].id;
    });

    await page.evaluate((id: string) => {
      (window as any).__testStore.dispatch({
        type: 'project/removePiece',
        payload: id,
      });
    }, pieceId);
    await page.waitForTimeout(500);

    // Confirmation SHOULD appear despite expert mode
    const dialog = page.locator('.copilot-confirm-dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Cancel to clean up
    await page.locator('.copilot-confirm-btn-cancel').click();
  });
});

// ─── Tool Memory ────────────────────────────────────────────────────────────

test.describe('Tool Memory', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await ensureStore(page);
  });

  test('tool options are mirrored to toolMemory via middleware', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'tools/setToolOption',
        payload: { toolId: 'notch', optionId: 'notchType', value: 'V' },
      });
    });
    await page.waitForTimeout(300);

    const memory = await page.evaluate(() => {
      return (window as any).__testStore.getState().workflow.toolMemory;
    });
    expect(memory.notch).toBeDefined();
    expect(memory.notch.notchType).toBe('V');
  });

  test('workflow state persists to localStorage', async ({ page }) => {
    // Enable expert mode and set a tool memory entry
    await page.evaluate(() => {
      const store = (window as any).__testStore;
      store.dispatch({ type: 'workflow/setExpertMode', payload: true });
      store.dispatch({
        type: 'workflow/updateToolMemory',
        payload: { tool: 'scissors', values: { splitMode: 'curve' } },
      });
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
    // Enable expert mode
    await page.evaluate(() => {
      (window as any).__testStore.dispatch({
        type: 'workflow/setExpertMode',
        payload: true,
      });
    });

    // Wait for persistence
    await page.waitForTimeout(1000);

    // Verify it's in localStorage before reload
    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('openclo-workflow');
      return raw ? JSON.parse(raw) : null;
    });
    expect(before?.data?.expertMode).toBe(true);

    // Reload page
    await page.reload();
    await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Dismiss template dialog if it reappears
    const closeBtn = page.locator('button:has-text("✕")');
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(300);
    }

    // EXPERT badge should be visible after reload
    const badge = page.locator('.status-expert-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
  });
});
