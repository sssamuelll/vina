# #260 — Pre-Marking Rules

> **Labels**: `feature`, `gerber-integration`, `production`, `tier-b`
> **Milestone**: v0.8
> **Priority**: Sprint 5

## Summary

Define piece placement rules that the nesting engine must respect before optimization — ensuring critical pieces get priority positioning.

## Motivation

In production, certain pieces must be placed in specific ways: "front bodice always at fold edge", "collar always first on grain", "paired pieces adjacent". Gerber's Pre-Marking Rules automate this. Without them, nesting is purely optimization-driven and may violate production constraints.

## Requirements

### Rule Types
- [ ] **At fold** — piece must be placed at fabric fold edge
- [ ] **At edge** — piece must be placed at left/right selvage
- [ ] **Pair with** — two pieces must be adjacent (e.g., left/right front)
- [ ] **Minimum distance** — minimum gap from another specific piece
- [ ] **Priority** — placement order (1 = first placed, highest priority)
- [ ] **Grain tilt allowance** — max degrees off-grain permitted for this piece

### Rule Storage
- [ ] Rules stored as piece metadata
- [ ] Per-model rule set (applies to all markers for this model)
- [ ] Rules exportable/importable as JSON

### UI
- [ ] Rule editor panel: visual rule builder
- [ ] Drag pieces to assign placement rules
- [ ] Rule preview: show constrained zones on fabric layout

### Copilot Integration
- [ ] Tool: `setPlacementRule({ piece: "front-bodice", rule: "atFold" })`
- [ ] Tool: `setPiecePriority({ piece: "collar", priority: 1 })`

## Technical Notes

- Rules consumed as constraints by nesting engine (#233)
- Rules reduce nesting search space (faster convergence)
- Compatible with DXF export (rules as annotations)

## Dependencies

- #233 Nesting & Fabric Consumption (nesting engine consumes rules)
- #257 Fabric Codes (rules may be per-fabric-code)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §9
- [Nesting API](../api/nesting.md)
