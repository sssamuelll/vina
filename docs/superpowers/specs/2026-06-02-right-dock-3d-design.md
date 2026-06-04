# Right Dock (3D) — Side Docks Redesign, Slice 2

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the two side docks (this slice: the right / 3D dock)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` + Voronov's slice-1 review (the 3D affordances are toggles + sim-transport + view-mode, NOT a single-select group, so the 2D `Dock` cannot be reused as-is)
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

The current 3D controls (`FloatingControls3D`) are three text pills floating top-right — Arrange (view-mode), Sew (a toggle with a teardown sequence), Simulate/Pause (sim transport) — plus a bottom-left "SIMULATING · Nfps" status. The redesign reframes these as a vertical right dock mirroring the left (2D) dock built in slice 1.

## 2. Goal

Build the **right (3D) dock**, replacing `FloatingControls3D`, with four affordances — **Arrange · Sew · Simulate · Avatar** — re-housed into a vertical dock that mirrors the left dock's silhouette and view-sync. Per Voronov, the 3D affordances are heterogeneous (each its own action + active-predicate + dynamic state), so this dock does **not** reuse the single-select 2D `Dock`; instead both docks share the visual *shell*, not the selection semantics.

Scope **A** from brainstorming: the three existing controls + Avatar (which opens a real panel). `fabric` is deferred — it has no real panel, so wiring it would be a painted door (same honesty call as the deferred export Tech Pack).

This is **Slice 2** of the side-docks section. Deferred to later slices: the auto (✦) suggestion section, the explicit "two/2D/3D" docks tweak, drag-to-reorder, and `fabric`.

## 3. The four affordances

The 3D dock is an icon column (matching the 2D dock idiom): icon buttons with `aria-label`/tooltip, where the pills' text-flip ("Sewing…", "Pause") becomes an **active highlight + tooltip** instead of changing text.

| Button | Action | Active when | Tooltip | Lucide icon (proposed) |
|---|---|---|---|---|
| Arrange | `dispatch(setViewMode3D('arrange'))` | — (matches current: no active state) | `Arrange` | `Shirt` |
| Sew | `toggleSew` (if `sew3d` → `setActiveTool3D('camera')`; else `resetSimulation()` + `setViewMode3D('arrange')` + `setActiveTool3D('sew3d')`) | `activeTool3D === 'sew3d'` | `Sew` (active: `Sewing…`) | `Spline` |
| Simulate | if running `pauseSimulation()` else `startSimulation()` | `simulationState === 'running'` | `Simulate` (active: `Pause`) · Space | `Play` / `Pause` (flips on active) |
| Avatar | `onOpenPanel('Avatar')` | — | `Avatar` | `PersonStanding` |

The `toggleSew` logic and the comment explaining the sim-reset teardown are preserved verbatim from `FloatingControls3D`.

## 4. Architecture

Per Voronov: share the silhouette (the floating column frame), not the selection semantics.

- **`src/components/shell/DockShell.tsx`** (new, presentational) — extracts the shared frame: `{ side: 'left' | 'right'; domainLabel: string; children: ReactNode }` → renders `<div className={`dock dock--${side}`}><div className="dock__label">{domainLabel}</div>{children}</div>`. No store.
- **`src/components/shell/Dock.tsx`** (slice-1 component, refactored) — wraps its single-select tool buttons in `<DockShell side="left" domainLabel={domainLabel}>`. Behavior unchanged; its 5 tests stay green.
- **`src/components/shell/RightDock.tsx`** (new, container) — reads `editor.viewMode`, `simulation.simulationState`, `simulation.frameTimeMs`, `tools.activeTool3D`; returns `null` when `viewMode === '2d'`; renders `<DockShell side="right" domainLabel="3D">` with the four **heterogeneous** buttons (each with its own `onClick` + `active`), plus the preserved bottom-left "SIMULATING · Nfps" status element (shown when running). Takes an `onOpenPanel: (name: string) => void` prop for the Avatar button.
- **`src/components/shell/Dock.css`** — add `.dock--right { left: auto; right: 14px; }` (and `.dock--left { left: 14px; }`; the base `.dock` keeps the shared frame styles, with the `left: 14px` moved onto `.dock--left`).
- **`src/components/shell/AppShell.tsx`** — replace `<FloatingControls3D />` (line ~241, in `.canvas-area__3d`) with `<RightDock onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)} />` (the same `onOpenPanel` shape already used for `TopBar`/`LogoMenu`). Remove the `FloatingControls3D` import.
- **Delete `src/components/shell/FloatingControls3D.tsx`** and remove its now-dead `.floating-3d*` CSS from `src/styles/floating.css`.
- **`src/components/Viewport3D/Viewport3D.tsx`** — its only reference is a comment on `hideChrome` ("the new AppShell provides FloatingControls3D instead"); update the comment to say `RightDock`. No code change.

### Reused button styling

RightDock's buttons reuse the `.dock__tool` / `.dock__tool--active` classes from `Dock.css` (the shared silhouette). The Simulate icon flips Play↔Pause on `active`; the active highlight (accent fill) replaces the pills' text-flip.

## 5. Acceptance criteria

1. The right dock renders in 3D and Split views (`viewMode !== '2d'`) with the domain label "3D" and the four buttons; hidden in 2D-only view.
2. **Arrange** dispatches `setViewMode3D('arrange')`.
3. **Sew** toggles `activeTool3D` to `'sew3d'` (with the sim-reset + arrange teardown) and back to `'camera'` on second click; the button shows active when `activeTool3D === 'sew3d'`. (This is the migrated sewing-reachability guard.)
4. **Simulate** starts the solver when idle (`startSimulation`) and pauses when running (`pauseSimulation`); active when `simulationState === 'running'`; icon flips Play↔Pause.
5. **Avatar** calls `onOpenPanel('Avatar')`.
6. The "SIMULATING · Nfps" status shows when running, preserved from `FloatingControls3D`.
7. `FloatingControls3D` is deleted; nothing in `src/` imports it; the `Viewport3D` comment is updated.
8. All colors are tokens (dark chrome), no emoji, icons inline lucide.
9. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 6. Testing

- **`DockShell`** (presentational) — renders the domain label + children; applies `dock--left` / `dock--right` by `side`.
- **`RightDock`** (container, RTL + `editor`+`simulation`+`tools` reducers; mirror `FloatingControls3D.test.tsx`'s `renderWithStore`) — the migrated reachability guard: clicking Sew sets `tools.activeTool3D === 'sew3d'`, clicking again returns to `'camera'`; clicking Simulate moves `simulation.simulationState` off `'idle'`; clicking Arrange sets `simulation.viewMode3D === 'arrange'`; clicking Avatar calls a spy `onOpenPanel('Avatar')`; the dock is absent when `editor.viewMode === '2d'`.
- **`Dock`** (2D) — its existing 5 tests must still pass after the `DockShell` refactor.
- **`FloatingControls3D.test.tsx`** — deleted; its sewing-reachability intent is migrated into the RightDock test above.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Edge cases

- **2D-only view:** dock hidden (mirrors `FloatingControls3D`'s `viewMode === '2d'` guard, inverted from LeftDock's `=== '3d'`).
- **Sew during sim:** `toggleSew` resets the sim first (preserved), so entering sew from a running sim is safe.
- **Avatar active state:** not shown (the dock doesn't read the open-panel state) — deferred; Avatar is a plain action button.
- **Right-side tooltip direction:** the handoff wants the right dock's tooltips to open toward the canvas (leftward); the native `title` attribute is used in slice 1 and kept here — directional custom tooltips are part of the later tooltip slice, out of scope.

## 8. Out of scope

- `fabric` affordance — no real panel exists; deferred to avoid a painted door.
- The auto (✦) suggestion section (slice 3), the explicit "two/2D/3D" docks tweak control, drag-to-reorder, custom directional tooltips, Avatar's panel-open active state.
- **The `tests/e2e/dress-avatar-dod.spec.ts` e2e is already stale/red** (its `clickDressButton` targets a `.floating-3d__pill` with text "Dress" that the current `FloatingControls3D` does not render — it has "Simulate", not "Dress"; tracked under the e2e-rojo plan). Deleting `FloatingControls3D` + `.floating-3d` CSS removes the selectors it waits on. Un-rotting that e2e (pointing it at the new dock + the real dress flow) belongs to the e2e-rojo track, NOT this slice. The slice gate (`tsc` + `npm run test` unit + `lint`) excludes e2e, so this is not a gate regression — it is a pre-existing red flagged here so the e2e track knows the selectors moved.
- Generalizing the dock further or unifying 2D/3D state.
