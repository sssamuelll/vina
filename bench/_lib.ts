/**
 * Shared helpers for the bench/ harness.
 *
 * - Deterministic PRNG (mulberry32) so bench inputs are bit-identical across
 *   runs, machines, and Node versions.
 * - Grid-mesh generator matching the one used in the existing test suites for
 *   buildLRAConstraints, so the input distribution is the same as what the
 *   PR #589 test file uses.
 * - Statistics helpers (median, p95) and a small CLI table formatter.
 *
 * No third-party dependencies — only the Node std lib + project source. Run
 * with `tsx`, e.g. `tsx bench/matchVertices.bench.ts`.
 */

export interface BenchSample {
  /** Input size descriptor for the row, e.g. 1000 or 'N=10000'. */
  label: string | number;
  /** All wall-clock samples in milliseconds. */
  samples: number[];
}

export interface BenchSummary {
  label: string | number;
  runs: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface BenchThreshold {
  /** The label to gate on (matches BenchSample.label). */
  label: string | number;
  /** Median must be < maxMedianMs or the gate fails. */
  maxMedianMs: number;
  /** Optional human-readable rationale shown on failure. */
  rationale?: string;
}

export interface BenchResult {
  /** Benchmark group name (e.g. 'matchVertices'). */
  name: string;
  summaries: BenchSummary[];
  thresholds: BenchThreshold[];
  /** Failed thresholds, populated by checkThresholds(). Empty on pass. */
  breaches: Array<{ label: string | number; medianMs: number; maxMedianMs: number; rationale?: string }>;
}

/**
 * Mulberry32 — 32-bit deterministic PRNG. Same seeding rule as the existing
 * test files, so the input distribution lines up with the parity tests.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a rectangular triangulated grid: resX × resY particles spaced 1 unit
 * apart on the XY plane, with each cell split into two triangles. Identical
 * shape to the helper inside src/utils/cloth/__tests__/longRangeAttachments.test.ts.
 */
export function gridMesh(resX: number, resY: number): {
  vertices: Float32Array;
  triIds: Int32Array;
  n: number;
} {
  const n = resX * resY;
  const vertices = new Float32Array(n * 3);
  for (let y = 0; y < resY; y++) {
    for (let x = 0; x < resX; x++) {
      const idx = y * resX + x;
      vertices[idx * 3] = x;
      vertices[idx * 3 + 1] = y;
    }
  }
  const tris: number[] = [];
  for (let y = 0; y < resY - 1; y++) {
    for (let x = 0; x < resX - 1; x++) {
      const a = y * resX + x;
      const b = a + 1;
      const c = a + resX;
      const d = c + 1;
      tris.push(a, b, c, b, d, c);
    }
  }
  return { vertices, triIds: new Int32Array(tris), n };
}

/** Return [min, median, p95, max] of a non-empty number array. */
export function summarise(label: string | number, samples: number[]): BenchSummary {
  if (samples.length === 0) {
    throw new Error(`summarise called with no samples for "${label}"`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // p95: worst-case-ish without being noise from a single outlier
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    label,
    runs: samples.length,
    minMs: sorted[0],
    medianMs: median,
    p95Ms: sorted[p95Idx],
    maxMs: sorted[sorted.length - 1],
  };
}

/**
 * Run `fn` `runs` times, optionally with `warmup` unmeasured priming
 * iterations to stabilise JIT and CPU caches before measurement.
 */
export function measure(fn: () => void, runs: number, warmup: number = 2): number[] {
  for (let i = 0; i < warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/** Render a result as a human-readable ASCII table. */
export function formatTable(name: string, summaries: BenchSummary[]): string {
  const header = ['N', 'runs', 'min ms', 'median ms', 'p95 ms', 'max ms'];
  const rows = summaries.map((s) => [
    String(s.label),
    String(s.runs),
    s.minMs.toFixed(3),
    s.medianMs.toFixed(3),
    s.p95Ms.toFixed(3),
    s.maxMs.toFixed(3),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const sep = '─'.repeat(widths.reduce((a, w) => a + w + 3, 1));
  const fmt = (cols: string[]) =>
    '│ ' + cols.map((c, i) => pad(c, widths[i])).join(' │ ') + ' │';
  return [
    `▼ ${name}`,
    sep,
    fmt(header),
    sep,
    ...rows.map(fmt),
    sep,
  ].join('\n');
}

/**
 * Apply `thresholds` against `summaries`. Mutates and returns `result.breaches`.
 * A breach is a label whose median exceeded `maxMedianMs`. Labels not present
 * in `summaries` are silently ignored (so the threshold table can be a
 * superset, e.g. when a bench is run at a single size for quick checks).
 */
export function checkThresholds(result: BenchResult): void {
  const byLabel = new Map<string | number, BenchSummary>();
  for (const s of result.summaries) byLabel.set(s.label, s);
  for (const t of result.thresholds) {
    const s = byLabel.get(t.label);
    if (!s) continue;
    if (s.medianMs > t.maxMedianMs) {
      result.breaches.push({
        label: t.label,
        medianMs: s.medianMs,
        maxMedianMs: t.maxMedianMs,
        rationale: t.rationale,
      });
    }
  }
}

/** Print a result and return non-zero exit code material if it breached. */
export function reportAndGate(result: BenchResult): number {
  process.stdout.write(formatTable(result.name, result.summaries) + '\n');
  if (result.breaches.length === 0) {
    process.stdout.write(`✓ ${result.name}: all thresholds OK\n\n`);
    return 0;
  }
  process.stdout.write(`✗ ${result.name}: ${result.breaches.length} threshold breach(es)\n`);
  for (const b of result.breaches) {
    process.stdout.write(
      `  N=${b.label}: median=${b.medianMs.toFixed(3)}ms > limit=${b.maxMedianMs}ms` +
      (b.rationale ? ` — ${b.rationale}` : '') +
      '\n',
    );
  }
  process.stdout.write('\n');
  return 1;
}
