import { describe, expect, it } from 'vitest';
import { ES_FIELD_CEILINGS } from '../../eslint-rules/i18n-debt.js';
import { countEsFields, sourceFiles } from '../../scripts/i18n/literal-census.mjs';

/**
 * The Es-field ratchet (i18n spec § 6.2, § 8.1): identifiers and property names matching /[a-z]Es$/
 * in non-test src/ (fabric.nameEs, mensajeDeErrorEs, …), per file. It only goes down, and reaches
 * zero once the Spanish data fields are gone.
 */
const files: string[] = sourceFiles();
const counts: Record<string, number> = countEsFields(files);

describe('i18n Es-field census', () => {
  it('no file passes its ceiling, and a file off the list has none', () => {
    const over = Object.entries(counts)
      .filter(([file, n]) => n > (ES_FIELD_CEILINGS[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} > ${ES_FIELD_CEILINGS[file] ?? 0}`);
    expect(over).toEqual([]);
  });

  it('no ceiling sits above today’s count', () => {
    const stale = Object.entries(ES_FIELD_CEILINGS)
      .filter(([file, ceiling]) => (counts[file] ?? 0) < ceiling)
      .map(([file, ceiling]) => `${file}: ${counts[file] ?? 0} < ${ceiling}, lower it in eslint-rules/i18n-debt.js`);
    expect(stale).toEqual([]);
  });

  it('sees the files it must see', () => {
    expect(counts['src/utils/cloth/physicalFabric.ts']).toBeGreaterThan(0);
    expect(files.some((f) => /__tests__|\.test\./.test(f))).toBe(false);
  });
});
