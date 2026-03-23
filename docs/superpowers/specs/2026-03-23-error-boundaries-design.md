# Error Boundaries — Per-Panel Isolation

**Issue:** #395 — No app-level React error boundary
**Date:** 2026-03-23

## Problem

Only `SimulationErrorBoundary` exists (wrapping 3D viewport). A crash in any other panel — 2D editor, copilot, bottom panel, toolbars — unmounts the entire app. User loses all unsaved work.

## Design

### Layered error boundaries

1. **App-level boundary** (`AppErrorBoundary`) — wraps `<App />` in `main.tsx`. Last-resort catch-all. Attempts `saveToStorage()` in `componentDidCatch`, shows "reload app" fallback.

2. **Per-panel boundaries** (`PanelErrorBoundary`) — wraps each major panel in `Workspace.tsx`:
   - `<PatternEditor />` (2D canvas)
   - `<BottomPanel />` (copilot, inspector, POM, timeline)
   - `<CopilotSidePanel />` (left/right positions)
   - Toolbar groups (2D toolbar + options, 3D toolbar + options)

3. **Existing `SimulationErrorBoundary`** — stays as-is, already wraps 3D viewport.

### Component: `PanelErrorBoundary`

Reusable class component. Props:
- `panelName: string` — displayed in fallback UI ("2D Editor Error", "Copilot Error", etc.)
- `children: ReactNode`
- `onReset?: () => void` — optional callback on reset

Behavior:
- `getDerivedStateFromError` → captures error message
- `componentDidCatch` → logs `[PanelErrorBoundary:<panelName>]` + component stack
- Fallback UI: warning icon, panel name, error message, "Reset Panel" button
- Reset clears error state and calls `onReset`

### Component: `AppErrorBoundary`

Root-level class component. No props besides `children`.

Behavior:
- `componentDidCatch` → attempts auto-save via `saveToStorage(store.getState().project)`
- Fallback UI: full-screen message with "Reload Application" button (`window.location.reload()`)
- Shows whether auto-save succeeded or failed

### File structure

```
src/components/ErrorBoundary/
├── PanelErrorBoundary.tsx    # Reusable per-panel boundary
├── AppErrorBoundary.tsx      # Root-level catch-all with auto-save
└── ErrorBoundary.css         # Shared styles
```

### Integration points

- `main.tsx`: wrap `<App />` with `<AppErrorBoundary>`
- `Workspace.tsx`: wrap each panel with `<PanelErrorBoundary panelName="...">`

## What stays the same

- `SimulationErrorBoundary` unchanged — it has 3D-specific reset logic
- No telemetry/monitoring added (out of scope)
- No changes to Redux or state management

## Acceptance criteria

- [ ] App-level error boundary wraps root component
- [ ] Per-panel boundaries isolate 2D editor, copilot, bottom panel, and toolbars
- [ ] Error in one panel does not crash others
- [ ] App-level boundary attempts auto-save before showing fallback
- [ ] Type-checks clean (`npx tsc --noEmit`)
- [ ] All existing tests pass
