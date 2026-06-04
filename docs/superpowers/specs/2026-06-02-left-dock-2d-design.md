# Left Dock (2D) — Side Docks Redesign, Slice 1

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the two side docks (this slice: the left / 2D dock only)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` + the live finding that `FloatingToolbar` is wired to the wrong Redux slice (its buttons highlight but do not activate tools)
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

The mounted 2D toolbar (`FloatingToolbar`) dispatches only `setActiveTool2D` (toolSlice), but the drawing engine (`PatternEditor` → `useEditorInteractions`) reads `editor.activeTool` (editorSlice) — no bridge — so clicking a tool button highlights it but does not activate the tool. Its labels are also wrong (it shows "Pen (P)" / "Rectangle (R)"; the real shortcuts are CLO3D-style: Pen=H, Rect=S). And 2D sewing has no visible affordance at all (keyboard-blind).

## 2. Goal

Two coupled goals, one keystone (reframed after Voronov's review):

1. **Converge 2D tool activation on a single writer.** `editor.activeTool` (the drawing-engine truth — what a canvas click does) and `tools.activeTool2D` (the per-tool-options key + the gate for `measure`/`walkSeam`) are two *different facts* sharing one vocabulary, not two copies. Today every activation site must remember to write both, and several do not: `FloatingToolbar` writes only `activeTool2D` (buttons highlight but never activate); `EmptyState2D`'s Draw button and the agent's `activateTool` write only `activeTool` (per-tool options/tool-memory desync; agent-activated `measure`/`walkSeam` never arm). Introduce one shared writer, `activate2DTool(id)`, that owns the pair, and route every 2D activation site through it.

2. **Replace `FloatingToolbar` with the left (2D) dock** built on that writer — a vertical, tokenized dock whose buttons actually activate tools, including a `Sew` button that closes the 2D-sew discoverability gap.

This is **Slice 1** of the side-docks section. Per Voronov: the shared writer (the convergence point) is the substance; the dock is the occasion. Deferred to later slices: the auto (✦) section, drag-to-reorder, ＋ customize, the file-ops section, the 3D (right) dock, view-sync (two/2D/3D), why-here tooltips, the signaling toggle. Truly *collapsing* the two slices into one source of truth (eliminating `activeTool2D`) remains a separate, larger refactor — distinct from this slice's single-writer convergence.

## 3. Pinned tool set

The handoff's 2D pinned set plus a `Sew` entry (the gap that motivated this section; the handoff's set omits 2D sewing entirely). Ids, icons, and shortcuts are the canonical ones from `src/hooks/useKeyboardShortcuts.ts` + `src/shortcuts/defaults.ts` — NOT the wrong labels `FloatingToolbar` showed:

| Label | `Tool2D` id | Shortcut | Lucide icon (proposed) |
|---|---|---|---|
| Select | `select` | Z | `MousePointer2` |
| Pen | `pen` | H | `PenTool` |
| Line | `line` | ⇧L | `Minus` |
| Rectangle | `rectangle` | S | `Square` |
| Scissors | `scissors` | X | `Scissors` |
| Measure | `measure` | M | `Ruler` |
| Sew | `seam` | B | `Spline` |

`Sew` maps to `Tool2D` `seam` (shortcut B, "Edit Sewing (Seam)"). The implementation plan confirms `seam` is the right primary 2D edge-join mode vs `freesewing` (F) by checking how each behaves in `useEditorInteractions`; if `freesewing` is the cleaner "click two edges → seam," use that id + shortcut F instead. The other sew modes (`segmentSewing` N, `walkSeam` ⇧M, `freesewing` F) stay on the keyboard and become auto/customize entries in later slices.

## 4. Architecture

### The keystone — a single 2D tool-activation writer

**`src/store/toolActivation.ts`** — `activate2DTool(id)`, a thunk that owns the slice pair:

```ts
export const activate2DTool = (id: string) => (dispatch: AppDispatch) => {
  dispatch(setActiveTool(id as Tool2D));  // editorSlice — the drawing-engine truth
  dispatch(setActiveTool2D(id));           // toolSlice — per-tool options key + measure/walkSeam gate
};
```

Every 2D tool-activation site dispatches `activate2DTool(id)` instead of hand-writing the pair. The `as Tool2D` cast (today scattered as `as any` across the keyboard handler, because legacy ids like `circle`/`trace`/`dart`/`pin` aren't in `Tool2D`) is centralized here once. This is the convergence point — NOT the same as unifying the slices: both slices still exist; they now move together because one writer owns them.

**Sites migrated to the writer** (this IS the convergence — without it the dock is merely the next hand-written site, and the two already-broken sites stay broken):
- `src/hooks/useKeyboardShortcuts.ts:182-216` — the ~30 `dispatch(setActiveTool(X)); dispatch(setActiveTool2D(X))` pairs collapse to `dispatch(activate2DTool(X))` (also removing the scattered `as any` casts). The 3D bindings (`tool3d.*` → `setActiveTool3D`) are untouched.
- `src/components/PatternEditor/EmptyState2D.tsx` — the Draw button's `dispatch(setActiveTool('pen'))` → `dispatch(activate2DTool('pen'))` (fixes the options/tool-memory desync). Its test updates accordingly.
- `src/copilot/action/tools/definitions/uiBridgeTools.ts` (agent `activateTool`) — its **2D** activation path routes through `activate2DTool` (fixes agent-activated `measure`/`walkSeam`). The plan reads this tool first to confirm its 2D-vs-3D branching so 3D activation (`setActiveTool3D`) is left untouched.

### The dock (built on the writer)

- **`src/components/shell/Dock.tsx`** — presentational, store-free: `{ domainLabel; tools; activeToolId; onSelectTool }`. A **single-select tool column**, named and scoped for exactly that. Per Voronov, the 3D dock's affordances are toggles + sim-transport + view-mode (not a single-select group), so this slice makes **no genericity claim**: whether Slice 2 reuses `Dock` is decided then, after reading `FloatingControls3D`.
- **`src/components/shell/dock2dTools.ts`** — `DOCK_2D_TOOLS: DockToolDef[]` (the 7 rows in §3) + the `DockToolDef` type.
- **`src/components/shell/LeftDock.tsx`** — container. Reads `editor.activeTool` + `editor.viewMode`; `onSelectTool={(id) => dispatch(activate2DTool(id))}`; renders `<Dock domainLabel="2D" …>` when `viewMode !== '3d'`. Highlight reads `editor.activeTool` (the engine truth).
- **`src/components/shell/Dock.css`** — tokenized dark chrome.
- **`src/components/shell/AppShell.tsx`** — `<FloatingToolbar />` (line ~231) → `<LeftDock />`; remove the `FloatingToolbar` import.
- **Delete `src/components/shell/FloatingToolbar.tsx`** and its dead `.floating-toolbar` CSS in `src/styles/floating.css`. It is fully replaced (UX parity except the deliberately-dropped Tab-to-hide, §8) and, left in the tree, is a working example of the wrong single-slice-write pattern — a copy-paste seed for the exact defect this slice converges away. Per the orphan-deletion protocol, replacement parity is verified, so deletion is in-scope. The generic `.icon-btn` class is left if shared (the plan greps for other consumers before removing it).

## 5. Visual (dark chrome — global tokens)

The handoff's `--chrome*/--hair/--ink*/--accent*` names are the mock's; they map to our existing dark-chrome tokens (the docks frame the light paper canvas, like `TopBar`/`UnifiedBar`):

| Element | Token |
|---|---|
| Dock container | bg `--bg-surface`, 1px `--border`, radius `--radius-xl`, float shadow `0 8px 32px rgba(0,0,0,0.4)` |
| Position | `absolute`, vertically centered (`top:50%; transform:translateY(-50%)`), `left:14px`, inside the 2D pane |
| Domain label "2D" | `--font-mono`, 10px, 700, `--text-muted`, letter-spacing .06em, not a button |
| Tool button | `--toolbar-btn` (≈38px) square, radius `--radius-md`, color `--text-secondary` |
| Tool hover | bg `--bg-elevated`, color `--text-primary` |
| Tool active (`activeToolId === id`) | bg `--accent-subtle`, color `--accent` |
| Icons | lucide, 14px stroke |

No hardcoded colors beyond the one float-shadow rgba (matching the existing drag overlay). Positioning requires a positioned ancestor: the plan verifies `.canvas-area__2d` is `position: relative` (add it if absent, as was done for `.pattern-editor`). Animation: `background`/`color` transitions only (`--transition-fast`); no loops.

## 6. Acceptance criteria

1. `activate2DTool(id)` dispatches BOTH `setActiveTool(id)` and `setActiveTool2D(id)`.
2. Every 2D tool-activation site routes through `activate2DTool`: after migration, the keyboard, the dock, the empty-state Draw button, and the agent's 2D `activateTool` each leave BOTH `editor.activeTool` and `tools.activeTool2D` equal to the activated id — no site writes only one. (Today `EmptyState2D` Draw and the agent write engine-only; this fixes both.)
3. The left dock renders in 2D and Split views with the domain label "2D" and the 7 tool buttons; it is hidden in 3D-only view.
4. Clicking a dock tool activates it in the drawing engine (both slices set) — today only `tools.activeTool2D` changed and the tool stayed inactive.
5. The active tool's button shows the active style.
6. The `Sew` button activates the 2D seam tool, making 2D sewing reachable without the keyboard.
7. Each button has an `aria-label` of "name · shortcut" (e.g. "Select · Z"); the real CLO3D shortcuts are shown, not `FloatingToolbar`'s wrong ones.
8. All colors are tokens (dark-chrome), no emoji, icons are inline lucide.
9. `FloatingToolbar` is deleted and nothing imports it; existing keyboard/empty-state/agent tests still pass after migration.
10. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Testing

- **`activate2DTool` (thunk)** — with a `vi.fn()` dispatch, `activate2DTool('measure')` dispatches both `setActiveTool('measure')` and `setActiveTool2D('measure')` (assert against the real action creators). This is the keystone regression guard.
- **`Dock` (presentational)** — RTL, no store: renders the domain label and one button per tool; clicking a button calls `onSelectTool` with that tool's id; the button whose id equals `activeToolId` has the active class; every button exposes its `aria-label`.
- **`LeftDock` (container)** — RTL + real `editor` + `tools` reducers: clicking the Sew button leaves **both** `store.getState().editor.activeTool === 'seam'` **and** `store.getState().tools.activeTool2D === 'seam'` (the convergence regression guard); the dock is absent when `editor.viewMode === '3d'`. (Mirror `FloatingControls3D.test.tsx` `renderWithStore`; include `editorReducer` + `toolsReducer`.)
- **`EmptyState2D` Draw (updated)** — the existing test changes: clicking Draw now sets BOTH `editor.activeTool === 'pen'` and `tools.activeTool2D === 'pen'` (was engine-only). Add `toolsReducer` to that test's store.
- **agent `activateTool`** — if a test exists for `uiBridgeTools`, assert a 2D activation (e.g. `measure`) now writes both slices; otherwise add a focused test. 3D activation still writes only `activeTool3D`.
- **Keyboard** — existing keyboard tests must still pass post-migration; add one guard that a representative 2D shortcut leaves both slices set (proving it routes through the writer).
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **3D-only view:** dock hidden (criterion 1), matching `FloatingToolbar`'s old `viewMode === '3d'` guard.
- **Tab-to-hide:** `FloatingToolbar` had a Tab key to toggle visibility; it is **dropped** (not in the handoff, not part of the dock model).
- **`select` is the default tool:** on load `editor.activeTool === 'select'`, so the Select button starts active — correct.
- **`line` is Shift+L, not L:** the dock shows ⇧L; this is the real binding (plain L is topstitchFree).

## 9. Out of scope

- Auto (✦) suggestion section, drag-to-reorder, ＋ customize editor, file-ops section (Import/Export in the dock), the 3D (right) dock, view-sync tweak (two/2D/3D), why-here tooltip line, signaling subtle/off toggle.
- **Collapsing** `editor.activeTool` and `tools.activeTool2D` into a single source of truth (eliminating the dual state) — a larger state refactor. This slice's single-writer *convergence* is in scope and distinct from it: convergence makes the two move together; collapsing would remove one.
- Generalizing `Dock` for the 3D side — decided in Slice 2 after reading `FloatingControls3D`.
- Fixing the CLO3D shortcut scheme itself (the dock surfaces the existing bindings; it does not redesign them).
