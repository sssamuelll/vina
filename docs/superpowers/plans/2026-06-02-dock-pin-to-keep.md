# Dock Pin-to-Keep (✦→📌) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user keep an auto suggestion (it then shows in the dock regardless of stage, with a 📌 badge) and drop it again — persisted across sessions/projects — without making the static default tools editable.

**Architecture:** A new `dockSlice` holds `pinnedExtra: { left, right }` (the kept auto-item ids), persisted to its own LS key via the `workflowSlice` envelope pattern and a focused `store.subscribe`. `DockAutoZone` is extended to render kept items (📌) + stage suggestions (✦, minus the kept), each with a corner badge sub-button (`stopPropagation`) that keeps/drops. The containers read `pinnedExtra`, compute kept/suggested, and dispatch `pinAuto`/`unpinAuto`.

**Tech Stack:** React + TypeScript, Redux Toolkit + zod, lucide-react, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-02-dock-pin-to-keep-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/store/dockSlice.ts` | `pinnedExtra` state + pin/unpin + persist/load (own LS envelope) | Create |
| `src/store/__tests__/dockSlice.test.ts` | reducers + persist round-trip + zod rejection | Create |
| `src/components/shell/dockSuggestions.ts` | add `getAutoItemById(id)` | Modify |
| `src/components/shell/__tests__/dockSuggestions.test.ts` | `getAutoItemById` cases | Modify |
| `src/components/shell/DockAutoZone.tsx` | render kept (📌) + suggested (✦) + badge sub-buttons | Modify |
| `src/components/shell/Dock.css` | `.dock__tool-wrap`, `.dock__badge` styles | Modify |
| `src/components/shell/__tests__/DockAutoZone.test.tsx` | kept/suggested/badge/stopPropagation | Modify |
| `src/store/index.ts` | register `dock` + boot rehydrate + persist subscribe | Modify |
| `src/components/shell/LeftDock.tsx` | read pinnedExtra, compute kept/suggested, dispatch pin/unpin | Modify |
| `src/components/shell/RightDock.tsx` | same (right side) | Modify |
| `src/components/shell/__tests__/Dock.test.tsx` | add `dock` reducer + keep/drop test (LeftDock) | Modify |
| `src/components/shell/__tests__/RightDock.test.tsx` | add `dock` reducer + keep test (RightDock) | Modify |

---

## Task 1: `dockSlice` + `getAutoItemById`

**Files:**
- Create: `src/store/dockSlice.ts`
- Create: `src/store/__tests__/dockSlice.test.ts`
- Modify: `src/components/shell/dockSuggestions.ts`
- Modify: `src/components/shell/__tests__/dockSuggestions.test.ts`

- [ ] **Step 1: Write the failing dockSlice test**

Create `src/store/__tests__/dockSlice.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, { pinAuto, unpinAuto, persistDocks, loadDocks } from '../dockSlice';

const initial = () => dockReducer(undefined, { type: '@@INIT' });

describe('dockSlice reducers', () => {
  it('pinAuto adds an id once (idempotent)', () => {
    let s = dockReducer(initial(), pinAuto({ side: 'left', id: 'grade' }));
    s = dockReducer(s, pinAuto({ side: 'left', id: 'grade' }));
    expect(s.pinnedExtra.left).toEqual(['grade']);
    expect(s.pinnedExtra.right).toEqual([]);
  });
  it('unpinAuto removes the id', () => {
    let s = dockReducer(initial(), pinAuto({ side: 'right', id: 'bom' }));
    s = dockReducer(s, unpinAuto({ side: 'right', id: 'bom' }));
    expect(s.pinnedExtra.right).toEqual([]);
  });
});

describe('dockSlice persistence', () => {
  beforeEach(() => localStorage.clear());
  it('persistDocks → loadDocks round-trips', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] } };
    persistDocks(state);
    expect(loadDocks()).toEqual(state);
  });
  it('loadDocks returns null when nothing stored', () => {
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for a corrupt envelope', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 99, data: { pinnedExtra: { left: [], right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for wrong-typed data', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: 'nope', right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: FAIL — cannot resolve `../dockSlice`.

- [ ] **Step 3: Create `dockSlice`**

Create `src/store/dockSlice.ts` (mirrors `workflowSlice`'s persistence pattern):

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

type DockSide = 'left' | 'right';

export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
}

const STORAGE_KEY = 'openclo-docks';
const STORAGE_VERSION = 1;
const MAX_PINNED = 16;
const MAX_ID_LEN = 80;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const idString = z
  .string()
  .min(1)
  .max(MAX_ID_LEN)
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });
const sideArray = z.array(idString).max(MAX_PINNED);

const DockStateSchema = z
  .object({ pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict() })
  .strict();

const PersistedEnvelopeSchema = z
  .object({ version: z.literal(STORAGE_VERSION), data: DockStateSchema })
  .strict();

const initialState: DockState = { pinnedExtra: { left: [], right: [] } };

/** Persist the kept-dock set to its own LS key (small per-user UI preference;
 *  LS-only, co-located in spirit with workflowSlice prefs — not project data). */
export function persistDocks(state: DockState): void {
  safeSetItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data: state }));
}

export function loadDocks(): DockState | null {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error('forbidden key');
      return value;
    });
  } catch {
    return null;
  }
  const result = PersistedEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[dockSlice] discarding corrupt envelope', {
      issues: result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
    return null;
  }
  return result.data.data;
}

const dockSlice = createSlice({
  name: 'dock',
  initialState,
  reducers: {
    pinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      if (!state.pinnedExtra[side].includes(id)) state.pinnedExtra[side].push(id);
    },
    unpinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      state.pinnedExtra[side] = state.pinnedExtra[side].filter((x) => x !== id);
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
    },
  },
  // No NEW_PROJECT handler: the kept set is a user preference and persists across projects.
});

export const { pinAuto, unpinAuto, rehydrateDocks } = dockSlice.actions;
export default dockSlice.reducer;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Add `getAutoItemById` (failing test first)**

In `src/components/shell/__tests__/dockSuggestions.test.ts`, append:

```ts
import { getAutoItemById } from '../dockSuggestions';

describe('getAutoItemById', () => {
  it('returns the item for a known id', () => {
    expect(getAutoItemById('grade')?.id).toBe('grade');
    expect(getAutoItemById('bom')?.label).toBe('BOM');
  });
  it('returns undefined for an unknown id', () => {
    expect(getAutoItemById('nope')).toBeUndefined();
  });
});
```

Run: `npm run test -- src/components/shell/__tests__/dockSuggestions.test.ts`
Expected: FAIL — `getAutoItemById` not exported.

- [ ] **Step 6: Implement `getAutoItemById`**

In `src/components/shell/dockSuggestions.ts`, after the `GRADE`/`EXPORT`/`FITMAP`/`BOM` consts, add:

```ts
const ALL_AUTO_ITEMS: Record<string, DockSuggestion> = { grade: GRADE, export: EXPORT, fitmap: FITMAP, bom: BOM };

/** Look up an auto item by id (so a kept id renders regardless of stage). */
export function getAutoItemById(id: string): DockSuggestion | undefined {
  return ALL_AUTO_ITEMS[id];
}
```

- [ ] **Step 7: Run + typecheck**

Run: `npm run test -- src/components/shell/__tests__/dockSuggestions.test.ts`
Expected: PASS (5 existing + 2 new).
Run: `npx tsc -b --noEmit` → clean.

- [ ] **Step 8: Commit**

```
git add src/store/dockSlice.ts src/store/__tests__/dockSlice.test.ts src/components/shell/dockSuggestions.ts src/components/shell/__tests__/dockSuggestions.test.ts
git commit -m "feat(docks): dockSlice (persisted pinnedExtra) + getAutoItemById"
```

---

## Task 2: Badge sub-buttons in `DockAutoZone`

**Files:**
- Modify: `src/components/shell/DockAutoZone.tsx`
- Modify: `src/components/shell/Dock.css`
- Modify: `src/components/shell/__tests__/DockAutoZone.test.tsx`

- [ ] **Step 1: Rewrite the DockAutoZone test**

Replace `src/components/shell/__tests__/DockAutoZone.test.tsx` with:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DockAutoZone from '../DockAutoZone';
import { Scaling, Package } from 'lucide-react';

afterEach(cleanup);

const GRADE = { id: 'grade', icon: Scaling, label: 'Grade' };
const BOM = { id: 'bom', icon: Package, label: 'BOM' };

function setup(props: Partial<Parameters<typeof DockAutoZone>[0]> = {}) {
  const onRun = vi.fn(), onPin = vi.fn(), onUnpin = vi.fn();
  render(<DockAutoZone kept={[]} suggested={[]} onRun={onRun} onPin={onPin} onUnpin={onUnpin} {...props} />);
  return { onRun, onPin, onUnpin };
}

describe('DockAutoZone', () => {
  it('renders nothing when kept and suggested are both empty', () => {
    const { } = setup();
    expect(screen.queryByText('auto')).toBeNull();
  });

  it('renders suggested items under the auto label with a Keep badge', () => {
    setup({ suggested: [GRADE] });
    expect(screen.getByText('auto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep Grade' })).toBeTruthy();
  });

  it('renders kept items with an Unpin badge and no auto label when no suggestions', () => {
    setup({ kept: [BOM] });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unpin BOM' })).toBeTruthy();
  });

  it('the Keep badge calls onPin and NOT onRun', () => {
    const { onRun, onPin } = setup({ suggested: [GRADE] });
    fireEvent.click(screen.getByRole('button', { name: 'Keep Grade' }));
    expect(onPin).toHaveBeenCalledWith('grade');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('the Unpin badge calls onUnpin and NOT onRun', () => {
    const { onRun, onUnpin } = setup({ kept: [BOM] });
    fireEvent.click(screen.getByRole('button', { name: 'Unpin BOM' }));
    expect(onUnpin).toHaveBeenCalledWith('bom');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('the icon button calls onRun', () => {
    const { onRun } = setup({ suggested: [GRADE] });
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onRun).toHaveBeenCalledWith('grade');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: FAIL — the old `DockAutoZone` has `suggestions`/`onRun` props, not `kept`/`suggested`/`onPin`/`onUnpin`.

- [ ] **Step 3: Rewrite `DockAutoZone`**

Replace `src/components/shell/DockAutoZone.tsx` with:

```tsx
import { Pin, Sparkles } from 'lucide-react';
import type { DockSuggestion } from './dockSuggestions';

interface DockAutoZoneProps {
  /** Kept items — shown always, with an unpin (📌) badge. */
  kept: DockSuggestion[];
  /** Stage suggestions (minus the kept), with a keep (✦) badge. */
  suggested: DockSuggestion[];
  onRun: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * The dock's kept + auto-suggest zone. Kept items (📌) render first (they have
 * joined the pinned area), then — if any — a separator + "auto" label + the
 * stage suggestions (✦). Each item is an icon button (runs the action) plus a
 * corner badge sub-button (keeps/drops; stopPropagation so it never runs the
 * action). Renders nothing when both lists are empty.
 */
export default function DockAutoZone({ kept, suggested, onRun, onPin, onUnpin }: DockAutoZoneProps) {
  if (kept.length === 0 && suggested.length === 0) return null;

  const renderItem = (s: DockSuggestion, variant: 'kept' | 'suggested') => {
    const Icon = s.icon;
    const BadgeIcon = variant === 'kept' ? Pin : Sparkles;
    return (
      <div key={s.id} className="dock__tool-wrap">
        <button
          type="button"
          className={`dock__tool ${variant === 'suggested' ? 'dock__tool--auto' : ''}`}
          onClick={() => onRun(s.id)}
          title={s.label}
          aria-label={s.label}
        >
          <Icon size={16} />
        </button>
        <button
          type="button"
          className={`dock__badge ${variant === 'kept' ? 'dock__badge--pin' : 'dock__badge--auto'}`}
          onClick={(e) => { e.stopPropagation(); (variant === 'kept' ? onUnpin : onPin)(s.id); }}
          aria-label={`${variant === 'kept' ? 'Unpin' : 'Keep'} ${s.label}`}
        >
          <BadgeIcon size={9} />
        </button>
      </div>
    );
  };

  return (
    <>
      {kept.map((s) => renderItem(s, 'kept'))}
      {suggested.length > 0 && (
        <>
          <div className="dock__sep" />
          <div className="dock__auto-label">auto</div>
          {suggested.map((s) => renderItem(s, 'suggested'))}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Add the badge styles**

In `src/components/shell/Dock.css`, append:

```css
.dock__tool-wrap {
  position: relative;
  display: flex;
}

.dock__badge {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.dock__badge:hover { transform: scale(1.22); }
.dock__badge--pin { color: var(--accent); }
.dock__badge--auto { color: var(--dock-auto); }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: PASS — 6 tests.
Run: `npx tsc -b --noEmit` → clean. (`Pin` and `Sparkles` are real lucide exports.)

- [ ] **Step 6: Commit**

```
git add src/components/shell/DockAutoZone.tsx src/components/shell/Dock.css src/components/shell/__tests__/DockAutoZone.test.tsx
git commit -m "feat(docks): kept + suggested items with keep/unpin badge sub-buttons"
```

---

## Task 3: Wire dockSlice + the docks; update tests

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/components/shell/LeftDock.tsx`
- Modify: `src/components/shell/RightDock.tsx`
- Modify: `src/components/shell/__tests__/Dock.test.tsx`
- Modify: `src/components/shell/__tests__/RightDock.test.tsx`

- [ ] **Step 1: Register dockSlice + persistence in the store**

In `src/store/index.ts`: add `import dockReducer, { loadDocks, rehydrateDocks, persistDocks } from './dockSlice';`. Add `dock: dockReducer,` to the `reducer` map. After the existing workflow boot block (`const savedWorkflow = loadWorkflow(); …`), add:

```ts
const savedDocks = loadDocks();
if (savedDocks) {
  store.dispatch(rehydrateDocks(savedDocks));
}

// Persist the kept-dock set whenever it changes (focused subscribe; isolated
// from the cascade-middleware chain and the workflowSlice envelope).
let prevDock = store.getState().dock;
store.subscribe(() => {
  const dock = store.getState().dock;
  if (dock !== prevDock) {
    prevDock = dock;
    persistDocks(dock);
  }
});
```

- [ ] **Step 2: Wire LeftDock**

In `src/components/shell/LeftDock.tsx`, add imports:

```tsx
import { pinAuto, unpinAuto } from '../../store/dockSlice';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';
```

(If `getDockSuggestions` is already imported, merge the names.) Add a `pinnedExtra` read next to the other selectors:

```tsx
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
```

Replace the `autoZone={...}` prop on `<Dock>` with:

```tsx
      autoZone={(() => {
        const keptIds = pinnedExtra.left;
        const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
        const suggested = getDockSuggestions(stage, 'left').filter((s) => !keptIds.includes(s.id));
        return (
          <DockAutoZone
            kept={kept}
            suggested={suggested}
            onRun={runSuggestion}
            onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
            onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
          />
        );
      })()}
```

- [ ] **Step 3: Wire RightDock**

In `src/components/shell/RightDock.tsx`, add imports:

```tsx
import { pinAuto, unpinAuto } from '../../store/dockSlice';
import { getAutoItemById, type DockSuggestion } from './dockSuggestions';
```

(Merge with the existing `getDockSuggestions` import.) Add `const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);` next to the other selectors. Replace the `<DockAutoZone .../>` line with:

```tsx
        {(() => {
          const keptIds = pinnedExtra.right;
          const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
          const suggested = getDockSuggestions(stage, 'right').filter((s) => !keptIds.includes(s.id));
          return (
            <DockAutoZone
              kept={kept}
              suggested={suggested}
              onRun={runSuggestion}
              onPin={(id) => dispatch(pinAuto({ side: 'right', id }))}
              onUnpin={(id) => dispatch(unpinAuto({ side: 'right', id }))}
            />
          );
        })()}
```

- [ ] **Step 4: Update the LeftDock tests**

In `src/components/shell/__tests__/Dock.test.tsx`, add `import dockReducer, { pinAuto } from '../../../store/dockSlice';` and add `dock: dockReducer` to the `renderLeftDock` store's reducer map. The existing 3a "shows a grade ✦ suggestion … and runs it" test still passes (the icon button keeps `aria-label='Grade'`). Add a keep/drop test:

```tsx
  it('keeps a grade suggestion (✦→📌) and persists it in the dock slice', () => {
    const { store } = renderLeftDock();
    store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    fireEvent.click(screen.getByRole('button', { name: 'Keep Grade' }));
    expect(store.getState().dock.pinnedExtra.left).toEqual(['grade']);
    // Now rendered as a kept item (Unpin badge), and no longer a suggestion.
    expect(screen.getByRole('button', { name: 'Unpin Grade' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep Grade' })).toBeNull();
  });
```

(`act()` wrapping may be needed around the `store.dispatch` per the existing 3a tests — match that file's pattern.)

- [ ] **Step 5: Update the RightDock tests**

In `src/components/shell/__tests__/RightDock.test.tsx`, add `import dockReducer from '../../../store/dockSlice';` and add `dock: dockReducer` to the `renderRightDock` store's reducer map (and the inline 2D-hidden store). The existing tests still pass. Add a keep test:

```tsx
  it('keeps a BOM suggestion at the simulated stage', () => {
    const { store } = renderRightDock();
    store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    store.dispatch(startSimulation());
    store.dispatch(pauseSimulation());
    fireEvent.click(screen.getByRole('button', { name: 'Keep BOM' }));
    expect(store.getState().dock.pinnedExtra.right).toEqual(['bom']);
    expect(screen.getByRole('button', { name: 'Unpin BOM' })).toBeTruthy();
  });
```

(Match the file's existing `act()`/import patterns; `addPiece`/`startSimulation`/`pauseSimulation` are already imported from the 3a update.)

- [ ] **Step 6: Typecheck + full suite + lint**

Run: `npx tsc -b --noEmit` → clean.
Run: `npm run test` → all pass.
Run: `npm run lint` → 0 errors.

- [ ] **Step 7: Commit**

```
git add -A src/store/index.ts src/components/shell
git commit -m "feat(docks): wire dockSlice; keep/drop auto items via the badges"
```

---

## Task 4: Live verification

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev -- --port 5183 --strictPort`. Wait for `Local: http://localhost:5183/`.

- [ ] **Step 2: Write the verification script**

Create (untracked) `scripts/verify-pin-to-keep.mjs`:

```js
import { chromium } from 'playwright';
const BASE_URL = process.argv[2] || 'http://localhost:5183';
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell');
  await page.click('.pill-group__item:has-text("2D")');
  await page.evaluate(() => window.__OPENCLO_STORE__?.dispatch?.({ type: 'project/addPiece', payload: { id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } }));
  await page.waitForTimeout(400);
  // Click the Keep badge on the grade ✦.
  await page.getByRole('button', { name: 'Keep Grade' }).click({ force: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'design-handoff/ui-screenshots/verify-pin-to-keep.png', animations: 'disabled' });
  const kept = await page.evaluate(() => window.__OPENCLO_STORE__?.getState?.()?.dock?.pinnedExtra?.left);
  const ls = await page.evaluate(() => localStorage.getItem('openclo-docks'));
  console.log('  pinnedExtra.left:', JSON.stringify(kept));
  console.log('  persisted:', ls);
  console.log('  PASS:', Array.isArray(kept) && kept.includes('grade') && !!ls && ls.includes('grade'));
  await browser.close();
  console.log('done');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
```

- [ ] **Step 3: Run it**

Run: `node scripts/verify-pin-to-keep.mjs http://localhost:5183`
Expected: `pinnedExtra.left: ["grade"]`, a `persisted:` line containing `grade`, and `PASS: true`. Inspect `verify-pin-to-keep.png`: the grade item now sits in the pinned area with a 📌 badge (no longer under "auto"). Stop the dev server.

- [ ] **Step 4: Final gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green. (No commit — leave the verify script untracked.)

---

## Self-Review

**Spec coverage** (against `2026-06-02-dock-pin-to-keep-design.md`):
- §4 state/persistence (dockSlice, own LS envelope, subscribe, boot, no NEW_PROJECT clear) → Task 1 + Task 3 Step 1.
- §5 components (dockSlice, getAutoItemById, DockAutoZone extension, Dock.css badges, Left/RightDock, store wiring) → Tasks 1–3.
- §6 AC1 (reducers + persist + zod) → Task 1; AC2/3 (✦→keep / 📌→drop, stopPropagation, no-dup) → Task 2 (DockAutoZone) + Task 3 (containers); AC4 (icon runs) → Task 2 test; AC5 (persists across reload + NEW_PROJECT) → Task 1 (no NEW_PROJECT handler) + Task 4 (persisted LS); AC6 (badges, aria-labels, no emoji — lucide Pin/Sparkles) → Task 2; AC7 (defaults/1–3a unchanged) → optional autoZone slot + tests still green; AC8 (gates) → every task.
- §7 testing → Tasks 1–3 tests.
- §9 out of scope → not implemented.

**Placeholder scan:** No TBD/TODO. The `act()` wrapping notes are conditional ("match the file's pattern") with a concrete reference, not placeholders.

**Type consistency:** `DockState.pinnedExtra: {left: string[]; right: string[]}` consistent across dockSlice + the container reads `s.dock.pinnedExtra`. `pinAuto`/`unpinAuto` payload `{side: 'left'|'right'; id: string}` consistent across slice, DockAutoZone (`onPin(id)`/`onUnpin(id)` — the container supplies the side), and the containers. `DockAutoZone` props `{kept, suggested, onRun, onPin, onUnpin}` consistent between component, test, and both containers. `getAutoItemById(id): DockSuggestion | undefined` filtered via a type guard in the containers. `Pin`/`Sparkles` real lucide icons.
