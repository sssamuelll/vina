# Gerber Feature Integration Spec

> Date: 2026-03-06
> Status: Planned
> Scope: 16 features adapted from Gerber AccuMark for Vina.ai

---

## Overview

This spec defines 16 features inspired by Gerber AccuMark that we will integrate into Vina.ai. These are **not direct ports** — each feature is re-imagined for a browser-based, AI-assisted CAD environment. The goal is to make Vina patterns **production-ready** so they can be directly consumed by AccuNest/AccuMark or any AAMA/ASTM-compatible system.

### Guiding Principles

1. **Production-ready output** — patterns exported from Vina should require zero rework in a production CAD
2. **Browser-native** — all features run in-browser, no desktop dependencies
3. **AI-enhanced** — copilot can invoke any of these features via natural language
4. **Open formats** — everything exports to DXF/AAMA/ASTM, no proprietary lock-in

---

## Tier A — High Value, Reasonable Effort

### 1. Walk Seam Verification (#252)

**Purpose**: Verify that sewn edges match in length before simulation or export.

**Gerber equivalent**: Walk Seam — interactive seam matching between pieces.

**Vina approach**:
- Select two sewn edges → tool reports length delta, ease %, and mismatch location
- Visual overlay: superimpose two edges aligned at a reference notch
- Tolerance config: warn if delta > threshold (default 3mm)
- Integration with existing sewing data in Redux store
- Copilot tool: `walkSeam({ seam: "bodice-front:armhole → sleeve:cap" })`

**Key files**: `src/copilot/tools/`, `src/core/pattern/`, `src/components/Toolbar/`

---

### 2. Seam Corner Types (#253)

**Purpose**: Professional seam allowance corner treatments (7+ types).

**Gerber equivalent**: Mitered, double mitered, envelope, squared, slant, match, trim mirrored.

**Vina approach**:
- Extend existing seam allowance engine (`docs/api/seam-allowance.md`)
- Per-corner type selection (currently only equidistant offset)
- Add corner types: `mitered | doubleMitered | envelope | squared | slant | match | trimMirrored`
- Corner type stored per vertex in pattern piece data
- DXF export includes corner geometry (production-grade output)
- UI: corner type dropdown in seam allowance panel

**Key files**: `src/core/geometry/`, `docs/api/seam-allowance.md`

---

### 3. Shrink/Stretch Compensation (#254)

**Purpose**: Automatically adjust pattern dimensions to compensate for fabric shrinkage/stretch during manufacturing.

**Gerber equivalent**: Linear or % shrink per fabric; auto-updates grades.

**Vina approach**:
- Per-piece shrinkage values: `shrinkWarp%`, `shrinkWeft%`
- Linked to fabric code — changing fabric auto-applies its shrinkage profile
- Compensation applied as affine scale along grain direction
- Graded sizes auto-update when compensation changes
- Stored in `PhysicalFabric` entries alongside existing mechanical properties
- Copilot: `applyShrinkCompensation({ fabric: "cotton-twill", warp: 3.5, weft: 1.2 })`

**Key files**: `src/utils/cloth/physicalFabric.ts`, `src/core/pattern/`

---

### 4. Piece Bookmarks (#255)

**Purpose**: Save snapshots of a pattern piece during development for version comparison.

**Gerber equivalent**: Piece bookmarks — save/compare piece versions (V2024.1).

**Vina approach**:
- Bookmark = serialized piece state (points, curves, seam allowance, notches, grainline)
- Up to 5 bookmarks per piece
- Compare overlay: semi-transparent bookmark vs current piece
- Diff report: list of changed points, edge length deltas, area change
- Extends existing simulation snapshot concept (A/B/C) to 2D patterns
- Copilot: `bookmarkPiece({ piece: "front-bodice", label: "before-dart-move" })`

**Key files**: `src/stores/`, `src/components/Viewport/`

---

### 5. Multi-Dimensional Grading (#256)

**Purpose**: Grade patterns across multiple body dimensions simultaneously (bust × height × hip).

**Gerber equivalent**: Multi-dimensional grading — grade across bust + height + hip.

**Vina approach**:
- Grade table axes: primary (e.g., bust) + secondary (e.g., height) + optional tertiary
- Size matrix: e.g., 12P / 12R / 12T (same bust, different length)
- Per-point grade rules support multi-axis deltas
- Extends existing grading engine (`docs/api/grading.md`)
- Size table UI: spreadsheet-style editor with dimension axes
- DXF export includes all graded sizes with dimension metadata
- Copilot: `grade({ dimensions: { bust: [82,86,90], height: ["petite","regular","tall"] } })`

**Key files**: `docs/api/grading.md`, `src/core/pattern/`

---

### 6. Fabric Codes on Pieces (#257)

**Purpose**: Assign material/fabric identifiers to each pattern piece for BOM generation and production handoff.

**Gerber equivalent**: Fabric code assignment — mandatory piece classification.

**Vina approach**:
- Each piece gets a `fabricCode` string (e.g., "SELF", "LINING", "INTERLINING", "CONTRAST-1")
- Fabric code → links to a `PhysicalFabric` entry for simulation
- Fabric code → included in DXF/AAMA export metadata
- Fabric code panel in piece properties sidebar
- Auto-group pieces by fabric code in nesting (#233)
- Essential for BOM generation (#223) and tech pack export
- Copilot: `setFabricCode({ piece: "front-bodice", code: "SELF" })`

**Key files**: `src/stores/`, `src/core/pattern/`, `src/utils/cloth/physicalFabric.ts`

---

### 7. Accordion Pleats & Create Fold (#258)

**Purpose**: Create pleats and fold lines that generate pre-folded 3D geometry.

**Gerber equivalent**: Accordion pleats — auto pre-folded pattern for 3D; fold/crease lines for collars/cuffs.

**Vina approach**:
- Extends existing #226 (Pleats, Folds, Elastic)
- Pleat types: knife, box, accordion, inverted box
- Fold lines: define fold/crease as internal line → XPBD solver pre-folds during simulation
- Pleat parameters: depth, spacing, count, direction
- 2D view: pleat lines with fold direction arrows
- 3D: solver applies fold constraints before gravity drape
- DXF export: pleat lines as internal lines with metadata

**Key files**: `src/core/pattern/`, `crates/xpbd-wasm/src/lib.rs`, `src/utils/cloth/xpbdSolver.ts`

---

## Tier B — Medium Value, Worth Planning

### 8. Pattern Wizard Macros (#259)

**Purpose**: Record a sequence of operations and replay them on different pieces.

**Gerber equivalent**: Pattern Wizard — record/replay; 3 custom groups × 25 scripts.

**Vina approach**:
- Record mode: capture tool invocations as an ordered list of steps
- Replay mode: execute recorded steps on selected piece(s)
- Macro = JSON array of tool calls with relative references
- Integration with copilot bridge: macros are essentially pre-built execution plans
- Macro library: save/load/share macros
- Copilot: `recordMacro({ name: "dart-manipulation" })` / `replayMacro({ name: "dart-manipulation", target: "back-bodice" })`

**Key files**: `src/copilot/bridge/`, `src/copilot/tools/`

---

### 9. Pre-Marking Rules (#260)

**Purpose**: Define piece placement rules before nesting to ensure critical pieces get priority positioning.

**Gerber equivalent**: Pre-Marking Rules — automated placement before manual marking.

**Vina approach**:
- Rule types: "always at fold", "always at left edge", "pair with X", "minimum distance from Y"
- Rules stored per piece as metadata
- Nesting engine (#233) consumes rules as constraints before optimization
- Rule editor UI: visual rule builder
- Copilot: `setPlacementRule({ piece: "front-bodice", rule: "atFold" })`

**Key files**: `src/core/pattern/`, nesting engine (to be built with #233)

---

### 10. Walk/Measure Along Curve (#261)

**Purpose**: Measure distance along curves (not straight-line), essential for validating curved seams.

**Gerber equivalent**: Walk/Measure along line — rolling ruler for curves.

**Vina approach**:
- Arc-length measurement along any edge or internal line
- Support for Bezier/spline arc-length (numerical integration)
- Compare two curves: show length delta at N sample points
- Visual: animated dot walking along curve showing cumulative distance
- Extends existing measure tool with curve mode
- Copilot: `measureAlongCurve({ edge: "front-bodice:armhole" })`

**Key files**: `src/core/geometry/`, `src/components/Toolbar/`

---

### 11. DXF Wizard (Auto-Detect Format) (#262)

**Purpose**: Automatically detect DXF format on import (AAMA, ASTM, standard, Gerber, Lectra).

**Gerber equivalent**: DXF Wizard — auto-identifies DXF file type (V10.4+).

**Vina approach**:
- Analyze DXF layer names, entity structure, and metadata to detect format
- Detection heuristics: AAMA layers (1-15), ASTM D6673 layers, Gerber AM layer names, Lectra IBA format
- Auto-select correct parser pipeline based on detection
- Confidence score: if ambiguous, show user a dialog with detected format + alternatives
- Extends existing DXF import (`docs/api/dxf.md`, `docs/plans/2026-03-04-dxf-import-completion-design.md`)
- Copilot: `importDXF({ file: "pattern.dxf", autoDetect: true })`

**Key files**: `src/utils/import/`, `docs/api/dxf.md`

---

### 12. Colorway Support (Gerber-style) (#263)

**Purpose**: Multiple color/fabric combinations without duplicating the pattern model.

**Gerber equivalent**: Colorway support — multiple color combos per model.

**Vina approach**:
- Extends existing #221 (Colorway Management System)
- Colorway = map of `fabricCode → { color, material, texture }` overrides
- Gerber-compatible: colorway is fabric code remapping, not model duplication
- Quick switch: tab bar for colorways (A, B, C, D...)
- 3D viewport updates material/color per colorway
- DXF export: one model, colorway metadata in notes layer
- Copilot: `addColorway({ name: "Navy", overrides: { "SELF": "#1a237e", "CONTRAST-1": "#ffffff" } })`

**Key files**: `src/stores/`, `src/components/Viewport3D/`

---

## Tier C — Nice to Have

### 13. Annotation Library (#264)

**Purpose**: Shared text templates for production notes on pattern pieces.

**Gerber equivalent**: Annotation library (V16.1) — shared templates.

**Vina approach**:
- Annotation types: text label, production note, QC instruction, care label
- Template library: pre-defined annotations (e.g., "CUT 2 ON FOLD", "NOTCH HERE", "GRAIN →")
- Per-piece annotation list stored in piece metadata
- Annotations appear in 2D view and export to DXF annotation layer
- Custom templates: user-defined annotation presets
- Copilot: `annotate({ piece: "front-bodice", text: "CUT 2 ON FOLD", position: "center" })`

**Key files**: `src/core/pattern/`, `src/components/Viewport/`

---

### 14. Group Pieces (#265)

**Purpose**: Select and batch-operate on multiple pieces simultaneously.

**Gerber equivalent**: Group pieces (V2025.1) — batch PDS actions on grouped pieces.

**Vina approach**:
- Multi-select pieces → create named group
- Group operations: move, scale, mirror, set fabric code, apply seam allowance, export
- Persistent groups stored in project data
- Group = logical collection, not geometric merge (different from merge tool)
- UI: group panel showing members, drag to add/remove
- Copilot: `groupPieces({ name: "bodice", pieces: ["front-bodice", "back-bodice", "sleeve"] })`

**Key files**: `src/stores/`, `src/components/Viewport/`

---

### 15. Click'n'Go (Reduced Confirmations) (#266)

**Purpose**: Reduce confirmation dialogs for experienced users to speed up workflow.

**Gerber equivalent**: Click'n'Go preference — reduces confirmation clicks.

**Vina approach**:
- Preference toggle: "Expert mode" (skip confirmations for non-destructive operations)
- Per-tool setting: some tools always confirm (delete, merge), some can skip
- Configurable via settings panel
- Default: off (standard confirmations)
- Remembers last-used parameters for tools (e.g., seam allowance width)
- Copilot: inherently click-free (natural language → execution)

**Key files**: `src/stores/`, `src/components/Toolbar/`

---

### 16. Digital Print File Generation (#267)

**Purpose**: Export marker + artwork composition for digital fabric printing.

**Gerber equivalent**: Digital print file generation — automated with batch processing.

**Vina approach**:
- Compose nested marker with artwork/graphics overlaid per piece
- Export as high-resolution image (PNG/TIFF) or PDF at print DPI (150-300)
- Respect fabric repeat, colorway, and piece orientation
- Print file includes registration marks and fabric metadata
- Requires nesting (#233) + artwork placement (#222) as prerequisites
- Batch mode: generate print files for all colorways in one operation
- Copilot: `generatePrintFile({ marker: "production-marker-1", dpi: 300, format: "tiff" })`

**Key files**: nesting engine (#233), artwork system (#222), export pipeline

---

## Implementation Priority

| Priority | Issues | Rationale |
|----------|--------|-----------|
| **Sprint 1** | #252 Walk Seam, #257 Fabric Codes, #253 Seam Corners | Foundation — data model + QA tools |
| **Sprint 2** | #254 Shrink Compensation, #255 Piece Bookmarks, #261 Curve Measure | Pattern engineering tools |
| **Sprint 3** | #256 Multi-Dim Grading, #258 Pleats & Folds | Complex geometry + grading overhaul |
| **Sprint 4** | #259 Macros, #262 DXF Wizard, #263 Colorways | Automation + interop |
| **Sprint 5** | #260 Pre-Marking, #264 Annotations, #265 Groups | Production metadata |
| **Sprint 6** | #266 Click'n'Go, #267 Print File Gen | UX polish + output |

---

## Dependencies

```
#257 Fabric Codes ──→ #254 Shrink Compensation (needs fabric linkage)
#257 Fabric Codes ──→ #263 Colorways (colorway overrides fabric codes)
#257 Fabric Codes ──→ #223 BOM Generation (existing issue)
#253 Seam Corners ──→ #252 Walk Seam (corner geometry affects seam matching)
#256 Multi-Dim Grading ──→ #227 Advanced Grading (extends existing issue)
#258 Pleats & Folds ──→ #226 Pleats/Elastic (extends existing issue)
#263 Colorways ──→ #221 Colorway System (extends existing issue)
#260 Pre-Marking ──→ #233 Nesting (consumed by nesting engine)
#267 Print File ──→ #233 Nesting + #222 Graphics (prerequisites)
```

---

## Cross-References

- [Gerber Comparison](./GERBER-COMPARISON.md) — Feature-by-feature comparison
- [Competitive Gap Analysis](./COMPETITIVE-GAP-ANALYSIS.md) — CLO3D/Browzwear gaps
- [Issue Map](../issues/ISSUE-MAP.md) — All issues mapped to competitive gaps
- [Roadmap](./ROADMAP.md) — Version milestones
