# Segment Sewing — Design Document

**Epic:** #188 — CLO3D Tool Parity
**Issue:** #190 — Segment Sewing
**Date:** 2026-03-04
**Status:** Approved

## Goal

Allow users to sew partial edge segments (not just full edges) between two pattern pieces. This enables complex garment constructions like set-in sleeves, yokes, and panel inserts where only part of an edge is sewn.

## Current State

The backend infrastructure is ~95% complete:

- **Seam data model** (`types.ts`): `Seam.pieceA/pieceB` already have `edgeStart`/`edgeEnd` fields for partial edges
- **Copilot actions** (`actionTypes.ts`): `CreateSeamAction` supports `edgeA/edgeB` as `number | [number, number]`
- **Action executor** (`actionExecutor.ts`): `create_seam` handler already converts `[start, end]` ranges
- **Simulation engine** (`seamAssembly.ts`): `parameterizeEdge()` handles partial edges
- **Copilot tool** (`seamTools.ts`): `createSeamTool` already has segment params

**Missing**: UI tool hook and overlay for interactive segment selection.

## Interaction Design

### 4-Click Flow

1. **Click 1**: Click on edge A → sets segment start point (snaps to outline)
2. **Click 2**: Click further along same edge A → sets segment end point (highlight segment A)
3. **Click 3**: Click on edge B → sets segment start point on B
4. **Click 4**: Click further along same edge B → sets segment end point (highlight segment B)
5. **Enter**: Confirm and create the seam between the two segments

### Visual Feedback

- **Snap indicator**: Purple circle at snap point on edge (reuse existing snap-to-outline pattern)
- **Selected segment**: Thick colored stroke along the selected portion of the edge
- **Piece A segment**: Blue highlight
- **Piece B segment**: Green highlight
- **Preview line**: Dashed line connecting midpoints of the two segments when both are selected
- **Status text**: HintText shows current step ("Click start of first segment", "Click end of first segment", etc.)

### Edge Cases

- **Same edge clicked twice at same point**: Ignore second click
- **Click on different edge than first point**: Reset segment A start
- **Escape**: Reset to beginning
- **Backspace**: Undo last click

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/tools/definitions/segmentSewing.tsx` | Tool definition (id, name, icon, shortcut, copilot metadata) |
| `src/components/PatternEditor/useSegmentSewingTool.ts` | Tool hook with 4-click state machine |
| `src/components/PatternEditor/renderers/overlays/SegmentSewingOverlay.tsx` | SVG overlay for segment highlights |

### Modified Files

| File | Change |
|------|--------|
| `src/types/types.ts` | Add `'segmentSewing'` to `Tool2D` union |
| `src/tools/index.ts` | Register segment sewing tool |
| `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Add SegmentSewingOverlay props and render |
| `src/components/PatternEditor/PatternEditor.tsx` | Instantiate hook, pass props to overlay |
| `src/components/PatternEditor/useEditorInteractions.ts` | Wire tool hooks |
| `src/hooks/useKeyboardShortcuts.ts` | Add `N` shortcut (currently Shift+N for notch, so use different key) |

### State Machine

```
IDLE → (click edge A) → SEGMENT_A_START
SEGMENT_A_START → (click same edge A) → SEGMENT_A_COMPLETE
SEGMENT_A_COMPLETE → (click edge B) → SEGMENT_B_START
SEGMENT_B_START → (click same edge B) → READY_TO_CONFIRM
READY_TO_CONFIRM → (Enter) → dispatch addSeam → IDLE
```

### Snap-to-Outline

Reuse the `snapToOutline` pattern from `useMeasureTool.ts` / `useScissorsTool.ts`:
- `flattenPath()` to convert SVG commands to line segments
- Project mouse point onto each segment
- Return closest point within threshold (8px / zoom)

### Seam Creation

When confirmed, dispatch `addSeam` with:
```typescript
{
  pieceA: { pieceId, edgeIndex, edgeStart: t1, edgeEnd: t2 },
  pieceB: { pieceId, edgeIndex, edgeStart: t3, edgeEnd: t4 },
}
```

Where `t1-t4` are parametric values (0-1) along the respective edges.

### Copilot Integration

The existing `create_seam` copilot action already supports segment sewing via `edgeA: [start, end]` and `edgeB: [start, end]` range syntax. No additional copilot work needed.

## Shortcut Key

`N` — Segment Sewing. The existing Notch tool uses `Shift+N`, so `N` alone is available.

Wait — checking the existing shortcuts: `N` without modifiers is NOT currently assigned in the hardcoded section of `useKeyboardShortcuts.ts` (Shift+N is notch). However, notch might be registered via the tool registry with shortcut `'n'`. Need to verify during implementation and resolve any conflict.
