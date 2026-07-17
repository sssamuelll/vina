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

### 1. A polyline draw interaction — `internalShapeTool` hook

A new tool hook, mirroring the existing per-tool hooks (`grainlineTool`, `lineTool`,
`notchTool`): it owns the in-progress polyline state and produces a `'reference'`
internal line.

Interaction (closable polyline, pen-style):

- **Click** places a vertex (canvas point → piece-local coords, as the grainline /
  notch tools already convert).
- **Double-click** or **Enter** finishes as an **open** polyline.
- **Click near the first vertex** (within a small pixel threshold) finishes as a
  **closed** polyline (path ends with `Z`) — the single close mechanism.
- **Escape** cancels the in-progress polyline (no dispatch).
- On finish, dispatch `addInternalLine({ pieceId: <selected>, line: { id: newId(),
  type: 'reference', path } })`. `path` is `M` + `L…` (+ `Z` if closed).
- Straight segments only (no curves) for this version.

Wiring in `useEditorInteractions`:

- `handleMouseDown` chain (~L436-478): add `if (activeTool === 'internalShape') {
  internalShapeTool.handleMouseDown(e); return; }`.
- `handleKeyDown` chain (~L297-313): add the tool's `handleKeyDown` (Enter/Escape/close).
- A reset effect (mirroring the `walkSeam` / `measure` reset effects, ~L266-280) clears
  the in-progress polyline when the active tool changes away from `internalShape`.
- An in-progress **preview** overlay renders the polyline being drawn (reuse the
  pen tool's preview approach).

**Guard:** the tool requires a selected piece (`requiresSelection: 'piece'`). With no
piece selected, clicking is a no-op that surfaces a hint (toast) rather than silently
doing nothing — never reintroduce a phantom.

**Approach chosen:** a dedicated hook, not an extension of the pen tool. The pen
produces a new *piece*; overloading it to emit an internal line on the *selected*
piece would couple two unrelated outputs. A dedicated hook matches the codebase's
one-hook-per-tool pattern and keeps pen uncoupled.

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
- **Curves:** none — straight segments only.
- **Selection / delete:** reuse the existing `selectedInternalLine` +
  `handleInternalLineKeyDown` path; no new code.

## Testing

- **Draw hook (TDD):** the in-progress polyline accumulates vertices on click; finishes
  open on Enter/double-click; finishes closed (`Z`) when the last click lands near the
  first vertex; Escape cancels with no dispatch; finish dispatches `addInternalLine`
  with `type: 'reference'` and the built path. Test the hook's pure state logic (the
  repo's convention for interaction logic — extract and unit-test, as with
  `pointerDragSession` / `anchorClick`).
- **Export:** a `reference` polyline of N vertices exports as a full N-vertex polyline
  on the DRAW layer, and a closed polyline exports closed. Extends the existing
  `exportAAMA` tests.
- Full gate green: `tsc -b` + `eslint --max-warnings=0` + full suite.

## Out of scope (follow-ups)

- Cutout/hole geometry (the fabric-removal reading) — not what this is.
- A dedicated internal-marking DXF layer distinct from DRAW.
- Rescaling markings under per-point grading.
- Curved marking segments.
- `removeInternalLine` linked-mirror cascade (a pre-existing gap, #619-adjacent).
