# Contextual Panel Routing by Side — Side Docks Redesign, Slice 5b

**Date:** 2026-06-03
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: open the contextual panel on the side that matches its domain)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §6 ("Las herramientas-tarea … abren el panel en el lado de su dock: tareas 3D → panel a la derecha; grade (dominio 2D) → panel a la izquierda")
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

The contextual panel (`ContextPanel`) always opens top-**right** (`floating.css` hardcodes `right: var(--sp-3)`). The handoff's §6 wants a panel's placement to match its **domain**: a 2D-domain panel (Grading) opens on the **left** near the 2D dock; 3D-domain panels (Avatar, BOM) stay on the **right**. This slice routes the panel by its intrinsic domain.

## 2. Goal

Each panel has an intrinsic side derived from its domain. When `AppShell` renders the open panel, it positions it left or right accordingly — consistently, regardless of whether the panel was opened from a dock, the LogoMenu, or ⌘K. The `onOpenPanel(name)` contract is unchanged (no side parameter threaded through call sites).

Out of scope: changing `onOpenPanel`'s signature; reclassifying panels beyond Grading→left (a one-line map edit when wanted); slide-from-the-correct-side animation; a third position; touch/responsive repositioning.

## 3. Semantics

- A pure helper **`getPanelSide(name: string): 'left' | 'right'`** maps a panel name to its domain side. **`'Grading' → 'left'`** (the handoff's named 2D example, and the only panel currently opened from the left/2D dock). **Every other panel → `'right'`** (Avatar, BOM, Inspector, Nesting, Layers, Settings, Fabric Library, Colorways, Problems, Simulation, Export, and any unknown/future name).
- The side is **intrinsic to the panel**, not the opener: Grading opens on the left whether triggered by the left dock, the LogoMenu, or ⌘K. This is simpler (no per-call-site side argument) and consistent (the same panel always lands in the same place).
- A **left** panel is offset past the left (2D) dock so it never overlaps it. In 3D-only view the left dock is hidden, but the offset is harmless (a little extra left margin). A **right** panel keeps today's exact placement.
- `ContextPanel`'s existing behavior (Escape to close, click-outside to close, the toggle-by-name `onOpenPanel`) is unchanged. Only the horizontal anchor moves.

## 4. Components

- **`src/components/shell/panelSide.ts`** (new) — exports `getPanelSide(name: string): 'left' | 'right'`. A small map/switch: returns `'left'` for `'Grading'`, `'right'` otherwise. Defaulting unknown names to `'right'` preserves today's behavior for every panel except Grading.

  ```ts
  const LEFT_PANELS = new Set<string>(['Grading']);
  export function getPanelSide(name: string): 'left' | 'right' {
    return LEFT_PANELS.has(name) ? 'left' : 'right';
  }
  ```

  (Reclassifying a panel — e.g. adding `'Nesting'` or `'Layers'` to `LEFT_PANELS` — is a one-line edit.)

- **`src/components/shell/ContextPanel.tsx`** — add an optional prop `side?: 'left' | 'right'` (default `'right'`). The root element's className becomes `` `context-panel context-panel--${side ?? 'right'}` ``. No other change (Escape/click-outside/header/body untouched).

- **`AppShell.tsx`** — the panel state `contextPanel: string | null` is **unchanged**. At the `<ContextPanel ...>` render site, derive and pass the side:

  ```tsx
  <ContextPanel title={contextPanel} side={getPanelSide(contextPanel)} onClose={() => setContextPanel(null)}>
    {renderPanelContent(contextPanel, () => setContextPanel(null))}
  </ContextPanel>
  ```

  Import `getPanelSide` from `./panelSide` (adjust the relative path to AppShell's location). No `onOpenPanel` change; no call-site change anywhere.

- **`src/styles/floating.css`** — the base `.context-panel` rule keeps its current `top`/`width`/`right: var(--sp-3)`/etc. (so a right panel is byte-identical to today). Add ONE override for the left variant:

  ```css
  .context-panel--left {
    left: calc(14px + 52px + 12px); /* past the left dock (left:14px, ~52px wide) + gap */
    right: auto;
  }
  ```

  `.context-panel--right` needs no rule — the base already anchors right; the class is inert (present for symmetry/debuggability). The left override flips the horizontal anchor only; `top`, `width`, `max-height`, `z-index`, and the slide-down animation are inherited from the base.

## 5. Acceptance criteria

1. `getPanelSide('Grading') === 'left'`; `getPanelSide('Avatar') === 'right'`; `getPanelSide('BOM') === 'right'`; `getPanelSide('anythingUnknown') === 'right'`.
2. `ContextPanel` with `side="left"` renders a root element carrying `context-panel--left`; with `side="right"` (or omitted) it carries `context-panel--right` and NOT `context-panel--left`.
3. Opening the Grading panel (from the left dock's grade ✦, the LogoMenu, or ⌘K) positions it on the left (offset past the 2D dock); opening Avatar/BOM/any other panel positions it on the right exactly as today.
4. `ContextPanel`'s Escape-close, click-outside-close, and the `onOpenPanel` toggle behavior are unchanged; `onOpenPanel`'s signature is unchanged (still `(name: string) => void`); no dock/LogoMenu/⌘K call site changed.
5. A right-side panel's visual placement is identical to before this slice (the base `.context-panel` rule is untouched).
6. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 6. Testing

- **`getPanelSide`** (unit, new `src/components/shell/__tests__/panelSide.test.ts`): `'Grading'`→`'left'`; `'Avatar'`/`'BOM'`/`'Inspector'`/`'Nesting'`→`'right'`; an unknown name (`'Zzz'`)→`'right'`.
- **`ContextPanel`** (RTL, new or extended `src/components/shell/__tests__/ContextPanel.test.tsx`): rendered with `side="left"`, the root (`document.querySelector('.context-panel')`) has class `context-panel--left` and not `--right`; with `side="right"`, has `--right` and not `--left`; with `side` omitted, defaults to `--right`. Confirm the title + close button still render and `onClose` fires on the close button + on `Escape` (guard the existing behavior; jsdom; no jest-dom — use `.classList.contains`/`.toBeTruthy()`).
- **`AppShell`** wiring: not unit-tested (the shell is render-heavy with many lazy panels); covered by the live check below + the fact that `getPanelSide` and `ContextPanel` are unit-tested and the wiring is a one-line derivation.
- **Live (Playwright, untracked `scripts/verify-panel-routing.mjs`):** open app → split → open Grading via the command palette / store (`onOpenPanel('Grading')` or dispatch the panel open) → assert `document.querySelector('.context-panel.context-panel--left')` exists and its bounding box `left` is past the 2D dock's right edge → close → open Avatar → assert `.context-panel--right` and a right-anchored box. (If driving the exact opener is fiddly, set the panel via the same path `AppShell` uses; the routing under test is the side class + position, which is deterministic given the panel name.)
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Edge cases

- **Unknown / future panel name:** `getPanelSide` defaults to `'right'` — every existing non-Grading panel and any new one keeps today's right placement until explicitly added to `LEFT_PANELS`.
- **3D-only view (left dock hidden):** a left panel (Grading) still opens at the left offset; with no 2D dock there it simply has extra left margin — harmless, not a collision.
- **Left panel vs the `floating-3d--bottom-left` overlay** (the SIMULATING pill, bottom-left): the panel anchors `top: var(--sp-3)` (top-left), the pill is bottom-left — different vertical zones, no overlap.
- **Toggling the same panel:** unchanged — `onOpenPanel` still toggles by name; reopening re-derives the same side.
- **A panel opened on the left while the ＋ dock-tool picker is open:** the picker is anchored to the dock (`left: calc(100% + 8px)` from the dock) and the panel is offset past the dock; they occupy adjacent but distinct regions. Both are dismissible (Escape / click-outside); no functional conflict.

## 8. Out of scope

- Threading a `side` argument through `onOpenPanel` / the ~16 call sites (the intrinsic-map model makes this unnecessary).
- Reclassifying panels other than Grading (Nesting/Layers/etc.) — a one-line `LEFT_PANELS` edit when desired.
- Slide-in-from-the-correct-side animation (the existing `slide-down` is reused for both sides).
- A third panel position, stacked/multiple panels, or responsive repositioning.
- Per-opener side (explicitly rejected in favor of intrinsic side).
