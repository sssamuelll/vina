# #262 — DXF Wizard (Auto-Detect Format)

> **Labels**: `feature`, `gerber-integration`, `interop`, `tier-b`
> **Milestone**: v0.8
> **Priority**: Sprint 4

## Summary

Automatically detect DXF file format on import (AAMA, ASTM D6673, standard DXF, Gerber, Lectra) and select the correct parser pipeline.

## Motivation

Users migrating from other CAD systems often don't know the exact DXF format their files use. Wrong format selection leads to failed imports or garbled geometry. Gerber's DXF Wizard (V10.4+) auto-detects format. OpenClo should do the same — zero-friction import for users switching from any system.

## Requirements

### Format Detection
- [ ] **AAMA** — detect layers 1-15 (boundary, internal, notch, grainline, etc.)
- [ ] **ASTM D6673** — detect ASTM-specific layer naming conventions
- [ ] **Standard DXF** — generic AutoCAD DXF (no garment-specific layers)
- [ ] **Gerber AM** — detect AccuMark-specific layer names and metadata
- [ ] **Lectra IBA** — detect Lectra-specific format markers

### Detection Heuristics
- [ ] Analyze layer names against known patterns
- [ ] Check entity types and structure
- [ ] Parse header/comments for format identifiers
- [ ] Confidence score per format (0-100%)

### UI
- [ ] On DXF import: auto-detect runs first
- [ ] If confident (>80%): proceed with detected format, show info banner
- [ ] If ambiguous: dialog showing detected format + alternatives with confidence scores
- [ ] "Always use [format]" preference option

### Copilot Integration
- [ ] Tool: `importDXF({ file: "pattern.dxf", autoDetect: true })`
- [ ] Tool: `detectDXFFormat({ file: "pattern.dxf" })` → returns format + confidence

## Technical Notes

- Detection is pure parsing (no external dependencies)
- Extend existing DXF import pipeline (`src/utils/import/`, `docs/api/dxf.md`)
- Layer name matching uses regex patterns per format spec

## Dependencies

- Existing DXF import system
- #227 (RUL import for Gerber format)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §11
- [DXF API](../api/dxf.md)
- [DXF Import Completion Plan](../plans/2026-03-04-dxf-import-completion-design.md)
