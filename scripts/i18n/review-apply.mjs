// node scripts/i18n/review-apply.mjs <csv> [--signed]
// Writes a reviewer's verdicts into the translation lock; the only caller of markReviewed (spec § 7.3).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { markReviewed, readCatalog, stamp, writeLock } from './lock-core.mjs';

const ROOT = fileURLToPath(new URL('../../src/i18n', import.meta.url));
const LOCALES = ['en', 'es', 'de'];

// RFC 4180 subset: quoted cells with doubled quotes and embedded newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur || row.length) rows.push([...row, cur]);
  return rows.filter((r) => r.some((c) => c !== ''));
}

// A csv cell may hold a line break; a single-quoted literal may not.
const literal = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;

export function applyReview(csv, { root = ROOT, lock, signed = false }) {
  const [header, ...body] = parseCsv(csv);
  const rows = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
  const todo = rows.filter((r) => r.verdict !== '');
  for (const r of todo) {
    if (r.verdict !== 'correct' && r.verdict !== 'correction') throw new Error(`${r.key}:${r.locale}: unknown verdict "${r.verdict}"`);
    if (signed && r.locale !== 'es') throw new Error(`--signed takes es rows only, not ${r.key}:${r.locale}`);
  }
  const read = () => Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l, root)]));
  const setAside = [];
  const manual = [];
  let cats = read();
  for (const r of todo) {
    const id = `${r.key}:${r.locale}`;
    if (r.sourceHash !== cats.en.get(r.key)?.hash) {
      setAside.push(id);
      continue;
    }
    if (r.verdict === 'correction') {
      const entry = cats[r.locale].get(r.key);
      if (entry.isFunction) {
        manual.push(id);
        continue;
      }
      const src = readFileSync(entry.file, 'utf8');
      writeFileSync(entry.file, src.slice(0, entry.span[0]) + literal(r.correction) + src.slice(entry.span[1]));
      cats = read();
      lock = stamp(lock, cats, r.key);
    }
    lock = markReviewed(lock, cats, r.key, r.locale, r.reviewer, r.date, signed ? { signed: true } : {});
  }
  return { lock, setAside, manual };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('usage: review-apply.mjs <csv> [--signed]');
    process.exit(2);
  }
  const path = join(ROOT, 'lock.json');
  const result = applyReview(readFileSync(file, 'utf8'), { lock: JSON.parse(readFileSync(path, 'utf8')), signed: process.argv.includes('--signed') });
  writeLock(path, result.lock);
  console.log(`Set aside (source changed) (${result.setAside.length})`);
  for (const id of result.setAside) console.log(`  ${id}`);
  console.log(`Corrections to make by hand (${result.manual.length})`);
  for (const id of result.manual) console.log(`  ${id}`);
}
