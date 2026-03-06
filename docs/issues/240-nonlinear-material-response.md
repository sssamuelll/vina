## Summary

Implement non-linear material response in the XPBD cloth solver. Real fabrics exhibit non-linear stress-strain behavior — they stiffen under load and have different responses in different stretch ranges. The current solver uses constant compliance values, which produces unrealistic behavior for stretch fabrics and technical textiles.

**Competitive context:** CLO3D's solver accounts for non-linear fabric behavior. This produces more realistic drape for fabrics like jersey, denim, and technical stretch materials.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §3 — 3D Simulation & Draping](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Piecewise-linear or polynomial stress-strain curves per fabric
- Separate curves for warp, weft, and shear directions
- Strain-dependent compliance in XPBD distance constraints
- Configurable curve via control points or textile test data (KES/FAST input)
- Visual curve editor UI for fabric stress-strain characterization
- Hysteresis support for loading/unloading cycles (stretch and recovery)

---

## Implementation Strategy

1. Replace constant `compliance` in distance constraints with `compliance(strain)` function
2. Store stress-strain curve as array of `(strain, compliance)` control points per fabric
3. Interpolate compliance at runtime based on current edge strain
4. Add curve editor UI to fabric property panel
5. Update both `xpbdSolver.ts` and `lib.rs` (WASM)

## Acceptance Criteria

- [ ] Distance constraint compliance varies with current strain
- [ ] Per-fabric stress-strain curves (warp, weft, shear)
- [ ] Curve editor UI with control point manipulation
- [ ] Import KES/FAST test data as curve input
- [ ] Visible difference in drape behavior vs linear model
