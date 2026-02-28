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
  AuditResult,
  IntentPrediction,
  ArchetypeMatch,
  PieceSemantics,
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

describe('Vision Types - Action Layer', () => {
  it('should define AuditResult correctly', () => {
    const result: AuditResult = {
      rule: 'self_intersection',
      passed: false,
      message: 'Proposed change would create self-intersecting outline',
    };
    expect(result.passed).toBe(false);
    expect(result.rule).toBe('self_intersection');
  });

  it('should define IntentPrediction correctly', () => {
    const prediction: IntentPrediction = {
      toolName: 'modifyDimension',
      originalPieceId: 'p-front',
      predictedChanges: { width: 42, height: 58 },
      isSafe: false,
      auditResults: [
        { rule: 'area_integrity', passed: true },
        { rule: 'self_intersection', passed: false, message: 'Self-intersection detected' },
      ],
      suggestedFix: 'Try a smaller increment (10mm instead of 50mm)',
    };
    expect(prediction.isSafe).toBe(false);
    expect(prediction.auditResults).toHaveLength(2);
    expect(prediction.suggestedFix).toBeDefined();
  });
});

describe('Vision Types - Template Matching', () => {
  it('should define ArchetypeMatch correctly', () => {
    const match: ArchetypeMatch = {
      archetypeId: 'bodice_front',
      archetypeName: 'Standard Front Bodice',
      similarity: 0.85,
      matchedLandmarks: ['neckline', 'armhole', 'side_seam'],
    };
    expect(match.similarity).toBeGreaterThan(0.8);
    expect(match.matchedLandmarks).toContain('armhole');
  });

  it('should define PieceSemantics correctly', () => {
    const semantics: PieceSemantics = {
      pieceId: 'p-123',
      fingerprint: {
        pieceId: 'p-123',
        segmentTypes: ['straight', 'concave'],
        ratios: {},
        curvatureDensity: 0.3,
        landmarks: [],
      },
      bestMatch: {
        archetypeId: 'bodice_front',
        archetypeName: 'Front Bodice',
        similarity: 0.9,
        matchedLandmarks: [],
      },
      avatarProximity: 'Spine2',
    };
    expect(semantics.bestMatch?.similarity).toBe(0.9);
    expect(semantics.avatarProximity).toBe('Spine2');
  });
});

import type { CerebralContext } from '../types';

describe('Vision Types - Context Integration', () => {
  it('should define CerebralContext correctly', () => {
    const context: CerebralContext = {
      pieceSemantics: [],
      spatialRelationships: [],
      conflicts: [],
      recentDecisions: [],
      activeOverrides: [],
    };
    expect(context.pieceSemantics).toHaveLength(0);
    expect(context.conflicts).toHaveLength(0);
  });
});
