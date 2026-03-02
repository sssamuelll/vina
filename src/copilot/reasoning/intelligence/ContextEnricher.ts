/**
 * Context Enricher - generates enriched context for the Planner.
 *
 * Takes semantic resolution and produces a lean but complete context
 * that the Planner can use without needing to infer values.
 *
 * Uses detectSemanticEdges for geometry-based edge detection when
 * piece.edges is not populated.
 *
 * @module copilot/intelligence/ContextEnricher
 */

import type { PatternPiece, SemanticEdge } from '../../../types/types';
import type {
  Resolution,
  PieceClassification,
  MeasurementContext,
  EnrichedContext,
  ModificationTarget,
  CalculatedValue,
} from './types';
import { MeasurementCalculator } from './MeasurementCalculator';
import { getRelatedMeasurement } from './GarmentKnowledge';
import { detectSemanticEdges } from '../../../utils/semanticEdges';

/**
 * Get edges for a piece, using geometry-based detection if not populated.
 */
function getEdges(piece: PatternPiece): SemanticEdge[] {
  if (piece.edges && piece.edges.length > 0) {
    return piece.edges;
  }
  return detectSemanticEdges(piece);
}

/**
 * Enriches semantic resolution into Planner-ready context.
 */
export class ContextEnricher {
  private calculator = new MeasurementCalculator();

  /**
   * Generate enriched context from resolution.
   */
  enrich(
    resolution: Resolution,
    pieces: PatternPiece[],
    classifications: PieceClassification[],
    measurements: MeasurementContext,
    originalRequest: string,
  ): EnrichedContext {
    const classMap = new Map<string, PieceClassification>();
    for (const c of classifications) {
      classMap.set(c.pieceId, c);
    }

    const pieceMap = new Map<string, PatternPiece>();
    for (const p of pieces) {
      pieceMap.set(p.id, p);
    }

    const targets: ModificationTarget[] = [];
    for (const edge of resolution.entities.edges) {
      for (const pieceId of edge.pieceIds) {
        const piece = pieceMap.get(pieceId);
        const classification = classMap.get(pieceId);
        if (!piece || !classification) continue;

        // Use geometry-based edge detection if piece.edges not populated
        const edges = getEdges(piece);
        const edgeData = edges.find(e => e.name === edge.resolved);
        targets.push({
          pieceId,
          pieceName: piece.name,
          pieceType: classification.type,
          edge: edge.resolved,
          currentLength: edgeData?.length ?? 0,
        });
      }
    }

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

    const availableEdgesPerPiece: Record<string, string[]> = {};
    for (const piece of pieces) {
      // Use geometry-based edge detection if piece.edges not populated
      const edges = getEdges(piece);
      availableEdgesPerPiece[piece.id] = edges.map(e => e.name);
    }

    const relatedMeasurements: Record<string, number> = {};
    for (const edge of resolution.entities.edges) {
      for (const pieceId of edge.pieceIds) {
        const classification = classMap.get(pieceId);
        if (!classification) continue;

        const measurementName = getRelatedMeasurement(edge.resolved, classification.type);
        if (measurementName) {
          // Cast to access by dynamic key - the knowledge base guarantees valid keys
          const bodyMeasurements = measurements.bodyMeasurements as unknown as Record<string, number | undefined>;
          const value = bodyMeasurements[measurementName];
          if (value !== undefined) {
            relatedMeasurements[measurementName] = value;
          }
        }
      }
    }

    const intentStr = this.buildIntentString(resolution, calculation);

    // Build default calculation if none was computed
    const finalCalculation: CalculatedValue = calculation ?? {
      targetValue: 0,
      currentValue: 0,
      delta: 0,
      unit: 'mm',
    };

    return {
      resolvedIntent: intentStr,
      targets,
      calculation: finalCalculation,
      relatedMeasurements,
      availableEdgesPerPiece,
    };
  }

  private buildIntentString(resolution: Resolution, calculation: CalculatedValue | null): string {
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
