## Summary

Extend the grading system with industry-standard grade rule (RUL) file import/export, nested size overlay view, per-point grading, 3D grading review (simulate each size), and graphic grading for print placement across sizes.

**Competitive context:** CLO3D and Browzwear both offer production-grade grading with RUL files, nested views, and 3D per-size review. OpenClo has basic XS–XXL grading but lacks the production workflow features.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §11 — Grading & Sizing](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Grade Rule Import/Export (RUL)
- Import industry-standard `.rul` grade rule files (Gerber, Lectra, Optitex formats)
- Export grade rules as `.rul` for interoperability
- Parse rule tables: per-point X/Y offsets per size break

### Nested Size Overlay View
- Display all graded sizes overlaid on a single pattern piece in 2D
- Color-coded size outlines (e.g., S=blue, M=green, L=orange, XL=red)
- Toggle individual sizes on/off
- Show grading arrows (X/Y offset vectors) at each graded point

### Per-Point Grading
- Assign different grade rules to different points on a pattern piece
- Grade rule editor: table of X/Y offsets per size per point
- Distance grading: set absolute distance from base for each size
- Offset grading: set incremental delta between adjacent sizes

### 3D Grading Review
- Simulate garment at each graded size on corresponding avatar
- Side-by-side or sequential comparison of all sizes
- Highlight fit issues per size (integrate with fit maps #219)
- Quick-switch between sizes in 3D viewport

### Graphic Grading
- Grade print/graphic placement across sizes
- Graphics scale and reposition proportionally per size
- Per-size graphic position overrides
- Depends on #222 (Print & Graphic Placement)

---

## Implementation Strategy

### Phase 1: RUL Parser
1. Implement `.rul` file parser for Gerber/Lectra formats
2. Map parsed rules to OpenClo grade rule data model
3. Export: serialize grade rules back to `.rul`

### Phase 2: Per-Point Grading
1. Extend grading data model: per-vertex grade offsets
2. Grade rule editor UI: spreadsheet-style table
3. Apply grade rules: compute graded point positions per size

### Phase 3: Nested Overlay
1. Render all graded sizes as overlapping outlines in 2D canvas
2. Color-code per size with legend
3. Toggle visibility per size
4. Grading arrow vectors at each point

### Phase 4: 3D Review
1. Size selector in 3D toolbar
2. On size switch: apply graded pattern, re-simulate
3. Side-by-side split viewport for size comparison

---

## Acceptance Criteria

- [ ] Import `.rul` grade rule files (at least Gerber format)
- [ ] Export grade rules as `.rul`
- [ ] Nested size overlay shows all sizes on one pattern in 2D
- [ ] Per-point grade rules editable in spreadsheet UI
- [ ] 3D grading review simulates each size on appropriate avatar
- [ ] Graphic grading adjusts print position per size
- [ ] Size comparison view (side-by-side or overlay)
