import { describe, it, expect } from 'vitest';
import type {
  SegmentType,
  SemanticLandmark,
  GeometricFingerprint,
} from '../types';

describe('Vision Types - Perception Layer', () => {
  it('should define SegmentType correctly', () => {
    const types: SegmentType[] = ['straight', 'convex', 'concave'];
    expect(types).toHaveLength(3);
  });

  it('should define SemanticLandmark correctly', () => {
    const landmark: SemanticLandmark = {
      edgeIndex: 2,
      label: 'neckline',
      confidence: 0.92,
      curvatureType: 'concave',
    };
    expect(landmark.label).toBe('neckline');
    expect(landmark.confidence).toBeGreaterThan(0);
  });

  it('should define GeometricFingerprint correctly', () => {
    const fingerprint: GeometricFingerprint = {
      pieceId: 'p-123',
      segmentTypes: ['straight', 'concave', 'straight', 'convex'],
      ratios: { shoulderToSide: 0.35, neckToHem: 0.12 },
      curvatureDensity: 0.25,
      landmarks: [],
    };
    expect(fingerprint.segmentTypes).toHaveLength(4);
    expect(fingerprint.curvatureDensity).toBeLessThan(1);
  });
});
