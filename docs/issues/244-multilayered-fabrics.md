## Summary

Implement multilayered fabric composites — bonded, fused, and laminated material stacks where multiple fabric layers behave as a single unit with combined physical properties.

**Competitive context:** Browzwear supports multilayered fabrics for technical garments (waterproof shells, padded jackets, fused interlinings). This is important for outerwear and technical sportswear design.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §4 — Fabric & Material System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Define fabric stack: ordered list of material layers
- Layer types: face fabric, interlining, lining, membrane, insulation
- Combined physical properties: weighted sum of layer properties
- Per-layer thickness contributing to total garment thickness
- Bonding type: fused (everywhere), quilted (at stitch lines), laminated
- Visual: cross-section view showing layer stack
- Simulation: single cloth mesh with combined properties

## Implementation Strategy

1. Add `FabricStack` type: array of `FabricLayer` with bonding method
2. Compute effective physical properties from stack composition
3. Total thickness = sum of layer thicknesses
4. Combined bending stiffness considers layer positions (moment of inertia)
5. UI: layer stack editor with add/remove/reorder

## Acceptance Criteria

- [ ] Define multi-layer fabric stacks with 2+ layers
- [ ] Effective physical properties computed from composition
- [ ] Total thickness reflects combined layers
- [ ] Cross-section view shows layer structure
- [ ] Simulation uses combined properties for drape behavior
