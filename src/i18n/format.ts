import { getLocale, type Locale } from './locale';

export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, options);
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
  // The ES2020 lib lacks signDisplay 'negative' (no sign on negative zero), hence the cast.
  return numberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: opts.trim ? 0 : opts.decimals,
    maximumFractionDigits: opts.decimals,
    signDisplay: 'negative' as string,
  } as Intl.NumberFormatOptions).format(value);
}

/** An integer count with the locale's own grouping. */
export function formatCount(n: number, locale: Locale = getLocale()): string {
  return numberFormat(locale, {}).format(n);
}

// Same grammar as parseMedida.ts: ASCII or U+2212 minus, digits, at most one . or , with digits after it.
const NUMBER = /^[-−]?\d+(?:[.,]\d+)?$/;

/** Text typed by the user to a number: "12,5" and "12.5" both give 12.5; anything else gives null. */
export function parseNumber(text: string, opts?: { suffix?: string | readonly string[] }): number | null {
  let t = text.trim();
  const suffixes = opts?.suffix === undefined ? [] : ([] as string[]).concat(opts.suffix);
  const suffix = suffixes.find((s) => s !== '' && t.endsWith(s));
  if (suffix !== undefined) t = t.slice(0, -suffix.length).trimEnd();
  if (!NUMBER.test(t)) return null;
  return Number(t.replace('−', '-').replace(',', '.'));
}

/** Machine output (files, protocols): always a dot, whatever the locale. */
export function toMachine(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

export function helpers(locale: Locale): {
  num: (x: number, decimals: number, opts?: { trim?: boolean }) => string;
  plural: (n: number, forms: PluralForms) => string;
} {
  const rules = new Intl.PluralRules(locale);
  return {
    num: (x, decimals, opts) => formatNumber(x, { decimals, trim: opts?.trim }, locale),
    plural: (n, forms) => forms[rules.select(n)] ?? forms.other,
  };
}
