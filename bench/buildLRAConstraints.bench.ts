/**
 * Bench: buildLRAConstraints (PR #589).
 *
 * buildLRAConstraints runs Dijkstra over the cloth mesh to compute geodesic
 * distance from every pinned particle to every other particle. PR #589
 * swapped the priority queue from "array + insertion-sort on push"
 * (O(V²) on dense meshes) to a binary min-heap over typed arrays
 * (O((V + E) log V)).
 *
 * Numbers from PR #589 on a dev machine:
 *
 *      | N      | legacy (array-PQ) | new (binary heap) | speedup |
 *      | ------ | ----------------- | ----------------- | ------- |
 *      | 1 000  | 6.43 ms           | 2.41 ms           | 2.7×    |
 *      | 10 000 | 43.21 ms          | 13.78 ms          | 3.1×    |
 *      | 20 000 | 114.37 ms         | 14.11 ms          | 8.1×    |
 *
 * Threshold gate is sized so:
 *  - the new heap-based impl passes comfortably even on slow CI, and
 *  - a return to the legacy array-PQ exceeds the gate at N=20000.
 *
 * At N=20000 the legacy was ~114 ms; new was ~14 ms. Gate at 60 ms — ~4×
 * the new median, ~50% of the legacy median, so a regression is caught
 * without false positives on slower hardware.
 *
 * Run: `npm run bench:lra` (gate enforced) or
 *      `npx tsx bench/buildLRAConstraints.bench.ts` (gate enforced)
 */

import { buildLRAConstraints } from '../src/utils/cloth/longRangeAttachments';
import {
  measure,
  gridMesh,
  reportAndGate,
  summarise,
  checkThresholds,
  type BenchResult,
} from './_lib';

interface Size {
  label: number;
  resX: number;
  resY: number;
}

// Sizes are chosen to match (or exceed) the resolutions referenced in the
// PR #589 body, so the headline numbers are directly comparable.
const SIZES: Size[] = [
  { label: 1_000, resX: 32, resY: 32 },     // ~1024 particles
  { label: 10_000, resX: 100, resY: 100 },  // 10000 particles
  { label: 20_000, resX: 142, resY: 142 },  // 20164 particles
];

const RUNS = 3;
const WARMUP = 1;

/** Pin the four corner particles — same setup as PR #589's reported bench. */
function cornerPins(resX: number, resY: number): Set<number> {
  const n = resX * resY;
  return new Set<number>([0, resX - 1, n - resX, n - 1]);
}

function runBench(): BenchResult {
  const result: BenchResult = {
    name: 'buildLRAConstraints',
    summaries: [],
    thresholds: [
      { label: 10_000, maxMedianMs: 50, rationale: 'legacy array-PQ at this size was ~43 ms; new ~14 ms' },
      { label: 20_000, maxMedianMs: 60, rationale: 'legacy array-PQ at this size was ~114 ms; new ~14 ms' },
    ],
    breaches: [],
  };
  for (const sz of SIZES) {
    const { vertices, triIds, n } = gridMesh(sz.resX, sz.resY);
    const pinned = cornerPins(sz.resX, sz.resY);
    const samples = measure(() => {
      buildLRAConstraints(vertices, n, triIds, pinned);
    }, RUNS, WARMUP);
    result.summaries.push(summarise(sz.label, samples));
  }
  checkThresholds(result);
  return result;
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('buildLRAConstraints.bench.ts');
if (isMain) {
  const result = runBench();
  process.exit(reportAndGate(result));
}

export const runBuildLRAConstraintsBench = runBench;
