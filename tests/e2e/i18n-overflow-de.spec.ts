import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { findClippedText, findPeriodDecimals } from './i18n/detectors';
import { I18N_SURFACES, openApp } from './i18n-surfaces';

const swept = I18N_SURFACES.filter((e) => e.swept);
const baseline = JSON.parse(readFileSync(new URL('./i18n-overflow-baseline.json', import.meta.url), 'utf8')) as { entries: Record<string, string[]> };

test.use({ viewport: { width: 1366, height: 643 } });

async function clipsIn(page: Page, origin: string, lang: 'en' | 'de', reach: (p: Page) => Promise<void>) {
  await openApp(page, origin, `/app/?lang=${lang}`);
  await reach(page);
  const clipped = await page.evaluate(`(${findClippedText.toString()})(document.body)`) as Array<{ axis: string; selector: string }>;
  const decimals = await page.evaluate(`(${findPeriodDecimals.toString()})(document.body)`) as string[];
  return { clips: new Set(clipped.map((c) => `${c.axis} ${c.selector}`)), decimals };
}

test.describe('German overflow', () => {
  // A describe with no test prints nothing: this one carries the reason until the first entry is swept.
  if (swept.length === 0) test('sweeps the migrated entries', () => test.skip(true, 'no area migrated yet (phase 4 adds entries)'));

  for (const entry of swept) {
    test(`${entry.id} clips nothing in German that English does not`, async ({ page }, testInfo) => {
      const origin = new URL(testInfo.project.use.baseURL ?? 'http://localhost:5174').origin;
      const en = await clipsIn(page, origin, 'en', entry.reach);
      const de = await clipsIn(page, origin, 'de', entry.reach);
      const known = new Set(baseline.entries[entry.id] ?? []);
      const fresh = [...de.clips].filter((c) => !en.clips.has(c) && !known.has(c)).sort();
      const stale = [...known].filter((c) => !de.clips.has(c) || en.clips.has(c)).sort();
      expect(fresh, 'new German clips: fix the layout').toEqual([]);
      expect(stale.map((c) => `delete from tests/e2e/i18n-overflow-baseline.json (${entry.id}): ${c}`), 'baseline lines that no longer clip').toEqual([]);
      expect(de.decimals, 'period decimals in German').toEqual([]);
    });
  }
});
