# Spec v2: Keyboard Shortcuts — Select All & Delete Selection (#124)

**Status:** Draft (Pending Approval)  
**Date:** March 24, 2026  
**Author:** Gemini CLI  

---

## 1. Objective
Add CAD-standard shortcuts `Ctrl + A` (Select All) and `Delete/Backspace` (Delete Selection). Implementation focuses on **atomic undo batching**, **focus-safe execution**, and **batch-aware confirmation**.

## 2. Functional Requirements

### A. Focus Guard (Critical Protection)
Shortcuts MUST only fire if `document.activeElement` is NOT an editable element:
- Not an `<input>`, `<textarea>`, or `[contenteditable="true"]`.
- This prevents `Delete` from removing pattern pieces while the user is typing in the Copilot chat or piece name inputs.

### B. Select All (`Ctrl + A`)
- **Location:** `editorSlice.ts`.
- **Logic:**
  - If `activeTool === 'select'`: Populates `selectedPieceIds` with all piece IDs in `project.pieces` that satisfy:
    - `piece.active !== false` (Visible)
    - `piece.locked !== true` (Not locked)
    - Layer is not locked (Check `project.layers[piece.layer].locked`).
  - If `activeTool === 'edit'`: Populates the point selection in the active hook state with all vertices of the currently selected piece.
- **Mutual Exclusivity:** Selecting all pieces clears `selectedSeamId` and `selectedPOMId`.

### C. Delete Selection (`Delete` / `Backspace`)
- **Batching:** Dispatches **one single batch action** to Redux.
- **Priority Logic:** (Based on `editorSlice` current state)
  1. If `selectedPieceIds.length > 0`: Dispatch `project/removePieces(selectedPieceIds)`.
  2. Else if `selectedSeamId`: Dispatch `project/removeSeam(selectedSeamId)`.
  3. Else if `selectedPOMId`: Dispatch `project/removePOM(selectedPOMId)`.
- **Confirmation:** The `confirmationMiddleware` MUST support batch actions and display a count-aware message (e.g., "Delete 5 pattern pieces?").

## 3. Implementation Strategy

### A. Action Batching & Cascading (`src/store/projectSlice.ts`)
- Add `removePieces` reducer: `(state, action: PayloadAction<string[]>)`.
- **Bulk Cascade Logic:**
  - Filter `state.pieces`.
  - Filter `state.seams` where either `pieceA` or `pieceB` is in the deleted set.
  - Filter `state.elastics`, `state.pleats`, `state.poms`, and `state.seamGroups` that reference any deleted piece ID.
- This ensures **one undo history entry** for the entire operation.

### B. Middleware Update (`src/store/confirmationMiddleware.ts`)
- Add `project/removePieces` to `DESTRUCTIVE_ACTIONS`.
- Implement dynamic title generation: `const title = action.payload.length > 1 ? `Remove ${action.payload.length} Pieces` : 'Remove Pattern Piece'`.

### C. Shortcut Logic (`src/shortcuts/useViewportShortcuts.ts`)
- Implement a `canFireShortcut()` guard.
- Bind `mod+a` and `delete/backspace`.

## 4. Verification Plan
- **Isolation Test:** Open Copilot chat, type a message, press `Delete`. Verify NO pieces are deleted.
- **Batch Undo Test:** Create 5 pieces, `Ctrl + A`, `Delete`, `Confirm`. Press `Ctrl + Z`. Verify all 5 pieces return in one step.
- **Cascading Test:** Create 2 pieces with a seam between them. Delete both via selection. Verify the seam is also removed from state.
- **Lock Test:** Lock a piece, press `Ctrl + A`. Verify the locked piece is NOT included in the selection.
