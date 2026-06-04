# Display Toggles Re-surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-surface the lost display toggles (2D: Reference Images, Line Lengths, render mode; 3D: Garment/Seamlines/Internal Lines, surface mode) per `docs/superpowers/specs/2026-06-04-display-toggles-resurface-design.md`.

**Architecture:** Checkboxes/radios go into the existing `VIEW_MENU` in `LogoMenu.tsx` (zero new state — all actions exist in `editorSlice`/`simulationSlice`). The 9-way 3D surface mode gets a new floating `SurfaceModePill` in the Viewport3D chrome row. Line Lengths is revived with a new `LineLengthLabels` SVG renderer (one label per semantic edge, with pure `detectSemanticEdges` fallback, view-only).

**Tech Stack:** React + Redux Toolkit, SVG renderers, Vitest + @testing-library/react (jsdom), lucide-react icons, Playwright live verify.

**Conventions that bind every task:**
- Typecheck is `npx tsc -b --noEmit` (NOT bare tsc — root tsconfig is vacuous).
- The pre-commit hook runs typecheck + eslint `--max-warnings=0` on staged files. Every commit must be green by construction. Never `--no-verify`.
- Run a single test file: `npx vitest run <path>`.
- No new Redux state, no new persistence — nothing here touches `storageSet`.

---

### Task 1: VIEW_MENU 2D additions (Reference Images, Line Lengths, Render trio)

**Files:**
- Modify: `src/components/shell/LogoMenu.tsx` (imports at lines 4-8, `VIEW_MENU` at lines 62-81)
- Test (create): `src/components/shell/__tests__/LogoMenu.test.tsx`

Context: `VIEW_MENU` is a `MenuItem[]` where `action: (d) => d(someAction())` and `checked: (s: RootState) => boolean`. Items render as `.logo-menu__item` divs containing a `.logo-menu__check` span (`'✓'` when checked) and a `.logo-menu__label` span. The menu opens by clicking the "OpenClo" trigger button, then hovering the top-level "View" item. Clicking an item dispatches and closes the menu.

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/__tests__/LogoMenu.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 *
 * Guards the View menu display toggles (spec 2026-06-04 display-toggles-resurface):
 * 2D — Reference Images / Line Lengths checkboxes + Render mode radio trio.
 * 3D — Garment / Seamlines / Internal Lines checkboxes (Task 2).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer from '../../../store/dockSlice';
import projectReducer from '../../../store/projectSlice';
import toolsReducer from '../../../store/toolSlice';
import constructionReducer from '../../../store/constructionSlice';
import LogoMenu from '../LogoMenu';

// uiExport pulls export-heavy deps (pdf/dxf writers) — irrelevant here.
vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));

afterEach(cleanup);

function renderMenu() {
  const store = configureStore({
    reducer: {
      editor: editorReducer,
      simulation: simulationReducer,
      dock: dockReducer,
      project: projectReducer,
      tools: toolsReducer,
      construction: constructionReducer,
    },
  });
  render(<Provider store={store}><LogoMenu /></Provider>);
  return store;
}

/** Open the dropdown and hover the View top-level entry so its submenu mounts. */
function openViewMenu() {
  fireEvent.click(screen.getByRole('button', { name: /openclo/i }));
  fireEvent.mouseEnter(screen.getByText('View'));
}

function isChecked(label: string): boolean {
  const item = screen.getByText(label).closest('.logo-menu__item')!;
  return item.querySelector('.logo-menu__check')!.textContent === '✓';
}

describe('LogoMenu ▸ View — 2D display toggles', () => {
  it('toggles Reference Images and reflects checked state', () => {
    const store = renderMenu();
    const before = store.getState().editor.showReferenceImages;
    openViewMenu();
    expect(isChecked('Reference Images')).toBe(before);
    fireEvent.click(screen.getByText('Reference Images'));
    expect(store.getState().editor.showReferenceImages).toBe(!before);
  });

  it('toggles Line Lengths', () => {
    const store = renderMenu();
    expect(store.getState().editor.showLineLengths).toBe(false);
    openViewMenu();
    expect(isChecked('Line Lengths')).toBe(false);
    fireEvent.click(screen.getByText('Line Lengths'));
    expect(store.getState().editor.showLineLengths).toBe(true);
  });

  it('Render trio is a radio group: selecting Wireframe unchecks Textured', () => {
    const store = renderMenu();
    expect(store.getState().editor.renderMode2D).toBe('textured');
    openViewMenu();
    expect(isChecked('Render: Textured')).toBe(true);
    expect(isChecked('Render: Wireframe')).toBe(false);
    fireEvent.click(screen.getByText('Render: Wireframe'));
    expect(store.getState().editor.renderMode2D).toBe('wireframe');
    // menu closed on click — reopen and re-assert exclusivity
    openViewMenu();
    expect(isChecked('Render: Wireframe')).toBe(true);
    expect(isChecked('Render: Textured')).toBe(false);
  });
});
```

Note: if `src/store/constructionSlice.ts` does not exist under that exact name, find the construction reducer with `grep -r "construction:" src/store/index.ts` and import what the root store uses. LogoMenu's `useSelector((s) => s)` tolerates missing slices it never reads, but `PieceRenderer` is not mounted here — only the slices read by `checked`/`disabled` callbacks matter (editor, simulation, dock). If the construction import is wrong, simply drop it from the test store.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shell/__tests__/LogoMenu.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Reference Images` (the items don't exist in VIEW_MENU yet).

- [ ] **Step 3: Add the menu items**

In `src/components/shell/LogoMenu.tsx`, extend the `editorSlice` import (lines 4-8):

```ts
import {
  setViewMode, undo, redo, toggleSnapToGrid, toggleSeamAllowance,
  toggleGrainlines, togglePieceNames, toggleSewingLines,
  toggleReferenceImages, toggleLineLengths, setRenderMode2D,
  clearSelection, setZoom2D, setUnits,
} from '../../store/editorSlice';
```

In `VIEW_MENU`, after the `Sewing Lines` entry (line 74) and before the `Dock Suggestions` separator, add:

```ts
  { label: 'Reference Images', action: (d) => d(toggleReferenceImages()), checked: (s) => s.editor.showReferenceImages },
  { label: 'Line Lengths', action: (d) => d(toggleLineLengths()), checked: (s) => s.editor.showLineLengths },
  { separator: true, label: '' },
  { label: 'Render: Textured', action: (d) => d(setRenderMode2D('textured')), checked: (s) => s.editor.renderMode2D === 'textured' },
  { label: 'Render: Translucent', action: (d) => d(setRenderMode2D('translucent')), checked: (s) => s.editor.renderMode2D === 'translucent' },
  { label: 'Render: Wireframe', action: (d) => d(setRenderMode2D('wireframe')), checked: (s) => s.editor.renderMode2D === 'wireframe' },
```

(`toggleReferenceImages`, `toggleLineLengths`, `setRenderMode2D` already exist in `editorSlice` — lines 129-155. Do NOT create new reducers.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shell/__tests__/LogoMenu.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/LogoMenu.tsx src/components/shell/__tests__/LogoMenu.test.tsx
git commit -m "feat(view-menu): re-surface Reference Images, Line Lengths and 2D render mode (spec 2026-06-04)"
```

---

### Task 2: VIEW_MENU 3D section (Garment / Seamlines / Internal Lines)

**Files:**
- Modify: `src/components/shell/LogoMenu.tsx` (simulationSlice import at line 9, `VIEW_MENU`)
- Test (modify): `src/components/shell/__tests__/LogoMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/components/shell/__tests__/LogoMenu.test.tsx`:

```tsx
describe('LogoMenu ▸ View — 3D display toggles', () => {
  it.each([
    ['3D: Garment', 'showGarment'],
    ['3D: Seamlines', 'showSeamlines3D'],
    ['3D: Internal Lines', 'showInternalLines3D'],
  ] as const)('%s toggles simulation.%s and reflects checked state', (label, field) => {
    const store = renderMenu();
    const before = store.getState().simulation[field];
    openViewMenu();
    expect(isChecked(label)).toBe(before);
    fireEvent.click(screen.getByText(label));
    expect(store.getState().simulation[field]).toBe(!before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shell/__tests__/LogoMenu.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 3D: Garment`.

- [ ] **Step 3: Add the 3D section**

In `src/components/shell/LogoMenu.tsx`, extend the simulationSlice import (line 9):

```ts
import {
  startSimulation, pauseSimulation, resetSimulation, setViewMode3D,
  toggleGarment, toggleSeamlines3D, toggleInternalLines3D,
} from '../../store/simulationSlice';
```

In `VIEW_MENU`, immediately after the `Render: Wireframe` entry added in Task 1, add:

```ts
  { separator: true, label: '' },
  { label: '3D: Garment', action: (d) => d(toggleGarment()), checked: (s) => s.simulation.showGarment },
  { label: '3D: Seamlines', action: (d) => d(toggleSeamlines3D()), checked: (s) => s.simulation.showSeamlines3D },
  { label: '3D: Internal Lines', action: (d) => d(toggleInternalLines3D()), checked: (s) => s.simulation.showInternalLines3D },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shell/__tests__/LogoMenu.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/LogoMenu.tsx src/components/shell/__tests__/LogoMenu.test.tsx
git commit -m "feat(view-menu): 3D section — Garment / Seamlines / Internal Lines visibility (spec 2026-06-04)"
```

---

### Task 3: SurfaceModePill (9-way 3D surface mode picker)

**Files:**
- Create: `src/components/Viewport3D/SurfaceModePill.tsx`
- Create: `src/components/Viewport3D/SurfaceModePill.css`
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (mount after `<CollisionBodyPanel ... />`, ~line 852)
- Test (create): `src/components/Viewport3D/__tests__/SurfaceModePill.test.tsx`

Context: the Viewport3D top chrome row has inline-styled "Render" (`top: 8, right: 52`) and "CB" (`top: 8, right: 8`) buttons gated on `!hideChrome`. The pill sits at `top: 8px; right: 116px`. `setSurfaceMode3D` and `type SurfaceMode3D` come from `src/store/simulationSlice.ts` (same imports DisplayBar3D uses).

- [ ] **Step 1: Write the failing test**

Create `src/components/Viewport3D/__tests__/SurfaceModePill.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 *
 * Guards the SurfaceModePill — the floating 9-way surface-mode picker for the
 * 3D viewport (spec 2026-06-04 display-toggles-resurface §3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, { setSurfaceMode3D } from '../../../store/simulationSlice';
import SurfaceModePill from '../SurfaceModePill';

afterEach(cleanup);

function renderPill() {
  const store = configureStore({ reducer: { simulation: simulationReducer } });
  render(<Provider store={store}><SurfaceModePill /></Provider>);
  return store;
}

describe('SurfaceModePill', () => {
  it('collapsed trigger names the current mode', () => {
    const store = renderPill();
    const mode = store.getState().simulation.surfaceMode3D;
    const trigger = screen.getByRole('button', { name: /^surface mode:/i });
    expect(trigger.getAttribute('aria-label')!.toLowerCase()).toContain(String(mode).split('-')[0]);
  });

  it('opens a flyout with all 9 modes', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^surface mode:/i }));
    const group = screen.getByRole('group', { name: 'Surface mode' });
    expect(group.querySelectorAll('button').length).toBe(9);
  });

  it('selecting X-Ray dispatches setSurfaceMode3D and closes the flyout', () => {
    const store = renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^surface mode:/i }));
    fireEvent.click(screen.getByRole('button', { name: 'X-Ray' }));
    expect(store.getState().simulation.surfaceMode3D).toBe('xray');
    expect(screen.queryByRole('group', { name: 'Surface mode' })).toBeNull();
    // trigger label follows the store
    expect(screen.getByRole('button', { name: 'Surface mode: X-Ray' })).toBeTruthy();
  });

  it('marks the current mode with aria-pressed', () => {
    const store = renderPill();
    store.dispatch(setSurfaceMode3D('mesh'));
    fireEvent.click(screen.getByRole('button', { name: /^surface mode:/i }));
    expect(screen.getByRole('button', { name: 'Mesh' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Flat' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('Escape closes the flyout', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^surface mode:/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Surface mode' })).toBeNull();
  });

  it('a mousedown outside the pill closes the flyout', () => {
    renderPill();
    fireEvent.click(screen.getByRole('button', { name: /^surface mode:/i }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group', { name: 'Surface mode' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Viewport3D/__tests__/SurfaceModePill.test.tsx`
Expected: FAIL — cannot resolve `../SurfaceModePill`.

- [ ] **Step 3: Implement the component**

Create `src/components/Viewport3D/SurfaceModePill.tsx`:

```tsx
/**
 * SurfaceModePill — floating 9-way surface-mode picker for the 3D viewport.
 *
 * Collapsed: one pill button showing the current mode (icon + label).
 * Open: a 3×3 flyout grid of all modes. Outside-mousedown + Escape close;
 * the trigger lives inside the wrapper ref so opening never self-closes
 * (DockToolPicker pattern). Distinct concern from RenderSettingsPanel
 * (scene/environment/export) — this only sets simulation.surfaceMode3D.
 */
import { useRef, useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Image, Droplets, Box, Layers, Square, Scan, Circle, CircleDot, ImagePlus,
  type LucideIcon,
} from 'lucide-react';
import type { RootState } from '../../store';
import { setSurfaceMode3D } from '../../store/simulationSlice';
import type { SurfaceMode3D } from '../../store/simulationSlice';
import './SurfaceModePill.css';

interface ModeDef {
  mode: SurfaceMode3D;
  label: string;
  icon: LucideIcon;
}

// Same inventory + icons the orphaned DisplayBar3D exposed.
const MODES: ModeDef[] = [
  { mode: 'textured', label: 'Textured', icon: Image },
  { mode: 'translucent', label: 'Translucent', icon: Droplets },
  { mode: 'mesh', label: 'Mesh', icon: Box },
  { mode: 'thick', label: 'Thick Surface', icon: Layers },
  { mode: 'flat', label: 'Flat', icon: Square },
  { mode: 'xray', label: 'X-Ray', icon: Scan },
  { mode: 'shaded', label: 'Shaded', icon: Circle },
  { mode: 'shaded-wire', label: 'Shaded + Wire', icon: CircleDot },
  { mode: 'textured-wire', label: 'Textured + Wire', icon: ImagePlus },
];

export default function SurfaceModePill() {
  const dispatch = useDispatch();
  const surfaceMode3D = useSelector((s: RootState) => s.simulation.surfaceMode3D);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = MODES.find(m => m.mode === surfaceMode3D) ?? MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={wrapperRef} className="surface-pill">
      <button
        className={`surface-pill__trigger ${open ? 'surface-pill__trigger--open' : ''}`}
        aria-label={`Surface mode: ${current.label}`}
        onClick={() => setOpen(o => !o)}
      >
        <CurrentIcon size={14} />
        <span>{current.label}</span>
      </button>
      {open && (
        <div className="surface-pill__flyout" role="group" aria-label="Surface mode">
          {MODES.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              className={`surface-pill__option ${mode === surfaceMode3D ? 'surface-pill__option--active' : ''}`}
              aria-label={label}
              aria-pressed={mode === surfaceMode3D}
              onClick={() => { dispatch(setSurfaceMode3D(mode)); setOpen(false); }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `src/components/Viewport3D/SurfaceModePill.css` (matches the inline-styled chrome siblings — dark `rgba(30,30,30)` chrome, `#4a9eff` accent):

```css
.surface-pill {
  position: absolute;
  top: 8px;
  right: 116px;
  z-index: 25;
}

.surface-pill__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 30, 30, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ccc;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  font-family: Inter, sans-serif;
}

.surface-pill__trigger--open {
  background: rgba(74, 158, 255, 0.2);
  color: #4a9eff;
}

.surface-pill__flyout {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 264px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 6px;
  z-index: 30;
}

.surface-pill__option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #ccc;
  padding: 8px 4px;
  cursor: pointer;
  font-size: 10px;
  font-family: Inter, sans-serif;
  text-align: center;
}

.surface-pill__option:hover {
  background: rgba(255, 255, 255, 0.08);
}

.surface-pill__option--active {
  border-color: #4a9eff;
  color: #4a9eff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Viewport3D/__tests__/SurfaceModePill.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Mount in Viewport3D**

In `src/components/Viewport3D/Viewport3D.tsx`:

Add the import next to the other Viewport3D component imports (e.g. after the `FitMapToggle` import at line 21):

```ts
import SurfaceModePill from './SurfaceModePill';
```

After the `<CollisionBodyPanel ... />` close (~line 852), add:

```tsx
      {/* Surface mode picker (spec 2026-06-04 display-toggles-resurface) */}
      {!hideChrome && <SurfaceModePill />}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/Viewport3D/SurfaceModePill.tsx src/components/Viewport3D/SurfaceModePill.css src/components/Viewport3D/__tests__/SurfaceModePill.test.tsx src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(viewport-3d): SurfaceModePill — floating 9-way surface mode picker (spec 2026-06-04)"
```

---

### Task 4: Line Lengths revival (LineLengthLabels renderer + prop threading)

**Files:**
- Create: `src/components/PatternEditor/renderers/LineLengthLabels.tsx`
- Modify: `src/components/PatternEditor/renderers/PieceRenderer.tsx` (both prop interfaces + SinglePiece render + the `sortedPieces.map` call)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (destructure at line 91, `<PieceRenderer>` call at lines 643-658)
- Test (create): `src/components/PatternEditor/renderers/__tests__/LineLengthLabels.test.tsx`

Context: `SinglePiece`'s root `<g>` carries `translate(position) rotate(rotation, cx, cy)` — children render in piece-local mm coordinates; text must counter-rotate around its own anchor to stay horizontal (same trick as the piece-label block at PieceRenderer line 442). Canvas units are mm; `formatDimension(valueMm, units)` lives in `src/utils/units.ts`. `detectSemanticEdges(piece)` (`src/utils/semanticEdges.ts`) is pure. `computePathArcLength(commands, startIdx?, endIdx?)` and `pointAtPathDistance(commands, distance, startIdx?, endIdx?)` live in `src/utils/geometry/arcLength.ts`. `SemanticEdge.segmentRange` is `[start, end)` over outline command indices.

- [ ] **Step 1: Write the failing test**

Create `src/components/PatternEditor/renderers/__tests__/LineLengthLabels.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 *
 * Guards the Line Lengths revival (spec 2026-06-04 display-toggles-resurface §4):
 * one label per semantic edge, formatDimension output, detection fallback for
 * pieces without stored edges (DXF imports).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { PatternPiece, SemanticEdge } from '../../../../types/types';
import LineLengthLabels from '../LineLengthLabels';

afterEach(cleanup);

// 100×100mm square: M + 4 line segments (outline indices 1-4).
function squarePiece(edges?: SemanticEdge[]): PatternPiece {
  return {
    id: 'p1',
    name: 'P',
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'L', values: [0, 0] },
    ],
    internals: [],
    createdAt: 0,
    updatedAt: 0,
    active: true,
    edges,
  } as unknown as PatternPiece;
}

function renderLabels(piece: PatternPiece, units: 'cm' | 'inches' | 'mm' = 'cm') {
  return render(
    <svg>
      <LineLengthLabels piece={piece} zoom2D={1} units={units} />
    </svg>,
  );
}

describe('LineLengthLabels', () => {
  it('renders one label per stored semantic edge, formatted in active units', () => {
    const piece = squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]);
    const { container } = renderLabels(piece, 'cm');
    const texts = container.querySelectorAll('text');
    expect(texts.length).toBe(1);
    expect(texts[0].textContent).toBe('10.0 cm');
  });

  it('formats in inches when units=inches', () => {
    const piece = squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]);
    const { container } = renderLabels(piece, 'inches');
    expect(container.querySelector('text')!.textContent).toBe('3.9 in');
  });

  it('positions the label at the edge midpoint', () => {
    const piece = squarePiece([
      // segment 1 runs (0,0)→(100,0): midpoint (50, 0)
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]);
    const { container } = renderLabels(piece);
    const text = container.querySelector('text')!;
    expect(Number(text.getAttribute('x'))).toBeCloseTo(50);
    expect(Number(text.getAttribute('y'))).toBeCloseTo(0);
  });

  it('falls back to detectSemanticEdges for pieces without stored edges (DXF path)', () => {
    // A 4-segment square groups into 4 zones (top/right/bottom/left) → 4 edges.
    const { container } = renderLabels(squarePiece(undefined));
    const texts = container.querySelectorAll('text');
    expect(texts.length).toBe(4);
    for (const t of texts) expect(t.textContent).toBe('10.0 cm');
  });

  it('computes length from the outline when edge.length is missing', () => {
    const piece = squarePiece([
      { id: 'e1', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' },
    ]);
    const { container } = renderLabels(piece);
    expect(container.querySelector('text')!.textContent).toBe('10.0 cm');
  });

  it('skips degenerate edges (< 1mm)', () => {
    const piece = {
      ...squarePiece(),
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [0.5, 0] },
      ],
      edges: [{ id: 'e1', name: 'edge', segmentRange: [1, 2], edgeType: 'unknown', length: 0.5 }],
    } as unknown as PatternPiece;
    const { container } = renderLabels(piece);
    expect(container.querySelectorAll('text').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/LineLengthLabels.test.tsx`
Expected: FAIL — cannot resolve `../LineLengthLabels`.

- [ ] **Step 3: Implement the renderer**

Create `src/components/PatternEditor/renderers/LineLengthLabels.tsx`:

```tsx
/**
 * LineLengthLabels — one length label per semantic edge of a piece
 * (spec 2026-06-04 display-toggles-resurface §4).
 *
 * View-only: pieces without stored edges (fresh DXF imports) fall back to the
 * pure detectSemanticEdges; detected edges are NOT written back to the store.
 * Rendered inside SinglePiece's transformed <g>, so coordinates are piece-local
 * mm; each label counter-rotates around its own anchor to stay horizontal
 * (same trick as the piece-name label block).
 */
import { useMemo } from 'react';
import type { PatternPiece, SemanticEdge, UnitSystem } from '../../../types/types';
import { computePathArcLength, pointAtPathDistance } from '../../../utils/geometry/arcLength';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { formatDimension } from '../../../utils/units';

interface LineLengthLabelsProps {
  piece: PatternPiece;
  zoom2D: number;
  units: UnitSystem;
}

interface Label {
  id: string;
  x: number;
  y: number;
  text: string;
}

export default function LineLengthLabels({ piece, zoom2D, units }: LineLengthLabelsProps) {
  const labels = useMemo<Label[]>(() => {
    const edges: SemanticEdge[] = piece.edges?.length ? piece.edges : detectSemanticEdges(piece);
    const out: Label[] = [];
    for (const edge of edges) {
      const [start, end] = edge.segmentRange;
      const len = edge.length ?? computePathArcLength(piece.outline, start, end);
      if (len < 1) continue; // degenerate edge
      const mid = pointAtPathDistance(piece.outline, len / 2, start, end);
      if (!mid) continue;
      out.push({ id: edge.id, x: mid.x, y: mid.y, text: formatDimension(len, units) });
    }
    return out;
  }, [piece, units]);

  return (
    <g className="line-length-labels">
      {labels.map(l => (
        <text
          key={l.id}
          x={l.x}
          y={l.y}
          transform={`rotate(${-piece.rotation}, ${l.x}, ${l.y})`}
          fontSize={9 / zoom2D}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          opacity={0.75}
          style={{ fill: 'var(--ink-on-light)', fontFamily: 'var(--font-mono-2d)' }}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PatternEditor/renderers/__tests__/LineLengthLabels.test.tsx`
Expected: PASS (6 tests). If the fallback test finds a count other than 4, inspect what `detectSemanticEdges` returned for the square before touching the component — the zone grouping (top/right/bottom/left) should yield exactly 4 groups for a 4-segment square.

- [ ] **Step 5: Thread the props**

In `src/components/PatternEditor/renderers/PieceRenderer.tsx`:

1. Import at the top (next to the other renderer imports):

```ts
import LineLengthLabels from './LineLengthLabels';
import type { UnitSystem } from '../../../types/types';
```

(`PatternPiece, PathCommand` are already imported from types — merge into one import statement: `import { PatternPiece, PathCommand, UnitSystem } from '../../../types/types';` and drop the separate type import.)

2. Add to `SinglePieceProps` (after `renderMode2D` at line 79):

```ts
  showLineLengths: boolean;
  units: UnitSystem;
```

3. Add `showLineLengths, units,` to the `SinglePiece` destructuring (after `renderMode2D`).

4. In SinglePiece's JSX, immediately after the `{showPieceNames && (() => { ... })()}` block (closes at line 478), add:

```tsx
      {showLineLengths && (
        <LineLengthLabels piece={piece} zoom2D={zoom2D} units={units} />
      )}
```

5. Add to `PieceRendererProps` (after `renderMode2D` at line 544):

```ts
  showLineLengths: boolean;
  units: UnitSystem;
```

6. Add `showLineLengths, units,` to the `PieceRenderer` destructuring, and pass both in the `<SinglePiece>` call (after `renderMode2D={renderMode2D}`):

```tsx
          showLineLengths={showLineLengths}
          units={units}
```

In `src/components/PatternEditor/PatternEditor.tsx`:

7. Line 91 — add `showLineLengths` to the editor destructure:

```ts
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, showPieceNames, showSewingLines, showLineLengths, renderMode2D, gridSize, units, fitViewToken } = editor;
```

8. In the `<PieceRenderer>` call (lines 643-658), after `renderMode2D={renderMode2D}`:

```tsx
            showLineLengths={showLineLengths}
            units={units}
```

- [ ] **Step 6: Typecheck + run the full PatternEditor-area tests**

Run: `npx tsc -b --noEmit`
Expected: clean. If other call sites of `<PieceRenderer>` exist (grep `<PieceRenderer` — only PatternEditor.tsx is expected), thread the two props there too.

Run: `npx vitest run src/components/PatternEditor`
Expected: PASS (existing PatternEditor-area suites unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/renderers/LineLengthLabels.tsx src/components/PatternEditor/renderers/__tests__/LineLengthLabels.test.tsx src/components/PatternEditor/renderers/PieceRenderer.tsx src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(canvas-2d): revive Line Lengths — per-semantic-edge length labels (spec 2026-06-04)"
```

---

### Task 5: Full gates + live verification

**Files:**
- Create (untracked, do NOT commit): `scripts/verify-display-toggles.mjs`

- [ ] **Step 1: Run the full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Write the live verify script**

Create `scripts/verify-display-toggles.mjs` (untracked by convention, like the other `verify-*.mjs`):

```js
// Live check: View-menu display toggles + SurfaceModePill + Line Lengths labels.
// Run the dev server on 5183 first:  npm run dev -- --port 5183
import { chromium } from 'playwright';

const URL = 'http://localhost:5183';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__OPENCLO_STORE__, { timeout: 15000 });

const results = [];
const check = (name, ok) => { results.push([name, ok]); console.log(ok ? 'PASS' : 'FAIL', '-', name); };
const state = () => page.evaluate(() => window.__OPENCLO_STORE__.getState());

// ── 1. View menu: Reference Images + Line Lengths + render mode ──
await page.evaluate(() => window.__OPENCLO_STORE__.dispatch({ type: 'editor/setViewMode', payload: '2d' }));
await page.click('.logo-menu__trigger');
await page.hover('.logo-menu__item:has-text("View")');
await page.click('.logo-menu__item:has-text("Line Lengths")');
check('View ▸ Line Lengths toggles on', (await state()).editor.showLineLengths === true);

await page.click('.logo-menu__trigger');
await page.hover('.logo-menu__item:has-text("View")');
await page.click('.logo-menu__item:has-text("Render: Wireframe")');
check('View ▸ Render: Wireframe', (await state()).editor.renderMode2D === 'wireframe');

await page.click('.logo-menu__trigger');
await page.hover('.logo-menu__item:has-text("View")');
await page.click('.logo-menu__item:has-text("Reference Images")');
check('View ▸ Reference Images toggles off', (await state()).editor.showReferenceImages === false);

// ── 2. View menu 3D section ──
await page.click('.logo-menu__trigger');
await page.hover('.logo-menu__item:has-text("View")');
const garmentBefore = (await state()).simulation.showGarment;
await page.click('.logo-menu__item:has-text("3D: Garment")');
check('View ▸ 3D: Garment flips', (await state()).simulation.showGarment === !garmentBefore);

// ── 3. SurfaceModePill in 3D view ──
await page.evaluate(() => window.__OPENCLO_STORE__.dispatch({ type: 'editor/setViewMode', payload: '3d' }));
await page.waitForTimeout(500);
const pill = page.locator('.surface-pill__trigger');
check('SurfaceModePill visible in 3D', await pill.count() === 1);
await pill.click();
check('flyout shows 9 modes', await page.locator('.surface-pill__option').count() === 9);
await page.locator('.surface-pill__option', { hasText: 'X-Ray' }).click();
check('X-Ray dispatched', (await state()).simulation.surfaceMode3D === 'xray');
check('flyout closed after pick', await page.locator('.surface-pill__flyout').count() === 0);

// ── 4. Line Lengths labels render on a piece ──
await page.evaluate(() => window.__OPENCLO_STORE__.dispatch({ type: 'editor/setViewMode', payload: '2d' }));
await page.evaluate(() => {
  window.__OPENCLO_STORE__.dispatch({
    type: 'project/addPiece',
    payload: {
      id: 'verify-p1', name: 'Verify', position: { x: 100, y: 100 }, rotation: 0,
      mirrored: false, seamAllowance: 10,
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] },
        { type: 'L', values: [0, 0] },
      ],
      internals: [], createdAt: Date.now(), updatedAt: Date.now(), active: true,
    },
  });
});
await page.waitForTimeout(500);
const labelCount = await page.locator('.line-length-labels text').count();
check('Line Lengths labels render (expect 4 for a rectangle)', labelCount === 4);

await page.screenshot({ path: 'design-handoff/ui-screenshots/verify-display-toggles.png' });
const ok = results.every(([, r]) => r);
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 3: Run it**

```bash
# terminal 1 (or background): npm run dev -- --port 5183
node scripts/verify-display-toggles.mjs
```

Expected: `ALL PASS`. If the SurfaceModePill collides visually with the Render button (check the screenshot), nudge `.surface-pill { right: ... }` and re-run — the spec allows this.

- [ ] **Step 4: Verify nothing unintended is staged, final state**

```bash
git status
```

Expected: only `scripts/verify-display-toggles.mjs` + the screenshot untracked; working tree otherwise clean; 4 feature commits on `feat/canvas-2d-redesign`.
```

---

## Plan Self-Review (done at write time)

- **Spec coverage:** §1 → Task 1; §2 → Task 2; §3 → Task 3; §4 → Task 4; Testing → in-task TDD + Task 5 live script. No gaps.
- **Placeholders:** none — every code step carries the full code.
- **Type consistency:** `showLineLengths: boolean` + `units: UnitSystem` named identically across SinglePieceProps / PieceRendererProps / PatternEditor; `SurfaceMode3D` imported from `simulationSlice` exactly as DisplayBar3D does; `SemanticEdge.segmentRange` `[start, end)` used consistently.
