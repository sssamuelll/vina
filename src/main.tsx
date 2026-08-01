// One-shot client-data migration OpenClo → Vina must run BEFORE anything in
// the app graph touches storage. ES imports are hoisted: a static `import App
// from './App'` here would pull in `./store` (and other module bodies) that
// read `vina-*` localStorage keys / open the `vina` IDB database at MODULE
// EVAL TIME — i.e. before this file's own top-level statements run. That
// would hydrate empty state from the not-yet-migrated renamed storage, then
// autosave would debounce-overwrite the legacy data still sitting under
// `openclo*` (silent data loss, CRITICAL #1 of the 2026-08-01 rename review).
//
// Fix: this file's ONLY static import is the migration module. Everything
// else (App, store, styles, error tracking, the legacy-fallback-key security
// scrubber, createRoot().render()) lives in ./bootstrap, loaded via a dynamic
// import only after the migration settles — so the app graph never evaluates
// until the renamed storage is actually in place.
import { migrateFromOpenClo } from './utils/renameMigration';

migrateFromOpenClo().finally(() => { void import('./bootstrap'); });
