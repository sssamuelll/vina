# Dock Tooltips (why-here, directional) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every side-dock item a rich, directional hover tooltip — line 1 `name · shortcut`, line 2 (badged items only) a color-coded "why-here" line — by resurrecting the orphaned `ToolTooltip` into a shared home and wiring it across the docks.

**Architecture:** Relocate `ToolTooltip.{tsx,css}` from `Toolbar3D/` (orphaned) to `shell/`, add one `descriptionTone` prop for the blue/violet line-2. Wrap each dock button (2D tools, 3D affordances, kept 📌 / auto ✦ items) in `ToolTooltip`, passing the canvas-facing `position` (left dock → right, right dock → left). Drop the native `title=` from wrapped buttons; keep every `aria-label` so accessible names — and the tests that query them — are unchanged.

**Tech Stack:** React + react-redux, portal-rendered tooltip (existing component), Vitest + @testing-library/react (no jest-dom matchers — use `.toBeTruthy()`/`.toBeNull()`/`.classList.contains`/`.textContent`; `vi.useFakeTimers()` for the 500 ms delay), Playwright for the live check.

**Spec:** `docs/superpowers/specs/2026-06-03-dock-tooltips-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/components/shell/ToolTooltip.tsx` | Shared rich tooltip | **Moved** from `Toolbar3D/`; add `descriptionTone?: 'pin'\|'auto'`. |
| `src/components/shell/ToolTooltip.css` | Tooltip styles | **Moved** from `Toolbar3D/`; add `--pin`/`--auto` desc color rules. |
| `src/components/shell/__tests__/ToolTooltip.test.tsx` | Tooltip unit test | **Create.** |
| `src/components/Toolbar3D/Toolbar3D.tsx` | Orphaned 3D toolbar | Repoint `ToolTooltip` import to `../shell/ToolTooltip` (compile-only). |
| `src/components/shell/DockAutoZone.tsx` | kept 📌 + auto ✦ zone | Add required `side` prop; wrap items in `ToolTooltip` (per-variant desc/tone); drop items' `title`. |
| `src/components/shell/__tests__/DockAutoZone.test.tsx` | auto-zone tests | Pass `side` in `setup`; add tooltip-on-hover cases. |
| `src/components/shell/Dock.tsx` | 2D dock (left) | Wrap tools in `ToolTooltip` (`position="right"`); drop `title`, keep `aria-label`. |
| `src/components/shell/Dock.css` | dock styles | Add `.dock .tool-tooltip-wrapper { display: flex; }`. |
| `src/components/shell/LeftDock.tsx` | 2D container | Pass `side="left"` to `DockAutoZone`. |
| `src/components/shell/RightDock.tsx` | 3D container | Wrap 4 affordances in `ToolTooltip` (`position="left"`); drop `title`; pass `side="right"`. |
| `scripts/verify-dock-tooltips.mjs` (untracked) | Live Playwright check | **Create** (not committed). |

---

## Task 1: Relocate ToolTooltip into `shell/` and add `descriptionTone`

**Files:**
- Move: `src/components/Toolbar3D/ToolTooltip.tsx` → `src/components/shell/ToolTooltip.tsx`
- Move: `src/components/Toolbar3D/ToolTooltip.css` → `src/components/shell/ToolTooltip.css`
- Modify: `src/components/Toolbar3D/Toolbar3D.tsx` (repoint import)
- Test: `src/components/shell/__tests__/ToolTooltip.test.tsx` (create)

- [ ] **Step 1: Move the component + its CSS with git**

```bash
git mv src/components/Toolbar3D/ToolTooltip.tsx src/components/shell/ToolTooltip.tsx
git mv src/components/Toolbar3D/ToolTooltip.css src/components/shell/ToolTooltip.css
```

(The `.tsx` imports `./ToolTooltip.css`, a relative sibling import — it stays valid after both move together. No content change needed for the CSS import.)

- [ ] **Step 2: Repoint the orphaned Toolbar3D import**

In `src/components/Toolbar3D/Toolbar3D.tsx`, the import is currently `import ToolTooltip from './ToolTooltip';`. Change it to:

```ts
import ToolTooltip from '../shell/ToolTooltip';
```

- [ ] **Step 3: Run typecheck to verify the move compiles**

Run: `npx tsc -b --noEmit`
Expected: clean. (Confirms the move + the Toolbar3D import repoint are correct.)

- [ ] **Step 4: Write the failing ToolTooltip test**

Create `src/components/shell/__tests__/ToolTooltip.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import ToolTooltip from '../ToolTooltip';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderTip(props: Partial<Parameters<typeof ToolTooltip>[0]> = {}) {
  vi.useFakeTimers();
  return render(
    <ToolTooltip name="Select" {...props}>
      <button type="button">child</button>
    </ToolTooltip>,
  );
}

function hover(container: HTMLElement) {
  fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
  act(() => { vi.advanceTimersByTime(500); });
}

describe('ToolTooltip', () => {
  it('renders children and no tooltip before hover', () => {
    const { container } = renderTip();
    expect(container.textContent).toContain('child');
    expect(document.querySelector('.tool-tooltip')).toBeNull();
  });

  it('shows the tooltip with the name after the 500ms delay', () => {
    const { container } = renderTip({ name: 'Select' });
    hover(container);
    const tip = document.querySelector('.tool-tooltip');
    expect(tip).toBeTruthy();
    expect(tip!.querySelector('.tool-tooltip-name')!.textContent).toBe('Select');
  });

  it('renders the shortcut as a kbd when given', () => {
    const { container } = renderTip({ name: 'Select', shortcut: 'Z' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-shortcut')!.textContent).toBe('Z');
  });

  it('omits the kbd when no shortcut', () => {
    const { container } = renderTip({ name: 'Arrange' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-shortcut')).toBeNull();
  });

  it('applies the pin tone class to the description', () => {
    const { container } = renderTip({ name: 'Grade', description: 'you pinned this', descriptionTone: 'pin' });
    hover(container);
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('you pinned this');
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(true);
  });

  it('applies the auto tone class to the description', () => {
    const { container } = renderTip({ name: 'Grade', description: 'suggested for this stage · click ✦ to keep', descriptionTone: 'auto' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-desc')!.classList.contains('tool-tooltip-desc--auto')).toBe(true);
  });

  it('renders a plain description (no tone class) when descriptionTone is omitted', () => {
    const { container } = renderTip({ name: 'X', description: 'plain' });
    hover(container);
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(false);
    expect(desc.classList.contains('tool-tooltip-desc--auto')).toBe(false);
  });

  it('uses the position class (right vs left)', () => {
    const { container } = renderTip({ name: 'X', position: 'right' });
    hover(container);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-right')).toBe(true);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/ToolTooltip.test.tsx`
Expected: FAIL — the `descriptionTone` cases fail (the prop doesn't exist yet, so no `--pin`/`--auto` class). The name/shortcut/position cases should already pass (existing behavior).

- [ ] **Step 6: Add the `descriptionTone` prop**

In `src/components/shell/ToolTooltip.tsx`, add `descriptionTone` to the props interface (after `description`):

```ts
export interface ToolTooltipProps {
  name: string;
  shortcut?: string;
  description?: string;
  /** Tints the description line to match a dock badge: 'pin' → blue, 'auto' → violet. */
  descriptionTone?: 'pin' | 'auto';
  hasSubTools?: boolean;
  /** Which side the tooltip appears on. Default: 'left' */
  position?: 'left' | 'right';
  children: ReactNode;
}
```

Add `descriptionTone` to the destructured params:

```ts
export default function ToolTooltip({ name, shortcut, description, descriptionTone, hasSubTools, position = 'left', children }: ToolTooltipProps) {
```

Replace the description render block:

```tsx
          {description && (
            <div className={`tool-tooltip-desc${descriptionTone ? ` tool-tooltip-desc--${descriptionTone}` : ''}`}>{description}</div>
          )}
```

- [ ] **Step 7: Add the tone color rules to the CSS**

In `src/components/shell/ToolTooltip.css`, after the `.tool-tooltip-desc { ... }` rule, add:

```css
.tool-tooltip-desc--pin { color: var(--accent); }
.tool-tooltip-desc--auto { color: var(--dock-auto); }
```

(`--accent` is the blue the `.dock__badge--pin` 📌 uses; `--dock-auto` is the violet the `.dock__badge--auto` ✦ uses — see `Dock.css:101-102`. Both already read legibly on the dark dock chrome and on the tooltip's dark `#1a1a1a` surface.)

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test -- src/components/shell/__tests__/ToolTooltip.test.tsx`
Expected: PASS — all cases green.

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: tsc clean; lint 0 errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/shell/ToolTooltip.tsx src/components/shell/ToolTooltip.css src/components/Toolbar3D/Toolbar3D.tsx src/components/shell/__tests__/ToolTooltip.test.tsx
git commit -m "refactor(shell): relocate ToolTooltip into shell/ + add descriptionTone (pin/auto)"
```

Do NOT use `--no-verify`.

---

## Task 2: DockAutoZone — `side` prop + wrap items in ToolTooltip

**Files:**
- Modify: `src/components/shell/DockAutoZone.tsx`
- Test: `src/components/shell/__tests__/DockAutoZone.test.tsx`

> After this task, `LeftDock`/`RightDock` fail typecheck (they don't pass the new required `side` prop). That is expected and is resolved in Task 3.

- [ ] **Step 1: Add the failing tooltip tests + thread `side` through `setup`**

In `src/components/shell/__tests__/DockAutoZone.test.tsx`, update the imports to add `act` and the timer-driven hover, and make `setup` pass a default `side`.

Add `act` to the testing-library import (it currently imports `render, screen, fireEvent, cleanup`):

```ts
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { vi } from 'vitest';
```

(If `vi` is already imported, don't duplicate it.)

Update the `setup` helper to pass `side="left"` by default and return `container`:

```ts
function setup(props: Partial<Parameters<typeof DockAutoZone>[0]> = {}) {
  const onRun = vi.fn(), onPin = vi.fn(), onUnpin = vi.fn();
  const { container } = render(
    <DockAutoZone kept={[]} suggested={[]} signaling="subtle" side="left" onRun={onRun} onPin={onPin} onUnpin={onUnpin} {...props} />,
  );
  return { onRun, onPin, onUnpin, container };
}
```

Append these tests inside the `describe('DockAutoZone', ...)` block (before its closing `});`):

```ts
  it('kept item tooltip shows the pinned why-here line in the pin tone', () => {
    vi.useFakeTimers();
    const { container } = setup({ kept: [BOM], side: 'left' });
    fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
    act(() => { vi.advanceTimersByTime(500); });
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('you pinned this');
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(true);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-right')).toBe(true);
    vi.useRealTimers();
  });

  it('auto item tooltip shows the stage why-here line in the auto tone, left-positioned on the right dock', () => {
    vi.useFakeTimers();
    const { container } = setup({ suggested: [GRADE], side: 'right' });
    fireEvent.mouseEnter(container.querySelector('.tool-tooltip-wrapper')!);
    act(() => { vi.advanceTimersByTime(500); });
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('suggested for this stage · click ✦ to keep');
    expect(desc.classList.contains('tool-tooltip-desc--auto')).toBe(true);
    expect(document.querySelector('.tool-tooltip')!.classList.contains('tooltip-left')).toBe(true);
    vi.useRealTimers();
  });
```

(`GRADE` and `BOM` fixtures already exist at the top of the file. The existing tests still call `setup(...)` without `side` — they now inherit the `side="left"` default.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: FAIL — `side` is not yet a prop and items aren't wrapped, so no `.tool-tooltip-wrapper` / `.tool-tooltip-desc` exists.

- [ ] **Step 3: Rewrite DockAutoZone to wrap items in ToolTooltip**

Replace `src/components/shell/DockAutoZone.tsx` in full:

```tsx
import { Pin, Sparkles } from 'lucide-react';
import type { DockSuggestion } from './dockSuggestions';
import ToolTooltip from './ToolTooltip';

interface DockAutoZoneProps {
  /** Kept items — shown always. With a 📌 unpin badge in 'subtle'; plain in 'off'. */
  kept: DockSuggestion[];
  /** Stage suggestions (minus the kept), with a keep (✦) badge. Hidden in 'off'. */
  suggested: DockSuggestion[];
  /** Auto-signaling preference. 'off' mutes badges + the "auto" label + suggestions. */
  signaling: 'subtle' | 'off';
  /** Which dock this zone lives in — drives the tooltip's canvas-facing side. */
  side: 'left' | 'right';
  onRun: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * The dock's kept + auto-suggest zone. Kept items (📌) render first, then — if any
 * and signaling is on — a separator + "auto" label + the stage suggestions (✦).
 * Each item is an icon button (runs the action) plus a corner badge sub-button
 * (keeps/drops; stopPropagation), wrapped in a ToolTooltip whose line-2 explains
 * why the item is here (pinned vs stage-suggested). The tooltip faces the canvas
 * (left dock → right, right dock → left). Renders nothing when there is nothing
 * to show; in 'off' kept items render plain (no badge) but still tooltip.
 */
export default function DockAutoZone({ kept, suggested, signaling, side, onRun, onPin, onUnpin }: DockAutoZoneProps) {
  const off = signaling === 'off';
  if (kept.length === 0 && (off || suggested.length === 0)) return null;

  const tipPosition = side === 'left' ? 'right' : 'left';

  const renderItem = (s: DockSuggestion, variant: 'kept' | 'suggested', withBadge: boolean) => {
    const Icon = s.icon;
    const BadgeIcon = variant === 'kept' ? Pin : Sparkles;
    const description = variant === 'kept'
      ? 'you pinned this'
      : 'suggested for this stage · click ✦ to keep';
    const tone: 'pin' | 'auto' = variant === 'kept' ? 'pin' : 'auto';
    return (
      <ToolTooltip key={s.id} name={s.label} description={description} descriptionTone={tone} position={tipPosition}>
        <div className="dock__tool-wrap">
          <button
            type="button"
            className={`dock__tool ${variant === 'suggested' ? 'dock__tool--auto' : ''}`}
            onClick={() => onRun(s.id)}
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
      </ToolTooltip>
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

(Changes vs slice 3c: import `ToolTooltip`; add `side` prop; compute `tipPosition`; wrap each item in `ToolTooltip` with per-variant `description`/`descriptionTone`/`position`; **drop the `title={s.label}`** from the icon button — the tooltip replaces it — while keeping `aria-label={s.label}`. The badge sub-button is unchanged and is not separately tooltipped.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/components/shell/__tests__/DockAutoZone.test.tsx`
Expected: PASS — the two new tooltip cases plus all existing `signaling`/badge/`onRun` cases (the icon button keeps `aria-label`, so `getByRole({ name })` still resolves; badge clicks still call `onPin`/`onUnpin`).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/DockAutoZone.tsx src/components/shell/__tests__/DockAutoZone.test.tsx
git commit -m "feat(docks): DockAutoZone wraps items in ToolTooltip (why-here, side-aware)"
```

(Typecheck is intentionally red on LeftDock/RightDock here — resolved in Task 3. The pre-commit hook runs `tsc -b --noEmit` and WILL fail this commit. If it blocks, that is the known transient red: report DONE_WITH_CONCERNS and leave the two files staged/uncommitted — do NOT use `--no-verify`, and do NOT pull Task 3 work into this commit. If the hook is somehow absent, the commit lands and Task 3 restores green immediately after.)

---

## Task 3: Wire ToolTooltip into Dock (2D), LeftDock, RightDock + CSS

**Files:**
- Modify: `src/components/shell/Dock.tsx`, `src/components/shell/Dock.css`, `src/components/shell/LeftDock.tsx`, `src/components/shell/RightDock.tsx`
- Test: `src/components/shell/__tests__/Dock.test.tsx`, `src/components/shell/__tests__/RightDock.test.tsx`

- [ ] **Step 1: Add a regression test for the 2D dock accessible name + tooltip**

In `src/components/shell/__tests__/Dock.test.tsx`, append this inside `describe('Dock (presentational)', ...)` (before its closing `});`). It guards that wrapping in ToolTooltip does NOT change the accessible name (which the existing `/select · z/i` queries depend on) and that a tooltip appears on hover:

```ts
  it('keeps the accessible name and shows a right-positioned tooltip on hover', () => {
    vi.useFakeTimers();
    const { container } = render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    // accessible name unchanged (derives from aria-label, not the removed title)
    expect(screen.getByRole('button', { name: /select · z/i })).toBeTruthy();
    fireEvent.mouseEnter(container.querySelectorAll('.tool-tooltip-wrapper')[0]);
    act(() => { vi.advanceTimersByTime(500); });
    const tip = document.querySelector('.tool-tooltip');
    expect(tip).toBeTruthy();
    expect(tip!.classList.contains('tooltip-right')).toBe(true);
    expect(tip!.querySelector('.tool-tooltip-name')!.textContent).toBe('Select');
    vi.useRealTimers();
  });
```

Ensure the file imports `act` (add it to the `@testing-library/react` import if missing) and `vi` (from `vitest`, already imported in this file).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx`
Expected: FAIL — no `.tool-tooltip-wrapper` yet (tools are bare buttons), so the hover finds nothing and the tooltip assertions fail.

- [ ] **Step 3: Wrap the 2D dock tools in ToolTooltip**

In `src/components/shell/Dock.tsx`, add the import after the `DockShell` import:

```ts
import ToolTooltip from './ToolTooltip';
```

Replace the `tools.map(...)` block so each tool button is wrapped (drop `title`, keep `aria-label`, move `key` to the wrapper):

```tsx
      {tools.map(tool => {
        const Icon = tool.icon;
        const active = tool.id === activeToolId;
        return (
          <ToolTooltip key={tool.id} name={tool.label} shortcut={tool.shortcut} position="right">
            <button
              type="button"
              className={`dock__tool ${active ? 'dock__tool--active' : ''}`}
              onClick={() => onSelectTool(tool.id)}
              aria-label={`${tool.label} · ${tool.shortcut}`}
              aria-pressed={active}
            >
              <Icon size={16} />
            </button>
          </ToolTooltip>
        );
      })}
```

- [ ] **Step 4: Add the dock flex-wrapper CSS rule**

In `src/components/shell/Dock.css`, after the `.dock__tool-wrap { ... }` rule, add:

```css
/* ToolTooltip wraps each item in a div; keep it transparent to the dock's
   flex column so gap/centering are unchanged. */
.dock .tool-tooltip-wrapper { display: flex; }
```

- [ ] **Step 5: Pass `side` from LeftDock**

In `src/components/shell/LeftDock.tsx`, add `side="left"` to the `<DockAutoZone ... />` element (it currently passes `kept`, `suggested`, `signaling`, `onRun`, `onPin`, `onUnpin`):

```tsx
          <DockAutoZone
            kept={kept}
            suggested={suggested}
            signaling={signaling}
            side="left"
            onRun={runSuggestion}
            onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
            onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
          />
```

- [ ] **Step 6: Wrap RightDock affordances + pass `side`**

In `src/components/shell/RightDock.tsx`, add the import after the `DockAutoZone` import:

```ts
import ToolTooltip from './ToolTooltip';
```

Wrap each of the 4 affordance buttons in a `ToolTooltip` with `position="left"`, dropping the native `title=` and keeping `aria-label`/`aria-pressed`. Replace the four buttons:

```tsx
        <ToolTooltip name="Arrange" position="left">
          <button
            type="button"
            className="dock__tool"
            onClick={() => dispatch(setViewMode3D('arrange'))}
            aria-label="Arrange"
          >
            <Shirt size={16} />
          </button>
        </ToolTooltip>
        <ToolTooltip name="Sew" position="left">
          <button
            type="button"
            className={`dock__tool ${sewActive ? 'dock__tool--active' : ''}`}
            onClick={toggleSew}
            aria-label="Sew"
            aria-pressed={sewActive}
          >
            <Spline size={16} />
          </button>
        </ToolTooltip>
        <ToolTooltip name="Simulate" shortcut="space" position="left">
          <button
            type="button"
            className={`dock__tool ${simActive ? 'dock__tool--active' : ''}`}
            onClick={() => { if (simActive) dispatch(pauseSimulation()); else dispatch(startSimulation()); }}
            aria-label="Simulate"
            aria-pressed={simActive}
          >
            <SimIcon size={16} />
          </button>
        </ToolTooltip>
        <ToolTooltip name="Avatar" position="left">
          <button
            type="button"
            className="dock__tool"
            onClick={() => onOpenPanel('Avatar')}
            aria-label="Avatar"
          >
            <PersonStanding size={16} />
          </button>
        </ToolTooltip>
```

(`shortcut="space"` lowercase so `formatShortcut` renders the `␣` glyph. The dynamic Sew/Simulate `title` strings are dropped; `aria-pressed` + the `dock__tool--active` class still convey state.)

Add `side="right"` to the `<DockAutoZone ... />` element inside the IIFE:

```tsx
            <DockAutoZone
              kept={kept}
              suggested={suggested}
              signaling={signaling}
              side="right"
              onRun={runSuggestion}
              onPin={(id) => dispatch(pinAuto({ side: 'right', id }))}
              onUnpin={(id) => dispatch(unpinAuto({ side: 'right', id }))}
            />
```

- [ ] **Step 7: Run the affected tests**

Run: `npm run test -- src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx`
Expected: PASS — the new 2D dock tooltip test passes; the existing LeftDock convergence/suggestion tests and RightDock Sew/Simulate/Arrange/Avatar reachability tests still pass (all query by `aria-label`/accessible name, which is unchanged).

- [ ] **Step 8: Full gate (typecheck now clean again)**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: tsc clean (the Task 2 transient red on LeftDock/RightDock is resolved); all tests pass; lint 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/shell/Dock.tsx src/components/shell/Dock.css src/components/shell/LeftDock.tsx src/components/shell/RightDock.tsx src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx
git commit -m "feat(docks): rich directional tooltips on 2D tools + 3D affordances"
```

Do NOT use `--no-verify`.

---

## Task 4: Live verification script

**Files:**
- Create (untracked): `scripts/verify-dock-tooltips.mjs`

> Author the script; the controller runs it (dev server auto-handled like the other `verify-*.mjs`). Do NOT `git add` it (consistent with the project's other untracked `scripts/verify-*.mjs`).

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-dock-tooltips.mjs`:

```js
// Live check: dock tooltips are directional + show the why-here line.
// Run the dev server on 5183 first:  npm run dev -- --port 5183
import { chromium } from 'playwright';

const URL = 'http://localhost:5183';
const page = await (await chromium.launch()).newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__OPENCLO_STORE__, { timeout: 15000 });

// Split view (default) shows both docks; add a piece so the Grade ✦ is suggested.
await page.evaluate(() => {
  const s = window.__OPENCLO_STORE__;
  s.dispatch({ type: 'editor/setViewMode', payload: 'split' });
  s.dispatch({ type: 'project/addPiece', payload: { id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } });
});
await page.waitForTimeout(300);

// Hover the first 2D tool (left dock) → tooltip to the RIGHT.
await page.locator('.dock--left .dock__tool').first().hover();
await page.waitForTimeout(700); // 500ms delay + headroom
const right = await page.locator('.tool-tooltip.tooltip-right').count();
const kbd = await page.locator('.tool-tooltip .tool-tooltip-shortcut').count();
console.log('2D tool tooltip tooltip-right (expect >=1):', right);
console.log('  has a kbd shortcut (expect >=1):', kbd);

// Move away, then hover the Grade ✦ (left auto-zone) → why-here auto line.
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
await page.locator('.dock--left .dock__tool--auto').first().hover();
await page.waitForTimeout(700);
const autoDesc = await page.locator('.tool-tooltip-desc.tool-tooltip-desc--auto').first().textContent().catch(() => null);
console.log('auto ✦ why-here text (expect "suggested for this stage…"):', autoDesc);

// Hover a 3D affordance (right dock) → tooltip to the LEFT.
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
await page.locator('.dock--right .dock__tool').first().hover();
await page.waitForTimeout(700);
const left = await page.locator('.tool-tooltip.tooltip-left').count();
console.log('3D affordance tooltip tooltip-left (expect >=1):', left);

const ok = right >= 1 && kbd >= 1 && !!autoDesc && autoDesc.includes('suggested for this stage') && left >= 1;
console.log(ok ? 'PASS' : 'FAIL');
await page.context().browser().close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: (Controller runs)** Start `npm run dev -- --port 5183`, then `node scripts/verify-dock-tooltips.mjs`. Expected: `PASS` — right-positioned 2D tooltip with a kbd, the auto why-here line "suggested for this stage…", and a left-positioned 3D tooltip. Also eyeball that both docks still read as tidy vertical columns (the `.tool-tooltip-wrapper` flex rule did not disturb layout).

---

## Self-Review

**1. Spec coverage:**
- §3 relocate + `descriptionTone` → Task 1. AC1 (lives in shell/, Toolbar3D repoint, tsc clean) → Task 1 Steps 1-3; AC2 (tone classes) → Task 1 Steps 6-8.
- §4.1 2D dock wrap (`position="right"`, no description) → Task 3 Step 3. AC3 → Task 3 Step 1 test + live.
- §4.2 3D affordances (`position="left"`, Simulate `space`) → Task 3 Step 6. AC4 → live + RightDock tests intact.
- §4.3 DockAutoZone (`side` prop, per-variant desc/tone/position) → Task 2. AC5 → Task 2 Step 1 tests + live.
- §4 a11y (keep `aria-label`, drop `title`) → Tasks 2/3 (every wrap keeps `aria-label`); AC6 → Task 3 Step 1 regression test + existing suites.
- §5 file list → File Structure table + Tasks 1-3. §6 AC7 (delay + portal + off-still-tooltips) → Task 1 test (delay/portal) + the off behavior is preserved (kept items still render + wrap; only the badge is gated on `withBadge`). AC8 (gates) → Task 3 Step 8.
- §7 testing (ToolTooltip / DockAutoZone / Dock / RightDock / live) → Tasks 1-4. §8 edge cases (off+kept tooltips, no-shortcut, click-vs-tooltip, wrapper layout) → covered by Task 2 (off path unchanged), Task 1 (no-shortcut test), Task 3 (flex rule + accessible-name test) + live eyeball.

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output. Clean.

**3. Type/name consistency:** `descriptionTone?: 'pin' | 'auto'` defined in Task 1 and used identically in Task 2 (`tone: 'pin' | 'auto'`). `side: 'left' | 'right'` required prop added in Task 2, supplied by LeftDock (`"left"`) and RightDock (`"right"`) in Task 3 — matches. `position` values: left dock → `"right"`, right dock → `"left"` consistent across Dock.tsx (hardcoded `"right"`), RightDock (hardcoded `"left"`), DockAutoZone (`tipPosition = side === 'left' ? 'right' : 'left'`). `shortcut="space"` (lowercase) matches `formatShortcut`'s `'space' → '␣'` replacement. Class names `tool-tooltip-desc--pin`/`--auto`, `tooltip-right`/`tooltip-left`, `.tool-tooltip-wrapper` match the component + CSS.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-dock-tooltips.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review (spec then quality) between tasks.
2. **Inline Execution** — execute in this session via executing-plans, batch with checkpoints.

Which approach?
