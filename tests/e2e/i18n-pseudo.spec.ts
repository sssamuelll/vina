import { expect, test } from '@playwright/test';
import { findUnmarkedText } from './i18n/detectors';
import { I18N_SURFACES, openApp } from './i18n-surfaces';

const swept = I18N_SURFACES.filter((e) => e.swept);

test.describe('pseudo-locale sweep', () => {
  // A describe with no test prints nothing: this one carries the reason until the first entry is swept.
  if (swept.length === 0) test('sweeps the migrated entries', () => test.skip(true, 'no area migrated yet (phase 4 adds entries)'));

  for (const entry of swept) {
    test(`${entry.id} has no unmarked text`, async ({ page }, testInfo) => {
      await openApp(page, new URL(testInfo.project.use.baseURL ?? 'http://localhost:5174').origin, '/app/?locale=pseudo');
      // ?locale=pseudo is ignored where allowAll() is false (plain production build): the sweep would read Spanish without looking.
      expect(await page.title(), 'pseudo locale is not on: run against the dev server or VITE_ALL_LOCALES=1').toMatch(/^\[/);
      await entry.reach(page);
      const found = await page.evaluate(`(${findUnmarkedText.toString()})(document.body)`) as string[];
      expect(found).toEqual([]);
    });
  }
});
