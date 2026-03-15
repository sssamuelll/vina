# Walk Seam Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Interactive walk seam tool that lets users walk along sewn edges to verify length matching and ease distribution, rendering the paired piece as a translucent ghost that follows the cursor along the stationary edge.

**Architecture:** New `walkSeam` tool ID registered in the tool system. A `useWalkSeamTool` hook manages all walk state (edge selection, ghost transform, mismatch samples). A `WalkSeamOverlay` SVG component renders the ghost piece, color-coded edge segments, and metrics panel. Reuses arc-length infrastructure from `arcLength.ts` and snap utilities from `useMeasureTool.ts`.

**Tech Stack:** React, Redux (toolSlice, projectSlice), SVG, TypeScript, Vitest

---

## Context for the Implementer

### Key Types

```typescript
// src/types/types.ts:144
interface SemanticEdge {
  id: string;
  name: string;                        // "armhole", "shoulder", etc.
  segmentRange: [number, number];      // [start, end) in outline PathCommand[]
  edgeType: SemanticEdgeType;
  matchHint?: string;
  length?: number;
}

// src/types/types.ts:162
interface Seam {
  id: string;
  pieceA: { pieceId: string; edgeName: string };
  pieceB: { pieceId: string; edgeName: string };
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}

// Tool2D union: src/types/types.ts:284  —  we'll add 'walkSeam' to it
```

### Key Utilities (already exist, DO NOT recreate)

```typescript
// src/utils/geometry/arcLength.ts
computePathArcLength(commands, startIdx?, endIdx?) → number
pointAtPathDistance(commands, distance, startIdx?, endIdx?) → Point2D | null
samplePathAtIntervals(commands, interval, startIdx?, endIdx?) → ArcLengthSample[]

// src/components/PatternEditor/useMeasureTool.ts
snapToOutline(pt, piece, zoom) → SnapResult | null
findEdgeForSegment(piece, segmentIndex) → SemanticEdge | null
buildEdgeInfo(piece, edge, markerInterval) → SelectedEdgeInfo

// src/components/PatternEditor/utils.ts
pathToSVG(commands: PathCommand[]) → string   // "M0,0 L100,0 ..."
```

### Registration Pattern

Tools are registered in `src/tools/index.ts:55-131`. Each tool is imported and added to the `allTools` array. The registry auto-registers on import.

Shortcuts are in `src/shortcuts/defaults.ts:10-105` as `ShortcutDef[]`.

### ToolOverlay Pattern

`src/components/PatternEditor/renderers/ToolOverlay.tsx` has a `ToolOverlayProps` interface (line 47-123) and conditional rendering blocks for each tool (line 125-250). New tools add props to the interface and a new conditional block.

### useEditorInteractions Pattern

`src/components/PatternEditor/useEditorInteractions.ts` dispatches mouse/key events to tool hooks. New tools need:
1. Entry in `ToolHooks` interface (line 91-157)
2. `handleMouseDown` dispatch (line 278-329)
3. `handleMouseMove` dispatch (line 425-517)
4. `handleKeyDown` registration (line 226-244)
5. `getCursor` case (line 541-560)

---

## Task 1: Add `walkSeam` to Tool2D union type

**Files:**
- Modify: `src/types/types.ts:284-318`

**Step 1: Add the type**

In `src/types/types.ts`, find the `Tool2D` union type at line 284. Add `'walkSeam'` after `'compareCurves'` (line 314):

```typescript
  | 'compareCurves' // compare two curve lengths
  | 'walkSeam'      // walk seam verification
  | 'scissors'     // split pattern pieces
```

**Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (existing ones are fine)

**Step 3: Commit**

```bash
git add src/types/types.ts
git commit -m "feat(walkSeam): add walkSeam to Tool2D union type (#254)"
```

---

## Task 2: Create tool definition

**Files:**
- Create: `src/tools/definitions/walkSeam.tsx`
- Modify: `src/tools/index.ts:33,101`

**Step 1: Create the tool definition file**

Create `src/tools/definitions/walkSeam.tsx`:

```tsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const WalkSeamIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Two edges with walking dot */}
    <path d="M3 5L15 5" />
    <path d="M3 13L15 13" strokeDasharray="2 2" />
    <circle cx="9" cy="5" r="2" fill="currentColor" />
    <path d="M9 7V11" strokeDasharray="1 1" />
  </svg>
);

export const walkSeamTool: ToolDefinition = {
  id: 'walkSeam',
  name: 'Walk Seam',
  description: 'Walk along sewn edges to verify length matching and ease distribution',
  context: '2d',
  icon: WalkSeamIcon,
  cursor: 'crosshair',
  group: 'annotation',
  options: [
    {
      id: 'tolerance',
      label: 'Tolerance',
      type: 'select',
      value: '3',
      choices: [
        { label: '1mm', value: '1' },
        { label: '3mm', value: '3' },
        { label: '5mm', value: '5' },
      ],
    },
    {
      id: 'ghostOpacity',
      label: 'Ghost Opacity',
      type: 'number',
      value: 30,
      min: 10,
      max: 80,
      step: 10,
    },
  ],
  copilot: {
    description:
      'Walk along sewn edges to verify that seam lengths match. Shows a ghost preview of the paired pattern piece sliding along the stationary edge, with color-coded mismatch visualization (green/yellow/red) and metrics including delta and ease percentage.',
    examples: [
      'Walk the armhole seam to check for ease',
      'Verify the side seam lengths match',
      'Check the shoulder seam alignment',
    ],
    keywords: [
      'walk',
      'seam',
      'verify',
      'ease',
      'match',
      'alignment',
      'length',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      tolerance: 'Mismatch threshold in mm (1, 3, or 5)',
      ghostOpacity: 'Opacity of the ghost piece preview (10-80%)',
    },
  },
};
```

**Step 2: Register in tool index**

In `src/tools/index.ts`, add the import after the `compareCurves` import (line 33):

```typescript
import { compareCurvesTool } from './definitions/compareCurves';
import { walkSeamTool } from './definitions/walkSeam';
```

Add to the `allTools` array after `compareCurvesTool` (line 101):

```typescript
  compareCurvesTool,
  walkSeamTool,
```

**Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/tools/definitions/walkSeam.tsx src/tools/index.ts
git commit -m "feat(walkSeam): create tool definition and register (#254)"
```

---

## Task 3: Add keyboard shortcut

**Files:**
- Modify: `src/shortcuts/defaults.ts:48`

**Step 1: Add shortcut**

In `src/shortcuts/defaults.ts`, after the `tool.measure` entry (line 48), add:

```typescript
  { id: 'tool.measure', key: 'm', label: 'Measure', category: '2D Tools', context: '2d' },
  { id: 'tool.walkSeam', key: 'm', shift: true, label: 'Walk Seam', category: '2D Tools', context: '2d' },
```

Using `Shift+M` since `m` is taken by measure. This groups walk seam with measurement tools.

**Step 2: Commit**

```bash
git add src/shortcuts/defaults.ts
git commit -m "feat(walkSeam): add Shift+M keyboard shortcut (#254)"
```

---

## Task 4: Create `useWalkSeamTool` hook — pure helper functions + tests

This task creates the pure (non-React) helper functions that the hook will use, with test-first development.

**Files:**
- Create: `src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts`
- Create: `src/components/PatternEditor/useWalkSeamTool.ts`

**Step 1: Write failing tests for helper functions**

Create `src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  findSeamForEdge,
  computeEdgeTangent,
  computeGhostTransform,
  sampleMismatch,
} from '../useWalkSeamTool';
import type { PatternPiece, Seam, SemanticEdge } from '../../../types/types';

// ─── Test fixtures ───

const pieceA: PatternPiece = {
  id: 'pA',
  name: 'Front',
  position: { x: 0, y: 0 },
  outline: [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [100, 0] },   // seg 1: top
    { type: 'L' as const, values: [100, 80] },  // seg 2: right
    { type: 'L' as const, values: [0, 80] },    // seg 3: bottom
    { type: 'Z' as const, values: [] },
  ],
  edges: [
    { id: 'eA1', name: 'top', segmentRange: [1, 2] as [number, number], edgeType: 'seam' },
    { id: 'eA2', name: 'right', segmentRange: [2, 3] as [number, number], edgeType: 'seam' },
    { id: 'eA3', name: 'bottom', segmentRange: [3, 4] as [number, number], edgeType: 'hem' },
  ] as SemanticEdge[],
  internals: [],
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  createdAt: 0,
  updatedAt: 0,
};

const pieceB: PatternPiece = {
  id: 'pB',
  name: 'Back',
  position: { x: 200, y: 0 },
  outline: [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [100, 0] },
    { type: 'L' as const, values: [100, 80] },
    { type: 'L' as const, values: [0, 80] },
    { type: 'Z' as const, values: [] },
  ],
  edges: [
    { id: 'eB1', name: 'top', segmentRange: [1, 2] as [number, number], edgeType: 'seam' },
    { id: 'eB2', name: 'right', segmentRange: [2, 3] as [number, number], edgeType: 'seam' },
  ] as SemanticEdge[],
  internals: [],
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  createdAt: 0,
  updatedAt: 0,
};

const seams: Seam[] = [
  {
    id: 's1',
    pieceA: { pieceId: 'pA', edgeName: 'right' },
    pieceB: { pieceId: 'pB', edgeName: 'right' },
    type: 'standard',
  },
];

// ─── findSeamForEdge ───

describe('findSeamForEdge', () => {
  it('finds a seam when piece+edge match pieceA side', () => {
    const result = findSeamForEdge('pA', 'right', seams);
    expect(result).not.toBeNull();
    expect(result!.seam.id).toBe('s1');
    expect(result!.pairedPieceId).toBe('pB');
    expect(result!.pairedEdgeName).toBe('right');
  });

  it('finds a seam when piece+edge match pieceB side', () => {
    const result = findSeamForEdge('pB', 'right', seams);
    expect(result).not.toBeNull();
    expect(result!.pairedPieceId).toBe('pA');
    expect(result!.pairedEdgeName).toBe('right');
  });

  it('returns null when no seam matches', () => {
    const result = findSeamForEdge('pA', 'top', seams);
    expect(result).toBeNull();
  });

  it('returns null for empty seams array', () => {
    const result = findSeamForEdge('pA', 'right', []);
    expect(result).toBeNull();
  });
});

// ─── computeEdgeTangent ───

describe('computeEdgeTangent', () => {
  it('returns horizontal tangent for a horizontal line', () => {
    // Edge: (0,0)→(100,0), sample at d=50
    const t = computeEdgeTangent(pieceA.outline, 50, 1, 2);
    expect(t.x).toBeCloseTo(1, 1);
    expect(t.y).toBeCloseTo(0, 1);
  });

  it('returns vertical tangent for a vertical line', () => {
    // Edge: (100,0)→(100,80), sample at d=40
    const t = computeEdgeTangent(pieceA.outline, 40, 2, 3);
    expect(t.x).toBeCloseTo(0, 1);
    expect(t.y).toBeCloseTo(1, 1);
  });

  it('returns a unit vector', () => {
    const t = computeEdgeTangent(pieceA.outline, 50, 1, 2);
    const mag = Math.hypot(t.x, t.y);
    expect(mag).toBeCloseTo(1, 2);
  });
});

// ─── computeGhostTransform ───

describe('computeGhostTransform', () => {
  it('aligns parallel edges with correct translation', () => {
    // Both edges are horizontal, 100mm long. At d=0 they should overlap at stationary start.
    const result = computeGhostTransform(
      pieceA.outline, [1, 2], pieceA.position,   // stationary: (0,0)→(100,0) at pos (0,0)
      pieceB.outline, [1, 2], pieceB.position,   // mobile: (0,0)→(100,0) at pos (200,0)
      0, // walk distance = 0 (start)
    );
    // Rotation should be ~0 (both horizontal)
    expect(Math.abs(result.angleDeg)).toBeLessThan(1);
  });

  it('returns non-zero rotation for perpendicular edges', () => {
    // Stationary: top edge (horizontal), mobile: right edge (vertical)
    const result = computeGhostTransform(
      pieceA.outline, [1, 2], pieceA.position,   // horizontal
      pieceA.outline, [2, 3], pieceA.position,   // vertical
      0,
    );
    // Should rotate ~90 degrees to align vertical to horizontal
    expect(Math.abs(result.angleDeg)).toBeGreaterThan(80);
    expect(Math.abs(result.angleDeg)).toBeLessThan(100);
  });
});

// ─── sampleMismatch ───

describe('sampleMismatch', () => {
  it('returns all-green samples when edges have equal length', () => {
    // Both edges: 100mm horizontal lines, tolerance 3mm
    const samples = sampleMismatch(
      pieceA.outline, [1, 2],
      pieceB.outline, [1, 2],
      3,
    );
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.color).toBe('green');
    }
  });

  it('returns correct sample count for 5mm interval on 100mm edge', () => {
    const samples = sampleMismatch(
      pieceA.outline, [1, 2],
      pieceB.outline, [1, 2],
      3,
    );
    // 100mm / 5mm = 20 intervals + 1 = 21 samples
    expect(samples.length).toBe(21);
  });

  it('includes distance and color fields', () => {
    const samples = sampleMismatch(
      pieceA.outline, [1, 2],
      pieceB.outline, [1, 2],
      3,
    );
    expect(samples[0]).toHaveProperty('distance');
    expect(samples[0]).toHaveProperty('color');
    expect(samples[0]).toHaveProperty('pointA');
    expect(samples[0]).toHaveProperty('pointB');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts 2>&1 | tail -10`
Expected: FAIL — cannot import from `../useWalkSeamTool`

**Step 3: Implement the helper functions + hook skeleton**

Create `src/components/PatternEditor/useWalkSeamTool.ts`:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PatternPiece, Seam, SemanticEdge } from '../../types/types';
import { formatDimension } from '../../utils/units';
import { snapToOutline, findEdgeForSegment, buildEdgeInfo } from './useMeasureTool';
import type { SelectedEdgeInfo } from './useMeasureTool';
import { computePathArcLength, pointAtPathDistance } from '../../utils/geometry/arcLength';

// ─── Types ───

export interface WalkSeamEdge {
  pieceId: string;
  piece: PatternPiece;
  edge: SemanticEdge;
  arcLength: number;
}

export interface MismatchSample {
  distance: number;    // arc-length along stationary edge
  pointA: Point2D;     // point on stationary edge (local coords)
  pointB: Point2D;     // point on mobile edge (local coords)
  delta: number;       // |d_A_fraction * lenA - d_B_fraction * lenB| at this sample
  color: 'green' | 'yellow' | 'red';
}

export interface GhostTransform {
  tx: number;
  ty: number;
  angleDeg: number;
  pivotX: number;
  pivotY: number;
}

export interface WalkSeamMetrics {
  lengthA: number;
  lengthB: number;
  delta: number;
  easePercent: number;
  walkPosition: number;
}

export interface SeamLookupResult {
  seam: Seam;
  pairedPieceId: string;
  pairedEdgeName: string;
}

// ─── Pure helper functions ───

const MISMATCH_INTERVAL = 5; // mm between mismatch samples
const TANGENT_EPSILON = 0.5; // mm for finite-difference tangent

/**
 * Find a Seam that references the given piece+edgeName.
 * Returns the seam and the paired piece/edge info, or null.
 */
export function findSeamForEdge(
  pieceId: string,
  edgeName: string,
  seams: Seam[],
): SeamLookupResult | null {
  for (const seam of seams) {
    if (seam.pieceA.pieceId === pieceId && seam.pieceA.edgeName === edgeName) {
      return { seam, pairedPieceId: seam.pieceB.pieceId, pairedEdgeName: seam.pieceB.edgeName };
    }
    if (seam.pieceB.pieceId === pieceId && seam.pieceB.edgeName === edgeName) {
      return { seam, pairedPieceId: seam.pieceA.pieceId, pairedEdgeName: seam.pieceA.edgeName };
    }
  }
  return null;
}

/**
 * Compute normalized tangent vector at distance `d` along an edge.
 * Uses finite-difference: tangent = normalize(point(d+ε) - point(d-ε)).
 */
export function computeEdgeTangent(
  outline: PatternPiece['outline'],
  d: number,
  segStart: number,
  segEnd: number,
): Point2D {
  const arcLen = computePathArcLength(outline, segStart, segEnd);
  const dMinus = Math.max(0, d - TANGENT_EPSILON);
  const dPlus = Math.min(arcLen, d + TANGENT_EPSILON);
  const pMinus = pointAtPathDistance(outline, dMinus, segStart, segEnd);
  const pPlus = pointAtPathDistance(outline, dPlus, segStart, segEnd);
  if (!pMinus || !pPlus) return { x: 1, y: 0 }; // fallback
  const dx = pPlus.x - pMinus.x;
  const dy = pPlus.y - pMinus.y;
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-9) return { x: 1, y: 0 };
  return { x: dx / mag, y: dy / mag };
}

/**
 * Compute the SVG transform for the ghost (mobile) piece so that its edge
 * aligns with the stationary edge at walk distance `d`.
 */
export function computeGhostTransform(
  stationaryOutline: PatternPiece['outline'],
  stationaryRange: [number, number],
  stationaryPos: Point2D,
  mobileOutline: PatternPiece['outline'],
  mobileRange: [number, number],
  mobilePos: Point2D,
  walkDistance: number,
): GhostTransform {
  const stationaryArcLen = computePathArcLength(stationaryOutline, stationaryRange[0], stationaryRange[1]);
  const mobileArcLen = computePathArcLength(mobileOutline, mobileRange[0], mobileRange[1]);

  // Clamp walk distance
  const dS = Math.max(0, Math.min(walkDistance, stationaryArcLen));
  // Map to mobile: same fraction
  const frac = stationaryArcLen > 0 ? dS / stationaryArcLen : 0;
  const dM = frac * mobileArcLen;

  // Points on each edge (local to piece)
  const pS = pointAtPathDistance(stationaryOutline, dS, stationaryRange[0], stationaryRange[1]);
  const pM = pointAtPathDistance(mobileOutline, dM, mobileRange[0], mobileRange[1]);
  if (!pS || !pM) return { tx: 0, ty: 0, angleDeg: 0, pivotX: 0, pivotY: 0 };

  // Tangents
  const tS = computeEdgeTangent(stationaryOutline, dS, stationaryRange[0], stationaryRange[1]);
  const tM = computeEdgeTangent(mobileOutline, dM, mobileRange[0], mobileRange[1]);

  // Rotation to align mobile tangent to stationary tangent
  const angleS = Math.atan2(tS.y, tS.x);
  const angleM = Math.atan2(tM.y, tM.x);
  const angleDiff = angleS - angleM;
  const angleDeg = angleDiff * (180 / Math.PI);

  // World-space point on stationary edge
  const worldS = { x: pS.x + stationaryPos.x, y: pS.y + stationaryPos.y };

  // Mobile edge point in world space (before rotation)
  const worldM = { x: pM.x + mobilePos.x, y: pM.y + mobilePos.y };

  // Rotate mobile point around mobile piece origin
  const cos = Math.cos(angleDiff);
  const sin = Math.sin(angleDiff);
  // Point relative to mobile piece origin
  const relX = pM.x;
  const relY = pM.y;
  // Rotated relative position
  const rotX = relX * cos - relY * sin;
  const rotY = relX * sin + relY * cos;

  // Translation: stationary world point - rotated mobile point - mobile piece origin offset
  // We want: mobilePos + rotation(relativePoint) = stationaryWorldPoint
  // So: tx = stationaryWorldPoint.x - rotatedRelativePoint.x
  //     ty = stationaryWorldPoint.y - rotatedRelativePoint.y
  // But the SVG transform is: translate(tx, ty) rotate(angle, pivotX, pivotY) applied to the piece group
  // which already has translate(mobilePos.x, mobilePos.y)
  // So we need: tx = worldS.x - (mobilePos.x + rotX), ty = worldS.y - (mobilePos.y + rotY)
  const tx = worldS.x - mobilePos.x - rotX;
  const ty = worldS.y - mobilePos.y - rotY;

  return { tx, ty, angleDeg, pivotX: pM.x, pivotY: pM.y };
}

/**
 * Sample both edges at MISMATCH_INTERVAL and compute color-coded mismatch.
 * Color: green (< tolerance), yellow (tolerance..2×tolerance), red (≥ 2×tolerance).
 */
export function sampleMismatch(
  outlineA: PatternPiece['outline'],
  rangeA: [number, number],
  outlineB: PatternPiece['outline'],
  rangeB: [number, number],
  tolerance: number,
): MismatchSample[] {
  const lenA = computePathArcLength(outlineA, rangeA[0], rangeA[1]);
  const lenB = computePathArcLength(outlineB, rangeB[0], rangeB[1]);
  if (lenA === 0) return [];

  const numSamples = Math.floor(lenA / MISMATCH_INTERVAL);
  const samples: MismatchSample[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const dA = i * MISMATCH_INTERVAL;
    const frac = dA / lenA;
    const dB = frac * lenB;
    const pA = pointAtPathDistance(outlineA, dA, rangeA[0], rangeA[1]);
    const pB = pointAtPathDistance(outlineB, dB, rangeB[0], rangeB[1]);
    if (!pA || !pB) continue;

    const delta = Math.abs(dA - dB);
    let color: 'green' | 'yellow' | 'red' = 'green';
    if (delta >= tolerance * 2) color = 'red';
    else if (delta >= tolerance) color = 'yellow';

    samples.push({ distance: dA, pointA: pA, pointB: pB, delta, color });
  }

  return samples;
}

// ─── Hook ───

export function useWalkSeamTool(zoom: number, pan: Point2D) {
  const units = useSelector((s: RootState) => s.editor.units);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const tolerance = useSelector(
    (s: RootState) => Number(s.tools.toolOptions[activeTool2D]?.tolerance ?? '3')
  );
  const ghostOpacity = useSelector(
    (s: RootState) => Number(s.tools.toolOptions[activeTool2D]?.ghostOpacity ?? '30')
  );

  const [stationaryEdge, setStationaryEdge] = useState<WalkSeamEdge | null>(null);
  const [mobileEdge, setMobileEdge] = useState<WalkSeamEdge | null>(null);
  const [walkDistance, setWalkDistance] = useState<number>(0);
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<Point2D | null>(null);
  const [ghostTransform, setGhostTransform] = useState<GhostTransform | null>(null);
  const [mismatchSamples, setMismatchSamples] = useState<MismatchSample[]>([]);
  const [metrics, setMetrics] = useState<WalkSeamMetrics | null>(null);

  const stationaryEdgeRef = useRef(stationaryEdge);
  stationaryEdgeRef.current = stationaryEdge;
  const mobileEdgeRef = useRef(mobileEdge);
  mobileEdgeRef.current = mobileEdge;

  // Clear state on tool switch
  useEffect(() => {
    if (activeTool2D !== 'walkSeam') {
      setStationaryEdge(null);
      setMobileEdge(null);
      setWalkDistance(0);
      setGhostTransform(null);
      setMismatchSamples([]);
      setMetrics(null);
    }
  }, [activeTool2D]);

  // Recompute mismatch when edges change
  useEffect(() => {
    if (stationaryEdge && mobileEdge) {
      const samples = sampleMismatch(
        stationaryEdge.piece.outline, stationaryEdge.edge.segmentRange,
        mobileEdge.piece.outline, mobileEdge.edge.segmentRange,
        tolerance,
      );
      setMismatchSamples(samples);
      const delta = mobileEdge.arcLength - stationaryEdge.arcLength;
      setMetrics({
        lengthA: stationaryEdge.arcLength,
        lengthB: mobileEdge.arcLength,
        delta,
        easePercent: stationaryEdge.arcLength > 0 ? (delta / stationaryEdge.arcLength) * 100 : 0,
        walkPosition: 0,
      });
    } else {
      setMismatchSamples([]);
      setMetrics(null);
    }
  }, [stationaryEdge, mobileEdge, tolerance]);

  const formatDistance = useCallback((mm: number): string => {
    return formatDimension(mm, units);
  }, [units]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  const trySnap = useCallback((pt: Point2D) => {
    let best: { point: Point2D; pieceId: string; segmentIndex: number } | null = null;
    let bestDist = Infinity;
    for (const piece of pieces) {
      if (!piece.outline?.length) continue;
      const result = snapToOutline(pt, piece, zoom);
      if (result) {
        const d = Math.hypot(pt.x - result.point.x, pt.y - result.point.y);
        if (d < bestDist) { bestDist = d; best = result; }
      }
    }
    return best;
  }, [pieces, zoom]);

  const resolveEdge = useCallback((snap: { pieceId: string; segmentIndex: number }): WalkSeamEdge | null => {
    const piece = pieces.find(p => p.id === snap.pieceId);
    if (!piece) return null;
    const edge = findEdgeForSegment(piece, snap.segmentIndex);
    if (!edge) return null; // require semantic edges for walk seam
    const arcLength = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
    return { pieceId: piece.id, piece, edge, arcLength };
  }, [pieces]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    if (!snap) return;

    const clickedEdge = resolveEdge(snap);
    if (!clickedEdge) return;

    if (!stationaryEdgeRef.current) {
      // First click — set stationary edge
      setStationaryEdge(clickedEdge);

      // Auto-discover: look for seam pairing
      const seamResult = findSeamForEdge(clickedEdge.pieceId, clickedEdge.edge.name, seams);
      if (seamResult && !e.shiftKey) {
        const pairedPiece = pieces.find(p => p.id === seamResult.pairedPieceId);
        if (pairedPiece) {
          const pairedEdge = pairedPiece.edges?.find(ed => ed.name === seamResult.pairedEdgeName);
          if (pairedEdge) {
            const arcLength = computePathArcLength(pairedPiece.outline, pairedEdge.segmentRange[0], pairedEdge.segmentRange[1]);
            setMobileEdge({ pieceId: pairedPiece.id, piece: pairedPiece, edge: pairedEdge, arcLength });
            return;
          }
        }
      }
      // If no auto-discover or Shift held, wait for second click
      setMobileEdge(null);
    } else if (!mobileEdgeRef.current) {
      // Second click — set mobile edge (manual mode)
      setMobileEdge(clickedEdge);
    }
    // If both are set, clicking again resets
    else {
      setStationaryEdge(clickedEdge);
      setMobileEdge(null);
      setWalkDistance(0);
      setGhostTransform(null);
    }
  }, [toPattern, trySnap, resolveEdge, seams, pieces]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnapPoint(snap ? snap.point : null);

    const sEdge = stationaryEdgeRef.current;
    const mEdge = mobileEdgeRef.current;
    if (sEdge && mEdge) {
      // Compute walk distance along stationary edge
      const localPt = {
        x: rawPt.x - sEdge.piece.position.x,
        y: rawPt.y - sEdge.piece.position.y,
      };
      // Use distanceAlongPath for precise projection
      const { distanceAlongPath } = require('../../utils/geometry/arcLength');
      const d = distanceAlongPath(
        sEdge.piece.outline, localPt,
        sEdge.edge.segmentRange[0], sEdge.edge.segmentRange[1],
      );
      setWalkDistance(d);

      // Update ghost transform
      const transform = computeGhostTransform(
        sEdge.piece.outline, sEdge.edge.segmentRange, sEdge.piece.position,
        mEdge.piece.outline, mEdge.edge.segmentRange, mEdge.piece.position,
        d,
      );
      setGhostTransform(transform);

      // Update walk position in metrics
      setMetrics(prev => prev ? { ...prev, walkPosition: d } : null);
    }
  }, [toPattern, trySnap]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (mobileEdgeRef.current) {
        setMobileEdge(null);
        setGhostTransform(null);
        setWalkDistance(0);
      } else if (stationaryEdgeRef.current) {
        setStationaryEdge(null);
      }
    }
  }, []);

  const getCursor = useCallback((): string => 'crosshair', []);

  const reset = useCallback(() => {
    setStationaryEdge(null);
    setMobileEdge(null);
    setWalkDistance(0);
    setHoveredSnapPoint(null);
    setGhostTransform(null);
    setMismatchSamples([]);
    setMetrics(null);
  }, []);

  const clear = reset;

  return {
    stationaryEdge,
    mobileEdge,
    walkDistance,
    hoveredSnapPoint,
    ghostTransform,
    ghostOpacity,
    mismatchSamples,
    metrics,
    formatDistance,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp: useCallback(() => {}, []),
    handleKeyDown,
    getCursor,
    reset,
    clear,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts 2>&1 | tail -15`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/components/PatternEditor/useWalkSeamTool.ts src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts
git commit -m "feat(walkSeam): add useWalkSeamTool hook with pure helpers and tests (#254)"
```

---

## Task 5: Create `WalkSeamOverlay` component

**Files:**
- Create: `src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx`

**Step 1: Create the overlay**

Create `src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx`:

```tsx
import type { Point2D, PatternPiece } from '../../../../types/types';
import type { WalkSeamEdge, GhostTransform, MismatchSample, WalkSeamMetrics } from '../../useWalkSeamTool';
import { pathToSVG } from '../../utils';
import { pointAtPathDistance } from '../../../../utils/geometry/arcLength';

interface WalkSeamOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  stationaryEdge: WalkSeamEdge | null;
  mobileEdge: WalkSeamEdge | null;
  walkDistance: number;
  ghostTransform: GhostTransform | null;
  ghostOpacity: number;
  mismatchSamples: MismatchSample[];
  metrics: WalkSeamMetrics | null;
  formatDistance: (d: number) => string;
  hoveredSnapPoint: Point2D | null;
}

/** Average character width factor for Inter font at fontSize. */
const CHAR_W = 0.55;
const LABEL_PAD = 6;

const MISMATCH_COLORS = {
  green: '#4caf50',
  yellow: '#ff9800',
  red: '#f44336',
};

function MetricsPanel({ metrics, formatDistance, zoom2D, position }: {
  metrics: WalkSeamMetrics;
  formatDistance: (d: number) => string;
  zoom2D: number;
  position: Point2D;
}) {
  const fontSize = 10 / zoom2D;
  const lineH = 14 / zoom2D;
  const padX = LABEL_PAD / zoom2D;
  const lines = [
    `A: ${formatDistance(metrics.lengthA)}`,
    `B: ${formatDistance(metrics.lengthB)}`,
    `Δ: ${metrics.delta >= 0 ? '+' : ''}${formatDistance(metrics.delta)}`,
    `Ease: ${metrics.easePercent >= 0 ? '+' : ''}${metrics.easePercent.toFixed(1)}%`,
    `Walk: ${formatDistance(metrics.walkPosition)}`,
  ];
  const maxChars = Math.max(...lines.map(l => l.length));
  const boxW = maxChars * CHAR_W * fontSize + padX * 2;
  const boxH = lines.length * lineH + lineH * 0.5;

  return (
    <g transform={`translate(${position.x + 15 / zoom2D}, ${position.y - boxH / 2})`}>
      <rect
        x={0} y={0}
        width={boxW} height={boxH}
        rx={4 / zoom2D}
        fill="rgba(0,0,0,0.85)"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={padX} y={lineH * (i + 0.8)}
          fill="#fff"
          fontSize={fontSize}
          fontFamily="Inter, monospace"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function EdgeHighlight({ edge, zoom2D, color }: {
  edge: WalkSeamEdge;
  zoom2D: number;
  color: string;
}) {
  // Render the edge as a thick colored polyline
  const startPt = pointAtPathDistance(
    edge.piece.outline, 0,
    edge.edge.segmentRange[0], edge.edge.segmentRange[1],
  );
  const endPt = pointAtPathDistance(
    edge.piece.outline, edge.arcLength,
    edge.edge.segmentRange[0], edge.edge.segmentRange[1],
  );
  if (!startPt || !endPt) return null;

  // Sample at 3mm for smooth polyline
  const numSamples = Math.max(2, Math.ceil(edge.arcLength / 3));
  const pts: string[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const d = (i / numSamples) * edge.arcLength;
    const p = pointAtPathDistance(
      edge.piece.outline, d,
      edge.edge.segmentRange[0], edge.edge.segmentRange[1],
    );
    if (p) {
      pts.push(`${p.x + edge.piece.position.x},${p.y + edge.piece.position.y}`);
    }
  }

  return (
    <polyline
      points={pts.join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={3 / zoom2D}
      strokeLinecap="round"
    />
  );
}

function MismatchStripe({ samples, edge, zoom2D }: {
  samples: MismatchSample[];
  edge: WalkSeamEdge;
  zoom2D: number;
}) {
  if (samples.length < 2) return null;
  return (
    <g>
      {samples.slice(0, -1).map((s, i) => {
        const next = samples[i + 1];
        const p1 = { x: s.pointA.x + edge.piece.position.x, y: s.pointA.y + edge.piece.position.y };
        const p2 = { x: next.pointA.x + edge.piece.position.x, y: next.pointA.y + edge.piece.position.y };
        return (
          <line
            key={i}
            x1={p1.x} y1={p1.y}
            x2={p2.x} y2={p2.y}
            stroke={MISMATCH_COLORS[s.color]}
            strokeWidth={4 / zoom2D}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function GhostPiece({ piece, transform, opacity, zoom2D }: {
  piece: PatternPiece;
  transform: GhostTransform;
  opacity: number;
  zoom2D: number;
}) {
  return (
    <g
      opacity={opacity / 100}
      transform={`translate(${piece.position.x + transform.tx}, ${piece.position.y + transform.ty}) rotate(${transform.angleDeg}, ${transform.pivotX}, ${transform.pivotY})`}
    >
      <path
        d={pathToSVG(piece.outline)}
        fill="rgba(156, 39, 176, 0.08)"
        stroke="#9c27b0"
        strokeWidth={1.5 / zoom2D}
        strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
      />
    </g>
  );
}

function WalkIndicator({ stationaryEdge, walkDistance, zoom2D }: {
  stationaryEdge: WalkSeamEdge;
  walkDistance: number;
  zoom2D: number;
}) {
  const pt = pointAtPathDistance(
    stationaryEdge.piece.outline, walkDistance,
    stationaryEdge.edge.segmentRange[0], stationaryEdge.edge.segmentRange[1],
  );
  if (!pt) return null;
  const wx = pt.x + stationaryEdge.piece.position.x;
  const wy = pt.y + stationaryEdge.piece.position.y;
  return (
    <circle
      cx={wx} cy={wy}
      r={5 / zoom2D}
      fill="#ff5722"
      stroke="#fff"
      strokeWidth={1.5 / zoom2D}
    />
  );
}

export default function WalkSeamOverlay({
  zoom2D,
  stationaryEdge,
  mobileEdge,
  walkDistance,
  ghostTransform,
  ghostOpacity,
  mismatchSamples,
  metrics,
  formatDistance,
  hoveredSnapPoint,
}: WalkSeamOverlayProps) {
  // Phase 1: waiting for first click — show snap indicator
  if (!stationaryEdge) {
    return (
      <g className="walk-seam-overlay">
        {hoveredSnapPoint && (
          <circle
            cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
            r={4 / zoom2D}
            fill="rgba(255,87,34,0.8)"
            stroke="#fff"
            strokeWidth={1 / zoom2D}
          />
        )}
      </g>
    );
  }

  // Phase 2: stationary edge selected, waiting for mobile (or auto-discovered)
  if (!mobileEdge) {
    return (
      <g className="walk-seam-overlay">
        <EdgeHighlight edge={stationaryEdge} zoom2D={zoom2D} color="#2196f3" />
        {hoveredSnapPoint && (
          <circle
            cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
            r={4 / zoom2D}
            fill="rgba(255,87,34,0.8)"
            stroke="#fff"
            strokeWidth={1 / zoom2D}
          />
        )}
      </g>
    );
  }

  // Phase 3: both edges — full walk mode
  const walkPt = pointAtPathDistance(
    stationaryEdge.piece.outline, walkDistance,
    stationaryEdge.edge.segmentRange[0], stationaryEdge.edge.segmentRange[1],
  );
  const metricsPos = walkPt
    ? { x: walkPt.x + stationaryEdge.piece.position.x, y: walkPt.y + stationaryEdge.piece.position.y }
    : { x: 0, y: 0 };

  return (
    <g className="walk-seam-overlay">
      {/* Stationary edge highlight */}
      <EdgeHighlight edge={stationaryEdge} zoom2D={zoom2D} color="#2196f3" />

      {/* Mismatch color stripe on stationary edge */}
      <MismatchStripe samples={mismatchSamples} edge={stationaryEdge} zoom2D={zoom2D} />

      {/* Ghost piece */}
      {ghostTransform && (
        <GhostPiece
          piece={mobileEdge.piece}
          transform={ghostTransform}
          opacity={ghostOpacity}
          zoom2D={zoom2D}
        />
      )}

      {/* Walk position indicator */}
      <WalkIndicator stationaryEdge={stationaryEdge} walkDistance={walkDistance} zoom2D={zoom2D} />

      {/* Metrics panel */}
      {metrics && (
        <MetricsPanel
          metrics={metrics}
          formatDistance={formatDistance}
          zoom2D={zoom2D}
          position={metricsPos}
        />
      )}
    </g>
  );
}
```

**Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx
git commit -m "feat(walkSeam): create WalkSeamOverlay SVG component (#254)"
```

---

## Task 6: Wire into ToolOverlay

**Files:**
- Modify: `src/components/PatternEditor/renderers/ToolOverlay.tsx:1-250`

**Step 1: Add imports and props**

In `ToolOverlay.tsx`, add import after the existing overlay imports (after line 17):

```typescript
import TopstitchOverlay from './overlays/TopstitchOverlay';
import WalkSeamOverlay from './overlays/WalkSeamOverlay';
```

Add imports for walk seam types (after the useMeasureTool import, line 45):

```typescript
import type { Measurement, SelectedEdgeInfo, CurveComparison } from '../useMeasureTool';
import type { WalkSeamEdge, GhostTransform, MismatchSample, WalkSeamMetrics } from '../useWalkSeamTool';
```

Add walk seam props to `ToolOverlayProps` interface (after the topstitch props block, before the closing `}`):

```typescript
  // Walk Seam
  walkSeamStationaryEdge: WalkSeamEdge | null;
  walkSeamMobileEdge: WalkSeamEdge | null;
  walkSeamWalkDistance: number;
  walkSeamGhostTransform: GhostTransform | null;
  walkSeamGhostOpacity: number;
  walkSeamMismatchSamples: MismatchSample[];
  walkSeamMetrics: WalkSeamMetrics | null;
  walkSeamFormatDistance: (d: number) => string;
  walkSeamHoveredSnapPoint: Point2D | null;
```

**Step 2: Add conditional rendering**

After the TopstitchOverlay block (after line 247), add:

```tsx
      {activeTool === 'walkSeam' && (
        <WalkSeamOverlay
          zoom2D={zoom2D}
          pieces={pieces}
          stationaryEdge={props.walkSeamStationaryEdge}
          mobileEdge={props.walkSeamMobileEdge}
          walkDistance={props.walkSeamWalkDistance}
          ghostTransform={props.walkSeamGhostTransform}
          ghostOpacity={props.walkSeamGhostOpacity}
          mismatchSamples={props.walkSeamMismatchSamples}
          metrics={props.walkSeamMetrics}
          formatDistance={props.walkSeamFormatDistance}
          hoveredSnapPoint={props.walkSeamHoveredSnapPoint}
        />
      )}
```

**Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/components/PatternEditor/renderers/ToolOverlay.tsx
git commit -m "feat(walkSeam): wire WalkSeamOverlay into ToolOverlay (#254)"
```

---

## Task 7: Wire into PatternEditor

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`

**Step 1: Add import**

After the `useTopstitchTool` import (line 21):

```typescript
import { useTopstitchTool } from './useTopstitchTool';
import { useWalkSeamTool } from './useWalkSeamTool';
```

**Step 2: Initialize hook**

After line 94 (`const topstitchTool = ...`), add:

```typescript
  const walkSeamTool = useWalkSeamTool(zoom2D, pan2D);
```

**Step 3: Add to useEditorInteractions tools object**

In the `useEditorInteractions` call (line 184-186), add `walkSeamTool`:

```typescript
    { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern: editPatternTool, scissorsTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool })
```

**Step 4: Pass props to ToolOverlay**

In the `<ToolOverlay>` JSX (line 241-312), add after the topstitch props:

```tsx
            walkSeamStationaryEdge={walkSeamTool.stationaryEdge}
            walkSeamMobileEdge={walkSeamTool.mobileEdge}
            walkSeamWalkDistance={walkSeamTool.walkDistance}
            walkSeamGhostTransform={walkSeamTool.ghostTransform}
            walkSeamGhostOpacity={walkSeamTool.ghostOpacity}
            walkSeamMismatchSamples={walkSeamTool.mismatchSamples}
            walkSeamMetrics={walkSeamTool.metrics}
            walkSeamFormatDistance={walkSeamTool.formatDistance}
            walkSeamHoveredSnapPoint={walkSeamTool.hoveredSnapPoint}
```

**Step 5: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 6: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx
git commit -m "feat(walkSeam): wire useWalkSeamTool into PatternEditor (#254)"
```

---

## Task 8: Wire into useEditorInteractions

**Files:**
- Modify: `src/components/PatternEditor/useEditorInteractions.ts`

**Step 1: Add walkSeamTool to ToolHooks interface**

After the `topstitchTool` entry in the `ToolHooks` interface (line 151-157), add:

```typescript
  walkSeamTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
```

**Step 2: Destructure walkSeamTool**

At line 177, add `walkSeamTool` to the destructuring:

```typescript
  const { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern, scissorsTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool } = tools;
```

**Step 3: Add clear on tool switch**

After the `MEASURE_TOOL_IDS` clear effect (line 208-211), add:

```typescript
  useEffect(() => {
    if (activeTool !== 'walkSeam') walkSeamTool.reset();
  }, [activeTool, walkSeamTool.reset]);
```

**Step 4: Add keyboard handler registration**

In the keyboard handler `useEffect` (line 226-244), after the topstitch line (238), add:

```typescript
    if (activeTool === 'walkSeam') handlers.push(walkSeamTool.handleKeyDown);
```

And add `walkSeamTool.handleKeyDown` to the dependency array.

**Step 5: Add mouse event dispatch**

In `handleMouseDown` (line 278-329), after the topstitch dispatch (line 312), add:

```typescript
    if (activeTool === 'walkSeam') { walkSeamTool.handleMouseDown(e); return; }
```

In `handleMouseMove` (line 425-517), after the topstitch dispatch (line 516), add:

```typescript
    if (activeTool === 'walkSeam') walkSeamTool.handleMouseMove(e);
```

**Step 6: Add getCursor case**

In `getCursor()` (line 541-560), after the topstitch cases (line 556-557), add:

```typescript
      case 'walkSeam': return walkSeamTool.getCursor();
```

**Step 7: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 8: Commit**

```bash
git add src/components/PatternEditor/useEditorInteractions.ts
git commit -m "feat(walkSeam): wire walk seam into editor interactions (#254)"
```

---

## Task 9: Fix `require()` in hook — use static import

**Files:**
- Modify: `src/components/PatternEditor/useWalkSeamTool.ts`

**Step 1: Replace require with import**

The `handleMouseMove` callback uses `require('../../utils/geometry/arcLength')` which is wrong. Replace it with a static import at the top of the file.

The import `distanceAlongPath` should already be available from `arcLength.ts`. Add it to the existing import:

```typescript
import { computePathArcLength, pointAtPathDistance, distanceAlongPath } from '../../utils/geometry/arcLength';
```

Then in `handleMouseMove`, replace:

```typescript
      const { distanceAlongPath } = require('../../utils/geometry/arcLength');
```

with just using `distanceAlongPath` directly (it's already imported).

**Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/components/PatternEditor/useWalkSeamTool.ts
git commit -m "fix(walkSeam): replace require() with static import (#254)"
```

---

## Task 10: Add HintText support

**Files:**
- Modify: `src/components/PatternEditor/renderers/HintText.tsx`

**Step 1: Read HintText to understand pattern**

Read `src/components/PatternEditor/renderers/HintText.tsx` to see how hint text works for other tools.

**Step 2: Add walkSeam hint**

Add a case for `walkSeam` that shows contextual instructions:
- No edges selected: "Click an edge to start walking"
- Stationary edge only: "Click paired edge (or auto-discovered)"
- Both edges: "Hover to walk. Esc to reset."

**Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/components/PatternEditor/renderers/HintText.tsx
git commit -m "feat(walkSeam): add contextual hint text (#254)"
```

---

## Task 11: Full verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Zero errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Production build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit any remaining fixes**

If any step revealed issues, fix and commit.

---

## Summary of All Files

| # | File | Action |
|---|------|--------|
| 1 | `src/types/types.ts` | Add `walkSeam` to `Tool2D` |
| 2 | `src/tools/definitions/walkSeam.tsx` | Create tool definition |
| 2 | `src/tools/index.ts` | Import + register |
| 3 | `src/shortcuts/defaults.ts` | Add Shift+M shortcut |
| 4 | `src/components/PatternEditor/useWalkSeamTool.ts` | Create hook + helpers |
| 4 | `src/components/PatternEditor/__tests__/useWalkSeamTool.test.ts` | Create tests |
| 5 | `src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx` | Create overlay |
| 6 | `src/components/PatternEditor/renderers/ToolOverlay.tsx` | Add props + conditional |
| 7 | `src/components/PatternEditor/PatternEditor.tsx` | Wire hook + pass props |
| 8 | `src/components/PatternEditor/useEditorInteractions.ts` | Wire events + cursor |
| 9 | `src/components/PatternEditor/useWalkSeamTool.ts` | Fix require → import |
| 10 | `src/components/PatternEditor/renderers/HintText.tsx` | Add hint text |
