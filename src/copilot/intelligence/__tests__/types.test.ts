import { describe, it, expect } from 'vitest';
import type {
  PieceType,
  PieceClassification,
  Resolution,
  ResolvedEdge,
  ParsedValue,
  MeasurementContext,
  EnrichedContext,
} from '../types';

describe('Intelligence Types', () => {
  describe('PieceType', () => {
    it('should include all garment piece types', () => {
      const types: PieceType[] = [
        'bodice-front',
        'bodice-back',
        'sleeve',
        'pants-front',
        'pants-back',
        'skirt-front',
        'skirt-back',
        'collar',
        'cuff',
        'unknown',
      ];
      expect(types).toHaveLength(10);
    });
  });

  describe('PieceClassification', () => {
    it('should have required fields', () => {
      const classification: PieceClassification = {
        pieceId: 'front-1',
        type: 'bodice-front',
        confidence: 0.95,
        side: 'front',
      };
      expect(classification.pieceId).toBe('front-1');
      expect(classification.type).toBe('bodice-front');
      expect(classification.confidence).toBe(0.95);
      expect(classification.side).toBe('front');
    });

    it('should allow optional side', () => {
      const classification: PieceClassification = {
        pieceId: 'sleeve-1',
        type: 'sleeve',
        confidence: 0.9,
      };
      expect(classification.side).toBeUndefined();
    });
  });

  describe('Resolution', () => {
    it('should capture intent and entities', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [],
          pieces: [],
          values: [],
        },
        confidence: 'certain',
      };
      expect(resolution.intent).toBe('modify_edge');
      expect(resolution.confidence).toBe('certain');
    });
  });

  describe('ResolvedEdge', () => {
    it('should map user term to resolved name', () => {
      const edge: ResolvedEdge = {
        userTerm: 'escote',
        resolved: 'neckline',
        pieceIds: ['front-1', 'back-1'],
        confidence: 0.95,
      };
      expect(edge.userTerm).toBe('escote');
      expect(edge.resolved).toBe('neckline');
      expect(edge.pieceIds).toContain('front-1');
    });
  });

  describe('ParsedValue', () => {
    it('should capture numeric value with unit', () => {
      const value: ParsedValue = {
        raw: '2cm',
        value: 20,
        unit: 'mm',
        operation: 'reduce',
      };
      expect(value.raw).toBe('2cm');
      expect(value.value).toBe(20);
      expect(value.unit).toBe('mm');
      expect(value.operation).toBe('reduce');
    });
  });

  describe('MeasurementContext', () => {
    it('should contain body and edge measurements', () => {
      const context: MeasurementContext = {
        bodyMeasurements: {
          bustCircumference: 920,
          neckCircumference: 380,
        },
        edgeLengths: {
          'front-1': {
            neckline: 125,
            shoulder: 140,
          },
        },
      };
      expect(context.bodyMeasurements.bustCircumference).toBe(920);
      expect(context.edgeLengths['front-1'].neckline).toBe(125);
    });
  });

  describe('EnrichedContext', () => {
    it('should provide complete context for planner', () => {
      const enriched: EnrichedContext = {
        resolvedIntent: 'modify_edge',
        targets: [
          {
            pieceId: 'front-1',
            pieceName: 'Front',
            pieceType: 'bodice-front',
            edge: 'neckline',
            currentLength: 125,
          },
        ],
        calculation: {
          targetValue: 105,
          currentValue: 125,
          delta: -20,
          unit: 'mm',
        },
        relatedMeasurements: {
          neckCircumference: 380,
        },
        availableEdgesPerPiece: {
          'front-1': ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline'],
        },
      };
      expect(enriched.targets).toHaveLength(1);
      expect(enriched.calculation.delta).toBe(-20);
    });
  });
});
