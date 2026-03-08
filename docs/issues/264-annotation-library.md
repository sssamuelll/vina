# #264 — Annotation Library

> **Labels**: `feature`, `gerber-integration`, `production`, `tier-c`
> **Milestone**: v0.8
> **Priority**: Sprint 5

## Summary

Shared text templates for production notes on pattern pieces — pre-defined annotations like "CUT 2 ON FOLD", "GRAIN →", "NOTCH HERE".

## Motivation

Production patterns need standardized annotations for the cutting room and sewing floor. Gerber provides an annotation library (V16.1) with shared templates. This is simple metadata but critical for production handoff.

## Requirements

### Annotation Types
- [ ] Text label (free text)
- [ ] Production note (cutting instruction)
- [ ] QC instruction
- [ ] Care label reference
- [ ] Grain direction indicator

### Template Library
- [ ] Built-in templates: "CUT 2", "CUT 2 ON FOLD", "CUT 1", "GRAIN →", "INTERFACE", "NOTCH"
- [ ] Custom user-defined templates
- [ ] Template categories: cutting, sewing, QC, general

### Per-Piece Annotations
- [ ] Multiple annotations per piece
- [ ] Position: center, top, bottom, or custom coordinate
- [ ] Font size and style options
- [ ] Annotations visible in 2D view

### Export
- [ ] DXF export: annotations on AAMA layer 8 (text) or annotation layer
- [ ] Tech pack includes annotation data

### Copilot Integration
- [ ] Tool: `annotate({ piece: "front-bodice", text: "CUT 2 ON FOLD", position: "center" })`
- [ ] Tool: `listAnnotationTemplates()`

## Dependencies

- None (standalone)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §13
