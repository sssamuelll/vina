# #263 — Colorway Support (Gerber-style)

> **Labels**: `feature`, `gerber-integration`, `colorway`, `tier-b`
> **Milestone**: v0.8
> **Priority**: Sprint 4

## Summary

Implement Gerber-compatible colorway system: multiple color/fabric combinations per model without duplicating the pattern, using fabric code overrides.

## Motivation

Gerber handles colorways by overriding fabric codes per colorway — not by duplicating models. This is simpler and more production-compatible than CLO3D's approach. OpenClo's #221 (Colorway Management) should adopt this model for interoperability with AccuMark.

## Requirements

### Core
- [ ] Colorway = named map of `fabricCode → { color, material, texture }` overrides
- [ ] Single pattern model, multiple colorways (no duplication)
- [ ] Each colorway can override: color, fabric texture, physical fabric properties
- [ ] Default colorway = base fabric code assignments

### UI
- [ ] Colorway tab bar: A, B, C, D... (quick switch)
- [ ] Colorway editor: table of fabric codes × overrides
- [ ] 3D viewport updates material/color per active colorway
- [ ] 2D viewport shows piece outlines in colorway colors
- [ ] Add/remove/duplicate/rename colorways

### Export
- [ ] DXF export: base model + colorway metadata in notes layer
- [ ] Each colorway exportable as separate marker configuration
- [ ] Tech pack (#223) includes all colorways

### Copilot Integration
- [ ] Tool: `addColorway({ name: "Navy", overrides: { "SELF": "#1a237e", "CONTRAST-1": "#ffffff" } })`
- [ ] Tool: `switchColorway({ name: "Navy" })`
- [ ] Tool: `listColorways()`

## Technical Notes

- Colorway store: Map<colorwayName, Map<fabricCode, Override>>
- Override = { color?: string, material?: string, texture?: string, fabric?: PhysicalFabric }
- Active colorway drives 3D material assignment

## Dependencies

- #221 Colorway Management System (extends existing issue)
- #257 Fabric Codes on Pieces (colorway overrides fabric codes)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §12
- [Issue #221 — Colorway Management](../issues/)
