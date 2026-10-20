import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { catalogs as runtimeCatalogs } from '../../src/i18n';
import { lockStatus, markReviewed, readCatalog, stamp } from '../../scripts/i18n/lock-core.mjs';

const LOCALES = ['en', 'es', 'de'] as const;
type Locale = (typeof LOCALES)[number];

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k));
}

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A temporary catalog root holding one `app` area per locale. */
function fixture(sources: Record<Locale, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'vina-lock-'));
  roots.push(root);
  for (const locale of LOCALES) write(root, locale, sources[locale]);
  return root;
}
function write(root: string, locale: Locale, body: string) {
  mkdirSync(join(root, locale), { recursive: true });
  writeFileSync(join(root, locale, 'app.ts'), `const { num, plural } = helpers('${locale}');\nexport const app = ${body};\n`);
}
const read = (root: string) => Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l, root)]));
const emptyLock = () => ({ _doc: 'test', entries: {} });
const stateOf = (status: Array<{ key: string; locale: string; state: string }>, key: string, locale: Locale) =>
  status.find((s) => s.key === key && s.locale === locale)?.state;

const BASE = {
  en: "{ title: 'Pattern', count: (n: number) => `${num(n, 1)} mm` }",
  es: "{ title: 'Patrón', count: (n: number) => `${num(n, 1)} mm` }",
  de: "{ title: 'Schnitt', count: (n: number) => `${num(n, 1)} mm` }",
};

describe('the real catalogs and lock', () => {
  const real = Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l)]));
  const lock = JSON.parse(readFileSync('src/i18n/lock.json', 'utf8'));

  it('have no unstamped, untranslated or stale entry', () => {
    const bad = lockStatus(lock, real).filter((s: { state: string }) => ['unstamped', 'untranslated', 'stale'].includes(s.state));
    expect(bad).toEqual([]);
  });

  it('the walker sees exactly the runtime keys', () => {
    expect([...real.en.keys()].sort()).toEqual(flatKeys(runtimeCatalogs.en).sort());
  });

  it('no entry reaches outside its own parameters and helpers', () => {
    for (const locale of LOCALES) {
      for (const [key, entry] of real[locale]) expect(entry.foreignRefs, `${locale}:${key}`).toEqual([]);
    }
  });
});

describe('entry hash', () => {
  it('ignores formatting, comments, trailing commas, parameter names and CRLF', () => {
    const a = read(fixture(BASE));
    const reformatted = fixture({
      ...BASE,
      de: "{\r\n  // the noun\r\n  title:   'Schnitt',\r\n  count: (mm: number) =>\r\n    `${num(mm, 1)} mm`,\r\n}",
    });
    const b = read(reformatted);
    expect(b.de.get('app.title').hash).toBe(a.de.get('app.title').hash);
    expect(b.de.get('app.count').hash).toBe(a.de.get('app.count').hash);
  });

  it('changes with a word, or with a parameter printed raw', () => {
    const a = read(fixture(BASE));
    const b = read(fixture({ ...BASE, de: "{ title: 'Schnittteil', count: (n: number) => `${n} mm` }" }));
    expect(b.de.get('app.title').hash).not.toBe(a.de.get('app.title').hash);
    expect(b.de.get('app.count').hash).not.toBe(a.de.get('app.count').hash);
    expect(a.de.get('app.count').isFunction).toBe(true);
    expect(a.de.get('app.title')).toMatchObject({ text: 'Schnitt', isFunction: false, sameAsEn: null });
  });

  it('refuses a spread or a computed key', () => {
    expect(() => read(fixture({ ...BASE, de: "{ ...base, title: 'Schnitt' }" }))).toThrow(/cannot walk .*app\.ts:\d+/);
    expect(() => read(fixture({ ...BASE, de: "{ ['ti' + 'tle']: 'Schnitt' }" }))).toThrow(/cannot walk .*app\.ts:\d+/);
  });
});

describe('lock states and commands', () => {
  it('a translation equal to en without same-as-en is untranslated', () => {
    const plain = read(fixture({ ...BASE, de: "{ title: 'Pattern', count: (n: number) => `${num(n, 1)} mm` }" }));
    expect(stateOf(lockStatus(stamp(emptyLock(), plain, 'app'), plain), 'app.title', 'de')).toBe('untranslated');
    // a pasted English function, reformatted and with its parameter renamed, is still English
    const renamed = read(fixture({ ...BASE, de: "{ title: 'Schnitt', count: (mm: number) =>\n  `${num(mm, 1)} mm` }" }));
    expect(stateOf(lockStatus(stamp(emptyLock(), renamed, 'app'), renamed), 'app.count', 'de')).toBe('untranslated');
    const marked = read(
      fixture({ ...BASE, de: "{\n  title: 'Pattern', // same-as-en: the brand name\n  count: (n: number) => `${num(n, 1)} mm`,\n}" }),
    );
    expect(marked.de.get('app.title').sameAsEn).toBe('the brand name');
    expect(stateOf(lockStatus(stamp(emptyLock(), marked, 'app'), marked), 'app.title', 'de')).not.toBe('untranslated');
  });

  it('an entry with no record is unstamped; a stamped one is unreviewed until reviewed', () => {
    const cats = read(fixture(BASE));
    expect(stateOf(lockStatus(emptyLock(), cats), 'app.title', 'de')).toBe('unstamped');
    const lock = stamp(emptyLock(), cats, 'app');
    expect(lock.entries['app.title'].de.reviewedBy).toBeUndefined();
    expect(stateOf(lockStatus(lock, cats), 'app.title', 'de')).toBe('unreviewed');
    const reviewed = markReviewed(lock, cats, 'app.title', 'de', 'reviewer', '2026-10-20');
    expect(stateOf(lockStatus(reviewed, cats), 'app.title', 'de')).toBe('ok');
  });

  it('stamping an area leaves an already-stamped key untouched', () => {
    const root = fixture(BASE);
    const lock = stamp(emptyLock(), read(root), 'app');
    const before = structuredClone(lock.entries['app.title']);
    write(root, 'en', "{ title: 'Pattern piece', count: (n: number) => `${num(n, 1)} mm`, extra: 'New' }");
    write(root, 'es', "{ title: 'Patrón', count: (n: number) => `${num(n, 1)} mm`, extra: 'Nuevo' }");
    write(root, 'de', "{ title: 'Schnitt', count: (n: number) => `${num(n, 1)} mm`, extra: 'Neu' }");
    const cats = read(root);
    const again = stamp(lock, cats, 'app');
    expect(again.entries['app.title']).toEqual(before);
    expect(again.entries['app.extra'].de.hash).toBe(cats.de.get('app.extra').hash);
    expect(stateOf(lockStatus(again, cats), 'app.title', 'de')).toBe('stale');
  });

  it('a stale key whose translation did not change needs a reason, one key at a time', () => {
    const root = fixture(BASE);
    const lock = stamp(emptyLock(), read(root), 'app');
    write(root, 'en', "{ title: 'Pattern piece', count: (n: number) => `${num(n, 1)} mm` }");
    const cats = read(root);
    expect(() => stamp(lock, cats, 'app.title')).toThrow(/reason/);
    const acknowledged = stamp(lock, cats, 'app.title', { reason: 'German already says piece' });
    expect(acknowledged.entries['app.title'].de.reason).toBe('German already says piece');
    expect(stateOf(lockStatus(acknowledged, cats), 'app.title', 'de')).not.toBe('stale');
  });

  it('changing a signed es makes en and de stale', () => {
    const root = fixture(BASE);
    let lock = stamp(emptyLock(), read(root), 'app');
    lock.entries['app.title'].es.signed = true;
    lock = stamp(lock, read(root), 'app.title', { reason: 'record the signed es' });
    write(root, 'es', "{ title: 'Patrón base', count: (n: number) => `${num(n, 1)} mm` }");
    const status = lockStatus(lock, read(root));
    expect(stateOf(status, 'app.title', 'en')).toBe('stale');
    expect(stateOf(status, 'app.title', 'de')).toBe('stale');
  });

  it('an edited translation after review is unreviewed again', () => {
    const root = fixture(BASE);
    const lock = markReviewed(stamp(emptyLock(), read(root), 'app'), read(root), 'app.title', 'de', 'reviewer', '2026-10-20');
    write(root, 'de', "{ title: 'Schnittmuster', count: (n: number) => `${num(n, 1)} mm` }");
    const cats = read(root);
    const restamped = stamp(lock, cats, 'app.title', { reason: 'reworded' });
    expect(stateOf(lockStatus(restamped, cats), 'app.title', 'de')).toBe('unreviewed');
  });
});
