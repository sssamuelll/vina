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
  // A spreadsheet saved as UTF-8 csv starts with a byte order mark.
  const [header, ...body] = parseCsv(csv.replace(/^﻿/, ''));
  const rows = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
  const todo = rows.filter((r) => r.verdict !== '');
  for (const r of todo) {
    if (r.verdict !== 'correct' && r.verdict !== 'correction') throw new Error(`${r.key}:${r.locale}: unknown verdict "${r.verdict}"`);
    if (signed && (r.locale !== 'es' || r.verdict !== 'correct')) throw new Error(`--signed takes correct es rows only, not ${r.verdict} ${r.key}:${r.locale}`);
  }
  const read = () => Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l, root)]));
  const setAside = [];
  const manual = [];
  // All or nothing: a row that throws puts back every catalog file already corrected.
  const original = new Map();
  let cats = read();
  try {
    for (const r of todo) {
      const id = `${r.key}:${r.locale}`;
      if (r.sourceHash !== cats.en.get(r.key)?.hash) {
        setAside.push(id);
        continue;
      }
      const entry = cats[r.locale]?.get(r.key);
      if (!entry) throw new Error(`${id}: no such entry in the ${r.locale} catalog`);
      if (r.verdict === 'correction' && r.correction !== entry.text) {
        if (entry.isFunction) {
          manual.push(id);
          continue;
        }
        const src = readFileSync(entry.file, 'utf8');
        if (!original.has(entry.file)) original.set(entry.file, src);
        writeFileSync(entry.file, src.slice(0, entry.span[0]) + literal(r.correction) + src.slice(entry.span[1]));
        cats = read();
        // Only the corrected entry is stamped: a corrected English leaves es and de stale (spec § 7.3).
        lock = stamp(lock, cats, r.key, { locale: r.locale });
        // A correction takes the signed-copy mark from the Spanish (spec § 8.2).
        if (r.locale === 'es') delete lock.entries[r.key].es.signed;
      }
      lock = markReviewed(lock, cats, r.key, r.locale, r.reviewer, r.date, signed ? { signed: true } : {});
    }
  } catch (e) {
    for (const [file, src] of original) writeFileSync(file, src);
    throw e;
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
