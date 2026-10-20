// The one-shot client-data migration OpenClo -> Vina must run BEFORE anything
// in the app graph touches storage. ES imports are hoisted: a static
// `import App from './App'` here would pull in `./store` (and other modules)
// that read `vina-*` localStorage keys or open the `vina` IndexedDB database
// at MODULE EVAL TIME, before this file's own top-level statements run. That
// would hydrate empty state from the not-yet-migrated storage, and autosave
// would then overwrite the legacy data still sitting under `openclo*` (silent
// data loss, CRITICAL #1 of the 2026-08-01 rename review).
//
// So this file statically imports only the migration module and the locale
// module (which reads storage only when called, never at load). Everything
// else (App, store, styles, error tracking, createRoot().render()) lives in
// ./bootstrap, loaded by a dynamic import once the migration has settled.
//
// Locale detection runs first: its first-boot rule reads whether legacy
// entries exist, and the migration writes a `vina-` marker on every first boot.
import { detectLocale } from './i18n/locale';
import { migrateFromOpenClo } from './utils/renameMigration';

detectLocale();

migrateFromOpenClo().finally(() => { void import('./bootstrap'); });
