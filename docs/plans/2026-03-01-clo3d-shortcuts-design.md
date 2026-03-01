# CLO3D Keyboard Shortcuts Design (#139)

## Overview

Align all OpenClo keyboard shortcuts with CLO3D industry standard to provide a familiar experience for professional pattern makers migrating from CLO3D.

## Goals

1. CLO3D muscle memory compatibility — users can switch without relearning
2. Preserve OpenClo-specific tools with secondary shortcuts
3. Update ShortcutHelp overlay to reflect new mappings

## Reference

- [DefKey CLO Shortcuts](https://defkey.com/clo-design-shortcuts)
- [CLO3D Official Manual](https://support.clo3d.com/hc/en-us/categories/115000064648-Manual)

---

## Primary Shortcuts (CLO3D Standard)

### 2D Pattern Tools

| Key | Function | OpenClo Tool | Current Key |
|-----|----------|--------------|-------------|
| A | Transform Pattern | `transform` | t |
| Z | Edit Pattern | `select` | v |
| V | Edit Curve Point | `editCurve` | a |
| C | Edit Curvature | `editConstrain` | — |
| X | Add Point/Split Line | `scissors` | x (no change) |
| H | Polygon | `pen` | p |
| S | Rectangle | `rectangle` | r |
| E | Ellipse | `circle` | — |
| G | Internal Polygon/Line | `internalShape` | — |
| I | Trace | `trace` | — |

### Sewing Tools

| Key | Function | OpenClo Tool | Current Key |
|-----|----------|--------------|-------------|
| B | Edit Sewing | `seam` | s |
| N | Segment Sewing | *future tool* | n (was notch) |
| M | Free Sewing | `freeSewing` | — |

### 3D & Navigation

| Key | Function | OpenClo Tool | Current Key |
|-----|----------|--------------|-------------|
| Q | Select/Move (3D) | `camera` | — (in hooks) |
| Space | Simulate | `simulate` | space (no change) |
| W | Pin | `pin` | w (no change) |
| F | Focus Zoom | *new action* | — |

---

## Secondary Shortcuts (Displaced Tools)

| Key | Function | OpenClo Tool | Rationale |
|-----|----------|--------------|-----------|
| Shift+M | Measure | `measure` | M for Measure, intuitive |
| Shift+N | Notch | `notch` | N for Notch, intuitive |
| Shift+G | Grainline | `grainline` | G for Grainline, intuitive |
| Shift+L | Line | `line` | L for Line, intuitive |
| D | Dart | `dart` | Unused in CLO3D |
| Ctrl+D | Duplicate | `duplicate` | Standard hotkey |

### Navigation (No Key Required)

| Action | Input | Notes |
|--------|-------|-------|
| Zoom | Scroll wheel | Standard |
| Pan | Middle mouse drag | Standard |
| Pan | Alt + Left drag | Alternative |

---

## Implementation Scope

### Files to Modify

1. **Tool definitions** (`src/tools/definitions/*.tsx`)
   - Update `shortcut` field in each tool definition

2. **Keyboard shortcuts hook** (`src/hooks/useKeyboardShortcuts.ts`)
   - Add Shift+Key handlers for displaced tools
   - Add F for Focus Zoom action
   - Update `_shortcutMap` for help overlay

3. **StatusBar** (`src/components/StatusBar/StatusBar.tsx`)
   - Update `toolLabels` to show new shortcuts

4. **ShortcutHelp** — Will auto-update from `_shortcutMap`

### Tools to Add Shortcuts

| Tool | New Shortcut |
|------|--------------|
| `editConstrain` | C |
| `circle` | E |
| `internalShape` | G |
| `trace` | I |
| `freeSewing` | M |

### Tools Requiring No Changes

- `scissors` (X) — already correct
- `pin` (W) — already correct
- `simulate` (Space) — already correct

---

## Success Criteria

1. A CLO3D user can navigate OpenClo 2D using their muscle memory
2. All primary shortcuts match CLO3D exactly
3. Displaced tools accessible via Shift+Key or unused letters
4. ShortcutHelp overlay (?) shows accurate mappings
5. No shortcut conflicts (each key maps to exactly one tool)

---

## Future Considerations

- **Segment Sewing (N)** — Tool not yet implemented, reserve shortcut
- **Internal Ellipse (R)** — Tool not yet implemented, reserve shortcut
- **Topstitch tools (T, J, K, L, ;)** — Future implementation
