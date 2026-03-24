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

Escape at any step resets to IDLE. Tab toggles between pivot/parallel mode.

## Spread Modes

### Pivot Mode (default)
Rotate the selected half around one slash-line intersection point. Opens a wedge-shaped gap. Measured in degrees. Used for flared skirts, dart equivalency.

### Parallel Mode
Translate the selected half perpendicular to the slash line. Opens a uniform-width gap. Measured in mm. Used for adding even ease/fullness.

## Gap Fill Options

| Option | Behavior |
|--------|----------|
| **Straight** (default) | Gap edges connected with line segments (triangular insert shape) |
| **Smooth** | Gap edges blended with bezier curves for continuous arc (production-ready hemlines) |

Controlled via tool option toggle.

## Geometry Engine

All pure functions in `src/utils/geometry/slashAndSpread.ts`. No Redux, fully testable.

### Functions

**`findSlashIntersections(outline, startPoint, endPoint)`**
Find exactly 2 intersection points where the slash line crosses the piece outline. Returns indices + exact coordinates. Errors if not exactly 2 intersections.

**`splitOutlineAtSlash(outline, intersection1, intersection2)`**
Split outline into two closed sub-paths at the intersection points. Each half includes the slash segment as closing edge. Bezier curves split via de Casteljau subdivision.

Returns: `{ halfA: PathCommand[], halfB: PathCommand[], slashEdgeA, slashEdgeB }`

**`classifyInternals(internals, halfA, halfB)`**
Assign each internal line to its containing half via point-in-polygon. Dart spanning the slash → assigned to the half containing the apex.

Returns: `{ internalsA: InternalLine[], internalsB: InternalLine[] }`

**`applyPivotSpread(half, internals, pivot, angleDeg)`**
Rotate half-outline and its internals around pivot point by angle. Pure coordinate rotation.

**`applyParallelSpread(half, internals, slashDirection, distance)`**
Translate half-outline and its internals perpendicular to slash line by distance.

**`mergeSpreadHalves(halfA, halfB, gapFill: 'straight' | 'smooth')`**
Reconnect two halves into single closed outline. Straight: line segments. Smooth: bezier curve fit across gap points.

**`buildSpreadPiece(piece, intersection1, intersection2, selectedHalf, pivot, spreadAmount, mode, gapFill)`**
Orchestrator: calls all above, returns new PatternPiece with spread applied. Called by both the UI hook and the copilot tool.

### Key Decisions
- Works on `PathCommand[]` directly — no intermediate representation
- Bezier curves preserved through intersection splitting (de Casteljau)
- Pivot point is always one of the two slash-line intersection points
- Internal lines (darts, grainline, notches) on selected half move with it
- Multiple slashes: sequential operations, each modifies the piece. Undo individually.

## Tool Definition

File: `src/tools/definitions/slashAndSpread.tsx`

```typescript
{
  id: 'slashAndSpread',
  name: 'Slash & Spread',
  context: '2d',
  cursor: 'crosshair',
  group: 'pattern',  // alongside scissors
  options: [
    { id: 'mode', type: 'select', value: 'pivot', choices: ['pivot', 'parallel'] },
    { id: 'gapFill', type: 'select', value: 'straight', choices: ['straight', 'smooth'] },
  ],
  copilot: {
    keywords: ['slash', 'spread', 'fullness', 'flare', 'ease', 'pivot'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
  },
}
```

## Hook

File: `src/components/PatternEditor/useSlashAndSpreadTool.ts`

Standard pattern: state machine in useRef, `toPattern()` coordinate conversion, mouse handlers.

- `handleMouseDown` — drives state transitions through the 8 steps
- `handleMouseMove` — updates preview per state (slash line, half highlight, live spread)
- `handleMouseUp` — in SPREADING state, applies spread via `buildSpreadPiece()`, dispatches `updatePiece`
- `handleKeyDown` — Escape resets, Tab toggles pivot/parallel
- Uses `useGuardedAction` for piece modification

## Overlay

File: `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx`

Per-state rendering:
- **DRAWING_SLASH**: dashed line from start to cursor, snap indicator circle
- **SLASH_COMPLETE**: solid slash line, directional arrows on each half
- **SELECTING_HALF**: hovered half filled light-blue at 30% opacity
- **HALF_CONFIRMED**: selected half filled yellow at 30% opacity, pivot point dot
- **SPREADING**: live transformed half, dashed angle arc (pivot mode) or distance lines (parallel mode), degree + mm labels

## Copilot Tool

File: `src/copilot/action/tools/definitions/slashAndSpreadTool.ts`

```typescript
{
  name: 'slashAndSpread',
  description: 'Slash a piece along a line and spread to add fullness / Cortar una pieza a lo largo de una línea y abrir para agregar amplitud',
  parameters: {
    pieceId: { type: 'string', required: true },
    slashStart: { type: 'object', properties: { x: number, y: number }, required: true },
    slashEnd: { type: 'object', properties: { x: number, y: number }, required: true },
    selectedHalf: { type: 'string', enum: ['A', 'B'], required: true },
    pivotEnd: { type: 'string', enum: ['start', 'end'], required: true },
    spreadAmount: { type: 'number', required: true },  // degrees or mm
    mode: { type: 'string', enum: ['pivot', 'parallel'], default: 'pivot' },
    gapFill: { type: 'string', enum: ['straight', 'smooth'], default: 'straight' },
  },
  execute: calls buildSpreadPiece() → dispatches updatePiece → returns ToolResult
}
```

## Registration Touchpoints

| File | Change |
|------|--------|
| `src/tools/index.ts` | Import and register slashAndSpread tool definition |
| `src/components/Toolbar2D/Toolbar2D.tsx` | Add `'slashAndSpread'` to scissors group in TOOL_GROUPS |
| `src/components/PatternEditor/PatternEditor.tsx` | Instantiate hook, wire mouse handlers |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Add SlashAndSpreadOverlay dispatch |
| `src/copilot/action/tools/registry.ts` | Register copilot slashAndSpread tool |

## Testing

### Unit — `src/utils/geometry/__tests__/slashAndSpread.test.ts`

- `findSlashIntersections`: line crosses rectangle at 2 points; diagonal on irregular shape; tangent line → error; miss → error
- `splitOutlineAtSlash`: rectangle split produces two valid closed paths; bezier curves preserved via de Casteljau; correct segments per half
- `classifyInternals`: grainline on left → halfA; dart apex determines assignment
- `applyPivotSpread`: 45° rotation matches expected coords; 0° returns identical; negative angle reverses
- `applyParallelSpread`: perpendicular translation correct; direction matches slash orientation
- `mergeSpreadHalves`: straight fill produces line segments; smooth fill produces beziers; merged outline is closed
- `buildSpreadPiece`: full round-trip preserves id/name, correct outline, internals rotated

### Hook — `src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts`

- State transitions: click → DRAWING_SLASH → click → SLASH_COMPLETE → etc.
- Escape at any state → IDLE
- Full flow dispatches updatePiece with spread piece

### Copilot — `src/copilot/action/tools/__tests__/slashAndSpreadTool.test.ts`

- Valid params → success, piece updated
- Nonexistent pieceId → error result
- Slash line doesn't intersect → error result

## Files Created

- `src/utils/geometry/slashAndSpread.ts` — Pure geometry functions
- `src/utils/geometry/__tests__/slashAndSpread.test.ts` — Geometry unit tests
- `src/tools/definitions/slashAndSpread.tsx` — Tool definition + icon
- `src/components/PatternEditor/useSlashAndSpreadTool.ts` — Hook with state machine
- `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx` — Preview overlay
- `src/components/PatternEditor/__tests__/useSlashAndSpreadTool.test.ts` — Hook tests
- `src/copilot/action/tools/definitions/slashAndSpreadTool.ts` — Copilot tool
- `src/copilot/action/tools/__tests__/slashAndSpreadTool.test.ts` — Copilot tool tests

## Files Modified

- `src/utils/patternOps.ts` — Remove old naive `slashAndSpread()`, import from new module
- `src/tools/index.ts` — Register tool
- `src/components/Toolbar2D/Toolbar2D.tsx` — Add to TOOL_GROUPS
- `src/components/PatternEditor/PatternEditor.tsx` — Wire hook
- `src/components/PatternEditor/renderers/ToolOverlay.tsx` — Wire overlay
- `src/copilot/action/tools/registry.ts` — Register copilot tool
