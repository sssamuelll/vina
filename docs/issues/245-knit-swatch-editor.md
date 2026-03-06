## Summary

Build a knit swatch editor for stitch-level knitwear design and simulation. Define knit structures, control gauge (wales/courses per inch), select stitch types, and preview shrinkage behavior.

**Competitive context:** CLO3D introduced a Knit Swatch Editor in 2025.2 with stitch-type selection, gauge settings, and live shrinkage preview. This is a niche but growing segment for activewear and fashion knitwear.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §4 — Fabric & Material System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Stitch type selection: jersey, rib (1x1, 2x2), interlock, purl, cable
- Gauge settings: wales per inch, courses per inch
- Yarn thickness and material properties
- Live shrinkage preview: show how knit structure affects pattern dimensions
- Swatch preview: visual representation of stitch pattern
- Export to physical fabric properties for simulation
- Integration with pattern: auto-adjust pattern dimensions for knit shrinkage

## Implementation Strategy

1. Define `KnitSwatch` type: stitch pattern, gauge, yarn properties
2. Stitch pattern editor: grid-based stitch placement
3. Compute effective fabric properties from knit structure
4. Shrinkage calculation: ratio of knit gauge to target dimensions
5. Apply shrinkage to pattern piece dimensions before simulation

## Acceptance Criteria

- [ ] Stitch type selector with at least 5 knit structures
- [ ] Gauge settings (wales/courses per inch) with numerical input
- [ ] Swatch preview renders stitch pattern visually
- [ ] Shrinkage preview shows pattern dimension changes
- [ ] Knit properties export to simulation fabric parameters
