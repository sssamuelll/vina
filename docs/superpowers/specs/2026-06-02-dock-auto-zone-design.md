# Dock Auto-Suggest Zone (✦) — Side Docks Redesign, Slice 3a

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #4 of the redesign — the side docks (this slice: the stage-driven auto zone, without the pin-to-keep persistence)
**Source:** `openclo_redesign/side docks/.../DESIGN-NOTES.md` §3 + a feasibility audit (4/9 suggested tools wired, no stage concept exists, the pin model is M-sized — so the section is decomposed and painted doors are filtered)
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

The docks (slices 1–2) show a static pinned set. The handoff's "bet" is an **auto zone** below the pinned tools where stage-relevant tools rise on their own (violet ✦, AI-suggested). A feasibility audit found no stage concept exists and most handoff suggestions are painted doors or undefined — so this slice builds the honest, wired core only.

## 2. Goal

Add a stage-driven **auto-suggest zone** to both docks: a derived workflow stage selects a small set of **already-wired** tools that appear below a separator + faint `auto` label, rendered as violet ✦ buttons. Clicking an ✦ **uses** the tool (opens its panel / runs its action). This delivers the silent discovery channel without the heavy parts.

Scope **3a** (chosen): no pin-to-keep persistence (deferred to 3b — it forces a stateful, Zod-versioned pin model), no signaling toggle, no frequency/recency weighting. Painted-door and undefined suggestions are dropped: `wind` (its Simulation-settings panel is a stub), `pinform`/`fold` (no such 3D tool), `mirror` (contextual, keyboard-only), `import` (the empty-state already surfaces it).

## 3. The stage derivation

A new pure selector `selectWorkflowStage(state): WorkflowStage` computes the stage from existing signals (no new state, `workflowSlice` untouched). Deterministic precedence (most-advanced first):

```
WorkflowStage = 'empty' | 'drafted' | 'arranged' | 'sewn' | 'simulating' | 'simulated'

pieces.length === 0                         → 'empty'
else simulation.simulationState === 'running' → 'simulating'
else simulation.simulationState === 'paused'  → 'simulated'
else seams.length > 0                        → 'sewn'
else                                         → 'drafted'
```

Signals: `s.project.pieces`, `s.project.seams`, `s.simulation.simulationState` — all confirmed present. **`'arranged'` is kept in the `WorkflowStage` vocabulary (handoff term, for later slices) but is NOT derived in 3a**: `simulation.viewMode3D` defaults to `'arrange'`, so it is not a meaningful "user arranged" signal (it would make every pieces-present idle pattern read as `arranged` and `drafted` nearly unreachable). 3a derives five stages; the drafted/sewn/simulating distinction is forgiving because `grade` is suggested across all three.

## 4. The suggestion map (wired-only)

`getDockSuggestions(stage, side): DockSuggestion[]` — pure data; `DockSuggestion = { id: string; icon: LucideIcon; label: string }`. The wired-only map:

| Stage | Left (2D) | Right (3D) |
|---|---|---|
| empty | — | — |
| drafted | `grade` | — |
| sewn | `grade` | `fitmap` |
| simulating | `grade` | — |
| simulated | `export` | `bom` |
| arranged (not derived in 3a) | `grade` | — |

Wired actions (run by the container, which holds the deps):

| id | action | reachability |
|---|---|---|
| `grade` | `onOpenPanel('Grading')` | `GradingTab` panel (real `case 'Grading'` in AppShell `renderPanelContent`) |
| `export` | `runUiExport('dxf', store.getState().project, dispatch)` | the export writer from slice 1 |
| `fitmap` | `dispatch(setFitMapMode('fit'))` | `simulationSlice.setFitMapMode` (FitMapMode incl. `'fit'`) |
| `bom` | `onOpenPanel('BOM')` | `BOMTab` panel (real `case 'BOM'`) |

Icons (lucide, proposed; plan confirms): `grade`=`Ruler`-variant or `Rows3`/`Scaling`; `export`=`Download`; `fitmap`=`Thermometer`/`Activity`; `bom`=`Package`. None overlap a pinned-tool icon enough to confuse.

## 5. Architecture

- **`src/store/selectors.ts`** — add `selectWorkflowStage` (a `createSelector`, like the existing selectors).
- **`src/components/shell/dockSuggestions.ts`** (new) — `WorkflowStage` type (re-exported or imported from the selector module), `DockSuggestion`, and `getDockSuggestions(stage, side)` returning the wired-only list above (pure; no actions).
- **`src/components/shell/DockAutoZone.tsx`** (new, presentational) — `{ suggestions: DockSuggestion[]; onRun: (id: string) => void }`. Renders nothing when `suggestions` is empty; otherwise a `.dock__sep` separator + a `.dock__auto-label` "auto" + one `.dock__tool .dock__tool--auto` (violet) button per suggestion, each `aria-label={label}` + `onClick={() => onRun(id)}`.
- **`src/components/shell/Dock.tsx`** — add an optional `autoZone?: ReactNode` slot, rendered inside `DockShell` after the pinned tool buttons. (LeftDock fills it; the prop is optional so existing Dock tests are unaffected.)
- **`src/components/shell/Dock.css`** — add `.dock__sep` (hairline `--border`), `.dock__auto-label` (mono 8.5px `--text-ghost` uppercase), `.dock__tool--auto { color: var(--dock-auto) }`.
- **`src/styles/tokens.css`** — add `--dock-auto` (a violet distinct from the indigo `--accent`, e.g. `#a78bfa`), the dark-chrome counterpart of the paper `--ai-2d`. This is the "AI suggests" color the handoff calls for.
- **`src/components/shell/LeftDock.tsx`** — read `selectWorkflowStage`; `suggestions = getDockSuggestions(stage, 'left')`; pass `autoZone={<DockAutoZone suggestions onRun={runLeftSuggestion} />}` to `<Dock>`. `runLeftSuggestion(id)`: `grade` → `onOpenPanel('Grading')`; `export` → `runUiExport('dxf', store.getState().project, dispatch)`. Gains an `onOpenPanel: (name: string) => void` prop (threaded from AppShell, mirroring RightDock).
- **`src/components/shell/RightDock.tsx`** — read the stage; render `<DockAutoZone suggestions={getDockSuggestions(stage, 'right')} onRun={runRightSuggestion} />` after the four pinned buttons (inside the same `DockShell`). `runRightSuggestion(id)`: `fitmap` → `dispatch(setFitMapMode('fit'))`; `bom` → `onOpenPanel('BOM')`. Already has `onOpenPanel` + `dispatch`.
- **`src/components/shell/AppShell.tsx`** — pass `onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)}` to `<LeftDock>` (the same callback LeftDock now needs; RightDock already gets it).

The auto ✦ buttons reuse `.dock__tool` (sizing/hover) with the `--auto` violet modifier. No new selection semantics — clicking simply runs the action; there is no active/pinned state in 3a.

## 6. Acceptance criteria

1. `selectWorkflowStage` returns the correct stage for each signal combination (the 5-case precedence in §3; `arranged` is not derived in 3a).
2. `getDockSuggestions(stage, side)` returns the wired-only map in §4 (e.g. `('sewn','right') === [fitmap]`, `('empty','left') === []`, `('simulated','left') === [export]`).
3. The left dock shows a violet ✦ `grade` button in drafted/sewn/simulating and `export` in simulated; the right dock shows `fitmap` in sewn and `bom` in simulated.
4. Clicking ✦ `grade`/`bom` opens the respective panel; ✦ `export` downloads a DXF; ✦ `fitmap` sets the fit-map mode.
5. When a stage/side has no suggestions, the auto zone (separator + label) does not render.
6. ✦ buttons are visually distinct (violet `--dock-auto`) from the blue/ink pinned tools; `aria-label` present; no emoji.
7. The pinned tools and the slice-1/2 dock behavior are unchanged.
8. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 7. Testing

- **`selectWorkflowStage`** — unit: feed minimal state objects for each of the 6 cases, assert the stage (including precedence: running beats seams, etc.).
- **`getDockSuggestions`** — unit: assert the §4 map per (stage, side), including empties.
- **`DockAutoZone`** (presentational, RTL) — renders nothing for `[]`; renders the separator + `auto` label + one violet button per suggestion; click calls `onRun(id)`; buttons carry the `dock__tool--auto` class + `aria-label`.
- **`LeftDock` / `RightDock`** (RTL + store) — with a store dispatched into a stage (e.g. add a piece + a seam → `sewn`), the dock renders the expected ✦; clicking ✦ `grade` calls the `onOpenPanel` spy with `'Grading'`; clicking ✦ `bom` (right, simulated) calls `onOpenPanel('BOM')`. Existing Dock/LeftDock/RightDock tests still pass.
- Full gate before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 8. Edge cases

- **No-suggestion stages:** empty (both), drafted/arranged/simulating (right) render no auto zone — `DockAutoZone` returns null on `[]`.
- **Dock hidden by view:** the auto zone lives inside the dock, so it inherits the dock's view-mode visibility (LeftDock hidden in 3D, RightDock hidden in 2D).
- **`export` at simulated stage:** uses `runUiExport('dxf', …)`; guarded by `runUiExport`'s own empty-pieces check (won't be empty at `simulated`).
- **Stage churn:** the stage is a pure selector recomputed on render; no effect/subscription — the auto zone simply re-renders when the stage changes.

## 9. Out of scope

- **Pin-to-keep (✦ promotion) + the stateful/persisted pin model** — slice 3b (forces a Zod-versioned dock-pin slice + ID-namespace unification; deliberately deferred).
- The painted-door / undefined suggestions: `wind` (Simulation-settings panel is a stub), `pinform`, `fold`, `mirror`, `import` (covered by the empty-state).
- The signaling subtle/off toggle and the frequency+recency weighting (the handoff's "real version") — later slices.
- Directional (toward-canvas) tooltips.
