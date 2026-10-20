import { getLocale, type Locale } from './locale';

export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

const formatters = new Map<string, Intl.NumberFormat>();

function cached(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let nf = formatters.get(key);
  if (!nf) {
    nf = make();
    formatters.set(key, nf);
  }
  return nf;
}

/** Fixed decimals, never grouped; `trim` drops trailing zeros. Non-finite values print as String(value). */
export function formatNumber(
  value: number,
  opts: { decimals: number; trim?: boolean },
  locale: Locale = getLocale(),
): string {
  if (!Number.isFinite(value)) return String(value);
  const min = opts.trim ? 0 : opts.decimals;
  const max = opts.decimals;
  return cached(
    `${locale}|${min}|${max}`,
    () =>
      new Intl.NumberFormat(locale, {
        useGrouping: false,
        minimumFractionDigits: min,
        maximumFractionDigits: max,
        // The ES2020 lib lacks signDisplay 'negative' (no sign on negative zero), hence the cast.
        signDisplay: 'negative' as string,
      } as Intl.NumberFormatOptions),
  ).format(value);
}

/** An integer count with the locale's own grouping. Non-finite values print as String(n). */
export function formatCount(n: number, locale: Locale = getLocale()): string {
  if (!Number.isFinite(n)) return String(n);
  return cached(`${locale}|count`, () => new Intl.NumberFormat(locale)).format(n);
}

// Same grammar as parseMedida.ts: ASCII or U+2212 minus, digits, at most one . or , with digits after it.
const NUMBER = /^[-−]?\d+(?:[.,]\d+)?$/;

/** Text typed by the user to a number: "12,5" and "12.5" both give 12.5; anything else gives null. */
export function parseNumber(text: string, opts?: { suffix?: string | readonly string[] }): number | null {
  let t = text.trim();
  const suffixes = opts?.suffix === undefined ? [] : ([] as string[]).concat(opts.suffix);
  // Longest first, so ['m', 'mm'] strips 'mm' from "12mm".
  const suffix = suffixes.sort((x, y) => y.length - x.length).find((s) => s !== '' && t.endsWith(s));
  if (suffix !== undefined) t = t.slice(0, -suffix.length).trimEnd();
  if (!NUMBER.test(t)) return null;
  return Number(t.replace('−', '-').replace(',', '.'));
}

/** Machine output (files, protocols): always a dot, whatever the locale. */
export function toMachine(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

type Helpers = {
  num: (x: number, decimals: number, opts?: { trim?: boolean }) => string;
  plural: (n: number, forms: PluralForms) => string;
};

const helperCache = new Map<Locale, Helpers>();

export function helpers(locale: Locale): Helpers {
  let h = helperCache.get(locale);
  if (!h) {
    const rules = new Intl.PluralRules(locale);
    h = {
      num: (x, decimals, opts) => formatNumber(x, { decimals, trim: opts?.trim }, locale),
      plural: (n, forms) => forms[rules.select(n)] ?? forms.other,
    };
    helperCache.set(locale, h);
  }
  return h;
}
