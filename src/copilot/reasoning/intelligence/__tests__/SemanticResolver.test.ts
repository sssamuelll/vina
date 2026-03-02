import { describe, it, expect } from 'vitest';
import { SemanticResolver } from '../SemanticResolver';
import type { PieceClassification } from '../types';
import type { PatternPiece } from '../../../../types/types';

describe('SemanticResolver', () => {
  const resolver = new SemanticResolver();

  // Mock pieces with edges - using Partial<PatternPiece> for minimal required fields
  const mockPieces: Partial<PatternPiece>[] = [
    {
      id: 'front',
      name: 'Front Bodice',
      edges: [
        { id: 'e1', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 125 },
        { id: 'e2', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 150 },
        { id: 'e3', name: 'armhole', segmentRange: [2, 3], edgeType: 'seam', length: 220 },
        { id: 'e4', name: 'sideSeam', segmentRange: [3, 4], edgeType: 'seam', length: 300 },
      ],
    },
    {
      id: 'back',
      name: 'Back Bodice',
      edges: [
        { id: 'e5', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 120 },
        { id: 'e6', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 150 },
        { id: 'e7', name: 'armhole', segmentRange: [2, 3], edgeType: 'seam', length: 220 },
        { id: 'e8', name: 'sideSeam', segmentRange: [3, 4], edgeType: 'seam', length: 300 },
      ],
    },
  ];

  const mockClassifications: PieceClassification[] = [
    { pieceId: 'front', type: 'bodice-front', confidence: 0.95 },
    { pieceId: 'back', type: 'bodice-back', confidence: 0.93 },
  ];

  describe('resolve', () => {
    it('resolves "reduce el escote 2cm" with certain confidence', () => {
      const result = resolver.resolve(
        'reduce el escote 2cm',
        mockPieces as PatternPiece[],
        mockClassifications,
      );

      expect(result.intent).toBe('modify_edge');
      expect(result.confidence).toBe('certain');
      expect(result.entities.edges).toHaveLength(2);
      expect(result.entities.edges[0].resolved).toBe('neckline');
      expect(result.entities.edges[0].userTerm).toBe('escote');
      expect(result.entities.values).toHaveLength(1);
      expect(result.entities.values[0].value).toBe(20);
    });

    it('resolves "aumenta el hombro 5mm"', () => {
      const result = resolver.resolve(
        'aumenta el hombro 5mm',
        mockPieces as PatternPiece[],
        mockClassifications,
      );

      expect(result.intent).toBe('modify_edge');
      expect(result.entities.edges[0].resolved).toBe('shoulder');
      expect(result.entities.values[0].value).toBe(5);
    });

    it('resolves English terms: "reduce neckline by 1 inch"', () => {
      const result = resolver.resolve(
        'reduce neckline by 1 inch',
        mockPieces as PatternPiece[],
        mockClassifications,
      );

      expect(result.entities.edges[0].resolved).toBe('neckline');
      expect(result.entities.values[0].value).toBeCloseTo(25.4, 1);
    });

    it('returns ambiguous when edge not found', () => {
      const result = resolver.resolve(
        'reduce el xyz 2cm',
        mockPieces as PatternPiece[],
        mockClassifications,
      );

      expect(result.confidence).toBe('ambiguous');
      expect(result.entities.edges).toHaveLength(0);
    });

    it('validates resolved edge exists on piece', () => {
      const piecesWithoutNeckline: Partial<PatternPiece>[] = [{
        id: 'front',
        name: 'Front Bodice',
        edges: [{ id: 'e1', name: 'shoulder', segmentRange: [0, 1], edgeType: 'seam', length: 150 }],
      }];

      const result = resolver.resolve(
        'reduce el escote 2cm',
        piecesWithoutNeckline as PatternPiece[],
        [{ pieceId: 'front', type: 'bodice-front', confidence: 0.95 }],
      );

      expect(result.confidence).toBe('ambiguous');
    });
  });

  describe('parseValue', () => {
    it('parses "2cm" to 20mm', () => {
      const values = resolver['parseValues']('reduce 2cm');
      expect(values[0]).toEqual({ raw: '2cm', value: 20, unit: 'cm', operation: 'reduce' });
    });

    it('parses "20mm" to 20mm', () => {
      const values = resolver['parseValues']('reduce 20mm');
      expect(values[0]).toEqual({ raw: '20mm', value: 20, unit: 'mm', operation: 'reduce' });
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
