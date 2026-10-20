import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLocale, setLocale } from '../../src/i18n/locale';
import { TEST_BROWSER_LOCALE, TEST_LOCALE } from '../locale-pin';

const other = TEST_LOCALE === 'de' ? 'en' : 'de';

describe('the test locale pin', () => {
  it('starts a test in TEST_LOCALE', () => {
    expect(getLocale()).toBe(TEST_LOCALE);
    setLocale(other);
    expect(getLocale()).toBe(other);
  });

  it('starts the next test in TEST_LOCALE again, after the previous one switched', () => {
    expect(getLocale()).toBe(TEST_LOCALE);
  });

  it('is es unless VINA_TEST_LOCALE names another, and maps to a browser locale', () => {
    if (!process.env.VINA_TEST_LOCALE) expect(TEST_LOCALE).toBe('es');
    expect({ es: 'es-VE', en: 'en-US', de: 'de-DE' }[TEST_LOCALE]).toBe(TEST_BROWSER_LOCALE);
  });

  it('the browser specs read the same pin', () => {
    expect(readFileSync('playwright.config.ts', 'utf8')).toContain('locale: TEST_BROWSER_LOCALE');
  });
});
