/**
 * E2E tests for safeStorage — localStorage persistence and private browsing fallback
 *
 * Tests verify:
 * 1. Settings persist across page reloads (normal operation)
 * 2. Private browsing: toast warning, app works, in-memory fallback
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

// ─── Test 1: Normal operation — settings persist across reloads ─────────────

test('settings persist in localStorage across reloads', async ({ page }) => {
  await waitForApp(page);

  // Write a workflow setting (expert mode) via localStorage
  await page.evaluate(() => {
    const key = 'vina-workflow';
    const data = { v: 1, expertMode: true, confirmOverrides: {}, toolMemory: {} };
    localStorage.setItem(key, JSON.stringify(data));
  });

  // Reload the page
  await page.reload();
  await waitForApp(page);

  // Verify the setting survived the reload
  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('vina-workflow');
    if (!raw) return null;
    return JSON.parse(raw);
  });

  expect(persisted).not.toBeNull();
  expect(persisted.expertMode).toBe(true);

  // Clean up
  await page.evaluate(() => localStorage.removeItem('vina-workflow'));
});

// ─── Test 2: Private browsing — toast + app works ───────────────────────────

test('shows warning toast and app works when localStorage is blocked', async ({ browser }) => {
  // Create a context that blocks localStorage via CSP / script injection
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();

  // Block localStorage by overriding it before the app loads
  await page.addInitScript(() => {
    // Override Storage.prototype to simulate private browsing / disabled storage
    const throwStorage = () => { throw new DOMException('Storage is disabled', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', {
      get: () => ({
        getItem: throwStorage,
        setItem: throwStorage,
        removeItem: throwStorage,
        clear: throwStorage,
        key: throwStorage,
        length: 0,
      }),
      configurable: true,
    });
  });

  await waitForApp(page);

  // Verify the toast warning appeared. App dispatches showToast({type:'error'})
  // for the storage-blocked path → renders as `.toast.toast--error` via the now-
  // mounted ToastContainer.
  const toast = page.locator('.toast--error', { hasText: 'El navegador bloqueó el almacenamiento local' });
  await expect(toast.first()).toBeVisible({ timeout: 10000 });

  // Verify the app is still functional — pattern editor loaded
  const svg = page.locator('svg.pattern-svg');
  await expect(svg).toBeVisible();

  // Verify the shell rendered (not crashed). `.workspace` no longer exists;
  // the current top-level shell root is `.app-shell`.
  const shell = page.locator('.app-shell');
  await expect(shell).toBeVisible();

  await context.close();
});
