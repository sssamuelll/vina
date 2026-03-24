# Image Trace Tool — Reference Image Layer Design Spec

> Issue #244 — Vectorize scanned patterns (Phase 1: Reference Image Layer)
> Auto-trace (edge detection + vectorization) deferred to #430.

## Overview

Import reference images (PNG, JPG, WebP, SVG) as background layers in the 2D pattern editor for manual tracing with existing drawing tools. Includes opacity control, two-click scale calibration, position/rotation/lock, and project persistence via IndexedDB + base64 embedding.

## Data Model

### ReferenceImage

```typescript
interface ReferenceImage {
  id: string;
  filename: string;           // original filename for display
  objectUrl: string;          // runtime blob URL for SVG <image> display (not serialized)
  imageDataBase64: string;    // base64-encoded image data for project save (not kept in Redux — stored in IndexedDB, embedded on project export)
  width: number;              // natural image width in px
  height: number;             // natural image height in px
  position: Point2D;          // position in pattern space (mm)
  scale: number;              // uniform scale factor (1.0 = calibrated size)
  rotation: number;           // degrees
  opacity: number;            // 0.0–1.0
  locked: boolean;            // prevents position/scale/rotation changes
  visible: boolean;           // toggle visibility
  pixelsPerMm: number | null; // set by calibration, null = uncalibrated (default 1px=1mm)
}
```

### Redux State — Split Across Two Slices

**projectSlice** (undo-able, persisted with project):
```typescript
// Added to ProjectState:
referenceImages: ReferenceImage[];  // minus objectUrl and imageDataBase64
```

**editorSlice** (UI state, not undo-able):
```typescript
// Added to EditorState:
selectedReferenceImageId: string | null;
showReferenceImages: boolean;              // global toggle
calibrationMode: {
  imageId: string;
  point1: Point2D | null;                  // first click, null = awaiting
} | null;
```

Runtime `objectUrl` fields are managed outside Redux in a module-level `Map<string, string>` (imageId → objectUrl), similar to how `useGuardedAction` stores callbacks outside Redux for serializability. The ReferenceImageLayer component reads from this map.

### projectSlice Actions

- `addReferenceImage(payload: Omit<ReferenceImage, 'objectUrl' | 'imageDataBase64'>)`
- `removeReferenceImage(payload: string)` (id)
- `updateReferenceImage(payload: { id: string } & Partial<ReferenceImage>)`

### editorSlice Actions

- `setSelectedReferenceImage(payload: string | null)`
- `setShowReferenceImages(payload: boolean)`
- `startCalibration(payload: { imageId: string })`
- `setCalibrationPoint1(payload: Point2D)`
- `cancelCalibration()`

### Undo Behavior

Since `referenceImages` lives in `projectSlice`, add/remove/update operations are automatically captured by the undo middleware (`JSON.parse(JSON.stringify(state.project))`). The `objectUrl` field is excluded from Redux so it doesn't interfere with serialization — but since undo restores the reference image metadata (id, filename, position, etc.), the image can still be displayed because the blob data remains in the module-level objectUrl map and in IndexedDB.

## Image Import

File: `src/utils/import/imageImporter.ts`

```typescript
interface ImageImportResult {
  objectUrl: string;      // URL.createObjectURL(file)
  imageBlob: Blob;        // raw blob for IndexedDB storage
  width: number;          // natural px width (after resize if needed)
  height: number;         // natural px height (after resize if needed)
  filename: string;
}

async function importReferenceImage(file: File): Promise<ImageImportResult>
```

### Validation & Limits

- **File types**: image/png, image/jpeg, image/webp, image/svg+xml. Throws on other types.
- **Max file size**: 20MB. Throws with descriptive error if exceeded.
- **Max dimensions**: 4096x4096. Images larger than this are resized down (preserving aspect ratio) using an OffscreenCanvas. The resized blob replaces the original.
- **Max count**: 10 reference images per project. Checked at dispatch time in the reducer.
- **Zero-dimension images**: throws.

### Import Flow

1. User clicks "Import Image" button in view settings
2. `<input type="file" accept="image/png,image/jpeg,image/webp,.svg">` opens
3. `importReferenceImage(file)` validates, resizes if needed, returns result
4. Store blob in IndexedDB keyed by generated image id (for session persistence)
5. Store objectUrl in module-level map
6. Dispatch `addReferenceImage` to projectSlice

## Persistence Strategy

### Session Persistence (IndexedDB)

Image blobs stored in IndexedDB (`openclo-reference-images` database) keyed by image id. Survives page reload without re-importing.

File: `src/utils/import/referenceImageStore.ts`

```typescript
async function storeImageBlob(imageId: string, blob: Blob): Promise<void>
async function loadImageBlob(imageId: string): Promise<Blob | null>
async function removeImageBlob(imageId: string): Promise<void>
async function clearAllImageBlobs(): Promise<void>
```

### Project Save (base64 embedding)

On project save/export:
1. For each reference image, read blob from IndexedDB
2. Convert to base64 string
3. Embed in project JSON under `referenceImageData: Record<string, string>` (imageId → base64)
4. This makes .zprj files self-contained and portable

On project load:
1. Read `referenceImageData` from project JSON
2. For each entry, decode base64 → Blob → objectUrl
3. Store in IndexedDB (for session persistence)
4. Store objectUrl in module-level map
5. Dispatch `addReferenceImage` for each

### On NEW_PROJECT

Clear all reference images from IndexedDB and module-level map.

## Scale Calibration — Two-Click Ruler

1. User clicks "Calibrate" in view settings next to a reference image
2. Dispatch `startCalibration({ imageId })` on editorSlice
3. User clicks first point on canvas → dispatch `setCalibrationPoint1(point)`
4. User clicks second point → compute pixel distance between the two points
5. Show styled modal dialog (not window.prompt): "Enter real-world distance (mm):" with numeric input, OK/Cancel buttons
6. On OK: compute `pixelsPerMm = pixelDistance / enteredMm`
7. Dispatch `updateReferenceImage({ id, pixelsPerMm })` on projectSlice
8. Dispatch `cancelCalibration()` on editorSlice

Escape at any step cancels calibration.

For uncalibrated images (`pixelsPerMm === null`), default to 1px = 1mm until calibrated.

### Calibration Pure Function

File: `src/utils/geometry/calibration.ts`

```typescript
function computePixelsPerMm(
  point1: Point2D,
  point2: Point2D,
  realWorldDistanceMm: number,
): number
```

Validates: distance > 0, realWorldDistanceMm > 0. Throws on zero/negative values.

## 2D Canvas Rendering

### SVG Layer Stack (updated)

```
GridLayer → ReferenceImageLayer (NEW) → PieceRenderer → ConstructionOverlay → SeamRenderer → ToolOverlay
```

### ReferenceImageLayer Component

File: `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx`

Renders inside the pan/zoom `<g>` group. For each visible reference image in `state.project.referenceImages`:

```tsx
<image
  href={objectUrlMap.get(img.id)}
  x={img.position.x}
  y={img.position.y}
  width={img.width / (img.pixelsPerMm ?? 1)}
  height={img.height / (img.pixelsPerMm ?? 1)}
  opacity={img.opacity}
  transform={`rotate(${img.rotation}, ${cx}, ${cy})`}
  style={{ pointerEvents: img.locked ? 'none' : 'auto' }}
/>
```

Images with no objectUrl (missing from IndexedDB after reload failure) render a dashed-outline placeholder rectangle with a "Missing: filename" label.

### CalibrationOverlay Component

File: `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx`

Rendered when `calibrationMode !== null`:
- Crosshair cursor over entire canvas
- After point1 set: dashed line from point1 to cursor with pixel distance label
- After second click: styled modal dialog for mm input

### CalibrationModal Component

File: `src/components/PatternEditor/CalibrationModal.tsx`

Styled modal (dark theme, consistent with existing confirmation dialogs) with:
- "Enter real-world distance (mm):" label
- Numeric input field (auto-focused)
- OK / Cancel buttons
- Enter key submits, Escape cancels

### Interaction (Select Tool)

When `select` tool is active and click hits a reference image (not a pattern piece):
- Click → `setSelectedReferenceImage(id)` (highlight border)
- Drag (if not locked) → dispatch `updateReferenceImage({ id, position })` on projectSlice
- No dedicated tool needed — piggybacks on select tool

## View Settings UI

File: `src/components/Toolbar2D/ReferenceImageSettings.tsx`

Added as a collapsible section in the existing 2D view settings area.

Contents:
- **"Show Reference Images"** checkbox (global toggle)
- **"Import Image"** button (disabled when count >= 10)
- **Per-image list** (when images exist):
  - Filename label (truncated)
  - Opacity slider (0–100%)
  - Visible toggle (eye icon)
  - Locked toggle (lock icon)
  - "Calibrate" button
  - Delete button (with confirmation if not in expert mode)

## Copilot Tools

File: `src/copilot/action/tools/definitions/referenceImageTools.ts`

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

### removeReferenceImage
```typescript
{
  name: 'removeReferenceImage',
  description: 'Remove a reference image from the project / Eliminar imagen de referencia del proyecto',
  parameters: {
    type: 'object',
    properties: {
      imageId: { type: 'string', description: 'Reference image ID to remove' },
    },
    required: ['imageId'],
  },
}
```

No `importReferenceImage` tool — importing requires a file picker interaction that the LLM cannot perform.

Register in `src/copilot/action/tools/registry.ts` via `ALL_TOOL_MODULES`.

## Registration Touchpoints

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `ReferenceImage` interface |
| `src/store/projectSlice.ts` | Add `referenceImages` state + actions + reducer |
| `src/store/editorSlice.ts` | Add calibration state + selectedReferenceImageId + showReferenceImages |
| `src/store/index.ts` | Add `project.referenceImages` to serializableCheck ignoredPaths |
| `src/utils/import/imageImporter.ts` | New: image import + validation + resize |
| `src/utils/import/referenceImageStore.ts` | New: IndexedDB storage for blobs |
| `src/utils/geometry/calibration.ts` | New: computePixelsPerMm pure function |
| `src/components/PatternEditor/PatternEditor.tsx` | Insert ReferenceImageLayer, wire calibration overlay |
| `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx` | New: SVG image rendering |
| `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx` | New: calibration ruler overlay |
| `src/components/PatternEditor/CalibrationModal.tsx` | New: styled mm input modal |
| `src/components/Toolbar2D/ReferenceImageSettings.tsx` | New: view settings UI section |
| `src/components/Toolbar2D/Toolbar2D.tsx` | Import and render ReferenceImageSettings |
| `src/copilot/action/tools/definitions/referenceImageTools.ts` | New: copilot tools |
| `src/copilot/action/tools/registry.ts` | Register referenceImageTools in ALL_TOOL_MODULES |

## Testing

### Unit — `src/utils/import/__tests__/imageImporter.test.ts`
- Valid PNG/JPG → returns objectUrl, width, height, filename, imageBlob
- Invalid file type → throws
- Zero-dimension image → throws
- File > 20MB → throws
- Image > 4096px → auto-resized, returned dimensions <= 4096

### Calibration — `src/utils/geometry/__tests__/calibration.test.ts`
- Two points 100px apart, user enters 50mm → pixelsPerMm = 2.0
- Zero pixel distance → error
- Negative/zero mm input → error

### Redux — `src/store/__tests__/projectSlice.referenceImage.test.ts`
- addReferenceImage appends to array
- addReferenceImage rejects when count >= 10
- removeReferenceImage removes by id
- updateReferenceImage merges partial update
- Undo after addReferenceImage removes the image

### Redux — `src/store/__tests__/editorSlice.referenceImage.test.ts`
- setShowReferenceImages toggles
- startCalibration / cancelCalibration state transitions
- setCalibrationPoint1 stores point

### IndexedDB — `src/utils/import/__tests__/referenceImageStore.test.ts`
- storeImageBlob + loadImageBlob round-trip
- removeImageBlob clears entry
- loadImageBlob for missing id returns null

### Component — `src/components/PatternEditor/__tests__/ReferenceImageLayer.test.ts`
- Renders SVG `<image>` for each visible reference image
- Hides all when showReferenceImages is false
- Hidden individual images not rendered
- Applies opacity, position, scale
- Locked images have pointerEvents: none
- Missing objectUrl shows placeholder

### Copilot — `src/copilot/action/tools/definitions/__tests__/referenceImageTools.test.ts`
- setReferenceImageOpacity with valid id → success
- setReferenceImageOpacity with invalid id → error
- toggleReferenceImages dispatches setShowReferenceImages
- removeReferenceImage with valid id → success
