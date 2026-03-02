# Anisotropic Bending - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make bending constraints direction-dependent (warp/weft) so fabric bends differently along vs across grain.

**Architecture:** Classify each bend constraint by its shared edge's UV direction, store per-constraint compliance.

**Tech Stack:** TypeScript (JS solver), Rust (WASM solver), Vitest (testing)

**Epic Issue:** #198, Task 3 (P2: Anisotropic Bending)

---

## Design Notes

- Bend constraints are defined by the **shared edge** between two triangles
- Classify the shared edge as WARP or WEFT (no SHEAR for bending - only 2 directions)
- Use existing `classifyEdgeType()` but map SHEAR → average of WARP/WEFT

---

## Task 1: Update extractBendConstraints to include edge types

**Files:**
- Modify: `src/utils/cloth/gpu/gpuBuffers.ts`
- Test: `src/utils/cloth/gpu/__tests__/gpuBuffers.test.ts`

**Changes:**
1. Update BendConstraints interface to include edgeTypes
2. Modify extractBendConstraints to accept optional UVs
3. Classify shared edge and store edge type

---

## Task 2: Add bendComplianceWarp/Weft to ClothSimConfig

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts`

**Changes:**
1. Add bendComplianceWarp and bendComplianceWeft to interface
2. Add defaults (both 1.0 for isotropic default)
3. Add tests

---

## Task 3: Store per-constraint bend compliance in TS solver

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts`

**Changes:**
1. Add bendCompliances array
2. Classify edges in initPhysics
3. Update solveBending to use per-constraint compliance

---

## Task 4: Implement anisotropic bending in Rust WASM

**Files:**
- Modify: `crates/xpbd-wasm/src/lib.rs`

**Changes:**
1. Add bend_compliance_warp/weft fields
2. Add set_bend_with_types method
3. Update solve_bend to use per-constraint compliance
4. Build WASM

---

## Task 5: Update WASM worker interface

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts`
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts`

**Changes:**
1. Add set_bend_with_types to interface
2. Pass edgeTypes from extractBendConstraints
3. Update configure() with bend compliance params

---

## Task 6: Final integration and tests

**Steps:**
1. Run all tests
2. Build check
3. Verify anisotropic bending behavior

---

## Success Criteria

- [ ] Bend constraints classified by edge direction
- [ ] Per-constraint bend compliance stored and used
- [ ] TypeScript and WASM implementations match
- [ ] All tests pass
- [ ] 60fps maintained
