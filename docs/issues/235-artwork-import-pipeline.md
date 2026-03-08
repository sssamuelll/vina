## Summary

Build an artwork import pipeline supporting Adobe Illustrator (.ai), Photoshop (.psd), SVG, and high-resolution raster formats for use in graphic placement and print design workflows.

**Competitive context:** Both CLO3D and Browzwear support AI/PSD import for print and graphic workflows. Designers create artwork in Adobe tools and need seamless import into garment CAD.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §7 — Print & Graphics Placement](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Supported Formats
| Format | Type | Use Case |
|--------|------|----------|
| `.svg` | Vector | Logos, graphics, line art |
| `.ai` | Vector (PDF-based) | Adobe Illustrator artwork |
| `.psd` | Raster (layered) | Photoshop artwork with layers |
| `.png` | Raster | Transparent graphics |
| `.jpg` | Raster | Photo prints |
| `.tiff` | Raster | High-res print artwork |
| `.webp` | Raster | Web-optimized images |

### Import Features
- Drag & drop import onto 2D pattern or 3D garment
- SVG: parse paths, preserve vector quality at any zoom
- AI: extract embedded PDF/SVG content
- PSD: layer selection — choose which layers to import
- DPI-aware: maintain correct physical dimensions
- Color profile handling: sRGB, Adobe RGB, CMYK preview
- Transparency preservation

### Color Separation (for screen printing workflows)
- Identify distinct colors in imported artwork
- Map colors to Pantone references (#234)
- Export separated color layers

---

## Implementation Strategy

1. SVG: native browser rendering + `<img>` or inline `<svg>` on canvas
2. AI: parse as PDF, extract embedded images/vectors using `pdf.js`
3. PSD: use `ag-psd` or `psd.js` library for layer parsing
4. TIFF: use `utif.js` for TIFF decoding
5. All raster formats → `ImageBitmap` → texture for 3D application

## Dependencies

- #222 — Print & Graphic Placement (artwork imports are placed via this system)

## Acceptance Criteria

- [ ] Import SVG, PNG, JPG, WebP, TIFF via drag & drop
- [ ] Import AI files (extract embedded PDF/vector content)
- [ ] Import PSD files with layer selection
- [ ] DPI-aware sizing maintains physical dimensions
- [ ] Transparency preserved on import
- [ ] Imported artwork usable in graphic placement tool (#222)
