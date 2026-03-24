# Slash and Spread Tool — Design Spec

> Issue #363 — Cut and spread/rotate for fullness

## Overview

Slash and Spread is a core pattern-making operation: cut a piece along a line, then spread the two halves apart to add fullness. Follows CLO3D's full 8-step interaction flow with both pivot (angular) and parallel (uniform) spread modes.

## Interaction Flow — 8-Step State Machine

```
IDLE → DRAWING_SLASH → SLASH_COMPLETE → SELECTING_HALF → HALF_CONFIRMED → AWAITING_DRAG → SPREADING → apply → IDLE
```

| State | User Action | Visual Feedback |
|-------|-------------|-----------------|
| **IDLE** | Click on piece outline | Snap indicator on outline |
| **DRAWING_SLASH** | Move mouse, click second outline point | Dashed slash line preview, snap to outline |
| **SLASH_COMPLETE** | Click one of the two halves | Solid slash line, directional arrows on halves |
| **SELECTING_HALF** | Click again to confirm | Clicked half highlights light-blue (#ADD8E6, 30%) |
| **HALF_CONFIRMED** | Click slash endpoint to set pivot | Selected half highlights yellow (#FFD700, 30%), pivot indicator |
| **AWAITING_DRAG** | Begin mouse drag | Pivot point locked, cursor changes to rotation |
| **SPREADING** | Drag to rotate/translate, release to apply | Live preview of spread half, angle arc, degree + mm labels |

Escape at any step resets to IDLE (during SPREADING, the live preview is discarded — only mouse-up commits). Tab toggles between pivot/parallel mode.

## Spread Modes

### Pivot Mode (default)
Rotate the selected half around one slash-line intersection point. Opens a wedge-shaped gap. Measured in degrees. Used for flared skirts, dart equivalency.

### Parallel Mode
Translate the selected half perpendicular to the slash line. Opens a uniform-width gap. Measured in mm. Used for adding even ease/fullness.

## Gap Fill Options

| Option | Behavior |
|--------|----------|
| **Straight** (default) | Gap edges connected with line segments (triangular insert shape) |
| **Smooth** | Gap edges blended with Catmull-Rom → cubic bezier conversion for G1 continuity at junction points |

Controlled via tool option toggle.

## Geometry Engine

All pure functions in `src/utils/geometry/slashAndSpread.ts`. No Redux, fully testable. Re-exported from `src/utils/geometry/` barrel if one exists, otherwise imported directly.

### Functions

**`findSlashIntersections(outline, startPoint, endPoint)`**
Wraps the existing `findOutlineIntersections()` from `src/utils/geometry/splitOutline.ts`. Validates exactly 2 intersections. Returns `OutlineHit[]` with command indices and t parameters.

**`splitOutlineAtSlash(outline, hit1, hit2)`**
Wraps the existing `splitOutlineAtPoints()` from `src/utils/geometry/splitOutline.ts`. Returns two closed sub-paths. Each half includes the slash segment as its closing edge. Bezier curves split via de Casteljau (already handled by `splitOutlineAtPoints`).

Returns: `{ halfA: PathCommand[], halfB: PathCommand[], slashEdgeA: [Point2D, Point2D], slashEdgeB: [Point2D, Point2D] }`

**`classifyInternals(internals, halfA, halfB)`**
Assign each internal line to its containing half. Classification uses the centroid of the internal line's flattened path for point-in-polygon testing. For `InternalLine` of type `'dart'`, uses the apex point (the path's furthest-from-baseline point) instead of centroid.

Returns: `{ internalsA: InternalLine[], internalsB: InternalLine[] }`

**`classifyDarts(darts, halfA, halfB)`**
Assign each rich `Dart` entity to its containing half using the `dart.apex` coordinate for point-in-polygon.

Returns: `{ dartsA: Dart[], dartsB: Dart[] }`

**`applyPivotSpread(half, internals, darts, pivot, angleDeg)`**
Rotate half-outline, internals, and darts around pivot point by angle. Pure coordinate rotation.

**`applyParallelSpread(half, internals, darts, slashDirection, distance)`**
Translate half-outline, internals, and darts perpendicular to slash line by distance.

**`mergeSpreadHalves(halfA, halfB, gapFill: 'straight' | 'smooth')`**
Reconnect two halves into single closed outline. Straight: line segments. Smooth: Catmull-Rom interpolation through the gap endpoints converted to cubic bezier, ensuring G1 tangent continuity at junction points.

**`rebuildSemanticEdges(originalEdges, originalOutline, newOutline)`**
Rebuild `SemanticEdge[]` segment ranges after outline modification. Maps original edge start/end points to nearest positions on the new outline to recompute `segmentRange` indices.

**`buildSpreadPiece(piece, hit1, hit2, selectedHalf, pivot, spreadAmount, mode, gapFill)`**
Orchestrator: calls all above, returns new PatternPiece with spread applied. **Preserves the original `piece.id`** — the piece is modified in-place conceptually (same ID, new geometry). Existing seams referencing this piece ID remain valid; their edge geometry updates automatically since seams reference edges by name and edges are rebuilt.

Called by both the UI hook and the copilot tool.

### Key Decisions
- Reuses existing `findOutlineIntersections` and `splitOutlineAtPoints` from `splitOutline.ts` — no reinvention
- Pivot point is always one of the two slash-line intersection points
- Internal lines on selected half move with it; grainline rotates with its half (standard pattern-making behavior)
- Rich `Dart` entities (`piece.darts`) classified and rotated separately from `InternalLine` internals
- `SemanticEdge[]` (`piece.edges`) segment ranges rebuilt after outline modification
- Piece ID preserved → existing `Seam` references remain valid
- If piece has `linkedPieceId`, the link is broken (set to `undefined`) since the geometry has diverged
- Multiple slashes: sequential operations, each modifies the piece. Undo individually via standard undo middleware.

## Tool Definition

File: `src/tools/definitions/slashAndSpread.tsx`

```typescript
export const slashAndSpreadTool: ToolDefinition = {
  id: 'slashAndSpread',
  name: 'Slash & Spread',
  context: '2d',
  cursor: 'crosshair',
  group: 'pattern',  // alongside scissors
  icon: SlashAndSpreadIcon,
  options: [
    {
      id: 'mode',
      label: 'Spread Mode',
      type: 'select',
      value: 'pivot',
      choices: [
        { label: 'Pivot (Angle)', value: 'pivot' },
        { label: 'Parallel (Distance)', value: 'parallel' },
      ],
    },
    {
      id: 'gapFill',
      label: 'Gap Fill',
      type: 'select',
      value: 'straight',
      choices: [
        { label: 'Straight', value: 'straight' },
        { label: 'Smooth Curve', value: 'smooth' },
      ],
    },
  ],
  copilot: {
    description:
      'Slash and spread a pattern piece to add fullness. Cuts a piece along a line and spreads the halves apart by rotating (pivot mode) or translating (parallel mode). Used for flared skirts, dart equivalency, and adding ease.',
    examples: [
      'Spread this skirt panel 15 degrees for flare',
      'Slash and spread the bodice to add fullness',
      'Add 20mm ease by slashing this piece',
    ],
    keywords: ['slash', 'spread', 'fullness', 'flare', 'ease', 'pivot', 'rotate', 'wedge'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
  },
};
```

## Hook

File: `src/components/PatternEditor/useSlashAndSpreadTool.ts`

Standard pattern: state machine in useRef, `toPattern()` coordinate conversion, mouse handlers.

- `handleMouseDown` — drives state transitions through the 8 steps
- `handleMouseMove` — updates preview per state (slash line, half highlight, live spread)
- `handleMouseUp` — in SPREADING state, applies spread via `buildSpreadPiece()`, dispatches `updatePiece`
- `handleKeyDown` — Escape resets, Tab toggles pivot/parallel
- Does NOT use `useGuardedAction` — slash-and-spread is non-destructive (modifies in-place, fully undoable via standard undo middleware)

## Overlay

File: `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx`

Per-state rendering:
- **DRAWING_SLASH**: dashed line from start to cursor, snap indicator circle
- **SLASH_COMPLETE**: solid slash line, directional arrows on each half
- **SELECTING_HALF**: hovered half filled light-blue at 30% opacity
- **HALF_CONFIRMED**: selected half filled yellow at 30% opacity, pivot point dot
- **SPREADING**: live transformed half, dashed angle arc (pivot mode) or distance lines (parallel mode), degree + mm labels

## Copilot Tool

Updated in-place in `src/copilot/action/tools/definitions/patternOpsTools.ts` — replaces the existing naive `slashAndSpread` tool entry (line 152).

```typescript
{
  name: 'slashAndSpread',
  description: 'Slash a piece along a line and spread to add fullness / Cortar una pieza a lo largo de una línea y abrir para agregar amplitud',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Target piece ID' },
      slashStart: {
        type: 'object',
        description: 'Start point on piece outline (x, y in mm)',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
      slashEnd: {
        type: 'object',
        description: 'End point on piece outline (x, y in mm)',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
      selectedHalf: { type: 'string', enum: ['A', 'B'], description: 'Which half to spread (A = start side, B = end side)' },
      pivotEnd: { type: 'string', enum: ['start', 'end'], description: 'Which slash endpoint to use as pivot' },
      spreadAmount: { type: 'number', description: 'Degrees (pivot mode) or mm (parallel mode)' },
      mode: { type: 'string', enum: ['pivot', 'parallel'], description: 'Spread mode' },
      gapFill: { type: 'string', enum: ['straight', 'smooth'], description: 'Gap fill method' },
    },
    required: ['pieceId', 'slashStart', 'slashEnd', 'selectedHalf', 'pivotEnd', 'spreadAmount'],
  },
  execute: async (params, dispatch, getState) => {
    // imports buildSpreadPiece from geometry module
    // finds piece, validates intersections, applies spread, dispatches updatePiece
  },
}
```

## Registration Touchpoints

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `'slashAndSpread'` to `Tool2D` string union |
| `src/tools/index.ts` | Import and register `slashAndSpreadTool` definition |
| `src/components/Toolbar2D/Toolbar2D.tsx` | Add `'slashAndSpread'` to scissors group in `TOOL_GROUPS` |
| `src/components/PatternEditor/PatternEditor.tsx` | Instantiate hook, pass to `useEditorInteractions` |
| `src/components/PatternEditor/useEditorInteractions.ts` | Add `slashAndSpread` entries in `ToolHooks` interface, mouse handler routing, keyboard routing, cursor routing |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Add `SlashAndSpreadOverlay` dispatch + extend `ToolOverlayProps` with slash-and-spread state |
| `src/copilot/action/tools/definitions/patternOpsTools.ts` | Replace naive `slashAndSpread` entry with full implementation |

## Testing

### Unit — `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- `findSlashIntersections`: line crosses rectangle at 2 points; diagonal on irregular shape; tangent line → error; miss → error
- `splitOutlineAtSlash`: rectangle split produces two valid closed paths; bezier curves preserved via de Casteljau; correct segments per half
- `classifyInternals`: grainline on left → halfA; dart centroid/apex determines assignment
- `classifyDarts`: dart apex on left → dartsA; dart apex on right → dartsB
- `applyPivotSpread`: 45° rotation matches expected coords; 0° returns identical; negative angle reverses
- `applyParallelSpread`: perpendicular translation correct; direction matches slash orientation
- `mergeSpreadHalves`: straight fill produces line segments; smooth fill produces beziers; merged outline is closed; G1 continuity at junctions
- `rebuildSemanticEdges`: edge ranges correctly shifted after gap insertion
- `buildSpreadPiece`: full round-trip preserves id/name, correct outline, internals rotated, darts rotated, edges rebuilt, linkedPieceId cleared

### Hook — `src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts`

- State transitions: click → DRAWING_SLASH → click → SLASH_COMPLETE → etc.
- Escape at any state → IDLE (including during SPREADING → discard preview)
- Tab toggles mode between pivot/parallel
- Full flow dispatches updatePiece with spread piece

### Copilot — `src/copilot/action/tools/definitions/__tests__/slashAndSpreadTool.test.ts`

- Valid params → success, piece updated
- Nonexistent pieceId → error result
- Slash line doesn't intersect outline at 2 points → error result

## Files Created

- `src/utils/geometry/slashAndSpread.ts` — Pure geometry functions
- `src/utils/geometry/__tests__/slashAndSpread.test.ts` — Geometry unit tests
- `src/tools/definitions/slashAndSpread.tsx` — Tool definition + icon
- `src/components/PatternEditor/useSlashAndSpreadTool.ts` — Hook with state machine
- `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx` — Preview overlay
- `src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts` — Hook tests
- `src/copilot/action/tools/definitions/__tests__/slashAndSpreadTool.test.ts` — Copilot tool tests

## Files Modified

- `src/types/types.ts` — Add `'slashAndSpread'` to `Tool2D` union
- `src/utils/patternOps.ts` — Remove old naive `slashAndSpread()`, re-export from new geometry module for backward compat
- `src/tools/index.ts` — Register tool
- `src/components/Toolbar2D/Toolbar2D.tsx` — Add to TOOL_GROUPS
- `src/components/PatternEditor/PatternEditor.tsx` — Instantiate hook
- `src/components/PatternEditor/useEditorInteractions.ts` — Wire mouse/keyboard/cursor routing
- `src/components/PatternEditor/renderers/ToolOverlay.tsx` — Wire overlay + extend props
- `src/copilot/action/tools/definitions/patternOpsTools.ts` — Replace naive copilot tool entry
