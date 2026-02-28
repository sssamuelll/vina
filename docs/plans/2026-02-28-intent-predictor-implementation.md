# Intent Predictor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a pre-flight sandbox that validates proposed geometry changes before applying them, with audit rules for area integrity, self-intersection, and seam compatibility.

**Architecture:** Pure functions in `src/copilot/vision/intentPredictor.ts`. Uses existing geometry utilities (computeArea, clean-pslg). Operates on deep clones to avoid state leakage. Returns structured audit results for LLM feedback.

**Tech Stack:** TypeScript, Vitest, existing geometry utils (flattenPath, computeArea, cleanPSLG)

---

## Task 1: Create Core Area Integrity Audit

**Files:**
- Create: `src/copilot/vision/intentPredictor.ts`
- Create: `src/copilot/vision/__tests__/intentPredictor.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/vision/__tests__/intentPredictor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkAreaIntegrity, type AreaCheckInput } from '../intentPredictor';
import type { PathCommand } from '@/types/types';

describe('Intent Predictor - Area Integrity', () => {
  const validSquare: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];

  const degenerateSquare: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 0] }, // Collinear points
    { type: 'L', values: [0, 0] },
    { type: 'Z', values: [] },
  ];

  it('should pass for valid polygon with positive area', () => {
    const result = checkAreaIntegrity({ outline: validSquare });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('area_integrity');
    expect(result.area).toBeGreaterThan(0);
  });

  it('should fail for degenerate polygon with zero area', () => {
    const result = checkAreaIntegrity({ outline: degenerateSquare });

    expect(result.passed).toBe(false);
    expect(result.rule).toBe('area_integrity');
    expect(result.message).toContain('zero');
  });

  it('should fail for polygon below minimum area threshold', () => {
    const tinySquare: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0.5, 0] },
      { type: 'L', values: [0.5, 0.5] },
      { type: 'L', values: [0, 0.5] },
      { type: 'Z', values: [] },
    ];

    const result = checkAreaIntegrity({ outline: tinySquare, minArea: 1 });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('below minimum');
  });

  it('should handle empty outline', () => {
    const result = checkAreaIntegrity({ outline: [] });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('empty');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/intentPredictor.test.ts`

**Step 3: Write minimal implementation**

Create `src/copilot/vision/intentPredictor.ts`:

```typescript
/**
 * Intent Predictor — Pre-flight simulation and geometric auditing.
 *
 * Responsibilities:
 * - Validate proposed geometry changes before applying
 * - Check area integrity, self-intersection, seam compatibility
 * - Return structured results for LLM self-correction
 *
 * @module copilot/vision/intentPredictor
 */

import type { PathCommand } from '@/types/types';
import type { AuditResult, AuditRuleType } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default minimum area threshold in mm² */
export const DEFAULT_MIN_AREA_MM2 = 1;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Extended audit result with computed area.
 */
export interface AreaAuditResult extends AuditResult {
  rule: 'area_integrity';
  /** Computed area in mm² */
  area?: number;
}

/**
 * Input for area integrity check.
 */
export interface AreaCheckInput {
  /** Piece outline to check */
  outline: PathCommand[];
  /** Minimum acceptable area in mm² (default: 1) */
  minArea?: number;
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────

/**
 * Flatten path commands to points for area calculation.
 * Simplified version that handles M, L, and Z commands.
 */
function flattenOutlineToPoints(outline: PathCommand[]): [number, number][] {
  const points: [number, number][] = [];

  for (const cmd of outline) {
    switch (cmd.type) {
      case 'M':
      case 'L':
        points.push([cmd.values[0], cmd.values[1]]);
        break;
      case 'H':
        if (points.length > 0) {
          points.push([cmd.values[0], points[points.length - 1][1]]);
        }
        break;
      case 'V':
        if (points.length > 0) {
          points.push([points[points.length - 1][0], cmd.values[0]]);
        }
        break;
      case 'C':
        // For cubic bezier, just use the endpoint
        points.push([cmd.values[4], cmd.values[5]]);
        break;
      case 'Q':
        // For quadratic bezier, just use the endpoint
        points.push([cmd.values[2], cmd.values[3]]);
        break;
      case 'Z':
        // Close path, no new points needed
        break;
    }
  }

  return points;
}

/**
 * Compute polygon area using the shoelace formula.
 * Returns absolute area (always positive).
 */
function computePolygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }

  return Math.abs(area / 2);
}

// ─── Area Integrity Check ───────────────────────────────────────────────────

/**
 * Check that a polygon has valid positive area.
 */
export function checkAreaIntegrity(input: AreaCheckInput): AreaAuditResult {
  const { outline, minArea = DEFAULT_MIN_AREA_MM2 } = input;

  // Empty outline check
  if (outline.length === 0) {
    return {
      rule: 'area_integrity',
      passed: false,
      message: 'Outline is empty',
    };
  }

  // Flatten and compute area
  const points = flattenOutlineToPoints(outline);
  const area = computePolygonArea(points);

  // Zero area check
  if (area === 0) {
    return {
      rule: 'area_integrity',
      passed: false,
      message: 'Polygon has zero area (degenerate or collinear points)',
      area: 0,
    };
  }

  // Minimum area check
  if (area < minArea) {
    return {
      rule: 'area_integrity',
      passed: false,
      message: `Area ${area.toFixed(2)}mm² is below minimum threshold of ${minArea}mm²`,
      area,
    };
  }

  return {
    rule: 'area_integrity',
    passed: true,
    area,
  };
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add src/copilot/vision/intentPredictor.ts src/copilot/vision/__tests__/intentPredictor.test.ts
git commit -m "feat(vision): add area integrity audit

- checkAreaIntegrity validates polygon has positive area
- Uses shoelace formula for area calculation
- Configurable minimum area threshold

Part of #185"
```

---

## Task 2: Add Self-Intersection Check

**Files:**
- Modify: `src/copilot/vision/intentPredictor.ts`
- Modify: `src/copilot/vision/__tests__/intentPredictor.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { checkSelfIntersection, type SelfIntersectionCheckInput } from '../intentPredictor';

describe('Intent Predictor - Self Intersection', () => {
  const nonIntersecting: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];

  const selfIntersecting: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [0, 100] }, // Crosses the first line
    { type: 'Z', values: [] },
  ];

  it('should pass for non-intersecting polygon', () => {
    const result = checkSelfIntersection({ outline: nonIntersecting });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('self_intersection');
  });

  it('should fail for self-intersecting polygon', () => {
    const result = checkSelfIntersection({ outline: selfIntersecting });

    expect(result.passed).toBe(false);
    expect(result.rule).toBe('self_intersection');
    expect(result.message).toContain('self-intersect');
  });

  it('should pass for simple triangle', () => {
    const triangle: PathCommand[] = [
      { type: 'M', values: [50, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];

    const result = checkSelfIntersection({ outline: triangle });

    expect(result.passed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `intentPredictor.ts`:

```typescript
/**
 * Extended audit result for self-intersection check.
 */
export interface SelfIntersectionAuditResult extends AuditResult {
  rule: 'self_intersection';
  /** Number of intersection points found */
  intersectionCount?: number;
}

/**
 * Input for self-intersection check.
 */
export interface SelfIntersectionCheckInput {
  /** Piece outline to check */
  outline: PathCommand[];
}

/**
 * Check if two line segments intersect.
 * Returns true if segments (p1,p2) and (p3,p4) cross each other.
 */
function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  // Cross product helper
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  // Check if segments straddle each other
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/**
 * Check that a polygon does not self-intersect.
 */
export function checkSelfIntersection(input: SelfIntersectionCheckInput): SelfIntersectionAuditResult {
  const { outline } = input;

  if (outline.length < 3) {
    return {
      rule: 'self_intersection',
      passed: true, // Not enough points to self-intersect
    };
  }

  const points = flattenOutlineToPoints(outline);
  const n = points.length;

  if (n < 4) {
    return {
      rule: 'self_intersection',
      passed: true, // Triangle can't self-intersect
    };
  }

  let intersectionCount = 0;

  // Check all non-adjacent segment pairs
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent segments
      if (j === (i + n - 1) % n) continue;
      if (i === 0 && j === n - 1) continue; // First and last are adjacent

      const p3 = points[j];
      const p4 = points[(j + 1) % n];

      if (segmentsIntersect(p1, p2, p3, p4)) {
        intersectionCount++;
      }
    }
  }

  if (intersectionCount > 0) {
    return {
      rule: 'self_intersection',
      passed: false,
      message: `Polygon has ${intersectionCount} self-intersection(s)`,
      intersectionCount,
    };
  }

  return {
    rule: 'self_intersection',
    passed: true,
    intersectionCount: 0,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add self-intersection audit

- checkSelfIntersection detects crossing edges
- Uses segment-segment intersection test
- Returns intersection count

Part of #185"
```

---

## Task 3: Add Seam Compatibility Check

**Files:**
- Modify: `src/copilot/vision/intentPredictor.ts`
- Modify: `src/copilot/vision/__tests__/intentPredictor.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { checkSeamCompatibility, type SeamCompatibilityInput } from '../intentPredictor';
import type { Seam } from '@/types/types';

describe('Intent Predictor - Seam Compatibility', () => {
  it('should pass when edge lengths match within tolerance', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 100,
      tolerance: 2,
    });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('seam_compatibility');
  });

  it('should pass when edge lengths are within tolerance', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 101.5,
      tolerance: 2,
    });

    expect(result.passed).toBe(true);
  });

  it('should fail when edge lengths differ beyond tolerance', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 110,
      tolerance: 2,
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('mismatch');
    expect(result.lengthDifference).toBe(10);
  });

  it('should use default tolerance of 5mm', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 104,
    });

    expect(result.passed).toBe(true); // Within default 5mm tolerance
  });

  it('should suggest easing when slightly off', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 107,
      tolerance: 5,
    });

    expect(result.passed).toBe(false);
    expect(result.suggestedFix).toContain('ease');
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `intentPredictor.ts`:

```typescript
// ─── Constants ──────────────────────────────────────────────────────────────

/** Default seam length tolerance in mm */
export const DEFAULT_SEAM_TOLERANCE_MM = 5;

/** Maximum easing percentage before suggesting alternative */
export const MAX_EASING_PERCENT = 10;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Extended audit result for seam compatibility.
 */
export interface SeamCompatibilityAuditResult extends AuditResult {
  rule: 'seam_compatibility';
  /** Difference in edge lengths (mm) */
  lengthDifference?: number;
  /** Percentage difference */
  percentageDiff?: number;
  /** Suggested fix if incompatible */
  suggestedFix?: string;
}

/**
 * Input for seam compatibility check.
 */
export interface SeamCompatibilityInput {
  /** Length of edge on piece A (mm) */
  pieceAEdgeLength: number;
  /** Length of edge on piece B (mm) */
  pieceBEdgeLength: number;
  /** Tolerance in mm (default: 5mm) */
  tolerance?: number;
}

// ─── Seam Compatibility Check ───────────────────────────────────────────────

/**
 * Check that two seam edges are compatible in length.
 */
export function checkSeamCompatibility(input: SeamCompatibilityInput): SeamCompatibilityAuditResult {
  const { pieceAEdgeLength, pieceBEdgeLength, tolerance = DEFAULT_SEAM_TOLERANCE_MM } = input;

  const lengthDifference = Math.abs(pieceAEdgeLength - pieceBEdgeLength);
  const averageLength = (pieceAEdgeLength + pieceBEdgeLength) / 2;
  const percentageDiff = averageLength > 0 ? (lengthDifference / averageLength) * 100 : 0;

  if (lengthDifference <= tolerance) {
    return {
      rule: 'seam_compatibility',
      passed: true,
      lengthDifference,
      percentageDiff,
    };
  }

  // Generate suggested fix
  let suggestedFix: string;
  if (percentageDiff <= MAX_EASING_PERCENT) {
    const longer = pieceAEdgeLength > pieceBEdgeLength ? 'A' : 'B';
    suggestedFix = `Consider easing piece ${longer} by ${lengthDifference.toFixed(1)}mm (${percentageDiff.toFixed(1)}%)`;
  } else {
    suggestedFix = `Edge lengths differ by ${percentageDiff.toFixed(1)}%. Consider adjusting pattern or using a different seam strategy.`;
  }

  return {
    rule: 'seam_compatibility',
    passed: false,
    message: `Seam edge length mismatch: ${pieceAEdgeLength.toFixed(1)}mm vs ${pieceBEdgeLength.toFixed(1)}mm (diff: ${lengthDifference.toFixed(1)}mm)`,
    lengthDifference,
    percentageDiff,
    suggestedFix,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add seam compatibility audit

- checkSeamCompatibility compares edge lengths
- Configurable tolerance (default 5mm)
- Suggests easing for small mismatches

Part of #185"
```

---

## Task 4: Add Sandbox Simulation

**Files:**
- Modify: `src/copilot/vision/intentPredictor.ts`
- Modify: `src/copilot/vision/__tests__/intentPredictor.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { simulateChange, type SimulationInput } from '../intentPredictor';
import type { PatternPiece } from '@/types/types';

describe('Intent Predictor - Sandbox Simulation', () => {
  const basePiece: PatternPiece = {
    id: 'piece-1',
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should pass all audits for valid change', () => {
    const result = simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [110, 0] },
        { type: 'L', values: [110, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });

    expect(result.isSafe).toBe(true);
    expect(result.auditResults.every(r => r.passed)).toBe(true);
  });

  it('should fail for degenerate change', () => {
    const result = simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 0] }, // Collapses to zero area
        { type: 'L', values: [0, 0] },
        { type: 'Z', values: [] },
      ],
    });

    expect(result.isSafe).toBe(false);
    expect(result.auditResults.some(r => r.rule === 'area_integrity' && !r.passed)).toBe(true);
  });

  it('should fail for self-intersecting change', () => {
    const result = simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });

    expect(result.isSafe).toBe(false);
    expect(result.auditResults.some(r => r.rule === 'self_intersection' && !r.passed)).toBe(true);
  });

  it('should not mutate original piece', () => {
    const originalOutline = JSON.stringify(basePiece.outline);

    simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 200] },
        { type: 'L', values: [0, 200] },
        { type: 'Z', values: [] },
      ],
    });

    expect(JSON.stringify(basePiece.outline)).toBe(originalOutline);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `intentPredictor.ts`:

```typescript
import type { PatternPiece } from '@/types/types';
import type { IntentPrediction } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Input for simulation.
 */
export interface SimulationInput {
  /** The piece being modified */
  piece: PatternPiece;
  /** Proposed new outline */
  proposedOutline: PathCommand[];
  /** Optional seam edges to check compatibility */
  seamEdgeLengths?: {
    pieceAEdgeLength: number;
    pieceBEdgeLength: number;
  };
}

/**
 * Result of a simulation run.
 */
export interface SimulationResult {
  /** Whether all audits passed */
  isSafe: boolean;
  /** Results of individual audits */
  auditResults: AuditResult[];
  /** The simulated piece (deep clone with changes applied) */
  simulatedPiece: PatternPiece;
  /** Suggested fixes for any failures */
  suggestedFixes: string[];
}

// ─── Sandbox Simulation ─────────────────────────────────────────────────────

/**
 * Deep clone a piece to avoid mutation.
 */
function clonePiece(piece: PatternPiece): PatternPiece {
  return JSON.parse(JSON.stringify(piece));
}

/**
 * Run pre-flight simulation of a proposed change.
 * Applies change to a clone and runs all audit checks.
 */
export function simulateChange(input: SimulationInput): SimulationResult {
  const { piece, proposedOutline, seamEdgeLengths } = input;

  // Create deep clone to avoid state mutation
  const simulatedPiece = clonePiece(piece);
  simulatedPiece.outline = proposedOutline;
  simulatedPiece.updatedAt = Date.now();

  const auditResults: AuditResult[] = [];
  const suggestedFixes: string[] = [];

  // Run area integrity check
  const areaResult = checkAreaIntegrity({ outline: proposedOutline });
  auditResults.push(areaResult);
  if (!areaResult.passed && areaResult.message) {
    suggestedFixes.push(`Area issue: ${areaResult.message}`);
  }

  // Run self-intersection check
  const intersectionResult = checkSelfIntersection({ outline: proposedOutline });
  auditResults.push(intersectionResult);
  if (!intersectionResult.passed && intersectionResult.message) {
    suggestedFixes.push(`Self-intersection issue: ${intersectionResult.message}`);
  }

  // Run seam compatibility check if edges provided
  if (seamEdgeLengths) {
    const seamResult = checkSeamCompatibility(seamEdgeLengths);
    auditResults.push(seamResult);
    if (!seamResult.passed) {
      if (seamResult.suggestedFix) {
        suggestedFixes.push(seamResult.suggestedFix);
      } else if (seamResult.message) {
        suggestedFixes.push(`Seam issue: ${seamResult.message}`);
      }
    }
  }

  const isSafe = auditResults.every(r => r.passed);

  return {
    isSafe,
    auditResults,
    simulatedPiece,
    suggestedFixes,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add sandbox simulation

- simulateChange runs pre-flight audits
- Works on deep clone to avoid state leakage
- Aggregates all audit results and suggested fixes

Part of #185"
```

---

## Task 5: Add LLM Feedback Formatting and Exports

**Files:**
- Modify: `src/copilot/vision/intentPredictor.ts`
- Modify: `src/copilot/vision/__tests__/intentPredictor.test.ts`
- Modify: `src/copilot/vision/index.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { formatAuditResultsForLLM, predictIntent, type IntentInput } from '../intentPredictor';
import type { AuditResult } from '../types';

describe('Intent Predictor - LLM Feedback', () => {
  it('should format passing results concisely', () => {
    const results: AuditResult[] = [
      { rule: 'area_integrity', passed: true },
      { rule: 'self_intersection', passed: true },
    ];

    const formatted = formatAuditResultsForLLM(results);

    expect(formatted).toContain('All checks passed');
  });

  it('should format failing results with details', () => {
    const results: AuditResult[] = [
      { rule: 'area_integrity', passed: false, message: 'Polygon has zero area' },
      { rule: 'self_intersection', passed: true },
    ];

    const formatted = formatAuditResultsForLLM(results);

    expect(formatted).toContain('FAILED');
    expect(formatted).toContain('area_integrity');
    expect(formatted).toContain('zero area');
  });

  it('should include suggested fixes', () => {
    const results: AuditResult[] = [
      { rule: 'seam_compatibility', passed: false, message: 'Length mismatch' },
    ];
    const fixes = ['Consider easing by 5mm'];

    const formatted = formatAuditResultsForLLM(results, fixes);

    expect(formatted).toContain('Suggested fixes');
    expect(formatted).toContain('easing');
  });
});

describe('Intent Predictor - Full Prediction', () => {
  const piece: PatternPiece = {
    id: 'test-piece',
    name: 'Test',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should return full IntentPrediction for valid change', () => {
    const prediction = predictIntent({
      toolName: 'resizePiece',
      piece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [120, 0] },
        { type: 'L', values: [120, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });

    expect(prediction.toolName).toBe('resizePiece');
    expect(prediction.originalPieceId).toBe('test-piece');
    expect(prediction.isSafe).toBe(true);
    expect(prediction.auditResults.length).toBeGreaterThan(0);
  });

  it('should include suggestedFix for unsafe change', () => {
    const prediction = predictIntent({
      toolName: 'collapsePiece',
      piece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [0, 0] },
        { type: 'L', values: [0, 0] },
        { type: 'Z', values: [] },
      ],
    });

    expect(prediction.isSafe).toBe(false);
    expect(prediction.suggestedFix).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `intentPredictor.ts`:

```typescript
// ─── LLM Feedback Formatting ────────────────────────────────────────────────

/**
 * Format audit results for inclusion in LLM context.
 */
export function formatAuditResultsForLLM(
  results: AuditResult[],
  suggestedFixes?: string[],
): string {
  const allPassed = results.every(r => r.passed);

  if (allPassed) {
    return '✓ All checks passed. The proposed change is safe to apply.';
  }

  const lines: string[] = ['## Pre-flight Audit Results', ''];

  for (const result of results) {
    const status = result.passed ? '✓ PASSED' : '✗ FAILED';
    lines.push(`- **${result.rule}**: ${status}`);
    if (!result.passed && result.message) {
      lines.push(`  - ${result.message}`);
    }
  }

  if (suggestedFixes && suggestedFixes.length > 0) {
    lines.push('');
    lines.push('### Suggested fixes:');
    for (const fix of suggestedFixes) {
      lines.push(`- ${fix}`);
    }
  }

  return lines.join('\n');
}

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Input for full intent prediction.
 */
export interface IntentInput {
  /** Name of the tool being called */
  toolName: string;
  /** The piece being modified */
  piece: PatternPiece;
  /** Proposed new outline */
  proposedOutline: PathCommand[];
  /** Optional seam edges to check compatibility */
  seamEdgeLengths?: {
    pieceAEdgeLength: number;
    pieceBEdgeLength: number;
  };
}

// ─── Main Prediction Function ───────────────────────────────────────────────

/**
 * Predict the outcome of a proposed tool call.
 * Returns a full IntentPrediction with safety assessment.
 */
export function predictIntent(input: IntentInput): IntentPrediction {
  const { toolName, piece, proposedOutline, seamEdgeLengths } = input;

  const simulation = simulateChange({
    piece,
    proposedOutline,
    seamEdgeLengths,
  });

  return {
    toolName,
    originalPieceId: piece.id,
    predictedChanges: {
      outlineChanged: true,
      newArea: (simulation.auditResults.find(r => r.rule === 'area_integrity') as AreaAuditResult)?.area,
    },
    isSafe: simulation.isSafe,
    auditResults: simulation.auditResults,
    suggestedFix: simulation.suggestedFixes.length > 0
      ? simulation.suggestedFixes.join('; ')
      : undefined,
  };
}
```

**Step 4: Update index.ts exports**

Add to `src/copilot/vision/index.ts`:

```typescript
// Intent Predictor
export {
  checkAreaIntegrity,
  checkSelfIntersection,
  checkSeamCompatibility,
  simulateChange,
  formatAuditResultsForLLM,
  predictIntent,
  DEFAULT_MIN_AREA_MM2,
  DEFAULT_SEAM_TOLERANCE_MM,
  MAX_EASING_PERCENT,
} from './intentPredictor';

export type {
  AreaAuditResult,
  AreaCheckInput,
  SelfIntersectionAuditResult,
  SelfIntersectionCheckInput,
  SeamCompatibilityAuditResult,
  SeamCompatibilityInput,
  SimulationInput,
  SimulationResult,
  IntentInput,
} from './intentPredictor';
```

**Step 5: Run all tests**

**Step 6: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add LLM feedback formatting and exports

- formatAuditResultsForLLM for LLM self-correction
- predictIntent returns full IntentPrediction
- Export all functions and types from index

Closes #185"
```

---

## Task 6: Run All Tests and Close Issue

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
gh issue close 185 --comment "Implemented Intent Predictor:

**Audit Rules:**
- \`checkAreaIntegrity\`: validates polygon has positive area (shoelace formula)
- \`checkSelfIntersection\`: detects crossing edges
- \`checkSeamCompatibility\`: compares edge lengths for sewing compatibility

**Sandbox Simulation:**
- \`simulateChange\`: runs pre-flight audits on deep clone
- Prevents state leakage by operating on copies

**LLM Integration:**
- \`formatAuditResultsForLLM\`: formats results for self-correction
- \`predictIntent\`: full prediction with safety assessment

All functions exported from src/copilot/vision/index.ts"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Area integrity check | 4 |
| 2 | Self-intersection check | 3 |
| 3 | Seam compatibility check | 5 |
| 4 | Sandbox simulation | 4 |
| 5 | LLM feedback + exports | 5 |
| 6 | Final verification | - |

**Total new tests:** 21
**Files created:** 1 (`intentPredictor.ts`)
**Files modified:** 2 (`index.ts`, `intentPredictor.test.ts`)
