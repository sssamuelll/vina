import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditMerge } from '../../scripts/i18n/merge-audit.mjs';

const repo = mkdtempSync(join(tmpdir(), 'vina-merge-audit-'));
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=.no-hooks', '-c', 'core.autocrlf=false', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
const write = (rel: string, text: string) => {
  mkdirSync(join(repo, rel, '..'), { recursive: true });
  writeFileSync(join(repo, rel), text);
};

beforeAll(() => {
  git('init', '-q', '-b', 'branch');
  write('src/i18n/es/app.ts', "export const app = { title: 'Hola mundo' };\n");
  write('src/b.ts', "export const x = { label: 'Hola mundo' };\n");
  write('src/keep.ts', 'export const keep = 1;\n');
  write('src/other.ts', "export const y = { label: 'Sin catálogo' };\n");
  git('add', '-A');
  git('commit', '-q', '-m', 'base');

  git('checkout', '-q', '-b', 'main');
  unlinkSync(join(repo, 'src/keep.ts'));
  write('src/b.ts', "export const x = { label: 'Hola gente' };\n");
  write('src/other.ts', "export const y = { label: 'Otro texto' };\n");
  write('tests/e2e/new.spec.ts', "test('x', async ({ page }) => { await page.getByText('Hola').click(); });\n");
  write('tests/e2e/plain.spec.ts', "test('y', async ({ page }) => { await page.locator('[data-action=\"save\"]').click(); });\n");
  git('add', '-A');
  git('commit', '-q', '-m', 'main moves');

  git('checkout', '-q', 'branch');
  write('src/a.ts', 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'branch moves');
  git('merge', '-q', '--no-ff', '--no-edit', 'main');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('merge audit', () => {
  it('lists what a merge of main removed, the es literals it changed, and the specs that query text', () => {
    const audit = auditMerge('HEAD', repo);
    expect(audit.lostFiles).toEqual(['src/keep.ts']);
    expect(audit.changedEsLiterals).toEqual([{ file: 'src/b.ts', text: 'Hola mundo' }]);
    expect(audit.textQueryTests).toEqual(['tests/e2e/new.spec.ts']);
  });
});
