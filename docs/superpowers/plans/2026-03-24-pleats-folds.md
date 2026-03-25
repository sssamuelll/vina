# Pleats & Folds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement pleat creation tools (knife, box, accordion, inverted box) and fold/crease lines with mountain/valley metadata, including UI interaction, 2D rendering, and copilot tool registration.

**Architecture:** New `Pleat` entity generates stored `InternalLine[]` entries with `foldOptions` metadata. `generatePleatFoldLines()` is a pure function computing fold line positions from pleat parameters. Edge-based UI tool follows the elastic tool pattern. Three copilot tools (create/remove/update pleat) plus upgraded fold line tool.

**Tech Stack:** React, Redux Toolkit, SVG, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-pleats-folds-design.md`

---

### Task 1: Add Pleat, PleatType, FoldOptions types

**Files:**
- Modify: `src/types/types.ts`

- [ ] **Step 1: Add types after InternalLine interface (~line 141)**

```typescript
// ─── Fold Options ───

export interface FoldOptions {
  direction: 'mountain' | 'valley';
  creaseAngleDeg: number;     // 180 = flat fold (default)
  pleatId?: string;           // back-reference to owning pleat (undefined for manual folds)
}

// ─── Pleats ───

export type PleatType = 'knife' | 'box' | 'accordion' | 'invertedBox';

export interface Pleat {
  id: string;
  pieceId: string;
  edgeName: string;
  type: PleatType;
  depth: number;              // mm
  spacing: number;            // mm between pleat centers
  count: number;              // 1–50
  direction: 'left' | 'right';
  tStart: number;             // 0–1
  tEnd: number;               // 0–1
  generatedLineIds: string[];
}

export const PLEAT_DEFAULTS: Omit<Pleat, 'id' | 'pieceId' | 'edgeName' | 'generatedLineIds'> = {
  type: 'accordion',
  depth: 15,
  spacing: 20,
  count: 4,
  direction: 'left',
  tStart: 0,
  tEnd: 1,
};

export const MAX_PLEAT_COUNT = 50;
```

Add `foldOptions?: FoldOptions;` to the `InternalLine` interface (after `topstitchOptions`).

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
git add src/types/types.ts
git commit -m "feat(types): add Pleat, PleatType, FoldOptions interfaces (#260)"
```

---

### Task 2: Create pleatGeometry — fold line generation

**Files:**
- Create: `src/utils/pleatGeometry.ts`
- Create: `src/utils/__tests__/pleatGeometry.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { generatePleatFoldLines } from '../pleatGeometry';
import type { Pleat, PatternPiece } from '../../types/types';

// Square piece with a 'hemline' edge at the bottom (segment 2: (100,100)→(0,100))
const piece: PatternPiece = {
  id: 'p1', name: 'Test', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, internals: [],
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  edges: [{ id: 'e1', name: 'hemline', segmentRange: [2, 3], edgeType: 'hem' }],
};

const basePleat: Omit<Pleat, 'generatedLineIds'> = {
  id: 'pl1', pieceId: 'p1', edgeName: 'hemline', type: 'knife',
  depth: 15, spacing: 20, count: 3, direction: 'left', tStart: 0, tEnd: 1,
};

describe('generatePleatFoldLines', () => {
  it('knife pleat generates count lines, all mountain', () => {
    const lines = generatePleatFoldLines({ ...basePleat, generatedLineIds: [] }, piece);
    expect(lines).toHaveLength(3);
    lines.forEach(l => {
      expect(l.type).toBe('fold');
      expect(l.foldOptions?.direction).toBe('mountain');
      expect(l.foldOptions?.pleatId).toBe('pl1');
    });
  });

  it('box pleat generates count * 2 lines, all mountain', () => {
    const lines = generatePleatFoldLines({ ...basePleat, type: 'box', generatedLineIds: [] }, piece);
    expect(lines).toHaveLength(6); // 3 * 2
    lines.forEach(l => expect(l.foldOptions?.direction).toBe('mountain'));
  });

  it('accordion pleat generates count * 2 lines, alternating mountain/valley', () => {
    const lines = generatePleatFoldLines({ ...basePleat, type: 'accordion', generatedLineIds: [] }, piece);
    expect(lines).toHaveLength(6);
    const dirs = lines.map(l => l.foldOptions?.direction);
    expect(dirs[0]).toBe('mountain');
    expect(dirs[1]).toBe('valley');
  });

  it('inverted box generates count * 2 lines, all valley', () => {
    const lines = generatePleatFoldLines({ ...basePleat, type: 'invertedBox', generatedLineIds: [] }, piece);
    expect(lines).toHaveLength(6);
    lines.forEach(l => expect(l.foldOptions?.direction).toBe('valley'));
  });

  it('count = 0 returns empty', () => {
    const lines = generatePleatFoldLines({ ...basePleat, count: 0, generatedLineIds: [] }, piece);
    expect(lines).toEqual([]);
  });

  it('nonexistent edge returns empty', () => {
    const lines = generatePleatFoldLines({ ...basePleat, edgeName: 'nope', generatedLineIds: [] }, piece);
    expect(lines).toEqual([]);
  });

  it('count clamped to MAX_PLEAT_COUNT', () => {
    const lines = generatePleatFoldLines({ ...basePleat, count: 100, generatedLineIds: [] }, piece);
    expect(lines.length).toBeLessThanOrEqual(50); // MAX_PLEAT_COUNT
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/pleatGeometry.test.ts`

- [ ] **Step 3: Implement pleatGeometry.ts**

The module exports `generatePleatFoldLines(pleat, piece): InternalLine[]`.

Algorithm:
1. Find the SemanticEdge by `edgeName` on `piece.edges`.
2. Flatten the edge segment into points, compute total arc length.
3. Clamp count to MAX_PLEAT_COUNT.
4. Compute fold line positions along the edge within tStart–tEnd, evenly spaced.
5. At each position, compute edge tangent and perpendicular direction.
6. Create InternalLine with `type: 'fold'`, path = line perpendicular to edge with length = depth (clamped to piece bbox height), and `foldOptions` with direction based on pleat type.
7. Use `uid()` from pathHelpers for line IDs. Set `foldOptions.pleatId = pleat.id`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/__tests__/pleatGeometry.test.ts`

- [ ] **Step 5: Commit**

```
git add src/utils/pleatGeometry.ts src/utils/__tests__/pleatGeometry.test.ts
git commit -m "feat(geometry): add pleat fold line generation with tests (#260)"
```

---

### Task 3: Add pleats to projectSlice Redux state

**Files:**
- Modify: `src/store/projectSlice.ts`

- [ ] **Step 1: Add Pleat import and state**

Add `Pleat, FoldOptions, MAX_PLEAT_COUNT` to imports from `'../types/types'`.
Add `pleats: Pleat[]` to `ProjectState` interface (after `elastics` or `seams`).
Add `pleats: []` to `initialState`.

- [ ] **Step 2: Add reducers**

```typescript
// ─── Pleats ───
addPleat(state, action: PayloadAction<Omit<Pleat, 'generatedLineIds'>>) {
  const piece = state.pieces.find(p => p.id === action.payload.pieceId);
  if (!piece) return;
  const edge = piece.edges?.find(e => e.name === action.payload.edgeName);
  if (!edge) return;
  const pleat = { ...action.payload, count: Math.min(action.payload.count, MAX_PLEAT_COUNT), generatedLineIds: [] as string[] };
  const lines = generatePleatFoldLines(pleat, piece);
  lines.forEach(l => piece.internals.push(l));
  pleat.generatedLineIds = lines.map(l => l.id);
  state.pleats.push(pleat);
  state.isDirty = true;
},
removePleat(state, action: PayloadAction<string>) {
  const pleat = state.pleats.find(p => p.id === action.payload);
  if (!pleat) return;
  const piece = state.pieces.find(p => p.id === pleat.pieceId);
  if (piece) {
    // Remove by pleatId scan (authoritative), not generatedLineIds
    piece.internals = piece.internals.filter(l => l.foldOptions?.pleatId !== pleat.id);
  }
  state.pleats = state.pleats.filter(p => p.id !== action.payload);
  state.isDirty = true;
},
updatePleat(state, action: PayloadAction<Partial<Pleat> & { id: string }>) {
  const idx = state.pleats.findIndex(p => p.id === action.payload.id);
  if (idx === -1) return;
  const pleat = state.pleats[idx];
  const piece = state.pieces.find(p => p.id === pleat.pieceId);
  if (!piece) return;
  // Remove old lines by pleatId scan (handles manual deletions)
  piece.internals = piece.internals.filter(l => l.foldOptions?.pleatId !== pleat.id);
  // Merge updates
  const updated = { ...pleat, ...action.payload, count: Math.min((action.payload.count ?? pleat.count), MAX_PLEAT_COUNT) };
  // Recompute fold lines
  const lines = generatePleatFoldLines(updated, piece);
  lines.forEach(l => piece.internals.push(l));
  updated.generatedLineIds = lines.map(l => l.id);
  state.pleats[idx] = updated;
  state.isDirty = true;
},
```

Import `generatePleatFoldLines` from `'../utils/pleatGeometry'`.

- [ ] **Step 3: Add removePiece cascade**

In `removePiece` reducer, add: `state.pleats = state.pleats.filter(p => p.pieceId !== action.payload);`

- [ ] **Step 4: Export new actions**

Add `addPleat, removePleat, updatePleat` to exports.

- [ ] **Step 5: Run type check and store tests**

Run: `npx tsc --noEmit && npx vitest run src/store/__tests__/`

- [ ] **Step 6: Commit**

```
git add src/store/projectSlice.ts
git commit -m "feat(store): add pleats state, reducers, and removePiece cascade (#260)"
```

---

### Task 4: Enhance fold line rendering with mountain/valley markers

**Files:**
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx`

- [ ] **Step 1: Add direction markers to fold line rendering**

Find the fold line rendering branch (~line 206). After the existing `<path>` element for fold lines, add conditional SVG markers:

- If `line.foldOptions?.direction === 'mountain'`: render small upward triangles (▲) along the line at zoom-aware intervals (~20 screen pixels). Color: purple (#9c27b0).
- If `line.foldOptions?.direction === 'valley'`: render small downward triangles (▼). Color: blue (#3F51B5).
- If no `foldOptions`: render the existing purple dashed line unchanged.

The markers are small SVG polygons positioned along the line path. Compute marker positions by sampling the fold line path at intervals of `20 / zoom2D` pattern units.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
git add src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "feat(ui): add mountain/valley direction markers on fold lines (#260)"
```

---

### Task 5: Create usePleatTool interaction hook

**Files:**
- Create: `src/hooks/usePleatTool.ts`

- [ ] **Step 1: Implement hook**

Edge-based, following the elastic tool pattern:
- Only active when `activeTool === 'pleat'`
- Read `pieces` and `pleats` from Redux
- On hover: hit-test edges, highlight
- On click: if edge has no pleat → dispatch `addPleat` with PLEAT_DEFAULTS; if edge has pleat → select it for editing
- Returns: `hoveredEdge`, `selectedPleatId`, `handleMouseMove`, `handleMouseDown`

- [ ] **Step 2: Wire into PatternEditor**

Import `usePleatTool` in PatternEditor.tsx, instantiate it, pass to useEditorInteractions. Add the `'pleat'` case for cursor and event routing in useEditorInteractions.ts.

- [ ] **Step 3: Add pleat tool definition**

Create or find the tool definition file. If no stub exists, create `src/tools/definitions/pleat.tsx` with icon (zigzag lines), copilot metadata, group: 'construction'. Register in `src/tools/index.ts`.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```
git add src/hooks/usePleatTool.ts src/tools/definitions/pleat.tsx src/tools/index.ts
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat(ui): add usePleatTool interaction hook + tool definition (#260)"
```

---

### Task 6: Create copilot pleat tools + upgrade addFoldLine

**Files:**
- Create: `src/copilot/action/tools/definitions/pleatTools.ts`
- Modify: `src/copilot/action/tools/definitions/internalTools.ts`
- Modify: `src/copilot/action/tools/registry.ts`

- [ ] **Step 1: Create pleatTools.ts**

Three tools following `sewingEnhancementTools.ts` pattern:

**createPleat:** Parameters: `pieceId` (required), `edgeName` (required), `type` (required), `depth`, `spacing`, `count`, `direction`, `tStart`, `tEnd`. Validates piece+edge, dispatches `addPleat`.

**removePleat:** Parameters: `pleatId` (required). Validates pleat exists, dispatches `removePleat`.

**updatePleat:** Parameters: `pleatId` (required) + optional fields. Validates pleat exists, dispatches `updatePleat`.

Export as `export const tools: ToolDefinition[]`.

- [ ] **Step 2: Upgrade addFoldLine in internalTools.ts**

Add optional parameters: `direction` (`'mountain' | 'valley'`, default `'mountain'`), `creaseAngleDeg` (number, default 180). Populate `foldOptions` on the created InternalLine.

- [ ] **Step 3: Register in registry.ts**

Add import: `import { tools as pleatToolDefs } from './definitions/pleatTools';`
Add to `ALL_TOOL_MODULES`: `pleatToolDefs,`

- [ ] **Step 4: Run type check and copilot tests**

Run: `npx tsc --noEmit && npx vitest run src/copilot/__tests__/compoundTools.test.ts src/copilot/__tests__/toolsE2E.test.ts`
Update tool counts if needed.

- [ ] **Step 5: Commit**

```
git add src/copilot/action/tools/definitions/pleatTools.ts src/copilot/action/tools/definitions/internalTools.ts src/copilot/action/tools/registry.ts
git commit -m "feat(copilot): add pleat tools + upgrade addFoldLine with direction (#260)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`

- [ ] **Step 3: Push and create PR**

```
git push -u origin feat/pleats-folds-260
gh pr create --title "feat: Pleats & Folds — knife/box/accordion/inverted box + fold direction (#260)"
```
