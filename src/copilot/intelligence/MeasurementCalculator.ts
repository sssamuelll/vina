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
import type { BodyMeasurements } from '../../types/types';
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

    // Determine direction from parsed value operation, or detect from request
    let direction: 'increase' | 'reduce' = 'reduce';
    if (value.operation === 'increase') {
      direction = 'increase';
    } else if (value.operation === 'reduce') {
      direction = 'reduce';
    } else if (originalRequest) {
      direction = this.detectDirection(originalRequest);
    }

    const delta = direction === 'increase' ? value.value : -value.value;
    const targetValue = currentLength + delta;

    const relatedMeasurementName = getRelatedMeasurement(edge.resolved, pieceType);
    let relatedMeasurement: CalculatedValue['relatedMeasurement'];
    if (relatedMeasurementName) {
      // Cast to access by dynamic key - the knowledge base guarantees valid keys
      const measurements = context.bodyMeasurements as unknown as Record<string, number | undefined>;
      const measurementValue = measurements[relatedMeasurementName];
      if (measurementValue !== undefined) {
        relatedMeasurement = {
          name: relatedMeasurementName,
          value: measurementValue,
        };
      }
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

    if (/aumenta|incrementa|agranda|expande|alarga/.test(r)) return 'increase';
    if (/increase|expand|widen|lengthen|enlarge|grow/.test(r)) return 'increase';

    if (/reduce|reducir|disminuir|acortar|encog/.test(r)) return 'reduce';
    if (/shrink|decrease|narrow|shorten/.test(r)) return 'reduce';

    return 'reduce';
  }

  /**
   * Build measurement context from pieces and body measurements.
   */
  static buildContext(
    pieces: Array<{ id: string; edges?: Array<{ name: string; length?: number }> }>,
    bodyMeasurements: BodyMeasurements,
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
