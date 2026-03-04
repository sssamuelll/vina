# Split/Merge Pattern Tools — Design Document

**Epic:** #125 — 2D Pattern Editing Toolchain
**Date:** 2026-03-04
**Status:** Approved

## Goal

Implement professional-grade Split (scissors) and Merge tools for the 2D pattern editor with full copilot integration. Split cuts a piece along an arbitrary line; Merge combines two adjacent pieces into one. Both preserve original curve geometry on unaffected edges.

## Architecture

Curve-preserving polygon operations using Clipper2 for intersection detection on flattened paths, then reconstructing results from original PathCommands. New geometry utilities handle line-outline intersection, outline walking, and edge merging. Interactive hooks follow the established pattern (useScissorsTool, useMergeTool) with SVG overlays.

## Current State

- **Scissors tool definition** exists (`src/tools/definitions/scissors.tsx`, shortcut X) with copilot metadata
- **`splitPiece()`** exists in `src/utils/patternOps.ts` but only handles axis-aligned (H/V) cuts with simplified bounding-box outlines
- **`split_edge`** action exists but is a different operation (adds a point to an edge)
- **Merge** is completely missing — no tool, function, action, or schema
- **Clipper2** (`clipper2-js`) is already a dependency, used for seam allowance
- **`flattenPath()`** exists in `src/utils/seam/index.ts` for PathCommand[] → Point2D[]

## Geometry Engine

### Split Algorithm (Curve-Preserving)

1. **Find intersection points** between the cut line and the piece outline
   - Flatten outline via `flattenPath()` to get a polyline
   - Walk each polyline segment, test for line-segment intersection with the cut line
   - Record: which original PathCommand the intersection falls on, the parameter `t` along that command
   - Expect exactly 2 intersection points (cut line enters and exits the piece)

2. **Split original PathCommands at intersection points**
   - For L commands: simple linear interpolation at parameter t
   - For C commands: de Casteljau subdivision at t (reuse logic from `nodeEditorUtils.splitSegmentAt`)
   - For Q commands: quadratic de Casteljau subdivision at t

3. **Walk the outline** to produce two halves
   - Half A: from intersection1 → walk forward along original commands → intersection2 → straight line back to intersection1
   - Half B: from intersection2 → walk forward along original commands → intersection1 → straight line back to intersection2
   - Each half preserves original M, L, C, Q commands for segments fully within it
   - The "cut edge" on each half is new L commands (straight line along cut path)

4. **Construct two PatternPieces**
   - New IDs, names with "(A)" / "(B)" suffix
   - Distribute semantic edges: each edge stays with whichever half contains its original commands
   - Distribute darts: each dart stays with the half that contains its position
   - Copy fabric, position (piece B offset slightly for visual separation)
   - Mark new cut edges as semantic edge "cut" for potential re-merge

### Merge Algorithm (Curve-Preserving)

1. **Detect shared edge** between two pieces
   - Option A: Find an existing seam connecting the pieces → those edges are the shared boundary
   - Option B: Edge proximity matching — find edges on piece A and B within 2mm tolerance
   - Match by comparing flattened edge polylines (point-to-point distance < tolerance)

2. **Combine outlines**
   - Remove the shared edge from both pieces
   - Connect the remaining edges: walk piece A's outline (skipping the shared edge), then walk piece B's outline (skipping its shared edge)
   - All original curves preserved on non-shared edges

3. **Construct merged PatternPiece**
   - New ID, combined name
   - Union semantic edges from both (rename on conflict)
   - Union darts from both
   - Remove the seam between them (if it existed)
   - Position at piece A's original position

### Utility Functions

```
src/utils/geometry/
├── lineIntersect.ts    — line-segment and line-polyline intersection
├── splitOutline.ts     — curve-preserving outline split at two points
└── mergeOutline.ts     — curve-preserving outline merge along shared edge
```

Shared helpers: `flattenPath()` (existing), de Casteljau subdivision (existing in `nodeEditorUtils.ts`).

## Interaction Model — Scissors Tool (X)

### Flow

1. Scissors tool active → click a piece → enter split mode (piece highlighted)
2. Click on or near the piece outline → set cut start point (snaps to nearest outline point)
3. Mouse move → live preview of cut line + two resulting halves
4. Click on or near the opposite outline edge → set cut end point
5. Preview shows final split with two halves tinted different colors
6. Enter confirms split, Escape cancels

### Constraints

- Start and end points must be on different edges of the piece
- If start/end are on the same edge, show error indicator (red line)
- Cut line is always straight (between the two clicked points)

### Visual Design

| Element | Style |
|---------|-------|
| Cut line (preview) | 1.5px dashed `#FF4444`, animated dash |
| Cut line (confirmed) | 2px solid `#FF4444` |
| Start point | 6px circle, `#FF4444` fill, white stroke |
| End point | 6px circle, `#FF4444` fill, white stroke |
| Half A preview | Original piece with `rgba(74,158,255,0.15)` overlay |
| Half B preview | Original piece with `rgba(255,183,77,0.15)` overlay |
| Snap indicator | 4px circle, `#FF4444` at 0.5 opacity on edge hover |

All sizes zoom-independent (divided by `zoom2D`).

### Cursors

| Context | Cursor |
|---------|--------|
| Hovering piece (not yet targeting) | `crosshair` |
| Hovering edge (placing start/end point) | `crosshair` with snap |
| Cut line active (between clicks) | `crosshair` |
| Default | `default` |

## Interaction Model — Merge Tool

### Flow

1. Merge tool active → click piece A → highlight it (blue tint)
2. Click piece B → system detects shared edge
3. If shared edge found: preview merged outline, Enter confirms
4. If no shared edge: show error toast "No adjacent edge found"
5. Escape at any point cancels

### Visual Design

| Element | Style |
|---------|-------|
| Piece A selected | `rgba(74,158,255,0.15)` overlay |
| Piece B selected | `rgba(255,183,77,0.15)` overlay |
| Shared edge highlight | 3px solid `#4CAF50` (green) |
| Merged preview | Combined outline with `rgba(76,175,80,0.1)` fill |

### Tool Definition

```typescript
{
  id: 'merge',
  name: 'Merge Patterns',
  context: '2d',
  shortcut: 'j',  // "join"
  icon: MergeIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description: 'Merge two adjacent pattern pieces into one...',
    examples: ['Merge the upper and lower bodice', 'Join these two pieces'],
    keywords: ['merge', 'join', 'combine', 'unite', 'connect'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
}
```

## State

### Scissors State

```typescript
interface ScissorsState {
  targetPieceId: string | null;
  startPoint: { position: Point2D; commandIndex: number; t: number } | null;
  endPoint: { position: Point2D; commandIndex: number; t: number } | null;
  previewLine: { start: Point2D; end: Point2D } | null;
  hoveredEdgePoint: Point2D | null;
}
```

### Merge State

```typescript
interface MergeState {
  pieceIdA: string | null;
  pieceIdB: string | null;
  sharedEdge: { edgeA: number; edgeB: number } | null;
  previewOutline: PathCommand[] | null;
}
```

### Data Flow

```
X key → activeTool = 'scissors'
  → click piece → targetPieceId
  → click edge → startPoint
  → click edge → endPoint
  → Enter → splitOutline() → dispatch(removePiece + addPiece x2)

J key → activeTool = 'merge'
  → click piece A → pieceIdA
  → click piece B → detectSharedEdge()
  → if found → previewOutline = mergeOutline()
  → Enter → dispatch(removePiece x2 + addPiece)
```

### Undo

Each confirm dispatches piece add/remove actions, already tracked by undo middleware.

## Copilot Integration

### Actions

```typescript
interface SplitPieceAction {
  action: 'split_piece';
  pieceId: string;
  startPoint: [number, number];  // [x, y] on outline
  endPoint: [number, number];    // [x, y] on outline
}

interface MergePiecesAction {
  action: 'merge_pieces';
  pieceIdA: string;
  pieceIdB: string;
}
```

### Schemas

```typescript
{
  action: 'split_piece',
  description: 'Split a pattern piece into two pieces along a cut line',
  category: 'geometry',
  parameters: [
    { name: 'pieceId', type: 'string', description: 'ID of the piece to split', required: true },
    { name: 'startPoint', type: '[number, number]', description: 'Start point [x, y] on outline', required: true },
    { name: 'endPoint', type: '[number, number]', description: 'End point [x, y] on outline', required: true },
  ],
  examples: ['Split the front bodice from armhole to waist', 'Cut this piece in half'],
  dangerous: true,
}

{
  action: 'merge_pieces',
  description: 'Merge two adjacent pattern pieces into one piece',
  category: 'geometry',
  parameters: [
    { name: 'pieceIdA', type: 'string', description: 'ID of first piece', required: true },
    { name: 'pieceIdB', type: 'string', description: 'ID of second piece', required: true },
  ],
  examples: ['Merge the upper and lower bodice', 'Join these two pieces together'],
}
```

### Validator Rules

- `split_piece`: Validate pieceId exists, startPoint and endPoint are near the piece outline (< 5mm)
- `merge_pieces`: Validate both pieceIds exist, pieces have a detectable shared edge

## Files

| File | Action |
|------|--------|
| `src/utils/geometry/lineIntersect.ts` | Create — line-segment intersection utilities |
| `src/utils/geometry/splitOutline.ts` | Create — curve-preserving outline split |
| `src/utils/geometry/mergeOutline.ts` | Create — curve-preserving outline merge |
| `src/utils/geometry/__tests__/lineIntersect.test.ts` | Create |
| `src/utils/geometry/__tests__/splitOutline.test.ts` | Create |
| `src/utils/geometry/__tests__/mergeOutline.test.ts` | Create |
| `src/utils/patternOps.ts` | Modify — rewrite `splitPiece()`, add `mergePieces()` |
| `src/components/PatternEditor/useScissorsTool.ts` | Create — scissors interaction hook |
| `src/components/PatternEditor/useMergeTool.ts` | Create — merge interaction hook |
| `src/components/PatternEditor/renderers/overlays/ScissorsOverlay.tsx` | Create |
| `src/components/PatternEditor/renderers/overlays/MergeOverlay.tsx` | Create |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Modify — add overlays |
| `src/components/PatternEditor/useEditorInteractions.ts` | Modify — wire both tools |
| `src/components/PatternEditor/PatternEditor.tsx` | Modify — instantiate hooks |
| `src/tools/definitions/merge.tsx` | Create — merge tool definition |
| `src/types/types.ts` | Modify — add 'merge' to Tool2D union |
| `src/copilot/actions/actionTypes.ts` | Modify — add SplitPieceAction, MergePiecesAction |
| `src/copilot/actions/actionExecutor.ts` | Modify — implement handlers |
| `src/copilot/actions/actionValidator.ts` | Modify — add validation |
| `src/copilot/llm/actionSchemas.ts` | Modify — add schemas |
