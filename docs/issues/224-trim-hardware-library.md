## Summary

Build a comprehensive trim and hardware system covering buttons, zippers, snaps, rivets, buckles, elastic trims, drawstrings, and custom OBJ trim import. This expands the scope of #194 to cover every trim type found in CLO3D and Browzwear.

**Competitive context:** Both CLO3D and Browzwear include extensive trim libraries with parametric controls. Trims are essential for realistic garment visualization and accurate BOMs.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §5 — Trims & Hardware](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Parametric Buttons
- Button shapes: flat, shank, dome, toggle, snap
- Configurable: diameter, thickness, hole count, material/color
- Placement: click on pattern edge or internal point
- Buttonhole auto-generation: keyhole, bound, loop
- Spacing tool: distribute N buttons along an edge with equal spacing

### Zippers
- Draw zipper along pattern outline or internal line
- Configurable: tape width, tape color, teeth type (coil, molded, metal), teeth color
- Zipper puller: built-in puller shapes or custom OBJ import
- Open-end vs closed-end zipper types
- 3D rendering: teeth geometry along path

### Snaps & Rivets
- Snap types: prong, ring, post
- Rivet types: flat, cap, decorative
- Placement: click to place at pattern point
- Configurable: diameter, material finish (brass, nickel, matte)

### Buckles & Rings
- D-rings, O-rings, rectangle rings
- Belt buckles: single prong, double prong, roller
- Placement on strap/belt pattern edges
- Configurable: width, material, finish

### Elastic Trims
- Apply elastic properties to pattern edges
- Configurable: stretch ratio, width, gathered length
- Simulation: elastic edges contract during draping
- Visual: elastic band rendering on edge

### Drawstrings
- Place drawstring channel along internal line
- Configurable: cord diameter, cord material, channel width
- End stops and toggles as sub-trims
- Simulation: drawstring tension affects gathering

### Custom OBJ Trims
- Import arbitrary 3D models as trim elements
- Place on pattern surface at specified position/orientation
- Scale, rotate, and mirror controls
- Duplicate to symmetric pieces automatically

---

## Implementation Strategy

### Phase 1: Trim Data Model & Library
1. Define `Trim` base type with subtypes (button, zipper, snap, etc.)
2. Create `TrimLibrary` with built-in parametric trims
3. `trimStore.ts` — CRUD operations for trim placements

### Phase 2: Placement Engine
1. Trim placement tool — click on pattern edge/point to attach
2. Snap-to-edge and snap-to-point placement modes
3. Spacing tool for distributing trims along edges
4. Mirror-to-symmetric for linked pattern pieces

### Phase 3: 3D Rendering
1. Instanced mesh rendering for repeated trims (buttons, rivets)
2. Procedural geometry for zippers (teeth along path)
3. Custom OBJ loading for imported trims
4. Trims follow cloth mesh position during simulation

### Phase 4: BOM Integration
1. Auto-extract trim counts/types for BOM (#223)
2. Per-colorway trim color overrides (#221)

---

## Key Files to Create

- `src/types/trim.ts` — trim type definitions
- `src/stores/trimStore.ts` — trim placement state
- `src/components/TrimPanel/` — trim library browser and placement controls
- `src/components/Viewport3D/TrimRenderer.tsx` — 3D trim rendering

## Related Issues

- #194 — Trim Tools (existing issue — this supersedes with full scope)
- #221 — Colorway Management (per-colorway trim colors)
- #223 — BOM Generation (trims feed into BOM)

## Acceptance Criteria

- [ ] Parametric buttons with diameter, shape, color, and hole configuration
- [ ] Buttonhole auto-generation paired with buttons
- [ ] Zipper tool draws along pattern edges with configurable teeth/tape
- [ ] Snaps and rivets placeable at pattern points
- [ ] Buckles and rings attach to strap edges
- [ ] Elastic trims apply elastic properties and visual to edges
- [ ] Custom OBJ import for arbitrary trim meshes
- [ ] Trims render in 3D and follow cloth simulation
- [ ] Spacing tool distributes N trims along edge with equal gaps
- [ ] Mirror-to-symmetric auto-duplicates to linked pieces
- [ ] Trim data exports to BOM
