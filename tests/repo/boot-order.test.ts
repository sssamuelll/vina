import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('boot order (spec § 5.4)', () => {
  const main = withoutComments(readFileSync('src/main.tsx', 'utf8'));

  it('main.tsx statically imports only the migration and locale.ts', () => {
    const imports = [...main.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./i18n/locale', './utils/renameMigration']);
  });

  it('detects the locale before the rename migration writes its first vina- key', () => {
    const detect = main.indexOf('detectLocale()');
    expect(detect).toBeGreaterThan(-1);
    expect(detect).toBeLessThan(main.indexOf('migrateFromOpenClo('));
  });

  it('app/index.html carries the English title and asks browsers not to translate', () => {
    const html = readFileSync('app/index.html', 'utf8');
    expect(html).toContain('<title>Vina — Pattern making and 3D simulation</title>');
    expect(html).toMatch(/<meta\s+name="google"\s+content="notranslate"\s*\/?>/);
    expect(html).toMatch(/<html[^>]*\blang="en"/);
  });

  it('tool IDs in the chat are marked as untranslated English', () => {
    expect(readFileSync('src/components/shell/UnifiedBarChat.tsx', 'utf8')).toMatch(/lang="en"\s+translate="no"/);
  });
});
