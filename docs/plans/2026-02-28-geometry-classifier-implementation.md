# Geometry Classifier Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a geometry classifier that analyzes PathCommand[] outlines to detect segment curvature, calculate ratios, and map edges to anatomical landmarks.

**Architecture:** Pure functions in `src/copilot/vision/geometryClassifier.ts`. Takes PathCommand[] as input, outputs GeometricFingerprint. Uses vector math to calculate curvature direction (cross product sign determines convex/concave). Landmark detection uses heuristics based on position, curvature, and relative lengths.

**Tech Stack:** TypeScript, Vitest, existing PathCommand types

---

## Task 1: Create Segment Analysis Functions

**Files:**
- Create: `src/copilot/vision/geometryClassifier.ts`
- Create: `src/copilot/vision/__tests__/geometryClassifier.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/vision/__tests__/geometryClassifier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifySegment, extractSegments } from '../geometryClassifier';
import type { PathCommand } from '../../../types/types';

describe('Geometry Classifier - Segment Analysis', () => {
  it('should classify a straight line segment', () => {
    // L command = straight line
    const segment: PathCommand = { type: 'L', values: [100, 0] };
    const prevPoint = { x: 0, y: 0 };
    const result = classifySegment(segment, prevPoint);
    expect(result.type).toBe('straight');
    expect(result.length).toBeCloseTo(100);
  });

  it('should classify a convex curve (bulging outward)', () => {
    // C command with control points above the line = convex (viewed from outside)
    const segment: PathCommand = { type: 'C', values: [25, -20, 75, -20, 100, 0] };
    const prevPoint = { x: 0, y: 0 };
    const result = classifySegment(segment, prevPoint);
    expect(result.type).toBe('convex');
  });

  it('should classify a concave curve (bulging inward)', () => {
    // C command with control points below the line = concave
    const segment: PathCommand = { type: 'C', values: [25, 20, 75, 20, 100, 0] };
    const prevPoint = { x: 0, y: 0 };
    const result = classifySegment(segment, prevPoint);
    expect(result.type).toBe('concave');
  });

  it('should extract all segments from an outline', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ];
    const segments = extractSegments(outline);
    expect(segments).toHaveLength(4); // 3 L commands + closing Z
    expect(segments[0].type).toBe('straight');
    expect(segments[1].type).toBe('straight');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: FAIL with "Cannot find module '../geometryClassifier'"

**Step 3: Write minimal implementation**

Create `src/copilot/vision/geometryClassifier.ts`:

```typescript
/**
 * Geometry Classifier — Analyzes pattern piece outlines for semantic understanding.
 *
 * Provides functions to:
 * - Classify edge segments as straight/convex/concave
 * - Calculate length ratios between segments
 * - Detect anatomical landmarks (neckline, armhole, etc.)
 *
 * @module copilot/vision/geometryClassifier
 */

import type { PathCommand, Point2D } from '../../types/types';
import type { SegmentType, SemanticLandmark, GeometricFingerprint, LandmarkLabel } from './types';

// ─── Segment Classification ─────────────────────────────────────────────────

/**
 * Result of classifying a single segment.
 */
export interface SegmentInfo {
  /** Segment type based on curvature */
  type: SegmentType;
  /** Length of the segment in mm */
  length: number;
  /** Start point */
  start: Point2D;
  /** End point */
  end: Point2D;
  /** Original path command index */
  commandIndex: number;
}

/**
 * Calculate the length of a line segment.
 */
function lineLength(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Approximate the length of a cubic bezier curve using sampling.
 */
function bezierLength(p0: Point2D, cp1: Point2D, cp2: Point2D, p3: Point2D, samples = 20): number {
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const x = mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p3.x;
    const y = mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p3.y;
    length += lineLength(prev, { x, y });
    prev = { x, y };
  }
  return length;
}

/**
 * Determine if a bezier curve is convex or concave using cross product.
 * Positive cross product = convex (bulging left of travel direction)
 * Negative cross product = concave (bulging right of travel direction)
 */
function classifyBezierCurvature(p0: Point2D, cp1: Point2D, cp2: Point2D, p3: Point2D): SegmentType {
  // Vector from start to end
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;

  // Average control point offset from the line
  const midCp = { x: (cp1.x + cp2.x) / 2, y: (cp1.y + cp2.y) / 2 };
  const midLine = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };

  // Cross product to determine which side the curve bulges
  const cpOffsetX = midCp.x - midLine.x;
  const cpOffsetY = midCp.y - midLine.y;
  const cross = dx * cpOffsetY - dy * cpOffsetX;

  // If curve is nearly flat, classify as straight
  const offset = Math.sqrt(cpOffsetX * cpOffsetX + cpOffsetY * cpOffsetY);
  const lineLen = Math.sqrt(dx * dx + dy * dy);
  if (offset < lineLen * 0.05) return 'straight';

  // In pattern coordinates (Y down), positive cross = convex outward
  return cross > 0 ? 'convex' : 'concave';
}

/**
 * Classify a single path segment.
 */
export function classifySegment(
  cmd: PathCommand,
  prevPoint: Point2D,
  commandIndex = 0,
): SegmentInfo {
  let type: SegmentType = 'straight';
  let length = 0;
  let end: Point2D = prevPoint;

  switch (cmd.type) {
    case 'L':
      end = { x: cmd.values[0], y: cmd.values[1] };
      length = lineLength(prevPoint, end);
      type = 'straight';
      break;

    case 'H':
      end = { x: cmd.values[0], y: prevPoint.y };
      length = Math.abs(cmd.values[0] - prevPoint.x);
      type = 'straight';
      break;

    case 'V':
      end = { x: prevPoint.x, y: cmd.values[0] };
      length = Math.abs(cmd.values[0] - prevPoint.y);
      type = 'straight';
      break;

    case 'C': {
      const cp1 = { x: cmd.values[0], y: cmd.values[1] };
      const cp2 = { x: cmd.values[2], y: cmd.values[3] };
      end = { x: cmd.values[4], y: cmd.values[5] };
      length = bezierLength(prevPoint, cp1, cp2, end);
      type = classifyBezierCurvature(prevPoint, cp1, cp2, end);
      break;
    }

    case 'Q': {
      // Quadratic bezier - convert to cubic for analysis
      const cp = { x: cmd.values[0], y: cmd.values[1] };
      end = { x: cmd.values[2], y: cmd.values[3] };
      const cp1 = { x: prevPoint.x + (2 / 3) * (cp.x - prevPoint.x), y: prevPoint.y + (2 / 3) * (cp.y - prevPoint.y) };
      const cp2 = { x: end.x + (2 / 3) * (cp.x - end.x), y: end.y + (2 / 3) * (cp.y - end.y) };
      length = bezierLength(prevPoint, cp1, cp2, end);
      type = classifyBezierCurvature(prevPoint, cp1, cp2, end);
      break;
    }

    case 'Z':
      // Closing segment - handled specially in extractSegments
      break;

    default:
      // M and others don't create segments
      break;
  }

  return {
    type,
    length,
    start: prevPoint,
    end,
    commandIndex,
  };
}

/**
 * Extract all segments from a closed outline.
 */
export function extractSegments(outline: PathCommand[]): SegmentInfo[] {
  const segments: SegmentInfo[] = [];
  if (outline.length === 0) return segments;

  // Find starting point
  let startPoint: Point2D | null = null;
  let currentPoint: Point2D = { x: 0, y: 0 };

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];

    if (cmd.type === 'M') {
      startPoint = { x: cmd.values[0], y: cmd.values[1] };
      currentPoint = startPoint;
      continue;
    }

    if (cmd.type === 'Z' && startPoint) {
      // Closing segment back to start
      if (lineLength(currentPoint, startPoint) > 0.1) {
        segments.push({
          type: 'straight',
          length: lineLength(currentPoint, startPoint),
          start: currentPoint,
          end: startPoint,
          commandIndex: i,
        });
      }
      continue;
    }

    const segment = classifySegment(cmd, currentPoint, i);
    if (segment.length > 0.1) {
      segments.push(segment);
    }
    currentPoint = segment.end;
  }

  return segments;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/geometryClassifier.ts src/copilot/vision/__tests__/geometryClassifier.test.ts
git commit -m "feat(vision): add segment classification functions

- classifySegment for curvature detection
- extractSegments for outline analysis
- bezierLength for curve measurement

Part of #181"
```

---

## Task 2: Add Ratio Calculation Functions

**Files:**
- Modify: `src/copilot/vision/geometryClassifier.ts`
- Modify: `src/copilot/vision/__tests__/geometryClassifier.test.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/geometryClassifier.test.ts`:

```typescript
import { calculateRatios, calculateCurvatureDensity } from '../geometryClassifier';

describe('Geometry Classifier - Ratio Analysis', () => {
  it('should calculate segment length ratios', () => {
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 100, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, commandIndex: 1 },
      { type: 'concave', length: 50, start: { x: 100, y: 0 }, end: { x: 100, y: 50 }, commandIndex: 2 },
      { type: 'straight', length: 100, start: { x: 100, y: 50 }, end: { x: 0, y: 50 }, commandIndex: 3 },
      { type: 'straight', length: 50, start: { x: 0, y: 50 }, end: { x: 0, y: 0 }, commandIndex: 4 },
    ];

    const ratios = calculateRatios(segments);

    // Longest to total perimeter
    expect(ratios.longestToPerimeter).toBeCloseTo(100 / 300);
    // First to second segment
    expect(ratios.seg0ToSeg1).toBeCloseTo(100 / 50);
  });

  it('should calculate curvature density', () => {
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 100, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, commandIndex: 1 },
      { type: 'convex', length: 50, start: { x: 100, y: 0 }, end: { x: 100, y: 50 }, commandIndex: 2 },
      { type: 'straight', length: 100, start: { x: 100, y: 50 }, end: { x: 0, y: 50 }, commandIndex: 3 },
      { type: 'concave', length: 50, start: { x: 0, y: 50 }, end: { x: 0, y: 0 }, commandIndex: 4 },
    ];

    const density = calculateCurvatureDensity(segments);
    // 100 curved out of 300 total = 0.333
    expect(density).toBeCloseTo(100 / 300, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: FAIL with "calculateRatios is not a function"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/geometryClassifier.ts`:

```typescript
// ─── Ratio Analysis ─────────────────────────────────────────────────────────

/**
 * Calculate length ratios between segments.
 */
export function calculateRatios(segments: SegmentInfo[]): Record<string, number> {
  const ratios: Record<string, number> = {};
  if (segments.length === 0) return ratios;

  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
  const longestSegment = Math.max(...segments.map(s => s.length));

  ratios.longestToPerimeter = longestSegment / totalLength;
  ratios.totalPerimeter = totalLength;

  // Calculate adjacent segment ratios
  for (let i = 0; i < segments.length - 1; i++) {
    const ratio = segments[i].length / segments[i + 1].length;
    ratios[`seg${i}ToSeg${i + 1}`] = ratio;
  }

  // Group by type and calculate type ratios
  const straightLength = segments.filter(s => s.type === 'straight').reduce((sum, s) => sum + s.length, 0);
  const curvedLength = totalLength - straightLength;

  ratios.straightToCurved = curvedLength > 0 ? straightLength / curvedLength : Infinity;

  return ratios;
}

/**
 * Calculate the fraction of the outline that is curved (0-1).
 */
export function calculateCurvatureDensity(segments: SegmentInfo[]): number {
  if (segments.length === 0) return 0;

  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
  const curvedLength = segments
    .filter(s => s.type !== 'straight')
    .reduce((sum, s) => sum + s.length, 0);

  return totalLength > 0 ? curvedLength / totalLength : 0;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add ratio calculation functions

- calculateRatios for segment length analysis
- calculateCurvatureDensity for curved proportion

Part of #181"
```

---

## Task 3: Add Landmark Detection Heuristics

**Files:**
- Modify: `src/copilot/vision/geometryClassifier.ts`
- Modify: `src/copilot/vision/__tests__/geometryClassifier.test.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/geometryClassifier.test.ts`:

```typescript
import { detectLandmarks } from '../geometryClassifier';

describe('Geometry Classifier - Landmark Detection', () => {
  it('should detect neckline from concave curve at top', () => {
    // Simulated bodice front shape: neckline is concave at top-center
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 30, start: { x: 0, y: 100 }, end: { x: 0, y: 70 }, commandIndex: 1 },  // center front
      { type: 'concave', length: 20, start: { x: 0, y: 70 }, end: { x: 20, y: 60 }, commandIndex: 2 },   // neckline
      { type: 'straight', length: 15, start: { x: 20, y: 60 }, end: { x: 35, y: 55 }, commandIndex: 3 }, // shoulder
      { type: 'concave', length: 25, start: { x: 35, y: 55 }, end: { x: 40, y: 80 }, commandIndex: 4 },  // armhole
      { type: 'straight', length: 50, start: { x: 40, y: 80 }, end: { x: 35, y: 130 }, commandIndex: 5 },// side seam
      { type: 'straight', length: 35, start: { x: 35, y: 130 }, end: { x: 0, y: 130 }, commandIndex: 6 }, // hemline
    ];

    const landmarks = detectLandmarks(segments);

    // Should detect neckline
    const neckline = landmarks.find(l => l.label === 'neckline');
    expect(neckline).toBeDefined();
    expect(neckline?.edgeIndex).toBe(2); // The concave curve at top
    expect(neckline?.confidence).toBeGreaterThan(0.5);
  });

  it('should detect armhole from concave curve on side', () => {
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 30, start: { x: 0, y: 100 }, end: { x: 0, y: 70 }, commandIndex: 1 },
      { type: 'concave', length: 20, start: { x: 0, y: 70 }, end: { x: 20, y: 60 }, commandIndex: 2 },
      { type: 'straight', length: 15, start: { x: 20, y: 60 }, end: { x: 35, y: 55 }, commandIndex: 3 },
      { type: 'concave', length: 25, start: { x: 35, y: 55 }, end: { x: 40, y: 80 }, commandIndex: 4 },
      { type: 'straight', length: 50, start: { x: 40, y: 80 }, end: { x: 35, y: 130 }, commandIndex: 5 },
      { type: 'straight', length: 35, start: { x: 35, y: 130 }, end: { x: 0, y: 130 }, commandIndex: 6 },
    ];

    const landmarks = detectLandmarks(segments);

    const armhole = landmarks.find(l => l.label === 'armhole');
    expect(armhole).toBeDefined();
    expect(armhole?.edgeIndex).toBe(4); // The concave curve on side
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: FAIL with "detectLandmarks is not a function"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/geometryClassifier.ts`:

```typescript
// ─── Landmark Detection ─────────────────────────────────────────────────────

/**
 * Calculate bounding box of segments.
 */
function getBoundingBox(segments: SegmentInfo[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (segments.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const seg of segments) {
    minX = Math.min(minX, seg.start.x, seg.end.x);
    maxX = Math.max(maxX, seg.start.x, seg.end.x);
    minY = Math.min(minY, seg.start.y, seg.end.y);
    maxY = Math.max(maxY, seg.start.y, seg.end.y);
  }

  return { minX, maxX, minY, maxY };
}

/**
 * Determine relative position of a segment within the piece.
 */
function getSegmentPosition(seg: SegmentInfo, bbox: { minX: number; maxX: number; minY: number; maxY: number }): {
  horizontal: 'left' | 'center' | 'right';
  vertical: 'top' | 'middle' | 'bottom';
} {
  const midX = (seg.start.x + seg.end.x) / 2;
  const midY = (seg.start.y + seg.end.y) / 2;
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  const relX = (midX - bbox.minX) / width;
  const relY = (midY - bbox.minY) / height;

  return {
    horizontal: relX < 0.33 ? 'left' : relX > 0.67 ? 'right' : 'center',
    vertical: relY < 0.33 ? 'top' : relY > 0.67 ? 'bottom' : 'middle',
  };
}

/**
 * Detect anatomical landmarks from segment characteristics.
 */
export function detectLandmarks(segments: SegmentInfo[]): SemanticLandmark[] {
  const landmarks: SemanticLandmark[] = [];
  if (segments.length === 0) return landmarks;

  const bbox = getBoundingBox(segments);
  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);

  for (const seg of segments) {
    const pos = getSegmentPosition(seg, bbox);
    const relativeLength = seg.length / totalLength;
    let label: LandmarkLabel = 'unknown';
    let confidence = 0;

    // Neckline: concave curve at top-center
    if (seg.type === 'concave' && pos.vertical === 'top' && pos.horizontal !== 'right') {
      label = 'neckline';
      confidence = 0.8;
      if (relativeLength < 0.15) confidence += 0.1; // Necklines are typically short
    }

    // Armhole: concave curve at top-right or middle-right
    else if (seg.type === 'concave' && pos.horizontal === 'right' && pos.vertical !== 'bottom') {
      label = 'armhole';
      confidence = 0.75;
      if (relativeLength > 0.05 && relativeLength < 0.2) confidence += 0.1;
    }

    // Shoulder: straight segment at top between neckline and armhole
    else if (seg.type === 'straight' && pos.vertical === 'top' && pos.horizontal === 'right') {
      label = 'shoulder';
      confidence = 0.7;
      if (relativeLength < 0.1) confidence += 0.1;
    }

    // Side seam: straight segment on the right side, vertical
    else if (seg.type === 'straight' && pos.horizontal === 'right' && pos.vertical === 'middle') {
      const isVertical = Math.abs(seg.end.x - seg.start.x) < Math.abs(seg.end.y - seg.start.y);
      if (isVertical) {
        label = 'side_seam';
        confidence = 0.7;
      }
    }

    // Hemline: straight segment at bottom
    else if (seg.type === 'straight' && pos.vertical === 'bottom') {
      const isHorizontal = Math.abs(seg.end.x - seg.start.x) > Math.abs(seg.end.y - seg.start.y);
      if (isHorizontal) {
        label = 'hemline';
        confidence = 0.8;
      }
    }

    // Center front/back: straight vertical segment on left
    else if (seg.type === 'straight' && pos.horizontal === 'left') {
      const isVertical = Math.abs(seg.end.x - seg.start.x) < Math.abs(seg.end.y - seg.start.y);
      if (isVertical) {
        label = 'center_front';
        confidence = 0.6;
      }
    }

    if (label !== 'unknown' && confidence > 0.5) {
      landmarks.push({
        edgeIndex: seg.commandIndex,
        label,
        confidence,
        curvatureType: seg.type,
      });
    }
  }

  return landmarks;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add landmark detection heuristics

- detectLandmarks for anatomical edge labeling
- Position-based heuristics for neckline, armhole, shoulder
- Confidence scoring based on shape and location

Part of #181"
```

---

## Task 4: Add Main Fingerprint Generation Function

**Files:**
- Modify: `src/copilot/vision/geometryClassifier.ts`
- Modify: `src/copilot/vision/__tests__/geometryClassifier.test.ts`
- Modify: `src/copilot/vision/index.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/geometryClassifier.test.ts`:

```typescript
import { generateFingerprint } from '../geometryClassifier';
import type { GeometricFingerprint } from '../types';

describe('Geometry Classifier - Fingerprint Generation', () => {
  it('should generate complete fingerprint from outline', () => {
    // Simple rectangle
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ];

    const fingerprint = generateFingerprint('piece-1', outline);

    expect(fingerprint.pieceId).toBe('piece-1');
    expect(fingerprint.segmentTypes).toHaveLength(4);
    expect(fingerprint.segmentTypes.every(t => t === 'straight')).toBe(true);
    expect(fingerprint.curvatureDensity).toBe(0);
    expect(fingerprint.ratios.totalPerimeter).toBeCloseTo(300);
  });

  it('should detect landmarks in bodice-like shape', () => {
    // Simplified bodice front shape
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 100] },
      { type: 'L', values: [0, 70] },                                    // center front
      { type: 'C', values: [0, 60, 10, 55, 20, 55] },                   // neckline (concave)
      { type: 'L', values: [35, 50] },                                   // shoulder
      { type: 'C', values: [45, 50, 50, 60, 50, 80] },                  // armhole (concave)
      { type: 'L', values: [50, 130] },                                  // side seam
      { type: 'L', values: [0, 130] },                                   // hemline
      { type: 'Z', values: [] },
    ];

    const fingerprint = generateFingerprint('bodice-front', outline);

    expect(fingerprint.landmarks.length).toBeGreaterThan(0);
    expect(fingerprint.curvatureDensity).toBeGreaterThan(0);

    const labels = fingerprint.landmarks.map(l => l.label);
    expect(labels).toContain('neckline');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: FAIL with "generateFingerprint is not a function"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/geometryClassifier.ts`:

```typescript
// ─── Fingerprint Generation ─────────────────────────────────────────────────

/**
 * Generate a complete geometric fingerprint for a pattern piece.
 */
export function generateFingerprint(pieceId: string, outline: PathCommand[]): GeometricFingerprint {
  const segments = extractSegments(outline);
  const segmentTypes = segments.map(s => s.type);
  const ratios = calculateRatios(segments);
  const curvatureDensity = calculateCurvatureDensity(segments);
  const landmarks = detectLandmarks(segments);

  return {
    pieceId,
    segmentTypes,
    ratios,
    curvatureDensity,
    landmarks,
  };
}
```

**Step 4: Update index.ts exports**

Update `src/copilot/vision/index.ts` to add:

```typescript
// Geometry Classifier
export {
  classifySegment,
  extractSegments,
  calculateRatios,
  calculateCurvatureDensity,
  detectLandmarks,
  generateFingerprint,
} from './geometryClassifier';

export type { SegmentInfo } from './geometryClassifier';
```

**Step 5: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/geometryClassifier.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add fingerprint generation function

- generateFingerprint combines all analysis
- Export all classifier functions from index

Closes #181"
```

---

## Task 5: Run All Tests and Close Issue

**Step 1: Run full test suite**

```bash
npm test -- --run
```

Expected: All tests pass

**Step 2: Push changes**

```bash
git push origin main
```

**Step 3: Close issue**

```bash
gh issue close 181 --comment "Implemented Geometry Classifier:
- classifySegment: detects straight/convex/concave curvature
- extractSegments: parses PathCommand[] outline
- calculateRatios: segment length analysis
- calculateCurvatureDensity: curved proportion
- detectLandmarks: heuristic anatomical labeling
- generateFingerprint: complete piece analysis

All functions exported from src/copilot/vision/index.ts"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Segment classification | 4 |
| 2 | Ratio calculation | 2 |
| 3 | Landmark detection | 2 |
| 4 | Fingerprint generation | 2 |
| 5 | Final verification | - |

**Total new tests:** 10
**Files created:** 1 (`geometryClassifier.ts`)
**Files modified:** 2 (`index.ts`, `geometryClassifier.test.ts`)
