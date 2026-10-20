import { expect, test, type Page } from '@playwright/test';
import { de } from '../../src/i18n/de';
import { findClippedText } from './i18n/detectors';
import { openApp } from './i18n-surfaces';

test.use({ viewport: { width: 1366, height: 643 } });

const lang = (p: Page) => p.evaluate(() => document.documentElement.lang);
const stored = (p: Page) => p.evaluate(() => localStorage.getItem('vina-locale'));

async function openLanguageItems(page: Page) {
  await page.locator('.logo-menu__trigger').click();
  await page.locator('[data-menu="preferences"]').hover();
  await page.locator('.logo-menu__submenu .logo-menu__label[lang="de"]').waitFor({ state: 'visible' });
}

test.describe('language switch', () => {
  test('Preferences menu sets German, keeps it across a reload, and goes back to Spanish', async ({ page }, testInfo) => {
    // Spanish named in the address: the launch gate runs this spec with the browser pinned to English.
    await openApp(page, new URL(testInfo.project.use.baseURL ?? 'http://localhost:5174').origin, '/app/?lang=es');
    expect(await lang(page)).toBe('es');

    await openLanguageItems(page);
    const items = page.locator('.logo-menu__submenu .logo-menu__label[lang]');
    for (const box of await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(1366);
      expect(box.bottom).toBeLessThanOrEqual(643);
    }
    const clipped = await page.evaluate(`(${findClippedText.toString()})(document.querySelector('.logo-menu'))`);
    expect(clipped).toEqual([]);

    await page.locator('.logo-menu__submenu .logo-menu__label[lang="de"]').click();
    await expect.poll(() => lang(page)).toBe('de');
    expect(await page.title()).toBe(de.app.title);

    await page.reload();
    await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
    await expect.poll(() => lang(page)).toBe('de');
    expect(await stored(page)).toBe('de');

    await openLanguageItems(page);
    await page.locator('.logo-menu__submenu .logo-menu__label[lang="es"]').click();
    await expect.poll(() => lang(page)).toBe('es');
    expect(await stored(page)).toBe('es');
  });

  test('?lang=de is stored and removed from the address', async ({ page }) => {
    await page.goto('/app/?lang=de', { waitUntil: 'domcontentloaded' });
    await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
    expect(await stored(page)).toBe('de');
    expect(new URL(page.url()).searchParams.has('lang')).toBe(false);
    await expect.poll(() => lang(page)).toBe('de');
  });
});
