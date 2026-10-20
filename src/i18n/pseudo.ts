/**
 * Pseudo-locale: en with accented letters, padded by 35 % and bracketed, so untranslated or clipped
 * text stands out. Imports ./en directly, not ./index, to avoid a cycle.
 */
import { en } from './en';
import type { Catalog } from './types';

const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'î', o: 'ö', u: 'ü', c: 'ç', n: 'ñ',
  A: 'Á', E: 'É', I: 'Î', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ',
};

const OPEN = '\uE000';
const CLOSE = '\uE001';
const ENCLOSED = /\uE000[^\uE001]*\uE001/g;

function pseudoString(s: string): string {
  const accented = s.replace(/[^\uE000\uE001]+(?=\uE000|$)|^[^\uE000\uE001]+/g, (run) =>
    run.replace(/[aeioucnAEIOUCN]/g, (c) => ACCENTS[c]),
  );
  const len = s.replace(ENCLOSED, (m) => m.slice(1, -1)).length;
  return `[${accented} ${'·'.repeat(Math.ceil(len * 0.35))}]`;
}

/** Transforms strings, wraps function entries, recurses into objects; other values pass through. */
export function pseudoize<T>(value: T): T {
  if (typeof value === 'string') return pseudoString(value) as T;
  if (typeof value === 'function') {
    return ((...args: unknown[]) => {
      const enclosed = args.map((a) => (typeof a === 'string' ? `${OPEN}${a}${CLOSE}` : a));
      const out = (value as (...a: unknown[]) => unknown)(...enclosed);
      return String(pseudoize(out)).replace(/[\uE000\uE001]/g, '');
    }) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pseudoize(v)])) as T;
  }
  return value;
}

let memo: Catalog | undefined;

export function pseudoCatalog(): Catalog {
  return (memo ??= pseudoize(en));
}
