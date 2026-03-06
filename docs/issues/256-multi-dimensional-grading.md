# #256 — Multi-Dimensional Grading

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 3

## Summary

Extend the grading system to support simultaneous grading across multiple body dimensions (e.g., bust × height × hip), enabling size matrices like 12 Petite / 12 Regular / 12 Tall.

## Motivation

Current OpenClo grading is single-axis (XS → XXL linear). Real production grading often requires 2-3 dimensions. For example, a dress may grade across bust circumference (primary) and body height (secondary). This is standard in Gerber AccuMark and essential for brands with extended size ranges (Petite/Regular/Tall, or US women's sizing with cup variations).

## Requirements

### Core
- [ ] Grade table axes: primary + secondary + optional tertiary dimension
- [ ] Size matrix: cells represent unique size combinations (e.g., 12P, 12R, 12T)
- [ ] Per-point grade rules support multi-axis deltas (dx, dy per axis combination)
- [ ] Compatible with existing single-axis grading (1D = special case of nD)

### Grade Rule Format
- [ ] Extend grade rule to: `{ point, deltaX: { bust: 1.5, height: 0 }, deltaY: { bust: 0.3, height: 2.0 } }`
- [ ] Import/export RUL files with multi-dimensional data (#227)
- [ ] Interpolation between defined sizes

### UI
- [ ] Size table editor: spreadsheet-style with row/column axes
- [ ] Axis definition: name, values, unit (e.g., Height: Petite/Regular/Tall)
- [ ] Graded nest overlay: select which sizes to display
- [ ] Size selector dropdown shows matrix (not just linear list)

### Copilot Integration
- [ ] Tool: `grade({ dimensions: { bust: [82,86,90], height: ["petite","regular","tall"] } })`
- [ ] Tool: `setGradeRule({ point, axis: "height", delta: { dx: 0, dy: 2.0 } })`

### Export
- [ ] DXF export includes all graded sizes with dimension metadata
- [ ] Size table exportable as CSV

## Technical Notes

- Extend existing grading engine (`docs/api/grading.md`)
- Grade rule storage: Map<axisCombo, {dx, dy}> per point
- Performance: lazy computation of graded sizes (only compute visible ones)

## Dependencies

- #227 Advanced Grading System (extends existing issue)
- Existing grading engine

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §5
- [Grading API](../api/grading.md)
- [Issue #227 — Advanced Grading](./227-advanced-grading-system.md)
