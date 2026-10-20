#!/usr/bin/env node
/**
 * bundle-ceiling — gzip ceiling for what every person downloads at boot.
 *
 *   node scripts/bundle-ceiling.mjs --measure dist/assets/app-*.js   writes bundle-ceiling.json
 *   node scripts/bundle-ceiling.mjs --check   dist/assets/app-*.js   exits 1 past the ceiling
 *
 * The `app` entry is only the loader: main.tsx imports ./bootstrap dynamically, and the
 * catalogs land in that chunk. So the boot size is the entry plus the bootstrap chunk it names.
 * The ceiling leaves room for every person-facing string to appear in three more languages:
 * bootGzip + 3 * stringsGzip + margin.
 */
// ponytail: one bundle for all catalogs; past this ceiling or at a fifth language, split catalogs per locale with a dynamic import (spec § 5.8)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { collectCandidates } from './i18n/string-census.mjs';

const JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), 'bundle-ceiling.json');
const BASE = '473c1772';
const MARGIN_BYTES = 20480;

const [mode, bundle] = process.argv.slice(2);
if (!['--measure', '--check'].includes(mode) || !bundle) {
  console.error('usage: bundle-ceiling.mjs --measure|--check <bundle>');
  process.exit(2);
}
const entry = readFileSync(bundle);
const boot = /import\("\.\/(bootstrap-[^"]+\.js)"\)/.exec(entry.toString('utf8'))?.[1];
if (!boot) {
  console.error(`✗ ${bundle} does not import a bootstrap-*.js chunk; the ceiling no longer measures the catalogs`);
  process.exit(1);
}
const bootGzip = gzipSync(entry).length + gzipSync(readFileSync(join(dirname(bundle), boot))).length;

if (mode === '--measure') {
  const texts = collectCandidates().filter((c) => !c.modelFacing).map((c) => c.text);
  const stringsGzip = gzipSync(texts.join('\n')).length;
  const ceiling = bootGzip + 3 * stringsGzip + MARGIN_BYTES;
  writeFileSync(JSON_PATH, JSON.stringify({ base: BASE, bootGzip, stringsGzip, marginBytes: MARGIN_BYTES, ceiling }, null, 2) + '\n');
  console.log(`bootGzip ${bootGzip}, stringsGzip ${stringsGzip}, ceiling ${ceiling}`);
} else {
  const { ceiling } = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  if (bootGzip > ceiling) {
    console.error(`✗ boot gzip ${bootGzip} B (entry + ${boot}) passes the ceiling ${ceiling} B (scripts/bundle-ceiling.json)`);
    process.exit(1);
  }
  console.log(`✓ boot gzip ${bootGzip} B, ceiling ${ceiling} B`);
}
