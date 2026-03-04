# 2D Vertical Display Bar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 42px vertical display bar on the right edge of the 2D viewport with visibility toggles and rendering mode selector, replacing display toggles currently in PropertiesPanel.

**Architecture:** New `DisplayBar2D` component floats inside `viewport-2d` via absolute positioning. New display flags added to `editorSlice`. PieceRenderer and SeamRenderer conditionally render elements based on these flags. PropertiesPanel DISPLAY section simplified.

**Tech Stack:** TypeScript, React, Redux Toolkit, lucide-react, CSS

---

### Task 1: Add New Display Flags to Redux

**Files:**
- Modify: `src/types/types.ts:316-331` (EditorState interface)
- Modify: `src/store/editorSlice.ts:5-19` (initial state + reducers)

**Step 1: Add new fields to EditorState interface**

In `src/types/types.ts`, add after `showAnchorPoints: boolean;` (line 327):

```typescript
  showPieceNames: boolean;
  showLineLengths: boolean;
  showSewingLines: boolean;
  renderMode2D: 'textured' | 'translucent' | 'wireframe';
```

**Step 2: Add initial state and reducers to editorSlice**

In `src/store/editorSlice.ts`, add to `initialState` after `showAnchorPoints: false,` (line 16):

```typescript
  showPieceNames: true,
  showLineLengths: false,
  showSewingLines: true,
  renderMode2D: 'textured' as const,
```

Add reducers after `toggleAnchorPoints` (line 80):

```typescript
    togglePieceNames(state) {
      state.showPieceNames = !state.showPieceNames;
    },
    toggleLineLengths(state) {
      state.showLineLengths = !state.showLineLengths;
    },
    toggleSewingLines(state) {
      state.showSewingLines = !state.showSewingLines;
    },
    setRenderMode2D(state, action: PayloadAction<'textured' | 'translucent' | 'wireframe'>) {
      state.renderMode2D = action.payload;
    },
```

Add to exports (line 104):

```typescript
  togglePieceNames, toggleLineLengths, toggleSewingLines, setRenderMode2D,
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/types/types.ts src/store/editorSlice.ts
git commit -m "feat: add display flags for piece names, line lengths, sewing lines, render mode

New EditorState fields: showPieceNames, showLineLengths, showSewingLines,
renderMode2D. With corresponding toggle/set reducers.

Refs #140"
```

---

### Task 2: Create DisplayBar2D Component

**Files:**
- Create: `src/components/DisplayBar2D/DisplayBar2D.tsx`
- Create: `src/components/DisplayBar2D/DisplayBar2D.css`

**Step 1: Create CSS**

Create `src/components/DisplayBar2D/DisplayBar2D.css`:

```css
.display-bar-2d {
  position: absolute;
  right: 0;
  top: 32px;
  bottom: 0;
  width: var(--toolbar2d-width, 42px);
  background: rgba(42, 42, 42, 0.85);
  backdrop-filter: blur(8px);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  gap: 0;
  z-index: 10;
  pointer-events: auto;
}

.display-bar-2d .db-separator {
  width: 20px;
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}

.display-bar-2d .db-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s;
  position: relative;
  color: var(--text-secondary);
}

.display-bar-2d .db-btn:hover {
  background: var(--btn-bg-hover);
  color: var(--text-primary);
}

.display-bar-2d .db-btn.active {
  color: var(--accent);
}

.display-bar-2d .db-btn.active:hover {
  color: var(--accent);
}

/* Tooltip to the left */
.display-bar-2d .db-btn .db-tooltip {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 1200;
}

.display-bar-2d .db-btn:hover .db-tooltip {
  opacity: 1;
}

/* Radio mode: highlight active rendering mode */
.display-bar-2d .db-btn.mode-active {
  background: var(--accent-dim, rgba(74, 158, 255, 0.15));
  color: var(--accent);
}
```

**Step 2: Create component**

Create `src/components/DisplayBar2D/DisplayBar2D.tsx`:

```typescript
import { useSelector, useDispatch } from 'react-redux';
import {
  ScissorsLineDashed, Type, Ruler, Wheat, Link,
  Image, Droplets, Box,
} from 'lucide-react';
import { RootState } from '../../store';
import {
  toggleSeamAllowance, toggleGrainlines,
  togglePieceNames, toggleLineLengths, toggleSewingLines,
  setRenderMode2D,
} from '../../store/editorSlice';
import './DisplayBar2D.css';

type RenderMode = 'textured' | 'translucent' | 'wireframe';

interface ToggleItem {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

interface ModeItem {
  icon: React.ReactNode;
  label: string;
  mode: RenderMode;
}

export default function DisplayBar2D() {
  const dispatch = useDispatch();
  const editor = useSelector((s: RootState) => s.editor);

  const toggles: ToggleItem[] = [
    { icon: <ScissorsLineDashed size={18} />, label: 'Seam Allowance', active: editor.showSeamAllowance, onClick: () => dispatch(toggleSeamAllowance()) },
    { icon: <Type size={18} />, label: 'Piece Names', active: editor.showPieceNames, onClick: () => dispatch(togglePieceNames()) },
    { icon: <Ruler size={18} />, label: 'Line Lengths', active: editor.showLineLengths, onClick: () => dispatch(toggleLineLengths()) },
    { icon: <Wheat size={18} />, label: 'Grainlines', active: editor.showGrainlines, onClick: () => dispatch(toggleGrainlines()) },
    { icon: <Link size={18} />, label: 'Sewing Lines', active: editor.showSewingLines, onClick: () => dispatch(toggleSewingLines()) },
  ];

  const modes: ModeItem[] = [
    { icon: <Image size={18} />, label: 'Textured', mode: 'textured' },
    { icon: <Droplets size={18} />, label: 'Translucent', mode: 'translucent' },
    { icon: <Box size={18} />, label: 'Wireframe', mode: 'wireframe' },
  ];

  return (
    <div className="display-bar-2d">
      {toggles.map(t => (
        <button
          key={t.label}
          className={`db-btn ${t.active ? 'active' : ''}`}
          onClick={t.onClick}
        >
          {t.icon}
          <span className="db-tooltip">{t.label}</span>
        </button>
      ))}

      <div className="db-separator" />

      {modes.map(m => (
        <button
          key={m.mode}
          className={`db-btn ${editor.renderMode2D === m.mode ? 'mode-active' : ''}`}
          onClick={() => dispatch(setRenderMode2D(m.mode))}
        >
          {m.icon}
          <span className="db-tooltip">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/DisplayBar2D/DisplayBar2D.tsx src/components/DisplayBar2D/DisplayBar2D.css
git commit -m "feat: create DisplayBar2D component with visibility toggles and render modes

42px floating vertical bar with 5 visibility toggles (seam allowance,
piece names, line lengths, grainlines, sewing lines) and 3 rendering
modes (textured, translucent, wireframe). CSS tooltips on hover.

Refs #140"
```

---

### Task 3: Mount DisplayBar2D in Workspace

**Files:**
- Modify: `src/components/Workspace/Workspace.tsx:362-367`
- Modify: `src/components/Workspace/Workspace.css` (add `position: relative` to viewport-2d if not set)

**Step 1: Add position: relative to viewport-2d**

Check Workspace.css for `.viewport-2d` and ensure it has `position: relative`. If not, add it. This is needed for absolute positioning of DisplayBar2D inside the viewport.

**Step 2: Import and mount DisplayBar2D**

In `src/components/Workspace/Workspace.tsx`, add import:

```typescript
import DisplayBar2D from '../DisplayBar2D/DisplayBar2D';
```

In the viewport-2d div (around line 362), add DisplayBar2D after PatternEditor:

```typescript
<div
  className={`viewport viewport-2d ${viewMode === '3d' ? 'viewport-collapsed' : ''}`}
  style={{ width: get2dWidth() }}
>
  <div className="viewport-label">PATTERN</div>
  <PatternEditor />
  <DisplayBar2D />
</div>
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/Workspace/Workspace.tsx src/components/Workspace/Workspace.css
git commit -m "feat: mount DisplayBar2D in 2D viewport

DisplayBar2D floats on right edge of viewport-2d via absolute positioning.
Visible in 2D and split modes.

Refs #140"
```

---

### Task 4: Wire Display Flags to PieceRenderer and SeamRenderer

**Files:**
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx:34-60` (props + conditional rendering)
- Modify: `src/components/PatternEditor/renderers/SeamRenderer.tsx:14-19` (props)
- Modify: `src/components/PatternEditor/PatternEditor.tsx:204-223` (pass new props)

**Step 1: Add showPieceNames prop to PieceRenderer**

In `src/components/PatternEditor/renderers/PieceRenderer.tsx`, add to `PieceRendererProps`:

```typescript
  showPieceNames: boolean;
```

Add to destructured props. Wrap the piece name text block (the `{(() => {` at line 157) with:

```typescript
{showPieceNames && (() => {
  // ... existing piece name rendering code ...
})()}
```

**Step 2: Add showSewingLines to PatternEditor's SeamRenderer call**

In `src/components/PatternEditor/PatternEditor.tsx`, read `showSewingLines` from editor state and conditionally render SeamRenderer:

```typescript
{showSewingLines && (
  <SeamRenderer
    seams={seams}
    pieces={pieces}
    zoom2D={zoom2D}
    selectedSeamId={editor.selectedSeamId}
  />
)}
```

**Step 3: Pass showPieceNames to PieceRenderer**

In `src/components/PatternEditor/PatternEditor.tsx`, read `showPieceNames` from editor state and pass to PieceRenderer:

```typescript
<PieceRenderer
  pieces={pieces}
  selectedPieceIds={selectedPieceIds}
  zoom2D={zoom2D}
  showSeamAllowance={showSeamAllowance}
  defaultSeamAllowanceWidth={editor.defaultSeamAllowanceWidth}
  showGrainlines={showGrainlines}
  showPieceNames={editor.showPieceNames}
  selectedInternalLine={editor.selectedInternalLine}
  editingPieceNameId={editingPieceNameId}
  onPieceNameDoubleClick={handlePieceNameDoubleClick}
  onPieceNameSave={handlePieceNameSave}
  onPieceNameCancel={handlePieceNameCancel}
/>
```

**Step 4: Add renderMode2D to PieceRenderer for fill adjustments**

Add `renderMode2D` prop to PieceRenderer. Adjust the outline `<path>` fill:

```typescript
const fillColor = renderMode2D === 'wireframe'
  ? 'none'
  : renderMode2D === 'translucent'
  ? (isSelected ? 'rgba(255, 215, 0, 0.08)' : 'rgba(74, 158, 255, 0.03)')
  : (isSelected ? 'rgba(255, 215, 0, 0.18)' : 'rgba(74, 158, 255, 0.08)');
```

**Step 5: Type check and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add src/components/PatternEditor/renderers/PieceRenderer.tsx src/components/PatternEditor/renderers/SeamRenderer.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat: wire display flags to PieceRenderer and SeamRenderer

showPieceNames hides/shows piece name labels. showSewingLines
conditionally renders SeamRenderer. renderMode2D adjusts piece fill
for textured/translucent/wireframe modes.

Refs #140"
```

---

### Task 5: Simplify PropertiesPanel DISPLAY Section

**Files:**
- Modify: `src/components/PropertiesPanel/PropertiesPanel.tsx:171-198`

**Step 1: Remove migrated toggles from DISPLAY section**

Replace the DISPLAY PropertySection (lines 172-198) with:

```typescript
<PropertySection id="display" title="DISPLAY" collapsed={!!collapsedSections.display} onToggle={toggleSection}>
  {editor.showSeamAllowance && (
    <div className="panel-field">
      <label>Default SA (mm)</label>
      <input
        type="number"
        className="panel-input narrow"
        value={editor.defaultSeamAllowanceWidth}
        min={0}
        max={50}
        onChange={e => dispatch(setDefaultSAWidth(Number(e.target.value)))}
      />
    </div>
  )}
  <label className="panel-toggle">
    <input type="checkbox" checked={editor.snapToGrid} onChange={() => dispatch(toggleSnapToGrid())} />
    Snap to grid
  </label>
</PropertySection>
```

Remove unused imports: `toggleSeamAllowance`, `toggleGrainlines` from the import line (line 6) — but only if they're no longer used elsewhere in this file.

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/PropertiesPanel/PropertiesPanel.tsx
git commit -m "refactor: remove migrated display toggles from PropertiesPanel

Seam allowance and grainlines toggles moved to DisplayBar2D.
SA width slider and snap-to-grid remain in PropertiesPanel.

Refs #140"
```

---

### Task 6: Update Copilot Tool Count + Final Verification

**Files:**
- Modify: `src/copilot/__tests__/compoundTools.test.ts` (tool count if changed)
- Modify: `src/copilot/__tests__/toolsE2E.test.ts` (tool count if changed)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no new copilot tools were added, so tool count stays at 118)

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Visual verification**

Run: `npm run dev`
Verify:
- DisplayBar2D appears on right edge of 2D viewport
- All 5 visibility toggles work (icon turns blue when active)
- Rendering modes are radio (only one active, highlighted)
- Tooltips appear on hover
- PropertiesPanel DISPLAY section only shows SA width + snap to grid
- Bar is visible in split mode, hidden in 3D-only mode

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: final adjustments for DisplayBar2D integration

Refs #140"
```
