/**
 * Config bridge — translate CPU `ClothSimConfig` partial to WASM
 * `WasmSolverConfig` partial for the shared subset of fields.
 *
 * **A2 Fase 2 § 3.2.B ratified** — Pattern 2.5 hybrid lite. Used at UI bridge
 * layers (e.g., `GarmentSimulation.tsx`) when the same UI control affects both
 * solver tiers and we want to write the canonical CPU shape once + translate
 * to WASM shape via this helper.
 *
 * **Field cleavage:**
 * - **15 shared fields (renamed):** `numSubsteps`→`substeps`,
 *   `clothThickness`→`thickness`, `stretchingCompliance`→`stretchCompliance`,
 *   `bendingCompliance`→`bendCompliance`, `gravity[1]`→`gravityY`. Other
 *   shared fields (`damping`, `selfCollision`, `groundY`, `dragCoefficient`,
 *   `stretchComplianceWarp/Weft/Shear`, `bendComplianceWarp/Weft`,
 *   `internalDamping`) pass through with same name.
 * - **8 CPU-only fields silently dropped:** `groundFriction`,
 *   `adaptiveSubsteps`, `minSubsteps`, `maxSubsteps`, `maxVelocity`,
 *   `enableLRA`, `dt`, `windForce`. The first 6 are A7-ratified CPU-only
 *   architectural location; `dt` is hardcoded 1/60 in WASM worker;
 *   `windForce` flows through separate `setWind()` API on `WasmSolverClient`
 *   (per A6 § 3.6 #683 follow-up).
 * - **1 WASM-only field absent:** `collisionMargin`. CPU uses `clothThickness`
 *   for both inflation + margin (see `setCapsuleColliders` margin assignment
 *   in `xpbdSolver.ts`). Subtle architectural cleavage preserved per A2 § 2.5.
 *
 * **Forward-only convention:** new shared field added to `ClothSimConfig`
 * should also be mapped here (declare in Rust constructor first per
 * `CLAUDE/methodology.md` § 15 — Rust constructor canonical for cross-tier
 * shared field defaults). Tier-specific fields stay in their own surface.
 *
 * Cross-ref: `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`.
 *
 * @module configBridge
 */

import type { ClothSimConfig } from './xpbdSolver';
import type { WasmSolverConfig } from './wasm/wasmSolverClient';

/**
 * Translate a partial CPU `ClothSimConfig` to the equivalent WASM
 * `WasmSolverConfig` shape. CPU-only fields are silently dropped.
 *
 * Caller intent using this helper is "set the cross-tier shared subset". For
 * CPU-only knobs (e.g., `enableLRA`, `adaptiveSubsteps`), call
 * `clients.cpu.setConfig(...)` directly without going through this helper.
 */
export function mapClothSimConfigToWasmSolverConfig(
  cpu: Partial<ClothSimConfig>,
): Partial<WasmSolverConfig> {
  const out: Partial<WasmSolverConfig> = {};
  if (cpu.numSubsteps !== undefined) out.substeps = cpu.numSubsteps;
  if (cpu.gravity !== undefined) {
    if (Array.isArray(cpu.gravity) && cpu.gravity.length === 3 && typeof cpu.gravity[1] === 'number') {
      out.gravityY = cpu.gravity[1];
    } else if (import.meta.env.MODE !== 'production') {
      console.warn('[configBridge] gravity must be [number, number, number]; got', cpu.gravity);
    }
  }
  if (cpu.damping !== undefined) out.damping = cpu.damping;
  if (cpu.stretchingCompliance !== undefined) out.stretchCompliance = cpu.stretchingCompliance;
  if (cpu.bendingCompliance !== undefined) out.bendCompliance = cpu.bendingCompliance;
  if (cpu.selfCollision !== undefined) out.selfCollision = cpu.selfCollision;
  if (cpu.clothThickness !== undefined) out.thickness = cpu.clothThickness;
  if (cpu.groundY !== undefined) out.groundY = cpu.groundY;
  if (cpu.dragCoefficient !== undefined) out.dragCoefficient = cpu.dragCoefficient;
  if (cpu.stretchComplianceWarp !== undefined) out.stretchComplianceWarp = cpu.stretchComplianceWarp;
  if (cpu.stretchComplianceWeft !== undefined) out.stretchComplianceWeft = cpu.stretchComplianceWeft;
  if (cpu.stretchComplianceShear !== undefined) out.stretchComplianceShear = cpu.stretchComplianceShear;
  if (cpu.bendComplianceWarp !== undefined) out.bendComplianceWarp = cpu.bendComplianceWarp;
  if (cpu.bendComplianceWeft !== undefined) out.bendComplianceWeft = cpu.bendComplianceWeft;
  if (cpu.internalDamping !== undefined) out.internalDamping = cpu.internalDamping;
  return out;
}
