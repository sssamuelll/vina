import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, getDefaultRegistry, resetDefaultRegistry } from '../action/tools/registry';

describe('Compound Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    resetDefaultRegistry();
    registry = getDefaultRegistry();
  });

  describe('transformPiece', () => {
    it('should be registered', () => {
      expect(registry.has('transformPiece')).toBe(true);
    });

    it('should have required parameters', () => {
      const tool = registry.get('transformPiece')!;
      expect(tool.parameters.required).toContain('pieceId');
      expect(tool.parameters.required).toContain('transformation');
    });

    it('should validate valid transformation enum', () => {
      const result = registry.validate('transformPiece', {
        pieceId: 'piece-1',
        transformation: 'straight-to-aline',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid transformation', () => {
      const result = registry.validate('transformPiece', {
        pieceId: 'piece-1',
        transformation: 'invalid-transform',
      });
      expect(result.valid).toBe(false);
    });

    it('should accept optional amount parameter', () => {
      const result = registry.validate('transformPiece', {
        pieceId: 'piece-1',
        transformation: 'lengthen',
        amount: 50,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Total tools count', () => {
    it('should have correct number of tools registered', () => {
      // + 1 mirrorNotch (2026-06-09) + 1 reverseSeam (Fase 5, 2026-06-11) − 2 blueprint tools un-registered (#847, 2026-06-17)
      // + 2 contrato de colocación: place_piece + list_anchor_points (consejo 2026-07-03)
      expect(registry.size).toBe(232);
    });
  });
});
