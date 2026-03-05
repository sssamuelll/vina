# 2D Editor Performance Optimization — Design

## Problem

In complex patterns, the 2D editor dispatches Redux actions on every `mousemove` during drag operations (~60/sec), causing full React re-render cascades. PieceRenderer lacks `React.memo`, so all pieces re-render when any one moves. Selectors use inline functions without memoization.

## Approach: Low-Hanging Fruit

Three targeted changes with high ROI and low risk.

### 1. Ref-Based Drag with Commit-on-mouseUp

**Current**: `useEditorInteractions.ts` line 450 dispatches `movePiece()` on every mousemove. Same for `setPan2D()` (line 402) and `updateInternalLine()` (line 438).

**Change**: During drag, store interim position in a ref and update the SVG `<g>` transform directly via DOM manipulation. Only dispatch the Redux action on mouseUp.

- Piece drag: set `data-piece-id` group's transform attribute directly
- Pan: update the main `<g>` transform attribute directly
- Internal line drag: update the path `d` attribute directly
- On mouseUp: dispatch final position to Redux (single action)

### 2. React.memo on PieceRenderer

**Current**: `PieceRenderer` re-renders all pieces on any state change.

**Change**: Extract each piece into a `MemoizedPiece` component wrapped in `React.memo`. Compare only the props that affect that specific piece (position, outline, isSelected, internals). When dragging piece A, pieces B/C/D skip re-render.

### 3. Memoized Selectors

**Current**: Inline `useSelector((s) => s.project)` creates new object refs every render.

**Change**: Create `src/store/selectors.ts` with `createSelector` from RTK for commonly used derived state (pieces, editor settings, selectedPieceIds). Replace inline selectors in PatternEditor.tsx and hooks.
