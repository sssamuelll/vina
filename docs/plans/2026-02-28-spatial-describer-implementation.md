# Spatial Describer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a spatial describer that analyzes 3D piece positions to detect adjacency, overlaps, and conflicts between pattern pieces.

**Architecture:** Pure functions in `src/copilot/vision/spatialDescriber.ts`. Takes piece positions and seam data, outputs SpatialRelationship[] and SpatialConflict[]. Uses bounding box intersection for coarse phase, vertex distance for fine phase.

**Tech Stack:** TypeScript, Vitest, existing types from vision/types.ts

---

## Task 1: Create Core Distance Functions

**Files:**
- Create: `src/copilot/vision/spatialDescriber.ts`
- Create: `src/copilot/vision/__tests__/spatialDescriber.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/vision/__tests__/spatialDescriber.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { distance3D, computeBoundingBox3D, boundingBoxesOverlap } from '../spatialDescriber';

describe('Spatial Describer - Distance Functions', () => {
  it('should calculate 3D distance between two points', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    expect(distance3D(p1, p2)).toBeCloseTo(5);
  });

  it('should calculate 3D distance with z component', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 1, y: 2, z: 2 };
    expect(distance3D(p1, p2)).toBeCloseTo(3);
  });

  it('should compute bounding box from vertices', () => {
    // Flat array format: [x0,y0,z0, x1,y1,z1, ...]
    const vertices = new Float32Array([
      0, 0, 0,
      100, 0, 0,
      100, 50, 0,
      0, 50, 0,
    ]);
    const bbox = computeBoundingBox3D(vertices);
    expect(bbox.minX).toBe(0);
    expect(bbox.maxX).toBe(100);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxY).toBe(50);
    expect(bbox.minZ).toBe(0);
    expect(bbox.maxZ).toBe(0);
  });

  it('should detect overlapping bounding boxes', () => {
    const box1 = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const box2 = { minX: 5, maxX: 15, minY: 5, maxY: 15, minZ: 5, maxZ: 15 };
    expect(boundingBoxesOverlap(box1, box2)).toBe(true);
  });

  it('should detect non-overlapping bounding boxes', () => {
    const box1 = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const box2 = { minX: 20, maxX: 30, minY: 20, maxY: 30, minZ: 20, maxZ: 30 };
    expect(boundingBoxesOverlap(box1, box2)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/spatialDescriber.test.ts`
Expected: FAIL with "Cannot find module '../spatialDescriber'"

**Step 3: Write minimal implementation**

Create `src/copilot/vision/spatialDescriber.ts`:

```typescript
/**
 * Spatial Describer — Analyzes 3D positions of pattern pieces.
 *
 * Provides functions to:
 * - Calculate distances between pieces in 3D space
 * - Detect overlaps and collisions
 * - Identify spatial relationships (adjacent, overlapping, distant, sewn)
 *
 * @module copilot/vision/spatialDescriber
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A 3D point.
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * A 3D bounding box.
 */
export interface BoundingBox3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

// ─── Distance Functions ─────────────────────────────────────────────────────

/**
 * Calculate Euclidean distance between two 3D points.
 */
export function distance3D(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compute bounding box from flat vertex array.
 * Vertices are stored as [x0,y0,z0, x1,y1,z1, ...].
 */
export function computeBoundingBox3D(vertices: Float32Array): BoundingBox3D {
  if (vertices.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Check if two bounding boxes overlap.
 */
export function boundingBoxesOverlap(a: BoundingBox3D, b: BoundingBox3D): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/spatialDescriber.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/spatialDescriber.ts src/copilot/vision/__tests__/spatialDescriber.test.ts
git commit -m "feat(vision): add spatial distance functions

- distance3D for 3D point distance
- computeBoundingBox3D from vertex arrays
- boundingBoxesOverlap for coarse collision

Part of #182"
```

---

## Task 2: Add Minimum Distance Between Vertex Sets

**Files:**
- Modify: `src/copilot/vision/spatialDescriber.ts`
- Modify: `src/copilot/vision/__tests__/spatialDescriber.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { findMinimumDistance } from '../spatialDescriber';

describe('Spatial Describer - Vertex Distance', () => {
  it('should find minimum distance between two vertex sets', () => {
    // Two squares, 10 units apart
    const verticesA = new Float32Array([
      0, 0, 0,
      10, 0, 0,
      10, 10, 0,
      0, 10, 0,
    ]);
    const verticesB = new Float32Array([
      20, 0, 0,
      30, 0, 0,
      30, 10, 0,
      20, 10, 0,
    ]);

    const result = findMinimumDistance(verticesA, verticesB);
    expect(result.distance).toBeCloseTo(10);
    expect(result.indexA).toBeDefined();
    expect(result.indexB).toBeDefined();
  });

  it('should detect overlapping vertices (distance ~0)', () => {
    const verticesA = new Float32Array([0, 0, 0, 5, 5, 0]);
    const verticesB = new Float32Array([5, 5, 0, 10, 10, 0]);

    const result = findMinimumDistance(verticesA, verticesB);
    expect(result.distance).toBeCloseTo(0);
  });

  it('should handle empty vertex arrays', () => {
    const empty = new Float32Array([]);
    const vertices = new Float32Array([0, 0, 0]);

    const result = findMinimumDistance(empty, vertices);
    expect(result.distance).toBe(Infinity);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Append to `spatialDescriber.ts`:

```typescript
/**
 * Result of finding minimum distance between vertex sets.
 */
export interface MinDistanceResult {
  /** Minimum distance found */
  distance: number;
  /** Index of closest vertex in first set (vertex index, not array index) */
  indexA: number;
  /** Index of closest vertex in second set */
  indexB: number;
}

/**
 * Find minimum distance between two sets of vertices.
 * Uses brute force O(n*m) - suitable for small meshes.
 */
export function findMinimumDistance(
  verticesA: Float32Array,
  verticesB: Float32Array,
): MinDistanceResult {
  if (verticesA.length === 0 || verticesB.length === 0) {
    return { distance: Infinity, indexA: -1, indexB: -1 };
  }

  let minDist = Infinity;
  let minIndexA = -1;
  let minIndexB = -1;

  const numA = verticesA.length / 3;
  const numB = verticesB.length / 3;

  for (let i = 0; i < numA; i++) {
    const ax = verticesA[i * 3];
    const ay = verticesA[i * 3 + 1];
    const az = verticesA[i * 3 + 2];

    for (let j = 0; j < numB; j++) {
      const bx = verticesB[j * 3];
      const by = verticesB[j * 3 + 1];
      const bz = verticesB[j * 3 + 2];

      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < minDist * minDist) {
        minDist = Math.sqrt(distSq);
        minIndexA = i;
        minIndexB = j;
      }
    }
  }

  return { distance: minDist, indexA: minIndexA, indexB: minIndexB };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add minimum vertex distance function

- findMinimumDistance for fine-grained collision detection
- Returns closest vertex indices for debugging

Part of #182"
```

---

## Task 3: Add Piece Info Extraction

**Files:**
- Modify: `src/copilot/vision/spatialDescriber.ts`
- Modify: `src/copilot/vision/__tests__/spatialDescriber.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { extractPieceInfo, type PieceSpatialInfo } from '../spatialDescriber';

describe('Spatial Describer - Piece Info', () => {
  it('should extract spatial info from piece data', () => {
    const pieceId = 'piece-1';
    const vertices = new Float32Array([
      0, 0, 0,
      100, 0, 0,
      100, 50, 10,
      0, 50, 10,
    ]);
    const position: [number, number, number] = [10, 20, 30];

    const info = extractPieceInfo(pieceId, vertices, position);

    expect(info.pieceId).toBe('piece-1');
    expect(info.position).toEqual([10, 20, 30]);
    // Bounding box should be offset by position
    expect(info.worldBounds.minX).toBe(10); // 0 + 10
    expect(info.worldBounds.maxX).toBe(110); // 100 + 10
    expect(info.worldBounds.minY).toBe(20); // 0 + 20
    expect(info.worldBounds.maxY).toBe(70); // 50 + 20
    expect(info.worldBounds.minZ).toBe(30); // 0 + 30
    expect(info.worldBounds.maxZ).toBe(40); // 10 + 30
  });

  it('should store world-space vertices', () => {
    const vertices = new Float32Array([0, 0, 0, 10, 10, 10]);
    const position: [number, number, number] = [5, 5, 5];

    const info = extractPieceInfo('p1', vertices, position);

    // First vertex should be offset
    expect(info.worldVertices[0]).toBe(5);
    expect(info.worldVertices[1]).toBe(5);
    expect(info.worldVertices[2]).toBe(5);
    // Second vertex
    expect(info.worldVertices[3]).toBe(15);
    expect(info.worldVertices[4]).toBe(15);
    expect(info.worldVertices[5]).toBe(15);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Append to `spatialDescriber.ts`:

```typescript
/**
 * Spatial information for a single piece.
 */
export interface PieceSpatialInfo {
  /** Piece ID */
  pieceId: string;
  /** World-space position [x, y, z] */
  position: [number, number, number];
  /** Bounding box in world space */
  worldBounds: BoundingBox3D;
  /** Vertices transformed to world space */
  worldVertices: Float32Array;
}

/**
 * Extract spatial information from piece data.
 * Transforms local vertices to world space using position offset.
 */
export function extractPieceInfo(
  pieceId: string,
  localVertices: Float32Array,
  position: [number, number, number],
): PieceSpatialInfo {
  const [px, py, pz] = position;

  // Transform vertices to world space
  const worldVertices = new Float32Array(localVertices.length);
  for (let i = 0; i < localVertices.length; i += 3) {
    worldVertices[i] = localVertices[i] + px;
    worldVertices[i + 1] = localVertices[i + 1] + py;
    worldVertices[i + 2] = localVertices[i + 2] + pz;
  }

  // Compute world-space bounding box
  const worldBounds = computeBoundingBox3D(worldVertices);

  return {
    pieceId,
    position,
    worldBounds,
    worldVertices,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add piece spatial info extraction

- extractPieceInfo transforms vertices to world space
- Computes world-space bounding box

Part of #182"
```

---

## Task 4: Add Relationship Analysis

**Files:**
- Modify: `src/copilot/vision/spatialDescriber.ts`
- Modify: `src/copilot/vision/__tests__/spatialDescriber.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { analyzePieceRelationship } from '../spatialDescriber';
import type { SpatialRelationship } from '../types';

describe('Spatial Describer - Relationship Analysis', () => {
  it('should classify adjacent pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [12, 0, 0],
      worldBounds: { minX: 12, maxX: 22, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([12, 0, 0, 22, 0, 0, 22, 10, 0, 12, 10, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, false);

    expect(relationship.type).toBe('adjacent');
    expect(relationship.distance3D).toBeCloseTo(2);
    expect(relationship.hasSewingConnection).toBe(false);
  });

  it('should classify overlapping pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([5, 5, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([5, 5, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, false);

    expect(relationship.type).toBe('overlapping');
    expect(relationship.distance3D).toBeCloseTo(0);
  });

  it('should classify distant pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [100, 0, 0],
      worldBounds: { minX: 100, maxX: 110, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([100, 0, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, false);

    expect(relationship.type).toBe('distant');
    expect(relationship.distance3D).toBeCloseTo(100);
  });

  it('should classify sewn pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, true);

    expect(relationship.type).toBe('sewn');
    expect(relationship.hasSewingConnection).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Append to `spatialDescriber.ts`:

```typescript
import type { SpatialRelationship, SpatialRelationType } from './types';

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Distance below which pieces are considered overlapping (in mm) */
const OVERLAP_THRESHOLD = 1;

/** Distance below which pieces are considered adjacent (in mm) */
const ADJACENT_THRESHOLD = 10;

// ─── Relationship Analysis ──────────────────────────────────────────────────

/**
 * Analyze the spatial relationship between two pieces.
 */
export function analyzePieceRelationship(
  infoA: PieceSpatialInfo,
  infoB: PieceSpatialInfo,
  hasSewingConnection: boolean,
): SpatialRelationship {
  // If sewn, that takes precedence
  if (hasSewingConnection) {
    const { distance, indexA, indexB } = findMinimumDistance(
      infoA.worldVertices,
      infoB.worldVertices,
    );
    return {
      pieceAId: infoA.pieceId,
      pieceBId: infoB.pieceId,
      type: 'sewn',
      distance3D: distance,
      edgeAIndex: indexA,
      edgeBIndex: indexB,
      hasSewingConnection: true,
    };
  }

  // Find minimum distance between pieces
  const { distance, indexA, indexB } = findMinimumDistance(
    infoA.worldVertices,
    infoB.worldVertices,
  );

  // Classify based on distance
  let type: SpatialRelationType;
  if (distance < OVERLAP_THRESHOLD) {
    type = 'overlapping';
  } else if (distance < ADJACENT_THRESHOLD) {
    type = 'adjacent';
  } else {
    type = 'distant';
  }

  return {
    pieceAId: infoA.pieceId,
    pieceBId: infoB.pieceId,
    type,
    distance3D: distance,
    edgeAIndex: indexA,
    edgeBIndex: indexB,
    hasSewingConnection: false,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add relationship analysis

- analyzePieceRelationship classifies piece pairs
- Thresholds for overlap/adjacent/distant

Part of #182"
```

---

## Task 5: Add Main describeSpatialRelationships Function

**Files:**
- Modify: `src/copilot/vision/spatialDescriber.ts`
- Modify: `src/copilot/vision/__tests__/spatialDescriber.test.ts`
- Modify: `src/copilot/vision/index.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { describeSpatialRelationships, type SpatialDescriptionInput } from '../spatialDescriber';
import type { SpatialConflict } from '../types';

describe('Spatial Describer - Main Function', () => {
  it('should describe relationships between multiple pieces', () => {
    const input: SpatialDescriptionInput = {
      pieces: [
        { id: 'front', vertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]) },
        { id: 'back', vertices: new Float32Array([0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 10, 5]) },
      ],
      positions: {
        'front': [0, 0, 0],
        'back': [0, 0, 5],
      },
      seams: [],
    };

    const result = describeSpatialRelationships(input);

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].pieceAId).toBe('front');
    expect(result.relationships[0].pieceBId).toBe('back');
    expect(result.relationships[0].distance3D).toBeCloseTo(5);
    expect(result.relationships[0].type).toBe('adjacent');
  });

  it('should detect collision conflicts', () => {
    const input: SpatialDescriptionInput = {
      pieces: [
        { id: 'piece-a', vertices: new Float32Array([5, 5, 0]) },
        { id: 'piece-b', vertices: new Float32Array([5, 5, 0]) },
      ],
      positions: {
        'piece-a': [0, 0, 0],
        'piece-b': [0, 0, 0],
      },
      seams: [],
    };

    const result = describeSpatialRelationships(input);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].type).toBe('collision');
    expect(result.conflicts[0].severity).toBe('high');
    expect(result.conflicts[0].affectedPieceIds).toContain('piece-a');
    expect(result.conflicts[0].affectedPieceIds).toContain('piece-b');
  });

  it('should respect sewing connections from seams', () => {
    const input: SpatialDescriptionInput = {
      pieces: [
        { id: 'front', vertices: new Float32Array([0, 0, 0]) },
        { id: 'back', vertices: new Float32Array([0, 0, 0]) },
      ],
      positions: {
        'front': [0, 0, 0],
        'back': [0, 0, 0],
      },
      seams: [
        { pieceAId: 'front', pieceBId: 'back' },
      ],
    };

    const result = describeSpatialRelationships(input);

    expect(result.relationships[0].type).toBe('sewn');
    expect(result.relationships[0].hasSewingConnection).toBe(true);
    // No collision conflict since they're sewn
    expect(result.conflicts).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Append to `spatialDescriber.ts`:

```typescript
import type { SpatialConflict } from './types';

// ─── Input Types ────────────────────────────────────────────────────────────

/**
 * Simplified piece data for spatial analysis.
 */
export interface SpatialPiece {
  id: string;
  vertices: Float32Array;
}

/**
 * Simplified seam connection.
 */
export interface SpatialSeam {
  pieceAId: string;
  pieceBId: string;
}

/**
 * Input for spatial description.
 */
export interface SpatialDescriptionInput {
  pieces: SpatialPiece[];
  positions: Record<string, [number, number, number]>;
  seams: SpatialSeam[];
}

/**
 * Output of spatial description.
 */
export interface SpatialDescriptionResult {
  relationships: SpatialRelationship[];
  conflicts: SpatialConflict[];
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Describe spatial relationships between all pieces.
 */
export function describeSpatialRelationships(
  input: SpatialDescriptionInput,
): SpatialDescriptionResult {
  const { pieces, positions, seams } = input;
  const relationships: SpatialRelationship[] = [];
  const conflicts: SpatialConflict[] = [];

  // Build seam lookup
  const seamPairs = new Set<string>();
  for (const seam of seams) {
    seamPairs.add(`${seam.pieceAId}:${seam.pieceBId}`);
    seamPairs.add(`${seam.pieceBId}:${seam.pieceAId}`);
  }

  // Extract spatial info for all pieces
  const pieceInfos: PieceSpatialInfo[] = pieces.map(piece => {
    const pos = positions[piece.id] || [0, 0, 0];
    return extractPieceInfo(piece.id, piece.vertices, pos);
  });

  // Analyze all piece pairs
  for (let i = 0; i < pieceInfos.length; i++) {
    for (let j = i + 1; j < pieceInfos.length; j++) {
      const infoA = pieceInfos[i];
      const infoB = pieceInfos[j];

      const hasSewing = seamPairs.has(`${infoA.pieceId}:${infoB.pieceId}`);
      const relationship = analyzePieceRelationship(infoA, infoB, hasSewing);
      relationships.push(relationship);

      // Detect conflicts (overlapping without sewing)
      if (relationship.type === 'overlapping' && !hasSewing) {
        conflicts.push({
          type: 'collision',
          severity: 'high',
          affectedPieceIds: [infoA.pieceId, infoB.pieceId],
          description: `Pieces ${infoA.pieceId} and ${infoB.pieceId} overlap by ${relationship.distance3D.toFixed(1)}mm`,
        });
      }
    }
  }

  return { relationships, conflicts };
}
```

**Step 4: Update index.ts exports**

Update `src/copilot/vision/index.ts` to add:

```typescript
// Spatial Describer
export {
  distance3D,
  computeBoundingBox3D,
  boundingBoxesOverlap,
  findMinimumDistance,
  extractPieceInfo,
  analyzePieceRelationship,
  describeSpatialRelationships,
} from './spatialDescriber';

export type {
  Point3D,
  BoundingBox3D,
  MinDistanceResult,
  PieceSpatialInfo,
  SpatialPiece,
  SpatialSeam,
  SpatialDescriptionInput,
  SpatialDescriptionResult,
} from './spatialDescriber';
```

**Step 5: Run all tests**

**Step 6: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add main describeSpatialRelationships function

- Analyzes all piece pairs
- Detects collision conflicts
- Respects sewing connections
- Export all spatial functions from index

Closes #182"
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
gh issue close 182 --comment "Implemented Spatial Describer:
- distance3D, computeBoundingBox3D, boundingBoxesOverlap: core distance functions
- findMinimumDistance: fine-grained vertex distance
- extractPieceInfo: world-space transformation
- analyzePieceRelationship: classify piece pairs
- describeSpatialRelationships: main analysis function

All functions exported from src/copilot/vision/index.ts"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Distance functions | 5 |
| 2 | Vertex distance | 3 |
| 3 | Piece info extraction | 2 |
| 4 | Relationship analysis | 4 |
| 5 | Main function | 3 |
| 6 | Final verification | - |

**Total new tests:** 17
**Files created:** 1 (`spatialDescriber.ts`)
**Files modified:** 2 (`index.ts`, `spatialDescriber.test.ts`)
