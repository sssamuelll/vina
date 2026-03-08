# #265 — Group Pieces

> **Labels**: `feature`, `gerber-integration`, `ux`, `tier-c`
> **Milestone**: v0.8
> **Priority**: Sprint 5

## Summary

Select and batch-operate on multiple pattern pieces simultaneously through named groups.

## Motivation

Gerber V2025.1 added group pieces for batch PDS actions. In complex garments (20+ pieces), operating on individual pieces is slow. Groups allow batch operations like "set all lining pieces to LINING fabric code" or "apply 1cm seam allowance to all bodice pieces".

## Requirements

### Core
- [ ] Multi-select pieces → create named group
- [ ] Persistent groups stored in project data
- [ ] Group = logical collection (not geometric merge)
- [ ] Pieces can belong to multiple groups

### Group Operations
- [ ] Move (translate all pieces in group)
- [ ] Set fabric code (batch assign)
- [ ] Apply seam allowance (batch)
- [ ] Mirror (batch)
- [ ] Export (export only group pieces)
- [ ] Delete group (remove grouping, not pieces)

### UI
- [ ] Group panel: list of groups with member counts
- [ ] Drag pieces to add/remove from group
- [ ] Click group name → select all members
- [ ] Group color coding in 2D viewport

### Copilot Integration
- [ ] Tool: `groupPieces({ name: "bodice", pieces: ["front-bodice", "back-bodice", "sleeve"] })`
- [ ] Tool: `applyToGroup({ group: "bodice", action: "setFabricCode", params: { code: "SELF" } })`

## Dependencies

- None (standalone)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §14
