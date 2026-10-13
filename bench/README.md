# `bench/` — reproducible performance benchmarks

This directory holds the perf benchmarks that back the algorithmic refactors
in PR #589 (`buildLRAConstraints`, array-PQ → binary heap) and PR #591
(`matchVertices`, O(n²) → two-pointer). Both PRs originally referenced
bench scripts from `/tmp/`, which made the numbers in the PR bodies
unreproducible by anyone else. These files are the in-tree replacement.

## Run

```bash
# All benches with the threshold gate (suitable for CI):
npm run bench

# Individual benches:
npm run bench:matchvertices
npm run bench:lra
```

Each script prints a table and exits with code `1` if any median exceeds
the per-bench threshold defined in the source. `npm run bench` aggregates
both and short-circuits to a non-zero exit on the first breach.

No additional dependencies are required — `tsx` is already in `devDependencies`,
so the scripts run TypeScript directly from source.

## What the gate is for

The gate is **not** a "did the median get faster" check — that would be
machine- and noise-sensitive. It is "did we accidentally reintroduce a
quadratic worst case." Each threshold is sized so:

- the current linear / log-linear implementation passes comfortably even on
  slow CI hardware, and
- a regression to the previous quadratic implementation exceeds the gate at
  the largest test size.

Concretely, with the headline numbers from each PR:

| Bench                  | N       | Legacy worst case | New median | Gate |
| ---------------------- | ------- | ----------------- | ---------- | ---- |
| `matchVertices`        | 10 000  | ~187 ms           | ~0.5 ms    | 30 ms |
| `matchVertices`        | 50 000  | several seconds   | ~2 ms      | 100 ms |
| `buildLRAConstraints`  | 10 000  | ~43 ms            | ~14 ms     | 50 ms |
| `buildLRAConstraints`  | 20 000  | ~114 ms           | ~14 ms     | 60 ms |

There's no `1 000` row in the gate: at small N the measurement is noise-bound
and the legacy numbers are not far from the new ones, so a threshold there
would either false-positive on slow CI or do nothing on fast hardware. The
larger sizes are where the asymptotic class actually shows up.

## Adding a new bench

Two-line process:

1. Write `bench/<name>.bench.ts` exporting `run<Name>Bench(): BenchResult`.
   See `matchVertices.bench.ts` for the minimal template — build deterministic
   input, call `measure(...)`, push `summarise(...)` into `result.summaries`,
   and declare thresholds.
2. In `bench/run.ts`, import the new export and add it to the `benches`
   array.

Prefer absolute thresholds over relative ones (they're machine-independent
in the regression direction) and keep them generous — the goal is to catch
algorithmic class changes, not 5 % drift.

## Determinism

- Inputs are seeded with [Mulberry32](https://stackoverflow.com/q/47593857)
  so byte-identical inputs are produced across runs, machines, and Node
  versions. The seed is `0xC0FFEE` to match the parity tests in
  `src/utils/cloth/__tests__/longRangeAttachments.test.ts`.
- Numerical results from the benched functions are not asserted against a
  golden file here — that's the job of the parity tests. This directory is
  about wall-clock cost only.

## Sample output

```
▼ matchVertices
───────────────────────────────────────────────────────
│ N     │ runs │ min ms │ median ms │ p95 ms │ max ms │
───────────────────────────────────────────────────────
│ 1000  │ 5    │ 0.232  │ 0.409     │ 0.880  │ 0.880  │
│ 10000 │ 5    │ 0.173  │ 0.182     │ 1.908  │ 1.908  │
│ 50000 │ 5    │ 1.340  │ 2.139     │ 8.774  │ 8.774  │
───────────────────────────────────────────────────────
✓ matchVertices: all thresholds OK

▼ buildLRAConstraints
───────────────────────────────────────────────────────
│ N     │ runs │ min ms │ median ms │ p95 ms │ max ms │
───────────────────────────────────────────────────────
│ 1000  │ 3    │ 1.756  │ 1.843     │ 4.634  │ 4.634  │
│ 10000 │ 3    │ 5.861  │ 6.235     │ 7.200  │ 7.200  │
│ 20000 │ 3    │ 12.621 │ 14.221    │ 14.222 │ 14.222 │
───────────────────────────────────────────────────────
✓ buildLRAConstraints: all thresholds OK

PASS: all bench thresholds OK.
```

## Caveats

- These benches measure single-threaded JavaScript performance. They do
  not exercise the WASM solver (`crates/xpbd-wasm`) or any worker-pool
  scheduling.
- `buildLRAConstraints` is invoked once per pin event in production; this
  bench does not simulate burst-pinning scenarios. The single-call cost is
  what dominates user-perceived stalls and is what the gate is sized for.
- Thresholds may need a small bump if the project starts running benches
  on consistently slower hardware (e.g. arm64 emulation). Treat that as a
  PR with a one-line rationale, not as a routine maintenance task.

## `bench:tela` — the new cloth engine against a private reference

`npm run bench:tela` runs the lab tests of the new cloth engine (spec
`docs/superpowers/specs/2026-10-13-tela-nueva-design.md` §4.4: the Cusick disc
and the cantilever strip at 5, 10 and 20 mm) and compares them with a
reference that is **not** in this repo. `VINA_REFERENCIAS` must point to a
private folder holding `referencias.json`; the report is written to its
`informes/` subfolder, and the script refuses to run without it.

```bash
VINA_REFERENCIAS=<private folder> npm run bench:tela -- --motor=xpbd
```

`--motor=xpbd` measures today's engine, the baseline every delivery is
measured against (§4.4.4). Other flags: `--ensayo=cusick|voladizo|todo` and
`--mallas=5,10,20`. The script already runs under the `scripts/pesado.mjs`
lock. The exact-physics half of the bench (§4.4.1) needs no private data: it
is the vitest suite in `src/utils/cloth/implicito/__tests__/`.
