import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../../scripts/i18n/lock-core.mjs';

/**
 * Verbatim Spanish (i18n spec § 4 principle 3, § 8.2): every es entry the lock marks as signed copy
 * equals the literal it replaced, except for the decimal comma.
 */
const verbatim: Record<string, { source: string; text: string }> = JSON.parse(readFileSync('tests/i18n/verbatim-es.json', 'utf8'));
const lock = JSON.parse(readFileSync('src/i18n/lock.json', 'utf8'));
const es = readCatalog('es');
const signedKeys = Object.keys(lock.entries).filter((key) => lock.entries[key].es?.signed);
const withComma = (text: string) => text.replace(/(\d)\.(\d)/g, '$1,$2');

describe('verbatim Spanish', () => {
  it('there is signed Spanish to check', () => {
    expect(signedKeys.length).toBeGreaterThan(0);
  });

  it.each(signedKeys)('%s equals the literal it replaced', (key) => {
    const record = verbatim[key];
    expect(record, `${key} is signed but has no verbatim record`).toBeDefined();
    const entry = es.get(key);
    expect(entry.isFunction, `${key}: function entries need sample arguments (phase 4 adds them)`).toBe(false);
    expect(entry.text).toBe(withComma(record.text));
  });

  it('every verbatim record names a signed key and a source line', () => {
    for (const [key, record] of Object.entries(verbatim)) {
      expect(signedKeys, key).toContain(key);
      expect(record.source).toMatch(/^[\w./-]+:\d+$/);
    }
  });
});
