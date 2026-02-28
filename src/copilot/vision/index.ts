/**
 * Vision Module — Copilot intelligence layer.
 *
 * @module copilot/vision
 */

// Types
export type {
  // Perception - Segments
  SegmentType,
  LandmarkLabel,
  SemanticLandmark,
  GeometricFingerprint,
  // Perception - Spatial
  SpatialRelationType,
  SpatialRelationship,
  ConflictSeverity,
  ConflictType,
  SpatialConflict,
  // Perception - Template Matching
  ArchetypeMatch,
  PieceSemantics,
  // Memory
  DesignLogEntryType,
  DesignLogEntry,
  SkillOverride,
  DesignLog,
  // Action
  AuditRuleType,
  AuditResult,
  IntentPrediction,
  // Context
  CerebralContext,
} from './types';

// Geometry Classifier
export {
  classifySegment,
  extractSegments,
  calculateRatios,
  calculateCurvatureDensity,
  detectLandmarks,
  generateFingerprint,
} from './geometryClassifier';

export type { SegmentInfo } from './geometryClassifier';

// Spatial Describer
export {
  distance3D,
  computeBoundingBox3D,
  boundingBoxesOverlap,
  findMinimumDistance,
  extractPieceInfo,
  analyzePieceRelationship,
  describeSpatialRelationships,
} from './spatialDescriber';

export type {
  Point3D,
  BoundingBox3D,
  MinDistanceResult,
  PieceSpatialInfo,
  SpatialPiece,
  SpatialSeam,
  SpatialDescriptionInput,
  SpatialDescriptionResult,
} from './spatialDescriber';
