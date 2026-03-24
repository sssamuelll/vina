# Image Trace Tool — Reference Image Layer Design Spec

> Issue #244 — Vectorize scanned patterns (Phase 1: Reference Image Layer)
> Auto-trace (edge detection + vectorization) deferred to #430.

## Overview

Import reference images (PNG, JPG, WebP, SVG) as background layers in the 2D pattern editor for manual tracing with existing drawing tools. Includes opacity control, two-click scale calibration, position/rotation/lock, and project persistence via file path references.

## Data Model

### ReferenceImage (stored in editorSlice)

```typescript
interface ReferenceImage {
  id: string;
  filename: string;           // original filename for display + re-loading
  filePath: string;           // path/URL for persistence
  objectUrl: string;          // runtime blob URL for SVG <image> display
  width: number;              // natural image width in px
  height: number;             // natural image height in px
  position: Point2D;          // position in pattern space (mm)
  scale: number;              // uniform scale factor (1.0 = calibrated size)
  rotation: number;           // degrees
  opacity: number;            // 0.0–1.0
  locked: boolean;            // prevents position/scale/rotation changes
  visible: boolean;           // toggle visibility
  pixelsPerMm: number | null; // set by calibration, null = uncalibrated (default 1px=1mm)
  missing: boolean;           // true if file couldn't be re-loaded on project open
}
```

### New editorSlice State

```typescript
// Added to EditorState:
referenceImages: ReferenceImage[];
selectedReferenceImageId: string | null;
showReferenceImages: boolean;              // global toggle
calibrationMode: {
  imageId: string;
  point1: Point2D | null;                  // first click, null = awaiting
} | null;
```

### Actions

- `addReferenceImage(payload: ReferenceImage)`
- `removeReferenceImage(payload: string)` (id)
- `updateReferenceImage(payload: { id: string } & Partial<ReferenceImage>)`
- `setSelectedReferenceImage(payload: string | null)`
- `setShowReferenceImages(payload: boolean)`
- `startCalibration(payload: { imageId: string })`
- `setCalibrationPoint1(payload: Point2D)`
- `cancelCalibration()`

## Image Import

File: `src/utils/import/imageImporter.ts`

```typescript
interface ImageImportResult {
  objectUrl: string;    // URL.createObjectURL(file)
  width: number;        // natural px width
  height: number;       // natural px height
  filename: string;
}

async function importReferenceImage(file: File): Promise<ImageImportResult>
```

- Validates file type (image/png, image/jpeg, image/webp, image/svg+xml)
- Creates object URL for runtime display
- Reads natural dimensions via `new Image()` load
- Throws on invalid type or zero-dimension images

Import trigger: "Import Image" button in view settings UI, uses `<input type="file" accept="image/*">`.

## Scale Calibration — Two-Click Ruler

1. User clicks "Calibrate" in view settings next to a reference image
2. Redux: `startCalibration({ imageId })` → `calibrationMode = { imageId, point1: null }`
3. User clicks first point on the image → `setCalibrationPoint1(point)`
4. User clicks second point → compute pixel distance between points
5. Prompt dialog: "Enter real-world distance (mm):"
6. Compute: `pixelsPerMm = pixelDistance / enteredMm`
7. Dispatch: `updateReferenceImage({ id, pixelsPerMm })` — scale adjusts automatically in renderer
8. Dispatch: `cancelCalibration()` to exit

Escape at any step cancels calibration. The calibration is a modal overlay on the 2D canvas, not a tool — the user doesn't need to switch tools.

For uncalibrated images (`pixelsPerMm === null`), default to 1px = 1mm until calibrated.

## 2D Canvas Rendering

### SVG Layer Stack (updated)

```
GridLayer → ReferenceImageLayer (NEW) → PieceRenderer → ConstructionOverlay → SeamRenderer → ToolOverlay
```

### ReferenceImageLayer Component

File: `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx`

Renders inside the pan/zoom `<g>` group. For each visible reference image:

```tsx
<image
  href={img.objectUrl}
  x={img.position.x}
  y={img.position.y}
  width={img.width / (img.pixelsPerMm ?? 1)}
  height={img.height / (img.pixelsPerMm ?? 1)}
  opacity={img.opacity}
  transform={`rotate(${img.rotation}, ${cx}, ${cy})`}
  style={{ pointerEvents: img.locked ? 'none' : 'auto' }}
/>
```

Missing images render a dashed-outline placeholder rectangle with a "Missing: filename" label.

### Calibration Overlay

File: `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx`

Rendered when `calibrationMode !== null`:
- Crosshair cursor
- After point1: line from point1 to cursor with distance label
- After point2 click: prompt for mm value

### Interaction (Select Tool)

When `select` tool is active and click hits a reference image (not a pattern piece):
- Click → `setSelectedReferenceImage(id)` (highlight border)
- Drag (if not locked) → update `position`
- No dedicated tool needed — piggybacks on select tool

## View Settings UI

File: `src/components/Toolbar2D/ReferenceImageSettings.tsx`

Added as a collapsible section in the existing 2D view settings area (where showGrid, showSeamAllowance, etc. live).

Contents:
- **"Show Reference Images"** checkbox (global toggle)
- **"Import Image"** button
- **Per-image list** (when images exist):
  - Filename label (truncated)
  - Opacity slider (0–100%)
  - Visible toggle (eye icon)
  - Locked toggle (lock icon)
  - "Calibrate" button
  - Delete button (with confirmation if not in expert mode)
  - "Missing" warning badge if file couldn't be re-loaded

## Copilot Tools

File: `src/copilot/action/tools/definitions/referenceImageTools.ts`

### importReferenceImage
```typescript
{
  name: 'importReferenceImage',
  description: 'Import a reference image as 2D canvas background for tracing',
  parameters: {
    type: 'object',
    properties: {
      opacity: { type: 'number', description: 'Initial opacity 0.0–1.0. Default 0.5' },
    },
    required: [],
  },
  // Note: Cannot actually import a file via LLM — this tool is a no-op that
  // returns instructions telling the user to use the Import Image button.
  // Included for discoverability via copilot keyword search.
}
```

### setReferenceImageOpacity
```typescript
{
  name: 'setReferenceImageOpacity',
  description: 'Set opacity of a reference image / Establecer opacidad de imagen de referencia',
  parameters: {
    type: 'object',
    properties: {
      imageId: { type: 'string', description: 'Reference image ID' },
      opacity: { type: 'number', description: 'Opacity 0.0–1.0' },
    },
    required: ['imageId', 'opacity'],
  },
}
```

### toggleReferenceImages
```typescript
{
  name: 'toggleReferenceImages',
  description: 'Show or hide all reference images / Mostrar u ocultar todas las imágenes de referencia',
  parameters: {
    type: 'object',
    properties: {
      visible: { type: 'boolean', description: 'true to show, false to hide' },
    },
    required: ['visible'],
  },
}
```

Register in `src/copilot/action/tools/registry.ts` via `ALL_TOOL_MODULES`.

## Project Persistence

On **save**: serialize `referenceImages` (minus `objectUrl` and `missing` fields) into the project JSON alongside existing project data.

On **load**: for each saved reference image, attempt to re-load from `filePath`:
- If file exists: create new `objectUrl`, set `missing: false`
- If file missing: set `missing: true`, `objectUrl: ''`, show placeholder in canvas

Persistence hooks into the existing `project/saveProject` and `project/loadProject` pipeline. Reference images are stored in a `referenceImages` key at the project root level.

## Registration Touchpoints

| File | Change |
|------|--------|
| `src/store/editorSlice.ts` | Add referenceImages state, actions, reducers |
| `src/types/types.ts` | Add `ReferenceImage` interface |
| `src/components/PatternEditor/PatternEditor.tsx` | Insert ReferenceImageLayer in SVG, wire calibration overlay |
| `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx` | New: SVG image rendering |
| `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx` | New: calibration ruler overlay |
| `src/components/Toolbar2D/ReferenceImageSettings.tsx` | New: view settings UI section |
| `src/components/Toolbar2D/Toolbar2D.tsx` | Import and render ReferenceImageSettings |
| `src/utils/import/imageImporter.ts` | New: image import utility |
| `src/copilot/action/tools/definitions/referenceImageTools.ts` | New: copilot tools |
| `src/copilot/action/tools/registry.ts` | Register referenceImageTools in ALL_TOOL_MODULES |

## Testing

### Unit — `src/utils/import/__tests__/imageImporter.test.ts`
- Valid PNG/JPG → returns objectUrl, width, height, filename
- Invalid file type → throws
- Zero-dimension image → throws

### Calibration — `src/utils/geometry/__tests__/calibration.test.ts`
- Two points 100px apart, user enters 50mm → pixelsPerMm = 2.0
- Zero pixel distance → error
- Negative/zero mm input → error

### Redux — `src/store/__tests__/editorSlice.referenceImage.test.ts`
- addReferenceImage appends to array
- removeReferenceImage removes by id
- updateReferenceImage merges partial update
- setShowReferenceImages toggles
- startCalibration / cancelCalibration state transitions
- setCalibrationPoint1 stores point

### Component — `src/components/PatternEditor/__tests__/ReferenceImageLayer.test.ts`
- Renders SVG `<image>` for each visible reference image
- Hides all when showReferenceImages is false
- Hidden individual images not rendered
- Applies opacity, position, scale
- Locked images have pointerEvents: none
- Missing images show placeholder

### Copilot — `src/copilot/action/tools/definitions/__tests__/referenceImageTools.test.ts`
- setReferenceImageOpacity with valid id → success
- setReferenceImageOpacity with invalid id → error
- toggleReferenceImages dispatches setShowReferenceImages
