## Summary

Implement a comprehensive fit analysis system that provides real-time visual feedback on garment fit quality through color-mapped overlays on the 3D cloth mesh. This is the single highest-impact feature gap relative to implementation cost — the XPBD solver already computes all the underlying data.

**Competitive context:** Both CLO3D and Browzwear ship stress, strain, fit, and pressure maps as core features. These are considered essential by every professional pattern maker for validating garment fit before physical sampling.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §9 — Fit Analysis & Visualization](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Stress Map
- Visualize constraint force magnitudes per triangle as a heat map (blue → green → red)
- Shows where the garment is under tension from the avatar body
- Data source: XPBD distance constraint lambda values (already computed in solver)
- Red indicates tight/uncomfortable areas; blue indicates loose

### Strain Map
- Display stretch/distortion ratio: `currentLength / restLength` per edge
- 100% = no deformation, >120% = red (overstretched)
- Directional strain: separate warp, weft, and shear strain visualization
- Data source: edge rest lengths vs simulated lengths (already in solver)

### Fit Map (Ease Visualization)
- Color-code garment-to-body distance at each cloth vertex
- Negative ease (penetration) = red, tight fit = orange, ideal ease = green, loose = blue
- Requires: ray cast or nearest-point query from each cloth vertex to avatar collision mesh
- Configurable ease thresholds (e.g., 0–2cm = tight, 2–5cm = ideal, >5cm = loose)

### Pressure Map
- Show normal contact force at collision points between garment and body
- High pressure = red (discomfort), zero pressure = transparent
- Data source: collision response forces in `solveTriangleCollision` (already computed)

### 3D Measurement Tapes
- Place measurement lines on the 3D simulated garment surface
- Linear (point-to-point) and circumference (wrap-around) modes
- Measurements update in real-time as simulation runs
- Display measurement value as a floating label

### 2D vs 3D Comparison
- Side-by-side comparison of flat pattern dimensions vs simulated 3D dimensions
- Highlight edges where 3D measurement deviates from 2D by more than a threshold
- Useful for identifying pattern pieces that distort significantly during draping

### Point of Measure (POM)
- Create named measurement rulers on 2D pattern pieces
- POM measurements display across all graded sizes
- Export POM data as CSV or include in tech pack

---

## Implementation Strategy

### Phase 1: Solver Data Extraction
1. Expose per-edge strain values from XPBD solver (`xpbdSolver.ts` + `lib.rs`)
2. Expose per-vertex collision force magnitudes from `triangleCollision.ts`
3. Add worker messages: `getStrainData`, `getStressData`, `getPressureData`

### Phase 2: Vertex Color Rendering
1. Create `FitMapShader` — custom Three.js `ShaderMaterial` with vertex color attribute
2. Map data arrays to color ramp (configurable: rainbow, red-blue diverging, monochrome)
3. Add `<FitMapOverlay>` R3F component that reads solver data each frame
4. Toggle between map types via toolbar button or dropdown

### Phase 3: Measurement Tools
1. Implement `MeasureTape3D` tool — click two points on cloth mesh, compute geodesic distance
2. Implement `CircumferenceTape3D` — define a cutting plane, compute intersection perimeter
3. Persistent measurement labels with real-time update

### Phase 4: POM & Comparison
1. POM ruler tool in 2D editor — snap to pattern edges, store as metadata
2. 2D/3D comparison panel — table of measurements with delta highlighting

---

## Key Files to Modify

- `src/utils/cloth/xpbdSolver.ts` — expose strain/stress arrays
- `crates/xpbd-wasm/src/lib.rs` — expose via `strain_ptr()` / `stress_ptr()`
- `src/utils/cloth/triangleCollision.ts` — expose collision force magnitudes
- `src/components/Viewport3D/` — new `FitMapOverlay.tsx` component
- `src/components/Toolbar/` — fit analysis toolbar buttons

## Related Issues

- #32 — Diagnostic inspector (related but scoped to click-to-inspect)
- #31 — Kinematic comfort evaluation (fit maps during movement)
- #29 — Diagnostic fit maps (closed — initial implementation; this issue is the production version)
- #28 — Volume simulation, internal pressure

## Acceptance Criteria

- [ ] Stress map renders correctly on simulated garment with color legend
- [ ] Strain map shows directional stretch with configurable thresholds
- [ ] Fit map computes garment-to-body distance and renders heat overlay
- [ ] Pressure map highlights contact pressure points
- [ ] Map type can be toggled via UI without restarting simulation
- [ ] 3D measurement tape tool places persistent measurements on garment surface
- [ ] POM tool creates named rulers on 2D patterns
- [ ] Performance: map overlay adds <2ms per frame at 60fps
