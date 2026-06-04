# Display Toggles Re-surface — Design

**Date:** 2026-06-04
**Branch:** `feat/canvas-2d-redesign`
**Status:** Approved (placement ratified by roster: Iris Tane + Voronov, unanimous)

## Problem

After the UI rework, `DisplayBar2D` and `DisplayBar3D` are unmounted. Their store
actions still work (agent-reachable via copilot `renderTools`), but the user has no
mounted UI for:

| Toggle | Wired to | Side |
|---|---|---|
| Reference Images (on/off) | `ReferenceImageLayer` | 2D |
| Render mode 2D (textured/translucent/wireframe) | `PieceRenderer` fill logic | 2D |
| Garment / Seamlines / Internal Lines (3 × on/off) | Viewport3D / GarmentSimulation | 3D |
| Surface mode 3D (9 modes) | PieceMesh / ClothMesh | 3D |

Additionally **Line Lengths** (`editor.showLineLengths`) is a dead toggle: it exists in
Redux but no renderer consumes it. This design revives it (new rendering) and
re-surfaces everything else.

**Not lost / out of problem:** Fit Maps (FitMapToggle is mounted in Viewport3D +
shortcuts), Seam Allowance / Grainlines / Piece Names / Sewing Lines / Ruler units
(already in LogoMenu ▸ View).

## Placement decision (roster verdict)

Docks were proposed and **rejected unanimously**:

- **Iris (visual):** the dock speaks one verb — "this tool is active" (single-select,
  one lit button). Toggles speak another — "this is visible" (multi-on). Same highlight,
  contradictory semantics; 9 surface modes in a 40px column is a slot machine, not a dock.
- **Voronov (category):** dock membership = *committed intent* ("what am I doing");
  display state = *ambient state* ("what am I seeing"). That seam already exists in the
  codebase (LogoMenu ▸ View). Admitting toggles would convert the RightDock's tolerated
  drift (Sew/Simulate) into the dock's organizing principle.

**Ratified placement:**

| Group | Home |
|---|---|
| 2D toggles: Reference Images, Line Lengths | LogoMenu ▸ View checkboxes (next to existing display twins) |
| 2D render mode (×3) | LogoMenu ▸ View radio trio (same idiom as Ruler radios) |
| 3D toggles: Garment, Seamlines, Internal Lines | LogoMenu ▸ View, new 3D section |
| 3D surface mode (×9) | **`SurfaceModePill`** — floating pill over the 3D viewport with a flyout grid |

## Design

### 1. LogoMenu ▸ View — 2D additions

In `src/components/shell/LogoMenu.tsx` `VIEW_MENU`, after the existing display
checkboxes (Sewing Lines is last today):

- `Reference Images` — `action: toggleReferenceImages()`, `checked: s.editor.showReferenceImages`
- `Line Lengths` — `action: toggleLineLengths()`, `checked: s.editor.showLineLengths`

New radio group (separator before it, same idiom as the `Ruler: cm/inches/mm` trio):

- `Render: Textured` — `setRenderMode2D('textured')`, `checked: s.editor.renderMode2D === 'textured'`
- `Render: Translucent` — idem `'translucent'`
- `Render: Wireframe` — idem `'wireframe'`

All actions already exist in `editorSlice`. No new state.

### 2. LogoMenu ▸ View — 3D section

New separator + three checkboxes dispatching existing `simulationSlice` actions:

- `3D: Garment` — `toggleGarment()`, `checked: s.simulation.showGarment`
- `3D: Seamlines` — `toggleSeamlines3D()`, `checked: s.simulation.showSeamlines3D`
- `3D: Internal Lines` — `toggleInternalLines3D()`, `checked: s.simulation.showInternalLines3D`

`MenuItem.checked` receives full `RootState`, so reading `s.simulation` needs no infra.
Labels carry the `3D:` prefix because the View menu mixes 2D and 3D scope and the menu
is reachable from any view mode.

### 3. `SurfaceModePill` — new component

**Files:** `src/components/Viewport3D/SurfaceModePill.tsx` + `SurfaceModePill.css`.

- Floating pill in the 3D viewport top chrome row: `position: absolute; top: 8px;
  right: 116px` — left of the "Render" button cluster (Render at `right: 52`,
  CB at `right: 8`), gated on `!hideChrome` like its siblings. Rendered from
  `Viewport3D.tsx` next to the Render/CB buttons. (Exact offset may be nudged during
  live verification if it collides with the Render button's open-panel positions.)
- Collapsed: one button showing the **current mode's icon + short label** (e.g. icon +
  "Textured"). `aria-label="Surface mode: <label>"`.
- Click → flyout **3×3 grid** of the 9 modes (icon + label each), current mode
  highlighted. Click dispatches `setSurfaceMode3D(mode)` and closes the flyout.
- Outside-click (mousedown outside the wrapper ref) + Escape close. Trigger lives
  inside the wrapper ref (DockToolPicker pattern — prevents close→reopen race).
- Modes + lucide icons reuse the DisplayBar3D inventory: textured/Image,
  translucent/Droplets, mesh/Box, thick/Layers, flat/Square, xray/Scan, shaded/Circle,
  shaded-wire/CircleDot, textured-wire/ImagePlus.
- Accessibility: flyout `role="group" aria-label="Surface mode"`, per-button
  `aria-label` = mode label, `aria-pressed` on the current mode.
- Distinct concern from `RenderSettingsPanel` (scene/environment/export) — no overlap.

### 4. Line Lengths revival (2D canvas rendering)

**Semantics:** one length label **per semantic edge** (shoulder, hemline, …), not per
outline path command — a DXF polyline outline would otherwise spray hundreds of
micro-segment labels.

- `PatternEditor.tsx` destructures `showLineLengths` from editor state (the other 4
  display flags already are) and passes it + `units` to `PieceRenderer`.
- In `PieceRenderer` (per-piece component), unconditional memo:
  `const lengthEdges = useMemo(() => showLineLengths ? (piece.edges?.length ? piece.edges : detectSemanticEdges(piece)) : [], [piece, showLineLengths])`.
  `detectSemanticEdges` is pure on the piece — DXF imports without prior edge
  detection still get labels. Detected edges are NOT written back to the store
  (view-only computation).
- Per edge:
  - `len = edge.length ?? computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1])`
  - midpoint = `pointAtPathDistance(piece.outline, len / 2, edge.segmentRange[0], edge.segmentRange[1])` (skip edge if null)
  - `<text>` at midpoint: `formatDimension(len, units)`, `fontSize 9 / zoom2D`,
    `font-mono-2d`, fill `var(--ink-on-light)` opacity 0.75, `textAnchor="middle"`,
    `pointerEvents="none"`, counter-rotated `rotate(-piece.rotation, mx, my)` so text
    stays horizontal (same trick as piece-name labels).
- Edges with degenerate length (< 1mm) are skipped.

Units come from `editor.units` (cm/inches/mm) via the existing `formatDimension(mm, units)`.

## Testing

**Unit (Vitest, jsdom):**

- `LogoMenu` View entries: each new item renders, dispatches the right action, and
  reflects `checked` state (2D + 3D groups; render-mode radio exclusivity).
- `SurfaceModePill`: collapsed shows current mode; flyout opens with 9 options;
  selecting dispatches `setSurfaceMode3D` and closes; outside mousedown + Escape close;
  trigger click does not self-close-reopen.
- Line Lengths: with `showLineLengths` on, a piece with `edges` renders one label per
  edge with `formatDimension` output in active units; a piece **without** `edges`
  still renders labels (detection fallback); off renders none.

**Live (Playwright, port 5183, untracked):** `scripts/verify-display-toggles.mjs` —
open app, toggle Reference Images + Line Lengths + render mode via View menu and assert
store/DOM effects; switch to 3D, open SurfaceModePill, pick `xray`, assert
`simulation.surfaceMode3D === 'xray'`.

**Gates:** `npx tsc -b --noEmit && npm run test && npm run lint` green per commit
(pre-commit hook live).

## Out of scope

- Deleting `DisplayBar2D` / `DisplayBar3D` / `Toolbar3D` — after this lands they reach
  full parity and become deletable, but deletion is a separate follow-up (Toolbar3D
  additionally needs the `Tool3D` type-move).
- Fit Maps (already alive), dock changes (explicitly rejected), keyboard shortcuts for
  the new toggles, persisting `surfaceMode3D`/render mode across sessions (transient
  Redux today, stays transient).
