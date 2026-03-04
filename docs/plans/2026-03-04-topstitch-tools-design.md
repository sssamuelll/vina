# Topstitch Tools — Design Document

**Epic:** #188 — CLO3D Tool Parity
**Issue:** #189 — Topstitch Tools (T, K, L, ;)
**Date:** 2026-03-04
**Status:** Approved

## Goal

Implement the full CLO3D topstitch toolset: Seamline Topstitch (;), Segment Topstitch (K), Free Topstitch (L), and Edit Topstitch (T). Topstitches are decorative/structural stitch lines on pattern pieces, stored as InternalLines.

## Data Model

Extend `InternalLineType` to include `'topstitch'`. Add `TopstitchOptions` to `InternalLine`:

```typescript
type InternalLineType = ... | 'topstitch';

interface TopstitchOptions {
  stitchType: 'straight' | 'zigzag' | 'triple';
  stitchLength: number;    // mm (default 3.0)
  offset: number;          // mm from edge (default 5.0)
  threadColor: string;     // hex (default '#333333')
  rows: number;            // parallel rows (default 1)
}

interface InternalLine {
  ...
  topstitchOptions?: TopstitchOptions;
}
```

## Tools

| Tool | Shortcut | Interaction |
|------|----------|-------------|
| Seamline Topstitch | `;` | Click a piece edge that has a seam → topstitch auto-generated at offset from edge |
| Segment Topstitch | `K` | Click 2 points on an edge → topstitch only that segment portion |
| Free Topstitch | `L` | Click points on a piece to draw a polyline → stored as topstitch |
| Edit Topstitch | `T` | Click to select existing topstitch, drag endpoints, Backspace to delete |

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/tools/definitions/topstitchSeamline.tsx` | Tool definition for Seamline Topstitch (;) |
| `src/tools/definitions/topstitchSegment.tsx` | Tool definition for Segment Topstitch (K) |
| `src/tools/definitions/topstitchFree.tsx` | Tool definition for Free Topstitch (L) |
| `src/tools/definitions/topstitchEdit.tsx` | Tool definition for Edit Topstitch (T) |
| `src/components/PatternEditor/useTopstitchTool.ts` | Shared hook for all 4 topstitch modes |
| `src/components/PatternEditor/renderers/overlays/TopstitchOverlay.tsx` | SVG overlay for topstitch preview |

### Modified Files

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `'topstitch'` to InternalLineType, add TopstitchOptions, add 4 tool IDs to Tool2D |
| `src/tools/index.ts` | Register 4 new tools |
| `src/components/PatternEditor/PatternEditor.tsx` | Instantiate hook, pass props |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Add TopstitchOverlay |
| `src/components/PatternEditor/useEditorInteractions.ts` | Wire tool hooks |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Render topstitch internals with stitch pattern |
| `src/hooks/useKeyboardShortcuts.ts` | Add T, K, L, ; shortcuts |
| `src/copilot/actions/actionTypes.ts` | Add AddTopstitchAction |
| `src/copilot/actions/actionExecutor.ts` | Handle add_topstitch |
| `src/copilot/actions/actionSchemas.ts` | Add topstitch schema for LLM |

## Visual Style (2D)

- **Straight stitch**: Dashed line — `strokeDasharray` based on stitchLength
- **Zigzag**: Small perpendicular ticks alternating left/right
- **Triple**: Three parallel dashed lines close together
- **Color**: Uses `threadColor` from options (default dark gray `#333`)
- **Offset rendering**: For seamline/segment modes, line rendered parallel to edge at `offset` distance

## Interaction Details

### Seamline Topstitch (;)
1. Hover over piece edges — highlight edges that have seams
2. Click → generate topstitch path offset from the edge
3. Topstitch stored as InternalLine with path computed from edge + offset

### Segment Topstitch (K)
1. Click point 1 on edge → snap, mark start
2. Click point 2 on same edge → snap, mark end
3. Generate topstitch for that segment at offset
4. Reuses `snapToEdge` from useSegmentSewingTool

### Free Topstitch (L)
1. Click on a piece to start
2. Click to add points (polyline)
3. Enter to confirm, Esc to cancel
4. Path stored directly as the topstitch InternalLine

### Edit Topstitch (T)
1. Click existing topstitch to select (reuse internal line selection from useEditorInteractions)
2. Drag endpoints to adjust
3. Backspace/Delete to remove
4. Tool options panel shows TopstitchOptions for editing

## Copilot Integration

Add `add_topstitch` action:
```typescript
interface AddTopstitchAction {
  type: 'add_topstitch';
  pieceId: string;
  mode: 'seamline' | 'segment' | 'free';
  edgeIndex?: number;           // for seamline
  startT?: number; endT?: number; // for segment
  points?: Point2D[];           // for free
  options?: Partial<TopstitchOptions>;
}
```
