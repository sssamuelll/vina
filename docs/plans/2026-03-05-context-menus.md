# Enhanced Context Menus (CLO3D Parity) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CLO3D-parity context menus across all three canvases — 2D Pattern Editor, 3D Viewport, and Marker Editor — with copy/paste, z-order, lock, mirror paste, camera presets, and tool-dependent menus.

**Architecture:** Add `zOrder` and `locked` fields to `PatternPiece`. Add clipboard state to `editorSlice`. New Redux actions for z-order, lock, copy/paste. Extend existing `ContextMenu.tsx` to be tool-aware. Wire 3D raycasting for piece detection. Create `MarkerContextMenu.tsx` to replace bare rotate-on-right-click.

**Tech Stack:** React, Redux Toolkit (createSlice), Three.js (Raycaster), Vitest

---

### Task 1: Add `zOrder` and `locked` fields to PatternPiece

**Files:**
- Modify: `src/types/types.ts:24-59`
- Modify: `src/__tests__/store.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/store.test.ts`, add these tests at the end of the `describe('projectSlice', ...)` block:

```typescript
it('piece has optional zOrder and locked fields', () => {
  const store = createStore();
  const piece = makePiece('p1');
  piece.zOrder = 5;
  piece.locked = true;
  store.dispatch(addPiece(piece));
  expect(store.getState().project.pieces[0].zOrder).toBe(5);
  expect(store.getState().project.pieces[0].locked).toBe(true);
});

it('piece defaults to no zOrder or locked', () => {
  const store = createStore();
  store.dispatch(addPiece(makePiece('p1')));
  expect(store.getState().project.pieces[0].zOrder).toBeUndefined();
  expect(store.getState().project.pieces[0].locked).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/store.test.ts --reporter=verbose`
Expected: FAIL — `zOrder` property doesn't exist on `PatternPiece` type (TS error)

**Step 3: Add fields to PatternPiece type**

In `src/types/types.ts`, add these two fields inside the `PatternPiece` interface after line 56 (`linkMode`):

```typescript
  /** Rendering order in 2D canvas (higher = drawn on top). Default 0. */
  zOrder?: number;
  /** When true, piece cannot be moved/edited interactively */
  locked?: boolean;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/store.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/types.ts src/__tests__/store.test.ts
git commit -m "feat: add zOrder and locked fields to PatternPiece type"
```

---

### Task 2: Add z-order and lock Redux actions to projectSlice

**Files:**
- Modify: `src/store/projectSlice.ts:286-392`
- Modify: `src/__tests__/store.test.ts`

**Step 1: Write the failing tests**

In `src/__tests__/store.test.ts`, add at the end of `describe('projectSlice', ...)`:

```typescript
it('bringToFront sets highest zOrder', () => {
  const store = createStore();
  const p1 = makePiece('p1'); p1.zOrder = 0;
  const p2 = makePiece('p2'); p2.zOrder = 1;
  const p3 = makePiece('p3'); p3.zOrder = 2;
  store.dispatch(addPiece(p1));
  store.dispatch(addPiece(p2));
  store.dispatch(addPiece(p3));
  store.dispatch(bringToFront('p1'));
  expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(3);
});

it('sendToBack sets lowest zOrder', () => {
  const store = createStore();
  const p1 = makePiece('p1'); p1.zOrder = 2;
  const p2 = makePiece('p2'); p2.zOrder = 0;
  store.dispatch(addPiece(p1));
  store.dispatch(addPiece(p2));
  store.dispatch(sendToBack('p1'));
  expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(-1);
});

it('bringForward increments zOrder by 1', () => {
  const store = createStore();
  const p1 = makePiece('p1'); p1.zOrder = 1;
  store.dispatch(addPiece(p1));
  store.dispatch(bringForward('p1'));
  expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(2);
});

it('sendBackward decrements zOrder by 1', () => {
  const store = createStore();
  const p1 = makePiece('p1'); p1.zOrder = 3;
  store.dispatch(addPiece(p1));
  store.dispatch(sendBackward('p1'));
  expect(store.getState().project.pieces.find(p => p.id === 'p1')!.zOrder).toBe(2);
});

it('lockPiece sets locked to true', () => {
  const store = createStore();
  store.dispatch(addPiece(makePiece('p1')));
  store.dispatch(lockPiece('p1'));
  expect(store.getState().project.pieces[0].locked).toBe(true);
});

it('unlockPiece sets locked to false', () => {
  const store = createStore();
  const p1 = makePiece('p1'); p1.locked = true;
  store.dispatch(addPiece(p1));
  store.dispatch(unlockPiece('p1'));
  expect(store.getState().project.pieces[0].locked).toBe(false);
});
```

Also update the import at top of `src/__tests__/store.test.ts` to include the new actions:

```typescript
import projectReducer, {
  addPiece, updatePiece, removePiece, movePiece, rotatePiece,
  addSeam, addInternalLine, setInternalLine,
  setProjectName, loadProject, updateMeasurements,
  setAvatarMode, setAvatarModelUrl,
  bringToFront, sendToBack, bringForward, sendBackward,
  lockPiece, unlockPiece,
} from '../store/projectSlice';
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/store.test.ts --reporter=verbose`
Expected: FAIL — `bringToFront`, `sendToBack`, etc. not exported

**Step 3: Implement the reducers**

In `src/store/projectSlice.ts`, add these reducers inside the `reducers` object (after `cloneAsLinked` reducer, before the `// ─── Fabrics ───` section):

```typescript
    // ─── Z-Order ───
    bringToFront(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const maxZ = Math.max(0, ...state.pieces.map(p => p.zOrder ?? 0));
        piece.zOrder = maxZ + 1;
        state.isDirty = true;
      }
    },
    sendToBack(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const minZ = Math.min(0, ...state.pieces.map(p => p.zOrder ?? 0));
        piece.zOrder = minZ - 1;
        state.isDirty = true;
      }
    },
    bringForward(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.zOrder = (piece.zOrder ?? 0) + 1;
        state.isDirty = true;
      }
    },
    sendBackward(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.zOrder = (piece.zOrder ?? 0) - 1;
        state.isDirty = true;
      }
    },

    // ─── Lock ───
    lockPiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.locked = true;
        state.isDirty = true;
      }
    },
    unlockPiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.locked = false;
        state.isDirty = true;
      }
    },
```

Then add the new exports to the destructured exports at the bottom of the file (line ~380):

```typescript
export const {
  restoreState, loadProject, setProjectName,
  addPiece, updatePiece, removePiece, movePiece, rotatePiece, duplicatePiece, flipPieceH, flipPieceV, setArrangement3D, clearArrangementOverrides,
  addInternalLine, updateInternalLine, removeInternalLine, setInternalLine,
  upsertPieceOutline, upsertMultiplePieceOutlines,
  addSeam, removeSeam, reverseSeam,
  linkPieces, unlinkPieces, cloneAsLinked,
  bringToFront, sendToBack, bringForward, sendBackward,
  lockPiece, unlockPiece,
  addFabric, updateFabric,
  updateAvatar, updateMeasurements, setAvatarMode, setAvatarModelUrl,
} = projectSlice.actions;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/store.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/projectSlice.ts src/__tests__/store.test.ts
git commit -m "feat: add z-order and lock Redux actions to projectSlice"
```

---

### Task 3: Add clipboard state and copy/paste/mirrorPaste actions to editorSlice

**Files:**
- Modify: `src/types/types.ts:316-335` (EditorState interface)
- Modify: `src/store/editorSlice.ts`
- Modify: `src/__tests__/store.test.ts`

**Step 1: Write the failing tests**

In `src/__tests__/store.test.ts`, add a new describe block:

```typescript
describe('clipboard (editorSlice)', () => {
  it('copyPieces stores deep copies in clipboard', () => {
    const store = createStore();
    const p1 = makePiece('p1');
    p1.name = 'Front';
    store.dispatch(addPiece(p1));
    store.dispatch(copyPieces({ pieces: [p1] }));
    const clip = store.getState().editor.clipboard;
    expect(clip).not.toBeNull();
    expect(clip!.pieces).toHaveLength(1);
    expect(clip!.pieces[0].name).toBe('Front');
    // Deep copy — modifying original shouldn't affect clipboard
    expect(clip!.pieces[0].id).toBe('p1');
  });

  it('pastePieces adds new pieces with new ids and offset', () => {
    const store = createStore();
    const p1 = makePiece('p1');
    store.dispatch(addPiece(p1));
    store.dispatch(copyPieces({ pieces: [p1] }));
    store.dispatch(pastePieces());
    expect(store.getState().project.pieces).toHaveLength(2);
    const pasted = store.getState().project.pieces[1];
    expect(pasted.id).not.toBe('p1');
    expect(pasted.position.x).toBe(30); // offset from 0
    expect(pasted.position.y).toBe(30);
  });

  it('clearClipboard resets clipboard to null', () => {
    const store = createStore();
    store.dispatch(copyPieces({ pieces: [makePiece('p1')] }));
    expect(store.getState().editor.clipboard).not.toBeNull();
    store.dispatch(clearClipboard());
    expect(store.getState().editor.clipboard).toBeNull();
  });
});
```

Update the import at top to include new actions:

```typescript
import editorReducer, {
  setViewMode, setActiveTool, selectPiece, clearSelection,
  togglePieceSelection, selectSeam, setZoom2D, setPan2D,
  toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid,
  copyPieces, pastePieces, clearClipboard,
} from '../store/editorSlice';
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/store.test.ts --reporter=verbose`
Expected: FAIL — `copyPieces`, `pastePieces`, `clearClipboard` not exported

**Step 3: Add clipboard to EditorState and implement actions**

In `src/types/types.ts`, add to the `EditorState` interface (after `units: UnitSystem;` on line ~334):

```typescript
  /** Clipboard for copy/paste */
  clipboard: {
    pieces: PatternPiece[];
  } | null;
```

In `src/store/editorSlice.ts`:

1. Add `PatternPiece` to the import from types:

```typescript
import { EditorState, ViewMode, Tool2D, Point2D, UnitSystem, PatternPiece } from '../types/types';
```

2. Add `clipboard: null` to `initialState` (after `units: 'mm'`):

```typescript
  clipboard: null,
```

3. Add `addPiece` import from projectSlice:

```typescript
import { addPiece } from './projectSlice';
```

4. Add these reducers inside the `reducers` object (before the `undo()`/`redo()` reducers):

```typescript
    copyPieces(state, action: PayloadAction<{ pieces: PatternPiece[] }>) {
      state.clipboard = {
        pieces: JSON.parse(JSON.stringify(action.payload.pieces)),
      };
    },
    clearClipboard(state) {
      state.clipboard = null;
    },
    // pastePieces is handled as a thunk-like pattern — see extraReducers
```

5. `pastePieces` needs access to both `editor.clipboard` and `project.pieces`, so it must be implemented differently. Since we're using Redux Toolkit slices (no thunks), implement paste as a standalone action creator that dispatches `addPiece` for each clipboard piece. Instead, add `pastePieces` as a simple reducer that just returns — the actual paste logic will be done inline in the keyboard handler and context menu (dispatch `addPiece` for each cloned piece).

Actually, let's keep it simple. `pastePieces` will be a **no-op action** that the keyboard shortcut handler will listen for. The actual paste logic lives in the component/hook, which reads `clipboard` from state and dispatches `addPiece` for each piece. This avoids cross-slice dependencies.

So instead, make `pastePieces` a no-op placeholder action (we'll remove it), and the paste logic will be a utility:

```typescript
    copyPieces(state, action: PayloadAction<{ pieces: PatternPiece[] }>) {
      state.clipboard = {
        pieces: JSON.parse(JSON.stringify(action.payload.pieces)),
      };
    },
    clearClipboard(state) {
      state.clipboard = null;
    },
```

Then create a utility function exported from editorSlice:

```typescript
/**
 * Generate paste payloads from clipboard pieces.
 * Returns new PatternPiece objects with fresh IDs and offset positions.
 * Caller dispatches addPiece() for each one.
 */
export function createPastedPieces(clipboard: { pieces: PatternPiece[] }, mirror = false): PatternPiece[] {
  return clipboard.pieces.map(p => {
    const clone: PatternPiece = JSON.parse(JSON.stringify(p));
    clone.id = `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    clone.name = `${p.name} (${mirror ? 'mirror' : 'copy'})`;
    clone.position = {
      x: (p.position?.x ?? 0) + 30,
      y: (p.position?.y ?? 0) + 30,
    };
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    clone.linkedPieceId = undefined;
    clone.linkMode = undefined;
    return clone;
  });
}
```

Update the test accordingly — `pastePieces` is no longer a Redux action, so use the utility function directly:

```typescript
describe('clipboard (editorSlice)', () => {
  it('copyPieces stores deep copies in clipboard', () => {
    const store = createStore();
    const p1 = makePiece('p1');
    p1.name = 'Front';
    store.dispatch(addPiece(p1));
    store.dispatch(copyPieces({ pieces: [p1] }));
    const clip = store.getState().editor.clipboard;
    expect(clip).not.toBeNull();
    expect(clip!.pieces).toHaveLength(1);
    expect(clip!.pieces[0].name).toBe('Front');
  });

  it('createPastedPieces generates new pieces with offset', () => {
    const p1 = makePiece('p1');
    const pasted = createPastedPieces({ pieces: [p1] });
    expect(pasted).toHaveLength(1);
    expect(pasted[0].id).not.toBe('p1');
    expect(pasted[0].position.x).toBe(30);
    expect(pasted[0].position.y).toBe(30);
    expect(pasted[0].name).toContain('copy');
  });

  it('createPastedPieces with mirror flag', () => {
    const p1 = makePiece('p1');
    const pasted = createPastedPieces({ pieces: [p1] }, true);
    expect(pasted[0].name).toContain('mirror');
  });

  it('clearClipboard resets clipboard to null', () => {
    const store = createStore();
    store.dispatch(copyPieces({ pieces: [makePiece('p1')] }));
    expect(store.getState().editor.clipboard).not.toBeNull();
    store.dispatch(clearClipboard());
    expect(store.getState().editor.clipboard).toBeNull();
  });
});
```

Update the import:

```typescript
import editorReducer, {
  setViewMode, setActiveTool, selectPiece, clearSelection,
  togglePieceSelection, selectSeam, setZoom2D, setPan2D,
  toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid,
  copyPieces, clearClipboard, createPastedPieces,
} from '../store/editorSlice';
```

Add the exports to `editorSlice.actions`:

```typescript
export const {
  setViewMode, setActiveTool,
  selectPiece, togglePieceSelection, clearSelection, selectAllPieces, selectSeam, selectInternalLine,
  setZoom2D, setPan2D,
  toggleSeamAllowance, setDefaultSAWidth, toggleGrainlines, toggleSnapToGrid, setGridSize, toggleAnchorPoints,
  togglePieceNames, toggleLineLengths, toggleSewingLines, setRenderMode2D,
  setUnits,
  copyPieces, clearClipboard,
  undo, redo,
} = editorSlice.actions;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/store.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/types.ts src/store/editorSlice.ts src/__tests__/store.test.ts
git commit -m "feat: add clipboard state and copy/paste utilities to editorSlice"
```

---

### Task 4: Add keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+R, Ctrl+D)

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts:14-24,66-125`

**Step 1: Add imports**

Add to the imports at the top of `src/hooks/useKeyboardShortcuts.ts`:

```typescript
import { copyPieces, createPastedPieces } from '../store/editorSlice';
import { addPiece, duplicatePiece, flipPieceH, linkPieces } from '../store/projectSlice';
```

Update the existing `removePiece, reverseSeam` import to include the new actions:

```typescript
import { removePiece, reverseSeam, addPiece, duplicatePiece, flipPieceH, linkPieces } from '../store/projectSlice';
```

**Step 2: Add clipboard selector**

Add after the existing `useSelector` calls (around line 59):

```typescript
const clipboard = useSelector((s: RootState) => s.editor.clipboard);
```

**Step 3: Add shortcut handlers**

In the `handler` function, add these cases after the `Ctrl+Z` / `Ctrl+Y` redo block (before the `// ─── Selection shortcuts ───` comment):

```typescript
      // Ctrl+C — Copy selected pieces
      if (ctrl && key === 'c' && !shift) {
        e.preventDefault();
        if (selectedPieceIds.length > 0) {
          const selectedPieces = pieces.filter(p => selectedPieceIds.includes(p.id));
          if (selectedPieces.length > 0) {
            dispatch(copyPieces({ pieces: selectedPieces }));
          }
        }
        return;
      }

      // Ctrl+V — Paste
      if (ctrl && key === 'v' && !shift) {
        e.preventDefault();
        if (clipboard) {
          const newPieces = createPastedPieces(clipboard);
          for (const p of newPieces) {
            dispatch(addPiece(p));
          }
        }
        return;
      }

      // Ctrl+R — Mirror Paste (CLO3D convention)
      if (ctrl && key === 'r' && !shift) {
        e.preventDefault();
        if (clipboard) {
          const newPieces = createPastedPieces(clipboard, true);
          for (const p of newPieces) {
            // Flip horizontally for mirror
            dispatch(addPiece(p));
            dispatch(flipPieceH(p.id));
          }
        }
        return;
      }

      // Ctrl+D — Duplicate selected
      if (ctrl && key === 'd' && !shift) {
        e.preventDefault();
        for (const id of selectedPieceIds) {
          dispatch(duplicatePiece(id));
        }
        return;
      }
```

**Step 4: Add to shortcut map**

Add in the `_shortcutMap` array (in the `// Edit` section):

```typescript
      { key: 'C', ctrl: true, label: 'Copy', category: 'Edit', action: () => {} },
      { key: 'V', ctrl: true, label: 'Paste', category: 'Edit', action: () => {} },
      { key: 'R', ctrl: true, label: 'Mirror Paste', category: 'Edit', action: () => {} },
      { key: 'D', ctrl: true, label: 'Duplicate', category: 'Edit', action: () => {} },
```

**Step 5: Add `clipboard` to useEffect dependency array**

Update the dependency array of the `useEffect` containing the `handler` (around line 385):

```typescript
  }, [dispatch, pieces, selectedPieceIds, selectedSeamId, simulationState, viewMode3D, avatar, projectState, viewMode, toolShortcuts, clipboard]);
```

**Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 7: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add Ctrl+C/V/R/D keyboard shortcuts for copy/paste/mirror/duplicate"
```

---

### Task 5: Enhance 2D ContextMenu with tool-awareness, copy/paste, z-order, lock

**Files:**
- Modify: `src/components/PatternEditor/ContextMenu.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.tsx:96-147` (pass activeTool and clipboard to ContextMenu)

**Step 1: Update ContextMenuState and ContextMenuProps**

In `src/components/PatternEditor/ContextMenu.tsx`:

Add to the imports:

```typescript
import {
  removePiece,
  rotatePiece,
  duplicatePiece,
  flipPieceH,
  flipPieceV,
  linkPieces,
  unlinkPieces,
  cloneAsLinked,
  bringToFront, sendToBack, bringForward, sendBackward,
  lockPiece, unlockPiece,
  addPiece,
} from '../../store/projectSlice';
import { selectPiece, clearSelection, copyPieces, createPastedPieces } from '../../store/editorSlice';
import { computeFitView, setZoom2D, setPan2D } from '../../store/editorSlice';
```

Update `ContextMenuState`:

```typescript
export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  pieceId: string | null;
  pieceName?: string;
  segmentIndex?: number;
  segmentIsCurve?: boolean;
  /** Current active tool — determines which menu items to show */
  activeTool?: string;
}
```

Update `ContextMenuProps`:

```typescript
interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onRename?: (pieceId: string) => void;
  onConvertSegment?: (commandIndex: number, toCurve: boolean) => void;
  onZoomToFit?: () => void;
}
```

**Step 2: Add new menu items inside the component**

In the `ContextMenu` function body, add after the existing `pieces` and `selectedPieceIds` selectors:

```typescript
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);
```

Then, restructure the `items` array generation. In the `if (menu.pieceId)` block, add copy/paste, z-order, and lock items. The full piece context menu should be:

```typescript
  if (menu.pieceId) {
    const pid = menu.pieceId;
    const piece = pieces.find(p => p.id === pid);
    const currentRotation = piece?.rotation ?? 0;

    // ── Copy/Paste ──
    items.push({
      label: 'Copy',
      icon: '📋',
      shortcut: 'Ctrl+C',
      action: () => act(() => {
        if (piece) dispatch(copyPieces({ pieces: [piece] }));
      }),
    });
    if (clipboard) {
      items.push({
        label: 'Paste',
        icon: '📄',
        shortcut: 'Ctrl+V',
        action: () => act(() => {
          const newPieces = createPastedPieces(clipboard);
          for (const p of newPieces) dispatch(addPiece(p));
        }),
      });
      items.push({
        label: 'Mirror Paste',
        icon: '🪞',
        shortcut: 'Ctrl+R',
        action: () => act(() => {
          const newPieces = createPastedPieces(clipboard, true);
          for (const p of newPieces) {
            dispatch(addPiece(p));
            dispatch(flipPieceH(p.id));
          }
        }),
        separator: true,
      });
    } else {
      items.push({ label: 'Paste', icon: '📄', shortcut: 'Ctrl+V', action: () => {}, separator: true });
    }

    // ── Rotate / Flip ── (existing, keep as-is)
    items.push({
      label: 'Rotate 90°', icon: '↻', shortcut: 'R',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation + 90 }))),
    });
    items.push({
      label: 'Rotate 180°', icon: '↻',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation + 180 }))),
    });
    items.push({
      label: 'Rotate -90°', icon: '↺',
      action: () => act(() => dispatch(rotatePiece({ id: pid, rotation: currentRotation - 90 }))),
      separator: true,
    });
    items.push({
      label: 'Flip Horizontal', icon: '↔', shortcut: 'H',
      action: () => act(() => dispatch(flipPieceH(pid))),
    });
    items.push({
      label: 'Flip Vertical', icon: '↕', shortcut: 'V',
      action: () => act(() => dispatch(flipPieceV(pid))),
      separator: true,
    });

    // ── Z-Order ──
    items.push({
      label: 'Bring to Front', icon: '⬆',
      action: () => act(() => dispatch(bringToFront(pid))),
    });
    items.push({
      label: 'Bring Forward', icon: '↑',
      action: () => act(() => dispatch(bringForward(pid))),
    });
    items.push({
      label: 'Send Backward', icon: '↓',
      action: () => act(() => dispatch(sendBackward(pid))),
    });
    items.push({
      label: 'Send to Back', icon: '⬇',
      action: () => act(() => dispatch(sendToBack(pid))),
      separator: true,
    });

    // ── Duplicate ──
    items.push({
      label: 'Duplicate', icon: '⧉', shortcut: 'Ctrl+D',
      action: () => act(() => dispatch(duplicatePiece(pid))),
    });

    // ── Lock/Unlock ──
    items.push({
      label: piece?.locked ? 'Unlock' : 'Lock',
      icon: piece?.locked ? '🔓' : '🔒',
      action: () => act(() => {
        if (piece?.locked) dispatch(unlockPiece(pid));
        else dispatch(lockPiece(pid));
      }),
    });

    // ── Rename ──
    items.push({
      label: 'Rename…', icon: '✏️', shortcut: 'F2',
      action: () => act(() => onRename?.(pid)),
      separator: true,
    });

    // ── Linked Editing (existing logic, keep as-is) ──
    // ... (keep the existing linked editing section)

    // ── Select ──
    items.push({
      label: 'Select', icon: '☐',
      action: () => act(() => dispatch(selectPiece(pid))),
    });

    // ── Delete ──
    items.push({
      label: 'Delete', icon: '🗑', shortcut: 'Del',
      action: () => act(() => dispatch(removePiece(pid))),
      danger: true,
    });
  }
```

For the empty canvas context, add paste and zoom to fit:

```typescript
  } else {
    // ── Empty canvas context ──
    if (clipboard) {
      items.push({
        label: 'Paste', icon: '📄', shortcut: 'Ctrl+V',
        action: () => act(() => {
          const newPieces = createPastedPieces(clipboard);
          for (const p of newPieces) dispatch(addPiece(p));
        }),
      });
      items.push({
        label: 'Mirror Paste', icon: '🪞', shortcut: 'Ctrl+R',
        action: () => act(() => {
          const newPieces = createPastedPieces(clipboard, true);
          for (const p of newPieces) {
            dispatch(addPiece(p));
            dispatch(flipPieceH(p.id));
          }
        }),
        separator: true,
      });
    }
    items.push({
      label: 'Zoom to Fit', icon: '🔍',
      action: () => act(() => onZoomToFit?.()),
    });
    items.push({
      label: 'Deselect All', icon: '☐', shortcut: 'Esc',
      action: () => act(() => dispatch(clearSelection())),
    });
  }
```

**Step 3: Update PatternEditor.tsx to pass activeTool to ContextMenu**

In `src/components/PatternEditor/PatternEditor.tsx`, update the `setCtxMenu` call in `handleContextMenu` (around line 138) to include `activeTool`:

```typescript
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pieceId: hitPiece?.id ?? null,
      pieceName: hitPiece?.name,
      segmentIndex,
      segmentIsCurve,
      activeTool,
    });
```

Add a `handleZoomToFit` callback and pass it to ContextMenu:

```typescript
  const handleZoomToFit = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || pieces.length === 0) return;
    const rect = svgEl.getBoundingClientRect();
    const fit = computeFitView(pieces, rect.width, rect.height);
    if (fit) {
      dispatch(setZoom2D(fit.zoom));
      dispatch(setPan2D(fit.pan));
    }
  }, [pieces, dispatch, svgRef]);
```

You'll need to import `computeFitView`, `setZoom2D`, `setPan2D` — `setZoom2D` and `setPan2D` are already imported from editorSlice. Just add `computeFitView`:

```typescript
import { computeFitView } from '../../store/editorSlice';
```

Then pass to ContextMenu:

```typescript
      <ContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onRename={(id) => setEditingPieceNameId(id)}
        onConvertSegment={(idx, toCurve) => editPatternTool.convertSegment(idx, toCurve)}
        onZoomToFit={handleZoomToFit}
      />
```

**Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/components/PatternEditor/ContextMenu.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat: enhance 2D context menu with copy/paste, z-order, lock, zoom to fit"
```

---

### Task 6: Sort pieces by zOrder in PieceRenderer

**Files:**
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:285-323`

**Step 1: Sort pieces by zOrder before rendering**

In `src/components/PatternEditor/renderers/PieceRenderer.tsx`, in the `PieceRenderer` function body, sort pieces before mapping:

```typescript
export default function PieceRenderer({ pieces, ...rest }: PieceRendererProps) {
  const sortedPieces = useMemo(
    () => [...pieces].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)),
    [pieces],
  );

  return (
    <>
      {sortedPieces.map(piece => (
        <SinglePiece
          key={piece.id}
          piece={piece}
          isSelected={rest.selectedPieceIds.includes(piece.id)}
          // ... rest of props
        />
      ))}
    </>
  );
}
```

Add `useMemo` to the import: `import { memo, useMemo } from 'react';`

**Step 2: Add lock icon overlay to SinglePiece**

In the `SinglePiece` component, add after the piece name rendering block (around line 244):

```typescript
      {piece.locked && (
        <text
          x={cx}
          y={cy + 14 / zoom2D}
          fontSize={10 / zoom2D}
          fill="#ff9800"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          fontFamily="Inter, sans-serif"
        >
          🔒
        </text>
      )}
```

Where `cx`/`cy` are the outline center already computed at line 71.

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/PatternEditor/renderers/PieceRenderer.tsx
git commit -m "feat: sort pieces by zOrder and show lock icon overlay"
```

---

### Task 7: Guard locked pieces from drag in useEditorInteractions

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:390-419`

**Step 1: Add locked check to piece drag initiation**

In `src/components/PatternEditor/useEditorInteractions.ts`, in the `handleMouseDown` callback, find the line where `dragRef.current` is set for piece dragging (around line 413):

```typescript
          dragRef.current = { pieceId, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...piece.position } };
```

Wrap it with a locked check:

```typescript
          if (!piece.locked) {
            dragRef.current = { pieceId, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...piece.position } };
          }
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat: prevent dragging locked pieces in 2D editor"
```

---

### Task 8: Enhance 3D ContextMenu with camera presets

**Files:**
- Modify: `src/components/Viewport3D/ContextMenu3D.tsx`
- Modify: `src/components/Viewport3D/Viewport3D.tsx:120-148,394-406`

**Step 1: Add camera preset callbacks to ContextMenu3D**

In `src/components/Viewport3D/ContextMenu3D.tsx`, update `ContextMenu3DProps`:

```typescript
interface ContextMenu3DProps {
  menu: ContextMenu3DState;
  onClose: () => void;
  onResetCamera?: () => void;
  onToggleAvatar?: () => void;
  onSnapshot?: () => void;
  onSelectPiece?: (pieceId: string) => void;
  onResetArrangement?: () => void;
  onZoomToFit?: () => void;
  onCameraPreset?: (preset: string) => void;
}
```

Update the function signature to accept the new props:

```typescript
export default function ContextMenu3D({
  menu, onClose, onResetCamera, onToggleAvatar, onSnapshot,
  onSelectPiece, onResetArrangement, onZoomToFit, onCameraPreset,
}: ContextMenu3DProps) {
```

Replace the background menu items section with:

```typescript
  } else {
    // Background
    // ── Camera Presets ──
    const presets = [
      { label: 'Front', key: 'front', shortcut: 'Num2' },
      { label: 'Back', key: 'back', shortcut: 'Num8' },
      { label: 'Left', key: 'left', shortcut: 'Num6' },
      { label: 'Right', key: 'right', shortcut: 'Num4' },
      { label: 'Top', key: 'top', shortcut: 'Num5' },
      { label: 'Bottom', key: 'bottom', shortcut: 'Num0' },
    ];
    for (const preset of presets) {
      items.push({
        label: preset.label,
        icon: '📷',
        shortcut: preset.shortcut,
        action: () => act(() => onCameraPreset?.(preset.key)),
        separator: preset.key === 'bottom',
      });
    }

    items.push({
      label: 'Reset Camera',
      icon: '🎥',
      action: () => act(() => onResetCamera?.()),
    });
    items.push({
      label: 'Zoom to Fit',
      icon: '🔍',
      action: () => act(() => onZoomToFit?.()),
      separator: true,
    });

    items.push({
      label: 'Toggle Avatar',
      icon: '👤',
      shortcut: 'Shift+A',
      action: () => act(() => onToggleAvatar?.()),
    });
    items.push({
      label: 'Reset 3D Arrangement',
      icon: '↩',
      shortcut: 'Ctrl+F',
      action: () => act(() => onResetArrangement?.()),
      separator: true,
    });
    items.push({
      label: 'Snapshot',
      icon: '📸',
      shortcut: 'F10',
      action: () => act(() => onSnapshot?.()),
    });
  }
```

**Step 2: Wire camera presets in Viewport3D.tsx**

In `src/components/Viewport3D/Viewport3D.tsx`, update the `<ContextMenu3D>` JSX to pass the new callbacks:

```typescript
      <ContextMenu3D
        menu={ctxMenu}
        onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
        onResetCamera={handleResetCamera}
        onToggleAvatar={() => setAvatarHidden(h => !h)}
        onSnapshot={snapshot3D}
        onSelectPiece={(id) => dispatch(selectPiece(id))}
        onResetArrangement={() => {
          dispatch(resetSimulation());
          dispatch(setViewMode3D('arrange'));
          dispatch(clearArrangementSnapshot());
        }}
        onZoomToFit={() => handleResetCamera()}
        onCameraPreset={(preset) => cameraPresets.setCameraView(preset as any)}
      />
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/Viewport3D/ContextMenu3D.tsx src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat: add camera presets and zoom to fit to 3D context menu"
```

---

### Task 9: Create MarkerContextMenu component

**Files:**
- Create: `src/components/MarkerEditor/MarkerContextMenu.tsx`
- Modify: `src/components/MarkerEditor/MarkerPiece.tsx:4-13,38-47,105-108,118-123`
- Modify: `src/components/MarkerEditor/MarkerEditor.tsx:240-253`

**Step 1: Create MarkerContextMenu.tsx**

Create `src/components/MarkerEditor/MarkerContextMenu.tsx`:

```typescript
import { useCallback, useEffect, useRef } from 'react';

export interface MarkerContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  pieceIndex: number | null;
  pieceName?: string;
}

interface MarkerContextMenuProps {
  menu: MarkerContextMenuState;
  onClose: () => void;
  onRotate: (degrees: number) => void;
  onFlipH?: () => void;
  onSelect?: () => void;
}

interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  separator?: boolean;
}

export default function MarkerContextMenu({
  menu, onClose, onRotate, onFlipH, onSelect,
}: MarkerContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu.visible, onClose]);

  const act = useCallback((fn: () => void) => {
    fn();
    onClose();
  }, [onClose]);

  if (!menu.visible || menu.pieceIndex === null) return null;

  const items: MenuItem[] = [
    { label: 'Rotate 90°', icon: '↻', action: () => act(() => onRotate(90)) },
    { label: 'Rotate 180°', icon: '↻', action: () => act(() => onRotate(180)) },
    { label: 'Rotate -90°', icon: '↺', action: () => act(() => onRotate(-90)), separator: true },
    { label: 'Flip Horizontal', icon: '↔', action: () => act(() => onFlipH?.()), separator: true },
    { label: 'Select', icon: '☐', action: () => act(() => onSelect?.()) },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 10000,
        minWidth: 160,
        background: '#1e1e1e',
        border: '1px solid #3a3a3a',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        padding: '4px 0',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontSize: 13,
        color: '#e0e0e0',
        userSelect: 'none',
      }}
    >
      {menu.pieceName && (
        <div style={{
          padding: '6px 12px 4px',
          fontSize: 11,
          color: '#888',
          borderBottom: '1px solid #333',
          marginBottom: 2,
        }}>
          {menu.pieceName}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={item.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '6px 12px',
              border: 'none',
              background: 'transparent',
              color: '#e0e0e0',
              cursor: 'pointer',
              fontSize: 13,
              textAlign: 'left',
              gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2d2d2d')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
          {item.separator && (
            <div style={{ height: 1, background: '#333', margin: '2px 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Update MarkerPiece to emit context menu event instead of direct rotate**

In `src/components/MarkerEditor/MarkerPiece.tsx`:

Add a new prop to `MarkerPieceProps`:

```typescript
export interface MarkerPieceProps {
  piece: PlacedPiece;
  index: number;
  isSelected: boolean;
  hasCollision: boolean;
  onSelect: (index: number) => void;
  onDrag: (index: number, newPos: [number, number]) => void;
  onRotate: (index: number, degrees: number) => void;
  onContextMenu?: (index: number, e: React.MouseEvent) => void;
  gridSnap?: number;
}
```

Update the function signature and `handleContextMenu`:

```typescript
export default function MarkerPiece({
  piece, index, isSelected, hasCollision,
  onSelect, onDrag, onRotate, onContextMenu, gridSnap,
}: MarkerPieceProps) {
```

```typescript
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (onContextMenu) {
      onContextMenu(index, e);
    } else {
      onRotate(index, 90);
    }
  }, [index, onRotate, onContextMenu]);
```

**Step 3: Wire MarkerContextMenu in MarkerEditor.tsx**

In `src/components/MarkerEditor/MarkerEditor.tsx`:

Add import:

```typescript
import MarkerContextMenu, { type MarkerContextMenuState } from './MarkerContextMenu';
```

Add `useState` to the import from react:

```typescript
import { useCallback, useMemo, useState } from 'react';
```

Add state inside `MarkerEditor`:

```typescript
  const [markerCtxMenu, setMarkerCtxMenu] = useState<MarkerContextMenuState>({
    visible: false, x: 0, y: 0, pieceIndex: null,
  });
```

Add handler:

```typescript
  const handlePieceContextMenu = useCallback((pageIndex: number, pieceIndex: number, e: React.MouseEvent) => {
    const piece = layout?.pages[pageIndex]?.pieces[pieceIndex];
    setMarkerCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pieceIndex,
      pieceName: piece?.pieceName,
    });
    // Store page index for rotate/flip
    markerCtxPageRef.current = pageIndex;
  }, [layout]);

  const markerCtxPageRef = useRef(0);
```

Add `useRef` to the import from react:

```typescript
import { useCallback, useMemo, useState, useRef } from 'react';
```

Update the `<MarkerPiece>` component in the JSX to pass `onContextMenu`:

```typescript
                <MarkerPiece
                  key={`${piece.pieceId}-${pieceIndex}`}
                  piece={piece}
                  index={pieceIndex}
                  isSelected={selectedPieceIndex?.page === pageIndex && selectedPieceIndex?.piece === pieceIndex}
                  hasCollision={collisionMap.get(`${pageIndex}-${pieceIndex}`) ?? false}
                  onSelect={(idx) => dispatch(selectPiece({ page: pageIndex, piece: idx }))}
                  onDrag={(idx, pos) => handleDrag(pageIndex, idx, pos)}
                  onRotate={(idx, deg) => handleRotate(pageIndex, idx, deg)}
                  onContextMenu={(idx, e) => handlePieceContextMenu(pageIndex, idx, e)}
                  gridSnap={showGrid ? gridSpacing : undefined}
                />
```

Add `MarkerContextMenu` at the end of the component, after the closing `</div>` of the canvas area but before the final `</div>`:

```typescript
      <MarkerContextMenu
        menu={markerCtxMenu}
        onClose={() => setMarkerCtxMenu(m => ({ ...m, visible: false }))}
        onRotate={(deg) => {
          if (markerCtxMenu.pieceIndex !== null) {
            dispatch(rotatePiece({ pageIndex: markerCtxPageRef.current, pieceIndex: markerCtxMenu.pieceIndex, degrees: deg }));
          }
        }}
        onFlipH={() => {
          // Marker flip not yet supported in markerSlice — placeholder
        }}
        onSelect={() => {
          if (markerCtxMenu.pieceIndex !== null) {
            dispatch(selectPiece({ page: markerCtxPageRef.current, piece: markerCtxMenu.pieceIndex }));
          }
        }}
      />
```

**Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/components/MarkerEditor/MarkerContextMenu.tsx src/components/MarkerEditor/MarkerPiece.tsx src/components/MarkerEditor/MarkerEditor.tsx
git commit -m "feat: add context menu to Marker Editor with rotate/flip/select"
```

---

### Task 10: Run full test suite and verify

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 2: Run tests**

Run: `npx vitest run --reporter=verbose`
Expected: all tests pass

**Step 3: Browser verification**

Run: `npm run dev`

Verify in browser:
1. **2D**: Right-click on a piece → should see Copy, Paste, Rotate, Flip, Order submenu, Duplicate, Lock/Unlock, Rename, Delete
2. **2D**: Right-click on empty canvas → should see Paste (if copied), Zoom to Fit, Deselect All
3. **2D**: Ctrl+C a piece, then Ctrl+V → should paste with offset
4. **2D**: Lock a piece via context menu → should show 🔒 icon, should not be draggable
5. **2D**: z-order: Bring to Front → piece renders on top
6. **3D**: Right-click background → should see camera presets (Front, Back, Left, Right, Top, Bottom), Reset Camera, Toggle Avatar, Snapshot
7. **Marker**: Right-click on piece → should see Rotate 90°/180°/-90°, Flip, Select (not just bare rotate)

**Step 4: Commit design doc update**

```bash
git add docs/plans/2026-03-05-context-menus-design.md docs/plans/2026-03-05-context-menus.md
git commit -m "docs: add context menus implementation plan"
```
