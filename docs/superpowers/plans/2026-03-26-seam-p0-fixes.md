# Seam System P0+P1 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make seams actually work — pieces sew together in simulation, render correctly in 2D with color-coded pairs.

**Architecture:** Three root causes prevent seams from functioning: (1) `buildSeamConstraints()` silently skips seams when semantic edge names can't be resolved — fixed by parsing the `"edge-N"` fallback pattern; (2) WASM worker omits piece edge data when calling `buildSeamConstraints()` — fixed by passing the already-cached `pieceEdges` map; (3) shrink factor is 100x too slow. Additionally, 2D rendering gets color-coded seam pairs for visual clarity.

**Tech Stack:** TypeScript, XPBD solver, SVG rendering, Vitest

**Issues:** #451 (edge resolution), #452 (WASM seam data), #453 (shrink speed), #455 (color coding)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/cloth/seamAssembly.ts` | Modify | Add `"edge-N"` fallback parsing in `buildSeamConstraints()` + fix shrink factor |
| `src/utils/cloth/wasm/wasmSolverWorker.ts` | Modify | Pass `pieceEdges` to `buildSeamConstraints()` call |
| `src/utils/cloth/seamAssembly.test.ts` | Modify | Add test for fallback edge resolution |
| `src/components/PatternEditor/renderers/SeamRenderer.tsx` | Modify | Color-coded seam pairs |

---

### Task 1: Fix edge name fallback in buildSeamConstraints

**Files:**
- Modify: `src/utils/cloth/seamAssembly.ts:369-374`
- Test: `src/utils/cloth/seamAssembly.test.ts`

- [ ] **Step 1: Write failing test for edge-N fallback**

```typescript
// In seamAssembly.test.ts — add to existing describe block
it('resolves "edge-N" fallback when semantic edges are missing', () => {
  // Create a seam with fallback edge names (no semantic edges on pieces)
  const seam: Seam = {
    id: 'test-seam',
    pieceA: { pieceId: 'pA', edgeName: 'edge-0' },
    pieceB: { pieceId: 'pB', edgeName: 'edge-0' },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  };

  // Simple square outlines (4 edges each)
  const outlineA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];
  const outlineB: PathCommand[] = [...outlineA]; // same shape

  const outlines = new Map([['pA', outlineA], ['pB', outlineB]]);

  // Merged mesh with two squares side by side
  const merged = mergeMeshes([
    { pieceId: 'pA', vertices: new Float32Array([0,0,0, 100,0,0, 100,100,0, 0,100,0]), triIds: new Int32Array([0,1,2, 0,2,3]) },
    { pieceId: 'pB', vertices: new Float32Array([200,0,0, 300,0,0, 300,100,0, 200,100,0]), triIds: new Int32Array([0,1,2, 0,2,3]) },
  ]);

  // NO piece edges passed (4th argument) — should still work via fallback
  const result = buildSeamConstraints([seam], outlines, merged);
  expect(result.count).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/seamAssembly.test.ts -t "resolves edge-N fallback"`
Expected: FAIL — `result.count` is 0 because the current code silently skips

- [ ] **Step 3: Implement edge-N fallback in buildSeamConstraints**

In `src/utils/cloth/seamAssembly.ts`, replace lines 369-374:

```typescript
    // Resolve edge names to segment ranges
    const pieceAData = pieces?.get(seam.pieceA.pieceId);
    const pieceBData = pieces?.get(seam.pieceB.pieceId);
    let edgeADef = pieceAData?.edges?.find(e => e.name === seam.pieceA.edgeName);
    let edgeBDef = pieceBData?.edges?.find(e => e.name === seam.pieceB.edgeName);

    // Fallback: parse "edge-N" pattern to extract segment index
    if (!edgeADef) {
      const match = seam.pieceA.edgeName.match(/^edge-(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const flatA = flattenPath(outlineA);
        if (idx < flatA.length) {
          edgeADef = { name: seam.pieceA.edgeName, segmentRange: [idx, (idx + 1) % flatA.length] };
        }
      }
    }
    if (!edgeBDef) {
      const match = seam.pieceB.edgeName.match(/^edge-(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const flatB = flattenPath(outlineB);
        if (idx < flatB.length) {
          edgeBDef = { name: seam.pieceB.edgeName, segmentRange: [idx, (idx + 1) % flatB.length] };
        }
      }
    }

    if (!edgeADef || !edgeBDef) continue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/seamAssembly.test.ts`
Expected: All tests PASS including the new fallback test

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/seamAssembly.ts src/utils/cloth/seamAssembly.test.ts
git commit -m "fix(seam): parse edge-N fallback when semantic edges are missing (#451)"
```

---

### Task 2: Pass pieceEdges to buildSeamConstraints in WASM worker

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts:378`

- [ ] **Step 1: Fix the missing argument**

In `src/utils/cloth/wasm/wasmSolverWorker.ts` line 378, change:

```typescript
// BEFORE:
const seamConstraints = buildSeamConstraints(msg.seams, outlines, merged);

// AFTER:
const seamConstraints = buildSeamConstraints(msg.seams, outlines, merged, pieceEdges);
```

`pieceEdges` is already built on lines 361-366 and cached. It just wasn't passed.

- [ ] **Step 2: Verify types pass**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts
git commit -m "fix(seam): pass pieceEdges to buildSeamConstraints in WASM worker (#452)"
```

---

### Task 3: Fix seam shrink speed

**Files:**
- Modify: `src/utils/cloth/seamAssembly.ts:87`
- Test: `src/utils/cloth/seamAssembly.test.ts`

- [ ] **Step 1: Write test for faster shrink**

```typescript
it('shrinks rest lengths aggressively (>1% per substep)', () => {
  expect(DEFAULT_SEAM_CONFIG.shrinkFactor).toBeLessThanOrEqual(0.97);
  expect(DEFAULT_SEAM_CONFIG.shrinkFactor).toBeGreaterThanOrEqual(0.90);
});
```

- [ ] **Step 2: Change shrinkFactor**

In `src/utils/cloth/seamAssembly.ts` line 87:

```typescript
// BEFORE:
shrinkFactor: 0.995,

// AFTER:
shrinkFactor: 0.95,
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/utils/cloth/seamAssembly.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/utils/cloth/seamAssembly.ts src/utils/cloth/seamAssembly.test.ts
git commit -m "fix(seam): faster shrink factor — 0.95 instead of 0.995 (#453)"
```

---

### Task 4: Color-coded seam pairs in 2D

**Files:**
- Modify: `src/components/PatternEditor/renderers/SeamRenderer.tsx:83`

- [ ] **Step 1: Add seam color palette**

At the top of `SeamRenderer.tsx`, add:

```typescript
const SEAM_PALETTE = [
  '#4a9eff', '#ff6b9d', '#6bffa6', '#ffa64a', '#9d6bff',
  '#ff4a4a', '#4affc8', '#ffd54a', '#c84aff', '#4affe5',
];
```

- [ ] **Step 2: Replace baseColor logic**

In the `seams.map()` callback, replace the color assignment (line 83):

```typescript
// BEFORE:
const baseColor = isInactive ? '#666' : hasMismatch ? '#ff9944' : isSelected ? '#ff6b6b' : '#e74c3c';

// AFTER:
const seamIndex = seams.indexOf(seam);
const paletteColor = SEAM_PALETTE[seamIndex % SEAM_PALETTE.length];
const baseColor = isInactive ? '#666' : isSelected ? '#ffffff' : hasMismatch ? '#ff9944' : paletteColor;
```

- [ ] **Step 3: Verify types pass**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/PatternEditor/renderers/SeamRenderer.tsx
git commit -m "feat(seam): color-coded seam pairs with 10-color palette (#455)"
```

---

### Task 5: Full verification + PR

- [ ] **Step 1: Run all unit tests**

Run: `npm test -- --run`
Expected: All pass (update tool counts if needed)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Push and create PR**

```bash
git push -u origin fix/seam-system-p0
gh pr create --title "fix(seam): P0+P1 — edge resolution, WASM data, shrink speed, color coding" --body "..."
```

Closes #451, #452, #453, #455
