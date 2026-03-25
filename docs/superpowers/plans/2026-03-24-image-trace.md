# Image Trace — Reference Image Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import reference images as 2D canvas backgrounds with opacity, calibration, and project persistence for manual pattern tracing.

**Architecture:** `ReferenceImage` data in `projectSlice` (undo-able), UI state in `editorSlice`, image blobs in IndexedDB for session persistence and base64-embedded in project JSON for portability. SVG `<image>` rendering inside the pan/zoom group. No new tools — reuses existing drawing tools over the image background.

**Tech Stack:** TypeScript, React, Redux Toolkit, SVG, IndexedDB, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-image-trace-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/utils/import/imageImporter.ts` | Image validation, resize, blob creation |
| `src/utils/import/referenceImageStore.ts` | IndexedDB CRUD for image blobs |
| `src/utils/import/__tests__/imageImporter.test.ts` | Import validation tests |
| `src/utils/import/__tests__/referenceImageStore.test.ts` | IndexedDB round-trip tests |
| `src/utils/geometry/calibration.ts` | computePixelsPerMm pure function |
| `src/utils/geometry/__tests__/calibration.test.ts` | Calibration math tests |
| `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx` | SVG `<image>` rendering |
| `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx` | Two-click ruler overlay |
| `src/components/PatternEditor/CalibrationModal.tsx` | Styled mm input modal |
| `src/components/DisplayBar2D/ReferenceImageSettings.tsx` | View settings UI section |
| `src/copilot/action/tools/definitions/referenceImageTools.ts` | Copilot tools |
| `src/copilot/action/tools/definitions/__tests__/referenceImageTools.test.ts` | Copilot tool tests |
| `src/store/__tests__/projectSlice.referenceImage.test.ts` | Redux CRUD + undo tests |
| `src/store/__tests__/editorSlice.referenceImage.test.ts` | Calibration/toggle state tests |

### Modified Files
| File | Change |
|------|--------|
| `src/types/types.ts:75` | Add `ReferenceImage` interface |
| `src/store/projectSlice.ts:49,77,440` | Add `referenceImages` field, initialState, CRUD reducers |
| `src/store/editorSlice.ts:418,5,108` | Add `showReferenceImages`, `calibrationMode`, `selectedReferenceImageId` |
| `src/components/PatternEditor/PatternEditor.tsx:378` | Insert ReferenceImageLayer + CalibrationOverlay |
| `src/components/DisplayBar2D/DisplayBar2D.tsx:39` | Add reference images toggle |
| `src/copilot/action/tools/registry.ts:370` | Register referenceImageTools in ALL_TOOL_MODULES |

---

## Task 1: ReferenceImage type + projectSlice CRUD

**Files:**
- Modify: `src/types/types.ts`
- Modify: `src/store/projectSlice.ts`
- Create: `src/store/__tests__/projectSlice.referenceImage.test.ts`

- [ ] **Step 1: Write failing tests for projectSlice reference image CRUD**

```typescript
// src/store/__tests__/projectSlice.referenceImage.test.ts
import { describe, it, expect } from 'vitest';
import reducer, { addReferenceImage, removeReferenceImage, updateReferenceImage } from '../projectSlice';

function baseState(overrides = {}) {
  return {
    id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [], avatar: {} as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false, groups: [],
    seamGroups: [], arrangementOverrides: {}, poms: [], layerNames: {}, layerLocked: {},
    loadDiagnostics: [], loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    referenceImages: [],
    ...overrides,
  };
}

function makeRefImage(id: string, overrides = {}) {
  return {
    id, filename: `${id}.png`, width: 800, height: 600,
    position: { x: 0, y: 0 }, scale: 1, rotation: 0,
    opacity: 0.5, locked: false, visible: true, pixelsPerMm: null,
    ...overrides,
  };
}

describe('projectSlice — referenceImages', () => {
  it('addReferenceImage appends to array', () => {
    const state = reducer(baseState(), addReferenceImage(makeRefImage('img1')));
    expect(state.referenceImages).toHaveLength(1);
    expect(state.referenceImages[0].id).toBe('img1');
  });

  it('addReferenceImage rejects when count >= 10', () => {
    const images = Array.from({ length: 10 }, (_, i) => makeRefImage(`img${i}`));
    const state = reducer(baseState({ referenceImages: images }), addReferenceImage(makeRefImage('img10')));
    expect(state.referenceImages).toHaveLength(10); // not 11
  });

  it('removeReferenceImage removes by id', () => {
    const state = reducer(
      baseState({ referenceImages: [makeRefImage('img1'), makeRefImage('img2')] }),
      removeReferenceImage('img1'),
    );
    expect(state.referenceImages).toHaveLength(1);
    expect(state.referenceImages[0].id).toBe('img2');
  });

  it('updateReferenceImage merges partial update', () => {
    const state = reducer(
      baseState({ referenceImages: [makeRefImage('img1', { opacity: 0.5 })] }),
      updateReferenceImage({ id: 'img1', opacity: 0.8 }),
    );
    expect(state.referenceImages[0].opacity).toBe(0.8);
    expect(state.referenceImages[0].filename).toBe('img1.png'); // unchanged
  });

  it('addReferenceImage marks isDirty', () => {
    const state = reducer(baseState(), addReferenceImage(makeRefImage('img1')));
    expect(state.isDirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/projectSlice.referenceImage.test.ts`
Expected: FAIL — addReferenceImage not exported

- [ ] **Step 3: Add ReferenceImage interface to types.ts**

In `src/types/types.ts`, after the `PatternPiece` interface (around line 75), add:

```typescript
export interface ReferenceImage {
  id: string;
  filename: string;
  width: number;
  height: number;
  position: Point2D;
  scale: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  pixelsPerMm: number | null;
}
```

- [ ] **Step 4: Add referenceImages to ProjectState and CRUD reducers**

In `src/store/projectSlice.ts`:
- Add `import type { ReferenceImage } from '../types/types';`
- Add `referenceImages: ReferenceImage[];` to `ProjectState` interface
- Add `referenceImages: [],` to `initialState`
- Add reducers after the POM section:

```typescript
addReferenceImage(state, action: PayloadAction<ReferenceImage>) {
  if (state.referenceImages.length >= 10) return; // max 10
  state.referenceImages.push(action.payload);
  state.isDirty = true;
},
removeReferenceImage(state, action: PayloadAction<string>) {
  state.referenceImages = state.referenceImages.filter(i => i.id !== action.payload);
  state.isDirty = true;
},
updateReferenceImage(state, action: PayloadAction<{ id: string } & Partial<ReferenceImage>>) {
  const idx = state.referenceImages.findIndex(i => i.id === action.payload.id);
  if (idx !== -1) {
    Object.assign(state.referenceImages[idx], action.payload);
    state.isDirty = true;
  }
},
```

- Export the new actions in the export statement.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/projectSlice.referenceImage.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, clean types

- [ ] **Step 7: Commit**

```bash
git add src/types/types.ts src/store/projectSlice.ts src/store/__tests__/projectSlice.referenceImage.test.ts
git commit -m "feat: add ReferenceImage type and projectSlice CRUD"
```

---

## Task 2: editorSlice — calibration state + showReferenceImages toggle

**Files:**
- Modify: `src/store/editorSlice.ts`
- Create: `src/store/__tests__/editorSlice.referenceImage.test.ts`

- [ ] **Step 1: Write failing tests**

Test: `setShowReferenceImages` toggles, `startCalibration`/`cancelCalibration` transitions, `setCalibrationPoint1` stores point, `setSelectedReferenceImage` stores id.

- [ ] **Step 2: Implement in editorSlice.ts**

Add to EditorState:
```typescript
showReferenceImages: boolean;                // default true
selectedReferenceImageId: string | null;     // default null
calibrationMode: { imageId: string; point1: Point2D | null } | null;  // default null
```

Add reducers: `setShowReferenceImages`, `toggleReferenceImages`, `setSelectedReferenceImage`, `startCalibration`, `setCalibrationPoint1`, `cancelCalibration`.

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat: add reference image state to editorSlice"
```

---

## Task 3: Image importer — validation + resize

**Files:**
- Create: `src/utils/import/imageImporter.ts`
- Create: `src/utils/import/__tests__/imageImporter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('importReferenceImage', () => {
  it('accepts valid PNG file and returns dimensions');
  it('accepts valid JPG file');
  it('rejects non-image file type');
  it('rejects file > 20MB');
  it('resizes image > 4096px preserving aspect ratio');
  it('returns objectUrl and imageBlob');
});
```

Mock `File` objects with appropriate types and sizes. For the resize test, mock `Image` and `OffscreenCanvas`.

- [ ] **Step 2: Implement imageImporter.ts**

```typescript
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_DIMENSION = 4096;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export interface ImageImportResult {
  objectUrl: string;
  imageBlob: Blob;
  width: number;
  height: number;
  filename: string;
}

export async function importReferenceImage(file: File): Promise<ImageImportResult> {
  // 1. Validate type
  // 2. Validate size
  // 3. Load image to get dimensions
  // 4. Resize if > MAX_DIMENSION via OffscreenCanvas (or canvas fallback)
  // 5. Create objectUrl
  // 6. Return result
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat: add reference image importer with validation and resize"
```

---

## Task 4: IndexedDB reference image store

**Files:**
- Create: `src/utils/import/referenceImageStore.ts`
- Create: `src/utils/import/__tests__/referenceImageStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('referenceImageStore', () => {
  it('storeImageBlob + loadImageBlob round-trip');
  it('removeImageBlob clears entry');
  it('loadImageBlob for missing id returns null');
  it('clearAllImageBlobs removes everything');
  it('garbageCollect removes blobs not in active ids');
});
```

Use `fake-indexeddb` package (or Vitest's built-in mocking) for IndexedDB in tests.

- [ ] **Step 2: Implement referenceImageStore.ts**

```typescript
const DB_NAME = 'openclo-reference-images';
const STORE_NAME = 'blobs';

export async function storeImageBlob(imageId: string, blob: Blob): Promise<void>
export async function loadImageBlob(imageId: string): Promise<Blob | null>
export async function removeImageBlob(imageId: string): Promise<void>
export async function clearAllImageBlobs(): Promise<void>
export async function garbageCollect(activeImageIds: string[]): Promise<void>
```

Use raw IndexedDB API (no library dependency). Open/create DB lazily on first call.

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat: add IndexedDB store for reference image blobs"
```

---

## Task 5: Calibration pure function

**Files:**
- Create: `src/utils/geometry/calibration.ts`
- Create: `src/utils/geometry/__tests__/calibration.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('computePixelsPerMm', () => {
  it('100px apart, 50mm → pixelsPerMm = 2.0', () => {
    expect(computePixelsPerMm({ x: 0, y: 0 }, { x: 100, y: 0 }, 50)).toBe(2);
  });
  it('diagonal distance computed correctly', () => {
    expect(computePixelsPerMm({ x: 0, y: 0 }, { x: 30, y: 40 }, 25)).toBe(2); // dist=50, 50/25=2
  });
  it('throws on zero pixel distance');
  it('throws on zero mm input');
  it('throws on negative mm input');
});
```

- [ ] **Step 2: Implement calibration.ts**

```typescript
import type { Point2D } from '../../types/types';

export function computePixelsPerMm(point1: Point2D, point2: Point2D, realWorldMm: number): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) throw new Error('Calibration points must be different positions');
  if (realWorldMm <= 0) throw new Error('Real-world distance must be positive');
  return pixelDist / realWorldMm;
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat: add computePixelsPerMm calibration function"
```

---

## Task 6: ReferenceImageLayer SVG component

**Files:**
- Create: `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx`

- [ ] **Step 1: Create the component**

Follow `GridLayer.tsx` pattern. Renders inside pan/zoom group. For each visible reference image, emit SVG `<image>`. Missing objectUrls show a dashed placeholder. Locked images set `pointerEvents: 'none'`. Selected image gets a highlight border.

Props: `referenceImages`, `showReferenceImages`, `selectedReferenceImageId`, `objectUrlMap` (Map<string, string> passed from parent).

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add ReferenceImageLayer SVG component"
```

---

## Task 7: CalibrationOverlay + CalibrationModal

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx`
- Create: `src/components/PatternEditor/CalibrationModal.tsx`

- [ ] **Step 1: Create CalibrationOverlay**

SVG overlay rendered when `calibrationMode !== null`. Shows crosshair cursor, dashed line from point1 to cursor after first click, pixel distance label.

- [ ] **Step 2: Create CalibrationModal**

Styled modal following `ImportDXFDialog.tsx` pattern (overlay + centered dialog). Dark theme. Shows:
- "Enter real-world distance (mm):" label
- Numeric input (auto-focused)
- OK / Cancel buttons
- Enter submits, Escape cancels

Props: `pixelDistance: number`, `onConfirm: (mm: number) => void`, `onCancel: () => void`.

- [ ] **Step 3: Run type check, commit**

```bash
git commit -m "feat: add CalibrationOverlay and CalibrationModal"
```

---

## Task 8: ReferenceImageSettings — view settings UI

**Files:**
- Create: `src/components/DisplayBar2D/ReferenceImageSettings.tsx`
- Modify: `src/components/DisplayBar2D/DisplayBar2D.tsx:39`

- [ ] **Step 1: Create ReferenceImageSettings component**

Collapsible section with:
- "Import Image" button (triggers file input, calls `importReferenceImage`, stores in IndexedDB, dispatches `addReferenceImage`)
- Per-image list: filename, opacity slider, visible toggle, locked toggle, calibrate button, delete button
- Disabled "Import" when count >= 10

- [ ] **Step 2: Add toggle to DisplayBar2D**

In `src/components/DisplayBar2D/DisplayBar2D.tsx`, add a reference images toggle to the `toggles` array (line 39):
```typescript
{ icon: <Layers size={18} />, label: 'Reference Images',
  active: editor.showReferenceImages, onClick: () => dispatch(toggleReferenceImages()) },
```

Import `Layers` from `lucide-react` and `toggleReferenceImages` from editorSlice.

- [ ] **Step 3: Run type check, commit**

```bash
git commit -m "feat: add ReferenceImageSettings UI and display bar toggle"
```

---

## Task 9: Wire into PatternEditor

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx:378`

- [ ] **Step 1: Wire ReferenceImageLayer**

Import `ReferenceImageLayer`. Read `referenceImages` from `state.project.referenceImages` and `showReferenceImages` from `state.editor.showReferenceImages`. Manage a module-level `objectUrlMap: Map<string, string>` for runtime blob URLs.

Insert `<ReferenceImageLayer>` as the first child inside the pan/zoom `<g>` (after line 378, before `<PieceRenderer>`).

- [ ] **Step 2: Wire CalibrationOverlay + CalibrationModal**

Read `calibrationMode` from `state.editor.calibrationMode`. Render `<CalibrationOverlay>` when active. Render `<CalibrationModal>` when second point is clicked.

Wire calibration clicks: when `calibrationMode` is active, intercept mouse clicks to set calibration points (before tool handlers). On modal confirm, compute `pixelsPerMm` via `computePixelsPerMm`, dispatch `updateReferenceImage`.

- [ ] **Step 3: Wire ReferenceImageSettings**

Import and render `<ReferenceImageSettings>` in the appropriate location (near the DisplayBar2D or in a separate panel area).

- [ ] **Step 4: Run type check + full test suite**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: wire reference images into PatternEditor"
```

---

## Task 10: Copilot tools

**Files:**
- Create: `src/copilot/action/tools/definitions/referenceImageTools.ts`
- Create: `src/copilot/action/tools/definitions/__tests__/referenceImageTools.test.ts`
- Modify: `src/copilot/action/tools/registry.ts:370`

- [ ] **Step 1: Write failing tests**

```typescript
describe('referenceImage copilot tools', () => {
  it('setReferenceImageOpacity with valid id → success');
  it('setReferenceImageOpacity with invalid id → error');
  it('toggleReferenceImages dispatches toggle');
  it('removeReferenceImage with valid id → success');
  it('removeReferenceImage with invalid id → error');
});
```

- [ ] **Step 2: Implement referenceImageTools.ts**

Three tools: `setReferenceImageOpacity`, `toggleReferenceImages`, `removeReferenceImage`. Follow `patternOpsTools.ts` pattern exactly: bilingual description, JSON Schema parameters, async execute returning `ToolResult`.

- [ ] **Step 3: Register in registry.ts**

Add `import { tools as referenceImageToolDefs } from './definitions/referenceImageTools';` and add `referenceImageToolDefs` to `ALL_TOOL_MODULES`.

- [ ] **Step 4: Run tests, full suite, type check, commit**

```bash
git commit -m "feat(copilot): add reference image tools"
```

---

## Task 11: Project persistence — save/load with base64

**Files:**
- Modify: `src/store/projectSlice.ts` (loadProject reducer)

- [ ] **Step 1: Update loadProject to handle referenceImages**

In the `loadProject` reducer, after loading other project data, handle `referenceImageData`:
1. Read `referenceImageData: Record<string, string>` from the project payload
2. For each entry, decode base64 → Blob → objectUrl
3. Store blobs in IndexedDB
4. Populate `state.referenceImages` with metadata
5. Store objectUrls in module-level map

- [ ] **Step 2: Add save helper for base64 encoding**

Create an async function (can be in `referenceImageStore.ts`) that reads all blobs from IndexedDB and encodes to base64:

```typescript
export async function serializeReferenceImages(imageIds: string[]): Promise<Record<string, string>>
```

This is called by the project save flow (outside Redux, since it's async).

- [ ] **Step 3: Wire garbage collection**

On `loadProject` and NEW_PROJECT actions, call `garbageCollect(activeImageIds)` to clean up orphaned IndexedDB entries.

- [ ] **Step 4: Run full test suite + type check, commit**

```bash
git commit -m "feat: add reference image project persistence with base64 encoding"
```

---

## Task 12: Final verification

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Manual verification**

Start dev server: `npm run dev`
- Import a PNG reference image via the settings UI
- Verify it appears behind pattern pieces
- Adjust opacity slider
- Toggle visibility
- Calibrate with two-click ruler
- Lock and verify it can't be dragged
- Delete and verify undo restores it

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: final cleanup for reference image layer"
```
