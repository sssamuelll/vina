/**
 * Intelligent Context - main entry point for context generation.
 *
 * Orchestrates SemanticResolver, MeasurementCalculator,
 * and ContextEnricher to produce enriched context for the Planner.
 *
 * @module copilot/intelligence/IntelligentContext
 */

import type { PatternPiece, BodyMeasurements } from '../../../types/types';
import type { PieceClassification, EnrichedContext, PieceType } from './types';
import { SemanticResolver } from './SemanticResolver';
import { ContextEnricher } from './ContextEnricher';
import { MeasurementCalculator } from './MeasurementCalculator';

interface MinimalState {
  project: {
    pieces: PatternPiece[];
    avatar: {
      measurements: BodyMeasurements;
    };
  };
}

/**
 * Main class for intelligent context generation.
 */
export class IntelligentContext {
  private pieces: PatternPiece[];
  private bodyMeasurements: BodyMeasurements;
  private resolver = new SemanticResolver();
  private enricher = new ContextEnricher();

  constructor(state: MinimalState) {
    this.pieces = state.project.pieces;
    this.bodyMeasurements = state.project.avatar?.measurements ?? {} as BodyMeasurements;
  }

  /**
   * Process a user request and generate enriched context.
   */
  process(userRequest: string): EnrichedContext {
    // Step 1: Classify pieces
    const classifications = this.classifyPieces();

    // Step 2: Resolve semantics
    const resolution = this.resolver.resolve(
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
   */
  private classifyPieces(): PieceClassification[] {
    return this.pieces.map(piece => {
      const type = this.getPieceType(piece);
      return {
        pieceId: piece.id,
        type,
        confidence: 0.9,
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
      return 'bodice-front';
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

    return 'unknown';
  }
}
