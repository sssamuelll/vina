import { describe, it, expect } from 'vitest';
import type {
  MetaToolDefinition,
  MetaToolResult,
  GarmentPieceSummary,
  GarmentStateResult,
  EdgeInfo,
  PieceDetailsResult,
  EdgeMeasurementResult,
  PieceSearchResult,
} from '../types';

describe('Meta-Tool Types', () => {
  describe('MetaToolDefinition', () => {
    it('has name, description, parameters, and execute', () => {
      const tool: MetaToolDefinition = {
        name: 'getGarmentState',
        description: 'Returns the current garment state',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: async () => ({ success: true }),
      };
      expect(tool.name).toBe('getGarmentState');
      expect(tool.description).toBe('Returns the current garment state');
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.execute).toBe('function');
    });

    it('execute returns a Promise<MetaToolResult>', async () => {
      const tool: MetaToolDefinition = {
        name: 'test',
        description: 'test tool',
        parameters: { type: 'object', properties: {} },
        execute: async () => ({
          success: true,
          data: { pieceCount: 3 },
        }),
      };
      const result = await tool.execute({}, () => ({}) as never);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ pieceCount: 3 });
    });
  });

  describe('MetaToolResult', () => {
    it('represents success with data', () => {
      const result: MetaToolResult = {
        success: true,
        data: { key: 'value' },
      };
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('represents failure with error', () => {
      const result: MetaToolResult = {
        success: false,
        error: 'Piece not found',
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Piece not found');
    });
  });

  describe('GarmentStateResult', () => {
    it('contains pieces array with edge names', () => {
      const piece: GarmentPieceSummary = {
        id: 'front-1',
        name: 'Front Bodice',
        category: 'bodice',
        side: 'front',
        edges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline'],
        area: 1250.5,
        perimeter: 1420.0,
      };
      const state: GarmentStateResult = {
        pieces: [piece],
        seams: [{ id: 'seam-1', pieceAId: 'front-1', pieceBId: 'back-1' }],
        pieceCount: 1,
      };
      expect(state.pieces).toHaveLength(1);
      expect(state.pieces[0].edges).toContain('neckline');
      expect(state.pieces[0].edges).toContain('shoulder');
      expect(state.pieces[0].area).toBe(1250.5);
      expect(state.seams[0].pieceAId).toBe('front-1');
      expect(state.pieceCount).toBe(1);
    });

    it('allows optional category and side on pieces', () => {
      const piece: GarmentPieceSummary = {
        id: 'unknown-1',
        name: 'Custom Piece',
        edges: ['edge-a', 'edge-b'],
        area: 500,
        perimeter: 300,
      };
      expect(piece.category).toBeUndefined();
      expect(piece.side).toBeUndefined();
    });
  });

  describe('PieceDetailsResult', () => {
    it('contains edge info with length', () => {
      const edgeInfo: EdgeInfo = {
        name: 'neckline',
        length: 125.3,
        edgeType: 'curve',
      };
      const details: PieceDetailsResult = {
        id: 'front-1',
        name: 'Front Bodice',
        edges: [edgeInfo, { name: 'shoulder', length: 140.0, edgeType: 'straight' }],
        darts: [{ id: 'dart-1', position: 'bust' }],
        dimensions: { width: 320, height: 450 },
        category: 'bodice',
        side: 'front',
      };
      expect(details.edges).toHaveLength(2);
      expect(details.edges[0].name).toBe('neckline');
      expect(details.edges[0].length).toBe(125.3);
      expect(details.edges[0].edgeType).toBe('curve');
      expect(details.darts).toHaveLength(1);
      expect(details.dimensions.width).toBe(320);
    });

    it('allows optional category and side', () => {
      const details: PieceDetailsResult = {
        id: 'piece-x',
        name: 'Unnamed',
        edges: [],
        darts: [],
        dimensions: { width: 100, height: 200 },
      };
      expect(details.category).toBeUndefined();
      expect(details.side).toBeUndefined();
    });
  });

  describe('EdgeMeasurementResult', () => {
    it('contains length and unit', () => {
      const measurement: EdgeMeasurementResult = {
        pieceId: 'front-1',
        edgeName: 'neckline',
        length: 125.3,
        unit: 'mm',
      };
      expect(measurement.pieceId).toBe('front-1');
      expect(measurement.edgeName).toBe('neckline');
      expect(measurement.length).toBe(125.3);
      expect(measurement.unit).toBe('mm');
    });
  });

  describe('PieceSearchResult', () => {
    it('contains matches with scores', () => {
      const search: PieceSearchResult = {
        matches: [
          {
            pieceId: 'front-1',
            pieceName: 'Front Bodice',
            score: 0.95,
            reason: 'Name matches "front bodice"',
          },
          {
            pieceId: 'back-1',
            pieceName: 'Back Bodice',
            score: 0.45,
            reason: 'Partial match on "bodice"',
          },
        ],
      };
      expect(search.matches).toHaveLength(2);
      expect(search.matches[0].score).toBe(0.95);
      expect(search.matches[0].reason).toContain('front bodice');
      expect(search.matches[1].score).toBeLessThan(search.matches[0].score);
    });

    it('can have empty matches', () => {
      const search: PieceSearchResult = {
        matches: [],
      };
      expect(search.matches).toHaveLength(0);
    });
  });
});
