# #258 — Accordion Pleats & Create Fold

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `simulation`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 3

## Summary

Implement pleat creation tools (knife, box, accordion, inverted box) and fold/crease lines that generate pre-folded 3D geometry during simulation.

## Motivation

Pleats and folds are fundamental garment construction elements. Gerber AccuMark generates pre-folded patterns that their 3D engine respects. OpenClo's XPBD solver can simulate folds physically — we just need the 2D tooling to define them and the solver integration to apply fold constraints.

## Requirements

### Pleat Types
- [ ] **Knife pleat** — single-direction fold
- [ ] **Box pleat** — symmetric outward folds
- [ ] **Accordion pleat** — alternating knife pleats
- [ ] **Inverted box pleat** — symmetric inward folds

### Pleat Parameters
- [ ] Depth (fold depth in mm)
- [ ] Spacing (distance between pleats)
- [ ] Count (number of repeats)
- [ ] Direction (along edge or perpendicular)
- [ ] Fold line positions computed automatically

### Fold/Crease Lines
- [ ] Define fold line as internal line on piece
- [ ] Fold direction indicator (mountain/valley)
- [ ] Crease angle (default 180° for flat fold)
- [ ] Used for: collars, cuffs, waistbands, hems

### 3D Simulation
- [ ] Fold constraints applied before gravity drape in XPBD solver
- [ ] Pre-fold: solver starts with folded geometry, then drapes
- [ ] Fold stiffness parameter (how crisp the fold is)

### UI
- [ ] Pleat tool in toolbar: select edge → define pleat parameters
- [ ] Fold line tool: draw internal line → set as fold
- [ ] 2D view: pleat lines with fold direction arrows (▲/▼)
- [ ] Properties panel for pleat/fold parameters

### Export
- [ ] DXF export: fold lines as internal lines with metadata annotations
- [ ] Pleat data in piece metadata

### Copilot Integration
- [ ] Tool: `createPleat({ piece, edge, type: "accordion", depth: 15, count: 8 })`
- [ ] Tool: `createFold({ piece, line, direction: "mountain" })`

## Technical Notes

- 2D: pleat lines are internal lines with fold metadata
- 3D: fold constraints = angular constraints on edges adjacent to fold line
- Extends XPBD solver with fold constraint type
- Both Rust WASM and JS fallback need fold constraint support

## Dependencies

- #226 Pleats, Folds, Elastic (extends existing issue)
- XPBD solver modifications required

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §7
- XPBD solver: `crates/xpbd-wasm/src/lib.rs`, `src/utils/cloth/xpbdSolver.ts`
