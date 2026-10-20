/**
 * Pins the boot-order contract fixed in the 2026-08-01 rename final review
 * (CRITICAL #1): `src/main.tsx` must not statically import anything from the
 * app graph (App/store/etc.) — ES imports are hoisted, so a static import
 * would evaluate the store modules (and their `vina-*` localStorage /IDB
 * reads) BEFORE the migration copies legacy `openclo*` data over. The one
 * other static import is `./i18n/locale` (i18n spec § 5.4), which reads
 * storage only when called.
 *
 * Source-level text assertions on purpose: this contract is about the import
 * graph shape, not runtime behavior a normal unit test can observe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mainSource = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf-8');

// Static `import ... from '...'` / `import '...'` statements (not dynamic import()).
const STATIC_IMPORT_RE = /^import\s.*$/gm;

describe('main.tsx boot order', () => {
  it('has exactly two static import statements', () => {
    const matches = mainSource.match(STATIC_IMPORT_RE) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('they are the rename migration module and the locale module', () => {
    const matches = mainSource.match(STATIC_IMPORT_RE) ?? [];
    expect(matches.some((m) => m.includes("'./utils/renameMigration'"))).toBe(true);
    expect(matches.some((m) => m.includes("'./i18n/locale'"))).toBe(true);
  });

  it('loads the app graph via a dynamic import after migration settles', () => {
    expect(mainSource).toContain("import('./bootstrap')");
  });
});
