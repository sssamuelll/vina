# Measure Tool Enhancement — Design Document

**Epic:** #125 — 2D Pattern Editing Toolchain
**Date:** 2026-03-04
**Status:** Approved

## Goal

Enhance the existing measure tool with snap-to-outline precision, edge path measurement, angle display, cumulative mode, and ToolHooks interface alignment. Fix missing `measure_distance` LLM schema.

## Current State

- **UI hook** (`useMeasureTool.ts`): Two-click point-to-point distance. Works but no snap, no angle, no cumulative.
- **Overlay** (`MeasureToolOverlay.tsx`): Purple dashed lines with distance labels. No angle arcs, no cumulative total.
- **Tool definition** (`measure.tsx`): Has `showAngle` and `cumulative` options declared but not implemented. No shortcut key.
- **Copilot actions**: `measure_edge`, `measure_piece_area`, `compare_edges`, `measure_distance` all have types, executor, validator. `measure_distance` missing from LLM schemas.
- **ToolHooks interface**: Hook doesn't expose `handleMouseUp`, `getCursor`, `reset` — doesn't match the ToolHooks pattern used by scissors/merge.

## Architecture

Incremental enhancement of existing files. No new geometry utilities needed — snap-to-outline reuses `flattenPath()` + segment projection (same pattern as useScissorsTool). Edge path length calculation uses existing `flattenPath()` to walk polyline segments. Angle is simple `Math.atan2` trigonometry.

## Enhancements

### 1. Snap-to-Outline

When hovering near a piece edge (within 8px screen threshold), snap measurement endpoints to the nearest point on the outline. Same algorithm as `useScissorsTool.snapToOutline`:

- Convert mouse position to pattern space
- For each piece, flatten outline via `flattenPath()`
- Project point onto each segment, find nearest
- If within threshold: snap point = projected point, record which piece + segment

**State addition:**
```typescript
hoveredSnapPoint: Point2D | null;
snappedPieceId: string | null;
```

### 2. Edge Path Measurement

When both start and end snap points are on the **same piece outline**, measure the actual path length along the outline (not straight-line distance). Walk the flattened polyline segments between the two snap parameters.

This gives true edge measurements: measure a curved armhole by clicking start and end on the same edge, get the arc length rather than chord length.

**Implementation:** Walk flattened polyline from startParam to endParam, sum segment lengths.

### 3. Angle Display

When `showAngle` tool option is enabled, display the angle between the measurement line and the horizontal axis:

- Calculate angle: `Math.atan2(dy, dx) * 180 / Math.PI`
- Draw a small arc at the start point (15px radius, zoom-independent)
- Show angle value (e.g., "45.0°") next to the arc

### 4. Cumulative Mode

When `cumulative` tool option is enabled:

- After completing a measurement, the next measurement starts from the end point of the previous one (auto-chain)
- Display a running total below the last measurement label
- Escape breaks the chain (returns to free-click mode)

### 5. ToolHooks Interface Alignment

Add missing interface members to match scissors/merge pattern:

```typescript
handleMouseUp: () => void;  // no-op (click-based)
getCursor: () => string;    // 'crosshair' always
reset: () => void;          // clear all measurements
```

### 6. Shortcut Key

Add `shortcut: 'm'` to tool definition.

### 7. Missing LLM Schema

Add `measure_distance` to `actionSchemas.ts`:

```typescript
{
  action: 'measure_distance',
  description: 'Measure distance between two points',
  category: 'measurement',
  parameters: [
    { name: 'from', type: '{ x, y }', description: 'Start point', required: true },
    { name: 'to', type: '{ x, y }', description: 'End point', required: true },
  ],
  examples: ['Measure distance between these two points'],
  readOnly: true,
}
```

## Visual Design

| Element | Style |
|---------|-------|
| Measurement line | 1.5px dashed `#9c27b0` (existing) |
| Start/end points | 3px circle, `#9c27b0` fill (existing) |
| Snap indicator | 4px circle, `#9c27b0` at 0.5 opacity on edge hover |
| Angle arc | 1px arc `#9c27b0`, 0.5 opacity, 15px radius |
| Angle label | 9px text, `rgba(0,0,0,0.6)` bg |
| Cumulative total | Bold label, `#7B1FA2` background |
| Edge highlight (path mode) | 2px solid `#9c27b0` along the edge path |

All sizes zoom-independent (divided by `zoom2D`).

## State

```typescript
interface MeasureState {
  measurements: Measurement[];
  currentStart: Point2D | null;
  cursorPos: Point2D | null;
  hoveredSnapPoint: Point2D | null;
  snappedPieceId: string | null;
}

interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;        // straight-line or path distance
  isPathMeasurement: boolean;  // true if measuring along outline
  pathPoints?: Point2D[];      // polyline for path measurement rendering
  angle?: number;              // degrees, if showAngle enabled
}
```

## Files

| File | Action |
|------|--------|
| `src/components/PatternEditor/useMeasureTool.ts` | Modify — add snap, angle, cumulative, ToolHooks alignment |
| `src/components/PatternEditor/renderers/overlays/MeasureToolOverlay.tsx` | Modify — add snap indicator, angle arc, cumulative total, path highlight |
| `src/tools/definitions/measure.tsx` | Modify — add `shortcut: 'm'` |
| `src/copilot/llm/actionSchemas.ts` | Modify — add `measure_distance` schema |

## Testing

- Unit tests for snap-to-outline (reuses existing pattern)
- Unit tests for edge path length calculation
- Unit tests for angle calculation
- TypeScript type check passes
- Existing 2661 tests remain green
