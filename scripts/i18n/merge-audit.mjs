// Lists what a merge of main into the i18n branch removed or changed.
// node scripts/i18n/merge-audit.mjs [<merge commit>=HEAD]   (always exits 0)
// ponytail: removed lines are scanned with a regex, so a literal with an escaped quote, split by `+`
// or spanning lines is missed; parse the removed hunks with typescript if a miss ever matters.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const isTest = (p) => /(^|\/)(tests|__tests__)\//.test(p) || /\.(test|spec)\.[^/]+$/.test(p);

// Inside a hook git exports GIT_DIR, GIT_INDEX_FILE and the rest; without this, `cwd` would not
// choose the repository.
const ENV_WITHOUT_GIT = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

export function auditMerge(commit = 'HEAD', cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const lines = (out) => out.split('\n').filter(Boolean);
  const tree = (rev) => new Set(lines(git('ls-tree', '-r', '--name-only', rev)));

  const merged = tree(commit);
  const lost = new Set();
  for (const parent of [`${commit}^1`, `${commit}^2`]) {
    try {
      for (const f of tree(parent)) if (!merged.has(f)) lost.add(f);
    } catch {
      // no such parent: not a merge commit
    }
  }

  // string values of the Spanish catalog at the merge
  const esTexts = new Set();
  for (const f of merged) {
    if (!/^src\/i18n\/es\/.*\.tsx?$/.test(f)) continue;
    const sf = ts.createSourceFile(f, git('show', `${commit}:${f}`), ts.ScriptTarget.Latest, true);
    const walk = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) esTexts.add(n.text);
      ts.forEachChild(n, walk);
    };
    walk(sf);
  }

  // string literals on removed lines of non-test src files
  const changed = new Map();
  let file = null;
  let inHunk = false;
  for (const line of git('diff', '-U0', '--no-color', `${commit}^1`, commit, '--', 'src').split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHunk = false;
      file = line.slice(line.lastIndexOf(' b/') + 3);
      if (isTest(file)) file = null;
    } else if (line.startsWith('@@')) inHunk = true;
    else if (file && inHunk && line.startsWith('-')) {
      for (const m of line.slice(1).matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        const text = m[1] ?? m[2] ?? m[3];
        if (esTexts.has(text)) changed.set(`${file}\0${text}`, { file, text });
      }
    }
  }

  const textQuery = /getByText|getByRole\([^)]*name\s*:|has-text|getByLabel/;
  const textQueryTests = lines(git('diff', '--name-only', '--diff-filter=AM', `${commit}^1`, commit))
    .filter((f) => isTest(f) && textQuery.test(git('show', `${commit}:${f}`)))
    .sort();

  return {
    lostFiles: [...lost].sort(),
    changedEsLiterals: [...changed.values()].sort((a, b) => a.file.localeCompare(b.file) || a.text.localeCompare(b.text)),
    textQueryTests,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = auditMerge(process.argv[2] ?? 'HEAD');
  console.log(`Files in a parent and absent from the merge (${a.lostFiles.length})`);
  for (const f of a.lostFiles) console.log(`  ${f}`);
  console.log(`\nSpanish catalog texts removed from src (${a.changedEsLiterals.length})`);
  for (const e of a.changedEsLiterals) console.log(`  ${e.file}: ${JSON.stringify(e.text)}`);
  console.log(`\nTests added or changed by the second parent that query text (${a.textQueryTests.length})`);
  for (const f of a.textQueryTests) console.log(`  ${f}`);
}
