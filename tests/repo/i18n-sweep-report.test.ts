import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { spanishScore } from '../../scripts/i18n-sweep-report.mjs';

const SCRIPT = resolve('scripts/i18n-sweep-report.mjs');
const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A temporary tree with one Spanish comment in src/, and the given baseline. */
function tree(baseline: Record<string, number>): string {
  const root = mkdtempSync(join(tmpdir(), 'vina-sweep-'));
  roots.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), '// la pieza que se mueve con el margen\nexport const a = 1;\n');
  writeFileSync(join(root, 'scripts', 'i18n-sweep-exceptions.json'), '[]\n');
  writeFileSync(join(root, 'scripts', 'i18n-sweep-baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
  return root;
}

function run(root: string, ...args: string[]): number {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], { cwd: root, stdio: 'pipe' });
    return 0;
  } catch (e) {
    return (e as { status: number }).status;
  }
}

const ZERO = { comments: 0, testTitles: 0, exportedIdentifiers: 0, fileNames: 0 };

describe('spanishScore', () => {
  it.each(['la pieza que se mueve', 'márgenes', '¿Dónde?'])('flags %j', (text) => {
    expect(spanishScore(text)).toBe(true);
  });
  it.each(['the piece that moves', 'Delete piece', 'de-AT', 'la'])('passes %j', (text) => {
    expect(spanishScore(text)).toBe(false);
  });
});

describe('sweep report', () => {
  it('fails when a count rises above the baseline, and passes at the baseline', () => {
    expect(run(tree(ZERO))).toBe(1);
    expect(run(tree({ ...ZERO, comments: 1 }))).toBe(0);
  });

  it('--update only lowers counts', () => {
    const high = tree({ ...ZERO, comments: 5, testTitles: 3 });
    expect(run(high, '--update')).toBe(0);
    expect(JSON.parse(readFileSync(join(high, 'scripts', 'i18n-sweep-baseline.json'), 'utf8'))).toMatchObject({ comments: 1, testTitles: 0 });
    const low = tree(ZERO);
    run(low, '--update');
    expect(JSON.parse(readFileSync(join(low, 'scripts', 'i18n-sweep-baseline.json'), 'utf8')).comments).toBe(0);
  });

  it('counts a comment after a quote that a regex opened', () => {
    const root = tree({ ...ZERO, comments: 1 });
    writeFileSync(join(root, 'src', 'b.ts'), "const q = /'/;\n// la costura que se cierra con el margen\n");
    expect(run(root)).toBe(1);
  });
});
