// The one counting helper shared by tests/repo/i18n-*-census.test.ts and debt.mjs,
// so the ceilings always equal what the tests count.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Linter } from 'eslint';
import minimatch from 'minimatch';
import tseslint from 'typescript-eslint';
import ts from 'typescript';
import vina from '../../eslint-rules/index.js';
import { I18N_EXCLUDED } from '../../eslint-rules/i18n-scope.js';

const TEST_GLOBS = ['**/__tests__/**', '**/*.test.{ts,tsx}', 'tests/**'];
const RULE = 'vina/no-literal-ui-string';
const matches = (file, globs) => globs.some((g) => minimatch(file, g));

export function sourceFiles() {
  return execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    .split(/\r?\n/)
    .filter((f) => /\.tsx?$/.test(f) && !matches(f, TEST_GLOBS));
}

export function censusFiles() {
  const excluded = I18N_EXCLUDED.map((e) => e.files);
  return sourceFiles().filter((f) => !matches(f, excluded));
}

// The census measures the debt as it is, so it ignores the debt list's per-file
// override in eslint.config.js: inline config, only this rule.
const CONFIG = {
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  },
  plugins: { vina },
  rules: { [RULE]: 'error' },
};

export function countLiteralSites(files) {
  const linter = new Linter();
  const counts = {};
  for (const f of files) {
    const n = linter.verify(readFileSync(f, 'utf8'), CONFIG, f).filter((m) => m.ruleId === RULE).length;
    if (n) counts[f] = n;
  }
  return counts;
}

const ES = /[a-z]Es$/;

export function countEsFields(files) {
  const counts = {};
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (!/[a-z]Es\b/.test(text)) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    let n = 0;
    const visit = (node) => {
      if (ts.isIdentifier(node) && ES.test(node.text)) n++;
      else if (ts.isStringLiteral(node) && ts.isPropertyName(node) && node.parent && (ts.isPropertyAssignment(node.parent) || ts.isPropertySignature(node.parent) || ts.isPropertyDeclaration(node.parent) || ts.isMethodDeclaration(node.parent)) && node.parent.name === node && ES.test(node.text)) n++;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (n) counts[f] = n;
  }
  return counts;
}
