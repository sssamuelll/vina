# OpenClo — File Format Compatibility Spec

## Goal

OpenClo must speak the same language as the industry. A patronista should be able to:
1. Import patterns from CLO3D or Gerber AccuMark
2. Export patterns that open correctly in CLO3D, Gerber, Lectra, or any ASTM-compliant cutter
3. Round-trip: import → edit → export without data loss on core geometry

## Industry Context

| Software | Company | Format | Extension | Structure |
|----------|---------|--------|-----------|-----------|
| CLO3D | CLO Virtual Fashion | ZPRJ | .zprj | ZIP (DXF + JSON metadata + textures) |
| Marvelous Designer | CLO Virtual Fashion | ZPRJ | .zprj | Same as CLO3D |
| AccuMark | Gerber/Lectra | AccuMark | .zip | ZIP (AAMA/ASTM DXF + rules) |
| Modaris | Lectra | MDL/IBA | .mdl/.iba | Proprietary (DXF export available) |
| Optitex | EFI | PDS | .pds | Proprietary (DXF export available) |
| Generic | — | DXF | .dxf | AAMA/ASTM D6673 standard |

**Common denominator: DXF.** Every serious pattern tool imports and exports AAMA/ASTM DXF. This is our primary interop format.

---

## Format 1: DXF (AAMA/ASTM D6673)

### Overview
The **ASTM D6673** standard (formerly AAMA) defines how pattern pieces are represented in DXF. It's the universal exchange format for garment patterns.

### Layer Convention (ASTM D6673)

| Layer | Name | Content |
|-------|------|---------|
| 1 | Boundary | Cut lines / piece outlines |
| 2 | Sew line | Stitch lines (inside seam allowance) |
| 3 | Internal lines | Darts, pleats, fold lines |
| 4 | Notches | Notch marks (T-notch, slit, V-notch, castle) |
| 5 | Grade reference | Grading reference lines |
| 6 | Mirror/fold | Mirror lines, fold lines |
| 7 | Grainline | Fabric grain direction |
| 8 | Text/annotation | Piece names, sizes, notes |
| 11 | Turn points | Key points on outline |
| 13 | Drill holes | Drill/alignment marks |
| 14 | Sew direction | — |
| 15 | Grade rules | — |
| 84 | T-notch | Notch subtype |
| 85 | Slit notch | Notch subtype |
| 86 | V-notch | Notch subtype |
| 87 | Castle notch | Notch subtype |

### DXF Import Requirements

**Must parse:**
- LWPOLYLINE and POLYLINE entities (piece outlines)
- LINE entities (internals, grainlines)
- SPLINE entities (curved outlines — CLO3D exports these)
- ARC entities
- POINT entities (notches, drill holes)
- TEXT and MTEXT entities (piece names)
- BLOCK/INSERT (pieces as blocks — common in AccuMark)
- Layer assignments (map ASTM layers → OpenClo internal types)

**Must handle:**
- Multiple pieces per file (each piece = group of entities on consistent layers)
- Piece grouping by BLOCK or spatial proximity
- Y-axis flip (DXF Y-up vs screen Y-down)
- Unit detection ($INSUNITS header variable)
- Both R12 and R2000+ DXF versions

**Nice to have:**
- Seam allowance detection (Layer 1 vs Layer 2 difference)
- Grading data (Layer 5/15)

### DXF Export Requirements (current + improvements)

**Current state:** Basic LWPOLYLINE export with custom layers (CUT, SEAM, NOTCH, GRAINLINE, LABEL). **Not ASTM compliant.**

**Required changes:**
- [ ] Switch to ASTM layer numbering (1, 2, 3, 4, 7, 8)
- [ ] Export SPLINE entities for curves (not polyline approximation) — better fidelity
- [ ] Separate cut line (Layer 1) from sew line (Layer 2) using seamAllowance offset
- [ ] Proper notch entities on Layer 4 (LINE perpendicular to outline, standard length 10mm)
- [ ] TEXT on Layer 8 with piece name + size
- [ ] Piece BLOCK grouping (one BLOCK per piece, INSERT for placement)
- [ ] $MEASUREMENT=1 (metric), $INSUNITS=4 (mm)
- [ ] Include turn points on Layer 11 (anchor points of the Bezier outline)
- [ ] Real seam allowance offset curves (parallel offset of outline)

---

## Format 2: CLO3D .zprj

### Overview
`.zprj` files are **ZIP archives** containing the full project state. CLO3D and Marvelous Designer use this format.

### ZIP Structure (typical)

```
project.zprj (rename to .zip to inspect)
├── pattern/
│   ├── pattern.dxf          — 2D pattern pieces (ASTM DXF)
│   └── pattern_info.json    — piece metadata (names, grainlines, seam info)
├── garment/
│   ├── garment.obj          — 3D draped garment mesh
│   └── garment_info.json    — simulation state
├── avatar/
│   ├── avatar.obj           — 3D body model
│   └── avatar_info.json     — body measurements
├── fabric/
│   ├── fabric_info.json     — fabric properties (weight, stretch, etc.)
│   └── textures/            — fabric texture images
├── thumbnail.png            — project preview
└── project_info.json        — project metadata, version
```

### Import Strategy

**Phase 1 (MVP):**
- Unzip in browser (use JSZip or fflate)
- Find `pattern/*.dxf` → parse with DXF importer
- Find `*_info.json` files → extract piece names, measurements, fabric properties
- Find `avatar/*.obj` → load as 3D model (Three.js OBJLoader)
- Ignore simulation state (we'll re-simulate)

**Phase 2:**
- Parse seam connections from metadata
- Import fabric textures
- Reconstruct grading data if present

### Export Strategy

**Phase 1:** Export as `.zprj` ZIP with:
- `pattern/pattern.dxf` — ASTM-compliant DXF
- `pattern/pattern_info.json` — piece metadata
- `avatar/avatar_info.json` — measurements
- `fabric/fabric_info.json` — fabric properties
- `thumbnail.png` — canvas screenshot

**Phase 2:**
- Include 3D garment OBJ
- Include fabric textures
- Full CLO3D compatibility testing

---

## Format 3: Gerber AccuMark

### Overview
Gerber/Lectra AccuMark files are **ZIP archives** containing pattern data in AAMA/ASTM DXF plus proprietary rule files.

### ZIP Structure (typical)

```
accumark_export.zip
├── pieces/
│   ├── FRONT_BODICE.dxf     — one DXF per piece (or all in one file)
│   ├── BACK_BODICE.dxf
│   └── SLEEVE.dxf
├── rules/
│   ├── grading.rul           — grading rules (proprietary format)
│   └── marker.mrk            — marker/layout data
└── manifest.txt              — piece list + metadata
```

### Import Strategy

- Read ZIP contents
- Find all `.dxf` files → parse with DXF importer (ASTM standard)
- Read `manifest.txt` if present for piece names/metadata
- Ignore `.rul` and `.mrk` (proprietary grading/marker formats — out of scope)

### Export Strategy

- Export ZIP with one DXF per piece (ASTM-compliant)
- Include basic `manifest.txt` with piece names and sizes
- No grading rules export (would need AccuMark-specific format)

---

## Implementation Plan

### Priority Order

1. **DXF Import** — highest value, universal format, unblocks everything
2. **DXF Export upgrade** — ASTM compliance, SPLINE entities, real seam allowance offset
3. **ZPRJ Import** — CLO3D users can bring their work into OpenClo
4. **ZPRJ Export** — OpenClo projects can be opened in CLO3D
5. **Gerber ZIP Import** — AccuMark compatibility
6. **Gerber ZIP Export** — AccuMark compatibility

### Dependencies

- DXF parser library: write custom (DXF R12 is simple text) or use `dxf-parser` npm package
- ZIP handling: `fflate` (lightweight, fast) or `JSZip`
- Seam allowance offset algorithm: Clipper.js or custom polygon offset (Minkowski sum)
- SPLINE → Bezier conversion for import
- Bezier → SPLINE conversion for export

### File Size Considerations

- CLO3D .zprj files can be 10-200MB (textures, OBJ meshes)
- Must stream/chunk ZIP reading in browser — don't load entire file into memory
- Consider Web Workers for parsing large files

---

## Mapping: External Format → OpenClo Internal

| External (ASTM DXF) | OpenClo Type |
|---------------------|--------------|
| Layer 1 LWPOLYLINE/SPLINE | `PatternPiece.outline` (PathCommand[]) |
| Layer 2 LWPOLYLINE/SPLINE | Computed from outline - seamAllowance |
| Layer 3 LINE/POLYLINE | `InternalLine` type='dart'\|'fold'\|'pleat' |
| Layer 4 LINE/POINT | `InternalLine` type='notch' |
| Layer 7 LINE | `InternalLine` type='grainline' |
| Layer 8 TEXT/MTEXT | `PatternPiece.name` |
| Layer 11 POINT | Anchor points of `outline` PathCommands |
| Layer 13 POINT | (new) drill holes — extend InternalLineType |

### New Types Needed

```typescript
// Extend InternalLineType
type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'drill';

// Notch subtypes
type NotchStyle = 'T' | 'slit' | 'V' | 'castle';

// Import result
interface ImportResult {
  pieces: PatternPiece[];
  seams?: Seam[];           // if detectable
  fabrics?: Fabric[];       // from metadata
  avatar?: Avatar;          // from .zprj
  warnings: string[];       // non-fatal issues
  source: 'dxf' | 'zprj' | 'gerber';
}
```
