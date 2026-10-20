import { expect, test, type Page } from '@playwright/test';
import { findClippedText, findPeriodDecimals, findUnmarkedText } from './i18n/detectors';

/** The detectors are self-contained so that page.evaluate can serialize them. */
const run = <T>(page: Page, fn: (root: Element) => T) => page.evaluate(`(${fn.toString()})(document.body)`) as Promise<T>;

test.describe('i18n detectors on fixtures', () => {
  test('findUnmarkedText flags plain text and passes pseudo text, translate="no", skips and numbers with a unit', async ({ page }) => {
    await page.setContent(`
      <button>Borrar</button>
      <button>[Ðéļéţé ··]</button>
      <span translate="no">Manga</span>
      <span>12,5 mm</span>
      <div data-i18n-skip><b>Hola</b></div>
      <div data-superficie="dev">Debug</div>
      <input placeholder="Buscar" />
      <img alt="[Ýéş ·]" src="data:," />
      <span style="display:none">Oculto</span>
    `);
    expect((await run(page, findUnmarkedText)).sort()).toEqual(['Borrar', 'Buscar']);
  });

  test('findClippedText flags text cut on either axis and in SVG, and passes a truncation that keeps the full text', async ({ page }) => {
    await page.setContent(`
      <style>button { font: 14px sans-serif; padding: 0; border: 0; }</style>
      <button id="x" style="width:40px; overflow:hidden; white-space:nowrap">Schnittteillöschen</button>
      <button id="t" class="truncate" title="Schnittteil löschen" style="width:40px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis">Schnittteil löschen</button>
      <button id="y" style="width:40px; height:16px; overflow:hidden; white-space:normal">Schnittteil löschen jetzt</button>
      <button id="ok" style="width:300px">Taste</button>
      <svg width="40" height="20" style="overflow:hidden"><text x="0" y="15">Schnittteillöschen</text></svg>
    `);
    const clipped = await run(page, findClippedText);
    const texts = clipped.map((c) => c.text);
    expect(clipped.find((c) => c.text === 'Schnittteillöschen' && c.axis === 'x')).toBeTruthy();
    expect(clipped.find((c) => c.text.startsWith('Schnittteil löschen jetzt') && c.axis === 'y')).toBeTruthy();
    expect(clipped.filter((c) => c.text === 'Schnittteillöschen')).toHaveLength(2);
    expect(texts).not.toContain('Schnittteil löschen');
    expect(texts).not.toContain('Taste');
  });

  test('findPeriodDecimals flags a period decimal and passes a comma one', async ({ page }) => {
    await page.setContent(`<span>12.5 mm</span><span>12,5 mm</span><span translate="no">v1.2</span><span>Paso 3</span>`);
    expect(await run(page, findPeriodDecimals)).toEqual(['12.5 mm']);
  });
});
