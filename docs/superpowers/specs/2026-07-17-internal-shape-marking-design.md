# Forma interna (internal shape) — internal marking tool

> Design spec · 2026-07-17 · closes the last phantom 2D tool of #529 by building it.

## Problem

The 2D tool `internalShape` ("Forma interna", key **G**) is listed and activatable
but has no canvas handler — pressing G activates the tool state and clicking the
canvas does nothing (a phantom tool, #529). It is the one phantom tool María asked
to keep, because she needs it.

The tool's own copilot metadata described it as a "cutout/hole that becomes a hole
in the pattern piece." That is **not** what is being built. Confirmed with the
product owner: a Forma interna is an **internal marking** — a guide the patternmaker
draws and prints (pocket placement, an internal reference outline) that is **not cut**;
the fabric stays whole.

## Concept

A Forma interna is stored as an existing internal-line variant:

```ts
InternalLine { id, type: 'reference', path: PathCommand[] }   // types.ts:294, :221
```

`'reference'` is the storage-only "drawn, not cut" internal type. The marking lives
in the selected piece's `internals[]`, in piece-local coordinates, and moves with the
piece like every other internal.

## What already exists (reused, not rebuilt)

Grounding the scope — the marking's data, storage, render, selection, and mirroring
are already in place:

- **Model** — `InternalLine` + `InternalLineType` includes `'reference'` (types.ts:221, :294).
- **Reducers** — `addInternalLine` / `updateInternalLine` / `removeInternalLine`
  (`{ pieceId, line }`) already exist (projectSlice.ts:490, :497, :518).
- **Linked mirror** — `project/addInternalLine` / `updateInternalLine` are in
  `linkedEditingMiddleware` SYNCED_ACTIONS, so the marking is mirrored onto a
  symmetric/linked partner piece automatically (removeInternalLine has no cascade
  handler — a known, pre-existing gap, out of scope here).
- **2D render** — `internalLineColor` already styles `'reference'`
  (`var(--ink-on-light-3)`, internalLineStyle.ts:17-19); PieceRenderer draws internals
  by their `path`.
- **Select + delete** — `selectedInternalLine` state and `handleInternalLineKeyDown`
  already handle selecting and deleting an internal line under the `select` tool.

## What is new (the actual work)

Two changes.

### 1. Wire the `internalShape` (G) tool to a polyPen `reference` preset

The polyline-to-internal-line interaction already exists: `usePolyPenTool`
(usePolyPenTool.ts) in `'internalLine'` mode accumulates nodes on click, closes by
clicking near the first vertex (≥3 nodes → path ends with `Z`), finishes on
double-click, cancels on Escape, supports click-drag curves, renders a live preview
(`PolyPenToolOverlay`), and calls `onCompleteInternalLine(path, lineType)`. In
PatternEditor that callback (`handlePolyPenCompleteInternalLine`, PatternEditor.tsx:256)
dispatches `addInternalLine({ pieceId, line: { id: newId(), type: lineType, path } })`.

So the Forma interna does **not** need a new hook. It needs a second `usePolyPenTool`
instance preset to internal-line / `'reference'`, wired to the `internalShape` tool with
its own completion handler:

```ts
// PatternEditor.tsx — next to the existing polyPenTool instantiation (:268)
const internalShapeTool = usePolyPenTool(
  zoom2D, pan2D,
  handlePieceComplete,          // unused in internalLine mode
  handleInternalShapeComplete,  // NEW: converts to piece-local, stores type:'reference'
  'internalLine',
  'reference',
);
```

**Coordinate space — the one correctness subtlety.** polyPen produces its path in
*pattern* space, but internal lines are stored *piece-local* (PieceRenderer wraps
internals in `translate(piece.position…)`, PieceRenderer.tsx:136; grainline/notch
subtract `piece.position` when storing). The existing
`handlePolyPenCompleteInternalLine` stores the path as-is — a latent misplacement bug in
polyPen's own internalLine mode for pieces not at the origin (out of scope to fix here).
`internalShape` must therefore use a **new** completion handler that shifts the path into
the target piece's local space before dispatch (subtract `position`, matching
grainline; rotation is not handled, same limitation as the existing internal-draw
tools):

```ts
const handleInternalShapeComplete = useCallback((path: PathCommand[]) => {
  const target = pieces.find((p) => p.id === selectedPieceIds[0]) ?? pieces[pieces.length - 1];
  if (!target) return;
  const local = path.map((cmd) => ({
    ...cmd,
    values: cmd.values.map((v, i) => (i % 2 === 0 ? v - target.position.x : v - target.position.y)),
  }));
  dispatch(addInternalLine({ pieceId: target.id, line: { id: newId(), type: 'reference', path: local } }));
}, [pieces, selectedPieceIds, dispatch]);
```

Wiring:

- Add `internalShapeTool` to the `ToolHooks` interface and to the `tools` object passed
  to `useEditorInteractions` (PatternEditor.tsx:482), and destructure it (:236).
- `useEditorInteractions` — mirror the existing `polyPen` branches for `internalShape`:
  `handleMouseDown` (~L454), `handleMouseMove`, `handleMouseUp`, `handleDoubleClick`, and
  `handleKeyDown` (~L297-313, Escape). polyPen uses mouse down/move/up (curve drag) +
  double-click, so all of those route through.
- A reset effect (mirroring the `walkSeam` / `measure` reset effects, ~L266-280) calls
  `internalShapeTool.reset()` when the active tool changes away from `internalShape`.
- Render the preview overlay when `activeTool === 'internalShape'` (reuse
  `PolyPenToolOverlay`, as the `polyPen` branch does at PatternEditor.tsx:791).

**Curve support** comes for free from polyPen (click = straight vertex, click-drag =
curve). This is a superset of the straight-only MVP and is kept.

**No-piece behavior:** matches polyPen — the existing dispatcher falls back to the last
piece when nothing is selected (`selectedPieceIds[0] ?? pieces[last]`). Consistent with
the tool we reuse; not a strict "requires selection" guard.

**Approach chosen:** reuse `usePolyPenTool`, not a new hook. The closable-polyline →
internal-line machinery (state, close, curves, preview, `Z`, dispatch) already exists
and is tested; a parallel hook would duplicate it. The `internalShape` tool becomes a
thin preset (mode + type) over polyPen.

### 2. Full-polyline DXF export

`exportAAMA`'s internal-line emitter currently writes only the **first** `M→L`
segment of an internal line via `lineToDXF` (exportAAMA.ts ~L297-302) — fine for the
2-point darts / grainlines it was written for, but a multi-vertex `reference` polyline
would export **truncated**. Route `'reference'` internals through the existing
`pathToEntities` / `lwpolylineToDXF` helpers (already used for outlines) so the whole
polyline — including the `Z` close — is emitted.

**DXF layer:** `reference` → **DRAW (8)**, the existing routing. It is a drawn,
non-cut internal line, which is what layer 8 represents. A dedicated marking layer is
a follow-up only if María asks for one.

## Decisions and defaults

- **DXF layer:** DRAW (8) — existing behavior, kept.
- **Grading:** the marking is piece-local and moves with the piece transform. Under
  per-point grading, internals are frozen (outline-only grading), so the marking does
  not rescale. Acceptable for this version; rescaling markings under grading is out of
  scope.
- **Curves:** supported via polyPen (click-drag), for free. Straight vertices by
  clicking.
- **No-piece selected:** falls back to the last piece (polyPen's existing behavior),
  not a strict guard.
- **Selection / delete:** reuse the existing `selectedInternalLine` +
  `handleInternalLineKeyDown` path; no new code.

## Testing

Two pieces of genuinely new logic, each TDD'd as a pure function:

- **Piece-local conversion (TDD):** `toPieceLocalPath(path, position)` subtracts the
  piece origin from every `(x, y)` pair across `M` / `L` / `C` / `Q` and leaves `Z`
  untouched. Tests: a point at pattern (position + local) maps back to local; a closed
  `M L L L Z` keeps its `Z`; a curve's six control values all shift.
- **Export (TDD):** a `reference` polyline of N vertices exports as a full N-vertex
  polyline on the DRAW layer; a closed polyline exports closed (`Z`). Before the fix the
  emitter drops everything past the first segment. Extends the `exportAAMA` tests.
- **Wiring:** reuses `usePolyPenTool` (existing, exercised interaction logic), so no new
  hook to test. Verified by the gate (typecheck compiles the new branches) plus a manual
  smoke: select `internalShape` (G), click vertices on a piece not at the origin, close by
  clicking the first vertex, confirm the `reference` line renders at the click location
  (not offset) and survives export.
- Full gate green: `tsc -b` + `eslint --max-warnings=0` + full suite.

## Out of scope (follow-ups)

- Cutout/hole geometry (the fabric-removal reading) — not what this is.
- A dedicated internal-marking DXF layer distinct from DRAW.
- Rescaling markings under per-point grading; rotation of the drawn path for a rotated
  piece (same limitation as grainline/notch today).
- A strict "requires selected piece" guard (polyPen's last-piece fallback is kept).
- Fixing polyPen's own internalLine mode (stores pattern-space paths → misplaced off
  origin); `internalShape` sidesteps it with its own converting handler.
- `removeInternalLine` linked-mirror cascade (a pre-existing gap, #619-adjacent).
