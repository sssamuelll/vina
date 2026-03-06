## Summary

Integrate Pantone color libraries (FASHION, HOME + INTERIORS — TCX, TSX, TN) and support custom color palette import/export (.aco, .ase formats). Professional fashion design requires standardized color communication.

**Competitive context:** Both CLO3D and Browzwear include Pantone library integration and palette import from Adobe tools. Standardized color is non-negotiable for production-bound designs.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §6 — Colorway Management](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Pantone Libraries
- PANTONE FASHION, HOME + INTERIORS Cotton (TCX)
- PANTONE Textile (TSX)
- PANTONE Nylon (TN)
- Search by Pantone code or name
- Color chip preview with closest screen approximation
- Assign Pantone reference to any material slot

### Custom Color Palettes
- Import `.aco` (Adobe Color Swatch) and `.ase` (Adobe Swatch Exchange) files
- Import from Adobe Illustrator / Photoshop palette exports
- Create custom palettes within OpenClo
- Export palettes as `.aco` / `.ase`
- Palette organization: folders, favorites, recently used

### Color Browser
- Full color picker (HSL, RGB, HEX input)
- Named color swatches with rename/reorder
- Drag & drop color application to pattern pieces
- Color harmony tools: complementary, analogous, triadic suggestions

---

## Implementation Notes

- Pantone colors require licensing from Pantone LLC for the official database
- Alternative: support user-supplied Pantone swatch files or integrate via Pantone Connect API
- `.aco` format: binary format with RGB/CMYK/Lab color spaces
- `.ase` format: Adobe Swatch Exchange, also binary

## Dependencies

- #221 — Colorway Management (palettes are used within colorway system)

## Acceptance Criteria

- [ ] Color browser with HSL/RGB/HEX picker
- [ ] Import `.aco` and `.ase` palette files
- [ ] Export custom palettes as `.aco` / `.ase`
- [ ] Create, rename, reorder custom color swatches
- [ ] Pantone code field on material slots (user-entered or from library)
- [ ] Search colors by name or code
- [ ] Drag & drop color application to pieces
