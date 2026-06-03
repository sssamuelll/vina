# Dock Signaling Toggle (subtle / off) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted per-user `signaling: 'subtle' | 'off'` dock preference and a `LogoMenu ▸ View` toggle ("Dock Suggestions") that mutes the auto-signaling layer (no ✦ suggestions, no `auto` label, no keep/unpin badges) while still rendering the user's kept tools as plain buttons.

**Architecture:** Extend the existing `dockSlice` (new field + param-less reducer + backward-compatible zod default — no new LS key, no version bump). `DockAutoZone` gains a required `signaling` prop that gates the badge sub-buttons and the suggested group. `LeftDock`/`RightDock` read `s.dock.signaling` and pass it down. `LogoMenu` adds a declarative `checked`+`action` View item that dispatches the toggle — no `handleItemClick` change.

**Tech Stack:** Redux Toolkit (`createSlice`), zod (schema with `.default()`), React + react-redux, Vitest + @testing-library/react (no jest-dom matchers — use `.querySelector`/`.toBeTruthy()`/`.className`), Playwright for the live LogoMenu check.

**Spec:** `docs/superpowers/specs/2026-06-02-dock-signaling-toggle-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/store/dockSlice.ts` | Dock state + persistence | Add `signaling` field + `initialState` default; `toggleDockSignaling` reducer; extend `rehydrateDocks`; add `signaling` (with `.default`) to `DockStateSchema`; export action. |
| `src/store/__tests__/dockSlice.test.ts` | dockSlice unit tests | Add signaling cases; fix the existing round-trip test (now carries `signaling`). |
| `src/components/shell/DockAutoZone.tsx` | Kept + auto-suggest render | Add required `signaling` prop; gate badges and suggested group on `off`. |
| `src/components/shell/__tests__/DockAutoZone.test.tsx` | DockAutoZone RTL tests | Add `off` cases; pass `signaling` in `setup` default. |
| `src/components/shell/LeftDock.tsx` | 2D dock container | Read `s.dock.signaling`; pass to `DockAutoZone`. |
| `src/components/shell/RightDock.tsx` | 3D dock container | Read `s.dock.signaling`; pass to `DockAutoZone`. |
| `src/components/shell/__tests__/Dock.test.tsx` | LeftDock container tests | Add an `off` mutes-the-auto-layer case. |
| `src/components/shell/__tests__/RightDock.test.tsx` | RightDock tests | Add an `off` mutes-the-auto-layer case. |
| `src/components/shell/LogoMenu.tsx` | App menu | Import `toggleDockSignaling`; add `Dock Suggestions` View item. |
| `scripts/verify-dock-signaling.mjs` (untracked) | Live Playwright verify | Toggle the menu item, assert dock + LS. |

No CSS change. No `store/index.ts` change (boot `rehydrateDocks(loadDocks())` and the focused `store.subscribe` already carry/persist the whole `dock` state).

---

## Task 1: dockSlice — signaling state, reducer, schema, rehydrate

**Files:**
- Modify: `src/store/dockSlice.ts`
- Test: `src/store/__tests__/dockSlice.test.ts`

- [ ] **Step 1: Update the existing round-trip test and add the failing signaling tests**

In `src/store/__tests__/dockSlice.test.ts`, update the import line and the round-trip test, and append a new `describe` block.

Change the import (line 5) to add `toggleDockSignaling` and `rehydrateDocks`:

```ts
import dockReducer, { pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling, rehydrateDocks } from '../dockSlice';
```

Replace the existing round-trip test (lines 25-29) so the persisted state carries `signaling` (loadDocks now always returns it):

```ts
  it('persistDocks → loadDocks round-trips (incl. signaling)', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] }, signaling: 'off' as const };
    persistDocks(state);
    expect(loadDocks()).toEqual(state);
  });
```

Append this new block at the end of the file (before the final closing brace of the file — i.e. as a new top-level `describe`):

```ts
describe('dockSlice signaling', () => {
  beforeEach(() => localStorage.clear());

  it('defaults signaling to subtle', () => {
    expect(initial().signaling).toBe('subtle');
  });

  it('toggleDockSignaling flips subtle → off → subtle', () => {
    let s = dockReducer(initial(), toggleDockSignaling());
    expect(s.signaling).toBe('off');
    s = dockReducer(s, toggleDockSignaling());
    expect(s.signaling).toBe('subtle');
  });

  it('rehydrateDocks sets signaling', () => {
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'off' }));
    expect(s.signaling).toBe('off');
  });

  it('loadDocks defaults signaling to subtle for a pre-3c envelope (no signaling key)', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] } } }));
    const loaded = loadDocks();
    expect(loaded).not.toBeNull();
    expect(loaded!.signaling).toBe('subtle');
  });

  it('loadDocks discards an envelope with an invalid signaling value', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'loud' } }));
    expect(loadDocks()).toBeNull();
  });

  it('NEW_PROJECT does not reset signaling', () => {
    const off = dockReducer(initial(), toggleDockSignaling());
    const after = dockReducer(off, { type: 'global/newProject' });
    expect(after.signaling).toBe('off');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: FAIL — `toggleDockSignaling`/`rehydrateDocks` not exported (or `signaling` undefined). The round-trip and new signaling tests fail.

- [ ] **Step 3: Implement the dockSlice changes**

In `src/store/dockSlice.ts`:

Replace the `DockState` interface (lines 7-10):

```ts
export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
  /** Auto-signaling preference. 'off' mutes ✦ suggestions + badges + the "auto"
   *  label; kept items still render as plain buttons. Default 'subtle'. */
  signaling: 'subtle' | 'off';
}
```

Add the signaling schema and extend `DockStateSchema` (replace lines 25-27):

```ts
const signalingSchema = z.enum(['subtle', 'off']).default('subtle');

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: signalingSchema,
  })
  .strict();
```

Replace `initialState` (line 33):

```ts
const initialState: DockState = { pinnedExtra: { left: [], right: [] }, signaling: 'subtle' };
```

Add the `toggleDockSignaling` reducer and extend `rehydrateDocks` (replace the `reducers` block, lines 66-78):

```ts
  reducers: {
    pinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      if (!state.pinnedExtra[side].includes(id)) state.pinnedExtra[side].push(id);
    },
    unpinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      state.pinnedExtra[side] = state.pinnedExtra[side].filter((x) => x !== id);
    },
    toggleDockSignaling(state) {
      state.signaling = state.signaling === 'subtle' ? 'off' : 'subtle';
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
      state.signaling = action.payload.signaling;
    },
  },
```

Extend the action exports (line 82):

```ts
export const { pinAuto, unpinAuto, rehydrateDocks, toggleDockSignaling } = dockSlice.actions;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/store/__tests__/dockSlice.test.ts`
Expected: PASS — all dockSlice tests green, including the existing `pinAuto`/`unpinAuto`/corrupt-envelope cases.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean (no errors). Note: `DockAutoZone` callers will NOT error yet — the new prop is added in Task 2; this task only touches the slice.

- [ ] **Step 6: Commit**

```bash
git add src/store/dockSlice.ts src/store/__tests__/dockSlice.test.ts
git commit -m "feat(docks): dockSlice signaling subtle/off (default subtle, backward-compat schema)"
```

---

## Task 2: DockAutoZone — gate badges and the suggested group on `off`

**Files:**
- Modify: `src/components/shell/DockAutoZone.tsx`
- Test: `src/components/shell/__tests__/DockAutoZone.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/shell/__tests__/DockAutoZone.test.tsx`, update `setup` to pass a default `signaling` and add the `off` cases.

Replace the `setup` helper (lines 14-18) so it defaults `signaling='subtle'` (existing tests keep current behavior) while letting props override it:

```ts
function setup(props: Partial<Parameters<typeof DockAutoZone>[0]> = {}) {
  const onRun = vi.fn(), onPin = vi.fn(), onUnpin = vi.fn();
  const { container } = render(
    <DockAutoZone kept={[]} suggested={[]} signaling="subtle" onRun={onRun} onPin={onPin} onUnpin={onUnpin} {...props} />,
  );
  return { onRun, onPin, onUnpin, container };
}
```

Append these tests inside the `describe('DockAutoZone', ...)` block (before its closing `});`):

```ts
  it('off: kept items render as plain buttons with no badge', () => {
    const { container } = setup({ kept: [BOM], signaling: 'off' });
    expect(screen.getByRole('button', { name: 'BOM' })).toBeTruthy();
    expect(container.querySelector('.dock__badge')).toBeNull();
    expect(screen.queryByText('auto')).toBeNull();
  });

  it('off: the kept icon still calls onRun', () => {
    const { onRun } = setup({ kept: [BOM], signaling: 'off' });
    fireEvent.click(screen.getByRole('button', { name: 'BOM' }));
    expect(onRun).toHaveBeenCalledWith('bom');
  });

  it('off: no suggestions rise even when suggested is non-empty', () => {
    const { container } = setup({ suggested: [GRADE], signaling: 'off' });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grade' })).toBeNull();
    expect(container.querySelector('.dock__tool')).toBeNull();
  });

  it('off + no kept renders nothing', () => {
    const { container } = setup({ kept: [], suggested: [GRADE], signaling: 'off' });
    expect(container.querySelector('.dock__tool-wrap')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: FAIL — TypeScript/runtime: `signaling` is not yet a prop, so the new `off` cases render the unchanged component (badges still present, suggestions still rise) and the assertions fail.

- [ ] **Step 3: Implement the DockAutoZone change**

Replace `src/components/shell/DockAutoZone.tsx` in full:

```tsx
import { Pin, Sparkles } from 'lucide-react';
import type { DockSuggestion } from './dockSuggestions';

interface DockAutoZoneProps {
  /** Kept items — shown always. With a 📌 unpin badge in 'subtle'; plain in 'off'. */
  kept: DockSuggestion[];
  /** Stage suggestions (minus the kept), with a keep (✦) badge. Hidden in 'off'. */
  suggested: DockSuggestion[];
  /** Auto-signaling preference. 'off' mutes badges + the "auto" label + suggestions. */
  signaling: 'subtle' | 'off';
  onRun: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * The dock's kept + auto-suggest zone. Kept items (📌) render first (they have
 * joined the pinned area), then — if any — a separator + "auto" label + the
 * stage suggestions (✦). Each item is an icon button (runs the action) plus a
 * corner badge sub-button (keeps/drops; stopPropagation so it never runs the
 * action). When signaling is 'off' the layer is muted: kept items render as
 * plain icon buttons (no badge) and no suggestions rise. Renders nothing when
 * there is nothing to show.
 */
export default function DockAutoZone({ kept, suggested, signaling, onRun, onPin, onUnpin }: DockAutoZoneProps) {
  const off = signaling === 'off';
  if (kept.length === 0 && (off || suggested.length === 0)) return null;

  const renderItem = (s: DockSuggestion, variant: 'kept' | 'suggested', withBadge: boolean) => {
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
        {withBadge && (
          <button
            type="button"
            className={`dock__badge ${variant === 'kept' ? 'dock__badge--pin' : 'dock__badge--auto'}`}
            onClick={(e) => { e.stopPropagation(); (variant === 'kept' ? onUnpin : onPin)(s.id); }}
            aria-label={`${variant === 'kept' ? 'Unpin' : 'Keep'} ${s.label}`}
          >
            <BadgeIcon size={9} />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {kept.map((s) => renderItem(s, 'kept', !off))}
      {!off && suggested.length > 0 && (
        <>
          <div className="dock__sep" />
          <div className="dock__auto-label">auto</div>
          {suggested.map((s) => renderItem(s, 'suggested', true))}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: PASS — the four new `off` cases plus all existing `subtle` cases (auto label, Keep/Unpin badges calling `onPin`/`onUnpin`, icon calling `onRun`).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/DockAutoZone.tsx src/components/shell/__tests__/DockAutoZone.test.tsx
git commit -m "feat(docks): DockAutoZone honors signaling=off (plain kept, no badges/auto/suggestions)"
```

---

## Task 3: LeftDock + RightDock — read and pass `signaling`

**Files:**
- Modify: `src/components/shell/LeftDock.tsx`, `src/components/shell/RightDock.tsx`
- Test: `src/components/shell/__tests__/Dock.test.tsx` (LeftDock), `src/components/shell/__tests__/RightDock.test.tsx`

> Note: after Task 2, `DockAutoZone` has a required `signaling` prop, so `LeftDock`/`RightDock` will fail typecheck until this task wires the prop. That is expected and is what Step 2 verifies.

- [ ] **Step 1: Write the failing container tests**

In `src/components/shell/__tests__/Dock.test.tsx`, add the import for `toggleDockSignaling` to the existing `dockReducer` import line (line 14):

```ts
import dockReducer, { toggleDockSignaling } from '../../../store/dockSlice';
```

Append this test inside `describe('LeftDock (container)', ...)` (before its closing `});`):

```ts
  it('signaling=off mutes the auto layer but keeps a kept tool', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep Grade' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grade' })).toBeNull();
  });

  it('off: a kept tool still renders (as a plain button, no Unpin badge)', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(pinAuto({ side: 'left', id: 'grade' }));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.getByRole('button', { name: 'Grade' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unpin Grade' })).toBeNull();
  });
```

Add `pinAuto` to the `dockReducer` import as well:

```ts
import dockReducer, { toggleDockSignaling, pinAuto } from '../../../store/dockSlice';
```

In `src/components/shell/__tests__/RightDock.test.tsx`, add to the `dockReducer` import (line 16):

```ts
import dockReducer, { toggleDockSignaling } from '../../../store/dockSlice';
```

Append this test inside `describe('RightDock (3D dock)', ...)` (before its closing `});`):

```ts
  it('signaling=off mutes the auto layer at the simulated stage', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation());
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'BOM' })).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx`
Expected: FAIL — `DockAutoZone` is rendered without the now-required `signaling` prop, so the auto layer still appears in `off` and the assertions fail (and/or a typecheck error on the missing prop).

- [ ] **Step 3: Wire `signaling` into LeftDock**

In `src/components/shell/LeftDock.tsx`, add the selector after the existing `pinnedExtra` selector (line 22):

```ts
  const signaling = useSelector((s: RootState) => s.dock.signaling);
```

Pass it to `DockAutoZone` — replace the `<DockAutoZone ... />` block (lines 42-48) so it includes the prop:

```tsx
          <DockAutoZone
            kept={kept}
            suggested={suggested}
            signaling={signaling}
            onRun={runSuggestion}
            onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
            onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
          />
```

- [ ] **Step 4: Wire `signaling` into RightDock**

In `src/components/shell/RightDock.tsx`, add the selector after the existing `pinnedExtra` selector (line 29):

```ts
  const signaling = useSelector((s: RootState) => s.dock.signaling);
```

Pass it to `DockAutoZone` — replace the `<DockAutoZone ... />` block (lines 100-106):

```tsx
            <DockAutoZone
              kept={kept}
              suggested={suggested}
              signaling={signaling}
              onRun={runSuggestion}
              onPin={(id) => dispatch(pinAuto({ side: 'right', id }))}
              onUnpin={(id) => dispatch(unpinAuto({ side: 'right', id }))}
            />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx`
Expected: PASS — new `off` cases green; existing convergence/reachability/suggestion tests still pass.

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean — both containers now supply the required `signaling` prop.

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/LeftDock.tsx src/components/shell/RightDock.tsx src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx
git commit -m "feat(docks): LeftDock/RightDock read dock.signaling and pass it to DockAutoZone"
```

---

## Task 4: LogoMenu — `Dock Suggestions` View toggle + live verify

**Files:**
- Modify: `src/components/shell/LogoMenu.tsx`
- Create (untracked): `scripts/verify-dock-signaling.mjs`

> LogoMenu has no RTL test (render-heavy nested menu); the new item is declarative `checked`+`action` wiring routed through the already-exercised `item.action(dispatch)` branch. The reducer (`toggleDockSignaling`, Task 1) and the affected component (`DockAutoZone`, Task 2) are unit-tested. This task is verified live with Playwright.

- [ ] **Step 1: Add the import**

In `src/components/shell/LogoMenu.tsx`, add a dock import after the `simulationSlice` import (after line 9):

```ts
import { toggleDockSignaling } from '../../store/dockSlice';
```

- [ ] **Step 2: Add the View menu item**

In `VIEW_MENU`, insert a separator and the toggle item immediately after the `Sewing Lines` item (after line 73) and before the existing separator that precedes the `Ruler:` group (line 74):

```ts
  { label: 'Sewing Lines', action: (d) => d(toggleSewingLines()), checked: (s) => s.editor.showSewingLines },
  { separator: true, label: '' },
  { label: 'Dock Suggestions', action: (d) => d(toggleDockSignaling()), checked: (s) => s.dock.signaling === 'subtle' },
  { separator: true, label: '' },
  { label: 'Ruler: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
```

(The `Dock Suggestions` item has an `action` and is not a `…`-suffixed panel label, so `handleItemClick` routes it through the existing `item.action(dispatch)` branch — no change to `handleItemClick`.)

- [ ] **Step 3: Typecheck + full unit suite + lint**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: typecheck clean; all tests pass (Tasks 1–3 suites included); lint 0 errors.

- [ ] **Step 4: Write the live verification script**

Create `scripts/verify-dock-signaling.mjs`:

```js
// Live check: LogoMenu ▸ View ▸ "Dock Suggestions" toggles dock.signaling and
// the left dock's auto layer; the preference persists to localStorage.
// Run the dev server on 5183 first:  npm run dev -- --port 5183
import { chromium } from 'playwright';

const URL = 'http://localhost:5183';

const page = await (await chromium.launch()).newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__OPENCLO_STORE__, { timeout: 15000 });

// Ensure 2D view + a piece so the 'drafted' stage surfaces the grade ✦.
await page.evaluate(() => {
  const s = window.__OPENCLO_STORE__;
  s.dispatch({ type: 'editor/setViewMode', payload: '2d' });
  s.dispatch({ type: 'project/addPiece', payload: { id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } });
});
await page.waitForTimeout(300);

const autoBefore = await page.locator('.dock__auto-label').count();
console.log('auto label before (expect >=1):', autoBefore);

// Open LogoMenu ▸ View ▸ Dock Suggestions (uncheck).
await page.locator('.logo-menu__trigger').click();
await page.locator('.logo-menu__item:has-text("View")').hover();
await page.locator('.logo-menu__submenu .logo-menu__item:has-text("Dock Suggestions")').click();
await page.waitForTimeout(300);

const autoAfter = await page.locator('.dock__auto-label').count();
const badgeAfter = await page.locator('.dock__badge').count();
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('openclo-docks') || 'null'));
console.log('auto label after off (expect 0):', autoAfter);
console.log('badges after off (expect 0):', badgeAfter);
console.log('LS signaling (expect "off"):', ls?.data?.signaling);

// Toggle back on.
await page.locator('.logo-menu__trigger').click();
await page.locator('.logo-menu__item:has-text("View")').hover();
await page.locator('.logo-menu__submenu .logo-menu__item:has-text("Dock Suggestions")').click();
await page.waitForTimeout(300);
const autoBack = await page.locator('.dock__auto-label').count();
console.log('auto label after on again (expect >=1):', autoBack);

const ok = autoBefore >= 1 && autoAfter === 0 && badgeAfter === 0 && ls?.data?.signaling === 'off' && autoBack >= 1;
console.log(ok ? 'PASS' : 'FAIL');
await page.context().browser().close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 5: Run the live verification**

Run (two terminals, or background the server):
```bash
npm run dev -- --port 5183
node scripts/verify-dock-signaling.mjs
```
Expected: `PASS` — auto label present, then 0 after toggling off (badges 0, LS `signaling: 'off'`), then ≥1 again after toggling back on.

- [ ] **Step 6: Commit (LogoMenu only — the script is untracked)**

```bash
git add src/components/shell/LogoMenu.tsx
git commit -m "feat(docks): LogoMenu ▸ View ▸ Dock Suggestions toggles signaling subtle/off"
```

---

## Self-Review

**1. Spec coverage:**
- §3 semantics (`off` keeps kept as plain buttons, no suggestions/label/badges; `null` when kept empty; fixed tools unaffected) → Task 2 (component) + Task 3 (containers).
- §4 state/persistence (`signaling` field + default; `toggleDockSignaling`; `rehydrateDocks` both fields; `z.enum().default()` no version bump; no NEW_PROJECT handler; no `store/index.ts` change) → Task 1.
- §5 components (dockSlice, DockAutoZone prop, Left/RightDock pass-through, LogoMenu item) → Tasks 1/2/3/4.
- §6 AC1 (slice) → Task 1; AC2/3 (off/subtle render) → Task 2; AC4 (containers) → Task 3; AC5 (LogoMenu toggle live) → Task 4; AC6 (persist + NEW_PROJECT) → Task 1 + Task 4 live LS check; AC7 (defaults/3b unchanged) → existing tests stay green in every task; AC8 (gates) → Task 4 Step 3.
- §7 testing (dockSlice unit incl. backward-compat + bad-value reject; DockAutoZone off/subtle; Left/RightDock off; LogoMenu via Playwright) → Tasks 1–4.
- §8 edge cases (kept in off; pre-3c envelope default; corrupt `'loud'` → null; toggle while empty; off then stage change) → Task 1 tests (default + reject) + Task 2/3 tests (off mutes regardless of stage).

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code; every command has expected output. Clean.

**3. Type/name consistency:** `signaling: 'subtle' | 'off'` and `toggleDockSignaling` used identically across Tasks 1→4. `DockState` shape (`pinnedExtra` + `signaling`) matches the `rehydrateDocks` payload and the `loadDocks` return. `DockAutoZone` prop name `signaling` matches the container pass-through. The existing round-trip test is updated in Task 1 because `loadDocks` now always returns `signaling` (would otherwise break `toEqual`). NEW_PROJECT action type confirmed as `global/newProject`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-dock-signaling-toggle.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review (spec compliance then code quality) between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batch with checkpoints.

Which approach?
