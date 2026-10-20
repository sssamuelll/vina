import { beforeEach, describe, expect, it } from 'vitest';
import { formatCount, formatNumber, helpers, parseNumber, toMachine } from '../format';
import { __resetLocaleForTests, type Locale } from '../locale';

const LOCALES: readonly Locale[] = ['en', 'es', 'de'];
const comma = (s: string, locale: Locale) => (locale === 'en' ? s : s.replace('.', ','));

// Values with at most three decimals, all below 1e21, and their negatives.
const MAGNITUDES = [
  0, 1, 7, 10, 199, 1234, 98765, 0.001, 0.009, 0.01, 0.1, 0.25, 0.5, 0.75, 0.999, 1.1, 1.23, 1.234, 2.675, 9.99,
  12.345, 19.995, 99.999, 100.05, 199.5, 250.125, 1000.001, 12345.678,
];
const GRID = MAGNITUDES.flatMap((x) => (x === 0 ? [0] : [x, -x]));

// The three classes of deliberate difference from toFixed (spec § 8.2).
function isDecimalTie(x: number, n: number): boolean {
  if (n >= 3) return false;
  const thousandths = Math.round(Math.abs(x) * 1000);
  const below = 10 ** (3 - n);
  return thousandths % below === below / 2;
}
const roundsToNegativeZero = (x: number, n: number) => x < 0 && Number(Math.abs(x).toFixed(n)) === 0;
const parityCases = GRID.flatMap((x) =>
  [0, 1, 2, 3].filter((n) => !isDecimalTie(x, n) && !roundsToNegativeZero(x, n)).map((n) => [x, n] as const),
);

beforeEach(() => {
  __resetLocaleForTests('en');
});

describe('formatNumber', () => {
  it('the grid leaves out the three classes and still holds hundreds of cases', () => {
    expect(isDecimalTie(1.005, 2)).toBe(true);
    expect(isDecimalTie(1.45, 1)).toBe(true);
    expect(roundsToNegativeZero(-0.04, 1)).toBe(true);
    expect(parityCases.length).toBeGreaterThan(150);
  });

  it.each(LOCALES)('%s equals toFixed over the grid, with a comma in es and de', (locale) => {
    for (const [x, n] of parityCases) {
      expect(formatNumber(x, { decimals: n }, locale), `${x} at ${n}`).toBe(comma(x.toFixed(n), locale));
    }
  });

  it.each(LOCALES)('%s named differences: decimal ties round half away, negative zero drops its sign', (locale) => {
    expect(formatNumber(1.005, { decimals: 2 }, locale)).toBe(comma('1.01', locale));
    expect(formatNumber(1.45, { decimals: 1 }, locale)).toBe(comma('1.5', locale));
    expect(formatNumber(-0.04, { decimals: 1 }, locale)).toBe(comma('0.0', locale));
  });

  it.each(LOCALES)('%s prints non-finite values as String(value)', (locale) => {
    expect(formatNumber(NaN, { decimals: 1 }, locale)).toBe('NaN');
    expect(formatNumber(Infinity, { decimals: 1 }, locale)).toBe('Infinity');
    expect(formatNumber(-Infinity, { decimals: 1 }, locale)).toBe('-Infinity');
  });

  it('never groups digits', () => {
    expect(formatNumber(12345.678, { decimals: 1 }, 'de')).toBe('12345,7');
    expect(formatNumber(98765, { decimals: 0 }, 'en')).toBe('98765');
  });

  it('trim drops trailing zeros, as formatMedida does today', () => {
    expect(formatNumber(12, { decimals: 1, trim: true }, 'es')).toBe('12');
    expect(formatNumber(12.5, { decimals: 1, trim: true }, 'es')).toBe('12,5');
    expect(formatNumber(213.5, { decimals: 1, trim: true }, 'es')).toBe('213,5');
    expect(formatNumber(213.54, { decimals: 1, trim: true }, 'es')).toBe('213,5');
    expect(formatNumber(299.96, { decimals: 1, trim: true }, 'es')).toBe('300');
    expect(formatNumber(12.5, { decimals: 2, trim: true }, 'en')).toBe('12.5');
  });

  it('reads the active locale when none is given', () => {
    __resetLocaleForTests('es');
    expect(formatNumber(1.5, { decimals: 1 })).toBe('1,5');
    __resetLocaleForTests('de');
    expect(formatNumber(1.5, { decimals: 2 })).toBe('1,50');
  });
});

describe('formatCount', () => {
  it('uses each locale grouping', () => {
    expect(formatCount(29338, 'es')).toBe('29.338');
    expect(formatCount(29338, 'de')).toBe('29.338');
    expect(formatCount(29338, 'en')).toBe('29,338');
    expect(formatCount(1200, 'es')).toBe('1200');
    expect(formatCount(1200, 'de')).toBe('1.200');
  });
});

describe('parseNumber', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['−12,5', -12.5],
    ['-12,5', -12.5],
    ['1.500', 1.5],
    ['1,500', 1.5],
    ['300', 300],
    ['0', 0],
  ])('%j gives %d', (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each(['1.250,50', '1,250.50', '1e3', '+5', '.5', '12.', '', '   ', '12mm', 'abc', '1,2,3', '--5'])(
    '%j gives null',
    (text) => {
      expect(parseNumber(text)).toBeNull();
    },
  );

  it('strips one trailing suffix after optional spaces, no-break spaces included', () => {
    expect(parseNumber('12 mm', { suffix: 'mm' })).toBe(12);
    expect(parseNumber('12mm', { suffix: 'mm' })).toBe(12);
    expect(parseNumber(' 12,5 mm', { suffix: 'mm' })).toBe(12.5);
    expect(parseNumber('90°', { suffix: ['mm', '°'] })).toBe(90);
    expect(parseNumber('12', { suffix: 'mm' })).toBe(12);
    expect(parseNumber('12 cm', { suffix: 'mm' })).toBeNull();
    expect(parseNumber('12 mm mm', { suffix: 'mm' })).toBeNull();
  });

  it.each(LOCALES)('%s round-trips formatNumber, with and without trim', (locale) => {
    for (const [x, d] of parityCases) {
      const rounded = Number(x.toFixed(d));
      expect(parseNumber(formatNumber(x, { decimals: d }, locale)), `${x} at ${d}`).toBe(rounded);
      expect(parseNumber(formatNumber(x, { decimals: d, trim: true }, locale)), `${x} at ${d}, trim`).toBe(rounded);
    }
  });
});

describe('toMachine and helpers', () => {
  it('toMachine is toFixed whatever the locale', () => {
    __resetLocaleForTests('de');
    expect(toMachine(1.005, 2)).toBe('1.00');
    expect(toMachine(12.5, 1)).toBe('12.5');
  });

  it('helpers are bound to their locale, not the active one', () => {
    __resetLocaleForTests('en');
    expect(helpers('de').num(12.3456, 1)).toBe('12,3');
    expect(helpers('es').num(12, 1, { trim: true })).toBe('12');
    expect(helpers('en').num(12.3456, 3)).toBe('12.346');
  });

  it('plural picks the CLDR form and falls back to other', () => {
    expect(helpers('es').plural(1_000_000, { one: 'a', other: 'b' })).toBe('b');
    expect(helpers('en').plural(1, { one: 'a', other: 'b' })).toBe('a');
    expect(helpers('de').plural(0, { one: 'a', other: 'b' })).toBe('b');
    expect(helpers('es').plural(1, { one: 'a', other: 'b' })).toBe('a');
  });
});
