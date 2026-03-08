## Summary

Implement production-grade pattern nesting (marker making) with automatic layout optimization and fabric consumption calculation. This is the bridge between design and cutting room — essential for manufacturing cost estimation.

**Competitive context:** CLO3D uses a pairwise clustering algorithm achieving 1–2% improvement over basic nesting. Browzwear offers similar capabilities. Both calculate fabric consumption from nested layouts.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §12 — Production Output](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Automatic Nesting
- Arrange all pattern pieces on a virtual fabric roll with minimum waste
- Respect grainline direction (rotation constraints)
- Configurable roll width (standard: 150cm, 112cm, 90cm, custom)
- Gap/margin between pieces (default: 1cm)
- Support for one-way and two-way fabric (print direction constraints)

### Manual Adjustment
- Drag and rotate pieces within nested layout
- Snap to grid, snap to adjacent piece edge
- Lock individual pieces in place
- Undo/redo within nesting view

### Fabric Consumption
- Total length (yardage/meters) based on nested layout
- Report by fabric type (if multi-fabric garment)
- Waste percentage: `(totalArea - piecesArea) / totalArea`
- Per-size consumption (when grading is applied)

### Nesting View
- Dedicated 2D view showing fabric roll with nested pieces
- Roll dimensions displayed (width × calculated length)
- Color-coded pieces (by type or by size for graded nesting)
- Zoom/pan navigation

### Texture-Aware Nesting
- For patterned fabrics (stripes, plaids), align pieces to pattern repeat
- Repeat distance configuration
- Visual overlay of fabric pattern grid on nesting view

---

## Implementation Strategy

### Phase 1: Nesting Algorithm
1. Implement bottom-left-fill (BLF) heuristic as baseline
2. Add no-fit polygon (NFP) computation for precise piece interlocking
3. Rotation options: 0°, 180° (with grain), or 0°/90°/180°/270° (without grain)
4. Optimization: genetic algorithm or simulated annealing for layout improvement

### Phase 2: Nesting UI
1. Dedicated nesting view canvas
2. Drag & drop manual adjustment
3. Roll width selector and gap controls
4. Auto-nest button with progress indicator

### Phase 3: Consumption Calculation
1. Compute bounding rectangle of nested layout
2. `consumption = rollWidth × layoutLength`
3. Per-fabric and per-size breakdown
4. Display in nesting view and export to BOM (#223)

### Phase 4: Texture-Aware
1. Fabric repeat pattern overlay
2. Piece rotation constrained to pattern alignment
3. Visual validation of pattern matching

---

## Related Issues

- #195 — Nesting Layout Tool (existing — this expands with consumption and optimization)
- #5 — Integrate DeepNest/SVGNest (closed — initial research)
- #223 — BOM Generation (consumption feeds into BOM)

## Acceptance Criteria

- [ ] Auto-nesting arranges pieces on configurable roll width
- [ ] Grainline constraints respected during nesting
- [ ] Manual drag & rotate adjustment within nesting view
- [ ] Fabric consumption (meters/yards) calculated from layout
- [ ] Waste percentage displayed
- [ ] Per-size consumption for graded garments
- [ ] Configurable gap between pieces
- [ ] Nesting result exportable as DXF marker
