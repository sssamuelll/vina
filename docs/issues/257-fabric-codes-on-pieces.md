# #257 — Fabric Codes on Pieces

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 1

## Summary

Assign material/fabric identifiers (fabric codes) to each pattern piece, enabling BOM generation, production handoff, and interoperability with AccuNest/AccuMark.

## Motivation

Every production CAD system assigns fabric codes to pieces. Without them, a DXF export is just geometry — the cutting room doesn't know which fabric to cut each piece from. This is the single most important metadata field for production interoperability. It also enables automatic BOM generation (#223) and per-fabric nesting (#233).

## Requirements

### Core
- [ ] Each piece gets a `fabricCode` string field
- [ ] Standard codes: `"SELF"`, `"LINING"`, `"INTERLINING"`, `"CONTRAST-1"`, `"CONTRAST-2"`, `"FUSIBLE"`
- [ ] Custom codes allowed (free text)
- [ ] Fabric code → links to a `PhysicalFabric` entry for simulation properties
- [ ] Default fabric code: `"SELF"` for new pieces

### UI
- [ ] Fabric code field in piece properties sidebar
- [ ] Color-coded piece outlines by fabric code in 2D viewport
- [ ] Fabric code legend panel
- [ ] Batch assign: select multiple pieces → set fabric code

### Export
- [ ] DXF/AAMA export includes fabric code in metadata/annotation layer
- [ ] Pieces grouped by fabric code in marker/nesting output

### Copilot Integration
- [ ] Tool: `setFabricCode({ piece: "front-bodice", code: "SELF" })`
- [ ] Tool: `setFabricCode({ pieces: ["front-lining", "back-lining"], code: "LINING" })`
- [ ] Copilot can infer: "This is a lining piece" → auto-suggest `"LINING"` code

## Technical Notes

- Add `fabricCode: string` to piece data model
- Add `fabricCodeColorMap` to display settings
- Fabric code is metadata only — does not affect geometry

## Dependencies

- None (foundational — other features depend on this)
- Enables: #254 Shrink Compensation, #263 Colorways, #223 BOM, #233 Nesting

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §6
