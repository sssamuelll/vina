import { describe, it, expect } from 'vitest';
import type {
  SegmentType,
  SemanticLandmark,
  GeometricFingerprint,
  SpatialRelationship,
  SpatialConflict,
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

describe('Vision Types - Spatial Relationships', () => {
  it('should define SpatialRelationship correctly', () => {
    const relation: SpatialRelationship = {
      pieceAId: 'p-1',
      pieceBId: 'p-2',
      type: 'adjacent',
      distance3D: 5.2,
      edgeAIndex: 2,
      edgeBIndex: 0,
      hasSewingConnection: true,
    };
    expect(relation.type).toBe('adjacent');
    expect(relation.hasSewingConnection).toBe(true);
  });

  it('should define SpatialConflict correctly', () => {
    const conflict: SpatialConflict = {
      type: 'collision',
      severity: 'high',
      affectedPieceIds: ['p-1', 'p-2'],
      description: 'Left sleeve intersects avatar arm by 12mm',
    };
    expect(conflict.severity).toBe('high');
    expect(conflict.affectedPieceIds).toContain('p-1');
  });
});
