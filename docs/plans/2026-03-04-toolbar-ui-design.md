# 2D Toolbar UI Fix — Design Document

**Epic:** #125 — 2D Pattern Editing Toolchain
**Date:** 2026-03-04
**Status:** Approved

## Goal

Fix keyboard shortcut conflicts, connect tool options to hooks, and update shortcut help after recent tool changes (measure shortcut `m`, freeSewing reassigned to `f`, merge tool added with `j`).

## Changes

### 1. Fix Keyboard Shortcuts

In `src/hooks/useKeyboardShortcuts.ts`:

- Line 294: Change `M → freeSewing` to `M → measure`
- Add new entry: `F → freeSewing`
- Add new entry: `J → merge`
- Remove `Shift+M → measure` (now redundant since M goes directly to measure)
- Update `_shortcutMap` array to reflect new assignments

### 2. Connect Tool Options

In `src/components/PatternEditor/PatternEditor.tsx`:

- Read `toolOptions.measure.showAngle` from Redux `tools.toolOptions`
- Pass to ToolOverlay as `measureShowAngle={showAngle ?? false}`
- This makes the ToolOptions panel's toggle actually control angle display

### 3. Update Shortcut Help

In `_shortcutMap` array of `useKeyboardShortcuts.ts`:

- Change `{ key: 'M', label: 'Free Sewing' }` to `{ key: 'M', label: 'Measure' }`
- Add `{ key: 'F', label: 'Free Sewing' }`
- Add `{ key: 'J', label: 'Merge Patterns' }`
- Remove `{ key: 'M', shift: true, label: 'Measure Tool' }` (redundant)

## Files

| File | Action |
|------|--------|
| `src/hooks/useKeyboardShortcuts.ts` | Modify — fix shortcuts, update help map |
| `src/components/PatternEditor/PatternEditor.tsx` | Modify — connect tool options to overlay |
