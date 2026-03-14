# Measure Sub-Tool UI Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the single `measure` tool into 3 sub-tools (point-to-point, along-curve, compare-curves) accessible via hold-click in the Toolbar2D, following CLO3D's pattern. Add a `ToolOptionsBar2D` sidebar for tool-specific options.

**Architecture:** Each measure mode becomes its own `ToolDefinition` registered in the tool registry. `useMeasureTool` derives `measureMode` from `activeTool2D` instead of reading from `toolOptions`. A new `ToolOptionsBar2D` component (mirroring the 3D `ToolOptionsBar`) renders options for the active 2D tool.

**Tech Stack:** React, Redux (toolSlice), existing ToolDefinition system, CSS (reuse ToolOptionsBar.css)

---

### Task 1: Create `measureCurve` tool definition

**Files:**
- Create: `src/tools/definitions/measureCurve.tsx`

**Step 1: Write the tool definition file**

```tsx
import React from 'react';
import { ToolDefinition } from '../types';

const MeasureCurveIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12C5 4 13 4 15 12" />
    <path d="M5 9.5V11M9 5.5V7.5M13 9.5V11" />
  </svg>
);

export const measureCurveTool: ToolDefinition = {
  id: 'measureCurve',
  name: 'Measure Along Curve',
  description: 'Measure arc length along a pattern edge',
  context: '2d',
  icon: MeasureCurveIcon,
  cursor: 'crosshair',
  shortcut: 'm',
  group: 'annotation',
  options: [
    {
      id: 'markerInterval',
      label: 'Marker Interval',
      type: 'select',
      value: '50',
      choices: [
        { label: '25mm', value: '25' },
        { label: '50mm', value: '50' },
        { label: '100mm', value: '100' },
      ],
    },
  ],
  copilot: {
    description: 'Measure the arc length along a pattern edge or curve. Click an edge to see its total length with markers at regular intervals.',
    examples: [
      'Measure this edge along the curve',
      'What is the armhole arc length?',
      'Show me the sleeve cap length',
    ],
    keywords: ['curve', 'arc length', 'along', 'walk', 'edge length', 'seam length'],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      markerInterval: 'Distance between markers when measuring along a curve (mm)',
    },
  },
};
```

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/tools/definitions/measureCurve.tsx
git commit -m "feat: add measureCurve tool definition (#263)"
```

---

### Task 2: Create `compareCurves` tool definition

**Files:**
- Create: `src/tools/definitions/compareCurves.tsx`

**Step 1: Write the tool definition file**

```tsx
import React from 'react';
import { ToolDefinition } from '../types';

const CompareCurvesIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10C5 4 13 4 15 10" />
    <path d="M3 13C5 7 13 7 15 13" strokeDasharray="2 2" />
  </svg>
);

export const compareCurvesTool: ToolDefinition = {
  id: 'compareCurves',
  name: 'Compare Curves',
  description: 'Compare arc lengths of two pattern edges',
  context: '2d',
  icon: CompareCurvesIcon,
  cursor: 'crosshair',
  shortcut: 'm',
  group: 'annotation',
  options: [
    {
      id: 'markerInterval',
      label: 'Marker Interval',
      type: 'select',
      value: '50',
      choices: [
        { label: '25mm', value: '25' },
        { label: '50mm', value: '50' },
        { label: '100mm', value: '100' },
      ],
    },
  ],
  copilot: {
    description: 'Compare the arc lengths of two pattern edges to check ease and fit. Click two edges to see the difference, ease percentage, and per-point divergence.',
    examples: [
      'Compare the armhole and sleeve cap lengths',
      'Check ease between these two edges',
      'Are these two seam lengths matching?',
    ],
    keywords: ['compare', 'ease', 'delta', 'difference', 'match', 'seam length'],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      markerInterval: 'Distance between markers when comparing curves (mm)',
    },
  },
};
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/tools/definitions/compareCurves.tsx
git commit -m "feat: add compareCurves tool definition (#263)"
```

---

### Task 3: Simplify `measure.tsx` and register new tools

**Files:**
- Modify: `src/tools/definitions/measure.tsx` — remove `measureMode` and `markerInterval` options
- Modify: `src/tools/index.ts` — import and register `measureCurveTool` and `compareCurvesTool`

**Step 1: Update measure.tsx**

Remove the `measureMode` select option (lines 31-39) and `markerInterval` select option (lines 64-74) from the `options` array. Keep `showAngle` and `cumulative`. Also remove `measureMode` from `copilot.parameterHints` and `markerInterval` from `copilot.parameterHints`.

Remove copilot examples/keywords related to curve and compare modes (those belong to the new tools now).

**Step 2: Update index.ts**

Add imports:
```typescript
import { measureCurveTool } from './definitions/measureCurve';
import { compareCurvesTool } from './definitions/compareCurves';
```

Add to `allTools` array in the `// 2D Tools — Annotation` section, after `measureTool`:
```typescript
measureCurveTool,
compareCurvesTool,
```

**Step 3: Verify**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/tools/definitions/measure.tsx src/tools/index.ts
git commit -m "feat: register measureCurve and compareCurves tools, simplify measure (#263)"
```

---

### Task 4: Update Toolbar2D group

**Files:**
- Modify: `src/components/Toolbar2D/Toolbar2D.tsx:43`

**Step 1: Update TOOL_GROUPS**

Change line 43 from:
```typescript
['measure', 'grading'],
```
to:
```typescript
['measure', 'measureCurve', 'compareCurves', 'grading'],
```

**Step 2: Verify the toolbar renders**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/Toolbar2D/Toolbar2D.tsx
git commit -m "feat: add measure sub-tools to Toolbar2D group (#263)"
```

---

### Task 5: Derive measureMode from activeTool2D in useMeasureTool

**Files:**
- Modify: `src/components/PatternEditor/useMeasureTool.ts`

**Step 1: Change measureMode derivation**

Replace lines 153-155:
```typescript
const measureMode: MeasureMode = useSelector(
  (s: RootState) => (s.tools.toolOptions['measure']?.measureMode as MeasureMode) ?? 'point-to-point'
);
```

With:
```typescript
const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
const measureMode: MeasureMode =
  activeTool2D === 'compareCurves' ? 'compare' :
  activeTool2D === 'measureCurve' ? 'along-curve' :
  'point-to-point';
```

**Step 2: Update markerInterval to read from active tool's options**

Replace lines 156-158:
```typescript
const markerInterval = useSelector(
  (s: RootState) => Number(s.tools.toolOptions['measure']?.markerInterval ?? '50')
);
```

With:
```typescript
const markerInterval = useSelector(
  (s: RootState) => Number(s.tools.toolOptions[activeTool2D]?.markerInterval ?? '50')
);
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Run: `npm run test -- --run src/components/PatternEditor`

**Step 4: Commit**

```bash
git add src/components/PatternEditor/useMeasureTool.ts
git commit -m "feat: derive measureMode from activeTool2D (#263)"
```

---

### Task 6: Update useEditorInteractions to recognize all measure tool IDs

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`

**Step 1: Add MEASURE_TOOL_IDS constant**

Near the top of the file (after imports), add:
```typescript
const MEASURE_TOOL_IDS = new Set(['measure', 'measureCurve', 'compareCurves']);
```

**Step 2: Update the clear-on-switch effect (line 207)**

Change:
```typescript
if (activeTool !== 'measure') measureTool.clear();
```
To:
```typescript
if (!MEASURE_TOOL_IDS.has(activeTool)) measureTool.clear();
```

**Step 3: Update the keydown handler (line 229)**

Change:
```typescript
if (activeTool === 'measure') handlers.push(measureTool.handleKeyDown);
```
To:
```typescript
if (MEASURE_TOOL_IDS.has(activeTool)) handlers.push(measureTool.handleKeyDown);
```

**Step 4: Verify**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat: recognize all measure tool IDs in useEditorInteractions (#263)"
```

---

### Task 7: Create ToolOptionsBar2D component

**Files:**
- Create: `src/components/Toolbar2D/ToolOptionsBar2D.tsx`

**Step 1: Write the component**

Mirror the 3D `ToolOptionsBar` (`src/components/Toolbar3D/ToolOptionsBar.tsx`) but read from `activeTool2D` instead of `activeTool3D`. Import the same CSS (`../Toolbar3D/ToolOptionsBar.css`).

```tsx
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import '../Toolbar3D/ToolOptionsBar.css';

export default function ToolOptionsBar2D() {
  const dispatch = useDispatch();
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions[activeTool2D] ?? {});

  const toolDef = toolRegistry.getTool(activeTool2D);
  const options = toolDef?.options;

  const handleChange = useCallback((optionId: string, value: any) => {
    dispatch(setToolOption({ toolId: activeTool2D, optionId, value }));
  }, [dispatch, activeTool2D]);

  if (!options || options.length === 0) return null;

  // Reuse OptionControl from ToolOptionsBar or inline the same switch
  return (
    <div className="tool-options-bar">
      <span className="tool-options-label">{toolDef?.name}</span>
      <div className="tool-options-divider" />
      {options.map(opt => (
        <OptionControl
          key={opt.id}
          option={opt}
          value={toolOptions[opt.id] ?? opt.value}
          onChange={(v) => handleChange(opt.id, v)}
        />
      ))}
    </div>
  );
}

// Inline OptionControl (same as 3D version)
function OptionControl({ option, value, onChange }: {
  option: { id: string; label: string; type: string; value: any; min?: number; max?: number; step?: number; choices?: { label: string; value: any }[] };
  value: any;
  onChange: (v: any) => void;
}) {
  switch (option.type) {
    case 'number':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <input type="range" className="tool-option-slider"
            min={option.min ?? 0} max={option.max ?? 100} step={option.step ?? 1}
            value={value} onChange={e => onChange(Number(e.target.value))} />
          <span className="tool-option-value">{value}</span>
        </div>
      );
    case 'toggle':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <button className={`tool-option-toggle ${value ? 'on' : ''}`}
            onClick={() => onChange(!value)}>
            {value ? 'ON' : 'OFF'}
          </button>
        </div>
      );
    case 'select':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <select className="tool-option-select" value={value}
            onChange={e => onChange(e.target.value)}>
            {option.choices?.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      );
    case 'color':
      return (
        <div className="tool-option-item">
          <label className="tool-option-label">{option.label}</label>
          <input type="color" className="tool-option-color" value={value}
            onChange={e => onChange(e.target.value)} />
        </div>
      );
    default:
      return null;
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/Toolbar2D/ToolOptionsBar2D.tsx
git commit -m "feat: create ToolOptionsBar2D component (#263)"
```

---

### Task 8: Mount ToolOptionsBar2D in Workspace

**Files:**
- Modify: `src/components/Workspace/Workspace.tsx`
- Modify: `src/components/Workspace/Workspace.css`

**Step 1: Import ToolOptionsBar2D**

Add import near line 14 (after the 3D ToolOptionsBar import):
```typescript
import ToolOptionsBar2D from '../Toolbar2D/ToolOptionsBar2D';
```

**Step 2: Wrap the 2D viewport content**

Change the 2D viewport div (lines 401-407) from:
```tsx
<div className={`viewport viewport-2d ${viewMode === '3d' ? 'viewport-collapsed' : ''}`}
  style={{ width: get2dWidth() }}>
  <div className="viewport-label">PATTERN</div>
  <PatternEditor />
  <DisplayBar2D />
</div>
```

To:
```tsx
<div className={`viewport viewport-2d ${viewMode === '3d' ? 'viewport-collapsed' : ''}`}
  style={{ width: get2dWidth() }}>
  <div className="viewport-label">PATTERN</div>
  <div className="viewport2d-with-options">
    <PatternEditor />
    <ToolOptionsBar2D />
  </div>
  <DisplayBar2D />
</div>
```

**Step 3: Add CSS for viewport2d-with-options**

Add to `Workspace.css`:
```css
.viewport2d-with-options {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.viewport2d-with-options > *:first-child {
  flex: 1;
  min-width: 0;
}
```

Also update `.viewport-2d` to use flex column layout:
```css
.viewport-2d {
  background: var(--bg-canvas);
  display: flex;
  flex-direction: column;
}
```

**Step 4: Verify visually**

Run: `npm run dev` and check:
1. Select measure tool → no options bar appears (only `showAngle` and `cumulative` toggles, which are minor)
2. Hold-click measure → sub-tools appear → select "Measure Along Curve"
3. Options bar appears on the right with Marker Interval selector
4. Select "Compare Curves" → options bar updates
5. Switch to any non-measure tool → options bar disappears

**Step 5: Verify**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/components/Workspace/Workspace.tsx src/components/Workspace/Workspace.css
git commit -m "feat: mount ToolOptionsBar2D in 2D viewport (#263)"
```

---

### Task 9: Update PatternEditor to pass measure props for all 3 tool IDs

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`

**Step 1: Check if PatternEditor needs changes**

The `PatternEditor` gets `measureMode` from `measureTool.measureMode`, which is returned by `useMeasureTool`. Since Task 5 already changed `useMeasureTool` to derive mode from `activeTool2D`, this should work without changes. But verify:

- `measureTool` is instantiated via `useMeasureTool(zoom2D, pan2D)`
- Props passed to `ToolOverlay` include `measureMode={measureTool.measureMode}`
- This should automatically reflect the new derivation

If no changes needed, mark task complete.

**Step 2: Verify**

Run: `npx tsc --noEmit`
Run: `npm run test -- --run`

**Step 3: Commit (if changes were needed)**

---

### Task 10: Run full test suite and verify

**Files:** None (verification only)

**Step 1: Run full tests**

```bash
npm run test -- --run
npx tsc --noEmit
```

**Step 2: Verify all tests pass**

Expected: All existing tests pass. No new tests needed for this UI-only change (tool definitions are data, ToolOptionsBar2D is a simple render component).

**Step 3: Manual verification checklist**

- [ ] `M` key activates the last-used measure sub-tool
- [ ] Hold-click on measure button shows 4 sub-tools (measure, measureCurve, compareCurves, grading)
- [ ] Each sub-tool has a distinct icon
- [ ] Selecting "Measure Along Curve" shows ToolOptionsBar2D with Marker Interval
- [ ] Selecting "Compare Curves" shows ToolOptionsBar2D with Marker Interval
- [ ] Selecting "Measure" (point-to-point) shows ToolOptionsBar2D with Show Angle and Cumulative
- [ ] Switching to a non-measure tool hides the options bar
- [ ] Along-curve mode works: click edge → see arc length + markers + walking dot
- [ ] Compare mode works: click edge A → hint label → click edge B → see delta
- [ ] Point-to-point mode works: click two points → see distance
