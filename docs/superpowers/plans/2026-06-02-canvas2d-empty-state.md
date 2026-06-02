# Canvas 2D Empty-State Interactive Shortcuts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2D canvas's lone "Select the Pen tool" SVG hint with an interactive onboarding empty-state (Import DXF primary + drag hint + Draw secondary + AI pointer) whose hierarchy matches María's real first move.

**Architecture:** A new HTML overlay component `EmptyState2D`, rendered as a sibling of the canvas `<svg>` inside `.pattern-editor`, gated by a pure predicate `shouldShowEmptyState(pieceCount, activeTool)`. It reuses all existing wiring — the DXF file picker (`AppShell`'s hidden `<input>`), the canvas-wide drop, and `setActiveTool('pen')` — adding exactly one prop to `PatternEditor` and one line to `AppShell`.

**Tech Stack:** React + TypeScript, Redux Toolkit (`editorSlice`), Vitest + @testing-library/react (jsdom), CSS with the paper-canvas design tokens.

**Spec:** `docs/superpowers/specs/2026-06-02-canvas2d-empty-state-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/components/PatternEditor/EmptyState2D.tsx` | The overlay component + the `shouldShowEmptyState` predicate | Create |
| `src/components/PatternEditor/EmptyState2D.css` | Tokenized styles for the overlay | Create |
| `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx` | Predicate + component tests | Create |
| `src/styles/tokens.css` | Add `--font-ui-2d` (Schibsted Grotesk had no token) | Modify |
| `src/components/PatternEditor/PatternEditor.tsx` | Accept `onImportDXF`, render the gated overlay | Modify |
| `src/components/PatternEditor/PatternEditor.css` | `position: relative` to anchor the overlay | Modify |
| `src/components/PatternEditor/renderers/HintText.tsx` | Remove the now-superseded no-pieces branch | Modify |
| `src/components/shell/AppShell.tsx` | Pass `onImportDXF` to `<PatternEditor>` | Modify |

Working copy is Spanish (decided in brainstorming; María-facing first surface). Task 3 finalizes all five strings through the `solace-wren` skill per the global CLAUDE.md microcopy mandate.

---

## Task 1: `EmptyState2D` component, predicate, styles, and tests

**Files:**
- Create: `src/components/PatternEditor/EmptyState2D.tsx`
- Create: `src/components/PatternEditor/EmptyState2D.css`
- Create: `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`
- Modify: `src/styles/tokens.css` (add `--font-ui-2d`)

- [ ] **Step 1: Add the `--font-ui-2d` token**

In `src/styles/tokens.css`, immediately after the `--font-mono-2d` line (currently line 34), add:

```css
  --font-ui-2d: 'Schibsted Grotesk', var(--font-sans);   /* UI support text on the paper canvas */
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 *
 * Guards the 2D-canvas onboarding empty-state. shouldShowEmptyState decides
 * when it mounts (idle Select tool, no pieces); the component renders the four
 * affordances and wires Import DXF + Draw-from-scratch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import EmptyState2D, { shouldShowEmptyState } from '../EmptyState2D';

afterEach(cleanup);

function renderWithStore(props: { onImportDXF?: () => void } = {}) {
  const store = configureStore({ reducer: { editor: editorReducer } });
  render(
    <Provider store={store}>
      <EmptyState2D {...props} />
    </Provider>,
  );
  return store;
}

describe('shouldShowEmptyState', () => {
  it('shows on the Select tool with no pieces', () => {
    expect(shouldShowEmptyState(0, 'select')).toBe(true);
  });
  it('hides once at least one piece exists', () => {
    expect(shouldShowEmptyState(1, 'select')).toBe(false);
  });
  it('hides when any drawing tool is active', () => {
    expect(shouldShowEmptyState(0, 'pen')).toBe(false);
    expect(shouldShowEmptyState(0, 'rectangle')).toBe(false);
  });
});

describe('EmptyState2D', () => {
  it('renders the heading and all four affordances', () => {
    renderWithStore({ onImportDXF: () => {} });
    expect(screen.getByText('Importa tu patrón')).toBeTruthy();
    expect(screen.getByRole('button', { name: /importar dxf/i })).toBeTruthy();
    expect(screen.getByText(/arrastra un \.dxf/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /dibujar desde cero/i })).toBeTruthy();
    expect(screen.getByText(/descríbelo a la/i)).toBeTruthy();
  });

  it('calls onImportDXF when the primary button is clicked', () => {
    const onImportDXF = vi.fn();
    renderWithStore({ onImportDXF });
    fireEvent.click(screen.getByRole('button', { name: /importar dxf/i }));
    expect(onImportDXF).toHaveBeenCalledTimes(1);
  });

  it('activates the Pen tool when Draw from scratch is clicked', () => {
    const store = renderWithStore({ onImportDXF: () => {} });
    expect(store.getState().editor.activeTool).toBe('select');
    fireEvent.click(screen.getByRole('button', { name: /dibujar desde cero/i }));
    expect(store.getState().editor.activeTool).toBe('pen');
  });

  it('disables the Import DXF button when no handler is provided', () => {
    renderWithStore();
    const btn = screen.getByRole('button', { name: /importar dxf/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`
Expected: FAIL — cannot resolve `../EmptyState2D` (module not created yet).

- [ ] **Step 4: Create the component + predicate**

Create `src/components/PatternEditor/EmptyState2D.tsx`:

```tsx
import { useDispatch } from 'react-redux';
import { setActiveTool } from '../../store/editorSlice';
import type { Tool2D } from '../../types/types';
import './EmptyState2D.css';

/**
 * Whether the 2D canvas should show the onboarding empty-state. Shown only on
 * the idle Select tool with no pieces — picking any drawing tool (pen / rect /
 * polyPen / …) clears the canvas for that tool instead of keeping the overlay.
 */
export function shouldShowEmptyState(pieceCount: number, activeTool: Tool2D): boolean {
  return pieceCount === 0 && activeTool === 'select';
}

interface EmptyState2DProps {
  /** Opens the DXF file picker. AppShell owns the hidden <input type="file">. */
  onImportDXF?: () => void;
}

export default function EmptyState2D({ onImportDXF }: EmptyState2DProps) {
  const dispatch = useDispatch();

  return (
    <div className="empty-state-2d" data-testid="empty-state-2d">
      <div className="empty-state-2d__inner">
        <h2 className="empty-state-2d__heading">Importa tu patrón</h2>

        <button
          type="button"
          className="empty-state-2d__primary"
          onClick={onImportDXF}
          disabled={!onImportDXF}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Importar DXF
        </button>

        <p className="empty-state-2d__drop-hint">o arrastra un .dxf al lienzo</p>

        <button
          type="button"
          className="empty-state-2d__secondary"
          onClick={() => dispatch(setActiveTool('pen'))}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Dibujar desde cero <span className="empty-state-2d__kbd">(P)</span>
        </button>

        <p className="empty-state-2d__ai-hint">
          …o descríbelo a la <span className="empty-state-2d__ai-word">IA</span> abajo
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the stylesheet**

Create `src/components/PatternEditor/EmptyState2D.css`:

```css
/* Onboarding empty-state overlay for the 2D canvas (DESIGN-NOTES P2.11).
   Container is click-through so canvas pan / DXF drop still reach the SVG and
   canvas-area; only the controls re-enable pointer events. */
.empty-state-2d {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.empty-state-2d__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 320px;
  text-align: center;
}

.empty-state-2d__heading {
  margin: 0;
  font-family: var(--font-ui-2d);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.01em;
  color: var(--ink-on-light);
}

.empty-state-2d__primary {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  font-family: var(--font-mono-2d);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-on-light);
  background: transparent;
  border: 1.4px solid var(--ink-on-light);
  border-radius: 7px;
  cursor: pointer;
}

/* Hover/focus: accent border + the +0.6px weight from DESIGN-NOTES, via an
   inset shadow so the box does not reflow. */
.empty-state-2d__primary:hover:not(:disabled),
.empty-state-2d__primary:focus-visible {
  border-color: var(--accent-2d);
  box-shadow: inset 0 0 0 0.6px var(--accent-2d);
  color: var(--accent-2d);
  outline: none;
}

.empty-state-2d__primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-state-2d__drop-hint {
  margin: 0;
  font-family: var(--font-mono-2d);
  font-size: 11px;
  color: var(--ink-on-light-3);
}

.empty-state-2d__secondary {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 4px 6px;
  font-family: var(--font-mono-2d);
  font-size: 12px;
  color: var(--ink-on-light-2);
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.empty-state-2d__secondary:hover,
.empty-state-2d__secondary:focus-visible {
  color: var(--ink-on-light);
  outline: none;
}

.empty-state-2d__kbd {
  color: var(--ink-on-light-3);
}

.empty-state-2d__ai-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  font-family: var(--font-mono-2d);
  font-size: 11px;
  color: var(--ink-on-light-3);
}

.empty-state-2d__ai-word {
  color: var(--ai-2d);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/components/PatternEditor/__tests__/EmptyState2D.test.tsx`
Expected: PASS — 7 tests (3 predicate + 4 component).

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean (no errors).

- [ ] **Step 8: Commit**

```bash
git add src/components/PatternEditor/EmptyState2D.tsx src/components/PatternEditor/EmptyState2D.css src/components/PatternEditor/__tests__/EmptyState2D.test.tsx src/styles/tokens.css
git commit -m "feat(canvas-2d): EmptyState2D onboarding overlay + shouldShowEmptyState predicate"
```

---

## Task 2: Wire the overlay into the editor

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Modify: `src/components/PatternEditor/PatternEditor.css`
- Modify: `src/components/PatternEditor/renderers/HintText.tsx`
- Modify: `src/components/shell/AppShell.tsx`

- [ ] **Step 1: Anchor the overlay**

In `src/components/PatternEditor/PatternEditor.css`, add `position: relative;` to the `.pattern-editor` rule (verified safe — `.ref-img-settings` is in normal flow, and `ContextMenu`/`CornerTypeMenu` use `position: fixed`):

```css
.pattern-editor {
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: crosshair;
  position: relative; /* anchor for the EmptyState2D overlay */
}
```

- [ ] **Step 2: Import the component and predicate in `PatternEditor.tsx`**

Add to the import block (near the other `./renderers` / local imports, e.g. after the `HintText` import on line 44):

```tsx
import EmptyState2D, { shouldShowEmptyState } from './EmptyState2D';
```

- [ ] **Step 3: Add the `onImportDXF` prop**

Change the component signature (currently `export default function PatternEditor() {` on line 80) to accept the prop:

```tsx
interface PatternEditorProps {
  /** Opens the DXF file picker; wired by AppShell to its hidden <input>. */
  onImportDXF?: () => void;
}

export default function PatternEditor({ onImportDXF }: PatternEditorProps) {
```

- [ ] **Step 4: Render the gated overlay**

In the returned JSX, inside `<div className="pattern-editor">`, immediately AFTER the closing `</svg>` tag (currently line 804) and BEFORE `<ContextMenu …>`, add:

```tsx
      {shouldShowEmptyState(pieces.length, activeTool) && (
        <EmptyState2D onImportDXF={onImportDXF} />
      )}
```

(`pieces` and `activeTool` are already in scope — `pieces` from `useSelector(selectPieces)`, `activeTool` destructured from `editor`.)

- [ ] **Step 5: Remove the superseded HintText branch**

In `src/components/PatternEditor/renderers/HintText.tsx`, delete this entire block (currently lines 32–40):

```tsx
      {!hasPieces && activeTool !== 'pen' && (
        <text
          x="50%" y="50%"
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="15" fontFamily="Inter, sans-serif"
        >
          Select the Pen tool (P) to draw pattern pieces
        </text>
      )}
```

Leave every other branch unchanged — in particular keep the pen-drawing hint (`!hasPieces && activeTool === 'pen' && penNodesLength === 0`), which still shows the moment the user clicks "Draw from scratch".

- [ ] **Step 6: Pass the prop from `AppShell`**

In `src/components/shell/AppShell.tsx`, change `<PatternEditor />` (currently line 232) to:

```tsx
          <PatternEditor onImportDXF={() => dxfInputRef.current?.click()} />
```

(`dxfInputRef` already exists and is used by `TopBar`'s `onImportDXF` on line 180.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean. (If `PatternEditor` is referenced elsewhere without props, the optional `onImportDXF?` keeps those callsites valid.)

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: all pass, including the new `EmptyState2D` tests. No test referenced the removed "Select the Pen tool" string (verified by grep), so nothing regresses.

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/PatternEditor.css src/components/PatternEditor/renderers/HintText.tsx src/components/shell/AppShell.tsx
git commit -m "feat(canvas-2d): wire EmptyState2D into the editor, retire the lone pen hint"
```

---

## Task 3: Finalize microcopy via solace-wren

Microcopy is a `solace-wren` trigger (global CLAUDE.md). The strings shipped in Task 1 are working copy; this task locks them.

**Files:**
- Modify: `src/components/PatternEditor/EmptyState2D.tsx` (final strings)
- Modify: `src/components/PatternEditor/__tests__/EmptyState2D.test.tsx` (match final strings)

- [ ] **Step 1: Run the copy through solace-wren**

Invoke the `solace-wren` skill on the five strings, with constraints: Spanish (Venezuelan register), no emoji, no exclamation marks, no title case for body, no hype words; the leading ellipsis on the AI hint is up for revision.

- Heading: `Importa tu patrón`
- Primary button: `Importar DXF`
- Drop hint: `o arrastra un .dxf al lienzo`
- Secondary: `Dibujar desde cero` + `(P)`
- AI pointer: `…o descríbelo a la IA abajo`

- [ ] **Step 2: Apply the finalized strings**

Update the literals in `EmptyState2D.tsx` and the matching `screen.getByText` / `getByRole({ name })` queries in the test to whatever solace-wren returns. Keep `aria-hidden="true"` on the icons so each button's accessible name is its text only.

- [ ] **Step 3: Run tests + typecheck + lint**

Run: `npm run test -- src/components/PatternEditor/__tests__/EmptyState2D.test.tsx && npx tsc -b --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PatternEditor/EmptyState2D.tsx src/components/PatternEditor/__tests__/EmptyState2D.test.tsx
git commit -m "feat(canvas-2d): finalize empty-state microcopy (solace-wren)"
```

---

## Task 4: Visual verification

Confirm the overlay renders correctly on the cream ground and that the wiring works end-to-end, matching how prior slices were verified (local capture scaffolding, kept untracked).

- [ ] **Step 1: Run the dev server and open the app**

Run: `npm run dev`, open the 2D (or Split) view with a fresh/empty project.

- [ ] **Step 2: Verify the five acceptance behaviors**

1. Empty-state shows on load (Select tool, no pieces): heading + Import DXF + drop hint + Draw + AI pointer, all legible on cream, no emoji.
2. Click **Importar DXF** → file picker opens → choosing María's `.dxf` loads pieces, the overlay vanishes, and auto-fit frames the pattern.
3. Click **Dibujar desde cero** → Pen tool active, overlay gone, pen-drawing hint appears.
4. Drag a `.dxf` onto the canvas → still imports (the AppShell drop overlay shows during the drag).
5. Switch to 3D-only view → no overlay; switch back to 2D with a loaded pattern → no overlay.

- [ ] **Step 3: Confirm token discipline**

Grep the new files for hardcoded colors — there should be none beyond token references:
Run: `git grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" -- src/components/PatternEditor/EmptyState2D.css`
Expected: no output (all colors are `var(--*)`).

- [ ] **Step 4: Final full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green.

(No commit — verification only. If a capture script is written for the record, leave it untracked like the other `scripts/capture-*.mjs`.)

---

## Self-Review

**Spec coverage** (against `2026-06-02-canvas2d-empty-state-design.md`):
- §3 AC1 (shows on Select + 0 pieces) → Task 1 predicate test + Task 2 Step 4 + Task 4 Step 2.1.
- §3 AC2 (Import DXF → picker → load → unmount → auto-fit) → Task 1 (onImportDXF call) + Task 2 Step 6 (AppShell wiring) + Task 4 Step 2.2.
- §3 AC3 (Draw → Pen → pen hint) → Task 1 (dispatch test) + Task 2 Step 5 (keep pen hint) + Task 4 Step 2.3.
- §3 AC4 (drag still imports) → no code change; Task 4 Step 2.4 verifies.
- §3 AC5 (never in 3D / loaded / non-Select) → predicate test + Task 4 Step 2.5.
- §3 AC6 (final copy, tokens, no emoji) → Task 3 + Task 4 Step 3.
- §3 AC7 (gates) → every task ends on gates.
- §4 architecture (HTML overlay, pointer-events, reused wiring) → Task 1 CSS + Task 2.
- §5 components (all four files) → Tasks 1–2.
- §6 visual tokens (`--font-ui-2d`, `--font-mono-2d`, `--accent-2d`, ink ladder, `--ai-2d`, inline SVG icons) → Task 1 Steps 1, 4, 5.
- §9 testing (predicate + component) → Task 1.
- §10 out of scope → not implemented (correct).

**Placeholder scan:** No TBD/TODO. The only deferred content is the copy pass, which is an explicit task (Task 3) with concrete working strings, not a placeholder.

**Type consistency:** `shouldShowEmptyState(pieceCount: number, activeTool: Tool2D)`, `EmptyState2DProps.onImportDXF?: () => void`, and `PatternEditorProps.onImportDXF?: () => void` are consistent across Tasks 1–2. `setActiveTool` imported from `../../store/editorSlice` (matches the existing `PatternEditor.tsx` import on line 5). Tool literals `'select'`, `'pen'`, `'rectangle'` are all valid `Tool2D` members (verified against `types.ts`).
