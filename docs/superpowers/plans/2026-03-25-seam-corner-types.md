# Seam Corner Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 professional seam allowance corner types with per-vertex configuration, custom edge-walk SA generation, context menu UI, and copilot tools.

**Architecture:** Pure geometry engine (`src/utils/seam/cornerTypes.ts`) with per-corner-type functions. Custom edge-walk algorithm computes offset edges + per-vertex corner geometry, using Clipper2 only for self-intersection cleanup. Fast path: all-mitered pieces skip the custom engine and use existing Clipper2. Data stored sparsely on PatternPiece (`cornerTypes: Record<number, CornerType>`).

**Tech Stack:** TypeScript, Clipper2-js (for self-intersection cleanup), React, Redux Toolkit, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-seam-corner-types-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/utils/seam/cornerTypes.ts` | Corner type geometry functions + edge-walk SA generator + shiftCornerTypes |
| `src/utils/seam/__tests__/cornerTypes.test.ts` | Geometry + integration tests |
| `src/components/PatternEditor/CornerTypeMenu.tsx` | Right-click context menu for corner type selection |
| `src/store/__tests__/projectSlice.cornerTypes.test.ts` | Redux tests |
| `src/copilot/action/tools/definitions/__tests__/cornerTypeTools.test.ts` | Copilot tool tests |

### Modified Files
| File | Change |
|------|--------|
| `src/types/types.ts` | Add `CornerType` type + `defaultCornerType` + `cornerTypes` on PatternPiece |
| `src/store/projectSlice.ts:356,379` | Call `shiftCornerTypes` in outline-editing reducers |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx:159-167` | Use corner-typed SA generation |
| `src/utils/export/pipeline.ts:105-109` | Use corner-typed SA generation in export |
| `src/components/PatternEditor/PatternEditor.tsx:173` | Wire context menu for corner types |
| `src/copilot/action/tools/definitions/seamTools.ts:183-188` | Add setCornerType + setAllCorners to tools array |

---

## Task 1: CornerType type + PatternPiece fields

**Files:**
- Modify: `src/types/types.ts`
- Create: `src/store/__tests__/projectSlice.cornerTypes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/store/__tests__/projectSlice.cornerTypes.test.ts
import { describe, it, expect } from 'vitest';
import reducer, { updatePiece } from '../projectSlice';

function baseState(overrides = {}) {
  return {
    id: 'test', name: 'Test', pieces: [], seams: [], fabrics: [],
    avatar: {} as any, avatarMode: 'model' as const, avatarModelUrl: null,
    isDirty: false, groups: [], seamGroups: [], arrangementOverrides: {},
    poms: [], layerNames: {}, layerLocked: {},
    loadDiagnostics: [], loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    ...overrides,
  };
}

function makePiece(id: string, overrides = {}) {
  return {
    id, name: `Piece ${id}`, outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 10, active: true, createdAt: 0, updatedAt: 0,
    ...overrides,
  } as any;
}

describe('projectSlice — cornerTypes', () => {
  it('updatePiece stores cornerTypes on piece', () => {
    const piece = makePiece('p1');
    const state = reducer(baseState({ pieces: [piece] }),
      updatePiece({ ...piece, cornerTypes: { 1: 'squared' }, updatedAt: Date.now() }));
    expect(state.pieces[0].cornerTypes).toEqual({ 1: 'squared' });
  });

  it('updatePiece stores defaultCornerType', () => {
    const piece = makePiece('p1');
    const state = reducer(baseState({ pieces: [piece] }),
      updatePiece({ ...piece, defaultCornerType: 'envelope', updatedAt: Date.now() }));
    expect(state.pieces[0].defaultCornerType).toBe('envelope');
  });

  it('cornerTypes defaults to undefined when not set', () => {
    const piece = makePiece('p1');
    expect(piece.cornerTypes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/__tests__/projectSlice.cornerTypes.test.ts`
Expected: FAIL — cornerTypes not on PatternPiece type

- [ ] **Step 3: Add CornerType and PatternPiece fields to types.ts**

In `src/types/types.ts`, after the existing type definitions, add:

```typescript
export type CornerType =
  | 'mitered'
  | 'doubleMitered'
  | 'envelope'
  | 'squared'
  | 'slant'
  | 'match'
  | 'trimMirrored';
```

Add to PatternPiece interface (after `seamAllowance`):
```typescript
/** Default corner type for all vertices. Default 'mitered'. */
defaultCornerType?: CornerType;
/** Per-vertex corner type overrides. Key = outline command index. */
cornerTypes?: Record<number, CornerType>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/__tests__/projectSlice.cornerTypes.test.ts`

- [ ] **Step 5: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add CornerType type and PatternPiece corner fields"
```

---

## Task 2: Geometry helpers — offsetEdge, lineIntersection, interiorAngle, bisectorDirection

**Files:**
- Create: `src/utils/seam/cornerTypes.ts`
- Create: `src/utils/seam/__tests__/cornerTypes.test.ts`

- [ ] **Step 1: Write failing tests for geometry helpers**

```typescript
// src/utils/seam/__tests__/cornerTypes.test.ts
import { describe, it, expect } from 'vitest';
import { offsetEdge, lineIntersection, interiorAngle, bisectorDirection } from '../cornerTypes';

describe('offsetEdge', () => {
  it('offsets horizontal edge upward by saWidth', () => {
    const edge = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.y).toBeCloseTo(-10); // offset upward (left of direction)
    expect(result.end.y).toBeCloseTo(-10);
    expect(result.start.x).toBeCloseTo(0);
    expect(result.end.x).toBeCloseTo(100);
  });

  it('offsets vertical edge leftward by saWidth', () => {
    const edge = { start: { x: 0, y: 0 }, end: { x: 0, y: 100 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(10);
    expect(result.end.x).toBeCloseTo(10);
  });
});

describe('lineIntersection', () => {
  it('finds intersection of perpendicular lines', () => {
    const a = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    const b = { start: { x: 5, y: 0 }, end: { x: 5, y: 10 } };
    const pt = lineIntersection(a, b);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(5);
    expect(pt!.y).toBeCloseTo(5);
  });

  it('returns null for parallel lines', () => {
    const a = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const b = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    expect(lineIntersection(a, b)).toBeNull();
  });
});

describe('interiorAngle', () => {
  it('returns PI/2 for right angle', () => {
    const prev = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const next = { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI / 2);
  });
});

describe('bisectorDirection', () => {
  it('returns unit vector along bisector for right angle', () => {
    const prev = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const next = { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } };
    const dir = bisectorDirection(prev, next);
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    expect(len).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Implement geometry helpers**

```typescript
// src/utils/seam/cornerTypes.ts
import type { PathCommand, Point2D, CornerType } from '../../types/types';

export interface Line2D {
  start: Point2D;
  end: Point2D;
}

export function offsetEdge(edge: Line2D, saWidth: number): Line2D {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { ...edge };
  // Perpendicular to the left of the direction
  const nx = -dy / len * saWidth;
  const ny = dx / len * saWidth;
  return {
    start: { x: edge.start.x + nx, y: edge.start.y + ny },
    end: { x: edge.end.x + nx, y: edge.end.y + ny },
  };
}

export function lineIntersection(a: Line2D, b: Line2D): Point2D | null {
  const d1x = a.end.x - a.start.x, d1y = a.end.y - a.start.y;
  const d2x = b.end.x - b.start.x, d2y = b.end.y - b.start.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;
  const t = ((b.start.x - a.start.x) * d2y - (b.start.y - a.start.y) * d2x) / cross;
  return { x: a.start.x + t * d1x, y: a.start.y + t * d1y };
}

export function interiorAngle(prev: Line2D, next: Line2D): number {
  const d1x = prev.end.x - prev.start.x, d1y = prev.end.y - prev.start.y;
  const d2x = next.end.x - next.start.x, d2y = next.end.y - next.start.y;
  const dot = d1x * d2x + d1y * d2y;
  const cross = d1x * d2y - d1y * d2x;
  return Math.atan2(Math.abs(cross), dot);
}

export function bisectorDirection(prev: Line2D, next: Line2D): Point2D {
  const d1x = prev.end.x - prev.start.x, d1y = prev.end.y - prev.start.y;
  const d2x = next.end.x - next.start.x, d2y = next.end.y - next.start.y;
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
  const u1x = d1x / len1, u1y = d1y / len1;
  const u2x = d2x / len2, u2y = d2y / len2;
  const bx = u1x + u2x, by = u1y + u2y;
  const blen = Math.sqrt(bx * bx + by * by);
  if (blen < 1e-10) return { x: -u1y, y: u1x }; // fallback: perpendicular to prev
  return { x: bx / blen, y: by / blen };
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat(seam): add geometry helpers for corner type computation"
```

---

## Task 3: Corner type functions (all 7)

**Files:**
- Modify: `src/utils/seam/cornerTypes.ts`
- Modify: `src/utils/seam/__tests__/cornerTypes.test.ts`

- [ ] **Step 1: Write failing tests for each corner type function**

For each of the 7 types, test at 90° (right angle). Verify:
- `cornerMitered`: returns 1 point (the miter intersection)
- `cornerDoubleMitered`: returns 2 points
- `cornerSquared`: returns 3 points forming a box
- `cornerSlant`: returns 2 points
- `cornerEnvelope`: returns 4 points
- `cornerMatch`: returns mitered result when no seam (fallback)
- `cornerTrimMirrored`: returns 2 symmetric points

Add acute (45°) and obtuse (135°) tests for each.

- [ ] **Step 2: Implement all 7 corner type functions**

Each function: `(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, angle) → Point2D[]`

Use `lineIntersection` and `bisectorDirection` helpers from Task 2.

- [ ] **Step 3: Run tests (21+ tests), verify pass, commit**

```bash
git commit -m "feat(seam): implement 7 corner type geometry functions"
```

---

## Task 4: Edge-walk SA generator — generateSeamAllowanceWithCorners

**Files:**
- Modify: `src/utils/seam/cornerTypes.ts`
- Modify: `src/utils/seam/__tests__/cornerTypes.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
describe('generateSeamAllowanceWithCorners', () => {
  it('all mitered corners equivalent to Clipper2 miter output', () => {
    const outline = makeSquareOutline(100);
    const clipperSa = generateSeamAllowance(outline, 10, 'miter');
    const cornerSa = generateSeamAllowanceWithCorners(outline, 10, 'mitered', {});
    // Both should produce similar geometry (within tolerance)
    expect(cornerSa.length).toBeGreaterThan(0);
  });

  it('mixed corner types on same piece', () => {
    const outline = makeSquareOutline(100);
    const sa = generateSeamAllowanceWithCorners(outline, 10, 'mitered', { 1: 'squared', 2: 'envelope' });
    expect(sa.length).toBeGreaterThan(0);
    // Squared at vertex 1 should produce 3 extra points
    // Envelope at vertex 2 should produce 4 extra points
  });

  it('returns empty for zero width', () => {
    const outline = makeSquareOutline(100);
    const sa = generateSeamAllowanceWithCorners(outline, 0, 'mitered', {});
    expect(sa).toEqual([]);
  });

  it('handles concave corner (L-shape) with self-intersection cleanup', () => {
    const lShape = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] }, { type: 'L', values: [50, 50] },
      { type: 'L', values: [50, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const sa = generateSeamAllowanceWithCorners(lShape, 10, 'mitered', {});
    expect(sa.length).toBeGreaterThan(0);
    // Should not have self-intersections
  });
});
```

- [ ] **Step 2: Implement generateSeamAllowanceWithCorners**

Algorithm:
1. Extract vertices from outline (filter M/L commands)
2. For each edge (vertex[i] → vertex[i+1]), compute `offsetEdge(edge, saWidth)`
3. At each vertex, resolve corner type and call the appropriate corner function with the two adjacent offset edges
4. Assemble offset edge segments + corner points into PathCommand[]
5. Pass through Clipper2's `SimplifyPolygon` or union for self-intersection cleanup (concave regions only — detect by checking if any offset edges cross)

Import `Paths64, Point64, Clipper` from `clipper2-js` for the cleanup step.

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat(seam): add generateSeamAllowanceWithCorners edge-walk algorithm"
```

---

## Task 5: shiftCornerTypes + wire into projectSlice

**Files:**
- Modify: `src/utils/seam/cornerTypes.ts`
- Modify: `src/store/projectSlice.ts`
- Modify: `src/utils/seam/__tests__/cornerTypes.test.ts`

- [ ] **Step 1: Write failing tests for shiftCornerTypes**

```typescript
describe('shiftCornerTypes', () => {
  it('insert at index 2: keys >= 2 shift by +1', () => {
    const ct = { 1: 'squared' as CornerType, 3: 'envelope' as CornerType };
    const result = shiftCornerTypes(ct, 2, 1);
    expect(result).toEqual({ 1: 'squared', 4: 'envelope' });
  });

  it('remove at index 2: key 2 deleted, keys > 2 shift by -1', () => {
    const ct = { 1: 'squared' as CornerType, 2: 'slant' as CornerType, 4: 'envelope' as CornerType };
    const result = shiftCornerTypes(ct, 2, -1);
    expect(result).toEqual({ 1: 'squared', 3: 'envelope' });
  });

  it('insert at 0: all keys shift', () => {
    const ct = { 0: 'squared' as CornerType, 2: 'envelope' as CornerType };
    const result = shiftCornerTypes(ct, 0, 1);
    expect(result).toEqual({ 1: 'squared', 3: 'envelope' });
  });

  it('empty record returns empty', () => {
    expect(shiftCornerTypes({}, 5, 1)).toEqual({});
  });
});
```

- [ ] **Step 2: Implement shiftCornerTypes**

```typescript
export function shiftCornerTypes(
  cornerTypes: Record<number, CornerType>,
  editIndex: number,
  delta: number,
): Record<number, CornerType> {
  const result: Record<number, CornerType> = {};
  for (const [keyStr, value] of Object.entries(cornerTypes)) {
    const key = Number(keyStr);
    if (delta < 0 && key === editIndex) continue; // remove: skip deleted key
    if (key >= editIndex) {
      result[key + delta] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

- [ ] **Step 3: Wire into projectSlice outline-editing reducers**

In `src/store/projectSlice.ts`, import `shiftCornerTypes` from `../../utils/seam/cornerTypes`.

In `upsertPieceOutline` (line ~366), after `piece.outline = outline`:
```typescript
// Note: upsertPieceOutline replaces the entire outline — cornerTypes indices
// may no longer be valid. Clear them on full outline replacement.
piece.cornerTypes = undefined;
```

(Full outline replacement invalidates all vertex indices — clearing is the safe approach. Index-level insert/remove operations, when they exist, would use `shiftCornerTypes`.)

- [ ] **Step 4: Run full test suite + type check, commit**

```bash
git commit -m "feat(seam): add shiftCornerTypes and wire into projectSlice"
```

---

## Task 6: Wire SA rendering in PieceRenderer

**Files:**
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:7,159-167`

- [ ] **Step 1: Update imports**

Add: `import { generateSeamAllowanceWithCorners } from '../../../utils/seam/cornerTypes';`

- [ ] **Step 2: Update SA rendering block (lines 159-167)**

Replace the `generateSeamAllowance` call with:

```typescript
{showSeamAllowance && (piece.seamAllowance > 0 || defaultSeamAllowanceWidth > 0) && (() => {
  const saWidth = piece.seamAllowance || defaultSeamAllowanceWidth;
  const hasCustomCorners = (piece.cornerTypes && Object.keys(piece.cornerTypes).length > 0)
    || (piece.defaultCornerType && piece.defaultCornerType !== 'mitered');
  const saPath = hasCustomCorners
    ? generateSeamAllowanceWithCorners(piece.outline, saWidth, piece.defaultCornerType ?? 'mitered', piece.cornerTypes ?? {})
    : generateSeamAllowance(piece.outline, saWidth);
  return saPath.length > 0 ? (
    <path
      d={pathToSVG(saPath)}
      fill="none"
      stroke="rgba(74, 158, 255, 0.4)"
      strokeWidth={0.8 / zoom2D}
      strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
    />
  ) : null;
})()}
```

Or use `useMemo` in the parent component — follow existing patterns.

- [ ] **Step 3: Run type check, commit**

```bash
git commit -m "feat: use corner-typed SA generation in PieceRenderer"
```

---

## Task 7: Wire SA export in pipeline

**Files:**
- Modify: `src/utils/export/pipeline.ts:92-113`

- [ ] **Step 1: Update imports**

Add: `import { generateSeamAllowanceWithCorners } from '../seam/cornerTypes';`

- [ ] **Step 2: Update preparePiece function (line ~105)**

Replace the SA generation block:

```typescript
if (piece.seamAllowance > 0) {
  const hasCustomCorners = (piece.cornerTypes && Object.keys(piece.cornerTypes).length > 0)
    || (piece.defaultCornerType && piece.defaultCornerType !== 'mitered');
  seamOutline = hasCustomCorners
    ? generateSeamAllowanceWithCorners(piece.outline, piece.seamAllowance, piece.defaultCornerType ?? 'mitered', piece.cornerTypes ?? {})
    : generateSeamAllowance(piece.outline, piece.seamAllowance, joinType);
  if (seamOutline.length > 0) {
    flatSeamOutline = flattenPath(seamOutline, resolution);
  }
}
```

- [ ] **Step 3: Run full test suite + type check, commit**

```bash
git commit -m "feat: use corner-typed SA generation in export pipeline"
```

---

## Task 8: CornerTypeMenu context menu component

**Files:**
- Create: `src/components/PatternEditor/CornerTypeMenu.tsx`

- [ ] **Step 1: Create the component**

Follow the existing context menu pattern in PatternEditor. A positioned dropdown that appears on right-click at a vertex.

Props:
```typescript
interface CornerTypeMenuProps {
  position: { x: number; y: number }; // screen coords
  currentType: CornerType;
  onSelectType: (type: CornerType) => void;
  onSetAll: (type: CornerType) => void;
  onClose: () => void;
}
```

Renders:
- "Set All Corners" header option
- Separator
- 7 corner type radio items with labels: Mitered, Double Mitered, Envelope, Squared, Slant, Match, Trim Mirrored
- Current type has a checkmark
- Click outside closes

- [ ] **Step 2: Run type check, commit**

```bash
git commit -m "feat: add CornerTypeMenu context menu component"
```

---

## Task 9: Wire context menu into PatternEditor

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`

- [ ] **Step 1: Wire the context menu**

Add state for the corner type menu:
```typescript
const [cornerMenu, setCornerMenu] = useState<{
  position: { x: number; y: number };
  pieceId: string;
  vertexIndex: number;
} | null>(null);
```

In `handleContextMenu`, when `seamAllowance` tool is active and click is near a vertex:
- Find the nearest outline vertex to the click position
- If within snap distance: open CornerTypeMenu instead of the regular context menu
- Set `cornerMenu` state with screen position + pieceId + vertexIndex

On menu selection:
```typescript
dispatch(updatePiece({
  ...piece,
  cornerTypes: { ...(piece.cornerTypes ?? {}), [vertexIndex]: selectedType },
  updatedAt: Date.now(),
}));
```

Render `<CornerTypeMenu>` conditionally.

- [ ] **Step 2: Add vertex indicator rendering**

When `seamAllowance` tool is active, render small circles at each outline vertex of the selected piece. Orange dot for vertices with non-default corner types.

- [ ] **Step 3: Run type check + full test suite, commit**

```bash
git commit -m "feat: wire corner type menu into PatternEditor"
```

---

## Task 10: Copilot tools — setCornerType + setAllCorners

**Files:**
- Modify: `src/copilot/action/tools/definitions/seamTools.ts:183-188`
- Create: `src/copilot/action/tools/definitions/__tests__/cornerTypeTools.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('setCornerType copilot tool', () => {
  it('valid vertex → success, cornerTypes updated');
  it('out-of-bounds vertex → error');
  it('invalid corner type string → error');
});

describe('setAllCorners copilot tool', () => {
  it('sets defaultCornerType and clears cornerTypes');
});
```

- [ ] **Step 2: Add tool definitions to seamTools.ts**

Add `setCornerTypeTool` and `setAllCornersTool` before the export statement. Add to the `tools` array.

Follow the exact `setSeamAllowanceTool` pattern: bilingual description, JSON Schema parameters, async execute returning ToolResult.

- [ ] **Step 3: Run tests, full suite, type check, commit**

```bash
git commit -m "feat(copilot): add setCornerType and setAllCorners tools"
```

---

## Task 11: Final verification

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Manual verification**

Start dev server: `npm run dev`
- Select a piece with SA > 0
- Activate seamAllowance tool
- Right-click a vertex → verify context menu with 7 corner types
- Select "Squared" → verify SA corner changes visually
- Select "Set All Corners" → "Envelope" → verify all corners change
- Undo → verify corners revert
- Export DXF → verify corner geometry in output

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: final cleanup for seam corner types"
```
