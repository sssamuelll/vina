# InputScheme Presets (Mouse/Trackpad) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Input-scheme presets (Mouse CLO3D / Trackpad) so the app is fully navigable on a MacBook trackpad — 3D scroll-orbit + pinch-zoom, 2D scroll-pan + pinch-zoom, passive auto-detection, picker in UnifiedBar settings.

**Architecture:** Redux slice `inputScheme` ({scheme, source}) persisted via `storageSet('settings','input-scheme',…)` with zod envelope; pure intent layer `src/input/wheelIntents.ts` translates wheel events → {zoom|pan|orbit} per scheme×surface; Viewport3D gets ONE non-passive wheel handler (OrbitControls `enableZoom={false}` permanently — never mutate `controls.mouseButtons`, see `patchMouseButtons` at Viewport3D.tsx:191); 2D wheel handler branches on scheme with rAF-coalesced dispatches.

**Tech Stack:** React 18, Redux Toolkit, three.js (drei OrbitControls), zod, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-04-input-scheme-design.md` — read it first. Constraint tables (Halberg/Serrano) are binding.

**Branch:** continue on `feat/trackpad-input-fase1` (fase 1 already committed there: `0e4c3033`).

**Conventions that gate commits:** typecheck is `npx tsc -b --noEmit` (NOT bare tsc); pre-commit runs eslint `--max-warnings=0` on staged files; never `--no-verify`. PowerShell mangles multiline `-m` here-strings — use the Bash tool for commits.

---

### Task 1: Pure intent layer (`wheelIntents.ts`)

**Files:**
- Create: `src/input/wheelIntents.ts`
- Test: `src/input/__tests__/wheelIntents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/input/__tests__/wheelIntents.test.ts
import { describe, it, expect } from 'vitest';
import { wheelIntent, zoomFactor, ZOOM_K } from '../wheelIntents';

const plain = { ctrlKey: false, metaKey: false };
const pinch = { ctrlKey: true, metaKey: false };

describe('wheelIntent — matrix scheme × surface × modifiers', () => {
  it('mouse + 3d + plain wheel = zoom', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 100, ...plain }, 'mouse', '3d'))
      .toEqual({ kind: 'zoom', delta: 10 }); // clamped ±10
  });

  it('trackpad + 3d + plain wheel = orbit (clamped deltas)', () => {
    expect(wheelIntent({ deltaX: 30, deltaY: -4, ...plain }, 'trackpad', '3d'))
      .toEqual({ kind: 'orbit', dx: 10, dy: -4 });
  });

  it('pinch (ctrlKey) = zoom on BOTH schemes and BOTH surfaces', () => {
    for (const scheme of ['mouse', 'trackpad'] as const) {
      for (const surface of ['2d', '3d'] as const) {
        expect(wheelIntent({ deltaX: 0, deltaY: -3, ...pinch }, scheme, surface))
          .toEqual({ kind: 'zoom', delta: -3 });
      }
    }
  });

  it('metaKey wheel also means zoom (⌘+wheel)', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 5, ctrlKey: false, metaKey: true }, 'trackpad', '2d'))
      .toEqual({ kind: 'zoom', delta: 5 });
  });

  it('mouse + 2d + plain wheel = zoom (today’s behavior untouched)', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: -100, ...plain }, 'mouse', '2d'))
      .toEqual({ kind: 'zoom', delta: -10 });
  });

  it('trackpad + 2d + plain wheel = pan with RAW pixel deltas (sanity-clamped ±200)', () => {
    expect(wheelIntent({ deltaX: 12.5, deltaY: -48, ...plain }, 'trackpad', '2d'))
      .toEqual({ kind: 'pan', dx: 12.5, dy: -48 });
    expect(wheelIntent({ deltaX: 9999, deltaY: 0, ...plain }, 'trackpad', '2d'))
      .toEqual({ kind: 'pan', dx: 200, dy: 0 });
  });

  it('returns null on zero or non-finite deltas (NaN guard per spec error handling)', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 0, ...plain }, 'mouse', '2d')).toBeNull();
    expect(wheelIntent({ deltaX: NaN, deltaY: Infinity, ...plain }, 'trackpad', '3d')).toBeNull();
  });
});

describe('zoomFactor — clamped exponential 2^(-Δ·k)', () => {
  it('one mouse notch (deltaY 100 → clamp 10) ≈ today’s 0.9 step', () => {
    expect(zoomFactor(100)).toBeCloseTo(Math.pow(2, -10 * ZOOM_K), 10);
    expect(zoomFactor(100)).toBeGreaterThan(0.89);
    expect(zoomFactor(100)).toBeLessThan(0.92);
  });

  it('is symmetric: zoomFactor(d) * zoomFactor(-d) === 1', () => {
    expect(zoomFactor(7) * zoomFactor(-7)).toBeCloseTo(1, 10);
  });

  it('non-finite delta → factor 1 (no-op)', () => {
    expect(zoomFactor(NaN)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/__tests__/wheelIntents.test.ts`
Expected: FAIL — cannot resolve `../wheelIntents` (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/input/wheelIntents.ts
/**
 * Pure intent layer for wheel events (spec 2026-06-04-input-scheme-design).
 * Translates a raw WheelEvent into what the active scheme wants done on a
 * given surface. ALL scheme×surface×modifier routing lives here — components
 * only execute the returned intent.
 */

export type InputSchemeId = 'mouse' | 'trackpad';
export type WheelSurface = '2d' | '3d';

export type WheelIntent =
  | { kind: 'zoom'; delta: number }          // clamped ±10
  | { kind: 'pan'; dx: number; dy: number }   // raw px, sanity-clamped ±200
  | { kind: 'orbit'; dx: number; dy: number } // clamped ±10
  | null;

/** Tuned so a mouse notch (|deltaY|≈100 → clamp 10) ≈ today's 0.9/1.1 step:
 *  2^(-10·0.015) ≈ 0.901. Trackpad pinch deltas (0.5–5) stay smooth. */
export const ZOOM_K = 0.015;

const GESTURE_CLAMP = 10;  // zoom/orbit deltas
const PAN_CLAMP = 200;     // pan keeps real pixel deltas, insane values cut

function clamp(d: number, limit: number): number {
  if (!Number.isFinite(d)) return 0;
  return Math.max(-limit, Math.min(limit, d));
}

/** Exponential zoom factor for a wheel delta. deltaY<0 (wheel up / pinch out) → >1 (zoom in). */
export function zoomFactor(delta: number): number {
  return Math.pow(2, -clamp(delta, GESTURE_CLAMP) * ZOOM_K);
}

export function wheelIntent(
  e: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean },
  scheme: InputSchemeId,
  surface: WheelSurface,
): WheelIntent {
  const rawX = Number.isFinite(e.deltaX) ? e.deltaX : 0;
  const rawY = Number.isFinite(e.deltaY) ? e.deltaY : 0;
  if (rawX === 0 && rawY === 0) return null;

  // ctrlKey on wheel = browser-synthesized pinch (Chrome/FF/Edge); ⌘+wheel = explicit zoom.
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', delta: clamp(rawY, GESTURE_CLAMP) };

  if (scheme === 'trackpad') {
    if (surface === '3d') return { kind: 'orbit', dx: clamp(rawX, GESTURE_CLAMP), dy: clamp(rawY, GESTURE_CLAMP) };
    return { kind: 'pan', dx: clamp(rawX, PAN_CLAMP), dy: clamp(rawY, PAN_CLAMP) };
  }
  return { kind: 'zoom', delta: clamp(rawY, GESTURE_CLAMP) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/__tests__/wheelIntents.test.ts`
Expected: PASS (both vitest projects, `default` and `seamly-heavy`, pick the file — both must pass).

- [ ] **Step 5: Commit**

```bash
git add src/input/wheelIntents.ts src/input/__tests__/wheelIntents.test.ts
git commit -m "feat(input): pure wheel-intent layer (scheme x surface matrix)"
```

---

### Task 2: `inputSchemeSlice` + persistence

**Files:**
- Create: `src/store/inputSchemeSlice.ts`
- Test: `src/store/__tests__/inputSchemeSlice.test.ts` (check existing slice tests location with `ls src/store/__tests__` — if slices are tested elsewhere, e.g. next to the file, follow that convention)

- [ ] **Step 1: Write the failing test**

```ts
// src/store/__tests__/inputSchemeSlice.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/storage', () => ({
  storageGet: vi.fn(),
  storageSet: vi.fn().mockResolvedValue(undefined),
}));

import reducer, {
  setUserScheme, autoDetectTrackpad, rehydrateInputScheme,
  hydrateInputScheme, persistInputScheme,
  type InputSchemeState,
} from '../inputSchemeSlice';
import { storageGet, storageSet } from '../../utils/storage';

const initial: InputSchemeState = { scheme: 'mouse', source: 'default' };

describe('inputSchemeSlice reducers', () => {
  it('starts as mouse/default', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual(initial);
  });

  it('setUserScheme always wins and marks source user', () => {
    const s = reducer({ scheme: 'trackpad', source: 'auto' }, setUserScheme('mouse'));
    expect(s).toEqual({ scheme: 'mouse', source: 'user' });
  });

  it('autoDetectTrackpad applies ONLY from source=default', () => {
    expect(reducer(initial, autoDetectTrackpad()))
      .toEqual({ scheme: 'trackpad', source: 'auto' });
    expect(reducer({ scheme: 'mouse', source: 'user' }, autoDetectTrackpad()))
      .toEqual({ scheme: 'mouse', source: 'user' }); // explicit choice never overridden
    expect(reducer({ scheme: 'trackpad', source: 'auto' }, autoDetectTrackpad()))
      .toEqual({ scheme: 'trackpad', source: 'auto' }); // idempotent
  });

  it('rehydrateInputScheme replaces state', () => {
    expect(reducer(initial, rehydrateInputScheme({ scheme: 'trackpad', source: 'user' })))
      .toEqual({ scheme: 'trackpad', source: 'user' });
  });
});

describe('hydrateInputScheme (zod envelope, silent-degradable per E-async-states)', () => {
  beforeEach(() => vi.mocked(storageGet).mockReset());

  it('returns parsed state for a valid v1 envelope', async () => {
    vi.mocked(storageGet).mockResolvedValue({ version: 1, scheme: 'trackpad', source: 'user' });
    expect(await hydrateInputScheme()).toEqual({ scheme: 'trackpad', source: 'user' });
  });

  it('returns null when nothing persisted', async () => {
    vi.mocked(storageGet).mockResolvedValue(undefined);
    expect(await hydrateInputScheme()).toBeNull();
  });

  it('returns null on corrupt payload (default Mouse, no crash)', async () => {
    vi.mocked(storageGet).mockResolvedValue({ version: 99, scheme: 'gamepad' });
    expect(await hydrateInputScheme()).toBeNull();
  });
});

describe('persistInputScheme', () => {
  it('writes the v1 envelope to settings/input-scheme', () => {
    persistInputScheme({ scheme: 'trackpad', source: 'auto' });
    expect(storageSet).toHaveBeenCalledWith('settings', 'input-scheme',
      { version: 1, scheme: 'trackpad', source: 'auto' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/inputSchemeSlice.test.ts`
Expected: FAIL — cannot resolve `../inputSchemeSlice`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/store/inputSchemeSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { storageGet, storageSet } from '../utils/storage';
import type { InputSchemeId } from '../input/wheelIntents';

/** Who chose the current scheme. 'user' is sticky: the heuristic never overrides it. */
export type SchemeSource = 'default' | 'auto' | 'user';

export interface InputSchemeState {
  scheme: InputSchemeId;
  source: SchemeSource;
}

const initialState: InputSchemeState = { scheme: 'mouse', source: 'default' };

const STORAGE_KEY = 'input-scheme';

const PersistedSchema = z
  .object({
    version: z.literal(1),
    scheme: z.enum(['mouse', 'trackpad']),
    source: z.enum(['default', 'auto', 'user']),
  })
  .strict();

/** Load persisted scheme. Corrupt/missing → null (caller keeps default Mouse —
 *  silent-degradable storage per E-async-states). */
export async function hydrateInputScheme(): Promise<InputSchemeState | null> {
  const raw = await storageGet('settings', STORAGE_KEY);
  if (raw === undefined) return null;
  const parsed = PersistedSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { scheme: parsed.data.scheme, source: parsed.data.source };
}

export function persistInputScheme(state: InputSchemeState): void {
  // shape: InputSchemePersisted v1 — opt-in envelope: yes
  void storageSet('settings', STORAGE_KEY, {
    version: 1,
    scheme: state.scheme,
    source: state.source,
  });
}

const inputSchemeSlice = createSlice({
  name: 'inputScheme',
  initialState,
  reducers: {
    setUserScheme(state, action: PayloadAction<InputSchemeId>) {
      state.scheme = action.payload;
      state.source = 'user';
    },
    autoDetectTrackpad(state) {
      if (state.source !== 'default') return; // explicit/previous choice always wins
      state.scheme = 'trackpad';
      state.source = 'auto';
    },
    rehydrateInputScheme(_state, action: PayloadAction<InputSchemeState>) {
      return action.payload;
    },
  },
});

export const { setUserScheme, autoDetectTrackpad, rehydrateInputScheme } = inputSchemeSlice.actions;
export default inputSchemeSlice.reducer;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/inputSchemeSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/inputSchemeSlice.ts src/store/__tests__/inputSchemeSlice.test.ts
git commit -m "feat(input): inputScheme slice with IDB persistence (zod v1 envelope)"
```

---

### Task 3: Register slice + hydration + focused persist subscribe

**Files:**
- Modify: `src/store/index.ts` (reducer map ~line 33-57; post-creation block ~line 80-102)

- [ ] **Step 1: Add reducer registration**

In the import block (after line 24 `import gradingReducer from './gradingSlice';`):

```ts
import inputSchemeReducer, { hydrateInputScheme, rehydrateInputScheme, persistInputScheme } from './inputSchemeSlice';
```

In the `reducer:` map (after `grading: gradingReducer,`):

```ts
    inputScheme: inputSchemeReducer,
```

- [ ] **Step 2: Add hydration + persist subscribe**

After the `savedDocks` block (line ~88-91), following the exact dock pattern (focused subscribe, identity check):

```ts
// Input scheme: async IDB hydrate (fire-and-forget; default Mouse until it lands)
// + focused persist subscribe — same isolation rationale as persistDocks above.
void hydrateInputScheme().then((saved) => {
  if (saved) store.dispatch(rehydrateInputScheme(saved));
});
let prevInputScheme = store.getState().inputScheme;
store.subscribe(() => {
  const inputScheme = store.getState().inputScheme;
  if (inputScheme !== prevInputScheme) {
    prevInputScheme = inputScheme;
    persistInputScheme(inputScheme);
  }
});
```

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npx tsc -b --noEmit && npm run test`
Expected: clean; no existing test asserts the reducer map shape, but watch for snapshot-style store tests — if one fails listing reducer keys, update it to include `inputScheme`.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(input): register inputScheme slice, IDB hydrate + focused persist"
```

---

### Task 4: 3D — orbit/dolly math + single wheel owner in Viewport3D

**Files:**
- Create: `src/input/orbitMath.ts`
- Test: `src/input/__tests__/orbitMath.test.ts`
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (imports ~line 24; effects near the pan handlers ~line 206-250; `<OrbitControls>` ~line 764-775; hint ~line 869)

- [ ] **Step 1: Write the failing math test**

```ts
// src/input/__tests__/orbitMath.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { orbitAroundTarget, dollyTowardTarget } from '../orbitMath';

const target = new THREE.Vector3(0, 0.75, 0);

describe('orbitAroundTarget', () => {
  it('preserves distance to target', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const before = pos.distanceTo(target);
    orbitAroundTarget(pos, target, 25, -12);
    expect(pos.distanceTo(target)).toBeCloseTo(before, 10);
  });

  it('dx rotates azimuth, dy rotates polar', () => {
    const pos = new THREE.Vector3(0, 0.75, 3.0); // level with target
    orbitAroundTarget(pos, target, 10, 0);
    expect(pos.x).not.toBeCloseTo(0, 5);          // moved sideways
    expect(pos.y).toBeCloseTo(0.75, 5);           // height unchanged by pure azimuth
  });

  it('clamps polar angle — camera never flips over the pole', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    for (let i = 0; i < 500; i++) orbitAroundTarget(pos, target, 0, 10);
    const offset = pos.clone().sub(target);
    const phi = new THREE.Spherical().setFromVector3(offset).phi;
    expect(phi).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(phi).toBeLessThanOrEqual(Math.PI - 0.05 + 1e-9);
  });
});

describe('dollyTowardTarget', () => {
  it('factor <1 moves closer, >1 moves away', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const before = pos.distanceTo(target);
    dollyTowardTarget(pos, target, 0.9, 0.6, 5);
    expect(pos.distanceTo(target)).toBeCloseTo(before * 0.9, 10);
  });

  it('clamps to [minDistance, maxDistance]', () => {
    const near = new THREE.Vector3(0, 0.75, 0.61);
    dollyTowardTarget(near, target, 0.01, 0.6, 5);
    expect(near.distanceTo(target)).toBeCloseTo(0.6, 10);
    const far = new THREE.Vector3(0, 0.75, 4.9);
    dollyTowardTarget(far, target, 100, 0.6, 5);
    expect(far.distanceTo(target)).toBeCloseTo(5, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/__tests__/orbitMath.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the math**

```ts
// src/input/orbitMath.ts
import * as THREE from 'three';

/** Radians per clamped wheel-delta unit (intent deltas are ±10 max → ≤0.05 rad/event). */
export const ORBIT_SPEED = 0.005;
const MIN_PHI = 0.05;
const MAX_PHI = Math.PI - 0.05;

const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

/** Rotate `position` around `target` (mutates `position`). Same camera-only
 *  philosophy as Viewport3D's custom pan: the orbit target stays on the avatar. */
export function orbitAroundTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  dx: number,
  dy: number,
): THREE.Vector3 {
  _offset.copy(position).sub(target);
  _spherical.setFromVector3(_offset);
  _spherical.theta -= dx * ORBIT_SPEED;
  _spherical.phi -= dy * ORBIT_SPEED;
  _spherical.phi = Math.max(MIN_PHI, Math.min(MAX_PHI, _spherical.phi));
  _spherical.makeSafe();
  _offset.setFromSpherical(_spherical);
  return position.copy(target).add(_offset);
}

/** Scale camera distance to target by `factor`, clamped (mutates `position`). */
export function dollyTowardTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  factor: number,
  minDistance: number,
  maxDistance: number,
): THREE.Vector3 {
  _offset.copy(position).sub(target);
  const dist = Math.max(minDistance, Math.min(maxDistance, _offset.length() * factor));
  _offset.setLength(dist);
  return position.copy(target).add(_offset);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/__tests__/orbitMath.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire Viewport3D — scheme selector + wheel owner + Safari gestures**

All edits in `src/components/Viewport3D/Viewport3D.tsx`.

(a) Imports (next to the fase-1 `inputBindings` import):

```ts
import { wheelIntent, zoomFactor, type InputSchemeId } from '../../input/wheelIntents';
import { orbitAroundTarget, dollyTowardTarget } from '../../input/orbitMath';
```

(b) Inside the component, near the existing `panState` ref (~line 208) — scheme read + ref mirror (listener must not re-bind on scheme change):

```ts
const inputScheme = useSelector((s: RootState) => s.inputScheme.scheme);
const inputSchemeRef = useRef<InputSchemeId>(inputScheme);
inputSchemeRef.current = inputScheme;
```

(c) After the `onPanPointerUp` callback (~line 247), the single 3D wheel owner. Note `containerRef` is declared at ~line 264 — place this effect AFTER that declaration:

```ts
// ─── Single 3D wheel owner (spec 2026-06-04 § Halberg constraint 1) ───
// OrbitControls enableZoom is OFF permanently; this handler routes wheel
// per scheme via the pure intent layer. Early-returns when controls are
// disabled (TransformControls / poseDrag own the pointer then).
const SAFARI_GESTURES = typeof window !== 'undefined' && 'ongesturestart' in window;
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const onWheel = (e: WheelEvent) => {
    const controls = orbitRef.current;
    if (!controls || !controls.enabled) return;
    // Safari XOR (Halberg constraint 5): pinch arrives as GestureEvent there —
    // never double-handle the ctrl-wheel mirror.
    if (SAFARI_GESTURES && (e.ctrlKey || e.metaKey)) return;
    const intent = wheelIntent(e, inputSchemeRef.current, '3d');
    if (!intent) return;
    e.preventDefault();
    const camera = controls.object;
    if (intent.kind === 'orbit') {
      orbitAroundTarget(camera.position, controls.target, intent.dx, intent.dy);
    } else if (intent.kind === 'zoom') {
      // zoomFactor>1 = zoom in = distance shrinks → invert for dolly
      dollyTowardTarget(camera.position, controls.target, 1 / zoomFactor(intent.delta), 0.6, 5);
    }
    controls.update();
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}, []);

// Safari trackpad pinch → GestureEvent zoom (the global main.tsx preventDefault
// does NOT stop propagation — we still receive these; verified fase 1).
useEffect(() => {
  if (!SAFARI_GESTURES) return;
  const el = containerRef.current;
  if (!el) return;
  let prevScale = 1;
  const onStart = (e: Event) => { prevScale = 1; e.preventDefault(); };
  const onChange = (e: Event) => {
    e.preventDefault();
    const scale = (e as Event & { scale?: number }).scale;
    const controls = orbitRef.current;
    if (!controls || !controls.enabled || typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return;
    // fingers apart (scale grows) → zoom in → distance shrinks
    dollyTowardTarget(controls.object.position, controls.target, prevScale / scale, 0.6, 5);
    prevScale = scale;
    controls.update();
  };
  el.addEventListener('gesturestart', onStart);
  el.addEventListener('gesturechange', onChange);
  return () => {
    el.removeEventListener('gesturestart', onStart);
    el.removeEventListener('gesturechange', onChange);
  };
}, []);
```

(`useSelector`, `RootState`, `useRef`, `useEffect` are already imported in this file. The `SAFARI_GESTURES` const goes at module scope, above the component, NOT inside it.)

(d) `<OrbitControls>` (~line 764): add `enableZoom={false}` next to `enablePan={false}`:

```tsx
        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.6}
          maxDistance={5}
          target={[0, 0.75, 0]}
          enablePan={false}
          enableZoom={false}
          mouseButtons={{ LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: -1 as unknown as THREE.MOUSE, RIGHT: THREE.MOUSE.ROTATE }}
          onChange={patchMouseButtons}
        />
```

(e) Scheme-aware hint (~line 869). Replace the fase-1 string suffix:

```tsx
          {poseEditorOpen ? '● POSE MODE' : activeTool3D === 'arrangement' ? '⊕ ARRANGE MODE' : '✏️ EDIT MODE'} — {inputScheme === 'trackpad' ? 'two-finger orbit · pinch zoom · ⌥-drag pan' : 'right-drag orbit · middle/⌥-drag pan'}
```

- [ ] **Step 6: Typecheck + targeted lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/Viewport3D/Viewport3D.tsx src/input/orbitMath.ts --max-warnings=0`
Expected: clean. (If `patchMouseButtons` typing complains about `enableZoom`, the prop exists on drei's OrbitControls — do NOT remove `onChange={patchMouseButtons}`.)

- [ ] **Step 7: Commit**

```bash
git add src/input/orbitMath.ts src/input/__tests__/orbitMath.test.ts src/components/Viewport3D/Viewport3D.tsx
git commit -m "feat(input): 3D scheme-routed wheel - scroll-orbit (trackpad), dolly zoom, Safari pinch"
```

---

### Task 5: 2D — scheme branch + rAF-coalesced dispatches

**Files:**
- Create: `src/input/zoom2d.ts`
- Test: `src/input/__tests__/zoom2d.test.ts`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts` (wheel effect, lines ~317-341)

- [ ] **Step 1: Write the failing test (cursor-anchored zoom math, extracted pure)**

```ts
// src/input/__tests__/zoom2d.test.ts
import { describe, it, expect } from 'vitest';
import { zoomAtPoint } from '../zoom2d';

describe('zoomAtPoint — cursor-anchored, range-clamped (preserves today’s 2D behavior)', () => {
  it('keeps the point under the cursor fixed', () => {
    // pattern point under cursor: (cx - pan.x) / zoom
    const before = { zoom: 1, pan: { x: 50, y: 20 } };
    const cx = 300, cy = 200;
    const px = (cx - before.pan.x) / before.zoom;
    const py = (cy - before.pan.y) / before.zoom;
    const after = zoomAtPoint(before, 1.5, cx, cy);
    expect(after.pan.x + px * after.zoom).toBeCloseTo(cx, 10);
    expect(after.pan.y + py * after.zoom).toBeCloseTo(cy, 10);
  });

  it('clamps zoom to [0.1, 10] — pan unchanged when already at the limit', () => {
    const atMax = zoomAtPoint({ zoom: 10, pan: { x: 0, y: 0 } }, 2, 100, 100);
    expect(atMax.zoom).toBe(10);
    expect(atMax.pan).toEqual({ x: 0, y: 0 });
    expect(zoomAtPoint({ zoom: 0.1, pan: { x: 5, y: 5 } }, 0.5, 0, 0).zoom).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/__tests__/zoom2d.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/input/zoom2d.ts
/** Cursor-anchored 2D zoom — the exact math previously inline in
 *  useEditorInteractions' wheel handler (range 0.1–10 preserved). */
export interface Zoom2DView {
  zoom: number;
  pan: { x: number; y: number };
}

export function zoomAtPoint(view: Zoom2DView, factor: number, cx: number, cy: number): Zoom2DView {
  const newZoom = Math.max(0.1, Math.min(10, view.zoom * factor));
  const scale = newZoom / view.zoom;
  if (scale === 1) return view;
  return {
    zoom: newZoom,
    pan: { x: cx - scale * (cx - view.pan.x), y: cy - scale * (cy - view.pan.y) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/__tests__/zoom2d.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire the 2D wheel handler**

In `src/components/PatternEditor/useEditorInteractions.ts`:

(a) Add imports at the top of the file (it already imports from `editorSlice` — `setPan2D`, `setZoom2D` are in scope):

```ts
import { wheelIntent, zoomFactor, type InputSchemeId } from '../../input/wheelIntents';
import { zoomAtPoint } from '../../input/zoom2d';
```

(b) Inside the hook, next to the existing `zoomRef`/`panRef2` ref-mirrors (~line 344): add the scheme read + mirror. The hook already calls `useSelector` for `zoom2D`/`pan2D` — match that pattern:

```ts
const inputScheme = useSelector((s: RootState) => s.inputScheme.scheme);
const inputSchemeRef = useRef<InputSchemeId>(inputScheme);
inputSchemeRef.current = inputScheme;
```

(If `RootState` is not yet imported in this file, add `import type { RootState } from '../../store';`.)

(c) Replace the whole wheel effect (lines ~320-341) with:

```ts
  // Register wheel handler with { passive: false } to allow preventDefault
  // React's onWheel uses passive listeners by default in Chrome, causing
  // "Unable to preventDefault inside passive event listener" warnings.
  //
  // rAF-coalesced (spec 2026-06-04 § Momentum): trackpad momentum emits
  // dozens of events/s with no terminator; accumulate per frame and dispatch
  // at most once per frame instead of per event (Halberg constraint 4).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let panAcc = { dx: 0, dy: 0 };
    let zoomAcc = { factor: 1, cx: 0, cy: 0 };
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (zoomAcc.factor !== 1) {
        const next = zoomAtPoint(
          { zoom: zoomRef.current, pan: panRef2.current },
          zoomAcc.factor, zoomAcc.cx, zoomAcc.cy,
        );
        dispatch(setPan2D(next.pan));
        dispatch(setZoom2D(next.zoom));
        zoomAcc = { factor: 1, cx: 0, cy: 0 };
      }
      if (panAcc.dx !== 0 || panAcc.dy !== 0) {
        const p = panRef2.current;
        // natural-scroll convention: content follows fingers (deltaY>0 → view down)
        dispatch(setPan2D({ x: p.x - panAcc.dx, y: p.y - panAcc.dy }));
        panAcc = { dx: 0, dy: 0 };
      }
    };

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const intent = wheelIntent(e, inputSchemeRef.current, '2d');
      if (!intent) return;
      if (intent.kind === 'pan') {
        panAcc.dx += intent.dx;
        panAcc.dy += intent.dy;
      } else if (intent.kind === 'zoom') {
        zoomAcc.factor *= zoomFactor(intent.delta);
        const rect = svg.getBoundingClientRect();
        zoomAcc.cx = e.clientX - rect.left;
        zoomAcc.cy = e.clientY - rect.top;
      }
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    svg.addEventListener('wheel', handler, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handler);
      if (rafId) cancelAnimationFrame(rafId);
      flush(); // commit any pending deltas on unmount (spec § error handling)
    };
  }, [dispatch]);
```

Note: `wheelIntent` never returns `orbit` for surface `'2d'`, so the two branches are exhaustive. The old fixed-step `0.9/1.1` is replaced by `zoomFactor` (≈0.901/1.110 per mouse notch — calibrated to match).

- [ ] **Step 6: Typecheck, targeted lint, full unit suite**

Run: `npx tsc -b --noEmit && npx eslint src/components/PatternEditor/useEditorInteractions.ts src/input/zoom2d.ts --max-warnings=0 && npm run test`
Expected: all clean. If any existing test asserts the old 0.9/1.1 step constants, update it to `zoomFactor(±100)` values and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src/input/zoom2d.ts src/input/__tests__/zoom2d.test.ts src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat(input): 2D scheme-routed wheel - trackpad scroll-pan + pinch-zoom, rAF-coalesced"
```

---

### Task 6: Passive heuristic hook + mount

**Files:**
- Create: `src/input/useSchemeHeuristic.ts`
- Test: `src/input/__tests__/useSchemeHeuristic.test.tsx`
- Modify: `src/components/shell/AppShell.tsx` (one hook call at the top of the component — grep `function AppShell` / `const AppShell` for the exact line)

- [ ] **Step 1: Write the failing test**

```tsx
// src/input/__tests__/useSchemeHeuristic.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import inputSchemeReducer, { setUserScheme } from '../../store/inputSchemeSlice';
import copilotUIReducer from '../../store/copilotUISlice';
import { useSchemeHeuristic } from '../useSchemeHeuristic';

function makeStore() {
  return configureStore({
    reducer: { inputScheme: inputSchemeReducer, copilotUI: copilotUIReducer },
  });
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
}

describe('useSchemeHeuristic', () => {
  it('switches to trackpad + shows toast on first ctrlKey wheel (synthesized pinch)', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().inputScheme).toEqual({ scheme: 'trackpad', source: 'auto' });
    expect(store.getState().copilotUI.toasts).toHaveLength(1);
    expect(store.getState().copilotUI.toasts[0].type).toBe('info');
  });

  it('ignores plain wheel and ⌘+wheel', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, metaKey: true, deltaY: 1 }));
    });
    expect(store.getState().inputScheme.source).toBe('default');
  });

  it('never fires once the user chose explicitly', () => {
    const store = makeStore();
    store.dispatch(setUserScheme('mouse'));
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().inputScheme).toEqual({ scheme: 'mouse', source: 'user' });
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
  });

  it('fires at most once (source flips to auto → listeners removed)', () => {
    const store = makeStore();
    renderHook(() => useSchemeHeuristic(), { wrapper: wrapperFor(store) });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -3 }));
    });
    expect(store.getState().copilotUI.toasts).toHaveLength(1);
  });
});
```

(If `copilotUI.toasts[0].type` fails because the toast object nests differently, inspect `CopilotToast` in `src/store/copilotUISlice.ts:~55-70` and fix the assertion — the state field IS `toasts` (line 133).)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/__tests__/useSchemeHeuristic.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/input/useSchemeHeuristic.ts
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { autoDetectTrackpad } from '../store/inputSchemeSlice';
import { showInfoToast } from '../store/copilotUISlice';

/**
 * One-shot passive trackpad detection (spec 2026-06-04 § Heurística).
 *
 * Signal: a wheel event with ctrlKey and no metaKey — Chrome/FF/Edge only
 * synthesize that for a trackpad pinch. Safari signals pinch via
 * `gesturestart` instead. Known accepted false positive: a mouse user
 * pressing Ctrl+wheel lands in Trackpad — recoverable via the toast, and
 * the reducer guard means an explicit choice (source==='user') is never
 * overridden. (tldraw lesson: auto-detect is a hint, never authority.)
 *
 * Once fired, `source` flips to 'auto' → this effect re-runs → early
 * return → listeners removed. Mounted once in AppShell.
 */
export function useSchemeHeuristic(): void {
  const dispatch = useDispatch<AppDispatch>();
  const source = useSelector((s: RootState) => s.inputScheme.source);

  useEffect(() => {
    if (source !== 'default') return;
    const fire = () => {
      dispatch(autoDetectTrackpad());
      dispatch(showInfoToast('Trackpad mode enabled — change it anytime in Settings ▸ Input'));
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey && !e.metaKey) fire();
    };
    const onGesture = () => fire();
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('gesturestart', onGesture);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturestart', onGesture);
    };
  }, [source, dispatch]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/__tests__/useSchemeHeuristic.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount in AppShell**

In `src/components/shell/AppShell.tsx`, add the import and call the hook as the first line inside the component body:

```ts
import { useSchemeHeuristic } from '../../input/useSchemeHeuristic';
```

```ts
  useSchemeHeuristic();
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc -b --noEmit && npx eslint src/input/useSchemeHeuristic.ts src/components/shell/AppShell.tsx --max-warnings=0`

```bash
git add src/input/useSchemeHeuristic.ts src/input/__tests__/useSchemeHeuristic.test.tsx src/components/shell/AppShell.tsx
git commit -m "feat(input): one-shot passive trackpad heuristic + toast (mounted in AppShell)"
```

---

### Task 7: UI — settings section + commands

**Files:**
- Create: `src/components/shell/InputSchemeSection.tsx`
- Modify: `src/components/shell/UnifiedBar.tsx` (settings mode block, ~line 322-325)
- Modify: `src/components/shell/UnifiedBarCommands.tsx` (COMMANDS array, View section ~line 53-55)

**NOTE:** the spec says "Command Palette", but `src/components/CommandPalette/CommandPalette.tsx` is ORPHANED (zero external references — same post-rework pattern as Toolbar3D, see memory). The live command surface is `UnifiedBarCommands`. Commands go there. Do NOT mount CommandPalette.

- [ ] **Step 1: Create the settings section**

```tsx
// src/components/shell/InputSchemeSection.tsx
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setUserScheme } from '../../store/inputSchemeSlice';
import type { InputSchemeId } from '../../input/wheelIntents';

const OPTIONS: Array<{ id: InputSchemeId; label: string; hint: string }> = [
  { id: 'mouse', label: 'Mouse (CLO3D)', hint: 'right-drag orbit · middle-drag pan · wheel zoom' },
  { id: 'trackpad', label: 'Trackpad', hint: 'two-finger orbit (3D) / pan (2D) · pinch zoom · ⌥-drag pan' },
];

/** Input scheme picker — UnifiedBar settings mode (spec 2026-06-04 § UI). */
export default function InputSchemeSection() {
  const dispatch = useDispatch<AppDispatch>();
  const scheme = useSelector((s: RootState) => s.inputScheme.scheme);

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>Input</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => dispatch(setUserScheme(opt.id))}
            aria-pressed={scheme === opt.id}
            title={opt.hint}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: scheme === opt.id ? '1px solid #4a9eff' : '1px solid rgba(255,255,255,0.15)',
              background: scheme === opt.id ? 'rgba(74,158,255,0.2)' : 'rgba(30,30,30,0.8)',
              color: scheme === opt.id ? '#4a9eff' : '#ccc',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>{opt.label}</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{opt.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

(Style values match the inline-style conventions already used in shell components — e.g. Viewport3D panel buttons use the same `#4a9eff` / `rgba(30,30,30,0.8)` palette. If `UnifiedBar.tsx`'s settings panel uses CSS classes instead, follow that file's pattern and move these to the corresponding stylesheet.)

- [ ] **Step 2: Mount it in UnifiedBar settings mode**

In `src/components/shell/UnifiedBar.tsx` (~line 322), wrap the existing AgentSettings:

```tsx
          {mode === 'settings' && (
            <>
              <InputSchemeSection />
              <AgentSettings
                onClose={() => setPanelOpen(false)}
                onSave={() => {
```

(keep the existing AgentSettings props exactly as they are; only add the fragment and the section above it), plus the import:

```ts
import InputSchemeSection from './InputSchemeSection';
```

- [ ] **Step 3: Add the two commands**

In `src/components/shell/UnifiedBarCommands.tsx`, in the View group (after `view-split`, line ~55):

```ts
  { id: 'input-trackpad', name: 'Use Trackpad Controls', description: 'Two-finger orbit/pan, pinch zoom, ⌥-drag pan', icon: Hand, action: (d) => d(setUserScheme('trackpad')) },
  { id: 'input-mouse', name: 'Use Mouse Controls', description: 'CLO3D-style: right-drag orbit, wheel zoom', icon: MousePointer2, action: (d) => d(setUserScheme('mouse')) },
```

with imports added to the existing blocks:

```ts
import { setUserScheme } from '../../store/inputSchemeSlice';
```

and add `Hand, MousePointer2` to the existing `lucide-react` import line (if those names collide or don't exist in the installed lucide version, pick from the icons ALREADY imported in this file — any reasonable pair works; do not add a new icon library).

- [ ] **Step 4: Typecheck + lint + commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/shell/InputSchemeSection.tsx src/components/shell/UnifiedBar.tsx src/components/shell/UnifiedBarCommands.tsx --max-warnings=0`

```bash
git add src/components/shell/InputSchemeSection.tsx src/components/shell/UnifiedBar.tsx src/components/shell/UnifiedBarCommands.tsx
git commit -m "feat(input): scheme picker in UnifiedBar settings + commands in UnifiedBarCommands"
```

---

### Task 8: E2E smoke + full gates

**Files:**
- Create: `tests/e2e/input-scheme.spec.ts`

- [ ] **Step 1: Write the E2E smoke (store-driven setup, dress-avatar pattern)**

Look at `tests/e2e/editor-tools.spec.ts:1-30` first for the shared beforeEach/navigation pattern (CI-aware timeouts: 120s test / 15s expect are already configured project-wide) and reuse its setup helper if one exists.

```ts
// tests/e2e/input-scheme.spec.ts
import { test, expect } from '@playwright/test';

// Window-level store access (exposed in src/store/index.ts:105)
declare global {
  interface Window {
    __OPENCLO_STORE__: {
      getState: () => { editor: { zoom2D: number; pan2D: { x: number; y: number } }; inputScheme: { scheme: string; source: string } };
      dispatch: (a: { type: string; payload?: unknown }) => void;
    };
  }
}

test.describe('input scheme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
  });

  test('trackpad preset: plain wheel pans the 2D canvas (no zoom change)', async ({ page }) => {
    await page.evaluate(() => {
      window.__OPENCLO_STORE__.dispatch({ type: 'inputScheme/setUserScheme', payload: 'trackpad' });
    });
    const before = await page.evaluate(() => {
      const s = window.__OPENCLO_STORE__.getState();
      return { zoom: s.editor.zoom2D, pan: s.editor.pan2D };
    });
    const svg = page.locator('svg.pattern-svg');
    await svg.hover();
    await page.mouse.wheel(0, 120);
    // rAF flush + redux commit
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__OPENCLO_STORE__.getState().editor.pan2D);
      return s.y;
    }).not.toBe(before.pan.y);
    const after = await page.evaluate(() => window.__OPENCLO_STORE__.getState().editor.zoom2D);
    expect(after).toBeCloseTo(before.zoom, 5); // pan, NOT zoom
  });

  test('mouse preset (default): plain wheel zooms the 2D canvas', async ({ page }) => {
    const before = await page.evaluate(() => window.__OPENCLO_STORE__.getState().editor.zoom2D);
    const svg = page.locator('svg.pattern-svg');
    await svg.hover();
    await page.mouse.wheel(0, -120);
    await expect.poll(async () =>
      page.evaluate(() => window.__OPENCLO_STORE__.getState().editor.zoom2D),
    ).toBeGreaterThan(before);
  });

  test('explicit user choice survives reload (IDB persistence)', async ({ page }) => {
    await page.evaluate(() => {
      window.__OPENCLO_STORE__.dispatch({ type: 'inputScheme/setUserScheme', payload: 'trackpad' });
    });
    // persist is a fire-and-forget IDB write — give it a beat
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => window.__OPENCLO_STORE__.getState().inputScheme),
    ).toEqual({ scheme: 'trackpad', source: 'user' });
  });
});
```

CAVEAT for the implementer: `editor.zoom2D` / `editor.pan2D` are the assumed state paths — verify the actual field names in `src/store/editorSlice.ts` (grep `zoom2D`) and adjust both the spec assertions and the `declare global` block. `page.mouse.wheel` dispatches plain wheel events (no ctrlKey) — that is exactly the gesture under test. Note the heuristic ignores plain wheel, so these tests don't trip it.

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test tests/e2e/input-scheme.spec.ts`
Expected: 3 passing. If the dev server fixture differs, mirror whatever `editor-tools.spec.ts` does for setup.

- [ ] **Step 3: Full gates**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: tsc clean; all unit tests pass; lint 0 errors (repo-wide warnings pre-exist; your touched files must be warning-free — re-run the targeted eslint commands from Tasks 4-7 if unsure).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/input-scheme.spec.ts
git commit -m "test(e2e): input-scheme smoke - trackpad wheel-pan, mouse wheel-zoom, IDB persistence"
```

---

### Task 9: Manual calibration pass (hardware) + wrap-up

No code written in this task unless calibration demands constant tweaks.

- [ ] **Step 1: Manual verification on a real trackpad (MacBook)**

`npm run dev`, then verify each row of the spec's gesture matrix:

| Check | Preset | Expect |
|---|---|---|
| Two-finger scroll on 3D | Trackpad | orbit around avatar, no flip past poles |
| Pinch on 3D | Trackpad + Mouse | smooth zoom, clamped 0.6–5 |
| ⌥+drag on 3D | both | pan (fase 1) |
| Two-finger scroll on 2D | Trackpad | pan follows fingers |
| Pinch on 2D | Trackpad + Mouse | cursor-anchored zoom |
| Plain wheel on 2D | Mouse | zoom (≈ today's feel) |
| First pinch ever (fresh profile / cleared IDB) | — | auto-switch + info toast |
| Settings ▸ Input picker | — | switch applies immediately, survives reload |
| Commands: "Use Trackpad/Mouse Controls" | — | same |

Tuning knobs if feel is off: `ZOOM_K` (src/input/wheelIntents.ts), `ORBIT_SPEED` (src/input/orbitMath.ts). Change constant + update the corresponding test expectation in the same commit.

- [ ] **Step 2: Update memory/docs**

Update the project memory note `project_openclo_input_device_strategy.md` (fase 2 → shipped, commit hash) and the spec's status line. If an audit eje was NOT closed here (it wasn't — this is feature work, not an audit), no CLAUDE.md table row is needed.

- [ ] **Step 3: Final commit if anything changed in step 1-2**

```bash
git add -A docs src
git commit -m "chore(input): calibration constants + docs sync after hardware pass"
```

---

## Self-review notes (already applied)

- **Spec coverage:** matrix (T1, T4, T5) ✓; slice+persistence+zod (T2, T3) ✓; Halberg 1/2 (T4: enableZoom=false, no mouseButtons writes) ✓; Halberg 4 (T5 rAF) ✓; Halberg 5 / Safari XOR (T4) ✓; heuristic+toast (T6) ✓; picker+commands (T7, with the CommandPalette-is-orphaned correction) ✓; E2E smoke (T8) ✓; manual calibration (T9) ✓; hint scheme-aware (T4e) ✓.
- **Known deviation from spec:** "Command Palette" → `UnifiedBarCommands` (CommandPalette component is unmounted/orphaned; verified by grep — only self-references).
- **Type consistency:** `InputSchemeId` defined once in `wheelIntents.ts`, imported everywhere else; `InputSchemeState` from the slice; intent union literal-checked in tests.
