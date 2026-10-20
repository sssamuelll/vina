import { describe, expect, it } from 'vitest';
import { I18N_CEILINGS } from '../../eslint-rules/i18n-debt.js';
import { censusFiles, countLiteralSites } from '../../scripts/i18n/literal-census.mjs';

/**
 * The literal ratchet (i18n spec § 8.1): vina/no-literal-ui-string at 'error' over every non-test
 * file of src/ outside the exclude list, ignoring the per-file override of the debt list. Each debt
 * file has a ceiling that only goes down; every other file has 0. After pieceSpace.trinquete.test.ts.
 */
const started = performance.now();
const files: string[] = censusFiles();
const counts: Record<string, number> = countLiteralSites(files);
console.log(`i18n literal census: ${files.length} files in ${Math.round(performance.now() - started)} ms`);

describe('i18n literal census', () => {
  it('no file passes its ceiling, and a file off the debt list has no site', () => {
    const over = Object.entries(counts)
      .filter(([file, n]) => n > (I18N_CEILINGS[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} > ${I18N_CEILINGS[file] ?? 0}`);
    expect(over).toEqual([]);
  });

  it('no ceiling sits above today’s count', () => {
    const stale = Object.entries(I18N_CEILINGS)
      .filter(([file, ceiling]) => (counts[file] ?? 0) < ceiling)
      .map(([file, ceiling]) => `${file}: ${counts[file] ?? 0} < ${ceiling}, lower it in eslint-rules/i18n-debt.js`);
    expect(stale).toEqual([]);
  });

  it('sees the files it must see', () => {
    expect(files).toContain('src/components/shell/LogoMenu.tsx');
    expect(counts['src/components/shell/LogoMenu.tsx']).toBeGreaterThan(0);
    expect(files.some((f) => f.startsWith('src/i18n/'))).toBe(false);
    expect(files.some((f) => /__tests__|\.test\./.test(f))).toBe(false);
  });
});
