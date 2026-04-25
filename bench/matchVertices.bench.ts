/**
 * Bench: matchVertices (PR #591).
 *
 * matchVertices pairs vertices between two parameterised edges by closest
 * arc-length parameter. PR #591 replaced an O(|A|·|B|) double-loop with a
 * two-pointer walk over the sorted-by-t inputs, dropping the worst case to
 * O(|A| + |B|).
 *
 * The threshold gate below is sized so:
 *  - the new (linear) implementation finishes well under it on a typical dev
 *    laptop and on slow CI runners, and
 *  - a regression to the old O(n²) impl exceeds it by ~10× at N=10000,
 *    which is enough head-room to fail confidently without false positives.
 *
 * Numbers from PR #591 on a dev machine: legacy ~187 ms vs new ~0.5 ms at
 * N=10000. We set the gate at 30 ms — 60× the new median, ~6× faster than
 * the legacy median at the same N — so a return to quadratic behaviour
 * fails the gate but a 10× CI-runner slowdown does not.
 *
 * Run: `npm run bench:matchvertices` (gate enforced) or
 *      `npx tsx bench/matchVertices.bench.ts` (gate enforced)
 */

import {
  matchVertices,
  type ParameterizedVertex,
} from '../src/utils/cloth/seamAssembly';
import {
  measure,
  mulberry32,
  reportAndGate,
  summarise,
  checkThresholds,
  type BenchResult,
} from './_lib';

const SEED = 0xc0_ff_ee;

/**
 * Build two parameterised edges of size N each. `t` is sorted by construction
 * (sorted random offsets normalised to [0, 1]) — the same invariant
 * `parameterizeEdge` produces in production. Edge B is perturbed slightly
 * around edge A so the two-pointer walk has non-trivial work to do (the
 * cursor advances in the inner loop) rather than always landing on j == i.
 */
function buildEdges(n: number, seed: number): {
  edgeA: ParameterizedVertex[];
  edgeB: ParameterizedVertex[];
} {
  const rng = mulberry32(seed);
  // Sorted t values for A: cumulative random gaps normalised to [0, 1].
  const aGaps = Array.from({ length: n }, () => rng() + 0.001);
  const aSum = aGaps.reduce((a, b) => a + b, 0);
  const aT: number[] = new Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += aGaps[i];
    aT[i] = acc / aSum;
  }
  // B: same length, perturbed offsets, also sorted.
  const bGaps = Array.from({ length: n }, () => rng() + 0.001);
  const bSum = bGaps.reduce((a, b) => a + b, 0);
  const bT: number[] = new Array(n);
  acc = 0;
  for (let i = 0; i < n; i++) {
    acc += bGaps[i];
    bT[i] = acc / bSum;
  }
  const edgeA: ParameterizedVertex[] = aT.map((t, i) => ({ index: i, t }));
  const edgeB: ParameterizedVertex[] = bT.map((t, i) => ({ index: 100_000 + i, t }));
  return { edgeA, edgeB };
}

const SIZES = [1_000, 10_000, 50_000];
const RUNS = 5;
const WARMUP = 2;

function runBench(): BenchResult {
  const result: BenchResult = {
    name: 'matchVertices',
    summaries: [],
    thresholds: [
      // 1k is fast enough that any gate would be noise-bound; rely on
      // the 10k row to catch O(n²) regressions.
      { label: 10_000, maxMedianMs: 30, rationale: 'O(n²) regression at this size is ~50–200 ms' },
      { label: 50_000, maxMedianMs: 100, rationale: 'O(n²) regression at this size is several seconds' },
    ],
    breaches: [],
  };
  for (const n of SIZES) {
    const { edgeA, edgeB } = buildEdges(n, SEED);
    const samples = measure(() => {
      matchVertices(edgeA, edgeB);
    }, RUNS, WARMUP);
    result.summaries.push(summarise(n, samples));
  }
  checkThresholds(result);
  return result;
}

// Run as a script. When imported by bench/run.ts, the import side-effect is
// fine because the import only registers the function; runBench is invoked
// explicitly by the caller via `runBenchExported`.
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('matchVertices.bench.ts');
if (isMain) {
  const result = runBench();
  process.exit(reportAndGate(result));
}

export const runMatchVerticesBench = runBench;
