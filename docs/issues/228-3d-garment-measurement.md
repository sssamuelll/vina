## Summary

Implement 3D garment measurement tools that allow users to place measurement tapes on simulated garments, create Points of Measure (POM), and compare flat pattern dimensions against simulated 3D dimensions.

**Competitive context:** CLO3D and Browzwear both offer linear and circumference measurement tools on 3D garments, POM creation on 2D patterns, and 2D-vs-3D comparison. These are essential for fit validation.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §9 — Fit Analysis & Visualization](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Linear 3D Measurement
- Click two points on the 3D garment surface to measure straight-line distance
- Optionally measure along the surface (geodesic distance)
- Persistent measurement labels that update in real-time during simulation
- Named measurements (e.g., "Center Back Length", "Shoulder Width")

### Circumference 3D Measurement
- Define a circumference by 3 clicks (sets a cutting plane)
- Compute garment perimeter at that cross-section
- Useful for: bust, waist, hip, sleeve opening measurements
- Update in real-time as garment drapes

### Point of Measure (POM)
- Create named ruler measurements on 2D pattern pieces
- POM displays measurement values across all graded sizes
- Standard POM positions: HPS to waist, across shoulder, chest width, etc.
- Export POM data as CSV or include in tech pack (#223)

### 2D vs 3D Comparison
- Table showing flat pattern measurement vs simulated 3D measurement
- Delta column: absolute and percentage difference
- Highlight rows where delta exceeds threshold (e.g., >5%)
- Useful for identifying pattern distortion during draping

---

## Implementation Strategy

### Phase 1: 3D Measurement Tool
1. Ray cast to cloth mesh → get 3D surface point
2. Compute distance between two selected points (straight-line and geodesic)
3. Render measurement line + label as `<Html>` overlay or `Line` geometry
4. Store measurements persistently

### Phase 2: Circumference
1. Three-click interface to define cutting plane
2. Compute mesh-plane intersection → closed polyline
3. Sum segment lengths for perimeter
4. Render circumference loop on garment

### Phase 3: POM
1. 2D measurement ruler tool — click two points on pattern outline
2. Store as named measurement with piece reference
3. Auto-compute for each graded size
4. Table view with all POMs across sizes

### Phase 4: Comparison Panel
1. For each POM, compute corresponding 3D measurement
2. Side-by-side table: 2D flat vs 3D simulated vs delta
3. Visual indicators for out-of-tolerance deltas

---

## Acceptance Criteria

- [ ] Linear 3D measurement between two points on cloth surface
- [ ] Geodesic (along-surface) measurement option
- [ ] Circumference measurement via 3-click plane definition
- [ ] Measurements update in real-time during simulation
- [ ] Named POM rulers on 2D patterns
- [ ] POM values displayed per graded size
- [ ] 2D vs 3D comparison table with delta highlighting
- [ ] POM data exportable as CSV
