# Dock Tool Reorder (native drag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag a left-dock tool button to a new position; render in the user's order and persist it.

**Architecture:** A `reorderDockTool({fromId, toId})` reducer mutates `tools2d` order. `LeftDock` switches its render from catalog-order (`DOCK_2D_CATALOG.filter`) to `tools2d` order (`tools2d.map(getDockToolById)`). `Dock` gains an optional `onReorderTool` callback that makes each tool button a native HTML5 drag source + drop target; the drag coexists with the existing click-to-activate. No new dependency.

**Tech Stack:** Redux Toolkit, React (native HTML5 drag-and-drop), Vitest + @testing-library/react (`fireEvent.dragStart/dragOver/drop` with a stubbed `dataTransfer`; no jest-dom), Playwright (best-effort live check).

**Spec:** `docs/superpowers/specs/2026-06-03-dock-reorder-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/store/dockSlice.ts` | Dock state | Add `reorderDockTool` reducer + export. |
| `src/store/__tests__/dockSlice.test.ts` | dockSlice tests | Add reorder cases. |
| `src/components/shell/Dock.tsx` | 2D dock (presentational) | Add `onReorderTool?` prop + native drag handlers + drag-state classes. |
| `src/components/shell/Dock.css` | dock styles | Add `.dock__tool--dragging`, `.dock__tool--drop-target`. |
| `src/components/shell/LeftDock.tsx` | 2D container | Render `tools2d` order; pass `onReorderTool`. |
| `src/components/shell/__tests__/Dock.test.tsx` | Dock + LeftDock tests | Add drag-reorder + order cases. |
| `scripts/verify-dock-reorder.mjs` (untracked) | Live check | **Create** (not committed). |

---

## Task 1: dockSlice — `reorderDockTool` reducer

**Files:**
- Modify: `src/store/dockSlice.ts`
- Test: `src/store/__tests__/dockSlice.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/store/__tests__/dockSlice.test.ts`, add `reorderDockTool` to the dockSlice import (it currently imports `addDockTool, removeDockTool, resetDockTools, DEFAULT_DOCK_2D_IDS` etc.):

```ts
import dockReducer, { pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling, rehydrateDocks, addDockTool, removeDockTool, resetDockTools, reorderDockTool, DEFAULT_DOCK_2D_IDS } from '../dockSlice';
```

Append a new top-level `describe` block at the end of the file:

```ts
describe('dockSlice reorderDockTool', () => {
  const seed = (ids) => dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: ids }));

  it('up-move: dragging a lower tool onto a higher one lands it before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'line', toId: 'select' }));
    expect(s.tools2d).toEqual(['line', 'select', 'pen']);
  });

  it('down-move: dragging a higher tool onto a lower one lands it immediately before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'select', toId: 'line' }));
    expect(s.tools2d).toEqual(['pen', 'select', 'line']);
  });

  it('fromId === toId is a no-op', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'pen', toId: 'pen' }));
    expect(s.tools2d).toEqual(['select', 'pen', 'line']);
  });

  it('an absent id is a no-op', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'zzz', toId: 'select' }));
    expect(s.tools2d).toEqual(['select', 'pen', 'line']);
  });

  it('preserves length', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'pen', toId: 'select' }));
    expect(s.tools2d).toHaveLength(3);
  });
});
```

(`initial` is defined at the top of the file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: FAIL — `reorderDockTool` is not exported.

- [ ] **Step 3: Implement the reducer**

In `src/store/dockSlice.ts`, add this reducer inside the `reducers: { ... }` block (e.g. after `resetDockTools`):

```ts
    reorderDockTool(state, action: PayloadAction<{ fromId: string; toId: string }>) {
      const { fromId, toId } = action.payload;
      if (fromId === toId) return;
      const from = state.tools2d.indexOf(fromId);
      const to = state.tools2d.indexOf(toId);
      if (from === -1 || to === -1) return; // unknown id → no-op
      state.tools2d.splice(from, 1);
      const insertAt = state.tools2d.indexOf(toId); // recompute after removal
      state.tools2d.splice(insertAt, 0, fromId);
    },
```

Extend the action exports (add `reorderDockTool`):

```ts
export const { pinAuto, unpinAuto, rehydrateDocks, toggleDockSignaling, addDockTool, removeDockTool, resetDockTools, reorderDockTool } = dockSlice.actions;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: PASS — all reorder cases + the existing dockSlice cases.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --noEmit`
Expected: clean.

```bash
git add src/store/dockSlice.ts src/store/__tests__/dockSlice.test.ts
git commit -m "feat(docks): reorderDockTool reducer (move a tool to a target slot)"
```

(No consumer yet — green. Do NOT use `--no-verify`.)

---

## Task 2: Native drag-to-reorder in Dock + LeftDock render order

**Files:**
- Modify: `src/components/shell/Dock.tsx`, `src/components/shell/Dock.css`, `src/components/shell/LeftDock.tsx`
- Test: `src/components/shell/__tests__/Dock.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/shell/__tests__/Dock.test.tsx`, add `reorderDockTool` to the dockSlice import (alongside the existing `addDockTool, removeDockTool`):

```ts
import dockReducer, { toggleDockSignaling, pinAuto, addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
```

Add this helper near the top of the file (after the imports):

```ts
function makeDataTransfer() {
  const data: Record<string, string> = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(k: string, v: string) { data[k] = v; },
    getData(k: string) { return data[k] ?? ''; },
  };
}
```

Append inside `describe('Dock (presentational)', ...)`:

```ts
  it('reorders on drop: dragging Select onto Pen calls onReorderTool(select, pen)', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /select · z/i }), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByRole('button', { name: /pen · h/i }), { dataTransfer: dt });
    fireEvent.drop(screen.getByRole('button', { name: /pen · h/i }), { dataTransfer: dt });
    expect(onReorderTool).toHaveBeenCalledWith('select', 'pen');
  });

  it('a drop onto the same tool does not reorder', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    const sel = screen.getByRole('button', { name: /select · z/i });
    fireEvent.dragStart(sel, { dataTransfer: dt });
    fireEvent.drop(sel, { dataTransfer: dt });
    expect(onReorderTool).not.toHaveBeenCalled();
  });

  it('tool buttons are not draggable without onReorderTool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect((screen.getByRole('button', { name: /select · z/i }) as HTMLButtonElement).draggable).toBe(false);
  });

  it('clicking a tool still activates it while reorder is enabled', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} onReorderTool={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pen · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });
```

Append inside `describe('LeftDock (container)', ...)`:

```ts
  it('renders tools in tools2d order; reordering moves the tool in the DOM', () => {
    const { store } = renderLeftDock();
    const select1 = screen.getByRole('button', { name: /select · z/i });
    const sew1 = screen.getByRole('button', { name: /sew · b/i });
    // default order: select precedes sew
    expect(select1.compareDocumentPosition(sew1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => { store.dispatch(reorderDockTool({ fromId: 'seam', toId: 'select' })); });
    const select2 = screen.getByRole('button', { name: /select · z/i });
    const sew2 = screen.getByRole('button', { name: /sew · b/i });
    // after reorder: sew precedes select
    expect(sew2.compareDocumentPosition(select2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx`
Expected: FAIL — `onReorderTool` not a prop; buttons not draggable; LeftDock renders catalog order (the reorder dispatch doesn't move the DOM yet).

- [ ] **Step 3: Add drag support to Dock.tsx**

Replace `src/components/shell/Dock.tsx` in full:

```tsx
import { useState, type ReactNode } from 'react';
import DockShell from './DockShell';
import ToolTooltip from './ToolTooltip';
import type { DockToolDef } from './dock2dTools';
import './Dock.css';

interface DockProps {
  /** Domain anchor, e.g. "2D". Label only, not a button. */
  domainLabel: string;
  tools: DockToolDef[];
  /** The currently active tool id (the engine truth). */
  activeToolId: string;
  onSelectTool: (id: string) => void;
  /** Optional auto-suggest (✦) zone rendered below the pinned tools. */
  autoZone?: ReactNode;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
  /** When set, tool buttons become native-drag reorder sources/targets. */
  onReorderTool?: (fromId: string, toId: string) => void;
}

/**
 * A vertical single-select tool column (the redesign's left/2D dock), rendered
 * inside the shared DockShell. Presentational only — the container supplies
 * tools + active id and handles activation. When onReorderTool is provided,
 * tools can be reordered by native HTML5 drag (coexists with click-to-activate).
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, autoZone, footer, onReorderTool }: DockProps) {
  const reorderable = !!onReorderTool;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const clearDrag = () => { setDraggingId(null); setDropTargetId(null); };

  return (
    <DockShell side="left" domainLabel={domainLabel}>
      {tools.map(tool => {
        const Icon = tool.icon;
        const active = tool.id === activeToolId;
        const dragging = draggingId === tool.id;
        const isDropTarget = dropTargetId === tool.id && draggingId !== tool.id;
        return (
          <ToolTooltip key={tool.id} name={tool.label} shortcut={tool.shortcut} position="right">
            <button
              type="button"
              className={`dock__tool ${active ? 'dock__tool--active' : ''} ${dragging ? 'dock__tool--dragging' : ''} ${isDropTarget ? 'dock__tool--drop-target' : ''}`}
              onClick={() => onSelectTool(tool.id)}
              aria-label={tool.shortcut ? `${tool.label} · ${tool.shortcut}` : tool.label}
              aria-pressed={active}
              draggable={reorderable}
              onDragStart={reorderable ? (e) => { e.dataTransfer.setData('text/plain', tool.id); e.dataTransfer.effectAllowed = 'move'; setDraggingId(tool.id); } : undefined}
              onDragOver={reorderable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTargetId(tool.id); } : undefined}
              onDragLeave={reorderable ? () => setDropTargetId((cur) => (cur === tool.id ? null : cur)) : undefined}
              onDrop={reorderable ? (e) => { e.preventDefault(); const fromId = e.dataTransfer.getData('text/plain'); if (fromId && fromId !== tool.id) onReorderTool!(fromId, tool.id); clearDrag(); } : undefined}
              onDragEnd={reorderable ? clearDrag : undefined}
            >
              <Icon size={16} />
            </button>
          </ToolTooltip>
        );
      })}
      {autoZone}
      {footer}
    </DockShell>
  );
}
```

- [ ] **Step 4: Add the drag-state CSS**

In `src/components/shell/Dock.css`, append (near the other `.dock__tool` rules):

```css
.dock__tool--dragging { opacity: 0.4; }
.dock__tool--drop-target { outline: 2px solid var(--accent); outline-offset: -2px; }
```

- [ ] **Step 5: Switch LeftDock to tools2d order + pass onReorderTool**

In `src/components/shell/LeftDock.tsx`:

Add `reorderDockTool` to the dockSlice import and `getDockToolById` to the dock2dTools import:

```ts
import { pinAuto, unpinAuto, addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
```
```ts
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';
```

Replace the `const tools = DOCK_2D_CATALOG.filter((t) => tools2d.includes(t.id));` line with the tools2d-ordered resolution:

```ts
  const tools = tools2d
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);
```

Add the `onReorderTool` prop to the `<Dock ... >` element (e.g. right after `onSelectTool`):

```tsx
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      onReorderTool={(fromId, toId) => dispatch(reorderDockTool({ fromId, toId }))}
```

(`DOCK_2D_CATALOG` is still imported — it is passed to `DockToolPicker` as `catalog`. Keep that import.)

- [ ] **Step 6: Run the affected tests**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx`
Expected: PASS — drag-reorder + same-drop-no-op + not-draggable-without-prop + click-still-activates + the LeftDock order case; existing convergence/suggestion/picker tests still pass (default `tools2d` renders the same 7 in order).

- [ ] **Step 7: Full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: tsc clean; all tests pass; lint 0 errors (pre-existing warnings ok — no NEW ones).

- [ ] **Step 8: Commit**

```bash
git add src/components/shell/Dock.tsx src/components/shell/Dock.css src/components/shell/LeftDock.tsx src/components/shell/__tests__/Dock.test.tsx
git commit -m "feat(docks): native drag-to-reorder the 2D dock tools (tools2d order)"
```

Do NOT use `--no-verify`.

---

## Task 3: Live verification script

**Files:**
- Create (untracked): `scripts/verify-dock-reorder.mjs`

> Author the script; the controller runs it. Native HTML5 DnD is unreliable to drive in Playwright, so the script PROVES the render+persist path deterministically via a store dispatch, and ALSO attempts the real gesture as a non-gating bonus. Do NOT `git add` it.

- [ ] **Step 1: Write the script**

Create `scripts/verify-dock-reorder.mjs`:

```js
// Live check: reordering tools2d re-orders the dock DOM and persists.
// Native HTML5 DnD is flaky to drive in Playwright, so the deterministic check
// dispatches reorderDockTool via the store (the gesture itself is unit/RTL-tested);
// a best-effort real drag is attempted and logged but does not gate.
// Run the dev server on 5183 first:  npm run dev -- --port 5183
import { chromium } from 'playwright';

const URL = 'http://localhost:5183';
const page = await (await chromium.launch()).newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__OPENCLO_STORE__, { timeout: 15000 });
await page.evaluate(() => window.__OPENCLO_STORE__.dispatch({ type: 'editor/setViewMode', payload: 'split' }));
await page.waitForTimeout(300);

const firstBefore = await page.locator('.dock--left .dock__tool').first().getAttribute('aria-label');
console.log('first dock tool before (expect "Select · Z"):', firstBefore);

// Deterministic path: dispatch the reorder (move seam to the front).
await page.evaluate(() => window.__OPENCLO_STORE__.dispatch({ type: 'dock/reorderDockTool', payload: { fromId: 'seam', toId: 'select' } }));
await page.waitForTimeout(200);
const firstAfter = await page.locator('.dock--left .dock__tool').first().getAttribute('aria-label');
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('openclo-docks') || 'null'));
console.log('first dock tool after reorder (expect "Sew · B"):', firstAfter);
console.log('LS tools2d[0] (expect "seam"):', ls?.data?.tools2d?.[0]);

// Best-effort real native drag (non-gating): drag the now-2nd tool onto the 1st.
let dragNote = 'not attempted';
try {
  const a = page.locator('.dock--left .dock__tool').nth(1);
  const b = page.locator('.dock--left .dock__tool').nth(0);
  await a.dragTo(b);
  await page.waitForTimeout(150);
  const ls2 = await page.evaluate(() => JSON.parse(localStorage.getItem('openclo-docks') || 'null'));
  dragNote = `after native drag, tools2d[0]=${ls2?.data?.tools2d?.[0]} (gesture coverage is best-effort)`;
} catch (e) {
  dragNote = `native drag not drivable in Playwright (expected): ${e.message.split('\n')[0]}`;
}
console.log('native-drag bonus:', dragNote);

const ok = firstBefore === 'Select · Z' && firstAfter === 'Sew · B' && ls?.data?.tools2d?.[0] === 'seam';
console.log(ok ? 'PASS' : 'FAIL');
await page.context().browser().close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: (Controller runs)** Start `npm run dev -- --port 5183`, then `node scripts/verify-dock-reorder.mjs`. Expected `PASS`: the dispatched reorder moves Sew to the front of the dock and persists `tools2d[0]==='seam'`. The native-drag line is informational (the gesture is locked by the Dock RTL test). Reset the dock afterward if desired via `LogoMenu`/the ＋ picker "Reset to defaults".

---

## Self-Review

**1. Spec coverage:**
- §3 render-order change (catalog → tools2d order, default unchanged, stale id filtered) → Task 2 Step 5 + the LeftDock order test.
- §4 `reorderDockTool` reducer (insert-before-target, no-ops, export) → Task 1.
- §5 native drag wiring (`onReorderTool`, draggable, dragstart/over/leave/drop/end, dataTransfer, local drag state, ＋/auto-zone not draggable) → Task 2 Steps 3-5 (only `Dock`'s tool buttons get the handlers; the footer/autoZone slots are plain children).
- §5 CSS classes → Task 2 Step 4.
- §6 AC1 (reducer) → Task 1; AC2 (tools2d-order render) → Task 2 + LeftDock test; AC3 (drag reorders + click still activates) → Task 2 Dock tests; AC4 (＋/auto-zone not draggable) → they are not rendered through the `tools.map` so they get no drag props (inherent); AC5 (persist + NEW_PROJECT) → rides existing `tools2d` persistence (Task 3 live LS check); AC6 (slice 4/5 unchanged) → existing tests stay green; AC7 (gates) → Task 2 Step 7.
- §7 testing → Tasks 1-3. §8 edge cases (self-drop, single tool, drop outside, stale id, add-after-reorder, click-after-drag) → reducer no-ops (Task 1) + the same-drop test + the click-still-activates test.

**2. Placeholder scan:** No TBD/TODO; every code step complete; commands have expected output.

**3. Type/name consistency:** `reorderDockTool({fromId, toId})` payload shape identical in Task 1 (reducer + tests) and Task 2 (LeftDock dispatch + tests). `onReorderTool: (fromId, toId) => void` matches between Dock prop and LeftDock call site. The action type string in the verify script (`'dock/reorderDockTool'`) matches the slice name `dock` + reducer name. The LeftDock render switch (`tools2d.map(getDockToolById).filter(...)`) uses `getDockToolById` (exported from dock2dTools since slice 4) and `DockToolDef` (imported as a type). Every commit green: Task 1 (no consumer) → Task 2 (render + wiring together).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-dock-reorder.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute in this session via executing-plans.

Which approach?
