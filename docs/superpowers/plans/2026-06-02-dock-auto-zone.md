# Dock Auto-Suggest Zone (✦) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stage-driven auto-suggest zone (violet ✦, wired tools only) below the pinned tools in both docks — relevant tools rise by workflow stage and run on click — without any pin-to-keep persistence.

**Architecture:** A pure `selectWorkflowStage` selector derives the stage from existing signals (pieces/seams/sim state). A pure `getDockSuggestions(stage, side)` returns wired-only suggestions. A presentational `DockAutoZone` renders them as violet ✦ buttons inside the existing `DockShell` (via a new optional `autoZone` slot on `Dock`); the containers (`LeftDock`/`RightDock`) map each ✦ to its action (open panel / export / fit-map).

**Tech Stack:** React + TypeScript, Redux Toolkit + reselect, Vitest + @testing-library/react, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-02-dock-auto-zone-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/store/selectors.ts` | `WorkflowStage` type + `selectWorkflowStage` | Modify |
| `src/store/__tests__/workflowStage.test.ts` | Stage derivation (5 cases) | Create |
| `src/components/shell/dockSuggestions.ts` | `DockSuggestion` + `getDockSuggestions(stage, side)` (wired-only) | Create |
| `src/components/shell/__tests__/dockSuggestions.test.ts` | The suggestion map | Create |
| `src/styles/tokens.css` | `--dock-auto` (violet) | Modify |
| `src/components/shell/DockAutoZone.tsx` | Presentational ✦ zone | Create |
| `src/components/shell/Dock.css` | `.dock__sep`, `.dock__auto-label`, `.dock__tool--auto` | Modify |
| `src/components/shell/Dock.tsx` | optional `autoZone?` slot | Modify |
| `src/components/shell/__tests__/DockAutoZone.test.tsx` | ✦ zone render + onRun | Create |
| `src/components/shell/LeftDock.tsx` | read stage, render auto zone, `onOpenPanel` prop | Modify |
| `src/components/shell/RightDock.tsx` | read stage, render auto zone | Modify |
| `src/components/shell/AppShell.tsx` | pass `onOpenPanel` to `<LeftDock>` | Modify |
| `src/components/shell/__tests__/Dock.test.tsx` | update LeftDock tests (props/reducers + auto assertions) | Modify |
| `src/components/shell/__tests__/RightDock.test.tsx` | add project reducer + auto assertions | Modify |

---

## Task 1: `selectWorkflowStage` + `getDockSuggestions`

**Files:**
- Modify: `src/store/selectors.ts`
- Create: `src/store/__tests__/workflowStage.test.ts`
- Create: `src/components/shell/dockSuggestions.ts`
- Create: `src/components/shell/__tests__/dockSuggestions.test.ts`

- [ ] **Step 1: Write the failing stage test**

Create `src/store/__tests__/workflowStage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectWorkflowStage } from '../selectors';
import type { RootState } from '..';

const st = (pieces: number, seams: number, simState: string) => ({
  project: { pieces: Array(pieces).fill({}), seams: Array(seams).fill({}) },
  simulation: { simulationState: simState },
}) as unknown as RootState;

describe('selectWorkflowStage', () => {
  it('empty when no pieces', () => { expect(selectWorkflowStage(st(0, 0, 'idle'))).toBe('empty'); });
  it('drafted with pieces, no seams, idle', () => { expect(selectWorkflowStage(st(2, 0, 'idle'))).toBe('drafted'); });
  it('sewn with seams, idle', () => { expect(selectWorkflowStage(st(2, 1, 'idle'))).toBe('sewn'); });
  it('simulating when running (beats seams)', () => { expect(selectWorkflowStage(st(2, 1, 'running'))).toBe('simulating'); });
  it('simulated when paused (beats seams)', () => { expect(selectWorkflowStage(st(2, 1, 'paused'))).toBe('simulated'); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/store/__tests__/workflowStage.test.ts`
Expected: FAIL — `selectWorkflowStage` not exported.

- [ ] **Step 3: Add the selector**

In `src/store/selectors.ts`, append (it already imports `createSelector` and `RootState`):

```ts
export type WorkflowStage = 'empty' | 'drafted' | 'arranged' | 'sewn' | 'simulating' | 'simulated';

/**
 * Derived workflow stage from existing signals (no stored stage field).
 * `arranged` is in the vocabulary for later slices but is NOT derived here:
 * simulation.viewMode3D defaults to 'arrange', so it is not a meaningful
 * "user arranged" signal. 3a derives five stages.
 */
export const selectWorkflowStage = createSelector(
  (s: RootState) => s.project.pieces.length,
  (s: RootState) => s.project.seams.length,
  (s: RootState) => s.simulation.simulationState,
  (pieceCount, seamCount, simState): WorkflowStage => {
    if (pieceCount === 0) return 'empty';
    if (simState === 'running') return 'simulating';
    if (simState === 'paused') return 'simulated';
    if (seamCount > 0) return 'sewn';
    return 'drafted';
  },
);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/store/__tests__/workflowStage.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Write the failing suggestions test**

Create `src/components/shell/__tests__/dockSuggestions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getDockSuggestions } from '../dockSuggestions';

const ids = (stage: any, side: any) => getDockSuggestions(stage, side).map(s => s.id);

describe('getDockSuggestions (wired-only map)', () => {
  it('empty → nothing on either side', () => {
    expect(ids('empty', 'left')).toEqual([]);
    expect(ids('empty', 'right')).toEqual([]);
  });
  it('drafted → grade left, nothing right', () => {
    expect(ids('drafted', 'left')).toEqual(['grade']);
    expect(ids('drafted', 'right')).toEqual([]);
  });
  it('sewn → grade left, fitmap right', () => {
    expect(ids('sewn', 'left')).toEqual(['grade']);
    expect(ids('sewn', 'right')).toEqual(['fitmap']);
  });
  it('simulating → grade left, nothing right', () => {
    expect(ids('simulating', 'left')).toEqual(['grade']);
    expect(ids('simulating', 'right')).toEqual([]);
  });
  it('simulated → export left, bom right', () => {
    expect(ids('simulated', 'left')).toEqual(['export']);
    expect(ids('simulated', 'right')).toEqual(['bom']);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/dockSuggestions.test.ts`
Expected: FAIL — cannot resolve `../dockSuggestions`.

- [ ] **Step 7: Create the suggestion registry**

Create `src/components/shell/dockSuggestions.ts`:

```ts
import { Scaling, Download, Activity, Package, type LucideIcon } from 'lucide-react';
import type { WorkflowStage } from '../../store/selectors';

export interface DockSuggestion {
  /** Action id the container maps to a panel/export/fit-map call. */
  id: string;
  icon: LucideIcon;
  label: string;
}

const GRADE: DockSuggestion = { id: 'grade', icon: Scaling, label: 'Grade' };
const EXPORT: DockSuggestion = { id: 'export', icon: Download, label: 'Export DXF' };
const FITMAP: DockSuggestion = { id: 'fitmap', icon: Activity, label: 'Fit map' };
const BOM: DockSuggestion = { id: 'bom', icon: Package, label: 'BOM' };

// Wired-only suggestions per stage (painted-door/undefined tools dropped).
const LEFT: Record<WorkflowStage, DockSuggestion[]> = {
  empty: [], drafted: [GRADE], arranged: [GRADE], sewn: [GRADE], simulating: [GRADE], simulated: [EXPORT],
};
const RIGHT: Record<WorkflowStage, DockSuggestion[]> = {
  empty: [], drafted: [], arranged: [], sewn: [FITMAP], simulating: [], simulated: [BOM],
};

export function getDockSuggestions(stage: WorkflowStage, side: 'left' | 'right'): DockSuggestion[] {
  return (side === 'left' ? LEFT : RIGHT)[stage];
}
```

- [ ] **Step 8: Run to verify it passes + typecheck**

Run: `npm run test -- src/components/shell/__tests__/dockSuggestions.test.ts`
Expected: PASS — 5 tests.
Run: `npx tsc -b --noEmit` → clean. (lucide exports `Scaling`/`Download`/`Activity`/`Package` are all real.)

- [ ] **Step 9: Commit**

```
git add src/store/selectors.ts src/store/__tests__/workflowStage.test.ts src/components/shell/dockSuggestions.ts src/components/shell/__tests__/dockSuggestions.test.ts
git commit -m "feat(docks): selectWorkflowStage + wired-only getDockSuggestions"
```

---

## Task 2: `DockAutoZone` + `Dock` slot + styles

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/components/shell/DockAutoZone.tsx`
- Modify: `src/components/shell/Dock.css`
- Modify: `src/components/shell/Dock.tsx`
- Create: `src/components/shell/__tests__/DockAutoZone.test.tsx`

- [ ] **Step 1: Add the violet token**

In `src/styles/tokens.css`, in the `:root` palette block (after `--accent-border` near line 17), add:

```css
  --dock-auto: #a78bfa;   /* AI-suggested dock tools (violet), distinct from the indigo --accent */
```

- [ ] **Step 2: Write the failing DockAutoZone test**

Create `src/components/shell/__tests__/DockAutoZone.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DockAutoZone from '../DockAutoZone';
import { Scaling, Package } from 'lucide-react';

afterEach(cleanup);

const SUGS = [
  { id: 'grade', icon: Scaling, label: 'Grade' },
  { id: 'bom', icon: Package, label: 'BOM' },
];

describe('DockAutoZone', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<DockAutoZone suggestions={[]} onRun={() => {}} />);
    expect(container.querySelector('.dock__auto-label')).toBeNull();
    expect(container.querySelector('.dock__tool--auto')).toBeNull();
  });

  it('renders the auto label + one violet button per suggestion', () => {
    render(<DockAutoZone suggestions={SUGS} onRun={() => {}} />);
    expect(screen.getByText('auto')).toBeTruthy();
    const grade = screen.getByRole('button', { name: 'Grade' });
    expect(grade.className).toContain('dock__tool--auto');
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
  });

  it('calls onRun with the suggestion id on click', () => {
    const onRun = vi.fn();
    render(<DockAutoZone suggestions={SUGS} onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onRun).toHaveBeenCalledWith('grade');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: FAIL — cannot resolve `../DockAutoZone`.

- [ ] **Step 4: Create `DockAutoZone`**

Create `src/components/shell/DockAutoZone.tsx`:

```tsx
import type { DockSuggestion } from './dockSuggestions';

interface DockAutoZoneProps {
  suggestions: DockSuggestion[];
  /** Run a suggestion by id (the container maps id → action). */
  onRun: (id: string) => void;
}

/**
 * The auto-suggest (✦) zone shown below a dock's pinned tools: a separator, a
 * faint "auto" label, and one violet button per stage-suggested tool. Renders
 * nothing when there are no suggestions. Presentational — clicking runs the
 * suggestion (no pin/keep state in this slice).
 */
export default function DockAutoZone({ suggestions, onRun }: DockAutoZoneProps) {
  if (suggestions.length === 0) return null;
  return (
    <>
      <div className="dock__sep" />
      <div className="dock__auto-label">auto</div>
      {suggestions.map(s => {
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            className="dock__tool dock__tool--auto"
            onClick={() => onRun(s.id)}
            title={s.label}
            aria-label={s.label}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </>
  );
}
```

- [ ] **Step 5: Add the styles**

In `src/components/shell/Dock.css`, append:

```css
.dock__sep {
  width: 24px;
  height: 1px;
  background: var(--border);
  margin: 3px 0;
}

.dock__auto-label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-ghost);
}

.dock__tool--auto { color: var(--dock-auto); }
.dock__tool--auto:hover { color: var(--dock-auto); background: var(--bg-elevated); }
```

- [ ] **Step 6: Add the `autoZone` slot to `Dock`**

In `src/components/shell/Dock.tsx`, add `import type { ReactNode } from 'react';`, add `autoZone?: ReactNode;` to `DockProps`, destructure it, and render it inside `DockShell` after the tool buttons:

```tsx
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, autoZone }: DockProps) {
  return (
    <DockShell side="left" domainLabel={domainLabel}>
      {tools.map(tool => {
        const Icon = tool.icon;
        const active = tool.id === activeToolId;
        return (
          <button
            key={tool.id}
            type="button"
            className={`dock__tool ${active ? 'dock__tool--active' : ''}`}
            onClick={() => onSelectTool(tool.id)}
            title={`${tool.label} · ${tool.shortcut}`}
            aria-label={`${tool.label} · ${tool.shortcut}`}
            aria-pressed={active}
          >
            <Icon size={16} />
          </button>
        );
      })}
      {autoZone}
    </DockShell>
  );
}
```

(Add the `autoZone?: ReactNode` line to the `DockProps` interface.)

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx src/components/shell/__tests__/Dock.test.tsx`
Expected: PASS — DockAutoZone (3) + Dock/LeftDock (existing, still green since `autoZone` is optional/undefined there).
Run: `npx tsc -b --noEmit` → clean.

- [ ] **Step 8: Commit**

```
git add src/styles/tokens.css src/components/shell/DockAutoZone.tsx src/components/shell/Dock.css src/components/shell/Dock.tsx src/components/shell/__tests__/DockAutoZone.test.tsx
git commit -m "feat(docks): DockAutoZone (violet ✦ zone) + Dock autoZone slot + --dock-auto token"
```

---

## Task 3: Wire the auto zone into both docks

**Files:**
- Modify: `src/components/shell/LeftDock.tsx`
- Modify: `src/components/shell/RightDock.tsx`
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/components/shell/__tests__/Dock.test.tsx`
- Modify: `src/components/shell/__tests__/RightDock.test.tsx`

- [ ] **Step 1: Wire LeftDock**

Replace `src/components/shell/LeftDock.tsx` with:

```tsx
import { useSelector, useDispatch } from 'react-redux';
import { store, type RootState } from '../../store';
import { activate2DTool } from '../../store/toolActivation';
import { selectWorkflowStage } from '../../store/selectors';
import { runUiExport } from '../../utils/export/uiExport';
import Dock from './Dock';
import DockAutoZone from './DockAutoZone';
import { DOCK_2D_TOOLS } from './dock2dTools';
import { getDockSuggestions } from './dockSuggestions';

interface LeftDockProps {
  onOpenPanel: (name: string) => void;
}

/** The left (2D) dock: pinned tools + the stage-driven auto zone. Hidden in 3D-only view. */
export default function LeftDock({ onOpenPanel }: LeftDockProps) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const stage = useSelector(selectWorkflowStage);

  if (viewMode === '3d') return null;

  const runSuggestion = (id: string) => {
    if (id === 'grade') onOpenPanel('Grading');
    else if (id === 'export') runUiExport('dxf', store.getState().project, dispatch);
  };

  return (
    <Dock
      domainLabel="2D"
      tools={DOCK_2D_TOOLS}
      activeToolId={activeTool}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      autoZone={<DockAutoZone suggestions={getDockSuggestions(stage, 'left')} onRun={runSuggestion} />}
    />
  );
}
```

(`store` is exported from `src/store/index.ts` alongside `RootState`; `LogoMenu`/`UnifiedBarCommands` already import `store` for `runUiExport`.)

- [ ] **Step 2: Wire RightDock**

In `src/components/shell/RightDock.tsx`, add imports:

```tsx
import { selectWorkflowStage } from '../../store/selectors';
import { setFitMapMode } from '../../store/simulationSlice';
import DockAutoZone from './DockAutoZone';
import { getDockSuggestions } from './dockSuggestions';
```

Add `const stage = useSelector((s: RootState) => selectWorkflowStage(s));` near the other selectors, and a `runSuggestion` before the return:

```tsx
  const runSuggestion = (id: string) => {
    if (id === 'fitmap') dispatch(setFitMapMode('fit'));
    else if (id === 'bom') onOpenPanel('BOM');
  };
```

Then add the auto zone inside `DockShell`, immediately after the Avatar button (before `</DockShell>`):

```tsx
        <DockAutoZone suggestions={getDockSuggestions(stage, 'right')} onRun={runSuggestion} />
```

- [ ] **Step 3: Pass `onOpenPanel` to LeftDock in AppShell**

In `src/components/shell/AppShell.tsx`, change `<LeftDock />` (the 2D-pane mount) to:

```tsx
          <LeftDock onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)} />
```

- [ ] **Step 4: Update the LeftDock tests**

In `src/components/shell/__tests__/Dock.test.tsx`, the `LeftDock` tests render `<LeftDock />` with an editor+tools store. LeftDock now requires `onOpenPanel` and reads `selectWorkflowStage` (needs `project` + `simulation` slices). Update the LeftDock `renderLeftDock` helper and tests:

```tsx
import projectReducer from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
```

Replace the existing `renderLeftDock`:

```tsx
function renderLeftDock(onOpenPanel = vi.fn()) {
  const store = configureStore({
    reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer },
  });
  render(<Provider store={store}><LeftDock onOpenPanel={onOpenPanel} /></Provider>);
  return { store, onOpenPanel };
}
```

Update the two existing LeftDock tests to use the returned object (`const { store } = renderLeftDock();`), and add one auto-zone test:

```tsx
  it('shows a grade ✦ suggestion once pieces exist and runs it', () => {
    const { store, onOpenPanel } = renderLeftDock();
    store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onOpenPanel).toHaveBeenCalledWith('Grading');
  });
```

Add `import { addPiece } from '../../../store/projectSlice';` and ensure `vi` is imported.

- [ ] **Step 5: Update the RightDock tests**

In `src/components/shell/__tests__/RightDock.test.tsx`, add the `project` reducer to `renderRightDock`'s store (it already has editor/simulation/tools), and add `import projectReducer from '../../../store/projectSlice';` + `import { addPiece } from '../../../store/projectSlice';`. Add one auto-zone test:

```tsx
  it('shows a BOM ✦ suggestion at simulated stage and runs it', () => {
    const { store, onOpenPanel } = renderRightDock();
    store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
    fireEvent.click(screen.getByRole('button', { name: 'BOM' }));
    expect(onOpenPanel).toHaveBeenCalledWith('BOM');
  });
```

Add `import { pauseSimulation } from '../../../store/simulationSlice';` and update `renderRightDock` to add `project: projectReducer` and return `{ store, onOpenPanel }` if it doesn't already. (If `pauseSimulation` from `'idle'` does not yield `'paused'`, dispatch `startSimulation()` then `pauseSimulation()`.)

- [ ] **Step 6: Typecheck + full suite + lint**

Run: `npx tsc -b --noEmit` → clean.
Run: `npm run test` → all pass.
Run: `npm run lint` → 0 errors.

- [ ] **Step 7: Commit**

```
git add -A src/components/shell
git commit -m "feat(docks): wire the stage-driven auto zone into both docks"
```

---

## Task 4: Live verification

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev -- --port 5183 --strictPort`. Wait for `Local: http://localhost:5183/`.

- [ ] **Step 2: Write the verification script**

Create (untracked) `scripts/verify-auto-zone.mjs`:

```js
import { chromium } from 'playwright';
const BASE_URL = process.argv[2] || 'http://localhost:5183';
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell');
  await page.click('.pill-group__item:has-text("2D")');
  await page.waitForTimeout(400);
  // empty stage: no auto zone in the left dock yet.
  let autoBefore = await page.locator('.dock--left .dock__tool--auto').count();
  // Inject a piece via the store to reach 'drafted' → grade ✦ appears.
  await page.evaluate(() => window.__OPENCLO_STORE__?.dispatch?.({ type: 'project/addPiece', payload: { id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'design-handoff/ui-screenshots/verify-auto-zone.png', animations: 'disabled' });
  const autoAfter = await page.locator('.dock--left .dock__tool--auto').count();
  const label = await page.locator('.dock--left .dock__auto-label').count();
  console.log('  left auto buttons — empty:', autoBefore, '· drafted:', autoAfter, '· auto label:', label);
  console.log('  PASS:', autoBefore === 0 && autoAfter >= 1 && label === 1);
  await browser.close();
  console.log('done');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
```

- [ ] **Step 3: Run it**

Run: `node scripts/verify-auto-zone.mjs http://localhost:5183`
Expected: `left auto buttons — empty: 0 · drafted: 1 · auto label: 1` and `PASS: true`. Inspect `verify-auto-zone.png`: below the 2D pinned tools, a hairline separator + faint "auto" label + a violet ✦ Grade button. Stop the dev server.

- [ ] **Step 4: Final gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green. (No commit — leave `scripts/verify-auto-zone.mjs` untracked.)

---

## Self-Review

**Spec coverage** (against `2026-06-02-dock-auto-zone-design.md`):
- §3 stage derivation (5 cases) → Task 1 selector + test.
- §4 suggestion map (wired-only) → Task 1 `getDockSuggestions` + test.
- §5 architecture (selector, registry, DockAutoZone, Dock slot, token, container wiring, AppShell) → Tasks 1–3.
- §6 AC1/2 (stage + map) → Task 1; AC3 (docks show the ✦ per stage) → Task 3 tests + Task 4; AC4 (clicking runs the action) → Task 3 tests; AC5 (no zone when empty) → Task 2 DockAutoZone test; AC6 (violet, aria-label, no emoji) → Task 2; AC7 (pinned unchanged) → Tasks 2–3 (optional slot, existing tests green); AC8 (gates) → every task.
- §7 testing (selector, registry, DockAutoZone, Left/RightDock integration) → Tasks 1–3.
- §9 out of scope (pin persistence, painted doors, signaling, weighting) → not implemented (correct).

**Placeholder scan:** No TBD/TODO. Icon choices are concrete (`Scaling`/`Download`/`Activity`/`Package`). The `pauseSimulation`-from-idle fallback note in Task 3 Step 5 is a conditional with an explicit alternative, not a placeholder.

**Type consistency:** `WorkflowStage` defined in `selectors.ts`, imported by `dockSuggestions.ts`. `DockSuggestion { id; icon; label }` consistent across `dockSuggestions.ts`, `DockAutoZone`, and tests. `getDockSuggestions(stage, side)` signature consistent. `selectWorkflowStage` is a reselect selector usable as `useSelector(selectWorkflowStage)`. `LeftDockProps.onOpenPanel: (name: string) => void` matches the AppShell callsite and the `runUiExport(format, project, dispatch)` signature from slice 1. `setFitMapMode('fit')` — `'fit'` is a valid `FitMapMode`.
