## Summary

Build an AI-powered pattern drafting tool that generates complete pattern pieces from body measurements and garment specifications. The system uses parametric patternmaking rules to produce production-ready patterns for bodices, trousers, skirts, and sleeves.

**Competitive context:** CLO3D introduced Pattern Drafter in 2025.0 with parametric generation for bodices, trousers, and skirts. OpenClo's copilot has some pattern generation capabilities, but lacks a dedicated parametric drafting engine.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §1 — 2D Pattern Design Tools](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Input: body measurements + garment type + ease preferences
- Output: complete pattern pieces with seam allowance, notches, grainline
- Supported block types: bodice (front/back), sleeve, trouser, skirt (A-line, straight, circle)
- Parametric ease controls: bust ease, waist ease, hip ease, sleeve ease
- Style variations: darted, princess-seamed, raglan, set-in sleeve
- Integration with AI copilot: "Draft a bodice for bust 92cm, waist 74cm, hip 98cm"
- Generated patterns feed directly into sewing and simulation pipeline

## Implementation Strategy

1. Encode patternmaking algorithms (Aldrich, Muller, or custom) as parametric functions
2. Input: measurement set → compute construction points → build piece outlines
3. Use existing `constructionResolver` pipeline for point-by-point pattern building
4. Copilot tool wrapper for natural language drafting commands
5. Template library for common block/style combinations

## Dependencies

- Copilot bridge system for AI-driven drafting commands
- Construction engine for parametric pattern generation

## Acceptance Criteria

- [ ] Generate bodice front/back from bust, waist, hip measurements
- [ ] Generate basic sleeve from arm measurements
- [ ] Generate trouser from waist, hip, inseam measurements
- [ ] Generate skirt (A-line, straight) from waist, hip measurements
- [ ] Ease controls adjust fit without regenerating from scratch
- [ ] Output includes seam allowance, notches, and grainline
- [ ] Copilot integration: generate patterns via natural language
