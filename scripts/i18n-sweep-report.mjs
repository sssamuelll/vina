// Counts Spanish left in the repository's own language (comments, test titles, exported
// identifiers, file names) against a ceiling. Scope, exceptions and baseline resolve from the
// working directory, so a test can run it in a temporary tree.
//   node scripts/i18n-sweep-report.mjs [--update]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const STOP = new Set('de la que el los las por para con una del sin pero cuando hasta desde sobre entre porque también'.split(' '));
const CATEGORIES = ['comments', 'testTitles', 'exportedIdentifiers', 'fileNames'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'pkg']);

export function spanishScore(text) {
  if (/[áéíóúñü¿¡]/i.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.filter((w) => STOP.has(w)).length >= 2;
}

const splitWords = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_.\d]+/g, ' ').trim();

function* walk(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(root, p);
    else if (e.isFile()) yield p;
  }
}

function scopeFiles(root) {
  const files = [];
  for (const dir of ['src', 'tests', 'scripts', 'eslint-rules', '.husky', 'bench']) {
    for (const f of walk(root, dir)) if (!f.startsWith('.husky/_/')) files.push({ f, rust: false });
  }
  const crates = join(root, 'crates');
  if (existsSync(crates)) {
    for (const c of readdirSync(crates, { withFileTypes: true })) {
      if (c.isDirectory()) for (const f of walk(root, `crates/${c.name}/src`)) files.push({ f, rust: true });
    }
  }
  return files;
}

// Comment texts of a source file. A small scanner, not a parser: strings are skipped so `//` inside
// a URL string does not open a comment. Regex literals can fool it; that costs a miscount, not a crash.
function commentsOf(text, ext) {
  const out = [];
  if (ext === 'sh') {
    for (const line of text.split(/\r?\n/)) {
      const m = /(?:^|\s)#(?!!)(.*)$/.exec(line);
      if (m) out.push(m[1]);
    }
    return out;
  }
  const lineComments = ext !== 'css';
  const quotes = ext === 'rs' || ext === 'css' ? '"' : '\'"\x60';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quotes.includes(c)) {
      i++;
      // Only a template spans lines: a quote that a regex or a JSX apostrophe opened ends at the line.
      while (i < text.length && text[i] !== c && (c === '\x60' || text[i] !== '\n')) i += text[i] === '\\' ? 2 : 1;
      i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      out.push(text.slice(i + 2, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end + 2;
    } else if (lineComments && c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      out.push(text.slice(i + 2, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end;
    } else i++;
  }
  return out;
}

const TITLE = /\b(?:describe|it|test)(?:\.(?:each|skip|only|todo|concurrent|sequential|fails))*(?:\([^)]*\))?\s*\(\s*(['"\x60])((?:\\.|(?!\1).)*)\1/g;
const EXPORT = /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

function persistedIdentifiers(root) {
  const file = join(root, 'scripts', 'persisted-surface-baseline.json');
  if (!existsSync(file)) return [];
  const b = JSON.parse(readFileSync(file, 'utf8'));
  const names = [...(b.storageKeys ?? []), ...(b.zodKeys ?? []), ...(b.actionTypes ?? []), ...(b.projectPaths ?? []).map((p) => p.split('.').pop())];
  return names.filter((n) => typeof n === 'string');
}

export function sweep(root = process.cwd()) {
  const exFile = join(root, 'scripts', 'i18n-sweep-exceptions.json');
  const entries = existsSync(exFile) ? JSON.parse(readFileSync(exFile, 'utf8')) : [];
  const paths = entries.filter((e) => e.includes('/'));
  const idents = new Set([...entries.filter((e) => !e.includes('/')), ...persistedIdentifiers(root)]);
  // A path exception is a file or a directory prefix; a trailing `/**` reads as the directory.
  const prefixes = paths.map((e) => e.replace(/\/(?:\*\*)?$/, ''));
  const excepted = (f) => prefixes.some((p) => f === p || f.startsWith(p + '/'));

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const { f, rust } of scopeFiles(root)) {
    if (excepted(f)) continue;
    const ext = f.includes('.') && !f.startsWith('.husky/') ? f.split('.').pop() : f.startsWith('.husky/') ? 'sh' : '';
    const isCode = ['ts', 'tsx', 'js', 'mjs', 'cjs', 'css', 'sh', 'rs'].includes(ext);
    if (!rust && spanishScore(splitWords(basename(f).split('.')[0]))) counts.fileNames++;
    if (!isCode) continue;
    const text = readFileSync(join(root, f), 'utf8');
    for (const c of commentsOf(text, ext)) if (spanishScore(c)) counts.comments++;
    if (rust || !/^(?:ts|tsx|js|mjs|cjs)$/.test(ext)) continue;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f)) {
      for (const m of text.matchAll(TITLE)) if (spanishScore(m[2])) counts.testTitles++;
    }
    for (const m of text.matchAll(EXPORT)) if (!idents.has(m[1]) && spanishScore(splitWords(m[1]))) counts.exportedIdentifiers++;
  }
  return counts;
}

function main() {
  const root = process.cwd();
  const file = join(root, 'scripts', 'i18n-sweep-baseline.json');
  const baseline = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const counts = sweep(root);

  if (process.argv.includes('--update')) {
    const creating = CATEGORIES.every((c) => baseline[c] === undefined);
    for (const c of CATEGORIES) if (creating || counts[c] < (baseline[c] ?? Infinity)) baseline[c] = counts[c];
    writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n');
  }

  let rose = false;
  for (const c of CATEGORIES) {
    const ceiling = baseline[c] ?? 0;
    const over = counts[c] > ceiling;
    rose ||= over;
    console.log(`${over ? '✗' : '✓'} ${c}: ${counts[c]} (ceiling ${ceiling})`);
  }
  if (rose) console.error('Spanish rose above the baseline in the repository language.');
  process.exit(rose ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
