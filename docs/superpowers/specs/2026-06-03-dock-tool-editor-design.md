# Dock Tool Editor (＋ customize) — Side Docks Redesign, Slice 4 (first cut)

**Date:** 2026-06-03
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: let the user customize which 2D tools live in the left dock)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §2 (anatomy: "＋ Personalizar" ghost button) + §3 ("la personalización es un gesto, no una pantalla de ajustes") + §9 (technical notes)
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

The left (2D) dock shows a hardcoded static set of 7 tools (`DOCK_2D_TOOLS`). The handoff's §2/§3 wants a **＋ customize** affordance that lets the user pick which 2D tools live in their dock — "a gesture, not a settings screen." This slice makes the 2D dock's tool set **fully editable** (add/remove any of a curated catalog of real 2D tools) and persisted, edited through a lightweight popover anchored to a ＋ ghost button.

## 2. Goal

Replace the static 7-tool 2D dock with a **persisted, user-editable membership** over a curated catalog of dock-eligible 2D tools. A ＋ ghost button at the bottom of the left dock opens a popover (checklist of the catalog; checked = in the dock). Toggling adds/removes the tool; the dock can never be emptied (keep ≥ 1); a "Reset to defaults" link restores the original 7. The set persists across sessions and projects.

This is **slice 4, first cut: the ＋ editor only.** Deferred (each its own future slice): drag-to-reorder, the 3D dock (its affordances are heterogeneous — not registry tools), unifying fixed/auto/3D into one `DockItem` registry, and exposing all 44 `Tool2D` ids (the catalog is a curated ~14, extensible later).

## 3. Semantics

- The left dock renders the tools whose ids are in the persisted membership `tools2d`, **in catalog order** (not insertion order) — so the dock layout is stable and predictable regardless of add/remove sequence.
- The default `tools2d` is the current 7 ids in their current order, so a fresh/upgraded dock looks identical to today.
- **Add:** check a catalog tool in the popover → it joins the dock (rendered in its catalog position).
- **Remove:** uncheck → it leaves the dock. The **last remaining tool cannot be removed** (the dock always has ≥ 1 tool; the popover disables unchecking the last, and the reducer no-ops a remove that would empty the set).
- **Reset to defaults:** a link in the popover restores `tools2d` to the default 7.
- The 3D (right) dock is untouched — its four affordances stay hardcoded (they are heterogeneous: a view-mode dispatch, a stateful toggle with teardown, sim transport with an icon flip, a panel opener — not uniform catalog tools).
- The auto-zone (kept 📌 / suggested ✦, slice 3a–3c) and its `pinnedExtra`/`signaling` state are independent and unchanged. Auto items run via `runSuggestion`; dock tools activate via `activate2DTool` — two different mechanisms, deliberately kept separate.

## 4. The catalog

A curated list of dock-eligible 2D tools lives in **`src/components/shell/dock2dTools.ts`** as `DOCK_2D_CATALOG: DockToolDef[]` (existing `DockToolDef` shape `{ id, icon, label, shortcut }`, lucide icons). Every id is a real member of the `Tool2D` union (`src/types/types.ts`) and activates via `activate2DTool(dispatch, id)` (which dispatches both `setActiveTool` and `setActiveTool2D` — no per-tool gating). Catalog order is the render order; the first 7 are the defaults in their current order:

| # | id | label | lucide icon | shortcut |
|---|---|---|---|---|
| 1 | `select` | Select | `MousePointer2` | `Z` |
| 2 | `pen` | Pen | `PenTool` | `H` |
| 3 | `line` | Line | `Minus` | `⇧L` |
| 4 | `rectangle` | Rectangle | `Square` | `S` |
| 5 | `scissors` | Scissors | `Scissors` | `X` |
| 6 | `measure` | Measure | `Ruler` | `M` |
| 7 | `seam` | Sew | `Spline` | `B` |
| 8 | `editPattern` | Edit Pattern | `PenLine` | `Q` |
| 9 | `internalShape` | Internal Shape | `Shapes` | `G` |
| 10 | `notch` | Notch | `Triangle` | — |
| 11 | `grainline` | Grainline | `MoveVertical` | — |
| 12 | `grading` | Grading | `Scaling` | — |
| 13 | `textAnnotation` | Text | `Type` | — |
| 14 | `addPiece` | Add Piece | `SquarePlus` | — |

`getDockToolById(id: string): DockToolDef | undefined` resolves a membership id to its catalog entry (mirrors `dockSuggestions.ts::getAutoItemById`). The existing `DOCK_2D_TOOLS` export (consumed only by `LeftDock`) is **removed** — superseded by the catalog + the store-driven membership. (Tools without a shortcut render line-1 name-only in the slice-5 tooltip; the `shortcut?` field stays optional.)

## 5. State + persistence

Extend **`src/store/dockSlice.ts`** (no new slice, no new LS key — same `openclo-docks` envelope, no version bump):

```
DockState = {
  pinnedExtra: { left: string[]; right: string[] };   // unchanged (3b)
  signaling: 'subtle' | 'off';                          // unchanged (3c)
  tools2d: string[];                                    // NEW — left-dock tool membership
}
```

- **`DEFAULT_DOCK_2D_IDS`** (a `const string[]` defined in `dockSlice.ts`, the store layer — so the slice owns its default without importing the component-layer catalog): `['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam']`.
- `initialState.tools2d = DEFAULT_DOCK_2D_IDS`.
- Reducers:
  - **`addDockTool(id: string)`** — append `id` to `tools2d` if not already present.
  - **`removeDockTool(id: string)`** — remove `id`, **but no-op if it would leave `tools2d` empty** (keep ≥ 1).
  - **`resetDockTools()`** — set `tools2d = [...DEFAULT_DOCK_2D_IDS]`.
- `rehydrateDocks` now also sets `state.tools2d = action.payload.tools2d`.

### Schema (backward compatible, no version bump)

```ts
const tools2dSchema = z.array(idString).max(MAX_PINNED).default([...DEFAULT_DOCK_2D_IDS]);

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: z.enum(['subtle', 'off']).default('subtle'),
    tools2d: tools2dSchema,
  })
  .strict();
```

- `.default(...)` fills `tools2d` for an old envelope written before this slice (no `tools2d` key) → the 7 defaults, no version bump (same technique as `signaling`). A present-but-malformed `tools2d` (e.g. not an array, or > `MAX_PINNED` entries) fails validation → the whole envelope is discarded → `null` → defaults.
- `idString` (the existing `z.string().min(1).max(80)` no-null-byte refinement) validates each id; unknown-but-well-formed ids that are not in the catalog are tolerated by the schema and simply filtered out at render time via `getDockToolById` (robust to a future catalog change that drops an id — mirrors how `pinnedExtra` ids resolve through `getAutoItemById`).
- `persistDocks`/`loadDocks` and the `store.subscribe` reference-diff in `store/index.ts` already write/diff the whole `dock` state — **no change** there. No NEW_PROJECT handler (the tool set is a user preference that persists across projects, like `pinnedExtra`/`signaling`).

## 6. Components

- **`src/components/shell/dock2dTools.ts`** — add `DOCK_2D_CATALOG: DockToolDef[]` (the 14 above) + `getDockToolById(id)`; remove the old `DOCK_2D_TOOLS` export; keep `DockToolDef`.
- **`src/store/dockSlice.ts`** — add `DEFAULT_DOCK_2D_IDS`, `tools2d` to `DockState` + `initialState`, the three reducers, the schema field, the `rehydrateDocks` line, and export `addDockTool`/`removeDockTool`/`resetDockTools`.
- **`src/components/shell/DockToolPicker.tsx`** (new) — a **pure presentational** checklist popover. Props: `{ catalog: DockToolDef[]; selectedIds: string[]; onAdd: (id) => void; onRemove: (id) => void; onReset: () => void }`. Renders one row per catalog tool (icon + label + optional shortcut + a ✓ when in the dock). Clicking a checked-in tool calls `onRemove` (the control is **disabled when it is the only selected tool** — `selectedIds.length === 1 && selected`), an unchecked one calls `onAdd`. A "Reset to defaults" button calls `onReset`. `role="dialog"` / `aria-label="Customize dock tools"`; each row's control has an `aria-label` ("Add <label> to dock" / "Remove <label> from dock"). It owns **no** open/close lifecycle (no listeners, no `onClose`) — that lives in the container (below), which keeps the picker trivially testable and avoids an anchor-vs-outside-click race.
- **`src/components/shell/Dock.tsx`** — add an optional `footer?: ReactNode` slot rendered after `autoZone` (keeps `Dock` presentational; the ＋ + popover are supplied by the container).
- **`src/components/shell/LeftDock.tsx`** — read `tools2d` from the store; resolve the rendered tool list as `DOCK_2D_CATALOG.filter((t) => tools2d.includes(t.id))` (catalog order); pass that as `tools` to `Dock`. Own the editor lifecycle: a local `pickerOpen` state + a `editorRef` wrapper `<div>` (containing BOTH the `＋` ghost button and, when open, the picker) + a `useEffect` that closes on `mousedown` outside `editorRef` and on `Escape` — the LogoMenu pattern, with the trigger inside the ref so clicking ＋ doesn't race the outside-click. Render this wrapper into `Dock`'s `footer` slot: the `＋` ghost button toggles `pickerOpen`; when open, `<DockToolPicker catalog={DOCK_2D_CATALOG} selectedIds={tools2d} onAdd={(id) => dispatch(addDockTool(id))} onRemove={(id) => dispatch(removeDockTool(id))} onReset={() => dispatch(resetDockTools())} />`.
- **`src/components/shell/Dock.css`** — add `.dock__add` (ghost button: 38×38, `border: 1px dashed var(--border)`, `color: var(--text-muted)`, hover `border-color: var(--accent)`) and `.dock-picker` popover styles (absolutely positioned to the right of the dock — `left: 100%` from the footer/anchor — dark chrome surface matching the dock, `--shadow-float`, scrollable list, high `z-index`). The dock container is not `overflow: hidden`, so absolute positioning escapes without a portal (mirrors LogoMenu's in-flow dropdown).

## 7. Acceptance criteria

1. `dockSlice`: `initialState.tools2d` equals `DEFAULT_DOCK_2D_IDS` (the 7); `addDockTool` appends a new id (idempotent — no duplicate); `removeDockTool` removes an id but no-ops when it would empty the set; `resetDockTools` restores the 7; `persistDocks`→`loadDocks` round-trips `tools2d`; an envelope with no `tools2d` loads with the 7 defaults (backward compat); a malformed `tools2d` discards the envelope (→ `null`); `rehydrateDocks` sets `tools2d`; `NEW_PROJECT` does not reset it.
2. `DOCK_2D_CATALOG` lists the 14 tools in §4 order; `getDockToolById` resolves a member and returns `undefined` for an unknown id; every id in `DEFAULT_DOCK_2D_IDS` resolves in the catalog (consistency).
3. `LeftDock` renders exactly the catalog tools whose ids are in `tools2d`, in catalog order; with the default set it shows the original 7 in the original order (visually unchanged from today). Each tool still activates both `editor.activeTool` and `tools.activeTool2D` via `activate2DTool`, and still carries the slice-5 tooltip.
4. The `＋` ghost button renders at the bottom of the left dock; clicking it opens the `DockToolPicker` popover; clicking it again (or outside, or `Escape`) closes it.
5. In the popover: a catalog tool not in the dock shows unchecked and adding it dispatches `addDockTool` (the tool appears in the dock); a tool in the dock shows checked and removing it dispatches `removeDockTool` (it leaves the dock); the only-remaining selected tool's remove control is disabled; "Reset to defaults" dispatches `resetDockTools`.
6. The customized set survives a reload (persisted to `openclo-docks`) and a `NEW_PROJECT`.
7. The 3D dock, the auto-zone (kept/suggested), `signaling`, and `pinnedExtra` behavior are unchanged.
8. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Testing

- **`dockSlice`** (extends `src/store/__tests__/dockSlice.test.ts`): default `tools2d` = the 7; `addDockTool('notch')` appends once (idempotent on repeat); `removeDockTool('pen')` removes it; `removeDockTool` of the last id is a no-op (set stays length 1); `resetDockTools()` restores the 7; `persistDocks({...,tools2d:['select','notch']})`→`loadDocks()` round-trips; `loadDocks` of `{version:1,data:{pinnedExtra:{left:[],right:[]},signaling:'subtle'}}` (no `tools2d`) returns `tools2d` = the 7 defaults; `loadDocks` of a `{..., tools2d: 'nope'}` (non-array) → `null`; `rehydrateDocks({..., tools2d:['select']})` sets it; `global/newProject` leaves `tools2d` unchanged.
- **catalog** (extends `src/components/shell/__tests__/dockSuggestions.test.ts` or a new `dock2dTools.test.ts`): `DOCK_2D_CATALOG` has 14 entries; `getDockToolById('select')` resolves, `getDockToolById('nope')` is `undefined`; **every `DEFAULT_DOCK_2D_IDS` id resolves in the catalog** (drift guard); catalog ids are all distinct.
- **`DockToolPicker`** (RTL, new `src/components/shell/__tests__/DockToolPicker.test.tsx`): renders one row per catalog tool with its label; a selected tool's control is "checked" (✓ / `aria-pressed`) and labeled "Remove …", an unselected one "Add …"; clicking an unselected row calls `onAdd(id)`; clicking a selected row calls `onRemove(id)`; when `selectedIds.length === 1`, that one selected tool's control is `disabled` and clicking it does NOT call `onRemove`; "Reset to defaults" calls `onReset`. (Pure component — no window listeners; jsdom; assert via `getByRole`/`querySelector`/`.disabled`; no jest-dom.)
- **`LeftDock`** (extends `src/components/shell/__tests__/Dock.test.tsx`): with the default store, the dock shows the 7 default tools (existing tests still pass); after `store.dispatch(addDockTool('notch'))`, a Notch button appears (query by its accessible name); after `removeDockTool('pen')`, the Pen button is gone; the `＋` button (aria-label "Customize dock tools") is present, toggles the picker open/closed on click, and the picker closes on `Escape`. Reuse `renderLeftDock`; wrap dispatches in `act()`.
- **Live (Playwright, untracked `scripts/verify-dock-editor.mjs`):** open app → 2D/split → click the dock `＋` → assert the picker opens → check `Notch` → assert a Notch tool button appears in the left dock AND `localStorage['openclo-docks']` parses to `{…, data:{…, tools2d: [...,'notch']}}` → uncheck a tool → it disappears → "Reset to defaults" → back to 7 → reload → the customization (if not reset) persists.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 9. Edge cases

- **Removing down to one:** the reducer no-ops and the popover disables the last remove control — the dock can never be empty (a dead, tool-less dock would be a UX trap).
- **Old persisted envelope (pre-slice-4):** missing `tools2d` is defaulted to the 7 by the schema; `pinnedExtra`/`signaling` preserved; no version bump, no data loss.
- **Persisted id no longer in the catalog** (a future catalog edit drops a tool): `getDockToolById` returns `undefined`, the render `.filter` drops it silently — the dock shows the remaining valid tools, no crash. (If that emptied the visible set, the ＋ → Reset path recovers it.)
- **Adding a tool already present:** `addDockTool` is idempotent (guarded by `includes`).
- **Picker open while the dock re-renders** (e.g. stage change repaints the auto-zone): the popover is in the footer slot, independent of the auto-zone; its open state lives in `LeftDock` local state and is unaffected.
- **`signaling: 'off'`:** unrelated — it mutes the auto-zone, not the fixed tool column or the ＋ editor. The ＋ and the picker work the same in both signaling modes.

## 10. Out of scope

- **Drag-to-reorder** the dock tools (order stays catalog order) — a future slice.
- **The 3D (right) dock** customization — its affordances are heterogeneous, not catalog tools.
- **Unifying** fixed tools + auto items + 3D affordances into one `DockItem` registry.
- **Exposing all 44 `Tool2D` ids** — the catalog is a curated ~14; widening it later is a one-array edit.
- **Per-tool options / sub-tool variants** in the picker (e.g. topstitch variants) — the catalog offers whole tools only.
- **Frequency/recency-weighted auto promotion** (still deferred from 3c).
