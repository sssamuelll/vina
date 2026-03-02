import { describe, it, expect } from 'vitest';
import { ContextEnricher } from '../ContextEnricher';
import type { Resolution, MeasurementContext, PieceClassification } from '../types';
import type { PatternPiece } from '../../../types/types';

describe('ContextEnricher', () => {
  const enricher = new ContextEnricher();

  // Mock pieces with edges - using Partial<PatternPiece> for minimal required fields
  const mockPieces: Partial<PatternPiece>[] = [
    {
      id: 'front',
      name: 'Front Bodice',
      edges: [
        { id: 'e1', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 125 },
        { id: 'e2', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 150 },
        { id: 'e3', name: 'armhole', segmentRange: [2, 3], edgeType: 'seam', length: 220 },
      ],
    },
    {
      id: 'back',
      name: 'Back Bodice',
      edges: [
        { id: 'e4', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 120 },
        { id: 'e5', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 150 },
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
      values: [{ raw: '2cm', value: 20, unit: 'mm', operation: 'reduce' }],
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
        mockPieces as PatternPiece[],
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
        mockPieces as PatternPiece[],
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
        mockPieces as PatternPiece[],
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
        mockPieces as PatternPiece[],
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
        mockPieces as PatternPiece[],
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
