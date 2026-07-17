# Forma interna (internal marking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the phantom `internalShape` (G) 2D tool so it draws an internal *marking* — an `InternalLine{type:'reference'}` polyline — on the selected piece, and export that polyline whole to DXF.

**Architecture:** Reuse `usePolyPenTool` (existing closable-polyline → internal-line interaction, with preview, close, curves, Escape) preset to `internalLine` / `'reference'`, wired to the `internalShape` tool. The only genuinely new logic is (1) a pure pattern→piece-local path conversion for the completion handler, and (2) full-polyline emission in the DXF exporter (today it drops everything past the first segment). Model, reducers, render, selection, and linked-mirror already exist.

**Tech Stack:** React + Redux Toolkit, TypeScript (strict), Vitest, SVG 2D editor.

**Design spec:** `docs/superpowers/specs/2026-07-17-internal-shape-marking-design.md`

## Global Constraints

- Commit gate (run before every commit): `npx tsc -b --noEmit && npm run test && npm run lint`. Use `tsc -b` (build mode), never bare `tsc --noEmit`. No `--no-verify`.
- IDs via `newId()` from `src/utils/ids.ts`.
- Internal lines are stored **piece-local** (PieceRenderer wraps them in `translate(piece.position…)`).
- A `'reference'` internal line exports on AAMA layer **DRAW (8)**.
- The pre-commit hook runs `tsc -b` + eslint `--max-warnings=0` on staged files.

---

### Task 1: Pattern→piece-local path conversion helper

The completion handler must shift polyPen's pattern-space path into the piece's local space. Extract this as a pure, tested function.

**Files:**
- Create: `src/components/PatternEditor/internalShapePath.ts`
- Test: `src/components/PatternEditor/__tests__/internalShapePath.test.ts`

**Interfaces:**
- Produces: `toPieceLocalPath(path: PathCommand[], origin: Point2D): PathCommand[]`

- [ ] **Step 1: Write the failing test**

Create `src/components/PatternEditor/__tests__/internalShapePath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toPieceLocalPath } from '../internalShapePath';
import type { PathCommand } from '../../../types/types';

describe('toPieceLocalPath', () => {
  it('subtracts the piece origin from M and L points', () => {
    const path: PathCommand[] = [
      { type: 'M', values: [110, 120] },
      { type: 'L', values: [150, 120] },
    ];
    expect(toPieceLocalPath(path, { x: 100, y: 100 })).toEqual([
      { type: 'M', values: [10, 20] },
      { type: 'L', values: [50, 20] },
    ]);
  });

  it('shifts all six control values of a cubic curve', () => {
    const path: PathCommand[] = [{ type: 'C', values: [110, 120, 130, 140, 150, 160] }];
    expect(toPieceLocalPath(path, { x: 100, y: 100 })).toEqual([
      { type: 'C', values: [10, 20, 30, 40, 50, 60] },
    ]);
  });

  it('leaves a Z command untouched and shifts the rest', () => {
    const path: PathCommand[] = [
      { type: 'M', values: [110, 120] },
      { type: 'L', values: [150, 120] },
      { type: 'L', values: [150, 160] },
      { type: 'Z', values: [] },
    ];
    const out = toPieceLocalPath(path, { x: 100, y: 100 });
    expect(out[3]).toEqual({ type: 'Z', values: [] });
    expect(out[0].values).toEqual([10, 20]);
    expect(out[2].values).toEqual([50, 60]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PatternEditor/__tests__/internalShapePath.test.ts`
Expected: FAIL — cannot resolve `../internalShapePath` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/components/PatternEditor/internalShapePath.ts`:

```ts
import type { PathCommand, Point2D } from '../../types/types';

/**
 * Shift a pattern-space path into a piece's local space by subtracting the
 * piece origin from every (x, y) pair. M/L/C/Q values are coordinate pairs
 * (even index = x, odd = y); Z has no values.
 *
 * Internal lines are stored piece-local (PieceRenderer wraps them in
 * translate(piece.position)), while polyPen produces pattern-space paths — this
 * bridges the two for the Forma interna tool (#529).
 */
export function toPieceLocalPath(path: PathCommand[], origin: Point2D): PathCommand[] {
  return path.map((cmd) => ({
    ...cmd,
    values: cmd.values.map((v, i) => (i % 2 === 0 ? v - origin.x : v - origin.y)),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PatternEditor/__tests__/internalShapePath.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternEditor/internalShapePath.ts src/components/PatternEditor/__tests__/internalShapePath.test.ts
git commit -m "feat(internal-shape): pattern->piece-local path conversion helper"
```

---

### Task 2: Full-polyline DXF export for `reference` internals

The internals emitter in `exportAAMA` writes only the first `M→L` segment via `lineToDXF`. Route `reference` lines through the existing `pathToEntities` helper so the whole polyline (multi-vertex, curved, closed) is emitted.

**Files:**
- Modify: `src/utils/dxf/exportAAMA.ts` (internals loop in `pieceEntities`, ~L293-314)
- Test: `src/utils/dxf/__tests__/exportAAMA.referenceLines.test.ts`

**Interfaces:**
- Consumes: `generateDXFAAMA(pieces)` (existing), `pathToEntities` (existing, private to exportAAMA)

- [ ] **Step 1: Write the failing test**

Create `src/utils/dxf/__tests__/exportAAMA.referenceLines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PatternPiece, PathCommand } from '../../../types/types';

function pieceWithReference(path: PathCommand[]): PatternPiece {
  return {
    id: 'p1',
    name: 'Ref',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    seamAllowance: 0,
    grainAngle: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    internals: [{ id: 'ref1', type: 'reference', path }],
    notches: [],
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as PatternPiece;
}

/** Closed flag (group 70) of the LWPOLYLINE whose vertices include xCoord. */
function closedFlagOfPolylineWith(dxf: string, xCoord: string): string | null {
  for (const block of dxf.split('LWPOLYLINE')) {
    if (block.includes(`\n${xCoord}\n`)) {
      const m = block.match(/70\n([01])/);
      return m ? m[1] : null;
    }
  }
  return null;
}

const OPEN: PathCommand[] = [
  { type: 'M', values: [200, 200] },
  { type: 'L', values: [240, 200] },
  { type: 'L', values: [240, 260] },
  { type: 'L', values: [215, 285] },
];

describe('generateDXFAAMA — reference internal lines (Forma interna)', () => {
  it('emits the full polyline, not just the first segment', () => {
    const dxf = generateDXFAAMA([pieceWithReference(OPEN)]);
    // Vertices 3 and 4 only appear if the whole path is emitted (y is negated in DXF).
    expect(dxf).toContain('240.0000');
    expect(dxf).toContain('-260.0000');
    expect(dxf).toContain('215.0000');
    expect(dxf).toContain('-285.0000');
  });

  it('emits a closed reference polyline as a closed LWPOLYLINE', () => {
    const closed: PathCommand[] = [...OPEN, { type: 'Z', values: [] }];
    const dxf = generateDXFAAMA([pieceWithReference(closed)]);
    expect(closedFlagOfPolylineWith(dxf, '215.0000')).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dxf/__tests__/exportAAMA.referenceLines.test.ts`
Expected: FAIL — the emitter writes only `M(200,200)→L(240,200)` as a single LINE, so `-260.0000` / `215.0000` / `-285.0000` are absent and no LWPOLYLINE contains `215.0000` (closed-flag helper returns `null`).

- [ ] **Step 3: Write minimal implementation**

In `src/utils/dxf/exportAAMA.ts`, inside `pieceEntities`, at the top of the `for (const line of piece.internals)` loop (before `let layer...`), add the reference branch:

```ts
  // Internal lines
  for (const line of piece.internals) {
    // Reference markings (Forma interna) are multi-vertex, possibly closed/curved
    // polylines — emit the whole path, not just the first M→L segment (#529).
    if (line.type === 'reference') {
      s += pathToEntities(line.path, AAMA_LAYERS.DRAW, opts);
      continue;
    }
    let layer: string = AAMA_LAYERS.DRAW;
    if (line.type === 'notch') layer = AAMA_LAYERS.NOTCH;
    else if (line.type === 'grainline') layer = AAMA_LAYERS.GRAINLINE;
    // ...existing single-segment emission unchanged below...
```

(Leave the rest of the loop — the `lineToDXF` single-segment emission and fold annotation — exactly as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/dxf/__tests__/exportAAMA.referenceLines.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the exportAAMA suite to check for regressions**

Run: `npx vitest run src/utils/dxf`
Expected: PASS (all dxf tests green — the branch only changes `reference` lines, and no fixture uses them yet).

- [ ] **Step 6: Commit**

```bash
git add src/utils/dxf/exportAAMA.ts src/utils/dxf/__tests__/exportAAMA.referenceLines.test.ts
git commit -m "fix(export): emit reference internal lines as full polylines, not first segment"
```

---

### Task 3: Wire the `internalShape` tool to a polyPen `reference` preset

Instantiate a second `usePolyPenTool` preset (internalLine / `'reference'`) with a piece-local completion handler, and route the `internalShape` tool through it.

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts` (ToolHooks interface, destructure, 5 tool branches, 1 reset effect, dep arrays)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (completion handler, tool instantiation, `tools` object, preview overlay)

**Interfaces:**
- Consumes: `toPieceLocalPath` (Task 1), `usePolyPenTool` (existing), `addInternalLine` (existing), `PolyPenToolOverlay` (existing).

- [ ] **Step 1: Add `internalShapeTool` to the `ToolHooks` interface**

In `useEditorInteractions.ts`, immediately after the `polyPenTool: { … };` block (~L199-205), add:

```ts
  internalShapeTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    handleDoubleClick: () => void;
    reset: () => void;
  };
```

- [ ] **Step 2: Destructure it**

In the `const { pen, …, polyPenTool, pleatTool, elasticTool } = tools;` line (~L236), add `internalShapeTool`:

```ts
  const { pen, rectTool, lineTool, seamTool, notchTool, seamAllowanceTool, trimTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern, scissorsTool, slashAndSpreadTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool, freeSewingTool, offsetTool, extendTrimTool, polyPenTool, internalShapeTool, pleatTool, elasticTool } = tools;
```

- [ ] **Step 3: Add the reset effect**

After the slash-and-spread reset effect (~L276-280), add:

```ts
  // Clear the in-progress internal shape when switching away
  useEffect(() => {
    if (activeTool !== 'internalShape') internalShapeTool.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, internalShapeTool.reset]);
```

- [ ] **Step 4: Wire the five tool branches (mirror polyPen)**

Add an `internalShape` branch next to each `polyPen` branch:

- keydown (~L312), after `if (activeTool === 'polyPen') handlers.push(polyPenTool.handleKeyDown);`:
```ts
    if (activeTool === 'internalShape') handlers.push(internalShapeTool.handleKeyDown);
```
- double-click (~L399-401), after the `polyPen` block:
```ts
    if (activeTool === 'internalShape') {
      internalShapeTool.handleDoubleClick();
    }
```
- mousedown (~L454), after `if (activeTool === 'polyPen') { polyPenTool.handleMouseDown(e); return; }`:
```ts
    if (activeTool === 'internalShape') { internalShapeTool.handleMouseDown(e); return; }
```
- mousemove (~L684), after `if (activeTool === 'polyPen') polyPenTool.handleMouseMove(e);`:
```ts
    if (activeTool === 'internalShape') internalShapeTool.handleMouseMove(e);
```
- mouseup (~L762), after `if (activeTool === 'polyPen' && e) polyPenTool.handleMouseUp(e);`:
```ts
    if (activeTool === 'internalShape' && e) internalShapeTool.handleMouseUp(e);
```

- [ ] **Step 5: Add `internalShapeTool` to the four dependency arrays**

Append `internalShapeTool` to the dependency arrays of the four callbacks that now reference it: the keydown/mousedown effect deps (~L410 and ~L573), the mousemove deps (~L687), and the mouseup deps (~L763). Example for ~L573:

```ts
  }, [activeTool, pan2D, zoom2D, pen, /* …existing… */ offsetTool, extendTrimTool, polyPenTool, internalShapeTool, pleatTool, elasticTool]);
```

- [ ] **Step 6: Add the completion handler and tool instantiation in PatternEditor**

In `PatternEditor.tsx`, ensure `PathCommand` and `toPieceLocalPath` are imported:

```ts
import { toPieceLocalPath } from './internalShapePath';
// add PathCommand to the existing `../../types/types` import if not already present
```

Immediately after the `polyPenTool` instantiation (~L268), add:

```ts
  const handleInternalShapeComplete = useCallback((path: PathCommand[]) => {
    // polyPen produces a pattern-space path; internals are stored piece-local.
    const target = pieces.find((p) => p.id === selectedPieceIds[0]) ?? pieces[pieces.length - 1];
    if (!target) return;
    dispatch(addInternalLine({
      pieceId: target.id,
      line: { id: newId(), type: 'reference', path: toPieceLocalPath(path, target.position) },
    }));
  }, [pieces, selectedPieceIds, dispatch]);

  const internalShapeTool = usePolyPenTool(zoom2D, pan2D, handlePieceComplete, handleInternalShapeComplete, 'internalLine', 'reference');
```

- [ ] **Step 7: Pass `internalShapeTool` into `useEditorInteractions`**

In the `tools` object passed to `useEditorInteractions` (~L482-484), add `internalShapeTool` (next to `polyPenTool`):

```ts
    useEditorInteractions(activeTool, zoom2D, pan2D, pieces, {
      pen, rectTool, lineTool, seamTool, notchTool, seamAllowanceTool, trimTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool, scissorsTool, slashAndSpreadTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool, freeSewingTool, offsetTool, extendTrimTool, polyPenTool, internalShapeTool, pleatTool, elasticTool,
    });
```

- [ ] **Step 8: Render the preview overlay**

After the `polyPen` overlay block (~L791-799), add:

```tsx
          {activeTool === 'internalShape' && (
            <PolyPenToolOverlay
              nodes={internalShapeTool.nodes}
              previewPoint={internalShapeTool.previewPoint}
              isDragging={internalShapeTool.isDragging}
              dragHandle={internalShapeTool.dragHandle}
              zoom2D={zoom2D}
            />
          )}
```

- [ ] **Step 9: Run the full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: PASS — typecheck clean (the new interface member and branches compile), all tests green, lint clean.

- [ ] **Step 10: Manual smoke (document the result in the commit)**

`npm run dev`, open the 2D editor: select a piece **not** at the origin, press **G** (or the Forma interna dock button), click 3-4 points, close by clicking near the first point. Confirm: (a) a dashed `reference` marking renders **at the click locations** (not offset by the piece position), (b) it survives a reload (persisted), (c) exporting DXF/AAMA includes the full polyline on the DRAW layer.

- [ ] **Step 11: Commit**

```bash
git add src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(internal-shape): wire the G tool to a polyPen reference preset with piece-local storage"
```

---

## Self-Review

**1. Spec coverage:**
- Concept (`reference` marking, not cut) → Task 3 completion handler stores `type:'reference'`. ✓
- Reuse model/reducers/render/select/linked-mirror → unchanged, consumed as-is. ✓
- Draw interaction (polyline, close, curves, Escape, preview) → Task 3 reuses `usePolyPenTool` + `PolyPenToolOverlay`. ✓
- Piece-local coordinate conversion → Task 1 (`toPieceLocalPath`) + Task 3 handler. ✓
- Full-polyline DXF export on DRAW → Task 2. ✓
- No-piece fallback to last piece → Task 3 handler (`?? pieces[pieces.length - 1]`). ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**3. Type consistency:** `toPieceLocalPath(path, origin)` defined in Task 1, consumed identically in Task 3. `internalShapeTool` interface (6 members incl. `reset`) matches `usePolyPenTool`'s return (`handleMouseDown/Move/Up/KeyDown/DoubleClick/reset` + `nodes/previewPoint/isDragging/dragHandle`). `handleInternalShapeComplete` signature `(path: PathCommand[]) => void` matches `usePolyPenTool`'s `onCompleteInternalLine` parameter. ✓

## Notes

- Wiring (Task 3) has no clean unit test (it modifies the large `useEditorInteractions` / `PatternEditor` glue, which the repo does not unit-test). It is covered by the typecheck/lint/test gate plus the Step 10 manual smoke. The two pieces of real logic (Tasks 1 and 2) are TDD'd.
- This closes the last phantom tool of #529 by building it; the other three phantom tools were removed in #952.
