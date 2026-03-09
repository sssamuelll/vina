# Multi-Format 3D Export Design — Issue #233

## Goal

Export the full 3D scene (garment + avatar + PBR materials) as glTF/GLB and USDZ, with user-configurable options. FBX is deferred — glTF covers most interop needs and USDZ covers Apple AR.

## Current State

- `gltfExporter.ts` exports garment mesh only as GLB/glTF via Three.js `GLTFExporter`
- `objExporter.ts` exports garment mesh only as OBJ
- Both are triggered via `openclo:export3d` custom event from copilot tools, handled in `GarmentSimulation.tsx`
- `RenderSettingsPanel.tsx` has an Export section with still/turntable/batch buttons
- Three.js ships `USDZExporter` and `DRACOExporter` — available but not integrated
- The 3D scene contains avatar, garment, lights, gizmos, ground — only garment + avatar should be exported

## Architecture

### Scene Collector (`src/utils/export/sceneCollector.ts`)

Traverses the live Three.js scene and builds a clean `THREE.Group` for export:

```typescript
interface CollectOptions {
  includeAvatar: boolean;
  includeGarment: boolean;
  scale: number;  // unit conversion multiplier
}

function collectExportScene(scene: THREE.Scene, options: CollectOptions): THREE.Group
```

Logic:
1. Create a new `THREE.Group`
2. Traverse scene children — identify garment meshes (by `__OPENCLO_CLOTH_MESH__` or mesh material type) and avatar group
3. Clone relevant meshes (non-destructive)
4. Apply scale factor
5. Skip lights, gizmos, helpers, ground, grid, contact shadows
6. Return clean group ready for export

### Enhanced glTF Exporter (`src/utils/export/gltfExporter.ts`)

Enhance existing file:
- Accept full scene group from collector (already works — GLTFExporter handles groups)
- Add `draco: boolean` option — when true, use `DRACOExporter` mesh compression
- PBR materials export automatically (GLTFExporter handles MeshPhysicalMaterial → glTF PBR)

### USDZ Exporter (`src/utils/export/usdzExporter.ts`)

New file:
```typescript
interface USDZExportOptions {
  filename?: string;
  scale?: number;
}

async function exportToUSDZ(object: THREE.Object3D, options?: USDZExportOptions): Promise<ArrayBuffer>
async function downloadUSDZ(object: THREE.Object3D, options?: USDZExportOptions): Promise<void>
```

Uses `three/examples/jsm/exporters/USDZExporter`. Handles material mapping (Three.js PBR → USD Preview Surface).

### Export UI in RenderSettingsPanel

Add "3D Export" subsection in the Export section:
- Format: dropdown (GLB / glTF / USDZ)
- Include Avatar: checkbox (default: checked)
- Scale: dropdown (mm / cm / m / inches)
- "Export 3D" button

### Data Flow

```
User clicks "Export 3D" in RenderSettingsPanel
  → callback to Viewport3D (like existing onExportStill)
  → Viewport3D reads scene ref
  → collectExportScene(scene, { includeAvatar, scale })
  → format === 'glb'/'gltf' → downloadGLTF(group, options)
  → format === 'usdz' → downloadUSDZ(group, options)
  → Browser downloads file
```

## Key Files

| File | Action |
|------|--------|
| `src/utils/export/sceneCollector.ts` | Create |
| `src/utils/export/gltfExporter.ts` | Modify (add Draco option) |
| `src/utils/export/usdzExporter.ts` | Create |
| `src/components/Viewport3D/RenderSettingsPanel.tsx` | Modify (add 3D export UI) |
| `src/components/Viewport3D/Viewport3D.tsx` | Modify (wire 3D export callback) |
| `src/utils/export/__tests__/sceneCollector.test.ts` | Create |
| `tests/e2e/3d-export.spec.ts` | Create |

## Scale Factors

| Unit | Multiplier | Notes |
|------|-----------|-------|
| mm | 1.0 | Internal unit |
| cm | 0.1 | Common for patterns |
| m | 0.001 | glTF standard |
| inches | 0.03937 | US market |

## Phases

This is a single phase — all deliverables ship together.
