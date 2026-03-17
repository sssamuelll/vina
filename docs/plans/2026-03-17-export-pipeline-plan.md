# Export Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add BOM export (CSV), multi-size DXF, FBX export, and OBJ sequence export to complete the export pipeline.

**Architecture:** Each export is a standalone utility in `src/utils/export/` or `src/utils/dxf/`, following the existing `generate*()` / `download*()` pattern. Each gets a unit test, a UI button in ProjectView or ExportDialog, and a copilot tool in `exportTools.ts`.

**Tech Stack:** TypeScript, Vitest, Three.js, fflate (ZIP), minimal FBX binary writer

---

## Task 1: BOM Export — Test

**Files:**
- Create: `src/utils/export/__tests__/bomExport.test.ts`

**Step 1: Write the failing test**

```typescript
// src/utils/export/__tests__/bomExport.test.ts
import { describe, it, expect } from 'vitest';
import { generateBOM } from '../bomExport';

function makePiece(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Front Bodice',
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [100, 0] },
      { type: 'L' as const, values: [100, 200] },
      { type: 'L' as const, values: [0, 200] },
      { type: 'Z' as const, values: [] },
    ],
    seamAllowance: 10,
    grainAngle: 0,
    fabricId: 'cotton-twill',
    mirrored: false,
    ...overrides,
  };
}

describe('generateBOM', () => {
  it('returns CSV with header row and one piece row', () => {
    const csv = generateBOM([makePiece()], [], [{ id: 'cotton-twill', name: 'Cotton Twill' }]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Piece Name');
    expect(lines[0]).toContain('Fabric');
    expect(lines[0]).toContain('Area');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toContain('Front Bodice');
    expect(lines[1]).toContain('Cotton Twill');
  });

  it('computes area in cm2 from outline', () => {
    // 100mm x 200mm rectangle = 20000mm2 = 200cm2
    const csv = generateBOM([makePiece()], [], []);
    const dataLine = csv.trim().split('\n')[1];
    expect(dataLine).toContain('200.0');
  });

  it('includes summary rows at bottom', () => {
    const csv = generateBOM(
      [makePiece(), makePiece({ id: 'p2', name: 'Back Bodice' })],
      [],
      [{ id: 'cotton-twill', name: 'Cotton Twill' }],
    );
    expect(csv).toContain('TOTAL');
  });

  it('groups by fabric', () => {
    const csv = generateBOM(
      [
        makePiece({ id: 'p1', fabricId: 'silk' }),
        makePiece({ id: 'p2', fabricId: 'cotton' }),
        makePiece({ id: 'p3', fabricId: 'silk' }),
      ],
      [],
      [{ id: 'silk', name: 'Silk' }, { id: 'cotton', name: 'Cotton' }],
    );
    const lines = csv.trim().split('\n');
    const silkIndices = lines.map((l, i) => l.includes('Silk') ? i : -1).filter(i => i > 0);
    const cottonIndices = lines.map((l, i) => l.includes('Cotton') ? i : -1).filter(i => i > 0);
    expect(silkIndices.length).toBe(2);
    expect(cottonIndices.length).toBe(1);
  });

  it('handles empty pieces array', () => {
    const csv = generateBOM([], [], []);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/export/__tests__/bomExport.test.ts`
Expected: FAIL — module `../bomExport` not found

---

## Task 2: BOM Export — Implementation

**Files:**
- Create: `src/utils/export/bomExport.ts`

**Step 1: Implement bomExport.ts**

```typescript
// src/utils/export/bomExport.ts
import type { PatternPiece, Seam } from '../../types/types';
import { flattenPath } from '../seam/index';
import { computeBBoxFromPoints } from './pipeline';

interface FabricInfo {
  id: string;
  name: string;
}

function polygonArea(points: { x: number; y: number }[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function perimeter(points: { x: number; y: number }[]): number {
  let p = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    p += Math.sqrt(dx * dx + dy * dy);
  }
  return p;
}

function escapeCSV(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateBOM(
  pieces: PatternPiece[],
  _seams: Seam[],
  fabrics: FabricInfo[],
): string {
  const fabricMap = new Map(fabrics.map(f => [f.id, f.name]));
  const header = 'Piece Name,Fabric,Cut Count,Grain Direction,Area (cm2),Seam Allowance (mm),Width (cm),Height (cm),Perimeter (cm)';

  const sorted = [...pieces].sort((a, b) => (a.fabricId ?? '').localeCompare(b.fabricId ?? ''));

  const rows: string[] = [];
  let totalArea = 0;

  for (const piece of sorted) {
    const flat = flattenPath(piece.outline, 12);
    const area = polygonArea(flat) / 100;
    const peri = perimeter(flat) / 10;
    const bbox = computeBBoxFromPoints(flat);
    const fabricName = fabricMap.get(piece.fabricId ?? '') ?? (piece.fabricId ?? 'None');
    const grainDir = piece.grainAngle != null ? `${piece.grainAngle}deg` : '0deg';
    const cutCount = piece.mirrored ? 2 : 1;

    totalArea += area;

    rows.push([
      escapeCSV(piece.name ?? piece.id),
      escapeCSV(fabricName),
      cutCount.toString(),
      grainDir,
      area.toFixed(1),
      (piece.seamAllowance ?? 0).toString(),
      (bbox.width / 10).toFixed(1),
      (bbox.height / 10).toFixed(1),
      peri.toFixed(1),
    ].join(','));
  }

  rows.push('');
  rows.push(`TOTAL,${pieces.length} pieces,,,,,,Total Area:,${totalArea.toFixed(1)} cm2`);

  return [header, ...rows].join('\n');
}

export function downloadBOM(
  pieces: PatternPiece[],
  seams: Seam[],
  fabrics: FabricInfo[],
  filename = 'bom.csv',
) {
  const csv = generateBOM(pieces, seams, fabrics);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/utils/export/__tests__/bomExport.test.ts`
Expected: PASS (all 5 tests)

**Step 3: Commit**

```bash
git add src/utils/export/bomExport.ts src/utils/export/__tests__/bomExport.test.ts
git commit -m "feat(export): add BOM CSV export with unit tests"
```

---

## Task 3: BOM Export — UI Button + Copilot Tool

**Files:**
- Modify: `src/components/views/ProjectView.tsx` (~line 765, after Export OBJ button)
- Modify: `src/copilot/action/tools/definitions/exportTools.ts`

**Step 1: Add Export BOM button to ProjectView**

Import at top:
```typescript
import { downloadBOM } from '../../utils/export/bomExport';
```

Add handler (after `handleExportCuttingLayout`):
```typescript
const handleExportBOM = useCallback(() => {
  downloadBOM(pieces, seams, fabrics, `${projectName || 'project'}-bom.csv`);
}, [pieces, seams, fabrics, projectName]);
```

Add button after the Export OBJ button:
```tsx
<button className="sidebar-btn sidebar-btn-outline" onClick={handleExportBOM}>
  Export BOM (CSV)
</button>
```

Note: Verify `seams` and `fabrics` selectors exist in the component. If not, add:
```typescript
const seams = useSelector((s: RootState) => s.project.seams);
const fabrics = useSelector((s: RootState) => s.project.fabrics);
```

**Step 2: Add copilot tool in exportTools.ts**

```typescript
const exportBOMTool: ToolDefinition = {
  name: 'exportBOM',
  description:
    'Export a Bill of Materials (BOM) as CSV. Lists all pieces with fabric, area, seam allowance, dimensions. ' +
    '/ Exportar lista de materiales (BOM) como CSV.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Output filename / Nombre del archivo' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;
    const seams = state.project.seams;
    const fabrics = state.project.fabrics;

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces to export' };
    }

    const filename = (params.filename as string) || 'bom.csv';

    try {
      const { downloadBOM } = await import('../../../../utils/export/bomExport');
      downloadBOM(pieces, seams, fabrics, filename);
      return {
        success: true,
        data: { filename, piecesExported: pieces.length },
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};
```

Add `exportBOMTool` to the `tools` array export.

**Step 3: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run src/utils/export/__tests__/bomExport.test.ts`
Expected: Zero TS errors, tests PASS

**Step 4: Commit**

```bash
git add src/components/views/ProjectView.tsx src/copilot/action/tools/definitions/exportTools.ts
git commit -m "feat(export): add BOM export UI button and copilot tool"
```

---

## Task 4: Multi-Size DXF Export — Test

**Files:**
- Create: `src/utils/dxf/__tests__/exportAAMA.multisize.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { generateMultiSizeDXF } from '../exportAAMA';

function makePiece(name: string, w: number, h: number) {
  return {
    id: name.toLowerCase().replace(/\s/g, '-'),
    name,
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [w, 0] },
      { type: 'L' as const, values: [w, h] },
      { type: 'L' as const, values: [0, h] },
      { type: 'Z' as const, values: [] },
    ],
    seamAllowance: 10,
    grainAngle: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    internals: [],
    notches: [],
  };
}

describe('generateMultiSizeDXF', () => {
  it('produces valid DXF with BLOCK per piece per size', () => {
    const gradedSets = [
      { size: 'S', pieces: [makePiece('Front', 200, 400)] },
      { size: 'M', pieces: [makePiece('Front', 220, 420)] },
    ];
    const dxf = generateMultiSizeDXF(gradedSets);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('FRONT_S');
    expect(dxf).toContain('FRONT_M');
  });

  it('contains INSERT per block', () => {
    const gradedSets = [
      { size: 'S', pieces: [makePiece('Front', 200, 400), makePiece('Back', 200, 350)] },
      { size: 'L', pieces: [makePiece('Front', 240, 440), makePiece('Back', 240, 390)] },
    ];
    const dxf = generateMultiSizeDXF(gradedSets);
    const insertMatches = dxf.match(/^INSERT$/gm);
    expect(insertMatches).not.toBeNull();
    expect(insertMatches!.length).toBe(4);
  });

  it('handles single size', () => {
    const gradedSets = [
      { size: 'M', pieces: [makePiece('Front', 220, 420)] },
    ];
    const dxf = generateMultiSizeDXF(gradedSets);
    expect(dxf).toContain('FRONT_M');
    expect(dxf).toContain('EOF');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dxf/__tests__/exportAAMA.multisize.test.ts`
Expected: FAIL — `generateMultiSizeDXF` is not exported

---

## Task 5: Multi-Size DXF Export — Implementation

**Files:**
- Modify: `src/utils/dxf/exportAAMA.ts`

**Step 1: Read full exportAAMA.ts to understand helpers**

Read the complete file first. The implementation must:
- Add `GradedSizeSet` interface
- Add `generateMultiSizeDXF()` that reuses existing `dxfHeader`, `dxfTables`, block-writing logic
- Modify `dxfTables` to accept optional extra block names (or create a variant)
- Each piece block is named `<PIECE_NAME>_<SIZE>`
- Size groups offset on Y axis

**Step 2: Implement and export `generateMultiSizeDXF` and `downloadMultiSizeDXF`**

**Step 3: Run test to verify it passes**

Run: `npx vitest run src/utils/dxf/__tests__/exportAAMA.multisize.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/dxf/exportAAMA.ts src/utils/dxf/__tests__/exportAAMA.multisize.test.ts
git commit -m "feat(export): add multi-size DXF export"
```

---

## Task 6: Multi-Size DXF — UI + Copilot Tool

**Files:**
- Modify: `src/components/views/ProjectView.tsx`
- Modify: `src/copilot/action/tools/definitions/exportTools.ts`

**Step 1: Add Export Multi-Size DXF button**

Import `downloadMultiSizeDXF` from `../../utils/dxf/exportAAMA`.

Add handler:
```typescript
const handleExportMultiSizeDXF = useCallback(() => {
  downloadMultiSizeDXF(
    [{ size: 'BASE', pieces }],
    `${projectName || 'pattern'}-multisize.dxf`,
  );
}, [pieces, projectName]);
```

Add button after Export DXF (AAMA).

**Step 2: Add `exportMultiSizeDXF` copilot tool**

Follow same pattern as `exportDXFTool` but call `downloadMultiSizeDXF`.

**Step 3: Type check, commit**

Run: `npx tsc --noEmit`

```bash
git add src/components/views/ProjectView.tsx src/copilot/action/tools/definitions/exportTools.ts
git commit -m "feat(export): add multi-size DXF UI and copilot tool"
```

---

## Task 7: FBX Export — Test

**Files:**
- Create: `src/utils/export/__tests__/fbxExporter.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { exportToFBX } from '../fbxExporter';

function makeTestMesh(): THREE.Group {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0, 0,  100, 0, 0,  100, 100, 0,
    0, 0, 0,  100, 100, 0,  0, 100, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff0000 }));
  mesh.name = 'test_piece';
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

describe('exportToFBX', () => {
  it('returns an ArrayBuffer', () => {
    const result = exportToFBX(makeTestMesh());
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('starts with FBX binary magic', () => {
    const result = exportToFBX(makeTestMesh());
    const view = new Uint8Array(result);
    const magic = String.fromCharCode(...view.slice(0, 20));
    expect(magic).toContain('Kaydara FBX Binary');
  });

  it('works with different scale', () => {
    const result = exportToFBX(makeTestMesh(), { scale: 0.001 });
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('handles empty group', () => {
    const result = exportToFBX(new THREE.Group());
    expect(result).toBeInstanceOf(ArrayBuffer);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/export/__tests__/fbxExporter.test.ts`
Expected: FAIL — module not found

---

## Task 8: FBX Export — Implementation

**Files:**
- Create: `src/utils/export/fbxExporter.ts`

**Step 1: Implement minimal FBX 7.4 binary writer**

The FBX binary format structure:
1. Header: "Kaydara FBX Binary  \x00\x1a\x00" (23 bytes) + version uint32 (7400)
2. Node records: each has endOffset, numProperties, propertyListLen, nameLen, name, properties, nested nodes
3. Key nodes: FBXHeaderExtension, GlobalSettings, Objects (containing Geometry + Model)
4. Null record sentinel (13 zero bytes for v7400)

The implementation must:
- Traverse THREE.Object3D for meshes
- Collect positions, normals, indices per mesh
- Apply scale factor
- Write binary FBX with proper node structure

**Step 2: Run test**

Run: `npx vitest run src/utils/export/__tests__/fbxExporter.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/utils/export/fbxExporter.ts src/utils/export/__tests__/fbxExporter.test.ts
git commit -m "feat(export): add FBX binary exporter with tests"
```

---

## Task 9: FBX Export — UI + Copilot Tool

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` — handle `format: 'fbx'`
- Modify: `src/copilot/action/tools/definitions/exportTools.ts` — add `export3DFBX`

**Step 1: Add FBX case to 3D export event handler**

In GarmentSimulation.tsx, find the `openclo:export3d` event listener. Add:
```typescript
case 'fbx': {
  const { downloadFBX } = await import('../../utils/export/fbxExporter');
  downloadFBX(exportScene, { scale: detail.scale ?? 0.1, filename: detail.filename });
  break;
}
```

**Step 2: Add copilot tool**

```typescript
const export3DFBXTool: ToolDefinition = {
  name: 'export3DFBX',
  description:
    'Export simulated 3D garment to FBX binary for Unity/Unreal/Blender/Maya. ' +
    '/ Exportar malla 3D de prenda simulada a FBX binario.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Output filename (without .fbx)' },
      scale: { type: 'number', description: 'Scale: mm->target (0.1=cm, 0.001=m). Default: 0.1' },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const filename = (params.filename as string) || 'garment-3d';
    const scale = (params.scale as number) || 0.1;
    window.dispatchEvent(new CustomEvent('openclo:export3d', {
      detail: { format: 'fbx', filename, scale },
    }));
    return { success: true, data: { filename: `${filename}.fbx`, format: 'FBX' } };
  },
};
```

**Step 3: Type check, commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/copilot/action/tools/definitions/exportTools.ts
git commit -m "feat(export): add FBX 3D export UI and copilot tool"
```

---

## Task 10: OBJ Sequence Export — Test

**Files:**
- Create: `src/utils/export/__tests__/objSequenceExporter.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generateOBJSequence } from '../objSequenceExporter';

describe('generateOBJSequence', () => {
  it('creates a ZIP with correct number of frames', async () => {
    let frame = 0;
    const captureFrame = vi.fn(() => {
      frame++;
      return `# Frame ${frame}\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n`;
    });

    const zip = await generateOBJSequence({ captureFrame, frameCount: 5, fps: 24 });
    expect(zip).toBeInstanceOf(Uint8Array);
    expect(captureFrame).toHaveBeenCalledTimes(5);
  });

  it('includes metadata.json in ZIP', async () => {
    const captureFrame = vi.fn(() => 'v 0 0 0\nf 1\n');
    const zip = await generateOBJSequence({ captureFrame, frameCount: 3, fps: 30 });

    const { unzipSync } = await import('fflate');
    const files = unzipSync(zip);
    const metadataKey = Object.keys(files).find(k => k.includes('metadata.json'));
    expect(metadataKey).toBeDefined();

    const metadata = JSON.parse(new TextDecoder().decode(files[metadataKey!]));
    expect(metadata.fps).toBe(30);
    expect(metadata.frameCount).toBe(3);
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    const captureFrame = vi.fn(() => {
      controller.abort();
      return 'v 0 0 0\nf 1\n';
    });

    await expect(
      generateOBJSequence({ captureFrame, frameCount: 100, fps: 24, abortSignal: controller.signal }),
    ).rejects.toThrow(/abort/i);
  });

  it('calls onProgress callback', async () => {
    const captureFrame = vi.fn(() => 'v 0 0 0\nf 1\n');
    const onProgress = vi.fn();

    await generateOBJSequence({ captureFrame, frameCount: 3, fps: 24, onProgress });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/export/__tests__/objSequenceExporter.test.ts`
Expected: FAIL — module not found

---

## Task 11: OBJ Sequence Export — Implementation

**Files:**
- Create: `src/utils/export/objSequenceExporter.ts`

**Step 1: Verify fflate is available**

Run: `npm ls fflate`
If missing: `npm install fflate`

**Step 2: Implement**

```typescript
import { zipSync, strToU8 } from 'fflate';

export interface OBJSequenceOptions {
  captureFrame: () => string;
  frameCount: number;
  fps: number;
  onProgress?: (current: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export async function generateOBJSequence(opts: OBJSequenceOptions): Promise<Uint8Array> {
  const { captureFrame, frameCount, fps, onProgress, abortSignal } = opts;
  const files: Record<string, Uint8Array> = {};

  for (let i = 0; i < frameCount; i++) {
    if (abortSignal?.aborted) throw new Error('Export aborted');
    const objString = captureFrame();
    files[`sequence/frame_${String(i + 1).padStart(4, '0')}.obj`] = strToU8(objString);
    onProgress?.(i + 1, frameCount);
    await new Promise(r => setTimeout(r, 0));
  }

  files['metadata.json'] = strToU8(JSON.stringify({
    fps, frameCount, duration: frameCount / fps,
    exportedAt: new Date().toISOString(), format: 'OBJ Sequence',
  }, null, 2));

  return zipSync(files);
}

export function downloadOBJSequence(zip: Uint8Array, filename = 'simulation-sequence.zip') {
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 3: Run test**

Run: `npx vitest run src/utils/export/__tests__/objSequenceExporter.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/export/objSequenceExporter.ts src/utils/export/__tests__/objSequenceExporter.test.ts
git commit -m "feat(export): add OBJ sequence exporter with ZIP output"
```

---

## Task 12: OBJ Sequence — UI + Copilot Tool

**Files:**
- Modify: `src/components/Timeline/ExportDialog.tsx` — add OBJ Sequence format option
- Modify: `src/copilot/action/tools/definitions/exportTools.ts` — add `exportOBJSequence` tool

**Step 1: Add format toggle to ExportDialog**

Add a format state: `const [format, setFormat] = useState<'webm' | 'obj-sequence'>('webm');`

When `obj-sequence` is selected, the export handler should:
- Use `exportToOBJ` from `objExporter.ts` as `captureFrame`
- Call `generateOBJSequence` then `downloadOBJSequence`

**Step 2: Add copilot tool**

```typescript
const exportOBJSequenceTool: ToolDefinition = {
  name: 'exportOBJSequence',
  description:
    'Export cloth simulation as OBJ sequence (ZIP) for VFX. One OBJ per frame. ' +
    '/ Exportar simulacion como secuencia OBJ (ZIP) para VFX.',
  parameters: {
    type: 'object',
    properties: {
      frameCount: { type: 'number', description: 'Frames to capture (default: 100)' },
      fps: { type: 'number', description: 'FPS for metadata (default: 24)' },
      filename: { type: 'string', description: 'Output ZIP filename' },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const frameCount = (params.frameCount as number) || 100;
    const fps = (params.fps as number) || 24;
    const filename = (params.filename as string) || 'simulation-sequence';
    window.dispatchEvent(new CustomEvent('openclo:exportObjSequence', {
      detail: { frameCount, fps, filename },
    }));
    return {
      success: true,
      data: { filename: `${filename}.zip`, frameCount, fps },
    };
  },
};
```

**Step 3: Type check, commit**

```bash
git add src/components/Timeline/ExportDialog.tsx src/copilot/action/tools/definitions/exportTools.ts
git commit -m "feat(export): add OBJ sequence UI and copilot tool"
```

---

## Task 13: Final Verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Zero errors

**Step 2: Run all export tests**

Run: `npx vitest run src/utils/export/__tests__/ src/utils/dxf/__tests__/`
Expected: All pass

**Step 3: Full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 4: Production build**

Run: `npm run build`
Expected: Success

**Step 5: Cleanup commit if needed**

```bash
git add -A && git commit -m "chore: final cleanup for export pipeline"
```
