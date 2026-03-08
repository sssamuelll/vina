# #254 — Shrink/Stretch Compensation

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 2

## Summary

Automatically adjust pattern dimensions to compensate for fabric shrinkage or stretch during manufacturing processes (washing, finishing, heat treatment).

## Motivation

Most fabrics change dimensions during manufacturing. Cotton twill can shrink 3-5% in warp direction after washing. Knits may stretch 2-3% in weft. Pattern makers must compensate by enlarging (for shrinkage) or reducing (for stretch) the pattern. This is tedious to do manually and error-prone — especially across graded sizes.

## Requirements

### Core
- [ ] Per-piece shrinkage values: `shrinkWarp%`, `shrinkWeft%`
- [ ] Compensation = inverse scale along grain direction (3% shrink → 1.03x scale)
- [ ] Linked to fabric code (#257) — changing fabric auto-applies its shrinkage profile
- [ ] Shrinkage profiles stored in `PhysicalFabric` entries
- [ ] Graded sizes auto-update when compensation changes
- [ ] Toggle: show pattern with/without compensation applied

### Shrinkage Profile Data
- [ ] Add `shrinkageWarp`, `shrinkageWeft` fields to PhysicalFabric type
- [ ] Populate defaults for existing 32+ fabric presets
- [ ] Allow user override per project

### UI
- [ ] Shrinkage fields in fabric properties panel
- [ ] Visual indicator on piece when compensation is active (e.g., icon badge)
- [ ] Before/after overlay: original outline vs compensated outline

### Copilot Integration
- [ ] Tool: `applyShrinkCompensation({ fabric: "cotton-twill", warp: 3.5, weft: 1.2 })`
- [ ] Tool: `removeShrinkCompensation({ piece: "front-bodice" })`

## Technical Notes

- Compensation is an affine scale along grain direction
- Grain angle already stored per piece (grainline)
- Must update seam allowance geometry after compensation
- DXF export should include compensated dimensions

## Dependencies

- #257 Fabric Codes on Pieces (fabric code → shrinkage profile linkage)
- Existing `src/utils/cloth/physicalFabric.ts`

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §3
- [Physical Fabric Library](../../src/utils/cloth/physicalFabric.ts)
