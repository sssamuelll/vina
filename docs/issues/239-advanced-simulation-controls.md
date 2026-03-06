## Summary

Add advanced simulation controls: directional wind with area gizmo, steam/press tool for wrinkle smoothing, per-pattern freeze/unfreeze, and simulation quality presets (fine/coarse resolution).

**Competitive context:** CLO3D offers wind with adjustable gizmo, steam/press, and freeze controls. These are workflow features that improve simulation productivity.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §3 — 3D Simulation & Draping](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Wind Simulation
- Directional wind force applied to cloth particles
- Wind gizmo: 3D arrow widget showing direction and area of influence
- Configurable: direction, strength, turbulence, area (bounded or unlimited)
- Multiple wind sources supported
- Animation: wind strength/direction can vary over time

### Steam/Press Tool
- Click-and-drag on garment surface to smooth wrinkles
- Reduces local velocity and relaxes constraint violations
- Simulates real steam pressing / garment finishing
- Configurable: pressure intensity, brush radius

### Freeze Individual Patterns
- Lock specific pattern pieces while simulating others
- Frozen pieces remain static (no physics applied)
- Useful for: simulating one layer at a time, fixing base while fitting overlay
- Toggle freeze per piece in object browser

### Simulation Quality Presets
- **Low:** fewer particles, faster simulation, coarser wrinkles
- **Medium:** balanced (default)
- **High:** more particles, finer wrinkles, slower
- Quick-switch between presets
- Custom: user-defined particle distance

---

## Implementation Strategy

1. **Wind:** Add wind force vector to XPBD pre-solve step; wind gizmo as `TransformControls` widget
2. **Steam/Press:** Brush tool that zeroes velocity and relaxes positions toward rest state in a radius
3. **Freeze:** Skip simulation step for frozen pieces; exclude from constraint solving
4. **Quality:** Map presets to `particleDistance` parameter; re-mesh when switching

## Key Files to Modify

- `src/utils/cloth/xpbdSolver.ts` — wind force, freeze logic
- `crates/xpbd-wasm/src/lib.rs` — WASM wind and freeze support
- `src/components/Toolbar/` — steam/press tool, quality selector

## Acceptance Criteria

- [ ] Wind applies directional force to cloth with visible effect
- [ ] Wind gizmo allows positioning and direction control
- [ ] Steam/press tool smooths wrinkles on click-drag
- [ ] Individual pieces can be frozen during simulation
- [ ] Quality presets (low/medium/high) change mesh resolution
- [ ] Multiple wind sources supported simultaneously
