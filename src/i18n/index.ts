import { useSyncExternalStore } from 'react';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { getLocale, getLocaleSnapshot, isPseudo, subscribe, type Locale } from './locale';
import { pseudoCatalog } from './pseudo';
import type { Catalog } from './types';

export const catalogs: Record<Locale, Catalog> = { en, es, de };

export function t(): Catalog {
  return isPseudo() ? pseudoCatalog() : catalogs[getLocale()];
}

/** The active catalog; re-renders on a language or pseudo-locale change. */
export function useT(): Catalog {
  useSyncExternalStore(subscribe, getLocaleSnapshot);
  return t();
}
