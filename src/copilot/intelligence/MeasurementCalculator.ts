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
   */
  calculate(
    resolution: Resolution,
    context: MeasurementContext,
    pieceType: PieceType,
    originalRequest?: string,
  ): CalculatedValue | null {
    if (resolution.entities.edges.length === 0) return null;
    if (resolution.entities.values.length === 0) return null;

    const edge = resolution.entities.edges[0];
    const value = resolution.entities.values[0];
    const primaryPieceId = edge.pieceIds[0];

    const pieceEdges = context.edgeLengths[primaryPieceId];
    if (!pieceEdges) return null;

    const currentLength = pieceEdges[edge.resolved];
    if (currentLength === undefined) return null;

    const direction = originalRequest
      ? this.detectDirection(originalRequest)
      : 'reduce';

    const delta = direction === 'increase' ? value.value : -value.value;
    const targetValue = currentLength + delta;

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

    if (/aumenta|incrementa|agranda|expande|alarga/i.test(r)) return 'increase';
    if (/increase|expand|widen|lengthen|enlarge|grow/i.test(r)) return 'increase';

    if (/reduce|reducir|disminuir|acortar|encog/i.test(r)) return 'reduce';
    if (/shrink|decrease|narrow|shorten/i.test(r)) return 'reduce';

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
