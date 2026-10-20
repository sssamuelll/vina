import { beforeEach, describe, expect, it } from 'vitest';
import { helpers } from '../format';
import { catalogs, t } from '../index';
import { __resetLocaleForTests, ALL_LOCALES } from '../locale';
import { checkEntryParams } from './paramCheck';

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return { [prefix]: value };
  return Object.entries(value).reduce<Record<string, unknown>>(
    (acc, [k, v]) => ({ ...acc, ...flatten(v, prefix ? `${prefix}.${k}` : k) }),
    {},
  );
}

beforeEach(() => {
  __resetLocaleForTests('es');
});

describe('catalogs', () => {
  it('es and de have exactly the keys of en', () => {
    const en = Object.keys(flatten(catalogs.en)).sort();
    expect(en.length).toBeGreaterThan(0);
    expect(Object.keys(flatten(catalogs.es)).sort()).toEqual(en);
    expect(Object.keys(flatten(catalogs.de)).sort()).toEqual(en);
  });

  it('holds the phase 0 values', () => {
    expect(flatten(catalogs.en)).toEqual({
      'app.title': 'Vina — Pattern making and 3D simulation',
      'keys.space': 'Space',
      'keys.backspace': 'Backspace',
      'keys.delete': 'Delete',
      'keys.escape': 'Esc',
      'keys.ctrl': 'Ctrl',
      'keys.shift': 'Shift',
      'keys.alt': 'Alt',
    });
    expect(flatten(catalogs.es)).toEqual({
      'app.title': 'Vina — Patronaje y simulación 3D',
      'keys.space': 'Espacio',
      'keys.backspace': 'Retroceso',
      'keys.delete': 'Supr',
      'keys.escape': 'Esc',
      'keys.ctrl': 'Ctrl',
      'keys.shift': 'Shift',
      'keys.alt': 'Alt',
    });
    expect(flatten(catalogs.de)).toEqual({
      'app.title': 'Vina — Schnittkonstruktion und 3D-Simulation',
      'keys.space': 'Leertaste',
      'keys.backspace': 'Rücktaste',
      'keys.delete': 'Entf',
      'keys.escape': 'Esc',
      'keys.ctrl': 'Strg',
      'keys.shift': 'Umschalt',
      'keys.alt': 'Alt',
    });
  });

  it('t() reads the active locale at call time', () => {
    expect(t()).toBe(catalogs.es);
    __resetLocaleForTests('de');
    expect(t()).toBe(catalogs.de);
  });
});

describe('catalog parameter check', () => {
  const { num } = helpers('de');

  it('catches a number parameter the entry drops', () => {
    expect(checkEntryParams(() => 'Differenz', 'de', ['number'])).not.toEqual([]);
  });

  it('catches a number printed raw, which shows a period in German', () => {
    expect(checkEntryParams((mm: number) => `${mm} mm`, 'de', ['number'])).not.toEqual([]);
  });

  it('catches toFixed, whose 12.3 is not a German form even though 12 is', () => {
    expect(checkEntryParams((mm: number) => `${mm.toFixed(1)} mm`, 'de', ['number'])).not.toEqual([]);
  });

  it('passes a number formatted with the locale helper', () => {
    expect(checkEntryParams((mm: number) => `${num(mm, 1)} mm Differenz`, 'de', ['number'])).toEqual([]);
  });

  it('catches a dropped text parameter and passes a kept one', () => {
    expect(checkEntryParams(() => 'Delete', 'en', ['string'])).not.toEqual([]);
    expect(checkEntryParams((name: string) => `Delete ${name}`, 'en', ['string'])).toEqual([]);
  });

  it('checks a count at 5, 1 and 0', () => {
    const { plural } = helpers('en');
    const selected = (n: number) => plural(n, { one: '1 piece selected', other: `${n} pieces selected` });
    expect(checkEntryParams(selected, 'en', ['count'])).toEqual([]);
    expect(checkEntryParams(() => 'some pieces selected', 'en', ['count'])).not.toEqual([]);
  });

  it('no real catalog has a function entry yet; the first one must teach this test its parameter kinds', () => {
    const functionEntries = ALL_LOCALES.flatMap((locale) =>
      Object.entries(flatten(catalogs[locale]))
        .filter(([, v]) => typeof v === 'function')
        .map(([k]) => `${locale}:${k}`),
    );
    expect(functionEntries).toEqual([]);
  });
});
