// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogs, t } from '../index';
import { __resetLocaleForTests, detectLocale } from '../locale';
import { pseudoCatalog, pseudoize } from '../pseudo';

const outsideBrackets = (s: string) => s.replace(/\[[^\]]*\]/g, '');

beforeEach(() => {
  __resetLocaleForTests('es');
});

describe('pseudo-locale', () => {
  it('accents, pads by 35 % and brackets every string of en', () => {
    const en = catalogs.en.app.title;
    const title = pseudoCatalog().app.title;
    expect(title.startsWith('[')).toBe(true);
    expect(title.endsWith(` ${'·'.repeat(Math.ceil(en.length * 0.35))}]`)).toBe(true);
    expect(outsideBrackets(title)).not.toMatch(/\p{L}/u);
    expect(title).toContain('Vîñá');
    expect(pseudoCatalog().keys.delete).toContain('Délété');
  });

  it('is memoized', () => {
    expect(pseudoCatalog()).toBe(pseudoCatalog());
  });

  it('leaves string arguments of a function entry untouched', () => {
    const entry = pseudoize((name: string) => `Delete ${name}`);
    const out = entry('Manga');
    expect(out).toContain('Manga');
    expect(out).toContain('Délété');
    expect(out).not.toContain('');
    expect(out).not.toContain('');
    expect(outsideBrackets(out)).not.toMatch(/\p{L}/u);
  });

  it('passes numbers through', () => {
    expect(pseudoize((n: number) => `${n} pieces`)(12)).toContain('12');
    expect(pseudoize({ count: 5 })).toEqual({ count: 5 });
  });

  it('t() returns the pseudo catalog while pseudo is on', () => {
    detectLocale({ search: '?locale=pseudo', hash: '', languages: [], allowPseudo: true, replaceUrl: () => {} });
    expect(t()).toBe(pseudoCatalog());
  });
});
