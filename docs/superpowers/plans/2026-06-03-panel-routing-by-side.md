# Contextual Panel Routing by Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the contextual panel on the side matching its domain — Grading (2D) on the left, all other panels on the right — without changing the `onOpenPanel(name)` contract.

**Architecture:** A pure `getPanelSide(name)` map (Grading→left, else→right). `AppShell` derives the side from the open panel's name and passes it to `ContextPanel`, which applies a `context-panel--left`/`--right` class. CSS adds one left-offset override; the right placement is unchanged. No call-site threading.

**Tech Stack:** React, Vitest + @testing-library/react (no jest-dom — `.classList.contains`/`getByText`/`getByRole`/`fireEvent`), CSS, Playwright (live check).

**Spec:** `docs/superpowers/specs/2026-06-03-panel-routing-by-side-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/components/shell/panelSide.ts` | Panel → domain side map | **Create.** `getPanelSide(name)`. |
| `src/components/shell/__tests__/panelSide.test.ts` | Map unit test | **Create.** |
| `src/components/shell/ContextPanel.tsx` | The panel container | Add `side?: 'left'\|'right'` prop → root class. |
| `src/components/shell/__tests__/ContextPanel.test.tsx` | Panel RTL test | **Create.** |
| `src/components/shell/AppShell.tsx` | Shell wiring | Pass `side={getPanelSide(contextPanel)}`. |
| `src/styles/floating.css` | Panel positioning | Add `.context-panel--left` override. |
| `scripts/verify-panel-routing.mjs` (untracked) | Live check | **Create** (not committed). |

---

## Task 1: `getPanelSide` map

**Files:**
- Create: `src/components/shell/panelSide.ts`
- Test: `src/components/shell/__tests__/panelSide.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/__tests__/panelSide.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getPanelSide } from '../panelSide';

describe('getPanelSide', () => {
  it('routes Grading to the left (2D domain)', () => {
    expect(getPanelSide('Grading')).toBe('left');
  });

  it('routes 3D-domain panels to the right', () => {
    expect(getPanelSide('Avatar')).toBe('right');
    expect(getPanelSide('BOM')).toBe('right');
  });

  it('defaults unknown / other panels to the right', () => {
    expect(getPanelSide('Inspector')).toBe('right');
    expect(getPanelSide('Nesting')).toBe('right');
    expect(getPanelSide('Zzz')).toBe('right');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/panelSide.test.ts`
Expected: FAIL — `panelSide` module / `getPanelSide` does not exist.

- [ ] **Step 3: Create the map**

Create `src/components/shell/panelSide.ts`:

```ts
/**
 * Which side a contextual panel opens on, by its domain. The side is intrinsic
 * to the panel (not the opener), so a panel lands in the same place whether it
 * was triggered from a dock, the LogoMenu, or ⌘K. 2D-domain panels open left
 * (near the 2D dock); everything else opens right (today's default).
 *
 * Reclassifying a panel is a one-line edit: add its name to LEFT_PANELS.
 */
const LEFT_PANELS = new Set<string>(['Grading']);

export function getPanelSide(name: string): 'left' | 'right' {
  return LEFT_PANELS.has(name) ? 'left' : 'right';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- src/components/shell/__tests__/panelSide.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --noEmit`
Expected: clean.

```bash
git add src/components/shell/panelSide.ts src/components/shell/__tests__/panelSide.test.ts
git commit -m "feat(panels): getPanelSide map (Grading→left, else→right)"
```

(No consumer yet — green. Do NOT use `--no-verify`.)

---

## Task 2: ContextPanel side prop + AppShell wiring + CSS

**Files:**
- Modify: `src/components/shell/ContextPanel.tsx`, `src/components/shell/AppShell.tsx`, `src/styles/floating.css`
- Test: `src/components/shell/__tests__/ContextPanel.test.tsx` (create)

- [ ] **Step 1: Write the failing ContextPanel test**

Create `src/components/shell/__tests__/ContextPanel.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContextPanel from '../ContextPanel';

afterEach(cleanup);

describe('ContextPanel side routing', () => {
  it('defaults to the right side', () => {
    const { container } = render(<ContextPanel title="Avatar" onClose={() => {}}>body</ContextPanel>);
    const root = container.querySelector('.context-panel')!;
    expect(root.classList.contains('context-panel--right')).toBe(true);
    expect(root.classList.contains('context-panel--left')).toBe(false);
  });

  it('renders on the left when side="left"', () => {
    const { container } = render(<ContextPanel title="Grading" side="left" onClose={() => {}}>body</ContextPanel>);
    const root = container.querySelector('.context-panel')!;
    expect(root.classList.contains('context-panel--left')).toBe(true);
    expect(root.classList.contains('context-panel--right')).toBe(false);
  });

  it('renders the title and still closes on the button and Escape', () => {
    const onClose = vi.fn();
    render(<ContextPanel title="Avatar" side="right" onClose={onClose}>body</ContextPanel>);
    expect(screen.getByText('Avatar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/ContextPanel.test.tsx`
Expected: FAIL — the root has no `context-panel--right`/`--left` class yet (and `side` isn't a prop).

- [ ] **Step 3: Add the `side` prop to ContextPanel**

In `src/components/shell/ContextPanel.tsx`, extend the `Props` interface and destructure with a default, and apply the modifier class on the root. Change the interface:

```ts
interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Which side the panel anchors on. Default 'right' (today's placement). */
  side?: 'left' | 'right';
}
```

Change the function signature:

```ts
export default function ContextPanel({ title, onClose, children, side = 'right' }: Props) {
```

Change the root element's className (it is currently `<div className="context-panel" ref={panelRef}>`):

```tsx
    <div className={`context-panel context-panel--${side}`} ref={panelRef}>
```

(Leave the Escape + click-outside effects and the header/body unchanged.)

- [ ] **Step 4: Run the ContextPanel test to verify it passes**

Run: `npm run test -- src/components/shell/__tests__/ContextPanel.test.tsx`
Expected: PASS — default `--right`, explicit `--left`, title + close behavior intact.

- [ ] **Step 5: Wire the side in AppShell**

In `src/components/shell/AppShell.tsx`, add the import near the other `./` imports (it already imports `ContextPanel from './ContextPanel'` at line 18):

```ts
import { getPanelSide } from './panelSide';
```

Update the `<ContextPanel ...>` render (currently lines 246-249):

```tsx
        {contextPanel && (
          <ContextPanel title={contextPanel} side={getPanelSide(contextPanel)} onClose={() => setContextPanel(null)}>
            {renderPanelContent(contextPanel, () => setContextPanel(null))}
          </ContextPanel>
        )}
```

(The `contextPanel: string | null` state and every `onOpenPanel` call site stay exactly as they are.)

- [ ] **Step 6: Add the left-offset CSS**

In `src/styles/floating.css`, after the `.context-panel { ... }` rule (which keeps its `top`/`width`/`right: var(--sp-3)`/etc. unchanged), add:

```css
/* Left-routed panels (2D-domain, e.g. Grading) anchor past the left 2D dock. */
.context-panel--left {
  left: calc(14px + 52px + 12px); /* dock at left:14px, ~52px wide, + 12px gap */
  right: auto;
}
```

(`.context-panel--right` needs no rule — the base `.context-panel` already anchors right; the class is inert but present for symmetry.)

- [ ] **Step 7: Full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: tsc clean; all tests pass; lint 0 errors (pre-existing warnings ok — no NEW ones).

- [ ] **Step 8: Commit**

```bash
git add src/components/shell/ContextPanel.tsx src/components/shell/AppShell.tsx src/styles/floating.css src/components/shell/__tests__/ContextPanel.test.tsx
git commit -m "feat(panels): route contextual panel by intrinsic side (Grading left)"
```

Do NOT use `--no-verify`.

---

## Task 3: Live verification script

**Files:**
- Create (untracked): `scripts/verify-panel-routing.mjs`

> Author the script; the controller runs it. Do NOT `git add` it.

- [ ] **Step 1: Write the script**

Create `scripts/verify-panel-routing.mjs`:

```js
// Live check: Grading opens on the left (past the 2D dock), Avatar on the right.
// Run the dev server on 5183 first:  npm run dev -- --port 5183
import { chromium } from 'playwright';

const URL = 'http://localhost:5183';
const page = await (await chromium.launch()).newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__OPENCLO_STORE__, { timeout: 15000 });

// Split view + a piece so the left dock surfaces the Grade ✦ (stage 'drafted').
await page.evaluate(() => {
  const s = window.__OPENCLO_STORE__;
  s.dispatch({ type: 'editor/setViewMode', payload: 'split' });
  s.dispatch({ type: 'project/addPiece', payload: { id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } });
});
await page.waitForTimeout(300);

// Open Grading from the left dock's Grade ✦.
await page.locator('.dock--left .dock__tool--auto').first().click();
await page.waitForTimeout(250);
const leftPanel = await page.locator('.context-panel.context-panel--left').count();
const dockBox = await page.locator('.dock--left').boundingBox();
const panelBox = await page.locator('.context-panel').boundingBox();
const panelPastDock = panelBox && dockBox ? panelBox.x >= dockBox.x + dockBox.width : false;
console.log('Grading panel has --left (expect 1):', leftPanel);
console.log('Grading panel x past left dock right edge (expect true):', panelPastDock, panelBox?.x, dockBox && dockBox.x + dockBox.width);

// Close, then open Avatar from the right dock.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.locator('.dock--right [aria-label="Avatar"]').click();
await page.waitForTimeout(250);
const rightPanel = await page.locator('.context-panel.context-panel--right').count();
const rightBox = await page.locator('.context-panel').boundingBox();
const viewportW = page.viewportSize().width;
const rightAnchored = rightBox ? (rightBox.x + rightBox.width) > viewportW / 2 : false;
console.log('Avatar panel has --right (expect 1):', rightPanel);
console.log('Avatar panel right-anchored (expect true):', rightAnchored);

const ok = leftPanel === 1 && panelPastDock && rightPanel === 1 && rightAnchored;
console.log(ok ? 'PASS' : 'FAIL');
await page.context().browser().close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: (Controller runs)** Start `npm run dev -- --port 5183`, then `node scripts/verify-panel-routing.mjs`. Expected `PASS`: the Grading panel carries `.context-panel--left` and its box starts past the left dock's right edge; the Avatar panel carries `.context-panel--right` and is right-anchored. Eyeball that the left panel doesn't overlap the 2D dock.

---

## Self-Review

**1. Spec coverage:**
- §3 semantics (intrinsic side, Grading→left, left offset past dock, right unchanged, ContextPanel behavior intact) → Task 1 (map) + Task 2 (prop + CSS + wiring).
- §4 components (panelSide.ts, ContextPanel prop, AppShell derive, floating.css `--left`) → Tasks 1 + 2.
- §5 AC1 (getPanelSide values) → Task 1 test; AC2 (ContextPanel class per side + default) → Task 2 Step 1 test; AC3 (Grading left / others right regardless of opener) → Task 2 wiring + Task 3 live; AC4 (Escape/click-outside/onOpenPanel signature unchanged) → Task 2 keeps the effects + does not touch `onOpenPanel`; the ContextPanel test guards close behavior; AC5 (right placement identical) → base `.context-panel` untouched (Task 2 Step 6); AC6 (gates) → Task 2 Step 7.
- §6 testing → Tasks 1-3. §7 edge cases (unknown→right, 3D-only harmless offset, no bottom-left collision, toggle, picker coexistence) → Task 1 default + the CSS top/left placement (distinct from the bottom-left pill) + no `onOpenPanel` change.

**2. Placeholder scan:** No TBD/TODO; every code step complete; commands have expected output.

**3. Type/name consistency:** `getPanelSide(name): 'left' | 'right'` defined in Task 1, imported + called in Task 2 (AppShell) and asserted in Task 1's test. `ContextPanel` `side?: 'left' | 'right'` (default `'right'`) matches the AppShell call `side={getPanelSide(contextPanel)}` (which returns exactly that union). The class names `context-panel--left`/`--right` match between ContextPanel (Task 2 Step 3), the CSS (Task 2 Step 6), the ContextPanel test, and the verify script. `contextPanel: string | null` and `onOpenPanel` are untouched. Every commit green: Task 1 (no consumer) → Task 2 (prop default 'right' = no visual change until AppShell passes the derived side, all in one commit).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-panel-routing-by-side.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute in this session via executing-plans.

Which approach?
