# Dock Signaling Toggle (subtle / off) — Side Docks Redesign, Slice 3c

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: let the user mute the auto-signaling layer so the dock holds still)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §4 ("Señalización: sutil por defecto") + §8 acceptance criterion #5 ("apagar el ruido si quiere un dock estático")
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

Slices 3a/3b gave the docks a stage-driven auto-suggest (✦) zone plus keep/drop (📌). The handoff's §4 mitigation for "an auto-modifying dock can distract" is a single tweak — **Dock signaling → subtle / off** — that lets a user who prefers a static dock turn the discovery layer off. This slice adds that toggle.

## 2. Goal

Add a per-user `signaling: 'subtle' | 'off'` preference (default `'subtle'`). In `'off'`, the dock's auto-signaling layer goes quiet: no auto suggestions rise, the `auto` label and all keep/unpin badges disappear, and the dock shows only its fixed tools plus the user's already-kept tools (as plain buttons). In `'subtle'`, behavior is exactly slices 1–3b. The preference persists across sessions and projects. A toggle lives in **LogoMenu ▸ View**, labeled **Dock Suggestions** (checked = `'subtle'`).

This is **slice 3c (signaling toggle only)**. Frequency/recency-weighted promotion (handoff §9) is explicitly deferred: there are only four wired auto-actions today (`grade`, `export`, `fitmap`, `bom`) and the static stage map surfaces at most one suggestion per stage-side, so the "cap at 2–3" rule is already satisfied and there is nothing to weight. Weighting becomes meaningful only once multiple candidates compete per stage (slice 4+ / the `DockItem`-registry unification).

## 3. Semantics

The signaling preference is a single global value (not per-side) — the handoff frames it as one tweak ("Dock signaling → subtle / off"), and both docks honor the same setting.

- **`'subtle'` (default):** unchanged from slice 3b. A dock renders, top→bottom: `[fixed tools]` → `[kept items (📌)]` → (if any suggestions) `[separator + "auto" label + suggested items (✦), minus the kept ones]`.
- **`'off'`:** the auto-signaling layer is muted:
  - **Kept items still render** — they are tools the user deliberately pinned; muting signaling must not remove them. They render as **plain icon buttons** (same `dock__tool-wrap` layout) with **no badge** sub-button. Clicking a kept item's icon still runs its action (open panel / export / fit-map), exactly as in `'subtle'`.
  - **No suggestions rise:** the separator, the `auto` label, and the stage-suggested (✦) items are not rendered.
  - With no kept items, the auto zone renders nothing (`null`).
- To unpin a kept item, the user returns signaling to `'subtle'` (the 📌 badge reappears). `'off'` is the "I'm done customizing, freeze it" state; it deliberately offers no in-dock unpin affordance.
- The fixed default tools (the `DOCK_2D_TOOLS` column on the left; the four 3D affordances on the right) are unaffected by signaling — they always render. Only the `DockAutoZone` content responds to the setting.

## 4. State + persistence

Extend the existing **`src/store/dockSlice.ts`** (no new slice, no new LS key):

```
DockState = {
  pinnedExtra: { left: string[]; right: string[] };   // unchanged (slice 3b)
  signaling: 'subtle' | 'off';                          // NEW, default 'subtle'
}
```

- `initialState.signaling = 'subtle'`.
- New reducer **`toggleDockSignaling()`** (no payload) — flips `signaling` between `'subtle'` and `'off'`. This mirrors the param-less toggle convention of `toggleSnapToGrid` / `toggleSeamAllowance` in `editorSlice`, which is what the View-menu items dispatch.
- **`rehydrateDocks(state, action)`** now sets **both** fields: `state.pinnedExtra = action.payload.pinnedExtra; state.signaling = action.payload.signaling;`.

### Schema (backward compatible, no version bump)

`DockStateSchema` gains a `signaling` field **with a default**, so an older persisted envelope (written before this slice, with no `signaling` key) still parses and fills `'subtle'`:

```ts
const signalingSchema = z.enum(['subtle', 'off']).default('subtle');

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: signalingSchema,
  })
  .strict();
```

- `.strict()` rejects **unknown** keys; a **missing** key that has a `.default(...)` is filled, not rejected. So `{ pinnedExtra: {...} }` (old) → parses, `signaling` becomes `'subtle'`. `{ pinnedExtra, signaling }` (new) → parses as written. **`STORAGE_VERSION` stays `1`.**
- `loadDocks()` returns `result.data.data`, which now always carries `signaling` (defaulted if absent). No call-site change.
- `persistDocks(state)` already writes `data: state`, so `signaling` is persisted with the rest of `DockState`. The existing focused `store.subscribe` reference-diff in `store/index.ts` (`if (dock !== prevDock) persistDocks(dock)`) already fires on any `dock` change, including `toggleDockSignaling`. **No change to `store/index.ts`.**
- **NEW_PROJECT:** `dockSlice` still has no NEW_PROJECT handler — `signaling`, like `pinnedExtra`, is a user preference that persists across projects.

**Persistence note (project LS-vs-IDB non-negotiable):** `signaling` is the same class of small per-user UI preference as `pinnedExtra` — LS-only, co-located in spirit with `workflowSlice`'s prefs, not project data. The existing inline justification on `persistDocks` covers it.

## 5. Components

- **`src/store/dockSlice.ts`** — add `signaling` to `DockState` + `initialState`; add `toggleDockSignaling` reducer + export; extend `rehydrateDocks` to set `signaling`; add `signaling` (with default) to `DockStateSchema`. Export `toggleDockSignaling` from `dockSlice.actions`.
- **`src/components/shell/DockAutoZone.tsx`** — add prop `signaling: 'subtle' | 'off'`. Compute `const off = signaling === 'off';`. Render kept items always, passing a `withBadge` flag (`!off`) to the item renderer; render the suggested group (separator + `auto` label + ✦ items) only when `!off && suggested.length > 0`. Null guard becomes: `if (kept.length === 0 && (off || suggested.length === 0)) return null;`. The item renderer omits the badge sub-button when `withBadge` is false (renders only the icon `button.dock__tool`, still wired to `onRun`).
- **`src/components/shell/LeftDock.tsx`** — add `const signaling = useSelector((s: RootState) => s.dock.signaling);`; pass `signaling={signaling}` to `DockAutoZone`. No other change.
- **`src/components/shell/RightDock.tsx`** — same: read `s.dock.signaling`, pass `signaling={signaling}` to `DockAutoZone`.
- **`src/components/shell/LogoMenu.tsx`** — import `toggleDockSignaling` from `../../store/dockSlice`. In `VIEW_MENU`, after the display-toggle group (…`Sewing Lines`), insert a separator then a new toggle item:
  ```ts
  { separator: true, label: '' },
  { label: 'Dock Suggestions', action: (d) => d(toggleDockSignaling()), checked: (s) => s.dock.signaling === 'subtle' },
  ```
  (placed before the existing separator that precedes the `Ruler:` radio group). It uses the same `checked` + `action` machinery as `Grid` / `Seam Allowance`, so no `handleItemClick` change is needed — `Dock Suggestions` is not a `…`-suffixed panel item and has an `action`, so it routes through the existing `item.action(dispatch)` branch.

No CSS change: a kept item without a badge reuses the existing `dock__tool-wrap` + `dock__tool` styles (the `.dock__badge` simply is not rendered).

## 6. Acceptance criteria

1. `dockSlice`: `initialState.signaling === 'subtle'`; `toggleDockSignaling` flips `'subtle'`→`'off'`→`'subtle'`; `persistDocks`→`loadDocks` round-trips `signaling`; an envelope with `pinnedExtra` but **no** `signaling` loads with `signaling === 'subtle'` (backward compat); `rehydrateDocks` sets `signaling`; `NEW_PROJECT` does not reset `signaling`.
2. `DockAutoZone` with `signaling='off'`: kept items render as plain buttons (no `.dock__badge`); no `auto` label, no separator, no suggested (✦) items; clicking a kept item's icon still calls `onRun`. With `signaling='off'` and `kept=[]` → renders `null`.
3. `DockAutoZone` with `signaling='subtle'`: behavior identical to slice 3b (kept 📌 + `auto` label + suggested ✦; badges call `onPin`/`onUnpin` with `stopPropagation`).
4. With `dock.signaling='off'` in the store, `LeftDock`/`RightDock` show no `auto` label and no ✦ badges; a kept item is still present (plain). With `'subtle'`, the existing behavior holds.
5. `LogoMenu ▸ View` has a `Dock Suggestions` item that shows ✓ when `signaling==='subtle'` and dispatches `toggleDockSignaling` on click; toggling it updates the docks live.
6. The preference survives a reload (persisted to `openclo-docks`) and a `NEW_PROJECT`.
7. Fixed default tools and slices 1–3b behavior in `'subtle'` are unchanged.
8. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Testing

- **`dockSlice`** (unit, extends `src/store/__tests__/dockSlice.test.ts`): default `signaling` is `'subtle'`; `toggleDockSignaling` flips both directions; `persistDocks(state)`→`loadDocks()` preserves `signaling`; `loadDocks` of an envelope `{ version: 1, data: { pinnedExtra: { left: [], right: [] } } }` (no `signaling`) returns a state with `signaling === 'subtle'`; `loadDocks` of `{ ..., data: { pinnedExtra, signaling: 'bogus' } }` → `null` (enum rejects bad value — note: a bad value is rejected, only a *missing* value is defaulted); `rehydrateDocks({ pinnedExtra, signaling: 'off' })` sets `signaling==='off'`; dispatching `NEW_PROJECT` leaves `signaling` unchanged.
- **`DockAutoZone`** (RTL, extends `src/components/shell/__tests__/DockAutoZone.test.tsx`): with `signaling='off'` + a kept item → the kept icon button is present, no element with class `dock__badge` exists, no `dock__auto-label`, no suggested item; clicking the kept icon calls `onRun(id)`. With `signaling='off'` + `kept=[]` + `suggested=[…]` → container renders nothing (assert no `dock__tool` from the zone). With `signaling='subtle'` → existing assertions still pass (kept 📌, `auto` label, suggested ✦, badge clicks call `onPin`/`onUnpin` not `onRun`). **Note:** every existing call site that renders `DockAutoZone` (these tests + `LeftDock`/`RightDock`) must pass the new required `signaling` prop — passing `'subtle'` preserves current behavior.
- **`LeftDock`** (RTL, extends `src/components/shell/__tests__/Dock.test.tsx` — LeftDock renders inside `<Dock>`) **/ `RightDock`** (extends `src/components/shell/__tests__/RightDock.test.tsx`), each with a store incl. the `dock` reducer: preload `dock.signaling='off'` (dispatch `toggleDockSignaling` or seed via `rehydrateDocks`); reach a stage that has a suggestion → assert no `dock__auto-label` / no ✦ badge in the dock; a kept item (seed `pinnedExtra`) is still rendered. Flip to `'subtle'` → the `auto` label / ✦ reappear. Existing dock tests still pass.
- **`LogoMenu`** (no existing unit test for this component; render-heavy nested menu): the `Dock Suggestions` item is declarative wiring (a `checked` predicate + an `action` dispatch through the already-tested `item.action(dispatch)` branch). Verified via the live Playwright script below rather than a new RTL harness — the reducer it calls (`toggleDockSignaling`) and the components it affects (`DockAutoZone`) are unit-tested above.
- **Live (Playwright, untracked `scripts/verify-dock-signaling.mjs`):** open app → 2D → add a piece (stage `drafted`, `grade` ✦ appears) → open `LogoMenu ▸ View`, click `Dock Suggestions` (uncheck) → assert no `.dock__auto-label` and no `.dock__badge` in the left dock → assert `localStorage['openclo-docks']` parses to `{ version:1, data:{ …, signaling:'off' } }` → click `Dock Suggestions` again → the `auto`/✦ layer returns.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **Kept item in `'off'`:** renders plain (no badge), action still runs. The user cannot unpin it without returning to `'subtle'` — intended (`'off'` freezes the dock).
- **Old persisted envelope (pre-3c):** missing `signaling` is defaulted to `'subtle'` by the zod schema; the kept set is preserved (no version bump, no data loss on upgrade).
- **Corrupt `signaling` value** (e.g. `'loud'`): the enum has no matching member; because the field is `z.enum(...).default(...)`, an *explicitly present* invalid value fails validation → the whole envelope is discarded (`null`) → defaults. (Only an *absent* key is defaulted.) This is the safe, conservative outcome and matches the existing "discard corrupt envelope" behavior.
- **Toggling while the auto zone is empty** (e.g. `empty` stage, no kept): no visible change — there is nothing in the zone either way. The preference is still recorded and persisted.
- **`'off'` then a stage change:** no suggestions rise regardless of stage (that is the point of `'off'`).

## 9. Out of scope

- Frequency/recency-weighted promotion and capping auto suggestions at 2–3 (handoff §9) — deferred until multiple candidates compete per stage (slice 4+).
- Editing / removing / reordering the **fixed default** tools and the ＋ customize editor (slice 4).
- Unifying fixed tools + 3D affordances + auto actions into one `DockItem` registry / reorderable pinned set (slice 4).
- Directional (toward-canvas) tooltips and the why-here tooltip line (slice 5).
- A three-state signaling (`subtle` already *is* the gentle default; no separate "loud" mode is specified or wanted).
