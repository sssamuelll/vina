# Enhanced Context Menus (CLO3D Parity) — Design

## Problem

Context menus are incomplete across all three canvases:
- **2D**: Has rotate/flip/duplicate/rename/delete with bounding-box hit test. Missing copy/paste, z-order, lock, mirror paste. Not tool-aware.
- **3D**: Context menu component exists but piece detection not wired (always targets 'background'). Camera presets missing.
- **Marker**: Right-click only rotates 90°—no menu UI.

## Approach

Match CLO3D's context menu patterns: tool-dependent 2D menus, camera presets in 3D, full piece actions including copy/paste/mirror-paste, z-order, and lock.

### 1. Type & State Changes

**PatternPiece** new fields:

```typescript
zOrder?: number;   // rendering order (higher = on top), default 0
locked?: boolean;  // prevents move/edit when true
```

**Editor clipboard state** (in editorSlice):

```typescript
clipboard: {
  pieces: PatternPiece[];  // deep copies
  mirror: boolean;
} | null
```

**New Redux actions**:

`projectSlice`:
- `bringToFront(id)`, `sendToBack(id)`, `bringForward(id)`, `sendBackward(id)`
- `lockPiece(id)`, `unlockPiece(id)`

`editorSlice`:
- `copyPieces(pieceIds)` — deep-copy selected pieces to clipboard
- `pastePieces()` — paste from clipboard with position offset
- `mirrorPastePieces()` — paste as symmetric (flip H + link)

**Keyboard shortcuts** (useKeyboardShortcuts.ts):
- `Ctrl+C` — copy selected
- `Ctrl+V` — paste
- `Ctrl+R` — mirror paste
- `Ctrl+D` — duplicate selected

### 2. 2D Context Menu — Tool-Dependent

`ContextMenuState` adds `activeTool` field. Item generation branches on active tool.

**Transform tool / default — on piece**:
- Copy (Ctrl+C)
- Paste (Ctrl+V)
- Mirror Paste (Ctrl+R)
- Rotate 90° / 180° / -90°
- Flip H / Flip V
- Order: Bring to Front / Bring Forward / Send Backward / Send to Back
- Duplicate (Ctrl+D)
- Lock / Unlock
- Rename (F2)
- Linked Editing options (existing)
- Delete (Del)

**Edit Pattern tool — on segment**:
- Convert to Curve / Convert to Line (existing)
- Delete Segment
- Split Segment

**Empty canvas — any tool**:
- Paste (if clipboard)
- Mirror Paste (if clipboard)
- Zoom to Fit
- Deselect All

### 3. 3D Context Menu — Piece Detection + Camera Presets

Wire Three.js `Raycaster` on right-click in `Viewport3D.tsx` to detect piece meshes → set `target: 'piece'` with `pieceId`.

**On piece**: Select, Reset 3D Arrangement (piece), Properties...

**On background**:
- Camera presets: Front, Back, Left, Right, Top, Bottom
- Reset Camera, Zoom to Fit
- Reset 3D Arrangement (All) (Ctrl+F)
- Toggle Avatar (Shift+A)
- Snapshot (F10)

### 4. Marker Context Menu

New `MarkerContextMenu.tsx` replaces bare rotate-on-right-click:
- Rotate 90° / 180° / -90°
- Flip Horizontal
- Lock / Unlock
- Select

### 5. PieceRenderer z-order & Lock

- Sort pieces by `zOrder` before rendering in `PieceRenderer`
- Locked pieces get a lock icon overlay
- Locked pieces skip drag interactions in `useEditorInteractions`
