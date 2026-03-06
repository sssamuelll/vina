## Summary

Implement pleats, fold arrangement, and elastic simulation tools. These construction techniques are fundamental to structured garments (skirts, trousers, sportswear) and are standard in both CLO3D and Browzwear.

**Competitive context:** Both competitors offer knife pleats, box pleats, fold arrangement on internal lines, and elastic edge simulation. These are essential for tailored garments and activewear.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §2 — Sewing & Construction](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Knife Pleats
- Create evenly-spaced knife pleats along a pattern edge or internal line
- Configurable: pleat width, pleat depth, direction (left/right), count
- 2D visualization: pleat fold lines with direction arrows
- 3D simulation: pleated geometry folds correctly during draping

### Box Pleats
- Create box pleats (two knife pleats facing each other)
- Configurable: box width, pleat depth, spacing
- Inverted box pleat option
- Stitched-down pleats: specify stitching depth from top

### Fold Arrangement
- Apply fold angles on internal lines (hems, facings, cuffs)
- Configurable fold angle (0°–360°)
- Multiple fold types: single fold, double fold, rolled hem
- Fold order for multi-layer folds
- 3D simulation: folded edges maintain fold during draping

### Elastic Edges
- Apply elastic properties to any pattern edge
- Configurable: relaxed length, stretched length, elastic force
- Simulation: elastic edges contract during draping, creating gathering
- Visual: elastic band rendering along edge in 2D and 3D
- Elastic waistband, cuffs, and neckline support

---

## Implementation Strategy

### Phase 1: Data Model
1. Add `Pleat` type: position, width, depth, direction, type (knife/box)
2. Add `Fold` type: internal line reference, angle, fold type
3. Add `ElasticEdge` type: edge reference, relaxed/stretched lengths, force constant
4. Store in pattern piece metadata

### Phase 2: 2D Tools
1. Pleat tool: click on edge/line → configure pleat parameters
2. Fold tool: click on internal line → set fold angle
3. Elastic tool: click on edge → set elastic properties
4. 2D visualization: fold lines, pleat arrows, elastic indicators

### Phase 3: 3D Simulation Integration
1. Pleats: generate folded geometry from flat pattern before simulation
2. Folds: apply angular constraints at fold lines in XPBD solver
3. Elastic: add spring constraints with target length at elastic edges
4. Modify `xpbdSolver.ts` and `lib.rs` to handle fold/elastic constraints

### Phase 4: Polish
1. Pleat templates: standard pleat configurations
2. Elastic gathering preview in 2D
3. Fold order visualization for multi-fold constructions

---

## Key Files to Modify

- `src/core/pattern/` — pleat, fold, elastic data on pattern pieces
- `src/utils/cloth/xpbdSolver.ts` — fold angle and elastic constraints
- `crates/xpbd-wasm/src/lib.rs` — WASM solver fold/elastic support
- `src/components/Toolbar/` — pleat, fold, elastic tool buttons

## Related Issues

- #191 — Fold Arrangement Tool (existing — this expands scope to include pleats + elastic)
- #121 — 3D Interaction Tools (fold/pin tools)

## Acceptance Criteria

- [ ] Knife pleat tool creates evenly-spaced pleats along pattern edges
- [ ] Box pleat tool creates box pleats with configurable width and depth
- [ ] Fold arrangement applies angle constraints on internal lines
- [ ] Multi-fold ordering works (e.g., double-fold hem)
- [ ] Elastic edges contract during simulation, creating gathering
- [ ] Pleats render correctly in 3D simulation
- [ ] Fold angles maintained during draping
- [ ] 2D visualization shows pleat direction arrows and fold lines
