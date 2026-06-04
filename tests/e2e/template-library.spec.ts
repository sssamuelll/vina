import { test, expect, Page } from '@playwright/test';

/**
 * TemplateLibrary opens via LogoMenu ▸ File ▸ "Import Seamly2D Pattern..."
 * (the old `.template-btn` toolbar button no longer exists). Proven LogoMenu
 * navigation pattern: open trigger → hover the top-level "File" item → click the
 * scoped submenu item.
 */
async function openTemplateLibrary(page: Page) {
  await page.locator('.logo-menu__trigger').click();
  await page.locator('.logo-menu__item', { hasText: 'File' }).first().hover();
  await page.locator('.logo-menu__submenu .logo-menu__item', { hasText: 'Import Seamly2D Pattern...' }).first().click();
  await expect(page.locator('.template-library')).toBeVisible();
}

async function getPieceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (window as unknown as { __OPENCLO_STORE__?: { getState: () => { project: { pieces: unknown[] } } } }).__OPENCLO_STORE__;
    return store ? store.getState().project.pieces.length : -1;
  });
}

test.describe('Template Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens via File ▸ Import Seamly2D Pattern…', async ({ page }) => {
    await openTemplateLibrary(page);
    await expect(page.locator('.template-header h2')).toHaveText('Seamly2D Pattern Library');
  });

  test('shows avatar measurement summary', async ({ page }) => {
    await openTemplateLibrary(page);
    // Subtitle renders "<N> validated patterns • Measurements: <chest>cm chest, <waist>cm waist".
    await expect(page.locator('.template-subtitle')).toContainText('chest');
    await expect(page.locator('.template-subtitle')).toContainText('waist');
  });

  test('displays template cards', async ({ page }) => {
    await openTemplateLibrary(page);
    const cards = page.locator('.template-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('each card has name and description', async ({ page }) => {
    await openTemplateLibrary(page);
    const firstCard = page.locator('.template-card').first();
    await expect(firstCard.locator('.template-name')).toBeVisible();
    await expect(firstCard.locator('.template-desc')).toBeVisible();
  });

  test('clicking a template adds pieces and closes', async ({ page }) => {
    await openTemplateLibrary(page);
    expect(await getPieceCount(page)).toBe(0);

    const firstCard = page.locator('.template-card').first();
    await firstCard.click();

    // Generation is async (dynamic imports + adapt + autoSew). Wait for pieces.
    await expect.poll(() => getPieceCount(page), { timeout: 15000 }).toBeGreaterThan(0);

    // Library closes once generation finishes. The overlay is hidden via the
    // `closed` class (opacity:0 + pointer-events:none, NOT display:none), so the
    // honest close signal is the class flip, not `.template-library` visibility.
    await expect(page.locator('.template-overlay')).not.toHaveClass(/open/, { timeout: 5000 });
  });

  test('closes via ✕ button', async ({ page }) => {
    await openTemplateLibrary(page);
    await page.click('.template-close');
    await expect(page.locator('.template-overlay')).not.toHaveClass(/open/);
  });

  test('closes by clicking overlay background', async ({ page }) => {
    await openTemplateLibrary(page);
    await page.locator('.template-overlay').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    await expect(page.locator('.template-overlay')).not.toHaveClass(/open/);
  });
});
