# Linked/Symmetry Editing — Design Document

**Issue:** #193 — Implement Linked/Symmetry Editing

**Goal:** CLO3D-style linked editing so users can edit one pattern piece and have changes automatically sync to its linked partner, either as a mirror (symmetry) or identical copy (instance).

---

## 1. Data Model

Two new optional fields on `PatternPiece` in `src/types/types.ts`:

```typescript
linkedPieceId?: string;              // ID of the partner piece
linkMode?: 'symmetry' | 'instance';  // mirror vs identical copy
```

**Rules:**
- Links are bidirectional — if A links to B, B links to A
- A piece can only have one link partner (no chains or groups)
- `linkMode` is the same on both sides
- Unlinking clears both pieces' `linkedPieceId` and `linkMode`

---

## 2. Middleware: linkedEditingMiddleware

Redux middleware that intercepts piece-modifying actions and propagates changes to the linked partner.

### Position in chain

After `undoMiddleware` so both pieces are captured in the same undo snapshot.

### Trigger actions

`updatePiece`, `flipPieceH`, `flipPieceV`, `addInternalLine`, `updateInternalLine`, `removeInternalLine`

### Non-synced actions (independent per piece)

`movePiece`, `rotatePiece` — positions and rotations stay independent.

### Flow

1. Let action pass through (`next(action)`)
2. Check if affected piece has `linkedPieceId`
3. If action has `__linkedSync` meta → skip (loop guard)
4. Compute partner update based on `linkMode`:
   - **Instance:** copy outline + internals directly
   - **Symmetry:** mirror geometry (reflect X coordinates around piece's bounding box center)
5. Dispatch partner update with `__linkedSync: true`

### Sync matrix

| Action | Instance | Symmetry |
|--------|----------|----------|
| `updatePiece` | Copy outline + internals | Mirror outline + internals |
| `addInternalLine` | Copy line | Mirror line |
| `updateInternalLine` | Copy line | Mirror line |
| `removeInternalLine` | Remove from partner | Remove from partner |
| `flipPieceH/V` | Copy flip | Copy flip |
| `movePiece` | No sync | No sync |
| `rotatePiece` | No sync | No sync |

### Mirror transform (symmetry mode)

Reflect all X coordinates around the piece's bounding box center:

```
newX = 2 * centerX - oldX
```

Applied to all PathCommand values (M, L, C, Q, Z) in outline and internals.

---

## 3. UI — CLO3D-style

### Visual indicator

Full piece outline color change (not a badge):
- **Symmetry linked:** light blue outline (`#64b5f6`)
- **Instance linked:** yellow-green outline (`#aed581`)
- Unlinked pieces keep default outline color

### Context menu

**Single piece selected:**
- "Clone Pattern with Linked Editing – Symmetry Pattern"
- "Clone Pattern with Linked Editing – Instance Pattern"

**Two pieces selected:**
- "Apply Linked Editing – Symmetry Pattern"
- "Apply Linked Editing – Instance Pattern"

**Linked piece selected:**
- "Remove Linked Editing"
- "Select Linked Pattern"

### Properties panel

"Linked Editing" section when a linked piece is selected:
- Link mode label (Symmetry / Instance)
- Partner piece name (clickable to select partner)
- "Remove Linked Editing" button

---

## 4. Store Actions

New reducers in `projectSlice.ts`:

- `linkPieces({ pieceIdA, pieceIdB, mode })` — sets `linkedPieceId` and `linkMode` on both pieces
- `unlinkPieces({ pieceId })` — clears `linkedPieceId` and `linkMode` on both pieces
- `cloneAsLinked({ pieceId, mode })` — duplicates piece, optionally mirrors, links both

---

## 5. Copilot Integration

### New actions

```typescript
interface LinkPiecesAction {
  action: 'link_pieces';
  pieceIdA: string;
  pieceIdB: string;
  mode: 'symmetry' | 'instance';
}

interface UnlinkPiecesAction {
  action: 'unlink_pieces';
  pieceId: string;
}
```

### Behavior

- `link_pieces`: dispatches `linkPieces` reducer
- `unlink_pieces`: dispatches `unlinkPieces` reducer
- All existing edit actions (`move_point`, `curve_edge`, etc.) auto-sync via middleware — no changes needed

### Files

- `src/copilot/actions/actionTypes.ts` — new interfaces + union + category
- `src/copilot/actions/actionValidator.ts` — validation cases
- `src/copilot/actions/actionExecutor.ts` — execution cases
- `src/copilot/llm/actionSchemas.ts` — LLM schema entries
