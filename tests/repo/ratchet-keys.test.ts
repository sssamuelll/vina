import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A browser ratchet measures only the states it registers, and a state whose
 * name has no key in the baseline JSON measures nothing. This pins the two
 * together, both ways, so renaming a state string cannot drop it silently.
 */
const RATCHETS = [
  { spec: 'tests/e2e/superficies-por-accion.spec.ts', baseline: 'tests/e2e/superficies-baseline.json' },
  { spec: 'tests/e2e/contraste-del-cromo.spec.ts', baseline: 'tests/e2e/contraste-baseline.json' },
];

/** First argument of every `registrar(` call; a non-literal one is reported with its line. */
function estadosRegistrados(file: string): { names: string[]; bad: string[] } {
  const src = readFileSync(file, 'utf8');
  const names: string[] = [];
  const bad: string[] = [];
  for (const m of src.matchAll(/\bregistrar\(\s*/g)) {
    if (/function\s+$/.test(src.slice(0, m.index))) continue; // the declaration
    const line = src.slice(0, m.index).split('\n').length;
    const start = m.index + m[0].length;
    const quote = src[start];
    if (quote !== "'" && quote !== '"') {
      bad.push(`${file}:${line} first argument is not a string literal`);
      continue;
    }
    let end = start + 1;
    while (end < src.length && src[end] !== quote) end += src[end] === '\\' ? 2 : 1;
    if (!/^\s*,/.test(src.slice(end + 1))) {
      bad.push(`${file}:${line} first argument is not a single string literal`);
      continue;
    }
    names.push(src.slice(start + 1, end));
  }
  return { names, bad };
}

describe('browser ratchets: measured state names match baseline keys', () => {
  for (const { spec, baseline } of RATCHETS) {
    it(`${spec} <-> ${baseline}`, () => {
      const { names, bad } = estadosRegistrados(spec);
      expect(bad).toEqual([]);
      const keys = Object.keys(JSON.parse(readFileSync(baseline, 'utf8')).estados);
      expect(names.filter((n) => !keys.includes(n)), 'registered with no baseline key').toEqual([]);
      expect(keys.filter((k) => !names.includes(k)), 'baseline key with no registrar call').toEqual([]);
    });
  }
});
