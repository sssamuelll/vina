# #267 — Digital Print File Generation

> **Labels**: `feature`, `gerber-integration`, `production`, `tier-c`
> **Milestone**: v0.8
> **Priority**: Sprint 6

## Summary

Export nested marker layout with artwork/graphics overlaid per piece as high-resolution print files for digital fabric printing.

## Motivation

Digital fabric printing is growing rapidly. The workflow requires: nest pieces → overlay artwork per piece → export as print-ready file at 150-300 DPI. Gerber automates this with batch processing. OpenClo should support this end-to-end once nesting (#233) and artwork placement (#222) are in place.

## Requirements

### Core
- [ ] Compose nested marker with artwork overlaid per piece
- [ ] Respect fabric repeat, colorway, and piece orientation
- [ ] Registration marks for print alignment
- [ ] Fabric metadata (width, repeat, name) embedded in output

### Output Formats
- [ ] PNG (web preview, lower quality)
- [ ] TIFF (production standard, lossless)
- [ ] PDF (scalable, with vector piece outlines)

### Configuration
- [ ] DPI: 72 (preview), 150 (standard), 300 (high quality)
- [ ] Color space: RGB / CMYK
- [ ] Bleed/margin around pieces
- [ ] Include/exclude piece outlines, notches, annotations

### Batch Mode
- [ ] Generate print files for all colorways in one operation
- [ ] Queue multiple markers for batch export

### Copilot Integration
- [ ] Tool: `generatePrintFile({ marker: "production-marker-1", dpi: 300, format: "tiff" })`
- [ ] Tool: `batchPrintFiles({ markers: ["marker-1", "marker-2"], colorways: "all" })`

## Technical Notes

- Uses HTML Canvas or OffscreenCanvas for rasterization
- Vector output (PDF) via existing PDF export pipeline
- Large file sizes expected (300 DPI × 150cm width = ~18000px wide)

## Dependencies

- #233 Nesting & Fabric Consumption (marker layout)
- #222 Print & Graphic Placement (artwork data)
- #263 Colorway Support (per-colorway print files)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §16
