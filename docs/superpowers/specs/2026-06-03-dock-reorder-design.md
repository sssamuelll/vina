# Dock Tool Reorder (native drag) — Side Docks Redesign, Slice 4b

**Date:** 2026-06-03
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: drag-to-reorder the left dock's tools)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §2 ("Fijadas … arrastra para reordenar. Zona de músculo-memoria") + §9 ("falta implementar drag-to-reorder real … persistir el orden por usuario")
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

Slice 4 made the left (2D) dock's tool set editable (`tools2d` membership) but rendered it in fixed **catalog order**. The handoff's §2/§9 wants the user to **drag tools to reorder** their dock — muscle-memory placement — with the order persisted. This slice makes `tools2d` order the render order and adds native HTML5 drag-to-reorder on the dock buttons.

## 2. Goal

Let the user drag a left-dock tool button to a new position; the dock renders in the user's order, persisted across sessions and projects. No new dependency (native HTML5 drag-and-drop). Drag coexists with the existing click-to-activate (the browser distinguishes a click from a drag). The ＋ editor button and the auto-zone (✦/📌) are not draggable.

Out of scope: touch-drag, keyboard reorder, animated transitions, and reordering the auto-zone or the 3D dock.

## 3. Render-order change

Today `LeftDock` renders `DOCK_2D_CATALOG.filter((t) => tools2d.includes(t.id))` — fixed catalog order. This slice changes it to render in **`tools2d` order**:

```ts
const tools = tools2d
  .map(getDockToolById)
  .filter((t): t is DockToolDef => t !== undefined);
```

- The default `tools2d` is `DEFAULT_DOCK_2D_IDS` (the 7 in their canonical order), so the default dock is visually unchanged.
- Adding a tool via the ＋ picker (`addDockTool` appends to `tools2d`) now places it at the **end** of the dock (insertion order) rather than its catalog slot — the expected behavior for a user-ordered dock.
- `resetDockTools` restores `DEFAULT_DOCK_2D_IDS`, which also restores the default order.
- A persisted id no longer in the catalog resolves to `undefined` and is dropped by the `.filter` (unchanged robustness from slice 4).

This does not change the slice-4 catalog tests (they assert `DOCK_2D_CATALOG` order, untouched) nor the slice-4 LeftDock tests (they assert tool **presence** after add/remove, not order).

## 4. State

Add one reducer to **`src/store/dockSlice.ts`**:

```ts
reorderDockTool(state, action: PayloadAction<{ fromId: string; toId: string }>) {
  const { fromId, toId } = action.payload;
  if (fromId === toId) return;
  const from = state.tools2d.indexOf(fromId);
  const to = state.tools2d.indexOf(toId);
  if (from === -1 || to === -1) return; // unknown id → no-op
  state.tools2d.splice(from, 1);
  const insertAt = state.tools2d.indexOf(toId); // recompute after removal
  state.tools2d.splice(insertAt, 0, fromId);
}
```

- After removing `fromId`, it is re-inserted at `toId`'s (recomputed) index — so **`fromId` lands immediately before `toId`** in the resulting array (`toId` shifts one slot later). This is the "insert at the drop target" convention: an upward drag (drop onto a higher item) places the dragged tool just above the target; a downward drag places it just above the target as well (one slot before where it was dropped). Predictable and symmetric.
- No-op when `fromId === toId` or either id is absent.
- Export `reorderDockTool` from `dockSlice.actions`. No schema change (`tools2d` already persists; reorder only mutates order). No `STORAGE_VERSION` bump. `rehydrateDocks` already copies `tools2d` whole.

## 5. Native drag wiring

**`src/components/shell/Dock.tsx`** gains an optional callback:

```ts
onReorderTool?: (fromId: string, toId: string) => void;
```

When provided, each tool button becomes a drag source + drop target:

- `draggable` (only when `onReorderTool` is set).
- `onDragStart`: `e.dataTransfer.setData('text/plain', tool.id); e.dataTransfer.effectAllowed = 'move';` and set a local "dragging id" so the source can show `.dock__tool--dragging`.
- `onDragOver`: `e.preventDefault(); e.dataTransfer.dropEffect = 'move';` (required to allow a drop) and mark the hovered target with `.dock__tool--drop-target`.
- `onDragLeave`: clear the target highlight.
- `onDrop`: `e.preventDefault();` read `const fromId = e.dataTransfer.getData('text/plain');` then `if (fromId && fromId !== tool.id) onReorderTool(fromId, tool.id);`. Clear highlight + dragging state.
- `onDragEnd`: clear dragging + target state.

The dragging/target highlight is local component state in `Dock` (a `draggingId` and a `dropTargetId` `useState`), reset on drop/end — it is presentation-only, not in Redux. Because `Dock` is presentational and 2D-only (the only consumer is `LeftDock`; `RightDock` uses `DockShell` directly), this drag state lives cleanly in `Dock`.

**`src/components/shell/LeftDock.tsx`** passes `onReorderTool={(fromId, toId) => dispatch(reorderDockTool({ fromId, toId }))}` and renders `tools2d`-ordered tools (§3). No other change; the ＋ editor and auto-zone are untouched (not draggable).

**Click-vs-drag:** native HTML5 drag does not emit a `click` event, and a plain click (no pointer movement) does not start a drag — so `onSelectTool` (activate) and reorder coexist without a manual threshold. The drag handlers are added to the same `<button class="dock__tool">` that already has `onClick` and the slice-5 `ToolTooltip` wrapper; the tooltip's `onPointerDown={hide}` dismisses the tooltip when a drag begins.

**`src/components/shell/Dock.css`**: add `.dock__tool--dragging { opacity: 0.4; }` and `.dock__tool--drop-target { outline: 2px solid var(--accent); outline-offset: -2px; }` (reusing existing tokens).

## 6. Acceptance criteria

1. `dockSlice.reorderDockTool({ fromId, toId })`: moves `fromId` into `toId`'s slot (works for an up-move and a down-move); no-op when `fromId === toId` or either id is absent; `tools2d` length unchanged; exported from actions.
2. `LeftDock` renders the dock tools in `tools2d` order (not catalog order); with the default set it shows the original 7 in the original order; a stale id (not in the catalog) is dropped.
3. Each dock tool button is `draggable` and reorders on drop: a drop of tool A onto tool B dispatches `reorderDockTool({ fromId: A, toId: B })`; clicking a tool still activates it (both `editor.activeTool` and `tools.activeTool2D` via `activate2DTool`).
4. The ＋ button and the auto-zone (✦/📌) items are NOT draggable and do not reorder.
5. The reordered set persists across reload and `NEW_PROJECT` (rides the existing `tools2d` persistence).
6. Slice 4/5 behavior (membership add/remove/reset, the ＋ picker, tooltips, signaling, the 3D dock) is unchanged.
7. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Testing

- **`dockSlice`** (extends `src/store/__tests__/dockSlice.test.ts`): from a known `tools2d` (seed via `rehydrateDocks` to `['select','pen','line']`): `reorderDockTool({fromId:'line',toId:'select'})` → `['line','select','pen']` (up-move: line lands before select); `reorderDockTool({fromId:'select',toId:'line'})` → `['pen','select','line']` (down-move: select lands immediately before line); `fromId===toId` → unchanged; an absent id (`fromId:'zzz'`) → unchanged; length always preserved.
- **`Dock`** (extends `src/components/shell/__tests__/Dock.test.tsx`): render `Dock` with `tools` = two tools and a spy `onReorderTool`. Build a minimal `dataTransfer` stub (`{ data: {} as Record<string,string>, setData(k,v){this.data[k]=v;}, getData(k){return this.data[k]??'';}, effectAllowed:'', dropEffect:'' }`). `fireEvent.dragStart(btnA, { dataTransfer })`, `fireEvent.dragOver(btnB, { dataTransfer })`, `fireEvent.drop(btnB, { dataTransfer })` → `onReorderTool` called with `(idA, idB)`. A drop onto the same button (A onto A) does NOT call `onReorderTool`. Confirm the buttons carry `draggable` only when `onReorderTool` is provided (a `Dock` without the prop renders non-draggable buttons — existing tests unaffected). Confirm clicking still calls `onSelectTool`.
- **`LeftDock`** (extends the same file): default render shows the 7 in default order; after `store.dispatch(reorderDockTool({fromId:'seam',toId:'select'}))`, the first dock tool button is now Sew (assert order via `screen.getAllByRole('button')` filtered to dock tools, or that Sew precedes Select in the DOM).
- **Live (Playwright, untracked `scripts/verify-dock-reorder.mjs`):** best-effort — open app → split → attempt a native HTML5 drag of the last default tool onto the first (Playwright's `dragTo` or a manual `dispatchEvent` of dragstart/dragover/drop), assert `localStorage['openclo-docks'].data.tools2d[0]` changed and the DOM reflects it. **If Playwright cannot reliably drive native HTML5 DnD** (a known limitation), fall back to driving the reducer via `window.__OPENCLO_STORE__.dispatch` to prove the render/persist path, and note in the script comment that the gesture itself is covered by the unit/RTL tests. Do not block the slice on a flaky live drag.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **Drop onto self (A onto A):** `fromId === toId` guard → no-op (and the `onDrop` handler skips the call when `fromId === tool.id`).
- **Single tool in the dock:** dragging is a no-op (only one target, which is itself). Harmless.
- **Drag a tool, drop outside any button** (e.g. onto the separator or off the dock): no `onDrop` fires on a tool target → no reorder; `onDragEnd` clears the dragging highlight.
- **Stale persisted id:** dropped at render via `getDockToolById` → `undefined` filter (so it never renders a draggable button; reorder can't target it). If a stale id sits in `tools2d` and a reorder splices around it, the id stays in the array but remains unrendered — harmless; a Reset cleans it.
- **Add via picker after reorder:** `addDockTool` appends to the end of the (now user-ordered) `tools2d`; the new tool appears last. Consistent.
- **Click after a drag:** native DnD suppresses the click, so a reorder drag never accidentally activates the dragged tool.

## 9. Out of scope

- Touch-drag and pointer-events fallback (native HTML5 DnD is desktop-oriented; María works on a workstation).
- Keyboard-accessible reorder (arrow-key move) — a later a11y pass.
- Drag animation / FLIP transitions (native ghost only).
- Reordering the auto-zone (✦/📌) or the 3D dock affordances.
- A drag handle (the whole button is the drag source).
