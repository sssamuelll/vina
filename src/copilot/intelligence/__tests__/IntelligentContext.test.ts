import { describe, it, expect } from 'vitest';
import { IntelligentContext } from '../IntelligentContext';
import type { PatternPiece, BodyMeasurements } from '../../../types/types';

// Minimal state interface matching IntelligentContext constructor
interface MockState {
  project: {
    pieces: Partial<PatternPiece>[];
    avatar: {
      measurements: BodyMeasurements;
    };
  };
}

describe('IntelligentContext', () => {
  const mockState: MockState = {
    project: {
      pieces: [
        {
          id: 'front',
          name: 'Front Bodice',
          category: 'bodice',
          side: 'front',
          edges: [
            { id: 'e1', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 125 },
            { id: 'e2', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 150 },
            { id: 'e3', name: 'armhole', segmentRange: [2, 3], edgeType: 'seam', length: 220 },
          ],
        },
        {
          id: 'back',
          name: 'Back Bodice',
          category: 'bodice',
          side: 'back',
          edges: [
            { id: 'e4', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 120 },
            { id: 'e5', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 150 },
          ],
        },
      ],
      avatar: {
        measurements: {
          height: 170,
          chest: 92,
          waist: 76,
          hips: 98,
          shoulder: 42,
          armLength: 60,
          inseam: 80,
          neckCirc: 38,
        },
      },
    },
  };

  // Cast to the expected type for IntelligentContext
  const createIntelligence = () =>
    new IntelligentContext(mockState as { project: { pieces: PatternPiece[]; avatar: { measurements: BodyMeasurements } } });

  describe('process', () => {
    it('processes "reduce el escote 2cm" to enriched context', () => {
      const intelligence = createIntelligence();
      const result = intelligence.process('reduce el escote 2cm');

      expect(result.resolvedIntent).toContain('neckline');
      expect(result.targets).toHaveLength(2);
      expect(result.targets[0].edge).toBe('neckline');
      expect(result.calculation).toBeDefined();
      expect(result.calculation!.delta).toBe(-20);
    });

    it('includes all available edges per piece', () => {
      const intelligence = createIntelligence();
      const result = intelligence.process('reduce el escote 2cm');

      expect(result.availableEdgesPerPiece['front']).toContain('neckline');
      expect(result.availableEdgesPerPiece['front']).toContain('shoulder');
    });

    it('handles unknown terms gracefully', () => {
      const intelligence = createIntelligence();
      const result = intelligence.process('reduce el xyz 2cm');

      expect(result.targets).toHaveLength(0);
      expect(result.resolvedIntent).toBe('Unknown operation');
    });
  });

  describe('getSerialized', () => {
    it('returns serialized context string', () => {
      const intelligence = createIntelligence();
      const result = intelligence.process('reduce el escote 2cm');
      const serialized = intelligence.getSerialized(result);

      expect(serialized).toContain('neckline');
      expect(serialized).toContain('front');
      expect(serialized).toContain('IMPORTANT');
    });
  });
});
