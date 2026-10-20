// node scripts/i18n/review-doc.mjs [--out <dir>]
// Writes review.html (what a translation reviewer reads) and review.csv (where they record verdicts) (spec § 7.3).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findTerms, parseGlossary } from './glossary-core.mjs';
import { lockStatus, readCatalog } from './lock-core.mjs';

const ROOT = fileURLToPath(new URL('../../src/i18n', import.meta.url));
const GLOSSARY = fileURLToPath(new URL('../../docs/specs/2026-09-29-ui-glossary.md', import.meta.url));
const LOCALES = ['en', 'es', 'de'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

export function buildReview(root = ROOT, lock) {
  const catalogs = Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l, root)]));
  const states = new Map(lockStatus(lock, catalogs).map((s) => [`${s.key}:${s.locale}`, s.state]));
  const terms = existsSync(GLOSSARY) ? parseGlossary(readFileSync(GLOSSARY, 'utf8')).terms : [];
  const keys = [...new Set(LOCALES.flatMap((l) => [...catalogs[l].keys()]))].sort();

  const csv = ['key,locale,sourceHash,verdict,correction,reviewer,date'];
  const areas = new Map();
  for (const key of keys) {
    const sourceHash = catalogs.en.get(key)?.hash ?? '';
    for (const locale of LOCALES) if (catalogs[locale].has(key)) csv.push([key, locale, sourceHash, '', '', '', ''].map(cell).join(','));
    const show = (l) => {
      const e = catalogs[l].get(key);
      if (!e) return '<td></td>';
      return `<td>${e.isFunction ? `<code>${esc(e.text)}</code>` : esc(e.text)}</td>`;
    };
    const en = catalogs.en.get(key);
    const used = en ? findTerms(en.text, terms, 'en').map((t) => t.en.join(' / ')) : [];
    const state = LOCALES.map((l) => `${l}: ${states.get(`${key}:${l}`) ?? '-'}`).join('<br>');
    const area = key.split('.')[0];
    const rows = areas.get(area) ?? [];
    rows.push(
      `<tr><td>${esc(key)}</td>${LOCALES.map(show).join('')}<td>${esc(used.join(', '))}</td><td>${state}</td><td><code>${esc(sourceHash)}</code></td></tr>`,
    );
    areas.set(area, rows);
  }

  const sections = [...areas].map(
    ([area, rows]) =>
      `<h2>${esc(area)}</h2>\n<table><tr><th>key</th><th>en</th><th>es</th><th>de</th><th>glossary terms</th><th>lock</th><th>sourceHash</th></tr>\n${rows.join('\n')}\n</table>`,
  );
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Translation review</title>
<style>body{font:14px/1.4 sans-serif;margin:2rem}table{border-collapse:collapse;margin-bottom:2rem}td,th{border:1px solid #bbb;padding:4px 8px;vertical-align:top;text-align:left}code{font-size:12px;word-break:break-all}</style>
</head><body>
<h1>Translation review</h1>
${sections.join('\n')}
</body></html>
`;
  return { html, csv: csv.join('\n') + '\n' };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--out');
  const out = i < 0 ? '.i18n-review' : process.argv[i + 1];
  const lock = JSON.parse(readFileSync(join(ROOT, 'lock.json'), 'utf8'));
  const { html, csv } = buildReview(ROOT, lock);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'review.html'), html);
  writeFileSync(join(out, 'review.csv'), csv);
  console.log(join(out, 'review.html'));
  console.log(join(out, 'review.csv'));
}
