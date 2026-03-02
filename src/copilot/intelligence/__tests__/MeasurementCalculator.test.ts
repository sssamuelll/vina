import { describe, it, expect } from 'vitest';
import { MeasurementCalculator } from '../MeasurementCalculator';
import type { Resolution, MeasurementContext } from '../types';

describe('MeasurementCalculator', () => {
  const calculator = new MeasurementCalculator();

  const mockContext: MeasurementContext = {
    bodyMeasurements: {
      neckCirc: 38,
      chest: 92,
      waist: 76,
      shoulder: 42,
    },
    edgeLengths: {
      'front': {
        'neckline': 125,
        'shoulder': 150,
      },
      'back': {
        'neckline': 120,
        'shoulder': 150,
      },
    },
  };

  describe('calculate', () => {
    it('calculates delta for edge reduction', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [{ userTerm: 'escote', resolved: 'neckline', pieceIds: ['front'], confidence: 1 }],
          pieces: [],
          values: [{ raw: '2cm', value: 20, unit: 'mm', operation: 'reduce' }],
        },
        confidence: 'certain',
      };

      const result = calculator.calculate(resolution, mockContext, 'bodice-front');

      expect(result).toBeDefined();
      expect(result!.delta).toBe(-20);
      expect(result!.currentValue).toBe(125);
      expect(result!.targetValue).toBe(105);
      expect(result!.unit).toBe('mm');
    });

    it('calculates delta for edge increase', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [{ userTerm: 'hombro', resolved: 'shoulder', pieceIds: ['front'], confidence: 1 }],
          pieces: [],
          values: [{ raw: '5mm', value: 5, unit: 'mm', operation: 'increase' }],
        },
        confidence: 'certain',
      };

      const result = calculator.calculate(resolution, mockContext, 'bodice-front', 'aumenta el hombro 5mm');

      expect(result!.delta).toBe(5);
      expect(result!.currentValue).toBe(150);
      expect(result!.targetValue).toBe(155);
    });

    it('includes related body measurement', () => {
      const resolution: Resolution = {
        intent: 'modify_edge',
        entities: {
          edges: [{ userTerm: 'escote', resolved: 'neckline', pieceIds: ['front'], confidence: 1 }],
          pieces: [],
          values: [{ raw: '2cm', value: 20, unit: 'mm', operation: 'reduce' }],
        },
        confidence: 'certain',
      };

      const result = calculator.calculate(resolution, mockContext, 'bodice-front');

      expect(result!.relatedMeasurement).toBeDefined();
      expect(result!.relatedMeasurement!.name).toBe('neckCirc');
      expect(result!.relatedMeasurement!.value).toBe(38);
    });

    it('returns null when no edge or value in resolution', () => {
      const emptyResolution: Resolution = {
        intent: 'query',
        entities: { edges: [], pieces: [], values: [] },
        confidence: 'certain',
      };

      const result = calculator.calculate(emptyResolution, mockContext, 'bodice-front');
      expect(result).toBeNull();
    });
  });

  describe('detectDirection', () => {
    it('detects reduction from request', () => {
      expect(calculator['detectDirection']('reduce el escote')).toBe('reduce');
      expect(calculator['detectDirection']('reducir la sisa')).toBe('reduce');
      expect(calculator['detectDirection']('disminuir hombro')).toBe('reduce');
      expect(calculator['detectDirection']('shrink the neckline')).toBe('reduce');
    });

    it('detects increase from request', () => {
      expect(calculator['detectDirection']('aumenta el escote')).toBe('increase');
      expect(calculator['detectDirection']('incrementa la sisa')).toBe('increase');
      expect(calculator['detectDirection']('widen the hemline')).toBe('increase');
      expect(calculator['detectDirection']('expand shoulder')).toBe('increase');
    });

    it('defaults to reduce for ambiguous requests', () => {
      expect(calculator['detectDirection']('modifica el escote')).toBe('reduce');
    });
  });
});
