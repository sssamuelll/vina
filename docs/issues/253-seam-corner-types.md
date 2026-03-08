# #253 — Seam Corner Types (7+)

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 1

## Summary

Extend the seam allowance engine to support 7+ professional corner types: mitered, double mitered, envelope, squared, slant, match, and trim mirrored.

## Motivation

OpenClo currently uses equidistant offset for seam corners. Professional production patterns require specific corner treatments depending on the garment type, fabric, and sewing technique. These corner types are standard in Gerber AccuMark and expected by any production pattern maker.

## Requirements

### Corner Types
- [ ] **Mitered** — 45° miter at corner (most common for right angles)
- [ ] **Double Mitered** — miter with blunted tip (prevents bulk)
- [ ] **Envelope** — extended flap for folding (collars, facings)
- [ ] **Squared** — right-angle extension (belt loops, tabs)
- [ ] **Slant** — angled cut at corner (varies by angle)
- [ ] **Match** — corner geometry matches adjacent piece exactly
- [ ] **Trim Mirrored** — symmetric trim on both sides of corner

### Per-Corner Configuration
- [ ] Each vertex in a pattern piece can have its own corner type
- [ ] Default corner type configurable per piece (fallback for unset corners)
- [ ] Corner type stored in piece data model alongside seam allowance width

### UI
- [ ] Corner type dropdown in seam allowance panel
- [ ] Click vertex → select corner type from dropdown
- [ ] Preview corner geometry in real-time as type changes
- [ ] Batch apply: select multiple corners → set same type

### Export
- [ ] DXF export includes full corner geometry (not simplified offset)
- [ ] AAMA/ASTM layer compliance for seam allowance with corners

### Copilot Integration
- [ ] Tool: `setCornerType({ piece, vertex, type: "mitered" })`
- [ ] Tool: `setAllCorners({ piece, type: "mitered" })`

## Technical Notes

- Extend `src/core/geometry/` seam allowance algorithm
- Corner calculation is pure geometry — no simulation dependency
- Each corner type is a function: `(prevEdge, nextEdge, seamWidth, angle) → cornerPoints[]`

## Dependencies

- Existing seam allowance engine (`docs/api/seam-allowance.md`)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §2
- [Seam Allowance API](../api/seam-allowance.md)
