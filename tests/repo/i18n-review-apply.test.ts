import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lockStatus, readCatalog, stamp } from '../../scripts/i18n/lock-core.mjs';
import { buildReview } from '../../scripts/i18n/review-doc.mjs';
import { applyReview } from '../../scripts/i18n/review-apply.mjs';

const LOCALES = ['en', 'es', 'de'] as const;
type Locale = (typeof LOCALES)[number];

const SOURCES: Record<Locale, string> = {
  en: "export const keys = {\n  delete: 'Delete',\n  space: 'Space',\n  count: (n: number) => `${num(n, 0)} keys`,\n};\n",
  es: "export const keys = {\n  delete: 'Supr',\n  space: 'Espacio',\n  count: (n: number) => `${num(n, 0)} teclas`,\n};\n",
  de: "export const keys = {\n  delete: 'Supr',\n  space: 'Leertaste',\n  count: (n: number) => `${num(n, 0)} Tasten`,\n};\n",
};

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'vina-review-'));
  roots.push(root);
  for (const locale of LOCALES) {
    mkdirSync(join(root, locale), { recursive: true });
    writeFileSync(join(root, locale, 'keys.ts'), `const { num, plural } = helpers('${locale}');\n${SOURCES[locale]}`);
  }
  const cats = () => Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l, root)]));
  const lock = stamp({ _doc: 'test', entries: {} }, cats(), 'keys');
  return { root, cats, lock };
}

const HEADER = 'key,locale,sourceHash,verdict,correction,reviewer,date';
const row = (cells: string[]) => cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
const stateOf = (status: Array<{ key: string; locale: string; state: string }>, key: string, locale: Locale) =>
  status.find((s) => s.key === key && s.locale === locale)?.state;

describe('review document', () => {
  it('has one csv row per key and locale with the current source hash, and a self-contained html', () => {
    const { root, cats, lock } = setup();
    const { html, csv } = buildReview(root, lock);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(1 + 3 * 3);
    const sourceHash = cats().en.get('keys.delete').hash;
    expect(lines).toContain(`keys.delete,de,${sourceHash},,,,`);
    expect(html).toContain('Leertaste');
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//);
  });
});

describe('review-apply', () => {
  it('a correct row marks the entry reviewed', () => {
    const { root, cats, lock } = setup();
    const csv = [HEADER, row(['keys.space', 'de', cats().en.get('keys.space').hash, 'correct', '', 'reviewer', '2026-10-20'])].join('\n');
    const result = applyReview(csv, { root, lock });
    expect(result.lock.entries['keys.space'].de).toMatchObject({ reviewedBy: 'reviewer', reviewedAt: '2026-10-20' });
    expect(stateOf(lockStatus(result.lock, cats()), 'keys.space', 'de')).toBe('ok');
  });

  it('a correction rewrites the literal in its catalog file, re-stamps and marks it reviewed', () => {
    const { root, cats, lock } = setup();
    const csv = [HEADER, row(['keys.delete', 'de', cats().en.get('keys.delete').hash, 'correction', 'Entf', 'reviewer', '2026-10-20'])].join('\n');
    const result = applyReview(csv, { root, lock });
    const file = readFileSync(join(root, 'de', 'keys.ts'), 'utf8');
    expect(file).toContain("delete: 'Entf',");
    expect(file).toContain("space: 'Leertaste',");
    expect(cats().de.get('keys.delete').text).toBe('Entf');
    expect(stateOf(lockStatus(result.lock, cats()), 'keys.delete', 'de')).toBe('ok');
  });

  it('sets aside a row reviewed against an older source', () => {
    const { root, lock } = setup();
    const csv = [HEADER, row(['keys.space', 'de', 'deadbeef', 'correct', '', 'reviewer', '2026-10-20'])].join('\n');
    const result = applyReview(csv, { root, lock });
    expect(result.setAside).toEqual(['keys.space:de']);
    expect(result.lock.entries['keys.space'].de.reviewedBy).toBeUndefined();
  });

  it('lists a correction to a function entry for a manual edit and leaves the file alone', () => {
    const { root, cats, lock } = setup();
    const before = readFileSync(join(root, 'de', 'keys.ts'), 'utf8');
    const csv = [HEADER, row(['keys.count', 'de', cats().en.get('keys.count').hash, 'correction', '${n} Tasten', 'reviewer', '2026-10-20'])].join('\n');
    const result = applyReview(csv, { root, lock });
    expect(result.manual).toEqual(['keys.count:de']);
    expect(readFileSync(join(root, 'de', 'keys.ts'), 'utf8')).toBe(before);
  });

  it('--signed signs es rows and refuses en and de rows', () => {
    const { root, cats, lock } = setup();
    const hash = cats().en.get('keys.space').hash;
    const es = [HEADER, row(['keys.space', 'es', hash, 'correct', '', 'signed copy 473c1772', '2026-10-20'])].join('\n');
    const signed = applyReview(es, { root, lock, signed: true });
    expect(signed.lock.entries['keys.space'].es).toMatchObject({ signed: true, reviewedBy: 'signed copy 473c1772' });
    expect(signed.lock.entries['keys.space'].en.esHash).toBe(cats().es.get('keys.space').hash);
    const de = [HEADER, row(['keys.space', 'de', hash, 'correct', '', 'signed copy 473c1772', '2026-10-20'])].join('\n');
    expect(() => applyReview(de, { root, lock, signed: true })).toThrow(/signed/);
  });

  it('a correction stamps only the entry it changed, so a corrected English leaves its translations stale', () => {
    const { root, cats, lock } = setup();
    const hash = (key: string) => cats().en.get(key).hash;
    const csv = [
      HEADER,
      row(['keys.delete', 'de', hash('keys.delete'), 'correct', '', 'reviewer', '2026-10-20']),
      row(['keys.space', 'en', hash('keys.space'), 'correction', 'Space bar', 'reviewer', '2026-10-20']),
    ].join('\n');
    const result = applyReview(csv, { root, lock });
    const status = lockStatus(result.lock, cats());
    expect(stateOf(status, 'keys.delete', 'de')).toBe('ok');
    expect(stateOf(status, 'keys.space', 'en')).toBe('ok');
    expect(stateOf(status, 'keys.space', 'es')).toBe('stale');
    expect(stateOf(status, 'keys.space', 'de')).toBe('stale');
  });

  it('a correction to signed Spanish takes the signed mark from the entry', () => {
    const { root, cats, lock } = setup();
    const hash = cats().en.get('keys.space').hash;
    const sign = [HEADER, row(['keys.space', 'es', hash, 'correct', '', 'signed copy 473c1772', '2026-10-20'])].join('\n');
    const signed = applyReview(sign, { root, lock, signed: true }).lock;
    const fix = [HEADER, row(['keys.space', 'es', hash, 'correction', 'Barra espaciadora', 'reviewer', '2026-10-21'])].join('\n');
    const result = applyReview(fix, { root, lock: signed });
    expect(result.lock.entries['keys.space'].es.signed).toBeUndefined();
    expect(result.lock.entries['keys.space'].es).toMatchObject({ reviewedBy: 'reviewer', reviewedAt: '2026-10-21' });
    expect(stateOf(lockStatus(result.lock, cats()), 'keys.space', 'es')).toBe('ok');
  });

  it('a row that fails leaves every catalog file as it was', () => {
    const { root, cats, lock } = setup();
    const before = readFileSync(join(root, 'de', 'keys.ts'), 'utf8');
    const csv = [
      HEADER,
      row(['keys.delete', 'de', cats().en.get('keys.delete').hash, 'correction', 'Entf', 'reviewer', '2026-10-20']),
      row(['keys.space', 'fr', cats().en.get('keys.space').hash, 'correction', 'Espace', 'reviewer', '2026-10-20']),
    ].join('\n');
    expect(() => applyReview(csv, { root, lock })).toThrow(/keys\.space:fr/);
    expect(readFileSync(join(root, 'de', 'keys.ts'), 'utf8')).toBe(before);
  });

  it('--signed takes correct rows only, and only for Spanish unchanged since its stamp', () => {
    const { root, cats, lock } = setup();
    const hash = cats().en.get('keys.space').hash;
    const fix = [HEADER, row(['keys.space', 'es', hash, 'correction', 'Barra', 'signed copy 473c1772', '2026-10-20'])].join('\n');
    expect(() => applyReview(fix, { root, lock, signed: true })).toThrow(/signed/);
    const file = join(root, 'es', 'keys.ts');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Espacio', 'Espacio largo'));
    const ok = [HEADER, row(['keys.space', 'es', hash, 'correct', '', 'signed copy 473c1772', '2026-10-20'])].join('\n');
    expect(() => applyReview(ok, { root, lock, signed: true })).toThrow(/stamp/);
  });

  it('reads a csv saved with a byte order mark', () => {
    const { root, cats, lock } = setup();
    const csv = '\uFEFF' + [HEADER, row(['keys.space', 'de', cats().en.get('keys.space').hash, 'correct', '', 'reviewer', '2026-10-20'])].join('\r\n');
    const result = applyReview(csv, { root, lock });
    expect(result.setAside).toEqual([]);
    expect(result.lock.entries['keys.space'].de.reviewedBy).toBe('reviewer');
  });
});
