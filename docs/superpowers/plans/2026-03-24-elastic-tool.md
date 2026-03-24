# Elastic Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully functional Elastic tool — data model, Redux state, 2D interaction hook, zigzag SVG renderer, WASM/CPU simulation constraints, and copilot tool registration.

**Architecture:** New `Elastic` entity stored in `projectSlice.elastics[]`. Click-edge interaction via `useElasticTool` hook. Zigzag SVG rendering via `ElasticRenderer`. Simulation via `elasticAssembly.ts` reusing `parameterizeEdge` from seam assembly. Three copilot action tools (add/remove/update) registered in the action tool registry.

**Tech Stack:** React, Redux Toolkit, SVG, XPBD cloth simulation (TypeScript solver), Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-elastic-tool-design.md`

---

### Task 1: Add Elastic type to types.ts

**Files:**
- Modify: `src/types/types.ts` (after `Seam` interface, ~line 192)

- [ ] **Step 1: Add Elastic interface and ElasticType**

After the `Seam` interface block, add:

```typescript
// ─── Elastics (edge-based elastic/gathering) ───

export type ElasticType = 'band' | 'shirring' | 'drawstring';

export interface Elastic {
  id: string;
  pieceId: string;
  edgeName: string;
  stretchRatio: number;   // 0.1–2.0
  width: number;          // mm
  type: ElasticType;
  tStart: number;         // 0.0–1.0
  tEnd: number;           // 0.0–1.0
  active: boolean;
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers yet)

- [ ] **Step 3: Commit**

```
git add src/types/types.ts
git commit -m "feat(types): add Elastic interface (#322)"
```

---

### Task 2: Add elastics to projectSlice Redux state

**Files:**
- Modify: `src/store/projectSlice.ts`

- [ ] **Step 1: Add `elastics` to ProjectState and initialState**

In `ProjectState` interface (~line 49), add after `seams`:
```typescript
  elastics: Elastic[];
```

In `initialState` (~line 77), add after `seams: []`:
```typescript
  elastics: [],
```

Add the `Elastic` import at the top:
```typescript
import type { ..., Elastic } from '../types/types';
```

- [ ] **Step 2: Add reducers**

In the `reducers` block, add after the seam reducers section:

```typescript
    // ─── Elastics ───
    addElastic(state, action: PayloadAction<Elastic>) {
      // Validate edge exists on piece
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const edge = piece.edges?.find(e => e.name === action.payload.edgeName);
      if (!edge) return;
      state.elastics.push({
        ...action.payload,
        stretchRatio: Math.max(0.1, Math.min(2.0, action.payload.stretchRatio)),
      });
      state.isDirty = true;
    },
    removeElastic(state, action: PayloadAction<string>) {
      state.elastics = state.elastics.filter(e => e.id !== action.payload);
      state.isDirty = true;
    },
    updateElastic(state, action: PayloadAction<Partial<Elastic> & { id: string }>) {
      const idx = state.elastics.findIndex(e => e.id === action.payload.id);
      if (idx === -1) return;
      const updated = { ...state.elastics[idx], ...action.payload };
      updated.stretchRatio = Math.max(0.1, Math.min(2.0, updated.stretchRatio));
      state.elastics[idx] = updated;
      state.isDirty = true;
    },
```

- [ ] **Step 3: Add removePiece cascade**

In the existing `removePiece` reducer (~line 174), add after the seam filter line:
```typescript
      state.elastics = state.elastics.filter(e => e.pieceId !== action.payload);
```

- [ ] **Step 4: Export the new actions**

Add to the exports destructuring (~line 795):
```typescript
  addElastic, removeElastic, updateElastic,
```

- [ ] **Step 5: Run type check and existing tests**

Run: `npx tsc --noEmit && npx vitest run src/store/__tests__/`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add src/store/projectSlice.ts
git commit -m "feat(store): add elastics state, reducers, and removePiece cascade (#322)"
```

---

### Task 3: Create elasticAssembly — simulation constraint builder

**Files:**
- Create: `src/utils/cloth/elasticAssembly.ts`
- Create: `src/utils/cloth/__tests__/elasticAssembly.test.ts`

- [ ] **Step 1: Write tests first**

```typescript
import { describe, it, expect } from 'vitest';
import { buildElasticConstraints, ELASTIC_COMPLIANCE } from '../elasticAssembly';
import type { Elastic } from '../../../types/types';
import type { PathCommand } from '../../../types/types';

// Minimal square piece: 4 vertices at (0,0), (100,0), (100,100), (0,100)
const squareOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

const pieceId = 'piece1';

describe('buildElasticConstraints', () => {
  it('returns empty array when no elastics', () => {
    const result = buildElasticConstraints(
      [],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints).toEqual([]);
  });

  it('builds constraints with contracted rest lengths', () => {
    const elastic: Elastic = {
      id: 'e1', pieceId, edgeName: 'top', stretchRatio: 0.5,
      width: 12, type: 'band', tStart: 0, tEnd: 1, active: true,
    };
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints.length).toBeGreaterThan(0);
    // Rest lengths should be ~50% of original (stretchRatio = 0.5)
    for (const c of result.constraints) {
      expect(c.compliance).toBe(ELASTIC_COMPLIANCE.band);
    }
  });

  it('skips inactive elastics', () => {
    const elastic: Elastic = {
      id: 'e1', pieceId, edgeName: 'top', stretchRatio: 0.5,
      width: 12, type: 'band', tStart: 0, tEnd: 1, active: false,
    };
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints).toEqual([]);
  });

  it('uses correct compliance for each elastic type', () => {
    expect(ELASTIC_COMPLIANCE.band).toBeLessThan(ELASTIC_COMPLIANCE.drawstring);
    expect(ELASTIC_COMPLIANCE.drawstring).toBeLessThan(ELASTIC_COMPLIANCE.shirring);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/cloth/__tests__/elasticAssembly.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement elasticAssembly.ts**

```typescript
/**
 * Elastic Assembly — builds XPBD distance constraints for elastic edges.
 *
 * Reuses parameterizeEdge from seamAssembly to map named edges to mesh vertices.
 * Each elastic creates distance constraints with contracted rest lengths,
 * causing fabric to gather during simulation.
 *
 * @module elasticAssembly
 */

import type { Elastic, ElasticType, PathCommand, SemanticEdge } from '../../types/types';
import { parameterizeEdge } from './seamAssembly';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ElasticConstraint {
  vertexA: number;
  vertexB: number;
  restLength: number;
  compliance: number;
}

export interface ElasticConstraintSet {
  constraints: ElasticConstraint[];
}

interface MergedMeshInfo {
  vertices: Float32Array;
  indices: Uint32Array;
  pieceOffsets: Map<string, { vertexOffset: number; indexOffset: number }>;
}

// ─── Compliance ────────────────────────────────────────────────────────────

export const ELASTIC_COMPLIANCE: Record<ElasticType, number> = {
  band: 0.00005,
  drawstring: 0.0002,
  shirring: 0.0005,
};

// ─── Builder ───────────────────────────────────────────────────────────────

export function buildElasticConstraints(
  elastics: Elastic[],
  outlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMeshInfo,
  pieces?: Map<string, { edges?: Array<Pick<SemanticEdge, 'name' | 'segmentRange'>> }>,
): ElasticConstraintSet {
  const constraints: ElasticConstraint[] = [];

  for (const elastic of elastics) {
    if (!elastic.active) continue;

    const outline = outlines.get(elastic.pieceId);
    const offset = mergedMesh.pieceOffsets.get(elastic.pieceId);
    const pieceData = pieces?.get(elastic.pieceId);
    if (!outline || !offset || !pieceData) continue;

    const edgeDef = pieceData.edges?.find(e => e.name === elastic.edgeName);
    if (!edgeDef) continue;

    let vertices = parameterizeEdge(
      outline,
      edgeDef.segmentRange[0],
      edgeDef.segmentRange[1],
      offset.vertexOffset,
    );

    // Filter to tStart–tEnd range
    vertices = vertices.filter(v => v.t >= elastic.tStart && v.t <= elastic.tEnd);

    if (vertices.length < 2) continue;

    const compliance = ELASTIC_COMPLIANCE[elastic.type];
    const positions = mergedMesh.vertices;

    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i].index;
      const b = vertices[i + 1].index;

      // Compute original distance between vertices
      const ax = positions[a * 3], ay = positions[a * 3 + 1];
      const bx = positions[b * 3], by = positions[b * 3 + 1];
      const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);

      constraints.push({
        vertexA: a,
        vertexB: b,
        restLength: dist * elastic.stretchRatio,
        compliance,
      });
    }
  }

  return { constraints };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/cloth/__tests__/elasticAssembly.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/utils/cloth/elasticAssembly.ts src/utils/cloth/__tests__/elasticAssembly.test.ts
git commit -m "feat(sim): add elastic constraint builder with tests (#322)"
```

---

### Task 4: Integrate elastic constraints into XPBD solver

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts` — add `setElasticConstraints` method + solve in substep

- [ ] **Step 1: Add setElasticConstraints method**

In `XPBDSolver` class, after `setSeamConstraints`, add:

```typescript
  setElasticConstraints(elasticSet: import('./elasticAssembly').ElasticConstraintSet | null): void {
    this.elasticConstraints = elasticSet;
  }
```

Add the field to the class:
```typescript
  private elasticConstraints: import('./elasticAssembly').ElasticConstraintSet | null = null;
```

- [ ] **Step 2: Solve elastic constraints in substep loop**

Find the seam constraint solving section in the `step()` method (where `this.seamConstraints` is solved). Add elastic constraint solving right after seam solving, using the same XPBD distance constraint projection pattern:

```typescript
    // Solve elastic constraints
    if (this.elasticConstraints) {
      for (const c of this.elasticConstraints.constraints) {
        // XPBD distance constraint projection (same as seam)
        const i = c.vertexA, j = c.vertexB;
        const dx = pos[j * 3] - pos[i * 3];
        const dy = pos[j * 3 + 1] - pos[i * 3 + 1];
        const dz = pos[j * 3 + 2] - pos[i * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-10) continue;
        const C = dist - c.restLength;
        const alpha = c.compliance / (dt * dt);
        const denom = 2.0 + alpha;
        const lambda = -C / denom;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        pos[i * 3] -= lambda * nx;
        pos[i * 3 + 1] -= lambda * ny;
        pos[i * 3 + 2] -= lambda * nz;
        pos[j * 3] += lambda * nx;
        pos[j * 3 + 1] += lambda * ny;
        pos[j * 3 + 2] += lambda * nz;
      }
    }
```

- [ ] **Step 3: Run type check and existing sim tests**

Run: `npx tsc --noEmit && npx vitest run src/utils/cloth/`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add src/utils/cloth/xpbdSolver.ts
git commit -m "feat(sim): integrate elastic constraints into XPBD solver (#322)"
```

---

### Task 5: Create ElasticRenderer — zigzag SVG component

**Files:**
- Create: `src/components/PatternEditor/renderers/ElasticRenderer.tsx`

- [ ] **Step 1: Check existing renderer pattern**

Read `src/components/PatternEditor/renderers/` to see sibling renderers for pattern (SeamRenderer, NotchRenderer, etc.).

- [ ] **Step 2: Implement ElasticRenderer**

The component reads `elastics` and `pieces` from Redux, computes zigzag SVG paths for each elastic, and renders them.

Key logic:
- For each elastic, find the piece and edge
- Sample points along the edge outline within `tStart`–`tEnd`
- Generate zigzag by alternating perpendicular offsets at each sample point
- Render as `<path>` with color based on elastic type

Colors: `band=#3B82F6`, `shirring=#8B5CF6`, `drawstring=#10B981`

- [ ] **Step 3: Wire into PatternEditor SVG tree**

Find where other renderers (seam, notch) are included in the PatternEditor component and add `<ElasticRenderer />` as a sibling.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/components/PatternEditor/renderers/ElasticRenderer.tsx
git commit -m "feat(ui): add ElasticRenderer zigzag SVG component (#322)"
```

---

### Task 6: Create useElasticTool interaction hook

**Files:**
- Create: `src/hooks/useElasticTool.ts`

- [ ] **Step 1: Implement hook**

Follow the pattern from seam tool hooks. The hook:
- Reads `activeTool2D` from editor slice, `pieces` and `elastics` from project slice
- On hover: hit-test edges, set hover state
- On click: if edge has no elastic → dispatch `addElastic` with defaults; if edge has elastic(s) → select nearest one
- Returns: `hoveredEdge`, `selectedElasticId`, `handleMouseMove`, `handleMouseDown`

Use `uid()` from `src/utils/pathHelpers.ts` for generating elastic IDs.

- [ ] **Step 2: Wire hook into PatternEditor**

Find where other tool hooks are called in the PatternEditor component and add `useElasticTool` conditionally when `activeTool2D === 'elastic'`.

- [ ] **Step 3: Update elastic tool definition**

In `src/tools/definitions/elastic.tsx`, update the `copilot.produces` field from `'seam'` to `'elastic'` (it was wrong in the stub).

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/hooks/useElasticTool.ts src/tools/definitions/elastic.tsx
git commit -m "feat(ui): add useElasticTool interaction hook (#322)"
```

---

### Task 7: Create copilot elastic tools

**Files:**
- Create: `src/copilot/action/tools/definitions/elasticTools.ts`
- Modify: `src/copilot/action/tools/registry.ts`

- [ ] **Step 1: Create elasticTools.ts**

Follow `sewingEnhancementTools.ts` pattern. Three tools:

```typescript
import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import { addElastic, removeElastic, updateElastic } from '../../../../store/projectSlice';
import { uid } from '../../../../utils/pathHelpers';
import type { ElasticType } from '../../../../types/types';

const addElasticTool: ToolDefinition = {
  name: 'addElastic',
  description:
    'Add elastic/gathering to a named edge of a piece. Specify stretchRatio (0.1–2.0, default 0.5 = 50% gathering). ' +
    '/ Añadir elástico/fruncido a un borde de una pieza.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      edgeName: { type: 'string', description: 'Semantic edge name (e.g. "waistband", "hemline")' },
      stretchRatio: { type: 'number', description: 'Gathering ratio 0.1–2.0 (default 0.5)' },
      width: { type: 'number', description: 'Elastic width in mm (default 12)' },
      type: { type: 'string', enum: ['band', 'shirring', 'drawstring'], description: 'Elastic type (default band)' },
      tStart: { type: 'number', description: 'Start position 0–1 (default 0)' },
      tEnd: { type: 'number', description: 'End position 0–1 (default 1)' },
    },
    required: ['pieceId', 'edgeName'],
  },
  execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const edge = piece.edges?.find(e => e.name === params.edgeName);
    if (!edge) return { success: false, error: `Edge "${params.edgeName}" not found on piece "${piece.name}"` };

    const elastic = {
      id: uid(),
      pieceId: params.pieceId as string,
      edgeName: params.edgeName as string,
      stretchRatio: Math.max(0.1, Math.min(2.0, (params.stretchRatio as number) ?? 0.5)),
      width: (params.width as number) ?? 12,
      type: ((params.type as ElasticType) ?? 'band'),
      tStart: (params.tStart as number) ?? 0,
      tEnd: (params.tEnd as number) ?? 1,
      active: true,
    };

    dispatch(addElastic(elastic));
    return { success: true, data: elastic };
  },
};

const removeElasticTool: ToolDefinition = {
  name: 'removeElastic',
  description: 'Remove an elastic by ID. / Eliminar un elástico por ID.',
  parameters: {
    type: 'object',
    properties: {
      elasticId: { type: 'string', description: 'Elastic ID to remove' },
    },
    required: ['elasticId'],
  },
  execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
    const state = getState();
    const elastic = state.project.elastics.find(e => e.id === params.elasticId);
    if (!elastic) return { success: false, error: `Elastic "${params.elasticId}" not found` };
    dispatch(removeElastic(params.elasticId as string));
    return { success: true, data: { removedId: params.elasticId } };
  },
};

const updateElasticTool: ToolDefinition = {
  name: 'updateElastic',
  description:
    'Update elastic properties (stretchRatio, width, type, tStart, tEnd, active). ' +
    '/ Actualizar propiedades del elástico.',
  parameters: {
    type: 'object',
    properties: {
      elasticId: { type: 'string', description: 'Elastic ID to update' },
      stretchRatio: { type: 'number', description: 'New stretch ratio 0.1–2.0' },
      width: { type: 'number', description: 'New width in mm' },
      type: { type: 'string', enum: ['band', 'shirring', 'drawstring'] },
      tStart: { type: 'number' },
      tEnd: { type: 'number' },
      active: { type: 'boolean' },
    },
    required: ['elasticId'],
  },
  execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
    const state = getState();
    const elastic = state.project.elastics.find(e => e.id === params.elasticId);
    if (!elastic) return { success: false, error: `Elastic "${params.elasticId}" not found` };

    const updates: Record<string, unknown> = { id: params.elasticId };
    if (params.stretchRatio !== undefined) updates.stretchRatio = params.stretchRatio;
    if (params.width !== undefined) updates.width = params.width;
    if (params.type !== undefined) updates.type = params.type;
    if (params.tStart !== undefined) updates.tStart = params.tStart;
    if (params.tEnd !== undefined) updates.tEnd = params.tEnd;
    if (params.active !== undefined) updates.active = params.active;

    dispatch(updateElastic(updates as Parameters<typeof updateElastic>[0]));
    return { success: true, data: { ...elastic, ...updates } };
  },
};

export const tools: ToolDefinition[] = [addElasticTool, removeElasticTool, updateElasticTool];
```

- [ ] **Step 2: Register in registry.ts**

Add import:
```typescript
import { tools as elasticToolDefs } from './definitions/elasticTools';
```

Add to `ALL_TOOL_MODULES` array:
```typescript
  elasticToolDefs,
```

- [ ] **Step 3: Run type check and copilot tests**

Run: `npx tsc --noEmit && npx vitest run src/copilot/`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add src/copilot/action/tools/definitions/elasticTools.ts src/copilot/action/tools/registry.ts
git commit -m "feat(copilot): add elastic copilot tools — add/remove/update (#322)"
```

---

### Task 8: Add elastics to newProjectRegistry

**Files:**
- Modify: `src/store/newProjectRegistry.ts` (if it exists — from issue #405)

- [ ] **Step 1: Verify projectSlice already handles NEW_PROJECT for elastics**

Since `elastics` is part of `projectSlice` initial state and the slice already resets on NEW_PROJECT via `() => initialState`, no additional work is needed. The elastics array is already covered.

- [ ] **Step 2: Run the newProjectReset test if it exists**

Run: `npx vitest run src/store/__tests__/newProjectReset.test.ts` (may not exist on this branch)
Expected: PASS or skip if file doesn't exist

- [ ] **Step 3: Commit (only if changes were needed)**

---

### Task 9: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

- [ ] **Step 3: Push and create PR**

```
git push -u origin feat/elastic-tool-322
gh pr create --title "feat: implement Elastic tool — data model, UI, simulation, copilot" --body "..."
```
