// npm run i18n:lock [-- --stamp <area|key> [--reason "<why>"]] [-- --launch]
// Reports the lock state per area and locale; writes src/i18n/lock.json only with --stamp (spec § 7.3).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { lockStatus, readCatalog, stamp, writeLock } from './lock-core.mjs';

const LOCK = fileURLToPath(new URL('../../src/i18n/lock.json', import.meta.url));
const LOCALE_TS = fileURLToPath(new URL('../../src/i18n/locale.ts', import.meta.url));
const DOC =
  'The translation lock: for each catalog key and language, the hash of the entry as written, of the English it was written against, and its review. ' +
  'It is written by `npm run i18n:lock -- --stamp` and by the review-apply step (spec § 7.3), never by hand.';
const LOCALES = ['en', 'es', 'de'];

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : (args[i + 1] ?? '');
};

function shippedLocales() {
  const sf = ts.createSourceFile(LOCALE_TS, readFileSync(LOCALE_TS, 'utf8'), ts.ScriptTarget.Latest, true);
  const consts = new Map();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) consts.set(d.name.getText(sf), d.initializer);
  }
  let init = consts.get('SHIPPED_LOCALES');
  const strip = (n) => {
    while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n))) n = n.expression;
    return n;
  };
  init = strip(init);
  if (init && ts.isIdentifier(init)) init = strip(consts.get(init.text));
  if (!init || !ts.isArrayLiteralExpression(init)) throw new Error('cannot read SHIPPED_LOCALES from src/i18n/locale.ts');
  return init.elements.map((e) => e.text);
}

const catalogs = Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l)]));
let lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { entries: {} };
lock._doc = DOC;

const target = flag('--stamp');
if (target !== undefined) {
  if (!target || target.startsWith('--')) {
    console.error('usage: --stamp <area|key> [--reason "<why>"]');
    process.exit(2);
  }
  try {
    lock = stamp(lock, catalogs, target, { reason: flag('--reason') });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  writeLock(LOCK, lock);
}

const status = lockStatus(lock, catalogs);
const STATES = ['ok', 'unstamped', 'untranslated', 'stale', 'unreviewed'];
const rows = new Map();
for (const { key, locale, state } of status) {
  const id = `${key.split('.')[0]} ${locale}`;
  const row = rows.get(id) ?? Object.fromEntries(STATES.map((s) => [s, 0]));
  row[state]++;
  rows.set(id, row);
}
for (const [id, row] of rows) console.log(`${id.padEnd(16)}${STATES.map((s) => `${s} ${row[s]}`).join('  ')}`);

const launch = args.includes('--launch');
const shipped = launch ? new Set(shippedLocales()) : new Set();
const bad = status.some(
  (s) => ['unstamped', 'untranslated', 'stale'].includes(s.state) || (launch && s.state === 'unreviewed' && shipped.has(s.locale)),
);
process.exit(bad ? 1 : 0);
