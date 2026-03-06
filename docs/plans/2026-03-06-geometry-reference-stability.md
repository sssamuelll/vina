# Geometry Reference Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove coordinate normalization, stabilize SemanticEdge IDs across rebuilds, and migrate seam references from fragile PathCommand indices to stable edge names.

**Architecture:** Three layered changes: (1) pieceBuilder stops normalizing coordinates — pieces keep absolute construction coords, (2) `detectSemanticEdges()` generates deterministic IDs from `pieceId:edgeName`, (3) Seam type changes from `{ pieceId, edgeStart, edgeEnd }` to `{ pieceId, edgeName }` — seam assembly resolves edge names to segment ranges at simulation time.

**Tech Stack:** TypeScript, Redux Toolkit, Vitest, React (SVG)

---

### Task 1: Remove Coordinate Normalization from pieceBuilder

**Files:**
- Modify: `src/utils/construction/pieceBuilder.ts:127-161`
- Test: `src/utils/construction/__tests__/pieceBuilder.test.ts` (create)

**Context:** `pieceBuilder.ts` currently computes `minX`/`minY` of the outline and subtracts them from every coordinate (lines 127-140), then returns `normOffset: { x: minX, y: minY }`. This creates a mismatch between construction coordinates and pattern coordinates. We remove it.

**Step 1: Write the test**

Create `src/utils/construction/__tests__/pieceBuilder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPiece, buildPieceWithOffset } from '../pieceBuilder';
import type { CPoint, CCurve, CPiece } from '../../../types/construction';
import type { FormulaContext } from '../../seamly2d/formulaEvaluator';

function makeCtx(): FormulaContext {
  return { measurements: {}, variables: {}, increments: {} };
}

function makePoints(): CPoint[] {
  return [
    { id: 'p1', label: 'A', x: 100, y: 200, type: 'absolute', visible: true },
    { id: 'p2', label: 'B', x: 300, y: 200, type: 'absolute', visible: true },
    { id: 'p3', label: 'C', x: 300, y: 500, type: 'absolute', visible: true },
    { id: 'p4', label: 'D', x: 100, y: 500, type: 'absolute', visible: true },
  ];
}

function makePiece(): CPiece {
  return {
    id: 'cp1',
    name: 'Front',
    nodes: [
      { pointId: 'p1', connection: 'line' },
      { pointId: 'p2', connection: 'line' },
      { pointId: 'p3', connection: 'line' },
      { pointId: 'p4', connection: 'line' },
    ],
    seamAllowance: 10,
    closed: true,
  };
}

describe('buildPiece', () => {
  it('preserves absolute coordinates (no normalization)', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx());
    // First command is M to point A (100, 200)
    expect(piece.outline[0]).toEqual({ type: 'M', values: [100, 200] });
    // Second command is L to point B (300, 200)
    expect(piece.outline[1]).toEqual({ type: 'L', values: [300, 200] });
  });

  it('returns zero normOffset', () => {
    const { piece, normOffset } = buildPieceWithOffset(
      makePiece(), makePoints(), [], makeCtx()
    );
    expect(normOffset).toEqual({ x: 0, y: 0 });
    // Coordinates should still be absolute
    expect(piece.outline[0].values).toEqual([100, 200]);
  });

  it('uses existingPieceId when provided', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx(), 'existing-id');
    expect(piece.id).toBe('existing-id');
  });

  it('generates new id when existingPieceId not provided', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx());
    expect(piece.id).toMatch(/^piece-/);
  });

  it('sets position to { x: 0, y: 0 } for absolute coords', () => {
    const piece = buildPiece(makePiece(), makePoints(), [], makeCtx());
    expect(piece.position).toEqual({ x: 0, y: 0 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/construction/__tests__/pieceBuilder.test.ts`
Expected: FAIL — coordinates will be normalized (shifted to near-origin), and position will be `{ x: 50, y: 50 }`.

**Step 3: Remove normalization from pieceBuilder.ts**

In `src/utils/construction/pieceBuilder.ts`, replace lines 127-161 with:

```typescript
  // No normalization: keep absolute construction coordinates.
  // View-level positioning is handled by piece.position in the 2D editor.

  const now = Date.now();

  return {
    piece: {
      id: existingPieceId || uid(),
      name: cPiece.name,
      outline,
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: cPiece.seamAllowance,
      constructionPieceId: cPiece.id,
      createdAt: now,
      updatedAt: now,
    },
    normOffset: { x: 0, y: 0 },
  };
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/construction/__tests__/pieceBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/construction/pieceBuilder.ts src/utils/construction/__tests__/pieceBuilder.test.ts
git commit -m "feat: remove coordinate normalization from pieceBuilder"
```

---

### Task 2: Remove normOffset from CPiece and constructionSlice

**Files:**
- Modify: `src/types/construction.ts:106-107`
- Modify: `src/store/constructionSlice.ts:179-182,285`
- Modify: `src/copilot/action/tools/definitions/seamlyTools.ts:15,264`
- Modify: `src/components/PatternEditor/renderers/ConstructionOverlay.tsx:53-54,70,76-77,83-84,150-151`

**Context:** With normalization removed, `normOffset` is always `{ x: 0, y: 0 }`. Remove the field, the Redux action, and all code that subtracts it.

**Step 1: Remove normOffset from CPiece type**

In `src/types/construction.ts`, delete lines 106-107:
```typescript
  /** Normalization offset applied by buildPiece (for overlay alignment) */
  normOffset?: { x: number; y: number };
```

**Step 2: Remove setConstructionPieceNormOffset action**

In `src/store/constructionSlice.ts`:
- Delete the reducer at lines 179-182:
  ```typescript
  setConstructionPieceNormOffset(state, action: PayloadAction<...>) { ... },
  ```
- Remove `setConstructionPieceNormOffset` from the exports at line 285.

**Step 3: Remove normOffset dispatch from seamlyTools.ts**

In `src/copilot/action/tools/definitions/seamlyTools.ts`:
- Remove import: `import { setConstructionPieceNormOffset } from '../../../../store/constructionSlice';` (line 15)
- Delete the dispatch call: `dispatch(setConstructionPieceNormOffset({ pieceId: cPiece.id, normOffset }));` (line 264)
- Change `const { piece, normOffset } = buildPieceWithOffset(...)` to `const { piece } = buildPieceWithOffset(...)` since normOffset is no longer needed.

**Step 4: Simplify ConstructionOverlay.tsx**

In `src/components/PatternEditor/renderers/ConstructionOverlay.tsx`:
- Remove lines 53-54 (`const offsetX = cPiece.normOffset?.x ?? 0;` and `const offsetY = ...`).
- In the `renderCurves` call (line 70), pass `0, 0` instead of `offsetX, offsetY`.
- In the point circle/text rendering, replace `point.x - offsetX` with just `point.x`, and `point.y - offsetY` with `point.y`.

The full per-piece block becomes:
```tsx
return (
  <g
    key={cPiece.id}
    transform={`translate(${patternPiece.position.x}, ${patternPiece.position.y})`}
  >
    {renderCurves(blockCurves, ptMap, 0, 0, strokeWidth)}
    {blockPoints.filter(p => p.visible).map(point => (
      <g key={point.id}>
        <circle
          cx={point.x} cy={point.y}
          r={pointSize}
          fill={selectedEntity?.id === point.id ? COLORS.pointSelected : COLORS.point}
          stroke="#fff"
          strokeWidth={strokeWidth * 0.5}
        />
        <text
          x={point.x + pointSize + 3 / zoom2D}
          y={point.y - pointSize}
          fontSize={fontSize}
          fill={COLORS.label}
          fontFamily="monospace"
        >
          {point.label}
        </text>
      </g>
    ))}
  </g>
);
```

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: clean — no references to `normOffset` or `setConstructionPieceNormOffset` remain.

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: all pass.

**Step 7: Commit**

```bash
git add src/types/construction.ts src/store/constructionSlice.ts src/copilot/action/tools/definitions/seamlyTools.ts src/components/PatternEditor/renderers/ConstructionOverlay.tsx
git commit -m "refactor: remove normOffset from CPiece and construction overlay"
```

---

### Task 3: Stabilize SemanticEdge IDs

**Files:**
- Modify: `src/utils/semanticEdges.ts:12-13,143,231-232`
- Modify: `src/utils/__tests__/semanticEdges.test.ts`

**Context:** `detectSemanticEdges()` currently uses a session-scoped counter (`edge-1`, `edge-2`, ...) that resets on every call. We replace it with a deterministic ID: `{pieceId}:{edgeName}`.

**Step 1: Write the test for stable IDs**

Add to `src/utils/__tests__/semanticEdges.test.ts`:

```typescript
it('generates deterministic IDs from pieceId + edgeName', () => {
  const piece = makePiece('Front Bodice', bodiceFrontOutline);
  piece.id = 'test-piece-1';
  const edges1 = detectSemanticEdges(piece);
  const edges2 = detectSemanticEdges(piece);
  // Same piece → same IDs
  expect(edges1.map(e => e.id)).toEqual(edges2.map(e => e.id));
  // IDs should contain piece ID
  for (const edge of edges1) {
    expect(edge.id).toBe(`test-piece-1:${edge.name}`);
  }
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/semanticEdges.test.ts`
Expected: FAIL — IDs will be `edge-N` (counter-based), not `pieceId:name`.

**Step 3: Update detectSemanticEdges signature and ID generation**

In `src/utils/semanticEdges.ts`:

1. Remove the counter (lines 12-13):
   ```typescript
   // DELETE:
   let _edgeCounter = 0;
   function edgeId(): string { return `edge-${++_edgeCounter}`; }
   ```

2. Change the function signature (line 143):
   ```typescript
   export function detectSemanticEdges(piece: PatternPiece): SemanticEdge[] {
   ```
   No signature change needed — `piece.id` is already available on `PatternPiece`.

3. Replace `id: edgeId()` with `id: `${piece.id}:${finalName}`` at line 232:
   ```typescript
   edges.push({
     id: `${piece.id}:${finalName}`,
     name: finalName,
     segmentRange: [startIdx, endIdx],
     edgeType,
     matchHint,
     length: Math.round(totalLength * 100) / 100,
   });
   ```

**Step 4: Update existing tests**

In `src/utils/__tests__/semanticEdges.test.ts`, update the `makePiece` helper to include an `id`:

```typescript
function makePiece(name: string, outline: PathCommand[]): PatternPiece {
  return {
    id: `piece-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    outline,
    // ... rest unchanged
  };
}
```

Update any test that checks `e.id` format — the IDs will now be `pieceId:edgeName` instead of `edge-N`. The test at line 44 (`expect(edges.every(e => e.id)).toBe(true)`) still passes since IDs are truthy strings.

**Step 5: Run tests**

Run: `npx vitest run src/utils/__tests__/semanticEdges.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/utils/semanticEdges.ts src/utils/__tests__/semanticEdges.test.ts
git commit -m "feat: stabilize SemanticEdge IDs with deterministic pieceId:name format"
```

---

### Task 4: Migrate Seam Type to Edge-Name References

**Files:**
- Modify: `src/types/types.ts:162-170`
- Modify: `src/__tests__/store.test.ts:54-57`
- Test: verify type check clean

**Context:** Change the `Seam` interface from `{ pieceId, edgeStart, edgeEnd }` to `{ pieceId, edgeName }`. This is the core type change — all consumers will need updating.

**Step 1: Update Seam interface**

In `src/types/types.ts`, replace lines 162-170:

```typescript
/** A seam connects two named edges from different pattern pieces */
export interface Seam {
  id: string;
  /** First piece + semantic edge name */
  pieceA: { pieceId: string; edgeName: string };
  /** Second piece + semantic edge name */
  pieceB: { pieceId: string; edgeName: string };
  /** Seam type affects 3D simulation */
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}
```

**Step 2: Run type check to find all breakages**

Run: `npx tsc --noEmit 2>&1 | head -60`
Expected: Multiple type errors in files that reference `edgeStart`/`edgeEnd`. This gives us the exact list of files to fix in subsequent tasks.

**Step 3: Update store.test.ts**

In `src/__tests__/store.test.ts`, change the seam creation at lines 54-57:

```typescript
store.dispatch(addSeam({
  id: 's1', pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
  pieceB: { pieceId: 'p2', edgeName: 'sideSeam' }, type: 'standard',
}));
```

**Step 4: Commit** (type errors in other files expected — fixed in tasks 5-8)

```bash
git add src/types/types.ts src/__tests__/store.test.ts
git commit -m "feat: migrate Seam type from index-based to edge-name references"
```

---

### Task 5: Update Seam Tools (createSeam)

**Files:**
- Modify: `src/copilot/action/tools/definitions/seamTools.ts:102-151`

**Context:** The `createSeam` copilot tool currently accepts `edgeAStart`/`edgeAEnd` integer params. Change to `edgeAName`/`edgeBName` string params.

**Step 1: Update createSeamTool**

Replace the tool definition in `src/copilot/action/tools/definitions/seamTools.ts`:

```typescript
const createSeamTool: ToolDefinition = {
  name: 'createSeam',
  description:
    'Connect two named edges from different pieces with a seam (costura). ' +
    'Use edge names like "armhole", "sideSeam", "hemline", "shoulder". ' +
    '/ Conectar dos bordes nombrados de diferentes piezas con una costura.',
  parameters: {
    type: 'object',
    properties: {
      pieceAId: { type: 'string', description: 'First piece ID / ID de la primera pieza' },
      edgeAName: { type: 'string', description: 'Semantic edge name on piece A (e.g. "armhole", "sideSeam") / Nombre del borde semántico en pieza A' },
      pieceBId: { type: 'string', description: 'Second piece ID / ID de la segunda pieza' },
      edgeBName: { type: 'string', description: 'Semantic edge name on piece B / Nombre del borde semántico en pieza B' },
      seamType: {
        type: 'string',
        enum: ['standard', 'french', 'flat-felled', 'overlock'],
        description: 'Seam type / Tipo de costura',
      },
    },
    required: ['pieceAId', 'edgeAName', 'pieceBId', 'edgeBName'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieceA = state.project.pieces.find(p => p.id === params.pieceAId);
    const pieceB = state.project.pieces.find(p => p.id === params.pieceBId);

    if (!pieceA) return { success: false, error: `Piece A "${params.pieceAId}" not found` };
    if (!pieceB) return { success: false, error: `Piece B "${params.pieceBId}" not found` };

    const edgeAName = params.edgeAName as string;
    const edgeBName = params.edgeBName as string;

    // Validate edge names exist on the pieces
    const edgeA = pieceA.edges?.find(e => e.name === edgeAName);
    const edgeB = pieceB.edges?.find(e => e.name === edgeBName);
    if (!edgeA) return { success: false, error: `Edge "${edgeAName}" not found on piece "${pieceA.name}". Available: ${pieceA.edges?.map(e => e.name).join(', ') || 'none (run detectEdges first)'}` };
    if (!edgeB) return { success: false, error: `Edge "${edgeBName}" not found on piece "${pieceB.name}". Available: ${pieceB.edges?.map(e => e.name).join(', ') || 'none (run detectEdges first)'}` };

    const seamId = `seam-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
    const seam: Seam = {
      id: seamId,
      pieceA: { pieceId: params.pieceAId as string, edgeName: edgeAName },
      pieceB: { pieceId: params.pieceBId as string, edgeName: edgeBName },
      type: (params.seamType as Seam['type']) || 'standard',
    };

    dispatch(addSeam(seam));
    return { success: true, data: { seamId } };
  },
};
```

**Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep seamTools`
Expected: clean for this file.

**Step 3: Commit**

```bash
git add src/copilot/action/tools/definitions/seamTools.ts
git commit -m "feat: update createSeam tool to use edge names"
```

---

### Task 6: Update Auto-Sew to Produce Edge-Name Seams

**Files:**
- Modify: `src/utils/autoSew/index.ts:159-172`
- Modify: `src/utils/autoSew/edgeExtractor.ts` (add `edgeName` to ExtractedEdge)
- Modify: `src/utils/autoSew/__tests__/autoSew.test.ts`
- Modify: `src/hooks/useParametricEngine.ts:337`

**Context:** `autoSew()` currently builds `Seam` objects with `edgeStart`/`edgeEnd`. It needs to produce `edgeName` instead. The edge extractor already computes edge positions — we derive edge names using the same logic as `detectSemanticEdges`.

**Step 1: Add edgeName to ExtractedEdge**

In `src/utils/autoSew/edgeExtractor.ts`, add a `name` field to `ExtractedEdge`:

```typescript
export interface ExtractedEdge {
  pieceId: string;
  edgeIndex: number;
  segStart: number;
  segEnd: number;
  arcLength: number;
  midpoint: { x: number; y: number };
  angle: number;
  isCurved: boolean;
  /** Semantic edge name (e.g. "armhole", "sideSeam") */
  name: string;
}
```

In the `extractEdges` function, after building the edge, assign a name. The simplest approach: call `detectSemanticEdges(piece)` once and match each extracted edge to a semantic edge by overlapping segment ranges:

```typescript
import { detectSemanticEdges } from '../semanticEdges';

export function extractEdges(piece: PatternPiece): ExtractedEdge[] {
  // ... existing extraction logic ...

  // Detect semantic edges for naming
  const semanticEdges = detectSemanticEdges(piece);

  // For each extracted edge, find matching semantic edge by segment overlap
  for (const edge of edges) {
    const match = semanticEdges.find(se =>
      se.segmentRange[0] <= edge.segStart && se.segmentRange[1] >= edge.segEnd
    );
    edge.name = match?.name ?? `edge-${edge.edgeIndex}`;
  }

  return edges;
}
```

**Step 2: Update autoSew seam construction**

In `src/utils/autoSew/index.ts`, replace lines 159-172:

```typescript
const seams: ProposedSeam[] = ranked.map((candidate, idx) => ({
  seam: {
    id: `auto-seam-${Date.now()}-${idx}`,
    pieceA: {
      pieceId: candidate.edgeA.pieceId,
      edgeName: candidate.edgeA.name,
    },
    pieceB: {
      pieceId: candidate.edgeB.pieceId,
      edgeName: candidate.edgeB.name,
    },
    type: 'standard',
  },
  // ... rest unchanged
```

**Step 3: Update useParametricEngine.ts**

The auto-seam logic in `src/hooks/useParametricEngine.ts` at line 337 dispatches `addSeam(proposed.seam)`. Since `proposed.seam` now has the new shape, this just works — no change needed beyond verifying it type-checks.

**Step 4: Update autoSew tests**

In `src/utils/autoSew/__tests__/autoSew.test.ts`, any test that accesses `s.seam.pieceA.edgeStart` should be updated to access `s.seam.pieceA.edgeName` instead:

```typescript
// Line 327: Change from checking edgeStart/edgeEnd to checking edgeName exists
const topSeam = result.seams[0];
expect(topSeam.seam.pieceA.edgeName).toBeTruthy();
expect(topSeam.seam.pieceB.edgeName).toBeTruthy();
```

**Step 5: Run tests**

Run: `npx vitest run src/utils/autoSew`
Expected: PASS

**Step 6: Commit**

```bash
git add src/utils/autoSew/ src/hooks/useParametricEngine.ts
git commit -m "feat: auto-sew produces edge-name seams"
```

---

### Task 7: Update SeamInitData and Cloth Worker

**Files:**
- Modify: `src/utils/cloth/clothWorker.ts:17-25,164-168,185-189`
- Modify: `src/utils/cloth/seamAssembly.ts:130-140,355-367`
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:44-55`

**Context:** The cloth simulation worker receives seam data via `SeamInitData` which currently has `pieceAEdgeStart`/`pieceAEdgeEnd`. We change it to `pieceAEdgeName`/`pieceBEdgeName`. The `buildSeamConstraints` function in `seamAssembly.ts` resolves edge names to segment ranges using the piece's semantic edges.

**Step 1: Update SeamInitData**

In `src/utils/cloth/clothWorker.ts`, replace lines 17-25:

```typescript
export interface SeamInitData {
  id: string;
  pieceAId: string;
  pieceAEdgeName: string;
  pieceBId: string;
  pieceBEdgeName: string;
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}
```

**Step 2: Update Seam reconstruction in clothWorker.ts**

In `src/utils/cloth/clothWorker.ts`, update the two places that reconstruct `Seam[]` from `SeamInitData[]` (lines 164-168 and 185-189):

```typescript
const seams: import('../../types/types').Seam[] = msg.seams.map(s => ({
  id: s.id,
  pieceA: { pieceId: s.pieceAId, edgeName: s.pieceAEdgeName },
  pieceB: { pieceId: s.pieceBId, edgeName: s.pieceBEdgeName },
  type: s.type,
}));
```

**Step 3: Update buildSeamConstraints to resolve edge names**

In `src/utils/cloth/seamAssembly.ts`, the `buildSeamConstraints` function currently reads `seam.pieceA.edgeStart`/`edgeEnd` directly. We need to accept a `pieces` map to resolve edge names to segment ranges.

Add a new parameter and resolution logic. Update the function signature and the edge parameterization calls (around lines 340-367):

```typescript
export function buildSeamConstraints(
  seams: Seam[],
  outlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMesh,
  pieces?: Map<string, { edges?: SemanticEdge[] }>,
  config: SeamConfig = DEFAULT_SEAM_CONFIG,
): SeamConstraintResult {
```

Replace the `parameterizeEdge` calls:

```typescript
for (const seam of seams) {
  const outlineA = outlines.get(seam.pieceA.pieceId);
  const outlineB = outlines.get(seam.pieceB.pieceId);
  if (!outlineA || !outlineB) continue;

  const offsetA = mergedMesh.pieceOffsets.get(seam.pieceA.pieceId);
  const offsetB = mergedMesh.pieceOffsets.get(seam.pieceB.pieceId);
  if (!offsetA || !offsetB) continue;

  // Resolve edge names to segment ranges
  const pieceAData = pieces?.get(seam.pieceA.pieceId);
  const pieceBData = pieces?.get(seam.pieceB.pieceId);
  const edgeA = pieceAData?.edges?.find(e => e.name === seam.pieceA.edgeName);
  const edgeB = pieceBData?.edges?.find(e => e.name === seam.pieceB.edgeName);
  if (!edgeA || !edgeB) continue;

  const maxEdgeLength = 15;
  const paramA = parameterizeEdge(outlineA, edgeA.segmentRange[0], edgeA.segmentRange[1], offsetA.vertexOffset, 12, maxEdgeLength);
  const paramB = parameterizeEdge(outlineB, edgeB.segmentRange[0], edgeB.segmentRange[1], offsetB.vertexOffset, 12, maxEdgeLength);

  // ... rest of vertex matching + constraint creation unchanged
```

**Step 4: Update seamsToInitData in GarmentSimulation.tsx**

In `src/components/Viewport3D/GarmentSimulation.tsx`, replace lines 44-55:

```typescript
function seamsToInitData(seams: Seam[]): SeamInitData[] {
  return seams.map(s => ({
    id: s.id,
    pieceAId: s.pieceA.pieceId,
    pieceAEdgeName: s.pieceA.edgeName,
    pieceBId: s.pieceB.pieceId,
    pieceBEdgeName: s.pieceB.edgeName,
    type: s.type,
  }));
}
```

Also, wherever `buildSeamConstraints` is called from the worker, pass the pieces map with edges. In `clothWorker.ts`, the worker needs to build a pieces map from cached data. The simplest approach: send the pieces' edges as part of initialization.

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: Fewer errors (may still have some in seamAssembly.test.ts and gpu client).

**Step 6: Commit**

```bash
git add src/utils/cloth/clothWorker.ts src/utils/cloth/seamAssembly.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat: cloth worker uses edge-name seam references"
```

---

### Task 8: Update Seam Assembly Tests

**Files:**
- Modify: `src/utils/cloth/seamAssembly.test.ts`

**Context:** The seam assembly tests create `Seam` objects with `edgeStart`/`edgeEnd`. Update them to use `edgeName` and provide piece edges for resolution.

**Step 1: Update test seam objects**

Replace seam constructions like:
```typescript
const seam: Seam = {
  id: 's1',
  pieceA: { pieceId: 'a', edgeStart: 1, edgeEnd: 2 },
  pieceB: { pieceId: 'b', edgeStart: 0, edgeEnd: 3 },
  type: 'standard',
};
```

With:
```typescript
const seam: Seam = {
  id: 's1',
  pieceA: { pieceId: 'a', edgeName: 'rightEdge' },
  pieceB: { pieceId: 'b', edgeName: 'leftEdge' },
  type: 'standard',
};

// Provide pieces map with edge definitions
const pieces = new Map([
  ['a', { edges: [{ id: 'a:rightEdge', name: 'rightEdge', segmentRange: [1, 2] as [number, number], edgeType: 'seam' as const }] }],
  ['b', { edges: [{ id: 'b:leftEdge', name: 'leftEdge', segmentRange: [0, 3] as [number, number], edgeType: 'seam' as const }] }],
]);
```

Pass the `pieces` map to `buildSeamConstraints`.

**Step 2: Run tests**

Run: `npx vitest run src/utils/cloth/seamAssembly.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/utils/cloth/seamAssembly.test.ts
git commit -m "test: update seam assembly tests for edge-name references"
```

---

### Task 9: Update GPU Solver Client

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`

**Context:** The GPU solver client also references `SeamInitData`. Verify it compiles with the new shape. Update any code that reads `pieceAEdgeStart`/`pieceAEdgeEnd`.

**Step 1: Find and fix references**

Run: `npx tsc --noEmit 2>&1 | grep gpu`

Update any remaining references from `pieceAEdgeStart`/`pieceAEdgeEnd` to `pieceAEdgeName`/`pieceBEdgeName`.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 3: Commit**

```bash
git add src/utils/cloth/gpu/
git commit -m "fix: update GPU solver client for edge-name seams"
```

---

### Task 10: Fix Remaining Type Errors and Mock States

**Files:**
- Any remaining files with type errors after `npx tsc --noEmit`
- Likely: `src/copilot/perception/__tests__/contextBuilder.test.ts` (mock RootState)
- Likely: WASM worker if it references SeamInitData directly

**Context:** Catch-all task for any remaining compilation errors.

**Step 1: Run full type check**

Run: `npx tsc --noEmit 2>&1`

**Step 2: Fix each error**

For each error, update the code to use the new Seam shape (`edgeName` instead of `edgeStart`/`edgeEnd`).

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve all remaining type errors from seam migration"
```

---

### Task 11: Full Verification

**Files:** None (verification only)

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: clean — zero errors.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass.

**Step 3: Verify no leftover references to old Seam shape**

Run: `grep -r "edgeStart\|edgeEnd" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "\.test\." | grep -v __tests__`

Expected: zero hits (all `edgeStart`/`edgeEnd` references migrated).

Also verify normOffset is gone:
Run: `grep -r "normOffset" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules`

Expected: zero hits.
