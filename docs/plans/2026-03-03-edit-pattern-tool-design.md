# Edit Pattern Tool — Design Document

**Epic:** #125 — 2D Pattern Editing Toolchain
**Date:** 2026-03-03
**Status:** Approved

## Goal

Implement CLO3D-style Edit Pattern (Z) and Edit Curve Point (V) tools for the 2D pattern editor. Edit Pattern enables point/segment selection, multi-select, move, delete, add, and line↔curve conversion. Edit Curve Point adds bezier handle editing on top.

## Architecture

Refactor the existing `useNodeEditor` into shared utilities + two dedicated hooks:

```
nodeEditorUtils.ts  (shared pure functions + types)
├── extractNodes()
├── applyNodeMove()
├── hitTestNode()
├── NodeRef, EditableNode
│
├── useEditPattern.ts  (tool Z)
│   ├── point selection, multi-select, move, delete, add
│   ├── segment selection + move
│   ├── convert line↔curve (context menu)
│   └── shows anchor dots only
│
└── useEditCurve.ts  (tool V, replaces useNodeEditor)
    ├── inherits selection/move from shared utils
    ├── bezier handle display + dragging
    └── tangent continuity logic
```

### Entry Points

- `Z` key or toolbar → `activeTool = 'editPattern'` → click piece to enter editing
- `V` key or toolbar → `activeTool = 'editCurve'` → click piece to enter editing
- Double-click in `select` mode → enters `editPattern` (preserving current UX)

## Interaction Model — Edit Pattern (Z)

### Selection

| Action | Behavior |
|--------|----------|
| Click piece (not yet editing) | Enter edit mode, show anchor dots |
| Click anchor point | Select it (gold highlight) |
| Shift+click anchor | Add/remove from multi-selection |
| Click segment | Select the segment (highlight it) |
| Shift+click segment | Add/remove segment from selection |
| Marquee drag (empty space) | Select all anchors inside rectangle |
| Click empty area | Exit edit mode |
| Escape | Exit edit mode |

### Operations

| Action | Behavior |
|--------|----------|
| Drag selected anchor(s) | Move them (control points follow) |
| Drag selected segment | Move both endpoints + control points as a unit |
| Delete/Backspace | Delete selected anchor point(s), reconnect neighbors |
| Click on edge (no anchor hit) | Add new anchor point at click position |
| Right-click segment | Context menu: "Convert to Curve" / "Convert to Line" |

### Delete Point Logic

- Remove the PathCommand at that index
- If between two L commands, just remove it
- If between curves (C/Q), reconnect with L to the next anchor
- Cannot delete if piece would have fewer than 3 points

### Add Point Logic

- Find nearest segment to the click
- Split the segment at the projected point
- If segment is L: insert new L at the projected position
- If segment is C: use de Casteljau subdivision to split the bezier at parameter t

### Convert Line↔Curve

- **Line to Curve:** Replace `L` with `C`, control points at 1/3 and 2/3 along segment
- **Curve to Line:** Replace `C`/`Q` with `L`, discard control points

## Interaction Model — Edit Curve Point (V)

Same as current `useNodeEditor` behavior:
- Shows anchor dots AND bezier control handles
- Drag anchors (control points follow for tangent continuity)
- Drag control handles independently
- All selection/move features from Edit Pattern also available

## Visual Design

### Edit Pattern Overlay (Z tool)

| Element | Style |
|---------|-------|
| Anchor (normal) | 5px circle, `#4A9EFF` fill, `#fff` 1.2px stroke |
| Anchor (hovered) | 5px circle, `#6BB3FF` fill |
| Anchor (selected) | 5px circle, `#FFD700` fill |
| Selected segment | 2px solid `#FFD700` over the edge |
| Marquee box | 1px dashed `#4A9EFF`, `rgba(74,158,255,0.1)` fill |
| Add-point preview | 4px circle, `#4A9EFF` at 0.5 opacity on edge hover |

All sizes zoom-independent (divided by `zoom2D`).

No bezier handles shown in Edit Pattern — handles are exclusive to Edit Curve (V).

### Edit Curve Overlay (V tool)

Unchanged from current `NodeEditorOverlay.tsx`:
- Anchor circles (blue/gold)
- Handle squares (red/white)
- Handle arm lines (red, 0.5 opacity)
- Coordinate tooltip on selected node

### Cursors

| Context | Cursor |
|---------|--------|
| Hovering anchor | `move` |
| Hovering segment | `pointer` |
| Hovering edge (add point) | `crosshair` |
| Dragging | `move` |
| Marquee | `crosshair` |
| Default | `default` |

## State

```typescript
interface EditPatternState {
  isEditing: boolean;
  editingPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;       // commandIndex set (multi-select)
  selectedSegments: Set<number>;    // commandIndex of segment destination
  hoveredNode: number | null;       // commandIndex
  hoveredSegment: number | null;    // commandIndex
  marquee: { start: Point2D; current: Point2D } | null;
}
```

### Segment Model

A segment is the edge between two consecutive anchors, identified by the commandIndex of the destination command (e.g., segment from M→L is identified by the L's index). Maps directly to PathCommand array indices.

### Data Flow

```
Z key → activeTool = 'editPattern'
  → click piece → enterEdit(pieceId)
  → extractNodes(piece) → populate nodes
  → click/drag/delete → dispatch(updatePiece)
  → re-extract nodes from updated piece
```

### Undo

Each mouseUp (drag), delete, add, and convert dispatches `updatePiece`, already tracked by undo middleware. No extra undo work needed.

## Copilot Integration

### Existing actions (keep as-is)

- `move_point` — working
- `add_point` — working
- `delete_point` — working, but missing from LLM schema

### Actions to implement

- `curve_edge` — currently a stub; implement real L→C conversion (control points at 1/3 and 2/3)
- `straighten_edge` — new action; C/Q→L conversion (discard control points)

### Schema fixes

- Add `delete_point` to LLM action schema
- Add `straighten_edge` action type + schema + executor
- Register `editPattern` tool definition so copilot can switch to it

## Files

| File | Action |
|------|--------|
| `src/components/PatternEditor/nodeEditorUtils.ts` | Create — shared types + functions |
| `src/components/PatternEditor/useEditPattern.ts` | Create — Edit Pattern hook (Z) |
| `src/components/PatternEditor/useEditCurve.ts` | Create — Edit Curve hook (V), replaces useNodeEditor |
| `src/components/PatternEditor/useNodeEditor.ts` | Delete — replaced by utils + two hooks |
| `src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx` | Create |
| `src/components/PatternEditor/renderers/overlays/NodeEditorOverlay.tsx` | Modify — update imports |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Modify — add editPattern overlay |
| `src/components/PatternEditor/useEditorInteractions.ts` | Modify — wire both tools |
| `src/components/PatternEditor/PatternEditor.tsx` | Modify — instantiate hooks, pass props |
| `src/components/PatternEditor/ContextMenu.tsx` | Modify — add convert options |
| `src/copilot/actions/actionExecutor.ts` | Modify — implement curve_edge, add straighten_edge |
| `src/copilot/actions/actionTypes.ts` | Modify — add straighten_edge type |
| `src/copilot/llm/actionSchemas.ts` | Modify — add delete_point, straighten_edge schemas |
| `src/tools/definitions/editPattern.tsx` | Create — tool definition for Z tool |
