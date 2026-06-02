# Dock Pin-to-Keep (✦→📌) — Side Docks Redesign, Slice 3b (lean)

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: keep an auto suggestion across stages, and drop it again — without the full pinned-set customization)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §3 + the slice-3a feasibility audit (the full pin model is M+; this is the lean form chosen in brainstorming)
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

Slice 3a added a stage-driven auto-suggest (✦) zone whose tools appear only while their stage is active. The handoff's ★ gesture is "click ✦ to keep" — promote a suggestion so it stays. This slice adds keep/un-keep with persistence, in the lean form: the kept set is the auto-action ids the user pinned (it does not yet make the static default tools editable — that is slice 4).

## 2. Goal

Let a user **keep** an auto suggestion (it then shows in the dock regardless of stage, with a 📌 badge) and **drop** it again (📌 → back to a stage suggestion). The kept set persists across sessions and projects. The static default pinned tools are unchanged and not yet removable/reorderable (slice 4).

This is **slice 3b (lean)**. Out of scope (deferred): unifying all dock items into one reorderable pinned set, editing/removing/reordering the static defaults, the ＋ customize editor, frequency/recency weighting, the signaling subtle/off toggle.

## 3. Semantics

- A **kept** item shows **always** (persistent), with a 📌 badge. An **auto** suggestion shows **only at its stage**, with a ✦ badge.
- A dock renders, top→bottom: `[static pinned tools]` → `[kept items (📌)]` → (if any suggestions) `[separator + "auto" label + suggested items (✦), minus the kept ones]` (no-duplicate).
- **✦ badge click** → keep (`pinAuto`), moves the item into the kept group. **📌 badge click** → drop (`unpinAuto`); it reappears as a suggestion if its stage matches.
- The **icon** click still runs the action (open panel / export / fit-map), exactly as slice 3a. The badge is a **separate corner button** that calls `stopPropagation()` so keep/drop never triggers the action (handoff requirement).
- Only the four known auto-action ids are keepable: `grade`, `export`, `fitmap`, `bom`. The kept set stores only these.

## 4. State + persistence

A new **`src/store/dockSlice.ts`**, persisted to its **own** localStorage key (isolated from `workflowSlice` — no version bump there, no collateral on existing prefs):

```
DockState = { pinnedExtra: { left: string[]; right: string[] } }   // default { left: [], right: [] }
```

- Reducers: `pinAuto({ side, id })` (push id to `pinnedExtra[side]` if absent), `unpinAuto({ side, id })` (remove it), `rehydrateDocks(DockState)`.
- `persistDocks(state)` / `loadDocks()` mirror `workflowSlice`'s pattern: LS key `openclo-docks`, a versioned envelope `{ version: 1, data }`, a strict zod schema (each side `z.array(boundedString)` capped at, say, 16; `boundedString` rejecting null bytes / oversize; forbidden-key reviver on parse). Failure → `null` → fall back to default.
- **Persist-on-change** via a focused `store.subscribe` in `store/index.ts` that diffs `state.dock` and calls `persistDocks` when it changes. (This is the first `store.subscribe` in the app — deliberately isolated so dock-pref persistence does not expand the ratified cascade-middleware inventory (B3) or touch the `workflowSlice` envelope. `workflowSlice` persists via `confirmationMiddleware`; `avatarSlice` persists in-reducer — both are heavier couplings than this read-only diff.)
- **Boot:** `store/index.ts` calls `loadDocks()` and dispatches `rehydrateDocks` if present (mirrors the `loadWorkflow`/`rehydrateWorkflow` boot, line ~81).
- **NEW_PROJECT:** the kept set persists across projects (a user UI preference) — `dockSlice` does NOT clear on `NEW_PROJECT`.

**Persistence note for the inline comment** (per the project's LS-vs-IDB non-negotiable): the dock-pin set is a small per-user UI preference, co-located in spirit with `workflowSlice`'s LS prefs (expertMode/toolMemory). LS-only is justified the same way; it is not project data and does not belong in the IDB project envelope.

## 5. Components

- **`src/store/dockSlice.ts`** (new) — state, `pinAuto`/`unpinAuto`/`rehydrateDocks`, `persistDocks`/`loadDocks` (zod envelope), default-export reducer.
- **`src/store/index.ts`** — register `dock: dockReducer`; boot load + rehydrate; the persist-on-change subscribe.
- **`src/components/shell/dockSuggestions.ts`** — add `getAutoItemById(id: string): DockSuggestion | undefined` (lookup over the four known items, so a kept id renders regardless of stage).
- **`src/components/shell/DockAutoZone.tsx`** — extend to `{ kept: DockSuggestion[]; suggested: DockSuggestion[]; onRun: (id) => void; onPin: (id) => void; onUnpin: (id) => void }`. Render the kept items (each a wrapper with the main icon button + a 📌 badge button) first; then, if `suggested` is non-empty, the separator + "auto" label + the suggested items (main button + ✦ badge button). Returns `null` when both lists are empty. Each badge button calls `stopPropagation()` then `onPin`/`onUnpin`.
- **`src/components/shell/Dock.css`** — `.dock__tool-wrap` (position: relative), `.dock__badge` (15px circle, corner -3px/-3px, `--hair`/`--border`), `.dock__badge--pin` (📌, `--accent`) / `.dock__badge--auto` (✦, `--dock-auto`). A `transform: scale(1.22)` on badge hover (handoff), no loops.
- **`src/components/shell/LeftDock.tsx`** / **`RightDock.tsx`** — read `pinnedExtra` (`useSelector(s => s.dock.pinnedExtra)`); compute `kept = pinnedExtra[side].map(getAutoItemById).filter(Boolean)` and `suggested = getDockSuggestions(stage, side).filter(s => !pinnedExtra[side].includes(s.id))`; pass both to `DockAutoZone` with `onPin={(id) => dispatch(pinAuto({ side, id }))}`, `onUnpin={(id) => dispatch(unpinAuto({ side, id }))}`, and the existing `onRun` (runSuggestion).

The kept-item lookup deliberately tolerates an unknown id (returns `undefined`, filtered out) so a stale persisted id never breaks the render.

## 6. Acceptance criteria

1. `dockSlice`: `pinAuto({side,id})` adds the id once (idempotent); `unpinAuto` removes it; `persistDocks`→`loadDocks` round-trips; a corrupt/oversized/wrong-typed envelope yields `null`.
2. Clicking an auto item's **✦ badge** keeps it: it moves to the kept group (shows always, with a 📌 badge) and disappears from the auto suggestions; the action is NOT triggered (stopPropagation).
3. Clicking a kept item's **📌 badge** drops it: it leaves the kept group and reappears as a suggestion when its stage matches; the action is NOT triggered.
4. Clicking a kept/suggested item's **icon** still runs the action (open panel / export / fit-map).
5. The kept set survives a reload (persisted) and a NEW_PROJECT.
6. Badges are violet ✦ (suggested) / accent 📌 (kept), 15px corner, no emoji glyphs in code (lucide or CSS marks); buttons have `aria-label`s ("Keep <name>" / "Unpin <name>").
7. The static default tools and slices 1–3a behavior are unchanged.
8. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Testing

- **`dockSlice`** (unit): `pinAuto` idempotent add per side; `unpinAuto` removal; `persistDocks`→`loadDocks` round-trip equals the state; `loadDocks` returns `null` for a wrong-version / non-array / oversized envelope (zod rejection); `NEW_PROJECT` does not clear `pinnedExtra`.
- **`getAutoItemById`** (unit): returns the item for `'grade'`/`'bom'`; `undefined` for an unknown id.
- **`DockAutoZone`** (RTL): renders kept (📌) + suggested (✦); both empty → null; clicking the ✦ badge calls `onPin(id)` and NOT `onRun` (stopPropagation); clicking the 📌 badge calls `onUnpin(id)` and NOT `onRun`; clicking the icon calls `onRun(id)`.
- **`LeftDock`/`RightDock`** (RTL + store incl. `dock` reducer): reach a stage with a suggestion; click its ✦ badge → `store.getState().dock.pinnedExtra[side]` contains the id, the item now renders with a 📌 badge, and is absent from the suggestion list; click 📌 → removed. Existing dock tests still pass (with `dock` reducer added to their stores).
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **Stale persisted id:** `getAutoItemById` returns `undefined` → filtered out; no crash. (The kept set could also be sanitized on load, but filtering at render is sufficient and simpler.)
- **Keep then leave the stage:** a kept item shows regardless of stage (that is the point of keeping); only the auto-suggestion list is stage-gated.
- **Double-keep:** `pinAuto` is idempotent (no duplicate ids).
- **Dock hidden by view:** kept items live inside the dock, so they inherit the dock's view-mode visibility.
- **Persistence failure** (private mode, full storage): `persistDocks` swallows the error (like `persistWorkflow`); the kept set works in-session, just not persisted.

## 9. Out of scope

- Unifying the static tools + 3D affordances + auto actions into one `DockItem` registry / one reorderable pinned set.
- Editing/removing/reordering the **static default** tools, and the ＋ customize editor (slice 4).
- Frequency/recency-weighted promotion and the signaling subtle/off toggle (slice 3c).
- Directional (toward-canvas) tooltips and the why-here tooltip line.
