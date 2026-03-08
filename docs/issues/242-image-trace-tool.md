## Summary

Implement an image trace tool that allows users to import reference images (fashion sketches, technical drawings, photos) and trace over them to create pattern outlines. This bridges hand-drawn design with digital patternmaking.

**Competitive context:** CLO3D offers a trace tool for converting reference images to pattern geometry. This is commonly used by designers transitioning from paper to digital.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §1 — 2D Pattern Design Tools](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Import reference image (PNG, JPG, SVG, PDF) as background layer in 2D editor
- Image opacity control (0–100%) for tracing visibility
- Image scale calibration: set known dimension (e.g., "this line = 30cm")
- Lock image position while tracing
- Trace tools: pen tool, bezier tool work over image background
- Auto-trace: edge detection to suggest outlines from high-contrast images
- Multiple reference images supported simultaneously

## Implementation Strategy

1. Add background image layer to 2D canvas (below pattern pieces, above grid)
2. Image transform controls: position, scale, rotation, opacity
3. Scale calibration: two-click ruler defines known real-world distance
4. Auto-trace: Canny edge detection → contour extraction → polyline simplification
5. Convert traced path to pattern piece outline

## Acceptance Criteria

- [ ] Import reference image as 2D canvas background
- [ ] Opacity slider for tracing visibility
- [ ] Scale calibration via two-point ruler
- [ ] Existing drawing tools work over reference image
- [ ] Auto-trace edge detection for high-contrast images
- [ ] Lock image position during tracing
