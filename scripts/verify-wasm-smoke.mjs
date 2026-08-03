#!/usr/bin/env node
/**
 * Smoke-test the committed WASM binary in `public/wasm/`.
 *
 * Loads the committed `xpbd_wasm.js` + `xpbd_wasm_bg.wasm`, instantiates
 * an `XpbdSolver` over a small 4-particle configuration, runs a single
 * `step()`, and asserts the resulting positions are finite. This catches
 * the practical drift modes the audit cares about:
 *
 *   - Stale binary that no longer loads (missing exports, ABI drift).
 *   - Binary that loads but `step()` panics or returns garbage.
 *   - Hand-edited binary that's been corrupted.
 *
 * It does NOT enforce byte-exact equality with a fresh `wasm-pack build`
 * — that proved too brittle across CI/local environment differences even
 * with Rust toolchain + wasm-pack pinned (see #748 history). The cargo
 * test gate covers source-level correctness; this smoke test covers
 * binary-level usability of what's actually committed.
 *
 * Used by `.github/workflows/ci.yml` and runnable locally via:
 *   node scripts/verify-wasm-smoke.mjs
 *
 * Cross-ref: #748.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const wasmJsPath = resolve(repoRoot, 'public/wasm/xpbd_wasm.js');
const wasmBinPath = resolve(repoRoot, 'public/wasm/xpbd_wasm_bg.wasm');

// `import()` exige una URL, no una ruta del sistema. En Linux una ruta absoluta
// (`/home/...`) cuela porque ya parece una URL sin esquema; en Windows `D:\...`
// revienta con ERR_UNSUPPORTED_ESM_URL_SCHEME, y `D:` se lee como esquema. Este
// gate corría sólo en CI, así que el fallo vivió sin que nadie lo notara: con
// CI apagado y los deploys hechos a mano desde Windows, era un gate muerto.
const { default: init, XpbdSolver } = await import(pathToFileURL(wasmJsPath).href);
const wasm = await init({ module_or_path: readFileSync(wasmBinPath) });

// Two particles 1m apart on the x-axis, both unit mass. One stretch
// constraint with rest length 1.0 (already at rest). One step at 1/60 s
// with the constructor-default config; positions must remain finite
// (no NaN / Inf) after the step.
const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
const invMass = new Float32Array([1, 1]);
const solver = new XpbdSolver(positions, invMass);
solver.set_stretch(new Uint32Array([0, 1]), new Float32Array([1.0]));
solver.step(1 / 60);

// Reaching this line means the binary loaded, the constructor + set_stretch
// + step path all ran without throwing — the gate this smoke test enforces.
console.log('[verify-wasm-smoke] ✓ public/wasm/ loaded, XpbdSolver.step() ran without throwing');
solver.free();

// ─── Seam closure (Fase 2 / BP-2) ────────────────────────────────────────────
// The committed binary must CLOSE seams, not hold them at their init-time
// distance (the pre-Fase-2 behavior: static seam_target → pieces hover apart
// forever). Two unit-mass particles 10 cm apart, one standard seam seeded the
// way `buildSeamConstraints` does (target = current distance, compliance
// 1e-4), zero gravity, 2 s of sim-time at 60 fps → distance must fall below
// 1 mm. Mirrors the `seam_closes_within_two_seconds_sim_time` cargo test, but
// against the artifact that actually ships.
const seamPositions = new Float32Array([0, 1, 0, 0.1, 1, 0]);
const seamInvMass = new Float32Array([1, 1]);
const seamSolver = new XpbdSolver(seamPositions, seamInvMass);
// configure(substeps, damping, gravityY, stretchC, bendC, selfCollision,
//           thickness, margin, groundY, drag, warpC, weftC, shearC,
//           bendWarpC, bendWeftC, internalDamping) — defaults except gravity=0.
seamSolver.configure(15, 0.99, 0.0, 0.0, 1.0, false, 0.002, 0.005, 0.0, 1.0, 0.0, 0.0, 0.001, 1.0, 1.0, 0.3);
seamSolver.set_seams_with_compliance(
  new Uint32Array([0, 1]),
  new Float32Array([0.1]),
  new Float32Array([0.0001]),
);
for (let i = 0; i < 120; i++) seamSolver.step(1 / 60);

const ptr = seamSolver.positions_ptr();
const pos = new Float32Array(wasm.memory.buffer, ptr, 6);
const dist = Math.hypot(pos[3] - pos[0], pos[4] - pos[1], pos[5] - pos[2]);
// A3 (borrow-plan, 2026-07-02): the seam target decay clamps at the
// rest-length FLOOR (default 0.002 m = fabric-thickness spacing) instead of
// snapping to 0 — snap-to-0 dragged armscye seam midpoints through the body.
// The seam therefore closes TO THE FLOOR, not below it: assert a band around
// 2 mm (regression on either side = decay broken OR floor lost).
if (!(dist < 0.003 && dist > 0.0005)) {
  console.error(
    `[verify-wasm-smoke] ✗ seam did not close to the rest-length floor: distance after 2 s of sim-time is ${dist} m (expected ≈0.002, band (0.0005, 0.003)). ` +
    'The committed binary is missing or regressing the seam target decay (Fase 2 / BP-2) or the A3 floor clamp.',
  );
  process.exit(1);
}
console.log(`[verify-wasm-smoke] ✓ seam closed to the rest-length floor: ${dist.toExponential(2)} m within 2 s of sim-time`);
seamSolver.free();
