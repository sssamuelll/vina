/**
 * Type definitions for Intelligent Context Generation.
 *
 * These types support the pipeline:
 * PieceClassifier → SemanticResolver → MeasurementCalculator → ContextEnricher
 *
 * @module copilot/intelligence/types
 */

import type { BodyMeasurements } from '../../../types/types';

// ─── Piece Classification ────────────────────────────────────────────────────

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
  | 'unknown';

export type PieceSide = 'front' | 'back' | 'left' | 'right';

export interface PieceClassification {
  pieceId: string;
  type: PieceType;
  /** Confidence score from 0 (none) to 1 (certain) */
  confidence: number;
  side?: PieceSide;
}

// ─── Semantic Resolution ─────────────────────────────────────────────────────

export type IntentType = 'modify_edge' | 'modify_piece' | 'create' | 'query';

export type ConfidenceLevel = 'certain' | 'probable' | 'ambiguous';

export interface ResolvedEdge {
  userTerm: string;
  resolved: string;
  pieceIds: string[];
  /** Confidence score from 0 (none) to 1 (certain) */
  confidence: number;
}

export interface ResolvedPiece {
  userTerm: string;
  pieceId: string;
  type: PieceType;
  /** Confidence score from 0 (none) to 1 (certain) */
  confidence: number;
}

export type OperationType = 'increase' | 'reduce' | 'set';

export interface ParsedValue {
  raw: string;
  value: number;
  unit: 'mm' | 'cm';
  operation: OperationType;
}

export interface Resolution {
  intent: IntentType;
  entities: {
    edges: ResolvedEdge[];
    pieces: ResolvedPiece[];
    values: ParsedValue[];
  };
  confidence: ConfidenceLevel;
}

// ─── Measurement Context ─────────────────────────────────────────────────────

export interface MeasurementContext {
  bodyMeasurements: BodyMeasurements;
  edgeLengths: Record<string, Record<string, number>>;
}

export interface CalculatedValue {
  targetValue: number;
  currentValue: number;
  delta: number;
  unit: 'mm' | 'cm';
  relatedMeasurement?: {
    name: string;
    value: number;
  };
}

// ─── Enriched Context ────────────────────────────────────────────────────────

export interface ModificationTarget {
  pieceId: string;
  pieceName: string;
  pieceType: PieceType;
  edge: string;
  currentLength: number;
}

export interface EnrichedContext {
  resolvedIntent: string;
  targets: ModificationTarget[];
  calculation: CalculatedValue;
  relatedMeasurements: Record<string, number>;
  availableEdgesPerPiece: Record<string, string[]>;
}

// ─── Garment Knowledge ──────────────────────────────────────────────────────

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
