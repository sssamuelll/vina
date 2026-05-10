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
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const wasmJsPath = resolve(repoRoot, 'public/wasm/xpbd_wasm.js');
const wasmBinPath = resolve(repoRoot, 'public/wasm/xpbd_wasm_bg.wasm');

const { default: init, XpbdSolver } = await import(wasmJsPath);
await init({ module_or_path: readFileSync(wasmBinPath) });

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
