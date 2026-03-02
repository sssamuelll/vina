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

  describe('geometry-based edge detection', () => {
    it('detects edges from geometry when piece.edges is empty', () => {
      // Piece with outline geometry but no pre-populated edges
      // This bodice-front-like shape should detect neckline, armhole, hemline, etc.
      const stateWithGeometry: MockState = {
        project: {
          pieces: [
            {
              id: 'front-bodice',
              name: 'Front Bodice',  // Name hints at bodice-front
              outline: [
                { type: 'M', values: [0, 0] },           // Start at top-left
                { type: 'C', values: [50, -20, 100, -20, 150, 0] },  // Neckline curve (concave at top)
                { type: 'L', values: [200, 50] },       // Shoulder (top-right)
                { type: 'C', values: [220, 100, 220, 150, 200, 200] }, // Armhole curve
                { type: 'L', values: [200, 400] },      // Side seam (right side)
                { type: 'L', values: [0, 400] },        // Hemline (bottom)
                { type: 'Z', values: [] },              // Close path
              ],
              edges: undefined,  // Explicitly no edges - will use geometry detection
              position: { x: 0, y: 0 },
              rotation: 0,
              mirrored: false,
              seamAllowance: 10,
              internals: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            } as PatternPiece,
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
            },
          },
        },
      };

      const intelligence = new IntelligentContext(
        stateWithGeometry as { project: { pieces: PatternPiece[]; avatar: { measurements: BodyMeasurements } } }
      );
      const result = intelligence.process('reduce el escote 2cm');

      // Should detect edges from geometry and resolve 'escote' to an edge
      expect(result.availableEdgesPerPiece['front-bodice']).toBeDefined();
      expect(result.availableEdgesPerPiece['front-bodice'].length).toBeGreaterThan(0);
    });
  });
});
