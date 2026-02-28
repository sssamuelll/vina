import { describe, it, expect } from 'vitest';
import type {
  SegmentType,
  SemanticLandmark,
  GeometricFingerprint,
  SpatialRelationship,
  SpatialConflict,
  DesignLogEntry,
  SkillOverride,
  DesignLog,
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

describe('Vision Types - Memory Layer', () => {
  it('should define DesignLogEntry correctly', () => {
    const entry: DesignLogEntry = {
      id: 'log-001',
      timestamp: Date.now(),
      type: 'decision',
      summary: 'Increased armhole depth by 2cm for mobility',
      relatedPieceIds: ['p-front', 'p-back'],
      metadata: { reasoning: 'User requested athletic fit' },
    };
    expect(entry.type).toBe('decision');
    expect(entry.relatedPieceIds).toContain('p-front');
  });

  it('should define SkillOverride correctly', () => {
    const override: SkillOverride = {
      id: 'override-001',
      skillId: 'core:bodice',
      formulaName: 'armhole_depth',
      originalValue: 'bust_arc / 5 + 2',
      overrideValue: 'bust_arc / 5 + 4',
      reason: 'User prefers deeper armholes',
      createdAt: Date.now(),
    };
    expect(override.formulaName).toBe('armhole_depth');
    expect(override.overrideValue).toContain('+ 4');
  });

  it('should define DesignLog correctly', () => {
    const log: DesignLog = {
      projectId: 'proj-123',
      entries: [],
      overrides: [],
      lastFlushAt: Date.now(),
    };
    expect(log.projectId).toBe('proj-123');
  });
});
