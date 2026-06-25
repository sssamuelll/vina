/**
 * CPU ↔ WASM cloth-solver parity tests (#752).
 *
 * Cross-tier integration harness: drives the canonical CPU TS solver
 * (`xpbdSolver.ts`) and the Rust WASM solver (`crates/xpbd-wasm/src/lib.rs`)
 * with shared input and asserts they converge on shared output. Three
 * production-impacting drifts shipped before this harness existed because
 * nothing machine-verified the tiers stayed in sync:
 *
 *   - BUG-1 #604 — bend rest distance vs angle.
 *   - BUG-2 #605 — `solveTriangleCollision` `prevPos` not threaded.
 *   - BUG-3 #606 — seam compliance hardcoded to zero.
 *
 * Plus #747 (anisotropic compliance cache regen on `configure()`): this
 * file's anisotropic scenario is the future-proofing for that fix.
 *
 * The Rust constructor `XpbdSolver::new()` is canonical for shared-field
 * defaults (A2 § 3.1, ratified). The CPU `ClothSimConfig` constructor
 * mirrors them for the shared subset. SHARED_DEFAULTS below is verified
 * field-by-field against both.
 *
 * Cross-ref:
 *   - `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`
 *   - `scripts/verify-wasm-smoke.mjs` — Node-side WASM loader pattern (#748).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  XPBDClothSolver,
  type ClothMeshData,
  type ClothSimConfig,
} from '../xpbdSolver';
import {
  extractStretchConstraints,
  extractBendConstraints,
} from '../gpu/gpuBuffers';
import { computeBendRestDistances } from '../wasm/bendRestDistances';

// ─── WASM loader (mirrors scripts/verify-wasm-smoke.mjs / #748) ──────────

interface WasmExports {
  memory: WebAssembly.Memory;
  [key: string]: unknown;
}

interface WasmXpbdSolver {
  set_stretch_with_types(ids: Uint32Array, restLengths: Float32Array, edgeTypes: Uint8Array): void;
  set_bend_with_types(ids: Uint32Array, restDistances: Float32Array, edgeTypes: Uint8Array): void;
  set_seams_with_compliance(ids: Uint32Array, target: Float32Array, compliances: Float32Array): void;
  set_triangles(triIds: Uint32Array): void;
  set_pins(indices: Uint32Array, positions: Float32Array): void;
  configure(
    substeps: number, damping: number, gravityY: number,
    stretchCompliance: number, bendCompliance: number,
    selfCollision: boolean, thickness: number, collisionMargin: number,
    groundY: number, dragCoefficient: number,
    stretchComplianceWarp: number, stretchComplianceWeft: number,
    stretchComplianceShear: number,
    bendComplianceWarp: number, bendComplianceWeft: number,
    internalDamping: number,
  ): void;
  step(dt: number): void;
  positions_ptr(): number;
  num_particles(): number;
  free(): void;
}

interface WasmModule {
  default: (input?: { module_or_path: BufferSource }) => Promise<WasmExports>;
  XpbdSolver: new (positions: Float32Array, invMass: Float32Array) => WasmXpbdSolver;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const wasmJsPath = resolve(repoRoot, 'public/wasm/xpbd_wasm.js');
const wasmBinPath = resolve(repoRoot, 'public/wasm/xpbd_wasm_bg.wasm');

let wasmModule: WasmModule;
let wasmExports: WasmExports;

beforeAll(async () => {
  // Same loader shape as `scripts/verify-wasm-smoke.mjs` (the canonical
  // Node-side loader landed in #748). The wasm-pack-generated JS uses
  // `import.meta.url` for relative paths, so we convert the absolute fs
  // path to a `file://` URL for cross-platform dynamic import.
  const mod = (await import(pathToFileURL(wasmJsPath).href)) as WasmModule;
  wasmModule = mod;
  wasmExports = await mod.default({ module_or_path: readFileSync(wasmBinPath) });
});

// ─── Canonical config ────────────────────────────────────────────────────

/**
 * Shared canonical config for both tiers. Values mirror the Rust
 * constructor defaults (`crates/xpbd-wasm/src/lib.rs:108-152`) — A2 § 3.1
 * ratifies that constructor as the source of truth for the cross-tier
 * shared subset.
 *
 * Test-specific tweaks (NOT defaults — chosen to keep the harness
 * focused on the constraint solvers, not on whole-pipeline behavior):
 *
 * - `groundY: -1000` puts the ground far below the cloth so the
 *   ground-friction post-solve path (CPU has Coulomb friction; WASM tier
 *   handles velocity clamping in the worker) does not perturb the
 *   comparison.
 * - `selfCollision: false` keeps the spatial-hash machinery out — the
 *   port for self-collision has its own dedicated coverage (#608).
 * - `dragCoefficient: 0` removes air drag from the comparison; CPU's
 *   `applyAirDrag` runs *before* integration and WASM's runs *after*,
 *   a documented intentional cleavage that's harmless when drag is
 *   zero but would otherwise inflate divergence.
 */
const SHARED_DEFAULTS = {
  numSubsteps: 15,
  gravityY: -9.81,
  damping: 0.99,
  stretchCompliance: 0.0,
  bendCompliance: 1.0,
  selfCollision: false,
  thickness: 0.002,
  collisionMargin: 0.005,
  groundY: -1000.0,
  dragCoefficient: 0.0,
  stretchComplianceWarp: 0.0,
  stretchComplianceWeft: 0.0,
  stretchComplianceShear: 0.001,
  bendComplianceWarp: 2.5e-5, // #gummy STEP 1: was 1.0 (dead bend), lockstep CPU↔WASM
  bendComplianceWeft: 2.5e-5,
  internalDamping: 0.3,
};

function cpuConfig(overrides: Partial<ClothSimConfig> = {}): Partial<ClothSimConfig> {
  return {
    numSubsteps: SHARED_DEFAULTS.numSubsteps,
    gravity: [0.0, SHARED_DEFAULTS.gravityY, 0.0],
    dt: 1 / 60,
    damping: SHARED_DEFAULTS.damping,
    stretchingCompliance: SHARED_DEFAULTS.stretchCompliance,
    bendingCompliance: SHARED_DEFAULTS.bendCompliance,
    selfCollision: SHARED_DEFAULTS.selfCollision,
    clothThickness: SHARED_DEFAULTS.thickness,
    groundY: SHARED_DEFAULTS.groundY,
    groundFriction: 0.0,
    dragCoefficient: SHARED_DEFAULTS.dragCoefficient,
    stretchComplianceWarp: SHARED_DEFAULTS.stretchComplianceWarp,
    stretchComplianceWeft: SHARED_DEFAULTS.stretchComplianceWeft,
    stretchComplianceShear: SHARED_DEFAULTS.stretchComplianceShear,
    bendComplianceWarp: SHARED_DEFAULTS.bendComplianceWarp,
    bendComplianceWeft: SHARED_DEFAULTS.bendComplianceWeft,
    internalDamping: SHARED_DEFAULTS.internalDamping,
    // CPU-only knobs forced off / sized to match WASM behavior:
    adaptiveSubsteps: false,    // fix substep cadence (WASM has no internal adaptive loop)
    enableLRA: false,           // permanent CPU-only feature (A7 § 3.1)
    maxVelocity: Infinity,      // CPU-only velocity clamp (WASM tier clamps in the worker)
    windForce: [0, 0, 0],
    ...overrides,
  };
}

function applyWasmConfig(
  solver: WasmXpbdSolver,
  overrides: Partial<typeof SHARED_DEFAULTS> = {},
): void {
  const c = { ...SHARED_DEFAULTS, ...overrides };
  solver.configure(
    c.numSubsteps,
    c.damping,
    c.gravityY,
    c.stretchCompliance,
    c.bendCompliance,
    c.selfCollision,
    c.thickness,
    c.collisionMargin,
    c.groundY,
    c.dragCoefficient,
    c.stretchComplianceWarp,
    c.stretchComplianceWeft,
    c.stretchComplianceShear,
    c.bendComplianceWarp,
    c.bendComplianceWeft,
    c.internalDamping,
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function readWasmPositions(solver: WasmXpbdSolver, numVerts: number): Float32Array {
  const ptr = solver.positions_ptr();
  // Re-create the view each call: WASM memory growth can detach the
  // backing ArrayBuffer of any older view we held. Then copy out so the
  // returned Float32Array is stable for assertion.
  const view = new Float32Array(wasmExports.memory.buffer, ptr, numVerts * 3);
  return new Float32Array(view);
}

function maxCoordDelta(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

interface MeshFixture {
  positions: Float32Array;
  triangles: Uint32Array; // for WASM (Uint32)
  triIds: Int32Array;     // for CPU (Int32)
  uvs?: Float32Array;
  pins: number[];
}

/**
 * Vertical rectangle in the XY plane: column index drives X, row index
 * drives Y (top row at y=2, bottom row at y=1). UVs map column → U,
 * row → V so vertical edges classify as WARP and horizontal edges as
 * WEFT (per `classifyEdgeType` in `gpu/gpuBuffers.ts`).
 */
function makeVerticalRect(resX: number, resY: number, pins: number[]): MeshFixture {
  const positions = new Float32Array(resX * resY * 3);
  const uvs = new Float32Array(resX * resY * 2);
  for (let iy = 0; iy < resY; iy++) {
    for (let ix = 0; ix < resX; ix++) {
      const idx = iy * resX + ix;
      positions[idx * 3]     = ix / (resX - 1) - 0.5;
      positions[idx * 3 + 1] = 1.0 + (resY - 1 - iy) / (resY - 1);
      positions[idx * 3 + 2] = 0;
      uvs[idx * 2]     = ix / (resX - 1);
      uvs[idx * 2 + 1] = iy / (resY - 1);
    }
  }
  const numQuads = (resX - 1) * (resY - 1);
  const triangles = new Uint32Array(numQuads * 6);
  const triIds = new Int32Array(numQuads * 6);
  let ti = 0;
  for (let iy = 0; iy < resY - 1; iy++) {
    for (let ix = 0; ix < resX - 1; ix++) {
      const v00 = iy * resX + ix;
      const v10 = iy * resX + ix + 1;
      const v01 = (iy + 1) * resX + ix;
      const v11 = (iy + 1) * resX + ix + 1;
      triangles[ti] = v00; triIds[ti++] = v00;
      triangles[ti] = v10; triIds[ti++] = v10;
      triangles[ti] = v11; triIds[ti++] = v11;
      triangles[ti] = v00; triIds[ti++] = v00;
      triangles[ti] = v11; triIds[ti++] = v11;
      triangles[ti] = v01; triIds[ti++] = v01;
    }
  }
  return { positions, triangles, triIds, uvs, pins };
}

function buildWasmFromMesh(fixture: MeshFixture, useUVs: boolean): WasmXpbdSolver {
  const numVerts = fixture.positions.length / 3;
  // The WASM worker hands the solver uniform invMass=1 and lets `set_pins`
  // zero out pinned ones (`wasmSolverWorker.ts:516-520`). Mirror that so
  // the comparison isn't confounded by mass differences. The CPU side
  // overwrites its area-weighted invMass to match (see buildCpuFromMesh).
  const invMass = new Float32Array(numVerts).fill(1.0);
  const solver = new wasmModule.XpbdSolver(new Float32Array(fixture.positions), invMass);

  const uvs = useUVs ? fixture.uvs : undefined;
  const stretch = extractStretchConstraints(fixture.positions, fixture.triangles, uvs);
  solver.set_stretch_with_types(stretch.ids, stretch.restLengths, stretch.edgeTypes);

  const bend = extractBendConstraints(fixture.positions, fixture.triangles, uvs);
  const bendDistances = computeBendRestDistances(fixture.positions, bend.ids);
  solver.set_bend_with_types(bend.ids, bendDistances, bend.edgeTypes);

  solver.set_triangles(fixture.triangles);

  if (fixture.pins.length > 0) {
    const indices = new Uint32Array(fixture.pins);
    const positions = new Float32Array(fixture.pins.length * 3);
    for (let i = 0; i < fixture.pins.length; i++) {
      const p = fixture.pins[i];
      positions[i * 3]     = fixture.positions[p * 3];
      positions[i * 3 + 1] = fixture.positions[p * 3 + 1];
      positions[i * 3 + 2] = fixture.positions[p * 3 + 2];
    }
    solver.set_pins(indices, positions);
  }
  return solver;
}

function buildCpuFromMesh(
  fixture: MeshFixture,
  config: Partial<ClothSimConfig>,
  useUVs: boolean,
): XPBDClothSolver {
  const meshData: ClothMeshData = {
    vertices: new Float32Array(fixture.positions),
    triIds: new Int32Array(fixture.triIds),
    uvs: useUVs && fixture.uvs ? new Float32Array(fixture.uvs) : undefined,
  };
  const solver = new XPBDClothSolver(meshData, config);
  // Match WASM's uniform invMass: the CPU constructor's `initPhysics`
  // computes area-weighted invMass per particle, which the WASM tier does
  // not do. Without this normalization the constraint solvers operate on
  // different effective masses and the comparison is meaningless.
  solver.invMass.fill(1.0);
  for (const idx of fixture.pins) solver.pinParticle(idx);
  return solver;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('CPU vs WASM solver parity (#752)', () => {
  /**
   * Empirical ε per coordinate after N steps.
   *
   * Rust f32 (LLVM, may emit FMA) and JS f32 (V8, no FMA) drift on the
   * order of ~1ULP per fused-vs-discrete op. Across 15 substeps × ~30
   * frames × O(constraints) ops on the meshes used here, accumulated
   * drift stays well under 1e-3 m per coord in practice.
   *
   * Choosing 1e-3 per the issue's "calibrate empirically" guidance.
   * Anything looser would mask real cross-tier bugs — each of the three
   * historical BUG-* drifts produced O(0.1m+) divergence on similar
   * fixtures, two orders of magnitude above this bound.
   */
  const EPSILON = 1e-3;

  it('produces near-identical positions over 30 steps for a free-falling rectangle', () => {
    // 5×5 vertical sheet, no pins. Without UVs both tiers default-classify
    // (CPU: stretch→SHEAR, bend→WEFT; WASM extractor: same), exercising
    // the SHEAR / WEFT compliance paths under uniform gravity.
    const fixture = makeVerticalRect(5, 5, []);
    const cpu = buildCpuFromMesh(fixture, cpuConfig(), /* useUVs */ false);
    const wasm = buildWasmFromMesh(fixture, /* useUVs */ false);
    applyWasmConfig(wasm);

    try {
      for (let i = 0; i < 30; i++) {
        cpu.step();
        wasm.step(1 / 60);
      }

      const cpuPos = cpu.getSnapshot().positions;
      const wasmPos = readWasmPositions(wasm, fixture.positions.length / 3);

      const delta = maxCoordDelta(cpuPos, wasmPos);
      expect(delta).toBeLessThan(EPSILON);
    } finally {
      wasm.free();
    }
  });

  it('respects per-edge anisotropic compliance change at runtime (regression for #747)', () => {
    // 2×2 vertical sheet with UVs aligned so vertical edges → WARP. Top
    // row pinned, bottom row swings under gravity. With WARP rigid the
    // bottom barely moves; with WARP soft (compliance=0.5) it sags.
    //
    // The two paths to a soft warp tier:
    //   - CPU: pass `stretchComplianceWarp: 0.5` to the constructor — the
    //     per-edge cache (`stretchCompliances`) is populated from config
    //     in `initPhysics`, no runtime mutation involved.
    //   - WASM: construct + `set_stretch_with_types` (cache built from
    //     globals at default warp=0), then `configure(... warp=0.5 ...)`.
    //     Per #747, that `configure` call must regenerate the per-edge
    //     compliance cache; pre-fix it left stale warp=0 values in the
    //     cache and the cloth stayed rigid despite the field change.
    //
    // Cross-tier convergence under EPSILON = `configure` regen path is
    // working. Divergence on the order of 1e-1 m = #747 has regressed
    // (rigid WASM vs soft CPU on the same WARP edges).
    const fixture = makeVerticalRect(2, 2, [0, 1]); // pin top row
    const warp = 0.5;

    const cpu = buildCpuFromMesh(
      fixture,
      cpuConfig({ stretchComplianceWarp: warp }),
      /* useUVs */ true,
    );

    const wasm = buildWasmFromMesh(fixture, /* useUVs */ true);
    applyWasmConfig(wasm, { stretchComplianceWarp: warp });

    try {
      for (let i = 0; i < 30; i++) {
        cpu.step();
        wasm.step(1 / 60);
      }
      const cpuPos = cpu.getSnapshot().positions;
      const wasmPos = readWasmPositions(wasm, fixture.positions.length / 3);

      // Sanity: the bottom row actually moved (i.e. WARP=0.5 had effect
      // on at least one tier). If both tiers somehow stayed rigid the
      // assertion below would pass vacuously.
      const bottomMoved = Math.abs(cpuPos[2 * 3 + 1] - fixture.positions[2 * 3 + 1]);
      expect(bottomMoved).toBeGreaterThan(1e-3);

      const delta = maxCoordDelta(cpuPos, wasmPos);
      expect(delta).toBeLessThan(EPSILON);
    } finally {
      wasm.free();
    }
  });

  it('seam compliance non-zero behaves identically (regression for BUG-3 #606)', () => {
    // BUG-3 (#606): the WASM seam solver hardcoded alpha=0 internally and
    // ignored the per-seam compliance array. Fix wired the array through
    // `set_seams_with_compliance` → `solve_seams`. Regression test:
    // construct two WASM solvers with the same minimal seam fixture but
    // different per-seam compliance, run both, assert their final
    // positions diverge in a way that's only possible if compliance is
    // actually being applied.
    //
    // The CPU seam solver shrinks rest length each substep
    // (`seamAssembly.solveSeamConstraints`), a sewing-animation behavior
    // not present in the WASM tier. So this scenario is intentionally
    // WASM-internal: the regression contract is "non-zero compliance has
    // an observable effect", not "WASM matches CPU". Cross-tier seam
    // parity would require either porting the shrink loop to WASM or
    // pulling it out of CPU; both are out of scope for this test (audit
    // charter — cirugía, no demolición).
    const makeSeamSolver = (compliance: number): WasmXpbdSolver => {
      const positions = new Float32Array([0, 1, 0,  1, 1, 0]);
      const invMass = new Float32Array([1.0, 1.0]);
      const solver = new wasmModule.XpbdSolver(positions, invMass);
      solver.set_seams_with_compliance(
        new Uint32Array([0, 1]),
        new Float32Array([0]),       // target distance: 0 → fully sewn
        new Float32Array([compliance]),
      );
      // Gravity off so only the seam contributes to motion. Self-collision
      // off via the shared default. Particles at y=1 above ground=-1000.
      applyWasmConfig(solver, { gravityY: 0 });
      return solver;
    };

    const rigid = makeSeamSolver(0.0);
    const soft = makeSeamSolver(1.0);

    try {
      for (let i = 0; i < 30; i++) {
        rigid.step(1 / 60);
        soft.step(1 / 60);
      }
      const rigidPos = readWasmPositions(rigid, 2);
      const softPos = readWasmPositions(soft, 2);

      const rigidDist = Math.abs(rigidPos[3] - rigidPos[0]);
      const softDist = Math.abs(softPos[3] - softPos[0]);

      // Rigid (compliance=0): one substep collapses dist 1 → 0; expect
      // ≈0 after 30 frames.
      expect(rigidDist).toBeLessThan(0.05);
      // Soft (compliance=1): per-substep correction ≈ -dist/(w_sum +
      // 1/sdt²) ≈ -1/(2 + 8.1e5) ≈ 1.2e-6 per substep, ~5e-4 m total —
      // pre-BUG-3-fix this would have been treated as rigid and equaled
      // rigidDist. Asserting > 0.5 m makes a regression unmistakable.
      expect(softDist).toBeGreaterThan(0.5);
    } finally {
      rigid.free();
      soft.free();
    }
  });
});
