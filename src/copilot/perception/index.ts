/**
 * Vision Module — Copilot intelligence layer.
 *
 * @module copilot/perception
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

// Design Log
export {
  DesignLogManager,
  designLogToMarkdown,
  extractDecisionsFromMessage,
  formatTimestamp,
  generateEntryId,
  extractSummary,
  TOKEN_FLUSH_THRESHOLD,
  DESIGN_LOG_STORAGE_KEY,
  DECISION_KEYWORDS,
  CONSTRAINT_KEYWORDS,
  WARNING_KEYWORDS,
} from './designLog';

// Preference Learner
export {
  PreferenceLearner,
  detectFormulaDelta,
  detectMultipleDeltas,
  createSkillOverride,
  generateOverrideId,
  formatOverridesForPrompt,
  DEFAULT_TOLERANCE_MM,
} from './preferenceLearner';

export type {
  FormulaComparisonInput,
  FormulaDelta,
  OverrideCreationInput,
  FormulaWithValues,
  PieceFormulaComparison,
  FormulaDeltaWithExpression,
} from './preferenceLearner';

// Intent Predictor
export {
  checkAreaIntegrity,
  checkSelfIntersection,
  checkSeamCompatibility,
  simulateChange,
  formatAuditResultsForLLM,
  predictIntent,
  DEFAULT_MIN_AREA_MM2,
  DEFAULT_SEAM_TOLERANCE_MM,
  MAX_EASING_PERCENT,
} from './intentPredictor';

export type {
  AreaAuditResult,
  AreaCheckInput,
  SelfIntersectionAuditResult,
  SelfIntersectionCheckInput,
  SeamCompatibilityAuditResult,
  SeamCompatibilityInput,
  SimulationInput,
  SimulationResult,
  IntentInput,
} from './intentPredictor';
