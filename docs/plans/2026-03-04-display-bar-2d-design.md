# 2D Vertical Display Bar — Design Document

**Issue:** #140 — 2D Vertical Display Bar — standardized toggles
**Date:** 2026-03-04
**Status:** Approved

## Goal

Move all display/visibility toggles out of PropertiesPanel into a dedicated 42px vertical icon bar on the right edge of the 2D viewport. Separate "creation tools" (Toolbar2D, left) from "inspection toggles" (DisplayBar2D, right).

---

## 1. Component: `DisplayBar2D`

A floating 42px icon column positioned `absolute` inside `viewport-2d`, right-aligned. Mirrors Toolbar3D visual pattern. Semi-transparent background with backdrop blur.

### Toggle Groups

**Visibility toggles (on/off):**

| Icon | Toggle | State Key | Default |
|------|--------|-----------|---------|
| `ScissorsLineDashed` | Seam Allowance | `showSeamAllowance` | on |
| `Type` | Piece Names | `showPieceNames` | on |
| `Ruler` | Line Lengths | `showLineLengths` | off |
| `Wheat` | Grainlines | `showGrainlines` | on |
| `Link` | Sewing Lines | `showSewingLines` | on |

**Rendering modes (radio — one active):**

| Icon | Mode | Value |
|------|------|-------|
| `Image` | Textured | `'textured'` |
| `Droplets` | Translucent | `'translucent'` |
| `Box` | Wireframe | `'wireframe'` |

Separated from toggles by a horizontal divider.

---

## 2. Redux State

Add to `editorSlice.ts` `EditorState`:

```typescript
showPieceNames: boolean;       // default: true
showLineLengths: boolean;      // default: false
showSewingLines: boolean;      // default: true
renderMode2D: 'textured' | 'translucent' | 'wireframe';  // default: 'textured'
```

Existing: `showSeamAllowance`, `showGrainlines` (keep as-is).

New reducers: `togglePieceNames`, `toggleLineLengths`, `toggleSewingLines`, `setRenderMode2D`.

---

## 3. Layout

```
viewport-2d (position: relative)
├── viewport-label ("PATTERN")
├── PatternEditor (SVG canvas)
└── DisplayBar2D (position: absolute; right: 0; top: 32px)
```

The bar floats over the canvas. No structural layout changes.

---

## 4. Visual Style

- Width: 42px (matches `--toolbar2d-width`)
- Background: `rgba(42, 42, 42, 0.85)` + `backdrop-filter: blur(8px)`
- Border: `1px solid var(--border)` on left side
- Icon size: 18px, button: 34×30px (matches Toolbar2D)
- Active: icon color `var(--accent)` (#4a9eff)
- Hover: background `var(--btn-bg-hover)`
- Tooltip: CSS-only, appears to the left

---

## 5. PropertiesPanel Changes

Remove from DISPLAY section:
- Seam allowance toggle (moved to DisplayBar2D)
- Grainlines toggle (moved to DisplayBar2D)

Keep in PropertiesPanel:
- SA width slider (numeric input, not suitable for icon bar)
- Snap to grid (behavior setting, not visibility)

---

## 6. PieceRenderer Changes

- `showPieceNames`: conditionally render piece name labels
- `showLineLengths`: conditionally render edge length annotations
- `showSewingLines`: conditionally render SeamRenderer connections
- `renderMode2D`: adjust fill/stroke/opacity for textured/translucent/wireframe

---

## 7. Files

| File | Action |
|------|--------|
| `src/components/DisplayBar2D/DisplayBar2D.tsx` | Create — icon toggle bar component |
| `src/components/DisplayBar2D/DisplayBar2D.css` | Create — styling |
| `src/store/editorSlice.ts` | Modify — add new display flags + reducers |
| `src/components/Workspace/Workspace.tsx` | Modify — mount DisplayBar2D inside viewport-2d |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx` | Modify — respect new flags |
| `src/components/PatternEditor/renderers/SeamRenderer.tsx` | Modify — respect showSewingLines |
| `src/components/PropertiesPanel/PropertiesPanel.tsx` | Modify — remove migrated toggles |
