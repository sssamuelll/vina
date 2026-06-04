# Right Dock (3D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `FloatingControls3D` with a vertical right (3D) dock — Arrange · Sew · Simulate · Avatar — that mirrors the left dock's silhouette, by extracting a shared `DockShell` and building a 3D container with heterogeneous (non-single-select) affordances.

**Architecture:** Extract `DockShell` (the shared floating-column frame + domain label) and refactor the 2D `Dock` to use it. Build `RightDock`, a container that reads 3D state (`simulation`, `tools.activeTool3D`, `editor.viewMode`) and renders four heterogeneous icon buttons (each its own action + active predicate) inside `DockShell side="right"`, plus the preserved "SIMULATING · Nfps" status. Replace + delete `FloatingControls3D`.

**Tech Stack:** React + TypeScript, Redux Toolkit (`simulationSlice`/`toolSlice`/`editorSlice`), Vitest + @testing-library/react, lucide-react, Playwright (verification).

**Spec:** `docs/superpowers/specs/2026-06-02-right-dock-3d-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/components/shell/DockShell.tsx` | Shared dock silhouette (frame + domain label) | Create |
| `src/components/shell/__tests__/DockShell.test.tsx` | DockShell render + side modifier | Create |
| `src/components/shell/Dock.tsx` | Refactor the 2D dock to render inside `DockShell` | Modify |
| `src/components/shell/Dock.css` | `left` → `.dock--left`; add `.dock--right` | Modify |
| `src/components/shell/RightDock.tsx` | The 3D dock container (4 affordances + sim status) | Create |
| `src/components/shell/__tests__/RightDock.test.tsx` | The 4 actions + active + the migrated sew reachability guard | Create |
| `src/components/shell/AppShell.tsx` | `<FloatingControls3D />` → `<RightDock onOpenPanel=… />` | Modify |
| `src/components/shell/FloatingControls3D.tsx` | Delete (replaced) | Delete |
| `src/components/shell/__tests__/FloatingControls3D.test.tsx` | Delete (intent migrated to RightDock test) | Delete |
| `src/styles/floating.css` | Remove dead `.floating-3d--top-right` + `.floating-3d__pill*`; keep base `.floating-3d` + `--bottom-left` | Modify |
| `src/components/Viewport3D/Viewport3D.tsx` | Update a comment (FloatingControls3D → RightDock) | Modify |

The 3D affordances are stateful/heterogeneous, so `RightDock` builds its buttons inline (no static registry like `dock2dTools`). Buttons reuse the `.dock__tool` / `.dock__tool--active` classes. Out of scope: `fabric`, the auto (✦) section, the e2e `dress-avatar-dod.spec.ts` (already stale/red, e2e-rojo track — see spec §8).

---

## Task 1: Extract `DockShell` and refactor `Dock`

**Files:**
- Create: `src/components/shell/DockShell.tsx`
- Create: `src/components/shell/__tests__/DockShell.test.tsx`
- Modify: `src/components/shell/Dock.tsx`
- Modify: `src/components/shell/Dock.css`

- [ ] **Step 1: Write the failing DockShell test**

Create `src/components/shell/__tests__/DockShell.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DockShell from '../DockShell';

afterEach(cleanup);

describe('DockShell', () => {
  it('renders the domain label and children', () => {
    render(<DockShell side="left" domainLabel="2D"><button>tool</button></DockShell>);
    expect(screen.getByText('2D')).toBeTruthy();
    expect(screen.getByText('tool')).toBeTruthy();
  });

  it('applies the side modifier class', () => {
    const { container } = render(<DockShell side="right" domainLabel="3D"><span /></DockShell>);
    expect(container.querySelector('.dock--right')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/DockShell.test.tsx`
Expected: FAIL — cannot resolve `../DockShell`.

- [ ] **Step 3: Create `DockShell`**

Create `src/components/shell/DockShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import './Dock.css';

interface DockShellProps {
  side: 'left' | 'right';
  domainLabel: string;
  children: ReactNode;
}

/**
 * The shared side-dock silhouette: a vertical floating column with a domain
 * label, framing the canvas. Both the 2D (single-select) and 3D (heterogeneous)
 * docks fill it with their own buttons. Presentational only.
 */
export default function DockShell({ side, domainLabel, children }: DockShellProps) {
  return (
    <div className={`dock dock--${side}`}>
      <div className="dock__label">{domainLabel}</div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Refactor `Dock` to use `DockShell`**

In `src/components/shell/Dock.tsx`, add `import DockShell from './DockShell';` and replace the outer `<div className="dock"> … </div>` + inner `<div className="dock__label">…</div>` with `<DockShell side="left" domainLabel={domainLabel}>`. The full file becomes:

```tsx
import DockShell from './DockShell';
import type { DockToolDef } from './dock2dTools';
import './Dock.css';

interface DockProps {
  /** Domain anchor, e.g. "2D". Label only, not a button. */
  domainLabel: string;
  tools: DockToolDef[];
  /** The currently active tool id (the engine truth). */
  activeToolId: string;
  onSelectTool: (id: string) => void;
}

/**
 * A vertical single-select tool column (the redesign's left/2D dock), rendered
 * inside the shared DockShell. Presentational only — the container supplies
 * tools + active id and handles activation.
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool }: DockProps) {
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
    </DockShell>
  );
}
```

- [ ] **Step 5: Update `Dock.css` for the side modifier**

In `src/components/shell/Dock.css`, the `.dock` rule currently has `left: 14px;`. Remove that one line from `.dock` and add two modifier rules immediately after the `.dock { … }` block:

```css
.dock--left { left: 14px; }
.dock--right { right: 14px; }
```

(Everything else in `.dock` — `position: absolute; top: 50%; transform: translateY(-50%);` etc. — stays.)

- [ ] **Step 6: Run DockShell + Dock tests**

Run: `npm run test -- src/components/shell/__tests__/DockShell.test.tsx src/components/shell/__tests__/Dock.test.tsx`
Expected: PASS — DockShell (2) + Dock/LeftDock (5). The Dock tests are unchanged and still pass because `DockShell` renders the same `.dock` / `.dock__label` structure; `LeftDock` still mounts `<Dock>` which now renders the left-sided shell.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc -b --noEmit` → clean.
```
git add src/components/shell/DockShell.tsx src/components/shell/__tests__/DockShell.test.tsx src/components/shell/Dock.tsx src/components/shell/Dock.css
git commit -m "refactor(docks): extract DockShell silhouette; Dock renders inside it"
```

---

## Task 2: The `RightDock` 3D container

**Files:**
- Create: `src/components/shell/RightDock.tsx`
- Create: `src/components/shell/__tests__/RightDock.test.tsx`

- [ ] **Step 1: Write the failing RightDock test**

Create `src/components/shell/__tests__/RightDock.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 *
 * Guards the 3D dock — including the sewing-reachability invariant migrated
 * from the deleted FloatingControls3D test (if Sew breaks, 3D sewing is
 * unreachable).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import RightDock from '../RightDock';

afterEach(cleanup);

function renderRightDock(onOpenPanel = vi.fn()) {
  const store = configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer, tools: toolsReducer },
  });
  render(<Provider store={store}><RightDock onOpenPanel={onOpenPanel} /></Provider>);
  return { store, onOpenPanel };
}

describe('RightDock (3D dock)', () => {
  it('Sew activates the 3D sewing tool and toggles back (reachability guard)', () => {
    const { store } = renderRightDock();
    expect(store.getState().tools.activeTool3D).toBe('camera');
    fireEvent.click(screen.getByRole('button', { name: /sew/i }));
    expect(store.getState().tools.activeTool3D).toBe('sew3d');
    expect(store.getState().simulation.simulationState).toBe('idle');
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
    fireEvent.click(screen.getByRole('button', { name: /sew/i }));
    expect(store.getState().tools.activeTool3D).toBe('camera');
  });

  it('Simulate starts the solver', () => {
    const { store } = renderRightDock();
    expect(store.getState().simulation.simulationState).toBe('idle');
    fireEvent.click(screen.getByRole('button', { name: /simulate/i }));
    expect(store.getState().simulation.simulationState).not.toBe('idle');
  });

  it('Arrange sets the 3D view mode to arrange', () => {
    const { store } = renderRightDock();
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }));
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
  });

  it('Avatar opens the Avatar panel', () => {
    const { onOpenPanel } = renderRightDock();
    fireEvent.click(screen.getByRole('button', { name: /avatar/i }));
    expect(onOpenPanel).toHaveBeenCalledWith('Avatar');
  });

  it('is hidden in 2D-only view', () => {
    const store = configureStore({
      reducer: { editor: editorReducer, simulation: simulationReducer, tools: toolsReducer },
    });
    store.dispatch(setViewMode('2d'));
    render(<Provider store={store}><RightDock onOpenPanel={vi.fn()} /></Provider>);
    expect(screen.queryByText('3D')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/RightDock.test.tsx`
Expected: FAIL — cannot resolve `../RightDock`.

- [ ] **Step 3: Create `RightDock`**

Create `src/components/shell/RightDock.tsx`:

```tsx
import { useSelector, useDispatch } from 'react-redux';
import { Shirt, Spline, Play, Pause, PersonStanding } from 'lucide-react';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import DockShell from './DockShell';

interface RightDockProps {
  onOpenPanel: (name: string) => void;
}

/**
 * The right (3D) dock. Heterogeneous affordances — view-mode (Arrange), a
 * toggle with a sim-reset teardown (Sew), sim transport (Simulate), and a
 * panel opener (Avatar) — so it is NOT the single-select 2D Dock; it shares
 * only the DockShell silhouette. Hidden in 2D-only view.
 */
export default function RightDock({ onOpenPanel }: RightDockProps) {
  const dispatch = useDispatch();
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const frameTime = useSelector((s: RootState) => s.simulation.frameTimeMs);

  if (viewMode === '2d') return null;

  const simActive = simState === 'running';
  const sewActive = activeTool3D === 'sew3d';
  const fps = frameTime > 0 ? Math.round(1000 / frameTime) : 0;

  // Entering Sew: the Sew3DTool only mounts while the sim is idle (it edits
  // static pieces), so reset the sim and switch to arrange before activating.
  // Clicking again exits to camera.
  const toggleSew = () => {
    if (sewActive) { dispatch(setActiveTool3D('camera')); return; }
    dispatch(resetSimulation());
    dispatch(setViewMode3D('arrange'));
    dispatch(setActiveTool3D('sew3d'));
  };

  const SimIcon = simActive ? Pause : Play;

  return (
    <>
      <DockShell side="right" domainLabel="3D">
        <button
          type="button"
          className="dock__tool"
          onClick={() => dispatch(setViewMode3D('arrange'))}
          title="Arrange"
          aria-label="Arrange"
        >
          <Shirt size={16} />
        </button>
        <button
          type="button"
          className={`dock__tool ${sewActive ? 'dock__tool--active' : ''}`}
          onClick={toggleSew}
          title={sewActive ? 'Sewing… · click to exit' : 'Sew · click two 3D edges'}
          aria-label="Sew"
          aria-pressed={sewActive}
        >
          <Spline size={16} />
        </button>
        <button
          type="button"
          className={`dock__tool ${simActive ? 'dock__tool--active' : ''}`}
          onClick={() => { if (simActive) dispatch(pauseSimulation()); else dispatch(startSimulation()); }}
          title={simActive ? 'Pause · Space' : 'Simulate · Space'}
          aria-label="Simulate"
          aria-pressed={simActive}
        >
          <SimIcon size={16} />
        </button>
        <button
          type="button"
          className="dock__tool"
          onClick={() => onOpenPanel('Avatar')}
          title="Avatar"
          aria-label="Avatar"
        >
          <PersonStanding size={16} />
        </button>
      </DockShell>

      {simActive && (
        <div className="floating-3d floating-3d--bottom-left">
          <span className="dot dot--success" />
          <span>SIMULATING · {fps}fps</span>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/components/shell/__tests__/RightDock.test.tsx`
Expected: PASS — 5 tests. (`startSimulation` flips `simulationState` to `'running'`; `setViewMode3D`/`resetSimulation`/`setActiveTool3D` are the same actions `FloatingControls3D` used. The lucide icons `Shirt`/`Spline`/`Play`/`Pause`/`PersonStanding` are all real exports.)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --noEmit` → clean.
```
git add src/components/shell/RightDock.tsx src/components/shell/__tests__/RightDock.test.tsx
git commit -m "feat(docks): RightDock 3D dock (arrange/sew/simulate/avatar + sim status)"
```

---

## Task 3: Wire into AppShell; delete `FloatingControls3D`

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Delete: `src/components/shell/FloatingControls3D.tsx`
- Delete: `src/components/shell/__tests__/FloatingControls3D.test.tsx`
- Modify: `src/styles/floating.css`
- Modify: `src/components/Viewport3D/Viewport3D.tsx`

- [ ] **Step 1: Rewire AppShell**

In `src/components/shell/AppShell.tsx`: remove `import FloatingControls3D from './FloatingControls3D';` (line 14), add `import RightDock from './RightDock';`, and change `<FloatingControls3D />` (line ~241, inside `.canvas-area__3d`) to:

```tsx
          <RightDock onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)} />
```

(`setContextPanel` already exists, line 67; this is the same `onOpenPanel` shape already passed to `TopBar`/`LogoMenu` on lines 179/254.)

- [ ] **Step 2: Delete FloatingControls3D + its test**

```
git rm src/components/shell/FloatingControls3D.tsx src/components/shell/__tests__/FloatingControls3D.test.tsx
```

- [ ] **Step 3: Remove the dead pill CSS**

In `src/styles/floating.css`, remove the now-unused 3D-pill rules: `.floating-3d--top-right`, `.floating-3d__pill`, `.floating-3d__pill--default`, `.floating-3d__pill--default:hover`, `.floating-3d__pill--primary`, `.floating-3d__pill--primary:hover`. **KEEP** the base `.floating-3d` rule and `.floating-3d--bottom-left` — `RightDock` reuses both for the preserved "SIMULATING · Nfps" status element.

- [ ] **Step 4: Update the Viewport3D comment**

In `src/components/Viewport3D/Viewport3D.tsx` (~line 146), the `hideChrome` comment says "the new AppShell provides FloatingControls3D instead." Change `FloatingControls3D` to `RightDock` (comment only; no code change).

- [ ] **Step 5: Confirm no dangling references**

Run: `git grep -n "FloatingControls3D" -- src`
Expected: no matches under `src/` (docs may still reference it). If anything in `src/` still imports it, fix that import.

- [ ] **Step 6: Typecheck + full suite + lint**

Run: `npx tsc -b --noEmit` → clean.
Run: `npm run test` → all pass (DockShell + RightDock + Dock/LeftDock + everything else; the FloatingControls3D unit test is gone, its intent lives in RightDock's test).
Run: `npm run lint` → 0 errors.

- [ ] **Step 7: Commit**

```
git add -A src/components/shell src/styles/floating.css src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(docks): RightDock live in AppShell; remove FloatingControls3D"
```

---

## Task 4: Live verification

Confirm the 3D dock renders and its affordances work end-to-end. Scaffolding stays untracked.

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev -- --port 5183 --strictPort`. Wait for `Local: http://localhost:5183/`.

- [ ] **Step 2: Write the verification script**

Create (untracked) `scripts/verify-right-dock.mjs`:

```js
import { chromium } from 'playwright';
const BASE_URL = process.argv[2] || 'http://localhost:5183';
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell');
  await page.click('.pill-group__item:has-text("3D")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'design-handoff/ui-screenshots/verify-right-dock.png', animations: 'disabled' });
  console.log('  ✓ verify-right-dock.png');
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.dock--right .dock__tool')).map(b => b.getAttribute('aria-label')));
  console.log('  right-dock tools:', JSON.stringify(labels));
  await page.getByRole('button', { name: /^sew$/i }).click({ force: true });
  const tool3d = await page.evaluate(() => window.__OPENCLO_STORE__?.getState?.()?.tools?.activeTool3D);
  console.log('  after Sew click, activeTool3D:', tool3d, '· PASS:', tool3d === 'sew3d');
  await browser.close();
  console.log('done');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
```

- [ ] **Step 3: Run it**

Run: `node scripts/verify-right-dock.mjs http://localhost:5183`
Expected: `right-dock tools: ["Arrange","Sew","Simulate","Avatar"]` and `after Sew click, activeTool3D: sew3d · PASS: true`. Inspect `verify-right-dock.png`: a dark-chrome dock on the RIGHT with "3D" label + 4 icons, over the 3D viewport. Stop the dev server.

- [ ] **Step 4: Final gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green. (No commit — leave `scripts/verify-right-dock.mjs` untracked.)

---

## Self-Review

**Spec coverage** (against `2026-06-02-right-dock-3d-design.md`):
- §3 four affordances (Arrange/Sew/Simulate/Avatar, actions + active) → Task 2 RightDock + tests.
- §4 architecture (DockShell extraction, Dock refactor, RightDock, Dock.css `--right`, AppShell rewire, delete FloatingControls3D, Viewport3D comment) → Tasks 1–3.
- §5 AC1 (renders 3D/split, hidden 2D) → Task 2 (hidden test) + Task 4 (live).
- AC2/3/4/5 (each affordance) → Task 2 tests.
- AC6 (sim status preserved) → Task 2 RightDock JSX + Task 3 (CSS kept).
- AC7 (FloatingControls3D deleted, no refs, comment updated) → Task 3.
- AC8 (tokens, no emoji, lucide) → Task 1 CSS + Task 2 icons.
- AC9 (gates) → every task's gate steps + Task 4.
- §6 testing (DockShell, RightDock, Dock still green, FloatingControls3D test migrated) → Tasks 1–3.
- §8 out of scope (fabric, auto, e2e) → not implemented (correct).

**Placeholder scan:** No TBD/TODO. The e2e is explicitly out of scope per the spec (already red, e2e-rojo track) — not a gap.

**Type consistency:** `DockShell { side: 'left'|'right'; domainLabel: string; children }` used by `Dock` (side="left") and `RightDock` (side="right"). `RightDockProps { onOpenPanel: (name: string) => void }` matches the AppShell callsite `(name) => setContextPanel(...)`. The 3D actions (`startSimulation`/`pauseSimulation`/`setViewMode3D`/`resetSimulation` from `simulationSlice`, `setActiveTool3D` from `toolSlice`) and the read paths (`simulation.simulationState`/`viewMode3D`/`frameTimeMs`, `tools.activeTool3D`, `editor.viewMode`) are the exact ones `FloatingControls3D` used. `setViewMode` (editorSlice) in the hidden-in-2D test matches the LeftDock test usage.
