import { expect, test, type Page } from '@playwright/test';

const stored = (p: Page) => p.evaluate(() => localStorage.getItem('vina-locale'));

async function boot(page: Page) {
  await page.goto('/app/', { waitUntil: 'domcontentloaded' });
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
  // The rename marker is written asynchronously, after IndexedDB probing.
  await page.waitForFunction(() => localStorage.getItem('vina-rename-migrated') !== null, undefined, { timeout: 30_000 });
}

test.describe('first boot, English browser', () => {
  test.use({ locale: 'en-US' });

  test('an install that predates i18n (vina-autosave present) opens in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vina-autosave', '{}'));
    await boot(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await stored(page)).toBe('es');
  });

  test('an empty profile opens in English, keeps it, and detection ran before the rename migration', async ({ page }) => {
    await boot(page);
    // The migration writes a vina- key on every first boot; had it run first, the legacy-key rule would have chosen Spanish.
    expect(await stored(page)).toBe('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
    expect(await stored(page)).toBe('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('first boot, Venezuelan browser', () => {
  test.use({ locale: 'es-VE' });

  test('an empty profile opens in Spanish', async ({ page }) => {
    await boot(page);
    expect(await stored(page)).toBe('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});
