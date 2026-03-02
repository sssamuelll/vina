# Internal Damping per Fabric - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-fabric internal damping so different fabrics settle at different rates (silk oscillates, denim stops quickly).

**Architecture:** Add `internalDamping` property to PhysicalFabric, pass to solver via config, apply in velocity damping.

**Tech Stack:** TypeScript (JS solver), Rust (WASM solver), Vitest (testing)

**Epic Issue:** #198, Task 4 (P3: Internal Damping)

---

## Design Notes

- Current: Global `damping = 0.99` applied to all velocities
- Proposed: Per-fabric `internalDamping` (0.0 = no damping, 1.0 = heavy damping)
- Formula: `dampingFactor = 1.0 - internalDamping * 0.1` (maps to 0.9-1.0 range)
- Typical values: Silk=0.1, Cotton=0.3, Jersey=0.4, Denim=0.6, Leather=0.8

---

## Task 1: Add internalDamping to PhysicalFabric interface

**Files:**
- Modify: `src/utils/cloth/physicalFabric.ts`

**Changes:**
1. Add `internalDamping: number` to `PhysicalFabric` interface (0.0-1.0)
2. Add `internalDamping` to all fabrics in `PHYSICAL_FABRIC_LIBRARY`
3. Update `toXPBDParams()` to include `internalDamping` in returned params
4. Update `isValidPhysicalFabric()` to validate the new property

**Typical Values:**
| Fabric Type | internalDamping |
|-------------|-----------------|
| Silk/Chiffon | 0.1 |
| Cotton | 0.3 |
| Jersey | 0.4 |
| Denim | 0.6 |
| Leather | 0.8 |

---

## Task 2: Add internalDamping to ClothSimConfig

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

**Changes:**
1. Add `internalDamping: number` to `ClothSimConfig` interface
2. Set default value: 0.3 (cotton-like)
3. Update `initPhysics()` to store the value
4. Add test for config property

---

## Task 3: Apply internal damping in TypeScript solver

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`

**Changes:**
1. Store `internalDamping` value from config
2. Update `preSolve()` to compute damping factor: `dampingFactor = 1.0 - internalDamping * 0.1`
3. Apply damping factor to velocities (replace fixed 0.99 or combine with it)

---

## Task 4: Implement internal damping in Rust WASM

**Files:**
- Modify: `crates/xpbd-wasm/src/lib.rs`

**Changes:**
1. Add `internal_damping: f32` field to XpbdSolver struct (default: 0.3)
2. Update `configure()` to accept `internal_damping` parameter
3. Update `pre_solve()` to use: `damping_factor = 1.0 - internal_damping * 0.1`
4. Build WASM

---

## Task 5: Update WASM worker interface

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts`

**Changes:**
1. Update `configure()` call with `internalDamping` parameter
2. Pass value from config (default 0.3)

---

## Task 6: Final integration and tests

**Steps:**
1. Run all tests
2. Build check
3. Verify damping behavior

---

## Success Criteria

- [ ] PhysicalFabric has internalDamping property
- [ ] Fabric library has appropriate damping values
- [ ] TypeScript and WASM solvers use internal damping
- [ ] All tests pass
- [ ] 60fps maintained
