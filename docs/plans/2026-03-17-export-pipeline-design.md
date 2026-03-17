# Export Pipeline — Design Document

**Goal:** Complete the export pipeline with multi-size DXF, BOM, FBX, and simulation cache export.

**Architecture:** Each export is a standalone utility function in `src/utils/export/` or `src/utils/dxf/`, triggered via UI buttons and copilot tools. All follow the existing pattern: `generate*()` returns data, `download*()` triggers browser download.

---

## Existing Infrastructure (already implemented)

| Format | File | Status |
|--------|------|--------|
| DXF-AAMA (single size) | `src/utils/dxf/exportAAMA.ts` | Done |
| DXF Legacy (R12) | `src/utils/exportDXF.ts` | Done (deprecated) |
| PDF (1:1 scale) | `src/utils/exportPDF.ts` | Done |
| PDF (cutting layout) | `src/utils/export/pdfCuttingExport.ts` | Done |
| OBJ (2D flat) | `src/utils/export/exportOBJ.ts` | Done |
| OBJ (3D mesh) | `src/utils/export/objExporter.ts` | Done |
| glTF/GLB (3D mesh) | `src/utils/export/gltfExporter.ts` | Done |
| USDZ (AR) | `src/utils/export/usdzExporter.ts` | Done |
| ZPRJ (CLO3D) | `src/utils/formats/zprjExport.ts` | Done |
| Gerber/AccuMark | `src/utils/formats/gerberExport.ts` | Done |
| WebM animation | `src/utils/export/animationExporter.ts` | Done |
| Still/turntable renders | `src/utils/export/stillExporter.ts` | Done |
| Nesting engine | `src/utils/nesting/nestingEngine.ts` | Done |

## New Features

### 1. Multi-Size DXF Export

**Problem:** Professional manufacturing needs all graded sizes in a single DXF file.

**Approach:**
- New function `generateMultiSizeDXF(gradedSets, options)` in `src/utils/dxf/exportAAMA.ts`
- Input: array of `{ size: string, pieces: PatternPiece[] }` (one entry per graded size)
- Each size's pieces go into a DXF BLOCK named `<PIECE_NAME>_<SIZE>` (e.g., `FRONT_BODICE_M`)
- AAMA layers preserved within each block (1=CUT, 4=NOTCH, 7=GRAINLINE, etc.)
- Optional nested layout: run `nestPieces()` per size, offset each size's group on Y axis
- Output: single `.dxf` file

**UI:**
- "Export Multi-Size DXF" button in ProjectView export section
- Size selection checkboxes (from grading rules)
- Option to nest on fabric width

**Files:**
- Modify: `src/utils/dxf/exportAAMA.ts` — add `generateMultiSizeDXF()`
- Modify: `src/components/views/ProjectView.tsx` — add button + handler
- Create: `src/utils/dxf/__tests__/exportAAMA.multisize.test.ts`
- Modify: `src/copilot/action/tools/definitions/exportTools.ts` — add `exportMultiSizeDXF` tool

### 2. BOM Export (CSV)

**Problem:** Manufacturers need a bill of materials listing all pieces, fabrics, and quantities.

**Approach:**
- New file `src/utils/export/bomExport.ts`
- `generateBOM(pieces, seams, fabrics)` returns CSV string
- `downloadBOM(pieces, seams, fabrics, filename)` triggers download

**CSV Columns:**
```
Piece Name, Fabric, Cut Count, Grain Direction, Area (cm2), Seam Allowance (mm), Width (cm), Height (cm), Perimeter (cm)
```

- Summary rows at bottom: total piece count, total area per fabric, overall total area
- Grouped by fabric for material sourcing

**Files:**
- Create: `src/utils/export/bomExport.ts`
- Create: `src/utils/export/__tests__/bomExport.test.ts`
- Modify: `src/components/views/ProjectView.tsx` — add "Export BOM" button
- Modify: `src/copilot/action/tools/definitions/exportTools.ts` — add `exportBOM` tool

### 3. FBX Export (Static Mesh)

**Problem:** FBX is the standard format for game engines (Unity, Unreal) and 3D tools (Maya, Blender).

**Approach:**
- Use `fbx-writer` npm package for binary FBX generation in browser
- New file `src/utils/export/fbxExporter.ts`
- `exportToFBX(object: THREE.Object3D, options)` returns ArrayBuffer
- `downloadFBX(object, options)` triggers `.fbx` download
- Uses existing `sceneCollector.collectExportScene()` to get clean mesh
- Material mapping: THREE.js PBR to FBX Phong (diffuse, specular, roughness to shininess)
- Scale: Three.js units (mm) to FBX convention (cm), factor 0.1

**Trigger:** `window.CustomEvent('openclo:export3d', { format: 'fbx' })` — same pattern as OBJ/glTF

**Files:**
- Create: `src/utils/export/fbxExporter.ts`
- Create: `src/utils/export/__tests__/fbxExporter.test.ts`
- Modify: `src/components/Viewport3D/RenderSettingsPanel.tsx` — add 'FBX' format option
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` — handle `format: 'fbx'` in export event
- Modify: `src/copilot/action/tools/definitions/exportTools.ts` — add `export3DFBX` tool

### 4. OBJ Sequence Export (Simulation Cache)

**Problem:** VFX pipelines need frame-by-frame mesh data from cloth simulation.

**Approach:**
- New file `src/utils/export/objSequenceExporter.ts`
- `exportOBJSequence(captureFrame, frameCount, fps, options)` returns ZIP (via `fflate`)
- For each frame: advance simulation, capture mesh positions, write `frame_NNNN.obj`
- ZIP structure: `sequence/frame_0001.obj`, `sequence/frame_0002.obj`, ...
- `metadata.json` in ZIP root: `{ fps, frameCount, duration, vertexCount }`
- Progress callback for UI feedback (same pattern as `animationExporter.ts`)
- Abort support via AbortController

**Files:**
- Create: `src/utils/export/objSequenceExporter.ts`
- Create: `src/utils/export/__tests__/objSequenceExporter.test.ts`
- Modify: `src/components/Timeline/ExportDialog.tsx` — add "OBJ Sequence" format option
- Modify: `src/copilot/action/tools/definitions/exportTools.ts` — add `exportOBJSequence` tool

## Priority Order

1. **BOM Export** — simplest, pure computation, no deps, immediate manufacturing value
2. **Multi-Size DXF** — extends existing AAMA exporter, high manufacturing ROI
3. **FBX Export** — new dependency (`fbx-writer`), broadens 3D pipeline
4. **OBJ Sequence** — requires simulation stepping, most complex integration

## Testing Strategy

Each feature gets:
- Unit tests for the generator function (mock pieces, verify output format)
- Copilot tool integration (tool count test update)
- Manual verification: import exported file in target software (CLO3D for DXF, Blender for FBX, Excel for BOM)
