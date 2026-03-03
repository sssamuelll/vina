# 2D Transform Tool — Design Document

**Epic:** #125 — 2D Pattern Editing Toolchain
**Date:** 2026-03-03
**Status:** Approved

## Goal

Implement a CLO3D-style Transform tool (shortcut `A`) for the 2D pattern editor. When a piece is selected, show 8 resize handles + 1 rotation handle around the bounding box. Drag to scale or rotate pieces visually.

## Architecture

The Transform tool follows the established tool hook pattern:

1. **Hook** (`useTransformTool.ts`) — manages drag state, computes transforms
2. **Overlay** (`TransformHandles.tsx`) — renders handles and preview in SVG
3. **Wiring** — routed through `useEditorInteractions.ts`
4. **Copilot** — `transformPiece` copilot tool already exists

## Interaction Model (CLO3D-style)

```
    ┌──□────────□────────□──┐
    │          ○↻            │
    □                       □
    │      [piece]          │
    □                       □
    │                       │
    └──□────────□────────□──┘

□ = resize handle (6x6px white filled, 1px #4A9EFF border)
○↻ = rotation handle (8px circle, 20px arm from top-center)
```

### Handles

| Handle | Position | Behavior |
|--------|----------|----------|
| `nw`, `ne`, `sw`, `se` | Corners | Proportional scale (Shift = free) |
| `n`, `s` | Top/bottom midpoint | Vertical scale only |
| `e`, `w` | Left/right midpoint | Horizontal scale only |
| `rotate` | Above top-center | Free rotation (Shift = 15-degree snap) |

### Cursors

| Handle | Cursor |
|--------|--------|
| `nw`, `se` | `nwse-resize` |
| `ne`, `sw` | `nesw-resize` |
| `n`, `s` | `ns-resize` |
| `e`, `w` | `ew-resize` |
| `rotate` | `grab` / custom rotate cursor |

## Data Flow

```
Selected pieces → compute bounding box → render handles
                                            ↓
User drags handle → compute scale/rotation from delta
                                            ↓
Preview: ghost outline at 0.3 opacity (transformed bbox)
                                            ↓
Mouse up → apply transform to PathCommand[] → dispatch updatePiece()
```

### Scale Transform

For each PathCommand value `(x, y)` in each selected piece's outline:

```
x' = centerX + (x - centerX) * scaleX
y' = centerY + (y - centerY) * scaleY
```

Where `(centerX, centerY)` is the bounding box center and `scaleX/scaleY` are computed from handle drag delta.

### Rotation Transform

For each point `(x, y)`:

```
dx = x - centerX
dy = y - centerY
x' = centerX + dx * cos(angle) - dy * sin(angle)
y' = centerY + dx * sin(angle) + dy * cos(angle)
```

Angle computed from the vector between rotation handle origin and current mouse position.

### Multi-piece

When multiple pieces are selected, the bounding box encompasses all selected pieces. All pieces transform relative to the combined center.

## Visual Design

- **Bounding box**: 1px dashed `#4A9EFF` line
- **Resize handles**: 6x6px white filled rect, 1px `#4A9EFF` border
- **Rotation handle**: 8px white circle, 1px `#4A9EFF` border, 20px arm
- **Hover state**: Handle fills `#4A9EFF`
- **Active drag**: Ghost preview of transformed outline at 0.3 opacity
- **All handle sizes are zoom-independent** (divided by zoom factor)

## Undo

Before applying any transform, snapshot all affected pieces. On undo, restore all pieces to their pre-transform state. This uses the existing `updatePiece` action which is tracked by the undo middleware.

## Files

| File | Action |
|------|--------|
| `src/components/PatternEditor/useTransformTool.ts` | Create |
| `src/components/PatternEditor/renderers/TransformHandles.tsx` | Create |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Modify — add transform overlay |
| `src/components/PatternEditor/useEditorInteractions.ts` | Modify — wire transform tool |
| `src/components/PatternEditor/PatternEditor.tsx` | Modify — call hook, pass props |

## Copilot Integration

The `transformPiece` copilot tool at `src/copilot/action/tools/definitions/compound/transformPiece.ts` already handles programmatic scale/rotate/skew. No additional copilot registration needed for this tool.

## Future Tools (same pattern)

This is Tool 1 of Epic #125. Subsequent tools follow the same hook + overlay + wiring pattern:

1. **Transform** (this doc) — scale/rotate handles
2. **Edit Curvature** — bezier control point editing
3. **Split Pattern** — cut piece along a line
4. **Merge Patterns** — combine adjacent pieces
5. **Measure Distance/Angle** — click-to-measure
6. **Drawing Tools** — rectangle, polygon, circle
7. **Seam Allowance Tool** — visual per-edge toggle

Each tool will also be registered as a copilot action tool.
