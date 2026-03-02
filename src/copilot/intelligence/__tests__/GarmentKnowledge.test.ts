import { describe, it, expect } from 'vitest';
import {
  GARMENT_KNOWLEDGE,
  getKnowledgeForType,
  findEdgeByUserTerm,
  getRelatedMeasurement,
} from '../GarmentKnowledge';

describe('GarmentKnowledge', () => {
  describe('GARMENT_KNOWLEDGE', () => {
    it('has knowledge for bodice-front', () => {
      const bodiceFront = GARMENT_KNOWLEDGE['bodice-front'];
      expect(bodiceFront).toBeDefined();
      expect(bodiceFront!.expectedEdges).toContain('neckline');
      expect(bodiceFront!.expectedEdges).toContain('shoulder');
      expect(bodiceFront!.expectedEdges).toContain('armhole');
    });

    it('has knowledge for sleeve', () => {
      const sleeve = GARMENT_KNOWLEDGE['sleeve'];
      expect(sleeve).toBeDefined();
      expect(sleeve!.expectedEdges).toContain('sleeveCap');
    });
  });

  describe('getKnowledgeForType', () => {
    it('returns knowledge for known type', () => {
      const k = getKnowledgeForType('bodice-front');
      expect(k).toBeDefined();
      expect(k?.expectedEdges).toContain('neckline');
    });

    it('returns undefined for unknown type', () => {
      const k = getKnowledgeForType('unknown');
      expect(k).toBeUndefined();
    });
  });

  describe('findEdgeByUserTerm', () => {
    it('resolves "escote" to "neckline" for bodice-front', () => {
      const result = findEdgeByUserTerm('escote', 'bodice-front');
      expect(result).toBe('neckline');
    });

    it('resolves "hombro" to "shoulder" for bodice-front', () => {
      const result = findEdgeByUserTerm('hombro', 'bodice-front');
      expect(result).toBe('shoulder');
    });

    it('resolves "sisa" to "armhole" for bodice-front', () => {
      const result = findEdgeByUserTerm('sisa', 'bodice-front');
      expect(result).toBe('armhole');
    });

    it('resolves English terms: "neckline" to "neckline"', () => {
      const result = findEdgeByUserTerm('neckline', 'bodice-front');
      expect(result).toBe('neckline');
    });

    it('is case-insensitive', () => {
      expect(findEdgeByUserTerm('ESCOTE', 'bodice-front')).toBe('neckline');
      expect(findEdgeByUserTerm('Hombro', 'bodice-front')).toBe('shoulder');
    });

    it('returns undefined for unknown term', () => {
      const result = findEdgeByUserTerm('unknown_term', 'bodice-front');
      expect(result).toBeUndefined();
    });

    it('resolves sleeve terms', () => {
      expect(findEdgeByUserTerm('copa', 'sleeve')).toBe('sleeveCap');
      expect(findEdgeByUserTerm('puño', 'sleeve')).toBe('cuffEdge');
    });
  });

  describe('getRelatedMeasurement', () => {
    it('returns neckCirc for neckline on bodice', () => {
      const result = getRelatedMeasurement('neckline', 'bodice-front');
      expect(result).toBe('neckCirc');
    });

    it('returns shoulder for shoulder edge', () => {
      const result = getRelatedMeasurement('shoulder', 'bodice-front');
      expect(result).toBe('shoulder');
    });

    it('returns undefined for unknown edge', () => {
      const result = getRelatedMeasurement('unknown', 'bodice-front');
      expect(result).toBeUndefined();
    });
  });
});
