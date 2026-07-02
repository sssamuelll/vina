#!/usr/bin/env node
/**
 * P4-0 drape-determinism gate — offline diff step.
 *
 * Reads the per-run `pos-<n>.bin` snapshots dumped by the @gpu-local replay
 * (`webgpu-maria-replay.spec.ts`, "determinism" test, run with --repeat-each=N)
 * and compares every run against run 0. PASS iff all runs are bit-identical at
 * the 2.5s settle / tether-capture checkpoint; L∞ / L2 in mm are diagnostic.
 *
 * Two-step because Playwright --repeat-each re-runs the whole spec as separate
 * processes, so no single test invocation sees all N artifacts — the compare
 * must run after the Playwright process exits.
 *
 *   npm run test:e2e:gpu:determinism   # capture N runs → .tmp/determinism/
 *   npm run determinism:diff           # this script — bit-exact compare
 *
 * Exits non-zero on divergence (expected pre-fix: bend race, P4-1; must pass
 * after graph-coloring). See docs/plans/2026-07-01-drape-determinism-p4-design.md.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { comparePositions } from '../src/utils/cloth/gpu/determinismDiff';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const dir = process.argv[2] ? resolve(process.argv[2]) : resolve(repoRoot, '.tmp/determinism');

const files = readdirSync(dir)
  .filter((f) => /^pos-\d+\.bin$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

if (files.length < 2) {
  console.error(
    `[determinism-diff] need ≥2 pos-*.bin in ${dir}, found ${files.length}. ` +
      `Capture first: npm run test:e2e:gpu:determinism`,
  );
  process.exit(1);
}

/** Read a pos-*.bin into a 0-offset (aligned) Float32Array. */
function load(name: string): Float32Array {
  const buf = readFileSync(join(dir, name));
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`${name}: byte length ${buf.byteLength} is not a multiple of 4 (truncated?)`);
  }
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const reference = load(files[0]);
console.log(`[determinism-diff] reference=${files[0]} particles=${reference.length / 3} runs=${files.length}`);

let allBitExact = true;
for (let i = 1; i < files.length; i++) {
  const r = comparePositions(reference, load(files[i]));
  if (!r.bitExact) allBitExact = false;
  console.log(
    `[determinism-diff] ${files[i]} vs ${files[0]}: ${r.bitExact ? 'BIT-EXACT' : 'DIVERGED'}` +
      `  L∞=${r.linfMm.toFixed(4)}mm  L2(rms)=${r.l2Mm.toFixed(4)}mm`,
  );
}

if (allBitExact) {
  console.log(`[determinism-diff] ✓ PASS — all ${files.length} runs bit-identical at the 2.5s checkpoint`);
  process.exit(0);
}
console.error(
  `[determinism-diff] ✗ FAIL — drape is non-deterministic run-to-run (L∞/L2 above). ` +
    `Expected today (bend race); must be bit-exact after P4-1 graph-coloring.`,
);
process.exit(1);
