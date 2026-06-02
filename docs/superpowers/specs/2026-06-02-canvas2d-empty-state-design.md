# Canvas 2D — Empty-State Interactive Shortcuts (P2.11)

**Date:** 2026-06-02
**Branch:** `feat/canvas-2d-redesign`
**Surface:** #5 — Canvas 2D pattern editor
**Source:** DESIGN-NOTES.md item 11 ("Estado vacío con guía"), filtered through the María-MVP lens
**Status:** Design approved, ready for implementation plan

---

## 1. Context (one line)

When the 2D canvas has no pieces, today it shows a single faint gray SVG line — *"Select the Pen tool (P) to draw pattern pieces"* — which onboards the wrong path: María imports a DXF, she does not draw from scratch.

## 2. Goal

Replace that placeholder with an interactive empty-state whose hierarchy matches María's real first move: **import a DXF**. Drawing stays available but secondary. The AI bar is reinforced as the third path. "Load template" from the original spec is dropped — Seamly is frozen, so it would be a shortcut to a dead path.

This is the chosen **Option A** from brainstorming:

```
┌─ 2D canvas (empty) ────────────────┐
│                                     │
│         Import your pattern         │   heading
│      ┌──────────────────────┐       │
│      │  ⤓  Import DXF        │       │   primary action
│      └──────────────────────┘       │
│         drag a .dxf here too        │   drop hint (informational)
│                                     │
│      ✎ Draw from scratch   (P)      │   secondary link
│                                     │
│        …or describe it to AI  ↓     │   visual pointer to UnifiedBar
└───────────────────────────────[AI]─┘
```

## 3. Acceptance criteria

1. With zero pieces and the idle **Select** tool active (the default), the canvas shows the empty-state (heading + primary Import DXF + drop hint + Draw link + AI pointer).
2. Clicking **Import DXF** opens the existing hidden `.dxf` file picker; selecting a file loads pieces via the existing path, the empty-state unmounts (pieces > 0), and auto-fit frames the pattern.
3. Clicking **Draw from scratch (P)** activates the Pen tool; the empty-state hides and the existing pen-drawing hint appears.
4. Dropping a `.dxf` anywhere on the canvas still imports (unchanged behavior); the empty-state only advertises it.
5. The empty-state never appears in the 3D-only view, never when a pattern is loaded, and never while any tool other than Select is active — picking Pen, Rectangle, PolyPen, etc. clears the canvas for drawing.
6. All copy is final (post-solace-wren), all colors are tokens (no inline magic colors), no emoji.
7. Gates green: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 4. Architecture

### Approach: HTML overlay (chosen)

`EmptyState2D` is an HTML component rendered as a sibling of the `<svg>` inside `.pattern-editor` (the same place `ContextMenu` and `ReferenceImageSettings` already live as HTML siblings). It is absolutely positioned to fill the editor and centered.

Rejected alternative — SVG-native (growing `HintText` into clickable `<rect>`/`<text>`): SVG has no flexbox, no native focus ring, icons must be hand-drawn paths, and SVG presentation attributes cannot read `var()`, forcing every color inline — re-introducing the "ships dirty" smell that slices 3–5 just removed. Not used.

### Pointer-events / drag-drop safety

The overlay container uses `pointer-events: none`; only the interactive controls use `pointer-events: auto`. File-drag `dragover`/`drop` events bubble from any inner target up to `canvas-area` (which calls `preventDefault` on dragover and handles `drop`), so a drop landing on a button still imports correctly — verified against the existing `handleDxfDrop` wiring in `AppShell`. No new drop handlers are added.

### Wiring (all pre-existing, reused)

| Action | Mechanism | New code |
|---|---|---|
| Import DXF | `onImportDXF` prop → `dxfInputRef.current.click()` in `AppShell` → existing `handleDxfFileInput` → `importDXFFile` | 1 prop threaded |
| Draw from scratch | `dispatch(setActiveTool('pen'))` from the component | none (action exists) |
| Drag a .dxf | existing `canvas-area` drop handlers | none |
| AI pointer | visual only (UnifiedBar is always visible below) | none |

## 5. Components

### New

- **`src/components/PatternEditor/EmptyState2D.tsx`**
  - Props: `{ onImportDXF: () => void }`
  - Uses `useDispatch`; `Draw` dispatches `setActiveTool('pen')`.
  - Renders: heading, primary `Import DXF` `<button>` (inline SVG download icon), drop-hint line, secondary `Draw from scratch (P)` `<button>`, AI-pointer line (inline SVG down-arrow).
  - Real `<button>` elements (focusable, keyboard-activatable), `aria-label`s where the visible label is terse.
- **`src/components/PatternEditor/EmptyState2D.css`**
  - Tokenized styles only (see §6).

### Modified

- **`src/components/PatternEditor/PatternEditor.tsx`**
  - Accept `onImportDXF?: () => void`.
  - Render `<EmptyState2D onImportDXF={onImportDXF} />` as a sibling of the `<svg>`, gated on `pieces.length === 0 && activeTool === 'select'`. (`select` is the default idle tool per `editorSlice` initial state; switching to any drawing tool clears the canvas, so the gate is `=== 'select'`, not `!== 'pen'`.) When `onImportDXF` is undefined (defensive — e.g. tests), the Import DXF button is disabled rather than throwing.
- **`src/components/PatternEditor/renderers/HintText.tsx`**
  - Remove the `!hasPieces && activeTool !== 'pen'` branch entirely. The Select-tool empty case is now owned by `EmptyState2D`; for other drawing tools (rect/line/polyPen) the canvas is intentionally clear of the onboarding hint (today's branch wrongly shows "Select the Pen tool" over those tools). Keep the pen-drawing branch (`!hasPieces && activeTool === 'pen' && penNodesLength === 0`) and all tool-active hints unchanged.
- **`src/components/shell/AppShell.tsx`**
  - Pass `onImportDXF={() => dxfInputRef.current?.click()}` to `<PatternEditor />` (one line).

## 6. Visual spec (paper-canvas token system, no new colors)

| Element | Token / value |
|---|---|
| Ground | transparent over `--canvas-2d` (`#f1efe8`) |
| Heading | Schibsted Grotesk, `--ink-on-light` (`#2b2d33`), ~15px |
| Primary button label / "(P)" | `--font-mono-2d` (JetBrains Mono) |
| Primary button | ink outline (`--ink-on-light`), transparent fill; hover/focus → border `--accent-2d`, +0.6px (matches DESIGN-NOTES §3 "Borde en hover") |
| Drop hint | `--ink-on-light-3` (`#a0a5b0`), small |
| Draw link | `--ink-on-light-2` (`#6f7480`); "(P)" suffix in `--ink-on-light-3` |
| AI pointer | `--ink-on-light-3`, with the "AI" word optionally tinted `--ai-2d` (oklch 0.72 0.13 295) |
| Icons | inline SVG (lucide-style strokes), **never emoji** |
| Layout | centered flex column, `max-width: ~320px`, gap-based vertical rhythm |

No `opacity` CSS transitions on frequently re-rendered nodes (DESIGN-NOTES §5); the empty-state mounts/unmounts on the pieces-count change, so a static appearance (or a `fill-mode` entrance) is fine.

## 7. Copy (working — final pass through solace-wren before merge)

Microcopy is a solace-wren trigger (global CLAUDE.md). Working strings, to be confirmed/refined:

- Heading: `Import your pattern`
- Primary button: `Import DXF`
- Drop hint: `or drag a .dxf onto the canvas`
- Secondary: `Draw from scratch` + `(P)`
- AI pointer: `…or describe it to the AI below`

Constraints from solace-wren: no emoji, no exclamation marks, no title case for body copy, no hype words. The English/Spanish decision follows the rest of the 2D surface (currently English labels in-canvas; toasts are Spanish) — confirm during the copy pass.

## 8. Edge cases

- **View mode:** the 2D pane is `display:none` in 3D-only view, so the empty-state cannot show there. In split view it shows in the 2D half only.
- **Any non-Select tool active:** hidden (the gate is `=== 'select'`). When Pen specifically is active, control is handed to the existing pen-drawing hint.
- **Active file drag:** AppShell's drag overlay (`z-index: 50`, `inset: 0`) covers the empty-state during a drag — left as-is.
- **Missing `onImportDXF`:** Import DXF button renders disabled (no throw); used by component tests that mount `PatternEditor`/`EmptyState2D` in isolation.

## 9. Testing (RTL + existing gates)

`EmptyState2D` unit tests:
- renders heading + all four affordances when given `onImportDXF`;
- `Import DXF` click calls `onImportDXF`;
- `Draw from scratch` click dispatches `setActiveTool('pen')`;
- Import DXF disabled when `onImportDXF` is undefined.

`PatternEditor` gating (light): empty-state present with zero pieces + Select tool; absent with ≥1 piece; absent with a non-Select tool (Pen/Rectangle). (Mock the store/selectors per existing PatternEditor test patterns.)

Full gate run before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.

## 10. Out of scope

- Extracting the DXF import orchestration into a shared helper (3 copies today: `AppShell.importDXFFile`, `UnifiedBarChat.handleSend`, `actionExecutor` IMPORT_DXF) — separate refactor.
- Focus-on-click of the UnifiedBar from the AI pointer (cross-component plumbing) — future enhancement.
- Re-theming the global drag overlay (uses `--accent`, not `--accent-2d`) — separate, view-independent surface.
- Any other deferred slice-3+ items (edge-hover, selection bbox, notch pairing, drill holes, export UI).
