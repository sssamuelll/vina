# Dock Tool Editor (＋ customize) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the left (2D) dock's tool set a persisted, user-editable membership over a curated catalog — add/remove tools through a ＋ ghost button that opens a checklist popover.

**Architecture:** A new `tools2d: string[]` membership in `dockSlice` (default = the current 7 ids, persisted in the existing `openclo-docks` envelope, no version bump). A curated `DOCK_2D_CATALOG` (14 real `Tool2D` tools with lucide icons) in `dock2dTools.ts`. `LeftDock` renders `catalog.filter(id ∈ tools2d)` in catalog order and owns a ＋-button → `DockToolPicker` (pure checklist) lifecycle. Order stays catalog order (no reorder). Every commit keeps the tree green.

**Tech Stack:** Redux Toolkit + zod (`.array().default()` for backward-compat), React + react-redux, lucide-react icons, Vitest + @testing-library/react (no jest-dom — use `.toBeTruthy()`/`.toBeNull()`/`.disabled`/`getByRole`/`querySelector`).

**Spec:** `docs/superpowers/specs/2026-06-03-dock-tool-editor-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/store/dockSlice.ts` | Dock state + persistence | Add `DEFAULT_DOCK_2D_IDS`, `tools2d` field + default, `addDockTool`/`removeDockTool`/`resetDockTools` reducers, schema field, rehydrate. |
| `src/store/__tests__/dockSlice.test.ts` | dockSlice unit tests | Update round-trip test; add `tools2d` cases. |
| `src/copilot/perception/__tests__/contextBuilder.test.ts` | (possible) DockState fixture | Add `tools2d` if tsc flags the mock literal. |
| `src/components/shell/dock2dTools.ts` | 2D tool catalog | Make `DockToolDef.shortcut` optional; add `DOCK_2D_CATALOG` + `getDockToolById`; keep `DOCK_2D_TOOLS` (removed in Task 3). |
| `src/components/shell/DockToolPicker.tsx` | The checklist popover (pure) | **Create.** |
| `src/components/shell/__tests__/DockToolPicker.test.tsx` | Picker unit test | **Create.** |
| `src/components/shell/__tests__/dock2dTools.test.ts` | Catalog/defaults drift guard | **Create.** |
| `src/components/shell/Dock.tsx` | 2D dock (presentational) | Add `footer?` slot; guard aria-label for optional shortcut. |
| `src/components/shell/Dock.css` | dock styles | Add `.dock__add`, `.dock-editor`, `.dock-picker*`. |
| `src/components/shell/LeftDock.tsx` | 2D container | Resolve `tools2d`→catalog; own the ＋/picker lifecycle. |
| `src/components/shell/__tests__/Dock.test.tsx` | LeftDock tests | Add add/remove + picker-toggle cases. |
| `scripts/verify-dock-editor.mjs` (untracked) | Live Playwright check | **Create** (not committed). |

---

## Task 1: dockSlice — `tools2d` membership

**Files:**
- Modify: `src/store/dockSlice.ts`
- Test: `src/store/__tests__/dockSlice.test.ts`
- Possibly modify: `src/copilot/perception/__tests__/contextBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/store/__tests__/dockSlice.test.ts`, extend the dockSlice import to add the new actions + the default ids:

```ts
import dockReducer, { pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling, rehydrateDocks, addDockTool, removeDockTool, resetDockTools, DEFAULT_DOCK_2D_IDS } from '../dockSlice';
```

Update the existing round-trip test so its `state` includes `tools2d` (loadDocks will now always return it):

```ts
  it('persistDocks → loadDocks round-trips (incl. signaling + tools2d)', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] }, signaling: 'off' as const, tools2d: ['select', 'notch'] };
    persistDocks(state);
    expect(loadDocks()).toEqual(state);
  });
```

Append a new top-level `describe` block:

```ts
describe('dockSlice tools2d', () => {
  beforeEach(() => localStorage.clear());

  it('defaults tools2d to the 7 default ids', () => {
    expect(initial().tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
    expect(DEFAULT_DOCK_2D_IDS).toEqual(['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam']);
  });

  it('addDockTool appends a new id once (idempotent)', () => {
    let s = dockReducer(initial(), addDockTool('notch'));
    s = dockReducer(s, addDockTool('notch'));
    expect(s.tools2d.filter((x) => x === 'notch')).toEqual(['notch']);
    expect(s.tools2d).toContain('notch');
  });

  it('removeDockTool removes an id', () => {
    const s = dockReducer(initial(), removeDockTool('pen'));
    expect(s.tools2d).not.toContain('pen');
  });

  it('removeDockTool is a no-op when it would empty the set', () => {
    let s = dockReducer(initial(), resetDockTools());
    // reduce to a single tool
    for (const id of [...s.tools2d].filter((x) => x !== 'select')) s = dockReducer(s, removeDockTool(id));
    expect(s.tools2d).toEqual(['select']);
    s = dockReducer(s, removeDockTool('select'));
    expect(s.tools2d).toEqual(['select']); // last one stays
  });

  it('resetDockTools restores the defaults', () => {
    let s = dockReducer(initial(), addDockTool('notch'));
    s = dockReducer(s, removeDockTool('pen'));
    s = dockReducer(s, resetDockTools());
    expect(s.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('rehydrateDocks sets tools2d', () => {
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: ['select', 'seam'] }));
    expect(s.tools2d).toEqual(['select', 'seam']);
  });

  it('loadDocks defaults tools2d for a pre-slice-4 envelope (no tools2d key)', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'subtle' } }));
    const loaded = loadDocks();
    expect(loaded).not.toBeNull();
    expect(loaded!.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('loadDocks discards an envelope with a non-array tools2d', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: 'nope' } }));
    expect(loadDocks()).toBeNull();
  });

  it('NEW_PROJECT does not reset tools2d', () => {
    const added = dockReducer(initial(), addDockTool('notch'));
    const after = dockReducer(added, { type: 'global/newProject' });
    expect(after.tools2d).toContain('notch');
  });
});
```

(`initial`, `beforeEach` already exist at the top of the file from earlier slices.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: FAIL — the new actions / `DEFAULT_DOCK_2D_IDS` are not exported and `tools2d` is undefined.

- [ ] **Step 3: Implement the dockSlice changes**

In `src/store/dockSlice.ts`:

Add the default ids constant after the `FORBIDDEN_KEYS` line (before `idString`):

```ts
/** The 7 default left-dock 2D tool ids, in render order. Lives here (store layer)
 *  so the slice owns its default without importing the component-layer catalog. */
export const DEFAULT_DOCK_2D_IDS = ['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam'];
```

Extend the `DockState` interface (add `tools2d`):

```ts
export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
  /** Auto-signaling preference. 'off' mutes ✦ suggestions + badges + the "auto"
   *  label; kept items still render as plain buttons. Default 'subtle'. */
  signaling: 'subtle' | 'off';
  /** The left (2D) dock's tool membership — ids drawn from DOCK_2D_CATALOG.
   *  Rendered in catalog order. Default DEFAULT_DOCK_2D_IDS. Min 1 (never empty). */
  tools2d: string[];
}
```

Add the schema field — replace the `DockStateSchema` block:

```ts
const tools2dSchema = z.array(idString).max(MAX_PINNED).default([...DEFAULT_DOCK_2D_IDS]);

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: signalingSchema,
    tools2d: tools2dSchema,
  })
  .strict();
```

Update `initialState`:

```ts
const initialState: DockState = { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: [...DEFAULT_DOCK_2D_IDS] };
```

Add the three reducers + extend `rehydrateDocks` (inside the `reducers: { ... }` block, keeping the existing ones):

```ts
    addDockTool(state, action: PayloadAction<string>) {
      if (!state.tools2d.includes(action.payload)) state.tools2d.push(action.payload);
    },
    removeDockTool(state, action: PayloadAction<string>) {
      if (state.tools2d.length <= 1) return; // never empty the dock
      state.tools2d = state.tools2d.filter((id) => id !== action.payload);
    },
    resetDockTools(state) {
      state.tools2d = [...DEFAULT_DOCK_2D_IDS];
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
      state.signaling = action.payload.signaling;
      state.tools2d = action.payload.tools2d;
    },
```

Extend the action exports:

```ts
export const { pinAuto, unpinAuto, rehydrateDocks, toggleDockSignaling, addDockTool, removeDockTool, resetDockTools } = dockSlice.actions;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: PASS — all `tools2d` cases plus the existing pinAuto/unpinAuto/signaling/corrupt-envelope cases.

- [ ] **Step 5: Typecheck and fix any DockState-literal site**

Run: `npx tsc -b --noEmit`
Expected: likely ONE error in `src/copilot/perception/__tests__/contextBuilder.test.ts` — a `dock` fixture typed as `DockState` now missing `tools2d` (the slice-3c implementer added `signaling` to this same literal). If so, add `tools2d: [...]` to that fixture, e.g. change the `dock` mock to include `tools2d: ['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam']`. Re-run `npx tsc -b --noEmit` until clean. If no error appears, skip this edit.

- [ ] **Step 6: Commit**

```bash
git add src/store/dockSlice.ts src/store/__tests__/dockSlice.test.ts
# include the fixture only if you edited it:
git add src/copilot/perception/__tests__/contextBuilder.test.ts 2>/dev/null || true
git commit -m "feat(docks): dockSlice tools2d membership (add/remove/reset, backward-compat schema)"
```

(The dock has no consumer of `tools2d` yet — LeftDock still uses `DOCK_2D_TOOLS` — so the tree is green. Do NOT use `--no-verify`.)

---

## Task 2: Catalog + the DockToolPicker popover (pure)

**Files:**
- Modify: `src/components/shell/dock2dTools.ts`
- Create: `src/components/shell/DockToolPicker.tsx`
- Test: `src/components/shell/__tests__/dock2dTools.test.ts` (create), `src/components/shell/__tests__/DockToolPicker.test.tsx` (create)

- [ ] **Step 1: Write the failing catalog test**

Create `src/components/shell/__tests__/dock2dTools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DOCK_2D_CATALOG, getDockToolById } from '../dock2dTools';
import { DEFAULT_DOCK_2D_IDS } from '../../../store/dockSlice';

describe('dock2dTools catalog', () => {
  it('has 14 entries', () => {
    expect(DOCK_2D_CATALOG).toHaveLength(14);
  });

  it('getDockToolById resolves a member and is undefined for an unknown id', () => {
    expect(getDockToolById('select')?.label).toBe('Select');
    expect(getDockToolById('nope')).toBeUndefined();
  });

  it('every default id resolves in the catalog (drift guard)', () => {
    for (const id of DEFAULT_DOCK_2D_IDS) {
      expect(getDockToolById(id), `default id "${id}" missing from catalog`).toBeTruthy();
    }
  });

  it('catalog ids are all distinct', () => {
    const ids = DOCK_2D_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the first 7 catalog ids are the defaults in order', () => {
    expect(DOCK_2D_CATALOG.slice(0, 7).map((t) => t.id)).toEqual(DEFAULT_DOCK_2D_IDS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/dock2dTools.test.ts`
Expected: FAIL — `DOCK_2D_CATALOG` / `getDockToolById` don't exist.

- [ ] **Step 3: Add the catalog (and make `shortcut` optional)**

Replace `src/components/shell/dock2dTools.ts` in full:

```ts
import {
  MousePointer2, PenTool, Minus, Square, Scissors, Ruler, Spline,
  PenLine, Shapes, Triangle, MoveVertical, Scaling, Type, SquarePlus,
  type LucideIcon,
} from 'lucide-react';

export interface DockToolDef {
  /** Tool2D id passed to activate2DTool. */
  id: string;
  icon: LucideIcon;
  label: string;
  /** Display shortcut (real CLO3D binding). Optional — some tools have none. */
  shortcut?: string;
}

/** Curated catalog of dock-eligible 2D tools. Render order = this order; the
 *  first 7 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is a
 *  real Tool2D union member, activatable via activate2DTool. */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'Z' },
  { id: 'pen', icon: PenTool, label: 'Pen', shortcut: 'H' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: '⇧L' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Scissors', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
  { id: 'seam', icon: Spline, label: 'Sew', shortcut: 'B' },
  { id: 'editPattern', icon: PenLine, label: 'Edit Pattern', shortcut: 'Q' },
  { id: 'internalShape', icon: Shapes, label: 'Internal Shape', shortcut: 'G' },
  { id: 'notch', icon: Triangle, label: 'Notch' },
  { id: 'grainline', icon: MoveVertical, label: 'Grainline' },
  { id: 'grading', icon: Scaling, label: 'Grading' },
  { id: 'textAnnotation', icon: Type, label: 'Text' },
  { id: 'addPiece', icon: SquarePlus, label: 'Add Piece' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
  return DOCK_2D_CATALOG.find((t) => t.id === id);
}
```

(This removes the old `DOCK_2D_TOOLS` export. `LeftDock` still imports it — that import is repointed in Task 3. Until then `LeftDock` is the only breakage; to keep Task 2's commit green, this task does NOT remove the consumer — see Step 6's note. To avoid a red commit, KEEP a temporary compatibility export by appending the next line.)

Append a temporary compat export so `LeftDock` (untouched until Task 3) still compiles:

```ts
/** @deprecated Task-3 transitional: LeftDock switches to DOCK_2D_CATALOG + store membership. */
export const DOCK_2D_TOOLS: DockToolDef[] = DOCK_2D_CATALOG.slice(0, 7);
```

- [ ] **Step 4: Run the catalog test to verify it passes**

Run: `npm run test -- src/components/shell/__tests__/dock2dTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing DockToolPicker test**

Create `src/components/shell/__tests__/DockToolPicker.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DockToolPicker from '../DockToolPicker';
import { DOCK_2D_CATALOG } from '../dock2dTools';

afterEach(cleanup);

function setup(selectedIds: string[]) {
  const onAdd = vi.fn(), onRemove = vi.fn(), onReset = vi.fn();
  render(<DockToolPicker catalog={DOCK_2D_CATALOG} selectedIds={selectedIds} onAdd={onAdd} onRemove={onRemove} onReset={onReset} />);
  return { onAdd, onRemove, onReset };
}

describe('DockToolPicker', () => {
  it('renders one row per catalog tool', () => {
    setup(['select']);
    for (const tool of DOCK_2D_CATALOG) {
      expect(screen.getByText(tool.label)).toBeTruthy();
    }
  });

  it('an unselected tool is labeled Add and calls onAdd', () => {
    const { onAdd } = setup(['select']);
    fireEvent.click(screen.getByRole('button', { name: 'Add Notch to dock' }));
    expect(onAdd).toHaveBeenCalledWith('notch');
  });

  it('a selected tool is labeled Remove and calls onRemove', () => {
    const { onRemove } = setup(['select', 'pen']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pen from dock' }));
    expect(onRemove).toHaveBeenCalledWith('pen');
  });

  it('the only selected tool cannot be removed (disabled, no onRemove)', () => {
    const { onRemove } = setup(['select']);
    const btn = screen.getByRole('button', { name: 'Remove Select from dock' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('Reset to defaults calls onReset', () => {
    const { onReset } = setup(['select', 'notch']);
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/DockToolPicker.test.tsx`
Expected: FAIL — `DockToolPicker` does not exist.

- [ ] **Step 7: Create DockToolPicker**

Create `src/components/shell/DockToolPicker.tsx`:

```tsx
import type { DockToolDef } from './dock2dTools';

interface DockToolPickerProps {
  catalog: DockToolDef[];
  /** Ids currently in the dock. */
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

/**
 * The dock's customize popover — a pure checklist of the catalog. Checked = in
 * the dock. Clicking toggles membership (add when off, remove when on). The only
 * remaining selected tool is disabled (the dock can never be empty). Owns no
 * open/close lifecycle — the container (LeftDock) handles outside-click / Esc.
 */
export default function DockToolPicker({ catalog, selectedIds, onAdd, onRemove, onReset }: DockToolPickerProps) {
  return (
    <div className="dock-picker" role="dialog" aria-label="Customize dock tools">
      <div className="dock-picker__title">Dock tools</div>
      <ul className="dock-picker__list">
        {catalog.map((tool) => {
          const Icon = tool.icon;
          const selected = selectedIds.includes(tool.id);
          const isLast = selected && selectedIds.length === 1;
          return (
            <li key={tool.id}>
              <button
                type="button"
                className={`dock-picker__item ${selected ? 'dock-picker__item--on' : ''}`}
                onClick={() => (selected ? onRemove(tool.id) : onAdd(tool.id))}
                disabled={isLast}
                aria-pressed={selected}
                aria-label={`${selected ? 'Remove' : 'Add'} ${tool.label} ${selected ? 'from' : 'to'} dock`}
              >
                <Icon size={15} />
                <span className="dock-picker__label">{tool.label}</span>
                {tool.shortcut && <kbd className="dock-picker__kbd">{tool.shortcut}</kbd>}
                <span className="dock-picker__check">{selected ? '✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="dock-picker__reset" onClick={onReset}>Reset to defaults</button>
    </div>
  );
}
```

- [ ] **Step 8: Run both new tests + typecheck**

Run: `npm run test -- src/components/shell/__tests__/DockToolPicker.test.tsx src/components/shell/__tests__/dock2dTools.test.ts`
Then: `npx tsc -b --noEmit`
Expected: tests PASS; tsc clean (the compat `DOCK_2D_TOOLS` keeps LeftDock compiling).

- [ ] **Step 9: Commit**

```bash
git add src/components/shell/dock2dTools.ts src/components/shell/DockToolPicker.tsx src/components/shell/__tests__/dock2dTools.test.ts src/components/shell/__tests__/DockToolPicker.test.tsx
git commit -m "feat(docks): 2D tool catalog + DockToolPicker checklist popover"
```

Do NOT use `--no-verify`.

---

## Task 3: Wire LeftDock + Dock footer slot + CSS

**Files:**
- Modify: `src/components/shell/Dock.tsx`, `src/components/shell/Dock.css`, `src/components/shell/LeftDock.tsx`, `src/components/shell/dock2dTools.ts` (drop the temp export)
- Test: `src/components/shell/__tests__/Dock.test.tsx`

- [ ] **Step 1: Write the failing LeftDock tests**

In `src/components/shell/__tests__/Dock.test.tsx`, extend the dockSlice import to add the membership actions:

```ts
import dockReducer, { toggleDockSignaling, pinAuto, addDockTool, removeDockTool } from '../../../store/dockSlice';
```

Ensure `act` (from `@testing-library/react`) and `vi` (from `vitest`) are imported. Append inside `describe('LeftDock (container)', ...)`:

```ts
  it('adds a catalog tool to the dock when dispatched', () => {
    const { store } = renderLeftDock();
    expect(screen.queryByRole('button', { name: /notch/i })).toBeNull();
    act(() => { store.dispatch(addDockTool('notch')); });
    expect(screen.getByRole('button', { name: /notch/i })).toBeTruthy();
  });

  it('removes a default tool from the dock when dispatched', () => {
    const { store } = renderLeftDock();
    expect(screen.getByRole('button', { name: /pen · h/i })).toBeTruthy();
    act(() => { store.dispatch(removeDockTool('pen')); });
    expect(screen.queryByRole('button', { name: /pen · h/i })).toBeNull();
  });

  it('the ＋ button toggles the picker and Escape closes it', () => {
    renderLeftDock();
    const add = screen.getByRole('button', { name: 'Customize dock tools' });
    expect(screen.queryByRole('dialog', { name: 'Customize dock tools' })).toBeNull();
    fireEvent.click(add);
    expect(screen.getByRole('dialog', { name: 'Customize dock tools' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Customize dock tools' })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx`
Expected: FAIL — LeftDock still renders the static `DOCK_2D_TOOLS` (no Notch, no ＋ button / picker).

- [ ] **Step 3: Add the `footer` slot + optional-shortcut guard to Dock.tsx**

In `src/components/shell/Dock.tsx`, add `footer` to the props interface (after `autoZone`):

```ts
  /** Optional auto-suggest (✦) zone rendered below the pinned tools. */
  autoZone?: ReactNode;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
```

Add `footer` to the destructured params:

```ts
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, autoZone, footer }: DockProps) {
```

Update the tool button's `aria-label` to tolerate a missing shortcut, and render `footer` after `autoZone`:

```tsx
          <ToolTooltip key={tool.id} name={tool.label} shortcut={tool.shortcut} position="right">
            <button
              type="button"
              className={`dock__tool ${active ? 'dock__tool--active' : ''}`}
              onClick={() => onSelectTool(tool.id)}
              aria-label={tool.shortcut ? `${tool.label} · ${tool.shortcut}` : tool.label}
              aria-pressed={active}
            >
              <Icon size={16} />
            </button>
          </ToolTooltip>
```

and at the end of the `DockShell` children:

```tsx
      {autoZone}
      {footer}
    </DockShell>
```

- [ ] **Step 4: Add the CSS**

In `src/components/shell/Dock.css`, append:

```css
/* ── ＋ customize editor (slice 4) ── */
.dock-editor { position: relative; display: flex; }

.dock__add {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.dock__add:hover { border-color: var(--accent); color: var(--text-primary); }
.dock__add:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

.dock-picker {
  position: absolute;
  left: calc(100% + 8px);
  bottom: 0;
  z-index: 20;
  width: 220px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.dock-picker__title {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-ghost);
  padding: 4px 6px;
}
.dock-picker__list { list-style: none; margin: 0; padding: 0; }
.dock-picker__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}
.dock-picker__item:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
.dock-picker__item:disabled { opacity: 0.5; cursor: default; }
.dock-picker__item--on { color: var(--text-primary); }
.dock-picker__label { flex: 1; font-size: 12px; }
.dock-picker__kbd { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.dock-picker__check { width: 12px; color: var(--accent); }
.dock-picker__reset {
  width: 100%;
  margin-top: 4px;
  padding: 6px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}
.dock-picker__reset:hover { color: var(--text-primary); }
```

- [ ] **Step 5: Rewrite LeftDock to use the catalog + own the editor**

Replace `src/components/shell/LeftDock.tsx` in full:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus } from 'lucide-react';
import { store, type RootState } from '../../store';
import { activate2DTool } from '../../store/toolActivation';
import { selectWorkflowStage } from '../../store/selectors';
import { runUiExport } from '../../utils/export/uiExport';
import { pinAuto, unpinAuto, addDockTool, removeDockTool, resetDockTools } from '../../store/dockSlice';
import Dock from './Dock';
import DockAutoZone from './DockAutoZone';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG } from './dock2dTools';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';

interface LeftDockProps {
  onOpenPanel: (name: string) => void;
}

/** The left (2D) dock: an editable tool set + the stage-driven auto zone + a ＋
 *  customize editor. Hidden in 3D-only view. */
export default function LeftDock({ onOpenPanel }: LeftDockProps) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const stage = useSelector(selectWorkflowStage);
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
  const signaling = useSelector((s: RootState) => s.dock.signaling);
  const tools2d = useSelector((s: RootState) => s.dock.tools2d);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [pickerOpen]);

  if (viewMode === '3d') return null;

  const tools = DOCK_2D_CATALOG.filter((t) => tools2d.includes(t.id));

  const runSuggestion = (id: string) => {
    if (id === 'grade') onOpenPanel('Grading');
    else if (id === 'export') runUiExport('dxf', store.getState().project, dispatch);
  };

  const keptIds = pinnedExtra.left;
  const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
  const suggested = getDockSuggestions(stage, 'left').filter((s) => !keptIds.includes(s.id));

  return (
    <Dock
      domainLabel="2D"
      tools={tools}
      activeToolId={activeTool}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      autoZone={
        <DockAutoZone
          kept={kept}
          suggested={suggested}
          signaling={signaling}
          side="left"
          onRun={runSuggestion}
          onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
          onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
        />
      }
      footer={
        <div ref={editorRef} className="dock-editor">
          <button
            type="button"
            className="dock__add"
            onClick={() => setPickerOpen((o) => !o)}
            aria-label="Customize dock tools"
            aria-expanded={pickerOpen}
          >
            <Plus size={16} />
          </button>
          {pickerOpen && (
            <DockToolPicker
              catalog={DOCK_2D_CATALOG}
              selectedIds={tools2d}
              onAdd={(id) => dispatch(addDockTool(id))}
              onRemove={(id) => dispatch(removeDockTool(id))}
              onReset={() => dispatch(resetDockTools())}
            />
          )}
        </div>
      }
    />
  );
}
```

- [ ] **Step 6: Drop the temporary compat export**

In `src/components/shell/dock2dTools.ts`, delete the `@deprecated` `DOCK_2D_TOOLS` export added in Task 2 (nothing imports it now — LeftDock uses `DOCK_2D_CATALOG`).

- [ ] **Step 7: Run the affected tests**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx`
Expected: PASS — add/remove cases + the ＋/picker toggle + Escape; the existing convergence/suggestion tests still pass (default `tools2d` renders the same 7 tools).

- [ ] **Step 8: Full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: tsc clean (no remaining `DOCK_2D_TOOLS` references); all tests pass; lint 0 errors (pre-existing warnings ok).

- [ ] **Step 9: Commit**

```bash
git add src/components/shell/Dock.tsx src/components/shell/Dock.css src/components/shell/LeftDock.tsx src/components/shell/dock2dTools.ts src/components/shell/__tests__/Dock.test.tsx
git commit -m "feat(docks): editable 2D dock — ＋ customize editor wired to tools2d"
```

Do NOT use `--no-verify`.

---

## Task 4: Live verification script

**Files:**
- Create (untracked): `scripts/verify-dock-editor.mjs`

> Author the script; the controller runs it. Do NOT `git add` it.

- [ ] **Step 1: Write the script**

Create `scripts/verify-dock-editor.mjs`:

```js
// Live check: the ＋ dock editor adds/removes tools and persists tools2d.
// Run the dev server on 5183 first:  npm run dev -- --port 5183
import { chromium } from 'playwright';

const URL = 'http://localhost:5183';
const page = await (await chromium.launch()).newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__OPENCLO_STORE__, { timeout: 15000 });
await page.evaluate(() => window.__OPENCLO_STORE__.dispatch({ type: 'editor/setViewMode', payload: 'split' }));
await page.waitForTimeout(300);

const notchBefore = await page.locator('.dock--left [aria-label="Notch"]').count();
console.log('Notch in dock before (expect 0):', notchBefore);

// Open the editor, add Notch.
await page.locator('.dock--left [aria-label="Customize dock tools"]').click();
await page.waitForTimeout(150);
await page.locator('.dock-picker [aria-label="Add Notch to dock"]').click();
await page.waitForTimeout(200);
const notchAfter = await page.locator('.dock--left [aria-label="Notch"]').count();
const ls1 = await page.evaluate(() => JSON.parse(localStorage.getItem('openclo-docks') || 'null'));
console.log('Notch in dock after add (expect >=1):', notchAfter);
console.log('LS tools2d includes notch (expect true):', !!ls1?.data?.tools2d?.includes('notch'));

// Remove Pen.
await page.locator('.dock-picker [aria-label="Remove Pen from dock"]').click();
await page.waitForTimeout(200);
const penAfter = await page.locator('.dock--left [aria-label="Pen · H"]').count();
console.log('Pen in dock after remove (expect 0):', penAfter);

// Reset.
await page.locator('.dock-picker [aria-label="Reset to defaults"], .dock-picker__reset').first().click();
await page.waitForTimeout(200);
const penReset = await page.locator('.dock--left [aria-label="Pen · H"]').count();
const notchReset = await page.locator('.dock--left [aria-label="Notch"]').count();
console.log('Pen back after reset (expect >=1):', penReset);
console.log('Notch gone after reset (expect 0):', notchReset);

const ok = notchBefore === 0 && notchAfter >= 1 && !!ls1?.data?.tools2d?.includes('notch') && penAfter === 0 && penReset >= 1 && notchReset === 0;
console.log(ok ? 'PASS' : 'FAIL');
await page.context().browser().close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: (Controller runs)** Start `npm run dev -- --port 5183`, then `node scripts/verify-dock-editor.mjs`. Expected `PASS`: Notch absent → add → present + persisted in `tools2d`; Pen removed; Reset restores defaults (Pen back, Notch gone). Eyeball that the ＋ ghost button sits at the dock bottom and the popover opens toward the canvas as a tidy checklist.

---

## Self-Review

**1. Spec coverage:**
- §3 semantics (catalog-order render, default 7, add/remove, min-1, reset, 3D untouched, auto-zone independent) → Task 1 (reducers + min-1) + Task 3 (catalog-order render in LeftDock).
- §4 catalog (14 tools, `getDockToolById`, remove `DOCK_2D_TOOLS`, optional shortcut) → Task 2 (catalog + optional shortcut + temp export) + Task 3 Step 6 (drop temp export).
- §5 state/persistence (`tools2d` + `DEFAULT_DOCK_2D_IDS` + reducers + schema `.default` + rehydrate + no NEW_PROJECT) → Task 1.
- §6 components (catalog/picker/Dock footer/LeftDock lifecycle/CSS) → Tasks 2 + 3.
- §6 AC1 (slice) → Task 1; AC2 (catalog/getDockToolById/drift) → Task 2 test; AC3 (render filter, activate2DTool, tooltip) → Task 3; AC4 (＋ toggles picker) → Task 3 test; AC5 (add/remove/disabled-last/reset) → Task 2 (picker) + Task 3 (wired); AC6 (persist + NEW_PROJECT) → Task 1 + Task 4 live; AC7 (3D/auto unchanged) → existing tests stay green; AC8 (gates) → Task 3 Step 8.
- §7 testing → Tasks 1–4. §8 edge cases (remove-to-one, old envelope, stale id filtered, idempotent add, picker independent of auto-zone, signaling unrelated) → Task 1 reducers/tests (min-1, default, idempotent) + Task 3 (filter via catalog) + the `off` independence is inherent (footer is separate from autoZone).

**2. Placeholder scan:** No TBD/TODO; every code step is complete; commands have expected output. The only conditional is Task 1 Step 5 (fix the DockState fixture *if* tsc flags it) — that's a concrete instruction with the exact edit, not a placeholder.

**3. Type/name consistency:** `tools2d: string[]`, `DEFAULT_DOCK_2D_IDS`, `addDockTool`/`removeDockTool`/`resetDockTools` defined in Task 1 and used identically in Tasks 2 (test import) and 3 (dispatch). `DOCK_2D_CATALOG`/`getDockToolById`/`DockToolDef` (shortcut now optional) defined in Task 2, consumed in Task 3. `DockToolPicker` prop shape (`catalog`/`selectedIds`/`onAdd`/`onRemove`/`onReset`, no `onClose`) matches between Task 2 (component + test) and Task 3 (LeftDock call site). The ＋ button `aria-label="Customize dock tools"` and the picker `role="dialog"` aria-label match between Task 3 LeftDock and its test + the verify script. Render filter `DOCK_2D_CATALOG.filter(t => tools2d.includes(t.id))` gives catalog order (matches §3). Every commit is green: Task 1 (no consumer) → Task 2 (temp `DOCK_2D_TOOLS` keeps LeftDock compiling) → Task 3 (switch + drop temp export).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-dock-tool-editor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review (spec then quality) between tasks.
2. **Inline Execution** — execute in this session via executing-plans, batch with checkpoints.

Which approach?
