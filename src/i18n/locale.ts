/**
 * Which interface language the app shows: module state with a subscription (not Redux, spec § 5.4).
 * Imports only safeStorage.ts because src/main.tsx loads it before the app graph.
 */
import { safeGetItem, safeKey, safeSetItem, safeStorageLength } from '../utils/safeStorage';

export const ALL_LOCALES = ['en', 'es', 'de'] as const;
export type Locale = (typeof ALL_LOCALES)[number];

// Narrowed only by the launch build (spec § 1.1 O6).
export const SHIPPED_LOCALES: readonly Locale[] = ALL_LOCALES;

// i18n-ignore: each language named in itself
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', es: 'Español', de: 'Deutsch' };

export const LOCALE_STORAGE_KEY = 'vina-locale';

function allowAll(): boolean {
  const env = import.meta.env as Record<string, unknown>;
  return Boolean(env.DEV) || env.MODE === 'test' || env.VITE_ALL_LOCALES === '1';
}

export function supportedLocales(): readonly Locale[] {
  return allowAll() ? ALL_LOCALES : SHIPPED_LOCALES;
}

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (ALL_LOCALES as readonly string[]).includes(x);
}

function isSupported(x: unknown): x is Locale {
  return isLocale(x) && supportedLocales().includes(x);
}

let current: Locale = 'en';
let pseudo = false;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function isPseudo(): boolean {
  return pseudo;
}

export function getLocaleSnapshot(): Locale | 'pseudo' {
  return pseudo ? 'pseudo' : current;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(locale: Locale, isPseudoOn: boolean): void {
  const changed = locale !== current || isPseudoOn !== pseudo;
  current = locale;
  pseudo = isPseudoOn;
  if (changed) [...listeners].forEach((l) => l());
}

function remember(locale: Locale): void {
  // LS-only: read synchronously before the first render; IndexedDB is async (spec § 5.4)
  safeSetItem(LOCALE_STORAGE_KEY, locale);
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  remember(locale);
  commit(locale, pseudo);
}

export interface DetectEnv {
  search: string;
  hash: string;
  languages: readonly string[];
  replaceUrl: (search: string) => void;
  allowPseudo: boolean;
}

function hasLegacyKey(): boolean {
  for (let i = 0; i < safeStorageLength(); i++) {
    const key = safeKey(i);
    if (key && key !== LOCALE_STORAGE_KEY && /^(vina[-_]|openclo)/.test(key)) return true;
  }
  return false;
}

function fromLanguages(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.split('-')[0].toLowerCase();
    if (isSupported(primary)) return primary;
  }
  return 'en';
}

export function detectLocale(over: Partial<DetectEnv> = {}): Locale {
  const env: DetectEnv = {
    search: window.location.search,
    hash: window.location.hash,
    languages: navigator.languages,
    replaceUrl: (search) => history.replaceState(null, '', window.location.pathname + search + window.location.hash),
    allowPseudo: allowAll(),
    ...over,
  };
  const params = new URLSearchParams(env.search);

  // Session-only developer override: never remembered, URL untouched.
  if (env.allowPseudo && params.get('locale') === 'pseudo') {
    commit('en', true);
    return 'en';
  }

  const decide = (locale: Locale): Locale => {
    remember(locale);
    commit(locale, false);
    return locale;
  };

  // 1. ?lang=xx: a supported value wins over the stored choice; the parameter is always removed.
  let fromUrl: Locale | null = null;
  if (params.has('lang')) {
    const value = params.get('lang');
    if (isSupported(value)) fromUrl = value;
    params.delete('lang');
    const rest = params.toString();
    env.replaceUrl(rest ? `?${rest}` : '');
  }
  if (fromUrl) return decide(fromUrl);

  // 2. The stored choice, when supported; a corrupt value or 'pseudo' is ignored.
  const stored = safeGetItem(LOCALE_STORAGE_KEY);
  if (isSupported(stored)) {
    commit(stored, false);
    return stored;
  }

  // 3. First-boot rule: an install that predates i18n was Spanish (spec § 1.1 O5).
  if (hasLegacyKey()) return decide('es');

  // 4-5. Browser languages, then en.
  return decide(fromLanguages(env.languages));
}

export function __resetLocaleForTests(locale: Locale = 'en'): void {
  commit(locale, false);
}
