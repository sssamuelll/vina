## Summary

Implement seam realism effects: puckering along sewn edges, bulk/thickness buildup at multi-layer seam junctions, and tack/basting stitch for temporary holds during construction.

**Competitive context:** CLO3D offers seam puckering and seam bulk. These add visual realism that distinguishes professional simulation from basic draping.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §2 — Sewing & Construction](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Seam Puckering
- Controlled vertex displacement along sewn seam edges
- Configurable pucker intensity (0–100%)
- Frequency parameter (puckers per cm)
- Applied post-simulation as vertex offset along seam normal

### Seam Bulk
- Increased thickness at seam junctions where multiple layers meet
- Collision offset increases at bulk points
- Visual: slightly raised ridge along seam line in 3D
- Configurable: number of layers, per-layer thickness

### Tack/Basting Stitch
- Temporary point-to-point constraints during construction
- Used for: basting before final sewing, temporary holds for fitting
- Visually distinct from permanent sewing (dashed line)
- Can be removed without affecting permanent seams

---

## Implementation Strategy

1. **Puckering:** Post-simulation vertex shader displacement along seam edges using simplex noise
2. **Bulk:** Increase collision margin at seam junction vertices; visual ridge via normal offset
3. **Tack:** Temporary distance constraints in XPBD solver with remove/add controls

## Acceptance Criteria

- [ ] Seam puckering renders along sewn edges with adjustable intensity
- [ ] Seam bulk increases visual thickness at multi-layer junctions
- [ ] Tack/basting stitch creates removable temporary holds
- [ ] All effects are per-seam configurable
