import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCatalogs, findTerms, fold, parseGlossary } from '../../scripts/i18n/glossary-core.mjs';
import { readCatalog } from '../../scripts/i18n/lock-core.mjs';

const MD = `# Glossary

## Terms

| en | es | de | note |
|---|---|---|---|
| seam · seams | costura · costuras | Naht · Nähte | |
| seam allowance · seam allowances | margen de costura · márgenes de costura | Nahtzugabe · Nahtzugaben | |
| piece · pieces | pieza · piezas | — | pending |
| button · buttons | botón · botones | Knopf · Knöpfe | |
| Vina | =en | =en | brand |

## Banned

| lang | forms | reason |
|---|---|---|
| es | heredar · hereda · heredado | not a pattern-making verb |
| en | inherit · inherits | not a pattern-making verb |
`;

type Entry = { text: string; isFunction: boolean; glossaryExempt: Array<{ term: string; reason: string }> };
const entry = (text: string, glossaryExempt: Entry['glossaryExempt'] = []): Entry => ({ text, isFunction: false, glossaryExempt });
const cats = (en: Record<string, Entry>, es: Record<string, Entry>, de: Record<string, Entry> = {}) => ({
  en: new Map(Object.entries(en)),
  es: new Map(Object.entries(es)),
  de: new Map(Object.entries(de)),
});

describe('glossary core', () => {
  const glossary = parseGlossary(MD);

  it('parses forms, =en and pending cells, and the banned table', () => {
    expect(glossary.terms).toHaveLength(5);
    expect(glossary.terms[1].es).toEqual(['margen de costura', 'márgenes de costura']);
    expect(glossary.terms[2].de).toEqual([]);
    expect(glossary.terms[4].de).toEqual(['Vina']);
    expect(glossary.banned).toEqual([
      { lang: 'es', forms: ['heredar', 'hereda', 'heredado'], reason: 'not a pattern-making verb' },
      { lang: 'en', forms: ['inherit', 'inherits'], reason: 'not a pattern-making verb' },
    ]);
  });

  it('folds accents, umlauts, ß and case so inflected forms still match', () => {
    expect(fold('Nähte').includes(fold('Naht'))).toBe(true);
    expect(fold('márgenes').includes(fold('margen'))).toBe(true);
    expect(fold('Knöpfe').includes(fold('knopf'))).toBe(true);
    expect(fold('Maß')).toBe('mass');
  });

  it('takes the longest form first and does not offer consumed text again', () => {
    const found = findTerms('seam allowance width', glossary.terms, 'en');
    expect(found).toEqual([glossary.terms[1]]);
    expect(findTerms('Delete seam', glossary.terms, 'en')).toEqual([glossary.terms[0]]);
    // a form starts at a word, so `piece` is not inside `masterpiece`; suffixes still match
    expect(findTerms('A masterpiece', glossary.terms, 'en')).toEqual([]);
    expect(findTerms('Two buttons', glossary.terms, 'en')).toEqual([glossary.terms[3]]);
  });

  it('a translation that drops the glossary term violates its row, unless exempt with a reason', () => {
    const violating = cats({ 'pieces.delete': entry('Delete seam') }, { 'pieces.delete': entry('Borrar pieza') });
    expect(checkCatalogs(violating, glossary)).not.toEqual([]);
    const kept = cats({ 'pieces.delete': entry('Delete seam') }, { 'pieces.delete': entry('Borrar costura') });
    expect(checkCatalogs(kept, glossary)).toEqual([]);
    const exempt = cats(
      { 'pieces.delete': entry('Delete seam') },
      { 'pieces.delete': entry('Borrar pieza', [{ term: 'seam', reason: 'the whole piece goes' }]) },
    );
    expect(checkCatalogs(exempt, glossary)).toEqual([]);
  });

  it('a pending cell is skipped', () => {
    const pending = cats({ 'pieces.one': entry('One piece') }, { 'pieces.one': entry('Una pieza') }, { 'pieces.one': entry('Ein Teil') });
    expect(checkCatalogs(pending, glossary)).toEqual([]);
  });

  it('a banned form fails', () => {
    const banned = cats({ 'seams.hint': entry('This edge takes the allowance') }, { 'seams.hint': entry('Este borde hereda el margen') });
    expect(checkCatalogs(banned, glossary)).not.toEqual([]);
  });
});

describe('the real glossary', () => {
  const glossary = parseGlossary(readFileSync('docs/specs/2026-09-29-ui-glossary.md', 'utf8'));

  it('has at least 10 terms and 3 banned rows', () => {
    expect(glossary.terms.length).toBeGreaterThanOrEqual(10);
    expect(glossary.banned.length).toBeGreaterThanOrEqual(3);
  });

  it('the real catalogs follow it', () => {
    const real = { en: readCatalog('en'), es: readCatalog('es'), de: readCatalog('de') };
    expect(checkCatalogs(real, glossary)).toEqual([]);
  });
});
