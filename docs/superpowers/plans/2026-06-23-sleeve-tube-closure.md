# Sleeve Tube Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close each one-piece sleeve into a tube around the arm so it stays on the A-pose arm instead of collapsing off it, by generating the missing underarm self-seam and wrapping the sleeve fuller so that seam closes a small gap.

**Architecture:** Two coupled changes. (1) An additive **self-close pass** in `autoSew` emits a same-piece underarm seam (`underarmSeam`↔`underarmSeam-2`) for pieces that carry the existing `matchHint='self-close'` edges — the solver already supports same-piece seams; only the cross-piece-only proposer blocked it. (2) A **per-region wrap coverage** so sleeves wrap to `min(330°, panelWidth/R)` (near-closed) while everything else keeps the 150° default — threaded as per-piece `wrapParams` through `resolveArrangementWithFrames`. `worldRefine` gets a one-line same-piece pass-through guard. Spec: `docs/superpowers/specs/2026-06-23-sleeve-tube-closure-design.md`.

**Tech Stack:** TypeScript, React, Three.js (cloth XPBD), Vitest (unit), Playwright (`@gpu-local` replay). Branch `feat/envelope-wrap`.

## Global Constraints

- **Render == solver:** the two wrap loops in `GarmentSimulation.tsx` (`staticGeometry` ≈ line 276, `placedMeshes` ≈ line 336) MUST call `wrapPlacedMesh` with identical arguments. Whatever per-piece `wrapParams` one uses, the other uses the same. (Envelope-wrap invariant; #924 finding #5.)
- **Same-piece seam support is downstream-free:** `store/projectSlice.ts` (addSeam), `seamAssembly.ts` (buildSeamConstraints), and the GPU/WASM seam packing need **no change** — they already handle `pieceA.pieceId === pieceB.pieceId`. Do not add same-piece guards anywhere.
- **State-encoded IDs:** auto-seam IDs follow the `auto-seam-…` pattern marked `// state-encoded ID` — do NOT use `newId()` for them (per CLAUDE.md).
- **The two flip oracles stay as-is:** `computeFlipFlags` (rigid) and `computeWrapFlipFlags` (wrap) are unchanged.
- **Typecheck command:** `npx tsc -b --noEmit` (build mode), never bare `tsc`.
- **Gates before every commit:** `npx tsc -b --noEmit && npm run test && npm run lint`. No `--no-verify`.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **YAGNI scope:** only the one-piece sleeve underarm (the only role emitting `self-close`). Do NOT generalize `self-close` to darts/folds, do NOT touch the A-pose pose or `buildAxisHints`, do NOT build arm-collision-normal fixes.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/utils/autoSew/worldRefine.ts` | World-space seam refinement | Same-piece pass-through guard (1 line) — Task 1 |
| `src/utils/cloth/arrangement/wrapParams.ts` | Wrap configuration | Add `MAX_SLEEVE_WRAP` + `wrapParamsForRegion()` — Task 2 |
| `src/utils/cloth/arrangement/arrangementBinding.ts` | Per-piece placement+frame | Add `wrapParams` to `PlacementWithFrame`, compute it — Task 2 |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Render+solver wrap loops | Use per-piece `wrapParams` (both loops) — Task 2 |
| `src/utils/autoSew/worldRefine.ts` (`edgeWorld`) | Seam-scoring wrap | Use `pwf.wrapParams` — Task 2 |
| `src/utils/__tests__/mariaShirt.m4.test.ts` | Production-path sonda | Use per-piece `wrapParams`; assert underarm seam — Tasks 2 & 3 |
| `src/utils/autoSew/index.ts` | Seam proposer | Additive self-close pass — Task 3 |
| `tests/e2e/webgpu-maria-replay.spec.ts` | `@gpu-local` replay | t=10s sleeve-persistence metric — Task 4 |

New test files:
- `src/utils/autoSew/__tests__/worldRefine.selfseam.test.ts` (Task 1)
- `src/utils/cloth/arrangement/__tests__/wrapParams.test.ts` (Task 2)
- `src/utils/autoSew/__tests__/selfClose.test.ts` (Task 3)

---

## Task 1: `worldRefine` same-piece pass-through guard

`refineSeamsInWorld` groups seams by role key and permutes partners within a group to minimize world distance. A sleeve self-seam's two halves share the role key `sleeve:underarmseam`, so **both sleeves' self-seams would land in one group and be cross-paired** (left sleeve's `underarmSeam-2` re-assigned to the right sleeve). The guard makes any same-piece seam resolve to `null`, which the existing code already treats as "pass through untouched" — so the self-close pass's `reversed` is preserved and no cross-pairing happens. The cross-piece path is 100% unchanged.

**Files:**
- Modify: `src/utils/autoSew/worldRefine.ts` (inside the `resolved` map callback, ~line 138)
- Test: `src/utils/autoSew/__tests__/worldRefine.selfseam.test.ts` (create)

**Interfaces:**
- Consumes: `refineSeamsInWorld(seams: Seam[], pieces: PatternPiece[], placements: PlacementWithFrame[]): Seam[]` (existing signature, unchanged).
- Produces: nothing new — behavior change only (same-piece seams pass through verbatim).

- [ ] **Step 1: Write the failing test**

Create `src/utils/autoSew/__tests__/worldRefine.selfseam.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { refineSeamsInWorld } from '../worldRefine';
import type { PatternPiece, Seam } from '../../../types/types';
import type { PlacementWithFrame } from '../../cloth/arrangement/arrangementBinding';

// A same-piece (self) seam must pass through refineSeamsInWorld untouched —
// it must NOT be cross-paired with another piece's same-role self-seam, and
// its `reversed` flag (set by the self-close pass) must be preserved.
describe('refineSeamsInWorld — same-piece self-seam pass-through', () => {
  const frame = { point: [0, 0, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [1, 0, 0], radius: 0.05 } as PlacementWithFrame['frame'];
  const pwf = (): PlacementWithFrame => ({
    placement: { position: [0, 0, 0], rotation: [0, 0, 0] },
    frame,
    flip: false,
    wrapParams: { thetaMaxRad: 2.618, gap: 0.03 },
  });
  const piece = (id: string): PatternPiece => ({ id, edges: [], outline: [] } as unknown as PatternPiece);

  it('returns a same-piece seam verbatim (reversed preserved, not re-paired)', () => {
    const seam: Seam = {
      id: 's1',
      pieceA: { pieceId: 'L', edgeName: 'underarmSeam', tStart: 0, tEnd: 1 },
      pieceB: { pieceId: 'L', edgeName: 'underarmSeam-2', tStart: 0, tEnd: 1, reversed: true },
      type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
    };
    const out = refineSeamsInWorld([seam], [piece('L'), piece('R')], [pwf(), pwf()]);
    expect(out).toHaveLength(1);
    expect(out[0].pieceA).toEqual(seam.pieceA);
    expect(out[0].pieceB).toEqual(seam.pieceB); // reversed:true kept, edgeName not swapped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/autoSew/__tests__/worldRefine.selfseam.test.ts`
Expected: FAIL — without the guard, the seam reaches `edgeWorld` (empty outline → resolves to `null` → actually passes through here, but the contract is not yet guaranteed). If it happens to pass, still add the guard in Step 3 (the test then locks the behavior against future regressions of the grouping step). The guard is what makes the pass-through intentional and group-exclusion correct for the real (non-empty-outline) case.

- [ ] **Step 3: Add the guard**

In `src/utils/autoSew/worldRefine.ts`, at the very top of the `resolved` map callback (currently `const resolved … = seams.map(seam => {` near line 138), add before the `byId.get` lookups:

```ts
  const resolved: Array<ResolvedSeam | null> = seams.map(seam => {
    // Same-piece (self) seam — e.g. a sleeve's underarm tube closure. It must
    // NOT enter the cross-piece partner-reassignment grouping (both sleeves'
    // underarm self-seams share one role key and would be cross-paired).
    // Returning null routes it through the existing "pass through untouched"
    // branch in step 2, preserving the reversed the self-close pass set.
    // See docs/superpowers/specs/2026-06-23-sleeve-tube-closure-design.md.
    if (seam.pieceA.pieceId === seam.pieceB.pieceId) return null;
    const pa = byId.get(seam.pieceA.pieceId);
    // … rest unchanged …
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/autoSew/__tests__/worldRefine.selfseam.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green (no production self-seams exist yet, so cross-piece behavior is unchanged; M4 sonda still passes).

- [ ] **Step 6: Commit**

```bash
git add src/utils/autoSew/worldRefine.ts src/utils/autoSew/__tests__/worldRefine.selfseam.test.ts
git commit -m "feat(sleeve): worldRefine passes same-piece self-seams through untouched

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Per-region wrap coverage (sleeves wrap fuller)

Add `wrapParamsForRegion` and thread per-piece `wrapParams` so a one-piece sleeve wraps to `min(330°, panelWidth/R)` (near-closed), leaving a small gap the underarm seam (Task 3) closes. The wrap clamp is `phi = clamp(w/R, ±thetaMaxRad/2)`, so to cover the full panel width `panelWidth` (= `2·maxHalfWidth`) the cap must satisfy `thetaMaxRad ≥ panelWidth/R`; capping below `2π` avoids self-intersection.

**Files:**
- Modify: `src/utils/cloth/arrangement/wrapParams.ts`
- Modify: `src/utils/cloth/arrangement/arrangementBinding.ts` (`PlacementWithFrame`, `resolveArrangementWithFrames`)
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` (lines ~270-276 and ~332-336)
- Modify: `src/utils/autoSew/worldRefine.ts` (`edgeWorld`, line ~81)
- Modify: `src/utils/__tests__/mariaShirt.m4.test.ts` (line ~96)
- Test: `src/utils/cloth/arrangement/__tests__/wrapParams.test.ts` (create)

**Interfaces:**
- Produces: `MAX_SLEEVE_WRAP: number` (≈5.76 rad); `wrapParamsForRegion(region: BodyRegion, frame: SurfaceFrame, panelWidthMeters: number): WrapParams`; `PlacementWithFrame` gains `wrapParams: WrapParams`.
- Consumes: `outlineBBox(outline): { width: number; height: number }` (mm) from `garmentPlacement`; `pieceGeometryOf(p)` (existing in `arrangementBinding`, returns `{ widthMm, heightMm }`); `DEFAULT_WRAP` from `wrapParams`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/cloth/arrangement/__tests__/wrapParams.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wrapParamsForRegion, MAX_SLEEVE_WRAP, DEFAULT_WRAP } from '../wrapParams';
import type { SurfaceFrame } from '../surfaceFrame';

const frame = (radius: number): SurfaceFrame => ({
  point: [0, 0, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius,
});

describe('wrapParamsForRegion', () => {
  it('caps a full-circumference sleeve at MAX_SLEEVE_WRAP (~330°)', () => {
    // panelWidth ≈ circumference = 2πR ⇒ panelWidth/R ≈ 6.28 > MAX_SLEEVE_WRAP
    const R = 0.05;
    const wp = wrapParamsForRegion('left-sleeve', frame(R), 2 * Math.PI * R);
    expect(wp.thetaMaxRad).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
    expect(wp.gap).toBe(DEFAULT_WRAP.gap);
  });

  it('uses panelWidth/R when the sleeve panel is narrower than the cap', () => {
    const R = 0.05;
    const narrow = 0.1; // 0.1 / 0.05 = 2.0 rad < MAX_SLEEVE_WRAP
    const wp = wrapParamsForRegion('right-sleeve', frame(R), narrow);
    expect(wp.thetaMaxRad).toBeCloseTo(2.0, 5);
  });

  it('returns the 150° default for non-sleeve regions', () => {
    expect(wrapParamsForRegion('front-torso', frame(0.14), 0.4)).toEqual(DEFAULT_WRAP);
    expect(wrapParamsForRegion('collar', frame(0.056), 0.3)).toEqual(DEFAULT_WRAP);
  });

  it('applies to cuff regions too', () => {
    const wp = wrapParamsForRegion('cuff-left', frame(0.05), 2 * Math.PI * 0.05);
    expect(wp.thetaMaxRad).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/wrapParams.test.ts`
Expected: FAIL — `wrapParamsForRegion`/`MAX_SLEEVE_WRAP` not exported.

- [ ] **Step 3: Implement the helper**

Replace the contents of `src/utils/cloth/arrangement/wrapParams.ts` with:

```ts
import type { WrapParams } from './wrapPanel';
import type { SurfaceFrame } from './surfaceFrame';
import type { BodyRegion } from '../garmentPlacement';

/**
 * Shared wrap configuration for the placement loops (render + solver) and the
 * orientation tests. Single source so render and solver never diverge.
 * 150° wrap cap, 3cm standoff from the body surface.
 */
export const DEFAULT_WRAP: WrapParams = { thetaMaxRad: 2.618, gap: 0.03 }; // 150°, 3cm

/** Sleeve wrap cap — below 2π so the two underarm edges leave a small gap the
 *  underarm seam closes, rather than overshooting 360° and self-intersecting. */
export const MAX_SLEEVE_WRAP = (330 * Math.PI) / 180; // ≈ 5.7596 rad

const SLEEVE_REGIONS: ReadonlySet<BodyRegion> = new Set<BodyRegion>([
  'left-sleeve', 'right-sleeve', 'cuff-left', 'cuff-right',
]);

/**
 * Per-region wrap coverage. Sleeves wrap to min(330°, panelWidth/R) — a
 * near-closed tube whose remaining gap the underarm self-seam closes (Task 3);
 * everything else keeps the 150° DEFAULT_WRAP (partial-torso-panel + side-seam
 * design). `panelWidthMeters` is the flat panel's circumference-direction width
 * (outline width × 0.001). See the sleeve-tube-closure design doc.
 */
export function wrapParamsForRegion(
  region: BodyRegion,
  frame: SurfaceFrame,
  panelWidthMeters: number,
): WrapParams {
  if (!SLEEVE_REGIONS.has(region)) return DEFAULT_WRAP;
  const R = frame.radius || 1e-6;
  const fullWrap = panelWidthMeters / R;
  return { thetaMaxRad: Math.min(MAX_SLEEVE_WRAP, fullWrap), gap: DEFAULT_WRAP.gap };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npx vitest run src/utils/cloth/arrangement/__tests__/wrapParams.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread `wrapParams` through `resolveArrangementWithFrames`**

In `src/utils/cloth/arrangement/arrangementBinding.ts`:

(a) Add the import (top of file, with the other arrangement imports):
```ts
import { DEFAULT_WRAP, wrapParamsForRegion } from './wrapParams';
import type { WrapParams } from './wrapPanel';
```
(NOTE: `DEFAULT_WRAP` is already imported on line 17 — keep a single import; add `wrapParamsForRegion` to it and add the `WrapParams` type import.)

(b) Extend `PlacementWithFrame` (after the `flip` field, ~line 111):
```ts
  flip: boolean;
  /** Per-region wrap coverage (sleeves wrap fuller; others = DEFAULT_WRAP).
   *  Render and solver MUST both use this — see the design doc. */
  wrapParams: WrapParams;
```

(c) In `resolveArrangementWithFrames`, compute and return it. Replace the final `return` block (~lines 182-192) with:
```ts
  const frames = pieces.map((p, i) => {
    const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
    return surfaceFrame(regions[i], dims, axisHint);
  });

  // M4-C flip flags measured in WRAP space (NOT the rigid computeFlipFlags —
  // see PlacementWithFrame.flip). The wrap basis differs from the rigid Euler,
  // so the flip must be decided against the actual frame+wrapPanel mapping.
  const flips = computeWrapFlipFlags(pieces, frames, regions);

  // Per-region wrap coverage: sleeves wrap near-closed (panel width = outline
  // width in metres); the underarm self-seam closes the small remaining gap.
  const wrapParamsList = pieces.map((p, i) =>
    wrapParamsForRegion(regions[i], frames[i], pieceGeometryOf(p).widthMm * 0.001),
  );

  return pieces.map((_p, i) => ({
    placement: placements[i], frame: frames[i], flip: flips[i], wrapParams: wrapParamsList[i],
  }));
```

- [ ] **Step 6: Switch the four wrap call sites to per-piece `wrapParams`**

(a) `src/components/Viewport3D/GarmentSimulation.tsx`, `staticGeometry` loop (~line 270): change the destructure and the wrap call:
```ts
      const { frame, flip, wrapParams } = arrangeById.get(p.pieceId)!;
      // … (color/comment unchanged) …
      const curved = wrapPlacedMesh(p.vertices, frame, wrapParams, flip);
```
(b) Same file, `placedMeshes` loop (~line 332):
```ts
      const { frame, flip, wrapParams } = arrangeById.get(pm.pieceId)!;
      // … (comment unchanged) …
      const transformed = wrapPlacedMesh(pm.vertices, frame, wrapParams, flip);
```
(c) If `DEFAULT_WRAP` is now unused in `GarmentSimulation.tsx`, remove its import (lint runs `--max-warnings=0`). Grep the file for `DEFAULT_WRAP` first; remove the import only if no other use remains.

(d) `src/utils/autoSew/worldRefine.ts`, `edgeWorld` (~line 81): use the per-piece params from the `PlacementWithFrame`:
```ts
  const wrapped = wrapPlacedMesh(local, pwf.frame, pwf.wrapParams, pwf.flip);
```
Remove the now-unused `import { DEFAULT_WRAP } …` line (~line 33) if `DEFAULT_WRAP` is no longer referenced in the file.

(e) `src/utils/__tests__/mariaShirt.m4.test.ts`, `probeSeams` (~line 96): use the arrangement's per-piece params:
```ts
    const { frame, flip, wrapParams } = arrangement[i];
    return {
      pieceId: p.id,
      vertices: wrapPlacedMesh(mesh.vertices, frame, wrapParams, flip),
      triIds: mesh.triIds,
      boundaryOrig: mesh.boundaryOrig,
    };
```
Remove the `DEFAULT_WRAP` import from the sonda if now unused.

- [ ] **Step 7: Run the M4 sonda + full gate**

Run: `npx vitest run src/utils/__tests__/mariaShirt.m4.test.ts`
Expected: PASS. The sleeve now wraps fuller, so the `sleeveCap↔armhole` world distances shift — confirm both tests stay green (no crossed seams; every `meanPairDist < 0.45`). If `sleeveCap↔armhole` moved enough to approach 0.45, read the printed `[M4 probe]` line and confirm the shift is the expected fuller-wrap effect (the cap now spreads over more of the arm) — it should stay well under 0.45. Do NOT loosen the threshold without a written reason in the test.

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/utils/cloth/arrangement/wrapParams.ts src/utils/cloth/arrangement/arrangementBinding.ts src/components/Viewport3D/GarmentSimulation.tsx src/utils/autoSew/worldRefine.ts src/utils/__tests__/mariaShirt.m4.test.ts src/utils/cloth/arrangement/__tests__/wrapParams.test.ts
git commit -m "feat(sleeve): per-region wrap coverage — sleeves wrap near-closed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Self-close pass in `autoSew` (generate the underarm seam)

Append a pass to `autoSew` that, after the cross-piece seam generation, emits one same-piece underarm seam per piece holding exactly two `self-close` edges. The cross-piece double loop and the same-piece filter (`index.ts:181`) are untouched. `reversed` is computed in 2D (the flat sleeve's two underarm edges are clearly parallel); `worldRefine` (Task 1) passes it through.

**Files:**
- Modify: `src/utils/autoSew/index.ts` (after the `seams` array is built, ~line 249; and the return ~line 266)
- Modify: `src/utils/__tests__/mariaShirt.m4.test.ts` (add an underarm-seam assertion)
- Test: `src/utils/autoSew/__tests__/selfClose.test.ts` (create)

**Interfaces:**
- Consumes: `pieceEdges: Map<string, Edge[]>` (already built in `autoSew`); `Edge.matchHint`, `Edge.name`, `Edge.start`, `Edge.end`, `Edge.edgeIndex` (from `edgeExtractor`); `ScoreBreakdown` shape `{ naming, lengthSimilarity, proximity, edgePosition, semanticMatch, reason }`.
- Produces: extra `ProposedSeam` objects in `AutoSewResult.seams` whose `seam.pieceA.pieceId === seam.pieceB.pieceId`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/autoSew/__tests__/selfClose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { autoSew } from '../index';
import type { PatternPiece } from '../../../types/types';

// Build a minimal sleeve-like outline: a rectangle whose left and right edges
// are the two underarm edges (vertical) and whose top is the cap, bottom the
// cuff. extractEdges → detectSemanticEdges must name the two vertical edges
// 'underarmSeam'/'underarmSeam-2' (matchHint 'self-close'); the self-close
// pass must then emit ONE same-piece seam joining them.
function sleeveRect(id: string): PatternPiece {
  // 200mm wide × 300mm tall rectangle, category 'sleeve'.
  return {
    id, name: 'Sleeve', category: 'sleeve',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
  } as unknown as PatternPiece;
}

describe('autoSew self-close pass', () => {
  it('emits one same-piece underarm seam for a sleeve with two self-close edges', () => {
    const sleeve = sleeveRect('sleeve-1');
    // A second piece so autoSew runs (needs ≥2 pieces); the bodice has no
    // self-close edges and must yield no self-seam.
    const other = { id: 'bodice-1', name: 'Bodice', category: 'bodice-front',
      outline: sleeveRect('x').outline } as unknown as PatternPiece;

    const result = autoSew([sleeve, other], { minConfidence: 0.3 });
    const selfSeams = result.seams.filter(s => s.seam.pieceA.pieceId === s.seam.pieceB.pieceId);

    expect(selfSeams).toHaveLength(1);
    const s = selfSeams[0].seam;
    expect(s.pieceA.pieceId).toBe('sleeve-1');
    expect(s.pieceB.pieceId).toBe('sleeve-1');
    expect([s.pieceA.edgeName, s.pieceB.edgeName].sort())
      .toEqual(['underarmSeam', 'underarmSeam-2']);
    expect(s.type).toBe('standard');
    // No self-seam for the bodice (no self-close edges).
    expect(selfSeams.every(x => x.seam.pieceA.pieceId === 'sleeve-1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/autoSew/__tests__/selfClose.test.ts`
Expected: FAIL — `selfSeams` has length 0 (no self-close pass yet).

(If `detectSemanticEdges` does not name the rectangle's vertical edges `underarmSeam` for this synthetic outline — e.g. the geometric classifier needs a more sleeve-like shape — adjust the fixture so `extractEdges(sleeve)` yields two edges with `matchHint==='self-close'`; verify by logging `extractEdges(sleeve).map(e => [e.name, e.matchHint])` before writing the assertion. The real María sleeve is covered by the M4 sonda assertion below.)

- [ ] **Step 3: Implement the self-close pass**

In `src/utils/autoSew/index.ts`, after the `seams: ProposedSeam[] = finalRanked.map(…)` block (ends ~line 249) and before the unmatched-edges computation, insert:

```ts
  // ── Self-close pass (sleeve tube closure) ─────────────────────────────────
  // The pipeline above pairs only DISTINCT pieces (the i<j loop + the
  // same-piece filter), so a sleeve's two underarm edges — which must seam to
  // EACH OTHER to close the tube around the arm — are never paired. This
  // additive pass consumes the 'self-close' matchHint (semanticEdges.ts) to
  // emit one same-piece underarm seam per piece that has exactly two such
  // edges. buildSeamConstraints supports same-piece seams; worldRefine passes
  // them through (Task 1). See the sleeve-tube-closure design doc.
  const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const selfCloseSeams: ProposedSeam[] = [];
  const selfCloseEdgeKeys = new Set<string>();
  for (const piece of activePieces) {
    const sc = (pieceEdges.get(piece.id) ?? []).filter(e => e.matchHint === 'self-close');
    if (sc.length !== 2) {
      if (sc.length > 0) {
        console.warn(`[autoSew] piece ${piece.id} has ${sc.length} self-close edges (expected 2); skipping tube closure`);
      }
      continue;
    }
    const [eA, eB] = sc;
    // reversed: the two underarm edges traverse the outline loop in opposite
    // directions, so pairing start↔start joins diagonal corners. Pick the
    // pairing (straight vs crossed) with the smaller endpoint distance so the
    // cap end of A meets the cap end of B (a straight seam, not an X).
    const straight = d2(eA.start, eB.start) + d2(eA.end, eB.end);
    const crossed = d2(eA.start, eB.end) + d2(eA.end, eB.start);
    const reversed = crossed < straight;
    selfCloseEdgeKeys.add(`${piece.id}:${eA.edgeIndex}`);
    selfCloseEdgeKeys.add(`${piece.id}:${eB.edgeIndex}`);
    selfCloseSeams.push({
      seam: {
        // state-encoded ID — see B10-state; do NOT migrate to newId().
        id: `auto-seam-selfclose-${Date.now()}-${piece.id}`,
        pieceA: { pieceId: piece.id, edgeName: eA.name, tStart: 0, tEnd: 1 },
        pieceB: { pieceId: piece.id, edgeName: eB.name, tStart: 0, tEnd: 1, reversed },
        type: 'standard' as const,
        tension: 100,
        strength: 1.0,
        active: true,
        taped: false,
        tapeWidth: 10,
        createdBy: 'ai' as const,
      },
      confidence: 1.0,
      reason: 'sleeve underarm tube closure (self-seam)',
      breakdown: {
        naming: null, lengthSimilarity: 1, proximity: 1,
        edgePosition: 1, semanticMatch: 1, reason: 'self-close',
      },
    });
  }
```

Then merge the self-close seams into the result. Change the final `return`:
```ts
  return {
    seams: [...seams, ...selfCloseSeams],
    unmatchedEdges,
    piecesAnalyzed: activePieces.length,
    edgesExtracted: totalEdges,
  };
```

And exclude the claimed underarm edges from `unmatchedEdges` — in the unmatched loop, add the self-close keys to `matchedEdgeKeys` before filtering:
```ts
  const matchedEdgeKeys = new Set<string>();
  for (const s of finalRanked) {
    matchedEdgeKeys.add(`${s.edgeA.pieceId}:${s.edgeA.edgeIndex}`);
    matchedEdgeKeys.add(`${s.edgeB.pieceId}:${s.edgeB.edgeIndex}`);
  }
  for (const key of selfCloseEdgeKeys) matchedEdgeKeys.add(key);
```

- [ ] **Step 4: Run the self-close test to verify it passes**

Run: `npx vitest run src/utils/autoSew/__tests__/selfClose.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the underarm-seam assertion to the M4 sonda**

In `src/utils/__tests__/mariaShirt.m4.test.ts`, in the first test (`ninguna de las costuras…`), after the existing `crossed` assertion (~line 229), add:

```ts
    // Tube closure: each sleeve's underarm self-seam is proposed, resolves to
    // real constraints, and sews straight (not crossed). With the fuller sleeve
    // wrap (Task 2) the two underarm edges start close, so meanPairDist is small.
    const underarmSeams = worldSeams.filter(ws => /underarmSeam/.test(ws.label));
    expect(underarmSeams.length).toBeGreaterThanOrEqual(2); // one per sleeve
    for (const ws of underarmSeams) {
      expect(ws.pairCount).toBeGreaterThan(0);
      expect(ws.crossed, ws.label).toBe(false);
    }
```

(The existing M4-C test already asserts `meanPairDist < 0.45` for ALL `worldSeams`, which now includes the underarm seams.)

- [ ] **Step 6: Run the sonda + full gate**

Run: `npx vitest run src/utils/__tests__/mariaShirt.m4.test.ts`
Expected: PASS — the `[M4 probe]` log now prints two `sleeve:underarmSeam ↔ sleeve:underarmSeam-2` lines with small `meanPairDist` and `derecha ✓`. If a underarm seam shows `CRUZADA ✗`, the 2D `reversed` was wrong for María's real outline — debug by printing `eA.start/eA.end/eB.start/eB.end` for the sleeve and confirm the straight-vs-crossed choice; the fix stays in the self-close pass (do not special-case the sonda).

Run: `npx tsc -b --noEmit && npm run test && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/utils/autoSew/index.ts src/utils/autoSew/__tests__/selfClose.test.ts src/utils/__tests__/mariaShirt.m4.test.ts
git commit -m "feat(sleeve): auto-sew self-close pass emits the underarm tube seam

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `@gpu-local` replay — sleeve persistence metric

Add a t=10s sleeve-persistence check to the María replay so the maintainer can confirm the sleeve no longer collapses off the arm (the failure was sleeve verts `|x|>0.25` dropping 993→2 over 10s). CI never runs `@gpu-local`, so this is parse-checked in CI and asserted only on the maintainer's GPU run.

**Files:**
- Modify: `tests/e2e/webgpu-maria-replay.spec.ts` (after the `creep` block, ~line 257)

**Interfaces:**
- Consumes: `__OPENCLO_CLOTH_MESH__` window global (the merged live cloth mesh), already used by `readDrape`.

- [ ] **Step 1: Add the persistence metric + anti-collapse assert**

In `tests/e2e/webgpu-maria-replay.spec.ts`, after `expect(creep!.nan).toBe(0);` (~line 257), add:

```ts
    // Tube-closure check (maintainer-run): the sleeve must STAY on the arm.
    // Before tube closure, sleeve verts (|x|>0.25) collapsed 993→~2 over 10s
    // as the open sleeve slid off. With the underarm seam closing the tube the
    // on-arm population persists. The 10s drape is non-deterministic (#902), so
    // this is a loose ANTI-COLLAPSE floor, not a tight bound — the maintainer
    // runs --repeat-each=3 and reads the logged counts. // maintainer-run
    const sleeveAt10 = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
      if (!mesh) return null;
      const pos = mesh.geometry.attributes.position;
      let count = 0, maxAbsX = 0;
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(pos.getX(i));
        if (ax > maxAbsX) maxAbsX = ax;
        if (ax > 0.25) count++;
      }
      return { count, maxAbsX };
    });
    console.log(
      `[sleeve-persist] simSeconds=10 sleeveVertCount=${sleeveAt10?.count ?? 'n/a'} maxAbsX=${sleeveAt10?.maxAbsX?.toFixed(3) ?? 'n/a'} (anti-collapse floor: count≥50)`,
    );
    expect(sleeveAt10, 'Cloth mesh not found — __OPENCLO_CLOTH_MESH__ not published').not.toBeNull();
    // Anti-collapse floor: well above the pre-fix collapse (~2), loose enough
    // for the non-deterministic 10s drape. // maintainer-run
    expect(sleeveAt10!.count).toBeGreaterThanOrEqual(50);
```

- [ ] **Step 2: Parse-check the spec compiles (CI does not run @gpu-local)**

Run: `npx tsc -b --noEmit`
Expected: clean.

Run: `npx playwright test --config playwright.webgpu.config.ts webgpu-maria-replay --list`
Expected: lists the `drape M4` test without a parse error.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/webgpu-maria-replay.spec.ts
git commit -m "test(sleeve): @gpu-local t=10s sleeve-persistence anti-collapse metric

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Maintainer validation (Samuel, not CI)**

Run: `npm run test:e2e:gpu -- webgpu-maria-replay -g "drape M4" --repeat-each=3`
Expected: the `[sleeve-persist]` log shows `sleeveVertCount` staying ≥50 (not collapsing to ~2) and `maxAbsX` healthy (~0.4-0.6) across all three runs; the sleeve visibly stays on the A-pose arm. This is the real measure of the feature.

---

## Self-Review

**1. Spec coverage:**
- §4.1 self-close pass → Task 3. ✓
- §4.2 reversed (geometric) → Task 3 (2D straight-vs-crossed). ✓
- §4.3 per-region fuller sleeve wrap → Task 2. ✓
- §5 integration (autoSew, worldRefine guard, arrangementBinding wrapParams, GarmentSimulation ×2, worldRefine.edgeWorld, M4 sonda) → Tasks 1-3. ✓
- §6 validation (auto-sew unit, wrap-coverage unit, M4 sonda, @gpu-local persistence, gates) → Tasks 2-4. ✓
- §5 "no change to store/seamAssembly/GPU packing" → Global Constraints. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. The one conditional ("if the synthetic fixture doesn't name edges underarmSeam, adjust it") is a real fallback with a concrete verification command, not a placeholder — the production assertion lives in the M4 sonda regardless.

**3. Type consistency:** `wrapParamsForRegion(region, frame, panelWidthMeters)` and `MAX_SLEEVE_WRAP` are defined in Task 2 and used nowhere earlier. `PlacementWithFrame.wrapParams: WrapParams` is added in Task 2 and consumed in Task 2's call sites + Task 1's test fixture (which constructs it inline). `ProposedSeam`/`ScoreBreakdown` shapes in Task 3 match `index.ts`/`scorer.ts` exactly. Seam shape (`pieceB.reversed?`) matches `types.ts:396`. The self-seam ID uses the `auto-seam-…` state-encoded pattern.

**Note on order:** Task 2 (fuller wrap) must precede Task 3 (self-seam), because the M4-C sonda asserts `meanPairDist < 0.45` for every seam — with only the 150° wrap the two underarm edges start ~210° apart (large meanPairDist) and the underarm-seam assertion in Task 3 would fail. Task 1 (guard) must precede Task 3 so the generated self-seam survives `refineSeamsInWorld`.
