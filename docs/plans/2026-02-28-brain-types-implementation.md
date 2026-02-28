# Brain Types & Interfaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define the core type system for the Copilot Vision Layer (perception, memory, action).

**Architecture:** Pure TypeScript interfaces in `src/copilot/vision/types.ts`. No runtime logic—just contracts. Types are organized by layer: Perception (landmarks, fingerprints), Memory (design log, overrides), Action (intent prediction).

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Create Vision Directory and Types File

**Files:**
- Create: `src/copilot/vision/types.ts`
- Create: `src/copilot/vision/index.ts`
- Test: `src/copilot/vision/__tests__/types.test.ts`

**Step 1: Create directory structure**

```bash
mkdir -p src/copilot/vision/__tests__
```

**Step 2: Write the failing test**

Create `src/copilot/vision/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  SegmentType,
  SemanticLandmark,
  GeometricFingerprint,
} from '../types';

describe('Vision Types - Perception Layer', () => {
  it('should define SegmentType correctly', () => {
    const types: SegmentType[] = ['straight', 'convex', 'concave'];
    expect(types).toHaveLength(3);
  });

  it('should define SemanticLandmark correctly', () => {
    const landmark: SemanticLandmark = {
      edgeIndex: 2,
      label: 'neckline',
      confidence: 0.92,
      curvatureType: 'concave',
    };
    expect(landmark.label).toBe('neckline');
    expect(landmark.confidence).toBeGreaterThan(0);
  });

  it('should define GeometricFingerprint correctly', () => {
    const fingerprint: GeometricFingerprint = {
      pieceId: 'p-123',
      segmentTypes: ['straight', 'concave', 'straight', 'convex'],
      ratios: { shoulderToSide: 0.35, neckToHem: 0.12 },
      curvatureDensity: 0.25,
      landmarks: [],
    };
    expect(fingerprint.segmentTypes).toHaveLength(4);
    expect(fingerprint.curvatureDensity).toBeLessThan(1);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: FAIL with "Cannot find module '../types'"

**Step 4: Write minimal implementation**

Create `src/copilot/vision/types.ts`:

```typescript
/**
 * Vision Layer Types — Core interfaces for Copilot intelligence.
 *
 * Organized by layer:
 * - Perception: SemanticLandmark, GeometricFingerprint, SpatialRelationship
 * - Memory: DesignLogEntry, SkillOverride
 * - Action: IntentPrediction, AuditResult
 *
 * @module copilot/vision/types
 */

// ─── Perception Layer: Segment Analysis ─────────────────────────────────────

/**
 * Edge segment classification based on curvature.
 */
export type SegmentType = 'straight' | 'convex' | 'concave';

/**
 * A recognized anatomical landmark on a pattern piece edge.
 */
export interface SemanticLandmark {
  /** Index of the edge in the piece outline */
  edgeIndex: number;
  /** Anatomical label (neckline, armhole, hemline, etc.) */
  label: LandmarkLabel;
  /** Recognition confidence (0-1) */
  confidence: number;
  /** Curvature type of this edge segment */
  curvatureType: SegmentType;
}

/**
 * Known anatomical landmark labels.
 */
export type LandmarkLabel =
  | 'neckline'
  | 'armhole'
  | 'shoulder'
  | 'side_seam'
  | 'hemline'
  | 'center_front'
  | 'center_back'
  | 'waistline'
  | 'hipline'
  | 'sleeve_cap'
  | 'cuff'
  | 'collar'
  | 'unknown';

/**
 * Geometric fingerprint of a pattern piece for template matching.
 */
export interface GeometricFingerprint {
  /** Piece ID this fingerprint belongs to */
  pieceId: string;
  /** Ordered list of segment types around the outline */
  segmentTypes: SegmentType[];
  /** Named length ratios (e.g., shoulder/side = 0.35) */
  ratios: Record<string, number>;
  /** Fraction of outline that is curved (0-1) */
  curvatureDensity: number;
  /** Detected anatomical landmarks */
  landmarks: SemanticLandmark[];
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add perception layer types

- SegmentType for edge curvature classification
- SemanticLandmark for anatomical edge labels
- GeometricFingerprint for template matching

Part of #180"
```

---

## Task 2: Add Spatial Relationship Types

**Files:**
- Modify: `src/copilot/vision/types.ts`
- Modify: `src/copilot/vision/__tests__/types.test.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/types.test.ts`:

```typescript
import type {
  SpatialRelationType,
  SpatialRelationship,
  SpatialConflict,
} from '../types';

describe('Vision Types - Spatial Relationships', () => {
  it('should define SpatialRelationship correctly', () => {
    const relation: SpatialRelationship = {
      pieceAId: 'p-1',
      pieceBId: 'p-2',
      type: 'adjacent',
      distance3D: 5.2,
      edgeAIndex: 2,
      edgeBIndex: 0,
      hasSewingConnection: true,
    };
    expect(relation.type).toBe('adjacent');
    expect(relation.hasSewingConnection).toBe(true);
  });

  it('should define SpatialConflict correctly', () => {
    const conflict: SpatialConflict = {
      type: 'collision',
      severity: 'high',
      affectedPieceIds: ['p-1', 'p-2'],
      description: 'Left sleeve intersects avatar arm by 12mm',
    };
    expect(conflict.severity).toBe('high');
    expect(conflict.affectedPieceIds).toContain('p-1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: FAIL with "has no exported member 'SpatialRelationType'"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/types.ts`:

```typescript
// ─── Perception Layer: Spatial Analysis ─────────────────────────────────────

/**
 * Types of spatial relationships between pieces.
 */
export type SpatialRelationType =
  | 'adjacent'      // Close in 3D, potentially sewable
  | 'overlapping'   // Pieces intersect in 3D
  | 'distant'       // Too far to interact
  | 'sewn';         // Connected by a seam

/**
 * A spatial relationship between two pieces in 3D space.
 */
export interface SpatialRelationship {
  /** First piece ID */
  pieceAId: string;
  /** Second piece ID */
  pieceBId: string;
  /** Relationship type */
  type: SpatialRelationType;
  /** Minimum distance between boundaries in mm */
  distance3D: number;
  /** Index of closest edge on piece A */
  edgeAIndex?: number;
  /** Index of closest edge on piece B */
  edgeBIndex?: number;
  /** Whether these pieces have a sewing connection */
  hasSewingConnection: boolean;
}

/**
 * Severity levels for spatial conflicts.
 */
export type ConflictSeverity = 'low' | 'high';

/**
 * Types of spatial conflicts.
 */
export type ConflictType = 'gap' | 'overlap' | 'collision' | 'instability';

/**
 * A detected spatial conflict requiring attention.
 */
export interface SpatialConflict {
  /** Type of conflict */
  type: ConflictType;
  /** How serious the conflict is */
  severity: ConflictSeverity;
  /** IDs of affected pieces */
  affectedPieceIds: string[];
  /** Human-readable description */
  description: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add spatial relationship types

- SpatialRelationship for 3D adjacency
- SpatialConflict for collision detection

Part of #180"
```

---

## Task 3: Add Memory Layer Types

**Files:**
- Modify: `src/copilot/vision/types.ts`
- Modify: `src/copilot/vision/__tests__/types.test.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/types.test.ts`:

```typescript
import type {
  DesignLogEntry,
  SkillOverride,
  DesignLog,
} from '../types';

describe('Vision Types - Memory Layer', () => {
  it('should define DesignLogEntry correctly', () => {
    const entry: DesignLogEntry = {
      id: 'log-001',
      timestamp: Date.now(),
      type: 'decision',
      summary: 'Increased armhole depth by 2cm for mobility',
      relatedPieceIds: ['p-front', 'p-back'],
      metadata: { reasoning: 'User requested athletic fit' },
    };
    expect(entry.type).toBe('decision');
    expect(entry.relatedPieceIds).toContain('p-front');
  });

  it('should define SkillOverride correctly', () => {
    const override: SkillOverride = {
      id: 'override-001',
      skillId: 'core:bodice',
      formulaName: 'armhole_depth',
      originalValue: 'bust_arc / 5 + 2',
      overrideValue: 'bust_arc / 5 + 4',
      reason: 'User prefers deeper armholes',
      createdAt: Date.now(),
    };
    expect(override.formulaName).toBe('armhole_depth');
    expect(override.overrideValue).toContain('+ 4');
  });

  it('should define DesignLog correctly', () => {
    const log: DesignLog = {
      projectId: 'proj-123',
      entries: [],
      overrides: [],
      lastFlushAt: Date.now(),
    };
    expect(log.projectId).toBe('proj-123');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: FAIL with "has no exported member 'DesignLogEntry'"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/types.ts`:

```typescript
// ─── Memory Layer: Design Log ───────────────────────────────────────────────

/**
 * Types of design log entries.
 */
export type DesignLogEntryType =
  | 'decision'    // A design choice made
  | 'constraint'  // A rule that must be preserved
  | 'note'        // A general observation
  | 'warning';    // A potential issue flagged

/**
 * A single entry in the durable design log.
 */
export interface DesignLogEntry {
  /** Unique entry ID */
  id: string;
  /** When this entry was created */
  timestamp: number;
  /** Entry type */
  type: DesignLogEntryType;
  /** Human-readable summary */
  summary: string;
  /** IDs of pieces this entry relates to */
  relatedPieceIds: string[];
  /** Additional structured data */
  metadata?: Record<string, unknown>;
}

/**
 * A user-defined override for a skill formula.
 */
export interface SkillOverride {
  /** Unique override ID */
  id: string;
  /** Skill this override applies to (e.g., 'core:bodice') */
  skillId: string;
  /** Name of the formula being overridden */
  formulaName: string;
  /** Original formula expression */
  originalValue: string;
  /** User's preferred expression */
  overrideValue: string;
  /** Why the override was created */
  reason: string;
  /** When the override was created */
  createdAt: number;
}

/**
 * The complete design log for a project.
 */
export interface DesignLog {
  /** Project this log belongs to */
  projectId: string;
  /** Log entries */
  entries: DesignLogEntry[];
  /** User formula overrides */
  overrides: SkillOverride[];
  /** Last time the log was flushed to storage */
  lastFlushAt: number;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add memory layer types

- DesignLogEntry for durable decisions
- SkillOverride for user formula preferences
- DesignLog container

Part of #180"
```

---

## Task 4: Add Action Layer Types

**Files:**
- Modify: `src/copilot/vision/types.ts`
- Modify: `src/copilot/vision/__tests__/types.test.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/types.test.ts`:

```typescript
import type {
  AuditRuleType,
  AuditResult,
  IntentPrediction,
} from '../types';

describe('Vision Types - Action Layer', () => {
  it('should define AuditResult correctly', () => {
    const result: AuditResult = {
      rule: 'self_intersection',
      passed: false,
      message: 'Proposed change would create self-intersecting outline',
    };
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('self_intersection');
  });

  it('should define IntentPrediction correctly', () => {
    const prediction: IntentPrediction = {
      toolName: 'modifyDimension',
      originalPieceId: 'p-front',
      predictedChanges: { width: 42, height: 58 },
      isSafe: false,
      auditResults: [
        { rule: 'area_integrity', passed: true },
        { rule: 'self_intersection', passed: false, message: 'Self-intersection detected' },
      ],
      suggestedFix: 'Try a smaller increment (10mm instead of 50mm)',
    };
    expect(prediction.isSafe).toBe(false);
    expect(prediction.auditResults).toHaveLength(2);
    expect(prediction.suggestedFix).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: FAIL with "has no exported member 'AuditRuleType'"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/types.ts`:

```typescript
// ─── Action Layer: Intent Prediction ────────────────────────────────────────

/**
 * Types of geometric audit rules.
 */
export type AuditRuleType =
  | 'area_integrity'      // Area > 0
  | 'self_intersection'   // No self-crossing
  | 'seam_compatibility'  // Sewn edges still match
  | 'constraint_violation'; // Violates a design log constraint

/**
 * Result of a single audit rule check.
 */
export interface AuditResult {
  /** Which rule was checked */
  rule: AuditRuleType;
  /** Whether the check passed */
  passed: boolean;
  /** Error message if failed */
  message?: string;
}

/**
 * Pre-flight prediction of a tool call's effect.
 */
export interface IntentPrediction {
  /** Name of the tool being called */
  toolName: string;
  /** ID of the piece being modified */
  originalPieceId: string;
  /** Predicted changes to piece properties */
  predictedChanges: Record<string, unknown>;
  /** Whether the change is safe to apply */
  isSafe: boolean;
  /** Results of all audit rule checks */
  auditResults: AuditResult[];
  /** Suggested alternative if unsafe */
  suggestedFix?: string;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add action layer types

- AuditResult for geometric validation
- IntentPrediction for pre-flight sandbox

Part of #180"
```

---

## Task 5: Add Template Matching Types and Index Export

**Files:**
- Modify: `src/copilot/vision/types.ts`
- Create: `src/copilot/vision/index.ts`
- Modify: `src/copilot/vision/__tests__/types.test.ts`

**Step 1: Write the failing test**

Append to `src/copilot/vision/__tests__/types.test.ts`:

```typescript
import type {
  ArchetypeMatch,
  PieceSemantics,
} from '../types';

describe('Vision Types - Template Matching', () => {
  it('should define ArchetypeMatch correctly', () => {
    const match: ArchetypeMatch = {
      archetypeId: 'bodice_front',
      archetypeName: 'Standard Front Bodice',
      similarity: 0.85,
      matchedLandmarks: ['neckline', 'armhole', 'side_seam'],
    };
    expect(match.similarity).toBeGreaterThan(0.8);
    expect(match.matchedLandmarks).toContain('armhole');
  });

  it('should define PieceSemantics correctly', () => {
    const semantics: PieceSemantics = {
      pieceId: 'p-123',
      fingerprint: {
        pieceId: 'p-123',
        segmentTypes: ['straight', 'concave'],
        ratios: {},
        curvatureDensity: 0.3,
        landmarks: [],
      },
      bestMatch: {
        archetypeId: 'bodice_front',
        archetypeName: 'Front Bodice',
        similarity: 0.9,
        matchedLandmarks: [],
      },
      avatarProximity: 'Spine2',
    };
    expect(semantics.bestMatch?.similarity).toBe(0.9);
    expect(semantics.avatarProximity).toBe('Spine2');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: FAIL with "has no exported member 'ArchetypeMatch'"

**Step 3: Write minimal implementation**

Append to `src/copilot/vision/types.ts`:

```typescript
// ─── Perception Layer: Template Matching ────────────────────────────────────

/**
 * A match against a known garment archetype.
 */
export interface ArchetypeMatch {
  /** ID of the matched archetype (e.g., 'bodice_front') */
  archetypeId: string;
  /** Human-readable archetype name */
  archetypeName: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Which landmarks matched */
  matchedLandmarks: LandmarkLabel[];
}

/**
 * Complete semantic analysis of a pattern piece.
 */
export interface PieceSemantics {
  /** Piece ID */
  pieceId: string;
  /** Geometric fingerprint */
  fingerprint: GeometricFingerprint;
  /** Best archetype match (if any) */
  bestMatch?: ArchetypeMatch;
  /** Nearest avatar bone (for proximity anchor) */
  avatarProximity?: string;
}

// ─── Context Integration ────────────────────────────────────────────────────

/**
 * Complete cerebral context for a single LLM request.
 */
export interface CerebralContext {
  /** Semantic analysis of all pieces */
  pieceSemantics: PieceSemantics[];
  /** Spatial relationships between pieces */
  spatialRelationships: SpatialRelationship[];
  /** Active spatial conflicts */
  conflicts: SpatialConflict[];
  /** Recent design decisions */
  recentDecisions: DesignLogEntry[];
  /** Active formula overrides */
  activeOverrides: SkillOverride[];
}
```

**Step 4: Create index.ts**

Create `src/copilot/vision/index.ts`:

```typescript
/**
 * Vision Module — Copilot intelligence layer.
 *
 * @module copilot/vision
 */

// Types
export type {
  // Perception - Segments
  SegmentType,
  LandmarkLabel,
  SemanticLandmark,
  GeometricFingerprint,
  // Perception - Spatial
  SpatialRelationType,
  SpatialRelationship,
  ConflictSeverity,
  ConflictType,
  SpatialConflict,
  // Perception - Template Matching
  ArchetypeMatch,
  PieceSemantics,
  // Memory
  DesignLogEntryType,
  DesignLogEntry,
  SkillOverride,
  DesignLog,
  // Action
  AuditRuleType,
  AuditResult,
  IntentPrediction,
  // Context
  CerebralContext,
} from './types';
```

**Step 5: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/types.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add template matching types and module index

- ArchetypeMatch for pattern recognition
- PieceSemantics for complete piece analysis
- CerebralContext for LLM integration
- Export all types from index

Closes #180"
```

---

## Task 6: Run All Tests and Update GitHub Issue

**Step 1: Run full test suite**

```bash
npm test -- --run
```

Expected: All tests pass (2311+ tests)

**Step 2: Push changes**

```bash
git push origin main
```

**Step 3: Close issue**

```bash
gh issue close 180 --comment "Implemented core types for Vision Layer:
- Perception: SegmentType, SemanticLandmark, GeometricFingerprint, SpatialRelationship
- Memory: DesignLogEntry, SkillOverride, DesignLog
- Action: AuditResult, IntentPrediction
- Integration: CerebralContext

All types exported from src/copilot/vision/index.ts"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Perception types (landmarks, fingerprints) | 3 |
| 2 | Spatial relationship types | 2 |
| 3 | Memory layer types | 3 |
| 4 | Action layer types | 2 |
| 5 | Template matching + index | 2 |
| 6 | Final verification | - |

**Total new tests:** 12
**Files created:** 3 (`types.ts`, `index.ts`, `types.test.ts`)
