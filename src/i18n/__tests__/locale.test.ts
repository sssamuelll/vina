// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LocaleModule = typeof import('../locale');

// A fresh module per test: the locale and safeStorage's memory fallback are module state.
async function load(): Promise<LocaleModule> {
  vi.resetModules();
  return import('../locale');
}

const KEY = 'vina-locale';

function env(over: Partial<{ search: string; hash: string; languages: string[]; allowPseudo: boolean }> = {}) {
  const replaceUrl = vi.fn<(search: string) => void>();
  return { search: '', hash: '', languages: ['en-US'], allowPseudo: true, replaceUrl, ...over };
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/app/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('module surface', () => {
  it('names each language in itself and supports all three outside the launch build', async () => {
    const m = await load();
    expect(m.ALL_LOCALES).toEqual(['en', 'es', 'de']);
    expect(m.LANGUAGE_NAMES).toEqual({ en: 'English', es: 'Español', de: 'Deutsch' });
    expect(m.LOCALE_STORAGE_KEY).toBe(KEY);
    expect(m.supportedLocales()).toEqual(['en', 'es', 'de']);
    expect(m.isLocale('de')).toBe(true);
    expect(m.isLocale('pseudo')).toBe(false);
    expect(m.isLocale('DE')).toBe(false);
  });

  it('starts in en before detection', async () => {
    const m = await load();
    expect(m.getLocale()).toBe('en');
    expect(m.isPseudo()).toBe(false);
  });
});

describe('detectLocale(), precedence (spec § 5.4)', () => {
  it('?lang=de is persisted, removed from the URL, and overrides a stored es', async () => {
    localStorage.setItem(KEY, 'es');
    const m = await load();
    const e = env({ search: '?lang=de' });
    expect(m.detectLocale(e)).toBe('de');
    expect(m.getLocale()).toBe('de');
    expect(localStorage.getItem(KEY)).toBe('de');
    expect(e.replaceUrl).toHaveBeenCalledWith('');
  });

  it('?lang=xx is only removed', async () => {
    localStorage.setItem(KEY, 'es');
    const m = await load();
    const e = env({ search: '?lang=xx' });
    expect(m.detectLocale(e)).toBe('es');
    expect(localStorage.getItem(KEY)).toBe('es');
    expect(e.replaceUrl).toHaveBeenCalledWith('');
  });

  it('a stored es is used over the browser languages', async () => {
    localStorage.setItem(KEY, 'es');
    const m = await load();
    const e = env({ languages: ['de-DE'] });
    expect(m.detectLocale(e)).toBe('es');
    expect(e.replaceUrl).not.toHaveBeenCalled();
  });

  it.each(['zz', 'pseudo', ''])('a stored %j is ignored and replaced by the detected locale', async (stored) => {
    localStorage.setItem(KEY, stored);
    const m = await load();
    expect(m.detectLocale(env({ languages: ['de-DE'] }))).toBe('de');
    expect(localStorage.getItem(KEY)).toBe('de');
  });

  it.each(['vina-autosave', 'vina_skills_v1', 'openclo-x'])(
    'first boot: with %s and no vina-locale, an en-US browser gets es, persisted',
    async (legacyKey) => {
      localStorage.setItem(legacyKey, '{}');
      const m = await load();
      expect(m.detectLocale(env({ languages: ['en-US'] }))).toBe('es');
      expect(localStorage.getItem(KEY)).toBe('es');
    },
  );

  it('a new visitor keeps the first detected language on the second visit', async () => {
    let m = await load();
    expect(m.detectLocale(env({ languages: ['en-US'] }))).toBe('en');
    expect(localStorage.getItem(KEY)).toBe('en');
    // The first session writes vina-prefixed keys; the second boot must not read it as a pre-i18n install.
    localStorage.setItem('vina-foo', '1');
    m = await load();
    expect(m.detectLocale(env({ languages: ['en-US'] }))).toBe('en');
  });

  it.each([
    [['es-VE'], 'es'],
    [['de-AT'], 'de'],
    [['en-GB'], 'en'],
    [['fr-FR'], 'en'],
    [['fr-FR', 'de-DE'], 'de'],
    [[], 'en'],
  ] as const)('browser languages %j give %s, persisted', async (languages, expected) => {
    const m = await load();
    expect(m.detectLocale(env({ languages: [...languages] }))).toBe(expected);
    expect(localStorage.getItem(KEY)).toBe(expected);
  });
});

describe('detectLocale(), review focus', () => {
  it('storage unavailable: detection still answers and setLocale does not throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = await load();
    expect(m.detectLocale(env({ languages: ['de-DE'] }))).toBe('de');
    expect(() => m.setLocale('es')).not.toThrow();
    expect(m.getLocale()).toBe('es');
  });

  it.each(['?lang=DE', '?lang=de-AT', '?lang='])('%s is removed and not applied', async (search) => {
    const m = await load();
    const e = env({ search, languages: ['en-US'] });
    expect(m.detectLocale(e)).toBe('en');
    expect(e.replaceUrl).toHaveBeenCalledWith('');
  });

  it('strips lang and keeps the other parameters', async () => {
    const m = await load();
    const e = env({ search: '?foo=1&lang=de', hash: '#x' });
    expect(m.detectLocale(e)).toBe('de');
    expect(e.replaceUrl).toHaveBeenCalledWith('?foo=1');
  });

  it('the default environment reads window.location and keeps path and hash', async () => {
    history.replaceState(null, '', '/app/?foo=1&lang=de#x');
    const m = await load();
    expect(m.detectLocale({ languages: ['en-US'] })).toBe('de');
    expect(location.pathname).toBe('/app/');
    expect(location.search).toBe('?foo=1');
    expect(location.hash).toBe('#x');
  });

  it('pseudo only in development: ?locale=pseudo is a session override that writes nothing', async () => {
    const m = await load();
    m.detectLocale(env({ search: '?locale=pseudo', languages: ['es-VE'], allowPseudo: true }));
    expect(m.isPseudo()).toBe(true);
    expect(m.getLocale()).toBe('en');
    expect(m.getLocaleSnapshot()).toBe('pseudo');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('?locale=pseudo is ignored when pseudo is not allowed', async () => {
    const m = await load();
    expect(m.detectLocale(env({ search: '?locale=pseudo', languages: ['es-VE'], allowPseudo: false }))).toBe('es');
    expect(m.isPseudo()).toBe(false);
    expect(m.getLocaleSnapshot()).toBe('es');
  });
});

describe('setLocale and subscribe', () => {
  it('persists, notifies once per change, and unsubscribes', async () => {
    const m = await load();
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);
    m.setLocale('de');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).toBe('de');
    m.setLocale('de');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    m.setLocale('es');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(m.getLocaleSnapshot()).toBe('es');
  });

  it('__resetLocaleForTests sets the locale without writing storage and clears pseudo', async () => {
    const m = await load();
    m.detectLocale(env({ search: '?locale=pseudo', allowPseudo: true }));
    m.__resetLocaleForTests('de');
    expect(m.getLocale()).toBe('de');
    expect(m.isPseudo()).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
