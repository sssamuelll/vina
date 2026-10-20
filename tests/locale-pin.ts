import { isLocale, type Locale } from '../src/i18n/locale';

// Every unit test and browser spec runs in one interface language, so the
// Spanish text the existing tests query keeps matching. VINA_TEST_LOCALE
// overrides it to run the suites in another language.
const requested = process.env.VINA_TEST_LOCALE;
export const TEST_LOCALE: Locale = isLocale(requested) ? requested : 'es';

export const TEST_BROWSER_LOCALE = { es: 'es-VE', en: 'en-US', de: 'de-DE' }[TEST_LOCALE];
