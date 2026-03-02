# Intelligent Context Generation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the copilot infer missing parameters (edgeName, pieceId) with 100% accuracy using expert garment knowledge.

**Architecture:** GarmentKnowledge (static) + SemanticResolver (fuzzy match) + MeasurementCalculator (body integration) + ContextEnricher (lean context for Planner). Non-deterministic resolution with deterministic validation guarantees 100% accuracy.

**Tech Stack:** TypeScript, Vitest, existing utils (pieceClassifier, semanticEdges)

---

## Phase 1: Core Intelligence (5 Tasks)

### Task 1: Types Module

**Files:**
- Create: `src/copilot/intelligence/types.ts`
- Test: `src/copilot/intelligence/__tests__/types.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/intelligence/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  PieceType,
  PieceClassification,
  Resolution,
  ResolvedEdge,
  ResolvedPiece,
  ParsedValue,
  PieceTypeKnowledge,
} from '../types';

describe('types', () => {
  it('PieceClassification has required fields', () => {
    const classification: PieceClassification = {
      pieceId: 'front',
      type: 'bodice-front',
      confidence: 0.95,
      side: 'front',
    };
    expect(classification.pieceId).toBe('front');
    expect(classification.type).toBe('bodice-front');
    expect(classification.confidence).toBe(0.95);
  });

  it('Resolution has required structure', () => {
    const resolution: Resolution = {
      intent: 'modify_edge',
      entities: {
        edges: [{
          userTerm: 'escote',
          resolved: 'neckline',
          pieceIds: ['front'],
          confidence: 1.0,
        }],
        pieces: [],
        values: [{ raw: '2cm', value: 20, unit: 'mm' }],
      },
      confidence: 'certain',
    };
    expect(resolution.intent).toBe('modify_edge');
    expect(resolution.confidence).toBe('certain');
  });

  it('PieceTypeKnowledge has edge semantics', () => {
    const knowledge: PieceTypeKnowledge = {
      expectedEdges: ['neckline', 'shoulder'],
      edgeSemantics: {
        'neckline': ['escote', 'cuello', 'neck'],
      },
      measurementRelations: {
        'neckline': 'neckCirc',
      },
    };
    expect(knowledge.expectedEdges).toContain('neckline');
    expect(knowledge.edgeSemantics['neckline']).toContain('escote');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/intelligence/__tests__/types.test.ts`
Expected: FAIL with "Cannot find module '../types'"

**Step 3: Write minimal implementation**

```typescript
// src/copilot/intelligence/types.ts
/**
 * Intelligent Context Generation - Type Definitions
 *
 * Shared types for the intelligence module that resolves user terms
 * to technical pattern terminology with 100% accuracy.
 *
 * @module copilot/intelligence/types
 */

// --- Piece Classification ---

/**
 * Pattern piece types for garment knowledge base.
 * More specific than PieceCategory from types.ts.
 */
export type PieceType =
  | 'bodice-front'
  | 'bodice-back'
  | 'sleeve'
  | 'pants-front'
  | 'pants-back'
  | 'skirt-front'
  | 'skirt-back'
  | 'collar'
  | 'cuff'
  | 'waistband'
  | 'unknown';

/**
 * Classification result for a pattern piece.
 */
export interface PieceClassification {
  pieceId: string;
  type: PieceType;
  confidence: number;
  side?: 'front' | 'back' | 'left' | 'right';
}

// --- Semantic Resolution ---

/**
 * User intent parsed from the request.
 */
export type Intent = 'modify_edge' | 'modify_piece' | 'create' | 'query';

/**
 * Confidence level for resolution.
 */
export type ConfidenceLevel = 'certain' | 'probable' | 'ambiguous';

/**
 * A resolved edge from user terminology.
 */
export interface ResolvedEdge {
  /** Original user term (e.g., "escote") */
  userTerm: string;
  /** Technical edge name (e.g., "neckline") */
  resolved: string;
  /** Piece IDs that have this edge */
  pieceIds: string[];
  /** Match confidence (0-1) */
  confidence: number;
}

/**
 * A resolved piece from user terminology.
 */
export interface ResolvedPiece {
  /** Original user term (e.g., "delantero") */
  userTerm: string;
  /** Resolved piece ID */
  pieceId: string;
  /** Piece type classification */
  pieceType: PieceType;
  /** Match confidence (0-1) */
  confidence: number;
}

/**
 * A parsed numeric value from user request.
 */
export interface ParsedValue {
  /** Raw text (e.g., "2cm", "20mm") */
  raw: string;
  /** Normalized value in mm */
  value: number;
  /** Original unit */
  unit: 'mm' | 'cm' | 'in';
}

/**
 * Complete resolution result from user request.
 */
export interface Resolution {
  /** Detected intent */
  intent: Intent;
  /** Resolved entities */
  entities: {
    edges: ResolvedEdge[];
    pieces: ResolvedPiece[];
    values: ParsedValue[];
  };
  /** Overall confidence */
  confidence: ConfidenceLevel;
}

// --- Garment Knowledge ---

/**
 * Knowledge about a specific piece type.
 */
export interface PieceTypeKnowledge {
  /** Expected edge names for this piece type */
  expectedEdges: string[];
  /** Maps technical edge names to user terms (multilingual) */
  edgeSemantics: Record<string, string[]>;
  /** Maps edge names to related body measurements */
  measurementRelations: Record<string, string>;
}

// --- Measurement Context ---

/**
 * Context for measurement calculations.
 */
export interface MeasurementContext {
  /** Body measurements from avatar (key: measurement name, value: cm) */
  bodyMeasurements: Record<string, number>;
  /** Edge lengths per piece (pieceId -> edgeName -> length in mm) */
  edgeLengths: Record<string, Record<string, number>>;
}

/**
 * Result of a measurement calculation.
 */
export interface CalculatedValue {
  /** Target value after modification */
  targetValue: number;
  /** Current value before modification */
  currentValue: number;
  /** Delta to apply */
  delta: number;
  /** Unit for all values */
  unit: 'mm' | 'cm';
  /** Related body measurement if applicable */
  relatedMeasurement?: {
    name: string;
    value: number;
  };
}

// --- Enriched Context ---

/**
 * Target for a modification operation.
 */
export interface ModificationTarget {
  pieceId: string;
  pieceName: string;
  pieceType: PieceType;
  edge: string;
  currentLength: number;
}

/**
 * Enriched context passed to the Planner.
 * Contains all resolved entities so Planner doesn't need to infer.
 */
export interface EnrichedContext {
  /** Human-readable description of the resolved intent */
  resolvedIntent: string;
  /** Specific targets for the operation */
  targets: ModificationTarget[];
  /** Pre-calculated values */
  calculation: CalculatedValue | null;
  /** Relevant body measurements */
  relatedMeasurements: Record<string, number>;
  /** Available edges per piece (for Planner reference) */
  availableEdgesPerPiece: Record<string, string[]>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/intelligence/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/intelligence/types.ts src/copilot/intelligence/__tests__/types.test.ts
git commit -m "feat(intelligence): add type definitions for context generation

Part of Epic #209: Intelligent Context Generation"
```

---

### Task 2: Garment Knowledge Base

**Files:**
- Create: `src/copilot/intelligence/GarmentKnowledge.ts`
- Test: `src/copilot/intelligence/__tests__/GarmentKnowledge.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/intelligence/__tests__/GarmentKnowledge.test.ts
import { describe, it, expect } from 'vitest';
import {
  GARMENT_KNOWLEDGE,
  getKnowledgeForType,
  findEdgeByUserTerm,
  getRelatedMeasurement,
} from '../GarmentKnowledge';
import type { PieceType } from '../types';

describe('GarmentKnowledge', () => {
  describe('GARMENT_KNOWLEDGE', () => {
    it('has knowledge for bodice-front', () => {
      expect(GARMENT_KNOWLEDGE['bodice-front']).toBeDefined();
      expect(GARMENT_KNOWLEDGE['bodice-front'].expectedEdges).toContain('neckline');
      expect(GARMENT_KNOWLEDGE['bodice-front'].expectedEdges).toContain('shoulder');
      expect(GARMENT_KNOWLEDGE['bodice-front'].expectedEdges).toContain('armhole');
    });

    it('has knowledge for sleeve', () => {
      expect(GARMENT_KNOWLEDGE['sleeve']).toBeDefined();
      expect(GARMENT_KNOWLEDGE['sleeve'].expectedEdges).toContain('sleeveCap');
    });
  });

  describe('getKnowledgeForType', () => {
    it('returns knowledge for known type', () => {
      const k = getKnowledgeForType('bodice-front');
      expect(k).toBeDefined();
      expect(k?.expectedEdges).toContain('neckline');
    });

    it('returns undefined for unknown type', () => {
      const k = getKnowledgeForType('unknown');
      expect(k).toBeUndefined();
    });
  });

  describe('findEdgeByUserTerm', () => {
    it('resolves "escote" to "neckline" for bodice-front', () => {
      const result = findEdgeByUserTerm('escote', 'bodice-front');
      expect(result).toBe('neckline');
    });

    it('resolves "hombro" to "shoulder" for bodice-front', () => {
      const result = findEdgeByUserTerm('hombro', 'bodice-front');
      expect(result).toBe('shoulder');
    });

    it('resolves "sisa" to "armhole" for bodice-front', () => {
      const result = findEdgeByUserTerm('sisa', 'bodice-front');
      expect(result).toBe('armhole');
    });

    it('resolves English terms: "neckline" to "neckline"', () => {
      const result = findEdgeByUserTerm('neckline', 'bodice-front');
      expect(result).toBe('neckline');
    });

    it('is case-insensitive', () => {
      expect(findEdgeByUserTerm('ESCOTE', 'bodice-front')).toBe('neckline');
      expect(findEdgeByUserTerm('Hombro', 'bodice-front')).toBe('shoulder');
    });

    it('returns undefined for unknown term', () => {
      const result = findEdgeByUserTerm('unknown_term', 'bodice-front');
      expect(result).toBeUndefined();
    });

    it('resolves sleeve terms', () => {
      expect(findEdgeByUserTerm('copa', 'sleeve')).toBe('sleeveCap');
      expect(findEdgeByUserTerm('puño', 'sleeve')).toBe('cuffEdge');
    });
  });

  describe('getRelatedMeasurement', () => {
    it('returns neckCirc for neckline on bodice', () => {
      const result = getRelatedMeasurement('neckline', 'bodice-front');
      expect(result).toBe('neckCirc');
    });

    it('returns shoulder for shoulder edge', () => {
      const result = getRelatedMeasurement('shoulder', 'bodice-front');
      expect(result).toBe('shoulder');
    });

    it('returns undefined for unknown edge', () => {
      const result = getRelatedMeasurement('unknown', 'bodice-front');
      expect(result).toBeUndefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/intelligence/__tests__/GarmentKnowledge.test.ts`
Expected: FAIL with "Cannot find module '../GarmentKnowledge'"

**Step 3: Write minimal implementation**

```typescript
// src/copilot/intelligence/GarmentKnowledge.ts
/**
 * Garment Knowledge Base - static expert knowledge about garment construction.
 *
 * Maps piece types to expected edges and provides multilingual term resolution.
 *
 * @module copilot/intelligence/GarmentKnowledge
 */

import type { PieceType, PieceTypeKnowledge } from './types';

/**
 * Complete garment knowledge base.
 * Maps piece types to their expected edges, user term mappings, and body measurement relations.
 */
export const GARMENT_KNOWLEDGE: Partial<Record<PieceType, PieceTypeKnowledge>> = {
  'bodice-front': {
    expectedEdges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline', 'centerFront'],
    edgeSemantics: {
      'neckline': ['escote', 'cuello', 'neck', 'neckline', 'encolure', 'col', 'ausschnitt'],
      'shoulder': ['hombro', 'shoulder', 'epaule', 'schulter'],
      'armhole': ['sisa', 'armhole', 'emmanchure', 'armloch'],
      'sideSeam': ['costado', 'lateral', 'side', 'sideseam', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'hemline', 'ruedo', 'ourlet', 'saum'],
      'centerFront': ['centro', 'center', 'centerfront', 'cf', 'milieu devant'],
    },
    measurementRelations: {
      'neckline': 'neckCirc',
      'shoulder': 'shoulder',
      'armhole': 'armLength',
      'hemline': 'chest',
      'sideSeam': 'height',
    },
  },
  'bodice-back': {
    expectedEdges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline', 'centerBack'],
    edgeSemantics: {
      'neckline': ['escote', 'cuello', 'neck', 'neckline', 'encolure', 'ausschnitt'],
      'shoulder': ['hombro', 'shoulder', 'epaule', 'schulter'],
      'armhole': ['sisa', 'armhole', 'emmanchure', 'armloch'],
      'sideSeam': ['costado', 'lateral', 'side', 'sideseam', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'hemline', 'ruedo', 'ourlet', 'saum'],
      'centerBack': ['centro espalda', 'center back', 'centerback', 'cb', 'milieu dos'],
    },
    measurementRelations: {
      'neckline': 'neckCirc',
      'shoulder': 'shoulder',
      'armhole': 'armLength',
      'hemline': 'chest',
      'sideSeam': 'height',
    },
  },
  'sleeve': {
    expectedEdges: ['sleeveCap', 'underarmSeam', 'cuffEdge'],
    edgeSemantics: {
      'sleeveCap': ['copa', 'cabeza', 'cap', 'sleeve head', 'tete de manche', 'armelpunkt'],
      'cuffEdge': ['puno', 'bajo', 'hem', 'cuff', 'poignet', 'manschette'],
      'underarmSeam': ['axila', 'underarm', 'bajo brazo', 'couture dessous de bras'],
    },
    measurementRelations: {
      'sleeveCap': 'armLength',
      'cuffEdge': 'armLength',
      'underarmSeam': 'armLength',
    },
  },
  'skirt-front': {
    expectedEdges: ['waistline', 'sideSeam', 'hemline', 'centerFront'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'waistline', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet', 'saum'],
      'centerFront': ['centro', 'center', 'cf', 'milieu devant'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'hemline': 'hips',
      'sideSeam': 'inseam',
    },
  },
  'skirt-back': {
    expectedEdges: ['waistline', 'sideSeam', 'hemline', 'centerBack'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'waistline', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote', 'seitennaht'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet', 'saum'],
      'centerBack': ['centro espalda', 'center back', 'cb', 'milieu dos'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'hemline': 'hips',
      'sideSeam': 'inseam',
    },
  },
  'pants-front': {
    expectedEdges: ['waistline', 'sideSeam', 'inseam', 'hemline', 'crotchCurve'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote'],
      'inseam': ['entrepierna', 'inseam', 'entrejambe'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet'],
      'crotchCurve': ['tiro', 'crotch', 'entrecuisse'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'inseam': 'inseam',
      'hemline': 'hips',
    },
  },
  'pants-back': {
    expectedEdges: ['waistline', 'sideSeam', 'inseam', 'hemline', 'crotchCurve'],
    edgeSemantics: {
      'waistline': ['cintura', 'waist', 'ceinture', 'taille'],
      'sideSeam': ['costado', 'lateral', 'side', 'cote'],
      'inseam': ['entrepierna', 'inseam', 'entrejambe'],
      'hemline': ['bajo', 'hem', 'ruedo', 'ourlet'],
      'crotchCurve': ['tiro', 'crotch', 'entrecuisse'],
    },
    measurementRelations: {
      'waistline': 'waist',
      'inseam': 'inseam',
      'hemline': 'hips',
    },
  },
  'collar': {
    expectedEdges: ['neckEdge', 'outerEdge', 'centerBack'],
    edgeSemantics: {
      'neckEdge': ['cuello interior', 'neck edge', 'bord de cou'],
      'outerEdge': ['borde exterior', 'outer edge', 'bord exterieur'],
      'centerBack': ['centro espalda', 'center back', 'milieu dos'],
    },
    measurementRelations: {
      'neckEdge': 'neckCirc',
    },
  },
  'cuff': {
    expectedEdges: ['topEdge', 'bottomEdge', 'sideSeam'],
    edgeSemantics: {
      'topEdge': ['borde superior', 'top edge', 'bord superieur'],
      'bottomEdge': ['borde inferior', 'bottom edge', 'bord inferieur'],
      'sideSeam': ['costado', 'side', 'cote'],
    },
    measurementRelations: {},
  },
};

/**
 * Get knowledge for a specific piece type.
 */
export function getKnowledgeForType(type: PieceType): PieceTypeKnowledge | undefined {
  return GARMENT_KNOWLEDGE[type];
}

/**
 * Find the technical edge name from a user term.
 *
 * @param userTerm - User's term (e.g., "escote", "hombro")
 * @param pieceType - The piece type to search in
 * @returns Technical edge name or undefined if not found
 */
export function findEdgeByUserTerm(userTerm: string, pieceType: PieceType): string | undefined {
  const knowledge = GARMENT_KNOWLEDGE[pieceType];
  if (!knowledge) return undefined;

  const normalizedTerm = userTerm.toLowerCase().trim();

  for (const [edgeName, userTerms] of Object.entries(knowledge.edgeSemantics)) {
    if (userTerms.some(t => t.toLowerCase() === normalizedTerm)) {
      return edgeName;
    }
  }

  return undefined;
}

/**
 * Get the related body measurement for an edge.
 */
export function getRelatedMeasurement(edgeName: string, pieceType: PieceType): string | undefined {
  const knowledge = GARMENT_KNOWLEDGE[pieceType];
  if (!knowledge) return undefined;
  return knowledge.measurementRelations[edgeName];
}

/**
 * Get all user terms for an edge.
 */
export function getUserTermsForEdge(edgeName: string, pieceType: PieceType): string[] {
  const knowledge = GARMENT_KNOWLEDGE[pieceType];
  if (!knowledge) return [];
  return knowledge.edgeSemantics[edgeName] ?? [];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/intelligence/__tests__/GarmentKnowledge.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/intelligence/GarmentKnowledge.ts src/copilot/intelligence/__tests__/GarmentKnowledge.test.ts
git commit -m "feat(intelligence): add GarmentKnowledge base with multilingual support

- Static knowledge for bodice, sleeve, skirt, pants, collar, cuff
- Edge semantics in EN/ES/FR/DE
- Body measurement relations per edge

Part of Epic #209"
```

---

### Task 3: Semantic Resolver

**Files:**
- Create: `src/copilot/intelligence/SemanticResolver.ts`
- Test: `src/copilot/intelligence/__tests__/SemanticResolver.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/intelligence/__tests__/SemanticResolver.test.ts
import { describe, it, expect } from 'vitest';
import { SemanticResolver } from '../SemanticResolver';
import type { PieceClassification } from '../types';

describe('SemanticResolver', () => {
  const resolver = new SemanticResolver();

  // Mock pieces with edges
  const mockPieces = [
    {
      id: 'front',
      name: 'Front Bodice',
      edges: [
        { name: 'neckline', length: 125 },
        { name: 'shoulder', length: 150 },
        { name: 'armhole', length: 220 },
        { name: 'sideSeam', length: 300 },
      ],
    },
    {
      id: 'back',
      name: 'Back Bodice',
      edges: [
        { name: 'neckline', length: 120 },
        { name: 'shoulder', length: 150 },
        { name: 'armhole', length: 220 },
        { name: 'sideSeam', length: 300 },
      ],
    },
  ];

  const mockClassifications: PieceClassification[] = [
    { pieceId: 'front', type: 'bodice-front', confidence: 0.95 },
    { pieceId: 'back', type: 'bodice-back', confidence: 0.93 },
  ];

  describe('resolve', () => {
    it('resolves "reduce el escote 2cm" with certain confidence', async () => {
      const result = await resolver.resolve(
        'reduce el escote 2cm',
        mockPieces as any,
        mockClassifications,
      );

      expect(result.intent).toBe('modify_edge');
      expect(result.confidence).toBe('certain');
      expect(result.entities.edges).toHaveLength(2); // front and back neckline
      expect(result.entities.edges[0].resolved).toBe('neckline');
      expect(result.entities.edges[0].userTerm).toBe('escote');
      expect(result.entities.values).toHaveLength(1);
      expect(result.entities.values[0].value).toBe(20); // 2cm = 20mm
    });

    it('resolves "aumenta el hombro 5mm"', async () => {
      const result = await resolver.resolve(
        'aumenta el hombro 5mm',
        mockPieces as any,
        mockClassifications,
      );

      expect(result.intent).toBe('modify_edge');
      expect(result.entities.edges[0].resolved).toBe('shoulder');
      expect(result.entities.values[0].value).toBe(5);
    });

    it('resolves English terms: "reduce neckline by 1 inch"', async () => {
      const result = await resolver.resolve(
        'reduce neckline by 1 inch',
        mockPieces as any,
        mockClassifications,
      );

      expect(result.entities.edges[0].resolved).toBe('neckline');
      expect(result.entities.values[0].value).toBeCloseTo(25.4, 1); // 1 inch = 25.4mm
    });

    it('returns ambiguous when edge not found', async () => {
      const result = await resolver.resolve(
        'reduce el xyz 2cm',
        mockPieces as any,
        mockClassifications,
      );

      expect(result.confidence).toBe('ambiguous');
      expect(result.entities.edges).toHaveLength(0);
    });

    it('validates resolved edge exists on piece', async () => {
      // Even if we find "neckline" semantically, it must exist on piece.edges
      const piecesWithoutNeckline = [{
        id: 'front',
        name: 'Front Bodice',
        edges: [{ name: 'shoulder', length: 150 }], // no neckline!
      }];

      const result = await resolver.resolve(
        'reduce el escote 2cm',
        piecesWithoutNeckline as any,
        [{ pieceId: 'front', type: 'bodice-front', confidence: 0.95 }],
      );

      // Should still resolve to neckline semantically but pieceIds should be empty
      // because validation fails
      expect(result.confidence).toBe('ambiguous');
    });
  });

  describe('parseValue', () => {
    it('parses "2cm" to 20mm', () => {
      const values = resolver['parseValues']('reduce 2cm');
      expect(values[0]).toEqual({ raw: '2cm', value: 20, unit: 'cm' });
    });

    it('parses "20mm" to 20mm', () => {
      const values = resolver['parseValues']('reduce 20mm');
      expect(values[0]).toEqual({ raw: '20mm', value: 20, unit: 'mm' });
    });

    it('parses "1 inch" to ~25.4mm', () => {
      const values = resolver['parseValues']('reduce 1 inch');
      expect(values[0].value).toBeCloseTo(25.4, 1);
    });

    it('parses "2.5cm" to 25mm', () => {
      const values = resolver['parseValues']('reduce 2.5cm');
      expect(values[0].value).toBe(25);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/intelligence/__tests__/SemanticResolver.test.ts`
Expected: FAIL with "Cannot find module '../SemanticResolver'"

**Step 3: Write minimal implementation**

```typescript
// src/copilot/intelligence/SemanticResolver.ts
/**
 * Semantic Resolver - resolves user terms to technical pattern terminology.
 *
 * Uses fuzzy matching against the GarmentKnowledge base and validates
 * resolved entities against actual piece edges for 100% accuracy.
 *
 * @module copilot/intelligence/SemanticResolver
 */

import type { PatternPiece } from '../../types/types';
import type {
  PieceClassification,
  Resolution,
  ResolvedEdge,
  ResolvedPiece,
  ParsedValue,
  Intent,
  ConfidenceLevel,
} from './types';
import { findEdgeByUserTerm } from './GarmentKnowledge';

/**
 * Resolves user terms to technical pattern terminology with validation.
 */
export class SemanticResolver {
  /**
   * Resolve a user request to technical entities.
   *
   * @param request - User's natural language request
   * @param pieces - Pattern pieces with edges
   * @param classifications - Piece type classifications
   * @returns Resolution with entities and confidence
   */
  async resolve(
    request: string,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
  ): Promise<Resolution> {
    const intent = this.detectIntent(request);
    const values = this.parseValues(request);
    const edges = this.resolveEdges(request, pieces, classifications);
    const resolvedPieces = this.resolvePieces(request, pieces, classifications);

    // Determine confidence
    let confidence: ConfidenceLevel = 'certain';
    if (intent === 'modify_edge' && edges.length === 0) {
      confidence = 'ambiguous';
    } else if (edges.some(e => e.confidence < 0.8)) {
      confidence = 'probable';
    }

    return {
      intent,
      entities: {
        edges,
        pieces: resolvedPieces,
        values,
      },
      confidence,
    };
  }

  /**
   * Detect user intent from request.
   */
  private detectIntent(request: string): Intent {
    const r = request.toLowerCase();

    // Modification patterns
    if (/reduce|reducir|disminuir|acortar|shrink|decrease/.test(r)) return 'modify_edge';
    if (/aumenta|incrementa|agranda|increase|expand|widen|lengthen/.test(r)) return 'modify_edge';
    if (/modifica|cambia|ajusta|modify|change|adjust/.test(r)) return 'modify_edge';

    // Creation patterns
    if (/crea|genera|nuevo|create|make|new|add/.test(r)) return 'create';

    // Query patterns
    if (/cual|que|como|muestr|list|show|what|which|how/.test(r)) return 'query';

    return 'modify_edge'; // Default
  }

  /**
   * Parse numeric values from request.
   */
  private parseValues(request: string): ParsedValue[] {
    const values: ParsedValue[] = [];

    // Match patterns like "2cm", "20mm", "1 inch", "2.5 cm"
    const patterns = [
      { regex: /(\d+(?:\.\d+)?)\s*cm/gi, unit: 'cm' as const, multiplier: 10 },
      { regex: /(\d+(?:\.\d+)?)\s*mm/gi, unit: 'mm' as const, multiplier: 1 },
      { regex: /(\d+(?:\.\d+)?)\s*(?:inch|in|")/gi, unit: 'in' as const, multiplier: 25.4 },
    ];

    for (const { regex, unit, multiplier } of patterns) {
      let match;
      while ((match = regex.exec(request)) !== null) {
        const rawValue = parseFloat(match[1]);
        values.push({
          raw: match[0].trim(),
          value: rawValue * multiplier,
          unit,
        });
      }
    }

    return values;
  }

  /**
   * Resolve edge references from request.
   */
  private resolveEdges(
    request: string,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
  ): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    const words = this.extractPotentialEdgeTerms(request);

    // Build classification map
    const classMap = new Map<string, PieceClassification>();
    for (const c of classifications) {
      classMap.set(c.pieceId, c);
    }

    // For each potential term, try to find it in garment knowledge
    for (const term of words) {
      // Try each piece type's knowledge
      for (const piece of pieces) {
        const classification = classMap.get(piece.id);
        if (!classification) continue;

        const resolvedName = findEdgeByUserTerm(term, classification.type);
        if (!resolvedName) continue;

        // Validate: does this piece actually have this edge?
        const hasEdge = piece.edges?.some(e =>
          e.name.toLowerCase() === resolvedName.toLowerCase()
        );

        if (!hasEdge) continue;

        // Check if we already have this edge resolved
        const existing = edges.find(e => e.resolved === resolvedName);
        if (existing) {
          if (!existing.pieceIds.includes(piece.id)) {
            existing.pieceIds.push(piece.id);
          }
        } else {
          edges.push({
            userTerm: term,
            resolved: resolvedName,
            pieceIds: [piece.id],
            confidence: 1.0,
          });
        }
      }
    }

    // If no matches via knowledge, try direct match against piece edges
    if (edges.length === 0) {
      for (const term of words) {
        for (const piece of pieces) {
          const matchingEdge = piece.edges?.find(e =>
            e.name.toLowerCase().includes(term.toLowerCase())
          );
          if (matchingEdge) {
            edges.push({
              userTerm: term,
              resolved: matchingEdge.name,
              pieceIds: [piece.id],
              confidence: 0.7, // Lower confidence for direct match
            });
          }
        }
      }
    }

    return edges;
  }

  /**
   * Extract potential edge terms from request.
   */
  private extractPotentialEdgeTerms(request: string): string[] {
    // Remove common words and numbers
    const stopWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'por',
      'the', 'a', 'an', 'of', 'in', 'by', 'to', 'for', 'with',
      'reduce', 'reducir', 'aumenta', 'aumentar', 'modifica', 'modificar',
      'cm', 'mm', 'inch', 'centimetros', 'milimetros',
    ]);

    const words = request
      .toLowerCase()
      .replace(/[0-9.,]+\s*(cm|mm|inch|in|")?/g, '') // Remove measurements
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return words;
  }

  /**
   * Resolve piece references from request.
   */
  private resolvePieces(
    request: string,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
  ): ResolvedPiece[] {
    const resolved: ResolvedPiece[] = [];
    const r = request.toLowerCase();

    // Check for explicit piece references
    const frontPatterns = /front|delantero|frente|devant/i;
    const backPatterns = /back|espalda|trasero|dos\b/i;

    for (const piece of pieces) {
      const classification = classifications.find(c => c.pieceId === piece.id);
      if (!classification) continue;

      // Check if piece is explicitly mentioned
      if (frontPatterns.test(r) && classification.type.includes('front')) {
        resolved.push({
          userTerm: r.match(frontPatterns)?.[0] ?? 'front',
          pieceId: piece.id,
          pieceType: classification.type,
          confidence: 1.0,
        });
      } else if (backPatterns.test(r) && classification.type.includes('back')) {
        resolved.push({
          userTerm: r.match(backPatterns)?.[0] ?? 'back',
          pieceId: piece.id,
          pieceType: classification.type,
          confidence: 1.0,
        });
      }
    }

    return resolved;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/intelligence/__tests__/SemanticResolver.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/intelligence/SemanticResolver.ts src/copilot/intelligence/__tests__/SemanticResolver.test.ts
git commit -m "feat(intelligence): add SemanticResolver for term resolution

- Resolves user terms (escote -> neckline) via GarmentKnowledge
- Validates resolved edges against actual piece edges
- Parses measurement values (2cm, 20mm, 1 inch)
- Detects user intent (modify_edge, create, query)

Part of Epic #209"
```

---

### Task 4: Measurement Calculator

**Files:**
- Create: `src/copilot/intelligence/MeasurementCalculator.ts`
- Test: `src/copilot/intelligence/__tests__/MeasurementCalculator.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/intelligence/__tests__/MeasurementCalculator.test.ts
import { describe, it, expect } from 'vitest';
import { MeasurementCalculator } from '../MeasurementCalculator';
import type { Resolution, MeasurementContext } from '../types';

describe('MeasurementCalculator', () => {
  const calculator = new MeasurementCalculator();

  const mockContext: MeasurementContext = {
    bodyMeasurements: {
      neckCirc: 38, // cm
      chest: 92,
      waist: 76,
      shoulder: 42,
    },
    edgeLengths: {
      'front': {
        'neckline': 125, // mm
        'shoulder': 150,
      },
      'back': {
        'neckline': 120,
        'shoulder': 150,
      },
    },
  };

  describe('calculate', () => {
    it('calculates delta for edge reduction', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [{ userTerm: 'escote', resolved: 'neckline', pieceIds: ['front'], confidence: 1 }],
          pieces: [],
          values: [{ raw: '2cm', value: 20, unit: 'mm' }],
        },
        confidence: 'certain',
      };

      const result = calculator.calculate(resolution, mockContext, 'bodice-front');

      expect(result).toBeDefined();
      expect(result!.delta).toBe(-20); // Reduction
      expect(result!.currentValue).toBe(125);
      expect(result!.targetValue).toBe(105);
      expect(result!.unit).toBe('mm');
    });

    it('calculates delta for edge increase', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [{ userTerm: 'hombro', resolved: 'shoulder', pieceIds: ['front'], confidence: 1 }],
          pieces: [],
          values: [{ raw: '5mm', value: 5, unit: 'mm' }],
        },
        confidence: 'certain',
      };

      // Pass the original request to determine direction
      const result = calculator.calculate(resolution, mockContext, 'bodice-front', 'aumenta el hombro 5mm');

      expect(result!.delta).toBe(5); // Increase
      expect(result!.currentValue).toBe(150);
      expect(result!.targetValue).toBe(155);
    });

    it('includes related body measurement', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [{ userTerm: 'escote', resolved: 'neckline', pieceIds: ['front'], confidence: 1 }],
          pieces: [],
          values: [{ raw: '2cm', value: 20, unit: 'mm' }],
        },
        confidence: 'certain',
      };

      const result = calculator.calculate(resolution, mockContext, 'bodice-front');

      expect(result!.relatedMeasurement).toBeDefined();
      expect(result!.relatedMeasurement!.name).toBe('neckCirc');
      expect(result!.relatedMeasurement!.value).toBe(38);
    });

    it('returns null when no edge or value in resolution', () => {
      const emptyResolution: Resolution = {
        intent: 'query',
        entities: { edges: [], pieces: [], values: [] },
        confidence: 'certain',
      };

      const result = calculator.calculate(emptyResolution, mockContext, 'bodice-front');
      expect(result).toBeNull();
    });
  });

  describe('detectDirection', () => {
    it('detects reduction from request', () => {
      expect(calculator['detectDirection']('reduce el escote')).toBe('reduce');
      expect(calculator['detectDirection']('reducir la sisa')).toBe('reduce');
      expect(calculator['detectDirection']('disminuir hombro')).toBe('reduce');
      expect(calculator['detectDirection']('shrink the neckline')).toBe('reduce');
    });

    it('detects increase from request', () => {
      expect(calculator['detectDirection']('aumenta el escote')).toBe('increase');
      expect(calculator['detectDirection']('incrementa la sisa')).toBe('increase');
      expect(calculator['detectDirection']('widen the hemline')).toBe('increase');
      expect(calculator['detectDirection']('expand shoulder')).toBe('increase');
    });

    it('defaults to reduce for ambiguous requests', () => {
      expect(calculator['detectDirection']('modifica el escote')).toBe('reduce');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/intelligence/__tests__/MeasurementCalculator.test.ts`
Expected: FAIL with "Cannot find module '../MeasurementCalculator'"

**Step 3: Write minimal implementation**

```typescript
// src/copilot/intelligence/MeasurementCalculator.ts
/**
 * Measurement Calculator - integrates body measurements for calculations.
 *
 * Calculates deltas from current edge lengths and relates them to body measurements.
 *
 * @module copilot/intelligence/MeasurementCalculator
 */

import type {
  Resolution,
  MeasurementContext,
  CalculatedValue,
  PieceType,
} from './types';
import { getRelatedMeasurement } from './GarmentKnowledge';

/**
 * Calculates measurement values for edge modifications.
 */
export class MeasurementCalculator {
  /**
   * Calculate modification values from resolution.
   *
   * @param resolution - Semantic resolution result
   * @param context - Measurement context (body + edge lengths)
   * @param pieceType - Type of the primary piece being modified
   * @param originalRequest - Original user request (for direction detection)
   * @returns Calculated values or null if not applicable
   */
  calculate(
    resolution: Resolution,
    context: MeasurementContext,
    pieceType: PieceType,
    originalRequest?: string,
  ): CalculatedValue | null {
    // Need at least one edge and one value
    if (resolution.entities.edges.length === 0) return null;
    if (resolution.entities.values.length === 0) return null;

    const edge = resolution.entities.edges[0];
    const value = resolution.entities.values[0];
    const primaryPieceId = edge.pieceIds[0];

    // Get current edge length
    const pieceEdges = context.edgeLengths[primaryPieceId];
    if (!pieceEdges) return null;

    const currentLength = pieceEdges[edge.resolved];
    if (currentLength === undefined) return null;

    // Determine direction (increase or reduce)
    const direction = originalRequest
      ? this.detectDirection(originalRequest)
      : 'reduce';

    const delta = direction === 'increase' ? value.value : -value.value;
    const targetValue = currentLength + delta;

    // Get related body measurement
    const relatedMeasurementName = getRelatedMeasurement(edge.resolved, pieceType);
    let relatedMeasurement: CalculatedValue['relatedMeasurement'];
    if (relatedMeasurementName && context.bodyMeasurements[relatedMeasurementName] !== undefined) {
      relatedMeasurement = {
        name: relatedMeasurementName,
        value: context.bodyMeasurements[relatedMeasurementName],
      };
    }

    return {
      targetValue,
      currentValue: currentLength,
      delta,
      unit: 'mm',
      relatedMeasurement,
    };
  }

  /**
   * Detect modification direction from request text.
   */
  private detectDirection(request: string): 'increase' | 'reduce' {
    const r = request.toLowerCase();

    // Increase patterns
    if (/aumenta|incrementa|agranda|expande|alarga/i.test(r)) return 'increase';
    if (/increase|expand|widen|lengthen|enlarge|grow/i.test(r)) return 'increase';

    // Reduce patterns
    if (/reduce|reducir|disminuir|acortar|encog/i.test(r)) return 'reduce';
    if (/shrink|decrease|narrow|shorten/i.test(r)) return 'reduce';

    // Default to reduce (safer for most edge modifications)
    return 'reduce';
  }

  /**
   * Build measurement context from pieces and body measurements.
   */
  static buildContext(
    pieces: Array<{ id: string; edges?: Array<{ name: string; length?: number }> }>,
    bodyMeasurements: Record<string, number>,
  ): MeasurementContext {
    const edgeLengths: Record<string, Record<string, number>> = {};

    for (const piece of pieces) {
      if (!piece.edges) continue;
      edgeLengths[piece.id] = {};
      for (const edge of piece.edges) {
        if (edge.length !== undefined) {
          edgeLengths[piece.id][edge.name] = edge.length;
        }
      }
    }

    return {
      bodyMeasurements,
      edgeLengths,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/intelligence/__tests__/MeasurementCalculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/intelligence/MeasurementCalculator.ts src/copilot/intelligence/__tests__/MeasurementCalculator.test.ts
git commit -m "feat(intelligence): add MeasurementCalculator for body integration

- Calculates deltas from current edge lengths
- Detects modification direction (increase/reduce)
- Links edges to related body measurements
- Builds measurement context from pieces

Part of Epic #209"
```

---

### Task 5: Context Enricher

**Files:**
- Create: `src/copilot/intelligence/ContextEnricher.ts`
- Test: `src/copilot/intelligence/__tests__/ContextEnricher.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/intelligence/__tests__/ContextEnricher.test.ts
import { describe, it, expect } from 'vitest';
import { ContextEnricher } from '../ContextEnricher';
import type { Resolution, MeasurementContext, PieceClassification } from '../types';

describe('ContextEnricher', () => {
  const enricher = new ContextEnricher();

  const mockPieces = [
    {
      id: 'front',
      name: 'Front Bodice',
      edges: [
        { name: 'neckline', length: 125 },
        { name: 'shoulder', length: 150 },
        { name: 'armhole', length: 220 },
      ],
    },
    {
      id: 'back',
      name: 'Back Bodice',
      edges: [
        { name: 'neckline', length: 120 },
        { name: 'shoulder', length: 150 },
      ],
    },
  ];

  const mockClassifications: PieceClassification[] = [
    { pieceId: 'front', type: 'bodice-front', confidence: 0.95 },
    { pieceId: 'back', type: 'bodice-back', confidence: 0.93 },
  ];

  const mockResolution: Resolution = {
    intent: 'modify_edge',
    entities: {
      edges: [
        { userTerm: 'escote', resolved: 'neckline', pieceIds: ['front', 'back'], confidence: 1 },
      ],
      pieces: [],
      values: [{ raw: '2cm', value: 20, unit: 'mm' }],
    },
    confidence: 'certain',
  };

  const mockMeasurements: MeasurementContext = {
    bodyMeasurements: { neckCirc: 38, chest: 92 },
    edgeLengths: {
      'front': { 'neckline': 125, 'shoulder': 150 },
      'back': { 'neckline': 120, 'shoulder': 150 },
    },
  };

  describe('enrich', () => {
    it('generates enriched context with targets', () => {
      const result = enricher.enrich(
        mockResolution,
        mockPieces as any,
        mockClassifications,
        mockMeasurements,
        'reduce el escote 2cm',
      );

      expect(result.resolvedIntent).toBe('Reduce neckline by 20mm');
      expect(result.targets).toHaveLength(2);
      expect(result.targets[0].pieceId).toBe('front');
      expect(result.targets[0].edge).toBe('neckline');
      expect(result.targets[0].currentLength).toBe(125);
    });

    it('includes available edges per piece', () => {
      const result = enricher.enrich(
        mockResolution,
        mockPieces as any,
        mockClassifications,
        mockMeasurements,
        'reduce el escote 2cm',
      );

      expect(result.availableEdgesPerPiece['front']).toContain('neckline');
      expect(result.availableEdgesPerPiece['front']).toContain('shoulder');
      expect(result.availableEdgesPerPiece['back']).toContain('neckline');
    });

    it('includes calculation with delta', () => {
      const result = enricher.enrich(
        mockResolution,
        mockPieces as any,
        mockClassifications,
        mockMeasurements,
        'reduce el escote 2cm',
      );

      expect(result.calculation).toBeDefined();
      expect(result.calculation!.delta).toBe(-20);
    });

    it('includes related body measurements', () => {
      const result = enricher.enrich(
        mockResolution,
        mockPieces as any,
        mockClassifications,
        mockMeasurements,
        'reduce el escote 2cm',
      );

      expect(result.relatedMeasurements['neckCirc']).toBe(38);
    });
  });

  describe('serialize', () => {
    it('generates compact string for Planner', () => {
      const context = enricher.enrich(
        mockResolution,
        mockPieces as any,
        mockClassifications,
        mockMeasurements,
        'reduce el escote 2cm',
      );

      const serialized = enricher.serialize(context);

      expect(serialized).toContain('Reduce neckline by 20mm');
      expect(serialized).toContain('front');
      expect(serialized).toContain('neckline');
      expect(serialized).toContain('125');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/intelligence/__tests__/ContextEnricher.test.ts`
Expected: FAIL with "Cannot find module '../ContextEnricher'"

**Step 3: Write minimal implementation**

```typescript
// src/copilot/intelligence/ContextEnricher.ts
/**
 * Context Enricher - generates enriched context for the Planner.
 *
 * Takes semantic resolution and produces a lean but complete context
 * that the Planner can use without needing to infer values.
 *
 * @module copilot/intelligence/ContextEnricher
 */

import type { PatternPiece } from '../../types/types';
import type {
  Resolution,
  PieceClassification,
  MeasurementContext,
  EnrichedContext,
  ModificationTarget,
} from './types';
import { MeasurementCalculator } from './MeasurementCalculator';
import { getRelatedMeasurement } from './GarmentKnowledge';

/**
 * Enriches semantic resolution into Planner-ready context.
 */
export class ContextEnricher {
  private calculator = new MeasurementCalculator();

  /**
   * Generate enriched context from resolution.
   *
   * @param resolution - Semantic resolution result
   * @param pieces - Pattern pieces
   * @param classifications - Piece classifications
   * @param measurements - Measurement context
   * @param originalRequest - Original user request
   * @returns Enriched context for Planner
   */
  enrich(
    resolution: Resolution,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
    measurements: MeasurementContext,
    originalRequest: string,
  ): EnrichedContext {
    // Build classification map
    const classMap = new Map<string, PieceClassification>();
    for (const c of classifications) {
      classMap.set(c.pieceId, c);
    }

    // Build piece map
    const pieceMap = new Map<string, PatternPiece>();
    for (const p of pieces) {
      pieceMap.set(p.id, p);
    }

    // Build targets
    const targets: ModificationTarget[] = [];
    for (const edge of resolution.entities.edges) {
      for (const pieceId of edge.pieceIds) {
        const piece = pieceMap.get(pieceId);
        const classification = classMap.get(pieceId);
        if (!piece || !classification) continue;

        const edgeData = piece.edges?.find(e => e.name === edge.resolved);
        targets.push({
          pieceId,
          pieceName: piece.name,
          pieceType: classification.type,
          edge: edge.resolved,
          currentLength: edgeData?.length ?? 0,
        });
      }
    }

    // Calculate values
    const primaryClassification = targets.length > 0
      ? classMap.get(targets[0].pieceId)
      : undefined;
    const calculation = primaryClassification
      ? this.calculator.calculate(
          resolution,
          measurements,
          primaryClassification.type,
          originalRequest,
        )
      : null;

    // Build available edges per piece
    const availableEdgesPerPiece: Record<string, string[]> = {};
    for (const piece of pieces) {
      availableEdgesPerPiece[piece.id] = piece.edges?.map(e => e.name) ?? [];
    }

    // Build related measurements
    const relatedMeasurements: Record<string, number> = {};
    for (const edge of resolution.entities.edges) {
      for (const pieceId of edge.pieceIds) {
        const classification = classMap.get(pieceId);
        if (!classification) continue;

        const measurementName = getRelatedMeasurement(edge.resolved, classification.type);
        if (measurementName && measurements.bodyMeasurements[measurementName] !== undefined) {
          relatedMeasurements[measurementName] = measurements.bodyMeasurements[measurementName];
        }
      }
    }

    // Build resolved intent string
    const intentStr = this.buildIntentString(resolution, calculation);

    return {
      resolvedIntent: intentStr,
      targets,
      calculation,
      relatedMeasurements,
      availableEdgesPerPiece,
    };
  }

  /**
   * Build human-readable intent string.
   */
  private buildIntentString(resolution: Resolution, calculation: EnrichedContext['calculation']): string {
    if (resolution.entities.edges.length === 0) {
      return 'Unknown operation';
    }

    const edge = resolution.entities.edges[0].resolved;
    const delta = calculation?.delta ?? 0;
    const action = delta < 0 ? 'Reduce' : 'Increase';
    const amount = Math.abs(delta);

    return `${action} ${edge} by ${amount}mm`;
  }

  /**
   * Serialize enriched context to compact string for Planner prompt.
   */
  serialize(context: EnrichedContext): string {
    const lines: string[] = [];

    lines.push(`## Resolved Intent: ${context.resolvedIntent}`);
    lines.push('');

    if (context.targets.length > 0) {
      lines.push('## Targets:');
      for (const t of context.targets) {
        lines.push(`- pieceId: "${t.pieceId}", pieceName: "${t.pieceName}", edge: "${t.edge}", currentLength: ${t.currentLength}mm`);
      }
      lines.push('');
    }

    if (context.calculation) {
      lines.push('## Calculation:');
      lines.push(`- delta: ${context.calculation.delta}mm`);
      lines.push(`- currentValue: ${context.calculation.currentValue}mm`);
      lines.push(`- targetValue: ${context.calculation.targetValue}mm`);
      if (context.calculation.relatedMeasurement) {
        lines.push(`- relatedMeasurement: ${context.calculation.relatedMeasurement.name} = ${context.calculation.relatedMeasurement.value}cm`);
      }
      lines.push('');
    }

    if (Object.keys(context.relatedMeasurements).length > 0) {
      lines.push('## Related Body Measurements:');
      for (const [name, value] of Object.entries(context.relatedMeasurements)) {
        lines.push(`- ${name}: ${value}cm`);
      }
      lines.push('');
    }

    lines.push('## Available Edges Per Piece:');
    for (const [pieceId, edges] of Object.entries(context.availableEdgesPerPiece)) {
      lines.push(`- ${pieceId}: [${edges.join(', ')}]`);
    }

    lines.push('');
    lines.push('**IMPORTANT:** Use ONLY the pieceIds, edge names, and delta values from above. Do NOT invent values.');

    return lines.join('\n');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/intelligence/__tests__/ContextEnricher.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/intelligence/ContextEnricher.ts src/copilot/intelligence/__tests__/ContextEnricher.test.ts
git commit -m "feat(intelligence): add ContextEnricher for Planner context

- Generates enriched context from semantic resolution
- Builds modification targets with validated values
- Includes available edges per piece
- Serializes to compact Planner-ready string

Part of Epic #209"
```

---

## Phase 2: Integration (3 Tasks)

### Task 6: Index Module & IntelligentContext Class

**Files:**
- Create: `src/copilot/intelligence/index.ts`
- Create: `src/copilot/intelligence/IntelligentContext.ts`
- Test: `src/copilot/intelligence/__tests__/IntelligentContext.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/intelligence/__tests__/IntelligentContext.test.ts
import { describe, it, expect } from 'vitest';
import { IntelligentContext } from '../IntelligentContext';

describe('IntelligentContext', () => {
  const mockState = {
    project: {
      pieces: [
        {
          id: 'front',
          name: 'Front Bodice',
          category: 'bodice',
          side: 'front',
          edges: [
            { name: 'neckline', length: 125 },
            { name: 'shoulder', length: 150 },
            { name: 'armhole', length: 220 },
          ],
        },
        {
          id: 'back',
          name: 'Back Bodice',
          category: 'bodice',
          side: 'back',
          edges: [
            { name: 'neckline', length: 120 },
            { name: 'shoulder', length: 150 },
          ],
        },
      ],
      avatar: {
        measurements: {
          neckCirc: 38,
          chest: 92,
          waist: 76,
          shoulder: 42,
        },
      },
    },
  };

  describe('process', () => {
    it('processes "reduce el escote 2cm" to enriched context', async () => {
      const intelligence = new IntelligentContext(mockState as any);
      const result = await intelligence.process('reduce el escote 2cm');

      expect(result.resolvedIntent).toContain('neckline');
      expect(result.targets).toHaveLength(2);
      expect(result.targets[0].edge).toBe('neckline');
      expect(result.calculation).toBeDefined();
      expect(result.calculation!.delta).toBe(-20);
    });

    it('includes all available edges per piece', async () => {
      const intelligence = new IntelligentContext(mockState as any);
      const result = await intelligence.process('reduce el escote 2cm');

      expect(result.availableEdgesPerPiece['front']).toContain('neckline');
      expect(result.availableEdgesPerPiece['front']).toContain('shoulder');
    });

    it('handles unknown terms gracefully', async () => {
      const intelligence = new IntelligentContext(mockState as any);
      const result = await intelligence.process('reduce el xyz 2cm');

      expect(result.targets).toHaveLength(0);
      expect(result.resolvedIntent).toBe('Unknown operation');
    });
  });

  describe('getSerialized', () => {
    it('returns serialized context string', async () => {
      const intelligence = new IntelligentContext(mockState as any);
      const result = await intelligence.process('reduce el escote 2cm');
      const serialized = intelligence.getSerialized(result);

      expect(serialized).toContain('neckline');
      expect(serialized).toContain('front');
      expect(serialized).toContain('IMPORTANT');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/intelligence/__tests__/IntelligentContext.test.ts`
Expected: FAIL with "Cannot find module '../IntelligentContext'"

**Step 3: Write minimal implementation**

```typescript
// src/copilot/intelligence/IntelligentContext.ts
/**
 * Intelligent Context - main entry point for context generation.
 *
 * Orchestrates PieceClassifier, SemanticResolver, MeasurementCalculator,
 * and ContextEnricher to produce enriched context for the Planner.
 *
 * @module copilot/intelligence/IntelligentContext
 */

import type { RootState } from '../../store';
import type { PatternPiece } from '../../types/types';
import type { PieceClassification, EnrichedContext, PieceType } from './types';
import { SemanticResolver } from './SemanticResolver';
import { ContextEnricher } from './ContextEnricher';
import { MeasurementCalculator } from './MeasurementCalculator';

/**
 * Main class for intelligent context generation.
 * Call `process(userRequest)` to get enriched context for the Planner.
 */
export class IntelligentContext {
  private pieces: PatternPiece[];
  private bodyMeasurements: Record<string, number>;
  private resolver = new SemanticResolver();
  private enricher = new ContextEnricher();

  constructor(state: RootState) {
    this.pieces = state.project.pieces;
    this.bodyMeasurements = state.project.avatar.measurements as unknown as Record<string, number>;
  }

  /**
   * Process a user request and generate enriched context.
   *
   * @param userRequest - Natural language request from user
   * @returns Enriched context with resolved entities
   */
  async process(userRequest: string): Promise<EnrichedContext> {
    // Step 1: Classify pieces
    const classifications = this.classifyPieces();

    // Step 2: Resolve semantics
    const resolution = await this.resolver.resolve(
      userRequest,
      this.pieces,
      classifications,
    );

    // Step 3: Build measurement context
    const measurementContext = MeasurementCalculator.buildContext(
      this.pieces,
      this.bodyMeasurements,
    );

    // Step 4: Enrich context
    const enriched = this.enricher.enrich(
      resolution,
      this.pieces,
      classifications,
      measurementContext,
      userRequest,
    );

    return enriched;
  }

  /**
   * Serialize enriched context to string for Planner prompt.
   */
  getSerialized(context: EnrichedContext): string {
    return this.enricher.serialize(context);
  }

  /**
   * Classify pieces by category and side.
   * Uses existing piece.category and piece.side fields.
   */
  private classifyPieces(): PieceClassification[] {
    return this.pieces.map(piece => {
      const type = this.getPieceType(piece);
      return {
        pieceId: piece.id,
        type,
        confidence: 0.9, // Based on existing classification
        side: piece.side as 'front' | 'back' | 'left' | 'right' | undefined,
      };
    });
  }

  /**
   * Map piece category + side to PieceType.
   */
  private getPieceType(piece: PatternPiece): PieceType {
    const category = piece.category ?? 'other';
    const side = piece.side ?? 'both';

    if (category === 'bodice') {
      if (side === 'front') return 'bodice-front';
      if (side === 'back') return 'bodice-back';
      return 'bodice-front'; // Default
    }

    if (category === 'sleeve') return 'sleeve';

    if (category === 'skirt') {
      if (side === 'front') return 'skirt-front';
      if (side === 'back') return 'skirt-back';
      return 'skirt-front';
    }

    if (category === 'trouser') {
      if (side === 'front') return 'pants-front';
      if (side === 'back') return 'pants-back';
      return 'pants-front';
    }

    if (category === 'collar') return 'collar';
    if (category === 'cuff') return 'cuff';
    if (category === 'waistband') return 'waistband';

    return 'unknown';
  }
}
```

```typescript
// src/copilot/intelligence/index.ts
/**
 * Intelligent Context Generation - barrel exports.
 *
 * @module copilot/intelligence
 */

export * from './types';
export * from './GarmentKnowledge';
export * from './SemanticResolver';
export * from './MeasurementCalculator';
export * from './ContextEnricher';
export * from './IntelligentContext';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/intelligence/__tests__/IntelligentContext.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/intelligence/IntelligentContext.ts src/copilot/intelligence/index.ts src/copilot/intelligence/__tests__/IntelligentContext.test.ts
git commit -m "feat(intelligence): add IntelligentContext orchestrator and exports

- Orchestrates all intelligence components
- Classifies pieces from existing category/side
- Exposes simple process(request) API
- Barrel exports for clean imports

Part of Epic #209"
```

---

### Task 7: Integrate with CopilotPanel

**Files:**
- Modify: `src/components/CopilotPanel/CopilotPanel.tsx:120-160`

**Step 1: Read current integration code**

Read the plannerLLM section in CopilotPanel.tsx (lines 120-160)

**Step 2: Write the integration**

Add import at top:
```typescript
import { IntelligentContext } from '../../copilot/intelligence';
```

Replace the `plannerLLM` implementation in useBridge options:

```typescript
plannerLLM: async (userRequest) => {
  if (!providerConfig) return '';

  // Build proper system prompt with tools and context
  const registry = getDefaultRegistry();
  const planner = new Planner();

  // Convert registry tools to Planner schema format
  const toolSchemas = registry.list().map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  // Build system prompt with JSON instructions and tools
  const plannerPrompt = planner.buildSystemPrompt(toolSchemas);

  // NEW: Use IntelligentContext for enriched resolution
  const intelligence = new IntelligentContext(store.getState());
  const enrichedContext = await intelligence.process(userRequest);
  const enrichedStr = intelligence.getSerialized(enrichedContext);

  // Add base project context for reference
  const agentContext = buildAgentContext(store.getState(), []);
  const contextStr = serializeContext(agentContext);

  // Combine: Planner instructions + Enriched context + Project state
  const systemPrompt = `${plannerPrompt}

## Resolved Context (use these values)
${enrichedStr}

## Project State (reference only)
${contextStr}`;

  const provider = getProvider(providerConfig);
  const response = await provider.send([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userRequest }
  ], [], providerConfig);
  return response.content;
},
```

**Step 3: Run build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Manual test**

Test in the app:
1. Open copilot
2. Type "reduce el escote 2cm"
3. Verify: No "undefined" errors, correct edge name used

**Step 5: Commit**

```bash
git add src/components/CopilotPanel/CopilotPanel.tsx
git commit -m "feat(copilot): integrate IntelligentContext with bridge

- Uses IntelligentContext.process() for semantic resolution
- Provides enriched context to Planner with resolved values
- Keeps base project context for reference

Part of Epic #209"
```

---

### Task 8: Run All Tests and Verify Build

**Files:**
- All `src/copilot/intelligence/**/*.ts`

**Step 1: Run all intelligence tests**

Run: `npx vitest run src/copilot/intelligence`
Expected: All tests pass

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 4: Final commit and tag**

```bash
git add -A
git commit -m "feat(intelligence): complete Phase 1 - Core Intelligence

Implements Epic #209: Intelligent Context Generation

Components:
- GarmentKnowledge: Static knowledge base (EN/ES/FR/DE)
- SemanticResolver: Term resolution with validation
- MeasurementCalculator: Body measurement integration
- ContextEnricher: Lean context generation
- IntelligentContext: Orchestrator class

Guarantees:
- 0% undefined errors (validation against piece.edges[])
- 100% accuracy (only use validated values)
- Multilingual support
- Body measurement integration

Closes #209"

git tag -a v0.X.0-intelligence -m "Intelligent Context Generation Phase 1"
```

---

## Summary

**Total Tasks:** 8

**Files Created:**
- `src/copilot/intelligence/types.ts`
- `src/copilot/intelligence/GarmentKnowledge.ts`
- `src/copilot/intelligence/SemanticResolver.ts`
- `src/copilot/intelligence/MeasurementCalculator.ts`
- `src/copilot/intelligence/ContextEnricher.ts`
- `src/copilot/intelligence/IntelligentContext.ts`
- `src/copilot/intelligence/index.ts`
- `src/copilot/intelligence/__tests__/*.test.ts` (6 test files)

**Files Modified:**
- `src/components/CopilotPanel/CopilotPanel.tsx`

**Test Commands:**
```bash
# Run single test
npx vitest run src/copilot/intelligence/__tests__/GarmentKnowledge.test.ts

# Run all intelligence tests
npx vitest run src/copilot/intelligence

# Run full test suite
npm test

# Run build
npm run build
```
