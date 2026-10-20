import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { I18N_SURFACES, PENDING_CEILING, PENDING_SURFACES } from '../e2e/i18n-surfaces';

/** The declared surface vocabulary, read from its test file's text (importing a test file re-runs its tests). */
function vocabulary(): string[] {
  const src = readFileSync('tests/repo/superficies-declaradas.test.ts', 'utf8');
  const set = /export const VOCABULARIO = new Set\(\[([\s\S]*?)\]\)/.exec(src);
  if (!set) throw new Error('VOCABULARIO not found in tests/repo/superficies-declaradas.test.ts');
  return [...set[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('i18n surface list (spec § 7.5, § 8.3)', () => {
  const covered = new Set(I18N_SURFACES.flatMap((entry) => entry.surfaces));

  it('every declared surface but dev has an entry or is pending', () => {
    const missing = vocabulary().filter((s) => s !== 'dev' && !covered.has(s) && !PENDING_SURFACES.includes(s));
    expect(missing).toEqual([]);
  });

  it('no pending surface is already covered', () => {
    expect(PENDING_SURFACES.filter((s) => covered.has(s))).toEqual([]);
  });

  it('the pending list only shrinks', () => {
    expect(PENDING_SURFACES.length).toBe(PENDING_CEILING);
  });

  it('entries have unique ids and nothing is swept before its area migrates', () => {
    const ids = I18N_SURFACES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(I18N_SURFACES.filter((entry) => entry.swept)).toEqual([]);
  });
});
